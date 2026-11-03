import test from 'node:test';
import assert from 'node:assert/strict';
import { createMetaPixelTracker, META_PIXEL_ID } from '../src/meta-pixel.js';

function fixture(pathname = '/') {
  const events = new Map();
  const scripts = [];
  const requests = [];
  const win = {
    crypto: { randomUUID: () => 'test-' + requests.length },
    async fetch(url, options) { requests.push({ url, ...options }); },
    location: { pathname },
    scrollY: 0,
    addEventListener(name, callback) {
      if (!events.has(name)) events.set(name, []);
      events.get(name).push(callback);
    },
  };
  const doc = {
    createElement(name) { assert.equal(name, 'script'); return {}; },
    head: { appendChild(script) { scripts.push(script); } },
  };
  const fire = (name, event = {}) => {
    for (const callback of events.get(name) || []) callback(event);
  };
  const calls = () => win.fbq?.queue || [];
  return { win, doc, scripts, fire, calls, requests, tracker: createMetaPixelTracker({ win, doc }) };
}

test('initial PageView loads the correct Pixel once on the sales landing page', () => {
  const { tracker, scripts, calls } = fixture();
  tracker.syncRoute();
  tracker.syncRoute();
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, 'https://connect.facebook.net/en_US/fbevents.js');
  assert.deepEqual(calls(), [
    ['set', 'autoConfig', false, META_PIXEL_ID],
    ['init', META_PIXEL_ID],
    ['track', 'PageView', {}, { eventID: 'test-0' }],
  ]);
});

test('ViewContent requires user scroll and fires only once per sales page', () => {
  const { tracker, win, fire, calls } = fixture();
  tracker.syncRoute();
  win.scrollY = 800;
  fire('scroll'); // programmatic scrolling must not fire ViewContent
  assert.equal(calls().filter((call) => call[1] === 'ViewContent').length, 0);
  fire('wheel');
  win.scrollY = 839;
  fire('scroll');
  assert.equal(calls().filter((call) => call[1] === 'ViewContent').length, 0);
  win.scrollY = 840;
  fire('scroll');
  fire('scroll');
  assert.equal(calls().filter((call) => call[1] === 'ViewContent').length, 1);
});

test('SPA navigation records each sales page, but never protected routes or repeated rendering', () => {
  const { tracker, win, fire, calls, scripts } = fixture('/');
  tracker.syncRoute();
  win.scrollY = 0; fire('wheel'); win.scrollY = 55; fire('scroll');
  win.location.pathname = '/biblioteca';
  tracker.syncRoute();
  fire('wheel'); win.scrollY = 140; fire('scroll');
  win.location.pathname = '/planos';
  tracker.syncRoute();
  tracker.syncRoute();
  win.scrollY = 2000; fire('scroll'); // automatic plan section scroll
  fire('touchmove'); win.scrollY = 2050; fire('scroll');
  assert.deepEqual(calls().filter((call) => call[0] === 'track').map((call) => call[1]), [
    'PageView', 'ViewContent', 'PageView', 'ViewContent',
  ]);
  assert.equal(scripts.length, 1);
});

test('initial direct visits to the library, stories, registration or account load no Pixel', () => {
  for (const path of ['/historia/2', '/biblioteca', '/entrar', '/cadastro', '/conta', '/privacidade']) {
    const { tracker, win, scripts, fire } = fixture(path);
    tracker.syncRoute();
    fire('wheel'); win.scrollY = 100; fire('scroll');
    assert.equal(scripts.length, 0, path);
    assert.equal(win.fbq, undefined, path);
  }
});

test('keyboard scrolling excludes typing in form fields', () => {
  const { tracker, fire, win, calls } = fixture('/planos');
  tracker.syncRoute();
  fire('keydown', { key: ' ', target: { closest: () => ({}) } });
  win.scrollY = 100; fire('scroll');
  assert.equal(calls().filter((call) => call[1] === 'ViewContent').length, 0);
  fire('keydown', { key: 'ArrowDown', target: { closest: () => null } });
  win.scrollY = 145; fire('scroll');
  assert.equal(calls().filter((call) => call[1] === 'ViewContent').length, 1);
});

test('plan clicks track only the selected plan on public sales pages', () => {
  for (const [path, plan] of [['/', 'monthly'], ['/planos', 'annual']]) {
    const { tracker, win, calls } = fixture(path);
    tracker.syncRoute();
    tracker.initiateCheckout('invalid');
    tracker.initiateCheckout(plan);
    win.location.pathname = '/cadastro';
    tracker.syncRoute();
    tracker.initiateCheckout(plan);
    assert.deepEqual(calls().filter(call => call[1] === 'InitiateCheckout'), [
      ['track', 'InitiateCheckout', { content_ids: [plan] }, { eventID: 'test-1' }],
    ]);
  }
});

test('browser and API copies share a distinct ID for every event', () => {
  const { tracker, win, fire, calls, requests } = fixture('/planos');
  tracker.syncRoute();
  fire('wheel'); win.scrollY = 80; fire('scroll');
  tracker.initiateCheckout('annual');
  win.location.pathname = '/biblioteca';
  tracker.syncRoute();
  tracker.initiateCheckout('monthly');
  assert.equal(requests.length, 3);
  const browser = calls().filter(([op]) => op === 'track');
  requests.forEach((request, i) => {
    const { name, id, path } = JSON.parse(request.body);
    assert.equal(request.url, '/api/meta-events');
    assert.equal(request.keepalive, true);
    assert.equal(path, '/planos');
    assert.equal(name, browser[i][1]);
    assert.equal(id, browser[i][3].eventID);
  });
  assert.equal(new Set(browser.map(call => call[3].eventID)).size, 3);
});
