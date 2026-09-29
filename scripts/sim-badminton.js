#!/usr/bin/env node
/**
 * Badminton balance harness (P13): bot-vs-bot matches on the exact exchange model the phone and the
 * server run (badminton-rally.js), scored by the laws engine. Reports per level: rally length, serve /
 * receive point split, winner / error mix, smash share; the skill gradient between levels; and
 * "no dominant shot" checks (spam-smash / spam-clear vs an all-rounder of the same level).
 *   node scripts/sim-badminton.js [matchesPerLevel=10000] [discipline=singles]
 */
'use strict';

const path = require('path');
const E = require(path.join(__dirname, '../public/src/js/games/badminton-engine.js'));
const R = require(path.join(__dirname, '../public/src/js/games/badminton-rally.js'));

const seatOf = (side, player) => (side === 1 ? 'B' : 'A') + (player === 1 ? 1 : 0);
const sideOf = (seat) => (seat.charAt(0) === 'B' ? 1 : 0);

/**
 * One match. a / b = { level, persona?, w? } for side A / B.
 * @returns {{ winner, games, stats }}
 */
function simMatch(a, b, rng, o) {
  const opt = o || {};
  const discipline = opt.discipline || 'singles';
  const cfg = E.createConfig({ discipline, format: opt.format || 'standard' });
  const state = E.initState(cfg);
  E.applyEvent(state, { t: 'start', server: { side: rng() < 0.5 ? 0 : 1, player: 0 }, receiver: 0 });
  const seats = discipline === 'doubles' ? ['A0', 'A1', 'B0', 'B1'] : ['A0', 'B0'];
  const who = {};
  seats.forEach((s) => (who[s] = Object.assign({ bot: true }, sideOf(s) === 0 ? a : b)));
  const rs = R.createRally({ discipline, seats, who });
  const st = opt.stats || newStats();
  let guard = 0;
  while (!state.over && guard++ < 400) {
    const server = seatOf(state.server.side, state.server.player);
    const receiver = seatOf(state.receiver.side, state.receiver.player);
    let c = R.startRally(rs, { server, receiver, court: state.court });
    let shots = 0;
    let ev = null;
    for (let i = 0; i < 300 && !ev; i++) {
      const bp = R.botPlay(rs, c, rng);
      const res = R.resolve(rs, c, { shot: bp.choice.shot, x: bp.choice.x, hold: bp.choice.hold, timing: bp.timing }, rng);
      shots++;
      const fam = R.SHOTS[res.shot].family;
      st.shots[fam] = (st.shots[fam] || 0) + 1;
      st.shotBySide[sideOf(c.seat)] += 1;
      if (fam === 'smash') st.smashBySide[sideOf(c.seat)] += 1;
      if (res.hold) st.holds++;
      if (res.dig) st.digs++;
      if (res.kind === 'in') {
        if (c.ch === 'high' && fam === 'smash') st.smashFromHigh++;
        if (fam === 'smash' && c.ch !== 'high') st.illegal++;
        if (fam === 'kill' && c.ch !== 'nethigh') st.illegal++;
        c = { seat: res.next.seat, serve: false, ch: res.next.ch, court: c.court, r: res.next.r, power: res.next.power, loose: res.next.loose };
        continue;
      }
      if (res.kind === 'let') {
        ev = { t: 'let', code: res.code };
        st.lets++;
        break;
      }
      const w = res.kind === 'winner' ? sideOf(c.seat) : 1 - sideOf(c.seat);
      if (res.kind === 'winner') {
        st.winners++;
        st.winnerBy[fam] = (st.winnerBy[fam] || 0) + 1;
      } else {
        st.errors++;
        st.errorBy[res.code] = (st.errorBy[res.code] || 0) + 1;
      }
      if (!E.CODES[res.code]) st.illegal++;
      ev = { t: 'rally', w, code: res.code, by: sideOf(c.seat), hits: shots };
    }
    if (!ev) ev = { t: 'let', code: 'disturbed' };
    const srvSide = state.server.side;
    E.applyEvent(state, ev);
    if (ev.t === 'rally') {
      st.rallies++;
      st.rallyShots += shots;
      st.lengths.push(shots);
      if (ev.w === srvSide) st.serverWon++;
      st.stEnd += (rs.st[seats[0]] + rs.st[seats[seats.length - 1]]) / 2;
    }
    R.rest(rs, state.pause ? (state.pause.kind === 'game' ? 'game' : 'interval') : 'point');
  }
  st.matches++;
  if (state.result) st.wins[state.result.winner]++;
  return { winner: state.result ? state.result.winner : -1, games: state.games.map((g) => g.score.slice()), stats: st };
}

function newStats() {
  return { matches: 0, wins: [0, 0], rallies: 0, rallyShots: 0, lengths: [], serverWon: 0, winners: 0, errors: 0, lets: 0, winnerBy: {}, errorBy: {}, shots: {}, shotBySide: [0, 0], smashBySide: [0, 0], smashFromHigh: 0, holds: 0, digs: 0, illegal: 0, stEnd: 0 };
}

function summary(st) {
  const total = Object.values(st.shots).reduce((x, y) => x + y, 0) || 1;
  const sorted = st.lengths.slice().sort((x, y) => x - y);
  return {
    matches: st.matches,
    winA: st.wins[0] / Math.max(1, st.matches),
    avgRally: st.rallyShots / Math.max(1, st.rallies),
    medianRally: sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0,
    serverWin: st.serverWon / Math.max(1, st.rallies),
    winnerShare: st.winners / Math.max(1, st.winners + st.errors),
    smashShare: (st.shots.smash || 0) / total,
    shotMix: Object.fromEntries(Object.entries(st.shots).map(([k, v]) => [k, Math.round((v / total) * 1000) / 10])),
    winnerBy: st.winnerBy,
    errorBy: st.errorBy,
    lets: st.lets,
    holds: st.holds,
    digs: st.digs,
    illegal: st.illegal,
    staminaEnd: st.stEnd / Math.max(1, st.rallies),
    smashBySide: st.smashBySide,
    shotBySide: st.shotBySide,
  };
}

/** n matches of a vs b (sides alternate so neither side has the first toss edge). */
function matchup(a, b, n, seed, o) {
  const rng = E.mulberry32(seed || 1);
  const st = newStats();
  let aWins = 0;
  for (let i = 0; i < n; i++) {
    const flip = i % 2 === 1;
    const r = simMatch(flip ? b : a, flip ? a : b, rng, Object.assign({}, o, { stats: st }));
    if ((r.winner === 0 && !flip) || (r.winner === 1 && flip)) aWins++;
  }
  const s = summary(st);
  s.aWin = aWins / n;
  return s;
}

function levelReport(n, o) {
  const out = {};
  R.LEVEL_ORDER.forEach((lv, i) => {
    out[lv] = matchup({ level: lv }, { level: lv }, n, 100 + i, o);
  });
  return out;
}

function gradient(n, o) {
  const L = R.LEVEL_ORDER;
  const out = {};
  for (let i = 0; i < L.length - 1; i++) out[L[i + 1] + '>' + L[i]] = matchup({ level: L[i + 1] }, { level: L[i] }, n, 200 + i, o).aWin;
  out[L[L.length - 1] + '>' + L[0]] = matchup({ level: L[L.length - 1] }, { level: L[0] }, n, 300, o).aWin;
  return out;
}

const SPAM = {
  smash: { serve: 1, clear: 0.05, drop: 0.05, smash: 60, drive: 1, net: 1, kill: 1, lift: 1, push: 1, block: 1 },
  clear: { serve: 1, clear: 60, drop: 0.05, smash: 0.05, drive: 1, net: 1, kill: 1, lift: 60, push: 1, block: 1 },
  net: { serve: 1, clear: 0.05, drop: 30, smash: 0.05, drive: 1, net: 60, kill: 1, lift: 0.05, push: 1, block: 1 },
};
/** Each spam strategy vs an all-rounder of the same level: a dominant shot would win well over half. */
function dominance(n, level, o) {
  const out = {};
  Object.keys(SPAM).forEach((k, i) => {
    out[k] = matchup({ level, w: SPAM[k] }, { level }, n, 400 + i, o).aWin;
  });
  return out;
}

function personaReport(n, level, o) {
  const out = {};
  R.PERSONA_ORDER.forEach((p, i) => {
    const s = matchup({ level, persona: p }, { level }, n, 500 + i, o);
    out[p] = { win: s.aWin, mix: s.shotMix };
  });
  return out;
}

module.exports = { simMatch, matchup, levelReport, gradient, dominance, personaReport, summary, newStats, SPAM };

if (require.main === module) {
  const n = Math.max(10, Number(process.argv[2]) || 10000);
  const discipline = process.argv[3] === 'doubles' ? 'doubles' : 'singles';
  const t0 = Date.now();
  const o = { discipline };
  const lv = levelReport(n, o);
  console.log(`Badminton sim — ${discipline}, ${n} matches per level`);
  Object.entries(lv).forEach(([k, s]) => {
    console.log(
      `${k.padEnd(9)} rally ${s.avgRally.toFixed(1)} (median ${s.medianRally}) · server wins ${(s.serverWin * 100).toFixed(1)}% · winners ${(s.winnerShare * 100).toFixed(1)}% / errors ${((1 - s.winnerShare) * 100).toFixed(1)}% · smash ${(s.smashShare * 100).toFixed(1)}% · lets ${s.lets} · holds ${s.holds} · illegal ${s.illegal} · stamina ${s.staminaEnd.toFixed(2)}`
    );
    console.log('          mix ' + JSON.stringify(s.shotMix) + ' errors ' + JSON.stringify(s.errorBy));
  });
  const gn = Math.max(10, Math.floor(n / 4));
  console.log('gradient (' + gn + ' each) ' + JSON.stringify(gradient(gn, o)));
  console.log('dominance club (' + gn + ') ' + JSON.stringify(dominance(gn, 'club', o)) + ' · pro ' + JSON.stringify(dominance(gn, 'pro', o)));
  console.log('personas county (' + gn + ') ' + JSON.stringify(personaReport(gn, 'county', o), (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)));
  console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
