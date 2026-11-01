import { HttpError, blocksNewSubscription, selectSubscription, validatePrice } from './rules.mjs';

const APP = 'pequenos-herois';
const EVENTS = new Set([
  'checkout.session.completed', 'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed', 'checkout.session.expired',
  'invoice.paid', 'invoice.payment_failed', 'invoice.payment_action_required',
  'invoice.voided', 'invoice.marked_uncollectible',
]);

async function underLock(repo, userId, operation) {
  const token = await repo.acquireLock(userId);
  if (!token) throw new HttpError(503, 'BILLING_BUSY', 'Estamos atualizando seu pagamento. Tente novamente em instantes.');
  try { return await operation(token); }
  finally {
    // The lease also expires in the database if a function is terminated mid-request.
    try { await repo.releaseLock(userId, token); }
    catch { console.error('billing_lock_release_failed'); }
  }
}

async function currentSubscription(customerId, { stripe, config, now = Date.now }) {
  const subscriptions = [];
  // Stripe async pagination includes canceled history, so a late deletion notification
  // cannot overwrite a newer subscription. No embedded event object is trusted.
  for await (const sub of stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 })) {
    subscriptions.push(sub);
    if (subscriptions.length > 1000) throw new HttpError(503, 'BILLING_REVIEW', 'Não foi possível atualizar sua assinatura. Tente novamente mais tarde.');
  }
  return selectSubscription(subscriptions, config.prices, now());
}

function checkoutPending() {
  return new HttpError(409, 'CHECKOUT_PENDING', 'O pagamento anterior ainda está sendo confirmado. Aguarde e consulte sua conta antes de tentar novamente.');
}

async function reconcileClosedSession(session, userId, token, deps) {
  if (session.status === 'expired') return;
  if (session.status !== 'complete') throw checkoutPending();
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
  // Complete does not imply settled: payment processing and the subscription can
  // still be pending. Absence from a list is never proof that another checkout is safe.
  if (!subscriptionId) throw checkoutPending();
  const subscription = await deps.stripe.subscriptions.retrieve(subscriptionId);
  if (['canceled', 'incomplete_expired'].includes(subscription.status)) return;
  const snapshot = selectSubscription([subscription], deps.config.prices, (deps.now ?? Date.now)());
  await deps.repo.commitSubscription(userId, token, snapshot);
  throw new HttpError(409, 'SUBSCRIPTION_EXISTS', 'Você já possui uma assinatura. Gerencie seu plano na área da conta.');
}

async function reconcileCheckoutSessions(row, customerId, user, token, plan, priceId, deps) {
  const { stripe, repo, now = Date.now } = deps;
  const sessions = new Map();
  // Include closed sessions: hosted payment completion is outside our database
  // lease, and an open-only query can omit the session that just completed.
  for await (const session of stripe.checkout.sessions.list({ customer: customerId, limit: 100 })) {
    if (session.mode === 'subscription' && session.metadata?.app === APP) sessions.set(session.id, session);
    if (sessions.size > 1000) throw checkoutPending();
  }
  if (row?.checkout_session_id) {
    const stored = await stripe.checkout.sessions.retrieve(row.checkout_session_id);
    if (stored.customer !== customerId || stored.mode !== 'subscription') throw checkoutPending();
    sessions.set(stored.id, stored);
  }
  // Recover a response whose Stripe call succeeded but whose database save failed.
  if (row?.checkout_request_id && !row.checkout_session_id) {
    const recovered = [...sessions.values()].find((session) => session.metadata?.checkout_request_id === row.checkout_request_id);
    if (recovered) {
      await repo.saveCheckout(user.id, token, row.checkout_request_id, recovered.id);
      row.checkout_session_id = recovered.id;
    } else if (row.checkout_plan !== plan || !(Date.parse(row.checkout_requested_at) > now() - 23 * 60 * 60 * 1000)) {
      throw checkoutPending();
    }
  }

  let reusable;
  for (const session of sessions.values()) {
    if (session.status !== 'open') {
      await reconcileClosedSession(session, user.id, token, deps);
    } else if (!reusable && session.metadata?.plan === plan && session.metadata?.price_id === priceId && session.url) {
      reusable = session;
    } else {
      let closed;
      try { closed = await stripe.checkout.sessions.expire(session.id); }
      catch {
        // Expiration can lose a race to payment completion or time out after success.
        // Only a confirmed terminal result allows us to offer another payable URL.
        closed = await stripe.checkout.sessions.retrieve(session.id);
      }
      await reconcileClosedSession(closed, user.id, token, deps);
    }
  }
  if (reusable) {
    const current = await stripe.checkout.sessions.retrieve(reusable.id);
    if (current.status === 'open' && current.url) return { url: current.url };
    await reconcileClosedSession(current, user.id, token, deps);
  }
  return null;
}

export async function processWebhook(event, deps) {
  const { repo } = deps;
  if (!EVENTS.has(event.type) && !event.type?.startsWith('customer.subscription.')) return { received: true, ignored: true };
  const customer = event.data?.object?.customer;
  const customerId = typeof customer === 'string' ? customer : customer?.id;
  if (!customerId) return { received: true, ignored: true };
  const row = await repo.findByCustomer(customerId);
  // Only customers created/mapped by an authenticated checkout belong to this app.
  if (!row) return { received: true, ignored: true };
  if (await repo.eventProcessed(event.id)) return { received: true, duplicate: true };
  return underLock(repo, row.user_id, async (token) => {
    if (await repo.eventProcessed(event.id)) return { received: true, duplicate: true };
    const snapshot = await currentSubscription(customerId, deps);
    await repo.commitSubscription(row.user_id, token, snapshot, event);
    return { received: true };
  });
}

export async function createCheckout(user, plan, deps) {
  const { stripe, repo, config } = deps;
  return underLock(repo, user.id, async (token) => {
    const price = await stripe.prices.retrieve(config.prices[plan]);
    validatePrice(price, plan, config.prices);
    let row = await repo.getSubscription(user.id);
    let customerId = row?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { auth_user_id: user.id, app: APP },
      }, { idempotencyKey: `ph-customer-${user.id}` });
      customerId = customer.id;
      await repo.saveCustomer(user.id, token, customerId);
    }
    const snapshot = await currentSubscription(customerId, deps);
    await repo.commitSubscription(user.id, token, snapshot);
    if (blocksNewSubscription(snapshot)) {
      throw new HttpError(409, 'SUBSCRIPTION_EXISTS', 'Você já possui uma assinatura. Gerencie seu plano na área da conta.');
    }

    const reusable = await reconcileCheckoutSessions(row, customerId, user, token, plan, price.id, deps);
    if (reusable) return reusable;

    // No prior session remains payable. Refresh subscriptions after reconciliation,
    // since a hosted completion could have occurred after the first snapshot.
    const latest = await currentSubscription(customerId, deps);
    await repo.commitSubscription(user.id, token, latest);
    if (blocksNewSubscription(latest)) {
      throw new HttpError(409, 'SUBSCRIPTION_EXISTS', 'Você já possui uma assinatura. Gerencie seu plano na área da conta.');
    }

    const requestId = await repo.reserveCheckout(user.id, token, plan);
    const metadata = { auth_user_id: user.id, app: APP, plan, price_id: price.id, checkout_request_id: requestId };
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      client_reference_id: user.id,
      line_items: [{ price: price.id, quantity: 1 }],
      allow_promotion_codes: false,
      adaptive_pricing: { enabled: false },
      automatic_tax: { enabled: false },
      locale: 'pt-BR',
      metadata,
      subscription_data: { metadata },
      success_url: `${config.appUrl}/conta?pagamento=processando`,
      cancel_url: `${config.appUrl}/planos?cancelado=1`,
    }, { idempotencyKey: `ph-checkout-${requestId}` });
    await repo.saveCheckout(user.id, token, requestId, session.id);
    if (session.status !== 'open') await reconcileClosedSession(session, user.id, token, deps);
    if (!session.url) throw new HttpError(503, 'CHECKOUT_UNAVAILABLE', 'Não foi possível abrir o pagamento. Tente novamente.');
    return { url: session.url };
  });
}
