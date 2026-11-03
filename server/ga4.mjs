// GA4 Measurement Protocol. Called only from verified Stripe invoice.paid webhooks.
// Purchase refers to the FIRST paid invoice, not automatic subscription renewals.
export const GA4_MEASUREMENT_ID = 'G-EXNJ4MGX7V';
const APP = 'pequenos-herois';
const CLIENT_ID = /^\d{1,20}\.\d{1,20}$/;
const SESSION_ID = /^\d{1,20}$/;
const PLANS = {
  monthly: { item_id: 'pequenos_herois', item_name: 'Pequenos Heróis — biblioteca de histórias', item_variant: 'mensal' },
  annual: { item_id: 'pequenos_herois', item_name: 'Pequenos Heróis — biblioteca de histórias', item_variant: 'anual' },
};

function subscriptionId(invoice) {
  const value = invoice.parent?.subscription_details?.subscription ||
    invoice.subscription ||
    invoice.lines?.data?.find((line) => line.parent?.subscription_item_details?.subscription)
      ?.parent?.subscription_item_details?.subscription;
  return typeof value === 'string' ? value : value?.id || null;
}

function safeMetadata(meta, userId) {
  if (!meta || meta.app !== APP || meta.auth_user_id !== userId ||
      !CLIENT_ID.test(meta.ga4_client_id || '') || !PLANS[meta.plan]) return null;
  return meta;
}

export function buildGa4Purchase(invoice, metadata) {
  if (invoice?.billing_reason !== 'subscription_create' ||
      invoice?.status !== 'paid' || !Number.isSafeInteger(invoice.amount_paid) ||
      invoice.amount_paid <= 0 || invoice.currency?.toLowerCase() !== 'brl' ||
      typeof invoice.id !== 'string' || !/^in_[A-Za-z0-9_]+$/.test(invoice.id)) return null;
  if (!CLIENT_ID.test(metadata?.ga4_client_id || '') || !PLANS[metadata?.plan]) return null;
  const plan = PLANS[metadata.plan];
  const amount = invoice.amount_paid / 100;
  const params = {
    transaction_id: invoice.id,
    currency: 'BRL',
    value: amount,
    items: [{ ...plan, item_category: 'assinatura', price: amount, quantity: 1 }],
  };
  if (SESSION_ID.test(metadata.ga4_session_id || '')) {
    params.session_id = Number(metadata.ga4_session_id);
    params.engagement_time_msec = 1;
  }
  return {
    client_id: metadata.ga4_client_id,
    events: [{ name: 'purchase', params }],
  };
}

export async function reportFirstPaidInvoice(event, deps, fetchImpl = fetch) {
  if (event?.type !== 'invoice.paid') return { skipped: 'not_invoice_paid' };
  const invoice = event.data?.object;
  if (invoice?.billing_reason !== 'subscription_create' || invoice?.status !== 'paid' ||
      !Number.isSafeInteger(invoice?.amount_paid) || invoice.amount_paid <= 0) {
    return { skipped: 'not_first_paid_invoice' };
  }
  const secret = deps.config?.ga4ApiSecret;
  if (!secret) return { skipped: 'missing_api_secret' };
  const userId = deps.ga4UserId;
  let meta = safeMetadata(invoice.parent?.subscription_details?.metadata, userId);
  // Stripe's invoice shape varies by API version. Read only Stripe-verified objects.
  if (!meta) {
    const id = subscriptionId(invoice);
    if (id) {
      const subscription = await deps.stripe.subscriptions.retrieve(id);
      if (subscription.customer === invoice.customer ||
          subscription.customer?.id === invoice.customer) {
        meta = safeMetadata(subscription.metadata, userId);
      }
    }
  }
  if (!meta) return { skipped: 'no_attributable_checkout' };
  const payload = buildGa4Purchase(invoice, meta);
  if (!payload) return { skipped: 'invalid_purchase' };
  const endpoint = new URL('https://www.google-analytics.com/mp/collect');
  endpoint.searchParams.set('measurement_id', GA4_MEASUREMENT_ID);
  endpoint.searchParams.set('api_secret', secret);
  const response = await fetchImpl(endpoint.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error('GA4 Measurement Protocol returned HTTP ' + response.status);
  return { sent: true, transaction_id: invoice.id };
}
