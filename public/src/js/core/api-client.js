/**
 * Shared client helpers for standardized /api envelopes (Phase 5).
 * Success: { ok: true, data }
 * Error:   { ok: false, error: { code, message, details? } }
 */
(function () {
  async function parseApiResponse(res) {
    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    if (json && typeof json.ok === 'boolean') {
      return { httpStatus: res.status, ...json };
    }
    if (res.ok) return { ok: true, data: json, httpStatus: res.status };
    return {
      ok: false,
      httpStatus: res.status,
      error: {
        code: 'HTTP_ERROR',
        message:
          (json && (typeof json.error === 'string' ? json.error : json.error?.message || json.message)) ||
          res.statusText ||
          'Request failed',
        details: json,
      },
    };
  }

  async function apiFetch(path, { method = 'GET', body, needAuth = false, idempotencyKey } = {}) {
    const headers = { Accept: 'application/json' };
    if (body != null) headers['Content-Type'] = 'application/json';
    if (needAuth) {
      try {
        const u = typeof auth !== 'undefined' ? auth.currentUser : null;
        if (u) headers.Authorization = `Bearer ${await u.getIdToken()}`;
      } catch (e) {}
    }
    if (idempotencyKey) headers['Idempotency-Key'] = String(idempotencyKey).slice(0, 128);
    const res = await fetch(path, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });
    return parseApiResponse(res);
  }

  /** Authorization helper — user may only mutate their own uid. */
  function assertOwnUid(uid) {
    const me = typeof currentUser !== 'undefined' ? currentUser?.uid : auth?.currentUser?.uid;
    return !!(me && uid && me === uid);
  }

  window.parseApiResponse = parseApiResponse;
  window.apiFetch = apiFetch;
  window.assertOwnUid = assertOwnUid;
})();
