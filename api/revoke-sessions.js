/**
 * Revoke Firebase Auth refresh tokens for the caller (logout-all).
 * Auth required; only acts on the verified caller's uid (authorization).
 * Idempotency-Key supported to prevent double-submit races.
 */
const { sendSuccess, sendError, requireMethod, parseJsonBody } = require('./lib/http');
const { requireUser, initAdmin, assertSameUser } = require('./lib/auth');
const {
  getIdempotencyKey,
  beginIdempotent,
  completeIdempotent,
  abortIdempotent,
} = require('./lib/idempotency');

module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;

  const user = await requireUser(req, res, { allowWeak: false });
  if (!user) return;

  let body = {};
  try {
    body = parseJsonBody(req);
  } catch {
    return sendError(res, 400, 'INVALID_JSON', 'Invalid JSON body');
  }

  // Optional targetUid — must match caller (users can only revoke themselves)
  if (body.targetUid && !assertSameUser(res, user.uid, body.targetUid)) return;

  const idKey = getIdempotencyKey(req);
  const idem = beginIdempotent('revoke-sessions', user.uid, idKey);
  if (idem?.conflict) {
    return sendError(res, 409, 'DUPLICATE_REQUEST', 'Revoke already in progress');
  }
  if (idem?.replay) {
    return res.status(idem.status).json(idem.body);
  }

  try {
    const app = initAdmin();
    if (!app) {
      abortIdempotent(idem);
      return sendError(res, 503, 'AUTH_NOT_CONFIGURED', 'Admin revoke not configured', {
        hint: 'Session docs are still revoked client-side',
      });
    }
    await app.auth().revokeRefreshTokens(user.uid);
    const payload = { ok: true, data: { uid: user.uid, revoked: true } };
    completeIdempotent(idem, 200, payload);
    return res.status(200).json(payload);
  } catch (e) {
    abortIdempotent(idem);
    const msg = e?.message || String(e);
    if (/FIREBASE_SERVICE_ACCOUNT_JSON/.test(msg)) {
      return sendError(res, 503, 'AUTH_NOT_CONFIGURED', 'Admin revoke not configured', {
        hint: 'Session docs are still revoked client-side',
      });
    }
    console.error('[revoke-sessions]', msg);
    return sendError(res, 401, 'UNAUTHORIZED', 'Unauthorized or revoke failed');
  }
};
