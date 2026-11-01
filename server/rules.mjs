/** Server-owned commercial and access rules. Never import this module into the client. */
export const PLANS = Object.freeze({
  monthly: Object.freeze({ amount: 2990, interval: 'month' }),
  annual: Object.freeze({ amount: 19700, interval: 'year' }),
});

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function hasAccess(subscription, now = Date.now()) {
  return Boolean(subscription && subscription.status === 'active' &&
    Object.hasOwn(PLANS, subscription.plan ?? '') &&
    Date.parse(subscription.current_period_end) > now);
}

export function parsePlan(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).length !== 1 || !Object.hasOwn(PLANS, body.plan ?? '')) {
    throw new HttpError(400, 'INVALID_PLAN', 'Escolha o plano mensal ou anual.');
  }
  return body.plan;
}

export function validatePrice(price, plan, priceIds, { requireActive = true } = {}) {
  const expected = PLANS[plan];
  if (!expected || !price || price.id !== priceIds[plan] ||
      (requireActive && price.active !== true) || price.type !== 'recurring' ||
      price.currency !== 'brl' || price.unit_amount !== expected.amount ||
      price.billing_scheme !== 'per_unit' || price.transform_quantity ||
      price.recurring?.interval !== expected.interval || price.recurring?.interval_count !== 1 ||
      (price.recurring?.usage_type && price.recurring.usage_type !== 'licensed')) {
    throw new HttpError(503, 'PRICE_CONFIGURATION', 'O pagamento está temporariamente indisponível. Tente novamente mais tarde.');
  }
  return true;
}

function subscriptionState(subscription, priceIds) {
  const item = subscription.items?.data?.[0];
  const plan = Object.keys(PLANS).find((key) => priceIds[key] === item?.price?.id) ?? null;
  const end = item?.current_period_end;
  let valid = subscription.items?.data?.length === 1 && !subscription.items?.has_more &&
    item.quantity === 1 && Number.isSafeInteger(end) && end > 0;
  try { validatePrice(item?.price, plan, priceIds, { requireActive: false }); }
  catch { valid = false; }
  return {
    stripe_subscription_id: subscription.id,
    status: valid ? (subscription.pause_collection ? 'paused' : subscription.status) : 'invalid_price',
    plan,
    current_period_end: valid ? new Date(end * 1000).toISOString() : null,
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
  };
}

export function selectSubscription(subscriptions, priceIds, now = Date.now()) {
  // Read CURRENT Stripe objects after obtaining the per-account lock. Event payloads
  // are only notifications, never the source of an entitlement snapshot.
  const candidates = subscriptions
    .filter((sub) => sub.items?.data?.some((item) => Object.values(priceIds).includes(item.price?.id)))
    .map((sub) => ({ ...subscriptionState(sub, priceIds), created: sub.created ?? 0 }));
  const blocking = new Set(['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete', 'invalid_price']);
  candidates.sort((a, b) => Number(hasAccess(b, now)) - Number(hasAccess(a, now)) ||
    Number(blocking.has(b.status)) - Number(blocking.has(a.status)) || b.created - a.created);
  const selected = candidates[0];
  if (!selected) return { stripe_subscription_id: null, status: 'none', plan: null, current_period_end: null, cancel_at_period_end: false };
  const { created, ...snapshot } = selected;
  return snapshot;
}

export function blocksNewSubscription(subscription) {
  return Boolean(subscription?.stripe_subscription_id &&
    !['none', 'canceled', 'incomplete_expired'].includes(subscription.status));
}

export function mediaLifetime(subscription, now = Date.now()) {
  const seconds = Math.floor((Date.parse(subscription?.current_period_end) - now) / 1000);
  if (!hasAccess(subscription, now) || seconds < 1) {
    throw new HttpError(403, 'SUBSCRIPTION_REQUIRED', 'Uma assinatura ativa é necessária para abrir esta história.');
  }
  return Math.min(900, seconds);
}

export function safeAssetPath(path) {
  if (typeof path !== 'string' || path.length > 240 ||
      !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.(?:webp|png|jpe?g|mp3)$/i.test(path)) {
    throw new HttpError(500, 'INVALID_ASSET', 'Não foi possível carregar a mídia desta história.');
  }
  return path;
}
