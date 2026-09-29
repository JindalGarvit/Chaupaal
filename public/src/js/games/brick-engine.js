/**
 * Brick Breaker engine (Dangal P14) — pure fixed-timestep simulation in a 320×480 world. Shared by
 * the phone (brick-breaker.js), the level validator (scripts/gen-brick-levels.js), tests and the
 * server's plausibility checks (maxPoints per layout).
 *
 * Physics
 *   • 120 ticks/s. Each tick the ball is swept against walls, bricks and the paddle as a circle vs
 *     rounded rectangles (edge faces offset by the radius + corner circles), resolving up to 8 hits
 *     in order of time — so no tunnelling at any speed.
 *   • Speed curve: base 260 u/s (+4 per level, max +80) plus 1.5 u/s per brick hit, capped at 520;
 *     slow ball = ×0.65. Speed is renormalised after every bounce.
 *   • Paddle control: the hit position sets the angle — centre goes straight up, the edges ±60°.
 *   • Angle clamp: at least 15° from horizontal, so the ball can't loop side to side forever.
 *
 * Bricks: 1 normal · 2 / 3 multi-hit · U unbreakable · X explosive (breaks its 8 neighbours) ·
 *         M moving (the row drifts together) · G gold (+50) · P power (always drops a power-up).
 * Power-ups (P bricks always drop; other breakable bricks drop 8% of the time, seeded):
 *   wide 22% (12 s) · multi 18% (+2 balls) · slow 18% (8 s) · laser 14% (8 s, two beams) ·
 *   sticky 16% (next 3 catches hold the ball) · extra 12% (+1 ball in reserve, max 5).
 * Score: 10 per hit point on break (G 50, X 15, M 20) + combo (2 × bricks since the paddle last
 * touched a ball) · level clear 100 + 50 per ball in reserve.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BrickEngine = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  const SoloCore = typeof module === 'object' && module.exports ? require('./solo-core.js') : root.SoloCore;

  const W = 320;
  const H = 480;
  const TICK = 120;
  const DT = 1 / TICK;
  const COLS = 10;
  const MARGIN = 6;
  const GAP = 3;
  const BW = (W - 2 * MARGIN - (COLS - 1) * GAP) / COLS;
  const BH = 14;
  const TOP = 56;
  const PADDLE_Y = 440;
  const PADDLE_H = 10;
  const PADDLE_W = 64;
  const WIDE_W = 96;
  const R = 5;
  const BASE_SPEED = 260;
  const MAX_SPEED = 520;
  const SLOW = 0.65;
  const MIN_ANGLE = (15 * Math.PI) / 180;
  const MIN_TILT = (3 * Math.PI) / 180;
  const MAX_PADDLE_ANGLE = (60 * Math.PI) / 180;
  const POWER_FALL = 110;
  const DROP_CHANCE = 0.08;
  const POWER_WEIGHTS = [
    ['wide', 22],
    ['multi', 18],
    ['slow', 18],
    ['laser', 14],
    ['sticky', 16],
    ['extra', 12],
  ];
  const DURATION = { wide: 12, slow: 8, laser: 8 };
  const MAX_LIVES = 5;
  const POINTS = { hit: 10, gold: 50, explosive: 15, moving: 20, comboStep: 2, clear: 100, lifeLeft: 50 };

  // ---------------------------------------------------------------- levels

  /** 30 handcrafted layouts (1–20 carried over from the original campaign, 21–30 new). */
  const HANDCRAFTED = [
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
    ['0003333000', '0031111300', '0311P11130', '3111111113', '1111111111'],
    ['11U1111U11', '1111111111', '2X222222X2', '1111111111'],
    ['3000000003', '3311111133', '1112GG2111', '1111111111', 'P11111111P'],
    ['MMMMMMMMMM', '0000000000', '3333333333', '1X11111X11', '1111111111'],
    ['UUU0000UUU', '1112222111', '11P1111P11', '1111111111'],
    ['1231321231', '3211231321', '1111111111', 'X11111111X'],
    ['0GGGGGGGG0', '0U222222U0', '0U1P11P1U0', '0U111111U0', '1111111111'],
    ['3M3M3M3M3M', '1111111111', '2222222222', '1111X11111', '1111111111'],
    ['X1X1X1X1X1', '1X1X1X1X1X', '2222222222', '1111111111', '11P1111P11'],
    ['3333333333', '33U2222U33', '3222P22223', '33U2222U33', '1111111111', '1111111111'],
  ];
  const CAMPAIGN_COUNT = 60;
  const BREAKABLE = { 1: 1, 2: 2, 3: 3, X: 1, M: 1, G: 1, P: 1 };

  /** Seeded symmetric layout; d ∈ [0,1] difficulty. Always passes reachability (re-rolled if not). */
  function generateLayout(seed, d) {
    for (let salt = 0; salt < 40; salt++) {
      const next = SoloCore.stream(SoloCore.fnv(seed + ':' + salt));
      const p = (x) => next() % 1000 < x * 1000;
      const rowsN = 4 + Math.round(d * 3);
      const rows = [];
      for (let r = 0; r < rowsN; r++) {
        const moving = r < rowsN - 2 && p(0.15 * d);
        const half = [];
        for (let c = 0; c < COLS / 2; c++) {
          let ch = '1';
          if (p(0.14)) ch = '0';
          else if (moving) ch = 'M';
          else if (r < rowsN - 1 && p(0.03 + 0.04 * d) && half[c - 2] !== 'U' && half[c - 1] !== 'U') ch = 'U';
          else if (p(0.04)) ch = 'P';
          else if (p(0.03)) ch = 'X';
          else if (p(0.03)) ch = 'G';
          else if (p(0.08 * d)) ch = '3';
          else if (p(0.15 + 0.2 * d)) ch = '2';
          half.push(ch);
        }
        rows.push(half.join('') + half.slice().reverse().join(''));
      }
      if (layoutOk(rows)) return rows;
    }
    return ['1111111111', '1111111111', '1111111111'];
  }

  function layoutFor(n) {
    if (n >= 1 && n <= HANDCRAFTED.length) return HANDCRAFTED[n - 1];
    const d = Math.min(1, (n - HANDCRAFTED.length) / (CAMPAIGN_COUNT - HANDCRAFTED.length));
    return generateLayout(SoloCore.levelSeed('brickbreaker', n), 0.35 + 0.65 * d);
  }
  function endlessLayout(wave) {
    return generateLayout(SoloCore.fnv('brickbreaker-endless|' + wave), Math.min(1, 0.2 + wave * 0.06));
  }
  function dailyLayout(dayNo) {
    return generateLayout(SoloCore.dailySeed('brickbreaker', dayNo), 0.6);
  }

  /**
   * Every breakable brick can be reached from the open space below (unbreakable bricks block), and
   * no cell is a one-wide slot between unbreakable bricks (or a wall).
   */
  function layoutOk(rows) {
    const n = rows.length;
    let breakable = 0;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!BREAKABLE[rows[r][c]]) continue;
        const l = c === 0 || rows[r][c - 1] === 'U';
        const rt = c === COLS - 1 || rows[r][c + 1] === 'U';
        if (l && rt) return false;
      }
    }
    const seen = rows.map((row) => row.split('').map(() => false));
    const q = [];
    for (let c = 0; c < COLS; c++) {
      if (rows[n - 1][c] !== 'U') {
        seen[n - 1][c] = true;
        q.push([n - 1, c]);
      }
    }
    while (q.length) {
      const [r, c] = q.pop();
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => {
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || rr >= n || cc < 0 || cc >= COLS || seen[rr][cc] || rows[rr][cc] === 'U') return;
        seen[rr][cc] = true;
        q.push([rr, cc]);
      });
    }
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < COLS; c++) {
        const ch = rows[r][c];
        if (BREAKABLE[ch]) {
          breakable++;
          if (!seen[r][c]) return false;
        }
      }
    }
    return breakable >= 12;
  }

  function brickPoints(ch) {
    if (ch === 'G') return POINTS.gold;
    if (ch === 'X') return POINTS.explosive;
    if (ch === 'M') return POINTS.moving;
    return POINTS.hit * (BREAKABLE[ch] || 1);
  }

  /** Upper bound on points one layout can give (every brick + the longest possible combo + clear bonus). */
  function maxPoints(rows) {
    let sum = 0;
    let n = 0;
    rows.forEach((row) =>
      row.split('').forEach((ch) => {
        if (!BREAKABLE[ch]) return;
        sum += brickPoints(ch);
        n++;
      })
    );
    return sum + POINTS.comboStep * ((n * (n + 1)) / 2) + POINTS.clear + POINTS.lifeLeft * MAX_LIVES;
  }
  function breakableCount(rows) {
    let n = 0;
    rows.forEach((row) => row.split('').forEach((ch) => (n += BREAKABLE[ch] ? 1 : 0)));
    return n;
  }

  // ---------------------------------------------------------------- state

  function rnd(s) {
    const r = SoloCore.mulberryNext(s.rng);
    s.rng = r.state;
    return r.value;
  }

  function createGame(rows, opts) {
    const o = opts || {};
    const s = {
      v: 1,
      rng: (o.seed >>> 0) || 1,
      tick: 0,
      level: o.level || 1,
      lives: o.lives == null ? 3 : o.lives,
      score: o.score || 0,
      combo: 0,
      hits: 0,
      paddleHits: 0,
      bricks: [],
      balls: [],
      powerups: [],
      beams: [],
      paddle: { x: W / 2, w: PADDLE_W, y: PADDLE_Y, h: PADDLE_H },
      fx: { wide: 0, slow: 0, laser: 0, sticky: 0, laserCd: 0 },
      status: 'serve',
      breakable: 0,
      destroyed: 0,
      speedBase: BASE_SPEED + Math.min(80, ((o.level || 1) - 1) * 4),
      events: [],
      serveSign: 1,
      layout: rows.slice(),
    };
    rows.forEach((row, r) => {
      const moving = row.indexOf('M') !== -1;
      row.split('').forEach((ch, c) => {
        if (!BREAKABLE[ch] && ch !== 'U') return;
        const hp = ch === 'U' ? 0 : BREAKABLE[ch];
        const x = MARGIN + c * (BW + GAP);
        s.bricks.push({ x, baseX: x, y: TOP + r * (BH + GAP), w: BW, h: BH, hp, maxHp: hp, type: ch, alive: true, row: r, col: c, moving: moving && ch === 'M' });
        if (ch !== 'U') s.breakable++;
      });
    });
    resetBall(s);
    return s;
  }

  function resetBall(s) {
    s.balls = [{ x: s.paddle.x, y: s.paddle.y - R - 0.5, vx: 0, vy: 0, stuck: true, off: 0 }];
    s.status = 'serve';
    s.combo = 0;
  }

  function speedOf(s) {
    const v = Math.min(MAX_SPEED, s.speedBase + 1.5 * s.hits);
    return s.fx.slow > 0 ? v * SLOW : v;
  }

  function setDir(ball, angleFromVertical, speed) {
    ball.vx = Math.sin(angleFromVertical) * speed;
    ball.vy = -Math.cos(angleFromVertical) * speed;
  }

  function clampAngle(ball, speed) {
    const sp = Math.hypot(ball.vx, ball.vy) || 1;
    let vx = (ball.vx / sp) * speed;
    let vy = (ball.vy / sp) * speed;
    const minVy = Math.sin(MIN_ANGLE) * speed;
    const minVx = Math.sin(MIN_TILT) * speed;
    const sy = vy < 0 ? -1 : vy > 0 ? 1 : -1;
    const sx = vx < 0 ? -1 : 1;
    if (Math.abs(vy) < minVy) {
      vy = sy * minVy;
      vx = sx * Math.cos(MIN_ANGLE) * speed;
    } else if (Math.abs(vx) < minVx) {
      vx = sx * minVx;
      vy = sy * Math.cos(MIN_TILT) * speed;
    }
    ball.vx = vx;
    ball.vy = vy;
  }

  function launch(s) {
    let any = false;
    s.balls.forEach((b) => {
      if (!b.stuck) return;
      const off = Math.max(-1, Math.min(1, b.off / (s.paddle.w / 2)));
      const ang = Math.abs(off) < 0.05 ? s.serveSign * 0.35 : off * MAX_PADDLE_ANGLE;
      s.serveSign = -s.serveSign;
      setDir(b, ang, speedOf(s));
      clampAngle(b, speedOf(s));
      b.stuck = false;
      any = true;
    });
    if (any && s.status === 'serve') s.status = 'play';
    return any;
  }

  function setPaddle(s, x) {
    const half = s.paddle.w / 2;
    s.paddle.x = Math.max(half, Math.min(W - half, x));
  }

  // ---------------------------------------------------------------- sweeps

  /** Earliest hit of a moving circle (p → p+d, radius r) with a rect. Returns { t, nx, ny } or null. */
  function sweepRect(px, py, dx, dy, x0, y0, x1, y1, r) {
    let best = null;
    const consider = (t, nx, ny) => {
      if (t < -1e-9 || t > 1) return;
      if (!best || t < best.t) best = { t: Math.max(0, t), nx, ny };
    };
    if (dx > 0) {
      const t = (x0 - r - px) / dx;
      const y = py + dy * t;
      if (y >= y0 && y <= y1) consider(t, -1, 0);
    } else if (dx < 0) {
      const t = (x1 + r - px) / dx;
      const y = py + dy * t;
      if (y >= y0 && y <= y1) consider(t, 1, 0);
    }
    if (dy > 0) {
      const t = (y0 - r - py) / dy;
      const x = px + dx * t;
      if (x >= x0 && x <= x1) consider(t, 0, -1);
    } else if (dy < 0) {
      const t = (y1 + r - py) / dy;
      const x = px + dx * t;
      if (x >= x0 && x <= x1) consider(t, 0, 1);
    }
    const corners = [
      [x0, y0],
      [x1, y0],
      [x0, y1],
      [x1, y1],
    ];
    const a = dx * dx + dy * dy;
    if (a > 0) {
      for (let k = 0; k < 4; k++) {
        const cx = corners[k][0];
        const cy = corners[k][1];
        const fx = px - cx;
        const fy = py - cy;
        const b = 2 * (fx * dx + fy * dy);
        const c = fx * fx + fy * fy - r * r;
        if (b >= 0) continue;
        const disc = b * b - 4 * a * c;
        if (disc < 0) continue;
        const t = (-b - Math.sqrt(disc)) / (2 * a);
        const hx = px + dx * t;
        const hy = py + dy * t;
        const inX = hx >= x0 && hx <= x1;
        const inY = hy >= y0 && hy <= y1;
        if (inX || inY) continue;
        const nl = Math.hypot(hx - cx, hy - cy) || 1;
        consider(t, (hx - cx) / nl, (hy - cy) / nl);
      }
    }
    return best;
  }

  function overlapsRect(px, py, x0, y0, x1, y1, r) {
    const qx = Math.max(x0, Math.min(x1, px));
    const qy = Math.max(y0, Math.min(y1, py));
    return (px - qx) * (px - qx) + (py - qy) * (py - qy) < r * r - 1e-6;
  }

  // ---------------------------------------------------------------- bricks

  function pickPower(s) {
    const total = POWER_WEIGHTS.reduce((a, w) => a + w[1], 0);
    let x = rnd(s) % total;
    for (let k = 0; k < POWER_WEIGHTS.length; k++) {
      if (x < POWER_WEIGHTS[k][1]) return POWER_WEIGHTS[k][0];
      x -= POWER_WEIGHTS[k][1];
    }
    return 'wide';
  }

  function damageBrick(s, br, fromBlast) {
    if (!br.alive || br.type === 'U') return false;
    br.hp--;
    s.hits++;
    if (br.hp > 0) {
      s.events.push({ t: 'hit', x: br.x + br.w / 2, y: br.y + br.h / 2, type: br.type });
      return false;
    }
    br.alive = false;
    s.destroyed++;
    s.combo++;
    const pts = brickPoints(br.type) + POINTS.comboStep * s.combo;
    s.score += pts;
    s.events.push({ t: 'break', x: br.x + br.w / 2, y: br.y + br.h / 2, type: br.type, pts, blast: !!fromBlast });
    if (br.type === 'P' || rnd(s) % 1000 < DROP_CHANCE * 1000) {
      s.powerups.push({ x: br.x + br.w / 2, y: br.y + br.h / 2, type: pickPower(s) });
    }
    if (br.type === 'X') {
      s.events.push({ t: 'explode', x: br.x + br.w / 2, y: br.y + br.h / 2 });
      s.bricks.forEach((o) => {
        if (o.alive && o !== br && Math.abs(o.row - br.row) <= 1 && Math.abs(o.col - br.col) <= 1) {
          while (o.alive && o.type !== 'U') damageBrick(s, o, true);
        }
      });
    }
    return true;
  }

  // ---------------------------------------------------------------- step

  function catchPower(s, p) {
    const t = p.type;
    if (t === 'wide') {
      s.fx.wide = DURATION.wide * TICK;
      s.paddle.w = WIDE_W;
      setPaddle(s, s.paddle.x);
    } else if (t === 'slow') s.fx.slow = DURATION.slow * TICK;
    else if (t === 'laser') s.fx.laser = DURATION.laser * TICK;
    else if (t === 'sticky') s.fx.sticky = 3;
    else if (t === 'extra') s.lives = Math.min(MAX_LIVES, s.lives + 1);
    else if (t === 'multi') {
      const src = s.balls.find((b) => !b.stuck) || s.balls[0];
      if (src) {
        const sp = speedOf(s);
        const base = src.stuck ? 0 : Math.atan2(src.vx, -src.vy);
        [-0.45, 0.45].forEach((d) => {
          if (s.balls.length >= 8) return;
          const nb = { x: src.x, y: src.stuck ? src.y - 2 : src.y, vx: 0, vy: 0, stuck: false, off: 0 };
          setDir(nb, base + d, sp);
          clampAngle(nb, sp);
          s.balls.push(nb);
        });
        if (s.status === 'serve') launch(s);
      }
    }
    s.events.push({ t: 'power', type: t });
  }

  function fireLasers(s) {
    const xs = [s.paddle.x - s.paddle.w / 2 + 4, s.paddle.x + s.paddle.w / 2 - 4];
    xs.forEach((x) => {
      let target = null;
      s.bricks.forEach((br) => {
        if (!br.alive || x < br.x || x > br.x + br.w || br.y > s.paddle.y) return;
        if (!target || br.y + br.h > target.y + target.h) target = br;
      });
      s.beams.push({ x, y1: target ? target.y + target.h : 0, life: 8 });
      if (target) damageBrick(s, target, false);
    });
    s.events.push({ t: 'laser' });
  }

  function moveBall(s, ball) {
    const sp = speedOf(s);
    let remaining = 1;
    for (let iter = 0; iter < 8 && remaining > 1e-6; iter++) {
      const dx = ball.vx * DT * remaining;
      const dy = ball.vy * DT * remaining;
      let hit = null;
      let what = null;
      const take = (h, w) => {
        if (h && (!hit || h.t < hit.t)) {
          hit = h;
          what = w;
        }
      };
      if (dx < 0 && ball.x + dx < R) take({ t: (R - ball.x) / dx, nx: 1, ny: 0 }, 'wall');
      if (dx > 0 && ball.x + dx > W - R) take({ t: (W - R - ball.x) / dx, nx: -1, ny: 0 }, 'wall');
      if (dy < 0 && ball.y + dy < R) take({ t: (R - ball.y) / dy, nx: 0, ny: 1 }, 'wall');
      for (let k = 0; k < s.bricks.length; k++) {
        const br = s.bricks[k];
        if (!br.alive) continue;
        if (overlapsRect(ball.x, ball.y, br.x, br.y, br.x + br.w, br.y + br.h, R)) {
          // Started inside (a moving brick slid onto the ball): push out vertically.
          ball.y = ball.vy < 0 ? br.y + br.h + R + 0.01 : br.y - R - 0.01;
          ball.vy = -ball.vy;
          take({ t: 0, nx: 0, ny: ball.vy < 0 ? -1 : 1, inside: true }, br);
          continue;
        }
        take(sweepRect(ball.x, ball.y, dx, dy, br.x, br.y, br.x + br.w, br.y + br.h, R), br);
      }
      if (ball.vy > 0) {
        const p = s.paddle;
        take(sweepRect(ball.x, ball.y, dx, dy, p.x - p.w / 2, p.y, p.x + p.w / 2, p.y + p.h, R), 'paddle');
      }
      if (!hit) {
        ball.x += dx;
        ball.y += dy;
        break;
      }
      const t = Math.max(0, hit.t - 1e-6);
      ball.x += dx * t;
      ball.y += dy * t;
      remaining *= 1 - Math.min(1, hit.t);
      if (what === 'paddle') {
        const p = s.paddle;
        if (hit.ny < 0 || ball.y < p.y) {
          const off = Math.max(-1, Math.min(1, (ball.x - p.x) / (p.w / 2)));
          s.combo = 0;
          if (s.fx.sticky > 0) {
            s.fx.sticky--;
            ball.stuck = true;
            ball.off = ball.x - p.x;
            ball.y = p.y - R - 0.5;
            ball.vx = 0;
            ball.vy = 0;
            s.events.push({ t: 'stick' });
            return;
          }
          setDir(ball, off * MAX_PADDLE_ANGLE, sp);
          s.paddleHits++;
          s.events.push({ t: 'paddle', off });
        } else {
          reflect(ball, hit.nx, hit.ny);
        }
      } else if (what === 'wall') {
        reflect(ball, hit.nx, hit.ny);
        s.events.push({ t: 'wall' });
      } else if (what) {
        if (!hit.inside) reflect(ball, hit.nx, hit.ny);
        damageBrick(s, what, false);
      }
      clampAngle(ball, sp);
    }
  }

  function reflect(ball, nx, ny) {
    const d = ball.vx * nx + ball.vy * ny;
    if (d >= 0) return;
    ball.vx -= 2 * d * nx;
    ball.vy -= 2 * d * ny;
  }

  /**
   * One tick. input: { paddleX?: number, launch?: boolean }. Returns the tick's events.
   */
  function step(s, input) {
    s.events = [];
    if (s.status === 'cleared' || s.status === 'lost') return s.events;
    const inp = input || {};
    if (typeof inp.paddleX === 'number') setPaddle(s, inp.paddleX);
    if (inp.launch) launch(s);
    s.tick++;
    if (s.fx.wide > 0 && --s.fx.wide === 0) {
      s.paddle.w = PADDLE_W;
      setPaddle(s, s.paddle.x);
    }
    if (s.fx.slow > 0) s.fx.slow--;
    if (s.fx.laser > 0) {
      s.fx.laser--;
      if (s.status === 'play' && --s.fx.laserCd <= 0) {
        s.fx.laserCd = Math.round(0.4 * TICK);
        fireLasers(s);
      }
    }
    s.beams = s.beams.filter((b) => --b.life > 0);
    const phase = (s.tick % (3 * TICK)) / (3 * TICK);
    const tri = phase < 0.5 ? phase * 4 - 1 : 3 - phase * 4;
    s.bricks.forEach((br) => {
      if (br.moving) br.x = br.baseX + tri * 12;
    });
    s.balls.forEach((b) => {
      if (b.stuck) {
        b.x = Math.max(R, Math.min(W - R, s.paddle.x + b.off));
        b.y = s.paddle.y - R - 0.5;
        return;
      }
      moveBall(s, b);
    });
    const before = s.balls.length;
    s.balls = s.balls.filter((b) => b.y < H + R * 2);
    if (s.balls.length < before) s.events.push({ t: 'drop' });
    const p = s.paddle;
    s.powerups = s.powerups.filter((pu) => {
      pu.y += POWER_FALL * DT;
      if (pu.y + 6 >= p.y && pu.y - 6 <= p.y + p.h && pu.x >= p.x - p.w / 2 - 6 && pu.x <= p.x + p.w / 2 + 6) {
        catchPower(s, pu);
        return false;
      }
      return pu.y < H + 10;
    });
    if (s.destroyed >= s.breakable) {
      s.status = 'cleared';
      const bonus = POINTS.clear + POINTS.lifeLeft * s.lives;
      s.score += bonus;
      s.events.push({ t: 'cleared', bonus });
      return s.events;
    }
    if (!s.balls.length) {
      s.lives--;
      s.fx.wide = 0;
      s.fx.slow = 0;
      s.fx.laser = 0;
      s.fx.sticky = 0;
      s.paddle.w = PADDLE_W;
      s.powerups = [];
      if (s.lives < 0) {
        s.lives = 0;
        s.status = 'lost';
        s.events.push({ t: 'lost' });
      } else {
        s.events.push({ t: 'life', lives: s.lives });
        resetBall(s);
      }
    }
    return s.events;
  }

  // ---------------------------------------------------------------- bot (validation)

  /** Where a ball will cross the paddle line (walls folded, bricks ignored). */
  function predictX(ball, y) {
    if (ball.vy <= 0) return ball.x;
    const t = (y - R - ball.y) / ball.vy;
    let x = ball.x + ball.vx * t;
    const span = W - 2 * R;
    x -= R;
    x = ((x % (2 * span)) + 2 * span) % (2 * span);
    if (x > span) x = 2 * span - x;
    return x + R;
  }

  function botInput(s) {
    const p = s.paddle;
    const falling = s.balls.filter((b) => !b.stuck && b.vy > 0).sort((a, b) => b.y - a.y);
    let target = p.x;
    if (falling.length) {
      const b = falling[0];
      const px = predictX(b, p.y);
      const alive = s.bricks.filter((br) => br.alive && br.type !== 'U');
      let aim = 0;
      if (alive.length) {
        // Aim the bounce at a brick in clear view (lowest first), varied per hit so play never loops.
        const blockers = s.bricks.filter((br) => br.alive);
        const visible = alive.filter((tg) => {
          const tx = tg.x + tg.w / 2;
          const ty = tg.y + tg.h;
          return !blockers.some((o) => {
            if (o === tg) return false;
            const h = sweepRect(px, p.y, tx - px, ty - p.y, o.x, o.y, o.x + o.w, o.y + o.h, R);
            return h && h.t < 0.97;
          });
        });
        const pool = visible.length ? visible : alive;
        const tgt = pool.reduce((a, br) => (br.y > a.y || (br.y === a.y && Math.abs(br.x - px) < Math.abs(a.x - px)) ? br : a), pool[0]);
        const theta = Math.atan2(tgt.x + tgt.w / 2 - px, p.y - (tgt.y + tgt.h));
        aim = Math.max(-0.92, Math.min(0.92, theta / MAX_PADDLE_ANGLE + (((s.paddleHits * 37) % 11) - 5) * 0.04));
      }
      target = px - aim * (p.w / 2);
    } else if (s.powerups.length) target = s.powerups[0].x;
    const maxMove = 900 * DT;
    const nx = p.x + Math.max(-maxMove, Math.min(maxMove, target - p.x));
    return { paddleX: nx, launch: s.status === 'serve' || s.balls.some((b) => b.stuck) };
  }

  /** Bot plays a layout; returns { cleared, seconds, livesLost, score }. */
  function botPlay(rows, opts) {
    const o = opts || {};
    const s = createGame(rows, { seed: o.seed || 7, level: o.level || 1, lives: 99 });
    const cap = (o.capSeconds || 300) * TICK;
    while (s.status !== 'cleared' && s.status !== 'lost' && s.tick < cap) step(s, botInput(s));
    return { cleared: s.status === 'cleared', seconds: Math.round(s.tick / TICK), livesLost: 99 - s.lives, score: s.score };
  }

  return {
    W,
    H,
    TICK,
    DT,
    COLS,
    BW,
    BH,
    TOP,
    R,
    PADDLE_Y,
    PADDLE_W,
    WIDE_W,
    BASE_SPEED,
    MAX_SPEED,
    MIN_ANGLE,
    MAX_PADDLE_ANGLE,
    POWER_WEIGHTS,
    DROP_CHANCE,
    DURATION,
    POINTS,
    MAX_LIVES,
    HANDCRAFTED,
    CAMPAIGN_COUNT,
    BREAKABLE,
    generateLayout,
    layoutFor,
    endlessLayout,
    dailyLayout,
    layoutOk,
    maxPoints,
    breakableCount,
    createGame,
    launch,
    setPaddle,
    step,
    speedOf,
    sweepRect,
    clampAngle,
    catchPower,
    botInput,
    botPlay,
    predictX,
  };
});
