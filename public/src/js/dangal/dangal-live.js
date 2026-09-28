/**
 * RTDB live match sync for dual/party games.
 * Path: games/{gameType}/{matchId}
 *
 * Schema: players{}, playerA, playerB, turn, state|fen|board, version|seq,
 *   stake, status, winner, lastMoveAt, presence{}, updatedAt,
 *   clocks{w,b}, clockAt, clockTurn, timeControl,
 *   quiz: { questions?, answers{}, scores{}, qIdx? },
 *   ludoMode: 'classic'|'quick' (host seeds once)
 *   carrom cue: state.balls[] seeded once by host; shooter pushes full settle snaps
 *   uno / Oh No!: host seeds dealt handA/handB + full deck[] + discard once; actor pushes after each play.
 *   Friend Live v1: full deck in RTDB state (UI never paints opp cards; FOW via RTDB read accepted).
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

  const Policy = () => (typeof window !== 'undefined' && window.DangalLivePolicy) || null;
  const FINISHED = ['over', 'forfeit', 'timeout', 'checkmate', 'aborted', 'draw', 'stalemate', 'resign', 'void'];
  let serverOffset = 0;
  let offsetWatched = false;

  /** Server time (RTDB offset) — presence and forfeit decisions never trust the phone clock. */
  function watchServerOffset() {
    if (offsetWatched) return;
    const r = rtdbRef('.info/serverTimeOffset');
    if (!r) return;
    offsetWatched = true;
    try {
      r.on('value', (s) => {
        serverOffset = Number(s && s.val()) || 0;
      });
    } catch (e) {}
  }
  function sNow() {
    return Date.now() + serverOffset;
  }
  function deviceId() {
    try {
      return typeof getOrCreateDeviceId === 'function' ? String(getOrCreateDeviceId() || '') : '';
    } catch (e) {
      return '';
    }
  }
  function livePolicy(gameType) {
    const P = Policy();
    if (P) return P.policyFor(gameType);
    return { reconnectMs: PRESENCE_FORFEIT_MS, warnMs: PRESENCE_WARN_MS, heartbeatMs: PRESENCE_HEARTBEAT_MS, singleSeat: false, dualLeave: 'void_refund' };
  }
  function presenceState(p, pol) {
    const P = Policy();
    if (P) return P.reconnectStatus(p, sNow(), pol);
    const at = Number(p && p.at) || 0;
    const online = !p || p.online !== false;
    const offlineMs = !online && at ? Math.max(0, sNow() - at) : 0;
    return { online, offlineMs, warn: offlineMs >= pol.warnMs, msLeft: Math.max(0, pol.reconnectMs - offlineMs), expired: !online && offlineMs > pol.reconnectMs };
  }

  /** Default "opponent reconnecting 0:42" banner for games that don't paint their own. */
  function reconnectBanner(show, msLeft) {
    if (typeof document === 'undefined') return;
    let el = document.querySelector('[data-dangal-reconnect]');
    if (!show) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement('div');
      el.className = 'dangal-reconnect-banner';
      el.setAttribute('data-dangal-reconnect', '');
      el.setAttribute('role', 'status');
      (document.querySelector('.device') || document.body).appendChild(el);
    }
    const P = Policy();
    const t = typeof window.t === 'function' ? window.t : null;
    const label = (t && t('dangal.reconnecting')) || 'Opponent reconnecting';
    el.textContent = label + ' · ' + (P ? P.countdownText(msLeft) : Math.ceil(msLeft / 1000) + 's');
  }

  function liveNotice(msg) {
    if (typeof showToast === 'function') showToast(msg);
  }

  function isPersistableSeatUid(uid) {
    const u = String(uid || '').trim();
    if (!u || /^(ai|practice|random|you)$/i.test(u)) return false;
    if (typeof isPersistableUid === 'function' && !isPersistableUid(u)) return false;
    return true;
  }

  /** Party seats 3–6 (Scribble residual R2). Cap 6. Dedupes + drops invalid. */
  function normalizePartySeats(list) {
    const raw = Array.isArray(list) ? list : [];
    const out = [];
    const seen = new Set();
    raw.forEach((item) => {
      const uid =
        typeof item === 'string'
          ? String(item || '').trim()
          : String((item && (item.uid || item.id)) || '').trim();
      if (!uid || seen.has(uid) || !isPersistableSeatUid(uid)) return;
      seen.add(uid);
      out.push(uid);
    });
    return out.slice(0, 6);
  }

  function isLive(chat, launch) {
    const ctx = launch || window.__dangalLaunchCtx || {};
    if (ctx.mode === 'practice' || ctx.mode === 'daily') return false;
    if (ctx.practiceKind === 'vsAi' || ctx.practiceKind === 'solo') return false;
    if (ctx.opponentUid && /^(ai|practice|random)$/i.test(String(ctx.opponentUid))) return false;
    const mid = String((chat && chat.dangalMatchId) || ctx.matchId || '').trim();
    if (!mid) return false;
    const partySeats = normalizePartySeats(
      ctx.partySeats || (chat && chat.partySeats) || ctx.seats || null
    );
    // Party Live 3–6: matchId + ≥3 persistable seats including me.
    if (partySeats.length >= 3) {
      const me = typeof getCurrentUid === 'function' ? getCurrentUid() : '';
      if (!me || partySeats.indexOf(me) < 0) return false;
      return partySeats.length >= 3 && partySeats.length <= 6;
    }
    const opp =
      (typeof opponentUidFromChat === 'function' ? opponentUidFromChat(chat) : '') ||
      ctx.opponentUid ||
      '';
    if (!opp || /^(ai|practice|random)$/i.test(String(opp))) return false;
    if (typeof isPersistableUid === 'function' && !isPersistableUid(opp)) return false;
    return true;
  }

  function roles(chat, launch) {
    const ctx = launch || window.__dangalLaunchCtx || {};
    const me = typeof getCurrentUid === 'function' ? getCurrentUid() : '';
    const partySeats = normalizePartySeats(
      ctx.partySeats || (chat && chat.partySeats) || ctx.seats || null
    );
    const src = String(ctx.source || (chat && chat.dangalSource) || '');
    if (partySeats.length >= 3 && me && partySeats.indexOf(me) >= 0) {
      const hostUid = partySeats[0];
      const host = me === hostUid;
      const mySeat = partySeats.indexOf(me);
      const opp = partySeats.find((u) => u !== me) || '';
      return {
        me,
        opp,
        playerA: partySeats[0],
        playerB: partySeats[1],
        seats: partySeats.slice(),
        hostUid,
        host,
        mySeat,
        myColor: host ? 'w' : 'b',
        party: true,
      };
    }
    const opp =
      (typeof opponentUidFromChat === 'function' ? opponentUidFromChat(chat) : '') ||
      ctx.opponentUid ||
      '';
    // Acceptor (source === 'challenge') is guest; challenger / finder / host is host.
    const host = src !== 'challenge';
    const playerA = host ? me : opp;
    const playerB = host ? opp : me;
    return {
      me,
      opp,
      playerA,
      playerB,
      seats: playerA && playerB ? [playerA, playerB] : [],
      hostUid: playerA,
      host,
      mySeat: me === playerA ? 0 : 1,
      myColor: me === playerA ? 'w' : 'b',
      party: false,
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
    const seatList = normalizePartySeats(o.seats || o.partySeats || null);
    const partyOn = !!(o.party || seatList.length >= 3);
    let playerA = o.playerA;
    let playerB = o.playerB;
    if (seatList.length >= 2) {
      playerA = playerA || seatList[0];
      playerB = playerB || seatList[1];
    }
    const ref = rtdbRef('games/' + gameType + '/' + matchId);
    if (!ref || !matchId || !playerA || !playerB) return null;
    const me = o.me;
    const stake = Number(o.stake) || Number(window.__dangalLaunchCtx?.stake) || 0;
    watchServerOffset();
    const pol = livePolicy(gameType);
    const P = Policy();
    const PROTOCOL = P ? P.PROTOCOL : 1;
    const dev = deviceId();
    const now = sNow();
    let presenceWatch = null;
    let presenceHeartbeat = null;
    let visibilityHandler = null;
    let forfeited = false;
    let detached = false;
    let role = 'pending';
    let claimedRole = 'player';
    let versionBlocked = false;
    let voidNoticed = false;
    let houseNoticed = false;
    o.playerA = playerA;
    o.playerB = playerB;

    /** Variants lock when the match record is created; later joiners read the stored copy. */
    function lockedVariants() {
      const R = typeof window !== 'undefined' ? window.DangalRules : null;
      if (!R || !R.get(gameType)) return null;
      const ctx = Object.assign({}, window.__dangalLaunchCtx || {}, {
        ludoMode: o.ludoMode,
        timeControl: o.timeControl && o.timeControl.label ? o.timeControl.label : o.timeControl,
        variants: o.variants,
      });
      return Object.assign({}, R.lockVariants(gameType, R.fromLaunchCtx(gameType, ctx)).values);
    }

    function publishVariants(val) {
      if (!val || !val.variants) return;
      try {
        window.__dangalLiveVariants = Object.assign({}, window.__dangalLiveVariants || {}, { [gameType]: val.variants });
      } catch (e) {}
      const R = window.DangalRules;
      if (houseNoticed || !R) return;
      houseNoticed = true;
      const house = R.nonDefault(gameType, val.variants);
      if (house.length) liveNotice('House rules: ' + house.map((h) => h.text).join(' · '));
    }

    function bumpPresence(online) {
      if (!me || detached || role !== 'player') return;
      try {
        ref.child('presence/' + me).set({ at: sNow(), online: online !== false });
        if (dev && pol.singleSeat) ref.child('seats/' + me).set({ dev, at: sNow() });
      } catch (e) {}
    }

    function becomeSpectator(reason) {
      if (role === 'spectator') return;
      if (reason === 'version') versionBlocked = true;
      role = 'spectator';
      liveNotice(
        reason === 'version'
          ? 'Chaupaal updated — refresh to keep playing this match'
          : 'This match is open on another device — watching here'
      );
      if (typeof o.onSpectator === 'function') {
        try {
          o.onSpectator({ reason });
        } catch (e) {}
      }
    }

    function seedPlayersMap() {
      const players = {};
      if (seatList.length >= 2) {
        seatList.forEach((uid) => {
          players[uid] = true;
        });
      } else {
        players[playerA] = true;
        players[playerB] = true;
      }
      if (me) players[me] = true;
      return players;
    }

    ref.transaction((cur) => {
      if (cur) {
        if (P && pol.versionCheck !== false && P.versionMismatch(cur.protocol)) {
          versionBlocked = true;
          return;
        }
        versionBlocked = false;
        const prevMine = me && cur.presence ? cur.presence[me] : null;
        const claim = P && me && dev ? P.claimSeat(cur.seats && cur.seats[me], dev, now, pol) : { role: 'player', seat: dev ? { dev, at: now } : null };
        claimedRole = claim.role;
        if (claimedRole === 'spectator') return;
        const next = Object.assign({}, cur);
        next.protocol = cur.protocol || PROTOCOL;
        if (me && claim.seat && pol.singleSeat) next.seats = Object.assign({}, cur.seats || {}, { [me]: claim.seat });
        next.players = Object.assign({}, cur.players || {}, seedPlayersMap());
        next.presence = Object.assign({}, cur.presence || {});
        // Both players gone past the reconnect window → void + refund (stakes never moved).
        if (me && !partyOn && cur.status === 'playing' && prevMine && pol.dualLeave === 'void_refund') {
          const oppUid = me === cur.playerA ? cur.playerB : cur.playerA;
          const opp = presenceState(cur.presence && cur.presence[oppUid], pol);
          const mine = presenceState(prevMine, pol);
          if (opp.expired && mine.expired) {
            next.status = 'void';
            next.winner = null;
            next.voidReason = 'both_left';
          }
        }
        if (me) next.presence[me] = { at: now, online: true };
        if (!next.playerA) next.playerA = playerA;
        if (!next.playerB) next.playerB = playerB;
        if (partyOn && seatList.length >= 3 && !next.partySeats) {
          next.partySeats = seatList.slice();
          next.party = true;
        }
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
        // Seed cue/carrom balls once — guest must never reset the break cluster.
        const curHasCueBalls =
          cur.state && Array.isArray(cur.state.balls) && cur.state.balls.length > 0;
        if (o.state && Array.isArray(o.state.balls) && o.state.balls.length > 0 && !curHasCueBalls) {
          next.state = o.state;
        }
        // Seed Oh No! deal once — guest must never reshuffle over host.
        const curHasUno =
          cur.state &&
          (cur.state.dealt === true ||
            (Array.isArray(cur.state.discardPile) && cur.state.discardPile.length > 0));
        if (
          o.state &&
          (o.state.dealt === true ||
            (Array.isArray(o.state.handA) && Array.isArray(o.state.discardPile))) &&
          !curHasUno
        ) {
          next.state = o.state;
        }
        if (o.ludoMode && !cur.ludoMode) {
          next.ludoMode = o.ludoMode === 'quick' ? 'quick' : 'classic';
        }
        next.lastMoveAt = next.lastMoveAt || now;
        next.version = Number(next.version || next.seq) || 0;
        // Do not resurrect a finished match
        if (FINISHED.indexOf(cur.status) >= 0) {
          next.status = cur.status;
          next.winner = cur.winner || null;
        }
        return next;
      }
      const players = seedPlayersMap();
      const presence = {};
      Object.keys(players).forEach((uid) => {
        presence[uid] = { at: now, online: uid === me };
      });
      if (me) presence[me] = { at: now, online: true };
      return {
        playerA,
        playerB,
        players,
        presence,
        protocol: PROTOCOL,
        variants: lockedVariants(),
        seats: me && dev && pol.singleSeat ? { [me]: { dev, at: now } } : null,
        party: partyOn || undefined,
        partySeats: partyOn && seatList.length >= 3 ? seatList.slice() : undefined,
        turn: playerA,
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
    }).then(() => {
      if (versionBlocked) becomeSpectator('version');
      else if (claimedRole === 'spectator') becomeSpectator('device');
      else {
        role = 'player';
        bumpPresence(true);
      }
    }).catch(() => {
      if (role === 'pending') role = 'player';
    });

    let handler = null;
    const api = {
      ref,
      matchId,
      gameType,
      party: partyOn,
      seats: seatList.length >= 2 ? seatList.slice() : [playerA, playerB],
      policy: pol,
      get role() {
        return role;
      },
      get spectator() {
        return role === 'spectator';
      },
      serverNow: sNow,
      push(patch) {
        if (detached || role === 'spectator' || versionBlocked) return Promise.resolve(null);
        return ref.transaction((cur) => {
          if (!cur) return cur;
          const patchObj = patch || {};
          const curVer = Number(cur.version || cur.seq) || 0;
          if (patchObj.baseVersion != null && Number(patchObj.baseVersion) !== curVer) {
            // Stale move — abort transaction
            return;
          }
          // Finished matches: allow status/winner/presence only, not fen/state rewinds
          const finished = FINISHED.indexOf(cur.status) >= 0;

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
          next.updatedAt = sNow();
          next.lastMoveAt = sNow();
          if (me) {
            next.players = Object.assign({}, cur.players || {});
            next.players[me] = true;
            next.presence = Object.assign({}, cur.presence || {});
            next.presence[me] = { at: sNow(), online: true };
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
        // Party: soft out — match stays playing; game layer marks seat out + may continue.
        if (partyOn) {
          return api.push({
            status: 'playing',
            leftUid: me,
            partyLeave: true,
          });
        }
        const winner = me === playerA ? playerB : playerA;
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
              ref.child('presence/' + me).set({ at: sNow(), online: false });
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

    function presenceInfo(val) {
      const oppUid = me === val.playerA ? val.playerB : val.playerA;
      const p = (val.presence && val.presence[oppUid]) || {};
      const st = presenceState(p, pol);
      return {
        oppUid,
        online: st.online,
        at: Number(p.at) || 0,
        msOffline: st.offlineMs,
        warn: st.warn,
        forfeitSoon: !st.online && st.warn && !st.expired,
        forfeitMsLeft: st.msLeft,
        expired: st.expired,
      };
    }

    function reportPresence(info) {
      if (typeof o.onPresence === 'function') {
        try {
          o.onPresence(info);
        } catch (e) {}
      } else {
        reconnectBanner(!info.online && info.warn && !info.expired, info.forfeitMsLeft);
      }
    }

    if (typeof o.onSnap === 'function') {
      handler = ref.on('value', (snap) => {
        if (detached) return;
        try {
          const val = snap.val() || null;
          // Another device took this seat (reconnect window passed) → this one only watches.
          if (val && me && dev && role === 'player' && val.seats && val.seats[me] && val.seats[me].dev && val.seats[me].dev !== dev) {
            becomeSpectator('device');
          }
          publishVariants(val);
          if (val && val.status === 'void' && !voidNoticed) {
            voidNoticed = true;
            reconnectBanner(false);
            liveNotice('Both players left — match void, stakes returned');
          }
          o.onSnap(val, api);
          if (val && me && !partyOn && !detached && val.status === 'playing') reportPresence(presenceInfo(val));
          else reconnectBanner(false);
        } catch (e) {
          console.warn('[dangal-live]', e);
        }
      });
    }

    // Keep own presence fresh; a hidden tab / locked screen is a soft disconnect (online:false).
    if (me) {
      bumpPresence(true);
      presenceHeartbeat = setInterval(() => {
        if (detached || forfeited) return;
        bumpPresence(typeof document === 'undefined' || document.visibilityState !== 'hidden');
      }, pol.heartbeatMs || PRESENCE_HEARTBEAT_MS);
      visibilityHandler = () => {
        if (detached) return;
        bumpPresence(document.visibilityState !== 'hidden');
      };
      try {
        document.addEventListener('visibilitychange', visibilityHandler);
      } catch (e) {}
    }

    // Reconnect window (policy): dual only. Party leave is handled by the game (continue if ≥2).
    if (o.watchForfeit !== false && me && !partyOn) {
      presenceWatch = setInterval(() => {
        if (detached || forfeited || role !== 'player') return;
        ref.once('value', (snap) => {
          if (detached || forfeited) return;
          const val = snap.val();
          if (!val || val.status !== 'playing') return;
          const info = presenceInfo(val);
          if (!info.online && info.warn) reportPresence(info);
          if (info.expired) {
            forfeited = true;
            reconnectBanner(false);
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
  function modeChromeLabel(liveOn, practiceLabel, optsLabel) {
    if (liveOn) {
      if (optsLabel && optsLabel.party) return 'Live party';
      return 'Live 1v1';
    }
    if (optsLabel && optsLabel.solo) return 'Practice · Solo';
    const launch =
      typeof window !== 'undefined' && window.__dangalLaunchCtx ? window.__dangalLaunchCtx : null;
    if (launch && launch.practiceKind === 'solo' && !practiceLabel) return 'Practice · Solo';
    if (!practiceLabel) return 'Practice vs AI';
    const pl = String(practiceLabel);
    if (/^solo$/i.test(pl)) return 'Practice · Solo';
    return 'Practice · ' + pl;
  }

  /** Confirm leave; forfeit Live match if still playing. Returns true if left. */
  async function requestLeave(opts) {
    const o = opts || {};
    const playing = o.isPlaying !== false;
    const live = !!(o.live || o.liveHandle);
    const party = !!(o.party || (o.liveHandle && o.liveHandle.party));
    if (typeof confirmLeaveGame === 'function') {
      const ok = await confirmLeaveGame({
        title: o.title || 'Leave game?',
        body:
          live && playing
            ? o.forfeitBody ||
              (party
                ? 'You’ll leave this party — the match continues if 2+ players remain.'
                : 'Leaving now counts as a forfeit for your opponent.')
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
    normalizePartySeats,
    policyFor: livePolicy,
    serverNow: sNow,
    PRESENCE_FORFEIT_MS,
    PRESENCE_WARN_MS,
    QUIZ_SEED_TIMEOUT_MS,
  };
})();
