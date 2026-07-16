/**
 * Anthropic Messages proxy — standardized envelope + auth + validation (Phase 5).
 *
 * Success data is the upstream Anthropic JSON (client unwraps via callAnthropic).
 * Requires signed-in user. Supports Idempotency-Key for accidental double-submits.
 */
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

const WEB_SEARCH_TOOL = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: 2,
  user_location: {
    type: 'approximate',
    country: 'IN',
    timezone: 'Asia/Kolkata',
  },
};

const { sendSuccess, sendError, requireMethod, parseJsonBody } = require('./lib/http');
const { verifyBearer } = require('./lib/auth');
const { validateAnthropicBody, asBoolean } = require('./lib/validate');
const crypto = require('crypto');
const {
  getIdempotencyKey,
  beginIdempotent,
  completeIdempotent,
  abortIdempotent,
} = require('./lib/idempotency');

function guestId(req) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  return 'guest_' + crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;

  // Prefer signed-in user; allow guest (onboarding / pre-auth AI) with IP-bound identity
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

  const checked = validateAnthropicBody(incoming);
  if (!checked.ok) {
    return sendError(res, 400, 'VALIDATION_ERROR', checked.message);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.Anthropic_API_key;
  if (!apiKey) {
    return sendError(res, 503, 'AI_NOT_CONFIGURED', 'ANTHROPIC_API_KEY is not configured');
  }

  const idKey = getIdempotencyKey(req);
  const idem = beginIdempotent('anthropic', user.uid, idKey);
  if (idem?.conflict) {
    return sendError(res, 409, 'DUPLICATE_REQUEST', 'Identical AI request already in flight');
  }
  if (idem?.replay) {
    return res.status(idem.status).json(idem.body);
  }

  try {
    const enableWebSearch = incoming.enableWebSearch === true;
    const { enableWebSearch: _drop, tools: _ignoreTools, ...rest } = checked.value;
    const payload = { ...rest };
    if (enableWebSearch) {
      payload.tools = [WEB_SEARCH_TOOL];
    }

    const upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(payload),
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      const msg = data?.error?.message || 'Anthropic request failed';
      const envelope = {
        ok: false,
        error: {
          code: 'UPSTREAM_ERROR',
          message: msg,
          details: { status: upstream.status },
        },
      };
      abortIdempotent(idem);
      return res.status(upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502).json(envelope);
    }

    const envelope = { ok: true, data };
    completeIdempotent(idem, 200, envelope);
    return res.status(200).json(envelope);
  } catch (err) {
    abortIdempotent(idem);
    return sendError(res, 502, 'UPSTREAM_UNREACHABLE', 'Failed to reach Anthropic API', {
      detail: err.message,
    });
  }
};
