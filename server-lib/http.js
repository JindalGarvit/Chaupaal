/**
 * Standard API envelope (Phase 5).
 *
 * Success: { ok: true, data: T, meta?: object }
 * Error:   { ok: false, error: { code, message, details? } }
 *
 * All /api routes should respond through sendSuccess / sendError so the
 * frontend can branch on `ok` predictably.
 */

function sendSuccess(res, data = null, { status = 200, meta, headers } = {}) {
  if (headers) {
    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
  }
  const body = { ok: true, data };
  if (meta != null) body.meta = meta;
  return res.status(status).json(body);
}

function sendError(res, status, code, message, details) {
  const body = {
    ok: false,
    error: {
      code: String(code || 'ERROR'),
      message: String(message || 'Request failed'),
    },
  };
  if (details !== undefined) body.error.details = details;
  return res.status(status).json(body);
}

function requireMethod(req, res, allowed) {
  const list = Array.isArray(allowed) ? allowed : [allowed];
  if (!list.includes(req.method)) {
    res.setHeader('Allow', list.join(', '));
    sendError(res, 405, 'METHOD_NOT_ALLOWED', `Use ${list.join(' or ')}`);
    return false;
  }
  return true;
}

function parseJsonBody(req) {
  let body = req.body;
  if (body == null || body === '') return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      const err = new Error('Invalid JSON body');
      err.code = 'INVALID_JSON';
      throw err;
    }
  }
  if (typeof body === 'object') return body;
  return {};
}

function getBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

module.exports = {
  sendSuccess,
  sendError,
  requireMethod,
  parseJsonBody,
  getBearerToken,
};
