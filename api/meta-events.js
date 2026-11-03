import { isIP } from 'node:net';
import { readJson, route } from '../server/http.mjs';
import { HttpError } from '../server/rules.mjs';

const events = new Set(['PageView', 'ViewContent', 'InitiateCheckout']);
const pages = new Set(['/', '/planos']);
const plans = new Set(['monthly', 'annual']);

export default route('POST', async (req) => {
  const origin = req.headers.origin;
  if (origin !== 'https://' + req.headers.host) {
    throw new HttpError(403, 'ORIGIN_DENIED', 'Origem inválida.');
  }
  const { name, id, path, plan } = (await readJson(req)) ?? {};
  if (!events.has(name) || !pages.has(path) ||
      typeof id !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id) ||
      (name === 'InitiateCheckout' ? !plans.has(plan) : plan !== undefined)) {
    throw new HttpError(400, 'INVALID_EVENT', 'Evento inválido.');
  }

  const token = process.env.META_CAPI_ACCESS_TOKEN;
  if (!token) throw new HttpError(503, 'META_UNCONFIGURED', 'Medição indisponível.');
  const user = { client_user_agent: req.headers['user-agent'] };
  const ip = req.headers['x-vercel-forwarded-for']?.split(',')[0].trim() ||
    req.headers['x-forwarded-for']?.split(',')[0].trim();
  if (ip && isIP(ip)) user.client_ip_address = ip;
  for (const cookie of (req.headers.cookie || '').split(';')) {
    const match = /^_(fbp|fbc)=(fb\.\d+\.\d+\.[A-Za-z0-9._-]{1,500})$/.exec(cookie.trim());
    if (match) user[match[1]] = match[2];
  }
  const event = {
    event_name: name, event_id: id, event_time: Math.floor(Date.now() / 1000),
    action_source: 'website', event_source_url: origin + path, user_data: user,
  };
  if (plan) event.custom_data = { content_ids: [plan] };
  const response = await fetch('https://graph.facebook.com/v24.0/1816678829421239/events', {
    method: 'POST', signal: AbortSignal.timeout(8000),
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: [event] }),
  });
  const result = await response.json();
  if (!response.ok || result.events_received !== 1) {
    console.warn('meta_event_rejected', { status: response.status, code: result.error?.code });
    throw new HttpError(502, 'META_REJECTED', 'Evento não recebido.');
  }
  return { received: true };
});
