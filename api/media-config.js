/**
 * Media config + music search (folded into one serverless function).
 *
 * GET  → Cloudinary unsigned upload config (existing)
 * POST → { action: 'music_search' | 'music_resolve', … }
 *
 * Music lives here (not a new api/*.js) to stay under the Hobby 12-function cap.
 */
const { sendSuccess, sendError, requireMethod, parseJsonBody } = require('../server-lib/http');
const { requireUser, initAdmin } = require('../server-lib/auth');
const { callMusicProvider, resolveMusicPreview } = require('../server-lib/music');
const { searchPlaces } = require('../server-lib/geocode');
const { checkUrlWithWebRisk } = require('../server-lib/url-safety');

async function handleGet(req, res) {
  const user = await requireUser(req, res, { allowWeak: false });
  if (!user) return;

  res.setHeader('Cache-Control', 'private, max-age=60');
  const cloudName =
    typeof process.env.CLOUDINARY_CLOUD_NAME === 'string'
      ? process.env.CLOUDINARY_CLOUD_NAME.trim()
      : '';
  const uploadPreset =
    typeof process.env.CLOUDINARY_UPLOAD_PRESET === 'string'
      ? process.env.CLOUDINARY_UPLOAD_PRESET.trim()
      : '';

  if (!cloudName || !uploadPreset) {
    return sendError(res, 503, 'MEDIA_NOT_CONFIGURED', 'Cloudinary is not configured', {
      configured: false,
    });
  }

  if (cloudName.length > 64 || uploadPreset.length > 64) {
    return sendError(res, 500, 'CONFIG_INVALID', 'Cloudinary env values look invalid');
  }

  return sendSuccess(res, {
    provider: 'cloudinary',
    cloudName,
    uploadPreset,
    configured: true,
  });
}

/** Pre-auth username availability — returns only { available }, never uid. */
async function handleUsernameCheck(req, res, body) {
  const username = String(body.username || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');
  if (username.length < 3 || username.length > 20) {
    return sendSuccess(res, { available: false, reason: 'invalid' });
  }
  const app = initAdmin();
  if (!app) {
    // Soft allow when Admin isn't configured (local/dev) — claim still races safely on create.
    return sendSuccess(res, { available: true, degraded: true });
  }
  try {
    const snap = await app.firestore().collection('usernames').doc(username).get();
    return sendSuccess(res, { available: !snap.exists });
  } catch (e) {
    console.warn('[media-config] username_check', e?.message || e);
    return sendSuccess(res, { available: true, degraded: true });
  }
}

async function handlePost(req, res) {
  let body;
  try {
    body = parseJsonBody(req);
  } catch {
    return sendError(res, 400, 'INVALID_JSON', 'Invalid JSON body');
  }

  const action = String(body.action || '').trim();

  // Pre-auth signup only — no Bearer required; never returns uid.
  if (action === 'username_check') {
    return handleUsernameCheck(req, res, body);
  }

  const user = await requireUser(req, res, { allowWeak: false });
  if (!user) return;

  if (action === 'music_search') {
    const query = String(body.query || '').trim();
    if (query.length < 1) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'query is required');
    }
    if (query.length > 120) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'query too long');
    }
    try {
      const result = await callMusicProvider({
        query,
        limit: body.limit,
      });
      return sendSuccess(res, result);
    } catch (e) {
      console.warn('[media-config] music_search:', e?.message || e);
      // Never block compose — empty results let the picker show "no results"
      return sendSuccess(res, { results: [], provider: null, fallbackUsed: false });
    }
  }

  if (action === 'music_resolve') {
    const title = String(body.title || '').trim();
    if (!title) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'title is required');
    }
    try {
      const resolved = await resolveMusicPreview({
        title,
        artist: body.artist,
      });
      return sendSuccess(res, resolved);
    } catch (e) {
      console.warn('[media-config] music_resolve:', e?.message || e);
      return sendSuccess(res, { previewUrl: null, source: 'none', song: null });
    }
  }

  if (action === 'geocode_search') {
    // Nominatim proxy — identifying User-Agent set server-side (browsers cannot).
    // Free-tier appropriate; consider self-hosted Nominatim / LocationIQ at scale.
    const query = String(body.query || '').trim();
    if (query.length < 2) {
      return sendSuccess(res, { results: [] });
    }
    if (query.length > 120) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'query too long');
    }
    try {
      const result = await searchPlaces(query, body.limit);
      return sendSuccess(res, result);
    } catch (e) {
      console.warn('[media-config] geocode_search:', e?.message || e);
      return sendSuccess(res, { results: [] });
    }
  }

  if (action === 'live_location_stop') {
    const shareId = String(body.shareId || '').trim();
    if (!shareId) return sendError(res, 400, 'VALIDATION_ERROR', 'shareId required');
    const admin = initAdmin();
    if (!admin) return sendError(res, 503, 'AUTH_NOT_CONFIGURED', 'Admin not configured');
    const ref = admin.firestore().collection('liveLocationShares').doc(shareId);
    const snap = await ref.get();
    if (!snap.exists) return sendError(res, 404, 'NOT_FOUND', 'Share not found');
    if (snap.data()?.uid !== user.uid) return sendError(res, 403, 'FORBIDDEN', 'Not your share');
    await ref.set(
      {
        active: false,
        stoppedAt: admin.firestore.FieldValue.serverTimestamp(),
        stopReason: 'user_stopped',
      },
      { merge: true }
    );
    return sendSuccess(res, { ok: true });
  }

  if (action === 'check_url') {
    const url = String(body.url || '').trim();
    if (!url || url.length > 2048) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'url required');
    }
    try {
      const result = await checkUrlWithWebRisk(url);
      return sendSuccess(res, result);
    } catch (e) {
      console.warn('[media-config] check_url:', e?.message || e);
      return sendSuccess(res, { safe: true, checked: false, reason: 'error' });
    }
  }

  return sendError(res, 400, 'VALIDATION_ERROR', 'Unknown media action', {
    allowed: ['music_search', 'music_resolve', 'geocode_search', 'live_location_stop', 'check_url'],
  });
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    return res.status(204).end();
  }

  if (req.method === 'GET') {
    return handleGet(req, res);
  }

  if (req.method === 'POST') {
    if (!requireMethod(req, res, 'POST')) return;
    return handlePost(req, res);
  }

  res.setHeader('Allow', 'GET, POST, OPTIONS');
  return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Use GET or POST');
};
