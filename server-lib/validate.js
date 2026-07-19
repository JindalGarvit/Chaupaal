/**
 * Lightweight input validators for API routes (Phase 5).
 */

function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function asString(v, { max = 500, min = 0 } = {}) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (s.length < min || s.length > max) return null;
  return s;
}

function asInt(v, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const n = typeof v === 'number' ? v : parseInt(v, 10);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return Math.floor(n);
}

function asEnum(v, allowed) {
  if (typeof v !== 'string') return null;
  return allowed.includes(v) ? v : null;
}

function asBoolean(v) {
  if (typeof v === 'boolean') return v;
  return null;
}

/** Anthropic Messages-ish payload bounds (cost / abuse control). */
function validateAnthropicBody(body) {
  if (!isPlainObject(body)) return { ok: false, message: 'Body must be a JSON object' };
  const model = asString(body.model, { max: 80, min: 1 });
  if (!model) return { ok: false, message: 'model is required (string)' };
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return { ok: false, message: 'messages must be a non-empty array' };
  }
  if (body.messages.length > 40) {
    return { ok: false, message: 'messages exceeds limit (40)' };
  }
  for (const m of body.messages) {
    if (!isPlainObject(m) || !asString(m.role, { max: 20 })) {
      return { ok: false, message: 'Each message needs a role' };
    }
  }
  const maxTokens = body.max_tokens != null ? asInt(body.max_tokens, { min: 1, max: 8192 }) : 1024;
  if (maxTokens == null) return { ok: false, message: 'max_tokens must be 1–8192' };
  // Rough size cap (~200KB JSON)
  try {
    if (JSON.stringify(body).length > 200_000) {
      return { ok: false, message: 'Payload too large' };
    }
  } catch {
    return { ok: false, message: 'Payload not serializable' };
  }
  return { ok: true, value: { ...body, model, max_tokens: maxTokens } };
}

module.exports = {
  isPlainObject,
  asString,
  asInt,
  asEnum,
  asBoolean,
  validateAnthropicBody,
};
