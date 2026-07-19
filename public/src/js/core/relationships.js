/**
 * Relationship client.
 * Follow is directional; Friend is derived from reciprocal follows.
 */
(function () {
  'use strict';

  const cache = new Map();

  function safe(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
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
    else if (typeof showToast === 'function') showToast('Sign in to connect with people');
    return false;
  }

  async function hydrateRelationships(targetUids) {
    const ids = [...new Set((targetUids || []).filter(Boolean))];
    if (!ids.length || !currentUser) return {};
    const data = await callRelationship('hydrate', { targetUids: ids });
    Object.entries(data.states || {}).forEach(([uid, state]) => cache.set(uid, state));
    return data.states || {};
  }

  async function setFollowing(targetUid, enabled, source) {
    if (!requireRelationshipUser()) throw new Error('Sign in required');
    const data = await callRelationship(enabled ? 'follow' : 'unfollow', {
      targetUid,
      source: source || 'profile',
    });
    cache.set(targetUid, data.state || defaultState());
    document.dispatchEvent(
      new CustomEvent('chaupaal:relationship-changed', {
        detail: { targetUid, state: relationshipState(targetUid) },
      })
    );
    return relationshipState(targetUid);
  }

  async function requestFriend(targetUid) {
    if (!requireRelationshipUser()) throw new Error('Sign in required');
    const data = await callRelationship('request_friend', { targetUid });
    cache.set(targetUid, data.state || defaultState());
    return relationshipState(targetUid);
  }

  async function respondFriend(requesterUid, accept) {
    if (!requireRelationshipUser()) throw new Error('Sign in required');
    const data = await callRelationship('respond_friend', {
      targetUid: requesterUid,
      accept: !!accept,
    });
    cache.set(requesterUid, data.state || defaultState());
    return relationshipState(requesterUid);
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

  function friendActionLabel(state) {
    if (state.friend) return '✓ Friends';
    if (state.requestReceived) return 'Respond';
    if (state.requestSent) return 'Requested';
    return 'Add Friend';
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
      button.disabled = state.requestSent || state.friend;
      button.classList.toggle('is-connected', state.friend);
    };
    paint();
    button.addEventListener('click', async () => {
      if (!requireRelationshipUser()) return;
      const state = relationshipState(targetUid);
      if (state.requestReceived) {
        if (typeof showActionSheet === 'function') {
          showActionSheet('Friend request', [
            {
              label: 'Accept',
              fn: async () => {
                await respondFriend(targetUid, true);
                paint();
                showToast('You are now Friends');
              },
            },
            {
              label: 'Decline',
              danger: true,
              fn: async () => {
                await respondFriend(targetUid, false);
                paint();
              },
            },
          ]);
        }
        return;
      }
      if (state.friend || state.requestSent) return;
      button.disabled = true;
      try {
        await requestFriend(targetUid);
        paint();
        showToast('Friend request sent');
      } catch (error) {
        button.disabled = false;
        showToast(error?.message || 'Could not send request');
      }
    });
  }

  function bindProfileLongPress(element, profile) {
    if (!element || !profile?.uid || profile.uid === currentUser?.uid) return;
    const open = async () => {
      if (!requireRelationshipUser()) return;
      try {
        if (!cache.has(profile.uid)) await hydrateRelationships([profile.uid]);
        const state = relationshipState(profile.uid);
        if (typeof showActionSheet === 'function') {
          const actions = [];
          if (state.friend) {
            actions.push({
              label: state.closeFriend ? 'Remove from Close Friends' : 'Add to Close Friends',
              fn: async () => {
                const next = await setCloseFriend(profile.uid, !state.closeFriend);
                showToast(
                  next.closeFriend
                    ? `${profile.name || 'Person'} added to Close Friends`
                    : `${profile.name || 'Person'} removed from Close Friends`
                );
              },
            });
          }
          actions.push({
              label: state.following ? 'Unfollow' : 'Follow',
              fn: () => setFollowing(profile.uid, !state.following, 'profile_long_press'),
            });
          showActionSheet('Profile actions', actions);
        }
      } catch (error) {
        showToast(error?.message || 'Could not load profile actions');
      }
    };
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

  async function openCloseFriendsManager() {
    document.getElementById('closeFriendsManager')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'closeFriendsManager';
    overlay.className = 'archive-overlay';
    overlay.innerHTML = `
      <div class="archive-header">
        <button type="button" data-close-friends-back aria-label="Back">←</button>
        <div style="flex:1"><strong>Close Friends</strong><div class="relationship-private-note">Private — only you can see this list</div></div>
      </div>
      <div class="close-friends-manager">
        <label class="close-friends-search"><span>Search people</span><input type="search" placeholder="Search by username"></label>
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
        <div class="close-friends-person"><strong>${safe(profile.name || profile.username || 'Member')}</strong><span>${safe(profile.username ? '@' + profile.username : profile.city || '')}</span></div>
        <button type="button" data-close-toggle="${selected ? 'remove' : 'add'}">${selected ? 'Remove' : 'Add'}</button>
      </div>`;

    const wire = (root) => {
      root.querySelectorAll('[data-close-toggle]').forEach((button) => {
        button.addEventListener('click', async () => {
          const uid = button.closest('[data-uid]')?.dataset.uid;
          if (!uid) return;
          button.disabled = true;
          await setCloseFriend(uid, button.dataset.closeToggle === 'add');
          await renderList();
          renderSearch(overlay.querySelector('input')?.value || '');
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
          : '<div class="comments-empty">Your Close Friends list is empty.</div>';
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
          String(profile.name || '').toLowerCase().includes(q) ||
          String(profile.username || '').toLowerCase().includes(q.replace(/^@/, ''))
      );
      results.innerHTML = matches.length
        ? matches.map((profile) => row(profile, relationshipState(profile.uid).closeFriend)).join('')
        : '<div class="comments-empty">No matching Friend.</div>';
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
      if (countsHost) countsHost.innerHTML = relationshipCountsHtml(data.counts);
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
                <div class="close-friends-person"><strong>${safe(profile.name)}</strong><span>${safe(profile.username ? '@' + profile.username : '')}</span></div>
                <button type="button" data-request-accept>Accept</button>
                <button type="button" data-request-decline class="relationship-decline">Decline</button>
              </div>`
              )
              .join('')}`
          : '';
        requestsHost.querySelectorAll('[data-request-accept]').forEach((button) => {
          button.addEventListener('click', async () => {
            const row = button.closest('[data-request-uid]');
            await respondFriend(row.dataset.requestUid, true);
            row.remove();
            mountOwnRelationshipPanel(root);
          });
        });
        requestsHost.querySelectorAll('[data-request-decline]').forEach((button) => {
          button.addEventListener('click', async () => {
            const row = button.closest('[data-request-uid]');
            await respondFriend(row.dataset.requestUid, false);
            row.remove();
          });
        });
      } catch (error) {
        requestsHost.textContent = '';
      }
    }
  }

  window.relationshipState = relationshipState;
  window.hydrateRelationships = hydrateRelationships;
  window.setFollowing = setFollowing;
  window.requestFriend = requestFriend;
  window.respondFriend = respondFriend;
  window.setCloseFriend = setCloseFriend;
  window.loadRelationshipProfile = loadRelationshipProfile;
  window.relationshipCountsHtml = relationshipCountsHtml;
  window.wireFriendAction = wireFriendAction;
  window.bindProfileLongPress = bindProfileLongPress;
  window.openCloseFriendsManager = openCloseFriendsManager;
  window.mountOwnRelationshipPanel = mountOwnRelationshipPanel;
})();
