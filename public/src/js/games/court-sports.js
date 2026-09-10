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

  function openKabaddi() {
    const chat = resolveChat(arguments[0]);
    const liveOn = chatLiveOn(chat);
    let shellPauseCtrl = null;
    let raidPaused = false;
    let activeRaf = 0;
    const shell = openShell({
      id: 'kabaddi',
      title: 'Kabaddi',
      subtitle: liveOn ? liveSub() : practiceSub('Raid · tag · make it home'),
      mode: liveOn ? 'live' : 'practice',
      live: liveOn,
      chat,
      accent: '#BF360C',
      bg: '#1A0800',
      pauseId: 'csKabaddiPause',
      cleanup: () => {
        if (activeRaf) cancelAnimationFrame(activeRaf);
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
          if (activeRaf) {
            cancelAnimationFrame(activeRaf);
            activeRaf = 0;
          }
        },
        onResume() {
          raidPaused = false;
        },
        onQuit: () => shell.close('dismissed'),
      });
    }
    const TO_WIN = 5;
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

    function startRaid() {
      if (!shell.alive() || ended) return;
      if (liveOn && !myRaid) {
        shell.body.innerHTML = `
          <div class="cs-kabaddi">
            <div class="cs-rally-score">💪 <strong>${you}</strong> – <strong>${opp}</strong></div>
            <p class="cs-rally-msg">Opponent is raiding…</p>
          </div>`;
        return;
      }
      const breathMax = 8000;
      let breath = breathMax;
      let tagged = 0;
      let home = false;
      const defenders = [0, 1, 2, 3].map((i) => ({ id: i, alive: true }));
      let last = performance.now();
      let raf = 0;

      function paint(msg) {
        shell.body.innerHTML = `
          <div class="cs-kabaddi">
            <div class="cs-rally-score">💪 <strong>${you}</strong> – <strong>${opp}</strong></div>
            <div class="cs-breath"><i style="width:${Math.max(0, (breath / breathMax) * 100)}%"></i></div>
            <p class="cs-rally-msg">${esc(msg || 'Tap defenders to tag, then Home before the breath runs out.')}</p>
            <div class="cs-defenders">
              ${defenders
                .map(
                  (d) =>
                    `<button type="button" class="cs-def" data-def="${d.id}" ${d.alive ? '' : 'disabled'}>${
                      d.alive ? '🛡️' : '✓'
                    }</button>`
                )
                .join('')}
            </div>
            <button type="button" class="cs-hit" data-home>Home</button>
          </div>`;
        shell.body.querySelectorAll('[data-def]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const d = defenders[+btn.dataset.def];
            if (!d || !d.alive || home) return;
            d.alive = false;
            tagged += 1;
            buzz('kick');
            paint('Tagged ' + tagged + '. Get home!');
          });
        });
        shell.body.querySelector('[data-home]')?.addEventListener('click', () => {
          if (home) return;
          home = true;
          cancelAnimationFrame(raf);
          const pts = tagged || 0;
          if (pts > 0) {
            you += pts;
            buzz('win', { noConfetti: true });
          } else {
            opp += 1;
            buzz('lose', { noConfetti: true });
          }
          if (liveOn && liveHandle && liveRoles) {
            eventSeq += 1;
            myRaid = false;
            liveHandle.push({
              status: you >= TO_WIN || opp >= TO_WIN ? 'over' : 'playing',
              winner: you >= TO_WIN ? liveRoles.me : opp >= TO_WIN ? liveRoles.opp : null,
              turn: liveRoles.opp,
              state: {
                scores: scoresForPush(),
                raidUid: liveRoles.opp,
                eventSeq,
                msg: 'Home with ' + pts + ' point' + (pts === 1 ? '' : 's') + '.',
              },
            });
          }
          next('Home with ' + pts + ' point' + (pts === 1 ? '' : 's') + '.');
        });
      }

      function loop(now) {
        if (raidPaused) {
          last = now;
          activeRaf = requestAnimationFrame(loop);
          return;
        }
        const dt = now - last;
        last = now;
        breath -= dt;
        const bar = shell.body.querySelector('.cs-breath i');
        if (bar) bar.style.width = Math.max(0, (breath / breathMax) * 100) + '%';
        if (breath <= 0 && !home) {
          home = true;
          cancelAnimationFrame(raf);
          opp += 1;
          buzz('lose', { noConfetti: true });
          if (liveOn && liveHandle && liveRoles) {
            eventSeq += 1;
            myRaid = false;
            liveHandle.push({
              status: opp >= TO_WIN ? 'over' : 'playing',
              winner: opp >= TO_WIN ? liveRoles.opp : null,
              turn: liveRoles.opp,
              state: {
                scores: scoresForPush(),
                raidUid: liveRoles.opp,
                eventSeq,
                msg: 'Caught — breath ran out.',
              },
            });
          }
          next('Caught — breath ran out.');
          return;
        }
        raf = requestAnimationFrame(loop);
        activeRaf = raf;
      }

      paint();
      raf = requestAnimationFrame(loop);
      activeRaf = raf;
    }

    function next(msg) {
      if (you >= TO_WIN || opp >= TO_WIN) {
        ended = true;
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
        shell.body.innerHTML = `
          <div class="cs-kabaddi">
            <div class="cs-rally-score">💪 <strong>${you}</strong> – <strong>${opp}</strong></div>
            <p class="cs-rally-msg">${esc(msg)}</p>
            <p class="cs-rally-hint">Waiting for opponent’s raid…</p>
          </div>`;
        return;
      }
      shell.body.insertAdjacentHTML(
        'beforeend',
        `<p class="cs-rally-hint">${esc(msg)} Tap to raid again.</p>`
      );
      const go = () => startRaid();
      shell.body.addEventListener('click', go, { once: true });
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
          state: { scores: { a: 0, b: 0 }, raidUid: liveRoles.me, eventSeq: 0 },
        });
      }
    }

    startRaid();
  }

  function openPatang() {
    let raf = 0;
    let pauseCtrl = null;
    let lastTs = 0;
    const shell = openShell({
      id: 'patangbaazi',
      title: 'Patang Baazi',
      subtitle: practiceSub('Manjha · wind · cut'),
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
        <p class="cs-rally-msg">Hold to tension the manjha. Drag to steer. Ease through gusts.</p>
        <canvas data-patang></canvas>
        <p class="cs-rally-hint" data-patang-hint>Hold the sky — pull to climb</p>
      </div>`;
    const canvas = shell.body.querySelector('[data-patang]');
    const hint = shell.body.querySelector('[data-patang-hint]');
    let ctx = canvas.getContext('2d');
    let w = 320;
    let h = 420;

    /** Flight state exposed for Prompt 2 cut geometry. */
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
      };
    }
    const you = makeKite(0.35, 0.62, '#FF6D00', '#FFD180');
    const opp = makeKite(0.68, 0.5, '#29B6F6', '#B3E5FC');
    let holding = false;
    let ended = false;
    let t = 0;
    let windX = 0.06;
    let windY = -0.01;
    let gust = 0;
    let cloudOff = 0;
    let pointerId = null;

    const ZENITH = 0.13;
    const GROUND = 0.9;
    const CUT_R2 = 0.011;
    // Wind defaults: gentle base ~0.05–0.12 + gust peaks to ~0.35 for ~1.2s

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

    function end(won, why) {
      if (ended) return;
      ended = true;
      cancelAnimationFrame(raf);
      raf = 0;
      showDuelResult(shell, {
        id: 'patangbaazi',
        you: won ? 1 : 0,
        opp: won ? 0 : 1,
        glyph: won ? '✓' : '·',
        pbScore: won ? 1 : 0,
        subtitle: why || (won ? 'String cut!' : 'Your manjha snapped.'),
        shareText: won ? 'I cut a kite on Chaupaal Patang Baazi!' : 'Patang Baazi on Chaupaal',
        onAgain: openPatang,
      });
    }

    function updateWind(dt) {
      const base = 0.05 + 0.04 * Math.sin(t * 0.35) + 0.02 * Math.sin(t * 0.11);
      // Gust envelope: rises every ~5–7s
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

    function cutPower(k) {
      // Prompt 2 can replace with angle/abrasion; Prompt 1 uses tension + speed proxy.
      const spd = Math.hypot(k.vx, k.vy);
      return k.tension * 0.65 + spd * 7.5 + Math.abs(k.heading) * 0.15;
    }

    function tryResolveCut(a, b) {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      if (dx * dx + dy * dy >= CUT_R2) return null;
      const pa = cutPower(a);
      const pb = cutPower(b);
      if (pa > pb + 0.04) return true;
      if (pb > pa + 0.04) return false;
      return pa >= pb;
    }

    function stepKite(k, dt, isPlayer, pull) {
      // Tension: pull rises, release decays toward float
      const targetTen = pull ? 1 : 0.12;
      const tenRate = pull ? 1.35 : 1.6;
      k.tension += (targetTen - k.tension) * Math.min(1, tenRate * dt);

      // Altitude: smaller y = higher. Climb harder near zenith.
      const alt = 1 - k.y; // 0 ground-ish … ~0.87 zenith
      const zenithFactor = Math.max(0.25, 1 - Math.pow(Math.max(0, (ZENITH + 0.08 - k.y) / 0.2), 1.4));
      const climb = pull ? -0.42 * k.tension * zenithFactor : 0.28 * (0.55 - k.tension);
      const float = -0.04 * (0.5 - k.y); // slight restoring toward mid sky
      k.vy += (climb + float + windY * (0.7 + k.tension * 0.5)) * dt;
      k.vy *= Math.pow(0.86, dt * 60);

      // Steer with inertia toward targetX; wind adds lateral bias
      const steer = (k.targetX - k.x) * 2.4;
      k.vx += (steer + windX * (0.55 + (1 - k.tension) * 0.35)) * dt;
      k.vx *= Math.pow(0.88, dt * 60);

      k.x += k.vx * dt;
      k.y += k.vy * dt;
      k.x = Math.max(0.06, Math.min(0.94, k.x));
      k.y = Math.max(0.08, Math.min(0.94, k.y));
      k.heading = Math.atan2(k.vx * 1.2 + windX * 0.4, -k.vy * 0.8 - 0.15);
      k.tailPhase += dt * (4 + k.tension * 6 + Math.abs(windX) * 8);

      if (isPlayer) {
        if (k.y <= ZENITH + 0.02 && k.tension > 0.82) {
          k.zenithRisk += dt;
          if (k.zenithRisk > 1.15) {
            end(false, 'Manjha snapped at the zenith — ease off next time.');
            return false;
          }
        } else {
          k.zenithRisk = Math.max(0, k.zenithRisk - dt * 0.55);
        }
        if (k.y >= GROUND && k.tension < 0.2) {
          end(false, 'Kite dumped into the rooftops.');
          return false;
        }
      }
      return true;
    }

    function stepRival(dt) {
      // Dumb sine pilot — Prompt 3 replaces with hunter AI
      opp.targetX = 0.52 + Math.sin(t * 1.15) * 0.28 + windX * 0.35;
      const wantPull = Math.sin(t * 0.9) > -0.15 || opp.y > 0.7;
      return stepKite(opp, dt, false, wantPull);
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

    function drawString(k, anchorX) {
      const ax = anchorX * w;
      const ay = h * 0.98;
      const kx = k.x * w;
      const ky = k.y * h;
      const bow = windX * 55 * (0.5 + k.tension * 0.5);
      const mx = (ax + kx) * 0.5 + bow;
      const my = (ay + ky) * 0.5 + 12;
      ctx.strokeStyle = 'rgba(255,236,179,' + (0.35 + k.tension * 0.45) + ')';
      ctx.lineWidth = 1.2 + k.tension * 1.4;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(mx, my, kx, ky);
      ctx.stroke();
    }

    function drawKite(k) {
      const px = k.x * w;
      const py = k.y * h;
      const ang = k.heading * 0.65;
      const s = Math.min(w, h) * 0.045;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(ang);

      // Tail ribbon
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

      // Diamond sail
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

      ctx.restore();
    }

    function updateHint() {
      if (you.zenithRisk > 0.35) {
        hint.textContent = 'Ease off — manjha screaming at the top';
        hint.classList.add('is-warn');
      } else if (gust > 0.14) {
        hint.textContent = 'Gust — ease tension, don’t yank';
        hint.classList.remove('is-warn');
      } else if (holding && you.tension > 0.7) {
        hint.textContent = 'Climbing — drag to cut across their line';
        hint.classList.remove('is-warn');
      } else if (!holding) {
        hint.textContent = 'Floating — hold to pull manjha';
        hint.classList.remove('is-warn');
      } else {
        hint.textContent = 'Hold the sky — pull to climb';
        hint.classList.remove('is-warn');
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

      updateWind(dt);
      if (!stepKite(you, dt, true, holding)) return;
      stepRival(dt);

      const cut = tryResolveCut(you, opp);
      if (cut === true) {
        end(true, 'You cut their string!');
        return;
      }
      if (cut === false) {
        end(false, 'Rival cut your manjha.');
        return;
      }

      updateHint();
      drawSky();
      drawString(opp, 0.58);
      drawString(you, 0.42);
      drawKite(opp);
      drawKite(you);

      // Wind compass tick
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.font = '11px "Space Grotesk",sans-serif';
      ctx.fillText(gust > 0.12 ? 'Wind · gust' : 'Wind · steady', 12, 18);

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
      desc: 'Raid, tag, home',
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
      desc: 'Practice · manjha, wind & cut',
      icon: '🪁',
      gameType: 'solo',
      genre: 'arcade',
      solo: true,
      selfChat: true,
      dangal: true,
      chat1v1: true,
      order: 25,
      launch: openPatang,
    });
  }

  window.openBadminton = (ctx) => openRallySport(Object.assign({}, RALLIES[0], { chat: ctx }));
  window.openTableTennis = (ctx) => openRallySport(Object.assign({}, RALLIES[1], { chat: ctx }));
  window.openPickleball = (ctx) => openRallySport(Object.assign({}, RALLIES[2], { chat: ctx }));
  window.openTennis = (ctx) => openRallySport(Object.assign({}, RALLIES[3], { chat: ctx }));
  window.openKabaddi = openKabaddi;
  window.openPatangBaazi = openPatang;
})();
