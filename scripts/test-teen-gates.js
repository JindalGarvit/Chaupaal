/**
 * Teen Mode messaging / age gates (pure, no DOM).
 * Run: node scripts/test-teen-gates.js
 */
'use strict';
const assert = require('assert');
const {
  ageFromDob,
  userAge,
  isMinorAge,
  isBlockedAge,
  isTeenAge,
  isTeenModeUser,
  needsParentalConsent,
  canMessageTarget,
  canSeeLocation,
} = require('../server-lib/teen-gates');

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

const adult = { age: 28 };
const teen = { age: 15, teenMode: true };
const teenUnverified = { age: 15 };
const teenVerified = { age: 15, parentalConsent: { verified: true } };
const child = { age: 12 };

test('age bands: blocked <13, teen 13–17, adult 18+', () => {
  assert.strictEqual(isBlockedAge(12), true);
  assert.strictEqual(isBlockedAge(13), false);
  assert.strictEqual(isTeenAge(13), true);
  assert.strictEqual(isTeenAge(17), true);
  assert.strictEqual(isTeenAge(18), false);
  assert.strictEqual(isMinorAge(17), true);
  assert.strictEqual(isMinorAge(18), false);
});

test('userAge prefers explicit age over DOB', () => {
  assert.strictEqual(userAge({ age: 16, dob: '2000-01-01' }), 16);
  const fifteenYearsAgo = new Date();
  fifteenYearsAgo.setFullYear(fifteenYearsAgo.getFullYear() - 15);
  assert.strictEqual(userAge({ dob: fifteenYearsAgo.toISOString() }), 15);
  assert.strictEqual(ageFromDob('not-a-date'), 0);
});

test('isTeenModeUser respects flags and consent', () => {
  assert.strictEqual(isTeenModeUser(adult), false);
  assert.strictEqual(isTeenModeUser(teen), true);
  assert.strictEqual(isTeenModeUser(teenUnverified), true);
  // Verified teen without teenMode/isMinor flag: still minor age → teen until adult
  assert.strictEqual(isTeenModeUser(teenVerified), false);
  assert.strictEqual(isTeenModeUser({ isMinor: true, age: 20 }), true);
  assert.strictEqual(isTeenModeUser(null), false);
});

test('needsParentalConsent only for unverified 13–17', () => {
  assert.strictEqual(needsParentalConsent(teenUnverified), true);
  assert.strictEqual(needsParentalConsent(teenVerified), false);
  assert.strictEqual(needsParentalConsent(adult), false);
  assert.strictEqual(needsParentalConsent(child), false);
});

test('canMessageTarget allows adult↔adult and friends', () => {
  assert.deepStrictEqual(canMessageTarget(adult, adult, {}), { ok: true });
  assert.deepStrictEqual(canMessageTarget(teen, adult, { friend: true }), { ok: true });
  assert.deepStrictEqual(canMessageTarget(adult, teen, { friend: true }), { ok: true });
});

test('canMessageTarget allows teen↔teen strangers; blocks cross-age strangers', () => {
  assert.deepStrictEqual(canMessageTarget(teen, { age: 14, teenMode: true }, {}), { ok: true });
  assert.deepStrictEqual(canMessageTarget(teen, adult, {}), {
    ok: false,
    reason: 'teen_adult_stranger',
  });
  assert.deepStrictEqual(canMessageTarget(adult, teen, {}), {
    ok: false,
    reason: 'adult_teen_stranger',
  });
});

test('canSeeLocation requires friendship', () => {
  assert.strictEqual(canSeeLocation({ friend: true }), true);
  assert.strictEqual(canSeeLocation({ friend: false }), false);
  assert.strictEqual(canSeeLocation(null), false);
});

console.log(process.exitCode ? '\nTeen gates tests failed.' : '\nTeen gates tests passed.');
