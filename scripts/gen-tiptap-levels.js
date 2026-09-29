#!/usr/bin/env node
/**
 * Tip Tap level generator + validator (Dangal P14).
 *
 *   node scripts/gen-tiptap-levels.js          → writes public/src/js/games/tiptap-levels.js
 *                                               + scripts/data/tiptap-validation.json
 *
 * Every level is a template (objective, blockers, colours) on a fixed seed. A goal-aware greedy
 * bot (15% random moves) plays RUNS deterministic games per level with no move cap; because a run's
 * trajectory doesn't depend on the limit, the move limit (or score target) is chosen so the bot's
 * win rate lands in that level's target band. Stars: 2★ = median winning score, 3★ = 85th percentile.
 * Time-limited levels are calibrated as one move per SECONDS_PER_MOVE seconds.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const SoloCore = require('../public/src/js/games/solo-core.js');
const E = require('../public/src/js/games/tiptap-engine.js');

const COUNT = 150;
const RUNS = 24;
const EPS = 0.15;
const BUDGET = 80;
const SECONDS_PER_MOVE = 2.5;
const MAX_MOVES = 45;

const R = 8;
const C = 8;
const idx = (r, c) => r * C + c;

function band(n) {
  let q = 0.95 - (0.55 * (n - 1)) / (COUNT - 1);
  if (n % 10 === 0) q -= 0.08;
  else if (n % 10 === 1 && n > 1) q += 0.05;
  q = Math.max(0.35, Math.min(0.96, q));
  return { q: Math.round(q * 100) / 100, lo: Math.max(0.25, Math.round((q - 0.12) * 100) / 100), hi: Math.min(1, Math.round((q + 0.12) * 100) / 100) };
}

const PATTERNS = {
  center: (r, c) => r >= 2 && r <= 5 && c >= 2 && c <= 5,
  band: (r) => r === 3 || r === 4,
  ring: (r, c) => r === 0 || r === 7 || c === 0 || c === 7,
  cross: (r, c) => r === 3 || r === 4 || c === 3 || c === 4,
  diamond: (r, c) => Math.abs(2 * r - 7) + Math.abs(2 * c - 7) <= 8,
  corners: (r, c) => (r <= 2 || r >= 5) && (c <= 2 || c >= 5),
  checker: (r, c) => r >= 2 && (r + c) % 2 === 0,
  bottom: (r) => r >= 5,
  top: (r) => r <= 2,
  diag: (r, c) => r === c || r + c === 7,
};
const PATTERN_ORDER = ['center', 'band', 'diag', 'top', 'checker', 'bottom', 'diamond', 'corners', 'cross', 'ring'];

function patternCells(name) {
  const out = [];
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (PATTERNS[name](r, c)) out.push(idx(r, c));
  return out;
}

function lockCells(count, next) {
  const out = new Set();
  let guard = 0;
  while (out.size < count && guard++ < 400) {
    const r = 1 + (next() % 6);
    const c = next() % 4;
    out.add(idx(r, c));
    out.add(idx(r, C - 1 - c));
  }
  return Array.from(out).slice(0, count).sort((a, b) => a - b);
}

function typeFor(n) {
  if (n >= 14 && n % 7 === 0) return 'time';
  if (n <= 5) return ['score', 'color', 'score', 'color', 'score'][n - 1];
  const avail = ['score', 'color', 'tiles'];
  if (n >= 12) avail.push('locks');
  if (n >= 18) avail.push('items');
  if (n >= 30) avail.push('tiles+color', 'locks+items', 'tiles+locks', 'items+color');
  if (n >= 90) avail.push('tiles+items', 'locks+color');
  return avail[(n * 7) % avail.length];
}

function template(n, scale) {
  const d = (n - 1) / (COUNT - 1);
  const seed = SoloCore.levelSeed('tiptap', n);
  const next = SoloCore.stream(seed ^ 0x9e3779b9);
  const type = typeFor(n);
  const colors = n <= 24 ? 5 : n <= 90 ? (n % 3 === 0 ? 6 : 5) : n % 2 === 0 ? 6 : 5;
  const L = { n, seed, rows: R, cols: C, colors, goals: [], tiles: [], locks: [] };
  const parts = type.split('+');
  const k = scale || 1;
  parts.forEach((p, pi) => {
    if (p === 'score' || p === 'time') L.goals.push({ t: 'score', n: 0 });
    else if (p === 'color') {
      const c = (n + pi * 2) % colors;
      L.goals.push({ t: 'color', c, n: Math.max(6, Math.round((12 + d * 20) * k * (parts.length > 1 ? 0.7 : 1))) });
    } else if (p === 'tiles') {
      const pat = PATTERN_ORDER[(n + pi) % PATTERN_ORDER.length];
      let cells = patternCells(pat);
      const keep = Math.max(6, Math.min(cells.length, Math.round(cells.length * Math.min(1, 0.55 + d * 0.6) * k)));
      cells = cells.slice(0, keep);
      L.tiles = cells.map((i) => [i, n > 50 && next() % 3 === 0 ? 2 : 1]);
      L.goals.push({ t: 'tiles', n: L.tiles.length });
    } else if (p === 'locks') {
      const want = Math.max(2, Math.round((4 + d * 12) * k));
      L.locks = lockCells(want + (want % 2), next).filter((i) => !L.tiles.length || true);
      L.goals.push({ t: 'locks', n: L.locks.length });
    } else if (p === 'items') {
      const cnt = Math.max(1, Math.round((2 + (d > 0.5 ? 1 : 0) + (d > 0.8 ? 1 : 0)) * Math.min(1.5, k)));
      L.items = { n: cnt, max: 2 };
      L.goals.push({ t: 'items', n: cnt });
    }
  });
  if (type === 'time') L.time = n % 2 ? 75 : 60;
  else if (type === 'score') L.moves = 20 + (n % 3) * 2 + (d > 0.5 ? 2 : 0);
  return { L, type };
}

function runSeed(L, k) {
  return k === 0 ? L.seed : SoloCore.fnv(L.seed + ':' + k);
}
function botSeed(n, k) {
  return SoloCore.fnv('tiptap-bot:' + n + ':' + k);
}

function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[i];
}

function simulate(L, budget) {
  const runs = [];
  for (let k = 0; k < RUNS; k++) runs.push(E.botRun(L, runSeed(L, k), botSeed(L.n, k), { budget, eps: EPS }));
  return runs;
}

function calibrateGoals(n, b) {
  let scale = 1;
  let best = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    const { L, type } = template(n, scale);
    const runs = simulate(L, BUDGET);
    const done = runs.map((r) => (r.doneAt ? r.doneAt : Infinity)).sort((x, y) => x - y);
    let cap = quantile(done, b.q);
    if ((!Number.isFinite(cap) || cap > MAX_MOVES) && attempt < 7) {
      scale *= 0.8;
      continue;
    }
    if (!Number.isFinite(cap)) cap = BUDGET;
    if (cap < 10 && attempt < 7) {
      scale *= 1.25;
      best = { L, type, runs, cap };
      continue;
    }
    const winAt = (m) => runs.filter((r) => r.doneAt && r.doneAt <= m).length / RUNS;
    while (cap > 5 && winAt(cap) > b.hi) cap--;
    best = { L, type, runs, cap };
    break;
  }
  const { L, type, runs } = best;
  let cap = best.cap;
  cap = Math.max(5, cap);
  const wins = runs.filter((r) => r.doneAt && r.doneAt <= cap);
  const finals = wins.map((r) => r.scoreAtDone + E.POINTS.moveLeft * (cap - r.doneAt)).sort((x, y) => x - y);
  if (L.time) {
    L.time = Math.max(30, Math.round((cap * SECONDS_PER_MOVE) / 5) * 5);
    delete L.moves;
  } else L.moves = cap;
  const s2 = Math.round(quantile(finals, 0.5) / 10) * 10;
  const s3 = Math.max(s2 + 10, Math.round(quantile(finals, 0.85) / 10) * 10);
  L.stars = [0, s2, s3];
  return { L, type, runs, win: wins.length / RUNS, outcomes: runs.map((r) => r.doneAt || 0), cap };
}

function calibrateScore(n, b) {
  const { L, type } = template(n, 1);
  const cap = L.time ? Math.round(L.time / SECONDS_PER_MOVE) : L.moves;
  const runs = simulate(L, cap);
  const finals = runs.map((r) => r.scores[Math.min(cap, r.scores.length) - 1] || 0).sort((x, y) => x - y);
  let target = Math.floor(finals[Math.max(0, Math.floor((1 - b.q) * RUNS))] / 10) * 10;
  const winRate = (t) => finals.filter((f) => f >= t).length / RUNS;
  while (winRate(target) > b.hi) target += 10;
  L.goals = [{ t: 'score', n: target }];
  const winners = finals.filter((f) => f >= target);
  const s2 = Math.max(target + 10, Math.round(quantile(winners, 0.5) / 10) * 10);
  const s3 = Math.max(s2 + 10, Math.round(quantile(winners, 0.85) / 10) * 10);
  L.stars = [target, s2, s3];
  return { L, type, runs, win: winRate(target), outcomes: runs.map((r) => r.scores[Math.min(cap, r.scores.length) - 1] || 0), cap };
}

function main() {
  const t0 = Date.now();
  const levels = [];
  const validation = { runs: RUNS, eps: EPS, budget: BUDGET, secondsPerMove: SECONDS_PER_MOVE, levels: [] };
  for (let n = 1; n <= COUNT; n++) {
    const b = band(n);
    const type = typeFor(n);
    const res = type === 'score' || type === 'time' ? calibrateScore(n, b) : calibrateGoals(n, b);
    const L = res.L;
    const out = { n, seed: L.seed, colors: L.colors, goals: L.goals, stars: L.stars };
    if (L.time) out.time = L.time;
    else out.moves = L.moves;
    if (L.tiles.length) out.tiles = L.tiles;
    if (L.locks.length) out.locks = L.locks;
    if (L.items) out.items = L.items;
    out.band = [b.lo, b.hi];
    out.botWin = Math.round(res.win * 1000) / 1000;
    levels.push(out);
    validation.levels.push({ n, type: res.type, cap: res.cap, win: out.botWin, band: [b.lo, b.hi], outcomes: res.outcomes });
    if (n % 25 === 0) process.stdout.write(`  … ${n} levels (${Math.round((Date.now() - t0) / 1000)} s)\n`);
  }
  const header =
    '/**\n * Tip Tap campaign levels (Dangal P14) — GENERATED by scripts/gen-tiptap-levels.js; do not hand-edit.\n' +
    ` * ${COUNT} levels · each validated by ${RUNS} bot runs (greedy, ${Math.round(EPS * 100)}% random moves) into a win-rate band.\n` +
    ' * Goals: score · color (collect N of a colour) · tiles (clear all jelly) · locks (break all chains) · items (bring down).\n' +
    ` * Time levels (time, seconds) were calibrated at one move per ${SECONDS_PER_MOVE} s. stars = [1★ target, 2★, 3★].\n */\n`;
  const body =
    "(function (root, factory) {\n  const api = factory();\n  if (typeof module === 'object' && module.exports) module.exports = api;\n  else root.TipTapLevels = api;\n})(typeof self !== 'undefined' ? self : this, function () {\n  'use strict';\n  const LEVELS = " +
    JSON.stringify(levels) +
    `;\n  return { version: 1, count: LEVELS.length, runs: ${RUNS}, eps: ${EPS}, levels: LEVELS, get(n) { return LEVELS[n - 1] || null; } };\n});\n`;
  fs.writeFileSync(path.join(__dirname, '../public/src/js/games/tiptap-levels.js'), header + body);
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'data/tiptap-validation.json'), JSON.stringify(validation));
  const inBand = validation.levels.filter((v) => v.win >= v.band[0] - 1e-9 && v.win <= v.band[1] + 1e-9).length;
  const avgWin = validation.levels.reduce((a, v) => a + v.win, 0) / COUNT;
  console.log(`Tip Tap: ${COUNT} levels, ${inBand}/${COUNT} in band, avg bot win ${avgWin.toFixed(3)}, ${Math.round((Date.now() - t0) / 1000)} s`);
  validation.levels.filter((v) => !(v.win >= v.band[0] - 1e-9 && v.win <= v.band[1] + 1e-9)).forEach((v) => console.log('  out of band', v.n, v.type, v.win, v.band));
}

if (require.main === module) main();
module.exports = { band, typeFor, template, runSeed, botSeed, RUNS, EPS, BUDGET, SECONDS_PER_MOVE };
