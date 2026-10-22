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
      singles: t('dangal.challenge_mode.singles'),
      doubles: t('dangal.challenge_mode.doubles'),
      standard: t('dangal.challenge_mode.standard'),
      fischer_random: t('dangal.fischer_random'),
      classic: t('dangal.challenge_mode.classic'),
      quick: t('dangal.challenge_mode.quick'),
      blaze: t('dangal.challenge_mode.blaze'),
      doublesided: t('dangal.challenge_mode.flip'),
      flip: t('dangal.challenge_mode.flip'),
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
      ludoMode: cfg.ludoMode || (cfg.mode === 'quick' || cfg.mode === 'classic' ? cfg.mode : ''),
      unoVariant: cfg.unoVariant || cfg.variant || '',
      unoHouse: cfg.unoHouse && typeof cfg.unoHouse === 'object' ? cfg.unoHouse : null,
      stake: Number(cfg.stake) || 0,
      timeControl: cfg.timeControl?.label || cfg.timeControl || '',
      timeMin: Number(cfg.timeMin ?? cfg.min ?? cfg.timeControl?.min) || 0,
      timeInc: Number(cfg.timeInc ?? cfg.inc ?? cfg.timeControl?.inc) || 0,
      chess960: !!(cfg.chess960 ?? cfg.timeControl?.chess960),
    };
    const text = identity.label ? t('dangal.challenge_label', { label: identity.label }) : t('dangal.game_challenge');
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
    const retired = typeof isRetiredGameId === 'function' && isRetiredGameId(att.gameType);
    const expired = Date.now() > Number(att.expiresAt || 0);
    const pending = att.status === 'pending' && !expired && !retired;
    const color = att.gameColor || '#E63946';
      const detail = [
      att.timeControl,
      formatMode(att.unoVariant || att.ludoMode || att.mode),
      att.stake > 0 ? t('dangal.stake_virtual', { stake: att.stake }) : t('dangal.friendly'),
    ]
      .filter(Boolean)
      .join(' · ');
    const statusMap = { accepted: t('dangal.challenge_status.accepted'), declined: t('dangal.challenge_status.declined'), pending: expired ? t('dangal.challenge_status.expired') : t('dangal.challenge_status.awaiting') };
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
      '<div class="baithak-challenge-card__header"><span class="baithak-challenge-card__mark">' +
      (typeof gameMarkHtml === 'function'
        ? gameMarkHtml(att.gameType, { size: 28, color: color })
        : esc(att.gameIcon || '🎮')) +
      '</span><div><strong>' +
      esc(att.gameName || t('dangal.game')) +
      '</strong><span class="baithak-challenge-card__from">' +
      esc(isReceiver ? t('dangal.challenges_you') : t('dangal.you_sent_a_challenge')) +
      '</span></div></div>' +
      (detail ? '<div class="baithak-challenge-card__detail">' + esc(detail) + '</div>' : '') +
      '<div class="baithak-challenge-card__footer">' +
      (retired
        ? '<button type="button" class="dangal-challenge-accept" data-retired="1">' + tHtml('dangal.game_retired') + '</button>'
        : isReceiver && pending
        ? '<button type="button" class="dangal-challenge-accept">' + tHtml('common.accept') + '</button>' +
          '<button type="button" class="dangal-challenge-decline">' + tHtml('dangal.decline') + '</button>'
        : !isReceiver && att.status === 'accepted'
          ? '<button type="button" class="dangal-challenge-accept" data-join="1">' + tHtml('common.saathi_cta_play') + '</button>'
          : '<span class="baithak-challenge-card__status">' + esc(statusMap[att.status] || att.status || '') + '</span>') +
      '</div></div>'
    );
  }

  function wireChallengeCard(root, message) {
    const card = root?.querySelector?.('.baithak-challenge-card');
    if (!card || card.dataset.wired === '1') return;
    card.dataset.wired = '1';
    const att = message.attachment || message;
    const myUid = typeof getCurrentUid === 'function' ? getCurrentUid() : null;
    card.querySelector('.dangal-challenge-accept')?.addEventListener('click', async () => {
      if (typeof isRetiredGameId === 'function' && isRetiredGameId(att.gameType)) {
        if (typeof openRetiredGameScreen === 'function') openRetiredGameScreen(att.gameType);
        return;
      }
      const joinOnly = card.querySelector('.dangal-challenge-accept')?.dataset.join === '1';
      const openChat = window.currentOpenChat || {};
      const g = typeof getGame === 'function' ? getGame(att.gameType) : null;
      const iAmHost = att.fromUid === myUid;
      const stakeWanted = Number(att.stake) || 0;
      if (stakeWanted > 0 && window.DangalEconomy && typeof DangalEconomy.canAffordStake === 'function') {
        try {
          const ok = await DangalEconomy.canAffordStake(stakeWanted);
          if (!ok) {
            if (typeof showToast === 'function') {
              showToast(t('dangal.not_enough_virtual_chips_for_stakewanted', { stakeWanted }));
            }
            return;
          }
        } catch (e) {
          if (typeof showToast === 'function') showToast(t('dangal.couldn_t_check_chip_balance_try_2'));
          return;
        }
      }
      if (!joinOnly) {
        att.status = 'accepted';
        try {
          const cid = openChat.firestoreId || openChat.id;
          if (cid && message.id && typeof db !== 'undefined' && db) {
            db.collection('chats').doc(cid).collection('messages').doc(message.id).update({
              'attachment.status': 'accepted',
            });
          }
        } catch (e) {}
        if (typeof notifyPlayer === 'function' && att.fromUid) {
          notifyPlayer(att.fromUid, 'challenge_accepted', {
            fromName: typeof getDisplayName === 'function' ? getDisplayName() : '',
            gameName: att.gameName,
            chatId: openChat.firestoreId || openChat.id,
          });
        }
      }
      const opp = iAmHost ? att.toUid : att.fromUid;
      let mid = att.matchId || card.dataset.challengeMatch || '';
      if (!mid && typeof dangalMatchId === 'function') {
        mid = dangalMatchId(att.gameType, { uid: opp, peerUid: opp, opponentUid: opp });
      }
      if (!mid || (typeof isPersistableUid === 'function' && !isPersistableUid(opp))) {
        if (typeof showToast === 'function') {
          showToast(t('dangal.challenge_link_broken_try_practice_from'));
        }
        return;
      }
      const chat = {
        name: openChat.name || att.gameName || t('dangal.opponent'),
        id: openChat.id,
        firestoreId: openChat.firestoreId || openChat.id,
        uid: opp,
        peerUid: opp,
        dangalMatchId: mid,
      };
      if (g?.launch) {
        const ludoMode =
          att.ludoMode ||
          (att.mode === 'quick' || att.mode === 'classic' ? att.mode : '') ||
          'classic';
        g.launch({
          source: iAmHost ? 'challenge_host' : 'challenge',
          matchId: mid,
          opponentUid: opp,
          chat,
          mode: 'live',
          ludoMode: att.gameType === 'ludo' ? ludoMode : att.ludoMode || '',
          unoVariant: att.unoVariant || att.variant || '',
          unoHouse: att.unoHouse || null,
          variant: att.unoVariant || att.variant || '',
          stake: stakeWanted,
          min: Number(att.timeMin) || 0,
          inc: Number(att.timeInc) || 0,
          timeMin: Number(att.timeMin) || 0,
          timeInc: Number(att.timeInc) || 0,
          chess960: !!att.chess960,
          timeControl: att.timeControl || '',
          timeControlLabel: att.timeControl || '',
          chatId: openChat.firestoreId || openChat.id || '',
        });
      } else if (typeof showToast === 'function') showToast(t('dangal.opening_value', { value: att.gameName || t('dangal.classics.game') }));
    });
    card.querySelector('.dangal-challenge-decline')?.addEventListener('click', () => {
      att.status = 'declined';
      try {
        const cid = (window.currentOpenChat || {}).firestoreId || (window.currentOpenChat || {}).id;
        if (cid && message.id && typeof db !== 'undefined' && db) {
          db.collection('chats').doc(cid).collection('messages').doc(message.id).update({
            'attachment.status': 'declined',
          });
        }
      } catch (e) {}
      if (typeof notifyPlayer === 'function' && att.fromUid) {
        notifyPlayer(att.fromUid, 'challenge_declined', {
          fromName: typeof getDisplayName === 'function' ? getDisplayName() : '',
          gameName: att.gameName,
          chatId: (window.currentOpenChat || {}).firestoreId || (window.currentOpenChat || {}).id,
        });
      }
      card.querySelector('.baithak-challenge-card__footer').innerHTML =
        '<span class="baithak-challenge-card__status">' + tHtml('dangal.declined') + '</span>';
    });
  }

  window.sendChallengeCard = sendChallengeCard;
  window.renderChallengeCard = renderChallengeCard;
  window.wireChallengeCard = wireChallengeCard;
})();
