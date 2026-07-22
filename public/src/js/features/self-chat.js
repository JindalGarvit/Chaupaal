/**
 * Self-chat — "Message Yourself" pinned Baithak thread.
 * Reuses openChatScreen / messaging / game attach; not a separate system.
 * Pinned forever; not deletable / blockable. Solo games only.
 * Firestore id: chat_self_{uid} (provisioned like Chaupaal system chat).
 */
(function () {
  const SELF_CHAT_PREFIX = 'chat_self_';
  /** Legacy shared id — never write messages here. */
  const LEGACY_SELF_CHAT_ID = 'chat_self';

  function selfChatId(uid) {
    const u =
      uid ||
      (typeof currentUser !== 'undefined' && currentUser?.uid) ||
      null;
    return u ? SELF_CHAT_PREFIX + u : LEGACY_SELF_CHAT_ID;
  }

  function isSelfChat(chat) {
    if (!chat) return false;
    if (chat.isSelf || chat.type === 'self') return true;
    const id = chat.firestoreId || chat.id;
    return id === LEGACY_SELF_CHAT_ID || (typeof id === 'string' && id.startsWith(SELF_CHAT_PREFIX));
  }

  function firstNameFrom(full) {
    const s = String(full || '').trim();
    if (!s) return 'Me';
    return s.split(/\s+/)[0];
  }

  function getSelfChat() {
    const id = selfChatId();
    const name =
      (typeof digitalProfile !== 'undefined' && digitalProfile.displayName) ||
      (typeof userProfile !== 'undefined' && userProfile?.name) ||
      (typeof currentUser !== 'undefined' && currentUser?.displayName) ||
      'You';
    const meLabel = `Me (${firstNameFrom(name)})`;
    const avatar = '📝';
    const photo =
      (typeof currentUser !== 'undefined' && currentUser?.photoURL) ||
      (typeof userProfile !== 'undefined' && userProfile?.photoURL) ||
      null;
    return {
      id,
      firestoreId: id,
      type: 'self',
      isSelf: true,
      pinned: true,
      undeletable: true,
      name: meLabel,
      displayName: name,
      avatar,
      photoURL: photo,
      preview: 'Notes to self · try games & features here',
      time: 'Pinned',
      unread: 0,
      duelStreak: 0,
      uid: typeof currentUser !== 'undefined' ? currentUser?.uid : null,
    };
  }

  async function ensureSelfChatDoc() {
    if (!db || !currentUser) return null;
    const id = selfChatId(currentUser.uid);
    const ref = db.collection('chats').doc(id);
    try {
      const snap = await ref.get();
      if (!snap.exists) {
        await ref.set({
          participants: [currentUser.uid],
          type: 'self',
          pinned: true,
          name: 'Message Yourself',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          preview: 'Notes to self',
        });
      }
    } catch (e) {
      console.warn('[self-chat] ensure doc', e?.message || e);
    }
    return id;
  }

  /** Always pin self-chat first among non-Chaupaal rows; never drop it. */
  function ensureSelfChatPinned(chats) {
    const list = Array.isArray(chats) ? chats.filter((c) => !isSelfChat(c)) : [];
    return [getSelfChat(), ...list];
  }

  function canDeleteOrBlockChat(chat) {
    return !isSelfChat(chat);
  }

  /**
   * Practice games for self-chat: registry selfChat flag + pure solos (gameType).
   * Excludes multiplayer-only titles that need another real participant.
   */
  function getSelfChatSoloGames(chat) {
    if (typeof getGames === 'function') {
      const list = getGames({ selfChat: true });
      return list.map((g) => ({
        emoji: g.icon,
        name: g.name,
        desc: g.desc,
        gameType: g.gameType,
        fn: () => g.launch({ chat, source: 'self' }),
      }));
    }
    return [];
  }

  window.SELF_CHAT_ID = LEGACY_SELF_CHAT_ID;
  window.SELF_CHAT_PREFIX = SELF_CHAT_PREFIX;
  window.selfChatId = selfChatId;
  window.isSelfChat = isSelfChat;
  window.getSelfChat = getSelfChat;
  window.ensureSelfChatDoc = ensureSelfChatDoc;
  window.ensureSelfChatPinned = ensureSelfChatPinned;
  window.canDeleteOrBlockChat = canDeleteOrBlockChat;
  window.getSelfChatSoloGames = getSelfChatSoloGames;

  try {
    if (typeof baithakChats !== 'undefined') {
      baithakChats = ensureSelfChatPinned(baithakChats);
    }
    if (typeof SAMPLE_MESSAGES !== 'undefined') {
      const seed = [
        {
          from: 'me',
          text: 'This is your space — notes to yourself, and a place to try chats, games, and features without another person.',
          time: 'Pinned',
        },
      ];
      if (!SAMPLE_MESSAGES[LEGACY_SELF_CHAT_ID]) SAMPLE_MESSAGES[LEGACY_SELF_CHAT_ID] = seed;
    }
  } catch (e) {}
})();
