/**
 * Dangal AI contract — hooks on top of ai.js / ai-config.js, each with a mandatory deterministic
 * fallback. The build and every game work with AI off.
 *
 *   coachExplain({ gameId, situation, move })        → { text, tips[] }
 *     mode 'tip'  { gameId, stats, baseTip }          post-game tip; every number must be in stats
 *     mode 'hint' { gameId, facts, baseText }         Kakuro / Shabd Five deduction in plain English
 *   commentary({ gameId, event, score })             → { line }
 *     streetcricket: { mode:'over', moments, persona } → { lines[] } · { mode:'recap', facts } → { recap }
 *   generateQuestions({ category, count })           → { questions: [{ q, options[4], answer }] }
 *   generateWordPack({ game, theme, count })         → { words[] }
 *   botPersona({ gameId, level, seed })              → { name, style: { aggression, bluff, speed, chattiness } }
 *   rulesQA({ gameId, question, variants })          → { answer, cite[], covered }  (passages built here)
 *   rerankGames({ candidates: [{ id }], ctx })       → { order: [id] }  (a permutation, never new ids)
 *
 * ONE budget layer governs every hook (and the scheduler's quiz pipeline via hookAllowed/recordExternal):
 *   AI_FEATURES_ENABLED === 'true'      master switch (anything else = deterministic everywhere)
 *   AI_JOBS_PAUSED                      pause all Dangal LLM calls (batch jobs + live hooks)
 *   DANGAL_AI_DISABLE=hook,hook|all     per-hook kill switch (names in HOOKS + EXTERNAL_HOOKS)
 *   AI_DAILY_CALL_CAP                   UTC-day global budget; each hook may use HOOK_POLICY.share of it
 *   DANGAL_AI_USER_CAP                  per-user daily calls across hooks (default 30)
 *   DANGAL_AI_HOOK_CAPS=hook:n,…        per-user daily cap override per hook
 *   model tier per hook (HOOK_POLICY.tier → AI_MODEL_FAST / AI_MODEL_BALANCED), per-hook timeout,
 *   cache by input hash. Telemetry per hook per UTC day (calls, AI calls, cache hits, fallbacks,
 *   rejected, errors, est. $) → Firestore dangalAiStats/{day} → admin feedback view=dangal_ai.
 * Every output is JSON-schema checked, grounded and safety filtered; any failure, timeout or missing
 * key → fallback. Callers only ever see { data, source } — never a raw provider error.
 */
'use strict';

const crypto = require('crypto');

const TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX = 500;
/** Rough blended $ per call for the fast tier (telemetry estimate only). */
const COST_PER_CALL_USD = 0.0008;
const COST_BY_TIER = { fast: COST_PER_CALL_USD, balanced: 0.006 };
const STATS_FLUSH_MS = 20000;

const HOOKS = ['coachExplain', 'commentary', 'generateQuestions', 'generateWordPack', 'botPersona', 'rulesQA', 'rerankGames'];
/**
 * Hooks whose answer is read by ONE viewer → asked for in their UI language (cache keyed by lang,
 * English fallback on a wrong-language answer). Everything else (questions, word packs, bot
 * personas, rerank codes, room-wide commentary without ctx.lang) is shared → English canonical.
 */
const VIEWER_TEXT_HOOKS = new Set(['coachExplain', 'commentary', 'rulesQA']);
const AiLang = require('../public/src/js/ai/ai-lang.js');

/**
 * Per-hook policy. userCap = per-user daily LLM calls for that hook; share = fraction of
 * AI_DAILY_CALL_CAP the hook may spend per day. Every live hook runs on the fast tier: short,
 * grounded outputs validated against our own facts don't need a bigger model.
 */
const HOOK_POLICY = {
  coachExplain: { tier: 'fast', userCap: 20, share: 0.3, timeoutMs: 6000 },
  commentary: { tier: 'fast', userCap: 40, share: 0.3, timeoutMs: 6000 },
  generateQuestions: { tier: 'fast', userCap: 4, share: 0.1, timeoutMs: 8000 },
  generateWordPack: { tier: 'fast', userCap: 10, share: 0.15, timeoutMs: 8000 },
  botPersona: { tier: 'fast', userCap: 6, share: 0.05, timeoutMs: 5000 },
  rulesQA: { tier: 'fast', userCap: 15, share: 0.2, timeoutMs: 6000 },
  rerankGames: { tier: 'fast', userCap: 6, share: 0.05, timeoutMs: 4000 },
};
/**
 * Dangal AI spend outside the request hooks, governed by the same switches. The quiz pipeline is the
 * only place the balanced tier is used: its blind fact-check pass needs the stronger model, and it
 * runs from the scheduler only (≤ 24 calls / day).
 */
const EXTERNAL_HOOKS = {
  quizPipeline: { tier: 'fast + balanced verify', userCap: null, share: null, dailyCalls: 24, where: 'server-lib/quiz-ai-pipeline.js (scheduler)' },
};

function parseList(v) {
  return String(v || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Per-hook kill switch: DANGAL_AI_DISABLE=commentary,rulesqa (case-insensitive) or "all". */
function hookDisabled(hook, env) {
  const list = parseList((env || process.env).DANGAL_AI_DISABLE);
  return list.indexOf('all') >= 0 || list.indexOf(String(hook || '').toLowerCase()) >= 0;
}

function hookUserCaps(env) {
  const out = {};
  parseList((env || process.env).DANGAL_AI_HOOK_CAPS).forEach((pair) => {
    const [k, v] = pair.split(':');
    const hook = HOOKS.find((h) => h.toLowerCase() === k);
    if (hook && v != null && v !== '' && isFinite(Number(v))) out[hook] = Math.max(0, Math.floor(Number(v)));
  });
  return out;
}

/** Caps table for docs / admin: hook → { tier, userCap, dailyCap, disabled }. */
function policyTable(env) {
  const e = env || process.env;
  const globalCap = Math.max(0, Number(e.AI_DAILY_CALL_CAP) || 200);
  const over = hookUserCaps(e);
  const rows = {};
  HOOKS.forEach((h) => {
    const p = HOOK_POLICY[h];
    rows[h] = { tier: p.tier, userCap: over[h] != null ? over[h] : p.userCap, dailyCap: Math.max(1, Math.ceil(globalCap * p.share)), timeoutMs: p.timeoutMs, disabled: hookDisabled(h, e) };
  });
  Object.keys(EXTERNAL_HOOKS).forEach((h) => {
    const p = EXTERNAL_HOOKS[h];
    rows[h] = { tier: p.tier, userCap: null, dailyCap: p.dailyCalls, timeoutMs: null, disabled: hookDisabled(h, e), external: true };
  });
  return {
    globalCap,
    enabled: e.AI_FEATURES_ENABLED === 'true',
    paused: e.AI_JOBS_PAUSED === 'true' || e.AI_JOBS_PAUSED === '1',
    provider: String(e.AI_PROVIDER || 'anthropic').toLowerCase(),
    userCap: Math.max(0, Number(e.DANGAL_AI_USER_CAP) || 30),
    hooks: rows,
  };
}

// ─── Safety ────────────────────────────────────────────────────────────────
const UNSAFE = [
  /\bhttps?:\/\//i,
  /\bwww\./i,
  /[\w.+-]+@[\w-]+\.[\w.]+/,
  /\+?\d[\d\s().-]{8,}\d/,
  /\b(kill\s+yourself|kys|suicide|self[-\s]?harm)\b/i,
  /\b(fuck|shit|bitch|cunt|dick|pussy|whore|slut|bastard|nigg|fag|retard)\w*/i,
  /\b(porn|sex|nude|naked|rape)\w*/i,
  /\b(gamble|casino|real money|bet with cash|crypto)\b/i,
];

const WordSafety = require('../public/src/js/dangal/word-safety.js');

function isSafeText(s) {
  const t = String(s == null ? '' : s);
  return !UNSAFE.some((re) => re.test(t)) && !WordSafety.isBlocked(t);
}

function allStrings(v, out) {
  const acc = out || [];
  if (typeof v === 'string') acc.push(v);
  else if (Array.isArray(v)) v.forEach((x) => allStrings(x, acc));
  else if (v && typeof v === 'object') Object.keys(v).forEach((k) => allStrings(v[k], acc));
  return acc;
}

function isSafe(obj) {
  return allStrings(obj).every(isSafeText);
}

// ─── Schemas (strict: unknown shapes are rejected, lengths bounded) ───────
const str = (v, max, min) => typeof v === 'string' && v.trim().length >= (min || 1) && v.length <= max;
const unit = (v) => typeof v === 'number' && isFinite(v) && v >= 0 && v <= 1;

/**
 * Street Cricket commentary modes (input.gameId === 'streetcricket'):
 *   mode 'over'  — { moments[], persona } → { lines: [{ i, line<=140 }] } (≤ 8, i indexes moments,
 *                  every number grounded in that moment's facts)
 *   mode 'recap' — { facts, persona }     → { recap<=320 } (2–3 sentences, numbers grounded)
 * Fallback returns empty lines / recap: clients then show the no-repeat template library.
 */
function cricketMode(input) {
  const i = input || {};
  return String(i.gameId || '') === 'streetcricket' && (i.mode === 'over' || i.mode === 'recap') ? i.mode : '';
}
function cricketCommentary() {
  return require('../public/src/js/games/cricket-commentary.js');
}

/**
 * Party packs (generateWordPack with input.kind — no kind keeps the original { words: string[] }):
 *   kind 'pairs'   Imposter  → { words: [{ w, p }] }  w = word, p = its Undercover partner (related, different)
 *   kind 'titles'  Charades  → { words: [string<=48] }
 *   kind 'prompts' Most Likely To game → { prompts: [string<=120] } (mode 'mlt' | 'nhie') or
 *                  { prompts: [{ a, b }] } (mode 'wyr')
 * Fallbacks sample the bundled global packs (server-lib/party-content.js), never an empty pack.
 *
 * Werewolf narration (commentary with input.gameId 'werewolf', mode 'narrate'):
 *   → { line<=160 } built only from the public facts given; party-content.js adds a gore filter.
 *   Fallback { line: '' } → clients keep the theme's templated narration.
 */
const PACK_KINDS = ['pairs', 'titles', 'prompts'];
function packKind(input) {
  const k = input && input.kind;
  return PACK_KINDS.indexOf(k) >= 0 ? k : '';
}
function distinct(list) {
  return new Set(list.map((x) => String(x).toLowerCase().trim())).size === list.length;
}
function isNarrate(input) {
  return !!input && String(input.gameId || '') === 'werewolf' && input.mode === 'narrate';
}
const NARRATE_MAX = 160;

function assist() {
  return require('../public/src/js/dangal/dangal-assist.js');
}
function coachMode(input) {
  const m = input && input.mode;
  return m === 'tip' || m === 'hint' ? m : '';
}
/** Every number in the output must already be in the facts we sent (no invented stats). */
function numbersGrounded(texts, facts) {
  return assist().numbersGrounded([].concat(texts).join(' '), facts);
}
const RULES_MAX = 320;
/** Five-letter words a Shabd hint may use in plain prose (anything else could be a word suggestion). */
const SHABD_PROSE = ['first', 'third', 'fifth', 'which', 'there', 'these', 'those', 'their', 'where', 'while', 'still', 'could', 'might', 'would', 'about', 'after', 'every', 'never', 'other', 'place', 'right', 'wrong', 'guess', 'words', 'think', 'start', 'least', 'until', 'twice', 'again', 'green', 'amber', 'spots', 'lines', 'means', 'great', 'focus', 'check', 'shows', 'tells', 'below', 'above', 'avoid', 'count', 'reuse', 'known', 'sound', 'vowel', 'leave', 'stays', 'match', 'clues', 'tiles', 'board', 'rules', 'order', 'being', 'since', 'given', 'using', 'times', 'begin'];

const SCHEMAS = {
  coachExplain: (d, input) => {
    if (!(!!d && str(d.text, 280) && Array.isArray(d.tips) && d.tips.length <= 3 && d.tips.every((t) => str(t, 120)))) return false;
    const mode = coachMode(input);
    if (mode === 'tip') return numbersGrounded([d.text].concat(d.tips), (input && input.stats) || {});
    if (mode === 'hint') {
      const facts = (input && input.facts) || {};
      const all = [d.text].concat(d.tips).join(' ');
      // Shabd Five: never name a five-letter word the player hasn't typed (that could be the answer).
      if (String(input.gameId) === 'wordguess') {
        const typed = new Set((facts.guesses || []).map((w) => String(w).toUpperCase()));
        if ((all.match(/\b[A-Za-z]{5}\b/g) || []).some((w) => !typed.has(w.toUpperCase()) && SHABD_PROSE.indexOf(w.toLowerCase()) < 0)) return false;
      }
      return numbersGrounded(all, facts);
    }
    return true;
  },
  rulesQA: (d, input) => {
    if (!d || typeof d.covered !== 'boolean' || !str(d.answer, RULES_MAX) || !Array.isArray(d.cite) || d.cite.length > 3) return false;
    const passages = (input && input.passages) || [];
    if (!d.covered) return true;
    if (!d.cite.length) return false;
    const cited = d.cite.map((id) => passages.find((p) => p.id === id));
    if (cited.some((p) => !p)) return false;
    return numbersGrounded(d.answer, { cited: cited.map((p) => p.h + ' ' + p.body).join(' '), q: input.question || '' });
  },
  rerankGames: (d, input) => {
    const ids = ((input && input.candidates) || []).map((c) => String(c.id));
    return !!d && Array.isArray(d.order) && d.order.length === ids.length && new Set(d.order).size === ids.length && d.order.every((id) => ids.indexOf(String(id)) >= 0);
  },
  commentary: (d, input) => {
    const mode = cricketMode(input);
    if (mode === 'over') return !!cricketCommentary().validateOverLines(d, (input && input.moments) || []);
    if (mode === 'recap') return !!cricketCommentary().validateRecap(d, (input && input.facts) || {});
    if (isNarrate(input)) return !!d && str(d.line, NARRATE_MAX) && Object.keys(d).length === 1;
    return !!d && str(d.line, 140);
  },
  generateQuestions: (d) =>
    !!d &&
    Array.isArray(d.questions) &&
    d.questions.length >= 1 &&
    d.questions.length <= 20 &&
    d.questions.every(
      (q) =>
        q && str(q.q, 200) && Array.isArray(q.options) && q.options.length === 4 && q.options.every((o) => str(o, 80)) &&
        Number.isInteger(q.answer) && q.answer >= 0 && q.answer <= 3 &&
        new Set(q.options.map((o) => o.toLowerCase())).size === 4
    ),
  generateWordPack: (d, input) => {
    const kind = packKind(input);
    if (!d) return false;
    if (kind === 'pairs') {
      return (
        Array.isArray(d.words) && d.words.length >= 4 && d.words.length <= 40 &&
        d.words.every((x) => x && str(x.w, 32) && str(x.p, 32) && x.w.toLowerCase().trim() !== x.p.toLowerCase().trim()) &&
        distinct(d.words.map((x) => x.w))
      );
    }
    if (kind === 'titles') return Array.isArray(d.words) && d.words.length >= 4 && d.words.length <= 40 && d.words.every((w) => str(w, 48)) && distinct(d.words);
    if (kind === 'prompts') {
      if (!Array.isArray(d.prompts) || d.prompts.length < 4 || d.prompts.length > 30) return false;
      if (input.mode === 'wyr') return d.prompts.every((x) => x && str(x.a, 80, 2) && str(x.b, 80, 2) && x.a.toLowerCase() !== x.b.toLowerCase()) && distinct(d.prompts.map((x) => x.a + '|' + x.b));
      return d.prompts.every((x) => str(x, 120, 6)) && distinct(d.prompts);
    }
    return Array.isArray(d.words) && d.words.length >= 4 && d.words.length <= 60 && d.words.every((w) => str(w, 32)) && distinct(d.words);
  },
  botPersona: (d) =>
    !!d && str(d.name, 24) && !!d.style && ['aggression', 'bluff', 'speed', 'chattiness'].every((k) => unit(d.style[k])) &&
    Object.keys(d.style).length === 4,
};

// ─── Deterministic fallbacks ──────────────────────────────────────────────
function hashInt(s) {
  return parseInt(crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 8), 16);
}

function rulesFor(gameId) {
  try {
    return require('../public/src/js/dangal/dangal-rules.js').get(gameId);
  } catch (e) {
    return null;
  }
}

const QUESTION_BANK = [
  { q: 'Which planet is known as the Red Planet?', options: ['Venus', 'Mars', 'Jupiter', 'Mercury'], answer: 1 },
  { q: 'How many continents are there?', options: ['5', '6', '7', '8'], answer: 2 },
  { q: 'What is the largest ocean on Earth?', options: ['Atlantic', 'Indian', 'Arctic', 'Pacific'], answer: 3 },
  { q: 'Which gas do plants take in for photosynthesis?', options: ['Oxygen', 'Carbon dioxide', 'Nitrogen', 'Helium'], answer: 1 },
  { q: 'How many players are on a football (soccer) team on the pitch?', options: ['9', '10', '11', '12'], answer: 2 },
  { q: 'What is the chemical symbol for gold?', options: ['Au', 'Ag', 'Gd', 'Go'], answer: 0 },
  { q: 'Which is the longest river in Africa?', options: ['Congo', 'Niger', 'Nile', 'Zambezi'], answer: 2 },
  { q: 'How many sides does a hexagon have?', options: ['5', '6', '7', '8'], answer: 1 },
  { q: 'Which language has the most native speakers?', options: ['English', 'Spanish', 'Mandarin Chinese', 'Hindi'], answer: 2 },
  { q: 'What does CPU stand for?', options: ['Central Processing Unit', 'Computer Power Unit', 'Core Program Utility', 'Central Print Unit'], answer: 0 },
  { q: 'In which sport is the term "love" used for zero?', options: ['Golf', 'Tennis', 'Cricket', 'Rugby'], answer: 1 },
  { q: 'What is the freezing point of water in Celsius?', options: ['0°', '32°', '-10°', '100°'], answer: 0 },
];

const WORD_PACKS = {
  default: ['Beach', 'Library', 'Airport', 'Birthday', 'Volcano', 'Pizza', 'Guitar', 'Rainbow', 'Castle', 'Penguin', 'Rocket', 'Umbrella'],
  scribble: ['Cat', 'House', 'Tree', 'Bicycle', 'Moon', 'Fish', 'Clock', 'Kite', 'Robot', 'Cake', 'Train', 'Flower'],
  charades: ['Swimming', 'Brushing teeth', 'Superhero', 'Cooking', 'Driving', 'Dancing', 'Fishing', 'Sleeping', 'Painting', 'Surfing'],
  imposter: ['Beach', 'Hospital', 'School', 'Cinema', 'Zoo', 'Museum', 'Bakery', 'Stadium', 'Farm', 'Space station'],
};

const COMMENTARY = {
  win: ['What a finish!', 'That seals it!', 'A deserved win.'],
  loss: ['Tough one — rematch?', 'So close this time.', 'They edged it.'],
  draw: ['All square!', 'Nobody could break through.'],
  goal: ['It’s in!', 'Back of the net!'],
  save: ['Brilliant save!', 'Kept out!'],
  capture: ['Big capture!', 'That changes things.'],
  streak: ['On a roll!', 'Can anyone stop this?'],
  default: ['Game on!', 'Here we go.'],
};

const PERSONA_NAMES = ['Ava', 'Leo', 'Maya', 'Kai', 'Zoe', 'Omar', 'Nina', 'Sam', 'Iris', 'Theo'];
const LEVEL_STYLE = {
  beginner: { aggression: 0.3, bluff: 0.1, speed: 0.4, chattiness: 0.5 },
  easy: { aggression: 0.3, bluff: 0.1, speed: 0.4, chattiness: 0.5 },
  regular: { aggression: 0.5, bluff: 0.3, speed: 0.6, chattiness: 0.4 },
  medium: { aggression: 0.5, bluff: 0.3, speed: 0.6, chattiness: 0.4 },
  shark: { aggression: 0.75, bluff: 0.5, speed: 0.8, chattiness: 0.2 },
  hard: { aggression: 0.75, bluff: 0.5, speed: 0.8, chattiness: 0.2 },
};

/** Chess bot personas: style only, always labelled as a bot (never a fake human name). */
const CHESS_PERSONAS = {
  aggressive: { name: 'Aggressive Bot', style: { aggression: 0.85, bluff: 0.4, speed: 0.7, chattiness: 0.3 } },
  solid: { name: 'Solid Bot', style: { aggression: 0.3, bluff: 0.1, speed: 0.5, chattiness: 0.2 } },
  tricky: { name: 'Tricky Bot', style: { aggression: 0.6, bluff: 0.8, speed: 0.6, chattiness: 0.4 } },
  friendly: { name: 'Friendly Bot', style: { aggression: 0.2, bluff: 0.1, speed: 0.4, chattiness: 0.7 } },
};
/** Oh No! bots: honest bots only play Draw Four legally; bluffers may bluff and can be challenged. */
const OHNO_PERSONAS = {
  honest: { name: 'Honest Bot', style: { aggression: 0.5, bluff: 0, speed: 0.6, chattiness: 0.3 } },
  bluffer: { name: 'Bluffer Bot', style: { aggression: 0.7, bluff: 0.6, speed: 0.6, chattiness: 0.4 } },
};
/** Badminton playstyles — same style numbers as PERSONAS in public/src/js/games/badminton-rally.js. */
const BADMINTON_PERSONAS = {
  allround: { name: 'All-rounder Bot', style: { aggression: 0.5, bluff: 0.4, speed: 0.55, chattiness: 0.3 } },
  attacker: { name: 'Attacker Bot', style: { aggression: 0.9, bluff: 0.25, speed: 0.5, chattiness: 0.3 } },
  retriever: { name: 'Retriever Bot', style: { aggression: 0.2, bluff: 0.2, speed: 0.85, chattiness: 0.2 } },
  net: { name: 'Net player Bot', style: { aggression: 0.6, bluff: 0.6, speed: 0.65, chattiness: 0.3 } },
};

/**
 * Chess coach grounding: every move the text mentions must be one of the engine's moves
 * (input.allowedMoves). Anything else → the deterministic engine explanation.
 */
function chessGrounded(input, data) {
  if (String(input.gameId || '') !== 'chess' || !Array.isArray(input.allowedMoves)) return true;
  const Review = require('../public/src/js/games/chess-review.js');
  const allowed = input.allowedMoves.map((s) => String(s).slice(0, 12)).slice(0, 24);
  const text = [data.text].concat(data.tips || []).join(' ');
  return Review.validateCoachText(text, allowed).ok;
}

/**
 * Rummy coach grounding: every card the text names must be one of the review's cards
 * (input.allowedCards, labels like "9♥"). Anything else → the deterministic review.
 */
function cardsGrounded(input, data) {
  if (String(input.gameId || '') !== 'rummy') return true;
  if (!Array.isArray(input.allowedCards)) return false;
  const Rummy = require('../public/src/js/games/rummy-core.js');
  const allowed = input.allowedCards.map((s) => String(s).slice(0, 4)).slice(0, 12);
  const text = [data.text].concat(data.tips || []).join(' ');
  return Rummy.validateCoachText(text, allowed).ok;
}

const FALLBACKS = {
  coachExplain(input) {
    const mode = coachMode(input);
    if (mode === 'tip') {
      const base = input.baseTip ? String(input.baseTip).slice(0, 280) : assist().pickTip(input.gameId, input.stats || {}).text;
      return { text: base, tips: [] };
    }
    if (mode === 'hint') return { text: String(input.baseText || (input.facts && input.facts.text) || 'Look for the tightest clue first.').slice(0, 280), tips: [] };
    if ((String(input.gameId || '') === 'chess' || String(input.gameId || '') === 'rummy') && input.engineText) {
      const tips = Array.isArray(input.engineTips) ? input.engineTips.map((t) => String(t).slice(0, 120)).slice(0, 3) : [];
      return { text: String(input.engineText).slice(0, 280), tips };
    }
    const g = rulesFor(input.gameId);
    const tips = g ? g.glance.slice(0, 3) : ['Take your time', 'Think one move ahead', 'Watch what your opponent wants'];
    const text = input.move ? 'You played ' + String(input.move).slice(0, 40) + '. ' + tips[0] + '.' : tips[0] + '.';
    return { text: text.slice(0, 280), tips };
  },
  commentary(input) {
    const mode = cricketMode(input);
    if (mode === 'over') return { lines: [] };
    if (mode === 'recap') return { recap: '' };
    if (isNarrate(input)) return { line: '' };
    const list = COMMENTARY[input.event] || COMMENTARY.default;
    return { line: list[hashInt(JSON.stringify(input)) % list.length] };
  },
  generateQuestions(input) {
    const n = Math.max(1, Math.min(10, Number(input.count) || 5));
    const start = hashInt(String(input.category || 'GK') + ':' + (input.seed || '')) % QUESTION_BANK.length;
    const out = [];
    for (let i = 0; i < n; i++) out.push(QUESTION_BANK[(start + i) % QUESTION_BANK.length]);
    return { questions: out };
  },
  generateWordPack(input) {
    if (packKind(input)) return require('./party-content.js').fallbackPack(input);
    const words = WORD_PACKS[input.game] || WORD_PACKS.default;
    const n = Math.max(4, Math.min(words.length, Number(input.count) || words.length));
    return { words: words.slice(0, n) };
  },
  rulesQA(input) {
    const a = assist().answerRules(input.gameId, input.question, input.variants);
    return { answer: a.answer, cite: a.section ? [a.section] : [], covered: !a.notCovered };
  },
  rerankGames(input) {
    return { order: ((input && input.candidates) || []).map((c) => String(c.id)) };
  },
  botPersona(input) {
    const table = { chess: CHESS_PERSONAS, uno: OHNO_PERSONAS, badminton: BADMINTON_PERSONAS }[String(input.gameId || '')];
    const cp = table ? table[String(input.persona || '').toLowerCase()] : null;
    if (cp) return { name: cp.name, style: Object.assign({}, cp.style) };
    const style = LEVEL_STYLE[String(input.level || 'regular').toLowerCase()] || LEVEL_STYLE.regular;
    // Bots are always labelled as bots — never a bare human name.
    const name = PERSONA_NAMES[hashInt(String(input.gameId || '') + ':' + (input.seed || '')) % PERSONA_NAMES.length] + ' Bot';
    return { name, style: Object.assign({}, style) };
  },
};

// ─── Prompts (JSON only) ──────────────────────────────────────────────────
const SYSTEM =
  'You write short, friendly, family-safe content for a global social games app. ' +
  'Plain English, no links, no personal data, no real-money gambling. Reply with JSON only, matching the schema exactly.';

function clip(v, n) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').slice(0, n);
}

const PROMPTS = {
  coachExplain: (i) => {
    const mode = coachMode(i);
    if (mode === 'tip') {
      return (
        `Game: ${clip(i.gameId, 20)} (a casual game in a friendly app). The player just finished a game.\n` +
        `Match stats (JSON): ${clip(JSON.stringify(i.stats || {}), 600)}\nOur rule-based tip: ${clip(i.baseTip, 200)}\n` +
        'Write ONE short, warm, practical tip for next time. Only use numbers that appear in the stats — never invent a number, percentage or count. ' +
        'Schema: {"text": string<=200, "tips": []}'
      );
    }
    if (mode === 'hint') {
      const shabd = String(i.gameId) === 'wordguess';
      return (
        `Puzzle: ${shabd ? 'a five-letter word puzzle' : 'Kakuro (digits 1–9, runs add up to their clue, no repeats in a run)'}.\n` +
        `Solver facts (JSON): ${clip(JSON.stringify(i.facts || {}), 700)}\n` +
        'Explain the next logical step in plain English for a beginner, in 1–2 short sentences. Use only the digits, letters and positions in the facts. ' +
        (shabd ? 'Never suggest or spell out any word, never guess the answer. ' : 'Do not reveal any other cell. ') +
        'Schema: {"text": string<=240, "tips": []}'
      );
    }
    return (
    `Game: ${clip(i.gameId, 20)}. Situation: ${clip(i.situation, 400)}. Last move: ${clip(i.move, 40)}.\n` +
    (Array.isArray(i.allowedMoves)
      ? `Engine facts: ${clip(i.engineText, 280)} Only mention these moves, in SAN: ${clip(i.allowedMoves.join(', '), 200)}. Never name any other move or square.\n`
      : '') +
    (Array.isArray(i.allowedCards)
      ? `Review facts: ${clip(i.engineText, 280)} ${clip((i.engineTips || []).join(' '), 360)} Only mention these cards, written like 9♥: ${clip(i.allowedCards.join(', '), 80)}. Never name any other card or invent numbers.\n`
      : '') +
    'Explain briefly for a casual player. Schema: {"text": string<=280, "tips": [string<=120, max 3]}'
    );
  },
  rulesQA: (i) =>
    `You answer questions about the rules of the game ${clip(i.gameName || i.gameId, 40)} using ONLY the numbered passages below. ` +
    'Never use outside knowledge. If the passages do not answer the question, reply covered=false. ' +
    'Cite the passage ids you used (max 3). Only use numbers that appear in the cited passages.\n' +
    `Passages (JSON): ${clip(JSON.stringify(i.passages || []), 6000)}\n` +
    `Question: ${clip(i.question, 200)}\n` +
    `Schema: {"answer": string<=${RULES_MAX}, "cite": [passage id], "covered": boolean}`,
  rerankGames: (i) =>
    `Re-order these game suggestions for this context (JSON): ${clip(JSON.stringify(i.ctx || {}), 300)}.\n` +
    `Candidates (JSON, with our reasons): ${clip(JSON.stringify(i.candidates || []), 1200)}\n` +
    'Return every id exactly once, best first. Never add an id. Schema: {"order": [id]}',
  commentary: (i) => {
    const mode = cricketMode(i);
    const voice = i.persona === 'fan' ? 'an excited, warm fan' : 'a calm, insightful analyst';
    if (mode === 'over') {
      return (
        `Street cricket: a friendly virtual 1v1 game with made-up players. You are ${voice}.\n` +
        `Key moments of one over (JSON, index = position): ${clip(JSON.stringify(i.moments || []), 1600)}\n` +
        'Write one short commentary line per moment (at most 8). Use only the names and numbers given — never invent stats, real players, teams, brands or places.\n' +
        'Schema: {"lines": [{"i": number, "line": string<=140}]}'
      );
    }
    if (mode === 'recap') {
      return (
        `Street cricket: a friendly virtual 1v1 game with made-up players. You are ${voice}.\n` +
        `Match facts (JSON): ${clip(JSON.stringify(i.facts || {}), 1600)}\n` +
        'Write a 2–3 sentence match recap for a share card. Use only these names and numbers — never invent stats, real players, teams, brands or places.\n' +
        'Schema: {"recap": string<=320}'
      );
    }
    if (isNarrate(i)) {
      return (
        `You narrate a friendly Werewolf party game (theme: ${clip(i.theme, 20)}). Beat: ${clip(i.beat, 12)}.\n` +
        `Public facts (JSON): ${clip(JSON.stringify(i.facts || {}), 400)}\n` +
        'Write ONE atmospheric line for the narrator to read aloud. Use only the names given; never reveal or guess anyone’s role. ' +
        'Spooky but light: no blood, gore, weapons, injuries or violence words — people are simply "gone" or "found asleep". ' +
        `Schema: {"line": string<=${NARRATE_MAX}}`
      );
    }
    return `Game: ${clip(i.gameId, 20)}. Event: ${clip(i.event, 30)}. Score: ${clip(i.score, 40)}.\n` + 'One upbeat commentary line. Schema: {"line": string<=140}';
  },
  generateQuestions: (i) =>
    `Write ${Math.max(1, Math.min(10, Number(i.count) || 5))} multiple-choice quiz questions on "${clip(i.category, 30)}" with globally known answers.\n` +
    'Schema: {"questions": [{"q": string<=200, "options": [4 distinct strings<=80], "answer": 0-3}]}',
  generateWordPack: (i) => {
    const n = Math.max(4, Math.min(packKind(i) === 'prompts' ? 30 : 40, Number(i.count) || 12));
    const theme = clip(i.theme, 40);
    const safe = 'Teen-safe and kind: no insults, bodies, looks, romance, alcohol, drugs, violence or real private people.';
    if (packKind(i) === 'pairs') {
      return (
        `Imposter party game, theme "${theme}". Write ${n} distinct, well-known words or short phrases, each with a partner: a related but clearly different word ` +
        `(e.g. Tea → Coffee, Beach → Lake) that someone could confuse in conversation. ${safe}\n` +
        'Schema: {"words": [{"w": string<=32, "p": string<=32}]}'
      );
    }
    if (packKind(i) === 'titles') {
      return (
        `Charades party game, theme "${theme}". Write ${n} distinct things people can act out silently — actions, generic movie/TV ideas, animals, jobs or idioms. ` +
        `No trademarks or brand names; famous people only if historical. ${safe}\n` +
        'Schema: {"words": [string<=48]}'
      );
    }
    if (packKind(i) === 'prompts') {
      if (i.mode === 'wyr') {
        return `"Would You Rather" party prompts, theme "${theme}". Write ${n} fun dilemmas, each two short options. ${safe}\nSchema: {"prompts": [{"a": string<=80, "b": string<=80}]}`;
      }
      const lead = i.mode === 'nhie' ? 'lines that finish "Never have I ever …" (write only the ending)' : 'lines that finish "Who is most likely to …" (write only the ending)';
      return `Party prompts, theme "${theme}". Write ${n} playful, never-mean ${lead}. ${safe}\nSchema: {"prompts": [string<=120]}`;
    }
    return (
      `Write ${n} distinct, globally recognisable words for the party game ${clip(i.game, 20)} on the theme "${theme}".\n` +
      'Schema: {"words": [string<=32]}'
    );
  },
  botPersona: (i) =>
    `Create a bot opponent persona for ${clip(i.gameId, 20)} at level ${clip(i.level, 12)}. Style numbers only, 0 to 1.\n` +
    'Schema: {"name": string<=24, "style": {"aggression": n, "bluff": n, "speed": n, "chattiness": n}}',
};

function parseJson(text) {
  const s = String(text || '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(s.slice(a, b + 1));
  } catch (e) {
    return null;
  }
}

function dayKeyUTC(now) {
  return new Date(now).toISOString().slice(0, 10);
}

/**
 * @param {object} [deps]
 *   callAI(opts) → { text }      default: require('./ai').callAI
 *   env                          default: process.env
 *   db, admin                    optional Firestore for the shared global budget (aiBudget doc)
 *   now()                        clock
 *   userCap                      per-user daily LLM calls (default env DANGAL_AI_USER_CAP or 30)
 *   timeoutMs                    overrides every hook's timeout (tests)
 */
const COUNTER_KEYS = ['calls', 'aiCalls', 'fallbacks', 'cacheHits', 'rejected', 'errors'];

/** Server-side input prep: rulesQA passages always come from our own rules text, never the client. */
const PREPARE = {
  rulesQA(input) {
    const A = assist();
    const id = A.canonId(input.gameId);
    const passages = A.rulesPassages(id, input.variants);
    if (!passages.length) return null;
    return { gameId: id, gameName: A.gameName(id), question: String(input.question || '').slice(0, 200), variants: input.variants || null, passages };
  },
};
/** After validation: a not-covered answer always uses our one honest line; bots always say Bot. */
const FINISH = {
  botPersona(data) {
    const name = /\bbot\b/i.test(data.name) ? data.name : (String(data.name).slice(0, 20) + ' Bot').trim();
    return Object.assign({}, data, { name });
  },
  rulesQA(data, input) {
    if (!data.covered) return { answer: assist().NOT_COVERED, cite: [], covered: false };
    const sections = data.cite.map((id) => (input.passages.find((p) => p.id === id) || {}).h).filter(Boolean);
    return { answer: data.answer, cite: data.cite, covered: true, sections };
  },
};

function createDangalAI(deps) {
  const d = deps || {};
  const env = d.env || process.env;
  const now = d.now || (() => Date.now());
  const userCap = Math.max(0, Number(d.userCap != null ? d.userCap : env.DANGAL_AI_USER_CAP) || 30);
  const globalCap = Math.max(0, Number(env.AI_DAILY_CALL_CAP) || 200);
  const hookCaps = hookUserCaps(env);
  const cache = new Map();
  const userCalls = new Map();
  let localGlobal = { day: '', calls: 0, hooks: {} };
  const counters = {};
  let countersDay = '';
  const blank = () => COUNTER_KEYS.reduce((o, k) => ((o[k] = 0), o), { costUsd: 0 });
  function resetCounters() {
    HOOKS.concat(Object.keys(EXTERNAL_HOOKS)).forEach((h) => (counters[h] = blank()));
  }
  resetCounters();
  /** Unflushed deltas for dangalAiStats/{day}. */
  let pending = {};
  let lastFlush = 0;

  const callAI = d.callAI || ((opts) => require('./ai').callAI(opts));

  function enabled() {
    return env.AI_FEATURES_ENABLED === 'true' && !(env.AI_JOBS_PAUSED === 'true' || env.AI_JOBS_PAUSED === '1');
  }
  function hookOn(hook) {
    return enabled() && !hookDisabled(hook, env);
  }
  function capFor(hook) {
    const p = HOOK_POLICY[hook];
    const own = hookCaps[hook] != null ? hookCaps[hook] : p ? p.userCap : userCap;
    return Math.min(userCap, own);
  }
  function hookDailyCap(hook) {
    const p = HOOK_POLICY[hook];
    return p ? Math.max(1, Math.ceil(globalCap * p.share)) : globalCap;
  }

  function bump(hook, key, n) {
    const day = dayKeyUTC(now());
    if (countersDay !== day) {
      countersDay = day;
      resetCounters();
    }
    if (!counters[hook]) counters[hook] = blank();
    counters[hook][key] += n == null ? 1 : n;
    const p = (pending[day] = pending[day] || {});
    const h = (p[hook] = p[hook] || {});
    h[key] = (h[key] || 0) + (n == null ? 1 : n);
  }

  /** Persist per-hook per-day counters (throttled; one merge write). */
  async function flushStats(force) {
    if (!d.db || !d.admin || !d.admin.firestore || !d.admin.firestore.FieldValue) return false;
    const t = now();
    if (!force && t - lastFlush < STATS_FLUSH_MS) return false;
    const days = Object.keys(pending);
    if (!days.length) return false;
    const snapshot = pending;
    pending = {};
    lastFlush = t;
    const FV = d.admin.firestore.FieldValue;
    try {
      await Promise.all(
        days.map((day) => {
          const hooks = {};
          Object.keys(snapshot[day]).forEach((hook) => {
            hooks[hook] = {};
            Object.keys(snapshot[day][hook]).forEach((k) => (hooks[hook][k] = FV.increment(snapshot[day][hook][k])));
          });
          return d.db.collection('dangalAiStats').doc(day).set({ day, hooks, updatedAt: t }, { merge: true });
        })
      );
      return true;
    } catch (e) {
      return false;
    }
  }

  function cacheKey(hook, input, lang) {
    return crypto.createHash('sha256').update(hook + '|' + (lang || 'en') + '|' + JSON.stringify(input || {})).digest('hex');
  }
  function cacheGet(key) {
    const hit = cache.get(key);
    if (!hit) return null;
    if (now() - hit.at > CACHE_TTL_MS) {
      cache.delete(key);
      return null;
    }
    return hit.data;
  }
  function cacheSet(key, data) {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(key, { at: now(), data });
  }

  function userAllows(uid, hook) {
    const cap = capFor(hook);
    if (!uid) return cap > 0;
    const day = dayKeyUTC(now());
    const row = userCalls.get(uid);
    if (!row || row.day !== day) return cap > 0 && userCap > 0;
    return row.calls < userCap && (row.hooks[hook] || 0) < cap;
  }
  function bumpUser(uid, hook) {
    if (!uid) return;
    const day = dayKeyUTC(now());
    let row = userCalls.get(uid);
    if (!row || row.day !== day) {
      row = { day, calls: 0, hooks: {} };
      userCalls.set(uid, row);
    }
    row.calls += 1;
    row.hooks[hook] = (row.hooks[hook] || 0) + 1;
  }

  /** null when allowed, else 'global_cap' | 'hook_cap'. */
  async function globalBlock(hook) {
    const day = dayKeyUTC(now());
    if (localGlobal.day !== day) localGlobal = { day, calls: 0, hooks: {} };
    if (localGlobal.calls >= globalCap) return 'global_cap';
    if ((localGlobal.hooks[hook] || 0) >= hookDailyCap(hook)) return 'hook_cap';
    if (d.db) {
      try {
        const snap = await d.db.collection('chaupaalMeta').doc('aiBudget').get();
        const data = snap.exists ? snap.data() || {} : {};
        if (data.paused === true) return 'global_cap';
        if (data.day === day && Number(data.calls) >= globalCap) return 'global_cap';
        if (data.day === day && data.dangalHooks && Number(data.dangalHooks[hook]) >= hookDailyCap(hook)) return 'hook_cap';
      } catch (e) {}
    }
    return null;
  }
  async function bumpGlobal(hook) {
    localGlobal.calls += 1;
    localGlobal.hooks[hook] = (localGlobal.hooks[hook] || 0) + 1;
    if (d.db && d.admin) {
      try {
        const FV = d.admin.firestore.FieldValue;
        const day = dayKeyUTC(now());
        const snap = await d.db.collection('chaupaalMeta').doc('aiBudget').get().catch(() => null);
        const fresh = !snap || !snap.exists || (snap.data() || {}).day !== day;
        const ref = d.db.collection('chaupaalMeta').doc('aiBudget');
        if (fresh) {
          // New UTC day: start from zero and replace yesterday's per-hook map (update() swaps the whole map).
          await ref.set({ day, calls: 1, tokensEst: 500 }, { merge: true });
          if (typeof ref.update === 'function') await ref.update({ dangalHooks: { [hook]: 1 } });
        } else {
          await ref.set({ day, calls: FV.increment(1), tokensEst: FV.increment(500), dangalHooks: { [hook]: FV.increment(1) } }, { merge: true });
        }
      } catch (e) {}
    }
  }

  function withTimeout(p, ms) {
    let t;
    return Promise.race([
      p,
      new Promise((_, reject) => {
        t = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'AI_TIMEOUT' })), ms);
      }),
    ]).finally(() => clearTimeout(t));
  }

  function fallback(hook, input, reason) {
    bump(hook, 'fallbacks');
    let data;
    try {
      data = FALLBACKS[hook](input || {});
    } catch (e) {
      data = FALLBACKS[hook]({});
    }
    return { data, source: 'fallback', reason };
  }

  async function run(hook, input, ctx) {
    if (HOOKS.indexOf(hook) < 0) throw Object.assign(new Error('Unknown AI hook'), { code: 'VALIDATION_ERROR' });
    const policy = HOOK_POLICY[hook];
    const uid = ctx && ctx.uid ? String(ctx.uid) : '';
    let inp = input || {};
    bump(hook, 'calls');
    try {
      return await runInner();
    } finally {
      flushStats(false).catch(() => {});
    }

    async function runInner() {
      if (!enabled()) return fallback(hook, inp, 'ai_off');
      if (hookDisabled(hook, env)) return fallback(hook, inp, 'hook_off');
      if (PREPARE[hook]) {
        const prepared = PREPARE[hook](inp);
        if (!prepared) return fallback(hook, inp, 'no_context');
        inp = prepared;
      }
      const lang = VIEWER_TEXT_HOOKS.has(hook) ? AiLang.normalize(ctx && ctx.lang) : 'en';
      const key = cacheKey(hook, inp, lang);
      const cached = cacheGet(key);
      if (cached) {
        bump(hook, 'cacheHits');
        return { data: cached, source: 'cache' };
      }
      if (!userAllows(uid, hook)) return fallback(hook, inp, 'user_cap');
      const block = await globalBlock(hook);
      if (block) return fallback(hook, inp, block);
      let out;
      try {
        bumpUser(uid, hook);
        await bumpGlobal(hook);
        bump(hook, 'aiCalls');
        bump(hook, 'costUsd', COST_BY_TIER[policy.tier] || COST_PER_CALL_USD);
        out = await withTimeout(
          Promise.resolve(
            callAI(
              Object.assign(
                { tier: policy.tier, system: SYSTEM, messages: [{ role: 'user', content: PROMPTS[hook](inp) }], max_tokens: 700, feature: 'dangal_' + hook },
                VIEWER_TEXT_HOOKS.has(hook) ? { lang, langJson: true } : {}
              )
            )
          ),
          d.timeoutMs || policy.timeoutMs || TIMEOUT_MS
        );
      } catch (e) {
        bump(hook, 'errors');
        return fallback(hook, inp, e && e.code === 'AI_TIMEOUT' ? 'timeout' : 'provider_error');
      }
      let data = parseJson(out && out.text);
      if (!SCHEMAS[hook](data, inp) || !isSafe(data) || (hook === 'coachExplain' && (!chessGrounded(inp, data) || !cardsGrounded(inp, data)))) {
        bump(hook, 'rejected');
        return fallback(hook, inp, 'invalid_output');
      }
      if (FINISH[hook]) data = FINISH[hook](data, inp);
      cacheSet(out && out.langFallback ? cacheKey(hook, inp, 'en') : key, data);
      return { data, source: 'ai' };
    }
  }

  /** Spend outside run() (scheduler jobs) counts in the same telemetry; false when switched off. */
  function hookAllowed(name) {
    return enabled() && !hookDisabled(name, env);
  }
  function recordExternal(name, delta) {
    const x = delta || {};
    COUNTER_KEYS.concat('costUsd').forEach((k) => x[k] && bump(name, k, Number(x[k]) || 0));
    return flushStats(true);
  }

  function telemetry() {
    const out = {};
    let calls = 0;
    let cost = 0;
    Object.keys(counters).forEach((h) => {
      out[h] = Object.assign({}, counters[h], { costUsd: Math.round(counters[h].costUsd * 10000) / 10000 });
      calls += counters[h].aiCalls;
      cost += counters[h].costUsd;
    });
    return { day: countersDay || dayKeyUTC(now()), hooks: out, aiCalls: calls, costUsdEst: Math.round(cost * 10000) / 10000, enabled: enabled(), policy: policyTable(env) };
  }

  const api = { run, telemetry, enabled, hookOn, hookAllowed, recordExternal, flushStats };
  HOOKS.forEach((h) => (api[h] = (input, ctx) => run(h, input, ctx)));
  return api;
}

let shared = null;
function sharedAI(deps) {
  if (!shared) shared = createDangalAI(deps);
  return shared;
}

module.exports = {
  HOOKS,
  HOOK_POLICY,
  EXTERNAL_HOOKS,
  COST_BY_TIER,
  hookDisabled,
  hookUserCaps,
  policyTable,
  SCHEMAS,
  FALLBACKS,
  isSafe,
  isSafeText,
  parseJson,
  PACK_KINDS,
  NARRATE_MAX,
  createDangalAI,
  sharedAI,
  CHESS_PERSONAS,
  BADMINTON_PERSONAS,
  chessGrounded,
  cardsGrounded,
};
