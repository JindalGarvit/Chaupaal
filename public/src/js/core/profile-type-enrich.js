/**
 * profileType enrich — backfill missing denormalized profileType on user blobs.
 * Batched Firestore reads + short in-memory TTL cache. Safe no-op if offline.
 *
 * TTL 5m / batch 10 (`in` query limit) — delete this module once old content ages out.
 */
(function () {
  'use strict';

  const CACHE_TTL_MS = 5 * 60 * 1000;
  const BATCH = 10;
  /** @type {Map<string, { type: string, expires: number }>} */
  const cache = new Map();

  function normalizeType(v) {
    return String(v || 'personal').toLowerCase() === 'professional' ? 'professional' : 'personal';
  }

  function ownProfileType() {
    if (typeof getProfileType === 'function') return normalizeType(getProfileType());
    const fromDp =
      typeof digitalProfile !== 'undefined' ? digitalProfile?.profileType : null;
    const fromUp =
      typeof userProfile !== 'undefined'
        ? userProfile?.profileType || userProfile?.profile?.profileType
        : null;
    return normalizeType(fromDp || fromUp);
  }

  function typeFromUserDoc(data) {
    if (!data) return null;
    const raw = data.profileType || data.profile?.profileType;
    if (raw == null || raw === '') return null;
    return normalizeType(raw);
  }

  function cachedProfileType(uid) {
    if (!uid) return null;
    const hit = cache.get(uid);
    if (!hit) return null;
    if (hit.expires < Date.now()) {
      cache.delete(uid);
      return null;
    }
    return hit.type;
  }

  function putCache(uid, type) {
    if (!uid) return;
    cache.set(uid, { type: normalizeType(type), expires: Date.now() + CACHE_TTL_MS });
  }

  function readTypeFromObject(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (obj.profileType) return normalizeType(obj.profileType);
    if (obj.profile?.profileType) return normalizeType(obj.profile.profileType);
    return null;
  }

  /**
   * Apply profileType onto objects missing it. Mutates in place.
   * @param {object[]} objects
   * @param {{ uidKey?: string }} [opts]
   */
  async function enrichUsersWithProfileType(objects, opts) {
    const list = Array.isArray(objects) ? objects.filter(Boolean) : [];
    if (!list.length) return list;
    const uidKey = opts?.uidKey || 'uid';

    const missingUids = [];
    const seen = new Set();

    list.forEach((obj) => {
      const existing = readTypeFromObject(obj);
      if (existing) {
        obj.profileType = existing;
        const uid = obj[uidKey] || obj.uid;
        if (uid) putCache(uid, existing);
        return;
      }
      const uid = obj[uidKey] || obj.uid;
      if (!uid || uid === 'me' || uid === 'anon') return;
      const cached = cachedProfileType(uid);
      if (cached) {
        obj.profileType = cached;
        return;
      }
      if (!seen.has(uid)) {
        seen.add(uid);
        missingUids.push(uid);
      }
    });

    if (!missingUids.length || typeof db === 'undefined' || !db) return list;

    try {
      for (let i = 0; i < missingUids.length; i += BATCH) {
        const chunk = missingUids.slice(i, i + BATCH);
        const snap = await db
          .collection('users_public')
          .where(firebase.firestore.FieldPath.documentId(), 'in', chunk)
          .get();
        const found = new Set();
        snap.docs.forEach((doc) => {
          const type = typeFromUserDoc(doc.data()) || 'personal';
          putCache(doc.id, type);
          found.add(doc.id);
        });
        chunk.forEach((uid) => {
          if (!found.has(uid)) putCache(uid, 'personal');
        });
      }
    } catch (e) {
      console.warn('[profile-type-enrich] batch failed', e?.message || e);
      return list;
    }

    list.forEach((obj) => {
      if (readTypeFromObject(obj)) return;
      const uid = obj[uidKey] || obj.uid;
      const cached = cachedProfileType(uid);
      if (cached) obj.profileType = cached;
    });

    return list;
  }

  /** Sync: prefer object field, then cache by uid — never throws. */
  function resolveProfileTypeForDisplay(objOrType) {
    if (objOrType == null) return 'personal';
    if (typeof objOrType === 'string') return normalizeType(objOrType);
    const direct = readTypeFromObject(objOrType);
    if (direct) return direct;
    const uid = objOrType.uid || objOrType.userId;
    return cachedProfileType(uid) || 'personal';
  }

  window.ownProfileType = ownProfileType;
  window.enrichUsersWithProfileType = enrichUsersWithProfileType;
  window.cachedProfileType = cachedProfileType;
  window.resolveProfileTypeForDisplay = resolveProfileTypeForDisplay;
  window.putProfileTypeCache = putCache;
})();
