/**
 * Public profile projection — users_public/{uid}.
 * Full users/{uid} is owner-only; other clients read this collection.
 */
(function () {
  'use strict';

  /** Fields allowed on users_public (and mirrored from private user docs). */
  const PUBLIC_FIELDS = [
    'uid',
    'name',
    'nameLower',
    'username',
    'usernameLower',
    'photoURL',
    'photoThumb',
    'avatar',
    'profileType',
    'city',
    'bio',
    'age',
    'interests',
    'hobbies',
    'topCat',
    'prompts',
    'icebreakers',
    'profileMedia',
    'sectionOrder',
    'customSections',
    'openToMeet',
    'createdAt',
    'lookingFor',
    'matchIntent',
    'intents',
    'occupation',
    'personality',
    'relationshipCounts',
    'profile', // nested public-ish profile slice (sanitized below)
  ];

  function sanitizeProfileNested(profile) {
    if (!profile || typeof profile !== 'object') return null;
    const out = {};
    const allow = [
      'displayName',
      'username',
      'bio',
      'interests',
      'prompts',
      'profileType',
      'currentCity',
      'occupation',
      'lookingFor',
      'age',
      'profileMedia',
      'sectionOrder',
      'customSections',
    ];
    allow.forEach((k) => {
      if (profile[k] != null) out[k] = profile[k];
    });
    return Object.keys(out).length ? out : null;
  }

  function buildPublicProjection(uid, raw) {
    const u = raw && typeof raw === 'object' ? raw : {};
    const proj = { uid: uid || u.uid || null };
    PUBLIC_FIELDS.forEach((k) => {
      if (k === 'uid') return;
      if (k === 'profile') {
        const nested = sanitizeProfileNested(u.profile);
        if (nested) proj.profile = nested;
        return;
      }
      if (u[k] !== undefined) proj[k] = u[k];
    });
    // Prefer nested city/bio when top-level missing
    if (!proj.city && u.profile?.currentCity) proj.city = u.profile.currentCity;
    if (!proj.bio && u.profile?.bio) proj.bio = u.profile.bio;
    if (!proj.nameLower && proj.name) proj.nameLower = String(proj.name).toLowerCase().trim();
    if (!proj.usernameLower && proj.username) {
      proj.usernameLower = String(proj.username).toLowerCase().trim();
    }
    if (!proj.profileType) {
      proj.profileType = u.profile?.profileType || 'personal';
    }
    return proj;
  }

  async function syncPublicProfile(uid, raw) {
    if (!db || !uid) return null;
    const me = typeof currentUser !== 'undefined' ? currentUser?.uid : null;
    if (me && me !== uid) return null; // only owner may write
    const proj = buildPublicProjection(uid, raw || {});
    try {
      await db.collection('users_public').doc(uid).set(proj, { merge: true });
    } catch (e) {
      console.warn('[users-public] sync', e?.message || e);
    }
    return proj;
  }

  async function getPublicProfile(uid) {
    if (!db || !uid) return null;
    try {
      const snap = await db.collection('users_public').doc(uid).get();
      if (snap.exists) return { uid, ...snap.data() };
      // Self: backfill from private doc once
      if (currentUser?.uid === uid) {
        const priv = await db.collection('users').doc(uid).get();
        if (priv.exists) {
          return syncPublicProfile(uid, priv.data());
        }
      }
    } catch (e) {
      console.warn('[users-public] get', e?.message || e);
    }
    return null;
  }

  async function getPublicProfiles(uids) {
    const ids = [...new Set((uids || []).filter(Boolean))].slice(0, 30);
    if (!db || !ids.length) return {};
    const out = {};
    try {
      const snap = await db
        .collection('users_public')
        .where(firebase.firestore.FieldPath.documentId(), 'in', ids)
        .get();
      snap.docs.forEach((d) => {
        out[d.id] = { uid: d.id, ...d.data() };
      });
    } catch (e) {
      // Fallback: parallel gets
      await Promise.all(
        ids.map(async (id) => {
          const p = await getPublicProfile(id);
          if (p) out[id] = p;
        })
      );
    }
    return out;
  }

  window.UsersPublic = {
    PUBLIC_FIELDS,
    buildPublicProjection,
    syncPublicProfile,
    getPublicProfile,
    getPublicProfiles,
  };
})();
