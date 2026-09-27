/**
 * Party Kit — pure helpers shared by party game cores on the client and the server
 * (forgiving text matching, shuffling). No DOM, no network. UMD: window.PartyCore / require().
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PartyCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Lowercase, strip accents + punctuation, collapse spaces. Keeps Devanagari. */
  function normalize(s) {
    return String(s == null ? '' : s)
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9\u0900-\u097f]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  const LEADING = /^(the|a|an) /;

  function variants(s) {
    const n = normalize(s);
    if (!n) return [];
    const out = [n, n.replace(LEADING, ''), n.replace(/ /g, '')];
    return out.filter((v, i) => v && out.indexOf(v) === i);
  }

  /** Typos allowed for a Latin target of this length (Devanagari must match exactly). */
  function tolerance(target) {
    if (/[\u0900-\u097f]/.test(target)) return 0;
    const len = target.replace(/ /g, '').length;
    if (len >= 14) return 3;
    if (len >= 8) return 2;
    if (len >= 4) return 1;
    return 0;
  }

  /**
   * Forgiving match of a typed guess against one or more accepted answers.
   * Case, punctuation, spacing, a leading "the", a trailing plural s and small typos are forgiven.
   * @param {string} guess
   * @param {string|string[]} answers
   */
  function fuzzyMatch(guess, answers) {
    const gs = variants(guess);
    if (!gs.length) return false;
    const list = (Array.isArray(answers) ? answers : [answers]).filter(Boolean);
    for (const ans of list) {
      for (const t of variants(ans)) {
        for (const g of gs) {
          if (g === t) return true;
          if (g.replace(/s$/, '') === t.replace(/s$/, '')) return true;
          const tol = tolerance(t);
          if (tol && Math.abs(g.length - t.length) <= tol && levenshtein(g, t) <= tol) return true;
        }
      }
    }
    return false;
  }

  function rngOr(rng) {
    return typeof rng === 'function' ? rng : Math.random;
  }

  /** Fisher–Yates copy. */
  function shuffle(arr, rng) {
    const r = rngOr(rng);
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  /** Label in the reader's language; bilingual shows both (primary first). */
  function bilingualLabel(item, lang, both) {
    if (!item) return '';
    const hi = String(lang || 'en').indexOf('hi') === 0;
    const primary = hi ? item.hi || item.en : item.en || item.hi;
    const secondary = hi ? item.en : item.hi;
    return both && secondary && secondary !== primary ? primary + ' · ' + secondary : primary;
  }

  return { normalize, levenshtein, fuzzyMatch, shuffle, rngOr, bilingualLabel };
});
