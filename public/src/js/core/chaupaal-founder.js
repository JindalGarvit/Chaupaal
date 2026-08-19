/**
 * Founder bundle: shared first hello, interest overlap, conversation repair,
 * Goodnight journal engagement hook.
 */
(function () {
  const FIRST_HELLO_PROMPTS = [
    'If we only had one chai together, what would you want to talk about?',
    "What's a small joy from this week you wouldn't mind sharing?",
    'Tea stall or coffee shop — and what are you ordering?',
    "What's something you're curious about lately?",
    'If Chaupaal had a rainy-day playlist, what song belongs on it?',
  ];

  function pickSharedHello() {
    return FIRST_HELLO_PROMPTS[Math.floor(Math.random() * FIRST_HELLO_PROMPTS.length)];
  }

  function normalizeInterest(x) {
    return String(x || '')
      .trim()
      .toLowerCase();
  }

  function getMyInterests() {
    const dp = typeof digitalProfile !== 'undefined' ? digitalProfile : null;
    const up = typeof userProfile !== 'undefined' ? userProfile : null;
    const list = dp?.interests || up?.interests || dp?.profile?.interests || [];
    return (Array.isArray(list) ? list : []).map(normalizeInterest).filter(Boolean);
  }

  function interestOverlapReason(theirUser) {
    const mine = new Set(getMyInterests());
    const theirs = [
      ...(theirUser?.interests || []),
      ...(theirUser?.topCat ? [theirUser.topCat] : []),
    ].map(normalizeInterest);
    const shared = [...new Set(theirs.filter((i) => mine.has(i)))];
    if (!shared.length) return null;
    const label = shared[0].replace(/\b\w/g, (c) => c.toUpperCase());
    if (shared.length === 1) return `You both like ${label}`;
    return `Shared interests: ${shared
      .slice(0, 2)
      .map((s) => s.replace(/\b\w/g, (c) => c.toUpperCase()))
      .join(' · ')}`;
  }

  const ensuredDmIds = new Set();

  function dmChatIdFor(peerUid) {
    const me = typeof currentUser !== 'undefined' ? currentUser?.uid : '';
    const peer = String(peerUid || '').trim();
    if (!me || !peer || me === peer) return '';
    return [me, peer].sort().join('_');
  }

  function ownMemberSlice() {
    const me = typeof currentUser !== 'undefined' ? currentUser : null;
    const up = typeof userProfile !== 'undefined' ? userProfile : {};
    const dp = typeof digitalProfile !== 'undefined' ? digitalProfile : {};
    return {
      name: up.name || dp.displayName || me?.displayName || 'You',
      username: up.username || dp.username || '',
      photoURL: up.photoURL || me?.photoURL || '',
      profileType: up.profileType || dp.profileType || 'personal',
    };
  }

  function peerMemberSlice(peerUid, extra) {
    const x = extra && typeof extra === 'object' ? extra : {};
    return {
      name: x.peerName || x.displayName || (x.sharedFirstHello ? '' : x.name) || (x.username ? `@${x.username}` : 'Someone'),
      username: x.username || '',
      photoURL: x.photoURL || x.avatar || '',
      profileType: x.profileType || x.peerProfileType || 'personal',
    };
  }

  function dmMemberProfiles(peerUid, peerExtra) {
    const me = typeof currentUser !== 'undefined' ? currentUser?.uid : '';
    const peer = String(peerUid || '').trim();
    if (!me || !peer) return {};
    return {
      [me]: ownMemberSlice(),
      [peer]: peerMemberSlice(peer, peerExtra),
    };
  }

  function friendlyDmError(err) {
    const code = String(err?.code || '');
    if (code === 'CHAT_BOOTSTRAP_FAILED') return 'Could not open chat — try again';
    if (code === 'CHAT_NOT_READY' || code === 'permission-denied') return 'Chat not ready — wait a moment and retry';
    return err?.message || 'Could not open chat';
  }

  async function verifyDmChatDoc(chatId, peerUid) {
    const ref = db.collection('chats').doc(chatId);
    const snap = await ref.get();
    if (!snap.exists) {
      throw Object.assign(new Error('Chat could not be created'), { code: 'CHAT_BOOTSTRAP_FAILED' });
    }
    const data = snap.data() || {};
    const parts = Array.isArray(data.participants) ? data.participants.map(String) : [];
    const me = currentUser.uid;
    const peer = String(peerUid || '').trim();
    if (!parts.includes(me) || !parts.includes(peer)) {
      throw Object.assign(new Error('Chat participants not ready'), { code: 'CHAT_BOOTSTRAP_FAILED' });
    }
    return data;
  }

  /** Persist a 1:1 chat so both people can send (rules require the chat doc). */
  async function ensurePeerDmChat(peerUid, extras) {
    const chatId = dmChatIdFor(peerUid);
    if (!chatId) throw new Error('Could not open chat');
    if (typeof db === 'undefined' || !db || !currentUser) throw new Error('Not signed in');
    const peer = String(peerUid || '').trim();
    if (ensuredDmIds.has(chatId) && !extras) {
      await verifyDmChatDoc(chatId, peer);
      return chatId;
    }
    const profiles = dmMemberProfiles(peer, extras);
    const sorted = [currentUser.uid, peer].sort();
    const payload = {
      participants: sorted,
      type: 'dm',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: currentUser.uid,
      openedBy: currentUser.uid,
      lastMessageAt: Date.now(),
      memberProfiles: profiles,
      ...(extras && typeof extras === 'object' ? extras : {}),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    const ref = db.collection('chats').doc(chatId);
    let exists = false;
    let existingData = null;
    try {
      const snap = await ref.get();
      exists = !!(snap && snap.exists);
      existingData = exists ? snap.data() || {} : null;
    } catch (e) {
      exists = false;
    }
    if (!exists) {
      try {
        await ref.set(payload);
      } catch (e) {
        const code = String(e?.code || '');
        const already = code === 'already-exists' || /already.?exist/i.test(String(e?.message || ''));
        if (!already) {
          if (typeof reportClientError === 'function') {
            reportClientError({ feature: 'ensure_dm', message: e?.message || String(e) });
          }
          throw e;
        }
      }
    } else {
      const patch = { memberProfiles: profiles, participants: sorted };
      const parts = Array.isArray(existingData?.participants)
        ? existingData.participants.slice()
        : Array.isArray(existingData?.members)
          ? existingData.members.slice()
          : Array.isArray(existingData?.participantIds)
            ? existingData.participantIds.slice()
            : [];
      if (!parts.length || !parts.includes(currentUser.uid) || !parts.includes(peer)) {
        patch.participants = sorted;
      }
      const allow = [
        'sharedFirstHello',
        'preview',
        'firstMessageAt',
        'lastMessageAt',
        'discoveryOrigin',
        'peerProfileType',
        'origin',
        'photoURL',
        'matchMeta',
        'openedBy',
        'createdBy',
        'updatedAt',
      ];
      if (extras && typeof extras === 'object') {
        allow.forEach((k) => {
          if (extras[k] != null) patch[k] = extras[k];
        });
      }
      if (existingData && existingData.updatedAt == null) {
        patch.updatedAt =
          existingData.lastMessageAt ||
          existingData.createdAt ||
          firebase.firestore.FieldValue.serverTimestamp();
      }
      await ref.set(patch, { merge: true });
    }
    await verifyDmChatDoc(chatId, peer);
    ensuredDmIds.add(chatId);
    return chatId;
  }

  /**
   * Canonical DM bootstrap — verifies Firestore chat doc before returning.
   */
  async function bootstrapDmChat({
    uid,
    name,
    username,
    photoURL,
    avatar,
    origin,
    peerProfileType,
    profileType,
    matchMeta,
    starterText,
  } = {}) {
    const peerUid = String(uid || '').trim();
    if (!peerUid) throw Object.assign(new Error('Invalid user'), { code: 'CHAT_BOOTSTRAP_FAILED' });
    if (typeof db === 'undefined' || !db || !currentUser) throw new Error('Not signed in');

    if (typeof assertCanMessage === 'function') {
      const ok = await assertCanMessage({
        uid: peerUid,
        name,
        teenMode: matchMeta?.teenMode,
        isMinor: matchMeta?.isMinor,
        age: matchMeta?.age,
        profileType: peerProfileType || profileType,
      });
      if (!ok) return null;
    }

    const chatId = dmChatIdFor(peerUid);
    if (!chatId) throw Object.assign(new Error('Could not open chat'), { code: 'CHAT_BOOTSTRAP_FAILED' });

    const peerType = peerProfileType || profileType || 'personal';
    const extras = {
      peerName: name,
      photoURL: String(photoURL || avatar || '').startsWith('http') ? photoURL || avatar : '',
      peerProfileType: peerType,
      ...(origin ? { origin, discoveryOrigin: origin === 'ai_discovery' ? 'ai_discovery' : origin } : {}),
      ...(matchMeta && typeof matchMeta === 'object' ? { matchMeta } : {}),
    };

    await ensurePeerDmChat(peerUid, extras);

    const displayName =
      name ||
      (username ? `@${username}` : '') ||
      (typeof resolvePersonDisplayName === 'function'
        ? resolvePersonDisplayName({ name, username })
        : 'Someone');

    const chat = {
      id: chatId,
      firestoreId: chatId,
      uid: peerUid,
      peerUid,
      type: 'dm',
      name: displayName,
      username: username || '',
      avatar: avatar || photoURL || '👤',
      photoURL: photoURL || '',
      preview: starterText ? String(starterText).slice(0, 80) : '',
      time: 'now',
      unread: 0,
      duelStreak: 0,
      participants: [currentUser.uid, peerUid].sort(),
      profileType: peerType,
      peerProfileType: peerType,
      origin: origin || null,
      discoveryOrigin: origin === 'ai_discovery' ? 'ai_discovery' : origin || null,
      matchMeta: matchMeta || null,
      openedBy: currentUser.uid,
    };

    return chat;
  }

  function addChatToInboxCache(chat) {
    if (!chat) return;
    if (typeof rememberInboxChat === 'function') rememberInboxChat(chat);
    if (typeof baithakChats !== 'undefined' && Array.isArray(baithakChats)) {
      const id = chat.firestoreId || chat.id;
      const i = baithakChats.findIndex((c) => (c.firestoreId || c.id) === id);
      if (i >= 0) baithakChats[i] = { ...baithakChats[i], ...chat };
      else baithakChats.unshift(chat);
    }
  }

  function openBaithakTabIfNeeded() {
    const baithakBtn = document.querySelector('.bottom-tabs .tab-btn[data-tab="baithak"]');
    if (baithakBtn && !baithakBtn.classList.contains('active')) baithakBtn.click();
  }

  async function openDmWithSharedHello({
    uid,
    name,
    avatar,
    theirIcebreakers,
    starterText,
    origin,
    peerProfileType,
    matchMeta,
    username,
    photoURL,
  }) {
    const hello = pickSharedHello();
    let chat;
    try {
      chat = await bootstrapDmChat({
        uid,
        name,
        username,
        photoURL: photoURL || (String(avatar || '').startsWith('http') ? avatar : ''),
        avatar,
        origin,
        peerProfileType,
        matchMeta,
        starterText,
      });
    } catch (e) {
      if (typeof reportClientError === 'function') {
        reportClientError({ feature: 'open_dm', message: e?.message || String(e) });
      }
      if (typeof showToast === 'function') showToast(friendlyDmError(e));
      return null;
    }
    if (!chat) return null;

    chat.theirIcebreakers = theirIcebreakers || [];
    chat.icebreakers = theirIcebreakers || [];
    chat.sharedFirstHello = hello;
    chat.preview = 'Say hi — shared starter waiting';

    if (db && currentUser && uid) {
      const extras = {
        sharedFirstHello: hello,
        preview: hello,
        firstMessageAt: Date.now(),
      };
      try {
        await ensurePeerDmChat(uid, extras);
        const ref = db.collection('chats').doc(chat.firestoreId);
        try {
          await ref.collection('messages').add({
            text: `Shared starter for both of you:\n"${hello}"`,
            uid: currentUser.uid,
            name: 'Chaupaal',
            avatar: '🏠',
            systemCard: true,
            kind: 'shared_first_hello',
            ts: firebase.firestore.FieldValue.serverTimestamp(),
          });
        } catch (e) {
          if (typeof reportClientError === 'function') {
            reportClientError({ feature: 'shared_hello_msg', message: e?.message || String(e) });
          }
        }
      } catch (e) {
        if (typeof reportClientError === 'function') {
          reportClientError({ feature: 'open_dm', message: e?.message || String(e) });
        }
        if (typeof showToast === 'function') showToast(friendlyDmError(e));
        return null;
      }
    }

    addChatToInboxCache(chat);

    if (typeof SAMPLE_MESSAGES !== 'undefined') {
      SAMPLE_MESSAGES[chat.firestoreId] = SAMPLE_MESSAGES[chat.firestoreId] || [
        {
          from: 'them',
          text: `🏠 Shared starter for both of you:\n"${hello}"`,
          time: 'now',
          avatar: '🏠',
        },
      ];
    }

    if (typeof openChatScreen === 'function') openChatScreen(chat);
    openBaithakTabIfNeeded();
    if (starterText) {
      setTimeout(() => {
        const msgInput = document.getElementById('chatMsgInput');
        if (msgInput && !msgInput.value) msgInput.value = starterText;
      }, 300);
    }
    if (typeof loadBaithakChatsPage === 'function') {
      loadBaithakChatsPage({ reset: false }).catch(() => {});
    }

    return chat;
  }

  function mountConversationRepairChips(screen, chat) {
    if (!screen || !chat || chat.type === 'group') return;
    if (typeof isSelfChat === 'function' && isSelfChat(chat)) return;
    if (typeof isChaupaalChat === 'function' && isChaupaalChat(chat)) return;

    const area = screen.querySelector('#chatMsgsArea');
    const input = screen.querySelector('#chatMsgInput');
    if (!area || !input) return;

    const declined = !!(chat.gameInviteDeclined || chat.lastGameDeclinedAt);
    let gap = false;
    try {
      const last = chat.lastOtherMessageAt || chat.lastMessageAt;
      if (last) {
        const t = last.toDate ? last.toDate() : new Date(last);
        gap = Date.now() - t.getTime() > 48 * 60 * 60 * 1000;
      } else if (chat.preview && chat.time && /day|yesterday|d\b/i.test(String(chat.time))) {
        gap = true;
      }
    } catch (e) {}

    // Demo: also show repair if local flag set
    try {
      if (localStorage.getItem('chaupaal_repair_demo_' + (chat.id || '')) === '1') gap = true;
    } catch (e) {}

    if (!declined && !gap) return;

    const chips = [];
    if (declined) chips.push('No worries — another time?');
    if (gap) {
      chips.push('Still up for a chat?');
      chips.push('No rush — saying hi again');
    }
    if (!chips.length) return;

    const bar = document.createElement('div');
    bar.className = 'chaupaal-repair-chips';
    bar.style.cssText =
      'display:flex;flex-wrap:wrap;gap:6px;padding:8px 12px;border-top:1px solid var(--line,#E8DFD4);background:rgba(255,248,240,.9)';
    bar.innerHTML = chips
      .map(
        (c) =>
          `<button type="button" class="chaupaal-repair-chip" style="border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 12px;font-size:12px;cursor:pointer;font-weight:600;">${c.replace(
            /</g,
            '&lt;'
          )}</button>`
      )
      .join('');
    const inputBar = screen.querySelector('.chat-input-bar');
    if (inputBar) screen.insertBefore(bar, inputBar);
    else screen.appendChild(bar);

    bar.querySelectorAll('.chaupaal-repair-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        input.value = btn.textContent || '';
        input.focus();
        bar.remove();
      });
    });
  }

  function markGameInviteDeclined(chatId) {
    try {
      if (typeof baithakChats !== 'undefined') {
        const c = baithakChats.find((x) => x.id === chatId || x.firestoreId === chatId);
        if (c) {
          c.gameInviteDeclined = true;
          c.lastGameDeclinedAt = Date.now();
        }
      }
    } catch (e) {}
  }

  /** After journal save, engage matching goodnight event if present. */
  async function onJournalCompleted() {
    if (!db || !currentUser) return;
    try {
      const snap = await db
        .collection('users')
        .doc(currentUser.uid)
        .collection('chaupaalEvents')
        .where('type', '==', 'goodnight_journal')
        .limit(5)
        .get();
      for (const doc of snap.docs) {
        const d = doc.data();
        if (!d.engaged && !d.dismissed) {
          if (typeof engageChaupaalEvent === 'function') await engageChaupaalEvent(doc.id);
          else if (typeof apiFetch === 'function') {
            await apiFetch('/api/chaupaal-events', {
              method: 'POST',
              needAuth: true,
              body: { action: 'engage', eventId: doc.id },
            });
          }
          break;
        }
      }
    } catch (e) {}
  }

  window.pickSharedHello = pickSharedHello;
  window.interestOverlapReason = interestOverlapReason;
  window.dmChatIdFor = dmChatIdFor;
  window.ensurePeerDmChat = ensurePeerDmChat;
  window.bootstrapDmChat = bootstrapDmChat;
  window.friendlyDmError = friendlyDmError;
  window.openDmWithSharedHello = openDmWithSharedHello;
  window.mountConversationRepairChips = mountConversationRepairChips;
  window.markGameInviteDeclined = markGameInviteDeclined;
  window.onChaupaalJournalCompleted = onJournalCompleted;
})();
