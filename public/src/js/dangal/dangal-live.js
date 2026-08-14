/**
 * RTDB live match sync for dual games (chess, five-in-row, tic-tac-toe).
 * Path: games/{gameType}/{matchId} — players may create if missing.
 */
(function () {
  'use strict';

  function rtdbRef(path) {
    if (typeof rtdb === 'undefined' || !rtdb) return null;
    return rtdb.ref(path);
  }

  function isLive(chat, launch) {
    const ctx = launch || window.__dangalLaunchCtx || {};
    const opp =
      (typeof opponentUidFromChat === 'function' ? opponentUidFromChat(chat) : '') ||
      ctx.opponentUid ||
      '';
    const mid = (chat && chat.dangalMatchId) || ctx.matchId || '';
    return !!(opp && mid && typeof isPersistableUid === 'function' && isPersistableUid(opp));
  }

  function roles(chat, launch) {
    const ctx = launch || window.__dangalLaunchCtx || {};
    const me = typeof getCurrentUid === 'function' ? getCurrentUid() : '';
    const opp =
      (typeof opponentUidFromChat === 'function' ? opponentUidFromChat(chat) : '') ||
      ctx.opponentUid ||
      '';
    const src = ctx.source || (chat && chat.dangalSource) || '';
    const host = src !== 'challenge';
    const playerA = host ? me : opp;
    const playerB = host ? opp : me;
    return {
      me,
      opp,
      playerA,
      playerB,
      myColor: me === playerA ? 'w' : 'b',
      host,
    };
  }

  function join(opts) {
    const o = opts || {};
    const gameType = typeof canonicalGameId === 'function' ? canonicalGameId(o.gameType) : o.gameType;
    const matchId = String(o.matchId || '')
      .replace(/[^\w.-]/g, '')
      .slice(0, 120);
    const ref = rtdbRef('games/' + gameType + '/' + matchId);
    if (!ref || !matchId || !o.playerA || !o.playerB) return null;
    const me = o.me;
    ref.transaction((cur) => {
      if (cur) {
        const next = Object.assign({}, cur);
        next.players = Object.assign({}, cur.players || {});
        if (me) next.players[me] = true;
        if (!next.playerA) next.playerA = o.playerA;
        if (!next.playerB) next.playerB = o.playerB;
        return next;
      }
      const players = {};
      players[o.playerA] = true;
      players[o.playerB] = true;
      return {
        playerA: o.playerA,
        playerB: o.playerB,
        players,
        turn: o.playerA,
        fen: o.fen || '',
        board: o.board || '',
        seq: 0,
        status: 'playing',
        lastMove: null,
        updatedAt: Date.now(),
      };
    });
    let handler = null;
    const api = {
      push(patch) {
        return ref.transaction((cur) => {
          if (!cur) return cur;
          const next = Object.assign({}, cur, patch || {});
          next.seq = (Number(cur.seq) || 0) + 1;
          next.updatedAt = Date.now();
          if (me) {
            next.players = Object.assign({}, cur.players || {});
            next.players[me] = true;
          }
          return next;
        });
      },
      leave() {
        if (handler) {
          try {
            ref.off('value', handler);
          } catch (e) {}
          handler = null;
        }
      },
    };
    if (typeof o.onSnap === 'function') {
      handler = ref.on('value', (snap) => {
        try {
          o.onSnap(snap.val() || null, api);
        } catch (e) {
          console.warn('[dangal-live]', e);
        }
      });
    }
    return api;
  }

  function pingTurn(uid, gameType, extra) {
    if (typeof notifyTurn === 'function') notifyTurn(uid, gameType, extra || {});
  }

  window.DangalLive = { isLive, roles, join, pingTurn };
})();
