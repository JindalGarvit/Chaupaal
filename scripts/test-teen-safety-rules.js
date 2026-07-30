/**
 * Static regression for teen-safety Firestore rules + parental phone index.
 * Run: node scripts/test-teen-safety-rules.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

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

const rules = fs.readFileSync(path.join(__dirname, '..', 'firebase', 'firestore.rules'), 'utf8');
const parental = fs.readFileSync(path.join(__dirname, '..', 'server-lib', 'parental-consent.js'), 'utf8');
const usersPublic = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'src', 'js', 'core', 'users-public.js'),
  'utf8'
);

test('rules define parentalConsentUntouched / cannotClearTeenSafetyFlags / cannotSelfPromoteAge', () => {
  assert.match(rules, /function parentalConsentUntouched\(\)/);
  assert.match(rules, /function cannotClearTeenSafetyFlags\(\)/);
  assert.match(rules, /function cannotSelfPromoteAge\(\)/);
  assert.match(rules, /function minorCannotSelfVerifyConsentOnCreate\(\)/);
  assert.match(rules, /function publicAgeRespectsPrivateMinor\(/);
});

test('users update locks consent + teen flags + age self-promotion', () => {
  const usersBlock = rules.slice(rules.indexOf('match /users/{userId}'), rules.indexOf('match /users_public/{userId}'));
  assert.match(usersBlock, /parentalConsentUntouched\(\)/);
  assert.match(usersBlock, /cannotClearTeenSafetyFlags\(\)/);
  assert.match(usersBlock, /cannotSelfPromoteAge\(\)/);
  assert.match(usersBlock, /minorCannotSelfVerifyConsentOnCreate\(\)/);
  assert.match(rules, /\['parentalConsent', 'parentalConsentPending'\]/);
});

test('users_public create/update respect private minor age and teen flags', () => {
  const pubBlock = rules.slice(
    rules.indexOf('match /users_public/{userId}'),
    rules.indexOf('match /usernames/{username}')
  );
  assert.match(pubBlock, /publicAgeRespectsPrivateMinor\(userId\)/);
  assert.match(pubBlock, /cannotClearTeenSafetyFlags\(\)/);
  assert.match(pubBlock, /cannotSelfPromoteAge\(\)/);
});

test('parental-consent resolves phone via phoneIndex (not phone_index)', () => {
  assert.match(parental, /collection\('phoneIndex'\)/);
  assert.doesNotMatch(parental, /collection\('phone_index'\)/);
});

test('users_public projection includes teenMode and isMinor for peer DM gates', () => {
  assert.match(usersPublic, /['"]teenMode['"]/);
  assert.match(usersPublic, /['"]isMinor['"]/);
});

console.log(process.exitCode ? '\nTeen safety rules tests failed.' : '\nTeen safety rules tests passed.');
