/**
 * Unit tests for server-lib/phone-hash — token-bound sync, no Firestore.
 */
'use strict';
const assert = require('assert');
const crypto = require('crypto');
const {
  sha256Hex,
  phoneHashFromVerifiedToken,
  buildPhoneHashRecord,
} = require('../server-lib/phone-hash');

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

test('sha256Hex matches Node crypto for E.164', () => {
  const phone = '+919876543210';
  const expected = crypto.createHash('sha256').update(phone, 'utf8').digest('hex');
  assert.equal(sha256Hex(phone), expected);
  assert.equal(sha256Hex(phone).length, 64);
});

test('phoneHashFromVerifiedToken rejects missing / invalid phones', () => {
  assert.equal(phoneHashFromVerifiedToken(null).ok, false);
  assert.equal(phoneHashFromVerifiedToken({}).error, 'NO_VERIFIED_PHONE');
  assert.equal(phoneHashFromVerifiedToken({ phone_number: '9876543210' }).ok, false);
  assert.equal(phoneHashFromVerifiedToken({ phone_number: '+0123' }).ok, false);
});

test('phoneHashFromVerifiedToken accepts E.164 from token claim', () => {
  const out = phoneHashFromVerifiedToken({ phone_number: '+919876543210' });
  assert.equal(out.ok, true);
  assert.equal(out.phone, '+919876543210');
  assert.equal(out.hash, sha256Hex('+919876543210'));
});

test('buildPhoneHashRecord ignores client-supplied identity and binds uid + token phone', () => {
  const out = buildPhoneHashRecord('uid_alice', { phone_number: '+14155552671' }, 123);
  assert.equal(out.ok, true);
  assert.equal(out.hash, sha256Hex('+14155552671'));
  assert.deepEqual(out.data, { uid: 'uid_alice', updatedAt: 123 });
  // Attacker cannot claim Bob's hash via this helper — hash always from token phone.
  const bobHash = sha256Hex('+919999999999');
  assert.notEqual(out.hash, bobHash);
});

test('buildPhoneHashRecord rejects empty uid', () => {
  assert.equal(buildPhoneHashRecord('', { phone_number: '+919876543210' }).error, 'MISSING_UID');
});

if (!process.exitCode) {
  console.log('All phone-hash tests passed.');
}
