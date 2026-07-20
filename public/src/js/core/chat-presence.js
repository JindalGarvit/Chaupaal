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

  function stopPresence() {
    activeChatId = null;
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

  function setTypingUi(on, name) {
    const el = document.getElementById('chatTypingStatus');
    if (!el) return;
    if (on && presenceEnabled()) {
      el.innerHTML =
        `<span class="chat-typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>` +
        `<span>${(name || 'Someone')} is typing</span>`;
      el.classList.remove('hidden');
    } else {
      el.textContent = '';
      el.classList.add('hidden');
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
      el.textContent = label === 'Seen' ? 'Seen · just now' : label;
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
          ref.set({ at: Date.now(), name: (typeof userProfile !== 'undefined' && userProfile?.name) || 'You' });
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
          ? { at: Date.now(), name: (typeof userProfile !== 'undefined' && userProfile?.name) || 'You' }
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

  function markChatRead(chatId) {
    if (!presenceEnabled() || !chatId) return;
    const uid = typeof currentUser !== 'undefined' && currentUser?.uid;
    if (!uid) return;
    const now = Date.now();
    try {
      if (typeof db !== 'undefined' && db) {
        const payload = {};
        payload['reads.' + uid] = now;
        db.collection('chats').doc(chatId).set(payload, { merge: true }).catch(() => {});
      }
    } catch (e) {}
    try {
      localStorage.setItem('chaupaal_read_' + chatId, String(now));
    } catch (e) {}
  }

  function listenPresence(chat, opts) {
    stopPresence();
    if (!chat || chat.type === 'group') return;
    if (typeof isSelfChat === 'function' && isSelfChat(chat)) return;
    if (!presenceEnabled()) return;

    activeChatId = chat.id;
    const chatId = chat.firestoreId || chat.id;
    const myUid = typeof currentUser !== 'undefined' && currentUser?.uid;
    const otherName = chat.name || 'Them';

    // Typing listener
    try {
      if (typeof rtdb !== 'undefined' && rtdb) {
        const ref = rtdb.ref('typing/' + chatId);
        const handler = (snap) => {
          const val = snap.val() || {};
          let someone = null;
          Object.keys(val).forEach((uid) => {
            if (uid === myUid) return;
            if (val[uid] && Date.now() - (val[uid].at || 0) < 4000) someone = val[uid].name || otherName;
          });
          setTypingUi(!!someone, someone || otherName);
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
            Object.keys(typing).forEach((uid) => {
              if (uid === myUid) return;
              const t = typing[uid];
              if (t && Date.now() - (t.at || 0) < 4000) someone = t.name || otherName;
            });
            setTypingUi(!!someone, someone || otherName);
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
            const myRead = reads[myUid];
            // Demo / local: if no peer, soft-show Seen shortly after send
            if (peerRead && Number(peerRead) > 0) {
              setSeenUi('Seen');
            }
          });
      }
    } catch (e) {}

    markChatRead(chatId);

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
    setTimeout(() => setSeenUi('Seen'), 1400);
  }

  window.chatPresenceEnabled = presenceEnabled;
  window.signalChatTyping = signalTyping;
  window.stopChatPresence = stopPresence;
  window.startChatPresence = listenPresence;
  window.markChatRead = markChatRead;
  window.demoMarkSeenSoon = demoMarkSeenSoon;
  window.publishChatTyping = publishTyping;
})();
