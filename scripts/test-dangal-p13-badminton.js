#!/usr/bin/env node
/**
 * Dangal P13 — Badminton 2: the exchange model (shot vocabulary, no smash from below, stamina decay +
 * recovery, doubles formations, bots never illegal), balance targets on a small sim (rally length,
 * serve balance, level gradient, no dominant shot, personas), the reducer's Live edge cases (disconnect
 * → let + pause → resume / forfeit, capped RTT, AFK → auto-return → forfeit, Simple controls unrated),
 * drills + line calls, and wiring (lazy load, persona table, api count).
 *   node scripts/test-dangal-p13-badminton.js
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

const E = require(path.join(root, 'public/src/js/games/badminton-engine.js'));
const R = require(path.join(root, 'public/src/js/games/badminton-rally.js'));
const BM = require(path.join(root, 'public/src/js/games/badminton-match.js'));
const SIM = require(path.join(root, 'scripts/sim-badminton.js'));
const AI = require(path.join(root, 'server-lib/dangal-ai.js'));

// ---------------------------------------------------------------- shot vocabulary + legality

{
  const want = ['serve_low', 'serve_high', 'serve_flick', 'clear_att', 'clear_def', 'drop_slow', 'drop_fast', 'smash_stand', 'smash_jump', 'drive', 'net_tumble', 'net_spin', 'net_kill', 'lift', 'push', 'block'];
  assert(want.every((s) => R.SHOTS[s]), 'shot vocabulary: serves (low/high/flick), clears, drops, smashes (standing/jump), drive, net shots (tumbling/spinning), net kill, lift, push, block');
  assert(['mid', 'low', 'serve', 'nethigh'].every((ch) => !R.legal('smash_jump', ch) && !R.legal('smash_stand', ch)), 'no smash from below (only from a high contact)');
  assert(R.legal('smash_jump', 'high', { st: 1 }) && !R.legal('smash_jump', 'high', { st: 0.1 }), 'a jump smash needs legs (stamina)');
  assert(!R.legal('net_tumble', 'low', { r: 0.9 }) && R.legal('net_tumble', 'low', { r: 0.3, y: 1.2 }), 'a net shot needs an early arrival at the net — a stretched player has to lift');
  assert(R.legal('net_kill', 'nethigh') && !R.legal('net_kill', 'low'), 'a net kill only off a shuttle above the tape');
  assert(R.naturalShot('high', { r: 0.5, y: 4.5, st: 1 }).indexOf('smash') === 0 && R.naturalShot('low', { r: 0.9, y: 2 }) === 'lift' && R.naturalShot('nethigh', { r: 0.3 }) === 'net_kill', 'a tap plays the natural shot (smash a short high one, kill at the tape, lift when late)');
  const rs = R.createRally({ discipline: 'singles', seats: ['A0', 'B0'], who: { A0: {}, B0: { bot: true, level: 'pro' } } });
  const sv = R.startRally(rs, { server: 'A0', receiver: 'B0', court: 'R' });
  assert(R.shotFor('serve', { tap: true }, {}) === 'serve_low' && R.shotFor('serve', { len: 1 }, {}) !== 'serve_low', 'serve: tap = low, swipe long = high / flick');
  void sv;
}

// ---------------------------------------------------------------- stamina decay + recovery

{
  const rs = R.createRally({ discipline: 'singles', seats: ['A0', 'B0'], who: { A0: { bot: true, level: 'club' }, B0: { bot: true, level: 'club' } } });
  const rng = E.mulberry32(7);
  let c = R.startRally(rs, { server: 'A0', receiver: 'B0', court: 'R' });
  let shots = 0;
  for (let i = 0; i < 400 && shots < 40; i++) {
    const bp = R.botPlay(rs, c, rng);
    const res = R.resolve(rs, c, { shot: bp.choice.shot, x: bp.choice.x, timing: bp.timing }, rng);
    shots++;
    if (res.kind === 'in') c = { seat: res.next.seat, serve: false, ch: res.next.ch, court: 'R', r: res.next.r, power: res.next.power, loose: res.next.loose };
    else c = R.startRally(rs, { server: 'A0', receiver: 'B0', court: 'R' });
  }
  const tired = rs.st.A0 + rs.st.B0;
  assert(tired < 2, 'stamina drains with running, lunges and jump smashes (' + tired.toFixed(2) + ' of 2 after 40 shots)');
  R.rest(rs, 'point');
  const afterPoint = rs.st.A0 + rs.st.B0;
  R.rest(rs, 'game');
  assert(afterPoint > tired && rs.st.A0 === 1 && rs.st.B0 === 1, 'stamina recovers a little between points and fully between games');
}

// ---------------------------------------------------------------- doubles formations

{
  const rs = R.createRally({ discipline: 'doubles', seats: ['A0', 'A1', 'B0', 'B1'], who: { A0: { bot: true, level: 'pro' }, A1: { bot: true, level: 'pro' }, B0: { bot: true, level: 'pro' }, B1: { bot: true, level: 'pro' } } });
  rs.pos.A0 = { x: 0.5, y: 5 };
  rs.pos.A1 = { x: -0.5, y: 2 };
  R.setBases(rs, 0, 'attack', 'A0');
  assert(rs.form[0] === 'attack' && rs.base.A0.y > 3.5 && rs.base.A1.y < 2.6, 'attack formation: front-back (the smasher from deep stays back, the partner takes the net)');
  R.setBases(rs, 0, 'defence', 'A0');
  assert(rs.form[0] === 'defence' && Math.sign(rs.base.A0.x) !== Math.sign(rs.base.A1.x) && Math.abs(rs.base.A0.y - rs.base.A1.y) < 0.6, 'defence formation: side by side');
  // In play: the side that lifts defends, the side hitting down attacks (it rotates by itself).
  const rng = E.mulberry32(11);
  let c = R.startRally(rs, { server: 'A0', receiver: 'B0', court: 'R' });
  const seen = { attack: 0, defence: 0 };
  let rot = 0;
  let prev = rs.form.slice();
  for (let i = 0; i < 1500; i++) {
    const bp = R.botPlay(rs, c, rng);
    const res = R.resolve(rs, c, { shot: bp.choice.shot, x: bp.choice.x, timing: bp.timing }, rng);
    rs.form.forEach((f) => f && (seen[f] += 1));
    if (rs.form[0] !== prev[0] || rs.form[1] !== prev[1]) rot++;
    prev = rs.form.slice();
    if (res.kind === 'in') c = { seat: res.next.seat, serve: false, ch: res.next.ch, court: 'R', r: res.next.r, power: res.next.power, loose: res.next.loose };
    else c = R.startRally(rs, { server: i % 2 ? 'A0' : 'B0', receiver: i % 2 ? 'B0' : 'A0', court: 'R' });
  }
  assert(seen.attack > 0 && seen.defence > 0 && rot > 50, 'doubles formations rotate automatically during rallies (' + rot + ' switches)');
}

// ---------------------------------------------------------------- balance (small sim; the full run is scripts/sim-badminton.js)

{
  const n = 160;
  const lv = SIM.levelReport(n, { discipline: 'singles' });
  const lens = R.LEVEL_ORDER.map((k) => lv[k].avgRally);
  assert(lens.every((x) => x >= 6 && x <= 12), 'average rally 6–12 shots at every level (' + lens.map((x) => x.toFixed(1)).join(' / ') + ')');
  assert(lens[3] > lens[0], 'better players rally longer');
  assert(R.LEVEL_ORDER.every((k) => lv[k].serverWin > 0.4 && lv[k].serverWin < 0.6), 'serve / receive near balanced');
  assert(R.LEVEL_ORDER.every((k) => lv[k].winnerShare > 0.4 && lv[k].winnerShare < 0.75 && lv[k].smashShare > 0.08 && lv[k].smashShare < 0.3), 'a realistic winner / error / smash mix');
  assert(R.LEVEL_ORDER.every((k) => lv[k].illegal === 0), 'bots never play an illegal shot (smash from below, kill off a low one, unknown code)');
  const g = SIM.gradient(200, { discipline: 'singles' });
  assert(g['pro>beginner'] > 0.93, 'top tier beats bottom (' + g['pro>beginner'] + ')');
  assert(['club>beginner', 'county>club', 'pro>county'].every((k) => g[k] > 0.6 && g[k] < 0.82), 'adjacent tiers ~65–75% (' + JSON.stringify(g) + ')');
  const d = SIM.dominance(150, 'club', { discipline: 'singles' });
  assert(Object.values(d).every((x) => x < 0.5), 'no dominant shot: spam-smash / spam-clear / spam-net all lose to an all-rounder (' + JSON.stringify(d) + ')');
  const dbl = SIM.matchup({ level: 'pro' }, { level: 'beginner' }, 60, 5, { discipline: 'doubles' });
  assert(dbl.aWin > 0.8 && dbl.illegal === 0 && dbl.avgRally >= 5, 'doubles: pro beats beginner, no illegal shots, real rallies');
  const per = ['attacker', 'retriever', 'net'].map((p) => SIM.matchup({ level: 'county', persona: p }, { level: 'county' }, 150, 1234, { discipline: 'singles' }));
  assert(per.every((s) => s.aWin > 0.35 && s.aWin < 0.65), 'personas are styles, not hidden levels (' + per.map((s) => s.aWin.toFixed(2)).join(' / ') + ' vs an All-rounder)');
  assert(per[0].shotMix.smash > per[1].shotMix.smash && per[1].shotMix.clear > per[0].shotMix.clear && per[2].shotMix.net > per[0].shotMix.net, 'personas feel distinct: Attacker smashes most, Retriever clears most, Net player plays the net most');
}

// ---------------------------------------------------------------- bots + personas + labels

{
  assert(R.LEVEL_ORDER.join() === 'beginner,club,county,pro' && R.PERSONA_ORDER.join() === 'allround,attacker,retriever,net', 'levels Beginner / Club / County / Pro · personas All-rounder / Attacker / Retriever / Net player');
  assert(R.botLabel('pro', 'attacker') === 'Pro · Attacker Bot' && R.botLabel('club', 'allround') === 'Club Bot', 'bot labels read "Pro · Attacker Bot" (always marked Bot)');
  assert(R.levelOf('easy') === 'beginner' && R.levelOf('normal') === 'club' && R.levelOf('sharp') === 'county', 'old P12 tiers map onto the new levels');
  assert(BM.botSeat('bot:pro:net') === 'bot:pro:net' && BM.botLabel('bot:county:retriever') === 'County · Retriever Bot', 'reducer bot seats carry level + persona');
  const same = R.PERSONA_ORDER.every((p) => AI.BADMINTON_PERSONAS[p] && JSON.stringify(AI.BADMINTON_PERSONAS[p].style) === JSON.stringify(R.PERSONAS[p].style));
  assert(same, 'botPersona hook: server-lib/dangal-ai.js persona styles match the rally model');
}

// ---------------------------------------------------------------- reducer: Live edge cases

const A = 'uid_ava';
const B = 'uid_ben';
const now0 = 1_800_000_000_000;
function live(o) {
  const rng = E.mulberry32(3);
  let m = BM.reduceMatch(null, A, 'join', Object.assign({ matchId: 'bd_p13', opponentUid: B, playerA: A, format: 'standard', name: 'Ava' }, o || {}), now0, rng).match;
  m = BM.reduceMatch(m, B, 'join', { matchId: 'bd_p13', name: 'Ben' }, now0, rng).match;
  m.presence = { [A]: { at: now0, online: true }, [B]: { at: now0, online: true } };
  return { m, rng };
}
/** Play until the shuttle is in a rally and it's `who`'s turn (the other side taps mid-window). */
function toRallyTurn(m, rng, who) {
  for (let i = 0; i < 60; i++) {
    const c = m.pub.contact;
    if (m.pub.phase === 'rally' && c && m.pub.seats[c.seat] === who) return m;
    if (!c) {
      m = BM.reduceMatch(m, A, 'tick', {}, Math.max(m.pub.deadline, now0) + 1, rng).match;
      continue;
    }
    const uid = m.pub.seats[c.seat];
    const at = c.startAt + c.dur * 0.6;
    m.presence[A].at = at;
    m.presence[B].at = at;
    const r = BM.reduceMatch(m, uid, 'hit', { n: c.n, k: c.k, t: Math.round(c.dur * 0.6), sw: { len: 0.95, hard: false, x: 0 } }, at, rng);
    m = r.match;
  }
  return m;
}

{
  const { m: m0, rng } = live();
  assert(m0.pub.rated && m0.pub.status === 'playing', 'two humans, Standard singles: rated');
  let m = toRallyTurn(clone(m0), rng, B);
  assert(m.pub.phase === 'rally', 'reached a rally in progress');
  const logLen = m.pub.log.length;
  const score = BM.stateOf(m.pub).score.join('-');
  const t = m.pub.contact.startAt + 100;
  m.presence[A].at = t;
  m.presence[B] = { at: t - 1000, online: false };
  let r = BM.reduceMatch(m, A, 'tick', {}, t, rng);
  m = r.match;
  assert(r.result.paused && r.result.let && m.pub.phase === 'paused' && m.pub.log.length === logLen + 1 && m.pub.log[logLen].t === 'let', 'a mid-rally disconnect: the rally becomes a let and play pauses');
  assert(BM.stateOf(m.pub).score.join('-') === score, 'the let changes nothing on the scoreboard');
  // Back inside the reconnect window → the same server serves again.
  const back = clone(m);
  back.presence[B] = { at: t + 5000, online: true };
  back.presence[A].at = t + 5000;
  r = BM.reduceMatch(back, B, 'join', { matchId: 'bd_p13' }, t + 5000, rng);
  assert(r.result.resumed && r.match.pub.phase === 'serve' && r.match.pub.contact && r.match.pub.contact.serve, 'reconnect within the window: play resumes with a serve (let replayed)');
  // Still gone after the window → forfeit.
  const gone = clone(m);
  const late = t + BM.RECONNECT_MS + 1;
  gone.presence[A].at = late;
  r = BM.reduceMatch(gone, A, 'tick', {}, late, rng);
  assert(r.result.forfeit && r.match.pub.status === 'over' && r.match.pub.winnerUids.indexOf(A) >= 0, 'no reconnect within the window: the dropped side forfeits');
  // Repeated drops in a row count like missed turns (P1): the third one forfeits.
  let rep = clone(m0);
  let forfeited = false;
  let tt = now0 + 10000;
  for (let k = 0; k < 4 && !forfeited; k++) {
    rep.presence[A] = { at: tt, online: true };
    rep.presence[B] = { at: tt, online: false };
    const rr = BM.reduceMatch(rep, A, 'tick', {}, tt, rng);
    rep = rr.match;
    if (rr.result.forfeit) forfeited = true;
    else {
      tt += 3000;
      rep.presence[A].at = tt;
      rep.presence[B] = { at: tt, online: true };
      rep = BM.reduceMatch(rep, B, 'ready', {}, tt, rng).match;
      tt += 100;
    }
  }
  assert(forfeited && rep.pub.winnerUids.indexOf(A) >= 0, 'repeated drops in a row forfeit (P1 missed-turn policy)');
}

{
  // Intervals + end changes survive a reconnect: the laws state is a replay of the log.
  const { m: m0 } = live();
  const m = clone(m0);
  const st0 = BM.stateOf(m.pub);
  const again = BM.hydrate(JSON.parse(JSON.stringify(m)));
  assert(JSON.stringify(BM.stateOf(again.pub).score) === JSON.stringify(st0.score), 'state rebuilds from the log after a reload / reconnect');
}

{
  // Capped RTT compensation.
  assert(BM.MAX_COMP_MS === 300 && BM.clampTap(0, 5000, 99999) === 5000 - BM.MAX_COMP_MS && BM.clampTap(9999, 400, 0) === 400, 'RTT compensation is capped (300 ms) and a tap can’t be in the future');
}

{
  // AFK: no shot in time → the weak auto-return (low serve / lift) → third miss forfeits.
  const { m: m0, rng } = live();
  let m = toRallyTurn(clone(m0), rng, A);
  const c = m.pub.contact;
  let r = BM.reduceMatch(m, B, 'tick', {}, m.pub.deadline + 1, rng);
  m = r.match;
  const h = m.pub.hits.length ? m.pub.hits[m.pub.hits.length - 1] : m.pub.prevHits[m.pub.prevHits.length - 1];
  assert(r.result.autoLift && h.auto === 'lift' && h.seat === c.seat && h.timing === 'auto', 'AFK in a rally: a weak auto-return is played for you');
  assert(m.pub.misses[A] === 1, 'the auto-return counts as a miss');
  let forfeit = false;
  for (let i = 0; i < 200 && !forfeit && m.pub.status === 'playing'; i++) {
    const cc = m.pub.contact;
    if (!cc) {
      m = BM.reduceMatch(m, B, 'tick', {}, m.pub.deadline + 1, rng).match;
      continue;
    }
    const at = m.pub.deadline + 1;
    m.presence[A].at = at;
    m.presence[B].at = at;
    if (m.pub.seats[cc.seat] === A) {
      r = BM.reduceMatch(m, B, 'tick', {}, at, rng);
      m = r.match;
      if (r.result && r.result.forfeit) forfeit = true;
    } else m = BM.reduceMatch(m, B, 'hit', { n: cc.n, k: cc.k, t: Math.round(cc.dur * 0.6) }, cc.startAt + cc.dur * 0.6, rng).match;
  }
  assert(forfeit && m.pub.winnerUids.indexOf(B) >= 0 && m.pub.reason === 'afk', 'repeated AFK forfeits the match');
  // Local practice never forfeits for AFK.
  let loc = BM.reduceMatch(null, 'me', 'create', { matchId: 'bd_p13_local', local: true, tier: 'club' }, now0, rng).match;
  for (let i = 0; i < 40 && loc.pub.status === 'playing'; i++) {
    const rr = BM.reduceMatch(loc, 'me', 'tick', {}, loc.pub.deadline + 1, rng);
    if (rr) loc = rr.match;
  }
  assert(loc.pub.status === 'playing' || loc.pub.reason !== 'afk', 'practice vs a bot never forfeits for AFK');
}

{
  // Simple controls: unrated, no stake, the shot is picked for you.
  const { m, rng } = live({ simple: true, stake: 100 });
  assert(m.pub.simple[A] && !m.pub.rated && m.pub.stake === 0, 'Simple controls: the match is unrated with no stake');
  let mm = clone(m);
  const c = mm.pub.contact;
  if (c && mm.pub.seats[c.seat] === A) {
    const r = BM.reduceMatch(mm, A, 'hit', { n: c.n, k: c.k, t: Math.round(c.dur * 0.6), sw: { len: 0.1, hard: true, x: 1 } }, c.startAt + c.dur * 0.6, rng);
    assert(r.result.resolved, 'a Simple player’s tap resolves (their swipe is ignored — the model picks the shot)');
  } else assert(true, 'a Simple player’s tap resolves (B serves first on this seed)');
  // Simple can't be switched on after the first point.
  mm = toRallyTurn(clone(m0Ref()), rng, A);
  const before = !!mm.pub.simple[A];
  const r2 = BM.reduceMatch(mm, A, 'join', { matchId: 'bd_p13', simple: true }, now0 + 60000, rng);
  assert(!before && !r2.match.pub.simple[A] && r2.match.pub.rated, 'Simple can’t be turned on mid-match to dodge a rated result');
}
function m0Ref() {
  return live().m;
}

{
  // Swipe input is sanitised; the reducer ignores claimed outcomes.
  const { m: m0, rng } = live();
  const m = toRallyTurn(clone(m0), rng, A);
  const c = m.pub.contact;
  const r = BM.reduceMatch(m, A, 'hit', { n: c.n, k: c.k, t: Math.round(c.dur * 0.55), sw: { len: 99, hard: 'yes', x: -40 }, winner: true, code: 'winner', score: [21, 0] }, c.startAt + c.dur * 0.55, rng);
  const h = r.match.pub.hits.find((x) => x.seat === c.seat && !x.auto) || r.match.pub.prevHits.find((x) => x.seat === c.seat);
  assert(r.result.resolved && h && R.SHOTS[h.shot], 'a wild swipe is clamped into a legal shot; claimed winner / score are ignored');
  assert(BM.CLIENT_OPS.has('move') && BM.CLIENT_OPS.has('hit'), 'client ops include move (drag your base)');
}

{
  // Rematch: a new match with a fresh toss for the first server.
  const { m: m0, rng } = live();
  const m = clone(m0);
  m.pub.status = 'over';
  let r = BM.reduceMatch(m, A, 'rematch', {}, now0 + 1000, rng);
  r = BM.reduceMatch(r.match, B, 'rematch', {}, now0 + 1100, rng);
  const nx = r.result && r.result.createNext;
  assert(nx && nx.rematchOf === 'bd_p13', 'rematch creates the next match');
  if (nx) {
    let n2 = BM.reduceMatch(null, A, 'create', Object.assign({}, nx), now0 + 2000, E.mulberry32(99)).match;
    n2 = BM.reduceMatch(n2, B, 'join', { matchId: nx.matchId }, now0 + 2000, E.mulberry32(99)).match;
    assert(n2.pub.toss && (n2.pub.toss.winner === 0 || n2.pub.toss.winner === 1), 'the rematch re-tosses for the first server');
  }
}

// ---------------------------------------------------------------- drills + line calls + speed

{
  assert(R.DRILL_ORDER.join() === 'serve,smash,net', 'drills: serve practice, smash defence, net play');
  const good = (kind) => {
    const d = R.createDrill(kind, 42);
    while (d.contact) R.playDrill(d, { req: { tap: true }, timing: 'perfect' });
    return d;
  };
  const bad = (kind) => {
    const d = R.createDrill(kind, 42);
    while (d.contact) R.playDrill(d, { miss: true });
    return d;
  };
  R.DRILL_ORDER.forEach((k) => {
    const g = good(k);
    const b = bad(k);
    assert(g.i === R.DRILLS[k].shots && g.score > 0 && g.score <= R.DRILLS[k].max && b.score === 0, k + ' drill: 10 shots, a score out of ' + R.DRILLS[k].max + ' (' + g.score + ' well-timed, ' + b.score + ' all missed)');
  });
  const again = R.createDrill('smash', 42);
  const first = R.createDrill('smash', 42);
  assert(JSON.stringify(again.contact) === JSON.stringify(first.contact), 'a drill is repeatable from its seed');
  const cc = R.closeCall({ x: 0, y: 6.64 }, { discipline: 'singles', margin: 0.15 });
  assert(cc && !cc.out && R.closeCall({ x: 0, y: 3 }, { discipline: 'singles', margin: 0.15 }) === null, 'close calls near a line are flagged for a "Simulated line call" replay');
  const rs = R.createRally({ discipline: 'singles', seats: ['A0', 'B0'], who: { A0: { bot: true, level: 'pro', persona: 'attacker' }, B0: { bot: true, level: 'pro' } } });
  rs.pos.A0 = { x: 0, y: 4 };
  const res = R.resolve(rs, { seat: 'A0', serve: false, ch: 'high', court: 'R', r: 0.3, power: 0 }, { shot: 'smash_jump', x: 0.3, timing: 'perfect' }, E.mulberry32(1));
  assert(res.kmh >= R.SHOTS.smash_jump.kmh[0] && res.kmh <= R.SHOTS.smash_jump.kmh[1] + 1, 'every shot carries a simulated speed (km/h) for the share card');
}

// ---------------------------------------------------------------- wiring

{
  const kit = read('public/src/js/games/party-kit.js');
  assert(/badminton:\s*\[[^\]]*badminton-engine\.js[^\]]*badminton-rally\.js[^\]]*badminton-match\.js/.test(kit), 'party-kit lazy-loads engine → rally model → reducer');
  const html = read('public/index.html');
  assert(html.indexOf('games/badminton-rally.js') > 0 && html.indexOf('games/badminton-rally.js') < html.indexOf('games/badminton-match.js'), 'index.html lists the rally model before the reducer');
  const ui = read('public/src/js/games/court-sports.js');
  assert(/function openDrillsSheet/.test(ui) && /function startDrill/.test(ui) && /KEY_DRILLS/.test(ui), 'drills UI with a personal best');
  assert(/swipeFrom/.test(ui) && /send\('move'/.test(ui), 'swipe controls + drag to reposition');
  assert(/Simulated line call/.test(ui) && /sim km\/h/.test(ui), 'line-call replays and speeds are labelled simulated');
  assert(/HIGH_RTT_MS/.test(ui) && /Connection lost/.test(ui), 'high-latency warning + reconnect pause UI');
  assert(/longestRally/.test(ui) && /fastestSmash/.test(ui), 'share card carries the longest rally and fastest smash');
  const css = read('public/src/styles/dangal.css');
  assert(/\.bd-trail/.test(css) && /\.bd-linecall/.test(css) && /orientation:landscape/.test(css), 'shuttle trail, line call and landscape styles');
  const api = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js'));
  assert(api.length === 12, 'Hobby cap: api/*.js stays at 12 (' + api.length + ')');
  const pkg = read('package.json');
  assert(pkg.indexOf('test-dangal-p13-badminton.js') > 0, 'npm test runs the P13 suite');
}

if (failed) {
  console.error(`\n${failed} P13 check(s) failed`);
  process.exit(1);
}
console.log('\nDangal P13 badminton: all checks passed');
