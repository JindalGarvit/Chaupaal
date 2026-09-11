/**
 * RW Sports — Street Cricket + Gully Kick (football-style).
 * Trademark-safe names; Street Cricket Live v1 (Over/Nets/Chase · bowl↔bat · stakes).
 */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function closeOverlay(overlay) {
    if (!overlay) return;
    if (typeof animateGameExit === 'function') {
      animateGameExit(overlay, () => overlay.remove());
    } else {
      overlay.remove();
    }
    try {
      if (typeof restoreAppShell === 'function') restoreAppShell('rw_sports_close');
    } catch (e) {}
  }

  function resolveRwChat(arg) {
    if (typeof chatFromLaunch === 'function' && arg != null) {
      const from = chatFromLaunch(arg);
      if (from && (from.name || from.dangalMatchId || from.uid || from.opponentUid || from.peerUid)) {
        return from;
      }
    }
    if (arg && arg.chat) return resolveRwChat(arg.chat);
    if (arg && (arg.name || arg.dangalMatchId || arg.uid || arg.opponentUid || arg.peerUid)) return arg;
    const ctx = window.__dangalLaunchCtx || {};
    return Object.assign(
      { name: 'Opponent' },
      ctx.chat || {},
      {
        dangalMatchId: ctx.matchId || undefined,
        opponentUid: ctx.opponentUid || undefined,
        uid: ctx.opponentUid || undefined,
        dangalSource: ctx.source || undefined,
      }
    );
  }

  function chatLiveOn(chat) {
    return typeof DangalLive !== 'undefined' && DangalLive.isLive && DangalLive.isLive(chat);
  }

  function matchIdFor(chat, gameType) {
    return (
      (chat && chat.dangalMatchId) ||
      (window.__dangalLaunchCtx && window.__dangalLaunchCtx.matchId) ||
      (typeof dangalMatchId === 'function' ? dangalMatchId(gameType, chat) : gameType + '_' + Date.now())
    );
  }

  function liveChromeSub() {
    if (typeof DangalLive !== 'undefined' && DangalLive.modeChromeLabel) {
      return DangalLive.modeChromeLabel(true);
    }
    return 'Live 1v1';
  }

  function mountSportsShell(opts) {
    const o = opts || {};
    const overlay = document.createElement('div');
    overlay.className = 'game-overlay game-overlay--light rw-sports-overlay';
    overlay.dataset.gameId = o.gameId || '';
    const practiceSub =
      typeof DangalLive !== 'undefined' && DangalLive.modeChromeLabel
        ? DangalLive.modeChromeLabel(false, 'solo')
        : 'Practice';
    const chromeSub = o.subtitle != null ? o.subtitle : practiceSub;
    const leaveShell = {
      gameOver: false,
      liveHandle: o.liveHandle || null,
      markOver() {
        this.gameOver = true;
      },
      close() {
        dismiss();
      },
    };
    overlay.innerHTML =
      typeof gameChromeHtml === 'function'
        ? gameChromeHtml({
            title: o.title || 'RW Sports',
            subtitle: chromeSub,
            backId: 'rwSportsBack',
            pauseId: o.pauseId || 'rwSportsPause',
          }) + `<div class="rw-sports-body" data-rw-body></div>`
        : `
      <div class="game-chrome">
        ${typeof backButtonHtml==='function'?backButtonHtml({ className: 'game-back-btn', label: 'Close', attrs: 'data-rw-close' }):'<button type="button" class="game-back-btn cp-back-btn" data-rw-close aria-label="Close"></button>'}
        <div class="game-chrome-title">${esc(o.title || 'RW Sports')}</div>
        <div class="game-chrome-sub" style="font-size:11px;color:var(--muted);">${esc(chromeSub)}</div>
        <button type="button" id="${esc(o.pauseId || 'rwSportsPause')}" class="game-chrome-action game-tap-target" aria-label="Pause">⏸</button>
      </div>
      <div class="rw-sports-body" data-rw-body></div>`;
    const begin = typeof beginGameOverlaySession === 'function' ? beginGameOverlaySession : null;
    const gs = begin
      ? begin({
          type: o.gameId,
          title: o.title || o.gameId,
          mode: o.live ? 'live' : 'solo',
          overlay,
          cleanup: o.onClose,
        })
      : null;
    if (begin && (!gs || !gs.alive())) {
      leaveShell.close = () => {};
      return {
        overlay,
        body: null,
        dismiss() {},
        gs: null,
        pauseBtnId: o.pauseId || 'rwSportsPause',
        leaveShell,
      };
    }
    if (!begin) {
      const device = document.querySelector('.device') || document.body;
      device.appendChild(overlay);
    }
    if (typeof prepareGameOverlay === 'function') {
      prepareGameOverlay(overlay, { theme: 'light', gameId: o.gameId, accent: o.accent });
    }
    const dismiss = () => {
      if (gs) gs.close('dismissed');
      else closeOverlay(overlay);
    };
    leaveShell.close = () => dismiss();
    const onBack = async () => {
      const playing =
        typeof o.isPlaying === 'function' ? !!o.isPlaying() : !leaveShell.gameOver;
      if (typeof leaveGameShell === 'function') {
        await leaveGameShell(leaveShell, {
          live: !!o.live || !!leaveShell.liveHandle,
          liveHandle: leaveShell.liveHandle,
          isPlaying: playing,
          title: 'Leave ' + (o.title || 'practice') + '?',
          body: o.leaveBody || 'This practice run will end.',
          forfeitBody: 'Leaving now counts as a forfeit for your opponent.',
        });
        return;
      }
      if (typeof confirmLeaveGame === 'function') {
        const leave = await confirmLeaveGame({
          title: 'Leave ' + (o.title || 'practice') + '?',
          body:
            o.live && playing
              ? 'Leaving now counts as a forfeit for your opponent.'
              : o.leaveBody || 'This practice run will end.',
        });
        if (!leave) return;
      }
      dismiss();
    };
    overlay.querySelector('[data-rw-close]')?.addEventListener('click', onBack);
    overlay.querySelector('#rwSportsBack')?.addEventListener('click', onBack);
    return {
      overlay,
      body: overlay.querySelector('[data-rw-body]'),
      dismiss,
      gs,
      pauseBtnId: o.pauseId || 'rwSportsPause',
      leaveShell,
    };
  }

  function rwRoleBanner(mode, label, sub) {
    if (typeof gameTurnBannerHtml === 'function') {
      return gameTurnBannerHtml({
        mode: mode || 'yours',
        label: label || '',
        sub: sub || undefined,
        pulse: mode === 'yours',
      });
    }
    return (
      '<p class="rw-sports-hint" role="status">' +
      esc(label || '') +
      (sub ? ' · ' + esc(sub) : '') +
      '</p>'
    );
  }

  function flashOutcome(body, text, kind) {
    const el = body?.querySelector('[data-rw-outcome]');
    if (!el) return;
    el.textContent = text;
    el.className = `rw-sports-outcome is-show${kind ? ` is-${kind}` : ''}`;
    if (flashOutcome._t) clearTimeout(flashOutcome._t);
    flashOutcome._t = setTimeout(() => {
      flashOutcome._t = 0;
      el.classList.remove('is-show');
    }, 900);
  }

  function clearFlashOutcome() {
    if (flashOutcome._t) {
      clearTimeout(flashOutcome._t);
      flashOutcome._t = 0;
    }
  }

  function finishPractice(gameId, score, body, opts) {
    const o = opts || {};
    const pbId = o.pbGameId || gameId;
    const vsBest =
      o.vsBest != null
        ? o.vsBest
        : typeof formatVsBest === 'function'
          ? formatVsBest(pbId, score)
          : `Best ${score}${o.unit || ''}`;
    let best = score;
    if (o.updatePb !== false && typeof setGamePB === 'function') {
      best = setGamePB(pbId, score) ?? score;
    }
    if (typeof o.onAfterPb === 'function') {
      try {
        o.onAfterPb({ score, best, pbId });
      } catch (e) {}
    }
    if (typeof recordGameResult === 'function') {
      recordGameResult(
        gameId,
        !!o.won,
        false,
        Object.assign({ score, scoreOnly: true }, o.recordExtra || {})
      );
    } else if (typeof markGamePlayed === 'function') {
      markGamePlayed(gameId);
    }
    if (o.gs && typeof o.gs.setOutcome === 'function') o.gs.setOutcome('complete');
    if (typeof gameFeedback === 'function') gameFeedback('complete');
    const shareStats = {
      scoreLine: o.scoreLine || String(score),
      score,
      meta: vsBest || `Best ${best}${o.unit || ''}`,
      text: o.shareText || `I scored ${score} on Chaupaal ${o.title || gameId}!`,
    };
    const shareCard =
      typeof buildGameShareCard === 'function' ? buildGameShareCard(gameId, shareStats) : '';
    const actions =
      Array.isArray(o.actions) && o.actions.length
        ? o.actions
        : [
            { label: o.againLabel || 'Play again', primary: true, id: 'again' },
            { label: 'Share', primary: false, id: 'share' },
          ];
    if (typeof gameResultHtml === 'function') {
      body.innerHTML = gameResultHtml({
        gameId,
        glyph: o.glyph || '·',
        title: o.resultTitle || 'Practice over',
        subtitle: o.subtitle || '',
        vsBest: o.hideVsBest ? '' : vsBest,
        scoreHtml: o.scoreHtml || '',
        shareCardHtml: shareCard,
        challenge: false,
        hideStats: !!o.hideStats,
        hideMissions: !!o.hideMissions,
        actions,
      });
      if (typeof wireGameResultActions === 'function') {
        const handlers = {
          again: () => {
            if (typeof o.onAgain === 'function') o.onAgain();
          },
          share: () => {
            if (typeof shareGameResult === 'function') shareGameResult(gameId, shareStats);
          },
        };
        if (typeof o.onChangeFormat === 'function') {
          handlers.changeFormat = () => o.onChangeFormat();
        }
        wireGameResultActions(body, handlers);
      }
      return;
    }
    body.innerHTML = `
      <div class="rw-sports-card">
        <h2>${esc(o.resultTitle || 'Practice over')}</h2>
        <p class="rw-sports-score">${esc(o.subtitle || String(score))}</p>
        ${o.scoreHtml || ''}
        <p class="rw-sports-hint">${esc(vsBest)}</p>
        <button type="button" class="btn btn--primary" data-rw-again>${esc(o.againLabel || 'Play again')}</button>
        ${
          typeof o.onChangeFormat === 'function'
            ? '<button type="button" class="btn" data-rw-change-format>Change format</button>'
            : ''
        }
      </div>`;
    body.querySelector('[data-rw-again]')?.addEventListener('click', () => {
      if (typeof o.onAgain === 'function') o.onAgain();
    });
    body.querySelector('[data-rw-change-format]')?.addEventListener('click', () => {
      if (typeof o.onChangeFormat === 'function') o.onChangeFormat();
    });
  }

  /** Street Cricket — Practice + Live Over/Nets/Chase with stakes (Prompt 3/3 · Live v1). */
  function openStreetCricket(chatArg) {
    const chat = resolveRwChat(chatArg);
    const liveOn = chatLiveOn(chat);
    const liveStake = liveOn
      ? Number(
          (chat && chat.stake) != null
            ? chat.stake
            : (window.__dangalLaunchCtx && window.__dangalLaunchCtx.stake) || 0
        ) || 0
      : 0;
    const settleMatchId = liveOn ? String(matchIdFor(chat, 'streetcricket') || '').trim() : '';
    let settleOppUid = '';
    let settleDone = false;
    let resultReported = false;
    let resultShown = false;
    let stakeSettleNote = '';
    let runs = 0;
    let balls = 0;
    let wickets = 0;
    let perfects = 0;
    let phase = 'pick'; // pick | wait | idle | runup | flight | result | done
    let bowlTimer = null;
    let missTimer = null;
    let resultTimer = null;
    let bowlLockTimer = null;
    let lastOutcome = '';
    let deliveryStartedAt = 0;
    let deliveryMeta = null;
    let overSeed = (Date.now() ^ (Math.random() * 0xffff)) >>> 0;
    let lastDeliveryId = '';
    let streakSame = 0;
    let coachShown = false;
    let armedShot = 'push';
    let armedDelivery = 'medium';
    let lastBall = null;
    const ballLog = [];
    let formatId = 'over';
    let maxBalls = 6;
    let maxWickets = 2;
    let chaseTarget = 0;
    let endReason = '';
    let sessionWon = false;
    let matchDraw = false;
    let matchWinnerUid = '';
    let liveRoles = null;
    let liveHandle = null;
    let leaveShell = null;
    let eventSeq = 0;
    let appliedSeq = 0;
    let applying = false;
    let batUid = '';
    let bowlUid = '';
    let inningsIndex = 1;
    let innings1 = null;
    let innings2 = null;
    let peerPaused = false;
    let ended = false;
    const FORMAT_KEY = 'chaupaal_sc_format_v4';
    const COACH_KEY = 'chaupaal_sc_coach_v3';
    const BOWL_LOCK_MS = 420;
    let rematchFormatHint = '';
    try {
      const ctx = window.__dangalLaunchCtx || {};
      if (ctx.rematchFormatId) rematchFormatHint = String(ctx.rematchFormatId);
    } catch (e) {}

    const FORMATS = {
      over: {
        id: 'over',
        label: 'Gully Over',
        blurb: '6 balls · 2 wickets — score big',
        maxBalls: 6,
        maxWickets: 2,
      },
      nets: {
        id: 'nets',
        label: 'Nets',
        blurb: '12 balls · 3 wickets — survive & time',
        maxBalls: 12,
        maxWickets: 3,
      },
      chase: {
        id: 'chase',
        label: 'Chase',
        blurb: 'Practice: rolled target · Live: 1st innings sets chase (+1)',
        maxBalls: 6,
        maxWickets: 2,
      },
    };

    const SHOTS = {
      defend: { id: 'defend', label: 'Defend' },
      push: { id: 'push', label: 'Push' },
      loft: { id: 'loft', label: 'Loft' },
    };

    const DELIVERY_TYPES = {
      medium: {
        id: 'medium',
        label: 'Medium',
        family: 'pace',
        runupMs: 420,
        flightMs: 1000,
        zoneStart: 0.4,
        zoneEnd: 0.68,
        lateEnd: 0.94,
        path: 'straight',
        accent: '#81C784',
        mistimeHint: 'Mistimed the ball',
      },
      quick: {
        id: 'quick',
        label: 'Quick',
        family: 'pace',
        runupMs: 260,
        flightMs: 700,
        zoneStart: 0.5,
        zoneEnd: 0.64,
        lateEnd: 0.9,
        path: 'skiddy',
        accent: '#EF5350',
        mistimeHint: 'Beaten for pace',
      },
      flight: {
        id: 'flight',
        label: 'Flight',
        family: 'length',
        runupMs: 560,
        flightMs: 1280,
        zoneStart: 0.5,
        zoneEnd: 0.78,
        lateEnd: 0.96,
        path: 'loopy',
        accent: '#42A5F5',
        mistimeHint: 'Through the flight',
      },
      spin: {
        id: 'spin',
        label: 'Spin',
        family: 'spin',
        runupMs: 500,
        flightMs: 1120,
        zoneStart: 0.46,
        zoneEnd: 0.72,
        lateEnd: 0.95,
        path: 'curve',
        accent: '#AB47BC',
        mistimeHint: 'Turned past the bat',
      },
    };

    const cloneDelivery = (type) => {
      const d = DELIVERY_TYPES[type] || DELIVERY_TYPES.medium;
      return Object.assign({}, d, { durationMs: d.runupMs + d.flightMs });
    };

    const mulberry32 = (a) => () => {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const loadSavedFormat = () => {
      try {
        const v = localStorage.getItem(FORMAT_KEY);
        if (v && FORMATS[v]) return v;
      } catch (e) {}
      return 'over';
    };

    const saveFormat = (id) => {
      try {
        localStorage.setItem(FORMAT_KEY, id);
      } catch (e) {}
    };

    const fmt = () => FORMATS[formatId] || FORMATS.over;

    const rollChaseTarget = () => {
      const rnd = mulberry32(overSeed + 41);
      return 16 + Math.floor(rnd() * 7); // 16–22
    };

    const beginSession = () => {
      const f = fmt();
      maxBalls = f.maxBalls;
      maxWickets = f.maxWickets;
      // Live duel: chase target set after innings 1. Practice chase still rolls.
      chaseTarget = !liveOn && formatId === 'chase' ? rollChaseTarget() : 0;
      runs = 0;
      balls = 0;
      wickets = 0;
      perfects = 0;
      endReason = '';
      sessionWon = false;
      matchDraw = false;
      matchWinnerUid = '';
      lastOutcome = '';
      lastBall = null;
      ballLog.length = 0;
      deliveryMeta = null;
      deliveryStartedAt = 0;
      lastDeliveryId = '';
      streakSame = 0;
      overSeed = (Date.now() ^ (Math.random() * 0xffff)) >>> 0;
      armedShot = 'push';
      armedDelivery = 'medium';
      ended = false;
      inningsIndex = 1;
      innings1 = null;
      innings2 = null;
      if (liveOn && liveRoles) {
        batUid = liveRoles.playerA || batUid;
        bowlUid = liveRoles.playerB || bowlUid;
      }
      setModeChrome(f.label);
    };

    const iAmHost = () => {
      if (!liveOn) return true;
      if (!liveRoles) return false;
      if (liveRoles.host != null) return !!liveRoles.host;
      return liveRoles.me === liveRoles.playerA;
    };

    const iAmBat = () => {
      if (!liveOn) return true;
      if (!liveRoles) return false;
      return liveRoles.me === (batUid || liveRoles.playerA);
    };

    const iAmBowl = () => {
      if (!liveOn) return false;
      if (!liveRoles) return false;
      return liveRoles.me === (bowlUid || liveRoles.playerB);
    };

    /** @deprecated alias — bat seat for Practice-compatible call sites */
    const iAmBatAuthority = () => iAmBat();

    const clearBowlLock = () => {
      if (bowlLockTimer) {
        clearTimeout(bowlLockTimer);
        bowlLockTimer = null;
      }
    };

    const setModeChrome = (formatLabel) => {
      const fLabel = formatLabel || (fmt() && fmt().label) || 'Street Cricket';
      if (liveOn) {
        const seat = iAmBat() ? 'Batter' : iAmBowl() ? 'Bowler' : 'Live';
        const inn =
          inningsIndex === 2 ? ' · 2nd innings' : inningsIndex === 1 ? ' · 1st innings' : '';
        const stakeBit =
          liveStake > 0 ? ' · Stake ⚡' + liveStake + ' (virtual)' : ' · Friendly';
        setChromeSub(liveChromeSub() + stakeBit + ' · ' + fLabel + ' · ' + seat + inn);
      } else {
        setChromeSub('Practice · ' + fLabel + ' · Batter');
      }
    };

    const freshRematch = () => {
      if (!liveOn) {
        reset();
        return;
      }
      try {
        const mid =
          typeof dangalMatchId === 'function'
            ? dangalMatchId('streetcricket', chat)
            : 'streetcricket_' + Date.now();
        if (window.__dangalLaunchCtx) {
          window.__dangalLaunchCtx = Object.assign({}, window.__dangalLaunchCtx, {
            matchId: mid,
            gameId: 'streetcricket',
            gameType: 'streetcricket',
            stake: liveStake,
            rematchFormatId: formatId,
          });
        }
        if (chat) {
          chat.dangalMatchId = mid;
          chat.stake = liveStake;
        }
      } catch (e) {}
      openStreetCricket(chat);
    };

    const reportStreetResult = (won, isDraw, path) => {
      if (resultReported) return;
      resultReported = true;
      if (typeof recordGameResult === 'function') {
        try {
          recordGameResult('streetcricket', !!won && !isDraw, !!isDraw, {
            live: !!liveOn,
            stake: liveStake,
            mode: liveOn ? 'live' : 'practice',
            path: path || '',
            formatId,
            score: runs,
          });
        } catch (e) {}
      }
    };

    const settleStreetOnce = async (won, isDraw) => {
      if (!liveOn || settleDone) return null;
      if (!settleMatchId || liveStake <= 0) {
        settleDone = true;
        return null;
      }
      if (!window.DangalEconomy || typeof DangalEconomy.reportGameEnd !== 'function') {
        settleDone = true;
        return null;
      }
      settleDone = true;
      try {
        const me = typeof getCurrentUid === 'function' ? getCurrentUid() : '';
        const oppU = settleOppUid || (liveRoles && liveRoles.opp) || '';
        return await DangalEconomy.reportGameEnd({
          gameType: 'streetcricket',
          result: isDraw ? 'draw' : won ? 'win' : 'loss',
          won: !!won && !isDraw,
          isDraw: !!isDraw,
          matchId: settleMatchId,
          sessionId: settleMatchId,
          opponentUid: oppU,
          stake: liveStake,
          winnerUid: isDraw ? null : won ? me : oppU,
        });
      } catch (e) {
        settleDone = false;
        return null;
      }
    };

    /** Idempotent Live end: settle once, then show result chrome. */
    const showLiveDone = (opts) => {
      const o = opts || {};
      if (resultShown) return;
      resultShown = true;
      phase = 'done';
      ended = true;
      if (leaveShell) leaveShell.gameOver = true;
      if (liveRoles && liveRoles.opp) settleOppUid = liveRoles.opp;
      const forfeit = !!o.forfeit || endReason === 'forfeit';
      const draw = !forfeit && !!matchDraw;
      const won = forfeit ? !!o.iWon : !!sessionWon;
      if (forfeit) {
        sessionWon = !!won;
        matchDraw = false;
        matchWinnerUid = won
          ? (liveRoles && liveRoles.me) || ''
          : (liveRoles && liveRoles.opp) || '';
        endReason = 'forfeit';
      }
      reportStreetResult(won, draw, o.path || endReason || '');
      settleStreetOnce(won, draw).then((settle) => {
        stakeSettleNote = '';
        if (liveOn && liveStake > 0) {
          const cd = settle && settle.chipDelta != null ? Number(settle.chipDelta) : null;
          stakeSettleNote =
            Number.isFinite(cd) && cd !== 0
              ? 'Stake ' + (cd > 0 ? '+' : '') + cd + ' virtual'
              : 'Virtual stakes · not real money';
        }
        if (typeof gameFeedback === 'function' && !o.skipFeedback) {
          gameFeedback(draw ? 'complete' : won ? 'win' : 'lose');
        }
        render();
      });
    };

    const snapshotInnings = (reason) => ({
      batUid,
      bowlUid,
      runs,
      wickets,
      balls,
      perfects,
      chaseTarget,
      endReason: reason || endReason,
      ballLog: ballLog.slice(),
    });

    const compareMatch = () => {
      const a = innings1;
      const b = innings2;
      if (!a || !b || !liveRoles) {
        return { winnerUid: '', draw: true, reason: 'balls', iWon: false };
      }
      let winnerUid = '';
      let draw = false;
      let reason = 'runs';
      if (formatId === 'chase') {
        const target = (a.runs | 0) + 1;
        if ((b.runs | 0) >= target) {
          winnerUid = b.batUid;
          reason = 'chase_won';
        } else {
          winnerUid = a.batUid;
          reason = 'defend';
        }
      } else if (formatId === 'nets') {
        const pa = a.perfects | 0;
        const pb = b.perfects | 0;
        if (pa !== pb) {
          winnerUid = pa > pb ? a.batUid : b.batUid;
          reason = 'perfects';
        } else if ((a.runs | 0) !== (b.runs | 0)) {
          winnerUid = (a.runs | 0) > (b.runs | 0) ? a.batUid : b.batUid;
          reason = 'runs';
        } else {
          draw = true;
          reason = 'draw';
        }
      } else if ((a.runs | 0) !== (b.runs | 0)) {
        winnerUid = (a.runs | 0) > (b.runs | 0) ? a.batUid : b.batUid;
        reason = 'runs';
      } else {
        draw = true;
        reason = 'draw';
      }
      const iWon = !draw && winnerUid === liveRoles.me;
      return { winnerUid, draw, reason, iWon };
    };

    const beginSecondInnings = (firstSnap) => {
      innings1 = firstSnap;
      innings2 = null;
      const prevBat = batUid;
      batUid = bowlUid;
      bowlUid = prevBat;
      inningsIndex = 2;
      runs = 0;
      balls = 0;
      wickets = 0;
      perfects = 0;
      ballLog.length = 0;
      lastBall = null;
      deliveryMeta = null;
      deliveryStartedAt = 0;
      endReason = '';
      sessionWon = false;
      matchDraw = false;
      matchWinnerUid = '';
      armedShot = 'push';
      armedDelivery = 'medium';
      overSeed = (Date.now() ^ (Math.random() * 0xffff)) >>> 0;
      if (formatId === 'chase') {
        chaseTarget = (firstSnap.runs | 0) + 1;
        lastOutcome =
          'Innings break — chase ' + chaseTarget + '. Roles swapped.';
      } else {
        chaseTarget = 0;
        lastOutcome = 'Innings break — roles swapped. You’re up.';
      }
      phase = 'idle';
      setModeChrome();
    };

    const finishMatchFromSecond = (secondSnap) => {
      innings2 = secondSnap;
      const cmp = compareMatch();
      matchWinnerUid = cmp.winnerUid || '';
      matchDraw = !!cmp.draw;
      sessionWon = !!cmp.iWon;
      endReason = cmp.reason || 'balls';
      // settle + result chrome via showLiveDone (caller still pushLive)
    };

    const buildLiveState = (extra) =>
      Object.assign(
        {
          formatId,
          overSeed,
          chaseTarget,
          maxBalls,
          maxWickets,
          runs,
          wickets,
          balls,
          perfects,
          phase,
          armedShot,
          armedDelivery,
          delivery: deliveryMeta
            ? {
                id: deliveryMeta.id,
                label: deliveryMeta.label,
                runupMs: deliveryMeta.runupMs,
                flightMs: deliveryMeta.flightMs,
                zoneStart: deliveryMeta.zoneStart,
                zoneEnd: deliveryMeta.zoneEnd,
                lateEnd: deliveryMeta.lateEnd,
                path: deliveryMeta.path,
                accent: deliveryMeta.accent,
              }
            : null,
          deliveryStartedAt,
          lastOutcome,
          lastBall,
          ballLog: ballLog.slice(-16),
          batUid: batUid || (liveRoles && liveRoles.playerA) || '',
          bowlUid: bowlUid || (liveRoles && liveRoles.playerB) || '',
          inningsIndex,
          innings1,
          innings2,
          matchWinnerUid,
          matchDraw,
          eventSeq,
          endReason,
          sessionWon,
          stake: liveStake,
          paused: !!(pauseCtrl && pauseCtrl.isPaused && pauseCtrl.isPaused()),
        },
        extra || {}
      );

    /**
     * @param {object} [extra]
     * @param {{ as?: 'bat'|'bowl'|'host'|'any', status?: string }} [top]
     */
    const pushLive = (extra, top) => {
      if (!liveOn || !liveHandle || applying || !liveRoles) return;
      const as = (top && top.as) || 'any';
      if (as === 'bat' && !iAmBat()) return;
      if (as === 'bowl' && !iAmBowl()) return;
      if (as === 'host' && !iAmHost()) return;
      eventSeq += 1;
      const st = buildLiveState(extra);
      st.eventSeq = eventSeq;
      appliedSeq = Math.max(appliedSeq, eventSeq);
      const status =
        phase === 'done' || ended ? 'over' : (top && top.status) || 'playing';
      const turn =
        phase === 'idle' || phase === 'pick' || phase === 'wait'
          ? bowlUid || liveRoles.playerB
          : phase === 'flight' || phase === 'runup'
            ? batUid || liveRoles.playerA
            : batUid || liveRoles.playerA;
      try {
        liveHandle.push(
          Object.assign(
            {
              status,
              turn,
              winner: status === 'over' && !matchDraw ? matchWinnerUid || null : undefined,
              state: st,
            },
            top || {}
          )
        );
      } catch (e) {}
    };

    /** Format-aware bag: nets teachable; chase/over spicier later. */
    const pickDelivery = () => {
      const rnd = mulberry32(overSeed + balls * 97 + 13);
      const r = rnd();
      let pool;
      if (formatId === 'nets') {
        if (balls <= 3) {
          pool = r < 0.7 ? ['medium', 'medium', 'flight'] : ['medium', 'flight', 'spin'];
        } else if (balls <= 7) {
          pool =
            r < 0.45
              ? ['medium', 'flight', 'spin']
              : r < 0.75
                ? ['flight', 'medium', 'quick']
                : ['spin', 'medium', 'flight'];
        } else {
          pool =
            r < 0.4
              ? ['medium', 'quick', 'flight']
              : r < 0.7
                ? ['spin', 'flight', 'medium']
                : ['quick', 'spin', 'medium'];
        }
      } else if (formatId === 'chase') {
        if (balls <= 1) {
          pool = r < 0.5 ? ['medium', 'flight', 'medium'] : ['medium', 'quick', 'flight'];
        } else if (balls <= 3) {
          pool =
            r < 0.35
              ? ['quick', 'medium', 'flight']
              : r < 0.7
                ? ['spin', 'flight', 'medium']
                : ['quick', 'spin', 'flight'];
        } else {
          pool =
            r < 0.4
              ? ['quick', 'spin', 'flight']
              : r < 0.7
                ? ['spin', 'quick', 'medium']
                : ['flight', 'quick', 'spin'];
        }
      } else if (balls <= 1) {
        pool =
          r < 0.55
            ? ['medium', 'medium', 'flight']
            : r < 0.85
              ? ['medium', 'flight', 'spin']
              : ['medium', 'quick', 'flight'];
      } else if (balls <= 3) {
        pool =
          r < 0.35
            ? ['medium', 'flight', 'spin']
            : r < 0.7
              ? ['quick', 'medium', 'flight']
              : ['spin', 'flight', 'medium'];
      } else {
        pool =
          r < 0.3
            ? ['quick', 'spin', 'flight']
            : r < 0.6
              ? ['spin', 'quick', 'medium']
              : ['flight', 'quick', 'spin'];
      }
      let id = pool[Math.floor(rnd() * pool.length)] || 'medium';
      if (id === lastDeliveryId && streakSame >= 1 && (id === 'quick' || id === 'spin')) {
        const soft = pool.find((x) => x === 'medium' || x === 'flight') || 'medium';
        id = soft;
      }
      if (id === lastDeliveryId) streakSame += 1;
      else {
        lastDeliveryId = id;
        streakSame = 1;
      }
      return cloneDelivery(id);
    };

    const pickWeighted = (entries, roll) => {
      let acc = 0;
      for (let i = 0; i < entries.length; i++) {
        acc += entries[i][0];
        if (roll < acc) return entries[i][1];
      }
      return entries[entries.length - 1][1];
    };

    /**
     * Explicit resolver: timing × shot × delivery → runs/out.
     * Light street variance only inside weighted buckets — never defend-six like loft.
     */
    const resolveStreetBall = (delivery, timing, shotId) => {
      const del = delivery || DELIVERY_TYPES.medium;
      const shot = SHOTS[shotId] || SHOTS.push;
      const dLabel = del.label || 'Medium';
      const sLabel = shot.label;
      const roll = Math.random();
      const out = (reason, code, label) => ({
        runs: 0,
        out: true,
        reason,
        code,
        label,
        shotId: shot.id,
        deliveryId: del.id,
        timing,
      });
      const ok = (runsVal, reason, code, label) => ({
        runs: runsVal,
        out: false,
        reason,
        code,
        label,
        shotId: shot.id,
        deliveryId: del.id,
        timing,
      });

      if (timing === 'miss') {
        const hint = del.mistimeHint || 'Mistimed the ball';
        return out(
          'beaten',
          'miss_window',
          `Out! ${hint} — left the ${dLabel}`
        );
      }

      // —— Defend: safe floor, capped upside ——
      if (shot.id === 'defend') {
        if (timing === 'perfect') {
          if (roll < 0.03) {
            return out(
              'caught',
              'defend_perfect_catch',
              `Caught — soft hands popped the ${dLabel}`
            );
          }
          const runsVal = pickWeighted(
            [
              [0.45, 0],
              [0.45, 1],
              [0.1, 2],
            ],
            (roll - 0.03) / 0.97
          );
          return ok(
            runsVal,
            runsVal === 0 ? 'dot' : 'nudge',
            'defend_perfect',
            runsVal === 0
              ? `Defend · ${dLabel} — solid block`
              : `Defend · ${dLabel} — ${runsVal} run${runsVal === 1 ? '' : 's'}`
          );
        }
        if (timing === 'early') {
          const outP = del.id === 'quick' ? 0.18 : del.id === 'spin' ? 0.22 : 0.14;
          if (roll < outP) {
            return out(
              'edge',
              'defend_early_edge',
              `Mistimed edge — Defend early vs ${dLabel}`
            );
          }
          return ok(
            roll < outP + 0.55 ? 0 : 1,
            'nudge',
            'defend_early',
            `Defend early · ${dLabel} — kept out`
          );
        }
        // late
        const lateOut = del.id === 'quick' ? 0.22 : 0.16;
        if (roll < lateOut) {
          return out(
            'bowled',
            'defend_late_bowled',
            `Bowled — Defend late, ${dLabel} sneaked through`
          );
        }
        return ok(
          0,
          'dot',
          'defend_late',
          `Defend late · ${dLabel} — jammed the bat down`
        );
      }

      // —— Push: singles machine ——
      if (shot.id === 'push') {
        if (timing === 'perfect') {
          if (roll < 0.05) {
            return out(
              'caught',
              'push_perfect_catch',
              `Caught — Push popped up vs ${dLabel}`
            );
          }
          const r2 = (roll - 0.05) / 0.95;
          const runsVal = pickWeighted(
            [
              [0.12, 0],
              [0.48, 1],
              [0.28, 2],
              [0.12, 4],
            ],
            r2
          );
          return ok(
            runsVal,
            runsVal >= 4 ? 'boundary' : 'push',
            'push_perfect',
            runsVal >= 4
              ? `Push · ${dLabel} — FOUR!`
              : runsVal === 0
                ? `Push · ${dLabel} — no run`
                : `Push · ${dLabel} — ${runsVal} run${runsVal === 1 ? '' : 's'}`
          );
        }
        if (timing === 'early') {
          const outP = del.id === 'quick' ? 0.38 : 0.28;
          if (roll < outP) {
            return out(
              'edge',
              'push_early_edge',
              `Mistimed — edged the Push early vs ${dLabel}`
            );
          }
          return ok(
            roll < outP + 0.5 ? 1 : 0,
            'nudge',
            'push_early',
            `Push early · ${dLabel} — scrambled`
          );
        }
        const lateOut = del.id === 'spin' ? 0.36 : del.id === 'quick' ? 0.4 : 0.3;
        if (roll < lateOut) {
          return out(
            del.id === 'quick' ? 'beaten' : 'bowled',
            'push_late_out',
            del.id === 'quick'
              ? `Beaten for pace — Push late vs Quick`
              : `Bowled — Push late vs ${dLabel}`
          );
        }
        return ok(1, 'push', 'push_late', `Push late · ${dLabel} — thick edge, 1`);
      }

      // —— Loft: boundary hunt, pays for greed ——
      if (timing === 'perfect') {
        let catchP = 0.1;
        if (del.id === 'quick') catchP = 0.16;
        else if (del.id === 'flight') catchP = 0.07;
        else if (del.id === 'spin') catchP = 0.12;
        if (roll < catchP) {
          return out(
            'caught',
            'loft_perfect_catch',
            `Caught — Loft found the fielder vs ${dLabel}`
          );
        }
        const r2 = (roll - catchP) / (1 - catchP);
        let weights;
        if (del.id === 'flight') {
          weights = [
            [0.08, 1],
            [0.12, 2],
            [0.4, 4],
            [0.4, 6],
          ];
        } else if (del.id === 'quick') {
          weights = [
            [0.18, 1],
            [0.22, 2],
            [0.35, 4],
            [0.25, 6],
          ];
        } else {
          weights = [
            [0.12, 1],
            [0.18, 2],
            [0.38, 4],
            [0.32, 6],
          ];
        }
        const runsVal = pickWeighted(weights, r2);
        return ok(
          runsVal,
          runsVal >= 4 ? 'boundary' : 'loft',
          'loft_perfect',
          runsVal === 6
            ? `Loft · ${dLabel} — SIX!`
            : runsVal === 4
              ? `Loft · ${dLabel} — FOUR!`
              : `Loft · ${dLabel} — ${runsVal} runs`
        );
      }
      if (timing === 'early') {
        let outP = 0.55;
        if (del.id === 'quick') outP = 0.72;
        else if (del.id === 'spin') outP = 0.62;
        else if (del.id === 'flight') outP = 0.48;
        if (roll < outP) {
          return out(
            'caught',
            'loft_early_catch',
            del.id === 'quick'
              ? 'Caught — lofted the Quick one early'
              : `Caught — Loft early vs ${dLabel}`
          );
        }
        return ok(
          roll < outP + 0.25 ? 1 : 2,
          'loft',
          'loft_early_survive',
          `Loft early · ${dLabel} — skied, dropped`
        );
      }
      // late loft
      let lateOut = 0.52;
      if (del.id === 'quick') lateOut = 0.62;
      else if (del.id === 'spin') lateOut = 0.58;
      if (roll < lateOut) {
        return out(
          roll < lateOut * 0.55 ? 'bowled' : 'caught',
          'loft_late_out',
          roll < lateOut * 0.55
            ? `Cleaned up — Loft late vs ${dLabel}`
            : `Caught — mistimed slog vs ${dLabel}`
        );
      }
      return ok(1, 'loft', 'loft_late_survive', `Loft late · ${dLabel} — got away with 1`);
    };



    let deliveryRaf = null;
    let pauseCtrl = null;
    let pauseFreezeAt = 0;
    let pauseRemainBowl = 0;
    let pauseRemainMiss = 0;
    let pauseRemainResult = 0;
    const clearTimers = () => {
      if (bowlTimer) clearTimeout(bowlTimer);
      if (missTimer) clearTimeout(missTimer);
      if (resultTimer) clearTimeout(resultTimer);
      if (deliveryRaf) cancelAnimationFrame(deliveryRaf);
      clearBowlLock();
      bowlTimer = null;
      missTimer = null;
      resultTimer = null;
      deliveryRaf = null;
      pauseRemainBowl = 0;
      pauseRemainMiss = 0;
      pauseRemainResult = 0;
      clearFlashOutcome();
    };
    const sessionAlive = () =>
      !ended && (!gs || (typeof gs.alive === 'function' ? gs.alive() : true));
    const isPaused = () =>
      !!(peerPaused || (pauseCtrl && pauseCtrl.isPaused && pauseCtrl.isPaused()));

    const chromeSubtitle = liveOn
      ? liveChromeSub() +
        (liveStake > 0 ? ' · Stake ⚡' + liveStake + ' (virtual)' : ' · Friendly') +
        ' · Street Cricket'
      : undefined;
    const mounted = mountSportsShell({
      gameId: 'streetcricket',
      title: 'Street Cricket',
      accent: '#1B7A4E',
      pauseId: 'scPause',
      live: liveOn,
      subtitle: chromeSubtitle,
      leaveBody: liveOn
        ? liveStake > 0
          ? 'Leaving forfeits — virtual stake settles for your opponent.'
          : 'Leaving now counts as a forfeit for your opponent.'
        : 'This practice run will end.',
      isPlaying: () => !ended && phase !== 'done' && phase !== 'pick' && phase !== 'wait',
      onClose: () => {
        if (liveOn && !settleDone && !resultShown) {
          // Local leave mid-match — settle loss once (idempotent with peer forfeit).
          try {
            if (liveRoles && liveRoles.opp) settleOppUid = liveRoles.opp;
            reportStreetResult(false, false, 'leave');
            settleStreetOnce(false, false);
          } catch (e) {}
        }
        ended = true;
        try {
          if (pauseCtrl) pauseCtrl.destroy();
        } catch (e) {}
        pauseCtrl = null;
        clearTimers();
        if (liveHandle && typeof detachLiveHandle === 'function') {
          try {
            detachLiveHandle(liveHandle, { alreadyOver: true });
          } catch (e) {}
        }
        liveHandle = null;
        if (leaveShell) leaveShell.liveHandle = null;
      },
    });
    const { overlay, body, gs, pauseBtnId } = mounted;
    leaveShell = mounted.leaveShell || null;
    if (!body) return;

    const setChromeSub = (text) => {
      const el =
        overlay.querySelector('.game-chrome-subtitle') ||
        overlay.querySelector('.game-chrome-sub');
      if (el) el.textContent = text;
    };

    const resumeDeliveryFromClock = () => {
      if (!sessionAlive() || isPaused()) return;
      if (phase === 'runup') {
        const remain = Math.max(40, deliveryStartedAt + cur().runupMs - Date.now());
        startRunupTimer(remain);
      } else if (phase === 'flight') {
        paintPitchState();
        startFlightLoop();
      }
    };

    const applyRemoteState = (st, force) => {
      if (!st) return;
      const seq = st.eventSeq | 0;
      if (!force && seq > 0 && seq <= appliedSeq) return;
      if (seq > 0) {
        appliedSeq = Math.max(appliedSeq, seq);
        eventSeq = Math.max(eventSeq, seq);
      }
      applying = true;
      clearTimers();
      if (st.formatId && FORMATS[st.formatId]) formatId = st.formatId;
      if (st.overSeed != null) overSeed = st.overSeed >>> 0;
      if (st.chaseTarget != null) chaseTarget = st.chaseTarget | 0;
      if (st.maxBalls != null) maxBalls = st.maxBalls | 0;
      if (st.maxWickets != null) maxWickets = st.maxWickets | 0;
      if (st.runs != null) runs = st.runs | 0;
      if (st.wickets != null) wickets = st.wickets | 0;
      if (st.balls != null) balls = st.balls | 0;
      if (st.perfects != null) perfects = st.perfects | 0;
      if (st.armedShot && SHOTS[st.armedShot]) armedShot = st.armedShot;
      if (st.armedDelivery && DELIVERY_TYPES[st.armedDelivery]) armedDelivery = st.armedDelivery;
      if (st.batUid) batUid = st.batUid;
      if (st.bowlUid) bowlUid = st.bowlUid;
      if (st.inningsIndex != null) inningsIndex = st.inningsIndex | 0 || 1;
      if (st.innings1) innings1 = st.innings1;
      if (st.innings2) innings2 = st.innings2;
      if (st.matchWinnerUid != null) matchWinnerUid = st.matchWinnerUid || '';
      if (st.matchDraw != null) matchDraw = !!st.matchDraw;
      if (st.delivery && st.delivery.id) {
        deliveryMeta = Object.assign({}, cloneDelivery(st.delivery.id), st.delivery);
      } else if (
        st.phase === 'idle' ||
        st.phase === 'pick' ||
        st.phase === 'done' ||
        st.phase === 'wait'
      ) {
        deliveryMeta = null;
      }
      if (st.deliveryStartedAt != null) deliveryStartedAt = st.deliveryStartedAt | 0;
      if (st.lastOutcome != null) lastOutcome = st.lastOutcome;
      if (st.lastBall) lastBall = st.lastBall;
      if (Array.isArray(st.ballLog)) {
        ballLog.length = 0;
        st.ballLog.forEach((b) => ballLog.push(b));
      }
      if (st.endReason != null) endReason = st.endReason;
      if (st.sessionWon != null) sessionWon = !!st.sessionWon;
      if (st.paused != null) peerPaused = !!st.paused;
      if (st.phase) {
        if (!iAmHost() && st.phase === 'pick') phase = 'wait';
        else phase = st.phase;
      }
      applying = false;
      setModeChrome();
      if (phase === 'done') {
        ended = true;
        if (leaveShell) leaveShell.gameOver = true;
        if (liveOn) {
          showLiveDone({
            forfeit: endReason === 'forfeit',
            iWon: !!sessionWon,
            path: 'remote',
          });
        } else {
          render();
        }
        return;
      }
      render();
      if (phase === 'runup' || phase === 'flight') resumeDeliveryFromClock();
    };

    try {
      coachShown = localStorage.getItem(COACH_KEY) === '1';
    } catch (e) {
      coachShown = false;
    }
    if (typeof migrateStreetCricketPb === 'function') migrateStreetCricketPb();
    formatId = loadSavedFormat();
    if (liveOn && rematchFormatHint && FORMATS[rematchFormatHint]) {
      formatId = rematchFormatHint;
    }

    const cur = () => deliveryMeta || DELIVERY_TYPES.medium;
    const shotMeta = () => SHOTS[armedShot] || SHOTS.push;

    const flightElapsed = () => {
      if (!deliveryStartedAt) return 0;
      return Math.max(0, Date.now() - deliveryStartedAt - cur().runupMs);
    };

    const flightProgress = () => {
      const e = flightElapsed();
      const fm = cur().flightMs || 1000;
      if (e <= 0) return 0;
      return Math.min(1, e / fm);
    };

    const classifyTiming = (progress) => {
      const d = cur();
      if (progress < d.zoneStart) return 'early';
      if (progress <= d.zoneEnd) return 'perfect';
      if (progress <= d.lateEnd) return 'late';
      return 'miss';
    };

    const applyPitchVars = (pitch, d) => {
      if (!pitch || !d) return;
      pitch.style.setProperty('--sc-runup-ms', d.runupMs + 'ms');
      pitch.style.setProperty('--sc-flight-ms', d.flightMs + 'ms');
      pitch.style.setProperty('--sc-zone-start', String(d.zoneStart));
      pitch.style.setProperty('--sc-zone-end', String(d.zoneEnd));
      pitch.style.setProperty('--sc-accent', d.accent || '#81C784');
      pitch.dataset.delivery = d.id || 'medium';
      pitch.dataset.path = d.path || 'straight';
      pitch.classList.remove('is-del-medium', 'is-del-quick', 'is-del-flight', 'is-del-spin');
      pitch.classList.add('is-del-' + (d.id || 'medium'));
    };

    const canChangeShot = () =>
      (!liveOn || iAmBat()) && (phase === 'idle' || phase === 'runup') && !isPaused();

    const canPickDelivery = () =>
      liveOn && iAmBowl() && phase === 'idle' && !isPaused();

    const scoreHud = () => {
      const innTag = liveOn ? (inningsIndex === 2 ? '2nd · ' : '1st · ') : '';
      const vs =
        liveOn && innings1
          ? ` · vs ${innings1.runs}${formatId === 'nets' ? '/' + (innings1.perfects | 0) + 'c' : ''}`
          : '';
      if (formatId === 'nets') {
        return `${innTag}${balls}/${maxBalls} faced · ${wickets}/${maxWickets} out · ${perfects} clean · ${runs} runs${vs}`;
      }
      if (formatId === 'chase') {
        const left = Math.max(0, maxBalls - balls);
        const wkLeft = Math.max(0, maxWickets - wickets);
        if (liveOn && inningsIndex === 2 && chaseTarget > 0) {
          return `${innTag}${runs}/${chaseTarget} · ${left} ball${left === 1 ? '' : 's'} · ${wkLeft} wkt${wkLeft === 1 ? '' : 's'}`;
        }
        if (liveOn && inningsIndex === 1) {
          return `${innTag}${runs} runs · ${left} ball${left === 1 ? '' : 's'} left · ${wkLeft} wkt${wkLeft === 1 ? '' : 's'} (set target)`;
        }
        return `${runs}/${chaseTarget} · ${left} ball${left === 1 ? '' : 's'} left · ${wkLeft} wkt${wkLeft === 1 ? '' : 's'}`;
      }
      const pb =
        !liveOn &&
        typeof getGamePB === 'function' &&
        getGamePB('streetcricket_over') != null
          ? ` · Best ${getGamePB('streetcricket_over')}`
          : '';
      return `${innTag}${runs} runs · ${balls}/${maxBalls} balls · ${wickets} out${vs}${pb}`;
    };

    const showPicker = () => {
      if (liveOn && !iAmHost()) return;
      clearTimers();
      phase = 'pick';
      setChromeSub(liveOn ? liveChromeSub() + ' · Friendly · pick format' : 'Practice · pick format');
      render();
    };

    const reset = () => {
      if (liveOn && !iAmHost()) return;
      clearTimers();
      beginSession();
      phase = 'idle';
      if (liveOn) {
        batUid = (liveRoles && liveRoles.playerA) || batUid;
        bowlUid = (liveRoles && liveRoles.playerB) || bowlUid;
        pushLive({ phase: 'idle' }, { as: 'host' });
      }
      render();
    };

    const startSelected = () => {
      if (liveOn && !iAmHost()) return;
      saveFormat(formatId);
      beginSession();
      phase = 'idle';
      if (liveOn) {
        batUid = (liveRoles && liveRoles.playerA) || '';
        bowlUid = (liveRoles && liveRoles.playerB) || '';
        pushLive({ phase: 'idle' }, { as: 'host' });
      }
      render();
      if (typeof gameFeedback === 'function') gameFeedback('select');
    };

    const paintPitchState = () => {
      const pitch = body.querySelector('[data-rw-pitch]');
      if (!pitch) return;
      const d = cur();
      applyPitchVars(pitch, d);
      pitch.classList.toggle('is-runup', phase === 'runup' || phase === 'flight');
      pitch.classList.toggle('is-flight', phase === 'flight');
      const p = phase === 'flight' ? flightProgress() : 0;
      const inZone = phase === 'flight' && p >= d.zoneStart && p <= d.zoneEnd;
      pitch.classList.toggle('is-window', inZone);
      body.querySelectorAll('[data-shot]').forEach((el) => {
        const id = el.getAttribute('data-shot');
        el.classList.toggle('is-armed', id === armedShot);
        el.disabled = !canChangeShot();
      });
      body.querySelectorAll('[data-del]').forEach((el) => {
        const id = el.getAttribute('data-del');
        el.classList.toggle('is-armed', id === armedDelivery);
        el.disabled = !canPickDelivery();
      });
      const btn = body.querySelector('[data-rw-action]');
      if (btn) {
        const bowling = liveOn && iAmBowl();
        const batting = !liveOn || iAmBat();
        const canSend = bowling && phase === 'idle' && !isPaused();
        const canPracticeBowl = !liveOn && phase === 'idle' && !isPaused();
        const canHit = batting && phase === 'flight' && !isPaused();
        btn.disabled = !(canSend || canPracticeBowl || canHit);
        if (liveOn) {
          if (bowling) {
            btn.textContent =
              phase === 'idle' ? 'Send' : phase === 'runup' ? 'Run-up…' : phase === 'flight' ? 'In flight…' : '…';
          } else if (batting) {
            btn.textContent =
              phase === 'flight' ? 'Hit!' : phase === 'idle' ? 'Waiting for ball…' : phase === 'runup' ? 'Get ready…' : '…';
          } else {
            btn.textContent = '…';
          }
        } else {
          btn.textContent = canPracticeBowl ? 'Bowl' : canHit ? 'Hit!' : '…';
        }
      }
      const hint = body.querySelector('[data-rw-hint]');
      if (hint) {
        if (liveOn && iAmBowl()) {
          if (phase === 'idle')
            hint.textContent =
              lastOutcome ||
              `You’re bowling — pick ${(DELIVERY_TYPES[armedDelivery] || DELIVERY_TYPES.medium).label}, then Send.`;
          else if (phase === 'runup') hint.textContent = 'Delivery on its way…';
          else if (phase === 'flight') hint.textContent = 'Ball in flight — batter’s timing.';
          else if (phase === 'result') hint.textContent = lastOutcome || 'Ball done';
        } else if (liveOn && iAmBat()) {
          if (phase === 'idle')
            hint.textContent =
              lastOutcome ||
              `${shotMeta().label} armed — wait for the ball, then time the Hit.`;
          else if (phase === 'runup') hint.textContent = `${shotMeta().label} ready — run-up…`;
          else if (phase === 'flight')
            hint.textContent = inZone
              ? `HIT — ${shotMeta().label}!`
              : `Watch the flight — ${shotMeta().label}`;
          else if (phase === 'result') hint.textContent = lastOutcome;
        } else if (phase === 'idle') {
          hint.textContent =
            lastOutcome ||
            (formatId === 'chase'
              ? `Chase ${chaseTarget} — ${shotMeta().label} armed.`
              : formatId === 'nets'
                ? `Nets — ${shotMeta().label} armed. Stay in.`
                : coachShown
                  ? `${shotMeta().label} armed — Bowl, then time the Hit.`
                  : 'Pick Defend, Push, or Loft — then time the Hit.');
        } else if (phase === 'runup') hint.textContent = `${shotMeta().label} ready — run-up…`;
        else if (phase === 'flight')
          hint.textContent = inZone
            ? `HIT — ${shotMeta().label}!`
            : `Watch the flight — ${shotMeta().label}`;
        else if (phase === 'result') hint.textContent = lastOutcome;
      }
      const hud = body.querySelector('[data-rw-hud]');
      if (hud) hud.textContent = scoreHud();
    };

    const wireControls = () => {
      body.querySelectorAll('[data-shot]').forEach((el) => {
        el.addEventListener('click', (ev) => {
          ev.preventDefault();
          if (!canChangeShot()) return;
          const id = el.getAttribute('data-shot');
          if (!SHOTS[id]) return;
          armedShot = id;
          paintPitchState();
          if (liveOn && iAmBat()) pushLive({ armedShot }, { as: 'bat' });
          if (typeof gameFeedback === 'function') gameFeedback('select');
        });
      });
      body.querySelectorAll('[data-del]').forEach((el) => {
        el.addEventListener('click', (ev) => {
          ev.preventDefault();
          if (!canPickDelivery()) return;
          const id = el.getAttribute('data-del');
          if (!DELIVERY_TYPES[id]) return;
          armedDelivery = id;
          paintPitchState();
          if (typeof gameFeedback === 'function') gameFeedback('select');
          clearBowlLock();
          bowlLockTimer = setTimeout(() => {
            bowlLockTimer = null;
            if (!sessionAlive() || isPaused() || phase !== 'idle' || !iAmBowl()) return;
            commitLiveDelivery(armedDelivery);
          }, BOWL_LOCK_MS);
        });
      });
      body.querySelector('[data-rw-action]')?.addEventListener('click', onAction);
      body.querySelectorAll('[data-format]').forEach((el) => {
        el.addEventListener('click', () => {
          if (liveOn && !iAmHost()) return;
          const id = el.getAttribute('data-format');
          if (!FORMATS[id]) return;
          formatId = id;
          body.querySelectorAll('[data-format]').forEach((b) => {
            b.classList.toggle('is-selected', b.getAttribute('data-format') === formatId);
          });
        });
      });
      body.querySelector('[data-rw-start]')?.addEventListener('click', startSelected);
    };

    const buildBallStripHtml = () => {
      if (!ballLog.length) return '';
      const pills = ballLog
        .map((b) => {
          if (b.out) return '<span class="rw-sc-pill is-w" title="Wicket">W</span>';
          const r = Number(b.runs) || 0;
          if (r <= 0) return '<span class="rw-sc-pill is-dot" title="Dot">·</span>';
          const cls = r >= 4 ? ' is-b' : '';
          return `<span class="rw-sc-pill${cls}" title="${r}">${r}</span>`;
        })
        .join('');
      return `<div class="rw-sc-ballstrip" aria-label="Ball by ball">${pills}</div>`;
    };

    const pickMomentLine = () => {
      if (!ballLog.length) return '';
      const six = ballLog.find((b) => !b.out && b.runs === 6);
      if (six) return six.label || 'Lofted a six in the gully';
      const four = ballLog.find((b) => !b.out && b.runs === 4);
      if (four) return four.label || 'Found the gap for four';
      const wicket = ballLog.find((b) => b.out);
      if (wicket) return wicket.label || 'One gone';
      const last = ballLog[ballLog.length - 1];
      return (last && last.label) || '';
    };

    const formatBestBlurb = (id) => {
      if (typeof getGamePB !== 'function') return 'No best yet';
      if (id === 'nets') {
        const p = getGamePB('streetcricket_nets');
        return p != null ? `Best ${p} clean` : 'No best yet';
      }
      if (id === 'chase') {
        const wins = getGamePB('streetcricket_chase_wins');
        const best = getGamePB('streetcricket_chase');
        if (wins != null && wins > 0 && best != null) return `${wins} win${wins === 1 ? '' : 's'} · best ${best}`;
        if (wins != null && wins > 0) return `${wins} chase win${wins === 1 ? '' : 's'}`;
        if (best != null) return `Best chase ${best} runs`;
        return 'No chase yet';
      }
      const p = getGamePB('streetcricket_over');
      return p != null ? `Best ${p} runs` : 'No best yet';
    };

    const pbIdForFormat = () => {
      if (typeof streetCricketPbGameId === 'function') return streetCricketPbGameId(formatId);
      if (formatId === 'nets') return 'streetcricket_nets';
      if (formatId === 'chase') return 'streetcricket_chase';
      return 'streetcricket_over';
    };

    const buildResultOpts = () => {
      const f = fmt();
      const pbGameId = pbIdForFormat();

      if (liveOn && (innings1 || endReason === 'forfeit' || matchWinnerUid || resultShown)) {
        const i1 = innings1;
        const i2 =
          innings2 ||
          (endReason !== 'forfeit' && innings1 ? snapshotInnings(endReason) : null);
        const myUid = liveRoles && liveRoles.me;
        const myInn = i1 && i1.batUid === myUid ? i1 : i2 && i2.batUid === myUid ? i2 : null;
        const oppInn = i1 && i1.batUid === myUid ? i2 : i1;
        const myRuns = myInn ? myInn.runs | 0 : 0;
        const oppRuns = oppInn ? oppInn.runs | 0 : 0;
        const line =
          endReason === 'forfeit'
            ? lastOutcome || 'Forfeit'
            : formatId === 'nets'
              ? `You ${myInn ? myInn.perfects | 0 : 0} clean (${myRuns}) · Opp ${oppInn ? oppInn.perfects | 0 : 0} clean (${oppRuns})`
              : `You ${myRuns} · Opp ${oppRuns}` +
                (formatId === 'chase' && chaseTarget ? ` · target ${chaseTarget}` : '');
        const title = matchDraw
          ? 'Draw'
          : sessionWon
            ? 'You win'
            : 'Opponent wins';
        const stakeLine = stakeSettleNote ? ' · ' + stakeSettleNote : '';
        const sub =
          (inningsIndex >= 2 || innings2 ? 'Both innings done · ' : '') +
          (formatId === 'chase'
            ? matchDraw
              ? line
              : sessionWon
                ? endReason === 'chase_won'
                  ? 'Chase done'
                  : 'Defended the total'
                : endReason === 'chase_won'
                  ? 'They chased it down'
                  : endReason === 'forfeit'
                    ? lastOutcome || 'Forfeit'
                    : 'Couldn’t defend'
            : endReason === 'forfeit'
              ? lastOutcome || 'Forfeit'
              : line) +
          stakeLine;
        return {
          title: 'Street Cricket',
          glyph: '🏏',
          onAgain: freshRematch,
          onChangeFormat: () => {
            freshRematch();
          },
          actions: [
            { label: 'Rematch', primary: true, id: 'again' },
            { label: 'Share', primary: false, id: 'share' },
          ],
          challenge: false,
          hideStats: true,
          hideMissions: true,
          updatePb: false,
          scoreHtml: `<p class="rw-sc-moment">${esc(line)}</p>`,
          againLabel: 'Rematch',
          resultTitle: title,
          subtitle: sub,
          scoreLine: line,
          score: myRuns,
          shareText:
            `Street Cricket Live: ${line}` +
            (liveStake > 0 ? ' · virtual stakes' : '') +
            ' on Chaupaal',
          won: sessionWon,
          recordExtra: {
            format: formatId,
            formatId,
            live: true,
            stake: liveStake,
            innings: 2,
            matchDraw,
          },
          gs,
        };
      }

      const innings = {
        formatId,
        label: f.label,
        runs,
        wickets,
        balls,
        maxBalls,
        maxWickets,
        chaseTarget,
        perfects,
        won: sessionWon,
        endReason,
        ballLog: ballLog.slice(),
      };
      try {
        if (typeof window !== 'undefined') window.__scLastInnings = innings;
      } catch (e) {}

      const moment = pickMomentLine();
      const strip = buildBallStripHtml();
      const scoreHtml =
        `${strip}` +
        (moment ? `<p class="rw-sc-moment">${esc(moment)}</p>` : '');

      const againLabel =
        formatId === 'nets' ? 'Nets again' : formatId === 'chase' ? 'Chase again' : 'Bat again';
      const actions = [
        { label: againLabel, primary: true, id: 'again' },
        { label: 'Change format', primary: false, id: 'changeFormat' },
        { label: 'Share', primary: false, id: 'share' },
      ];
      const base = {
        title: 'Street Cricket',
        glyph: '🏏',
        onAgain: reset,
        onChangeFormat: showPicker,
        actions,
        challenge: false,
        hideStats: true,
        hideMissions: true,
        scoreHtml,
        againLabel,
        recordExtra: {
          format: formatId,
          formatId,
          mode: formatId,
          variant: formatId,
          wickets,
          balls,
          perfects,
          chaseTarget,
        },
        gs,
      };

      if (formatId === 'nets') {
        return Object.assign(base, {
          updatePb: true,
          pbGameId,
          unit: ' clean',
          resultTitle: endReason === 'wickets' ? 'Nets done — all out' : 'Nets done',
          subtitle: `${balls} balls · ${perfects} clean · ${runs} runs · ${wickets} down`,
          scoreLine: `Nets: ${perfects} clean`,
          score: perfects,
          vsBest: typeof formatVsBest === 'function' ? formatVsBest(pbGameId, perfects) : '',
          shareText: `Nets: ${balls} balls, ${wickets} down, ${perfects} clean — Street Cricket on Chaupaal`,
          won: false,
        });
      }
      if (formatId === 'chase') {
        const shortBy = Math.max(0, chaseTarget - runs);
        const scoreVs =
          typeof formatVsBest === 'function' ? formatVsBest(pbGameId, runs) : '';
        const winsPrev =
          typeof getGamePB === 'function' ? getGamePB('streetcricket_chase_wins') || 0 : 0;
        const winsNow = sessionWon ? winsPrev + 1 : winsPrev;
        let vsBest = scoreVs;
        if (sessionWon) {
          vsBest = scoreVs
            ? `${scoreVs} · ${winsNow} win${winsNow === 1 ? '' : 's'}`
            : `${winsNow} chase win${winsNow === 1 ? '' : 's'}`;
        } else if (winsPrev > 0) {
          vsBest = scoreVs
            ? `${scoreVs} · ${winsPrev} win${winsPrev === 1 ? '' : 's'}`
            : scoreVs;
        }
        return Object.assign(base, {
          updatePb: true,
          pbGameId,
          unit: ' runs',
          resultTitle: sessionWon ? 'Chase done — got it' : 'Chase fallen short',
          subtitle: sessionWon
            ? `${runs} off ${balls} · chased ${chaseTarget} · ${wickets} down`
            : `Needed ${chaseTarget}, made ${runs} (short by ${shortBy}) · ${balls} balls · ${wickets} down`,
          scoreLine: sessionWon ? `Chase: ${runs} off ${balls}` : `Chase: ${runs}/${chaseTarget}`,
          score: runs,
          vsBest,
          shareText: sessionWon
            ? `Chase: ${runs} off ${balls} (needed ${chaseTarget}) in Street Cricket on Chaupaal`
            : `Chase fallen short: ${runs}/${chaseTarget} in Street Cricket on Chaupaal`,
          won: sessionWon,
          onAfterPb: () => {
            if (sessionWon && typeof setGamePB === 'function') {
              setGamePB('streetcricket_chase_wins', winsNow);
            }
          },
        });
      }
      return Object.assign(base, {
        updatePb: true,
        pbGameId,
        unit: ' runs',
        resultTitle: 'Over done',
        subtitle: `${runs} runs · ${wickets} down · ${balls} balls`,
        scoreLine: `Over: ${runs} runs`,
        score: runs,
        vsBest: typeof formatVsBest === 'function' ? formatVsBest(pbGameId, runs) : '',
        shareText: `Gully Over: ${runs} runs off ${balls} in Street Cricket on Chaupaal`,
        won: false,
      });
    };

    const render = () => {
      if (phase === 'wait') {
        body.innerHTML = `
          <div class="rw-sports-card rw-sc-card rw-sc-picker">
            <h2>Street Cricket</h2>
            ${rwRoleBanner('waiting', 'Waiting for host', 'They pick the format')}
            <p class="rw-sports-hint">Live duel — one bowls, one bats, then swap.</p>
          </div>`;
        return;
      }
      if (phase === 'pick') {
        if (typeof migrateStreetCricketPb === 'function') migrateStreetCricketPb();
        const cards = ['over', 'nets', 'chase']
          .map((id) => {
            const f = FORMATS[id];
            return `<button type="button" class="rw-sc-format${formatId === id ? ' is-selected' : ''}" data-format="${id}">
              <span class="rw-sc-format-title">${f.label}</span>
              <span class="rw-sc-format-blurb">${f.blurb}</span>
              <span class="rw-sc-format-best">${formatBestBlurb(id)}</span>
            </button>`;
          })
          .join('');
        body.innerHTML = `
          <div class="rw-sports-card rw-sc-card rw-sc-picker">
            <h2>Street Cricket</h2>
            <p class="rw-sports-hint">${
              liveOn
                ? 'Live 1v1 — one bowls, one bats, then swap. Chase: 1st innings sets the target (+1). Virtual stakes when challenged.'
                : 'Gully practice — Over, Nets, or Chase. Same bag, same shots.'
            }</p>
            <div class="rw-sc-formats" role="listbox" aria-label="Format">${cards}</div>
            <button type="button" class="btn btn--primary rw-sc-main" data-rw-start>Start</button>
          </div>`;
        wireControls();
        return;
      }
      if (phase === 'done') {
        const opts = buildResultOpts();
        if (liveOn) {
          opts.updatePb = false;
          opts.challenge = false;
          opts.onAgain = freshRematch;
          opts.onChangeFormat = freshRematch;
        }
        finishPractice('streetcricket', opts.score != null ? opts.score : runs, body, opts);
        return;
      }
      const d = cur();
      const bowling = liveOn && iAmBowl();
      const batting = !liveOn || iAmBat();
      const shotLock = canChangeShot() ? '' : 'disabled';
      const delLock = canPickDelivery() ? '' : 'disabled';
      let roleTitle = 'You’re batting';
      let roleMode = 'yours';
      let roleSub = '';
      if (liveOn && bowling) {
        roleTitle = 'You’re bowling';
        if (phase === 'idle') {
          roleMode = 'yours';
          roleSub = 'Your action — pick a ball & Send';
        } else if (phase === 'runup' || phase === 'flight') {
          roleMode = 'waiting';
          roleSub = phase === 'runup' ? 'Delivery on its way…' : 'Batter’s timing';
        } else {
          roleMode = 'waiting';
          roleSub = lastOutcome || 'Ball done';
        }
      } else if (liveOn && batting) {
        roleTitle = 'You’re batting';
        if (phase === 'idle') {
          roleMode = 'waiting';
          roleSub = 'Waiting for the ball — arm your shot';
        } else if (phase === 'runup') {
          roleMode = 'waiting';
          roleSub = 'Run-up… get ready';
        } else if (phase === 'flight') {
          roleMode = 'yours';
          roleSub = 'Your action — Hit!';
        } else {
          roleMode = 'waiting';
          roleSub = lastOutcome || 'Ball done';
        }
      } else {
        roleSub =
          phase === 'idle'
            ? 'Your action — Bowl'
            : phase === 'runup'
              ? 'Run-up… get ready'
              : phase === 'flight'
                ? 'Your action — Hit!'
                : lastOutcome || 'Ball done';
        roleMode = phase === 'idle' || phase === 'flight' ? 'yours' : 'waiting';
      }
      const roleBanner = rwRoleBanner(roleMode, roleTitle, roleSub);
      const delTypes = ['medium', 'quick', 'flight', 'spin'];
      const deliveryRow = bowling
        ? `<div class="rw-sc-shots rw-sc-deliveries" role="group" aria-label="Delivery">
            ${delTypes
              .map((id) => {
                const dd = DELIVERY_TYPES[id];
                return `<button type="button" class="rw-sc-shot${armedDelivery === id ? ' is-armed' : ''}" data-del="${id}" ${delLock}>${dd.label}</button>`;
              })
              .join('')}
          </div>`
        : '';
      const shotRow = batting
        ? `<div class="rw-sc-shots" role="group" aria-label="Shot">
            <button type="button" class="rw-sc-shot${armedShot === 'defend' ? ' is-armed' : ''}" data-shot="defend" ${shotLock}>Defend</button>
            <button type="button" class="rw-sc-shot${armedShot === 'push' ? ' is-armed' : ''}" data-shot="push" ${shotLock}>Push</button>
            <button type="button" class="rw-sc-shot${armedShot === 'loft' ? ' is-armed' : ''}" data-shot="loft" ${shotLock}>Loft</button>
          </div>`
        : liveOn
          ? `<p class="rw-sports-hint" style="margin:8px 0 0">Batter arms the shot on their side.</p>`
          : '';
      const innLabel =
        liveOn && inningsIndex === 2
          ? `${fmt().label} · 2nd innings`
          : liveOn
            ? `${fmt().label} · 1st innings`
            : fmt().label;
      body.innerHTML = `
        <div class="rw-sports-card rw-sc-card">
          <h2>${innLabel}</h2>
          ${roleBanner}
          <p class="rw-sports-score" data-rw-hud>${scoreHud()}</p>
          <div class="rw-sports-pitch rw-sc-pitch is-del-${d.id || 'medium'}" data-rw-pitch
            data-delivery="${d.id || 'medium'}" data-path="${d.path || 'straight'}"
            style="--sc-runup-ms:${d.runupMs}ms;--sc-flight-ms:${d.flightMs}ms;--sc-zone-start:${d.zoneStart};--sc-zone-end:${d.zoneEnd};--sc-accent:${d.accent || '#81C784'}">
            <div class="rw-sc-lane" aria-hidden="true"></div>
            <div class="rw-sc-zone" aria-hidden="true"></div>
            <div class="rw-sc-bowler" aria-hidden="true"><span class="rw-sc-bowler-mark"></span></div>
            <div class="rw-sc-ball" aria-hidden="true"></div>
            <div class="rw-sc-batter" aria-hidden="true"><span class="rw-sc-bat"></span></div>
            <div class="rw-sc-stumps" aria-hidden="true"></div>
          </div>
          <div class="rw-sports-outcome" data-rw-outcome aria-live="polite"></div>
          <p class="rw-sports-hint" data-rw-hint></p>
          ${deliveryRow}
          ${shotRow}
          <button type="button" class="btn btn--primary rw-sc-main" data-rw-action>Bowl</button>
        </div>`;
      paintPitchState();
      if (lastOutcome && (phase === 'idle' || phase === 'result')) {
        const kind =
          lastBall && lastBall.out
            ? 'out'
            : lastBall && lastBall.runs >= 4
              ? 'boundary'
              : /out|caught|bowled|beaten|cleaned|mistimed|innings break/i.test(lastOutcome)
                ? /innings break/i.test(lastOutcome)
                  ? 'run'
                  : 'out'
                : /six|four|boundary/i.test(lastOutcome)
                  ? 'boundary'
                  : 'run';
        flashOutcome(body, lastOutcome, kind);
      }
      wireControls();
    };

    const evaluateEnd = () => {
      // Live chase innings 1: set a total (no chase win mid-innings).
      if (formatId === 'chase' && !(liveOn && inningsIndex === 1) && runs >= chaseTarget && chaseTarget > 0) {
        return { done: true, won: true, reason: 'chase_won' };
      }
      if (wickets >= maxWickets) {
        return { done: true, won: false, reason: 'wickets' };
      }
      if (balls >= maxBalls) {
        const won =
          formatId === 'chase' && chaseTarget > 0 ? runs >= chaseTarget : true;
        return { done: true, won, reason: 'balls' };
      }
      return { done: false, won: false, reason: '' };
    };

    const advanceAfterResult = (end) => {
      deliveryMeta = null;
      if (!end.done) {
        phase = 'idle';
        if (liveOn && iAmBat()) pushLive({ phase: 'idle', delivery: null, deliveryStartedAt: 0 }, { as: 'bat' });
        render();
        return;
      }
      if (!liveOn) {
        phase = 'done';
        ended = true;
        if (leaveShell) leaveShell.gameOver = true;
        render();
        return;
      }
      if (!iAmBat()) return;
      const snap = snapshotInnings(end.reason);
      if (inningsIndex === 1) {
        beginSecondInnings(snap);
        pushLive(
          {
            phase: 'idle',
            inningsIndex: 2,
            innings1,
            batUid,
            bowlUid,
            delivery: null,
            deliveryStartedAt: 0,
          },
          { as: 'any' }
        );
        render();
        return;
      }
      finishMatchFromSecond(snap);
      pushLive({ phase: 'done', innings2, matchWinnerUid, matchDraw }, { as: 'bat', status: 'over' });
      showLiveDone({ forfeit: false, skipFeedback: false });
    };

    const afterBall = (outcome) => {
      lastOutcome = outcome;
      phase = 'result';
      deliveryStartedAt = 0;
      const end = evaluateEnd();
      if (end.done) {
        endReason = end.reason;
        if (!liveOn) {
          sessionWon = !!end.won;
          if (end.reason === 'chase_won' && typeof gameFeedback === 'function') {
            gameFeedback('win');
          }
        } else if (end.reason === 'chase_won' && inningsIndex === 2 && typeof gameFeedback === 'function') {
          gameFeedback('win');
        }
      }
      if (liveOn && iAmBat()) pushLive({ phase: 'result' }, { as: 'bat' });
      render();
      const delay = end.done && end.reason === 'chase_won' ? 650 : 950;
      resultTimer = setTimeout(() => {
        resultTimer = null;
        if (!sessionAlive()) return;
        if (isPaused()) {
          pauseRemainResult = 40;
          return;
        }
        if (liveOn && !iAmBat()) return;
        advanceAfterResult(end);
      }, delay);
    };

    const applyResolved = (res) => {
      if (liveOn && !iAmBat()) return;
      clearTimers();
      balls += 1;
      if (res.timing === 'perfect' && !res.out) perfects += 1;
      lastBall = Object.assign({}, res, {
        ballIndex: balls,
        deliveryLabel: cur().label,
        shotLabel: (SHOTS[res.shotId] || SHOTS.push).label,
      });
      ballLog.push(lastBall);
      try {
        if (typeof window !== 'undefined') {
          window.__scLastBall = lastBall;
          window.__scBallLog = ballLog.slice();
        }
      } catch (e) {}
      if (res.out) {
        wickets += 1;
        if (typeof gameFeedback === 'function') gameFeedback('lose');
      } else {
        runs += res.runs || 0;
        if (res.runs >= 4 && typeof gameFeedback === 'function') gameFeedback('win');
        else if (typeof gameFeedback === 'function') gameFeedback('bat');
      }
      afterBall(res.label);
    };

    const startFlightLoop = () => {
      if (!sessionAlive() || isPaused() || phase !== 'flight') return;
      const d = cur();
      const tick = () => {
        if (!sessionAlive() || isPaused() || phase !== 'flight') {
          deliveryRaf = null;
          return;
        }
        paintPitchState();
        deliveryRaf = requestAnimationFrame(tick);
      };
      deliveryRaf = requestAnimationFrame(tick);
      const remain =
        pauseRemainMiss > 0
          ? pauseRemainMiss
          : Math.max(40, d.flightMs - flightElapsed());
      pauseRemainMiss = 0;
      missTimer = setTimeout(() => {
        missTimer = null;
        if (!sessionAlive() || isPaused() || phase !== 'flight') return;
        if (liveOn && !iAmBat()) return;
        applyResolved(resolveStreetBall(cur(), 'miss', armedShot));
      }, remain);
    };

    const startRunupTimer = (ms) => {
      pauseRemainBowl = 0;
      bowlTimer = setTimeout(() => {
        bowlTimer = null;
        if (!sessionAlive() || isPaused() || phase !== 'runup') return;
        phase = 'flight';
        paintPitchState();
        startFlightLoop();
      }, Math.max(40, ms));
    };

    const commitLiveDelivery = (typeId) => {
      if (!liveOn || !iAmBowl()) return;
      if (!sessionAlive() || isPaused() || phase !== 'idle') return;
      const id = DELIVERY_TYPES[typeId] ? typeId : armedDelivery || 'medium';
      clearTimers();
      clearBowlLock();
      armedDelivery = id;
      deliveryMeta = cloneDelivery(id);
      deliveryStartedAt = Date.now();
      phase = 'runup';
      lastOutcome = '';
      pushLive({ phase: 'runup', armedDelivery: id }, { as: 'bowl' });
      render();
      if (typeof gameFeedback === 'function') gameFeedback('place');
      try {
        if (typeof window !== 'undefined') window.__scLastDelivery = deliveryMeta;
      } catch (e) {}
      startRunupTimer(cur().runupMs);
    };

    const onAction = () => {
      if (!sessionAlive() || isPaused()) return;
      if (phase === 'idle') {
        if (liveOn) {
          if (!iAmBowl()) return;
          clearBowlLock();
          commitLiveDelivery(armedDelivery);
          return;
        }
        lastOutcome = '';
        clearTimers();
        if (!coachShown) {
          coachShown = true;
          try {
            localStorage.setItem(COACH_KEY, '1');
          } catch (e) {}
        }
        deliveryMeta = pickDelivery();
        deliveryStartedAt = Date.now();
        phase = 'runup';
        render();
        if (typeof gameFeedback === 'function') gameFeedback('place');
        try {
          if (typeof window !== 'undefined') window.__scLastDelivery = deliveryMeta;
        } catch (e) {}
        startRunupTimer(cur().runupMs);
        return;
      }
      if (phase === 'flight') {
        if (liveOn && !iAmBat()) return;
        const progress = flightProgress();
        const timing = classifyTiming(progress);
        applyResolved(resolveStreetBall(cur(), timing, armedShot));
      }
    };

    if (typeof createGamePauseController === 'function') {
      pauseCtrl = createGamePauseController({
        host: overlay,
        pauseBtnId: pauseBtnId || 'scPause',
        onPause() {
          const now = Date.now();
          pauseFreezeAt = now;
          clearBowlLock();
          if (bowlTimer && phase === 'runup') {
            pauseRemainBowl = Math.max(40, deliveryStartedAt + cur().runupMs - now);
            clearTimeout(bowlTimer);
            bowlTimer = null;
          }
          if (missTimer && phase === 'flight') {
            pauseRemainMiss = Math.max(
              40,
              deliveryStartedAt + cur().runupMs + cur().flightMs - now
            );
            clearTimeout(missTimer);
            missTimer = null;
          }
          if (resultTimer && phase === 'result') {
            pauseRemainResult = 120;
            clearTimeout(resultTimer);
            resultTimer = null;
          }
          if (deliveryRaf) {
            cancelAnimationFrame(deliveryRaf);
            deliveryRaf = null;
          }
          if (liveOn) pushLive({ paused: true }, { as: 'any' });
        },
        onResume() {
          if (!sessionAlive()) return;
          if (pauseFreezeAt && deliveryStartedAt) {
            deliveryStartedAt += Date.now() - pauseFreezeAt;
          }
          pauseFreezeAt = 0;
          if (liveOn) pushLive({ paused: false }, { as: 'any' });
          if (phase === 'runup') {
            startRunupTimer(pauseRemainBowl || cur().runupMs);
          } else if (phase === 'flight') {
            paintPitchState();
            startFlightLoop();
          } else if (phase === 'result' && pauseRemainResult > 0) {
            const end = evaluateEnd();
            resultTimer = setTimeout(() => {
              resultTimer = null;
              pauseRemainResult = 0;
              if (!sessionAlive()) return;
              if (liveOn && !iAmBat()) return;
              advanceAfterResult(end);
            }, pauseRemainResult);
          }
        },
        onQuit() {
          clearTimers();
          if (leaveShell && typeof leaveGameShell === 'function') {
            leaveGameShell(leaveShell, {
              live: liveOn,
              liveHandle: leaveShell.liveHandle,
              isPlaying: !ended && phase !== 'done' && phase !== 'pick' && phase !== 'wait',
              title: 'Leave Street Cricket?',
              body: liveOn
                ? 'Leaving now counts as a forfeit for your opponent.'
                : 'This practice run will end.',
            });
            return;
          }
          if (gs) gs.close('dismissed');
        },
      });
    }

    if (liveOn && typeof DangalLive !== 'undefined' && DangalLive.join) {
      liveRoles = DangalLive.roles(chat);
      batUid = liveRoles.playerA || '';
      bowlUid = liveRoles.playerB || '';
      if (liveRoles.opp) settleOppUid = liveRoles.opp;
      liveHandle = DangalLive.join({
        gameType: 'streetcricket',
        matchId: matchIdFor(chat, 'streetcricket'),
        me: liveRoles.me,
        playerA: liveRoles.playerA,
        playerB: liveRoles.playerB,
        onSnap(val) {
          if (!val || ended || !sessionAlive()) return;
          if (val.status === 'forfeit') {
            applying = true;
            clearTimers();
            ended = true;
            if (leaveShell) leaveShell.gameOver = true;
            const iWon = liveRoles && val.winner === liveRoles.me;
            lastOutcome = iWon ? 'Opponent left — you win' : 'You left';
            endReason = 'forfeit';
            sessionWon = !!iWon;
            matchDraw = false;
            matchWinnerUid = iWon
              ? liveRoles.me
              : (liveRoles && liveRoles.opp) || '';
            applying = false;
            showLiveDone({ forfeit: true, iWon: !!iWon, path: 'forfeit' });
            return;
          }
          const st = val.state || {};
          if (val.status === 'over' && st.phase && st.phase !== 'done') {
            st.phase = 'done';
          }
          // Both seats apply higher eventSeq (own pushes already bumped appliedSeq).
          applyRemoteState(st);
        },
      });
      if (leaveShell) leaveShell.liveHandle = liveHandle;
      if (iAmHost()) {
        try {
          liveHandle.push({
            status: 'playing',
            turn: bowlUid,
            state: {
              formatId,
              phase: 'pick',
              batUid,
              bowlUid,
              inningsIndex: 1,
              eventSeq: 0,
              runs: 0,
              wickets: 0,
              balls: 0,
              perfects: 0,
              stake: liveStake,
            },
          });
        } catch (e) {}
      } else {
        phase = 'wait';
      }
    }

    if (phase === 'wait') {
      setChromeSub(
        liveChromeSub() +
          (liveStake > 0 ? ' · Stake ⚡' + liveStake + ' (virtual)' : ' · Friendly') +
          ' · waiting'
      );
    } else {
      setChromeSub(
        liveOn
          ? liveChromeSub() +
              (liveStake > 0 ? ' · Stake ⚡' + liveStake + ' (virtual)' : ' · Friendly') +
              ' · pick format'
          : 'Practice · pick format'
      );
    }
    render();
  }


  /** Gully Kick — Practice shootout: Classic / SD / Pressure (Prompt 3/3). */
  function openGullyKick() {
    let scored = 0;
    let taken = 0;
    const MAX = 5;
    const PRESSURE_NEED = 4;
    let formatId = 'classic';
    let streak = 0;
    let runBestStreak = 0;
    let sessionWon = false;
    let endReason = '';
    let phase = 'pick'; // pick | aim | flight | result | done
    let lastResult = '';
    let lastDive = 'C';
    let lastDiveHeight = 'mid';
    let lastGoal = false;
    let lastOutcomeKind = '';
    let lastKick = null;
    const kickLog = [];
    let aim = { side: 'C', height: 'mid', nx: 0.5, ny: 0.45 };
    let power = 0.55;
    let chargeRaf = null;
    let chargeStartedAt = 0;
    let charging = false;
    let flightTimer = null;
    let resultTimer = null;
    let locked = false;
    let pendingDive = null;
    let coachShown = false;
    const COACH_KEY = 'chaupaal_gk_coach_v2';
    const FORMAT_KEY = 'chaupaal_gk_format_v3';

    const FORMATS = {
      classic: {
        id: 'classic',
        label: 'Classic',
        blurb: '5 kicks — score as many as you can',
      },
      sudden: {
        id: 'sudden',
        label: 'Sudden Death',
        blurb: 'Survive until the first miss',
      },
      pressure: {
        id: 'pressure',
        label: 'Pressure',
        blurb: 'Need 4 goals from 5 kicks',
      },
    };

    const loadSavedFormat = () => {
      try {
        const v = localStorage.getItem(FORMAT_KEY);
        if (v && FORMATS[v]) return v;
      } catch (e) {}
      return 'classic';
    };

    const saveFormat = (id) => {
      try {
        localStorage.setItem(FORMAT_KEY, id);
      } catch (e) {}
    };

    const fmt = () => FORMATS[formatId] || FORMATS.classic;

    const pbIdForFormat = (id) => {
      const f = id || formatId;
      if (typeof gullyKickPbGameId === 'function') return gullyKickPbGameId(f);
      if (f === 'sudden') return 'gullykick_sd';
      if (f === 'pressure') return 'gullykick_pressure';
      return 'gullykick_classic';
    };

    try {
      coachShown = localStorage.getItem(COACH_KEY) === '1';
    } catch (e) {
      coachShown = false;
    }

    const clearTimers = () => {
      if (flightTimer) clearTimeout(flightTimer);
      if (resultTimer) clearTimeout(resultTimer);
      if (chargeRaf) cancelAnimationFrame(chargeRaf);
      flightTimer = null;
      resultTimer = null;
      chargeRaf = null;
      charging = false;
      clearFlashOutcome();
    };

    let pauseCtrl = null;
    let pauseFreezeAt = 0;
    let pauseRemainFlight = 0;
    let pauseRemainResult = 0;
    const { overlay, body, gs, pauseBtnId } = mountSportsShell({
      gameId: 'gullykick',
      title: 'Gully Kick',
      accent: '#2D6A4F',
      pauseId: 'gkPause',
      onClose: () => {
        try {
          if (pauseCtrl) pauseCtrl.destroy();
        } catch (e) {}
        pauseCtrl = null;
        clearTimers();
      },
    });
    if (!body) return;

    const sessionAlive = () => !gs || (typeof gs.alive === 'function' ? gs.alive() : true);
    const isPaused = () => !!(pauseCtrl && pauseCtrl.isPaused && pauseCtrl.isPaused());

    const setChromeSub = (text) => {
      const el =
        overlay.querySelector('.game-chrome-subtitle') ||
        overlay.querySelector('.game-chrome-sub');
      if (el) el.textContent = text;
    };

    if (typeof migrateGullyKickPb === 'function') migrateGullyKickPb();
    formatId = loadSavedFormat();

    const diveLabel = (d) => (d === 'L' ? 'left' : d === 'R' ? 'right' : 'center');
    const heightLabel = (h) => (h === 'low' ? 'low' : h === 'high' ? 'high' : 'mid');
    const sideWord = (s) => (s === 'L' ? 'Left' : s === 'R' ? 'Right' : 'Center');

    const markCoach = () => {
      if (coachShown) return;
      coachShown = true;
      try {
        localStorage.setItem(COACH_KEY, '1');
      } catch (e) {}
    };

    const weightedPick = (items) => {
      let total = 0;
      for (let i = 0; i < items.length; i++) total += items[i].w;
      if (total <= 0) return items[0] && items[0].v;
      let r = Math.random() * total;
      for (let i = 0; i < items.length; i++) {
        r -= items[i].w;
        if (r <= 0) return items[i].v;
      }
      return items[items.length - 1].v;
    };

    const snapAim = (nx, ny) => {
      const x = Math.max(0.08, Math.min(0.92, nx));
      const y = Math.max(0.08, Math.min(0.92, ny));
      const side = x < 0.34 ? 'L' : x > 0.66 ? 'R' : 'C';
      const height = y < 0.34 ? 'high' : y > 0.66 ? 'low' : 'mid';
      const sx = side === 'L' ? 0.2 : side === 'R' ? 0.8 : 0.5;
      const sy = height === 'high' ? 0.22 : height === 'low' ? 0.78 : 0.5;
      return {
        side,
        height,
        nx: sx * 0.72 + x * 0.28,
        ny: sy * 0.55 + y * 0.45,
        rawNx: x,
        rawNy: y,
      };
    };

    const pickKeeperPlan = () => {
      const weights = { L: 1, C: 1.05, R: 1 };
      const recent = kickLog.slice(-3);
      for (let i = 0; i < recent.length; i++) {
        const s = recent[i] && recent[i].side;
        if (s && weights[s] != null) weights[s] += 1.8 + i * 0.35;
      }
      if (kickLog.length) {
        const last = kickLog[kickLog.length - 1];
        if (last && last.side && weights[last.side] != null) weights[last.side] += 1.4;
      }

      let side;
      if (Math.random() < 0.12) {
        // Spice: pick against the biased read
        const spice = [
          { v: 'L', w: 1 / weights.L },
          { v: 'C', w: 1 / weights.C },
          { v: 'R', w: 1 / weights.R },
        ];
        side = weightedPick(spice);
      } else {
        side = weightedPick([
          { v: 'L', w: weights.L },
          { v: 'C', w: weights.C },
          { v: 'R', w: weights.R },
        ]);
      }

      const height = weightedPick([
        { v: 'low', w: 0.3 },
        { v: 'mid', w: 0.42 },
        { v: 'high', w: 0.28 },
      ]);

      // Honest tells only: lean = dive side, or neutral N (never opposite).
      const tellRoll = Math.random();
      let tell = 'N';
      let tellStrength = 'neutral';
      if (tellRoll < 0.34) {
        tell = 'N';
        tellStrength = 'neutral';
      } else if (tellRoll < 0.62) {
        tell = side;
        tellStrength = 'soft';
      } else {
        tell = side;
        tellStrength = 'strong';
      }

      return { side, height, tell, tellStrength };
    };

    const paintKeeperTell = () => {
      const el = body.querySelector('[data-gk-keeper]');
      if (!el) return;
      el.className = 'rw-sports-keeper rw-gk-keeper';
      if (!pendingDive || !charging || phase !== 'aim') return;
      const t = (pendingDive.tell || 'N').toLowerCase();
      el.classList.add('is-tell-' + t);
      if (pendingDive.tellStrength === 'soft') el.classList.add('is-tell-soft');
      if (pendingDive.tellStrength === 'strong') el.classList.add('is-tell-strong');
    };

    const beginSession = () => {
      scored = 0;
      taken = 0;
      streak = 0;
      runBestStreak = 0;
      sessionWon = false;
      endReason = '';
      lastResult = '';
      lastDive = 'C';
      lastDiveHeight = 'mid';
      lastGoal = false;
      lastOutcomeKind = '';
      lastKick = null;
      kickLog.length = 0;
      aim = { side: 'C', height: 'mid', nx: 0.5, ny: 0.45 };
      power = 0.55;
      locked = false;
      pendingDive = null;
      setChromeSub('Practice · ' + fmt().label + ' · Shooter');
    };

    const reset = () => {
      clearTimers();
      beginSession();
      phase = 'aim';
      render();
    };

    const showPicker = () => {
      clearTimers();
      phase = 'pick';
      setChromeSub('Practice · pick format');
      render();
    };

    const startSelected = () => {
      saveFormat(formatId);
      beginSession();
      phase = 'aim';
      render();
      if (typeof gameFeedback === 'function') gameFeedback('select');
    };

    const formatBestBlurb = (id) => {
      if (typeof getGamePB !== 'function') return 'No best yet';
      const pbId = pbIdForFormat(id);
      const p = getGamePB(pbId);
      if (id === 'sudden') return p != null ? `Best streak ${p}` : 'No best yet';
      if (id === 'pressure') return p != null ? `Best ${p} clear${p === 1 ? '' : 's'}` : 'No clears yet';
      return p != null ? `Best ${p}/5` : 'No best yet';
    };

    const scoreHud = () => {
      if (formatId === 'sudden') {
        const allTime =
          typeof getGamePB === 'function' && getGamePB('gullykick_sd') != null
            ? ` · Best ${getGamePB('gullykick_sd')}`
            : '';
        return `Streak ${streak} · best this run ${runBestStreak}${allTime}`;
      }
      if (formatId === 'pressure') {
        const left = Math.max(0, MAX - taken);
        const clears =
          typeof getGamePB === 'function' && getGamePB('gullykick_pressure') != null
            ? ` · Best ${getGamePB('gullykick_pressure')} clears`
            : '';
        return `${scored}/${PRESSURE_NEED} needed · ${left} kick${left === 1 ? '' : 's'} left${clears}`;
      }
      const pb =
        typeof getGamePB === 'function' && getGamePB('gullykick_classic') != null
          ? ` · Best ${getGamePB('gullykick_classic')}/${MAX}`
          : '';
      return `${scored} scored · ${taken}/${MAX} taken${pb}`;
    };

    const evaluateEnd = () => {
      if (formatId === 'sudden') {
        if (!lastGoal) {
          return { done: true, won: false, reason: lastOutcomeKind === 'over' ? 'over' : 'save' };
        }
        return { done: false, won: false, reason: '' };
      }
      if (formatId === 'pressure') {
        if (scored >= PRESSURE_NEED) {
          return { done: true, won: true, reason: 'cleared' };
        }
        const left = MAX - taken;
        if (scored + left < PRESSURE_NEED) {
          return { done: true, won: false, reason: 'impossible' };
        }
        if (taken >= MAX) {
          return { done: true, won: false, reason: 'kicks' };
        }
        return { done: false, won: false, reason: '' };
      }
      // classic
      if (taken >= MAX) {
        return { done: true, won: false, reason: 'kicks' };
      }
      return { done: false, won: false, reason: '' };
    };

    const pickMomentLine = () => {
      if (!lastKick) return lastResult || '';
      if (
        lastKick.goal &&
        lastKick.tell &&
        lastKick.tell !== 'N' &&
        lastKick.side &&
        lastKick.side !== lastKick.tell
      ) {
        return 'Wrong-footed the lean';
      }
      return lastResult || lastKick.label || '';
    };

    const buildResultOpts = () => {
      const f = fmt();
      const pbGameId = pbIdForFormat();
      const moment = pickMomentLine();
      const scoreHtml = moment ? `<p class="rw-gk-moment">${esc(moment)}</p>` : '';
      const actions = [
        { label: 'Kick again', primary: true, id: 'again' },
        { label: 'Change format', primary: false, id: 'changeFormat' },
        { label: 'Share', primary: false, id: 'share' },
      ];
      const base = {
        title: 'Gully Kick',
        glyph: '⚽',
        onAgain: reset,
        onChangeFormat: showPicker,
        actions,
        challenge: false,
        hideStats: true,
        hideMissions: true,
        scoreHtml,
        againLabel: 'Kick again',
        recordExtra: {
          format: formatId,
          formatId,
          mode: formatId,
          variant: formatId,
        },
        gs,
      };

      if (formatId === 'sudden') {
        return Object.assign(base, {
          updatePb: streak > 0,
          pbGameId,
          unit: ' streak',
          resultTitle: 'Sudden death — run ended',
          subtitle: `Streak ${streak}`,
          scoreLine: `SD streak ${streak}`,
          score: streak,
          vsBest:
            streak > 0 && typeof formatVsBest === 'function'
              ? formatVsBest(pbGameId, streak)
              : typeof getGamePB === 'function' && getGamePB(pbGameId) != null
                ? `Best ${getGamePB(pbGameId)} streak`
                : '',
          shareText: `SD streak ${streak} — Gully Kick on Chaupaal`,
          won: false,
        });
      }

      if (formatId === 'pressure') {
        const clearsPrev =
          typeof getGamePB === 'function' ? getGamePB('gullykick_pressure') || 0 : 0;
        const clearsNow = sessionWon ? clearsPrev + 1 : clearsPrev;
        let vsBest = '';
        if (typeof formatVsBest === 'function') {
          vsBest = formatVsBest(pbGameId, clearsNow > 0 ? clearsNow : clearsPrev || 0);
        }
        if (!vsBest && clearsPrev > 0) {
          vsBest = `Best ${clearsPrev} clear${clearsPrev === 1 ? '' : 's'}`;
        } else if (sessionWon) {
          vsBest = vsBest || `${clearsNow} clear${clearsNow === 1 ? '' : 's'}`;
        }
        return Object.assign(base, {
          updatePb: false,
          pbGameId,
          unit: ' clears',
          resultTitle: sessionWon ? 'Pressure cleared' : 'Pressure failed',
          subtitle: `${scored}/${MAX} · need ${PRESSURE_NEED}`,
          scoreLine: sessionWon
            ? `Pressure cleared ${scored}/${MAX}`
            : `Pressure ${scored}/${MAX}`,
          score: scored,
          vsBest,
          shareText: sessionWon
            ? `Pressure cleared ${scored}/${MAX} — Gully Kick on Chaupaal`
            : `Pressure ${scored}/${MAX} — Gully Kick on Chaupaal`,
          won: sessionWon,
          onAfterPb: () => {
            if (sessionWon && typeof setGamePB === 'function') {
              const prev =
                typeof getGamePB === 'function' ? getGamePB('gullykick_pressure') || 0 : 0;
              setGamePB('gullykick_pressure', prev + 1);
            }
          },
        });
      }

      // classic
      return Object.assign(base, {
        updatePb: true,
        pbGameId,
        unit: '/5',
        resultTitle: scored === 0 ? 'No goals this round' : 'Shootout over',
        subtitle: `${scored} / ${MAX} goals`,
        scoreLine: `${scored}/${MAX}`,
        score: scored,
        vsBest: typeof formatVsBest === 'function' ? formatVsBest(pbGameId, scored) : '',
        shareText: `${scored}/${MAX} Classic Gully Kick on Chaupaal`,
        won: false,
      });
    };

    const paintAimMarker = () => {
      const marker = body.querySelector('[data-gk-marker]');
      const net = body.querySelector('[data-gk-net]');
      if (!marker || !net) return;
      marker.style.left = aim.nx * 100 + '%';
      marker.style.top = aim.ny * 100 + '%';
      marker.dataset.side = aim.side;
      marker.dataset.height = aim.height;
      const label = body.querySelector('[data-gk-aim-label]');
      if (label) {
        label.textContent =
          sideWord(aim.side) + ' · ' + heightLabel(aim.height);
      }
    };

    const paintPower = () => {
      const fill = body.querySelector('[data-gk-power-fill]');
      if (fill) fill.style.width = Math.round(power * 100) + '%';
      const txt = body.querySelector('[data-gk-power-label]');
      if (txt) {
        const tier = power < 0.4 ? 'Chip' : power < 0.7 ? 'Firm' : 'Blast';
        txt.textContent = tier + ' · ' + Math.round(power * 100) + '%';
      }
    };

    const setAimFromEvent = (ev, netEl, buzz) => {
      const rect = netEl.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const clientX = ev.clientX != null ? ev.clientX : ev.touches && ev.touches[0] && ev.touches[0].clientX;
      const clientY = ev.clientY != null ? ev.clientY : ev.touches && ev.touches[0] && ev.touches[0].clientY;
      if (clientX == null || clientY == null) return;
      const nx = (clientX - rect.left) / rect.width;
      const ny = (clientY - rect.top) / rect.height;
      aim = snapAim(nx, ny);
      paintAimMarker();
      if (buzz && typeof gameFeedback === 'function') gameFeedback('select');
    };

    const endPosForAim = (a, pwr) => {
      let x = a.side === 'L' ? 18 : a.side === 'R' ? 82 : 50;
      let y = a.height === 'high' ? 18 : a.height === 'low' ? 72 : 42;
      if (pwr > 0.75) {
        if (a.side === 'L') x -= 4;
        if (a.side === 'R') x += 4;
        if (a.height === 'high') y -= 4;
      }
      if (pwr < 0.4) {
        y = Math.min(78, y + 8);
      }
      return { x, y };
    };

    const goalChance = (kick) => {
      const side = kick.side;
      const height = kick.height;
      const pwr = kick.power;
      const dive = kick.dive;
      const diveH = kick.diveHeight || 'mid';
      const same = side === dive;

      // Soft high floater — rare over-the-bar handled in resolveKick
      if (side === 'C' && pwr < 0.48) {
        if (dive === 'C') return 0.14 + pwr * 0.2; // stay home: low
        return 0.74 + pwr * 0.12; // dive away: high
      }

      if (!same) {
        return 0.52 + pwr * 0.38;
      }

      // Same side
      let c = 0.1 + pwr * 0.28;
      if (height === diveH) {
        c *= 0.42;
      } else if (pwr >= 0.78) {
        // Blast over a wrong-height dive can still score
        c += 0.24;
      } else {
        c *= 0.72;
      }
      return c;
    };

    const resolveKick = (kick) => {
      const pwr = kick.power;
      const same = kick.side === kick.dive;
      const diveH = kick.diveHeight || 'mid';

      // Soft high floater: rare over the bar
      if (kick.height === 'high' && pwr < 0.42) {
        const overP = 0.12 + (0.42 - pwr) * 0.55;
        if (Math.random() < overP) {
          return Object.assign({}, kick, {
            goal: false,
            over: true,
            reason: 'over_bar',
            label: 'Over the bar — soft high floater',
            outcomeKind: 'over',
            chance: 0,
          });
        }
      }

      let chance = goalChance(kick);
      chance = Math.max(0.08, Math.min(0.92, chance));
      const goal = Math.random() < chance;
      let reason = 'chance';
      let label = '';

      if (goal) {
        if (!same) {
          reason = 'beat_dive';
          label =
            'Goal! Beat the dive — ' +
            sideWord(kick.side) +
            ' ' +
            heightLabel(kick.height) +
            ' · keeper went ' +
            diveLabel(kick.dive);
        } else if (pwr >= 0.78 && kick.height !== diveH) {
          reason = 'blast_wrong_height';
          label = 'Goal! Blast over the dive height';
        } else if (kick.side === 'C' && pwr < 0.48 && kick.dive !== 'C') {
          reason = 'soft_center_away';
          label = 'Goal! Soft center — keeper dived away';
        } else {
          reason = 'squeak';
          label =
            'Goal! Squeaked past — ' +
            sideWord(kick.side) +
            ' ' +
            heightLabel(kick.height);
        }
      } else {
        if (same && pwr < 0.5) {
          reason = 'same_soft';
          label = 'Saved — same side, too soft';
        } else if (same && kick.height === diveH) {
          reason = 'same_height';
          label = 'Saved — same side, height matched';
        } else if (same) {
          reason = 'same_side_save';
          label = 'Saved — same side · keeper read ' + diveLabel(kick.dive);
        } else if (kick.side === 'C' && pwr < 0.48 && kick.dive === 'C') {
          reason = 'soft_center_home';
          label = 'Saved — soft center, keeper stayed home';
        } else {
          reason = 'reach_save';
          label =
            'Saved! Keeper stretched ' +
            diveLabel(kick.dive) +
            ' · ' +
            heightLabel(diveH);
        }
      }

      return Object.assign({}, kick, {
        goal,
        over: false,
        reason,
        label,
        chance,
        outcomeKind: goal ? 'goal' : 'save',
      });
    };

    const commitKick = (pwr) => {
      if (phase !== 'aim' || locked) return;
      locked = true;
      clearTimers();
      power = Math.max(0.28, Math.min(1, pwr));
      const plan = pendingDive || pickKeeperPlan();
      pendingDive = null;
      const dive = plan.side;
      const diveHeight = plan.height || 'mid';
      const end = endPosForAim(aim, power);
      const flightMs = Math.round(520 + (1 - power) * 380);
      const kick = {
        index: taken + 1,
        side: aim.side,
        height: aim.height,
        power: Math.round(power * 100) / 100,
        nx: aim.nx,
        ny: aim.ny,
        endX: end.x,
        endY: end.y,
        dive,
        diveHeight,
        tell: plan.tell,
        tellStrength: plan.tellStrength,
        flightMs,
        zones: { side: aim.side, height: aim.height },
      };
      lastKick = kick;
      lastDive = dive;
      lastDiveHeight = diveHeight;
      lastOutcomeKind = '';
      phase = 'flight';
      if (typeof gameFeedback === 'function') gameFeedback('kick');
      try {
        if (typeof window !== 'undefined') {
          window.__gkLastKick = kick;
          window.__gkKickLog = kickLog.slice();
        }
      } catch (e) {}
      render();
      pauseRemainFlight = 0;
      flightTimer = setTimeout(() => {
        flightTimer = null;
        if (!sessionAlive() || isPaused() || phase !== 'flight') return;
        const resolved = resolveKick(kick);
        lastKick = resolved;
        kickLog.push(resolved);
        taken += 1;
        lastGoal = !!resolved.goal;
        lastOutcomeKind = resolved.outcomeKind || (resolved.goal ? 'goal' : 'save');
        lastResult = resolved.label;
        if (resolved.over) {
          if (typeof gameFeedback === 'function') gameFeedback('lose', { noConfetti: true });
        } else if (resolved.goal) {
          scored += 1;
          if (formatId === 'sudden') {
            streak += 1;
            if (streak > runBestStreak) runBestStreak = streak;
          }
          if (typeof gameFeedback === 'function') gameFeedback('win', { noConfetti: true });
        } else if (typeof gameFeedback === 'function') {
          gameFeedback('lose', { noConfetti: true });
        }
        try {
          if (typeof window !== 'undefined') {
            window.__gkLastKick = resolved;
            window.__gkKickLog = kickLog.slice();
          }
        } catch (e) {}
        const endEval = evaluateEnd();
        if (endEval.done) {
          sessionWon = !!endEval.won;
          endReason = endEval.reason || '';
        }
        phase = 'result';
        locked = false;
        render();
        resultTimer = setTimeout(() => {
          resultTimer = null;
          if (!sessionAlive() || isPaused() || phase !== 'result') {
            pauseRemainResult = 80;
            return;
          }
          if (endEval.done) phase = 'done';
          else {
            phase = 'aim';
            power = 0.55;
            locked = false;
            pendingDive = null;
          }
          render();
        }, 950);
      }, flightMs);
    };

    const stopCharge = (commit) => {
      if (!charging) return;
      if (isPaused()) {
        charging = false;
        if (chargeRaf) cancelAnimationFrame(chargeRaf);
        chargeRaf = null;
        return;
      }
      charging = false;
      if (chargeRaf) cancelAnimationFrame(chargeRaf);
      chargeRaf = null;
      const elapsed = Date.now() - chargeStartedAt;
      const p = Math.max(0.28, Math.min(1, 0.28 + elapsed / 900));
      power = p;
      paintPower();
      if (commit) {
        commitKick(p);
      } else {
        pendingDive = null;
        paintKeeperTell();
        const hint = body.querySelector('[data-gk-hint]');
        if (hint && phase === 'aim') {
          hint.textContent = coachShown
            ? 'Drag the net to aim · hold Kick to charge power'
            : 'Watch the keeper lean while you charge — then pick your corner.';
        }
      }
    };

    const startCharge = () => {
      if (phase !== 'aim' || locked || charging || !sessionAlive() || isPaused()) return;
      markCoach();
      charging = true;
      chargeStartedAt = Date.now();
      power = 0.28;
      pendingDive = pickKeeperPlan();
      paintPower();
      paintKeeperTell();
      const hint = body.querySelector('[data-gk-hint]');
      if (hint) {
        const lean =
          pendingDive.tell === 'N'
            ? 'Keeper squared up…'
            : 'Keeper leaning ' + diveLabel(pendingDive.tell) + '…';
        hint.textContent = lean + ' hold Kick, release to shoot';
      }
      const tick = () => {
        if (!charging || !sessionAlive() || isPaused()) {
          chargeRaf = null;
          return;
        }
        const elapsed = Date.now() - chargeStartedAt;
        power = Math.max(0.28, Math.min(1, 0.28 + elapsed / 900));
        paintPower();
        chargeRaf = requestAnimationFrame(tick);
      };
      chargeRaf = requestAnimationFrame(tick);
      if (typeof gameFeedback === 'function') gameFeedback('place');
    };

    const wireAim = () => {
      const net = body.querySelector('[data-gk-net]');
      if (!net) return;
      let dragging = false;
      const onDown = (ev) => {
        if (phase !== 'aim' || locked || isPaused()) return;
        dragging = true;
        if (ev.cancelable) ev.preventDefault();
        setAimFromEvent(ev.touches ? ev.touches[0] : ev, net, true);
      };
      const onMove = (ev) => {
        if (!dragging || phase !== 'aim') return;
        if (ev.cancelable) ev.preventDefault();
        const pt = ev.touches ? ev.touches[0] : ev;
        setAimFromEvent(pt, net, false);
      };
      const onUp = () => {
        dragging = false;
      };
      net.addEventListener('pointerdown', onDown);
      net.addEventListener('pointermove', onMove);
      net.addEventListener('pointerup', onUp);
      net.addEventListener('pointercancel', onUp);
      net.addEventListener('pointerleave', onUp);

      const kickBtn = body.querySelector('[data-gk-kick]');
      if (kickBtn) {
        kickBtn.addEventListener('pointerdown', (ev) => {
          if (phase !== 'aim' || locked || isPaused()) return;
          ev.preventDefault();
          try {
            kickBtn.setPointerCapture(ev.pointerId);
          } catch (e) {}
          startCharge();
        });
        kickBtn.addEventListener('pointerup', (ev) => {
          ev.preventDefault();
          stopCharge(true);
        });
        kickBtn.addEventListener('pointercancel', () => stopCharge(false));
      }
    };

    const wirePicker = () => {
      body.querySelectorAll('[data-format]').forEach((el) => {
        el.addEventListener('click', () => {
          const id = el.getAttribute('data-format');
          if (!FORMATS[id]) return;
          formatId = id;
          body.querySelectorAll('[data-format]').forEach((b) => {
            b.classList.toggle('is-selected', b.getAttribute('data-format') === formatId);
          });
        });
      });
      body.querySelector('[data-rw-start]')?.addEventListener('click', startSelected);
    };

    const render = () => {
      if (phase === 'pick') {
        if (typeof migrateGullyKickPb === 'function') migrateGullyKickPb();
        const cards = ['classic', 'sudden', 'pressure']
          .map((id) => {
            const f = FORMATS[id];
            return `<button type="button" class="rw-sc-format${formatId === id ? ' is-selected' : ''}" data-format="${id}">
              <span class="rw-sc-format-title">${f.label}</span>
              <span class="rw-sc-format-blurb">${f.blurb}</span>
              <span class="rw-sc-format-best">${formatBestBlurb(id)}</span>
            </button>`;
          })
          .join('');
        body.innerHTML = `
          <div class="rw-sports-card rw-gk-card rw-gk-picker">
            <h2>Gully Kick</h2>
            <p class="rw-sports-hint">Practice shootout — Classic, Sudden Death, or Pressure.</p>
            <div class="rw-sc-formats" role="listbox" aria-label="Format">${cards}</div>
            <button type="button" class="btn btn--primary rw-gk-kick" data-rw-start>Start</button>
          </div>`;
        wirePicker();
        return;
      }
      if (phase === 'done') {
        clearTimers();
        const opts = buildResultOpts();
        finishPractice('gullykick', opts.score != null ? opts.score : scored, body, opts);
        return;
      }
      const end = lastKick
        ? lastKick.over
          ? { x: lastKick.endX != null ? lastKick.endX : 50, y: -8 }
          : endPosForAim(lastKick, lastKick.power || power)
        : endPosForAim(aim, power);

      let keeperClass = '';
      if (charging && pendingDive && phase === 'aim') {
        keeperClass = 'is-tell-' + (pendingDive.tell || 'N').toLowerCase();
        if (pendingDive.tellStrength === 'soft') keeperClass += ' is-tell-soft';
        if (pendingDive.tellStrength === 'strong') keeperClass += ' is-tell-strong';
      } else if (phase === 'flight' || phase === 'result') {
        keeperClass = 'is-dive-' + lastDive.toLowerCase();
        if (lastDiveHeight === 'low') keeperClass += ' is-dive-h-low';
        if (lastDiveHeight === 'high') keeperClass += ' is-dive-h-high';
        if (phase === 'result' && !lastGoal && lastOutcomeKind !== 'over') {
          keeperClass += ' is-save';
        }
      }

      const ballClass =
        phase === 'flight'
          ? 'is-flight'
          : phase === 'result'
            ? 'is-landed ' +
              (lastOutcomeKind === 'over' ? 'is-over' : lastGoal ? 'is-goal' : 'is-saved')
            : 'is-ready';
      const flightMs = (lastKick && lastKick.flightMs) || 700;
      const tip =
        phase === 'result'
          ? lastResult
          : phase === 'flight'
            ? 'Ball in flight…'
            : !coachShown
              ? 'Watch the keeper lean while you charge — then pick your corner.'
              : 'Drag the net to aim · hold Kick to charge power';
      const roleSub =
        phase === 'aim'
          ? 'Your action — aim & Kick'
          : phase === 'flight'
            ? 'Keeper diving…'
            : phase === 'result'
              ? lastResult || 'Kick done'
              : '';
      const roleBanner = rwRoleBanner(
        phase === 'aim' ? 'yours' : 'waiting',
        'You’re shooting',
        roleSub
      );

      body.innerHTML = `
        <div class="rw-sports-card rw-gk-card">
          <h2>${esc(fmt().label)}</h2>
          ${roleBanner}
          <p class="rw-sports-score" data-rw-hud>${scoreHud()}</p>
          <div class="rw-sports-goal rw-gk-goal" data-gk-goal>
            <div class="rw-gk-pitch" aria-hidden="true"></div>
            <div class="rw-sports-net rw-gk-net" data-gk-net
              style="touch-action:none"
              role="img" aria-label="Goal — drag to aim">
              <div class="rw-gk-grid" aria-hidden="true"></div>
              <div class="rw-gk-marker" data-gk-marker style="left:${aim.nx * 100}%;top:${aim.ny * 100}%"></div>
              <div class="rw-sports-keeper rw-gk-keeper ${keeperClass}" data-gk-keeper aria-hidden="true">
                <span class="rw-gk-keeper-mark"></span>
              </div>
              <div class="rw-sports-ball-kick rw-gk-ball ${ballClass}" data-gk-ball
                style="--gk-end-x:${end.x}%;--gk-end-y:${end.y}%;--gk-flight-ms:${flightMs}ms;--gk-arc:${Math.round(18 + power * 22)}px"
                aria-hidden="true"></div>
            </div>
          </div>
          <p class="rw-gk-aim-label" data-gk-aim-label></p>
          <div class="rw-gk-power" aria-hidden="true">
            <div class="rw-gk-power-track"><div class="rw-gk-power-fill" data-gk-power-fill></div></div>
            <span class="rw-gk-power-label" data-gk-power-label></span>
          </div>
          <div class="rw-sports-outcome" data-rw-outcome aria-live="polite"></div>
          <p class="rw-sports-hint" data-gk-hint>${esc(tip)}</p>
          <button type="button" class="btn btn--primary rw-gk-kick" data-gk-kick
            ${phase !== 'aim' || locked ? 'disabled' : ''}>Hold to Kick</button>
        </div>`;
      paintAimMarker();
      paintPower();
      if (charging && pendingDive) paintKeeperTell();
      if (phase === 'result' && lastResult) {
        if (lastOutcomeKind === 'over') flashOutcome(body, 'Over!', 'over');
        else flashOutcome(body, lastGoal ? 'Goal!' : 'Saved!', lastGoal ? 'goal' : 'out');
      }
      if (phase === 'aim') wireAim();
    };

    if (typeof createGamePauseController === 'function') {
      pauseCtrl = createGamePauseController({
        host: overlay,
        pauseBtnId: pauseBtnId || 'gkPause',
        onPause() {
          pauseFreezeAt = Date.now();
          if (charging) {
            charging = false;
            if (chargeRaf) cancelAnimationFrame(chargeRaf);
            chargeRaf = null;
            pendingDive = null;
          }
          if (flightTimer && phase === 'flight' && lastKick) {
            pauseRemainFlight = Math.max(80, (lastKick.flightMs || 700) * 0.45);
            clearTimeout(flightTimer);
            flightTimer = null;
          }
          if (resultTimer && phase === 'result') {
            pauseRemainResult = 120;
            clearTimeout(resultTimer);
            resultTimer = null;
          }
        },
        onResume() {
          if (!sessionAlive()) return;
          pauseFreezeAt = 0;
          if (phase === 'flight' && lastKick && !flightTimer) {
            const kick = lastKick;
            flightTimer = setTimeout(() => {
              flightTimer = null;
              pauseRemainFlight = 0;
              if (!sessionAlive() || isPaused() || phase !== 'flight') return;
              const resolved = resolveKick(kick);
              lastKick = resolved;
              kickLog.push(resolved);
              taken += 1;
              lastGoal = !!resolved.goal;
              lastOutcomeKind = resolved.outcomeKind || (resolved.goal ? 'goal' : 'save');
              lastResult = resolved.label;
              if (resolved.over) {
                if (typeof gameFeedback === 'function') gameFeedback('lose', { noConfetti: true });
              } else if (resolved.goal) {
                scored += 1;
                if (formatId === 'sudden') {
                  streak += 1;
                  if (streak > runBestStreak) runBestStreak = streak;
                }
                if (typeof gameFeedback === 'function') gameFeedback('win', { noConfetti: true });
              } else if (typeof gameFeedback === 'function') {
                gameFeedback('lose', { noConfetti: true });
              }
              const endEval = evaluateEnd();
              if (endEval.done) {
                sessionWon = !!endEval.won;
                endReason = endEval.reason || '';
              }
              phase = 'result';
              locked = false;
              render();
              resultTimer = setTimeout(() => {
                resultTimer = null;
                if (!sessionAlive() || isPaused() || phase !== 'result') return;
                if (endEval.done) phase = 'done';
                else {
                  phase = 'aim';
                  power = 0.55;
                  locked = false;
                  pendingDive = null;
                }
                render();
              }, 950);
            }, pauseRemainFlight || 200);
          } else if (phase === 'result' && pauseRemainResult > 0) {
            resultTimer = setTimeout(() => {
              resultTimer = null;
              pauseRemainResult = 0;
              if (!sessionAlive()) return;
              const endEval = evaluateEnd();
              if (endEval.done) phase = 'done';
              else {
                phase = 'aim';
                power = 0.55;
                locked = false;
                pendingDive = null;
              }
              render();
            }, pauseRemainResult);
          }
        },
        onQuit() {
          clearTimers();
          if (gs) gs.close('dismissed');
        },
      });
    }

    setChromeSub('Practice · pick format');
    render();
  }


  if (typeof registerGame === 'function') {
    registerGame({
      id: 'streetcricket',
      name: 'Street Cricket',
      desc: 'Live · Over, Nets & Chase',
      icon: '🏏',
      ratingKey: 'streetcricket',
      gameType: 'dual',
      genre: 'rw_sports',
      liveDuel: true,
      selfChat: true,
      dangal: true,
      chat1v1: true,
      order: 5,
      meta: {
        phaseA: 'Formats — Gully Over, Nets, Chase',
        phaseB: 'Live bowl↔bat + innings swap',
        phaseC: 'Virtual stakes once · rematch new matchId',
        complete: true,
      },
      launch(ctx) {
        openStreetCricket(ctx);
      },
    });
    registerGame({
      id: 'gullykick',
      name: 'Gully Kick',
      desc: 'Practice · Classic / SD / Pressure',
      icon: '⚽',
      ratingKey: 'gullykick',
      gameType: 'solo',
      genre: 'rw_sports',
      solo: true,
      selfChat: true,
      dangal: true,
      chat1v1: true,
      order: 6,
      launch() {
        openGullyKick();
      },
    });
  }

  window.openStreetCricket = openStreetCricket;
  window.openGullyKick = openGullyKick;
})();
