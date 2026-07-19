/**
 * Firebase Analytics helpers (Phase 5).
 *
 * Tracks: signup, login, profile_completion, post_created, message_sent.
 * No new analytics vendor — uses the Firebase Analytics already in our stack.
 *
 * Enable Analytics in Firebase Console if events do not appear. measurementId
 * is optional in SDK ≥7.20 (fetched dynamically) but can be added to firebaseConfig.
 *
 * PRE-LAUNCH NOTE — centralized error logging (SKIPPED for now):
 * Do not add Sentry/LogRocket yet; console + Vercel function logs are enough
 * pre-launch. Recommended when approaching launch: Sentry free tier for
 * aggregated client + API exceptions.
 */
(function () {
  let analytics = null;

  function getAnalytics() {
    if (analytics) return analytics;
    try {
      if (typeof firebase !== 'undefined' && firebase.analytics) {
        analytics = firebase.analytics();
      }
    } catch (e) {
      console.warn('[analytics] init skipped', e?.message || e);
      analytics = null;
    }
    return analytics;
  }

  /**
   * @param {string} name
   * @param {object} [params]
   */
  function trackEvent(name, params) {
    try {
      const a = getAnalytics();
      if (!a) return;
      const payload = { ...(params || {}), app_surface: 'chaupaal_web' };
      a.logEvent(name, payload);
    } catch (e) {
      // Never break UX for analytics
    }
  }

  function trackSignup(extra) {
    trackEvent('sign_up', { method: 'email', ...(extra || {}) });
  }

  function trackLogin(extra) {
    trackEvent('login', { method: 'email', ...(extra || {}) });
  }

  function trackProfileCompletion(stats) {
    trackEvent('profile_completion', {
      percent: stats?.pct ?? 0,
      missing_count: Array.isArray(stats?.missing) ? stats.missing.length : 0,
    });
  }

  function trackPostCreated(kind) {
    trackEvent('post_created', { content_type: kind || 'unknown' });
  }

  function trackMessageSent(extra) {
    trackEvent('message_sent', { ...(extra || {}) });
  }

  /**
   * Game analytics helper — game_started / game_completed with shared params.
   * @param {'game_started'|'game_completed'} name
   * @param {{ game_type: string, mode?: string, result?: string, time_spent_ms?: number }} params
   */
  function trackGameEvent(name, params) {
    const p = params || {};
    trackEvent(name, {
      game_type: p.game_type || 'unknown',
      ...(p.mode != null ? { mode: p.mode } : {}),
      ...(p.result != null ? { result: p.result } : {}),
      ...(p.time_spent_ms != null ? { time_spent_ms: p.time_spent_ms } : {}),
    });
  }

  /**
   * Short-lived client mutation lock to prevent double-submit (posts, payments later).
   * @returns {false|function} unlock fn, or false if already in flight
   */
  const locks = new Set();
  function beginClientMutation(key, ttlMs = 8000) {
    const k = String(key || '');
    if (!k) return () => {};
    if (locks.has(k)) return false;
    locks.add(k);
    const t = setTimeout(() => locks.delete(k), ttlMs);
    return () => {
      clearTimeout(t);
      locks.delete(k);
    };
  }

  function newIdempotencyKey(prefix) {
    return `${prefix || 'op'}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  window.trackEvent = trackEvent;
  window.trackSignup = trackSignup;
  window.trackLogin = trackLogin;
  window.trackProfileCompletion = trackProfileCompletion;
  window.trackPostCreated = trackPostCreated;
  window.trackMessageSent = trackMessageSent;
  window.trackGameEvent = trackGameEvent;
  window.beginClientMutation = beginClientMutation;
  window.newIdempotencyKey = newIdempotencyKey;
})();
