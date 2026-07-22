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

  /**
   * Create / open a DM and persist a shared first-hello card for both sides.
   */
  async function openDmWithSharedHello({
    uid,
    name,
    avatar,
    theirIcebreakers,
    starterText,
    origin,
    peerProfileType,
    matchMeta,
  }) {
    const chatId =
      currentUser?.uid && uid
        ? [currentUser.uid, uid].sort().join('_')
        : `chat_disc_${uid || Date.now()}`;
    const hello = pickSharedHello();
    const discoveryOrigin = origin === 'ai_discovery' ? 'ai_discovery' : origin || null;
    const peerType = peerProfileType || 'personal';
    const newChat = {
      id: chatId,
      firestoreId: chatId,
      type: 'dm',
      name: name || 'Friend',
      avatar: avatar || '👤',
      preview: 'Say hi — shared starter waiting',
      time: 'now',
      unread: 0,
      duelStreak: 0,
      theirIcebreakers: theirIcebreakers || [],
      icebreakers: theirIcebreakers || [],
      sharedFirstHello: hello,
      participants: currentUser?.uid && uid ? [currentUser.uid, uid].sort() : undefined,
      discoveryOrigin,
      peerProfileType: peerType,
      profileType: peerType,
      openedBy: typeof currentUser !== 'undefined' ? currentUser?.uid : null,
      matchMeta: matchMeta || null,
    };

    if (typeof SAMPLE_CHATS !== 'undefined' && !SAMPLE_CHATS.find((c) => c.id === newChat.id)) {
      SAMPLE_CHATS.unshift(newChat);
    }
    if (typeof baithakChats !== 'undefined' && Array.isArray(baithakChats)) {
      if (!baithakChats.find((c) => c.id === newChat.id || c.firestoreId === chatId)) {
        baithakChats.unshift(newChat);
      }
    }

    if (db && currentUser && uid) {
      try {
        const ref = db.collection('chats').doc(chatId);
        const snap = await ref.get();
        if (!snap.exists) {
          await ref.set({
            participants: [currentUser.uid, uid].sort(),
            type: 'dm',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            sharedFirstHello: hello,
            preview: hello,
            openedBy: currentUser.uid,
            createdBy: currentUser.uid,
            firstMessageAt: Date.now(),
            lastMessageAt: Date.now(),
            ...(discoveryOrigin
              ? { discoveryOrigin, peerProfileType: peerType, origin: discoveryOrigin }
              : {}),
            ...(matchMeta && typeof matchMeta === 'object' ? { matchMeta } : {}),
          });
          newChat.openedBy = currentUser.uid;
          newChat.createdBy = currentUser.uid;
          if (matchMeta) newChat.matchMeta = matchMeta;
          await ref.collection('messages').add({
            text: `Shared starter for both of you:\n"${hello}"`,
            uid: currentUser.uid,
            name: 'Chaupaal',
            avatar: '🏠',
            systemCard: true,
            kind: 'shared_first_hello',
            ts: firebase.firestore.FieldValue.serverTimestamp(),
          });
        } else {
          const data = snap.data() || {};
          if (!data.sharedFirstHello) {
            await ref.set({ sharedFirstHello: hello }, { merge: true });
          } else {
            newChat.sharedFirstHello = data.sharedFirstHello;
          }
          if (discoveryOrigin && !data.discoveryOrigin) {
            await ref.set(
              { discoveryOrigin, peerProfileType: peerType, origin: discoveryOrigin },
              { merge: true }
            );
          } else if (data.discoveryOrigin) {
            newChat.discoveryOrigin = data.discoveryOrigin;
            newChat.peerProfileType = data.peerProfileType || peerType;
          }
        }
      } catch (e) {
        console.warn('[founder] shared hello', e);
      }
    }

    if (typeof SAMPLE_MESSAGES !== 'undefined') {
      SAMPLE_MESSAGES[chatId] = SAMPLE_MESSAGES[chatId] || [
        {
          from: 'them',
          text: `🏠 Shared starter for both of you:\n"${newChat.sharedFirstHello}"`,
          time: 'now',
          avatar: '🏠',
        },
      ];
    }

    document.querySelectorAll('.tab-btn').forEach((b) => {
      if (b.dataset.tab === 'baithak') b.click();
    });
    setTimeout(() => {
      if (typeof initBaithak === 'function') initBaithak();
      setTimeout(() => {
        if (typeof openChatScreen === 'function') openChatScreen(newChat);
        if (starterText) {
          setTimeout(() => {
            const msgInput = document.getElementById('chatMsgInput');
            if (msgInput && !msgInput.value) msgInput.value = starterText;
          }, 350);
        }
      }, 280);
    }, 180);

    return newChat;
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
  window.openDmWithSharedHello = openDmWithSharedHello;
  window.mountConversationRepairChips = mountConversationRepairChips;
  window.markGameInviteDeclined = markGameInviteDeclined;
  window.onChaupaalJournalCompleted = onJournalCompleted;
})();
