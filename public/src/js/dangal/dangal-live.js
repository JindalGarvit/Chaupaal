/**
 * RTDB live match sync for dual/party games.
 * Path: games/{gameType}/{matchId}
 *
 * Schema: players{}, playerA, playerB, turn, state|fen|board, version|seq,
 *   stake, status, winner, lastMoveAt, presence{}, updatedAt,
 *   quiz: { questions?, answers{}, scores{} }
 */
(function () {
  'use strict';

  const PRESENCE_FORFEIT_MS = 90000;

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
    let presenceWatch = null;
    let forfeited = false;

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
        if (o.quizSeed && !next.quiz) next.quiz = o.quizSeed;
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
        quiz: o.quizSeed || null,
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
      ref,
      matchId,
      gameType,
      push(patch) {
        return ref.transaction((cur) => {
          if (!cur) return cur;
          const next = Object.assign({}, cur, patch || {});
          if (patch && patch.quiz && cur.quiz) {
            const cq = cur.quiz || {};
            const pq = patch.quiz || {};
            next.quiz = Object.assign({}, cq, pq);
            next.quiz.answers = Object.assign({}, cq.answers || {}, pq.answers || {});
            Object.keys(next.quiz.answers).forEach((uid) => {
              next.quiz.answers[uid] = Object.assign(
                {},
                (cq.answers && cq.answers[uid]) || {},
                (pq.answers && pq.answers[uid]) || {}
              );
            });
            next.quiz.scores = Object.assign({}, cq.scores || {}, pq.scores || {});
            if (!next.quiz.questions && cq.questions) next.quiz.questions = cq.questions;
          }
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
      forfeit() {
        if (forfeited || !me) return Promise.resolve();
        forfeited = true;
        const winner = me === o.playerA ? o.playerB : o.playerA;
        return api.setStatus('forfeit', winner);
      },
      leave(optsLeave) {
        const doForfeit = !!(optsLeave && optsLeave.forfeit);
        if (presenceWatch) {
          try {
            clearInterval(presenceWatch);
          } catch (e) {}
          presenceWatch = null;
        }
        const finish = () => {
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
        };
        if (doForfeit) {
          return Promise.resolve(api.forfeit()).then(finish).catch(finish);
        }
        finish();
        return Promise.resolve();
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

    // Soft presence forfeit: if opponent offline > PRESENCE_FORFEIT_MS while playing
    if (o.watchForfeit !== false && me) {
      presenceWatch = setInterval(() => {
        ref.once('value', (snap) => {
          const val = snap.val();
          if (!val || val.status !== 'playing' || forfeited) return;
          const oppUid = me === val.playerA ? val.playerB : val.playerA;
          const p = (val.presence && val.presence[oppUid]) || {};
          if (p.online === false && p.at && Date.now() - Number(p.at) > PRESENCE_FORFEIT_MS) {
            forfeited = true;
            api.setStatus('forfeit', me).then(() => {
              if (typeof o.onForfeit === 'function') {
                try {
                  o.onForfeit({ winner: me, reason: 'opponent_timeout' });
                } catch (e) {}
              }
            });
          }
        });
      }, 15000);
    }

    return api;
  }

  function pingTurn(uid, gameType, extra) {
    if (typeof notifyTurn === 'function') notifyTurn(uid, gameType, extra || {});
  }

  /** Chrome subtitle helper — Practice vs Live honesty */
  function modeChromeLabel(liveOn, practiceLabel) {
    if (liveOn) return 'Live 1v1';
    return practiceLabel ? 'Practice · ' + practiceLabel : 'Practice vs AI';
  }

  window.DangalLive = { isLive, roles, join, pingTurn, modeChromeLabel, PRESENCE_FORFEIT_MS };
})();
