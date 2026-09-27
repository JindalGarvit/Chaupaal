/**
 * Court sports — Badminton rally shell (Practice vs AI or Live 1v1 · virtual stakes once · rematch new matchId).
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
  }

  window.openBadminton = (ctx) => openRallySport(Object.assign({}, RALLIES[0], { chat: ctx }));
})();
