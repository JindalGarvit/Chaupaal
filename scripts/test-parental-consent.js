/**
 * Parental consent pure helpers (no Firestore / Auth).
 * Run: node scripts/test-parental-consent.js
 */
'use strict';
const assert = require('assert');
const {
  cleanContact,
  hashConsentOtp,
  parentAgeStatus,
  phoneIndexCandidates,
  evaluatePendingOtp,
} = require('../server-lib/parental-consent');

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

test('cleanContact trims, lowercases, and caps length', () => {
  assert.strictEqual(cleanContact('  Parent@Example.COM '), 'parent@example.com');
  assert.strictEqual(cleanContact('A'.repeat(200)).length, 180);
  assert.strictEqual(cleanContact(null), '');
});

test('parentAgeStatus rejects minors, allows missing age', () => {
  assert.strictEqual(parentAgeStatus(15), 'PARENT_NOT_ADULT');
  assert.strictEqual(parentAgeStatus(17), 'PARENT_NOT_ADULT');
  assert.strictEqual(parentAgeStatus(18), 'ok');
  assert.strictEqual(parentAgeStatus(0), 'ok');
  assert.strictEqual(parentAgeStatus(undefined), 'ok');
});

test('phoneIndexCandidates builds e164 variants for 10+ digits', () => {
  assert.deepStrictEqual(phoneIndexCandidates('9876543210'), [
    '9876543210',
    '+9876543210',
    '+919876543210',
  ]);
  assert.deepStrictEqual(phoneIndexCandidates('ab'), []);
});

test('hashConsentOtp is deterministic and child-scoped', () => {
  const a = hashConsentOtp('123456', 'child1');
  const b = hashConsentOtp('123456', 'child1');
  const c = hashConsentOtp('123456', 'child2');
  assert.strictEqual(a, b);
  assert.notStrictEqual(a, c);
  assert.strictEqual(a.length, 64);
});

test('evaluatePendingOtp covers missing / expired / invalid / ok', () => {
  const childUid = 'teen1';
  const otp = '654321';
  const pending = {
    otpHash: hashConsentOtp(otp, childUid),
    expiresAt: Date.now() + 60_000,
  };
  assert.deepStrictEqual(evaluatePendingOtp({ pending: null, childUid, otp }), {
    ok: false,
    error: 'NO_PENDING',
  });
  assert.deepStrictEqual(
    evaluatePendingOtp({
      pending: { ...pending, expiresAt: Date.now() - 1 },
      childUid,
      otp,
      nowMs: Date.now(),
    }),
    { ok: false, error: 'EXPIRED' }
  );
  assert.deepStrictEqual(evaluatePendingOtp({ pending, childUid, otp: '000000' }), {
    ok: false,
    error: 'INVALID_OTP',
  });
  assert.deepStrictEqual(evaluatePendingOtp({ pending, childUid, otp }), { ok: true });
  assert.deepStrictEqual(evaluatePendingOtp({ pending, childUid, otp: '' }), {
    ok: false,
    error: 'MISSING',
  });
});

console.log(process.exitCode ? '\nParental consent tests failed.' : '\nParental consent tests passed.');
