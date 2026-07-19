/**
 * Auth helpers for Vercel API routes (Phase 5).
 * Verifies Firebase ID tokens via Admin SDK when configured.
 */
const crypto = require('crypto');
const admin = require('firebase-admin');
const { getBearerToken, sendError } = require('./http');

function initAdmin() {
  if (admin.apps.length) return admin;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  const cred = typeof raw === 'string' ? JSON.parse(raw) : raw;
  admin.initializeApp({ credential: admin.credential.cert(cred) });
  return admin;
}

/**
 * @returns {Promise<{ uid: string, token: string, decoded?: object, weak?: boolean }|null>}
 */
async function verifyBearer(req) {
  const token = getBearerToken(req);
  if (!token) return null;
  const app = initAdmin();
  if (app) {
    const decoded = await app.auth().verifyIdToken(token);
    return { uid: decoded.uid, token, decoded };
  }
  // Admin not configured — derive a stable pseudo-uid (rate limit / weak auth only).
  return {
    uid: 'tok_' + crypto.createHash('sha256').update(token).digest('hex').slice(0, 24),
    token,
    weak: true,
  };
}

/**
 * Require a signed-in user. Rejects if no Bearer token.
 * When Admin is missing, allows weak token identity only if allowWeak is true
 * (used by check-rate). Routes that mutate Auth/user data must set allowWeak:false.
 */
async function requireUser(req, res, { allowWeak = false } = {}) {
  try {
    const identity = await verifyBearer(req);
    if (!identity) {
      sendError(res, 401, 'UNAUTHORIZED', 'Missing or invalid auth token');
      return null;
    }
    if (identity.weak && !allowWeak) {
      sendError(
        res,
        503,
        'AUTH_NOT_CONFIGURED',
        'FIREBASE_SERVICE_ACCOUNT_JSON is required for this endpoint'
      );
      return null;
    }
    return identity;
  } catch (e) {
    sendError(res, 401, 'UNAUTHORIZED', 'Invalid or expired auth token');
    return null;
  }
}

/** Cron / machine auth via shared secret. */
function requireCronSecret(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    sendError(res, 503, 'CRON_NOT_CONFIGURED', 'CRON_SECRET is not set');
    return false;
  }
  const header = req.headers.authorization || '';
  if (header !== `Bearer ${secret}`) {
    sendError(res, 401, 'UNAUTHORIZED', 'Invalid cron credentials');
    return false;
  }
  return true;
}

/**
 * Authorization: caller may only act on their own uid.
 * @returns {boolean}
 */
function assertSameUser(res, callerUid, targetUid) {
  if (!callerUid || !targetUid || callerUid !== targetUid) {
    sendError(res, 403, 'FORBIDDEN', 'You can only modify your own data');
    return false;
  }
  return true;
}

module.exports = {
  initAdmin,
  verifyBearer,
  requireUser,
  requireCronSecret,
  assertSameUser,
};
