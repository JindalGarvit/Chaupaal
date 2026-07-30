/**
 * Unit tests for Dangal progress · soft streaks · weekly missions (pure).
 * Run: node scripts/test-dangal-progress.js
 */
'use strict';
const assert = require('assert');
const {
  normalizeDangalGameId,
  dangalWeekKey,
  emptyDangalProgress,
  applyDangalSession,
  getDangalMissions,
  markCelebratedMissions,
  summarizeDangalHub,
  isScoreBetter,
  coerceDangalProgress,
} = require('../server-lib/dangal-progress');

async function test(name, fn) {
  await fn();
  console.log(`✓ ${name}`);
}

async function main() {
  await test('normalizeDangalGameId aliases', () => {
    assert.equal(normalizeDangalGameId('Muqabala'), 'quiz');
    assert.equal(normalizeDangalGameId('kakuro'), 'ankjod');
    assert.equal(normalizeDangalGameId('tictactoe'), 'ttt');
    assert.equal(normalizeDangalGameId('chess'), 'chess');
  });

  await test('dangalWeekKey is Monday-based ISO date', () => {
    // 2026-07-29 is Wednesday → week starts 2026-07-27
    assert.equal(dangalWeekKey('2026-07-29'), '2026-07-27');
    assert.equal(dangalWeekKey('2026-07-27'), '2026-07-27');
    assert.equal(dangalWeekKey('2026-07-26'), '2026-07-20');
  });

  await test('win increments streak; loss clears it', () => {
    const clock = { today: '2026-07-29', nowMs: Date.parse('2026-07-29T10:00:00+05:30') };
    let p = emptyDangalProgress(dangalWeekKey(clock.today));
    p = applyDangalSession(p, 'chess', { won: true }, clock);
    assert.equal(p.games.chess.wins, 1);
    assert.equal(p.games.chess.streak, 1);
    p = applyDangalSession(p, 'chess', { won: true }, clock);
    assert.equal(p.games.chess.streak, 2);
    assert.equal(p.games.chess.bestStreak, 2);
    p = applyDangalSession(p, 'chess', { won: false }, clock);
    assert.equal(p.games.chess.losses, 1);
    assert.equal(p.games.chess.streak, 0);
    assert.equal(p.games.chess.bestStreak, 2);
  });

  await test('score-only rush does not count W/L without explicit won', () => {
    const clock = { today: '2026-07-29', nowMs: 1 };
    let p = emptyDangalProgress(dangalWeekKey(clock.today));
    p = applyDangalSession(p, 'rushrunner', { score: 1200 }, clock);
    assert.equal(p.games.rushrunner.played, 1);
    assert.equal(p.games.rushrunner.wins, 0);
    assert.equal(p.games.rushrunner.losses, 0);
    assert.equal(p.games.rushrunner.bestScore, 1200);
    p = applyDangalSession(p, 'rushrunner', { score: 900 }, clock);
    assert.equal(p.games.rushrunner.bestScore, 1200); // higher-better
  });

  await test('lower-better score for ankjod / wordguess', () => {
    assert.equal(isScoreBetter('ankjod', 40, 55), true);
    assert.equal(isScoreBetter('wordguess', 3, 2), false);
    const clock = { today: '2026-07-29', nowMs: 1 };
    let p = emptyDangalProgress(dangalWeekKey(clock.today));
    p = applyDangalSession(p, 'ankjod', { score: 55 }, clock);
    p = applyDangalSession(p, 'ankjod', { score: 40 }, clock);
    assert.equal(p.games.ankjod.bestScore, 40);
  });

  await test('soft day streak continues across consecutive IST days', () => {
    let p = emptyDangalProgress(dangalWeekKey('2026-07-28'));
    p = applyDangalSession(p, 'chess', { won: true }, { today: '2026-07-28', nowMs: 1 });
    assert.equal(p.softDayStreak, 1);
    p = applyDangalSession(p, 'chess', { won: true }, { today: '2026-07-29', nowMs: 2 });
    assert.equal(p.softDayStreak, 2);
    // Same day replay does not inflate soft streak
    p = applyDangalSession(p, 'ttt', { won: true }, { today: '2026-07-29', nowMs: 3 });
    assert.equal(p.softDayStreak, 2);
    // Gap resets
    p = applyDangalSession(p, 'chess', { won: true }, { today: '2026-07-31', nowMs: 4 });
    assert.equal(p.softDayStreak, 1);
  });

  await test('weekly missions track plays, variety, shabd, gotd', () => {
    const clock = { today: '2026-07-29', nowMs: 1 };
    let p = emptyDangalProgress(dangalWeekKey(clock.today));
    p = applyDangalSession(p, 'chess', { won: true }, clock);
    p = applyDangalSession(p, 'wordguess', { score: 4 }, clock);
    p = applyDangalSession(p, 'rushrunner', { score: 10, gotd: true }, clock);
    const missions = getDangalMissions(p);
    const byId = Object.fromEntries(missions.map((m) => [m.id, m]));
    assert.equal(byId.play3.progress, 3);
    assert.equal(byId.variety.progress, 2);
    assert.equal(byId.win1.progress, 1);
    assert.equal(byId.shabd.progress, 1);
    assert.equal(byId.gotd.progress, 1);
    const newly = markCelebratedMissions(p);
    assert.ok(newly.length >= 4);
    assert.equal(markCelebratedMissions(p).length, 0); // idempotent
  });

  await test('week rollover resets mission week bucket', () => {
    let p = emptyDangalProgress(dangalWeekKey('2026-07-29'));
    p = applyDangalSession(p, 'chess', { won: true }, { today: '2026-07-29', nowMs: 1 });
    assert.equal(p.week.plays, 1);
    p = coerceDangalProgress(p, '2026-08-03'); // next Monday week
    assert.equal(p.week.key, '2026-08-03');
    assert.equal(p.week.plays, 0);
  });

  await test('summarizeDangalHub respects snooze-for-today', () => {
    const clock = { today: '2026-07-29', nowMs: 1 };
    let p = emptyDangalProgress(dangalWeekKey(clock.today));
    p = applyDangalSession(p, 'chess', { won: true }, clock);
    p.hideMissionsUntil = '2026-07-29';
    const summary = summarizeDangalHub(p, '2026-07-29');
    assert.equal(summary.hideMissions, true);
    assert.equal(summary.weekPlays, 1);
    assert.equal(summary.softDayStreak, 1);
  });

  console.log('\nAll dangal-progress tests passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
