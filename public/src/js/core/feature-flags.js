/**
 * Feature flags (Phase 4) — Firestore-native, no third-party flag service.
 *
 * Collection: feature_flags/{flagId}
 * Document shape:
 * {
 *   enabled: boolean,          // master off switch
 *   percent: number,           // 0–100 rollout (hash of uid)
 *   allowList: string[],       // always on for these uids
 *   denyList: string[],        // always off
 *   note: string               // optional description
 * }
 *
 * Client cache ~60s to stay within free Firestore read budget.
 */
(function () {
  const CACHE_TTL_MS = 60_000;
  /** @type {Map<string, { at: number, doc: object|null }>} */
  const cache = new Map();

  function hashPercent(uid, flagId) {
    const s = `${uid || 'anon'}:${flagId}`;
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h % 100;
  }

  async function fetchFlagDoc(flagId) {
    const cached = cache.get(flagId);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.doc;
    if (!db) {
      cache.set(flagId, { at: Date.now(), doc: null });
      return null;
    }
    try {
      const snap = await db.collection('feature_flags').doc(flagId).get();
      const doc = snap.exists ? snap.data() : null;
      cache.set(flagId, { at: Date.now(), doc });
      return doc;
    } catch (e) {
      console.warn('[flags]', flagId, e?.message || e);
      cache.set(flagId, { at: Date.now(), doc: null });
      return null;
    }
  }

  /**
   * @param {string} flagId
   * @param {{ uid?: string, defaultValue?: boolean }} [opts]
   */
  async function isFeatureEnabled(flagId, { uid, defaultValue = false } = {}) {
    const userId = uid || (typeof currentUser !== 'undefined' && currentUser?.uid) || auth?.currentUser?.uid || null;
    const doc = await fetchFlagDoc(flagId);
    if (!doc) return defaultValue;
    if (doc.enabled === false) return false;
    if (Array.isArray(doc.denyList) && userId && doc.denyList.includes(userId)) return false;
    if (Array.isArray(doc.allowList) && userId && doc.allowList.includes(userId)) return true;
    if (typeof doc.percent === 'number') {
      if (doc.percent <= 0) return false;
      if (doc.percent >= 100) return true;
      if (!userId) return defaultValue;
      return hashPercent(userId, flagId) < doc.percent;
    }
    return doc.enabled === true ? true : defaultValue;
  }

  function invalidateFeatureFlag(flagId) {
    if (flagId) cache.delete(flagId);
    else cache.clear();
  }

  /** Seed helpers for console / admin — does not write automatically. */
  const FLAG_SEEDS = {
    search_v1: { enabled: true, percent: 100, allowList: [], denyList: [], note: 'Universal search UI' },
    deeplinks_v1: { enabled: true, percent: 100, allowList: [], denyList: [], note: 'Shareable profile/post/chat URLs' },
    rate_limit_client: { enabled: true, percent: 100, allowList: [], denyList: [], note: 'Client calls /api/check-rate before writes' },
    /** Master AI kill-switch — keep enabled:false until launch checklist in CONTENT.md is done. */
    ai_features: {
      enabled: false,
      percent: 0,
      allowList: [],
      denyList: [],
      note: 'Master AI gate. Server also requires AI_FEATURES_ENABLED=true. Granular: CAT_LIVE_AI_PAUSED, CATEGORY_CRON_PAUSED.',
    },
  };

  window.isFeatureEnabled = isFeatureEnabled;
  window.invalidateFeatureFlag = invalidateFeatureFlag;
  window.FEATURE_FLAG_SEEDS = FLAG_SEEDS;
  window.fetchFlagDoc = fetchFlagDoc;
})();
