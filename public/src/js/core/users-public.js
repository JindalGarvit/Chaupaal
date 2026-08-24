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
    'digitalLayout',
    'profileTheme',
    'openToMeet',
    'createdAt',
    'lookingFor',
    'matchIntent',
    'intents',
    'occupation',
    'personality',
    'gender',
    'industry',
    'purpose',
    'avatarDisplay',
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
      'gender',
      'industry',
      'purpose',
      'avatarDisplay',
      'profileMedia',
      'sectionOrder',
      'customSections',
      'digitalLayout',
      'profileTheme',
    ];
    allow.forEach((k) => {
      if (profile[k] != null) out[k] = profile[k];
    });
    // Phase 3: never project private / friends-only Digital blocks to users_public
    if (out.digitalLayout && typeof DigitalLayout?.publicDigitalLayoutProjection === 'function') {
      out.digitalLayout = DigitalLayout.publicDigitalLayoutProjection({ ...profile, digitalLayout: out.digitalLayout });
    } else if (out.digitalLayout?.blocks) {
      out.digitalLayout = {
        ...out.digitalLayout,
        blocks: (out.digitalLayout.blocks || []).filter((b) => b && b.visible !== false && b.privacy === 'public'),
      };
    }
    if (Array.isArray(out.customSections)) {
      out.customSections = out.customSections.filter((c) => c && c.privacy !== 'private' && c.privacy !== 'friends');
    }
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
    // Public digital layout: public blocks only
    const layoutSrc = u.digitalLayout || u.profile?.digitalLayout;
    if (layoutSrc) {
      if (typeof DigitalLayout?.publicDigitalLayoutProjection === 'function') {
        proj.digitalLayout = DigitalLayout.publicDigitalLayoutProjection({
          ...u,
          ...u.profile,
          digitalLayout: layoutSrc,
        });
      } else {
        proj.digitalLayout = {
          version: layoutSrc.version || 1,
          blocks: (layoutSrc.blocks || []).filter((b) => b && b.visible !== false && (!b.privacy || b.privacy === 'public')),
        };
      }
    }
    if (u.profileTheme || u.profile?.profileTheme) {
      const th = u.profileTheme || u.profile.profileTheme;
      proj.profileTheme = {
        paletteId: th.paletteId,
        accent: th.accent,
        surface: th.surface,
        glow: th.glow,
        frameId: th.frameId,
        ringId: th.ringId,
      };
    }
    // Strip top-level fields whose Digital blocks are private/friends (no side-channel leak)
    if (typeof DigitalLayout?.stripProfileFieldsForAudience === 'function') {
      const merged = {
        ...u,
        ...(u.profile || {}),
        digitalLayout: layoutSrc || u.digitalLayout || u.profile?.digitalLayout,
      };
      const stripped = DigitalLayout.stripProfileFieldsForAudience(merged, 'public');
      const fieldKeys = [
        'bio',
        'prompts',
        'interests',
        'hobbies',
        'profileMedia',
        'lookingFor',
        'occupation',
        'website',
        'instagram',
        'profileLinks',
        'diet',
        'drinking',
        'smoking',
        'fitness',
      ];
      fieldKeys.forEach((k) => {
        if (!(k in stripped)) {
          delete proj[k];
          if (proj.profile) delete proj.profile[k];
        } else if (stripped[k] !== undefined) {
          proj[k] = stripped[k];
          if (proj.profile) proj.profile[k] = stripped[k];
        }
      });
      // City mirrors about.currentCity
      if (!('currentCity' in stripped)) {
        delete proj.city;
        if (proj.profile) delete proj.profile.currentCity;
      } else {
        proj.city = stripped.currentCity;
        if (proj.profile) proj.profile.currentCity = stripped.currentCity;
      }
    }
    return proj;
  }

  async function syncPublicProfile(uid, raw) {
    if (!db || !uid) return null;
    const me = typeof currentUser !== 'undefined' ? currentUser?.uid : null;
    if (me && me !== uid) return null; // only owner may write
    const src = raw || {};
    const proj = buildPublicProjection(uid, src);
    // merge:true cannot remove keys — explicitly delete privacy-stripped fields
    const del = typeof firebase !== 'undefined' && firebase.firestore?.FieldValue?.delete;
    const wipe = {};
    const maybeWipe = [
      'bio',
      'prompts',
      'interests',
      'hobbies',
      'profileMedia',
      'lookingFor',
      'occupation',
      'website',
      'instagram',
      'profileLinks',
      'diet',
      'drinking',
      'smoking',
      'fitness',
      'city',
    ];
    if (typeof del === 'function') {
      maybeWipe.forEach((k) => {
        if (proj[k] === undefined) wipe[k] = del();
      });
      if (proj.profile) {
        ['bio', 'prompts', 'interests', 'hobbies', 'profileMedia', 'currentCity', 'occupation', 'lookingFor', 'website', 'instagram', 'profileLinks'].forEach(
          (k) => {
            if (proj.profile[k] === undefined) wipe[`profile.${k}`] = del();
          }
        );
      }
    }
    try {
      await db.collection('users_public').doc(uid).set({ ...proj, ...wipe }, { merge: true });
    } catch (e) {
      console.warn('[users-public] sync', e?.message || e);
    }
    if (typeof DigitalLayout?.syncFriendDigitalProjection === 'function') {
      try {
        await DigitalLayout.syncFriendDigitalProjection(uid, {
          ...src,
          ...src.profile,
          digitalLayout: src.digitalLayout || src.profile?.digitalLayout,
        });
      } catch (e) {}
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
