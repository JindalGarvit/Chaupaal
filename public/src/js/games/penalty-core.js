/**
 * Penalty Shootout core — pure + seeded. Shared by the client (vs AI · Pass & Play) and
 * server-lib/penalty-engine.js (Live 1v1, where the server resolves every kick).
 *
 * Goal space, kicker's view: x ∈ [-1, 1] post to post, y ∈ [0, 1] ground to crossbar.
 * A kick is { x, y, power } (aim point + power 0..1); a dive is { x, y, t } (dive point +
 * timing 0 = early … 1 = late). resolveKick(kick, dive, seed) is deterministic.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PenaltyCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---- geometry (metres) ----
  const GOAL_W = 7.32;
  const GOAL_H = 2.44;
  const HALF_W = GOAL_W / 2;
  /** Post / bar half-thickness in goal units (a little generous so the woodwork gets hit). */
  const POST = 0.03;
  const BAR = 0.04;

  /**
   * Outcome model tuning (scripts/test-dangal-h2-penalty.js pins the resulting rates).
   * wobble: aim scatter radius (goal units) = wobbleMin + wobbleK · power² — drawn for the kicker.
   * reach: metres the keeper covers around the dive point — early (t=0) widest, late (t=1) least,
   *   shrunk by shot power (less time to stretch).
   * pull: a late keeper reacts toward the ball — pullMax · t^pullT · (1 − power)^pullExp metres;
   *   an early keeper has committed and gets ~none (can be sent the wrong way).
   * back: a side dive covers little behind its own direction — ×(backEarly … 1) from early to late.
   */
  const TUNE = {
    wobbleMin: 0.03,
    wobbleK: 0.3,
    reachEarly: 2.05,
    reachLate: 1.05,
    reachPowerCut: 0.3,
    pullMax: 4.8,
    pullT: 1,
    pullExp: 1.3,
    backEarly: 0.45,
  };
  const POWER_MIN = 0.1;
  /** Panenka = soft chip down the middle. */
  const CHIP_POWER = 0.32;
  const CHIP_X = 0.25;
  const CHIP_Y = 0.4;

  const KEEPER_STANCE = { x: 0, y: 0.4 };
  const DIVE_X = { left: -0.62, centre: 0, right: 0.62 };
  const DIVE_Y = { low: 0.22, high: 0.68 };

  const BEST_OF = [3, 5, 10];
  const LEVELS = ['easy', 'medium', 'hard'];

  /** Fictional colourways only — no clubs, crests or national kits. */
  const KITS = [
    { id: 'crimson', name: 'Crimson', primary: '#D32F2F', secondary: '#FFFFFF', pattern: 'solid' },
    { id: 'royal', name: 'Royal', primary: '#1E4DB7', secondary: '#FFFFFF', pattern: 'stripes' },
    { id: 'emerald', name: 'Emerald', primary: '#1B8A4B', secondary: '#F5F5F5', pattern: 'hoops' },
    { id: 'sunburst', name: 'Sunburst', primary: '#F9B200', secondary: '#1A1A1A', pattern: 'halves' },
    { id: 'midnight', name: 'Midnight', primary: '#1B1F3B', secondary: '#7FD1FF', pattern: 'sash' },
    { id: 'tangerine', name: 'Tangerine', primary: '#FF6F00', secondary: '#FFFFFF', pattern: 'solid' },
    { id: 'violet', name: 'Violet', primary: '#6A3DC8', secondary: '#FFD54F', pattern: 'stripes' },
    { id: 'ice', name: 'Ice', primary: '#E8F4FA', secondary: '#0D47A1', pattern: 'hoops' },
  ];
  const GLOVES = ['#C6FF00', '#FF4081', '#00E5FF', '#FFFFFF', '#FF9100'];

  function clamp(v, lo, hi) {
    const n = Number(v);
    if (!Number.isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, n));
  }
  function r3(v) {
    return Math.round(v * 1000) / 1000;
  }

  // ---- seeded rng ----
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashSeed(str) {
    let h = 2166136261 >>> 0;
    const s = String(str == null ? '' : str);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }
  function between(rng, lo, hi) {
    return lo + (hi - lo) * rng();
  }

  // ---- inputs ----
  function validNum(v) {
    return typeof v === 'number' && Number.isFinite(v);
  }
  function isKick(k) {
    return !!k && validNum(k.x) && validNum(k.y) && validNum(k.power);
  }
  function isDive(d) {
    return !!d && validNum(d.x) && validNum(d.y) && validNum(d.t);
  }
  function normKick(k) {
    const o = k || {};
    return { x: r3(clamp(o.x, -1.5, 1.5)), y: r3(clamp(o.y, 0, 1.5)), power: r3(clamp(o.power, POWER_MIN, 1)) };
  }
  function normDive(d) {
    const o = d || {};
    return { x: r3(clamp(o.x, -1, 1)), y: r3(clamp(o.y, 0, 1)), t: r3(clamp(o.t, 0, 1)) };
  }
  function wobbleRadius(power) {
    const p = clamp(power, 0, 1);
    return TUNE.wobbleMin + TUNE.wobbleK * p * p;
  }
  function isChip(kick) {
    const k = normKick(kick);
    return k.power <= CHIP_POWER && Math.abs(k.x) <= CHIP_X && k.y >= CHIP_Y;
  }
  function sideOf(x) {
    return x < -0.25 ? 'left' : x > 0.25 ? 'right' : 'centre';
  }

  /** Keeper coverage for a timing value — exposed so the UI can show honest hints. */
  function keeperReach(t, power) {
    const tt = clamp(t, 0, 1);
    const p = clamp(power == null ? 0.5 : power, 0, 1);
    return (TUNE.reachEarly - (TUNE.reachEarly - TUNE.reachLate) * tt) * (1 + TUNE.reachPowerCut * (0.5 - p));
  }
  function keeperPull(t, power) {
    return TUNE.pullMax * Math.pow(clamp(t, 0, 1), TUNE.pullT) * Math.pow(1 - clamp(power, 0, 1), TUNE.pullExp);
  }

  /**
   * Resolve one kick. Same inputs → same result.
   * @returns {{ result: 'goal'|'save'|'miss'|'post', detail: string, ball: {x:number,y:number},
   *   keeper: {x:number,y:number}, power: number, chip: boolean, panenka: boolean, margin: number }}
   */
  function resolveKick(kickIn, diveIn, seed) {
    const k = normKick(kickIn);
    const d = normDive(diveIn);
    const rng = mulberry32((seed >>> 0) || 1);
    const r = wobbleRadius(k.power);
    const ang = rng() * Math.PI * 2;
    const rad = r * Math.sqrt(rng());
    const bx = r3(k.x + Math.cos(ang) * rad);
    const by = r3(Math.max(0, k.y + Math.sin(ang) * rad));
    const chip = isChip(k);
    const base = { ball: { x: bx, y: by }, power: k.power, chip, panenka: false, margin: 0 };

    const ax = Math.abs(bx);
    const onPost = ax >= 1 - POST && ax <= 1 + POST && by <= 1 + BAR;
    const onBar = by >= 1 - BAR && by <= 1 + BAR && ax < 1 - POST;
    // The keeper still dives on a miss — to where they committed.
    const idle = { x: d.x, y: d.y };
    if (onPost || onBar) {
      return Object.assign(base, { result: 'post', detail: onPost ? 'post' : 'bar', keeper: idle });
    }
    const wide = ax > 1 + POST;
    const over = by > 1 + BAR;
    if (wide || over) {
      const detail = wide && over ? (ax - 1 > (by - 1) * (GOAL_H / HALF_W) ? 'wide' : 'over') : wide ? 'wide' : 'over';
      return Object.assign(base, { result: 'miss', detail, keeper: idle });
    }

    const dxm = (bx - d.x) * HALF_W;
    const dym = (by - d.y) * GOAL_H;
    const dist = Math.hypot(dxm, dym);
    const pull = keeperPull(d.t, k.power);
    let reach = keeperReach(d.t, k.power);
    const diveDx = d.x - KEEPER_STANCE.x;
    if (Math.abs(diveDx) >= 0.2 && (bx - d.x) * diveDx < 0) {
      reach *= TUNE.backEarly + (1 - TUNE.backEarly) * d.t;
    }
    const eff = Math.max(0, dist - pull);
    const moved = Math.min(pull, dist);
    const kx = dist > 0 ? d.x + (dxm / dist) * (moved / HALF_W) : d.x;
    const ky = dist > 0 ? d.y + (dym / dist) * (moved / GOAL_H) : d.y;
    if (eff <= reach) {
      const detail = eff < reach * 0.45 && k.power < 0.75 ? 'catch' : 'parry';
      return Object.assign(base, {
        result: 'save',
        detail,
        keeper: { x: bx, y: by },
        margin: r3(reach - eff),
      });
    }
    return Object.assign(base, {
      result: 'goal',
      detail: '',
      keeper: { x: r3(kx), y: r3(ky) },
      panenka: chip && Math.abs(d.x) >= 0.3,
      margin: r3(eff - reach),
    });
  }

  // ---- shootout (IFAB Law 10 kicks, adapted) ----
  function normBestOf(n) {
    const v = Number(n);
    return BEST_OF.indexOf(v) >= 0 ? v : 5;
  }
  function createShootout(opts) {
    return { bestOf: normBestOf(opts && opts.bestOf), kicks: [] };
  }
  /** kicks: [{ side: 'A'|'B', goal: boolean }] — A always kicks first in each round. */
  function shootoutStatus(so) {
    const N = normBestOf(so && so.bestOf);
    const list = (so && so.kicks) || [];
    let a = 0;
    let b = 0;
    let ka = 0;
    let kb = 0;
    list.forEach((k) => {
      if (k.side === 'A') {
        ka += 1;
        if (k.goal) a += 1;
      } else {
        kb += 1;
        if (k.goal) b += 1;
      }
    });
    let winner = null;
    if (ka <= N && kb <= N) {
      if (a + (N - ka) < b) winner = 'B';
      else if (b + (N - kb) < a) winner = 'A';
    } else if (ka === kb && a !== b) {
      winner = a > b ? 'A' : 'B';
    }
    const next = ka === kb ? 'A' : 'B';
    const round = Math.max(ka, kb) + (ka === kb ? 1 : 0);
    return {
      over: !!winner,
      winner,
      scoreA: a,
      scoreB: b,
      kicksA: ka,
      kicksB: kb,
      next: winner ? null : next,
      round,
      sudden: !winner && round > N,
      bestOf: N,
    };
  }
  function addKick(so, side, goal) {
    const st = shootoutStatus(so);
    if (st.over) throw new Error('shootout_over');
    if (side !== st.next) throw new Error('out_of_turn');
    so.kicks.push({ side, goal: !!goal });
    return shootoutStatus(so);
  }
  /** Per side ⚽ / ❌ dots, padded with · up to best-of in regulation. */
  function dots(so, side, opts) {
    const N = normBestOf(so && so.bestOf);
    const list = ((so && so.kicks) || []).filter((k) => k.side === side);
    const marks = list.map((k) => (k.goal ? (opts && opts.goal) || '⚽' : (opts && opts.miss) || '❌'));
    while (marks.length < N && !(opts && opts.noPad)) marks.push((opts && opts.pad) || '·');
    return marks;
  }
  function shareText(so, names) {
    const st = shootoutStatus(so);
    const n = names || {};
    return (
      'Penalty Shootout · ' +
      (n.A || 'A') +
      ' ' +
      st.scoreA +
      '–' +
      st.scoreB +
      ' ' +
      (n.B || 'B') +
      (st.round > st.bestOf ? ' (sudden death)' : '') +
      '\n' +
      dots(so, 'A', { noPad: true }).join('') +
      '\n' +
      dots(so, 'B', { noPad: true }).join('')
    );
  }
  function cleanSheet(so, side) {
    const st = shootoutStatus(so);
    if (!st.over || st.winner !== side) return false;
    return (side === 'A' ? st.scoreB : st.scoreA) === 0;
  }

  // ---- random + AI choices ----
  function zoneDive(rng, t) {
    const xs = [DIVE_X.left, DIVE_X.centre, DIVE_X.right];
    return { x: xs[Math.floor(rng() * 3) % 3], y: rng() < 0.5 ? DIVE_Y.low : DIVE_Y.high, t };
  }
  /** Timeout fallback: a middling kick somewhere on target. */
  function randomKick(rng) {
    return normKick({ x: between(rng, -0.75, 0.75), y: between(rng, 0.1, 0.75), power: between(rng, 0.45, 0.75) });
  }
  function randomDive(rng) {
    return normDive(zoneDive(rng, r3(between(rng, 0.3, 0.7))));
  }

  function newMemory() {
    return { theirKicks: [], theirDives: [], mySides: [] };
  }
  /** Record what the human did so Hard can lean on tendencies within this match. */
  function remember(mem, kind, choice) {
    if (!mem) return;
    if (kind === 'kick' && isKick(choice)) mem.theirKicks.push({ x: choice.x, y: choice.y, power: choice.power });
    if (kind === 'dive' && isDive(choice)) mem.theirDives.push({ x: choice.x, t: choice.t });
    if (mem.theirKicks.length > 12) mem.theirKicks.shift();
    if (mem.theirDives.length > 12) mem.theirDives.shift();
  }
  function level(l) {
    return LEVELS.indexOf(l) >= 0 ? l : 'medium';
  }

  function aiKick(lvl, mem, rng) {
    const L = level(lvl);
    const m = mem || newMemory();
    let out;
    if (L === 'easy') {
      const s = rng() < 0.3 ? 0 : rng() < 0.5 ? -1 : 1;
      out = { x: s * between(rng, 0.15, 0.55), y: between(rng, 0.15, 0.65), power: between(rng, 0.3, 0.6) };
    } else if (L === 'medium') {
      const s = rng() < 0.18 ? 0 : rng() < 0.5 ? -1 : 1;
      out = { x: s === 0 ? between(rng, -0.15, 0.15) : s * between(rng, 0.5, 0.8), y: between(rng, 0.15, 0.8), power: between(rng, 0.5, 0.78) };
    } else {
      const dives = m.theirDives;
      const earlySide = dives.filter((d) => Math.abs(d.x) > 0.3 && d.t < 0.4).length;
      if (dives.length >= 3 && earlySide / dives.length >= 0.6 && rng() < 0.14) {
        out = { x: between(rng, -0.08, 0.08), y: between(rng, 0.5, 0.62), power: between(rng, 0.2, 0.26) };
      } else {
        // Lean away from the side the keeper favours; never the same corner three times running.
        const leftDives = dives.filter((d) => d.x < -0.3).length;
        const rightDives = dives.filter((d) => d.x > 0.3).length;
        let pLeft = (rightDives + 1) / (leftDives + rightDives + 2);
        const last2 = m.mySides.slice(-2);
        if (last2.length === 2 && last2[0] === last2[1]) pLeft = last2[0] === 'left' ? 0 : 1;
        const s = rng() < pLeft ? -1 : 1;
        const high = rng() < 0.5;
        out = {
          x: s * between(rng, 0.66, 0.82),
          y: high ? between(rng, 0.6, 0.76) : between(rng, 0.12, 0.3),
          power: between(rng, 0.62, 0.76),
        };
      }
    }
    const k = normKick(out);
    m.mySides.push(sideOf(k.x));
    if (m.mySides.length > 12) m.mySides.shift();
    return k;
  }

  function aiDive(lvl, mem, rng) {
    const L = level(lvl);
    const m = mem || newMemory();
    if (L === 'easy') return normDive(zoneDive(rng, r3(between(rng, 0.2, 0.8))));
    if (L === 'medium') {
      const s = rng();
      const x = s < 0.4 ? DIVE_X.left : s < 0.6 ? DIVE_X.centre : DIVE_X.right;
      return normDive({ x, y: rng() < 0.5 ? DIVE_Y.low : DIVE_Y.high, t: between(rng, 0.25, 0.75) });
    }
    const kicks = m.theirKicks;
    if (!kicks.length || rng() < 0.3) return normDive(zoneDive(rng, r3(between(rng, 0.35, 0.65))));
    const count = { left: 1, centre: 1, right: 1 };
    kicks.forEach((k) => {
      count[sideOf(k.x)] += 1;
    });
    const w = { left: Math.pow(count.left, 1.6), centre: Math.pow(count.centre, 1.6), right: Math.pow(count.right, 1.6) };
    const total = w.left + w.centre + w.right;
    const pick = rng() * total;
    const side = pick < w.left ? 'left' : pick < w.left + w.centre ? 'centre' : 'right';
    const avgY = kicks.reduce((s, k) => s + k.y, 0) / kicks.length;
    const avgP = kicks.reduce((s, k) => s + k.power, 0) / kicks.length;
    const high = rng() < 0.3 ? rng() < 0.5 : avgY > 0.5;
    const t = avgP > 0.68 ? between(rng, 0.05, 0.3) : avgP < 0.45 ? between(rng, 0.7, 0.95) : between(rng, 0.35, 0.65);
    return normDive({ x: DIVE_X[side], y: high ? DIVE_Y.high : DIVE_Y.low, t });
  }

  // ---- settings ----
  const DEFAULTS = { difficulty: 'medium', bestOf: 5, kitA: 'crimson', kitB: 'royal', gloves: GLOVES[0] };
  function kitById(id) {
    return KITS.find((k) => k.id === id) || null;
  }
  function mergeSettings(raw) {
    const r = raw || {};
    const out = Object.assign({}, DEFAULTS);
    if (LEVELS.indexOf(r.difficulty) >= 0) out.difficulty = r.difficulty;
    out.bestOf = normBestOf(r.bestOf);
    if (kitById(r.kitA)) out.kitA = r.kitA;
    if (kitById(r.kitB)) out.kitB = r.kitB;
    if (out.kitA === out.kitB) out.kitB = KITS.find((k) => k.id !== out.kitA).id;
    if (GLOVES.indexOf(r.gloves) >= 0) out.gloves = r.gloves;
    return out;
  }

  return {
    GOAL_W,
    GOAL_H,
    POST,
    BAR,
    TUNE,
    POWER_MIN,
    KEEPER_STANCE,
    DIVE_X,
    DIVE_Y,
    BEST_OF,
    LEVELS,
    KITS,
    GLOVES,
    DEFAULTS,
    mulberry32,
    hashSeed,
    isKick,
    isDive,
    normKick,
    normDive,
    wobbleRadius,
    keeperReach,
    keeperPull,
    isChip,
    sideOf,
    resolveKick,
    normBestOf,
    createShootout,
    shootoutStatus,
    addKick,
    dots,
    shareText,
    cleanSheet,
    randomKick,
    randomDive,
    newMemory,
    remember,
    aiKick,
    aiDive,
    kitById,
    mergeSettings,
  };
});
