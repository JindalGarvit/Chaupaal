/**
 * Post-chat rating for first-contact stranger DMs.
 *
 * Recipient (not the opener) is prompted after a quiet period.
 * Formula (local): quietDelay = clamp(4min + 0.4 * activeSpan, 5min, 3h)
 * where activeSpan = lastMessageAt - firstMessageAt. Longer chats wait longer.
 */
(function () {
  'use strict';

  const MIN_QUIET_MS = 5 * 60 * 1000;
  const MAX_QUIET_MS = 3 * 60 * 60 * 1000;
  const BASE_QUIET_MS = 4 * 60 * 1000;
  const POLL_MS = 30 * 1000;
  const LS_PREFIX = 'chaupaal_chat_rating_';

  let pollTimer = null;

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function quietDelayMs(activeSpanMs) {
    const span = Math.max(0, Number(activeSpanMs) || 0);
    return clamp(BASE_QUIET_MS + span * 0.4, MIN_QUIET_MS, MAX_QUIET_MS);
  }

  function lsKey(chatId) {
    return LS_PREFIX + String(chatId || '');
  }

  function wasHandled(chatId) {
    try {
      return !!localStorage.getItem(lsKey(chatId));
    } catch (e) {
      return false;
    }
  }

  function markHandled(chatId, status) {
    try {
      localStorage.setItem(lsKey(chatId), JSON.stringify({ status, at: Date.now() }));
    } catch (e) {}
  }

  function peerUidOf(chat) {
    if (!chat || !currentUser) return null;
    if (chat.uid && chat.uid !== currentUser.uid) return chat.uid;
    const parts = chat.participants || [];
    return parts.find((u) => u && u !== currentUser.uid) || null;
  }

  async function isFriendPeer(uid) {
    if (!uid) return false;
    try {
      if (typeof hydrateRelationships === 'function') await hydrateRelationships([uid]);
      if (typeof relationshipState === 'function') {
        const st = relationshipState(uid);
        return !!(st && st.friend);
      }
    } catch (e) {}
    return false;
  }

  function isStrangerFirstContactChat(chat) {
    if (!chat || chat.type === 'group') return false;
    if (typeof isSelfChat === 'function' && isSelfChat(chat)) return false;
    if (typeof isChaupaalChat === 'function' && isChaupaalChat(chat)) return false;
    const origin = chat.discoveryOrigin || chat.origin;
    const hello = chat.sharedFirstHello;
    return !!(origin === 'ai_discovery' || origin === 'peepal_discovery' || hello);
  }

  /** Recipient = not the opener (openedBy / createdBy). */
  function amRecipient(chat) {
    if (!currentUser || !chat) return false;
    const opener = chat.openedBy || chat.createdBy;
    if (opener) return opener !== currentUser.uid;
    return false;
  }

  function injectStyles() {
    if (document.getElementById('chatRatingStyles')) return;
    const s = document.createElement('style');
    s.id = 'chatRatingStyles';
    s.textContent = `
      .chat-rating-bar{padding:10px 12px;background:var(--cream);border-top:1px solid var(--line);display:flex;flex-direction:column;gap:8px;}
      .chat-rating-title{font-family:Space Grotesk,sans-serif;font-weight:700;font-size:13px;}
      .chat-rating-sub{font-size:11px;color:var(--muted);line-height:1.35;}
      .chat-rating-scores{display:flex;gap:4px;flex-wrap:wrap;}
      .chat-rating-scores button{width:28px;height:28px;border-radius:8px;border:1.5px solid var(--line);background:var(--white);font-size:11px;font-weight:700;cursor:pointer;color:var(--ink);}
      .chat-rating-scores button:hover{border-color:var(--red);color:var(--red);}
      .chat-rating-actions{display:flex;gap:8px;flex-wrap:wrap;}
      .chat-rating-actions button{border:none;background:none;font-size:11px;font-weight:600;cursor:pointer;color:var(--muted);padding:4px 0;}
      .chat-rating-actions button.danger{color:var(--red);}
    `;
    document.head.appendChild(s);
  }

  function removeBar() {
    document.getElementById('chatRatingBar')?.remove();
  }

  async function submitRating(chat, score) {
    const peer = peerUidOf(chat);
    const chatId = chat.firestoreId || chat.id;
    if (!peer || !chatId) return;
    markHandled(chatId, 'rated_' + score);
    removeBar();
    try {
      if (typeof apiFetch === 'function') {
        await apiFetch('/api/relationships', {
          method: 'POST',
          needAuth: true,
          body: {
            action: 'chat_rating',
            targetUid: peer,
            chatId,
            score: Number(score),
            discoveryOrigin: chat.discoveryOrigin || chat.origin || null,
            intentProfileId: chat.matchMeta?.intentProfileId || null,
            signalScores: chat.matchMeta?.signalScores || null,
            intentText: chat.matchMeta?.intentText || '',
          },
        });
      }
    } catch (e) {
      console.warn('[chat-rating]', e?.message || e);
    }
    if (typeof showToast === 'function') showToast('Thanks — that helps keep Chaupaal kinder');
  }

  function showRatingBar(chat) {
    if (document.getElementById('chatRatingBar')) return;
    if (!document.getElementById('activeChatScreen')) return;
    injectStyles();
    const peer = peerUidOf(chat);
    const name = chat.name || 'them';
    const bar = document.createElement('div');
    bar.id = 'chatRatingBar';
    bar.className = 'chat-rating-bar';
    bar.setAttribute('data-nav-ignore', '1');
    bar.innerHTML = `
      <div class="chat-rating-title">How was this conversation?</div>
      <div class="chat-rating-sub">Optional · rate ${name.replace(/</g, '')} from 1–10. Personal first contacts only.</div>
      <div class="chat-rating-scores">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
        .map((n) => `<button type="button" data-score="${n}">${n}</button>`)
        .join('')}</div>
      <div class="chat-rating-actions">
        <button type="button" data-dismiss>Not now</button>
        <button type="button" class="danger" data-flag>Flag inappropriate</button>
        <button type="button" class="danger" data-block>Block</button>
      </div>`;
    const inputRow =
      document.querySelector('#activeChatScreen .chat-input-area') ||
      document.querySelector('#activeChatScreen .chat-composer') ||
      document.getElementById('chatMsgInput')?.closest('div');
    const screen = document.getElementById('activeChatScreen');
    if (inputRow?.parentElement) inputRow.parentElement.insertBefore(bar, inputRow);
    else screen?.appendChild(bar);

    bar.querySelectorAll('[data-score]').forEach((btn) => {
      btn.addEventListener('click', () => submitRating(chat, btn.dataset.score));
    });
    bar.querySelector('[data-dismiss]')?.addEventListener('click', () => {
      markHandled(chat.firestoreId || chat.id, 'dismissed');
      removeBar();
    });
    bar.querySelector('[data-flag]')?.addEventListener('click', () => {
      if (typeof openFlagSheet === 'function') {
        openFlagSheet(
          { uid: peer, name, profileType: chat.peerProfileType || chat.profileType },
          { targetType: 'chat', chatId: chat.firestoreId || chat.id }
        );
      }
    });
    bar.querySelector('[data-block]')?.addEventListener('click', async () => {
      markHandled(chat.firestoreId || chat.id, 'blocked');
      removeBar();
      if (typeof blockUser === 'function') await blockUser(peer, name);
    });
  }

  async function maybePromptForChat(chat) {
    if (!chat || !currentUser) return;
    const chatId = chat.firestoreId || chat.id;
    if (!chatId || wasHandled(chatId)) return;
    if (!isStrangerFirstContactChat(chat)) return;
    if (!amRecipient(chat)) return;
    const peer = peerUidOf(chat);
    if (!peer) return;
    if (await isFriendPeer(peer)) return;

    const last = Number(chat.lastMessageAt) || Number(chat.updatedAt) || 0;
    const first = Number(chat.firstMessageAt) || Number(chat.createdAt) || last;
    if (!last) return;
    const delay = quietDelayMs(last - first);
    if (Date.now() < last + delay) return;

    // Only prompt when this chat screen is open for that chat
    const openId =
      window.currentOpenChat?.firestoreId ||
      window.currentOpenChat?.id ||
      document.getElementById('activeChatScreen')?.dataset?.chatId;
    if (openId && openId === chatId) showRatingBar(chat);
  }

  function scheduleFromOpenChat() {
    const chat = window.currentOpenChat;
    if (!chat) return;
    maybePromptForChat(chat).catch(() => {});
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(scheduleFromOpenChat, POLL_MS);
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    removeBar();
  }

  window.ChatRating = {
    quietDelayMs,
    maybePromptForChat,
    showRatingBar,
    scheduleFromOpenChat,
    startPolling,
    stopPolling,
    isStrangerFirstContactChat,
  };

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleFromOpenChat();
  });
})();
