/**
 * Public profile projection — users_public/{uid}.
 * Full users/{uid} is owner-only; other clients read this collection.
 *
 * P0 privacy: profileVisibility + show* are enforced in the projection itself
 * (not UI-only). Private / Friends only → identity-only on users_public;
 * richer friends content goes to friend_projection (Firestore rules: isFriend).
 */
(function () {
  'use strict';

  /** Identity always safe on users_public (even when Private). */
  const IDENTITY_FIELDS = [
    'uid',
    'name',
    'nameLower',
    'username',
    'usernameLower',
    'photoURL',
    'photoThumb',
    'avatar',
    'profileType',
    'avatarDisplay',
    'createdAt',
    'openToMeet',
  ];

  /** Rich fields — only when visibility allows + show* flags. */
  const GATED_FIELDS = [
    'city',
    'bio',
    'age',
    'gender',
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
    'lookingFor',
    'matchIntent',
    'intents',
    'occupation',
    'personality',
    'industry',
    'purpose',
    'profile',
  ];

  /** Full allowlist (identity + gated + visibility meta). */
  const PUBLIC_FIELDS = [
    ...IDENTITY_FIELDS,
    ...GATED_FIELDS,
    'profileVisibility',
  ];

  const WIPE_KEYS = [
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
    'age',
    'gender',
    'icebreakers',
    'topCat',
    'matchIntent',
    'intents',
    'personality',
    'industry',
    'purpose',
    'sectionOrder',
    'customSections',
    'digitalLayout',
    'profileTheme',
  ];

  function normalizeVisibility(raw) {
    const u = raw && typeof raw === 'object' ? raw : {};
    const v = String(u.profileVisibility || u.profile?.profileVisibility || 'public')
      .toLowerCase()
      .trim();
    if (v === 'private') return 'private';
    if (v === 'friends only' || v === 'friends' || v === 'friends-only') return 'friends only';
    return 'public';
  }

  function flagOn(raw, key, defaultOn) {
    const u = raw && typeof raw === 'object' ? raw : {};
    const p = u.profile || {};
    if (u[key] !== undefined) return u[key] !== false && u[key] !== 'false';
    if (p[key] !== undefined) return p[key] !== false && p[key] !== 'false';
    return !!defaultOn;
  }

  function sanitizeProfileNested(profile, { visibility, showAge, showLocation, showRelationship }) {
    if (!profile || typeof profile !== 'object') return null;
    const out = {};
    const allow = [
      'displayName',
      'username',
      'profileType',
      'avatarDisplay',
      'profileVisibility',
    ];
    if (visibility === 'public') {
      allow.push('bio', 'interests', 'prompts', 'occupation', 'profileMedia', 'digitalLayout', 'profileTheme', 'sectionOrder', 'customSections', 'industry', 'purpose');
      if (showLocation) allow.push('currentCity');
      if (showAge) allow.push('age');
      if (showRelationship) allow.push('lookingFor');
      // gender is matching metadata — only when public (not a show* flag; strip if private/friends)
      allow.push('gender');
    }
    allow.forEach((k) => {
      if (profile[k] != null) out[k] = profile[k];
    });
    if (out.digitalLayout && typeof DigitalLayout?.publicDigitalLayoutProjection === 'function') {
      out.digitalLayout = DigitalLayout.publicDigitalLayoutProjection({
        ...profile,
        digitalLayout: out.digitalLayout,
      });
    } else if (out.digitalLayout?.blocks) {
      out.digitalLayout = {
        ...out.digitalLayout,
        blocks: (out.digitalLayout.blocks || []).filter(
          (b) => b && b.visible !== false && b.privacy === 'public'
        ),
      };
    }
    if (Array.isArray(out.customSections)) {
      out.customSections = out.customSections.filter(
        (c) => c && c.privacy !== 'private' && c.privacy !== 'friends'
      );
    }
    return Object.keys(out).length ? out : null;
  }

  /**
   * Apply showAge / showLocation / showRelationship / showIncome / showReligion
   * to a projected blob (mutates copy).
   */
  function applyShowFlags(proj, raw) {
    const showAge = flagOn(raw, 'showAge', true);
    const showLocation = flagOn(raw, 'showLocation', true);
    const showRelationship = flagOn(raw, 'showRelationship', true);
    // Income / religion never on world-readable public unless explicitly on
    const showIncome = flagOn(raw, 'showIncome', false);
    const showReligion = flagOn(raw, 'showReligion', false);

    if (!showAge) {
      delete proj.age;
      if (proj.profile) delete proj.profile.age;
    }
    if (!showLocation) {
      delete proj.city;
      if (proj.profile) delete proj.profile.currentCity;
    }
    if (!showRelationship) {
      delete proj.lookingFor;
      if (proj.profile) {
        delete proj.profile.lookingFor;
        delete proj.profile.relationshipStatus;
      }
    }
    // Never project income/religion onto users_public unless explicitly shown
    // (they are not in PUBLIC_FIELDS today; keep wipe hygiene)
    if (!showIncome) {
      delete proj.annualIncome;
      if (proj.profile) delete proj.profile.annualIncome;
    }
    if (!showReligion) {
      delete proj.religion;
      if (proj.profile) delete proj.profile.religion;
    }
    return proj;
  }

  function buildPublicProjection(uid, raw) {
    const u = raw && typeof raw === 'object' ? raw : {};
    const visibility = normalizeVisibility(u);
    const showAge = flagOn(u, 'showAge', true);
    const showLocation = flagOn(u, 'showLocation', true);
    const showRelationship = flagOn(u, 'showRelationship', true);

    const proj = {
      uid: uid || u.uid || null,
      profileVisibility: visibility === 'friends only' ? 'Friends only' : visibility === 'private' ? 'Private' : 'public',
    };

    IDENTITY_FIELDS.forEach((k) => {
      if (k === 'uid') return;
      if (u[k] !== undefined) proj[k] = u[k];
    });
    if (!proj.name && u.profile?.displayName) proj.name = u.profile.displayName;
    if (!proj.username && u.profile?.username) proj.username = u.profile.username;
    if (!proj.nameLower && proj.name) proj.nameLower = String(proj.name).toLowerCase().trim();
    if (!proj.usernameLower && proj.username) {
      proj.usernameLower = String(proj.username).toLowerCase().trim();
    }
    if (!proj.profileType) {
      proj.profileType = u.profile?.profileType || 'personal';
    }

    // Private / Friends only: identity + visibility only on the world-readable doc.
    if (visibility === 'private' || visibility === 'friends only') {
      const nested = {};
      if (proj.name) nested.displayName = proj.name;
      if (proj.username) nested.username = proj.username;
      if (proj.profileType) nested.profileType = proj.profileType;
      if (u.profile?.avatarDisplay != null) nested.avatarDisplay = u.profile.avatarDisplay;
      nested.profileVisibility = proj.profileVisibility;
      proj.profile = nested;
      return proj;
    }

    // Public: project gated fields then strip via Digital privacy + show*
    GATED_FIELDS.forEach((k) => {
      if (k === 'profile') {
        const nested = sanitizeProfileNested(u.profile, {
          visibility,
          showAge,
          showLocation,
          showRelationship,
        });
        if (nested) proj.profile = nested;
        return;
      }
      if (u[k] !== undefined) proj[k] = u[k];
    });
    if (!proj.city && u.profile?.currentCity) proj.city = u.profile.currentCity;
    if (!proj.bio && u.profile?.bio) proj.bio = u.profile.bio;
    if (!proj.age && u.profile?.age != null) proj.age = u.profile.age;
    if (!proj.gender && u.profile?.gender) proj.gender = u.profile.gender;

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
          blocks: (layoutSrc.blocks || []).filter(
            (b) => b && b.visible !== false && (!b.privacy || b.privacy === 'public')
          ),
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
      if (!('currentCity' in stripped)) {
        delete proj.city;
        if (proj.profile) delete proj.profile.currentCity;
      } else {
        proj.city = stripped.currentCity;
        if (proj.profile) proj.profile.currentCity = stripped.currentCity;
      }
    }

    applyShowFlags(proj, u);
    return proj;
  }

  async function syncPublicProfile(uid, raw) {
    if (!db || !uid) return null;
    const me = typeof currentUser !== 'undefined' ? currentUser?.uid : null;
    if (me && me !== uid) return null; // only owner may write
    const src = raw || {};
    const proj = buildPublicProjection(uid, src);
    // merge:true cannot remove keys — explicitly delete privacy-stripped fields
    const wipe = {};
    try {
      const del = typeof firebase !== 'undefined' && firebase.firestore?.FieldValue?.delete;
      if (typeof del === 'function') {
        WIPE_KEYS.forEach((k) => {
          if (proj[k] === undefined) wipe[k] = del();
        });
        if (proj.profile) {
          [
            'bio',
            'prompts',
            'interests',
            'hobbies',
            'profileMedia',
            'currentCity',
            'occupation',
            'lookingFor',
            'website',
            'instagram',
            'profileLinks',
            'age',
            'gender',
            'relationshipStatus',
            'annualIncome',
            'religion',
            'digitalLayout',
            'customSections',
            'sectionOrder',
          ].forEach((k) => {
            if (proj.profile[k] === undefined) wipe[`profile.${k}`] = del();
          });
        } else {
          wipe.profile = del();
        }
      }
    } catch (e) {}
    try {
      await db.collection('users_public').doc(uid).set({ ...proj, ...wipe }, { merge: true });
    } catch (e) {
      try {
        await db.collection('users_public').doc(uid).set(proj, { merge: true });
      } catch (e2) {
        console.warn('[users-public] sync', e2?.message || e2);
      }
    }
    if (typeof DigitalLayout?.syncFriendDigitalProjection === 'function') {
      try {
        await DigitalLayout.syncFriendDigitalProjection(uid, {
          ...src,
          ...src.profile,
          profileVisibility: src.profileVisibility || src.profile?.profileVisibility,
          showAge: src.showAge ?? src.profile?.showAge,
          showLocation: src.showLocation ?? src.profile?.showLocation,
          showRelationship: src.showRelationship ?? src.profile?.showRelationship,
          showIncome: src.showIncome ?? src.profile?.showIncome,
          showReligion: src.showReligion ?? src.profile?.showReligion,
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
    IDENTITY_FIELDS,
    normalizeVisibility,
    applyShowFlags,
    buildPublicProjection,
    syncPublicProfile,
    getPublicProfile,
    getPublicProfiles,
  };
})();
