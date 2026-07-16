/**
 * POST /api/check-rate
 * Body: { action: 'like'|'follow'|'message'|'comment'|'post' }
 * Auth: Bearer Firebase ID token
 */
const { LIMITS, checkActionRateLimit } = require('./lib/rate-limit');
const { sendSuccess, sendError, requireMethod, parseJsonBody } = require('./lib/http');
const { requireUser } = require('./lib/auth');
const { asEnum } = require('./lib/validate');

module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;

  const user = await requireUser(req, res, { allowWeak: true });
  if (!user) return;

  let body;
  try {
    body = parseJsonBody(req);
  } catch {
    return sendError(res, 400, 'INVALID_JSON', 'Invalid JSON body');
  }

  const action = asEnum(body?.action, Object.keys(LIMITS));
  if (!action) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid action', {
      allowed: Object.keys(LIMITS),
    });
  }

  try {
    const result = await checkActionRateLimit(user.uid, action);

    if (!result.configured) {
      return sendSuccess(res, {
        action,
        degraded: true,
        remaining: null,
        limits: LIMITS[action],
        message: 'Upstash not configured — allowing',
      });
    }

    if (!result.ok) {
      res.setHeader('Retry-After', '60');
      return sendError(res, 429, 'RATE_LIMITED', `Too many ${action}s — try again shortly.`, {
        action,
        remaining: result.remaining,
        reset: result.reset,
        limit: result.limit,
        window: result.window,
        limits: LIMITS[action],
      });
    }

    return sendSuccess(res, {
      action,
      remaining: result.remaining,
      reset: result.reset,
      limit: result.limit,
      limits: LIMITS[action],
    });
  } catch (e) {
    console.error('[check-rate]', e?.message || e);
    // Fail open for genuine users during outages
    return sendSuccess(res, {
      action,
      degraded: true,
      message: 'rate_check_failed',
    });
  }
};
