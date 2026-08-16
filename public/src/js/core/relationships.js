/**
 * Relationship client.
 * Follow is directional; Friend is derived from reciprocal follows.
 * Close Friends is a private subset of Friends (decision 1B).
 */
(function () {
  'use strict';

  const cache = new Map();

  function safe(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
    );
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
      closeFriend: false,
    };
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
    if (typeof openDmWithSharedHello === 'function') {
      return openDmWithSharedHello({
        uid,
        name: profile.name || profile.displayName || 'Chaupaal member',
        avatar: profile.photoURL || profile.avatar,
        theirIcebreakers: profile.icebreakers,
        origin: 'profile',
        peerProfileType: profile.profileType,
        matchMeta: {
          teenMode: profile.teenMode,
          isMinor: profile.isMinor,
          age: profile.age,
        },
      });
    }
    if (typeof showToast === 'function') showToast('Open Baithak to message');
    return null;
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
    return { state: relationshipState(targetUid), accepted: !!data.accepted, autoAccepted: !!data.autoAccepted };
  }

  async function cancelFriendRequest(targetUid) {
    if (!requireRelationshipUser()) throw new Error('Sign in required');
    const data = await callRelationship('cancel_friend_request', { targetUid });
    emitRelationshipChanged(targetUid, data);
    return relationshipState(targetUid);
  }

  async function respondFriend(requesterUid, accept) {
    if (!requireRelationshipUser()) throw new Error('Sign in required');
    const data = await callRelationship('respond_friend', {
      targetUid: requesterUid,
      accept: !!accept,
    });
    emitRelationshipChanged(requesterUid, data);
    return relationshipState(requesterUid);
  }

  async function removeFollower(followerUid) {
    if (!requireRelationshipUser()) throw new Error('Sign in required');
    const data = await callRelationship('remove_follower', { targetUid: followerUid });
    emitRelationshipChanged(followerUid, data);
    return relationshipState(followerUid);
  }

  async function setCloseFriend(targetUid, enabled) {
    if (!requireRelationshipUser()) throw new Error('Sign in required');
    const data = await callRelationship('set_close_friend', { targetUid, enabled: !!enabled });
    const state = { ...relationshipState(targetUid), closeFriend: !!data.closeFriend };
    cache.set(targetUid, state);
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
        label: state.closeFriend ? 'Remove from Close Friends' : 'Add to Close Friends',
        icon: 'star',
        hint: 'Close Friends is private — only you see this list. Unfollowing also removes them.',
        fn: async () => {
          const next = await setCloseFriend(profile.uid, !state.closeFriend);
          showToast(next.closeFriend?t('rel_cf_added',{name}):t('rel_cf_removed',{name}));
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
          if (result.autoAccepted || result.accepted) showToast(t('rel_now_friends'));
          else showToast(t('rel_request_sent'));
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
          showToast(next.friend ? t('rel_now_friends') : t('rel_following'));
        }
      } catch (error) {
        cache.set(profile.uid, prev);
        paint();
        showToast(error?.message || t('rel_update_fail'));
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

    document.getElementById('relationshipListSheet')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'relationshipListSheet';
    overlay.className = 'archive-overlay';
    overlay.innerHTML = `
      <div class="archive-header">
        <button type="button" data-rel-list-back aria-label="Back">←</button>
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
      <div class="close-friends-manager" data-rel-list-body>Loading…</div>`;
    document.querySelector('.device')?.appendChild(overlay);
    overlay.querySelector('[data-rel-list-back]')?.addEventListener('click', () => overlay.remove());

    const body = overlay.querySelector('[data-rel-list-body]');
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
          <div class="close-friends-avatar">${profile.photoURL ? `<img src="${profile.photoURL}" alt="">` : '👤'}</div>
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
          overlay.remove();
          if (typeof openPublicProfile === 'function') openPublicProfile(profile);
          else openRelationshipMenu(profile);
        });
      });
    } catch (error) {
      body.textContent = error?.message || 'Could not load list';
    }
  }

  function wireRelationshipCountButtons(root, { targetUid } = {}) {
    root?.querySelectorAll('[data-relationship-list]')?.forEach((button) => {
      button.addEventListener('click', () => openRelationshipList(button.dataset.relationshipList, { targetUid }));
    });
  }

  async function openCloseFriendsManager() {
    document.getElementById('closeFriendsManager')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'closeFriendsManager';
    overlay.className = 'archive-overlay';
    overlay.innerHTML = `
      <div class="archive-header">
        <button type="button" data-close-friends-back aria-label="Back">←</button>
        <div style="flex:1"><strong>Close Friends</strong>
          <div class="relationship-private-note">Private — only you see this list. Only current Friends can be added. Unfollowing removes them automatically.</div>
        </div>
      </div>
      <div class="close-friends-manager">
        <label class="close-friends-search"><span>Search Friends</span><input type="search" placeholder="Search by username"></label>
        <div data-close-friends-results></div>
        <div class="close-friends-heading">On your list</div>
        <div data-close-friends-list class="ui-skeleton-stack">Loading…</div>
      </div>`;
    document.querySelector('.device')?.appendChild(overlay);
    overlay.querySelector('[data-close-friends-back]')?.addEventListener('click', () => overlay.remove());
    const list = overlay.querySelector('[data-close-friends-list]');
    const results = overlay.querySelector('[data-close-friends-results]');
    let allFriends = [];

    const row = (profile, selected) => `
      <div class="close-friends-row" data-uid="${profile.uid}">
        <div class="close-friends-avatar">${profile.photoURL ? `<img src="${profile.photoURL}" alt="">` : '👤'}</div>
        <div class="close-friends-person"><strong>${typeof formatDisplayNameHtml==='function'?formatDisplayNameHtml(profile.name || profile.username || 'Member',profile):safe(profile.name || profile.username || 'Member')}</strong><span>${safe(profile.username ? '@' + profile.username : profile.city || '')}</span></div>
        <button type="button" data-close-toggle="${selected ? 'remove' : 'add'}">${selected ? 'Remove' : 'Add'}</button>
      </div>`;

    const wire = (root) => {
      root.querySelectorAll('[data-close-toggle]').forEach((button) => {
        button.addEventListener('click', async () => {
          const uid = button.closest('[data-uid]')?.dataset.uid;
          if (!uid) return;
          button.disabled = true;
          try {
            await setCloseFriend(uid, button.dataset.closeToggle === 'add');
            await renderList();
            renderSearch(overlay.querySelector('input')?.value || '');
          } catch (error) {
            button.disabled = false;
            showToast(error?.message || t('rel_cf_fail'));
          }
        });
      });
    };

    async function renderList() {
      try {
        const [data, friendsData] = await Promise.all([
          callRelationship('list_close_friends'),
          callRelationship('list_friends'),
        ]);
        const profiles = data.profiles || [];
        allFriends = friendsData.profiles || [];
        profiles.forEach((profile) => {
          cache.set(profile.uid, { ...relationshipState(profile.uid), closeFriend: true });
        });
        list.innerHTML = profiles.length
          ? profiles.map((profile) => row(profile, true)).join('')
          : '<div class="comments-empty">Your Close Friends list is empty. Add Friends here for selective Baithak sharing.</div>';
        wire(list);
      } catch (error) {
        list.textContent = error?.message || 'Could not load Close Friends';
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
          String(profile.name || '')
            .toLowerCase()
            .includes(q) ||
          String(profile.username || '')
            .toLowerCase()
            .includes(q.replace(/^@/, ''))
      );
      results.innerHTML = matches.length
        ? matches.map((profile) => row(profile, relationshipState(profile.uid).closeFriend)).join('')
        : '<div class="comments-empty">No matching Friend. Only Friends can join Close Friends.</div>';
      wire(results);
    }

    overlay.querySelector('input')?.addEventListener('input', (event) => {
      renderSearch(event.target.value);
    });
    await renderList();
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
                <div class="close-friends-avatar">${profile.photoURL ? `<img src="${profile.photoURL}" alt="">` : '👤'}</div>
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
              row.remove();
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
              row.remove();
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
          const name = safe(profile.name || profile.username || 'Someone');
          const photo = profile.photoURL
            ? `<img src="${safe(profile.photoURL)}" alt="">`
            : '👤';
          return `<div class="baithak-fr-row" data-request-uid="${safe(profile.uid)}">
            <div class="baithak-fr-avatar">${photo}</div>
            <div class="baithak-fr-copy"><strong>${typeof formatDisplayNameHtml==='function'?formatDisplayNameHtml(profile.name,profile):name}</strong><span>Friend request</span></div>
            <button type="button" class="baithak-fr-accept" data-request-accept>Accept</button>
            <button type="button" class="baithak-fr-decline" data-request-decline aria-label="Decline">${typeof iconHtml==='function'?iconHtml('x',{size:16}):'×'}</button>
          </div>`;
        })
        .join('');
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
          } catch (err) {
            if (typeof showToast === 'function') showToast(err?.message || t('rel_update_fail'));
          }
        });
      });
    } catch (e) {
      host.hidden = true;
    }
  }

  window.openProfileMessage = openProfileMessage;
  window.relationshipState = relationshipState;
  window.hydrateRelationships = hydrateRelationships;
  window.setFollowing = setFollowing;
  window.requestFriend = requestFriend;
  window.cancelFriendRequest = cancelFriendRequest;
  window.respondFriend = respondFriend;
  window.removeFollower = removeFollower;
  window.setCloseFriend = setCloseFriend;
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
  window.openCloseFriendsManager = openCloseFriendsManager;
  window.mountOwnRelationshipPanel = mountOwnRelationshipPanel;
  window.mountBaithakFriendRequests = mountBaithakFriendRequests;
})();
