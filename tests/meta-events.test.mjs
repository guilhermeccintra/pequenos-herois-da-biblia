import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/meta-events.js';

const headers = { origin: 'https://example.com', host: 'example.com', 'content-type': 'application/json',
  'user-agent': 'test-browser', 'x-vercel-forwarded-for': '192.0.2.1', cookie: '_fbp=fb.1.123.456; unrelated=private' };
const body = { name: 'InitiateCheckout', id: 'a1b2c3d4-1111-4444-8888-000000000000', path: '/planos', plan: 'monthly' };
async function send(event, reqHeaders = headers) {
  const res = { setHeader() {}, end(body) { this.body = JSON.parse(body); } };
  await handler({ method: 'POST', headers: reqHeaders, body: event }, res);
  return res;
}
test('only permitted pages and events can be relayed', async () => {
  assert.equal((await send({ ...body, name: 'Purchase' })).statusCode, 400);
  assert.equal((await send({ ...body, path: '/biblioteca' })).statusCode, 400);
  assert.equal((await send(body, { ...headers, origin: 'https://elsewhere.example' })).statusCode, 403);
});
test('server reports acceptance only when Meta acknowledges the event', async t => {
  const oldToken = process.env.META_CAPI_ACCESS_TOKEN;
  process.env.META_CAPI_ACCESS_TOKEN = 'unit-test-only';
  t.after(() => { if (oldToken === undefined) delete process.env.META_CAPI_ACCESS_TOKEN; else process.env.META_CAPI_ACCESS_TOKEN = oldToken; });
  let accepted = true;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(url.endsWith('/1816678829421239/events'));
    const [event] = JSON.parse(options.body).data;
    assert.equal(event.event_id, body.id);
    assert.equal(event.event_source_url, headers.origin + body.path);
    assert.deepEqual(event.custom_data.content_ids, [body.plan]);
    assert.deepEqual(event.user_data, { client_user_agent: 'test-browser', client_ip_address: '192.0.2.1', fbp: 'fb.1.123.456' });
    return { ok: true, status: 200, json: async () => ({ events_received: Number(accepted) }) };
  });
  assert.equal((await send(body)).body.received, true);
  accepted = false;
  assert.equal((await send(body)).statusCode, 502);
});
