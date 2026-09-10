/**
 * Shabd Five lexicon API (Prompt 1).
 * Banks live in data/shabd-answers.js + data/shabd-allowed.js.
 * Daily / Practice pick from answers; validation uses allowed Set.
 */
(function (g) {
  'use strict';

  function parseAllowedRaw(raw) {
    const set = new Set();
    if (!raw) return set;
    const parts = String(raw).split('\n');
    for (let i = 0; i < parts.length; i++) {
      const w = parts[i].trim().toUpperCase();
      if (w.length !== 5) continue;
      let ok = true;
      for (let j = 0; j < 5; j++) {
        const c = w.charCodeAt(j);
        if (c < 65 || c > 90) {
          ok = false;
          break;
        }
      }
      if (ok) set.add(w);
    }
    return set;
  }

  function normalizeAnswers(list) {
    const out = [];
    const seen = new Set();
    const src = Array.isArray(list) ? list : [];
    for (let i = 0; i < src.length; i++) {
      const w = String(src[i] || '')
        .trim()
        .toUpperCase();
      if (!/^[A-Z]{5}$/.test(w) || seen.has(w)) continue;
      seen.add(w);
      out.push(w);
    }
    return out;
  }

  const answers = normalizeAnswers(g.SHABD_ANSWERS);
  const allowedSet = parseAllowedRaw(g.SHABD_ALLOWED_RAW);
  for (let i = 0; i < answers.length; i++) {
    if (!allowedSet.has(answers[i])) allowedSet.add(answers[i]);
  }

  // Dev / console assert — never throw in production UI
  (function assertBanks() {
    if (!answers.length) {
      console.warn('[Shabd] answer bank empty');
      return;
    }
    if (!allowedSet.size) {
      console.warn('[Shabd] allowed bank empty');
      return;
    }
    let missing = 0;
    for (let i = 0; i < answers.length; i++) {
      if (!allowedSet.has(answers[i])) missing++;
    }
    if (missing) console.warn('[Shabd] answers missing from allowed:', missing);
  })();

  function shabdDailySeed() {
    const d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }

  function pickShabdAnswer(rng) {
    if (!answers.length) return 'HOUSE';
    const r = typeof rng === 'function' ? rng() : Math.random();
    const x = Math.max(0, Math.min(0.999999, Number(r) || 0));
    return answers[Math.floor(x * answers.length)];
  }

  function shabdPickDaily() {
    const seed = shabdDailySeed();
    let x = Math.sin(seed * 12.9898) * 43758.5453;
    x = x - Math.floor(x);
    return pickShabdAnswer(() => x);
  }

  function isAllowedShabd(word) {
    const w = String(word || '')
      .trim()
      .toUpperCase();
    if (w.length !== 5) return false;
    return allowedSet.has(w);
  }

  function normalizeShabdGuess(word) {
    return String(word || '')
      .trim()
      .toUpperCase();
  }

  g.SHABD_ANSWERS = answers;
  g.SHABD_ALLOWED_SET = allowedSet;
  g.SHABD_ANSWER_COUNT = answers.length;
  g.SHABD_ALLOWED_COUNT = allowedSet.size;
  g.isAllowedShabd = isAllowedShabd;
  g.pickShabdAnswer = pickShabdAnswer;
  g.shabdDailySeed = shabdDailySeed;
  g.shabdPickDaily = shabdPickDaily;
  g.normalizeShabdGuess = normalizeShabdGuess;
})(typeof window !== 'undefined' ? window : globalThis);
