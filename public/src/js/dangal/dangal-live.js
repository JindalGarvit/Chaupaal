/**
 * RTDB live match sync for dual/party games.
 * Path: games/{gameType}/{matchId}
 *
 * Schema (Phase 0 contract):
 *   players{}, playerA, playerB, turn, state|fen|board, version|seq,
 *   stake, status, winner, lastMoveAt, presence{}, updatedAt
 */
(function () {
  'use strict';

  function rtdbRef(path) {
    if (typeof rtdb === 'undefined' || !rtdb) return null;
    return rtdb.ref(path);
  }

  function isLive(chat, launch) {
    const ctx = launch || window.__dangalLaunchCtx || {};
    if (ctx.mode === 'practice' || ctx.mode === 'daily') return false;
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
    const stake = Number(o.stake) || Number(window.__dangalLaunchCtx?.stake) || 0;
    const now = Date.now();
    ref.transaction((cur) => {
      if (cur) {
        const next = Object.assign({}, cur);
        next.players = Object.assign({}, cur.players || {});
        if (me) next.players[me] = true;
        next.presence = Object.assign({}, cur.presence || {});
        if (me) next.presence[me] = { at: now, online: true };
        if (!next.playerA) next.playerA = o.playerA;
        if (!next.playerB) next.playerB = o.playerB;
        if (stake > 0 && !next.stake) next.stake = stake;
        next.lastMoveAt = next.lastMoveAt || now;
        next.version = Number(next.version || next.seq) || 0;
        return next;
      }
      const players = {};
      players[o.playerA] = true;
      players[o.playerB] = true;
      const presence = {};
      presence[o.playerA] = { at: now, online: true };
      presence[o.playerB] = { at: now, online: false };
      return {
        playerA: o.playerA,
        playerB: o.playerB,
        players,
        presence,
        turn: o.playerA,
        fen: o.fen || '',
        board: o.board || '',
        state: o.state || null,
        seq: 0,
        version: 0,
        stake,
        status: 'playing',
        winner: null,
        lastMove: null,
        lastMoveAt: now,
        updatedAt: now,
      };
    });
    let handler = null;
    const api = {
      push(patch) {
        return ref.transaction((cur) => {
          if (!cur) return cur;
          const next = Object.assign({}, cur, patch || {});
          next.seq = (Number(cur.seq) || 0) + 1;
          next.version = next.seq;
          next.updatedAt = Date.now();
          next.lastMoveAt = Date.now();
          if (me) {
            next.players = Object.assign({}, cur.players || {});
            next.players[me] = true;
            next.presence = Object.assign({}, cur.presence || {});
            next.presence[me] = { at: Date.now(), online: true };
          }
          return next;
        });
      },
      setStatus(status, winner) {
        return api.push({
          status: status || 'playing',
          winner: winner || null,
        });
      },
      leave() {
        if (me) {
          try {
            ref.child('presence/' + me).set({ at: Date.now(), online: false });
          } catch (e) {}
        }
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
