/**
 * Relationship client.
 * Follow is directional; Friend is derived from reciprocal follows.
 * Split exclusion list (private): Friends receive Splits unless on the list.
 */
(function () {
  'use strict';

  const cache = new Map();

  function safe(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
    );
  }

  function avatarCell(profile) {
    if (typeof renderUserAvatarHtml === 'function') {
      return renderUserAvatarHtml(profile || {}, { decorative: true });
    }
    const p = profile || {};
    return p.photoURL ? `<img src="${safe(p.photoURL)}" alt="">` : '👤';
  }

  async function callRelationship(action, body) {
    if (typeof apiFetch !== 'function') throw new Error('Relationship service unavailable');
    const envelope = await apiFetch('/api/relationships', {
      method: 'POST',
      needAuth: true,
      body: { action, ...(body || {}) },
    });
    if (!envelope?.ok) throw Object.assign(new Error(envelope?.error?.message || 'Relationship action failed'), { code: envelope?.error?.code });
    return envelope.data || {};
  }

  function defaultState() {
    return {
      following: false,
      followsYou: false,
      friend: false,
      requestSent: false,
      requestReceived: false,
      splitExcluded: false,
      friendOrigin: null,
      theirFollowSource: null,
    };
  }

  function displayNameFor(profile) {
    if (typeof resolvePersonDisplayName === 'function') return resolvePersonDisplayName(profile);
    const p = profile || {};
    return p.name || p.displayName || (p.username ? `@${p.username}` : '') || t('common.someone');
  }

  function refreshFriendRequestSurfaces() {
    if (typeof mergePendingFriendRequests === 'function') mergePendingFriendRequests();
    else if (typeof mountBaithakFriendRequests === 'function') mountBaithakFriendRequests();
    const profileRoot = document.getElementById('profileContent');
    if (profileRoot && typeof mountOwnRelationshipPanel === 'function') {
      mountOwnRelationshipPanel(profileRoot);
    }
  }

  function relationshipState(uid) {
    return cache.get(uid) || defaultState();
  }

  function requireRelationshipUser() {
    if (currentUser) return true;
    if (typeof showAuth === 'function') showAuth();
    else if (typeof showToast === 'function') showToast(t('rel_sign_in'));
    return false;
  }

  /**
   * Peepal → Friend; Duniya → Follow; explicit profile visit uses account type
   * (personal → Friend, professional → Follow).
   */
  function primaryRelationshipMode({ context = '', profileType = 'personal' } = {}) {
    const ctx = String(context || '').toLowerCase();
    if (ctx === 'peepal') return 'friend';
    if (ctx === 'duniya') return 'follow';
    return String(profileType || 'personal').toLowerCase() === 'professional' ? 'follow' : 'friend';
  }

  async function hydrateRelationships(targetUids) {
    const ids = [...new Set((targetUids || []).filter(Boolean))];
    if (!ids.length || !currentUser) return {};
    const data = await callRelationship('hydrate', { targetUids: ids });
    Object.entries(data.states || {}).forEach(([uid, state]) => cache.set(uid, state));
    return data.states || {};
  }

  function patchRelationshipState(uid, patch) {
    cache.set(uid, { ...relationshipState(uid), ...patch });
  }

  async function openProfileMessage(profile) {
    const uid = String(profile?.uid || '').trim();
    if (!uid) {
      if (typeof showToast === 'function') showToast(t('profile.could_not_open_chat'));
      return null;
    }
    if ((typeof isSelfUid === 'function' && isSelfUid(uid)) || uid === currentUser?.uid) {
      if (typeof showToast === 'function') showToast(typeof t === 'function' ? t('profile.rel_cant_message_self', 'That’s you') : t('profile.that_s_you_2'));
      return null;
    }
    if (!currentUser) {
      if (typeof savePendingProfileMessage === 'function') savePendingProfileMessage(profile);
      if (typeof showAuth === 'function') showAuth();
      else if (typeof showToast === 'function') showToast(typeof t === 'function' ? t('rel_sign_in') : t('common.sign_in'));
      return null;
    }
    if (typeof bootstrapDmChat !== 'function' && typeof openPeerDm !== 'function') {
      if (typeof showToast === 'function') showToast(t('profile.open_baithak_to_message'));
      return null;
    }
    const messageBtn =
      document.querySelector('[data-rel-message][data-msg-uid="' + uid + '"]') ||
      document.querySelector('[data-rel-message]');
    if (messageBtn) {
      messageBtn.disabled = true;
      if (typeof setButtonLoading === 'function') setButtonLoading(messageBtn, true, t('common.opening'));
    }
    try {
      let peerName = displayNameFor(profile);
      if (!peerName || /^(someone|friend|chaupaal member|member|chat)$/i.test(String(peerName).trim())) {
        peerName = profile.username ? '@' + String(profile.username).replace(/^@/, '') : peerName || t('common.chat');
      }
      const openFn = typeof openPeerDm === 'function' ? openPeerDm : null;
      if (openFn) {
        return await openFn({
          uid,
          name: peerName,
          username: profile.username,
          photoURL: profile.photoURL,
          avatar: profile.avatar || profile.photoURL,
          origin: 'profile',
          peerProfileType: profile.profileType,
          matchMeta: {
            teenMode: profile.teenMode,
            isMinor: profile.isMinor,
            age: profile.age,
          },
          seedHello: false,
        });
      }
      const baithakBtn = document.querySelector('.bottom-tabs .tab-btn[data-tab="baithak"]');
      if (baithakBtn && !baithakBtn.classList.contains('active')) {
        baithakBtn.click();
        await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 40)));
      }
      const chat = await bootstrapDmChat({
        uid,
        name: peerName,
        username: profile.username,
        photoURL: profile.photoURL,
        avatar: profile.avatar || profile.photoURL,
        origin: 'profile',
        peerProfileType: profile.profileType,
        matchMeta: {
          teenMode: profile.teenMode,
          isMinor: profile.isMinor,
          age: profile.age,
        },
      });
      if (!chat) return null;
      if (typeof upsertBaithakInboxChat === 'function') upsertBaithakInboxChat(chat);
      else if (typeof rememberInboxChat === 'function') rememberInboxChat(chat);
      if (typeof openChatScreen === 'function') openChatScreen(chat);
      return chat;
    } catch (e) {
      const msg =
        typeof friendlyDmError === 'function' ? friendlyDmError(e) : errorText(e, t('profile.could_not_open_chat_try_again'));
      if (typeof showToast === 'function') showToast(msg);
      return null;
    } finally {
      if (messageBtn) {
        messageBtn.disabled = false;
        if (typeof setButtonLoading === 'function') setButtonLoading(messageBtn, false);
      }
    }
  }

  function emitRelationshipChanged(targetUid, data) {
    if (data?.state) cache.set(targetUid, data.state);
    document.dispatchEvent(
      new CustomEvent('chaupaal:relationship-changed', {
        detail: {
          targetUid,
          state: relationshipState(targetUid),
          counts: data?.counts || null,
          targetCounts: data?.targetCounts || null,
          autoAccepted: !!data?.autoAccepted,
        },
      })
    );
  }

  async function setFollowing(targetUid, enabled, source) {
    if (!requireRelationshipUser()) throw new Error('Sign in required');
    const data = await callRelationship(enabled ? 'follow' : 'unfollow', {
      targetUid,
      source: source || 'profile',
    });
    emitRelationshipChanged(targetUid, data);
    if (enabled && typeof haptic === 'function') haptic('success');
    try {
      if (typeof trackSignal === 'function') {
        trackSignal(enabled ? 'follow' : 'unfollow', {
          surface: 'profile',
          objType: 'user',
          objId: targetUid,
          ctx: { source: source || 'profile' },
        });
      }
    } catch (e) {}
    return relationshipState(targetUid);
  }

  async function requestFriend(targetUid) {
    if (!requireRelationshipUser()) throw new Error('Sign in required');
    const data = await callRelationship('request_friend', { targetUid });
    emitRelationshipChanged(targetUid, data);
    refreshFriendRequestSurfaces();
    try {
      if (typeof trackSignal === 'function') {
        trackSignal(data.accepted || data.autoAccepted ? 'friend_accept' : 'friend_request', {
          surface: 'profile',
          objType: 'user',
          objId: targetUid,
        });
      }
    } catch (e) {}
    return { state: relationshipState(targetUid), accepted: !!data.accepted, autoAccepted: !!data.autoAccepted };
  }

  async function cancelFriendRequest(targetUid) {
    if (!requireRelationshipUser()) throw new Error('Sign in required');
    const data = await callRelationship('cancel_friend_request', { targetUid });
    emitRelationshipChanged(targetUid, data);
    if (typeof dismissNotificationsByRef === 'function') {
      await dismissNotificationsByRef({ type: 'friend_request', refId: targetUid });
    }
    refreshFriendRequestSurfaces();
    return relationshipState(targetUid);
  }

  async function respondFriend(requesterUid, accept) {
    if (!requireRelationshipUser()) throw new Error('Sign in required');
    const data = await callRelationship('respond_friend', {
      targetUid: requesterUid,
      accept: !!accept,
    });
    emitRelationshipChanged(requesterUid, data);
    if (typeof dismissNotificationsByRef === 'function') {
      await dismissNotificationsByRef({ type: 'friend_request', refId: requesterUid });
    }
    refreshFriendRequestSurfaces();
    return relationshipState(requesterUid);
  }

  async function removeFollower(followerUid) {
    if (!requireRelationshipUser()) throw new Error('Sign in required');
    const data = await callRelationship('remove_follower', { targetUid: followerUid });
    emitRelationshipChanged(followerUid, data);
    return relationshipState(followerUid);
  }

  async function setSplitExclusion(targetUid, excluded) {
    if (!requireRelationshipUser()) throw new Error('Sign in required');
    const data = await callRelationship('set_exclusion', { targetUid, excluded: !!excluded });
    const state = { ...relationshipState(targetUid), splitExcluded: !!data.splitExcluded };
    cache.set(targetUid, state);
    if (typeof refreshExclusionListCount === 'function') refreshExclusionListCount();
    return state;
  }

  async function loadRelationshipProfile(targetUid) {
    const data = await callRelationship('profile', targetUid ? { targetUid } : {});
    if (targetUid && data.state) cache.set(targetUid, data.state);
    return data;
  }

  function relationshipCountsHtml(counts) {
    const c = counts || {};
    return `
      <div class="relationship-counts" aria-label="${tHtml('profile.profile_relationships')}">
        <button type="button" data-relationship-list="friends"><strong>${Number(c.friends) || 0}</strong><span>${tHtml('profile.friends')}</span></button>
        <button type="button" data-relationship-list="followers"><strong>${Number(c.followers) || 0}</strong><span>${tHtml('profile.followers')}</span></button>
        <button type="button" data-relationship-list="following"><strong>${Number(c.following) || 0}</strong><span>${tHtml('profile.rel_following')}</span></button>
      </div>`;
  }

  function paintRelationshipCounts(host, counts, targetUid) {
    if (!host) return;
    const uid = targetUid || (typeof currentUser !== 'undefined' ? currentUser?.uid : '');
    if (uid) host.setAttribute('data-rel-counts-uid', uid);
    host.innerHTML = relationshipCountsHtml(counts);
    wireRelationshipCountButtons(host, { targetUid: targetUid && targetUid !== currentUser?.uid ? targetUid : undefined });
  }

  function paintRelationshipCountsFor(uid, counts) {
    if (!uid || !counts) return;
    document.querySelectorAll(`[data-rel-counts-uid="${uid}"]`).forEach((host) => {
      paintRelationshipCounts(host, counts, uid);
    });
  }

  document.addEventListener('chaupaal:relationship-changed', (event) => {
    const me = typeof currentUser !== 'undefined' ? currentUser?.uid : '';
    if (me && event.detail?.counts) paintRelationshipCountsFor(me, event.detail.counts);
    if (event.detail?.targetUid && event.detail?.targetCounts) {
      paintRelationshipCountsFor(event.detail.targetUid, event.detail.targetCounts);
    }
  });

  function friendActionLabel(state) {
    if (state.friend) return t('profile.friends');
    if (state.requestReceived) return t('common.accept');
    if (state.requestSent) return t('common.requested');
    return t('common.add_friend');
  }

  function followActionLabel(state) {
    return state.following ? t('profile.following') : t('common.follow');
  }

  /** Build expandable actions for a target — used by long-press and profile ▾ menu. */
  function buildRelationshipActions(profile, state, { onChanged, context = '' } = {}) {
    const actions = [];
    const name = profile.name || 'them';
    const mode = primaryRelationshipMode({
      context,
      profileType: profile.profileType || 'personal',
    });
    const refresh = async () => {
      if (typeof onChanged === 'function') await onChanged();
    };

    actions.push({
      label: t('profile.cai_view_profile'),
      icon: 'user',
      hint: t('profile.open_their_chaupaal_profile'),
      fn: () => {
        if (typeof tapAvatarFromFeed === 'function') {
          tapAvatarFromFeed(profile, { context: 'relationship_menu' });
        } else if (typeof openUserProfile === 'function') {
          openUserProfile(profile, { uid: profile.uid, username: profile.username, context: 'third_person' });
        } else if (typeof openPublicProfile === 'function') {
          openPublicProfile(profile, { uid: profile.uid, username: profile.username });
        }
      },
    });
    actions.push({
      label: t('profile.avatar_menu_message'),
      icon: 'message-circle',
      hint: t('profile.anyone_can_message_teen_mode_is'),
      fn: async () => {
        await openProfileMessage(profile);
      },
    });

    if (state.friend) {
      actions.push({
        label: state.splitExcluded
          ? typeof t === 'function'
            ? t('exclusion_menu_remove')
            : t('profile.avatar_menu_remove_cf')
          : typeof t === 'function'
            ? t('exclusion_menu_exclude')
            : t('profile.avatar_menu_add_cf'),
        icon: 'user-minus',
        hint:
          typeof t === 'function'
            ? t('exclusion_menu_hint')
            : t('profile.exclusion_menu_hint'),
        fn: async () => {
          const next = await setSplitExclusion(profile.uid, !state.splitExcluded);
          showToast(
            next.splitExcluded
              ? t('exclusion_added', { name })
              : t('exclusion_removed', { name })
          );
          await refresh();
        },
      });
      actions.push({
        label: t('profile.unfriend'),
        icon: 'user-x',
        danger: true,
        hint: t('profile.removes_your_follow_they_may_still'),
        fn: async () => {
          await setFollowing(profile.uid, false, 'unfriend');
          showToast(t('rel_unfriended',{name}));
          await refresh();
        },
      });
    } else if (state.requestReceived) {
      actions.push({
        label: t('profile.accept_friend_request'),
        icon: 'user-plus',
        fn: async () => {
          await respondFriend(profile.uid, true);
          showToast(t('rel_now_friends_with',{name}));
          await refresh();
        },
      });
      actions.push({
        label: t('profile.decline_friend_request'),
        icon: 'x',
        danger: true,
        fn: async () => {
          await respondFriend(profile.uid, false);
          await refresh();
        },
      });
    } else if (state.requestSent) {
      actions.push({
        label: t('profile.cancel_friend_request'),
        icon: 'x',
        fn: async () => {
          await cancelFriendRequest(profile.uid);
          showToast(t('rel_request_cancelled'));
          await refresh();
        },
      });
    } else if (!state.requestSent && mode !== 'friend') {
      actions.push({
        label: t('common.add_friend'),
        icon: 'user-plus',
        hint: state.followsYou
          ? t('profile.they_already_follow_you_this_will')
          : t('profile.they_ll_need_to_accept_before'),
        fn: async () => {
          const result = await requestFriend(profile.uid);
          if (result.autoAccepted || result.accepted) {
            showToast(t('rel_now_friends_named',{name}));
          } else {
            showToast(t('rel_request_sent'));
          }
          await refresh();
        },
      });
    }

    if (!state.following) {
      if (mode !== 'follow') {
        actions.push({
          label: t('common.follow'),
          icon: 'user-plus',
          hint: t('profile.one_way_follow_available_here_on'),
          fn: async () => {
            const next = await setFollowing(profile.uid, true, 'profile_menu');
            showToast(next.friend?t('rel_now_friends_named',{name}):t('rel_following_named',{name}));
            await refresh();
          },
        });
      }
    } else if (!state.friend) {
      actions.push({
        label: t('profile.unfollow'),
        icon: 'user-minus',
        fn: async () => {
          await setFollowing(profile.uid, false, 'profile_menu');
          showToast(t('rel_unfollowed',{name}));
          await refresh();
        },
      });
    }

    if (state.followsYou) {
      const canRemoveFollower =
        state.followsYou && !(state.friend && state.friendOrigin === 'friend_request');
      if (canRemoveFollower) {
        actions.push({
          label: t('profile.remove_follower'),
          icon: 'user-x',
          danger: true,
          hint: t('profile.stops_them_following_you_your_follow'),
          fn: async () => {
            await removeFollower(profile.uid);
            showToast(t('rel_removed_follower',{name}));
            await refresh();
          },
        });
      }
    }

    return actions;
  }

  function openRelationshipMenu(profile, { title, context } = {}) {
    if (!requireRelationshipUser()) return;
    const run = async () => {
      if (!cache.has(profile.uid)) await hydrateRelationships([profile.uid]);
      const state = relationshipState(profile.uid);
      const actions = buildRelationshipActions(profile, state, { context });
      if (typeof showActionSheet === 'function') {
        showActionSheet(title || t('common.more'), actions);
      }
    };
    run().catch((error) => showToast(errorText(error, t('rel_actions_fail'))));
  }

  async function wireFriendAction(button, targetUid) {
    if (!button || !targetUid) return;
    if (!cache.has(targetUid)) {
      try {
        await hydrateRelationships([targetUid]);
      } catch (e) {}
    }
    const paint = () => {
      const state = relationshipState(targetUid);
      button.textContent = friendActionLabel(state);
      button.disabled = state.friend;
      button.classList.toggle('is-connected', state.friend);
    };
    paint();
    button.addEventListener('click', async () => {
      if (!requireRelationshipUser()) return;
      const state = relationshipState(targetUid);
      if (state.friend) {
        openRelationshipMenu({ uid: targetUid, name: button.dataset.name || 'Friend' }, { title: t('profile.friends') });
        return;
      }
      if (state.requestReceived) {
        openRelationshipMenu({ uid: targetUid, name: button.dataset.name || 'Person' }, { title: t('profile.friend_request') });
        return;
      }
      if (state.requestSent) {
        openRelationshipMenu({ uid: targetUid, name: button.dataset.name || 'Person' }, { title: t('profile.requested') });
        return;
      }
      button.disabled = true;
      try {
        const result = await requestFriend(targetUid);
        paint();
        if (result.autoAccepted || result.accepted) showToast(t('rel_now_friends'));
        else showToast(t('rel_request_sent'));
      } catch (error) {
        button.disabled = false;
        showToast(errorText(error, t('rel_request_fail')));
      }
    });
  }

  /**
   * Primary CTA + Message + ⋯ .
   * Personal → Add Friend (Follow lives in More). Professional → Follow.
   * Host: [data-rel-primary], [data-rel-message], [data-rel-more].
   */
  async function wireProfileRelationshipActions(host, profile, { context = '' } = {}) {
    if (!host || !profile?.uid) return;
    if (host.dataset.relWired === profile.uid) return;
    host.dataset.relWired = profile.uid;
    const primaryBtn = host.querySelector('[data-rel-primary]');
    const moreBtn = host.querySelector('[data-rel-more]');
    const messageBtn = host.querySelector('[data-rel-message]');
    const isSelf =
      typeof isSelfUid === 'function' ? isSelfUid(profile.uid) : profile.uid === currentUser?.uid;
    if (isSelf) {
      if (messageBtn) {
        messageBtn.hidden = true;
        messageBtn.disabled = true;
      }
      if (primaryBtn) {
        primaryBtn.hidden = true;
        primaryBtn.disabled = true;
      }
      return;
    }
    if (messageBtn) messageBtn.dataset.msgUid = profile.uid;
    if (!cache.has(profile.uid)) {
      try {
        await hydrateRelationships([profile.uid]);
      } catch (e) {}
    }

    const modeOf = () =>
      primaryRelationshipMode({
        context,
        profileType: profile.profileType || 'personal',
      });

    const paint = () => {
      const state = relationshipState(profile.uid);
      const mode = modeOf();
      if (!primaryBtn) return;
      if (mode === 'friend') {
        primaryBtn.textContent = friendActionLabel(state);
        primaryBtn.classList.toggle('is-connected', !!(state.friend || state.requestSent));
        primaryBtn.dataset.mode = 'friend';
      } else {
        primaryBtn.textContent = followActionLabel(state);
        primaryBtn.classList.toggle('is-connected', state.following);
        primaryBtn.dataset.mode = 'follow';
      }
    };

    paint();
    primaryBtn?.addEventListener('click', async () => {
      if (!requireRelationshipUser()) return;
      const prev = { ...relationshipState(profile.uid) };
      const mode = primaryBtn.dataset.mode;
      if (typeof setButtonLoading === 'function') setButtonLoading(primaryBtn, true);
      try {
        if (mode === 'friend') {
          if (prev.friend) {
            openRelationshipMenu(profile, { title: t('profile.friends'), context });
            return;
          }
          if (prev.requestReceived) {
            patchRelationshipState(profile.uid, {
              friend: true,
              following: true,
              followsYou: true,
              requestReceived: false,
              requestSent: false,
            });
            paint();
            await respondFriend(profile.uid, true);
            showToast(t('rel_now_friends'));
            return;
          }
          if (prev.requestSent) {
            openRelationshipMenu(profile, { title: t('profile.requested'), context });
            return;
          }
          patchRelationshipState(profile.uid, {
            requestSent: !prev.followsYou,
            friend: !!prev.followsYou,
            following: !!prev.followsYou || prev.following,
          });
          paint();
          const result = await requestFriend(profile.uid);
          paint();
          if (result.autoAccepted || result.accepted) {
            showToast(t('rel_now_friends'), 3000, { type: 'success' });
            if (typeof haptic === 'function') haptic('light');
          } else {
            showToast(t('rel_request_sent'), 3000, { type: 'success' });
            if (typeof haptic === 'function') haptic('light');
          }
        } else {
          if (prev.following) {
            openRelationshipMenu(profile, { title: t('profile.rel_following'), context });
            return;
          }
          patchRelationshipState(profile.uid, {
            following: true,
            friend: !!prev.followsYou,
          });
          paint();
          const next = await setFollowing(profile.uid, true, context || 'profile');
          paint();
          showToast(next.friend ? t('rel_now_friends') : t('rel_following'), 3000, { type: 'success' });
          if (typeof haptic === 'function') haptic('light');
        }
      } catch (error) {
        cache.set(profile.uid, prev);
        paint();
        showToast(errorText(error, t('rel_update_fail')), 3000, { type: 'error' });
      } finally {
        if (typeof setButtonLoading === 'function') setButtonLoading(primaryBtn, false);
      }
    });

    messageBtn?.addEventListener('click', () => openProfileMessage(profile));
    moreBtn?.addEventListener('click', () => openRelationshipMenu(profile, { title: t('common.more'), context }));
    if (typeof onLongPress === 'function' && primaryBtn) {
      onLongPress(primaryBtn, () => openRelationshipMenu(profile, { title: t('common.more'), context }));
    }
    document.addEventListener('chaupaal:relationship-changed', (event) => {
      if (!host.isConnected) return;
      if (event.detail?.targetUid === profile.uid) paint();
    });
  }

  function bindProfileLongPress(element, profile) {
    if (!element || !profile?.uid || profile.uid === currentUser?.uid) return;
    if (typeof markIdentityAvatar === 'function') markIdentityAvatar(element);
    else {
      element.classList?.add?.('cp-identity-avatar');
      element.style.userSelect = 'none';
      element.style.webkitUserSelect = 'none';
      element.style.webkitTouchCallout = 'none';
    }
    const open = () => openRelationshipMenu(profile, { title: t('profile.profile_actions') });
    if (typeof onLongPress === 'function') onLongPress(element, open);
    else {
      let timer;
      const clear = () => clearTimeout(timer);
      element.addEventListener('pointerdown', () => {
        timer = setTimeout(open, 550);
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((name) => element.addEventListener(name, clear));
    }
    element.addEventListener('selectstart', (e) => e.preventDefault());
  }

  async function openRelationshipList(kind, { targetUid } = {}) {
    if (!requireRelationshipUser()) return;
    const titles = { friends: t('profile.friends'), followers: t('profile.followers'), following: t('profile.following') };
    const emptyCopy = {
      friends: t('profile.rel_empty_friends'),
      followers: t('profile.rel_empty_followers'),
      following: t('profile.rel_empty_following'),
    };
    const searchCopy = {
      friends: t('profile.rel_search_friends'),
      followers: t('profile.rel_search_followers'),
      following: t('profile.rel_search_following'),
    };
    const actions = {
      friends: 'list_friends',
      followers: 'list_followers',
      following: 'list_following',
    };
    const action = actions[kind];
    if (!action) return;

    const overlay = document.createElement('div');
    overlay.className = 'archive-overlay relationship-list-sheet';
    overlay.dataset.navManaged = '1';
    overlay.innerHTML = `
      <div class="archive-header">
        ${typeof backButtonHtml === 'function' ? backButtonHtml({ attrs: 'data-rel-list-back' }) : '<button type="button" data-rel-list-back aria-label="' + tHtml('common.back') + '" class="cp-back-btn">←</button>'}
        <div style="flex:1"><strong>${titles[kind]}</strong>
          <div class="relationship-private-note">${
            kind === 'friends'
              ? tHtml('profile.mutual_follows_both_of_you_chose')
              : kind === 'followers'
                ? tHtml('profile.people_who_follow_this_profile')
                : tHtml('profile.people_this_profile_follows')
          }</div>
        </div>
      </div>
      <div class="relationship-list-filter-host" data-rel-list-filter-host></div>
      <div class="close-friends-manager" data-rel-list-body></div>
      <div class="comments-empty" data-list-filter-empty hidden>${tHtml('profile.no_matches')}</div>`;
    const body = overlay.querySelector('[data-rel-list-body]');
    const filterHost = overlay.querySelector('[data-rel-list-filter-host]');
    if (typeof renderSkeleton === 'function') renderSkeleton(body, { variant: 'list', count: 5 });
    else body.innerHTML = tHtml('profile.loading');
    const deviceEl = document.querySelector('.device');
    let listLayer = null;
    const dismissList = () => {};
    if (typeof openLayer === 'function') {
      listLayer = openLayer(overlay, dismissList, { host: deviceEl, remove: true });
    } else {
      deviceEl?.appendChild(overlay);
      if (typeof pushNavLayer === 'function') pushNavLayer(overlay, dismissList);
    }
    overlay.querySelector('[data-rel-list-back]')?.addEventListener('click', () => {
      if (listLayer?.close) listLayer.close();
      else {
        if (typeof removeNavLayer === 'function') removeNavLayer(overlay);
        overlay.remove();
      }
    });

    try {
      const data = await callRelationship(action, targetUid ? { targetUid } : {});
      let profiles = data.profiles || [];
      if (typeof pinYouInProfiles === 'function') {
        profiles = pinYouInProfiles(profiles);
      }
      if (!profiles.length) {
        body.innerHTML = `<div class="comments-empty">${emptyCopy[kind]}</div>`;
        return;
      }
      const youLabel = typeof selfListLabel === 'function' ? selfListLabel() : { title: t('profile.you'), name: '' };
      body.innerHTML = profiles
        .map((profile) => {
          const isYou = !!(profile._isYou || (currentUser && profile.uid === currentUser.uid));
          const title = isYou
            ? `You${youLabel.name && youLabel.name !== 'You' ? ` · ${youLabel.name}` : ''}`
            : displayNameFor(profile);
          const sub = isYou
            ? youLabel.username
              ? `@${youLabel.username}`
              : ''
            : profile.username
              ? `@${profile.username}`
              : profile.city || '';
          const filterText = `${title} ${sub} ${profile.name || ''} ${profile.username || ''}`.toLowerCase();
          return `
        <div class="close-friends-row" data-uid="${safe(profile.uid)}" data-filter-text="${safe(filterText)}"${isYou ? ' data-is-you="1"' : ''}>
          <div class="close-friends-avatar">${avatarCell(isYou ? { ...profile, photoURL: youLabel.photoURL || profile.photoURL, name: youLabel.name } : profile)}</div>
          <div class="close-friends-person"><strong>${
            isYou
              ? safe(title)
              : typeof formatDisplayNameHtml === 'function'
                ? formatDisplayNameHtml(title, profile)
                : safe(title)
          }</strong><span>${safe(sub)}</span></div>
          <button type="button" data-rel-open>${tHtml('profile.view')}</button>
        </div>`;
        })
        .join('');
      body.querySelectorAll('[data-rel-open]').forEach((button) => {
        button.addEventListener('click', () => {
          const uid = button.closest('[data-uid]')?.dataset.uid;
          const profile = profiles.find((p) => p.uid === uid);
          if (!profile) return;
          const self = currentUser && uid === currentUser.uid;
          if (typeof openUserProfile === 'function') {
            openUserProfile(profile, {
              uid,
              username: profile.username,
              context: self ? 'list_self' : 'list_other',
            });
          } else if (typeof openPublicProfile === 'function') openPublicProfile(profile);
          else openRelationshipMenu(profile);
        });
      });
      if (filterHost && typeof mountListFilter === 'function') {
        mountListFilter({
          host: filterHost,
          placeholder: searchCopy[kind],
          surfaceId: `rel_list_${kind}`,
          getRows: () => [...body.querySelectorAll('.close-friends-row')],
          emptyEl: overlay.querySelector('[data-list-filter-empty]'),
        });
      }
    } catch (error) {
      if (typeof renderErrorState === 'function') {
        renderErrorState(body, {
          message: errorText(error, t('profile.could_not_load_list')),
          onRetry: () => openRelationshipList(kind, { targetUid }),
        });
      } else {
        body.textContent = errorText(error, t('profile.could_not_load_list'));
      }
    }
  }

  function wireRelationshipCountButtons(root, { targetUid } = {}) {
    root?.querySelectorAll('[data-relationship-list]')?.forEach((button) => {
      button.addEventListener('click', () => openRelationshipList(button.dataset.relationshipList, { targetUid }));
    });
  }

  async function openExclusionListManager() {
    const overlay = document.createElement('div');
    overlay.className = 'archive-overlay exclusion-list-overlay close-friends-manager-overlay';
    overlay.id = 'exclusionListManager';
    overlay.dataset.navManaged = '1';
    overlay.innerHTML = `
      <div class="archive-header">
        ${typeof backButtonHtml === 'function' ? backButtonHtml({ attrs: 'data-exclusion-back' }) : '<button type="button" data-exclusion-back aria-label="' + tHtml('common.back') + '" class="cp-back-btn">←</button>'}
        <div style="flex:1"><strong>${typeof t === 'function' ? t('exclusion_list_label') : tHtml('profile.exclusion_list_label')}</strong>
          <div class="relationship-private-note">${typeof t === 'function' ? t('exclusion_list_note') : tHtml('profile.cf_manager_sub')}</div>
        </div>
      </div>
      <div class="exclusion-list-manager close-friends-manager">
        <label class="exclusion-list-search close-friends-search"><span>${typeof t === 'function' ? t('exclusion_search_label') : tHtml('profile.exclusion_search_label')}</span><input type="search" placeholder="${typeof t === 'function' ? t('exclusion_search_ph') : tHtml('profile.exclusion_search_ph')}" data-exclusion-search></label>
        <div data-exclusion-search-results></div>
        <div class="exclusion-list-heading close-friends-heading">${typeof t === 'function' ? t('exclusion_list_heading') : tHtml('profile.cf_manager_heading')}</div>
        <div data-exclusion-list class="ui-skeleton-stack"></div>
      </div>`;
    const deviceEl = document.querySelector('.device');
    let layer = null;
    const dismiss = () => {};
    if (typeof openLayer === 'function') {
      layer = openLayer(overlay, dismiss, { host: deviceEl, remove: true });
    } else {
      deviceEl?.appendChild(overlay);
      if (typeof pushNavLayer === 'function') pushNavLayer(overlay, dismiss);
    }
    overlay.querySelector('[data-exclusion-back]')?.addEventListener('click', () => {
      if (layer?.close) layer.close();
      else {
        if (typeof removeNavLayer === 'function') removeNavLayer(overlay);
        overlay.remove();
      }
    });
    const list = overlay.querySelector('[data-exclusion-list]');
    const results = overlay.querySelector('[data-exclusion-search-results]');
    if (typeof renderSkeleton === 'function') renderSkeleton(list, { variant: 'list', count: 3 });
    let excludedIds = new Set();
    let allFriends = [];

    const row = (profile, mode) => {
      const isAdd = mode === 'add';
      return `
      <div class="exclusion-list-row close-friends-row" data-uid="${profile.uid}">
        <div class="exclusion-list-avatar close-friends-avatar">${avatarCell(profile)}</div>
        <div class="exclusion-list-person close-friends-person"><strong>${typeof formatDisplayNameHtml === 'function' ? formatDisplayNameHtml(profile.name || profile.username || t('common.member'), profile) : safe(profile.name || profile.username || t('common.member'))}</strong><span>${safe(profile.username ? '@' + profile.username : profile.city || '')}</span></div>
        <button type="button" data-exclusion-toggle="${isAdd ? 'add' : 'remove'}">${isAdd ? t('exclusion_add') : t('exclusion_remove')}</button>
      </div>`;
    };

    const wire = (root) => {
      root.querySelectorAll('[data-exclusion-toggle]').forEach((button) => {
        button.addEventListener('click', async () => {
          const uid = button.closest('[data-uid]')?.dataset.uid;
          if (!uid) return;
          button.disabled = true;
          try {
            await setSplitExclusion(uid, button.dataset.exclusionToggle === 'add');
            await renderList();
            renderSearch(overlay.querySelector('[data-exclusion-search]')?.value || '');
          } catch (error) {
            button.disabled = false;
            showToast(errorText(error, t('exclusion_fail')));
          }
        });
      });
    };

    async function renderList() {
      try {
        const [exclusionData, friendsData] = await Promise.all([
          callRelationship('list_exclusion'),
          callRelationship('list_friends'),
        ]);
        const excluded = exclusionData.excluded || [];
        allFriends = friendsData.profiles || [];
        excludedIds = new Set(excluded.map((p) => p.uid));
        excluded.forEach((profile) => {
          cache.set(profile.uid, { ...relationshipState(profile.uid), splitExcluded: true });
        });
        allFriends.forEach((profile) => {
          if (!excludedIds.has(profile.uid)) {
            cache.set(profile.uid, { ...relationshipState(profile.uid), splitExcluded: false });
          }
        });
        list.innerHTML = excluded.length
          ? excluded.map((profile) => row(profile, 'remove')).join('')
          : `<div class="comments-empty">${typeof t === 'function' ? t('exclusion_list_empty') : tHtml('profile.cf_manager_empty')}</div>`;
        wire(list);
      } catch (error) {
        if (typeof renderErrorState === 'function') {
          renderErrorState(list, {
            message: errorText(error, t('profile.could_not_load')),
            onRetry: () => renderList(),
          });
        } else {
          list.textContent = errorText(error, t('profile.could_not_load_exclusion_list'));
        }
      }
    }

    function renderSearch(query) {
      const q = String(query || '').trim().toLowerCase();
      if (!q) {
        results.innerHTML = '';
        return;
      }
      const matches = allFriends.filter(
        (profile) =>
          !excludedIds.has(profile.uid) &&
          (String(profile.name || '')
            .toLowerCase()
            .includes(q) ||
            String(profile.username || '')
              .toLowerCase()
              .includes(q.replace(/^@/, '')))
      );
      results.innerHTML = matches.length
        ? matches.map((profile) => row(profile, 'add')).join('')
        : `<div class="comments-empty">${typeof t === 'function' ? t('exclusion_search_empty') : tHtml('profile.exclusion_search_empty')}</div>`;
      wire(results);
    }

    overlay.querySelector('[data-exclusion-search]')?.addEventListener('input', (event) => {
      renderSearch(event.target.value);
    });
    const exclInp = overlay.querySelector('[data-exclusion-search]');
    if (typeof enhanceSearchField === 'function' && exclInp && !exclInp.dataset.searchFieldWired) {
      enhanceSearchField(exclInp, {
        surfaceId: 'exclusion',
        onClear() {
          renderSearch('');
        },
      });
    }
    await renderList();
  }

  async function refreshExclusionListCount() {
    const badge = document.getElementById('exclusionListCount');
    if (!badge || !currentUser) return;
    try {
      const data = await callRelationship('list_exclusion');
      const count = (data.excluded || []).length;
      if (count > 0) {
        badge.textContent = String(count);
        badge.hidden = false;
      } else {
        badge.textContent = '';
        badge.hidden = true;
      }
    } catch (e) {
      badge.hidden = true;
    }
  }

  async function mountOwnRelationshipPanel(root) {
    if (!root || !currentUser) return;
    const countsHost = root.querySelector('[data-profile-relationship-counts]');
    const requestsHost = root.querySelector('[data-friend-requests]');
    try {
      const data = await loadRelationshipProfile();
      if (countsHost) paintRelationshipCounts(countsHost, data.counts, currentUser.uid);
    } catch (error) {
      if (countsHost) countsHost.textContent = t('profile.relationship_counts_unavailable');
    }
    if (requestsHost) {
      try {
        const data = await callRelationship('list_friend_requests');
        const profiles = data.profiles || [];
        requestsHost.innerHTML = profiles.length
          ? `<div class="close-friends-heading">${tHtml('profile.friend_requests')}</div>${profiles
              .map(
                (profile) => `
              <div class="close-friends-row" data-request-uid="${profile.uid}">
                <div class="close-friends-avatar">${avatarCell(profile)}</div>
                <div class="close-friends-person"><strong>${typeof formatDisplayNameHtml==='function'?formatDisplayNameHtml(profile.name,profile):safe(profile.name)}</strong><span>${safe(profile.username ? '@' + profile.username : '')}</span></div>
                <button type="button" data-request-accept>${tHtml('profile.accept')}</button>
                <button type="button" data-request-decline class="relationship-decline">${tHtml('profile.decline')}</button>
              </div>`
              )
              .join('')}`
          : '';
        requestsHost.querySelectorAll('[data-request-accept]').forEach((button) => {
          button.addEventListener('click', async () => {
            const row = button.closest('[data-request-uid]');
            try {
              await respondFriend(row.dataset.requestUid, true);
              refreshFriendRequestSurfaces();
            } catch (e) {
              if (typeof showToast === 'function') showToast(errorText(e, t('rel_update_fail')));
            }
          });
        });
        requestsHost.querySelectorAll('[data-request-decline]').forEach((button) => {
          button.addEventListener('click', async () => {
            const row = button.closest('[data-request-uid]');
            try {
              await respondFriend(row.dataset.requestUid, false);
              refreshFriendRequestSurfaces();
            } catch (e) {
              if (typeof showToast === 'function') showToast(errorText(e, t('rel_update_fail')));
            }
          });
        });
      } catch (error) {
        requestsHost.textContent = '';
      }
    }
  }

  async function mountBaithakFriendRequests() {
    const host = document.getElementById('baithakFriendRequests');
    if (!host || typeof currentUser === 'undefined' || !currentUser) return;
    try {
      const data = await callRelationship('list_friend_requests');
      const profiles = data.profiles || [];
      if (!profiles.length) {
        host.hidden = true;
        host.innerHTML = '';
        return;
      }
      host.hidden = false;
      host.innerHTML = profiles
        .map((profile) => {
          const name = safe(displayNameFor(profile));
          const photo = avatarCell(profile);
          const uname = profile.username ? `@${safe(profile.username)}` : '';
          return `<div class="baithak-fr-row" data-request-uid="${safe(profile.uid)}">
            <button type="button" class="baithak-fr-avatar" data-fr-profile="${safe(profile.uid)}" aria-label="${tHtml('profile.cai_view_profile')}">${photo}</button>
            <button type="button" class="baithak-fr-copy" data-fr-profile="${safe(profile.uid)}"><strong>${typeof formatDisplayNameHtml==='function'?formatDisplayNameHtml(displayNameFor(profile),profile):name}</strong><span>${uname || tHtml('profile.friend_request')}</span></button>
            <button type="button" class="baithak-fr-accept" data-request-accept>${tHtml('profile.accept')}</button>
            <button type="button" class="baithak-fr-decline" data-request-decline aria-label="${tHtml('profile.decline')}">${typeof iconHtml==='function'?iconHtml('x',{size:16}):'×'}</button>
          </div>`;
        })
        .join('');
      host.querySelectorAll('[data-fr-profile]').forEach((button) => {
        button.addEventListener('click', (e) => {
          e.stopPropagation();
          const uid = button.getAttribute('data-fr-profile');
          const profile = profiles.find((p) => p.uid === uid);
          if (typeof openPublicProfile === 'function') {
            openPublicProfile(profile || { uid }, { uid, context: 'friend_request' });
          } else if (typeof openProfileByUid === 'function') {
            openProfileByUid(uid);
          }
        });
      });
      host.querySelectorAll('[data-request-accept]').forEach((button) => {
        button.addEventListener('click', async (e) => {
          e.stopPropagation();
          const row = button.closest('[data-request-uid]');
          try {
            await respondFriend(row.dataset.requestUid, true);
            row.remove();
            if (!host.querySelector('[data-request-uid]')) {
              host.hidden = true;
              host.innerHTML = '';
            }
            refreshFriendRequestSurfaces();
            if (typeof showToast === 'function') showToast(t('rel_now_friends'));
          } catch (err) {
            if (typeof showToast === 'function') showToast(errorText(err, t('rel_update_fail')));
          }
        });
      });
      host.querySelectorAll('[data-request-decline]').forEach((button) => {
        button.addEventListener('click', async (e) => {
          e.stopPropagation();
          const row = button.closest('[data-request-uid]');
          try {
            await respondFriend(row.dataset.requestUid, false);
            row.remove();
            if (!host.querySelector('[data-request-uid]')) {
              host.hidden = true;
              host.innerHTML = '';
            }
            refreshFriendRequestSurfaces();
          } catch (err) {
            if (typeof showToast === 'function') showToast(errorText(err, t('rel_update_fail')));
          }
        });
      });
    } catch (e) {
      host.hidden = true;
    }
  }

  document.addEventListener('chaupaal:relationship-changed', () => {
    refreshFriendRequestSurfaces();
  });

  window.openProfileMessage = openProfileMessage;
  window.relationshipState = relationshipState;
  window.hydrateRelationships = hydrateRelationships;
  window.setFollowing = setFollowing;
  window.requestFriend = requestFriend;
  window.cancelFriendRequest = cancelFriendRequest;
  window.respondFriend = respondFriend;
  window.removeFollower = removeFollower;
  window.setSplitExclusion = setSplitExclusion;
  window.openExclusionListManager = openExclusionListManager;
  window.refreshExclusionListCount = refreshExclusionListCount;
  window.loadRelationshipProfile = loadRelationshipProfile;
  window.paintRelationshipCounts = paintRelationshipCounts;
  window.relationshipCountsHtml = relationshipCountsHtml;
  window.wireFriendAction = wireFriendAction;
  window.wireProfileRelationshipActions = wireProfileRelationshipActions;
  window.primaryRelationshipMode = primaryRelationshipMode;
  window.openRelationshipMenu = openRelationshipMenu;
  window.openRelationshipList = openRelationshipList;
  window.wireRelationshipCountButtons = wireRelationshipCountButtons;
  window.bindProfileLongPress = bindProfileLongPress;
  window.mountOwnRelationshipPanel = mountOwnRelationshipPanel;
  window.mountBaithakFriendRequests = mountBaithakFriendRequests;
})();
