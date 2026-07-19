/**
 * Self-chat — "Message Yourself" pinned Baithak thread.
 * Reuses openChatScreen / messaging / game attach; not a separate system.
 * Pinned forever; not deletable / blockable. Solo games only.
 */
(function () {
  const SELF_CHAT_ID = 'chat_self';

  function isSelfChat(chat) {
    if (!chat) return false;
    if (chat.isSelf || chat.type === 'self') return true;
    const id = chat.firestoreId || chat.id;
    return id === SELF_CHAT_ID || (typeof id === 'string' && id.startsWith('chat_self'));
  }

  function firstNameFrom(full) {
    const s = String(full || '').trim();
    if (!s) return 'Me';
    return s.split(/\s+/)[0];
  }

  function getSelfChat() {
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
      id: SELF_CHAT_ID,
      firestoreId: SELF_CHAT_ID,
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
      // Prefer internal gameType for solos; selfChat still includes dual AI practice
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

  window.SELF_CHAT_ID = SELF_CHAT_ID;
  window.isSelfChat = isSelfChat;
  window.getSelfChat = getSelfChat;
  window.ensureSelfChatPinned = ensureSelfChatPinned;
  window.canDeleteOrBlockChat = canDeleteOrBlockChat;
  window.getSelfChatSoloGames = getSelfChatSoloGames;

  // Re-pin after this module loads (baithak-data may have initialized earlier)
  try {
    if (typeof baithakChats !== 'undefined') {
      baithakChats = ensureSelfChatPinned(baithakChats);
    }
    if (typeof SAMPLE_MESSAGES !== 'undefined' && !SAMPLE_MESSAGES[SELF_CHAT_ID]) {
      SAMPLE_MESSAGES[SELF_CHAT_ID] = [
        {
          from: 'me',
          text: 'This is your space — notes to yourself, and a place to try chats, games, and features without another person.',
          time: 'Pinned',
        },
      ];
    }
  } catch (e) {}
})();
