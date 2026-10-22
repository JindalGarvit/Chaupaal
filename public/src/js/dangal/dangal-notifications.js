/**
 * In-app Dangal notify helper — uses existing notif_dm / notif_emit when available.
 */
(function () {
  'use strict';

  const NOTIFICATION_TEMPLATES = {
    your_turn: (d) => t('dangal.it_s_your_turn_in_value', { value: d.gameName || t('dangal.a_game') }),
    chess_challenge: (d) => t('dangal.value_challenges_you_to_chess', { value: d.fromName || t('common.someone') }),
    game_challenge: (d) => t('dangal.value_challenges_you_to_value2', { value: d.fromName || t('common.someone'), value2: d.gameName || t('dangal.a_game') }),
    challenge_accepted: (d) => t('dangal.value_accepted_your_value2_challenge', { value: d.fromName || t('common.someone'), value2: d.gameName || t('dangal.classics.game') }),
    challenge_declined: (d) => t('dangal.value_declined_your_value2_challenge', { value: d.fromName || t('common.someone'), value2: d.gameName || t('dangal.classics.game') }),
    game_over: (d) => (d.gameName || t('dangal.game')) + ' over',
  };

  async function notifyPlayer(recipientUid, eventKey, data) {
    const myUid = typeof getCurrentUid === 'function' ? getCurrentUid() : null;
    if (!recipientUid || recipientUid === myUid) return;
    const d = data || {};
    const tmpl = NOTIFICATION_TEMPLATES[eventKey];
    const text = tmpl ? tmpl(d) : eventKey;
    try {
      if (typeof apiFetch === 'function' && d.chatId) {
        await apiFetch('/api/media-config', {
          method: 'POST',
          needAuth: true,
          body: {
            action: 'notif_dm',
            chatId: d.chatId,
            recipientUid,
            preview: text,
          },
        });
      }
    } catch (e) {
      console.warn('[dangal-notifications]', e?.message || e);
    }
  }

  function notifyTurn(uid, gameType, extra) {
    const id = typeof getGameIdentity === 'function' ? getGameIdentity(gameType) : null;
    return notifyPlayer(uid, 'your_turn', Object.assign({ gameName: id?.label, gameType }, extra || {}));
  }

  async function notifyAll(uids, eventKey, data) {
    await Promise.all((uids || []).map((u) => notifyPlayer(u, eventKey, data)));
  }

  window.NOTIFICATION_TEMPLATES = NOTIFICATION_TEMPLATES;
  window.notifyPlayer = notifyPlayer;
  window.notifyTurn = notifyTurn;
  window.notifyAll = notifyAll;
})();
