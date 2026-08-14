/**
 * Virtual chips — reads/writes only via /api/media-config (Admin SDK).
 */
(function () {
  'use strict';

  let cached = null;

  async function api(action, extra) {
    if (typeof apiFetch !== 'function') throw new Error('apiFetch missing');
    const envelope = await apiFetch('/api/media-config', {
      method: 'POST',
      needAuth: true,
      body: Object.assign({ action }, extra || {}),
    });
    if (!envelope || envelope.ok === false) {
      throw new Error(envelope?.error?.message || 'Dangal request failed');
    }
    return envelope.data;
  }

  async function getChipBalance() {
    const data = await api('dangal_wallet_get');
    cached = data;
    return data;
  }

  const sent = new Set();

  async function reportGameEnd(opts) {
    const o = opts || {};
    const gameType = typeof canonicalGameId === 'function' ? canonicalGameId(o.gameType) : o.gameType;
    if (!gameType) return null;
    const result = typeof normalizeDangalResult === 'function' ? normalizeDangalResult(o.result) : o.result;
    if (!result) return null;
    const key = String(o.matchId || o.sessionId || '') + ':' + gameType;
    if (key !== ':' + gameType && sent.has(key)) return null;
    if (key !== ':' + gameType) sent.add(key);
    const won = o.won === true || result === 'win';
    const isDraw = o.isDraw === true || result === 'draw';
    try {
      const data = await api('dangal_game_resolve', {
        gameType,
        opponentUid: o.opponentUid || '',
        winnerUid: o.winnerUid || (won ? (typeof getCurrentUid === 'function' ? getCurrentUid() : '') : ''),
        isDraw,
        won,
        stake: Number(o.stake) || 0,
        result: String(result || (won ? 'win' : isDraw ? 'draw' : 'loss')),
        sessionId: o.sessionId || o.matchId || '',
        matchId: o.matchId || o.sessionId || '',
      });
      cached = { balance: data.chips, lifetimeEarned: cached?.lifetimeEarned };
      if (!data.duplicate && Array.isArray(data.achievements) && typeof showAchievementToasts === 'function') {
        showAchievementToasts(data.achievements);
      }
      return data;
    } catch (e) {
      if (key !== ':' + gameType) sent.delete(key);
      console.warn('[dangal-chips] resolve failed', e?.message || e);
      return null;
    }
  }

  window.DangalEconomy = {
    getChipBalance,
    reportGameEnd,
    getCachedBalance() {
      return cached;
    },
  };
})();
