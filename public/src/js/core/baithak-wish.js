/**
 * Personalized Baithak prefill for friend events (Surkhiya, MCQ, notifications).
 * Rotates templates by event type + name so messages stay non-repetitive.
 */
(function () {
  'use strict';

  const TEMPLATES = {
    birthday: [
      'Happy birthday, {{name}}! 🎂 Hope today feels as warm as your chai.',
      '{{name}} — birthday vibes! Wishing you an easy, joyful day.',
      'Hey {{name}}, happy birthday! Saving you a slice of the celebration 🎉',
      'Birthday greetings, {{name}}! May this year be kinder than the last.',
    ],
    anniversary: [
      'Happy anniversary, {{name}}! 💍 Hope you two get a quiet moment today.',
      '{{name}} — anniversary wishes! Celebrating your story from afar.',
      'Hey {{name}}, happy anniversary! Sending warm vibes your way.',
    ],
    friend_update: [
      'Hey {{name}} — saw your update and had to say hi. How’s it going?',
      '{{name}}, that update made me smile. Catch up soon?',
      'Thinking of you, {{name}} — hope the week’s treating you well.',
    ],
    trip: [
      'Safe travels, {{name}}! Send a postcard vibe when you land ✈️',
      '{{name}} — have an amazing trip! Can’t wait to hear the stories.',
    ],
    generic: [
      'Hey {{name}} — thinking of you. How’s your day?',
      '{{name}}, just dropping by to say hi 👋',
    ],
  };

  function hashSeed(s) {
    let h = 0;
    const str = String(s || '');
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  function pickTemplate(type, name, uid) {
    const pool = TEMPLATES[type] || TEMPLATES.generic;
    const day = new Date().toISOString().slice(0, 10);
    const idx = hashSeed(`${type}|${uid || name}|${day}`) % pool.length;
    return pool[idx].replace(/\{\{name\}\}/g, name || 'friend');
  }

  /** Rotate wish copy; persists last pick lightly so consecutive taps still vary. */
  function baithakWishMessage({ type, name, uid } = {}) {
    const t = String(type || 'generic').toLowerCase();
    const kind = TEMPLATES[t] ? t : 'generic';
    let msg = pickTemplate(kind, name, uid);
    try {
      const key = 'chaupaal_wish_last';
      const last = localStorage.getItem(key);
      if (last === msg) {
        const pool = TEMPLATES[kind];
        const alt = pool[(hashSeed(msg) + 1) % pool.length];
        msg = alt.replace(/\{\{name\}\}/g, name || 'friend');
      }
      localStorage.setItem(key, msg);
    } catch (e) {}
    return msg;
  }

  function applyPrefill(text, delayMs) {
    const msg = String(text || '').trim();
    if (!msg) return;
    const tryFill = () => {
      const input = document.getElementById('chatMsgInput');
      if (input) {
        if (!input.value || input.value.length < 2) {
          input.value = msg;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.focus();
        }
        return true;
      }
      return false;
    };
    if (tryFill()) return;
    setTimeout(tryFill, delayMs || 420);
    setTimeout(tryFill, (delayMs || 420) + 500);
  }

  /**
   * Open Baithak DM with a personalized, non-sent prefill in the composer.
   */
  async function openBaithakWithPrefill({
    uid,
    name,
    avatar,
    type,
    prefill,
    username,
  } = {}) {
    const displayName = name || username || 'Friend';
    const text =
      prefill ||
      baithakWishMessage({ type: type || 'generic', name: displayName, uid });

    try {
      document.querySelector('.tab-btn[data-tab="baithak"]')?.click();
    } catch (e) {}

    if (!uid) {
      if (typeof showToast === 'function') showToast('Open Baithak to message them');
      return null;
    }

    try {
      if (typeof openDmWithSharedHello === 'function') {
        // Reuse DM open path but do not force shared-hello starter as the wish text
        const chat = await openDmWithSharedHello({
          uid,
          name: displayName,
          avatar: avatar || '👤',
          origin: 'surkhiya_wish',
          starterText: text,
        });
        applyPrefill(text, 380);
        return chat;
      }
    } catch (e) {
      console.warn('[baithak-wish]', e?.message || e);
    }

    // Fallback: locate existing chat or stub
    try {
      const chats =
        (typeof baithakChats !== 'undefined' && Array.isArray(baithakChats) && baithakChats) ||
        (typeof SAMPLE_CHATS !== 'undefined' && SAMPLE_CHATS) ||
        [];
      let chat = chats.find(
        (c) =>
          c.uid === uid ||
          c.peerUid === uid ||
          c.otherUid === uid ||
          (Array.isArray(c.participants) && c.participants.includes(uid))
      );
      if (!chat) {
        const chatId =
          typeof currentUser !== 'undefined' && currentUser?.uid
            ? [currentUser.uid, uid].sort().join('_')
            : `chat_${uid}`;
        chat = {
          id: chatId,
          firestoreId: chatId,
          type: 'dm',
          name: displayName,
          avatar: avatar || '👤',
          uid,
          peerUid: uid,
          participants:
            typeof currentUser !== 'undefined' && currentUser?.uid
              ? [currentUser.uid, uid].sort()
              : [uid],
        };
      }
      if (typeof openChatScreen === 'function') openChatScreen(chat);
      applyPrefill(text, 400);
      return chat;
    } catch (e) {
      if (typeof showToast === 'function') showToast('Open Baithak to message them');
      return null;
    }
  }

  window.baithakWishMessage = baithakWishMessage;
  window.openBaithakWithPrefill = openBaithakWithPrefill;
  window.applyBaithakPrefill = applyPrefill;
})();
