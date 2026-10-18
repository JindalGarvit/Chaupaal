/**
 * Baithak presence — typing indicators + read receipts (1:1).
 * Gated by notifPrefs.chatPresence (default on). Uses RTDB when available, else Firestore.
 */
(function () {
  'use strict';

  let typingUnsub = null;
  let readsUnsub = null;
  let typingTimer = null;
  let activeChatId = null;
  let demoTypingTimer = null;

  function presenceEsc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function presenceEnabled() {
    if (typeof isNotifEnabled === 'function') return isNotifEnabled('chatPresence');
    try {
      const raw = localStorage.getItem('chaupaal_notif_prefs');
      if (raw) {
        const p = JSON.parse(raw);
        if (p && p.chatPresence === false) return false;
      }
    } catch (e) {}
    return true;
  }

  function publishActiveChatId(chatIdOrNull) {
    try {
      if (typeof db === 'undefined' || !db) return;
      const uid = typeof currentUser !== 'undefined' && currentUser?.uid;
      if (!uid) return;
      const patch = {
        uid,
        activeChatId: chatIdOrNull ? String(chatIdOrNull).slice(0, 120) : firebase.firestore.FieldValue.delete(),
      };
      db.collection('user_status').doc(uid).set(patch, { merge: true }).catch(() => {});
    } catch (e) {}
  }

  function stopPresence() {
    activeChatId = null;
    publishActiveChatId(null);
    if (typingTimer) {
      clearTimeout(typingTimer);
      typingTimer = null;
    }
    if (demoTypingTimer) {
      clearTimeout(demoTypingTimer);
      demoTypingTimer = null;
    }
    if (typeof typingUnsub === 'function') {
      try {
        typingUnsub();
      } catch (e) {}
    }
    typingUnsub = null;
    if (typeof readsUnsub === 'function') {
      try {
        readsUnsub();
      } catch (e) {}
    }
    readsUnsub = null;
    setTypingUi(false);
    setSeenUi(null);
  }

  function setTypingUi(on, name, profileType) {
    const el = document.getElementById('chatTypingStatus');
    if (!el) return;
    if (on && presenceEnabled()) {
      if (profileType) el.dataset.typerProfileType = profileType;
      else delete el.dataset.typerProfileType;
      el.innerHTML =
        `<span class="chat-typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>` +
        `<span>${tHtml('chat.name_is_typing', { name: { html: '<bdi>' + (typeof formatDisplayNameHtml==='function'?formatDisplayNameHtml(name||t('common.someone'),{profileType:el.dataset.typerProfileType||profileType||'personal'}):presenceEsc(name||t('common.someone'))) + '</bdi>', text: name || t('common.someone') } })}</span>`;
      el.classList.remove('hidden');
    } else {
      el.textContent = '';
      el.classList.add('hidden');
      delete el.dataset.typerProfileType;
    }
  }

  function setSeenUi(label) {
    let el = document.getElementById('chatReadReceipt');
    const area = document.getElementById('chatMsgsArea');
    if (!area) return;
    if (!el) {
      el = document.createElement('div');
      el.id = 'chatReadReceipt';
      el.className = 'chat-read-receipt';
      area.appendChild(el);
    }
    if (label && presenceEnabled()) {
      el.textContent = label === 'Seen' ? t('chat.seen_just_now') : label;
      el.classList.remove('hidden');
      el.classList.add('chat-read-receipt--soft');
    } else {
      el.textContent = '';
      el.classList.add('hidden');
      el.classList.remove('chat-read-receipt--soft');
    }
    area.scrollTop = area.scrollHeight;
  }

  function publishTyping(chatId, isTyping) {
    if (!presenceEnabled() || !chatId) return;
    const uid = typeof currentUser !== 'undefined' && currentUser?.uid;
    if (!uid) return;
    try {
      if (typeof rtdb !== 'undefined' && rtdb) {
        const ref = rtdb.ref('typing/' + chatId + '/' + uid);
        if (isTyping) {
          ref.set({
            at: Date.now(),
            name: (typeof userProfile !== 'undefined' && userProfile?.name) || tEn('common.you'),
            profileType:
              typeof ownProfileType === 'function'
                ? ownProfileType()
                : typeof getProfileType === 'function'
                  ? getProfileType()
                  : 'personal',
          });
          ref.onDisconnect().remove();
        } else {
          ref.remove();
        }
        return;
      }
    } catch (e) {}
    try {
      if (typeof db !== 'undefined' && db) {
        const payload = {};
        payload['typing.' + uid] = isTyping
          ? {
              at: Date.now(),
              name: (typeof userProfile !== 'undefined' && userProfile?.name) || tEn('common.you'),
              profileType:
                typeof ownProfileType === 'function'
                  ? ownProfileType()
                  : typeof getProfileType === 'function'
                    ? getProfileType()
                    : 'personal',
            }
          : firebase.firestore.FieldValue.delete();
        db.collection('chats').doc(chatId).set(payload, { merge: true }).catch(() => {});
      }
    } catch (e) {}
  }

  function signalTyping(chatId) {
    if (!presenceEnabled() || !chatId) return;
    publishTyping(chatId, true);
    if (typingTimer) clearTimeout(typingTimer);
    typingTimer = setTimeout(() => publishTyping(chatId, false), 1800);
  }

  function clearChatUnreadBadge(chatId) {
    if (!chatId) return;
    try {
      if (typeof baithakChats !== 'undefined' && Array.isArray(baithakChats)) {
        baithakChats.forEach((c) => {
          if ((c.firestoreId || c.id) === chatId || c.id === chatId) c.unread = 0;
        });
      }
      if (typeof window.currentOpenChat !== 'undefined' && window.currentOpenChat) {
        const oc = window.currentOpenChat;
        if ((oc.firestoreId || oc.id) === chatId) oc.unread = 0;
      }
      document.querySelectorAll('.chat-item').forEach((item) => {
        if (item.dataset.chatId === chatId) item.querySelector('.chat-badge')?.remove();
      });
    } catch (e) {}
  }

  function markChatRead(chatId) {
    if (!chatId) return;
    // Always clear local badge UI — even when presence/RTDB is off or chat is self
    clearChatUnreadBadge(chatId);
    const uid = typeof currentUser !== 'undefined' && currentUser?.uid;
    if (!uid) return;
    const now = Date.now();
    try {
      localStorage.setItem('chaupaal_read_' + chatId, String(now));
    } catch (e) {}
    if (!presenceEnabled()) return;
    try {
      if (typeof db !== 'undefined' && db) {
        const payload = {};
        payload['reads.' + uid] = now;
        db.collection('chats').doc(chatId).set(payload, { merge: true }).catch(() => {});
      }
    } catch (e) {}
  }

  function listenPresence(chat, opts) {
    stopPresence();
    if (!chat || chat.type === 'group') return;
    if (typeof isSelfChat === 'function' && isSelfChat(chat)) return;

    activeChatId = chat.id;
    const chatId = chat.firestoreId || chat.id;
    // Always publish for DM notif skip — independent of typing/presence prefs
    publishActiveChatId(chatId);
    markChatRead(chatId);

    if (!presenceEnabled()) return;

    const myUid = typeof currentUser !== 'undefined' && currentUser?.uid;
    const otherName = chat.name || t('chat.them');

    // Typing listener
    try {
      if (typeof rtdb !== 'undefined' && rtdb) {
        const ref = rtdb.ref('typing/' + chatId);
        const handler = (snap) => {
          const val = snap.val() || {};
          let someone = null;
          let someoneType = null;
          Object.keys(val).forEach((uid) => {
            if (uid === myUid) return;
            if (val[uid] && Date.now() - (val[uid].at || 0) < 4000) {
              someone = val[uid].name || otherName;
              someoneType = val[uid].profileType || chat.profileType || null;
            }
          });
          setTypingUi(!!someone, someone || otherName, someoneType);
        };
        ref.on('value', handler);
        typingUnsub = () => ref.off('value', handler);
      } else if (typeof db !== 'undefined' && db && myUid) {
        typingUnsub = db
          .collection('chats')
          .doc(chatId)
          .onSnapshot((doc) => {
            const typing = (doc.data() && doc.data().typing) || {};
            let someone = null;
            let someoneType = null;
            Object.keys(typing).forEach((uid) => {
              if (uid === myUid) return;
              const t = typing[uid];
              if (t && Date.now() - (t.at || 0) < 4000) {
                someone = t.name || otherName;
                someoneType = t.profileType || chat.profileType || null;
              }
            });
            setTypingUi(!!someone, someone || otherName, someoneType);
          });
      }
    } catch (e) {}

    // Read receipts — show Seen when peer read after our last message
    try {
      if (typeof db !== 'undefined' && db && myUid) {
        readsUnsub = db
          .collection('chats')
          .doc(chatId)
          .onSnapshot((doc) => {
            const reads = (doc.data() && doc.data().reads) || {};
            const peerUid = Object.keys(reads).find((u) => u !== myUid);
            const peerRead = peerUid ? reads[peerUid] : null;
            if (peerRead && Number(peerRead) > 0) {
              setSeenUi(t('chat.status.seen'));
            }
          });
      }
    } catch (e) {}

    // Offline / sample chat demo: fake typing then Seen after local send simulation
    if ((!db || !currentUser) && opts && opts.demo !== false) {
      demoTypingTimer = setTimeout(() => {
        if (activeChatId !== chat.id) return;
        setTypingUi(true, otherName);
        setTimeout(() => {
          if (activeChatId !== chat.id) return;
          setTypingUi(false);
        }, 1600);
      }, 900);
    }
  }

  /** Call after sending a message in demo mode to show Seen. */
  function demoMarkSeenSoon() {
    if (!presenceEnabled()) return;
    if (db && currentUser) return;
    setTimeout(() => setSeenUi(t('chat.status.seen')), 1400);
  }

  window.chatPresenceEnabled = presenceEnabled;
  window.signalChatTyping = signalTyping;
  window.stopChatPresence = stopPresence;
  window.startChatPresence = listenPresence;
  window.markChatRead = markChatRead;
  window.clearChatUnreadBadge = clearChatUnreadBadge;
  window.demoMarkSeenSoon = demoMarkSeenSoon;
  window.publishChatTyping = publishTyping;

  /**
   * Header line for a user_status doc: Online · Last seen just now · Last seen {relative time}.
   * Relative time comes from the L1 formatter in the viewer's language.
   */
  function presenceLine(status, now) {
    const at = now || Date.now();
    if (!status) return { online: false, html: tHtml('chat.presence_offline') };
    if (status.online || status.state === 'online') return { online: true, html: tHtml('chat.presence_online') };
    const raw = status.lastSeen?.toDate?.() || (status.lastSeen ? new Date(status.lastSeen) : null) || (status.at ? new Date(status.at) : null);
    if (!raw || Number.isNaN(raw.getTime()) || raw.getTime() <= 0) return { online: false, html: tHtml('chat.presence_offline') };
    if (at - raw.getTime() < 60000) return { online: false, html: tHtml('chat.presence_last_seen_just_now') };
    const when =
      typeof formatRelativeTime === 'function'
        ? formatRelativeTime(raw.getTime(), at)
        : typeof formatDate === 'function'
          ? formatDate(raw, 'dayMonth')
          : '';
    return { online: false, html: tHtml('chat.presence_last_seen_when', { when }) };
  }

  window.ChatPresence = { presenceLine };
})();
