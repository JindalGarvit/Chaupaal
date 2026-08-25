/**
 * Unified profile open + self labels + guest Message resume.
 * Mode matrix: tab_self / baithak_self → owner; list_self / comment / third_person → preview.
 */
(function () {
  'use strict';

  const PENDING_MSG_KEY = 'chaupaal_pending_profile_message';

  const OWNER_CONTEXTS = new Set(['tab_self', 'baithak_self', 'owner', 'edit']);
  const PREVIEW_CONTEXTS = new Set([
    'list_self',
    'list_other',
    'comment',
    'discovery',
    'third_person',
    'deeplink',
    'story_viewer',
    'search',
    'friend_request',
    'peepal',
    'duniya',
    'baithak_search',
    'preview',
  ]);

  function isSelfUid(uid) {
    const me = typeof currentUser !== 'undefined' ? currentUser?.uid : null;
    return !!(me && uid && String(uid) === String(me));
  }

  function selfDisplayName() {
    const dp = typeof digitalProfile !== 'undefined' ? digitalProfile : null;
    const up = typeof userProfile !== 'undefined' ? userProfile : null;
    const authName =
      typeof currentUser !== 'undefined'
        ? currentUser?.displayName || currentUser?.email?.split?.('@')?.[0]
        : '';
    const name =
      (dp && (dp.displayName || dp.name)) ||
      (up && (up.name || up.displayName || up.profile?.displayName)) ||
      authName ||
      '';
    const cleaned = String(name || '').trim();
    if (
      !cleaned ||
      /^(someone|friend|chaupaal member|member|chat|you)$/i.test(cleaned)
    ) {
      const uname =
        (dp && dp.username) ||
        (up && (up.username || up.profile?.username)) ||
        '';
      if (uname) return String(uname).replace(/^@/, '');
      return 'You';
    }
    return cleaned;
  }

  /** Pinned list row label — never generic for self. */
  function selfListLabel() {
    const name = selfDisplayName();
    return {
      title: 'You',
      name,
      subtitle: name && name !== 'You' ? name : '',
      uid: typeof currentUser !== 'undefined' ? currentUser?.uid : '',
      photoURL:
        (typeof userProfile !== 'undefined' && (userProfile?.photoURL || userProfile?.photoThumb)) ||
        (typeof digitalProfile !== 'undefined' && digitalProfile?.photoURL) ||
        (typeof currentUser !== 'undefined' && currentUser?.photoURL) ||
        '',
      username:
        (typeof digitalProfile !== 'undefined' && digitalProfile?.username) ||
        (typeof userProfile !== 'undefined' && userProfile?.username) ||
        '',
    };
  }

  function resolveMode(opts, targetIsSelf) {
    if (opts?.initialMode === 'owner' || opts?.initialMode === 'preview') {
      return opts.initialMode;
    }
    const ctx = String(opts?.context || '').toLowerCase();
    if (!targetIsSelf) return 'preview';
    if (OWNER_CONTEXTS.has(ctx)) return 'owner';
    if (PREVIEW_CONTEXTS.has(ctx)) return 'preview';
    // Default for ambiguous self opens: preview (safer Instagram list convention)
    return 'preview';
  }

  function openOwnProfile(mode) {
    if (typeof setProfilePreviewMode === 'function') {
      setProfilePreviewMode(mode === 'preview');
    }
    if (typeof renderProfileModal === 'function') renderProfileModal();
    document.getElementById('profileModal')?.classList.remove('hidden');
  }

  /**
   * @param {object|string} target — profile blob or uid
   * @param {{ uid?: string, username?: string, context?: string, initialMode?: 'owner'|'preview' }} [opts]
   */
  function openUserProfile(target, opts) {
    const o = opts || {};
    const profile =
      target && typeof target === 'object'
        ? { ...target }
        : { uid: String(target || o.uid || '') };
    const uid = String(o.uid || profile.uid || profile.id || '').trim();
    const username = o.username || profile.username || '';
    if (uid) profile.uid = uid;
    if (username) profile.username = username;

    if (profile.isChaupaal || profile.type === 'chaupaal' || uid === 'chaupaal_ai') {
      if (typeof openChaupaalAiProfile === 'function') return openChaupaalAiProfile();
      if (typeof openChaupaalAiPeek === 'function') return openChaupaalAiPeek();
    }

    const self = isSelfUid(uid);
    const mode = resolveMode(o, self);

    if (self) {
      openOwnProfile(mode);
      return;
    }

    if (typeof openPublicProfile === 'function') {
      openPublicProfile(profile, {
        uid,
        username,
        context: o.context || 'third_person',
      });
      return;
    }
    if (username && typeof openProfileByUsername === 'function') {
      openProfileByUsername(username);
    }
  }

  function openProfileByUid(uid, opts) {
    openUserProfile({ uid }, { ...(opts || {}), uid, context: (opts && opts.context) || 'third_person' });
  }

  /** Pin self first when present; dedupe. */
  function pinYouInProfiles(profiles, opts) {
    const me = typeof currentUser !== 'undefined' ? currentUser?.uid : null;
    const list = Array.isArray(profiles) ? profiles.slice() : [];
    if (!me) return list;
    const forceYou = !!(opts && opts.forceYou);
    const you = selfListLabel();
    const rest = list.filter((p) => p && String(p.uid) !== String(me));
    const hadSelf = list.some((p) => p && String(p.uid) === String(me));
    if (!hadSelf && !forceYou) return list;
    const selfRow = {
      ...(list.find((p) => p && String(p.uid) === String(me)) || {}),
      uid: me,
      name: you.name,
      displayName: you.name,
      username: you.username || undefined,
      photoURL: you.photoURL || undefined,
      _isYou: true,
    };
    return [selfRow, ...rest];
  }

  function savePendingProfileMessage(profile) {
    const payload = {
      uid: String(profile?.uid || '').trim(),
      name: profile?.name || profile?.displayName || '',
      username: profile?.username || '',
      photoURL: profile?.photoURL || '',
      profileType: profile?.profileType || '',
      at: Date.now(),
    };
    if (!payload.uid) return;
    try {
      sessionStorage.setItem(PENDING_MSG_KEY, JSON.stringify(payload));
    } catch (e) {}
    window.__pendingProfileMessage = payload;
  }

  function consumePendingProfileMessage() {
    let payload = window.__pendingProfileMessage || null;
    try {
      const raw = sessionStorage.getItem(PENDING_MSG_KEY);
      if (raw) payload = JSON.parse(raw);
      sessionStorage.removeItem(PENDING_MSG_KEY);
    } catch (e) {}
    window.__pendingProfileMessage = null;
    if (!payload?.uid || Date.now() - (payload.at || 0) > 15 * 60 * 1000) return null;
    return payload;
  }

  async function resumePendingProfileMessage() {
    const pending = consumePendingProfileMessage();
    if (!pending?.uid) return false;
    if (isSelfUid(pending.uid)) return false;
    if (typeof openProfileMessage === 'function') {
      await openProfileMessage(pending);
      return true;
    }
    return false;
  }

  window.isSelfUid = isSelfUid;
  window.selfDisplayName = selfDisplayName;
  window.selfListLabel = selfListLabel;
  window.openUserProfile = openUserProfile;
  window.openProfileByUid = openProfileByUid;
  window.pinYouInProfiles = pinYouInProfiles;
  window.savePendingProfileMessage = savePendingProfileMessage;
  window.consumePendingProfileMessage = consumePendingProfileMessage;
  window.resumePendingProfileMessage = resumePendingProfileMessage;
})();
