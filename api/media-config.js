/**
 * Media config + music search (folded into one serverless function).
 *
 * GET  → Cloudinary unsigned upload config (existing)
 * POST → { action: 'music_search' | 'music_resolve', … }
 *
 * Music lives here (not a new api/*.js) to stay under the Hobby 12-function cap.
 */
const { sendSuccess, sendError, requireMethod, parseJsonBody } = require('../server-lib/http');
const { requireUser } = require('../server-lib/auth');
const { callMusicProvider, resolveMusicPreview } = require('../server-lib/music');

async function handleGet(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=300');
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

async function handlePost(req, res) {
  const user = await requireUser(req, res, { allowWeak: true });
  if (!user) return;

  let body;
  try {
    body = parseJsonBody(req);
  } catch {
    return sendError(res, 400, 'INVALID_JSON', 'Invalid JSON body');
  }

  const action = String(body.action || '').trim();

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

  return sendError(res, 400, 'VALIDATION_ERROR', 'Unknown media action', {
    allowed: ['music_search', 'music_resolve'],
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
