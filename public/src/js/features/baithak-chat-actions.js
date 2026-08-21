/**
 * Baithak chat list actions: pin/mute/hide/delete/clear + Hidden vault lock.
 */
(function () {
  'use strict';

  const PREFS_CACHE_PREFIX = 'chaupaal_baithak_prefs_v1_';
  const UNLOCKED_KEY_PREFIX = 'chaupaal_hidden_unlocked_';
  const PIN_LOCAL_KEY = 'chaupaal_hidden_pin_v1_';
  const WEBAUTHN_CRED_KEY = 'chaupaal_hidden_webauthn_v1_';
  const DELETE_EVERYONE_MS = 60 * 60 * 1000;
  const UNDO_MS = 5000;

  let prefsMap = {};
  let prefsLoaded = false;
  let pinReorderMode = false;
  let pendingDeleteTimers = new Map();

  function tt(key, fallback, vars) {
    if (typeof t === 'function') {
      const v = t(key, vars || {});
      if (v && v !== key) return v;
    }
    let s = fallback || key;
    Object.entries(vars || {}).forEach(([k, val]) => {
      s = String(s).replace(`{{${k}}}`, val);
    });
    return s;
  }

  function viewerUid() {
    return typeof currentUser !== 'undefined' && currentUser?.uid ? currentUser.uid : '';
  }

  function chatKey(chat) {
    return String((chat && (chat.firestoreId || chat.id)) || chat || '').trim();
  }

  function prefsCacheKey() {
    const uid = viewerUid();
    return uid ? PREFS_CACHE_PREFIX + uid : '';
  }

  function readPrefsCache() {
    const key = prefsCacheKey();
    if (!key) return {};
    try {
      const raw = localStorage.getItem(key);
      const obj = raw ? JSON.parse(raw) : {};
      return obj && typeof obj === 'object' ? obj : {};
    } catch (e) {
      return {};
    }
  }

  function writePrefsCache() {
    const key = prefsCacheKey();
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(prefsMap));
    } catch (e) {}
  }

  function getBaithakPref(chatId) {
    const id = chatKey(chatId);
    if (!id) return {};
    return prefsMap[id] || {};
  }

  function shouldSuppressChatNotif(chatId) {
    const p = getBaithakPref(chatId);
    return !!(p.hidden || p.muted);
  }

  async function setBaithakPref(chatId, patch) {
    const id = chatKey(chatId);
    const uid = viewerUid();
    if (!id || !uid) return getBaithakPref(id);
    const prev = { ...(prefsMap[id] || {}) };
    const next = {
      ...prev,
      ...patch,
      updatedAt: Date.now(),
    };
    prefsMap[id] = next;
    writePrefsCache();
    if (typeof db !== 'undefined' && db) {
      try {
        await db
          .collection('users')
          .doc(uid)
          .collection('baithak_prefs')
          .doc(id)
          .set(next, { merge: true });
      } catch (e) {
        console.warn('[baithak-prefs] write', e?.message || e);
      }
    }
    return next;
  }

  async function loadBaithakPrefs() {
    const uid = viewerUid();
    prefsMap = readPrefsCache();
    prefsLoaded = true;
    if (!uid || typeof db === 'undefined' || !db) return prefsMap;
    try {
      const snap = await db.collection('users').doc(uid).collection('baithak_prefs').get();
      const next = { ...prefsMap };
      snap.docs.forEach((d) => {
        next[d.id] = { ...(next[d.id] || {}), ...(d.data() || {}) };
      });
      prefsMap = next;
      writePrefsCache();
    } catch (e) {
      console.warn('[baithak-prefs] load', e?.message || e);
    }
    return prefsMap;
  }

  function maxPinOrder() {
    let max = -1;
    Object.values(prefsMap).forEach((p) => {
      if (p && p.pinned && Number.isFinite(Number(p.pinOrder))) {
        max = Math.max(max, Number(p.pinOrder));
      }
    });
    return max;
  }

  function applyBaithakListTransform(chats, { includeHidden = false } = {}) {
    const list = Array.isArray(chats) ? chats.slice() : [];
    const self = [];
    const cai = [];
    const pinned = [];
    const rest = [];
    list.forEach((c) => {
      if (!c) return;
      if (typeof isChaupaalChatRow === 'function' && isChaupaalChatRow(c)) {
        cai.push(c);
        return;
      }
      if (typeof isSelfChatRow === 'function' && isSelfChatRow(c)) {
        self.push(c);
        return;
      }
      const id = chatKey(c);
      const pref = getBaithakPref(id);
      if (pref.deletedAt) return;
      if (pref.hidden && !includeHidden) return;
      if (!pref.hidden && includeHidden) return;
      c._baithakPref = pref;
      c._forceUnread = !!pref.markUnread;
      if (pref.pinned && !includeHidden) pinned.push(c);
      else rest.push(c);
    });
    pinned.sort((a, b) => {
      const ao = Number(a._baithakPref?.pinOrder);
      const bo = Number(b._baithakPref?.pinOrder);
      return (Number.isFinite(ao) ? ao : 9999) - (Number.isFinite(bo) ? bo : 9999);
    });
    rest.sort((a, b) => {
      const ta = typeof chatRecencyMs === 'function' ? chatRecencyMs(a) : Number(a.ts) || 0;
      const tb = typeof chatRecencyMs === 'function' ? chatRecencyMs(b) : Number(b.ts) || 0;
      return tb - ta;
    });
    return [...cai, ...self, ...pinned, ...rest];
  }

  function refreshInbox() {
    if (typeof setBaithakSection === 'function') {
      setBaithakSection(typeof window.baithakSection === 'function' ? window.baithakSection() : 'sabha');
    } else if (typeof renderChatList === 'function' && typeof baithakChats !== 'undefined') {
      renderChatList(applyBaithakListTransform(baithakChats));
    }
  }

  function displayTitle(chat) {
    if (typeof resolveBaithakTitle === 'function') return resolveBaithakTitle(chat, viewerUid()) || chat?.name || 'Chat';
    if (typeof BaithakSearch !== 'undefined' && BaithakSearch.resolveChatDisplayName) {
      return BaithakSearch.resolveChatDisplayName(chat, chat?._realName || chat?.name) || chat?.name || 'Chat';
    }
    return chat?.name || 'Chat';
  }

  function peerOf(chat) {
    if (typeof peerUidOfChat === 'function') return peerUidOfChat(chat);
    return chat?.uid || chat?.peerUid || chat?.otherUid || '';
  }

  async function openBaithakChatActions(chat, opts) {
    const o = opts || {};
    const surface = o.surface === 'hidden' ? 'hidden' : 'inbox';
    if (!chat) return;
    if (typeof isSelfChatRow === 'function' && isSelfChatRow(chat)) return;
    if (typeof isChaupaalChatRow === 'function' && isChaupaalChatRow(chat)) return;
    if (!viewerUid()) {
      if (typeof requireSignIn === 'function') requireSignIn(tt('auth_sign_in_short', 'Sign in to continue'));
      return;
    }
    const id = chatKey(chat);
    const pref = getBaithakPref(id);
    const isGroup = chat.type === 'group';
    const title = displayTitle(chat);
    const actions = [];

    if (isGroup) {
      actions.push({
        label: tt('baithak_rename_for_you', 'Rename for you'),
        icon: 'pen',
        fn: () => {
          if (typeof openBaithakNicknameSheet === 'function') {
            openBaithakNicknameSheet({ chat, peerUid: null, title: tt('baithak_rename_for_you', 'Rename for you') });
          }
        },
      });
    } else {
      actions.push({
        label: tt('baithak_set_nickname', 'Set nickname'),
        icon: 'pen',
        fn: () => {
          if (typeof openBaithakNicknameSheet === 'function') {
            openBaithakNicknameSheet({
              chat,
              peerUid: peerOf(chat),
              title: tt('baithak_set_nickname', 'Set nickname'),
            });
          }
        },
      });
    }

    if (surface === 'inbox') {
      if (pref.pinned) {
        actions.push({
          label: tt('baithak_unpin', 'Unpin chat'),
          icon: 'pin-off',
          fn: async () => {
            await setBaithakPref(id, { pinned: false, pinOrder: null });
            refreshInbox();
          },
        });
        actions.push({
          label: tt('baithak_reorder_pins', 'Reorder pins'),
          icon: 'list',
          fn: () => enterPinReorderMode(),
        });
      } else {
        actions.push({
          label: tt('baithak_pin', 'Pin chat'),
          icon: 'pin',
          fn: async () => {
            await setBaithakPref(id, { pinned: true, pinOrder: maxPinOrder() + 1 });
            refreshInbox();
            if (typeof showToast === 'function') showToast(tt('baithak_pinned', 'Pinned'));
          },
        });
      }
    }

    actions.push({
      label: pref.muted ? tt('baithak_unmute', 'Unmute') : tt('baithak_mute', 'Mute'),
      icon: pref.muted ? 'bell' : 'bell-off',
      fn: async () => {
        await setBaithakPref(id, { muted: !pref.muted });
        refreshInbox();
        if (typeof showToast === 'function') {
          showToast(pref.muted ? tt('baithak_unmuted', 'Unmuted') : tt('baithak_muted', 'Muted'));
        }
      },
    });

    actions.push({
      label: tt('baithak_mark_unread', 'Mark as unread'),
      icon: 'mail',
      fn: async () => {
        await setBaithakPref(id, { markUnread: true });
        chat.unread = Math.max(1, Number(chat.unread) || 1);
        refreshInbox();
      },
    });

    if (isGroup) {
      actions.push({
        label: tt('baithak_group_info', 'Group info'),
        icon: 'users',
        fn: () => {
          if (typeof openGroupInfo === 'function') openGroupInfo(chat);
          else if (typeof showToast === 'function') showToast('Group info unavailable');
        },
      });
    } else {
      actions.push({
        label: tt('baithak_view_profile', 'View profile'),
        icon: 'user',
        fn: () => {
          const uid = peerOf(chat);
          const profile = {
            uid,
            name: chat.name,
            avatar: chat.avatar,
            photoURL: chat.photoURL,
            username: chat.username,
          };
          if (typeof openPublicProfile === 'function') openPublicProfile(profile, { uid, context: 'baithak' });
          else if (typeof openProfilePeek === 'function') openProfilePeek(profile);
        },
      });
    }

    if (surface === 'hidden') {
      actions.push({
        label: tt('baithak_unhide', 'Unhide chat'),
        icon: 'eye',
        fn: async () => {
          await setBaithakPref(id, { hidden: false, hiddenAt: null });
          document.getElementById('baithakHiddenVault')?.remove();
          refreshInbox();
          if (typeof showToast === 'function') showToast(tt('baithak_unhidden', 'Chat unhidden'));
        },
      });
    } else {
      actions.push({
        label: tt('baithak_hide', 'Hide chat'),
        icon: 'eye-off',
        fn: async () => {
          await setBaithakPref(id, { hidden: true, hiddenAt: Date.now() });
          refreshInbox();
          if (typeof showToast === 'function') showToast(tt('baithak_hidden_toast', 'Chat hidden'));
        },
      });
    }

    actions.push({
      label: tt('baithak_clear_chat', 'Clear chat'),
      icon: 'eraser',
      fn: () => confirmClearChat(chat),
    });

    if (isGroup) {
      actions.push({
        label: tt('baithak_leave_group', 'Leave group'),
        icon: 'log-out',
        danger: true,
        fn: () => {
          if (typeof leaveGroupPersist === 'function') leaveGroupPersist(chat);
          else if (typeof openGroupInfo === 'function') openGroupInfo(chat);
        },
      });
    } else {
      actions.push({
        label: tt('baithak_delete_chat', 'Delete chat'),
        icon: 'trash',
        danger: true,
        fn: () => deleteChatForMe(chat),
      });
    }

    if (typeof showActionSheet === 'function') {
      showActionSheet(title, actions);
    }
    if (typeof haptic === 'function') haptic('medium');
  }

  function confirmClearChat(chat) {
    const id = chatKey(chat);
    if (typeof showActionSheet !== 'function') return;
    showActionSheet(tt('baithak_clear_chat', 'Clear chat'), [
      {
        label: tt('baithak_clear_confirm', 'Clear all messages for you'),
        icon: 'eraser',
        danger: true,
        hint: tt('baithak_clear_hint', 'The chat stays in your list'),
        fn: async () => {
          const clearedBefore = Date.now();
          await setBaithakPref(id, { clearedBefore });
          if (typeof baithakMsgCache?.clearChat === 'function') baithakMsgCache.clearChat(id).catch(() => {});
          if (window.currentOpenChat && chatKey(window.currentOpenChat) === id) {
            const area = document.getElementById('chatMsgsArea');
            if (area) area.innerHTML = '';
          }
          chat.preview = tt('baithak_no_messages', 'No messages');
          refreshInbox();
          if (typeof showToast === 'function') showToast(tt('baithak_cleared', 'Chat cleared'));
        },
      },
    ]);
  }

  function deleteChatForMe(chat) {
    const id = chatKey(chat);
    const snapshot = { ...chat };
    const prefSnap = { ...getBaithakPref(id) };
    // Optimistic remove
    if (typeof baithakChats !== 'undefined' && Array.isArray(baithakChats)) {
      baithakChats = baithakChats.filter((c) => chatKey(c) !== id);
    }
    if (typeof forgetInboxChat === 'function') forgetInboxChat(id);
    refreshInbox();

    const undo = () => {
      const tmr = pendingDeleteTimers.get(id);
      if (tmr) clearTimeout(tmr);
      pendingDeleteTimers.delete(id);
      if (typeof baithakChats !== 'undefined' && Array.isArray(baithakChats)) {
        if (!baithakChats.some((c) => chatKey(c) === id)) baithakChats.unshift(snapshot);
      }
      prefsMap[id] = prefSnap;
      writePrefsCache();
      if (typeof rememberInboxChat === 'function') rememberInboxChat(snapshot);
      refreshInbox();
    };

    if (typeof showUndoToast === 'function') {
      showUndoToast(tt('baithak_chat_deleted', 'Chat deleted'), { onUndo: undo, duration: UNDO_MS });
    } else if (typeof showToast === 'function') {
      showToast(tt('baithak_chat_deleted', 'Chat deleted'));
    }

    const timer = setTimeout(async () => {
      pendingDeleteTimers.delete(id);
      await setBaithakPref(id, { deletedAt: Date.now(), hidden: false, pinned: false });
      if (typeof baithakMsgCache?.clearChat === 'function') baithakMsgCache.clearChat(id).catch(() => {});
    }, UNDO_MS);
    pendingDeleteTimers.set(id, timer);
  }

  // ─── Pin reorder ──────────────────────────────────────────────────────────
  function enterPinReorderMode() {
    pinReorderMode = true;
    document.getElementById('chatList')?.classList.add('baithak-pin-reorder');
    refreshInbox();
    wirePinReorderHandles();
    if (typeof showToast === 'function') showToast(tt('baithak_reorder_hint', 'Drag pins to reorder · tap Done'));
    ensureReorderDoneBar();
  }

  function exitPinReorderMode() {
    pinReorderMode = false;
    document.getElementById('chatList')?.classList.remove('baithak-pin-reorder');
    document.getElementById('baithakPinReorderBar')?.remove();
    refreshInbox();
  }

  function ensureReorderDoneBar() {
    document.getElementById('baithakPinReorderBar')?.remove();
    const bar = document.createElement('div');
    bar.id = 'baithakPinReorderBar';
    bar.className = 'baithak-pin-reorder-bar';
    bar.innerHTML = `<span>${tt('baithak_reorder_pins', 'Reorder pins')}</span><button type="button" data-done>${tt('done', 'Done')}</button>`;
    (document.querySelector('.device') || document.body).appendChild(bar);
    bar.querySelector('[data-done]')?.addEventListener('click', exitPinReorderMode);
  }

  function wirePinReorderHandles() {
    const list = document.getElementById('chatList');
    if (!list || !pinReorderMode) return;
    list.querySelectorAll('.chat-item[data-user-pinned="1"]').forEach((row) => {
      const handle = row.querySelector('.chat-pin-handle');
      if (!handle || handle.dataset.wired) return;
      handle.dataset.wired = '1';
      let startY = 0;
      let dragging = false;
      handle.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragging = true;
        startY = e.clientY;
        row.classList.add('is-dragging');
        handle.setPointerCapture?.(e.pointerId);
      });
      handle.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const dy = e.clientY - startY;
        row.style.transform = `translateY(${dy}px)`;
        const siblings = [...list.querySelectorAll('.chat-item[data-user-pinned="1"]')];
        const idx = siblings.indexOf(row);
        if (dy < -28 && idx > 0) {
          list.insertBefore(row, siblings[idx - 1]);
          startY = e.clientY;
          row.style.transform = '';
          if (typeof haptic === 'function') haptic('light');
        } else if (dy > 28 && idx < siblings.length - 1) {
          list.insertBefore(siblings[idx + 1], row);
          startY = e.clientY;
          row.style.transform = '';
          if (typeof haptic === 'function') haptic('light');
        }
      });
      const end = async () => {
        if (!dragging) return;
        dragging = false;
        row.classList.remove('is-dragging');
        row.style.transform = '';
        const order = [...list.querySelectorAll('.chat-item[data-user-pinned="1"]')].map((el) => el.dataset.chatId);
        for (let i = 0; i < order.length; i++) {
          await setBaithakPref(order[i], { pinned: true, pinOrder: i });
        }
      };
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', end);
    });
  }

  // ─── Hidden vault ─────────────────────────────────────────────────────────
  function isHiddenUnlocked() {
    const uid = viewerUid();
    if (!uid) return false;
    try {
      return sessionStorage.getItem(UNLOCKED_KEY_PREFIX + uid) === '1';
    } catch (e) {
      return false;
    }
  }

  function setHiddenUnlocked(on) {
    const uid = viewerUid();
    if (!uid) return;
    try {
      if (on) sessionStorage.setItem(UNLOCKED_KEY_PREFIX + uid, '1');
      else sessionStorage.removeItem(UNLOCKED_KEY_PREFIX + uid);
    } catch (e) {}
  }

  async function sha256Hex(str) {
    const data = new TextEncoder().encode(String(str));
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function pinStorageKey() {
    const uid = viewerUid();
    return uid ? PIN_LOCAL_KEY + uid : '';
  }

  function webauthnKey() {
    const uid = viewerUid();
    return uid ? WEBAUTHN_CRED_KEY + uid : '';
  }

  async function hasVaultSetup() {
    const key = pinStorageKey();
    try {
      if (key && localStorage.getItem(key)) return true;
      if (webauthnKey() && localStorage.getItem(webauthnKey())) return true;
    } catch (e) {}
    return false;
  }

  async function setupVaultPin(pin) {
    const hash = await sha256Hex(pin + ':' + viewerUid());
    try {
      localStorage.setItem(pinStorageKey(), hash);
    } catch (e) {}
    if (typeof db !== 'undefined' && db && viewerUid()) {
      try {
        await db.collection('users').doc(viewerUid()).collection('security').doc('hidden_vault').set(
          { pinHash: hash, updatedAt: Date.now() },
          { merge: true }
        );
      } catch (e) {}
    }
  }

  async function verifyVaultPin(pin) {
    const hash = await sha256Hex(pin + ':' + viewerUid());
    let stored = '';
    try {
      stored = localStorage.getItem(pinStorageKey()) || '';
    } catch (e) {}
    if (!stored && typeof db !== 'undefined' && db && viewerUid()) {
      try {
        const snap = await db.collection('users').doc(viewerUid()).collection('security').doc('hidden_vault').get();
        stored = snap.data()?.pinHash || '';
        if (stored) localStorage.setItem(pinStorageKey(), stored);
      } catch (e) {}
    }
    return !!stored && stored === hash;
  }

  async function tryWebAuthnUnlock() {
    if (!window.PublicKeyCredential || !navigator.credentials?.get) return false;
    let credIdB64 = '';
    try {
      credIdB64 = localStorage.getItem(webauthnKey()) || '';
    } catch (e) {}
    if (!credIdB64) return false;
    try {
      const rawId = Uint8Array.from(atob(credIdB64), (c) => c.charCodeAt(0));
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          timeout: 60000,
          userVerification: 'required',
          allowCredentials: [{ type: 'public-key', id: rawId }],
        },
      });
      return !!assertion;
    } catch (e) {
      return false;
    }
  }

  async function registerWebAuthn() {
    if (!window.PublicKeyCredential || !navigator.credentials?.create) return false;
    const uid = viewerUid();
    if (!uid) return false;
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const userId = new TextEncoder().encode(uid.slice(0, 16));
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: 'Chaupaal', id: location.hostname },
          user: { id: userId, name: uid, displayName: 'Hidden chats' },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
          ],
          authenticatorSelection: { userVerification: 'required', residentKey: 'preferred' },
          timeout: 60000,
        },
      });
      if (!cred) return false;
      const raw = new Uint8Array(cred.rawId);
      const b64 = btoa(String.fromCharCode(...raw));
      localStorage.setItem(webauthnKey(), b64);
      if (typeof db !== 'undefined' && db) {
        await db.collection('users').doc(uid).collection('security').doc('hidden_vault').set(
          { webauthnCredId: b64, updatedAt: Date.now() },
          { merge: true }
        );
      }
      if (typeof AuthProfiles?.setBiometricPref === 'function') AuthProfiles.setBiometricPref(true);
      return true;
    } catch (e) {
      console.warn('[hidden-vault] webauthn register', e?.message || e);
      return false;
    }
  }

  function openBaithakHiddenVault() {
    if (!viewerUid()) {
      if (typeof requireSignIn === 'function') requireSignIn(tt('auth_sign_in_short', 'Sign in to continue'));
      return;
    }
    document.getElementById('baithakHiddenVault')?.remove();
    const host = document.createElement('div');
    host.id = 'baithakHiddenVault';
    host.className = 'baithak-hidden-vault';
    host.dataset.navManaged = '1';
    const device = document.querySelector('.device') || document.body;
    device.appendChild(host);

    const close = () => {
      if (typeof removeNavLayer === 'function') removeNavLayer(host);
      host.remove();
    };
    if (typeof openLayer === 'function') openLayer(host, close, { role: 'dialog', label: tt('shortcut_baithak_hidden', 'Hidden chats') });

    const paintList = () => {
      const hidden = applyBaithakListTransform(
        typeof baithakChats !== 'undefined' ? baithakChats : [],
        { includeHidden: true }
      ).filter((c) => !isSelfChatRow?.(c) && !isChaupaalChatRow?.(c));
      host.innerHTML = `
        <div class="baithak-hidden-header">
          ${typeof backButtonHtml === 'function' ? backButtonHtml({ attrs: 'data-hidden-back' }) : '<button type="button" data-hidden-back class="cp-back-btn" aria-label="Back">←</button>'}
          <div class="baithak-hidden-title">${tt('shortcut_baithak_hidden', 'Hidden chats')}</div>
          <button type="button" class="baithak-hidden-lock-btn" data-relock aria-label="${tt('baithak_lock', 'Lock')}">${typeof iconHtml === 'function' ? iconHtml('lock', { size: 18 }) : '🔒'}</button>
        </div>
        <div class="baithak-hidden-list" id="baithakHiddenList"></div>`;
      host.querySelector('[data-hidden-back]')?.addEventListener('click', close);
      host.querySelector('[data-relock]')?.addEventListener('click', () => {
        setHiddenUnlocked(false);
        paintLock();
      });
      const list = host.querySelector('#baithakHiddenList');
      if (!hidden.length) {
        list.innerHTML = `<div class="baithak-hidden-empty">${tt('baithak_hidden_empty', 'No hidden chats — Hide from any chat’s long-press menu')}</div>`;
        return;
      }
      hidden.forEach((chat) => {
        const row = document.createElement('div');
        row.className = 'chat-item';
        row.innerHTML = `
          <div class="chat-avatar">${typeof chatAvatarMarkup === 'function' ? chatAvatarMarkup(chat) : chat.avatar || '👤'}</div>
          <div class="chat-info">
            <div class="chat-name">${displayTitle(chat)}</div>
            <div class="chat-preview">${chat.preview || ''}</div>
          </div>`;
        row.addEventListener('click', () => {
          close();
          if (typeof openChatScreen === 'function') openChatScreen(chat);
        });
        if (typeof onLongPress === 'function') {
          onLongPress(row, () => openBaithakChatActions(chat, { surface: 'hidden' }), { delayMs: 520 });
        }
        list.appendChild(row);
      });
    };

    const paintLock = async () => {
      const setup = await hasVaultSetup();
      const bio =
        typeof AuthProfiles !== 'undefined' && AuthProfiles.biometricStatus
          ? AuthProfiles.biometricStatus()
          : { supported: !!window.PublicKeyCredential };
      host.innerHTML = `
        <div class="baithak-hidden-lock">
          <button type="button" class="baithak-hidden-lock-close" data-hidden-back aria-label="Back">✕</button>
          <div class="baithak-hidden-lock-mark">${typeof iconHtml === 'function' ? iconHtml('lock', { size: 36 }) : '🔒'}</div>
          <h2>${tt('shortcut_baithak_hidden', 'Hidden chats')}</h2>
          <p>${tt('baithak_hidden_sub', 'Unlock with device biometrics or your Chaupaal PIN')}</p>
          ${
            bio.supported
              ? `<button type="button" class="btn btn--primary btn--block" data-bio>${tt('baithak_unlock_bio', 'Unlock with device')}</button>`
              : ''
          }
          <div class="baithak-hidden-pin-pad">
            <input type="password" inputmode="numeric" maxlength="6" pattern="[0-9]*" placeholder="${tt('baithak_pin_ph', 'Chaupaal PIN')}" data-pin autocomplete="one-time-code">
            <button type="button" class="btn btn--primary" data-pin-go>${setup ? tt('baithak_unlock', 'Unlock') : tt('baithak_set_pin', 'Set PIN')}</button>
          </div>
          ${bio.supported && !setup ? `<button type="button" class="btn btn--block" data-setup-bio style="margin-top:8px;background:var(--cream);border:1.5px solid var(--line);">${tt('baithak_enable_bio', 'Enable biometrics')}</button>` : ''}
          <div class="baithak-hidden-lock-err" data-err hidden></div>
        </div>`;
      host.querySelector('[data-hidden-back]')?.addEventListener('click', close);
      const errEl = host.querySelector('[data-err]');
      const showErr = (msg) => {
        if (!errEl) return;
        errEl.hidden = false;
        errEl.textContent = msg;
        host.querySelector('.baithak-hidden-lock')?.classList.add('is-shake');
        setTimeout(() => host.querySelector('.baithak-hidden-lock')?.classList.remove('is-shake'), 420);
      };
      host.querySelector('[data-bio]')?.addEventListener('click', async () => {
        const ok = await tryWebAuthnUnlock();
        if (ok) {
          setHiddenUnlocked(true);
          paintList();
        } else showErr(tt('baithak_unlock_fail', 'Couldn’t unlock — try your PIN'));
      });
      host.querySelector('[data-setup-bio]')?.addEventListener('click', async () => {
        const ok = await registerWebAuthn();
        if (ok) {
          if (typeof showToast === 'function') showToast(tt('baithak_bio_ready', 'Biometrics enabled'));
        } else showErr(tt('baithak_bio_fail', 'Biometrics unavailable on this device'));
      });
      host.querySelector('[data-pin-go]')?.addEventListener('click', async () => {
        const pin = host.querySelector('[data-pin]')?.value || '';
        if (pin.length < 4) {
          showErr(tt('baithak_pin_short', 'PIN must be at least 4 digits'));
          return;
        }
        if (!(await hasVaultSetup())) {
          await setupVaultPin(pin);
          setHiddenUnlocked(true);
          paintList();
          return;
        }
        if (await verifyVaultPin(pin)) {
          setHiddenUnlocked(true);
          paintList();
        } else showErr(tt('baithak_pin_wrong', 'Wrong PIN'));
      });
    };

    if (isHiddenUnlocked()) paintList();
    else paintLock();
  }

  // Message tombstone helpers (used by touch.js)
  function messageDeletedForMe(m) {
    const uid = viewerUid();
    if (!m || !uid) return false;
    if (m.deletedForEveryone) return false;
    const map = m.deletedFor;
    if (map && typeof map === 'object') return !!map[uid];
    return false;
  }

  function messageVisibleToViewer(m) {
    if (!m) return false;
    if (messageDeletedForMe(m)) return false;
    return true;
  }

  window.BaithakChatActions = {
    loadBaithakPrefs,
    getBaithakPref,
    setBaithakPref,
    shouldSuppressChatNotif,
    applyBaithakListTransform,
    openBaithakChatActions,
    openBaithakHiddenVault,
    isPinReorderMode: () => pinReorderMode,
    exitPinReorderMode,
    enterPinReorderMode,
    wirePinReorderHandles,
    messageDeletedForMe,
    messageVisibleToViewer,
    DELETE_EVERYONE_MS,
  };
  window.openBaithakChatActions = openBaithakChatActions;
  window.openBaithakHiddenVault = openBaithakHiddenVault;
  window.shouldSuppressChatNotif = shouldSuppressChatNotif;
  window.getBaithakPref = getBaithakPref;
  window.loadBaithakPrefs = loadBaithakPrefs;
  window.applyBaithakListTransform = applyBaithakListTransform;
})();
