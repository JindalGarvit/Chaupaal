/**
 * Solo pro pass shared core (Dangal P14) — pure, shared by the phone and server-lib/solo-scores.js.
 *
 *   Days      dayNumber / dayKeyOf / msToMidnight — local midnight, same epoch as Shabd Five,
 *             so "Daily #N" is the same puzzle for everyone on the same calendar date.
 *   Seeds     fnv / mulberry32 / dailySeed(game, dayNo) — integer-only, identical on every JS engine.
 *   Progress  normalizeProgress / mergeProgress — the higher value always wins; stars/bests union.
 *   Legacy    migrateLegacy(game, get) — reads old localStorage keys (tiptap_level, candyburst_level,
 *             chaupaal_bb_campaign_*, chaupaal_pb_*, ankjod_*) into the progress shape once.
 *   Boards    boardId(game, kind, key) / rankOf — leaderboard ids and a single "higher is better" rank.
 *   Streaks   recordDaily(progress, dayNo) — consecutive local days with a scored Daily.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SoloCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EPOCH_UTC = Date.UTC(2026, 0, 1);
  const DAY_MS = 86400000;
  const GAMES = ['tiptap', 'brickbreaker', 'ankjod'];
  const GAME_ALIASES = { kakuro: 'ankjod', candyburst: 'tiptap', brick: 'brickbreaker' };

  function gameId(g) {
    const id = String(g || '').toLowerCase();
    return GAME_ALIASES[id] || id;
  }
  function isSoloGame(g) {
    return GAMES.indexOf(gameId(g)) !== -1;
  }

  // ---------------------------------------------------------------- days

  function dayNumber(date) {
    const d = date == null ? new Date() : date instanceof Date ? date : new Date(date);
    return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - EPOCH_UTC) / DAY_MS);
  }
  function dayKeyOf(n) {
    return new Date(EPOCH_UTC + n * DAY_MS).toISOString().slice(0, 10);
  }
  function dayNoFromKey(key) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
    if (!m) return null;
    return Math.floor((Date.UTC(+m[1], +m[2] - 1, +m[3]) - EPOCH_UTC) / DAY_MS);
  }
  function msToMidnight(date) {
    const d = date || new Date();
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    return Math.max(0, next.getTime() - d.getTime());
  }
  /** Server "today"; a player's local day is always within ±1 of it. */
  function serverDay(now) {
    const d = new Date(now);
    return Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - EPOCH_UTC) / DAY_MS);
  }
  function dayOpen(dayNo, now) {
    const n = Math.floor(Number(dayNo));
    const today = serverDay(now);
    return Number.isFinite(n) && n >= today - 1 && n <= today + 1;
  }

  // ---------------------------------------------------------------- seeds

  function fnv(str) {
    let h = 0x811c9dc5;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }
  /** mulberry32 — returns a uint32 stream. State is one integer so it can live in game state. */
  function mulberryNext(a) {
    const s = (a + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return { state: s, value: (t ^ (t >>> 14)) >>> 0 };
  }
  function stream(seed) {
    let a = seed >>> 0;
    return function next() {
      const r = mulberryNext(a);
      a = r.state;
      return r.value;
    };
  }
  /** Integer in [0, n). */
  function randInt(next, n) {
    return n <= 1 ? 0 : next() % n;
  }
  function shuffleInPlace(arr, next) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = next() % (i + 1);
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }
  function dailySeed(game, dayNo) {
    return fnv('chaupaal-solo-daily|' + gameId(game) + '|' + Math.floor(Number(dayNo) || 0));
  }
  function levelSeed(game, level) {
    return fnv('chaupaal-solo-level|' + gameId(game) + '|' + Math.floor(Number(level) || 0));
  }

  // ---------------------------------------------------------------- progress

  const LOWER_BETTER_BESTS = { ankjod: true }; // Kakuro bests are solve times (ms)
  const PB_LOWER_BETTER = {
    ankjod: true,
    ankjod_easy: true,
    ankjod_medium: true,
    ankjod_hard: true,
    ankjod_expert: true,
    ankjod_daily: true,
  };

  function num(v, d) {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  }
  function cleanMap(m, lim, maxVal) {
    const out = {};
    if (!m || typeof m !== 'object') return out;
    const keys = Object.keys(m).slice(0, lim || 1500);
    for (let i = 0; i < keys.length; i++) {
      const k = String(keys[i]).slice(0, 40);
      const v = num(m[keys[i]], NaN);
      if (Number.isFinite(v) && v >= 0) out[k] = Math.min(maxVal || 1e9, Math.floor(v));
    }
    return out;
  }
  function cleanSettings(s) {
    const src = s && typeof s === 'object' ? s : {};
    const out = {};
    ['sound', 'haptics', 'reducedMotion', 'hints', 'colorblind', 'timer'].forEach((k) => {
      if (typeof src[k] === 'boolean') out[k] = src[k];
    });
    if (typeof src.sensitivity === 'number' && src.sensitivity >= 0.5 && src.sensitivity <= 2) out.sensitivity = Math.round(src.sensitivity * 100) / 100;
    if (['off', 'mistake', 'check'].indexOf(src.errors) !== -1) out.errors = src.errors;
    return out;
  }
  function cleanStats(s) {
    const out = {};
    if (!s || typeof s !== 'object') return out;
    Object.keys(s)
      .slice(0, 12)
      .forEach((k) => {
        const v = s[k] || {};
        out[String(k).slice(0, 20)] = {
          played: Math.max(0, Math.floor(num(v.played, 0))),
          solved: Math.max(0, Math.floor(num(v.solved, 0))),
          bestMs: v.bestMs ? Math.max(0, Math.floor(num(v.bestMs, 0))) : 0,
          totalMs: Math.max(0, Math.floor(num(v.totalMs, 0))),
        };
      });
    return out;
  }

  function emptyProgress() {
    return { v: 1, level: 1, best: 0, stars: {}, bests: {}, pb: {}, settings: {}, settingsAt: 0, daily: { lastDay: -1, streak: 0, best: 0, played: 0 }, stats: {}, migrated: false, updatedAt: 0 };
  }

  function normalizeProgress(p) {
    const e = emptyProgress();
    if (!p || typeof p !== 'object') return e;
    const d = p.daily || {};
    return {
      v: 1,
      level: Math.max(1, Math.min(10000, Math.floor(num(p.level, 1)))),
      best: Math.max(0, Math.min(10000, Math.floor(num(p.best, 0)))),
      stars: cleanMap(p.stars, 1500, 3),
      bests: cleanMap(p.bests, 1500),
      pb: cleanMap(p.pb, 40),
      settings: cleanSettings(p.settings),
      settingsAt: Math.max(0, num(p.settingsAt, 0)),
      daily: {
        lastDay: Math.floor(num(d.lastDay, -1)),
        streak: Math.max(0, Math.floor(num(d.streak, 0))),
        best: Math.max(0, Math.floor(num(d.best, 0))),
        played: Math.max(0, Math.floor(num(d.played, 0))),
      },
      stats: cleanStats(p.stats),
      migrated: !!p.migrated,
      updatedAt: Math.max(0, num(p.updatedAt, 0)),
    };
  }

  function mergeBestMap(a, b, lowerBetter) {
    const out = Object.assign({}, a);
    Object.keys(b).forEach((k) => {
      if (out[k] == null) out[k] = b[k];
      else out[k] = lowerBetter ? Math.min(out[k], b[k]) : Math.max(out[k], b[k]);
    });
    return out;
  }

  /**
   * Merge two progress records without losing anything: levels/stars/counters take the max,
   * bests take the better value per key, settings follow the most recent edit.
   */
  function mergeProgress(game, a, b) {
    const x = normalizeProgress(a);
    const y = normalizeProgress(b);
    const g = gameId(game);
    const pb = Object.assign({}, x.pb);
    Object.keys(y.pb).forEach((k) => {
      if (pb[k] == null) pb[k] = y.pb[k];
      else pb[k] = PB_LOWER_BETTER[k] ? Math.min(pb[k], y.pb[k]) : Math.max(pb[k], y.pb[k]);
    });
    const stats = Object.assign({}, x.stats);
    Object.keys(y.stats).forEach((k) => {
      const s = stats[k];
      const t = y.stats[k];
      if (!s) stats[k] = t;
      else
        stats[k] = {
          played: Math.max(s.played, t.played),
          solved: Math.max(s.solved, t.solved),
          bestMs: s.bestMs && t.bestMs ? Math.min(s.bestMs, t.bestMs) : s.bestMs || t.bestMs,
          totalMs: Math.max(s.totalMs, t.totalMs),
        };
    });
    let daily;
    if (x.daily.lastDay !== y.daily.lastDay) daily = Object.assign({}, x.daily.lastDay > y.daily.lastDay ? x.daily : y.daily);
    else daily = Object.assign({}, x.daily, { streak: Math.max(x.daily.streak, y.daily.streak) });
    daily.best = Math.max(x.daily.best, y.daily.best, daily.streak);
    daily.played = Math.max(x.daily.played, y.daily.played);
    const newerSettings = y.settingsAt > x.settingsAt ? y : x;
    return {
      v: 1,
      level: Math.max(x.level, y.level),
      best: Math.max(x.best, y.best),
      stars: mergeBestMap(x.stars, y.stars, false),
      bests: mergeBestMap(x.bests, y.bests, !!LOWER_BETTER_BESTS[g]),
      pb,
      settings: Object.assign({}, newerSettings.settings),
      settingsAt: newerSettings.settingsAt,
      daily,
      stats,
      migrated: x.migrated || y.migrated,
      updatedAt: Math.max(x.updatedAt, y.updatedAt),
    };
  }

  /** True when `b` adds anything to `a` (so we only write when something changed). */
  function progressDiffers(game, a, b) {
    return JSON.stringify(mergeProgress(game, a, b)) !== JSON.stringify(mergeProgress(game, a, a));
  }

  // ---------------------------------------------------------------- legacy localStorage

  function intKey(get, key) {
    try {
      const v = parseInt(get(key) || '', 10);
      return Number.isFinite(v) ? v : 0;
    } catch (e) {
      return 0;
    }
  }

  /**
   * One-time import of pre-P14 keys. `get(key)` reads localStorage (or a test snapshot).
   *   tiptap        tiptap_level (next level, 1-based), candyburst_level (older name), tiptap_best_level (highest cleared)
   *   brickbreaker  chaupaal_bb_campaign_level (0-based resume index), chaupaal_bb_campaign_best_level (levels cleared)
   *   ankjod        chaupaal_pb_ankjod_{diff} (best seconds)
   * Personal bests come from chaupaal_pb_* for every game.
   */
  function migrateLegacy(game, get, levelCount) {
    const g = gameId(game);
    const p = emptyProgress();
    const cap = Math.max(1, Math.floor(num(levelCount, 10000)));
    if (g === 'tiptap') {
      const next = Math.max(intKey(get, 'tiptap_level'), intKey(get, 'candyburst_level'), intKey(get, 'tiptap_best_level') + 1, 1);
      p.level = Math.min(cap, next);
      p.best = Math.min(cap, Math.max(intKey(get, 'tiptap_best_level'), next - 1));
      const pb = intKey(get, 'chaupaal_pb_tiptap');
      if (pb > 0) p.pb.tiptap = pb;
    } else if (g === 'brickbreaker') {
      const cleared = Math.max(intKey(get, 'chaupaal_bb_campaign_best_level'), intKey(get, 'chaupaal_bb_campaign_level'));
      p.level = Math.min(cap, cleared + 1);
      p.best = Math.min(cap, cleared);
      const pbc = intKey(get, 'chaupaal_pb_brickbreaker');
      const pbe = intKey(get, 'chaupaal_pb_brickbreaker_endless');
      if (pbc > 0) p.pb.brickbreaker = pbc;
      if (pbe > 0) p.pb.brickbreaker_endless = pbe;
    } else if (g === 'ankjod') {
      ['', '_easy', '_medium', '_hard', '_expert', '_daily'].forEach((suf) => {
        const v = intKey(get, 'chaupaal_pb_ankjod' + suf);
        if (v > 0) p.pb['ankjod' + suf] = v;
      });
    }
    p.migrated = true;
    return p;
  }

  // ---------------------------------------------------------------- boards

  /** kind: 'daily' (key = dayNo) · 'level' (key = level number) · 'endless' · 'kakuro' (key = diff). */
  function boardId(game, kind, key) {
    const g = gameId(game);
    const k = String(kind || 'level');
    const tail = key == null || key === '' ? '' : '_' + String(key).replace(/[^0-9a-z-]/gi, '').slice(0, 24);
    return (g + '_' + k + tail).slice(0, 60);
  }
  function parseBoardId(id) {
    const m = /^(tiptap|brickbreaker|ankjod)_(daily|level|endless|kakuro)(?:_([0-9a-z-]+))?$/i.exec(String(id || ''));
    if (!m) return null;
    return { game: m[1], kind: m[2], key: m[3] == null ? null : m[3] };
  }
  /** Kakuro ranks by time (+30 s per hint); everything else by score. Higher rank is better. */
  const HINT_PENALTY_MS = 30000;
  function rankOf(game, entry) {
    const e = entry || {};
    if (gameId(game) === 'ankjod') return -(Math.max(0, Math.floor(num(e.ms, 0))) + HINT_PENALTY_MS * Math.max(0, Math.floor(num(e.hints, 0))));
    return Math.max(0, Math.floor(num(e.score, 0)));
  }

  // ---------------------------------------------------------------- daily streaks

  function recordDaily(progress, dayNo) {
    const p = normalizeProgress(progress);
    const n = Math.floor(num(dayNo, -1));
    if (n < 0 || n === p.daily.lastDay) return p;
    if (n < p.daily.lastDay) return p;
    const streak = p.daily.lastDay === n - 1 ? p.daily.streak + 1 : 1;
    p.daily = { lastDay: n, streak, best: Math.max(p.daily.best, streak), played: p.daily.played + 1 };
    return p;
  }
  /** Streak as the player sees it today (a missed day shows 0 until they play again). */
  function liveStreak(progress, today) {
    const p = normalizeProgress(progress);
    return p.daily.lastDay >= today - 1 ? p.daily.streak : 0;
  }

  return {
    EPOCH_UTC,
    DAY_MS,
    GAMES,
    HINT_PENALTY_MS,
    gameId,
    isSoloGame,
    dayNumber,
    dayKeyOf,
    dayNoFromKey,
    msToMidnight,
    serverDay,
    dayOpen,
    fnv,
    mulberryNext,
    stream,
    randInt,
    shuffleInPlace,
    dailySeed,
    levelSeed,
    emptyProgress,
    normalizeProgress,
    mergeProgress,
    progressDiffers,
    migrateLegacy,
    boardId,
    parseBoardId,
    rankOf,
    recordDaily,
    liveStreak,
  };
});
