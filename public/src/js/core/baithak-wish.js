/**
 * Personalized Baithak prefill for friend events (Surkhiya, MCQ, notifications).
 * Rotates templates by event type + name so messages stay non-repetitive.
 */
(function () {
  'use strict';

  const TEMPLATES = /* i18n-copy */ {
    birthday: [
      t('baithak.happy_birthday_name_hope_today_feels'),
      '{{name}} — birthday vibes! Wishing you an easy, joyful day.',
      t('baithak.hey_name_happy_birthday_saving_you'),
      t('baithak.birthday_greetings_name_may_this_year'),
    ],
    anniversary: [
      t('baithak.happy_anniversary_name_hope_you_two'),
      '{{name}} — anniversary wishes! Celebrating your story from afar.',
      t('baithak.hey_name_happy_anniversary_sending_warm'),
    ],
    friend_update: [
      t('baithak.hey_name_saw_your_update_and'),
      '{{name}}, that update made me smile. Catch up soon?',
      t('baithak.thinking_of_you_name_hope_the'),
    ],
    trip: [
      t('baithak.safe_travels_name_send_a_postcard'),
      '{{name}} — have an amazing trip! Can’t wait to hear the stories.',
    ],
    generic: [
      t('baithak.hey_name_thinking_of_you_how'),
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
    const displayName = name || username || t('common.friend');
    const text =
      prefill ||
      baithakWishMessage({ type: type || 'generic', name: displayName, uid });

    try {
      document.querySelector('.tab-btn[data-tab="baithak"]')?.click();
    } catch (e) {}

    if (!uid) {
      if (typeof showToast === 'function') showToast(t('baithak.open_baithak_to_message_them'));
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

    // Fallback: locate existing live chat only — never SAMPLE_CHATS for signed-in (Trust T1)
    try {
      const chats =
        typeof baithakChats !== 'undefined' && Array.isArray(baithakChats) ? baithakChats : [];
      let chat = chats.find(
        (c) =>
          c &&
          !c.isSample &&
          !c.isDemo &&
          (c.uid === uid ||
            c.peerUid === uid ||
            c.otherUid === uid ||
            (Array.isArray(c.participants) && c.participants.includes(uid)))
      );
      if (!chat) {
        const chatId =
          typeof dmChatIdFor === 'function'
            ? dmChatIdFor(uid)
            : typeof currentUser !== 'undefined' && currentUser?.uid
              ? [currentUser.uid, uid].sort().join('_')
              : '';
        if (!chatId) {
          if (typeof showToast === 'function') showToast(t('baithak.sign_in_to_message'));
          return null;
        }
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
      if (typeof showToast === 'function') showToast(t('baithak.open_baithak_to_message_them'));
      return null;
    }
  }

  function openBaithakWithWish({ uid, name, avatar, type, username } = {}) {
    return openBaithakWithPrefill({ uid, name, avatar, type, username });
  }

  window.baithakWishMessage = baithakWishMessage;
  window.openBaithakWithWish = openBaithakWithWish;
  window.openBaithakWithPrefill = openBaithakWithPrefill;
  window.applyBaithakPrefill = applyPrefill;
})();
