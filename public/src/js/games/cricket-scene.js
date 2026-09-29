/**
 * Street Cricket scene — one canvas, two cameras:
 *   pitch cam (behind the batter): run-up, release, flight + bounce, the landing marker shown at
 *     release (the "read"), the timing band, the bat swing, stumps flying;
 *   field cam (top-down): the ball's path to the boundary, the nearest fielder chasing it.
 * Plus: slow-mo replay (wickets / sixes), the DRS view (simulated ball-tracking with the umpire's
 * call band; simulated edge detection for caught behind) and WebAudio bat / bounce / stumps /
 * crowd sounds (mutable). Draws only while something moves; devicePixelRatio aware.
 *
 * Off side is drawn on the left in both cameras (same as the wagon wheel).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CricketScene = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const COLORS = {
    grass: '#3E8E41',
    grassDark: '#2F7A33',
    pitch: { flat: '#D8C38E', green: '#B9C47E', dusty: '#D9B77A', tarmac: '#6B6F76' },
    crease: 'rgba(255,255,255,0.85)',
    stump: '#F4E3B5',
    ball: '#C62828',
    batter: '#1565C0',
    bowler: '#F9A825',
    fielder: '#FFFFFF',
    band: 'rgba(255,235,59,0.28)',
    bandHot: 'rgba(255,235,59,0.6)',
    marker: 'rgba(255,255,255,0.75)',
    rope: 'rgba(255,255,255,0.7)',
  };
  /** Line offsets at the batter's end, in pitch half-widths (negative = off side, drawn left). */
  const LINE_X = { off: -0.28, middle: 0, leg: 0.24, wide: -0.72 };
  const LENGTH_H = { yorker: 0.1, full: 0.25, good: 0.45, short: 0.75, bouncer: 1.05, fulltoss: 0.55 };

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

  // ---------------------------------------------------------------- audio

  let actx = null;
  let noiseBuf = null;
  function audio() {
    if (actx) return actx;
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    try {
      actx = new AC();
      noiseBuf = actx.createBuffer(1, actx.sampleRate * 1.5, actx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) {
      actx = null;
    }
    return actx;
  }
  function tone(ctx, type, freq, dur, gain, at) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(ctx.destination);
    o.start(at);
    o.stop(at + dur + 0.02);
  }
  function noise(ctx, dur, gain, filter, freq, at, swell) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    const g = ctx.createGain();
    if (swell) {
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(gain, at + dur * 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    } else {
      g.gain.setValueAtTime(gain, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    }
    src.connect(f).connect(g).connect(ctx.destination);
    src.start(at);
    src.stop(at + dur + 0.02);
  }
  const SOUND = {
    bat(ctx, at) {
      noise(ctx, 0.05, 0.5, 'highpass', 1500, at);
      tone(ctx, 'triangle', 880, 0.09, 0.35, at);
    },
    edge(ctx, at) {
      tone(ctx, 'triangle', 1400, 0.05, 0.2, at);
    },
    bounce(ctx, at) {
      tone(ctx, 'sine', 150, 0.07, 0.35, at);
    },
    stumps(ctx, at) {
      tone(ctx, 'square', 1200, 0.03, 0.15, at);
      tone(ctx, 'square', 900, 0.04, 0.12, at + 0.05);
    },
    crowd(ctx, at, big) {
      noise(ctx, big ? 1.8 : 1.1, big ? 0.3 : 0.18, 'bandpass', 700, at, true);
    },
    groan(ctx, at) {
      noise(ctx, 0.9, 0.12, 'lowpass', 400, at, true);
    },
  };

  // ---------------------------------------------------------------- scene

  /**
   * @param {HTMLElement} host  container; the canvas fills its width
   * @param {{ sound?: boolean, onBounce?: fn }} opts
   */
  function create(host, opts) {
    const o = opts || {};
    const canvas = document.createElement('canvas');
    canvas.className = 'sc-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    let W = 320;
    let H = 200;
    let dpr = 1;
    let raf = 0;
    let destroyed = false;
    let sound = o.sound !== false;
    const s = {
      cam: 'pitch',
      pitch: 'flat',
      field: 'balanced',
      ball: null, // { del, startAt, now, speed }
      swing: null, // { at, shot }
      hit: null, // { at, ev, dur }
      stumps: null, // particles
      drs: null,
      label: '',
      bouncedFor: -1,
      replaying: false,
      last: null,
    };

    function size() {
      const w = Math.max(240, Math.min(560, host.clientWidth || 320));
      const h = Math.round(w * 0.6);
      dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
      }
      W = w;
      H = h;
    }
    size();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => kick()) : null;
    if (ro) ro.observe(host);

    function play(kind, big) {
      if (!sound) return;
      const c = audio();
      if (!c) return;
      if (c.state === 'suspended') c.resume().catch(() => {});
      try {
        SOUND[kind](c, c.currentTime + 0.005, big);
      } catch (e) {}
    }

    // ---- geometry (pitch cam)
    const G = () => ({
      farY: H * 0.14,
      nearY: H * 0.9,
      farW: W * 0.12,
      nearW: W * 0.36,
      cx: W * 0.5,
    });
    function persp(p) {
      // p 0 = bowler's crease → 1 = batter's crease; screen y eased for depth.
      const g = G();
      const k = Math.pow(clamp(p, -0.2, 1.2), 1.35);
      return { y: lerp(g.farY, g.nearY, k), w: lerp(g.farW, g.nearW, k) };
    }

    function drawPitchCam(now) {
      const g = G();
      ctx.fillStyle = COLORS.grass;
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = i % 2 ? COLORS.grass : COLORS.grassDark;
        const y0 = lerp(0, H, i / 6);
        ctx.fillRect(0, y0, W, H / 6);
      }
      // strip
      ctx.fillStyle = COLORS.pitch[s.pitch] || COLORS.pitch.flat;
      ctx.beginPath();
      ctx.moveTo(g.cx - g.farW / 2, g.farY - H * 0.06);
      ctx.lineTo(g.cx + g.farW / 2, g.farY - H * 0.06);
      ctx.lineTo(g.cx + g.nearW / 2, H);
      ctx.lineTo(g.cx - g.nearW / 2, H);
      ctx.closePath();
      ctx.fill();
      // creases
      ctx.strokeStyle = COLORS.crease;
      ctx.lineWidth = 1.5;
      [0, 1].forEach((p) => {
        const q = persp(p);
        ctx.beginPath();
        ctx.moveTo(g.cx - q.w * 0.62, q.y);
        ctx.lineTo(g.cx + q.w * 0.62, q.y);
        ctx.stroke();
      });
      drawStumps(g.cx, persp(0).y, 0.45);
      // timing band: where the ball is when a perfect tap lands
      const b = s.ball;
      if (b && b.del) {
        const pz0 = persp(b.del.zoneStart).y;
        const pz1 = persp(b.del.zoneEnd).y;
        const pnow = progress(b, now);
        const hot = pnow >= b.del.zoneStart && pnow <= b.del.zoneEnd;
        ctx.fillStyle = hot ? COLORS.bandHot : COLORS.band;
        ctx.fillRect(0, Math.min(pz0, pz1), W, Math.abs(pz1 - pz0) || 2);
      }
      // bowler
      drawBowler(now);
      // landing marker (the read), from release
      if (b && b.del && progress(b, now) >= 0 && !s.hit) {
        const sp = persp(b.del.spot);
        const lx = g.cx + (LINE_X[b.del.line] || 0) * sp.w * 0.5;
        ctx.strokeStyle = COLORS.marker;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(lx, sp.y, sp.w * 0.06, sp.w * 0.025, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      // batter + near stumps
      drawBatter(now);
      if (s.stumps) drawParticles(now);
      else drawStumps(g.cx, persp(1).y + 4, 1);
      // ball
      if (b && b.del && !s.hit) drawBallInFlight(b, now);
    }

    function drawStumps(x, y, k) {
      ctx.fillStyle = COLORS.stump;
      const h = 34 * k;
      const gap = 5 * k;
      for (let i = -1; i <= 1; i++) ctx.fillRect(x + i * gap - 1.2 * k, y - h, 2.4 * k, h);
      ctx.fillRect(x - gap - 2 * k, y - h - 1.5 * k, gap * 2 + 4 * k, 1.5 * k);
    }

    function drawBowler(now) {
      const g = G();
      const b = s.ball;
      let p = -0.08;
      let arm = 0;
      if (b && b.del) {
        const t = (now - b.startAt) * (b.speed || 1);
        const run = clamp(t / b.del.runupMs, 0, 1);
        p = lerp(-0.2, -0.02, easeOut(run));
        arm = t >= b.del.runupMs * 0.85 && t < b.del.runupMs + 200 ? 1 : 0;
      }
      const q = persp(p);
      const x = g.cx + q.w * 0.18;
      const r = 3 + q.w * 0.03;
      ctx.fillStyle = COLORS.bowler;
      ctx.beginPath();
      ctx.arc(x, q.y - r * 3.2, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - r * 0.7, q.y - r * 2.3, r * 1.4, r * 2.3);
      ctx.strokeStyle = COLORS.bowler;
      ctx.lineWidth = Math.max(1.5, r * 0.45);
      ctx.beginPath();
      ctx.moveTo(x, q.y - r * 2);
      ctx.lineTo(x + (arm ? 0 : r * 1.4), q.y - r * (arm ? 4.6 : 1.2));
      ctx.stroke();
    }

    function drawBatter(now) {
      const g = G();
      const q = persp(1);
      const x = g.cx + q.w * 0.12;
      const y = q.y;
      const r = 7;
      ctx.fillStyle = COLORS.batter;
      ctx.beginPath();
      ctx.arc(x, y - r * 5.2, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - r * 0.9, y - r * 4.2, r * 1.8, r * 3.2);
      ctx.fillRect(x - r * 0.8, y - r * 1.1, r * 0.6, r * 1.1);
      ctx.fillRect(x + r * 0.2, y - r * 1.1, r * 0.6, r * 1.1);
      // bat: rest angle, swings through on a shot
      let a = -0.6;
      if (s.swing) {
        const t = (now - s.swing.at) / (s.swing.dur || 200);
        const to = s.swing.shot === 'defend' || s.swing.shot === 'leave' ? (s.swing.shot === 'leave' ? -1.6 : -0.1) : s.swing.shot === 'pull' || s.swing.shot === 'sweep' || s.swing.shot === 'flick' ? 1.9 : s.swing.shot === 'cut' ? -2.2 : 1.2;
        a = lerp(-0.6, to, easeOut(t));
      }
      ctx.save();
      ctx.translate(x - r * 0.4, y - r * 2.8);
      ctx.rotate(a);
      ctx.fillStyle = '#E8C77E';
      ctx.fillRect(-2, 0, 4, r * 4.2);
      ctx.restore();
    }

    function progress(b, now) {
      return ((now - b.startAt) * (b.speed || 1) - b.del.runupMs) / b.del.flightMs;
    }

    function drawBallInFlight(b, now) {
      const g = G();
      const p = progress(b, now);
      if (p < 0 || p > 1.15) return;
      const q = persp(p);
      const spot = b.del.spot;
      const endX = LINE_X[b.del.line] || 0;
      const x = g.cx + lerp(0.1, endX, clamp(p, 0, 1.1)) * q.w * 0.5;
      // height: release → bounce at spot → rise by length
      let h;
      if (p < spot) h = lerp(1, 0, p / spot) * 26 * (1 - p * 0.3);
      else h = Math.sin(clamp((p - spot) / Math.max(0.05, 1.12 - spot), 0, 1) * Math.PI * 0.5) * (LENGTH_H[b.del.length] || 0.45) * 40;
      if (b.del.length === 'fulltoss') h = lerp(26, 20, p);
      if (p >= spot && s.bouncedFor !== b.n && b.del.length !== 'fulltoss') {
        s.bouncedFor = b.n;
        play('bounce');
      }
      const r = 2.2 + q.w * 0.022;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(x, q.y, r * 1.1, r * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.ball;
      ctx.beginPath();
      ctx.arc(x, q.y - h, r, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawParticles(now) {
      const t = (now - s.stumps.at) / 1000;
      ctx.fillStyle = COLORS.stump;
      s.stumps.parts.forEach((pt) => {
        const x = pt.x + pt.vx * t;
        const y = pt.y + pt.vy * t + 380 * t * t;
        ctx.save();
        ctx.translate(x, Math.min(H - 3, y));
        ctx.rotate(pt.spin * t);
        ctx.fillRect(-pt.w / 2, -pt.h / 2, pt.w, pt.h);
        ctx.restore();
      });
    }

    // ---- field cam
    function fieldGeom() {
      const R = Math.min(W * 0.46, H * 0.46);
      return { cx: W / 2, cy: H * 0.52, R };
    }
    function polar(fg, angDeg, dist) {
      const a = (angDeg * Math.PI) / 180;
      // 0° = straight down the ground (up the screen); negative = off side (left).
      return { x: fg.cx + Math.sin(a) * dist * fg.R, y: fg.cy + fg.R * 0.18 - Math.cos(a) * dist * fg.R };
    }
    function drawFieldCam(now) {
      const fg = fieldGeom();
      ctx.fillStyle = COLORS.grassDark;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = COLORS.grass;
      ctx.beginPath();
      ctx.arc(fg.cx, fg.cy, fg.R, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = COLORS.rope;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(fg.cx, fg.cy, fg.R * 0.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COLORS.pitch[s.pitch] || COLORS.pitch.flat;
      const bat = polar(fg, 0, 0);
      ctx.fillRect(fg.cx - 4, bat.y - fg.R * 0.3, 8, fg.R * 0.32);
      const h = s.hit;
      const spots = (o.fieldSpots && o.fieldSpots[s.field]) || [];
      const t = h ? clamp((now - h.at) / h.dur, 0, 1) : 0;
      let ballPos = null;
      if (h) {
        const ev = h.ev;
        const dist = ev.behind ? 0.15 : ev.dist != null ? ev.dist : 0.5;
        const end = polar(fg, ev.dir || 0, dist);
        const k = easeOut(t);
        ballPos = { x: lerp(bat.x, end.x, k), y: lerp(bat.y, end.y, k), lift: ev.runs === 6 || ev.out === 'caught' ? Math.sin(t * Math.PI) * 18 : 0, end };
      }
      // fielders; the nearest one to the ball's end runs to it
      let chaser = -1;
      if (ballPos) {
        let best = Infinity;
        spots.forEach((sp, i) => {
          const p = polar(fg, sp[0], sp[1]);
          const d = Math.hypot(p.x - ballPos.end.x, p.y - ballPos.end.y);
          if (d < best) {
            best = d;
            chaser = i;
          }
        });
      }
      spots.forEach((sp, i) => {
        let p = polar(fg, sp[0], sp[1]);
        if (i === chaser && ballPos) {
          const k = easeOut(clamp(t * 1.15, 0, 1));
          const reach = h.ev.runs >= 4 && !h.ev.out ? 0.7 : 1;
          p = { x: lerp(p.x, ballPos.end.x, k * reach), y: lerp(p.y, ballPos.end.y, k * reach) };
        }
        ctx.fillStyle = COLORS.fielder;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.4, 0, Math.PI * 2);
        ctx.fill();
      });
      // keeper + bowler
      ctx.fillStyle = COLORS.bowler;
      const bw = polar(fg, 0, 0.3);
      ctx.beginPath();
      ctx.arc(bw.x, bw.y, 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.batter;
      ctx.beginPath();
      ctx.arc(bat.x, bat.y, 3.8, 0, Math.PI * 2);
      ctx.fill();
      if (ballPos) {
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bat.x, bat.y);
        ctx.lineTo(ballPos.x, ballPos.y);
        ctx.stroke();
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.arc(ballPos.x, ballPos.y, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = COLORS.ball;
        ctx.beginPath();
        ctx.arc(ballPos.x, ballPos.y - ballPos.lift, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ---- DRS
    function drawDrs() {
      const d = s.drs;
      ctx.fillStyle = '#0D1B2A';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(d.title, 10, 18);
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText(d.caption, 10, H - 10);
      if (d.kind === 'caught') {
        // edge detector trace
        const y0 = H * 0.55;
        ctx.strokeStyle = d.edge ? '#FFEB3B' : '#80CBC4';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        for (let x = 10; x < W - 10; x += 2) {
          const mid = Math.abs(x - W / 2) < 10;
          const amp = mid && d.edge ? 34 * Math.sin((x - W / 2) * 0.9) : Math.sin(x * 0.7) * 1.5;
          if (x === 10) ctx.moveTo(x, y0 + amp);
          else ctx.lineTo(x, y0 + amp);
        }
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillText(d.edge ? 'Spike as the ball passes the bat' : 'Flat as the ball passes the bat', 10, 36);
        return;
      }
      // stumps front view with the umpire's-call band
      const cx = W * 0.62;
      const base = H * 0.82;
      const unitX = Math.min(W * 0.1, 34); // one stump-half-width unit
      const unitH = H * 0.5; // stump height = 1
      const zone = (k, color) => {
        ctx.fillStyle = color;
        ctx.fillRect(cx - unitX * k, base - unitH * k, unitX * 2 * k, unitH * k);
      };
      zone(d.bandOut, 'rgba(255,193,7,0.18)');
      zone(1, 'rgba(255,193,7,0.22)');
      zone(d.bandIn, 'rgba(76,175,80,0.35)');
      ctx.fillStyle = COLORS.stump;
      for (let i = -1; i <= 1; i++) ctx.fillRect(cx + i * unitX * 0.9 - 2, base - unitH, 4, unitH);
      ctx.fillRect(cx - unitX, base - unitH - 3, unitX * 2, 3);
      const t = d.track;
      const px = cx + clamp(t.x, -3, 3) * unitX;
      const py = base - clamp(t.h, 0, 2.2) * unitH;
      ctx.fillStyle = COLORS.ball;
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      const rows = [
        ['Pitching', t.pitched === 'outside_leg' ? 'Outside leg' : 'In line'],
        ['Impact', 'In line'],
        ['Wickets', t.band === 'hitting' ? 'Hitting' : t.band === 'umpires_call' ? 'Umpire’s call' : 'Missing'],
      ];
      ctx.font = '600 11px system-ui, sans-serif';
      rows.forEach((r, i) => {
        const y = 40 + i * 20;
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.fillText(r[0], 10, y);
        ctx.fillStyle = r[1] === 'Missing' || r[1] === 'Outside leg' ? '#EF9A9A' : r[1] === 'Umpire’s call' ? '#FFE082' : '#A5D6A7';
        ctx.fillText(r[1], 72, y);
      });
    }

    // ---- loop
    function frame() {
      raf = 0;
      if (destroyed) return;
      size();
      const now = s.ball && s.ball.clock ? s.ball.clock() : Date.now();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (s.drs) drawDrs();
      else if (s.cam === 'field') drawFieldCam(now);
      else drawPitchCam(now);
      if (s.label) {
        ctx.font = '600 11px system-ui, sans-serif';
        const w = ctx.measureText(s.label).width + 14;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(8, 8, w, 20);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left';
        ctx.fillText(s.label, 15, 22);
      }
      if (busy(now)) raf = requestAnimationFrame(frame);
    }
    function busy(now) {
      if (s.drs) return false;
      if (s.hit && now - s.hit.at < s.hit.dur + 80) return true;
      if (s.swing && now - s.swing.at < 260) return true;
      if (s.stumps && now - s.stumps.at < 1400) return true;
      if (s.ball && s.ball.del && !s.hit) return progress(s.ball, now) < 1.2;
      return false;
    }
    function kick() {
      if (!raf && !destroyed) raf = requestAnimationFrame(frame);
    }

    function stumpsBurst(now) {
      const g = G();
      const y = persp(1).y + 4;
      const parts = [];
      for (let i = -1; i <= 1; i++) parts.push({ x: g.cx + i * 5, y: y - 17, vx: i * 60 + (Math.random() - 0.5) * 40, vy: -220 - Math.random() * 80, spin: (Math.random() - 0.5) * 12, w: 2.4, h: 34 });
      for (let i = 0; i < 2; i++) parts.push({ x: g.cx + (i ? 4 : -4), y: y - 35, vx: (i ? 1 : -1) * (90 + Math.random() * 50), vy: -300, spin: 18, w: 7, h: 1.6 });
      s.stumps = { at: now, parts };
    }

    const api = {
      canvas,
      setPitch(id) {
        s.pitch = id || 'flat';
        kick();
      },
      setField(id) {
        s.field = id || 'balanced';
        kick();
      },
      setSound(on) {
        sound = !!on;
      },
      unlockAudio() {
        if (sound) audio();
      },
      label(text) {
        s.label = text || '';
        kick();
      },
      /** Start a delivery. del = public ball view; clock() shares startAt's time base. */
      bowl(del, startAt, clock, n) {
        s.drs = null;
        s.cam = 'pitch';
        s.hit = null;
        s.swing = null;
        s.stumps = null;
        s.replaying = false;
        s.ball = { del, startAt, clock: clock || (() => Date.now()), n: n == null ? Math.random() : n, speed: 1 };
        kick();
      },
      /** The batter swung (immediate feedback before the server answers). */
      swing(shot) {
        const now = s.ball && s.ball.clock ? s.ball.clock() : Date.now();
        s.swing = { at: now, shot, dur: 200 };
        kick();
      },
      /** Show what happened. ev = engine event (dir, dist, runs, out, behind, edged). */
      outcome(ev, opt) {
        const oo = opt || {};
        const clock = (s.ball && s.ball.clock) || (() => Date.now());
        const now = clock();
        s.last = { del: s.ball && s.ball.del, ev };
        if (!s.swing && ev.shot && ev.timing !== 'none' && ev.shot !== 'leave') s.swing = { at: now, shot: ev.shot, dur: 200 };
        if (ev.contact) play(ev.edged || ev.behind ? 'edge' : 'bat');
        if (ev.out === 'bowled' || ev.out === 'stumped') {
          stumpsBurst(now);
          play('stumps');
          s.hit = null;
          s.cam = 'pitch';
          s.ball = Object.assign({}, s.ball, { del: null });
        } else if (ev.contact || ev.behind) {
          s.cam = 'field';
          s.hit = { at: now, ev, dur: (ev.runs >= 4 ? 1100 : 900) / (oo.speed || 1) };
        } else {
          s.ball = Object.assign({}, s.ball, { del: null });
        }
        if (ev.out) play(oo.mine ? 'crowd' : 'groan', true);
        else if (ev.runs === 6) play('crowd', true);
        else if (ev.runs === 4) play('crowd');
        kick();
      },
      /** Slow-mo replay of the last ball (wickets / sixes). */
      replay(speed) {
        const L = s.last;
        if (!L || !L.del) return false;
        const k = speed || 0.4;
        const t0 = Date.now();
        s.drs = null;
        s.cam = 'pitch';
        s.hit = null;
        s.stumps = null;
        s.swing = null;
        s.replaying = true;
        s.ball = { del: L.del, startAt: t0 - (L.del.runupMs * 0.6) / k, clock: () => Date.now(), n: -2, speed: k };
        const contactAt = t0 + ((L.del.runupMs * 0.4 + L.del.flightMs * ((L.del.zoneStart + L.del.zoneEnd) / 2)) / k);
        const wait = Math.max(0, contactAt - t0);
        setTimeout(() => {
          if (destroyed || !s.replaying) return;
          const was = sound;
          sound = false;
          api.outcome(L.ev, { speed: k });
          sound = was;
        }, wait);
        s.label = 'Replay';
        kick();
        setTimeout(() => {
          if (s.replaying) {
            s.replaying = false;
            s.label = '';
            kick();
          }
        }, wait + 1600 / k);
        return true;
      },
      /** DRS view: appeal = { kind, track?, edge }. */
      drs(appeal, umpire) {
        const u = umpire || { bandIn: 0.8, bandOut: 1.2 };
        s.drs =
          appeal.kind === 'caught'
            ? { kind: 'caught', edge: !!appeal.edge, title: 'Review · caught behind', caption: 'Simulated edge detection' }
            : { kind: 'lbw', track: appeal.track || { x: 0, h: 0.5, band: 'hitting', pitched: 'in_line' }, bandIn: u.bandIn, bandOut: u.bandOut, title: 'Review · LBW', caption: 'Simulated ball-tracking · shaded band = umpire’s call' };
        kick();
      },
      clearDrs() {
        s.drs = null;
        kick();
      },
      reset() {
        s.ball = null;
        s.hit = null;
        s.swing = null;
        s.stumps = null;
        s.drs = null;
        s.cam = 'pitch';
        s.label = '';
        kick();
      },
      /** Progress of the ball in flight (0 = release, 1 = batter's crease). */
      progress() {
        const b = s.ball;
        if (!b || !b.del) return -1;
        return progress(b, b.clock());
      },
      destroy() {
        destroyed = true;
        if (raf) cancelAnimationFrame(raf);
        if (ro) ro.disconnect();
        canvas.remove();
      },
    };
    kick();
    return api;
  }

  /** Short sound without a scene (menus, toss). */
  function sfx(kind, big) {
    const c = audio();
    if (!c || !SOUND[kind]) return;
    try {
      SOUND[kind](c, c.currentTime + 0.005, big);
    } catch (e) {}
  }

  /** Optional voice for commentary lines (Web Speech). */
  function speak(text, opts) {
    try {
      if (typeof window === 'undefined' || !window.speechSynthesis || !text) return false;
      const u = new SpeechSynthesisUtterance(String(text).slice(0, 160));
      const o = opts || {};
      u.rate = o.fan ? 1.12 : 0.98;
      u.pitch = o.fan ? 1.15 : 1;
      u.volume = 0.9;
      if (o.lang) u.lang = o.lang;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
      return true;
    } catch (e) {
      return false;
    }
  }
  function hush() {
    try {
      if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    } catch (e) {}
  }

  return { create, sfx, speak, hush, LINE_X };
});
