#!/usr/bin/env node
/**
 * Street Cricket balance sim — bot-vs-bot matches through CricketModel (gameplay) and
 * CricketEngine (laws), ball by ball with applyEvent. Measures, per format × preset:
 *   score bands (first-innings totals), wicket rate, boundary share of runs, extras rate,
 *   reviews; the skill gradient (perfect vs random player); tier ladder; and an EV table of
 *   shot × delivery to show there is no dominant strategy.
 *
 *   node scripts/sim-cricket.js            # 10,000 matches per format + preset (Normal v Normal)
 *   node scripts/sim-cricket.js --n=2000   # quicker
 *
 * The tests (scripts/test-dangal-p11-cricket.js) require this module and run smaller samples.
 */
'use strict';

const CE = require('../public/src/js/games/cricket-engine.js');
const CM = require('../public/src/js/games/cricket-model.js');

/** Balance targets (Normal Bot v Normal Bot). Documented in CONVENTIONS (P11). */
const TARGETS = {
  score: { superquick: [6, 16], quick: [12, 30], standard: [40, 70], long: [75, 130] },
  /** Balls per wicket across all formats. */
  ballsPerWicket: [9, 20],
  /** Share of batting runs from fours and sixes. */
  boundaryShare: [0.35, 0.6],
  /** Wides + no-balls per delivery. */
  extrasRate: [0.02, 0.07],
  /** A perfect player beats a random one at least this often. */
  perfectVsRandom: 0.9,
};

const EV_WICKET = 15;

// ---------------------------------------------------------------- players

/** A bot player at a tier (what vs-AI and the sim use). */
function botPlayer(tier) {
  return {
    tier,
    over(ctx, seed) {
      return { type: CM.botType(ctx, seed), field: CM.botField(Object.assign({ tier }, ctx), seed + 7) };
    },
    bowl(ctx, seed) {
      return CM.botBowl(Object.assign({ tier }, ctx), seed);
    },
    bat(ctx, seed) {
      return CM.botBat(Object.assign({ tier }, ctx), seed);
    },
    review(ev, seed) {
      return CM.botReview(ev, tier, seed);
    },
  };
}

/** Perfect player: dead-on meter, planned bowling, a true read and perfect timing every ball. */
function perfectPlayer() {
  const pro = botPlayer('pro');
  return {
    tier: 'perfect',
    over: pro.over,
    bowl(ctx, seed) {
      const b = CM.botBowl(Object.assign({}, ctx, { tier: 'pro' }), seed);
      return { plan: b.plan, accuracy: 1 };
    },
    bat(ctx, seed) {
      const b = CM.botBat(Object.assign({}, ctx, { tier: 'pro' }), seed);
      const del = ctx.delivery;
      const aggr = ctx.rrr > 12 ? 0.9 : ctx.rrr > 9 ? 0.75 : ctx.lastWicket ? 0.35 : 0.6;
      return { shot: CM.bestShot(del, aggr, ctx.field, b.foot), foot: b.foot, run: b.run, timing: 'perfect' };
    },
    review(ev) {
      if (!ev.appeal) return false;
      const v = CM.reviewVerdict(ev.appeal);
      return v.result === 'overturned';
    },
  };
}

/** Random player: random plans, random meter, random shots, taps anywhere in the flight. */
function randomPlayer() {
  return {
    tier: 'random',
    over(ctx, seed) {
      const r = CM.mulberry32(seed);
      return { type: r() < 0.5 ? 'pace' : 'spin', field: CM.FIELD_ORDER[Math.floor(r() * CM.FIELD_ORDER.length)] };
    },
    bowl(ctx, seed) {
      const r = CM.mulberry32(seed);
      const type = ctx.type;
      const vars = CM.VARIATIONS[type];
      return {
        plan: { type, line: CM.LINES[Math.floor(r() * 4)], length: CM.LENGTHS[Math.floor(r() * 5)], variation: vars[Math.floor(r() * vars.length)] },
        accuracy: r(),
      };
    },
    bat(ctx, seed) {
      const r = CM.mulberry32(seed);
      const del = ctx.delivery;
      const tap = del.runupMs + r() * 1.1 * del.flightMs;
      return {
        shot: CM.SHOTS[Math.floor(r() * CM.SHOTS.length)],
        foot: r() < 0.5 ? 'out' : 'stay',
        run: ['hold', 'one', 'two'][Math.floor(r() * 3)],
        timing: CM.timingOf(del, tap),
      };
    },
    review(ev, seed) {
      return CM.mulberry32(seed)() < 0.5;
    },
  };
}

function playerOf(id) {
  if (id && typeof id === 'object') return id;
  if (id === 'perfect') return perfectPlayer();
  if (id === 'random') return randomPlayer();
  return botPlayer(CM.tierOf(id));
}

// ---------------------------------------------------------------- one match

/**
 * Play one match. o = { format, preset, pitch?, players:[a, b], seed, battingFirst? }.
 * Returns { state, stats } where stats counts deliveries, extras, reviews, appeals.
 */
function playMatch(o) {
  const seed = o.seed >>> 0;
  const rng = CM.mulberry32(seed ^ 0xa5a5a5a5);
  const players = [playerOf(o.players[0]), playerOf(o.players[1])];
  const pitch = o.pitch || CM.rollPitch(o.preset, seed);
  const cfg = CE.createMatch({
    format: o.format,
    preset: o.preset,
    pitch,
    sides: [
      { pid: 'A', name: 'A' },
      { pid: 'B', name: 'B' },
    ],
    battingFirst: o.battingFirst != null ? o.battingFirst : rng() < 0.5 ? 0 : 1,
  });
  const state = CE.replay(cfg, []);
  const stats = { deliveries: 0, wd: 0, nb: 0, appeals: 0, reviews: 0, overturned: 0, umpiresCall: 0 };
  const overs = {};
  let s = seed;
  let guard = 0;
  while (!state.result && guard++ < 4000) {
    const inn = state.innings[state.cur];
    const bat = players[inn.bat];
    const bowl = players[inn.bowl];
    const k = state.cur + ':' + Math.floor(inn.legal / 6);
    const ballsLeft = inn.overs * 6 - inn.legal;
    const need = inn.target ? inn.target - inn.runs : 0;
    const rrr = inn.target && ballsLeft ? (need * 6) / ballsLeft : 0;
    const death = ballsLeft <= 6 && inn.overs > 1;
    const striker = inn.batters[inn.striker];
    if (!overs[k]) {
      overs[k] = bowl.over(
        {
          pitch,
          rrr,
          target: inn.target,
          death,
          newBatter: striker.b < 3,
          favoured: CM.favouredRegion(state),
        },
        (s += 11),
      );
    }
    const ov = overs[k];
    const history = inn.balls.filter((b) => b.striker === striker.name && b.length);
    const plan = bowl.bowl({ type: ov.type, history, death, field: ov.field }, (s += 13));
    const del = CM.execute(plan.plan, plan.accuracy, CM.mulberry32((s += 17)));
    const choice = bat.bat(
      {
        delivery: del,
        rrr,
        ballsLeft,
        target: inn.target,
        need,
        lastWicket: inn.wkts === inn.limit - 1,
        field: ov.field,
      },
      (s += 19),
    );
    let ev = CM.resolve(
      {
        delivery: del,
        shot: choice.shot,
        foot: choice.foot,
        run: choice.run,
        timing: choice.timing,
        conf: striker.conf,
        field: ov.field,
        pitch,
        rules: cfg.rules,
      },
      (s += 23),
    );
    stats.deliveries += 1;
    if (ev.extra === 'wd') stats.wd += 1;
    if (ev.extra === 'nb') stats.nb += 1;
    if (ev.appeal) {
      stats.appeals += 1;
      const side = CM.reviewer(ev);
      const who = side === 'bat' ? bat : bowl;
      if (cfg.rules.drs && inn.reviews[side] > 0 && who.review(ev, (s += 29))) {
        ev = CM.applyReview(ev, side);
        stats.reviews += 1;
        if (ev.drs.result === 'overturned') stats.overturned += 1;
        if (ev.drs.result === 'umpires_call') stats.umpiresCall += 1;
      }
    }
    CE.applyEvent(state, ev);
  }
  return { state, stats };
}

// ---------------------------------------------------------------- bands

function newAgg() {
  return { matches: 0, first: [], batRuns: 0, boundaryRuns: 0, wkts: 0, legal: 0, deliveries: 0, extras: 0, appeals: 0, reviews: 0, overturned: 0, umpiresCall: 0, ties: 0, wins: [0, 0] };
}
function addMatch(agg, r) {
  const st = r.state;
  agg.matches += 1;
  const main = st.innings.filter((i) => !i.super);
  if (main[0]) agg.first.push(main[0].runs);
  main.forEach((inn) => {
    inn.batters.forEach((b) => {
      agg.batRuns += b.r;
      agg.boundaryRuns += b.f4 * 4 + b.f6 * 6;
    });
    agg.wkts += inn.wkts;
    agg.legal += inn.legal;
  });
  agg.deliveries += r.stats.deliveries;
  agg.extras += r.stats.wd + r.stats.nb;
  agg.appeals += r.stats.appeals;
  agg.reviews += r.stats.reviews;
  agg.overturned += r.stats.overturned;
  agg.umpiresCall += r.stats.umpiresCall;
  if (st.result && st.result.winner >= 0) agg.wins[st.result.winner] += 1;
  else agg.ties += 1;
}
function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[i];
}
function summarise(agg) {
  const f = agg.first.slice().sort((a, b) => a - b);
  const mean = f.reduce((a, b) => a + b, 0) / Math.max(1, f.length);
  return {
    matches: agg.matches,
    mean: Math.round(mean * 10) / 10,
    median: quantile(f, 0.5),
    p10: quantile(f, 0.1),
    p90: quantile(f, 0.9),
    ballsPerWicket: agg.wkts ? Math.round((agg.legal / agg.wkts) * 10) / 10 : Infinity,
    boundaryShare: agg.batRuns ? Math.round((agg.boundaryRuns / agg.batRuns) * 1000) / 1000 : 0,
    extrasRate: agg.deliveries ? Math.round((agg.extras / agg.deliveries) * 1000) / 1000 : 0,
    reviewsPerMatch: Math.round((agg.reviews / Math.max(1, agg.matches)) * 100) / 100,
    overturnRate: agg.reviews ? Math.round((agg.overturned / agg.reviews) * 100) / 100 : 0,
    umpiresCallRate: agg.reviews ? Math.round((agg.umpiresCall / agg.reviews) * 100) / 100 : 0,
    tieRate: Math.round((agg.ties / Math.max(1, agg.matches)) * 1000) / 1000,
  };
}

/** Normal v Normal bands for one format + preset. */
function bands(format, preset, n, seed0) {
  const agg = newAgg();
  for (let i = 0; i < n; i++) addMatch(agg, playMatch({ format, preset, players: ['normal', 'normal'], seed: (seed0 || 1) + i * 7919 }));
  return summarise(agg);
}

/** Win rate of player a vs b (alternating who bats first; ties count half). */
function winRate(a, b, format, preset, n, seed0) {
  let w = 0;
  for (let i = 0; i < n; i++) {
    const swap = i % 2 === 1;
    const r = playMatch({ format, preset, players: swap ? [b, a] : [a, b], seed: (seed0 || 3) + i * 104729, battingFirst: i % 4 < 2 ? 0 : 1 });
    const res = r.state.result;
    const aSide = swap ? 1 : 0;
    if (!res || res.winner < 0) w += 0.5;
    else if (res.winner === aSide) w += 1;
  }
  return w / n;
}

// ---------------------------------------------------------------- EV

/** The delivery a plan produces when it lands exactly (no miss, no overstep). */
function exactDelivery(plan) {
  return CM.execute(plan, 1, () => 0.999);
}
function allPlans() {
  const out = [];
  CM.TYPES.forEach((type) =>
    CM.VARIATIONS[type].forEach((variation) => {
      const fixed = CM.VARIATION_LENGTH[variation];
      (fixed ? [fixed] : CM.LENGTHS).forEach((length) => {
        CM.LINES.forEach((line) => out.push(CM.normPlan({ type, line, length, variation })));
      });
    }),
  );
  const seen = {};
  return out.filter((p) => {
    const k = p.type + p.line + p.length + p.variation;
    if (seen[k]) return false;
    seen[k] = 1;
    return true;
  });
}

/**
 * EV of each shot against each exact delivery, timing drawn from a tier's distribution.
 * value = runs − EV_WICKET × P(out on field after review-free play).
 */
function evTable(n, tier, opts) {
  const t = CM.TIERS[CM.tierOf(tier || 'normal')].timing;
  const o = opts || {};
  const plans = allPlans();
  const rows = [];
  let seed = 99;
  plans.forEach((plan) => {
    const del = exactDelivery(plan);
    const shots = {};
    CM.SHOTS.forEach((shot) => {
      let runs = 0;
      let outs = 0;
      for (let i = 0; i < n; i++) {
        const r = CM.mulberry32((seed += 31))();
        const timing = r < t[0] ? 'perfect' : r < t[0] + t[1] ? 'early' : r < t[0] + t[1] + t[2] ? 'late' : 'miss';
        const ev = CM.resolve({ delivery: del, shot, foot: o.foot || 'stay', run: 'one', timing, field: o.field || 'balanced', pitch: o.pitch || 'flat', rules: {} }, (seed += 37));
        runs += ev.runs + (ev.extra === 'nb' || ev.extra === 'wd' ? 1 : 0);
        if (ev.out) outs += 1;
      }
      shots[shot] = { runs: runs / n, pOut: outs / n, ev: runs / n - (EV_WICKET * outs) / n };
    });
    let best = '';
    CM.SHOTS.forEach((s) => {
      if (!best || shots[s].ev > shots[best].ev) best = s;
    });
    rows.push({ plan, del, shots, best, bestEv: shots[best].ev });
  });
  return rows;
}

/**
 * Dominance checks on an EV table:
 *   shots — every shot is the best answer to some delivery, carries negative EV against some
 *           delivery, and none is the best answer to more than maxShare of deliveries;
 *   deliveries — every delivery can be punished (best answer EV > 0) or is a genuinely hard ball
 *           that still costs the bowler accuracy risk; the lowest best-answer EV isn't far below the rest.
 */
function dominance(rows, maxShare) {
  const share = {};
  const worst = {};
  CM.SHOTS.forEach((s) => {
    share[s] = 0;
    worst[s] = Infinity;
  });
  rows.forEach((r) => {
    share[r.best] += 1;
    CM.SHOTS.forEach((s) => (worst[s] = Math.min(worst[s], r.shots[s].ev)));
  });
  const total = rows.length;
  const shares = {};
  CM.SHOTS.forEach((s) => (shares[s] = Math.round((share[s] / total) * 1000) / 1000));
  const bestEvs = rows.map((r) => r.bestEv).sort((a, b) => a - b);
  const wrongPunished = rows.every((r) => CM.SHOTS.some((s) => r.shots[s].ev < -1));
  return {
    shares,
    worst,
    maxShare: Math.max.apply(null, CM.SHOTS.map((s) => shares[s])),
    everyShotHasUse: CM.SHOTS.filter((s) => s !== 'leave').every((s) => share[s] > 0),
    everyShotRisky: CM.SHOTS.every((s) => worst[s] < 0),
    wrongPunished,
    bestEvMin: bestEvs[0],
    bestEvMedian: quantile(bestEvs, 0.5),
    ok: Math.max.apply(null, CM.SHOTS.map((s) => share[s] / total)) <= (maxShare || 0.35),
  };
}

/** Bowling plan value (runs conceded − 15 × wickets) vs a Normal bot batter, with Normal accuracy. */
function planTable(n) {
  const plans = allPlans();
  let seed = 7;
  return plans
    .map((plan) => {
      let v = 0;
      for (let i = 0; i < n; i++) {
        const acc = Math.max(0, Math.min(1, 0.68 + (CM.mulberry32((seed += 3))() - 0.5) * 0.4));
        const del = CM.execute(plan, acc, CM.mulberry32((seed += 5)));
        const b = CM.botBat({ tier: 'normal', delivery: del, rrr: 8, ballsLeft: 20, field: 'balanced' }, (seed += 7));
        const ev = CM.resolve({ delivery: del, shot: b.shot, foot: b.foot, run: b.run, timing: b.timing, field: 'balanced', pitch: 'flat', rules: {} }, (seed += 11));
        v += ev.runs + (ev.extra === 'nb' || ev.extra === 'wd' ? 1 : 0) - (ev.out ? EV_WICKET : 0);
      }
      return { plan, value: v / n };
    })
    .sort((a, b) => a.value - b.value);
}

// ---------------------------------------------------------------- main

function main() {
  const arg = process.argv.find((a) => a.startsWith('--n='));
  const n = arg ? Math.max(100, Number(arg.slice(4)) || 10000) : 10000;
  const t0 = Date.now();
  const out = { n, bands: {}, gradient: {}, tiers: {}, ev: null, plans: null };
  let pass = true;
  const flag = (ok) => {
    if (!ok) pass = false;
    return ok ? 'ok ' : 'OFF';
  };
  console.log('Street Cricket balance sim — ' + n + ' matches per format + preset (Normal Bot v Normal Bot)\n');
  CE.FORMAT_ORDER.forEach((format) => {
    CE.PRESET_ORDER.forEach((preset) => {
      const b = bands(format, preset, n, 1);
      out.bands[format + '/' + preset] = b;
      const band = TARGETS.score[format];
      const ok = preset !== 'standard' || (b.median >= band[0] && b.median <= band[1]);
      console.log(
        flag(ok) +
          ' ' +
          (format + '/' + preset).padEnd(20) +
          ' median ' +
          String(b.median).padStart(4) +
          ' (p10 ' +
          b.p10 +
          ', p90 ' +
          b.p90 +
          ')  balls/wkt ' +
          b.ballsPerWicket +
          '  boundary ' +
          Math.round(b.boundaryShare * 100) +
          '%  extras ' +
          (b.extrasRate * 100).toFixed(1) +
          '%  reviews/m ' +
          b.reviewsPerMatch +
          ' (overturned ' +
          Math.round(b.overturnRate * 100) +
          '%, umpire’s call ' +
          Math.round(b.umpiresCallRate * 100) +
          '%)  ties ' +
          (b.tieRate * 100).toFixed(1) +
          '%',
      );
    });
  });
  const std = out.bands['standard/standard'];
  console.log('');
  console.log(flag(std.ballsPerWicket >= TARGETS.ballsPerWicket[0] && std.ballsPerWicket <= TARGETS.ballsPerWicket[1]) + ' balls per wicket (Standard) ' + std.ballsPerWicket + ' in ' + TARGETS.ballsPerWicket.join('–'));
  console.log(flag(std.boundaryShare >= TARGETS.boundaryShare[0] && std.boundaryShare <= TARGETS.boundaryShare[1]) + ' boundary share (Standard) ' + std.boundaryShare + ' in ' + TARGETS.boundaryShare.join('–'));
  console.log(flag(std.extrasRate >= TARGETS.extrasRate[0] && std.extrasRate <= TARGETS.extrasRate[1]) + ' extras rate (Standard) ' + std.extrasRate + ' in ' + TARGETS.extrasRate.join('–'));

  const gn = Math.max(500, Math.round(n / 5));
  const pr = winRate('perfect', 'random', 'standard', 'standard', gn, 5);
  out.gradient.perfectVsRandom = pr;
  console.log(flag(pr >= TARGETS.perfectVsRandom) + ' perfect beats random ' + (pr * 100).toFixed(1) + '% (' + gn + ' matches, target > 90%)');
  const ladder = [
    ['easy', 'normal'],
    ['normal', 'hard'],
    ['hard', 'pro'],
  ];
  ladder.forEach(([lo, hi]) => {
    const w = winRate(hi, lo, 'standard', 'standard', gn, 9);
    out.tiers[hi + '>' + lo] = w;
    console.log(flag(w > 0.55) + ' ' + hi + ' Bot beats ' + lo + ' Bot ' + (w * 100).toFixed(1) + '%');
  });

  const rows = evTable(Math.max(200, Math.round(n / 25)), 'normal');
  const d = dominance(rows, 0.35);
  out.ev = d;
  console.log('');
  console.log(flag(d.ok) + ' no dominant shot: best-answer share ' + JSON.stringify(d.shares));
  console.log(flag(d.everyShotRisky) + ' every shot has a delivery with EV < 0: worst ' + JSON.stringify(Object.fromEntries(Object.entries(d.worst).map(([k, v]) => [k, Math.round(v * 100) / 100]))));
  console.log(flag(d.everyShotHasUse) + ' every shot (bar leave) is the best answer somewhere');
  console.log(flag(d.wrongPunished) + ' every delivery has a wrong shot with EV < −1');
  const pt = planTable(Math.max(200, Math.round(n / 25)));
  out.plans = { best: pt.slice(0, 5), worst: pt.slice(-3) };
  const lens = new Set(pt.slice(0, 8).map((p) => p.plan.length + '/' + p.plan.variation));
  const gap = pt[Math.floor(pt.length / 4)].value - pt[0].value;
  console.log(flag(lens.size >= 3 && gap < 2.5) + ' no dominant delivery: top 8 plans span ' + lens.size + ' length/variation combos; best is ' + gap.toFixed(2) + ' runs/ball better than the top-quartile plan');
  pt.slice(0, 5).forEach((p) => console.log('    ' + [p.plan.type, p.plan.line, p.plan.length, p.plan.variation].join(' ').padEnd(28) + ' value ' + p.value.toFixed(2)));
  console.log('\n' + (pass ? 'All balance targets met' : 'Some targets are OFF') + ' (' + Math.round((Date.now() - t0) / 1000) + 's)');
  if (!pass) process.exitCode = 1;
  return out;
}

module.exports = { TARGETS, EV_WICKET, botPlayer, perfectPlayer, randomPlayer, playMatch, bands, winRate, evTable, dominance, planTable, allPlans, exactDelivery, summarise };

if (require.main === module) main();
