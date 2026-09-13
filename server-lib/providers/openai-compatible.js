/**
 * OpenAI-compatible Chat Completions adapter.
 * Covers OpenAI, Grok (xAI), and most cheap providers with an OpenAI-shaped API.
 *
 * Env:
 *   OPENAI_API_KEY / AI_API_KEY          — bearer token
 *   OPENAI_BASE_URL / AI_BASE_URL        — default https://api.openai.com/v1
 *   AI_MODEL_FAST / AI_MODEL_BALANCED    — model ids for this provider
 */
'use strict';

async function complete(req) {
  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_API_KEY || process.env.GROK_API_KEY || '';
  if (!apiKey) {
    const err = new Error('OPENAI_API_KEY (or AI_API_KEY / GROK_API_KEY) is not configured');
    err.code = 'AI_NOT_CONFIGURED';
    throw err;
  }
  const base = String(process.env.OPENAI_BASE_URL || process.env.AI_BASE_URL || 'https://api.openai.com/v1')
    .replace(/\/$/, '');
  const url = `${base}/chat/completions`;

  const messages = [];
  if (req.system) messages.push({ role: 'system', content: String(req.system) });
  (req.messages || []).forEach((m) => {
    if (!m) return;
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    messages.push({ role, content });
  });

  const payload = {
    model: req.model,
    max_tokens: req.max_tokens || 1024,
    messages,
  };
  // Web search is Anthropic-specific — ignore enableWebSearch here (determinism: no vendor branch in callers)

  const upstream = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok) {
    const msg = data?.error?.message || data?.error || `OpenAI-compatible HTTP ${upstream.status}`;
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    err.code = 'UPSTREAM_ERROR';
    err.status = upstream.status;
    err.details = data;
    throw err;
  }
  return data;
}

function extractText(data) {
  const choice = data?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((c) => (typeof c === 'string' ? c : c?.text || '')).join('\n');
  }
  return '';
}

module.exports = {
  id: 'openai-compatible',
  complete,
  extractText,
};
