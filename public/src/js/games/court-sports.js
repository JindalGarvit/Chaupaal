/**
 * Court sports — Badminton rally shell + Patang Live duel stakes (3/3 · Live v1).
 * Practice vs AI, or Live 1v1 (first cut wins · virtual stakes once · rematch new matchId).
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

  function buzz(a, extra) {
    if (typeof gameFeedback === 'function') gameFeedback(a, extra);
  }

  /** Shared court turn chrome — Prompt 7 role / wait feel */
  function courtTurnBanner(mode, label, sub) {
    if (typeof gameTurnBannerHtml === 'function') {
      return gameTurnBannerHtml({
        mode: mode || 'waiting',
        label: label || undefined,
        sub: sub || undefined,
        pulse: mode === 'yours',
      });
    }
    return (
      '<p class="cs-rally-msg" role="status">' +
      esc(label || '') +
      (sub ? ' · ' + esc(sub) : '') +
      '</p>'
    );
  }

  function courtWaitPanel(opts) {
    const o = opts || {};
    return (
      '<div class="cs-court-wait" role="status" aria-live="polite">' +
      courtTurnBanner(o.mode || 'waiting', o.title || 'Waiting…', o.sub || '') +
      (o.scoreHtml || '') +
      '<p class="cs-rally-msg">' +
      esc(o.detail || 'Court stays live — your controls return when it’s your contact.') +
      '</p>' +
      '</div>'
    );
  }

  function practiceSub(detail) {
    if (typeof DangalLive !== 'undefined' && DangalLive.modeChromeLabel) {
      return DangalLive.modeChromeLabel(false, detail || 'vs AI');
    }
    return detail ? 'Practice · ' + detail : 'Practice vs AI';
  }

  function liveSub() {
    if (typeof DangalLive !== 'undefined' && DangalLive.modeChromeLabel) {
      return DangalLive.modeChromeLabel(true);
    }
    return 'Live 1v1';
  }

  function resolveChat(arg) {
    if (typeof chatFromLaunch === 'function' && arg != null) {
      const from = chatFromLaunch(arg);
      if (from && (from.name || from.dangalMatchId || from.uid || from.opponentUid || from.peerUid)) {
        return from;
      }
    }
    if (arg && arg.chat) return resolveChat(arg.chat);
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
    return typeof DangalLive !== 'undefined' && DangalLive.isLive(chat);
  }

  function matchIdFor(chat, gameType) {
    return (
      (chat && chat.dangalMatchId) ||
      (window.__dangalLaunchCtx && window.__dangalLaunchCtx.matchId) ||
      (typeof dangalMatchId === 'function' ? dangalMatchId(gameType, chat) : gameType + '_' + Date.now())
    );
  }

  async function confirmAndClose(shell, opts) {
    const o = opts || {};
    if (typeof leaveGameShell === 'function') {
      return leaveGameShell(shell, {
        live: !!o.live || !!o.liveHandle,
        liveHandle: o.liveHandle != null ? o.liveHandle : shell.liveHandle,
        isPlaying: o.isPlaying,
        title: o.title,
        body: o.body,
        forfeitBody: o.forfeitBody,
        reason: o.reason || 'dismissed',
      });
    }
    const playing = o.isPlaying !== false;
    const live = !!o.live || !!o.liveHandle;
    if (typeof DangalLive !== 'undefined' && DangalLive.requestLeave) {
      const ok = await DangalLive.requestLeave({
        live,
        liveHandle: o.liveHandle,
        isPlaying: playing,
        title: o.title || 'Leave game?',
        body: o.body || 'This practice run will end.',
        forfeitBody: 'Leaving now counts as a forfeit for your opponent.',
        onLeave: () => {
          try {
            if (shell.markOver) shell.markOver();
          } catch (e) {}
          try {
            shell.liveHandle = null;
          } catch (e) {}
          shell.close(o.reason || 'dismissed');
        },
      });
      return !!ok;
    }
    if (typeof confirmLeaveGame === 'function') {
      const leave = await confirmLeaveGame({
        title: o.title || 'Leave game?',
        body:
          live && playing
            ? 'Leaving now counts as a forfeit for your opponent.'
            : o.body || 'This practice run will end.',
      });
      if (!leave) return false;
    }
    if (o.liveHandle && playing) {
      if (typeof detachLiveHandle === 'function') {
        detachLiveHandle(o.liveHandle, { forfeit: true, alreadyOver: !!shell.gameOver });
      } else {
        try {
          o.liveHandle.leave({ forfeit: true });
        } catch (e) {
          try {
            o.liveHandle.leave();
          } catch (e2) {}
        }
      }
    }
    try {
      if (shell.markOver) shell.markOver();
    } catch (e) {}
    try {
      shell.liveHandle = null;
    } catch (e) {}
    shell.close(o.reason || 'dismissed');
    return true;
  }

  function openShell(opts) {
    const o = opts || {};
    const overlay = document.createElement('div');
    overlay.className = 'game-overlay game-overlay--dark dangal-fullgame';
    overlay.style.cssText =
      'position:absolute;inset:0;z-index:80;display:flex;flex-direction:column;background:' +
      (o.bg || '#061018') +
      ';';
    let liveHandle = o.liveHandle || null;
    let gameOver = false;
    const begin = typeof beginGameOverlaySession === 'function' ? beginGameOverlaySession : null;
    const gs = begin
      ? begin({
          type: o.id,
          title: o.title,
          mode: o.mode || (o.live ? 'live' : 'practice'),
          overlay,
          chat: o.chat,
          source: o.source || (window.__dangalLaunchCtx && window.__dangalLaunchCtx.source) || '',
          cleanup() {
            if (typeof o.cleanup === 'function') o.cleanup();
            // If leaveGameShell already ran, liveHandle is null (no second forfeit).
            // Forced dismiss (chat scope) while still playing → forfeit once here.
            if (liveHandle) {
              if (typeof detachLiveHandle === 'function') {
                detachLiveHandle(liveHandle, { forfeit: !gameOver, alreadyOver: !!gameOver });
              } else {
                try {
                  liveHandle.leave({ forfeit: !gameOver });
                } catch (e) {
                  try {
                    liveHandle.leave();
                  } catch (e2) {}
                }
              }
              liveHandle = null;
            }
          },
        })
      : null;
    if (begin && (!gs || !gs.alive())) return null;
    if (!begin) {
      const device = document.querySelector('.device') || document.body;
      device.appendChild(overlay);
    }
    overlay.dataset.gameId = o.id || '';
    if (typeof applyGameIdentity === 'function') applyGameIdentity(o.id, overlay);
    const sub =
      o.subtitle ||
      (o.live ? liveSub() : practiceSub(o.practiceDetail || 'vs AI'));
    overlay.innerHTML =
      (typeof gameChromeHtml === 'function'
        ? gameChromeHtml({
            title: o.title,
            subtitle: sub,
            backId: o.backId || 'csBack',
            pauseId: o.pauseId || '',
            gameId: o.id || '',
          })
        : '') + `<div class="dangal-fullgame-body" data-cs-body></div>`;
    // After chrome DOM exists — accent CSS + mark inject if chrome omitted gameId
    if (typeof prepareGameOverlay === 'function') {
      prepareGameOverlay(overlay, { theme: 'dark', gameId: o.id, accent: o.accent });
    }
    const body = overlay.querySelector('[data-cs-body]');
    const close = (reason) => {
      gameOver = true;
      if (gs) gs.close(reason || 'dismissed');
      else if (typeof animateGameExit === 'function') animateGameExit(overlay, () => overlay.remove());
      else overlay.remove();
    };
    const shell = {
      overlay,
      body,
      gs,
      close,
      alive: () => (gs ? gs.alive() : true),
      host: overlay,
      get liveHandle() {
        return liveHandle;
      },
      set liveHandle(h) {
        liveHandle = h;
      },
      markOver() {
        gameOver = true;
      },
      get gameOver() {
        return gameOver;
      },
    };
    overlay.querySelector('#' + (o.backId || 'csBack'))?.addEventListener('click', async () => {
      await confirmAndClose(shell, {
        live: !!o.live || !!liveHandle,
        liveHandle,
        isPlaying: !gameOver,
        title: 'Leave ' + (o.title || 'game') + '?',
        body: o.leaveBody || 'This practice run will end.',
      });
    });
    return shell;
  }

  function showDuelResult(shell, spec) {
    if (shell && typeof shell.markOver === 'function') shell.markOver();
    const you = spec.you | 0;
    const opp = spec.opp | 0;
    const draw = you === opp;
    const won = you > opp;
    if (shell.gs && typeof shell.gs.setOutcome === 'function') {
      shell.gs.setOutcome(draw ? 'draw' : won ? 'won' : 'lost');
    }
    buzz(draw ? 'draw' : won ? 'win' : 'lose');
    if (typeof setGamePB === 'function' && spec.pbScore != null) setGamePB(spec.id, spec.pbScore);
    const html =
      typeof gameResultHtml === 'function'
        ? gameResultHtml({
            gameId: spec.id,
            glyph: spec.glyph,
            title: draw ? 'Draw' : won ? 'You win' : 'You lose',
            subtitle: spec.subtitle || '',
            you,
            opp,
            challenge: false,
          })
        : `<p>${won ? 'Win' : draw ? 'Draw' : 'Loss'}</p>`;
    shell.body.innerHTML = html;
    if (typeof wireGameResultActions === 'function') {
      wireGameResultActions(shell.body, {
        again: () => spec.onAgain(),
        share: () => {
          if (typeof openUnifiedShareSheet === 'function') {
            openUnifiedShareSheet({
              gameId: spec.id,
              stats: { scoreLine: you + '–' + opp, text: spec.shareText },
            });
          }
        },
      });
    }
  }

  /**
   * Per-sport rally scorebook (Prompt 2) — rally-point everywhere (no old badminton side-out).
   * Model: bwf21 (the rally shell serves Badminton).
   * Simplifications vs federation law are noted on the RALLIES entry / how-to.
   */
  function rallyScoreModel(spec) {
    return (spec && spec.scoreModel) || 'bwf21';
  }

  function rallyMatchSubtitle(spec) {
    return rallyScoreModel(spec) === 'bwf21' ? 'BWF-lite · Game to 21' : 'Rally';
  }

  function createRallyScoreState(model, serverIsMe) {
    const m = model || 'bwf21';
    return {
      model: m,
      you: 0,
      opp: 0,
      serverIsMe: !!serverIsMe,
      initialServerIsMe: !!serverIsMe,
    };
  }

  function rallyHudParts(state) {
    const st = state || {};
    const y = st.you | 0;
    const o = st.opp | 0;
    let note = '';
    if (y >= 20 && o >= 20) {
      note = y === 29 && o === 29 ? 'Next point wins' : 'Win by 2';
    }
    return { main: y + '–' + o, sub: note, line: y + '–' + o + (note ? ' · ' + note : '') };
  }

  /**
   * @param {object} state
   * @param {'me'|'opp'} who — winner of the timing rally
   * @returns {{ state: object, ended: boolean, winner: 'me'|'opp'|null, hud: object, note: string }}
   */
  function applyRallyWin(state, who) {
    const next = Object.assign({}, state);
    const w = who === 'opp' ? 'opp' : 'me';
    let ended = false;
    let winner = null;
    const note = '';

    if (w === 'me') next.you = (next.you | 0) + 1;
    else next.opp = (next.opp | 0) + 1;
    const y = next.you | 0;
    const o = next.opp | 0;
    // BWF-lite: 21, win by 2 after 20-all; 29-all → next point (30) wins. Winner serves.
    next.serverIsMe = w === 'me';
    if (y >= 30 || o >= 30) {
      ended = true;
      winner = y > o ? 'me' : 'opp';
    } else if ((y >= 21 || o >= 21) && Math.abs(y - o) >= 2) {
      ended = true;
      winner = y > o ? 'me' : 'opp';
    }

    const hud = rallyHudParts(next);
    return { state: next, ended: ended, winner: winner, hud: hud, note: note };
  }

  function bookSummaryScores(book) {
    if (!book) return { you: 0, opp: 0 };
    return { you: book.you | 0, opp: book.opp | 0 };
  }

  function serializeRallyBook(book, liveRoles) {
    if (!book) return null;
    const meIsA = !liveRoles || liveRoles.me === liveRoles.playerA;
    const flip = (me, opp) => (meIsA ? { a: me, b: opp } : { a: opp, b: me });
    const s = flip(book.you | 0, book.opp | 0);
    return {
      model: book.model,
      a: s.a,
      b: s.b,
      serverIsA: book.serverIsMe ? meIsA : !meIsA,
      initialServerIsA: book.initialServerIsMe ? meIsA : !meIsA,
    };
  }

  function deserializeRallyBook(raw, liveRoles, fallbackModel) {
    if (!raw || typeof raw !== 'object') {
      return createRallyScoreState(fallbackModel, true);
    }
    const meIsA = !liveRoles || liveRoles.me === liveRoles.playerA;
    const model = raw.model || fallbackModel || 'bwf21';
    return {
      model: model,
      you: meIsA ? raw.a | 0 : raw.b | 0,
      opp: meIsA ? raw.b | 0 : raw.a | 0,
      serverIsMe: raw.serverIsA == null ? true : !!raw.serverIsA === meIsA,
      initialServerIsMe: raw.initialServerIsA == null ? true : !!raw.initialServerIsA === meIsA,
    };
  }

  /**
   * Practice return craft (Prompt 3) — not used on Live seats.
   * Normal curve: base ~0.70 at full window; falls with shrink; −0.04/3 rallies pressure;
   * −0.08 after player sweet; serve +0.12; softForced +0.20. Easy +0.15 vs Normal; Sharp −0.10 + rarer soft.
   * Floor 0.28 / ceil 0.92. Returns 'sweet'|'early'|'late'|'miss'.
   */
  function aiContact(opts) {
    const o = opts || {};
    const diff = o.difficulty === 'easy' ? 'easy' : o.difficulty === 'sharp' ? 'sharp' : 'normal';
    const baseWin = Math.max(1, o.baseWindowMs || 720);
    const win = Math.max(280, o.windowMs || baseWin);
    const widthFactor = Math.min(1.2, win / baseWin);
    // Easy misses more; Sharp holds contact better under pressure
    let success = diff === 'easy' ? 0.58 : diff === 'sharp' ? 0.78 : 0.7;
    success *= 0.55 + 0.45 * widthFactor;
    success -= Math.min(0.22, Math.floor((o.rally || 0) / 3) * (diff === 'sharp' ? 0.025 : 0.04));
    if (o.lastPlayerQuality === 'sweet') {
      success -= diff === 'easy' ? 0.02 : diff === 'sharp' ? 0.12 : 0.08;
    }
    if (o.serving) success += diff === 'easy' ? 0.06 : 0.12;
    if (o.softForced) success = Math.min(0.95, success + (diff === 'easy' ? 0.12 : 0.22));
    success = Math.max(0.22, Math.min(0.92, success));
    if (Math.random() > success) {
      const r = Math.random();
      if (r < 0.4) return 'early';
      if (r < 0.85) return 'late';
      return 'miss';
    }
    return 'sweet';
  }

  function openRallySport(spec) {
    const chat = resolveChat(spec.chat || arguments[0]);
    const liveOn = chatLiveOn(chat);
    const scoreModel = rallyScoreModel(spec);
    const matchSub = rallyMatchSubtitle(spec);
    const pauseId = 'csRallyPause_' + (spec.id || 'sport');
    const projKind = spec.projectile === 'shuttle' ? 'shuttle' : 'ball';
    const courtTint = spec.courtTint || spec.accent || '#2E7D32';
    const launchDiff = String(spec.aiDiff || spec.difficulty || 'normal').toLowerCase();
    let aiDiff = launchDiff === 'easy' ? 'easy' : launchDiff === 'sharp' ? 'sharp' : 'normal';
    /** Live stakes: settle ONCE on over/forfeit (virtual — not real money). Practice never charges. */
    const liveStake = liveOn
      ? Number(
          (chat && chat.stake) != null
            ? chat.stake
            : (window.__dangalLaunchCtx && window.__dangalLaunchCtx.stake) || 0
        ) || 0
      : 0;
    const settleMatchId = liveOn ? String(matchIdFor(chat, spec.id) || '').trim() : '';
    let settleOppUid = '';
    let settleDone = false;
    let pauseCtrl = null;
    let rallyPaused = false;
    let peerPaused = false;
    let activeRaf = 0;
    let flashContact = false;
    let coachShown = false;
    let practiceAiTurn = false;
    let lastPlayerQuality = 'ok';
    let softPlayerWindow = false;
    let contactsSinceSoft = 0;
    let aiTok = 0;
    let diffLocked = false;
    /** Contact authority: contacting client proposes; peers apply once by contactSeq / eventSeq. */
    let contactSeq = 0;
    let appliedContactSeq = 0;
    let appliedPointSeq = 0;
    try {
      coachShown = !!(typeof localStorage !== 'undefined' && localStorage.getItem('chaupaal_rally_coach_' + (spec.id || '')));
    } catch (e) {}
    const shell = openShell({
      id: spec.id,
      title: spec.name,
      subtitle: liveOn
        ? liveSub() +
          ' · ' +
          matchSub +
          (liveStake > 0 ? ' · Stake ⚡' + liveStake + ' (virtual)' : ' · Friendly')
        : practiceSub(matchSub + ' · ' + (aiDiff === 'easy' ? 'Easy' : aiDiff === 'sharp' ? 'Sharp' : 'Normal')),
      mode: liveOn ? 'live' : 'practice',
      live: liveOn,
      chat,
      accent: spec.accent,
      bg: spec.bg,
      pauseId,
      leaveBody: liveOn ? 'You’ll forfeit this Live match.' : 'This practice run will end.',
      cleanup: () => {
        aiTok += 1;
        if (activeRaf) {
          cancelAnimationFrame(activeRaf);
          activeRaf = 0;
        }
        if (pauseCtrl) pauseCtrl.destroy();
      },
    });
    if (!shell) return;

    if (typeof GameUI !== 'undefined' && GameUI.attachHowTo) {
      const howBodies = {
        badminton:
          'BWF-lite · one game to 21, win by 2 after 20-all, 29-all → 30. Rally point; winner serves. Arcade timing — not full BWF court physics or best-of-3.',
      };
      GameUI.attachHowTo(shell.overlay, {
        title: spec.name || 'Rally',
        body: howBodies[spec.id] || matchSub + ' · arcade timing',
      });
    }

    function isFrozen() {
      return !!(rallyPaused || peerPaused);
    }

    function pushPauseState(paused) {
      if (!liveOn || !liveHandle || !liveRoles || ended) return;
      try {
        liveHandle.push({
          status: 'playing',
          turn: myServe ? liveRoles.me : liveRoles.opp,
          state: {
            paused: !!paused,
            scores: scoresForPush(),
            book: serializeRallyBook(book, liveRoles),
            servingUid: book.serverIsMe ? liveRoles.me : liveRoles.opp,
            contactSeq,
            eventSeq,
            rally,
            windowMs,
            scoreModel: scoreModel,
            hud: rallyHudParts(book).line,
          },
        });
      } catch (e) {}
    }

    if (typeof createGamePauseController === 'function') {
      pauseCtrl = createGamePauseController({
        host: shell.host || shell.overlay,
        pauseBtnId: pauseId,
        onPause() {
          rallyPaused = true;
          pushPauseState(true);
        },
        onResume() {
          rallyPaused = false;
          pushPauseState(false);
        },
        onQuit: () => shell.close('dismissed'),
      });
    }

    let book = createRallyScoreState(scoreModel, true);
    let you = 0;
    let opp = 0;
    let rally = 0;
    let windowMs = spec.windowMs || 720;
    let serving = true;
    let myServe = true;
    let locked = false;
    let ended = false;
    let applying = false;
    let liveRoles = null;
    let liveHandle = null;
    let eventSeq = 0;
    let resultPainted = false;

    function syncFromBook() {
      const sum = bookSummaryScores(book);
      you = sum.you;
      opp = sum.opp;
      myServe = !!book.serverIsMe;
    }

    function maybeCoach() {
      if (coachShown || liveOn) return;
      coachShown = true;
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem('chaupaal_rally_coach_' + (spec.id || ''), '1');
      } catch (e) {}
      const tips = {
        badminton: 'BWF-lite · sweet hits tighten the rally. Game to 21 (win by 2).',
      };
      const tip = tips[spec.id] || 'Sweet hits tighten the rally — AI will push back.';
      if (typeof showToast === 'function') showToast(tip);
    }

    function setAiDiff(d) {
      if (liveOn || diffLocked || ended) return;
      aiDiff = d === 'easy' ? 'easy' : d === 'sharp' ? 'sharp' : 'normal';
      if (typeof gameFeedback === 'function') gameFeedback('select');
      try {
        if (shell.setSubtitle) {
          shell.setSubtitle(practiceSub(matchSub + ' · ' + (aiDiff === 'easy' ? 'Easy' : aiDiff === 'sharp' ? 'Sharp' : 'Normal')));
        }
      } catch (e) {}
      renderPlay(spec.prompt);
    }

    function scoresForPush() {
      const packed = serializeRallyBook(book, liveRoles);
      if (!packed) return { a: 0, b: 0 };
      return { a: packed.a | 0, b: packed.b | 0 };
    }

    function applyScores(sc) {
      // Legacy numeric-only snaps — keep as fallback.
      if (!sc || !liveRoles) return;
      if (liveRoles.me === liveRoles.playerA) {
        book.you = sc.a | 0;
        book.opp = sc.b | 0;
      } else {
        book.you = sc.b | 0;
        book.opp = sc.a | 0;
      }
      syncFromBook();
    }

    function pushPoint(whoScored, msg) {
      if (!liveOn || !liveHandle || !liveRoles || applying) return;
      eventSeq += 1;
      appliedPointSeq = Math.max(appliedPointSeq, eventSeq);
      serving = true;
      const sum = bookSummaryScores(book);
      const iWon = sum.you > sum.opp;
      liveHandle.push({
        status: ended ? 'over' : 'playing',
        winner: ended ? (iWon ? liveRoles.me : liveRoles.opp) : null,
        turn: book.serverIsMe ? liveRoles.me : liveRoles.opp,
        state: {
          scores: scoresForPush(),
          book: serializeRallyBook(book, liveRoles),
          hud: rallyHudParts(book).line,
          servingUid: book.serverIsMe ? liveRoles.me : liveRoles.opp,
          rally: 0,
          windowMs: spec.windowMs || 720,
          eventSeq,
          contactSeq,
          msg: msg || '',
          pointBy: whoScored === 'me' ? liveRoles.me : liveRoles.opp,
          scoreModel: scoreModel,
          paused: false,
        },
      });
    }

    async function settleRallyOnce(won, isDraw) {
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
          gameType: spec.id,
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
    }

    function freshRematch() {
      if (!liveOn) {
        openRallySport(Object.assign({}, spec, { chat, aiDiff }));
        return;
      }
      try {
        const mid =
          typeof dangalMatchId === 'function'
            ? dangalMatchId(spec.id, chat)
            : spec.id + '_' + Date.now();
        if (window.__dangalLaunchCtx) {
          window.__dangalLaunchCtx = Object.assign({}, window.__dangalLaunchCtx, {
            matchId: mid,
            gameId: spec.id,
            gameType: spec.id,
            stake: liveStake,
          });
        }
        if (chat) {
          chat.dangalMatchId = mid;
          chat.stake = liveStake;
        }
      } catch (e) {}
      openRallySport(Object.assign({}, spec, { chat, aiDiff }));
    }

    function awardPoint(who, msg) {
      aiTok += 1;
      practiceAiTurn = false;
      softPlayerWindow = false;
      contactsSinceSoft = 0;
      const res = applyRallyWin(book, who);
      book = res.state;
      syncFromBook();
      rally = 0;
      serving = true;
      windowMs = spec.windowMs || 720;
      const line =
        (msg || (who === 'me' ? 'Your point.' : liveOn ? 'Opponent point.' : 'Practice AI point.')) +
        (res.note ? ' · ' + res.note : '');
      if (res.ended) {
        ended = true;
        if (liveOn) pushPoint(who, line);
        return finish({ skipPush: true });
      }
      if (liveOn) pushPoint(who, line);
      // Practice: AI serve window when they own the scorebook serve (never Live).
      if (!liveOn && !book.serverIsMe) {
        practiceAiTurn = true;
        renderPlay(line + ' · Practice AI serves');
        return;
      }
      practiceAiTurn = false;
      renderPlay(line);
    }

    function renderPlay(msg) {
      if (!shell.alive() || ended) return;
      aiTok += 1;
      if (activeRaf) {
        cancelAnimationFrame(activeRaf);
        activeRaf = 0;
      }
      maybeCoach();
      syncFromBook();
      // Live: human contact only. Practice: player unless practiceAiTurn.
      const iAmActive = liveOn ? !!myServe : !practiceAiTurn;
      const pointServerNear = !!book.serverIsMe;
      const hitLabel = serving ? spec.serveLabel || 'Serve' : spec.hitLabel || 'Hit';
      const doFlash = flashContact;
      flashContact = false;
      const sportMod = 'cs-rally--' + (spec.id || 'sport');
      const hud = rallyHudParts(book);
      const showDiffPick = !liveOn && !diffLocked && rally === 0 && serving && !practiceAiTurn && !ended;
      const baseWin = spec.windowMs || 720;
      shell.body.innerHTML = `
        <div class="cs-rally ${esc(sportMod)}" style="--rally-accent:${esc(spec.accent || '#E63946')};--rally-court:${esc(courtTint)};">
          ${courtTurnBanner(
            iAmActive ? 'yours' : 'theirs',
            iAmActive
              ? serving
                ? 'Your serve'
                : 'Your contact'
              : liveOn
                ? 'Opponent’s contact'
                : 'Opponent contact…',
            hud.main + (hud.sub ? ' · ' + hud.sub : '')
          )}
          <div class="cs-rally-score">${esc(spec.icon)} <strong>${esc(hud.main)}</strong></div>
          ${hud.sub ? `<p class="cs-rally-score-sub">${esc(hud.sub)}</p>` : ''}
          ${
            showDiffPick
              ? `<div class="cs-rally-diff" role="group" aria-label="AI difficulty">
            <button type="button" class="cs-rally-diff-btn${aiDiff === 'easy' ? ' is-active' : ''}" data-rally-diff="easy">Easy</button>
            <button type="button" class="cs-rally-diff-btn${aiDiff === 'normal' ? ' is-active' : ''}" data-rally-diff="normal">Normal</button>
            <button type="button" class="cs-rally-diff-btn${aiDiff === 'sharp' ? ' is-active' : ''}" data-rally-diff="sharp">Sharp</button>
          </div>`
              : ''
          }
          <p class="cs-rally-msg">${esc(msg || spec.prompt)}</p>
          <div class="cs-rally-court${doFlash ? ' is-flash' : ''}${!iAmActive ? ' is-waiting' : ''}${
            practiceAiTurn && !liveOn ? ' is-ai' : ''
          }" data-server="${pointServerNear ? 'near' : 'far'}" aria-hidden="true">
            <div class="cs-rally-half cs-rally-half--far${pointServerNear ? '' : ' is-server'}">
              <span class="cs-rally-side-label">${pointServerNear ? 'Them' : 'Serve'}</span>
            </div>
            <div class="cs-rally-net"></div>
            <div class="cs-rally-half cs-rally-half--near${pointServerNear ? ' is-server' : ''}">
              <span class="cs-rally-side-label">${pointServerNear ? 'Serve' : 'You'}</span>
            </div>
            <div class="cs-rally-proj cs-rally-proj--${esc(projKind)}${iAmActive ? '' : ' is-idle'}" data-cs-proj>
              ${
                projKind === 'shuttle'
                  ? '<span class="cs-rally-proj-glyph" aria-hidden="true">🏸</span>'
                  : '<span class="cs-rally-proj-orb" aria-hidden="true"></span>'
              }
            </div>
            <div class="cs-rally-window">
              <div class="cs-timing" aria-hidden="true"><i data-cs-bar></i><b class="cs-rally-sweet"></b></div>
            </div>
          </div>
          <div class="cs-court-actions">
          <button type="button" class="cs-hit${iAmActive ? ' cs-hit--primary' : ''}" data-cs-hit ${!iAmActive ? 'disabled' : ''}>${esc(
            !iAmActive && !liveOn ? 'Practice AI…' : hitLabel
          )}</button>
          </div>
          <p class="cs-rally-hint">${
            liveOn
              ? iAmActive
                ? 'Rally ' + rally + ' · ' + esc(matchSub) + ' · your contact'
                : 'Score stays live — wait for your contact window'
              : practiceAiTurn
                ? 'Practice AI contact · ' + (aiDiff === 'easy' ? 'Easy' : aiDiff === 'sharp' ? 'Sharp' : 'Normal')
                : 'Rally ' + rally + ' · ' + esc(matchSub) + (softPlayerWindow ? ' · soft ball' : '')
          }</p>
        </div>`;
      if (showDiffPick) {
        shell.body.querySelectorAll('[data-rally-diff]').forEach((btn) => {
          btn.addEventListener('click', () => setAiDiff(btn.getAttribute('data-rally-diff')));
        });
      }
      const bar = shell.body.querySelector('[data-cs-bar]');
      const proj = shell.body.querySelector('[data-cs-proj]');
      const hit = shell.body.querySelector('[data-cs-hit]');
      const court = shell.body.querySelector('.cs-rally-court');
      let t0 = 0;
      let pauseAnchor = 0;
      locked = false;

      function setProjectile(p, towardNear) {
        if (!proj) return;
        const near = towardNear !== false;
        const y = near ? 14 + p * 62 : 76 - p * 62;
        const x = 50 + Math.sin(p * Math.PI) * (projKind === 'shuttle' ? 10 : 6);
        proj.style.setProperty('--rally-x', x + '%');
        proj.style.setProperty('--rally-y', y + '%');
        proj.classList.toggle('is-sweet', p >= 0.42 && p <= 0.78);
        proj.classList.toggle('is-late', p > 0.78);
        if (court) court.classList.toggle('is-sweet', p >= 0.42 && p <= 0.78);
      }

      // Practice AI contact — never on Live seats
      if (!liveOn && practiceAiTurn) {
        const tok = aiTok;
        contactsSinceSoft += 1;
        const softEvery = aiDiff === 'sharp' ? 5 : aiDiff === 'easy' ? 3 : 4;
        const forceSoft = !serving && contactsSinceSoft >= softEvery;
        if (forceSoft) contactsSinceSoft = 0;
        let duration = serving ? Math.max(950, windowMs + 220) : windowMs;
        if (forceSoft) duration = Math.min(baseWin * 1.2, duration * 1.35);
        const decision = aiContact({
          windowMs: duration,
          baseWindowMs: baseWin,
          rally: rally,
          serving: serving,
          difficulty: aiDiff,
          lastPlayerQuality: lastPlayerQuality,
          softForced: forceSoft,
        });
        const targetP =
          decision === 'sweet'
            ? 0.48 + Math.random() * 0.22
            : decision === 'early'
              ? 0.18 + Math.random() * 0.18
              : decision === 'late'
                ? 0.82 + Math.random() * 0.12
                : 0.96;
        const resolveAt = Math.max(0.32, Math.min(0.98, targetP));
        setProjectile(0, false);

        function resolveAi() {
          if (tok !== aiTok || !shell.alive() || ended || locked) return;
          locked = true;
          if (activeRaf) {
            cancelAnimationFrame(activeRaf);
            activeRaf = 0;
          }
          if (decision === 'sweet') {
            flashContact = true;
            if (proj) proj.classList.add('is-hit');
            if (court) court.classList.add('is-flash');
            buzz('move');
            rally += 1;
            serving = false;
            practiceAiTurn = false;
            softPlayerWindow = !!forceSoft;
            windowMs = Math.max(380, windowMs * (spec.shrink || 0.94));
            renderPlay(forceSoft ? 'Soft return — attack!' : 'Returned — your shot.');
            return;
          }
          buzz('lose', { noConfetti: true });
          const why = decision === 'early' ? 'Early' : decision === 'late' ? 'Late' : 'Miss';
          awardPoint('me', 'Opponent ' + why.toLowerCase() + ' — your point.');
        }

        function aiTick(now) {
          if (tok !== aiTok || !shell.alive() || ended || locked) {
            activeRaf = 0;
            return;
          }
          if (rallyPaused) {
            if (!pauseAnchor) pauseAnchor = now;
            activeRaf = requestAnimationFrame(aiTick);
            return;
          }
          if (peerPaused) {
            if (!pauseAnchor) pauseAnchor = now;
            activeRaf = requestAnimationFrame(aiTick);
            return;
          }
          if (pauseAnchor) {
            if (t0) t0 += now - pauseAnchor;
            pauseAnchor = 0;
          }
          if (!t0) t0 = now;
          const p = Math.min(1, (now - t0) / duration);
          if (bar) bar.style.transform = 'scaleX(' + p + ')';
          setProjectile(p, false);
          if (p >= resolveAt) {
            activeRaf = 0;
            resolveAi();
            return;
          }
          if (p >= 1) {
            activeRaf = 0;
            if (!locked) {
              locked = true;
              awardPoint('me', 'Opponent late — your point.');
            }
            return;
          }
          activeRaf = requestAnimationFrame(aiTick);
        }
        activeRaf = requestAnimationFrame(aiTick);
        return;
      }

      if (!iAmActive) {
        setProjectile(0.18, true);
        return;
      }

      let duration = serving ? Math.max(900, windowMs + 200) : windowMs;
      if (softPlayerWindow) {
        duration = Math.min(baseWin * 1.25, duration * 1.3);
        softPlayerWindow = false;
      }
      const sweet0 = 0.42;
      const sweet1 = 0.78;
      setProjectile(0, true);

      function tick(now) {
        if (!shell.alive() || ended || locked) {
          activeRaf = 0;
          return;
        }
        if (isFrozen()) {
          if (!pauseAnchor) pauseAnchor = now;
          activeRaf = requestAnimationFrame(tick);
          return;
        }
        if (pauseAnchor) {
          if (t0) t0 += now - pauseAnchor;
          pauseAnchor = 0;
        }
        if (!t0) t0 = now;
        const p = Math.min(1, (now - t0) / duration);
        if (bar) bar.style.transform = 'scaleX(' + p + ')';
        setProjectile(p, true);
        if (p >= 1) {
          activeRaf = 0;
          if (!locked) miss('Late');
          return;
        }
        activeRaf = requestAnimationFrame(tick);
      }
      activeRaf = requestAnimationFrame(tick);

      hit?.addEventListener('click', () => {
        if (locked || !iAmActive || isFrozen() || practiceAiTurn) return;
        const elapsedBase = t0 ? performance.now() - t0 : 0;
        const pauseExtra = pauseAnchor ? performance.now() - pauseAnchor : 0;
        const p = t0 ? Math.min(1, (elapsedBase - pauseExtra) / duration) : 0;
        if (p < sweet0) {
          miss('Early');
          return;
        }
        if (p > sweet1) {
          miss('Late');
          return;
        }
        locked = true;
        diffLocked = true;
        if (activeRaf) {
          cancelAnimationFrame(activeRaf);
          activeRaf = 0;
        }
        flashContact = true;
        if (proj) proj.classList.add('is-hit');
        if (court) court.classList.add('is-flash');
        buzz('kick');
        lastPlayerQuality = 'sweet';
        rally += 1;
        serving = false;
        windowMs = Math.max(380, windowMs * (spec.shrink || 0.94));
        if (liveOn) {
          // Authority: contacting client proposes sweet hit + contactSeq; peer applies once.
          contactSeq += 1;
          appliedContactSeq = contactSeq;
          liveHandle.push({
            status: 'playing',
            turn: liveRoles.opp,
            state: {
              scores: scoresForPush(),
              book: serializeRallyBook(book, liveRoles),
              servingUid: book.serverIsMe ? liveRoles.me : liveRoles.opp,
              inPlay: true,
              contactSeq,
              contactBy: liveRoles.me,
              contactQuality: 'sweet',
              rally,
              windowMs,
              eventSeq,
              msg: spec.goodLine || 'In! Keep the rally going.',
              scoreModel: scoreModel,
              hud: rallyHudParts(book).line,
              paused: false,
            },
          });
          myServe = false;
          serving = false;
          renderPlay(spec.goodLine || 'In! Keep the rally going.');
          return;
        }
        // Practice: hand contact to return-craft AI (never coin-flip / never Live).
        practiceAiTurn = true;
        renderPlay('In — opponent returning…');
      });

      function miss(why) {
        if (locked) return;
        locked = true;
        diffLocked = true;
        lastPlayerQuality = why === 'Early' ? 'early' : 'late';
        if (activeRaf) {
          cancelAnimationFrame(activeRaf);
          activeRaf = 0;
        }
        buzz('lose', { noConfetti: true });
        awardPoint('opp', why + ' — opponent point.');
      }
    }

    function finish(opts) {
      const o = opts || {};
      if (resultPainted) return;
      resultPainted = true;
      ended = true;
      if (shell && typeof shell.markOver === 'function') shell.markOver();
      aiTok += 1;
      practiceAiTurn = false;
      if (activeRaf) {
        cancelAnimationFrame(activeRaf);
        activeRaf = 0;
      }
      syncFromBook();
      if (liveRoles && liveRoles.opp) settleOppUid = liveRoles.opp;
      const hud = rallyHudParts(book);
      const sum = bookSummaryScores(book);
      const forfeit = !!o.forfeit;
      const draw = !forfeit && sum.you === sum.opp;
      const won = forfeit ? !!o.iWon : sum.you > sum.opp;
      if (liveOn && liveHandle && liveRoles && !applying && !o.skipPush) {
        liveHandle.push({
          status: forfeit ? 'forfeit' : 'over',
          winner: draw ? null : won ? liveRoles.me : liveRoles.opp,
          state: {
            scores: scoresForPush(),
            book: serializeRallyBook(book, liveRoles),
            hud: hud.line,
            eventSeq,
            contactSeq,
            scoreModel: scoreModel,
            msg: o.msg || hud.line,
          },
        });
      }
      const baseSub = (o.msg ? o.msg + ' · ' : '') + hud.line + ' · ' + matchSub;
      settleRallyOnce(won, draw).then((settle) => {
        let sub = baseSub;
        if (liveOn && liveStake > 0) {
          const cd = settle && settle.chipDelta != null ? Number(settle.chipDelta) : null;
          sub +=
            ' · ' +
            (Number.isFinite(cd) && cd !== 0
              ? 'Stake ' + (cd > 0 ? '+' : '') + cd + ' virtual'
              : 'Virtual stakes · not real money');
        } else if (liveOn) {
          sub += ' · Live 1v1 · Friendly';
        }
        showDuelResult(shell, {
          id: spec.id,
          you: sum.you,
          opp: sum.opp,
          glyph: spec.icon,
          pbScore: sum.you,
          subtitle: sub,
          shareText: 'I played ' + spec.name + ' on Chaupaal: ' + hud.line,
          onAgain: freshRematch,
        });
      });
    }

    if (liveOn && typeof DangalLive !== 'undefined') {
      const roles = DangalLive.roles(chat);
      liveRoles = roles;
      settleOppUid = roles.opp || '';
      book = createRallyScoreState(scoreModel, !!roles.host);
      syncFromBook();
      serving = true;
      practiceAiTurn = false; // never Practice AI on Live seats
      liveHandle = DangalLive.join({
        gameType: spec.id,
        matchId: matchIdFor(chat, spec.id),
        me: roles.me,
        playerA: roles.playerA,
        playerB: roles.playerB,
        onSnap(val) {
          if (!val || ended || !shell.alive()) return;
          if (val.status === 'forfeit' || val.status === 'over') {
            applying = true;
            const st0 = val.state || {};
            if (st0.book) {
              book = deserializeRallyBook(st0.book, roles, scoreModel);
              syncFromBook();
            } else if (st0.scores) applyScores(st0.scores);
            else if (val.winner != null) {
              const iWon = val.winner === roles.me;
              book.you = iWon ? Math.max(book.you | 0, 21) : book.you | 0;
              book.opp = iWon ? book.opp | 0 : Math.max(book.opp | 0, 21);
              syncFromBook();
            }
            const iWonEnd = val.winner == null ? you > opp : val.winner === roles.me;
            finish({
              skipPush: true,
              forfeit: val.status === 'forfeit',
              iWon: iWonEnd,
              msg: val.status === 'forfeit' ? (iWonEnd ? 'Opponent left' : 'You left') : '',
            });
            applying = false;
            return;
          }
          const st = val.state || {};
          if (st.paused != null) {
            peerPaused = !!st.paused && val.turn !== undefined;
            // Peer pause freezes both; local pause already in rallyPaused
            if (st.paused && !rallyPaused) peerPaused = true;
            if (!st.paused) peerPaused = false;
          }
          if (st.eventSeq != null) eventSeq = Math.max(eventSeq, st.eventSeq | 0);
          if (st.contactSeq != null) contactSeq = Math.max(contactSeq, st.contactSeq | 0);

          // Point award — apply canonical book once (no double applyRallyWin)
          if (st.pointBy && st.eventSeq != null) {
            const seq = st.eventSeq | 0;
            if (seq <= appliedPointSeq) return;
            appliedPointSeq = seq;
            if (st.book) {
              book = deserializeRallyBook(st.book, roles, scoreModel);
              syncFromBook();
            } else if (st.scores) applyScores(st.scores);
            rally = 0;
            windowMs = spec.windowMs || 720;
            serving = true;
            practiceAiTurn = false;
            if (st.servingUid) {
              myServe = st.servingUid === roles.me;
              book.serverIsMe = myServe;
            }
            peerPaused = false;
            if (val.status === 'over') return finish({ skipPush: true });
            renderPlay(st.msg || st.hud || 'Point — next serve.');
            return;
          }

          // In-rally contact — contacting client proposes; apply once by contactSeq
          if (st.inPlay && st.contactSeq != null) {
            const cseq = st.contactSeq | 0;
            if (cseq <= appliedContactSeq) return;
            appliedContactSeq = cseq;
            if (st.book) {
              book = deserializeRallyBook(st.book, roles, scoreModel);
              // Keep scorebook server; mid-rally contact doesn't flip serve law
              syncFromBook();
            }
            if (st.rally != null) rally = st.rally | 0;
            if (st.windowMs) windowMs = st.windowMs;
            serving = false;
            practiceAiTurn = false;
            peerPaused = !!st.paused;
            myServe = val.turn === roles.me;
            if (myServe) renderPlay(st.msg || 'Return!');
            else renderPlay(st.msg || 'In play…');
            return;
          }

          if (st.inPlay && val.turn === roles.me) {
            // Legacy snap without contactSeq
            serving = false;
            myServe = true;
            practiceAiTurn = false;
            if (st.windowMs) windowMs = st.windowMs;
            if (st.rally != null) rally = st.rally;
            renderPlay(st.msg || 'Return!');
            return;
          }
          if (st.book && !st.inPlay && !st.pointBy) {
            book = deserializeRallyBook(st.book, roles, scoreModel);
            syncFromBook();
          }
          if (st.servingUid && !st.inPlay) {
            myServe = st.servingUid === roles.me;
            book.serverIsMe = myServe;
            serving = true;
          }
        },
        onForfeit(info) {
          if (ended) return;
          const iWon = info && info.winner === roles.me;
          book.you = iWon ? 21 : book.you | 0;
          book.opp = iWon ? book.opp | 0 : 21;
          syncFromBook();
          finish({ skipPush: true, forfeit: true, iWon: !!iWon, msg: iWon ? 'Opponent left' : 'You left' });
        },
      });
      shell.liveHandle = liveHandle;
      if (roles.host) {
        liveHandle.push({
          status: 'playing',
          turn: roles.me,
          state: {
            scores: scoresForPush(),
            book: serializeRallyBook(book, roles),
            servingUid: roles.me,
            eventSeq: 0,
            contactSeq: 0,
            scoreModel: scoreModel,
            hud: rallyHudParts(book).line,
            paused: false,
          },
        });
      }
    }

    renderPlay(spec.prompt);
  }

  const PATANG_LAST_MODE_KEY = 'chaupaal_patang_last_mode';
  const PATANG_STREAK_KEY = 'chaupaal_patang_duel_streak';

  function patangLastMode() {
    try {
      const m = localStorage.getItem(PATANG_LAST_MODE_KEY);
      if (m === 'festival' || m === 'duel') return m;
    } catch (e) {}
    return 'duel';
  }

  function patangSaveMode(mode) {
    try {
      localStorage.setItem(PATANG_LAST_MODE_KEY, mode);
    } catch (e) {}
  }

  function patangDuelStreak() {
    try {
      return Math.max(0, parseInt(localStorage.getItem(PATANG_STREAK_KEY) || '0', 10) || 0);
    } catch (e) {
      return 0;
    }
  }

  function patangSetDuelStreak(n) {
    try {
      localStorage.setItem(PATANG_STREAK_KEY, String(Math.max(0, n | 0)));
    } catch (e) {}
  }

  function openPatangModeSheet() {
    try {
      document.querySelectorAll('.cs-patang-pick').forEach((el) => el.remove());
    } catch (e) {}
    // Live/challenge never uses this sheet — Duel sky only.
    try {
      const liveChat = resolveChat(window.__dangalLaunchCtx || null);
      if (chatLiveOn(liveChat)) {
        openPatang({ mode: 'duel', chat: liveChat });
        return;
      }
    } catch (e) {}
    const device = document.querySelector('.device');
    const duelBest = typeof getGamePB === 'function' ? getGamePB('patangbaazi_duel') : null;
    const festBest = typeof getGamePB === 'function' ? getGamePB('patangbaazi_festival') : null;
    const festCuts = typeof getGamePB === 'function' ? getGamePB('patangbaazi_festival_cuts') : null;
    const last = patangLastMode();
    const duelLine =
      duelBest != null
        ? 'Best streak ' + duelBest + ' · Practice vs hunter'
        : 'Practice vs hunter · Live from a challenge';
    const festLine =
      festBest != null
        ? 'Practice only · Best ' +
          festBest +
          's' +
          (festCuts != null ? ' · ' + festCuts + ' cuts' : '')
        : 'Practice only — last as long as you can against the heat';

    function pick(mode) {
      if (sheet && sheet.parentNode) sheet.remove();
      try {
        const active = document.querySelector('.game-overlay[data-game-id="patangbaazi"]');
        if (active) {
          try {
            active.dispatchEvent(new CustomEvent('chaupaal:dismiss', { bubbles: true }));
          } catch (e) {}
          if (active.isConnected) {
            try {
              active.remove();
            } catch (e2) {}
          }
        }
      } catch (e) {}
      // Festival is Practice-only — never open under Live chat.
      openPatang({ mode: mode === 'festival' ? 'festival' : 'duel' });
    }

    if (!device) {
      pick(last === 'festival' ? 'festival' : 'duel');
      return;
    }

    const sheet = document.createElement('div');
    sheet.className = 'cs-patang-pick';
    sheet.innerHTML = `
      <div class="cs-patang-pick-card" role="dialog" aria-label="Choose a sky">
        <div class="cs-patang-pick-title">Patang Baazi</div>
        <div class="cs-patang-pick-sub">Practice skies below. Live challenge opens Duel (first cut wins) — Festival is Practice-only.</div>
        <button type="button" class="cs-patang-pick-btn${last === 'duel' ? ' is-last' : ''}" data-patang-mode="duel">
          <span class="cs-patang-pick-name">Duel</span>
          <span class="cs-patang-pick-desc">${esc(duelLine)}</span>
        </button>
        <button type="button" class="cs-patang-pick-btn${last === 'festival' ? ' is-last' : ''}" data-patang-mode="festival">
          <span class="cs-patang-pick-name">Festival · Practice</span>
          <span class="cs-patang-pick-desc">${esc(festLine)}</span>
        </button>
        <button type="button" class="cs-patang-pick-cancel" data-patang-cancel>Cancel</button>
      </div>`;
    device.appendChild(sheet);
    sheet.querySelectorAll('[data-patang-mode]').forEach((btn) => {
      btn.addEventListener('click', () => pick(btn.dataset.patangMode));
    });
    sheet.querySelector('[data-patang-cancel]')?.addEventListener('click', () => sheet.remove());
  }

  /**
   * Patang Baazi — Practice duel/festival + Live duel with stakes (Prompt 3/3 · Live v1).
   * Live: Duel only · first cut wins · host wind + cut authority · settle once · rematch new matchId.
   * Festival: Practice-only (never on Live challenge).
   */
  function openPatang(opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    const chat = resolveChat(o.chat != null ? o.chat : arguments[0] != null ? arguments[0] : o);
    const liveOn = chatLiveOn(chat);
    // Live always Duel — Festival never on Live challenge.
    const playMode = liveOn ? 'duel' : o.mode === 'festival' ? 'festival' : 'duel';
    if (!liveOn) patangSaveMode(playMode);
    const isFestival = playMode === 'festival';
    const liveStake = liveOn
      ? Number(
          (chat && chat.stake) != null
            ? chat.stake
            : (window.__dangalLaunchCtx && window.__dangalLaunchCtx.stake) || 0
        ) || 0
      : 0;
    const settleMatchId = liveOn ? String(matchIdFor(chat, 'patangbaazi') || '').trim() : '';
    let settleOppUid = '';
    let settleDone = false;
    let resultReported = false;
    let resultShown = false;
    let stakeSettleNote = '';
    let raf = 0;
    let pauseCtrl = null;
    let lastTs = 0;
    let liveRoles = null;
    let liveHandle = null;
    let eventSeq = 0;
    let appliedSeq = 0;
    let applying = false;
    let peerPaused = false;
    let lastPushAt = 0;
    const SYNC_MS = 100;
    /** Live win rule: first decisive cut wins (Prompt 2). Practice duel keeps WAVES_TO_WIN=2. */
    const LIVE_CUTS_TO_WIN = 1;
    const liveWinLabel = LIVE_CUTS_TO_WIN === 1 ? 'First cut wins' : 'First to ' + LIVE_CUTS_TO_WIN + ' cuts';
    let cutSeq = 0;
    let appliedCutSeq = 0;
    let cutLocked = false;
    let liveCutArmed = false;
    const matchId = settleMatchId;
    /** Host-authority wind + cut resolve — peer applies from snaps. */
    let iAmHost = true;

    const shell = openShell({
      id: 'patangbaazi',
      title: 'Patang Baazi',
      subtitle: liveOn
        ? liveSub() +
          (liveStake > 0 ? ' · Stake ⚡' + liveStake + ' (virtual)' : ' · Friendly') +
          ' · ' +
          liveWinLabel
        : practiceSub(isFestival ? 'Festival · Practice heat' : 'Duel · cut the hunter'),
      mode: liveOn ? 'live' : 'practice',
      live: liveOn,
      chat: liveOn ? chat : undefined,
      accent: '#FF6D00',
      bg: '#001018',
      pauseId: 'csPatangPause',
      leaveBody: liveOn
        ? liveStake > 0
          ? 'Leaving forfeits — virtual stake settles for your opponent.'
          : 'Leaving forfeits this Live duel.'
        : 'This practice run will end.',
      cleanup: () => {
        if (liveOn && !settleDone && !resultShown) {
          try {
            if (liveRoles && liveRoles.opp) settleOppUid = liveRoles.opp;
            reportPatangResult(false, false, 'leave');
            settlePatangOnce(false, false);
          } catch (e) {}
        }
        cancelAnimationFrame(raf);
        raf = 0;
        window.removeEventListener('resize', onResize);
        if (pauseCtrl) {
          try {
            pauseCtrl.destroy();
          } catch (e) {}
        }
        pauseCtrl = null;
        liveHandle = null;
      },
    });
    if (!shell) return;

    const reportPatangResult = (won, isDraw, path) => {
      if (resultReported) return;
      resultReported = true;
      if (typeof recordGameResult === 'function') {
        try {
          recordGameResult('patangbaazi', !!won && !isDraw, !!isDraw, {
            live: !!liveOn,
            stake: liveStake,
            mode: liveOn ? 'live' : 'practice',
            path: path || '',
            score: 0,
          });
        } catch (e) {}
      }
    };

    const settlePatangOnce = async (won, isDraw) => {
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
          gameType: 'patangbaazi',
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

    const freshRematch = () => {
      try {
        if (shell && typeof shell.close === 'function') shell.close('again');
      } catch (e) {}
      if (!liveOn) {
        openPatang({ mode: playMode });
        return;
      }
      try {
        const mid =
          typeof dangalMatchId === 'function'
            ? dangalMatchId('patangbaazi', chat)
            : 'patangbaazi_' + Date.now();
        if (window.__dangalLaunchCtx) {
          window.__dangalLaunchCtx = Object.assign({}, window.__dangalLaunchCtx, {
            matchId: mid,
            gameId: 'patangbaazi',
            gameType: 'patangbaazi',
            stake: liveStake,
          });
        }
        if (chat) {
          chat.dangalMatchId = mid;
          chat.stake = liveStake;
        }
      } catch (e) {}
      openPatang({ mode: 'duel', chat });
    };

    shell.body.innerHTML = `
      <div class="cs-patang">
        ${courtTurnBanner(
          'yours',
          liveOn ? 'Live duel sky' : isFestival ? 'Festival sky' : 'Duel sky',
          liveOn ? liveWinLabel : isFestival ? 'Survive the heat' : 'Cut the hunter'
        )}
        <p class="cs-rally-msg" data-patang-msg>${
          liveOn
            ? 'Live duel — ' + liveWinLabel + '. Host resolves the cut for both.'
            : isFestival
              ? 'Festival heat — stay up, cut what you can, pressure never sleeps.'
              : 'Duel sky — cross their string, cut the hunter, clear two.'
        }</p>
        <canvas data-patang></canvas>
        <p class="cs-rally-hint" data-patang-hint>${
          liveOn ? 'Hold the sky — ' + liveWinLabel.toLowerCase() : 'Hold the sky — pull to climb'
        }</p>
      </div>`;
    const canvas = shell.body.querySelector('[data-patang]');
    const hint = shell.body.querySelector('[data-patang-hint]');
    const msgEl = shell.body.querySelector('[data-patang-msg]');
    let ctx = canvas.getContext('2d');
    let w = 320;
    let h = 420;

    const ZENITH = 0.13;
    const GROUND = 0.9;
    const ABRASION_MAX = 1;
    const STRING_SAMPLES = 6;
    const TEACH_SEC = isFestival ? 2.2 : 2.8;
    const WAVES_TO_WIN = 2; // Practice duel only
    const YOU_ANCHOR = 0.42;
    const PEER_ANCHOR = 0.58;

    const RIVAL_LOOKS = [
      { color: '#29B6F6', accent: '#B3E5FC', anchor: 0.58, label: 'Hunter' },
      { color: '#AB47BC', accent: '#E1BEE7', anchor: 0.72, label: 'Pressure' },
    ];

    function makeKite(x, y, color, accent) {
      return {
        x, y,
        vx: 0, vy: 0,
        tension: 0.25,
        heading: 0,
        targetX: x,
        zenithRisk: 0,
        color, accent,
        tailPhase: Math.random() * Math.PI * 2,
        alive: true,
      };
    }

    function makeRival(waveIndex) {
      const look = RIVAL_LOOKS[Math.min(waveIndex % RIVAL_LOOKS.length, RIVAL_LOOKS.length - 1)];
      const side = waveIndex % 2 === 0 ? 0.72 : 0.22;
      const k = makeKite(side, 0.48 + (waveIndex % 3) * 0.03, look.color, look.accent);
      k.anchorX = look.anchor;
      k.wave = waveIndex + 1;
      k.label = isFestival && waveIndex > 0 ? 'Heat ' + (waveIndex + 1) : look.label;
      const ramp = isFestival ? Math.min(1.35, 0.9 + waveIndex * 0.12) : 0.85 + Math.min(0.35, waveIndex * 0.2);
      k.ai = {
        state: 'hold',
        stateT: 0,
        react: Math.max(0.1, 0.2 - (isFestival ? waveIndex * 0.012 : 0) + Math.random() * 0.1),
        reactT: 0,
        wantX: side,
        wantPull: true,
        huntSide: side > 0.5 ? -1 : 1,
        aggression: ramp,
      };
      return k;
    }

    function makePeerKite() {
      const k = makeKite(0.68, 0.58, '#29B6F6', '#B3E5FC');
      k.anchorX = PEER_ANCHOR;
      k.label = 'Friend';
      k.ai = null;
      return k;
    }

    const you = makeKite(liveOn ? 0.32 : 0.35, 0.62, '#FF6D00', '#FFD180');
    you.anchorX = YOU_ANCHOR;
    let opp = liveOn ? makePeerKite() : makeRival(0);
    let holding = false;
    let ended = false;
    let ending = null; // full duel end fall
    let waveClear = null; // { t, rival } — cut one hunter, continue
    let t = 0;
    let windX = 0.06;
    let windY = -0.01;
    let gust = 0;
    let cloudOff = 0;
    let pointerId = null;
    let abrasion = { active: false, x: 0.5, y: 0.5, youDmg: 0, oppDmg: 0, flash: 0, sparks: [] };
    let hapticCool = 0;
    const stats = { cuts: 0, aliveSec: 0, death: null };
    let remoteOpp = null; // last peer kite snapshot for lerp

    function isPaused() {
      return !!(peerPaused || (pauseCtrl && pauseCtrl.isPaused && pauseCtrl.isPaused()));
    }

    function kiteStub(k) {
      if (!k) return null;
      return {
        x: +k.x.toFixed(3),
        y: +k.y.toFixed(3),
        vx: +k.vx.toFixed(3),
        vy: +k.vy.toFixed(3),
        tension: +k.tension.toFixed(3),
        heading: +k.heading.toFixed(3),
        targetX: +k.targetX.toFixed(3),
        holding: !!holding && k === you,
        alive: k.alive !== false,
      };
    }

    function applyKiteSnap(k, snap, hard) {
      if (!k || !snap) return;
      if (hard) {
        k.x = snap.x;
        k.y = snap.y;
        k.vx = snap.vx || 0;
        k.vy = snap.vy || 0;
        k.tension = snap.tension != null ? snap.tension : k.tension;
        k.heading = snap.heading != null ? snap.heading : k.heading;
        k.targetX = snap.targetX != null ? snap.targetX : k.targetX;
        if (snap.alive === false) k.alive = false;
        else k.alive = true;
        return;
      }
      // Soft blend — tighter while sawing so cut windows don’t fight rubber-band
      const blend = abrasion.active ? 0.58 : 0.42;
      const vBlend = abrasion.active ? 0.48 : 0.35;
      k.x += (snap.x - k.x) * blend;
      k.y += (snap.y - k.y) * blend;
      k.vx += ((snap.vx || 0) - k.vx) * vBlend;
      k.vy += ((snap.vy || 0) - k.vy) * vBlend;
      if (snap.tension != null) k.tension += (snap.tension - k.tension) * (abrasion.active ? 0.55 : 0.4);
      if (snap.heading != null) k.heading = snap.heading;
      if (snap.targetX != null) k.targetX += (snap.targetX - k.targetX) * 0.5;
      k.alive = snap.alive !== false;
    }

    function abrasionStub() {
      // Host perspective: youDmg = host string, oppDmg = guest string
      return {
        active: !!abrasion.active,
        x: +abrasion.x.toFixed(3),
        y: +abrasion.y.toFixed(3),
        hostDmg: +abrasion.youDmg.toFixed(3),
        guestDmg: +abrasion.oppDmg.toFixed(3),
        flash: +abrasion.flash.toFixed(2),
      };
    }

    function pushLive(extra, top) {
      if (!liveOn || !liveHandle || applying || !liveRoles) return;
      if (ended && !(top && top.force)) return;
      const now = Date.now();
      const force = !!(top && top.force);
      if (!force && now - lastPushAt < SYNC_MS) return;
      lastPushAt = now;
      eventSeq += 1;
      const me = liveRoles.me;
      const oppUid = liveRoles.opp || liveRoles.playerB;
      const kites = {};
      kites[me] = kiteStub(you);
      if (oppUid) kites[oppUid] = remoteOpp || kiteStub(opp);
      const st = Object.assign(
        {
          eventSeq,
          kites,
          wind: iAmHost
            ? {
                windX: +windX.toFixed(4),
                windY: +windY.toFixed(4),
                gust: +gust.toFixed(4),
                t: +t.toFixed(2),
                cloudOff: +cloudOff.toFixed(1),
              }
            : undefined,
          abrasionSync: iAmHost ? abrasionStub() : undefined,
          paused: isPaused(),
          phase: ending ? 'ending' : cutLocked ? 'cut' : 'fly',
          cutSeq,
        },
        extra || {}
      );
      if (!iAmHost) {
        delete st.wind;
        delete st.abrasionSync;
      }
      const status = (top && top.status) || (ended ? 'over' : 'playing');
      try {
        liveHandle.push(
          Object.assign(
            {
              status,
              turn: null,
              winner:
                status === 'over' && ending
                  ? ending.won
                    ? liveRoles.me
                    : liveRoles.opp || null
                  : undefined,
              state: st,
            },
            top || {}
          )
        );
      } catch (e) {}
    }

    /** Idempotent Live cut apply — host or peer from snap. Rejects stale seq. */
    function applyLiveCut(cut) {
      if (!liveOn || !cut || cut.type !== 'cut' || !liveRoles) return false;
      const seq = cut.seq | 0;
      if (seq <= 0 || seq <= appliedCutSeq) return false;
      if (ending || ended) return false;
      appliedCutSeq = seq;
      cutSeq = Math.max(cutSeq, seq);
      cutLocked = true;
      const iWon = cut.winnerUid === liveRoles.me;
      stats.cuts = Math.max(stats.cuts | 0, LIVE_CUTS_TO_WIN);
      if (!iWon) stats.death = 'cut';
      const why = iWon ? 'You cut!' : 'Your string snapped!';
      liveCutArmed = true;
      end(iWon, why, iWon ? null : 'cut');
      liveCutArmed = false;
      return true;
    }

    function hostDeclareCut(playerWon, detail) {
      if (!liveOn || !iAmHost || !liveRoles || cutLocked || ending || ended) return;
      if (isPaused()) return;
      cutSeq += 1;
      const me = liveRoles.me;
      const oppUid = liveRoles.opp || liveRoles.playerB;
      const winnerUid = playerWon ? me : oppUid;
      const loserUid = playerWon ? oppUid : me;
      const cut = {
        type: 'cut',
        winnerUid,
        loserUid,
        seq: cutSeq,
        detail: detail || (playerWon ? 'You cut their manjha!' : 'Your string snapped!'),
        eventSeq: eventSeq + 1,
      };
      applyLiveCut(cut);
      pushLive({ cut, phase: 'cut' }, { force: true });
    }

    function applyRemoteState(st) {
      if (!st || !liveOn) return;
      const seq = st.eventSeq | 0;
      if (seq > 0) {
        if (seq <= appliedSeq && !st.kites && !st.cut) return;
        appliedSeq = Math.max(appliedSeq, seq);
        eventSeq = Math.max(eventSeq, seq);
      }
      applying = true;
      if (st.paused != null) {
        const localPaused = !!(pauseCtrl && pauseCtrl.isPaused && pauseCtrl.isPaused());
        peerPaused = !!st.paused && !localPaused;
      }
      if (st.wind && !iAmHost) {
        windX = st.wind.windX != null ? st.wind.windX : windX;
        windY = st.wind.windY != null ? st.wind.windY : windY;
        gust = st.wind.gust != null ? st.wind.gust : gust;
        if (st.wind.t != null) t = st.wind.t;
        if (st.wind.cloudOff != null) cloudOff = st.wind.cloudOff;
      }
      if (st.abrasionSync && !iAmHost && !cutLocked) {
        const a = st.abrasionSync;
        abrasion.active = !!a.active;
        if (a.x != null) abrasion.x = a.x;
        if (a.y != null) abrasion.y = a.y;
        // Remap host perspective → local you/opp
        if (a.guestDmg != null) abrasion.youDmg = a.guestDmg;
        if (a.hostDmg != null) abrasion.oppDmg = a.hostDmg;
        if (a.flash != null) abrasion.flash = a.flash;
      }
      if (st.kites && liveRoles && !cutLocked) {
        const peerId = liveRoles.opp || liveRoles.playerB;
        const peerSnap = peerId && st.kites[peerId];
        if (peerSnap) {
          remoteOpp = peerSnap;
          const dist = Math.hypot(opp.x - peerSnap.x, opp.y - peerSnap.y);
          applyKiteSnap(opp, peerSnap, dist > (abrasion.active ? 0.14 : 0.22));
        }
      }
      if (st.cut) applyLiveCut(st.cut);
      applying = false;
    }

    function size() {
      const r = canvas.getBoundingClientRect();
      w = Math.max(240, r.width || 300);
      h = Math.max(280, r.height || 360);
      if (typeof ensureGameCanvas === 'function') {
        const sized = ensureGameCanvas(canvas, w, h);
        if (sized && sized.ctx) ctx = sized.ctx;
        if (sized && sized.width) w = sized.width;
        if (sized && sized.height) h = sized.height;
      } else {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx = canvas.getContext('2d');
        if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    }
    function onResize() {
      size();
    }
    size();
    window.addEventListener('resize', onResize);

    function setHolding(on, e) {
      holding = !!on;
      if (on && e) {
        pointerId = e.pointerId;
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch (err) {}
        aimAt(e);
      } else {
        pointerId = null;
      }
    }
    function aimAt(e) {
      const r = canvas.getBoundingClientRect();
      you.targetX = Math.max(0.08, Math.min(0.92, (e.clientX - r.left) / Math.max(1, r.width)));
    }
    canvas.addEventListener('pointerdown', (e) => {
      if (ended || isPaused()) return;
      e.preventDefault();
      setHolding(true, e);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!holding || ended || isPaused()) return;
      if (pointerId != null && e.pointerId !== pointerId) return;
      aimAt(e);
    });
    function releasePtr(e) {
      if (pointerId != null && e && e.pointerId !== pointerId) return;
      setHolding(false);
    }
    canvas.addEventListener('pointerup', releasePtr);
    canvas.addEventListener('pointercancel', releasePtr);
    canvas.addEventListener('lostpointercapture', () => {
      holding = false;
      pointerId = null;
    });

    function resetAbrasion() {
      abrasion = { active: false, x: 0.5, y: 0.5, youDmg: 0, oppDmg: 0, flash: 0, sparks: [] };
    }

    function end(won, why, deathKind) {
      if (ended || ending) return;
      // Live only ends via applyLiveCut (host cut event) — not local AI/self deaths.
      if (liveOn && !liveCutArmed) return;
      if (!won && deathKind) stats.death = deathKind;
      ending = {
        won: !!won,
        why: why || (won ? 'You cut!' : 'Your string snapped!'),
        t: 0,
        fallYou: !won,
        fallOpp: !!won && opp && opp.alive,
      };
      if (opp && !won) {
        /* loser falls */
      } else if (opp && won) {
        opp.alive = false;
      }
      resetAbrasion();
      if (hint) hint.textContent = ending.why;
      if (msgEl) {
        msgEl.textContent = liveOn
          ? won
            ? 'You cut!'
            : 'Your string snapped!'
          : won
            ? isFestival
              ? 'Festival clear — sky is yours.'
              : 'String cut — hunters down.'
            : ending.why;
      }
      if (typeof gameFeedback === 'function') gameFeedback(won ? 'win' : 'lose');
    }

    function deathLabel(kind) {
      if (kind === 'snap') return 'manjha snapped';
      if (kind === 'stall') return 'rooftop dump';
      if (kind === 'cut') return 'string cut';
      if (kind === 'forfeit') return 'forfeit';
      return kind || 'down';
    }

    function resultTitle(won, deathKind) {
      if (won) return 'String cut!';
      if (deathKind === 'snap') return 'Manjha snapped';
      if (isFestival) return 'Festival run over';
      if (deathKind === 'stall') return 'Dumped on the roofs';
      return 'Your manjha was cut';
    }

    function finishEnd() {
      if (ended || !ending) return;
      if (liveOn && resultShown) return;
      ended = true;
      cancelAnimationFrame(raf);
      raf = 0;
      const secs = Math.max(0, Math.round(stats.aliveSec));
      const cuts = stats.cuts | 0;
      const death = ending.won ? null : stats.death;
      const modeLabel = liveOn ? 'Live duel' : isFestival ? 'Festival' : 'Duel';
      const won = !!ending.won;
      const forfeit = death === 'forfeit' || (ending.why && String(ending.why).indexOf('left') >= 0);

      if (liveOn && shell && typeof shell.markOver === 'function') shell.markOver();
      if (liveOn && liveRoles && liveRoles.opp) settleOppUid = liveRoles.opp;
      if (liveOn && iAmHost && !forfeit) {
        try {
          pushLive(
            { phase: 'done', cutSeq: appliedCutSeq },
            {
              force: true,
              status: 'over',
              winner: won ? liveRoles && liveRoles.me : liveRoles && liveRoles.opp,
            }
          );
        } catch (e) {}
      }

      let pbId = isFestival ? 'patangbaazi_festival' : 'patangbaazi_duel';
      let vsBest = '';
      let streak = patangDuelStreak();

      if (liveOn) {
        pbId = 'patangbaazi_duel';
        resultShown = true;
        reportPatangResult(won, false, forfeit ? 'forfeit' : 'cut');
      } else if (isFestival) {
        if (typeof formatVsBest === 'function') vsBest = formatVsBest('patangbaazi_festival', secs);
        if (typeof setGamePB === 'function') {
          setGamePB('patangbaazi_festival', secs);
          if (cuts > 0) setGamePB('patangbaazi_festival_cuts', cuts);
        }
      } else if (ending.won) {
        streak += 1;
        if (typeof formatVsBest === 'function') vsBest = formatVsBest('patangbaazi_duel', streak);
        patangSetDuelStreak(streak);
        if (typeof setGamePB === 'function') setGamePB('patangbaazi_duel', streak);
      } else {
        patangSetDuelStreak(0);
        if (typeof getGamePB === 'function') {
          const best = getGamePB('patangbaazi_duel');
          vsBest = best != null ? 'Streak broken · Best ' + best : 'Streak broken';
        }
      }

      const paintResult = () => {
        const stakeLine = stakeSettleNote ? ' · ' + stakeSettleNote : '';
        const causeLine = ending.won
          ? liveOn
            ? liveWinLabel + ' · ' + secs + 's'
            : cuts + ' cut' + (cuts === 1 ? '' : 's') + ' · ' + secs + 's aloft'
          : deathLabel(death) + ' · ' + secs + 's';
        const subtitle =
          modeLabel + ' · ' + (ending.why || '') + ' · ' + causeLine + stakeLine;
        const shareText = ending.won
          ? liveOn
            ? 'Cut their manjha in Live Patang Baazi' +
              (liveStake > 0 ? ' · virtual stakes' : '') +
              ' on Chaupaal'
            : isFestival
              ? 'Cut ' + cuts + ' in Festival on Chaupaal Patang Baazi · ' + secs + 's aloft'
              : 'Duel win — string cut! Streak ' + streak + ' on Chaupaal Patang Baazi'
          : liveOn
            ? 'String snapped in Live Patang Baazi on Chaupaal'
            : isFestival
              ? 'Festival run · ' + cuts + ' cuts · ' + secs + 's on Chaupaal Patang Baazi'
              : 'Patang Baazi Duel on Chaupaal — ' + deathLabel(death);

        if (shell.gs && typeof shell.gs.setOutcome === 'function') {
          shell.gs.setOutcome(ending.won ? 'won' : 'lost');
        }
        if (shell && typeof shell.markOver === 'function') shell.markOver();

        const actions = liveOn
          ? [
              { label: 'Rematch', primary: true, id: 'again' },
              { label: 'Share', primary: false, id: 'share' },
            ]
          : [
              { label: 'Fly again', primary: true, id: 'again' },
              { label: 'Change sky', primary: false, id: 'modes' },
              { label: 'Share', primary: false, id: 'share' },
            ];
        const html =
          typeof gameResultHtml === 'function'
            ? gameResultHtml({
                gameId: pbId,
                glyph: ending.won ? '✓' : '·',
                title: liveOn
                  ? forfeit
                    ? ending.won
                      ? 'Opponent left'
                      : 'You left'
                    : ending.won
                      ? 'You cut!'
                      : 'Your string snapped!'
                  : resultTitle(ending.won, death),
                subtitle,
                vsBest: liveOn ? undefined : vsBest || undefined,
                hideStats: true,
                challenge: false,
                updatePb: !liveOn,
                actions,
              })
            : `<p>${esc(subtitle)}</p>`;
        shell.body.innerHTML = html;
        if (typeof wireGameResultActions === 'function') {
          wireGameResultActions(shell.body, {
            again: () => {
              if (liveOn) freshRematch();
              else {
                shell.close('again');
                openPatang({ mode: playMode });
              }
            },
            modes: () => {
              shell.close('modes');
              openPatangModeSheet();
            },
            share: () => {
              if (typeof openUnifiedShareSheet === 'function') {
                openUnifiedShareSheet({
                  gameId: 'patangbaazi',
                  stats: {
                    scoreLine: modeLabel + ' · ' + secs + 's',
                    text: shareText,
                  },
                });
              }
            },
          });
        }
      };

      if (liveOn) {
        settlePatangOnce(won, false).then((settle) => {
          stakeSettleNote = '';
          if (liveStake > 0) {
            const cd = settle && settle.chipDelta != null ? Number(settle.chipDelta) : null;
            stakeSettleNote =
              Number.isFinite(cd) && cd !== 0
                ? 'Stake ' + (cd > 0 ? '+' : '') + cd + ' virtual'
                : 'Virtual stakes · not real money';
          }
          paintResult();
        });
        return;
      }
      paintResult();
    }

    function beginWaveClear(detail) {
      if (liveOn) return; // No AI wave clears on Live
      if (waveClear || ending || ended) return;
      stats.cuts += 1;
      if (opp) opp.alive = false;
      waveClear = { t: 0, why: detail || 'You cut their manjha!', fallKite: opp };
      resetAbrasion();
      if (hint) hint.textContent = waveClear.why;
      if (msgEl) {
        msgEl.textContent = isFestival
          ? 'Cut ' + stats.cuts + ' — next heat incoming'
          : 'Hunter down · ' + stats.cuts + '/' + WAVES_TO_WIN;
      }
      if (typeof gameFeedback === 'function') {
        if (isFestival) gameFeedback('select');
        else if (stats.cuts < WAVES_TO_WIN) gameFeedback('win');
      }
    }

    function spawnNextWave() {
      if (!isFestival && stats.cuts >= WAVES_TO_WIN) {
        waveClear = null;
        end(true, 'String cut! Hunters down.', null);
        return;
      }
      opp = makeRival(stats.cuts);
      resetAbrasion();
      waveClear = null;
    }

    /** Cut resolved — Practice hunter path, or Live host declare. */
    function onCutResolved(playerWon, detail) {
      if (liveOn) {
        if (!iAmHost || isPaused() || cutLocked || ending || ended) return;
        // Host perspective: playerWon = host kite cut peer
        hostDeclareCut(!!playerWon, detail);
        return;
      }
      if (playerWon) beginWaveClear(detail);
      else end(false, detail || 'Rival cut your manjha.', 'cut');
    }

    function updateWind(dt) {
      const base = 0.05 + 0.04 * Math.sin(t * 0.35) + 0.02 * Math.sin(t * 0.11);
      const cycle = (t % 6.4) / 6.4;
      let gAmp = 0;
      if (cycle > 0.55 && cycle < 0.78) {
        const u = (cycle - 0.55) / 0.23;
        gAmp = Math.sin(u * Math.PI) * (0.22 + 0.06 * Math.sin(t * 0.7));
      }
      gust = gust * 0.92 + gAmp * 0.08;
      windX = base + gust * (0.85 + 0.15 * Math.sin(t * 3.1));
      windY = -0.012 + 0.02 * Math.sin(t * 0.55) - gust * 0.04;
      cloudOff += (windX * 28 + 6) * dt;
    }

    function stringControlPoint(k, anchorX) {
      const ax = anchorX;
      const ay = 0.98;
      const bow = windX * 0.14 * (0.5 + k.tension * 0.5);
      return {
        ax, ay,
        mx: (ax + k.x) * 0.5 + bow,
        my: (ay + k.y) * 0.5 + 0.03,
        kx: k.x,
        ky: k.y,
      };
    }

    function stringPolyline(k, anchorX) {
      const c = stringControlPoint(k, anchorX);
      const pts = [];
      for (let i = 0; i <= STRING_SAMPLES; i++) {
        const u = i / STRING_SAMPLES;
        const omu = 1 - u;
        pts.push({
          x: omu * omu * c.ax + 2 * omu * u * c.mx + u * u * c.kx,
          y: omu * omu * c.ay + 2 * omu * u * c.my + u * u * c.ky,
        });
      }
      return pts;
    }

    function segIntersect(a, b, c, d) {
      const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
      if (Math.abs(den) < 1e-9) return null;
      const t1 = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den;
      const t2 = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den;
      if (t1 < 0.02 || t1 > 0.98 || t2 < 0.02 || t2 > 0.98) return null;
      return {
        x: a.x + t1 * (b.x - a.x),
        y: a.y + t1 * (b.y - a.y),
        t1, t2,
      };
    }

    function findStringCross(polyA, polyB) {
      for (let i = 0; i < polyA.length - 1; i++) {
        for (let j = 0; j < polyB.length - 1; j++) {
          const hit = segIntersect(polyA[i], polyA[i + 1], polyB[j], polyB[j + 1]);
          if (hit) {
            const ax = polyA[i + 1].x - polyA[i].x;
            const ay = polyA[i + 1].y - polyA[i].y;
            const bx = polyB[j + 1].x - polyB[j].x;
            const by = polyB[j + 1].y - polyB[j].y;
            const lenA = Math.hypot(ax, ay) || 1;
            const lenB = Math.hypot(bx, by) || 1;
            const cross = Math.abs(ax * by - ay * bx) / (lenA * lenB);
            // |sin θ| via 2D cross of unit dirs
            return { x: hit.x, y: hit.y, angleQuality: Math.min(1, cross) };
          }
        }
      }
      return null;
    }

    function sailsBump(a, b) {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      return dx * dx + dy * dy < 0.007;
    }

    function tickAbrasion(dt) {
      if (liveOn && (cutLocked || ending || isPaused())) return null;
      if (!opp || !opp.alive) {
        abrasion.active = false;
        abrasion.youDmg = Math.max(0, abrasion.youDmg - dt * 1.1);
        abrasion.oppDmg = Math.max(0, abrasion.oppDmg - dt * 1.1);
        abrasion.flash = Math.max(0, abrasion.flash - dt * 3);
        abrasion.sparks = abrasion.sparks.filter((s) => (s.life -= dt) > 0);
        return null;
      }
      const polyYou = stringPolyline(you, you.anchorX != null ? you.anchorX : YOU_ANCHOR);
      const polyOpp = stringPolyline(opp, opp.anchorX);
      const cross = findStringCross(polyYou, polyOpp);
      hapticCool = Math.max(0, hapticCool - dt);

      if (!cross) {
        abrasion.active = false;
        abrasion.youDmg = Math.max(0, abrasion.youDmg - dt * 1.1);
        abrasion.oppDmg = Math.max(0, abrasion.oppDmg - dt * 1.1);
        abrasion.flash = Math.max(0, abrasion.flash - dt * 3);
        abrasion.sparks = abrasion.sparks.filter((s) => (s.life -= dt) > 0);
        return null;
      }

      abrasion.active = true;
      abrasion.x = cross.x;
      abrasion.y = cross.y;
      abrasion.flash = Math.min(1, abrasion.flash + dt * 4);

      const relSpd = Math.hypot(you.vx - opp.vx, you.vy - opp.vy);
      const motion = 0.35 + Math.min(1.4, relSpd * 9);
      const angle = 0.2 + 0.8 * cross.angleQuality;
      const base = motion * angle * 0.85;

      let dmgYou = base * (0.45 + opp.tension * 0.9) * dt;
      let dmgOpp = base * (0.45 + you.tension * 0.9) * dt;
      if (you.tension < 0.35) dmgYou *= 1.35;
      if (opp.tension < 0.35) dmgOpp *= 1.35;
      if (you.tension > 0.7 && cross.angleQuality > 0.55) dmgOpp *= 1.2;
      if (opp.tension > 0.7 && cross.angleQuality > 0.55) dmgYou *= 1.2;

      abrasion.youDmg = Math.min(ABRASION_MAX, abrasion.youDmg + dmgYou);
      abrasion.oppDmg = Math.min(ABRASION_MAX, abrasion.oppDmg + dmgOpp);

      if (abrasion.sparks.length < 14 && Math.random() < 0.45) {
        abrasion.sparks.push({
          x: cross.x + (Math.random() - 0.5) * 0.02,
          y: cross.y + (Math.random() - 0.5) * 0.02,
          vx: (Math.random() - 0.5) * 0.15,
          vy: (Math.random() - 0.5) * 0.15,
          life: 0.25 + Math.random() * 0.25,
        });
      }
      abrasion.sparks.forEach((s) => {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.life -= dt;
      });
      abrasion.sparks = abrasion.sparks.filter((s) => s.life > 0);

      if (hapticCool <= 0 && (abrasion.youDmg > 0.25 || abrasion.oppDmg > 0.25)) {
        hapticCool = 0.18;
        if (typeof gameFeedback === 'function') gameFeedback('select');
      }

      if (abrasion.oppDmg >= ABRASION_MAX && abrasion.youDmg >= ABRASION_MAX) {
        return you.tension >= opp.tension
          ? { playerWon: true, why: 'Strings frayed — your manjha held!' }
          : { playerWon: false, why: 'Mutual saw — their manjha held.' };
      }
      if (abrasion.oppDmg >= ABRASION_MAX) {
        return { playerWon: true, why: 'You cut their manjha!' };
      }
      if (abrasion.youDmg >= ABRASION_MAX) {
        return { playerWon: false, why: 'Rival cut your manjha.' };
      }
      return null;
    }

    function stepKite(k, dt, isPlayer, pull) {
      const targetTen = pull ? 1 : 0.12;
      const tenRate = pull ? 1.35 : 1.6;
      k.tension += (targetTen - k.tension) * Math.min(1, tenRate * dt);

      const zenithFactor = Math.max(0.25, 1 - Math.pow(Math.max(0, (ZENITH + 0.08 - k.y) / 0.2), 1.4));
      const climb = pull ? -0.42 * k.tension * zenithFactor : 0.28 * (0.55 - k.tension);
      const float = -0.04 * (0.5 - k.y);
      k.vy += (climb + float + windY * (0.7 + k.tension * 0.5)) * dt;
      k.vy *= Math.pow(0.86, dt * 60);

      const steer = (k.targetX - k.x) * 2.4;
      k.vx += (steer + windX * (0.55 + (1 - k.tension) * 0.35)) * dt;
      k.vx *= Math.pow(0.88, dt * 60);

      k.x += k.vx * dt;
      k.y += k.vy * dt;
      k.x = Math.max(0.06, Math.min(0.94, k.x));
      k.y = Math.max(0.08, Math.min(0.94, k.y));
      // Tip toward hunt target when aggressive (telegraph)
      let tipBias = 0;
      if (!isPlayer && k.ai && (k.ai.state === 'hunt' || k.ai.state === 'saw')) {
        tipBias = (you.x - k.x) * 0.9;
      }
      k.heading = Math.atan2(k.vx * 1.2 + windX * 0.4 + tipBias, -k.vy * 0.8 - 0.15);
      k.tailPhase += dt * (4 + k.tension * 6 + Math.abs(windX) * 8);

      const snapLimit = isPlayer ? 1.15 : 1.4; // AI slightly softer zenith — still mortal
      if (k.y <= ZENITH + 0.02 && k.tension > 0.82) {
        k.zenithRisk += dt;
        if (k.zenithRisk > snapLimit) {
          if (liveOn) {
            // Soft recover — no match end until fair cuts (P2)
            k.tension = Math.min(k.tension, 0.55);
            k.y = Math.max(k.y, ZENITH + 0.06);
            k.zenithRisk = 0;
            return;
          }
          if (isPlayer) {
            end(false, 'Manjha snapped at the zenith — ease off next time.', 'snap');
          } else {
            beginWaveClear('Hunter snapped their own manjha at the zenith!');
          }
          return;
        }
      } else {
        k.zenithRisk = Math.max(0, k.zenithRisk - dt * 0.55);
      }
      if (k.y >= GROUND && k.tension < 0.2) {
        if (liveOn) {
          k.y = GROUND - 0.04;
          k.tension = Math.max(k.tension, 0.35);
          k.vy = -0.08;
          return;
        }
        if (isPlayer) end(false, 'Kite dumped into the rooftops.', 'stall');
        else beginWaveClear('Hunter dumped into the rooftops!');
      }
    }

    function setAiState(ai, next) {
      if (ai.state === next) return;
      ai.state = next;
      ai.stateT = 0;
      ai.reactT = ai.react * (0.7 + Math.random() * 0.6);
    }

    function thinkRival(dt) {
      if (liveOn) return; // Human peer kite — no AI hunter on Live
      if (!opp || !opp.alive || !opp.ai) return;
      const ai = opp.ai;
      ai.stateT += dt;
      ai.reactT = Math.max(0, ai.reactT - dt);

      const teach = t < TEACH_SEC;
      const crossed = abrasion.active;
      const favored = abrasion.oppDmg + 0.08 >= abrasion.youDmg;
      const losing = crossed && abrasion.youDmg > abrasion.oppDmg + 0.12;

      // Desired intents (applied after reaction delay)
      let nextState = ai.state;
      if (teach) {
        nextState = 'hold';
      } else if (losing || (crossed && abrasion.youDmg > 0.55 && !favored)) {
        nextState = 'bail';
      } else if (crossed && favored) {
        nextState = 'saw';
      } else if (ai.state === 'bail') {
        nextState = ai.stateT >= 0.9 ? 'recover' : 'bail';
      } else if (ai.state === 'recover') {
        nextState = ai.stateT >= 1.15 && opp.y < 0.62 && opp.tension > 0.4 ? 'hunt' : 'recover';
      } else if (ai.state === 'saw' && !crossed) {
        nextState = 'hunt';
      } else if (ai.state === 'hunt') {
        if (ai.stateT > 3.2 && !crossed) nextState = 'recover';
        else nextState = 'hunt';
      } else {
        // hold → hunt when ready
        if (opp.y > 0.72 || opp.tension < 0.28) nextState = 'recover';
        else if (ai.stateT > 0.55) nextState = 'hunt';
        else nextState = 'hold';
      }

      if (nextState !== ai.state && ai.reactT <= 0) {
        setAiState(ai, nextState);
      }

      let wantX = opp.x;
      let wantPull = true;
      const agg = ai.aggression;

      if (ai.state === 'hold') {
        wantX = you.x + ai.huntSide * (0.22 + windX * 0.15);
        wantPull = opp.y > 0.55 || you.tension > 0.5;
        if (opp.y < ZENITH + 0.12) wantPull = false;
      } else if (ai.state === 'hunt') {
        // Cross their string: pass through player lane with overshoot for angle
        if (Math.abs(opp.x - (you.x + ai.huntSide * 0.2)) < 0.06) {
          ai.huntSide *= -1;
        }
        wantX = you.x + ai.huntSide * (0.16 + 0.08 * agg);
        // Match altitude band for a clean cross
        if (opp.y > you.y + 0.06) wantPull = true;
        else if (opp.y < you.y - 0.08) wantPull = false;
        else wantPull = you.tension > 0.4 || Math.random() < 0.55 * agg;
        if (opp.y < ZENITH + 0.1 && opp.tension > 0.75) wantPull = false;
      } else if (ai.state === 'saw') {
        // Keep tension + relative lateral motion while crossed
        wantX = you.x + ai.huntSide * 0.12 + Math.sin(t * 3.2) * 0.05;
        wantPull = true;
        if (opp.y < ZENITH + 0.08) wantPull = false;
      } else if (ai.state === 'bail') {
        wantX = Math.max(0.08, Math.min(0.92, opp.x + ai.huntSide * 0.35));
        wantPull = false;
        ai.huntSide = opp.x < you.x ? -1 : 1;
      } else {
        // recover
        wantX = 0.5 + ai.huntSide * 0.25 + windX * 0.2;
        wantPull = opp.y > 0.42;
        if (opp.y < ZENITH + 0.14) wantPull = false;
      }

      // Apply delayed steering so humans can feint
      if (ai.reactT <= 0) {
        ai.wantX = Math.max(0.08, Math.min(0.92, wantX));
        ai.wantPull = wantPull;
        ai.reactT = ai.react * (0.35 + Math.random() * 0.4);
      }
      opp.targetX = ai.wantX;
      stepKite(opp, dt, false, ai.wantPull);
    }

    function drawSky() {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#81D4FA');
      g.addColorStop(0.55, '#29B6F6');
      g.addColorStop(1, '#01579B');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // Drifting cloud washes (wind tell)
      ctx.save();
      ctx.globalAlpha = 0.18 + gust * 0.25;
      for (let i = 0; i < 5; i++) {
        const cx = ((i * 0.28 * w + cloudOff * (0.4 + i * 0.08)) % (w + 120)) - 60;
        const cy = 40 + i * 28 + Math.sin(t * 0.4 + i) * 6;
        ctx.fillStyle = '#E1F5FE';
        ctx.beginPath();
        ctx.ellipse(cx, cy, 48 + i * 6, 16 + i * 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Gust wash band
      if (gust > 0.08) {
        ctx.save();
        ctx.globalAlpha = Math.min(0.35, gust * 0.9);
        const gx = (cloudOff * 1.4) % (w + 40) - 20;
        const wash = ctx.createLinearGradient(gx - 40, 0, gx + 80, 0);
        wash.addColorStop(0, 'rgba(255,255,255,0)');
        wash.addColorStop(0.5, 'rgba(255,255,255,.55)');
        wash.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = wash;
        ctx.fillRect(0, 0, w, h * 0.7);
        ctx.restore();
      }

      // Rooftop silhouettes (light)
      ctx.fillStyle = 'rgba(0,20,40,.45)';
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(0, h * 0.88);
      const roofs = [0.08, 0.18, 0.3, 0.42, 0.55, 0.68, 0.8, 0.92];
      roofs.forEach((rx, i) => {
        const bh = h * (0.06 + (i % 3) * 0.025);
        ctx.lineTo(rx * w - 8, h * 0.88);
        ctx.lineTo(rx * w - 8, h * 0.88 - bh);
        ctx.lineTo(rx * w + 18, h * 0.88 - bh);
        ctx.lineTo(rx * w + 18, h * 0.88);
      });
      ctx.lineTo(w, h * 0.88);
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    }

    function drawString(k, anchorX, fray) {
      const c = stringControlPoint(k, anchorX);
      const ax = c.ax * w;
      const ay = c.ay * h;
      const mx = c.mx * w;
      const my = c.my * h;
      const kx = c.kx * w;
      const ky = c.ky * h;
      const hot = abrasion.active ? abrasion.flash : 0;
      const alpha = 0.35 + k.tension * 0.45 + hot * 0.35;
      ctx.strokeStyle = fray > 0.55
        ? 'rgba(255,120,80,' + alpha + ')'
        : hot > 0.2
          ? 'rgba(255,255,200,' + alpha + ')'
          : 'rgba(255,236,179,' + alpha + ')';
      ctx.lineWidth = 1.2 + k.tension * 1.4 + hot * 1.2;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(mx, my, kx, ky);
      ctx.stroke();
      if (fray > 0.4) {
        ctx.save();
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = 'rgba(255,80,40,' + (0.3 + fray * 0.5) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo(mx, my, kx, ky);
        ctx.stroke();
        ctx.restore();
      }
    }

    function drawAbrasionFx() {
      if (!abrasion.active && abrasion.sparks.length === 0) return;
      if (abrasion.active) {
        const px = abrasion.x * w;
        const py = abrasion.y * h;
        ctx.save();
        ctx.globalAlpha = 0.35 + abrasion.flash * 0.55;
        ctx.fillStyle = '#FFF59D';
        ctx.beginPath();
        ctx.arc(px, py, 5 + abrasion.flash * 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#FF6D00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, 8 + abrasion.flash * 14, 0, Math.PI * 2);
        ctx.stroke();
        // Fray meters
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = 'rgba(0,0,0,.35)';
        ctx.fillRect(px - 22, py - 28, 44, 6);
        ctx.fillStyle = '#29B6F6';
        ctx.fillRect(px - 22, py - 28, 44 * abrasion.oppDmg, 3);
        ctx.fillStyle = '#FF6D00';
        ctx.fillRect(px - 22, py - 25, 44 * abrasion.youDmg, 3);
        ctx.restore();
      }
      abrasion.sparks.forEach((s) => {
        ctx.globalAlpha = Math.max(0, s.life * 3);
        ctx.fillStyle = '#FFE082';
        ctx.fillRect(s.x * w - 1.5, s.y * h - 1.5, 3, 3);
      });
      ctx.globalAlpha = 1;
    }

    function drawKite(k, opts) {
      if (!k) return;
      const px = k.x * w;
      const py = k.y * h;
      const ang = k.heading * 0.65;
      const s = Math.min(w, h) * (opts && opts.big ? 0.05 : 0.045);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(ang);

      ctx.strokeStyle = k.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      let tx = 0;
      let ty = s * 0.9;
      ctx.moveTo(tx, ty);
      for (let i = 1; i <= 6; i++) {
        tx = Math.sin(k.tailPhase + i * 0.7) * (4 + i * 1.2) + windX * 10;
        ty = s * 0.9 + i * (s * 0.55);
        ctx.lineTo(tx, ty);
      }
      ctx.stroke();
      for (let i = 2; i <= 6; i += 2) {
        const bx = Math.sin(k.tailPhase + i * 0.7) * (4 + i * 1.2) + windX * 10;
        const by = s * 0.9 + i * (s * 0.55);
        ctx.fillStyle = i % 4 === 0 ? k.color : k.accent;
        ctx.fillRect(bx - 3, by - 2, 6, 4);
      }

      ctx.beginPath();
      ctx.moveTo(0, -s * 1.15);
      ctx.lineTo(s * 0.85, 0);
      ctx.lineTo(0, s * 0.95);
      ctx.lineTo(-s * 0.85, 0);
      ctx.closePath();
      ctx.fillStyle = k.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.25)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -s * 1.15);
      ctx.lineTo(0, s * 0.95);
      ctx.moveTo(-s * 0.85, 0);
      ctx.lineTo(s * 0.85, 0);
      ctx.strokeStyle = k.accent;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Aggression telegraph: taut flash on hunt/saw
      if (k.ai && (k.ai.state === 'hunt' || k.ai.state === 'saw') && k.tension > 0.55) {
        ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t * 8);
        ctx.strokeStyle = '#FFF59D';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -s * 1.15);
        ctx.lineTo(s * 0.85, 0);
        ctx.lineTo(0, s * 0.95);
        ctx.lineTo(-s * 0.85, 0);
        ctx.closePath();
        ctx.stroke();
      }

      ctx.restore();
    }

    function updateHint() {
      if (liveOn) {
        if (ending) return;
        if (abrasion.active) {
          const ahead = abrasion.oppDmg >= abrasion.youDmg;
          hint.textContent = ahead
            ? 'Sawing — hold tension! ' + liveWinLabel + '.'
            : 'Their manjha is biting — pull hard or break away!';
          hint.classList.add('is-warn');
          return;
        }
        if (you.zenithRisk > 0.35) {
          hint.textContent = 'Ease off — manjha screaming at the top';
          hint.classList.add('is-warn');
          return;
        }
        if (gust > 0.14) {
          hint.textContent = 'Gust — ease tension, don’t yank';
          hint.classList.remove('is-warn');
          return;
        }
        hint.textContent = holding
          ? 'Climbing — cross their string to cut'
          : 'Floating — hold to pull · ' + liveWinLabel.toLowerCase();
        hint.classList.remove('is-warn');
        return;
      }
      if (t < TEACH_SEC) {
        hint.textContent = 'Hunter watching — get height, then cross to cut';
        hint.classList.remove('is-warn');
        return;
      }
      if (abrasion.active) {
        const ahead = abrasion.oppDmg >= abrasion.youDmg;
        hint.textContent = ahead
          ? 'Sawing — hold tension! Keep the cross.'
          : 'Their manjha is biting — pull hard or break away!';
        hint.classList.add('is-warn');
      } else if (opp && opp.ai && opp.ai.state === 'hunt') {
        hint.textContent = 'Hunter closing — watch your string';
        hint.classList.add('is-warn');
      } else if (opp && opp.ai && opp.ai.state === 'bail') {
        hint.textContent = 'They peeled off — chase the cut!';
        hint.classList.remove('is-warn');
      } else if (you.zenithRisk > 0.35) {
        hint.textContent = 'Ease off — manjha screaming at the top';
        hint.classList.add('is-warn');
      } else if (gust > 0.14) {
        hint.textContent = 'Gust — ease tension, don’t yank';
        hint.classList.remove('is-warn');
      } else if (holding && you.tension > 0.7) {
        hint.textContent = 'Climbing — cut their string before they cut yours';
        hint.classList.remove('is-warn');
      } else if (!holding) {
        hint.textContent = 'Floating — hold to pull manjha';
        hint.classList.remove('is-warn');
      } else {
        hint.textContent = 'Hold the sky — pull to climb';
        hint.classList.remove('is-warn');
      }
    }

    function drawFrame() {
      drawSky();
      if (opp) {
        drawString(opp, opp.anchorX, abrasion.oppDmg);
        drawKite(opp);
      }
      drawString(you, you.anchorX != null ? you.anchorX : YOU_ANCHOR, abrasion.youDmg);
      drawKite(you);
      drawAbrasionFx();

      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.font = '11px "Space Grotesk",sans-serif';
      ctx.fillText(
        liveOn
          ? gust > 0.12
            ? 'Live · gust'
            : 'Live · dual flight'
          : gust > 0.12
            ? 'Wind · gust'
            : 'Wind · steady',
        12,
        18
      );
      if (liveOn) {
        ctx.fillText(liveWinLabel, 12, 34);
      } else if (isFestival) {
        const threat = Math.min(5, 1 + stats.cuts);
        ctx.fillText(Math.floor(stats.aliveSec) + 's · ' + stats.cuts + ' cuts · heat ' + threat, 12, 34);
      } else {
        ctx.fillText(stats.cuts + '/' + WAVES_TO_WIN + ' cuts', 12, 34);
      }
      if (liveOn && opp) {
        ctx.fillStyle = 'rgba(255,255,255,.4)';
        ctx.fillText((opp.label || 'Friend') + ' · peer', 12, 50);
      } else if (opp && opp.ai && t >= TEACH_SEC) {
        ctx.fillStyle = 'rgba(255,255,255,.4)';
        ctx.fillText((opp.label || 'Hunter') + ' · ' + opp.ai.state, 12, 50);
      }
      if (abrasion.active) {
        ctx.fillStyle = 'rgba(255,236,179,.75)';
        ctx.fillText('Sawing', 12, 66);
      }
    }

    function loop(now) {
      if (!shell.alive() || ended) return;
      if (isPaused()) {
        lastTs = 0;
        raf = requestAnimationFrame(loop);
        return;
      }
      if (!lastTs) lastTs = now;
      let dt = (now - lastTs) / 1000;
      lastTs = now;
      dt = Math.min(0.05, Math.max(0.001, dt));
      t += dt;

      if (ending) {
        ending.t += dt;
        if (ending.fallOpp && opp) {
          opp.vy += 0.9 * dt;
          opp.y = Math.min(1.05, opp.y + opp.vy * dt);
          opp.heading += dt * 2.5;
        }
        if (ending.fallYou) {
          you.vy += 0.9 * dt;
          you.y = Math.min(1.05, you.y + you.vy * dt);
          you.heading -= dt * 2.5;
        }
        drawFrame();
        if (ending.t > 0.85) finishEnd();
        else raf = requestAnimationFrame(loop);
        return;
      }

      if (waveClear) {
        waveClear.t += dt;
        const fk = waveClear.fallKite;
        if (fk) {
          fk.vy += 0.95 * dt;
          fk.y = Math.min(1.1, fk.y + fk.vy * dt);
          fk.heading += dt * 3;
          fk.tension = Math.max(0, fk.tension - dt);
        }
        if (hint) {
          const more =
            isFestival || stats.cuts < WAVES_TO_WIN
              ? ' — next hunter incoming'
              : ' — sky clearing';
          hint.textContent = waveClear.why + more;
          hint.classList.remove('is-warn');
        }
        drawSky();
        if (fk) {
          drawString(fk, fk.anchorX, 1);
          drawKite(fk);
        }
        drawString(you, you.anchorX || YOU_ANCHOR, 0);
        drawKite(you);
        ctx.fillStyle = 'rgba(255,255,255,.55)';
        ctx.font = '11px "Space Grotesk",sans-serif';
        if (isFestival) {
          ctx.fillText(Math.floor(stats.aliveSec) + 's · ' + stats.cuts + ' cuts', 12, 18);
        } else {
          ctx.fillText(stats.cuts + '/' + WAVES_TO_WIN + ' cuts', 12, 18);
        }
        if (waveClear.t > 0.95) spawnNextWave();
        raf = requestAnimationFrame(loop);
        return;
      }

      stats.aliveSec += dt;
      // Host seeds shared wind; peer consumes wind from Live snaps.
      if (!liveOn || iAmHost) updateWind(dt);
      else cloudOff += (windX * 28 + 6) * dt;

      stepKite(you, dt, true, holding);
      if (ending || waveClear) {
        raf = requestAnimationFrame(loop);
        return;
      }

      if (liveOn) {
        // Blend peer kite toward last snap between pushes
        if (remoteOpp) applyKiteSnap(opp, remoteOpp, false);
        opp.tailPhase += dt * (4 + opp.tension * 6);
      } else {
        thinkRival(dt);
      }
      if (ending || waveClear) {
        raf = requestAnimationFrame(loop);
        return;
      }

      const cut =
        liveOn && !iAmHost
          ? (function guestAbrasionFx() {
              // Guest: host-synced damage; local sparks only when crossed
              abrasion.flash = Math.max(0, abrasion.flash - dt * 3);
              abrasion.sparks = abrasion.sparks.filter((s) => {
                s.life -= dt;
                s.x += s.vx * dt;
                s.y += s.vy * dt;
                return s.life > 0;
              });
              if (abrasion.active && abrasion.sparks.length < 10 && Math.random() < 0.35) {
                abrasion.sparks.push({
                  x: abrasion.x + (Math.random() - 0.5) * 0.02,
                  y: abrasion.y + (Math.random() - 0.5) * 0.02,
                  vx: (Math.random() - 0.5) * 0.15,
                  vy: (Math.random() - 0.5) * 0.15,
                  life: 0.2 + Math.random() * 0.2,
                });
              }
              return null;
            })()
          : tickAbrasion(dt);
      if (cut) {
        onCutResolved(cut.playerWon, cut.why);
        if (!liveOn || ending) {
          raf = requestAnimationFrame(loop);
          return;
        }
      }

      if (opp && opp.alive && !abrasion.active && sailsBump(you, opp) && Math.random() < 0.08) {
        abrasion.sparks.push({
          x: (you.x + opp.x) * 0.5,
          y: (you.y + opp.y) * 0.5,
          vx: (Math.random() - 0.5) * 0.1,
          vy: (Math.random() - 0.5) * 0.1,
          life: 0.2,
        });
      }

      updateHint();
      drawFrame();
      if (liveOn) pushLive();

      raf = requestAnimationFrame(loop);
    }
    if (typeof createGamePauseController === 'function') {
      pauseCtrl = createGamePauseController({
        host: shell.host || shell.overlay,
        pauseBtnId: 'csPatangPause',
        onPause() {
          lastTs = 0;
          if (liveOn) pushLive({ paused: true }, { force: true });
        },
        onResume() {
          lastTs = 0;
          if (liveOn) {
            peerPaused = false;
            pushLive({ paused: false }, { force: true });
          }
          if (!ended && !raf) raf = requestAnimationFrame(loop);
        },
        onQuit: () => {
          confirmAndClose(shell, {
            live: liveOn,
            liveHandle: shell.liveHandle,
            isPlaying: !ended,
            title: 'Leave Patang Baazi?',
            body: liveOn
              ? liveStake > 0
                ? 'Leaving forfeits — virtual stake settles for your opponent.'
                : 'Leaving forfeits this Live duel.'
              : 'This practice run will end.',
          });
        },
      });
    }

    if (liveOn && typeof DangalLive !== 'undefined' && DangalLive.join) {
      liveRoles = DangalLive.roles(chat);
      if (liveRoles.opp) settleOppUid = liveRoles.opp;
      iAmHost =
        liveRoles.host != null
          ? !!liveRoles.host
          : liveRoles.me === liveRoles.playerA;
      // Seat spawn: host leftish, guest rightish
      if (!iAmHost) {
        you.x = 0.68;
        you.targetX = 0.68;
        you.anchorX = PEER_ANCHOR;
        you.color = '#29B6F6';
        you.accent = '#B3E5FC';
        opp.x = 0.32;
        opp.targetX = 0.32;
        opp.anchorX = YOU_ANCHOR;
        opp.color = '#FF6D00';
        opp.accent = '#FFD180';
      }
      liveHandle = DangalLive.join({
        gameType: 'patangbaazi',
        matchId: matchId || matchIdFor(chat, 'patangbaazi'),
        me: liveRoles.me,
        playerA: liveRoles.playerA,
        playerB: liveRoles.playerB,
        onSnap(val) {
          if (!val || ended || !shell.alive()) return;
          if (val.status === 'forfeit') {
            cancelAnimationFrame(raf);
            raf = 0;
            if (shell && typeof shell.markOver === 'function') shell.markOver();
            const iWon = liveRoles && val.winner === liveRoles.me;
            if (!ending && !ended) {
              liveCutArmed = true;
              end(!!iWon, iWon ? 'Opponent left — you win' : 'You left', 'forfeit');
              liveCutArmed = false;
              if (ending) ending.t = 0.9;
            }
            return;
          }
          applyRemoteState(val.state || {});
        },
      });
      shell.liveHandle = liveHandle;
      if (iAmHost) {
        try {
          pushLive({ phase: 'fly' }, { force: true });
        } catch (e) {}
      }
    }

    raf = requestAnimationFrame(loop);
  }

  const RALLIES = [
    {
      id: 'badminton',
      name: 'Badminton',
      icon: '🏸',
      accent: '#01579B',
      bg: '#000D1A',
      courtTint: '#0a3d5c',
      projectile: 'shuttle',
      scoreModel: 'bwf21',
      // BWF-lite: one game to 21, win by 2 after 20-all, 29-all→30. Rally point; winner serves. No best-of-3.
      windowMs: 700,
      prompt: 'Serve, then smash in the green window.',
      serveLabel: 'Serve',
      hitLabel: 'Smash',
    },
  ];

  if (typeof registerGame === 'function') {
    RALLIES.forEach((g, i) => {
      registerGame({
        id: g.id,
        name: g.name,
        desc: rallyMatchSubtitle(g) + ' · arcade timing · Live 1v1',
        icon: g.icon,
        ratingKey: g.id,
        gameType: 'dual',
        liveDuel: true,
        genre: 'rw_sports',
        selfChat: true,
        dangal: true,
        chat1v1: true,
        order: 20 + i,
        launch(ctx) {
          openRallySport(Object.assign({}, g, { chat: ctx }));
        },
      });
    });
    registerGame({
      id: 'patangbaazi',
      name: 'Patang Baazi',
      desc: 'Live duel · Festival practice',
      icon: '🪁',
      gameType: 'dual',
      genre: 'arcade',
      liveDuel: true,
      selfChat: true,
      dangal: true,
      chat1v1: true,
      order: 26,
      meta: {
        phaseA: 'Live dual kite flight sync',
        phaseB: 'Fair human cut · first cut wins',
        phaseC: 'Virtual stakes once · rematch new matchId',
        complete: true,
      },
      launch(ctx) {
        try {
          const chat = resolveChat(ctx);
          if (chatLiveOn(chat)) {
            openPatang({ mode: 'duel', chat });
            return;
          }
          const o = ctx && typeof ctx === 'object' ? ctx : {};
          if (o.mode === 'duel' || o.mode === 'festival') {
            openPatang({ mode: o.mode });
            return;
          }
          openPatangModeSheet();
        } catch (err) {
          console.error('[patangbaazi] launch failed', err);
          openPatang({ mode: 'duel' });
        }
      },
    });
  }

  window.openBadminton = (ctx) => openRallySport(Object.assign({}, RALLIES[0], { chat: ctx }));
  window.openPatangBaazi = (ctx) => {
    const chat = resolveChat(ctx);
    if (chatLiveOn(chat)) {
      openPatang({ mode: 'duel', chat });
      return;
    }
    const o = ctx && typeof ctx === 'object' ? ctx : {};
    if (o.mode === 'duel' || o.mode === 'festival') openPatang({ mode: o.mode });
    else openPatangModeSheet();
  };
  window.openPatangModeSheet = openPatangModeSheet;
})();
