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

  function joinLive(shell, chat, gameType, onSnap, seedState, extra) {
    if (!chatLiveOn(chat) || typeof DangalLive === 'undefined' || !DangalLive.join) return null;
    const roles = DangalLive.roles(chat);
    if (!roles || !roles.me) return null;
    const x = extra || {};
    const handle = DangalLive.join({
      gameType,
      matchId: matchIdFor(chat, gameType),
      me: roles.me,
      playerA: roles.playerA,
      playerB: roles.playerB,
      state: seedState || null,
      stake: Number(x.stake != null ? x.stake : (window.__dangalLaunchCtx && window.__dangalLaunchCtx.stake)) || 0,
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
        if (typeof x.onForfeit === 'function') {
          try {
            x.onForfeit(info, roles);
          } catch (e) {
            console.warn('[party-classics forfeit]', gameType, e);
          }
          return;
        }
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
    const liveStake = liveOn
      ? Math.max(
          0,
          Number(spec.stake != null ? spec.stake : window.__dangalLaunchCtx && window.__dangalLaunchCtx.stake) || 0
        )
      : 0;
    const settleMatchId = liveOn ? String(matchIdFor(chat, 'carrom') || '').trim() : '';
    let settleOppUid = '';
    let settleDone = false;
    let sessionRecorded = false;
    let leaveTornDown = false;
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
      setChromeSubtitle(
        'Live 1v1 · ' +
          (youColor === 'white' ? 'White' : 'Black') +
          (liveStake > 0 ? ' · Stake ⚡' + liveStake : ' · Friendly')
      );
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
        stake: 0,
      };
    }

    function noteCarromSession(won) {
      if (sessionRecorded) return;
      sessionRecorded = true;
      if (typeof recordDangalSession === 'function') {
        recordDangalSession('carrom', {
          won: !!won,
          score: countPocketed(youColor),
          difficulty: liveOn ? 'live' : difficulty,
          stake: liveStake,
          live: !!liveOn,
        });
      }
    }

    function paintCarromSettle(settle) {
      const el = shell.body.querySelector('#carromChipDelta');
      if (!el || !settle || settle.error) return;
      const delta = Number(settle.chipDelta);
      const bal = settle.chips != null ? Number(settle.chips) : null;
      const parts = [];
      if (Number.isFinite(delta) && (delta !== 0 || liveStake > 0)) {
        parts.push(
          delta === 0
            ? `Virtual chips · balance ${bal != null ? bal : '—'}`
            : `Virtual chips ${delta > 0 ? '+' : ''}${delta}${bal != null ? ` · balance ${bal}` : ''}`
        );
      }
      if (!parts.length && liveOn) parts.push('Settled · virtual chips only — not real money');
      if (!parts.length) return;
      el.hidden = false;
      el.textContent = parts.join(' · ') + ' · not real money';
    }

    async function settleCarromOnce(won) {
      if (!liveOn || settleDone || !window.DangalEconomy || typeof DangalEconomy.reportGameEnd !== 'function') {
        return null;
      }
      if (!settleMatchId) return null;
      settleDone = true;
      try {
        const me = typeof getCurrentUid === 'function' ? getCurrentUid() : '';
        const opp = settleOppUid || (liveRoles && liveRoles.opp) || '';
        const settle = await DangalEconomy.reportGameEnd({
          gameType: 'carrom',
          result: won ? 'win' : 'loss',
          won: !!won,
          isDraw: false,
          matchId: settleMatchId,
          sessionId: settleMatchId,
          opponentUid: opp,
          stake: liveStake,
          winnerUid: won ? me : opp,
        });
        if (settle && settle.error) {
          settleDone = false;
          const el = shell.body.querySelector('#carromChipDelta');
          if (el) {
            el.hidden = false;
            el.innerHTML =
              `Couldn’t update chips <button type="button" id="carromChipRetry" class="game-tap-target" style="margin-left:8px;">Retry</button>`;
            el.querySelector('#carromChipRetry')?.addEventListener('click', () => {
              settleCarromOnce(won);
            });
          }
          if (typeof showToast === 'function') showToast('Couldn’t update chips — tap Retry');
          return settle;
        }
        paintCarromSettle(settle);
        return settle;
      } catch (e) {
        settleDone = false;
        if (typeof showToast === 'function') showToast('Couldn’t update chips — try Retry');
        return null;
      }
    }

    async function tearDownLiveHandle() {
      if (leaveTornDown) return;
      leaveTornDown = true;
      try {
        if (liveHandle) await liveHandle.leave({ forfeit: false });
      } catch (e) {
        try {
          if (liveHandle) liveHandle.leave();
        } catch (e2) {}
      }
      liveHandle = null;
      shell.liveHandle = null;
    }

    async function startCarromLiveRematch(nextStake) {
      const oppUid = settleOppUid || (liveRoles && liveRoles.opp) || '';
      const chatId =
        (window.__dangalLaunchCtx && window.__dangalLaunchCtx.chatId) ||
        (window.currentOpenChat && (window.currentOpenChat.firestoreId || window.currentOpenChat.id)) ||
        (chat && (chat.firestoreId || chat.id)) ||
        '';
      if (!oppUid || (typeof isPersistableUid === 'function' && !isPersistableUid(oppUid))) {
        if (typeof showToast === 'function') showToast('Opponent left — challenge them again from friends');
        if (typeof openFriendPickerSheet === 'function') {
          const f = await openFriendPickerSheet({
            title: 'Challenge · Carrom',
            subtitle: 'Live 1v1 · virtual chips only',
          });
          if (f) {
            await tearDownLiveHandle();
            shell.close('rematch');
            const uid = f.uid || f.id || '';
            const mid =
              typeof dangalMatchId === 'function'
                ? dangalMatchId('carrom', { name: f.name, opponentUid: uid })
                : 'carrom_' + Date.now();
            try {
              window.__dangalLaunchCtx = Object.assign({}, window.__dangalLaunchCtx || {}, {
                gameId: 'carrom',
                gameType: 'carrom',
                matchId: mid,
                mode: 'live',
                opponentUid: uid,
                stake: nextStake,
                source: 'challenge_host',
                chatId: f.chatId || f.firestoreId || '',
                startedAt: Date.now(),
              });
            } catch (e) {}
            if (typeof sendChallengeCard === 'function' && (f.chatId || f.firestoreId)) {
              try {
                await sendChallengeCard(uid, 'carrom', {
                  chatId: f.chatId || f.firestoreId,
                  matchId: mid,
                  stake: nextStake,
                });
              } catch (e) {}
            }
            openCarrom({
              name: f.name,
              id: uid,
              uid,
              peerUid: uid,
              opponentUid: uid,
              dangalMatchId: mid,
              dangalSource: 'challenge_host',
              stake: nextStake,
            });
          }
        }
        return;
      }
      const rematchId =
        typeof dangalMatchId === 'function'
          ? dangalMatchId('carrom', { name: chat.name || 'Friend', opponentUid: oppUid })
          : 'carrom_' + Date.now();
      await tearDownLiveHandle();
      try {
        window.__dangalLaunchCtx = Object.assign({}, window.__dangalLaunchCtx || {}, {
          gameId: 'carrom',
          gameType: 'carrom',
          matchId: rematchId,
          mode: 'live',
          opponentUid: oppUid,
          stake: nextStake,
          source: 'challenge_host',
          chatId,
          startedAt: Date.now(),
        });
      } catch (e) {}
      if (typeof sendChallengeCard === 'function' && oppUid && chatId) {
        try {
          await sendChallengeCard(oppUid, 'carrom', { chatId, matchId: rematchId, stake: nextStake });
          if (typeof showToast === 'function') showToast('Rematch sent — they Accept to join');
        } catch (e) {}
      } else if (typeof showToast === 'function') {
        showToast('Rematch ready — ask your friend to join from Baithak');
      }
      shell.close('rematch');
      openCarrom({
        name: chat.name || 'Friend',
        id: oppUid,
        uid: oppUid,
        peerUid: oppUid,
        opponentUid: oppUid,
        dangalMatchId: rematchId,
        dangalSource: 'challenge_host',
        stake: nextStake,
      });
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
      if (liveRoles && liveRoles.opp) settleOppUid = liveRoles.opp;
      if (liveOn && liveHandle && liveRoles && !applying && !m.skipLivePush) {
        if (isCarrom) {
          pushCarromLive({
            status: m.forfeit ? 'forfeit' : 'over',
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

      if (!isCarrom) {
        showDuelResult(shell, {
          id: spec.id,
          you: won ? 1 : 0,
          opp: won ? 0 : 1,
          glyph: spec.glyph,
          pbScore: youPocketed,
          title: won ? 'You win' : 'Defeat',
          subtitle: 'Pocketed ' + youPocketed + ' · opponent ' + oppPocketed,
          shareText: (spec.title || 'Game') + ' on Chaupaal',
          onAgain: () => openCueGame(Object.assign({}, spec, { chat })),
        });
        return;
      }

      noteCarromSession(won);
      const winColor = won ? youColor : oppColor;
      const resign = m.resign || m.forfeit;
      const stakeLine = liveOn ? (liveStake > 0 ? `⚡${liveStake} virtual` : 'Friendly') : '';
      const shareStats = {
        scoreLine: won ? 'Win' : 'Loss',
        meta: [
          colorLabel(youColor),
          queenCoveredBy ? 'Queen covered' : '',
          liveOn ? 'Live' : DIFF_LABEL[difficulty] || 'Medium',
          stakeLine,
        ]
          .filter(Boolean)
          .join(' · '),
        vs: liveOn ? 'vs Friend' : 'vs AI',
        stake: liveStake,
        text:
          `Chaupaal Carrom · ${won ? 'Win' : 'Loss'} · ${colorLabel(youColor)}` +
          (queenCoveredBy ? ' · Queen covered' : '') +
          (liveOn
            ? liveStake > 0
              ? ` · Live · Stake ⚡${liveStake} (virtual chips)`
              : ' · Live · Friendly'
            : ` · Practice · ${DIFF_LABEL[difficulty] || 'Medium'}`) +
          ' · not real money',
      };
      const chatId =
        (window.__dangalLaunchCtx && window.__dangalLaunchCtx.chatId) ||
        (window.currentOpenChat && (window.currentOpenChat.firestoreId || window.currentOpenChat.id)) ||
        (chat && (chat.firestoreId || chat.id)) ||
        '';
      const actions = [{ label: liveOn ? 'Rematch' : 'Play again', primary: true, id: 'again' }];
      if (typeof shareGameResult === 'function' || typeof openUnifiedShareSheet === 'function') {
        actions.push({ label: 'Share', primary: false, id: 'share' });
      }
      if (typeof openFriendPickerSheet === 'function') {
        actions.push({ label: 'Challenge friend', primary: false, id: 'challenge' });
      }
      if (typeof postGameScoreStory === 'function') {
        actions.push({ label: 'Post to story', primary: false, id: 'story' });
      }
      if (chatId && typeof openChatScreen === 'function') {
        actions.push({ label: 'Chat', primary: false, id: 'chat' });
      }
      const stakeSub = liveOn ? (liveStake > 0 ? ` · Stake ⚡${liveStake} (virtual)` : ' · Friendly') : '';
      if (shell && typeof shell.markOver === 'function') shell.markOver();
      if (shell.gs && typeof shell.gs.setOutcome === 'function') {
        shell.gs.setOutcome(won ? 'won' : 'lost');
      }
      buzz(won ? 'win' : 'lose');
      if (typeof setGamePB === 'function') setGamePB('carrom', countPocketed(youColor));
      shell.body.innerHTML =
        (typeof gameResultHtml === 'function'
          ? gameResultHtml({
              gameId: 'carrom',
              glyph: spec.glyph || '🪙',
              title: resign
                ? liveOn
                  ? won
                    ? 'Opponent left'
                    : 'You forfeited'
                  : 'You resigned'
                : colorLabel(winColor) + ' won',
              subtitle:
                (resign
                  ? liveOn
                    ? won
                      ? 'Forfeit win · '
                      : 'Forfeit · '
                    : 'Resign · '
                  : (won ? 'You' : liveOn ? 'Opp' : 'AI') + ' · ') +
                colorLabel(winColor) +
                (queenCoveredBy ? ' · Queen covered' : '') +
                (liveOn ? ' · Live' : ' · ' + (DIFF_LABEL[difficulty] || 'Medium')) +
                stakeSub +
                ' · You pocketed ' +
                countPocketed(youColor),
              you: won ? 1 : 0,
              opp: won ? 0 : 1,
              shareCardHtml:
                typeof buildGameShareCard === 'function' ? buildGameShareCard('carrom', shareStats) : '',
              actions,
              challenge: false,
              share: false,
            })
          : '') +
        `<div id="carromChipDelta" class="carrom-chip-delta" hidden style="margin-top:8px;font-size:12px;color:rgba(255,255,255,.75);text-align:center;"></div>`;

      settleCarromOnce(won);

      if (typeof wireGameResultActions === 'function') {
        wireGameResultActions(shell.body, {
          again: async () => {
            if (liveOn) {
              let nextStake = liveStake;
              if (
                typeof stakesEnabledForGame === 'function' &&
                stakesEnabledForGame('carrom') &&
                typeof openDangalStakeSheet === 'function'
              ) {
                const picked = await openDangalStakeSheet('carrom', { defaultStake: liveStake });
                if (picked == null) return;
                nextStake = picked;
              }
              await startCarromLiveRematch(nextStake);
              return;
            }
            shell.close('restart');
            openCueGame(Object.assign({}, spec, rematchOpts()));
          },
          share: () => {
            if (typeof shareGameResult === 'function') shareGameResult('carrom', shareStats);
            else if (typeof openUnifiedShareSheet === 'function') {
              openUnifiedShareSheet({ gameId: 'carrom', stats: shareStats });
            }
          },
          challenge: async () => {
            if (typeof openFriendPickerSheet !== 'function') return;
            const f = await openFriendPickerSheet({
              title: 'Challenge · Carrom',
              subtitle: 'Live 1v1 · virtual chips only — not real money',
            });
            if (!f) return;
            const uid = f.uid || f.id || '';
            if (!uid || (typeof isPersistableUid === 'function' && !isPersistableUid(uid))) {
              if (typeof showToast === 'function') showToast('Pick a real friend to challenge');
              return;
            }
            let stakePick = 0;
            if (
              typeof stakesEnabledForGame === 'function' &&
              stakesEnabledForGame('carrom') &&
              typeof openDangalStakeSheet === 'function'
            ) {
              const picked = await openDangalStakeSheet('carrom', { defaultStake: 0 });
              if (picked == null) return;
              stakePick = picked;
            }
            const mid =
              typeof dangalMatchId === 'function'
                ? dangalMatchId('carrom', { name: f.name, opponentUid: uid })
                : 'carrom_' + Date.now();
            const fid = f.chatId || f.firestoreId || '';
            try {
              window.__dangalLaunchCtx = Object.assign({}, window.__dangalLaunchCtx || {}, {
                gameId: 'carrom',
                gameType: 'carrom',
                mode: 'live',
                matchId: mid,
                opponentUid: uid,
                stake: stakePick,
                chatId: fid,
                source: 'challenge_host',
                startedAt: Date.now(),
              });
            } catch (e) {}
            if (typeof sendChallengeCard === 'function' && fid) {
              try {
                await sendChallengeCard(uid, 'carrom', { chatId: fid, matchId: mid, stake: stakePick });
              } catch (e) {}
            }
            await tearDownLiveHandle();
            shell.close('challenge');
            openCarrom({
              name: f.name,
              id: uid,
              uid,
              peerUid: uid,
              opponentUid: uid,
              dangalMatchId: mid,
              dangalSource: 'challenge_host',
              stake: stakePick,
            });
          },
          story: () => {
            if (typeof postGameScoreStory === 'function') postGameScoreStory('carrom', shareStats);
          },
          chat: () => {
            shell.close('chat');
            if (typeof openPeerDm === 'function' && settleOppUid) {
              openPeerDm({ peerUid: settleOppUid, peerName: chat.name || 'Friend', seedHello: false });
            } else if (typeof openChatScreen === 'function' && chatId) {
              openChatScreen(chatId);
            }
          },
        });
      }
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
            finish(iWon, { skipLivePush: true, forfeit: val.status === 'forfeit', resign: val.status === 'forfeit' && !iWon });
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
        seedState,
        {
          stake: liveStake,
          onForfeit(info, roles) {
            if (ended) return;
            liveRoles = roles || liveRoles;
            if (liveRoles && liveRoles.opp) settleOppUid = liveRoles.opp;
            const iWon = info && info.winner === (liveRoles && liveRoles.me);
            finish(iWon, { skipLivePush: true, forfeit: true, resign: !iWon });
          },
        }
      );
      if (joined) {
        liveHandle = joined.handle;
        liveRoles = joined.roles;
        settleOppUid = liveRoles.opp || settleOppUid;
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
    const raw = ctx && typeof ctx === 'object' ? ctx : {};
    const chat = resolveChat(raw.chat != null ? raw.chat : ctx);
    const launch = window.__dangalLaunchCtx || {};
    const liveWanted = chatLiveOn(chat);
    const stake = liveWanted
      ? Math.max(0, Number(raw.stake != null ? raw.stake : launch.stake) || 0)
      : 0;
    const oppUid =
      (typeof opponentUidFromChat === 'function' ? opponentUidFromChat(chat) : '') ||
      raw.opponentUid ||
      raw.uid ||
      launch.opponentUid ||
      '';
    try {
      window.__dangalLaunchCtx = Object.assign({}, launch, {
        gameId: 'carrom',
        gameType: 'carrom',
        mode: liveWanted ? 'live' : 'practice',
        matchId: (chat && chat.dangalMatchId) || raw.dangalMatchId || launch.matchId || '',
        opponentUid: liveWanted ? oppUid : '',
        stake: liveWanted ? stake : 0,
        source: raw.dangalSource || raw.source || launch.source || (liveWanted ? 'challenge_host' : 'dangal'),
        startedAt: Date.now(),
      });
    } catch (e) {}
    openCueGame({
      id: 'carrom',
      variant: 'carrom',
      title: 'Carrom',
      subtitle: liveWanted ? 'Live 1v1' : 'Practice · AI',
      chat,
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
      coachKey: 'chaupaal_carrom_coach_v5',
      youColor: raw.youColor,
      difficulty: raw.difficulty,
      breakerPick: raw.breakerPick,
      skipSheet: !!raw.skipSheet,
      stake,
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
    if (!cards || cards.length < 3) return 0;
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

  function tpRankName(cards) {
    const s = tpScore(cards);
    if (s >= 6000) return 'Trail';
    if (s >= 5000) return 'Pure sequence';
    if (s >= 4000) return 'Sequence';
    if (s >= 3000) return 'Colour';
    if (s >= 2000) return 'Pair';
    return 'High card';
  }

  function cardBacks(n) {
    let html = '';
    for (let i = 0; i < n; i++) html += '<span class="pc-card pc-back" aria-hidden="true"></span>';
    return html;
  }

  function openTeenPatti() {
    const chat = resolveChat(arguments[0]);
    const liveOn = chatLiveOn(chat);
    const rng = rngFn();
    // Virtual chips · ring session (stacks persist until leave / bust)
    const STACK0 = 1000;
    const BOOT = 10;
    const REBUY_AMT = 1000;
    const MAX_REBUY = 1; // Practice only — one rebuy per seat per table
    const MAX_STAKE = BOOT * 8;
    const MAX_RAISES = 6;
    const SS_TIMEOUT_MS = 18000;
    // RULE: blind = S, seen = 2S. Side-show free refuse. Final Show free when 2 seen.
    // Live stakes: settle ONCE per table leave/bust — not per hand.
    const liveStake = liveOn
      ? Number(
          (chat && chat.stake) ||
            (window.__dangalLaunchCtx && window.__dangalLaunchCtx.stake) ||
            0
        ) || 0
      : 0;
    const settleMatchId = liveOn ? String(matchIdFor(chat, 'teenpatti') || '').trim() : '';
    let settleOppUid = '';
    let settleDone = false;
    let aiTimer = 0;
    let ssTimer = 0;
    let betweenTimer = 0;

    const shell = openShell({
      id: 'teenpatti',
      title: 'Teen Patti',
      subtitle: liveOn
        ? liveSub() + (liveStake > 0 ? ' · Stake ⚡' + liveStake + ' (virtual)' : ' · Friendly') + ' · 1v1'
        : practiceSub('Ring · virtual chips'),
      mode: liveOn ? 'live' : 'practice',
      live: liveOn,
      chat,
      accent: '#FFD700',
      bg: '#0D0018',
      cleanup: () => {
        if (aiTimer) clearTimeout(aiTimer);
        if (ssTimer) clearTimeout(ssTimer);
        if (betweenTimer) clearTimeout(betweenTimer);
        aiTimer = ssTimer = betweenTimer = 0;
      },
    });
    if (!shell) return;

    let handA = [];
    let handB = [];
    let stackA = STACK0;
    let stackB = STACK0;
    let pot = 0;
    let seenA = false;
    let seenB = false;
    let packedA = false;
    let packedB = false;
    let boot = BOOT;
    let stake = BOOT;
    let raiseCount = 0;
    let turnIsA = true;
    let betSeq = 0;
    let phase = 'idle'; // idle | dealt | between | over
    let handOver = false;
    let tableClosed = false;
    let applying = false;
    let liveRoles = null;
    let liveHandle = null;
    let sideShow = null;
    let handNum = 0;
    let rebuyA = 0;
    let rebuyB = 0;
    let lastHandTitle = '';

    function iAmA() {
      return !liveOn || !liveRoles || liveRoles.me === liveRoles.playerA;
    }
    function myCards() {
      return iAmA() ? handA : handB;
    }
    function oppCards() {
      return iAmA() ? handB : handA;
    }
    function mySeen() {
      return iAmA() ? seenA : seenB;
    }
    function oppSeen() {
      return iAmA() ? seenB : seenA;
    }
    function myStack() {
      return iAmA() ? stackA : stackB;
    }
    function oppStack() {
      return iAmA() ? stackB : stackA;
    }
    function setMySeen(v) {
      if (iAmA()) seenA = !!v;
      else seenB = !!v;
    }
    function setMyPacked(v) {
      if (iAmA()) packedA = !!v;
      else packedB = !!v;
    }
    function myPacked() {
      return iAmA() ? packedA : packedB;
    }
    function oppPacked() {
      return iAmA() ? packedB : packedA;
    }
    function myTurn() {
      if (tableClosed || handOver || phase !== 'dealt' || myPacked()) return false;
      if (!liveOn) return turnIsA;
      if (!liveRoles) return false;
      return turnIsA ? liveRoles.me === liveRoles.playerA : liveRoles.me === liveRoles.playerB;
    }
    function turnUid() {
      if (!liveOn || !liveRoles) return turnIsA ? 'A' : 'B';
      return turnIsA ? liveRoles.playerA : liveRoles.playerB;
    }
    function chaalCost(seen) {
      const s = Math.max(BOOT, stake | 0);
      return seen ? s * 2 : s;
    }
    function seeFee() {
      return chaalCost(true);
    }
    function activeCount() {
      return (packedA ? 0 : 1) + (packedB ? 0 : 1);
    }
    function bothSeen() {
      return seenA && seenB;
    }
    function sessionDelta() {
      return myStack() - STACK0;
    }
    function bothCanBoot() {
      return stackA >= BOOT && stackB >= BOOT;
    }

    function snapshot() {
      return {
        handA,
        handB,
        pot,
        stackA,
        stackB,
        seenA,
        seenB,
        packedA,
        packedB,
        boot,
        stake,
        raiseCount,
        turnIsA,
        betSeq,
        phase,
        handNum,
        rebuyA,
        rebuyB,
        active: [!packedA, !packedB],
        sideShow: sideShow ? { fromA: sideShow.fromA, status: sideShow.status, at: sideShow.at } : null,
      };
    }

    function applySnapshot(st) {
      if (!st || typeof st !== 'object') return;
      if (Array.isArray(st.handA) && st.handA.length) handA = st.handA;
      if (Array.isArray(st.handB) && st.handB.length) handB = st.handB;
      if (st.pot != null) pot = Math.max(0, Number(st.pot) || 0);
      if (st.stackA != null) stackA = Math.max(0, Number(st.stackA) || 0);
      if (st.stackB != null) stackB = Math.max(0, Number(st.stackB) || 0);
      if (st.seenA != null) seenA = !!st.seenA;
      if (st.seenB != null) seenB = !!st.seenB;
      if (st.packedA != null) packedA = !!st.packedA;
      if (st.packedB != null) packedB = !!st.packedB;
      if (st.boot != null) boot = Math.max(1, Number(st.boot) || BOOT);
      if (st.stake != null) stake = Math.max(BOOT, Number(st.stake) || BOOT);
      if (st.raiseCount != null) raiseCount = Math.max(0, Number(st.raiseCount) || 0);
      if (st.turnIsA != null) turnIsA = !!st.turnIsA;
      if (st.betSeq != null) betSeq = Math.max(betSeq, Number(st.betSeq) || 0);
      if (st.handNum != null) handNum = Math.max(handNum, Number(st.handNum) || 0);
      if (st.rebuyA != null) rebuyA = Number(st.rebuyA) || 0;
      if (st.rebuyB != null) rebuyB = Number(st.rebuyB) || 0;
      if (st.phase) phase = st.phase;
      if (st.sideShow && st.sideShow.status === 'pending') {
        sideShow = {
          fromA: !!st.sideShow.fromA,
          status: 'pending',
          at: Number(st.sideShow.at) || Date.now(),
        };
      } else if (st.sideShow === null || (st.sideShow && st.sideShow.status !== 'pending')) {
        sideShow = null;
      }
    }

    function pushLive(extra) {
      if (!liveOn || !liveHandle || applying || tableClosed) return;
      liveHandle.push(
        Object.assign(
          {
            status: phase === 'over' && handOver ? 'playing' : phase === 'between' ? 'playing' : 'playing',
            turn: turnUid(),
            state: snapshot(),
          },
          extra || {}
        )
      );
    }

    function paintOppHand() {
      return cardBacks(3);
    }
    function paintMyHand() {
      const you = myCards();
      if (!you.length || !mySeen()) return cardBacks(3);
      return you.map(cardFace).join('');
    }

    function clearAi() {
      if (aiTimer) {
        clearTimeout(aiTimer);
        aiTimer = 0;
      }
    }
    function clearSsTimer() {
      if (ssTimer) {
        clearTimeout(ssTimer);
        ssTimer = 0;
      }
    }
    function clearSideShow() {
      sideShow = null;
      clearSsTimer();
    }
    function iAmSideShowTarget() {
      return !!(sideShow && sideShow.status === 'pending' && sideShow.fromA !== iAmA());
    }
    function iAmSideShowAsker() {
      return !!(sideShow && sideShow.status === 'pending' && sideShow.fromA === iAmA());
    }
    function startSsTimeout() {
      clearSsTimer();
      ssTimer = setTimeout(() => {
        ssTimer = 0;
        if (sideShow && sideShow.status === 'pending') doSideShowRefuse(true);
      }, SS_TIMEOUT_MS);
    }

    function debit(seatA, amount) {
      amount = Math.max(0, Math.floor(amount));
      if (seatA) {
        const pay = Math.min(stackA, amount);
        stackA -= pay;
        pot += pay;
        return pay;
      }
      const pay = Math.min(stackB, amount);
      stackB -= pay;
      pot += pay;
      return pay;
    }

    function passTurn() {
      if (packedA && !packedB) turnIsA = false;
      else if (packedB && !packedA) turnIsA = true;
      else turnIsA = !turnIsA;
      betSeq += 1;
    }

    function awardPotSeat(toA) {
      if (toA) stackA += pot;
      else stackB += pot;
      pot = 0;
    }

    function settleShow() {
      const sa = tpScore(handA);
      const sb = tpScore(handB);
      const split = sa === sb;
      const aWins = sa > sb;
      if (split) {
        const half = Math.floor(pot / 2);
        stackA += half;
        stackB += pot - half;
        pot = 0;
      } else if (aWins) awardPotSeat(true);
      else awardPotSeat(false);
      return { split, aWins, sa, sb };
    }

    async function settleTableOnce(won) {
      if (!liveOn || settleDone || !window.DangalEconomy || typeof DangalEconomy.reportGameEnd !== 'function') {
        return null;
      }
      if (!settleMatchId || liveStake <= 0) {
        settleDone = true;
        return null;
      }
      settleDone = true;
      try {
        const me = typeof getCurrentUid === 'function' ? getCurrentUid() : '';
        const opp = settleOppUid || (liveRoles && liveRoles.opp) || '';
        return await DangalEconomy.reportGameEnd({
          gameType: 'teenpatti',
          result: won ? 'win' : 'loss',
          won: !!won,
          isDraw: false,
          matchId: settleMatchId,
          sessionId: settleMatchId,
          opponentUid: opp,
          stake: liveStake,
          winnerUid: won ? me : opp,
        });
      } catch (e) {
        settleDone = false;
        return null;
      }
    }

    function tryPracticeRebuy() {
      if (liveOn) return false;
      let changed = false;
      if (stackA < BOOT && rebuyA < MAX_REBUY) {
        stackA += REBUY_AMT;
        rebuyA += 1;
        changed = true;
      }
      if (stackB < BOOT && rebuyB < MAX_REBUY) {
        stackB += REBUY_AMT;
        rebuyB += 1;
        changed = true;
      }
      return changed;
    }

    /** Deduct boot from existing stacks — never reset ring stacks. */
    function postBootsForHand() {
      if (stackA < BOOT || stackB < BOOT) return false;
      stackA -= BOOT;
      stackB -= BOOT;
      pot = BOOT * 2;
      boot = BOOT;
      stake = BOOT;
      raiseCount = 0;
      seenA = false;
      seenB = false;
      packedA = false;
      packedB = false;
      turnIsA = true;
      betSeq = 0;
      clearSideShow();
      handNum += 1;
      return true;
    }

    function dealFresh() {
      if (!postBootsForHand()) return false;
      const deck = makeDeck(rng);
      handA = deck.splice(0, 3);
      handB = deck.splice(0, 3);
      phase = 'dealt';
      handOver = false;
      return true;
    }

    function sessionHudLine() {
      const d = sessionDelta();
      const dStr = d === 0 ? '±0' : d > 0 ? '+' + d : String(d);
      return (
        'Hand ' +
        Math.max(1, handNum) +
        ' · session ' +
        dStr +
        (liveOn ? ' · Live 1v1' : ' · Practice') +
        ' · virtual'
      );
    }

    function paint(msg) {
      if (tableClosed || handOver) return;
      const seen = mySeen();
      const pending = !!(sideShow && sideShow.status === 'pending');
      const mine = myTurn() && !pending;
      const cost = chaalCost(seen);
      const fee = seeFee();
      const canSee = mine && !seen && !myPacked() && phase === 'dealt';
      const canChaal = mine && !myPacked() && phase === 'dealt';
      const canRaise =
        mine && !myPacked() && phase === 'dealt' && raiseCount < MAX_RAISES && stake < MAX_STAKE;
      const canSide =
        mine && seen && oppSeen() && !myPacked() && !oppPacked() && activeCount() === 2 && phase === 'dealt';
      const canShow = mine && seen && oppSeen() && activeCount() === 2 && phase === 'dealt';
      const canPack = mine && !myPacked() && phase === 'dealt';
      const badge = seen ? 'Seen' : 'Blind';
      const oppBadge = oppSeen() ? 'seen' : 'blind';
      const turnLabel = pending
        ? iAmSideShowTarget()
          ? 'Side-show request'
          : 'Waiting on side-show…'
        : mine
          ? 'Your turn'
          : liveOn
            ? 'Their turn'
            : 'Opponent thinking…';
      const allInNote = myStack() > 0 && myStack() < cost ? ' · all-in' : '';
      let actionsHtml = '';
      if (pending && iAmSideShowTarget()) {
        actionsHtml = `
          <p class="pc-hint">Side-show compares hands — loser packs. Refuse is free.</p>
          <button type="button" class="cs-hit" data-ss-accept>Accept</button>
          <button type="button" class="cs-hit cs-hit--ghost" data-ss-refuse>Refuse</button>`;
      } else if (pending && iAmSideShowAsker()) {
        actionsHtml = `<p class="pc-hint">Waiting for accept or refuse…</p>`;
      } else {
        actionsHtml = `
            ${canSee ? `<button type="button" class="cs-hit" data-see>See (−${Math.min(fee, myStack())})</button>` : ''}
            ${canChaal ? `<button type="button" class="cs-hit" data-chaal>${seen ? 'Chaal' : 'Blind chaal'} (−${Math.min(cost, myStack())})</button>` : ''}
            ${
              canRaise
                ? `<button type="button" class="cs-hit cs-hit--ghost" data-raise="1">Raise +${BOOT}</button>
                   <button type="button" class="cs-hit cs-hit--ghost" data-raise="2">Raise +${BOOT * 2}</button>`
                : ''
            }
            ${canSide ? `<button type="button" class="cs-hit cs-hit--ghost" data-ss>Side-show</button>` : ''}
            ${canShow ? `<button type="button" class="cs-hit" data-show>Show</button>` : ''}
            ${canPack ? `<button type="button" class="cs-hit" data-pack>Pack</button>` : ''}`;
      }
      shell.body.innerHTML = `
        <div class="pc-tp">
          <div class="pc-tp-hud" aria-live="polite">
            <span>You <b>${myStack()}</b></span>
            <span class="pc-tp-pot">Pot <b>${pot}</b></span>
            <span>Opp <b>${oppStack()}</b></span>
            <span class="pc-tp-badge ${seen ? 'is-seen' : 'is-blind'}">${badge}</span>
          </div>
          <p class="pc-hint">${esc(sessionHudLine())}</p>
          <p class="pc-hint">${esc(turnLabel)} · S=${stake} · call ${Math.min(cost, myStack())}${allInNote}${
            liveStake > 0 ? ' · stake ⚡' + liveStake : ''
          }</p>
          <p class="pc-hint">Opponent · ${oppBadge}</p>
          <div class="pc-hand pc-hand--opp">${paintOppHand()}</div>
          <p class="pc-hint">You · ${badge.toLowerCase()}${msg ? ' · ' + esc(msg) : ''}</p>
          <div class="pc-hand pc-hand--you">${paintMyHand()}</div>
          <div class="pc-actions pc-tp-actions">${actionsHtml}</div>
          <p class="pc-hint pc-tp-boot">Boot ${boot} · virtual chips only — not real money</p>
        </div>`;
      shell.body.querySelector('[data-see]')?.addEventListener('click', () => doSee());
      shell.body.querySelector('[data-chaal]')?.addEventListener('click', () => doChaal());
      shell.body.querySelectorAll('[data-raise]').forEach((btn) => {
        btn.addEventListener('click', () => doRaise(Number(btn.dataset.raise) || 1));
      });
      shell.body.querySelector('[data-ss]')?.addEventListener('click', () => doSideShowAsk());
      shell.body.querySelector('[data-ss-accept]')?.addEventListener('click', () => doSideShowAccept());
      shell.body.querySelector('[data-ss-refuse]')?.addEventListener('click', () => doSideShowRefuse(false));
      shell.body.querySelector('[data-show]')?.addEventListener('click', () => doShow());
      shell.body.querySelector('[data-pack]')?.addEventListener('click', () => doPack());
      if (!liveOn && phase === 'dealt' && !handOver && !tableClosed) {
        if (pending && sideShow && sideShow.fromA === true) scheduleAiSideShow();
        else if (!pending && !turnIsA) scheduleAi();
      }
    }

    function showBetweenHands(opts) {
      const o = opts || {};
      handOver = true;
      phase = 'between';
      clearAi();
      clearSideShow();
      const youWin = !!o.youWin;
      const draw = !!o.draw;
      const title = o.title || (draw ? 'Split pot' : youWin ? 'You win the hand' : 'Opponent wins the hand');
      const sub = o.subtitle || '';
      lastHandTitle = title;
      const iBust = myStack() < BOOT;
      const oBust = oppStack() < BOOT;
      const canRebuy = !liveOn && iBust && (iAmA() ? rebuyA : rebuyB) < MAX_REBUY;
      const canNext = bothCanBoot();
      const d = sessionDelta();
      const dStr = d === 0 ? '±0' : d > 0 ? '+' + d : String(d);

      let bodyActions = '';
      if (tableClosed) {
        bodyActions = '';
      } else if (canNext) {
        if (!liveOn || (liveRoles && liveRoles.host)) {
          bodyActions = `<button type="button" class="cs-hit" data-next>Next hand</button>`;
        } else {
          bodyActions = `<p class="pc-hint">Waiting for host to deal…</p>`;
        }
        bodyActions += `<button type="button" class="cs-hit cs-hit--ghost" data-leave>Leave table</button>`;
      } else if (canRebuy) {
        bodyActions = `
          <p class="pc-hint pc-tp-bust">Bust — need ${BOOT} for boot</p>
          <button type="button" class="cs-hit" data-rebuy>Rebuy +${REBUY_AMT}</button>
          <button type="button" class="cs-hit cs-hit--ghost" data-leave>Leave table</button>`;
      } else {
        bodyActions = `
          <p class="pc-hint pc-tp-bust">${iBust ? 'You’re bust' : oBust ? 'Opponent bust' : 'Can’t continue'} — table over</p>
          <button type="button" class="cs-hit" data-leave>Cash out table</button>`;
      }

      const rankBit = o.rankLine ? `<p class="pc-hint">${esc(o.rankLine)}</p>` : '';
      shell.body.innerHTML = `
        <div class="pc-tp">
          <p class="pc-hint">${esc(title)}</p>
          ${rankBit}
          <p class="pc-hint">${esc(sub)}</p>
          <div class="pc-tp-hud">
            <span>You <b>${myStack()}</b></span>
            <span>Opp <b>${oppStack()}</b></span>
            <span>Session <b>${dStr}</b></span>
          </div>
          <p class="pc-hint">Hands played ${handNum} · virtual chips only</p>
          <div class="pc-actions pc-tp-actions">${bodyActions}</div>
          <div id="tpChipDelta" class="pc-hint" hidden></div>
        </div>`;

      if (liveOn && liveHandle && !o.fromRemote && !applying) {
        pushLive({
          act: 'between',
          handResult: { title, youWin, draw },
          state: Object.assign(snapshot(), { phase: 'between' }),
        });
      }

      shell.body.querySelector('[data-next]')?.addEventListener('click', () => beginNextHand());
      shell.body.querySelector('[data-rebuy]')?.addEventListener('click', () => {
        if (iAmA()) {
          if (rebuyA >= MAX_REBUY) return;
          stackA += REBUY_AMT;
          rebuyA += 1;
        } else {
          if (rebuyB >= MAX_REBUY) return;
          stackB += REBUY_AMT;
          rebuyB += 1;
        }
        buzz('select');
        showBetweenHands(o);
      });
      shell.body.querySelector('[data-leave]')?.addEventListener('click', () => leaveTable(youWin || d > 0));

      // Practice: auto-rebuy AI if needed, then soft pause before human action
      if (!liveOn && oBust && rebuyB < MAX_REBUY) {
        stackB += REBUY_AMT;
        rebuyB += 1;
      }
    }

    function beginNextHand() {
      if (tableClosed) return;
      if (!bothCanBoot()) {
        if (!liveOn) tryPracticeRebuy();
        if (!bothCanBoot()) {
          showBetweenHands({
            title: 'Table stuck',
            subtitle: 'Not enough chips for boot',
            youWin: myStack() >= oppStack(),
            fromRemote: true,
          });
          return;
        }
      }
      handOver = false;
      if (!dealFresh()) {
        showBetweenHands({ title: 'Deal failed', subtitle: 'Boot short', youWin: false, fromRemote: true });
        return;
      }
      buzz('select');
      if (liveOn && liveRoles && liveRoles.host) {
        pushLive({ act: 'redeal', status: 'playing' });
      }
      paint('Hand ' + handNum + ' · boot posted — both blind');
    }

    async function leaveTable(wonHint) {
      if (tableClosed) return;
      tableClosed = true;
      handOver = true;
      phase = 'over';
      clearAi();
      clearSideShow();
      if (shell && typeof shell.markOver === 'function') shell.markOver();
      const d = sessionDelta();
      const won = wonHint != null ? !!wonHint : d > 0;
      if (liveRoles && liveRoles.opp) settleOppUid = liveRoles.opp;
      const settle = await settleTableOnce(won);
      let settleLine = 'Virtual chips only — not real money';
      if (settle && settle.chipDelta != null) {
        const cd = Number(settle.chipDelta);
        settleLine =
          (Number.isFinite(cd) ? 'Stake settle ' + (cd > 0 ? '+' : '') + cd + ' · ' : '') + settleLine;
      }
      if (typeof recordDangalSession === 'function') {
        try {
          recordDangalSession('teenpatti', {
            won,
            score: Math.max(0, d),
            difficulty: liveOn ? 'live' : 'practice',
            stake: liveStake,
            live: !!liveOn,
          });
        } catch (e) {}
      }
      const dStr = d === 0 ? '±0' : d > 0 ? '+' + d : String(d);
      showDuelResult(shell, {
        id: 'teenpatti',
        you: won ? 1 : 0,
        opp: won ? 0 : 1,
        glyph: '♠',
        title: 'Table closed',
        subtitle: 'Session ' + dStr + ' · ' + handNum + ' hands · ' + settleLine,
        shareText:
          (d >= 0 ? 'Won ' : 'Lost ') +
          Math.abs(d) +
          ' virtual chips on Chaupaal Teen Patti (not real money)',
        onAgain: () => openTeenPatti(chat),
      });
    }

    function endHand(opts) {
      const o = opts || {};
      if (handOver || tableClosed) return;
      handOver = true;
      phase = 'between';
      clearAi();
      clearSideShow();

      const reveal = !!o.reveal;
      const go = () => {
        // Live bust ends table for that seat
        if (liveOn && (myStack() < BOOT || oppStack() < BOOT)) {
          const youWin = oppStack() < BOOT && myStack() >= BOOT;
          showBetweenHands({
            title: o.title || (youWin ? 'Opponent bust' : myStack() < BOOT ? 'You’re bust' : 'Hand over'),
            subtitle: o.subtitle || 'Live table ends when a seat can’t post boot',
            youWin,
            draw: !!o.draw,
            rankLine: o.rankLine,
            fromRemote: o.fromRemote,
          });
          return;
        }
        showBetweenHands({
          title: o.title,
          subtitle: o.subtitle,
          youWin: !!o.youWin,
          draw: !!o.draw,
          rankLine: o.rankLine,
          fromRemote: o.fromRemote,
        });
      };

      if (reveal) {
        const youRank = tpRankName(myCards());
        const oppRank = tpRankName(oppCards());
        shell.body.innerHTML = `
          <div class="pc-tp">
            <p class="pc-hint">Show · ${esc(youRank)} vs ${esc(oppRank)}</p>
            <div class="pc-hand">${oppCards().map(cardFace).join('')}</div>
            <div class="pc-hand">${myCards().map(cardFace).join('')}</div>
          </div>`;
        if (!o.fromRemote && liveOn && liveHandle && !applying) {
          liveHandle.push({
            status: 'playing',
            act: o.act || 'show',
            winner: o.draw ? null : o.youWin ? liveRoles.me : liveRoles.opp,
            state: Object.assign(snapshot(), {
              phase: 'between',
              revealed: true,
              ranks: { a: tpRankName(handA), b: tpRankName(handB) },
            }),
          });
        }
        betweenTimer = setTimeout(() => {
          betweenTimer = 0;
          go();
        }, 800);
      } else {
        if (!o.fromRemote && liveOn && liveHandle && !applying) {
          liveHandle.push({
            status: 'playing',
            act: o.act || 'pack',
            winner: o.youWin ? liveRoles.me : liveRoles.opp,
            state: Object.assign(snapshot(), { phase: 'between' }),
          });
        }
        go();
      }
    }

    function doSee() {
      if (handOver || tableClosed || phase !== 'dealt' || myPacked() || mySeen() || !myTurn() || sideShow) return;
      const fee = seeFee();
      if (myStack() <= 0) {
        paint('Need chips to see');
        return;
      }
      if (iAmA()) debit(true, fee);
      else debit(false, fee);
      setMySeen(true);
      betSeq += 1;
      buzz('select');
      pushLive({ act: 'see', by: liveRoles && liveRoles.me });
      paint('Cards up — still your turn');
    }

    function doChaal() {
      if (handOver || tableClosed || phase !== 'dealt' || myPacked() || !myTurn() || sideShow) return;
      const cost = chaalCost(mySeen());
      if (myStack() <= 0) {
        paint('No chips left');
        return;
      }
      if (iAmA()) debit(true, cost);
      else debit(false, cost);
      buzz('select');
      passTurn();
      pushLive({ act: 'chaal', by: liveRoles && liveRoles.me });
      paint('Chaal in');
    }

    function doRaise(steps) {
      if (handOver || tableClosed || phase !== 'dealt' || myPacked() || !myTurn() || sideShow) return;
      steps = steps === 2 ? 2 : 1;
      if (raiseCount >= MAX_RAISES || stake >= MAX_STAKE) {
        paint('Raise cap hit');
        return;
      }
      stake = Math.min(MAX_STAKE, stake + BOOT * steps);
      raiseCount += 1;
      const cost = chaalCost(mySeen());
      if (iAmA()) debit(true, cost);
      else debit(false, cost);
      buzz('select');
      passTurn();
      pushLive({ act: 'raise', by: liveRoles && liveRoles.me, steps });
      paint('Raised · S=' + stake);
    }

    function doPack() {
      if (handOver || tableClosed || phase !== 'dealt' || myPacked() || !myTurn() || sideShow) return;
      setMyPacked(true);
      if (iAmA()) awardPotSeat(false);
      else awardPotSeat(true);
      buzz('lose');
      betSeq += 1;
      endHand({
        youWin: false,
        title: 'Packed',
        subtitle: 'Opponent takes the pot · ' + sessionHudLine(),
        act: 'pack',
        fromRemote: false,
      });
    }

    function doShow() {
      if (handOver || tableClosed || phase !== 'dealt' || myPacked() || !myTurn() || sideShow) return;
      if (!mySeen() || !oppSeen() || activeCount() !== 2) {
        paint('Show needs both seen · 2 players');
        return;
      }
      const settled = settleShow();
      betSeq += 1;
      const youWin = iAmA() ? settled.aWins : !settled.aWins;
      const youRank = tpRankName(myCards());
      const oppRank = tpRankName(oppCards());
      endHand({
        youWin,
        draw: settled.split,
        title: settled.split ? 'Split pot' : youWin ? 'You win the show' : 'Opponent wins the show',
        subtitle: youRank + ' vs ' + oppRank,
        rankLine: youRank + ' vs ' + oppRank,
        reveal: true,
        act: 'show',
        fromRemote: false,
      });
    }

    function doSideShowAsk() {
      if (handOver || tableClosed || phase !== 'dealt' || sideShow || !myTurn()) return;
      if (!mySeen() || !oppSeen() || myPacked() || oppPacked() || activeCount() !== 2) {
        paint('Side-show needs both seen');
        return;
      }
      sideShow = { fromA: iAmA(), status: 'pending', at: Date.now() };
      betSeq += 1;
      buzz('select');
      startSsTimeout();
      pushLive({ act: 'sideshow_ask', by: liveRoles && liveRoles.me });
      paint('Side-show asked');
    }

    function resolveSideShowCompare() {
      if (handOver || tableClosed || phase !== 'dealt' || !sideShow || sideShow.status !== 'pending') return;
      const sa = tpScore(handA);
      const sb = tpScore(handB);
      const askerA = sideShow.fromA;
      betSeq += 1;
      clearSsTimer();

      if (sa === sb) {
        clearSideShow();
        turnIsA = askerA;
        pushLive({ act: 'sideshow_tie' });
        paint('Side-show tied — both stay');
        return;
      }

      const loserA = sa < sb;
      if (loserA) packedA = true;
      else packedB = true;
      const iLost = (loserA && iAmA()) || (!loserA && !iAmA());
      clearSideShow();

      shell.body.innerHTML = `
        <div class="pc-tp">
          <p class="pc-hint">${esc(iLost ? 'You packed — weaker hand' : 'Opponent packed on side-show')}</p>
          <div class="pc-hand">${oppCards().map(cardFace).join('')}</div>
          <div class="pc-hand">${myCards().map(cardFace).join('')}</div>
        </div>`;

      if (activeCount() < 2) {
        if (packedA) awardPotSeat(false);
        else awardPotSeat(true);
        betweenTimer = setTimeout(() => {
          betweenTimer = 0;
          endHand({
            youWin: !iLost,
            title: iLost ? 'Packed on side-show' : 'Won side-show',
            subtitle: iLost ? 'Weaker hand — opponent takes the pot' : 'Opponent packed — you take the pot',
            act: 'sideshow',
            fromRemote: false,
          });
        }, 900);
        return;
      }

      turnIsA = !askerA;
      pushLive({ act: 'sideshow_done' });
      setTimeout(() => {
        handOver = false;
        phase = 'dealt';
        paint(iLost ? 'You packed — weaker hand' : 'Opponent packed on side-show');
      }, 900);
    }

    function doSideShowAccept() {
      if (handOver || tableClosed || !sideShow || sideShow.status !== 'pending') return;
      if (liveOn && !iAmSideShowTarget()) return;
      buzz('select');
      resolveSideShowCompare();
    }

    function doSideShowRefuse(auto) {
      if (handOver || tableClosed || !sideShow || sideShow.status !== 'pending') return;
      if (!auto && liveOn && !iAmSideShowTarget()) return;
      const askerA = sideShow.fromA;
      clearSideShow();
      betSeq += 1;
      turnIsA = askerA;
      buzz('select');
      pushLive({ act: 'sideshow_refuse', by: liveRoles && liveRoles.me, auto: !!auto });
      paint(auto ? 'Side-show timed out — refused' : 'Side-show refused — hand continues');
    }

    function applyRemoteAct(val) {
      const st = val.state || {};
      const incomingSeq = st.betSeq != null ? Number(st.betSeq) : -1;
      if (
        incomingSeq >= 0 &&
        incomingSeq < betSeq &&
        val.act !== 'redeal' &&
        val.act !== 'between' &&
        st.phase !== 'between' &&
        st.phase !== 'over'
      ) {
        return;
      }
      applySnapshot(st);
      const act = val.act;
      if (tableClosed) return;

      if (act === 'redeal' || (st.phase === 'dealt' && Array.isArray(st.handA) && st.handA.length && handOver)) {
        handOver = false;
        phase = 'dealt';
        paint('Hand ' + handNum + ' · boot posted');
        return;
      }

      if (act === 'between' || st.phase === 'between') {
        handOver = true;
        phase = 'between';
        const hr = val.handResult || {};
        showBetweenHands({
          title: hr.title || lastHandTitle || 'Hand over',
          subtitle: sessionHudLine(),
          youWin: hr.youWin != null ? hr.youWin : val.winner === (liveRoles && liveRoles.me),
          draw: !!hr.draw,
          fromRemote: true,
        });
        return;
      }

      if (handOver) return;

      if (act === 'sideshow_ask' || (st.sideShow && st.sideShow.status === 'pending')) {
        if (sideShow && sideShow.status === 'pending') startSsTimeout();
        paint('Side-show requested');
        return;
      }
      if (act === 'sideshow_refuse' || act === 'sideshow_tie') {
        clearSsTimer();
        paint(act === 'sideshow_tie' ? 'Side-show tied — both stay' : 'Side-show refused');
        return;
      }
      if (act === 'sideshow_done') {
        clearSsTimer();
        paint('Side-show resolved');
        return;
      }

      if (val.status === 'over' || act === 'pack' || act === 'show' || act === 'sideshow') {
        applying = true;
        if (act === 'show' || st.revealed) {
          const ys = tpScore(myCards());
          const os = tpScore(oppCards());
          const split = ys === os;
          const youWin = ys > os;
          endHand({
            youWin,
            draw: split,
            title: split ? 'Split pot' : youWin ? 'You win the show' : 'Opponent wins the show',
            rankLine: tpRankName(myCards()) + ' vs ' + tpRankName(oppCards()),
            reveal: true,
            fromRemote: true,
          });
        } else if (act === 'pack' || act === 'sideshow' || st.packedA || st.packedB) {
          const iWon = val.winner === liveRoles.me || (myPacked() ? false : true);
          endHand({
            youWin: !!iWon && !myPacked(),
            title: myPacked() ? 'Packed' : 'Opponent packed',
            subtitle: sessionHudLine(),
            fromRemote: true,
          });
        }
        applying = false;
        return;
      }

      if (act === 'see' || act === 'chaal' || act === 'raise' || act === 'blind') {
        paint(act === 'raise' ? 'Opponent raised' : act === 'chaal' ? 'Opponent chaaled' : '');
        return;
      }
      if (st.handA && st.handB && phase === 'dealt') {
        handOver = false;
        paint('Boot posted — chaal when ready');
        return;
      }
      paint();
    }

    function scheduleAi() {
      clearAi();
      if (liveOn || handOver || tableClosed || phase !== 'dealt' || packedB || turnIsA || sideShow) return;
      aiTimer = setTimeout(() => {
        aiTimer = 0;
        if (handOver || tableClosed || phase !== 'dealt' || packedB || turnIsA || sideShow) return;
        runAi();
      }, 700 + Math.floor(rng() * 800));
    }

    function scheduleAiSideShow() {
      clearAi();
      if (liveOn || handOver || !sideShow || sideShow.status !== 'pending' || sideShow.fromA !== true) return;
      aiTimer = setTimeout(() => {
        aiTimer = 0;
        if (!sideShow || sideShow.status !== 'pending') return;
        const strength = tpScore(handB);
        if (strength >= 2000 || (strength >= 14 && rng() < 0.4)) resolveSideShowCompare();
        else doSideShowRefuse(false);
      }, 550 + Math.floor(rng() * 500));
    }

    function runAi() {
      if (handOver || tableClosed || packedB || turnIsA || sideShow) return;
      const strength = tpScore(handB);
      const cost = chaalCost(seenB);

      if (!seenB) {
        if ((pot >= BOOT * 6 || rng() < 0.35) && stackB >= seeFee()) {
          debit(false, seeFee());
          seenB = true;
          betSeq += 1;
          paint('Opponent paid to see');
          scheduleAi();
          return;
        }
        if (rng() < 0.1) {
          packedB = true;
          awardPotSeat(true);
          endHand({
            youWin: true,
            title: 'Opponent packed',
            subtitle: 'You take the pot',
            fromRemote: false,
          });
          return;
        }
        if (raiseCount < 2 && stake < MAX_STAKE && rng() < 0.12 && stackB > cost) {
          stake = Math.min(MAX_STAKE, stake + BOOT);
          raiseCount += 1;
          debit(false, chaalCost(false));
          passTurn();
          paint('Opponent raised blind');
          return;
        }
        debit(false, cost);
        passTurn();
        paint('Opponent blind chaal');
        return;
      }

      if (bothSeen() && !packedA && strength >= 2000 && strength < 5000 && pot >= BOOT * 8 && rng() < 0.45) {
        sideShow = { fromA: false, status: 'pending', at: Date.now() };
        betSeq += 1;
        startSsTimeout();
        paint('Opponent asks for a side-show');
        return;
      }

      if (strength >= 5000 && raiseCount < MAX_RAISES && stake < MAX_STAKE && rng() < 0.7) {
        stake = Math.min(MAX_STAKE, stake + BOOT * (rng() < 0.4 ? 2 : 1));
        raiseCount += 1;
        debit(false, chaalCost(true));
        passTurn();
        paint('Opponent raised');
        return;
      }
      if (strength < 20 && (pot > BOOT * 8 || rng() < 0.5)) {
        packedB = true;
        awardPotSeat(true);
        endHand({ youWin: true, title: 'Opponent packed', subtitle: 'You take the pot', fromRemote: false });
        return;
      }
      if (strength >= 2000 && bothSeen() && rng() < 0.35) {
        const settled = settleShow();
        const youWin = settled.split ? false : settled.aWins;
        endHand({
          youWin,
          draw: settled.split,
          title: settled.split ? 'Split pot' : youWin ? 'You win the show' : 'Opponent wins the show',
          rankLine: tpRankName(handA) + ' vs ' + tpRankName(handB),
          reveal: true,
          fromRemote: false,
        });
        return;
      }
      if (strength >= 3000 && raiseCount < MAX_RAISES && stake < MAX_STAKE && rng() < 0.35) {
        stake = Math.min(MAX_STAKE, stake + BOOT);
        raiseCount += 1;
        debit(false, chaalCost(true));
        passTurn();
        paint('Opponent raised');
        return;
      }
      debit(false, cost);
      passTurn();
      paint('Opponent chaal');
    }

    if (liveOn) {
      const joined = joinLive(
        shell,
        chat,
        'teenpatti',
        (val) => {
          if (!val || tableClosed) return;
          if (val.status === 'forfeit') {
            applying = true;
            if (liveRoles && liveRoles.opp) settleOppUid = liveRoles.opp;
            const iWon = val.winner === liveRoles.me;
            if (!handOver && phase === 'dealt' && pot > 0) {
              if (iWon) {
                if (iAmA()) awardPotSeat(true);
                else awardPotSeat(false);
              }
            }
            endHand({
              youWin: iWon,
              title: iWon ? 'Opponent left' : 'You forfeited',
              subtitle: 'Forfeit · pot to remaining seat',
              fromRemote: true,
            });
            applying = false;
            return;
          }
          applyRemoteAct(val);
        },
        null,
        { stake: liveStake }
      );
      if (joined) {
        liveHandle = joined.handle;
        liveRoles = joined.roles;
        if (liveRoles.opp) settleOppUid = liveRoles.opp;
        if (liveRoles.host) {
          dealFresh();
          pushLive({ status: 'playing', act: 'deal' });
          paint('Hand ' + handNum + ' · boot posted — both blind');
        } else {
          shell.body.innerHTML = `<p class="pc-hint">Waiting for deal… · Live 1v1 · virtual chips</p>`;
        }
      }
    } else {
      dealFresh();
      paint('Hand ' + handNum + ' · boot posted — both blind');
    }
  }

  /* ---------- Bluff ---------- */
  function openBluff() {
    const chat = resolveChat(arguments[0]);
    const liveOn = chatLiveOn(chat);
    const rng = rngFn();
    // HOUSE RULE: first play locks rank until Call clears.
    // UX (Prompt 2): Call or Play — playing accepts the standing claim (no separate Pass).
    // Reveal scope: last play only (not the whole pile).
    let aiTimer = 0;
    let revealTimer = 0;
    const shell = openShell({
      id: 'bluff',
      title: 'Bluff',
      subtitle: liveOn ? liveSub() + ' · 1v1' : practiceSub('Call · reveal · clear'),
      mode: liveOn ? 'live' : 'practice',
      live: liveOn,
      chat,
      accent: '#FF1744',
      bg: '#0A0E10',
      cleanup: () => {
        if (aiTimer) {
          clearTimeout(aiTimer);
          aiTimer = 0;
        }
        if (revealTimer) {
          clearTimeout(revealTimer);
          revealTimer = 0;
        }
      },
    });
    if (!shell) return;

    let livesA = 3;
    let livesB = 3;
    let handA = [];
    let handB = [];
    let pile = [];
    let lastClaim = null; // { seatA, rank, count }
    let lockedRank = null;
    let turnIsA = true;
    let ended = false;
    let applying = false;
    let liveRoles = null;
    let liveHandle = null;
    /** Local-only last play secret — never in shared state until reveal. */
    let myPendingPlay = null; // { honest, cards: Card[] }
    let claimPick = 'A';
    let seq = 0;
    let dealtLive = false;
    let callInFlight = false;
    let revealing = false;
    let lastRevealId = '';

    function iAmA() {
      return !liveOn || !liveRoles || liveRoles.me === liveRoles.playerA;
    }
    function myLives() {
      return iAmA() ? livesA : livesB;
    }
    function oppLives() {
      return iAmA() ? livesB : livesA;
    }
    function myHand() {
      return iAmA() ? handA : handB;
    }
    function setMyHand(h) {
      if (iAmA()) handA = h;
      else handB = h;
    }
    function oppHandCount() {
      return iAmA() ? handB.length : handA.length;
    }
    function myTurn() {
      if (ended || revealing || callInFlight) return false;
      if (!liveOn) return turnIsA;
      return turnIsA ? iAmA() : !iAmA();
    }
    function setLives(meDelta, oppDelta) {
      if (iAmA()) {
        livesA = Math.max(0, livesA + meDelta);
        livesB = Math.max(0, livesB + oppDelta);
      } else {
        livesB = Math.max(0, livesB + meDelta);
        livesA = Math.max(0, livesA + oppDelta);
      }
    }
    function passTurn() {
      turnIsA = !turnIsA;
      seq += 1;
    }
    function hidePlaceholders(n, prefix) {
      const out = [];
      for (let i = 0; i < n; i++) out.push({ r: '?', s: '?', id: prefix + i });
      return out;
    }
    function maskOppFaces() {
      if (!liveOn) return;
      if (iAmA()) handB = hidePlaceholders(handB.length, 'oppB');
      else handA = hidePlaceholders(handA.length, 'oppA');
    }
    function syncOppCount(n) {
      if (!liveOn || n == null) return;
      if (iAmA()) handB = hidePlaceholders(Math.max(0, n), 'oppB');
      else handA = hidePlaceholders(Math.max(0, n), 'oppA');
    }

    function publicState(includeHands) {
      const st = {
        livesA,
        livesB,
        pileCount: pile.length,
        lastClaim: lastClaim
          ? { seatA: lastClaim.seatA, rank: lastClaim.rank, count: lastClaim.count }
          : null,
        lockedRank,
        turnIsA,
        handCountA: handA.length,
        handCountB: handB.length,
        seq,
      };
      if (includeHands) {
        st.handA = handA;
        st.handB = handB;
      }
      return st;
    }

    function pushLive(extra, includeHands) {
      if (!liveOn || !liveHandle || applying || ended) return;
      liveHandle.push(
        Object.assign(
          {
            status: 'playing',
            turn: turnIsA ? liveRoles.playerA : liveRoles.playerB,
            state: publicState(!!includeHands),
          },
          extra || {}
        )
      );
    }

    function dealBoth() {
      const deck = makeDeck(rng);
      handA = deck.splice(0, 8);
      handB = deck.splice(0, 8);
      pile = [];
      lastClaim = null;
      lockedRank = null;
      turnIsA = true;
      myPendingPlay = null;
      seq = 0;
      livesA = 3;
      livesB = 3;
      callInFlight = false;
      revealing = false;
      lastRevealId = '';
    }

    function clearPileRound() {
      pile = [];
      lastClaim = null;
      lockedRank = null;
      myPendingPlay = null;
    }

    function pileGraphic() {
      const n = pile.length;
      if (!n) {
        return `<div class="pc-bluff-pile is-empty" aria-label="Empty pile"><span>Pile</span><b>0</b></div>`;
      }
      let layers = '';
      const show = Math.min(n, 5);
      for (let i = 0; i < show; i++) {
        layers += `<span class="pc-card pc-back pc-bluff-layer" style="transform:translate(${i * 2}px,${-i * 2}px)"></span>`;
      }
      return `<div class="pc-bluff-pile" aria-label="Pile ${n} cards">${layers}<b>${n}</b></div>`;
    }

    function claimBanner() {
      if (!lastClaim) return 'No claim yet — first play sets the rank';
      const who = lastClaim.seatA === iAmA() ? 'You' : 'Opponent';
      return `Last claim: ${who} · ${lastClaim.count}× ${lastClaim.rank}${
        lockedRank ? ' · locked ' + lockedRank : ''
      }`;
    }

    function rankOptionsHtml() {
      const ranks = lockedRank ? [lockedRank] : RANKS.slice();
      return ranks
        .map(
          (r) =>
            `<option value="${esc(r)}"${r === claimPick || r === lockedRank ? ' selected' : ''}>${esc(r)}</option>`
        )
        .join('');
    }

    function checkEnd(msg) {
      if (myLives() <= 0 || oppLives() <= 0 || myHand().length === 0 || oppHandCount() === 0) {
        ended = true;
        const finalWin =
          (myHand().length === 0 && myLives() > 0) || (oppLives() <= 0 && myLives() > 0);
        if (liveOn && liveHandle) {
          liveHandle.push({
            status: 'over',
            winner: finalWin ? liveRoles.me : liveRoles.opp,
            state: publicState(false),
          });
        }
        showDuelResult(shell, {
          id: 'bluff',
          you: finalWin ? 1 : 0,
          opp: finalWin ? 0 : 1,
          glyph: '🎭',
          subtitle: msg || '',
          shareText: 'Bluff on Chaupaal',
          onAgain: () => openBluff(chat),
        });
        return true;
      }
      return false;
    }

    function paint(msg) {
      if (ended || revealing) return;
      const you = myHand();
      const mine = myTurn();
      const canCall = mine && lastClaim && lastClaim.seatA !== iAmA() && pile.length > 0 && !callInFlight;
      const canPlay = mine && you.length > 0 && !callInFlight;
      shell.body.innerHTML = `
        <div class="pc-bluff">
          <p class="pc-hint">Lives you ${myLives()} · opp ${oppLives()} · opp hand ${oppHandCount()}${
            liveOn && !mine ? ' · their turn' : mine ? ' · your turn' : ''
          }</p>
          ${pileGraphic()}
          <p class="pc-bluff-claim" role="status">${esc(claimBanner())}</p>
          <p class="pc-hint">${esc(
            msg ||
              (mine
                ? canCall
                  ? 'Call the claim — or play to accept it'
                  : 'Select 1–3 cards · claim the locked rank'
                : 'Waiting…')
          )}</p>
          <div class="pc-hand">${you.map(cardFace).join('')}</div>
          ${
            canPlay
              ? `<label class="pc-hint">Claim
            <select data-rank ${lockedRank ? 'disabled' : ''}>${rankOptionsHtml()}</select>
          </label>
          <button type="button" class="cs-hit" data-play>Play on pile</button>`
              : ''
          }
          ${
            canCall
              ? `<button type="button" class="cs-hit cs-hit--ghost" data-call>Call bluff</button>`
              : ''
          }
          <p class="pc-hint pc-tp-boot">Call or play · reveal last play only · pile clears on call</p>
        </div>`;
      const rankEl = shell.body.querySelector('[data-rank]');
      if (rankEl) {
        claimPick = lockedRank || claimPick;
        rankEl.value = claimPick;
        rankEl.addEventListener('change', () => {
          claimPick = rankEl.value;
        });
      }
      const selected = new Set();
      shell.body.querySelectorAll('.pc-hand .pc-card').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (!mine || callInFlight) return;
          if (selected.has(btn.dataset.cid)) {
            selected.delete(btn.dataset.cid);
            btn.classList.remove('is-sel');
          } else if (selected.size < 3) {
            selected.add(btn.dataset.cid);
            btn.classList.add('is-sel');
          }
        });
      });
      shell.body.querySelector('[data-play]')?.addEventListener('click', () => doPlay(selected));
      shell.body.querySelector('[data-call]')?.addEventListener('click', () => doCall());
      if (!liveOn && !mine && !ended) scheduleAi();
    }

    function showReveal(payload, thenFn) {
      revealing = true;
      callInFlight = false;
      const cards = (payload.cards || []).slice();
      const honest = !!payload.honest;
      const verdict = honest ? 'False call!' : 'Caught!';
      const detail =
        payload.msg ||
        (honest ? 'Claim was true — caller loses a life.' : 'Claim was a bluff — claimer loses a life.');
      if (honest) buzz('win', { noConfetti: true });
      else buzz('lose', { noConfetti: true });
      shell.body.innerHTML = `
        <div class="pc-bluff">
          <div class="pc-bluff-reveal ${honest ? 'is-honest' : 'is-caught'}" role="status">
            <p class="pc-bluff-reveal-verdict">${esc(verdict)}</p>
            <div class="pc-hand pc-bluff-reveal-cards">${cards.map(cardFace).join('') || '<span class="pc-hint">—</span>'}</div>
            <p class="pc-hint">${esc(detail)}</p>
            <p class="pc-hint">Lives you ${myLives()} · opp ${oppLives()}</p>
          </div>
        </div>`;
      if (revealTimer) clearTimeout(revealTimer);
      revealTimer = setTimeout(() => {
        revealTimer = 0;
        revealing = false;
        if (typeof thenFn === 'function') thenFn();
      }, 1600);
    }

    /**
     * Evaluate + score a call. Cards = last play only.
     * Live: only the claimer (with myPendingPlay) can evaluate.
     */
    function resolveCall(callerIsMe) {
      if (!lastClaim || !pile.length) return null;
      const claimerIsA = lastClaim.seatA;
      const count = lastClaim.count;
      let cards;
      let honest;
      if (claimerIsA === iAmA() && myPendingPlay && myPendingPlay.cards) {
        cards = myPendingPlay.cards.map((c) => ({ r: c.r, s: c.s, id: c.id }));
        honest = cards.every((c) => c.r === lastClaim.rank);
      } else if (!liveOn) {
        cards = pile.slice(-count).map((c) => ({ r: c.r, s: c.s, id: c.id }));
        honest = cards.every((c) => c.r === lastClaim.rank);
      } else {
        return null;
      }

      if (honest) {
        if (callerIsMe) setLives(-1, 0);
        else setLives(0, -1);
        turnIsA = claimerIsA;
      } else {
        if (claimerIsA === iAmA()) setLives(-1, 0);
        else setLives(0, -1);
        turnIsA = callerIsMe ? iAmA() : true;
      }
      seq += 1;
      clearPileRound();
      const msg = honest
        ? 'False call! Claim was true — caller loses a life.'
        : 'Caught! Bluff revealed — claimer loses a life.';
      return {
        honest,
        cards,
        msg,
        claimerIsA,
        callerIsMe,
        revealId: 'r' + seq + '-' + Date.now(),
      };
    }

    function finishAfterReveal(result) {
      if (checkEnd(result.msg)) return;
      paint(result.msg + ' Fresh claim window.');
    }

    function doPlay(selectedSet) {
      if (!myTurn() || ended) return;
      const selected = selectedSet || new Set();
      let rank = lockedRank || (shell.body.querySelector('[data-rank]') || {}).value || claimPick;
      if (lockedRank) rank = lockedRank;
      if (!selected.size) {
        buzz('invalid');
        paint('Pick 1–3 cards');
        return;
      }
      if (!rank) {
        buzz('invalid');
        return;
      }
      const hand = myHand().slice();
      const played = hand.filter((c) => selected.has(c.id));
      if (!played.length || played.length > 3) {
        buzz('invalid');
        return;
      }
      played.forEach((c) => {
        const ix = hand.findIndex((x) => x.id === c.id);
        if (ix >= 0) hand.splice(ix, 1);
      });
      setMyHand(hand);
      const cards = played.map((c) => ({ r: c.r, s: c.s, id: c.id }));
      const honest = cards.every((c) => c.r === rank);
      pile = pile.concat(played);
      if (!lockedRank) lockedRank = rank;
      lastClaim = { seatA: iAmA(), rank, count: cards.length };
      myPendingPlay = { honest, cards };
      claimPick = rank;
      buzz('card');
      passTurn();
      // Shared: claim + counts only — no honest, no card faces
      pushLive({ act: 'play', by: liveRoles && liveRoles.me }, false);
      if (checkEnd('Played out')) return;
      paint(
        lastClaim.seatA === iAmA()
          ? `Played ${cards.length}× ${rank} face-down`
          : `Played ${cards.length}× ${rank} face-down`
      );
    }

    function doCall() {
      if (!myTurn() || ended || callInFlight || revealing) return;
      if (!lastClaim || lastClaim.seatA === iAmA() || !pile.length) return;
      callInFlight = true;
      if (liveOn) {
        pushLive({ act: 'call', callBy: liveRoles.me }, false);
        paint('Calling…');
        return;
      }
      const result = resolveCall(true);
      if (!result) {
        callInFlight = false;
        return;
      }
      lastRevealId = result.revealId;
      showReveal(result, () => finishAfterReveal(result));
    }

    function publishReveal(result) {
      lastRevealId = result.revealId;
      if (!liveOn || !liveHandle || ended) return;
      // Must push even when inside applyRemote (applying=true would block pushLive)
      liveHandle.push({
        status: 'playing',
        turn: turnIsA ? liveRoles.playerA : liveRoles.playerB,
        act: 'reveal',
        reveal: {
          id: result.revealId,
          cards: result.cards,
          honest: result.honest,
          livesA,
          livesB,
          msg: result.msg,
          turnIsA,
          seq,
        },
        state: publicState(false),
      });
    }

    function applyReveal(rev, fromRemote) {
      if (!rev || !rev.id || rev.id === lastRevealId) return;
      lastRevealId = rev.id;
      if (fromRemote) {
        if (rev.livesA != null) livesA = rev.livesA;
        if (rev.livesB != null) livesB = rev.livesB;
        if (rev.turnIsA != null) turnIsA = !!rev.turnIsA;
        if (rev.seq != null) seq = Math.max(seq, Number(rev.seq) || 0);
        clearPileRound();
      }
      callInFlight = false;
      const payload = {
        honest: !!rev.honest,
        cards: (rev.cards || []).map((c) => ({ r: c.r, s: c.s, id: c.id || c.r + c.s })),
        msg: rev.msg,
      };
      showReveal(payload, () => finishAfterReveal(payload));
    }

    function applyRemote(val) {
      const st = val.state || {};
      const act = val.act;
      applying = true;

      if (act === 'deal' && st.handA && st.handB) {
        handA = st.handA.slice();
        handB = st.handB.slice();
        maskOppFaces();
        dealtLive = true;
      }

      if (act !== 'reveal') {
        if (st.livesA != null) livesA = st.livesA;
        if (st.livesB != null) livesB = st.livesB;
        if (st.pileCount != null) {
          if (st.pileCount === 0) pile = [];
          else if (st.pileCount > pile.length) {
            while (pile.length < st.pileCount) pile.push({ r: '?', s: '?', id: 'hid' + pile.length });
          } else if (st.pileCount < pile.length) {
            pile = pile.slice(0, st.pileCount);
          }
        }
        if (st.lastClaim) {
          lastClaim = {
            seatA: !!st.lastClaim.seatA,
            rank: st.lastClaim.rank,
            count: st.lastClaim.count,
          };
        } else if (st.lastClaim === null) lastClaim = null;
        if (st.lockedRank !== undefined) lockedRank = st.lockedRank;
        if (st.turnIsA != null) turnIsA = !!st.turnIsA;
        if (st.seq != null) seq = Math.max(seq, Number(st.seq) || 0);
        if (dealtLive) {
          if (iAmA() && st.handCountB != null) syncOppCount(st.handCountB);
          if (!iAmA() && st.handCountA != null) syncOppCount(st.handCountA);
        }
      }

      // Call → claimer evaluates secretly, then pushes reveal once
      if (act === 'call' && val.callBy && val.callBy !== liveRoles.me) {
        if (lastClaim && lastClaim.seatA === iAmA() && myPendingPlay && myPendingPlay.cards) {
          const result = resolveCall(false);
          if (result) {
            publishReveal(result);
            applying = false;
            showReveal(result, () => finishAfterReveal(result));
            return;
          }
        }
        applying = false;
        paint('Call pending…');
        return;
      }

      if (act === 'reveal' && val.reveal) {
        applying = false;
        if (val.turn != null) turnIsA = val.turn === liveRoles.playerA;
        applyReveal(val.reveal, true);
        return;
      }

      // Legacy callResult → treat as reveal without cards if somehow present
      if (act === 'callResult' && val.callResult) {
        applying = false;
        applyReveal(
          {
            id: 'legacy-' + seq,
            honest: val.callResult.honest,
            cards: [],
            livesA: val.callResult.livesA,
            livesB: val.callResult.livesB,
            msg: val.callResult.msg,
            turnIsA: st.turnIsA,
            seq,
          },
          true
        );
        return;
      }

      if (act === 'play') {
        // Own play echo must keep myPendingPlay secret until Call/reveal
        if (val.by && val.by !== liveRoles.me) myPendingPlay = null;
        callInFlight = false;
      }

      applying = false;
      if (val.turn != null) turnIsA = val.turn === liveRoles.playerA;
      paint(
        act === 'play'
          ? 'Opponent played — Call or play to accept'
          : act === 'deal'
            ? 'Dealt — first play sets the rank'
            : undefined
      );
    }

    function scheduleAi() {
      if (aiTimer) clearTimeout(aiTimer);
      aiTimer = setTimeout(() => {
        aiTimer = 0;
        if (ended || myTurn() || liveOn || revealing || callInFlight) return;
        runAi();
      }, 700 + Math.floor(rng() * 600));
    }

    function runAi() {
      if (ended || turnIsA || revealing) return;
      // Mild Call bias — still uses fair reveal (reads pile tip only at call time)
      if (lastClaim && lastClaim.seatA === true && pile.length && rng() < 0.32) {
        const result = resolveCall(false);
        if (result) {
          lastRevealId = result.revealId;
          showReveal(result, () => finishAfterReveal(result));
          return;
        }
      }
      // Playing accepts prior claim
      if (!handB.length) {
        checkEnd('Opponent empty');
        return;
      }
      const rank = lockedRank || handB[0].r;
      const matching = handB.filter((c) => c.r === rank);
      const useHonest = matching.length > 0 && rng() < 0.55;
      let played;
      if (useHonest) {
        played = matching.slice(0, 1 + (matching.length > 1 && rng() < 0.3 ? 1 : 0));
      } else {
        played = handB.slice(0, Math.min(handB.length, 1 + (rng() < 0.25 ? 1 : 0)));
      }
      played.forEach((c) => {
        const ix = handB.findIndex((x) => x.id === c.id);
        if (ix >= 0) handB.splice(ix, 1);
      });
      const cards = played.map((c) => ({ r: c.r, s: c.s, id: c.id }));
      pile = pile.concat(played);
      if (!lockedRank) lockedRank = rank;
      lastClaim = { seatA: false, rank, count: cards.length };
      buzz('card');
      passTurn();
      if (checkEnd('Opponent played out')) return;
      paint(`Opponent played ${cards.length}× ${rank} — Call or play`);
    }

    if (liveOn) {
      const joined = joinLive(shell, chat, 'bluff', (val) => {
        if (!val || ended) return;
        if (val.status === 'forfeit' || val.status === 'over') {
          ended = true;
          const iWon = val.winner === liveRoles.me;
          showDuelResult(shell, {
            id: 'bluff',
            you: iWon ? 1 : 0,
            opp: iWon ? 0 : 1,
            glyph: '🎭',
            title:
              val.status === 'forfeit'
                ? iWon
                  ? 'Opponent left'
                  : 'You forfeited'
                : iWon
                  ? 'You win'
                  : 'You lose',
            shareText: 'Bluff on Chaupaal',
            onAgain: () => openBluff(chat),
          });
          return;
        }
        applyRemote(val);
      });
      if (joined) {
        liveHandle = joined.handle;
        liveRoles = joined.roles;
        if (liveRoles.host) {
          dealBoth();
          pushLive({ act: 'deal' }, true);
          maskOppFaces();
          dealtLive = true;
          paint('Dealt — first play sets the rank');
        } else {
          shell.body.innerHTML = `<p class="pc-hint">Waiting for deal…</p>`;
        }
      }
    } else {
      dealBoth();
      paint('Dealt — Call or play · last play reveals on call');
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
      { id: 'carrom', name: 'Carrom', desc: 'Live · stakes · AI', icon: '🪙', genre: 'board', launch: openCarrom, order: 31 },
      { id: 'pool', name: 'Pool', desc: 'Clear the felt', icon: '🎱', genre: 'board', launch: openPool, order: 32 },
      { id: 'rummy', name: 'Rummy', desc: 'Runs and sets', icon: '🃏', genre: 'party', launch: openRummy, order: 33 },
      { id: 'teenpatti', name: 'Teen Patti', desc: 'Boot, chaal, side-show · virtual chips', icon: '♠', genre: 'party', launch: openTeenPatti, order: 34 },
      { id: 'bluff', name: 'Bluff', desc: 'Call · reveal · clear', icon: '🎭', genre: 'party', launch: openBluff, order: 35 },
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
