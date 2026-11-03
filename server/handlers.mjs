import { parseStorySelection } from "../shared/collection.mjs";
import { createCheckout, processWebhook } from './billing.mjs';
import { readJson, readRawBody, requireUser, route } from './http.mjs';
import { HttpError, hasAccess, hasComplimentaryAccess, mediaLifetime, parsePlan, safeAssetPath } from './rules.mjs';

export function createHandlers(deps) {
  const { repo, authenticate, now = Date.now } = deps;
  const ownerHasAccess = (user) => hasComplimentaryAccess(user, deps.config?.complimentaryEmail);
  return {
    account: route('GET', async (req) => {
      const user = await requireUser(req, authenticate);
      const [row, progress] = await Promise.all([repo.getSubscription(user.id), repo.getProgress(user.id)]);
      const subscription = row && row.status !== 'none' ? {
        status: row.status, plan: row.plan, current_period_end: row.current_period_end,
        cancel_at_period_end: Boolean(row.cancel_at_period_end),
      } : null;
      const complimentaryAccess = ownerHasAccess(user);
      return { user: { id: user.id, email: user.email }, subscription, hasAccess: complimentaryAccess || hasAccess(subscription, now()), complimentaryAccess, progress };
    }),
    story: route('GET', async (req) => {
      const user = await requireUser(req, authenticate);
      const idParam = new URL(req.url, 'https://local.invalid').searchParams.get('id');
      if (!parseStorySelection(idParam)) {
        throw new HttpError(400, 'INVALID_STORY', 'Escolha uma história válida.');
      }
      const subscription = await repo.getSubscription(user.id);
      const lifetime = ownerHasAccess(user) ? 900 : mediaLifetime(subscription, now());
      const body = await repo.getStory(Number(idParam));
      if (!body) throw new HttpError(404, 'STORY_NOT_FOUND', 'Esta história não foi encontrada.');
      const paths = body.parts.map((part) => safeAssetPath(part.image));
      if (body.audio_path) paths.push(safeAssetPath(body.audio_path));
      const signed = await repo.signAssets(paths, lifetime);
      const { audio_path, ...publicBody } = body;
      const audio_url = audio_path ? signed.at(-1) : null;
      const story = { ...publicBody, parts: body.parts.map((part, index) => ({ ...part, image: signed[index] })), audio_url };
      return { story, audio_url };
    }),
    checkout: route('POST', async (req) => {
      const user = await requireUser(req, authenticate);
      const plan = parsePlan(await readJson(req));
      if (ownerHasAccess(user)) throw new HttpError(403, 'COMPLIMENTARY_ACCESS', 'Sua conta já tem acesso completo e não precisa de pagamento.');
      return createCheckout(user, plan, deps);
    }),
    portal: route('POST', async (req) => {
      const user = await requireUser(req, authenticate);
      const subscription = await repo.getSubscription(user.id);
      if (!subscription?.stripe_customer_id) throw new HttpError(404, 'NO_BILLING_ACCOUNT', 'Você ainda não possui uma assinatura para gerenciar.');
      const session = await deps.stripe.billingPortal.sessions.create({
        customer: subscription.stripe_customer_id,
        return_url: `${deps.config.appUrl}/conta`,
      });
      return { url: session.url };
    }),
    webhook: route('POST', async (req) => {
      const signature = req.headers['stripe-signature'];
      if (typeof signature !== 'string') throw new HttpError(400, 'INVALID_SIGNATURE', 'Assinatura de webhook inválida.');
      const rawBody = await readRawBody(req);
      let event;
      try { event = deps.stripe.webhooks.constructEvent(rawBody, signature, deps.config.webhookSecret); }
      catch { throw new HttpError(400, 'INVALID_SIGNATURE', 'Assinatura de webhook inválida.'); }
      return processWebhook(event, deps);
    }),
  };
}
