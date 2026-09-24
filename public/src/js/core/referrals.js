/**
 * Growth G2 — referral capture, tagged share URLs, pending deep-link resume.
 * Scheme: content URL + ?ref={username}; optional /invite/{username}.
 * Guests never invent an inviter. Virtual chips · not real money.
 */
(function () {
  'use strict';

  const REF_STORAGE_KEY = 'chaupaal_pending_ref';
  const DEEP_STORAGE_KEY = 'chaupaal_pending_deep';
  const REF_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14d
  const CLAIMED_KEY = 'chaupaal_referral_claimed';

  function myReferralCode() {
    const u =
      (typeof userProfile !== 'undefined' && userProfile?.username) ||
      '';
    return String(u || '')
      .replace(/^@/, '')
      .toLowerCase()
      .trim()
      .slice(0, 40);
  }

  function withReferralParam(url) {
    const code = myReferralCode();
    if (!code || !url) return url;
    if (typeof currentUser === 'undefined' || !currentUser) return url;
    try {
      const u = new URL(url, location.origin);
      if (!u.searchParams.get('ref') && !u.searchParams.get('inv')) {
        u.searchParams.set('ref', code);
      }
      return u.toString();
    } catch (e) {
      const sep = String(url).includes('?') ? '&' : '?';
      if (/[?&]ref=/.test(url)) return url;
      return `${url}${sep}ref=${encodeURIComponent(code)}`;
    }
  }

  function inviteHomeUrl() {
    const code = myReferralCode();
    if (!code) return location.origin + '/';
    return withReferralParam(`${location.origin}/invite/${encodeURIComponent(code)}`);
  }

  function readPendingRef() {
    try {
      const raw = localStorage.getItem(REF_STORAGE_KEY) || sessionStorage.getItem(REF_STORAGE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj?.code) return null;
      if (obj.at && Date.now() - Number(obj.at) > REF_TTL_MS) {
        clearPendingRef();
        return null;
      }
      return obj;
    } catch (e) {
      return null;
    }
  }

  function clearPendingRef() {
    try {
      localStorage.removeItem(REF_STORAGE_KEY);
      sessionStorage.removeItem(REF_STORAGE_KEY);
    } catch (e) {}
  }

  function persistPendingRef(code) {
    const handle = String(code || '')
      .replace(/^@/, '')
      .toLowerCase()
      .trim()
      .slice(0, 40);
    if (!handle) return;
    const payload = JSON.stringify({ code: handle, at: Date.now() });
    try {
      sessionStorage.setItem(REF_STORAGE_KEY, payload);
      localStorage.setItem(REF_STORAGE_KEY, payload);
    } catch (e) {}
  }

  function stashPendingDeepLink(href) {
    try {
      const path =
        href ||
        `${location.pathname || '/'}${location.search || ''}${location.hash || ''}`;
      if (!path || path === '/' || path === '/index.html') {
        // Still stash home+ref if present
        if (!/[?&]ref=/.test(path) && !/^\/invite\//i.test(path)) return;
      }
      sessionStorage.setItem(DEEP_STORAGE_KEY, path);
      localStorage.setItem(DEEP_STORAGE_KEY, path);
    } catch (e) {}
  }

  function readPendingDeepLink() {
    try {
      return sessionStorage.getItem(DEEP_STORAGE_KEY) || localStorage.getItem(DEEP_STORAGE_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function clearPendingDeepLink() {
    try {
      sessionStorage.removeItem(DEEP_STORAGE_KEY);
      localStorage.removeItem(DEEP_STORAGE_KEY);
    } catch (e) {}
  }

  /** Capture ?ref= / ?inv= / /invite/{code} without blocking guest browse. */
  function captureReferralFromLocation() {
    try {
      const params = new URLSearchParams(location.search || '');
      let code = params.get('ref') || params.get('inv') || '';
      const inviteMatch = String(location.pathname || '').match(/^\/invite\/([^/?#]+)\/?$/i);
      if (!code && inviteMatch) code = decodeURIComponent(inviteMatch[1]);
      if (code) persistPendingRef(code);
      // Stash full intended destination for post-auth resume
      if (code || inviteMatch || params.get('challenge') || params.get('score')) {
        stashPendingDeepLink();
      } else if (location.pathname && location.pathname !== '/') {
        stashPendingDeepLink();
      }
    } catch (e) {}
  }

  async function claimPendingReferral() {
    if (typeof currentUser === 'undefined' || !currentUser) return null;
    if (typeof apiFetch !== 'function') return null;
    const pending = readPendingRef();
    if (!pending?.code) return null;
    try {
      if (localStorage.getItem(CLAIMED_KEY) === currentUser.uid) {
        clearPendingRef();
        return { ok: true, alreadyClaimedLocal: true };
      }
    } catch (e) {}

    try {
      const envelope = await apiFetch('/api/media-config', {
        method: 'POST',
        needAuth: true,
        body: { action: 'referral_claim', code: pending.code },
      });
      const data = envelope?.data || envelope || {};
      if (data.alreadyAttributed || data.attributed) {
        try {
          localStorage.setItem(CLAIMED_KEY, currentUser.uid);
        } catch (e) {}
        clearPendingRef();
      }
      if (data.reason === 'not_new_account' || data.reason === 'self_referral') {
        clearPendingRef();
      }
      if (data.attributed && data.rewards?.invitee && !data.rewards.invitee.duplicate) {
        if (typeof showToast === 'function') {
          showToast('Welcome gift: virtual chips · not real money');
        }
      } else if (data.attributed && data.copy && typeof showToast === 'function') {
        showToast(data.copy);
      }
      return data;
    } catch (e) {
      console.warn('[referrals] claim', e);
      return null;
    }
  }

  async function activateReferralIfNeeded() {
    if (typeof currentUser === 'undefined' || !currentUser) return null;
    if (typeof apiFetch !== 'function') return null;
    if (typeof hasVerifiedContact === 'function' && !hasVerifiedContact(currentUser)) return null;
    try {
      const envelope = await apiFetch('/api/media-config', {
        method: 'POST',
        needAuth: true,
        body: { action: 'referral_activate' },
      });
      return envelope?.data || envelope || null;
    } catch (e) {
      return null;
    }
  }

  async function resumePendingDeepLink() {
    const raw = readPendingDeepLink();
    if (!raw) return false;
    clearPendingDeepLink();
    try {
      let path = raw;
      let search = '';
      const qIdx = raw.indexOf('?');
      if (qIdx >= 0) {
        path = raw.slice(0, qIdx);
        search = raw.slice(qIdx);
      }
      // /invite/{code} → home with ref preserved in storage already
      if (/^\/invite\//i.test(path)) {
        history.replaceState({ chaupaalDeep: true }, '', '/' + (search || ''));
        return true;
      }
      const full = path + search;
      history.pushState({ chaupaalDeep: true }, '', full);
      const route =
        typeof parseDeepLink === 'function' ? parseDeepLink(path) : null;
      if (route && typeof handleDeepLink === 'function') {
        await handleDeepLink(route);
      }
      if (typeof checkViralLink === 'function') checkViralLink();
      return true;
    } catch (e) {
      if (typeof showToast === 'function') {
        showToast('Could not open that link — try again from share');
      }
      return false;
    }
  }

  function stashPendingAction(action) {
    try {
      if (action) sessionStorage.setItem('chaupaal_pending_action', String(action).slice(0, 40));
    } catch (e) {}
  }

  function resumePendingAction() {
    let action = '';
    try {
      action = sessionStorage.getItem('chaupaal_pending_action') || '';
      sessionStorage.removeItem('chaupaal_pending_action');
    } catch (e) {}
    if (!action) return false;
    try {
      if (action === 'duniya_compose' && typeof openDuniyaPostSheet === 'function') {
        if (typeof showTab === 'function') showTab('duniya');
        setTimeout(() => {
          try {
            if (typeof setDuniyaMode === 'function') setDuniyaMode('vishwa');
          } catch (e) {}
          openDuniyaPostSheet('post');
        }, 300);
        return true;
      }
      if (action === 'duniya_story') {
        if (typeof showTab === 'function') showTab('duniya');
        setTimeout(() => {
          try {
            if (typeof setDuniyaMode === 'function') setDuniyaMode('vishwa');
          } catch (e) {}
          if (typeof DuniyaStory?.startCreate === 'function') DuniyaStory.startCreate();
          else if (typeof openDuniyaPostSheet === 'function') openDuniyaPostSheet('story');
        }, 350);
        return true;
      }
      if (action === 'peepal_ask' && typeof openPeepalAskSheet === 'function') {
        if (typeof showTab === 'function') showTab('peepal');
        setTimeout(() => openPeepalAskSheet(), 300);
        return true;
      }
      // K4: gated Khoj Find → resume on Khoj with pending query (if any)
      if (action === 'khoj_find') {
        if (typeof showTab === 'function') showTab('peepal');
        setTimeout(() => {
          if (typeof setPeepalMode === 'function') setPeepalMode('khoj');
          else if (typeof renderKhojSurface === 'function') {
            renderKhojSurface(document.getElementById('peepalScreen'));
          }
        }, 350);
        return true;
      }
      // A1: Akhbaar flag → submit pending question report
      if (action === 'akhbaar_flag') {
        if (typeof showTab === 'function') showTab('akhbaar');
        setTimeout(() => {
          if (typeof resumeAkhbaarPendingFlag === 'function') resumeAkhbaarPendingFlag();
        }, 350);
        return true;
      }
      // A1: Akhbaar share → results share sheet (pending kind in session)
      if (action === 'akhbaar_share') {
        if (typeof showTab === 'function') showTab('akhbaar');
        setTimeout(() => {
          if (typeof wireAkhbaarShare === 'function') wireAkhbaarShare();
          let kind = 'share';
          try {
            kind = sessionStorage.getItem('chaupaal_akhbaar_pending_share') || 'share';
            sessionStorage.removeItem('chaupaal_akhbaar_pending_share');
          } catch (e) {}
          const btn = document.querySelector(`#akhbaarShareActions [data-akh-share="${kind}"]`);
          if (btn && !btn.disabled) btn.click();
          else if (typeof showToast === 'function') showToast('You’re signed in — share from results when ready');
        }, 400);
        return true;
      }
      // B3: Baithak Split compose / camera after soft-auth
      if (action === 'baithak_split' || action === 'baithak_split_camera') {
        if (typeof showTab === 'function') showTab('baithak');
        setTimeout(() => {
          if (typeof renderBaithakInstants === 'function') renderBaithakInstants();
          if (action === 'baithak_split_camera') {
            if (typeof openBaithakInstantCamera === 'function') openBaithakInstantCamera();
            else if (typeof openBaithakInstantComposer === 'function') openBaithakInstantComposer('camera');
            else if (typeof expandBaithakSplitComposer === 'function') expandBaithakSplitComposer();
          } else if (typeof expandBaithakSplitComposer === 'function') {
            expandBaithakSplitComposer();
          } else if (typeof openBaithakInstantComposer === 'function') {
            openBaithakInstantComposer();
          }
        }, 350);
        return true;
      }
    } catch (e) {}
    return false;
  }

  async function afterAuthReferralAndResume() {
    try {
      await claimPendingReferral();
    } catch (e) {}
    try {
      await activateReferralIfNeeded();
    } catch (e) {}
    try {
      await resumePendingDeepLink();
    } catch (e) {}
    try {
      resumePendingAction();
    } catch (e) {}
  }

  function openInviteToChaupaalShare() {
    if (typeof currentUser === 'undefined' || !currentUser) {
      if (typeof showToast === 'function') showToast('Sign in to invite friends');
      if (typeof openAuthSheet === 'function') openAuthSheet('login');
      return;
    }
    const url = inviteHomeUrl();
    const text =
      'Join me on Chaupaal — chat, play, and catch up. Virtual chips · not real money.\n' + url;
    if (typeof openUnifiedShareSheet === 'function') {
      openUnifiedShareSheet({
        gameId: 'invite',
        title: 'Invite to Chaupaal',
        subtitle: 'Your invite link',
        story: false,
        stats: {
          text,
          url,
          scoreLine: 'Invite',
          meta: 'Virtual chips · not real money',
        },
      });
      return;
    }
    if (navigator.share) {
      navigator.share({ title: 'Chaupaal', text, url }).catch(() => {});
    } else if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        if (typeof showToast === 'function') showToast('Invite link copied');
      });
    }
  }

  // Capture early (guest-first browse still works)
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', captureReferralFromLocation);
    } else {
      captureReferralFromLocation();
    }
  }

  window.ChaupaalReferrals = {
    withReferralParam,
    myReferralCode,
    inviteHomeUrl,
    captureReferralFromLocation,
    persistPendingRef,
    stashPendingDeepLink,
    resumePendingDeepLink,
    stashPendingAction,
    resumePendingAction,
    claimPendingReferral,
    activateReferralIfNeeded,
    afterAuthReferralAndResume,
    openInviteToChaupaalShare,
    readPendingRef,
    readPendingDeepLink,
  };
  window.withReferralParam = withReferralParam;
  window.stashPendingDeepLink = stashPendingDeepLink;
  window.stashPendingAction = stashPendingAction;
  window.openInviteToChaupaalShare = openInviteToChaupaalShare;
})();
