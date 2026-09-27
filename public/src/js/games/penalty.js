/**
 * Penalty Shootout — vs AI · Pass & Play · Live 1v1.
 *
 * Outcome model + shootout rules live in penalty-core.js (shared with the server). This file is the
 * 2.5D goal-view renderer (canvas, no physics — the resolved result drives the animation), the
 * kick / dive controls and the three match controllers. Live never resolves on the phone:
 * POST /api/media-config { action: 'penalty_kick' } → server-lib/penalty-engine.js.
 */
(function () {
  'use strict';

  const GAME = 'penalty';
  const LABEL = 'Penalty Shootout';
  const KEY_SETTINGS = 'chaupaal_penalty_settings';
  const KEY_NAMES = 'chaupaal_penalty_names';
  const KEY_MUTED = 'chaupaal_penalty_muted';
  const KEY_RECORD = 'chaupaal_penalty_record';
  const KICK_MS = 20000;
  const RECONNECT_MS = 90000;
  const HOLD_FULL_MS = 1200;

  const Core = () => window.PenaltyCore;
  const Kit = () => window.PartyKit;
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

  function tr(key, fallback) {
    return typeof t === 'function' ? t('penalty.' + key, fallback) : fallback;
  }
  function toast(msg) {
    if (typeof showToast === 'function') showToast(msg);
  }
  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }
  function readJson(key, fb) {
    try {
      const v = JSON.parse(localStorage.getItem(key) || 'null');
      return v == null ? fb : v;
    } catch (e) {
      return fb;
    }
  }
  function writeJson(key, v) {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch (e) {}
  }
  function settings() {
    return Core().mergeSettings(readJson(KEY_SETTINGS, {}));
  }
  function saveSettings(s) {
    writeJson(KEY_SETTINGS, Core().mergeSettings(s));
  }
  function myUid() {
    return Kit() ? Kit().myUid() : typeof getCurrentUid === 'function' ? getCurrentUid() || '' : '';
  }
  function myName() {
    return (Kit() && Kit().myName()) || tr('you', 'You');
  }
  function cleanId(raw) {
    return String(raw || '')
      .replace(/[^\w.-]/g, '')
      .slice(0, 120);
  }
  function persistable(uid) {
    if (!uid) return false;
    return typeof isPersistableUid === 'function' ? isPersistableUid(uid) : /^[\w-]{6,128}$/.test(uid);
  }
  function reduceMotion() {
    return typeof shouldReduceGameMotion === 'function' && shouldReduceGameMotion();
  }

  // ---------------- sound + haptics (one mute for all three) ----------------

  let muted = readJson(KEY_MUTED, false) === true;
  function sfx(token) {
    if (!muted && window.Sound) Sound.play(token);
  }
  function hap(kind) {
    if (!muted && window.Haptic && typeof Haptic[kind] === 'function') Haptic[kind]();
  }
  function crowdOn() {
    if (!muted && window.Sound && Sound.playAmbient) Sound.playAmbient('crowd');
  }
  function crowdOff() {
    if (window.Sound && Sound.stopAmbient) Sound.stopAmbient();
  }
  function swell(s) {
    if (!muted && window.Sound && Sound.crowdSwell) Sound.crowdSwell(s);
  }
  function muteBtnHtml() {
    return `<button type="button" class="game-chrome-action game-tap-target pen-mute" data-pen-mute aria-pressed="${muted}" aria-label="${esc(
      muted ? tr('unmute', 'Turn sound on') : tr('mute', 'Mute sound')
    )}">${muted ? '🔇' : '🔊'}</button>`;
  }
  function wireMute(root, onChange) {
    root.querySelectorAll('[data-pen-mute]').forEach((btn) => {
      btn.addEventListener('click', () => {
        muted = !muted;
        writeJson(KEY_MUTED, muted);
        btn.textContent = muted ? '🔇' : '🔊';
        btn.setAttribute('aria-pressed', String(muted));
        btn.setAttribute('aria-label', muted ? tr('unmute', 'Turn sound on') : tr('mute', 'Mute sound'));
        if (muted) crowdOff();
        else if (onChange) onChange();
      });
    });
  }

  // ---------------- colour helpers ----------------

  function shade(hex, amt) {
    const h = String(hex || '#888888').replace('#', '');
    const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
    let r = (n >> 16) & 255;
    let g = (n >> 8) & 255;
    let b = n & 255;
    const f = (c) => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
    r = f(r);
    g = f(g);
    b = f(b);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  function kitOf(id) {
    return Core().kitById(id) || Core().KITS[0];
  }

  // ---------------- 2.5D goal-view renderer ----------------

  const SKIN = '#C98E63';
  const easeOut = (p) => 1 - Math.pow(1 - p, 2.2);

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /** Shirt fill with the kit pattern, clipped to the current path. */
  function paintKit(ctx, kit, x, y, w, h) {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = kit.primary;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = kit.secondary;
    if (kit.pattern === 'stripes') {
      const n = 5;
      for (let i = 1; i < n; i += 2) ctx.fillRect(x + (w * i) / n, y, w / n, h);
    } else if (kit.pattern === 'hoops') {
      const n = 5;
      for (let i = 1; i < n; i += 2) ctx.fillRect(x, y + (h * i) / n, w, h / n);
    } else if (kit.pattern === 'halves') {
      ctx.fillRect(x + w / 2, y, w / 2, h);
    } else if (kit.pattern === 'sash') {
      ctx.beginPath();
      ctx.moveTo(x, y + h * 0.15);
      ctx.lineTo(x + w * 0.2, y);
      ctx.lineTo(x + w, y + h * 0.8);
      ctx.lineTo(x + w * 0.8, y + h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function createPitch(canvas, isAlive) {
    const ctx = canvas.getContext('2d');
    const C = Core();
    const G = {};
    let W = 0;
    let H = 0;
    let dpr = 1;
    let bg = null;
    let look = { kickKit: kitOf('crimson'), keepKit: kitOf('royal'), gloves: C.GLOVES[0] };
    let overlay = null;
    let anim = null;
    let finalFrame = null;
    let raf = 0;

    function layout() {
      const r = canvas.getBoundingClientRect();
      W = Math.max(240, r.width || 320);
      H = Math.max(260, r.height || 360);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      const gw = Math.min(W * 0.84, H * 1.25);
      G.gw = gw;
      G.gh = gw * (C.GOAL_H / C.GOAL_W);
      G.cx = W / 2;
      G.top = H * 0.17;
      G.base = G.top + G.gh;
      G.spotY = H * 0.8;
      G.ballR = Math.max(7, gw * 0.034);
      G.depth = gw * 0.07;
      G.post = Math.max(3, gw * 0.013);
      G.hk = G.gh * 0.8;
      G.hkk = Math.min(H * 0.3, W * 0.42);
      bg = null;
    }
    const gx = (x) => G.cx + (x * G.gw) / 2;
    const gy = (y) => G.base - y * G.gh;
    function toGoal(px, py) {
      return { x: (px - G.cx) / (G.gw / 2), y: (G.base - py) / G.gh };
    }

    function paintBackground() {
      const off = document.createElement('canvas');
      off.width = canvas.width;
      off.height = canvas.height;
      const b = off.getContext('2d');
      b.scale(dpr, dpr);
      const standsBottom = G.top + G.gh * 0.55;
      const sky = b.createLinearGradient(0, 0, 0, standsBottom);
      sky.addColorStop(0, '#0A1622');
      sky.addColorStop(1, '#16283A');
      b.fillStyle = sky;
      b.fillRect(0, 0, W, standsBottom);
      const rng = C.mulberry32(7);
      const crowd = ['#E57373', '#64B5F6', '#FFF176', '#FFFFFF', '#81C784', '#BA68C8', '#FFB74D'];
      for (let y = 6; y < standsBottom - 4; y += 7) {
        for (let x = 3 + (y % 14 ? 3 : 0); x < W; x += 7) {
          b.globalAlpha = 0.18 + rng() * 0.3;
          b.fillStyle = crowd[Math.floor(rng() * crowd.length)];
          b.fillRect(x, y, 3, 3);
        }
      }
      b.globalAlpha = 1;
      // Advertising boards (plain colour bands — no brands).
      const boardTop = standsBottom;
      const boardH = G.gh * 0.12;
      const boards = ['#0D47A1', '#00695C', '#4A148C', '#BF360C'];
      const bw = W / 4;
      boards.forEach((c, i) => {
        b.fillStyle = c;
        b.fillRect(i * bw, boardTop, bw, boardH);
      });
      b.fillStyle = 'rgba(255,255,255,.18)';
      b.fillRect(0, boardTop, W, 1);
      // Pitch with mowing stripes that widen toward the camera.
      const pitchTop = boardTop + boardH;
      let y = pitchTop;
      let band = G.gh * 0.1;
      let i = 0;
      while (y < H) {
        b.fillStyle = i % 2 ? '#1E7A3A' : '#23883F';
        b.fillRect(0, y, W, band + 1);
        y += band;
        band *= 1.28;
        i += 1;
      }
      b.strokeStyle = 'rgba(255,255,255,.85)';
      b.lineWidth = Math.max(1.5, G.gw * 0.004);
      b.beginPath();
      b.moveTo(0, G.base);
      b.lineTo(W, G.base);
      // Goal area + penalty area in perspective.
      const ga = G.spotY - G.base;
      b.moveTo(gx(-1.5), G.base);
      b.lineTo(gx(-1.75), G.base + ga * 0.3);
      b.lineTo(gx(1.75), G.base + ga * 0.3);
      b.lineTo(gx(1.5), G.base);
      b.moveTo(gx(-3.2), G.base);
      b.lineTo(gx(-4.4), G.base + ga * 1.25);
      b.moveTo(gx(3.2), G.base);
      b.lineTo(gx(4.4), G.base + ga * 1.25);
      b.stroke();
      b.fillStyle = '#FFFFFF';
      b.beginPath();
      b.ellipse(G.cx, G.spotY + G.ballR * 0.7, G.ballR * 0.55, G.ballR * 0.22, 0, 0, Math.PI * 2);
      b.fill();
      bg = off;
    }

    function drawNet(ripple) {
      const x0 = gx(-1) + G.depth;
      const x1 = gx(1) - G.depth;
      const y0 = G.top + G.depth * 0.55;
      const y1 = G.base - G.depth * 0.25;
      ctx.fillStyle = 'rgba(255,255,255,.05)';
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      const cols = 16;
      const rows = 7;
      const pt = (i, j) => {
        let x = x0 + ((x1 - x0) * i) / cols;
        let y = y0 + ((y1 - y0) * j) / rows;
        if (ripple && ripple.amp > 0.01) {
          const dx = x - ripple.x;
          const dy = y - ripple.y;
          const d2 = dx * dx + dy * dy;
          const s = G.gw * 0.16;
          const k = ripple.amp * Math.exp(-d2 / (2 * s * s));
          x -= dx * k * 0.35;
          y -= dy * k * 0.35 - k * G.gh * 0.05;
        }
        return [x, y];
      };
      ctx.strokeStyle = 'rgba(255,255,255,.32)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= cols; i++) {
        for (let j = 0; j <= rows; j++) {
          const [x, y] = pt(i, j);
          if (j === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      }
      for (let j = 0; j <= rows; j++) {
        for (let i = 0; i <= cols; i++) {
          const [x, y] = pt(i, j);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      }
      // Side + roof netting back to the frame.
      for (let j = 0; j <= rows; j++) {
        const [lx, ly] = pt(0, j);
        const [rx, ry] = pt(cols, j);
        const fy = G.top + (G.gh * j) / rows;
        ctx.moveTo(gx(-1), fy);
        ctx.lineTo(lx, ly);
        ctx.moveTo(gx(1), fy);
        ctx.lineTo(rx, ry);
      }
      for (let i = 0; i <= cols; i += 2) {
        const [tx, ty] = pt(i, 0);
        ctx.moveTo(gx(-1) + (G.gw * i) / cols, G.top);
        ctx.lineTo(tx, ty);
      }
      ctx.stroke();
    }

    function drawFrame(shake) {
      const s = shake || 0;
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowColor = 'rgba(0,0,0,.35)';
      ctx.shadowBlur = 4;
      ctx.fillRect(gx(-1) - G.post / 2 + s, G.top - G.post / 2, G.post, G.gh + G.post / 2);
      ctx.fillRect(gx(1) - G.post / 2 + s, G.top - G.post / 2, G.post, G.gh + G.post / 2);
      ctx.fillRect(gx(-1) - G.post / 2 + s, G.top - G.post / 2, G.gw + G.post, G.post);
      ctx.shadowBlur = 0;
    }

    /** Keeper pose toward a goal-space target; prog 0 = set stance, 1 = full stretch at the target. */
    function keeperPose(target, prog) {
      const hk = G.hk;
      const stance = { x: gx(0), y: G.base - hk * 0.5 };
      const reachLen = hk * 0.55;
      let a = clamp(target.x * 1.7, -1.35, 1.35);
      if (target.y > 0.6) a *= 0.75;
      const tx = gx(target.x);
      const ty = gy(target.y);
      const end = { x: tx - Math.sin(a) * reachLen, y: Math.min(ty + Math.cos(a) * reachLen, G.base - hk * 0.2) };
      const e = easeOut(clamp(prog, 0, 1));
      const hop = Math.sin(clamp(prog, 0, 1) * Math.PI) * hk * 0.1 * Math.abs(a);
      return { x: stance.x + (end.x - stance.x) * e, y: stance.y + (end.y - stance.y) * e - hop, a: a * e, arms: e };
    }
    function handsOf(pose) {
      const hk = G.hk;
      const len = hk * 0.12 + (hk * 0.55 - hk * 0.12) * pose.arms;
      return { x: pose.x + Math.sin(pose.a) * len, y: pose.y - Math.cos(pose.a) * len };
    }
    function drawKeeper(pose) {
      const hk = G.hk;
      const jersey = shade(look.keepKit.primary, -0.3);
      ctx.save();
      ctx.translate(pose.x, pose.y);
      ctx.rotate(pose.a);
      ctx.fillStyle = '#1B1B1B';
      ctx.fillRect(-hk * 0.11, hk * 0.12, hk * 0.08, hk * 0.36);
      ctx.fillRect(hk * 0.03, hk * 0.12, hk * 0.08, hk * 0.36);
      ctx.fillStyle = shade(look.keepKit.secondary, -0.2);
      ctx.fillRect(-hk * 0.14, hk * 0.02, hk * 0.28, hk * 0.14);
      roundRect(ctx, -hk * 0.15, -hk * 0.26, hk * 0.3, hk * 0.3, hk * 0.05);
      paintKit(ctx, { primary: jersey, secondary: shade(jersey, 0.18), pattern: look.keepKit.pattern }, -hk * 0.15, -hk * 0.26, hk * 0.3, hk * 0.3);
      const up = pose.arms;
      const hands = [-1, 1].map((sd) => ({
        sx: sd * hk * 0.13,
        sy: -hk * 0.21,
        hx: sd * (hk * 0.27 * (1 - up) + hk * 0.08 * up),
        hy: -hk * 0.02 * (1 - up) - hk * 0.55 * up,
      }));
      ctx.strokeStyle = jersey;
      ctx.lineCap = 'round';
      ctx.lineWidth = hk * 0.07;
      hands.forEach((h) => {
        ctx.beginPath();
        ctx.moveTo(h.sx, h.sy);
        ctx.lineTo(h.hx, h.hy);
        ctx.stroke();
      });
      ctx.fillStyle = SKIN;
      ctx.beginPath();
      ctx.arc(0, -hk * 0.34, hk * 0.085, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = look.gloves;
      hands.forEach((h) => {
        ctx.beginPath();
        ctx.arc(h.hx, h.hy, hk * 0.06, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }

    function drawKicker(prog, strike) {
      const k = G.hkk;
      const sx = G.cx - W * 0.22;
      const sy = H + k * 0.1;
      const ex = G.cx - G.ballR * 3.2;
      const ey = G.spotY + k * 0.42;
      const e = easeOut(clamp(prog, 0, 1));
      const x = sx + (ex - sx) * e;
      const y = sy + (ey - sy) * e + Math.sin(prog * Math.PI * 3) * k * 0.015;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(strike ? -0.12 : 0);
      ctx.fillStyle = SKIN;
      ctx.fillRect(-k * 0.14, k * 0.08, k * 0.1, k * 0.4);
      ctx.save();
      ctx.translate(k * 0.09, k * 0.08);
      ctx.rotate(strike ? -0.7 : 0);
      ctx.fillRect(-k * 0.05, 0, k * 0.1, k * 0.4);
      ctx.restore();
      ctx.fillStyle = shade(look.kickKit.secondary === '#FFFFFF' ? '#1A1A1A' : look.kickKit.secondary, -0.1);
      ctx.fillRect(-k * 0.19, -k * 0.06, k * 0.38, k * 0.17);
      roundRect(ctx, -k * 0.2, -k * 0.5, k * 0.4, k * 0.46, k * 0.06);
      paintKit(ctx, look.kickKit, -k * 0.2, -k * 0.5, k * 0.4, k * 0.46);
      ctx.fillStyle = look.kickKit.pattern === 'solid' ? look.kickKit.secondary : shade(look.kickKit.primary, -0.45);
      ctx.font = `800 ${Math.round(k * 0.17)}px "Space Grotesk", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('10', 0, -k * 0.27);
      ctx.strokeStyle = look.kickKit.primary;
      ctx.lineCap = 'round';
      ctx.lineWidth = k * 0.08;
      ctx.beginPath();
      ctx.moveTo(-k * 0.2, -k * 0.44);
      ctx.lineTo(-k * 0.29, -k * 0.2);
      ctx.moveTo(k * 0.2, -k * 0.44);
      ctx.lineTo(k * 0.29, strike ? -k * 0.5 : -k * 0.2);
      ctx.stroke();
      ctx.fillStyle = SKIN;
      ctx.fillRect(-k * 0.045, -k * 0.56, k * 0.09, k * 0.08);
      ctx.fillStyle = '#2B1D14';
      ctx.beginPath();
      ctx.arc(0, -k * 0.64, k * 0.105, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawBall(b) {
      if (!b || b.alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha = b.alpha;
      if (b.shadow) {
        ctx.fillStyle = 'rgba(0,0,0,.28)';
        ctx.beginPath();
        ctx.ellipse(b.shadow.x, b.shadow.y, b.r * 0.9, b.r * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.translate(b.x, b.y);
      ctx.rotate(b.spin || 0);
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(0, 0, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1A1A1A';
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * b.r * 0.62, Math.sin(a) * b.r * 0.62, b.r * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(0, 0, b.r * 0.26, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, b.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    function drawOverlay() {
      if (!overlay) return;
      if (overlay.aim) {
        const ax = gx(overlay.aim.x);
        const ay = gy(overlay.aim.y);
        const r = C.wobbleRadius(overlay.power == null ? C.POWER_MIN : overlay.power);
        const hot = (overlay.power || 0) > 0.8;
        ctx.save();
        ctx.fillStyle = hot ? 'rgba(255,82,82,.18)' : 'rgba(255,255,255,.14)';
        ctx.strokeStyle = hot ? '#FF8A80' : '#FFFFFF';
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(ax, ay, Math.max(4, (r * G.gw) / 2), Math.max(4, r * G.gh), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ax - 8, ay);
        ctx.lineTo(ax + 8, ay);
        ctx.moveTo(ax, ay - 8);
        ctx.lineTo(ax, ay + 8);
        ctx.stroke();
        ctx.restore();
      }
      if (overlay.dive) {
        const d = overlay.dive;
        const dx = gx(d.x);
        const dy = gy(d.y);
        const reach = overlay.reach || C.keeperReach(d.t, 0.6);
        ctx.save();
        ctx.fillStyle = 'rgba(0,230,118,.16)';
        ctx.strokeStyle = 'rgba(0,230,118,.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(dx, dy, (reach / (C.GOAL_W / 2)) * (G.gw / 2), (reach / C.GOAL_H) * G.gh, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.globalAlpha = 0.55;
        drawKeeper(keeperPose(d, 1));
        ctx.restore();
      }
      if (overlay.label) {
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,.75)';
        ctx.font = '700 12px "Space Grotesk", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(overlay.label, G.cx, G.top - G.post - 8);
        ctx.restore();
      }
    }

    function drawTag(text, colour, p) {
      if (!text) return;
      const s = 0.7 + 0.3 * easeOut(clamp(p * 3, 0, 1));
      ctx.save();
      ctx.translate(G.cx, G.top + G.gh * 0.45);
      ctx.scale(s, s);
      ctx.font = `900 ${Math.round(G.gw * 0.12)}px "Space Grotesk", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(0,0,0,.55)';
      ctx.strokeText(text, 0, 0);
      ctx.fillStyle = colour;
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }

    function tagFor(rec) {
      if (rec.result === 'goal') return [rec.panenka ? tr('tag.panenka', 'PANENKA!') : tr('tag.goal', 'GOAL!'), '#00E676'];
      if (rec.result === 'save') return [tr('tag.save', 'SAVED!'), '#FFD54F'];
      if (rec.result === 'post') return [rec.detail === 'bar' ? tr('tag.bar', 'OFF THE BAR') : tr('tag.post', 'OFF THE POST'), '#FF8A80'];
      return [rec.detail === 'over' ? tr('tag.over', 'OVER') : tr('tag.wide', 'WIDE'), '#FF8A80'];
    }

    function timeline(rec) {
      const RUN = 380;
      const F = 980 - 520 * rec.power;
      const impact = RUN + F;
      const diveStart = RUN + (rec.dive.t - 0.5) * 520;
      const diveDur = rec.result === 'save' ? Math.max(140, impact - diveStart) : 420;
      return { RUN, F, impact, diveStart, diveDur, end: impact + 1350 };
    }

    /** Full scene at time t (ms) of a kick animation. */
    function scene(rec, tl, t) {
      const S = { x: G.cx, y: G.spotY };
      const E = { x: gx(rec.ball.x), y: gy(rec.ball.y) };
      const R = G.ballR;
      const target = rec.result === 'save' || rec.result === 'goal' ? rec.keeper : rec.dive;
      const pose = keeperPose(target, (t - tl.diveStart) / tl.diveDur);
      let ball;
      let inNet = false;
      let ripple = null;
      let shake = 0;
      if (t < tl.RUN) {
        ball = { x: S.x, y: S.y, r: R, alpha: 1, shadow: { x: S.x, y: S.y + R * 0.8 } };
      } else if (t < tl.impact) {
        const p = (t - tl.RUN) / tl.F;
        const pe = 1 - Math.pow(1 - p, 1.25);
        const arc = Math.sin(p * Math.PI) * G.gh * (rec.chip ? 0.55 : 0.08 + 0.1 * (1 - rec.power));
        const x = S.x + (E.x - S.x) * pe;
        ball = {
          x,
          y: S.y + (E.y - S.y) * pe - arc,
          r: R * (1 - 0.58 * pe),
          alpha: 1,
          spin: p * 9,
          shadow: { x, y: S.y + R * 0.8 + (G.base - S.y - R * 0.8) * pe },
        };
      } else {
        const u = t - tl.impact;
        const r0 = R * 0.42;
        const sx = rec.ball.x >= 0 ? 1 : -1;
        if (rec.result === 'goal') {
          inNet = true;
          const back = { x: E.x + (G.cx - E.x) * 0.1, y: E.y + (G.base - G.depth * 0.25 - E.y) * 0.12 };
          const floor = G.base - G.depth * 0.3 - r0;
          if (u < 180) {
            const q = u / 180;
            ball = { x: E.x + (back.x - E.x) * q, y: E.y + (back.y - E.y) * q, r: r0 * (1 - 0.15 * q), alpha: 1 };
          } else {
            const q = clamp((u - 180) / 420, 0, 1);
            ball = { x: back.x, y: back.y + (floor - back.y) * q * q, r: r0 * 0.85, alpha: 1 };
          }
          const rt = u - 120;
          if (rt > 0) ripple = { x: back.x, y: back.y, amp: Math.exp(-rt / 420) * Math.abs(Math.cos(rt / 70)) };
        } else if (rec.result === 'save' && rec.detail === 'catch') {
          const h = handsOf(pose);
          ball = { x: h.x, y: h.y, r: r0, alpha: 1 };
        } else if (rec.result === 'save') {
          const q = easeOut(clamp(u / 650, 0, 1));
          const high = rec.ball.y > 0.62;
          const D = { x: E.x + sx * G.gw * 0.34, y: high ? E.y - G.gh * 0.55 : E.y + G.gh * 0.9 };
          ball = { x: E.x + (D.x - E.x) * q, y: E.y + (D.y - E.y) * q, r: r0 + (R * 0.7 - r0) * q, alpha: 1 - clamp((u - 500) / 300, 0, 1), spin: u / 60 };
        } else if (rec.result === 'post') {
          shake = u < 420 ? Math.sin(u * 0.09) * 4 * (1 - u / 420) : 0;
          const q = easeOut(clamp(u / 700, 0, 1));
          const D = rec.detail === 'bar' ? { x: E.x + sx * G.gw * 0.08, y: E.y + G.gh * 1.4 } : { x: E.x - sx * G.gw * 0.22, y: E.y + G.gh * 1.3 };
          ball = { x: E.x + (D.x - E.x) * q, y: E.y + (D.y - E.y) * q, r: r0 + (R * 0.8 - r0) * q, alpha: 1, spin: u / 50 };
        } else {
          const q = clamp(u / 380, 0, 1);
          const D = { x: E.x + (E.x - S.x) * 0.35, y: E.y + (E.y - S.y) * 0.35 };
          ball = { x: E.x + (D.x - E.x) * q, y: E.y + (D.y - E.y) * q, r: r0 * (1 - 0.3 * q), alpha: 1 - q };
        }
      }
      return { pose, ball, inNet, ripple, shake, run: t / tl.RUN, strike: t >= tl.RUN - 40, tagP: t > tl.impact + 120 ? (t - tl.impact - 120) / 1000 : -1 };
    }

    function render(sc, rec, replay) {
      if (!W) layout();
      if (!bg) paintBackground();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(bg, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawNet(sc.ripple);
      if (sc.inNet) drawBall(sc.ball);
      drawFrame(sc.shake);
      drawKeeper(sc.pose);
      if (!sc.inNet) drawBall(sc.ball);
      drawKicker(clamp(sc.run, 0, 1), sc.strike);
      if (rec && sc.tagP >= 0) {
        const [text, colour] = tagFor(rec);
        drawTag(text, colour, sc.tagP);
      }
      if (replay) {
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,.45)';
        roundRect(ctx, 10, 10, 78, 22, 11);
        ctx.fill();
        ctx.fillStyle = '#FFD54F';
        ctx.font = '800 11px "Space Grotesk", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tr('replay', 'REPLAY'), 49, 21);
        ctx.restore();
      }
      if (!rec) drawOverlay();
    }

    function staticScene() {
      return {
        pose: keeperPose(C.KEEPER_STANCE, 0),
        ball: { x: G.cx, y: G.spotY, r: G.ballR, alpha: 1, shadow: { x: G.cx, y: G.spotY + G.ballR * 0.8 } },
        inNet: false,
        ripple: null,
        shake: 0,
        run: 0,
        strike: false,
        tagP: -1,
      };
    }

    function draw() {
      if (!isAlive()) return;
      if (!W) layout();
      if (anim) return;
      if (finalFrame) render(finalFrame.sc, finalFrame.rec, false);
      else render(staticScene(), null, false);
    }

    function play(recIn, opts) {
      const o = opts || {};
      const rec = Object.assign({}, recIn, {
        power: Number(recIn.power != null ? recIn.power : recIn.kick && recIn.kick.power) || 0.5,
        chip: recIn.chip != null ? !!recIn.chip : C.isChip(recIn.kick),
      });
      if (!W) layout();
      overlay = null;
      finalFrame = null;
      const tl = timeline(rec);
      const speed = o.speed || 1;
      return new Promise((resolve) => {
        let struck = false;
        let hit = false;
        const start = performance.now();
        const done = () => {
          if (!anim) return;
          cancelAnimationFrame(raf);
          const sc = scene(rec, tl, tl.end);
          sc.tagP = 1;
          finalFrame = { sc, rec };
          anim = null;
          render(sc, rec, false);
          if (!struck && o.onStrike) o.onStrike();
          if (!hit && o.onImpact) o.onImpact(rec);
          resolve();
        };
        anim = { skip: done };
        if (reduceMotion()) {
          done();
          return;
        }
        const step = (now) => {
          if (!anim || !isAlive()) return resolve();
          const tt = (now - start) * speed;
          if (!struck && tt >= tl.RUN) {
            struck = true;
            if (o.onStrike) o.onStrike();
          }
          if (!hit && tt >= tl.impact) {
            hit = true;
            if (o.onImpact) o.onImpact(rec);
          }
          if (tt >= tl.end) return done();
          render(scene(rec, tl, tt), rec, !!o.replay);
          raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      });
    }

    layout();
    let ro = null;
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(() => {
        layout();
        if (!anim) draw();
      });
      ro.observe(canvas);
    }

    return {
      canvas,
      geom: () => G,
      toGoal,
      setLook(l) {
        look = Object.assign({}, look, l || {});
        if (!anim) draw();
      },
      setOverlay(o) {
        overlay = o || null;
        if (o) finalFrame = null;
        if (!anim) draw();
      },
      reset() {
        finalFrame = null;
        overlay = null;
        draw();
      },
      play,
      skip() {
        if (anim) anim.skip();
      },
      get animating() {
        return !!anim;
      },
      draw,
      destroy() {
        cancelAnimationFrame(raf);
        anim = null;
        if (ro) ro.disconnect();
      },
    };
  }

  // ---------------- kick / dive controls ----------------

  function localPoint(canvas, e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /**
   * Kicker: drag on the goal to aim, hold the button for power (wobble grows, drawn live),
   * or swipe up from the ball — direction aims, speed is power.
   */
  function mountKick(view, o) {
    const C = Core();
    const { pitch, canvas, controls } = view;
    let aim = null;
    let power = C.POWER_MIN;
    let holding = false;
    let holdStart = 0;
    let holdRaf = 0;
    let gesture = null;
    let done = false;
    controls.innerHTML = `
      <div class="pen-prompt">${esc(o.title)}</div>
      <div class="pen-hint" data-hint>${esc(tr('kick.hint', 'Drag on the goal to aim, then hold to shoot — or swipe up from the ball.'))}</div>
      <div class="pen-meter" aria-hidden="true"><i data-meter></i></div>
      <button type="button" class="pen-btn pen-btn--primary pen-shoot" data-shoot disabled>${esc(tr('kick.hold', 'Hold to shoot'))}</button>
      ${o.footHtml || ''}`;
    const meter = controls.querySelector('[data-meter]');
    const btn = controls.querySelector('[data-shoot]');
    const hint = controls.querySelector('[data-hint]');
    const paint = () => pitch.setOverlay({ aim, power: holding ? power : C.POWER_MIN, label: o.label || '' });
    paint();

    function setAim(p) {
      const g = pitch.toGoal(p.x, p.y);
      const first = !aim;
      aim = { x: clamp(g.x, -1.25, 1.25), y: clamp(g.y, 0, 1.25) };
      btn.disabled = false;
      if (first) {
        hap('light');
        hint.textContent = tr('kick.hint2', 'Hold to shoot. Longer = harder to save, but wilder.');
      }
      paint();
    }
    function shoot(kick) {
      if (done) return;
      done = true;
      holding = false;
      cancelAnimationFrame(holdRaf);
      teardown();
      pitch.setOverlay(null);
      controls.innerHTML = '';
      o.onShoot(C.normKick(kick));
    }
    function onDown(e) {
      if (done) return;
      const p = localPoint(canvas, e);
      const g = pitch.geom();
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (err) {}
      if (p.y > g.base + (g.spotY - g.base) * 0.4) gesture = { kind: 'swipe', x: p.x, y: p.y, t: performance.now(), ex: p.x, ey: p.y };
      else {
        gesture = { kind: 'aim' };
        setAim(p);
      }
    }
    function onMove(e) {
      if (!gesture || done) return;
      const p = localPoint(canvas, e);
      if (gesture.kind === 'aim') setAim(p);
      else {
        gesture.ex = p.x;
        gesture.ey = p.y;
      }
    }
    function onUp(e) {
      const gs = gesture;
      gesture = null;
      if (!gs || gs.kind !== 'swipe' || done) return;
      const p = localPoint(canvas, e);
      const dx = p.x - gs.x;
      const dy = p.y - gs.y;
      if (dy > -40) return;
      const g = pitch.geom();
      const dt = Math.max(40, performance.now() - gs.t);
      const targetY = p.y < g.base ? p.y : g.base - g.gh * 0.35;
      const f = (gs.y - targetY) / Math.max(1, gs.y - p.y);
      const goal = pitch.toGoal(gs.x + dx * f, targetY);
      const dist = Math.hypot(dx, dy);
      const screensPerSec = dist / Math.max(1, canvas.getBoundingClientRect().height) / (dt / 1000);
      shoot({ x: clamp(goal.x, -1.4, 1.4), y: clamp(goal.y, 0, 1.4), power: clamp(screensPerSec / 4, 0.15, 1) });
    }
    function holdTick() {
      if (!holding || done) return;
      power = C.POWER_MIN + (1 - C.POWER_MIN) * Math.min(1, (performance.now() - holdStart) / HOLD_FULL_MS);
      meter.style.width = Math.round(power * 100) + '%';
      meter.classList.toggle('is-hot', power > 0.8);
      paint();
      holdRaf = requestAnimationFrame(holdTick);
    }
    function holdDown(e) {
      if (done || !aim) return;
      if (e.cancelable) e.preventDefault();
      holding = true;
      holdStart = performance.now();
      hap('light');
      holdTick();
    }
    function holdUp() {
      if (!holding || done) return;
      holding = false;
      shoot({ x: aim.x, y: aim.y, power });
    }
    function holdCancel() {
      holding = false;
      cancelAnimationFrame(holdRaf);
      meter.style.width = '0%';
      paint();
    }
    function onKey(e) {
      // Keyboard / switch access: a click without a pointer shoots at medium power.
      if (e.detail === 0 && aim && !done) shoot({ x: aim.x, y: aim.y, power: 0.6 });
    }
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', () => (gesture = null));
    btn.addEventListener('pointerdown', holdDown);
    btn.addEventListener('pointerup', holdUp);
    btn.addEventListener('pointerleave', holdUp);
    btn.addEventListener('pointercancel', holdCancel);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    btn.addEventListener('click', onKey);
    function teardown() {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
    }
    return {
      destroy() {
        done = true;
        cancelAnimationFrame(holdRaf);
        teardown();
      },
    };
  }

  /** Keeper: tap / drag where to dive, slide Early ↔ Late, then Dive. Reach is drawn honestly. */
  function mountDive(view, o) {
    const C = Core();
    const { pitch, canvas, controls } = view;
    let dive = null;
    let t = 0.5;
    let dragging = false;
    let done = false;
    controls.innerHTML = `
      <div class="pen-prompt">${esc(o.title)}</div>
      <div class="pen-hint" data-hint>${esc(tr('dive.hint', 'Tap the goal where you’ll dive.'))}</div>
      <div class="pen-timing">
        <span>${esc(tr('dive.early', 'Early'))}</span>
        <input type="range" min="0" max="100" value="50" data-timing aria-label="${esc(tr('dive.timing', 'Dive timing'))}">
        <span>${esc(tr('dive.late', 'Late'))}</span>
      </div>
      <div class="pen-timing-note" data-timing-note></div>
      <button type="button" class="pen-btn pen-btn--primary" data-dive disabled>${esc(tr('dive.go', 'Dive'))}</button>
      ${o.footHtml || ''}`;
    const slider = controls.querySelector('[data-timing]');
    const note = controls.querySelector('[data-timing-note]');
    const btn = controls.querySelector('[data-dive]');
    const hint = controls.querySelector('[data-hint]');
    const noteText = () =>
      t < 0.35
        ? tr('dive.earlyNote', 'Early: covers more, but you commit before the kick')
        : t > 0.65
          ? tr('dive.lateNote', 'Late: react to the ball, but cover less')
          : tr('dive.midNote', 'Balanced timing');
    const paint = () => {
      note.textContent = noteText();
      pitch.setOverlay(dive ? { dive: { x: dive.x, y: dive.y, t }, reach: C.keeperReach(t, 0.6), label: o.label || '' } : { label: o.label || '' });
    };
    paint();
    function setDive(p) {
      const g = pitch.toGoal(p.x, p.y);
      const first = !dive;
      dive = { x: clamp(g.x, -1, 1), y: clamp(g.y, 0, 1) };
      btn.disabled = false;
      if (first) {
        hap('light');
        hint.textContent = tr('dive.hint2', 'Pick your timing, then Dive.');
      }
      paint();
    }
    function onDown(e) {
      if (done) return;
      dragging = true;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (err) {}
      setDive(localPoint(canvas, e));
    }
    function onMove(e) {
      if (dragging && !done) setDive(localPoint(canvas, e));
    }
    function onUp() {
      dragging = false;
    }
    slider.addEventListener('input', () => {
      t = Number(slider.value) / 100;
      paint();
    });
    btn.addEventListener('click', () => {
      if (done || !dive) return;
      done = true;
      teardown();
      pitch.setOverlay(null);
      controls.innerHTML = '';
      hap('medium');
      o.onDive(C.normDive({ x: dive.x, y: dive.y, t }));
    });
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    function teardown() {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    }
    return {
      destroy() {
        done = true;
        teardown();
      },
    };
  }

  // ---------------- match shell ----------------

  function openMatchShell(o) {
    const overlay = document.createElement('div');
    overlay.className = 'game-overlay game-overlay--dark dangal-fullgame pen-shell';
    overlay.style.cssText = 'position:absolute;inset:0;z-index:80;display:flex;flex-direction:column;background:#04160F;';
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      crowdOff();
      try {
        if (o.onCleanup) o.onCleanup();
      } catch (e) {}
      if (view.pitch) view.pitch.destroy();
    };
    const begin = typeof beginGameOverlaySession === 'function' ? beginGameOverlaySession : null;
    const gs = begin
      ? begin({
          type: GAME,
          title: LABEL,
          mode: o.mode,
          overlay,
          chat: o.chat,
          source: o.source || '',
          matchId: o.matchId,
          opponentUid: o.opponentUid,
          stake: o.stake || 0,
          skipEconomyReport: !!o.skipEconomyReport,
          cleanup,
        })
      : null;
    if (begin && (!gs || !gs.alive())) return null;
    if (!begin) (document.querySelector('.device') || document.body).appendChild(overlay);
    // The session may swap in the skeleton's class list; keep ours.
    overlay.classList.add('game-overlay', 'game-overlay--dark', 'dangal-fullgame', 'pen-shell');
    overlay.dataset.gameId = GAME;
    if (typeof applyGameIdentity === 'function') applyGameIdentity(GAME, overlay);
    overlay.innerHTML =
      (typeof gameChromeHtml === 'function'
        ? gameChromeHtml({ title: LABEL, subtitle: o.subtitle || '', backId: 'penBack', gameId: GAME, rightHtml: muteBtnHtml() })
        : `<div class="game-chrome"><button type="button" id="penBack" class="game-back-btn">←</button><div class="game-chrome-title">${esc(LABEL)}</div>${muteBtnHtml()}</div>`) +
      `<div class="pen-body" data-pen-body>
        <div class="pen-board" data-board></div>
        <div class="pen-stage" data-stage>
          <canvas class="pen-canvas" aria-label="${esc(tr('stage', 'Goal view'))}"></canvas>
          <div class="pen-banner" data-banner hidden></div>
          <div class="pen-cover" data-cover hidden></div>
        </div>
        <div class="pen-controls" data-controls></div>
      </div>`;
    if (typeof prepareGameOverlay === 'function') prepareGameOverlay(overlay, { theme: 'dark', gameId: GAME });
    if (window.GameUI && typeof GameUI.attachHowTo === 'function') {
      try {
        GameUI.attachHowTo(overlay.querySelector('.game-chrome-right') || overlay, { gameId: GAME, title: tr('howto.title', 'How to play ' + LABEL) });
      } catch (e) {}
    }
    const alive = () => (gs ? gs.alive() : overlay.isConnected);
    const view = {
      overlay,
      board: overlay.querySelector('[data-board]'),
      stage: overlay.querySelector('[data-stage]'),
      canvas: overlay.querySelector('.pen-canvas'),
      banner: overlay.querySelector('[data-banner]'),
      cover: overlay.querySelector('[data-cover]'),
      controls: overlay.querySelector('[data-controls]'),
      pitch: null,
      gs,
      alive,
      close(reason) {
        if (gs) gs.close(reason || 'dismissed');
        else {
          cleanup();
          overlay.remove();
        }
      },
    };
    view.pitch = createPitch(view.canvas, alive);
    view.canvas.addEventListener('click', () => view.pitch.skip());
    wireMute(overlay, crowdOn);
    overlay.querySelector('#penBack')?.addEventListener('click', () => {
      if (o.onBack) o.onBack();
      else view.close('dismissed');
    });
    crowdOn();
    requestAnimationFrame(() => view.pitch.draw());
    return view;
  }

  function dotsHtml(list, bestOf, pad) {
    const marks = list.map((g) => `<i class="pen-dot ${g ? 'pen-dot--goal' : 'pen-dot--miss'}" aria-label="${g ? 'scored' : 'missed'}"></i>`);
    for (let i = list.length; i < bestOf && pad !== false; i++) marks.push('<i class="pen-dot" aria-hidden="true"></i>');
    return marks.join('');
  }

  /** Two-row scoreboard: kit swatch · name · kick dots · score. */
  function boardHtml(so, names, kits, turnSide) {
    const C = Core();
    const st = C.shootoutStatus(so);
    const row = (side) => {
      const list = so.kicks.filter((k) => k.side === side).map((k) => k.goal);
      const kit = kitOf(kits[side]);
      return `<div class="pen-board-row${turnSide === side ? ' is-turn' : ''}">
        <span class="pen-swatch" style="background:${esc(kit.primary)};border-color:${esc(kit.secondary)}"></span>
        <span class="pen-board-name">${esc(names[side])}</span>
        <span class="pen-dots">${dotsHtml(list, st.bestOf, !st.sudden)}</span>
        <span class="pen-board-score">${side === 'A' ? st.scoreA : st.scoreB}</span>
      </div>`;
    };
    const meta = st.over
      ? tr('board.final', 'Full time')
      : st.sudden
        ? tr('board.sudden', 'Sudden death') + ' · ' + tr('board.round', 'round') + ' ' + (st.round - st.bestOf)
        : tr('board.kick', 'Kick') + ' ' + st.round + ' / ' + st.bestOf;
    return row('A') + row('B') + `<div class="pen-board-meta">${esc(meta)}</div>`;
  }

  function impactFx(rec) {
    if (rec.result === 'goal') {
      sfx('ui.win');
      hap('heavy');
      swell(1);
    } else if (rec.result === 'save') {
      sfx('ui.capture');
      hap('medium');
      swell(0.7);
    } else if (rec.result === 'post') {
      sfx('ui.crash');
      hap('heavy');
      swell(0.5);
    } else {
      sfx('ui.lose');
      hap('light');
      swell(0.35);
    }
  }

  function playKick(view, rec, extra) {
    return view.pitch.play(
      rec,
      Object.assign(
        {
          onStrike: () => {
            sfx('ui.kick');
            hap('medium');
          },
          onImpact: impactFx,
        },
        extra || {}
      )
    );
  }

  function banner(view, text) {
    if (!text) {
      view.banner.hidden = true;
      view.banner.textContent = '';
      return;
    }
    view.banner.hidden = false;
    view.banner.textContent = text;
  }

  // ---------------- result screen ----------------

  function momentsHtml(list) {
    if (!list.length) return '';
    return `<div class="pen-moments">${list.map((m) => `<span class="pen-moment">${esc(m)}</span>`).join('')}</div>`;
  }

  function showResult(view, spec) {
    const C = Core();
    view.pitch.setOverlay(null);
    banner(view, '');
    view.overlay.classList.add('pen-shell--result');
    const st = C.shootoutStatus(spec.so);
    const score = `<div class="pen-result-board">${boardHtml(spec.so, spec.names, spec.kits, null)}</div>`;
    const html =
      typeof gameResultHtml === 'function'
        ? gameResultHtml({
            gameId: GAME,
            title: spec.title,
            subtitle: spec.subtitle || '',
            scoreHtml: score,
            statsHtml: momentsHtml(spec.moments || []) + `<div class="pen-settle" data-settle>${spec.settleHtml || ''}</div>`,
            actions: spec.actions,
            challenge: false,
          })
        : `<div class="game-result"><h2>${esc(spec.title)}</h2>${score}<div data-settle>${spec.settleHtml || ''}</div>${spec.actions
            .map((a) => `<button type="button" class="game-result-btn" data-result-id="${esc(a.id)}">${esc(a.label)}</button>`)
            .join('')}</div>`;
    view.controls.innerHTML = `<div class="pen-result">${html}</div>`;
    view.board.innerHTML = '';
    const handlers = Object.assign({}, spec.handlers);
    if (typeof wireGameResultActions === 'function') wireGameResultActions(view.controls, handlers);
    else
      view.controls.querySelectorAll('[data-result-id]').forEach((b) => b.addEventListener('click', () => handlers[b.dataset.resultId] && handlers[b.dataset.resultId](b)));
    return {
      st,
      setSettle(h) {
        const el = view.controls.querySelector('[data-settle]');
        if (el) el.innerHTML = h;
      },
    };
  }

  function shareShootout(so, names) {
    const text = Core().shareText(so, names);
    if (Kit() && Kit().shareLine) Kit().shareLine(GAME, LABEL, text);
    else if (navigator.share) navigator.share({ title: LABEL, text }).catch(() => {});
  }

  function replayLast(view, rec) {
    if (!rec || view.pitch.animating) return;
    playKick(view, rec, { speed: 0.35, replay: true });
  }

  // ---------------- vs AI · Pass & Play ----------------

  /**
   * @param {{ kind: 'ai'|'pass', level?: string, bestOf: number, names: {A:string,B:string},
   *           kits: {A:string,B:string}, gloves: string, source?: string }} cfg
   */
  function startLocal(cfg) {
    const C = Core();
    const ai = cfg.kind === 'ai';
    const human = 'A';
    const so = C.createShootout({ bestOf: cfg.bestOf });
    const records = [];
    const mem = C.newMemory();
    const rng = Math.random;
    let control = null;
    let over = false;
    const levelName = { easy: tr('level.easy', 'Easy'), medium: tr('level.medium', 'Medium'), hard: tr('level.hard', 'Hard') };
    const view = openMatchShell({
      mode: ai ? 'practice' : 'pass',
      source: cfg.source || 'manch',
      subtitle: ai ? tr('sub.ai', 'vs AI') + ' · ' + levelName[cfg.level] : tr('sub.pass', 'Pass & Play'),
      matchId: GAME + '_' + (ai ? 'ai' : 'pp') + '_' + Date.now(),
      skipEconomyReport: !ai,
      onBack: async () => {
        if (!over && typeof confirmLeaveGame === 'function') {
          const go = await confirmLeaveGame({ title: tr('leave.title', 'Leave the shootout?'), body: tr('leave.body', 'This shootout will end.') });
          if (!go) return;
        }
        view.close(over ? 'done' : 'quit');
      },
      onCleanup: () => {
        over = true;
        if (control) control.destroy();
      },
    });
    if (!view) return;
    const sideName = (s) => cfg.names[s];
    const otherSide = (s) => (s === 'A' ? 'B' : 'A');
    const gloveFor = (side) => (ai && side !== human ? C.GLOVES[2] : cfg.gloves);

    function paintBoard(turnSide) {
      view.board.innerHTML = boardHtml(so, cfg.names, cfg.kits, turnSide);
    }
    function setLook(kicker) {
      const keeper = otherSide(kicker);
      view.pitch.setLook({ kickKit: kitOf(cfg.kits[kicker]), keepKit: kitOf(cfg.kits[keeper]), gloves: gloveFor(keeper) });
    }

    function next() {
      if (!view.alive()) return;
      const st = C.shootoutStatus(so);
      if (st.over) return finish(st);
      const kicker = st.next;
      const keeper = otherSide(kicker);
      paintBoard(kicker);
      setLook(kicker);
      view.pitch.reset();
      banner(view, st.sudden && st.round === st.bestOf + 1 && so.kicks.length % 2 === 0 ? tr('banner.sudden', 'Sudden death — next miss could decide it') : '');
      if (ai) {
        if (kicker === human) {
          // The AI keeper commits before you shoot — it never sees your kick.
          const aiDive = C.aiDive(cfg.level, mem, rng);
          control = mountKick(view, {
            title: tr('turn.youKick', 'Your kick'),
            onShoot: (kick) => {
              C.remember(mem, 'kick', kick);
              resolve(kicker, kick, aiDive);
            },
          });
        } else {
          const aiKick = C.aiKick(cfg.level, mem, rng);
          control = mountDive(view, {
            title: tr('turn.youSave', 'You’re in goal'),
            onDive: (dive) => {
              C.remember(mem, 'dive', dive);
              resolve(kicker, aiKick, dive);
            },
          });
        }
        return;
      }
      control = mountKick(view, {
        title: sideName(kicker) + ' — ' + tr('turn.kick', 'your kick'),
        label: sideName(kicker),
        onShoot: (kick) => {
          view.pitch.reset();
          passCover(view, sideName(keeper), sideName(kicker), () => {
            control = mountDive(view, {
              title: sideName(keeper) + ' — ' + tr('turn.save', 'you’re in goal'),
              label: sideName(keeper),
              onDive: (dive) => resolve(kicker, kick, dive),
            });
          });
        },
      });
    }

    function resolve(kicker, kick, dive) {
      control = null;
      view.controls.innerHTML = `<div class="pen-hint pen-hint--center">${esc(tr('tapSkip', 'Tap the goal to skip'))}</div>`;
      const seed = Math.floor(Math.random() * 4294967296) >>> 0;
      const out = C.resolveKick(kick, dive, seed);
      const rec = Object.assign({ side: kicker, kick, dive, seed }, out);
      records.push(rec);
      playKick(view, rec).then(() => {
        if (!view.alive()) return;
        C.addKick(so, kicker, out.result === 'goal');
        paintBoard(null);
        setTimeout(next, 650);
      });
    }

    function finish(st) {
      over = true;
      const last = records[records.length - 1];
      const moments = [];
      const humanSides = ai ? [human] : ['A', 'B'];
      humanSides.forEach((s) => {
        if (C.cleanSheet(so, s)) moments.push('🧤 ' + tr('moment.cleanSheet', 'Clean sheet') + (ai ? '' : ' — ' + sideName(s)));
        if (records.some((r) => r.side === s && r.panenka)) moments.push('🥄 ' + tr('moment.panenka', 'Panenka') + (ai ? '' : ' — ' + sideName(s)));
      });
      if (st.round > st.bestOf) moments.push('⚡ ' + tr('moment.sudden', 'Decided in sudden death'));
      let title;
      if (ai) {
        const won = st.winner === human;
        title = won ? tr('result.win', 'You win!') : tr('result.lose', 'The AI wins');
        if (view.gs) view.gs.setOutcome(won ? 'won' : 'lost');
        const rec = readJson(KEY_RECORD, { w: 0, l: 0 });
        rec[won ? 'w' : 'l'] += 1;
        writeJson(KEY_RECORD, rec);
        if (typeof recordGameResult === 'function') recordGameResult(GAME, won, false, { mode: 'practice', difficulty: cfg.level });
        else if (typeof recordDangalSession === 'function') recordDangalSession(GAME, { won, difficulty: cfg.level });
        sfx(won ? 'ui.win' : 'ui.lose');
      } else {
        title = sideName(st.winner) + ' ' + tr('result.wins', 'wins!');
        if (typeof recordDangalSession === 'function') recordDangalSession(GAME, { mode: 'pass' });
        sfx('ui.win');
      }
      showResult(view, {
        so,
        names: cfg.names,
        kits: cfg.kits,
        title,
        subtitle: st.scoreA + '–' + st.scoreB + (st.round > st.bestOf ? ' · ' + tr('result.afterSudden', 'after sudden death') : ''),
        moments,
        actions: [
          { id: 'again', label: tr('again', 'Play again'), primary: true },
          { id: 'replay', label: tr('watchReplay', 'Watch the winning kick') },
          { id: 'share', label: tr('share', 'Share') },
          { id: 'home', label: tr('home', 'Back to menu') },
        ],
        handlers: {
          again: () => {
            view.close('done');
            setTimeout(() => startLocal(Object.assign({}, cfg)), 120);
          },
          replay: () => replayLast(view, last),
          share: () => shareShootout(so, cfg.names),
          home: () => {
            view.close('done');
            setTimeout(openHome, 120);
          },
        },
      });
    }

    paintBoard('A');
    setTimeout(next, 250);
  }

  /** "Pass to <keeper>" — the kick is only in memory; nothing about it is on screen. */
  function passCover(view, keeperName, kickerName, onReady) {
    view.controls.innerHTML = '';
    view.cover.hidden = false;
    view.cover.innerHTML = `<div class="pen-cover-card">
      <div class="pen-cover-lead">${esc(tr('pass.lead', 'Kick locked in. Pass the phone to'))}</div>
      <div class="pen-cover-name">${esc(keeperName)}</div>
      <div class="pen-cover-sub">${esc(kickerName + ', ' + tr('pass.sub', 'look away while they pick a dive'))}</div>
      <button type="button" class="pen-btn pen-btn--primary" data-ready>${esc(tr('pass.ready', 'I’m') + ' ' + keeperName + ' — ' + tr('pass.go', 'ready'))}</button>
    </div>`;
    view.cover.querySelector('[data-ready]').addEventListener('click', () => {
      view.cover.hidden = true;
      view.cover.innerHTML = '';
      onReady();
    });
  }

  // ---------------- Live 1v1 ----------------

  async function liveCall(op, args) {
    if (typeof apiFetch !== 'function') throw Object.assign(new Error('Offline'), { code: 'OFFLINE' });
    const res = await apiFetch('/api/media-config', {
      method: 'POST',
      needAuth: true,
      body: Object.assign({ action: 'penalty_kick', op }, args || {}),
    });
    if (!res || !res.ok) {
      const e = new Error((res && res.error && res.error.message) || 'Something went wrong');
      e.code = (res && res.error && res.error.code) || 'ERROR';
      throw e;
    }
    return res.data || {};
  }

  function liveErrorText(e) {
    const code = String((e && e.code) || '').toUpperCase();
    if (code === 'NOT_IN_MATCH') return tr('err.notIn', 'This match is for two other players');
    if (code === 'RATE_LIMITED') return tr('err.rate', 'Slow down a little — try again in a moment');
    if (code === 'MATCH_NOT_FOUND') return tr('err.gone', 'That match has ended');
    if (code === 'BAD_OPPONENT') return tr('err.opp', 'Pick a real opponent');
    return typeof navigator !== 'undefined' && navigator.onLine === false
      ? tr('err.offline', 'You’re offline — reconnect to keep playing')
      : tr('err.generic', 'Couldn’t reach the match — try again');
  }

  /**
   * @param {{ matchId: string, opponentUid: string, host: boolean, stake?: number, oppName?: string, chat?: object, source?: string }} cfg
   */
  function startLive(cfg) {
    const C = Core();
    const me = myUid();
    const opp = cfg.opponentUid;
    const matchId = cleanId(cfg.matchId);
    const s = settings();
    if (!me || !persistable(opp) || !matchId) {
      toast(tr('err.link', 'That challenge link is broken — try again from Dangal'));
      return;
    }
    const ref = typeof rtdb !== 'undefined' && rtdb ? rtdb.ref('games/penalty/' + matchId) : null;
    const TS = window.firebase && firebase.database && firebase.database.ServerValue ? firebase.database.ServerValue.TIMESTAMP : Date.now();
    let pub = null;
    let secret = null;
    let presence = {};
    let offset = 0;
    let shown = -1;
    let queue = Promise.resolve();
    let animating = false;
    let mounted = '';
    let control = null;
    let left = false;
    let stopped = false;
    let lastTick = 0;
    let lastSettle = 0;
    let resultShown = false;
    let resultUi = null;
    let rematchAsked = false;
    let switching = false;
    let toastsShown = false;
    let timers = [];

    const view = openMatchShell({
      mode: 'live',
      source: cfg.source || 'challenge',
      chat: cfg.chat,
      matchId,
      opponentUid: opp,
      stake: cfg.stake || 0,
      subtitle: tr('sub.live', 'Live'),
      skipEconomyReport: true,
      onBack: async () => {
        const playing = pub && (pub.status === 'playing' || pub.status === 'waiting');
        if (playing && typeof confirmLeaveGame === 'function') {
          const go = await confirmLeaveGame({
            title: pub.status === 'waiting' ? tr('leave.cancelTitle', 'Cancel the challenge?') : tr('leave.liveTitle', 'Leave and forfeit?'),
            body:
              pub.status === 'waiting'
                ? tr('leave.cancelBody', 'No chips move.')
                : tr('leave.liveBody', 'Leaving now gives your opponent the win') + (pub.stake ? ' ' + tr('leave.andChips', 'and your staked chips.') : '.'),
          });
          if (!go) return;
        }
        if (playing) {
          left = true;
          liveCall('leave', { matchId }).catch(() => {});
        }
        view.close(playing ? 'quit' : 'done');
      },
      onCleanup: () => {
        if (!left && !switching && pub && (pub.status === 'playing' || pub.status === 'waiting')) {
          left = true;
          liveCall('leave', { matchId }).catch(() => {});
        }
        stop();
      },
    });
    if (!view) return;

    const serverNow = () => Date.now() + offset;
    const oppName = () => (pub && pub.names && pub.names[opp]) || cfg.oppName || tr('opponent', 'Opponent');
    const names = () => (pub ? { A: pub.playerA === me ? myName() : oppName(), B: pub.playerB === me ? myName() : oppName() } : { A: '', B: '' });
    const kitsAB = () => (pub ? { A: pub.kits[pub.playerA], B: pub.kits[pub.playerB] } : { A: s.kitA, B: s.kitB });
    const shootout = (kicks) => ({ bestOf: pub.bestOf, kicks: kicks.map((k) => ({ side: k.kicker === pub.playerA ? 'A' : 'B', goal: k.result === 'goal' })) });
    const kicksOf = () => (pub && pub.kicks ? (Array.isArray(pub.kicks) ? pub.kicks.filter(Boolean) : Object.values(pub.kicks)) : []);

    function subtitle() {
      if (!pub) return;
      const sub = view.overlay.querySelector('.game-chrome-subtitle');
      const bits = [tr('sub.live', 'Live'), tr('sub.bestOf', 'Best of') + ' ' + pub.bestOf];
      if (pub.stake) bits.push('⚡' + pub.stake);
      if (sub) sub.textContent = bits.join(' · ');
    }

    function paintBoard(kicks, turnSide) {
      if (!pub) return;
      view.board.innerHTML = boardHtml(shootout(kicks), names(), kitsAB(), turnSide);
    }

    function oppOnline() {
      const p = presence[opp];
      if (!p) return false;
      return p.online !== false && serverNow() - (Number(p.at) || 0) < 30000;
    }
    function oppGoneFor() {
      const p = presence[opp];
      const since = p && Number(p.at) ? Number(p.at) : (pub && pub.startedAt) || serverNow();
      return serverNow() - since;
    }

    function unmount() {
      if (control) control.destroy();
      control = null;
      mounted = '';
    }

    function renderWaiting() {
      unmount();
      paintBoard([], null);
      view.pitch.reset();
      const mins = Math.max(0, Math.ceil((pub.deadline - serverNow()) / 60000));
      view.controls.innerHTML = `<div class="pen-wait">
        <div class="pen-prompt">${esc(tr('live.waiting', 'Waiting for') + ' ' + oppName())}</div>
        <div class="pen-hint">${esc(tr('live.waitingSub', 'They have') + ' ' + mins + ' ' + tr('live.min', 'min to accept. No chips move if they don’t.'))}</div>
        <button type="button" class="pen-btn pen-btn--ghost" data-cancel>${esc(tr('live.cancel', 'Cancel challenge'))}</button>
      </div>`;
      view.controls.querySelector('[data-cancel]').addEventListener('click', () => {
        left = true;
        liveCall('leave', { matchId }).catch(() => {});
        view.close('done');
      });
    }

    function clockHtml() {
      return `<div class="pen-clock" data-clock aria-live="off"></div>`;
    }
    function paintClock() {
      const el = view.controls.querySelector('[data-clock]');
      if (!el || !pub || pub.status !== 'playing') return;
      const remain = Math.max(0, Math.min(KICK_MS, pub.deadline - serverNow()));
      const secs = Math.ceil(remain / 1000);
      el.textContent = secs > 0 ? '⏱ ' + secs + 's' : tr('live.timeUp', 'Time’s up — a random pick is coming');
      el.classList.toggle('is-low', secs <= 5);
    }

    function renderTurn() {
      if (animating || !pub || pub.status !== 'playing' || !pub.turn) return;
      const turn = pub.turn;
      const role = turn.kicker === me ? 'kick' : 'dive';
      const kickerSide = turn.kicker === pub.playerA ? 'A' : 'B';
      paintBoard(kicksOf(), kickerSide);
      const kKit = kitOf(pub.kits[turn.kicker]);
      const gKit = kitOf(pub.kits[turn.keeper]);
      view.pitch.setLook({ kickKit: kKit, keepKit: gKit, gloves: turn.keeper === me ? s.gloves : C.GLOVES[2] });
      const locked = (secret && Number(secret.kickNo) === turn.kickNo) || (pub.ready && pub.ready[role]);
      const otherRole = role === 'kick' ? 'dive' : 'kick';
      const oppReady = !!(pub.ready && pub.ready[otherRole]);
      const key = turn.kickNo + ':' + role + ':' + (locked ? 'L' : 'O');
      if (mounted === key) {
        const st = view.controls.querySelector('[data-opp-state]');
        if (st) st.textContent = oppReady ? oppName() + ' ' + tr('live.oppLocked', 'has locked in') : oppName() + ' ' + tr('live.oppThinking', 'is choosing…');
        return;
      }
      unmount();
      mounted = key;
      const foot = `${clockHtml()}<div class="pen-opp-state" data-opp-state>${esc(
        oppReady ? oppName() + ' ' + tr('live.oppLocked', 'has locked in') : oppName() + ' ' + tr('live.oppThinking', 'is choosing…')
      )}</div>`;
      if (locked) {
        view.pitch.reset();
        view.controls.innerHTML = `<div class="pen-locked">✓ ${esc(
          role === 'kick' ? tr('live.kickLocked', 'Kick locked in') : tr('live.diveLocked', 'Dive locked in')
        )}</div>${foot}`;
        paintClock();
        return;
      }
      const submit = (choice) => {
        view.controls.innerHTML = `<div class="pen-locked">${esc(tr('live.sending', 'Locking in…'))}</div>${foot}`;
        mounted = turn.kickNo + ':' + role + ':L';
        liveCall('submit', { matchId, kickNo: turn.kickNo, choice })
          .then((r) => {
            if (r && r.serverNow) offset = Number(r.serverNow) - Date.now();
          })
          .catch((e) => {
            if (String(e.code).toUpperCase() === 'ALREADY_LOCKED' || String(e.code).toUpperCase() === 'STALE_KICK') return;
            toast(liveErrorText(e));
            mounted = '';
            renderTurn();
          });
      };
      control =
        role === 'kick'
          ? mountKick(view, { title: tr('turn.youKick', 'Your kick'), footHtml: foot, onShoot: submit })
          : mountDive(view, { title: tr('turn.youSave', 'You’re in goal'), footHtml: foot, onDive: submit });
      paintClock();
    }

    function recFor(k) {
      return {
        kick: k.kick,
        dive: k.dive,
        result: k.result,
        detail: k.detail,
        ball: k.ball,
        keeper: k.keeperAt || k.dive,
        power: k.kick.power,
        chip: C.isChip(k.kick),
        panenka: !!k.panenka,
      };
    }

    function animateNew(kicks) {
      const from = shown;
      shown = kicks.length;
      for (let i = from; i < kicks.length; i++) {
        const k = kicks[i];
        queue = queue.then(async () => {
          if (!view.alive()) return;
          animating = true;
          unmount();
          view.controls.innerHTML = `<div class="pen-hint pen-hint--center">${esc(
            (k.auto && (k.auto.kick || k.auto.dive) ? tr('live.autoPick', 'Clock ran out — random pick') + ' · ' : '') + tr('tapSkip', 'Tap the goal to skip')
          )}</div>`;
          paintBoard(kicks.slice(0, i), k.kicker === pub.playerA ? 'A' : 'B');
          view.pitch.setLook({ kickKit: kitOf(pub.kits[k.kicker]), keepKit: kitOf(pub.kits[k.keeper]), gloves: k.keeper === me ? s.gloves : C.GLOVES[2] });
          await playKick(view, recFor(k));
          paintBoard(kicks.slice(0, i + 1), null);
          await new Promise((r) => setTimeout(r, 500));
        });
      }
      queue = queue.then(() => {
        animating = false;
        render();
      });
    }

    function settleLine() {
      const st = pub.settlement && pub.settlement[me];
      if (!st) return pub.status === 'over' ? `<div class="pen-settle-line">${esc(tr('live.settling', 'Settling chips…'))}</div>` : '';
      const bits = [];
      bits.push((st.chipDelta >= 0 ? '+' : '') + st.chipDelta + ' ' + tr('chips', 'chips'));
      if (st.eloDelta) bits.push(tr('rating', 'Rating') + ' ' + (st.eloDelta > 0 ? '+' : '') + st.eloDelta);
      return `<div class="pen-settle-line">⚡ ${esc(bits.join(' · '))}</div><div class="pen-settle-note">${esc(tr('live.virtual', 'Virtual chips only'))}</div>`;
    }

    function maybeToasts() {
      const st = pub.settlement && pub.settlement[me];
      if (!st || toastsShown) return;
      toastsShown = true;
      const list = (st.achievements || []).map((key) => ({ key }));
      if (list.length && typeof showAchievementToasts === 'function') showAchievementToasts(list);
      try {
        if (window.DangalEconomy && typeof DangalEconomy.getChipBalance === 'function') Promise.resolve(DangalEconomy.getChipBalance(true)).catch(() => {});
      } catch (e) {}
    }

    function renderOver() {
      unmount();
      const kicks = kicksOf();
      if (resultShown) {
        if (resultUi) resultUi.setSettle(settleLine());
        maybeToasts();
        paintRematch();
        return;
      }
      resultShown = true;
      const so = shootout(kicks);
      const won = pub.winner === me;
      const reasonLine =
        pub.reason === 'left'
          ? won
            ? oppName() + ' ' + tr('live.oppLeft', 'left — you win by forfeit')
            : tr('live.youLeft', 'You left the match')
          : pub.reason === 'disconnect'
            ? won
              ? oppName() + ' ' + tr('live.oppDropped', 'didn’t come back — you win by forfeit')
              : tr('live.youDropped', 'You were disconnected too long')
            : '';
      const st = C.shootoutStatus(so);
      const moments = [];
      if (pub.reason === 'shootout' && won && kicks.every((k) => k.keeper !== me || k.result !== 'goal')) moments.push('🧤 ' + tr('moment.cleanSheet', 'Clean sheet'));
      if (kicks.some((k) => k.kicker === me && k.panenka)) moments.push('🥄 ' + tr('moment.panenka', 'Panenka'));
      if (st.round > st.bestOf && pub.reason === 'shootout') moments.push('⚡ ' + tr('moment.sudden', 'Decided in sudden death'));
      if (view.gs) view.gs.setOutcome(won ? 'won' : 'lost');
      if (typeof recordDangalSession === 'function') recordDangalSession(GAME, { won, live: true, stake: pub.stake, mode: 'live' });
      crowdOff();
      const last = kicks[kicks.length - 1];
      resultUi = showResult(view, {
        so,
        names: names(),
        kits: kitsAB(),
        title: won ? tr('result.win', 'You win!') : oppName() + ' ' + tr('result.wins', 'wins!'),
        subtitle: reasonLine || st.scoreA + '–' + st.scoreB + (st.round > st.bestOf ? ' · ' + tr('result.afterSudden', 'after sudden death') : ''),
        moments,
        settleHtml: settleLine(),
        actions: [
          { id: 'rematch', label: tr('rematch', 'Rematch'), primary: true },
          ...(last ? [{ id: 'replay', label: tr('watchReplay', 'Watch the winning kick') }] : []),
          { id: 'share', label: tr('share', 'Share') },
          { id: 'home', label: tr('home', 'Back to menu') },
        ],
        handlers: {
          rematch: () => askRematch(),
          replay: () => last && replayLast(view, recFor(last)),
          share: () => shareShootout(so, names()),
          home: () => {
            view.close('done');
            setTimeout(openHome, 120);
          },
        },
      });
      maybeToasts();
      paintRematch();
    }

    function paintRematch() {
      const btn = view.controls.querySelector('[data-result-id="rematch"]');
      if (!btn || !pub) return;
      const r = pub.rematch || {};
      if (rematchAsked || r[me]) {
        btn.textContent = tr('rematch.waiting', 'Waiting for') + ' ' + oppName() + '…';
        btn.disabled = true;
      } else if (r[opp]) {
        btn.textContent = oppName() + ' ' + tr('rematch.wants', 'wants a rematch — accept');
      }
      if (pub.nextMatchId && (rematchAsked || r[me])) switchToRematch(pub.nextMatchId);
    }

    function askRematch() {
      rematchAsked = true;
      paintRematch();
      liveCall('rematch', { matchId })
        .then((r) => {
          if (r && r.nextMatchId) switchToRematch(r.nextMatchId);
        })
        .catch((e) => {
          rematchAsked = false;
          toast(liveErrorText(e));
          paintRematch();
        });
    }

    function switchToRematch(nextId) {
      if (switching) return;
      switching = true;
      const nextHost = pub.playerB === me;
      const stake = pub.stake;
      const name = oppName();
      view.close('rematch');
      setTimeout(() => startLive({ matchId: nextId, opponentUid: opp, host: nextHost, stake, oppName: name, chat: cfg.chat, source: cfg.source }), 150);
    }

    function renderVoid() {
      unmount();
      const reason = pub.reason === 'no_show' ? oppName() + ' ' + tr('live.noShow', 'didn’t join in time') : tr('live.cancelled', 'Challenge cancelled');
      view.controls.innerHTML = `<div class="pen-wait">
        <div class="pen-prompt">${esc(reason)}</div>
        <div class="pen-hint">${esc(tr('live.noChips', 'No chips moved.'))}</div>
        <button type="button" class="pen-btn pen-btn--primary" data-home>${esc(tr('home', 'Back to menu'))}</button>
      </div>`;
      view.controls.querySelector('[data-home]').addEventListener('click', () => {
        view.close('done');
        setTimeout(openHome, 120);
      });
    }

    function render() {
      if (!pub || !view.alive() || switching) return;
      subtitle();
      const kicks = kicksOf();
      if (shown < 0) shown = kicks.length;
      if (kicks.length > shown) return animateNew(kicks);
      if (animating) return;
      if (pub.status === 'waiting') return renderWaiting();
      if (pub.status === 'void') return renderVoid();
      if (pub.status === 'over') return renderOver();
      renderTurn();
      paintPresence();
    }

    function paintPresence() {
      if (!pub || pub.status !== 'playing') return banner(view, '');
      if (oppOnline()) return banner(view, '');
      const leftMs = Math.max(0, RECONNECT_MS - oppGoneFor());
      banner(view, oppName() + ' ' + tr('live.reconnecting', 'lost connection — waiting') + ' ' + Math.ceil(leftMs / 1000) + 's');
    }

    function loop() {
      if (stopped || !pub) return;
      const now = serverNow();
      paintClock();
      paintPresence();
      const gap = Date.now() - lastTick;
      if (pub.status === 'waiting' && now >= pub.deadline && gap > 2500) {
        lastTick = Date.now();
        liveCall('tick', { matchId }).catch(() => {});
      } else if (pub.status === 'playing' && gap > 2500 && (now >= pub.deadline + 400 || oppGoneFor() > RECONNECT_MS + 500)) {
        lastTick = Date.now();
        setTimeout(() => liveCall('tick', { matchId }).catch(() => {}), Math.floor(Math.random() * 500));
      } else if (pub.status === 'over' && !pub.settlement && now - (pub.endedAt || 0) > 6000 && Date.now() - lastSettle > 8000) {
        lastSettle = Date.now();
        liveCall('settle', { matchId }).catch(() => {});
      }
    }

    let presRef = null;
    let offsetRef = null;
    const subs = [];
    function stop() {
      if (stopped) return;
      stopped = true;
      unmount();
      timers.forEach((id) => clearInterval(id));
      timers = [];
      subs.forEach((fn) => {
        try {
          fn();
        } catch (e) {}
      });
      if (presRef) {
        presRef.set({ at: TS, online: false }).catch(() => {});
        try {
          presRef.onDisconnect().cancel();
        } catch (e) {}
      }
    }

    function subscribe() {
      if (!ref) {
        view.controls.innerHTML = `<div class="pen-wait"><div class="pen-prompt">${esc(tr('err.generic', 'Couldn’t reach the match — try again'))}</div></div>`;
        return;
      }
      const pubRef = ref.child('pub');
      const onPub = (snap) => {
        pub = snap.val();
        if (!pub) return;
        pub.kits = pub.kits || {};
        pub.names = pub.names || {};
        pub.ready = pub.ready || {};
        render();
      };
      pubRef.on('value', onPub, () => {});
      subs.push(() => pubRef.off('value', onPub));
      const secRef = ref.child('secrets/' + me);
      const onSec = (snap) => {
        secret = snap.val();
        render();
      };
      secRef.on('value', onSec, () => {});
      subs.push(() => secRef.off('value', onSec));
      const presAll = ref.child('presence');
      const onPres = (snap) => {
        presence = snap.val() || {};
        paintPresence();
      };
      presAll.on('value', onPres, () => {});
      subs.push(() => presAll.off('value', onPres));
      try {
        offsetRef = rtdb.ref('.info/serverTimeOffset');
        const onOff = (snap) => {
          const v = snap && snap.val();
          if (typeof v === 'number' && isFinite(v)) offset = v;
        };
        offsetRef.on('value', onOff);
        subs.push(() => offsetRef.off('value', onOff));
      } catch (e) {}
      presRef = ref.child('presence/' + me);
      const beat = () => {
        if (!stopped) presRef.set({ at: TS, online: true }).catch(() => {});
      };
      try {
        presRef.onDisconnect().set({ at: TS, online: false });
      } catch (e) {}
      beat();
      timers.push(setInterval(beat, 10000));
      timers.push(setInterval(loop, 1000));
      const onVis = () => {
        if (document.visibilityState === 'visible') beat();
      };
      document.addEventListener('visibilitychange', onVis);
      subs.push(() => document.removeEventListener('visibilitychange', onVis));
    }

    view.controls.innerHTML = `<div class="pen-wait"><div class="pen-prompt">${esc(tr('live.connecting', 'Joining the match…'))}</div></div>`;
    paintBoard([], null);
    liveCall('join', {
      matchId,
      opponentUid: opp,
      playerA: cfg.host ? me : opp,
      stake: cfg.host ? cfg.stake || 0 : undefined,
      bestOf: cfg.host ? s.bestOf : undefined,
      kit: s.kitA,
      name: myName(),
    })
      .then((r) => {
        if (r && r.serverNow) offset = Number(r.serverNow) - Date.now();
        if (!view.alive()) return;
        subscribe();
      })
      .catch((e) => {
        if (!view.alive()) return;
        left = true;
        view.controls.innerHTML = `<div class="pen-wait">
          <div class="pen-prompt">${esc(liveErrorText(e))}</div>
          <button type="button" class="pen-btn pen-btn--primary" data-home>${esc(tr('home', 'Back to menu'))}</button>
        </div>`;
        view.controls.querySelector('[data-home]').addEventListener('click', () => {
          view.close('done');
          setTimeout(openHome, 120);
        });
      });
  }

  // ---------------- home · settings · friend flows ----------------

  function levelLabel(l) {
    return { easy: tr('level.easy', 'Easy'), medium: tr('level.medium', 'Medium'), hard: tr('level.hard', 'Hard') }[l] || l;
  }

  function howToHtml() {
    return `<div class="pen-howto" aria-label="${esc(tr('howto.short', 'How to play in 20 seconds'))}">
      <div class="pen-howto-tile">
        <div class="pen-howto-art pen-howto-art--swipe" aria-hidden="true"><span class="pen-howto-ball"></span><span class="pen-howto-finger">👆</span></div>
        <div class="pen-howto-title">${esc(tr('howto.shoot', 'Swipe to shoot'))}</div>
        <div class="pen-howto-text">${esc(tr('howto.shootText', 'Or drag to aim and hold for power. Harder = wilder.'))}</div>
      </div>
      <div class="pen-howto-tile">
        <div class="pen-howto-art pen-howto-art--dive" aria-hidden="true"><span class="pen-howto-glove">🧤</span></div>
        <div class="pen-howto-title">${esc(tr('howto.dive', 'Pick your dive'))}</div>
        <div class="pen-howto-text">${esc(tr('howto.diveText', 'Tap a spot. Early covers more; late reacts to the ball.'))}</div>
      </div>
    </div>`;
  }

  let home = null;

  function openHome() {
    if (!Kit()) return startAiQuick();
    if (home && !home.closed) home.close();
    const s = settings();
    const rec = readJson(KEY_RECORD, { w: 0, l: 0 });
    const shell = Kit().openShell({ gameId: GAME, title: LABEL, subtitle: tr('home.sub', 'Sports') });
    home = shell;
    shell.render(`<div class="pk-page pen-home">
      <div class="pk-hero">
        <div class="pk-hero-mark">${typeof gameMarkHtml === 'function' ? gameMarkHtml(GAME, { size: 64 }) : '⚽'}</div>
        <div class="pk-hero-title">${esc(LABEL)}</div>
        <div class="pk-hero-sub">${esc(tr('home.tag', 'Five kicks each. Then sudden death.'))}</div>
      </div>
      ${howToHtml()}
      <div class="pk-modes">
        <button type="button" class="pk-mode pk-mode--primary" data-go="ai">
          <span class="pk-mode-title">${esc(tr('home.ai', 'Play vs AI'))}</span>
          <span class="pk-mode-sub">${esc(levelLabel(s.difficulty) + ' · ' + tr('sub.bestOf', 'Best of') + ' ' + s.bestOf)}</span>
        </button>
        <button type="button" class="pk-mode" data-go="friend">
          <span class="pk-mode-title">${esc(tr('home.friend', 'Play a friend'))}</span>
          <span class="pk-mode-sub">${esc(tr('home.friendSub', 'Same phone, challenge, or find an opponent'))}</span>
        </button>
        <button type="button" class="pk-link" data-go="settings">${esc(tr('home.settings', 'Settings'))}</button>
        ${rec.w + rec.l ? `<div class="pen-record">${esc(tr('home.record', 'vs AI') + ': ' + rec.w + 'W · ' + rec.l + 'L')}</div>` : ''}
      </div>
    </div>`);
    shell.body.querySelector('[data-go="ai"]').addEventListener('click', () => Kit().closeThen(shell, () => startAiQuick()));
    shell.body.querySelector('[data-go="friend"]').addEventListener('click', () => openFriendSheet(shell));
    shell.body.querySelector('[data-go="settings"]').addEventListener('click', () => openSettings(() => Kit().closeThen(shell, openHome)));
  }

  function startAiQuick(source) {
    const s = settings();
    startLocal({
      kind: 'ai',
      level: s.difficulty,
      bestOf: s.bestOf,
      names: { A: tr('you', 'You'), B: tr('ai', 'AI') + ' · ' + levelLabel(s.difficulty) },
      kits: { A: s.kitA, B: s.kitB },
      gloves: s.gloves,
      source: source || 'manch',
    });
  }

  function swatchesHtml(name, value, disabled) {
    return `<div class="pen-swatches" role="radiogroup" data-swatch="${esc(name)}">${Core()
      .KITS.map(
        (k) => `<button type="button" role="radio" aria-checked="${k.id === value}" aria-label="${esc(k.name)}" class="pen-kit-btn${k.id === value ? ' is-on' : ''}" data-v="${esc(k.id)}"${
          k.id === disabled ? ' disabled' : ''
        } style="--kit-a:${esc(k.primary)};--kit-b:${esc(k.secondary)}"><span class="pen-kit-shirt pen-kit-shirt--${esc(k.pattern)}"></span></button>`
      )
      .join('')}</div>`;
  }
  function glovesHtml(value) {
    return `<div class="pen-swatches" role="radiogroup" data-gloves>${Core()
      .GLOVES.map(
        (g) => `<button type="button" role="radio" aria-checked="${g === value}" aria-label="${esc(tr('gloves', 'Gloves'))}" class="pen-glove-btn${g === value ? ' is-on' : ''}" data-v="${esc(g)}" style="background:${esc(g)}"></button>`
      )
      .join('')}</div>`;
  }

  function openSettings(onDone) {
    const K = Kit();
    const st = settings();
    const paint = (body) => {
      body.innerHTML = `
        <div class="pk-field"><div class="pk-field-label">${esc(tr('set.difficulty', 'AI difficulty'))}</div>
          ${K.segHtml('difficulty', st.difficulty, [['easy', levelLabel('easy')], ['medium', levelLabel('medium')], ['hard', levelLabel('hard')]])}
          <div class="pk-field-help">${esc(tr('set.hardHelp', 'Hard reads your habits during a match.'))}</div></div>
        <div class="pk-field"><div class="pk-field-label">${esc(tr('set.length', 'Match length'))}</div>
          ${K.segHtml('bestOf', st.bestOf, [[3, tr('set.bo3', 'Best of 3')], [5, tr('set.bo5', 'Best of 5')], [10, tr('set.bo10', 'Best of 10')]])}
          <div class="pk-field-help">${esc(tr('set.lengthHelp', 'Level after that goes to sudden death. Live uses the challenger’s length.'))}</div></div>
        <div class="pk-field"><div class="pk-field-label">${esc(tr('set.kit', 'Your kit'))}</div>${swatchesHtml('kitA', st.kitA, st.kitB)}</div>
        <div class="pk-field"><div class="pk-field-label">${esc(tr('set.oppKit', 'Opponent kit'))}</div>${swatchesHtml('kitB', st.kitB, st.kitA)}</div>
        <div class="pk-field"><div class="pk-field-label">${esc(tr('set.gloves', 'Your gloves'))}</div>${glovesHtml(st.gloves)}</div>
        <button type="button" class="pk-btn pk-btn--primary" data-done>${esc(tr('set.done', 'Done'))}</button>`;
      K.wireSegs(body, st, () => saveSettings(st));
      body.querySelectorAll('[data-swatch]').forEach((grp) => {
        grp.querySelectorAll('[data-v]').forEach((b) =>
          b.addEventListener('click', () => {
            st[grp.dataset.swatch] = b.dataset.v;
            saveSettings(st);
            paint(body);
          })
        );
      });
      body.querySelectorAll('[data-gloves] [data-v]').forEach((b) =>
        b.addEventListener('click', () => {
          st.gloves = b.dataset.v;
          saveSettings(st);
          paint(body);
        })
      );
    };
    let finished = false;
    const sheet = K.openSheet({
      title: tr('set.title', 'Settings'),
      bodyHtml: '<div data-pen-settings></div>',
      onMount: (el, close) => {
        const body = el.querySelector('[data-pen-settings]');
        paint(body);
        body.addEventListener('click', (e) => {
          if (e.target.closest('[data-done]')) close();
        });
      },
      onClose: () => {
        if (finished) return;
        finished = true;
        if (onDone) setTimeout(onDone, 60);
      },
    });
    return sheet;
  }

  function openFriendSheet(homeShell) {
    const K = Kit();
    K.openSheet({
      title: tr('friend.title', 'Play a friend'),
      bodyHtml: `<div class="pk-modes pen-friend-modes">
        <button type="button" class="pk-mode" data-f="pass"><span class="pk-mode-title">${esc(tr('friend.pass', 'On this phone'))}</span><span class="pk-mode-sub">${esc(
          tr('friend.passSub', 'Take turns — pass the phone to the keeper')
        )}</span></button>
        <button type="button" class="pk-mode" data-f="challenge"><span class="pk-mode-title">${esc(tr('friend.challenge', 'Challenge a friend'))}</span><span class="pk-mode-sub">${esc(
          tr('friend.challengeSub', 'Live on both phones · optional chip stake')
        )}</span></button>
        <button type="button" class="pk-mode" data-f="find"><span class="pk-mode-title">${esc(tr('friend.find', 'Find an opponent'))}</span><span class="pk-mode-sub">${esc(
          tr('friend.findSub', 'Matched by rating · friendly, no stake')
        )}</span></button>
      </div>`,
      onMount: (el, close) => {
        el.querySelector('[data-f="pass"]').addEventListener('click', () => {
          close();
          setTimeout(() => openPassSetup(homeShell), 60);
        });
        el.querySelector('[data-f="challenge"]').addEventListener('click', () => {
          close();
          setTimeout(() => challengeFriend(homeShell), 60);
        });
        el.querySelector('[data-f="find"]').addEventListener('click', () => {
          close();
          setTimeout(() => findOpponent(homeShell), 60);
        });
      },
    });
  }

  function openPassSetup(homeShell) {
    const K = Kit();
    const saved = readJson(KEY_NAMES, []);
    const n1 = saved[0] || (K.myName() ? K.myName().split(' ')[0] : '');
    const n2 = saved[1] || '';
    K.openSheet({
      title: tr('pass.title', 'Pass & Play'),
      bodyHtml: `<div class="pk-field"><div class="pk-field-label">${esc(tr('pass.kicksFirst', 'Kicks first'))}</div>
          <input class="pk-player-input" data-n="0" maxlength="20" value="${esc(n1)}" placeholder="${esc(tr('pass.p1', 'Player 1'))}" autocomplete="off"></div>
        <div class="pk-field"><div class="pk-field-label">${esc(tr('pass.second', 'Kicks second'))}</div>
          <input class="pk-player-input" data-n="1" maxlength="20" value="${esc(n2)}" placeholder="${esc(tr('pass.p2', 'Player 2'))}" autocomplete="off"></div>
        <div class="pk-field-help">${esc(tr('pass.help', 'You swap between kicker and keeper every kick. The keeper looks away while the kicker aims.'))}</div>
        <button type="button" class="pk-btn pk-btn--primary" data-start>${esc(tr('pass.start', 'Start shootout'))}</button>`,
      onMount: (el, close) => {
        el.querySelector('[data-start]').addEventListener('click', () => {
          const a = String(el.querySelector('[data-n="0"]').value || '').trim().slice(0, 20);
          const b = String(el.querySelector('[data-n="1"]').value || '').trim().slice(0, 20);
          writeJson(KEY_NAMES, [a, b]);
          let A = a || tr('pass.p1', 'Player 1');
          let B = b || tr('pass.p2', 'Player 2');
          if (A.toLowerCase() === B.toLowerCase()) B += ' 2';
          close();
          const s = settings();
          const go = () => startLocal({ kind: 'pass', bestOf: s.bestOf, names: { A, B }, kits: { A: s.kitA, B: s.kitB }, gloves: s.gloves, source: 'manch' });
          if (homeShell && !homeShell.closed) K.closeThen(homeShell, go);
          else go();
        });
      },
    });
  }

  function signedInOrPrompt() {
    const K = Kit();
    if (K.isSignedIn()) return true;
    if (typeof K.requireSignIn === 'function') K.requireSignIn();
    else toast(tr('signIn', 'Sign in to play online'));
    return false;
  }

  async function challengeFriend(homeShell) {
    const K = Kit();
    if (!signedInOrPrompt()) return;
    if (typeof openFriendPickerSheet !== 'function') return toast(tr('err.friends', 'Friends aren’t available right now'));
    const f = await openFriendPickerSheet({ title: tr('challenge.title', 'Challenge · ' + LABEL), subtitle: tr('challenge.sub', 'Live 1v1 · virtual chips only') });
    if (!f) return;
    const uid = f.uid || f.id || '';
    if (!persistable(uid)) return toast(tr('err.opp', 'Pick a real opponent'));
    let stake = 0;
    if (typeof openDangalStakeSheet === 'function' && (typeof stakesEnabledForGame !== 'function' || stakesEnabledForGame(GAME))) {
      const picked = await openDangalStakeSheet(GAME, { defaultStake: 0 });
      if (picked == null) return;
      stake = Number(picked) || 0;
    }
    const s = settings();
    const mid = cleanId(typeof dangalMatchId === 'function' ? dangalMatchId(GAME, { name: f.name, uid, opponentUid: uid }) : GAME + '_' + Date.now());
    const chatId = f.chatId || f.firestoreId || '';
    if (typeof sendChallengeCard === 'function' && chatId) {
      try {
        await sendChallengeCard(uid, GAME, { chatId, matchId: mid, stake, mode: tr('sub.bestOf', 'Best of') + ' ' + s.bestOf });
      } catch (e) {}
    }
    const go = () =>
      startLive({
        matchId: mid,
        opponentUid: uid,
        host: true,
        stake,
        oppName: f.name,
        chat: { name: f.name, id: chatId, firestoreId: chatId, uid, peerUid: uid, dangalMatchId: mid },
        source: 'challenge_host',
      });
    if (homeShell && !homeShell.closed) K.closeThen(homeShell, go);
    else go();
  }

  function findOpponent(homeShell) {
    const K = Kit();
    if (!signedInOrPrompt()) return;
    if (typeof findRealOpponent !== 'function') return toast(tr('err.mm', 'Matchmaking isn’t available right now'));
    let handle = null;
    let settled = false;
    const sheet = K.openSheet({
      title: tr('find.title', 'Finding an opponent'),
      bodyHtml: `<div class="pen-finding"><div class="pen-finding-ball" aria-hidden="true">⚽</div>
        <div class="pk-sub">${esc(tr('find.sub', 'Looking for someone near your rating…'))}</div>
        <button type="button" class="pk-btn pk-btn--ghost" data-cancel>${esc(tr('find.cancel', 'Cancel'))}</button></div>`,
      onMount: (el, close) => {
        el.querySelector('[data-cancel]').addEventListener('click', () => close());
      },
      onClose: () => {
        if (!settled && handle) handle.cancel();
      },
    });
    handle = findRealOpponent(
      { category: GAME, gameId: GAME },
      (m) => {
        settled = true;
        sheet.close();
        const go = () => {
          if (!m || m.simulated || !m.matchId || !persistable(m.uid)) {
            toast(tr('find.none', 'No one free right now — warming up against the AI'));
            return startAiQuick('matchmaking');
          }
          startLive({ matchId: m.matchId, opponentUid: m.uid, host: m.role === 'host', stake: 0, oppName: m.name, source: 'matchmaking' });
        };
        setTimeout(() => {
          if (homeShell && !homeShell.closed) K.closeThen(homeShell, go);
          else go();
        }, 80);
      },
      () => {
        settled = true;
      }
    );
  }

  // ---------------- registration ----------------

  function launch(opts) {
    const o = opts || {};
    if (!Core()) {
      toast(LABEL + ' ' + tr('loading', 'is still loading — try again'));
      return;
    }
    const chat = o.chat || null;
    const opp = o.opponentUid || (chat && (chat.uid || chat.peerUid)) || '';
    const mid = o.matchId || (chat && chat.dangalMatchId) || '';
    if ((o.mode === 'live' || /^challenge/.test(String(o.source || ''))) && mid && persistable(opp)) {
      return startLive({
        matchId: mid,
        opponentUid: opp,
        host: o.source !== 'challenge',
        stake: Number(o.stake) || 0,
        oppName: chat && chat.name,
        chat,
        source: o.source || 'challenge',
      });
    }
    if (o.practiceKind === 'vsAi') return startAiQuick(o.source || 'manch');
    return openHome();
  }

  if (typeof registerGame === 'function') {
    registerGame({
      id: 'penalty',
      name: LABEL,
      desc: 'Five kicks each, then sudden death — shoot and save',
      icon: '⚽',
      gameType: 'dual',
      genre: 'rw_sports',
      ratingKey: GAME,
      dangal: true,
      liveDuel: true,
      chat1v1: true,
      chatGroup: false,
      selfChat: true,
      ownHome: true,
      order: 22,
      meta: {
        core: 'penalty-core.js (outcome model + IFAB-style shootout, shared with the server)',
        live: 'penalty_kick → server-lib/penalty-engine.js; kick + dive stay server-side until both are in',
      },
      launch,
    });
  }

  window.openPenaltyShootout = launch;
  window.PenaltyGame = { createPitch, launch, startLocal, startLive, openHome };
})();
