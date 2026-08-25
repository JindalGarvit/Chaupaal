/**
 * Party & table classics: Tambola, Carrom, Pool, Rummy, Teen Patti, Bluff,
 * Satte pe Satta, Andar Bahar. Playable solo / vs-AI loops.
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

  function openShell(opts) {
    const o = opts || {};
    const overlay = document.createElement('div');
    overlay.className = 'game-overlay game-overlay--dark dangal-fullgame';
    overlay.style.cssText =
      'position:absolute;inset:0;z-index:80;display:flex;flex-direction:column;background:' +
      (o.bg || '#120818') +
      ';';
    const begin = typeof beginGameOverlaySession === 'function' ? beginGameOverlaySession : null;
    const gs = begin
      ? begin({
          type: o.id,
          title: o.title,
          mode: o.mode || 'solo',
          overlay,
          chat: o.chat,
          cleanup: o.cleanup,
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
      if (gs) gs.close(reason || 'dismissed');
      else if (typeof animateGameExit === 'function') animateGameExit(overlay, () => overlay.remove());
      else overlay.remove();
    };
    overlay.querySelector('#' + (o.backId || 'pcBack'))?.addEventListener('click', () => close('dismissed'));
    return { overlay, body, gs, close, alive: () => (gs ? gs.alive() : true), host: overlay };
  }

  function showDuelResult(shell, spec) {
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
    const rng = rngFn();
    const shell = openShell({
      id: 'tambola',
      title: 'Tambola',
      subtitle: practiceSub('Full house vs caller'),
      accent: '#E91E8C',
      bg: '#1A0010',
    });
    if (!shell) return;
    const ticket = tambolaTicket(rng);
    const bag = typeof shuffleArray === 'function' ? shuffleArray(Array.from({ length: 90 }, (_, i) => i + 1), rng) : [];
    let idx = 0;
    let last = '—';
    let claimed = false;
    const aiNeed = 15;
    let aiMarked = 0;

    function paint() {
      const markedCount = Object.keys(ticket.marked).length;
      shell.body.innerHTML = `
        <div class="pc-tambola">
          <div class="pc-call">${esc(String(last))}</div>
          <p class="pc-hint">Marked ${markedCount}/15 · caller ${idx}/90</p>
          <div class="pc-ticket">
            ${ticket.cells
              .map(
                (n) =>
                  `<span class="pc-tcell${ticket.marked[n] ? ' is-on' : ''}">${n}</span>`
              )
              .join('')}
          </div>
          <button type="button" class="cs-hit" data-house ${markedCount < 15 ? 'disabled' : ''}>Claim full house</button>
        </div>`;
      shell.body.querySelector('[data-house]')?.addEventListener('click', () => claim(true));
    }

    function claim(player) {
      if (claimed) return;
      claimed = true;
      showDuelResult(shell, {
        id: 'tambola',
        you: player ? 1 : 0,
        opp: player ? 0 : 1,
        glyph: '🎱',
        pbScore: player ? 1 : 0,
        subtitle: player ? 'Full house!' : 'House went to the other ticket.',
        shareText: 'Tambola on Chaupaal',
        onAgain: openTambola,
      });
    }

    function tick() {
      if (!shell.alive() || claimed) return;
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
      (shell.gs && shell.gs.schedule ? shell.gs.schedule(tick, 700) : setTimeout(tick, 700));
    }

    paint();
    tick();
  }

  /* ---------- Cue physics (carrom + pool) — Practice-honest; physics too heavy for RTDB ---------- */
  function openCueGame(spec) {
    let raf = 0;
    let pauseCtrl = null;
    const pauseId = 'pcCuePause_' + (spec.id || 'game');
    const chat = spec.chat || null;
    // Keep Practice honestly even if launched from a chat — cue physics sync is out of scope
    const cueSub = practiceSub(spec.subtitle || spec.title || 'vs AI');
    const shell = openShell({
      id: spec.id,
      title: spec.title,
      subtitle: cueSub,
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

    canvas.addEventListener('pointerdown', (e) => {
      if (moving || ended) return;
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
      if (!c) return;
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
      const live = balls.filter((b) => !b.cue && !b.dead);
      if (!live.length) return finish(true);
      const pick = live[Math.floor(Math.random() * live.length)];
      pick.dead = true;
      oppPocketed += 1;
      buzz('place');
      hint.textContent = 'Opponent pocketed one.';
      if (!remaining()) finish(youPocketed >= oppPocketed);
    }

    function finish(won) {
      if (ended) return;
      ended = true;
      cancelAnimationFrame(raf);
      showDuelResult(shell, {
        id: spec.id,
        you: won ? 1 : 0,
        opp: won ? 0 : 1,
        glyph: spec.glyph,
        pbScore: youPocketed,
        subtitle: 'Pocketed ' + youPocketed + ' · opponent ' + oppPocketed,
        shareText: spec.title + ' on Chaupaal',
        onAgain: () => openCueGame(spec),
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
          else {
            hint.textContent = 'Opponent’s turn…';
            (shell.gs && shell.gs.schedule ? shell.gs.schedule(aiTurn, 700) : setTimeout(aiTurn, 700));
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
    raf = requestAnimationFrame(loop);
  }

  function openCarrom(ctx) {
    openCueGame({
      id: 'carrom',
      title: 'Carrom',
      subtitle: 'Pocket the coins',
      chat: ctx && ctx.chat,
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
      chat: ctx && ctx.chat,
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
    const rng = rngFn();
    const deck = makeDeck(rng);
    const shell = openShell({
      id: 'rummy',
      title: 'Rummy',
      subtitle: practiceSub('Meld runs and sets'),
      accent: '#6A1B9A',
      bg: '#100018',
    });
    if (!shell) return;
    const you = deck.splice(0, 13);
    const ai = deck.splice(0, 13);
    const discard = [deck.pop()];
    let drawn = null;

    function paint(msg) {
      shell.body.innerHTML = `
        <div class="pc-rummy">
          <p class="pc-hint">${esc(msg || 'Draw, then discard. Declare when you have melds.')}</p>
          <div class="pc-row"><span>Discard</span>${cardFace(discard[discard.length - 1])}</div>
          <div class="pc-hand">${you.map(cardFace).join('')}</div>
          <div class="pc-actions">
            <button type="button" class="cs-hit" data-draw>Draw</button>
            <button type="button" class="cs-hit" data-take>Take discard</button>
            <button type="button" class="cs-hit" data-declare>Declare</button>
          </div>
        </div>`;
      shell.body.querySelectorAll('.pc-card').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.cid;
          const ix = you.findIndex((c) => c.id === id);
          if (ix < 0) return;
          if (you.length < 14 && !drawn) {
            buzz('invalid');
            return;
          }
          discard.push(you.splice(ix, 1)[0]);
          drawn = null;
          buzz('card');
          aiPlay();
          paint('Discarded. Opponent played.');
        });
      });
      shell.body.querySelector('[data-draw]')?.addEventListener('click', () => {
        if (drawn || !deck.length) return;
        drawn = deck.pop();
        you.push(drawn);
        buzz('card');
        paint('Drawn — tap a card to discard.');
      });
      shell.body.querySelector('[data-take]')?.addEventListener('click', () => {
        if (drawn || !discard.length) return;
        drawn = discard.pop();
        you.push(drawn);
        buzz('card');
        paint('Took discard — tap a card to discard.');
      });
      shell.body.querySelector('[data-declare]')?.addEventListener('click', () => {
        const ok = rummyOk(you);
        showDuelResult(shell, {
          id: 'rummy',
          you: ok ? 1 : 0,
          opp: ok ? 0 : 1,
          glyph: '🃏',
          title: ok ? 'Valid declare' : 'Invalid declare',
          subtitle: ok ? 'Melds accepted.' : 'Need runs and sets covering most of the hand.',
          shareText: 'Rummy on Chaupaal',
          onAgain: openRummy,
        });
      });
    }

    function aiPlay() {
      if (deck.length) ai.push(deck.pop());
      ai.sort((a, b) => rankVal(a.r) - rankVal(b.r));
      discard.push(ai.pop());
    }

    paint();
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
    const rng = rngFn();
    const deck = makeDeck(rng);
    const you = deck.splice(0, 3);
    const ai = deck.splice(0, 3);
    const shell = openShell({
      id: 'teenpatti',
      title: 'Teen Patti',
      subtitle: practiceSub('Best of three cards'),
      accent: '#FFD700',
      bg: '#0D0018',
    });
    if (!shell) return;

    function paint(hidden) {
      shell.body.innerHTML = `
        <div class="pc-tp">
          <p class="pc-hint">Opponent</p>
          <div class="pc-hand">${hidden ? '<span class="pc-card pc-back">?</span><span class="pc-card pc-back">?</span><span class="pc-card pc-back">?</span>' : ai.map(cardFace).join('')}</div>
          <p class="pc-hint">You</p>
          <div class="pc-hand">${you.map(cardFace).join('')}</div>
          <div class="pc-actions">
            <button type="button" class="cs-hit" data-show>Show</button>
            <button type="button" class="cs-hit" data-fold>Fold</button>
          </div>
        </div>`;
      shell.body.querySelector('[data-show]')?.addEventListener('click', () => {
        const ys = tpScore(you);
        const as = tpScore(ai);
        paint(false);
        showDuelResult(shell, {
          id: 'teenpatti',
          you: ys >= as ? 1 : 0,
          opp: as >= ys ? 1 : 0,
          glyph: '♠',
          title: ys > as ? 'You win the show' : ys === as ? 'Split' : 'Opponent wins',
          shareText: 'Teen Patti on Chaupaal',
          onAgain: openTeenPatti,
        });
      });
      shell.body.querySelector('[data-fold]')?.addEventListener('click', () => {
        showDuelResult(shell, {
          id: 'teenpatti',
          you: 0,
          opp: 1,
          glyph: '♠',
          title: 'Folded',
          shareText: 'Teen Patti on Chaupaal',
          onAgain: openTeenPatti,
        });
      });
    }
    paint(true);
  }

  /* ---------- Bluff ---------- */
  function openBluff() {
    const rng = rngFn();
    const deck = makeDeck(rng);
    const you = deck.splice(0, 8);
    const shell = openShell({
      id: 'bluff',
      title: 'Bluff',
      subtitle: practiceSub('Play face-down · get called'),
      accent: '#FF1744',
      bg: '#0A0E10',
    });
    if (!shell) return;
    let claimRank = 'A';
    let lives = 3;
    let aiLives = 3;

    function paint(msg) {
      shell.body.innerHTML = `
        <div class="pc-bluff">
          <p class="pc-hint">Lives ${lives} · opponent ${aiLives}</p>
          <p class="pc-hint">${esc(msg || 'Select 1–3 cards and a claimed rank.')}</p>
          <div class="pc-hand">${you.map(cardFace).join('')}</div>
          <label class="pc-hint">Claim
            <select data-rank>${RANKS.map((r) => `<option>${r}</option>`).join('')}</select>
          </label>
          <button type="button" class="cs-hit" data-play>Play selected</button>
        </div>`;
      shell.body.querySelector('[data-rank]').value = claimRank;
      const selected = new Set();
      shell.body.querySelectorAll('.pc-card').forEach((btn) => {
        btn.addEventListener('click', () => {
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
        claimRank = shell.body.querySelector('[data-rank]').value;
        if (!selected.size) {
          buzz('invalid');
          return;
        }
        const played = you.filter((c) => selected.has(c.id));
        played.forEach((c) => {
          const ix = you.findIndex((x) => x.id === c.id);
          if (ix >= 0) you.splice(ix, 1);
        });
        const honest = played.every((c) => c.r === claimRank);
        const called = rng() > 0.45;
        if (called) {
          if (honest) {
            aiLives -= 1;
            buzz('win', { noConfetti: true });
            after('Opponent called — you were honest.');
          } else {
            lives -= 1;
            buzz('lose', { noConfetti: true });
            after('Caught bluffing!');
          }
        } else {
          buzz('card');
          after(honest ? 'Passed.' : 'Bluff sailed through.');
        }
      });
    }

    function after(msg) {
      if (lives <= 0 || aiLives <= 0 || you.length === 0) {
        showDuelResult(shell, {
          id: 'bluff',
          you: lives > 0 && (aiLives <= 0 || you.length === 0) ? 1 : 0,
          opp: lives <= 0 ? 1 : 0,
          glyph: '🎭',
          subtitle: msg,
          shareText: 'Bluff on Chaupaal',
          onAgain: openBluff,
        });
        return;
      }
      paint(msg);
    }

    paint();
  }

  /* ---------- Satte pe Satta ---------- */
  function openSatte() {
    const rng = rngFn();
    const deck = makeDeck(rng);
    const you = deck.splice(0, 8);
    const ai = deck.splice(0, 8);
    const table = { '♠': { lo: 7, hi: 7 }, '♥': { lo: 7, hi: 7 }, '♦': { lo: 7, hi: 7 }, '♣': { lo: 7, hi: 7 } };
    const sevens = deck.filter((c) => c.r === '7');
    const shell = openShell({
      id: 'sattepe',
      title: 'Satte pe Satta',
      subtitle: practiceSub('Build off the sevens'),
      accent: '#FFD600',
      bg: '#000A1A',
    });
    if (!shell) return;

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

    function paint(msg) {
      shell.body.innerHTML = `
        <div class="pc-satte">
          <p class="pc-hint">${esc(msg || 'Play a card next to a seven chain.')}</p>
          <div class="pc-sevens">${SUITS.map((s) => `<span>${s} ${table[s].lo}–${table[s].hi}</span>`).join('')}</div>
          <div class="pc-hand">${you.map(cardFace).join('')}</div>
        </div>`;
      shell.body.querySelectorAll('.pc-card').forEach((btn) => {
        btn.addEventListener('click', () => {
          const c = you.find((x) => x.id === btn.dataset.cid);
          if (!c || !canPlay(c)) {
            buzz('invalid');
            return;
          }
          you.splice(you.indexOf(c), 1);
          apply(c);
          buzz('card');
          const playable = ai.filter(canPlay);
          if (playable.length) {
            const pick = playable[0];
            ai.splice(ai.indexOf(pick), 1);
            apply(pick);
          }
          if (!you.length || !ai.length) {
            showDuelResult(shell, {
              id: 'sattepe',
              you: you.length === 0 ? 1 : 0,
              opp: ai.length === 0 && you.length ? 1 : 0,
              glyph: '7️⃣',
              shareText: 'Satte pe Satta on Chaupaal',
              onAgain: openSatte,
            });
            return;
          }
          paint('Played ' + c.r + c.s);
        });
      });
    }
    sevens.forEach(apply);
    paint('Sevens are live. Empty your hand.');
  }

  /* ---------- Andar Bahar ---------- */
  function openAndarBahar() {
    const rng = rngFn();
    const deck = makeDeck(rng);
    const joker = deck.pop();
    const shell = openShell({
      id: 'andarbaahar',
      title: 'Andar Bahar',
      subtitle: practiceSub('Pick a side · match the joker'),
      accent: '#FF6B35',
      bg: '#001A00',
    });
    if (!shell) return;
    let side = null;
    const andar = [];
    const bahar = [];

    function paint(msg) {
      shell.body.innerHTML = `
        <div class="pc-ab">
          <p class="pc-hint">Joker ${esc(joker.r + joker.s)}</p>
          <p class="pc-hint">${esc(msg || 'Andar or Bahar?')}</p>
          <div class="pc-ab-cols">
            <div><h4>Andar (${andar.length})</h4>${andar.slice(-3).map(cardFace).join('')}</div>
            <div><h4>Bahar (${bahar.length})</h4>${bahar.slice(-3).map(cardFace).join('')}</div>
          </div>
          ${
            side
              ? ''
              : `<div class="pc-actions"><button type="button" class="cs-hit" data-a>Andar</button><button type="button" class="cs-hit" data-b>Bahar</button></div>`
          }
        </div>`;
      shell.body.querySelector('[data-a]')?.addEventListener('click', () => start('andar'));
      shell.body.querySelector('[data-b]')?.addEventListener('click', () => start('bahar'));
    }

    function start(pick) {
      side = pick;
      buzz('card');
      let n = 0;
      const deal = () => {
        if (!shell.alive() || !deck.length) return finish('bahar');
        const c = deck.pop();
        const lane = n % 2 === 0 ? 'andar' : 'bahar';
        (lane === 'andar' ? andar : bahar).push(c);
        n += 1;
        paint('Dealing…');
        if (c.r === joker.r) {
          finish(lane);
          return;
        }
        (shell.gs && shell.gs.schedule ? shell.gs.schedule(deal, 280) : setTimeout(deal, 280));
      };
      deal();
    }

    function finish(lane) {
      const won = lane === side;
      showDuelResult(shell, {
        id: 'andarbaahar',
        you: won ? 1 : 0,
        opp: won ? 0 : 1,
        glyph: '🃏',
        subtitle: 'Joker hit ' + lane,
        shareText: 'Andar Bahar on Chaupaal',
        onAgain: openAndarBahar,
      });
    }

    paint();
  }

  if (typeof registerGame === 'function') {
    const games = [
      { id: 'tambola', name: 'Tambola', desc: 'Ticket · full house', icon: '🎱', genre: 'party', launch: openTambola, order: 30 },
      { id: 'carrom', name: 'Carrom', desc: 'Aim the striker', icon: '🪙', genre: 'board', launch: (ctx) => openCarrom(ctx), order: 31 },
      { id: 'pool', name: 'Pool', desc: 'Clear the felt', icon: '🎱', genre: 'board', launch: (ctx) => openPool(ctx), order: 32 },
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
