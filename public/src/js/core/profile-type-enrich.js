/**
 * profileType + Base palette enrich — backfill from users_public.
 * Batched Firestore reads + short in-memory TTL cache. Safe no-op if offline.
 *
 * TTL 5m / batch 10 (`in` query limit) — delete this module once old content ages out.
 */
(function () {
  'use strict';

  const CACHE_TTL_MS = 5 * 60 * 1000;
  const BATCH = 10;
  /** @type {Map<string, { type: string, theme: object|null, expires: number }>} */
  const cache = new Map();

  function normalizeType(v) {
    return String(v || 'personal').toLowerCase() === 'professional' ? 'professional' : 'personal';
  }

  function slimTheme(th) {
    if (!th || typeof th !== 'object') return null;
    if (!th.accent && !th.paletteId) return null;
    return {
      paletteId: th.paletteId || null,
      accent: th.accent || null,
      surface: th.surface || null,
      glow: th.glow || null,
      frameId: th.frameId || null,
      ringId: th.ringId || null,
    };
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

  function themeFromUserDoc(data) {
    if (!data) return null;
    return slimTheme(data.profileTheme || data.profile?.profileTheme);
  }

  function cachedEntry(uid) {
    if (!uid) return null;
    const hit = cache.get(uid);
    if (!hit) return null;
    if (hit.expires < Date.now()) {
      cache.delete(uid);
      return null;
    }
    return hit;
  }

  function cachedProfileType(uid) {
    return cachedEntry(uid)?.type || null;
  }

  function isGenericDisplayName(name) {
    const cleaned = String(name || '').trim();
    return !cleaned || /^(someone|friend|member|chat)$/i.test(cleaned);
  }

  function displayNameFromPublicDoc(data) {
    if (!data) return '';
    const d = data.displayName || data.name || '';
    if (d && !isGenericDisplayName(d)) return String(d).trim();
    if (data.username) return `@${String(data.username).replace(/^@/, '')}`;
    return '';
  }

  function putCache(uid, type, theme, displayName, username) {
    if (!uid) return;
    const prev = cache.get(uid);
    cache.set(uid, {
      type: normalizeType(type || prev?.type || 'personal'),
      theme: theme !== undefined ? theme : prev?.theme ?? null,
      displayName: displayName !== undefined ? displayName : prev?.displayName ?? '',
      username: username !== undefined ? username : prev?.username ?? '',
      expires: Date.now() + CACHE_TTL_MS,
    });
  }

  function readTypeFromObject(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (obj.profileType) return normalizeType(obj.profileType);
    if (obj.profile?.profileType) return normalizeType(obj.profile.profileType);
    return null;
  }

  /**
   * Apply profileType (+ profileTheme when available) onto objects. Mutates in place.
   * @param {object[]} objects
   * @param {{ uidKey?: string }} [opts]
   */
  async function enrichUsersWithProfileType(objects, opts) {
    const list = Array.isArray(objects) ? objects.filter(Boolean) : [];
    if (!list.length) return list;
    const uidKey = opts?.uidKey || 'uid';
    const enrichNames = !!opts?.names;

    const missingUids = [];
    const seen = new Set();

    list.forEach((obj) => {
      const uid = obj[uidKey] || obj.uid;
      const existing = readTypeFromObject(obj);
      if (existing) {
        obj.profileType = existing;
        if (uid) putCache(uid, existing, obj.profileTheme ? slimTheme(obj.profileTheme) : undefined);
      }
      const hit = uid ? cachedEntry(uid) : null;
      if (hit) {
        if (!obj.profileType) obj.profileType = hit.type;
        if (hit.theme && !obj.profileTheme) obj.profileTheme = hit.theme;
        if (enrichNames && isGenericDisplayName(obj.name)) {
          if (hit.displayName) obj.name = hit.displayName;
          else if (hit.username) obj.name = `@${hit.username}`;
        }
      }
      if (!uid || uid === 'me' || uid === 'anon') return;
      const needsTypeTheme = !obj.profileTheme && !(hit?.theme) && !existing;
      const needsName = enrichNames && isGenericDisplayName(obj.name) && !hit?.displayName && !hit?.username;
      if ((needsTypeTheme || needsName) && !seen.has(uid)) {
        seen.add(uid);
        missingUids.push(uid);
      }
    });

    if (!missingUids.length || typeof db === 'undefined' || !db) {
      list.forEach((obj) => {
        const uid = obj[uidKey] || obj.uid;
        const hit = cachedEntry(uid);
        if (hit?.theme && !obj.profileTheme) obj.profileTheme = hit.theme;
        if (hit?.type && !obj.profileType) obj.profileType = hit.type;
        if (enrichNames && isGenericDisplayName(obj.name)) {
          if (hit?.displayName) obj.name = hit.displayName;
          else if (hit?.username) obj.name = `@${hit.username}`;
        }
      });
      return list;
    }

    try {
      for (let i = 0; i < missingUids.length; i += BATCH) {
        const chunk = missingUids.slice(i, i + BATCH);
        const snap = await db
          .collection('users_public')
          .where(firebase.firestore.FieldPath.documentId(), 'in', chunk)
          .get();
        const found = new Set();
        snap.docs.forEach((doc) => {
          const data = doc.data() || {};
          const type = typeFromUserDoc(data) || 'personal';
          const theme = themeFromUserDoc(data);
          const displayName = displayNameFromPublicDoc(data);
          const username = data.username ? String(data.username).replace(/^@/, '') : '';
          putCache(doc.id, type, theme, displayName, username);
          found.add(doc.id);
        });
        chunk.forEach((uid) => {
          if (!found.has(uid)) putCache(uid, 'personal', null, '', '');
        });
      }
    } catch (e) {
      console.warn('[profile-type-enrich] batch failed', e?.message || e);
      return list;
    }

    list.forEach((obj) => {
      const uid = obj[uidKey] || obj.uid;
      const hit = cachedEntry(uid);
      if (!hit) return;
      if (!readTypeFromObject(obj)) obj.profileType = hit.type;
      if (hit.theme && !obj.profileTheme) obj.profileTheme = hit.theme;
      if (enrichNames && isGenericDisplayName(obj.name)) {
        if (hit.displayName) obj.name = hit.displayName;
        else if (hit.username) obj.name = `@${hit.username}`;
      }
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
