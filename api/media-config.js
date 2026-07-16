/**
 * Public Cloudinary config for client uploads.
 * Only expose cloud name + unsigned upload preset — never the API secret.
 */
const { sendSuccess, sendError, requireMethod } = require('./lib/http');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=300');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    return res.status(204).end();
  }
  if (!requireMethod(req, res, 'GET')) return;

  const cloudName = typeof process.env.CLOUDINARY_CLOUD_NAME === 'string'
    ? process.env.CLOUDINARY_CLOUD_NAME.trim()
    : '';
  const uploadPreset = typeof process.env.CLOUDINARY_UPLOAD_PRESET === 'string'
    ? process.env.CLOUDINARY_UPLOAD_PRESET.trim()
    : '';

  if (!cloudName || !uploadPreset) {
    return sendError(res, 503, 'MEDIA_NOT_CONFIGURED', 'Cloudinary is not configured', {
      configured: false,
    });
  }

  // Validate env shape (no spaces / empty)
  if (cloudName.length > 64 || uploadPreset.length > 64) {
    return sendError(res, 500, 'CONFIG_INVALID', 'Cloudinary env values look invalid');
  }

  return sendSuccess(res, {
    provider: 'cloudinary',
    cloudName,
    uploadPreset,
    configured: true,
  });
};
