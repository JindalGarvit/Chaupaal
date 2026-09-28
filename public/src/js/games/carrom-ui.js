/**
 * Carrom (Dangal P7) — rules based on the ICF Laws of Carrom.
 * vs AI (Easy / Normal / Hard) · Pass & Play (2 or 4, the board turns to each player) · Practice sandbox ·
 * Live singles (rated) and doubles 2v2 through a party room — the server runs the same physics
 * (carrom-physics.js) and rules (carrom-core.js); this screen animates the same input and snaps to it.
 */
(function () {
  'use strict';

  const GAME = 'carrom';
  const LABEL = 'Carrom';
  const SETUP_KEY = 'chaupaal_carrom_setup';
  const PREFS_KEY = 'chaupaal_carrom_prefs';
  const COACH_KEY = 'chaupaal_carrom_coach';
  const Core = () => window.CarromCore;
  const Phys = () => window.CarromPhysics;
  const CK = () => window.ClassicsKit;
  const Kit = () => window.PartyKit;
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  function tr(key, fallback) {
    return typeof t === 'function' ? t('carrom.' + key, fallback) : fallback;
  }
  const clone = (x) => JSON.parse(JSON.stringify(x));
  function toast(msg) {
    if (typeof showToast === 'function') showToast(msg);
  }
  const readJson = (k, fb) => (CK() ? CK().readJson(k, fb) : fb);
  const writeJson = (k, v) => CK() && CK().writeJson(k, v);

  const FRAME = 34; // drawn frame width (mm) around the 740 mm playing surface
  const WORLD = 740 + FRAME * 2;
  const COLORS = {
    w: { fill: '#F4EBD6', edge: '#BFA774', ring: '#D9C59A' },
    b: { fill: '#2A2522', edge: '#0E0C0B', ring: '#4A423C' },
    q: { fill: '#C4302B', edge: '#7A1A16', ring: '#E0645F' },
    s: { fill: '#EFE3C4', edge: '#8C6A3C', ring: '#C9AE7A' },
  };

  function prefs() {
    return Object.assign({ confirm: false }, readJson(PREFS_KEY, {}));
  }
  function variantLabel(v) {
    return v === 'quick' ? tr('quick', 'Quick') : v === 'freestyle' ? tr('freestyle', 'Freestyle') : tr('standard', 'Standard');
  }
  function variantNote(v) {
    if (v === 'quick') return tr('quickNote', 'One board, ICF rules. Rated in Live.');
    if (v === 'freestyle') return tr('freeNote', 'Casual: any man is yours. White 20, black 10, Queen 50. First to 160.');
    return tr('icfNote', 'ICF rules: first to 25 points or the leader after 8 boards.');
  }
  function colorName(c) {
    return c === 'w' ? tr('white', 'White') : c === 'b' ? tr('black', 'Black') : tr('queen', 'Queen');
  }

  // ---------------- sound + haptics ----------------

  let audio = null;
  function noise(dur, gain, freq, q) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const n = Math.floor(audio.sampleRate * dur);
      const buf = audio.createBuffer(1, n, audio.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
      const src = audio.createBufferSource();
      src.buffer = buf;
      const f = audio.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = q || 1;
      const g = audio.createGain();
      g.gain.value = gain;
      src.connect(f);
      f.connect(g);
      g.connect(audio.destination);
      src.start();
    } catch (e) {}
  }
  let lastSfx = 0;
  function sfx(kind, v) {
    const p = CK() ? CK().prefs() : { sound: true, haptics: true };
    const now = performance.now();
    if (p.sound && (kind !== 'click' || now - lastSfx > 25)) {
      lastSfx = now;
      const k = Math.max(0.15, Math.min(1, (v || 1) / 3));
      if (kind === 'click') noise(0.04, 0.35 * k, 2400, 2.5);
      else if (kind === 'cushion') noise(0.09, 0.3 * k, 380, 1.2);
      else if (kind === 'pocket') {
        noise(0.12, 0.35, 220, 1);
        setTimeout(() => noise(0.08, 0.2, 160, 1), 70);
      } else if (kind === 'flick') noise(0.05, 0.25, 1400, 1.5);
    }
    if (p.haptics && navigator.vibrate) {
      try {
        if (kind === 'pocket') navigator.vibrate(18);
        else if (kind === 'foul') navigator.vibrate([40, 40, 60]);
      } catch (e) {}
    }
  }

  // ---------------- geometry helpers ----------------

  function basis(side) {
    const P = Phys();
    return { f: P.FORWARD[side & 3], r: P.RIGHT[side & 3] };
  }
  /** Angle input (0.01°) for a board-direction vector, from `side`'s point of view. */
  function angleFor(side, dx, dy) {
    const { f, r } = basis(side);
    const u = dx * r[0] + dy * r[1];
    const v = dx * f[0] + dy * f[1];
    return Math.round((Math.atan2(u, v) * 18000) / Math.PI);
  }
  function dirOf(side, angle) {
    const s = Phys().strikerFromInput(side, { x: 0, angle, power: 1000 });
    const l = Math.sqrt(s.vx * s.vx + s.vy * s.vy) || 1;
    return [s.vx / l, s.vy / l];
  }
  function firstContact(pieces, sx, sy, dx, dy) {
    const P = Phys();
    const R = P.STRIKER_R + P.MAN_R;
    let best = Infinity;
    let hit = null;
    for (const m of pieces) {
      const fx = m.x / 100 - sx;
      const fy = m.y / 100 - sy;
      const tca = fx * dx + fy * dy;
      if (tca <= 0) continue;
      const d2 = fx * fx + fy * fy - tca * tca;
      if (d2 > R * R) continue;
      const tt = tca - Math.sqrt(R * R - d2);
      if (tt >= 0 && tt < best) {
        best = tt;
        hit = m;
      }
    }
    const lo = P.STRIKER_R;
    const hi = P.BOARD - P.STRIKER_R;
    let tw = Infinity;
    if (dx > 1e-9) tw = Math.min(tw, (hi - sx) / dx);
    else if (dx < -1e-9) tw = Math.min(tw, (lo - sx) / dx);
    if (dy > 1e-9) tw = Math.min(tw, (hi - sy) / dy);
    else if (dy < -1e-9) tw = Math.min(tw, (lo - sy) / dy);
    if (tw < best) return { x: sx + dx * tw, y: sy + dy * tw, wall: true };
    return { x: sx + dx * best, y: sy + dy * best, piece: hit };
  }

  // ---------------- canvas table ----------------

  /**
   * The board: static art cached once per size, pieces from sprites, rotation per viewer side.
   * Modes: 'idle' | 'aim' (my stroke) | 'place' (my due) | 'arrange' (Practice).
   */
  function createTable(host, o) {
    const P = Phys();
    const opts = o || {};
    const root = document.createElement('div');
    root.className = 'cr-table';
    const canvas = document.createElement('canvas');
    canvas.className = 'cr-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', tr('boardAria', 'Carrom board'));
    root.appendChild(canvas);
    host.appendChild(root);
    const ctx = canvas.getContext('2d');
    let css = 320;
    let dpr = 1;
    let scale = 1;
    let bg = null;
    const sprites = {};
    let side = 0;
    let pieces = [];
    let live = null; // bodies during an animation
    let mode = 'idle';
    let aim = null; // { side, x, angle, power, dragging }
    let preview = opts.preview || 'first';
    let ghost = null;
    let dirty = true;
    let raf = 0;
    let destroyed = false;
    let fullPath = null;
    let fullKey = '';
    let drag = null;
    const handlers = { aim: null, shoot: null, place: null, arrange: null };

    function size() {
      const w = host.clientWidth || 320;
      const vh = window.innerHeight || 640;
      css = Math.max(260, Math.min(w, 560, vh - 250));
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.style.width = css + 'px';
      canvas.style.height = css + 'px';
      canvas.width = Math.round(css * dpr);
      canvas.height = Math.round(css * dpr);
      scale = (css * dpr) / WORLD;
      bg = null;
      Object.keys(sprites).forEach((k) => delete sprites[k]);
      dirty = true;
    }

    // world (board mm, rotated) ↔ canvas px
    function toPx(bx, by) {
      const { f, r } = basis(side);
      const dx = bx - P.CENTRE;
      const dy = by - P.CENTRE;
      const wx = P.CENTRE + r[0] * dx + r[1] * dy;
      const wy = P.CENTRE - (f[0] * dx + f[1] * dy);
      return [(wx + FRAME) * scale, (wy + FRAME) * scale];
    }
    function toBoardPt(px, py) {
      const { f, r } = basis(side);
      const a = px / scale - FRAME - P.CENTRE;
      const b = py / scale - FRAME - P.CENTRE;
      return [P.CENTRE + a * r[0] - b * f[0], P.CENTRE + a * r[1] - b * f[1]];
    }
    function eventPt(e) {
      const rect = canvas.getBoundingClientRect();
      return toBoardPt((e.clientX - rect.left) * dpr, (e.clientY - rect.top) * dpr);
    }

    function drawBackground() {
      const c = document.createElement('canvas');
      c.width = canvas.width;
      c.height = canvas.height;
      const g = c.getContext('2d');
      const S = scale;
      const W = WORLD * S;
      const wood = g.createLinearGradient(0, 0, W, W);
      wood.addColorStop(0, '#6B4020');
      wood.addColorStop(1, '#3E2410');
      g.fillStyle = wood;
      g.beginPath();
      if (g.roundRect) g.roundRect(0, 0, W, W, 18 * S);
      else g.rect(0, 0, W, W);
      g.fill();
      const x0 = FRAME * S;
      const L = 740 * S;
      const surf = g.createRadialGradient(x0 + L / 2, x0 + L / 2, L * 0.1, x0 + L / 2, x0 + L / 2, L * 0.75);
      surf.addColorStop(0, '#F1D6A4');
      surf.addColorStop(1, '#DDB67C');
      g.fillStyle = surf;
      g.fillRect(x0, x0, L, L);
      g.strokeStyle = 'rgba(40,20,5,0.55)';
      g.lineWidth = 3 * S;
      g.strokeRect(x0, x0, L, L);
      const at = (bx, by) => [(bx + FRAME) * S, (by + FRAME) * S];
      const line = (a, b, w, col) => {
        g.strokeStyle = col;
        g.lineWidth = w * S;
        g.beginPath();
        g.moveTo(a[0], a[1]);
        g.lineTo(b[0], b[1]);
        g.stroke();
      };
      const circle = (cx, cy, rr, fill, stroke, w) => {
        g.beginPath();
        g.arc(cx, cy, rr * S, 0, Math.PI * 2);
        if (fill) {
          g.fillStyle = fill;
          g.fill();
        }
        if (stroke) {
          g.strokeStyle = stroke;
          g.lineWidth = (w || 1) * S;
          g.stroke();
        }
      };
      const ink = '#3B2412';
      const red = '#B3261E';
      // Baselines: two lines 101.5 and 133.3 mm from the frame, ending in the base circles.
      for (let k = 0; k < 4; k++) {
        const Pt = (u, dist) => {
          const p = P.toBoard(k, u, P.BASE_DEPTH - dist);
          return at(p[0], p[1]);
        };
        [101.5, 133.3].forEach((d) => line(Pt(-219.1, d), Pt(219.1, d), 1.2, ink));
        [-219.1, 219.1].forEach((u) => {
          const c0 = Pt(u, P.BASE_DEPTH);
          circle(c0[0], c0[1], 15.9, red, ink, 1.2);
          circle(c0[0], c0[1], 11, null, 'rgba(255,230,200,0.7)', 0.8);
        });
      }
      // Arrows at 45° from each corner toward the centre.
      [[0, 0, 1, 1], [740, 0, -1, 1], [740, 740, -1, -1], [0, 740, 1, -1]].forEach(([cx, cy, sx, sy]) => {
        const a = at(cx + sx * 72, cy + sy * 72);
        const b = at(cx + sx * 258, cy + sy * 258);
        line(a, b, 1.3, ink);
        const tip = at(cx + sx * 258, cy + sy * 258);
        circle(tip[0], tip[1], 9, null, ink, 1.2);
        const h1 = at(cx + sx * 72 + sx * 14, cy + sy * 72);
        const h2 = at(cx + sx * 72, cy + sy * 72 + sy * 14);
        line(a, h1, 1.3, ink);
        line(a, h2, 1.3, ink);
      });
      // Centre: outer circle (dues go inside) + the centre circle.
      const cc = at(370, 370);
      circle(cc[0], cc[1], 85, null, ink, 1.2);
      circle(cc[0], cc[1], 15.9, 'rgba(179,38,30,0.18)', red, 1.4);
      for (let i = 0; i < 8; i++) {
        const th = (i * Math.PI) / 4;
        line(at(370 + Math.cos(th) * 20, 370 + Math.sin(th) * 20), at(370 + Math.cos(th) * 60, 370 + Math.sin(th) * 60), 0.9, 'rgba(59,36,18,0.45)');
      }
      // Pockets.
      P.POCKETS.forEach(([px, py]) => {
        const p = at(px, py);
        const hole = g.createRadialGradient(p[0], p[1], 2 * S, p[0], p[1], P.POCKET_R * S);
        hole.addColorStop(0, '#000');
        hole.addColorStop(1, '#1d130b');
        circle(p[0], p[1], P.POCKET_R, null, null);
        g.fillStyle = hole;
        g.fill();
        circle(p[0], p[1], P.POCKET_R, null, 'rgba(0,0,0,0.6)', 1.5);
      });
      return c;
    }

    function sprite(c) {
      if (sprites[c]) return sprites[c];
      const rr = (c === 's' ? P.STRIKER_R : P.MAN_R) * scale;
      const n = Math.ceil(rr * 2 + 6);
      const sc = document.createElement('canvas');
      sc.width = n;
      sc.height = n;
      const g = sc.getContext('2d');
      const m = n / 2;
      const col = COLORS[c];
      g.beginPath();
      g.arc(m + rr * 0.08, m + rr * 0.12, rr, 0, Math.PI * 2);
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.fill();
      const grad = g.createRadialGradient(m - rr * 0.35, m - rr * 0.35, rr * 0.1, m, m, rr);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.18, col.fill);
      grad.addColorStop(1, col.edge);
      g.beginPath();
      g.arc(m, m, rr, 0, Math.PI * 2);
      g.fillStyle = grad;
      g.fill();
      g.strokeStyle = col.ring;
      g.lineWidth = Math.max(1, rr * 0.1);
      g.beginPath();
      g.arc(m, m, rr * 0.62, 0, Math.PI * 2);
      g.stroke();
      if (c === 'q' || c === 's') {
        g.beginPath();
        g.arc(m, m, rr * 0.25, 0, Math.PI * 2);
        g.fillStyle = col.ring;
        g.fill();
      }
      sprites[c] = sc;
      return sc;
    }
    function drawDisc(c, bx, by, alpha) {
      const sp = sprite(c);
      const p = toPx(bx, by);
      if (alpha != null) ctx.globalAlpha = alpha;
      ctx.drawImage(sp, p[0] - sp.width / 2, p[1] - sp.height / 2);
      if (alpha != null) ctx.globalAlpha = 1;
    }
    function strikerPos(a) {
      return P.toBoard(a.side, a.x / 10, 0);
    }

    function computeFull() {
      const key = JSON.stringify([aim.side, aim.x, aim.angle, aim.power, pieces.length, pieces[0] && pieces[0].x]);
      if (key === fullKey) return fullPath;
      fullKey = key;
      const sim = P.createSim(pieces, P.strikerFromInput(aim.side, aim), {});
      const trails = {};
      let guard = 0;
      while (!sim.done && guard++ < 400) {
        sim.step(12);
        sim.bodies().forEach((b) => {
          if (!b.moving && !(trails[b.id] && trails[b.id].length)) return;
          (trails[b.id] = trails[b.id] || []).push([b.x, b.y, b.alive]);
        });
      }
      fullPath = trails;
      return trails;
    }

    function draw() {
      dirty = false;
      if (!bg) bg = drawBackground();
      // The art is 4-fold symmetric, so the cached background never needs rotating.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(bg, 0, 0);
      if (mode === 'place') {
        const cc = toPx(370, 370);
        ctx.beginPath();
        ctx.arc(cc[0], cc[1], 85 * scale, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(46,160,90,0.18)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(46,160,90,0.9)';
        ctx.lineWidth = 2 * dpr;
        ctx.stroke();
      }
      const list = live || pieces.map((p) => ({ id: p.id, c: p.c, x: p.x / 100, y: p.y / 100, alive: true }));
      list.forEach((b) => {
        if (b.alive && b.c !== 's') drawDisc(b.c, b.x, b.y);
      });
      if (live) {
        live.forEach((b) => {
          if (b.alive && b.c === 's') drawDisc('s', b.x, b.y);
        });
      }
      if (!live && mode === 'aim' && aim) drawAim();
      if (!live && mode === 'place' && ghost) drawDisc(ghost.c, ghost.x, ghost.y, ghost.ok ? 0.75 : 0.35);
    }

    function drawAim() {
      const s = strikerPos(aim);
      const d = dirOf(aim.side, aim.angle);
      const hasAim = aim.power > 0 || aim.set;
      if (hasAim && preview === 'full') {
        const trails = computeFull();
        Object.keys(trails).forEach((id) => {
          const tr0 = trails[id];
          if (tr0.length < 2) return;
          ctx.beginPath();
          tr0.forEach((pt, i) => {
            const p = toPx(pt[0], pt[1]);
            if (i === 0) ctx.moveTo(p[0], p[1]);
            else ctx.lineTo(p[0], p[1]);
          });
          ctx.strokeStyle = id === 'S' ? 'rgba(255,255,255,0.85)' : id === 'q' ? 'rgba(196,48,43,0.8)' : 'rgba(30,110,200,0.75)';
          ctx.lineWidth = 1.6 * dpr;
          ctx.setLineDash([5 * dpr, 4 * dpr]);
          ctx.stroke();
          ctx.setLineDash([]);
        });
      } else if (hasAim) {
        // Live: honest first-contact line only.
        const fc = firstContact(pieces, s[0], s[1], d[0], d[1]);
        const a = toPx(s[0], s[1]);
        const b = toPx(fc.x, fc.y);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 1.6 * dpr;
        ctx.setLineDash([6 * dpr, 5 * dpr]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(b[0], b[1], P.STRIKER_R * scale, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1.2 * dpr;
        ctx.stroke();
      }
      if (aim.dragging && aim.power > 0) {
        // Slingshot band behind the striker.
        const back = (aim.power / 1000) * 150;
        const a = toPx(s[0], s[1]);
        const b = toPx(s[0] - d[0] * back, s[1] - d[1] * back);
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.strokeStyle = aim.power > 800 ? 'rgba(214,69,65,0.9)' : 'rgba(255,196,0,0.9)';
        ctx.lineWidth = 4 * dpr;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.lineCap = 'butt';
      }
      drawDisc('s', s[0], s[1]);
      const sp = toPx(s[0], s[1]);
      ctx.beginPath();
      ctx.arc(sp[0], sp[1], (P.STRIKER_R + 3) * scale, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.5 * dpr;
      ctx.stroke();
    }

    function loop() {
      raf = 0;
      if (destroyed) return;
      if (dirty) draw();
    }
    function invalidate() {
      dirty = true;
      if (!raf && !destroyed) raf = requestAnimationFrame(loop);
    }

    // ---------------- input ----------------

    function onDown(e) {
      if (live) return;
      const pt = eventPt(e);
      if (mode === 'aim' && aim) {
        const s = strikerPos(aim);
        const near = Math.hypot(pt[0] - s[0], pt[1] - s[1]) < P.STRIKER_R * 1.9;
        drag = { kind: near ? 'move' : 'pull', id: e.pointerId, start: pt };
        if (!near) {
          aim.dragging = true;
          aim.set = false;
        }
      } else if (mode === 'place') {
        drag = { kind: 'place', id: e.pointerId };
        updateGhost(pt);
      } else if (mode === 'arrange') {
        const hit = pieces.find((m) => Math.hypot(m.x / 100 - pt[0], m.y / 100 - pt[1]) < P.MAN_R * 1.3);
        if (hit) drag = { kind: 'arrange', id: e.pointerId, piece: hit };
      } else return;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (err) {}
      e.preventDefault();
      onMove(e);
    }
    function onMove(e) {
      if (!drag || drag.id !== e.pointerId) return;
      const pt = eventPt(e);
      if (drag.kind === 'move') {
        const { r } = basis(aim.side);
        const c0 = P.toBoard(aim.side, 0, 0);
        const u = (pt[0] - c0[0]) * r[0] + (pt[1] - c0[1]) * r[1];
        setStrikerX(Math.round(u * 10));
      } else if (drag.kind === 'pull') {
        const s = strikerPos(aim);
        const dx = s[0] - pt[0];
        const dy = s[1] - pt[1];
        const dist = Math.hypot(dx, dy);
        if (dist > 4) aim.angle = Math.max(-18000, Math.min(18000, angleFor(aim.side, dx, dy)));
        aim.power = Math.max(0, Math.min(1000, Math.round(((dist - 6) / 150) * 1000)));
        if (handlers.aim) handlers.aim(aim);
        invalidate();
      } else if (drag.kind === 'place') updateGhost(pt);
      else if (drag.kind === 'arrange') {
        const lo = P.MAN_R + 1;
        const hi = P.BOARD - P.MAN_R - 1;
        drag.piece.x = Math.round(Math.max(lo, Math.min(hi, pt[0])) * 100);
        drag.piece.y = Math.round(Math.max(lo, Math.min(hi, pt[1])) * 100);
        invalidate();
      }
      e.preventDefault();
    }
    function onUp(e) {
      if (!drag || drag.id !== e.pointerId) return;
      const d = drag;
      drag = null;
      if (d.kind === 'pull') {
        aim.dragging = false;
        if (aim.power < 20) {
          aim.power = 0;
          aim.set = false;
        } else {
          aim.set = true;
          if (handlers.aim) handlers.aim(aim);
          if (!prefs().confirm && handlers.shoot) handlers.shoot(aim);
        }
        invalidate();
      } else if (d.kind === 'place') {
        if (ghost && ghost.ok && handlers.place) handlers.place(Math.round(ghost.x * 100), Math.round(ghost.y * 100));
      } else if (d.kind === 'arrange') {
        if (handlers.arrange) handlers.arrange(pieces);
      } else if (d.kind === 'move' && handlers.aim) handlers.aim(aim);
    }
    function updateGhost(pt) {
      if (!ghost) return;
      ghost.x = pt[0];
      ghost.y = pt[1];
      ghost.ok = Core().placeSpot(pieces, Math.round(pt[0] * 100), Math.round(pt[1] * 100)).ok;
      invalidate();
    }
    function setStrikerX(x) {
      if (!aim) return;
      const nx = Core().nearestLegal(pieces, aim.side, x);
      if (nx == null) return;
      aim.x = nx;
      if (handlers.aim) handlers.aim(aim);
      invalidate();
    }

    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    const onResize = () => {
      size();
      invalidate();
    };
    window.addEventListener('resize', onResize);
    size();
    invalidate();

    /** Animate one stroke from `before` with `input`; resolves with the local result. */
    function play(before, input, shooterSide, speed) {
      return new Promise((resolve) => {
        const sim = P.createSim(before, P.strikerFromInput(shooterSide, input), { events: true });
        const k = speed || 1;
        let last = performance.now();
        let acc = 0;
        mode = 'idle';
        sfx('flick');
        live = sim.bodies();
        const frame = (now) => {
          if (destroyed) return resolve(sim.result());
          acc += Math.min(64, now - last) * k;
          last = now;
          const n = Math.floor(acc);
          acc -= n;
          if (n > 0) sim.step(n);
          sim.drainEvents().forEach((ev) => {
            if (ev.k === 'hit') sfx('click', ev.v);
            else if (ev.k === 'cushion') sfx('cushion', ev.v);
            else if (ev.k === 'pocket') sfx('pocket');
          });
          live = sim.bodies();
          draw();
          if (sim.done) {
            live = null;
            resolve(sim.result());
          } else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
    }

    return {
      root,
      canvas,
      setSide(s) {
        if (side !== s) {
          side = s;
          invalidate();
        }
      },
      get side() {
        return side;
      },
      setPieces(list) {
        pieces = clone(list || []);
        fullKey = '';
        invalidate();
      },
      get pieces() {
        return pieces;
      },
      setPreview(p) {
        preview = p;
        invalidate();
      },
      aimAt(a) {
        mode = 'aim';
        aim = Object.assign({ power: 0, set: false, dragging: false }, a);
        const nx = Core().nearestLegal(pieces, aim.side, aim.x);
        if (nx != null) aim.x = nx;
        ghost = null;
        invalidate();
        return aim;
      },
      get aim() {
        return aim;
      },
      nudge(dx, dAngle, dPower) {
        if (!aim) return;
        if (dx) {
          const want = aim.x + dx;
          const ok = Core().strikerSpot(pieces, aim.side, want).ok;
          if (ok) aim.x = want;
          else setStrikerX(want);
        }
        if (dAngle) aim.angle = Math.max(-18000, Math.min(18000, aim.angle + dAngle));
        if (dPower) aim.power = Math.max(0, Math.min(1000, aim.power + dPower));
        if (dAngle || dPower) aim.set = aim.power > 0;
        invalidate();
      },
      setStrikerX,
      placeMode(c) {
        mode = 'place';
        aim = null;
        ghost = { c, x: -100, y: -100, ok: false };
        invalidate();
      },
      arrangeMode(on) {
        mode = on ? 'arrange' : 'idle';
        invalidate();
      },
      idle() {
        mode = 'idle';
        aim = null;
        ghost = null;
        invalidate();
      },
      get mode() {
        return mode;
      },
      on(name, fn) {
        handlers[name] = fn;
      },
      play,
      invalidate,
      destroy() {
        destroyed = true;
        window.removeEventListener('resize', onResize);
        if (raf) cancelAnimationFrame(raf);
      },
    };
  }

  // ---------------- game view (HUD + table + controls), shared by local and Live ----------------

  /**
   * @param {HTMLElement} host
   * @param {{
   *   mine: (st) => number[], viewSide: (st) => number, preview: 'first'|'full', hint?: boolean,
   *   practice?: boolean, live?: boolean,
   *   onShoot: (seat, input) => any, onPlace: (seat, x, y) => any, onForgo: (seat) => any,
   *   onIdle?: (st) => void, onHud?: (el) => void, onNextBoard?: () => void,
   *   footer?: (st, el) => void, menu?: () => {id,label,run}[], label?: string,
   * }} o
   */
  function createView(host, o) {
    host.innerHTML = `<div class="cr-game">
      <div class="cr-hud" data-hud></div>
      <div class="cr-board" data-board></div>
      <div class="cr-controls" data-controls></div>
      <div class="cr-foot" data-foot></div>
    </div>`;
    const hudEl = host.querySelector('[data-hud]');
    const ctlEl = host.querySelector('[data-controls]');
    const footEl = host.querySelector('[data-foot]');
    const table = createTable(host.querySelector('[data-board]'), { preview: o.preview });
    let st = null;
    let lastNo = -1;
    let queue = Promise.resolve();
    let animating = 0;
    let predicted = null;
    let pendingShot = false;
    let gameBest = null;
    let replaying = false;
    let destroyed = false;
    // What the screen last showed — local games mutate one state object, so never compare against it.
    let shown = null;
    const lastX = {};
    let coach = Number(readJson(COACH_KEY, 0)) || 0;

    function mySeat() {
      if (!st || st.over) return -1;
      const mine = o.mine(st);
      if (st.phase === 'shot' && mine.indexOf(st.turn) >= 0) return st.turn;
      if (st.phase === 'place' && st.place[0] && mine.indexOf(st.place[0].seat) >= 0) return st.place[0].seat;
      return -1;
    }

    function hudHtml() {
      const C = Core();
      const b = st.board;
      const turnTeam = !st.over && st.seats[st.turn] ? st.seats[st.turn].team : -1;
      const team = (T) => {
        const c = b.colors[T];
        const names = st.seats
          .filter((x) => x.team === T)
          .map((x) => esc(x.name) + (x.bot && !/^Bot\b/.test(x.name) ? ` <span class="cl-tag">${esc(tr('bot', 'Bot'))}</span>` : '') + (o.live ? `<span class="pk-dot" data-presence="${esc(x.id)}"></span>` : ''))
          .join(' · ');
        return `<div class="cr-team${turnTeam === T ? ' is-turn' : ''}"><span class="cr-dot cr-dot--${c}" aria-label="${esc(colorName(c))}"></span><span class="cr-team-names">${names}</span><b class="cr-team-score">${st.scores[T]}</b></div>`;
      };
      const target = st.variant === 'freestyle' ? C.FREE_TARGET : st.variant === 'quick' ? null : C.GAME_POINTS;
      const mid = o.practice ? tr('freePlay', 'Free play') : st.variant === 'quick' ? tr('oneBoard', 'One board') : tr('board', 'Board') + ' ' + b.no + (st.variant === 'freestyle' ? '' : '/' + C.GAME_BOARDS + (st.extra ? ' +' : '')) + (target ? ' · ' + tr('to', 'to') + ' ' + target : '');
      const me = mySeat();
      let banner = st.note || '';
      let tone = '';
      if (st.over) {
        tone = 'end';
      } else if (me >= 0 && st.phase === 'shot') {
        tone = 'you';
        banner = (o.mine(st).length > 1 ? st.seats[me].name + ' — ' : '') + (b.broken ? tr('yourShot', 'Your shot') : tr('yourBreak', 'Your break') + (b.tries ? ' · ' + tr('try', 'try') + ' ' + (b.tries + 1) + '/3' : ''));
      } else if (me >= 0 && st.phase === 'place') {
        tone = 'you';
        banner = (o.mine(st).length > 1 ? st.seats[me].name + ' — ' : '') + tr('placeDue', 'Place the due: tap inside the outer circle');
      }
      const q = b.queen;
      const queenChip =
        q.s === 'covered'
          ? `<span class="cr-chip cr-chip--q">${esc(tr('queenCovered', 'Queen covered'))} · ${esc(C.teamName(st, q.by))}</span>`
          : q.s === 'pending'
            ? `<span class="cr-chip cr-chip--q is-hot">${esc(tr('queenCover', 'Queen — cover it next!'))}</span>`
            : `<span class="cr-chip">${esc(tr('queenOn', 'Queen on board'))}</span>`;
      const dues = ['w', 'b']
        .filter((c) => b.due[c] > 0)
        .map((c) => `<span class="cr-chip cr-chip--due">${esc(colorName(c))} ${esc(tr('owes', 'owes'))} ${b.due[c]}</span>`)
        .join('');
      const men =
        st.variant === 'freestyle'
          ? ''
          : `<span class="cr-chip"><span class="cr-dot cr-dot--w"></span>${9 - b.pocketed.w.length}</span><span class="cr-chip"><span class="cr-dot cr-dot--b"></span>${9 - b.pocketed.b.length}</span>`;
      const history = st.boards.length
        ? `<details class="cr-history"><summary>${esc(tr('boards', 'Boards'))} (${st.boards.length})</summary><div class="cr-history-list">${st.boards
            .map((x) => `<span>${esc(tr('b', 'B'))}${x.no}: ${x.winner == null ? '—' : esc(C.teamName(st, x.winner)) + ' +' + x.pts}${x.queen != null ? ' ♛' : ''}</span>`)
            .join('')}</div></details>`
        : '';
      return `<div class="cr-teams">${team(0)}<div class="cr-mid">${esc(mid)}</div>${team(1)}</div>
        <div class="cr-chips">${men}${queenChip}${dues}</div>
        <div class="cl-banner cr-banner" role="status" aria-live="polite" data-tone="${tone}">${esc(banner)}${o.live && !st.over ? ' <span class="cl-timer pk-timer" data-timer></span>' : ''}</div>
        ${tone === 'you' && st.note && st.note !== banner ? `<div class="cr-note">${esc(st.note)}</div>` : ''}
        ${history}`;
    }

    function controlsHtml(seat) {
      const coachLine = coach < 3 ? `<p class="cl-note cr-coach">${esc(tr('coach', 'Drag the striker along your line. Pull back anywhere on the board to aim; let go to shoot.'))}</p>` : '';
      if (st.over || seat < 0) {
        if (st.phase === 'boardOver' || st.over) return '';
        const who = st.phase === 'place' && st.place[0] ? st.seats[st.place[0].seat] : st.seats[st.turn];
        return `<p class="cr-wait">${esc(who ? who.name : '')} ${esc(st.phase === 'place' ? tr('placing', 'is placing a due…') : tr('aiming', 'is aiming…'))}</p>`;
      }
      if (st.phase === 'place') {
        const job = st.place[0];
        return `<div class="cr-place"><p class="cl-note">${esc(tr('placeHow', 'Tap inside the green circle to place the'))} ${esc(colorName(job.c).toLowerCase())} ${esc(tr('man', 'man'))}${job.n > 1 ? ' (' + job.n + ')' : ''}.</p>
          <button type="button" class="pk-btn pk-btn--ghost" data-forgo>${esc(tr('forgo', 'Let it go'))}</button></div>`;
      }
      const a = table.aim || {};
      return `<div class="cr-aim">
        ${coachLine}
        <div class="cr-power" aria-label="${esc(tr('power', 'Power'))}"><div class="cr-power-fill" data-power style="width:${Math.round((a.power || 0) / 10)}%"></div><span data-power-label>${esc(tr('power', 'Power'))} ${Math.round((a.power || 0) / 10)}%</span></div>
        <input type="range" class="cr-slide" data-slide min="${-Core().U_LIMIT}" max="${Core().U_LIMIT}" step="5" value="${a.x || 0}" aria-label="${esc(tr('position', 'Striker position'))}">
        <div class="pk-row cr-aim-row">
          <button type="button" class="pk-btn pk-btn--primary" data-shoot ${a.set && a.power > 0 ? '' : 'disabled'}>${esc(tr('shoot', 'Shoot'))}</button>
          ${o.hint ? `<button type="button" class="pk-btn pk-btn--ghost" data-hint>${esc(tr('hint', 'Hint'))}</button>` : ''}
          <button type="button" class="pk-btn pk-btn--ghost" data-fine aria-expanded="false">${esc(tr('fine', 'Fine-tune'))}</button>
        </div>
        <div class="cr-fine" data-fine-box hidden>
          <div class="cr-fine-group"><span>${esc(tr('position', 'Position'))}</span><button type="button" class="pk-chip" data-n="x:-10" aria-label="${esc(tr('left', 'Left'))}">◀</button><button type="button" class="pk-chip" data-n="x:10" aria-label="${esc(tr('right', 'Right'))}">▶</button></div>
          <div class="cr-fine-group"><span>${esc(tr('angle', 'Angle'))}</span><button type="button" class="pk-chip" data-n="a:-25" aria-label="${esc(tr('turnLeft', 'Turn left'))}">↺</button><button type="button" class="pk-chip" data-n="a:25" aria-label="${esc(tr('turnRight', 'Turn right'))}">↻</button></div>
          <div class="cr-fine-group"><span>${esc(tr('power', 'Power'))}</span><button type="button" class="pk-chip" data-n="p:-20">−</button><button type="button" class="pk-chip" data-n="p:20">+</button></div>
        </div>
      </div>`;
    }

    function syncAimUi() {
      const a = table.aim;
      if (!a) return;
      const fill = ctlEl.querySelector('[data-power]');
      if (fill) fill.style.width = Math.round(a.power / 10) + '%';
      const lab = ctlEl.querySelector('[data-power-label]');
      if (lab) lab.textContent = tr('power', 'Power') + ' ' + Math.round(a.power / 10) + '%';
      const sl = ctlEl.querySelector('[data-slide]');
      if (sl && document.activeElement !== sl) sl.value = a.x;
      const btn = ctlEl.querySelector('[data-shoot]');
      if (btn) btn.disabled = !(a.set && a.power > 0) || pendingShot;
      lastX[a.seat] = a.x;
    }

    function shoot() {
      const a = table.aim;
      const seat = mySeat();
      if (!a || seat < 0 || pendingShot || animating || replaying || !(a.power > 0)) return;
      const input = { x: a.x, angle: a.angle, power: a.power };
      pendingShot = true;
      if (coach < 3) writeJson(COACH_KEY, (coach += 1));
      table.idle();
      syncAimUi();
      if (o.live) {
        // Animate at once with the same input; the server's result replaces it if anything differs.
        predicted = { seat, input: clone(input), no: (st.shotNo || 0) + 1, before: clone(st.board.pieces), side: st.seats[seat].side };
        animating += 1;
        const run = table.play(predicted.before, input, predicted.side).then((res) => {
          predicted.res = res;
          animating -= 1;
          table.setPieces(res.pieces);
        });
        queue = queue.then(() => run);
      }
      Promise.resolve(o.onShoot(seat, input)).then((ok) => {
        pendingShot = false;
        if (ok === false) {
          predicted = null;
          queue = queue.then(() => {
            table.setPieces(st.board.pieces);
            render();
          });
        }
      });
    }

    function wireControls(seat) {
      const f = ctlEl;
      f.querySelector('[data-forgo]')?.addEventListener('click', () => o.onForgo(seat));
      f.querySelector('[data-shoot]')?.addEventListener('click', shoot);
      const sl = f.querySelector('[data-slide]');
      if (sl)
        sl.addEventListener('input', () => {
          table.setStrikerX(Number(sl.value));
          syncAimUi();
        });
      const fineBtn = f.querySelector('[data-fine]');
      if (fineBtn)
        fineBtn.addEventListener('click', () => {
          const box = f.querySelector('[data-fine-box]');
          box.hidden = !box.hidden;
          fineBtn.setAttribute('aria-expanded', String(!box.hidden));
        });
      f.querySelectorAll('[data-n]').forEach((btn) =>
        btn.addEventListener('click', () => {
          const [k, v] = btn.dataset.n.split(':');
          const n = Number(v);
          table.nudge(k === 'x' ? n : 0, k === 'a' ? n : 0, k === 'p' ? n : 0);
          syncAimUi();
        })
      );
      f.querySelector('[data-hint]')?.addEventListener('click', () => {
        const seatNow = mySeat();
        if (seatNow < 0) return;
        const hint = Core().botShot(st, seatNow, 'hard', CK().seededRng(CK().newSeed()), { noNoise: true });
        const a = table.aimAt({ seat: seatNow, side: st.seats[seatNow].side, x: hint.x, angle: hint.angle, power: hint.power, set: true });
        a.set = true;
        syncAimUi();
        toast(tr('hintToast', 'Suggested shot lined up — tap Shoot or adjust'));
      });
    }

    function renderFoot() {
      footEl.innerHTML = '';
      if (st.phase === 'boardOver' && !st.over) {
        const last = st.boards[st.boards.length - 1];
        const line = last ? (last.winner == null ? tr('boardDrawn', 'Board over') : Core().teamName(st, last.winner) + ' ' + tr('takeBoard', 'take the board') + ' +' + last.pts) : '';
        footEl.innerHTML = `<div class="cr-boardover"><div class="cr-boardover-line">${esc(line)}</div>
          <div class="pk-row">${o.onNextBoard ? `<button type="button" class="pk-btn pk-btn--primary" data-nextboard>${esc(tr('nextBoard', 'Next board'))}</button>` : `<span class="cr-wait">${esc(tr('nextSoon', 'Next board in a moment…'))}</span>`}
          ${st.board.best ? `<button type="button" class="pk-btn pk-btn--ghost" data-replay>${esc(tr('replay', 'Replay best shot'))}</button>` : ''}
          <button type="button" class="pk-btn pk-btn--ghost" data-shareboard>${esc(tr('share', 'Share'))}</button></div></div>`;
        footEl.querySelector('[data-nextboard]')?.addEventListener('click', () => o.onNextBoard());
        footEl.querySelector('[data-replay]')?.addEventListener('click', () => replay(st.board.best));
        footEl.querySelector('[data-shareboard]')?.addEventListener('click', () => CK().shareWin(GAME, LABEL, line + ' · ' + tr('board', 'Board') + ' ' + (last ? last.no : '')));
      }
      if (o.footer) {
        const box = document.createElement('div');
        footEl.appendChild(box);
        o.footer(st, box, { replayBest: gameBest ? () => replay(gameBest) : null });
      }
      const menu = o.menu ? o.menu() : [];
      if (menu.length) {
        const row = document.createElement('div');
        row.className = 'cr-menu';
        row.innerHTML = menu.map((m, i) => `<button type="button" class="pk-link" data-menu="${i}">${esc(m.label)}</button>`).join('');
        row.querySelectorAll('[data-menu]').forEach((btn) => btn.addEventListener('click', () => menu[Number(btn.dataset.menu)].run()));
        footEl.appendChild(row);
      }
    }

    function render() {
      if (destroyed || !st) return;
      hudEl.innerHTML = hudHtml();
      if (o.onHud) o.onHud(hudEl);
      const seat = mySeat();
      if (!replaying) {
        table.setPieces(st.board.pieces);
        const vs = o.viewSide(st);
        table.setSide(vs);
        if (seat >= 0 && st.phase === 'shot') {
          const side = st.seats[seat].side;
          const keep = table.aim && table.aim.seat === seat && table.mode === 'aim';
          if (!keep) table.aimAt({ seat, side, x: lastX[seat] != null ? lastX[seat] : 0, angle: 0, power: 0 });
        } else if (seat >= 0 && st.phase === 'place') table.placeMode(st.place[0].c);
        else if (o.practice && table.mode === 'arrange') {
          /* keep arranging */
        } else table.idle();
      }
      ctlEl.innerHTML = replaying ? `<p class="cr-wait">${esc(tr('replaying', 'Replaying the best shot…'))}</p>` : controlsHtml(seat);
      if (!replaying) wireControls(seat);
      syncAimUi();
      renderFoot();
      shown = { side: o.viewSide(st), phase: st.phase, note: st.note, mine: seat >= 0 };
      if (!animating && o.onIdle) o.onIdle(st);
    }

    function replay(best) {
      if (!best || replaying || animating) return;
      replaying = true;
      render();
      table.setSide(o.viewSide(st));
      table.play(best.before, best.input, best.side, 0.35).then(() => {
        replaying = false;
        render();
      });
    }

    table.on('aim', () => syncAimUi());
    table.on('shoot', () => shoot());
    table.on('place', (x, y) => {
      const seat = mySeat();
      if (seat >= 0) o.onPlace(seat, x, y);
    });

    function sameInput(a, b) {
      return a && b && a.x === b.x && a.angle === b.angle && a.power === b.power;
    }

    return {
      table,
      /** New state: animate unseen strokes in order, then snap to the state's pieces and re-render. */
      update(next) {
        const first = !st;
        st = next;
        if (o.onHud && !first) o.onHud(hudEl);
        const b = st.board;
        if (b && b.best && (!gameBest || b.best.n > gameBest.n)) gameBest = clone(b.best);
        const fresh = (st.log || []).filter((e) => e.no > lastNo);
        if (first || lastNo < 0) {
          lastNo = (st.log || []).reduce((m, e) => Math.max(m, e.no), 0);
          queue = queue.then(render);
          return queue;
        }
        const before = shown || { side: o.viewSide(st), phase: st.phase, note: '', mine: false };
        fresh.forEach((e) => {
          lastNo = Math.max(lastNo, e.no);
          const pre = predicted && predicted.no === e.no && predicted.seat === e.seat && sameInput(predicted.input, e.input) ? predicted : null;
          if (pre) {
            predicted = null;
            return;
          }
          animating += 1;
          queue = queue.then(() => {
            table.idle();
            table.setSide(before.side);
            return table.play(e.before, e.input, e.side).then(() => {
              animating -= 1;
            });
          });
        });
        const pocketed = fresh.reduce((n, e) => n + (e.pocketed || []).filter((c) => c !== 's').length, 0);
        const foul = fresh.some((e) => (e.pocketed || []).indexOf('s') >= 0) || (st.note !== before.note && /foul|ran out of time/i.test(st.note || ''));
        queue = queue.then(() => {
          if (foul) sfx('foul');
          else if (pocketed && fresh.length) CK().fx('place');
          if (!st.over && !before.mine && mySeat() >= 0) CK().fx('turn');
          render();
        });
        return queue;
      },
      render,
      replay,
      get state() {
        return st;
      },
      get busy() {
        return animating > 0 || pendingShot || replaying;
      },
      mySeat,
      destroy() {
        destroyed = true;
        table.destroy();
      },
      get root() {
        return host;
      },
    };
  }

  // ---------------- local games (vs AI · Pass & Play · Practice) ----------------

  function loadSetup() {
    return Object.assign({ variant: 'icf', level: 'normal', players: 2, youBreak: 'toss' }, readJson(SETUP_KEY, {}));
  }

  function startLocal(opts) {
    const K = Kit();
    const C = Core();
    const o = Object.assign({}, opts);
    const kind = o.kind || 'bot';
    const practice = kind === 'practice';
    const vsBot = kind === 'bot';
    const variant = practice ? 'icf' : o.variant || 'icf';
    const rng = CK().seededRng(CK().newSeed());
    const me = (K && K.myName()) || tr('you', 'You');
    let players;
    if (vsBot) players = [{ id: 'p0', name: me }, { id: 'bot', name: tr('bot', 'Bot') + ' · ' + CK().levelLabel(o.level), bot: true, level: o.level }];
    else if (practice) players = [{ id: 'p0', name: me }, { id: 'p1', name: tr('practice', 'Practice') }];
    else if (Number(o.players) === 4) players = [1, 2, 3, 4].map((n) => ({ id: 'p' + n, name: tr('player', 'Player') + ' ' + n }));
    else players = [{ id: 'p1', name: tr('player', 'Player') + ' 1' }, { id: 'p2', name: tr('player', 'Player') + ' 2' }];
    let breaker = 0;
    if (vsBot) breaker = o.youBreak === 'you' ? 0 : o.youBreak === 'bot' ? 1 : rng() < 0.5 ? 0 : 1;
    else if (!practice) breaker = Math.floor(rng() * players.length);
    let st = C.newGame(players, { variant, breaker });
    if (!practice) st.note = players[breaker].name + ' ' + tr('breaksWhite', 'won the toss and breaks with white.');
    else st.note = tr('practiceNote', 'Practice: shoot freely. Arrange moves men; the full path preview is on.');
    let botTimer = null;
    let recorded = false;
    let arranging = false;
    const title = practice ? tr('practice', 'Practice') : vsBot ? tr('vsBot', 'vs Bot') + ' · ' + CK().levelLabel(o.level) : tr('pass', 'Pass & Play');
    const shell = K.openShell({
      gameId: GAME,
      title: LABEL,
      subtitle: title + (practice ? '' : ' · ' + variantLabel(variant)),
      confirmLeave: () => !practice && !st.over && st.shotNo > 0,
      leaveBody: tr('leaveLocal', 'This game will end.'),
      onClose: () => {
        clearTimeout(botTimer);
        view.destroy();
      },
    });
    const host = shell.render('<div class="pk-page cr-page" data-cr></div>').querySelector('[data-cr]');
    const humanSeats = () => st.seats.map((s, i) => (s.bot ? -1 : i)).filter((i) => i >= 0);

    /** Practice keeps the physics and pocket bookkeeping but never ends: you always shoot next. */
    function practiceReset() {
      const last = st.log[st.log.length - 1];
      st.turn = 0;
      st.nextTurn = 0;
      st.phase = 'shot';
      st.place = [];
      st.over = false;
      st.winner = null;
      st.scores = [0, 0];
      st.boards = [];
      st.board.due = { w: 0, b: 0 };
      if (!st.board.pieces.some((p) => p.c !== 'q')) C.newBoard(st, 0);
      st.note = last ? last.msg.replace(/\s*(Shoot again\.|Your turn\.|[^.]*’s turn\.)\s*$/, '') : '';
    }

    const view = createView(host, {
      mine: () => (practice ? [0] : humanSeats()),
      viewSide: (s) => {
        if (vsBot || practice) return 0;
        const actor = s.phase === 'place' && s.place[0] ? s.place[0].seat : s.turn;
        return s.seats[actor] ? s.seats[actor].side : 0;
      },
      preview: practice ? 'full' : 'first',
      hint: practice || vsBot,
      practice,
      label: title,
      onShoot(seat, input) {
        const out = C.shoot(st, seat, input);
        if (out.error) {
          CK().fx('invalid');
          toast(out.error === 'illegal_position' ? tr('illegal', 'The striker can’t sit there') : tr('cantShoot', 'Can’t shoot right now'));
          view.render();
          return false;
        }
        if (practice) practiceReset();
        view.update(st);
        return true;
      },
      onPlace(seat, x, y) {
        const out = C.placeMan(st, seat, x, y);
        if (out.error) {
          CK().fx('invalid');
          return toast(tr('badSpot', 'Inside the outer circle, off the centre, touching nothing'));
        }
        CK().fx('place');
        view.update(st);
      },
      onForgo(seat) {
        C.forgo(st, seat);
        view.update(st);
      },
      onNextBoard() {
        C.nextBoard(st, rng);
        view.update(st);
      },
      onIdle: () => schedule(),
      footer(s, el, extra) {
        if (practice) {
          el.innerHTML = `<div class="pk-row cr-practice">
            <button type="button" class="pk-btn pk-btn--ghost" data-arrange aria-pressed="${arranging}">${esc(arranging ? tr('doneArrange', 'Done arranging') : tr('arrange', 'Arrange men'))}</button>
            <button type="button" class="pk-btn pk-btn--ghost" data-reset>${esc(tr('reset', 'Reset board'))}</button>
          </div>`;
          el.querySelector('[data-arrange]').addEventListener('click', () => {
            arranging = !arranging;
            view.table.arrangeMode(arranging);
            if (!arranging) view.render();
            else el.querySelector('[data-arrange]').textContent = tr('doneArrange', 'Done arranging');
          });
          el.querySelector('[data-reset]').addEventListener('click', () => {
            arranging = false;
            const sc = st.scores.slice();
            C.newBoard(st, 0);
            st.scores = sc;
            st.note = tr('practiceNote', 'Practice: shoot freely. Arrange moves men; the full path preview is on.');
            view.update(st);
          });
          return;
        }
        if (!s.over) return;
        const won = s.winner != null && humanSeats().some((i) => s.seats[i].team === s.winner);
        const line = resultLine(s, vsBot ? 0 : null);
        if (!recorded) {
          recorded = true;
          CK().fx(!vsBot || won ? 'win' : 'lose');
          if (vsBot && typeof recordGameResult === 'function') recordGameResult(GAME, won, false);
        }
        el.innerHTML = `<div class="cl-result"><div class="cr-result-line">${esc(line)}</div>
          <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-again>${esc(tr('again', 'Play again'))}</button>
          <div class="pk-row">${extra.replayBest ? `<button type="button" class="pk-btn pk-btn--ghost" data-best>${esc(tr('replay', 'Replay best shot'))}</button>` : ''}
          <button type="button" class="pk-btn pk-btn--ghost" data-share>${esc(tr('share', 'Share'))}</button>
          <button type="button" class="pk-btn pk-btn--ghost" data-home>${esc(tr('change', 'Change mode'))}</button></div></div>`;
        el.querySelector('[data-again]').addEventListener('click', () => K.closeThen(shell, () => startLocal(o)));
        el.querySelector('[data-home]').addEventListener('click', () => K.closeThen(shell, () => openHome({})));
        el.querySelector('[data-best]')?.addEventListener('click', extra.replayBest);
        el.querySelector('[data-share]').addEventListener('click', () => CK().shareWin(GAME, LABEL, line + ' · ' + variantLabel(variant) + (vsBot ? ' vs ' + CK().levelLabel(o.level) + ' ' + tr('botLower', 'bot') : '')));
      },
      menu: () => [
        { label: tr('rules', 'Rules'), run: () => openRules(variant, Number(o.players) === 4 ? 'doubles' : 'singles') },
        { label: tr('settings', 'Settings'), run: openPrefs },
      ],
    });

    view.table.on('arrange', (list) => {
      st.board.pieces = clone(list);
    });

    function schedule() {
      clearTimeout(botTimer);
      if (practice || st.over || shell.closed) return;
      if (st.phase === 'boardOver' && vsBot) return;
      const actor = st.phase === 'place' && st.place[0] ? st.place[0].seat : st.phase === 'shot' ? st.turn : -1;
      if (actor < 0 || !st.seats[actor].bot) return;
      botTimer = setTimeout(() => {
        if (shell.closed || view.busy) return schedule();
        if (st.phase === 'place') {
          const spot = C.botPlace(st, rng);
          if (spot) C.placeMan(st, actor, spot.x, spot.y);
          else C.forgo(st, actor);
          CK().fx('place');
          view.update(st);
          return;
        }
        const input = C.botShot(st, actor, st.seats[actor].level, rng);
        // Show the bot lining up for a moment so the shot reads.
        view.table.aimAt({ seat: actor, side: st.seats[actor].side, x: input.x, angle: input.angle, power: input.power, set: true });
        setTimeout(() => {
          if (shell.closed) return;
          view.table.idle();
          C.shoot(st, actor, input);
          view.update(st);
        }, CK().ms(650));
      }, CK().ms(st.phase === 'place' ? 700 : 900));
    }

    view.update(st);
  }

  function resultLine(st, meTeam) {
    const C = Core();
    if (st.winner == null) return tr('drawn', 'Game drawn');
    const score = st.scores[0] + '–' + st.scores[1];
    const how = st.result === 'left' ? ' · ' + tr('oppLeft', 'opponent left') : st.result === 'resign' ? ' · ' + tr('resigned', 'resignation') : st.result === 'afk' ? ' · ' + tr('timeouts', 'timeouts') : '';
    if (meTeam != null) return (st.winner === meTeam ? tr('youWin', 'You win') : tr('youLose', 'You lose')) + ' ' + score + how;
    return C.teamName(st, st.winner) + ' ' + tr('win', 'win') + ' ' + score + how;
  }

  function openRules(variant, mode) {
    if (window.DangalRules && window.DangalRules.openSheet) window.DangalRules.openSheet(GAME, { variants: { variant: variant || 'icf', mode: mode || 'singles' } });
  }

  function openPrefs() {
    const K = Kit();
    const p = prefs();
    const ck = CK().prefs();
    K.openSheet({
      title: tr('settings', 'Settings'),
      bodyHtml: `<div class="cl-prefs">
        <label class="cl-pref"><span>${esc(tr('confirmPref', 'Confirm before shooting (tap Shoot after aiming)'))}</span><input type="checkbox" data-p="confirm" ${p.confirm ? 'checked' : ''}></label>
        <label class="cl-pref"><span>${esc(tr('soundPref', 'Sounds'))}</span><input type="checkbox" data-ck="sound" ${ck.sound ? 'checked' : ''}></label>
        <label class="cl-pref"><span>${esc(tr('hapticPref', 'Vibration'))}</span><input type="checkbox" data-ck="haptics" ${ck.haptics ? 'checked' : ''}></label>
      </div>`,
      onMount(el) {
        el.querySelector('[data-p="confirm"]').addEventListener('change', (e) => writeJson(PREFS_KEY, Object.assign(prefs(), { confirm: e.target.checked })));
        el.querySelectorAll('[data-ck]').forEach((box) => box.addEventListener('change', () => CK().setPref(box.dataset.ck, box.checked)));
      },
    });
  }

  function openLocalSheet(kind, onGo) {
    const K = Kit();
    const s = loadSetup();
    const levels = Core().LEVELS.map((l) => [l, CK().levelLabel(l)]);
    K.openSheet({
      title: kind === 'bot' ? tr('vsBot', 'Play vs bot') : tr('pass', 'Pass & Play'),
      bodyHtml: `<div class="cl-setup">
        <div class="cl-sub">${esc(tr('rulesLabel', 'Rules'))}</div>
        <div data-v>${K.segHtml('variant', s.variant, Core().VARIANTS.map((v) => [v, variantLabel(v)]))}</div>
        <p class="cl-note" data-vnote>${esc(variantNote(s.variant))}</p>
        ${
          kind === 'bot'
            ? `<div class="cl-sub">${esc(tr('botLevel', 'Bot level'))}</div>${K.segHtml('level', s.level, levels)}
               <div class="cl-sub">${esc(tr('whoBreaks', 'Who breaks'))}</div>${K.segHtml('youBreak', s.youBreak, [['toss', tr('toss', 'Toss')], ['you', tr('you', 'You')], ['bot', tr('bot', 'Bot')]])}`
            : `<div class="cl-sub">${esc(tr('players', 'Players'))}</div>${K.segHtml('players', Number(s.players) === 4 ? 4 : 2, [[2, tr('two', '2 · singles')], [4, tr('four', '4 · doubles')]])}
               <p class="cl-note">${esc(tr('passNote', 'The board turns to face whoever shoots next.'))}</p>`
        }
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-go>${esc(tr('start', 'Start'))}</button>
      </div>`,
      onMount(el, close) {
        K.wireSegs(el, s, () => {
          el.querySelector('[data-vnote]').textContent = variantNote(s.variant);
        });
        el.querySelector('[data-go]').addEventListener('click', () => {
          s.players = Number(s.players) === 4 ? 4 : 2;
          writeJson(SETUP_KEY, s);
          close();
          setTimeout(() => onGo(Object.assign({ kind }, s)), 80);
        });
      },
    });
  }

  // ---------------- Live room ----------------

  function roomSettings(ctrl) {
    return Object.assign({ variant: 'icf', mode: 'singles', stake: 0, botLevel: 'normal', pair: 0 }, (ctrl.view.pub && ctrl.view.pub.settings) || {});
  }
  function lobbySummary(ctrl) {
    const s = roomSettings(ctrl);
    const rated = s.mode === 'singles' && s.variant !== 'freestyle';
    return [variantLabel(s.variant), s.mode === 'doubles' ? tr('doubles', 'Doubles 2v2') : tr('singles', 'Singles'), rated ? tr('rated', 'rated') : tr('unrated', 'unrated'), CK().stakeLabel(Number(s.stake) || 0)].join(' · ');
  }
  function doublesOrder(ids, pair) {
    const others = [0, 1, 2].map((i) => ids[i + 1] || null);
    const p = Math.max(0, Math.min(2, pair || 0));
    const rest = others.filter((_, i) => i !== p);
    return [ids[0], rest[0], others[p], rest[1]];
  }
  function lobbyListHtml(ctrl, players) {
    const s = roomSettings(ctrl);
    if (s.mode !== 'doubles') return '';
    const order = doublesOrder(players.map((p) => p.id), s.pair);
    const name = (id) => (id ? esc(ctrl.name(id)) + (id === ctrl.uid ? ` <span class="pk-badge pk-badge--me">${esc(tr('you', 'You'))}</span>` : '') : `<span class="cr-botseat">${esc(tr('bot', 'Bot'))} · ${esc(CK().levelLabel(s.botLevel))}</span>`);
    return `<div class="cr-lobby-teams">
      <div class="cr-lobby-team"><span class="cr-dot cr-dot--w"></span>${name(order[0])} &amp; ${name(order[2])}</div>
      <div class="cr-lobby-vs">${esc(tr('vs', 'vs'))}</div>
      <div class="cr-lobby-team"><span class="cr-dot cr-dot--b"></span>${name(order[1])} &amp; ${name(order[3])}</div>
      <p class="cl-note">${esc(tr('teamsNote', 'Partners sit opposite. Colours are decided by the toss. Empty seats are filled by bots (then no chips move).'))}</p>
    </div>`;
  }
  function openRoomSettings(ctrl) {
    const K = Kit();
    const cur = roomSettings(ctrl);
    const paint = (el) => {
      el.querySelector('[data-dbl]').hidden = cur.mode !== 'doubles';
      el.querySelector('[data-vnote]').textContent = variantNote(cur.variant) + (cur.mode === 'singles' && cur.variant !== 'freestyle' ? ' ' + tr('ratedNote', 'Rated.') : ' ' + tr('unratedNote', 'Unrated.'));
    };
    const players = ctrl.players();
    const partnerOpts = [0, 1, 2].map((i) => {
      const p = players[i + 1];
      return [i, p ? p.name : tr('botSeat', 'Bot seat') + ' ' + (i + 1)];
    });
    K.openSheet({
      title: tr('roomSettings', 'Room settings'),
      bodyHtml: `<div class="cl-setup">
        <div class="cl-sub">${esc(tr('rulesLabel', 'Rules'))}</div>${K.segHtml('variant', cur.variant, Core().VARIANTS.map((v) => [v, variantLabel(v)]))}
        <p class="cl-note" data-vnote></p>
        <div class="cl-sub">${esc(tr('players', 'Players'))}</div>${K.segHtml('mode', cur.mode, [['singles', tr('singles', 'Singles')], ['doubles', tr('doubles', 'Doubles 2v2')]])}
        <div data-dbl>
          <div class="cl-sub">${esc(tr('yourPartner', 'Host’s partner'))}</div>${K.segHtml('pair', cur.pair, partnerOpts)}
          <div class="cl-sub">${esc(tr('botLevelSeats', 'Bots for empty seats'))}</div>${K.segHtml('botLevel', cur.botLevel, Core().LEVELS.map((l) => [l, CK().levelLabel(l)]))}
        </div>
        <div class="cl-sub">${esc(tr('stake', 'Stake'))}</div>${K.segHtml('stake', cur.stake, CK().STAKES.map((n) => [n, n ? '⚡' + n : tr('friendly', 'Friendly')]))}
        <p class="cl-note">${esc(tr('stakeNote', 'Winner takes the stake. Virtual chips only, never with bots.'))}</p>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-save>${esc(tr('save', 'Save'))}</button>
      </div>`,
      onMount(el, close) {
        paint(el);
        K.wireSegs(el, cur, () => paint(el));
        el.querySelector('[data-save]').addEventListener('click', async () => {
          cur.pair = Number(cur.pair) || 0;
          cur.stake = Number(cur.stake) || 0;
          const out = await ctrl.act('settings', { settings: cur });
          if (out) close();
        });
      },
    });
  }

  function renderLive(ctrl, st) {
    const pub = ctrl.view.pub;
    const meSeat = Core().seatOfUid(st, ctrl.uid);
    const mounted = ctrl.cr && ctrl.cr.round === pub.roundNo && ctrl.shell.el.contains(ctrl.cr.view.root);
    if (!mounted) {
      if (ctrl.cr) ctrl.cr.view.destroy();
      const body = ctrl.render('<div class="pk-page cr-page" data-cr></div>');
      const host = body.querySelector('[data-cr]');
      const view = createView(host, {
        live: true,
        mine: () => (meSeat >= 0 ? [meSeat] : []),
        viewSide: (s) => (meSeat >= 0 ? s.seats[meSeat].side : 0),
        preview: 'first',
        hint: false,
        onShoot: async (seat, input) => !!(await ctrl.act('shot', input)),
        onPlace: (seat, x, y) => ctrl.act('place', { x, y }),
        onForgo: () => ctrl.act('forgo'),
        onHud: (el) => {
          if (ctrl.timer) ctrl.timer.stop();
          ctrl.timer = null;
          ctrl.wire(el);
        },
        footer: (s, el, extra) => liveFooter(ctrl, s, el, extra),
        menu: () => {
          const s = roomSettings(ctrl);
          const items = [{ label: tr('rules', 'Rules'), run: () => openRules(s.variant, s.mode) }, { label: tr('settings', 'Settings'), run: openPrefs }];
          if (meSeat >= 0 && !(ctrl.cr && ctrl.cr.view.state && ctrl.cr.view.state.over)) {
            items.push({
              label: tr('resign', 'Resign'),
              run: async () => {
                const go = typeof confirmLeaveGame === 'function' ? await confirmLeaveGame({ title: tr('resignQ', 'Resign this game?'), body: tr('resignBody', 'The other side wins this game.') }) : true;
                if (go) ctrl.act('resign');
              },
            });
          }
          return items;
        },
      });
      ctrl.cr = { round: pub.roundNo, view };
      const close = ctrl.shell.close;
      if (!ctrl.crWrapped) {
        ctrl.crWrapped = true;
        ctrl.shell.close = function () {
          if (ctrl.cr) ctrl.cr.view.destroy();
          return close.apply(this, arguments);
        };
      }
    }
    ctrl.cr.view.update(st);
  }

  function liveFooter(ctrl, st, el, extra) {
    if (!st.over) return;
    const pub = ctrl.view.pub;
    const meSeat = Core().seatOfUid(st, ctrl.uid);
    const myTeam = meSeat >= 0 ? st.seats[meSeat].team : null;
    const set = pub.settlement;
    const r = set && set.results && set.results[ctrl.uid];
    if (ctrl.crFx !== pub.roundNo) {
      ctrl.crFx = pub.roundNo;
      if (myTeam != null) {
        const won = st.winner === myTeam;
        CK().fx(won ? 'win' : 'lose');
        if (typeof recordGameResult === 'function') recordGameResult(GAME, won, false);
      }
    }
    const line = resultLine(st, myTeam);
    const bits = [];
    if (r && r.chipDelta) bits.push(`<div class="cl-result-chips ${r.chipDelta > 0 ? 'is-up' : 'is-down'}">${r.chipDelta > 0 ? '+' : ''}${r.chipDelta} ${esc(tr('chips', 'virtual chips'))}</div>`);
    if (r && r.eloDelta) bits.push(`<div class="cr-elo">${esc(tr('rating', 'Rating'))} ${r.eloDelta > 0 ? '+' : ''}${r.eloDelta}</div>`);
    if (set && set.status === 'pending') bits.push(`<div class="cr-wait">${esc(tr('settling', 'Recording the result…'))}</div>`);
    el.innerHTML = `<div class="cl-result"><div class="cr-result-line">${esc(line)}</div>${bits.join('')}
      ${extra.replayBest ? `<button type="button" class="pk-btn pk-btn--ghost pk-btn--block" data-best>${esc(tr('replay', 'Replay best shot'))}</button>` : ''}
      ${Kit().roomResultActions(ctrl, { nextLabel: tr('rematch', 'Rematch'), waitLabel: tr('waitRematch', 'Waiting for the host to start a rematch…') })}</div>`;
    el.querySelector('[data-best]')?.addEventListener('click', extra.replayBest);
    Kit().wireRoomResultActions(ctrl, el, { nextOp: 'start', onShare: () => CK().shareWin(GAME, LABEL, line + ' · ' + variantLabel(st.variant)) });
  }

  function canStart(ctrl, players) {
    const s = roomSettings(ctrl);
    if (s.mode === 'doubles') {
      if (s.quick && players.length < 4 && !ctrl.fillOk) return { ok: false, label: tr('findingTeam', 'Finding players…') + ' ' + players.length + '/4' };
      const bots = Math.max(0, 4 - players.length);
      return { ok: true, label: bots ? tr('startBots', 'Start — bots fill') + ' ' + bots : tr('start', 'Start') };
    }
    if (players.length < 2) return { ok: false, label: s.quick ? tr('finding', 'Finding an opponent…') : tr('waitFriend', 'Waiting for your opponent to join') };
    if (players.length > 2) return { ok: false, label: tr('tooMany', 'Singles is 1v1 — switch to doubles') };
    return { ok: true, label: tr('start', 'Start') };
  }

  function openRoom(code, opts) {
    const o = opts || {};
    return Kit()
      .openRoomScreen({
        game: GAME,
        label: LABEL,
        code,
        join: !!o.join,
        min: 2,
        max: 4,
        hydrate: (s) => Core().hydrate(clone(s)),
        lobbySummary,
        lobbyListHtml,
        openSettings: openRoomSettings,
        canStart,
        renderPhase: renderLive,
        onLobbyMount(ctrl, body) {
          if (ctrl.cr) {
            ctrl.cr.view.destroy();
            ctrl.cr = null;
          }
          const s = roomSettings(ctrl);
          const players = ctrl.players();
          const need = s.mode === 'doubles' ? 4 : 2;
          const sec = body.querySelector('.pk-section');
          if (sec) sec.textContent = tr('inRoom', 'In the room') + ' · ' + players.length + '/' + need;
          if (!s.quick || !ctrl.isHost()) return;
          if (players.length >= need && !ctrl.autoStarted) {
            ctrl.autoStarted = true;
            setTimeout(() => ctrl.startWith('start'), 700);
          } else if (players.length < need) keepQueue(ctrl, s.mode);
          if (s.mode === 'doubles' && players.length >= 2 && !ctrl.fillOk) {
            // After a minute, let the host start with bots in the empty seats.
            clearTimeout(ctrl.fillTimer);
            ctrl.fillTimer = setTimeout(() => {
              ctrl.fillOk = true;
              const btn = ctrl.shell.closed ? null : ctrl.shell.el.querySelector('[data-start]');
              if (btn) {
                const c = canStart(ctrl, ctrl.players());
                btn.disabled = !c.ok;
                btn.textContent = c.label;
              }
            }, 60000);
          }
        },
      })
      .then((ctrl) => {
        if (ctrl && ctrl.shell) {
          const close = ctrl.shell.close;
          ctrl.shell.close = function () {
            clearTimeout(ctrl.fillTimer);
            if (ctrl.queueTimer) {
              clearInterval(ctrl.queueTimer);
              ctrl.queueTimer = null;
              Kit().roomCall(GAME, 'quick_cancel', { mode: roomSettings(ctrl).mode }).catch(() => {});
            }
            return close.apply(this, arguments);
          };
        }
        return ctrl;
      });
  }

  /** Quick-match host: keep the waiting slot fresh until the room fills. */
  function keepQueue(ctrl, mode) {
    if (ctrl.queueTimer) return;
    const started = Date.now();
    const need = mode === 'doubles' ? 4 : 2;
    ctrl.queueTimer = setInterval(async () => {
      if (ctrl.shell.closed || ctrl.players().length >= need || (ctrl.view.pub && ctrl.view.pub.status === 'playing')) {
        clearInterval(ctrl.queueTimer);
        ctrl.queueTimer = null;
        return;
      }
      if (Date.now() - started > 3 * 60 * 1000) {
        clearInterval(ctrl.queueTimer);
        ctrl.queueTimer = null;
        Kit().roomCall(GAME, 'quick_cancel', { mode }).catch(() => {});
        toast(tr('noOpp', 'No one’s around right now — challenge a friend instead'));
        return;
      }
      try {
        const r = await Kit().roomCall(GAME, 'quick', { mode, name: Kit().myName() || 'Player' });
        if (r.matched && r.code && r.code !== ctrl.view.code && ctrl.players().length < 2) {
          clearInterval(ctrl.queueTimer);
          ctrl.queueTimer = null;
          await ctrl.act('end');
          Kit().closeThen(ctrl.shell, () => openRoom(r.code, { join: true }));
        }
      } catch (e) {}
    }, 10000);
  }

  async function quickMatch(mode) {
    const K = Kit();
    if (!K.requireSignIn()) return;
    try {
      const r = await K.roomCall(GAME, 'quick', { mode, name: K.myName() || 'Player' });
      return openRoom(r.code, { join: !!r.matched });
    } catch (e) {
      toast(tr('quickFail', 'Couldn’t start matchmaking — try again'));
    }
  }

  function createRoom(chat, settings) {
    const s = Object.assign({ variant: loadSetup().variant, mode: 'singles', stake: 0 }, settings || {});
    Kit().createRoom({ game: GAME, label: LABEL, chat: chat || null, settings: s, open: (code) => openRoom(code, {}) });
  }

  function openOnlineSheet(chat) {
    const K = Kit();
    if (!K.requireSignIn()) return;
    K.openSheet({
      title: tr('online', 'Play online'),
      bodyHtml: `<div class="cl-setup">
        <button type="button" class="pk-mode pk-mode--primary" data-q="singles"><span class="pk-mode-title">${esc(tr('quickSingles', 'Quick match · 1v1'))}</span><span class="pk-mode-sub">${esc(tr('quickSinglesSub', 'Standard rules · rated'))}</span></button>
        <button type="button" class="pk-mode" data-q="doubles"><span class="pk-mode-title">${esc(tr('quickDoubles', 'Quick match · doubles'))}</span><span class="pk-mode-sub">${esc(tr('quickDoublesSub', '2v2 with strangers · unrated'))}</span></button>
        <button type="button" class="pk-mode" data-friend><span class="pk-mode-title">${esc(tr('friendRoom', 'Play friends'))}</span><span class="pk-mode-sub">${esc(tr('friendRoomSub', '1v1 or 2v2 room · choose rules and stake'))}</span></button>
      </div>`,
      onMount(el, close) {
        el.querySelectorAll('[data-q]').forEach((btn) =>
          btn.addEventListener('click', () => {
            close();
            setTimeout(() => quickMatch(btn.dataset.q), 80);
          })
        );
        el.querySelector('[data-friend]').addEventListener('click', () => {
          close();
          setTimeout(() => createRoom(chat), 80);
        });
      },
    });
  }

  // ---------------- home ----------------

  function openHome(o) {
    const K = Kit();
    const opts = o || {};
    const s = loadSetup();
    const shell = K.openShell({ gameId: GAME, title: LABEL, subtitle: tr('sub', 'Board') });
    shell.render(`<div class="pk-page pk-home">
      <div class="pk-hero">
        <div class="pk-hero-mark">${typeof gameMarkHtml === 'function' ? gameMarkHtml(GAME, { size: 64 }) : '🪙'}</div>
        <div class="pk-hero-title">${esc(LABEL)}</div>
        <div class="pk-hero-sub">${esc(tr('tag', 'Flick, pocket, cover the Queen. Rules based on the ICF Laws of Carrom.'))}</div>
      </div>
      <div class="pk-modes">
        <button type="button" class="pk-mode pk-mode--primary" data-go="bot"><span class="pk-mode-title">${esc(tr('vsBot', 'Play vs bot'))}</span><span class="pk-mode-sub">${esc(variantLabel(s.variant) + ' · ' + CK().levelLabel(s.level))}</span></button>
        <button type="button" class="pk-mode" data-go="online"><span class="pk-mode-title">${esc(tr('online', 'Play online'))}</span><span class="pk-mode-sub">${esc(tr('onlineSub', 'Quick match or friends · 1v1 rated · 2v2'))}</span></button>
        <button type="button" class="pk-mode" data-go="pass"><span class="pk-mode-title">${esc(tr('pass', 'Pass & Play'))}</span><span class="pk-mode-sub">${esc(tr('passSub', '2 or 4 players, one phone'))}</span></button>
        <div class="cl-home-links">
          <button type="button" class="pk-link" data-go="practice">${esc(tr('practice', 'Practice'))}</button>
          <button type="button" class="pk-link" data-go="join">${esc(tr('join', 'Have a room code? Join'))}</button>
          <button type="button" class="pk-link" data-go="change">${esc(tr('change', 'Change mode'))}</button>
          <button type="button" class="pk-link" data-go="rules">${esc(tr('rules', 'Rules'))}</button>
        </div>
      </div>
    </div>`);
    const b = shell.body;
    b.querySelector('[data-go="bot"]').addEventListener('click', () => K.closeThen(shell, () => startLocal(Object.assign({ kind: 'bot' }, loadSetup()))));
    b.querySelector('[data-go="change"]').addEventListener('click', () => openLocalSheet('bot', (x) => K.closeThen(shell, () => startLocal(x))));
    b.querySelector('[data-go="pass"]').addEventListener('click', () => openLocalSheet('pass', (x) => K.closeThen(shell, () => startLocal(x))));
    b.querySelector('[data-go="practice"]').addEventListener('click', () => K.closeThen(shell, () => startLocal({ kind: 'practice' })));
    b.querySelector('[data-go="rules"]').addEventListener('click', () => openRules(s.variant, 'singles'));
    b.querySelector('[data-go="online"]').addEventListener('click', () => openOnlineSheet(opts.chat));
    b.querySelector('[data-go="join"]').addEventListener('click', () => K.openJoinSheet((code) => K.closeThen(shell, () => openRoom(code, { join: true }))));
  }

  function launch(ctx) {
    const c = ctx || {};
    if (!Core() || !Phys() || !Kit() || !CK()) return toast(tr('loading', 'Carrom is still loading — try again'));
    const chat = typeof chatFromLaunch === 'function' ? chatFromLaunch(c) : c.chat;
    const inChat = chat && chat.id && chat.id !== 'ai' && (c.source === 'chat' || c.source === 'baithak' || chat.type === 'group' || chat.isGroup);
    if (c.practiceKind === 'vsAi' || c.mode === 'practice') return startLocal(Object.assign({ kind: 'bot' }, loadSetup()));
    if (inChat && Kit().isSignedIn()) return createRoom(chat);
    return openHome({ chat });
  }

  const lazy = (fn) => (Kit() && typeof Kit().withGameData === 'function' ? Kit().withGameData(GAME, fn) : fn);
  const openGame = lazy(launch);

  if (Kit() && typeof Kit().registerPartyGame === 'function') {
    Kit().registerPartyGame(GAME, { openRoom: (code, o) => lazy(openRoom)(code, { join: !!(o && o.join) }) });
  }
  if (typeof registerGame === 'function') {
    registerGame({
      id: 'carrom',
      name: 'Carrom',
      desc: 'ICF rules · bots · Live 1v1 rated · 2v2',
      icon: '🪙',
      ratingKey: 'carrom',
      gameType: 'dual',
      genre: 'board',
      dangal: true,
      liveDuel: true,
      chat1v1: true,
      selfChat: true,
      ownHome: true,
      order: 31,
      meta: {
        core: 'carrom-physics.js (deterministic, shared with the server) + carrom-core.js (ICF rules, bots)',
        live: 'party_room → server-lib/carrom-engine.js; server-simulated strokes, singles rated, doubles 2v2',
      },
      launch: openGame,
    });
  }

  window.CarromGame = { launch: openGame, openHome: lazy(openHome), openRoom: lazy(openRoom), startLocal: lazy(startLocal), quickMatch: lazy(quickMatch), _createTable: createTable };
  window.openCarrom = function (ctx) {
    openGame(Object.assign({ source: 'manch', mode: 'home' }, ctx || {}));
  };
})();
