#!/usr/bin/env node
/**
 * Dangal P9 — Bluff (Sequence + Follow the rank) and Tambola (90-ball, 75-ball Bingo, Caller mode):
 * rules, challenge race, last-card rule, two decks, hidden cards, bots; ticket generation, draw
 * fairness, prize validators, claim timing / ties / bogeys, 100-player load, public chip tables and
 * wiring.
 *   node scripts/test-dangal-p9-group.js
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
const sum = (list) => list.reduce((a, b) => a + b, 0);

const B = require(path.join(root, 'public/src/js/games/bluff-core.js'));
const T = require(path.join(root, 'public/src/js/games/tambola-core.js'));
const PD = require(path.join(root, 'server-lib/party-deal.js'));
const Policy = require(path.join(root, 'public/src/js/dangal/dangal-live-policy.js'));

function seeded(seed) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 0x100000000;
  };
}
const people = (n, o) => Array.from({ length: n }, (_, i) => Object.assign({ id: 'p' + i, name: 'P' + i }, o ? o(i) : {}));
const codeOf = (fn) => {
  try {
    fn();
    return null;
  } catch (e) {
    return e.code || e.message;
  }
};
function rtdb(v) {
  if (Array.isArray(v)) {
    const a = v.map(rtdb);
    if (!a.some((x) => x !== undefined)) return undefined;
    if (a.every((x) => x !== undefined)) return a;
    const o = {};
    a.forEach((x, i) => {
      if (x !== undefined) o[i] = x;
    });
    return o;
  }
  if (v && typeof v === 'object') {
    const o = {};
    let any = false;
    Object.keys(v).forEach((k) => {
      const x = rtdb(v[k]);
      if (x !== undefined) {
        o[k] = x;
        any = true;
      }
    });
    return any ? o : undefined;
  }
  if (v === null || v === undefined) return undefined;
  return v;
}
const rt = (room) => PD.hydrateRoom(rtdb(clone(room)));
const uidN = (i) => ('u' + String(i).padStart(3, '0')).padEnd(28, 'x');

// ======================================================================= Bluff: rules

const cardsHeld = (st) => sum(st.hands.map((h) => h.length)) + sum(st.pile.map((p) => p.cards.length)) + st.discarded;

{
  const st = B.newGame(people(4), { style: 'sequence' }, seeded(1), { dealer: 0 });
  assert(st.decks === 1 && st.maxPlay === 4 && cardsHeld(st) === 52 && st.turn === 1, 'Sequence: 4 players, one deck dealt out, first turn left of the dealer');
  assert(st.rank === 0, 'Sequence starts at Aces');
  const seat = st.turn;
  const card = st.hands[seat][0];
  assert(B.apply(st, seat, { type: 'play', cards: [card], rank: 5 }).error === 'wrong_rank', 'Sequence: the claim is locked to the current rank');
  assert(B.apply(st, seat, { type: 'pass' }).error === 'no_pass', 'Sequence: no passing');
  assert(B.apply(st, seat, { type: 'play', cards: st.hands[seat].slice(0, 5) }).error === 'too_many', 'max 4 cards per play with one deck');
  assert(B.apply(st, (seat + 1) % 4, { type: 'play', cards: [st.hands[(seat + 1) % 4][0]] }).error === 'not_your_turn', 'out of turn rejected');
  assert(B.apply(st, seat, { type: 'play', cards: ['ZZ9'] }).error === 'no_card', 'a card you don’t hold is rejected');
  B.apply(st, seat, { type: 'play', cards: [card] });
  assert(st.phase === 'window' && st.last.rank === 0, 'a play opens the Bluff window');
  assert(B.apply(st, seat, { type: 'call', no: st.last.no }).error === 'own_play', 'you can’t call your own play');
  [0, 1, 2, 3].filter((i) => i !== seat).forEach((i) => B.apply(st, i, { type: 'letgo', no: st.last.no }));
  assert(st.phase === 'play' && st.rank === 1 && st.turn === (seat + 1) % 4, 'window passes with no call → next rank (Twos), next player');
  assert(cardsHeld(st) === 52, 'cards conserved');
}

// Challenge outcomes (both ways) + who leads next, per style.
{
  const st = B.newGame(people(3), { style: 'sequence' }, seeded(2), { dealer: 2 });
  const p = st.turn;
  st.hands[p] = B.sortHand(st.hands[p].filter((c) => c[0] !== 'A').concat(['AS1']));
  const lie = st.hands[p].find((c) => c[0] !== 'A');
  B.apply(st, p, { type: 'play', cards: [lie] });
  const caller = (p + 1) % 3;
  const before = st.hands[p].length;
  const out = B.apply(st, caller, { type: 'call', no: st.last.no });
  assert(out.truth === false && out.taker === p && st.hands[p].length === before + 1 && st.phase === 'reveal', 'caught bluffing → the player picks up the pile');
  assert(st.reveal.cards[0] === lie && st.reveal.caller === caller, 'only the last play is turned over');
  B.apply(st, -1, { type: 'resume' });
  assert(st.rank === 1 && st.turn === (p + 1) % 3, 'Sequence after a challenge: carry on with the next rank from the player after the one who played');

  const f = B.newGame(people(3), { style: 'follow' }, seeded(3), { dealer: 2 });
  const lead = f.turn;
  assert(f.rank === -1 && B.apply(f, lead, { type: 'pass' }).error === 'must_lead', 'Follow: the leader must play');
  const honest = f.hands[lead][0];
  const r = B.rankOf ? B.rankOf(honest) : B.RANKS.indexOf(honest[0]);
  B.apply(f, lead, { type: 'play', cards: [honest], rank: r });
  const c2 = (lead + 1) % 3;
  const hb = f.hands[c2].length;
  const o2 = B.apply(f, c2, { type: 'call', no: f.last.no });
  assert(o2.truth === true && o2.taker === c2 && f.hands[c2].length === hb + 1, 'honest play called → the caller picks up the pile');
  B.apply(f, -1, { type: 'resume' });
  assert(f.rank === -1 && f.turn === lead, 'Follow after a challenge: the challenge winner leads a new rank');
}

// Follow the rank: pass-out → discard → last placer leads.
{
  const st = B.newGame(people(4), { style: 'follow' }, seeded(4), { dealer: 3 });
  const lead = st.turn;
  const c = st.hands[lead][0];
  B.apply(st, lead, { type: 'play', cards: [c], rank: B.RANKS.indexOf(c[0]) });
  [1, 2, 3].forEach((k) => B.apply(st, (lead + k) % 4, { type: 'letgo', no: st.last.no }));
  assert(st.phase === 'play' && st.turn === (lead + 1) % 4, 'Follow: next player claims the same rank or passes');
  const r0 = st.rank;
  const p2 = st.turn;
  B.apply(st, p2, { type: 'play', cards: [st.hands[p2][0]] });
  assert(st.last.rank === r0, 'Follow: a follower’s claim is the leader’s rank');
  [1, 2, 3].forEach((k) => B.apply(st, (p2 + k) % 4, { type: 'letgo', no: st.last.no }));
  let guard = 0;
  while (st.pile.length && guard++ < 5) B.apply(st, st.turn, { type: 'pass' });
  assert(st.pile.length === 0 && st.discarded === 2 && st.rank === -1 && st.turn === p2, 'everyone else passes in a row → pile discarded, the last placer leads a new rank');
  assert(cardsHeld(st) === 52, 'discarded cards still accounted for');
}

// The last-card rule + the race.
{
  const st = B.newGame(people(3), { style: 'sequence' }, seeded(5), { dealer: 2 });
  const p = st.turn;
  st.hands[p] = ['AS1'];
  B.apply(st, p, { type: 'play', cards: ['AS1'] });
  assert(st.pending === p && !st.over, 'empty hand after a play: not out until the window passes');
  const first = (p + 1) % 3;
  const second = (p + 2) % 3;
  const no = st.last.no;
  const o1 = B.apply(st, first, { type: 'call', no });
  const o2 = B.apply(st, second, { type: 'call', no });
  assert(o1.truth === true && o2.error === 'too_late', 'the race: the first valid call wins; a later call for the same play is too late');
  assert(st.phase === 'reveal' && st.finished.indexOf(p) >= 0, 'honest last card: out as soon as the reveal shows it');
  B.apply(st, -1, { type: 'resume' });
  assert(st.over && st.winner === p, 'survived a challenge on the last card → wins');

  const s2 = B.newGame(people(3), { style: 'sequence' }, seeded(6), { dealer: 2 });
  const q = s2.turn;
  s2.hands[q] = ['KS1'];
  B.apply(s2, q, { type: 'play', cards: ['KS1'] });
  B.apply(s2, (q + 1) % 3, { type: 'call', no: s2.last.no });
  assert(!s2.over && s2.hands[q].length === 1 && s2.pending === -1, 'caught on the last card → picks up the pile, still in');

  const s3 = B.newGame(people(3), { style: 'sequence' }, seeded(7), { dealer: 2 });
  const w = s3.turn;
  s3.hands[w] = ['AS1'];
  B.apply(s3, w, { type: 'play', cards: ['AS1'] });
  B.apply(s3, -1, { type: 'close' });
  assert(s3.over && s3.winner === w, 'window passes with no call → the last card wins');
}

// Two decks at 6+, jokers wild.
{
  const st = B.newGame(people(6), {}, seeded(8));
  assert(st.decks === 2 && st.maxPlay === 6 && cardsHeld(st) === 104, '6 players: two decks, up to 6 cards per play');
  const five = B.newGame(people(5), {}, seeded(8));
  assert(five.decks === 1 && five.maxPlay === 4, '5 players: one deck');
  const j = B.newGame(people(3), { jokers: true }, seeded(9));
  assert(cardsHeld(j) === 54, 'jokers on: 2 per deck added');
  const s = j.turn;
  j.hands[s] = ['X1'].concat(j.hands[s].filter((c) => c !== 'X1'));
  B.apply(j, s, { type: 'play', cards: ['X1'] });
  const out = B.apply(j, (s + 1) % 3, { type: 'call', no: j.last.no });
  assert(out.truth === true, 'jokers are wild when enabled (a joker is never a bluff)');
  const off = B.newGame(people(3), {}, seeded(9));
  assert(!off.hands.some((h) => h.some((c) => c[0] === 'X')), 'jokers off by default');
}

// Bot legality + full games in both styles.
{
  let bad = 0;
  let games = 0;
  let stalls = 0;
  ['sequence', 'follow'].forEach((style) => {
    [3, 6, 8].forEach((n) => {
      for (let g = 0; g < 6; g++) {
        const rng = seeded(100 + g * 7 + n);
        const lv = ['easy', 'normal', 'smart'];
        const st = B.newGame(people(n, (i) => ({ bot: true, level: lv[i % 3] })), { style, placements: g % 2 === 1 }, rng);
        const total = cardsHeld(st);
        let steps = 0;
        while (!st.over && steps++ < 20000) {
          if (st.phase === 'play') {
            const a = B.botAction(st, st.turn, rng);
            const out = B.apply(st, st.turn, a);
            if (out.error) {
              bad++;
              B.apply(st, st.turn, B.autoAction(st, st.turn));
            }
          } else if (st.phase === 'window') {
            const plan = B.windowPlan(st, rng);
            if (plan.caller >= 0) B.apply(st, plan.caller, { type: 'call', no: st.last.no });
            else B.apply(st, -1, { type: 'close' });
          } else if (st.phase === 'reveal') B.apply(st, -1, { type: 'resume' });
          if (cardsHeld(st) !== total) bad++;
        }
        if (!st.over) stalls++;
        games++;
      }
    });
  });
  assert(bad === 0 && stalls === 0, 'bots only make legal moves; ' + games + ' bot games (both styles, 3/6/8 seats) finish with every card accounted for');
}

// ======================================================================= Bluff: Live room

const H = ['a', 'b', 'c', 'd', 'e', 'f'].map((ch) => ch.repeat(28));

function bluffRoom(style, now) {
  let room = PD.newRoom({ game: 'bluff', uid: H[0], name: 'Asha', settings: { style, windowSec: 5 }, now });
  H.slice(1).forEach((u, i) => (room = PD.reduceRoom(rt(room), u, 'join', { name: 'P' + (i + 1) }, now).room));
  return PD.reduceRoom(rt(room), H[0], 'start', {}, now).room;
}

function hiddenOk(room) {
  const st = room.server.pub;
  const pubJson = JSON.stringify(room.pub);
  const facedown = [];
  st.pile.forEach((p) => p.cards.forEach((c) => facedown.push(c)));
  const inPub = (c) => pubJson.indexOf('"' + c + '"') >= 0;
  const revealed = st.reveal ? st.reveal.cards : [];
  if (facedown.some((c) => inPub(c) && revealed.indexOf(c) < 0)) return false;
  if (st.hands.some((h) => h.some((c) => inPub(c) && revealed.indexOf(c) < 0))) return false;
  return st.seats.every((s, i) => {
    const sec = room.secrets[s.id];
    if (!sec) return true;
    const js = JSON.stringify(sec);
    return st.hands.every((h, j) => j === i || h.every((c) => js.indexOf('"' + c + '"') < 0)) && facedown.every((c) => st.hands[i].indexOf(c) >= 0 || js.indexOf('"' + c + '"') < 0);
  });
}

function driveBluff(room, now, opts) {
  let t = now;
  const rng = seeded(opts.seed || 77);
  const seen = { race: false, lastCard: false, leave: false, hidden: true, calls: 0 };
  for (let i = 0; i < 6000; i++) {
    const st = room.server.pub;
    if (st.over) break;
    t += 20;
    if (!hiddenOk(room)) seen.hidden = false;
    if (opts.leaveAt && i === opts.leaveAt) {
      room = PD.reduceRoom(rt(room), H[5], 'leave', {}, t).room;
      seen.leave = room.server.pub.seats[5].bot && room.server.pub.seats[5].forfeit === 'left';
      continue;
    }
    if (st.phase === 'window') {
      const humans = st.seats.map((s, k) => k).filter((k) => !st.seats[k].bot && k !== st.last.seat && st.hands[k].length && st.finished.indexOf(k) < 0);
      const want = humans.filter((k) => B.botWantsCall(st, k, rng) || (st.pending >= 0 && rng() < 0.5));
      if (want.length) {
        if (st.pending >= 0) seen.lastCard = true;
        const no = st.last.no;
        const r1 = PD.reduceRoom(rt(room), st.seats[want[0]].id, 'call', { no }, t);
        room = r1.room;
        seen.calls++;
        if (want.length > 1) {
          const second = codeOf(() => PD.reduceRoom(rt(room), st.seats[want[1]].id, 'call', { no }, t + 5));
          if (second === 'too_late') seen.race = true;
        }
        continue;
      }
      t = Math.max(t, (room.pub.deadline || t) + 1);
      room = PD.reduceRoom(rt(room), H[0], 'tick', {}, t).room;
      continue;
    }
    if (st.phase === 'reveal' || st.seats[st.turn].bot) {
      t = Math.max(t, (room.pub.deadline || t) + 1);
      room = PD.reduceRoom(rt(room), H[0], 'tick', {}, t).room;
      continue;
    }
    const seat = st.turn;
    const a = B.botAction(st, seat, rng);
    const args = Object.assign({}, a);
    delete args.type;
    room = PD.reduceRoom(rt(room), st.seats[seat].id, a.type, args, t).room;
  }
  return { room, seen };
}

{
  const now = 1.8e12;
  ['sequence', 'follow'].forEach((style, k) => {
    const room = bluffRoom(style, now);
    const st = room.server.pub;
    assert(st.seats.length === 6 && st.decks === 2 && st.maxPlay === 6 && st.style === style, style + ': 6-player Live table deals two decks');
    assert(room.pub.deadline === now + Policy.policyFor('bluff').turnMs, style + ': turn clock from the Live policy (25 s)');
    assert(hiddenOk(room) && !room.pub.state.hands && room.pub.state.seats.every((s) => typeof s.n === 'number'), style + ': public state has card counts only; each secret holds only its own hand');
    const out = driveBluff(room, now + 10, { seed: 90 + k, leaveAt: 40 });
    assert(out.room.server.pub.over, style + ': Live game plays to the end on the server');
    assert(out.seen.hidden, style + ': face-down cards never appear in any payload except the turned-over play');
    assert(out.seen.leave, style + ': a leaver’s seat is taken by a bot (forfeit)');
    assert(out.seen.calls > 0, style + ': challenges resolved on the server');
    const req = out.room.server.settleReq;
    assert(req && req.ranking.length === 6 && req.forfeits.indexOf(H[5]) >= 0, style + ': settles by finishing place; the leaver forfeits');
  });

  // Race + last-card challenge through the room ops.
  const room = bluffRoom('sequence', now);
  const st = room.server.pub;
  const p = st.turn;
  st.hands[p] = ['AS1'];
  st.hands[(p + 1) % 6] = st.hands[(p + 1) % 6].filter((c) => c !== 'AS1');
  let r = rt(room);
  r = PD.reduceRoom(r, st.seats[p].id, 'play', { cards: ['AS1'] }, now + 5).room;
  assert(r.pub.state.pending === p || r.server.pub.pending === p, 'Live: last card played — the window decides');
  const c1 = st.seats[(p + 1) % 6].id;
  const c2 = st.seats[(p + 2) % 6].id;
  const no = r.server.pub.last.no;
  const won = PD.reduceRoom(rt(r), c1, 'call', { no }, now + 900);
  const late = codeOf(() => PD.reduceRoom(rt(won.room), c2, 'call', { no }, now + 950));
  assert(won.result.truth === true && late === 'too_late', 'Live race: first call commits; the second gets too_late');
  const done = PD.reduceRoom(rt(won.room), H[0], 'tick', {}, won.room.pub.deadline + 1).room;
  assert(done.server.pub.over && done.server.pub.winner === p, 'Live: surviving a last-card challenge wins');
  const cold = rt(won.room);
  assert(cold.server.pub.seats.length === 6 && Array.isArray(cold.server.pub.known[0]), 'reconnect: state rehydrates after RTDB drops empties');
}

// AFK: 3 misses → bot.
{
  const now = 1.81e12;
  let room = bluffRoom('follow', now);
  const who = room.server.pub.turn;
  let t = now;
  const whoId = room.server.pub.seats[who].id;
  for (let k = 0; k < 400 && !room.server.pub.seats[who].bot && !room.server.pub.over; k++) {
    t = Math.max(t, (room.pub.deadline || t) + 1);
    // The idle player's phone is still connected (it's the one nudging the clock).
    room = PD.reduceRoom(rt(room), whoId, 'tick', {}, t).room;
  }
  assert(room.server.pub.seats[who].bot && room.server.pub.seats[who].forfeit === 'afk', 'AFK: missed turns auto-play; after 3 a bot takes the seat');
}

// ======================================================================= Tambola: tickets

{
  const rng = seeded(2026);
  let bad = 0;
  let stripBad = 0;
  for (let i = 0; i < 10000 / 6; i++) {
    const strip = T.strip90(rng);
    strip.forEach((g) => {
      if (!T.validTicket90(g)) bad++;
    });
    const all = [].concat(...strip.map(T.nums90)).sort((a, b) => a - b);
    if (all.length !== 90 || all.some((n, k) => n !== k + 1)) stripBad++;
  }
  for (let i = 0; i < 4; i++) if (!T.validTicket90(T.ticket90(rng))) bad++;
  assert(bad === 0, '10,000 generated tickets: 3×9, 15 numbers, 5 per row, 1–3 per column in band, sorted top to bottom');
  assert(stripBad === 0, 'every sheet of 6 covers 1–90 exactly once');
  const g = T.ticket90(rng);
  const broken = g.slice();
  const i = broken.findIndex(Boolean);
  broken[i] = 0;
  assert(!T.validTicket90(broken) && !T.validTicket90(g.slice(0, 26)), 'the validator rejects a broken ticket');
  const unsorted = g.slice();
  const col = [0, 1, 2, 3, 4, 5, 6, 7, 8].find((c) => [0, 1, 2].filter((r) => g[r * 9 + c]).length >= 2);
  const rows = [0, 1, 2].filter((r) => g[r * 9 + col]);
  [unsorted[rows[0] * 9 + col], unsorted[rows[1] * 9 + col]] = [g[rows[1] * 9 + col], g[rows[0] * 9 + col]];
  assert(!T.validTicket90(unsorted), 'a column out of order is rejected');
  assert(T.unpack(T.pack(g)).join() === g.join() && T.pack(g).length === 54, 'tickets pack to 54 characters and back');

  let bad75 = 0;
  for (let k = 0; k < 2000; k++) if (!T.validCard75(T.card75(rng))) bad75++;
  assert(bad75 === 0, '75-ball cards: 5×5, B 1–15 · I 16–30 · N 31–45 · G 46–60 · O 61–75, free centre');
}

// Draw fairness: no repeats, uniform.
{
  const counts = Array(91).fill(0);
  let repeats = 0;
  const firsts = Array(91).fill(0);
  for (let g = 0; g < 3000; g++) {
    const st = T.newGame([{ id: 'a', name: 'A' }], { variant: '90' }, seeded(9000 + g), 0);
    const seen = new Set();
    let t = 0;
    while (st.bag.length) {
      t += 10000;
      T.draw(st, t, Math.random);
    }
    st.called.forEach((n) => {
      if (seen.has(n)) repeats++;
      seen.add(n);
      counts[n]++;
    });
    firsts[st.called[0]]++;
  }
  const exp = 3000 / 90;
  const chi = sum(firsts.slice(1).map((c) => ((c - exp) * (c - exp)) / exp));
  assert(repeats === 0 && counts.slice(1).every((c) => c === 3000), 'every number drawn exactly once per game, never repeated');
  assert(chi < 140, 'first ball is uniform over 1–90 (χ² ' + chi.toFixed(1) + ' < 140, df 89)');
  const st = T.newGame([{ id: 'a', name: 'A' }], { variant: '75' }, seeded(1), 0);
  assert(st.bag.length === 75 && T.callText(12, '75') === 'B 12' && T.callText(64, '75') === 'O 64', '75-ball: 75 numbers, called with the column letter');
  assert(T.callText(22, '90', true) === 'Two little ducks, 22' && T.callText(22, '90', false) === '22' && /3 and 7, 37/.test(T.callText(37, '90', true)), 'traditional calls are a toggle; plain numbers by default');
}

// Prize validators.
{
  const g = [
    5, 0, 21, 0, 43, 0, 61, 0, 81,
    0, 12, 0, 34, 0, 55, 0, 77, 88,
    7, 0, 28, 39, 0, 58, 0, 79, 0,
  ];
  assert(T.validTicket90(g), 'fixture ticket is valid');
  const done = (key, called) => T.prizeDone('90', key, g, called);
  assert(!done('early5', [5, 21, 43, 61]) && done('early5', [5, 21, 43, 61, 88]), 'Early Five: any five numbers on the ticket');
  assert(done('top', [5, 21, 43, 61, 81]) && !done('top', [5, 21, 43, 61]), 'Top Line');
  assert(done('middle', [12, 34, 55, 77, 88]) && done('bottom', [7, 28, 39, 58, 79]), 'Middle / Bottom Line');
  assert(done('corners', [5, 81, 7, 79]) && !done('corners', [5, 81, 7, 58]), 'Four Corners: first and last of the top and bottom rows');
  assert(done('star', [5, 81, 7, 79, 55]) && !done('star', [5, 81, 7, 79]), 'Star: corners + centre of the middle row');
  const all = T.nums90(g);
  assert(done('full', all) && !done('full', all.slice(1)), 'Full House: all 15');
  assert(done('breakfast', [5, 21, 12, 7, 28]) && done('lunch', [43, 34, 55, 39, 58]) && done('dinner', [61, 81, 77, 88, 79]), 'Breakfast / Lunch / Dinner: column groups');
  assert(T.completedAt('90', 'top', g, [1, 5, 21, 2, 43, 61, 81, 3]) === 7, 'completion is timed by the call that finished it');

  const c = T.card75(seeded(4));
  const row2 = [10, 11, 12, 13, 14].map((i) => c[i]).filter(Boolean);
  assert(T.prizeDone('75', 'line', c, row2), '75-ball Any Line (the free centre counts)');
  const diag = [0, 6, 18, 24].map((i) => c[i]);
  assert(T.prizeDone('75', 'line', c, diag) && !T.prizeDone('75', 'x', c, diag), 'diagonal = a line; X needs both diagonals');
  assert(T.prizeDone('75', 'x', c, diag.concat([4, 8, 16, 20].map((i) => c[i]))), 'X');
  assert(T.prizeDone('75', 'corners', c, [0, 4, 20, 24].map((i) => c[i])), '75-ball corners');
  assert(T.prizeDone('75', 'blackout', c, c.filter(Boolean)) && !T.prizeDone('75', 'blackout', c, c.filter(Boolean).slice(1)), 'Blackout');
  const mask = (1 << 0) | (1 << 12) | (1 << 24);
  assert(T.prizeDone('75', 'custom', c, [c[0], c[24]], mask) && !T.prizeDone('75', 'custom', c, [c[0]], mask), 'custom pattern (host-drawn mask)');
}

// Claims: timing, ties, bogeys, rate limit, 2nd Full House order.
{
  const mk = (bogey) => {
    const st = T.newGame(people(3, () => ({ tickets: 1 })), { variant: '90', prizes: ['early5', 'top', 'full', 'full2'], bogey }, seeded(31), 0);
    st.tickets[1][0] = st.tickets[0][0];
    return st;
  };
  const st = mk('block');
  const g0 = T.unpack(st.tickets[0][0]);
  const nums = T.nums90(g0);
  st.bag = nums.concat(st.bag.filter((n) => nums.indexOf(n) < 0));
  let t = 0;
  const drawTo = (n) => {
    while (st.called.length < n) {
      t += 5000;
      T.draw(st, t);
    }
  };
  drawTo(3);
  const bog = T.claim(st, 2, { key: 'early5', t: 0 }, t + 10);
  assert(bog.bogey && bog.blocked && T.claim(st, 2, { key: 'early5', t: 0 }, t + 5000).error === 'blocked', 'bogey (invalid claim) → that ticket is blocked for that prize');
  drawTo(5);
  assert(T.claim(st, 0, { key: 'early5', t: 0 }, t + 100).won, 'first valid claim wins');
  assert(T.claim(st, 0, { key: 'top', t: 0 }, t + 400).error === 'slow_down', 'claims are rate-limited per player');
  const tie = T.claim(st, 1, { key: 'early5', t: 0 }, t + 700);
  assert(tie.won && tie.tie && st.prizes[0].winners.length === 2, 'a valid claim within the tie window (same call) shares the prize');
  assert(T.claim(st, 2, { key: 'early5', t: 0 }, t + 900).error === 'blocked', 'the blocked ticket stays blocked');
  T.advance(st, t + 1200);
  assert(st.prizes[0].status === 'closed' && T.claim(st, 0, { key: 'early5', t: 0 }, t + 4000).error, 'after the tie window the prize is closed');
  assert(T.claim(st, 0, { key: 'full2', t: 0 }, t + 5000).error === 'not_yet', '2nd Full House opens only after the Full House');
  drawTo(15);
  const late = st.called.length;
  assert(T.claim(st, 0, { key: 'full', t: 0 }, t + 100).won && T.claim(st, 1, { key: 'full', t: 0 }, t + 900).tie, 'Full House tie on the same call');
  t += 950;
  T.draw(st, t + 50);
  const res0 = st.prizes.find((p) => p.key === 'full');
  assert(res0.ball === late, 'the prize records the call it was won on');

  const w = mk('warn');
  const r1 = T.claim(w, 2, { key: 'top', t: 0 }, 10);
  assert(r1.bogey && r1.warned && !r1.blocked, 'bogey setting "warn first": the first bogey is only a warning');
  const r2 = T.claim(w, 2, { key: 'top', t: 0 }, 5000);
  assert(r2.bogey && r2.blocked, '…the next bogey blocks');

  // Late claim after a new ball can't sneak into a tie.
  const s3 = T.newGame(people(2, () => ({ tickets: 1 })), { variant: '90', prizes: ['early5', 'full'] }, seeded(33), 0);
  const a0 = T.nums90(T.unpack(s3.tickets[0][0]));
  const b0 = T.nums90(T.unpack(s3.tickets[1][0]));
  s3.bag = a0.slice(0, 5).concat(b0.filter((n) => a0.indexOf(n) < 0).slice(0, 5), s3.bag);
  s3.bag = s3.bag.filter((n, k) => s3.bag.indexOf(n) === k);
  for (let k = 0; k < 5; k++) T.draw(s3, (k + 1) * 100);
  T.claim(s3, 0, { key: 'early5', t: 0 }, 600);
  const b5 = T.completedAt('90', 'early5', T.unpack(s3.tickets[1][0]), s3.called);
  for (let k = 0; k < 5; k++) T.draw(s3, 700 + k * 10);
  const sneaky = T.claim(s3, 1, { key: 'early5', t: 0 }, 790);
  assert(b5 === 0 && sneaky.error === 'taken', 'a ticket completed by a later call can’t join a tie');
}

// Results: shares, ties split, bots never take chips.
{
  const st = T.newGame([{ id: 'h1', name: 'A', tickets: 2 }, { id: 'h2', name: 'B', tickets: 1 }, { id: 'b1', name: 'Bot', bot: true, tickets: 1 }], { variant: '90', mode: 'table', price: 10, prizes: ['top', 'full'], shares: { top: 25, full: 75 } }, seeded(41), 0);
  assert(T.potOf(st) === 30, 'pot = tickets bought by humans (bots pay nothing)');
  st.prizes[0].winners = [{ seat: 0, t: 0 }, { seat: 1, t: 0 }];
  st.prizes[0].status = 'closed';
  st.prizes[1].winners = [{ seat: 2, t: 0 }];
  st.prizes[1].status = 'closed';
  T.end(st, 'prizes');
  const r = st.results;
  assert(sum(r.net) === 0, 'chip results are zero-sum');
  assert(r.win[2] === 0 && r.win[0] + r.win[1] === 30, 'a bot’s prize goes back to the ticket buyers pro rata');
  assert(Math.abs(r.win[0] - (3 + 15) - 1) <= 1 && r.win[1] >= 3, 'tie split of the 25% prize, bot refund by tickets bought');
  const fun = T.newGame(people(2), { variant: '90', prizes: ['top', 'full'] }, seeded(42), 0);
  fun.prizes[1].winners = [{ seat: 1, t: 0 }];
  T.end(fun, 'prizes');
  assert(fun.results.points && fun.results.win[1] === 40, 'just-for-fun rooms score points');
}

// Bots claim only valid prizes, with a human-like delay.
{
  const st = T.newGame(people(1).concat(Array.from({ length: 6 }, (_, i) => ({ id: 'bot' + i, name: T.botName(i), bot: true, tickets: 2 }))), { variant: '90' }, seeded(51), 0);
  let t = 0;
  let bad = 0;
  let delays = [];
  const valid = (p) => p.winners.every((w) => T.completedAt('90', p.key, T.unpack(st.tickets[w.seat][w.t]), st.called) > 0);
  while (!st.over && t < 2e6) {
    const plans = st.botPlan.map((b) => b.at);
    t = Math.min(T.nextEventAt(st), t + 8000);
    const before = st.botPlan.slice();
    T.advance(st, t, seeded(t));
    st.botPlan.forEach((b) => {
      if (!before.some((x) => x.seat === b.seat && x.key === b.key)) delays.push(b.at - t);
    });
    if (!st.prizes.every(valid)) bad++;
    void plans;
  }
  assert(st.over && bad === 0, 'bot-only game ends with every prize won by a valid ticket');
  assert(delays.length > 0 && delays.every((d) => d >= 1500 && d <= 4500), 'bots claim after 1.5–4.5 s (human-like)');
}

// Caller mode: printed codes regenerate the same ticket; check a ticket.
{
  const seed = 0x5eed1;
  const sheet = T.printedSheet('90', seed, 3);
  const code = T.ticketCode(seed, 3, 2);
  assert(/^[0-9A-Z]+-4\.3$/.test(code) && T.ticketFromCode('90', code).join() === sheet[2].join(), 'printed ticket code regenerates the exact ticket');
  assert(sheet.every(T.validTicket90) && [].concat(...sheet.map(T.nums90)).length === 90, 'printed sheets are valid strips (every number once)');
  const called = T.nums90(sheet[2]).slice(0, 9);
  const rows = T.rows90(sheet[2]);
  const check = T.checkTicket('90', sheet[2], rows[0].concat([99]), ['top', 'full']);
  assert(check[0].at > 0 && check[1].at === 0, 'Check a ticket: prize-by-prize result against the called numbers');
  const cn = T.checkNumbers([called[0], called[1], 7], called);
  assert(cn.missing.indexOf(7) >= 0 || called.indexOf(7) >= 0, 'Check a ticket by numbers lists the ones not called');
  const card = T.ticketFromCode('75', T.ticketCode(seed, 0, 0));
  assert(T.validCard75(card), '75-ball printed cards are valid');
  assert(T.parseCode('garbage') === null, 'bad codes are rejected');
}

// ======================================================================= Tambola: rooms

function tambolaRoom(n, settings, now) {
  let room = PD.newRoom({ game: 'tambola', uid: uidN(0), name: 'Host', settings, now });
  for (let i = 1; i < n; i++) room = PD.reduceRoom(rt(room), uidN(i), 'join', { name: 'P' + i }, now).room;
  return room;
}

/** Humans claim as soon as a ticket completes a claimable prize (± a little reaction time). */
function driveTambola(room, now, o) {
  const opts = o || {};
  let t = now;
  const stats = { ops: 0, ticks: 0, claims: 0, secretWrites: 0, maxPub: 0, publishes: 0, draws: 0, bogeys: 0, ties: 0 };
  const rng = seeded(opts.seed || 5);
  let prevSecrets = JSON.stringify(rtdb(clone(room.secrets)));
  let prevCalled = 0;
  for (let i = 0; i < 20000; i++) {
    const st = room.server.pub;
    if (st.over) break;
    const nextAt = room.pub.deadline || t + 1000;
    const claimers = [];
    st.seats.forEach((s, k) => {
      if (s.bot || s.left) return;
      st.prizes.forEach((p) => {
        const tie = p.status === 'won' && t - p.firstAt < T.TIE_MS;
        if (!T.claimable(st, p) && !tie) return;
        if (p.winners.some((w) => w.seat === k)) return;
        if (tie && !opts.tieChasers) return;
        const tk = st.tickets[k].findIndex((g, j) => st.blocked.indexOf(k + ':' + j + ':' + p.key) < 0 && T.prizeDone(st.variant, p.key, T.unpack(g), st.called, st.mask));
        if (tk >= 0 && (!st.lastClaim[k] || t - st.lastClaim[k] >= T.CLAIM_GAP_MS)) claimers.push({ uid: s.id, key: p.key, t: tk });
      });
    });
    if (claimers.length) {
      const c = claimers[Math.floor(rng() * claimers.length)];
      t += 50 + Math.floor(rng() * 150);
      try {
        const out = PD.reduceRoom(rt(room), c.uid, 'claim', { key: c.key, t: c.t }, t);
        room = out.room;
        if (out.result.tie) stats.ties++;
      } catch (e) {
        if (e.code !== 'taken' && e.code !== 'slow_down' && e.code !== 'already_won') throw e;
        room = rt(room);
        room.server.pub.lastClaim[room.server.pub.seats.findIndex((s) => s.id === c.uid)] = t;
      }
      stats.ops++;
      stats.claims++;
    } else {
      t = Math.max(t + 1, nextAt);
      // Designated tickers: the leads tick on time; the rest would only tick 4–8 s late.
      const leads = Object.keys(room.pub.players).filter((u) => Policy.tickRole(room.pub, u).lead);
      leads.forEach((u, k) => {
        room = PD.reduceRoom(rt(room), u, 'tick', {}, t + k * 30).room;
        stats.ops++;
        stats.ticks++;
      });
      t += leads.length * 30;
    }
    const called = room.server.pub.called.length;
    if (called !== prevCalled) {
      stats.draws++;
      const now2 = JSON.stringify(rtdb(clone(room.secrets)));
      if (now2 !== prevSecrets && !room.server.pub.over) {
        stats.secretWrites++;
        if (process.env.P9_DEBUG) {
          const a = JSON.parse(prevSecrets);
          const b = JSON.parse(now2);
          Object.keys(b).forEach((u) => JSON.stringify(a[u]) !== JSON.stringify(b[u]) && console.log('secret diff', u, JSON.stringify(a[u]).slice(0, 200), '→', JSON.stringify(b[u]).slice(0, 200)));
        }
      }
      prevSecrets = now2;
      prevCalled = called;
    }
    stats.maxPub = Math.max(stats.maxPub, JSON.stringify(room.pub.state || {}).length);
  }
  return { room, stats, now: t };
}

{
  const now = 1.9e12;
  let room = tambolaRoom(12, { variant: '90', pace: 5, prizes: ['early5', 'top', 'middle', 'bottom', 'corners', 'full', 'full2', 'full3'], bogey: 'block' }, now);
  room = PD.reduceRoom(rt(room), uidN(3), 'tickets', { n: 3 }, now).room;
  room = PD.reduceRoom(rt(room), uidN(4), 'tickets', { sheet: true }, now).room;
  room = PD.reduceRoom(rt(room), uidN(0), 'start', {}, now).room;
  const st = room.server.pub;
  assert(st.seats.length === 12 && st.tickets[3].length === 3 && st.tickets[4].length === 6, '12-player private room: tickets per player (3 tickets, a full sheet of 6)');
  const sheetNums = [].concat(...st.tickets[4].map((g) => T.nums90(T.unpack(g)))).sort((a, b) => a - b);
  assert(sheetNums.length === 90 && sheetNums.every((n, k) => n === k + 1), 'a full-sheet buyer holds every number exactly once');
  const pubJson = JSON.stringify(room.pub);
  assert(st.tickets.every((list) => list.every((g) => pubJson.indexOf(g) < 0)) && typeof room.pub.state.tickets === 'number', 'tickets never appear in the public room state (only a count)');
  const sec = room.secrets[uidN(3)];
  assert(sec.tickets.length === 3 && typeof sec.tickets[0] === 'string' && JSON.stringify(sec).indexOf(st.tickets[5][0]) < 0, 'each secret holds only its owner’s tickets (packed)');
  assert(room.pub.deadline === now + 3000, 'first ball 3 s after the deal; then the host pace');

  // Forced bogey + forced tie (two players holding the same ticket).
  room = rt(room);
  room.server.pub.tickets[2][0] = room.server.pub.tickets[1][0];
  room.secrets = {};
  const bog = PD.reduceRoom(rt(room), uidN(5), 'claim', { key: 'full', t: 0 }, now + 10);
  assert(bog.result.bogey && bog.result.blocked, 'Live bogey: invalid claim blocks that ticket for the prize');
  room = bog.room;
  assert(room.secrets[uidN(5)].blocked.indexOf('0:full') >= 0, 'the blocked ticket is shown to its owner');
  const rgame = rt(room);
  const g1 = T.unpack(rgame.server.pub.tickets[1][0]);
  const first = T.nums90(g1);
  rgame.server.pub.bag = first.concat(rgame.server.pub.bag.filter((n) => first.indexOf(n) < 0));
  let t = now + 20;
  let r = rgame;
  while (r.server.pub.called.length < 15) {
    t = Math.max(t + 1, r.pub.deadline);
    r = PD.reduceRoom(rt(r), uidN(0), 'tick', {}, t).room;
  }
  const w1 = PD.reduceRoom(rt(r), uidN(1), 'claim', { key: 'full', t: 0 }, t + 200);
  const w2 = PD.reduceRoom(rt(w1.room), uidN(2), 'claim', { key: 'full', t: 0 }, t + 700);
  assert(w1.result.won && w2.result.tie, 'Live tie: two valid Full House claims on the same call share it');
  const out = driveTambola(w2.room, t + 800, { seed: 7 });
  const fin = out.room.server.pub;
  assert(fin.over && fin.prizes.every((p) => p.status === 'closed'), '12-player room runs through every prize (Early Five … 3rd Full House)');
  assert(fin.prizes.every((p) => p.winners.every((w) => T.completedAt('90', p.key, T.unpack(fin.tickets[w.seat][w.t]), fin.called) > 0)), 'every winner held a valid ticket at claim time');
  assert(out.room.pub.state.over && out.room.secrets[uidN(1)].result && !out.room.pub.settlement && !out.room.server.settleReq, 'results reach each player; a just-for-fun room settles nothing to the wallet');
  assert(fin.prizes.find((p) => p.key === 'full').winners.length === 2, 'the tie is on the scoreboard');

  // Host pace + pause shift the clock.
  let hp = tambolaRoom(3, { variant: '90', pace: 12 }, now);
  hp = PD.reduceRoom(rt(hp), uidN(0), 'start', {}, now).room;
  hp = PD.reduceRoom(rt(hp), uidN(0), 'tick', {}, now + 3001).room;
  assert(hp.server.pub.called.length === 1 && hp.pub.deadline === now + 3001 + 12000, 'draws at the host pace (12 s)');
  hp = PD.reduceRoom(rt(hp), uidN(0), 'pace', { pace: 5 }, now + 4000).room;
  assert(hp.pub.deadline === now + 4000 + 5000, 'host can change the pace mid-game');
  assert(codeOf(() => PD.reduceRoom(rt(hp), uidN(1), 'pace', { pace: 8 }, now + 4100)) === 'host_only', 'only the host sets the pace');
  hp = PD.reduceRoom(rt(hp), uidN(0), 'pause', {}, now + 5000).room;
  hp = PD.reduceRoom(rt(hp), uidN(0), 'resume', {}, now + 65000).room;
  assert(hp.server.pub.nextAt === now + 9000 + 60000 && hp.pub.deadline === hp.server.pub.nextAt, 'pause / resume shifts the draw clock');

  // 75-ball room.
  let b = tambolaRoom(4, { variant: '75', prizes: ['line', 'corners', 'x', 'blackout', 'custom'], mask: (1 << 0) | (1 << 4) | (1 << 12) }, now);
  b = PD.reduceRoom(rt(b), uidN(0), 'start', {}, now).room;
  assert(b.server.pub.tickets.every((list) => list.every((g) => T.validCard75(T.unpack(g)))), '75-ball room: valid Bingo cards');
  const bo = driveTambola(b, now + 10, { seed: 8 });
  assert(bo.room.server.pub.over && bo.room.server.pub.prizes.every((p) => p.status === 'closed'), '75-ball room plays every pattern (line, corners, X, blackout, custom)');

  // Leaving: tickets stay (can't claim); all humans gone → game ends.
  let lv = tambolaRoom(2, { variant: '90' }, now);
  lv = PD.reduceRoom(rt(lv), uidN(0), 'start', {}, now).room;
  lv = PD.reduceRoom(rt(lv), uidN(1), 'leave', {}, now + 100).room;
  assert(lv.server.pub.seats[1].left && !lv.server.pub.over, 'a leaver’s tickets stay in the game (idle)');
  lv = PD.reduceRoom(rt(lv), uidN(0), 'leave', {}, now + 200).room;
  assert(lv.server.pub.over, 'everyone left → the game ends');
}

// 100-player load simulation.
{
  const now = 1.95e12;
  let room = tambolaRoom(100, { variant: '90', pace: 5 }, now);
  room = PD.reduceRoom(rt(room), uidN(0), 'start', {}, now).room;
  assert(room.server.pub.seats.length === 100 && Object.keys(room.secrets).length === 100, '100 players seated, 100 private ticket secrets written at the deal');
  const leads = Object.keys(room.pub.players).filter((u) => Policy.tickRole(room.pub, u).lead);
  const late = Object.keys(room.pub.players).map((u) => Policy.tickRole(room.pub, u)).filter((r) => !r.lead);
  assert(leads.length === 3 && leads.indexOf(uidN(0)) >= 0 && late.every((r) => r.delayMs >= 4000 && r.delayMs <= 8000), 'big room: host + 2 designated tickers; the other 97 only tick 4–8 s late as a fallback');
  const t0 = Date.now();
  const out = driveTambola(room, now + 10, { seed: 11 });
  const s = out.stats;
  const perDraw = s.ticks / Math.max(1, s.draws);
  console.log('   load:', JSON.stringify(s), 'ms', Date.now() - t0);
  assert(out.room.server.pub.over, '100-player game completes');
  assert(perDraw <= 3.5, 'server calls per draw ≤ 3.5 (' + perDraw.toFixed(2) + ') — not one per phone');
  assert(s.secretWrites === 0, 'no ticket secret is rewritten on a draw (numbers only)');
  assert(s.maxPub < 4000, 'public state stays small (' + s.maxPub + ' bytes max) — numbers, prizes, winners');
  assert(s.ops < s.draws * 3.5 + s.claims + 10, 'total server ops within budget (' + s.ops + ' for ' + s.draws + ' draws + ' + s.claims + ' claims)');
  const pkTick = read('public/src/js/games/party-kit.js');
  assert(/tickRole\(pub, uid\)/.test(pkTick) && /presence !== false/.test(pkTick), 'client uses designated tickers and can skip the presence listener in big rooms');
}

// Public chip tables: 18+, wallet tickets, auto-start, bots fill, zero-sum ledger.
function memDb() {
  const store = new Map();
  let auto = 0;
  const FV = { serverTimestamp: () => ({ __ts: true }), increment: (n) => ({ __inc: n }) };
  const apply = (prev, data, merge) => {
    const out = merge ? Object.assign({}, prev || {}) : {};
    Object.keys(data).forEach((k) => {
      const v = data[k];
      out[k] = v && v.__inc !== undefined ? (Number((prev || {})[k]) || 0) + v.__inc : v;
    });
    return out;
  };
  const docRef = (p) => ({
    path: p,
    id: p.split('/').pop(),
    collection: (c) => colRef(p + '/' + c),
    get: async () => ({ exists: store.has(p), data: () => store.get(p), id: p.split('/').pop(), ref: docRef(p) }),
    set: async (d, o) => store.set(p, apply(store.get(p), d, o && o.merge)),
    update: async (d) => store.set(p, apply(store.get(p), d, true)),
    delete: async () => store.delete(p),
  });
  const colRef = (p) => ({
    doc: (id) => docRef(p + '/' + (id || 'auto' + ++auto)),
    add: async (d) => {
      const r = docRef(p + '/auto' + ++auto);
      await r.set(d);
      return r;
    },
    limit: () => ({
      get: async () => ({
        docs: [...store.keys()].filter((k) => k.startsWith(p + '/') && k.slice(p.length + 1).indexOf('/') < 0).map((k) => ({ id: k.split('/').pop(), data: () => store.get(k) })),
      }),
    }),
  });
  return {
    store,
    admin: { firestore: { FieldValue: FV } },
    collection: colRef,
    async runTransaction(fn) {
      const ops = [];
      const out = await fn({ get: (r) => r.get(), set: (r, d, o) => ops.push([r, d, o]) });
      for (const [r, d, o] of ops) await r.set(d, o);
      return out;
    },
    batch() {
      const ops = [];
      return {
        set: (r, d, o) => ops.push(['set', r.path, d, o]),
        create: (r, d) => ops.push(['create', r.path, d]),
        async commit() {
          if (ops.some((op) => op[0] === 'create' && store.has(op[1]))) throw Object.assign(new Error('6 ALREADY_EXISTS'), { code: 6 });
          ops.forEach((op) => store.set(op[1], apply(store.get(op[1]), op[2], op[0] === 'set' && op[3] && op[3].merge)));
        },
      };
    },
  };
}
function fakeRtdb() {
  const store = {};
  return {
    store,
    ref(p) {
      return {
        async transaction(fn) {
          const cur = store[p] === undefined ? null : clone(store[p]);
          const next = fn(cur);
          if (next === undefined) return { committed: false };
          if (next === null) {
            if (cur === null) return { committed: true };
            delete store[p];
          } else store[p] = rtdb(clone(next));
          return { committed: true };
        },
        async set(v) {
          store[p] = clone(v);
        },
        async once() {
          const parts = p.split('/');
          const key = parts.slice(0, 3).join('/');
          let v = store[key];
          parts.slice(3).forEach((k) => (v = v ? v[k] : undefined));
          return { val: () => (v === undefined ? null : clone(v)) };
        },
      };
    },
  };
}

(async () => {
  const econ = require(path.join(root, 'server-lib/dangal-economy.js'));
  assert(econ.SERVER_SETTLED.has('bluff') && econ.SERVER_SETTLED.has('tambola'), 'Bluff and Tambola are server-settled only (clients can’t self-report)');
  const db = memDb();
  const r = fakeRtdb();
  const adminApp = { database: () => r, firestore: () => db };
  const deps = { economy: econ, db, admin: db.admin };
  const adults = ['a', 'b', 'c'].map((ch) => ch.repeat(28));
  const minor = 'm'.repeat(28);
  for (const id of adults) {
    await db.collection('users').doc(id).set({ adultConfirmedAt: 1 });
    for (const k of ['first_game', 'first_win', 'won_stake']) await db.collection('users').doc(id).collection('achievements').doc(k).set({ key: k });
    await db.collection('users').doc(id).collection('wallet').doc('chips').set({ balance: 500, lifetimeEarned: 500 });
  }
  await db.collection('users').doc(minor).set({ teenMode: true });
  await db.collection('users').doc(minor).collection('wallet').doc('chips').set({ balance: 500, lifetimeEarned: 500 });
  const call = (uid, body) => PD.partyRoom(adminApp, uid, Object.assign({ game: 'tambola' }, body), deps);
  const errCode = async (p) => {
    try {
      await p;
      return null;
    } catch (e) {
      return e.code;
    }
  };

  assert((await errCode(call(minor, { op: 'quick', price: 10, name: 'Kid' }))) === 'age_gate', 'public chip tables are 18+');
  const q1 = await call(adults[0], { op: 'quick', price: 10, name: 'Asha' });
  assert(q1.code && q1.host && q1.startsAt, 'quick: opens a public table with a countdown');
  const q2 = await call(adults[1], { op: 'quick', price: 10, name: 'Ben' });
  const q3 = await call(adults[2], { op: 'quick', price: 10, name: 'Cy' });
  assert(q2.code === q1.code && q3.code === q1.code, 'quick: later players join the table that’s filling up');
  const key = 'games/tambola/' + q1.code;
  assert(r.store[key].pub.table.public && r.store[key].pub.settings.mode === 'wallet', 'the table is marked public by the server (not client settings)');
  assert((await errCode(call(minor, { op: 'join', code: q1.code, name: 'Kid' }))) === 'age_gate', 'a minor can’t join a chip table by code');
  assert((await errCode(call(adults[0], { op: 'settings', code: q1.code, settings: { mode: 'fun' } }))) === 'fixed', 'public table settings are fixed');
  assert((await errCode(call(adults[0], { op: 'start', code: q1.code }))) === 'auto_start', 'the host can’t start a public table early');
  await call(adults[1], { op: 'tickets', code: q1.code, n: 3 });
  assert(r.store[key].pub.players[adults[1]].tk === 3, 'buy tickets against the wallet balance');
  await db.collection('users').doc(adults[2]).collection('wallet').doc('chips').set({ balance: 15, lifetimeEarned: 500 });
  assert((await errCode(call(adults[2], { op: 'tickets', code: q1.code, n: 2 }))) === 'insufficient_chips', 'can’t buy more tickets than you can afford');
  const fake = await errCode(call(adults[0], { op: 'create', settings: { mode: 'wallet', public: true, price: 25 } }).then((o) => {
    const pub = r.store['games/tambola/' + o.code].pub;
    if (pub.settings.mode === 'wallet' || pub.table) throw Object.assign(new Error('forged'), { code: 'forged' });
  }));
  assert(fake === null, 'a client can’t forge a wallet table through create settings');

  // Countdown ends → auto-start with bots filling to 6 seats.
  const startAt = r.store[key].pub.deadline;
  assert((await call(adults[0], { op: 'tick', code: q1.code })) && r.store[key].pub.status === 'lobby', 'before the countdown ends nothing starts');
  const realNow = Date.now;
  Date.now = () => startAt + 10;
  await call(adults[1], { op: 'tick', code: q1.code });
  const room = PD.hydrateRoom(clone(r.store[key]));
  assert(room.pub.status === 'playing' && room.server.pub.seats.length === 6 && room.server.pub.seats.filter((s) => s.bot).length === 3, 'countdown ends → the table starts itself; bots fill to 6 seats');
  assert(room.server.pub.mode === 'wallet' && T.potOf(room.server.pub) === 50, 'pot = humans’ tickets (1 + 3 + 1) × 10');
  // Drive to the end with local time, then settle through the ledger.
  let t = startAt + 20;
  let cur = room;
  for (let i = 0; i < 3000 && !cur.server.pub.over; i++) {
    const st = cur.server.pub;
    let claimed = false;
    for (const [k, s] of st.seats.entries()) {
      if (s.bot || claimed) continue;
      for (const p of st.prizes) {
        if (!T.claimable(st, p) || claimed) continue;
        const tk = st.tickets[k].findIndex((g) => T.prizeDone('90', p.key, T.unpack(g), st.called));
        if (tk >= 0 && (!st.lastClaim[k] || t - st.lastClaim[k] > 2000)) {
          t += 100;
          cur = PD.reduceRoom(rt(cur), s.id, 'claim', { key: p.key, t: tk }, t).room;
          claimed = true;
        }
      }
    }
    if (!claimed) {
      t = Math.max(t + 1, cur.pub.deadline);
      cur = PD.reduceRoom(rt(cur), adults[0], 'tick', {}, t).room;
    }
  }
  Date.now = realNow;
  const req = cur.server.settleReq;
  assert(cur.server.pub.over && req && req.kind === 'ledger', 'public table settles as one wallet ledger');
  assert(sum(Object.values(req.deltas)) === 0 && Object.keys(req.deltas).length === 3, 'ledger is zero-sum across the three buyers (bots take nothing)');
  r.store[key] = rtdb(clone(cur));
  const before = sum(adults.map((u) => (db.store.get('users/' + u + '/wallet/chips') || {}).balance));
  const res = await PD.settleRoom(adminApp, r, key, clone(req), deps);
  const after = sum(adults.map((u) => (db.store.get('users/' + u + '/wallet/chips') || {}).balance));
  const bonus = sum(adults.map((u) => (res.results[u] || {}).chipDelta || 0)) - sum(Object.values(req.deltas));
  assert(res.status === 'done' && after - before === bonus && bonus >= 0 && bonus <= 75, 'settlement conserves chips (only the usual win bonus is minted)');
  const eng = require(path.join(root, 'server-lib/tambola-engine.js'));
  assert(eng.MAX_WALLET_HUMANS === 40 && PD.GAMES.tambola.maxFor({ pub: { table: { public: true } } }) === 40 && PD.GAMES.tambola.maxFor({ pub: {} }) === 120, 'chip tables cap at 40 humans (one Firestore batch); private rooms 120');

  // ======================================================================= wiring
  const pc = read('public/src/js/games/party-classics.js');
  assert(!/registerGame\(\{\s*id: '(tambola|bluff)'/.test(pc) && !/window\.openTambola\s*=/.test(pc) && !/window\.openBluff\s*=/.test(pc), 'old 1v1 Bluff / Tambola in party-classics are unregistered');
  const idx = read('public/index.html');
  ['games/bluff-core.js', 'games/tambola-core.js'].forEach((f) => assert(new RegExp('data-party-lazy[^>]*' + f.replace('.', '\\.') + '|' + f.replace('.', '\\.') + '[^>]*data-party-lazy').test(idx), f + ' is lazy-loaded'));
  assert(/games\/bluff-ui\.js/.test(idx) && /games\/tambola-ui\.js/.test(idx), 'Bluff and Tambola UIs are on the page');
  const pk = read('public/src/js/games/party-kit.js');
  assert(/bluff: \['games\/bluff-core\.js'\]/.test(pk) && /tambola: \['games\/tambola-core\.js'\]/.test(pk), 'LAZY_DATA lists both cores');
  const grad = read('public/src/js/dangal/dangal-graduation.js');
  assert(/bluff:\s*\{[^}]*liveParty/.test(grad) && /tambola:\s*\{[^}]*liveParty/.test(grad), 'graduation: both are Live party-room games');
  const rules = read('firebase/database.rules.json');
  assert(/"bluff"/.test(rules) && /"tambola"/.test(rules) && /"tambolaPublic"/.test(rules), 'RTDB rules cover games/bluff, games/tambola and the admin-only public-table pointer');
  const Rules = require(path.join(root, 'public/src/js/dangal/dangal-rules.js'));
  const br = Rules.get('bluff');
  const tr = Rules.get('tambola');
  assert(br && JSON.stringify(br).indexOf('Follow the rank') >= 0 && JSON.stringify(br).indexOf('Sequence') >= 0, 'rules registry: Bluff documents both styles');
  assert(tr && JSON.stringify(tr).indexOf('75-ball') >= 0 && JSON.stringify(tr).indexOf('Bogey') >= 0, 'rules registry: Tambola documents 75-ball and bogeys');
  const bui = read('public/src/js/games/bluff-ui.js');
  assert(/isIndiaLocale\(\)\s*\?\s*'follow'\s*:\s*'sequence'/.test(bui), 'locale default: India → Follow the rank, elsewhere → Sequence');
  const tui = read('public/src/js/games/tambola-ui.js');
  assert(/speechSynthesis/.test(tui) && /print/.test(tui) && /Check a ticket/.test(tui), 'Tambola UI: voice caller, printable tickets, Check a ticket');
  const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
  assert(apiCount === 12, 'api/*.js stays at 12 (' + apiCount + ')');

  console.log(failed ? `\n${failed} FAILED` : '\nAll P9 checks passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
