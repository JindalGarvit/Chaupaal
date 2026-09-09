/**
 * Party & table classics: Tambola, Carrom, Pool, Rummy, Teen Patti, Bluff,
 * Satte pe Satta, Andar Bahar. Practice vs AI, or Live 1v1 via DangalLive state.
 */
(function () {
  'use strict';

  const RANKS = 'A23456789TJQK'.split('');
  const SUITS = ['♠', '♥', '♦', '♣'];
  const SUIT_COLOR = { '♠': '#111', '♣': '#111', '♥': '#c62828', '♦': '#c62828' };

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

  /** Honest Practice chrome when not in a live Dangal match */
  function practiceSub(detail) {
    if (typeof DangalLive !== 'undefined' && DangalLive.modeChromeLabel) {
      return DangalLive.modeChromeLabel(false, detail || 'vs AI');
    }
    return detail ? 'Practice · ' + detail : 'Practice vs AI';
  }

  function liveSub(detail) {
    if (typeof DangalLive !== 'undefined' && DangalLive.modeChromeLabel) {
      return DangalLive.modeChromeLabel(true, detail);
    }
    return 'Live 1v1';
  }

  function chatLiveOn(chat) {
    return typeof DangalLive !== 'undefined' && DangalLive.isLive(chat);
  }

  /** Prefer launch ctx / chatFromLaunch; fall back to fake chat for Live detection */
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

  async function confirmAndClose(shell, opts) {
    const o = opts || {};
    const playing = o.isPlaying !== false;
    const live = !!o.live;
    if (typeof confirmLeaveGame === 'function') {
      const ok = await confirmLeaveGame({
        title: o.title || 'Leave game?',
        body:
          live && playing
            ? 'Leaving now counts as a forfeit for your opponent.'
            : o.body || 'This run will end.',
      });
      if (!ok) return false;
    }
    if (o.liveHandle && playing) {
      try {
        o.liveHandle.leave({ forfeit: true });
      } catch (e) {
        try {
          o.liveHandle.leave();
        } catch (e2) {}
      }
      o.liveHandle = null;
    }
    shell.close(o.reason || 'dismissed');
    return true;
  }

  function rngFn() {
    return typeof seededRng === 'function' ? seededRng(Date.now() >>> 0) : Math.random;
  }

  function makeDeck(rng) {
    const d = [];
    SUITS.forEach((s) => RANKS.forEach((r) => d.push({ r, s, id: r + s })));
    return typeof shuffleArray === 'function' ? shuffleArray(d, rng) : d.sort(() => rng() - 0.5);
  }

  function rankVal(r) {
    const m = { A: 14, K: 13, Q: 12, J: 11, T: 10 };
    return m[r] || parseInt(r, 10);
  }

  function cardFace(c) {
    const col = SUIT_COLOR[c.s] || '#111';
    return `<button type="button" class="pc-card" data-cid="${esc(c.id)}" style="color:${col}"><b>${esc(c.r)}</b><span>${esc(c.s)}</span></button>`;
  }

  function matchIdFor(chat, gameType) {
    return (
      (chat && chat.dangalMatchId) ||
      (window.__dangalLaunchCtx && window.__dangalLaunchCtx.matchId) ||
      (typeof dangalMatchId === 'function' ? dangalMatchId(gameType, chat) : gameType + '_' + Date.now())
    );
  }

  function openShell(opts) {
    const o = opts || {};
    const overlay = document.createElement('div');
    overlay.className = 'game-overlay game-overlay--dark dangal-fullgame';
    overlay.style.cssText =
      'position:absolute;inset:0;z-index:80;display:flex;flex-direction:column;background:' +
      (o.bg || '#120818') +
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
    if (!begin) (document.querySelector('.device') || document.body).appendChild(overlay);
    if (typeof prepareGameOverlay === 'function') {
      prepareGameOverlay(overlay, { theme: 'dark', gameId: o.id, accent: o.accent });
    }
    if (typeof applyGameIdentity === 'function') applyGameIdentity(o.id, overlay);
    overlay.innerHTML =
      (typeof gameChromeHtml === 'function'
        ? gameChromeHtml({
            title: o.title,
            subtitle: o.subtitle || '',
            backId: o.backId || 'pcBack',
            pauseId: o.pauseId || '',
          })
        : '') + `<div class="dangal-fullgame-body" data-pc-body></div>`;
    const body = overlay.querySelector('[data-pc-body]');
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
    overlay.querySelector('#' + (o.backId || 'pcBack'))?.addEventListener('click', async () => {
      await confirmAndClose(shell, {
        live: !!o.live || !!liveHandle,
        liveHandle,
        isPlaying: !gameOver,
        title: 'Leave ' + (o.title || 'game') + '?',
        body: o.leaveBody || 'This run will end.',
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
    shell.body.innerHTML =
      typeof gameResultHtml === 'function'
        ? gameResultHtml({
            gameId: spec.id,
            glyph: spec.glyph,
            title: spec.title || (draw ? 'Draw' : won ? 'You win' : 'You lose'),
            subtitle: spec.subtitle || '',
            you,
            opp,
            challenge: false,
          })
        : '';
    if (typeof wireGameResultActions === 'function') {
      wireGameResultActions(shell.body, {
        again: spec.onAgain,
        share: () => {
          if (typeof openUnifiedShareSheet === 'function') {
            openUnifiedShareSheet({ gameId: spec.id, stats: { scoreLine: you + '–' + opp, text: spec.shareText } });
          }
        },
      });
    }
  }

  function joinLive(shell, chat, gameType, onSnap, seedState) {
    if (!chatLiveOn(chat) || typeof DangalLive === 'undefined' || !DangalLive.join) return null;
    const roles = DangalLive.roles(chat);
    if (!roles || !roles.me) return null;
    const handle = DangalLive.join({
      gameType,
      matchId: matchIdFor(chat, gameType),
      me: roles.me,
      playerA: roles.playerA,
      playerB: roles.playerB,
      state: seedState || null,
      onSnap(val, api) {
        if (!shell.alive()) return;
        try {
          onSnap(val, api, roles);
        } catch (e) {
          console.warn('[party-classics live]', gameType, e);
        }
      },
      onForfeit(info) {
        if (!shell.alive() || shell.gameOver) return;
        const iWon = info && info.winner === roles.me;
        showDuelResult(shell, {
          id: gameType,
          you: iWon ? 1 : 0,
          opp: iWon ? 0 : 1,
          glyph: '⚑',
          title: iWon ? 'Opponent left' : 'You forfeited',
          subtitle: 'Forfeit',
          shareText: gameType + ' on Chaupaal',
          onAgain: () => {},
        });
      },
    });
    shell.liveHandle = handle;
    return { handle, roles };
  }

  /* ---------- Tambola ---------- */
  function tambolaTicket(rng) {
    const nums = Array.from({ length: 90 }, (_, i) => i + 1);
    const picked = typeof shuffleArray === 'function' ? shuffleArray(nums, rng).slice(0, 15) : nums.slice(0, 15);
    picked.sort((a, b) => a - b);
    const rows = [[], [], []];
    picked.forEach((n, i) => rows[i % 3].push(n));
    rows.forEach((r) => r.sort((a, b) => a - b));
    return { cells: picked, rows, marked: {} };
  }

  function openTambola() {
    const chat = resolveChat(arguments[0]);
    const liveOn = chatLiveOn(chat);
    const rng = rngFn();
    const shell = openShell({
      id: 'tambola',
      title: 'Tambola',
      subtitle: liveOn ? liveSub() : practiceSub('Full house vs caller'),
      mode: liveOn ? 'live' : 'practice',
      live: liveOn,
      chat,
      accent: '#E91E8C',
      bg: '#1A0010',
    });
    if (!shell) return;
    let ticket = tambolaTicket(rng);
    let bag =
      typeof shuffleArray === 'function' ? shuffleArray(Array.from({ length: 90 }, (_, i) => i + 1), rng) : [];
    let idx = 0;
    let last = '—';
    let claimed = false;
    const aiNeed = 15;
    let aiMarked = 0;
    let applying = false;
    let liveRoles = null;
    let liveHandle = null;
    let myTicketKey = 'ticketA';

    function paint() {
      const markedCount = Object.keys(ticket.marked).length;
      shell.body.innerHTML = `
        <div class="pc-tambola">
          <div class="pc-call">${esc(String(last))}</div>
          <p class="pc-hint">Marked ${markedCount}/15 · caller ${idx}/90${liveOn ? ' · Live' : ''}</p>
          <div class="pc-ticket">
            ${ticket.cells
              .map((n) => `<span class="pc-tcell${ticket.marked[n] ? ' is-on' : ''}">${n}</span>`)
              .join('')}
          </div>
          <button type="button" class="cs-hit" data-house ${markedCount < 15 ? 'disabled' : ''}>Claim full house</button>
        </div>`;
      shell.body.querySelector('[data-house]')?.addEventListener('click', () => claim(true));
    }

    function claim(player, fromRemote) {
      if (claimed) return;
      claimed = true;
      if (liveOn && liveHandle && !fromRemote && !applying) {
        liveHandle.push({
          status: 'over',
          winner: player ? liveRoles.me : liveRoles.opp,
          state: { idx, last, claimedBy: player ? liveRoles.me : liveRoles.opp },
        });
      }
      showDuelResult(shell, {
        id: 'tambola',
        you: player ? 1 : 0,
        opp: player ? 0 : 1,
        glyph: '🎱',
        pbScore: player ? 1 : 0,
        subtitle: player ? 'Full house!' : 'House went to the other ticket.',
        shareText: 'Tambola on Chaupaal',
        onAgain: () => openTambola(chat),
      });
    }

    function applyCall(n) {
      last = n;
      buzz('dice');
      if (ticket.cells.indexOf(last) >= 0) ticket.marked[last] = true;
      paint();
      if (Object.keys(ticket.marked).length >= 15) claim(true);
    }

    function tick() {
      if (!shell.alive() || claimed || liveOn) return;
      if (idx >= bag.length) {
        claim(Object.keys(ticket.marked).length >= 15);
        return;
      }
      last = bag[idx++];
      buzz('dice');
      if (ticket.cells.indexOf(last) >= 0) ticket.marked[last] = true;
      if (rng() > 0.72) aiMarked += 1;
      paint();
      if (Object.keys(ticket.marked).length >= 15) {
        claim(true);
        return;
      }
      if (aiMarked >= aiNeed) {
        claim(false);
        return;
      }
      shell.gs && shell.gs.schedule ? shell.gs.schedule(tick, 700) : setTimeout(tick, 700);
    }

    if (liveOn) {
      const joined = joinLive(shell, chat, 'tambola', (val) => {
        if (!val || claimed) return;
        if (val.status === 'forfeit' || val.status === 'over') {
          if (val.status === 'forfeit') {
            const iWon = val.winner === liveRoles.me;
            claimed = true;
            showDuelResult(shell, {
              id: 'tambola',
              you: iWon ? 1 : 0,
              opp: iWon ? 0 : 1,
              glyph: '🎱',
              title: iWon ? 'Opponent left' : 'You forfeited',
              shareText: 'Tambola on Chaupaal',
              onAgain: () => openTambola(chat),
            });
            return;
          }
          if (val.winner) {
            applying = true;
            claim(val.winner === liveRoles.me, true);
            applying = false;
          }
          return;
        }
        const st = val.state || {};
        if (st.bag && Array.isArray(st.bag)) bag = st.bag;
        if (st.ticketA && st.ticketB) {
          const mine = liveRoles.me === liveRoles.playerA ? st.ticketA : st.ticketB;
          ticket = { cells: mine.cells, rows: mine.rows || [], marked: ticket.marked || {} };
          myTicketKey = liveRoles.me === liveRoles.playerA ? 'ticketA' : 'ticketB';
        }
        if (typeof st.idx === 'number' && st.idx > idx) {
          for (let i = idx; i < st.idx; i++) {
            if (bag[i] != null) applyCall(bag[i]);
          }
          idx = st.idx;
        } else if (st.last != null && st.last !== last && st.idx != null) {
          idx = st.idx;
          applyCall(st.last);
        }
      });
      if (joined) {
        liveHandle = joined.handle;
        liveRoles = joined.roles;
        if (liveRoles.host) {
          const tA = tambolaTicket(rng);
          const tB = tambolaTicket(rng);
          ticket = tA;
          bag =
            typeof shuffleArray === 'function'
              ? shuffleArray(Array.from({ length: 90 }, (_, i) => i + 1), rng)
              : bag;
          liveHandle.push({
            status: 'playing',
            turn: liveRoles.me,
            state: {
              bag,
              ticketA: { cells: tA.cells, rows: tA.rows },
              ticketB: { cells: tB.cells, rows: tB.rows },
              idx: 0,
              last: '—',
            },
          });
          const hostTick = () => {
            if (!shell.alive() || claimed) return;
            if (idx >= bag.length) {
              claim(Object.keys(ticket.marked).length >= 15);
              return;
            }
            const n = bag[idx++];
            applyCall(n);
            liveHandle.push({
              status: 'playing',
              state: { bag, ticketA: { cells: tA.cells, rows: tA.rows }, ticketB: { cells: tB.cells, rows: tB.rows }, idx, last: n },
            });
            if (!claimed) {
              shell.gs && shell.gs.schedule ? shell.gs.schedule(hostTick, 700) : setTimeout(hostTick, 700);
            }
          };
          shell.gs && shell.gs.schedule ? shell.gs.schedule(hostTick, 900) : setTimeout(hostTick, 900);
        } else {
          shell.body.innerHTML = `<p class="pc-hint">Waiting for caller…</p>`;
        }
      }
    } else {
      paint();
      tick();
    }
  }

  /* ---------- Cue physics (carrom + pool) — snapshot Live after settle ---------- */
  function openCueGame(spec) {
    let raf = 0;
    let ro = null;
    let pauseCtrl = null;
    let oppTimer = 0;
    const pauseId = 'pcCuePause_' + (spec.id || 'game');
    const chat = resolveChat(spec.chat || arguments[0]);
    const liveOn = chatLiveOn(chat);
    const isCarrom = spec.id === 'carrom' || spec.variant === 'carrom';
    const cueSub = liveOn
      ? liveSub()
      : isCarrom
        ? 'Practice · AI'
        : practiceSub(spec.subtitle || spec.title || 'vs AI');
    const shell = openShell({
      id: spec.id,
      title: spec.title,
      subtitle: cueSub,
      mode: liveOn ? 'live' : 'practice',
      live: liveOn,
      accent: spec.accent,
      bg: spec.bg,
      pauseId,
      chat,
      leaveBody: isCarrom && !liveOn ? 'Resign counts as a loss vs AI.' : undefined,
      cleanup: () => {
        cancelAnimationFrame(raf);
        raf = 0;
        if (oppTimer) {
          clearTimeout(oppTimer);
          oppTimer = 0;
        }
        if (pauseCtrl) pauseCtrl.destroy();
        if (ro) {
          try {
            ro.disconnect();
          } catch (e) {}
          ro = null;
        }
      },
    });
    if (!shell) return;

    const DIFF_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
    let difficulty =
      spec.difficulty === 'easy' || spec.difficulty === 'hard' || spec.difficulty === 'medium'
        ? spec.difficulty
        : 'medium';
    let breakerPick = spec.breakerPick === 'opp' || spec.breakerPick === 'random' || spec.breakerPick === 'you' ? spec.breakerPick : 'you';
    // Live Carrom: White = playerA (host), Black = playerB (joiner). Skip AI sheet.
    let youColor = null;
    if (isCarrom && liveOn) {
      const roles0 = typeof DangalLive !== 'undefined' && DangalLive.roles ? DangalLive.roles(chat) : null;
      if (!roles0 || !roles0.me || !roles0.playerA) {
        if (typeof showToast === 'function') showToast('Live Carrom unavailable — try Practice');
      }
      youColor = roles0 && roles0.me === roles0.playerA ? 'white' : 'black';
    } else if (spec.youColor === 'black' || spec.youColor === 'white') {
      youColor = spec.youColor;
    } else if (isCarrom && !liveOn && !spec.skipSheet) {
      youColor = null;
    } else if (isCarrom) {
      youColor = Math.random() < 0.5 ? 'white' : 'black';
    }

    function setChromeSubtitle(text) {
      const el = shell.overlay && shell.overlay.querySelector('.game-chrome-subtitle');
      if (el) el.textContent = text;
    }

    // Carrom Practice sheet: colour + difficulty + who breaks (Live skips)
    if (isCarrom && !liveOn && !spec.skipSheet && !youColor) {
      let pickColor = 'random';
      let pickDiff = difficulty || 'medium';
      let pickBreak = breakerPick || 'you';
      shell.body.innerHTML = `<div class="pc-carrom-pick">
        <p class="pc-carrom-pick-title">Carrom Practice</p>
        <p class="pc-carrom-pick-sub">Same rules for you and AI. Cover the Queen. Striker pocket is a foul.</p>
        <div class="pc-carrom-field">
          <span class="pc-carrom-field-label">Your colour</span>
          <div class="pc-carrom-pick-row" data-field="color">
            <button type="button" class="pc-carrom-pick-btn pc-carrom-pick-btn--white is-on" data-color="white">White</button>
            <button type="button" class="pc-carrom-pick-btn pc-carrom-pick-btn--black" data-color="black">Black</button>
            <button type="button" class="pc-carrom-pick-btn" data-color="random">Random</button>
          </div>
        </div>
        <div class="pc-carrom-field">
          <span class="pc-carrom-field-label">Difficulty</span>
          <div class="pc-carrom-pick-row" data-field="diff">
            <button type="button" class="pc-carrom-pick-btn" data-diff="easy">Easy</button>
            <button type="button" class="pc-carrom-pick-btn is-on" data-diff="medium">Medium</button>
            <button type="button" class="pc-carrom-pick-btn" data-diff="hard">Hard</button>
          </div>
        </div>
        <div class="pc-carrom-field">
          <span class="pc-carrom-field-label">Who breaks</span>
          <div class="pc-carrom-pick-row" data-field="break">
            <button type="button" class="pc-carrom-pick-btn is-on" data-break="you">You</button>
            <button type="button" class="pc-carrom-pick-btn" data-break="opp">AI</button>
            <button type="button" class="pc-carrom-pick-btn" data-break="random">Random</button>
          </div>
        </div>
        <button type="button" class="pc-carrom-start" data-carrom-start>Start</button>
      </div>`;
      const syncOn = (row, attr, val) => {
        row.querySelectorAll('button').forEach((b) => {
          b.classList.toggle('is-on', b.getAttribute(attr) === val);
        });
      };
      const colorRow = shell.body.querySelector('[data-field="color"]');
      const diffRow = shell.body.querySelector('[data-field="diff"]');
      const breakRow = shell.body.querySelector('[data-field="break"]');
      colorRow.querySelectorAll('[data-color]').forEach((btn) => {
        btn.addEventListener('click', () => {
          pickColor = btn.getAttribute('data-color');
          syncOn(colorRow, 'data-color', pickColor);
        });
      });
      syncOn(colorRow, 'data-color', pickColor);
      diffRow.querySelectorAll('[data-diff]').forEach((btn) => {
        btn.addEventListener('click', () => {
          pickDiff = btn.getAttribute('data-diff');
          syncOn(diffRow, 'data-diff', pickDiff);
        });
      });
      syncOn(diffRow, 'data-diff', pickDiff);
      breakRow.querySelectorAll('[data-break]').forEach((btn) => {
        btn.addEventListener('click', () => {
          pickBreak = btn.getAttribute('data-break');
          syncOn(breakRow, 'data-break', pickBreak);
        });
      });
      syncOn(breakRow, 'data-break', pickBreak);
      shell.body.querySelector('[data-carrom-start]')?.addEventListener('click', () => {
        youColor = pickColor === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : pickColor;
        difficulty = pickDiff;
        breakerPick = pickBreak;
        bootBoard();
      });
      return;
    }

    bootBoard();

    function bootBoard() {
    const oppColor = youColor === 'white' ? 'black' : 'white';
    const breaker =
      breakerPick === 'random' ? (Math.random() < 0.5 ? 'you' : 'opp') : breakerPick === 'opp' ? 'opp' : 'you';
    let queenCoveredBy = null;
    let queenPendingCoverFor = null;
    let strokeSeat = 'you';
    let strokePocketed = [];
    let movingFrames = 0;
    let aiAim = null; // { x, y, until }

    if (isCarrom && !liveOn) {
      setChromeSubtitle(
        'Practice · ' + (DIFF_LABEL[difficulty] || 'Medium') + ' · ' + (youColor === 'white' ? 'White' : 'Black')
      );
    } else if (isCarrom && liveOn) {
      setChromeSubtitle('Live 1v1 · ' + (youColor === 'white' ? 'White' : 'Black'));
    }

    let coachDismissed = false;
    try {
      coachDismissed = localStorage.getItem(spec.coachKey || 'chaupaal_cue_coach_v1') === '1';
    } catch (e) {}

    const coachCopy = isCarrom
      ? liveOn
        ? 'You are ' +
          (youColor === 'white' ? 'White (host breaks)' : 'Black') +
          '. Same Queen/foul rules. Only shoot on your turn.'
        : 'You shoot from the near baseline; AI from the far. Cover the Queen after one of yours.'
      : 'Drag back on the cue ball to aim, release to shoot.';

    shell.body.innerHTML = `<div class="pc-cue${isCarrom ? ' pc-cue--carrom' : ''}">
      ${!coachDismissed && isCarrom ? `<div class="pc-cue-coach" data-cue-coach><span>${coachCopy}</span><button type="button" data-cue-coach-x>Got it</button></div>` : ''}
      <div class="pc-cue-hud" data-cue-hud>You 0 · Opp 0</div>
      <canvas data-cue aria-label="${spec.title || 'Cue'} board"></canvas>
      <p class="pc-hint" data-cue-hint>${
        isCarrom
          ? liveOn
            ? 'Connecting…'
            : breaker === 'you'
              ? 'Your break — drag back on the striker.'
              : 'AI breaks…'
          : 'Drag back on the cue ball to aim, release to shoot.'
      }</p>
    </div>`;
    const canvas = shell.body.querySelector('[data-cue]');
    const hint = shell.body.querySelector('[data-cue-hint]');
    const hud = shell.body.querySelector('[data-cue-hud]');
    const coachEl = shell.body.querySelector('[data-cue-coach]');
    if (coachEl) {
      coachEl.querySelector('[data-cue-coach-x]')?.addEventListener('click', () => {
        coachDismissed = true;
        try {
          localStorage.setItem(spec.coachKey || 'chaupaal_cue_coach_v1', '1');
        } catch (e) {}
        coachEl.remove();
      });
    }
    let ctx2d = canvas.getContext('2d');
    let W = 320;
    let H = 420;
    const ballR = spec.ballR || (isCarrom ? 8 : 9);
    const cueR = spec.cueR || (isCarrom ? 13 : 10);
    const pocketR = spec.pocketR || (isCarrom ? 22 : 16);
    const friction = spec.friction != null ? spec.friction : isCarrom ? 0.981 : 0.985;
    const wallRest = spec.wallRest != null ? spec.wallRest : isCarrom ? 0.72 : 0.8;
    const stopEps = spec.stopEps != null ? spec.stopEps : 0.055;
    const pockets = spec.pockets;
    const youBaseFrac = spec.baselineY || 0.82;
    const oppBaseFrac = 1 - youBaseFrac;
    // Live shared coords: White (playerA) near y=0.82, Black far y=0.18. Practice: you near, AI far.
    const seatBaselineY = (seat) => {
      if (isCarrom && liveOn) {
        const col = seatColor(seat);
        return H * (col === 'white' ? youBaseFrac : oppBaseFrac);
      }
      return H * (seat === 'opp' ? oppBaseFrac : youBaseFrac);
    };
    const baselineY = () => seatBaselineY('you');
    const baselineXMin = () => W * 0.18;
    const baselineXMax = () => W * 0.82;
    const centerX = () => W / 2;
    const centerY = () => H * 0.42;
    let balls = [];
    let dragging = null;
    let aim = { x: 0, y: 0 };
    let youPocketed = 0;
    let oppPocketed = 0;
    let moving = false;
    let ended = false;
    let myTurn = isCarrom && liveOn ? false : !isCarrom ? true : breaker === 'you';
    let applying = false;
    let liveRoles = null;
    let liveHandle = null;
    let seq = 0;
    let cueHomeX = null;
    let cueHomeXOpp = null;
    let strikerFoulHint = 0;
    let layoutReady = false;
    let ballSeq = 1;
    let lastHint = '';
    let breakDone = false;
    let liveSeeded = false;

    function ballRadius(b) {
      return b.r || (b.cue ? cueR : ballR);
    }

    function seatColor(seat) {
      return seat === 'you' ? youColor : oppColor;
    }

    function countOnBoard(kind) {
      return balls.filter((b) => !b.dead && !b.cue && b.kind === kind).length;
    }

    function countPocketed(kind) {
      return balls.filter((b) => b.dead && !b.cue && b.kind === kind).length;
    }

    function queenStatusLabel() {
      if (queenCoveredBy === 'you') return 'Covered (You)';
      if (queenCoveredBy === 'opp') return liveOn ? 'Covered (Opp)' : 'Covered (AI)';
      if (queenPendingCoverFor === 'you') return 'Pending cover (You)';
      if (queenPendingCoverFor === 'opp') return liveOn ? 'Pending cover (Opp)' : 'Pending cover (AI)';
      return 'On board';
    }

    function updateHud() {
      if (!hud) return;
      if (isCarrom) {
        const yLeft = countOnBoard(youColor);
        const oLeft = countOnBoard(oppColor);
        const yIn = countPocketed(youColor);
        const oIn = countPocketed(oppColor);
        const oppName = liveOn ? 'Opp' : 'AI';
        const turn = ended
          ? 'Over'
          : moving
            ? 'Balls moving…'
            : myTurn
              ? 'Your turn'
              : liveOn
                ? 'Opp turn'
                : 'AI turn';
        hud.innerHTML =
          `<div class="pc-cue-hud-row"><span class="pc-cue-swatch pc-cue-swatch--${youColor}"></span>You · ${colorLabel(youColor)} · ${yLeft} left (${yIn})` +
          ` · <span class="pc-cue-swatch pc-cue-swatch--${oppColor}"></span>${oppName} · ${colorLabel(oppColor)} · ${oLeft} left (${oIn})</div>` +
          `<div class="pc-cue-hud-row">Queen: ${queenStatusLabel()} · ${turn}` +
          (liveOn ? '' : ' · ' + (DIFF_LABEL[difficulty] || 'Medium')) +
          `</div>`;
      } else {
        hud.textContent = `You ${youPocketed} · Opp ${oppPocketed}`;
      }
    }

    function colorLabel(c) {
      return c === 'white' ? 'White' : 'Black';
    }

    function resize() {
      const r = canvas.getBoundingClientRect();
      const nW = Math.max(260, r.width || 300);
      const nH = Math.max(340, r.height || 400);
      if (layoutReady && Math.abs(nW - W) < 1 && Math.abs(nH - H) < 1) return;
      const sx = layoutReady ? nW / W : 1;
      const sy = layoutReady ? nH / H : 1;
      W = nW;
      H = nH;
      if (typeof ensureGameCanvas === 'function') ensureGameCanvas(canvas, W, H);
      else {
        canvas.width = W;
        canvas.height = H;
      }
      ctx2d = canvas.getContext('2d');
      if (layoutReady && balls.length) {
        balls.forEach((b) => {
          b.x *= sx;
          b.y *= sy;
        });
        if (cueHomeX != null) cueHomeX *= sx;
      }
    }
    resize();
    balls = spec.makeBalls(W, H, { ballR, cueR });
    balls.forEach((b) => {
      if (!b.id) b.id = 'b' + ballSeq++;
    });
    layoutReady = true;
    const cue0 = balls.find((b) => b.cue);
    if (cue0) cueHomeX = cue0.x;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => resize());
      ro.observe(canvas);
    }
    updateHud();

    function cueBall() {
      return balls.find((b) => b.cue && !b.dead);
    }

    function spotFree(x, y, r, skip) {
      return !balls.some((b) => {
        if (b.dead || b === skip) return false;
        return Math.hypot(b.x - x, b.y - y) < ballRadius(b) + r + 1;
      });
    }

    function placeAtCenter(ball) {
      if (!ball || ball.cue) return;
      const r = ballRadius(ball);
      const cx = centerX();
      const cy = centerY();
      let placed = false;
      for (let ring = 0; ring < 8 && !placed; ring++) {
        const rad = ring === 0 ? 0 : r * 2.15 * ring;
        const n = ring === 0 ? 1 : Math.max(6, ring * 6);
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2 + ring * 0.2;
          const x = cx + Math.cos(ang) * rad;
          const y = cy + Math.sin(ang) * rad;
          if (spotFree(x, y, r, ball)) {
            ball.x = x;
            ball.y = y;
            placed = true;
            break;
          }
        }
      }
      if (!placed) {
        ball.x = cx + (Math.random() - 0.5) * r * 4;
        ball.y = cy + (Math.random() - 0.5) * r * 4;
      }
      ball.dead = false;
      ball.vx = 0;
      ball.vy = 0;
    }

    function returnPieces(list) {
      (list || []).forEach(placeAtCenter);
    }

    function returnPenaltyOwn(color) {
      const prior = balls.filter((b) => b.dead && !b.cue && b.kind === color);
      if (prior.length) placeAtCenter(prior[prior.length - 1]);
    }

    function resetCueToBaseline(opts) {
      const o = opts || {};
      const seat = o.seat || (myTurn ? 'you' : 'opp');
      const by = isCarrom ? seatBaselineY(seat) : baselineY();
      const home = seat === 'opp' ? cueHomeXOpp : cueHomeX;
      let c = balls.find((b) => b.cue);
      if (!c) {
        c = {
          id: 'b' + ballSeq++,
          x: Math.min(baselineXMax(), Math.max(baselineXMin(), home != null ? home : W / 2)),
          y: by,
          vx: 0,
          vy: 0,
          cue: true,
          color: isCarrom ? '#eceff1' : '#fafafa',
          kind: 'striker',
          r: cueR,
        };
        balls.push(c);
      }
      c.dead = false;
      c.x = Math.min(
        baselineXMax(),
        Math.max(baselineXMin(), o.x != null ? o.x : home != null ? home : W / 2)
      );
      c.y = by;
      c.vx = 0;
      c.vy = 0;
      if (seat === 'opp') cueHomeXOpp = c.x;
      else cueHomeX = c.x;
      if (o.foul) {
        strikerFoulHint = 90;
        buzz('reject');
      }
    }

    function snapshotBalls() {
      return balls.map((b) => ({
        x: b.x / W,
        y: b.y / H,
        dead: !!b.dead,
        cue: !!b.cue,
        color: b.color,
        kind: b.kind || (b.cue ? 'striker' : ''),
        side: b.cue ? 'striker' : b.kind === 'queen' ? 'queen' : b.kind || '',
        r: ballRadius(b) / Math.min(W, H),
        id: b.id,
      }));
    }

    function queenToAbsolute() {
      const coveredCol =
        queenCoveredBy === 'you' ? youColor : queenCoveredBy === 'opp' ? oppColor : null;
      const pendingCol =
        queenPendingCoverFor === 'you'
          ? youColor
          : queenPendingCoverFor === 'opp'
            ? oppColor
            : null;
      let status = 'board';
      if (coveredCol) status = 'covered';
      else if (pendingCol) status = 'pending';
      const out = {
        status,
        pendingColor: pendingCol || null,
        coveredBy: coveredCol || null,
        pendingUid: null,
        coveredByUid: null,
      };
      if (liveRoles) {
        if (pendingCol) out.pendingUid = pendingCol === youColor ? liveRoles.me : liveRoles.opp;
        if (coveredCol) out.coveredByUid = coveredCol === youColor ? liveRoles.me : liveRoles.opp;
      }
      return out;
    }

    function applyQueenAbsolute(q) {
      if (!q) {
        queenCoveredBy = null;
        queenPendingCoverFor = null;
        return;
      }
      if (q.status === 'covered' || q.coveredBy || q.coveredByUid) {
        let col = q.coveredBy;
        if (!col && q.coveredByUid && liveRoles) {
          col = q.coveredByUid === liveRoles.me ? youColor : oppColor;
        }
        queenCoveredBy = col === youColor ? 'you' : col === oppColor ? 'opp' : null;
        queenPendingCoverFor = null;
      } else if (q.status === 'pending' || q.pendingColor || q.pendingUid) {
        let col = q.pendingColor;
        if (!col && q.pendingUid && liveRoles) {
          col = q.pendingUid === liveRoles.me ? youColor : oppColor;
        }
        queenPendingCoverFor = col === youColor ? 'you' : col === oppColor ? 'opp' : null;
        queenCoveredBy = null;
      } else {
        queenCoveredBy = null;
        queenPendingCoverFor = null;
      }
    }

    function buildCarromState(extra) {
      return Object.assign(
        {
          balls: snapshotBalls(),
          pocketed: { white: countPocketed('white'), black: countPocketed('black') },
          queen: queenToAbsolute(),
          playerAColor: 'white',
          playerBColor: 'black',
          breakDone: !!breakDone,
          hint: lastHint || '',
          phase: 'settled',
        },
        extra || {}
      );
    }

    function applySnapshot(list, scores, turnUid) {
      if (!list || !list.length) return;
      balls = list.map((b) => ({
        x: b.x * W,
        y: b.y * H,
        vx: 0,
        vy: 0,
        dead: !!b.dead,
        cue: !!b.cue,
        color: b.color,
        kind: b.kind || b.side || '',
        r: b.r != null && b.r < 1 ? b.r * Math.min(W, H) : b.r || (b.cue ? cueR : ballR),
        id: b.id || 'b' + ballSeq++,
      }));
      if (scores && !isCarrom) {
        youPocketed = liveRoles.me === liveRoles.playerA ? scores.a | 0 : scores.b | 0;
        oppPocketed = liveRoles.me === liveRoles.playerA ? scores.b | 0 : scores.a | 0;
      }
      if (turnUid && liveRoles) myTurn = turnUid === liveRoles.me;
      moving = false;
      dragging = null;
      updateHud();
      hint.textContent = myTurn ? 'Your shot.' : liveOn ? 'Opponent’s shot…' : 'Opponent’s turn…';
    }

    function applyCarromLiveVal(val) {
      if (!val || !liveRoles) return;
      const ver = Number(val.version != null ? val.version : val.seq) || 0;
      if (ver < seq) return;
      const st = val.state || {};
      seq = ver;
      applying = true;
      dragging = null;
      moving = false;
      movingFrames = 0;
      aiAim = null;
      if (st.balls && Array.isArray(st.balls) && st.balls.length) {
        applySnapshot(st.balls, null, val.turn);
      }
      if (st.queen) applyQueenAbsolute(st.queen);
      if (st.breakDone != null) breakDone = !!st.breakDone;
      if (st.hint) lastHint = String(st.hint);
      myTurn = val.turn === liveRoles.me && val.status === 'playing';
      if (val.status === 'playing') {
        if (myTurn) {
          const c = cueBall();
          if (!c || Math.abs(c.y - seatBaselineY('you')) > 36) {
            resetCueToBaseline({ seat: 'you' });
          }
          hint.textContent = lastHint ? lastHint + ' Your shot.' : 'Your shot.';
        } else {
          hint.textContent = lastHint ? lastHint + ' Opponent’s shot…' : 'Opponent’s shot…';
        }
      }
      updateHud();
      applying = false;
    }

    function pushSettle() {
      if (!liveOn || !liveHandle || !liveRoles || applying) return;
      if (isCarrom) return; // carrom uses pushCarromLive
      const scores =
        liveRoles.me === liveRoles.playerA
          ? { a: youPocketed, b: oppPocketed }
          : { a: oppPocketed, b: youPocketed };
      liveHandle.push({
        baseVersion: seq,
        status: 'playing',
        turn: liveRoles.opp,
        state: { balls: snapshotBalls(), scores, phase: 'settled' },
      });
      if (typeof DangalLive !== 'undefined' && DangalLive.pingTurn) {
        DangalLive.pingTurn(liveRoles.opp, spec.id, { chatId: chat && (chat.firestoreId || chat.id) });
      }
      myTurn = false;
      hint.textContent = 'Opponent’s shot…';
    }

    function pushCarromLive(opts) {
      if (!liveOn || !liveHandle || !liveRoles || applying) return;
      const o = opts || {};
      const turnUid = o.turnUid || (myTurn ? liveRoles.me : liveRoles.opp);
      lastHint = o.msg || lastHint;
      breakDone = true;
      const patch = {
        baseVersion: seq,
        status: o.status || 'playing',
        turn: turnUid,
        state: buildCarromState({
          phase: o.phase || 'settled',
          hint: lastHint,
          breakDone: true,
        }),
      };
      if (o.winner) patch.winner = o.winner;
      liveHandle.push(patch);
      if (patch.status === 'playing' && typeof DangalLive !== 'undefined' && DangalLive.pingTurn) {
        DangalLive.pingTurn(turnUid, 'carrom', { chatId: chat && (chat.firestoreId || chat.id) });
      }
    }

    function pointerPos(e) {
      const r = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - r.left) / r.width) * W,
        y: ((e.clientY - r.top) / r.height) * H,
      };
    }

    function canHumanAim() {
      if (moving || ended) return false;
      if (liveOn && !myTurn) return false;
      if (isCarrom && !myTurn) return false;
      return true;
    }

    canvas.addEventListener('pointerdown', (e) => {
      if (!canHumanAim()) return;
      const { x, y } = pointerPos(e);
      const c = cueBall();
      if (!c) return;
      const dx = x - c.x;
      const dy = y - c.y;
      const hitR = ballRadius(c) + 10;
      if (dx * dx + dy * dy < hitR * hitR) {
        dragging = { mode: 'aim', sx: x, sy: y, placed: false };
        aim.x = x;
        aim.y = y;
        canvas.setPointerCapture(e.pointerId);
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const { x, y } = pointerPos(e);
      aim.x = x;
      aim.y = y;
      const c = cueBall();
      if (!c || !isCarrom) return;
      const pull = Math.hypot(c.x - x, c.y - y);
      const nearBase = Math.abs(c.y - seatBaselineY('you')) < 28;
      if (nearBase && pull < 28 && Math.abs(x - c.x) > Math.abs(y - c.y)) {
        dragging.mode = 'place';
        c.x = Math.min(baselineXMax(), Math.max(baselineXMin(), x));
        c.y = seatBaselineY('you');
        cueHomeX = c.x;
        dragging.placed = true;
      } else if (pull >= 28) {
        dragging.mode = 'aim';
      }
    });
    canvas.addEventListener('pointerup', () => {
      if (!dragging) return;
      const c = cueBall();
      const wasPlace = dragging.mode === 'place' && dragging.placed;
      dragging = null;
      if (!c || !canHumanAim()) return;
      if (wasPlace) {
        hint.textContent = 'Striker placed — drag back to shoot.';
        return;
      }
      const dx = c.x - aim.x;
      const dy = c.y - aim.y;
      const mag = Math.hypot(dx, dy);
      if (mag < 10) return;
      const maxP = isCarrom ? 12.5 : 14;
      const p = Math.min(maxP, mag / 9);
      strokeSeat = 'you';
      strokePocketed = [];
      movingFrames = 0;
      c.vx = (dx / mag) * p;
      c.vy = (dy / mag) * p;
      moving = true;
      hint.textContent = 'Balls moving…';
      updateHud();
      buzz('stone');
    });
    canvas.addEventListener('pointercancel', () => {
      dragging = null;
    });

    function pocketed(b) {
      const pr = pocketR;
      return pockets.some((p) => Math.hypot(b.x - p[0] * W, b.y - p[1] * H) < pr);
    }

    function step() {
      const margin = isCarrom ? Math.min(W, H) * 0.06 + 2 : 0;
      balls.forEach((b) => {
        if (b.dead) return;
        const r = ballRadius(b);
        b.x += b.vx;
        b.y += b.vy;
        b.vx *= friction;
        b.vy *= friction;
        if (Math.hypot(b.vx, b.vy) < stopEps) {
          b.vx = 0;
          b.vy = 0;
        }
        const minX = margin + r;
        const maxX = W - margin - r;
        const minY = margin + r;
        const maxY = H - margin - r;
        if (b.x < minX) {
          b.x = minX;
          b.vx *= -wallRest;
        }
        if (b.x > maxX) {
          b.x = maxX;
          b.vx *= -wallRest;
        }
        if (b.y < minY) {
          b.y = minY;
          b.vy *= -wallRest;
        }
        if (b.y > maxY) {
          b.y = maxY;
          b.vy *= -wallRest;
        }
        if (!b.cue && pocketed(b)) {
          b.dead = true;
          b.vx = b.vy = 0;
          if (isCarrom) {
            strokePocketed.push(b);
          } else {
            youPocketed += 1;
            updateHud();
          }
          buzz('coin');
        }
        if (b.cue && pocketed(b)) {
          b.vx = b.vy = 0;
          if (isCarrom) {
            b.dead = true;
            strokePocketed.push(b);
          } else {
            resetCueToBaseline({ foul: true });
            hint.textContent = 'Cue pocketed — reset.';
          }
        }
      });
      for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < balls.length; i++) {
          for (let j = i + 1; j < balls.length; j++) {
            const a = balls[i];
            const b = balls[j];
            if (a.dead || b.dead) continue;
            const ra = ballRadius(a);
            const rb = ballRadius(b);
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const d = Math.hypot(dx, dy) || 0.0001;
            const minD = ra + rb;
            if (d < minD) {
              const nx = dx / d;
              const ny = dy / d;
              const rvx = a.vx - b.vx;
              const rvy = a.vy - b.vy;
              const velAlong = rvx * nx + rvy * ny;
              if (velAlong <= 0) {
                const impulse = velAlong;
                a.vx -= impulse * nx;
                a.vy -= impulse * ny;
                b.vx += impulse * nx;
                b.vy += impulse * ny;
                if (pass === 0 && Math.abs(impulse) > 0.35) buzz('stone');
              }
              const ov = (minD - d) * 0.51;
              a.x -= nx * ov;
              a.y -= ny * ov;
              b.x += nx * ov;
              b.y += ny * ov;
            }
          }
        }
      }
    }

    function remaining() {
      return balls.filter((b) => !b.cue && !b.dead).length;
    }

    function resolveCarromStroke() {
      const seat = strokeSeat;
      const color = seatColor(seat);
      const other = color === 'white' ? 'black' : 'white';
      const ownHit = strokePocketed.filter((b) => b.kind === color);
      const oppHit = strokePocketed.filter((b) => b.kind === other);
      const queenHit = strokePocketed.filter((b) => b.kind === 'queen');
      const strikerHit = strokePocketed.some((b) => b.cue);
      const priorOwn = countPocketed(color) - ownHit.length;
      const coveringNow = queenPendingCoverFor === seat;
      let foul = false;
      let msg = '';
      let keepTurn = false;
      const who = seat === 'you' ? 'You' : liveOn ? 'Opp' : 'AI';

      const bounceOpp = () => returnPieces(oppHit);

      if (strikerHit) {
        foul = true;
        msg = queenHit.length
          ? who + ': foul — striker + Queen. Queen back.'
          : who + ': foul — striker pocketed.';
        returnPieces(ownHit);
        bounceOpp();
        returnPieces(queenHit);
        if (coveringNow) {
          const q = balls.find((b) => b.kind === 'queen');
          if (q && q.dead && !queenCoveredBy) placeAtCenter(q);
          queenPendingCoverFor = null;
        }
        returnPenaltyOwn(color);
      } else if (queenHit.length) {
        const legalQueen = priorOwn >= 1;
        if (!legalQueen) {
          foul = true;
          msg = who + ': Queen illegal — need one of yours first.';
          returnPieces(queenHit);
          bounceOpp();
          if (priorOwn >= 1) returnPenaltyOwn(color);
          queenPendingCoverFor = null;
        } else if (ownHit.length) {
          queenCoveredBy = seat;
          queenPendingCoverFor = null;
          bounceOpp();
          keepTurn = true;
          msg = who + ': Queen covered!';
          buzz('win');
        } else {
          queenPendingCoverFor = seat;
          bounceOpp();
          keepTurn = true;
          msg = who + ': Queen pocketed — cover next shot.';
        }
      } else if (coveringNow) {
        bounceOpp();
        if (ownHit.length) {
          queenCoveredBy = seat;
          queenPendingCoverFor = null;
          keepTurn = true;
          msg = who + ': Queen covered!';
          buzz('win');
        } else {
          foul = true;
          msg = who + ': cover failed — Queen returns.';
          const q = balls.find((b) => b.kind === 'queen');
          if (q && q.dead && !queenCoveredBy) placeAtCenter(q);
          queenPendingCoverFor = null;
        }
      } else {
        bounceOpp();
        if (ownHit.length) {
          keepTurn = true;
          msg = who + (oppHit.length ? ': man in — opp coin returned.' : ': nice — keep shooting.');
        } else if (oppHit.length) {
          msg = who + ': opp coin returned — turn ends.';
        } else {
          msg = who + ': miss — turn ends.';
        }
      }

      if (!foul && countOnBoard(color) === 0 && queenCoveredBy !== seat) {
        if (queenCoveredBy && queenCoveredBy !== seat) {
          const revive = balls.filter((b) => b.dead && b.kind === color);
          if (revive.length) placeAtCenter(revive[revive.length - 1]);
          keepTurn = false;
          msg = who + ': need Queen covered by you to finish.';
        } else if (!queenCoveredBy) {
          const revive = balls.filter((b) => b.dead && b.kind === color);
          if (revive.length) placeAtCenter(revive[revive.length - 1]);
          keepTurn = false;
          msg = who + ': cover the Queen before your last man.';
          if (queenPendingCoverFor === seat) {
            const q = balls.find((b) => b.kind === 'queen');
            if (q && q.dead) placeAtCenter(q);
            queenPendingCoverFor = null;
          }
        }
      }

      updateHud();

      if (countOnBoard(color) === 0 && queenCoveredBy === seat) {
        lastHint = msg;
        if (liveOn) {
          const winnerUid = seat === 'you' ? liveRoles.me : liveRoles.opp;
          pushCarromLive({
            status: 'over',
            winner: winnerUid,
            turnUid: winnerUid,
            msg,
            phase: 'over',
          });
        }
        finish(seat === 'you', { skipLivePush: true });
        return;
      }
      if (
        countOnBoard(seat === 'you' ? oppColor : youColor) === 0 &&
        queenCoveredBy === (seat === 'you' ? 'opp' : 'you')
      ) {
        lastHint = msg;
        if (liveOn) {
          const winnerUid = seat === 'you' ? liveRoles.opp : liveRoles.me;
          pushCarromLive({
            status: 'over',
            winner: winnerUid,
            turnUid: winnerUid,
            msg,
            phase: 'over',
          });
        }
        finish(seat !== 'you', { skipLivePush: true });
        return;
      }

      const nextSeat = keepTurn && !foul ? seat : seat === 'you' ? 'opp' : 'you';
      myTurn = nextSeat === 'you';
      resetCueToBaseline({ seat: nextSeat, foul: foul && strikerHit });
      lastHint = msg;
      hint.textContent = msg + (myTurn ? ' Your shot.' : liveOn ? ' Opponent’s shot…' : '');
      updateHud();

      if (liveOn) {
        const turnUid = myTurn ? liveRoles.me : liveRoles.opp;
        pushCarromLive({ turnUid, msg, phase: 'settled' });
        return;
      }

      if (!myTurn) scheduleAiTurn();
      else if (myTurn && !msg.includes('Your shot')) hint.textContent = (msg ? msg + ' ' : '') + 'Your shot.';
    }

    function distPointSeg(px, py, x1, y1, x2, y2) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len2 = dx * dx + dy * dy || 1;
      let t = ((px - x1) * dx + (py - y1) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }

    function planAiShot() {
      const c = cueBall();
      if (!c) return { vx: 0, vy: 4 };
      const color = oppColor;
      const priorOwn = countPocketed(color);
      const pending = queenPendingCoverFor === 'opp';
      const diff = difficulty;
      const jitter = diff === 'easy' ? 0.42 : diff === 'hard' ? 0.07 : 0.18;
      const maxP = diff === 'easy' ? 7.2 : diff === 'hard' ? 11.8 : 9.6;
      const minP = diff === 'easy' ? 2.8 : 4.2;
      const candidates = [];

      function foulRiskToward(dx, dy) {
        const mag = Math.hypot(dx, dy) || 1;
        let risk = 0;
        (pockets || []).forEach((p) => {
          const px = p[0] * W;
          const py = p[1] * H;
          if (Math.hypot(c.x - px, c.y - py) > pocketR * 3.2) return;
          const along = ((px - c.x) * dx + (py - c.y) * dy) / mag;
          if (along > 0) risk += 1;
        });
        return risk;
      }

      function addCand(tx, ty, power, score, tag) {
        const dx = tx - c.x;
        const dy = ty - c.y;
        const mag = Math.hypot(dx, dy) || 1;
        const p = Math.max(minP, Math.min(maxP, power));
        const risk = foulRiskToward(dx, dy);
        candidates.push({
          vx: (dx / mag) * p,
          vy: (dy / mag) * p,
          score: score - risk * (diff === 'easy' ? 0.5 : 4),
          tag,
          tx,
          ty,
        });
      }

      const own = balls.filter((b) => !b.dead && !b.cue && b.kind === color);
      const queen = balls.find((b) => !b.dead && b.kind === 'queen');

      function clearish(x1, y1, x2, y2, skip) {
        let hits = 0;
        balls.forEach((o) => {
          if (o.dead || o.cue || o === skip) return;
          if (distPointSeg(o.x, o.y, x1, y1, x2, y2) < ballRadius(o) + ballR * 0.85) hits += 1;
        });
        return hits;
      }

      own.forEach((coin) => {
        (pockets || []).forEach((p) => {
          const px = p[0] * W;
          const py = p[1] * H;
          const pdx = px - coin.x;
          const pdy = py - coin.y;
          const pmag = Math.hypot(pdx, pdy) || 1;
          const ux = pdx / pmag;
          const uy = pdy / pmag;
          const sep = ballR + cueR;
          const gx = coin.x - ux * sep;
          const gy = coin.y - uy * sep;
          const blocked =
            clearish(c.x, c.y, gx, gy, coin) + clearish(coin.x, coin.y, px, py, coin);
          const dist = Math.hypot(gx - c.x, gy - c.y);
          const power = dist / 26 + pmag / 42;
          let score = 24 - blocked * 6 - pmag / 28;
          if (pending) score += 18;
          if (diff === 'easy') score += (Math.random() - 0.5) * 20;
          addCand(gx, gy, power, score, 'own');
        });
      });

      // Queen only when legal (and cover pending prefers own above)
      if (queen && priorOwn >= 1 && !pending && diff !== 'easy') {
        (pockets || []).forEach((p) => {
          const px = p[0] * W;
          const py = p[1] * H;
          const pdx = px - queen.x;
          const pdy = py - queen.y;
          const pmag = Math.hypot(pdx, pdy) || 1;
          const ux = pdx / pmag;
          const uy = pdy / pmag;
          const sep = ballR + cueR;
          const gx = queen.x - ux * sep;
          const gy = queen.y - uy * sep;
          const blocked = clearish(c.x, c.y, gx, gy, queen);
          // Hard prefers queen when path clear; Medium only if very clear
          let score = (diff === 'hard' ? 22 : 12) - blocked * 8 - pmag / 30;
          if (own.length <= 2) score += 8;
          addCand(gx, gy, Math.hypot(gx - c.x, gy - c.y) / 24 + pmag / 40, score, 'queen');
        });
      }

      // Easy / fallback scatter
      {
        const t = own[Math.floor(Math.random() * Math.max(1, own.length))] || {
          x: centerX(),
          y: centerY(),
        };
        addCand(
          t.x + (Math.random() - 0.5) * (diff === 'easy' ? 70 : 28),
          t.y + (Math.random() - 0.5) * (diff === 'easy' ? 70 : 28),
          minP + Math.random() * (maxP - minP) * (diff === 'easy' ? 0.55 : 0.75),
          diff === 'easy' ? 8 : 2,
          'scatter'
        );
      }

      candidates.sort((a, b) => b.score - a.score);
      let pick = candidates[0] || { vx: 0, vy: 5, score: 0 };

      if (diff === 'hard') {
        const pool = candidates.slice(0, Math.min(10, candidates.length));
        for (let i = 0; i < 12; i++) {
          const base = pool[i % pool.length];
          const ang0 = Math.atan2(base.vy, base.vx);
          const ang = ang0 + (Math.random() - 0.5) * 0.28;
          const pow = Math.hypot(base.vx, base.vy) * (0.88 + Math.random() * 0.24);
          const score = base.score - Math.abs(ang - ang0) * 8;
          if (score > pick.score) {
            pick = { vx: Math.cos(ang) * pow, vy: Math.sin(ang) * pow, score, tag: 'sample' };
          }
        }
      } else if (diff === 'medium') {
        const n = Math.min(4, candidates.length);
        pick = candidates[Math.floor(Math.random() * n)];
      } else {
        pick = candidates[Math.floor(Math.random() * candidates.length)] || pick;
      }

      const ang = Math.atan2(pick.vy, pick.vx) + (Math.random() - 0.5) * jitter * 2;
      let pow = Math.hypot(pick.vx, pick.vy) * (1 + (Math.random() - 0.5) * jitter);
      pow = Math.max(2.4, Math.min(12.5, pow));
      return { vx: Math.cos(ang) * pow, vy: Math.sin(ang) * pow, tag: pick.tag };
    }

    function scheduleAiTurn() {
      if (ended || liveOn || !isCarrom) return;
      myTurn = false;
      hint.textContent = 'AI thinking…';
      updateHud();
      if (oppTimer) clearTimeout(oppTimer);
      const think =
        difficulty === 'easy' ? 220 + Math.random() * 200 : difficulty === 'hard' ? 420 + Math.random() * 180 : 300 + Math.random() * 220;
      oppTimer = setTimeout(() => {
        oppTimer = 0;
        if (ended || !shell.alive() || moving) return;
        fireAiShot();
      }, think);
    }

    function fireAiShot() {
      if (ended || moving) return;
      const own = balls.filter((b) => !b.dead && !b.cue && b.kind === oppColor);
      const align = own[Math.floor(Math.random() * Math.max(1, own.length))];
      let sx =
        difficulty === 'easy'
          ? baselineXMin() + Math.random() * (baselineXMax() - baselineXMin())
          : align
            ? Math.min(baselineXMax(), Math.max(baselineXMin(), align.x + (Math.random() - 0.5) * (difficulty === 'hard' ? 18 : 36)))
            : W / 2;
      // keep striker clear of coins on baseline
      for (let tries = 0; tries < 8; tries++) {
        const blocked = balls.some(
          (b) => !b.dead && !b.cue && Math.hypot(b.x - sx, b.y - seatBaselineY('opp')) < ballRadius(b) + cueR + 2
        );
        if (!blocked) break;
        sx = baselineXMin() + Math.random() * (baselineXMax() - baselineXMin());
      }
      resetCueToBaseline({ seat: 'opp', x: sx });
      const c = cueBall();
      if (!c) {
        myTurn = true;
        hint.textContent = 'Your shot.';
        updateHud();
        return;
      }
      const shot = planAiShot();
      aiAim = {
        x: c.x - shot.vx * 10,
        y: c.y - shot.vy * 10,
        until: (typeof performance !== 'undefined' ? performance.now() : Date.now()) + 320,
      };
      strokeSeat = 'opp';
      strokePocketed = [];
      movingFrames = 0;
      c.vx = shot.vx;
      c.vy = shot.vy;
      moving = true;
      hint.textContent = 'AI shooting…';
      updateHud();
      buzz('stone');
    }

    function aiTurn() {
      if (liveOn || isCarrom) return;
      const live = balls.filter((b) => !b.cue && !b.dead);
      if (!live.length) return finish(true);
      const pick = live[Math.floor(Math.random() * live.length)];
      pick.dead = true;
      oppPocketed += 1;
      updateHud();
      buzz('place');
      hint.textContent = 'Opponent pocketed one.';
      myTurn = true;
      if (!remaining()) finish(youPocketed >= oppPocketed);
    }

    function rematchOpts() {
      return {
        chat,
        youColor,
        difficulty,
        breakerPick,
        skipSheet: true,
      };
    }

    function finish(won, meta) {
      if (ended) return;
      ended = true;
      cancelAnimationFrame(raf);
      raf = 0;
      if (oppTimer) {
        clearTimeout(oppTimer);
        oppTimer = 0;
      }
      const m = meta || {};
      if (liveOn && liveHandle && liveRoles && !applying && !m.skipLivePush) {
        if (isCarrom) {
          pushCarromLive({
            status: 'over',
            winner: won ? liveRoles.me : liveRoles.opp,
            turnUid: won ? liveRoles.me : liveRoles.opp,
            msg: lastHint,
            phase: 'over',
          });
        } else {
          liveHandle.push({
            status: 'over',
            winner: won ? liveRoles.me : liveRoles.opp,
            state: { balls: snapshotBalls(), scores: { a: youPocketed, b: oppPocketed }, phase: 'over' },
          });
        }
      }
      if (isCarrom && typeof recordDangalSession === 'function') {
        recordDangalSession('carrom', {
          won: !!won,
          score: countPocketed(youColor),
          difficulty: liveOn ? 'live' : difficulty,
          live: !!liveOn,
        });
      }
      const winColor = won ? youColor : oppColor;
      const resign = m.resign;
      showDuelResult(shell, {
        id: spec.id,
        you: won ? 1 : 0,
        opp: won ? 0 : 1,
        glyph: spec.glyph,
        pbScore: isCarrom ? countPocketed(youColor) : youPocketed,
        title: isCarrom
          ? resign
            ? liveOn
              ? 'You forfeited'
              : 'You resigned'
            : colorLabel(winColor) + ' won'
          : won
            ? 'You win'
            : 'Defeat',
        subtitle: isCarrom
          ? (resign
              ? liveOn
                ? 'Forfeit · '
                : 'Loss vs AI · '
              : (won ? 'You' : liveOn ? 'Opp' : 'AI') + ' · ') +
            colorLabel(winColor) +
            (queenCoveredBy ? ' · Queen covered' : '') +
            (liveOn ? ' · Live' : ' · ' + (DIFF_LABEL[difficulty] || 'Medium')) +
            ' · You pocketed ' +
            countPocketed(youColor)
          : 'Pocketed ' + youPocketed + ' · opponent ' + oppPocketed,
        shareText: (spec.title || 'Game') + ' on Chaupaal',
        onAgain: () => {
          if (isCarrom && liveOn) {
            // Prompt 4 minimum: new matchId only — never revive an `over` RTDB node
            const oppUid = liveRoles && liveRoles.opp;
            const rematchId =
              oppUid && typeof dangalMatchId === 'function'
                ? dangalMatchId('carrom', { name: 'Opp', opponentUid: oppUid })
                : 'carrom_' + Date.now();
            try {
              window.__dangalLaunchCtx = Object.assign({}, window.__dangalLaunchCtx || {}, {
                matchId: rematchId,
                mode: 'live',
                opponentUid: oppUid,
                source: 'challenge_host',
              });
            } catch (e) {}
            openCarrom(Object.assign({}, chat, { dangalMatchId: rematchId, opponentUid: oppUid }));
            return;
          }
          if (isCarrom) openCueGame(Object.assign({}, spec, rematchOpts()));
          else openCueGame(Object.assign({}, spec, { chat }));
        },
      });
    }

    function drawBoard() {
      if (typeof spec.drawBoard === 'function') {
        spec.drawBoard(ctx2d, W, H, { pockets, pocketR, baselineY: baselineY() });
        return;
      }
      ctx2d.fillStyle = spec.felt;
      ctx2d.fillRect(0, 0, W, H);
      ctx2d.fillStyle = '#1a1a1a';
      pockets.forEach((p) => {
        ctx2d.beginPath();
        ctx2d.arc(p[0] * W, p[1] * H, pocketR * 0.75, 0, Math.PI * 2);
        ctx2d.fill();
      });
    }

    function draw() {
      drawBoard();
      balls.forEach((b) => {
        if (b.dead) return;
        const r = ballRadius(b);
        ctx2d.beginPath();
        ctx2d.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx2d.fillStyle = b.color;
        ctx2d.fill();
        if (b.cue) {
          ctx2d.strokeStyle = 'rgba(255,255,255,.9)';
          ctx2d.lineWidth = 2;
          ctx2d.stroke();
          ctx2d.beginPath();
          ctx2d.arc(b.x, b.y, r * 0.35, 0, Math.PI * 2);
          ctx2d.fillStyle = 'rgba(0,0,0,.12)';
          ctx2d.fill();
        } else if (b.kind === 'queen') {
          ctx2d.strokeStyle = 'rgba(255,215,0,.7)';
          ctx2d.lineWidth = 1.5;
          ctx2d.stroke();
        } else {
          ctx2d.strokeStyle = 'rgba(0,0,0,.15)';
          ctx2d.lineWidth = 1;
          ctx2d.stroke();
        }
      });
      if (dragging && dragging.mode !== 'place') {
        const c = cueBall();
        if (c) {
          const dx = c.x - aim.x;
          const dy = c.y - aim.y;
          const mag = Math.hypot(dx, dy);
          if (mag > 6) {
            const tx = c.x + (dx / mag) * Math.min(110, mag * 1.4);
            const ty = c.y + (dy / mag) * Math.min(110, mag * 1.4);
            ctx2d.strokeStyle = 'rgba(255,255,255,.55)';
            ctx2d.lineWidth = 2;
            ctx2d.setLineDash([6, 5]);
            ctx2d.beginPath();
            ctx2d.moveTo(c.x, c.y);
            ctx2d.lineTo(tx, ty);
            ctx2d.stroke();
            ctx2d.setLineDash([]);
            const pow = Math.min(1, mag / 90);
            ctx2d.strokeStyle = `rgba(255,${Math.floor(200 - pow * 120)},60,.85)`;
            ctx2d.beginPath();
            ctx2d.arc(c.x, c.y, ballRadius(c) + 6 + pow * 10, -Math.PI / 2, -Math.PI / 2 + pow * Math.PI * 2);
            ctx2d.stroke();
          }
        }
      }
      if (aiAim) {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const c = cueBall();
        if (c && now < aiAim.until) {
          ctx2d.strokeStyle = 'rgba(255,200,120,.65)';
          ctx2d.lineWidth = 2;
          ctx2d.setLineDash([5, 5]);
          ctx2d.beginPath();
          ctx2d.moveTo(c.x, c.y);
          ctx2d.lineTo(aiAim.x, aiAim.y);
          ctx2d.stroke();
          ctx2d.setLineDash([]);
        } else if (now >= aiAim.until) {
          aiAim = null;
        }
      }
      if (strikerFoulHint > 0) strikerFoulHint--;
    }

    function onSettle() {
      if (isCarrom) {
        // Practice + Live: shooter resolves rules; Live peers only apply remote snaps
        resolveCarromStroke();
        return;
      }
      if (!remaining()) {
        finish(true);
        return;
      }
      if (liveOn) {
        pushSettle();
        return;
      }
      hint.textContent = 'Opponent’s turn…';
      if (shell.gs && shell.gs.schedule) shell.gs.schedule(aiTurn, 700);
      else setTimeout(aiTurn, 700);
    }

    function loop() {
      if (!shell.alive() || ended) return;
      if (pauseCtrl && pauseCtrl.isPaused()) {
        raf = requestAnimationFrame(loop);
        return;
      }
      if (moving) {
        movingFrames += 1;
        step();
        if (movingFrames > 900) {
          balls.forEach((b) => {
            b.vx = 0;
            b.vy = 0;
          });
        }
        moving = balls.some((b) => !b.dead && Math.hypot(b.vx, b.vy) > stopEps);
        if (!moving) onSettle();
      }
      draw();
      raf = requestAnimationFrame(loop);
    }
    if (typeof createGamePauseController === 'function') {
      pauseCtrl = createGamePauseController({
        host: shell.host || shell.overlay,
        pauseBtnId: pauseId,
        onPause() {
          cancelAnimationFrame(raf);
          raf = 0;
        },
        onResume() {
          if (!ended && !raf) raf = requestAnimationFrame(loop);
        },
        onQuit: () => {
          if (isCarrom && !liveOn && !ended) finish(false, { resign: true });
          else shell.close('dismissed');
        },
      });
    }

    // Resign via back → loss vs AI
    if (isCarrom && !liveOn) {
      const back = shell.overlay.querySelector('#pcBack');
      if (back) {
        const neu = back.cloneNode(true);
        back.parentNode.replaceChild(neu, back);
        neu.addEventListener('click', async () => {
          if (ended) {
            shell.close('dismissed');
            return;
          }
          const ok =
            typeof confirmLeaveGame === 'function'
              ? await confirmLeaveGame({
                  title: 'Resign Carrom?',
                  body: 'This counts as a loss vs AI.',
                })
              : true;
          if (!ok) return;
          finish(false, { resign: true });
        });
      }
    }

    if (liveOn) {
      const seedState =
        isCarrom && youColor === 'white'
          ? buildCarromState({
              phase: 'deal',
              breakDone: false,
              hint: 'Host breaks — White.',
              pocketed: { white: 0, black: 0 },
              queen: { status: 'board', pendingColor: null, coveredBy: null },
            })
          : null;

      // Host places striker on white baseline before seed
      if (isCarrom && youColor === 'white') {
        resetCueToBaseline({ seat: 'you', x: W / 2 });
        seedState.balls = snapshotBalls();
      }

      const joined = joinLive(
        shell,
        chat,
        spec.id,
        (val) => {
          if (!val || ended) return;
          if (val.status === 'forfeit' || val.status === 'over') {
            const iWon = val.winner === liveRoles.me;
            if (isCarrom && val.state) {
              applying = true;
              if (val.state.balls) applySnapshot(val.state.balls, null, val.turn);
              if (val.state.queen) applyQueenAbsolute(val.state.queen);
              applying = false;
            } else if (val.status === 'over' && val.state && val.state.scores) {
              const sc = val.state.scores;
              youPocketed = liveRoles.me === liveRoles.playerA ? sc.a | 0 : sc.b | 0;
              oppPocketed = liveRoles.me === liveRoles.playerA ? sc.b | 0 : sc.a | 0;
              updateHud();
            }
            applying = true;
            finish(iWon, { skipLivePush: true });
            applying = false;
            return;
          }
          if (isCarrom) {
            applyCarromLiveVal(val);
            liveSeeded = !!(val.state && val.state.balls && val.state.balls.length);
            return;
          }
          const st = val.state || {};
          const ver = Number(val.version != null ? val.version : val.seq) || 0;
          if (ver < seq) return;
          if (st.balls && Array.isArray(st.balls)) {
            applying = true;
            seq = ver;
            applySnapshot(st.balls, st.scores, val.turn);
            applying = false;
          }
        },
        seedState
      );
      if (joined) {
        liveHandle = joined.handle;
        liveRoles = joined.roles;
        myTurn = isCarrom ? youColor === 'white' && !!liveRoles.host : !!liveRoles.host;
        if (isCarrom) {
          if (youColor === 'white') {
            resetCueToBaseline({ seat: 'you', x: W / 2 });
            hint.textContent = 'Your break — drag back on the striker.';
            myTurn = true;
            // Ensure deal snap is published (join seed + explicit push for turn)
            liveHandle.push({
              baseVersion: 0,
              status: 'playing',
              turn: liveRoles.me,
              state: buildCarromState({
                phase: 'deal',
                breakDone: false,
                hint: 'Host breaks — White.',
              }),
            });
            liveSeeded = true;
          } else {
            myTurn = false;
            hint.textContent = 'Waiting for board… White breaks.';
          }
          updateHud();
        } else {
          hint.textContent = myTurn ? 'Your shot.' : 'Waiting for opponent…';
          if (liveRoles.host) {
            liveHandle.push({
              status: 'playing',
              turn: liveRoles.me,
              state: { balls: snapshotBalls(), scores: { a: 0, b: 0 }, phase: 'deal' },
            });
          }
        }
      } else if (isCarrom) {
        if (typeof showToast === 'function') showToast('Couldn’t join Live — opening Practice');
        // Keep board playable solo without AI live path
        myTurn = true;
        resetCueToBaseline({ seat: 'you' });
        hint.textContent = 'Your shot (Practice fallback).';
      }
    }

    // Place striker for breaker; AI opens if needed (Practice only)
    if (isCarrom && !liveOn) {
      resetCueToBaseline({ seat: breaker, x: W / 2 });
      updateHud();
      if (breaker === 'opp') scheduleAiTurn();
    }

    raf = requestAnimationFrame(loop);
    } // bootBoard
  }

  function drawCarromBoard(ctx2d, W, H, opts) {
    const o = opts || {};
    const pockets = o.pockets || [];
    const pocketR = o.pocketR || 22;
    const by = o.baselineY != null ? o.baselineY : H * 0.82;
    // Outer wood rail
    const wood = ctx2d.createLinearGradient(0, 0, W, H);
    wood.addColorStop(0, '#6d4c41');
    wood.addColorStop(0.5, '#5d4037');
    wood.addColorStop(1, '#4e342e');
    ctx2d.fillStyle = wood;
    ctx2d.fillRect(0, 0, W, H);
    const m = Math.min(W, H) * 0.055;
    // Felt
    const felt = ctx2d.createRadialGradient(W * 0.5, H * 0.42, 10, W * 0.5, H * 0.45, Math.max(W, H) * 0.7);
    felt.addColorStop(0, '#dbc3a3');
    felt.addColorStop(1, '#c4a574');
    ctx2d.fillStyle = felt;
    ctx2d.fillRect(m, m, W - 2 * m, H - 2 * m);
    // Inner rail shadow
    ctx2d.strokeStyle = 'rgba(40,25,15,.35)';
    ctx2d.lineWidth = 3;
    ctx2d.strokeRect(m + 1, m + 1, W - 2 * m - 2, H - 2 * m - 2);
    // Center circle + cross guides
    const cx = W / 2;
    const cy = H * 0.42;
    ctx2d.strokeStyle = 'rgba(80,50,20,.4)';
    ctx2d.lineWidth = 1.5;
    ctx2d.beginPath();
    ctx2d.arc(cx, cy, Math.min(W, H) * 0.11, 0, Math.PI * 2);
    ctx2d.stroke();
    ctx2d.beginPath();
    ctx2d.arc(cx, cy, Math.min(W, H) * 0.028, 0, Math.PI * 2);
    ctx2d.stroke();
    // Baselines (near / far)
    ctx2d.strokeStyle = 'rgba(80,50,20,.45)';
    ctx2d.lineWidth = 2;
    [by, H - by].forEach((y) => {
      ctx2d.beginPath();
      ctx2d.moveTo(W * 0.18, y);
      ctx2d.lineTo(W * 0.82, y);
      ctx2d.stroke();
    });
    // Corner pockets
    pockets.forEach((p) => {
      const px = p[0] * W;
      const py = p[1] * H;
      ctx2d.beginPath();
      ctx2d.arc(px, py, pocketR, 0, Math.PI * 2);
      ctx2d.fillStyle = '#1a120c';
      ctx2d.fill();
      ctx2d.strokeStyle = 'rgba(255,220,180,.25)';
      ctx2d.lineWidth = 2;
      ctx2d.stroke();
    });
  }

  function makeCarromBalls(W, H, sizes) {
    const coinR = (sizes && sizes.ballR) || 8;
    const strikerR = (sizes && sizes.cueR) || 13;
    const cx = W / 2;
    const cy = H * 0.42;
    const list = [];
    // Queen center
    list.push({ x: cx, y: cy, vx: 0, vy: 0, color: '#c62828', kind: 'queen', r: coinR });
    // 18 men: ring of 6 + ring of 12, alternating white/black
    let idx = 0;
    for (let ring = 1; ring <= 2; ring++) {
      const n = ring === 1 ? 6 : 12;
      const rad = ring === 1 ? coinR * 2.2 : coinR * 4.35;
      const rot = ring === 2 ? Math.PI / n : 0;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2 + rot;
        const black = idx % 2 === 1;
        idx++;
        list.push({
          x: cx + Math.cos(ang) * rad,
          y: cy + Math.sin(ang) * rad,
          vx: 0,
          vy: 0,
          color: black ? '#212121' : '#fff8e1',
          kind: black ? 'black' : 'white',
          r: coinR,
        });
      }
    }
    list.push({
      x: W / 2,
      y: H * 0.82,
      vx: 0,
      vy: 0,
      cue: true,
      color: '#eceff1',
      kind: 'striker',
      r: strikerR,
    });
    return list;
  }

  function openCarrom(ctx) {
    const o = ctx && ctx.youColor ? ctx : { chat: ctx };
    openCueGame({
      id: 'carrom',
      variant: 'carrom',
      title: 'Carrom',
      subtitle: 'Practice · AI',
      chat: o.chat != null ? o.chat : ctx,
      accent: '#8D6E63',
      bg: '#1A0F00',
      felt: '#c4a574',
      glyph: '🪙',
      ballR: 8,
      cueR: 13,
      pocketR: 22,
      friction: 0.981,
      wallRest: 0.72,
      stopEps: 0.055,
      baselineY: 0.82,
      soloPractice: true,
      coachKey: 'chaupaal_carrom_coach_v4',
      youColor: o.youColor,
      difficulty: o.difficulty,
      breakerPick: o.breakerPick,
      skipSheet: !!o.skipSheet,
      pockets: [
        [0.055, 0.055],
        [0.945, 0.055],
        [0.055, 0.945],
        [0.945, 0.945],
      ],
      drawBoard: drawCarromBoard,
      makeBalls: makeCarromBalls,
    });
  }

  function openPool(ctx) {
    openCueGame({
      id: 'pool',
      variant: 'pool',
      title: 'Pool',
      subtitle: 'Clear the table',
      chat: ctx,
      accent: '#1B3A2D',
      bg: '#0A1A10',
      felt: '#1b5e20',
      glyph: '🎱',
      ballR: 9,
      cueR: 10,
      pocketR: 16,
      pockets: [
        [0.06, 0.06],
        [0.5, 0.04],
        [0.94, 0.06],
        [0.06, 0.94],
        [0.5, 0.96],
        [0.94, 0.94],
      ],
      makeBalls(W, H, sizes) {
        const r = (sizes && sizes.ballR) || 9;
        const cr = (sizes && sizes.cueR) || 10;
        const colors = ['#f44336', '#ffeb3b', '#2196f3', '#4caf50', '#ff9800', '#9c27b0', '#111'];
        const list = [{ x: W / 2, y: H * 0.84, vx: 0, vy: 0, cue: true, color: '#fafafa', r: cr }];
        colors.forEach((color, i) => {
          list.push({
            x: W / 2 - 22 + (i % 3) * 22,
            y: H * 0.28 + Math.floor(i / 3) * 22,
            vx: 0,
            vy: 0,
            color,
            r,
          });
        });
        return list;
      },
    });
  }

  /* ---------- Rummy ---------- */
  function isRun(cards) {
    if (cards.length < 3) return false;
    const suit = cards[0].s;
    if (!cards.every((c) => c.s === suit)) return false;
    const vs = cards.map((c) => rankVal(c.r)).sort((a, b) => a - b);
    for (let i = 1; i < vs.length; i++) if (vs[i] !== vs[i - 1] + 1) return false;
    return true;
  }
  function isSet(cards) {
    if (cards.length < 3) return false;
    return cards.every((c) => c.r === cards[0].r);
  }
  function rummyOk(hand) {
    const used = new Set();
    let melded = 0;
    const tryMeld = (pred) => {
      for (let i = 0; i < hand.length; i++) {
        for (let j = i + 1; j < hand.length; j++) {
          for (let k = j + 1; k < hand.length; k++) {
            const trio = [hand[i], hand[j], hand[k]];
            if (trio.some((c) => used.has(c.id))) continue;
            if (!pred(trio)) continue;
            trio.forEach((c) => used.add(c.id));
            melded += 3;
          }
        }
      }
    };
    tryMeld(isRun);
    tryMeld(isSet);
    return melded >= 9;
  }

  function openRummy() {
    const chat = resolveChat(arguments[0]);
    const liveOn = chatLiveOn(chat);
    const rng = rngFn();
    const shell = openShell({
      id: 'rummy',
      title: 'Rummy',
      subtitle: liveOn ? liveSub() : practiceSub('Meld runs and sets'),
      mode: liveOn ? 'live' : 'practice',
      live: liveOn,
      chat,
      accent: '#6A1B9A',
      bg: '#100018',
    });
    if (!shell) return;

    let deck = makeDeck(rng);
    let handA = [];
    let handB = [];
    let discard = [];
    let drawn = null;
    let myTurn = true;
    let applying = false;
    let liveRoles = null;
    let liveHandle = null;
    let ended = false;

    function myHand() {
      if (!liveOn || !liveRoles) return handA;
      return liveRoles.me === liveRoles.playerA ? handA : handB;
    }
    function setMyHand(h) {
      if (!liveOn || !liveRoles) {
        handA = h;
        return;
      }
      if (liveRoles.me === liveRoles.playerA) handA = h;
      else handB = h;
    }
    function oppHandCount() {
      if (!liveOn || !liveRoles) return handB.length;
      return liveRoles.me === liveRoles.playerA ? handB.length : handA.length;
    }

    function pushState(extra) {
      if (!liveOn || !liveHandle || !liveRoles || applying) return;
      liveHandle.push(
        Object.assign(
          {
            status: 'playing',
            turn: myTurn ? liveRoles.me : liveRoles.opp,
            state: {
              handA,
              handB,
              discard,
              deck,
              deckCount: deck.length,
              drawn: !!drawn,
              drawnId: drawn ? drawn.id : null,
            },
          },
          extra || {}
        )
      );
    }

    function paint(msg) {
      if (ended || !shell.alive()) return;
      const you = myHand();
      const top = discard[discard.length - 1];
      shell.body.innerHTML = `
        <div class="pc-rummy">
          <p class="pc-hint">${esc(msg || (liveOn && !myTurn ? 'Opponent’s turn…' : 'Draw, then discard. Declare when you have melds.'))}</p>
          <p class="pc-hint">Opp hand ${oppHandCount()} · deck ${deck.length}</p>
          <div class="pc-row"><span>Discard</span>${top ? cardFace(top) : '—'}</div>
          <div class="pc-hand">${you.map(cardFace).join('')}</div>
          <div class="pc-actions">
            <button type="button" class="cs-hit" data-draw ${!myTurn || drawn ? 'disabled' : ''}>Draw</button>
            <button type="button" class="cs-hit" data-take ${!myTurn || drawn || !discard.length ? 'disabled' : ''}>Take discard</button>
            <button type="button" class="cs-hit" data-declare ${!myTurn ? 'disabled' : ''}>Declare</button>
          </div>
        </div>`;
      shell.body.querySelectorAll('.pc-card').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (!myTurn || ended) return;
          const id = btn.dataset.cid;
          const hand = myHand().slice();
          const ix = hand.findIndex((c) => c.id === id);
          if (ix < 0) return;
          if (hand.length < 14 && !drawn) {
            buzz('invalid');
            return;
          }
          discard.push(hand.splice(ix, 1)[0]);
          setMyHand(hand);
          drawn = null;
          buzz('card');
          myTurn = false;
          if (liveOn) {
            pushState({ turn: liveRoles.opp });
            if (typeof DangalLive !== 'undefined' && DangalLive.pingTurn) {
              DangalLive.pingTurn(liveRoles.opp, 'rummy', { chatId: chat && (chat.firestoreId || chat.id) });
            }
            paint('Discarded. Waiting…');
            return;
          }
          aiPlay();
          myTurn = true;
          paint('Discarded. Opponent played.');
        });
      });
      shell.body.querySelector('[data-draw]')?.addEventListener('click', () => {
        if (!myTurn || drawn || !deck.length) return;
        drawn = deck.pop();
        const hand = myHand();
        hand.push(drawn);
        setMyHand(hand);
        buzz('card');
        if (liveOn) pushState();
        paint('Drawn — tap a card to discard.');
      });
      shell.body.querySelector('[data-take]')?.addEventListener('click', () => {
        if (!myTurn || drawn || !discard.length) return;
        drawn = discard.pop();
        const hand = myHand();
        hand.push(drawn);
        setMyHand(hand);
        buzz('card');
        if (liveOn) pushState();
        paint('Took discard — tap a card to discard.');
      });
      shell.body.querySelector('[data-declare]')?.addEventListener('click', () => {
        if (!myTurn) return;
        const ok = rummyOk(myHand());
        ended = true;
        if (liveOn && liveHandle) {
          liveHandle.push({
            status: 'over',
            winner: ok ? liveRoles.me : liveRoles.opp,
            state: { handA, handB, discard, deck, declared: true, valid: ok },
          });
        }
        showDuelResult(shell, {
          id: 'rummy',
          you: ok ? 1 : 0,
          opp: ok ? 0 : 1,
          glyph: '🃏',
          title: ok ? 'Valid declare' : 'Invalid declare',
          subtitle: ok ? 'Melds accepted.' : 'Need runs and sets covering most of the hand.',
          shareText: 'Rummy on Chaupaal',
          onAgain: () => openRummy(chat),
        });
      });
    }

    function aiPlay() {
      if (deck.length) handB.push(deck.pop());
      handB.sort((a, b) => rankVal(a.r) - rankVal(b.r));
      if (handB.length) discard.push(handB.pop());
    }

    function hydrate(st, turn) {
      if (!st) return;
      if (st.handA) handA = st.handA;
      if (st.handB) handB = st.handB;
      if (st.discard) discard = st.discard;
      if (st.deck) deck = st.deck;
      drawn = null;
      if (st.drawn && st.drawnId) {
        const h = myHand();
        drawn = h.find((c) => c.id === st.drawnId) || null;
      }
      myTurn = turn === liveRoles.me;
    }

    if (liveOn) {
      const joined = joinLive(shell, chat, 'rummy', (val) => {
        if (!val || ended) return;
        if (val.status === 'forfeit' || val.status === 'over') {
          const iWon = val.winner === liveRoles.me;
          ended = true;
          showDuelResult(shell, {
            id: 'rummy',
            you: iWon ? 1 : 0,
            opp: iWon ? 0 : 1,
            glyph: '🃏',
            title: val.status === 'forfeit' ? (iWon ? 'Opponent left' : 'You forfeited') : iWon ? 'You win' : 'Opponent wins',
            shareText: 'Rummy on Chaupaal',
            onAgain: () => openRummy(chat),
          });
          return;
        }
        applying = true;
        hydrate(val.state, val.turn);
        applying = false;
        paint();
      });
      if (joined) {
        liveHandle = joined.handle;
        liveRoles = joined.roles;
        if (liveRoles.host) {
          handA = deck.splice(0, 13);
          handB = deck.splice(0, 13);
          discard = [deck.pop()];
          myTurn = true;
          pushState({ turn: liveRoles.me });
          paint();
        } else {
          shell.body.innerHTML = `<p class="pc-hint">Waiting for deal…</p>`;
        }
      }
    } else {
      handA = deck.splice(0, 13);
      handB = deck.splice(0, 13);
      discard = [deck.pop()];
      paint();
    }
  }

  /* ---------- Teen Patti ---------- */
  function isSeqVals(vals) {
    const v = vals.slice().sort((a, b) => a - b);
    if (v[0] === 2 && v[1] === 3 && v[2] === 14) return true;
    return v[1] === v[0] + 1 && v[2] === v[1] + 1;
  }
  function tpScore(cards) {
    const vals = cards.map((c) => rankVal(c.r));
    const flush = cards[0].s === cards[1].s && cards[1].s === cards[2].s;
    const trail = vals[0] === vals[1] && vals[1] === vals[2];
    const seq = isSeqVals(vals);
    const hi = Math.max.apply(null, vals);
    if (trail) return 6000 + hi;
    if (flush && seq) return 5000 + hi;
    if (seq) return 4000 + hi;
    if (flush) return 3000 + hi;
    const pair = vals[0] === vals[1] ? vals[0] : vals[1] === vals[2] ? vals[1] : vals[0] === vals[2] ? vals[0] : 0;
    if (pair) return 2000 + pair;
    return hi;
  }

  function openTeenPatti() {
    const chat = resolveChat(arguments[0]);
    const liveOn = chatLiveOn(chat);
    const rng = rngFn();
    const shell = openShell({
      id: 'teenpatti',
      title: 'Teen Patti',
      subtitle: liveOn ? liveSub() : practiceSub('Best of three cards'),
      mode: liveOn ? 'live' : 'practice',
      live: liveOn,
      chat,
      accent: '#FFD700',
      bg: '#0D0018',
    });
    if (!shell) return;

    let handA = [];
    let handB = [];
    let ended = false;
    let applying = false;
    let liveRoles = null;
    let liveHandle = null;
    let revealed = false;

    function myCards() {
      if (!liveOn || !liveRoles) return handA;
      return liveRoles.me === liveRoles.playerA ? handA : handB;
    }
    function oppCards() {
      if (!liveOn || !liveRoles) return handB;
      return liveRoles.me === liveRoles.playerA ? handB : handA;
    }

    function paint(hidden) {
      if (ended) return;
      const you = myCards();
      const opp = oppCards();
      shell.body.innerHTML = `
        <div class="pc-tp">
          <p class="pc-hint">Opponent</p>
          <div class="pc-hand">${
            hidden
              ? '<span class="pc-card pc-back">?</span><span class="pc-card pc-back">?</span><span class="pc-card pc-back">?</span>'
              : opp.map(cardFace).join('')
          }</div>
          <p class="pc-hint">You</p>
          <div class="pc-hand">${you.map(cardFace).join('')}</div>
          <div class="pc-actions">
            <button type="button" class="cs-hit" data-show>Show</button>
            <button type="button" class="cs-hit" data-fold>Fold</button>
          </div>
        </div>`;
      shell.body.querySelector('[data-show]')?.addEventListener('click', () => doShow());
      shell.body.querySelector('[data-fold]')?.addEventListener('click', () => doFold());
    }

    function finish(youWin, title, fromRemote) {
      if (ended) return;
      ended = true;
      if (liveOn && liveHandle && !fromRemote && !applying) {
        liveHandle.push({
          status: 'over',
          winner: youWin ? liveRoles.me : liveRoles.opp,
          state: { handA, handB, phase: 'over', revealed: true },
        });
      }
      showDuelResult(shell, {
        id: 'teenpatti',
        you: youWin ? 1 : 0,
        opp: youWin ? 0 : 1,
        glyph: '♠',
        title: title || (youWin ? 'You win' : 'Opponent wins'),
        shareText: 'Teen Patti on Chaupaal',
        onAgain: () => openTeenPatti(chat),
      });
    }

    function doShow() {
      if (ended) return;
      revealed = true;
      const ys = tpScore(myCards());
      const as = tpScore(oppCards());
      paint(false);
      if (liveOn && liveHandle) {
        liveHandle.push({
          status: 'over',
          winner: ys >= as ? liveRoles.me : liveRoles.opp,
          state: { handA, handB, phase: 'show', revealed: true, scores: { you: ys, opp: as } },
        });
      }
      ended = true;
      showDuelResult(shell, {
        id: 'teenpatti',
        you: ys >= as ? 1 : 0,
        opp: as >= ys ? 1 : 0,
        glyph: '♠',
        title: ys > as ? 'You win the show' : ys === as ? 'Split' : 'Opponent wins',
        shareText: 'Teen Patti on Chaupaal',
        onAgain: () => openTeenPatti(chat),
      });
    }

    function doFold() {
      finish(false, 'Folded');
    }

    if (liveOn) {
      const joined = joinLive(shell, chat, 'teenpatti', (val) => {
        if (!val || ended) return;
        if (val.status === 'forfeit' || val.status === 'over') {
          applying = true;
          const st = val.state || {};
          if (st.handA) handA = st.handA;
          if (st.handB) handB = st.handB;
          if (st.phase === 'show' || st.revealed) paint(false);
          const iWon = val.winner === liveRoles.me;
          finish(iWon, val.status === 'forfeit' ? (iWon ? 'Opponent left' : 'You forfeited') : undefined, true);
          applying = false;
          return;
        }
        const st = val.state || {};
        if (st.handA && st.handB && !handA.length) {
          handA = st.handA;
          handB = st.handB;
          paint(true);
        }
      });
      if (joined) {
        liveHandle = joined.handle;
        liveRoles = joined.roles;
        if (liveRoles.host) {
          const deck = makeDeck(rng);
          handA = deck.splice(0, 3);
          handB = deck.splice(0, 3);
          liveHandle.push({
            status: 'playing',
            turn: liveRoles.me,
            state: { handA, handB, phase: 'dealt' },
          });
          paint(true);
        } else {
          shell.body.innerHTML = `<p class="pc-hint">Waiting for deal…</p>`;
        }
      }
    } else {
      const deck = makeDeck(rng);
      handA = deck.splice(0, 3);
      handB = deck.splice(0, 3);
      paint(true);
    }
  }

  /* ---------- Bluff ---------- */
  function openBluff() {
    const chat = resolveChat(arguments[0]);
    const liveOn = chatLiveOn(chat);
    const rng = rngFn();
    const shell = openShell({
      id: 'bluff',
      title: 'Bluff',
      subtitle: liveOn ? liveSub() : practiceSub('Play face-down · get called'),
      mode: liveOn ? 'live' : 'practice',
      live: liveOn,
      chat,
      accent: '#FF1744',
      bg: '#0A0E10',
    });
    if (!shell) return;
    let claimRank = 'A';
    let livesA = 3;
    let livesB = 3;
    let handA = makeDeck(rng).splice(0, 8);
    let handB = makeDeck(rng).splice(0, 8);
    let myTurn = true;
    let ended = false;
    let applying = false;
    let liveRoles = null;
    let liveHandle = null;

    function myLives() {
      if (!liveOn || !liveRoles) return livesA;
      return liveRoles.me === liveRoles.playerA ? livesA : livesB;
    }
    function oppLives() {
      if (!liveOn || !liveRoles) return livesB;
      return liveRoles.me === liveRoles.playerA ? livesB : livesA;
    }
    function myHand() {
      if (!liveOn || !liveRoles) return handA;
      return liveRoles.me === liveRoles.playerA ? handA : handB;
    }
    function setMyHand(h) {
      if (!liveOn || !liveRoles) {
        handA = h;
        return;
      }
      if (liveRoles.me === liveRoles.playerA) handA = h;
      else handB = h;
    }
    function setLives(meDelta, oppDelta) {
      if (!liveOn || !liveRoles) {
        livesA += meDelta;
        livesB += oppDelta;
        return;
      }
      if (liveRoles.me === liveRoles.playerA) {
        livesA += meDelta;
        livesB += oppDelta;
      } else {
        livesB += meDelta;
        livesA += oppDelta;
      }
    }

    function pushAll(extra) {
      if (!liveOn || !liveHandle || applying) return;
      liveHandle.push(
        Object.assign(
          {
            status: 'playing',
            turn: myTurn ? liveRoles.me : liveRoles.opp,
            state: { handA, handB, livesA, livesB },
          },
          extra || {}
        )
      );
    }

    function paint(msg) {
      if (ended) return;
      const you = myHand();
      shell.body.innerHTML = `
        <div class="pc-bluff">
          <p class="pc-hint">Lives ${myLives()} · opponent ${oppLives()}${liveOn && !myTurn ? ' · waiting' : ''}</p>
          <p class="pc-hint">${esc(msg || 'Select 1–3 cards and a claimed rank.')}</p>
          <div class="pc-hand">${you.map(cardFace).join('')}</div>
          <label class="pc-hint">Claim
            <select data-rank ${!myTurn ? 'disabled' : ''}>${RANKS.map((r) => `<option>${r}</option>`).join('')}</select>
          </label>
          <button type="button" class="cs-hit" data-play ${!myTurn ? 'disabled' : ''}>Play selected</button>
          ${
            liveOn
              ? `<button type="button" class="cs-hit" data-call ${myTurn ? 'disabled' : ''}>Call bluff</button>`
              : ''
          }
        </div>`;
      const rankEl = shell.body.querySelector('[data-rank]');
      if (rankEl) rankEl.value = claimRank;
      const selected = new Set();
      shell.body.querySelectorAll('.pc-card').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (!myTurn) return;
          if (selected.has(btn.dataset.cid)) {
            selected.delete(btn.dataset.cid);
            btn.classList.remove('is-sel');
          } else if (selected.size < 3) {
            selected.add(btn.dataset.cid);
            btn.classList.add('is-sel');
          }
        });
      });
      shell.body.querySelector('[data-play]')?.addEventListener('click', () => {
        if (!myTurn) return;
        claimRank = shell.body.querySelector('[data-rank]').value;
        if (!selected.size) {
          buzz('invalid');
          return;
        }
        const hand = myHand().slice();
        const played = hand.filter((c) => selected.has(c.id));
        played.forEach((c) => {
          const ix = hand.findIndex((x) => x.id === c.id);
          if (ix >= 0) hand.splice(ix, 1);
        });
        setMyHand(hand);
        const honest = played.every((c) => c.r === claimRank);
        if (liveOn) {
          myTurn = false;
          pushAll({
            turn: liveRoles.opp,
            state: {
              handA,
              handB,
              livesA,
              livesB,
              lastPlay: { uid: liveRoles.me, claim: claimRank, count: played.length, honest, cards: played },
            },
          });
          paint('Played face-down. Opponent may call.');
          return;
        }
        const called = rng() > 0.45;
        if (called) {
          if (honest) {
            setLives(0, -1);
            buzz('win', { noConfetti: true });
            after('Opponent called — you were honest.');
          } else {
            setLives(-1, 0);
            buzz('lose', { noConfetti: true });
            after('Caught bluffing!');
          }
        } else {
          buzz('card');
          after(honest ? 'Passed.' : 'Bluff sailed through.');
        }
      });
      shell.body.querySelector('[data-call]')?.addEventListener('click', () => {
        if (myTurn || !liveHandle) return;
        // Guest/host calling: honesty is in last remote play; host of call uses state from snap — stored locally via last known
        // Re-read from pending lastPlay on next snap; for UX we push a call action
        liveHandle.push({
          status: 'playing',
          turn: liveRoles.opp,
          state: { handA, handB, livesA, livesB, callBy: liveRoles.me },
        });
      });
    }

    function after(msg) {
      if (myLives() <= 0 || oppLives() <= 0 || myHand().length === 0) {
        ended = true;
        const won = myLives() > 0 && (oppLives() <= 0 || myHand().length === 0);
        if (liveOn && liveHandle) {
          liveHandle.push({
            status: 'over',
            winner: won ? liveRoles.me : liveRoles.opp,
            state: { handA, handB, livesA, livesB },
          });
        }
        showDuelResult(shell, {
          id: 'bluff',
          you: won ? 1 : 0,
          opp: won ? 0 : 1,
          glyph: '🎭',
          subtitle: msg,
          shareText: 'Bluff on Chaupaal',
          onAgain: () => openBluff(chat),
        });
        return;
      }
      paint(msg);
    }

    if (liveOn) {
      let lastPlay = null;
      const joined = joinLive(shell, chat, 'bluff', (val) => {
        if (!val || ended) return;
        if (val.status === 'forfeit' || val.status === 'over') {
          const iWon = val.winner === liveRoles.me;
          ended = true;
          showDuelResult(shell, {
            id: 'bluff',
            you: iWon ? 1 : 0,
            opp: iWon ? 0 : 1,
            glyph: '🎭',
            title: val.status === 'forfeit' ? (iWon ? 'Opponent left' : 'You forfeited') : iWon ? 'You win' : 'You lose',
            shareText: 'Bluff on Chaupaal',
            onAgain: () => openBluff(chat),
          });
          return;
        }
        const st = val.state || {};
        applying = true;
        if (st.handA) handA = st.handA;
        if (st.handB) handB = st.handB;
        if (st.livesA != null) livesA = st.livesA;
        if (st.livesB != null) livesB = st.livesB;
        if (st.lastPlay) lastPlay = st.lastPlay;
        if (st.callBy && lastPlay && st.callBy !== lastPlay.uid && !st.callResolved) {
          const callerIsMe = st.callBy === liveRoles.me;
          const wasHonest = !!lastPlay.honest;
          if (wasHonest) {
            if (callerIsMe) setLives(-1, 0);
            else setLives(0, -1);
          } else {
            if (callerIsMe) setLives(0, -1);
            else setLives(-1, 0);
          }
          lastPlay = null;
          myTurn = true;
          if (liveRoles.host) {
            pushAll({
              turn: liveRoles.me === liveRoles.playerA ? liveRoles.playerB : liveRoles.playerA,
              state: { handA, handB, livesA, livesB, lastPlay: null, callResolved: true },
            });
          }
          after(wasHonest ? 'False call — caller loses a life.' : 'Bluff caught!');
          applying = false;
          return;
        }
        myTurn = val.turn === liveRoles.me;
        applying = false;
        paint();
      });
      if (joined) {
        liveHandle = joined.handle;
        liveRoles = joined.roles;
        if (liveRoles.host) {
          const deck = makeDeck(rng);
          handA = deck.splice(0, 8);
          handB = deck.splice(0, 8);
          myTurn = true;
          pushAll({ turn: liveRoles.me });
          paint();
        } else {
          shell.body.innerHTML = `<p class="pc-hint">Waiting for deal…</p>`;
        }
      }
    } else {
      handA = makeDeck(rng).splice(0, 8);
      handB = [];
      livesA = 3;
      livesB = 3;
      paint();
    }
  }

  /* ---------- Satte pe Satta ---------- */
  function openSatte() {
    const chat = resolveChat(arguments[0]);
    const liveOn = chatLiveOn(chat);
    const rng = rngFn();
    const deck = makeDeck(rng);
    let handA = deck.splice(0, 8);
    let handB = deck.splice(0, 8);
    const table = { '♠': { lo: 7, hi: 7 }, '♥': { lo: 7, hi: 7 }, '♦': { lo: 7, hi: 7 }, '♣': { lo: 7, hi: 7 } };
    const shell = openShell({
      id: 'sattepe',
      title: 'Satte pe Satta',
      subtitle: liveOn ? liveSub() : practiceSub('Build off the sevens'),
      mode: liveOn ? 'live' : 'practice',
      live: liveOn,
      chat,
      accent: '#FFD600',
      bg: '#000A1A',
    });
    if (!shell) return;
    let myTurn = true;
    let ended = false;
    let applying = false;
    let liveRoles = null;
    let liveHandle = null;

    function myHand() {
      if (!liveOn || !liveRoles) return handA;
      return liveRoles.me === liveRoles.playerA ? handA : handB;
    }
    function setMyHand(h) {
      if (!liveOn || !liveRoles) {
        handA = h;
        return;
      }
      if (liveRoles.me === liveRoles.playerA) handA = h;
      else handB = h;
    }
    function canPlay(c) {
      const t = table[c.s];
      const v = rankVal(c.r);
      return v === t.lo - 1 || v === t.hi + 1 || c.r === '7';
    }
    function apply(c) {
      const t = table[c.s];
      const v = rankVal(c.r);
      if (c.r === '7') return;
      if (v === t.lo - 1) t.lo = v;
      if (v === t.hi + 1) t.hi = v;
    }

    function pushState(extra) {
      if (!liveOn || !liveHandle || applying) return;
      liveHandle.push(
        Object.assign(
          {
            status: 'playing',
            turn: myTurn ? liveRoles.me : liveRoles.opp,
            state: { handA, handB, table },
          },
          extra || {}
        )
      );
    }

    function paint(msg) {
      if (ended) return;
      const you = myHand();
      shell.body.innerHTML = `
        <div class="pc-satte">
          <p class="pc-hint">${esc(msg || (liveOn && !myTurn ? 'Opponent’s turn…' : 'Play a card next to a seven chain.'))}</p>
          <div class="pc-sevens">${SUITS.map((s) => `<span>${s} ${table[s].lo}–${table[s].hi}</span>`).join('')}</div>
          <div class="pc-hand">${you.map(cardFace).join('')}</div>
        </div>`;
      shell.body.querySelectorAll('.pc-card').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (!myTurn || ended) return;
          const hand = myHand().slice();
          const c = hand.find((x) => x.id === btn.dataset.cid);
          if (!c || !canPlay(c)) {
            buzz('invalid');
            return;
          }
          hand.splice(hand.indexOf(c), 1);
          setMyHand(hand);
          apply(c);
          buzz('card');
          if (!hand.length) {
            ended = true;
            if (liveOn && liveHandle) {
              liveHandle.push({ status: 'over', winner: liveRoles.me, state: { handA, handB, table } });
            }
            showDuelResult(shell, {
              id: 'sattepe',
              you: 1,
              opp: 0,
              glyph: '7️⃣',
              shareText: 'Satte pe Satta on Chaupaal',
              onAgain: () => openSatte(chat),
            });
            return;
          }
          if (liveOn) {
            myTurn = false;
            pushState({ turn: liveRoles.opp });
            paint('Played ' + c.r + c.s);
            return;
          }
          const playable = handB.filter(canPlay);
          if (playable.length) {
            const pick = playable[0];
            handB.splice(handB.indexOf(pick), 1);
            apply(pick);
          }
          if (!handA.length || !handB.length) {
            ended = true;
            showDuelResult(shell, {
              id: 'sattepe',
              you: handA.length === 0 ? 1 : 0,
              opp: handB.length === 0 && handA.length ? 1 : 0,
              glyph: '7️⃣',
              shareText: 'Satte pe Satta on Chaupaal',
              onAgain: () => openSatte(chat),
            });
            return;
          }
          paint('Played ' + c.r + c.s);
        });
      });
    }

    if (liveOn) {
      const joined = joinLive(shell, chat, 'sattepe', (val) => {
        if (!val || ended) return;
        if (val.status === 'forfeit' || val.status === 'over') {
          const iWon = val.winner === liveRoles.me;
          ended = true;
          showDuelResult(shell, {
            id: 'sattepe',
            you: iWon ? 1 : 0,
            opp: iWon ? 0 : 1,
            glyph: '7️⃣',
            shareText: 'Satte pe Satta on Chaupaal',
            onAgain: () => openSatte(chat),
          });
          return;
        }
        const st = val.state || {};
        applying = true;
        if (st.handA) handA = st.handA;
        if (st.handB) handB = st.handB;
        if (st.table) Object.assign(table, st.table);
        myTurn = val.turn === liveRoles.me;
        applying = false;
        paint();
      });
      if (joined) {
        liveHandle = joined.handle;
        liveRoles = joined.roles;
        if (liveRoles.host) {
          SUITS.forEach((s) => {
            table[s] = { lo: 7, hi: 7 };
          });
          myTurn = true;
          pushState({ turn: liveRoles.me });
          paint('Sevens are live. Empty your hand.');
        } else {
          shell.body.innerHTML = `<p class="pc-hint">Waiting for deal…</p>`;
        }
      }
    } else {
      deck.filter((c) => c.r === '7').forEach(apply);
      paint('Sevens are live. Empty your hand.');
    }
  }

  /* ---------- Andar Bahar ---------- */
  function openAndarBahar() {
    const chat = resolveChat(arguments[0]);
    const liveOn = chatLiveOn(chat);
    const rng = rngFn();
    let deck = makeDeck(rng);
    let joker = deck.pop();
    const shell = openShell({
      id: 'andarbaahar',
      title: 'Andar Bahar',
      subtitle: liveOn ? liveSub() : practiceSub('Pick a side · match the joker'),
      mode: liveOn ? 'live' : 'practice',
      live: liveOn,
      chat,
      accent: '#FF6B35',
      bg: '#001A00',
    });
    if (!shell) return;
    let side = null;
    let sideA = null;
    let sideB = null;
    const andar = [];
    const bahar = [];
    let ended = false;
    let applying = false;
    let liveRoles = null;
    let liveHandle = null;

    function mySide() {
      if (!liveOn || !liveRoles) return side;
      return liveRoles.me === liveRoles.playerA ? sideA : sideB;
    }

    function paint(msg) {
      if (ended) return;
      const pick = mySide();
      shell.body.innerHTML = `
        <div class="pc-ab">
          <p class="pc-hint">Joker ${esc(joker.r + joker.s)}</p>
          <p class="pc-hint">${esc(msg || (pick ? 'Dealing…' : 'Andar or Bahar?'))}</p>
          <div class="pc-ab-cols">
            <div><h4>Andar (${andar.length})</h4>${andar.slice(-3).map(cardFace).join('')}</div>
            <div><h4>Bahar (${bahar.length})</h4>${bahar.slice(-3).map(cardFace).join('')}</div>
          </div>
          ${
            pick
              ? ''
              : `<div class="pc-actions"><button type="button" class="cs-hit" data-a>Andar</button><button type="button" class="cs-hit" data-b>Bahar</button></div>`
          }
        </div>`;
      shell.body.querySelector('[data-a]')?.addEventListener('click', () => start('andar'));
      shell.body.querySelector('[data-b]')?.addEventListener('click', () => start('bahar'));
    }

    function finish(lane, fromRemote) {
      if (ended) return;
      ended = true;
      const pick = mySide();
      const won = lane === pick;
      if (liveOn && liveHandle && !fromRemote && !applying) {
        liveHandle.push({
          status: 'over',
          winner: won ? liveRoles.me : liveRoles.opp,
          state: { joker, andar, bahar, lane, sideA, sideB, deck },
        });
      }
      showDuelResult(shell, {
        id: 'andarbaahar',
        you: won ? 1 : 0,
        opp: won ? 0 : 1,
        glyph: '🃏',
        subtitle: 'Joker hit ' + lane,
        shareText: 'Andar Bahar on Chaupaal',
        onAgain: () => openAndarBahar(chat),
      });
    }

    function startDeal() {
      let n = 0;
      const deal = () => {
        if (!shell.alive() || ended || !deck.length) return finish('bahar');
        const c = deck.pop();
        const lane = n % 2 === 0 ? 'andar' : 'bahar';
        (lane === 'andar' ? andar : bahar).push(c);
        n += 1;
        paint('Dealing…');
        if (liveOn && liveHandle && liveRoles && liveRoles.host) {
          liveHandle.push({
            status: 'playing',
            state: { joker, andar, bahar, sideA, sideB, deck, n },
          });
        }
        if (c.r === joker.r) {
          finish(lane);
          return;
        }
        shell.gs && shell.gs.schedule ? shell.gs.schedule(deal, 280) : setTimeout(deal, 280);
      };
      deal();
    }

    function start(pick) {
      if (liveOn && liveRoles) {
        if (liveRoles.me === liveRoles.playerA) sideA = pick;
        else sideB = pick;
        side = pick;
        buzz('card');
        if (liveHandle) {
          liveHandle.push({
            status: 'playing',
            state: { joker, andar, bahar, sideA, sideB, deck, picking: true },
          });
        }
        // Host starts deal once both sides chosen
        if (liveRoles.host && sideA && sideB) startDeal();
        else if (!liveRoles.host) paint('Locked in — waiting…');
        else paint('Waiting for opponent’s pick…');
        return;
      }
      side = pick;
      sideA = pick;
      buzz('card');
      startDeal();
    }

    if (liveOn) {
      const joined = joinLive(shell, chat, 'andarbaahar', (val) => {
        if (!val || ended) return;
        if (val.status === 'forfeit' || val.status === 'over') {
          const st = val.state || {};
          applying = true;
          if (st.lane) finish(st.lane, true);
          else {
            const iWon = val.winner === liveRoles.me;
            ended = true;
            showDuelResult(shell, {
              id: 'andarbaahar',
              you: iWon ? 1 : 0,
              opp: iWon ? 0 : 1,
              glyph: '🃏',
              shareText: 'Andar Bahar on Chaupaal',
              onAgain: () => openAndarBahar(chat),
            });
          }
          applying = false;
          return;
        }
        const st = val.state || {};
        applying = true;
        if (st.joker) joker = st.joker;
        if (st.deck) deck = st.deck;
        if (st.andar) {
          andar.length = 0;
          st.andar.forEach((c) => andar.push(c));
        }
        if (st.bahar) {
          bahar.length = 0;
          st.bahar.forEach((c) => bahar.push(c));
        }
        if (st.sideA) sideA = st.sideA;
        if (st.sideB) sideB = st.sideB;
        applying = false;
        if (!liveRoles.host && sideA && sideB && !andar.length && !bahar.length) {
          // guest waits for host deal snaps
          paint('Dealing…');
        } else {
          paint(mySide() ? 'Dealing…' : 'Andar or Bahar?');
        }
        if (liveRoles.host && sideA && sideB && !andar.length && !bahar.length && st.picking) {
          startDeal();
        }
      });
      if (joined) {
        liveHandle = joined.handle;
        liveRoles = joined.roles;
        if (liveRoles.host) {
          liveHandle.push({
            status: 'playing',
            state: { joker, deck, andar: [], bahar: [], sideA: null, sideB: null },
          });
        }
        paint();
      }
    } else {
      paint();
    }
  }

  if (typeof registerGame === 'function') {
    const games = [
      { id: 'tambola', name: 'Tambola', desc: 'Ticket · full house', icon: '🎱', genre: 'party', launch: openTambola, order: 30 },
      { id: 'carrom', name: 'Carrom', desc: 'Live 1v1 · Practice AI', icon: '🪙', genre: 'board', launch: openCarrom, order: 31 },
      { id: 'pool', name: 'Pool', desc: 'Clear the felt', icon: '🎱', genre: 'board', launch: openPool, order: 32 },
      { id: 'rummy', name: 'Rummy', desc: 'Runs and sets', icon: '🃏', genre: 'party', launch: openRummy, order: 33 },
      { id: 'teenpatti', name: 'Teen Patti', desc: 'Three-card show', icon: '♠', genre: 'party', launch: openTeenPatti, order: 34 },
      { id: 'bluff', name: 'Bluff', desc: 'Play face-down', icon: '🎭', genre: 'party', launch: openBluff, order: 35 },
      { id: 'sattepe', name: 'Satte pe Satta', desc: 'Build off sevens', icon: '7️⃣', genre: 'party', launch: openSatte, order: 36 },
      { id: 'andarbaahar', name: 'Andar Bahar', desc: 'Pick a side', icon: '🃏', genre: 'party', launch: openAndarBahar, order: 37 },
    ];
    games.forEach((g) => {
      registerGame({
        id: g.id,
        name: g.name,
        desc: g.desc,
        icon: g.icon,
        gameType: 'solo',
        genre: g.genre,
        solo: true,
        selfChat: true,
        dangal: true,
        chat1v1: true,
        order: g.order,
        launch: g.launch,
      });
    });
  }

  window.openTambola = openTambola;
  window.openCarrom = openCarrom;
  window.openPool = openPool;
  window.openRummy = openRummy;
  window.openTeenPatti = openTeenPatti;
  window.openBluff = openBluff;
  window.openSattePeSatta = openSatte;
  window.openAndarBahar = openAndarBahar;
})();
