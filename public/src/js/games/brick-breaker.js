// ===================== BRICK BREAKER (Breakout) — Prompt 1 arcade feel =====================
function openBrickBreaker() {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute;inset:0;z-index:80;display:flex;flex-direction:column;';

  const COLS = 10;
  const BRICK_H = 14;
  const BRICK_GAP = 3;
  const PADDLE_H = 10;
  const BALL_R = 5;
  const MAX_PARTICLES = 28;
  const MAX_BALLS = 3;
  const BASE_SPEED = 4.6;
  const MAX_SPEED = 8.2;
  const MIN_VX = 0.85;
  const POWER_TYPES = ['wide', 'slow', 'multi', 'life'];
  const ACCENT = '#7C4DFF';
  const SUBSTEPS = 3;

  /** Fixed layouts: 1=normal, 2=steel, P=power brick — content expansion in Prompt 2 */
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
  let floatTexts = [];
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
  let hitCount = 0;
  let combo = 0;
  let comboAt = 0;
  let shakeUntil = 0;
  let shakeMag = 0;
  let lifeResetUntil = 0;
  let keysHeld = { left: false, right: false };
  let serveAngleSign = 1;

  let bestScore =
    (typeof getGamePB === 'function' ? getGamePB('brickbreaker') : null) ??
    (parseInt(localStorage.getItem('chaupaal_pb_brickbreaker') || '0', 10) || 0);

  const reduceMotion = typeof shouldReduceGameMotion === 'function' && shouldReduceGameMotion();
  const maxParticles = reduceMotion ? 8 : MAX_PARTICLES;

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
    keysHeld.left = false;
    keysHeld.right = false;
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
        <div class="rr-start-hint">Drag paddle · arrows / A-D · tap Serve</div>
        <button type="button" id="bbStart" class="game-tap-target rr-start-btn">Serve</button>
      </div>
    </div>`;

  const canvas = document.getElementById('bbCanvas');
  if (!canvas) {
    if (typeof showToast === 'function') showToast('Could not start Brick Breaker');
    close();
    return;
  }
  const ctx = canvas.getContext('2d');
  canvas.style.touchAction = 'none';

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
    clampPaddle();
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

  function clampPaddle() {
    const half = paddleW / 2 + 4;
    paddleX = Math.max(half, Math.min(cssW - half, paddleX));
  }

  function targetSpeed() {
    const fromLevel = BASE_SPEED + level * 0.28;
    const fromHits = Math.min(1.6, hitCount * 0.012);
    return Math.min(MAX_SPEED, fromLevel + fromHits);
  }

  function normalizeBall(ball, speed) {
    const sp = Math.hypot(ball.vx, ball.vy) || 1;
    const s = speed != null ? speed : targetSpeed();
    ball.vx = (ball.vx / sp) * s;
    ball.vy = (ball.vy / sp) * s;
    if (Math.abs(ball.vx) < MIN_VX) {
      ball.vx = (ball.vx < 0 ? -1 : 1) * MIN_VX;
      const rest = Math.sqrt(Math.max(0.01, s * s - ball.vx * ball.vx));
      ball.vy = (ball.vy < 0 ? -1 : 1) * rest;
    }
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
    const sub = overlay.querySelector('.game-chrome-subtitle');
    if (sub) sub.textContent = 'Level ' + (idx + 1);
    hitCount = 0;
    combo = 0;
  }

  function resetBall(onPaddle) {
    serveAngleSign = Math.random() > 0.5 ? 1 : -1;
    const sp = Math.min(BASE_SPEED + level * 0.15, MAX_SPEED * 0.75);
    // Readable serve: ~58° loft, never pure vertical / extreme horizontal
    const angle = (-Math.PI / 2) + serveAngleSign * 0.55;
    balls = [
      {
        x: paddleX,
        y: cssH - 36,
        vx: Math.cos(angle) * sp,
        vy: Math.sin(angle) * sp,
        stuck: !!onPaddle,
        cornerHits: 0,
      },
    ];
  }

  function spawnParticleBurst(x, y, color, n) {
    if (reduceMotion && n > 2) n = 2;
    const count = Math.min(n || 6, maxParticles - particles.length);
    for (let i = 0; i < count; i++) {
      if (particles.length >= maxParticles) particles.shift();
      particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 5.5,
        vy: -1.2 - Math.random() * 3.5,
        life: 1,
        r: 1.5 + Math.random() * 2.5,
        color: color || ACCENT,
      });
    }
  }

  function addFloat(x, y, text) {
    if (reduceMotion) return;
    floatTexts.push({ x, y, text, life: 1, vy: -0.9 });
  }

  function triggerShake(mag, ms) {
    if (reduceMotion) return;
    shakeMag = Math.max(shakeMag, mag);
    shakeUntil = performance.now() + ms;
  }

  function dropPowerup(x, y) {
    if (Math.random() > 0.35) return;
    const type = POWER_TYPES[Math.floor(Math.random() * POWER_TYPES.length)];
    powerups.push({ x, y, vy: 2.2, type, w: 18, h: 10 });
  }

  function applyPower(type) {
    buzz(type === 'life' ? 'complete' : 'valid');
    spawnParticleBurst(paddleX, cssH - 28, '#FFD166', 8);
    if (type === 'wide') {
      wideTimer = 10;
      paddleW = basePaddleW * 1.55;
      clampPaddle();
    } else if (type === 'slow') {
      slowTimer = 8;
    } else if (type === 'multi') {
      const active = balls.filter((b) => !b.dead && !b.stuck);
      const room = MAX_BALLS - balls.filter((b) => !b.dead).length;
      if (room <= 0 || !active.length) return;
      const b = active[0];
      const sp = Math.hypot(b.vx, b.vy) || targetSpeed();
      const add = Math.min(room, 2);
      for (let i = 0; i < add; i++) {
        const sign = i === 0 ? -1 : 1;
        const nb = {
          x: b.x,
          y: b.y,
          vx: sign * Math.abs(b.vx || sp * 0.6) * (0.85 + i * 0.12),
          vy: b.vy * (0.9 + i * 0.05),
          stuck: false,
          cornerHits: 0,
        };
        normalizeBall(nb, sp);
        balls.push(nb);
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
      clearingLevel = false;
      winGame();
      return;
    }
    score += 100;
    powerups = [];
    particles = [];
    floatTexts = [];
    wideTimer = 0;
    slowTimer = 0;
    paddleW = basePaddleW;
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
      document.getElementById('bbStart')?.addEventListener('click', (e) => {
        e.stopPropagation();
        launchBall();
      });
    }
    updateHud();
    buzz('complete');
    // Allow next clear after interstitial is shown (guarded by started/bricks)
    clearingLevel = false;
  }

  function loseLife() {
    lives -= 1;
    updateHud();
    buzz('lose');
    powerups = [];
    wideTimer = 0;
    slowTimer = 0;
    paddleW = basePaddleW;
    clampPaddle();
    if (lives <= 0) {
      endGame(false);
      return;
    }
    resetBall(true);
    started = false;
    lifeResetUntil = performance.now() + 420;
    const ov = document.getElementById('bbOverlay');
    if (ov) {
      ov.className = 'rr-start rr-start--over';
      ov.style.display = 'flex';
      ov.innerHTML = `<div class="rr-start-title">Life lost</div>
        <div class="rr-start-sub">${lives} left · ${score} pts</div>
        <button type="button" id="bbStart" class="game-tap-target rr-start-btn" disabled style="opacity:.55">Serve again</button>`;
      const btn = document.getElementById('bbStart');
      const unlock = () => {
        if (!btn || !alive() || gameOver) return;
        btn.disabled = false;
        btn.style.opacity = '';
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          launchBall();
        });
      };
      setTimeout(unlock, 420);
    }
  }

  function launchBall() {
    if (gameOver || !alive()) return;
    if (performance.now() < lifeResetUntil) return;
    const ov = document.getElementById('bbOverlay');
    if (ov) ov.style.display = 'none';
    started = true;
    lastTime = performance.now();
    balls.forEach((b) => {
      b.stuck = false;
      normalizeBall(b, Math.min(BASE_SPEED + level * 0.15, MAX_SPEED * 0.75));
    });
    ensureLoop();
    buzz('select');
  }

  function ensureLoop() {
    if (!raf && alive() && !gameOver) {
      lastTime = performance.now();
      raf = requestAnimationFrame(update);
    }
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
    if (gs) gs.setOutcome(didWin ? 'won' : 'lost');
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
    const actions = [{ label: 'Play again', primary: true, id: 'again' }];
    if (typeof shareGameResult === 'function') actions.push({ label: 'Share', primary: false, id: 'share' });
    if (typeof openFriendPickerSheet === 'function') {
      actions.push({ label: 'Challenge friend', primary: false, id: 'challenge' });
    }
    if (typeof postGameScoreStory === 'function') {
      actions.push({ label: 'Post to story', primary: false, id: 'story' });
    }
    div.innerHTML =
      typeof gameResultHtml === 'function'
        ? gameResultHtml({
            gameId: 'brickbreaker',
            glyph: '🧱',
            title: didWin ? 'All levels cleared!' : `${score} pts`,
            subtitle: didWin ? `${score} pts · ${vsBest}` : `Level ${level + 1} · ${vsBest}`,
            vsBest,
            shareCardHtml: shareCard,
            actions,
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
          }
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

  function setPaddleFromClientX(clientX) {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    // Map CSS pixels → game space; paddle center under finger
    const x = ((clientX - r.left) / r.width) * cssW;
    paddleX = x;
    clampPaddle();
    balls.forEach((b) => {
      if (b.stuck) b.x = paddleX;
    });
  }

  function movePaddle(dx) {
    paddleX += dx;
    clampPaddle();
    balls.forEach((b) => {
      if (b.stuck) b.x = paddleX;
    });
  }

  function bounceOffPaddle(ball, paddleY) {
    const half = paddleW / 2;
    const hit = Math.max(-1, Math.min(1, (ball.x - paddleX) / half));
    // Classic Breakout: edge → loft, center → steep
    const angle = -Math.PI / 2 + hit * 1.05;
    const sp = Math.min(MAX_SPEED, Math.max(targetSpeed(), Math.hypot(ball.vx, ball.vy) * 1.02));
    ball.vx = Math.cos(angle) * sp;
    ball.vy = Math.sin(angle) * sp;
    if (Math.abs(ball.vx) < MIN_VX) ball.vx = (hit >= 0 ? 1 : -1) * MIN_VX;
    ball.y = paddleY - BALL_R - 0.5;
    ball.cornerHits = 0;
    normalizeBall(ball, sp);
    buzz('move');
  }

  function resolveBrickCollision(ball, br) {
    const prevX = ball.x - ball.vx * 0.15;
    const prevY = ball.y - ball.vy * 0.15;
    const overlapL = ball.x + BALL_R - br.x;
    const overlapR = br.x + br.w - (ball.x - BALL_R);
    const overlapT = ball.y + BALL_R - br.y;
    const overlapB = br.y + br.h - (ball.y - BALL_R);
    const minX = Math.min(overlapL, overlapR);
    const minY = Math.min(overlapT, overlapB);
    if (minX < minY) {
      if (overlapL < overlapR) {
        ball.x = br.x - BALL_R;
        ball.vx = -Math.abs(ball.vx);
      } else {
        ball.x = br.x + br.w + BALL_R;
        ball.vx = Math.abs(ball.vx);
      }
    } else {
      if (overlapT < overlapB || prevY < br.y) {
        ball.y = br.y - BALL_R;
        ball.vy = -Math.abs(ball.vy);
      } else {
        ball.y = br.y + br.h + BALL_R;
        ball.vy = Math.abs(ball.vy);
      }
    }
    // Escape near-zero bounce (corner vibration)
    if (Math.abs(ball.vx) < MIN_VX) {
      ball.cornerHits = (ball.cornerHits || 0) + 1;
      ball.vx = (ball.x < br.x + br.w / 2 ? -1 : 1) * MIN_VX * 1.2;
    } else {
      ball.cornerHits = 0;
    }
    if (ball.cornerHits >= 3) {
      ball.vx += (Math.random() > 0.5 ? 1 : -1) * 1.4;
      ball.vy = -Math.abs(ball.vy) - 0.5;
      ball.cornerHits = 0;
    }
    normalizeBall(ball);
  }

  function hitBrick(ball, br) {
    hitCount += 1;
    if (br.steel) {
      resolveBrickCollision(ball, br);
      buzz('invalid');
      triggerShake(2.5, 80);
      spawnParticleBurst(ball.x, ball.y, '#888', 3);
      return;
    }
    br.alive = false;
    const pts = br.power ? 50 : 10;
    score += pts;
    const now = performance.now();
    if (now - comboAt < 700) combo += 1;
    else combo = 1;
    comboAt = now;
    if (combo >= 2) {
      const bonus = Math.min(20, combo * 2);
      score += bonus;
      addFloat(br.x + br.w / 2, br.y, '+' + (pts + bonus));
    }
    updateHud();
    resolveBrickCollision(ball, br);
    spawnParticleBurst(br.x + br.w / 2, br.y + br.h / 2, br.power ? '#FFD166' : ACCENT, br.power ? 10 : 7);
    if (br.power) dropPowerup(br.x + br.w / 2, br.y + br.h);
    else if (Math.random() < 0.08) dropPowerup(br.x + br.w / 2, br.y + br.h);
    buzz('place');
    if (combo >= 4) triggerShake(1.5, 60);
  }

  function stepBall(ball, dt, paddleY, speedMul) {
    if (ball.stuck) {
      ball.x = paddleX;
      ball.y = cssH - 36;
      return;
    }
    const step = dt / SUBSTEPS;
    for (let s = 0; s < SUBSTEPS; s++) {
      ball.x += ball.vx * step * speedMul;
      ball.y += ball.vy * step * speedMul;

      if (ball.x - BALL_R < 0) {
        ball.x = BALL_R;
        ball.vx = Math.abs(ball.vx);
        if (Math.abs(ball.vx) < MIN_VX) ball.vx = MIN_VX;
      } else if (ball.x + BALL_R > cssW) {
        ball.x = cssW - BALL_R;
        ball.vx = -Math.abs(ball.vx);
        if (Math.abs(ball.vx) < MIN_VX) ball.vx = -MIN_VX;
      }
      if (ball.y - BALL_R < 40) {
        ball.y = 40 + BALL_R;
        ball.vy = Math.abs(ball.vy);
      }

      // Paddle
      if (
        ball.vy > 0 &&
        ball.y + BALL_R >= paddleY &&
        ball.y - BALL_R <= paddleY + PADDLE_H + 4 &&
        ball.x >= paddleX - paddleW / 2 - 2 &&
        ball.x <= paddleX + paddleW / 2 + 2
      ) {
        bounceOffPaddle(ball, paddleY);
      }

      if (ball.y - BALL_R > cssH + 8) {
        ball.dead = true;
        return;
      }

      for (let i = 0; i < bricks.length; i++) {
        const br = bricks[i];
        if (!br.alive) continue;
        if (
          ball.x + BALL_R > br.x &&
          ball.x - BALL_R < br.x + br.w &&
          ball.y + BALL_R > br.y &&
          ball.y - BALL_R < br.y + br.h
        ) {
          hitBrick(ball, br);
          break;
        }
      }
    }
    // Soft speed toward target (slow power handled outside)
    const sp = Math.hypot(ball.vx, ball.vy);
    const want = targetSpeed();
    if (sp > 0.1 && Math.abs(sp - want) > 0.15) {
      const blend = sp < want ? 0.04 : 0.02;
      normalizeBall(ball, sp + (want - sp) * blend);
    }
  }

  function update(ts) {
    if (!alive() || gameOver) {
      raf = null;
      return;
    }
    if (pauseCtrl && pauseCtrl.isPaused()) {
      raf = null;
      return;
    }
    const dtMs = Math.min(ts - lastTime, 36);
    lastTime = ts;
    const dt = dtMs / 16.67;

    // Smooth keyboard hold
    if (keysHeld.left || keysHeld.right) {
      const dir = (keysHeld.right ? 1 : 0) - (keysHeld.left ? 1 : 0);
      if (dir) movePaddle(dir * 7.2 * dt);
    }

    if (wideTimer > 0) {
      wideTimer -= dtMs / 1000;
      if (wideTimer <= 0) {
        wideTimer = 0;
        paddleW = basePaddleW;
        clampPaddle();
      }
    }
    if (slowTimer > 0) {
      slowTimer -= dtMs / 1000;
      if (slowTimer < 0) slowTimer = 0;
    }

    const speedMul = slowTimer > 0 ? 0.7 : 1;
    const paddleY = cssH - 28;

    if (started) {
      balls.forEach((ball) => stepBall(ball, dt, paddleY, speedMul));
      balls = balls.filter((b) => !b.dead);
      if (!balls.length && started) {
        loseLife();
        if (!gameOver) {
          draw();
          ensureLoop();
          return;
        }
        raf = null;
        return;
      }

      if (!clearingLevel && started && !bricks.some((b) => !b.steel && b.alive)) {
        levelClear();
      }

      powerups.forEach((p) => {
        p.y += p.vy * dt;
        if (
          p.y + p.h >= paddleY &&
          p.y <= paddleY + PADDLE_H + 6 &&
          p.x + 9 >= paddleX - paddleW / 2 &&
          p.x - 9 <= paddleX + paddleW / 2
        ) {
          p.dead = true;
          applyPower(p.type);
        }
      });
      powerups = powerups.filter((p) => !p.dead && p.y < cssH + 20);
    } else {
      balls.forEach((b) => {
        if (b.stuck) {
          b.x = paddleX;
          b.y = cssH - 36;
        }
      });
    }

    particles.forEach((pt) => {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vy += 0.15 * dt;
      pt.life -= 0.045 * dt;
    });
    particles = particles.filter((pt) => pt.life > 0);

    floatTexts.forEach((ft) => {
      ft.y += ft.vy * dt;
      ft.life -= 0.035 * dt;
    });
    floatTexts = floatTexts.filter((ft) => ft.life > 0);

    draw();
    if (!gameOver && alive() && !(pauseCtrl && pauseCtrl.isPaused())) {
      raf = requestAnimationFrame(update);
    } else {
      raf = null;
    }
  }

  function draw() {
    let ox = 0;
    let oy = 0;
    if (performance.now() < shakeUntil && shakeMag > 0) {
      ox = (Math.random() - 0.5) * shakeMag * 2;
      oy = (Math.random() - 0.5) * shakeMag * 2;
    }
    ctx.save();
    ctx.translate(ox, oy);
    ctx.clearRect(-4, -4, cssW + 8, cssH + 8);
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

    // Paddle
    ctx.fillStyle = '#fff';
    ctx.fillRect(paddleX - paddleW / 2, cssH - 28, paddleW, PADDLE_H);
    if (wideTimer > 0) {
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(paddleX - paddleW / 2 - 1, cssH - 29, paddleW + 2, PADDLE_H + 2);
    }

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

    floatTexts.forEach((ft) => {
      ctx.globalAlpha = Math.max(0, ft.life);
      ctx.fillStyle = '#FFD166';
      ctx.font = 'bold 14px Space Grotesk,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    });

    if (!started && !gameOver && balls[0] && balls[0].stuck) {
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = '12px Space Grotesk,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Tap Serve or canvas to launch', cssW / 2, cssH - 48);
      ctx.textAlign = 'left';
    }

    ctx.restore();
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
            if (raf) {
              cancelAnimationFrame(raf);
              raf = null;
            }
          },
          onResume() {
            lastTime = performance.now();
            ensureLoop();
          },
          onQuit: close,
        })
      : null;

  // Smooth keyboard: hold tracking + bindGameKeyboardPaddle fallback nudge
  const keyDown = (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      keysHeld.left = true;
      e.preventDefault();
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      keysHeld.right = true;
      e.preventDefault();
    } else if ((e.key === ' ' || e.key === 'Enter') && !started && !gameOver) {
      e.preventDefault();
      launchBall();
    }
  };
  const keyUp = (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keysHeld.left = false;
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keysHeld.right = false;
  };
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  unbindKeys = () => {
    window.removeEventListener('keydown', keyDown);
    window.removeEventListener('keyup', keyUp);
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (e.target !== canvas) return;
    e.preventDefault();
    pointerDown = true;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {}
    setPaddleFromClientX(e.clientX);
    // Tap to serve when ball is stuck
    if (!started && !gameOver && balls[0] && balls[0].stuck && performance.now() >= lifeResetUntil) {
      launchBall();
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointerDown) return;
    e.preventDefault();
    setPaddleFromClientX(e.clientX);
  });
  canvas.addEventListener('pointerup', (e) => {
    pointerDown = false;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch (err) {}
  });
  canvas.addEventListener('pointercancel', () => {
    pointerDown = false;
  });

  // Chrome taps must not steal paddle drag
  overlay.querySelector('.game-chrome')?.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });

  document.getElementById('bbBack')?.addEventListener('click', () => {
    if (gameOver) {
      close();
      return;
    }
    const inProgress = started || level > 0 || score > 0;
    if (!inProgress) {
      close();
      return;
    }
    const ask =
      typeof confirmLeaveGame === 'function'
        ? confirmLeaveGame({ title: 'Leave Brick Breaker?', body: 'Progress on this run will be lost.' })
        : Promise.resolve(window.confirm('Leave Brick Breaker? Progress on this run will be lost.'));
    Promise.resolve(ask).then((ok) => {
      if (ok) close();
    });
  });
  document.getElementById('bbStart')?.addEventListener('click', (e) => {
    e.stopPropagation();
    launchBall();
  });

  ensureLoop();
}

if (typeof registerGame === 'function') {
  registerGame({
    id: 'brickbreaker',
    name: 'Brick Breaker',
    desc: 'Classic Breakout · 12 levels · Solo',
    icon: '🧱',
    ratingKey: 'brickbreaker',
    gameType: 'solo',
    genre: 'arcade',
    solo: true,
    selfChat: true,
    order: 105,
    meta: { graduated: true, phase: 1 },
    launch() {
      try {
        openBrickBreaker();
      } catch (err) {
        console.error('[brickbreaker] launch failed', err);
        try {
          if (typeof showToast === 'function') showToast('Could not open Brick Breaker');
        } catch (e2) {}
      }
    },
  });
}
