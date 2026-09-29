/**
 * Street Cricket — gameplay model (P11). Shared by the phones, the Live server and the balance sim.
 *
 * The laws (what counts, who is out, free hits, reviews used) stay in cricket-engine.js. This file
 * decides what a ball *does*: the bowler's execution, the batter's contact, where it goes, whether
 * a run is safe, what the umpire gives and what ball-tracking shows. Every number that shapes an
 * outcome lives in the DATA tables below — tune them there (scripts/sim-cricket.js proves bands).
 *
 * Flow for one ball:
 *   plan  { type, line, length, variation } + accuracy (0..1 from the bowler's meter)
 *   → execute(plan, accuracy, rng)          → delivery { line, length, variation, extra, flightMs … }
 *   → timingOf(delivery, tapMs)             → 'early' | 'perfect' | 'late' | 'miss'
 *   → resolve({ delivery, shot, foot, run, timing, conf, field, pitch, rules … }, seed)
 *   → engine ball event { extra, runs, out, dir, dist, appeal? … }
 *
 * DRS-lite (Standard only): LBW and caught-behind events carry `appeal` with the umpire's on-field
 * call and simulated ball-tracking. The tracking is an honest simulation from the model's own
 * hidden trajectory (x = offset from middle stump in stump half-widths, h = height as a share of
 * stump height) — not real Hawk-Eye. Band: hitting (|x| ≤ 0.8 and h ≤ 0.8) → out · missing
 * (|x| > 1.2 or h > 1.2, or pitched outside leg) → not out · between → umpire's call.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CricketModel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ================================================================ DATA

  const TYPES = ['pace', 'spin'];
  const LINES = ['off', 'middle', 'leg', 'wide'];
  const LENGTHS = ['yorker', 'full', 'good', 'short', 'bouncer'];
  /** A missed length can become a full toss (never picked on purpose). */
  const ALL_LENGTHS = LENGTHS.concat(['fulltoss']);
  const VARIATIONS = {
    pace: ['stock', 'slower', 'cutter', 'bouncer', 'yorker'],
    spin: ['stock', 'turnIn', 'turnAway', 'armBall'],
  };
  /** Pace effort balls fix the length. */
  const VARIATION_LENGTH = { bouncer: 'bouncer', yorker: 'yorker' };

  const LABELS = {
    type: { pace: 'Pace', spin: 'Spin' },
    line: { off: 'Off', middle: 'Middle', leg: 'Leg', wide: 'Wide' },
    length: { yorker: 'Yorker', full: 'Full', good: 'Good', short: 'Short', bouncer: 'Bouncer', fulltoss: 'Full toss' },
    variation: { stock: 'Stock', slower: 'Slower ball', cutter: 'Cutter', bouncer: 'Bouncer', yorker: 'Yorker', turnIn: 'Turn in', turnAway: 'Turn away', armBall: 'Arm ball' },
    shot: { drive: 'Drive', cut: 'Cut', pull: 'Pull', sweep: 'Sweep', loft: 'Loft', flick: 'Flick', defend: 'Defend', leave: 'Leave' },
    field: { attacking: 'Attacking', balanced: 'Balanced', defensive: 'Defensive', protectOff: 'Protect off-side', protectLeg: 'Protect leg-side' },
    pitch: { flat: 'Flat', green: 'Green', dusty: 'Dusty', tarmac: 'Street tarmac' },
    run: { hold: 'Hold', one: 'Take 1', two: 'Push for 2' },
    foot: { stay: 'Stay back', out: 'Step out' },
  };

  const SHOTS = ['drive', 'cut', 'pull', 'sweep', 'loft', 'flick', 'defend', 'leave'];

  /**
   * Bowler execution. missP = (line + length + variation difficulty) × (1.1 − accuracy).
   * A miss turns into one of MISS_KIND's outcomes for the intended length.
   */
  const DIFFICULTY = {
    line: { off: 0.03, middle: 0.02, leg: 0.06, wide: 0.16 },
    length: { yorker: 0.45, full: 0.06, good: 0.03, short: 0.07, bouncer: 0.16 },
    variation: { stock: 0, slower: 0.08, cutter: 0.06, bouncer: 0.04, yorker: 0.06, turnIn: 0.04, turnAway: 0.05, armBall: 0.1 },
  };
  const MISS_KIND = {
    yorker: { fulltoss: 0.55, full: 0.2, wide: 0.12, noball: 0.13 },
    bouncer: { wide: 0.35, short: 0.5, noball: 0.15 },
    full: { fulltoss: 0.25, good: 0.45, wide: 0.15, noball: 0.15 },
    good: { full: 0.35, short: 0.35, wide: 0.15, noball: 0.15 },
    short: { good: 0.45, bouncer: 0.25, wide: 0.15, noball: 0.15 },
  };
  /** Missing a wide-line target: over the guideline → wide. */
  const WIDE_LINE_MISS = 0.7;
  /** Front-foot no-balls that have nothing to do with the target. */
  const OVERSTEP = { pace: 0.01, spin: 0.004 };

  /** Ball speed feel: run-up + flight (ms) and the timing windows as shares of the flight. */
  const TIMING = {
    pace: { runupMs: 420, flightMs: 950, zoneStart: 0.56, zoneEnd: 0.73, lateEnd: 0.92 },
    spin: { runupMs: 560, flightMs: 1250, zoneStart: 0.52, zoneEnd: 0.74, lateEnd: 0.93 },
  };
  const VARIATION_PACE = { stock: 1, slower: 1.3, cutter: 1.08, bouncer: 0.95, yorker: 1, turnIn: 1, turnAway: 1.02, armBall: 0.9 };
  /** Where the ball pitches (0 = bowler's crease, 1 = batter's crease) — the scene and the "read". */
  const PITCH_SPOT = { yorker: 0.95, full: 0.82, good: 0.7, short: 0.55, bouncer: 0.45, fulltoss: 1.05 };

  /** Contact: how right a shot is for the length and the line (1 = the textbook answer). */
  const SHOT_FIT = {
    drive: { length: { yorker: 0.45, full: 1, good: 0.72, short: 0.25, bouncer: 0.1, fulltoss: 1 }, line: { off: 1, middle: 0.9, leg: 0.55, wide: 0.85 } },
    cut: { length: { yorker: 0.1, full: 0.3, good: 0.65, short: 1, bouncer: 0.65, fulltoss: 0.5 }, line: { off: 1, middle: 0.45, leg: 0.15, wide: 1 } },
    pull: { length: { yorker: 0.05, full: 0.25, good: 0.55, short: 1, bouncer: 0.85, fulltoss: 0.75 }, line: { off: 0.55, middle: 0.95, leg: 1, wide: 0.25 } },
    sweep: { length: { yorker: 0.3, full: 0.92, good: 1, short: 0.3, bouncer: 0.05, fulltoss: 0.6 }, line: { off: 0.7, middle: 0.95, leg: 1, wide: 0.35 } },
    flick: { length: { yorker: 0.72, full: 0.95, good: 0.7, short: 0.35, bouncer: 0.15, fulltoss: 0.9 }, line: { off: 0.35, middle: 0.85, leg: 1, wide: 0.1 } },
    loft: { length: { yorker: 0.15, full: 0.95, good: 0.6, short: 0.35, bouncer: 0.2, fulltoss: 1 }, line: { off: 0.85, middle: 1, leg: 0.8, wide: 0.7 } },
    defend: { length: { yorker: 0.85, full: 0.92, good: 1, short: 0.78, bouncer: 0.62, fulltoss: 0.92 }, line: { off: 0.92, middle: 0.92, leg: 0.9, wide: 0.85 } },
  };
  /** Sweeping pace is a street special: allowed, but the fit is cut down. */
  const SWEEP_PACE = 0.45;
  /** Stepping out (spin only): lofts and drives get closer to the pitch of the ball. */
  const STEP_OUT = { loft: 0.25, drive: 0.15, other: -0.05, stumpedOnMiss: 0.6, stumpedOnBeaten: 0.18 };
  const SHOT_CLASS = { drive: 'ground', cut: 'ground', pull: 'ground', sweep: 'ground', flick: 'ground', loft: 'air', defend: 'block' };
  /** Which region the ball goes to (off / straight / leg), by shot and line. */
  const SHOT_REGION = {
    drive: { off: 'off', middle: 'straight', leg: 'leg', wide: 'off' },
    cut: { off: 'off', middle: 'off', leg: 'off', wide: 'off' },
    pull: { off: 'leg', middle: 'leg', leg: 'leg', wide: 'leg' },
    sweep: { off: 'leg', middle: 'leg', leg: 'leg', wide: 'leg' },
    flick: { off: 'leg', middle: 'leg', leg: 'leg', wide: 'leg' },
    loft: { off: 'off', middle: 'straight', leg: 'leg', wide: 'off' },
    defend: { off: 'straight', middle: 'straight', leg: 'straight', wide: 'off' },
  };
  const REGION_DIR = { off: [-120, -25], straight: [-25, 25], leg: [25, 130] };

  const TIMING_SCORE = { perfect: 1, early: 0.64, late: 0.66 };
  /** Deception: chance a variation turns a perfect read into early/late, plus its sting. */
  const DECEPTION = {
    stock: { p: 0, to: 'early' },
    slower: { p: 0.3, to: 'early' },
    cutter: { p: 0.16, to: 'late', edge: 1.3 },
    bouncer: { p: 0.08, to: 'late' },
    yorker: { p: 0.06, to: 'late' },
    turnIn: { p: 0.12, to: 'late', lbw: 1.3 },
    turnAway: { p: 0.14, to: 'late', edge: 1.35 },
    armBall: { p: 0.22, to: 'late', lbw: 1.4 },
  };
  /** Contact quality bands. */
  const BANDS = [
    ['middle', 0.8],
    ['good', 0.55],
    ['thin', 0.3],
    ['poor', 0],
  ];
  /**
   * The outcome table: shot class × contact band → weights. gapN = the ball finds a gap worth up
   * to N runs (the batter's running call decides how many they take). edge → keeper / slip or
   * runs off the edge. lbw = hit on the pad → an appeal (the umpire decides).
   */
  const OUTCOMES = {
    ground: {
      middle: { dot: 0.03, gap1: 0.18, gap2: 0.28, gap3: 0.12, four: 0.35, six: 0.03, edge: 0, caught: 0.01, bowled: 0, lbw: 0 },
      good: { dot: 0.06, gap1: 0.33, gap2: 0.27, gap3: 0.06, four: 0.23, six: 0.01, edge: 0.02, caught: 0.02, bowled: 0, lbw: 0 },
      thin: { dot: 0.28, gap1: 0.36, gap2: 0.12, gap3: 0.01, four: 0.08, six: 0, edge: 0.07, caught: 0.04, bowled: 0.03, lbw: 0.03 },
      poor: { dot: 0.46, gap1: 0.14, gap2: 0.01, gap3: 0, four: 0.02, six: 0, edge: 0.14, caught: 0.08, bowled: 0.08, lbw: 0.07 },
    },
    air: {
      middle: { dot: 0.02, gap1: 0.1, gap2: 0.08, gap3: 0.02, four: 0.26, six: 0.48, edge: 0, caught: 0.04, bowled: 0, lbw: 0 },
      good: { dot: 0.04, gap1: 0.19, gap2: 0.16, gap3: 0.04, four: 0.26, six: 0.2, edge: 0.03, caught: 0.08, bowled: 0, lbw: 0 },
      thin: { dot: 0.12, gap1: 0.26, gap2: 0.06, gap3: 0, four: 0.12, six: 0.05, edge: 0.1, caught: 0.22, bowled: 0.04, lbw: 0.03 },
      poor: { dot: 0.14, gap1: 0.08, gap2: 0, gap3: 0, four: 0.03, six: 0.01, edge: 0.12, caught: 0.38, bowled: 0.12, lbw: 0.12 },
    },
    block: {
      middle: { dot: 0.38, gap1: 0.48, gap2: 0.1, gap3: 0, four: 0.04, six: 0, edge: 0, caught: 0, bowled: 0, lbw: 0 },
      good: { dot: 0.5, gap1: 0.4, gap2: 0.06, gap3: 0, four: 0.02, six: 0, edge: 0.01, caught: 0.01, bowled: 0, lbw: 0 },
      thin: { dot: 0.68, gap1: 0.16, gap2: 0, gap3: 0, four: 0, six: 0, edge: 0.07, caught: 0.02, bowled: 0.04, lbw: 0.03 },
      poor: { dot: 0.54, gap1: 0.06, gap2: 0, gap3: 0, four: 0, six: 0, edge: 0.12, caught: 0.05, bowled: 0.12, lbw: 0.11 },
    },
  };
  /** No contact: leaving it or getting beaten. Risk to stumps / pad by line and length. */
  const LEAVE_RISK = {
    middle: { yorker: 0.5, full: 0.42, good: 0.3, short: 0.02, bouncer: 0, fulltoss: 0.4 },
    leg: { yorker: 0.38, full: 0.3, good: 0.2, short: 0.01, bouncer: 0, fulltoss: 0.3 },
    off: { yorker: 0.16, full: 0.1, good: 0.06, short: 0, bouncer: 0, fulltoss: 0.08 },
    wide: { yorker: 0, full: 0, good: 0, short: 0, bouncer: 0, fulltoss: 0 },
  };
  /** Late / missed swing: beaten, with a bigger share hitting stumps or pad. */
  const BEATEN_RISK_X = 1.25;
  /** Of stumps/pad risk: share bowled (rest = pad → LBW appeal). */
  const BOWLED_SHARE = 0.55;
  /** A beaten ball outside off draws a caught-behind appeal this often (a feather — or nothing). */
  const BEATEN_APPEAL = 0.18;
  const BYE_ON_BEATEN = 0.05;
  /** Off the edge: keeper / slip catch chance before the field multiplier; else these runs. */
  const EDGE = { catch: 0.36, four: 0.24, one: 0.36 };

  /**
   * Field presets, changeable between overs. Multipliers by region on catches and boundaries,
   * slip (edges carried), single risk and how often the ball finds a gap.
   */
  const FIELDS = {
    attacking: { catch: { off: 1.3, straight: 1.15, leg: 1.3 }, boundary: { off: 1.2, straight: 1.15, leg: 1.2 }, slip: 1.35, runRisk: 1.4, gap: 0.95 },
    balanced: { catch: { off: 1, straight: 1, leg: 1 }, boundary: { off: 1, straight: 1, leg: 1 }, slip: 1, runRisk: 1, gap: 1 },
    defensive: { catch: { off: 0.75, straight: 0.8, leg: 0.75 }, boundary: { off: 0.7, straight: 0.75, leg: 0.7 }, slip: 0.6, runRisk: 0.7, gap: 1.15 },
    protectOff: { catch: { off: 1.05, straight: 1, leg: 0.9 }, boundary: { off: 0.6, straight: 0.9, leg: 1.25 }, slip: 1, runRisk: 1, gap: 1 },
    protectLeg: { catch: { off: 0.9, straight: 1, leg: 1.05 }, boundary: { off: 1.25, straight: 0.9, leg: 0.6 }, slip: 1, runRisk: 1, gap: 1 },
  };
  const FIELD_ORDER = ['attacking', 'balanced', 'defensive', 'protectOff', 'protectLeg'];
  /** Where fielders stand for the scene (angle deg from straight down the ground, distance 0..1). */
  const FIELD_SPOTS = {
    attacking: [[-150, 0.28], [-135, 0.3], [-60, 0.35], [-20, 0.4], [20, 0.4], [70, 0.33], [150, 0.3], [-95, 0.9], [100, 0.9]],
    balanced: [[-145, 0.3], [-95, 0.45], [-50, 0.5], [-15, 0.55], [15, 0.55], [55, 0.5], [100, 0.5], [-70, 0.92], [80, 0.92]],
    defensive: [[-140, 0.35], [-100, 0.6], [-45, 0.93], [-10, 0.95], [10, 0.95], [50, 0.93], [110, 0.6], [-85, 0.94], [85, 0.94]],
    protectOff: [[-145, 0.3], [-110, 0.9], [-70, 0.93], [-35, 0.93], [-10, 0.6], [30, 0.5], [90, 0.5], [-90, 0.55], [140, 0.35]],
    protectLeg: [[-145, 0.3], [-80, 0.5], [-30, 0.5], [10, 0.6], [35, 0.93], [70, 0.93], [110, 0.9], [90, 0.55], [150, 0.4]],
  };

  /** Pitch conditions, rolled per match and shown before the toss. */
  const PITCHES = {
    flat: { carry: 1, seam: 0, turn: 0, boundary: 1.08, edge: 0.9, blurb: 'Flat: true bounce, little help for bowlers' },
    green: { carry: 1.12, seam: 0.12, turn: 0, boundary: 0.95, edge: 1.25, blurb: 'Green: pace carries and seams — edges fly' },
    dusty: { carry: 0.92, seam: 0, turn: 0.16, boundary: 0.97, edge: 1.1, blurb: 'Dusty: the ball grips and turns for spin' },
    tarmac: { carry: 1.18, seam: 0.04, turn: 0.04, boundary: 1.2, edge: 1, blurb: 'Street tarmac: skiddy, fast outfield, big hits' },
  };
  const PITCH_ORDER = ['flat', 'green', 'dusty', 'tarmac'];

  /**
   * Running: base run-out risk (× field.runRisk; × straight when hit down the ground).
   * safe[g] = taking the g runs the gap gives; push[g] = going for g+1; steal = a single off a dot.
   */
  const RUNNING = {
    safe: { 1: 0.006, 2: 0.015, 3: 0.03 },
    push: { 1: 0.2, 2: 0.26, 3: 0.3 },
    steal: 0.25,
    straight: 0.8,
  };

  /**
   * Set batter confidence (0–100) is tracked by the engine from the log (CricketEngine.CONFIDENCE:
   * builds with good contact, dips after edges and beats). Here: what it's worth — ±8% contact.
   */
  const CONFIDENCE = { start: 20, spread: 0.16 };

  /** Umpire and ball-tracking. */
  const UMPIRE = { sdX: 0.3, sdH: 0.2, edgeGiven: 0.9, noEdgeGiven: 0.12, bandIn: 0.8, bandOut: 1.2 };
  const TRACK_X = { off: [0.95, 0.5], middle: [0, 0.5], leg: [-1.05, 0.5], wide: [2.4, 0.5] };
  const TRACK_H = { yorker: 0.25, full: 0.45, good: 0.72, short: 1.25, bouncer: 2, fulltoss: 0.55 };
  const OUTSIDE_LEG = { leg: 0.45, middle: 0.04, off: 0, wide: 0 };

  /** Bot tiers (always labelled "Bot"). Timing distribution, read, accuracy and plan depth. */
  const TIERS = {
    easy: { label: 'Easy', timing: [0.5, 0.18, 0.22, 0.1], read: 0.55, accuracy: [0.5, 0.2], plan: 0, aggression: 0.4 },
    normal: { label: 'Normal', timing: [0.62, 0.14, 0.17, 0.07], read: 0.75, accuracy: [0.68, 0.16], plan: 1, aggression: 0.52 },
    hard: { label: 'Hard', timing: [0.72, 0.1, 0.13, 0.05], read: 0.88, accuracy: [0.8, 0.12], plan: 2, aggression: 0.6 },
    pro: { label: 'Pro', timing: [0.8, 0.08, 0.09, 0.03], read: 0.95, accuracy: [0.88, 0.08], plan: 3, aggression: 0.65 },
  };
  const TIER_ORDER = ['easy', 'normal', 'hard', 'pro'];

  /** Accuracy meter: the needle sweeps 0→1→0 every METER_MS; stopping on 0.5 is dead-on. */
  const METER_MS = 1600;

  // ================================================================ helpers

  function mulberry32(a) {
    let s = a >>> 0;
    return function () {
      let t = (s += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(weights, roll) {
    const keys = Object.keys(weights);
    let total = 0;
    keys.forEach((k) => (total += Math.max(0, weights[k])));
    let acc = 0;
    const x = roll * total;
    for (let i = 0; i < keys.length; i++) {
      acc += Math.max(0, weights[keys[i]]);
      if (x < acc) return keys[i];
    }
    return keys[keys.length - 1];
  }
  function gauss(rng) {
    const u = Math.max(1e-9, rng());
    const v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const one = (list, v, fb) => (list.indexOf(v) >= 0 ? v : fb);

  function normPlan(p) {
    const q = p || {};
    const type = one(TYPES, q.type, 'pace');
    const variation = one(VARIATIONS[type], q.variation, 'stock');
    const length = VARIATION_LENGTH[variation] || one(LENGTHS, q.length, 'good');
    return { type, line: one(LINES, q.line, 'off'), length, variation };
  }

  /** Needle position → accuracy (1 = dead centre). `ms` since the meter started. */
  function meterAccuracy(ms) {
    const t = ((Number(ms) || 0) % METER_MS + METER_MS) % METER_MS;
    const p = 1 - Math.abs((t / METER_MS) * 2 - 1);
    return clamp(1 - Math.abs(p - 0.5) * 2, 0, 1);
  }
  function missChance(plan, accuracy) {
    const p = normPlan(plan);
    const d = DIFFICULTY.line[p.line] + DIFFICULTY.length[p.length] + DIFFICULTY.variation[p.variation];
    return clamp(d * (1.1 - clamp(Number(accuracy) || 0, 0, 1)), 0, 0.95);
  }

  /**
   * Execute a plan: the bowler's accuracy decides whether the target is hit. Returns the delivery
   * the batter actually faces (with the timing profile for the scene and the tap).
   */
  function execute(plan, accuracy, rng) {
    const p = normPlan(plan);
    const out = { type: p.type, line: p.line, length: p.length, variation: p.variation, extra: '', missed: false, target: { line: p.line, length: p.length } };
    if (rng() < missChance(p, accuracy)) {
      out.missed = true;
      if (p.line === 'wide' && rng() < WIDE_LINE_MISS) out.extra = 'wd';
      else {
        const k = pick(MISS_KIND[p.length], rng());
        if (k === 'wide') out.extra = 'wd';
        else if (k === 'noball') out.extra = 'nb';
        else out.length = k;
      }
    }
    if (!out.extra && rng() < OVERSTEP[p.type]) out.extra = 'nb';
    const tm = TIMING[p.type];
    const k = VARIATION_PACE[p.variation] || 1;
    out.runupMs = tm.runupMs;
    out.flightMs = Math.round(tm.flightMs * k);
    const shift = out.length === 'fulltoss' ? 0.04 : out.length === 'yorker' ? 0.03 : out.length === 'bouncer' ? -0.05 : 0;
    out.zoneStart = round3(tm.zoneStart + shift);
    out.zoneEnd = round3(tm.zoneEnd + shift);
    out.lateEnd = round3(Math.min(0.99, tm.lateEnd + shift / 2));
    out.spot = PITCH_SPOT[out.length];
    return out;
  }
  function round3(v) {
    return Math.round(v * 1000) / 1000;
  }

  /** Tap time (ms since the run-up started) → timing bucket. null / no tap → 'miss'. */
  function timingOf(del, tMs) {
    if (tMs == null || !isFinite(Number(tMs))) return 'miss';
    const p = (Number(tMs) - del.runupMs) / del.flightMs;
    if (p < del.zoneStart) return 'early';
    if (p <= del.zoneEnd) return 'perfect';
    if (p <= del.lateEnd) return 'late';
    return 'miss';
  }
  /** The tap time (ms since run-up start) that lands mid-bucket — bots and replays use it. */
  function tapFor(del, timing) {
    const mid = timing === 'early' ? del.zoneStart - 0.1 : timing === 'perfect' ? (del.zoneStart + del.zoneEnd) / 2 : timing === 'late' ? (del.zoneEnd + del.lateEnd) / 2 : del.lateEnd + 0.1;
    return Math.round(del.runupMs + Math.max(0.02, mid) * del.flightMs);
  }

  function shotFit(shot, del, foot) {
    const f = SHOT_FIT[shot];
    if (!f) return 0;
    let fit = f.length[del.length] * f.line[del.line];
    if (shot === 'sweep' && del.type === 'pace') fit *= SWEEP_PACE;
    if (foot === 'out' && del.type === 'spin') fit += shot === 'loft' ? STEP_OUT.loft : shot === 'drive' ? STEP_OUT.drive : STEP_OUT.other;
    return clamp(fit, 0, 1);
  }
  function confMod(conf) {
    const c = clamp(Number(conf == null ? CONFIDENCE.start : conf), 0, 100);
    return 1 - CONFIDENCE.spread / 2 + (c / 100) * CONFIDENCE.spread;
  }
  /** "Set: +5%" — the honest UI number. */
  function confPercent(conf) {
    return Math.round((confMod(conf) - 1) * 100);
  }
  function bandOf(q) {
    for (let i = 0; i < BANDS.length; i++) if (q >= BANDS[i][1]) return BANDS[i][0];
    return 'poor';
  }

  /** Ball-tracking sample for a pad impact. */
  function trackFor(del, rng, lbwBoost) {
    const tx = TRACK_X[del.line] || TRACK_X.middle;
    const turn = del.variation === 'turnIn' ? -0.35 : del.variation === 'turnAway' ? 0.35 : del.variation === 'armBall' ? -0.15 : 0;
    const x = round3(tx[0] + turn + gauss(rng) * tx[1] * (lbwBoost ? 0.8 : 1));
    const h = round3(Math.max(0.05, (TRACK_H[del.length] || 0.7) + gauss(rng) * 0.18));
    const outsideLeg = rng() < (OUTSIDE_LEG[del.line] || 0);
    let band = 'umpires_call';
    if (outsideLeg || Math.abs(x) > UMPIRE.bandOut || h > UMPIRE.bandOut) band = 'missing';
    else if (Math.abs(x) <= UMPIRE.bandIn && h <= UMPIRE.bandIn) band = 'hitting';
    return { x, h, pitched: outsideLeg ? 'outside_leg' : 'in_line', band, spot: del.spot };
  }
  function umpireLbw(track, rng) {
    if (track.pitched === 'outside_leg') return rng() < 0.03 ? 'out' : 'notout';
    const x = Math.abs(track.x + gauss(rng) * UMPIRE.sdX);
    const h = track.h + gauss(rng) * UMPIRE.sdH;
    return x <= 1 && h <= 1 ? 'out' : 'notout';
  }
  /** Review verdict from tracking (LBW) or the edge truth (caught behind). */
  function reviewVerdict(appeal) {
    if (!appeal) return { decision: 'notout', result: 'stands' };
    const on = appeal.onField;
    if (appeal.kind === 'caught') {
      const truth = appeal.edge ? 'out' : 'notout';
      return { decision: truth, result: truth === on ? 'stands' : 'overturned' };
    }
    const band = appeal.track ? appeal.track.band : 'missing';
    if (band === 'umpires_call') return { decision: on, result: 'umpires_call' };
    const truth = band === 'hitting' ? 'out' : 'notout';
    return { decision: truth, result: truth === on ? 'stands' : 'overturned' };
  }

  function regionOf(shot, line) {
    const r = SHOT_REGION[shot];
    return r ? r[line] || 'straight' : 'straight';
  }
  function dirFor(region, rng) {
    const r = REGION_DIR[region] || REGION_DIR.straight;
    return Math.round(r[0] + rng() * (r[1] - r[0]));
  }
  const DIST = { 0: 0.28, 1: 0.45, 2: 0.66, 3: 0.82, 4: 1, 6: 1.15 };

  /**
   * Resolve one ball. input = { delivery (from execute), shot, foot, run, timing, conf, field,
   * pitch, rules, freeHit, firstBall }. Returns an engine ball event (+ appeal / meta for the UI).
   */
  function resolve(input, seed) {
    const i = input || {};
    const rng = mulberry32(seed >>> 0);
    const del = i.delivery || execute({}, 0.8, rng);
    const rules = i.rules || {};
    const field = FIELDS[i.field] || FIELDS.balanced;
    const pitch = PITCHES[i.pitch] || PITCHES.flat;
    const shot = SHOTS.indexOf(i.shot) >= 0 ? i.shot : 'defend';
    const foot = i.foot === 'out' && del.type === 'spin' ? 'out' : 'stay';
    const runCall = i.run === 'hold' || i.run === 'two' ? i.run : 'one';
    let timing = ['early', 'perfect', 'late', 'miss'].indexOf(i.timing) >= 0 ? i.timing : 'miss';
    const dec = DECEPTION[del.variation] || DECEPTION.stock;
    const ev = {
      t: 'ball',
      type: del.type,
      line: del.line,
      length: del.length,
      variation: del.variation,
      del: del.type,
      shot,
      foot,
      run: runCall,
      timing,
      contact: false,
      extra: del.extra || '',
      runs: 0,
      out: '',
      seed: seed >>> 0,
      spot: del.spot,
    };
    if (del.missed) ev.missed = 1;

    // A wide: no shot to play. Rarely runs away for four; stepping out to spin risks a stumping.
    if (ev.extra === 'wd') {
      ev.timing = 'none';
      ev.runs = rng() < 0.05 ? 4 : 0;
      if (foot === 'out' && rng() < 0.35) {
        ev.out = 'stumped';
        ev.runs = 0;
      }
      ev.band = 'none';
      return ev;
    }

    if (timing === 'perfect' && dec.p && rng() < dec.p) {
      timing = dec.to;
      ev.deceived = 1;
    }

    // Leave, or no contact at all.
    if (shot === 'leave' || timing === 'miss') {
      const beaten = shot !== 'leave';
      const base = (LEAVE_RISK[del.line] || LEAVE_RISK.off)[del.length] || 0;
      const risk = clamp(base * (beaten ? BEATEN_RISK_X : 1) * (del.variation === 'armBall' || del.variation === 'turnIn' ? 1.2 : 1), 0, 0.95);
      ev.band = beaten ? 'beaten' : 'left';
      if (rng() < risk) {
        if (rng() < BOWLED_SHARE) ev.out = 'bowled';
        else return lbwAppeal(ev, del, rng, rules, false);
      } else if (beaten && foot === 'out' && rng() < STEP_OUT.stumpedOnMiss) {
        ev.out = 'stumped';
      } else if (beaten && (del.line === 'off' || del.line === 'wide') && rng() < BEATEN_APPEAL) {
        return edgeAppeal(ev, rng, rules, false);
      } else if (beaten && rng() < BYE_ON_BEATEN) {
        ev.extra = ev.extra === 'nb' ? 'nb' : del.type === 'pace' ? 'b' : 'lb';
        ev.runs = 1;
      }
      return ev;
    }

    // Contact.
    ev.contact = true;
    const cls = SHOT_CLASS[shot];
    let q = (TIMING_SCORE[timing] || 0) * shotFit(shot, del, foot) * confMod(i.conf);
    const help = del.type === 'pace' ? pitch.seam : pitch.turn;
    q *= 1 - help * (del.variation === 'stock' ? 1 : 1.5) * (shot === 'defend' ? 0.5 : 1);
    if (del.type === 'pace' && (del.length === 'bouncer' || del.length === 'short')) q *= clamp(2 - pitch.carry, 0.8, 1.05);
    q = clamp(q, 0, 1.2);
    const band = bandOf(q);
    ev.band = band;
    ev.q = round3(q);
    const region = regionOf(shot, del.line);
    const w = Object.assign({}, OUTCOMES[cls][band]);
    // Field + pitch shift the table: removed catch / boundary weight becomes singles (cut off).
    const c0 = w.caught;
    w.caught *= field.catch[region];
    const b0 = w.four + w.six;
    w.four *= field.boundary[region] * pitch.boundary;
    w.six *= field.boundary[region] * pitch.boundary;
    const lost = Math.max(0, b0 - (w.four + w.six)) + Math.max(0, c0 - w.caught);
    w.gap1 += lost * 0.6;
    w.gap2 += lost * 0.25;
    w.dot += lost * 0.15;
    w.gap1 *= field.gap;
    w.edge *= pitch.edge * (dec.edge || 1);
    w.lbw *= dec.lbw || 1;
    const o = pick(w, rng());
    ev.dir = dirFor(region, rng);
    ev.region = region;

    if (o === 'bowled') ev.out = 'bowled';
    else if (o === 'lbw') return lbwAppeal(ev, del, rng, rules, true);
    else if (o === 'caught') {
      ev.out = 'caught';
      ev.dist = region === 'straight' ? 0.6 : 0.7;
    } else if (o === 'edge') {
      if (rng() < clamp(EDGE.catch * field.slip, 0, 0.95)) return edgeAppeal(ev, rng, rules, true);
      const r = rng();
      ev.dir = rng() < 0.5 ? -155 : 150;
      if (r < EDGE.four / field.slip) ev.runs = 4;
      else if (r < EDGE.four / field.slip + EDGE.one) ev.runs = runCall === 'hold' ? 0 : 1;
      ev.edged = 1;
    } else if (o === 'four') ev.runs = 4;
    else if (o === 'six') ev.runs = 6;
    else {
      const gap = o === 'gap1' ? 1 : o === 'gap2' ? 2 : o === 'gap3' ? 3 : 0;
      running(ev, gap, runCall, field, region, rules, rng);
    }
    // Street laws the engine will enforce, proposed here with their own chances.
    if (!ev.out && rules.bounceCatch && ev.runs <= 2 && (band === 'thin' || band === 'poor') && cls !== 'block' && rng() < (rules.bounceCatch === 'onehand' ? 0.3 : 0.26)) {
      ev.out = 'bouncecatch';
      ev.runs = 0;
    }
    if (!ev.out && rules.sixOut && ev.runs === 6) ev.out = 'sixout';
    if (ev.dist == null) ev.dist = DIST[ev.runs] || 0.5;
    return ev;
  }

  /**
   * Running call on a non-boundary: 'hold' = stay; 'one' = take what the gap gives (safe-ish);
   * 'two' = push for one more than the gap gives (or steal a single off a dot) — real run-out risk.
   * Tip and run forces at least a single.
   */
  function running(ev, gap, call, field, region, rules, rng) {
    const risk = (base) => clamp(base * field.runRisk * (region === 'straight' ? RUNNING.straight : 1), 0, 0.9);
    let c = call;
    if (rules.tipAndRun && c === 'hold') c = 'one';
    let want = 0;
    let p = 0;
    if (c === 'hold') want = 0;
    else if (c === 'one') {
      want = gap;
      p = gap ? risk(RUNNING.safe[gap]) : 0;
      if (!gap && rules.tipAndRun) {
        want = 1;
        p = risk(RUNNING.steal);
      }
    } else {
      want = Math.min(3, gap + 1);
      p = gap ? risk(RUNNING.push[gap]) : risk(RUNNING.steal);
    }
    ev.runCall = c;
    if (want && rng() < p) {
      ev.out = 'runout';
      ev.runs = Math.max(0, want - 1);
      ev.dist = 0.4;
      return;
    }
    ev.runs = want;
    if (rules.tipAndRun && want > 0 && gap === 0) ev.tipRun = 1;
  }

  function lbwAppeal(ev, del, rng, rules, contact) {
    if (del.length === 'bouncer' || del.length === 'short') {
      ev.band = ev.band || 'beaten';
      return ev;
    }
    const track = trackFor(del, rng, true);
    const onField = umpireLbw(track, rng);
    ev.appeal = { kind: 'lbw', onField, track, edge: false };
    ev.out = onField === 'out' ? 'lbw' : '';
    ev.contact = false;
    if (contact) ev.padded = 1;
    return ev;
  }
  function edgeAppeal(ev, rng, rules, edge) {
    const onField = rng() < (edge ? UMPIRE.edgeGiven : UMPIRE.noEdgeGiven) ? 'out' : 'notout';
    ev.appeal = { kind: 'caught', onField, edge: !!edge };
    ev.out = onField === 'out' ? 'caught' : '';
    ev.behind = 1;
    ev.dir = -165;
    ev.dist = 0.15;
    return ev;
  }

  /** Apply a review to a resolved event (returns a new event; engine counts the review). */
  function applyReview(ev, side) {
    const v = reviewVerdict(ev.appeal);
    const out = Object.assign({}, ev);
    out.drs = { by: side, result: v.result, decision: v.decision };
    out.out = v.decision === 'out' ? (ev.appeal.kind === 'lbw' ? 'lbw' : 'caught') : '';
    return out;
  }
  /** Who may review this appeal: the batting side reviews an out, the bowling side a not out. */
  function reviewer(ev) {
    if (!ev || !ev.appeal) return '';
    return ev.appeal.onField === 'out' ? 'bat' : 'bowl';
  }

  // ================================================================ bots

  function tierOf(id) {
    return TIERS[id] ? id : id === 'medium' ? 'normal' : 'normal';
  }

  /** Balls this batter has faced this innings (for the bowler's memory). */
  function batterBalls(state) {
    const inn = state && state.innings ? state.innings[state.cur] : null;
    if (!inn) return [];
    const s = inn.batters[inn.striker];
    return inn.balls.filter((b) => b.striker === (s && s.name));
  }

  /**
   * Bowling bot. Plans sequences (set up with short, then full; stock, stock, then the slower
   * one), leans on lengths the batter has struggled with this match (tier ≥ Hard) and bowls
   * yorkers at the death (Pro). Returns { plan, accuracy }.
   */
  function botBowl(ctx, seed) {
    const c = ctx || {};
    const tier = TIERS[tierOf(c.tier)];
    const rng = mulberry32((seed >>> 0) ^ 0x5bd1e995);
    const type = one(TYPES, c.type, 'pace');
    const hist = c.history || [];
    const last = hist[hist.length - 1];
    let length = 'good';
    let line = rng() < 0.6 ? 'off' : 'middle';
    let variation = 'stock';
    if (tier.plan === 0) {
      length = LENGTHS[Math.floor(rng() * LENGTHS.length)];
      line = LINES[Math.floor(rng() * 3)];
      if (rng() < 0.25) variation = VARIATIONS[type][Math.floor(rng() * VARIATIONS[type].length)];
    } else {
      const r = rng();
      length = r < 0.55 ? 'good' : r < 0.78 ? 'full' : r < 0.92 ? 'short' : 'yorker';
      if (tier.plan >= 1 && last) {
        // Sequences: after short → full or yorker; after a boundary → change length.
        if (last.length === 'short' || last.length === 'bouncer') length = rng() < 0.6 ? 'full' : 'yorker';
        else if (last.runs >= 4) length = last.length === 'full' ? 'good' : rng() < 0.5 ? 'short' : 'good';
      }
      if (tier.plan >= 2 && hist.length >= 3) {
        const weak = weakLength(hist);
        if (weak && rng() < 0.45) length = weak;
      }
      if (tier.plan >= 3 && c.death) length = rng() < 0.45 ? 'yorker' : rng() < 0.5 ? 'full' : 'short';
      if (type === 'pace') {
        if (length === 'bouncer' || (length === 'short' && rng() < 0.3)) variation = 'bouncer';
        else if (length === 'yorker' && tier.plan >= 2) variation = 'yorker';
        else if (tier.plan >= 1 && rng() < 0.12 + tier.plan * 0.05) variation = rng() < 0.6 ? 'slower' : 'cutter';
      } else {
        if (tier.plan >= 1 && rng() < 0.2 + tier.plan * 0.06) variation = ['turnIn', 'turnAway', 'armBall'][Math.floor(rng() * 3)];
        if (length === 'short' || length === 'bouncer') length = 'good';
        if (length === 'yorker' && tier.plan < 3) length = 'full';
      }
      if (last && last.shot === 'cut' && last.runs >= 2) line = 'middle';
      if (last && (last.shot === 'flick' || last.shot === 'pull') && last.runs >= 2) line = 'off';
      if (c.field === 'protectOff') line = rng() < 0.7 ? 'off' : 'wide';
      if (c.field === 'protectLeg') line = rng() < 0.7 ? 'leg' : 'middle';
    }
    const plan = normPlan({ type, line, length, variation });
    const acc = clamp(tier.accuracy[0] + gauss(rng) * tier.accuracy[1], 0, 1);
    return { plan, accuracy: round3(acc) };
  }
  function weakLength(hist) {
    const by = {};
    hist.forEach((b) => {
      const k = b.length;
      if (!k || k === 'fulltoss') return;
      by[k] = by[k] || { n: 0, r: 0, w: 0 };
      by[k].n += 1;
      by[k].r += b.runs || 0;
      by[k].w += b.out ? 1 : 0;
    });
    let best = '';
    let score = Infinity;
    Object.keys(by).forEach((k) => {
      const s = (by[k].r - 12 * by[k].w + 1) / (by[k].n + 1);
      if (by[k].n >= 2 && s < score) {
        score = s;
        best = k;
      }
    });
    return best;
  }

  /** The best shot for a read of line + length, weighing aggression and the field. */
  function bestShot(del, aggression, fieldId, foot) {
    let best = 'defend';
    let bestV = -Infinity;
    const f = FIELDS[fieldId] || FIELDS.balanced;
    SHOTS.forEach((s) => {
      if (s === 'leave') return;
      const fit = shotFit(s, del, foot);
      const cls = SHOT_CLASS[s];
      const reg = regionOf(s, del.line);
      let v;
      if (cls === 'block') v = 0.15 + (1 - aggression) * 0.45;
      else v = fit * (cls === 'air' ? 0.9 + aggression * 0.9 : 1 + aggression * 0.3) * (0.7 + 0.3 * f.boundary[reg]) - (1 - fit) * (cls === 'air' ? 1.3 : 0.8);
      if (v > bestV) {
        bestV = v;
        best = s;
      }
    });
    if ((del.line === 'wide' || del.line === 'off') && (del.length === 'short' || del.length === 'bouncer') && aggression < 0.35) best = 'leave';
    return best;
  }

  /**
   * Batting bot: reads the ball (tier read → sometimes a neighbouring length), adapts to the
   * required rate and field, then picks timing from the tier. Returns { shot, foot, run, timing }.
   */
  function botBat(ctx, seed) {
    const c = ctx || {};
    const tier = TIERS[tierOf(c.tier)];
    const rng = mulberry32((seed >>> 0) ^ 0x27d4eb2d);
    const del = c.delivery || { type: 'pace', line: 'off', length: 'good', variation: 'stock' };
    const read = Object.assign({}, del);
    if (rng() > tier.read) {
      const i = ALL_LENGTHS.indexOf(del.length);
      read.length = ALL_LENGTHS[clamp(i + (rng() < 0.5 ? -1 : 1), 0, LENGTHS.length - 1)];
    }
    const rrr = Number(c.rrr) || 0;
    const ballsLeft = Number(c.ballsLeft) || 30;
    let aggression = tier.aggression;
    if (rrr > 12) aggression += 0.35;
    else if (rrr > 9) aggression += 0.2;
    else if (c.target && rrr < 6) aggression -= 0.15;
    if (c.lastWicket) aggression -= 0.2;
    if (!c.target && ballsLeft <= 6) aggression += 0.25;
    if (c.field === 'defensive') aggression -= 0.05;
    aggression = clamp(aggression, 0, 1);
    const foot = del.type === 'spin' && aggression > 0.55 && rng() < 0.35 ? 'out' : 'stay';
    let shot = bestShot(read, aggression, c.field, foot);
    if (tier.plan === 0 && rng() < 0.25) shot = SHOTS[Math.floor(rng() * 7)];
    const t = rng();
    const p = tier.timing;
    const timing = t < p[0] ? 'perfect' : t < p[0] + p[1] ? 'early' : t < p[0] + p[1] + p[2] ? 'late' : 'miss';
    // Push for the extra run only when the chase demands it; never on the last wicket unless desperate.
    let run = 'one';
    const need = Number(c.need) || 0;
    const desperate = c.target && (rrr > 15 || (ballsLeft <= 2 && need > 4 * ballsLeft - 2));
    if (desperate && (!c.lastWicket || ballsLeft <= 1)) run = 'two';
    else if (c.target && ballsLeft === 1 && need === 2 && tier.plan >= 2) run = 'two';
    return { shot, foot, run, timing };
  }

  /** Field choice per over for the bowling bot. */
  function botField(ctx, seed) {
    const c = ctx || {};
    const tier = TIERS[tierOf(c.tier)];
    const rng = mulberry32((seed >>> 0) ^ 0x68e31da4);
    if (tier.plan === 0) return FIELD_ORDER[Math.floor(rng() * 3)];
    const rrr = Number(c.rrr) || 0;
    if (c.newBatter && !(c.target && rrr > 12)) return 'attacking';
    if (c.target && rrr > 11) return 'defensive';
    if (c.death) return 'defensive';
    if (tier.plan >= 2 && c.favoured) return c.favoured === 'off' ? 'protectOff' : 'protectLeg';
    return 'balanced';
  }
  /** Pace or spin for the over: dusty tracks and slow runs lean to spin. */
  function botType(ctx, seed) {
    const c = ctx || {};
    const rng = mulberry32((seed >>> 0) ^ 0x1b873593);
    const spinP = c.pitch === 'dusty' ? 0.65 : c.pitch === 'green' ? 0.2 : c.pitch === 'tarmac' ? 0.3 : 0.4;
    return rng() < spinP ? 'spin' : 'pace';
  }
  /** Whether a bot reviews: Pro/Hard read the tracking better (still honest: no peeking at truth beyond noise). */
  function botReview(ev, tierId, seed) {
    if (!ev || !ev.appeal) return false;
    const tier = TIERS[tierOf(tierId)];
    const rng = mulberry32((seed >>> 0) ^ 0x3c6ef372);
    const a = ev.appeal;
    let belief;
    if (a.kind === 'caught') belief = a.edge ? 0.8 : 0.3;
    else {
      const x = Math.abs(a.track.x + gauss(rng) * (0.6 - tier.read * 0.4));
      belief = a.track.pitched === 'outside_leg' ? 0.2 : x <= 0.8 && a.track.h <= 0.8 ? 0.8 : x > 1.2 || a.track.h > 1.2 ? 0.15 : 0.5;
    }
    const wantOut = a.onField === 'notout';
    const confidence = wantOut ? belief : 1 - belief;
    return confidence > 0.62 - tier.plan * 0.03;
  }

  /** Per-over: favoured scoring region of the current batter (for protect fields). */
  function favouredRegion(state) {
    const balls = batterBalls(state);
    let off = 0;
    let leg = 0;
    balls.forEach((b) => {
      if (!b.runs || !b.region) return;
      if (b.region === 'off') off += b.runs;
      if (b.region === 'leg') leg += b.runs;
    });
    if (off + leg < 8) return '';
    return off > leg * 1.6 ? 'off' : leg > off * 1.6 ? 'leg' : '';
  }

  /** Stock ball the server bowls when the bowler times out. */
  function stockPlan(type) {
    return { type: one(TYPES, type, 'pace'), line: 'off', length: 'good', variation: 'stock' };
  }

  function rollPitch(preset, seed) {
    if (preset === 'gully') return 'tarmac';
    const r = mulberry32((seed >>> 0) ^ 0x85ebca6b)();
    return r < 0.4 ? 'flat' : r < 0.7 ? 'green' : 'dusty';
  }

  return {
    TYPES,
    LINES,
    LENGTHS,
    ALL_LENGTHS,
    VARIATIONS,
    VARIATION_LENGTH,
    LABELS,
    SHOTS,
    DIFFICULTY,
    MISS_KIND,
    OVERSTEP,
    TIMING,
    VARIATION_PACE,
    PITCH_SPOT,
    SHOT_FIT,
    SHOT_CLASS,
    SHOT_REGION,
    TIMING_SCORE,
    DECEPTION,
    BANDS,
    OUTCOMES,
    LEAVE_RISK,
    EDGE,
    FIELDS,
    FIELD_ORDER,
    FIELD_SPOTS,
    PITCHES,
    PITCH_ORDER,
    RUNNING,
    CONFIDENCE,
    UMPIRE,
    TIERS,
    TIER_ORDER,
    METER_MS,
    mulberry32,
    normPlan,
    meterAccuracy,
    missChance,
    execute,
    timingOf,
    tapFor,
    shotFit,
    confMod,
    confPercent,
    bandOf,
    regionOf,
    resolve,
    reviewVerdict,
    applyReview,
    reviewer,
    tierOf,
    batterBalls,
    botBowl,
    botBat,
    botField,
    botType,
    botReview,
    bestShot,
    favouredRegion,
    stockPlan,
    rollPitch,
  };
});
