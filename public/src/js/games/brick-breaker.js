// ===================== BRICK BREAKER (Breakout) =====================
function openBrickBreaker() {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute;inset:0;z-index:80;display:flex;flex-direction:column;';

  const COLS = 10;
  const BRICK_H = 14;
  const BRICK_GAP = 3;
  const PADDLE_H = 10;
  const BALL_R = 5;
  const MAX_PARTICLES = 20;
  const POWER_TYPES = ['wide', 'slow', 'multi', 'life'];
  const ACCENT = '#7C4DFF';

  /** Fixed layouts: 1=normal, 2=steel, P=power brick */
  const LEVEL_LAYOUTS = [
    ['1111111111', '1111111111', '1111111111'],
    ['1111111111', '1222222221', '1111111111', '1111111111'],
    ['1P111111P1', '1111111111', '1222222221', '1111111111'],
    ['2222222222', '1111111111', '111P111P11', '1111111111', '1111111111'],
    ['1212121212', '2121212121', '1212121212', '1111111111'],
    ['1111111111', '122P222P221', '1111111111', '1111111111', '1111111111'],
    ['2222222222', '2111111112', '211P11P112', '2111111112', '2222222222'],
    ['1P1P1P1P1P', '1111111111', '1222222221', '1111111111', '1111111111'],
    ['2222222222', '2111111112', '21P1111P12', '2111111112', '2222222222', '1111111111'],
    ['1212121212', '2121212121', '121P121P12', '2121212121', '1212121212'],
    ['2222222222', '2P111111P2', '2111111112', '2111111112', '2P111111P2', '2222222222'],
    ['1P1P1P1P1P', '1111111111', '1222222221', '12P22P2221', '1111111111', '1111111111'],
  ];

  let level = 0;
  let lives = 3;
  let score = 0;
  let bricks = [];
  let balls = [];
  let powerups = [];
  let particles = [];
  let paddleW = 72;
  let paddleX = 0;
  let basePaddleW = 72;
  let wideTimer = 0;
  let slowTimer = 0;
  let started = false;
  let gameOver = false;
  let won = false;
  let raf = null;
  let lastTime = 0;
  let cssW = 320;
  let cssH = 480;
  let resizeObs = null;
  let pauseCtrl = null;
  let unbindKeys = null;
  let pointerDown = false;
  let clearingLevel = false;

  let bestScore =
    (typeof getGamePB === 'function' ? getGamePB('brickbreaker') : null) ??
    (parseInt(localStorage.getItem('chaupaal_pb_brickbreaker') || '0', 10) || 0);

  const reduceMotion = typeof shouldReduceGameMotion === 'function' && shouldReduceGameMotion();

  function stopLoop() {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = null;
    }
    if (resizeObs) {
      try {
        resizeObs.disconnect();
      } catch (e) {}
      resizeObs = null;
    }
    if (unbindKeys) {
      unbindKeys();
      unbindKeys = null;
    }
    if (pauseCtrl) {
      pauseCtrl.destroy();
      pauseCtrl = null;
    }
  }

  const begin = typeof beginGameOverlaySession === 'function' ? beginGameOverlaySession : null;
  const gs = begin
    ? begin({
        type: 'brickbreaker',
        title: 'Brick Breaker',
        mode: 'solo',
        overlay,
        cleanup() {
          stopLoop();
        },
      })
    : null;
  if (begin && (!gs || !gs.alive())) return;
  if (!begin) {
    const device = document.querySelector('.device');
    if (!device) {
      if (typeof showToast === 'function') showToast('Game container not found');
      return;
    }
    device.appendChild(overlay);
  }
  if (typeof prepareGameOverlay === 'function') {
    prepareGameOverlay(overlay, { theme: 'dark', gameId: 'brickbreaker', accent: ACCENT });
  }

  const alive = () => (gs ? gs.alive() : true);
  const close = () => {
    stopLoop();
    if (gs) gs.close();
    else overlay.remove();
  };
  const buzz = (a) => {
    if (typeof gameFeedback === 'function') gameFeedback(a);
  };

  overlay.innerHTML = `
    ${gameChromeHtml({
      title: 'Brick Breaker',
      subtitle: 'Level 1',
      backId: 'bbBack',
      pauseId: 'bbPause',
      rightHtml: '<span class="game-chrome-metric" id="bbScore">0</span>',
    })}
    <div class="bb-stage" id="bbGame">
      <canvas id="bbCanvas" aria-label="Brick Breaker playfield"></canvas>
      <div class="rr-hud-chip" id="bbLives" aria-live="polite">♥ 3</div>
      <div id="bbOverlay" class="rr-start">
        <div class="rr-start-mark" aria-hidden="true"></div>
        <div class="rr-start-title">Brick Breaker</div>
        <div class="rr-start-sub">Break every brick</div>
        <div class="rr-start-best">Best ${bestScore} pts</div>
        <div class="rr-start-hint">Drag or arrows to move · catch power-ups</div>
        <button type="button" id="bbStart" class="game-tap-target rr-start-btn">Start</button>
      </div>
    </div>`;

  const canvas = document.getElementById('bbCanvas');
  if (!canvas) {
    if (typeof showToast === 'function') showToast('Could not start Brick Breaker');
    close();
    return;
  }
  const ctx = canvas.getContext('2d');

  function resize() {
    if (!alive() || !canvas) return;
    const size =
      typeof setupGameCanvas === 'function'
        ? setupGameCanvas(canvas)
        : (() => {
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            const w = canvas.clientWidth || 320;
            const h = canvas.clientHeight || 480;
            canvas.width = w * dpr;
            canvas.height = h * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            return { w, h, dpr };
          })();
    cssW = size.w;
    cssH = size.h;
    if (!paddleX) paddleX = cssW / 2;
  }
  resize();
  if (typeof ResizeObserver === 'function') {
    resizeObs = new ResizeObserver(resize);
    resizeObs.observe(canvas.parentElement || canvas);
  }

  function brickTop() {
    return 52;
  }

  function brickWidth() {
    return (cssW - BRICK_GAP * (COLS + 1)) / COLS;
  }

  function loadLevel(idx) {
    const layout = LEVEL_LAYOUTS[Math.min(idx, LEVEL_LAYOUTS.length - 1)];
    const bw = brickWidth();
    bricks = [];
    layout.forEach((row, ri) => {
      for (let ci = 0; ci < row.length && ci < COLS; ci++) {
        const ch = row[ci];
        if (ch === '1' || ch === '2' || ch === 'P') {
          bricks.push({
            x: BRICK_GAP + ci * (bw + BRICK_GAP),
            y: brickTop() + ri * (BRICK_H + BRICK_GAP),
            w: bw,
            h: BRICK_H,
            steel: ch === '2',
            power: ch === 'P',
            alive: true,
          });
        }
      }
    });
    const sub = document.querySelector('.game-chrome-subtitle');
    if (sub) sub.textContent = 'Level ' + (idx + 1);
  }

  function resetBall(onPaddle) {
    balls = [
      {
        x: paddleX,
        y: cssH - 36,
        vx: 3.2 * (Math.random() > 0.5 ? 1 : -1),
        vy: -4.2,
        stuck: !!onPaddle,
      },
    ];
  }

  function spawnParticle(x, y, color) {
    if (reduceMotion) return;
    if (particles.length >= MAX_PARTICLES) particles.shift();
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 4,
      vy: -1 - Math.random() * 3,
      life: 1,
      r: 2 + Math.random() * 2,
      color: color || ACCENT,
    });
  }

  function dropPowerup(x, y) {
    if (Math.random() > 0.35) return;
    const type = POWER_TYPES[Math.floor(Math.random() * POWER_TYPES.length)];
    powerups.push({ x, y, vy: 2.2, type, w: 18, h: 10 });
  }

  function applyPower(type) {
    buzz('valid');
    if (type === 'wide') {
      wideTimer = 10;
      paddleW = basePaddleW * 1.55;
    } else if (type === 'slow') {
      slowTimer = 8;
    } else if (type === 'multi') {
      const b = balls[0];
      if (b && !b.stuck) {
        balls.push({ x: b.x, y: b.y, vx: -b.vx * 0.9, vy: b.vy * 0.95, stuck: false });
        balls.push({ x: b.x, y: b.y, vx: b.vx * 1.1, vy: b.vy * 0.85, stuck: false });
      }
    } else if (type === 'life') {
      lives = Math.min(5, lives + 1);
      updateHud();
    }
  }

  function updateHud() {
    const scoreEl = document.getElementById('bbScore');
    if (scoreEl) scoreEl.textContent = String(score);
    const livesEl = document.getElementById('bbLives');
    if (livesEl) livesEl.textContent = '♥ ' + lives;
  }

  function levelClear() {
    if (clearingLevel || gameOver) return;
    clearingLevel = true;
    level += 1;
    if (level >= LEVEL_LAYOUTS.length) {
      winGame();
      return;
    }
    score += 100;
    loadLevel(level);
    resetBall(true);
    started = false;
    const ov = document.getElementById('bbOverlay');
    if (ov) {
      ov.className = 'rr-start';
      ov.style.display = 'flex';
      ov.innerHTML = `<div class="rr-start-title">Level ${level + 1}</div>
        <div class="rr-start-sub">${score} pts · ${lives} lives</div>
        <button type="button" id="bbStart" class="game-tap-target rr-start-btn">Continue</button>`;
      document.getElementById('bbStart')?.addEventListener('click', launchBall);
    }
    updateHud();
    buzz('complete');
    clearingLevel = false;
  }

  function loseLife() {
    lives -= 1;
    updateHud();
    buzz('lose');
    if (lives <= 0) {
      endGame(false);
      return;
    }
    resetBall(true);
    started = false;
    const ov = document.getElementById('bbOverlay');
    if (ov) {
      ov.className = 'rr-start rr-start--over';
      ov.style.display = 'flex';
      ov.innerHTML = `<div class="rr-start-title">Life lost</div>
        <div class="rr-start-sub">${lives} left · ${score} pts</div>
        <button type="button" id="bbStart" class="game-tap-target rr-start-btn">Serve again</button>`;
      document.getElementById('bbStart')?.addEventListener('click', launchBall);
    }
  }

  function launchBall() {
    const ov = document.getElementById('bbOverlay');
    if (ov) ov.style.display = 'none';
    started = true;
    lastTime = performance.now();
    balls.forEach((b) => {
      b.stuck = false;
    });
    if (!raf) raf = requestAnimationFrame(update);
    buzz('select');
  }

  function endGame(didWin) {
    if (gameOver) return;
    gameOver = true;
    won = !!didWin;
    if (raf) {
      cancelAnimationFrame(raf);
      raf = null;
    }
    if (typeof setGamePB === 'function') {
      bestScore = setGamePB('brickbreaker', score) ?? Math.max(bestScore, score);
    } else if (score > bestScore) {
      bestScore = score;
      localStorage.setItem('chaupaal_pb_brickbreaker', String(bestScore));
    }
    if (gs) gs.setOutcome(didWin ? 'won' : 'complete');
    if (typeof recordGameResult === 'function') {
      recordGameResult('brickbreaker', didWin, false, { score, scoreOnly: true });
    }
    buzz(didWin ? 'win' : 'lose');
    const vsBest =
      typeof formatVsBest === 'function' ? formatVsBest('brickbreaker', score) : `Best ${bestScore} pts`;
    const div = document.getElementById('bbOverlay');
    if (!div) return;
    div.className = 'rr-start rr-start--over';
    div.style.display = 'flex';
    const shareStats = {
      scoreLine: `${score} pts`,
      score,
      meta: vsBest,
      text: `I scored ${score} in Brick Breaker on Chaupaal!`,
    };
    const shareCard =
      typeof buildGameShareCard === 'function' ? buildGameShareCard('brickbreaker', shareStats) : '';
    div.innerHTML =
      typeof gameResultHtml === 'function'
        ? gameResultHtml({
            gameId: 'brickbreaker',
            glyph: '🧱',
            title: didWin ? 'All levels cleared!' : `${score} pts`,
            subtitle: didWin ? `${score} pts · ${vsBest}` : `Level ${level + 1} · ${vsBest}`,
            vsBest,
            shareCardHtml: shareCard,
            actions: [
              { label: 'Play again', primary: true, id: 'again' },
              { label: 'Share', primary: false, id: 'share' },
              { label: 'Challenge friend', primary: false, id: 'challenge' },
              { label: 'Post to story', primary: false, id: 'story' },
            ],
          })
        : `<div style="color:#fff;text-align:center;"><div>${score} pts</div><button type="button" id="bbRestart">Again</button></div>`;
    if (typeof wireGameResultActions === 'function') {
      wireGameResultActions(div, {
        again: () => {
          close();
          openBrickBreaker();
        },
        share: () => {
          if (typeof shareGameResult === 'function') shareGameResult('brickbreaker', shareStats);
        },
        challenge: async () => {
          if (typeof openFriendPickerSheet === 'function') {
            const f = await openFriendPickerSheet({
              title: 'Beat my Brick Breaker score',
              subtitle: `Challenge with ${score} pts`,
            });
            if (f && typeof shareGameResult === 'function') {
              shareGameResult('brickbreaker', {
                ...shareStats,
                text: `Hey ${f.name} — beat my ${score} pts on Brick Breaker!`,
              });
            }
          } else if (typeof shareGameResult === 'function') shareGameResult('brickbreaker', shareStats);
        },
        story: () => {
          if (typeof postGameScoreStory === 'function') {
            postGameScoreStory('brickbreaker', { score, scoreLine: `${score} pts`, meta: vsBest });
          }
        },
      });
    } else {
      document.getElementById('bbRestart')?.addEventListener('click', () => {
        close();
        openBrickBreaker();
      });
    }
  }

  function winGame() {
    endGame(true);
  }

  function movePaddle(dx) {
    paddleX = Math.max(paddleW / 2 + 4, Math.min(cssW - paddleW / 2 - 4, paddleX + dx));
    balls.forEach((b) => {
      if (b.stuck) b.x = paddleX;
    });
  }

  function update(ts) {
    if (!alive() || gameOver) return;
    if (pauseCtrl && pauseCtrl.isPaused()) {
      raf = requestAnimationFrame(update);
      return;
    }
    const dtMs = Math.min(ts - lastTime, 40);
    lastTime = ts;
    const dt = dtMs / 16.67;

    if (wideTimer > 0) {
      wideTimer -= dtMs / 1000;
      if (wideTimer <= 0) {
        wideTimer = 0;
        paddleW = basePaddleW;
      }
    }
    if (slowTimer > 0) slowTimer -= dtMs / 1000;

    const speedMul = slowTimer > 0 ? 0.72 : 1;
    const paddleY = cssH - 28;

    if (started) {
      balls.forEach((ball) => {
        if (ball.stuck) {
          ball.x = paddleX;
          return;
        }
        ball.x += ball.vx * dt * speedMul;
        ball.y += ball.vy * dt * speedMul;

        if (ball.x - BALL_R < 0) {
          ball.x = BALL_R;
          ball.vx = Math.abs(ball.vx);
        } else if (ball.x + BALL_R > cssW) {
          ball.x = cssW - BALL_R;
          ball.vx = -Math.abs(ball.vx);
        }
        if (ball.y - BALL_R < 40) {
          ball.y = 40 + BALL_R;
          ball.vy = Math.abs(ball.vy);
        }

        const py = paddleY;
        if (
          ball.vy > 0 &&
          ball.y + BALL_R >= py &&
          ball.y - BALL_R <= py + PADDLE_H &&
          ball.x >= paddleX - paddleW / 2 &&
          ball.x <= paddleX + paddleW / 2
        ) {
          const hit = (ball.x - paddleX) / (paddleW / 2);
          ball.vy = -Math.abs(ball.vy);
          ball.vx = hit * 4.5;
          ball.y = py - BALL_R;
          buzz('move');
        }

        if (ball.y - BALL_R > cssH) {
          ball.dead = true;
        }

        bricks.forEach((br) => {
          if (!br.alive) return;
          if (
            ball.x + BALL_R > br.x &&
            ball.x - BALL_R < br.x + br.w &&
            ball.y + BALL_R > br.y &&
            ball.y - BALL_R < br.y + br.h
          ) {
            if (br.steel) {
              ball.vy = -ball.vy;
              buzz('invalid');
              return;
            }
            br.alive = false;
            score += br.power ? 50 : 10;
            updateHud();
            ball.vy = -ball.vy;
            spawnParticle(br.x + br.w / 2, br.y + br.h / 2, br.power ? '#FFD166' : ACCENT);
            if (br.power) dropPowerup(br.x + br.w / 2, br.y + br.h);
            else if (Math.random() < 0.08) dropPowerup(br.x + br.w / 2, br.y + br.h);
            buzz('place');
          }
        });
      });

      balls = balls.filter((b) => !b.dead);
      if (!balls.length && started) {
        loseLife();
        if (!gameOver) {
          raf = requestAnimationFrame(update);
          draw();
          return;
        }
      }

      if (!bricks.some((b) => !b.steel && b.alive)) levelClear();

      powerups.forEach((p) => {
        p.y += p.vy * dt;
        if (
          p.y + p.h >= paddleY &&
          p.x >= paddleX - paddleW / 2 &&
          p.x <= paddleX + paddleW / 2
        ) {
          p.dead = true;
          applyPower(p.type);
        }
      });
      powerups = powerups.filter((p) => !p.dead && p.y < cssH);
    }

    particles.forEach((pt) => {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += 0.15 * dt;
      pt.life -= 0.04 * dt;
    });
    particles = particles.filter((pt) => pt.life > 0);

    draw();
    if (!gameOver && alive()) raf = requestAnimationFrame(update);
  }

  function draw() {
    ctx.clearRect(0, 0, cssW, cssH);
    const g = ctx.createLinearGradient(0, 0, 0, cssH);
    g.addColorStop(0, '#1a1030');
    g.addColorStop(1, '#0d0a18');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cssW, cssH);

    bricks.forEach((br) => {
      if (!br.alive) return;
      if (br.steel) {
        ctx.fillStyle = '#5c5c6e';
        ctx.strokeStyle = '#888';
      } else if (br.power) {
        ctx.fillStyle = '#FFD166';
        ctx.strokeStyle = '#fff';
      } else {
        ctx.fillStyle = ACCENT;
        ctx.strokeStyle = '#B39DFF';
      }
      ctx.fillRect(br.x, br.y, br.w, br.h);
      ctx.strokeRect(br.x + 0.5, br.y + 0.5, br.w - 1, br.h - 1);
    });

    ctx.fillStyle = '#fff';
    ctx.fillRect(paddleX - paddleW / 2, cssH - 28, paddleW, PADDLE_H);

    balls.forEach((ball) => {
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    });

    powerups.forEach((p) => {
      const colors = { wide: '#7C4DFF', slow: '#2A9D8F', multi: '#E63946', life: '#FFD166' };
      ctx.fillStyle = colors[p.type] || ACCENT;
      ctx.fillRect(p.x - 9, p.y, 18, 10);
      ctx.fillStyle = '#fff';
      ctx.font = '8px sans-serif';
      ctx.fillText(p.type[0].toUpperCase(), p.x - 3, p.y + 8);
    });

    particles.forEach((pt) => {
      ctx.globalAlpha = Math.max(0, pt.life);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
  }

  loadLevel(0);
  resetBall(true);
  paddleX = cssW / 2;
  updateHud();

  pauseCtrl =
    typeof createGamePauseController === 'function'
      ? createGamePauseController({
          host: overlay,
          pauseBtnId: 'bbPause',
          onPause() {
            /* loop keeps running but skips physics while paused */
          },
          onResume() {
            lastTime = performance.now();
          },
          onQuit: close,
        })
      : null;

  if (typeof bindGameKeyboardPaddle === 'function') {
    unbindKeys = bindGameKeyboardPaddle(null, (dir) => {
      if (started && !gameOver) movePaddle(dir * 8);
      else movePaddle(dir * 8);
    });
  }

  canvas.addEventListener('pointerdown', (e) => {
    pointerDown = true;
    canvas.setPointerCapture(e.pointerId);
    const r = canvas.getBoundingClientRect();
    paddleX = e.clientX - r.left;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointerDown) return;
    const r = canvas.getBoundingClientRect();
    paddleX = e.clientX - r.left;
    paddleX = Math.max(paddleW / 2 + 4, Math.min(cssW - paddleW / 2 - 4, paddleX));
    balls.forEach((b) => {
      if (b.stuck) b.x = paddleX;
    });
  });
  canvas.addEventListener('pointerup', () => {
    pointerDown = false;
  });

  document.getElementById('bbBack')?.addEventListener('click', () => close());
  document.getElementById('bbStart')?.addEventListener('click', launchBall);

  raf = requestAnimationFrame(update);
}

if (typeof registerGame === 'function') {
  registerGame({
    id: 'brickbreaker',
    name: 'Brick Breaker',
    desc: 'Classic Breakout · 12 levels',
    icon: '🧱',
    ratingKey: 'brickbreaker',
    gameType: 'solo',
    genre: 'arcade',
    solo: true,
    selfChat: true,
    order: 105,
    launch() {
      openBrickBreaker();
    },
  });
}
