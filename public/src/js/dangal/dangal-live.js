/**
 * RTDB live match sync for dual/party games.
 * Path: games/{gameType}/{matchId}
 *
 * Schema: players{}, playerA, playerB, turn, state|fen|board, version|seq,
 *   stake, status, winner, lastMoveAt, presence{}, updatedAt,
 *   clocks{w,b}, clockAt, clockTurn, timeControl,
 *   quiz: { questions?, answers{}, scores{}, qIdx? },
 *   ludoMode: 'classic'|'quick' (host seeds once)
 *
 * Chess merge rules:
 * - Host seeds fen once (join: only if fen missing). Guest never overwrites.
 * - Move push may include baseVersion; stale versions abort the transaction.
 *
 * Ludo merge rules:
 * - Host seeds state + ludoMode once (join: only if state/pieces missing). Guest never resets.
 * - Push replaces full state snapshot (authoritative); use baseVersion to reject stale writes.
 *
 * Quiz merge rules:
 * - Host seeds questions once (join transaction: only if quiz missing).
 * - Later pushes must deep-merge answers[uid] and never clobber opponent answers
 *   or overwrite an existing questions array.
 */
(function () {
  'use strict';

  const PRESENCE_FORFEIT_MS = 90000;
  /** Soft "reconnecting" banner before forfeit. */
  const PRESENCE_WARN_MS = 12000;
  const PRESENCE_HEARTBEAT_MS = 20000;
  /** Guest waits this long for host quiz seed before Retry UI. */
  const QUIZ_SEED_TIMEOUT_MS = 18000;

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
    if (!opp || /^(ai|practice|random)$/i.test(String(opp))) return false;
    if (typeof isPersistableUid === 'function' && !isPersistableUid(opp)) return false;
    const mid = String((chat && chat.dangalMatchId) || ctx.matchId || '').trim();
    if (!mid) return false;
    return true;
  }

  function roles(chat, launch) {
    const ctx = launch || window.__dangalLaunchCtx || {};
    const me = typeof getCurrentUid === 'function' ? getCurrentUid() : '';
    const opp =
      (typeof opponentUidFromChat === 'function' ? opponentUidFromChat(chat) : '') ||
      ctx.opponentUid ||
      '';
    const src = String(ctx.source || (chat && chat.dangalSource) || '');
    // Acceptor (source === 'challenge') is guest; challenger / finder / host is host.
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

  /** Deep-merge quiz patches without wiping opponent answers or reseeding questions. */
  function mergeQuiz(curQuiz, patchQuiz) {
    const cq = curQuiz && typeof curQuiz === 'object' ? curQuiz : {};
    const pq = patchQuiz && typeof patchQuiz === 'object' ? patchQuiz : {};
    const answers = Object.assign({}, cq.answers || {});
    const pqAnswers = pq.answers || {};
    Object.keys(pqAnswers).forEach((uid) => {
      answers[uid] = Object.assign({}, answers[uid] || {}, pqAnswers[uid] || {});
    });
    const hasCurQs = Array.isArray(cq.questions) && cq.questions.length > 0;
    const hasPatchQs = Array.isArray(pq.questions) && pq.questions.length > 0;
    const questions = hasCurQs ? cq.questions : hasPatchQs ? pq.questions : cq.questions || null;
    const out = {
      questions,
      answers,
      scores: Object.assign({}, cq.scores || {}, pq.scores || {}),
    };
    if (pq.qIdx != null) out.qIdx = pq.qIdx;
    else if (cq.qIdx != null) out.qIdx = cq.qIdx;
    return out;
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
    let presenceHeartbeat = null;
    let visibilityHandler = null;
    let forfeited = false;
    let detached = false;

    function bumpPresence(online) {
      if (!me || detached) return;
      try {
        ref.child('presence/' + me).set({ at: Date.now(), online: online !== false });
      } catch (e) {}
    }

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
        // Seed fen only when missing — guest must never overwrite host Chess960/standard.
        if (o.fen && !String(cur.fen || '').trim()) {
          next.fen = o.fen;
        }
        if (o.clocks && !cur.clocks) next.clocks = o.clocks;
        if (o.timeControl && !cur.timeControl) next.timeControl = o.timeControl;
        if (o.clockTurn && !cur.clockTurn) next.clockTurn = o.clockTurn;
        if (o.clockAt && !cur.clockAt) next.clockAt = o.clockAt;
        // Seed quiz only when missing — guest must never overwrite host questions.
        if (o.quizSeed && !(cur.quiz && Array.isArray(cur.quiz.questions) && cur.quiz.questions.length)) {
          next.quiz = o.quizSeed;
        }
        // Seed Ludo state + mode once — guest must never reset yards mid-match.
        const curHasLudo =
          cur.state &&
          cur.state.pieces &&
          typeof cur.state.pieces === 'object' &&
          Object.keys(cur.state.pieces).length > 0;
        if (o.state && o.state.pieces && !curHasLudo) {
          next.state = o.state;
        }
        if (o.ludoMode && !cur.ludoMode) {
          next.ludoMode = o.ludoMode === 'quick' ? 'quick' : 'classic';
        }
        next.lastMoveAt = next.lastMoveAt || now;
        next.version = Number(next.version || next.seq) || 0;
        // Do not resurrect a finished match
        if (cur.status === 'over' || cur.status === 'forfeit' || cur.status === 'timeout' || cur.status === 'checkmate' || cur.status === 'aborted' || cur.status === 'draw' || cur.status === 'stalemate') {
          next.status = cur.status;
          next.winner = cur.winner || null;
        }
        return next;
      }
      const players = {};
      players[o.playerA] = true;
      players[o.playerB] = true;
      const presence = {};
      presence[o.playerA] = { at: now, online: true };
      presence[o.playerB] = { at: now, online: me === o.playerB };
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
        ludoMode: o.ludoMode === 'quick' ? 'quick' : o.ludoMode === 'classic' ? 'classic' : null,
        clocks: o.clocks || null,
        clockAt: o.clockAt || (o.clocks ? now : null),
        clockTurn: o.clockTurn || (o.clocks ? 'w' : null),
        timeControl: o.timeControl || null,
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
        if (detached) return Promise.resolve(null);
        return ref.transaction((cur) => {
          if (!cur) return cur;
          const patchObj = patch || {};
          const curVer = Number(cur.version || cur.seq) || 0;
          if (patchObj.baseVersion != null && Number(patchObj.baseVersion) !== curVer) {
            // Stale move — abort transaction
            return;
          }
          // Finished matches: allow status/winner/presence only, not fen/state rewinds
          const finished =
            cur.status === 'over' ||
            cur.status === 'forfeit' ||
            cur.status === 'timeout' ||
            cur.status === 'checkmate' ||
            cur.status === 'stalemate' ||
            cur.status === 'draw' ||
            cur.status === 'aborted' ||
            cur.status === 'resign';
          if (finished && patchObj.fen && patchObj.fen !== cur.fen) {
            return;
          }
          if (finished && patchObj.state && cur.state) {
            // Allow terminal status patches; block board rewinds after over/forfeit
            if (patchObj.status == null || patchObj.status === 'playing') return;
          }
          const next = Object.assign({}, cur);
          Object.keys(patchObj).forEach((k) => {
            if (k === 'quiz' || k === 'baseVersion') return;
            // Host-written ludoMode sticks unless missing
            if (k === 'ludoMode' && cur.ludoMode && patchObj.ludoMode) {
              next.ludoMode = cur.ludoMode;
              return;
            }
            next[k] = patchObj[k];
          });
          if (patchObj.quiz) {
            next.quiz = mergeQuiz(cur.quiz, patchObj.quiz);
          }
          next.seq = curVer + 1;
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
        if (forfeited || !me || detached) return Promise.resolve();
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
        if (presenceHeartbeat) {
          try {
            clearInterval(presenceHeartbeat);
          } catch (e) {}
          presenceHeartbeat = null;
        }
        if (visibilityHandler) {
          try {
            document.removeEventListener('visibilitychange', visibilityHandler);
          } catch (e) {}
          visibilityHandler = null;
        }
        const finish = () => {
          detached = true;
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
        if (doForfeit && !forfeited) {
          return Promise.resolve(api.forfeit()).then(finish).catch(finish);
        }
        finish();
        return Promise.resolve();
      },
    };

    if (typeof o.onSnap === 'function') {
      handler = ref.on('value', (snap) => {
        if (detached) return;
        try {
          const val = snap.val() || null;
          o.onSnap(val, api);
          if (val && me && typeof o.onPresence === 'function' && !detached) {
            const oppUid = me === val.playerA ? val.playerB : val.playerA;
            const p = (val.presence && val.presence[oppUid]) || {};
            const online = p.online !== false;
            const at = Number(p.at) || 0;
            const msOffline = !online && at ? Math.max(0, Date.now() - at) : 0;
            try {
              o.onPresence({
                oppUid,
                online,
                at,
                msOffline,
                warn: !online && msOffline >= PRESENCE_WARN_MS,
                forfeitSoon: !online && msOffline >= PRESENCE_WARN_MS && msOffline < PRESENCE_FORFEIT_MS,
                forfeitMsLeft: !online ? Math.max(0, PRESENCE_FORFEIT_MS - msOffline) : PRESENCE_FORFEIT_MS,
              });
            } catch (e) {}
          }
        } catch (e) {
          console.warn('[dangal-live]', e);
        }
      });
    }

    // Keep own presence fresh so brief tab blips don't look like a leave
    if (me) {
      bumpPresence(true);
      presenceHeartbeat = setInterval(() => {
        if (detached || forfeited) return;
        bumpPresence(typeof document === 'undefined' || document.visibilityState !== 'hidden');
      }, PRESENCE_HEARTBEAT_MS);
      visibilityHandler = () => {
        if (detached) return;
        bumpPresence(document.visibilityState !== 'hidden');
      };
      try {
        document.addEventListener('visibilitychange', visibilityHandler);
      } catch (e) {}
    }

    // Soft presence forfeit: if opponent offline > PRESENCE_FORFEIT_MS while playing
    if (o.watchForfeit !== false && me) {
      presenceWatch = setInterval(() => {
        if (detached || forfeited) return;
        ref.once('value', (snap) => {
          if (detached || forfeited) return;
          const val = snap.val();
          if (!val || val.status !== 'playing') return;
          const oppUid = me === val.playerA ? val.playerB : val.playerA;
          const p = (val.presence && val.presence[oppUid]) || {};
          const msOffline =
            p.online === false && p.at ? Date.now() - Number(p.at) : 0;
          if (typeof o.onPresence === 'function' && p.online === false && msOffline >= PRESENCE_WARN_MS) {
            try {
              o.onPresence({
                oppUid,
                online: false,
                at: Number(p.at) || 0,
                msOffline,
                warn: true,
                forfeitSoon: msOffline < PRESENCE_FORFEIT_MS,
                forfeitMsLeft: Math.max(0, PRESENCE_FORFEIT_MS - msOffline),
              });
            } catch (e) {}
          }
          if (p.online === false && p.at && msOffline > PRESENCE_FORFEIT_MS) {
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
      }, 5000);
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

  /** Confirm leave; forfeit Live match if still playing. Returns true if left. */
  async function requestLeave(opts) {
    const o = opts || {};
    const playing = o.isPlaying !== false;
    const live = !!(o.live || o.liveHandle);
    if (typeof confirmLeaveGame === 'function') {
      const ok = await confirmLeaveGame({
        title: o.title || 'Leave game?',
        body:
          live && playing
            ? o.forfeitBody || 'Leaving now counts as a forfeit for your opponent.'
            : o.body || 'This run will end.',
      });
      if (!ok) return false;
    }
    if (o.liveHandle && playing) {
      try {
        await Promise.resolve(o.liveHandle.leave({ forfeit: true }));
      } catch (e) {
        try {
          o.liveHandle.leave();
        } catch (e2) {}
      }
    } else if (o.liveHandle) {
      try {
        o.liveHandle.leave();
      } catch (e) {}
    }
    if (typeof o.onLeave === 'function') o.onLeave();
    return true;
  }

  window.DangalLive = {
    isLive,
    roles,
    join,
    pingTurn,
    modeChromeLabel,
    requestLeave,
    mergeQuiz,
    PRESENCE_FORFEIT_MS,
    PRESENCE_WARN_MS,
    QUIZ_SEED_TIMEOUT_MS,
  };
})();
