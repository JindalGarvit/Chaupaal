/**
 * Court sports + Patang — timing / raid loops + Patang Live fair cuts (2/3).
 * Practice vs AI, or Live 1v1 (Kabaddi continuous sync + host cut authority).
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
    if (typeof prepareGameOverlay === 'function') {
      prepareGameOverlay(overlay, { theme: 'dark', gameId: o.id, accent: o.accent });
    }
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
          })
        : '') + `<div class="dangal-fullgame-body" data-cs-body></div>`;
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
   * Models: bwf21 | ittf11 | pickle11 | tennisGames
   * Simplifications vs federation law are noted on each RALLIES entry / how-to.
   */
  const RALLY_POINT_LABELS = ['0', '15', '30', '40'];

  function rallyScoreModel(spec) {
    if (spec && spec.scoreModel) return spec.scoreModel;
    const id = spec && spec.id;
    if (id === 'tabletennis') return 'ittf11';
    if (id === 'pickleball') return 'pickle11';
    if (id === 'tennis') return 'tennisGames';
    return 'bwf21';
  }

  function rallyMatchSubtitle(spec) {
    const m = rallyScoreModel(spec);
    if (m === 'bwf21') return 'Game to 21';
    if (m === 'ittf11' || m === 'pickle11') return 'Game to 11';
    if (m === 'tennisGames') return 'First to 2 games';
    return 'Rally';
  }

  function createRallyScoreState(model, serverIsMe) {
    const m = model || 'bwf21';
    if (m === 'tennisGames') {
      return {
        model: m,
        youPts: 0,
        oppPts: 0,
        youGames: 0,
        oppGames: 0,
        serverIsMe: !!serverIsMe,
        initialServerIsMe: !!serverIsMe,
      };
    }
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
    if (st.model === 'tennisGames') {
      const yg = st.youGames | 0;
      const og = st.oppGames | 0;
      const yp = st.youPts | 0;
      const op = st.oppPts | 0;
      let main;
      if (yp >= 3 && op >= 3) {
        if (yp === op) main = 'Deuce';
        else if (yp > op) main = 'Ad–40';
        else main = '40–Ad';
      } else {
        main =
          (RALLY_POINT_LABELS[Math.min(yp, 3)] || '0') +
          '–' +
          (RALLY_POINT_LABELS[Math.min(op, 3)] || '0');
      }
      return { main: main, sub: 'Games ' + yg + '–' + og, line: main + ' · Games ' + yg + '–' + og };
    }
    const y = st.you | 0;
    const o = st.opp | 0;
    let note = '';
    if (st.model === 'bwf21' && y >= 20 && o >= 20) {
      note = y === 29 && o === 29 ? 'Next point wins' : 'Win by 2';
    } else if ((st.model === 'ittf11' || st.model === 'pickle11') && y >= 10 && o >= 10) {
      note = y >= 19 && o >= 19 ? 'Cap — next wins' : 'Win by 2';
    }
    return { main: y + '–' + o, sub: note, line: y + '–' + o + (note ? ' · ' + note : '') };
  }

  function updateIttfServe(state) {
    const total = (state.you | 0) + (state.opp | 0);
    const init = !!state.initialServerIsMe;
    if ((state.you | 0) >= 10 && (state.opp | 0) >= 10) {
      // Deuce: every 1 point. At 10–10 (total 20) initial server.
      state.serverIsMe = (total - 20) % 2 === 0 ? init : !init;
      return;
    }
    // Every 2 points.
    const block = Math.floor(total / 2);
    state.serverIsMe = block % 2 === 0 ? init : !init;
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
    let note = '';

    if (next.model === 'tennisGames') {
      if (w === 'me') next.youPts = (next.youPts | 0) + 1;
      else next.oppPts = (next.oppPts | 0) + 1;
      const yp = next.youPts | 0;
      const op = next.oppPts | 0;
      let gameWinner = null;
      // 0–15–30–40; deuce/Ad via lead-by-2 once either side has ≥4 point ticks
      if ((yp >= 4 || op >= 4) && Math.abs(yp - op) >= 2) {
        gameWinner = yp > op ? 'me' : 'opp';
      }
      if (gameWinner) {
        if (gameWinner === 'me') next.youGames = (next.youGames | 0) + 1;
        else next.oppGames = (next.oppGames | 0) + 1;
        next.youPts = 0;
        next.oppPts = 0;
        next.serverIsMe = !next.serverIsMe; // alternate serve each game
        note = 'Game';
        if ((next.youGames | 0) >= 2 || (next.oppGames | 0) >= 2) {
          ended = true;
          winner = (next.youGames | 0) > (next.oppGames | 0) ? 'me' : 'opp';
          note = 'Match';
        }
      }
      // Mid-game: server unchanged
    } else {
      if (w === 'me') next.you = (next.you | 0) + 1;
      else next.opp = (next.opp | 0) + 1;
      const y = next.you | 0;
      const o = next.opp | 0;

      if (next.model === 'bwf21') {
        // BWF-lite: 21, win by 2 after 20-all; 29-all → next point (30) wins. Winner serves.
        next.serverIsMe = w === 'me';
        if (y >= 30 || o >= 30) {
          ended = true;
          winner = y > o ? 'me' : 'opp';
        } else if ((y >= 21 || o >= 21) && Math.abs(y - o) >= 2) {
          ended = true;
          winner = y > o ? 'me' : 'opp';
        }
      } else if (next.model === 'ittf11') {
        // ITTF-lite: 11 win by 2; hard cap 20 (19-all next wins). Serve every 2 (every 1 at deuce).
        updateIttfServe(next);
        if (y >= 20 || o >= 20) {
          ended = true;
          winner = y > o ? 'me' : 'opp';
        } else if ((y >= 11 || o >= 11) && Math.abs(y - o) >= 2) {
          ended = true;
          winner = y > o ? 'me' : 'opp';
        }
      } else {
        // pickle11 — rally-point to 11 win-by-2, soft cap 20; winner serves. Kitchen visual-only.
        next.serverIsMe = w === 'me';
        if (y >= 20 || o >= 20) {
          ended = true;
          winner = y > o ? 'me' : 'opp';
        } else if ((y >= 11 || o >= 11) && Math.abs(y - o) >= 2) {
          ended = true;
          winner = y > o ? 'me' : 'opp';
        }
      }
    }

    const hud = rallyHudParts(next);
    return { state: next, ended: ended, winner: winner, hud: hud, note: note };
  }

  function bookSummaryScores(book) {
    if (!book) return { you: 0, opp: 0 };
    if (book.model === 'tennisGames') return { you: book.youGames | 0, opp: book.oppGames | 0 };
    return { you: book.you | 0, opp: book.opp | 0 };
  }

  function serializeRallyBook(book, liveRoles) {
    if (!book) return null;
    const meIsA = !liveRoles || liveRoles.me === liveRoles.playerA;
    const flip = (me, opp) => (meIsA ? { a: me, b: opp } : { a: opp, b: me });
    if (book.model === 'tennisGames') {
      const g = flip(book.youGames | 0, book.oppGames | 0);
      const p = flip(book.youPts | 0, book.oppPts | 0);
      return {
        model: book.model,
        aGames: g.a,
        bGames: g.b,
        aPts: p.a,
        bPts: p.b,
        serverIsA: book.serverIsMe ? meIsA : !meIsA,
        initialServerIsA: book.initialServerIsMe ? meIsA : !meIsA,
      };
    }
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
    if (model === 'tennisGames') {
      return {
        model: model,
        youGames: meIsA ? raw.aGames | 0 : raw.bGames | 0,
        oppGames: meIsA ? raw.bGames | 0 : raw.aGames | 0,
        youPts: meIsA ? raw.aPts | 0 : raw.bPts | 0,
        oppPts: meIsA ? raw.bPts | 0 : raw.aPts | 0,
        serverIsMe: raw.serverIsA == null ? true : !!raw.serverIsA === meIsA,
        initialServerIsMe: raw.initialServerIsA == null ? true : !!raw.initialServerIsA === meIsA,
      };
    }
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
    let success = diff === 'easy' ? 0.85 : diff === 'sharp' ? 0.6 : 0.7;
    success *= 0.55 + 0.45 * widthFactor;
    success -= Math.min(0.2, Math.floor((o.rally || 0) / 3) * 0.04);
    if (o.lastPlayerQuality === 'sweet') {
      success -= diff === 'easy' ? 0.04 : diff === 'sharp' ? 0.1 : 0.08;
    }
    if (o.serving) success += 0.12;
    if (o.softForced) success = Math.min(0.95, success + 0.22);
    success = Math.max(0.28, Math.min(0.92, success));
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
    const showKitchen = !!spec.kitchen;
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
        ? liveSub() + (liveStake > 0 ? ' · Stake ⚡' + liveStake + ' (virtual)' : ' · Friendly')
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
        badminton: 'Sweet hits tighten the rally — AI will push back. Game to 21.',
        tabletennis: 'Sweet hits tighten the rally — AI will push back. Game to 11.',
        pickleball: 'Sweet hits tighten the rally — AI will push back. Kitchen is visual only.',
        tennis: 'Sweet hits tighten the rally — AI will push back. First to 2 games.',
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
      if (book.model === 'tennisGames') return { a: packed.aGames | 0, b: packed.bGames | 0 };
      return { a: packed.a | 0, b: packed.b | 0 };
    }

    function applyScores(sc) {
      // Legacy numeric-only snaps — keep as fallback.
      if (!sc || !liveRoles) return;
      if (book.model === 'tennisGames') {
        if (liveRoles.me === liveRoles.playerA) {
          book.youGames = sc.a | 0;
          book.oppGames = sc.b | 0;
        } else {
          book.youGames = sc.b | 0;
          book.oppGames = sc.a | 0;
        }
      } else if (liveRoles.me === liveRoles.playerA) {
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
        (msg || (who === 'me' ? 'Your point.' : 'Opponent point.')) +
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
        renderPlay(line + ' · Opponent serves');
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
              ${showKitchen ? '<div class="cs-rally-kitchen" title="Kitchen (visual)"></div>' : ''}
              <span class="cs-rally-side-label">${pointServerNear ? 'Serve' : 'You'}</span>
            </div>
            <div class="cs-rally-proj cs-rally-proj--${esc(projKind)}${iAmActive ? '' : ' is-idle'}" data-cs-proj>
              ${
                projKind === 'shuttle'
                  ? '<span class="cs-rally-proj-glyph" aria-hidden="true">🏸</span>'
                  : spec.id === 'tennis'
                    ? '<span class="cs-rally-proj-glyph" aria-hidden="true">🎾</span>'
                    : '<span class="cs-rally-proj-orb" aria-hidden="true"></span>'
              }
            </div>
            <div class="cs-rally-window">
              <div class="cs-timing" aria-hidden="true"><i data-cs-bar></i><b class="cs-rally-sweet"></b></div>
            </div>
          </div>
          <div class="cs-court-actions">
          <button type="button" class="cs-hit${iAmActive ? ' cs-hit--primary' : ''}" data-cs-hit ${!iAmActive ? 'disabled' : ''}>${esc(
            !iAmActive && !liveOn ? 'Opponent…' : hitLabel
          )}</button>
          </div>
          <p class="cs-rally-hint">${
            liveOn
              ? iAmActive
                ? 'Rally ' + rally + ' · ' + esc(matchSub) + ' · your contact'
                : 'Score stays live — wait for your contact window'
              : practiceAiTurn
                ? 'Opponent contact · ' + (aiDiff === 'easy' ? 'Easy' : aiDiff === 'sharp' ? 'Sharp' : 'Normal')
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
              if (book.model === 'tennisGames') {
                book.youGames = iWon ? Math.max(book.youGames | 0, 2) : book.youGames | 0;
                book.oppGames = iWon ? book.oppGames | 0 : Math.max(book.oppGames | 0, 2);
              } else {
                const tgt = book.model === 'bwf21' ? 21 : 11;
                book.you = iWon ? Math.max(book.you | 0, tgt) : book.you | 0;
                book.opp = iWon ? book.opp | 0 : Math.max(book.opp | 0, tgt);
              }
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
            const sum = bookSummaryScores(book);
            const matchOver =
              book.model === 'tennisGames' ? sum.you >= 2 || sum.opp >= 2 : false;
            if (matchOver) return finish({ skipPush: true });
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
          if (book.model === 'tennisGames') {
            book.youGames = iWon ? 2 : book.youGames | 0;
            book.oppGames = iWon ? book.oppGames | 0 : 2;
          } else {
            const tgt = book.model === 'bwf21' ? 21 : 11;
            book.you = iWon ? tgt : book.you | 0;
            book.opp = iWon ? book.opp | 0 : tgt;
          }
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

  /**
   * PKL-lite raid law (Prompt 3) — single resolver for Practice + Live.
   * 4-defender mat mappings:
   *   Touch +1/tag on successful Home
   *   Empty Home (0 tags) → defense +1
   *   Bonus: Home after crossing bonus line (y≤0.22) with ≥1 tag → +1
   *   DoD: 2 consecutive empties by that raiding side → next raid must score
   *   All-out: Home with 0 living defenders → +2 (plus touches); mat revives next raid
   *   Super tackle: tackle with ≤2 living defenders → defense +2 else +1
   *   Breath-out / DoD fail → defense +1
   */
  function resolveKabaddiRaidEnd(input) {
    const i = input || {};
    const tags = Math.max(0, i.tags | 0);
    const crossedBonus = !!i.crossedBonus;
    const allOut = !!i.allOut;
    const dod = !!i.dod;
    const endedBy = String(i.endedBy || 'home');
    const aliveAtTackle =
      i.defendersAliveAtTackle != null ? i.defendersAliveAtTackle | 0 : 4;

    let raiderDelta = 0;
    let defenseDelta = 0;
    const flags = [];

    if (endedBy === 'home') {
      if (tags > 0) {
        raiderDelta = tags;
        flags.push('touch');
        if (crossedBonus) {
          raiderDelta += 1;
          flags.push('bonus');
        }
        if (allOut) {
          raiderDelta += 2;
          flags.push('allOut');
        }
        if (dod) flags.push('dodSuccess');
      } else {
        defenseDelta = 1;
        flags.push('empty');
        if (dod) flags.push('dodFail');
      }
    } else if (endedBy === 'tackle') {
      const superT = aliveAtTackle <= 2;
      defenseDelta = superT ? 2 : 1;
      flags.push('tackle');
      if (superT) flags.push('superTackle');
      if (dod) flags.push('dodFail');
    } else if (endedBy === 'breath' || endedBy === 'dod_fail') {
      defenseDelta = 1;
      if (endedBy === 'breath') flags.push('breath');
      if (dod || endedBy === 'dod_fail') flags.push('dodFail');
    }

    const parts = [];
    if (flags.indexOf('superTackle') >= 0) parts.push('Super tackle!');
    else if (flags.indexOf('tackle') >= 0) parts.push('Tackle!');
    if (flags.indexOf('breath') >= 0) parts.push('Breath out');
    if (flags.indexOf('empty') >= 0) parts.push('Empty raid');
    if (flags.indexOf('dodFail') >= 0) parts.push('DoD failed');
    if (flags.indexOf('dodSuccess') >= 0) parts.push('DoD cleared');
    if (flags.indexOf('bonus') >= 0) parts.push('Bonus!');
    if (flags.indexOf('allOut') >= 0) parts.push('All-out!');
    if (flags.indexOf('touch') >= 0 && tags > 0) {
      parts.push(tags + ' touch' + (tags === 1 ? '' : 'es'));
    }
    if (raiderDelta > 0) parts.push('Raider +' + raiderDelta);
    if (defenseDelta > 0) parts.push('Defense +' + defenseDelta);

    return {
      raiderDelta,
      defenseDelta,
      flags,
      summary: parts.join(' · ') || 'Raid over',
      scored: raiderDelta > 0,
      empty: flags.indexOf('empty') >= 0,
    };
  }

  /**
   * Kabaddi Prompt 1–4 — raid court, defense/tackle, PKL-lite scoring, Live session.
   * Control (raid): tap-to-move raider.
   * Control (defend): select one living defender (focus), tap court to move them, Tackle when in range.
   * Breath: starts on first mid-line cross (prep in own half free).
   * Tackle: raider past mid / in anti, living defender within TACKLE_R for HOLD_NEED (shorter if 2+ in range).
   * Authority: raider client (or local Practice sim) commits outcomes via resolveKabaddiRaidEnd.
   * Live: raidUid raids; other seat defends — auto between-raid; settle once; rematch = new matchId.
   * Zones (y: 0=anti top … 1=home bottom): anti ≤0.48 · mid 0.5 · own ≥0.52 · bonus ~0.22.
   * TO_WIN=5 · Prompt 4: Live session + virtual stakes settle · Kabaddi v1 complete.
   */
  function openKabaddi() {
    const chat = resolveChat(arguments[0]);
    const liveOn = chatLiveOn(chat);
    let shellPauseCtrl = null;
    let raidPaused = false;
    let activeRaf = 0;
    let coachShown = false;
    let defCoachShown = false;
    let syncAcc = 0;
    let lastPushAt = 0;
    let betweenTimer = 0;
    // Live stakes: settle ONCE on over/forfeit (virtual chips — not real money).
    const liveStake = liveOn
      ? Number(
          (chat && chat.stake) ||
            (window.__dangalLaunchCtx && window.__dangalLaunchCtx.stake) ||
            0
        ) || 0
      : 0;
    const settleMatchId = liveOn ? String(matchIdFor(chat, 'kabaddi') || '').trim() : '';
    let settleOppUid = '';
    let settleDone = false;
    let resultReported = false;
    let resultShown = false;

    const shell = openShell({
      id: 'kabaddi',
      title: 'Kabaddi',
      subtitle: liveOn
        ? liveSub() +
          (liveStake > 0 ? ' · Stake ⚡' + liveStake + ' (virtual)' : ' · Friendly') +
          ' · Raid & defend'
        : practiceSub('PKL-lite · raid · defend · DoD'),
      mode: liveOn ? 'live' : 'practice',
      live: liveOn,
      chat,
      accent: '#BF360C',
      bg: '#1A0800',
      pauseId: 'csKabaddiPause',
      cleanup: () => {
        if (betweenTimer) {
          clearTimeout(betweenTimer);
          betweenTimer = 0;
        }
        if (activeRaf) {
          cancelAnimationFrame(activeRaf);
          activeRaf = 0;
        }
        if (shellPauseCtrl) shellPauseCtrl.destroy();
      },
    });
    if (!shell) return;
    if (typeof createGamePauseController === 'function') {
      shellPauseCtrl = createGamePauseController({
        host: shell.host || shell.overlay,
        pauseBtnId: 'csKabaddiPause',
        onPause() {
          raidPaused = true;
          if (liveOn && liveHandle && !ended) {
            lastPushAt = 0;
            pushLive(
              {
                paused: true,
                phase: phase,
                raid: activeRaid ? publicRaidStub(activeRaid) : null,
              },
              { force: true }
            );
          }
        },
        onResume() {
          raidPaused = false;
          if (liveOn && liveHandle && !ended) {
            lastPushAt = 0;
            pushLive(
              {
                paused: false,
                phase: phase,
                raid: activeRaid ? publicRaidStub(activeRaid) : null,
              },
              { force: true }
            );
          }
        },
        onQuit: () => {
          confirmAndClose(shell, {
            live: liveOn,
            liveHandle: shell.liveHandle,
            isPlaying: !ended && !resultShown,
            title: 'Leave Kabaddi?',
            body: 'This practice run will end.',
          });
        },
      });
    }

    const TO_WIN = 5;
    const BREATH_MS = 8000;
    const TOUCH_R = 0.09;
    const TACKLE_R = 0.12;
    const HOLD_NEED = 0.32;
    const HOLD_NEED_CHAIN = 0.18;
    const MOVE_SPEED = 1.35;
    const DEF_SPEED = 1.2;
    const AI_RAID_SPEED = 1.1;
    const SYNC_MS = 100;
    const BONUS_Y = 0.22;
    const DOD_EMPTY_NEED = 2;

    let you = 0;
    let opp = 0;
    let ended = false;
    let applying = false;
    let liveRoles = null;
    let liveHandle = null;
    let myRaid = true; // next/current local role: true = we are raider
    let eventSeq = 0;
    let phase = 'between'; // between | raiding | resolving
    /** @type {null | object} */
    let activeRaid = null;
    let remoteDefInput = null;
    let lastAppliedOutcomeSeq = -1;
    /** Consecutive empty Homes by raiding side (me vs opp from local seat). */
    let emptyStreakMe = 0;
    let emptyStreakOpp = 0;

    function scoresForPush() {
      if (!liveRoles) return { a: you, b: opp };
      return liveRoles.me === liveRoles.playerA ? { a: you, b: opp } : { a: opp, b: you };
    }
    function applyScores(sc) {
      if (!sc || !liveRoles) return;
      you = liveRoles.me === liveRoles.playerA ? sc.a | 0 : sc.b | 0;
      opp = liveRoles.me === liveRoles.playerA ? sc.b | 0 : sc.a | 0;
    }
    function emptyStreakFor(iAmRaider) {
      return iAmRaider ? emptyStreakMe : emptyStreakOpp;
    }
    function setEmptyStreakFor(iAmRaider, n) {
      if (iAmRaider) emptyStreakMe = Math.max(0, n | 0);
      else emptyStreakOpp = Math.max(0, n | 0);
    }
    function streakStateForPush() {
      if (!liveRoles) return { me: emptyStreakMe, opp: emptyStreakOpp };
      if (liveRoles.me === liveRoles.playerA) {
        return { A: emptyStreakMe, B: emptyStreakOpp };
      }
      return { A: emptyStreakOpp, B: emptyStreakMe };
    }
    function applyStreakState(st) {
      if (!st || !st.emptyStreak) return;
      const es = st.emptyStreak;
      if (!liveRoles) {
        if (es.me != null) emptyStreakMe = es.me | 0;
        if (es.opp != null) emptyStreakOpp = es.opp | 0;
        return;
      }
      if (es.A != null && es.B != null) {
        if (liveRoles.me === liveRoles.playerA) {
          emptyStreakMe = es.A | 0;
          emptyStreakOpp = es.B | 0;
        } else {
          emptyStreakMe = es.B | 0;
          emptyStreakOpp = es.A | 0;
        }
      }
    }
    function flashRaidBanner(flags) {
      const f = flags || [];
      const bits = [];
      if (f.indexOf('superTackle') >= 0) bits.push('Super tackle!');
      else if (f.indexOf('tackle') >= 0) bits.push('Tackle!');
      if (f.indexOf('bonus') >= 0) bits.push('Bonus!');
      if (f.indexOf('allOut') >= 0) bits.push('All-out!');
      if (f.indexOf('dodFail') >= 0) bits.push('DoD failed');
      if (f.indexOf('dodSuccess') >= 0) bits.push('DoD cleared');
      if (f.indexOf('empty') >= 0 && f.indexOf('dodFail') < 0) bits.push('Empty!');
      if (!bits.length) return;
      if (typeof showToast === 'function') showToast(bits.join(' · '));
    }

    function freshRematch() {
      if (!liveOn) {
        openKabaddi(chat);
        return;
      }
      try {
        const mid =
          typeof dangalMatchId === 'function'
            ? dangalMatchId('kabaddi', chat)
            : 'kabaddi_' + Date.now();
        if (window.__dangalLaunchCtx) {
          window.__dangalLaunchCtx = Object.assign({}, window.__dangalLaunchCtx, {
            matchId: mid,
            gameId: 'kabaddi',
            gameType: 'kabaddi',
            stake: liveStake,
          });
        }
        if (chat) {
          chat.dangalMatchId = mid;
          chat.stake = liveStake;
        }
      } catch (e) {}
      openKabaddi(chat);
    }

    function reportKabaddiResult(won, isDraw, path) {
      if (resultReported) return;
      resultReported = true;
      if (typeof recordGameResult === 'function') {
        try {
          recordGameResult('kabaddi', !!won && !isDraw, !!isDraw, {
            live: !!liveOn,
            stake: liveStake,
            mode: liveOn ? 'live' : 'practice',
            path: path || '',
            score: you,
          });
        } catch (e) {}
      }
    }

    async function settleKabaddiOnce(won, isDraw) {
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
          gameType: 'kabaddi',
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

    function finishMatch(opts) {
      const o = opts || {};
      if (resultShown) return;
      resultShown = true;
      ended = true;
      phase = 'over';
      if (betweenTimer) {
        clearTimeout(betweenTimer);
        betweenTimer = 0;
      }
      if (activeRaf) {
        cancelAnimationFrame(activeRaf);
        activeRaf = 0;
      }
      activeRaid = null;
      if (liveRoles && liveRoles.opp) settleOppUid = liveRoles.opp;

      const forfeit = !!o.forfeit;
      const draw = !forfeit && you === opp;
      const won = forfeit ? !!o.iWon : you > opp;
      const baseSub = o.subtitle || '';
      reportKabaddiResult(won, draw, baseSub);

      if (liveOn && liveHandle && liveRoles && !o.skipLivePush && !applying) {
        try {
          liveHandle.push({
            status: forfeit ? 'forfeit' : 'over',
            winner: draw ? null : won ? liveRoles.me : liveRoles.opp,
            state: {
              scores: scoresForPush(),
              emptyStreak: streakStateForPush(),
              eventSeq,
              phase: 'over',
              msg: baseSub,
            },
          });
        } catch (e) {}
      }

      settleKabaddiOnce(won, draw).then((settle) => {
        let sub = baseSub;
        if (liveOn && liveStake > 0) {
          const cd = settle && settle.chipDelta != null ? Number(settle.chipDelta) : null;
          sub +=
            (sub ? ' · ' : '') +
            (Number.isFinite(cd) && cd !== 0
              ? 'Stake ' + (cd > 0 ? '+' : '') + cd + ' virtual'
              : 'Virtual stakes · not real money');
        }
        showDuelResult(shell, {
          id: 'kabaddi',
          you: forfeit ? (won ? Math.max(you, TO_WIN) : you) : you,
          opp: forfeit ? (won ? opp : Math.max(opp, TO_WIN)) : opp,
          glyph: '💪',
          pbScore: you,
          subtitle: sub,
          shareText:
            'Kabaddi on Chaupaal: ' +
            you +
            '–' +
            opp +
            (liveOn && liveStake > 0 ? ' · virtual stakes' : ''),
          onAgain: freshRematch,
        });
      });
    }

    function inOwnHalf(y) {
      return y >= 0.52;
    }
    function inAntiHalf(y) {
      return y <= 0.48;
    }
    function crossedMid(y) {
      return y < 0.5;
    }
    function dist2(ax, ay, bx, by) {
      const dx = ax - bx;
      const dy = ay - by;
      return dx * dx + dy * dy;
    }

    function defaultDefenders() {
      return [
        { id: 0, x: 0.22, y: 0.16, tx: 0.22, ty: 0.16, alive: true },
        { id: 1, x: 0.42, y: 0.28, tx: 0.42, ty: 0.28, alive: true },
        { id: 2, x: 0.58, y: 0.28, tx: 0.58, ty: 0.28, alive: true },
        { id: 3, x: 0.78, y: 0.16, tx: 0.78, ty: 0.16, alive: true },
      ];
    }

    function livingDefs(raid) {
      return (raid.defenders || []).filter((d) => d.alive);
    }

    function nearestLiving(raid, x, y) {
      let best = null;
      let bestD = Infinity;
      livingDefs(raid).forEach((d) => {
        const d2 = dist2(d.x, d.y, x, y);
        if (d2 < bestD) {
          bestD = d2;
          best = d;
        }
      });
      return best;
    }

    function defsInTackleRange(raid) {
      return livingDefs(raid).filter(
        (d) => dist2(d.x, d.y, raid.rx, raid.ry) <= TACKLE_R * TACKLE_R
      );
    }

    function canAttemptTackle(raid) {
      if (!raid || raid.over) return false;
      if (inOwnHalf(raid.ry)) return false;
      if (!crossedMid(raid.ry) && !inAntiHalf(raid.ry)) return false;
      return defsInTackleRange(raid).length > 0;
    }

    function holdNeedFor(raid) {
      return defsInTackleRange(raid).length >= 2 ? HOLD_NEED_CHAIN : HOLD_NEED;
    }

    function publicRaidStub(raid) {
      if (!raid) return null;
      return {
        raidPhase: raid.phase,
        raider: { x: +raid.rx.toFixed(3), y: +raid.ry.toFixed(3) },
        defenders: raid.defenders.map((d) => ({
          id: d.id,
          x: +d.x.toFixed(3),
          y: +d.y.toFixed(3),
          alive: !!d.alive,
        })),
        breathPct: Math.max(0, Math.min(1, raid.breath / BREATH_MS)),
        breathMs: Math.max(0, Math.round(raid.breath)),
        tagged: raid.tagged | 0,
        breathLive: !!raid.breathLive,
        allOut: livingDefs(raid).length === 0,
        hold: +(raid.holdAcc || 0).toFixed(3),
        activeDef: raid.activeDef | 0,
        dod: !!raid.dod,
        crossedBonus: !!raid.crossedBonus,
        paused: !!raidPaused,
      };
    }

    function pushLive(extraState, extraTop) {
      if (!liveOn || !liveHandle || !liveRoles || applying || ended) return;
      const now = Date.now();
      if (extraTop && extraTop.force) {
        /* always */
      } else if (now - lastPushAt < SYNC_MS && !(extraTop && extraTop.outcome)) {
        return;
      }
      lastPushAt = now;
      liveHandle.push(
        Object.assign(
          {
            status: you >= TO_WIN || opp >= TO_WIN ? 'over' : 'playing',
            winner:
              you >= TO_WIN ? liveRoles.me : opp >= TO_WIN ? liveRoles.opp : null,
            turn: myRaid ? liveRoles.me : liveRoles.opp,
            state: Object.assign(
              {
                scores: scoresForPush(),
                emptyStreak: streakStateForPush(),
                raidUid: myRaid ? liveRoles.me : liveRoles.opp,
                eventSeq,
                phase,
                raid: activeRaid ? publicRaidStub(activeRaid) : null,
              },
              extraState || {}
            ),
          },
          extraTop || {}
        )
      );
    }

    function moveToward(ent, tx, ty, speed, dt) {
      const mdx = tx - ent.x;
      const mdy = ty - ent.y;
      const dist = Math.sqrt(mdx * mdx + mdy * mdy);
      if (dist <= 0.004) return;
      const step = Math.min(dist, speed * dt);
      ent.x += (mdx / dist) * step;
      ent.y += (mdy / dist) * step;
      ent.x = Math.max(0.06, Math.min(0.94, ent.x));
      ent.y = Math.max(0.06, Math.min(0.94, ent.y));
    }

    function tickTags(raid) {
      raid.defenders.forEach((d) => {
        if (!d.alive) return;
        if (dist2(raid.rx, raid.ry, d.x, d.y) <= TOUCH_R * TOUCH_R) {
          d.alive = false;
          raid.tagged += 1;
          buzz('kick');
          raid.msg = 'Tagged ' + raid.tagged + ' — get Home!';
          if (raid.activeDef === d.id) {
            const next = livingDefs(raid)[0];
            raid.activeDef = next ? next.id : 0;
          }
        }
      });
    }

    function aiDefenseStep(raid, dt) {
      const alive = livingDefs(raid);
      if (!alive.length) return;
      const superWindow = alive.length <= 2;
      const chaseMul = superWindow ? 1.12 : 0.92;
      // Closest closes; others shade mid — press harder in super-tackle window
      let closer = alive[0];
      let best = dist2(closer.x, closer.y, raid.rx, raid.ry);
      alive.forEach((d) => {
        const d2 = dist2(d.x, d.y, raid.rx, raid.ry);
        if (d2 < best) {
          best = d2;
          closer = d;
        }
      });
      closer.tx = raid.rx;
      closer.ty = Math.min(0.46, raid.ry + 0.02);
      alive.forEach((d) => {
        if (d === closer) return;
        d.tx = d.x * 0.85 + raid.rx * 0.15;
        d.ty = Math.min(0.4, Math.max(0.12, d.y));
      });
      alive.forEach((d) => {
        moveToward(d, d.tx, d.ty, DEF_SPEED * chaseMul, dt);
      });
      // Auto-commit tackle when in window (faster hold in super-tackle range)
      if (canAttemptTackle(raid) && raid.breathLive) {
        raid.holdAcc += dt * (superWindow ? 1.35 : 1);
        if (raid.holdAcc >= holdNeedFor(raid)) {
          raid.tackleArmed = true;
        }
      } else {
        raid.holdAcc = Math.max(0, raid.holdAcc - dt * 1.5);
      }
    }

    function aiRaidStep(raid, dt) {
      const alive = livingDefs(raid);
      const dod = !!raid.dod;
      // DoD: safe single tag + Home. Else: cross → tag → (maybe greed) → Home
      if (!raid.breathLive) {
        raid.rtx = 0.5;
        raid.rty = 0.42;
      } else if (raid.tagged < 1 && alive.length) {
        const t = nearestLiving(raid, raid.rx, raid.ry);
        if (t) {
          raid.rtx = t.x;
          raid.rty = t.y;
        }
      } else if (
        !dod &&
        raid.tagged < 2 &&
        alive.length &&
        raid.breath > BREATH_MS * 0.45
      ) {
        const t = nearestLiving(raid, raid.rx, raid.ry);
        if (t && Math.random() < 0.55) {
          raid.rtx = t.x;
          raid.rty = t.y;
        } else {
          raid.rtx = 0.5;
          raid.rty = 0.78;
        }
      } else {
        raid.rtx = 0.5;
        raid.rty = 0.82;
      }
      const mdx = raid.rtx - raid.rx;
      const mdy = raid.rty - raid.ry;
      const dist = Math.sqrt(mdx * mdx + mdy * mdy);
      if (dist > 0.004) {
        const step = Math.min(dist, AI_RAID_SPEED * (dod ? 1.08 : 1) * dt);
        raid.rx += (mdx / dist) * step;
        raid.ry += (mdy / dist) * step;
      }
      // Auto Home when safe with tags or low breath (DoD: leave ASAP after one tag)
      if (
        inOwnHalf(raid.ry) &&
        (raid.tagged > 0 ||
          (!dod && raid.breath < BREATH_MS * 0.22) ||
          livingDefs(raid).length === 0)
      ) {
        raid.aiWantHome = true;
      }
    }

    function applyRemoteDefInput(raid, input) {
      if (!input || !raid) return;
      if (input.activeDef != null) raid.activeDef = input.activeDef | 0;
      if (input.defs && Array.isArray(input.defs)) {
        input.defs.forEach((rd) => {
          const d = raid.defenders.find((x) => x.id === rd.id);
          if (!d || !d.alive) return;
          if (rd.tx != null) d.tx = rd.tx;
          if (rd.ty != null) d.ty = rd.ty;
          // Soft snap if far desync
          if (rd.x != null && Math.abs(d.x - rd.x) > 0.2) d.x = rd.x;
          if (rd.y != null && Math.abs(d.y - rd.y) > 0.2) d.y = rd.y;
        });
      }
      if (input.tackle) raid.tackleArmed = true;
    }

    function endRaid(raid, kind, endMsg, opts) {
      const o = opts || {};
      if (!raid || raid.over) return;
      raid.over = true;
      raid.phase = kind === 'home' ? 'home' : 'caught';
      phase = 'resolving';
      activeRaid = null;
      if (activeRaf) {
        cancelAnimationFrame(activeRaf);
        activeRaf = 0;
      }

      const iRaid = !!raid.iAmRaider;
      const living = livingDefs(raid).length;
      const tags = raid.tagged | 0;
      const resolved = resolveKabaddiRaidEnd({
        tags,
        crossedBonus: !!raid.crossedBonus,
        allOut: tags > 0 && living === 0,
        dod: !!raid.dod,
        endedBy: kind,
        defendersAliveAtTackle: living,
      });

      if (iRaid) {
        you += resolved.raiderDelta;
        opp += resolved.defenseDelta;
      } else {
        opp += resolved.raiderDelta;
        you += resolved.defenseDelta;
      }

      if (resolved.scored) {
        setEmptyStreakFor(iRaid, 0);
      } else if (resolved.flags.indexOf('dodFail') >= 0) {
        setEmptyStreakFor(iRaid, 0);
      } else if (resolved.empty) {
        setEmptyStreakFor(iRaid, emptyStreakFor(iRaid) + 1);
      }

      const scoredForUs =
        (iRaid && resolved.raiderDelta > 0) || (!iRaid && resolved.defenseDelta > 0);
      buzz(scoredForUs ? 'win' : 'lose', { noConfetti: true });
      flashRaidBanner(resolved.flags);

      const summary = resolved.summary || endMsg || 'Raid over.';
      eventSeq += 1;
      lastAppliedOutcomeSeq = eventSeq;
      const outcome = {
        seq: eventSeq,
        kind,
        msg: summary,
        tagged: tags,
        allOut: tags > 0 && living === 0,
        flags: resolved.flags.slice(),
        raiderDelta: resolved.raiderDelta,
        defenseDelta: resolved.defenseDelta,
        dod: !!raid.dod,
        crossedBonus: !!raid.crossedBonus,
      };

      if (liveOn && liveHandle && liveRoles && !o.skipLivePush) {
        const nextRaidUid = iRaid ? liveRoles.opp : liveRoles.me;
        myRaid = nextRaidUid === liveRoles.me;
        lastPushAt = 0;
        liveHandle.push({
          status: you >= TO_WIN || opp >= TO_WIN ? 'over' : 'playing',
          winner: you >= TO_WIN ? liveRoles.me : opp >= TO_WIN ? liveRoles.opp : null,
          turn: nextRaidUid,
          state: {
            scores: scoresForPush(),
            emptyStreak: streakStateForPush(),
            raidUid: nextRaidUid,
            eventSeq,
            phase: 'between',
            outcome,
            raid: publicRaidStub(raid),
            msg: summary,
          },
        });
      } else if (!liveOn) {
        myRaid = !iRaid;
      }

      phase = 'between';
      next(summary);
    }

    function applyOutcomeRemote(st) {
      const oc = st && st.outcome;
      if (!oc || oc.seq == null) return false;
      if ((oc.seq | 0) <= lastAppliedOutcomeSeq) return true;
      lastAppliedOutcomeSeq = oc.seq | 0;
      if (st.scores) applyScores(st.scores);
      applyStreakState(st);
      if (st.eventSeq != null) eventSeq = Math.max(eventSeq, st.eventSeq | 0);
      if (st.raidUid != null) myRaid = st.raidUid === liveRoles.me;
      phase = 'between';
      activeRaid = null;
      if (activeRaf) {
        cancelAnimationFrame(activeRaf);
        activeRaf = 0;
      }
      if (oc.flags) flashRaidBanner(oc.flags);
      next(oc.msg || st.msg || 'Raid over.');
      return true;
    }

    /**
     * @param {{ iAmRaider: boolean }} role
     */
    function startRaid(role) {
      if (!shell.alive() || ended || resultShown) return;
      if (betweenTimer) {
        clearTimeout(betweenTimer);
        betweenTimer = 0;
      }
      const iAmRaider = role && role.iAmRaider != null ? !!role.iAmRaider : !!myRaid;
      myRaid = iAmRaider;

      if (activeRaf) {
        cancelAnimationFrame(activeRaf);
        activeRaf = 0;
      }

      const raid = {
        iAmRaider,
        phase: 'prep',
        breath: BREATH_MS,
        breathLive: false,
        tagged: 0,
        over: false,
        rx: 0.5,
        ry: 0.84,
        tx: 0.5,
        ty: 0.84,
        rtx: 0.5,
        rty: 0.84,
        defenders: defaultDefenders(),
        activeDef: 0,
        holdAcc: 0,
        tackleArmed: false,
        aiWantHome: false,
        crossedBonus: false,
        dod: emptyStreakFor(iAmRaider) >= DOD_EMPTY_NEED,
        msg: '',
        painted: false,
      };
      activeRaid = raid;
      phase = 'raiding';
      remoteDefInput = null;
      syncAcc = 0;

      if (raid.dod) {
        raid.msg = 'DO OR DIE — must score this raid.';
        if (typeof showToast === 'function') showToast('DO OR DIE');
      } else if (iAmRaider) {
        if (!coachShown) {
          coachShown = true;
          raid.msg = liveOn
            ? 'You raid — they defend. Cross, tag, Home before breath or tackle.'
            : 'Cross, tag, get Home — AI will try to tackle.';
        } else {
          raid.msg = 'Your raid — tap to move.';
        }
      } else {
        if (!defCoachShown) {
          defCoachShown = true;
          raid.msg = 'On defense, close and tackle before they reach Home.';
        } else {
          raid.msg = 'Defend — pick a shield, close, Tackle.';
        }
      }

      let last = performance.now();

      function tryHome() {
        if (!raid.iAmRaider || raid.over) return;
        if (!inOwnHalf(raid.ry)) {
          buzz('invalid');
          raid.msg = 'Reach your half before Home.';
          paintRaid(true);
          return;
        }
        endRaid(raid, 'home');
      }

      function tryTackleCommit() {
        if (raid.over || raid.iAmRaider) return;
        if (!canAttemptTackle(raid)) {
          buzz('invalid');
          raid.msg = 'Get in range in the anti half to tackle.';
          paintRaid(true);
          return;
        }
        raid.tackleArmed = true;
        // Human defense: start/continue hold
        if (raid.holdAcc < 0.05) raid.holdAcc = 0.05;
      }

      function paintRaid(force) {
        if (!shell.alive() || raid.over) return;
        if (raid.painted && !force) return;
        raid.painted = true;
        const breathPct = Math.max(0, (raid.breath / BREATH_MS) * 100);
        const canHome = raid.iAmRaider && inOwnHalf(raid.ry);
        const tackleReady = !raid.iAmRaider && canAttemptTackle(raid);
        const defsHtml = raid.defenders
          .map((d) => {
            const cls =
              'cs-kb-def' +
              (d.alive ? '' : ' is-out') +
              (d.alive && d.id === raid.activeDef ? ' is-active' : '');
            return (
              '<button type="button" class="' +
              cls +
              '" data-def="' +
              d.id +
              '" style="left:' +
              d.x * 100 +
              '%;top:' +
              d.y * 100 +
              '%"' +
              (d.alive ? '' : ' disabled') +
              '>' +
              (d.alive ? '🛡' : '✓') +
              '</button>'
            );
          })
          .join('');

        const roleLine = raid.iAmRaider ? 'You’re raiding' : 'You’re defending';
        const holdPct = Math.min(100, (raid.holdAcc / holdNeedFor(raid)) * 100);

        shell.body.innerHTML =
          '<div class="cs-kabaddi">' +
          courtTurnBanner(
            raid.iAmRaider ? 'yours' : 'theirs',
            roleLine + (raid.dod ? ' · DO OR DIE' : ''),
            you + '–' + opp + ' · first to ' + TO_WIN + (raidPaused ? ' · Paused' : '')
          ) +
          '<div class="cs-rally-score">💪 <strong>' +
          you +
          '</strong> – <strong>' +
          opp +
          '</strong> · first to ' +
          TO_WIN +
          '</div>' +
          '<div class="cs-kb-role">' +
          esc(roleLine) +
          (raid.dod ? ' · DO OR DIE' : '') +
          (raidPaused ? ' · Paused' : '') +
          '</div>' +
          (raid.dod
            ? '<div class="cs-kb-dod" role="status">DO OR DIE — score or defense +1</div>'
            : '') +
          '<div class="cs-breath' +
          (raid.breathLive ? ' is-live' : '') +
          '" aria-label="Breath"><i style="width:' +
          breathPct +
          '%"></i></div>' +
          '<p class="cs-rally-msg">' +
          esc(raid.msg) +
          '</p>' +
          '<div class="cs-kb-court" data-court role="application" aria-label="Kabaddi court">' +
          '<div class="cs-kb-zone cs-kb-anti" aria-hidden="true"><span>Anti</span></div>' +
          '<div class="cs-kb-line cs-kb-bonus" aria-hidden="true"><span>Bonus</span></div>' +
          '<div class="cs-kb-line cs-kb-mid" aria-hidden="true"><span>Mid</span></div>' +
          '<div class="cs-kb-zone cs-kb-own" aria-hidden="true"><span>Home half</span></div>' +
          defsHtml +
          '<span class="cs-kb-raider" style="left:' +
          raid.rx * 100 +
          '%;top:' +
          raid.ry * 100 +
          '%" aria-label="Raider">🏃</span>' +
          (raid.holdAcc > 0.02
            ? '<div class="cs-kb-hold" style="width:' + holdPct + '%"></div>'
            : '') +
          '</div>' +
          '<div class="cs-kb-meta">Tagged <b>' +
          raid.tagged +
          '</b>' +
          (raid.crossedBonus ? ' · bonus line' : '') +
          (livingDefs(raid).length === 0 ? ' · all out' : '') +
          '</div>' +
          '<div class="cs-kb-actions cs-court-actions">' +
          (raid.iAmRaider
            ? '<button type="button" class="cs-hit cs-hit--primary cs-kb-home" data-home' +
              (canHome ? '' : ' disabled') +
              '>Home</button>'
            : '<button type="button" class="cs-hit cs-hit--primary cs-kb-tackle" data-tackle' +
              (tackleReady ? '' : ' disabled') +
              '>Tackle</button>') +
          '</div>' +
          '</div>';

        const court = shell.body.querySelector('[data-court]');
        const setTarget = (clientX, clientY) => {
          if (raid.over || raidPaused || !court) return;
          const rect = court.getBoundingClientRect();
          if (rect.width < 8 || rect.height < 8) return;
          const x = Math.max(0.06, Math.min(0.94, (clientX - rect.left) / rect.width));
          const y = Math.max(0.06, Math.min(0.94, (clientY - rect.top) / rect.height));
          if (raid.iAmRaider) {
            raid.tx = x;
            raid.ty = y;
          } else {
            const d = raid.defenders.find((z) => z.id === raid.activeDef && z.alive);
            if (d) {
              d.tx = x;
              d.ty = Math.min(0.48, y); // keep defenders mostly anti/mid
            }
          }
        };
        court?.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          try {
            court.setPointerCapture(e.pointerId);
          } catch (err) {}
          setTarget(e.clientX, e.clientY);
        });
        court?.addEventListener('pointermove', (e) => {
          if (e.buttons || e.pressure > 0) setTarget(e.clientX, e.clientY);
        });

        shell.body.querySelectorAll('[data-def]').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (raid.iAmRaider || raid.over) return;
            const id = +btn.dataset.def;
            const d = raid.defenders.find((z) => z.id === id);
            if (!d || !d.alive) return;
            raid.activeDef = id;
            paintRaid(true);
          });
        });

        shell.body.querySelector('[data-home]')?.addEventListener('click', () => tryHome());
        shell.body.querySelector('[data-tackle]')?.addEventListener('click', () => tryTackleCommit());
      }

      function softDom() {
        const ri = shell.body.querySelector('.cs-kb-raider');
        if (ri) {
          ri.style.left = raid.rx * 100 + '%';
          ri.style.top = raid.ry * 100 + '%';
        }
        const bar = shell.body.querySelector('.cs-breath i');
        if (bar) bar.style.width = Math.max(0, (raid.breath / BREATH_MS) * 100) + '%';
        const breathEl = shell.body.querySelector('.cs-breath');
        if (breathEl) {
          if (raid.breathLive) breathEl.classList.add('is-live');
          else breathEl.classList.remove('is-live');
        }
        raid.defenders.forEach((d) => {
          const el = shell.body.querySelector('.cs-kb-def[data-def="' + d.id + '"]');
          if (!el) return;
          el.style.left = d.x * 100 + '%';
          el.style.top = d.y * 100 + '%';
          el.classList.toggle('is-out', !d.alive);
          el.classList.toggle('is-active', d.alive && d.id === raid.activeDef);
          if (!d.alive) el.textContent = '✓';
        });
        const homeBtn = shell.body.querySelector('[data-home]');
        if (homeBtn) homeBtn.disabled = !(raid.iAmRaider && inOwnHalf(raid.ry));
        const tackleBtn = shell.body.querySelector('[data-tackle]');
        if (tackleBtn) tackleBtn.disabled = !(!raid.iAmRaider && canAttemptTackle(raid));
        const meta = shell.body.querySelector('.cs-kb-meta');
        if (meta) {
          meta.innerHTML =
            'Tagged <b>' +
            raid.tagged +
            '</b>' +
            (raid.crossedBonus ? ' · bonus line' : '') +
            (livingDefs(raid).length === 0 ? ' · all out' : '') +
            (raidPaused ? ' · Paused' : '');
        }
        const msgEl = shell.body.querySelector('.cs-rally-msg');
        if (msgEl) msgEl.textContent = raid.msg;
        let hold = shell.body.querySelector('.cs-kb-hold');
        const holdPct = Math.min(100, (raid.holdAcc / Math.max(0.01, holdNeedFor(raid))) * 100);
        if (raid.holdAcc > 0.02) {
          if (!hold) {
            const court = shell.body.querySelector('[data-court]');
            if (court) {
              hold = document.createElement('div');
              hold.className = 'cs-kb-hold';
              court.appendChild(hold);
            }
          }
          if (hold) hold.style.width = holdPct + '%';
        } else if (hold) {
          hold.remove();
        }
      }

      function pushDefenderInput() {
        if (!liveOn || raid.iAmRaider || !liveHandle) return;
        const now = Date.now();
        if (now - lastPushAt < SYNC_MS) return;
        lastPushAt = now;
        liveHandle.push({
          status: 'playing',
          turn: liveRoles.opp,
          state: {
            scores: scoresForPush(),
            emptyStreak: streakStateForPush(),
            raidUid: liveRoles.opp,
            eventSeq,
            phase: 'raiding',
            defInput: {
              by: liveRoles.me,
              activeDef: raid.activeDef,
              tackle: !!raid.tackleArmed,
              defs: raid.defenders.map((d) => ({
                id: d.id,
                x: +d.x.toFixed(3),
                y: +d.y.toFixed(3),
                tx: +d.tx.toFixed(3),
                ty: +d.ty.toFixed(3),
                alive: !!d.alive,
              })),
            },
            raid: publicRaidStub(raid),
          },
        });
        raid.tackleArmed = false;
      }

      function loop(now) {
        if (!shell.alive() || raid.over || ended) {
          activeRaf = 0;
          return;
        }
        if (raidPaused) {
          last = now;
          activeRaf = requestAnimationFrame(loop);
          return;
        }
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;

        // Live defender: mostly follow authority snap; still move local defenders
        if (liveOn && !raid.iAmRaider) {
          // Apply latest public raid from snaps into local for display — handled in onSnap
          livingDefs(raid).forEach((d) => moveToward(d, d.tx, d.ty, DEF_SPEED, dt));
          if (raid.tackleArmed && canAttemptTackle(raid)) {
            raid.holdAcc += dt;
          } else if (!raid.tackleArmed) {
            raid.holdAcc = Math.max(0, raid.holdAcc - dt);
          }
          pushDefenderInput();
          softDom();
          activeRaf = requestAnimationFrame(loop);
          return;
        }

        // === Authority / Practice full sim (local raider OR practice AI raid) ===
        if (liveOn && remoteDefInput) {
          applyRemoteDefInput(raid, remoteDefInput);
          remoteDefInput = null;
        }

        if (raid.iAmRaider) {
          // Human raider move
          const mdx = raid.tx - raid.rx;
          const mdy = raid.ty - raid.ry;
          const dist = Math.sqrt(mdx * mdx + mdy * mdy);
          if (dist > 0.004) {
            const step = Math.min(dist, MOVE_SPEED * dt);
            raid.rx += (mdx / dist) * step;
            raid.ry += (mdy / dist) * step;
          }
          if (!liveOn) aiDefenseStep(raid, dt);
          else {
            livingDefs(raid).forEach((d) => moveToward(d, d.tx, d.ty, DEF_SPEED, dt));
            if (raid.tackleArmed && canAttemptTackle(raid)) {
              raid.holdAcc += dt;
            } else {
              raid.holdAcc = Math.max(0, raid.holdAcc - dt * 1.2);
              if (!canAttemptTackle(raid)) raid.tackleArmed = false;
            }
          }
        } else {
          // Practice: AI raids, human defends
          aiRaidStep(raid, dt);
          livingDefs(raid).forEach((d) => moveToward(d, d.tx, d.ty, DEF_SPEED, dt));
          if (raid.tackleArmed && canAttemptTackle(raid)) {
            raid.holdAcc += dt;
          } else if (!raid.tackleArmed) {
            raid.holdAcc = Math.max(0, raid.holdAcc - dt);
          }
        }

        if (!raid.breathLive && crossedMid(raid.ry)) {
          raid.breathLive = true;
          raid.phase = 'raiding';
          if (raid.dod) raid.msg = 'DO OR DIE — tag and get Home!';
          else if (raid.iAmRaider) raid.msg = 'Breath is live — tag and get Home!';
          else raid.msg = 'Breath live — close and Tackle!';
        }
        if (raid.breathLive) raid.breath -= dt * 1000;
        if (raid.ry <= BONUS_Y) raid.crossedBonus = true;

        tickTags(raid);

        // Tackle success
        if (raid.holdAcc >= holdNeedFor(raid) && canAttemptTackle(raid)) {
          endRaid(raid, 'tackle');
          return;
        }

        if (!raid.iAmRaider && raid.aiWantHome && inOwnHalf(raid.ry)) {
          endRaid(raid, 'home');
          return;
        }

        if (raid.breathLive && raid.breath <= 0) {
          endRaid(raid, 'breath');
          return;
        }

        softDom();

        // Live raider publishes throttled state
        if (liveOn && raid.iAmRaider) {
          syncAcc += dt * 1000;
          if (syncAcc >= SYNC_MS) {
            syncAcc = 0;
            lastPushAt = 0;
            pushLive({ raid: publicRaidStub(raid), phase: 'raiding' }, { force: true });
          }
        }

        activeRaf = requestAnimationFrame(loop);
      }

      paintRaid(true);
      last = performance.now();
      activeRaf = requestAnimationFrame(loop);

      if (liveOn && raid.iAmRaider) {
        lastPushAt = 0;
        pushLive({ raid: publicRaidStub(raid), phase: 'raiding', msg: raid.msg }, { force: true });
      }
    }

    function next(msg) {
      if (you >= TO_WIN || opp >= TO_WIN) {
        finishMatch({ subtitle: msg || '', skipLivePush: true });
        return;
      }

      phase = 'between';
      const hint = myRaid
        ? emptyStreakFor(true) >= DOD_EMPTY_NEED
          ? 'Your raid next — DO OR DIE.'
          : 'Your raid next.'
        : emptyStreakFor(false) >= DOD_EMPTY_NEED
          ? 'Defend next — they face DO OR DIE.'
          : 'Your defense next.';

      if (liveOn) {
        shell.body.innerHTML =
          '<div class="cs-kabaddi">' +
          courtTurnBanner(
            'waiting',
            'Turn over — swap',
            you + '–' + opp
          ) +
          '<div class="cs-rally-score">💪 <strong>' +
          you +
          '</strong> – <strong>' +
          opp +
          '</strong></div>' +
          '<p class="cs-rally-msg">' +
          esc(msg) +
          '</p>' +
          '<p class="cs-rally-hint">' +
          esc(hint) +
          ' Starting…</p>' +
          '<div class="cs-court-actions"><button type="button" class="cs-hit cs-hit--primary" data-ready>Go</button></div>' +
          '</div>';
        const go = () => {
          if (betweenTimer) {
            clearTimeout(betweenTimer);
            betweenTimer = 0;
          }
          startRaid({ iAmRaider: myRaid });
        };
        shell.body.querySelector('[data-ready]')?.addEventListener('click', go);
        if (betweenTimer) clearTimeout(betweenTimer);
        betweenTimer = setTimeout(go, 850);
        if (typeof showToast === 'function') showToast(hint);
        return;
      }

      // Practice: flip already applied in endRaid
      shell.body.innerHTML =
        '<div class="cs-kabaddi">' +
        courtTurnBanner(
          myRaid ? 'yours' : 'theirs',
          myRaid ? 'Your raid next' : 'Defend next',
          you + '–' + opp
        ) +
        '<div class="cs-rally-score">💪 <strong>' +
        you +
        '</strong> – <strong>' +
        opp +
        '</strong></div>' +
        '<p class="cs-rally-msg">' +
        esc(msg) +
        '</p>' +
        '<div class="cs-court-actions"><button type="button" class="cs-hit cs-hit--primary" data-raid-again>' +
        (myRaid
          ? emptyStreakFor(true) >= DOD_EMPTY_NEED
            ? 'Do or die raid'
            : 'Your raid'
          : 'Defend next') +
        '</button></div>' +
        '</div>';
      shell.body.querySelector('[data-raid-again]')?.addEventListener('click', () => {
        startRaid({ iAmRaider: myRaid });
      });
      if (typeof showToast === 'function') showToast(hint);
    }

    if (liveOn && typeof DangalLive !== 'undefined') {
      liveRoles = DangalLive.roles(chat);
      myRaid = !!liveRoles.host;
      if (liveRoles.opp) settleOppUid = liveRoles.opp;
      liveHandle = DangalLive.join({
        gameType: 'kabaddi',
        matchId: settleMatchId || matchIdFor(chat, 'kabaddi'),
        me: liveRoles.me,
        playerA: liveRoles.playerA,
        playerB: liveRoles.playerB,
        onSnap(val) {
          if (!val || ended || resultShown || !shell.alive()) return;
          if (val.status === 'forfeit' || val.status === 'over') {
            applying = true;
            if (val.state && val.state.scores) applyScores(val.state.scores);
            applyStreakState(val.state || {});
            const iWon = val.winner === liveRoles.me;
            finishMatch({
              subtitle:
                val.status === 'forfeit'
                  ? iWon
                    ? 'Opponent left'
                    : 'You forfeited'
                  : (val.state && (val.state.msg || val.state.lastMsg)) || '',
              forfeit: val.status === 'forfeit',
              iWon,
              skipLivePush: true,
            });
            applying = false;
            return;
          }
          const st = val.state || {};
          if (st.scores) applyScores(st.scores);
          applyStreakState(st);
          if (st.eventSeq != null) eventSeq = Math.max(eventSeq, st.eventSeq | 0);
          if (st.paused != null) raidPaused = !!st.paused;

          if (st.outcome && applyOutcomeRemote(st)) return;

          // Defender input → raider authority (reject wrong seat)
          if (
            st.defInput &&
            st.defInput.by === liveRoles.opp &&
            activeRaid &&
            activeRaid.iAmRaider &&
            !activeRaid.over
          ) {
            remoteDefInput = st.defInput;
          }

          // Mirror raid state onto defender client
          if (st.raid && activeRaid && !activeRaid.iAmRaider && !activeRaid.over) {
            const r = st.raid;
            if (r.raider) {
              activeRaid.rx = r.raider.x;
              activeRaid.ry = r.raider.y;
            }
            if (typeof r.breathPct === 'number') {
              activeRaid.breath = r.breathPct * BREATH_MS;
              activeRaid.breathLive = !!r.breathLive;
            } else if (typeof r.breathMs === 'number') {
              activeRaid.breath = r.breathMs;
              activeRaid.breathLive = !!r.breathLive;
            }
            if (r.tagged != null) activeRaid.tagged = r.tagged | 0;
            if (typeof r.hold === 'number') activeRaid.holdAcc = r.hold;
            if (Array.isArray(r.defenders)) {
              r.defenders.forEach((rd) => {
                const d = activeRaid.defenders.find((x) => x.id === rd.id);
                if (!d) return;
                if (rd.alive === false) d.alive = false;
                if (rd.x != null) d.x = d.x * 0.35 + rd.x * 0.65;
                if (rd.y != null) d.y = d.y * 0.35 + rd.y * 0.65;
              });
            }
            if (r.raidPhase) activeRaid.phase = r.raidPhase;
            if (r.dod != null) activeRaid.dod = !!r.dod;
            if (r.crossedBonus) activeRaid.crossedBonus = true;
          }

          // Only auto-enter mat when phase is actively raiding (avoid between-raid zombies)
          if (st.phase === 'raiding' && st.raidUid === liveRoles.me) {
            myRaid = true;
            if (!(activeRaid && !activeRaid.over && activeRaid.iAmRaider)) {
              startRaid({ iAmRaider: true });
            }
          } else if (st.phase === 'raiding' && st.raidUid) {
            myRaid = false;
            if (!(activeRaid && !activeRaid.over && !activeRaid.iAmRaider)) {
              startRaid({ iAmRaider: false });
            }
          } else if (st.raidUid != null) {
            myRaid = st.raidUid === liveRoles.me;
          }
        },
      });
      shell.liveHandle = liveHandle;
      if (liveRoles.host) {
        liveHandle.push({
          status: 'playing',
          turn: liveRoles.me,
          state: {
            scores: { a: 0, b: 0 },
            emptyStreak: { A: 0, B: 0 },
            raidUid: liveRoles.me,
            eventSeq: 0,
            phase: 'between',
            paused: false,
            raid: null,
            stake: liveStake,
          },
        });
      }
    }

    // Kick off first raid (Practice: you raid; Live host raids, guest defends via snap)
    if (!liveOn) {
      myRaid = true;
      startRaid({ iAmRaider: true });
    } else if (liveRoles && liveRoles.host) {
      startRaid({ iAmRaider: true });
    } else {
      shell.body.innerHTML =
        '<div class="cs-kabaddi"><p class="cs-rally-msg">Get ready to defend…</p></div>';
    }
  }

  /**
   * Kho Kho Prompt 5/5 — Live innings + stakes (v1 complete).
   * Match: each side chases ONCE (2 turns). TURN_MS = 75s.
   * Live: chaseUid controls active+Kho+tags; other seat moves batch of 3.
   * Host chases first. Shared turnEndsAt limits clock drift.
   * Authority: chase seat for tag/kho/turn_end/batch; defend seat runInput.
   * Practice AI unchanged. Pause freezes clock + AI / remote input.
   */
  function openKhoKho() {
    const chat = resolveChat(arguments[0]);
    const liveOn = chatLiveOn(chat);
    let shellPauseCtrl = null;
    let paused = false;
    let pauseStartedAt = 0;
    let raf = 0;
    let coachShown = false;
    let lastTs = 0;
    let foulFlashUntil = 0;
    let dirToastShown = false;
    let khoFlashUntil = 0;
    let khoBusy = false;
    let betweenTimer = 0;
    let syncAcc = 0;
    let lastPushAt = 0;
    let applying = false;
    let liveRoles = null;
    let liveHandle = null;
    let chaseUid = '';
    let eventSeq = 0;
    let lastAppliedEventSeq = -1;
    let remoteRunInput = null;
    let turnEndsAt = 0;
    let resultReported = false;
    let resultShown = false;
    let settleDone = false;
    let settleOppUid = '';

    const liveStake = liveOn
      ? Number(
          (chat && chat.stake) ||
            (window.__dangalLaunchCtx && window.__dangalLaunchCtx.stake) ||
            0
        ) || 0
      : 0;
    const settleMatchId = liveOn ? String(matchIdFor(chat, 'khokho') || '').trim() : '';

    const MOVE_SPEED = 1.5;
    const AI_CHASE_SPEED = 1.25;
    const AI_RUN_SPEED = 1.05;
    const HUMAN_RUN_SPEED = 1.35;
    const TAG_R = 0.085;
    const KHO_R = 0.13;
    const KHO_Y = 0.09;
    const LANE_L = 0.42;
    const LANE_R = 0.58;
    const POLE_N = 0.14;
    const POLE_S = 0.86;
    const LOCK_STEP = 0.028;
    const RISE_OFF = 0.14;
    const TURN_MS = 75000;
    const TURNS_TOTAL = 2;
    const MAX_BATCHES = 6;
    const SYNC_MS = 100;

    const shell = openShell({
      id: 'khokho',
      title: 'Kho Kho',
      subtitle: liveOn
        ? liveSub() +
          (liveStake > 0 ? ' · Stake ⚡' + liveStake + ' (virtual)' : ' · Friendly') +
          ' · Chase & run'
        : practiceSub('Batches · 75s turns · AI'),
      mode: liveOn ? 'live' : 'practice',
      live: liveOn,
      chat,
      accent: '#00695C',
      bg: '#021A16',
      pauseId: 'csKhoKhoPause',
      leaveBody: liveOn
        ? 'Leaving now counts as a forfeit for your opponent.'
        : 'This practice run will end.',
      cleanup: () => {
        if (raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
        if (betweenTimer) {
          clearTimeout(betweenTimer);
          betweenTimer = 0;
        }
        if (shellPauseCtrl) shellPauseCtrl.destroy();
      },
    });
    if (!shell) return;

    /** @type {'chase'|'between'|'over'} */
    let phase = 'chase';
    /** Practice only: who is chasing */
    let chaseSide = 'you';
    let turnsDone = 0;
    let scores = { you: 0, opp: 0 };
    let turnTags = 0;
    let clockMs = TURN_MS;
    let batchIndex = 0;
    let needKhoBeforeTag = false;
    let focusRunner = 0;
    let msg = 'You’re chasing — hunt with Kho. Three runners at a time.';
    let painted = false;
    /** @type {{id:number,facing:'L'|'R',seated:boolean,blockId:number|null,blockY:number,x:number,y:number,tx:number,ty:number}[]} */
    let team = [];
    /** @type {{id:number,x:number,y:number,tx:number,ty:number,tagged:boolean}[]} */
    let defenders = [];
    /** @type {'N'|'S'|null} */
    let dir = null;
    /** @type {'L'|'R'} */
    let half = 'L';
    let canTurnAtPole = false;
    let fouling = false;
    const poles = [
      { id: 'n', x: 0.5, y: 0.06 },
      { id: 's', x: 0.5, y: 0.94 },
    ];
    let activeId = 8;

    function iAmChasing() {
      if (!liveOn) return chaseSide === 'you';
      return !!(liveRoles && chaseUid && chaseUid === liveRoles.me);
    }
    function oppLabel() {
      return liveOn ? 'friend' : 'AI';
    }
    function scoresForPush() {
      if (!liveRoles) return { a: scores.you, b: scores.opp };
      return liveRoles.me === liveRoles.playerA
        ? { a: scores.you, b: scores.opp }
        : { a: scores.opp, b: scores.you };
    }
    function applyScores(sc) {
      if (!sc || !liveRoles) return;
      if (liveRoles.me === liveRoles.playerA) {
        scores.you = sc.a | 0;
        scores.opp = sc.b | 0;
      } else {
        scores.you = sc.b | 0;
        scores.opp = sc.a | 0;
      }
    }

    if (typeof createGamePauseController === 'function') {
      shellPauseCtrl = createGamePauseController({
        host: shell.host || shell.overlay,
        pauseBtnId: 'csKhoKhoPause',
        onPause() {
          paused = true;
          pauseStartedAt = Date.now();
          if (liveOn && turnEndsAt) {
            clockMs = Math.max(0, turnEndsAt - Date.now());
          }
          if (liveOn && liveHandle && phase !== 'over') {
            lastPushAt = 0;
            pushLive({ paused: true, clockMs: Math.round(clockMs) }, { force: true });
          }
        },
        onResume() {
          if (pauseStartedAt && turnEndsAt) {
            turnEndsAt += Date.now() - pauseStartedAt;
          } else if (liveOn && phase === 'chase' && clockMs > 0) {
            turnEndsAt = Date.now() + clockMs;
          }
          pauseStartedAt = 0;
          paused = false;
          lastTs = 0;
          if (liveOn && liveHandle && phase !== 'over') {
            lastPushAt = 0;
            pushLive(
              { paused: false, turnEndsAt, clockMs: Math.round(clockMs) },
              { force: true }
            );
          }
        },
        onQuit: () => {
          confirmAndClose(shell, {
            live: liveOn,
            liveHandle: shell.liveHandle,
            isPlaying: phase !== 'over' && !resultShown,
            title: 'Leave Kho Kho?',
            body: liveOn
              ? 'Leaving now counts as a forfeit for your opponent.'
              : 'This practice run will end.',
          });
        },
      });
    }

    function resetTeam() {
      team = [];
      for (let i = 0; i < 8; i++) {
        const blockY = Math.min(0.86, 0.14 + i * 0.095);
        const facing = i % 2 === 0 ? 'L' : 'R';
        team.push({
          id: i,
          facing,
          seated: true,
          blockId: i,
          blockY,
          x: 0.5,
          y: blockY,
          tx: 0.5,
          ty: blockY,
        });
      }
      team.push({
        id: 8,
        facing: 'L',
        seated: false,
        blockId: null,
        blockY: 0.88,
        x: 0.22,
        y: 0.88,
        tx: 0.22,
        ty: 0.88,
      });
      activeId = 8;
      dir = null;
      half = 'L';
      canTurnAtPole = false;
      fouling = false;
      dirToastShown = false;
      khoBusy = false;
    }
    resetTeam();

    function spawnBatch(idx) {
      batchIndex = idx;
      const bases = [
        { x: 0.18, y: 0.28 },
        { x: 0.82, y: 0.5 },
        { x: 0.2, y: 0.74 },
      ];
      defenders = bases.map((b, i) => ({
        id: i,
        x: b.x,
        y: b.y,
        tx: b.x,
        ty: b.y,
        tagged: false,
      }));
      focusRunner = 0;
      needKhoBeforeTag = idx > 0;
      if (needKhoBeforeTag) {
        msg = 'Batch ' + (idx + 1) + ' — give Kho before the next tag';
      } else {
        msg = iAmChasing()
          ? 'Batch ' + (idx + 1) + ' — chase with Kho'
          : 'Batch ' + (idx + 1) + ' — survive the clock';
      }
    }
    spawnBatch(0);

    function active() {
      return team.find((p) => p.id === activeId) || team[team.length - 1];
    }
    function seatedOnly() {
      return team.filter((p) => p.seated);
    }
    function livingDefs() {
      return defenders.filter((d) => !d.tagged);
    }
    function dist(a, b) {
      return Math.hypot(a.x - b.x, a.y - b.y);
    }
    function halfFromX(x) {
      return x < 0.5 ? 'L' : 'R';
    }
    function clampToHalf(x, h) {
      if (h === 'L') return Math.min(x, LANE_L - 0.01);
      return Math.max(x, LANE_R + 0.01);
    }
    function risePos(facing, blockY) {
      return {
        x: clampToHalf(facing === 'L' ? 0.5 - RISE_OFF : 0.5 + RISE_OFF, facing),
        y: blockY,
      };
    }
    function inPoleZone(y) {
      return y <= POLE_N || y >= POLE_S;
    }
    function dirLabel(d) {
      if (d === 'N') return '↑ North pole';
      if (d === 'S') return '↓ South pole';
      return '— unlocked';
    }
    function syncClockFromEnd() {
      if (liveOn && turnEndsAt > 0 && !paused) {
        clockMs = Math.max(0, turnEndsAt - Date.now());
      }
    }
    function clockLabel() {
      syncClockFromEnd();
      const s = Math.max(0, Math.ceil(clockMs / 1000));
      return s + 's';
    }
    function roleLabel() {
      if (phase === 'between') return 'Switching roles…';
      if (phase === 'over') return 'Match over';
      return iAmChasing() ? 'You’re chasing' : 'You’re running';
    }
    function hudStatus() {
      if (phase === 'between') return 'Roles swapping';
      if (khoBusy) return 'KHO! · new chaser rising';
      if (needKhoBeforeTag) return 'Give Kho before tagging this batch';
      if (canTurnAtPole) return 'Pole zone — reverse / switch half';
      if (!dir) return 'First move locks direction · or give Kho';
      return 'Dir ' + (dir === 'N' ? '↑' : '↓') + ' · to pole to reverse';
    }
    function flashFoul(reason) {
      fouling = true;
      foulFlashUntil = performance.now() + 420;
      buzz('invalid');
      msg = reason || 'Foul — no cross.';
      if (typeof showToast === 'function') showToast(msg);
    }
    function khoReachable(sitter) {
      if (!sitter || !sitter.seated) return false;
      const a = active();
      if (!a || a.seated) return false;
      if (fouling || performance.now() < foulFlashUntil) return false;
      if (Math.abs(a.y - sitter.blockY) > KHO_Y) return false;
      const blockPt = { x: 0.5, y: sitter.blockY };
      if (dist(a, blockPt) > KHO_R + 0.04 && dist(a, sitter) > KHO_R) return false;
      if (!inPoleZone(a.y) && halfFromX(a.x) !== sitter.facing) return false;
      return true;
    }
    function legalKhoTargets() {
      return seatedOnly().filter((s) => khoReachable(s));
    }
    function nearestLegalKho() {
      const a = active();
      const list = legalKhoTargets();
      if (!list.length) return null;
      list.sort((p, q) => dist(a, p) - dist(a, q));
      return list[0];
    }

    function publicTeamStub() {
      return team.map((p) => ({
        id: p.id,
        facing: p.facing,
        seated: !!p.seated,
        blockId: p.blockId,
        blockY: +p.blockY.toFixed(3),
        x: +p.x.toFixed(3),
        y: +p.y.toFixed(3),
      }));
    }
    function publicDefsStub() {
      return defenders.map((d) => ({
        id: d.id,
        x: +d.x.toFixed(3),
        y: +d.y.toFixed(3),
        tx: +d.tx.toFixed(3),
        ty: +d.ty.toFixed(3),
        tagged: !!d.tagged,
      }));
    }
    function courtStateBase() {
      syncClockFromEnd();
      return {
        scores: scoresForPush(),
        chaseUid,
        eventSeq,
        phase,
        turnEndsAt,
        clockMs: Math.round(clockMs),
        turnTags: turnTags | 0,
        turnsDone: turnsDone | 0,
        batchIndex: batchIndex | 0,
        needKhoBeforeTag: !!needKhoBeforeTag,
        focusRunner: focusRunner | 0,
        activeId: activeId | 0,
        dir,
        half,
        canTurnAtPole: !!canTurnAtPole,
        paused: !!paused,
        msg,
        team: publicTeamStub(),
        defenders: publicDefsStub(),
        stake: liveStake,
      };
    }
    function pushLive(extraState, extraTop) {
      if (!liveOn || !liveHandle || !liveRoles || applying || resultShown) return;
      const now = Date.now();
      if (extraTop && extraTop.force) {
        /* always */
      } else if (now - lastPushAt < SYNC_MS) {
        return;
      }
      lastPushAt = now;
      liveHandle.push(
        Object.assign(
          {
            status: phase === 'over' ? 'over' : 'playing',
            turn: chaseUid || liveRoles.me,
            state: Object.assign(courtStateBase(), extraState || {}),
          },
          extraTop || {}
        )
      );
    }
    function pushChaseAuthority(extra, force) {
      if (!liveOn || !iAmChasing()) return;
      lastPushAt = 0;
      pushLive(extra || {}, force ? { force: true } : { force: true });
    }
    function pushRunInput() {
      if (!liveOn || iAmChasing() || !liveHandle || !liveRoles || phase !== 'chase') return;
      const now = Date.now();
      if (now - lastPushAt < SYNC_MS) return;
      lastPushAt = now;
      liveHandle.push({
        status: 'playing',
        turn: chaseUid,
        state: {
          scores: scoresForPush(),
          chaseUid,
          eventSeq,
          phase,
          turnEndsAt,
          runInput: {
            by: liveRoles.me,
            focusRunner: focusRunner | 0,
            defs: publicDefsStub(),
          },
        },
      });
    }
    function applyRunInput(input) {
      if (!input || !Array.isArray(input.defs)) return;
      if (input.focusRunner != null) focusRunner = input.focusRunner | 0;
      input.defs.forEach((rd) => {
        const d = defenders.find((x) => x.id === rd.id);
        if (!d || d.tagged) return;
        if (rd.tagged) d.tagged = true;
        if (rd.tx != null) d.tx = rd.tx;
        if (rd.ty != null) d.ty = rd.ty;
        if (rd.x != null) {
          if (Math.abs(d.x - rd.x) > 0.18) d.x = rd.x;
          else d.x = d.x * 0.4 + rd.x * 0.6;
        }
        if (rd.y != null) {
          if (Math.abs(d.y - rd.y) > 0.18) d.y = rd.y;
          else d.y = d.y * 0.4 + rd.y * 0.6;
        }
      });
    }
    function applyCourtMirror(st) {
      if (!st) return;
      if (st.scores) applyScores(st.scores);
      if (st.chaseUid) chaseUid = st.chaseUid;
      if (st.eventSeq != null) eventSeq = Math.max(eventSeq, st.eventSeq | 0);
      if (st.turnTags != null) turnTags = st.turnTags | 0;
      if (st.turnsDone != null) turnsDone = st.turnsDone | 0;
      if (st.batchIndex != null) batchIndex = st.batchIndex | 0;
      if (st.needKhoBeforeTag != null) needKhoBeforeTag = !!st.needKhoBeforeTag;
      if (st.focusRunner != null && !iAmChasing()) focusRunner = st.focusRunner | 0;
      if (st.activeId != null) activeId = st.activeId | 0;
      if (st.dir !== undefined) dir = st.dir;
      if (st.half) half = st.half;
      if (st.canTurnAtPole != null) canTurnAtPole = !!st.canTurnAtPole;
      if (st.msg) msg = st.msg;
      if (st.turnEndsAt) turnEndsAt = st.turnEndsAt;
      else if (st.clockMs != null && !turnEndsAt) clockMs = st.clockMs | 0;
      if (st.paused != null) paused = !!st.paused;
      if (Array.isArray(st.team)) {
        st.team.forEach((rp) => {
          const p = team.find((x) => x.id === rp.id);
          if (!p) return;
          p.facing = rp.facing || p.facing;
          p.seated = !!rp.seated;
          p.blockId = rp.blockId != null ? rp.blockId : null;
          if (rp.blockY != null) p.blockY = rp.blockY;
          if (rp.x != null) {
            if (iAmChasing()) return;
            p.x = Math.abs(p.x - rp.x) > 0.2 ? rp.x : p.x * 0.35 + rp.x * 0.65;
            p.tx = p.x;
          }
          if (rp.y != null) {
            if (iAmChasing()) return;
            p.y = Math.abs(p.y - rp.y) > 0.2 ? rp.y : p.y * 0.35 + rp.y * 0.65;
            p.ty = p.y;
          }
        });
      }
      if (Array.isArray(st.defenders)) {
        st.defenders.forEach((rd) => {
          let d = defenders.find((x) => x.id === rd.id);
          if (!d) {
            d = {
              id: rd.id,
              x: rd.x || 0.5,
              y: rd.y || 0.5,
              tx: rd.tx || rd.x || 0.5,
              ty: rd.ty || rd.y || 0.5,
              tagged: !!rd.tagged,
            };
            defenders.push(d);
            return;
          }
          if (rd.tagged) d.tagged = true;
          if (iAmChasing()) return;
          if (rd.x != null) d.x = Math.abs(d.x - rd.x) > 0.2 ? rd.x : d.x * 0.35 + rd.x * 0.65;
          if (rd.y != null) d.y = Math.abs(d.y - rd.y) > 0.2 ? rd.y : d.y * 0.35 + rd.y * 0.65;
          if (rd.tx != null) d.tx = rd.tx;
          if (rd.ty != null) d.ty = rd.ty;
        });
        if (st.defenders.length === 3 && defenders.length !== 3) {
          defenders = st.defenders.map((rd) => ({
            id: rd.id,
            x: rd.x,
            y: rd.y,
            tx: rd.tx != null ? rd.tx : rd.x,
            ty: rd.ty != null ? rd.ty : rd.y,
            tagged: !!rd.tagged,
          }));
        }
      }
      syncClockFromEnd();
    }
    function applyRemoteEvent(ev, st) {
      if (!ev || ev.seq == null || (ev.seq | 0) <= lastAppliedEventSeq) return false;
      lastAppliedEventSeq = ev.seq | 0;
      eventSeq = Math.max(eventSeq, lastAppliedEventSeq);
      if (st) applyCourtMirror(st);
      if (ev.type === 'kho') {
        khoFlashUntil = performance.now() + 380;
        buzz('win');
        if (typeof showToast === 'function') showToast('KHO!');
        paint(true);
        return true;
      }
      if (ev.type === 'tag') {
        buzz('hit');
        if (typeof showToast === 'function') showToast('Tag! +1');
        paint(true);
        return true;
      }
      if (ev.type === 'batch') {
        if (betweenTimer) {
          clearTimeout(betweenTimer);
          betweenTimer = 0;
        }
        phase = 'chase';
        paint(true);
        return true;
      }
      if (ev.type === 'turn_end') {
        if (betweenTimer) {
          clearTimeout(betweenTimer);
          betweenTimer = 0;
        }
        if (turnsDone >= TURNS_TOTAL) {
          finishMatch({ subtitle: msg || 'Match over', skipLivePush: true });
        } else {
          phase = 'between';
          paint(true);
          if (typeof showToast === 'function') {
            showToast(iAmChasing() ? 'Now you chase!' : 'Now you run!');
          }
          betweenTimer = setTimeout(() => {
            betweenTimer = 0;
            if (!shell.alive() || phase === 'over') return;
            beginChaseTurn({ fromRemote: true });
          }, 1200);
        }
        return true;
      }
      return true;
    }

    function tryGiveKho(toSitterId) {
      if (phase !== 'chase' || khoBusy) return { ok: false, reason: 'Busy' };
      if (liveOn && !iAmChasing()) return { ok: false, reason: 'Not chase seat' };
      const giver = active();
      const sitter = team.find((p) => p.id === toSitterId);
      if (!giver || giver.seated) return { ok: false, reason: 'No active' };
      if (!sitter || !sitter.seated) return { ok: false, reason: 'Already rising' };
      if (fouling || performance.now() < foulFlashUntil) {
        buzz('invalid');
        return { ok: false, reason: 'Mid-foul' };
      }
      if (!khoReachable(sitter)) {
        buzz('invalid');
        msg = 'Out of Kho range';
        return { ok: false, reason: 'Out of range' };
      }
      khoBusy = true;
      khoFlashUntil = performance.now() + 380;
      const blockId = sitter.blockId != null ? sitter.blockId : sitter.id;
      const blockY = sitter.blockY;
      const face = sitter.facing;
      giver.seated = true;
      giver.facing = face;
      giver.blockId = blockId;
      giver.blockY = blockY;
      giver.x = 0.5;
      giver.y = blockY;
      giver.tx = giver.x;
      giver.ty = giver.y;
      const rise = risePos(face, blockY);
      sitter.seated = false;
      sitter.blockId = null;
      sitter.facing = face;
      sitter.blockY = blockY;
      sitter.x = rise.x;
      sitter.y = rise.y;
      sitter.tx = rise.x;
      sitter.ty = rise.y;
      activeId = sitter.id;
      team.forEach((p) => {
        if (p.id === activeId) {
          p.seated = false;
          p.blockId = null;
        }
      });
      dir = null;
      half = face;
      canTurnAtPole = inPoleZone(sitter.y);
      fouling = false;
      dirToastShown = false;
      needKhoBeforeTag = false;
      buzz('win');
      msg = 'KHO! · ' + (half === 'L' ? 'left' : 'right') + ' half';
      if (typeof showToast === 'function') showToast('KHO!');
      paint(true);
      if (betweenTimer) {
        clearTimeout(betweenTimer);
        betweenTimer = 0;
      }
      betweenTimer = setTimeout(() => {
        betweenTimer = 0;
        if (!shell.alive() || phase === 'over') return;
        khoBusy = false;
      }, 220);
      if (liveOn && iAmChasing()) {
        eventSeq += 1;
        lastAppliedEventSeq = eventSeq;
        pushChaseAuthority({ event: { type: 'kho', seq: eventSeq, toSitterId: toSitterId | 0 } }, true);
      }
      return { ok: true };
    }

    function tagDefender(d) {
      if (!d || d.tagged) return false;
      if (liveOn && !iAmChasing()) return false;
      if (needKhoBeforeTag) {
        buzz('invalid');
        msg = 'Give Kho before tagging this batch';
        return false;
      }
      if (fouling || performance.now() < foulFlashUntil) return false;
      d.tagged = true;
      turnTags += 1;
      buzz('hit');
      if (typeof showToast === 'function') showToast('Tag! +1');
      msg =
        'Tag +1 · turn ' +
        turnTags +
        ' · match you ' +
        scores.you +
        '–' +
        scores.opp;
      const outs = defenders.filter((x) => x.tagged).length;
      if (outs >= 3) {
        if (batchIndex + 1 >= MAX_BATCHES) {
          msg = 'Batch cap — keep hunting until the clock ends';
        } else {
          phase = 'between';
          const next = batchIndex + 1;
          betweenTimer = setTimeout(() => {
            betweenTimer = 0;
            if (!shell.alive() || phase === 'over') return;
            phase = 'chase';
            spawnBatch(next);
            paint(true);
            if (liveOn && iAmChasing()) {
              eventSeq += 1;
              lastAppliedEventSeq = eventSeq;
              pushChaseAuthority(
                { event: { type: 'batch', seq: eventSeq, batchIndex: next } },
                true
              );
            }
          }, 900);
          msg = 'Batch wiped — next three incoming…';
          if (typeof showToast === 'function') showToast('Batch cleared — next three');
        }
      }
      if (liveOn && iAmChasing()) {
        eventSeq += 1;
        lastAppliedEventSeq = eventSeq;
        pushChaseAuthority(
          {
            event: {
              type: 'tag',
              seq: eventSeq,
              defId: d.id,
              turnTags,
              batchIndex,
              needKhoBeforeTag: !!needKhoBeforeTag,
            },
          },
          true
        );
      }
      return true;
    }
    function tryTag() {
      if (phase !== 'chase' || khoBusy) return;
      if (liveOn && !iAmChasing()) return;
      const a = active();
      if (!a || a.seated) return;
      livingDefs().forEach((d) => {
        const runnerHalf = halfFromX(d.x);
        if (runnerHalf !== half && !canTurnAtPole) return;
        if (dist(a, d) <= TAG_R) tagDefender(d);
      });
    }

    function freshRematch() {
      if (!liveOn) {
        openKhoKho(chat);
        return;
      }
      try {
        const mid =
          typeof dangalMatchId === 'function'
            ? dangalMatchId('khokho', chat)
            : 'khokho_' + Date.now();
        if (window.__dangalLaunchCtx) {
          window.__dangalLaunchCtx = Object.assign({}, window.__dangalLaunchCtx, {
            matchId: mid,
            gameId: 'khokho',
            gameType: 'khokho',
            stake: liveStake,
          });
        }
        if (chat) {
          chat.dangalMatchId = mid;
          chat.stake = liveStake;
        }
      } catch (e) {}
      openKhoKho(chat);
    }

    function reportKhoKhoResult(won, isDraw, path) {
      if (resultReported) return;
      resultReported = true;
      if (typeof recordGameResult === 'function') {
        try {
          recordGameResult('khokho', !!won && !isDraw, !!isDraw, {
            live: !!liveOn,
            stake: liveStake,
            mode: liveOn ? 'live' : 'practice',
            path: path || '',
            score: scores.you,
          });
        } catch (e) {}
      }
      if (typeof recordDangalSession === 'function') {
        try {
          recordDangalSession('khokho', {
            won: !!won && !isDraw,
            drew: !!isDraw,
            score: scores.you,
            live: !!liveOn,
          });
        } catch (e) {}
      }
      if (typeof setGamePB === 'function') setGamePB('khokho', scores.you);
    }

    async function settleKhoKhoOnce(won, isDraw) {
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
          gameType: 'khokho',
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

    function finishMatch(opts) {
      const o = opts || {};
      if (resultShown) return;
      resultShown = true;
      phase = 'over';
      if (shell.markOver) shell.markOver();
      if (betweenTimer) {
        clearTimeout(betweenTimer);
        betweenTimer = 0;
      }
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      if (liveRoles && liveRoles.opp) settleOppUid = liveRoles.opp;

      const forfeit = !!o.forfeit;
      const draw = !forfeit && scores.you === scores.opp;
      const won = forfeit ? !!o.iWon : scores.you > scores.opp;
      const baseSub =
        o.subtitle ||
        (liveOn
          ? 'Live · each side chased once · 75s turns'
          : 'Practice · each side chased once · 75s turns');
      reportKhoKhoResult(won, draw, baseSub);

      if (liveOn && liveHandle && liveRoles && !o.skipLivePush && !applying) {
        try {
          liveHandle.push({
            status: forfeit ? 'forfeit' : 'over',
            winner: draw ? null : won ? liveRoles.me : liveRoles.opp,
            state: Object.assign(courtStateBase(), {
              phase: 'over',
              msg: baseSub,
            }),
          });
        } catch (e) {}
      }

      settleKhoKhoOnce(won, draw).then((settle) => {
        let sub = baseSub;
        if (liveOn && liveStake > 0) {
          const cd = settle && settle.chipDelta != null ? Number(settle.chipDelta) : null;
          sub +=
            (sub ? ' · ' : '') +
            (Number.isFinite(cd) && cd !== 0
              ? 'Stake ' + (cd > 0 ? '+' : '') + cd + ' virtual'
              : 'Virtual stakes · not real money');
        }
        showDuelResult(shell, {
          id: 'khokho',
          glyph: '🏃',
          you: scores.you,
          opp: scores.opp,
          subtitle: sub,
          shareText:
            'Kho Kho on Chaupaal: ' +
            scores.you +
            '–' +
            scores.opp +
            (liveOn && liveStake > 0 ? ' · virtual stakes' : ''),
          pbScore: scores.you,
          onAgain: freshRematch,
        });
      });
    }

    function endTurn() {
      if (phase === 'over' || phase === 'between') return;
      if (liveOn && !iAmChasing()) return;
      if (iAmChasing()) scores.you += turnTags;
      else scores.opp += turnTags;
      turnsDone += 1;
      buzz('turn');
      if (turnsDone >= TURNS_TOTAL) {
        if (liveOn) {
          eventSeq += 1;
          lastAppliedEventSeq = eventSeq;
          pushChaseAuthority(
            {
              event: { type: 'turn_end', seq: eventSeq, turnsDone },
              phase: 'over',
            },
            true
          );
        }
        finishMatch({
          subtitle: 'Final · you ' + scores.you + '–' + scores.opp,
          skipLivePush: liveOn,
        });
        return;
      }
      phase = 'between';
      msg =
        (iAmChasing() ? 'Your chase ends · ' + turnTags + ' tags' : 'Their chase ends · ' + turnTags + ' tags') +
        ' — switching roles';
      paint(true);
      if (typeof showToast === 'function') {
        showToast(iAmChasing() ? 'Now you run!' : 'Now you chase!');
      }
      if (liveOn && iAmChasing()) {
        const nextUid = liveRoles.me === chaseUid ? liveRoles.opp : liveRoles.me;
        eventSeq += 1;
        lastAppliedEventSeq = eventSeq;
        chaseUid = nextUid;
        pushChaseAuthority(
          {
            event: { type: 'turn_end', seq: eventSeq, turnsDone, nextChaseUid: nextUid },
            phase: 'between',
            chaseUid: nextUid,
          },
          true
        );
      } else if (!liveOn) {
        chaseSide = chaseSide === 'you' ? 'ai' : 'you';
      }
      betweenTimer = setTimeout(() => {
        betweenTimer = 0;
        if (!shell.alive() || phase === 'over') return;
        beginChaseTurn({ fromRemote: false });
      }, 1400);
    }

    function beginChaseTurn(opts) {
      resetTeam();
      spawnBatch(0);
      turnTags = 0;
      needKhoBeforeTag = false;
      phase = 'chase';
      lastTs = 0;
      if (!liveOn) {
        turnEndsAt = 0;
        clockMs = TURN_MS;
      } else if (iAmChasing()) {
        turnEndsAt = Date.now() + TURN_MS;
        clockMs = TURN_MS;
      } else {
        clockMs = turnEndsAt > 0 ? Math.max(0, turnEndsAt - Date.now()) : TURN_MS;
      }
      msg = iAmChasing()
        ? 'You’re chasing — hunt the batch with Kho'
        : 'You’re running — tap a runner, drag to dodge';
      paint(true);
      if (liveOn && iAmChasing()) {
        pushChaseAuthority({ phase: 'chase', turnEndsAt }, true);
      }
    }

    function applyChaseStep(nx, ny) {
      const a = active();
      if (!a || a.seated || khoBusy || phase !== 'chase') return;
      const prevX = a.x;
      const prevY = a.y;
      let x = nx;
      let y = ny;
      if (!dir) {
        const mdx = x - prevX;
        const mdy = y - prevY;
        const moved = Math.hypot(mdx, mdy);
        if (moved >= LOCK_STEP) {
          if (Math.abs(mdy) >= Math.abs(mdx) * 0.35) dir = mdy < 0 ? 'N' : 'S';
          else dir = prevY < 0.5 ? 'S' : 'N';
          x = clampToHalf(x, half);
          if (!dirToastShown && iAmChasing()) {
            dirToastShown = true;
            if (typeof showToast === 'function') showToast('Direction locked → ' + (dir === 'N' ? '↑' : '↓'));
          }
          msg = 'Direction locked → ' + dirLabel(dir);
        } else if (moved > 0.002) {
          x = clampToHalf(x, half);
        }
      }
      const wasInPole = inPoleZone(prevY);
      const nowInPole = inPoleZone(y);
      if (nowInPole) {
        canTurnAtPole = true;
        half = halfFromX(x);
        x = Math.max(0.06, Math.min(0.94, x));
        if (!wasInPole) buzz('select');
      } else if (wasInPole && !nowInPole && canTurnAtPole) {
        half = halfFromX(x);
        const ddy = y - prevY;
        if (Math.abs(ddy) > 0.002) dir = ddy < 0 ? 'N' : 'S';
        else if (!dir) dir = y < 0.5 ? 'S' : 'N';
        canTurnAtPole = false;
        x = clampToHalf(x, half);
      }
      if (dir && !canTurnAtPole) {
        const clamped = clampToHalf(x, half);
        if (Math.abs(clamped - x) > 0.012) {
          if (iAmChasing()) flashFoul('Foul — no cross.');
          x = clamped;
        } else {
          x = clamped;
          fouling = false;
        }
        if (dir === 'N' && y > prevY + 0.004) y = prevY + 0.002;
        else if (dir === 'S' && y < prevY - 0.004) y = prevY - 0.002;
      }
      a.x = Math.max(0.06, Math.min(0.94, x));
      a.y = Math.max(0.05, Math.min(0.95, y));
      if (!canTurnAtPole && dir) a.x = clampToHalf(a.x, half);
    }
    function moveEntityToward(ent, tx, ty, speed, dt, asRunner) {
      const dx = tx - ent.x;
      const dy = ty - ent.y;
      const len = Math.hypot(dx, dy);
      if (len < 0.008) return;
      const step = Math.min(len, speed * dt);
      let nx = ent.x + (dx / len) * step;
      let ny = ent.y + (dy / len) * step;
      if (asRunner) {
        nx = Math.max(0.08, Math.min(0.92, nx));
        ny = Math.max(0.1, Math.min(0.9, ny));
      }
      ent.x = nx;
      ent.y = ny;
    }
    function aiThinkChaser(dt) {
      if (liveOn) return;
      const a = active();
      if (!a || a.seated || khoBusy) return;
      const living = livingDefs();
      if (!living.length) return;
      const onHalf = living.filter((d) => halfFromX(d.x) === half);
      const target = (onHalf.length ? onHalf : living).slice().sort((p, q) => dist(a, p) - dist(a, q))[0];
      const targetHalf = halfFromX(target.x);
      if (targetHalf !== half && !canTurnAtPole) {
        const faceSitters = seatedOnly().filter((s) => s.facing === targetHalf);
        const khoT = faceSitters.filter((s) => khoReachable(s)).sort((p, q) => dist(a, p) - dist(a, q))[0];
        if (khoT) {
          tryGiveKho(khoT.id);
          return;
        }
        const nearSit = faceSitters.slice().sort((p, q) => Math.abs(p.blockY - a.y) - Math.abs(q.blockY - a.y))[0];
        if (nearSit) {
          a.tx = clampToHalf(targetHalf === 'L' ? LANE_L - 0.04 : LANE_R + 0.04, half);
          a.ty = nearSit.blockY;
        } else {
          a.tx = a.x;
          a.ty = dir === 'N' || (!dir && a.y > 0.5) ? 0.08 : 0.92;
        }
      } else if (canTurnAtPole && targetHalf !== half) {
        a.tx = clampToHalf(targetHalf === 'L' ? 0.2 : 0.8, targetHalf);
        a.ty = a.y <= POLE_N ? 0.1 : 0.9;
      } else {
        a.tx = target.x;
        a.ty = target.y;
      }
      const dx = a.tx - a.x;
      const dy = a.ty - a.y;
      const len = Math.hypot(dx, dy);
      if (len > 0.008) {
        const step = Math.min(len, AI_CHASE_SPEED * dt);
        applyChaseStep(a.x + (dx / len) * step, a.y + (dy / len) * step);
      }
    }
    function aiThinkRunners(dt, fleeFrom) {
      if (liveOn) return;
      livingDefs().forEach((d, i) => {
        const awayHalf = halfFromX(fleeFrom.x) === 'L' ? 'R' : 'L';
        const juke = Math.sin(performance.now() / 400 + i * 2.1) * 0.08;
        d.tx = clampToHalf(awayHalf === 'L' ? 0.18 + juke : 0.82 + juke, awayHalf);
        d.ty = Math.max(
          0.12,
          Math.min(0.88, fleeFrom.y + (i - 1) * 0.18 + Math.cos(performance.now() / 500 + i) * 0.05)
        );
        if (dist(d, fleeFrom) < 0.2) {
          d.tx = clampToHalf(d.x + (d.x - fleeFrom.x) * 2, awayHalf);
          d.ty = d.y + (d.y - fleeFrom.y) * 1.5;
        }
        moveEntityToward(d, d.tx, d.ty, AI_RUN_SPEED, dt, true);
        if (d.x > LANE_L && d.x < LANE_R) {
          d.x = d.x < 0.5 ? LANE_L - 0.02 : LANE_R + 0.02;
        }
      });
    }

    function paint(force) {
      if (!shell.alive() || phase === 'over') return;
      if (painted && !force) {
        softPaint();
        return;
      }
      painted = true;
      const a = active();
      const khoReady = iAmChasing() ? legalKhoTargets() : [];
      const khoIds = new Set(khoReady.map((s) => s.id));
      const outs = defenders.filter((d) => d.tagged).length;
      const sitHtml = team
        .filter((p) => p.seated)
        .map((s) => {
          const ready = khoIds.has(s.id);
          return (
            '<button type="button" class="cs-kk-sitter cs-kk-face-' +
            s.facing.toLowerCase() +
            (ready ? ' is-kho-ready' : '') +
            '" data-sitter="' +
            s.id +
            '" style="left:' +
            s.x * 100 +
            '%;top:' +
            s.y * 100 +
            '%">' +
            (s.facing === 'L' ? '◀' : '▶') +
            '</button>'
          );
        })
        .join('');
      const poleHtml = poles
        .map((p) => {
          const hot = (p.id === 'n' && a.y <= POLE_N) || (p.id === 's' && a.y >= POLE_S);
          return (
            '<span class="cs-kk-pole' +
            (hot || canTurnAtPole ? ' is-hot' : '') +
            '" style="left:' +
            p.x * 100 +
            '%;top:' +
            p.y * 100 +
            '%"><i></i><b>Pole</b></span>'
          );
        })
        .join('');
      const defHtml = defenders
        .map((d) => {
          return (
            '<button type="button" class="cs-kk-runner' +
            (d.tagged ? ' is-tagged' : '') +
            (!iAmChasing() && !d.tagged && d.id === focusRunner ? ' is-focus' : '') +
            '" data-def="' +
            d.id +
            '" style="left:' +
            d.x * 100 +
            '%;top:' +
            d.y * 100 +
            '%"' +
            (d.tagged ? ' disabled' : '') +
            '>' +
            (d.tagged ? '✓' : '🏃') +
            '</button>'
          );
        })
        .join('');
      const arrow = !dir ? '·' : dir === 'N' ? '↑' : '↓';
      const pips =
        [0, 1, 2]
          .map((i) => {
            const d = defenders[i];
            const out = d && d.tagged;
            return '<i class="cs-kk-pip' + (out ? ' is-out' : '') + '"></i>';
          })
          .join('') +
        '<span class="cs-kk-pip-label">Batch ' +
        (batchIndex + 1) +
        ' · ' +
        outs +
        '/3 out</span>';
      shell.body.innerHTML =
        '<div class="cs-khokho">' +
        courtTurnBanner(
          iAmChasing() ? 'yours' : 'theirs',
          roleLabel(),
          scores.you +
            '–' +
            scores.opp +
            ' · ' +
            clockLabel() +
            ' · Batch ' +
            (batchIndex + 1)
        ) +
        '<div class="cs-rally-score"><strong>' +
        scores.you +
        '</strong> – <strong>' +
        scores.opp +
        '</strong>' +
        '<span class="cs-rally-score-sub">you · ' +
        oppLabel() +
        ' · turn +' +
        turnTags +
        '</span></div>' +
        '<div class="cs-kk-role" role="status">' +
        esc(roleLabel()) +
        ' · <b data-clock>' +
        clockLabel() +
        '</b></div>' +
        '<div class="cs-kk-batch">' +
        pips +
        '</div>' +
        '<div class="cs-kk-hud" role="status">' +
        '<span class="cs-kk-dir' +
        (canTurnAtPole ? ' is-turn' : dir ? ' is-locked' : '') +
        (performance.now() < khoFlashUntil ? ' is-kho' : '') +
        '">' +
        (performance.now() < khoFlashUntil ? 'K' : arrow) +
        '</span>' +
        '<span class="cs-kk-hud-text">' +
        esc(hudStatus()) +
        ' · ' +
        (half === 'L' ? 'Left' : 'Right') +
        ' half</span></div>' +
        '<p class="cs-rally-msg">' +
        esc(msg) +
        (paused ? ' · Paused' : '') +
        '</p>' +
        '<div class="cs-kk-court' +
        (fouling || performance.now() < foulFlashUntil ? ' is-foul' : '') +
        (canTurnAtPole ? ' is-pole-turn' : '') +
        (performance.now() < khoFlashUntil ? ' is-kho-flash' : '') +
        '" data-court role="application" aria-label="Kho Kho court">' +
        '<div class="cs-kk-free cs-kk-free-l" aria-hidden="true"><span>Free zone</span></div>' +
        '<div class="cs-kk-free cs-kk-free-r" aria-hidden="true"><span>Free zone</span></div>' +
        '<div class="cs-kk-lane" aria-hidden="true"><span>Central lane</span></div>' +
        '<div class="cs-kk-pole-zone cs-kk-pole-n" aria-hidden="true"></div>' +
        '<div class="cs-kk-pole-zone cs-kk-pole-s" aria-hidden="true"></div>' +
        poleHtml +
        sitHtml +
        defHtml +
        '<span class="cs-kk-chaser" style="left:' +
        a.x * 100 +
        '%;top:' +
        a.y * 100 +
        '%">⚡</span></div>' +
        '<div class="cs-kk-meta">' +
        (iAmChasing()
          ? 'Drag to chase · highlight = Kho · wipe batch then Kho again'
          : 'Tap a runner to focus · drag to dodge — chase seat is hunting') +
        '</div>' +
        '<div class="cs-kk-actions cs-court-actions">' +
        (iAmChasing()
          ? '<button type="button" class="cs-hit cs-hit--primary cs-kk-kho-btn" data-kho' +
            (khoReady.length ? '' : ' disabled') +
            '>Kho!</button>'
          : '<p class="cs-rally-hint">You’re running — survive the batch clock</p>') +
        '</div></div>';
      const court = shell.body.querySelector('[data-court]');
      const setTarget = (clientX, clientY) => {
        if (paused || khoBusy || phase !== 'chase' || !court) return;
        const rect = court.getBoundingClientRect();
        if (rect.width < 8 || rect.height < 8) return;
        let tx = Math.max(0.06, Math.min(0.94, (clientX - rect.left) / rect.width));
        let ty = Math.max(0.06, Math.min(0.94, (clientY - rect.top) / rect.height));
        if (iAmChasing()) {
          const act = active();
          if (!act || act.seated) return;
          if (dir && !canTurnAtPole && !inPoleZone(ty)) tx = clampToHalf(tx, half);
          act.tx = tx;
          act.ty = ty;
        } else {
          const d = defenders.find((z) => z.id === focusRunner && !z.tagged);
          if (!d) return;
          d.tx = tx;
          d.ty = ty;
        }
      };
      court?.addEventListener('pointerdown', (e) => {
        if (e.target && e.target.closest && (e.target.closest('[data-sitter]') || e.target.closest('[data-def]')))
          return;
        e.preventDefault();
        try {
          court.setPointerCapture(e.pointerId);
        } catch (err) {}
        setTarget(e.clientX, e.clientY);
      });
      court?.addEventListener('pointermove', (e) => {
        if (e.buttons || e.pressure > 0) setTarget(e.clientX, e.clientY);
      });
      shell.body.querySelectorAll('[data-sitter]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!iAmChasing()) return;
          const id = +btn.dataset.sitter;
          if (!khoIds.has(id)) {
            buzz('invalid');
            return;
          }
          tryGiveKho(id);
        });
      });
      shell.body.querySelectorAll('[data-def]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (iAmChasing()) return;
          const id = +btn.dataset.def;
          const d = defenders.find((z) => z.id === id);
          if (!d || d.tagged) return;
          focusRunner = id;
          buzz('select');
          paint(true);
        });
      });
      shell.body.querySelector('[data-kho]')?.addEventListener('click', () => {
        const t = nearestLegalKho();
        if (!t) {
          buzz('invalid');
          return;
        }
        tryGiveKho(t.id);
      });
      if (!coachShown) {
        coachShown = true;
        if (typeof showToast === 'function') {
          showToast(
            liveOn
              ? 'Live: one chases, one runs the batch — then swap.'
              : 'Three runners at a time — survive the clock or hunt with Kho.'
          );
        }
      }
      if (typeof GameUI !== 'undefined' && GameUI.attachHowTo) {
        GameUI.attachHowTo(shell.overlay, {
          title: 'Kho Kho',
          body: liveOn
            ? 'Arcade Kho Kho Live · batches of 3 · 75s turns · each side chases once. Chase seat moves active + Kho; defend seat moves runners. Leave = forfeit · rematch new match · virtual stakes.'
            : 'Batches of 3 · 75s chase turn · each side chases once. Give Kho to switch chasers. When running, tap a runner then drag. Wipe a batch, then Kho before tagging the next.',
        });
      }
    }
    function softPaint() {
      if (phase === 'over') return;
      const a = active();
      const el = shell.body.querySelector('.cs-kk-chaser');
      if (el && a) {
        el.style.left = a.x * 100 + '%';
        el.style.top = a.y * 100 + '%';
      }
      const khoReady = iAmChasing() ? legalKhoTargets() : [];
      const khoIds = new Set(khoReady.map((s) => s.id));
      const seatedN = seatedOnly().length;
      if (shell.body.querySelectorAll('[data-sitter]').length !== seatedN) {
        paint(true);
        return;
      }
      shell.body.querySelectorAll('[data-sitter]').forEach((btn) => {
        const id = +btn.dataset.sitter;
        const s = team.find((p) => p.id === id);
        if (!s || !s.seated) {
          btn.style.display = 'none';
          return;
        }
        btn.style.display = '';
        btn.style.left = s.x * 100 + '%';
        btn.style.top = s.y * 100 + '%';
        btn.classList.toggle('is-kho-ready', khoIds.has(id));
      });
      defenders.forEach((d) => {
        const node = shell.body.querySelector('[data-def="' + d.id + '"]');
        if (!node) return;
        node.style.left = d.x * 100 + '%';
        node.style.top = d.y * 100 + '%';
        node.classList.toggle('is-tagged', !!d.tagged);
        node.classList.toggle('is-focus', !iAmChasing() && !d.tagged && d.id === focusRunner);
        node.textContent = d.tagged ? '✓' : '🏃';
      });
      const clock = shell.body.querySelector('[data-clock]');
      if (clock) clock.textContent = clockLabel();
      const msgEl = shell.body.querySelector('.cs-rally-msg');
      if (msgEl) msgEl.textContent = msg + (paused ? ' · Paused' : '');
      const hud = shell.body.querySelector('.cs-kk-hud-text');
      if (hud) hud.textContent = hudStatus() + ' · ' + (half === 'L' ? 'Left' : 'Right') + ' half';
      const dirEl = shell.body.querySelector('.cs-kk-dir');
      if (dirEl) {
        const khoing = performance.now() < khoFlashUntil;
        dirEl.textContent = khoing ? 'K' : !dir ? '·' : dir === 'N' ? '↑' : '↓';
        dirEl.classList.toggle('is-kho', khoing);
        dirEl.classList.toggle('is-turn', !!canTurnAtPole);
        dirEl.classList.toggle('is-locked', !!dir && !canTurnAtPole);
      }
      const khoBtn = shell.body.querySelector('[data-kho]');
      if (khoBtn) khoBtn.disabled = !iAmChasing() || !khoReady.length || khoBusy;
      shell.body.querySelectorAll('.cs-kk-pip').forEach((pip, i) => {
        const d = defenders[i];
        pip.classList.toggle('is-out', !!(d && d.tagged));
      });
      const score = shell.body.querySelector('.cs-rally-score');
      if (score) {
        score.innerHTML =
          '<strong>' +
          scores.you +
          '</strong> – <strong>' +
          scores.opp +
          '</strong><span class="cs-rally-score-sub">you · ' +
          oppLabel() +
          ' · turn +' +
          turnTags +
          '</span>';
      }
      const role = shell.body.querySelector('.cs-kk-role');
      if (role) {
        role.innerHTML = esc(roleLabel()) + ' · <b data-clock>' + clockLabel() + '</b>';
      }
    }

    function tick(ts) {
      if (!shell.alive()) return;
      raf = requestAnimationFrame(tick);
      if (phase === 'over') return;
      if (paused) {
        lastTs = ts;
        return;
      }
      if (!lastTs) lastTs = ts;
      const dt = Math.min(0.05, (ts - lastTs) / 1000);
      lastTs = ts;
      if (performance.now() >= foulFlashUntil) fouling = false;
      if (phase === 'chase') {
        if (liveOn && turnEndsAt > 0) {
          clockMs = Math.max(0, turnEndsAt - Date.now());
        } else {
          clockMs -= dt * 1000;
        }
        if (clockMs <= 0) {
          clockMs = 0;
          endTurn();
          softPaint();
          return;
        }
        const a = active();
        if (iAmChasing()) {
          if (a && !a.seated && !khoBusy) {
            const dx = a.tx - a.x;
            const dy = a.ty - a.y;
            const len = Math.hypot(dx, dy);
            if (len > 0.008) {
              const step = Math.min(len, MOVE_SPEED * dt);
              applyChaseStep(a.x + (dx / len) * step, a.y + (dy / len) * step);
            } else if (inPoleZone(a.y)) canTurnAtPole = true;
          }
          if (liveOn && remoteRunInput) {
            applyRunInput(remoteRunInput);
            // Chase seat advances runners toward their remote targets
            livingDefs().forEach((d) => {
              moveEntityToward(d, d.tx, d.ty, HUMAN_RUN_SPEED, dt, true);
            });
          } else if (!liveOn) {
            aiThinkRunners(dt, a);
          }
          tryTag();
          if (liveOn) {
            syncAcc += dt * 1000;
            if (syncAcc >= SYNC_MS) {
              syncAcc = 0;
              pushChaseAuthority({}, true);
            }
          }
        } else {
          if (!liveOn) {
            aiThinkChaser(dt);
          }
          const d = defenders.find((z) => z.id === focusRunner && !z.tagged);
          if (d) moveEntityToward(d, d.tx, d.ty, HUMAN_RUN_SPEED, dt, true);
          livingDefs().forEach((r) => {
            if (r.id === focusRunner) return;
            r.tx = r.x + Math.sin(ts / 700 + r.id) * 0.02;
            r.ty = r.y;
            moveEntityToward(r, r.tx, r.ty, 0.35, dt, true);
          });
          if (liveOn) {
            syncAcc += dt * 1000;
            if (syncAcc >= SYNC_MS) {
              syncAcc = 0;
              pushRunInput();
            }
          } else {
            tryTag();
          }
        }
      }
      softPaint();
    }

    // —— Live join / Practice kickoff ——
    if (liveOn && typeof DangalLive !== 'undefined') {
      liveRoles = DangalLive.roles(chat);
      chaseUid = liveRoles.host ? liveRoles.me : liveRoles.opp || liveRoles.playerA;
      if (liveRoles.opp) settleOppUid = liveRoles.opp;
      liveHandle = DangalLive.join({
        gameType: 'khokho',
        matchId: settleMatchId || matchIdFor(chat, 'khokho'),
        me: liveRoles.me,
        playerA: liveRoles.playerA,
        playerB: liveRoles.playerB,
        onSnap(val) {
          if (!val || resultShown || !shell.alive()) return;
          if (val.status === 'forfeit' || val.status === 'over') {
            applying = true;
            if (val.state && val.state.scores) applyScores(val.state.scores);
            const iWon = val.winner === liveRoles.me;
            finishMatch({
              subtitle:
                val.status === 'forfeit'
                  ? iWon
                    ? 'Opponent left'
                    : 'You forfeited'
                  : (val.state && val.state.msg) || '',
              forfeit: val.status === 'forfeit',
              iWon,
              skipLivePush: true,
            });
            applying = false;
            return;
          }
          const st = val.state || {};
          applying = true;
          if (st.scores) applyScores(st.scores);
          if (st.eventSeq != null) eventSeq = Math.max(eventSeq, st.eventSeq | 0);
          if (st.paused != null) {
            if (st.paused && !paused) pauseStartedAt = Date.now();
            if (!st.paused && paused && pauseStartedAt && st.turnEndsAt) {
              turnEndsAt = st.turnEndsAt;
            }
            paused = !!st.paused;
          }

          // Defend input → chase authority
          if (
            st.runInput &&
            st.runInput.by === liveRoles.opp &&
            iAmChasing() &&
            phase === 'chase'
          ) {
            remoteRunInput = st.runInput;
          }

          if (st.event && applyRemoteEvent(st.event, st)) {
            applying = false;
            return;
          }

          // Mirror court onto defend seat (and soft sync scores/clock for both)
          if (st.chaseUid) chaseUid = st.chaseUid;
          if (st.phase === 'chase' || st.phase === 'between') {
            if (st.phase === 'chase' && phase !== 'over') {
              phase = 'chase';
            } else if (st.phase === 'between' && phase !== 'over') {
              phase = 'between';
            }
            if (!iAmChasing()) applyCourtMirror(st);
            else {
              if (st.turnEndsAt) turnEndsAt = st.turnEndsAt;
              if (st.scores) applyScores(st.scores);
            }
          }
          applying = false;
        },
      });
      shell.liveHandle = liveHandle;
      if (liveRoles.host) {
        chaseUid = liveRoles.me;
        turnEndsAt = Date.now() + TURN_MS;
        clockMs = TURN_MS;
        liveHandle.push({
          status: 'playing',
          turn: liveRoles.me,
          state: Object.assign(courtStateBase(), {
            chaseUid: liveRoles.me,
            phase: 'chase',
            turnEndsAt,
            eventSeq: 0,
          }),
        });
        paint(true);
        raf = requestAnimationFrame(tick);
      } else {
        phase = 'between';
        shell.body.innerHTML = courtWaitPanel({
          mode: 'waiting',
          title: 'You’re running next',
          sub: 'Live Kho Kho',
          detail: 'Score and court appear when the host starts the chase. Stay ready to dodge the batch.',
          scoreHtml:
            '<div class="cs-rally-score"><strong>0</strong> – <strong>0</strong><span class="cs-rally-score-sub">waiting for host</span></div>',
        });
        // Guest waits for host snap; start tick once chase state arrives
        const waitTick = () => {
          if (!shell.alive() || resultShown) return;
          raf = requestAnimationFrame(waitTick);
          if (phase === 'chase' && turnEndsAt > 0) {
            cancelAnimationFrame(raf);
            paint(true);
            lastTs = 0;
            raf = requestAnimationFrame(tick);
          }
        };
        raf = requestAnimationFrame(waitTick);
      }
    } else {
      chaseSide = 'you';
      turnEndsAt = 0;
      clockMs = TURN_MS;
      paint(true);
      raf = requestAnimationFrame(tick);
    }
  }
  /**
   * Pure USBC-style bowling scorer (testable).
   * frames[i].balls = pin counts that ball (0–10). Frames 1–9: 1–2 balls; 10th: up to 3.
   * Returns new array with mark ('X'|'/'|'open'|null), score (frame pts), cumulative.
   * Pending strike/spare totals stay null until bonus rolls exist.
   */
  function scoreBowling(framesIn) {
    const frames = [];
    for (let i = 0; i < 10; i++) {
      const src = framesIn && framesIn[i];
      frames.push({
        balls: ((src && src.balls) || [])
          .slice(0, i === 9 ? 3 : 2)
          .map((n) => Math.max(0, Math.min(10, n | 0))),
        mark: null,
        score: null,
        cumulative: null,
      });
    }
    const rolls = [];
    frames.forEach((f) => {
      f.balls.forEach((b) => rolls.push(b));
    });

    let ri = 0;
    let total = 0;
    for (let f = 0; f < 10; f++) {
      const fr = frames[f];
      const b = fr.balls;
      if (f < 9) {
        if (!b.length) break;
        if (b[0] === 10) {
          fr.mark = 'X';
          if (ri + 2 < rolls.length) {
            const pts = 10 + rolls[ri + 1] + rolls[ri + 2];
            total += pts;
            fr.score = pts;
            fr.cumulative = total;
          }
          ri += 1;
          continue;
        }
        if (b.length < 2) break;
        if (b[0] + b[1] === 10) {
          fr.mark = '/';
          if (ri + 2 < rolls.length) {
            const pts = 10 + rolls[ri + 2];
            total += pts;
            fr.score = pts;
            fr.cumulative = total;
          }
        } else {
          fr.mark = 'open';
          const pts = b[0] + b[1];
          total += pts;
          fr.score = pts;
          fr.cumulative = total;
        }
        ri += 2;
      } else {
        if (!b.length) break;
        if (b[0] === 10) fr.mark = 'X';
        else if (b.length >= 2 && b[0] + b[1] === 10) fr.mark = '/';
        else if (b.length >= 2) fr.mark = 'open';

        const need = b[0] === 10 || (b.length >= 2 && b[0] + b[1] === 10) ? 3 : 2;
        if (b.length >= need) {
          let pts = 0;
          for (let k = 0; k < b.length; k++) pts += b[k];
          total += pts;
          fr.score = pts;
          fr.cumulative = total;
        }
      }
    }
    return frames;
  }

  /**
   * Practice AI aim/power — same resolveBall + scorebook as the human.
   * Easy: wider aim, weaker power, more gutters. Normal: pocket bias, can string X/／.
   */
  function aiThrowBowling(state) {
    const s = state || {};
    const rng = typeof s.rng === 'function' ? s.rng : Math.random;
    const easy = String(s.aiDiff || 'normal').toLowerCase() === 'easy';
    const standing = (s.standingCount | 0) || ((s.pinsUp && s.pinsUp.length) || 10);
    const ball = s.ballInFrame === 2 || s.ballInFrame === 3 ? 2 : 1;
    let aim = -0.08;
    let power = 0.72;
    if (easy) {
      if (rng() < 0.22) {
        aim = rng() < 0.5 ? -0.92 : 0.92;
        power = 0.35 + rng() * 0.25;
      } else {
        aim = (rng() - 0.5) * 1.35;
        power = 0.38 + rng() * 0.4;
      }
    } else {
      if (rng() < 0.08) {
        aim = rng() < 0.5 ? -0.85 : 0.85;
        power = 0.4 + rng() * 0.25;
      } else if (ball === 2 && standing <= 3) {
        aim = -0.05 + (rng() - 0.5) * 0.22;
        power = 0.62 + rng() * 0.28;
      } else {
        aim = -0.08 + (rng() - 0.5) * 0.28;
        power = 0.58 + rng() * 0.35;
      }
    }
    return {
      aim: Math.max(-1, Math.min(1, aim)),
      power: Math.max(0.28, Math.min(1, power)),
    };
  }

  /**
   * Bowling Prompt 4/4 — Practice AI + Live 1v1 alternate-frame duel + virtual stakes.
   * Frame order: each bowler completes their frame N before the other bowls frame N
   * (A F1 → B F1 → A F2 → … → A F10 → B F10). Separate USBC books; higher total wins.
   * Pin RNG: active bowler resolves; peers apply pushed marks (no re-roll).
   */
  function openBowling() {
    const chat = resolveChat(arguments[0]);
    const liveOn = chatLiveOn(chat);
    const rng = typeof rngFn === 'function' ? rngFn() : Math.random;
    const arg0 = arguments[0] && typeof arguments[0] === 'object' ? arguments[0] : null;
    const launchDiff = String((arg0 && arg0.aiDiff) || 'normal').toLowerCase();
    let aiDiff = launchDiff === 'easy' ? 'easy' : 'normal';
    let diffLocked = false;

    const liveStake = liveOn
      ? Number(
          (chat && chat.stake) != null
            ? chat.stake
            : (window.__dangalLaunchCtx && window.__dangalLaunchCtx.stake) || 0
        ) || 0
      : 0;
    const settleMatchId = liveOn ? String(matchIdFor(chat, 'bowling') || '').trim() : '';
    let settleOppUid = '';
    let settleDone = false;
    let resultShown = false;
    let applying = false;
    let liveRoles = null;
    let liveHandle = null;
    let eventSeq = 0;
    let appliedSeq = 0;
    let aiTok = 0;
    let peerPaused = false;

    let shellPauseCtrl = null;
    let paused = false;
    let raf = 0;
    let lastTs = 0;
    let coachShown = false;
    let resultTimer = 0;
    let aiTimer = 0;
    let resolving = false;
    let gameOver = false;

    const GUTTER_AIM = 0.78;
    const FOUL_Y = 0.9;
    const PIN_Y = 0.14;
    const PIN_X = {
      1: 0,
      2: -0.45,
      3: 0.45,
      4: -0.9,
      5: 0,
      6: 0.9,
      7: -1.25,
      8: -0.45,
      9: 0.45,
      10: 1.25,
    };
    const PIN_SPOTS = {
      1: [0.5, 0.2],
      2: [0.42, 0.155],
      3: [0.58, 0.155],
      4: [0.34, 0.115],
      5: [0.5, 0.115],
      6: [0.66, 0.115],
      7: [0.26, 0.075],
      8: [0.42, 0.075],
      9: [0.58, 0.075],
      10: [0.74, 0.075],
    };

    const shell = openShell({
      id: 'bowling',
      title: 'Bowling',
      subtitle: liveOn
        ? liveSub() + (liveStake > 0 ? ' · Stake ⚡' + liveStake + ' (virtual)' : ' · Friendly')
        : practiceSub('vs AI · alternate frames · ' + (aiDiff === 'easy' ? 'Easy' : 'Normal')),
      mode: liveOn ? 'live' : 'practice',
      live: liveOn,
      chat,
      accent: '#FF8F00',
      bg: '#120A02',
      pauseId: 'csBowlingPause',
      leaveBody: liveOn ? 'You’ll forfeit this Live match.' : 'This practice game will end.',
      cleanup: () => {
        aiTok += 1;
        if (raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
        if (resultTimer) {
          clearTimeout(resultTimer);
          resultTimer = 0;
        }
        if (aiTimer) {
          clearTimeout(aiTimer);
          aiTimer = 0;
        }
        if (shellPauseCtrl) shellPauseCtrl.destroy();
      },
    });
    if (!shell) return;

    /** @type {'aim'|'flying'|'result'} */
    let phase = 'aim';
    let aim = 0;
    let power = 0.65;
    let ballX = 0.5;
    let ballY = FOUL_Y;
    let flightT = 0;
    let flightDur = 1.1;
    let startX = 0.5;
    let drift = 0;
    let lastResult = '';
    let lastPinsDown = 0;
    let msg = liveOn ? 'Live 1v1 — alternate frames.' : 'You bowl frame 1, then the AI.';
    /** Shared frame index both bowlers play (1–10). */
    let frameRound = 1;
    /** @type {1|2|3} */
    let ballInFrame = 1;
    /** Active seat within the round: A bowls first each frameRound. */
    let bowlerSeat = 'A';
    /** @type {Record<number, 'up'|'down'>} */
    let pins = {};
    let bookA = scoreBowling([]);
    let bookB = scoreBowling([]);

    function resetRack() {
      for (let i = 1; i <= 10; i++) pins[i] = 'up';
    }
    resetRack();

    function pinsUpList() {
      const out = [];
      for (let i = 1; i <= 10; i++) if (pins[i] === 'up') out.push(i);
      return out;
    }
    function standingCount() {
      return pinsUpList().length;
    }
    function isLiteSplit(up) {
      const s = up
        .slice()
        .sort((a, b) => a - b)
        .join(',');
      return s === '7,10' || s === '4,6' || s === '4,6,7,10' || s === '2,3';
    }
    function bookTotal(book) {
      let last = 0;
      (book || []).forEach((f) => {
        if (f.cumulative != null) last = f.cumulative;
      });
      return last;
    }
    function countMarks(book) {
      let x = 0;
      let sp = 0;
      (book || []).forEach((f) => {
        if (f.mark === 'X') x += 1;
        if (f.mark === '/') sp += 1;
      });
      return { strikes: x, spares: sp };
    }
    function mySeat() {
      if (!liveOn || !liveRoles) return 'A';
      return liveRoles.me === liveRoles.playerA ? 'A' : 'B';
    }
    function oppSeat() {
      return mySeat() === 'A' ? 'B' : 'A';
    }
    function bookForSeat(seat) {
      return seat === 'A' ? bookA : bookB;
    }
    function setBookForSeat(seat, book) {
      if (seat === 'A') bookA = book;
      else bookB = book;
    }
    function myBook() {
      return bookForSeat(mySeat());
    }
    function oppBook() {
      return bookForSeat(oppSeat());
    }
    function activeBook() {
      return bookForSeat(bowlerSeat);
    }
    function uidForSeat(seat) {
      if (!liveRoles) return '';
      return seat === 'A' ? liveRoles.playerA : liveRoles.playerB;
    }
    function iAmBowling() {
      if (gameOver) return false;
      if (!liveOn) return bowlerSeat === 'A';
      return !!(liveRoles && bowlerSeat === mySeat());
    }
    function isFrozen() {
      return !!(paused || peerPaused);
    }

    function serializeBook(book) {
      return (book || []).map((f) => ({
        balls: (f.balls || []).slice(),
        mark: f.mark || null,
        score: f.score,
        cumulative: f.cumulative,
      }));
    }
    function serializePins() {
      const o = {};
      for (let i = 1; i <= 10; i++) o[i] = pins[i] === 'down' ? 'down' : 'up';
      return o;
    }
    function applyPins(snap) {
      if (!snap) return;
      for (let i = 1; i <= 10; i++) {
        pins[i] = snap[i] === 'down' ? 'down' : 'up';
      }
    }

    function resolveBall(input) {
      const o = input || {};
      const up = (o.pinsUp || pinsUpList()).slice();
      if (o.gutter || !up.length) {
        return { downIds: [], leaveIds: up, flag: '' };
      }
      const a = Math.max(-1, Math.min(1, Number(o.aim) || 0));
      const pwr = Math.max(0.28, Math.min(1, Number(o.power) || 0.5));
      const ball = o.ballInFrame === 2 || o.ballInFrame === 3 ? 2 : 1;
      const hitX = a * 1.15;
      const pocketDist = Math.abs(a - -0.08);
      const pocketQ = Math.max(0, 1 - pocketDist / 0.5);
      const powerQ = (pwr - 0.28) / 0.72;
      let quality = pocketQ * 0.62 + powerQ * 0.38 + (rng() - 0.5) * 0.1;
      quality = Math.max(0, Math.min(1, quality));

      const downSet = new Set();
      const tryKnock = (id, chance) => {
        if (up.indexOf(id) < 0 || downSet.has(id)) return;
        if (rng() < Math.max(0, Math.min(0.98, chance))) downSet.add(id);
      };

      up.forEach((id) => {
        const dx = Math.abs(PIN_X[id] - hitX);
        let chance = Math.exp(-dx * dx * (2.4 - pwr * 0.9)) * (0.28 + pwr * 0.72);
        if (id === 1) chance += pocketQ * 0.22;
        tryKnock(id, chance);
      });

      if (downSet.has(1) && quality > 0.55) {
        [2, 3, 4, 5, 6, 8, 9].forEach((id) => tryKnock(id, 0.35 + quality * 0.55));
        if (quality > 0.78) {
          tryKnock(7, 0.25 + quality * 0.4);
          tryKnock(10, 0.25 + quality * 0.4);
        }
      } else if (!downSet.has(1) && quality < 0.4) {
        if (a < -0.25) {
          tryKnock(7, 0.55);
          tryKnock(4, 0.4);
        } else if (a > 0.25) {
          tryKnock(10, 0.55);
          tryKnock(6, 0.4);
        }
      }

      if (ball === 1 && quality > 0.8 && up.length === 10) {
        if (rng() < 0.35 + quality * 0.55) {
          return { downIds: up.slice(), leaveIds: [], flag: 'strike' };
        }
      }
      if (downSet.size === 0 && quality > 0.35 && ball === 1) {
        tryKnock(1, 0.7);
        tryKnock(a < 0 ? 2 : 3, 0.5);
      }
      if (ball === 2) {
        const n = up.length;
        let spareP = 0.2 + quality * 0.55;
        if (n === 1) spareP = 0.55 + quality * 0.4;
        else if (n === 2 && !isLiteSplit(up)) spareP = 0.4 + quality * 0.4;
        else if (isLiteSplit(up)) spareP = 0.12 + quality * 0.25;
        else if (n >= 5) spareP = 0.15 + quality * 0.35;
        if (rng() < spareP) {
          return { downIds: up.slice(), leaveIds: [], flag: 'spare' };
        }
        up.forEach((id) => {
          const dx = Math.abs(PIN_X[id] - hitX);
          tryKnock(id, Math.exp(-dx * dx * 2) * (0.4 + quality * 0.5));
        });
      }

      const downIds = up.filter((id) => downSet.has(id));
      const leaveIds = up.filter((id) => !downSet.has(id));
      let flag = '';
      if (ball === 1 && downIds.length === 10) flag = 'strike';
      else if (ball === 2 && leaveIds.length === 0 && up.length > 0) flag = 'spare';
      return { downIds, leaveIds, flag };
    }

    function pinRackHtml() {
      let h = '';
      for (let id = 1; id <= 10; id++) {
        const p = PIN_SPOTS[id];
        h +=
          '<span class="cs-bw-pin' +
          (pins[id] === 'down' ? ' is-down' : '') +
          '" style="left:' +
          p[0] * 100 +
          '%;top:' +
          p[1] * 100 +
          '%" title="Pin ' +
          id +
          '"><b>' +
          id +
          '</b></span>';
      }
      return h;
    }

    function boardHtml() {
      let h = '';
      for (let i = 0; i < 10; i++) {
        h += '<i class="cs-bw-board" style="left:' + (8 + i * 8.4) + '%"></i>';
      }
      return h;
    }

    function frameStripHtml(book, opts) {
      const o = opts || {};
      const curIdx = o.current ? frameRound - 1 : -1;
      let h =
        '<div class="cs-bw-sheet' +
        (o.mine ? ' is-mine' : '') +
        '" role="table" aria-label="' +
        esc(o.label || 'Score') +
        '">';
      if (o.label) {
        h += '<div class="cs-bw-sheet-lab">' + esc(o.label) + '</div>';
      }
      for (let i = 0; i < 10; i++) {
        const fr = book[i] || { balls: [] };
        const cur = !gameOver && o.current && i === curIdx;
        const b = fr.balls || [];
        let c1 = '';
        let c2 = '';
        let c3 = '';
        if (i < 9) {
          if (b[0] === 10) {
            c1 = '';
            c2 = 'X';
          } else {
            c1 = b.length >= 1 ? (b[0] === 0 ? '-' : String(b[0])) : '';
            if (b.length >= 2) {
              c2 = b[0] + b[1] === 10 ? '/' : b[1] === 0 ? '-' : String(b[1]);
            }
          }
        } else {
          if (b.length >= 1) {
            c1 = b[0] === 10 ? 'X' : b[0] === 0 ? '-' : String(b[0]);
          }
          if (b.length >= 2) {
            if (b[0] === 10) c2 = b[1] === 10 ? 'X' : b[1] === 0 ? '-' : String(b[1]);
            else c2 = b[0] + b[1] === 10 ? '/' : b[1] === 0 ? '-' : String(b[1]);
          }
          if (b.length >= 3) {
            c3 = b[2] === 10 ? 'X' : b[2] === 0 ? '-' : String(b[2]);
          }
        }
        const tot =
          fr.cumulative != null ? String(fr.cumulative) : fr.mark === 'X' || fr.mark === '/' ? '…' : '';
        h +=
          '<div class="cs-bw-frame' +
          (cur ? ' is-current' : '') +
          (i === 9 ? ' is-tenth' : '') +
          '"><span class="cs-bw-fn">' +
          (i + 1) +
          '</span><span class="cs-bw-marks"><i>' +
          esc(c1) +
          '</i><i>' +
          esc(c2) +
          '</i>' +
          (i === 9 ? '<i>' + esc(c3) + '</i>' : '') +
          '</span><span class="cs-bw-cum">' +
          esc(tot) +
          '</span></div>';
      }
      h +=
        '<div class="cs-bw-frame cs-bw-total"><span class="cs-bw-fn">Σ</span><span class="cs-bw-cum">' +
        bookTotal(book) +
        '</span></div>';
      h += '</div>';
      return h;
    }

    /**
     * Record pins for active bowler's current ball.
     * @returns {'ball2'|'fill'|'frame'|'over'}
     */
    function applyDelivery(pinsDown) {
      const n = Math.max(0, Math.min(10, pinsDown | 0));
      const fi = frameRound - 1;
      let book = activeBook().map((f) => ({ balls: (f.balls || []).slice() }));
      if (!book[fi]) book[fi] = { balls: [] };
      book[fi].balls.push(n);
      book = scoreBowling(book);
      setBookForSeat(bowlerSeat, book);

      const fr = book[fi];
      const b = fr.balls;
      if (fi < 9) {
        if (ballInFrame === 1 && n === 10) return 'frame';
        if (ballInFrame === 1) return 'ball2';
        return 'frame';
      }
      if (b.length === 1) return n === 10 ? 'fill' : 'ball2';
      if (b.length === 2) {
        if (b[0] === 10) return 'fill';
        if (b[0] + b[1] === 10) return 'fill';
        return 'over';
      }
      return 'over';
    }

    function pushLive(status, extra) {
      if (!liveOn || !liveHandle || !liveRoles || applying) return;
      eventSeq += 1;
      const youTot = bookTotal(myBook());
      const oppTot = bookTotal(oppBook());
      const st = Object.assign(
        {
          frameRound,
          ballInFrame,
          bowlerSeat,
          books: { A: serializeBook(bookA), B: serializeBook(bookB) },
          pins: serializePins(),
          eventSeq,
          phase: phase === 'flying' ? 'aim' : phase,
          msg: msg || '',
          scores: {
            a: bookTotal(bookA),
            b: bookTotal(bookB),
          },
          lastPinsDown,
          lastResult,
          paused: !!paused,
          aiDiff: null,
        },
        extra || {}
      );
      try {
        liveHandle.push({
          status: status || (gameOver ? 'over' : 'playing'),
          turn: uidForSeat(bowlerSeat),
          winner:
            status === 'over' || status === 'forfeit'
              ? youTot === oppTot
                ? null
                : youTot > oppTot
                  ? liveRoles.me
                  : liveRoles.opp
              : null,
          state: st,
        });
        appliedSeq = Math.max(appliedSeq, eventSeq);
      } catch (e) {}
    }

    async function settleBowlingOnce(won, isDraw) {
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
          gameType: 'bowling',
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
      try {
        if (shell && typeof shell.close === 'function') shell.close('again');
      } catch (e) {}
      if (!liveOn) {
        openBowling({ chat: chat, aiDiff: aiDiff });
        return;
      }
      try {
        const mid =
          typeof dangalMatchId === 'function'
            ? dangalMatchId('bowling', chat)
            : 'bowling_' + Date.now();
        if (window.__dangalLaunchCtx) {
          window.__dangalLaunchCtx = Object.assign({}, window.__dangalLaunchCtx, {
            matchId: mid,
            gameId: 'bowling',
            gameType: 'bowling',
            stake: liveStake,
          });
        }
        if (chat) {
          chat.dangalMatchId = mid;
          chat.stake = liveStake;
        }
      } catch (e) {}
      openBowling(chat);
    }

    function endGame(opts) {
      const o = opts || {};
      if (resultShown) return;
      resultShown = true;
      gameOver = true;
      phase = 'result';
      aiTok += 1;
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      if (aiTimer) {
        clearTimeout(aiTimer);
        aiTimer = 0;
      }
      if (shell.markOver) shell.markOver();
      if (liveRoles && liveRoles.opp) settleOppUid = liveRoles.opp;

      const you = bookTotal(myBook());
      const opp = bookTotal(oppBook());
      const forfeit = !!o.forfeit;
      const draw = !forfeit && you === opp;
      const won = forfeit ? !!o.iWon : you > opp;
      const myMarks = countMarks(myBook());

      if (typeof recordGameResult === 'function') {
        try {
          recordGameResult('bowling', !!won && !draw, !!draw, {
            live: !!liveOn,
            stake: liveStake,
            mode: liveOn ? 'live' : 'practice',
            score: you,
          });
        } catch (e) {}
      }

      if (liveOn && liveHandle && liveRoles && !o.skipPush && !applying) {
        pushLive(forfeit ? 'forfeit' : 'over', { msg: o.msg || '' });
      }

      const baseSub =
        (o.msg ? o.msg + ' · ' : '') +
        you +
        '–' +
        opp +
        ' · ' +
        myMarks.strikes +
        'X · ' +
        myMarks.spares +
        '／' +
        (liveOn ? '' : ' · vs AI');

      settleBowlingOnce(won, draw).then((settle) => {
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
          id: 'bowling',
          you: forfeit ? (won ? Math.max(you, 1) : you) : you,
          opp: forfeit ? (won ? opp : Math.max(opp, 1)) : opp,
          glyph: '🎳',
          pbScore: you,
          subtitle: sub,
          shareText: 'Bowling on Chaupaal: ' + you + '–' + opp,
          onAgain: freshRematch,
        });
      });
    }

    function advanceAfterFrame() {
      if (bowlerSeat === 'A') {
        bowlerSeat = 'B';
        ballInFrame = 1;
        resetRack();
        resetBallAim();
        msg = iAmBowling()
          ? 'Your turn — frame ' + frameRound
          : (!liveOn ? 'AI bowls frame ' : 'Opponent bowls frame ') + frameRound;
        if (liveOn) pushLive('playing');
        paint();
        scheduleAiIfNeeded();
        return;
      }
      // B finished this round
      if (frameRound >= 10) {
        if (liveOn) pushLive('over');
        endGame({ skipPush: true });
        return;
      }
      frameRound += 1;
      bowlerSeat = 'A';
      ballInFrame = 1;
      resetRack();
      resetBallAim();
      msg = iAmBowling()
        ? 'Frame ' + frameRound + ' — your turn'
        : (!liveOn ? 'AI bowls frame ' : 'Opponent bowls frame ') + frameRound;
      if (liveOn) pushLive('playing');
      paint();
      scheduleAiIfNeeded();
    }

    function advanceAfterBall(step) {
      if (step === 'over') {
        // Active bowler's 10th frame complete
        msg = 'Frame 10 locked · ' + bookTotal(activeBook());
        if (liveOn) pushLive('playing');
        resultTimer = setTimeout(() => {
          resultTimer = 0;
          if (!shell.alive() || gameOver) return;
          advanceAfterFrame();
        }, 800);
        paint();
        return;
      }
      if (step === 'ball2') {
        msg = lastPinsDown + ' down — clean the leave (ball 2)';
        if (iAmBowling() && typeof showToast === 'function') showToast(lastPinsDown + ' pins');
        if (iAmBowling()) buzz(lastPinsDown > 0 ? 'hit' : 'lose', { noConfetti: true });
        resultTimer = setTimeout(() => {
          resultTimer = 0;
          if (!shell.alive() || gameOver) return;
          ballInFrame = 2;
          resetBallAim();
          if (liveOn) pushLive('playing');
          paint();
          scheduleAiIfNeeded();
        }, 750);
        paint();
        return;
      }
      if (step === 'fill') {
        const needFresh = standingCount() === 0 || lastPinsDown === 10;
        msg = needFresh
          ? lastPinsDown === 10
            ? 'Fill strike — new rack'
            : '10th fill · fresh rack'
          : '10th fill · clean the leave';
        if (iAmBowling()) {
          buzz(lastPinsDown === 10 ? 'win' : 'hit', { noConfetti: lastPinsDown < 10 });
          if (typeof showToast === 'function') {
            showToast(lastPinsDown === 10 ? 'Strike!' : lastPinsDown + ' pins');
          }
        }
        resultTimer = setTimeout(() => {
          resultTimer = 0;
          if (!shell.alive() || gameOver) return;
          ballInFrame = Math.min(3, ballInFrame + 1);
          if (needFresh) resetRack();
          resetBallAim();
          if (liveOn) pushLive('playing');
          paint();
          scheduleAiIfNeeded();
        }, 750);
        paint();
        return;
      }
      // frame complete (1–9)
      const wasStrike = lastPinsDown === 10 && ballInFrame === 1;
      msg = wasStrike ? 'Strike! Frame locked' : 'Frame locked';
      if (typeof showToast === 'function') {
        showToast('Frame ' + frameRound + (wasStrike ? ' · Strike' : ' locked'));
      }
      if (iAmBowling()) {
        if (wasStrike) {
          buzz('win');
          if (typeof showToast === 'function') showToast('Strike!');
        } else {
          buzz(lastPinsDown > 0 ? 'hit' : 'lose', { noConfetti: true });
        }
      }
      if (liveOn) pushLive('playing');
      resultTimer = setTimeout(() => {
        resultTimer = 0;
        if (!shell.alive() || gameOver) return;
        advanceAfterFrame();
      }, 800);
      paint();
    }

    function resetBallAim() {
      phase = 'aim';
      resolving = false;
      ballX = 0.5 + aim * 0.12;
      ballY = FOUL_Y;
      flightT = 0;
      lastTs = 0;
    }

    function scheduleAiIfNeeded() {
      if (liveOn || gameOver || bowlerSeat !== 'B' || phase !== 'aim' || isFrozen()) return;
      const tok = ++aiTok;
      msg = 'Opponent bowling…';
      paint();
      if (aiTimer) clearTimeout(aiTimer);
      aiTimer = setTimeout(() => {
        aiTimer = 0;
        if (tok !== aiTok || !shell.alive() || gameOver || bowlerSeat !== 'B' || phase !== 'aim') return;
        if (standingCount() === 0) resetRack();
        const t = aiThrowBowling({
          aiDiff,
          ballInFrame,
          standingCount: standingCount(),
          pinsUp: pinsUpList(),
          rng,
        });
        aim = t.aim;
        power = t.power;
        beginThrow(true);
      }, 650 + Math.floor(rng() * 400));
    }

    function beginThrow(fromAi) {
      if (gameOver || phase !== 'aim' || isFrozen() || resolving) return;
      if (!fromAi && !iAmBowling()) return;
      if (!fromAi && liveOn && liveRoles && uidForSeat(bowlerSeat) !== liveRoles.me) return;
      if (!liveOn && !fromAi) diffLocked = true;
      if (standingCount() === 0) resetRack();
      aim = Math.max(-1, Math.min(1, aim));
      power = Math.max(0.28, Math.min(1, power));
      startX = 0.5 + aim * 0.28;
      ballX = startX;
      ballY = FOUL_Y;
      drift = aim * (0.08 + (1 - power) * 0.18);
      flightDur = 1.55 - power * 0.55;
      flightT = 0;
      phase = 'flying';
      lastResult = '';
      msg = fromAi ? 'Opponent rolling…' : 'Ball rolling…';
      if (!fromAi) buzz('select');
      lastTs = 0;
      if (!raf) raf = requestAnimationFrame(tick);
      softPaintFlying();
    }

    function resolveThrow() {
      if (resolving || phase === 'result' || gameOver) return;
      // Live: only active bowler resolves RNG
      if (liveOn && !iAmBowling()) return;
      resolving = true;
      phase = 'result';
      const gutter = Math.abs(ballX - 0.5) > GUTTER_AIM * 0.42 || ballX < 0.12 || ballX > 0.88;
      const before = pinsUpList();
      const standingBefore = before.length;
      const chartBall = before.length >= 10 || ballInFrame === 1 ? 1 : 2;
      const resolved = resolveBall({
        aim,
        power,
        gutter: !!gutter,
        pinsUp: before,
        ballInFrame: chartBall,
      });
      if (gutter) {
        lastPinsDown = 0;
        lastResult = 'gutter';
        msg = 'Gutter — 0';
        if (iAmBowling() && typeof showToast === 'function') showToast('Gutter');
        if (iAmBowling()) buzz('lose', { noConfetti: true });
      } else {
        resolved.downIds.forEach((id) => {
          pins[id] = 'down';
        });
        lastPinsDown = resolved.downIds.length;
        lastResult =
          lastPinsDown === standingBefore && standingBefore === 10
            ? 'strike'
            : lastPinsDown === standingBefore
              ? 'spare'
              : 'hit';
      }
      const pinsThisBall = gutter ? 0 : lastPinsDown;
      const step = applyDelivery(pinsThisBall);
      if (liveOn) pushLive('playing');
      paint();
      advanceAfterBall(step);
    }

    function applyRemoteSnap(st, val) {
      if (!st) return;
      if (st.eventSeq != null) {
        const seq = st.eventSeq | 0;
        if (seq <= appliedSeq) return false;
        appliedSeq = seq;
        eventSeq = Math.max(eventSeq, seq);
      }
      if (st.books && st.books.A) bookA = scoreBowling(st.books.A);
      if (st.books && st.books.B) bookB = scoreBowling(st.books.B);
      if (st.frameRound != null) frameRound = Math.max(1, Math.min(10, st.frameRound | 0));
      if (st.ballInFrame != null) ballInFrame = Math.max(1, Math.min(3, st.ballInFrame | 0));
      if (st.bowlerSeat === 'A' || st.bowlerSeat === 'B') bowlerSeat = st.bowlerSeat;
      if (st.pins) applyPins(st.pins);
      if (st.lastPinsDown != null) lastPinsDown = st.lastPinsDown | 0;
      if (st.lastResult) lastResult = st.lastResult;
      if (st.msg) msg = st.msg;
      if (st.paused != null) peerPaused = !!st.paused && !paused;
      phase = 'aim';
      resolving = false;
      resetBallAim();
      return true;
    }

    function setAiDiff(d) {
      if (liveOn || diffLocked || gameOver) return;
      aiDiff = d === 'easy' ? 'easy' : 'normal';
      buzz('select');
      try {
        if (shell.setSubtitle) {
          shell.setSubtitle(
            practiceSub('vs AI · alternate frames · ' + (aiDiff === 'easy' ? 'Easy' : 'Normal'))
          );
        }
      } catch (e) {}
      paint();
    }

    function paint() {
      if (!shell.alive() || gameOver) return;
      const aimPct = Math.round(((aim + 1) / 2) * 100);
      const powPct = Math.round(power * 100);
      const youT = bookTotal(myBook());
      const oppT = bookTotal(oppBook());
      const active = iAmBowling() && phase === 'aim' && !isFrozen();
      const waiting = !iAmBowling() && !gameOver;
      const showDiff = !liveOn && !diffLocked && frameRound === 1 && bowlerSeat === 'A' && !gameOver;

      shell.body.innerHTML =
        '<div class="cs-bowling">' +
        courtTurnBanner(
          active ? 'yours' : waiting ? 'theirs' : 'waiting',
          active
            ? 'Your throw · frame ' + frameRound
            : waiting
              ? 'Opponent bowling…'
              : phase === 'flying'
                ? 'Ball rolling…'
                : 'Frame ' + frameRound,
          youT + '–' + oppT + ' · ball ' + ballInFrame
        ) +
        frameStripHtml(myBook(), {
          label: 'You ' + youT,
          mine: true,
          current: bowlerSeat === mySeat(),
        }) +
        frameStripHtml(oppBook(), {
          label: (liveOn ? 'Opp ' : 'AI ') + oppT,
          current: bowlerSeat === oppSeat(),
        }) +
        '<div class="cs-rally-score"><strong>' +
        youT +
        '–' +
        oppT +
        '</strong><span class="cs-rally-score-sub">F' +
        frameRound +
        ' · ' +
        (iAmBowling() ? 'Your' : waiting ? 'Their' : '') +
        ' ball ' +
        ballInFrame +
        (waiting ? ' · waiting' : '') +
        '</span></div>' +
        '<p class="cs-rally-msg">' +
        esc(waiting && phase === 'aim' ? 'Opponent bowling — frame strip stays live' : msg) +
        (isFrozen() ? ' · Paused' : '') +
        '</p>' +
        (showDiff
          ? '<div class="cs-bw-diff" role="group" aria-label="AI difficulty">' +
            '<button type="button" class="cs-bw-diff-btn' +
            (aiDiff === 'easy' ? ' is-on' : '') +
            '" data-diff="easy">Easy</button>' +
            '<button type="button" class="cs-bw-diff-btn' +
            (aiDiff === 'normal' ? ' is-on' : '') +
            '" data-diff="normal">Normal</button></div>'
          : '') +
        '<div class="cs-bw-lane' +
        (lastResult === 'gutter' ? ' is-gutter' : '') +
        (lastResult === 'strike' || lastResult === 'spare' || lastResult === 'hit' ? ' is-pocket' : '') +
        '" data-lane role="img" aria-label="Bowling lane">' +
        '<div class="cs-bw-gutters" aria-hidden="true"></div>' +
        '<div class="cs-bw-wood">' +
        boardHtml() +
        '</div>' +
        '<div class="cs-bw-foul"><span>Foul line</span></div>' +
        '<div class="cs-bw-pins">' +
        pinRackHtml() +
        '</div>' +
        '<span class="cs-bw-ball' +
        (phase === 'flying' ? ' is-flying' : '') +
        '" style="left:' +
        ballX * 100 +
        '%;top:' +
        ballY * 100 +
        '%"></span>' +
        '</div>' +
        '<div class="cs-bw-controls cs-court-actions">' +
        '<label class="cs-bw-slider">Aim <b data-aim-lab>' +
        (aim > 0.08 ? 'Right' : aim < -0.08 ? 'Left' : 'Center') +
        '</b>' +
        '<input type="range" min="0" max="100" value="' +
        aimPct +
        '" data-aim' +
        (!active ? ' disabled' : '') +
        ' /></label>' +
        '<label class="cs-bw-slider">Power <b data-pow-lab>' +
        powPct +
        '%</b>' +
        '<input type="range" min="28" max="100" value="' +
        powPct +
        '" data-power' +
        (!active ? ' disabled' : '') +
        ' /></label>' +
        '<button type="button" class="cs-hit cs-hit--primary cs-bw-throw" data-throw' +
        (!active ? ' disabled' : '') +
        '>' +
        (waiting ? 'Waiting…' : 'Throw') +
        '</button>' +
        '</div>' +
        '<p class="cs-bw-meta">Alternate frames · A then B each frame · X/／ USBC · Live settles once</p>' +
        '</div>';

      shell.body.querySelectorAll('[data-diff]').forEach((btn) => {
        btn.addEventListener('click', () => setAiDiff(btn.getAttribute('data-diff')));
      });
      const aimEl = shell.body.querySelector('[data-aim]');
      const powEl = shell.body.querySelector('[data-power]');
      aimEl?.addEventListener('input', () => {
        if (!active) return;
        aim = (aimEl.value | 0) / 50 - 1;
        ballX = 0.5 + aim * 0.12;
        const lab = shell.body.querySelector('[data-aim-lab]');
        if (lab) lab.textContent = aim > 0.08 ? 'Right' : aim < -0.08 ? 'Left' : 'Center';
        softPaintFlying();
      });
      powEl?.addEventListener('input', () => {
        if (!active) return;
        power = Math.max(0.28, (powEl.value | 0) / 100);
        const lab = shell.body.querySelector('[data-pow-lab]');
        if (lab) lab.textContent = Math.round(power * 100) + '%';
      });
      shell.body.querySelector('[data-throw]')?.addEventListener('click', () => beginThrow(false));

      if (!coachShown) {
        coachShown = true;
        if (typeof showToast === 'function') {
          showToast(
            liveOn
              ? 'Alternate frames — you bowl yours, then they bowl theirs.'
              : 'You vs AI — alternate frames through 10.'
          );
        }
      }
      if (typeof GameUI !== 'undefined' && GameUI.attachHowTo) {
        GameUI.attachHowTo(shell.overlay, {
          title: 'Bowling',
          body:
            'Alternate frames: each bowler completes frame N before the other bowls N. X = 10 + next two · ／ = 10 + next one · 10th fill. Practice AI uses aim/power. Live 1v1 · leave=forfeit · virtual stakes once.',
        });
      }
    }

    function softPaintFlying() {
      const el = shell.body.querySelector('.cs-bw-ball');
      if (el) {
        el.style.left = ballX * 100 + '%';
        el.style.top = ballY * 100 + '%';
      }
      const msgEl = shell.body.querySelector('.cs-rally-msg');
      if (msgEl) {
        msgEl.textContent =
          (!iAmBowling() && phase === 'aim' ? 'Opponent bowling…' : msg) +
          (isFrozen() ? ' · Paused' : '');
      }
    }

    function tick(ts) {
      if (!shell.alive() || gameOver) return;
      raf = requestAnimationFrame(tick);
      if (isFrozen() || phase !== 'flying') {
        lastTs = ts;
        return;
      }
      if (!lastTs) lastTs = ts;
      const dt = Math.min(0.05, (ts - lastTs) / 1000);
      lastTs = ts;
      flightT += dt;
      const u = Math.min(1, flightT / flightDur);
      ballY = FOUL_Y + (PIN_Y - FOUL_Y) * (u * u * (3 - 2 * u));
      ballX = startX + drift * u * u;
      softPaintFlying();
      if (u >= 1) resolveThrow();
    }

    function pushPauseState(p) {
      if (!liveOn || !liveHandle || gameOver) return;
      paused = !!p;
      pushLive('playing', { paused: !!p });
    }

    if (typeof createGamePauseController === 'function') {
      shellPauseCtrl = createGamePauseController({
        host: shell.host || shell.overlay,
        pauseBtnId: 'csBowlingPause',
        onPause() {
          paused = true;
          pushPauseState(true);
        },
        onResume() {
          paused = false;
          pushPauseState(false);
          scheduleAiIfNeeded();
        },
        onQuit: () => shell.close('dismissed'),
      });
    }

    if (liveOn && typeof DangalLive !== 'undefined') {
      const roles = DangalLive.roles(chat);
      liveRoles = roles;
      settleOppUid = roles.opp || '';
      liveHandle = DangalLive.join({
        gameType: 'bowling',
        matchId: settleMatchId || matchIdFor(chat, 'bowling'),
        me: roles.me,
        playerA: roles.playerA,
        playerB: roles.playerB,
        onSnap(val) {
          if (!val || gameOver || !shell.alive()) return;
          if (val.status === 'forfeit' || val.status === 'over') {
            applying = true;
            const st0 = val.state || {};
            applyRemoteSnap(st0, val);
            const iWonEnd = val.winner == null ? bookTotal(myBook()) > bookTotal(oppBook()) : val.winner === roles.me;
            endGame({
              skipPush: true,
              forfeit: val.status === 'forfeit',
              iWon: iWonEnd,
              msg: val.status === 'forfeit' ? (iWonEnd ? 'Opponent left' : 'You left') : '',
            });
            applying = false;
            return;
          }
          const st = val.state || {};
          // Ignore our own echo if we're mid-resolve (eventSeq we just pushed)
          if (st.eventSeq != null && (st.eventSeq | 0) <= appliedSeq && iAmBowling() && phase === 'flying') {
            return;
          }
          applying = true;
          const changed = applyRemoteSnap(st, val);
          applying = false;
          if (changed) {
            paint();
            // Peer finished a ball — we only watch; if it's now our turn, enable throw
            if (iAmBowling() && phase === 'aim') {
              msg = st.msg || 'Your turn — frame ' + frameRound;
            } else if (!iAmBowling()) {
              msg = st.msg || 'Opponent bowling…';
            }
            paint();
          }
        },
        onForfeit(info) {
          if (gameOver) return;
          const iWon = info && info.winner === roles.me;
          endGame({
            skipPush: true,
            forfeit: true,
            iWon: !!iWon,
            msg: iWon ? 'Opponent left' : 'You left',
          });
        },
      });
      shell.liveHandle = liveHandle;
      if (roles.host) {
        bowlerSeat = 'A';
        frameRound = 1;
        ballInFrame = 1;
        msg = roles.me === roles.playerA ? 'You bowl frame 1' : 'Opponent bowls frame 1';
        pushLive('playing');
      } else {
        msg = 'Waiting for match sync…';
      }
    }

    paint();
    raf = requestAnimationFrame(tick);
    scheduleAiIfNeeded();
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
    const device = document.querySelector('.device');
    const duelBest = typeof getGamePB === 'function' ? getGamePB('patangbaazi_duel') : null;
    const festBest = typeof getGamePB === 'function' ? getGamePB('patangbaazi_festival') : null;
    const festCuts = typeof getGamePB === 'function' ? getGamePB('patangbaazi_festival_cuts') : null;
    const last = patangLastMode();
    const duelLine =
      duelBest != null ? 'Best streak ' + duelBest : 'Cut the hunter · clear the sky';
    const festLine =
      festBest != null
        ? 'Best ' + festBest + 's' + (festCuts != null ? ' · ' + festCuts + ' cuts' : '')
        : 'Last as long as you can against the heat';

    function pick(mode) {
      if (sheet && sheet.parentNode) sheet.remove();
      // Tear down any running sky without leave-confirm (user already picked a sky)
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
      openPatang({ mode: mode });
    }

    if (!device) {
      pick(last);
      return;
    }

    const sheet = document.createElement('div');
    sheet.className = 'cs-patang-pick';
    sheet.innerHTML = `
      <div class="cs-patang-pick-card" role="dialog" aria-label="Choose a sky">
        <div class="cs-patang-pick-title">Patang Baazi</div>
        <div class="cs-patang-pick-sub">Practice rooftop skies — climb, cut, survive. Open from a Live challenge for dual flight.</div>
        <button type="button" class="cs-patang-pick-btn${last === 'duel' ? ' is-last' : ''}" data-patang-mode="duel">
          <span class="cs-patang-pick-name">Duel</span>
          <span class="cs-patang-pick-desc">${esc(duelLine)}</span>
        </button>
        <button type="button" class="cs-patang-pick-btn${last === 'festival' ? ' is-last' : ''}" data-patang-mode="festival">
          <span class="cs-patang-pick-name">Festival</span>
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
   * Patang Baazi — Practice duel/festival + Live dual flight + fair cuts (Prompt 2/3).
   * Live: both fly at once; host seeds wind; kite sync ~100ms.
   * Cuts: host resolves abrasion with Practice cut law; first decisive cut wins.
   * No stakes (Prompt 3). Festival stays Practice.
   */
  function openPatang(opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    const chat = resolveChat(o.chat != null ? o.chat : arguments[0] != null ? arguments[0] : o);
    const liveOn = chatLiveOn(chat);
    // Live always Duel sky — Festival Live out of scope.
    const playMode = liveOn ? 'duel' : o.mode === 'festival' ? 'festival' : 'duel';
    if (!liveOn) patangSaveMode(playMode);
    const isFestival = playMode === 'festival';
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
    /** Live win rule: first decisive cut wins (mobile-fast). Practice duel keeps WAVES_TO_WIN=2. */
    const LIVE_CUTS_TO_WIN = 1;
    let cutSeq = 0;
    let appliedCutSeq = 0;
    let cutLocked = false;
    let liveCutArmed = false;
    const matchId = liveOn ? String(matchIdFor(chat, 'patangbaazi') || '').trim() : '';
    /** Host-authority wind + cut resolve — peer applies from snaps. */
    let iAmHost = true;

    const shell = openShell({
      id: 'patangbaazi',
      title: 'Patang Baazi',
      subtitle: liveOn
        ? liveSub() + ' · Friendly · First cut wins'
        : practiceSub(isFestival ? 'Festival · survive the heat' : 'Duel · cut the hunter'),
      mode: liveOn ? 'live' : 'practice',
      live: liveOn,
      chat: liveOn ? chat : undefined,
      accent: '#FF6D00',
      bg: '#001018',
      pauseId: 'csPatangPause',
      cleanup: () => {
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

    shell.body.innerHTML = `
      <div class="cs-patang">
        ${courtTurnBanner(
          'yours',
          liveOn ? 'Live duel sky' : isFestival ? 'Festival sky' : 'Duel sky',
          liveOn
            ? 'First cut wins'
            : isFestival
              ? 'Survive the heat'
              : 'Cut the hunter'
        )}
        <p class="cs-rally-msg" data-patang-msg>${
          liveOn
            ? 'Live duel — cross strings to cut. Host resolves the cut for both.'
            : isFestival
              ? 'Festival heat — stay up, cut what you can, pressure never sleeps.'
              : 'Duel sky — cross their string, cut the hunter, clear two.'
        }</p>
        <canvas data-patang></canvas>
        <p class="cs-rally-hint" data-patang-hint>${
          liveOn ? 'Hold the sky — first cut wins' : 'Hold the sky — pull to climb'
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
      ended = true;
      cancelAnimationFrame(raf);
      raf = 0;
      const secs = Math.max(0, Math.round(stats.aliveSec));
      const cuts = stats.cuts | 0;
      const death = ending.won ? null : stats.death;
      const modeLabel = liveOn ? 'Live duel' : isFestival ? 'Festival' : 'Duel';

      if (liveOn && shell && typeof shell.markOver === 'function') shell.markOver();
      if (liveOn && iAmHost) {
        try {
          pushLive(
            { phase: 'done', cutSeq: appliedCutSeq },
            {
              force: true,
              status: 'over',
              winner: ending.won ? liveRoles && liveRoles.me : liveRoles && liveRoles.opp,
            }
          );
        } catch (e) {}
      }

      let pbId = isFestival ? 'patangbaazi_festival' : 'patangbaazi_duel';
      let vsBest = '';
      let streak = patangDuelStreak();

      if (liveOn) {
        // Live: no Practice PB / streak updates (stakes = Prompt 3)
        pbId = 'patangbaazi_duel';
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

      const causeLine = ending.won
        ? liveOn
          ? 'First cut · ' + secs + 's'
          : cuts + ' cut' + (cuts === 1 ? '' : 's') + ' · ' + secs + 's aloft'
        : deathLabel(death) + ' · ' + secs + 's';
      const subtitle = modeLabel + ' · ' + (ending.why || '') + ' · ' + causeLine;
      const shareText = ending.won
        ? liveOn
          ? 'Cut their manjha in Live Patang Baazi on Chaupaal'
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
            { label: 'Fly again', primary: true, id: 'again' },
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
                ? ending.won
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
            shell.close('again');
            openPatang(liveOn ? { mode: 'duel', chat } : { mode: playMode });
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
            ? 'Sawing — hold tension! First cut wins.'
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
          : 'Floating — hold to pull · first cut wins';
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
        ctx.fillText('First cut wins', 12, 34);
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
              ? 'Leaving forfeits this Live duel.'
              : 'This practice run will end.',
          });
        },
      });
    }

    if (liveOn && typeof DangalLive !== 'undefined' && DangalLive.join) {
      liveRoles = DangalLive.roles(chat);
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
    {
      id: 'tabletennis',
      name: 'Table Tennis',
      icon: '🏓',
      accent: '#FF6F00',
      bg: '#000A1A',
      courtTint: '#1a2a3a',
      projectile: 'ball',
      scoreModel: 'ittf11',
      // ITTF-lite: 11 win-by-2, hard cap 20. Serve every 2 pts (every 1 at deuce).
      windowMs: 560,
      shrink: 0.93,
      prompt: 'Short rallies — tap in the timing window.',
      serveLabel: 'Serve',
      hitLabel: 'Return',
    },
    {
      id: 'pickleball',
      name: 'Pickleball',
      icon: '🟡',
      accent: '#33691E',
      bg: '#0A1200',
      courtTint: '#1b3d12',
      projectile: 'ball',
      kitchen: true, // visual only — no zone foul yet
      scoreModel: 'pickle11',
      // Rally-point to 11 win-by-2 (cap 20); winner serves. Not side-out.
      windowMs: 640,
      prompt: 'Dink and drive. Time the paddle.',
      serveLabel: 'Serve',
      hitLabel: 'Dink',
    },
    {
      id: 'tennis',
      name: 'Tennis',
      icon: '🎾',
      accent: '#2E7D32',
      bg: '#0A1A0A',
      courtTint: '#1a4a28',
      projectile: 'ball',
      scoreModel: 'tennisGames',
      // Games-lite: 0–15–30–40–Ad; match = first to 2 games. No sets/tiebreak.
      windowMs: 680,
      prompt: 'Serve, then return. Win games — first to 2.',
      hitLabel: 'Return',
      serveLabel: 'Serve',
    },
  ];

  if (typeof registerGame === 'function') {
    RALLIES.forEach((g, i) => {
      registerGame({
        id: g.id,
        name: g.name,
        desc: rallyMatchSubtitle(g) + ' · Live 1v1 timing duel',
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
      id: 'kabaddi',
      name: 'Kabaddi',
      desc: 'Raid, tackle, home · PKL-lite Live',
      icon: '🤼',
      gameType: 'dual',
      liveDuel: true,
      genre: 'rw_sports',
      selfChat: true,
      dangal: true,
      chat1v1: true,
      order: 24,
      launch: openKabaddi,
    });
    registerGame({
      id: 'khokho',
      name: 'Kho Kho',
      desc: 'Live chase↔run · batches · 75s · stakes',
      icon: '🏃',
      gameType: 'dual',
      liveDuel: true,
      genre: 'rw_sports',
      selfChat: true,
      dangal: true,
      chat1v1: true,
      order: 25,
      meta: {
        phaseA: 'Court & posts',
        phaseB: 'Chase law — direction, lane, poles, tags',
        phaseC: 'Giving Kho — sit ↔ rise transfer',
        phaseD: 'Defend batches · turn clock · Practice AI',
        phaseE: 'Live 1v1 innings + virtual stakes',
        complete: true,
      },
      launch: openKhoKho,
    });
    registerGame({
      id: 'bowling',
      name: 'Bowling',
      desc: 'Alternate frames · Practice AI · Live stakes',
      icon: '🎳',
      gameType: 'dual',
      liveDuel: true,
      genre: 'rw_sports',
      selfChat: true,
      dangal: true,
      chat1v1: true,
      order: 27,
      meta: {
        phaseA: 'Lane & throw — aim / power / gutter',
        phaseB: 'Arcade pin deck — knock, leave, reset',
        phaseC: '10-frame USBC scorebook + 10th fill',
        phaseD: 'Practice AI + Live 1v1 + virtual stakes',
        complete: true,
      },
      launch: openBowling,
    });
    registerGame({
      id: 'patangbaazi',
      name: 'Patang Baazi',
      desc: 'Live · first cut wins',
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
        phaseC: 'Stakes + graduation next',
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
  window.openTableTennis = (ctx) => openRallySport(Object.assign({}, RALLIES[1], { chat: ctx }));
  window.openPickleball = (ctx) => openRallySport(Object.assign({}, RALLIES[2], { chat: ctx }));
  window.openTennis = (ctx) => openRallySport(Object.assign({}, RALLIES[3], { chat: ctx }));
  window.openKabaddi = openKabaddi;
  window.openKhoKho = openKhoKho;
  window.openBowling = openBowling;
  window.scoreBowling = scoreBowling;
  window.aiThrowBowling = aiThrowBowling;
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
