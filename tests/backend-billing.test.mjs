import test from 'node:test';
import assert from 'node:assert/strict';

import * as billing from '../server/billing.mjs';
const config = { prices: { monthly: 'price_monthly', annual: 'price_annual' }, appUrl: 'https://example.test' };
const now = () => Date.parse('2026-10-30T12:00:00Z');
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'parent@example.test' };
const price = { id: 'price_monthly', active: true, type: 'recurring', currency: 'brl', unit_amount: 2990, billing_scheme: 'per_unit', recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' } };
const sub = { id: 'sub_new', status: 'active', customer: 'cus_parent', created: 1793350000, items: { data: [{ quantity: 1, price, current_period_end: 1796040000 }], has_more: false } };

// Only remote boundaries are replaced. Real billing orchestration and rules run.
function fixture({ current = [], status = 'none' } = {}) {
  const state = { row: { user_id: user.id, stripe_customer_id: 'cus_parent', status }, events: new Set(), locked: false, commits: [], fetches: 0, created: [], sessions: new Map(), expired: [], key: null };
  const repo = {
    async getSubscription() { return structuredClone(state.row); },
    async findByCustomer(id) { return id === 'cus_parent' ? structuredClone(state.row) : null; },
    async eventProcessed(id) { return state.events.has(id); },
    async acquireLock() { if (state.locked) return null; state.locked = true; return 'lease'; },
    async releaseLock() { state.locked = false; },
    async saveCustomer(_id, _token, customerId) { state.row.stripe_customer_id = customerId; },
    async commitSubscription(_id, token, snapshot, event) {
      assert.equal(token, 'lease');
      state.row = { ...state.row, ...snapshot };
      state.commits.push(snapshot);
      if (event) state.events.add(event.id);
    },
    async reserveCheckout(_id, _token, plan) { state.key ??= `stable-${plan}`; return state.key; },
    async saveCheckout(_userId, _token, _requestId, sessionId) { state.row.checkout_session_id = sessionId; },
  };
  const stripe = {
    subscriptions: {
      async *list() { assert.equal(state.locked, true, 'Stripe snapshot must be fetched under the DB lease'); state.fetches++; yield* current; },
      async retrieve(id) { const found = current.find((entry) => entry.id === id); if (!found) throw new Error('Unknown subscription'); return structuredClone(found); },
    },
    prices: { async retrieve() { return price; } },
    customers: { async create() { throw new Error('Existing customer must be reused'); } },
    checkout: { sessions: {
      async *list(parameters) { for (const session of state.sessions.values()) if (!parameters.status || parameters.status === session.status) yield structuredClone(session); },
      async retrieve(id) { const session = state.sessions.get(id); if (!session) throw new Error('Unknown session'); return structuredClone(session); },
      async expire(id) { state.expired.push(id); const session = state.sessions.get(id); session.status = 'expired'; session.url = null; return structuredClone(session); },
      async create(payload, options) {
        state.created.push({ payload, options });
        const session = { id: 'cs_one', customer: payload.customer, url: 'https://checkout.stripe.com/session', status: 'open', mode: 'subscription', metadata: payload.metadata };
        state.sessions.set(session.id, session); return structuredClone(session);
      },
    } },
  };
  return { repo, stripe, config, now, state };
}

test('webhook retries are acknowledged once and do not repeat an entitlement mutation', async () => {
  assert.equal(typeof billing.processWebhook, 'function', 'webhook processor is missing');
  const deps = fixture({ current: [sub] });
  const event = { id: 'evt_once', type: 'invoice.paid', created: 10, data: { object: { customer: 'cus_parent' } } };
  await billing.processWebhook(event, deps);
  const again = await billing.processWebhook(event, deps);
  assert.equal(again.duplicate, true);
  assert.equal(deps.state.commits.length, 1);
  assert.equal(deps.state.row.status, 'active');
  assert.equal(deps.state.row.current_period_end, '2026-11-30T12:00:00.000Z');
});

test('delayed or same-second deletion events re-fetch current state instead of revoking a newer subscription', async () => {
  assert.equal(typeof billing.processWebhook, 'function', 'webhook processor is missing');
  const deps = fixture({ current: [{ ...sub, id: 'sub_old', status: 'canceled', created: 1 }, sub] });
  await billing.processWebhook({ id: 'evt_new', type: 'customer.subscription.updated', created: 20, data: { object: sub } }, deps);
  await billing.processWebhook({ id: 'evt_old', type: 'customer.subscription.deleted', created: 10, data: { object: { ...sub, id: 'sub_old', status: 'canceled' } } }, deps);
  await billing.processWebhook({ id: 'evt_same', type: 'customer.subscription.deleted', created: 20, data: { object: { ...sub, id: 'sub_old', status: 'canceled' } } }, deps);
  assert.equal(deps.state.row.stripe_subscription_id, 'sub_new');
  assert.equal(deps.state.row.status, 'active');
  assert.equal(deps.state.fetches, 3);
});

test('a webhook lease conflict asks Stripe to retry and never marks the event processed', async () => {
  assert.equal(typeof billing.processWebhook, 'function', 'webhook processor is missing');
  const deps = fixture({ current: [sub] });
  deps.state.locked = true;
  await assert.rejects(billing.processWebhook({ id: 'evt_busy', type: 'invoice.paid', data: { object: { customer: 'cus_parent' } } }, deps), (error) => error.status === 503);
  assert.equal(deps.state.events.size, 0);
  assert.equal(deps.state.commits.length, 0);
});

test('network failure leaves an event retryable and releases the lease', async () => {
  assert.equal(typeof billing.processWebhook, 'function', 'webhook processor is missing');
  const deps = fixture();
  deps.stripe.subscriptions.list = async function* () { throw new Error('network'); };
  await assert.rejects(billing.processWebhook({ id: 'evt_retry', type: 'invoice.paid', data: { object: { customer: 'cus_parent' } } }, deps));
  assert.equal(deps.state.events.size, 0);
  assert.equal(deps.state.locked, false);
});

test('payment failure revokes access using the current subscription, without trusting the invoice status', async () => {
  const deps = fixture({ current: [{ ...sub, status: 'past_due' }], status: 'active' });
  await billing.processWebhook({ id: 'evt_failure', type: 'invoice.payment_failed', data: { object: { customer: 'cus_parent', status: 'paid' } } }, deps);
  assert.equal(deps.state.row.status, 'past_due');
  assert.equal(deps.state.events.has('evt_failure'), true);
});

test('checkout refuses an active Stripe subscription even if local webhook state is stale', async () => {
  assert.equal(typeof billing.createCheckout, 'function', 'checkout service is missing');
  const deps = fixture({ current: [sub] });
  await assert.rejects(billing.createCheckout(user, 'monthly', deps), (error) => error.status === 409);
  assert.equal(deps.state.created.length, 0);
  assert.equal(deps.state.row.status, 'active');
  assert.equal(deps.state.locked, false);
});

test('previously paid monthly subscribers cannot be charged a second subscription after the price ID changes', async () => {
  const legacyPrice = { ...price, id: 'price_1UWoyACdgeVwNcuus4xyAppm', unit_amount: 2990 };
  const oldSubscription = {
    ...sub, id: 'sub_legacy', items: {
      data: [{ ...sub.items.data[0], price: legacyPrice }], has_more: false,
    },
  };
  const deps = fixture({ current: [oldSubscription] });
  await assert.rejects(billing.createCheckout(user, 'monthly', deps), (error) => error.code === 'SUBSCRIPTION_EXISTS');
  assert.equal(deps.state.created.length, 0);
  assert.equal(deps.state.row.status, 'active');
  assert.equal(deps.state.row.plan, 'monthly');
});

test('checkout reuses one customer, fixed server price, persistent idempotency key and an open session', async () => {
  assert.equal(typeof billing.createCheckout, 'function', 'checkout service is missing');
  const deps = fixture();
  assert.deepEqual(await billing.createCheckout(user, 'monthly', deps), { url: 'https://checkout.stripe.com/session' });
  assert.deepEqual(await billing.createCheckout(user, 'monthly', deps), { url: 'https://checkout.stripe.com/session' });
  assert.equal(deps.state.created.length, 1);
  const { payload, options } = deps.state.created[0];
  assert.deepEqual(payload.line_items, [{ price: 'price_monthly', quantity: 1 }]);
  assert.equal(payload.customer, 'cus_parent');
  assert.equal(payload.mode, 'subscription');
  assert.equal(payload.subscription_data.metadata.auth_user_id, user.id);
  assert.equal(payload.allow_promotion_codes, false);
  assert.equal(payload.adaptive_pricing.enabled, false);
  assert.match(options.idempotencyKey, /stable-monthly/);
});

test('checkout cannot proceed when Stripe returns a cheaper misconfigured price', async () => {
  assert.equal(typeof billing.createCheckout, 'function', 'checkout service is missing');
  const deps = fixture();
  deps.stripe.prices.retrieve = async () => ({ ...price, unit_amount: 1 });
  await assert.rejects(billing.createCheckout(user, 'monthly', deps), (error) => error.code === 'PRICE_CONFIGURATION');
  assert.equal(deps.state.created.length, 0);
});

const priorSession = (extra = {}) => ({
  id: 'cs_previous', customer: 'cus_parent', mode: 'subscription', status: 'open',
  subscription: null, payment_status: 'unpaid', url: 'https://checkout.stripe.com/previous',
  metadata: { app: 'pequenos-herois', plan: 'monthly', price_id: 'price_monthly' }, ...extra,
});

test('F2: stored Checkout completing after the subscription snapshot cannot produce a second payable session', async () => {
  const current = [];
  const deps = fixture({ current });
  deps.state.row.checkout_session_id = 'cs_previous';
  deps.state.sessions.set('cs_previous', priorSession());
  deps.stripe.checkout.sessions.list = async function* ({ status }) {
    // Hosted Checkout completes outside the application's lease, at the exact
    // original bug boundary. Open-only queries no longer contain this session.
    current.push(sub);
    const completed = priorSession({ status: 'complete', subscription: sub.id, payment_status: 'paid', url: null });
    deps.state.sessions.set(completed.id, completed);
    if (!status || status === 'complete') yield completed;
  };
  await assert.rejects(billing.createCheckout(user, 'monthly', deps), (error) => error.status === 409);
  assert.equal(deps.state.created.length, 0);
  assert.equal(deps.state.row.status, 'active');
  assert.equal(deps.state.locked, false);
});

test('F2: completed persisted session with a pending subscription blocks even when list results and webhook lag', async () => {
  const deps = fixture();
  deps.state.row.checkout_session_id = 'cs_previous';
  deps.state.sessions.set('cs_previous', priorSession({ status: 'complete', url: null }));
  deps.stripe.checkout.sessions.list = async function* () { /* Delayed provider listing. */ };
  await assert.rejects(billing.createCheckout(user, 'monthly', deps), (error) => error.code === 'CHECKOUT_PENDING');
  assert.equal(deps.state.created.length, 0);
});

test('F2: a checkout completing during plan-change expiration is reconciled and cannot be replaced', async () => {
  const deps = fixture();
  deps.state.row.checkout_session_id = 'cs_previous';
  deps.state.sessions.set('cs_previous', priorSession({ metadata: { app: 'pequenos-herois', plan: 'annual', price_id: 'price_annual' } }));
  deps.stripe.checkout.sessions.expire = async () => {
    deps.state.sessions.set('cs_previous', priorSession({ status: 'complete', url: null }));
    throw new Error('Session is no longer expireable');
  };
  await assert.rejects(billing.createCheckout(user, 'monthly', deps), (error) => error.code === 'CHECKOUT_PENDING');
  assert.equal(deps.state.created.length, 0);
});

test('F2: confirmed expired session permits replacement, but unknown expiration outcome does not', async () => {
  const deps = fixture();
  deps.state.row.checkout_session_id = 'cs_previous';
  deps.state.sessions.set('cs_previous', priorSession({ metadata: { app: 'pequenos-herois', plan: 'annual', price_id: 'price_annual' } }));
  deps.stripe.checkout.sessions.expire = async () => { throw new Error('network outcome unknown'); };
  await assert.rejects(billing.createCheckout(user, 'monthly', deps));
  assert.equal(deps.state.created.length, 0);
  deps.state.sessions.set('cs_previous', priorSession({ status: 'expired', url: null }));
  assert.deepEqual(await billing.createCheckout(user, 'monthly', deps), { url: 'https://checkout.stripe.com/session' });
  assert.equal(deps.state.created.length, 1);
});

test('F2: completed historical Checkout does not prevent resubscription after its subscription is terminal', async () => {
  const deps = fixture({ current: [{ ...sub, status: 'canceled' }] });
  deps.state.row.checkout_session_id = 'cs_previous';
  deps.state.sessions.set('cs_previous', priorSession({ status: 'complete', subscription: sub.id, payment_status: 'paid', url: null }));
  assert.deepEqual(await billing.createCheckout(user, 'monthly', deps), { url: 'https://checkout.stripe.com/session' });
  assert.equal(deps.state.created.length, 1);
});

test('F2: an unresolved create request cannot be rotated to another plan or beyond idempotency retention', async () => {
  for (const [plan, requestedAt] of [['annual', '2026-10-30T11:00:00Z'], ['monthly', '2026-10-28T11:00:00Z']]) {
    const deps = fixture();
    Object.assign(deps.state.row, { checkout_request_id: 'request_unknown', checkout_session_id: null, checkout_plan: plan, checkout_requested_at: requestedAt });
    await assert.rejects(billing.createCheckout(user, 'monthly', deps), (error) => error.code === 'CHECKOUT_PENDING');
    assert.equal(deps.state.created.length, 0);
  }
});

test('F2: a reusable session completing after listing is not returned as a new payment opportunity', async () => {
  const deps = fixture();
  deps.state.sessions.set('cs_previous', priorSession());
  deps.stripe.checkout.sessions.retrieve = async () => priorSession({ status: 'complete', url: null });
  await assert.rejects(billing.createCheckout(user, 'monthly', deps), (error) => error.code === 'CHECKOUT_PENDING');
  assert.equal(deps.state.created.length, 0);
});

test('F2: request metadata recovers a session whose database save was lost before another plan is offered', async () => {
  const deps = fixture();
  Object.assign(deps.state.row, { checkout_request_id: 'request_unknown', checkout_session_id: null, checkout_plan: 'annual', checkout_requested_at: '2026-10-30T11:00:00Z' });
  deps.state.sessions.set('cs_previous', priorSession({ status: 'complete', url: null, metadata: { app: 'pequenos-herois', checkout_request_id: 'request_unknown' } }));
  await assert.rejects(billing.createCheckout(user, 'monthly', deps), (error) => error.code === 'CHECKOUT_PENDING');
  assert.equal(deps.state.row.checkout_session_id, 'cs_previous');
  assert.equal(deps.state.created.length, 0);
});

test('F2: replaying an unresolved create key reconciles a completed Stripe result instead of forgetting it', async () => {
  const deps = fixture();
  Object.assign(deps.state.row, { checkout_request_id: 'request_unknown', checkout_session_id: null, checkout_plan: 'monthly', checkout_requested_at: '2026-10-30T11:00:00Z' });
  deps.state.key = 'request_unknown';
  deps.stripe.checkout.sessions.create = async (_payload, options) => {
    assert.equal(options.idempotencyKey, 'ph-checkout-request_unknown');
    return priorSession({ status: 'complete', url: null });
  };
  await assert.rejects(billing.createCheckout(user, 'monthly', deps), (error) => error.code === 'CHECKOUT_PENDING');
  assert.equal(deps.state.row.checkout_session_id, 'cs_previous');
});


test('checkout securely carries GA4 client and session identifiers into Stripe subscription metadata', async () => {
  const deps = fixture();
  const analytics = { client_id: '123.456', session_id: '789' };
  await billing.createCheckout(user, 'monthly', deps, analytics);
  const { payload } = deps.state.created[0];
  assert.equal(payload.metadata.ga4_client_id, analytics.client_id);
  assert.equal(payload.subscription_data.metadata.ga4_client_id, analytics.client_id);
  assert.equal(payload.subscription_data.metadata.ga4_session_id, analytics.session_id);
  assert.equal(payload.subscription_data.metadata.plan, 'monthly');
  assert.equal(payload.subscription_data.metadata.auth_user_id, user.id);
  assert.equal(payload.subscription_data.metadata.email, undefined);
  assert.equal(payload.subscription_data.metadata.amount, undefined);
});


test('a reusable checkout created before GA4 gets session metadata without creating a second charge', async () => {
  const deps = fixture();
  const prior = priorSession();
  deps.state.sessions.set(prior.id, prior);
  deps.stripe.checkout.sessions.update = async (id, payload) => {
    assert.equal(id, prior.id);
    assert.equal(payload.metadata.ga4_client_id, '123.456');
    assert.equal(payload.metadata.ga4_session_id, '789');
    const updated = { ...prior, metadata: payload.metadata };
    deps.state.sessions.set(id, updated);
    return structuredClone(updated);
  };
  const result = await billing.createCheckout(user, 'monthly', deps, { client_id: '123.456', session_id: '789' });
  assert.equal(result.url, prior.url);
  assert.equal(deps.state.created.length, 0);
  assert.equal(deps.state.sessions.get(prior.id).metadata.ga4_client_id, '123.456');
});
