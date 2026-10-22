/**
 * Party Kit — pure helpers shared by party game cores on the client and the server
 * (forgiving text matching, shuffling). No DOM, no network. UMD: window.PartyCore / require().
 */
/** Game text: the catalog (t) in the browser; the English given here where there is no catalog (server rooms, Node). */
function gtx(key, en, params) {
  const g = typeof globalThis !== 'undefined' ? globalThis : {};
  if (typeof g.t === 'function') {
    const v = g.t(key, params || {});
    if (v && v !== key) return v;
  }
  const val = (k) => {
    const v = params && params[k];
    return v == null ? null : typeof v === 'object' && v.text != null ? v.text : String(v);
  };
  // English ICU {n, plural|selectordinal, one {…} other {…}} for the no-catalog path.
  const s = String(en).replace(/\{(\w+), (plural|selectordinal), ((?:=?\w+ \{(?:[^{}]|\{\{\w+\}\})*\}\s*)+)\}/g, (m, k, type, body) => {
    const n = Number(val(k));
    const cases = {};
    body.replace(/(=?\w+) \{((?:[^{}]|\{\{\w+\}\})*)\}/g, (x, c, txt) => (cases[c] = txt));
    let cat = 'other';
    try {
      cat = new Intl.PluralRules('en', { type: type === 'plural' ? 'cardinal' : 'ordinal' }).select(n);
    } catch (e) {}
    const txt = cases['=' + n] != null ? cases['=' + n] : cases[cat] != null ? cases[cat] : cases.other || '';
    return txt.replace(/#/g, String(n));
  });
  return s.replace(/\{\{(\w+)\}\}/g, (m, k) => (val(k) == null ? m : val(k)));
}

(function (root, factory) {
  const SN = typeof module === 'object' && module.exports ? require('../core/search-normalize.js') : root.SearchNormalize;
  const api = factory(SN);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PartyCore = api;
})(typeof self !== 'undefined' ? self : this, function (SN) {
  'use strict';

  /** Fold (L4 search normalisation), strip Latin accents + punctuation, collapse spaces. Keeps every script. */
  function normalize(s) {
    const raw = String(s == null ? '' : s);
    return (SN && SN.fold ? SN.fold(raw) : raw)
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ')
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

  /** Typos allowed for a Latin target of this length (other scripts must match exactly). */
  function tolerance(target) {
    if (!/^[a-z0-9 ]+$/.test(target)) return 0;
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

  function isHindi(lang) {
    return String(lang || 'en').toLowerCase().indexOf('hi') === 0;
  }

  /**
   * Label in the reader's language. Translations are locale data: only a Hindi reader sees the
   * Hindi label (English when there is none); `both` adds the English after it for that reader.
   */
  function bilingualLabel(item, lang, both) {
    if (!item) return '';
    if (!isHindi(lang) || !item.hi) return item.en || item.hi || '';
    return both && item.en && item.en !== item.hi ? item.hi + ' · ' + item.en : item.hi;
  }

  /** Room content language code ('' = not set: older rooms accept every bundled label). */
  function contentLang(v) {
    const l = String(v == null ? '' : v).toLowerCase().split(/[-_]/)[0];
    return /^[a-z]{2,3}$/.test(l) ? l : '';
  }

  /**
   * Answers a typed guess may match: English (canonical) + the room content language's label + alt spellings.
   * With no content language (older rooms) every bundled label counts, as before.
   */
  function guessLabels(item, lang) {
    if (!item) return [];
    const l = contentLang(lang);
    const local = l ? (l !== 'en' && item[l] ? [item[l]] : []) : [item.hi];
    return [item.en].concat(local, Array.isArray(item.alts) ? item.alts : []).filter(Boolean);
  }

  return { normalize, levenshtein, fuzzyMatch, shuffle, rngOr, bilingualLabel, isHindi, contentLang, guessLabels };
});
