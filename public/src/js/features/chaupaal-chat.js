/**
 * Pinned Chaupaal system conversation in Baithak.
 * chatId: chat_chaupaal_{uid} — pinned before self-chat.
 */
(function () {
  const CHAUPAAL_PREFIX = 'chat_chaupaal_';

  function chaupaalChatId(uid) {
    const u =
      uid ||
      (typeof currentUser !== 'undefined' && currentUser?.uid) ||
      'anon';
    return CHAUPAAL_PREFIX + u;
  }

  function isChaupaalChat(chat) {
    if (!chat) return false;
    if (chat.type === 'chaupaal' || chat.isChaupaal) return true;
    const id = chat.firestoreId || chat.id;
    return typeof id === 'string' && id.startsWith(CHAUPAAL_PREFIX);
  }

  function getChaupaalChat() {
    const id = chaupaalChatId();
    // Seed the welcome bubble for the real uid (module-load seeding only covers 'anon')
    try {
      if (typeof SAMPLE_MESSAGES !== 'undefined' && !SAMPLE_MESSAGES[id]) {
        SAMPLE_MESSAGES[id] = [
          {
            from: 'them',
            text: "Hey — I'm Chaupaal. Ask me anything, share feedback, or just say how your day's going.",
            time: 'Pinned',
            avatar: '🏠',
          },
        ];
      }
    } catch (e) {}
    return {
      id,
      firestoreId: id,
      type: 'chaupaal',
      isChaupaal: true,
      pinned: true,
      undeletable: true,
      name: 'Chaupaal',
      displayName: 'Chaupaal',
      avatar: '🏠',
      photoURL: null,
      preview: 'Talk with Chaupaal · recommendations & check-ins',
      time: 'Pinned',
      unread: 0,
      duelStreak: 0,
      uid: typeof currentUser !== 'undefined' ? currentUser?.uid : null,
    };
  }

  /**
   * Pin order: Chaupaal first, then Me (self), then the rest.
   * Does not call ensureSelfChatPinned (avoids recursion); builds both rows here.
   */
  function ensureChaupaalPinned(chats) {
    const rest = Array.isArray(chats)
      ? chats.filter((c) => !isChaupaalChat(c) && !(typeof isSelfChat === 'function' && isSelfChat(c)))
      : [];
    const selfRow = typeof getSelfChat === 'function' ? getSelfChat() : null;
    return selfRow ? [getChaupaalChat(), selfRow, ...rest] : [getChaupaalChat(), ...rest];
  }

  function canDeleteOrBlockChaupaalAware(chat) {
    if (isChaupaalChat(chat)) return false;
    if (typeof canDeleteOrBlockChat === 'function') return canDeleteOrBlockChat(chat);
    return !(typeof isSelfChat === 'function' && isSelfChat(chat));
  }

  async function ensureChaupaalChatDoc() {
    if (!db || !currentUser) return null;
    const id = chaupaalChatId(currentUser.uid);
    const ref = db.collection('chats').doc(id);
    const createPayload = {
      participants: [currentUser.uid],
      type: 'chaupaal',
      pinned: true,
      name: 'Chaupaal',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      preview: 'Talk with Chaupaal',
    };
    const repairPayload = {
      participants: [currentUser.uid],
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    try {
      const snap = await ref.get();
      if (!snap.exists) {
        await ref.set(createPayload);
      } else if (!Array.isArray(snap.data()?.participants) || !snap.data().participants.includes(currentUser.uid)) {
        await ref.set(repairPayload, { merge: true });
      }
    } catch (e) {
      console.warn('[chaupaal-chat] ensure doc get/create', e?.code || e?.message || e);
      try {
        await ref.set(createPayload);
      } catch (e2) {
        try {
          await ref.set(repairPayload, { merge: true });
        } catch (e3) {
          console.warn('[chaupaal-chat] ensure doc set', e3?.code || e3?.message || e3);
        }
      }
    }
    return id;
  }

  const QUIET_REPLY =
    "Chaupaal is resting right now — your messages and history are safe here. I'll be back soon. 🌙";

  /**
   * Send via authenticated API; persists user + assistant messages server-side.
   * When the client-side gate is off we skip the network call and answer
   * locally in Chaupaal's voice (never a silent failure or spinner).
   */
  async function sendChaupaalMessage(text, history = []) {
    if (typeof apiFetch !== 'function') throw new Error('apiFetch missing');
    const aiOn =
      typeof isAiFeaturesEnabledSync === 'function' ? isAiFeaturesEnabledSync() : true;
    if (!aiOn) {
      return { quiet: true, reply: null, message: QUIET_REPLY };
    }
    const envelope = await apiFetch('/api/chaupaal-chat', {
      method: 'POST',
      needAuth: true,
      body: { message: text, history },
    });
    if (!envelope?.ok) {
      const err = new Error(envelope?.error?.message || 'Chaupaal reply failed');
      err.code = envelope?.error?.code;
      throw err;
    }
    return envelope.data || {};
  }

  /**
   * Quiet mode keeps the tab intentionally calm: history stays visible, the
   * composer stays usable, and any send gets a warm in-voice "back soon" reply
   * instead of an error state.
   */
  function applyQuietComposer(screen, quiet) {
    if (!screen) return;
    const input = screen.querySelector('#chatMsgInput');
    const status = screen.querySelector('#chatActivityStatus');
    if (quiet) {
      if (input) input.placeholder = 'Chaupaal is resting — back soon…';
      if (status) status.textContent = 'Resting · will be back soon';
      screen.dataset.chaupaalQuiet = '1';
    } else {
      if (input) input.placeholder = 'Talk with Chaupaal…';
      if (status) status.textContent = 'Your space with Chaupaal';
      delete screen.dataset.chaupaalQuiet;
    }
  }

  async function hydrateChaupaalQuietState(screen) {
    let quiet = false;
    try {
      if (typeof isAiFeaturesEnabled === 'function') {
        const on = await isAiFeaturesEnabled();
        quiet = !on;
      } else if (typeof isAiFeaturesEnabledSync === 'function') {
        quiet = !isAiFeaturesEnabledSync();
      }
    } catch (e) {
      quiet = false;
    }
    applyQuietComposer(screen, quiet);
    return quiet;
  }

  window.CHAUPAAL_CHAT_PREFIX = CHAUPAAL_PREFIX;
  window.chaupaalChatId = chaupaalChatId;
  window.isChaupaalChat = isChaupaalChat;
  window.getChaupaalChat = getChaupaalChat;
  window.ensureChaupaalPinned = ensureChaupaalPinned;
  window.sendChaupaalMessage = sendChaupaalMessage;
  window.ensureChaupaalChatDoc = ensureChaupaalChatDoc;
  window.hydrateChaupaalQuietState = hydrateChaupaalQuietState;
  window.applyChaupaalQuietComposer = applyQuietComposer;

  // Override delete/block gate
  const prevCan = window.canDeleteOrBlockChat;
  window.canDeleteOrBlockChat = function (chat) {
    if (isChaupaalChat(chat)) return false;
    return typeof prevCan === 'function' ? prevCan(chat) : true;
  };

  try {
    if (typeof baithakChats !== 'undefined') {
      baithakChats = ensureChaupaalPinned(baithakChats);
    }
    if (typeof SAMPLE_MESSAGES !== 'undefined' && !SAMPLE_MESSAGES[chaupaalChatId()]) {
      SAMPLE_MESSAGES[chaupaalChatId()] = [
        {
          from: 'them',
          text: "Hey — I'm Chaupaal. Ask me anything, share feedback, or just say how your day's going.",
          time: 'Pinned',
          avatar: '🏠',
        },
      ];
    }
  } catch (e) {}
})();
