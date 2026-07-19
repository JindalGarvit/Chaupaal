/**
 * Unified AI proxy — provider-agnostic.
 * Route: POST /api/anthropic (legacy path kept; also reachable as /api/ai via vercel rewrite).
 *
 * Body: { model|tier, messages, system?, max_tokens?, enableWebSearch?, feature? }
 * Success: { ok: true, data } where data keeps Anthropic-compatible { content, ... }
 *           plus { text } for convenience.
 *
 * Master kill-switch: AI_FEATURES_ENABLED env must be "true" (default OFF).
 */
const crypto = require('crypto');
const { sendError, requireMethod, parseJsonBody } = require('../server-lib/http');
const { verifyBearer } = require('../server-lib/auth');
const { validateAnthropicBody } = require('../server-lib/validate');
const {
  getIdempotencyKey,
  beginIdempotent,
  completeIdempotent,
  abortIdempotent,
} = require('../server-lib/idempotency');
const { callAI, AiDisabledError } = require('../server-lib/ai');
const { isAiFeaturesEnabled, resolveModel } = require('../server-lib/ai-config');

function guestId(req) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  return 'guest_' + crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;

  if (!isAiFeaturesEnabled()) {
    return sendError(
      res,
      503,
      'AI_DISABLED',
      'AI features are temporarily paused. Set AI_FEATURES_ENABLED=true and enable feature_flags/ai_features when ready.'
    );
  }

  let user;
  try {
    user = await verifyBearer(req);
  } catch {
    return sendError(res, 401, 'UNAUTHORIZED', 'Invalid or expired auth token');
  }
  if (!user) user = { uid: guestId(req), weak: true };

  let incoming;
  try {
    incoming = parseJsonBody(req);
  } catch {
    return sendError(res, 400, 'INVALID_JSON', 'Invalid JSON body');
  }

  const model = resolveModel({
    model: incoming.model,
    tier: incoming.tier,
  });
  const toValidate = { ...incoming, model };

  const checked = validateAnthropicBody(toValidate);
  if (!checked.ok) {
    return sendError(res, 400, 'VALIDATION_ERROR', checked.message);
  }

  const idKey = getIdempotencyKey(req);
  const idem = beginIdempotent('ai', user.uid, idKey);
  if (idem?.conflict) {
    return sendError(res, 409, 'DUPLICATE_REQUEST', 'Identical AI request already in flight');
  }
  if (idem?.replay) {
    return res.status(idem.status).json(idem.body);
  }

  try {
    const result = await callAI({
      model: checked.value.model,
      messages: checked.value.messages,
      system: checked.value.system,
      max_tokens: checked.value.max_tokens,
      enableWebSearch: incoming.enableWebSearch === true,
      feature: typeof incoming.feature === 'string' ? incoming.feature.slice(0, 64) : null,
    });

    const data = {
      ...(result.raw || {}),
      content: result.content,
      text: result.text,
    };
    const envelope = { ok: true, data };
    completeIdempotent(idem, 200, envelope);
    return res.status(200).json(envelope);
  } catch (err) {
    abortIdempotent(idem);
    if (err instanceof AiDisabledError || err.code === 'AI_DISABLED') {
      return sendError(res, 503, 'AI_DISABLED', err.message);
    }
    if (err.code === 'AI_NOT_CONFIGURED') {
      return sendError(res, 503, 'AI_NOT_CONFIGURED', err.message);
    }
    if (err.code === 'UPSTREAM_ERROR') {
      const status = err.status >= 400 && err.status < 600 ? err.status : 502;
      return sendError(res, status, 'UPSTREAM_ERROR', err.message, {
        status: err.status,
      });
    }
    return sendError(res, 502, 'UPSTREAM_UNREACHABLE', 'Failed to reach AI provider', {
      detail: err.message,
    });
  }
};
