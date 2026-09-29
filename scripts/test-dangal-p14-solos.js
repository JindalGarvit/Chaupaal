#!/usr/bin/env node
/**
 * Dangal P14 — solos pro pass (Tip Tap · Brick Breaker · Kakuro).
 *
 *   progress   legacy-key migration (incl. candyburst_level), merge rule (higher value wins; Kakuro
 *              times lower wins), cross-device sync through the server route
 *   daily      the seed / level / layout / puzzle is identical for everyone on the same date
 *   scores     plausibility accept / reject for every game, one scored Daily attempt, friends boards
 *   Tip Tap    match / cascade / special + every special×special combo fixtures, no-move reshuffle,
 *              all 150 levels re-simulated inside their win-rate band
 *   Brick      no tunnelling at max (and absurd) speed, angle clamp, paddle angle, power-up effects,
 *              60 levels validated
 *   Kakuro     uniqueness of the whole bank + a fresh generated sample per difficulty, grades, solver
 *              correctness, combination helper, hints, the `ankjod` alias + saves
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let failed = 0;
let passed = 0;
function assert(cond, msg) {
  if (cond) {
    passed++;
    return;
  }
  failed++;
  console.error('  ✗ ' + msg);
}
function section(name) {
  console.log('• ' + name);
}

const SoloCore = require('../public/src/js/games/solo-core.js');
const TT = require('../public/src/js/games/tiptap-engine.js');
const TL = require('../public/src/js/games/tiptap-levels.js');
const BE = require('../public/src/js/games/brick-engine.js');
const KC = require('../public/src/js/games/kakuro-core.js');
const KB = require('../public/src/js/games/data/kakuro-bank.js');
const Solo = require('../server-lib/solo-scores.js');
const GenTT = require('./gen-tiptap-levels.js');

// ---------------------------------------------------------------- memory Firestore (Admin-shaped)

function memDb() {
  const store = new Map();
  const apply = (prev, data, merge) => Object.assign(merge ? Object.assign({}, prev || {}) : {}, data);
  const snapOf = (p) => ({ exists: store.has(p), id: p.split('/').pop(), data: () => (store.has(p) ? JSON.parse(JSON.stringify(store.get(p))) : undefined) });
  const docRef = (p) => ({
    path: p,
    id: p.split('/').pop(),
    collection: (c) => colRef(p + '/' + c),
    get: async () => snapOf(p),
    set: async (d, o) => store.set(p, apply(store.get(p), d, o && o.merge)),
  });
  const children = (p) => [...store.keys()].filter((k) => k.startsWith(p + '/') && k.slice(p.length + 1).indexOf('/') < 0);
  const colRef = (p) => {
    const q = (order, lim) => ({
      orderBy: (f, dir) => q({ f, dir }, lim),
      limit: (n) => q(order, n),
      get: async () => {
        let keys = children(p);
        if (order) keys.sort((a, b) => (order.dir === 'desc' ? -1 : 1) * ((store.get(a)[order.f] || 0) - (store.get(b)[order.f] || 0)));
        if (lim) keys = keys.slice(0, lim);
        return { docs: keys.map(snapOf) };
      },
    });
    return Object.assign(q(null, 0), { doc: (id) => docRef(p + '/' + id) });
  };
  return {
    store,
    collection: colRef,
    async runTransaction(fn) {
      const ops = [];
      const out = await fn({ get: (r) => r.get(), set: (r, d, o) => ops.push([r, d, o]) });
      for (const [r, d, o] of ops) await r.set(d, o);
      return out;
    },
    async getAll(...refs) {
      return refs.map((r) => snapOf(r.path));
    },
  };
}

// ---------------------------------------------------------------- helpers

const TT_FILL = (r, c) => ((2 * r + c) % 4) + 1; // colours 1–4, no line of 3 and no move anywhere
function ttBoard() {
  const s = TT.createGame({ rows: 8, cols: 8, colors: 5, moves: 30 }, 12345);
  for (let i = 0; i < 64; i++) {
    s.col[i] = TT_FILL(Math.floor(i / 8), i % 8);
    s.sp[i] = TT.SP.NONE;
    s.lock[i] = 0;
    s.tile[i] = 0;
  }
  s.tilesLeft = 0;
  s.locksLeft = 0;
  return s;
}
const at = (r, c) => r * 8 + c;
const firstClear = (res) => res.events.find((e) => e.t === 'clear');

function ttBotLog(level, seed, eps, stepMs) {
  const s = TT.createGame(level, seed);
  const nx = SoloCore.stream(7);
  const log = [];
  let t = 0;
  while (s.status === 'play' && log.length < 120) {
    const m = TT.botMove(s, nx, eps);
    if (!m) break;
    TT.swap(s, m[0], m[1]);
    t += stepMs;
    log.push([m[0], m[1], t]);
  }
  return { s, log, t };
}

async function main() {
  const now = Date.now();
  const today = SoloCore.dayNumber(new Date(now));

  // ================================================================ progress
  section('progress: legacy migration + merge');
  {
    const legacy = { tiptap_level: '12', candyburst_level: '30', tiptap_best_level: '20', chaupaal_pb_tiptap: '48210' };
    const p = SoloCore.migrateLegacy('tiptap', (k) => (k in legacy ? legacy[k] : null), 150);
    assert(p.level === 30 && p.best === 29 && p.pb.tiptap === 48210 && p.migrated, 'Tip Tap: the higher of tiptap_level / candyburst_level wins, best + PB kept (' + p.level + '/' + p.best + ')');
    const p2 = SoloCore.migrateLegacy('candyburst', (k) => (k === 'candyburst_level' ? '400' : null), 150);
    assert(p2.level === 150, 'legacy level above the campaign is capped at the last level');
    const bb = SoloCore.migrateLegacy('brickbreaker', (k) => ({ chaupaal_bb_campaign_best_level: '7', chaupaal_bb_campaign_level: '5' })[k] || null, 60);
    assert(bb.level === 8, 'Brick Breaker: 7 cleared → level 8 next (' + bb.level + ')');
    const kk = SoloCore.migrateLegacy('kakuro', (k) => ({ chaupaal_pb_ankjod_easy: '95', chaupaal_pb_ankjod_hard: '610' })[k] || null, 10000);
    assert(kk.pb.ankjod_easy === 95 && kk.pb.ankjod_hard === 610, 'Kakuro (via the kakuro alias): per-difficulty best times imported');

    const a = { level: 5, best: 4, stars: { 3: 2, 4: 1 }, bests: {}, pb: { tiptap: 9000 }, settings: { sound: false }, settingsAt: 10, daily: { lastDay: 100, streak: 3, best: 3, played: 3 } };
    const b = { level: 9, best: 8, stars: { 3: 1, 4: 3, 7: 2 }, pb: { tiptap: 12000 }, settings: { sound: true }, settingsAt: 5, daily: { lastDay: 99, streak: 5, best: 5, played: 4 } };
    const m = SoloCore.mergeProgress('tiptap', a, b);
    assert(m.level === 9 && m.best === 8, 'merge: the higher level wins');
    assert(m.stars[3] === 2 && m.stars[4] === 3 && m.stars[7] === 2, 'merge: stars keep the best per level from either device');
    assert(m.pb.tiptap === 12000, 'merge: higher PB wins for score games');
    assert(m.settings.sound === false, 'merge: the most recently changed settings win');
    assert(m.daily.lastDay === 100 && m.daily.best === 5 && m.daily.played === 4, 'merge: newest Daily streak, best streak and plays never shrink');
    const k1 = SoloCore.mergeProgress('ankjod', { bests: { 'easy-1': 90000 }, pb: { ankjod_easy: 90 } }, { bests: { 'easy-1': 60000, 'easy-2': 70000 }, pb: { ankjod_easy: 120 } });
    assert(k1.bests['easy-1'] === 60000 && k1.bests['easy-2'] === 70000 && k1.pb.ankjod_easy === 90, 'merge: Kakuro times — the lower (faster) wins');
    const same = SoloCore.mergeProgress('tiptap', m, m);
    assert(!SoloCore.progressDiffers('tiptap', m, same), 'merge is idempotent (no write loops)');
    const big = { stars: {} };
    for (let i = 0; i < 1100; i++) big.stars['d' + i] = 1;
    assert(Object.keys(SoloCore.normalizeProgress(big).stars).length === 1100, 'progress keeps >1000 solved puzzles (Kakuro bank + Daily history)');
  }

  section('progress: cross-device sync through the server');
  {
    const db = memDb();
    const dev1 = SoloCore.migrateLegacy('tiptap', (k) => ({ candyburst_level: '41' })[k] || null, 150);
    const r1 = await Solo.soloAction(db, 'uA', { op: 'sync', game: 'tiptap', progress: dev1 }, now);
    assert(r1.progress.level === 41, 'device 1 uploads legacy Tip Tap progress (level 41)');
    const dev2 = { level: 3, best: 2, stars: { 1: 3, 2: 1 }, settings: { hints: false }, settingsAt: now };
    const r2 = await Solo.soloAction(db, 'uA', { op: 'sync', game: 'tiptap', progress: dev2 }, now);
    assert(r2.progress.level === 41 && r2.progress.stars[1] === 3 && r2.progress.settings.hints === false, 'device 2 (fresh install, level 3) merges without losing level 41');
    const r3 = await Solo.soloAction(db, 'uA', { op: 'sync', game: 'tiptap', progress: dev1 }, now);
    assert(r3.progress.level === 41 && r3.progress.stars[1] === 3 && r3.progress.stars[2] === 1, 'device 1 receives device 2’s stars on its next sync');
    const other = await Solo.soloAction(db, 'uB', { op: 'sync', game: 'tiptap', progress: {} }, now);
    assert(other.progress.level === 1, 'progress is per account');
    const kk = await Solo.soloAction(db, 'uA', { op: 'sync', game: 'kakuro', progress: { bests: { 'hard-4': 300000 } } }, now);
    assert(kk.game === 'ankjod' && db.store.has('users/uA/soloProgress/ankjod'), 'the kakuro alias syncs into the ankjod record');
  }

  // ================================================================ daily
  section('daily: identical for everyone on the same date');
  {
    const morning = new Date(2026, 8, 29, 0, 5);
    const night = new Date(2026, 8, 29, 23, 55);
    const d = SoloCore.dayNumber(morning);
    assert(d === SoloCore.dayNumber(night) && d === SoloCore.dayNumber(morning.getTime()), 'the day number is fixed from local midnight to midnight');
    assert(SoloCore.dayNumber(new Date(2026, 8, 30, 0, 1)) === d + 1, 'the next Daily starts at local midnight');
    assert(SoloCore.dayKeyOf(d) === '2026-09-29' && SoloCore.dayNoFromKey('2026-09-29') === d, 'day key round-trips');
    ['tiptap', 'brickbreaker', 'ankjod'].forEach((g) => assert(SoloCore.dailySeed(g, d) === SoloCore.dailySeed(g, d) && SoloCore.dailySeed(g, d) !== SoloCore.dailySeed(g, d + 1), g + ': same seed for the same day, a new one tomorrow'));
    assert(JSON.stringify(TT.dailyLevel(d)) === JSON.stringify(TT.dailyLevel(d)) && TT.dailyLevel(d).seed !== TT.dailyLevel(d + 1).seed, 'Tip Tap Daily level is a pure function of the day');
    const a = TT.createGame(TT.dailyLevel(d), TT.dailyLevel(d).seed);
    const b = TT.createGame(TT.dailyLevel(d), TT.dailyLevel(d).seed);
    assert(a.col.join() === b.col.join(), 'two players get the same Tip Tap Daily board');
    assert(JSON.stringify(BE.dailyLayout(d)) === JSON.stringify(BE.dailyLayout(d)), 'Brick Daily layout is a pure function of the day');
    const e1 = Solo.kakuroRows('daily', d);
    assert(e1 && e1.rows.join('/') === Solo.kakuroRows('daily', d).rows.join('/'), 'Kakuro Daily puzzle is a pure function of the day');
    assert(SoloCore.dayOpen(today, now) && SoloCore.dayOpen(today - 1, now) && !SoloCore.dayOpen(today - 3, now), 'server accepts today ±1 day (time zones), not older Dailies');
  }

  // ================================================================ plausibility
  section('scores: plausibility accept / reject');
  {
    const lv = TT.dailyLevel(today);
    const run = ttBotLog(lv, lv.seed, 0.1, 900);
    const board = SoloCore.boardId('tiptap', 'daily', today);
    assert(Solo.verifyRun('tiptap', board, { moves: run.log, score: run.s.score, ms: run.t + 200 }, now).ok, 'Tip Tap Daily: an honest move log replays to the same score → accepted');
    assert(Solo.verifyRun('tiptap', board, { moves: run.log, score: run.s.score + 20, ms: run.t + 200 }, now).reason === 'score-mismatch', 'Tip Tap: an inflated score is rejected');
    assert(Solo.verifyRun('tiptap', board, { moves: run.log, score: run.s.score, ms: 100 }, now).ok === false, 'Tip Tap: impossible timing is rejected');
    assert(Solo.verifyRun('tiptap', board, { moves: run.log.slice(0, 5), score: run.s.score, ms: run.t }, now).ok === false, 'Tip Tap: a truncated log is rejected');
    const L1 = TL.get(1);
    const r1 = ttBotLog(L1, L1.seed, 0, 800);
    const v1 = Solo.verifyRun('tiptap', 'tiptap_level_1', { moves: r1.log, score: r1.s.score, ms: r1.t }, now);
    assert(r1.s.status === 'won' && v1.ok && v1.entry.stars >= 1, 'Tip Tap level 1: a replayed win is accepted with its stars');
    assert(Solo.verifyRun('tiptap', 'tiptap_level_151', { moves: r1.log, score: 1, ms: 99999 }, now).ok === false, 'Tip Tap: unknown levels are rejected');

    const rows = BE.layoutFor(1);
    const cap = BE.breakableCount(rows);
    const max = BE.maxPoints(rows);
    assert(Solo.verifyRun('brickbreaker', 'brickbreaker_level_1', { segs: [{ w: 0, pts: 500, bricks: cap, cleared: true }], score: 500, ms: 60000, stars: 3 }, now).ok, 'Brick level: points within the layout maximum → accepted');
    assert(Solo.verifyRun('brickbreaker', 'brickbreaker_level_1', { segs: [{ w: 0, pts: max + 1, bricks: cap, cleared: true }], score: max + 1, ms: 60000 }, now).reason === 'points', 'Brick: more points than the layout can give → rejected');
    assert(Solo.verifyRun('brickbreaker', 'brickbreaker_level_1', { segs: [{ w: 0, pts: 500, bricks: cap, cleared: true }], score: 500, ms: 200 }, now).reason === 'too-fast', 'Brick: clearing faster than physics allows → rejected');
    assert(Solo.verifyRun('brickbreaker', 'brickbreaker_level_1', { segs: [{ w: 0, pts: 300, bricks: cap - 1, cleared: true }], score: 300, ms: 60000 }, now).ok === false, 'Brick: a "clear" with bricks left is rejected');
    const e0 = BE.endlessLayout(0);
    const e1 = BE.endlessLayout(1);
    assert(
      Solo.verifyRun('brickbreaker', 'brickbreaker_endless', { segs: [{ w: 0, pts: 400, bricks: BE.breakableCount(e0), cleared: true }, { w: 1, pts: 100, bricks: 5, cleared: false }], score: 500, ms: 120000 }, now).ok,
      'Brick Endless: seeded waves in order → accepted'
    );
    assert(Solo.verifyRun('brickbreaker', 'brickbreaker_endless', { segs: [{ w: 1, pts: 100, bricks: 5 }], score: 100, ms: 120000 }, now).reason === 'wave-order', 'Brick Endless: skipping waves is rejected');
    assert(BE.breakableCount(e1) > 0, 'endless waves have breakable bricks');

    const pz = Solo.kakuroRows('kakuro', 'easy-1');
    const digits = KC.solutionString(pz.rows);
    const kb = SoloCore.boardId('ankjod', 'kakuro', 'easy-1');
    const ok = Solo.verifyRun('ankjod', kb, { solution: digits, ms: 90000, hints: 1 }, now);
    assert(ok.ok && ok.entry.rank === -(90000 + SoloCore.HINT_PENALTY_MS), 'Kakuro: a correct grid is accepted; rank = time + 30 s per hint');
    const bad = digits.slice(0, -1) + (digits.slice(-1) === '1' ? '2' : '1');
    assert(Solo.verifyRun('ankjod', kb, { solution: bad, ms: 90000 }, now).reason === 'not-solved', 'Kakuro: a wrong grid is rejected');
    assert(Solo.verifyRun('ankjod', kb, { solution: digits, ms: 1000 }, now).reason === 'too-fast', 'Kakuro: solving faster than 0.4 s per cell is rejected');
    assert(Solo.verifyRun('ankjod', 'ankjod_kakuro_easy-9999', { solution: digits, ms: 90000 }, now).ok === false, 'Kakuro: unknown puzzles are rejected');
    assert(Solo.verifyRun('ankjod', SoloCore.boardId('ankjod', 'daily', today - 5), { solution: digits, ms: 90000 }, now).reason === 'day-closed', 'closed Dailies can’t be ranked');
  }

  section('scores: one scored Daily attempt, friends + global boards, Beat my score');
  {
    const db = memDb();
    db.store.set('users/uA', { name: 'Asha' });
    db.store.set('users/uB', { name: 'Ben' });
    db.store.set('users/uC', { name: 'Cleo' });
    db.store.set('users/uB/following/uA', { at: 1 });
    const pz = Solo.kakuroRows('daily', today);
    const digits = KC.solutionString(pz.rows);
    const cells = digits.length;
    const board = SoloCore.boardId('ankjod', 'daily', today);
    const t0 = now;
    const sA = await Solo.soloAction(db, 'uA', { op: 'daily_start', game: 'ankjod', dayNo: today }, t0);
    assert(sA.scored && sA.token, 'first Daily start of the day is the scored attempt');
    const again = await Solo.soloAction(db, 'uA', { op: 'daily_start', game: 'ankjod', dayNo: today }, t0 + 1000);
    assert(again.scored === false, 'a second start (another device / replay) is practice');
    const msA = cells * 900;
    const subA = await Solo.soloAction(db, 'uA', { op: 'submit', game: 'ankjod', board, run: { solution: digits, ms: msA, hints: 0 }, token: sA.token }, t0 + msA + 2000);
    assert(subA.ranked === true, 'A’s scored Daily is ranked');
    const dupe = await Solo.soloAction(db, 'uA', { op: 'submit', game: 'ankjod', board, run: { solution: digits, ms: msA - 5000, hints: 0 }, token: sA.token }, t0 + msA + 9000);
    assert(dupe.ranked === false && dupe.reason === 'practice', 'a second submission for the same Daily is practice, never ranked');
    const sB = await Solo.soloAction(db, 'uB', { op: 'daily_start', game: 'ankjod', dayNo: today }, t0);
    const lie = await Solo.soloAction(db, 'uB', { op: 'submit', game: 'ankjod', board, run: { solution: digits, ms: cells * 500, hints: 0 }, token: sB.token }, t0 + 1000);
    assert(lie.ranked === false && lie.reason === 'timing', 'a Daily time longer than the time since it started is rejected');
    const sC = await Solo.soloAction(db, 'uC', { op: 'daily_start', game: 'ankjod', dayNo: today }, t0);
    await Solo.soloAction(db, 'uC', { op: 'submit', game: 'ankjod', board, run: { solution: digits, ms: cells * 600, hints: 0 }, token: sC.token }, t0 + cells * 600 + 1000);
    const stolen = await Solo.soloAction(db, 'uB', { op: 'submit', game: 'ankjod', board, run: { solution: digits, ms: cells * 500, hints: 0 }, token: 'nope' }, t0 + cells * 800);
    assert(stolen.ranked === false, 'a wrong token can’t claim the scored attempt');
    const bB = await Solo.soloAction(db, 'uB', { op: 'board', game: 'ankjod', board }, t0 + 99999);
    assert(bB.friends.length === 1 && bB.friends[0].name === 'Asha', 'B’s Friends tab shows the people B follows (A), not strangers');
    assert(bB.top.length === 2 && bB.top[0].name === 'Cleo' && bB.top[1].name === 'Asha', 'Everyone tab ranks by time (fastest first)');
    const prog = (await db.collection('users').doc('uA').collection('soloProgress').doc('ankjod').get()).data().progress;
    assert(prog.daily.lastDay === today && prog.daily.streak >= 1, 'a ranked Daily extends the streak on the account');

    // Beat my score on a numbered puzzle: link carries board + target, the friend's run lands on the same board.
    const kb = SoloCore.boardId('ankjod', 'kakuro', 'medium-7');
    const mz = Solo.kakuroRows('kakuro', 'medium-7');
    const md = KC.solutionString(mz.rows);
    const first = await Solo.soloAction(db, 'uA', { op: 'submit', game: 'ankjod', board: kb, run: { solution: md, ms: 400000, hints: 2 } }, now);
    assert(first.ranked && first.improved, 'A ranks on Medium #7');
    const slower = await Solo.soloAction(db, 'uA', { op: 'submit', game: 'ankjod', board: kb, run: { solution: md, ms: 500000, hints: 0 } }, now);
    assert(slower.ranked && slower.improved === false, 'a slower replay keeps the earlier best');
    await Solo.soloAction(db, 'uB', { op: 'submit', game: 'ankjod', board: kb, run: { solution: md, ms: 380000, hints: 0 } }, now);
    const view = await Solo.soloAction(db, 'uB', { op: 'board', game: 'ankjod', board: kb }, now);
    assert(view.friends[0].name === 'Ben' && view.friends[1].name === 'Asha', 'the challenged friend beats the time and sees both on the Friends board');
    const bad = await Solo.soloAction(db, 'uC', { op: 'submit', game: 'ankjod', board: kb, run: { solution: md.replace(/./, (c) => (c === '1' ? '2' : '1')), ms: 380000 } }, now);
    assert(bad.accepted === false && !db.store.has('soloBoards/' + kb + '/scores/uC'), 'an implausible run is not stored on the board');

    const gameUi = read('public/src/js/games/game-ui.js');
    assert(/\['board', 'lv', 'mode', 'diff', 'day', 'seed', 'n', 'label'\]/.test(gameUi), 'Beat links carry the board params (level / mode / difficulty / day / seed / target label)');
    const hub = read('public/src/js/games/solo-hub.js');
    assert(/buildBeatScoreLink\(gid\(game\), score, \{ extra \}\)/.test(hub) && /type: 'solo_result'/.test(hub) && /postGameScoreStory|openUnifiedShareSheet/.test(hub), 'share: challenge link + Baithak result card + story via the shared share sheet');
    assert(/att\.type\s*===\s*'solo_result'/.test(read('public/src/js/features/baithak-chat.js')), 'Baithak renders the solo result card');
    assert(/params: pending\.params/.test(read('public/src/js/features/dangal-ratings.js')), 'challenge chip launches the exact board the link points at');
  }

  // ================================================================ Tip Tap
  section('Tip Tap: matches, specials, cascades');
  {
    const s0 = ttBoard();
    assert(!TT.hasMove(s0) && TT.findGroups(s0).length === 0, 'fixture filler has no match and no move');
    let s = ttBoard();
    s.col[at(7, 0)] = 0;
    s.col[at(7, 1)] = 0;
    s.col[at(6, 2)] = 0;
    assert(TT.validSwap(s, at(6, 2), at(7, 2)) && !TT.validSwap(s, at(6, 0), at(6, 1)), 'swap validity: only swaps that make a line are allowed');
    assert(TT.swap(s, at(5, 5), at(5, 6)).ok === false && s.movesUsed === 0, 'an invalid swap is undone and costs no move');
    let res = TT.swap(s, at(6, 2), at(7, 2));
    assert(res.ok && firstClear(res).cells.join() === [at(7, 0), at(7, 1), at(7, 2)].join() && !firstClear(res).made.length, 'match 3 clears exactly the three');

    s = ttBoard();
    [at(7, 0), at(7, 1), at(7, 3), at(6, 2)].forEach((i) => (s.col[i] = 0));
    res = TT.swap(s, at(6, 2), at(7, 2));
    let c = firstClear(res);
    assert(c.cells.length === 4 && c.made.length === 1 && c.made[0].sp === TT.SP.H && c.made[0].i === at(7, 2), 'match 4 in a row → row Line on the swapped cell');

    s = ttBoard();
    [at(4, 3), at(5, 3), at(7, 3), at(6, 2)].forEach((i) => (s.col[i] = 0));
    res = TT.swap(s, at(6, 2), at(6, 3));
    c = firstClear(res);
    assert(c.made.length === 1 && c.made[0].sp === TT.SP.V, 'match 4 in a column → column Line');

    s = ttBoard();
    [at(7, 0), at(7, 1), at(7, 3), at(7, 4), at(6, 2)].forEach((i) => (s.col[i] = 0));
    res = TT.swap(s, at(6, 2), at(7, 2));
    c = firstClear(res);
    assert(c.cells.length === 5 && c.made[0].sp === TT.SP.RAINBOW, 'match 5 in a row → Prism (rainbow)');

    // L by swap: column (5,0),(6,0) + row (7,1),(7,2); a 0 slides into the corner (7,0) from (7,… ) side.
    s = ttBoard();
    [at(5, 0), at(6, 0), at(7, 1), at(7, 2)].forEach((i) => (s.col[i] = 0));
    s.col[at(7, 0)] = 3;
    s.col[at(6, 1)] = 0;
    s.col[at(7, 1)] = 3;
    s.col[at(7, 2)] = 0;
    s.col[at(7, 3)] = 0;
    // now row 7 = 3,3,0,0 and (6,1)=0 above (7,1): swapping (6,1)↔(7,1) puts 0 at (7,1) → row (7,1..3) of 3, disjoint from column 0
    assert(TT.findGroups(s).length === 0, 'L fixture starts with no match');
    res = TT.swap(s, at(6, 1), at(7, 1));
    c = firstClear(res);
    assert(res.ok && c.cells.join() === [at(7, 1), at(7, 2), at(7, 3)].join() && !c.made.length, 'a line next to (not touching) another stays a plain match');
    const sl = ttBoard();
    [at(5, 0), at(6, 0), at(7, 0), at(7, 1), at(7, 2)].forEach((i) => (sl.col[i] = 0));
    const gl = TT.findGroups(sl);
    assert(gl.length === 1 && gl[0].kind === TT.SP.BOMB && gl[0].cells.length === 5, 'L shape (3 + 3 sharing a corner) → Bomb');
    const st = ttBoard();
    [at(5, 1), at(6, 1), at(7, 0), at(7, 1), at(7, 2)].forEach((i) => (st.col[i] = 0));
    const gt = TT.findGroups(st);
    assert(gt.length === 1 && gt[0].kind === TT.SP.BOMB, 'T shape → Bomb');
    const s5 = ttBoard();
    [at(3, 4), at(4, 4), at(5, 4), at(6, 4), at(7, 4), at(7, 3), at(7, 5)].forEach((i) => (s5.col[i] = 0));
    const g5 = TT.findGroups(s5);
    assert(g5.length === 1 && g5[0].kind === TT.SP.RAINBOW, 'a 5-line inside a T still makes the Prism (longest line wins)');

    // Cascade: swap (6,2)↔(7,2) clears row 7 c0..c2; columns 0–2 drop one, so (6,1)=3 and the
    // swapped-up 3 land next to (7,3)=3 → a second clear at step 1, scored ×2.
    const sc = ttBoard();
    [at(7, 0), at(7, 1), at(6, 2)].forEach((i) => (sc.col[i] = 0));
    sc.col[at(6, 1)] = 3;
    sc.col[at(7, 2)] = 3;
    sc.col[at(7, 3)] = 3;
    sc.col[at(7, 4)] = 1;
    assert(TT.findGroups(sc).length === 0, 'cascade fixture starts with no match');
    const rc = TT.swap(sc, at(6, 2), at(7, 2));
    const steps = rc.events.filter((e) => e.t === 'clear').map((e) => e.step);
    assert(steps.length >= 1 && steps.every((v, i) => v === i), 'cascades resolve in order: clear → fall → refill → next step');
    const cl = rc.events.filter((e) => e.t === 'clear');
    assert(rc.ok && cl.length >= 2 && cl[1].step === 1, 'a piece falling into a line triggers a cascade step');
    assert(cl.length >= 2 && cl[1].gained >= 3 * TT.POINTS.piece * 2, 'cascade step 2 scores ×2 per piece');
  }

  section('Tip Tap: every special × special combo');
  {
    const place = (s, i, k, sp) => {
      s.col[i] = k;
      s.sp[i] = sp;
    };
    const combos = [
      [TT.SP.H, TT.SP.V, 'line+line', 15],
      [TT.SP.H, TT.SP.H, 'line+line', 15],
      [TT.SP.V, TT.SP.BOMB, 'line+bomb', 8 * 3 + 8 * 3 - 9],
      [TT.SP.BOMB, TT.SP.BOMB, 'bomb+bomb', 25],
    ];
    combos.forEach(([x, y, label, size]) => {
      const s = ttBoard();
      place(s, at(3, 3), 1, x);
      place(s, at(3, 4), 2, y);
      assert(TT.validSwap(s, at(3, 3), at(3, 4)), label + ': two specials can always be swapped');
      const t = TT.cloneState(s);
      TT._swapRaw(t, at(3, 3), at(3, 4));
      const m = TT._comboMarks(t, at(3, 3), at(3, 4));
      assert(m.label === label && m.marks.size === size, label + ' clears ' + size + ' cells (got ' + m.marks.size + ')');
      const r = TT.swap(s, at(3, 3), at(3, 4));
      assert(r.ok && firstClear(r).combo === label && s.made.combo === 1, label + ': a real swap fires the combo');
    });
    const colourCount = (s, k) => s.col.filter((v) => v === k).length;
    {
      const s = ttBoard();
      place(s, at(3, 3), TT.RAINBOW_COL, TT.SP.RAINBOW);
      const k = s.col[at(3, 4)];
      const n = colourCount(s, k);
      const t = TT.cloneState(s);
      TT._swapRaw(t, at(3, 3), at(3, 4));
      const m = TT._comboMarks(t, at(3, 3), at(3, 4));
      assert(m.label === 'rainbow+colour' && m.marks.size === n + 1, 'rainbow+colour clears every piece of that colour');
      assert(TT.validSwap(s, at(3, 3), at(3, 4)), 'a Prism swaps with any colour piece');
    }
    [
      [TT.SP.H, 'rainbow+line'],
      [TT.SP.BOMB, 'rainbow+bomb'],
    ].forEach(([sp, label]) => {
      const s = ttBoard();
      place(s, at(3, 3), TT.RAINBOW_COL, TT.SP.RAINBOW);
      const k = s.col[at(3, 4)];
      s.sp[at(3, 4)] = sp;
      const t = TT.cloneState(s);
      TT._swapRaw(t, at(3, 3), at(3, 4));
      const m = TT._comboMarks(t, at(3, 3), at(3, 4));
      const turned = t.col.map((v, i) => (v === k ? t.sp[i] : -1)).filter((v) => v !== -1);
      assert(m.label === label && turned.every((v) => (sp === TT.SP.BOMB ? v === TT.SP.BOMB : v === TT.SP.H || v === TT.SP.V)), label + ': that colour turns into ' + (sp === TT.SP.BOMB ? 'bombs' : 'lines') + ' and all fire');
      const r = TT.swap(s, at(3, 3), at(3, 4));
      assert(r.ok && firstClear(r).combo === label && firstClear(r).cells.length > turned.length, label + ': the chain clears more than the colour itself');
    });
    {
      const s = ttBoard();
      place(s, at(3, 3), TT.RAINBOW_COL, TT.SP.RAINBOW);
      place(s, at(3, 4), TT.RAINBOW_COL, TT.SP.RAINBOW);
      const t = TT.cloneState(s);
      TT._swapRaw(t, at(3, 3), at(3, 4));
      const m = TT._comboMarks(t, at(3, 3), at(3, 4));
      assert(m.label === 'rainbow+rainbow' && m.marks.size === 64, 'rainbow+rainbow clears the whole board');
    }
    {
      const s = ttBoard();
      place(s, at(3, 3), 1, TT.SP.BOMB);
      s.col[at(3, 5)] = 1;
      s.col[at(3, 6)] = 1;
      s.col[at(2, 4)] = 1;
      const r = TT.swap(s, at(2, 4), at(3, 4));
      const cl = firstClear(r);
      assert(r.ok && cl.fired.some((f) => f.sp === TT.SP.BOMB) && cl.cells.length >= 9, 'a special caught in a match fires too');
    }
    assert(/rainbow\+rainbow/.test(read('public/src/js/dangal/dangal-rules.js')) || /Combos/.test(read('public/src/js/dangal/dangal-rules.js')), 'every combo is documented in the rules sheet');
  }

  section('Tip Tap: no-move reshuffle + determinism');
  {
    // The worst case: a 4-colour board that no shuffle of the same pieces can fix.
    const s = ttBoard();
    s.sp[at(0, 0)] = TT.SP.BOMB;
    s.sp[at(3, 5)] = TT.SP.H;
    const spBefore = s.sp.slice().sort().join();
    const events = [];
    assert(!TT.hasMove(s), 'fixture board is stuck');
    const ok = TT.reshuffle(s, events);
    assert(ok && TT.hasMove(s) && TT.findGroups(s).length === 0, 'reshuffle always leaves a playable board with no pre-made matches');
    assert(events.some((e) => e.t === 'shuffle') && s.shuffles === 1, 'reshuffle emits a visible notice event');
    assert(s.sp.slice().sort().join() === spBefore, 'reshuffle keeps the specials (no free or lost specials)');
    const s2 = ttBoard();
    s2.sp[at(0, 0)] = TT.SP.BOMB;
    s2.sp[at(3, 5)] = TT.SP.H;
    TT.reshuffle(s2, []);
    assert(s2.col.join() === s.col.join(), 'reshuffle is deterministic (replays match on the server)');
    let stuckLeft = 0;
    let piecesKept = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const g = TT.createGame({ rows: 8, cols: 8, colors: 5 + (seed % 2), moves: 30 }, seed);
      const multiset = g.col.slice().sort().join();
      const ev = [];
      TT.reshuffle(g, ev);
      if (!TT.hasMove(g) || TT.findGroups(g).length) stuckLeft++;
      if (ev[0] && ev[0].recolour === false && g.col.slice().sort().join() === multiset) piecesKept++;
    }
    assert(stuckLeft === 0, '300 random reshuffles: never stuck, never pre-matched');
    assert(piecesKept > 150, 'normal boards reshuffle the same pieces (' + piecesKept + '/300)');
    const L = TL.get(20);
    const moves = [];
    const g = TT.createGame(L, L.seed);
    for (let k = 0; k < 12 && g.status === 'play'; k++) {
      const m = TT.hintMove(g);
      if (!m) break;
      TT.swap(g, m[0], m[1]);
      moves.push(m);
    }
    const rp = TT.replay(L, L.seed, moves);
    assert(rp.ok && rp.score === g.score, 'a move log replays to the identical score');
    const snap = TT.createGame(L, L.seed);
    snap.snap = true;
    const plain = TT.createGame(L, L.seed);
    const m0 = TT.hintMove(snap);
    TT.swap(snap, m0[0], m0[1]);
    TT.swap(plain, m0[0], m0[1]);
    assert(snap.score === plain.score && snap.col.join() === plain.col.join(), 'animation snapshots never change the outcome');
  }

  section('Tip Tap: 150 levels, each re-simulated inside its win-rate band');
  {
    assert(TL.count >= 150 && TL.levels.length >= 150, '≥150 levels (' + TL.levels.length + ')');
    const types = new Set();
    let outOfBand = 0;
    let unwinnable = 0;
    let starBad = 0;
    for (const L of TL.levels) {
      const lv = Object.assign({ rows: 8, cols: 8, tiles: [], locks: [] }, L);
      const scoreOnly = L.goals.length === 1 && L.goals[0].t === 'score';
      const cap = L.time ? Math.round(L.time / GenTT.SECONDS_PER_MOVE) : L.moves;
      let wins = 0;
      for (let k = 0; k < GenTT.RUNS; k++) {
        const r = TT.botRun(lv, GenTT.runSeed(L, k), GenTT.botSeed(L.n, k), { budget: scoreOnly ? cap : GenTT.BUDGET, eps: GenTT.EPS });
        if (scoreOnly ? (r.scores[Math.min(cap, r.scores.length) - 1] || 0) >= L.goals[0].n : r.doneAt && r.doneAt <= cap) wins++;
      }
      const rate = wins / GenTT.RUNS;
      if (!(rate >= L.band[0] - 1e-9 && rate <= L.band[1] + 1e-9) || Math.abs(rate - L.botWin) > 1e-3) outOfBand++;
      if (!wins) unwinnable++;
      if (!(L.stars[1] > L.stars[0] && L.stars[2] > L.stars[1])) starBad++;
      L.goals.forEach((g) => types.add(g.t));
      if (L.time) types.add('time');
    }
    assert(outOfBand === 0, 'every level’s bot win rate reproduces and sits in its band (' + outOfBand + ' off)');
    assert(unwinnable === 0, 'no impossible levels');
    assert(starBad === 0, 'star thresholds rise 1★ < 2★ < 3★ on every level');
    ['score', 'color', 'tiles', 'locks', 'items', 'time'].forEach((t) => assert(types.has(t), 'objective present: ' + t));
    const early = TL.levels.slice(0, 20).reduce((a, l) => a + l.botWin, 0) / 20;
    const late = TL.levels.slice(-20).reduce((a, l) => a + l.botWin, 0) / 20;
    assert(early > late + 0.25, 'difficulty curve: early levels are much easier than late ones (' + early.toFixed(2) + ' → ' + late.toFixed(2) + ')');
  }

  // ================================================================ Brick Breaker
  section('Brick Breaker: physics');
  {
    const row = ['1111111111'];
    const s = BE.createGame(row, { seed: 3, level: 1 });
    const br = s.bricks[4];
    const ball = s.balls[0];
    Object.assign(ball, { stuck: false, x: br.x + br.w / 2, y: br.y + br.h + 90, vx: 0, vy: -20000 });
    s.status = 'play';
    BE.step(s, {});
    assert(s.destroyed === 1 && ball.vy > 0 && ball.y > br.y + br.h, 'a ball moving 167 units per tick still hits the brick (no tunnelling)');
    const s2 = BE.createGame(row, { seed: 3, level: 1 });
    const b2 = s2.balls[0];
    Object.assign(b2, { stuck: false, x: s2.bricks[0].x - 30, y: s2.bricks[0].y + s2.bricks[0].h + 40, vx: 9000, vy: -9000 });
    s2.status = 'play';
    BE.step(s2, {});
    assert(s2.destroyed >= 1 && b2.y > s2.bricks[0].y, 'diagonal at absurd speed: hits the row edge instead of passing through');

    // Soak at max speed: the ball never ends up inside a live brick or outside the walls.
    let inside = 0;
    let escaped = 0;
    let flat = 0;
    for (let lvl = 1; lvl <= 12; lvl++) {
      const g = BE.createGame(BE.layoutFor(lvl), { seed: lvl * 31, level: lvl, lives: 99 });
      g.hits = 100000;
      for (let t = 0; t < 120 * 60 && g.status !== 'cleared' && g.status !== 'lost'; t++) {
        BE.step(g, BE.botInput(g));
        for (const b of g.balls) {
          if (b.stuck) continue;
          if (b.x < BE.R - 0.01 || b.x > BE.W - BE.R + 0.01 || b.y < BE.R - 0.01) escaped++;
          for (const k of g.bricks) {
            if (!k.alive) continue;
            const cx = Math.max(k.x, Math.min(b.x, k.x + k.w));
            const cy = Math.max(k.y, Math.min(b.y, k.y + k.h));
            if (Math.hypot(b.x - cx, b.y - cy) < BE.R - 0.5) inside++;
          }
          const sp = Math.hypot(b.vx, b.vy);
          if (sp > 0 && Math.abs(b.vy) < Math.sin(BE.MIN_ANGLE) * sp - 1e-6) flat++;
        }
      }
      assert(BE.speedOf(g) === BE.MAX_SPEED || g.fx.slow > 0, 'speed is capped at the maximum (level ' + lvl + ')');
    }
    assert(inside === 0, 'max-speed soak: ball never inside a brick (' + inside + ')');
    assert(escaped === 0, 'max-speed soak: ball never leaves the walls (' + escaped + ')');
    assert(flat === 0, 'max-speed soak: never flatter than 15° (' + flat + ')');

    const probe = { vx: 500, vy: -2 };
    BE.clampAngle(probe, 400);
    assert(Math.abs(Math.hypot(probe.vx, probe.vy) - 400) < 1e-6 && Math.abs(probe.vy) >= Math.sin(BE.MIN_ANGLE) * 400 - 1e-6, 'angle clamp: a near-horizontal ball is lifted to 15° and keeps its speed');
    const g2 = BE.createGame(row, { seed: 1, level: 1 });
    assert(BE.speedOf(g2) === BE.BASE_SPEED, 'speed curve starts at the base');
    g2.hits = 20;
    assert(BE.speedOf(g2) === BE.BASE_SPEED + 30, 'speed rises 1.5 per brick hit');
    const g9 = BE.createGame(row, { seed: 1, level: 30 });
    assert(BE.speedOf(g9) === BE.BASE_SPEED + 80, 'level adds at most +80 to the base speed');

    const angleAt = (offFrac) => {
      const g = BE.createGame(['U1'], { seed: 1, level: 1 });
      const b = g.balls[0];
      Object.assign(b, { stuck: false, x: g.paddle.x + offFrac * (g.paddle.w / 2), y: g.paddle.y - 30, vx: 0, vy: 300 });
      g.status = 'play';
      for (let t = 0; t < 60; t++) {
        const ev = BE.step(g, {});
        if (ev.some((e) => e.t === 'paddle')) break;
      }
      return (Math.atan2(b.vx, -b.vy) * 180) / Math.PI;
    };
    assert(Math.abs(angleAt(0)) <= 3.001, 'paddle centre sends the ball (almost) straight up — 3° minimum tilt so it can’t bounce vertically forever');
    const edge = angleAt(0.98);
    assert(edge > 50 && edge <= 60.001, 'paddle edge sends it out at up to 60° (' + edge.toFixed(1) + '°)');
    assert(angleAt(-0.5) < -20 && angleAt(0.5) > 20, 'hit position → angle, both sides');
  }

  section('Brick Breaker: bricks + power-ups');
  {
    const w = BE.POWER_WEIGHTS.reduce((a, p) => a + p[1], 0);
    assert(w === 100 && BE.DROP_CHANCE === 0.08, 'power-up weights sum to 100% and the drop chance is 8%');
    const rules = read('public/src/js/dangal/dangal-rules.js');
    BE.POWER_WEIGHTS.forEach(([, pct]) => assert(rules.indexOf(pct + '%') !== -1, 'rules sheet shows the honest ' + pct + '% drop rate'));
    const mk = () => {
      const g = BE.createGame(['1111111111'], { seed: 9, level: 1, lives: 3 });
      BE.launch(g);
      return g;
    };
    let g = mk();
    BE.catchPower(g, { type: 'wide' });
    assert(g.paddle.w === BE.WIDE_W && g.fx.wide === BE.DURATION.wide * BE.TICK, 'Wide: bigger paddle for 12 s');
    for (let t = 0; t < BE.DURATION.wide * BE.TICK; t++) BE.step(g, { paddleX: g.balls[0] ? g.balls[0].x : 160 });
    assert(g.paddle.w === BE.PADDLE_W, 'Wide wears off');
    g = mk();
    const v0 = BE.speedOf(g);
    BE.catchPower(g, { type: 'slow' });
    assert(Math.abs(BE.speedOf(g) - v0 * 0.65) < 1e-9, 'Slow: ball speed ×0.65');
    g = mk();
    const n0 = g.balls.length;
    BE.catchPower(g, { type: 'multi' });
    assert(g.balls.length === n0 + 2, 'Multi-ball: two extra balls');
    g = mk();
    BE.catchPower(g, { type: 'sticky' });
    assert(g.fx.sticky === 3, 'Sticky: the next 3 catches hold the ball');
    g = mk();
    BE.catchPower(g, { type: 'laser' });
    let beams = 0;
    for (let t = 0; t < BE.TICK * 2; t++) {
      BE.step(g, { paddleX: 160 });
      beams += g.events.filter((e) => e.t === 'laser').length;
    }
    assert(g.fx.laser > 0 && beams >= 3, 'Laser: fires automatically while active');
    g = mk();
    g.lives = BE.MAX_LIVES;
    BE.catchPower(g, { type: 'extra' });
    assert(g.lives === BE.MAX_LIVES, 'Extra ball: capped at 5');
    g.lives = 2;
    BE.catchPower(g, { type: 'extra' });
    assert(g.lives === 3, 'Extra ball: +1 in reserve');

    const ex = BE.createGame(['111', '1X1', '111'].map((r) => r + '1111111'), { seed: 2, level: 1 });
    const bomb = ex.bricks.find((b) => b.type === 'X');
    const bb = ex.balls[0];
    Object.assign(bb, { stuck: false, x: bomb.x + bomb.w / 2, y: bomb.y + bomb.h + 1 + BE.R, vx: 0, vy: -200 });
    ex.bricks.filter((b) => b.row === 2 && b.col === 1).forEach((b) => (b.alive = false));
    ex.status = 'play';
    for (let t = 0; t < 10; t++) BE.step(ex, {});
    const around = ex.bricks.filter((b) => Math.abs(b.row - 1) <= 1 && Math.abs(b.col - 1) <= 1);
    assert(around.every((b) => !b.alive), 'Explosive brick breaks its 8 neighbours');
    const un = BE.createGame(['U111111111'], { seed: 2, level: 1 });
    assert(un.breakable === 9, 'Unbreakable bricks don’t count toward clearing');
    const mv = BE.createGame(['MMMMMMMMMM'], { seed: 2, level: 1 });
    const x0 = mv.bricks[0].x;
    for (let t = 0; t < 45; t++) BE.step(mv, {});
    assert(mv.bricks[0].x !== x0 && mv.bricks.every((b) => b.x - b.baseX === mv.bricks[0].x - mv.bricks[0].baseX), 'Moving row slides together');
    const multi = BE.createGame(['3'], { seed: 2, level: 1 });
    assert(multi.bricks[0].hp === 3, 'multi-hit bricks take their number of hits');
  }

  section('Brick Breaker: content');
  {
    const V = require('./data/brick-validation.json');
    assert(BE.CAMPAIGN_COUNT >= 60 && V.levels.length >= 60, '≥60 campaign levels (' + BE.CAMPAIGN_COUNT + ')');
    assert(BE.HANDCRAFTED.length >= 30, 'handcrafted core (' + BE.HANDCRAFTED.length + ') + validated generated levels');
    assert(V.levels.every((l) => l.reach && l.cleared), 'every level was cleared by the validation bot');
    let same = 0;
    for (let n = 1; n <= BE.CAMPAIGN_COUNT; n++) {
      const rows = BE.layoutFor(n);
      if (JSON.stringify(rows) === JSON.stringify(V.levels[n - 1].rows)) same++;
      assert(BE.layoutOk(rows), 'level ' + n + ' layout is well-formed');
    }
    assert(same === BE.CAMPAIGN_COUNT, 'shipped layouts match the validated ones');
    assert(JSON.stringify(BE.endlessLayout(5)) === JSON.stringify(BE.endlessLayout(5)) && JSON.stringify(BE.endlessLayout(5)) !== JSON.stringify(BE.endlessLayout(6)), 'Endless: a seeded layout sequence');
  }

  // ================================================================ Kakuro
  section('Kakuro: uniqueness + grading of the whole bank');
  {
    const want = { easy: 1, medium: 2, hard: 3, expert: 4 };
    let bad = 0;
    let wrongGrade = 0;
    let dims = [99, 0];
    const counts = {};
    for (const d of Object.keys(want)) {
      counts[d] = KB[d].length;
      for (const s of KB[d]) {
        const rows = s.split('/');
        const g = KC.fromRows(rows);
        if (KC.countSolutions(g, 2).count !== 1) bad++;
        if (KC.gradeOf(g) !== want[d]) wrongGrade++;
        dims = [Math.min(dims[0], rows.length, rows[0].length), Math.max(dims[1], rows.length, rows[0].length)];
      }
    }
    let dailyBad = 0;
    for (const e of KB.daily) {
      const at = e.indexOf(':');
      const g = KC.fromRows(e.slice(at + 1).split('/'));
      if (KC.countSolutions(g, 2).count !== 1 || KC.gradeOf(g) !== want[e.slice(0, at)]) dailyBad++;
    }
    assert(counts.easy >= 100 && counts.medium >= 100 && counts.hard >= 80 && counts.expert >= 40, 'bank sizes: ' + JSON.stringify(counts));
    assert(bad === 0, 'every numbered puzzle has exactly one solution (' + bad + ' not)');
    assert(wrongGrade === 0, 'every puzzle needs exactly the techniques of its difficulty (' + wrongGrade + ' off)');
    assert(KB.daily.length >= 365 && dailyBad === 0, KB.daily.length + ' Dailies — all unique and correctly graded');
    assert(dims[0] >= 6 && dims[1] >= 12 && dims[1] <= 14, 'grid sizes span 6×6 to 12×12 (' + dims.join('–') + ')');
  }

  section('Kakuro: freshly generated sample per difficulty');
  {
    const sample = { easy: 20, medium: 20, hard: 8, expert: 2 };
    const want = { easy: 1, medium: 2, hard: 3, expert: 4 };
    Object.keys(sample).forEach((d) => {
      let ok = 0;
      for (let i = 0; i < sample[d]; i++) {
        const p = KC.generate(d, KC.puzzleSeed(d, 90000 + i), { maxAttempts: 200 });
        if (!p) continue;
        const g = KC.fromRows(p.rows);
        if (KC.countSolutions(g, 2).count === 1 && KC.gradeOf(g) === want[d]) ok++;
      }
      assert(ok === sample[d], d + ': ' + ok + '/' + sample[d] + ' generated puzzles unique + graded');
    });
  }

  section('Kakuro: solver, combination helper, hints');
  {
    const two = KC.fromRows(['#XX', 'X12', 'X21']);
    assert(KC.countSolutions(two, 5).count === 2, 'solver finds both answers of an ambiguous 2×2 (so it can prove uniqueness)');
    const rows = KB.easy[0].split('/');
    const digits = KC.solutionString(rows);
    assert(KC.verifySolution(rows, digits) && !KC.verifySolution(rows, digits.slice(1) + digits[0]), 'verifySolution accepts the answer and rejects a shifted one');
    const g = KC.fromRows(rows);
    const ls = KC.logicSolve(g, 4);
    assert(ls.solved, 'logical solver solves a bank puzzle without guessing');
    assert(JSON.stringify(KC.combos(3, 2)) === '[[1,2]]' && JSON.stringify(KC.combos(4, 2)) === '[[1,3]]', 'combos: 3 in 2 = {1,2}; 4 in 2 = {1,3}');
    assert(KC.combos(10, 3).map((x) => x.join('')).sort().join() === '127,136,145,235', 'combos: 10 in 3 lists all four sets');
    assert(JSON.stringify(KC.combos(45, 9)) === '[[1,2,3,4,5,6,7,8,9]]' && KC.combos(46, 9).length === 0, 'combos: 45 in 9 = all digits; impossible sums give none');
    assert(JSON.stringify(KC.combos(10, 3, [7])) === '[[1,2,7]]' && JSON.stringify(KC.combos(10, 3, [], [1])) === '[[2,3,5]]', 'combos respect placed (must) and ruled-out digits');
    const W = rows.length * rows[0].length;
    const empty = new Array(W).fill(0);
    const h = KC.nextHint(rows, empty);
    const sol = [];
    rows.forEach((r) => r.split('').forEach((ch) => sol.push(/[1-9]/.test(ch) ? +ch : 0)));
    assert(h.kind === 'step' && h.digit === sol[h.cell] && typeof h.text === 'string' && h.text.length > 20, 'hint explains a real deduction in words and names the right digit');
    assert(KC.nextHint(rows, empty).text === h.text, 'hint text is deterministic');
    const wrong = empty.slice();
    wrong[h.cell] = h.digit === 9 ? 1 : h.digit + 1;
    assert(KC.nextHint(rows, wrong).kind === 'wrong', 'hint flags a wrong digit before anything else');
    const cand = KC.autoCandidates(rows, empty);
    assert(Array.isArray(cand) && cand.some((c) => Array.isArray(c) && c.length), 'auto-candidates lists possible digits per cell');
  }

  section('Kakuro: the ankjod alias, bank wiring and old saves');
  {
    const store = { ankjod_save_easy: '{"v":1}', chaupaal_pb_ankjod_easy: '88' };
    const reg = [];
    const win = {
      localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => (store[k] = String(v)), removeItem: (k) => delete store[k] },
      registerGame: (gm) => reg.push(gm),
    };
    win.window = win;
    win.self = win;
    const ctx = vm.createContext(win);
    ['public/src/js/games/solo-core.js', 'public/src/js/games/kakuro-core.js', 'public/src/js/games/data/kakuro-bank.js', 'public/src/js/games/ank-jod.js'].forEach((f) => vm.runInContext(read(f), ctx, { filename: f }));
    const D = win.__ankJodDebug;
    const main = reg.find((r) => r.id === 'ankjod');
    const alias = reg.find((r) => r.id === 'kakuro');
    assert(main && main.name === 'Kakuro' && main.meta.aliases.indexOf('kakuro') !== -1, 'registered as ankjod, named Kakuro, kakuro alias');
    assert(alias && alias.meta.aliasOf === 'ankjod' && alias.ratingKey === 'ankjod', 'kakuro alias shares ratings / leaderboards with ankjod');
    assert(win.openKakuro === win.openAnkJod, 'window.openKakuro === window.openAnkJod');
    const p = D.bankPuzzle('medium', 7);
    assert(p.n === 7 && D.packBoardRows(p.board, p.solution).join('/') === KB.medium[6], 'the phone plays exactly the bank puzzle the server verifies (Medium #7)');
    const dp = D.dailyBankPuzzle(today);
    assert(D.packBoardRows(dp.board, dp.solution).join('/') === Solo.kakuroRows('daily', today).rows.join('/') && dp.dailyKey === SoloCore.dayKeyOf(today), 'phone and server agree on today’s Daily Kakuro');
    assert(D.pickPuzzle('expert').difficulty === 'expert' && D.nextNumber('easy') === 1, 'Expert puzzles and numbered progress wired');
    const ank = read('public/src/js/games/ank-jod.js');
    assert(/'ankjod_save_'/.test(ank) && /'ankjod_save_last_diff'/.test(ank), 'in-progress saves keep their ankjod keys');
    assert(/Hub\(\)\.finishDaily\(GAME|H\.finishDaily\(GAME/.test(ank) && /boardId\(GAME, 'kakuro'/.test(ank), 'wins submit to the Daily / numbered boards');
    assert(/openSums/.test(ank) && /autoNotes\('board'\)/.test(ank) && /prefs\.errors/.test(ank) && /prefs\.timer/.test(ank), 'play UX: Sums helper, auto-notes, error-marking setting, hideable timer');
    assert(/openArchive/.test(ank) && /openStats/.test(ank), 'Daily archive + per-difficulty stats');
    assert(/ankjod_expert/.test(read('public/src/js/games/game-ui.js')), 'Expert has its own personal best');
    const pk = read('public/src/js/games/party-kit.js');
    assert(/ankjod: \['games\/kakuro-core\.js', 'games\/data\/kakuro-bank\.js'\]/.test(pk) && /tiptap: \['games\/tiptap-levels\.js'\]/.test(pk), 'Kakuro bank + Tip Tap levels load lazily');
  }

  // ================================================================ product guards
  section('guards: solo only, no dark patterns, one route');
  {
    const files = ['public/src/js/games/arcade.js', 'public/src/js/games/brick-breaker.js', 'public/src/js/games/ank-jod.js', 'public/src/js/games/solo-hub.js'];
    files.forEach((f) => {
      const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
      assert(!/\benergy\b|refill lives|buy (more )?moves|continue for \d|\bstakes?\b|\bwager/i.test(src), f + ': no energy / pay-to-continue / stakes');
    });
    const apiFiles = fs.readdirSync(path.join(ROOT, 'api')).filter((f) => f.endsWith('.js'));
    assert(apiFiles.length === 12, 'api/*.js = 12 (' + apiFiles.length + ')');
    const mc = read('api/media-config.js');
    assert(/action === 'solo'/.test(mc) && /soloAction/.test(mc), 'solo ops folded into /api/media-config');
    const idx = read('public/index.html');
    ['games/solo-core.js', 'games/solo-hub.js', 'games/tiptap-engine.js', 'games/brick-engine.js'].forEach((f) => assert(idx.indexOf(f) !== -1, 'index.html loads ' + f));
    const rules = read('public/src/js/dangal/dangal-rules.js');
    assert(/'campaign', \['campaign', 'daily'\]/.test(rules) && /'campaign', \['campaign', 'endless', 'daily'\]/.test(rules) && /\['easy', 'medium', 'hard', 'expert'\]/.test(rules), 'rules sheets list the new modes + Expert');
    assert(/reducedMotion/.test(read('public/src/js/games/solo-hub.js')) && /\.tt-grid\.is-calm/.test(read('public/src/styles/dangal.css')), 'reduced-motion setting wired');
    assert(/@media \(max-width:380px\)\{\s*\.solo-levels/.test(read('public/src/styles/dangal.css')), '360px layout rules');
  }

  console.log(`\nP14 solos: ${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
