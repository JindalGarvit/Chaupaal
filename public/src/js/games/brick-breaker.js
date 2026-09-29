// ===================== BRICK BREAKER — Campaign · Endless · Daily (Dangal P14) =====================
/**
 * Physics, levels and power-ups: brick-engine.js (fixed 120 Hz steps, swept collisions — no
 * tunnelling; paddle hit position sets the angle; 15° minimum from horizontal). This file draws the
 * engine state on a canvas, feeds it input and handles modes, progress and results.
 *
 * Modes: Campaign (60 levels, 3 lives each, up to 3 stars) · Endless (seeded waves, lives carry
 * over) · Daily (one level a day, the same for everyone; first try counts).
 * Controls: drag anywhere (relative, with a sensitivity setting) · mouse follows · ←/→ or A/D ·
 * tap / Space to serve.
 * Progress + leaderboards + share: solo-hub.js. Legacy keys chaupaal_bb_campaign_level /
 * chaupaal_bb_campaign_best_level / chaupaal_bb_last_mode are still written for older readers.
 */
function openBrickBreakerModeSheet() {
  const Hub = window.SoloHub;
  const BE = window.BrickEngine;
  if (!Hub || !BE) return openBrickBreaker({ mode: 'campaign' });
  const p = Hub.load('brickbreaker');
  const next = Math.min(BE.CAMPAIGN_COUNT, p.level);
  const ds = Hub.dailyState('brickbreaker');
  const st = Hub.streak('brickbreaker');
  const endlessBest = p.pb.brickbreaker_endless || 0;
  const body = `<div class="solo-modes">
    <button type="button" class="solo-mode solo-mode--primary" data-m="campaign"><b>${p.best >= BE.CAMPAIGN_COUNT ? 'Replay level ' + next : 'Play level ' + next}</b><span>Campaign · ${p.best} of ${BE.CAMPAIGN_COUNT} cleared</span></button>
    <button type="button" class="solo-mode" data-m="daily"><b>Daily Challenge</b><span>${ds.done ? 'Played today ✓' : ds.started ? 'Practice' : 'New today'}${st ? ' · 🔥 ' + st : ''}</span></button>
    <button type="button" class="solo-mode" data-m="endless"><b>Endless</b><span>Wave after wave${endlessBest ? ' · Best ' + endlessBest.toLocaleString() : ''}</span></button>
    <div class="solo-hub-row"><button type="button" class="solo-link" data-m="levels">All levels</button><button type="button" class="solo-link" data-m="rules">How to play</button><button type="button" class="solo-link" data-m="settings">Settings</button></div>
  </div>`;
  const x = Hub.sheet({ title: 'Brick Breaker', bodyHtml: body });
  if (!x || !x.el) return openBrickBreaker({ mode: 'campaign', level: next });
  x.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-m]');
    if (!b) return;
    const m = b.dataset.m;
    if (m === 'rules') return window.DangalRules && DangalRules.openSheet('brickbreaker', { variants: { mode: 'campaign' } });
    if (m === 'settings') return Hub.openSettings('brickbreaker', ['sound', 'haptics', 'reducedMotion', 'sensitivity']);
    x.close();
    if (m === 'campaign') openBrickBreaker({ mode: 'campaign', level: next });
    else if (m === 'endless') openBrickBreaker({ mode: 'endless' });
    else if (m === 'daily') openBrickBreakerDaily();
    else if (m === 'levels') openBrickBreakerLevels();
  });
}

function openBrickBreakerLevels() {
  const Hub = window.SoloHub;
  const BE = window.BrickEngine;
  const p = Hub.load('brickbreaker');
  let html = '';
  for (let n = 1; n <= BE.CAMPAIGN_COUNT; n++) {
    const locked = n > p.level;
    const stars = p.stars[n] || 0;
    html += `<button type="button" class="solo-level${locked ? ' is-locked' : ''}${stars ? ' is-done' : ''}" data-n="${n}" ${locked ? 'disabled' : ''} aria-label="Level ${n}${locked ? ' locked' : ''}"><b>${locked ? '·' : n}</b><small>${stars ? '★'.repeat(stars) : ''}</small></button>`;
  }
  const x = Hub.sheet({ title: 'Levels', bodyHtml: `<div class="solo-levels">${html}</div>` });
  if (!x || !x.el) return;
  x.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-n]');
    if (!b || b.disabled) return;
    x.close();
    openBrickBreaker({ mode: 'campaign', level: Number(b.dataset.n) });
  });
}

function openBrickBreakerDaily(challenge) {
  const Hub = window.SoloHub;
  Hub.openDaily('brickbreaker', {
    title: 'Brick Breaker Daily',
    detail: 'One level · 3 lives · highest score wins',
    onPlay: async (fresh) => {
      if (!fresh) return openBrickBreaker({ mode: 'daily', practice: true, challenge });
      const r = await Hub.startDaily('brickbreaker');
      if (!r.scored && typeof showToast === 'function') showToast('You’ve already played today’s Daily on another device — this one is practice');
      openBrickBreaker({ mode: 'daily', practice: !r.scored, challenge });
    },
  });
}

function openBrickBreaker(opts) {
  const BE = window.BrickEngine;
  const Hub = window.SoloHub;
  const Core = window.SoloCore;
  const toast = (m) => typeof showToast === 'function' && showToast(m);
  if (!BE || !Hub || !Core) return toast('Brick Breaker is still loading — try again');
  const GAME = 'brickbreaker';
  const o = opts && typeof opts === 'object' ? opts : {};
  const mode = o.mode === 'endless' ? 'endless' : o.mode === 'daily' ? 'daily' : 'campaign';
  const prog0 = Hub.load(GAME);
  let levelNo = mode === 'campaign' ? Math.max(1, Math.min(BE.CAMPAIGN_COUNT, Number(o.level) || prog0.level || 1)) : 0;
  const challenge = o.challenge || null;
  const dayNo = mode === 'daily' ? Hub.today() : null;
  const practice = !!o.practice;
  try {
    localStorage.setItem('chaupaal_bb_last_mode', mode === 'endless' ? 'endless' : 'campaign');
  } catch (e) {}

  let settings = Hub.settings(GAME);
  const POWER_STYLE = {
    wide: ['#7C4DFF', 'W', 'Wide paddle'],
    multi: ['#E63946', '×3', 'Multi-ball'],
    slow: ['#2A9D8F', 'S', 'Slow ball'],
    laser: ['#F72585', 'L', 'Laser'],
    sticky: ['#4CC9F0', '◎', 'Sticky paddle'],
    extra: ['#FFD166', '+1', 'Extra ball'],
  };
  const ACCENT = '#7C4DFF';

  let s = null;
  let segs = [];
  let wave = 0;
  let segStart = 0;
  let livesAtStart = 3;
  let running = false;
  let ended = false;
  let raf = null;
  let lastTs = 0;
  let acc = 0;
  let activeMs = 0;
  let wantLaunch = false;
  let targetX = BE.W / 2;
  let keys = { left: false, right: false };
  let drag = null;
  let particles = [];
  let floats = [];
  let shakeUntil = 0;
  let cssW = 320;
  let cssH = 480;
  let scale = 1;
  let ox = 0;
  let oy = 0;
  let pauseCtrl = null;
  let resizeObs = null;

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute;inset:0;z-index:80;display:flex;flex-direction:column;';
  const begin = typeof beginGameOverlaySession === 'function' ? beginGameOverlaySession : null;
  const gs = begin ? begin({ type: 'brickbreaker', title: 'Brick Breaker', mode: 'solo', overlay, cleanup: teardown }) : null;
  if (begin && (!gs || !gs.alive())) return;
  if (!begin) {
    const device = document.querySelector('.device');
    if (!device) return toast('Game container not found');
    device.appendChild(overlay);
  }
  if (typeof prepareGameOverlay === 'function') prepareGameOverlay(overlay, { theme: 'dark', gameId: 'brickbreaker', accent: ACCENT });
  const alive = () => (gs ? gs.alive() : overlay.isConnected);
  const isPaused = () => !!(pauseCtrl && pauseCtrl.isPaused && pauseCtrl.isPaused());
  const reduced = () => Hub.reducedMotion(GAME);

  function teardown() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    if (resizeObs) {
      try {
        resizeObs.disconnect();
      } catch (e) {}
      resizeObs = null;
    }
    window.removeEventListener('keydown', keyDown);
    window.removeEventListener('keyup', keyUp);
    document.removeEventListener('visibilitychange', onVisibility);
    if (pauseCtrl) {
      pauseCtrl.destroy();
      pauseCtrl = null;
    }
  }
  const close = () => {
    teardown();
    if (gs) gs.close();
    else overlay.remove();
  };

  function title() {
    if (mode === 'endless') return 'Endless · Wave ' + (wave + 1);
    if (mode === 'daily') return practice ? 'Daily · practice' : 'Daily Challenge';
    return 'Level ' + levelNo + ' of ' + BE.CAMPAIGN_COUNT;
  }

  overlay.innerHTML = `
    ${gameChromeHtml({ title: 'Brick Breaker', subtitle: title(), backId: 'bbBack', pauseId: 'bbPause', rightHtml: '<span class="game-chrome-metric" id="bbScore">0</span>' })}
    <div class="bb-stage" id="bbGame">
      <canvas id="bbCanvas" aria-label="Brick Breaker playfield"></canvas>
      <div class="rr-hud-chip" id="bbLives" aria-live="polite"></div>
      <div class="rr-hud-chip bb-hud-depth" id="bbDepth"></div>
      <div class="bb-fx-chips" id="bbFx"></div>
      <div id="bbOverlay" class="rr-start bb-result" hidden></div>
    </div>`;
  const $ = (id) => overlay.querySelector('#' + id);
  const canvas = $('bbCanvas');
  const g2 = canvas.getContext('2d');
  canvas.style.touchAction = 'none';

  function resize() {
    if (!alive()) return;
    const size =
      typeof setupGameCanvas === 'function'
        ? setupGameCanvas(canvas)
        : (() => {
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            const w = canvas.clientWidth || 320;
            const h = canvas.clientHeight || 480;
            canvas.width = w * dpr;
            canvas.height = h * dpr;
            g2.setTransform(dpr, 0, 0, dpr, 0, 0);
            return { w, h };
          })();
    cssW = size.w;
    cssH = size.h;
    scale = Math.min(cssW / BE.W, cssH / BE.H);
    ox = (cssW - BE.W * scale) / 2;
    oy = (cssH - BE.H * scale) / 2;
    draw();
  }

  // ---------------- game setup ----------------

  function layout() {
    if (mode === 'endless') return BE.endlessLayout(wave);
    if (mode === 'daily') return BE.dailyLayout(dayNo);
    return BE.layoutFor(levelNo);
  }
  function seedFor() {
    if (mode === 'endless') return Core.fnv('brickbreaker-endless-run|' + wave);
    if (mode === 'daily') return Core.dailySeed(GAME, dayNo);
    return Core.levelSeed(GAME, levelNo);
  }
  function newGame(carry) {
    const c = carry || {};
    s = BE.createGame(layout(), { seed: seedFor(), level: mode === 'campaign' ? levelNo : mode === 'endless' ? 1 + wave * 2 : 20, lives: c.lives == null ? 3 : c.lives, score: c.score || 0 });
    segStart = s.score;
    livesAtStart = s.lives;
    targetX = s.paddle.x;
    wantLaunch = false;
    hud();
  }
  function segment() {
    return { w: wave, pts: s.score - segStart, bricks: s.destroyed, cleared: s.status === 'cleared' };
  }

  function hud() {
    if (!s) return;
    const sc = $('bbScore');
    if (sc) sc.textContent = s.score.toLocaleString();
    const lv = $('bbLives');
    if (lv) lv.textContent = '● ' + (s.lives + 1);
    const dp = $('bbDepth');
    if (dp) dp.textContent = mode === 'endless' ? 'Wave ' + (wave + 1) : mode === 'daily' ? 'Daily' : 'Lv ' + levelNo;
    const sub = overlay.querySelector('.game-chrome-subtitle');
    if (sub) sub.textContent = title();
    const fx = $('bbFx');
    if (fx) {
      const chips = [];
      if (s.fx.wide) chips.push(['wide', Math.ceil(s.fx.wide / BE.TICK) + 's']);
      if (s.fx.slow) chips.push(['slow', Math.ceil(s.fx.slow / BE.TICK) + 's']);
      if (s.fx.laser) chips.push(['laser', Math.ceil(s.fx.laser / BE.TICK) + 's']);
      if (s.fx.sticky) chips.push(['sticky', '×' + s.fx.sticky]);
      fx.innerHTML = chips.map(([k, v]) => `<span style="--c:${POWER_STYLE[k][0]}">${POWER_STYLE[k][1]} ${v}</span>`).join('');
    }
  }

  // ---------------- loop ----------------

  function start() {
    running = true;
    ended = false;
    lastTs = 0;
    acc = 0;
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function frame(ts) {
    raf = null;
    if (!alive()) return;
    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.1, (ts - lastTs) / 1000);
    lastTs = ts;
    if (running && !isPaused() && !document.hidden) {
      activeMs += dt * 1000;
      const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      if (dir) targetX = Math.max(0, Math.min(BE.W, targetX + dir * 420 * dt * (settings.sensitivity || 1)));
      acc += dt;
      let hudDirty = false;
      while (acc >= BE.DT && running) {
        const evs = BE.step(s, { paddleX: targetX, launch: wantLaunch });
        wantLaunch = false;
        acc -= BE.DT;
        if (evs.length) {
          handle(evs);
          hudDirty = true;
        }
        if (s.status === 'cleared' || s.status === 'lost') break;
      }
      if (hudDirty || s.tick % 30 === 0) hud();
      tickFx(dt);
    }
    draw();
    if (s.status === 'cleared' || s.status === 'lost') {
      if (running) onEnd();
    }
    if (running || particles.length || floats.length) raf = requestAnimationFrame(frame);
  }

  let lastBuzz = 0;
  function handle(evs) {
    evs.forEach((ev) => {
      if (ev.t === 'break') {
        if (!reduced()) burst(ev.x, ev.y, brickColour(ev.type), ev.blast ? 4 : 6);
        if (ev.pts >= 20) floats.push({ x: ev.x, y: ev.y, text: '+' + ev.pts, life: 1 });
        const now = performance.now();
        if (now - lastBuzz > 70) {
          Hub.feedback(GAME, 'valid');
          lastBuzz = now;
        }
      } else if (ev.t === 'explode') {
        Hub.feedback(GAME, 'capture');
        if (!reduced()) shakeUntil = performance.now() + 180;
      } else if (ev.t === 'power') {
        floats.push({ x: s.paddle.x, y: s.paddle.y - 16, text: POWER_STYLE[ev.type][2], life: 1.2 });
        Hub.feedback(GAME, 'coin');
      } else if (ev.t === 'life') {
        Hub.feedback(GAME, 'lose');
        floats.push({ x: BE.W / 2, y: BE.H / 2, text: 'Ball lost — tap to serve', life: 1.6 });
      } else if (ev.t === 'cleared') {
        floats.push({ x: BE.W / 2, y: BE.H / 2, text: 'Cleared! +' + ev.bonus, life: 1.4 });
      }
    });
  }

  function onEnd() {
    if (mode === 'endless' && s.status === 'cleared') {
      segs.push(segment());
      wave++;
      Hub.feedback(GAME, 'complete');
      newGame({ lives: s.lives, score: s.score });
      return;
    }
    running = false;
    ended = true;
    segs.push(segment());
    finish();
  }

  // ---------------- drawing ----------------

  function brickColour(type) {
    return { 1: ACCENT, 2: '#9D7BFF', 3: '#C4B0FF', U: '#3a3a48', X: '#E85D04', M: '#4CC9F0', G: '#E6B422', P: '#FFD166' }[type] || ACCENT;
  }
  function burst(x, y, color, n) {
    for (let k = 0; k < n && particles.length < 40; k++) {
      const a = (Math.PI * 2 * k) / n + Math.random() * 0.6;
      const v = 40 + Math.random() * 60;
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, color });
    }
  }
  function tickFx(dt) {
    particles = particles.filter((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 200 * dt;
      p.life -= dt * 2;
      return p.life > 0;
    });
    floats = floats.filter((f) => {
      f.y -= 24 * dt;
      f.life -= dt;
      return f.life > 0;
    });
  }
  function draw() {
    if (!s) return;
    const g = g2;
    g.save();
    g.clearRect(0, 0, cssW, cssH);
    const bg = g.createLinearGradient(0, 0, 0, cssH);
    bg.addColorStop(0, '#1a1030');
    bg.addColorStop(1, '#0d0a18');
    g.fillStyle = bg;
    g.fillRect(0, 0, cssW, cssH);
    let sx = 0;
    let sy = 0;
    if (performance.now() < shakeUntil) {
      sx = (Math.random() - 0.5) * 4;
      sy = (Math.random() - 0.5) * 4;
    }
    g.translate(ox + sx, oy + sy);
    g.scale(scale, scale);
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.strokeRect(0.5, 0.5, BE.W - 1, BE.H - 1);
    g.font = 'bold 9px Space Grotesk, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    s.bricks.forEach((br) => {
      if (!br.alive) return;
      const type = br.type;
      let fill = brickColour(type);
      if ((type === '2' || type === '3') && br.hp < br.maxHp) fill = br.hp === 1 ? ACCENT : '#9D7BFF';
      g.fillStyle = fill;
      g.fillRect(br.x, br.y, br.w, br.h);
      g.strokeStyle = type === 'U' ? '#666' : 'rgba(255,255,255,0.45)';
      g.strokeRect(br.x + 0.5, br.y + 0.5, br.w - 1, br.h - 1);
      let mark = '';
      if (type === 'X') mark = '✱';
      else if (type === 'G') mark = '◆';
      else if (type === 'P') mark = '★';
      else if (type === 'M') mark = '↔';
      else if (br.hp > 1) mark = String(br.hp);
      if (mark) {
        g.fillStyle = type === 'P' || type === 'G' ? '#3a2400' : '#fff';
        g.fillText(mark, br.x + br.w / 2, br.y + br.h / 2 + 0.5);
      }
    });
    s.beams.forEach((b) => {
      g.strokeStyle = 'rgba(247,37,133,0.85)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(b.x, s.paddle.y);
      g.lineTo(b.x, b.y1);
      g.stroke();
    });
    const p = s.paddle;
    g.fillStyle = s.fx.laser ? '#F72585' : '#fff';
    g.fillRect(p.x - p.w / 2, p.y, p.w, p.h);
    if (s.fx.sticky) {
      g.strokeStyle = '#4CC9F0';
      g.lineWidth = 1.5;
      g.strokeRect(p.x - p.w / 2 - 1, p.y - 1, p.w + 2, p.h + 2);
    }
    g.fillStyle = '#fff';
    s.balls.forEach((b) => {
      g.beginPath();
      g.arc(b.x, b.y, BE.R, 0, Math.PI * 2);
      g.fill();
    });
    s.powerups.forEach((pu) => {
      const st = POWER_STYLE[pu.type];
      g.fillStyle = st[0];
      g.fillRect(pu.x - 12, pu.y - 6, 24, 12);
      g.fillStyle = '#fff';
      g.fillText(st[1], pu.x, pu.y + 0.5);
    });
    particles.forEach((pt) => {
      g.globalAlpha = Math.max(0, pt.life);
      g.fillStyle = pt.color;
      g.fillRect(pt.x - 1.5, pt.y - 1.5, 3, 3);
    });
    g.globalAlpha = 1;
    g.font = 'bold 12px Space Grotesk, sans-serif';
    floats.forEach((f) => {
      g.globalAlpha = Math.max(0, Math.min(1, f.life));
      g.fillStyle = '#FFD166';
      g.fillText(f.text, f.x, f.y);
    });
    g.globalAlpha = 1;
    if (running && (s.status === 'serve' || s.balls.some((b) => b.stuck))) {
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.font = '11px Space Grotesk, sans-serif';
      g.fillText(s.status === 'serve' ? 'Tap or press Space to serve' : 'Tap to release', BE.W / 2, p.y - 28);
    }
    g.restore();
  }

  // ---------------- results ----------------

  function showPanel(html) {
    const el = $('bbOverlay');
    el.innerHTML = html;
    el.hidden = false;
    return el;
  }
  function hidePanel() {
    const el = $('bbOverlay');
    el.hidden = true;
    el.innerHTML = '';
  }

  function intro() {
    const p = Hub.load(GAME);
    let head;
    let line;
    if (mode === 'campaign') {
      head = 'Level ' + levelNo;
      line = (p.stars[levelNo] ? 'Best ' + '★'.repeat(p.stars[levelNo]) + ' ' + (p.bests[levelNo] || 0).toLocaleString() : 'Break every breakable brick') + ' · 3 balls';
    } else if (mode === 'endless') {
      head = 'Endless';
      line = 'Waves keep coming · 3 balls' + (p.pb.brickbreaker_endless ? ' · Best ' + p.pb.brickbreaker_endless.toLocaleString() : '');
    } else {
      head = practice ? 'Daily · practice' : 'Daily Challenge';
      line = practice ? 'Practice — only your first try today counts' : 'Your first try counts · 3 balls · highest score wins';
    }
    const el = showPanel(`<div class="solo-res">
      <div class="solo-res-title">${head}</div>
      ${challenge ? Hub.targetHtml(challenge) : ''}
      <div class="solo-res-line">${line}</div>
      <div class="solo-res-line solo-res-hint">Drag anywhere to move · tap to serve</div>
      <div class="solo-actions"><button type="button" class="solo-btn solo-btn--primary" data-go>Start</button></div></div>`);
    el.querySelector('[data-go]').addEventListener('click', () => {
      hidePanel();
      start();
    });
  }

  async function finish() {
    const ms = Math.round(activeMs);
    const score = s.score;
    const run = { segs, score, ms };
    const p0 = Hub.load(GAME);
    let note = '';
    if (mode === 'campaign') {
      const won = s.status === 'cleared';
      const lost = Math.max(0, livesAtStart - s.lives);
      const stars = won ? (lost === 0 ? 3 : lost === 1 ? 2 : 1) : 0;
      const prevBest = p0.bests[levelNo] || 0;
      run.stars = Math.max(1, stars);
      if (won) {
        const p = Hub.update(GAME, (x) => {
          if (levelNo <= x.level) {
            x.level = Math.max(x.level, Math.min(BE.CAMPAIGN_COUNT, levelNo + 1));
            x.best = Math.max(x.best, levelNo);
          }
          x.stars[levelNo] = Math.max(x.stars[levelNo] || 0, stars);
          x.bests[levelNo] = Math.max(x.bests[levelNo] || 0, score);
          x.pb.brickbreaker = Math.max(x.pb.brickbreaker || 0, score);
          return x;
        });
        try {
          localStorage.setItem('chaupaal_bb_campaign_level', String(Math.max(0, p.level - 1)));
          localStorage.setItem('chaupaal_bb_campaign_best_level', String(p.best));
        } catch (e) {}
        if (typeof setGamePB === 'function') setGamePB('brickbreaker', score);
      }
      try {
        if (typeof recordGameResult === 'function') recordGameResult('brickbreaker', won, false, { score, level: levelNo, scoreOnly: true });
      } catch (e) {}
      Hub.feedback(GAME, won ? 'win' : 'lose');
      const beat = challenge && Number.isFinite(challenge.beatScore) ? (score > challenge.beatScore ? 'You beat the challenge! 🎯' : 'Challenge not beaten this time') : '';
      const el = showPanel(
        Hub.resultHtml({
          title: won ? `Level ${levelNo} cleared` : 'Out of balls',
          stars: won ? stars : null,
          lines: [`<b>${score.toLocaleString()}</b> points`, won && score > prevBest && prevBest ? 'New best for this level' : ''],
          status: beat,
          primary: won ? (levelNo < BE.CAMPAIGN_COUNT ? 'Next level' : 'Replay') : 'Try again',
          secondary: won ? 'Replay' : 'Levels',
          share: won,
          board: true,
        }) + '<p class="solo-note" data-note></p>'
      );
      Hub.wireResult(el, {
        primary: () => restart(won && levelNo < BE.CAMPAIGN_COUNT ? levelNo + 1 : levelNo),
        secondary: () => (won ? restart(levelNo) : (close(), openBrickBreakerLevels())),
        share: () => Hub.share(GAME, { title: 'Level ' + levelNo, line: `${'★'.repeat(stars)} ${score.toLocaleString()} pts`, score, params: { lv: levelNo } }),
        board: () => Hub.openBoard(GAME, Core.boardId(GAME, 'level', levelNo), { title: 'Level ' + levelNo }),
        close: () => (close(), openBrickBreakerModeSheet()),
      });
      if (won && score > prevBest && Hub.signedIn()) {
        const n = el.querySelector('[data-note]');
        n.textContent = 'Checking your score…';
        const res = await Hub.submit(GAME, Core.boardId(GAME, 'level', levelNo), run);
        if (n.isConnected) n.textContent = Hub.submitNote(res);
      }
      return;
    }
    if (mode === 'endless') {
      const prev = p0.pb.brickbreaker_endless || 0;
      Hub.update(GAME, (x) => {
        x.pb.brickbreaker_endless = Math.max(x.pb.brickbreaker_endless || 0, score);
        return x;
      });
      if (typeof setGamePB === 'function') setGamePB('brickbreaker_endless', score);
      try {
        if (typeof recordGameResult === 'function') recordGameResult('brickbreaker', score > 0, false, { score, level: wave + 1, scoreOnly: true });
      } catch (e) {}
      Hub.feedback(GAME, 'lose');
      const el = showPanel(
        Hub.resultHtml({
          title: 'Game over',
          lines: [`<b>${score.toLocaleString()}</b> points`, `Reached wave ${wave + 1}`, score > prev && prev ? 'New personal best' : ''],
          primary: 'Play again',
          share: score > 0,
          board: true,
        }) + '<p class="solo-note" data-note></p>'
      );
      Hub.wireResult(el, {
        primary: () => restart(0),
        share: () => Hub.share(GAME, { title: 'Endless', line: `${score.toLocaleString()} pts · wave ${wave + 1}`, score, params: { mode: 'endless' } }),
        board: () => Hub.openBoard(GAME, Core.boardId(GAME, 'endless'), { title: 'Endless' }),
        close: () => (close(), openBrickBreakerModeSheet()),
      });
      if (score > prev && Hub.signedIn()) {
        const n = el.querySelector('[data-note]');
        n.textContent = 'Checking your score…';
        const res = await Hub.submit(GAME, Core.boardId(GAME, 'endless'), run);
        if (n.isConnected) n.textContent = Hub.submitNote(res);
      }
      return;
    }
    // daily
    Hub.feedback(GAME, 'complete');
    const el = showPanel(
      Hub.resultHtml({
        title: practice ? 'Daily · practice' : 'Daily Challenge',
        lines: [`<b>${score.toLocaleString()}</b> points`, s.status === 'cleared' ? 'Level cleared' : 'Out of balls', `🔥 ${Hub.streak(GAME)} day streak`],
        primary: 'Practice again',
        share: true,
        board: true,
      }) + '<p class="solo-note" data-note></p>'
    );
    Hub.wireResult(el, {
      primary: () => {
        close();
        openBrickBreaker({ mode: 'daily', practice: true });
      },
      share: () => Hub.share(GAME, { title: 'Daily ' + Core.dayKeyOf(dayNo), line: score.toLocaleString() + ' pts', score, params: { mode: 'daily' } }),
      board: () => Hub.openBoard(GAME, Core.boardId(GAME, 'daily', dayNo), { title: 'Brick Breaker Daily' }),
      close: () => (close(), openBrickBreakerModeSheet()),
    });
    const n = el.querySelector('[data-note]');
    if (practice) {
      n.textContent = 'Practice run — only your first try today counts.';
      return;
    }
    if (Hub.signedIn()) n.textContent = 'Checking your score…';
    const res = await Hub.finishDaily(GAME, run, { score, line: score.toLocaleString() + ' pts' });
    note = Hub.submitNote(res.scored ? res : { ranked: false, reason: 'practice' });
    if (n.isConnected) n.textContent = note;
    const lines = el.querySelectorAll('.solo-res-line');
    if (lines[2]) lines[2].textContent = `🔥 ${Hub.streak(GAME)} day streak`;
  }

  function restart(n) {
    hidePanel();
    segs = [];
    wave = 0;
    activeMs = 0;
    particles = [];
    floats = [];
    if (mode === 'campaign') levelNo = n;
    newGame();
    draw();
    intro();
  }

  // ---------------- input ----------------

  function worldX(clientX) {
    const r = canvas.getBoundingClientRect();
    return (clientX - r.left - ox) / scale;
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (!running || isPaused()) return;
    e.preventDefault();
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {}
    drag = { x: e.clientX, paddle: s.paddle.x, moved: false };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!running || isPaused()) return;
    if (drag) {
      const dx = (e.clientX - drag.x) / scale;
      if (Math.abs(dx) > 3) drag.moved = true;
      targetX = Math.max(0, Math.min(BE.W, drag.paddle + dx * (settings.sensitivity || 1)));
    } else if (e.pointerType === 'mouse') targetX = Math.max(0, Math.min(BE.W, worldX(e.clientX)));
  });
  const endDrag = (e) => {
    if (drag && !drag.moved && running) wantLaunch = true;
    drag = null;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch (err) {}
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', () => (drag = null));
  function keyDown(e) {
    if (!running) return;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = true;
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
    else if (e.key === ' ' || e.key === 'Enter') wantLaunch = true;
    else return;
    e.preventDefault();
  }
  function keyUp(e) {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
  }
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  function onVisibility() {
    lastTs = 0;
  }
  document.addEventListener('visibilitychange', onVisibility);
  overlay.querySelector('.game-chrome')?.addEventListener('pointerdown', (e) => e.stopPropagation());

  pauseCtrl =
    typeof createGamePauseController === 'function'
      ? createGamePauseController({
          host: overlay,
          pauseBtnId: 'bbPause',
          onPause() {},
          onResume() {
            lastTs = 0;
            if (!raf && running) raf = requestAnimationFrame(frame);
          },
          onQuit: close,
        })
      : null;

  $('bbBack').addEventListener('click', () => {
    const leave = () => {
      close();
      openBrickBreakerModeSheet();
    };
    if (!running || ended) return leave();
    const wasRunning = running;
    running = false;
    const ask =
      typeof confirmLeaveGame === 'function'
        ? confirmLeaveGame({ title: 'Leave Brick Breaker?', body: mode === 'daily' && !practice ? 'Your Daily try ends here and won’t count.' : 'This run won’t be saved.' })
        : Promise.resolve(window.confirm('Leave Brick Breaker?'));
    Promise.resolve(ask).then((ok) => {
      if (ok) return leave();
      running = wasRunning;
      lastTs = 0;
      if (!raf) raf = requestAnimationFrame(frame);
    });
  });

  newGame();
  resize();
  if (typeof ResizeObserver === 'function') {
    resizeObs = new ResizeObserver(resize);
    resizeObs.observe(canvas.parentElement || canvas);
  }
  intro();
  Hub.sync(GAME);
}

if (typeof registerGame === 'function') {
  registerGame({
    id: 'brickbreaker',
    name: 'Brick Breaker',
    desc: 'Campaign · Endless · Daily · Solo',
    icon: '🧱',
    ratingKey: 'brickbreaker',
    gameType: 'solo',
    genre: 'solo',
    solo: true,
    selfChat: true,
    order: 105,
    meta: { graduated: true, phase: 3, complete: true, live: false },
    launch(ctx) {
      try {
        const params = (ctx && ctx.params) || {};
        const challenge = ctx && ctx.source === 'challenge' ? ctx : null;
        if (params.mode === 'daily') return openBrickBreakerDaily(challenge);
        if (params.mode === 'endless') return openBrickBreaker({ mode: 'endless', challenge });
        if (params.lv) {
          const n = Math.max(1, Math.min(60, parseInt(params.lv, 10) || 1));
          return openBrickBreaker({ mode: 'campaign', level: n, challenge });
        }
        const mode = ctx && (ctx.bbMode || ctx.mode);
        if (mode === 'endless' || mode === 'campaign' || mode === 'daily') {
          if (mode === 'daily') return openBrickBreakerDaily();
          return openBrickBreaker({ mode, level: ctx.startLevel != null ? Number(ctx.startLevel) + 1 : undefined });
        }
        if (ctx && (ctx.source === 'maidan' || ctx.resume)) {
          let last = 'campaign';
          try {
            last = localStorage.getItem('chaupaal_bb_last_mode') || 'campaign';
          } catch (e) {}
          return openBrickBreaker({ mode: last === 'endless' ? 'endless' : 'campaign' });
        }
        openBrickBreakerModeSheet();
      } catch (err) {
        console.error('[brickbreaker] launch failed', err);
        if (typeof showToast === 'function') showToast('Could not open Brick Breaker');
      }
    },
  });
}

window.openBrickBreaker = openBrickBreaker;
window.openBrickBreakerModeSheet = openBrickBreakerModeSheet;
