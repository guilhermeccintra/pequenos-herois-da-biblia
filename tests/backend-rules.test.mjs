import test from 'node:test';
import assert from 'node:assert/strict';

import * as rules from '../server/rules.mjs';
const now = Date.parse('2026-10-30T12:00:00Z');
const prices = { monthly: 'price_monthly', annual: 'price_annual' };
const price = { id: 'price_monthly', active: true, type: 'recurring', currency: 'brl', unit_amount: 3790, billing_scheme: 'per_unit', recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' } };
const active = { id: 'sub_current', customer: 'cus_owner', created: 1793304000, status: 'active', cancel_at_period_end: false, items: { data: [{ quantity: 1, current_period_end: 1796040000, price }], has_more: false } };

test('reading requires a paid active plan with a strictly future, valid end date', () => {
  assert.equal(typeof rules.hasAccess, 'function', 'access gate is missing');
  for (const [subscription, expected] of [
    [null, false],
    [{ status: 'active', plan: 'monthly', current_period_end: '2026-10-30T12:00:01Z' }, true],
    [{ status: 'active', plan: 'annual', current_period_end: '2027-10-30T00:00:00Z', cancel_at_period_end: true }, true],
    [{ status: 'active', plan: 'monthly', current_period_end: '2026-10-30T12:00:00Z' }, false],
    [{ status: 'active', plan: 'monthly', current_period_end: 'not a date' }, false],
    [{ status: 'past_due', plan: 'monthly', current_period_end: '2027-01-01' }, false],
    [{ status: 'canceled', plan: 'annual', current_period_end: '2027-01-01' }, false],
    [{ status: 'trialing', plan: 'annual', current_period_end: '2027-01-01' }, false],
    [{ status: 'active', plan: null, current_period_end: '2027-01-01' }, false],
  ]) assert.equal(rules.hasAccess(subscription, now), expected);
});

test('checkout accepts only the two server-owned plan choices and rejects cost/user tampering', () => {
  assert.equal(typeof rules.parsePlan, 'function', 'checkout input validation is missing');
  assert.equal(rules.parsePlan({ plan: 'annual' }), 'annual');
  for (const input of [{ plan: 'free' }, { plan: 'monthly', amount: 1 }, { plan: 'monthly', price: 'price_bad' }, { plan: 'annual', user_id: 'someone' }, {}, null, []]) {
    assert.throws(() => rules.parsePlan(input), (error) => error.status === 400);
  }
});

test('server rejects configured prices with wrong money, currency, recurrence or quantity model', () => {
  assert.equal(typeof rules.validatePrice, 'function', 'price validation is missing');
  assert.equal(rules.validatePrice(price, 'monthly', prices), true);
  assert.equal(rules.validatePrice({ ...price, id: 'price_annual', unit_amount: 19700, recurring: { interval: 'year', interval_count: 1, usage_type: 'licensed' } }, 'annual', prices), true);
  for (const bad of [
    { unit_amount: 2990 }, { unit_amount: 47 }, { currency: 'usd' }, { id: 'price_other' }, { active: false },
    { recurring: { interval: 'year', interval_count: 1 } },
    { recurring: { interval: 'month', interval_count: 2 } },
    { recurring: { interval: 'month', interval_count: 1, usage_type: 'metered' } },
    { transform_quantity: { divide_by: 10, round: 'up' } }, { billing_scheme: 'tiered' },
  ]) assert.throws(() => rules.validatePrice({ ...price, ...bad }, 'monthly', prices));
});

test('subscription period comes from the current API item and an old deletion cannot replace a live subscription', () => {
  assert.equal(typeof rules.selectSubscription, 'function', 'authoritative subscription mapping is missing');
  const snapshot = rules.selectSubscription([{ ...active, id: 'sub_old', created: 1, status: 'canceled' }, active], prices, now);
  assert.equal(snapshot.stripe_subscription_id, 'sub_current');
  assert.equal(snapshot.current_period_end, '2026-11-30T12:00:00.000Z');
  assert.equal(snapshot.plan, 'monthly');
  assert.equal(rules.hasAccess(snapshot, now), true);
});

test('a mismatched Stripe price or multiple subscription items cannot grant access', () => {
  assert.equal(typeof rules.selectSubscription, 'function', 'subscription validation is missing');
  for (const items of [
    { data: [{ ...active.items.data[0], price: { ...price, unit_amount: 1 } }] },
    { data: [{ ...active.items.data[0], quantity: 2 }] },
    { data: [active.items.data[0], active.items.data[0]] },
    { data: [{ ...active.items.data[0], current_period_end: undefined }] },
  ]) assert.equal(rules.hasAccess(rules.selectSubscription([{ ...active, items }], prices, now), now), false);
});

test('media URLs expire no later than the entitlement and reject traversal', () => {
  assert.equal(typeof rules.mediaLifetime, 'function', 'signed-media expiry gate is missing');
  assert.equal(rules.mediaLifetime({ status: 'active', plan: 'monthly', current_period_end: '2026-10-30T12:00:45Z' }, now), 45);
  assert.equal(rules.mediaLifetime({ status: 'active', plan: 'monthly', current_period_end: '2026-10-31T12:00:00Z' }, now), 900);
  assert.throws(() => rules.mediaLifetime(null, now), (error) => error.status === 403);
  assert.equal(rules.safeAssetPath('02/part1.webp'), '02/part1.webp');
  for (const bad of ['../secret', '/02/part1.webp', 'https://x.test/x', '02/../part1.webp', '02\\part1.webp', '02/x%2Fy.webp']) assert.throws(() => rules.safeAssetPath(bad));
});
