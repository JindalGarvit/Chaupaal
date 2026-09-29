#!/usr/bin/env node
/**
 * Dangal P12 — Badminton 1: the laws engine (scoring, deuce + cap, game winner serves, intervals,
 * ends, singles service courts, doubles rotation incl. the Law 11 example, faults + lets, Quick 11,
 * service-court correction), the match reducer (replay determinism, client-claimed points rejected,
 * RTT cap, AFK forfeit) and the server (rated Live Standard singles to 3 games with a deuce, Live
 * doubles rotation throughout, bot partner, doubles queue, settlement) + wiring.
 *   node scripts/test-dangal-p12-badminton-engine.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error('FAIL:', msg);
  } else console.log('ok:', msg);
}
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const clone = (x) => JSON.parse(JSON.stringify(x));
const code = (fn) => {
  try {
    fn();
    return '';
  } catch (e) {
    return e.code || e.message;
  }
};

const E = require(path.join(root, 'public/src/js/games/badminton-engine.js'));
const BM = require(path.join(root, 'public/src/js/games/badminton-match.js'));
const SRV = require(path.join(root, 'server-lib/badminton-engine.js'));

// ---------------------------------------------------------------- helpers

const R = (w, c) => ({ t: 'rally', w, code: c || 'winner', by: c && E.isFault(c) ? 1 - w : w, hits: 3 });
/** Rally events that reach a:b from 0:0 by alternating (never ends a game early). */
function toScore(a, b, first) {
  const out = [];
  let x = 0;
  let y = 0;
  let turn = first === 1 ? 1 : 0;
  while (x < a || y < b) {
    if ((turn === 0 && x < a) || y >= b) {
      out.push(R(0));
      x++;
    } else {
      out.push(R(1));
      y++;
    }
    turn = 1 - turn;
  }
  return out;
}
const cfg = (format, discipline) => E.createConfig({ format, discipline });
const run = (c, log) => E.replay(c, log);
const winsGame = (side, points) => Array.from({ length: points }, () => R(side));

// ---------------------------------------------------------------- Law 7 scoring

{
  const c = cfg('standard');
  let s = run(c, toScore(19, 19).concat([R(0), R(0)]));
  assert(s.games[0].winner === 0 && s.games[0].score.join('-') === '21-19', 'game won at 21 with a 2-point lead (21–19)');
  s = run(c, toScore(20, 20).concat([R(0)]));
  assert(s.games[0].winner === -1 && s.score.join('-') === '21-20', '21–20 is not a game (needs 2 clear)');
  s = run(c, toScore(20, 20).concat([R(0), R(0)]));
  assert(s.games[0].winner === 0 && s.games[0].score.join('-') === '22-20', 'from 20-all the first side 2 clear wins (22–20)');
  s = run(c, toScore(28, 28).concat([R(1), R(0)]));
  assert(s.games[0].winner === -1 && s.score.join('-') === '29-29', '29-all is still live');
  s = run(c, toScore(29, 29).concat([R(1)]));
  assert(s.games[0].winner === 1 && s.games[0].score.join('-') === '29-30', 'at 29-all the 30th point wins (cap 30)');
  const q = cfg('quick11');
  s = run(q, toScore(14, 14).concat([R(0)]));
  assert(s.games[0].winner === 0 && s.games[0].score.join('-') === '15-14', 'Quick 11: capped at 15 (15–14 wins)');
  s = run(q, toScore(10, 10).concat([R(0), R(0)]));
  assert(s.games[0].winner === 0 && s.games[0].score.join('-') === '12-10', 'Quick 11: to 11 with a 2-point lead');
  assert(E.FORMATS.quick11.chaupaal && !E.FORMATS.quick11.rated && !E.FORMATS.single.rated && E.FORMATS.standard.rated, 'only Standard is rated; Quick 11 is flagged as a Chaupaal quick format');

  // Best of 3 + the game winner serves first in the next game (Law 7.6).
  s = run(c, winsGame(1, 21));
  assert(s.g === 1 && s.server.side === 1 && s.score.join('-') === '0-0', 'the game winner serves first in the next game');
  s = run(c, winsGame(1, 21).concat(winsGame(0, 21)));
  assert(s.g === 2 && s.server.side === 0 && !s.over, 'one game each → deciding game, served by the game-2 winner');
  s = run(c, winsGame(1, 21).concat(winsGame(0, 21), toScore(20, 20), [R(1), R(1)]));
  assert(s.over && s.result.winner === 1 && s.result.games.map((g) => g.join('-')).join(' ') === '0-21 21-0 20-22', 'best of 3: the deciding game ends the match (with a deuce)');
  const single = run(cfg('single'), winsGame(0, 21));
  assert(single.over && single.result.winner === 0, 'Single game format: one game to 21');
}

// ---------------------------------------------------------------- Law 16 intervals + Law 8 ends

{
  const c = cfg('standard');
  let s = run(c, toScore(11, 9));
  assert(s.pause && s.pause.kind === 'interval' && /interval/.test(s.calls[0].text), 'interval when the leading score reaches 11');
  assert(!s.changeEnds, 'no end change at 11 in game 1');
  s = run(c, toScore(11, 9).concat([R(1)]));
  assert(!s.pause, 'only one mid-game interval per game');
  s = run(c, toScore(11, 11));
  assert(!s.pause, 'the interval came at the first 11, not again at 11-all');
  const g1 = winsGame(0, 21);
  s = run(c, g1);
  assert(s.pause && s.pause.kind === 'game' && s.changeEnds && s.swapped && s.calls.some((x) => x.k === 'ends'), 'interval + change of ends after game 1');
  s = run(c, g1.concat(winsGame(1, 21)));
  assert(s.pause && s.pause.kind === 'game' && s.changeEnds && !s.swapped, 'ends change again after game 2');
  const toDecider = g1.concat(winsGame(1, 21));
  s = run(c, toDecider.concat(toScore(9, 10, 1)));
  assert(!s.changeEnds && !s.pause, 'decider: nothing yet at 9–10');
  s = run(c, toDecider.concat(toScore(9, 10, 1), [R(1)]));
  assert(s.pause && s.pause.kind === 'interval' && s.changeEnds && s.swapped && s.calls.some((x) => x.text === 'Change ends'), 'decider: interval + change ends when the leader reaches 11');
  s = run(c, toDecider.concat(toScore(9, 10, 1), [R(1), R(0), R(0)]));
  assert(!s.changeEnds && s.swapped, 'decider: ends change only once');
  const q = run(cfg('quick11'), toScore(6, 3));
  assert(q.pause && q.pause.kind === 'interval', 'Quick 11: interval at 6');
  const one = run(cfg('single'), toScore(11, 4));
  assert(one.changeEnds && one.pause.kind === 'interval', 'Single game: it is the deciding game, so ends change at 11');
}

// ---------------------------------------------------------------- Law 10 singles service

{
  const c = cfg('standard');
  let s = run(c, [{ t: 'start', server: { side: 0, player: 0 }, receiver: 0 }]);
  assert(s.server.side === 0 && s.court === 'R' && s.calls[0].text === 'Love all, play', 'love all: serve from the right court');
  s = run(c, [R(0)]);
  assert(s.server.side === 0 && s.court === 'L' && s.calls[0].text === '1–love', 'server wins → 1–0, serves from the left (odd)');
  s = run(c, [R(0), R(1)]);
  assert(s.server.side === 1 && s.court === 'L' && /^Service over, 1 all$/.test(s.calls[0].text), 'receiver wins → service over; server on 1 serves from the left');
  s = run(c, [R(0), R(1), R(1)]);
  assert(s.server.side === 1 && s.court === 'R' && s.calls[0].text === '2–1', 'server on 2 serves from the right (even), server score first');
  // Every state: court follows the server's own score.
  const rng = E.mulberry32(7);
  const log = [];
  let ok = true;
  for (let i = 0; i < 60; i++) {
    log.push(R(rng() < 0.5 ? 0 : 1));
    const st = run(c, log);
    if (st.over) break;
    if (st.court !== (st.score[st.server.side] % 2 === 0 ? 'R' : 'L')) ok = false;
    if (st.receiver.side !== 1 - st.server.side) ok = false;
  }
  assert(ok, 'singles: service court = right on the server’s even score, left on odd — every rally');
  s = run(c, toScore(19, 18).concat([R(0)]));
  assert(s.calls[0].text === '20 game point 18', 'game point call');
  s = run(c, winsGame(0, 21).concat(toScore(19, 17), [R(0)]));
  assert(s.calls[0].text === '20 match point 17', 'match point call');
}

// ---------------------------------------------------------------- Law 11 doubles service

{
  const c = E.createConfig({ discipline: 'doubles', sides: [{ players: ['A', 'B'] }, { players: ['C', 'D'] }] });
  const who = (st) => ({ srv: c.sides[st.server.side].players[st.server.player], rcv: c.sides[st.receiver.side].players[st.receiver.player], court: st.court });
  const start = { t: 'start', server: { side: 0, player: 0 }, receiver: 0 };
  // The worked example from the Laws: A&B v C&D, A serves to C.
  const steps = [
    [[], 'A', 'C', 'R', '0-0'],
    [[R(0)], 'A', 'D', 'L', '1-0'],
    [[R(0), R(1)], 'D', 'A', 'L', '1-1'],
    [[R(0), R(1), R(1)], 'D', 'B', 'R', '1-2'],
    [[R(0), R(1), R(1), R(0)], 'B', 'D', 'R', '2-2'],
    [[R(0), R(1), R(1), R(0), R(0)], 'B', 'C', 'L', '3-2'],
  ];
  steps.forEach(([evs, srv, rcv, court, score]) => {
    const st = run(c, [start].concat(evs));
    const w = who(st);
    assert(w.srv === srv && w.rcv === rcv && w.court === court && st.score.join('-') === score, `Law 11 example at ${score}: ${srv} serves from ${court} to ${rcv}`);
  });
  let st = run(c, [start, R(0)]);
  assert(st.pos[0].join() === '1,0' && st.pos[1].join() === '0,1', 'serving side wins → only the servers swap courts');
  st = run(c, [start, R(1)]);
  assert(st.pos[0].join() === '0,1' && st.pos[1].join() === '0,1' && st.server.side === 1 && st.court === 'L', 'receiving side wins → nobody moves; their player in the court matching their score (1 → left) serves');

  // Independent reference model of Law 11, checked after every rally of long random logs.
  function reference(log) {
    const games = [];
    let pos = [[0, 1], [0, 1]];
    let srv = 0;
    let sc = [0, 0];
    let over = false;
    const f = E.FORMATS.standard;
    log.forEach((ev) => {
      if (over || ev.t !== 'rally') return;
      sc[ev.w] += 1;
      if (ev.w === srv) pos[srv] = [pos[srv][1], pos[srv][0]];
      else srv = ev.w;
      const done = (sc[ev.w] >= f.points && sc[ev.w] - sc[1 - ev.w] >= 2) || sc[ev.w] >= f.cap;
      if (done) {
        games.push(ev.w);
        if (games.filter((g) => g === ev.w).length >= 2) over = true;
        sc = [0, 0];
        pos = [[0, 1], [0, 1]];
        srv = ev.w;
      }
    });
    const idx = sc[srv] % 2 === 0 ? 0 : 1;
    return { srv: { side: srv, player: pos[srv][idx] }, rcv: { side: 1 - srv, player: pos[1 - srv][idx] }, court: idx === 0 ? 'R' : 'L', pos, over };
  }
  let bad = '';
  let rallies = 0;
  for (let seed = 1; seed <= 25 && !bad; seed++) {
    const rng = E.mulberry32(seed);
    const log = [];
    for (let i = 0; i < 200; i++) {
      const prev = run(c, log);
      if (prev.over) break;
      const w = rng() < 0.5 ? 0 : 1;
      const r = rng() < 0.08 ? { t: 'let', code: 'not_ready' } : R(w);
      log.push(r);
      rallies++;
      const s = run(c, log);
      if (s.over) break;
      const ref = reference(log);
      if (s.server.side !== ref.srv.side || s.server.player !== ref.srv.player || s.receiver.player !== ref.rcv.player || s.court !== ref.court) bad = `seed ${seed} event ${i}`;
      // Players move only when they win a point on their own serve.
      if (r.t === 'rally' && s.g === prev.g) {
        const srvBefore = prev.server.side;
        [0, 1].forEach((side) => {
          const moved = s.pos[side].join() !== prev.pos[side].join();
          if (moved !== (side === srvBefore && r.w === srvBefore)) bad = `moved seed ${seed} event ${i}`;
        });
      }
      if (r.t === 'let' && (s.score.join() !== prev.score.join() || s.server.player !== prev.server.player || s.server.side !== prev.server.side)) bad = 'let changed service';
    }
  }
  assert(!bad && rallies > 1000, `doubles rotation matches an independent Law 11 model over ${rallies} random rallies${bad ? ' — ' + bad : ''}`);

  // Law 12: service court errors are corrected, the score stands.
  st = run(c, [start, R(0), R(1)]);
  const chk = E.checkService(st, { server: { side: 1, player: 0 }, court: 'R' });
  assert(!chk.ok && chk.errors.indexOf('wrong_server') >= 0 && chk.errors.indexOf('wrong_court') >= 0 && chk.correct.server.player === 1 && chk.correct.court === 'L' && chk.score.join('-') === '1-1', 'Law 12: wrong server / court is detected, corrected, score stands');
  assert(E.checkService(st, E.expectedService(st)).ok, 'Law 12: the expected service passes');
}

// ---------------------------------------------------------------- Laws 13 + 14 faults and lets

{
  const LF = E.landingFault;
  assert(LF({ x: 0.5, y: -0.1 }, { discipline: 'singles' }) === 'net', 'fault: into the net');
  assert(LF({ x: 2.7, y: 3 }, { discipline: 'singles' }) === 'out' && LF({ x: 2.7, y: 3 }, { discipline: 'doubles' }) === '', 'fault: out wide in singles, in for doubles (court type)');
  assert(LF({ x: 0.5, y: 6.8 }, { discipline: 'doubles' }) === 'out', 'fault: past the back line');
  assert(LF({ x: 0.5, y: 6.2 }, { discipline: 'singles', serve: true, court: 'R' }) === '', 'singles serve may land up to the back line');
  assert(LF({ x: 0.5, y: 6.2 }, { discipline: 'doubles', serve: true, court: 'R' }) === 'serve_long', 'doubles serve past the long service line is a fault');
  assert(LF({ x: 0.5, y: 1.5 }, { discipline: 'doubles', serve: true, court: 'R' }) === 'serve_short', 'serve short of the short service line');
  assert(LF({ x: -0.5, y: 3 }, { discipline: 'singles', serve: true, court: 'R' }) === 'serve_wide', 'serve into the wrong (non-diagonal) box');
  assert(LF({ x: 2.8, y: 3 }, { discipline: 'singles', serve: true, court: 'R' }) === 'serve_wide' && LF({ x: 2.8, y: 3 }, { discipline: 'doubles', serve: true, court: 'R' }) === '', 'serve sideline by court type');
  assert(LF({ x: 0.3, y: -0.2 }, { serve: true, court: 'R' }) === 'serve_net', 'serve into the net');
  ['out', 'net', 'net_touch', 'double_hit', 'obstruction', 'serve_height', 'serve_feet', 'serve_net', 'serve_short', 'serve_long', 'serve_wide'].forEach((k) => {
    if (!E.isFault(k)) assert(false, 'fault code ' + k);
  });
  assert(E.CODES.serve_height.law.indexOf('1.15') >= 0 && E.CODES.double_hit.label === 'Double hit', 'every fault code is a fault; illegal serve above 1.15 m; double hit / partners in succession');
  assert(['not_ready', 'caught_net', 'both_fault', 'disintegrated', 'disturbed'].every((k) => E.LETS[k]), 'let codes: receiver not ready, caught in the net, both faulted, broken shuttle, disturbed');
  const c = cfg('standard');
  let s = run(c, [R(0), R(1), R(0, 'out')]);
  assert(s.score.join('-') === '2-1' && s.stats.errors[1] === 1 && s.stats.winners[0] === 1 && s.stats.codes.out === 1, 'a fault gives the point to the other side and counts as an error');
  s = run(c, [R(0), { t: 'let', code: 'not_ready' }]);
  assert(s.score.join('-') === '1-0' && s.server.side === 0 && s.court === 'L' && s.calls[0].text === 'Let' && s.stats.lets === 1, 'a let replays the rally: same server, same court, no point');
  s = run(c, [R(0), { t: 'end', reason: 'forfeit', winner: 1 }, R(0)]);
  assert(s.over && s.result.winner === 1 && s.score.join('-') === '1-0', 'forfeit ends the match; later events are ignored');
  const rng = E.mulberry32(11);
  const kinds = {};
  for (let i = 0; i < 4000; i++) {
    const r = E.resolveContact({ discipline: i % 2 ? 'doubles' : 'singles', serve: i % 5 === 0, court: 'R', timing: ['perfect', 'good', 'early', 'late'][i % 4], prevLand: { x: 0.1, y: 3 } }, rng);
    kinds[r.kind] = (kinds[r.kind] || 0) + 1;
    if (r.kind === 'fault' && !E.isFault(r.code)) kinds.bad = 1;
    if (r.kind === 'let' && !E.LETS[r.code]) kinds.bad = 1;
  }
  assert(kinds.in && kinds.winner && kinds.fault && kinds.let && !kinds.bad, 'the contact layer only produces laws-engine codes (in / winner / fault / let)');
  assert(E.LAWS.map((l) => l.law).join(',') === 'Law 7,Law 8,Law 16,Law 10,Law 11,Law 12,Law 13,Law 14', 'laws table cites Laws 7, 8, 16, 10, 11, 12, 13, 14');
}

// ---------------------------------------------------------------- stats

{
  const c = cfg('standard');
  const s = run(c, [R(0), R(0), R(0), R(1), R(0, 'net'), { t: 'let', code: 'caught_net' }]);
  assert(s.stats.rallies === 5 && s.stats.serveWon[0] === 3 && s.stats.recvWon[1] === 1 && s.stats.bestStreak[0] === 3 && s.stats.errors[1] === 1 && s.stats.lets === 1, 'stats: rallies, won on serve / receive, errors, streaks, lets');
}

// ---------------------------------------------------------------- reducer (local)

function localDriver(seed, o) {
  const rng = E.mulberry32(seed);
  let now = 1000000;
  const ME = 'me';
  let m = BM.reduceMatch(null, ME, 'create', Object.assign({ matchId: 'bd_local_' + seed, discipline: 'singles', format: 'standard', tier: 'normal', local: true, name: 'You' }, o || {}), now, rng).match;
  const inputs = [];
  for (let i = 0; i < 4000 && m.pub.status === 'playing'; i++) {
    const p = m.pub;
    if (p.phase === 'interval') {
      now = Math.max(now, p.pause.from + 300);
      inputs.push(['ready', {}, now]);
      m = BM.reduceMatch(clone(m), ME, 'ready', {}, now, rng).match;
      continue;
    }
    const c = p.contact;
    if (p.seats[c.seat] !== ME) throw new Error('contact not mine');
    const frac = rng() < 0.7 ? 0.45 + rng() * 0.3 : 0.1 + rng() * 0.85;
    const t = Math.round(c.dur * frac);
    now = Math.max(now, c.startAt + t);
    const args = { matchId: p.matchId, n: c.n, k: c.k, t, rtt: 0 };
    inputs.push(['hit', args, now]);
    m = BM.reduceMatch(clone(m), ME, 'hit', args, now, rng).match;
  }
  return { m, inputs };
}

{
  const a = localDriver(5);
  const b = localDriver(5);
  assert(a.m.pub.status === 'over' && JSON.stringify(a.m.pub.log) === JSON.stringify(b.m.pub.log), 'same seed + same inputs → identical match (vs Bot)');
  const st1 = BM.stateOf(a.m.pub);
  const st2 = E.replay(BM.configOf(a.m.pub), clone(a.m.pub.log));
  let inc = E.initState(BM.configOf(a.m.pub));
  a.m.pub.log.forEach((ev) => E.applyEvent(inc, clone(ev)));
  assert(JSON.stringify(st1.games) === JSON.stringify(st2.games) && JSON.stringify(st1.stats) === JSON.stringify(inc.stats) && st1.result.winner === a.m.pub.winner, 'replaying the log reproduces the same state (replay = incremental = reducer result)');
  const d = localDriver(9, { discipline: 'doubles', seats: { A1: 'bot:normal', B0: 'bot:normal', B1: 'bot:normal' } });
  assert(d.m.pub.status === 'over' && d.m.pub.discipline === 'doubles' && !d.m.pub.rated, 'you + bot partner v 2 bots plays to a result (unrated)');
  const q = localDriver(3, { format: 'quick11' });
  const qs = BM.stateOf(q.m.pub);
  assert(q.m.pub.status === 'over' && qs.games.every((g) => Math.max(g.score[0], g.score[1]) <= 15), 'Quick 11 vs Bot completes within the cap');
  const stats = BM.statsOf(a.m.pub);
  assert(stats.rallies > 20 && stats.longest >= 2 && stats.serve[0].of + stats.serve[1].of === stats.rallies, 'statsOf: rally count, longest rally, serve / receive split');
}

// ---------------------------------------------------------------- client-claimed points + RTT cap + AFK

{
  const A = 'userAAAA01';
  const B = 'userBBBB02';
  const rng = E.mulberry32(21);
  let now = 5000000;
  let m = BM.reduceMatch(null, A, 'join', { matchId: 'bd_claims', opponentUid: B, playerA: A, format: 'standard', name: 'Ava' }, now, rng).match;
  m = BM.reduceMatch(m, B, 'join', { matchId: 'bd_claims', name: 'Ben' }, now, rng).match;
  assert(m.pub.status === 'playing' && m.pub.rated && m.pub.toss && m.pub.log[0].t === 'start', 'two-human Standard singles starts rated with a server toss');
  assert(code(() => BM.reduceMatch(clone(m), A, 'point', { w: 0 }, now, rng)) === 'bad_op' && code(() => BM.reduceMatch(clone(m), A, 'score', { score: [21, 0] }, now, rng)) === 'bad_op', 'the server rejects client-claimed points (no point / score op)');
  assert(SRV && !BM.CLIENT_OPS.has('point') && !BM.CLIENT_OPS.has('rally') && !BM.CLIENT_OPS.has('settle_done'), 'client op allowlist has no point / rally / settle_done');
  const c = m.pub.contact;
  const owner = m.pub.seats[c.seat];
  const other = owner === A ? B : A;
  now = c.startAt + 400;
  assert(code(() => BM.reduceMatch(clone(m), other, 'hit', { matchId: 'bd_claims', n: c.n, k: c.k, t: 400 }, now, rng)) === 'not_your_shot', 'only the player the shuttle is coming to can hit');
  assert(code(() => BM.reduceMatch(clone(m), owner, 'hit', { matchId: 'bd_claims', n: c.n + 1, k: c.k, t: 400 }, now, rng)) === 'stale_contact', 'stale contacts are rejected');
  const plainHit = BM.reduceMatch(clone(m), owner, 'hit', { matchId: 'bd_claims', n: c.n, k: c.k, t: 400, rtt: 0 }, now, E.mulberry32(99)).match;
  const claimHit = BM.reduceMatch(clone(m), owner, 'hit', { matchId: 'bd_claims', n: c.n, k: c.k, t: 400, rtt: 0, w: c.side, winner: true, code: 'winner', score: [21, 0], log: [{ t: 'rally', w: 0 }] }, now, E.mulberry32(99)).match;
  assert(JSON.stringify(plainHit.pub) === JSON.stringify(claimHit.pub), 'a hit that claims a winner / score / log is resolved exactly like a plain tap');
  assert(BM.clampTap(0, 5000, 0) === 5000 - 80 && BM.clampTap(0, 5000, 5000) === 5000 - BM.MAX_COMP_MS && BM.clampTap(9999, 400, 0) === 400 && BM.clampTap(350, 400, 100) === 350, 'RTT compensation is capped (300 ms) and a tap can’t be in the future');
  // AFK: three missed turns forfeits the side (P1 policy).
  let afk = clone(m);
  let forfeited = false;
  for (let i = 0; i < 10 && afk.pub.status === 'playing'; i++) {
    const cc = afk.pub.contact;
    if (!cc) {
      afk = BM.reduceMatch(afk, A, 'tick', {}, afk.pub.deadline + 1, rng).match;
      continue;
    }
    const lazy = afk.pub.seats[cc.seat];
    if (lazy === A) {
      const r = BM.reduceMatch(afk, B, 'tick', {}, afk.pub.deadline + 1, rng);
      afk = r.match;
      if (r.result.forfeit) forfeited = true;
    } else {
      const t = Math.round(cc.dur * 0.6);
      afk = BM.reduceMatch(afk, B, 'hit', { matchId: 'bd_claims', n: cc.n, k: cc.k, t, rtt: 0 }, cc.startAt + t, rng).match;
    }
  }
  assert(forfeited && afk.pub.status === 'over' && afk.pub.winnerUids[0] === B && afk.pub.reason === 'afk', 'three missed turns forfeits (auto-serve / no swing counts as a miss)');
  // vs Bot on the phone: missed turns cost points, never a walkover (first-time players read the tips).
  let loc = BM.reduceMatch(null, 'me', 'create', { matchId: 'bd_afk_local', local: true, tier: 'normal' }, now, rng).match;
  // P13: an idle turn gets the weak auto-return (a lift), which the bot usually punishes.
  for (let i = 0; i < 80 && loc.pub.status === 'playing' && BM.stateOf(loc.pub).score[1] < 5; i++) {
    const r = BM.reduceMatch(loc, 'me', 'tick', {}, loc.pub.deadline + 1, rng);
    if (r) loc = r.match;
  }
  assert(loc.pub.status === 'playing' && BM.stateOf(loc.pub).score[1] >= 5, 'vs Bot: idle turns lose points but never forfeit');
  const left = BM.reduceMatch(clone(m), A, 'leave', {}, now, rng).match;
  assert(left.pub.status === 'over' && left.pub.winnerUids[0] === B && BM.stateOf(left.pub).result.by === 'forfeit', 'leaving mid-match forfeits');
}

// ---------------------------------------------------------------- server (fake RTDB)

function fakeAdmin() {
  const store = {};
  const get = (p) => p.split('/').reduce((o, k) => (o == null ? undefined : o[k]), store);
  const set = (p, v) => {
    const ks = p.split('/');
    let o = store;
    ks.slice(0, -1).forEach((k) => {
      o[k] = o[k] || {};
      o = o[k];
    });
    if (v === undefined) delete o[ks[ks.length - 1]];
    else o[ks[ks.length - 1]] = v;
  };
  const db = {
    ref: (p) => ({
      async transaction(fn) {
        // Like the Admin SDK: the first run may see an empty cache, then retries with the stored value.
        const cur = get(p);
        if (cur != null) {
          const spec = fn(null);
          if (spec === undefined) return { committed: false };
        }
        const next = fn(cur == null ? null : clone(cur));
        if (next === undefined) return { committed: false };
        set(p, next == null ? undefined : clone(next));
        return { committed: true };
      },
      async once() {
        const v = get(p);
        return { val: () => (v == null ? null : clone(v)) };
      },
    }),
  };
  return { get, set, app: { database: () => db, firestore: () => ({}) } };
}

async function driveLive(F, call, mid, humans, rng, clock) {
  const pubNow = () => BM.hydrate({ pub: clone(F.get('games/badminton/' + mid + '/pub')) }).pub;
  const trace = [];
  for (let i = 0; i < 6000; i++) {
    const p = pubNow();
    if (p.status !== 'playing') break;
    if (p.phase === 'interval') {
      clock.t = Math.max(clock.t, p.pause.from + 800);
      trace.push('interval:' + p.pause.kind + (p.pause.ends ? ':ends' : ''));
      for (const u of humans) await call(u, 'ready');
      continue;
    }
    const c = p.contact;
    const owner = p.seats[c.seat];
    if (BM.isBot(owner)) throw new Error('bot contact left open');
    const frac = rng() < 0.72 ? 0.44 + rng() * 0.32 : 0.1 + rng() * 0.86;
    const t = Math.round(c.dur * frac);
    clock.t = Math.max(clock.t, c.startAt + t);
    await call(owner, 'hit', { n: c.n, k: c.k, t, rtt: 40 });
  }
  return { pub: pubNow(), trace };
}

(async () => {
  const A = 'userAAAA01';
  const B = 'userBBBB02';
  const C = 'userCCCC03';
  const D = 'userDDDD04';

  // Rated Live Standard singles: 3 games with a deuce, fully server-resolved.
  {
    let found = null;
    for (let seed = 1; seed <= 400 && !found; seed++) {
      const F = fakeAdmin();
      const rng = E.mulberry32(seed);
      const clock = { t: 9000000 };
      const settled = [];
      const econ = {
        resolveGame: async (db, app, actor, body, opts) => {
          settled.push({ actor, body, opts });
          return { chipDelta: 40, eloDelta: 11, opponent: { chipDelta: -40, eloDelta: -11 } };
        },
      };
      const MID = 'badminton_live_' + seed;
      const call = (uid, op, a) => SRV.badmintonMatch(F.app, uid, Object.assign({ op, matchId: MID }, a || {}), { now: clock.t, rng, econ });
      await call(A, 'join', { opponentUid: B, playerA: A, name: 'Ava', format: 'standard', stake: 40 });
      await call(B, 'join', { opponentUid: A, name: 'Ben' });
      const out = await driveLive(F, call, MID, [A, B], rng, clock);
      const st = BM.stateOf(out.pub);
      const deuce = st.games.some((g) => Math.min(g.score[0], g.score[1]) >= 20);
      if (st.games.length === 3 && deuce) found = { out, st, settled, F, MID, seed };
    }
    assert(!!found, 'found a server-driven rated Standard singles match that goes to 3 games with a deuce');
    if (found) {
      const { out, st, settled, F, MID } = found;
      const pub = out.pub;
      assert(pub.status === 'over' && pub.rated && pub.stake === 40 && st.result.by === 'games', `Live Standard singles finished ${st.result.games.map((g) => g.join('–')).join(', ')} (rated, staked)`);
      assert(out.trace.filter((x) => x === 'interval:interval').length >= 2 && out.trace.filter((x) => x.indexOf('interval:game') === 0).length === 2 && out.trace.some((x) => x === 'interval:interval:ends'), 'intervals at 11 in every game, two game breaks, and the decider end change');
      assert(settled.length === 1 && settled[0].body.rated === true && settled[0].opts.trusted && settled[0].body.stake === 40 && pub.settlement && Object.keys(pub.settlement).length === 2, 'settled once through the shared economy (trusted, rated, stake)');
      assert(F.get('games/badminton/' + MID + '/server').settled === true, 'settle lease is marked done');
      let ok = true;
      let prev = null;
      pub.log.forEach((ev, i) => {
        const s = E.replay(BM.configOf(pub), pub.log.slice(0, i + 1));
        if (!s.over && s.court !== (s.score[s.server.side] % 2 === 0 ? 'R' : 'L')) ok = false;
        if (prev && ev.at < prev.at) ok = false;
        prev = ev;
      });
      assert(ok, 'courts correct after every rally; the log is time-ordered');
    }
  }

  // Live doubles 2 v 2 (four people) — rotation checked against the laws after every rally.
  {
    const F = fakeAdmin();
    const rng = E.mulberry32(77);
    const clock = { t: 12000000 };
    const placements = [];
    const econ = { resolvePlacement: async (db, app, body) => (placements.push(body), { players: { [A]: { chipDelta: 5 }, [C]: { chipDelta: 5 } } }), resolveGame: async () => ({}) };
    const MID = 'badminton_dbl_1';
    const call = (uid, op, a) => SRV.badmintonMatch(F.app, uid, Object.assign({ op, matchId: MID }, a || {}), { now: clock.t, rng, econ });
    await call(A, 'create', { discipline: 'doubles', format: 'standard', seats: { A1: C, B0: B, B1: D }, name: 'Ava' });
    let pub = F.get('games/badminton/' + MID + '/pub');
    assert(pub.status === 'waiting' && !pub.rated && pub.stake === 0, 'doubles room waits for all four; unrated, no stake');
    await call(C, 'join');
    await call(B, 'join');
    await call(D, 'join');
    pub = F.get('games/badminton/' + MID + '/pub');
    assert(pub.status === 'playing', 'everyone joined (the partner join needs no opponent id) → the match starts');
    const out = await driveLive(F, call, MID, [A, B, C, D], rng, clock);
    const c = BM.configOf(out.pub);
    let bad = '';
    for (let i = 1; i < out.pub.log.length; i++) {
      const prev = E.replay(c, out.pub.log.slice(0, i));
      const s = E.replay(c, out.pub.log.slice(0, i + 1));
      const ev = out.pub.log[i];
      if (s.over || ev.t !== 'rally' || s.g !== prev.g) continue;
      const idx = s.court === 'R' ? 0 : 1;
      if (s.court !== (s.score[s.server.side] % 2 === 0 ? 'R' : 'L')) bad = 'court at ' + i;
      if (s.server.player !== s.pos[s.server.side][idx] || s.receiver.player !== s.pos[s.receiver.side][idx]) bad = 'diagonal at ' + i;
      [0, 1].forEach((side) => {
        const moved = s.pos[side].join() !== prev.pos[side].join();
        if (moved !== (side === prev.server.side && ev.w === prev.server.side)) bad = 'moved at ' + i;
      });
    }
    assert(out.pub.status === 'over' && !bad, `Live doubles: correct server, receiver, courts and positions after every rally${bad ? ' — ' + bad : ''}`);
    assert(placements.length === 1 && placements[0].teams.winners.length === 2 && placements[0].stake === 0 && out.pub.winnerUids.length === 2, 'doubles team result recorded (unrated placement, no stake)');
  }

  // Bot partner (you + bot) v two people, and the serve contact always goes to the laws' server.
  {
    const F = fakeAdmin();
    const rng = E.mulberry32(31);
    const clock = { t: 15000000 };
    const econ = { resolvePlacement: async () => ({ players: {} }), resolveGame: async () => ({}) };
    const MID = 'badminton_dbl_bot';
    const call = (uid, op, a) => SRV.badmintonMatch(F.app, uid, Object.assign({ op, matchId: MID }, a || {}), { now: clock.t, rng, econ });
    await call(A, 'create', { discipline: 'doubles', format: 'quick11', seats: { A1: 'bot:sharp', B0: B, B1: C }, name: 'Ava' });
    await call(B, 'join');
    await call(C, 'join');
    const pubNow = () => BM.hydrate({ pub: clone(F.get('games/badminton/' + MID + '/pub')) }).pub;
    let serveOk = true;
    for (let i = 0; i < 4000; i++) {
      const p = pubNow();
      if (p.status !== 'playing') break;
      if (p.phase === 'interval') {
        clock.t = Math.max(clock.t, p.pause.from + 500);
        for (const u of [A, B, C]) await call(u, 'ready');
        continue;
      }
      const cc = p.contact;
      if (cc.serve) {
        const st = BM.stateOf(p, cc.startAt);
        if (cc.seat !== BM.seatOf(st.server.side, st.server.player) || cc.court !== st.court) serveOk = false;
      }
      const t = Math.round(cc.dur * (0.45 + rng() * 0.3));
      clock.t = Math.max(clock.t, cc.startAt + t);
      await call(p.seats[cc.seat], 'hit', { n: cc.n, k: cc.k, t, rtt: 30 });
    }
    const p = pubNow();
    assert(p.status === 'over' && serveOk, 'bot partner match: every serve window opens for the laws’ server from the right court');
  }

  // Doubles matchmaking queue.
  {
    const F = fakeAdmin();
    const rng = E.mulberry32(4);
    let now = 20000000;
    const q = (uid, op) => SRV.badmintonMatch(F.app, uid, { op, name: uid.slice(4, 8) }, { now, rng });
    const r1 = await q(A, 'queue');
    const r2 = await q(B, 'queue');
    const r3 = await q(C, 'queue');
    assert(r1.waiting && r3.waiting && r3.count === 3, 'queue: waiting until four');
    const r4 = await q(D, 'queue');
    assert(!!r4.matchId && F.get('games/badminton/' + r4.matchId + '/pub').discipline === 'doubles', 'fourth player creates a doubles match');
    const again = await q(A, 'queue');
    assert(again.matchId === r4.matchId, 'the others pick up the same match on their next poll');
    const seats = F.get('games/badminton/' + r4.matchId + '/pub').seats;
    assert([A, B, C, D].every((u) => Object.values(seats).indexOf(u) >= 0), 'all four are seated');
    now += SRV.QUEUE_STALE_MS + 1;
    const lone = await q('userEEEE05', 'queue');
    await q('userEEEE05', 'unqueue');
    assert(lone.waiting && lone.count === 1 && !(F.get(SRV.QUEUE_PATH).waiting || {}).userEEEE05, 'stale entries drop; unqueue leaves');
    void r2;
  }

  // Server edges.
  {
    const F = fakeAdmin();
    const rng = E.mulberry32(8);
    const call = (uid, body) => SRV.badmintonMatch(F.app, uid, body, { now: 30000000, rng }).then(() => '', (e) => e.code || e.message);
    assert((await call(A, { op: 'point', matchId: 'x1', w: 0 })) === 'bad_op', 'server: point op rejected');
    assert((await call(A, { op: 'settle_done', matchId: 'x1' })) === 'bad_op', 'server: settle_done is server-only');
    assert((await call(A, { op: 'join', matchId: 'x2' })) === 'bad_opponent', 'server: joining a missing match needs a real opponent');
    await SRV.badmintonMatch(F.app, A, { op: 'join', matchId: 'x3', opponentUid: B, playerA: A, local: true }, { now: 30000000, rng });
    assert(F.get('games/badminton/x3/pub').local === false, 'server: local flag is forced off');
    assert((await call(C, { op: 'hit', matchId: 'x3', n: 1, k: 0, t: 300 })) === 'not_in_match', 'server: outsiders can’t act');
  }

  // ---------------------------------------------------------------- wiring
  {
    const api = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js'));
    assert(api.length === 12, `api/*.js count is 12 (got ${api.length})`);
    const media = read('api/media-config.js');
    assert(/'badminton_match'/.test(media) && /server-lib\/badminton-engine/.test(media), 'badminton_match action on /api/media-config');
    const kit = read('public/src/js/games/party-kit.js');
    assert(/badminton: \['games\/badminton-engine\.js', 'games\/badminton-rally\.js', 'games\/badminton-match\.js'\]/.test(kit), 'LAZY_DATA loads the engine + rally model (P13) + match');
    const html = read('public/index.html');
    assert(/data-party-lazy src="\/src\/js\/games\/badminton-engine\.js\?v=/.test(html) && /data-party-lazy src="\/src\/js\/games\/badminton-match\.js\?v=/.test(html), 'index.html lists the lazy badminton scripts');
    const rules = JSON.parse(read('firebase/database.rules.json'));
    const g = rules.rules.games;
    assert(g.badminton && g.badminton.$matchId && g.badmintonQueue && g.badmintonQueue['.read'] === false && g.badmintonQueue['.write'] === false, 'RTDB rules: badminton rooms + a server-only queue');
    const pol = require(path.join(root, 'public/src/js/dangal/dangal-live-policy.js')).policyFor('badminton');
    assert(pol.afk && pol.afk.maxMisses === 3 && pol.leave === 'forfeit' && pol.spectate, 'Live policy: 3 misses, leave = forfeit, spectate');
    const court = read('public/src/js/games/court-sports.js');
    assert(/action: 'badminton_match'/.test(court) && !/submitResult|recordResult|claimWin/.test(court), 'the phone talks to badminton_match and never submits a result itself');
    assert(/speechSynthesis/.test(court) && /voice: s\.voice === true/.test(court), 'umpire voice is optional and off by default');
    const ds = read('public/src/js/dangal/design-system.js');
    assert(/badminton: 'Rules based on the BWF Laws of Badminton'/.test(ds) && !/official/i.test(court), 'attribution "Rules based on the BWF Laws of Badminton"; never "official"');
    const dr = read('public/src/js/dangal/dangal-rules.js');
    assert(/Quick 11[^']*Chaupaal quick format/.test(dr) && /Doubles service/.test(dr), 'rules sheet: formats (Quick 11 labelled) + doubles service');
    const all = [court, read('public/src/js/games/badminton-engine.js'), read('public/src/js/games/badminton-match.js')].join('\n');
    assert(!/Lin Dan|Lee Chong Wei|Axelsen|Momota|Sindhu|Yonex|Li-Ning|Victor\b/.test(all), 'no real player names or brands');
    assert(/Dangal P12/.test(read('CONVENTIONS.md')), 'CONVENTIONS documents P12');
    const pkg = JSON.parse(read('package.json'));
    assert(/test-dangal-p12-badminton-engine\.js/.test(pkg.scripts.test), 'npm test runs the P12 suite');
  }

  if (failed) {
    console.error(`\n${failed} P12 check(s) failed.`);
    process.exit(1);
  }
  console.log('\nDangal P12 badminton checks passed.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
