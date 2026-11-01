import { HttpError } from './rules.mjs';

function checked(result) {
  if (result.error) throw result.error;
  return result.data;
}

export function createRepository(client) {
  const rpc = async (name, parameters) => checked(await client.rpc(name, parameters));
  return {
    async findVerifiedUserByEmail(email) {
      // SQL SECURITY DEFINER function is service-role-only; avoids scanning Auth users in JS.
      return rpc('find_verified_billing_user', { p_email: email });
    },
    applyPerfectPayEvent(userId,event) {
      return rpc('apply_perfectpay_event', {p_user_id:userId,p_sale_code:event.code,p_plan:event.plan,p_kind:event.kind,p_event_at:event.at,p_status:event.status});
    },
    async getSubscription(userId) {
      return checked(await client.from('subscriptions').select('*').eq('user_id', userId).maybeSingle());
    },
    async findByCustomer(customerId) {
      return checked(await client.from('subscriptions').select('user_id,stripe_customer_id').eq('stripe_customer_id', customerId).maybeSingle());
    },
    async getProgress(userId) {
      return checked(await client.from('reading_progress').select('story_id,part,completed,favorite').eq('user_id', userId).order('story_id'));
    },
    async getStory(storyId) {
      const row = checked(await client.from('stories').select('body').eq('id', storyId).maybeSingle());
      return row?.body ?? null;
    },
    async signAssets(paths, lifetime) {
      const rows = checked(await client.storage.from('story-assets').createSignedUrls(paths, lifetime));
      const byPath = new Map(rows.map((row) => [row.path, row]));
      return paths.map((path) => {
        const row = byPath.get(path);
        if (!row?.signedUrl || row.error) throw new HttpError(503, 'MEDIA_UNAVAILABLE', 'A mídia desta história não está disponível. Tente novamente.');
        return row.signedUrl;
      });
    },
    async eventProcessed(eventId) {
      return Boolean(checked(await client.from('stripe_events').select('id').eq('id', eventId).maybeSingle()));
    },
    acquireLock(userId) { return rpc('acquire_billing_lock', { p_user_id: userId }); },
    releaseLock(userId, token) { return rpc('release_billing_lock', { p_user_id: userId, p_token: token }); },
    saveCustomer(userId, token, customerId) {
      return rpc('save_stripe_customer', { p_user_id: userId, p_token: token, p_customer_id: customerId });
    },
    commitSubscription(userId, token, snapshot, event) {
      return rpc('commit_billing_snapshot', {
        p_user_id: userId, p_token: token, p_snapshot: snapshot,
        p_event_id: event?.id ?? null, p_event_type: event?.type ?? null, p_event_created: event?.created ?? null,
      });
    },
    reserveCheckout(userId, token, plan) {
      return rpc('reserve_checkout_request', { p_user_id: userId, p_token: token, p_plan: plan });
    },
    saveCheckout(userId, token, requestId, sessionId) {
      return rpc('save_checkout_session', { p_user_id: userId, p_token: token, p_request_id: requestId, p_session_id: sessionId });
    },
  };
}
