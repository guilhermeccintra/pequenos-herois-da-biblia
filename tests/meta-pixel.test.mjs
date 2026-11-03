import test from 'node:test';
import assert from 'node:assert/strict';
import { createMetaPixelTracker, META_PIXEL_ID } from '../src/meta-pixel.js';

function fixture(pathname = '/') {
  const events = new Map();
  const scripts = [];
  const win = {
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
  return { win, doc, scripts, fire, calls, tracker: createMetaPixelTracker({ win, doc }) };
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
    ['track', 'PageView'],
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
