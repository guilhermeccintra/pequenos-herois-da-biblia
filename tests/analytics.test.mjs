import test from 'node:test';
import assert from 'node:assert/strict';
import { createGa4Tracker, GA4_ID, GA4_OFFERS } from '../src/analytics.js';
import { parseCheckoutRequest } from '../server/rules.mjs';
import { buildGa4Purchase, reportFirstPaidInvoice } from '../server/ga4.mjs';

function browser(pathname = '/') {
  const listeners = new Map();
  const calls = [];
  const scripts = [];
  const win = {
    location: { origin: 'https://pequenosheroisoficial.com.br', pathname },
    scrollY: 0,
    setTimeout,
    clearTimeout,
    gtag(...args) {
      calls.push(args);
      if (args[0] === 'get') args[3](args[2] === 'client_id' ? '123.456' : '789');
      if (args[0] === 'event' && args[2]?.event_callback) args[2].event_callback();
    },
    addEventListener(name, fn) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(fn);
    },
  };
  const doc = {
    title: 'Pequenos Heróis — Página de vendas',
    createElement: () => ({}),
    head: { appendChild: (script) => scripts.push(script) },
  };
  const tracker = createGa4Tracker({ win, doc });
  return { win, doc, calls, scripts, tracker, fire(name, event = {}) {
    for (const fn of listeners.get(name) || []) fn(event);
  } };
}

test('GA4 is loaded once on the public offer, and SPA page views are not duplicated', () => {
  const { win, tracker, calls, scripts } = browser();
  tracker.trackRoute(); tracker.trackRoute();
  win.location.pathname = '/planos'; tracker.trackRoute();
  win.location.pathname = '/historia/5'; tracker.trackRoute();
  win.location.pathname = '/conta'; tracker.trackRoute();
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, 'https://www.googletagmanager.com/gtag/js?id=' + GA4_ID);
  const pages = calls.filter((args) => args[0] === 'event' && args[1] === 'page_view');
  assert.equal(pages.length, 2);
  assert.deepEqual(pages.map((args) => args[2].page_path), ['/', '/planos']);
  assert.ok(calls.some((args) => args[0] === 'config' && args[1] === GA4_ID && args[2].send_page_view === false));
});

test('GA4 does not start on child-facing stories and library pages', () => {
  for (const path of ['/biblioteca', '/historia/1', '/historia/365', '/conta']) {
    const { tracker, scripts } = browser(path);
    tracker.trackRoute();
    assert.equal(scripts.length, 0, path);
  }
});

test('GA4 view_item requires actual user scrolling and only fires once per offer route', () => {
  const { win, tracker, calls, fire } = browser();
  tracker.trackRoute();
  win.scrollY = 600; fire('scroll');
  assert.equal(calls.some((args) => args[1] === 'view_item'), false);
  fire('wheel');
  win.scrollY = 639; fire('scroll');
  assert.equal(calls.some((args) => args[1] === 'view_item'), false);
  win.scrollY = 641; fire('scroll'); fire('scroll');
  assert.equal(calls.filter((args) => args[1] === 'view_item').length, 1);
  win.location.pathname = '/planos'; tracker.trackRoute();
  win.scrollY = 0; fire('wheel'); win.scrollY = 45; fire('scroll');
  assert.equal(calls.filter((args) => args[1] === 'view_item').length, 2);
});

test('Checkout attribution and begin_checkout use the actual server-owned plan price', async () => {
  const { tracker, calls } = browser('/cadastro');
  tracker.trackRoute();
  const attribution = await tracker.checkoutAttribution();
  assert.deepEqual(attribution, { client_id: '123.456', session_id: '789' });
  await tracker.beginCheckout('monthly');
  const begin = calls.find((args) => args[0] === 'event' && args[1] === 'begin_checkout');
  assert.equal(begin[2].currency, 'BRL');
  assert.equal(begin[2].value, GA4_OFFERS.monthly.price);
  assert.equal(begin[2].items[0].item_id, 'pequenos_herois_mensal');
  assert.deepEqual(parseCheckoutRequest({ plan: 'monthly', analytics: attribution }), { plan: 'monthly', analytics: attribution });
  assert.deepEqual(parseCheckoutRequest({ plan: 'annual' }), { plan: 'annual', analytics: null });
  assert.throws(() => parseCheckoutRequest({ plan: 'monthly', amount: 1 }), /Escolha o plano/);
  assert.throws(() => parseCheckoutRequest({ plan: 'monthly', analytics: { client_id: '123.456', email: 'visitor@example.test' } }), /Parâmetros inválidos/);
});

const metadata = {
  app: 'pequenos-herois',
  auth_user_id: 'owner-1',
  plan: 'monthly',
  ga4_client_id: '123.456',
  ga4_session_id: '789',
};
const paidInvoice = {
  id: 'in_first_paid',
  customer: 'cus_1',
  billing_reason: 'subscription_create',
  status: 'paid',
  amount_paid: 3790,
  currency: 'brl',
  parent: { subscription_details: { subscription: 'sub_1' } },
};

test('GA4 purchase reports the confirmed first invoice, exact paid amount and no PII', () => {
  const event = buildGa4Purchase(paidInvoice, metadata);
  assert.equal(event.client_id, '123.456');
  assert.equal(event.events[0].name, 'purchase');
  assert.equal(event.events[0].params.transaction_id, paidInvoice.id);
  assert.equal(event.events[0].params.value, 37.9);
  assert.equal(event.events[0].params.currency, 'BRL');
  assert.equal(event.events[0].params.session_id, 789);
  assert.ok(!JSON.stringify(event).includes('owner-1'));
  assert.equal(buildGa4Purchase({ ...paidInvoice, status: 'open' }, metadata), null);
  assert.equal(buildGa4Purchase({ ...paidInvoice, billing_reason: 'subscription_cycle' }, metadata), null);
});

test('GA4 server sends only the first paid invoice with validated subscription metadata', async () => {
  const sent = [];
  let lookedUp = 0;
  const deps = {
    ga4UserId: 'owner-1',
    config: { ga4ApiSecret: 'test-secret' },
    stripe: { subscriptions: { retrieve: async (id) => {
      lookedUp++;
      assert.equal(id, 'sub_1');
      return { customer: 'cus_1', metadata };
    } } },
  };
  const fetchImpl = async (url, init) => {
    assert.ok(url.startsWith('https://www.google-analytics.com/mp/collect?'));
    assert.ok(url.includes('measurement_id=' + GA4_ID));
    sent.push(JSON.parse(init.body));
    return { ok: true, status: 204 };
  };
  const event = { id: 'evt_1', type: 'invoice.paid', data: { object: paidInvoice } };
  const result = await reportFirstPaidInvoice(event, deps, fetchImpl);
  assert.equal(result.sent, true);
  assert.equal(lookedUp, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].events[0].params.transaction_id, 'in_first_paid');
  assert.equal((await reportFirstPaidInvoice({
    ...event, data: { object: { ...paidInvoice, billing_reason: 'subscription_cycle' } },
  }, deps, fetchImpl)).skipped, 'not_first_paid_invoice');
  assert.equal(sent.length, 1);
  assert.equal((await reportFirstPaidInvoice(event, { ...deps, config: {} }, fetchImpl)).skipped, 'missing_api_secret');
});
