/**
 * Pure helpers for Akhbaar personalization (privacy + birthday + interests).
 * Run: node scripts/test-akhbaar-personalize.js
 */
const assert = require('assert');
const {
  allowsAppearInFriendsPrompts,
  isBirthdayToday,
  interestsList,
  readDob,
} = require('../server-lib/akhbaar-personalize');

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

test('readDob accepts nested and flat fields', () => {
  assert.strictEqual(readDob({ dateOfBirth: '1990-07-27' }), '1990-07-27');
  assert.strictEqual(readDob({ birthday: '07-27' }), '07-27');
  assert.strictEqual(readDob({ profile: { dob: '2000-01-02' } }), '2000-01-02');
  assert.strictEqual(readDob({}), null);
});

test('isBirthdayToday matches month/day in timezone', () => {
  // Use a fixed "today" via DOB that matches current calendar in Asia/Kolkata —
  // assert both sides of the helper using the same formatter.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date());
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  const day = Number(parts.find((p) => p.type === 'day')?.value);
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  assert.strictEqual(isBirthdayToday({ dateOfBirth: `1995-${mm}-${dd}` }, 'Asia/Kolkata'), true);
  assert.strictEqual(isBirthdayToday({ dateOfBirth: '1995-01-01' }, 'Asia/Kolkata'), month === 1 && day === 1);
  assert.strictEqual(isBirthdayToday({}, 'Asia/Kolkata'), false);
  assert.strictEqual(isBirthdayToday({ dateOfBirth: 'not-a-date' }, 'Asia/Kolkata'), false);
});

test('allowsAppearInFriendsPrompts defaults true, honors explicit false', () => {
  assert.strictEqual(allowsAppearInFriendsPrompts({}), true);
  assert.strictEqual(allowsAppearInFriendsPrompts({ akhbaarAppearInFriendsPrompts: true }), true);
  assert.strictEqual(allowsAppearInFriendsPrompts({ akhbaarAppearInFriendsPrompts: false }), false);
  assert.strictEqual(
    allowsAppearInFriendsPrompts({ profile: { akhbaarAppearInFriendsPrompts: false } }),
    false
  );
});

test('interestsList merges arrays, CSV, and free text (deduped)', () => {
  const list = interestsList({
    interests: ['Travel', 'Chess'],
    interestsFreeText: 'music, chess, hiking, Travel',
  });
  assert.ok(list.includes('Travel'));
  assert.ok(list.includes('Chess'));
  assert.ok(list.includes('music'));
  assert.ok(list.includes('hiking'));
  // Exact-string Set dedupe (case-sensitive): duplicate "Travel" collapsed
  assert.strictEqual(list.filter((x) => x === 'Travel').length, 1);
  // Tokens of length ≤2 from free text are ignored by design
  assert.ok(!interestsList({ interestsFreeText: 'go ai' }).includes('go'));
});

test('interestsList parses string hobbies', () => {
  const list = interestsList({ hobbies: 'Cooking; Hiking / Yoga' });
  assert.ok(list.includes('Cooking'));
  assert.ok(list.includes('Hiking'));
  assert.ok(list.includes('Yoga'));
});

console.log(
  process.exitCode ? '\nAkhbaar personalize tests failed.' : '\nAkhbaar personalize tests passed.'
);
