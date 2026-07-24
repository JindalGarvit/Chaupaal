/**
 * Baithak group chat — Group Info overlay, membership, admins, invites.
 * Built on nav-stack / overlay-scope (see CONVENTIONS.md).
 */
(function () {
  'use strict';

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function inviteToken() {
    const a = crypto?.getRandomValues?.(new Uint8Array(12));
    if (a) return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
    return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /** Public by default (missing/undefined counts as public — Phase 3.2 retroactive). */
  function isGroupPublic(chat) {
    if (!chat) return true;
    return chat.isPublic !== false;
  }

  function groupNameLower(name) {
    return String(name || '')
      .toLowerCase()
      .trim()
      .slice(0, 80);
  }

  /** Longest-standing = earliest joinedAt; fall back to createdBy, then any participant. */
  function pickLongestStandingSuccessor(chat, excludeUid) {
    const participants = (chat.participants || []).filter((u) => u && u !== excludeUid);
    if (!participants.length) return null;
    const profiles = chat.memberProfiles || {};
    const ranked = participants
      .map((uid) => ({
        uid,
        joinedAt: Number(profiles[uid]?.joinedAt) || Number.MAX_SAFE_INTEGER,
      }))
      .sort((a, b) => a.joinedAt - b.joinedAt || String(a.uid).localeCompare(String(b.uid)));
    if (chat.createdBy && chat.createdBy !== excludeUid && participants.includes(chat.createdBy)) {
      const creator = ranked.find((r) => r.uid === chat.createdBy);
      if (creator && creator.joinedAt === ranked[0].joinedAt) return creator.uid;
    }
    return ranked[0]?.uid || null;
  }

  function normalizeGroupChat(raw) {
    if (!raw || raw.type !== 'group') return raw;
    const admins = Array.isArray(raw.admins) ? raw.admins : [];
    const perms = raw.permissions || {};
    const invite = raw.invite || {};
    const memberProfiles = raw.memberProfiles || {};
    const participants = Array.isArray(raw.participants) ? raw.participants : [];
    return {
      ...raw,
      admins,
      isPublic: raw.isPublic !== false,
      nameLower: raw.nameLower || groupNameLower(raw.name),
      memberCount: typeof raw.memberCount === 'number' ? raw.memberCount : participants.length,
      permissions: {
        addMembers: perms.addMembers === 'admin' ? 'admin' : 'all',
        editInfo: perms.editInfo === 'all' ? 'all' : 'admin',
      },
      invite: {
        token: invite.token || raw.inviteToken || '',
        mode: invite.mode === 'approval' ? 'approval' : 'instant',
        enabled: invite.enabled !== false,
      },
      memberProfiles,
    };
  }

  function memberListFromChat(chat) {
    const profiles = chat.memberProfiles || {};
    let participants = chat.participants || [];
    if (!participants.length && currentUser?.uid) {
      participants = [currentUser.uid];
      if (!profiles[currentUser.uid]) {
        profiles[currentUser.uid] = {
          name: userProfile?.name || currentUser.displayName || 'You',
          avatar: userProfile?.avatar || '👤',
          role: 'admin',
          joinedAt: Date.now(),
        };
      }
    }
    const list = participants.map((uid) => {
      const p = profiles[uid] || {};
      return {
        uid,
        name: p.name || 'Member',
        avatar: p.avatar || p.photoURL || '👤',
        photoURL: p.photoURL || '',
        profileType: p.profileType || null,
        role: chat.admins?.includes(uid) ? 'admin' : p.role === 'admin' ? 'admin' : 'member',
        joinedAt: p.joinedAt || null,
      };
    });
    list.sort((a, b) => {
      if (a.role === 'admin' && b.role !== 'admin') return -1;
      if (b.role === 'admin' && a.role !== 'admin') return 1;
      return (a.joinedAt || 0) - (b.joinedAt || 0);
    });
    return list;
  }

  function isGroupAdmin(chat, uid) {
    if (!chat || !uid) return false;
    if (chat.createdBy === uid) return true;
    return Array.isArray(chat.admins) && chat.admins.includes(uid);
  }

  function canAddMembers(chat, uid) {
    if (!isGroupAdmin(chat, uid) && chat.permissions?.addMembers === 'admin') return false;
    return !!(chat.participants || []).includes(uid);
  }

  function canEditInfo(chat, uid) {
    if (chat.permissions?.editInfo === 'all') return !!(chat.participants || []).includes(uid);
    return isGroupAdmin(chat, uid);
  }

  async function fetchGroupDoc(chatId) {
    if (!db || !chatId) return null;
    try {
      const snap = await db.collection('chats').doc(chatId).get();
      if (!snap.exists) return null;
      return normalizeGroupChat({ id: snap.id, firestoreId: snap.id, ...snap.data() });
    } catch (e) {
      console.warn('[group]', e?.message || e);
      return null;
    }
  }

  async function patchGroupDoc(chatId, patch) {
    if (!db || !chatId) throw new Error('No database');
    await db
      .collection('chats')
      .doc(chatId)
      .set({ ...patch, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  }

  function mergeChatLocal(chatId, patch) {
    if (typeof baithakChats === 'undefined' || !Array.isArray(baithakChats)) return;
    const idx = baithakChats.findIndex((c) => c.firestoreId === chatId || c.id === chatId);
    if (idx < 0) return;
    baithakChats[idx] = normalizeGroupChat({ ...baithakChats[idx], ...patch });
    if (window.currentOpenChat && (window.currentOpenChat.firestoreId === chatId || window.currentOpenChat.id === chatId)) {
      window.currentOpenChat = baithakChats[idx];
    }
    if (typeof renderChatList === 'function') renderChatList(baithakChats);
  }

  function inviteUrl(token) {
    if (typeof buildDeepLink === 'function') return `${location.origin}${buildDeepLink('join', token)}`;
    return `${location.origin}/join/g/${encodeURIComponent(token)}`;
  }

  /** Create a new group in Firestore and local inbox. */
  async function createGroupInFirestore({ name, description }) {
    if (!db || !currentUser) {
      if (typeof showToast === 'function') showToast('Sign in to create a group');
      return null;
    }
    const trimmed = String(name || '').trim();
    if (!trimmed) return null;
    const uid = currentUser.uid;
    const token = inviteToken();
    const memberProfiles = {};
    memberProfiles[uid] = {
      name: userProfile?.name || currentUser.displayName || 'You',
      avatar: userProfile?.avatar || '👤',
      photoURL: currentUser.photoURL || userProfile?.photoURL || '',
      role: 'admin',
      profileType:
        typeof ownProfileType === 'function'
          ? ownProfileType()
          : typeof getProfileType === 'function'
            ? getProfileType()
            : 'personal',
      joinedAt: Date.now(),
    };
    const doc = {
      type: 'group',
      name: trimmed.slice(0, 80),
      nameLower: groupNameLower(trimmed),
      description: String(description || '').slice(0, 200),
      avatar: '👥',
      photoURL: null,
      participants: [uid],
      admins: [uid],
      createdBy: uid,
      memberProfiles,
      memberCount: 1,
      isPublic: true,
      permissions: { addMembers: 'all', editInfo: 'admin' },
      invite: { token, mode: 'instant', enabled: true },
      preview: 'Group created',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    const ref = await db.collection('chats').add(doc);
    try {
      await db.collection('groupInvites').doc(token).set({
        chatId: ref.id,
        mode: 'instant',
        enabled: true,
        name: trimmed.slice(0, 80),
        createdBy: uid,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.warn('[group] invite index', e?.message || e);
    }
    const chat = normalizeGroupChat({
      id: ref.id,
      firestoreId: ref.id,
      ...doc,
      time: 'now',
      unread: 0,
      ts: Date.now(),
    });
    if (typeof baithakChats !== 'undefined') {
      baithakChats.unshift(chat);
      if (typeof pinSelfChat === 'function') baithakChats = pinSelfChat(baithakChats);
      if (typeof renderChatList === 'function') renderChatList(baithakChats);
    }
    return chat;
  }

  async function addMemberToGroup(chat, friend) {
    const chatId = chat.firestoreId || chat.id;
    const uid = friend.uid || friend.id;
    if (!uid || !chatId) return false;
    if ((chat.participants || []).includes(uid)) {
      if (typeof showToast === 'function') showToast('Already in the group');
      return false;
    }
    const memberProfiles = { ...(chat.memberProfiles || {}) };
    memberProfiles[uid] = {
      name: friend.name || 'Member',
      avatar: friend.avatar || '👤',
      photoURL: friend.photoURL || '',
      role: 'member',
      profileType: friend.profileType || friend.profile?.profileType || 'personal',
      joinedAt: Date.now(),
    };
    const participants = [...(chat.participants || []), uid];
    await patchGroupDoc(chatId, { participants, memberProfiles, memberCount: participants.length });
    mergeChatLocal(chatId, { participants, memberProfiles, memberCount: participants.length });
    return true;
  }

  async function removeMemberFromGroup(chat, targetUid) {
    const chatId = chat.firestoreId || chat.id;
    if (!chatId || !targetUid) return false;
    const participants = (chat.participants || []).filter((u) => u !== targetUid);
    const memberProfiles = { ...(chat.memberProfiles || {}) };
    delete memberProfiles[targetUid];
    let admins = (chat.admins || []).filter((u) => u !== targetUid);
    // Never leave an active group with zero admins — promote longest-standing remaining member.
    if (!admins.length && participants.length) {
      const successor = pickLongestStandingSuccessor({ ...chat, participants, memberProfiles }, targetUid);
      if (successor) {
        admins = [successor];
        if (memberProfiles[successor]) memberProfiles[successor].role = 'admin';
      }
    }
    await patchGroupDoc(chatId, {
      participants,
      memberProfiles,
      admins,
      memberCount: participants.length,
    });
    mergeChatLocal(chatId, { participants, memberProfiles, admins, memberCount: participants.length });
    return true;
  }

  async function setMemberAdmin(chat, targetUid, makeAdmin) {
    const chatId = chat.firestoreId || chat.id;
    let admins = [...(chat.admins || [])];
    const memberProfiles = { ...(chat.memberProfiles || {}) };
    if (makeAdmin) {
      if (!admins.includes(targetUid)) admins.push(targetUid);
      if (memberProfiles[targetUid]) memberProfiles[targetUid].role = 'admin';
    } else {
      if (admins.length <= 1 && admins.includes(targetUid)) {
        if (typeof showToast === 'function') showToast('Promote another admin first');
        return false;
      }
      admins = admins.filter((u) => u !== targetUid);
      if (memberProfiles[targetUid]) memberProfiles[targetUid].role = 'member';
    }
    await patchGroupDoc(chatId, { admins, memberProfiles });
    mergeChatLocal(chatId, { admins, memberProfiles });
    return true;
  }

  async function updateGroupDetails(chat, { name, photoURL, avatar, isPublic }) {
    const chatId = chat.firestoreId || chat.id;
    const patch = {};
    if (name != null) {
      patch.name = String(name).slice(0, 80);
      patch.nameLower = groupNameLower(patch.name);
    }
    if (photoURL != null) patch.photoURL = photoURL;
    if (avatar != null) patch.avatar = avatar;
    if (typeof isPublic === 'boolean') patch.isPublic = isPublic;
    await patchGroupDoc(chatId, patch);
    mergeChatLocal(chatId, patch);
    const headerName = document.querySelector('#activeChatScreen .chat-header-name');
    const headerAv = document.querySelector('#activeChatScreen .chat-header-avatar');
    if (headerName && patch.name) headerName.textContent = patch.name;
    if (headerAv) {
      headerAv.innerHTML =
        patch.photoURL || (patch.avatar && /^https:/.test(patch.avatar))
          ? `<img src="${esc(patch.photoURL || patch.avatar)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
          : esc(patch.avatar || chat.avatar || '👥');
    }
  }

  async function leaveGroupPersist(chat) {
    const chatId = chat.firestoreId || chat.id;
    const uid = currentUser?.uid;
    if (!chatId || !uid) return false;
    const admins = chat.admins || [];
    const participants = chat.participants || [];
    // Sole admin leaving: auto-promote longest-standing remaining member (never zero admins).
    if (admins.length === 1 && admins[0] === uid && participants.length > 1) {
      const successor = pickLongestStandingSuccessor(chat, uid);
      if (successor) {
        await setMemberAdmin(chat, successor, true);
        const name = chat.memberProfiles?.[successor]?.name || 'a member';
        if (typeof showToast === 'function') showToast(`${name} is now admin`);
      }
    }
    await removeMemberFromGroup(chat, uid);
    if (typeof baithakChats !== 'undefined') {
      const idx = baithakChats.findIndex((c) => c.firestoreId === chatId || c.id === chatId);
      if (idx >= 0) baithakChats.splice(idx, 1);
      if (typeof renderChatList === 'function') renderChatList(baithakChats);
    }
    return true;
  }

  async function loadJoinRequests(chatId) {
    if (!db || !chatId) return [];
    try {
      const snap = await db.collection('chats').doc(chatId).collection('joinRequests').where('status', '==', 'pending').get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e) {
      return [];
    }
  }

  async function resolveJoinRequest(chat, req, accept) {
    const chatId = chat.firestoreId || chat.id;
    if (!db || !chatId || !req?.uid) return;
    const ref = db.collection('chats').doc(chatId).collection('joinRequests').doc(req.uid);
    if (accept) {
      await addMemberToGroup(chat, { uid: req.uid, name: req.name, avatar: req.avatar, photoURL: req.photoURL });
    }
    await ref.set({ status: accept ? 'accepted' : 'rejected', resolvedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  }

  /** Join via invite token (instant or request). Uses groupInvites/{token} — never lists chats by invite. */
  async function joinGroupByInviteToken(token) {
    if (!db || !currentUser || !token) return { ok: false, reason: 'auth' };
    const uid = currentUser.uid;
    try {
      const inviteSnap = await db.collection('groupInvites').doc(token).get();
      if (!inviteSnap.exists) return { ok: false, reason: 'not_found' };
      const inviteMeta = inviteSnap.data() || {};
      if (inviteMeta.enabled === false) return { ok: false, reason: 'disabled' };
      const chatId = inviteMeta.chatId;
      if (!chatId) return { ok: false, reason: 'not_found' };
      const mode = inviteMeta.mode === 'approval' ? 'approval' : 'instant';

      if (mode === 'approval') {
        await db.collection('chats').doc(chatId).collection('joinRequests').doc(uid).set({
          uid,
          name: userProfile?.name || currentUser.displayName || 'Member',
          avatar: userProfile?.avatar || '👤',
          photoURL: currentUser.photoURL || '',
          profileType:
            typeof ownProfileType === 'function'
              ? ownProfileType()
              : typeof getProfileType === 'function'
                ? getProfileType()
                : 'personal',
          status: 'pending',
          requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        return {
          ok: true,
          pending: true,
          chat: { id: chatId, firestoreId: chatId, type: 'group', name: inviteMeta.name || 'Group' },
        };
      }

      await db
        .collection('chats')
        .doc(chatId)
        .update({
          participants: firebase.firestore.FieldValue.arrayUnion(uid),
          [`memberProfiles.${uid}`]: {
            name: userProfile?.name || currentUser.displayName || 'Member',
            avatar: userProfile?.avatar || '👤',
            photoURL: currentUser.photoURL || '',
            role: 'member',
            profileType:
              typeof ownProfileType === 'function'
                ? ownProfileType()
                : typeof getProfileType === 'function'
                  ? getProfileType()
                  : 'personal',
            joinedAt: Date.now(),
          },
          memberCount: firebase.firestore.FieldValue.increment(1),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });

      const data = await fetchGroupDoc(chatId);
      const chat = data || normalizeGroupChat({
        id: chatId,
        firestoreId: chatId,
        type: 'group',
        name: inviteMeta.name || 'Group',
        participants: [uid],
      });
      if (typeof baithakChats !== 'undefined') {
        baithakChats.unshift(chat);
        if (typeof pinSelfChat === 'function') baithakChats = pinSelfChat(baithakChats);
        if (typeof renderChatList === 'function') renderChatList(baithakChats);
      }
      return { ok: true, chat };
    } catch (e) {
      console.warn('[group] join', e?.message || e);
      return { ok: false, reason: 'error' };
    }
  }

  function openGroupInfo(initialChat) {
    if (!initialChat || initialChat.type !== 'group') return;
    document.querySelector('.group-info-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'group-info-overlay archive-overlay';
    overlay.dataset.navManaged = '1';
    overlay.innerHTML = `
      <div class="group-info-header archive-header">
        <button type="button" class="group-info-back" data-group-info-close aria-label="Back">←</button>
        <div class="group-info-title">Group info</div>
      </div>
      <div class="group-info-scroll" data-gi-scroll>
        <div class="group-info-hero" data-gi-hero></div>
        <div class="group-info-section" data-gi-requests hidden></div>
        <div class="group-info-notice" data-gi-public-notice hidden></div>
        <div class="group-info-section" data-gi-privacy hidden>
          <div class="group-info-section-head">Discoverability</div>
          <label class="group-info-toggle"><span>Public — appear in Chaupaal search</span><input type="checkbox" data-gi-public-toggle></label>
          <div class="group-info-muted" style="font-size:12px;margin-top:6px;">Private groups stay invite-only and never show in global search for non-members.</div>
        </div>
        <div class="group-info-section">
          <div class="group-info-section-head">Members <span data-gi-count></span></div>
          <div class="group-info-members" data-gi-members></div>
          <button type="button" class="group-info-action" data-gi-add-member hidden>+ Add member</button>
        </div>
        <div class="group-info-section" data-gi-invite-section>
          <div class="group-info-section-head">Invite link</div>
          <div class="group-info-invite-row" data-gi-invite-row></div>
          <label class="group-info-toggle" data-gi-invite-mode hidden>
            <span>Admin must approve joins</span>
            <input type="checkbox" data-gi-approval-toggle>
          </label>
        </div>
        <div class="group-info-section" data-gi-perms hidden>
          <div class="group-info-section-head">Permissions</div>
          <label class="group-info-toggle"><span>Any member can add people</span><input type="checkbox" data-gi-perm-add></label>
          <label class="group-info-toggle"><span>Any member can edit group info</span><input type="checkbox" data-gi-perm-edit></label>
        </div>
        <button type="button" class="group-info-join" data-gi-join hidden>Join group</button>
        <button type="button" class="group-info-leave" data-gi-leave>Leave group</button>
      </div>`;

    const device = document.querySelector('.device');
    if (!device) return;
    device.appendChild(overlay);

    let chat = normalizeGroupChat({ ...initialChat });
    let joinReqUnsub = null;

    const close = () => {
      joinReqUnsub?.();
      if (typeof removeNavLayer === 'function') removeNavLayer(overlay);
      overlay.remove();
    };
    if (typeof pushNavLayer === 'function') pushNavLayer(overlay, close);
    if (typeof registerScopedOverlay === 'function') {
      registerScopedOverlay(typeof OVERLAY_SCOPE_CHAT === 'string' ? OVERLAY_SCOPE_CHAT : 'chat', overlay, close);
    }
    overlay.querySelector('[data-group-info-close]')?.addEventListener('click', close);

    async function refresh() {
      const live = await fetchGroupDoc(chat.firestoreId || chat.id);
      if (live) chat = live;
      await render();
    }

    async function render() {
      const uid = currentUser?.uid;
      const admin = isGroupAdmin(chat, uid);
      const chatId = chat.firestoreId || chat.id;
      // Lazy migrate: missing isPublic → public (retroactive) + denorm fields for search.
      if (admin && chatId && db) {
        try {
          const snap = await db.collection('chats').doc(chatId).get();
          const data = snap.exists ? snap.data() || {} : {};
          const migrate = {};
          if (!('isPublic' in data)) migrate.isPublic = true;
          if (!data.nameLower && chat.name) migrate.nameLower = groupNameLower(chat.name);
          if (typeof data.memberCount !== 'number') migrate.memberCount = (chat.participants || []).length;
          if (Object.keys(migrate).length) {
            await patchGroupDoc(chatId, migrate);
            Object.assign(chat, migrate);
            mergeChatLocal(chatId, migrate);
          }
        } catch (e) {}
      }

      const members = memberListFromChat(chat);
      if (typeof enrichUsersWithProfileType === 'function') {
        await enrichUsersWithProfileType(members);
      }
      const hero = overlay.querySelector('[data-gi-hero]');
      const photo = chat.photoURL || (/^https:/.test(chat.avatar || '') ? chat.avatar : '');
      hero.innerHTML = `
        <button type="button" class="group-info-photo" data-gi-edit-photo ${canEditInfo(chat, uid) ? '' : 'disabled'}>
          ${photo ? `<img src="${esc(photo)}" alt="">` : `<span>${esc(chat.avatar || '👥')}</span>`}
        </button>
        <div class="group-info-name-row">
          <div class="group-info-name" data-gi-name>${esc(chat.name || 'Group')}</div>
          ${canEditInfo(chat, uid) ? `<button type="button" class="group-info-edit-name" data-gi-edit-name aria-label="Edit name">✎</button>` : ''}
        </div>
        ${chat.description ? `<div class="group-info-desc">${esc(chat.description)}</div>` : ''}`;

      // One-time admin notice: groups are discoverable by default.
      const noticeEl = overlay.querySelector('[data-gi-public-notice]');
      const noticeKey = `chaupaal_group_public_notice_${chatId}`;
      let noticeSeen = false;
      try {
        noticeSeen = localStorage.getItem(noticeKey) === '1' || !!chat.discoverableNoticeAck;
      } catch (e) {}
      if (admin && isGroupPublic(chat) && !noticeSeen) {
        noticeEl.hidden = false;
        noticeEl.innerHTML = `
          <div style="background:rgba(230,57,70,0.08);border:1px solid rgba(230,57,70,0.2);border-radius:12px;padding:12px 14px;font-size:13px;line-height:1.45;color:var(--ink);">
            <strong>Now discoverable in search</strong>
            <div style="margin-top:4px;color:var(--muted);">Baithak groups are public by default so people can find them in Chaupaal search. You can switch this group to Private anytime below.</div>
            <button type="button" data-gi-ack-notice style="margin-top:10px;border:none;background:var(--red);color:#fff;font-weight:700;font-size:12px;padding:8px 12px;border-radius:10px;cursor:pointer;">Got it</button>
          </div>`;
        noticeEl.querySelector('[data-gi-ack-notice]')?.addEventListener('click', async () => {
          try {
            localStorage.setItem(noticeKey, '1');
          } catch (e) {}
          try {
            await patchGroupDoc(chatId, { discoverableNoticeAck: true });
            chat.discoverableNoticeAck = true;
          } catch (e) {}
          noticeEl.hidden = true;
        });
      } else {
        noticeEl.hidden = true;
        noticeEl.innerHTML = '';
      }

      const privacyEl = overlay.querySelector('[data-gi-privacy]');
      if (admin) {
        privacyEl.hidden = false;
        const pubToggle = overlay.querySelector('[data-gi-public-toggle]');
        pubToggle.checked = isGroupPublic(chat);
        pubToggle.onchange = async () => {
          const next = !!pubToggle.checked;
          await updateGroupDetails(chat, { isPublic: next });
          chat.isPublic = next;
          if (typeof showToast === 'function') {
            showToast(next ? 'Group is public in search' : 'Group is private');
          }
          if (!next) {
            noticeEl.hidden = true;
          }
        };
      } else privacyEl.hidden = true;

      overlay.querySelector('[data-gi-count]').textContent = `(${members.length})`;
      const listEl = overlay.querySelector('[data-gi-members]');
      listEl.innerHTML = members
        .map((m) => {
          const isMe = m.uid === uid;
          const badge = m.role === 'admin' ? '<span class="group-info-admin-badge">Admin</span>' : '';
          const av = m.photoURL || m.avatar;
          return `<div class="group-info-member" data-member-uid="${esc(m.uid)}">
            <div class="group-info-member-av">${/^https:/.test(av) ? `<img src="${esc(av)}" alt="">` : esc(m.avatar || '👤')}</div>
            <div class="group-info-member-meta"><div class="group-info-member-name">${typeof formatDisplayNameHtml==='function'?formatDisplayNameHtml(m.name,m):esc(m.name)}${isMe ? ' (You)' : ''}</div>${badge}</div>
            ${admin && !isMe ? `<button type="button" class="group-info-member-menu" data-member-menu aria-label="Member options">⋯</button>` : ''}
          </div>`;
        })
        .join('');

      const addBtn = overlay.querySelector('[data-gi-add-member]');
      if (canAddMembers(chat, uid)) {
        addBtn.hidden = false;
      } else addBtn.hidden = true;

      const inv = chat.invite || {};
      const row = overlay.querySelector('[data-gi-invite-row]');
      if (admin && inv.token) {
        try {
          await db.collection('groupInvites').doc(inv.token).set(
            {
              chatId: chat.firestoreId || chat.id,
              mode: inv.mode === 'approval' ? 'approval' : 'instant',
              enabled: inv.enabled !== false,
              name: String(chat.name || 'Group').slice(0, 80),
              createdBy: chat.createdBy || uid,
              updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        } catch (e) {}
        const url = inviteUrl(inv.token);
        row.innerHTML = `
          <input class="group-info-invite-input" readonly value="${esc(url)}">
          <button type="button" class="group-info-copy" data-gi-copy>Copy</button>
          <button type="button" class="group-info-share" data-gi-share>Share</button>`;
        row.querySelector('[data-gi-copy]')?.addEventListener('click', () => {
          navigator.clipboard?.writeText(url);
          if (typeof showToast === 'function') showToast('Link copied');
        });
        row.querySelector('[data-gi-share]')?.addEventListener('click', () => {
          if (navigator.share) navigator.share({ title: chat.name, url });
          else {
            navigator.clipboard?.writeText(url);
            if (typeof showToast === 'function') showToast('Link copied');
          }
        });
        const modeEl = overlay.querySelector('[data-gi-invite-mode]');
        modeEl.hidden = false;
        const toggle = overlay.querySelector('[data-gi-approval-toggle]');
        toggle.checked = inv.mode === 'approval';
        toggle.onchange = async () => {
          const mode = toggle.checked ? 'approval' : 'instant';
          await patchGroupDoc(chat.firestoreId || chat.id, { invite: { ...inv, mode } });
          chat.invite = { ...inv, mode };
          if (inv.token) {
            try {
              await db.collection('groupInvites').doc(inv.token).set({ mode, enabled: inv.enabled !== false }, { merge: true });
            } catch (e) {}
          }
          if (typeof showToast === 'function') showToast(mode === 'approval' ? 'Join requests require approval' : 'Anyone with link can join');
        };
      } else {
        row.innerHTML = `<div class="group-info-muted">Invite link available to admins</div>`;
        overlay.querySelector('[data-gi-invite-mode]').hidden = true;
      }

      if (admin) loadJoinRequestsUI();

      const permsEl = overlay.querySelector('[data-gi-perms]');
      if (admin && chat.firestoreId) {
        permsEl.hidden = false;
        const addT = overlay.querySelector('[data-gi-perm-add]');
        const editT = overlay.querySelector('[data-gi-perm-edit]');
        addT.checked = chat.permissions?.addMembers === 'all';
        editT.checked = chat.permissions?.editInfo === 'all';
        addT.onchange = async () => {
          const permissions = { ...chat.permissions, addMembers: addT.checked ? 'all' : 'admin' };
          await patchGroupDoc(chat.firestoreId || chat.id, { permissions });
          chat.permissions = permissions;
        };
        editT.onchange = async () => {
          const permissions = { ...chat.permissions, editInfo: editT.checked ? 'all' : 'admin' };
          await patchGroupDoc(chat.firestoreId || chat.id, { permissions });
          chat.permissions = permissions;
        };
      } else permsEl.hidden = true;

      const isMember = !!(uid && (chat.participants || []).includes(uid));
      const leaveBtn = overlay.querySelector('[data-gi-leave]');
      const joinBtn = overlay.querySelector('[data-gi-join]');
      if (leaveBtn) leaveBtn.hidden = !isMember;
      if (joinBtn) {
        joinBtn.hidden = isMember || !isGroupPublic(chat);
        joinBtn.textContent = chat.invite?.mode === 'approval' ? 'Request to join' : 'Join group';
      }

      listEl.querySelectorAll('[data-member-menu]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const row = btn.closest('[data-member-uid]');
          const targetUid = row?.dataset?.memberUid;
          if (!targetUid) return;
          const m = members.find((x) => x.uid === targetUid);
          if (!m) return;
          showMemberActions(m);
        });
      });
    }

    async function loadJoinRequestsUI() {
      const chatId = chat.firestoreId || chat.id;
      const box = overlay.querySelector('[data-gi-requests]');
      const reqs = await loadJoinRequests(chatId);
      if (!reqs.length) {
        box.hidden = true;
        return;
      }
      box.hidden = false;
      box.innerHTML = `
        <div class="group-info-section-head">Join requests (${reqs.length})</div>
        ${reqs
          .map(
            (r) => `<div class="group-info-request" data-req-uid="${esc(r.uid)}">
          <div class="group-info-member-av">${esc(r.avatar || '👤')}</div>
          <div class="group-info-member-name">${typeof formatDisplayNameHtml==='function'?formatDisplayNameHtml(r.name || 'Member',r):esc(r.name || 'Member')}</div>
          <button type="button" class="group-info-accept" data-req-accept>Accept</button>
          <button type="button" class="group-info-reject" data-req-reject>Decline</button>
        </div>`
          )
          .join('')}`;
      box.querySelectorAll('[data-req-accept]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const uid = btn.closest('[data-req-uid]')?.dataset?.reqUid;
          const req = reqs.find((x) => x.uid === uid);
          if (!req) return;
          await resolveJoinRequest(chat, req, true);
          await refresh();
          if (typeof showToast === 'function') showToast('Member added');
        });
      });
      box.querySelectorAll('[data-req-reject]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const uid = btn.closest('[data-req-uid]')?.dataset?.reqUid;
          const req = reqs.find((x) => x.uid === uid);
          if (!req) return;
          await resolveJoinRequest(chat, req, false);
          await refresh();
        });
      });
    }

    function showMemberActions(member) {
      const sheet = document.createElement('div');
      sheet.className = 'cp-action-sheet group-info-member-sheet';
      sheet.dataset.navManaged = '1';
      const isAd = member.role === 'admin';
      sheet.innerHTML = `
        <div class="cp-sheet-panel">
          <div class="group-info-sheet-title">${typeof formatDisplayNameHtml==='function'?formatDisplayNameHtml(member.name,member):esc(member.name)}</div>
          <button type="button" data-act-promote>${isAd ? 'Remove admin' : 'Make admin'}</button>
          <button type="button" data-act-remove class="danger">Remove from group</button>
          <button type="button" data-act-cancel>Cancel</button>
        </div>`;
      device.appendChild(sheet);
      const done = () => {
        if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
        sheet.remove();
      };
      if (typeof pushNavLayer === 'function') pushNavLayer(sheet, done);
      sheet.querySelector('[data-act-cancel]')?.addEventListener('click', done);
      sheet.querySelector('[data-act-promote]')?.addEventListener('click', async () => {
        try {
          await setMemberAdmin(chat, member.uid, !isAd);
          await refresh();
          done();
        } catch (e) {
          if (typeof reportClientError === 'function') {
            reportClientError({ feature: 'group_promote', message: e?.message || String(e) });
          }
          if (typeof showToast === 'function') showToast('Couldn’t update admin');
        }
      });
      sheet.querySelector('[data-act-remove]')?.addEventListener('click', async () => {
        try {
          if ((chat.admins || []).length === 1 && chat.admins[0] === member.uid) {
            if (typeof showToast === 'function') showToast('Promote another admin first');
            return;
          }
          await removeMemberFromGroup(chat, member.uid);
          await refresh();
          done();
        } catch (e) {
          if (typeof reportClientError === 'function') {
            reportClientError({ feature: 'group_remove', message: e?.message || String(e) });
          }
          if (typeof showToast === 'function') showToast('Couldn’t remove member');
        }
      });
    }

    overlay.querySelector('[data-gi-add-member]')?.addEventListener('click', async () => {
      if (typeof openFriendPickerSheet !== 'function') {
        if (typeof showToast === 'function') showToast('Friend list not available');
        return;
      }
      const friend = await openFriendPickerSheet({ title: 'Add to group', subtitle: chat.name });
      if (!friend?.uid && !friend?.id) return;
      const ok = await addMemberToGroup(chat, friend);
      if (ok) {
        await refresh();
        if (typeof showToast === 'function') showToast(`${friend.name} added`);
      }
    });

    overlay.querySelector('[data-gi-leave]')?.addEventListener('click', async () => {
      const ok = await leaveGroupPersist(chat);
      if (ok) {
        close();
        if (typeof closeChatScreen === 'function') closeChatScreen({ updateHistory: true, animate: true });
        if (typeof showToast === 'function') showToast('Left group');
      }
    });

    overlay.querySelector('[data-gi-join]')?.addEventListener('click', async () => {
      const uid = currentUser?.uid;
      const chatId = chat.firestoreId || chat.id;
      if (!uid || !chatId || !db) {
        if (typeof showToast === 'function') showToast('Sign in to join');
        return;
      }
      if ((chat.participants || []).includes(uid)) return;
      try {
        if (chat.invite?.mode === 'approval') {
          await db.collection('chats').doc(chatId).collection('joinRequests').doc(uid).set({
            uid,
            name: userProfile?.name || currentUser.displayName || 'Member',
            avatar: userProfile?.avatar || '👤',
            photoURL: currentUser.photoURL || '',
            status: 'pending',
            requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
          });
          if (typeof showToast === 'function') showToast('Join request sent');
          return;
        }
        // Public instant join (participant self-add via invite token path when available)
        if (chat.invite?.token && typeof joinGroupByInviteToken === 'function') {
          const res = await joinGroupByInviteToken(chat.invite.token);
          if (res?.ok) {
            if (typeof showToast === 'function') showToast(res.pending ? 'Request sent' : 'Joined group');
            if (res.chat && !res.pending && typeof openChatScreen === 'function') {
              close();
              openChatScreen(res.chat);
              return;
            }
            await refresh();
            return;
          }
        }
        // Fallback: arrayUnion when public (rules: participant or public get; update needs invite self-join or metadata)
        await db.collection('chats').doc(chatId).update({
          participants: firebase.firestore.FieldValue.arrayUnion(uid),
          [`memberProfiles.${uid}`]: {
            name: userProfile?.name || currentUser.displayName || 'Member',
            avatar: userProfile?.avatar || '👤',
            photoURL: currentUser.photoURL || '',
            role: 'member',
            joinedAt: Date.now(),
          },
          memberCount: firebase.firestore.FieldValue.increment(1),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        if (typeof showToast === 'function') showToast('Joined group');
        await refresh();
        const live = await fetchGroupDoc(chatId);
        if (live && typeof openChatScreen === 'function') {
          close();
          openChatScreen(live);
        }
      } catch (e) {
        console.warn('[group] join public', e?.message || e);
        if (typeof showToast === 'function') showToast('Could not join — ask for an invite link');
      }
    });

    overlay.addEventListener('click', async (e) => {
      if (e.target.closest('[data-gi-edit-name]')) {
        const name =
          typeof promptNameSheet === 'function'
            ? await promptNameSheet({ title: 'Group name', defaultValue: chat.name, confirmLabel: 'Save' })
            : null;
        if (name) {
          await updateGroupDetails(chat, { name: String(name).trim() });
          chat.name = String(name).trim();
          await render();
        }
      }
      if (e.target.closest('[data-gi-edit-photo]') && canEditInfo(chat, currentUser?.uid)) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) return;
          if (typeof showToast === 'function') showToast('Uploading…');
          let photoURL = '';
          if (typeof uploadOptimizedImage === 'function' && (typeof isMediaUploadReady !== 'function' || (await isMediaUploadReady()))) {
            const up = await uploadOptimizedImage(file, { folder: 'group-avatars' });
            photoURL = up.media;
          } else {
            photoURL = URL.createObjectURL(file);
          }
          await updateGroupDetails(chat, { photoURL, avatar: photoURL });
          chat.photoURL = photoURL;
          await render();
        };
        input.click();
      }
    });

    refresh();
  }

  window.openGroupInfo = openGroupInfo;
  window.createGroupInFirestore = createGroupInFirestore;
  window.joinGroupByInviteToken = joinGroupByInviteToken;
  window.normalizeGroupChat = normalizeGroupChat;
  window.isGroupAdmin = isGroupAdmin;
  window.isGroupPublic = isGroupPublic;
})();
