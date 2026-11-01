import { parseStorySelection } from "../shared/collection.mjs";
import { perfectPayCheckout, perfectPayWebhook } from './perfectpay.mjs';
import { readJson, readRawBody, requireUser, route } from './http.mjs';
import { HttpError, hasAccess, mediaLifetime, parsePlan, safeAssetPath } from './rules.mjs';

export function createHandlers(deps) {
  const { repo, authenticate, now = Date.now } = deps;
  return {
    account: route('GET', async (req) => {
      const user = await requireUser(req, authenticate);
      const [row, progress] = await Promise.all([repo.getSubscription(user.id), repo.getProgress(user.id)]);
      const subscription = row && row.status !== 'none' ? {
        status: row.status, plan: row.plan, current_period_end: row.current_period_end,
        cancel_at_period_end: Boolean(row.cancel_at_period_end),
      } : null;
      return { user: { id: user.id, email: user.email }, subscription, hasAccess: hasAccess(subscription, now()), progress };
    }),
    story: route('GET', async (req) => {
      const user = await requireUser(req, authenticate);
      const idParam = new URL(req.url, 'https://local.invalid').searchParams.get('id');
      if (!parseStorySelection(idParam)) {
        throw new HttpError(400, 'INVALID_STORY', 'Escolha uma história válida.');
      }
      const subscription = await repo.getSubscription(user.id);
      const lifetime = mediaLifetime(subscription, now());
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
      return perfectPayCheckout(user, plan, deps);
    }),
    portal: route('POST', async (req) => {
      const user = await requireUser(req, authenticate);
      const subscription = await repo.getSubscription(user.id);
      if (!subscription || subscription.status === 'none') throw new HttpError(404, 'NO_BILLING_ACCOUNT', 'Você ainda não possui uma assinatura para gerenciar.');
      return { url: 'https://app.perfectpay.com.br/' };
    }),
    webhook: route('POST', async (req) => {
      const rawBody = await readRawBody(req, 64 * 1024);
      let payload;
      try { payload = JSON.parse(rawBody.toString('utf8')); }
      catch { throw new HttpError(400,'INVALID_JSON','JSON inválido.'); }
      return perfectPayWebhook(payload, deps);
    }),
  };
}
