// ===================== BRICK BREAKER — Campaign + Score Attack (Prompt 2) =====================
/**
 * Layout alphabet:
 *   0 / . / space = empty
 *   1 = normal brick (1 hit)
 *   2 = steel (2 hits)
 *   P = power brick (drops power-up)
 *   X = explosive (clears 1-tile neighbours on break)
 *   M = moving (row drifts L/R; pause freezes)
 *   U = unbreakable wall (layout tooling)
 *   G = gold (fragile, high score)
 *
 * Persist: chaupaal_bb_campaign_level = next campaign index (0-based)
 *          chaupaal_bb_campaign_best_level = deepest levels cleared count
 *          chaupaal_bb_last_mode = 'campaign'|'endless' (Maidan Play again)
 * Lives: never auto-refill between campaign levels (run tension).
 * PB: brickbreaker (campaign) · brickbreaker_endless (Score Attack)
 */
function openBrickBreakerModeSheet() {
  const device = document.querySelector('.device');
  if (!device) {
    openBrickBreaker({ mode: 'campaign' });
    return;
  }
  const campaignBest =
    (typeof getGamePB === 'function' ? getGamePB('brickbreaker') : null) ??
    (parseInt(localStorage.getItem('chaupaal_pb_brickbreaker') || '0', 10) || 0);
  const endlessBest =
    (typeof getGamePB === 'function' ? getGamePB('brickbreaker_endless') : null) ??
    (parseInt(localStorage.getItem('chaupaal_pb_brickbreaker_endless') || '0', 10) || 0);
  let continueAt = 0;
  let bestClear = 0;
  try {
    continueAt = Math.max(0, parseInt(localStorage.getItem('chaupaal_bb_campaign_level') || '0', 10) || 0);
    bestClear = Math.max(0, parseInt(localStorage.getItem('chaupaal_bb_campaign_best_level') || '0', 10) || 0);
  } catch (e) {}
  const sheet = document.createElement('div');
  sheet.style.cssText =
    'position:absolute;bottom:0;left:0;right:0;background:var(--white,#fff);border-radius:24px 24px 0 0;padding:20px;z-index:100;max-height:82vh;overflow:auto;';
  sheet.innerHTML = `
    <div style="font-family:Space Grotesk,sans-serif;font-weight:800;font-size:18px;margin-bottom:4px;">Brick Breaker</div>
    <div style="font-size:13px;color:var(--muted,#666);margin-bottom:14px;">Solo arcade — Campaign or endless Score Attack. No Live · no stakes.</div>
    <button type="button" data-bb-mode="campaign" class="game-tap-target" style="width:100%;text-align:left;padding:14px;margin-bottom:8px;border-radius:14px;border:2px solid var(--line,#ddd);background:#0d0a18;color:#fff;cursor:pointer;">
      <div style="font-weight:800;font-size:15px;">Campaign</div>
      <div style="font-size:12px;opacity:.75;margin-top:2px;">Clear handcrafted levels · 3 lives · Best ${campaignBest} pts${bestClear ? ` · Cleared Lv ${bestClear}` : ''}</div>
    </button>
    ${
      continueAt > 0
        ? `<button type="button" data-bb-mode="continue" class="game-tap-target" style="width:100%;text-align:left;padding:14px;margin-bottom:8px;border-radius:14px;border:2px solid var(--line,#ddd);background:var(--cream,#f5f0e8);color:var(--ink,#1a1a2e);cursor:pointer;">
      <div style="font-weight:800;font-size:15px;">Continue campaign</div>
      <div style="font-size:12px;opacity:.75;margin-top:2px;">Resume at Level ${continueAt + 1}</div>
    </button>`
        : ''
    }
    <button type="button" data-bb-mode="endless" class="game-tap-target" style="width:100%;text-align:left;padding:14px;margin-bottom:8px;border-radius:14px;border:2px solid var(--line,#ddd);background:var(--cream,#f5f0e8);color:var(--ink,#1a1a2e);cursor:pointer;">
      <div style="font-weight:800;font-size:15px;">Score Attack</div>
      <div style="font-size:12px;opacity:.75;margin-top:2px;">How far can you go · 3 lives · Best ${endlessBest} pts</div>
    </button>
    <button type="button" id="bbModeCancel" style="width:100%;padding:12px;background:none;border:none;color:var(--muted,#666);font-size:14px;cursor:pointer;">Cancel</button>`;
  device.appendChild(sheet);
  sheet.querySelectorAll('[data-bb-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const m = btn.dataset.bbMode;
      sheet.remove();
      if (m === 'endless') openBrickBreaker({ mode: 'endless' });
      else if (m === 'continue') openBrickBreaker({ mode: 'campaign', startLevel: continueAt });
      else openBrickBreaker({ mode: 'campaign', startLevel: 0 });
    });
  });
  sheet.querySelector('#bbModeCancel')?.addEventListener('click', () => sheet.remove());
}

function openBrickBreaker(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const playMode = o.mode === 'endless' ? 'endless' : 'campaign';
  const startLevel = Math.max(0, Number(o.startLevel) || 0);
  try {
    localStorage.setItem('chaupaal_bb_last_mode', playMode);
  } catch (e) {}

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
  const POWER_TYPES = ['wide', 'slow', 'multi', 'life', 'magnet'];
  const ACCENT = '#7C4DFF';
  const SUBSTEPS = 3;
  const PB_ID = playMode === 'endless' ? 'brickbreaker_endless' : 'brickbreaker';
  const SAVE_KEY = 'chaupaal_bb_campaign_level';

  /**
   * 20 authored campaign levels — early teach → mid steel/power/gaps → late density.
   * Alphabet: 0 empty · 1 normal · 2 steel(2hp) · P power · X bomb · M moving · U wall · G gold
   */
  const LEVEL_LAYOUTS = [
    ['1111111111', '1111111111'],
    ['1111111111', '1111111111', '1111111111'],
    ['1110011111', '1110011111', '1111111111'],
    ['1111111111', '1222222221', '1111111111'],
    ['1P111111P1', '1111111111', '1111111111'],
    ['1212121212', '2121212121', '1111111111'],
    ['1111G11111', '1111111111', '1111111111', '1111111111'],
    ['1111111111', '1111X11111', '1111111111'],
    ['U11111111U', 'U11111111U', '1111111111', '1111111111'],
    ['MMMMMMMMMM', '1111111111', '1111111111'],
    ['2222222222', '2P111111P2', '2111111112', '1111111111'],
    ['0011111100', '0111111110', '1111G11111', '0111111110', '0011111100'],
    ['1111111111', '1X111111X1', '1222222221', '1111111111'],
    ['1212121212', '2P12121P12', '1212G21212', '1111111111'],
    ['2222222222', 'M0M0M0M0M0', '1111111111', '111P111P11'],
    ['1111111111', '1G1G1G1G1G', '2222222222', '1111111111'],
    ['UU111111UU', 'U21111112U', 'U21P11P12U', 'U21111112U', '1111111111'],
    ['1111111111', '11X11X11X1', '1X111111X1', '1222222221', '1111111111'],
    ['MMMMMMMMMM', '2P111111P2', '1212121212', '1111G11111', '1111111111'],
    ['2222222222', '2X1P11P1X2', '2M111111M2', '2G111111G2', '2111111112', '1111111111'],
  ];

  let level = playMode === 'campaign' ? Math.min(startLevel, LEVEL_LAYOUTS.length - 1) : 0;
  let wave = 0;
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
  let magnetCharges = 0;
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
  let movePhase = 0;

  let bestScore =
    (typeof getGamePB === 'function' ? getGamePB(PB_ID) : null) ??
    (parseInt(
      localStorage.getItem(
        PB_ID === 'brickbreaker_endless' ? 'chaupaal_pb_brickbreaker_endless' : 'chaupaal_pb_brickbreaker'
      ) || '0',
      10
    ) || 0);

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

  function modeSubtitle() {
    const solo =
      typeof DangalLive !== 'undefined' && DangalLive.modeChromeLabel
        ? DangalLive.modeChromeLabel(false, 'Solo', { solo: true })
        : 'Practice · Solo';
    if (playMode === 'endless') return solo + ' · Score Attack · Wave ' + (wave + 1);
    return solo + ' · Campaign · Level ' + (level + 1) + '/' + LEVEL_LAYOUTS.length;
  }

  overlay.innerHTML = `
    ${gameChromeHtml({
      title: 'Brick Breaker',
      subtitle: modeSubtitle(),
      backId: 'bbBack',
      pauseId: 'bbPause',
      rightHtml: '<span class="game-chrome-metric" id="bbScore">0</span>',
    })}
    <div class="bb-stage" id="bbGame">
      <canvas id="bbCanvas" aria-label="Brick Breaker playfield"></canvas>
      <div class="rr-hud-chip" id="bbLives" aria-live="polite">♥ 3</div>
      <div class="rr-hud-chip bb-hud-depth" id="bbDepth">${
        playMode === 'endless' ? 'Score Attack · Wave 1' : 'Campaign · Lv 1'
      }</div>
      <div id="bbOverlay" class="rr-start">
        <div class="rr-start-mark" aria-hidden="true"></div>
        <div class="rr-start-title">${playMode === 'endless' ? 'Score Attack' : 'Campaign'}</div>
        <div class="rr-start-sub">${
          playMode === 'endless' ? 'Endless waves · 3 lives' : 'Level ' + (level + 1) + ' of ' + LEVEL_LAYOUTS.length
        }</div>
        <div class="rr-start-best">Best ${bestScore} pts</div>
        <div class="rr-start-hint">Drag · arrows · Serve · Magnet sticks once</div>
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
    const bw = brickWidth();
    bricks.forEach((br) => {
      if (br.ci == null) return;
      br.w = bw;
      br.baseX = BRICK_GAP + br.ci * (bw + BRICK_GAP);
      if (!br.moving) br.x = br.baseX;
    });
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
  function depthIndex() {
    return playMode === 'endless' ? wave : level;
  }
  function targetSpeed() {
    const d = depthIndex();
    return Math.min(MAX_SPEED, BASE_SPEED + d * 0.22 + Math.min(1.6, hitCount * 0.012));
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

  function parseBrickChar(ch, ci, ri, bw) {
    if (!ch || ch === '0' || ch === '.' || ch === ' ') return null;
    const base = {
      x: BRICK_GAP + ci * (bw + BRICK_GAP),
      y: brickTop() + ri * (BRICK_H + BRICK_GAP),
      w: bw,
      h: BRICK_H,
      ci,
      ri,
      baseX: BRICK_GAP + ci * (bw + BRICK_GAP),
      alive: true,
      hp: 1,
      steel: false,
      power: false,
      explosive: false,
      moving: false,
      unbreakable: false,
      gold: false,
      kind: '1',
    };
    if (ch === '1') base.kind = '1';
    else if (ch === '2') {
      base.kind = '2';
      base.steel = true;
      base.hp = 2;
    } else if (ch === 'P') {
      base.kind = 'P';
      base.power = true;
    } else if (ch === 'X') {
      base.kind = 'X';
      base.explosive = true;
    } else if (ch === 'M') {
      base.kind = 'M';
      base.moving = true;
    } else if (ch === 'U') {
      base.kind = 'U';
      base.unbreakable = true;
      base.hp = 999;
    } else if (ch === 'G') {
      base.kind = 'G';
      base.gold = true;
    } else return null;
    return base;
  }

  function applyLayout(layout) {
    const bw = brickWidth();
    bricks = [];
    movePhase = 0;
    layout.forEach((row, ri) => {
      const cells = String(row).padEnd(COLS, '0').slice(0, COLS);
      for (let ci = 0; ci < COLS; ci++) {
        const br = parseBrickChar(cells[ci], ci, ri, bw);
        if (br) bricks.push(br);
      }
    });
    hitCount = 0;
    combo = 0;
    syncChrome();
  }

  function loadLevel(idx) {
    applyLayout(LEVEL_LAYOUTS[Math.min(idx, LEVEL_LAYOUTS.length - 1)]);
  }

  function buildEndlessWave(w) {
    const rows = Math.min(7, 3 + Math.floor(w / 2));
    const steelChance = Math.min(0.45, 0.08 + w * 0.03);
    const specialChance = Math.min(0.22, 0.04 + w * 0.015);
    const layout = [];
    for (let ri = 0; ri < rows; ri++) {
      let row = '';
      for (let ci = 0; ci < COLS; ci++) {
        if (w % 3 === 2 && (ci === 4 || ci === 5) && ri < rows - 1) {
          row += '0';
          continue;
        }
        const r = Math.random();
        if (r < 0.06 && w > 1) row += '0';
        else if (r < 0.06 + specialChance * 0.25) row += 'G';
        else if (r < 0.06 + specialChance * 0.45) row += 'X';
        else if (r < 0.06 + specialChance * 0.6) row += 'P';
        else if (r < 0.06 + specialChance * 0.75 && ri === 0) row += 'M';
        else if (r < 0.06 + specialChance + steelChance) row += '2';
        else if (w > 4 && r < 0.06 + specialChance + steelChance + 0.04 && (ci === 0 || ci === COLS - 1))
          row += 'U';
        else row += '1';
      }
      layout.push(row);
    }
    return layout;
  }

  function loadEndlessWave() {
    applyLayout(buildEndlessWave(wave));
  }

  function syncChrome() {
    const sub = overlay.querySelector('.game-chrome-subtitle');
    if (sub) sub.textContent = modeSubtitle();
    const depth = document.getElementById('bbDepth');
    if (depth) {
      depth.textContent =
        playMode === 'endless' ? 'Score Attack · Wave ' + (wave + 1) : 'Campaign · Lv ' + (level + 1);
    }
  }

  function saveCampaignProgress(clearedIndex) {
    if (playMode !== 'campaign') return;
    try {
      localStorage.setItem(SAVE_KEY, String(Math.min(LEVEL_LAYOUTS.length - 1, clearedIndex + 1)));
    } catch (e) {}
  }

  function resetBall(onPaddle) {
    serveAngleSign = Math.random() > 0.5 ? 1 : -1;
    const sp = Math.min(BASE_SPEED + depthIndex() * 0.12, MAX_SPEED * 0.75);
    const angle = -Math.PI / 2 + serveAngleSign * 0.55;
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

  function dropPowerup(x, y, force) {
    if (!force && Math.random() > 0.42) return;
    const type = POWER_TYPES[Math.floor(Math.random() * POWER_TYPES.length)];
    powerups.push({ x, y, vy: 2.2, type, w: 22, h: 12 });
  }

  function applyPower(type) {
    buzz(type === 'life' || type === 'magnet' ? 'complete' : 'valid');
    spawnParticleBurst(paddleX, cssH - 28, type === 'magnet' ? '#7C4DFF' : '#FFD166', 8);
    if (type === 'wide') {
      wideTimer = 10;
      paddleW = basePaddleW * 1.55;
      clampPaddle();
    } else if (type === 'slow') slowTimer = 8;
    else if (type === 'magnet') {
      magnetCharges = Math.min(2, magnetCharges + 1);
      addFloat(paddleX, cssH - 40, 'MAGNET');
    } else if (type === 'multi') {
      const active = balls.filter((b) => !b.dead && !b.stuck);
      const room = MAX_BALLS - balls.filter((b) => !b.dead).length;
      if (room <= 0 || !active.length) return;
      const b = active[0];
      const sp = Math.hypot(b.vx, b.vy) || targetSpeed();
      for (let i = 0; i < Math.min(room, 2); i++) {
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
    if (livesEl) livesEl.textContent = '♥ ' + lives + (magnetCharges > 0 ? ' · M' + magnetCharges : '');
    syncChrome();
  }

  function clearableLeft() {
    return bricks.some((b) => b.alive && !b.unbreakable);
  }

  function showInterstitial(title, sub, onServe) {
    const ov = document.getElementById('bbOverlay');
    if (!ov) return;
    ov.className = 'rr-start';
    ov.style.display = 'flex';
    ov.innerHTML = `<div class="rr-start-title">${title}</div>
      <div class="rr-start-sub">${sub}</div>
      <button type="button" id="bbStart" class="game-tap-target rr-start-btn">Continue</button>`;
    document.getElementById('bbStart')?.addEventListener('click', (e) => {
      e.stopPropagation();
      onServe();
    });
  }

  function levelClear() {
    if (clearingLevel || gameOver) return;
    clearingLevel = true;

    if (playMode === 'endless') {
      score += 80 + wave * 15;
      wave += 1;
      powerups = [];
      particles = [];
      floatTexts = [];
      wideTimer = 0;
      slowTimer = 0;
      paddleW = basePaddleW;
      loadEndlessWave();
      resetBall(true);
      started = false;
      showInterstitial('Wave ' + (wave + 1), score + ' pts · ' + lives + ' lives', launchBall);
      updateHud();
      buzz('complete');
      clearingLevel = false;
      return;
    }

    saveCampaignProgress(level);
    level += 1;
    if (level >= LEVEL_LAYOUTS.length) {
      clearingLevel = false;
      try {
        localStorage.setItem(SAVE_KEY, '0');
      } catch (e) {}
      winGame();
      return;
    }
    score += 100 + Math.floor(level * 5);
    powerups = [];
    particles = [];
    floatTexts = [];
    wideTimer = 0;
    slowTimer = 0;
    paddleW = basePaddleW;
    loadLevel(level);
    resetBall(true);
    started = false;
    showInterstitial(
      'Level ' + (level + 1),
      score + ' pts · ' + lives + ' lives · no life refill',
      launchBall
    );
    updateHud();
    buzz('complete');
    clearingLevel = false;
  }

  function loseLife() {
    lives -= 1;
    magnetCharges = 0;
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
      setTimeout(() => {
        if (!btn || !alive() || gameOver) return;
        btn.disabled = false;
        btn.style.opacity = '';
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          launchBall();
        });
      }, 420);
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
      normalizeBall(b, Math.min(BASE_SPEED + depthIndex() * 0.12, MAX_SPEED * 0.75));
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

    // Persist last mode for Maidan "Play again"
    try {
      localStorage.setItem('chaupaal_bb_last_mode', playMode);
    } catch (e) {}

    // Campaign: track deepest level cleared (1-based count of finished levels)
    if (playMode === 'campaign') {
      try {
        const clearedCount = didWin ? LEVEL_LAYOUTS.length : level;
        const prevCleared = Math.max(0, parseInt(localStorage.getItem('chaupaal_bb_campaign_best_level') || '0', 10) || 0);
        if (clearedCount > prevCleared) {
          localStorage.setItem('chaupaal_bb_campaign_best_level', String(clearedCount));
        }
      } catch (e) {}
    }

    // Format vs best BEFORE writing PB so "New best!" can show
    const prevPb = typeof getGamePB === 'function' ? getGamePB(PB_ID) : bestScore || null;
    const vsBestRaw =
      typeof formatVsBest === 'function' ? formatVsBest(PB_ID, score) : `Best ${bestScore} pts`;
    const isNewBest =
      score > 0 && (prevPb == null || (Number.isFinite(prevPb) ? score > prevPb : score > (bestScore || 0)));

    if (typeof setGamePB === 'function') {
      bestScore = setGamePB(PB_ID, score) ?? Math.max(bestScore, score);
    } else if (score > bestScore) {
      bestScore = score;
      try {
        localStorage.setItem(
          PB_ID === 'brickbreaker_endless' ? 'chaupaal_pb_brickbreaker_endless' : 'chaupaal_pb_brickbreaker',
          String(bestScore)
        );
      } catch (e) {}
    }

    if (gs) gs.setOutcome(didWin ? 'won' : 'lost');
    if (typeof recordGameResult === 'function') {
      recordGameResult('brickbreaker', didWin, false, {
        score,
        scoreOnly: true,
        mode: playMode,
        level: playMode === 'campaign' ? level + 1 : undefined,
        wave: playMode === 'endless' ? wave + 1 : undefined,
      });
    } else if (typeof recordDangalSession === 'function') {
      recordDangalSession('brickbreaker', {
        score,
        scoreOnly: true,
        won: didWin ? true : undefined,
        mode: playMode,
        level: playMode === 'campaign' ? level + 1 : undefined,
        wave: playMode === 'endless' ? wave + 1 : undefined,
      });
    }

    buzz(didWin ? 'win' : 'lose');
    if (isNewBest && typeof showToast === 'function') {
      showToast('New best · ' + score + ' pts');
    }

    const vsBest = isNewBest
      ? `New best · ${score} pts` + (prevPb != null ? ` (was ${prevPb})` : '')
      : vsBestRaw;
    const div = document.getElementById('bbOverlay');
    if (!div) return;
    div.className = 'rr-start rr-start--over';
    div.style.display = 'flex';

    let bestLevelBit = '';
    if (playMode === 'campaign') {
      try {
        const bl = parseInt(localStorage.getItem('chaupaal_bb_campaign_best_level') || '0', 10) || 0;
        if (bl > 0) bestLevelBit = ` · Best clear Lv ${bl}`;
      } catch (e) {}
    }

    const depthLine =
      playMode === 'endless'
        ? `Wave ${wave + 1} · Score Attack`
        : didWin
          ? 'Campaign cleared'
          : `Level ${level + 1}/${LEVEL_LAYOUTS.length} · Campaign`;
    const modeLabel = playMode === 'endless' ? 'Score Attack' : 'Campaign';
    const shareStats = {
      scoreLine: `${score} pts`,
      score,
      meta: `${depthLine} · ${vsBest}${bestLevelBit}`,
      text: `I scored ${score} pts in Brick Breaker (${modeLabel}) on Chaupaal · ${depthLine} · not a wager`,
    };
    const shareCard =
      typeof buildGameShareCard === 'function' ? buildGameShareCard('brickbreaker', shareStats) : '';
    const title = didWin
      ? 'All levels cleared!'
      : playMode === 'endless'
        ? `${score} pts · Wave ${wave + 1}`
        : `${score} pts`;
    const actions = [
      { label: 'Play again', primary: true, id: 'again' },
      { label: 'Modes', primary: false, id: 'modes' },
    ];
    if (typeof shareGameResult === 'function') actions.push({ label: 'Share', primary: false, id: 'share' });
    if (typeof openFriendPickerSheet === 'function')
      actions.push({ label: 'Challenge friend', primary: false, id: 'challenge' });
    if (typeof postGameScoreStory === 'function')
      actions.push({ label: 'Post to story', primary: false, id: 'story' });

    const newBestBanner = isNewBest
      ? `<div class="bb-new-best" role="status">New personal best</div>`
      : '';

    div.innerHTML =
      typeof gameResultHtml === 'function'
        ? newBestBanner +
          gameResultHtml({
            gameId: 'brickbreaker',
            glyph: '🧱',
            title,
            subtitle: `${depthLine} · ${vsBest}${bestLevelBit}`,
            vsBest,
            shareCardHtml: shareCard,
            actions,
          })
        : `${newBestBanner}<div style="color:#fff;text-align:center;"><div>${score} pts</div><button type="button" id="bbRestart">Again</button></div>`;

    // Beat to read PB before actions feel urgent
    const actionsRoot = div;
    const wire = () => {
      if (gs && !alive()) return;
      if (typeof wireGameResultActions === 'function') {
        wireGameResultActions(actionsRoot, {
          again: () => {
            close();
            openBrickBreaker({ mode: playMode, startLevel: 0 });
          },
          modes: () => {
            close();
            openBrickBreakerModeSheet();
          },
          share: () => {
            if (typeof shareGameResult === 'function') shareGameResult('brickbreaker', shareStats);
          },
          challenge: async () => {
            if (typeof openFriendPickerSheet !== 'function') return;
            const f = await openFriendPickerSheet({
              title: 'Beat my Brick Breaker score',
              subtitle: `${score} pts · ${modeLabel} (solo — not Live)`,
            });
            if (f && typeof shareGameResult === 'function') {
              shareGameResult('brickbreaker', {
                ...shareStats,
                text: `Hey ${f.name} — beat my ${score} pts on Brick Breaker (${modeLabel})!`,
              });
            }
          },
          story: () => {
            if (typeof postGameScoreStory === 'function') {
              postGameScoreStory('brickbreaker', {
                score,
                scoreLine: `${score} pts`,
                meta: `${depthLine} · ${vsBest}`,
              });
            }
          },
        });
      } else {
        document.getElementById('bbRestart')?.addEventListener('click', () => {
          close();
          openBrickBreaker({ mode: playMode });
        });
      }
    };
    // Soft lock: disable buttons briefly so the result can be read
    div.querySelectorAll('[data-result-action],button').forEach((btn) => {
      btn.style.pointerEvents = 'none';
      btn.style.opacity = '0.55';
    });
    setTimeout(() => {
      div.querySelectorAll('[data-result-action],button').forEach((btn) => {
        btn.style.pointerEvents = '';
        btn.style.opacity = '';
      });
      wire();
    }, 650);
  }

  function winGame() {
    endGame(true);
  }

  function setPaddleFromClientX(clientX) {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    paddleX = ((clientX - r.left) / r.width) * cssW;
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
    if (magnetCharges > 0) {
      magnetCharges -= 1;
      ball.stuck = true;
      ball.x = paddleX;
      ball.y = cssH - 36;
      started = false;
      updateHud();
      buzz('complete');
      addFloat(paddleX, paddleY - 12, 'STUCK');
      showInterstitial('Magnet catch', 'Aim · then Serve', launchBall);
      return;
    }
    const half = paddleW / 2;
    const hit = Math.max(-1, Math.min(1, (ball.x - paddleX) / half));
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
    } else if (overlapT < overlapB || prevY < br.y) {
      ball.y = br.y - BALL_R;
      ball.vy = -Math.abs(ball.vy);
    } else {
      ball.y = br.y + br.h + BALL_R;
      ball.vy = Math.abs(ball.vy);
    }
    if (Math.abs(ball.vx) < MIN_VX) {
      ball.cornerHits = (ball.cornerHits || 0) + 1;
      ball.vx = (ball.x < br.x + br.w / 2 ? -1 : 1) * MIN_VX * 1.2;
    } else ball.cornerHits = 0;
    if (ball.cornerHits >= 3) {
      ball.vx += (Math.random() > 0.5 ? 1 : -1) * 1.4;
      ball.vy = -Math.abs(ball.vy) - 0.5;
      ball.cornerHits = 0;
    }
    normalizeBall(ball);
  }

  function destroyBrick(br, fromExplosion) {
    if (!br.alive || br.unbreakable) return;
    br.alive = false;
    let pts = 10;
    if (br.gold) pts = 75;
    else if (br.power) pts = 50;
    else if (br.explosive) pts = 30;
    else if (br.steel) pts = 20;
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
    const color = br.gold ? '#FFD700' : br.explosive ? '#FF6B35' : br.power ? '#FFD166' : ACCENT;
    spawnParticleBurst(br.x + br.w / 2, br.y + br.h / 2, color, br.explosive ? 12 : 7);
    if (br.power) dropPowerup(br.x + br.w / 2, br.y + br.h, true);
    else if (!fromExplosion && Math.random() < 0.07) dropPowerup(br.x + br.w / 2, br.y + br.h);
    if (br.explosive && !fromExplosion) {
      triggerShake(4, 120);
      bricks.forEach((n) => {
        if (!n.alive || n === br || n.unbreakable) return;
        if (Math.abs(n.ci - br.ci) <= 1 && Math.abs(n.ri - br.ri) <= 1) destroyBrick(n, true);
      });
    }
    if (combo >= 4) triggerShake(1.5, 60);
  }

  function hitBrick(ball, br) {
    hitCount += 1;
    if (br.unbreakable) {
      resolveBrickCollision(ball, br);
      buzz('invalid');
      return;
    }
    if (br.steel && br.hp > 1) {
      br.hp -= 1;
      resolveBrickCollision(ball, br);
      buzz('invalid');
      triggerShake(2.5, 80);
      spawnParticleBurst(ball.x, ball.y, '#888', 3);
      addFloat(br.x + br.w / 2, br.y, '!');
      return;
    }
    resolveBrickCollision(ball, br);
    destroyBrick(br, false);
    updateHud();
    buzz(br.gold ? 'complete' : 'place');
  }

  function stepMovingBricks(dt) {
    movePhase += dt * 0.035;
    const amp = Math.min(brickWidth() * 0.85, 18);
    bricks.forEach((br) => {
      if (!br.alive || !br.moving) return;
      br.x = br.baseX + Math.sin(movePhase + br.ci * 0.45) * amp;
    });
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
        ball.vx = Math.abs(ball.vx) || MIN_VX;
      } else if (ball.x + BALL_R > cssW) {
        ball.x = cssW - BALL_R;
        ball.vx = -Math.abs(ball.vx) || -MIN_VX;
      }
      if (ball.y - BALL_R < 40) {
        ball.y = 40 + BALL_R;
        ball.vy = Math.abs(ball.vy);
      }
      if (
        ball.vy > 0 &&
        ball.y + BALL_R >= paddleY &&
        ball.y - BALL_R <= paddleY + PADDLE_H + 4 &&
        ball.x >= paddleX - paddleW / 2 - 2 &&
        ball.x <= paddleX + paddleW / 2 + 2
      ) {
        bounceOffPaddle(ball, paddleY);
        if (ball.stuck) return;
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
    const sp = Math.hypot(ball.vx, ball.vy);
    const want = targetSpeed();
    if (sp > 0.1 && Math.abs(sp - want) > 0.15) {
      normalizeBall(ball, sp + (want - sp) * (sp < want ? 0.04 : 0.02));
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
      stepMovingBricks(dt);
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
      if (!clearingLevel && started && !clearableLeft()) levelClear();
      powerups.forEach((p) => {
        p.y += p.vy * dt;
        if (
          p.y + p.h >= paddleY &&
          p.y <= paddleY + PADDLE_H + 8 &&
          p.x + 11 >= paddleX - paddleW / 2 &&
          p.x - 11 <= paddleX + paddleW / 2
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
    if (!gameOver && alive() && !(pauseCtrl && pauseCtrl.isPaused())) raf = requestAnimationFrame(update);
    else raf = null;
  }

  function brickStyle(br) {
    if (br.unbreakable) return { fill: '#2a2a35', stroke: '#555' };
    if (br.gold) return { fill: '#E6B422', stroke: '#FFF3A0' };
    if (br.explosive) return { fill: '#E85D04', stroke: '#FFBA08' };
    if (br.moving) return { fill: '#4CC9F0', stroke: '#90E0EF' };
    if (br.steel)
      return br.hp > 1 ? { fill: '#6c757d', stroke: '#adb5bd' } : { fill: '#495057', stroke: '#868e96' };
    if (br.power) return { fill: '#FFD166', stroke: '#fff' };
    return { fill: ACCENT, stroke: '#B39DFF' };
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
      const st = brickStyle(br);
      ctx.fillStyle = st.fill;
      ctx.strokeStyle = st.stroke;
      ctx.fillRect(br.x, br.y, br.w, br.h);
      ctx.strokeRect(br.x + 0.5, br.y + 0.5, br.w - 1, br.h - 1);
      if (br.explosive) {
        ctx.fillStyle = '#fff';
        ctx.font = '9px sans-serif';
        ctx.fillText('✱', br.x + br.w / 2 - 4, br.y + 11);
      } else if (br.gold) {
        ctx.fillStyle = '#fff';
        ctx.font = '9px sans-serif';
        ctx.fillText('◆', br.x + br.w / 2 - 4, br.y + 11);
      }
    });

    ctx.fillStyle = '#fff';
    ctx.fillRect(paddleX - paddleW / 2, cssH - 28, paddleW, PADDLE_H);
    if (wideTimer > 0 || magnetCharges > 0) {
      ctx.strokeStyle = magnetCharges > 0 ? '#4CC9F0' : ACCENT;
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
      const colors = { wide: '#7C4DFF', slow: '#2A9D8F', multi: '#E63946', life: '#FFD166', magnet: '#4CC9F0' };
      ctx.fillStyle = colors[p.type] || ACCENT;
      ctx.fillRect(p.x - 11, p.y, 22, 12);
      ctx.fillStyle = '#fff';
      ctx.font = '8px sans-serif';
      ctx.fillText(p.type === 'magnet' ? 'M' : p.type[0].toUpperCase(), p.x - 3, p.y + 9);
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

  if (playMode === 'endless') {
    wave = 0;
    loadEndlessWave();
  } else loadLevel(level);
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
    if (!started && !gameOver && balls[0] && balls[0].stuck && performance.now() >= lifeResetUntil) launchBall();
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
  overlay.querySelector('.game-chrome')?.addEventListener('pointerdown', (e) => e.stopPropagation());

  document.getElementById('bbBack')?.addEventListener('click', () => {
    const leaveToSheet = () => {
      close();
      openBrickBreakerModeSheet();
    };
    if (gameOver) {
      leaveToSheet();
      return;
    }
    const inProgress = started || score > 0 || (playMode === 'campaign' ? level > startLevel : wave > 0);
    if (!inProgress) {
      leaveToSheet();
      return;
    }
    const ask =
      typeof confirmLeaveGame === 'function'
        ? confirmLeaveGame({ title: 'Leave Brick Breaker?', body: 'Progress on this run will be lost.' })
        : Promise.resolve(window.confirm('Leave Brick Breaker? Progress on this run will be lost.'));
    Promise.resolve(ask).then((ok) => {
      if (ok) leaveToSheet();
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
    desc: 'Campaign · Score Attack · Solo',
    icon: '🧱',
    ratingKey: 'brickbreaker',
    gameType: 'solo',
    genre: 'arcade',
    solo: true,
    selfChat: true,
    order: 105,
    meta: { graduated: true, phase: 3, complete: true, live: false },
    launch(ctx) {
      try {
        // Maidan / resume may pass mode; GOTD / Manch → sheet
        const mode = ctx && (ctx.bbMode || ctx.mode);
        if (mode === 'endless' || mode === 'campaign') {
          openBrickBreaker({ mode: mode === 'endless' ? 'endless' : 'campaign', startLevel: ctx.startLevel });
          return;
        }
        if (ctx && (ctx.source === 'maidan' || ctx.resume)) {
          let last = 'campaign';
          try {
            last = localStorage.getItem('chaupaal_bb_last_mode') || 'campaign';
          } catch (e) {}
          openBrickBreaker({ mode: last === 'endless' ? 'endless' : 'campaign' });
          return;
        }
        openBrickBreakerModeSheet();
      } catch (err) {
        console.error('[brickbreaker] launch failed', err);
        try {
          if (typeof showToast === 'function') showToast('Could not open Brick Breaker');
        } catch (e2) {}
      }
    },
  });
}

window.openBrickBreaker = openBrickBreaker;
window.openBrickBreakerModeSheet = openBrickBreakerModeSheet;
