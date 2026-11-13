/**
 * Translate for user content (Global L7). Served by POST /api/media-config
 *   { action: 'translate_config' }                          → { enabled, provider, maxChars, maxItems }
 *   { action: 'translate', target, items: [{ text, surface, scope, v }] } → { items: [{ ok, text, src, cached, error }] }
 *
 * Provider (env, never hardcoded):
 *   TRANSLATE_PROVIDER=llm (default) → server-lib/ai.js callAI (AI_PROVIDER / AI_MODEL_FAST); needs
 *     AI_FEATURES_ENABLED exactly "true" and that provider's key.
 *   TRANSLATE_PROVIDER=deepl  + DEEPL_API_KEY [DEEPL_API_URL]
 *   TRANSLATE_PROVIDER=google + GOOGLE_TRANSLATE_API_KEY
 *   Missing credentials / AI off / TRANSLATE_DISABLED=true → enabled:false and the client hides the button.
 * Quality: @mentions, #hashtags, URLs, emails, emoji, inline / fenced code, numbers and Chaupaal surface
 *   names are swapped for placeholders before translation and must all come back; line breaks are kept
 *   (lines translate as an array); the output must read as the target language; added commentary fails.
 * Safety: the output passes the same word filter as the source surface (Dangal / Mehfil text is always
 *   masked; elsewhere a translation may never introduce words the source didn't have).
 * Privacy: scope 'private' (chats, private posts / profiles, room text) is never cached or stored here
 *   and no text is logged. scope 'public' is cached in translateCache/{hash(text, target, version)}.
 * Caps: TRANSLATE_USER_DAILY_CAP (default 150 items / user / UTC day), TRANSLATE_DAILY_CAP (default 3000
 *   provider items / day, chaupaalMeta/translateBudget; aiBudget.paused also stops it), TRANSLATE_MAX_CHARS
 *   per chunk (1500) × TRANSLATE_MAX_CHUNKS (4) for long articles, ≤ 8 items per request.
 * Telemetry: translateStats/{day}.surfaces.<surface> { requests, items, cacheHits, aiCalls, failures,
 *   capped, chars, costUsd } — counts only, no content (admin view=translate).
 */
'use strict';

const crypto = require('crypto');
const AiLang = require('../public/src/js/ai/ai-lang.js');
const WordSafety = require('../public/src/js/dangal/word-safety.js');

const MAX_ITEMS = 8;
const CACHE_TTL_MS = 30 * 24 * 3600 * 1000;
const GLOSSARY = ['Chaupaal', 'Dangal', 'Baithak', 'Mehfil', 'Peepal', 'Akhbaar', 'Duniya', 'Khoj', 'Vriksha', 'Muqabala'];
/** Rough $ per translated character (telemetry estimate only). */
const COST_PER_CHAR = { llm: 0.0000006, deepl: 0.00002, google: 0.00002 };
/** Surfaces whose source text already passes the word filter — their translations always do too. */
const FILTERED_SURFACE = /^(dangal|scribble|party|mehfil)/;
const SURFACES = /^[a-z][a-z0-9_]{1,40}$/;

function num(v, d) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : d;
}

function providerId(env) {
  return String((env || process.env).TRANSLATE_PROVIDER || 'llm').trim().toLowerCase();
}

function llmKey(env) {
  const p = String(env.AI_PROVIDER || 'anthropic').toLowerCase();
  if (p === 'anthropic') return !!(env.ANTHROPIC_API_KEY || env.Anthropic_API_key);
  return !!(env.OPENAI_API_KEY || env.AI_API_KEY || env.GROK_API_KEY);
}

/** Feature flag the client reads (computed here so a missing key never shows a broken button). */
function flags(env) {
  const e = env || process.env;
  const id = providerId(e);
  const base = { maxChars: num(e.TRANSLATE_MAX_CHARS, 1500), maxChunks: num(e.TRANSLATE_MAX_CHUNKS, 4), maxItems: MAX_ITEMS };
  if (e.TRANSLATE_DISABLED === 'true' || e.TRANSLATE_DISABLED === '1') return Object.assign(base, { enabled: false, reason: 'disabled' });
  if (id === 'llm') {
    if (e.AI_FEATURES_ENABLED !== 'true') return Object.assign(base, { enabled: false, reason: 'ai_off' });
    if (!llmKey(e)) return Object.assign(base, { enabled: false, reason: 'no_credentials' });
  } else if (id === 'deepl') {
    if (!e.DEEPL_API_KEY) return Object.assign(base, { enabled: false, reason: 'no_credentials' });
  } else if (id === 'google') {
    if (!e.GOOGLE_TRANSLATE_API_KEY) return Object.assign(base, { enabled: false, reason: 'no_credentials' });
  } else return Object.assign(base, { enabled: false, reason: 'unknown_provider' });
  return Object.assign(base, { enabled: true, provider: id });
}

// ─── Protect what must not change ───────────────────────────────────────────
const PROTECT = new RegExp(
  [
    '```[\\s\\S]*?```',
    '`[^`\\n]+`',
    'https?:\\/\\/[^\\s<>()]+',
    'www\\.[^\\s<>()]+',
    '[\\w.+-]+@[\\w-]+\\.[\\w.]+',
    '(?<![\\p{L}\\p{N}_])@[\\p{L}\\p{N}_.]{1,30}',
    '(?<![\\p{L}\\p{N}_])#[\\p{L}\\p{N}_]+',
    '\\p{Extended_Pictographic}(?:\\u{FE0F}|\\u{200D}\\p{Extended_Pictographic}|[\\u{1F3FB}-\\u{1F3FF}])*',
    '\\p{N}+(?:[.,:/\\-]\\p{N}+)*%?',
    '\\b(?:' + GLOSSARY.join('|') + ')\\b',
  ].join('|'),
  'gu'
);

/** text → { masked, tokens } with ⟦n⟧ placeholders. */
function protect(text) {
  const tokens = [];
  const masked = String(text).replace(PROTECT, (m) => {
    tokens.push(m);
    return '⟦' + (tokens.length - 1) + '⟧';
  });
  return { masked, tokens };
}

/** Put the tokens back; null when any placeholder is missing, duplicated or invented. */
function restore(out, tokens) {
  const seen = new Array(tokens.length).fill(0);
  let bad = false;
  const s = String(out).replace(/⟦\s*(\d+)\s*⟧/g, (m, i) => {
    const n = Number(i);
    if (!(n < tokens.length)) {
      bad = true;
      return '';
    }
    seen[n]++;
    return tokens[n];
  });
  if (bad || seen.some((c) => c !== 1)) return null;
  return s;
}

/** Lines keep their breaks: blank lines pass through, the rest translate as one array. */
function splitLines(text) {
  const parts = String(text).split(/(\r?\n)/);
  const idx = [];
  parts.forEach((p, i) => {
    if (!/^\r?\n$/.test(p) && p.trim()) idx.push(i);
  });
  return { parts, idx };
}

/** Long text (articles) → chunks of ≤ maxChars on paragraph / sentence boundaries, at most maxChunks. */
function chunk(text, maxChars, maxChunks) {
  const s = String(text);
  if (s.length <= maxChars) return { chunks: [s], truncated: false };
  const out = [];
  let rest = s;
  while (rest.length && out.length < maxChunks) {
    if (rest.length <= maxChars) {
      out.push(rest);
      rest = '';
      break;
    }
    let cut = rest.lastIndexOf('\n', maxChars);
    if (cut < maxChars * 0.5) cut = Math.max(rest.lastIndexOf('. ', maxChars), rest.lastIndexOf('। ', maxChars));
    if (cut < maxChars * 0.5) cut = rest.lastIndexOf(' ', maxChars);
    if (cut <= 0) cut = maxChars;
    out.push(rest.slice(0, cut + 1));
    rest = rest.slice(cut + 1);
  }
  return { chunks: out, truncated: rest.length > 0 };
}

// ─── Providers (one interface: segments in → segments out, same length) ─────
const SYSTEM =
  'You are a translation engine inside a social app. Translate every string of the JSON array "segments" into {{target}}{{source}}. ' +
  'Return ONLY a JSON array of strings: same length, same order. Keep every placeholder like ⟦0⟧ exactly once and unchanged. ' +
  'Translate meaning naturally; keep tone, slang and emoji intent. Never add notes, quotes, explanations, transliterations or extra text. ' +
  'If a string is already in {{target}}, return it unchanged.';

function parseArray(text) {
  const s = String(text || '');
  const a = s.indexOf('[');
  const b = s.lastIndexOf(']');
  if (a < 0 || b <= a) return null;
  try {
    const v = JSON.parse(s.slice(a, b + 1));
    return Array.isArray(v) && v.every((x) => typeof x === 'string') ? v : null;
  } catch (e) {
    return null;
  }
}

const PROVIDERS = {
  llm: {
    async translate({ segments, source, target, callAI }) {
      const name = AiLang.name(target);
      const src = source && source !== 'und' && AiLang.NAMES[source] ? ' from ' + AiLang.name(source) : '';
      const out = await callAI({
        tier: 'fast',
        system: SYSTEM.replace(/\{\{target\}\}/g, name).replace('{{source}}', src),
        messages: [{ role: 'user', content: JSON.stringify({ target: name, segments }) }],
        max_tokens: Math.min(4000, 200 + segments.join('').length * 3),
        feature: 'translate',
      });
      return parseArray(out && out.text);
    },
  },
  deepl: {
    async translate({ segments, target, env, fetchImpl }) {
      const url = env.DEEPL_API_URL || 'https://api-free.deepl.com/v2/translate';
      const code = { en: 'EN-US', pt: 'PT-BR', zh: 'ZH-HANS' }[target] || target.toUpperCase();
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { Authorization: 'DeepL-Auth-Key ' + env.DEEPL_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: segments, target_lang: code }),
      });
      if (!res.ok) throw Object.assign(new Error('provider'), { code: 'PROVIDER_ERROR' });
      const j = await res.json();
      return Array.isArray(j.translations) ? j.translations.map((x) => String(x.text || '')) : null;
    },
  },
  google: {
    async translate({ segments, target, env, fetchImpl }) {
      const url = 'https://translation.googleapis.com/language/translate/v2?key=' + encodeURIComponent(env.GOOGLE_TRANSLATE_API_KEY);
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: segments, target: target === 'zh' ? 'zh-CN' : target, format: 'text' }),
      });
      if (!res.ok) throw Object.assign(new Error('provider'), { code: 'PROVIDER_ERROR' });
      const j = await res.json();
      const list = j && j.data && j.data.translations;
      return Array.isArray(list) ? list.map((x) => String(x.translatedText || '')) : null;
    },
  },
};

const COMMENTARY = /^(here(?:'s| is)|translation\s*:|translated\s*:|note\s*:|\(translation)/i;

/** Output checks: same shape, no commentary, sane length, reads as the target language. */
function validSegments(inputs, outs, target) {
  if (!Array.isArray(outs) || outs.length !== inputs.length) return false;
  for (let i = 0; i < outs.length; i++) {
    const o = String(outs[i] || '').trim();
    if (!o) return false;
    if (COMMENTARY.test(o) && !COMMENTARY.test(inputs[i])) return false;
    if (o.length > inputs[i].length * 4 + 40) return false;
  }
  const visible = outs.join('\n').replace(/⟦\s*\d+\s*⟧/g, ' ');
  return AiLang.validate(visible, target).ok;
}

/** Same word filter as the source surface. */
function moderate(surface, source, out) {
  if (FILTERED_SURFACE.test(surface) || !WordSafety.isBlocked(source)) return WordSafety.clean(out);
  return out;
}

function sha(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}
function cacheId(text, target, v) {
  return sha(String(text) + '\u0000' + target + '\u0000' + String(v == null ? '' : v)).slice(0, 40);
}
function dayKey(t) {
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * @param {object} [deps] env, db, admin (FieldValue), callAI, fetchImpl, now
 */
function createTranslator(deps) {
  const d = deps || {};
  const env = d.env || process.env;
  const now = d.now || (() => Date.now());
  const callAI = d.callAI || ((o) => require('./ai').callAI(o));
  const fetchImpl = d.fetchImpl || (typeof fetch === 'function' ? fetch : null);
  const userCap = num(env.TRANSLATE_USER_DAILY_CAP, 150);
  const globalCap = num(env.TRANSLATE_DAILY_CAP, 3000);
  const local = { day: '', global: 0, users: new Map() };
  const FV = () => d.admin && d.admin.firestore && d.admin.firestore.FieldValue;

  function roll() {
    const day = dayKey(now());
    if (local.day !== day) {
      local.day = day;
      local.global = 0;
      local.users = new Map();
    }
    return day;
  }

  async function usage(uid) {
    const day = roll();
    let mine = local.users.get(uid) || 0;
    let global = local.global;
    let paused = false;
    if (d.db) {
      try {
        const [u, g, b] = await Promise.all([
          d.db.collection('translateUsage').doc(day + '_' + uid).get(),
          d.db.collection('chaupaalMeta').doc('translateBudget').get(),
          d.db.collection('chaupaalMeta').doc('aiBudget').get(),
        ]);
        if (u.exists) mine = Math.max(mine, Number((u.data() || {}).n) || 0);
        const gd = g.exists ? g.data() || {} : {};
        if (gd.day === day) global = Math.max(global, Number(gd.items) || 0);
        paused = b.exists && (b.data() || {}).paused === true;
      } catch (e) {}
    }
    return { day, mine, global, paused };
  }

  async function spend(uid, day, items, chars) {
    local.global += items;
    local.users.set(uid, (local.users.get(uid) || 0) + items);
    if (!d.db || !FV()) return;
    const inc = FV().increment;
    try {
      await Promise.all([
        d.db.collection('translateUsage').doc(day + '_' + uid).set({ uid, day, n: inc(items), at: now() }, { merge: true }),
        d.db.collection('chaupaalMeta').doc('translateBudget').get().then((s) => {
          const ref = d.db.collection('chaupaalMeta').doc('translateBudget');
          if (!s.exists || (s.data() || {}).day !== day) return ref.set({ day, items, chars }, { merge: true });
          return ref.set({ day, items: inc(items), chars: inc(chars) }, { merge: true });
        }),
      ]);
    } catch (e) {}
  }

  async function stats(day, rows) {
    if (!d.db || !FV() || !Object.keys(rows).length) return;
    const inc = FV().increment;
    const surfaces = {};
    Object.keys(rows).forEach((s) => {
      surfaces[s] = {};
      Object.keys(rows[s]).forEach((k) => rows[s][k] && (surfaces[s][k] = inc(rows[s][k])));
    });
    try {
      await d.db.collection('translateStats').doc(day).set({ day, surfaces, updatedAt: now() }, { merge: true });
    } catch (e) {}
  }

  async function cacheGet(id) {
    if (!d.db) return null;
    try {
      const snap = await d.db.collection('translateCache').doc(id).get();
      if (!snap.exists) return null;
      const c = snap.data() || {};
      if (!c.t || now() - (Number(c.at) || 0) > CACHE_TTL_MS) return null;
      return c;
    } catch (e) {
      return null;
    }
  }
  async function cachePut(id, row) {
    if (!d.db) return;
    try {
      await d.db.collection('translateCache').doc(id).set(row);
    } catch (e) {}
  }

  /** One text → { ok, text, truncated } via the provider (placeholders, lines, chunks, checks). */
  async function translateOne(text, source, target, f) {
    const { chunks, truncated } = chunk(text, f.maxChars, f.maxChunks);
    const done = [];
    let calls = 0;
    for (const c of chunks) {
      const { masked, tokens } = protect(c);
      const { parts, idx } = splitLines(masked);
      const segments = idx.map((i) => parts[i]);
      if (!segments.length) {
        done.push(c);
        continue;
      }
      calls++;
      const outs = await PROVIDERS[f.provider].translate({ segments, source, target, env, callAI, fetchImpl });
      if (!validSegments(segments, outs, target)) return { ok: false, calls };
      const merged = parts.slice();
      idx.forEach((i, k) => (merged[i] = outs[k]));
      const restored = restore(merged.join(''), tokens);
      if (restored == null) return { ok: false, calls };
      done.push(restored);
    }
    return { ok: true, text: done.join(''), truncated, calls };
  }

  /**
   * @param {string} uid
   * @param {{ target, items: [{ text, surface, scope, v, src }] }} body
   */
  async function translate(uid, body, opts) {
    const f = flags(env);
    // Global L8: "Use AI features" off → private text is not sent to an AI translator.
    const privateBlocked = !!(opts && opts.userAiOff) && f.provider === 'llm';
    if (!f.enabled) throw Object.assign(new Error('Translation is off'), { code: 'TRANSLATE_OFF' });
    const target = AiLang.normalize(body && body.target);
    const list = (Array.isArray(body && body.items) ? body.items : []).slice(0, MAX_ITEMS);
    if (!list.length) throw Object.assign(new Error('Nothing to translate'), { code: 'VALIDATION_ERROR' });
    const rows = {};
    const row = (s) => (rows[s] = rows[s] || { requests: 0, items: 0, cacheHits: 0, aiCalls: 0, failures: 0, capped: 0, chars: 0, costUsd: 0 });
    const out = [];
    let { day, mine, global, paused } = await usage(uid);
    for (const it of list) {
      const text = String((it && it.text) || '').slice(0, f.maxChars * f.maxChunks + 500);
      const surface = SURFACES.test(String(it && it.surface)) ? String(it.surface) : 'other';
      const scope = it && it.scope === 'public' ? 'public' : 'private';
      const r = row(surface);
      r.requests++;
      if (!text.trim()) {
        out.push({ ok: false, error: 'failed' });
        continue;
      }
      if (scope === 'private' && privateBlocked) {
        out.push({ ok: false, error: 'ai_off' });
        continue;
      }
      const id = scope === 'public' ? cacheId(text, target, it.v) : null;
      if (id) {
        const hit = await cacheGet(id);
        if (hit) {
          r.cacheHits++;
          out.push({ ok: true, text: hit.t, src: hit.s || 'und', cached: true, truncated: !!hit.tr });
          continue;
        }
      }
      if (paused || mine >= userCap || global >= globalCap) {
        r.capped++;
        out.push({ ok: false, error: 'limit' });
        continue;
      }
      let res;
      try {
        res = await translateOne(text, it.src || 'und', target, f);
      } catch (e) {
        res = { ok: false, calls: 1 };
      }
      r.aiCalls += res.calls || 0;
      mine += 1;
      global += 1;
      r.items++;
      r.chars += text.length;
      r.costUsd += text.length * (COST_PER_CHAR[f.provider] || COST_PER_CHAR.llm);
      await spend(uid, day, 1, text.length);
      if (!res.ok) {
        r.failures++;
        out.push({ ok: false, error: 'failed' });
        continue;
      }
      const clean = moderate(surface, text, res.text);
      if (id) await cachePut(id, { t: clean, s: it.src || 'und', target, surface, tr: !!res.truncated, at: now() });
      out.push({ ok: true, text: clean, src: it.src || 'und', cached: false, truncated: !!res.truncated });
    }
    await stats(day, rows);
    return { target, items: out };
  }

  return { translate, flags: () => flags(env) };
}

let shared = null;
function sharedTranslator(deps) {
  if (!shared) shared = createTranslator(deps);
  return shared;
}

module.exports = { createTranslator, sharedTranslator, flags, protect, restore, chunk, splitLines, moderate, cacheId, PROVIDERS, MAX_ITEMS, COST_PER_CHAR };
