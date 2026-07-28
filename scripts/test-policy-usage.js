/**
 * Policy usage IST day/week keys (quota reset boundaries).
 * Run: node scripts/test-policy-usage.js
 */
'use strict';
const assert = require('assert');
const { dayKeyIST, weekKeyMondayIST, POLICY_LIMITS } = require('../server-lib/policy-usage');

function test(name, fn) {
  try {
    fn();
    console.log('✓', name);
  } catch (e) {
    console.error('✗', name);
    console.error(e);
    process.exitCode = 1;
  }
}

test('POLICY_LIMITS expose enforced features', () => {
  assert.strictEqual(POLICY_LIMITS.anon.perDay, 2);
  assert.strictEqual(POLICY_LIMITS.peepalPost.perWeek, 5);
  assert.strictEqual(POLICY_LIMITS.aiKb.perDay, 5);
});

test('dayKeyIST uses Asia/Kolkata calendar day', () => {
  // 2026-07-27 23:30 UTC → 2026-07-28 05:00 IST
  assert.strictEqual(dayKeyIST(new Date('2026-07-27T23:30:00Z')), '2026-07-28');
  // Still previous IST day just before midnight IST
  assert.strictEqual(dayKeyIST(new Date('2026-07-27T18:29:00Z')), '2026-07-27');
});

test('weekKeyMondayIST returns Monday of IST week', () => {
  // Wednesday IST 2026-07-29 → week starts Monday 2026-07-27
  assert.strictEqual(weekKeyMondayIST(new Date('2026-07-29T06:00:00Z')), '2026-07-27');
  // Sunday IST 2026-08-02 → still Monday 2026-07-27
  assert.strictEqual(weekKeyMondayIST(new Date('2026-08-02T06:00:00Z')), '2026-07-27');
  // Monday IST 2026-08-03 early → new week
  assert.strictEqual(weekKeyMondayIST(new Date('2026-08-02T20:00:00Z')), '2026-08-03');
});

console.log(process.exitCode ? '\nPolicy usage tests failed.' : '\nPolicy usage tests passed.');
