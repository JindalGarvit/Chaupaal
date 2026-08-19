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
    if (!envelope?.ok) throw new Error(envelope?.error?.message || 'Relationship action failed');
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
    return p.name || p.displayName || (p.username ? `@${p.username}` : '') || 'Someone';
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
    if (!requireRelationshipUser()) return null;
    const uid = profile?.uid;
    if (!uid) {
      if (typeof showToast === 'function') showToast('Could not open chat');
      return null;
    }
    if (typeof bootstrapDmChat !== 'function') {
      if (typeof showToast === 'function') showToast('Open Baithak to message');
      return null;
    }
    try {
      const chat = await bootstrapDmChat({
        uid,
        name: displayNameFor(profile),
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

      if (typeof rememberInboxChat === 'function') rememberInboxChat(chat);
      if (typeof baithakChats !== 'undefined' && Array.isArray(baithakChats)) {
        const id = chat.firestoreId || chat.id;
        const i = baithakChats.findIndex((c) => (c.firestoreId || c.id) === id);
        if (i >= 0) baithakChats[i] = { ...baithakChats[i], ...chat };
        else baithakChats.unshift(chat);
      }

      if (typeof openChatScreen === 'function') openChatScreen(chat);
      document.querySelector('.bottom-tabs .tab-btn[data-tab="baithak"]')?.click();
      return chat;
    } catch (e) {
      const msg =
        typeof friendlyDmError === 'function' ? friendlyDmError(e) : e?.message || 'Could not open chat — try again';
      if (typeof showToast === 'function') showToast(msg);
      return null;
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
    return relationshipState(targetUid);
  }

  async function requestFriend(targetUid) {
    if (!requireRelationshipUser()) throw new Error('Sign in required');
    const data = await callRelationship('request_friend', { targetUid });
    emitRelationshipChanged(targetUid, data);
    refreshFriendRequestSurfaces();
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
      <div class="relationship-counts" aria-label="Profile relationships">
        <button type="button" data-relationship-list="friends"><strong>${Number(c.friends) || 0}</strong><span>Friends</span></button>
        <button type="button" data-relationship-list="followers"><strong>${Number(c.followers) || 0}</strong><span>Followers</span></button>
        <button type="button" data-relationship-list="following"><strong>${Number(c.following) || 0}</strong><span>Following</span></button>
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
    if (state.friend) return 'Friends';
    if (state.requestReceived) return 'Accept';
    if (state.requestSent) return 'Requested';
    return 'Add Friend';
  }

  function followActionLabel(state) {
    return state.following ? 'Following' : 'Follow';
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
      label: 'View profile',
      icon: 'user',
      hint: 'Peek then open their Chaupaal profile',
      fn: () => {
        if (typeof openProfilePeek === 'function') {
          openProfilePeek(profile, { uid: profile.uid, username: profile.username });
        } else if (typeof openPublicProfile === 'function') {
          openPublicProfile(profile, { uid: profile.uid, username: profile.username });
        }
      },
    });
    actions.push({
      label: 'Message',
      icon: 'message-circle',
      hint: 'Anyone can message. Teen Mode is the only exception.',
      fn: async () => {
        await openProfileMessage(profile);
      },
    });

    if (state.friend) {
      actions.push({
        label: state.splitExcluded
          ? typeof t === 'function'
            ? t('exclusion_menu_remove')
            : 'Remove from exclusion list'
          : typeof t === 'function'
            ? t('exclusion_menu_exclude')
            : 'Exclude from Splits',
        icon: 'user-minus',
        hint:
          typeof t === 'function'
            ? t('exclusion_menu_hint')
            : 'They won\'t receive your Baithak Splits. Only you see this.',
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
        label: 'Unfriend',
        icon: 'user-x',
        danger: true,
        hint: 'Removes your follow. They may still follow you.',
        fn: async () => {
          await setFollowing(profile.uid, false, 'unfriend');
          showToast(t('rel_unfriended',{name}));
          await refresh();
        },
      });
    } else if (state.requestReceived) {
      actions.push({
        label: 'Accept friend request',
        icon: 'user-plus',
        fn: async () => {
          await respondFriend(profile.uid, true);
          showToast(t('rel_now_friends_with',{name}));
          await refresh();
        },
      });
      actions.push({
        label: 'Decline friend request',
        icon: 'x',
        danger: true,
        fn: async () => {
          await respondFriend(profile.uid, false);
          await refresh();
        },
      });
    } else if (state.requestSent) {
      actions.push({
        label: 'Cancel friend request',
        icon: 'x',
        fn: async () => {
          await cancelFriendRequest(profile.uid);
          showToast(t('rel_request_cancelled'));
          await refresh();
        },
      });
    } else if (!state.requestSent && mode !== 'friend') {
      actions.push({
        label: 'Add Friend',
        icon: 'user-plus',
        hint: state.followsYou
          ? 'They already follow you — this will make you Friends right away.'
          : 'They’ll need to accept before you’re Friends.',
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
          label: 'Follow',
          icon: 'user-plus',
          hint: 'One-way follow. Available here on personal profiles. Mutual follow makes you Friends.',
          fn: async () => {
            const next = await setFollowing(profile.uid, true, 'profile_menu');
            showToast(next.friend?t('rel_now_friends_named',{name}):t('rel_following_named',{name}));
            await refresh();
          },
        });
      }
    } else if (!state.friend) {
      actions.push({
        label: 'Unfollow',
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
          label: 'Remove follower',
          icon: 'user-x',
          danger: true,
          hint: 'Stops them following you. Your follow of them (if any) stays.',
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
        showActionSheet(title || 'More', actions);
      }
    };
    run().catch((error) => showToast(error?.message || t('rel_actions_fail')));
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
        openRelationshipMenu({ uid: targetUid, name: button.dataset.name || 'Friend' }, { title: 'Friends' });
        return;
      }
      if (state.requestReceived) {
        openRelationshipMenu({ uid: targetUid, name: button.dataset.name || 'Person' }, { title: 'Friend request' });
        return;
      }
      if (state.requestSent) {
        openRelationshipMenu({ uid: targetUid, name: button.dataset.name || 'Person' }, { title: 'Requested' });
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
        showToast(error?.message || t('rel_request_fail'));
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
            openRelationshipMenu(profile, { title: 'Friends', context });
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
            openRelationshipMenu(profile, { title: 'Requested', context });
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
            openRelationshipMenu(profile, { title: 'Following', context });
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
        showToast(error?.message || t('rel_update_fail'), 3000, { type: 'error' });
      } finally {
        if (typeof setButtonLoading === 'function') setButtonLoading(primaryBtn, false);
      }
    });

    messageBtn?.addEventListener('click', () => openProfileMessage(profile));
    moreBtn?.addEventListener('click', () => openRelationshipMenu(profile, { title: 'More', context }));
    if (typeof onLongPress === 'function' && primaryBtn) {
      onLongPress(primaryBtn, () => openRelationshipMenu(profile, { title: 'More', context }));
    }
    document.addEventListener('chaupaal:relationship-changed', (event) => {
      if (!host.isConnected) return;
      if (event.detail?.targetUid === profile.uid) paint();
    });
  }

  function bindProfileLongPress(element, profile) {
    if (!element || !profile?.uid || profile.uid === currentUser?.uid) return;
    const open = () => openRelationshipMenu(profile, { title: 'Profile actions' });
    if (typeof onLongPress === 'function') onLongPress(element, open);
    else {
      let timer;
      const clear = () => clearTimeout(timer);
      element.addEventListener('pointerdown', () => {
        timer = setTimeout(open, 550);
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((name) => element.addEventListener(name, clear));
    }
  }

  async function openRelationshipList(kind, { targetUid } = {}) {
    if (!requireRelationshipUser()) return;
    const titles = { friends: 'Friends', followers: 'Followers', following: 'Following' };
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
        ${typeof backButtonHtml === 'function' ? backButtonHtml({ attrs: 'data-rel-list-back' }) : '<button type="button" data-rel-list-back aria-label="Back" class="cp-back-btn">←</button>'}
        <div style="flex:1"><strong>${titles[kind]}</strong>
          <div class="relationship-private-note">${
            kind === 'friends'
              ? 'Mutual follows — both of you chose to connect.'
              : kind === 'followers'
                ? 'People who follow this profile.'
                : 'People this profile follows.'
          }</div>
        </div>
      </div>
      <div class="close-friends-manager" data-rel-list-body></div>`;
    const body = overlay.querySelector('[data-rel-list-body]');
    if (typeof renderSkeleton === 'function') renderSkeleton(body, { variant: 'list', count: 5 });
    else body.innerHTML = 'Loading…';
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
      const profiles = data.profiles || [];
      if (!profiles.length) {
        body.innerHTML = `<div class="comments-empty">No ${titles[kind].toLowerCase()} yet.</div>`;
        return;
      }
      body.innerHTML = profiles
        .map(
          (profile) => `
        <div class="close-friends-row" data-uid="${profile.uid}">
          <div class="close-friends-avatar">${avatarCell(profile)}</div>
          <div class="close-friends-person"><strong>${typeof formatDisplayNameHtml==='function'?formatDisplayNameHtml(profile.name,profile):safe(profile.name)}</strong><span>${safe(
            profile.username ? '@' + profile.username : profile.city || ''
          )}</span></div>
          <button type="button" data-rel-open>View</button>
        </div>`
        )
        .join('');
      body.querySelectorAll('[data-rel-open]').forEach((button) => {
        button.addEventListener('click', () => {
          const uid = button.closest('[data-uid]')?.dataset.uid;
          const profile = profiles.find((p) => p.uid === uid);
          if (!profile) return;
          if (typeof openPublicProfile === 'function') openPublicProfile(profile);
          else openRelationshipMenu(profile);
        });
      });
    } catch (error) {
      if (typeof renderErrorState === 'function') {
        renderErrorState(body, {
          message: typeof friendlyError === 'function' ? friendlyError(error) : error?.message || 'Could not load list',
          onRetry: () => openRelationshipList(kind, { targetUid }),
        });
      } else {
        body.textContent = error?.message || 'Could not load list';
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
        ${typeof backButtonHtml === 'function' ? backButtonHtml({ attrs: 'data-exclusion-back' }) : '<button type="button" data-exclusion-back aria-label="Back" class="cp-back-btn">←</button>'}
        <div style="flex:1"><strong>${typeof t === 'function' ? t('exclusion_list_label') : 'Exclusion list'}</strong>
          <div class="relationship-private-note">${typeof t === 'function' ? t('exclusion_list_note') : 'People here won\'t receive your Baithak Splits. Only you can see this list.'}</div>
        </div>
      </div>
      <div class="exclusion-list-manager close-friends-manager">
        <label class="exclusion-list-search close-friends-search"><span>${typeof t === 'function' ? t('exclusion_search_label') : 'Search Friends'}</span><input type="search" placeholder="${typeof t === 'function' ? t('exclusion_search_ph') : 'Search by username'}" data-exclusion-search></label>
        <div data-exclusion-search-results></div>
        <div class="exclusion-list-heading close-friends-heading">${typeof t === 'function' ? t('exclusion_list_heading') : 'Excluded'}</div>
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
        <div class="exclusion-list-person close-friends-person"><strong>${typeof formatDisplayNameHtml === 'function' ? formatDisplayNameHtml(profile.name || profile.username || 'Member', profile) : safe(profile.name || profile.username || 'Member')}</strong><span>${safe(profile.username ? '@' + profile.username : profile.city || '')}</span></div>
        <button type="button" data-exclusion-toggle="${isAdd ? 'add' : 'remove'}">${isAdd ? (typeof t === 'function' ? t('exclusion_add') : 'Add') : typeof t === 'function' ? t('exclusion_remove') : 'Remove'}</button>
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
            showToast(error?.message || (typeof t === 'function' ? t('exclusion_fail') : 'Could not update exclusion list'));
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
          : `<div class="comments-empty">${typeof t === 'function' ? t('exclusion_list_empty') : 'No one excluded — all Friends receive your Splits'}</div>`;
        wire(list);
      } catch (error) {
        if (typeof renderErrorState === 'function') {
          renderErrorState(list, {
            message: typeof friendlyError === 'function' ? friendlyError(error) : error?.message || 'Could not load',
            onRetry: () => renderList(),
          });
        } else {
          list.textContent = error?.message || 'Could not load exclusion list';
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
        : `<div class="comments-empty">${typeof t === 'function' ? t('exclusion_search_empty') : 'No matching Friend to add, or they are already excluded.'}</div>`;
      wire(results);
    }

    overlay.querySelector('[data-exclusion-search]')?.addEventListener('input', (event) => {
      renderSearch(event.target.value);
    });
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
      if (countsHost) countsHost.textContent = 'Relationship counts unavailable';
    }
    if (requestsHost) {
      try {
        const data = await callRelationship('list_friend_requests');
        const profiles = data.profiles || [];
        requestsHost.innerHTML = profiles.length
          ? `<div class="close-friends-heading">Friend requests</div>${profiles
              .map(
                (profile) => `
              <div class="close-friends-row" data-request-uid="${profile.uid}">
                <div class="close-friends-avatar">${avatarCell(profile)}</div>
                <div class="close-friends-person"><strong>${typeof formatDisplayNameHtml==='function'?formatDisplayNameHtml(profile.name,profile):safe(profile.name)}</strong><span>${safe(profile.username ? '@' + profile.username : '')}</span></div>
                <button type="button" data-request-accept>Accept</button>
                <button type="button" data-request-decline class="relationship-decline">Decline</button>
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
              if (typeof showToast === 'function') showToast(e?.message || t('rel_update_fail'));
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
              if (typeof showToast === 'function') showToast(e?.message || t('rel_update_fail'));
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
            <button type="button" class="baithak-fr-avatar" data-fr-profile="${safe(profile.uid)}" aria-label="View profile">${photo}</button>
            <button type="button" class="baithak-fr-copy" data-fr-profile="${safe(profile.uid)}"><strong>${typeof formatDisplayNameHtml==='function'?formatDisplayNameHtml(displayNameFor(profile),profile):name}</strong><span>${uname || 'Friend request'}</span></button>
            <button type="button" class="baithak-fr-accept" data-request-accept>Accept</button>
            <button type="button" class="baithak-fr-decline" data-request-decline aria-label="Decline">${typeof iconHtml==='function'?iconHtml('x',{size:16}):'×'}</button>
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
            if (typeof showToast === 'function') showToast(err?.message || t('rel_update_fail'));
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
            if (typeof showToast === 'function') showToast(err?.message || t('rel_update_fail'));
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
