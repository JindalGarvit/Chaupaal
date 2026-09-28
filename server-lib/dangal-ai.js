/**
 * Dangal AI contract — five hooks on top of ai.js / ai-config.js, each with a mandatory
 * deterministic fallback. The build and every game work with AI off.
 *
 *   coachExplain({ gameId, situation, move })        → { text, tips[] }
 *   commentary({ gameId, event, score })             → { line }
 *   generateQuestions({ category, count })           → { questions: [{ q, options[4], answer }] }
 *   generateWordPack({ game, theme, count })         → { words[] }
 *   botPersona({ gameId, level, seed })              → { name, style: { aggression, bluff, speed, chattiness } }
 *
 * An LLM is called only when AI_FEATURES_ENABLED === 'true', AI_JOBS_PAUSED is off, the global
 * AI_DAILY_CALL_CAP and the per-user cap have room, and the input is not cached. Every output is
 * JSON-schema checked and safety filtered; any failure, timeout or missing key → fallback.
 * Callers only ever see { data, source } — never a raw provider error.
 */
'use strict';

const crypto = require('crypto');

const TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX = 500;
/** Rough blended $ per call for the fast tier (telemetry estimate only). */
const COST_PER_CALL_USD = 0.0008;

const HOOKS = ['coachExplain', 'commentary', 'generateQuestions', 'generateWordPack', 'botPersona'];

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

const SCHEMAS = {
  coachExplain: (d) => !!d && str(d.text, 280) && Array.isArray(d.tips) && d.tips.length <= 3 && d.tips.every((t) => str(t, 120)),
  commentary: (d) => !!d && str(d.line, 140),
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
  generateWordPack: (d) =>
    !!d && Array.isArray(d.words) && d.words.length >= 4 && d.words.length <= 60 &&
    d.words.every((w) => str(w, 32)) && new Set(d.words.map((w) => w.toLowerCase())).size === d.words.length,
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
    const words = WORD_PACKS[input.game] || WORD_PACKS.default;
    const n = Math.max(4, Math.min(words.length, Number(input.count) || words.length));
    return { words: words.slice(0, n) };
  },
  botPersona(input) {
    const table = { chess: CHESS_PERSONAS, uno: OHNO_PERSONAS }[String(input.gameId || '')];
    const cp = table ? table[String(input.persona || '').toLowerCase()] : null;
    if (cp) return { name: cp.name, style: Object.assign({}, cp.style) };
    const style = LEVEL_STYLE[String(input.level || 'regular').toLowerCase()] || LEVEL_STYLE.regular;
    const name = PERSONA_NAMES[hashInt(String(input.gameId || '') + ':' + (input.seed || '')) % PERSONA_NAMES.length];
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
  coachExplain: (i) =>
    `Game: ${clip(i.gameId, 20)}. Situation: ${clip(i.situation, 400)}. Last move: ${clip(i.move, 40)}.\n` +
    (Array.isArray(i.allowedMoves)
      ? `Engine facts: ${clip(i.engineText, 280)} Only mention these moves, in SAN: ${clip(i.allowedMoves.join(', '), 200)}. Never name any other move or square.\n`
      : '') +
    (Array.isArray(i.allowedCards)
      ? `Review facts: ${clip(i.engineText, 280)} ${clip((i.engineTips || []).join(' '), 360)} Only mention these cards, written like 9♥: ${clip(i.allowedCards.join(', '), 80)}. Never name any other card or invent numbers.\n`
      : '') +
    'Explain briefly for a casual player. Schema: {"text": string<=280, "tips": [string<=120, max 3]}',
  commentary: (i) =>
    `Game: ${clip(i.gameId, 20)}. Event: ${clip(i.event, 30)}. Score: ${clip(i.score, 40)}.\n` +
    'One upbeat commentary line. Schema: {"line": string<=140}',
  generateQuestions: (i) =>
    `Write ${Math.max(1, Math.min(10, Number(i.count) || 5))} multiple-choice quiz questions on "${clip(i.category, 30)}" with globally known answers.\n` +
    'Schema: {"questions": [{"q": string<=200, "options": [4 distinct strings<=80], "answer": 0-3}]}',
  generateWordPack: (i) =>
    `Write ${Math.max(4, Math.min(40, Number(i.count) || 12))} distinct, globally recognisable words for the party game ${clip(i.game, 20)} on the theme "${clip(i.theme, 40)}".\n` +
    'Schema: {"words": [string<=32]}',
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
 *   timeoutMs
 */
function createDangalAI(deps) {
  const d = deps || {};
  const env = d.env || process.env;
  const now = d.now || (() => Date.now());
  const timeoutMs = d.timeoutMs || TIMEOUT_MS;
  const userCap = Math.max(0, Number(d.userCap != null ? d.userCap : env.DANGAL_AI_USER_CAP) || 30);
  const globalCap = Math.max(0, Number(env.AI_DAILY_CALL_CAP) || 200);
  const cache = new Map();
  const userCalls = new Map();
  let localGlobal = { day: '', calls: 0 };
  const counters = {};
  HOOKS.forEach((h) => (counters[h] = { calls: 0, aiCalls: 0, fallbacks: 0, cacheHits: 0, rejected: 0, errors: 0 }));

  const callAI = d.callAI || ((opts) => require('./ai').callAI(opts));

  function enabled() {
    return env.AI_FEATURES_ENABLED === 'true' && !(env.AI_JOBS_PAUSED === 'true' || env.AI_JOBS_PAUSED === '1');
  }

  function cacheKey(hook, input) {
    return crypto.createHash('sha256').update(hook + '|' + JSON.stringify(input || {})).digest('hex');
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

  function userAllows(uid) {
    if (!uid) return userCap > 0;
    const day = dayKeyUTC(now());
    const row = userCalls.get(uid);
    if (!row || row.day !== day) return userCap > 0;
    return row.calls < userCap;
  }
  function bumpUser(uid) {
    if (!uid) return;
    const day = dayKeyUTC(now());
    const row = userCalls.get(uid);
    if (!row || row.day !== day) userCalls.set(uid, { day, calls: 1 });
    else row.calls += 1;
  }

  async function globalAllows() {
    const day = dayKeyUTC(now());
    if (localGlobal.day !== day) localGlobal = { day, calls: 0 };
    if (localGlobal.calls >= globalCap) return false;
    if (d.db) {
      try {
        const snap = await d.db.collection('chaupaalMeta').doc('aiBudget').get();
        const data = snap.exists ? snap.data() || {} : {};
        if (data.paused === true) return false;
        if (data.day === day && Number(data.calls) >= globalCap) return false;
      } catch (e) {}
    }
    return true;
  }
  async function bumpGlobal() {
    localGlobal.calls += 1;
    if (d.db && d.admin) {
      try {
        await d.db.collection('chaupaalMeta').doc('aiBudget').set(
          {
            day: dayKeyUTC(now()),
            calls: d.admin.firestore.FieldValue.increment(1),
            tokensEst: d.admin.firestore.FieldValue.increment(500),
          },
          { merge: true }
        );
      } catch (e) {}
    }
  }

  function withTimeout(p) {
    let t;
    return Promise.race([
      p,
      new Promise((_, reject) => {
        t = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'AI_TIMEOUT' })), timeoutMs);
      }),
    ]).finally(() => clearTimeout(t));
  }

  function fallback(hook, input, reason) {
    counters[hook].fallbacks += 1;
    return { data: FALLBACKS[hook](input || {}), source: 'fallback', reason };
  }

  async function run(hook, input, ctx) {
    if (HOOKS.indexOf(hook) < 0) throw Object.assign(new Error('Unknown AI hook'), { code: 'VALIDATION_ERROR' });
    const inp = input || {};
    const uid = ctx && ctx.uid ? String(ctx.uid) : '';
    counters[hook].calls += 1;
    if (!enabled()) return fallback(hook, inp, 'ai_off');
    const key = cacheKey(hook, inp);
    const cached = cacheGet(key);
    if (cached) {
      counters[hook].cacheHits += 1;
      return { data: cached, source: 'cache' };
    }
    if (!userAllows(uid)) return fallback(hook, inp, 'user_cap');
    if (!(await globalAllows())) return fallback(hook, inp, 'global_cap');
    let out;
    try {
      bumpUser(uid);
      await bumpGlobal();
      counters[hook].aiCalls += 1;
      out = await withTimeout(
        Promise.resolve(callAI({ tier: 'fast', system: SYSTEM, messages: [{ role: 'user', content: PROMPTS[hook](inp) }], max_tokens: 700, feature: 'dangal_' + hook }))
      );
    } catch (e) {
      counters[hook].errors += 1;
      return fallback(hook, inp, e && e.code === 'AI_TIMEOUT' ? 'timeout' : 'provider_error');
    }
    const data = parseJson(out && out.text);
    if (!SCHEMAS[hook](data) || !isSafe(data) || (hook === 'coachExplain' && (!chessGrounded(inp, data) || !cardsGrounded(inp, data)))) {
      counters[hook].rejected += 1;
      return fallback(hook, inp, 'invalid_output');
    }
    cacheSet(key, data);
    return { data, source: 'ai' };
  }

  function telemetry() {
    const out = {};
    let calls = 0;
    HOOKS.forEach((h) => {
      out[h] = Object.assign({}, counters[h]);
      calls += counters[h].aiCalls;
    });
    return { hooks: out, aiCalls: calls, costUsdEst: Math.round(calls * COST_PER_CALL_USD * 10000) / 10000, enabled: enabled() };
  }

  const api = { run, telemetry, enabled };
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
  SCHEMAS,
  FALLBACKS,
  isSafe,
  isSafeText,
  parseJson,
  createDangalAI,
  sharedAI,
  CHESS_PERSONAS,
  chessGrounded,
  cardsGrounded,
};
