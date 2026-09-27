/**
 * Dangal H2 — Penalty Shootout.
 *  (a) shootout logic: alternation, early finish, sudden death in pairs, best of 3 / 5 / 10
 *  (b) outcome model: determinism + edges (post, bar, over, wide, centre vs centre, early vs late, Panenka)
 *  (c) AI difficulty bounds (easy < medium < hard) and honest outputs
 *  (d) Live reducer: no kick / dive visible before resolution, timeout → random pick, disconnect →
 *      forfeit, leave, void, rematch, internal-only settle ops
 *  (e) chip settlement: trusted server path; a client claim for a Live match is ignored
 *  (f) wiring: roster, graduation, identity, how-to, achievements, matchmaking matchId, rules,
 *      registry, scripts, renderer smoke, global-first copy, api count
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  console.log('✓', msg);
}

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const P = require(path.join(root, 'public/src/js/games/penalty-core.js'));
const Engine = require(path.join(root, 'server-lib/penalty-engine.js'));

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const throwsCode = (fn, code) => {
  try {
    fn();
  } catch (e) {
    return e.code === code || e.message === code;
  }
  return false;
};

// ---------- (a) shootout ----------
{
  const so = P.createShootout({ bestOf: 5 });
  assert(P.shootoutStatus(so).next === 'A' && P.shootoutStatus(so).round === 1, 'A kicks first');
  assert(throwsCode(() => P.addKick(so, 'B', true), 'out_of_turn'), 'kicks alternate — B cannot kick out of turn');
  P.addKick(so, 'A', true);
  assert(P.shootoutStatus(so).next === 'B', 'then B');
  assert(throwsCode(() => P.addKick(so, 'A', true), 'out_of_turn'), 'A cannot kick twice in a row');

  // A scores 3, B misses 3 → B can reach at most 2: over after six kicks.
  const e = P.createShootout({ bestOf: 5 });
  [['A', 1], ['B', 0], ['A', 1], ['B', 0], ['A', 1]].forEach(([s, g]) => P.addKick(e, s, !!g));
  assert(!P.shootoutStatus(e).over, 'not over while B can still level (3–0 after five kicks, B has three left)');
  P.addKick(e, 'B', false);
  const st = P.shootoutStatus(e);
  assert(st.over && st.winner === 'A' && e.kicks.length === 6, 'early finish: 3–0 after three each, B cannot catch up');
  assert(throwsCode(() => P.addKick(e, 'A', true), 'shootout_over'), 'no kicks after the result');

  // Early finish straight after A's kick.
  const f = P.createShootout({ bestOf: 5 });
  [['A', 1], ['B', 0], ['A', 1], ['B', 0], ['A', 1], ['B', 0], ['A', 0], ['B', 1]].forEach(([s, g]) => {
    if (!P.shootoutStatus(f).over) P.addKick(f, s, !!g);
  });
  assert(P.shootoutStatus(f).over && f.kicks.length === 6, 'stops as soon as the result is certain');

  // B clinches mid-round: A misses everything, B scores.
  const g = P.createShootout({ bestOf: 5 });
  [['A', 0], ['B', 1], ['A', 0], ['B', 1], ['A', 0], ['B', 1]].forEach(([s, x]) => P.addKick(g, s, !!x));
  assert(P.shootoutStatus(g).over && P.shootoutStatus(g).winner === 'B', 'B wins 3–0 after three each');

  // Sudden death in pairs.
  const sd = P.createShootout({ bestOf: 5 });
  for (let i = 0; i < 10; i++) P.addKick(sd, i % 2 ? 'B' : 'A', true);
  let s2 = P.shootoutStatus(sd);
  assert(!s2.over && s2.sudden && s2.round === 6 && s2.next === 'A', '5–5 → sudden death, A first');
  P.addKick(sd, 'A', true);
  assert(!P.shootoutStatus(sd).over, 'sudden death is decided in pairs — not after A alone');
  P.addKick(sd, 'B', true);
  P.addKick(sd, 'A', false);
  P.addKick(sd, 'B', false);
  assert(!P.shootoutStatus(sd).over, 'both miss in a sudden-death round → keep going');
  P.addKick(sd, 'A', true);
  P.addKick(sd, 'B', false);
  s2 = P.shootoutStatus(sd);
  assert(s2.over && s2.winner === 'A' && s2.scoreA === 7 && s2.scoreB === 6, 'sudden death: A scores, B misses → A wins');
  assert(P.dots(sd, 'A', { noPad: true }).length === 8, 'dots track every kick (sudden death included)');
  assert(/sudden death/.test(P.shareText(sd, { A: 'Ana', B: 'Ben' })) && /Ana 7–6 Ben/.test(P.shareText(sd, { A: 'Ana', B: 'Ben' })), 'share text: scoreline + sudden death');

  [3, 10].forEach((n) => {
    const b = P.createShootout({ bestOf: n });
    for (let i = 0; i < n * 2; i++) P.addKick(b, i % 2 ? 'B' : 'A', true);
    const x = P.shootoutStatus(b);
    assert(!x.over && x.sudden && x.round === n + 1, `best of ${n} then sudden death`);
  });
  assert(P.normBestOf(7) === 5 && P.normBestOf(10) === 10, 'match length limited to 3 / 5 / 10 (default 5)');
  const cs = P.createShootout({ bestOf: 3 });
  [['A', 1], ['B', 0], ['A', 1], ['B', 0]].forEach(([s, x]) => P.addKick(cs, s, !!x));
  assert(P.cleanSheet(cs, 'A') && !P.cleanSheet(cs, 'B'), 'clean sheet = winner conceded none');
}

// ---------- (b) outcome model ----------
{
  const rng = seeded(11);
  let same = true;
  for (let i = 0; i < 400; i++) {
    const k = { x: rng() * 2.6 - 1.3, y: rng() * 1.3, power: rng() };
    const d = { x: rng() * 2 - 1, y: rng(), t: rng() };
    const seed = Math.floor(rng() * 4294967296);
    if (JSON.stringify(P.resolveKick(k, d, seed)) !== JSON.stringify(P.resolveKick(k, d, seed))) same = false;
  }
  assert(same, 'resolveKick is deterministic for the same kick, dive and seed');

  const many = (k, d, n) => {
    const out = { goal: 0, save: 0, miss: 0, post: 0, details: {} };
    for (let s = 1; s <= (n || 200); s++) {
      const r = P.resolveKick(k, d, s * 7919);
      out[r.result] += 1;
      out.details[r.detail] = (out.details[r.detail] || 0) + 1;
    }
    return out;
  };
  const far = { x: -0.62, y: 0.22, t: 0 };
  const post = many({ x: 1, y: 0.5, power: 0.1 }, far);
  assert(post.post >= 150 && post.details.post >= 150, `aim at the post → hits the woodwork (${post.post}/200)`);
  const bar = many({ x: 0.2, y: 1, power: 0.1 }, far);
  assert(bar.post >= 150 && bar.details.bar >= 150, `aim at the bar → off the bar (${bar.post}/200)`);
  const over = many({ x: 0.2, y: 1.4, power: 0.6 }, far);
  assert(over.miss === 200 && over.details.over === 200, 'well over the bar → OVER');
  const wide = many({ x: 1.4, y: 0.3, power: 0.6 }, far);
  assert(wide.miss === 200 && wide.details.wide === 200, 'well wide → WIDE');
  const cvc = many({ x: 0, y: 0.4, power: 0.5 }, { x: 0, y: 0.4, t: 0.5 });
  assert(cvc.save === 200, 'centre vs centre → always saved');
  const wrong = many({ x: 0.65, y: 0.3, power: 0.7 }, far);
  assert(wrong.goal === 200, 'early keeper sent the wrong way → goal');
  const lateSoft = many({ x: 0.8, y: 0.3, power: 0.35 }, { x: 0, y: 0.4, t: 1 });
  const lateHard = many({ x: 0.7, y: 0.3, power: 0.7 }, { x: 0, y: 0.4, t: 1 });
  assert(lateSoft.save === 200 && lateHard.goal >= 195, `late keeper reacts to a soft corner kick but not a hard one (${lateSoft.save} saved / ${lateHard.goal} scored)`);
  const earlyCentreHard = many({ x: 0.7, y: 0.3, power: 0.7 }, { x: 0, y: 0.4, t: 0 });
  assert(earlyCentreHard.goal >= 195, 'an early centre keeper has committed — no reaction to the corner');
  const pan = P.resolveKick({ x: 0, y: 0.55, power: 0.22 }, { x: 0.62, y: 0.22, t: 0.1 }, 42);
  const panSaved = P.resolveKick({ x: 0, y: 0.55, power: 0.22 }, { x: 0, y: 0.4, t: 0.5 }, 42);
  assert(pan.result === 'goal' && pan.panenka && pan.chip, 'Panenka: soft chip down the middle beats an early side dive');
  assert(panSaved.result === 'save' && !panSaved.panenka, 'Panenka into a keeper who stays → saved');

  // Power trades save-ability for miss risk.
  const vsRandom = (power, x) => {
    const r = seeded(99);
    let goals = 0;
    let misses = 0;
    for (let i = 0; i < 3000; i++) {
      const res = P.resolveKick({ x, y: 0.3, power }, P.randomDive(r), Math.floor(r() * 4294967296));
      if (res.result === 'goal') goals++;
      if (res.result === 'miss' || res.result === 'post') misses++;
    }
    return { goals: goals / 3000, misses: misses / 3000 };
  };
  const soft = vsRandom(0.3, 0.75);
  const firm = vsRandom(0.7, 0.75);
  const blast = vsRandom(1, 0.85);
  assert(firm.goals > soft.goals + 0.1, `more power is harder to save (goal ${soft.goals.toFixed(2)} → ${firm.goals.toFixed(2)})`);
  assert(blast.misses > firm.misses + 0.1, `full power into the corner misses more (miss ${firm.misses.toFixed(2)} → ${blast.misses.toFixed(2)})`);
  assert(P.wobbleRadius(1) > P.wobbleRadius(0.5) * 2 && P.wobbleRadius(0.1) < 0.05, 'wobble grows with power');
  assert(P.keeperReach(0, 0.5) > P.keeperReach(1, 0.5) && P.keeperPull(1, 0.3) > P.keeperPull(0, 0.3), 'early = more reach, late = more reaction');
  const nk = P.normKick({ x: 9, y: -3, power: 7 });
  assert(nk.x === 1.5 && nk.y === 0 && nk.power === 1 && !P.isKick({ x: 'a', y: 0, power: 1 }), 'inputs are clamped / validated');
}

// ---------- (c) AI ----------
{
  const convert = (level) => {
    const r = seeded(5);
    const mem = P.newMemory();
    let goals = 0;
    for (let i = 0; i < 3000; i++) {
      const k = P.aiKick(level, mem, r);
      if (P.resolveKick(k, P.randomDive(r), Math.floor(r() * 4294967296)).result === 'goal') goals++;
    }
    return goals / 3000;
  };
  const ce = convert('easy');
  const cm = convert('medium');
  const ch = convert('hard');
  assert(ce < cm && cm < ch, `AI kick conversion rises with difficulty (${ce.toFixed(2)} / ${cm.toFixed(2)} / ${ch.toFixed(2)})`);
  assert(ce > 0.2 && ch < 0.85, 'even Hard is beatable; even Easy scores sometimes');

  const saveVsHabit = (level) => {
    const r = seeded(8);
    const mem = P.newMemory();
    let saves = 0;
    for (let i = 0; i < 2000; i++) {
      const kick = { x: 0.7, y: 0.25, power: 0.5 };
      const dive = P.aiDive(level, mem, r);
      if (P.resolveKick(kick, dive, Math.floor(r() * 4294967296)).result === 'save') saves++;
      P.remember(mem, 'kick', kick);
    }
    return saves / 2000;
  };
  const se = saveVsHabit('easy');
  const sm = saveVsHabit('medium');
  const sh = saveVsHabit('hard');
  assert(se < sm && sm < sh && sh > 0.6, `Hard reads a habitual kicker (save ${se.toFixed(2)} / ${sm.toFixed(2)} / ${sh.toFixed(2)})`);

  const r = seeded(3);
  let valid = true;
  const mem = P.newMemory();
  for (let i = 0; i < 500; i++) {
    const k = P.aiKick(P.LEVELS[i % 3], mem, r);
    const d = P.aiDive(P.LEVELS[i % 3], mem, r);
    P.remember(mem, 'dive', { x: -0.62, y: 0.22, t: 0.1 });
    if (!P.isKick(k) || !P.isDive(d) || JSON.stringify(P.normKick(k)) !== JSON.stringify(k) || JSON.stringify(P.normDive(d)) !== JSON.stringify(d)) valid = false;
  }
  assert(valid, 'AI choices are always normalised, valid kicks / dives');
  const hardMem = P.newMemory();
  let panenkas = 0;
  const hr = seeded(21);
  for (let i = 0; i < 6; i++) P.remember(hardMem, 'dive', { x: 0.62, y: 0.22, t: 0.1 });
  for (let i = 0; i < 1000; i++) if (P.isChip(P.aiKick('hard', hardMem, hr))) panenkas++;
  assert(panenkas > 60 && panenkas < 250, `Hard tries the odd Panenka against an early diver (${panenkas}/1000)`);
  const sides = P.newMemory();
  const sr = seeded(4);
  let triple = false;
  for (let i = 0; i < 300; i++) {
    P.aiKick('hard', sides, sr);
    const last = sides.mySides.slice(-3);
    if (last.length === 3 && last[0] === last[1] && last[1] === last[2] && last[0] !== 'centre') triple = true;
  }
  assert(!triple, 'Hard never picks the same corner three times running');
}

// ---------- (d) Live reducer ----------
/** RTDB round trip: nulls, empty objects and empty arrays disappear. */
function rtdbTrip(v) {
  const strip = (x) => {
    if (x === null || x === undefined) return undefined;
    if (Array.isArray(x)) {
      const a = x.map(strip).filter((y) => y !== undefined);
      return a.length ? a : undefined;
    }
    if (typeof x === 'object') {
      const o = {};
      Object.keys(x).forEach((k) => {
        const y = strip(x[k]);
        if (y !== undefined) o[k] = y;
      });
      return Object.keys(o).length ? o : undefined;
    }
    return x;
  };
  return strip(JSON.parse(JSON.stringify(v))) || null;
}
{
  const H = 'hostUid001';
  const G = 'guestUid002';
  const X = 'strangerUid3';
  const MID = 'penalty_test_1';
  let NOW = 1_000_000;
  const rng = seeded(77);
  let m = null;
  const step = (uid, op, args) => {
    const out = Engine.reduceMatch(m, uid, op, Object.assign({ matchId: MID }, args || {}), NOW, rng);
    if (out) m = rtdbTrip(out.match);
    return out ? out.result : null;
  };

  assert(throwsCode(() => Engine.reduceMatch(null, H, 'join', { matchId: MID, opponentUid: H }, NOW, rng), 'bad_opponent'), 'cannot challenge yourself');
  step(H, 'join', { opponentUid: G, playerA: H, stake: 40, bestOf: 5, kit: 'emerald', name: 'Hana' });
  assert(m.pub.status === 'waiting' && m.pub.playerA === H && m.pub.stake === 40 && m.pub.kits[H] === 'emerald', 'host creates the match (waiting, stake, kit)');
  assert(throwsCode(() => Engine.reduceMatch(m, X, 'join', { matchId: MID }, NOW, rng), 'not_in_match'), 'a third player cannot join');
  step(G, 'join', { opponentUid: H, playerA: H, stake: 999, bestOf: 3, kit: 'emerald', name: 'Gio' });
  assert(m.pub.status === 'playing' && m.pub.stake === 40 && m.pub.bestOf === 5, 'guest joins → playing; the host’s stake / length stand');
  assert(m.pub.kits[G] !== 'emerald', 'kits never clash');
  assert(m.pub.turn.kicker === H && m.pub.turn.keeper === G && m.pub.turn.kickNo === 0, 'host (A) kicks first, guest keeps');

  const secretKick = { x: 0.777, y: 0.333, power: 0.911 };
  step(H, 'submit', { kickNo: 0, choice: secretKick });
  const pubJson = JSON.stringify(m.pub);
  assert(m.pub.ready.kick === true && !m.pub.ready.dive, 'pub shows only that the kicker has locked in');
  assert(!/0\.777|0\.911|0\.333/.test(pubJson) && !m.pub.pending && !/pending/.test(pubJson), 'no kick coordinates in pub before resolution');
  assert(!m.secrets[G] && m.secrets[H] && m.secrets[H].choice.x === 0.777, 'secrets: kicker sees only their own choice; keeper has nothing');
  assert(m.server.pending.kick.x === 0.777, 'the pending kick waits in server/ (no client read)');
  assert(throwsCode(() => step(H, 'submit', { kickNo: 0, choice: secretKick }), 'already_locked'), 'cannot change a locked kick');
  assert(throwsCode(() => step(G, 'submit', { kickNo: 3, choice: { x: 0, y: 0.4, t: 0.5 } }), 'stale_kick'), 'stale kick numbers rejected');
  assert(throwsCode(() => step(G, 'submit', { kickNo: 0, choice: { x: 'nope' } }), 'bad_choice'), 'bad choices rejected');
  const res = step(G, 'submit', { kickNo: 0, choice: { x: -0.62, y: 0.22, t: 0.2 } });
  assert(res.resolved && m.pub.kicks.length === 1, 'both locked → server resolves');
  const k0 = m.pub.kicks[0];
  assert(k0.kick.x === 0.777 && k0.dive.x === -0.62 && k0.kicker === H && ['goal', 'save', 'miss', 'post'].includes(k0.result), 'kick record reveals both choices only after resolution');
  assert(JSON.stringify(P.resolveKick(k0.kick, k0.dive, k0.seed).result) === JSON.stringify(k0.result), 'the recorded seed replays the same result');
  assert(!m.secrets && !m.server.pending && !m.pub.ready, 'pending choices and secrets are cleared');
  assert(m.pub.turn.kicker === G && m.pub.turn.kickNo === 1, 'roles swap: guest kicks next');
  assert(m.pub.deadline === NOW + Engine.ANIM_MS + Engine.KICK_MS, 'next kick clock starts after the reveal animation');

  // Timeout → random pick for whoever didn't choose.
  step(G, 'submit', { kickNo: 1, choice: { x: 0.5, y: 0.5, power: 0.5 } });
  assert(step(H, 'tick') === null, 'tick before the deadline does nothing');
  NOW = m.pub.deadline + 1;
  const to = step(H, 'tick');
  const k1 = m.pub.kicks[1];
  assert(to.timeout && to.resolved && k1.auto.dive === true && !k1.auto.kick && P.isDive(k1.dive), 'kick clock runs out → a random dive is filled in');
  NOW = m.pub.deadline + 1;
  step(G, 'tick');
  const k2 = m.pub.kicks[2];
  assert(k2.auto.kick && k2.auto.dive, 'nobody chose → both random');

  // Disconnect → forfeit (only the connected player can claim it).
  NOW += 1000;
  m.presence = { [H]: { at: NOW, online: true }, [G]: { at: NOW - Engine.RECONNECT_MS - 1000, online: false } };
  m.pub.deadline = NOW + 10000;
  const snapshot = JSON.parse(JSON.stringify(m));
  assert(step(G, 'tick') === null, 'the disconnected player cannot claim a forfeit');
  m = JSON.parse(JSON.stringify(snapshot));
  const dc = step(H, 'tick');
  assert(dc.forfeit && m.pub.status === 'over' && m.pub.winner === H && m.pub.reason === 'disconnect', 'opponent gone past the reconnect window → forfeit win');
  m = JSON.parse(JSON.stringify(snapshot));
  m.presence[G].at = NOW - 30000;
  assert(step(H, 'tick') === null, 'inside the reconnect window → keep waiting');

  // Leave → forfeit.
  m = JSON.parse(JSON.stringify(snapshot));
  step(G, 'leave');
  assert(m.pub.status === 'over' && m.pub.winner === H && m.pub.reason === 'left', 'leaving mid-shootout forfeits');
  assert(step(G, 'leave') === null, 'leaving twice is a no-op');

  // Void: cancelled before the guest joins, or no-show.
  let v = Engine.reduceMatch(null, H, 'join', { matchId: 'v1', opponentUid: G }, NOW, rng).match;
  v = Engine.reduceMatch(rtdbTrip(v), H, 'leave', { matchId: 'v1' }, NOW, rng).match;
  assert(v.pub.status === 'void' && v.pub.reason === 'cancelled' && !v.pub.winner, 'cancel while waiting → void, no winner');
  let ns = Engine.reduceMatch(null, H, 'join', { matchId: 'v2', opponentUid: G }, NOW, rng).match;
  assert(Engine.reduceMatch(rtdbTrip(ns), H, 'tick', { matchId: 'v2' }, NOW + 1000, rng) === null, 'still waiting inside the join window');
  ns = Engine.reduceMatch(rtdbTrip(ns), H, 'tick', { matchId: 'v2' }, NOW + Engine.JOIN_MS + 1, rng).match;
  assert(ns.pub.status === 'void' && ns.pub.reason === 'no_show', 'friend never joins → void (no chips)');

  // Full shootout through sudden death.
  let f = rtdbTrip(Engine.reduceMatch(null, H, 'join', { matchId: 'full', opponentUid: G, playerA: H, bestOf: 3 }, NOW, rng).match);
  f = rtdbTrip(Engine.reduceMatch(f, G, 'join', { matchId: 'full' }, NOW, rng).match);
  const goalKick = { x: 0.65, y: 0.3, power: 0.7 };
  const wrongDive = { x: -0.62, y: 0.22, t: 0 };
  const saveKick = { x: 0, y: 0.4, power: 0.5 };
  const saveDive = { x: 0, y: 0.4, t: 0.5 };
  let guard = 0;
  while (f.pub.status === 'playing' && guard++ < 40) {
    const turn = f.pub.turn;
    const n = turn.kickNo;
    // Everyone scores for 3 rounds + the first sudden-death pair; then A is saved, B scores.
    const aSaved = n === 8;
    const kick = aSaved ? saveKick : goalKick;
    const dive = aSaved ? saveDive : wrongDive;
    f = rtdbTrip(Engine.reduceMatch(f, turn.kicker, 'submit', { matchId: 'full', kickNo: n, choice: kick }, NOW, rng).match);
    f = rtdbTrip(Engine.reduceMatch(f, turn.keeper, 'submit', { matchId: 'full', kickNo: n, choice: dive }, NOW, rng).match);
  }
  const fst = Engine.statusOf(Engine.hydrate(f).pub);
  assert(f.pub.status === 'over' && f.pub.reason === 'shootout' && f.pub.winner === G && f.pub.kicks.length === 10 && fst.sudden === false && fst.round > 3, 'Live shootout runs through sudden death to a winner');
  assert(f.pub.kicks.every((k, i) => k.kicker === (i % 2 ? G : H)), 'Live kicks alternate every kick');
  assert(throwsCode(() => Engine.reduceMatch(f, H, 'submit', { matchId: 'full', kickNo: 10, choice: goalKick }, NOW, rng), 'not_playing'), 'no kicks after full time');

  // Settle lease is internal; rematch swaps who kicks first.
  const claim = Engine.reduceMatch(f, H, 'settle_claim', { matchId: 'full' }, NOW, rng);
  assert(claim && claim.result.settleClaim, 'first settle claim wins the lease');
  assert(Engine.reduceMatch(rtdbTrip(claim.match), G, 'settle_claim', { matchId: 'full' }, NOW + 1000, rng) === null, 'a second claim inside the lease is refused');
  let rm = Engine.reduceMatch(f, H, 'rematch', { matchId: 'full' }, NOW, rng);
  assert(rm.result.waiting, 'rematch waits for both');
  rm = Engine.reduceMatch(rtdbTrip(rm.match), G, 'rematch', { matchId: 'full' }, NOW, rng);
  assert(rm.result.nextMatchId === 'full-r1' && rm.result.createNext.playerA === G && rm.result.createNext.playerB === H, 'both agree → rematch full-r1, the other player kicks first');

  (async () => {
    let bad = null;
    try {
      await Engine.penaltyKick({ database: () => { throw new Error('touched'); } }, H, { op: 'settle_done', matchId: 'full', settlement: { [H]: { chipDelta: 9999 } } });
    } catch (e) {
      bad = e.code;
    }
    assert(bad === 'bad_op', 'settle_done / settle_claim cannot be called by a phone');

    // ---------- (e) settlement ----------
    const calls = [];
    const fakeEcon = {
      async resolveGame(db, admin, uid, body, opts) {
        calls.push({ uid, body, opts });
        return { chipDelta: 65, eloDelta: 14, achievements: [{ key: 'penalty_clean_sheet' }], opponent: { chipDelta: -40, eloDelta: -14, achievements: [] } };
      },
    };
    const cleanPub = {
      matchId: 'cs1',
      playerA: H,
      playerB: G,
      winner: H,
      reason: 'shootout',
      stake: 40,
      kicks: [
        { kicker: H, keeper: G, result: 'goal', panenka: true },
        { kicker: G, keeper: H, result: 'save' },
        { kicker: H, keeper: G, result: 'goal' },
        { kicker: G, keeper: H, result: 'miss' },
      ],
    };
    const flags = Engine.achievementFlags(cleanPub);
    assert(flags[H].includes('penalty_clean_sheet') && flags[H].includes('penalty_panenka') && !flags[G], 'server proves Clean sheet + Panenka from the kick log');
    assert(!(Engine.achievementFlags(Object.assign({}, cleanPub, { reason: 'left' }))[H] || []).includes('penalty_clean_sheet'), 'no clean sheet from a forfeit');
    const out = await Engine.settleMatch({ firestore: () => ({}) }, cleanPub, fakeEcon);
    const c = calls[0];
    assert(calls.length === 1 && c.uid === H && c.body.opponentUid === G && c.body.gameType === 'penalty' && c.body.stake === 40 && c.body.won === true, 'settlement reports the winner vs loser with the stake');
    assert(c.opts.trusted === true && !!c.opts.flags && c.opts.flags[H].includes('penalty_clean_sheet'), 'settlement is trusted and carries the proven achievements');
    assert(out[H].chipDelta === 65 && out[G].chipDelta === -40 && out[H].achievements[0] === 'penalty_clean_sheet', 'both players get their chip / rating lines');

    const Econ = require(path.join(root, 'server-lib/dangal-economy.js'));
    assert(Econ.SERVER_SETTLED.has('penalty') && Econ.RATED.has('penalty'), 'penalty is rated and server-settled');
    const writes = [];
    const fakeDb = () => {
      const node = (p) => ({
        collection: (n) => coll(p + '/' + n),
        get: async () => ({ exists: true, data: () => ({ balance: 1000, lifetimeEarned: 1000 }) }),
        set: async () => writes.push('set ' + p),
        update: async () => writes.push('update ' + p),
      });
      const coll = (p) => ({ doc: (id) => node(p + '/' + id), add: async () => writes.push('add ' + p) });
      return { collection: (n) => coll(n), runTransaction: async () => writes.push('tx') };
    };
    const admin = { firestore: { FieldValue: { increment: (n) => n, serverTimestamp: () => 0, arrayUnion: (x) => x } } };
    const claimed = await Econ.resolveGame(fakeDb(), admin, G, { gameType: 'penalty', result: 'win', won: true, opponentUid: H, stake: 40, matchId: 'cs1' });
    assert(claimed.serverSettled && claimed.chipDelta === 0 && writes.length === 0, 'a phone claiming a Live penalty win moves nothing');

    // ---------- (f) wiring ----------
    const mm = require(path.join(root, 'server-lib/dangal-matchmaking.js'));
    const mid = mm.mintMatchId('penalty', 123456);
    assert(/^penalty[\w-]*$/.test(mid) && mid !== mm.mintMatchId('penalty', 123457), 'matchmaking mints a shared match id');
    const mmSrc = read('server-lib/dangal-matchmaking.js');
    assert((mmSrc.match(/role: 'guest'/g) || []).length === 4 && /role: 'host'/.test(mmSrc) && (mmSrc.match(/matchId: mmId/g) || []).length >= 8, 'both phones get the match id + host / guest role');
    assert(/matchId:data\.matchId/.test(read('public/src/js/features/streak.js').replace(/\s/g, '')), 'findRealOpponent passes the match id through');

    const rules = JSON.parse(read('firebase/database.rules.json')).rules;
    const games = rules.games;
    const pen = games.penalty.$matchId;
    assert(games.penalty && Object.keys(games).indexOf('penalty') < Object.keys(games).indexOf('$gameType'), 'literal penalty rules beat the $gameType wildcard');
    assert(!pen['.read'] && !pen['.write'] && /players/.test(pen.pub['.read']) && !pen.pub['.write'], 'pub: players read, nobody writes (server only)');
    assert(pen.secrets.$uid['.read'] === 'auth != null && auth.uid == $uid' && !pen.secrets.$uid['.write'], 'secrets: owner read only');
    assert(!pen.server, 'server/ has no client rules (pending kick + dive unreadable)');
    assert(/auth\.uid == \$uid/.test(pen.presence.$uid['.write']) && /now \+ 5000/.test(pen.presence.$uid['.validate']), 'presence: self-write only, no future timestamps');

    const grad = read('public/src/js/dangal/dangal-graduation.js');
    assert(/penalty: \{ grade: 'live', sync: 'live1v1', stakes: true \}/.test(grad) && /\{ id: 'penalty', genre: 'rw_sports' \}/.test(grad), 'graduation live1v1 + stakes; roster (Sports)');
    const ds = read('public/src/js/dangal/design-system.js');
    assert(/penalty: \{ primary: '#00A86B'[^}]*mark: M\.penalty[^}]*orientation: 'portrait'/.test(ds) && /RATED_GAMES = \[[^\]]*'penalty'/.test(ds), 'identity (portrait, mark) + rated');
    const ui = read('public/src/js/games/game-ui.js');
    assert(/penalty: '#00A86B'/.test(ui) && /penalty: 'Penalty Shootout'/.test(ui) && /penalty: \[/.test(ui), 'accent, label, coach tips');
    const ach = read('public/src/js/dangal/dangal-achievements.js');
    assert(/penalty_clean_sheet/.test(ach) && /penalty_panenka/.test(ach), 'achievements listed on the client');
    const econSrc = read('server-lib/dangal-economy.js');
    assert(/penalty_clean_sheet/.test(econSrc) && /penalty_panenka/.test(econSrc) && /SERVER_SETTLED = new Set\(\['penalty'\]\)/.test(econSrc), 'economy: achievements + server-settled');
    assert(/penalty: 'rw_sports'/.test(read('server-lib/game-of-day.js')), 'game of the day knows penalty');
    assert(/'penalty'/.test(read('public/src/js/core/tab-gestures.js')), 'leaderboard / rating list includes penalty');
    const api = read('api/media-config.js');
    assert(/action === 'penalty_kick'/.test(api) && /require\('\.\.\/server-lib\/penalty-engine'\)/.test(api), 'penalty_kick folded into media-config (no new function)');
    const registry = read('public/src/js/games/game-registry.js');
    assert((registry.match(/game\.ownHome/g) || []).length >= 2, 'registry opens the game’s own home (vs AI / Play a friend)');
    const html = read('public/index.html');
    const iCore = html.indexOf('/src/js/games/penalty-core.js');
    const iGame = html.indexOf('/src/js/games/penalty.js');
    assert(iCore > 0 && iGame > iCore && html.indexOf('/src/js/games/game-registry.js') < iCore, 'scripts: core before client, after the registry');
    const pkg = JSON.parse(read('package.json'));
    assert(/test-dangal-h2-penalty\.js/.test(pkg.scripts.test), 'npm test runs the H2 suite');

    const client = read('public/src/js/games/penalty.js');
    const core = read('public/src/js/games/penalty-core.js');
    const engineSrc = read('server-lib/penalty-engine.js');
    assert(/registerGame\(\{\s*id: 'penalty'/.test(client) && /liveDuel: true/.test(client) && /ownHome: true/.test(client) && /genre: 'rw_sports'/.test(client), 'registered as a Live duel in Sports');
    assert(/Play vs AI/.test(client) && /Play a friend/.test(client) && /On this phone/.test(client) && /Challenge a friend/.test(client) && /Find an opponent/.test(client), 'default flow: vs AI or Play a friend');
    assert(/AI difficulty/.test(client) && /Match length/.test(client) && /Your kit/.test(client) && /Your gloves/.test(client), 'settings: difficulty, length, kits, gloves');
    assert(/Swipe to shoot/.test(client) && /Pick your dive/.test(client), '20-second how-to card');
    assert(/speed: 0\.35, replay: true/.test(client), 'slow-mo replay of the winning kick');
    const banned = /barcelona|real madrid|manchester|liverpool|juventus|bayern|chelsea|arsenal|brazil|argentina|messi|ronaldo|neymar|mbapp|fifa|uefa|premier league|nike|adidas|puma/i;
    assert(!banned.test(client + core + engineSrc), 'no real teams, players, crests or brands');
    assert(!/require\(['"](matter-js|cannon|planck|box2d|ammo)/.test(client + core) && !/Matter\.|CANNON\.|planck\./.test(client + core), 'no physics engine');
    assert(!/[\u0900-\u097F]/.test(client + core) && !/₹|rupee/i.test(client + core), 'global-first copy (plain English, no currency)');

    // Renderer + registration smoke in a sandbox (no DOM): every result type animates without throwing.
    const noop = () => {};
    const ctx2d = new Proxy(
      {},
      {
        get: (t, k) => (k in t ? t[k] : k === 'createLinearGradient' ? () => ({ addColorStop: noop }) : noop),
        set: (t, k, v) => ((t[k] = v), true),
      }
    );
    const mkCanvas = () => ({ width: 0, height: 0, getContext: () => ctx2d, getBoundingClientRect: () => ({ width: 360, height: 420, left: 0, top: 0 }), addEventListener: noop });
    let registered = null;
    let rafQ = [];
    const box = {
      console,
      Math,
      JSON,
      Promise,
      setTimeout,
      clearTimeout,
      performance: { now: () => clock },
      requestAnimationFrame: (fn) => (rafQ.push(fn), rafQ.length),
      cancelAnimationFrame: noop,
      document: { createElement: () => mkCanvas(), querySelector: () => null, addEventListener: noop },
      registerGame: (d) => (registered = d),
      shouldReduceGameMotion: () => false,
    };
    let clock = 0;
    box.window = box;
    box.self = box;
    vm.createContext(box);
    vm.runInContext(core, box);
    vm.runInContext(client, box);
    assert(registered && registered.id === 'penalty' && registered.chat1v1 && registered.ratingKey === 'penalty' && typeof box.openPenaltyShootout === 'function', 'client registers + exposes a launcher');
    const pitch = box.PenaltyGame.createPitch(mkCanvas(), () => true);
    pitch.setOverlay({ aim: { x: 0.5, y: 0.5 }, power: 0.9 });
    pitch.setOverlay({ dive: { x: -0.6, y: 0.3, t: 0.2 }, reach: 1.6 });
    const cases = [
      [{ x: 0.8, y: 0.3, power: 0.7 }, { x: -0.62, y: 0.22, t: 0 }],
      [{ x: 0, y: 0.4, power: 0.5 }, { x: 0, y: 0.4, t: 0.5 }],
      [{ x: 0.3, y: 0.3, power: 0.85 }, { x: 0.3, y: 0.3, t: 0.5 }],
      [{ x: 1, y: 0.5, power: 0.1 }, { x: -0.62, y: 0.22, t: 0 }],
      [{ x: 0.2, y: 1, power: 0.1 }, { x: -0.62, y: 0.22, t: 0 }],
      [{ x: 1.4, y: 0.3, power: 0.6 }, { x: 0, y: 0.4, t: 0.5 }],
      [{ x: 0.2, y: 1.4, power: 0.6 }, { x: 0, y: 0.4, t: 0.5 }],
      [{ x: 0, y: 0.55, power: 0.22 }, { x: 0.62, y: 0.22, t: 0.1 }],
    ];
    const seen = new Set();
    for (const [kick, dive] of cases) {
      const rec = Object.assign({ kick, dive }, P.resolveKick(kick, dive, 42));
      seen.add(rec.result + ':' + rec.detail);
      let impacts = 0;
      clock = 0;
      rafQ = [];
      const done = pitch.play(rec, { onImpact: () => impacts++ });
      for (let tms = 0; tms <= 3200 && rafQ.length; tms += 16) {
        clock = tms;
        const q = rafQ;
        rafQ = [];
        q.forEach((fn) => fn(tms));
      }
      await done;
      assert(impacts === 1, `animation ran to the end (${rec.result}${rec.detail ? ' / ' + rec.detail : ''})`);
    }
    assert(['goal:', 'save:catch', 'save:parry', 'miss:wide', 'miss:over', 'post:post', 'post:bar'].every((k) => seen.has(k) || [...seen].some((s) => s.startsWith(k))), 'renderer covered goal, catch, parry, wide, over, post and bar');

    const conv = read('CONVENTIONS.md');
    assert(/Dangal H2 \(Penalty Shootout\)/.test(conv), 'CONVENTIONS documents H2');

    const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
    assert(apiCount === 12, `api/*.js = 12 (got ${apiCount})`);
    console.log('\nDangal H2 penalty checks passed.');
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
