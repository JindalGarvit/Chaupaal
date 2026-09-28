/**
 * Quiz Muqabala core (Dangal P6) — pure rules shared by the client, the server and the tests.
 *
 * - Scoring: correct = 600 + round(400 × time left / time limit); wrong or no answer = 0.
 *   Ties are broken by total answer time (lower wins); unanswered questions count the full limit.
 * - Timing: answer time is measured on the server from the synchronized start time, minus half the
 *   player's median sampled round-trip time (capped at 250 ms) so slow links are not punished.
 * - Options: shuffled once per question per match (same order for every player). The correct index
 *   is never part of a public question; clients only learn it at the reveal.
 * - Daily: the day key is the player's local calendar date, so the set flips at their own midnight.
 * - Difficulty: every item carries an Elo-style rating; players answering it move it up or down.
 * - AI questions start "pending" and follow PROMOTE / RETIRE thresholds below.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QuizCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CATEGORIES = [
    { id: 'gk', label: 'General Knowledge', icon: '💡' },
    { id: 'science', label: 'Science', icon: '🔬' },
    { id: 'geography', label: 'Geography', icon: '🌍' },
    { id: 'history', label: 'History', icon: '🏛️' },
    { id: 'movies', label: 'Movies & TV', icon: '🎬' },
    { id: 'music', label: 'Music', icon: '🎵' },
    { id: 'sports', label: 'Sports', icon: '⚽' },
    { id: 'tech', label: 'Tech', icon: '💻' },
    { id: 'food', label: 'Food', icon: '🍜' },
    { id: 'language', label: 'Language & Words', icon: '🔤' },
    { id: 'art', label: 'Art & Culture', icon: '🎨' },
    { id: 'nature', label: 'Nature', icon: '🌿' },
  ];
  const CATEGORY_IDS = CATEGORIES.map((c) => c.id);
  const REGIONS = [
    { id: 'in', label: 'India' },
    { id: 'us', label: 'United States' },
    { id: 'uk', label: 'United Kingdom' },
  ];

  const SCORE_BASE = 600;
  const SCORE_SPEED = 400;
  const RTT_CAP_MS = 250;
  const TIMING = {
    duel: { questions: 10, questionMs: 15000, readyMs: 1500, revealMs: 4500 },
    party: { questions: 10, questionMs: 20000, readyMs: 2000, revealMs: 6000 },
  };
  const PARTY_LENGTHS = [5, 10, 15, 20];
  const DAILY_COUNT = 10;
  const DAILY_MS = 15000;
  const PRACTICE_MS = 20000;
  const MAX_PENDING_PER_MATCH = 2;
  const SEEN_MEMORY = 400;
  const NEWS_TTL_MS = 14 * 86400000;
  const EPOCH_UTC = Date.UTC(2026, 0, 1);
  const DAY_MS = 86400000;

  /** Pending (AI) items become active after enough clean answers; noisy ones retire. */
  const PROMOTE = { minAnswers: 30, minCorrectRate: 0.15, maxCorrectRate: 0.97, maxReportRate: 0.03 };
  const RETIRE = { minReports: 3, reportRate: 0.1, confirmedReports: 1 };

  const TIER_RATING = { 1: 1300, 2: 1500, 3: 1700 };
  const ITEM_K = 16;

  // ---------------------------------------------------------------- hashing / rng

  function hash(str) {
    let h = 0x811c9dc5;
    const s = String(str == null ? '' : str);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }
  function rng(seed) {
    let a = (typeof seed === 'number' ? seed : hash(seed)) >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, r) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  /** Option permutation for one question in one match — identical for every player. */
  function optionOrder(seed, qid, n) {
    return shuffle(Array.from({ length: n || 4 }, (_, i) => i), rng(hash(String(seed) + ':' + qid)));
  }

  const normText = (s) =>
    String(s == null ? '' : s)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const questionId = (prompt, category) => 'q' + hash(normText(prompt) + '|' + (category || '')).toString(36);

  // ---------------------------------------------------------------- scoring / timing

  function median(xs) {
    const a = (xs || []).filter((x) => Number.isFinite(x) && x >= 0).sort((p, q) => p - q);
    if (!a.length) return 0;
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  /** One-way latency allowance from sampled RTTs: half the median, capped. */
  function rttAllowance(samples) {
    return Math.min(RTT_CAP_MS, Math.round(median(samples) / 2));
  }
  /** Server receive time → fair answer time (ms since the question opened). */
  function answerTime(receivedAt, startAt, samples, limitMs) {
    const raw = Math.max(0, Number(receivedAt) - Number(startAt));
    const t = Math.max(0, raw - rttAllowance(samples));
    return limitMs ? Math.min(limitMs, t) : t;
  }
  function scoreAnswer(correct, ms, limitMs) {
    if (!correct) return 0;
    const lim = Math.max(1, limitMs || TIMING.duel.questionMs);
    const left = Math.max(0, Math.min(1, 1 - (Number(ms) || 0) / lim));
    return SCORE_BASE + Math.round(SCORE_SPEED * left);
  }
  /** Ranking: score desc, then total answer time asc, then uid for stability. */
  function rank(players) {
    return (players || [])
      .slice()
      .sort((a, b) => (b.score || 0) - (a.score || 0) || (a.time || 0) - (b.time || 0) || String(a.uid).localeCompare(String(b.uid)));
  }
  /** 'a' | 'b' | 'draw' for two score lines (score, then time). */
  function headToHead(a, b) {
    if ((a.score || 0) !== (b.score || 0)) return (a.score || 0) > (b.score || 0) ? 'a' : 'b';
    if ((a.time || 0) !== (b.time || 0)) return (a.time || 0) < (b.time || 0) ? 'a' : 'b';
    return 'draw';
  }

  // ---------------------------------------------------------------- difficulty calibration

  const expected = (playerRating, itemRating) => 1 / (1 + Math.pow(10, (itemRating - playerRating) / 400));
  /** Elo step for an item after one answer (item "wins" when the player is wrong). */
  function updateItemRating(itemRating, playerRating, correct, k) {
    const e = expected(playerRating, itemRating);
    return itemRating - (k || ITEM_K) * ((correct ? 1 : 0) - e);
  }
  /** Rating implied by aggregate stats, shrunk toward the prior with 10 virtual answers. */
  function ratingFromStats(answers, correct, prior) {
    const p0 = expected(1500, prior || 1500);
    const n = Math.max(0, answers || 0);
    const p = Math.min(0.98, Math.max(0.02, ((correct || 0) + 10 * p0) / (n + 10)));
    const r = 1500 + 400 * Math.log10((1 - p) / p);
    return Math.round(Math.min(2100, Math.max(900, r)));
  }
  const tierOf = (rating) => (rating < 1400 ? 1 : rating < 1600 ? 2 : 3);
  const difficultyLabel = (tier) => (tier <= 1 ? 'Easy' : tier === 2 ? 'Medium' : 'Hard');
  /** Duel target: items a bit easier than the players' average so ~65% land. */
  const targetRating = (ratings) => {
    const xs = (ratings || []).filter(Number.isFinite);
    const avg = xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 1500;
    return Math.round(avg - 110);
  };

  // ---------------------------------------------------------------- selection

  /**
   * Pick `count` items: skip seen ids, round-robin across categories, prefer ratings near the
   * target, allow at most `maxPending` pending items (never in the Daily set).
   */
  function selectQuestions(pool, opts) {
    const o = opts || {};
    const r = rng(o.seed != null ? o.seed : Date.now());
    const count = Math.max(1, o.count || 10);
    const seen = o.seen instanceof Set ? o.seen : new Set(o.seen || []);
    const cats = (o.categories && o.categories.length ? o.categories : null);
    const maxPending = o.maxPending == null ? MAX_PENDING_PER_MATCH : o.maxPending;
    const target = Number.isFinite(o.target) ? o.target : null;
    const tier = o.difficulty ? Number(o.difficulty) : null;
    const eligible = (q, allowSeen) =>
      q &&
      q.status !== 'retired' &&
      (allowSeen || !seen.has(q.id)) &&
      (!cats || cats.includes(q.category)) &&
      (!tier || q.difficulty === tier);
    let cand = pool.filter((q) => eligible(q, false));
    if (cand.length < count) cand = pool.filter((q) => eligible(q, true));
    const byCat = {};
    for (const q of shuffle(cand, r)) (byCat[q.category] = byCat[q.category] || []).push(q);
    for (const c of Object.keys(byCat)) {
      if (target != null) {
        const key = new Map(byCat[c].map((q) => [q.id, Math.abs((q.rating || 1500) - target) + r() * 60]));
        byCat[c].sort((a, b) => key.get(a.id) - key.get(b.id));
      }
    }
    const order = shuffle(Object.keys(byCat), r);
    const out = [];
    const used = new Set();
    let pending = 0;
    let guard = 0;
    while (out.length < count && order.length && guard++ < count * 50) {
      for (let i = 0; i < order.length && out.length < count; i++) {
        const list = byCat[order[i]];
        while (list.length) {
          const q = list.shift();
          if (used.has(q.id)) continue;
          if (q.status === 'pending') {
            if (pending >= maxPending) continue;
            pending++;
          }
          used.add(q.id);
          out.push(q);
          break;
        }
        if (!list.length) {
          order.splice(i, 1);
          i--;
        }
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- public views

  /** What a client may see before the reveal. Never includes the correct index. */
  function publicQuestion(q, order) {
    const ord = order || q.options.map((_, i) => i);
    return {
      id: q.id,
      prompt: q.prompt,
      options: ord.map((i) => q.options[i]),
      category: q.category,
      difficulty: q.difficulty || tierOf(q.rating || 1500),
    };
  }
  /** Correct index as displayed (after the per-match shuffle). */
  const displayedCorrect = (q, order) => (order || q.options.map((_, i) => i)).indexOf(q.correctIndex);

  // ---------------------------------------------------------------- lifecycle

  /** 'active' | 'pending' | 'retired' after applying promotion / retirement thresholds. */
  function decideStatus(item, now) {
    const it = item || {};
    const st = it.stats || {};
    const answers = st.answers || 0;
    const reports = st.reports || 0;
    const confirmed = st.confirmedReports || 0;
    if (it.status === 'retired') return 'retired';
    if (it.expiresAt && (now || Date.now()) >= it.expiresAt) return 'retired';
    if (confirmed >= RETIRE.confirmedReports) return 'retired';
    if (reports >= RETIRE.minReports && reports / Math.max(1, answers) >= RETIRE.reportRate) return 'retired';
    if (it.status === 'pending') {
      const rate = answers ? (st.correct || 0) / answers : 0;
      if (
        answers >= PROMOTE.minAnswers &&
        rate >= PROMOTE.minCorrectRate &&
        rate <= PROMOTE.maxCorrectRate &&
        confirmed === 0 &&
        reports / answers <= PROMOTE.maxReportRate
      ) {
        return 'active';
      }
      return 'pending';
    }
    return it.status || 'active';
  }

  // ---------------------------------------------------------------- daily

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
  /** Server guard: a claimed local day must be within ±1 of the UTC day (covers all time zones). */
  function validDayKey(key, now) {
    const n = dayNoFromKey(key);
    if (n == null) return false;
    const utc = Math.floor(((now || Date.now()) - EPOCH_UTC) / DAY_MS);
    return Math.abs(n - utc) <= 1;
  }
  const dailySeed = (key) => hash('quiz-daily:' + key);
  /** Daily = same 10 for everyone on that date: active evergreen items, one per category first. */
  function dailySet(pool, key) {
    const active = pool.filter((q) => q.status === 'active' && q.source === 'bundled' && (!q.locale || q.locale === 'global'));
    return selectQuestions(active, { count: DAILY_COUNT, seed: dailySeed(key), maxPending: 0 });
  }
  function msToMidnight(date) {
    const d = date || new Date();
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    return next - d;
  }
  /** Spoiler-free result grid: 🟩 correct, 🟥 wrong, ⬜ no answer. */
  function shareGrid(results) {
    return (results || []).map((r) => (r == null ? '⬜' : r ? '🟩' : '🟥')).join('');
  }

  return {
    CATEGORIES,
    CATEGORY_IDS,
    REGIONS,
    SCORE_BASE,
    SCORE_SPEED,
    RTT_CAP_MS,
    TIMING,
    PARTY_LENGTHS,
    DAILY_COUNT,
    DAILY_MS,
    PRACTICE_MS,
    MAX_PENDING_PER_MATCH,
    SEEN_MEMORY,
    NEWS_TTL_MS,
    PROMOTE,
    RETIRE,
    TIER_RATING,
    hash,
    rng,
    shuffle,
    optionOrder,
    normText,
    questionId,
    median,
    rttAllowance,
    answerTime,
    scoreAnswer,
    rank,
    headToHead,
    expected,
    updateItemRating,
    ratingFromStats,
    tierOf,
    difficultyLabel,
    targetRating,
    selectQuestions,
    publicQuestion,
    displayedCorrect,
    decideStatus,
    dayNumber,
    dayKeyOf,
    dayNoFromKey,
    validDayKey,
    dailySeed,
    dailySet,
    msToMidnight,
    shareGrid,
  };
});
