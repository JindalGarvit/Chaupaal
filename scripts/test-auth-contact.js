/**
 * Unit tests for auth contact / identifier helpers (pure).
 * Run: node scripts/test-auth-contact.js
 */
'use strict';
const assert = require('assert');
const {
  hasVerifiedContact,
  isDisposableEmail,
  userHasPasswordProvider,
  classifyLoginIdentifier,
  normalizePhoneE164,
  isValidUsernameHandle,
  sanitizeUsername,
  looksLikeEmail,
} = require('../server-lib/auth-contact');

async function test(name, fn) {
  await fn();
  console.log(`✓ ${name}`);
}

async function main() {
  await test('hasVerifiedContact: emailVerified', () => {
    assert.equal(hasVerifiedContact({ emailVerified: true }), true);
  });

  await test('hasVerifiedContact: phone counts even if email unverified', () => {
    assert.equal(hasVerifiedContact({ emailVerified: false, phoneNumber: '+919876543210' }), true);
  });

  await test('hasVerifiedContact: Google provider counts', () => {
    assert.equal(
      hasVerifiedContact({
        emailVerified: false,
        providerData: [{ providerId: 'google.com' }],
      }),
      true
    );
  });

  await test('hasVerifiedContact: unverified email/password alone is false', () => {
    assert.equal(
      hasVerifiedContact({
        emailVerified: false,
        email: 'a@gmail.com',
        providerData: [{ providerId: 'password' }],
      }),
      false
    );
    assert.equal(hasVerifiedContact(null), false);
  });

  await test('isDisposableEmail blocks known throwaways', () => {
    assert.equal(isDisposableEmail('x@mailinator.com'), true);
    assert.equal(isDisposableEmail('you@yopmail.com'), true);
    assert.equal(isDisposableEmail('garvit@gmail.com'), false);
    assert.equal(isDisposableEmail('not-an-email'), false);
  });

  await test('userHasPasswordProvider', () => {
    assert.equal(userHasPasswordProvider({ providerData: [{ providerId: 'password' }] }), true);
    assert.equal(userHasPasswordProvider({ providerData: [{ providerId: 'google.com' }] }), false);
  });

  await test('classifyLoginIdentifier email / phone / username', () => {
    assert.equal(classifyLoginIdentifier('You@Example.com'), 'email');
    assert.equal(classifyLoginIdentifier('9876543210'), 'phone');
    assert.equal(classifyLoginIdentifier('+91 98765 43210'), 'phone');
    assert.equal(classifyLoginIdentifier('@chaupaal_user'), 'username');
    assert.equal(classifyLoginIdentifier(''), 'empty');
  });

  await test('normalizePhoneE164 India-first', () => {
    assert.equal(normalizePhoneE164('9876543210'), '+919876543210');
    assert.equal(normalizePhoneE164('919876543210'), '+919876543210');
    assert.equal(normalizePhoneE164('+919876543210'), '+919876543210');
    assert.equal(normalizePhoneE164('123'), null);
  });

  await test('username sanitize + length gate', () => {
    assert.equal(sanitizeUsername('@Hello_World!!'), 'hello_world');
    assert.equal(isValidUsernameHandle('ab'), false);
    assert.equal(isValidUsernameHandle('abc'), true);
    assert.equal(isValidUsernameHandle('a'.repeat(21)), false);
    assert.equal(looksLikeEmail('a@b.co'), true);
  });

  console.log('\nAll auth-contact tests passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
