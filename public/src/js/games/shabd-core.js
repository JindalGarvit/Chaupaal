/**
 * Shabd Five core (Dangal P5) — pure rules shared by the client, the server and the tests.
 *
 * - Tiles: greens first, then yellows up to the letter's remaining count (duplicate-safe).
 * - Hard mode: greens stay in place, every revealed letter (green or yellow) must be reused.
 * - Daily: puzzle #1 = 1 Jan 2026 (local calendar day), so it flips at the player's own midnight.
 *   The answer schedule ships encoded (data/shabd-answers.js → SHABD_ANSWERS_ENC); nothing in the
 *   bundle lists which word belongs to which day.
 * - Stats: daily results are a per-day map, so two devices merge by union and the streak is
 *   recomputed, never double-counted. Practice / archive / challenges have separate totals.
 * - Challenge links carry the word encrypted with a per-link salt and a checksum.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ShabdCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LEN = 5;
  const MAX_GUESSES = 6;
  const EPOCH_UTC = Date.UTC(2026, 0, 1);
  const DAY_MS = 86400000;
  const SCHEDULE_SEED = 0x5ab1d5;
  const CHALLENGE_SALT = 'shabd-five-challenge';
  const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';

  const norm = (w) => String(w == null ? '' : w).trim().toUpperCase();
  const isWord = (w) => /^[A-Z]{5}$/.test(w);

  // ---------------------------------------------------------------- tiles

  /** @returns {Array<'correct'|'present'|'absent'>} */
  function evaluate(guess, answer) {
    const g = norm(guess).split('');
    const a = norm(answer).split('');
    const out = new Array(LEN).fill('absent');
    const left = {};
    for (let i = 0; i < LEN; i++) {
      if (g[i] === a[i]) out[i] = 'correct';
      else left[a[i]] = (left[a[i]] || 0) + 1;
    }
    for (let i = 0; i < LEN; i++) {
      if (out[i] === 'correct') continue;
      if (left[g[i]] > 0) {
        out[i] = 'present';
        left[g[i]]--;
      }
    }
    return out;
  }

  const RANK = { absent: 1, present: 2, correct: 3 };
  /** Best state per letter across all rows (keyboard colours). */
  function keyStates(guesses, answer) {
    const keys = {};
    (guesses || []).forEach((g) => {
      const s = evaluate(g, answer);
      norm(g).split('').forEach((l, i) => {
        if (!keys[l] || RANK[s[i]] > RANK[keys[l]]) keys[l] = s[i];
      });
    });
    return keys;
  }

  /** Hard mode: null when legal, else a short reason. */
  function hardModeViolation(guess, prior, answer) {
    const g = norm(guess);
    if (!prior || !prior.length || g.length !== LEN) return null;
    const greens = new Array(LEN).fill(null);
    const need = {};
    prior.forEach((p) => {
      const w = norm(p);
      if (w.length !== LEN) return;
      const s = evaluate(w, answer);
      const cnt = {};
      for (let i = 0; i < LEN; i++) {
        if (s[i] === 'correct') greens[i] = w[i];
        if (s[i] !== 'absent') cnt[w[i]] = (cnt[w[i]] || 0) + 1;
      }
      Object.keys(cnt).forEach((l) => (need[l] = Math.max(need[l] || 0, cnt[l])));
    });
    const ord = ['1st', '2nd', '3rd', '4th', '5th'];
    for (let i = 0; i < LEN; i++) if (greens[i] && g[i] !== greens[i]) return ord[i] + ' letter must be ' + greens[i];
    const have = {};
    for (let i = 0; i < LEN; i++) have[g[i]] = (have[g[i]] || 0) + 1;
    const letters = Object.keys(need).sort();
    for (let i = 0; i < letters.length; i++) {
      const l = letters[i];
      if ((have[l] || 0) < need[l]) return need[l] > 1 ? 'Guess must contain ' + need[l] + '× ' + l : 'Guess must contain ' + l;
    }
    return null;
  }

  // ---------------------------------------------------------------- days

  /** Local calendar day → day number (0 = 1 Jan 2026). Works on any Date-like with getFullYear/… */
  function dayNumber(date) {
    const d = date || new Date();
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
  const puzzleNo = (n) => n + 1;
  /** ms until the next local midnight (for the "next puzzle in" timer). */
  function msToMidnight(date) {
    const d = date || new Date();
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    return Math.max(0, next.getTime() - d.getTime());
  }

  // ---------------------------------------------------------------- encoding

  function fnv(str) {
    let h = 0x811c9dc5;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }
  function stream(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return (t ^ (t >>> 14)) >>> 0;
    };
  }
  function wordToInt(w) {
    let n = 0;
    for (let i = LEN - 1; i >= 0; i--) n = n * 26 + (w.charCodeAt(i) - 65);
    return n;
  }
  function intToWord(n) {
    let s = '';
    for (let i = 0; i < LEN; i++) {
      s += String.fromCharCode(65 + (n % 26));
      n = Math.floor(n / 26);
    }
    return s;
  }
  function pad36(n, w) {
    let s = n.toString(36);
    while (s.length < w) s = '0' + s;
    return s;
  }
  /** Gloss / lookup key that doesn't spell the word. */
  const wordHash = (w) => pad36(fnv('shabd:' + norm(w)), 7);

  function encodeSchedule(words) {
    const ks = stream(SCHEDULE_SEED);
    return words.map((w) => pad36((wordToInt(norm(w)) ^ (ks() & 0xffffff)) >>> 0, 5)).join('');
  }
  function decodeSchedule(enc) {
    const s = String(enc || '');
    const ks = stream(SCHEDULE_SEED);
    const out = [];
    for (let i = 0; i + 5 <= s.length; i += 5) {
      const n = (parseInt(s.slice(i, i + 5), 36) ^ (ks() & 0xffffff)) >>> 0;
      if (n < 11881376) out.push(intToWord(n));
    }
    return out;
  }
  /** Deterministic shuffle so the schedule order isn't alphabetical. */
  function shuffleSchedule(words, seed) {
    const list = words.slice();
    const r = stream(seed == null ? SCHEDULE_SEED ^ 0x9e37 : seed);
    for (let i = list.length - 1; i > 0; i--) {
      const j = r() % (i + 1);
      const t = list[i];
      list[i] = list[j];
      list[j] = t;
    }
    return list;
  }
  function dailyAnswer(n, schedule) {
    const len = (schedule || []).length;
    if (!len) return null;
    return schedule[((n % len) + len) % len];
  }

  // ---------------------------------------------------------------- challenge links

  function randSalt(rng) {
    const r = typeof rng === 'function' ? rng : Math.random;
    let s = '';
    for (let i = 0; i < 3; i++) s += B36[Math.floor(r() * 36)];
    return s;
  }
  /** 10-char token: 3-char salt + the word XOR a salt-derived key, with an 8-bit checksum. */
  function encodeChallenge(word, rng) {
    const w = norm(word);
    if (!isWord(w)) return null;
    const salt = randSalt(rng);
    const key = fnv(CHALLENGE_SALT + ':' + salt);
    const payload = ((wordToInt(w) << 8) | (fnv(w) & 0xff)) >>> 0;
    return salt + pad36((payload ^ key) >>> 0, 7);
  }
  function decodeChallenge(token) {
    const t = String(token || '').toLowerCase();
    if (!/^[0-9a-z]{10}$/.test(t)) return null;
    const key = fnv(CHALLENGE_SALT + ':' + t.slice(0, 3));
    const payload = (parseInt(t.slice(3), 36) ^ key) >>> 0;
    const n = payload >>> 8;
    if (n >= 11881376) return null;
    const w = intToWord(n);
    return (fnv(w) & 0xff) === (payload & 0xff) ? w : null;
  }

  // ---------------------------------------------------------------- share

  const EMOJI = {
    normal: { correct: '🟩', present: '🟨', absent: '⬛' },
    contrast: { correct: '🟧', present: '🟦', absent: '⬛' },
  };
  /** Spoiler-free grid: title line + one emoji row per guess, never letters. */
  function shareGrid(guesses, answer, o) {
    const opt = o || {};
    const e = opt.contrast ? EMOJI.contrast : EMOJI.normal;
    const rows = (guesses || []).map((g) => evaluate(g, answer).map((s) => e[s]).join(''));
    const won = rows.length > 0 && norm(guesses[guesses.length - 1]) === norm(answer);
    const score = (won ? rows.length : 'X') + '/' + MAX_GUESSES + (opt.hard ? '*' : '');
    let title = 'Shabd Five';
    if (opt.mode === 'practice') title += ' · Practice';
    else if (opt.mode === 'challenge') title += ' · Challenge';
    else if (opt.puzzle != null) title += ' #' + opt.puzzle;
    return title + ' ' + score + '\n\n' + rows.join('\n');
  }
  /** Colour rows without letters, for leaderboards and chat cards. */
  const rowCodes = (guesses, answer) =>
    (guesses || []).map((g) => evaluate(g, answer).map((s) => (s === 'correct' ? 'g' : s === 'present' ? 'y' : 'x')).join(''));

  // ---------------------------------------------------------------- stats

  const emptyDist = () => [0, 0, 0, 0, 0, 0];
  function emptyStats() {
    return { v: 2, days: {}, practice: { played: 0, wins: 0, dist: emptyDist() }, updatedAt: 0 };
  }
  function cleanEntry(e) {
    if (!e || typeof e !== 'object') return null;
    const won = !!e.w;
    const g = Math.max(0, Math.min(MAX_GUESSES, Math.floor(Number(e.g) || 0)));
    return { w: won ? 1 : 0, g: won ? Math.max(1, g) : 0, h: e.h ? 1 : 0 };
  }
  function normalizeStats(raw) {
    const s = emptyStats();
    const o = raw && typeof raw === 'object' ? raw : {};
    Object.keys(o.days || {}).forEach((k) => {
      const n = /^-?\d+$/.test(k) ? Number(k) : dayNoFromKey(k);
      const e = cleanEntry(o.days[k]);
      if (n != null && e) s.days[n] = e;
    });
    const p = o.practice || {};
    s.practice.played = Math.max(0, Math.floor(Number(p.played) || 0));
    s.practice.wins = Math.max(0, Math.min(s.practice.played, Math.floor(Number(p.wins) || 0)));
    const d = Array.isArray(p.dist) ? p.dist : Object.values(p.dist || {});
    for (let i = 0; i < 6; i++) s.practice.dist[i] = Math.max(0, Math.floor(Number(d[i]) || 0));
    s.updatedAt = Number(o.updatedAt) || 0;
    return s;
  }
  /** Old Prompt-4 stats ({ days: { 'YYYY-MM-DD': { won, guesses, hard } } }) → v2. */
  function migrateLegacy(old) {
    const s = emptyStats();
    const days = (old && old.days) || {};
    Object.keys(days).forEach((k) => {
      const n = dayNoFromKey(k);
      const e = days[k] || {};
      if (n != null) s.days[n] = cleanEntry({ w: e.won, g: e.guesses, h: e.hard });
    });
    return s;
  }
  /** Idempotent: a day already recorded (this device or another) is never counted twice. */
  function recordDaily(stats, n, r, now) {
    const s = normalizeStats(stats);
    if (s.days[n]) return s;
    s.days[n] = cleanEntry({ w: r && r.won, g: r && r.guesses, h: r && r.hard });
    s.updatedAt = now || Date.now();
    return s;
  }
  function recordPractice(stats, r, now) {
    const s = normalizeStats(stats);
    s.practice.played++;
    if (r && r.won) {
      s.practice.wins++;
      const g = Math.max(1, Math.min(6, Math.floor(Number(r.guesses) || 6)));
      s.practice.dist[g - 1]++;
    }
    s.updatedAt = now || Date.now();
    return s;
  }
  function mergeStats(a, b) {
    const x = normalizeStats(a);
    const y = normalizeStats(b);
    const out = emptyStats();
    Object.keys(y.days).forEach((k) => (out.days[k] = y.days[k]));
    Object.keys(x.days).forEach((k) => (out.days[k] = x.days[k]));
    out.practice.played = Math.max(x.practice.played, y.practice.played);
    out.practice.wins = Math.max(x.practice.wins, y.practice.wins);
    for (let i = 0; i < 6; i++) out.practice.dist[i] = Math.max(x.practice.dist[i], y.practice.dist[i]);
    out.updatedAt = Math.max(x.updatedAt, y.updatedAt);
    return out;
  }
  /** Daily summary relative to today: a streak survives until the end of today even if unplayed. */
  function summary(stats, today) {
    const s = normalizeStats(stats);
    const keys = Object.keys(s.days).map(Number).sort((p, q) => p - q);
    const dist = emptyDist();
    let wins = 0;
    let max = 0;
    let run = 0;
    let prev = null;
    keys.forEach((k) => {
      const e = s.days[k];
      if (e.w) {
        wins++;
        dist[e.g - 1]++;
        run = prev === k - 1 && run > 0 ? run + 1 : 1;
        max = Math.max(max, run);
      } else run = 0;
      prev = k;
    });
    let d = today;
    if (!s.days[d]) d--;
    let streak = 0;
    while (s.days[d] && s.days[d].w) {
      streak++;
      d--;
    }
    const played = keys.length;
    return { played, wins, winPct: played ? Math.round((100 * wins) / played) : 0, streak, maxStreak: max, dist };
  }

  return {
    LEN,
    MAX_GUESSES,
    EPOCH_UTC,
    evaluate,
    keyStates,
    hardModeViolation,
    dayNumber,
    dayKeyOf,
    dayNoFromKey,
    puzzleNo,
    msToMidnight,
    fnv,
    wordHash,
    encodeSchedule,
    decodeSchedule,
    shuffleSchedule,
    dailyAnswer,
    encodeChallenge,
    decodeChallenge,
    shareGrid,
    rowCodes,
    emptyStats,
    normalizeStats,
    migrateLegacy,
    recordDaily,
    recordPractice,
    mergeStats,
    summary,
    isWord,
    norm,
  };
});
