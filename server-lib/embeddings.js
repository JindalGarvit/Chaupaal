/**
 * Embedding adapters (independent of AI_FEATURES_ENABLED chat kill-switch).
 * Default: Gemini. Optional: OpenAI-compatible /embeddings.
 *
 * Env:
 *   EMBED_PROVIDER=gemini|openai-compatible  (default gemini)
 *   GEMINI_API_KEY / GOOGLE_API_KEY + GEMINI_EMBED_MODEL
 *   OPENAI_API_KEY + OPENAI_BASE_URL + OPENAI_EMBED_MODEL
 */
'use strict';

const crypto = require('crypto');

const EMBED_PROVIDER = (process.env.EMBED_PROVIDER || 'gemini').toLowerCase();
const GEMINI_MODEL = process.env.GEMINI_EMBED_MODEL || 'text-embedding-004';

function textHash(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex').slice(0, 40);
}

async function embedGemini(text) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  if (!key) {
    const err = new Error('GEMINI_API_KEY missing');
    err.code = 'NO_GEMINI';
    throw err;
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:embedContent`;
  const body = {
    model: `models/${GEMINI_MODEL}`,
    content: { parts: [{ text: text || 'Chaupaal profile' }] },
  };
  const res = await fetch(`${url}?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = new Error(`Gemini embed failed: ${res.status}`);
    err.code = 'GEMINI_EMBED_FAIL';
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const values = data?.embedding?.values || data?.embeddings?.[0]?.values;
  if (!Array.isArray(values) || !values.length) {
    const err = new Error('Empty embedding');
    err.code = 'EMPTY_EMBED';
    throw err;
  }
  return { vector: values, provider: 'gemini', model: GEMINI_MODEL };
}

async function embedOpenAICompatible(text) {
  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_API_KEY || '';
  if (!apiKey) {
    const err = new Error('OPENAI_API_KEY missing for embeddings');
    err.code = 'NO_OPENAI_EMBED';
    throw err;
  }
  const base = String(process.env.OPENAI_BASE_URL || process.env.AI_BASE_URL || 'https://api.openai.com/v1')
    .replace(/\/$/, '');
  const model = process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small';
  const res = await fetch(`${base}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input: String(text || 'Chaupaal profile').slice(0, 8000) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || `OpenAI embed HTTP ${res.status}`);
    err.code = 'OPENAI_EMBED_FAIL';
    err.status = res.status;
    throw err;
  }
  const values = data?.data?.[0]?.embedding;
  if (!Array.isArray(values) || !values.length) {
    const err = new Error('Empty embedding');
    err.code = 'EMPTY_EMBED';
    throw err;
  }
  return { vector: values, provider: 'openai-compatible', model };
}

/**
 * @returns {Promise<number[]>} vector only (matchmaking.js compat)
 */
async function embedText(text) {
  const provider = EMBED_PROVIDER === 'openai' || EMBED_PROVIDER === 'openai-compatible'
    ? 'openai-compatible'
    : 'gemini';
  try {
    if (provider === 'openai-compatible') {
      const r = await embedOpenAICompatible(text);
      return r.vector;
    }
    const r = await embedGemini(text);
    return r.vector;
  } catch (e) {
    // Fail over: if openai fails and gemini key exists, try gemini once
    if (provider === 'openai-compatible' && (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)) {
      const r = await embedGemini(text);
      return r.vector;
    }
    throw e;
  }
}

async function embedTextDetailed(text) {
  const provider = EMBED_PROVIDER === 'openai' || EMBED_PROVIDER === 'openai-compatible'
    ? 'openai-compatible'
    : 'gemini';
  if (provider === 'openai-compatible') return embedOpenAICompatible(text);
  return embedGemini(text);
}

/** True when the configured embed provider has a key (independent of AI_FEATURES_ENABLED). */
function embeddingsConfigured() {
  const provider =
    EMBED_PROVIDER === 'openai' || EMBED_PROVIDER === 'openai-compatible'
      ? 'openai-compatible'
      : 'gemini';
  if (provider === 'openai-compatible') {
    return !!(process.env.OPENAI_API_KEY || process.env.AI_API_KEY);
  }
  return !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}

function embedProviderModel() {
  const provider =
    EMBED_PROVIDER === 'openai' || EMBED_PROVIDER === 'openai-compatible'
      ? 'openai-compatible'
      : 'gemini';
  if (provider === 'openai-compatible') {
    return {
      provider,
      model: process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small',
    };
  }
  return { provider: 'gemini', model: GEMINI_MODEL };
}

module.exports = {
  EMBED_PROVIDER,
  GEMINI_MODEL,
  textHash,
  embedText,
  embedTextDetailed,
  embeddingsConfigured,
  embedProviderModel,
};
