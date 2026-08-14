/**
 * Challenge cards in existing chats/{id}/messages (attachment.type = game_challenge).
 */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function formatMode(mode) {
    const labels = {
      '8ball': '8-Ball',
      '9ball': '9-Ball',
      snooker: 'Snooker',
      singles: 'Singles',
      doubles: 'Doubles',
      standard: 'Standard',
      fischer_random: 'Fischer Random',
      renju: 'Renju',
    };
    return labels[mode] || mode || '';
  }

  async function sendChallengeCard(toUid, gameType, gameConfig) {
    const fromUid = typeof getCurrentUid === 'function' ? getCurrentUid() : null;
    if (!fromUid || !toUid) throw new Error('Need both players');
    const id = typeof canonicalGameId === 'function' ? canonicalGameId(gameType) : gameType;
    const identity = typeof getGameIdentity === 'function' ? getGameIdentity(id) || {} : {};
    const cfg = gameConfig || {};
    let chatId = cfg.chatId;
    if (!chatId && typeof openChat === 'function') {
      /* caller should pass chatId from current Mitra thread */
    }
    if (!chatId) throw new Error('chatId required');
    const att = {
      type: 'game_challenge',
      gameType: id,
      status: 'pending',
      fromUid,
      toUid,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      gameName: identity.label || id,
      gameIcon: identity.icon || '🎮',
      gameColor: identity.primary || '#E63946',
      matchId: cfg.matchId || '',
      mode: cfg.mode || '',
      stake: Number(cfg.stake) || 0,
      timeControl: cfg.timeControl?.label || cfg.timeControl || '',
    };
    const text = identity.label ? 'Challenge: ' + identity.label : 'Game challenge';
    if (typeof sendRealtimeMessage === 'function') {
      await sendRealtimeMessage(chatId, text, false, null, att);
    } else if (typeof db !== 'undefined' && db) {
      await db.collection('chats').doc(chatId).collection('messages').add({
        uid: fromUid,
        text,
        attachment: att,
        ts: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }
    if (typeof notifyPlayer === 'function') {
      notifyPlayer(toUid, 'game_challenge', {
        fromName: typeof getDisplayName === 'function' ? getDisplayName() : '',
        gameName: identity.label,
        chatId,
      });
    }
    return { chatId };
  }

  function renderChallengeCard(message, myUid) {
    const att = message.attachment || message;
    const isReceiver = att.toUid === myUid;
    const expired = Date.now() > Number(att.expiresAt || 0);
    const pending = att.status === 'pending' && !expired;
    const color = att.gameColor || '#E63946';
    const detail = [att.timeControl, formatMode(att.mode), att.stake > 0 ? '⚡' + att.stake : '']
      .filter(Boolean)
      .join(' · ');
    const statusMap = { accepted: 'Accepted', declined: 'Declined', pending: expired ? 'Expired' : 'Awaiting…' };
    return (
      '<div class="baithak-challenge-card" style="--challenge-color:' +
      esc(color) +
      '" data-challenge-game="' +
      esc(att.gameType || '') +
      '" data-challenge-status="' +
      esc(att.status || 'pending') +
      '" data-challenge-to="' +
      esc(att.toUid || '') +
      '" data-challenge-from="' +
      esc(att.fromUid || '') +
      '" data-challenge-name="' +
      esc(att.gameName || '') +
      '" data-challenge-match="' +
      esc(att.matchId || '') +
      '">' +
      '<div class="baithak-challenge-card__header"><span>' +
      esc(att.gameIcon || '🎮') +
      '</span><div><strong>' +
      esc(att.gameName || 'Game') +
      '</strong><span class="baithak-challenge-card__from">' +
      esc(isReceiver ? 'Challenges you' : 'You sent a challenge') +
      '</span></div></div>' +
      (detail ? '<div class="baithak-challenge-card__detail">' + esc(detail) + '</div>' : '') +
      '<div class="baithak-challenge-card__footer">' +
      (isReceiver && pending
        ? '<button type="button" class="dangal-challenge-accept">Accept</button>' +
          '<button type="button" class="dangal-challenge-decline">Decline</button>'
        : '<span class="baithak-challenge-card__status">' + esc(statusMap[att.status] || att.status || '') + '</span>') +
      '</div></div>'
    );
  }

  function wireChallengeCard(root, message) {
    const card = root?.querySelector?.('.baithak-challenge-card');
    if (!card || card.dataset.wired === '1') return;
    card.dataset.wired = '1';
    const att = message.attachment || message;
    card.querySelector('.dangal-challenge-accept')?.addEventListener('click', () => {
      att.status = 'accepted';
      card.querySelector('.baithak-challenge-card__footer').innerHTML =
        '<span class="baithak-challenge-card__status">Accepted</span>';
      const openChat = window.currentOpenChat || {};
      const g = typeof getGame === 'function' ? getGame(att.gameType) : null;
      const chat = {
        name: openChat.name || att.gameName || 'Opponent',
        id: openChat.id,
        firestoreId: openChat.firestoreId || openChat.id,
        uid: att.fromUid,
        peerUid: att.fromUid,
        dangalMatchId: att.matchId || card.dataset.challengeMatch || '',
      };
      if (g?.launch) {
        g.launch({
          source: 'challenge',
          matchId: chat.dangalMatchId,
          opponentUid: att.fromUid,
          chat,
        });
      } else if (typeof showToast === 'function') showToast('Opening ' + (att.gameName || 'game'));
    });
    card.querySelector('.dangal-challenge-decline')?.addEventListener('click', () => {
      att.status = 'declined';
      card.querySelector('.baithak-challenge-card__footer').innerHTML =
        '<span class="baithak-challenge-card__status">Declined</span>';
    });
  }

  window.sendChallengeCard = sendChallengeCard;
  window.renderChallengeCard = renderChallengeCard;
  window.wireChallengeCard = wireChallengeCard;
})();
