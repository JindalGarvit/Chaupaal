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
    const isPool = spec.id === 'pool' || spec.variant === 'pool';
    const cueSub = liveOn
      ? liveSub()
      : isCarrom
        ? 'Practice · AI'
        : isPool
          ? practiceSub(spec.subtitle || '8-ball · kitchen break')
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
      leaveBody: (isCarrom || isPool) && !liveOn ? 'Resign counts as a loss vs AI.' : undefined,
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
    const settleMatchId = liveOn ? String(matchIdFor(chat, spec.id || 'carrom') || '').trim() : '';
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
    } else if (isPool && liveOn) {
      setChromeSubtitle('Live 1v1 · Pool' + (liveStake > 0 ? ' · Stake ⚡' + liveStake + ' (virtual)' : ' · Friendly'));
    } else if (isPool) {
      setChromeSubtitle('Practice · 8-ball · ' + (DIFF_LABEL[difficulty] || 'Medium') + ' AI');
    }

    let coachDismissed = false;
    try {
      coachDismissed = localStorage.getItem(spec.coachKey || (isPool ? 'chaupaal_pool_coach_v1' : 'chaupaal_cue_coach_v1')) === '1';
    } catch (e) {}

    const coachCopy = isCarrom
      ? liveOn
        ? 'You are ' +
          (youColor === 'white' ? 'White (host breaks)' : 'Black') +
          '. Same Queen/foul rules. Only shoot on your turn.'
        : 'You shoot from the near baseline; AI from the far. Cover the Queen after one of yours.'
      : isPool
        ? 'Break from the kitchen. Open → solids/stripes → 8 last. Live syncs groups. Practice AI shoots for real.'
        : 'Drag back on the cue ball to aim, release to shoot.';

    shell.body.innerHTML = `<div class="pc-cue${isCarrom ? ' pc-cue--carrom' : ''}${isPool ? ' pc-cue--pool' : ''}">
      ${
        !coachDismissed && (isCarrom || isPool)
          ? `<div class="pc-cue-coach" data-cue-coach><span>${coachCopy}</span><button type="button" data-cue-coach-x>Got it</button></div>`
          : ''
      }
      <div class="pc-cue-hud" data-cue-hud>You 0 · Opp 0</div>
      <canvas data-cue aria-label="${spec.title || 'Cue'} board"></canvas>
      <p class="pc-hint" data-cue-hint>${
        isCarrom
          ? liveOn
            ? 'Connecting…'
            : breaker === 'you'
              ? 'Your break — drag back on the striker.'
              : 'AI breaks…'
          : isPool
            ? 'Break from the kitchen — drag cue sideways to place, then pull back to shoot.'
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
          localStorage.setItem(
            spec.coachKey || (isPool ? 'chaupaal_pool_coach_v1' : 'chaupaal_cue_coach_v1'),
            '1'
          );
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
    /** Pool: head at bottom; kitchen is behind (below) the head string. */
    const headStringY = () => H * (spec.headStringY != null ? spec.headStringY : 0.72);
    const kitchenY = () => H * (spec.kitchenY != null ? spec.kitchenY : youBaseFrac);
    const centerX = () => W / 2;
    const centerY = () => H * 0.42;
    let balls = [];
    let dragging = null;
    let aim = { x: 0, y: 0 };
    let youPocketed = 0;
    let oppPocketed = 0;
    let moving = false;
    let ended = false;
    let myTurn =
      isCarrom && liveOn ? false : isPool && !liveOn ? breaker === 'you' : !isCarrom ? true : breaker === 'you';
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
    // Pool 8-ball law (Prompt 2)
    let openTable = true;
    let youGroup = null; // 'solid' | 'stripe'
    let oppGroup = null;
    let scratchThisStroke = false;
    let strokeIsBreak = false;
    let firstContactGroup = null;

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
      } else if (isPool) {
        const gLabel = (g) => (g === 'solid' ? 'Solids' : g === 'stripe' ? 'Stripes' : 'Open');
        const yLeft = youGroup
          ? balls.filter((b) => !b.dead && !b.cue && poolBallGroup(b) === youGroup).length
          : '—';
        const oLeft = oppGroup
          ? balls.filter((b) => !b.dead && !b.cue && poolBallGroup(b) === oppGroup).length
          : '—';
        const eightLive = balls.some((b) => !b.dead && (b.kind === 'eight' || b.num === 8));
        const eightOn = !!(youGroup && groupIsClear('you'));
        const turn = ended
          ? 'Over'
          : moving
            ? 'Balls moving…'
            : myTurn
              ? breakDone
                ? 'Your shot'
                : 'Your break'
              : liveOn
                ? 'Opp turn'
                : 'AI turn';
        hud.innerHTML =
          `<div class="pc-cue-hud-row">You: <b>${gLabel(youGroup)}</b> (${yLeft}) · Opp: <b>${gLabel(oppGroup)}</b> (${oLeft})` +
          (openTable ? ' · table open' : '') +
          `</div><div class="pc-cue-hud-row">${
            eightOn ? '<b>8-ball is on</b> · ' : eightLive ? '8 live · ' : '8 down · '
          }${turn}</div>`;
      } else {
        hud.textContent = `You ${youPocketed} · Opp ${oppPocketed}`;
      }
    }

    function poolBallGroup(b) {
      if (!b || b.cue) return '';
      if (b.kind === 'eight' || b.num === 8) return 'eight';
      if (b.group === 'stripe' || b.stripe || (b.num != null && b.num >= 9)) return 'stripe';
      return 'solid';
    }

    function groupIsClear(seat) {
      const g = seat === 'you' ? youGroup : oppGroup;
      if (!g) return false;
      return !balls.some((b) => !b.dead && !b.cue && poolBallGroup(b) === g);
    }

    function assignPoolGroups(seat, group) {
      openTable = false;
      if (seat === 'you') {
        youGroup = group;
        oppGroup = group === 'solid' ? 'stripe' : 'solid';
      } else {
        oppGroup = group;
        youGroup = group === 'solid' ? 'stripe' : 'solid';
      }
    }

    function poolLiveGroups() {
      if (!liveRoles) return { groupA: youGroup, groupB: oppGroup, openTable: !!openTable };
      if (liveRoles.me === liveRoles.playerA) {
        return { groupA: youGroup, groupB: oppGroup, openTable: !!openTable };
      }
      return { groupA: oppGroup, groupB: youGroup, openTable: !!openTable };
    }

    function buildPoolLiveState(extra) {
      const e = extra || {};
      const scores =
        liveRoles && liveRoles.me === liveRoles.playerA
          ? { a: countGroupPocketed('you'), b: countGroupPocketed('opp') }
          : liveRoles
            ? { a: countGroupPocketed('opp'), b: countGroupPocketed('you') }
            : { a: countGroupPocketed('you'), b: countGroupPocketed('opp') };
      const cue = cueBall();
      const cueInKitchen = !!(cue && !cue.dead && cue.y >= kitchenY() - 10);
      return Object.assign(
        {
          balls: snapshotBalls(),
          scores,
          phase: 'settled',
          breakDone: !!breakDone,
          hint: lastHint || '',
          cueInKitchen,
          eightLive: balls.some((b) => !b.dead && poolBallGroup(b) === 'eight'),
        },
        poolLiveGroups(),
        e
      );
    }

    function poolReasonCode(meta) {
      const m = meta || {};
      if (m.forfeit || m.resign) return 'forfeit';
      if (m.reasonCode) return String(m.reasonCode);
      const r = String(m.reason || '');
      if (r === '8-ball' || r === 'eight') return 'eight';
      if (r.indexOf('Early') >= 0 || r === 'earlyEight') return 'earlyEight';
      if (r.indexOf('Scratch') >= 0 || r === 'scratchEight') return 'scratchEight';
      if (r.indexOf('Foul on the 8') >= 0 || r === 'foulEight') return 'foulEight';
      return r || 'eight';
    }

    function poolReasonLabel(code, won) {
      const c = String(code || '');
      if (c === 'forfeit') return won ? 'Opponent left' : 'Forfeit';
      if (c === 'eight') return won ? '8-ball in' : 'Opponent sank the 8';
      if (c === 'earlyEight') return won ? 'Opponent early 8' : 'Early 8 — loss';
      if (c === 'scratchEight') return won ? 'Opponent scratched on the 8' : 'Scratch on the 8 — loss';
      if (c === 'foulEight') return won ? 'Opponent fouled on the 8' : 'Foul on the 8 — loss';
      return won ? 'Win' : 'Loss';
    }

    function applyPoolGroupsFromState(st) {
      if (!st || !liveRoles) return;
      if (st.openTable != null) openTable = !!st.openTable;
      const gA = st.groupA || null;
      const gB = st.groupB || null;
      if (liveRoles.me === liveRoles.playerA) {
        youGroup = gA;
        oppGroup = gB;
      } else {
        youGroup = gB;
        oppGroup = gA;
      }
    }

    function countGroupPocketed(seat) {
      const g = seat === 'you' ? youGroup : oppGroup;
      if (!g) return 0;
      return balls.filter((b) => b.dead && !b.cue && poolBallGroup(b) === g).length;
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
      const by = isCarrom ? seatBaselineY(seat) : isPool ? kitchenY() : baselineY();
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
        if (isPool) hint.textContent = 'Scratch — cue ball back in the kitchen.';
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
        group: b.group || '',
        num: b.num != null ? b.num : null,
        stripe: !!b.stripe,
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
        group: b.group || '',
        num: b.num != null ? b.num : null,
        stripe: !!b.stripe,
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
          ? { a: isPool ? countGroupPocketed('you') : youPocketed, b: isPool ? countGroupPocketed('opp') : oppPocketed }
          : { a: isPool ? countGroupPocketed('opp') : oppPocketed, b: isPool ? countGroupPocketed('you') : youPocketed };
      liveHandle.push({
        baseVersion: seq,
        status: 'playing',
        turn: liveRoles.opp,
        state: isPool
          ? buildPoolLiveState({ phase: 'settled', scores })
          : {
              balls: snapshotBalls(),
              scores,
              phase: 'settled',
              breakDone: !!breakDone,
              hint: lastHint || '',
            },
      });
      if (typeof DangalLive !== 'undefined' && DangalLive.pingTurn) {
        DangalLive.pingTurn(liveRoles.opp, spec.id, { chatId: chat && (chat.firestoreId || chat.id) });
      }
      myTurn = false;
      hint.textContent = lastHint ? lastHint + ' Opponent’s shot…' : 'Opponent’s shot…';
      updateHud();
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
      if (!c) return;
      // Pool: lateral place in kitchen (esp. before/during break); Carrom: baseline place
      if (isCarrom) {
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
        return;
      }
      if (isPool) {
        const pull = Math.hypot(c.x - x, c.y - y);
        const inKitchen = c.y >= headStringY() - 6;
        if (inKitchen && pull < 30 && Math.abs(x - c.x) > Math.abs(y - c.y) * 0.85) {
          dragging.mode = 'place';
          c.x = Math.min(baselineXMax(), Math.max(baselineXMin(), x));
          c.y = Math.min(H - cueR - 4, Math.max(headStringY() + cueR + 2, kitchenY()));
          cueHomeX = c.x;
          dragging.placed = true;
        } else if (pull >= 30) {
          dragging.mode = 'aim';
        }
      }
    });
    canvas.addEventListener('pointerup', () => {
      if (!dragging) return;
      const c = cueBall();
      const wasPlace = dragging.mode === 'place' && dragging.placed;
      dragging = null;
      if (!c || !canHumanAim()) return;
      if (wasPlace) {
        hint.textContent = isPool
          ? breakDone
            ? 'Cue placed in kitchen — drag back to shoot.'
            : 'Break placed — drag back to shoot.'
          : 'Striker placed — drag back to shoot.';
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
      scratchThisStroke = false;
      firstContactGroup = null;
      strokeIsBreak = isPool && !breakDone;
      if (isPool && !breakDone) breakDone = true;
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
          if (isCarrom || isPool) {
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
          } else if (isPool) {
            scratchThisStroke = true;
            b.dead = true;
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
              if (isPool && !firstContactGroup) {
                if (a.cue && !b.cue) firstContactGroup = poolBallGroup(b);
                else if (b.cue && !a.cue) firstContactGroup = poolBallGroup(a);
              }
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

    function passPoolTurn(msg) {
      lastHint = msg || '';
      hint.textContent = msg || '';
      youPocketed = countGroupPocketed('you');
      oppPocketed = countGroupPocketed('opp');
      updateHud();
      scratchThisStroke = false;
      strokePocketed = [];
      firstContactGroup = null;
      strokeIsBreak = false;
      if (liveOn) {
        pushSettle();
        return;
      }
      if (strokeSeat === 'you') {
        myTurn = false;
        hint.textContent = (msg ? msg + ' ' : '') + 'Opponent’s turn…';
        if (isPool) schedulePoolAiTurn();
        else if (shell.gs && shell.gs.schedule) shell.gs.schedule(aiTurn, 650);
        else setTimeout(aiTurn, 650);
      } else {
        myTurn = true;
        hint.textContent = (msg ? msg + ' ' : '') + 'Your shot.';
        updateHud();
      }
    }

    function keepPoolTurn(msg) {
      lastHint = msg || '';
      hint.textContent = msg || 'Nice — shoot again.';
      youPocketed = countGroupPocketed('you');
      oppPocketed = countGroupPocketed('opp');
      scratchThisStroke = false;
      strokePocketed = [];
      firstContactGroup = null;
      strokeIsBreak = false;
      myTurn = strokeSeat === 'you';
      updateHud();
      if (liveOn && strokeSeat === 'you' && liveHandle && liveRoles && !applying) {
        liveHandle.push({
          baseVersion: seq,
          status: 'playing',
          turn: liveRoles.me,
          state: buildPoolLiveState({ phase: 'settled', breakDone: true, hint: lastHint }),
        });
      } else if (!liveOn && strokeSeat === 'opp') {
        if (isPool) schedulePoolAiTurn();
        else if (shell.gs && shell.gs.schedule) shell.gs.schedule(aiTurn, 500);
        else setTimeout(aiTurn, 500);
      }
    }

    /**
     * Pool 8-ball settle.
     * House: 8 on break → re-spot (no loss). Ball-in-hand = kitchen.
     * Early 8 after break → loss. Scratch on 8 → loss.
     */
    function resolvePoolStroke() {
      const seat = strokeSeat;
      const pocketed = strokePocketed.filter((b) => b && !b.cue);
      const solidsHit = pocketed.filter((b) => poolBallGroup(b) === 'solid');
      const stripesHit = pocketed.filter((b) => poolBallGroup(b) === 'stripe');
      const eightHit = pocketed.filter((b) => poolBallGroup(b) === 'eight');
      const scratched = scratchThisStroke;
      const who = seat === 'you' ? 'You' : 'Opp';
      const seatGroup = seat === 'you' ? youGroup : oppGroup;

      if (scratched) {
        resetCueToBaseline({ foul: true, seat: seat === 'you' ? 'you' : 'opp' });
      }

      if (eightHit.length) {
        if (strokeIsBreak) {
          eightHit.forEach((b) => {
            b.dead = false;
            placeAtCenter(b);
          });
          if (!scratched) {
            if (solidsHit.length && !stripesHit.length) assignPoolGroups(seat, 'solid');
            else if (stripesHit.length && !solidsHit.length) assignPoolGroups(seat, 'stripe');
          }
          if (scratched) {
            passPoolTurn('Foul — cue in kitchen. 8 re-spotted.');
            return;
          }
          if (solidsHit.length || stripesHit.length) {
            keepPoolTurn(
              openTable
                ? who + ' pocketed on the break — table still open (8 re-spotted).'
                : who + ': group set — 8 re-spotted. Shoot again.'
            );
            return;
          }
          passPoolTurn('Break — 8 re-spotted.');
          return;
        }

        if (scratched) {
          if (seatGroup && groupIsClear(seat)) {
            finish(seat !== 'you', { reason: 'Scratch on the 8', reasonCode: 'scratchEight' });
            return;
          }
          finish(seat !== 'you', { reason: 'Foul on the 8', reasonCode: 'foulEight' });
          return;
        }

        if (!seatGroup || !groupIsClear(seat)) {
          finish(seat !== 'you', { reason: 'Early 8-ball — loss', reasonCode: 'earlyEight' });
          return;
        }

        finish(seat === 'you', { reason: '8-ball', reasonCode: 'eight' });
        return;
      }

      if (scratched) {
        passPoolTurn('Foul — cue in kitchen.');
        return;
      }

      if (openTable) {
        if (solidsHit.length && !stripesHit.length) {
          assignPoolGroups(seat, 'solid');
          keepPoolTurn(who + ': Solids. Opp has Stripes.');
          return;
        }
        if (stripesHit.length && !solidsHit.length) {
          assignPoolGroups(seat, 'stripe');
          keepPoolTurn(who + ': Stripes. Opp has Solids.');
          return;
        }
        if (solidsHit.length && stripesHit.length) {
          passPoolTurn(who + ': mixed colours — table still open.');
          return;
        }
        passPoolTurn(who + ': miss.');
        return;
      }

      const ownHit = pocketed.filter((b) => poolBallGroup(b) === seatGroup);
      const oppG = seat === 'you' ? oppGroup : youGroup;
      const oppHit = pocketed.filter((b) => poolBallGroup(b) === oppG);

      if (ownHit.length) {
        const msg = groupIsClear(seat)
          ? who + ': group clear — 8-ball is on.'
          : who + ': nice — keep shooting.';
        keepPoolTurn(msg);
        return;
      }
      if (oppHit.length) {
        passPoolTurn(who + ': opponent ball — turn ends.');
        return;
      }
      passPoolTurn(who + ': miss.');
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


    function poolAiLegalTargets() {
      if (openTable) {
        return balls.filter((b) => !b.dead && !b.cue && poolBallGroup(b) !== 'eight');
      }
      if (oppGroup && groupIsClear('opp')) {
        return balls.filter((b) => !b.dead && poolBallGroup(b) === 'eight');
      }
      if (oppGroup) {
        return balls.filter((b) => !b.dead && !b.cue && poolBallGroup(b) === oppGroup);
      }
      return balls.filter((b) => !b.dead && !b.cue && poolBallGroup(b) !== 'eight');
    }

    /** After scratch foul, cue is in kitchen; if missing/dead, auto-place in kitchen. */
    function ensurePoolAiCue() {
      let c = cueBall();
      if (c && !c.dead) return c;
      let sx = W * (0.38 + Math.random() * 0.24);
      for (let tries = 0; tries < 10; tries++) {
        const blocked = balls.some(
          (b) => !b.dead && !b.cue && Math.hypot(b.x - sx, b.y - kitchenY()) < ballRadius(b) + cueR + 2
        );
        if (!blocked) break;
        sx = baselineXMin() + Math.random() * (baselineXMax() - baselineXMin());
      }
      resetCueToBaseline({ seat: 'you', x: sx });
      return cueBall();
    }

    function planPoolAiShot() {
      const c = cueBall();
      if (!c) return { vx: 0, vy: -6, aimX: centerX(), aimY: centerY() };
      const diff = difficulty;
      const jitter = diff === 'easy' ? 0.4 : diff === 'hard' ? 0.08 : 0.2;
      const maxP = diff === 'easy' ? 8.2 : diff === 'hard' ? 12.2 : 10.2;
      const minP = diff === 'easy' ? 3.4 : 4.6;
      const targets = poolAiLegalTargets();
      const candidates = [];

      function foulRiskToward(dx, dy) {
        const mag = Math.hypot(dx, dy) || 1;
        let risk = 0;
        (pockets || []).forEach((p) => {
          const px = p[0] * W;
          const py = p[1] * H;
          if (Math.hypot(c.x - px, c.y - py) > pocketR * 3.5) return;
          const along = ((px - c.x) * dx + (py - c.y) * dy) / mag;
          if (along > 0) risk += 1;
        });
        return risk;
      }

      function clearish(x1, y1, x2, y2, skip) {
        let hits = 0;
        balls.forEach((o) => {
          if (o.dead || o.cue || o === skip) return;
          if (distPointSeg(o.x, o.y, x1, y1, x2, y2) < ballRadius(o) + ballR * 0.9) hits += 1;
        });
        return hits;
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
          score: score - risk * (diff === 'easy' ? 0.8 : 5),
          tag,
          tx,
          ty,
        });
      }

      targets.forEach((ball) => {
        (pockets || []).forEach((p) => {
          const px = p[0] * W;
          const py = p[1] * H;
          const pdx = px - ball.x;
          const pdy = py - ball.y;
          const pmag = Math.hypot(pdx, pdy) || 1;
          const ux = pdx / pmag;
          const uy = pdy / pmag;
          const sep = ballRadius(ball) + cueR;
          const gx = ball.x - ux * sep;
          const gy = ball.y - uy * sep;
          const blocked =
            clearish(c.x, c.y, gx, gy, ball) + clearish(ball.x, ball.y, px, py, ball);
          const dist = Math.hypot(gx - c.x, gy - c.y);
          const power = dist / 22 + pmag / 38;
          let score = 26 - blocked * 7 - pmag / 26;
          if (poolBallGroup(ball) === 'eight') score += diff === 'hard' ? 12 : 5;
          if (diff === 'easy') score += (Math.random() - 0.5) * 22;
          addCand(gx, gy, power, score, 'pocket');
        });
        addCand(
          ball.x + (Math.random() - 0.5) * (diff === 'easy' ? 44 : 14),
          ball.y + (Math.random() - 0.5) * (diff === 'easy' ? 44 : 14),
          minP + Math.random() * 2.2,
          7 - clearish(c.x, c.y, ball.x, ball.y, ball) * 3,
          'contact'
        );
      });

      if (!candidates.length) {
        const any = balls.find((b) => !b.dead && !b.cue) || { x: centerX(), y: centerY() };
        addCand(any.x, any.y, minP + 1.2, 1, 'nudge');
      }

      candidates.sort((a, b) => b.score - a.score);
      let pick = candidates[0] || { vx: 0, vy: -5, score: 0, tx: centerX(), ty: centerY() };

      if (diff === 'hard') {
        const top = candidates.slice(0, Math.min(6, candidates.length));
        pick = top[Math.floor(Math.random() * Math.min(3, top.length))] || pick;
      } else if (diff === 'medium') {
        const n = Math.min(5, candidates.length);
        pick = candidates[Math.floor(Math.random() * n)] || pick;
      } else {
        pick = candidates[Math.floor(Math.random() * candidates.length)] || pick;
      }

      const ang = Math.atan2(pick.vy, pick.vx) + (Math.random() - 0.5) * jitter * 2;
      let pow = Math.hypot(pick.vx, pick.vy) * (1 + (Math.random() - 0.5) * jitter);
      pow = Math.max(2.8, Math.min(14, pow));
      return {
        vx: Math.cos(ang) * pow,
        vy: Math.sin(ang) * pow,
        tag: pick.tag,
        aimX: pick.tx != null ? pick.tx : c.x + Math.cos(ang) * 90,
        aimY: pick.ty != null ? pick.ty : c.y + Math.sin(ang) * 90,
      };
    }

    function schedulePoolAiTurn() {
      if (ended || liveOn || !isPool) return;
      myTurn = false;
      hint.textContent = 'AI aiming…';
      updateHud();
      if (oppTimer) clearTimeout(oppTimer);
      const think =
        difficulty === 'easy'
          ? 400 + Math.random() * 280
          : difficulty === 'hard'
            ? 520 + Math.random() * 320
            : 450 + Math.random() * 380;
      oppTimer = setTimeout(() => {
        oppTimer = 0;
        if (ended || !shell.alive() || liveOn) return;
        if (pauseCtrl && pauseCtrl.isPaused()) {
          schedulePoolAiTurn();
          return;
        }
        if (moving) {
          oppTimer = setTimeout(() => {
            oppTimer = 0;
            if (!ended && !moving && !liveOn) firePoolAiShot();
          }, 260);
          return;
        }
        firePoolAiShot();
      }, Math.min(900, Math.max(400, think)));
    }

    function firePoolAiShot() {
      if (ended || liveOn || moving || !isPool) return;
      const c0 = ensurePoolAiCue();
      if (!c0) {
        myTurn = true;
        hint.textContent = 'Your shot.';
        updateHud();
        return;
      }
      const shot = planPoolAiShot();
      aiAim = {
        x: shot.aimX,
        y: shot.aimY,
        until: (typeof performance !== 'undefined' ? performance.now() : Date.now()) + 420,
      };
      hint.textContent = 'AI aiming…';
      updateHud();
      if (oppTimer) clearTimeout(oppTimer);
      oppTimer = setTimeout(() => {
        oppTimer = 0;
        if (ended || !shell.alive() || moving || liveOn) return;
        strokeSeat = 'opp';
        strokePocketed = [];
        scratchThisStroke = false;
        firstContactGroup = null;
        strokeIsBreak = !breakDone;
        if (!breakDone) breakDone = true;
        movingFrames = 0;
        const cue = cueBall();
        if (!cue || cue.dead) {
          myTurn = true;
          hint.textContent = 'Your shot.';
          updateHud();
          return;
        }
        let vx = shot.vx;
        let vy = shot.vy;
        if (Math.hypot(vx, vy) < 2.6) {
          const ang = Math.atan2(vy || -1, vx || 0);
          vx = Math.cos(ang) * 3.4;
          vy = Math.sin(ang) * 3.4;
        }
        cue.vx = vx;
        cue.vy = vy;
        moving = true;
        hint.textContent = 'AI shooting…';
        updateHud();
        buzz('stone');
      }, 380);
    }


    function aiTurn() {
      if (liveOn || isCarrom) return;
      if (isPool) {
        schedulePoolAiTurn();
        return;
      }
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
      let nextBreak = breakerPick;
      if (isPool) {
        nextBreak = breakerPick === 'you' ? 'opp' : breakerPick === 'opp' ? 'you' : Math.random() < 0.5 ? 'you' : 'opp';
      }
      return {
        chat,
        youColor,
        difficulty,
        breakerPick: nextBreak,
        skipSheet: true,
        stake: liveOn ? liveStake : 0,
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

    function notePoolSession(won) {
      if (sessionRecorded) return;
      sessionRecorded = true;
      if (typeof recordDangalSession === 'function') {
        recordDangalSession('pool', {
          won: !!won,
          score: won ? 1 : 0,
          difficulty: liveOn ? 'live' : difficulty,
          stake: liveStake,
          live: !!liveOn,
        });
      }
    }

    function paintPoolSettle(settle) {
      const el = shell.body.querySelector('#poolChipDelta');
      if (!el || !settle || settle.error) return;
      const delta = Number(settle.chipDelta);
      const bal = settle.chips != null ? Number(settle.chips) : null;
      const parts = [];
      if (Number.isFinite(delta) && (delta !== 0 || liveStake > 0)) {
        parts.push(
          delta === 0
            ? 'Virtual chips · balance ' + (bal != null ? bal : '—')
            : 'Virtual chips ' + (delta > 0 ? '+' : '') + delta + (bal != null ? ' · balance ' + bal : '')
        );
      }
      if (!parts.length && liveOn) parts.push('Settled · virtual chips only — not real money');
      if (!parts.length) return;
      el.hidden = false;
      el.textContent = parts.join(' · ') + ' · not real money';
    }

    async function settlePoolOnce(won) {
      if (!isPool || !liveOn || settleDone || !window.DangalEconomy || typeof DangalEconomy.reportGameEnd !== 'function') {
        return null;
      }
      if (!settleMatchId) return null;
      settleDone = true;
      try {
        const me = typeof getCurrentUid === 'function' ? getCurrentUid() : '';
        const opp = settleOppUid || (liveRoles && liveRoles.opp) || '';
        const settle = await DangalEconomy.reportGameEnd({
          gameType: 'pool',
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
          const el = shell.body.querySelector('#poolChipDelta');
          if (el) {
            el.hidden = false;
            el.innerHTML =
              'Couldn’t update chips <button type="button" id="poolChipRetry" class="game-tap-target" style="margin-left:8px;">Retry</button>';
            el.querySelector('#poolChipRetry')?.addEventListener('click', () => {
              settlePoolOnce(won);
            });
          }
          if (typeof showToast === 'function') showToast('Couldn’t update chips — tap Retry');
          return settle;
        }
        paintPoolSettle(settle);
        return settle;
      } catch (e) {
        settleDone = false;
        if (typeof showToast === 'function') showToast('Couldn’t update chips — try Retry');
        return null;
      }
    }

    async function startPoolLiveRematch(nextStake) {
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
            title: 'Challenge · Pool',
            subtitle: 'Live 1v1 · virtual chips only',
          });
          if (f) {
            await tearDownLiveHandle();
            shell.close('rematch');
            const uid = f.uid || f.id || '';
            const mid =
              typeof dangalMatchId === 'function'
                ? dangalMatchId('pool', { name: f.name, opponentUid: uid })
                : 'pool_' + Date.now();
            try {
              window.__dangalLaunchCtx = Object.assign({}, window.__dangalLaunchCtx || {}, {
                gameId: 'pool',
                gameType: 'pool',
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
                await sendChallengeCard(uid, 'pool', {
                  chatId: f.chatId || f.firestoreId,
                  matchId: mid,
                  stake: nextStake,
                });
              } catch (e) {}
            }
            openPool({
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
          ? dangalMatchId('pool', { name: chat.name || 'Friend', opponentUid: oppUid })
          : 'pool_' + Date.now();
      await tearDownLiveHandle();
      try {
        window.__dangalLaunchCtx = Object.assign({}, window.__dangalLaunchCtx || {}, {
          gameId: 'pool',
          gameType: 'pool',
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
          await sendChallengeCard(oppUid, 'pool', { chatId, matchId: rematchId, stake: nextStake });
          if (typeof showToast === 'function') showToast('Rematch sent — they Accept to join');
        } catch (e) {}
      } else if (typeof showToast === 'function') {
        showToast('Rematch ready — ask your friend to join from Baithak');
      }
      shell.close('rematch');
      openPool({
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
          const overCode = isPool ? poolReasonCode(m) : '';
          liveHandle.push({
            status: m.forfeit ? 'forfeit' : 'over',
            winner: won ? liveRoles.me : liveRoles.opp,
            state: isPool
              ? buildPoolLiveState({
                  phase: 'over',
                  breakDone: true,
                  reasonCode: overCode,
                  reason: m.reason || poolReasonLabel(overCode, won),
                })
              : {
                  balls: snapshotBalls(),
                  scores: {
                    a:
                      liveRoles.me === liveRoles.playerA ? youPocketed : oppPocketed,
                    b:
                      liveRoles.me === liveRoles.playerA ? oppPocketed : youPocketed,
                  },
                  phase: 'over',
                  breakDone: true,
                },
          });
        }
      }

      if (!isCarrom) {
        if (!isPool) {
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

        const code = poolReasonCode(m);
        const groupWord = youGroup === 'solid' ? 'Solids' : youGroup === 'stripe' ? 'Stripes' : 'Open';
        const resign = m.resign || m.forfeit;
        const stakeLine = liveOn ? (liveStake > 0 ? '⚡' + liveStake + ' virtual' : 'Friendly') : '';
        const title = resign
          ? liveOn
            ? won
              ? 'Opponent left'
              : 'You forfeited'
            : 'You resigned'
          : poolReasonLabel(code, won);
        const subtitle =
          (youGroup ? 'You: ' + groupWord + ' · ' : 'Open table · ') +
          (liveOn ? 'Live' : 'Practice · ' + (DIFF_LABEL[difficulty] || 'Medium')) +
          (liveOn ? (liveStake > 0 ? ' · Stake ⚡' + liveStake + ' (virtual)' : ' · Friendly') : '') +
          (code === 'eight' && won ? ' · 8-ball in' : '');
        const shareStats = {
          scoreLine: won ? 'Win' : 'Loss',
          meta: [groupWord, liveOn ? 'Live' : DIFF_LABEL[difficulty] || 'Medium', stakeLine]
            .filter(Boolean)
            .join(' · '),
          vs: liveOn ? 'vs Friend' : 'vs AI',
          stake: liveStake,
          text:
            'Chaupaal Pool · 8-ball ' +
            (won ? 'win' : 'loss') +
            ' · ' +
            groupWord +
            (liveOn
              ? liveStake > 0
                ? ' · Live · Stake ⚡' + liveStake + ' (virtual chips)'
                : ' · Live · Friendly'
              : ' · Practice · ' + (DIFF_LABEL[difficulty] || 'Medium')) +
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

        notePoolSession(won);
        if (shell && typeof shell.markOver === 'function') shell.markOver();
        if (shell.gs && typeof shell.gs.setOutcome === 'function') {
          shell.gs.setOutcome(won ? 'won' : 'lost');
        }
        buzz(won ? 'win' : 'lose');
        if (won && typeof setGamePB === 'function') {
          const prev = typeof getGamePB === 'function' ? getGamePB('pool') : null;
          setGamePB('pool', (prev || 0) + 1);
        }
        shell.body.innerHTML =
          (typeof gameResultHtml === 'function'
            ? gameResultHtml({
                gameId: 'pool',
                glyph: spec.glyph || '🎱',
                title,
                subtitle,
                you: won ? 1 : 0,
                opp: won ? 0 : 1,
                shareCardHtml:
                  typeof buildGameShareCard === 'function' ? buildGameShareCard('pool', shareStats) : '',
                actions,
                challenge: false,
                share: false,
              })
            : '') +
          '<div id="poolChipDelta" class="carrom-chip-delta" hidden style="margin-top:8px;font-size:12px;color:rgba(255,255,255,.75);text-align:center;"></div>';

        settlePoolOnce(won);

        if (typeof wireGameResultActions === 'function') {
          wireGameResultActions(shell.body, {
            again: async () => {
              if (liveOn) {
                let nextStake = liveStake;
                if (
                  typeof stakesEnabledForGame === 'function' &&
                  stakesEnabledForGame('pool') &&
                  typeof openDangalStakeSheet === 'function'
                ) {
                  const picked = await openDangalStakeSheet('pool', { defaultStake: liveStake });
                  if (picked == null) return;
                  nextStake = picked;
                }
                await startPoolLiveRematch(nextStake);
                return;
              }
              shell.close('restart');
              openCueGame(Object.assign({}, spec, rematchOpts()));
            },
            share: () => {
              if (typeof shareGameResult === 'function') shareGameResult('pool', shareStats);
              else if (typeof openUnifiedShareSheet === 'function') {
                openUnifiedShareSheet({ gameId: 'pool', stats: shareStats });
              }
            },
            challenge: async () => {
              if (typeof openFriendPickerSheet !== 'function') return;
              const f = await openFriendPickerSheet({
                title: 'Challenge · Pool',
                subtitle: 'Live 1v1 · virtual chips only — not real money',
              });
              if (!f) return;
              const uid = f.uid || f.id || '';
              let nextStake = 0;
              if (
                typeof stakesEnabledForGame === 'function' &&
                stakesEnabledForGame('pool') &&
                typeof openDangalStakeSheet === 'function'
              ) {
                const picked = await openDangalStakeSheet('pool', { defaultStake: 0 });
                if (picked == null) return;
                nextStake = picked;
              }
              await tearDownLiveHandle();
              shell.close('challenge');
              const mid =
                typeof dangalMatchId === 'function'
                  ? dangalMatchId('pool', { name: f.name, opponentUid: uid })
                  : 'pool_' + Date.now();
              try {
                window.__dangalLaunchCtx = Object.assign({}, window.__dangalLaunchCtx || {}, {
                  gameId: 'pool',
                  gameType: 'pool',
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
                  await sendChallengeCard(uid, 'pool', {
                    chatId: f.chatId || f.firestoreId,
                    matchId: mid,
                    stake: nextStake,
                  });
                  if (typeof showToast === 'function') showToast('Challenge sent');
                } catch (e) {}
              }
              openPool({
                name: f.name,
                id: uid,
                uid,
                peerUid: uid,
                opponentUid: uid,
                dangalMatchId: mid,
                dangalSource: 'challenge_host',
                stake: nextStake,
              });
            },
            story: () => {
              if (typeof postGameScoreStory === 'function') postGameScoreStory('pool', shareStats);
            },
            chat: () => {
              if (chatId && typeof openChatScreen === 'function') openChatScreen(chatId);
            },
          });
        }
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
        spec.drawBoard(ctx2d, W, H, {
          pockets,
          pocketR,
          baselineY: baselineY(),
          headStringY: isPool ? headStringY() : null,
          kitchenY: isPool ? kitchenY() : null,
        });
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

    function drawBallFace(b, r) {
      ctx2d.beginPath();
      ctx2d.arc(b.x, b.y, r, 0, Math.PI * 2);
      ctx2d.fillStyle = b.color || '#ccc';
      ctx2d.fill();
      if (b.cue) {
        ctx2d.strokeStyle = 'rgba(255,255,255,.9)';
        ctx2d.lineWidth = 2;
        ctx2d.stroke();
        ctx2d.beginPath();
        ctx2d.arc(b.x, b.y, r * 0.35, 0, Math.PI * 2);
        ctx2d.fillStyle = 'rgba(0,0,0,.12)';
        ctx2d.fill();
        return;
      }
      if (b.kind === 'queen') {
        ctx2d.strokeStyle = 'rgba(255,215,0,.7)';
        ctx2d.lineWidth = 1.5;
        ctx2d.stroke();
        return;
      }
      // Pool numbered balls
      if (isPool && b.num != null) {
        if (b.stripe || b.group === 'stripe') {
          ctx2d.fillStyle = '#f5f5f5';
          ctx2d.fillRect(b.x - r, b.y - r * 0.38, r * 2, r * 0.76);
          ctx2d.beginPath();
          ctx2d.arc(b.x, b.y, r, 0, Math.PI * 2);
          ctx2d.strokeStyle = 'rgba(0,0,0,.2)';
          ctx2d.lineWidth = 1;
          ctx2d.stroke();
        }
        if (b.kind === 'eight' || b.num === 8) {
          ctx2d.strokeStyle = '#FFD600';
          ctx2d.lineWidth = 2;
          ctx2d.beginPath();
          ctx2d.arc(b.x, b.y, r - 1, 0, Math.PI * 2);
          ctx2d.stroke();
        }
        const spot = Math.max(5, r * 0.55);
        ctx2d.beginPath();
        ctx2d.arc(b.x, b.y, spot, 0, Math.PI * 2);
        ctx2d.fillStyle = '#fff';
        ctx2d.fill();
        ctx2d.fillStyle = b.kind === 'eight' || b.num === 8 ? '#111' : '#111';
        ctx2d.font = `bold ${Math.max(8, Math.floor(r * 0.85))}px sans-serif`;
        ctx2d.textAlign = 'center';
        ctx2d.textBaseline = 'middle';
        ctx2d.fillText(String(b.num), b.x, b.y + 0.5);
        return;
      }
      ctx2d.strokeStyle = 'rgba(0,0,0,.15)';
      ctx2d.lineWidth = 1;
      ctx2d.stroke();
    }

    function draw() {
      drawBoard();
      balls.forEach((b) => {
        if (b.dead) return;
        drawBallFace(b, ballRadius(b));
      });
      if (isPool && !breakDone) {
        const hy = headStringY();
        ctx2d.strokeStyle = 'rgba(255,255,255,.28)';
        ctx2d.lineWidth = 1;
        ctx2d.setLineDash([4, 4]);
        ctx2d.beginPath();
        ctx2d.moveTo(W * 0.1, hy);
        ctx2d.lineTo(W * 0.9, hy);
        ctx2d.stroke();
        ctx2d.setLineDash([]);
      }
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
      if (isPool) {
        resolvePoolStroke();
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
            const stOver = val.state || {};
            applying = true;
            if (isCarrom && val.state) {
              if (val.state.balls) applySnapshot(val.state.balls, null, val.turn);
              if (val.state.queen) applyQueenAbsolute(val.state.queen);
            } else if (isPool && val.state) {
              if (val.state.balls) applySnapshot(val.state.balls, val.state.scores, val.turn);
              applyPoolGroupsFromState(val.state);
              if (val.state.breakDone != null) breakDone = !!val.state.breakDone;
              if (val.state.hint) lastHint = val.state.hint;
              youPocketed = countGroupPocketed('you');
              oppPocketed = countGroupPocketed('opp');
              updateHud();
            } else if (val.status === 'over' && val.state && val.state.scores) {
              const sc = val.state.scores;
              youPocketed = liveRoles.me === liveRoles.playerA ? sc.a | 0 : sc.b | 0;
              oppPocketed = liveRoles.me === liveRoles.playerA ? sc.b | 0 : sc.a | 0;
              updateHud();
            }
            applying = false;
            applying = true;
            finish(iWon, {
              skipLivePush: true,
              forfeit: val.status === 'forfeit',
              resign: val.status === 'forfeit' && !iWon,
              reasonCode: stOver.reasonCode || (val.status === 'forfeit' ? 'forfeit' : ''),
              reason: stOver.reason || '',
            });
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
            if (isPool) {
              applyPoolGroupsFromState(st);
              if (st.breakDone != null) breakDone = !!st.breakDone;
              if (st.hint) lastHint = st.hint;
              youPocketed = countGroupPocketed('you');
              oppPocketed = countGroupPocketed('opp');
              updateHud();
            }
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
          hint.textContent = myTurn
            ? isPool
              ? 'Your break — kitchen.'
              : 'Your shot.'
            : 'Waiting for opponent…';
          if (liveRoles.host) {
            if (isPool) {
              openTable = true;
              youGroup = null;
              oppGroup = null;
              breakDone = false;
              resetCueToBaseline({ seat: 'you', x: W / 2 });
              liveHandle.push({
                status: 'playing',
                turn: liveRoles.me,
                state: buildPoolLiveState({
                  phase: 'deal',
                  breakDone: false,
                  hint: 'Host breaks from the kitchen.',
                  scores: { a: 0, b: 0 },
                }),
              });
            } else {
              liveHandle.push({
                status: 'playing',
                turn: liveRoles.me,
                state: { balls: snapshotBalls(), scores: { a: 0, b: 0 }, phase: 'deal' },
              });
            }
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
    } else if (isPool && !liveOn) {
      resetCueToBaseline({ seat: 'you', x: W / 2 });
      updateHud();
      if (breaker === 'opp') {
        myTurn = false;
        hint.textContent = 'AI breaks…';
        schedulePoolAiTurn();
      }
    }

    // Resign Practice Pool
    if (isPool && !liveOn) {
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
                  title: 'Resign Pool?',
                  body: 'This counts as a loss vs AI.',
                })
              : true;
          if (!ok) return;
          finish(false, { resign: true, reasonCode: 'forfeit' });
        });
      }
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

  function drawPoolBoard(ctx2d, W, H, opts) {
    const o = opts || {};
    const pockets = o.pockets || [];
    const pocketR = o.pocketR || 18;
    const hy = o.headStringY != null ? o.headStringY : H * 0.72;
    // Rail
    ctx2d.fillStyle = '#2e1a0f';
    ctx2d.fillRect(0, 0, W, H);
    const m = Math.min(W, H) * 0.035;
    const felt = ctx2d.createLinearGradient(0, 0, 0, H);
    felt.addColorStop(0, '#1b5e20');
    felt.addColorStop(0.55, '#145a1f');
    felt.addColorStop(1, '#0d3d14');
    ctx2d.fillStyle = felt;
    ctx2d.fillRect(m, m, W - 2 * m, H - 2 * m);
    // Head string (kitchen behind it toward bottom)
    ctx2d.strokeStyle = 'rgba(255,255,255,.22)';
    ctx2d.lineWidth = 1.5;
    ctx2d.beginPath();
    ctx2d.moveTo(W * 0.12, hy);
    ctx2d.lineTo(W * 0.88, hy);
    ctx2d.stroke();
    ctx2d.fillStyle = 'rgba(255,255,255,.2)';
    ctx2d.font = '10px sans-serif';
    ctx2d.textAlign = 'center';
    ctx2d.fillText('kitchen', W / 2, Math.min(H - 8, hy + 14));
    // Foot spot hint
    ctx2d.beginPath();
    ctx2d.arc(W / 2, H * 0.22, 2.5, 0, Math.PI * 2);
    ctx2d.fillStyle = 'rgba(255,255,255,.25)';
    ctx2d.fill();
    pockets.forEach((p) => {
      const px = p[0] * W;
      const py = p[1] * H;
      ctx2d.beginPath();
      ctx2d.arc(px, py, pocketR, 0, Math.PI * 2);
      ctx2d.fillStyle = '#0a0a0a';
      ctx2d.fill();
      ctx2d.strokeStyle = 'rgba(255,255,255,.12)';
      ctx2d.lineWidth = 2;
      ctx2d.stroke();
    });
  }

  /** Full 15-ball triangle: solids 1–7, 8 center, stripes 9–15. Apex toward kitchen. */
  function makePoolBalls(W, H, sizes) {
    const r = (sizes && sizes.ballR) || 8;
    const cr = (sizes && sizes.cueR) || 10;
    const gap = r * 2.08;
    const solidColors = {
      1: '#f1c40f',
      2: '#2980b9',
      3: '#c0392b',
      4: '#8e44ad',
      5: '#e67e22',
      6: '#27ae60',
      7: '#6d1b1b',
    };
    const stripeColors = {
      9: '#f1c40f',
      10: '#2980b9',
      11: '#c0392b',
      12: '#8e44ad',
      13: '#e67e22',
      14: '#27ae60',
      15: '#6d1b1b',
    };
    const apexX = W / 2;
    const apexY = H * 0.18;
    const slots = [];
    for (let row = 0; row < 5; row++) {
      const n = row + 1;
      const y = apexY + row * gap * 0.866;
      const rowW = (n - 1) * gap;
      for (let i = 0; i < n; i++) {
        slots.push({ x: apexX - rowW / 2 + i * gap, y, row, i, n });
      }
    }
    const centerIdx = slots.findIndex((s) => s.row === 2 && s.i === 1);
    const cornerL = slots.findIndex((s) => s.row === 4 && s.i === 0);
    const cornerR = slots.findIndex((s) => s.row === 4 && s.i === 4);
    const solids = [1, 2, 3, 4, 5, 6, 7];
    const stripes = [9, 10, 11, 12, 13, 14, 15];
    // Shuffle lightly for variety but keep corners different groups
    for (let i = solids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = solids[i];
      solids[i] = solids[j];
      solids[j] = t;
    }
    for (let i = stripes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = stripes[i];
      stripes[i] = stripes[j];
      stripes[j] = t;
    }
    const assign = new Array(slots.length);
    assign[centerIdx] = 8;
    assign[cornerL] = solids.pop();
    assign[cornerR] = stripes.pop();
    const rest = solids.concat(stripes);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = rest[i];
      rest[i] = rest[j];
      rest[j] = t;
    }
    let ri = 0;
    for (let i = 0; i < assign.length; i++) {
      if (assign[i] == null) assign[i] = rest[ri++];
    }
    const list = [];
    // Cue in kitchen
    list.push({
      x: W / 2,
      y: H * 0.84,
      vx: 0,
      vy: 0,
      cue: true,
      color: '#fafafa',
      kind: 'striker',
      r: cr,
      id: 'cue',
    });
    slots.forEach((s, idx) => {
      const num = assign[idx];
      const isEight = num === 8;
      const isStripe = num >= 9;
      const color = isEight ? '#111111' : isStripe ? stripeColors[num] : solidColors[num];
      list.push({
        x: s.x,
        y: s.y,
        vx: 0,
        vy: 0,
        color,
        num,
        group: isEight ? 'eight' : isStripe ? 'stripe' : 'solid',
        kind: isEight ? 'eight' : isStripe ? 'stripe' : 'solid',
        stripe: isStripe,
        r,
        id: 'ball' + num,
      });
    });
    return list;
  }

  function openPool(ctx) {
    const raw = ctx || {};
    const chat = resolveChat(raw);
    const stake =
      Math.max(0, Number(raw.stake != null ? raw.stake : window.__dangalLaunchCtx && window.__dangalLaunchCtx.stake) || 0);
    openCueGame({
      id: 'pool',
      variant: 'pool',
      title: 'Pool',
      subtitle: '8-ball · solids & stripes',
      chat,
      accent: '#1B3A2D',
      bg: '#0A1A10',
      felt: '#1b5e20',
      glyph: '🎱',
      coachKey: 'chaupaal_pool_coach_v1',
      ballR: 8,
      cueR: 10,
      pocketR: 18,
      headStringY: 0.72,
      kitchenY: 0.84,
      difficulty: raw.difficulty,
      breakerPick: raw.breakerPick,
      skipSheet: !!raw.skipSheet,
      stake,
      pockets: [
        [0.06, 0.06],
        [0.5, 0.04],
        [0.94, 0.06],
        [0.06, 0.94],
        [0.5, 0.96],
        [0.94, 0.94],
      ],
      drawBoard: drawPoolBoard,
      makeBalls: makePoolBalls,
    });
  }


  /* ---------- Rummy ---------- */
  /** 1×52 + 2 printed jokers (2p Points). */
  function makeRummyDeck(rng) {
    const d = [];
    SUITS.forEach((s) => RANKS.forEach((r) => d.push({ r, s, id: r + s })));
    d.push({ r: 'JOK', s: '★', id: 'JOK1', joker: true });
    d.push({ r: 'JOK', s: '★', id: 'JOK2', joker: true });
    return typeof shuffleArray === 'function' ? shuffleArray(d, rng) : d.sort(() => rng() - 0.5);
  }

  function isPrintedJoker(c) {
    return !!(c && (c.joker || c.r === 'JOK'));
  }

  function isRummyWild(c, wildRank) {
    if (!c) return false;
    if (isPrintedJoker(c)) return true;
    return !!(wildRank && c.r === wildRank);
  }

  function rummyCardLabel(c) {
    if (!c) return '—';
    if (isPrintedJoker(c)) return 'Joker';
    return String(c.r) + String(c.s || '');
  }

  /** Ace: A-2-3 (low) and Q-K-A (high) OK; K-A-2 wrap forbidden. */
  function rummyNaturalVals(card, aceHigh) {
    if (isPrintedJoker(card)) return null;
    if (card.r === 'A') return aceHigh ? 14 : 1;
    return rankVal(card.r);
  }

  function rummySequenceOk(cards, wildRank, requirePure) {
    if (!cards || cards.length < 3) return false;
    const jokers = cards.filter((c) => isRummyWild(c, wildRank));
    const naturals = cards.filter((c) => !isRummyWild(c, wildRank));
    if (requirePure && jokers.length) return false;
    if (!naturals.length) return false;
    const suit = naturals[0].s;
    if (!naturals.every((c) => c.s === suit)) return false;
    const ranks = naturals.map((c) => c.r);
    if (new Set(ranks).size !== ranks.length) return false;

    function fits(aceHigh) {
      const vals = naturals.map((c) => rummyNaturalVals(c, aceHigh)).sort((a, b) => a - b);
      for (let i = 1; i < vals.length; i++) if (vals[i] === vals[i - 1]) return false;
      const span = vals[vals.length - 1] - vals[0] + 1;
      const gaps = span - vals.length;
      if (gaps < 0 || gaps > jokers.length) return false;
      return naturals.length + jokers.length >= 3;
    }
    const hasAce = naturals.some((c) => c.r === 'A');
    if (hasAce) return fits(false) || fits(true);
    return fits(true);
  }

  function rummySetOk(cards, wildRank) {
    if (!cards || cards.length < 3 || cards.length > 4) return false;
    const jokers = cards.filter((c) => isRummyWild(c, wildRank));
    const naturals = cards.filter((c) => !isRummyWild(c, wildRank));
    if (!naturals.length) return false;
    const rank = naturals[0].r;
    if (!naturals.every((c) => c.r === rank)) return false;
    const suits = naturals.map((c) => c.s);
    if (new Set(suits).size !== suits.length) return false;
    return naturals.length + jokers.length === cards.length;
  }

  function rummyClassifyMeld(cards, wildRank) {
    if (rummySequenceOk(cards, wildRank, true)) return { type: 'run', pure: true, cards: cards.slice() };
    if (rummySequenceOk(cards, wildRank, false)) return { type: 'run', pure: false, cards: cards.slice() };
    if (rummySetOk(cards, wildRank)) return { type: 'set', pure: false, cards: cards.slice() };
    return null;
  }

  /**
   * Indian Rummy (13 cards): ≥1 pure sequence, ≥2 sequences total, rest valid sets/runs, nothing left.
   */
  function evaluateRummyHand(hand, opts) {
    const o = opts || {};
    const wildRank = o.wildRank || null;
    const cards = (hand || []).slice();
    const fail = (errors, unmelded) => ({
      ok: false,
      pureSequences: [],
      sequences: [],
      sets: [],
      unmelded: unmelded || cards.slice(),
      errors: errors || [],
      melds: [],
    });
    if (cards.length !== 13) return fail(['Need exactly 13 cards to declare']);

    let solution = null;

    function search(remaining, melds) {
      if (solution) return true;
      if (!remaining.length) {
        const sequences = melds.filter((m) => m.type === 'run');
        const pureSequences = sequences.filter((m) => m.pure);
        const sets = melds.filter((m) => m.type === 'set');
        if (pureSequences.length < 1 || sequences.length < 2) return false;
        solution = {
          ok: true,
          pureSequences,
          sequences,
          sets,
          unmelded: [],
          errors: [],
          melds: melds.slice(),
        };
        return true;
      }
      if (remaining.length < 3) return false;
      const maxLen = Math.min(6, remaining.length);
      const anchor = remaining[0];
      const pool = remaining.slice(1);
      for (let len = 3; len <= maxLen; len++) {
        const chosen = [];
        const rec = (start) => {
          if (solution) return;
          if (chosen.length === len - 1) {
            const group = [anchor].concat(chosen);
            const meld = rummyClassifyMeld(group, wildRank);
            if (!meld) return;
            const ids = new Set(group.map((c) => c.id));
            const next = remaining.filter((c) => !ids.has(c.id));
            melds.push(meld);
            search(next, melds);
            melds.pop();
            return;
          }
          for (let i = start; i < pool.length; i++) {
            chosen.push(pool[i]);
            rec(i + 1);
            chosen.pop();
            if (solution) return;
          }
        };
        rec(0);
        if (solution) return true;
      }
      return false;
    }

    search(cards, []);
    if (solution) return solution;

    let foundPure = false;
    const n = cards.length;
    for (let len = 3; len <= Math.min(5, n) && !foundPure; len++) {
      const idxs = [];
      const rec = (start) => {
        if (foundPure) return;
        if (idxs.length === len) {
          if (rummySequenceOk(idxs.map((i) => cards[i]), wildRank, true)) foundPure = true;
          return;
        }
        for (let i = start; i < n; i++) {
          idxs.push(i);
          rec(i + 1);
          idxs.pop();
        }
      };
      rec(0);
    }
    const errors = [];
    if (!foundPure) errors.push('Missing pure sequence');
    else errors.push('Need a second sequence and all cards melded');
    return fail(errors);
  }

  function rummySuggestHighlightIds(hand, wildRank) {
    const cards = hand || [];
    const n = cards.length;
    for (let len = 3; len <= Math.min(5, n); len++) {
      const idxs = [];
      let hit = null;
      const rec = (start) => {
        if (hit) return;
        if (idxs.length === len) {
          const group = idxs.map((i) => cards[i]);
          if (rummySequenceOk(group, wildRank, true)) hit = group.map((c) => c.id);
          return;
        }
        for (let i = start; i < n; i++) {
          idxs.push(i);
          rec(i + 1);
          idxs.pop();
        }
      };
      rec(0);
      if (hit) return hit;
    }
    return [];
  }

  function rummyFaceHtml(c, wildRank, extraClass) {
    const isJok = isPrintedJoker(c);
    const isWild = isRummyWild(c, wildRank);
    const col = isJok ? '#6A1B9A' : isWild && c.r === wildRank ? '#6A1B9A' : SUIT_COLOR[c.s] || '#111';
    const cls =
      'pc-card' +
      (extraClass ? ' ' + extraClass : '') +
      (isJok ? ' pc-card--joker' : '') +
      (isWild && !isJok ? ' pc-card--wild' : '');
    const top = isJok ? 'JK' : esc(c.r);
    const bot = isJok ? '★' : esc(c.s);
    return (
      '<button type="button" class="' +
      cls +
      '" data-cid="' +
      esc(c.id) +
      '" style="color:' +
      col +
      '"><b>' +
      top +
      '</b><span>' +
      bot +
      '</span></button>'
    );
  }

  // Legacy names kept for any stray callers — Indian law lives in evaluateRummyHand.
  function isRun(cards) {
    return rummySequenceOk(cards, null, true);
  }
  function isSet(cards) {
    return rummySetOk(cards, null);
  }
  function rummyOk(hand, wildRank) {
    return evaluateRummyHand(hand, { wildRank: wildRank || null }).ok;
  }


  const RUMMY_POINT_CAP = 80;
  const RUMMY_FIRST_DROP = 20;
  const RUMMY_MIDDLE_DROP = 40;
  const RUMMY_WRONG_SHOW = 80;

  /** Ace/J/Q/K/T = 10; 2–9 face; jokers & wild rank = 0. */
  function rummyCardPoints(c, wildRank) {
    if (!c || isRummyWild(c, wildRank)) return 0;
    if (c.r === 'A' || c.r === 'J' || c.r === 'Q' || c.r === 'K' || c.r === 'T') return 10;
    const n = parseInt(c.r, 10);
    return Number.isFinite(n) ? n : 10;
  }

  function rummySumPoints(cards, wildRank) {
    return (cards || []).reduce((sum, c) => sum + rummyCardPoints(c, wildRank), 0);
  }

  /**
   * Deadwood after best melds. Without a pure sequence, entire hand counts (capped).
   * With pure sequence, only unmelded cards count (capped at 80).
   */
  function scoreRummyDeadwood(hand, wildRank) {
    const cards = (hand || []).slice();
    if (!cards.length) return { points: 0, melds: [], unmelded: [], hasPure: true };
    const full = evaluateRummyHand(cards, { wildRank });
    if (full.ok) return { points: 0, melds: full.melds, unmelded: [], hasPure: true };

    let bestPts = null;
    let bestMelds = [];
    let bestUnmelded = cards.slice();

    function search(remaining, melds, hasPure) {
      if (hasPure) {
        const pts = Math.min(RUMMY_POINT_CAP, rummySumPoints(remaining, wildRank));
        if (bestPts == null || pts < bestPts) {
          bestPts = pts;
          bestMelds = melds.slice();
          bestUnmelded = remaining.slice();
        }
        if (pts === 0 || remaining.length < 3) return;
      }
      if (remaining.length < 3) return;
      const maxLen = Math.min(6, remaining.length);
      const anchor = remaining[0];
      const pool = remaining.slice(1);
      for (let len = 3; len <= maxLen; len++) {
        const chosen = [];
        const rec = (start) => {
          if (chosen.length === len - 1) {
            const group = [anchor].concat(chosen);
            const meld = rummyClassifyMeld(group, wildRank);
            if (!meld) return;
            const ids = new Set(group.map((c) => c.id));
            const next = remaining.filter((c) => !ids.has(c.id));
            melds.push(meld);
            search(next, melds, hasPure || !!meld.pure);
            melds.pop();
            return;
          }
          for (let i = start; i < pool.length; i++) {
            chosen.push(pool[i]);
            rec(i + 1);
            chosen.pop();
          }
        };
        rec(0);
      }
    }

    search(cards, [], false);
    if (bestPts == null) {
      return {
        points: Math.min(RUMMY_POINT_CAP, rummySumPoints(cards, wildRank)),
        melds: [],
        unmelded: cards.slice(),
        hasPure: false,
      };
    }
    return { points: bestPts, melds: bestMelds, unmelded: bestUnmelded, hasPure: true };
  }

  function rummyReasonLabel(reason) {
    const r = String(reason || '');
    if (r === 'declare') return 'Declare';
    if (r === 'wrongShow') return 'Wrong show';
    if (r === 'drop') return 'Drop';
    if (r === 'oppDrop') return 'Opponent drop';
    if (r === 'forfeit') return 'Forfeit';
    return r || 'Hand over';
  }


  /** How much AI wants to keep a card (higher = keep). */
  function rummyAiKeepValue(card, hand, wildRank) {
    if (!card) return 0;
    if (isRummyWild(card, wildRank)) return 120;
    let v = 8;
    const sameRank = hand.filter((c) => c.id !== card.id && !isRummyWild(c, wildRank) && c.r === card.r).length;
    v += sameRank * 14;
    const suitMates = hand.filter(
      (c) => c.id !== card.id && !isRummyWild(c, wildRank) && c.s === card.s
    );
    const myVal = rankVal(card.r === 'A' ? 'A' : card.r);
    suitMates.forEach((c) => {
      const ov = rankVal(c.r === 'A' ? 'A' : c.r);
      const d = Math.abs(ov - myVal);
      // Ace as 1 vs 14 rough: also try low ace distance
      const dLow =
        card.r === 'A' || c.r === 'A'
          ? Math.min(d, Math.abs((card.r === 'A' ? 1 : myVal) - (c.r === 'A' ? 1 : ov)))
          : d;
      if (dLow === 1) v += 22;
      else if (dLow === 2) v += 10;
      else if (dLow === 0) v -= 5;
    });
    // Prefer dumping high deadwood when not useful
    const pts = rummyCardPoints(card, wildRank);
    v -= pts * 0.35;
    return v;
  }

  function rummyAiHasPureSeed(hand, wildRank) {
    if (rummySuggestHighlightIds(hand, wildRank).length > 0) return true;
    const cards = (hand || []).filter((c) => !isRummyWild(c, wildRank));
    const bySuit = {};
    cards.forEach((c) => {
      if (!bySuit[c.s]) bySuit[c.s] = [];
      bySuit[c.s].push(c);
    });
    for (const s of Object.keys(bySuit)) {
      const list = bySuit[s];
      if (list.length < 2) continue;
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i];
          const b = list[j];
          const va = rankVal(a.r);
          const vb = rankVal(b.r);
          if (Math.abs(va - vb) <= 2) return true;
          if (
            (a.r === 'A' || b.r === 'A') &&
            (va === 2 || vb === 2 || va === 3 || vb === 3 || va === 13 || vb === 13 || va === 12 || vb === 12)
          ) {
            return true;
          }
        }
      }
    }
    return false;
  }

  function rummyAiImprovesWith(hand, card, wildRank) {
    if (!card) return false;
    const before = scoreRummyDeadwood(hand, wildRank);
    const trial = hand.concat([card]);
    const after = scoreRummyDeadwood(trial, wildRank);
    if (after.points < before.points - 4) return true;
    if (!before.hasPure && after.hasPure) return true;
    // Completes/extends pure-seq candidate in suit
    if (!isRummyWild(card, wildRank)) {
      const mates = hand.filter((c) => !isRummyWild(c, wildRank) && c.s === card.s);
      const vals = mates.map((c) => rankVal(c.r)).concat([rankVal(card.r)]).sort((a, b) => a - b);
      for (let i = 0; i < vals.length; i++) {
        for (let j = i + 1; j < vals.length; j++) {
          if (vals[j] - vals[i] <= 2 && j - i + 1 >= 2) {
            // card participates in a near-run
            const cv = rankVal(card.r);
            if (cv >= vals[i] && cv <= vals[j]) return true;
          }
        }
      }
      // set helper
      const same = hand.filter((c) => !isRummyWild(c, wildRank) && c.r === card.r).length;
      if (same >= 1) return true;
    } else {
      return true; // joker always useful early
    }
    return false;
  }

  /** Pick discard from 14-card hand; prefer low keep-value, avoid dumping jokers. */
  function rummyAiPickDiscard(hand14, wildRank, difficulty) {
    const hand = (hand14 || []).slice();
    if (hand.length < 2) return hand[0] || null;
    // Prefer a discard that makes remaining evaluate ok
    for (let i = 0; i < hand.length; i++) {
      const rem = hand.filter((_, j) => j !== i);
      if (evaluateRummyHand(rem, { wildRank }).ok) return hand[i];
    }
    let best = null;
    let bestScore = Infinity;
    const noise = difficulty === 'easy' ? 18 : difficulty === 'hard' ? 3 : 8;
    hand.forEach((c) => {
      const keep = rummyAiKeepValue(c, hand, wildRank);
      const rem = hand.filter((x) => x.id !== c.id);
      const dead = scoreRummyDeadwood(rem, wildRank).points;
      // Lower score = better discard choice
      let score = keep * 2 + dead * 0.15 - rummyCardPoints(c, wildRank) * 0.5;
      if (isRummyWild(c, wildRank)) score += 80;
      score += (Math.random() - 0.5) * noise;
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    });
    return best || hand[hand.length - 1];
  }

  function rummyAiWantDiscard(hand, top, wildRank, difficulty) {
    if (!top) return false;
    // Don't greedily take high deadwood
    const pts = rummyCardPoints(top, wildRank);
    if (pts >= 10 && !rummyAiImprovesWith(hand, top, wildRank) && difficulty !== 'easy') return false;
    if (rummyAiImprovesWith(hand, top, wildRank)) return true;
    if (difficulty === 'easy' && Math.random() < 0.35) return true;
    if (difficulty === 'hard') return false;
    return Math.random() < 0.08;
  }

  function openRummy() {
    const chat = resolveChat(arguments[0]);
    const liveOn = chatLiveOn(chat);
    const rng = rngFn();
    let aiTimer = 0;
    const DIFF_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
    let difficulty =
      (chat && (chat.difficulty === 'easy' || chat.difficulty === 'hard' || chat.difficulty === 'medium')
        ? chat.difficulty
        : null) ||
      (arguments[0] && arguments[0].difficulty) ||
      'medium';
    if (difficulty !== 'easy' && difficulty !== 'hard') difficulty = 'medium';
    let aiTurns = 0;
    const shell = openShell({
      id: 'rummy',
      title: 'Rummy',
      subtitle: liveOn
        ? liveSub() + ' · Points Rummy'
        : practiceSub('Points Rummy · ' + (DIFF_LABEL[difficulty] || 'Medium') + ' AI'),
      mode: liveOn ? 'live' : 'practice',
      live: liveOn,
      chat,
      accent: '#6A1B9A',
      bg: '#100018',
      cleanup: () => {
        if (aiTimer) {
          clearTimeout(aiTimer);
          aiTimer = 0;
        }
      },
    });
    if (!shell) return;

    let deck = makeRummyDeck(rng);
    let handA = [];
    let handB = [];
    let discard = [];
    let wildRank = null;
    let wildShow = null; // card used to display wild chrome
    /** @type {'needDraw'|'needDiscard'} */
    let phase = 'needDraw';
    let drawnId = null;
    let selectedId = null;
    let sortMode = 'suit';
    let highlightIds = [];
    let myTurn = true;
    let applying = false;
    let liveRoles = null;
    let liveHandle = null;
    let ended = false;
    let drewA = false;
    let drewB = false;
    let lastResult = null;

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

    function suitOrder(s) {
      const o = { '♠': 0, '♥': 1, '♦': 2, '♣': 3 };
      return o[s] != null ? o[s] : 9;
    }

    function sortHand(hand) {
      const h = hand.slice();
      const jokerKey = (c) => (isPrintedJoker(c) ? 2 : isRummyWild(c, wildRank) ? 1 : 0);
      if (sortMode === 'rank') {
        h.sort(
          (a, b) =>
            jokerKey(a) - jokerKey(b) ||
            rankVal(a.r === 'JOK' ? '2' : a.r) - rankVal(b.r === 'JOK' ? '2' : b.r) ||
            suitOrder(a.s) - suitOrder(b.s)
        );
      } else {
        h.sort(
          (a, b) =>
            jokerKey(a) - jokerKey(b) ||
            suitOrder(a.s) - suitOrder(b.s) ||
            rankVal(a.r === 'JOK' ? '2' : a.r) - rankVal(b.r === 'JOK' ? '2' : b.r)
        );
      }
      return h;
    }

    function dealFresh() {
      deck = makeRummyDeck(rng);
      handA = deck.splice(0, 13);
      handB = deck.splice(0, 13);
      const open = deck.length ? deck.pop() : null;
      if (!open) {
        discard = [];
        wildRank = 'A';
        wildShow = { r: 'A', s: '♠', id: 'wildA' };
      } else if (isPrintedJoker(open)) {
        discard = [open];
        let wr = 'A';
        for (let i = deck.length - 1; i >= 0; i--) {
          if (!isPrintedJoker(deck[i])) {
            wr = deck[i].r;
            wildShow = deck[i];
            break;
          }
        }
        wildRank = wr;
        if (!wildShow) wildShow = { r: wr, s: '♠', id: 'wild' + wr };
      } else {
        wildRank = open.r;
        wildShow = open;
        discard = [open];
      }
      phase = 'needDraw';
      drawnId = null;
      selectedId = null;
      highlightIds = [];
      drewA = false;
      drewB = false;
      lastResult = null;
      aiTurns = 0;
    }

    function iHaveDrawn() {
      if (!liveOn || !liveRoles) return drewA;
      return liveRoles.me === liveRoles.playerA ? drewA : drewB;
    }

    function markIDrew() {
      if (!liveOn || !liveRoles) {
        drewA = true;
        return;
      }
      if (liveRoles.me === liveRoles.playerA) drewA = true;
      else drewB = true;
    }

    function oppHand() {
      if (!liveOn || !liveRoles) return handB;
      return liveRoles.me === liveRoles.playerA ? handB : handA;
    }

    function wildChrome() {
      if (!wildRank) return 'Wild: —';
      if (wildShow && !isPrintedJoker(wildShow) && wildShow.r === wildRank) {
        return 'Wild: ' + rummyCardLabel(wildShow);
      }
      return 'Wild: ' + wildRank + 's';
    }

    /**
     * Live Prompt 1: still syncs full hands/deck until Prompt 5 hidden-hand protocol.
     * TODO(Rummy Prompt 5): sync only discard + deckCount + turn + handCounts + phase; never opp faces.
     */
    function pushState(extra) {
      if (!liveOn || !liveHandle || !liveRoles || applying) return;
      liveHandle.push(
        Object.assign(
          {
            status: 'playing',
            turn: myTurn ? liveRoles.me : liveRoles.opp,
            state: {
              // TODO(Rummy Prompt 5): remove handA/handB/deck leak — keep public fields only
              handA,
              handB,
              discard,
              deck,
              deckCount: deck.length,
              handCountA: handA.length,
              handCountB: handB.length,
              phase,
              drawnId,
              wildRank,
              wildShow,
              drewA,
              drewB,
            },
          },
          extra || {}
        )
      );
    }

    function phaseHint() {
      if (liveOn && !myTurn) return 'Opponent\u2019s turn\u2026';
      if (phase === 'needDraw') {
        return iHaveDrawn()
          ? 'Draw/take, Discard later — or Middle Drop (40).'
          : 'Draw/take — or First Drop (20).';
      }
      return 'Discard, Declare (valid), or Show anyway (wrong show = 80).';
    }

    function meldSummary(melds) {
      return (melds || [])
        .map(
          (m) =>
            (m.pure ? 'Pure ' : '') +
            (m.type === 'run' ? 'seq' : 'set') +
            ' ' +
            m.cards.map(rummyCardLabel).join('')
        )
        .join(' · ');
    }

    function endRummyHand(opts) {
      if (ended) return;
      ended = true;
      if (aiTimer) {
        clearTimeout(aiTimer);
        aiTimer = 0;
      }
      const o = opts || {};
      const youPoints = Math.min(RUMMY_POINT_CAP, Math.max(0, o.youPoints | 0));
      const oppPoints = Math.min(RUMMY_POINT_CAP, Math.max(0, o.oppPoints | 0));
      const reason = o.reason || 'declare';
      const winnerIsYou = o.winnerIsYou != null ? !!o.winnerIsYou : youPoints < oppPoints;
      const title =
        reason === 'wrongShow'
          ? winnerIsYou
            ? 'Opponent wrong show'
            : 'Wrong show'
          : reason === 'drop' || reason === 'oppDrop'
            ? winnerIsYou
              ? 'Opponent dropped'
              : 'You dropped'
            : winnerIsYou
              ? 'You win'
              : 'Opponent wins';
      const sub =
        'You ' +
        youPoints +
        ' · Opp ' +
        oppPoints +
        ' · ' +
        rummyReasonLabel(reason) +
        (o.detail ? ' · ' + o.detail : '');
      lastResult = {
        youPoints,
        oppPoints,
        reason,
        scoreA:
          liveRoles && liveRoles.me === liveRoles.playerB ? oppPoints : youPoints,
        scoreB:
          liveRoles && liveRoles.me === liveRoles.playerB ? youPoints : oppPoints,
      };
      if (liveOn && liveHandle && liveRoles && !o.skipLivePush && !applying) {
        liveHandle.push({
          status: 'over',
          winner: winnerIsYou ? liveRoles.me : liveRoles.opp,
          state: {
            handA,
            handB,
            discard,
            deck,
            wildRank,
            wildShow,
            scoreA: lastResult.scoreA,
            scoreB: lastResult.scoreB,
            reason,
            youPoints,
            oppPoints,
            declared: reason === 'declare' || reason === 'wrongShow',
            valid: reason === 'declare',
            melds: o.melds || [],
          },
        });
      }
      showDuelResult(shell, {
        id: 'rummy',
        you: winnerIsYou ? 1 : 0,
        opp: winnerIsYou ? 0 : 1,
        glyph: '🃏',
        title,
        subtitle: sub,
        shareText:
          'Chaupaal Rummy · ' +
          rummyReasonLabel(reason) +
          ' · You ' +
          youPoints +
          ' Opp ' +
          oppPoints,
        onAgain: () => openRummy(chat),
      });
    }

    function paint(msg) {
      if (ended || !shell.alive()) return;
      const you = sortHand(myHand());
      const top = discard[discard.length - 1];
      const canDraw = myTurn && phase === 'needDraw' && deck.length > 0;
      const canTake = myTurn && phase === 'needDraw' && discard.length > 0;
      const canDiscard = myTurn && phase === 'needDiscard' && !!selectedId;
      // Declare after draw (14): select finishing discard, validate remaining 13
      const canDeclare = myTurn && phase === 'needDiscard' && you.length === 14 && !!selectedId;
      const canShow = canDeclare; // same gate; Show may wrong-show after confirm
      const canFirstDrop = myTurn && phase === 'needDraw' && you.length === 13 && !iHaveDrawn();
      const canMiddleDrop = myTurn && phase === 'needDraw' && you.length === 13 && iHaveDrawn();
      const canDrop = canFirstDrop || canMiddleDrop;
      const dropPts = canFirstDrop ? RUMMY_FIRST_DROP : RUMMY_MIDDLE_DROP;
      if (!highlightIds.length && you.length) {
        highlightIds = rummySuggestHighlightIds(you, wildRank);
      }
      const handHtml = you
        .map((c) => {
          const sel = c.id === selectedId ? ' is-sel' : '';
          const hi = highlightIds.indexOf(c.id) >= 0 ? ' is-hint' : '';
          const locked = phase !== 'needDiscard' || !myTurn;
          let html = rummyFaceHtml(c, wildRank, (sel + hi + (locked ? ' is-locked' : '')).trim());
          if (locked) html = html.replace('<button', '<button disabled');
          return html;
        })
        .join('');

      const topHtml = top
        ? rummyFaceHtml(top, wildRank, '').replace('<button', '<button disabled')
        : '<span class="pc-rummy-empty">—</span>';

      shell.body.innerHTML =
        '<div class="pc-rummy">' +
        '<p class="pc-hint">' +
        esc(msg || phaseHint()) +
        '</p>' +
        '<div class="pc-rummy-meta">' +
        '<span class="pc-rummy-wild"><b>' +
        esc(wildChrome()) +
        '</b></span>' +
        '<span>Opp <b>' +
        oppHandCount() +
        '</b></span>' +
        '<span>Stock <b>' +
        deck.length +
        '</b></span>' +
        '<span>You <b>' +
        you.length +
        '</b></span>' +
        '</div>' +
        '<div class="pc-rummy-piles">' +
        '<div class="pc-rummy-pile"><span class="pc-rummy-pile-label">Stock</span>' +
        '<span class="pc-card pc-back" aria-hidden="true"></span>' +
        '<span class="pc-rummy-pile-count">' +
        deck.length +
        '</span></div>' +
        '<div class="pc-rummy-pile"><span class="pc-rummy-pile-label">Discard</span>' +
        topHtml +
        '</div></div>' +
        '<div class="pc-rummy-sort" role="group" aria-label="Sort hand">' +
        '<button type="button" class="pc-rummy-sort-btn' +
        (sortMode === 'suit' ? ' is-on' : '') +
        '" data-sort="suit">Suit</button>' +
        '<button type="button" class="pc-rummy-sort-btn' +
        (sortMode === 'rank' ? ' is-on' : '') +
        '" data-sort="rank">Rank</button>' +
        '<button type="button" class="pc-rummy-sort-btn" data-suggest>Hint pure</button>' +
        '</div>' +
        '<div class="pc-hand pc-rummy-hand">' +
        handHtml +
        '</div>' +
        '<div class="pc-actions pc-rummy-actions">' +
        '<button type="button" class="cs-hit" data-draw' +
        (canDraw ? '' : ' disabled') +
        '>Draw</button>' +
        '<button type="button" class="cs-hit" data-take' +
        (canTake ? '' : ' disabled') +
        '>Take discard</button>' +
        '<button type="button" class="cs-hit" data-discard' +
        (canDiscard ? '' : ' disabled') +
        '>Discard</button>' +
        '<button type="button" class="cs-hit" data-declare' +
        (canDeclare ? '' : ' disabled') +
        '>Declare</button>' +
        '<button type="button" class="cs-hit cs-hit--ghost" data-show' +
        (canShow ? '' : ' disabled') +
        '>Show</button>' +
        '<button type="button" class="cs-hit cs-hit--ghost" data-drop' +
        (canDrop ? '' : ' disabled') +
        '>' +
        (canDrop ? 'Drop ' + dropPts : 'Drop') +
        '</button>' +
        '</div>' +
        '<p class="pc-hint pc-rummy-declare-hint">Declare = valid only. Show = may cost 80 if invalid. Drop before drawing (20 first / 40 middle).</p>' +
        '</div>';

      shell.body.querySelectorAll('[data-sort]').forEach((btn) => {
        btn.addEventListener('click', () => {
          sortMode = btn.getAttribute('data-sort') === 'rank' ? 'rank' : 'suit';
          paint(msg);
        });
      });
      shell.body.querySelector('[data-suggest]')?.addEventListener('click', () => {
        highlightIds = rummySuggestHighlightIds(myHand(), wildRank);
        paint(highlightIds.length ? 'Possible pure sequence highlighted.' : 'No pure sequence spotted yet.');
      });

      shell.body.querySelectorAll('.pc-rummy-hand .pc-card').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (!myTurn || ended || phase !== 'needDiscard') return;
          selectedId = btn.dataset.cid;
          paint('Selected — Discard or Declare.');
        });
      });

      shell.body.querySelector('[data-draw]')?.addEventListener('click', () => {
        if (!myTurn || ended || phase !== 'needDraw' || !deck.length) return;
        if (myHand().length !== 13) {
          buzz('invalid');
          return;
        }
        const c = deck.pop();
        const hand = myHand();
        hand.push(c);
        setMyHand(hand);
        drawnId = c.id;
        phase = 'needDiscard';
        selectedId = null;
        highlightIds = [];
        markIDrew();
        buzz('card');
        if (liveOn) pushState();
        paint('Drawn — select a card to discard or declare.');
      });

      shell.body.querySelector('[data-take]')?.addEventListener('click', () => {
        if (!myTurn || ended || phase !== 'needDraw' || !discard.length) return;
        if (myHand().length !== 13) {
          buzz('invalid');
          return;
        }
        const c = discard.pop();
        const hand = myHand();
        hand.push(c);
        setMyHand(hand);
        drawnId = c.id;
        phase = 'needDiscard';
        selectedId = null;
        highlightIds = [];
        markIDrew();
        buzz('card');
        if (liveOn) pushState();
        paint('Took discard — select a card to discard or declare.');
      });

      shell.body.querySelector('[data-discard]')?.addEventListener('click', () => {
        if (!myTurn || ended || phase !== 'needDiscard' || !selectedId) return;
        const hand = myHand().slice();
        if (hand.length !== 14) {
          buzz('invalid');
          return;
        }
        const ix = hand.findIndex((c) => c.id === selectedId);
        if (ix < 0) return;
        discard.push(hand.splice(ix, 1)[0]);
        setMyHand(hand);
        drawnId = null;
        selectedId = null;
        phase = 'needDraw';
        highlightIds = [];
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
        paint('Opponent thinking…');
        if (aiTimer) clearTimeout(aiTimer);
        const think =
          difficulty === 'easy'
            ? 400 + Math.floor(rng() * 250)
            : difficulty === 'hard'
              ? 550 + Math.floor(rng() * 350)
              : 480 + Math.floor(rng() * 320);
        aiTimer = setTimeout(() => {
          aiTimer = 0;
          if (ended || !shell.alive()) return;
          aiPlay();
          if (ended || !shell.alive()) return;
          myTurn = true;
          phase = 'needDraw';
          drawnId = null;
          selectedId = null;
          highlightIds = [];
          paint('Your turn — draw or take discard.');
        }, Math.min(900, Math.max(400, think)));
      });

      async function runDeclare(forceWrong) {
        if (!myTurn || ended || phase !== 'needDiscard' || !selectedId) return;
        const hand14 = myHand().slice();
        if (hand14.length !== 14) {
          buzz('invalid');
          return;
        }
        const finish = hand14.find((c) => c.id === selectedId);
        const remaining = hand14.filter((c) => c.id !== selectedId);
        const result = evaluateRummyHand(remaining, { wildRank });
        if (!result.ok) {
          if (!forceWrong) {
            buzz('invalid');
            const err = (result.errors && result.errors[0]) || 'Need a pure sequence…';
            if (typeof showToast === 'function') showToast(err);
            paint(err + ' — keep playing, or Show to risk 80.');
            return;
          }
          discard.push(finish);
          setMyHand(remaining);
          drawnId = null;
          selectedId = null;
          endRummyHand({
            reason: 'wrongShow',
            youPoints: RUMMY_WRONG_SHOW,
            oppPoints: 0,
            winnerIsYou: false,
            detail: 'Wrong show',
          });
          return;
        }
        discard.push(finish);
        setMyHand(remaining);
        drawnId = null;
        selectedId = null;
        const oppDead = scoreRummyDeadwood(oppHand(), wildRank);
        endRummyHand({
          reason: 'declare',
          youPoints: 0,
          oppPoints: oppDead.points,
          winnerIsYou: true,
          melds: result.melds,
          detail: meldSummary(result.melds) || 'Valid declare',
        });
      }

      shell.body.querySelector('[data-declare]')?.addEventListener('click', () => {
        runDeclare(false);
      });

      shell.body.querySelector('[data-show]')?.addEventListener('click', async () => {
        if (!myTurn || ended || phase !== 'needDiscard' || !selectedId) return;
        const hand14 = myHand().slice();
        const remaining = hand14.filter((c) => c.id !== selectedId);
        const result = evaluateRummyHand(remaining, { wildRank });
        if (result.ok) {
          runDeclare(false);
          return;
        }
        let ok = false;
        if (typeof confirmSheet === 'function') {
          ok = await confirmSheet({
            title: 'Wrong show?',
            message: 'Hand is not valid. Show anyway for 80 points and end the hand?',
            confirmLabel: 'Show (80)',
            cancelLabel: 'Keep playing',
            danger: true,
          });
        } else {
          ok = typeof confirm === 'function' && confirm('Show anyway for 80 points?');
        }
        if (!ok) {
          paint('Kept playing — fix melds or discard.');
          return;
        }
        runDeclare(true);
      });

      shell.body.querySelector('[data-drop]')?.addEventListener('click', async () => {
        if (!myTurn || ended || phase !== 'needDraw' || myHand().length !== 13) return;
        const first = !iHaveDrawn();
        const pts = first ? RUMMY_FIRST_DROP : RUMMY_MIDDLE_DROP;
        let ok = true;
        if (typeof confirmSheet === 'function') {
          ok = await confirmSheet({
            title: first ? 'First drop?' : 'Middle drop?',
            message: 'Drop for ' + pts + ' points? Opponent scores 0.',
            confirmLabel: 'Drop ' + pts,
            cancelLabel: 'Cancel',
            danger: false,
          });
        }
        if (!ok) return;
        endRummyHand({
          reason: 'drop',
          youPoints: pts,
          oppPoints: 0,
          winnerIsYou: false,
          detail: first ? 'First drop' : 'Middle drop',
        });
      });
    }

    /** Meld-aware Practice AI — declare/drop with intent; never wrong-shows. */
    function aiPlay() {
      if (liveOn || ended || !shell.alive()) return;
      if (handB.length !== 13) {
        while (handB.length > 13 && handB.length) discard.push(handB.pop());
        while (handB.length < 13 && deck.length) handB.push(deck.pop());
      }
      if (handB.length !== 13) return;

      aiTurns += 1;
      const dead = scoreRummyDeadwood(handB, wildRank);
      const hasSeed = dead.hasPure || rummyAiHasPureSeed(handB, wildRank);

      // First drop — rare, only hopeless trash
      if (!drewB) {
        const firstHopeless = dead.points >= 70 && !hasSeed;
        const pDrop =
          difficulty === 'easy' ? 0.02 : difficulty === 'hard' ? 0.12 : 0.06;
        if (firstHopeless && rng() < pDrop) {
          endRummyHand({
            reason: 'oppDrop',
            youPoints: 0,
            oppPoints: RUMMY_FIRST_DROP,
            winnerIsYou: true,
            detail: 'AI first drop',
          });
          return;
        }
      } else if (aiTurns >= 3) {
        // Middle drop if still awful and drop beats likely loss
        const midHopeless = dead.points >= 65 && !hasSeed;
        const pMid =
          difficulty === 'easy' ? 0.03 : difficulty === 'hard' ? 0.14 : 0.08;
        if (midHopeless && dead.points > RUMMY_MIDDLE_DROP && rng() < pMid) {
          endRummyHand({
            reason: 'oppDrop',
            youPoints: 0,
            oppPoints: RUMMY_MIDDLE_DROP,
            winnerIsYou: true,
            detail: 'AI middle drop',
          });
          return;
        }
      }

      const top = discard[discard.length - 1];
      let took = null;
      if (top && rummyAiWantDiscard(handB, top, wildRank, difficulty)) {
        took = discard.pop();
        handB.push(took);
      } else if (deck.length) {
        took = deck.pop();
        handB.push(took);
      } else if (top) {
        took = discard.pop();
        handB.push(took);
      }
      drewB = true;

      if (handB.length !== 14) {
        while (handB.length > 14) discard.push(handB.pop());
        while (handB.length < 14 && deck.length) handB.push(deck.pop());
      }
      if (handB.length !== 14) return;

      // Declare if any finishing discard yields valid Indian hand
      for (let i = 0; i < handB.length; i++) {
        const finish = handB[i];
        const rem = handB.filter((_, j) => j !== i);
        const result = evaluateRummyHand(rem, { wildRank });
        if (result.ok) {
          discard.push(finish);
          handB = rem;
          const youDead = scoreRummyDeadwood(handA, wildRank);
          endRummyHand({
            reason: 'declare',
            youPoints: youDead.points,
            oppPoints: 0,
            winnerIsYou: false,
            melds: result.melds,
            detail: 'AI declare',
          });
          return;
        }
      }

      const dump = rummyAiPickDiscard(handB, wildRank, difficulty);
      if (dump) {
        const ix = handB.findIndex((c) => c.id === dump.id);
        if (ix >= 0) discard.push(handB.splice(ix, 1)[0]);
      } else if (handB.length > 13) {
        discard.push(handB.pop());
      }
      while (handB.length > 13) discard.push(handB.pop());
    }



    function hydrate(st, turn) {
      if (!st) return;
      if (st.handA) handA = st.handA;
      if (st.handB) handB = st.handB;
      if (st.discard) discard = st.discard;
      if (st.deck) deck = st.deck;
      if (st.wildRank) wildRank = st.wildRank;
      if (st.wildShow) wildShow = st.wildShow;
      if (st.drewA != null) drewA = !!st.drewA;
      if (st.drewB != null) drewB = !!st.drewB;
      phase = st.phase === 'needDiscard' ? 'needDiscard' : 'needDraw';
      drawnId = st.drawnId || null;
      if (st.drawn && st.drawnId && !st.phase) {
        phase = 'needDiscard';
        drawnId = st.drawnId;
      }
      selectedId = null;
      highlightIds = [];
      myTurn = turn === liveRoles.me;
      if (myTurn && phase === 'needDraw' && myHand().length === 14) phase = 'needDiscard';
      if (myTurn && phase === 'needDiscard' && myHand().length === 13) phase = 'needDraw';
    }

    if (liveOn) {
      const joined = joinLive(shell, chat, 'rummy', (val) => {
        if (!val || ended) return;
        if (val.status === 'forfeit' || val.status === 'over') {
          const iWon = val.winner === liveRoles.me;
          const st = val.state || {};
          if (st.handA) handA = st.handA;
          if (st.handB) handB = st.handB;
          let youPoints = st.youPoints;
          let oppPoints = st.oppPoints;
          if (youPoints == null && st.scoreA != null && liveRoles) {
            youPoints = liveRoles.me === liveRoles.playerA ? st.scoreA | 0 : st.scoreB | 0;
            oppPoints = liveRoles.me === liveRoles.playerA ? st.scoreB | 0 : st.scoreA | 0;
          }
          if (youPoints == null) {
            youPoints = iWon ? 0 : 80;
            oppPoints = iWon ? 80 : 0;
          }
          let reason = st.reason || (val.status === 'forfeit' ? 'forfeit' : 'declare');
          if (reason === 'drop' && !iWon) reason = 'drop';
          if (reason === 'drop' && iWon) reason = 'oppDrop';
          endRummyHand({
            reason,
            youPoints: youPoints | 0,
            oppPoints: oppPoints | 0,
            winnerIsYou: iWon,
            skipLivePush: true,
            melds: st.melds || [],
            detail: rummyReasonLabel(reason),
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
          dealFresh();
          myTurn = true;
          phase = 'needDraw';
          pushState({ turn: liveRoles.me });
          paint('Your break \u2014 draw or take the open discard.');
        } else {
          shell.body.innerHTML = '<p class="pc-hint">Waiting for deal\u2026</p>';
        }
      }
    } else {
      dealFresh();
      myTurn = true;
      paint('Your turn \u2014 draw or take the open discard.');
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
    // UX: Call or Play mid-hand; empty-hand finish → Call or Pass window.
    // Live privacy: public state never carries opp faces / honest / pre-reveal cards.
    // Deal: host sends only the guest's hand (handFor); host keeps own locally.
    // Stakes: settle once per matchId (table) via reportGameEnd; rematch Again is idempotent.
    const liveStake = liveOn
      ? Number(
          (chat && chat.stake) ||
            (window.__dangalLaunchCtx && window.__dangalLaunchCtx.stake) ||
            0
        ) || 0
      : 0;
    const settleMatchId = liveOn ? String(matchIdFor(chat, 'bluff') || '').trim() : '';
    let settleOppUid = '';
    let settleDone = false;
    let resultReported = false;
    let phase = 'playing'; // playing | over
    let aiTimer = 0;
    let revealTimer = 0;
    const shell = openShell({
      id: 'bluff',
      title: 'Bluff',
      subtitle: liveOn
        ? liveSub() + (liveStake > 0 ? ' · Stake ⚡' + liveStake + ' (virtual)' : ' · Friendly') + ' · 1v1'
        : practiceSub('Empty hand · pressure'),
      mode: liveOn ? 'live' : 'practice',
      live: liveOn,
      chat,
      accent: '#FF1744',
      bg: '#0A0E10',
      leaveBody: 'Forfeit this Bluff hand?',
      cleanup: () => {
        if (aiTimer) {
          clearTimeout(aiTimer);
          aiTimer = 0;
        }
        if (revealTimer) {
          clearTimeout(revealTimer);
          revealTimer = 0;
        }
        myPendingPlay = null;
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
    /** Local-only last play secret — never on the wire until reveal. */
    let myPendingPlay = null; // { honest, cards }
    let claimPick = 'A';
    let seq = 0;
    let dealtLive = false;
    let callInFlight = false;
    let revealing = false;
    let lastRevealId = '';
    /** Seat that just emptied — opponent must Call or Pass before empty-hand win. */
    let pendingOutSeatA = null; // boolean | null
    let coachShown = false;
    let aiBluffStreak = 0;
    let aiKnownGone = {}; // rank -> count AI saw leave play (from reveals)
    let lastAppliedSeq = -1;

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
    function myHandCount() {
      return myHand().length;
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
    function giveCardsToSeat(seatA, cards) {
      const add = (cards || []).map((c) => ({ r: c.r, s: c.s, id: c.id || c.r + c.s + Math.random() }));
      if (seatA) handA = handA.concat(add);
      else handB = handB.concat(add);
    }

    function publicState() {
      return {
        phase,
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
        pendingOutSeatA: pendingOutSeatA,
        seq,
        // Never: handA/handB, honest, pre-reveal cards
      };
    }

    function pushLive(extra) {
      if (!liveOn || !liveHandle || applying || ended) return;
      liveHandle.push(
        Object.assign(
          {
            status: phase === 'over' ? 'over' : 'playing',
            turn: turnIsA ? liveRoles.playerA : liveRoles.playerB,
            state: publicState(),
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
      pendingOutSeatA = null;
      aiBluffStreak = 0;
      aiKnownGone = {};
      phase = 'playing';
      lastAppliedSeq = -1;
    }

    /** Host-only: guest receives their hand; host hand never enters RTDB. */
    function publishPrivateDeal() {
      if (!liveOn || !liveHandle || !liveRoles) return;
      const guestUid = liveRoles.opp;
      const guestHand = (iAmA() ? handB : handA).map((c) => ({ r: c.r, s: c.s, id: c.id }));
      maskOppFaces();
      dealtLive = true;
      liveHandle.push({
        status: 'playing',
        turn: liveRoles.playerA,
        act: 'deal',
        handFor: guestUid,
        hand: guestHand,
        state: publicState(),
      });
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
      const out =
        pendingOutSeatA != null && pendingOutSeatA === lastClaim.seatA ? ' · LAST PLAY' : '';
      return `Last claim: ${who} · ${lastClaim.count}× ${lastClaim.rank}${
        lockedRank ? ' · locked ' + lockedRank : ''
      }${out}`;
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

    function pressureClass(n) {
      return n <= 2 ? ' is-hot' : '';
    }

    function hudHtml() {
      const mh = myHandCount();
      const oh = oppHandCount();
      return `<div class="pc-bluff-hud" aria-live="polite">
        <span class="pc-bluff-seat${pressureClass(mh)}">You <b>${mh}</b> · ❤${myLives()}</span>
        <span class="pc-bluff-seat${pressureClass(oh)}">Opp <b>${oh}</b> · ❤${oppLives()}</span>
        <span class="pc-bluff-seat">Pile <b>${pile.length}</b></span>
      </div>`;
    }

    function bluffShareText(finalWin, pathMsg) {
      const path = String(pathMsg || '');
      if (finalWin && /Emptied/i.test(path)) {
        return 'I emptied my hand on Chaupaal Bluff — called the pile (virtual stakes)';
      }
      if (finalWin && /lives/i.test(path)) {
        return 'I won Bluff on Chaupaal — outlasted on lives (virtual stakes)';
      }
      if (finalWin) return 'I won Bluff on Chaupaal — called the pile';
      if (/Forfeit/i.test(path)) return 'Bluff on Chaupaal — rematch?';
      return 'Bluff on Chaupaal — next time I call the pile';
    }

    async function settleBluffOnce(won) {
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
        const opp = settleOppUid || (liveRoles && liveRoles.opp) || '';
        return await DangalEconomy.reportGameEnd({
          gameType: 'bluff',
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

    function reportBluffResult(finalWin, pathMsg) {
      if (resultReported) return;
      resultReported = true;
      if (typeof recordGameResult === 'function') {
        try {
          recordGameResult('bluff', !!finalWin, false, {
            live: !!liveOn,
            stake: liveStake,
            mode: liveOn ? 'live' : 'practice',
            path: pathMsg || '',
          });
        } catch (e) {}
      }
    }

    function endGame(finalWin, pathMsg) {
      if (ended) return true;
      ended = true;
      phase = 'over';
      pendingOutSeatA = null;
      myPendingPlay = null;
      if (liveRoles && liveRoles.opp) settleOppUid = liveRoles.opp;
      reportBluffResult(finalWin, pathMsg);
      // Economy: settleBluffOnce + setOutcome (idempotent on matchId)
      settleBluffOnce(finalWin).then((settle) => {
        let sub = pathMsg || '';
        if (liveOn && liveStake > 0) {
          const cd = settle && settle.chipDelta != null ? Number(settle.chipDelta) : null;
          sub +=
            (sub ? ' · ' : '') +
            (Number.isFinite(cd) && cd !== 0
              ? 'Stake ' + (cd > 0 ? '+' : '') + cd + ' virtual'
              : 'Virtual stakes · not real money');
        }
        if (liveOn && liveHandle && !applying) {
          try {
            liveHandle.push({
              status: 'over',
              winner: finalWin ? liveRoles.me : liveRoles.opp,
              state: publicState(),
            });
          } catch (e) {}
        }
        showDuelResult(shell, {
          id: 'bluff',
          you: finalWin ? 1 : 0,
          opp: finalWin ? 0 : 1,
          glyph: '🎭',
          subtitle: sub,
          shareText: bluffShareText(finalWin, pathMsg),
          onAgain: () => openBluff(chat),
        });
      });
      return true;
    }

    /** Lives floor only — empty hand never ends here (needs call window). */
    function checkLivesEnd() {
      if (myLives() <= 0) return endGame(false, 'Out of lives');
      if (oppLives() <= 0) return endGame(true, 'Opponent out of lives');
      return false;
    }

    function awardEmptyWin(seatA) {
      const iWin = seatA === iAmA();
      return endGame(iWin, iWin ? 'Emptied hand' : 'Opponent emptied hand');
    }

    function paint(msg) {
      if (ended || revealing) return;
      const you = myHand();
      const mine = myTurn();
      const facingOppClaim = !!(lastClaim && lastClaim.seatA !== iAmA() && pile.length > 0);
      const facingOut =
        facingOppClaim && pendingOutSeatA != null && pendingOutSeatA === lastClaim.seatA;
      const canCall = mine && facingOppClaim && !callInFlight;
      const canPassOut = mine && facingOut && !callInFlight;
      // Mid-hand: play accepts claim. Finish window: Pass awards empty win (no play).
      const canPlay = mine && you.length > 0 && !callInFlight && !facingOut;
      if (!coachShown && !liveOn) {
        coachShown = true;
        msg =
          msg ||
          'Empty your hand — but a call on your last play can still burn you.';
      }
      shell.body.innerHTML = `
        <div class="pc-bluff">
          ${hudHtml()}
          ${pileGraphic()}
          <p class="pc-bluff-claim" role="status">${esc(claimBanner())}</p>
          <p class="pc-hint">${esc(
            msg ||
              (mine
                ? canPassOut
                  ? 'Last play on the table — Call or Pass'
                  : canCall
                    ? 'Call the claim — or play to accept it'
                    : 'Select 1–3 cards · claim the locked rank'
                : facingOut && pendingOutSeatA === iAmA()
                  ? 'Waiting — they may Call your last play'
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
          <div class="pc-bluff-actions">
            ${canCall ? `<button type="button" class="cs-hit cs-hit--ghost" data-call>Call bluff</button>` : ''}
            ${canPassOut ? `<button type="button" class="cs-hit" data-pass>Pass — they empty</button>` : ''}
          </div>
          <p class="pc-hint pc-tp-boot">Pile · claim · call/pass · last-card risk · virtual stakes</p>
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
          if (!mine || callInFlight || facingOut) return;
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
      shell.body.querySelector('[data-pass]')?.addEventListener('click', () => doPassOut());
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
          ${hudHtml()}
          <div class="pc-bluff-reveal ${honest ? 'is-honest' : 'is-caught'}" role="status">
            <p class="pc-bluff-reveal-verdict">${esc(verdict)}</p>
            <div class="pc-hand pc-bluff-reveal-cards">${cards.map(cardFace).join('') || '<span class="pc-hint">—</span>'}</div>
            <p class="pc-hint">${esc(detail)}</p>
          </div>
        </div>`;
      if (revealTimer) clearTimeout(revealTimer);
      revealTimer = setTimeout(() => {
        revealTimer = 0;
        revealing = false;
        if (typeof thenFn === 'function') thenFn();
      }, 1600);
    }

    function noteRevealForAi(cards) {
      (cards || []).forEach((c) => {
        aiKnownGone[c.r] = (aiKnownGone[c.r] || 0) + 1;
      });
    }

    /**
     * Evaluate + score a call. Last play only.
     * Caught bluff on empty hand → return revealed cards so the duel can continue.
     */
    function resolveCall(callerIsMe) {
      if (!lastClaim || !pile.length) return null;
      const claimerIsA = lastClaim.seatA;
      const count = lastClaim.count;
      const wasPendingOut = pendingOutSeatA != null && pendingOutSeatA === claimerIsA;
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

      noteRevealForAi(cards);

      if (honest) {
        if (callerIsMe) setLives(-1, 0);
        else setLives(0, -1);
        turnIsA = claimerIsA;
        pendingOutSeatA = null;
        clearPileRound();
        seq += 1;
        return {
          honest: true,
          cards,
          msg: 'False call! Claim was true — caller loses a life.',
          claimerIsA,
          callerIsMe,
          emptyWinSeatA: wasPendingOut ? claimerIsA : null,
          revealId: 'r' + seq + '-' + Date.now(),
        };
      }

      // Bluff caught
      if (claimerIsA === iAmA()) setLives(-1, 0);
      else setLives(0, -1);
      turnIsA = callerIsMe ? iAmA() : !claimerIsA;
      clearPileRound();
      // Restore last play to claimer if they had emptied (no instant empty win after catch)
      const claimerEmpty =
        (claimerIsA && handA.length === 0) || (!claimerIsA && handB.length === 0);
      if (claimerEmpty || wasPendingOut) {
        giveCardsToSeat(claimerIsA, cards);
      }
      pendingOutSeatA = null;
      seq += 1;
      return {
        honest: false,
        cards,
        msg: 'Caught! Bluff revealed — claimer loses a life.',
        claimerIsA,
        callerIsMe,
        emptyWinSeatA: null,
        revealId: 'r' + seq + '-' + Date.now(),
      };
    }

    function finishAfterReveal(result) {
      if (checkLivesEnd()) return;
      if (result && result.emptyWinSeatA != null) {
        awardEmptyWin(result.emptyWinSeatA);
        return;
      }
      paint((result && result.msg ? result.msg + ' ' : '') + 'Fresh claim window.');
    }

    function doPlay(selectedSet) {
      if (!myTurn() || ended) return;
      if (pendingOutSeatA != null && lastClaim && lastClaim.seatA !== iAmA()) return;
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
      // Playing mid-hand accepts prior claim
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
      const emptied = hand.length === 0;
      pendingOutSeatA = emptied ? iAmA() : null;
      buzz('card');
      passTurn();
      pushLive({ act: 'play', by: liveRoles && liveRoles.me, seq });
      // Never end on empty here — opponent gets Call/Pass window
      if (checkLivesEnd()) return;
      paint(
        emptied
          ? `Last play ${cards.length}× ${rank} — they may Call or Pass`
          : `Played ${cards.length}× ${rank} face-down`
      );
    }

    function doPassOut() {
      if (!myTurn() || ended || callInFlight || revealing) return;
      if (pendingOutSeatA == null || !lastClaim || lastClaim.seatA === iAmA()) return;
      if (pendingOutSeatA !== lastClaim.seatA) return;
      buzz('card');
      const seat = pendingOutSeatA;
      pendingOutSeatA = null;
      if (liveOn && liveHandle && !applying && !ended) {
        liveHandle.push({
          status: 'playing',
          turn: turnIsA ? liveRoles.playerA : liveRoles.playerB,
          act: 'passOut',
          passOutSeatA: seat,
          by: liveRoles.me,
          state: publicState(),
        });
      }
      awardEmptyWin(seat);
    }

    function doCall() {
      if (!myTurn() || ended || callInFlight || revealing) return;
      if (!lastClaim || lastClaim.seatA === iAmA() || !pile.length) return;
      callInFlight = true;
      if (liveOn) {
        pushLive({ act: 'call', callBy: liveRoles.me, by: liveRoles.me, seq });
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
          emptyWinSeatA: result.emptyWinSeatA,
          pendingOutSeatA: null,
          handCountA: handA.length,
          handCountB: handB.length,
        },
        state: publicState(),
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
        if (rev.handCountA != null && !iAmA()) syncOppCount(rev.handCountA);
        if (rev.handCountB != null && iAmA()) syncOppCount(rev.handCountB);
        // Remote claimer already restored cards locally; sync counts only
        clearPileRound();
        pendingOutSeatA = null;
        noteRevealForAi(rev.cards);
      }
      callInFlight = false;
      const payload = {
        honest: !!rev.honest,
        cards: (rev.cards || []).map((c) => ({ r: c.r, s: c.s, id: c.id || c.r + c.s })),
        msg: rev.msg,
        emptyWinSeatA: rev.emptyWinSeatA != null ? rev.emptyWinSeatA : null,
      };
      showReveal(payload, () => finishAfterReveal(payload));
    }

    function applyRemote(val) {
      const st = val.state || {};
      const act = val.act;
      applying = true;

      // Stale / wrong-seat: ignore plays & calls from non-actors
      if ((act === 'play' || act === 'call' || act === 'passOut') && val.by) {
        if (act === 'play' && val.by === liveRoles.me) {
          // own echo — keep secret, sync public only below
        } else if (act === 'call' && val.callBy === liveRoles.me) {
          // own call echo
        } else if (st.seq != null && Number(st.seq) < lastAppliedSeq) {
          applying = false;
          return;
        }
      }
      if (st.seq != null) lastAppliedSeq = Math.max(lastAppliedSeq, Number(st.seq) || 0);

      // Private deal: only apply hand when addressed to me (never both hands in state)
      if (act === 'deal') {
        if (val.handFor === liveRoles.me && Array.isArray(val.hand)) {
          const mine = val.hand.map((c) => ({ r: c.r, s: c.s, id: c.id || c.r + c.s }));
          setMyHand(mine);
          dealtLive = true;
        } else if (liveRoles.host && dealtLive) {
          // host echo — already has local hands
        } else if (Array.isArray(st.handA) || Array.isArray(st.handB)) {
          // Legacy leaky deal — take only own seat if present, mask opp
          if (iAmA() && Array.isArray(st.handA)) handA = st.handA.slice();
          if (!iAmA() && Array.isArray(st.handB)) handB = st.handB.slice();
          maskOppFaces();
          dealtLive = true;
        }
        if (st.handCountA != null && !iAmA()) syncOppCount(st.handCountA);
        if (st.handCountB != null && iAmA()) syncOppCount(st.handCountB);
        if (st.livesA != null) livesA = st.livesA;
        if (st.livesB != null) livesB = st.livesB;
        if (st.turnIsA != null) turnIsA = !!st.turnIsA;
        phase = 'playing';
        applying = false;
        paint('Dealt — empty your hand, watch lives');
        return;
      }

      if (act !== 'reveal') {
        if (st.phase) phase = st.phase;
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
        if (st.pendingOutSeatA !== undefined) {
          pendingOutSeatA = st.pendingOutSeatA === null ? null : !!st.pendingOutSeatA;
        }
        if (dealtLive) {
          if (iAmA() && st.handCountB != null) syncOppCount(st.handCountB);
          if (!iAmA() && st.handCountA != null) syncOppCount(st.handCountA);
        }
      }

      if (act === 'passOut') {
        applying = false;
        if (val.by && val.by === liveRoles.me) return; // own echo — already awarded
        if (val.passOutSeatA != null) {
          awardEmptyWin(!!val.passOutSeatA);
          return;
        }
        if (lastClaim) awardEmptyWin(lastClaim.seatA);
        return;
      }

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
        if (val.by && val.by !== liveRoles.me) myPendingPlay = null;
        callInFlight = false;
      }

      applying = false;
      if (val.turn != null) turnIsA = val.turn === liveRoles.playerA;
      paint(
        act === 'play'
          ? pendingOutSeatA != null && lastClaim && lastClaim.seatA !== iAmA()
            ? 'Last play — Call or Pass'
            : 'Opponent played — Call or play to accept'
          : undefined
      );
    }

    /* ----- Practice AI (local only; nothing AI-secret on Live wire) ----- */

    function countRank(hand, rank) {
      return hand.filter((c) => c.r === rank).length;
    }

    function aiSuspicion() {
      if (!lastClaim || lastClaim.seatA !== true) return 0;
      let s = 0;
      const rank = lastClaim.rank;
      const count = lastClaim.count;
      const myOfRank = countRank(handB, rank);
      const gone = aiKnownGone[rank] || 0;
      // Max 4 of a rank in a deck; AI holds myOfRank; gone seen; player claimed count
      const room = 4 - myOfRank - gone;
      if (count > room) s += 0.55;
      if (count >= 3) s += 0.22;
      if (count === 2) s += 0.08;
      if (handA.length <= 2) s += 0.28;
      if (handA.length === 0 || pendingOutSeatA === true) s += 0.35;
      if (pile.length >= 8) s += 0.1;
      if (myOfRank >= 2 && count >= 2) s += 0.12;
      return Math.min(0.92, s);
    }

    function aiPickPlay() {
      if (!handB.length) return null;
      const rank = lockedRank || null;
      const behind = handB.length > handA.length + 1;
      const ending = handB.length <= 3;
      const matching = rank ? handB.filter((c) => c.r === rank) : [];

      // Honest dump when holding many of claim / freely choose best dump
      if (rank && matching.length >= 2 && aiBluffStreak < 2) {
        const n = Math.min(3, matching.length, ending ? matching.length : 1 + (rng() < 0.45 ? 1 : 0));
        return { cards: matching.slice(0, n), claim: rank, bluff: false };
      }
      if (rank && matching.length >= 1 && !behind && rng() < 0.62) {
        return { cards: matching.slice(0, 1), claim: rank, bluff: false };
      }

      // Free first play: pick densest rank
      if (!rank) {
        const by = {};
        handB.forEach((c) => {
          by[c.r] = (by[c.r] || 0) + 1;
        });
        let best = handB[0].r;
        let bestN = 0;
        Object.keys(by).forEach((r) => {
          if (by[r] > bestN) {
            bestN = by[r];
            best = r;
          }
        });
        const pack = handB.filter((c) => c.r === best).slice(0, Math.min(3, bestN));
        return { cards: pack, claim: best, bluff: false };
      }

      // Bluff — cap streak
      const wantBluff = aiBluffStreak < 2 && (behind || ending || matching.length === 0 || rng() < 0.28);
      if (wantBluff || matching.length === 0) {
        const others = matching.length ? handB.filter((c) => c.r !== rank) : handB.slice();
        const pool = others.length ? others : handB.slice();
        const n = Math.min(3, pool.length, ending ? Math.min(3, pool.length) : 1 + (rng() < 0.2 ? 1 : 0));
        // Prefer 1 unless dumping to empty
        let take = n;
        if (ending && pool.length <= 3 && rng() < 0.55) take = pool.length;
        else take = Math.min(take, 1 + (rng() < 0.25 ? 1 : 0));
        take = Math.max(1, Math.min(3, take, pool.length));
        return { cards: pool.slice(0, take), claim: rank, bluff: true };
      }

      return { cards: matching.slice(0, 1), claim: rank, bluff: false };
    }

    function scheduleAi() {
      if (aiTimer) clearTimeout(aiTimer);
      const facingHumanClaim = lastClaim && lastClaim.seatA === true && pile.length;
      const sus = facingHumanClaim ? aiSuspicion() : 0;
      const willCall = facingHumanClaim && sus > 0.42;
      // Subtle tell: longer pause before bluff plays
      const think = willCall
        ? 420 + Math.floor(rng() * 280)
        : 380 + Math.floor(rng() * 360);
      aiTimer = setTimeout(() => {
        aiTimer = 0;
        if (ended || myTurn() || liveOn || revealing || callInFlight) return;
        runAi();
      }, Math.min(800, think));
    }

    function runAi() {
      if (ended || turnIsA || revealing) return;

      // Finish window: Call or Pass
      if (pendingOutSeatA === true && lastClaim && lastClaim.seatA === true && pile.length) {
        const sus = aiSuspicion();
        if (sus > 0.38 || rng() < sus) {
          const result = resolveCall(false);
          if (result) {
            lastRevealId = result.revealId;
            showReveal(result, () => finishAfterReveal(result));
            return;
          }
        }
        // Pass — human emptied
        buzz('card');
        pendingOutSeatA = null;
        awardEmptyWin(true);
        return;
      }

      // Mid-hand Call?
      if (lastClaim && lastClaim.seatA === true && pile.length) {
        const sus = aiSuspicion();
        if (sus > 0.48 && rng() < sus) {
          const result = resolveCall(false);
          if (result) {
            lastRevealId = result.revealId;
            showReveal(result, () => finishAfterReveal(result));
            return;
          }
        }
      }

      if (!handB.length) {
        // Should have been pendingOut — safety Pass path already handled
        if (pendingOutSeatA === false) {
          // waiting on human — shouldn't be AI turn
          return;
        }
        checkLivesEnd();
        return;
      }

      const pick = aiPickPlay();
      if (!pick || !pick.cards.length) {
        paint('Opponent stalled — your turn');
        turnIsA = true;
        return;
      }
      const delayBluff = pick.bluff ? 180 + Math.floor(rng() * 220) : 0;
      const commit = () => {
        if (ended || turnIsA) return;
        pick.cards.forEach((c) => {
          const ix = handB.findIndex((x) => x.id === c.id);
          if (ix >= 0) handB.splice(ix, 1);
        });
        const cards = pick.cards.map((c) => ({ r: c.r, s: c.s, id: c.id }));
        pile = pile.concat(pick.cards);
        if (!lockedRank) lockedRank = pick.claim;
        lastClaim = { seatA: false, rank: pick.claim, count: cards.length };
        aiBluffStreak = pick.bluff ? aiBluffStreak + 1 : 0;
        const emptied = handB.length === 0;
        pendingOutSeatA = emptied ? false : null;
        buzz('card');
        passTurn();
        if (checkLivesEnd()) return;
        paint(
          emptied
            ? `Opponent’s last play ${cards.length}× ${pick.claim} — Call or Pass`
            : `Opponent played ${cards.length}× ${pick.claim}${pick.bluff ? '' : ''} — Call or play`
        );
      };
      if (delayBluff) {
        if (aiTimer) clearTimeout(aiTimer);
        aiTimer = setTimeout(() => {
          aiTimer = 0;
          commit();
        }, Math.min(400, delayBluff));
      } else commit();
    }

    if (liveOn) {
      const joined = joinLive(
        shell,
        chat,
        'bluff',
        (val) => {
          if (!val || ended) return;
          if (liveRoles && liveRoles.opp) settleOppUid = liveRoles.opp;
          if (val.status === 'forfeit' || val.status === 'over') {
            const iWon = val.winner === liveRoles.me;
            endGame(
              iWon,
              val.status === 'forfeit'
                ? iWon
                  ? 'Opponent forfeited'
                  : 'Forfeit'
                : iWon
                  ? 'Emptied hand'
                  : 'Opponent emptied hand'
            );
            return;
          }
          applyRemote(val);
        },
        null,
        {
          stake: liveStake,
          onForfeit(info, roles) {
            if (ended) return;
            if (roles && roles.opp) settleOppUid = roles.opp;
            const iWon = !!(info && info.winner === roles.me);
            myPendingPlay = null;
            endGame(iWon, iWon ? 'Opponent forfeited' : 'Forfeit');
          },
        }
      );
      if (joined) {
        liveHandle = joined.handle;
        liveRoles = joined.roles;
        settleOppUid = liveRoles.opp || settleOppUid;
        if (liveRoles.host) {
          dealBoth();
          publishPrivateDeal();
          paint('Dealt — empty your hand, watch lives');
        } else {
          shell.body.innerHTML = `<p class="pc-hint">Waiting for deal…</p>`;
        }
      }
    } else {
      dealBoth();
      paint('Empty your hand — but a call on your last play can still burn you.');
      coachShown = true;
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
      { id: 'pool', name: 'Pool', desc: '8-ball · solids & stripes', icon: '🎱', genre: 'board', launch: openPool, order: 32 },
      { id: 'rummy', name: 'Rummy', desc: 'Points · meld-aware AI', icon: '🃏', genre: 'party', launch: openRummy, order: 33 },
      { id: 'teenpatti', name: 'Teen Patti', desc: 'Boot, chaal, side-show · virtual chips', icon: '♠', genre: 'party', launch: openTeenPatti, order: 34 },
      { id: 'bluff', name: 'Bluff', desc: 'Pile claims · call · empty hand', icon: '🎭', genre: 'party', launch: openBluff, order: 35 },
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
  window.evaluateRummyHand = evaluateRummyHand;
  window.scoreRummyDeadwood = scoreRummyDeadwood;
  window.openTeenPatti = openTeenPatti;
  window.openBluff = openBluff;
  window.openSattePeSatta = openSatte;
  window.openAndarBahar = openAndarBahar;
})();
