/**
 * Client helper for Upstash-backed rate limits (Phase 4).
 * Calls POST /api/check-rate before sensitive writes.
 * If the API or Upstash is not configured, allows the action (degraded open).
 * Phase 5: reads standardized { ok, data } / { ok:false, error } envelope.
 */
(function () {
  const ACTIONS = ['like', 'follow', 'message', 'comment', 'post'];

  async function checkRateLimit(action) {
    if (!ACTIONS.includes(action)) return { ok: true, skipped: true };
    try {
      if (typeof isFeatureEnabled === 'function') {
        const on = await isFeatureEnabled('rate_limit_client', { defaultValue: true });
        if (!on) return { ok: true, skipped: true };
      }
      const user = auth?.currentUser;
      if (!user) return { ok: true, skipped: true };

      let envelope;
      if (typeof apiFetch === 'function') {
        envelope = await apiFetch('/api/check-rate', {
          method: 'POST',
          needAuth: true,
          body: { action },
        });
      } else {
        const token = await user.getIdToken();
        const res = await fetch('/api/check-rate', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action }),
        });
        envelope = typeof parseApiResponse === 'function'
          ? await parseApiResponse(res)
          : { ok: res.ok, httpStatus: res.status, data: await res.json().catch(() => ({})) };
      }

      if (envelope.httpStatus === 429 || envelope.error?.code === 'RATE_LIMITED') {
        if (typeof SoundLib !== 'undefined' && SoundLib.rateLimited) SoundLib.rateLimited();
        return {
          ok: false,
          remaining: envelope.error?.details?.remaining ?? envelope.data?.remaining,
          reset: envelope.error?.details?.reset,
          message: envelope.error?.message || 'Too many actions — slow down a bit.',
        };
      }
      if (!envelope.ok && envelope.httpStatus >= 500) {
        return { ok: true, degraded: true };
      }
      if (!envelope.ok) {
        // Auth/validation issues — fail open for UX (writes still gated by Firestore rules)
        return { ok: true, degraded: true };
      }
      return {
        ok: true,
        remaining: envelope.data?.remaining,
        reset: envelope.data?.reset,
        degraded: !!envelope.data?.degraded,
      };
    } catch (e) {
      return { ok: true, degraded: true };
    }
  }

  async function withRateLimit(action, fn) {
    const check = await checkRateLimit(action);
    if (!check.ok) {
      if (typeof showToast === 'function') showToast(check.message || 'Slow down');
      return { ok: false, rateLimited: true };
    }
    const result = await fn();
    return { ok: true, result };
  }

  window.checkRateLimit = checkRateLimit;
  window.withRateLimit = withRateLimit;
  window.RATE_LIMIT_ACTIONS = ACTIONS;
})();
