/**
 * Court sports + Patang — timing / raid loops.
 * Practice vs AI, or Live 1v1 score/serve sync (not continuous ball physics).
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
        onLeave: () => shell.close(o.reason || 'dismissed'),
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
      try {
        o.liveHandle.leave({ forfeit: true });
      } catch (e) {
        try {
          o.liveHandle.leave();
        } catch (e2) {}
      }
    }
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
          cleanup() {
            if (typeof o.cleanup === 'function') o.cleanup();
            if (liveHandle) {
              try {
                liveHandle.leave({ forfeit: !gameOver });
              } catch (e) {
                try {
                  liveHandle.leave();
                } catch (e2) {}
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

  function openRallySport(spec) {
    const chat = resolveChat(spec.chat || arguments[0]);
    const liveOn = chatLiveOn(chat);
    const toWin = spec.toWin || 7;
    const pauseId = 'csRallyPause_' + (spec.id || 'sport');
    let pauseCtrl = null;
    let rallyPaused = false;
    let activeRaf = 0;
    const shell = openShell({
      id: spec.id,
      title: spec.name,
      subtitle: liveOn ? liveSub() : practiceSub('First to ' + toWin),
      mode: liveOn ? 'live' : 'practice',
      live: liveOn,
      chat,
      accent: spec.accent,
      bg: spec.bg,
      pauseId,
      cleanup: () => {
        if (activeRaf) cancelAnimationFrame(activeRaf);
        if (pauseCtrl) pauseCtrl.destroy();
      },
    });
    if (!shell) return;

    if (typeof createGamePauseController === 'function') {
      pauseCtrl = createGamePauseController({
        host: shell.host || shell.overlay,
        pauseBtnId: pauseId,
        onPause() {
          rallyPaused = true;
          if (activeRaf) {
            cancelAnimationFrame(activeRaf);
            activeRaf = 0;
          }
        },
        onResume() {
          rallyPaused = false;
        },
        onQuit: () => shell.close('dismissed'),
      });
    }

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

    function scoresForPush() {
      if (!liveRoles) return { a: you, b: opp };
      return liveRoles.me === liveRoles.playerA ? { a: you, b: opp } : { a: opp, b: you };
    }

    function applyScores(sc) {
      if (!sc || !liveRoles) return;
      you = liveRoles.me === liveRoles.playerA ? sc.a | 0 : sc.b | 0;
      opp = liveRoles.me === liveRoles.playerA ? sc.b | 0 : sc.a | 0;
    }

    function pushPoint(whoScored, msg) {
      if (!liveOn || !liveHandle || !liveRoles || applying) return;
      eventSeq += 1;
      const nextServe = whoScored === 'me';
      myServe = nextServe;
      serving = true;
      liveHandle.push({
        status: you >= toWin || opp >= toWin ? 'over' : 'playing',
        winner: you >= toWin ? liveRoles.me : opp >= toWin ? liveRoles.opp : null,
        turn: liveRoles.me,
        state: {
          scores: scoresForPush(),
          servingUid: nextServe ? liveRoles.me : liveRoles.opp,
          rally,
          windowMs: spec.windowMs || 720,
          eventSeq,
          msg: msg || '',
          pointBy: whoScored === 'me' ? liveRoles.me : liveRoles.opp,
        },
      });
    }

    function renderPlay(msg) {
      if (!shell.alive() || ended) return;
      // Live: contact when it is your serve/return window; Practice: always active vs AI.
      const iAmActive = !liveOn || myServe;
      shell.body.innerHTML = `
        <div class="cs-rally">
          <div class="cs-rally-score">${esc(spec.icon)} <strong>${you}</strong> – <strong>${opp}</strong></div>
          <p class="cs-rally-msg">${esc(msg || spec.prompt)}</p>
          <div class="cs-timing" aria-hidden="true"><i data-cs-bar></i></div>
          <button type="button" class="cs-hit" data-cs-hit ${!iAmActive ? 'disabled' : ''}>${esc(
            serving ? spec.serveLabel || 'Serve' : spec.hitLabel || 'Hit'
          )}</button>
          <p class="cs-rally-hint">Rally ${rally} · window ${Math.round(windowMs)}ms${
            liveOn ? (iAmActive ? ' · your contact' : ' · waiting') : ''
          }</p>
        </div>`;
      const bar = shell.body.querySelector('[data-cs-bar]');
      const hit = shell.body.querySelector('[data-cs-hit]');
      let t0 = 0;
      let raf = 0;
      locked = false;
      if (!iAmActive) {
        return;
      }
      const duration = serving ? Math.max(900, windowMs + 200) : windowMs;
      const sweet0 = 0.42;
      const sweet1 = 0.78;

      function tick(now) {
        if (rallyPaused) {
          t0 = 0;
          activeRaf = requestAnimationFrame(tick);
          return;
        }
        if (!t0) t0 = now;
        const p = Math.min(1, (now - t0) / duration);
        if (bar) bar.style.transform = 'scaleX(' + p + ')';
        if (p >= 1) {
          if (!locked) miss('Late');
          return;
        }
        raf = requestAnimationFrame(tick);
        activeRaf = raf;
      }
      raf = requestAnimationFrame(tick);
      activeRaf = raf;

      hit?.addEventListener('click', () => {
        if (locked || !iAmActive) return;
        const p = t0 ? Math.min(1, (performance.now() - t0) / duration) : 0;
        if (p < sweet0) {
          miss('Early');
          return;
        }
        if (p > sweet1) {
          miss('Late');
          return;
        }
        locked = true;
        cancelAnimationFrame(raf);
        activeRaf = 0;
        buzz('kick');
        rally += 1;
        serving = false;
        windowMs = Math.max(380, windowMs * (spec.shrink || 0.94));
        if (liveOn) {
          // Successful contact — opponent must return; push "in play" so they get a timing window
          eventSeq += 1;
          liveHandle.push({
            status: 'playing',
            turn: liveRoles.opp,
            state: {
              scores: scoresForPush(),
              servingUid: liveRoles.opp,
              inPlay: true,
              rally,
              windowMs,
              eventSeq,
              msg: spec.goodLine || 'In! Keep the rally going.',
            },
          });
          myServe = false;
          serving = true;
          renderPlay(spec.goodLine || 'In! Keep the rally going.');
          return;
        }
        if (Math.random() < 0.26 + rally * 0.04) {
          you += 1;
          rally = 0;
          serving = true;
          myServe = true;
          windowMs = spec.windowMs || 720;
          if (you >= toWin || opp >= toWin) return finish();
          renderPlay('Opponent missed — your point.');
          return;
        }
        renderPlay(spec.goodLine || 'In! Keep the rally going.');
      });

      function miss(why) {
        if (locked) return;
        locked = true;
        cancelAnimationFrame(raf);
        activeRaf = 0;
        buzz('lose', { noConfetti: true });
        opp += 1;
        rally = 0;
        serving = true;
        windowMs = spec.windowMs || 720;
        if (liveOn) {
          myServe = false;
          pushPoint('opp', why + ' — opponent point.');
          if (opp >= toWin || you >= toWin) return finish();
          renderPlay(why + ' — opponent point.');
          return;
        }
        myServe = true;
        if (opp >= toWin || you >= toWin) return finish();
        renderPlay(why + ' — opponent point.');
      }
    }

    function finish() {
      if (ended) return;
      ended = true;
      if (liveOn && liveHandle && liveRoles && !applying) {
        liveHandle.push({
          status: 'over',
          winner: you > opp ? liveRoles.me : opp > you ? liveRoles.opp : null,
          state: { scores: scoresForPush(), eventSeq },
        });
      }
      showDuelResult(shell, {
        id: spec.id,
        you,
        opp,
        glyph: spec.icon,
        pbScore: you,
        subtitle: 'Rally best ' + rally,
        shareText: 'I played ' + spec.name + ' on Chaupaal: ' + you + '–' + opp,
        onAgain: () => openRallySport(Object.assign({}, spec, { chat })),
      });
    }

    if (liveOn && typeof DangalLive !== 'undefined') {
      const roles = DangalLive.roles(chat);
      liveRoles = roles;
      myServe = !!roles.host;
      serving = true;
      liveHandle = DangalLive.join({
        gameType: spec.id,
        matchId: matchIdFor(chat, spec.id),
        me: roles.me,
        playerA: roles.playerA,
        playerB: roles.playerB,
        onSnap(val) {
          if (!val || ended || !shell.alive()) return;
          if (val.status === 'forfeit' || (val.status === 'over' && val.winner != null)) {
            applying = true;
            if (val.state && val.state.scores) applyScores(val.state.scores);
            else if (val.winner != null) {
              const iWon = val.winner === roles.me;
              you = iWon ? Math.max(you, toWin) : you;
              opp = iWon ? opp : Math.max(opp, toWin);
            }
            finish();
            applying = false;
            return;
          }
          const st = val.state || {};
          if (st.eventSeq != null && st.eventSeq <= eventSeq && st.pointBy !== roles.me) {
            // still apply newer remote points
          }
          if (st.scores) applyScores(st.scores);
          if (st.eventSeq != null) eventSeq = Math.max(eventSeq, st.eventSeq);
          if (st.pointBy && st.pointBy !== roles.me) {
            rally = 0;
            windowMs = spec.windowMs || 720;
            serving = true;
            myServe = st.servingUid === roles.me;
            if (you >= toWin || opp >= toWin) return finish();
            renderPlay(st.msg || 'Point — next serve.');
            return;
          }
          if (st.inPlay && val.turn === roles.me) {
            serving = true;
            myServe = true;
            if (st.windowMs) windowMs = st.windowMs;
            if (st.rally != null) rally = st.rally;
            renderPlay(st.msg || 'Return!');
            return;
          }
          if (st.servingUid) {
            myServe = st.servingUid === roles.me;
            serving = true;
          }
        },
        onForfeit(info) {
          if (ended) return;
          const iWon = info && info.winner === roles.me;
          you = iWon ? toWin : you;
          opp = iWon ? opp : toWin;
          finish();
        },
      });
      shell.liveHandle = liveHandle;
      if (roles.host) {
        liveHandle.push({
          status: 'playing',
          turn: roles.me,
          state: { scores: { a: 0, b: 0 }, servingUid: roles.me, eventSeq: 0 },
        });
      }
    }

    renderPlay(spec.prompt);
  }

  /**
   * Kabaddi Prompt 1 — raid court & breath craft.
   * Control: tap-to-move on the court surface.
   * Breath: starts on first mid-line cross (prep in own half is free).
   * Zones (y: 0=anti top … 1=home bottom): anti ≤0.48 · mid 0.5 · own ≥0.52 · bonus line ~0.22 visual only.
   * TO_WIN=5 · PKL bonus/DoD/all-out = Prompt 3 · tackle AI = Prompt 2 · Live defense sync = Prompt 4.
   */
  function openKabaddi() {
    const chat = resolveChat(arguments[0]);
    const liveOn = chatLiveOn(chat);
    let shellPauseCtrl = null;
    let raidPaused = false;
    let activeRaf = 0;
    let coachShown = false;
    const shell = openShell({
      id: 'kabaddi',
      title: 'Kabaddi',
      subtitle: liveOn ? liveSub() : practiceSub('Cross · tag · Home before breath dies'),
      mode: liveOn ? 'live' : 'practice',
      live: liveOn,
      chat,
      accent: '#BF360C',
      bg: '#1A0800',
      pauseId: 'csKabaddiPause',
      cleanup: () => {
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
          // Freeze breath + motion; keep RAF so resume continues cleanly
          raidPaused = true;
        },
        onResume() {
          raidPaused = false;
        },
        onQuit: () => shell.close('dismissed'),
      });
    }
    const TO_WIN = 5;
    const BREATH_MS = 8000;
    const TOUCH_R = 0.09;
    const MOVE_SPEED = 1.35; // court-fractions per second
    let you = 0;
    let opp = 0;
    let ended = false;
    let applying = false;
    let liveRoles = null;
    let liveHandle = null;
    let myRaid = true;
    let eventSeq = 0;

    function scoresForPush() {
      if (!liveRoles) return { a: you, b: opp };
      return liveRoles.me === liveRoles.playerA ? { a: you, b: opp } : { a: opp, b: you };
    }
    function applyScores(sc) {
      if (!sc || !liveRoles) return;
      you = liveRoles.me === liveRoles.playerA ? sc.a | 0 : sc.b | 0;
      opp = liveRoles.me === liveRoles.playerA ? sc.b | 0 : sc.a | 0;
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

    function defaultDefenders() {
      return [
        { id: 0, x: 0.22, y: 0.16, alive: true },
        { id: 1, x: 0.42, y: 0.28, alive: true },
        { id: 2, x: 0.58, y: 0.28, alive: true },
        { id: 3, x: 0.78, y: 0.16, alive: true },
      ];
    }

    function publicRaidStub(raid) {
      if (!raid) return null;
      return {
        raidPhase: raid.phase,
        raider: { x: +raid.rx.toFixed(3), y: +raid.ry.toFixed(3) },
        defenders: raid.defenders.map((d) => ({
          id: d.id,
          x: d.x,
          y: d.y,
          alive: !!d.alive,
        })),
        breathPct: Math.max(0, Math.min(1, raid.breath / BREATH_MS)),
        tagged: raid.tagged | 0,
        breathLive: !!raid.breathLive,
      };
    }

    function startRaid() {
      if (!shell.alive() || ended) return;
      if (liveOn && !myRaid) {
        shell.body.innerHTML =
          '<div class="cs-kabaddi">' +
          '<div class="cs-rally-score">💪 <strong>' +
          you +
          '</strong> – <strong>' +
          opp +
          '</strong></div>' +
          '<p class="cs-rally-msg">Opponent is raiding…</p>' +
          '</div>';
        return;
      }

      if (activeRaf) {
        cancelAnimationFrame(activeRaf);
        activeRaf = 0;
      }

      const raid = {
        phase: 'prep', // prep | raiding | over
        breath: BREATH_MS,
        breathLive: false,
        tagged: 0,
        over: false,
        rx: 0.5,
        ry: 0.84,
        tx: 0.5,
        ty: 0.84,
        defenders: defaultDefenders(),
      };
      let last = performance.now();
      let msg =
        coachShown
          ? 'Tap the court to move. Tag, then Home in your half.'
          : 'Cross, tag, get Home before breath dies.';
      if (!coachShown) coachShown = true;

      function endRaid(kind, endMsg) {
        if (raid.over) return;
        raid.over = true;
        raid.phase = kind === 'home' ? 'home' : 'caught';
        if (activeRaf) {
          cancelAnimationFrame(activeRaf);
          activeRaf = 0;
        }
        const pts = kind === 'home' ? raid.tagged | 0 : 0;
        if (kind === 'home') {
          if (pts > 0) {
            you += pts;
            buzz('win', { noConfetti: true });
          } else {
            opp += 1;
            buzz('lose', { noConfetti: true });
          }
        } else {
          opp += 1;
          buzz('lose', { noConfetti: true });
        }
        if (liveOn && liveHandle && liveRoles) {
          eventSeq += 1;
          myRaid = false;
          liveHandle.push({
            status: you >= TO_WIN || opp >= TO_WIN ? 'over' : 'playing',
            winner:
              you >= TO_WIN ? liveRoles.me : opp >= TO_WIN ? liveRoles.opp : null,
            turn: liveRoles.opp,
            state: {
              scores: scoresForPush(),
              raidUid: liveRoles.opp,
              eventSeq,
              msg: endMsg,
              raid: publicRaidStub(raid),
            },
          });
        }
        next(endMsg);
      }

      function tryHome() {
        if (raid.over) return;
        if (!inOwnHalf(raid.ry)) {
          buzz('invalid');
          msg = 'Reach your half before Home.';
          paintRaid();
          return;
        }
        const pts = raid.tagged | 0;
        endRaid(
          'home',
          pts > 0
            ? 'Home with ' + pts + ' point' + (pts === 1 ? '' : 's') + '.'
            : 'Empty raid — opponent +1.'
        );
      }

      function paintRaid() {
        if (!shell.alive() || raid.over) return;
        const breathPct = Math.max(0, (raid.breath / BREATH_MS) * 100);
        const canHome = inOwnHalf(raid.ry);
        const defsHtml = raid.defenders
          .map((d) => {
            const cls =
              'cs-kb-def' + (d.alive ? '' : ' is-out') + (d.alive ? '' : '');
            return (
              '<span class="' +
              cls +
              '" data-def="' +
              d.id +
              '" style="left:' +
              d.x * 100 +
              '%;top:' +
              d.y * 100 +
              '%" aria-hidden="true">' +
              (d.alive ? '🛡' : '✓') +
              '</span>'
            );
          })
          .join('');

        shell.body.innerHTML =
          '<div class="cs-kabaddi">' +
          '<div class="cs-rally-score">💪 <strong>' +
          you +
          '</strong> – <strong>' +
          opp +
          '</strong> · first to ' +
          TO_WIN +
          '</div>' +
          '<div class="cs-breath' +
          (raid.breathLive ? ' is-live' : '') +
          '" aria-label="Breath"><i style="width:' +
          breathPct +
          '%"></i></div>' +
          '<p class="cs-rally-msg">' +
          esc(msg) +
          (raid.breathLive ? '' : ' · Breath waits until you cross mid') +
          '</p>' +
          '<div class="cs-kb-court" data-court role="application" aria-label="Kabaddi court — tap to move">' +
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
          '</div>' +
          '<div class="cs-kb-meta">Tagged <b>' +
          raid.tagged +
          '</b>' +
          (raidPaused ? ' · Paused' : '') +
          '</div>' +
          '<button type="button" class="cs-hit cs-kb-home" data-home' +
          (canHome ? '' : ' disabled') +
          '>Home</button>' +
          '</div>';

        const court = shell.body.querySelector('[data-court]');
        const setTarget = (clientX, clientY) => {
          if (raid.over || raidPaused || !court) return;
          const rect = court.getBoundingClientRect();
          if (rect.width < 8 || rect.height < 8) return;
          let x = (clientX - rect.left) / rect.width;
          let y = (clientY - rect.top) / rect.height;
          raid.tx = Math.max(0.06, Math.min(0.94, x));
          raid.ty = Math.max(0.06, Math.min(0.94, y));
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

        shell.body.querySelector('[data-home]')?.addEventListener('click', () => {
          tryHome();
        });
      }

      function tickTags() {
        raid.defenders.forEach((d) => {
          if (!d.alive) return;
          const dx = raid.rx - d.x;
          const dy = raid.ry - d.y;
          if (dx * dx + dy * dy <= TOUCH_R * TOUCH_R) {
            d.alive = false;
            raid.tagged += 1;
            buzz('kick');
            msg = 'Tagged ' + raid.tagged + ' — get Home!';
          }
        });
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

        // Move toward tap target
        const mdx = raid.tx - raid.rx;
        const mdy = raid.ty - raid.ry;
        const dist = Math.sqrt(mdx * mdx + mdy * mdy);
        if (dist > 0.004) {
          const step = Math.min(dist, MOVE_SPEED * dt);
          raid.rx += (mdx / dist) * step;
          raid.ry += (mdy / dist) * step;
        }

        // Breath starts on first mid cross
        if (!raid.breathLive && crossedMid(raid.ry)) {
          raid.breathLive = true;
          raid.phase = 'raiding';
          msg = 'Breath is live — tag and get Home!';
        }
        if (raid.breathLive) {
          raid.breath -= dt * 1000;
        }

        tickTags();

        // Soft update positions without full rebuild every frame when possible
        const ri = shell.body.querySelector('.cs-kb-raider');
        const bar = shell.body.querySelector('.cs-breath i');
        const breathEl = shell.body.querySelector('.cs-breath');
        if (ri) {
          ri.style.left = raid.rx * 100 + '%';
          ri.style.top = raid.ry * 100 + '%';
        }
        if (bar) bar.style.width = Math.max(0, (raid.breath / BREATH_MS) * 100) + '%';
        if (breathEl) {
          if (raid.breathLive) breathEl.classList.add('is-live');
          else breathEl.classList.remove('is-live');
        }
        raid.defenders.forEach((d) => {
          const el = shell.body.querySelector('.cs-kb-def[data-def="' + d.id + '"]');
          if (!el) return;
          if (!d.alive && !el.classList.contains('is-out')) {
            el.classList.add('is-out');
            el.textContent = '✓';
          }
        });
        const homeBtn = shell.body.querySelector('[data-home]');
        if (homeBtn) homeBtn.disabled = !inOwnHalf(raid.ry);
        const meta = shell.body.querySelector('.cs-kb-meta');
        if (meta) {
          meta.innerHTML =
            'Tagged <b>' + raid.tagged + '</b>' + (raidPaused ? ' · Paused' : '');
        }
        const msgEl = shell.body.querySelector('.cs-rally-msg');
        if (msgEl) {
          msgEl.textContent =
            msg + (raid.breathLive ? '' : ' · Breath waits until you cross mid');
        }

        if (raid.breathLive && raid.breath <= 0) {
          endRaid('caught', 'Caught — breath ran out.');
          return;
        }

        activeRaf = requestAnimationFrame(loop);
      }

      paintRaid();
      last = performance.now();
      activeRaf = requestAnimationFrame(loop);

      // Seed Live stub so Prompt 2 can extend defense inputs
      if (liveOn && liveHandle && liveRoles && !applying) {
        liveHandle.push({
          status: 'playing',
          turn: liveRoles.me,
          state: {
            scores: scoresForPush(),
            raidUid: liveRoles.me,
            eventSeq,
            raid: publicRaidStub(raid),
          },
        });
      }
    }

    function next(msg) {
      if (you >= TO_WIN || opp >= TO_WIN) {
        ended = true;
        if (activeRaf) {
          cancelAnimationFrame(activeRaf);
          activeRaf = 0;
        }
        showDuelResult(shell, {
          id: 'kabaddi',
          you,
          opp,
          glyph: '💪',
          pbScore: you,
          subtitle: msg,
          shareText: 'Kabaddi on Chaupaal: ' + you + '–' + opp,
          onAgain: () => openKabaddi(chat),
        });
        return;
      }
      if (liveOn && !myRaid) {
        shell.body.innerHTML =
          '<div class="cs-kabaddi">' +
          '<div class="cs-rally-score">💪 <strong>' +
          you +
          '</strong> – <strong>' +
          opp +
          '</strong></div>' +
          '<p class="cs-rally-msg">' +
          esc(msg) +
          '</p>' +
          '<p class="cs-rally-hint">Waiting for opponent’s raid…</p>' +
          '</div>';
        return;
      }
      shell.body.innerHTML =
        '<div class="cs-kabaddi">' +
        '<div class="cs-rally-score">💪 <strong>' +
        you +
        '</strong> – <strong>' +
        opp +
        '</strong></div>' +
        '<p class="cs-rally-msg">' +
        esc(msg) +
        '</p>' +
        '<button type="button" class="cs-hit" data-raid-again>Raid again</button>' +
        '</div>';
      shell.body.querySelector('[data-raid-again]')?.addEventListener('click', () => startRaid());
    }

    if (liveOn && typeof DangalLive !== 'undefined') {
      liveRoles = DangalLive.roles(chat);
      myRaid = !!liveRoles.host;
      liveHandle = DangalLive.join({
        gameType: 'kabaddi',
        matchId: matchIdFor(chat, 'kabaddi'),
        me: liveRoles.me,
        playerA: liveRoles.playerA,
        playerB: liveRoles.playerB,
        onSnap(val) {
          if (!val || ended || !shell.alive()) return;
          if (val.status === 'forfeit' || val.status === 'over') {
            applying = true;
            if (val.state && val.state.scores) applyScores(val.state.scores);
            ended = true;
            if (activeRaf) {
              cancelAnimationFrame(activeRaf);
              activeRaf = 0;
            }
            showDuelResult(shell, {
              id: 'kabaddi',
              you,
              opp,
              glyph: '💪',
              pbScore: you,
              subtitle: val.status === 'forfeit' ? 'Forfeit' : '',
              shareText: 'Kabaddi on Chaupaal: ' + you + '–' + opp,
              onAgain: () => openKabaddi(chat),
            });
            applying = false;
            return;
          }
          const st = val.state || {};
          if (st.scores) applyScores(st.scores);
          if (st.eventSeq != null) eventSeq = Math.max(eventSeq, st.eventSeq);
          if (st.raidUid === liveRoles.me && !myRaid) {
            myRaid = true;
            next(st.msg || 'Your raid.');
            startRaid();
          } else if (st.raidUid && st.raidUid !== liveRoles.me) {
            myRaid = false;
            next(st.msg || 'Opponent’s turn.');
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
            raidUid: liveRoles.me,
            eventSeq: 0,
            raid: { raidPhase: 'prep', raider: { x: 0.5, y: 0.84 }, defenders: defaultDefenders(), breathPct: 1, tagged: 0, breathLive: false },
          },
        });
      }
    }

    startRaid();
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
        <div class="cs-patang-pick-sub">Practice rooftop skies — climb, cut, survive. No Live · no stakes.</div>
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

  function openPatang(opts) {
    const o = opts && typeof opts === 'object' ? opts : {};
    const playMode = o.mode === 'festival' ? 'festival' : 'duel';
    patangSaveMode(playMode);
    const isFestival = playMode === 'festival';
    let raf = 0;
    let pauseCtrl = null;
    let lastTs = 0;
    const shell = openShell({
      id: 'patangbaazi',
      title: 'Patang Baazi',
      subtitle: practiceSub(isFestival ? 'Festival · survive the heat' : 'Duel · cut the hunter'),
      mode: 'practice',
      accent: '#FF6D00',
      bg: '#001018',
      pauseId: 'csPatangPause',
      cleanup: () => {
        cancelAnimationFrame(raf);
        raf = 0;
        window.removeEventListener('resize', onResize);
        if (pauseCtrl) pauseCtrl.destroy();
      },
    });
    if (!shell) return;

    shell.body.innerHTML = `
      <div class="cs-patang">
        <p class="cs-rally-msg">${
          isFestival
            ? 'Festival heat — stay up, cut what you can, pressure never sleeps.'
            : 'Duel sky — cross their string, cut the hunter, clear two.'
        }</p>
        <canvas data-patang></canvas>
        <p class="cs-rally-hint" data-patang-hint>Hold the sky — pull to climb</p>
      </div>`;
    const canvas = shell.body.querySelector('[data-patang]');
    const hint = shell.body.querySelector('[data-patang-hint]');
    let ctx = canvas.getContext('2d');
    let w = 320;
    let h = 420;

    const ZENITH = 0.13;
    const GROUND = 0.9;
    const ABRASION_MAX = 1;
    const STRING_SAMPLES = 6;
    const TEACH_SEC = isFestival ? 2.2 : 2.8;
    const WAVES_TO_WIN = 2; // duel only
    const YOU_ANCHOR = 0.42;
    // Cut law (Prompt 2) + hunter AI (Prompt 3) intact. Prompt 4 = skies + records.

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

    const you = makeKite(0.35, 0.62, '#FF6D00', '#FFD180');
    let opp = makeRival(0);
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
    const stats = { cuts: 0, aliveSec: 0, death: null }; // Prompt 4 hooks

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
      if (ended) return;
      e.preventDefault();
      setHolding(true, e);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!holding || ended) return;
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
      if (!won && deathKind) stats.death = deathKind;
      ending = {
        won: !!won,
        why: why || (won ? 'You cleared the sky!' : 'Your manjha was cut.'),
        t: 0,
        fallYou: !won,
        fallOpp: !!won && opp && opp.alive,
      };
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
      const modeLabel = isFestival ? 'Festival' : 'Duel';

      let pbId = isFestival ? 'patangbaazi_festival' : 'patangbaazi_duel';
      let vsBest = '';
      let streak = patangDuelStreak();

      if (isFestival) {
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
        ? cuts + ' cut' + (cuts === 1 ? '' : 's') + ' · ' + secs + 's aloft'
        : deathLabel(death) + ' · ' + cuts + ' cut' + (cuts === 1 ? '' : 's') + ' · ' + secs + 's';
      const subtitle = modeLabel + ' · ' + (ending.why || '') + ' · ' + causeLine;
      const shareText = ending.won
        ? isFestival
          ? 'Cut ' + cuts + ' in Festival on Chaupaal Patang Baazi · ' + secs + 's aloft'
          : 'Duel win — string cut! Streak ' + streak + ' on Chaupaal Patang Baazi'
        : isFestival
          ? 'Festival run · ' + cuts + ' cuts · ' + secs + 's on Chaupaal Patang Baazi'
          : 'Patang Baazi Duel on Chaupaal — ' + deathLabel(death);

      if (shell.gs && typeof shell.gs.setOutcome === 'function') {
        shell.gs.setOutcome(ending.won ? 'won' : 'lost');
      }
      if (shell && typeof shell.markOver === 'function') shell.markOver();

      const actions = [
        { label: 'Fly again', primary: true, id: 'again' },
        { label: 'Change sky', primary: false, id: 'modes' },
        { label: 'Share', primary: false, id: 'share' },
      ];
      const html =
        typeof gameResultHtml === 'function'
          ? gameResultHtml({
              gameId: pbId,
              glyph: ending.won ? '✓' : '·',
              title: resultTitle(ending.won, death),
              subtitle,
              vsBest: vsBest || undefined,
              hideStats: true,
              challenge: false,
              actions,
            })
          : `<p>${esc(subtitle)}</p>`;
      shell.body.innerHTML = html;
      if (typeof wireGameResultActions === 'function') {
        wireGameResultActions(shell.body, {
          again: () => {
            shell.close('again');
            openPatang({ mode: playMode });
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
                  scoreLine: modeLabel + ' · ' + cuts + ' cuts · ' + secs + 's',
                  text: shareText,
                },
              });
            }
          },
        });
      }
    }

    function beginWaveClear(detail) {
      if (waveClear || ending || ended) return;
      stats.cuts += 1;
      if (opp) opp.alive = false;
      waveClear = { t: 0, why: detail || 'You cut their manjha!', fallKite: opp };
      resetAbrasion();
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

    /** Cut resolved vs active hunter — mid-wave continue or player loss. */
    function onCutResolved(playerWon, detail) {
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
      if (!opp || !opp.alive) {
        abrasion.active = false;
        abrasion.youDmg = Math.max(0, abrasion.youDmg - dt * 1.1);
        abrasion.oppDmg = Math.max(0, abrasion.oppDmg - dt * 1.1);
        abrasion.flash = Math.max(0, abrasion.flash - dt * 3);
        abrasion.sparks = abrasion.sparks.filter((s) => (s.life -= dt) > 0);
        return null;
      }
      const polyYou = stringPolyline(you, YOU_ANCHOR);
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
      drawString(you, YOU_ANCHOR, abrasion.youDmg);
      drawKite(you);
      drawAbrasionFx();

      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.font = '11px "Space Grotesk",sans-serif';
      ctx.fillText(gust > 0.12 ? 'Wind · gust' : 'Wind · steady', 12, 18);
      if (isFestival) {
        const threat = Math.min(5, 1 + stats.cuts);
        ctx.fillText(Math.floor(stats.aliveSec) + 's · ' + stats.cuts + ' cuts · heat ' + threat, 12, 34);
      } else {
        ctx.fillText(stats.cuts + '/' + WAVES_TO_WIN + ' cuts', 12, 34);
      }
      if (opp && opp.ai && t >= TEACH_SEC) {
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
      if (pauseCtrl && pauseCtrl.isPaused()) {
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
        drawString(you, YOU_ANCHOR, 0);
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
      updateWind(dt);
      stepKite(you, dt, true, holding);
      if (ending || waveClear) {
        raf = requestAnimationFrame(loop);
        return;
      }
      thinkRival(dt);
      if (ending || waveClear) {
        raf = requestAnimationFrame(loop);
        return;
      }

      const cut = tickAbrasion(dt);
      if (cut) {
        onCutResolved(cut.playerWon, cut.why);
        raf = requestAnimationFrame(loop);
        return;
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

      raf = requestAnimationFrame(loop);
    }
    if (typeof createGamePauseController === 'function') {
      pauseCtrl = createGamePauseController({
        host: shell.host || shell.overlay,
        pauseBtnId: 'csPatangPause',
        onPause() {
          cancelAnimationFrame(raf);
          raf = 0;
          lastTs = 0;
        },
        onResume() {
          if (!ended && !raf) raf = requestAnimationFrame(loop);
        },
        onQuit: () => shell.close('dismissed'),
      });
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
      toWin: 7,
      windowMs: 700,
      prompt: 'Serve, then smash in the green window.',
      hitLabel: 'Smash',
    },
    {
      id: 'tabletennis',
      name: 'Table Tennis',
      icon: '🏓',
      accent: '#FF6F00',
      bg: '#000A1A',
      toWin: 11,
      windowMs: 560,
      shrink: 0.93,
      prompt: 'Short rallies — tap in the timing window.',
      hitLabel: 'Return',
    },
    {
      id: 'pickleball',
      name: 'Pickleball',
      icon: '🥒',
      accent: '#33691E',
      bg: '#0A1200',
      toWin: 7,
      windowMs: 640,
      prompt: 'Dink and drive. Time the paddle.',
      hitLabel: 'Dink',
    },
    {
      id: 'tennis',
      name: 'Tennis',
      icon: '🎾',
      accent: '#2E7D32',
      bg: '#0A1A0A',
      toWin: 4,
      windowMs: 680,
      prompt: 'Serve, then return. First to 4 games.',
      hitLabel: 'Return',
      serveLabel: 'Serve',
    },
  ];

  if (typeof registerGame === 'function') {
    RALLIES.forEach((g, i) => {
      registerGame({
        id: g.id,
        name: g.name,
        desc: 'Timing rally to ' + (g.toWin || 7),
        icon: g.icon,
        gameType: 'solo',
        genre: 'rw_sports',
        solo: true,
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
      desc: 'Raid court · tag · Home before breath',
      icon: '💪',
      gameType: 'solo',
      genre: 'rw_sports',
      solo: true,
      selfChat: true,
      dangal: true,
      chat1v1: true,
      order: 24,
      launch: openKabaddi,
    });
    registerGame({
      id: 'patangbaazi',
      name: 'Patang Baazi',
      desc: 'Practice · climb, cut, survive',
      icon: '🪁',
      gameType: 'solo',
      genre: 'arcade',
      solo: true,
      selfChat: true,
      dangal: true,
      chat1v1: true,
      order: 25,
      launch(ctx) {
        try {
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
  window.openPatangBaazi = (ctx) => {
    const o = ctx && typeof ctx === 'object' ? ctx : {};
    if (o.mode === 'duel' || o.mode === 'festival') openPatang({ mode: o.mode });
    else openPatangModeSheet();
  };
  window.openPatangModeSheet = openPatangModeSheet;
})();
