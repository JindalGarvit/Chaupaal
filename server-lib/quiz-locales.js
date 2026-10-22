/**
 * Quiz content localisation (Global L5). The bundled bank is English canonical; a language pass
 * translates a curated core subset (CORE_SIZE questions, every category, all difficulties) and the
 * Daily draws from that subset once any language has it, so a translated Daily never mixes in English.
 *
 * Translations live in server-lib/data/quiz-locales/<lang>.json:
 *   { v: 1, lang, items: { <questionId>: { prompt, options: [4, same order as the bank], explanation? } } }
 * and are registered in REGISTRY below with a literal require (so the serverless bundle includes them).
 * Answers are graded by index on the English item, so a translation can never change the correct answer.
 */
'use strict';

const Core = require('../public/src/js/games/quiz-core.js');
const Bank = require('./quiz-bank.js');

const CORE_SIZE = 600;
const CORE_MIN = 500;

/** lang → () => locale JSON. Add a line per finished language pass. */
const REGISTRY = {};

const cache = {};
function data(lang) {
  const l = String(lang || '').toLowerCase().split('-')[0];
  if (!l || l === 'en' || !REGISTRY[l]) return null;
  if (!(l in cache)) {
    try {
      const d = REGISTRY[l]();
      cache[l] = d && d.items ? d : null;
    } catch (e) {
      cache[l] = null;
    }
  }
  return cache[l];
}

function validItem(t) {
  return t && typeof t.prompt === 'string' && t.prompt && Array.isArray(t.options) && t.options.length === 4 && t.options.every((o) => typeof o === 'string' && o);
}

/** Copy of `q` in `lang` when that question is translated; otherwise the English item (flagged). */
function localise(q, lang) {
  if (!q) return q;
  const d = data(lang);
  const tr = d && d.items[q.id];
  if (!validItem(tr)) return lang && String(lang).split('-')[0] !== 'en' ? Object.assign({}, q, { lang: 'en' }) : q;
  return Object.assign({}, q, { prompt: tr.prompt, options: tr.options.slice(), explanation: tr.explanation || q.explanation || '', lang: d.lang || lang });
}

let coreIds = null;
/** Deterministic core subset: CORE_SIZE bundled global questions spread evenly over categories + tiers. */
function coreSubset() {
  if (coreIds) return coreIds;
  const pool = Bank.bank().filter((q) => q.source === 'bundled' && q.locale === 'global');
  const byCat = {};
  pool.forEach((q) => (byCat[q.category] = byCat[q.category] || []).push(q));
  const cats = Object.keys(byCat).sort();
  const per = Math.ceil(CORE_SIZE / Math.max(1, cats.length));
  const out = [];
  cats.forEach((c) => {
    const tiers = [1, 2, 3].map((d) => byCat[c].filter((q) => q.difficulty === d).sort((a, b) => Core.hash('core:' + a.id) - Core.hash('core:' + b.id)));
    const picked = [];
    for (let i = 0; picked.length < per && tiers.some((t) => t.length > i); i++) tiers.forEach((t) => t[i] && picked.length < per && picked.push(t[i]));
    out.push(...picked.map((q) => q.id));
  });
  coreIds = out.slice(0, Math.max(CORE_SIZE, out.length));
  return coreIds;
}

/** Translated core questions for `lang` (0 for English-only languages). */
function coverage(lang) {
  const d = data(lang);
  if (!d) return 0;
  return coreSubset().filter((id) => validItem(d.items[id])).length;
}

function languages() {
  return Object.keys(REGISTRY).filter((l) => coverage(l) >= CORE_MIN);
}

/** "Questions in: <lang>" is offered only once the language pass covers the core subset. */
function available(lang) {
  const l = String(lang || '').toLowerCase().split('-')[0];
  return l === 'en' || coverage(l) >= CORE_MIN;
}

/** Daily pool: the core subset when any translation exists (everyone shares one Daily), else the whole bank. */
function dailyPool(pool) {
  if (!languages().length) return pool;
  const ids = new Set(coreSubset());
  const sub = pool.filter((q) => ids.has(q.id));
  return sub.length >= 10 ? sub : pool;
}

module.exports = { CORE_SIZE, CORE_MIN, REGISTRY, localise, coreSubset, coverage, languages, available, dailyPool };
