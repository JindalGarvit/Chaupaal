/**
 * Unit tests for companion outreach pure helpers (festivals, check-in spacing).
 * No Firestore / AI network.
 */
'use strict';
const assert = require('assert');
const {
  festivalForDate,
  checkInIntervalDays,
  birthdayMatch,
  FESTIVAL_CALENDAR,
  CHECKIN_FLOOR_DAYS,
  CHECKIN_CEILING_DAYS,
  maybeCompanionPremiumUpsellPlaceholder,
} = require('../server-lib/companion-outreach');

function test(name, fn) {
  const result = fn();
  if (result && typeof result.then === 'function') {
    return result.then(() => console.log(`✓ ${name}`));
  }
  console.log(`✓ ${name}`);
  return Promise.resolve();
}

async function main() {
  await test('festival calendar has unique ids and valid MM-DD', () => {
    const ids = new Set();
    for (const f of FESTIVAL_CALENDAR) {
      assert.ok(f.id && f.name && f.wish);
      assert.ok(f.month >= 1 && f.month <= 12);
      assert.ok(f.day >= 1 && f.day <= 31);
      assert.ok(!ids.has(f.id), `duplicate festival id ${f.id}`);
      ids.add(f.id);
    }
  });

  await test('festivalForDate exact match (Republic Day / Diwali)', () => {
    // Use UTC noon so IST (UTC+5:30) stays on the same calendar day.
    const republic = festivalForDate(new Date('2026-01-26T12:00:00Z'), 'Asia/Kolkata');
    assert.strictEqual(republic?.id, 'republic_day');
    const diwali = festivalForDate(new Date('2026-10-20T12:00:00Z'), 'Asia/Kolkata');
    assert.strictEqual(diwali?.id, 'diwali');
  });

  await test('festivalForDate soft ±1 day only for lunar-approx festivals', () => {
    const softHoli = festivalForDate(new Date('2026-03-15T12:00:00Z'), 'Asia/Kolkata');
    assert.strictEqual(softHoli?.id, 'holi');
    // Christmas is not in the soft-match allowlist — day-before must miss.
    const almostXmas = festivalForDate(new Date('2026-12-24T12:00:00Z'), 'Asia/Kolkata');
    assert.strictEqual(almostXmas, null);
  });

  await test('festivalForDate returns null on ordinary days', () => {
    assert.strictEqual(festivalForDate(new Date('2026-04-10T12:00:00Z'), 'Asia/Kolkata'), null);
  });

  await test('checkInIntervalDays maps engagement rate into floor..ceiling', () => {
    assert.strictEqual(checkInIntervalDays({ sent: 0, engaged: 0 }), Math.round(CHECKIN_CEILING_DAYS - 0.35 * (CHECKIN_CEILING_DAYS - CHECKIN_FLOOR_DAYS)));
    assert.strictEqual(checkInIntervalDays({ sent: 10, engaged: 10 }), CHECKIN_FLOOR_DAYS);
    assert.strictEqual(checkInIntervalDays({ sent: 10, engaged: 0 }), CHECKIN_CEILING_DAYS);
    const mid = checkInIntervalDays({ sent: 10, engaged: 5 });
    assert.ok(mid > CHECKIN_FLOOR_DAYS && mid < CHECKIN_CEILING_DAYS);
  });

  await test('birthdayMatch respects shared DOB with injectable now', () => {
    const now = new Date('2026-07-31T12:00:00Z');
    assert.strictEqual(birthdayMatch({ dateOfBirth: '2000-07-31' }, 'Asia/Kolkata', now), true);
    assert.strictEqual(birthdayMatch({ birthday: '07-31' }, 'UTC', now), true);
    assert.strictEqual(birthdayMatch({ dob: '2000-01-01' }, 'Asia/Kolkata', now), false);
    assert.strictEqual(birthdayMatch({}, 'Asia/Kolkata', now), false);
    assert.strictEqual(birthdayMatch({ dateOfBirth: 'not-a-date' }, 'Asia/Kolkata', now), false);
  });

  await test('premium upsell placeholder stays inert', async () => {
    const out = await maybeCompanionPremiumUpsellPlaceholder();
    assert.deepStrictEqual(out, { skipped: 'premium_not_designed' });
  });

  console.log('\nAll companion-outreach tests passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
