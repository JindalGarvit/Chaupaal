/**
 * Unit tests for Game of the Day scoring (no Firestore).
 * Run: node scripts/test-game-of-day.js
 */
const assert = require('assert');
const {
  fairnessScore,
  popularityScores,
  isLowEngagement,
  daysSince,
  calendarDateIST,
  KNOWN_GAME_IDS,
  LOW_ENGAGEMENT_MAX_PLAYS,
  LOW_ENGAGEMENT_MIN_AGE_DAYS,
} = require('../server-lib/game-of-day');

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

const now = new Date('2026-07-27T12:00:00+05:30');

test('calendarDateIST uses Asia/Kolkata YYYY-MM-DD', () => {
  assert.strictEqual(calendarDateIST(now), '2026-07-27');
  // UTC evening previous day is still next IST morning for late IST dates;
  // midnight UTC Jul 27 → Jul 27 IST afternoon.
  assert.strictEqual(calendarDateIST(new Date('2026-07-26T20:00:00Z')), '2026-07-27');
});

test('never-featured games get strong fairness boost', () => {
  const never = fairnessScore({ featuredCount: 0, lastFeaturedAt: null }, now);
  const recent = fairnessScore(
    { featuredCount: 2, lastFeaturedAt: new Date(now.getTime() - 3 * 86400000) },
    now
  );
  assert.ok(never > 100, 'never-featured baseline is large');
  assert.ok(never > recent * 10, 'never-featured outranks recent featured');
});

test('fairness declines with featuredCount at same age', () => {
  const ts = new Date(now.getTime() - 30 * 86400000);
  const once = fairnessScore({ featuredCount: 1, lastFeaturedAt: ts }, now);
  const thrice = fairnessScore({ featuredCount: 3, lastFeaturedAt: ts }, now);
  assert.ok(once > thrice);
  assert.ok(Math.abs(once - 30 / 2) < 1e-9);
  assert.ok(Math.abs(thrice - 30 / 4) < 1e-9);
});

test('popularityScores normalize to max likeCount', () => {
  const scores = popularityScores([
    { likeCount: 10 },
    { likeCount: 5 },
    { likeCount: 0 },
    { likeCount: -3 },
  ]);
  assert.deepStrictEqual(scores, [1, 0.5, 0, 0]);
});

test('popularityScores all-zero likes → zeros', () => {
  assert.deepStrictEqual(popularityScores([{ likeCount: 0 }, { likeCount: 0 }]), [0, 0]);
});

test('daysSince missing timestamp uses never-featured fairness days (365)', () => {
  assert.strictEqual(daysSince(null, now), 365);
  assert.ok(daysSince({ toDate: () => new Date(now.getTime() - 2 * 86400000) }, now) >= 1.9);
});

test('low engagement: quiet + old enough', () => {
  const oldQuiet = {
    active: true,
    playCount: LOW_ENGAGEMENT_MAX_PLAYS,
    createdAt: new Date(now.getTime() - (LOW_ENGAGEMENT_MIN_AGE_DAYS + 1) * 86400000),
  };
  assert.strictEqual(isLowEngagement(oldQuiet, now), true);
});

test('low engagement: young games not flagged', () => {
  const young = {
    active: true,
    playCount: 0,
    createdAt: new Date(now.getTime() - 3 * 86400000),
  };
  assert.strictEqual(isLowEngagement(young, now), false);
});

test('low engagement: high plays or inactive skipped', () => {
  const popular = {
    active: true,
    playCount: LOW_ENGAGEMENT_MAX_PLAYS + 1,
    createdAt: new Date(now.getTime() - 100 * 86400000),
  };
  const inactive = {
    active: false,
    playCount: 0,
    createdAt: new Date(now.getTime() - 100 * 86400000),
  };
  assert.strictEqual(isLowEngagement(popular, now), false);
  assert.strictEqual(isLowEngagement(inactive, now), false);
});

test('KNOWN_GAME_IDS includes core dangal set', () => {
  assert.ok(KNOWN_GAME_IDS.includes('chess'));
  assert.ok(KNOWN_GAME_IDS.includes('ludo'));
  assert.ok(KNOWN_GAME_IDS.includes('quiz'));
  assert.ok(!KNOWN_GAME_IDS.includes('hack;drop'));
});

console.log(process.exitCode ? '\nGame of the Day tests failed.' : '\nGame of the Day tests passed.');
