/**
 * Carrom physics (Dangal P7) — one module for the browser and the server (server-lib/carrom-engine.js).
 *
 * Deterministic by construction: a fixed 1 ms step, bodies processed in array order, and only IEEE-754
 * + − × ÷ and Math.sqrt (correctly rounded on every engine) inside the loop. Trig for the aim angle
 * is our own polynomial, never Math.sin/cos. Positions enter and leave as integers in 0.01 mm, so the
 * same input gives the same result bit-for-bit on the server and on every phone.
 *
 * Board units are millimetres on the ICF board: 740 mm playing surface, 44.5 mm corner pockets,
 * 31.8 mm / 5.4 g carrom men, 41.3 mm / 15 g striker. Spin-free, as in real carrom.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CarromPhysics = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PI = 3.141592653589793;
  const BOARD = 740;
  const C = BOARD / 2;
  const MAN_R = 15.9;
  const STRIKER_R = 20.65;
  const MAN_M = 5.4;
  const STRIKER_M = 15;
  const POCKET_R = 22.25;
  const POCKETS = [
    [POCKET_R, POCKET_R],
    [BOARD - POCKET_R, POCKET_R],
    [BOARD - POCKET_R, BOARD - POCKET_R],
    [POCKET_R, BOARD - POCKET_R],
  ];

  /** Tuned so a full-power striker runs ~3.5 lengths (ICF board test) and cuts feel like wood on powder. */
  const K = Object.freeze({
    dt: 1, // ms per step
    maxSteps: 20000,
    vMax: 5.0, // mm/ms (= m/s) at power 1000
    vMin: 0.25,
    frictionMan: 0.0032, // mm/ms² sliding deceleration
    frictionStriker: 0.003,
    eMan: 0.9, // man ↔ man restitution
    eStriker: 0.86, // striker ↔ man
    eCushion: 0.8, // frame rebound
    cushionTangent: 0.97,
    captureSlope: 2.8, // capture radius shrinks 2.8 mm per m/s: fast men rattle out
    captureMin: 3,
    lipDamp: 0.8,
  });

  // ---------------------------------------------------------------- deterministic trig

  function dsin(x) {
    const k = Math.round(x / (2 * PI));
    let a = x - k * 2 * PI;
    if (a > PI / 2) a = PI - a;
    else if (a < -PI / 2) a = -PI - a;
    const a2 = a * a;
    return a * (1 - (a2 / 6) * (1 - (a2 / 20) * (1 - (a2 / 42) * (1 - (a2 / 72) * (1 - (a2 / 110) * (1 - (a2 / 156) * (1 - a2 / 210)))))));
  }
  function dcos(x) {
    return dsin(x + PI / 2);
  }

  // ---------------------------------------------------------------- sides

  /** Side 0 = south (bottom), 1 = east, 2 = north, 3 = west — the order turns pass to the right (ICF 49b). */
  const FORWARD = [
    [0, -1],
    [-1, 0],
    [0, 1],
    [1, 0],
  ];
  const RIGHT = [
    [1, 0],
    [0, -1],
    [-1, 0],
    [0, 1],
  ];
  const BASE_DEPTH = 117.4; // baseline centre line from the frame (between the 101.5 and 133.3 mm lines)

  /** Local (u along the baseline to the player's right, v forward) → board mm. */
  function toBoard(side, u, v) {
    const f = FORWARD[side & 3];
    const r = RIGHT[side & 3];
    const bd = C - BASE_DEPTH;
    return [C - f[0] * bd + r[0] * u + f[0] * v, C - f[1] * bd + r[1] * u + f[1] * v];
  }

  /** Shot input → striker start. input = { x: 0.1 mm along the baseline, angle: 0.01° from straight ahead (+ = right), power: 0–1000 }. */
  function strikerFromInput(side, input) {
    const u = Number(input.x) / 10;
    const th = (Number(input.angle) * PI) / 18000;
    const p = Math.max(0, Math.min(1000, Number(input.power)));
    const speed = K.vMin + ((K.vMax - K.vMin) * p) / 1000;
    const f = FORWARD[side & 3];
    const r = RIGHT[side & 3];
    const cs = dcos(th);
    const sn = dsin(th);
    const dx = f[0] * cs + r[0] * sn;
    const dy = f[1] * cs + r[1] * sn;
    const pos = toBoard(side, u, 0);
    return { x: pos[0], y: pos[1], vx: dx * speed, vy: dy * speed };
  }

  // ---------------------------------------------------------------- simulation

  /**
   * @param {{id:string,c:string,x:number,y:number}[]} pieces integer 0.01 mm positions (on the board only)
   * @param {{x:number,y:number,vx:number,vy:number}} striker board mm + mm/ms
   * @param {{ events?: boolean }} [opts]
   */
  function createSim(pieces, striker, opts) {
    const o = opts || {};
    const n = pieces.length + 1;
    const id = new Array(n);
    const col = new Array(n);
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    const vx = new Float64Array(n);
    const vy = new Float64Array(n);
    const r = new Float64Array(n);
    const m = new Float64Array(n);
    const fr = new Float64Array(n);
    const alive = new Uint8Array(n);
    const moving = new Uint8Array(n);
    const lip = new Int8Array(n);
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i];
      id[i] = p.id;
      col[i] = p.c;
      x[i] = Number(p.x) / 100;
      y[i] = Number(p.y) / 100;
      r[i] = MAN_R;
      m[i] = MAN_M;
      fr[i] = K.frictionMan;
      alive[i] = 1;
      lip[i] = -1;
    }
    const S = n - 1;
    id[S] = 'S';
    col[S] = 's';
    x[S] = striker.x;
    y[S] = striker.y;
    vx[S] = striker.vx;
    vy[S] = striker.vy;
    r[S] = STRIKER_R;
    m[S] = STRIKER_M;
    fr[S] = K.frictionStriker;
    alive[S] = 1;
    moving[S] = vx[S] !== 0 || vy[S] !== 0 ? 1 : 0;
    lip[S] = -1;

    const pocketed = [];
    const events = [];
    let t = 0;
    let touched = false;
    let firstHit = null;
    let cushions = 0;
    let done = !moving[S];
    const ev = (e) => {
      if (o.events) events.push(e);
    };

    function pocketCheck(i, x0, y0) {
      const x1 = x[i];
      const y1 = y[i];
      if (!((x1 < 90 || x1 > BOARD - 90) && (y1 < 90 || y1 > BOARD - 90))) {
        lip[i] = -1;
        return false;
      }
      const sp = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]);
      let rc = POCKET_R - K.captureSlope * sp;
      if (rc < K.captureMin) rc = K.captureMin;
      for (let k = 0; k < 4; k++) {
        const px = POCKETS[k][0];
        const py = POCKETS[k][1];
        // Closest approach of this step's segment to the pocket centre (a fast man can't skip the hole).
        const sx = x1 - x0;
        const sy = y1 - y0;
        const ss = sx * sx + sy * sy;
        let tt = ss > 0 ? ((px - x0) * sx + (py - y0) * sy) / ss : 1;
        if (tt < 0) tt = 0;
        else if (tt > 1) tt = 1;
        const cx = x0 + sx * tt - px;
        const cy = y0 + sy * tt - py;
        const d2 = cx * cx + cy * cy;
        if (d2 < rc * rc) {
          alive[i] = 0;
          moving[i] = 0;
          x[i] = px;
          y[i] = py;
          vx[i] = 0;
          vy[i] = 0;
          pocketed.push({ id: id[i], c: col[i], pocket: k, t });
          ev({ t, k: 'pocket', id: id[i], pocket: k });
          return true;
        }
        if (d2 < POCKET_R * POCKET_R) {
          if (lip[i] !== k) {
            lip[i] = k;
            vx[i] *= K.lipDamp;
            vy[i] *= K.lipDamp;
            ev({ t, k: 'lip', id: id[i] });
          }
        } else if (lip[i] === k && d2 > (POCKET_R + 6) * (POCKET_R + 6)) lip[i] = -1;
      }
      return false;
    }

    function walls(i) {
      const ri = r[i];
      let hit = 0;
      if (x[i] < ri) {
        x[i] = ri + (ri - x[i]);
        vx[i] = -vx[i] * K.eCushion;
        vy[i] *= K.cushionTangent;
        hit = 1;
      } else if (x[i] > BOARD - ri) {
        x[i] = BOARD - ri - (x[i] - (BOARD - ri));
        vx[i] = -vx[i] * K.eCushion;
        vy[i] *= K.cushionTangent;
        hit = 1;
      }
      if (y[i] < ri) {
        y[i] = ri + (ri - y[i]);
        vy[i] = -vy[i] * K.eCushion;
        vx[i] *= K.cushionTangent;
        hit = 1;
      } else if (y[i] > BOARD - ri) {
        y[i] = BOARD - ri - (y[i] - (BOARD - ri));
        vy[i] = -vy[i] * K.eCushion;
        vx[i] *= K.cushionTangent;
        hit = 1;
      }
      if (hit) {
        if (i === S) cushions += 1;
        ev({ t, k: 'cushion', id: id[i], v: Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]) });
      }
    }

    function collide(i, j) {
      const dx = x[j] - x[i];
      const dy = y[j] - y[i];
      const rr = r[i] + r[j];
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) return;
      let d = Math.sqrt(d2);
      let nx;
      let ny;
      if (d > 1e-9) {
        nx = dx / d;
        ny = dy / d;
      } else {
        // Exact overlap: fixed tie-break direction so every engine agrees.
        nx = 1;
        ny = 0;
        d = 0;
      }
      const wi = 1 / m[i];
      const wj = 1 / m[j];
      const vrel = (vx[i] - vx[j]) * nx + (vy[i] - vy[j]) * ny;
      if (vrel > 0) {
        const e = i === S || j === S ? K.eStriker : K.eMan;
        const J = ((1 + e) * vrel) / (wi + wj);
        vx[i] -= J * wi * nx;
        vy[i] -= J * wi * ny;
        vx[j] += J * wj * nx;
        vy[j] += J * wj * ny;
        moving[i] = 1;
        moving[j] = 1;
        if (i === S || j === S) {
          if (!touched) firstHit = i === S ? id[j] : id[i];
          touched = true;
        }
        ev({ t, k: 'hit', a: id[i], b: id[j], v: vrel });
      }
      const over = rr - d;
      if (over > 0) {
        const ci = (over * wi) / (wi + wj);
        const cj = (over * wj) / (wi + wj);
        x[i] -= nx * ci;
        y[i] -= ny * ci;
        x[j] += nx * cj;
        y[j] += ny * cj;
      }
    }

    function step() {
      if (done) return false;
      t += K.dt;
      for (let i = 0; i < n; i++) {
        if (!alive[i] || !moving[i]) continue;
        const x0 = x[i];
        const y0 = y[i];
        x[i] += vx[i] * K.dt;
        y[i] += vy[i] * K.dt;
        if (pocketCheck(i, x0, y0)) continue;
        walls(i);
      }
      for (let i = 0; i < n; i++) {
        if (!alive[i] || !moving[i]) continue;
        for (let j = 0; j < n; j++) {
          if (j === i || !alive[j]) continue;
          if (moving[j] && j < i) continue;
          collide(i, j);
        }
      }
      let any = false;
      for (let i = 0; i < n; i++) {
        if (!alive[i] || !moving[i]) continue;
        const sp = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]);
        const dv = fr[i] * K.dt;
        if (sp <= dv) {
          vx[i] = 0;
          vy[i] = 0;
          moving[i] = 0;
          // A man coming to rest over the hole drops in ("perilously at the mouth", ICF 71).
          pocketCheck(i, x[i], y[i]);
        } else {
          const k = (sp - dv) / sp;
          vx[i] *= k;
          vy[i] *= k;
          any = true;
        }
      }
      if (!any || t >= K.maxSteps) {
        done = true;
        for (let i = 0; i < n; i++) moving[i] = 0;
      }
      return !done;
    }

    return {
      get t() {
        return t;
      },
      get done() {
        return done;
      },
      /** Advance up to `steps` ms; returns true while anything still moves. */
      step(steps) {
        const k = steps || 1;
        for (let s = 0; s < k && !done; s++) step();
        return !done;
      },
      run() {
        while (!done) step();
        return this.result();
      },
      /** Live positions for drawing (mm). */
      bodies() {
        const out = [];
        for (let i = 0; i < n; i++) out.push({ id: id[i], c: col[i], x: x[i], y: y[i], r: r[i], alive: !!alive[i], moving: !!moving[i] });
        return out;
      },
      drainEvents() {
        return events.splice(0);
      },
      result() {
        const left = [];
        for (let i = 0; i < n - 1; i++) {
          if (alive[i]) left.push({ id: id[i], c: col[i], x: Math.round(x[i] * 100), y: Math.round(y[i] * 100) });
        }
        return {
          pieces: left,
          pocketed: pocketed.slice(),
          touched,
          firstHit,
          cushions,
          steps: t,
          striker: alive[S] ? { x: Math.round(x[S] * 100), y: Math.round(y[S] * 100) } : null,
        };
      },
    };
  }

  function simulate(pieces, striker, opts) {
    return createSim(pieces, striker, opts).run();
  }

  /** Stable fingerprint of a result (determinism tests + client/server parity). */
  function fingerprint(res) {
    const parts = res.pieces.map((p) => p.id + ':' + p.x + ',' + p.y);
    parts.push('P' + res.pocketed.map((p) => p.id + '@' + p.pocket + '/' + p.t).join(';'));
    parts.push('T' + (res.touched ? 1 : 0) + res.steps);
    let h = 2166136261 >>> 0;
    const s = parts.join('|');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8);
  }

  return {
    PI,
    BOARD,
    CENTRE: C,
    MAN_R,
    STRIKER_R,
    MAN_M,
    STRIKER_M,
    POCKET_R,
    POCKETS,
    BASE_DEPTH,
    FORWARD,
    RIGHT,
    K,
    dsin,
    dcos,
    toBoard,
    strikerFromInput,
    createSim,
    simulate,
    fingerprint,
  };
});
