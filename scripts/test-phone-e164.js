/**
 * Phone E164 normalization used by resolve_identifier (password login).
 * Run: node scripts/test-phone-e164.js
 */
const assert = require('assert');
const { normalizePhoneE164 } = require('../server-lib/phone-e164');

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

test('bare 10-digit India mobile → +91', () => {
  assert.strictEqual(normalizePhoneE164('9876543210'), '+919876543210');
});

test('spaces and dashes stripped for 10-digit', () => {
  assert.strictEqual(normalizePhoneE164('98765 43210'), '+919876543210');
  assert.strictEqual(normalizePhoneE164('98765-43210'), '+919876543210');
});

test('91-prefixed 12 digits → +91…', () => {
  assert.strictEqual(normalizePhoneE164('919876543210'), '+919876543210');
  assert.strictEqual(normalizePhoneE164('+91 98765 43210'), '+919876543210');
});

test('explicit +E164 kept (digits only after +)', () => {
  assert.strictEqual(normalizePhoneE164('+14155552671'), '+14155552671');
});

test('username / email are not phones', () => {
  assert.strictEqual(normalizePhoneE164('garvit_j'), null);
  assert.strictEqual(normalizePhoneE164('user@example.com'), null);
  assert.strictEqual(normalizePhoneE164(''), null);
  assert.strictEqual(normalizePhoneE164(null), null);
});

test('too-short digit strings rejected', () => {
  assert.strictEqual(normalizePhoneE164('12345'), null);
  assert.strictEqual(normalizePhoneE164('+123'), null);
});

console.log(process.exitCode ? '\nPhone E164 tests failed.' : '\nPhone E164 tests passed.');
