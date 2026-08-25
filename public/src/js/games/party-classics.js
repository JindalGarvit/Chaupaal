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
    let pauseCtrl = null;
    const pauseId = 'pcCuePause_' + (spec.id || 'game');
    const chat = resolveChat(spec.chat || arguments[0]);
    const liveOn = chatLiveOn(chat);
    const cueSub = liveOn ? liveSub() : practiceSub(spec.subtitle || spec.title || 'vs AI');
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
      cleanup: () => {
        cancelAnimationFrame(raf);
        if (pauseCtrl) pauseCtrl.destroy();
      },
    });
    if (!shell) return;

    shell.body.innerHTML = `<div class="pc-cue"><canvas data-cue></canvas><p class="pc-hint" data-cue-hint>Drag back on the striker to aim, release to shoot.</p></div>`;
    const canvas = shell.body.querySelector('[data-cue]');
    const hint = shell.body.querySelector('[data-cue-hint]');
    let ctx = canvas.getContext('2d');
    let W = 320;
    let H = 420;
    const R = spec.ballR || 9;
    const pockets = spec.pockets;
    let balls = [];
    let dragging = null;
    let aim = { x: 0, y: 0 };
    let youPocketed = 0;
    let oppPocketed = 0;
    let moving = false;
    let ended = false;
    let myTurn = true;
    let applying = false;
    let liveRoles = null;
    let liveHandle = null;
    let seq = 0;

    function resize() {
      const r = canvas.getBoundingClientRect();
      W = Math.max(260, r.width || 300);
      H = Math.max(320, r.height || 400);
      if (typeof ensureGameCanvas === 'function') ensureGameCanvas(canvas, W, H);
      else {
        canvas.width = W;
        canvas.height = H;
      }
      ctx = canvas.getContext('2d');
    }
    resize();
    balls = spec.makeBalls(W, H);

    function cueBall() {
      return balls.find((b) => b.cue && !b.dead);
    }

    function snapshotBalls() {
      return balls.map((b) => ({
        x: b.x / W,
        y: b.y / H,
        dead: !!b.dead,
        cue: !!b.cue,
        color: b.color,
      }));
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
      }));
      if (scores) {
        youPocketed = liveRoles.me === liveRoles.playerA ? scores.a | 0 : scores.b | 0;
        oppPocketed = liveRoles.me === liveRoles.playerA ? scores.b | 0 : scores.a | 0;
      }
      if (turnUid) myTurn = turnUid === liveRoles.me;
      moving = false;
      hint.textContent = myTurn ? 'Your shot.' : 'Opponent’s turn…';
    }

    function pushSettle() {
      if (!liveOn || !liveHandle || !liveRoles || applying) return;
      const scores =
        liveRoles.me === liveRoles.playerA
          ? { a: youPocketed, b: oppPocketed }
          : { a: oppPocketed, b: youPocketed };
      seq += 1;
      liveHandle.push({
        status: 'playing',
        turn: liveRoles.opp,
        state: { balls: snapshotBalls(), scores, seq, phase: 'settled' },
      });
      if (typeof DangalLive !== 'undefined' && DangalLive.pingTurn) {
        DangalLive.pingTurn(liveRoles.opp, spec.id, { chatId: chat && (chat.firestoreId || chat.id) });
      }
      myTurn = false;
      hint.textContent = 'Opponent’s turn…';
    }

    canvas.addEventListener('pointerdown', (e) => {
      if (moving || ended || (liveOn && !myTurn)) return;
      const r = canvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * W;
      const y = ((e.clientY - r.top) / r.height) * H;
      const c = cueBall();
      if (!c) return;
      const dx = x - c.x;
      const dy = y - c.y;
      if (dx * dx + dy * dy < 22 * 22) {
        dragging = { sx: x, sy: y };
        canvas.setPointerCapture(e.pointerId);
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const r = canvas.getBoundingClientRect();
      aim.x = ((e.clientX - r.left) / r.width) * W;
      aim.y = ((e.clientY - r.top) / r.height) * H;
    });
    canvas.addEventListener('pointerup', () => {
      if (!dragging) return;
      const c = cueBall();
      dragging = null;
      if (!c || (liveOn && !myTurn)) return;
      const dx = c.x - aim.x;
      const dy = c.y - aim.y;
      const mag = Math.hypot(dx, dy);
      if (mag < 8) return;
      const p = Math.min(14, mag / 8);
      c.vx = (dx / mag) * p;
      c.vy = (dy / mag) * p;
      moving = true;
      buzz('stone');
    });

    function pocketed(b) {
      return pockets.some((p) => Math.hypot(b.x - p[0] * W, b.y - p[1] * H) < 18);
    }

    function step() {
      balls.forEach((b) => {
        if (b.dead) return;
        b.x += b.vx;
        b.y += b.vy;
        b.vx *= 0.985;
        b.vy *= 0.985;
        if (Math.hypot(b.vx, b.vy) < 0.04) {
          b.vx = 0;
          b.vy = 0;
        }
        if (b.x < R) {
          b.x = R;
          b.vx *= -0.8;
        }
        if (b.x > W - R) {
          b.x = W - R;
          b.vx *= -0.8;
        }
        if (b.y < R) {
          b.y = R;
          b.vy *= -0.8;
        }
        if (b.y > H - R) {
          b.y = H - R;
          b.vy *= -0.8;
        }
        if (!b.cue && pocketed(b)) {
          b.dead = true;
          b.vx = b.vy = 0;
          youPocketed += 1;
          buzz('coin');
        }
        if (b.cue && pocketed(b)) {
          b.x = W / 2;
          b.y = H * 0.82;
          b.vx = b.vy = 0;
        }
      });
      for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) {
          const a = balls[i];
          const b = balls[j];
          if (a.dead || b.dead) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 1;
          if (d < R * 2) {
            const nx = dx / d;
            const ny = dy / d;
            const p = a.vx * nx + a.vy * ny - (b.vx * nx + b.vy * ny);
            a.vx -= p * nx;
            a.vy -= p * ny;
            b.vx += p * nx;
            b.vy += p * ny;
            const ov = R * 2 - d;
            a.x -= nx * ov * 0.5;
            a.y -= ny * ov * 0.5;
            b.x += nx * ov * 0.5;
            b.y += ny * ov * 0.5;
          }
        }
      }
    }

    function remaining() {
      return balls.filter((b) => !b.cue && !b.dead).length;
    }

    function aiTurn() {
      if (liveOn) return;
      const live = balls.filter((b) => !b.cue && !b.dead);
      if (!live.length) return finish(true);
      const pick = live[Math.floor(Math.random() * live.length)];
      pick.dead = true;
      oppPocketed += 1;
      buzz('place');
      hint.textContent = 'Opponent pocketed one.';
      myTurn = true;
      if (!remaining()) finish(youPocketed >= oppPocketed);
    }

    function finish(won) {
      if (ended) return;
      ended = true;
      cancelAnimationFrame(raf);
      if (liveOn && liveHandle && liveRoles && !applying) {
        liveHandle.push({
          status: 'over',
          winner: won ? liveRoles.me : liveRoles.opp,
          state: { balls: snapshotBalls(), scores: { a: youPocketed, b: oppPocketed }, phase: 'over' },
        });
      }
      showDuelResult(shell, {
        id: spec.id,
        you: won ? 1 : 0,
        opp: won ? 0 : 1,
        glyph: spec.glyph,
        pbScore: youPocketed,
        subtitle: 'Pocketed ' + youPocketed + ' · opponent ' + oppPocketed,
        shareText: spec.title + ' on Chaupaal',
        onAgain: () => openCueGame(Object.assign({}, spec, { chat })),
      });
    }

    function draw() {
      ctx.fillStyle = spec.felt;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#1a1a1a';
      pockets.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p[0] * W, p[1] * H, 14, 0, Math.PI * 2);
        ctx.fill();
      });
      balls.forEach((b) => {
        if (b.dead) return;
        ctx.beginPath();
        ctx.arc(b.x, b.y, R, 0, Math.PI * 2);
        ctx.fillStyle = b.color;
        ctx.fill();
        if (b.cue) {
          ctx.strokeStyle = '#fff';
          ctx.stroke();
        }
      });
      if (dragging) {
        const c = cueBall();
        if (c) {
          ctx.strokeStyle = 'rgba(255,255,255,.7)';
          ctx.beginPath();
          ctx.moveTo(c.x, c.y);
          ctx.lineTo(c.x * 2 - aim.x, c.y * 2 - aim.y);
          ctx.stroke();
        }
      }
    }

    function loop() {
      if (!shell.alive() || ended) return;
      if (pauseCtrl && pauseCtrl.isPaused()) {
        raf = requestAnimationFrame(loop);
        return;
      }
      if (moving) {
        step();
        moving = balls.some((b) => !b.dead && Math.hypot(b.vx, b.vy) > 0.05);
        if (!moving) {
          if (!remaining()) finish(true);
          else if (liveOn) pushSettle();
          else {
            hint.textContent = 'Opponent’s turn…';
            shell.gs && shell.gs.schedule ? shell.gs.schedule(aiTurn, 700) : setTimeout(aiTurn, 700);
          }
        }
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
        onQuit: () => shell.close('dismissed'),
      });
    }

    if (liveOn) {
      const joined = joinLive(shell, chat, spec.id, (val) => {
        if (!val || ended) return;
        if (val.status === 'forfeit' || val.status === 'over') {
          const iWon = val.winner === liveRoles.me;
          if (val.status === 'over' && val.state && val.state.scores) {
            const sc = val.state.scores;
            youPocketed = liveRoles.me === liveRoles.playerA ? sc.a | 0 : sc.b | 0;
            oppPocketed = liveRoles.me === liveRoles.playerA ? sc.b | 0 : sc.a | 0;
          }
          applying = true;
          finish(iWon);
          applying = false;
          return;
        }
        const st = val.state || {};
        if (st.seq != null && st.seq <= seq && st.phase === 'settled' && val.turn !== liveRoles.me) return;
        if (st.balls && Array.isArray(st.balls)) {
          applying = true;
          if (st.seq != null) seq = st.seq;
          applySnapshot(st.balls, st.scores, val.turn);
          applying = false;
        }
      });
      if (joined) {
        liveHandle = joined.handle;
        liveRoles = joined.roles;
        myTurn = !!liveRoles.host;
        hint.textContent = myTurn ? 'Your shot.' : 'Waiting for opponent…';
        if (liveRoles.host) {
          liveHandle.push({
            status: 'playing',
            turn: liveRoles.me,
            state: { balls: snapshotBalls(), scores: { a: 0, b: 0 }, seq: 0, phase: 'deal' },
          });
        }
      }
    }

    raf = requestAnimationFrame(loop);
  }

  function openCarrom(ctx) {
    openCueGame({
      id: 'carrom',
      title: 'Carrom',
      subtitle: 'Pocket the coins',
      chat: ctx,
      accent: '#8D6E63',
      bg: '#1A0F00',
      felt: '#c4a574',
      glyph: '🪙',
      pockets: [
        [0.06, 0.06],
        [0.94, 0.06],
        [0.06, 0.94],
        [0.94, 0.94],
      ],
      makeBalls(W, H) {
        const list = [{ x: W / 2, y: H * 0.82, vx: 0, vy: 0, cue: true, color: '#fafafa' }];
        const cols = ['#fff8e1', '#111', '#fff8e1', '#111', '#fff8e1', '#111', '#d32f2f', '#111', '#fff8e1'];
        cols.forEach((color, i) => {
          const ang = (i / cols.length) * Math.PI * 2;
          list.push({
            x: W / 2 + Math.cos(ang) * 28,
            y: H * 0.42 + Math.sin(ang) * 28,
            vx: 0,
            vy: 0,
            color,
          });
        });
        return list;
      },
    });
  }

  function openPool(ctx) {
    openCueGame({
      id: 'pool',
      title: 'Pool',
      subtitle: 'Clear the table',
      chat: ctx,
      accent: '#1B3A2D',
      bg: '#0A1A10',
      felt: '#1b5e20',
      glyph: '🎱',
      pockets: [
        [0.06, 0.06],
        [0.5, 0.04],
        [0.94, 0.06],
        [0.06, 0.94],
        [0.5, 0.96],
        [0.94, 0.94],
      ],
      makeBalls(W, H) {
        const colors = ['#f44336', '#ffeb3b', '#2196f3', '#4caf50', '#ff9800', '#9c27b0', '#111'];
        const list = [{ x: W / 2, y: H * 0.84, vx: 0, vy: 0, cue: true, color: '#fafafa' }];
        colors.forEach((color, i) => {
          list.push({
            x: W / 2 - 22 + (i % 3) * 22,
            y: H * 0.28 + Math.floor(i / 3) * 22,
            vx: 0,
            vy: 0,
            color,
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
      { id: 'carrom', name: 'Carrom', desc: 'Aim the striker', icon: '🪙', genre: 'board', launch: openCarrom, order: 31 },
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
