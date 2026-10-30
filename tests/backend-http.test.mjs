import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import Stripe from 'stripe';
import * as api from '../server/handlers.mjs';
import * as http from '../server/http.mjs';
const now = () => Date.parse('2026-10-30T12:00:00Z');
const user = { id: 'owner', email: 'parent@example.test' };

function request({ method = 'GET', url = '/api/story?id=2', token = 'valid', body } = {}) {
  const req = Readable.from(body ? [JSON.stringify(body)] : []);
  req.method = method; req.url = url;
  req.headers = { ...(token && { authorization: `Bearer ${token}` }), ...(body && { 'content-type': 'application/json' }) };
  return req;
}
function response() {
  return { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(value) { this.body = JSON.parse(value); } };
}
function fixture() {
  const state = { storyReads: 0, signed: [], subscription: { status: 'active', plan: 'monthly', current_period_end: '2026-10-31T00:00:00Z' } };
  return {
    state, now, config: {},
    async authenticate(token) { return token === 'valid' ? user : null; },
    repo: {
      async getSubscription(id) { assert.equal(id, 'owner'); return state.subscription; },
      async getProgress(id) { assert.equal(id, 'owner'); return [{ story_id: 2, part: 1, completed: false, favorite: true }]; },
      async getStory() { state.storyReads++; return { id: 2, title: 'A história', cover: '/images/covers/02.webp', parts: [{ heading: 'Começo', paragraphs: ['Texto privado'], image: '02/part1.webp' }], audio_path: 'audio/02/hash.mp3' }; },
      async signAssets(paths, lifetime) { state.signed.push({ paths, lifetime }); return paths.map((path) => `https://storage.example.test/${path}?token=signed`); },
    },
  };
}

test('paid story request without valid auth returns 401 and never reads narrative or signs assets', async () => {
  assert.equal(typeof api.createHandlers, 'function', 'HTTP routes are missing');
  for (const token of [null, 'forged']) {
    const deps = fixture(); const res = response();
    await api.createHandlers(deps).story(request({ token }), res);
    assert.equal(res.statusCode, 401);
    assert.equal(deps.state.storyReads, 0);
    assert.equal(deps.state.signed.length, 0);
    assert.equal(res.headers['cache-control'], 'no-store');
  }
});

test('expired entitlement blocks paid content even when a success query is supplied', async () => {
  assert.equal(typeof api.createHandlers, 'function', 'HTTP routes are missing');
  const deps = fixture(); deps.state.subscription.current_period_end = '2026-10-30T12:00:00Z';
  const res = response();
  await api.createHandlers(deps).story(request({ url: '/api/story?id=2&success=true&session_id=cs_forged' }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(deps.state.storyReads, 0);
  assert.equal(deps.state.signed.length, 0);
});

test('authorized narrative returns signed images/audio, omits private audio path and is never cached', async () => {
  assert.equal(typeof api.createHandlers, 'function', 'HTTP routes are missing');
  const deps = fixture(); const res = response();
  await api.createHandlers(deps).story(request(), res);
  assert.equal(res.statusCode, 200);
  assert.match(res.body.story.parts[0].image, /^https:.*token=signed$/);
  assert.match(res.body.story.audio_url, /^https:.*token=signed$/);
  assert.equal(res.body.story.audio_path, undefined);
  assert.equal(res.body.audio_url, res.body.story.audio_url);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.deepEqual(deps.state.signed, [{ paths: ['02/part1.webp', 'audio/02/hash.mp3'], lifetime: 900 }]);
});

test('account returns only own public subscription fields and progress', async () => {
  assert.equal(typeof api.createHandlers, 'function', 'HTTP routes are missing');
  const deps = fixture(); deps.state.subscription.stripe_customer_id = 'cus_private';
  const res = response();
  await api.createHandlers(deps).account(request({ url: '/api/account?user_id=other' }), res);
  assert.equal(res.body.user.id, 'owner');
  assert.equal(res.body.hasAccess, true);
  assert.equal(res.body.subscription.stripe_customer_id, undefined);
  assert.equal(res.body.progress[0].favorite, true);
});

test('unsupported methods and malformed checkout JSON fail without starting a payment', async () => {
  assert.equal(typeof api.createHandlers, 'function', 'HTTP routes are missing');
  const deps = fixture(); const res = response();
  await api.createHandlers(deps).story(request({ method: 'POST' }), res);
  assert.equal(res.statusCode, 405);
  const bad = response();
  await api.createHandlers(deps).checkout(request({ method: 'POST', body: { plan: 'monthly', amount: 1 } }), bad);
  assert.equal(bad.statusCode, 400);
});

test('raw Stripe body reading does not touch the Vercel body getter and preserves signature bytes', async () => {
  assert.equal(typeof http.readRawBody, 'function', 'raw webhook body reader is missing');
  const raw = '{\n  "id": "evt_verified", "object":"event"\n}';
  const req = Readable.from([Buffer.from(raw.slice(0, 8)), Buffer.from(raw.slice(8))]);
  Object.defineProperty(req, 'body', { get() { throw new Error('Vercel body getter must not be touched'); } });
  const buffer = await http.readRawBody(req);
  assert.equal(buffer.toString(), raw);
  const stripe = new Stripe('sk_test_not_used_for_network');
  const header = stripe.webhooks.generateTestHeaderString({ payload: raw, secret: 'whsec_unit_test' });
  assert.equal(stripe.webhooks.constructEvent(buffer, header, 'whsec_unit_test').id, 'evt_verified');
  assert.throws(() => stripe.webhooks.constructEvent(Buffer.from(raw + ' '), header, 'whsec_unit_test'));
});

test('webhook signature failures return 400 before processing and body size is bounded', async () => {
  assert.equal(typeof api.createHandlers, 'function', 'HTTP routes are missing');
  const deps = fixture(); deps.config.webhookSecret = 'whsec_unit_test';
  deps.stripe = new Stripe('sk_test_not_used_for_network');
  const req = request({ method: 'POST', body: { id: 'evt_forged' } });
  req.headers['stripe-signature'] = 't=1,v1=bad';
  const res = response();
  await api.createHandlers(deps).webhook(req, res);
  assert.equal(res.statusCode, 400);
  await assert.rejects(http.readRawBody(Readable.from(['abcdef']), 3), (error) => error.status === 413);
});
