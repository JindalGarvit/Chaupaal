/**
 * In-app Dangal notify helper — uses existing notif_dm / notif_emit when available.
 */
(function () {
  'use strict';

  const NOTIFICATION_TEMPLATES = {
    your_turn: (d) => "It's your turn in " + (d.gameName || 'a game'),
    chess_challenge: (d) => (d.fromName || 'Someone') + ' challenges you to Chess',
    game_challenge: (d) => (d.fromName || 'Someone') + ' challenges you to ' + (d.gameName || 'a game'),
    challenge_accepted: (d) => (d.fromName || 'Someone') + ' accepted your ' + (d.gameName || 'game') + ' challenge',
    challenge_declined: (d) => (d.fromName || 'Someone') + ' declined your ' + (d.gameName || 'game') + ' challenge',
    game_over: (d) => (d.gameName || 'Game') + ' over',
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
