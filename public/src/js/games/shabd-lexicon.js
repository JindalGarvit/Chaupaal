/**
 * Shabd Five lexicon API (Dangal P5).
 * - Guesses: data/shabd-allowed.js (large dictionary) → Set.
 * - Answers: data/shabd-answers.js ships an encoded, shuffled schedule (SHABD_ANSWERS_ENC); it is
 *   decoded here into a closure. Only functions are exported, never the list.
 */
(function (g) {
  'use strict';

  const Core = g.ShabdCore;

  function parseAllowedRaw(raw) {
    const set = new Set();
    String(raw || '')
      .split('\n')
      .forEach((w) => {
        const u = w.trim().toUpperCase();
        if (/^[A-Z]{5}$/.test(u)) set.add(u);
      });
    return set;
  }

  const schedule = Core ? Core.decodeSchedule(g.SHABD_ANSWERS_ENC) : [];
  const answerSet = new Set(schedule);
  const allowedSet = parseAllowedRaw(g.SHABD_ALLOWED_RAW);
  schedule.forEach((w) => allowedSet.add(w));
  if (!schedule.length) console.warn('[Shabd] answer schedule empty');
  try {
    delete g.SHABD_ANSWERS_ENC;
  } catch (e) {
    g.SHABD_ANSWERS_ENC = undefined;
  }

  const norm = (w) => String(w || '').trim().toUpperCase();

  g.ShabdLexicon = {
    answerCount: schedule.length,
    allowedCount: allowedSet.size,
    isAllowed: (w) => allowedSet.has(norm(w)),
    isAnswer: (w) => answerSet.has(norm(w)),
    daily: (n) => (Core ? Core.dailyAnswer(n, schedule) : null),
    random(rng) {
      if (!schedule.length) return 'HOUSE';
      const r = typeof rng === 'function' ? rng() : Math.random();
      return schedule[Math.floor(Math.max(0, Math.min(0.999999, Number(r) || 0)) * schedule.length)];
    },
  };
  g.isAllowedShabd = g.ShabdLexicon.isAllowed;
})(typeof window !== 'undefined' ? window : globalThis);
