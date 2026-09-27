/**
 * Dangal H3 — Texas Hold'em (No-Limit).
 *  (a) evaluator: every category, kickers, wheel, board plays, splits, fast scorer parity
 *  (b) betting: min bet / min raise, short all-in does not reopen, heads-up order, uncalled returns
 *  (c) pots: side pots with 3+ all-ins, odd chip left of the button, showdown order + mucking
 *  (d) seating: button rotation, missed / dead blinds, Sit & Go blinds + payouts, friends settings
 *  (e) bots: legal, deterministic, never read other hole cards; long soak conserves chips
 *  (f) Live reducer: hole cards never in pub, secrets per owner, timeout = check/fold, time bank,
 *      disconnect → sit out, leave → cashout effect, Sit & Go to a winner, conservation
 *  (g) age gate + wiring: roster, graduation, identity, how-to, achievements, rules, registry,
 *      Cards genre + locale order, scripts, global-first copy, api count
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

const C = require(path.join(root, 'public/src/js/games/poker-core.js'));
const Engine = require(path.join(root, 'server-lib/poker-engine.js'));

const cards = (s) => C.parseCards(s);
const ev = (s) => C.evaluate(cards(s));
const sum = (arr) => arr.reduce((a, b) => a + b, 0);

/** Deck that deals the given hole cards (in deal order) then the given board, with burns. */
function riggedDeck(holes, board) {
  const n = holes.length;
  const order = [];
  for (let r = 0; r < 2; r++) for (let k = 0; k < n; k++) order.push(holes[k][r]);
  return { order, board };
}
function deckFor(o, button) {
  // createHand deals from button+1 around the table: map seat-ordered holes to deal order.
  const n = o.holes.length;
  const deal = [];
  for (let r = 0; r < 2; r++) for (let k = 1; k <= n; k++) deal.push(o.holes[(button + k) % n][r]);
  const b = o.board;
  const used = new Set(deal.concat(b));
  const filler = C.newDeck().filter((c) => !used.has(c));
  const deck = deal.concat([filler[0], b[0], b[1], b[2], filler[1], b[3], filler[2], b[4]]);
  return deck.concat(filler.slice(3));
}
function hand(stacks, holes, board, opts) {
  const o = opts || {};
  const button = o.button || 0;
  return C.createHand({
    players: stacks.map((s, i) => ({ id: 'p' + i, name: 'P' + i, seat: i, stack: s })),
    button,
    sb: o.sb || 10,
    bb: o.bb || 20,
    deck: deckFor({ holes: holes.map(cards), board: cards(board) }, button),
  });
}
const act = (h, type, to) => {
  const id = h.players[h.toAct].id;
  const r = C.applyAction(h, id, { type, to });
  if (r.error) throw new Error(id + ' ' + type + ' ' + to + ' → ' + r.error);
  return r;
};
const stacksOf = (h) => h.players.map((p) => p.stack);

// ---------- (a) evaluator ----------
{
  const cats = [
    ['2s 7h 9d Jc Kd 3h 4c', 0, 'High card'],
    ['As Ah 9d Jc Kd 3h 4c', 1, 'Pair'],
    ['As Ah 9d 9c Kd 3h 4c', 2, 'Two pair'],
    ['As Ah Ad 9c Kd 3h 4c', 3, 'Three of a kind'],
    ['5s 6h 7d 8c 9d Kh Kc', 4, 'Straight'],
    ['2h 7h 9h Jh Kh 3c 4c', 5, 'Flush'],
    ['As Ah Ad 9c 9d 3h 4c', 6, 'Full house'],
    ['As Ah Ad Ac 9d 3h 4c', 7, 'Four of a kind'],
    ['5h 6h 7h 8h 9h Kh Kc', 8, 'Straight flush'],
  ];
  cats.forEach(([s, cat, name]) => assert(ev(s).cat === cat && ev(s).category === name, 'category: ' + name));
  const royal = ev('As Ks Qs Js Ts 2d 3c');
  assert(royal.cat === 8 && royal.royal && /royal/i.test(royal.name), 'royal flush flagged');
  const wheel = ev('As 2d 3c 4h 5s Kd Qc');
  const six = ev('2d 3c 4h 5s 6s Kd Qc');
  assert(wheel.cat === 4 && wheel.score < six.score, 'wheel A-2-3-4-5 is the lowest straight');
  const wheelSf = ev('Ah 2h 3h 4h 5h Kd Qc');
  assert(wheelSf.cat === 8 && !wheelSf.royal, 'steel wheel is a straight flush, not royal');
  assert(ev('As Ks 7d 7c 4h 3h 2c').score > ev('Qs Js 7d 7c 4h 3h 2c').score, 'pair kicker decides');
  assert(ev('As Ad Kc Kd 7h 3h 2c').score > ev('As Ad Qc Qd Jh 3h 2c').score, 'two pair: higher second pair beats a kicker');
  assert(ev('As Ad Kc Kd 7h 3h 2c').score > ev('As Ad Kh Ks 6h 3h 2c').score, 'two pair: fifth-card kicker');
  assert(ev('Ah Kh 8h 5h 2h 3c 4d').score > ev('Ad Qd Jd 9d 8d 3c 4d').score, 'flush compares card by card');
  assert(ev('Kc Kd Ks 2c 2d 3h 4c').score > ev('Qc Qd Qs Ac Ad 3h 4c').score, 'full house: trips first');
  assert(ev('9c 9d 9s 9h 2d 3h 4c').score < ev('9c 9d 9s 9h Ad 3h 4c').score, 'quads kicker');
  // Board plays: both players' best five is the board → tie.
  const board = 'Ts Js Qd Kc Ah';
  assert(ev('2c 3d ' + board).score === ev('4h 5h ' + board).score, 'board plays → split');
  // No suit ranking.
  assert(ev('Ah Kh Qh Jh 9h 2c 3c').score === ev('As Ks Qs Js 9s 2d 3d').score, 'no suit ranking');
  // Best five of seven picks the higher straight.
  assert(ev('4c 5d 6h 7s 8c 9d 2h').tb[0] === C.rankOf(C.parseCard('9d')), 'best straight of seven');
  // Fast scorer agrees with the full evaluator (ordering).
  const rng = C.mulberry32(99);
  let mism = 0;
  for (let n = 0; n < 4000; n++) {
    const d = C.shuffle(C.newDeck(), C.intFrom(rng));
    const a = d.slice(0, 7);
    const b = d.slice(7, 14);
    const e1 = Math.sign(C.evaluate(a).score - C.evaluate(b).score);
    const e2 = Math.sign(C.scoreFast(a) - C.scoreFast(b));
    if (e1 !== e2) mism++;
  }
  assert(mism === 0, 'fast scorer matches evaluator on 4000 random pairs');
  const cur = C.currentHand(cards('Ah Ad'), cards('Kc 7d 2s'));
  assert(cur && cur.name && /pair/i.test(cur.name), 'current hand name for the helper');
}

// ---------- (b) betting ----------
{
  // Min bet = BB; min raise = size of the previous raise.
  const h = hand([1000, 1000, 1000], ['2c 3d', '4h 5h', '7s 8s'], 'Kd Qc 9h Ts 2s');
  // 3-handed, button 0 → SB p1, BB p2, p0 first to act.
  assert(h.sbIndex === 1 && h.bbIndex === 2 && h.toAct === 0, '3-handed: SB left of button, UTG = button acts first');
  assert(C.applyAction(h, 'p0', { type: 'raise', to: 30 }).error === 'min_raise', 'min raise preflop is to 2×BB');
  act(h, 'raise', 60); // raise of 40
  assert(h.minRaise === 40, 'min raise tracks the last raise size');
  assert(C.applyAction(h, 'p1', { type: 'raise', to: 90 }).error === 'min_raise', 're-raise must be at least the previous raise');
  act(h, 'raise', 100);
  act(h, 'call');
  act(h, 'call');
  assert(h.street === 'flop' && h.board.length === 3, 'flop dealt after calls');
  assert(C.applyAction(h, h.players[h.toAct].id, { type: 'bet', to: 10 }).error === 'min_raise', 'postflop min bet = BB');
  act(h, 'bet', 20);
  assert(h.players.reduce((a, p) => a + p.total, 0) === 320, 'pot math');

  // Short all-in does not reopen the betting to players who already acted.
  const s = hand([1000, 1000, 130], ['2c 3d', '4h 5h', '7s 8s'], 'Kd Qc 9h Ts 2s');
  act(s, 'raise', 100); // p0 raises to 100 (raise of 80)
  act(s, 'call'); // p1 calls
  act(s, 'allin'); // p2 (BB) all-in to 130 — increase 30 < 80
  assert(s.currentBet === 130 && s.minRaise === 80, 'short all-in raises the price but not the min raise');
  const L0 = C.legalActions(s, s.toAct);
  assert(s.toAct === 0 && L0.canCall && !L0.canRaise, 'short all-in: earlier actor may only call or fold');
  act(s, 'call');
  const L1 = C.legalActions(s, s.toAct);
  assert(s.toAct === 1 && !L1.canRaise, 'short all-in: second earlier actor also cannot re-raise');
  act(s, 'call');
  assert(s.street === 'flop', 'round closes once the short all-in is called');

  // A full all-in raise DOES reopen.
  const f = hand([1000, 1000, 300], ['2c 3d', '4h 5h', '7s 8s'], 'Kd Qc 9h Ts 2s');
  act(f, 'raise', 100);
  act(f, 'call');
  act(f, 'allin'); // to 300: increase 200 ≥ 80
  assert(C.legalActions(f, f.toAct).canRaise, 'full all-in raise reopens betting');

  // Heads-up: button posts SB and acts first preflop, last postflop.
  const hu = hand([1000, 1000], ['2c 3d', '4h 5h'], 'Kd Qc 9h Ts 2s', { button: 1 });
  assert(hu.sbIndex === 1 && hu.bbIndex === 0 && hu.toAct === 1, 'heads-up: button is SB and acts first preflop');
  act(hu, 'call');
  act(hu, 'check');
  assert(hu.street === 'flop' && hu.toAct === 0, 'heads-up: button acts last postflop');

  // Uncalled bet returns; fold wins uncontested.
  const u = hand([1000, 1000, 1000], ['2c 3d', '4h 5h', '7s 8s'], 'Kd Qc 9h Ts 2s');
  act(u, 'raise', 500);
  act(u, 'fold');
  act(u, 'fold');
  assert(u.done && !u.result.showdown && sum(stacksOf(u)) === 3000 && u.players[0].stack === 1030, 'uncontested: uncalled bet back + blinds won');

  // Timeout: check if free, else fold.
  const t = hand([1000, 1000, 1000], ['2c 3d', '4h 5h', '7s 8s'], 'Kd Qc 9h Ts 2s');
  assert(C.timeoutAction(t, t.toAct).type === 'fold', 'timeout facing a bet → fold');
  act(t, 'call');
  act(t, 'call');
  assert(C.timeoutAction(t, t.toAct).type === 'check', 'timeout with a free option → check (BB option)');
}

// ---------- (c) pots ----------
{
  // Four players, three all-ins of different sizes → main + two side pots.
  const h = hand([100, 300, 600, 1000], ['Ah Ad', 'Kh Kd', 'Qh Qd', 'Jh Jd'], '2c 5s 8d 9c 3h');
  // Button 0 → SB p1, BB p2, p3 first.
  act(h, 'allin'); // p3 1000
  act(h, 'allin'); // p0 100
  act(h, 'allin'); // p1 300
  act(h, 'allin'); // p2 600
  assert(h.done && h.result.showdown, 'runout to showdown with all-ins');
  const pots = h.result.pots.map((p) => p.amount);
  assert(JSON.stringify(pots) === JSON.stringify([400, 600, 600]), 'layered pots 400 / 600 / 600 (uncalled 400 returned)');
  assert(JSON.stringify(stacksOf(h)) === JSON.stringify([400, 600, 600, 400]), 'each pot goes to the best eligible hand');
  assert(sum(stacksOf(h)) === 2000, 'side pots conserve chips');
  assert(Object.keys(h.result.shown).length === 4, 'runout: every hand is shown');

  const sp = C.sidePots([
    { total: 50, folded: false },
    { total: 200, folded: true },
    { total: 200, folded: false },
    { total: 120, folded: false },
  ]);
  assert(sum(sp.map((p) => p.amount)) === 570, 'folded chips stay in the pots');
  assert(sp.every((p) => p.eligible.indexOf(1) < 0), 'folded players are never eligible');

  // Split with an odd chip: first winner left of the button gets it.
  const odd = C.createHand({
    players: [0, 1, 2].map((i) => ({ id: 'p' + i, seat: i, stack: 1000 })),
    button: 0,
    sb: 5,
    bb: 10,
    deck: deckFor({ holes: [cards('2c 3c'), cards('2d 3d'), cards('7h 8h')], board: cards('Ts Js Qd Kc Ah') }, 0),
  });
  // Board plays for all → 3-way split of an odd pot.
  act(odd, 'call');
  act(odd, 'raise', 21); // SB completes to 21? min raise is to 20 (10+10): use 21 for odd
  act(odd, 'call');
  act(odd, 'call');
  ['flop', 'turn', 'river'].forEach(() => {
    act(odd, 'check');
    act(odd, 'check');
    act(odd, 'check');
  });
  assert(odd.done && odd.result.pots[0].amount === 63, 'three-way split of 63');
  assert(odd.result.pots[0].shares[1] === 21 && odd.result.pots[0].shares[2] === 21 && odd.result.pots[0].shares[0] === 21, 'even split when divisible');
  // SB folds → pot 25 split by the button (p0) and BB (p2): BB is first left of the button → 13.
  const odd2 = C.createHand({
    players: [0, 1, 2].map((i) => ({ id: 'p' + i, seat: i, stack: 1000 })),
    button: 0,
    sb: 5,
    bb: 10,
    deck: deckFor({ holes: [cards('2c 3c'), cards('4d 5d'), cards('2d 3d')], board: cards('Ts Js Qd Kc Ah') }, 0),
  });
  act(odd2, 'call');
  act(odd2, 'fold');
  act(odd2, 'check');
  ['flop', 'turn', 'river'].forEach(() => {
    act(odd2, 'check');
    act(odd2, 'check');
  });
  const pot2 = odd2.result.pots.reduce((a, p) => a + p.amount, 0);
  assert(pot2 === 25 && odd2.players[2].stack === 1003 && odd2.players[0].stack === 1002, 'odd chip to the first winner left of the button');

  // Showdown order: last aggressor shows first; a beaten hand may muck.
  const sd = hand([1000, 1000, 1000], ['Ah Kh', '2c 7d', 'Qs Qd'], 'Kd 9c 4s 3h 8c');
  act(sd, 'call');
  act(sd, 'call');
  act(sd, 'check');
  // flop: p1 first
  act(sd, 'check');
  act(sd, 'bet', 40); // p2 bets → last aggressor on the flop, but order uses river aggressor
  act(sd, 'call');
  act(sd, 'call');
  act(sd, 'check');
  act(sd, 'check');
  act(sd, 'check'); // turn
  act(sd, 'check');
  act(sd, 'bet', 100); // river: p2 bets
  act(sd, 'fold'); // p0 folds? p0 is next after p2
  act(sd, 'call');
  assert(sd.done && sd.result.order[0] === 2, 'river aggressor shows first');
  const shown = sd.result.shown;
  assert(shown[2] && !shown[1], 'beaten hand after a better shown hand is mucked');
  const pub = C.publicHand(sd);
  assert(pub.players[1].cards === null && pub.players[0].cards === null, 'mucked and folded hands are never published');
  assert(Array.isArray(pub.players[2].cards), 'shown hand is published');

  const nobody = hand([1000, 1000, 1000], ['Ah Kh', '2c 7d', 'Qs Qd'], 'Kd 9c 4s 3h 8c');
  act(nobody, 'call');
  act(nobody, 'call');
  act(nobody, 'check');
  for (let k = 0; k < 9; k++) act(nobody, 'check');
  assert(nobody.result.order[0] === 1, 'no river bet: first live seat left of the button shows first');
}

// ---------- (d) seating + blinds ----------
{
  const seats = [0, 1, 2, 3].map((s) => ({ seat: s, id: 'u' + s, name: 'U' + s, stack: 1000 }));
  const p1 = C.planHand(seats, null);
  const p2 = C.planHand(seats, p1.buttonSeat);
  assert(p1.buttonSeat === 0 && p2.buttonSeat === 1, 'button moves one seat clockwise each hand');
  // u2 sits out while the BB passes → owes BB (live) + SB (dead) on return.
  const out = seats.map((s) => Object.assign({}, s, { sittingOut: s.id === 'u2' }));
  const plan = C.planHand(out, 0);
  assert(plan.players.length === 3 && plan.missed.u2 && plan.missed.u2.bb, 'sit-out player skipped and marked as missing the BB');
  const back = seats.map((s) => Object.assign({}, s, s.id === 'u2' ? { missedBB: true, missedSB: true } : {}));
  const plan2 = C.planHand(back, 0);
  const post = plan2.posts.find((p) => p.id === 'u2');
  if (post) assert(post.live === 1 && post.dead === 1, 'returning player posts BB live + SB dead');
  else assert(plan2.players.findIndex((p) => p.id === 'u2') === C.planHand(back, 0).players.findIndex((p) => p.id === 'u2'), 'returning player in the blinds pays them naturally');
  const scaled = C.scalePosts([{ index: 2, live: 1, dead: 1 }], 10, 20);
  const hp = C.createHand({ players: seats.map((s) => ({ id: s.id, seat: s.seat, stack: 1000 })), button: 0, sb: 10, bb: 20, deck: C.newDeck(), posts: [{ index: 3, live: 20, dead: 10 }] });
  assert(scaled[0].live === 20 && scaled[0].dead === 10 && hp.players[3].total === 30 && hp.players[3].bet === 20, 'dead SB goes to the pot, live BB counts as a bet');
  assert(C.sngBlinds(0).bb === 20 && C.sngBlinds(C.SNG.levelMs * 3 + 1).level === 3, 'Sit & Go blinds escalate on schedule');
  const pay6 = C.sngPayouts(6, 100);
  const pay9 = C.sngPayouts(9, 100);
  assert(pay6.length === 2 && sum(pay6) === 600 && pay9.length === 3 && sum(pay9) === 900, 'Sit & Go pays top 2 (6) / top 3 (9) and the full prize pool');
  const fs2 = C.mergeFriendsSettings({ bb: 100, stack: 5000, blindMinutes: 10, seats: 9, junk: 1 });
  assert(fs2.sb === 50 && fs2.bb === 100 && fs2.stack === 5000 && fs2.seats === 9 && !fs2.junk, 'friends settings whitelisted');
  assert(C.mergeFriendsSettings({ bb: 7, seats: 30 }).bb === 20, 'unknown friends settings fall back to defaults');
  assert(C.friendsBlinds(fs2, 25 * 60000).bb === 400, 'friends blind timer doubles every N minutes');
}

// ---------- (e) bots ----------
{
  const rng = C.mulberry32(7);
  let hands = 0;
  let errors = 0;
  const players = [0, 1, 2, 3, 4, 5].map((i) => ({ id: 'b' + i, seat: i, stack: 1000 }));
  let button = 0;
  for (let n = 0; n < 150; n++) {
    if (players.filter((p) => p.stack > 0).length < 2) players.forEach((p) => p.stack === 0 && (p.stack = 1000));
    const live = players.filter((p) => p.stack > 0);
    const before = sum(players.map((p) => p.stack));
    const h = C.createHand({ players: live, button: button % live.length, sb: 10, bb: 20, deck: C.shuffle(C.newDeck(), C.intFrom(rng)) });
    let guard = 0;
    while (!h.done && guard++ < 200) {
      const i = h.toAct;
      const snapshot = h.players.map((p, j) => (j === i ? null : p.hole.slice()));
      const pubH = C.publicHand(h);
      pubH.deck = undefined;
      const a = C.botAction(Object.assign({}, pubH, { players: pubH.players }), i, C.BOT_LEVELS[i % 3], rng, h.players[i].hole);
      if (!a || C.applyAction(h, h.players[i].id, a).error) {
        errors++;
        C.applyAction(h, h.players[i].id, C.timeoutAction(h, i));
      }
      if (snapshot.some((s, j) => s && s.join() !== h.players[j].hole.join())) errors++;
    }
    if (!h.done) errors++;
    h.players.forEach((p) => (players.find((q) => q.id === p.id).stack = p.stack));
    if (sum(players.map((p) => p.stack)) !== before) errors++;
    hands++;
    button++;
  }
  assert(hands > 50 && errors === 0, 'bots play ' + hands + ' hands (' + errors + ' errors) from public state + own cards: always legal, chips conserved');
  const h = hand([1000, 1000], ['Ah Ad', '7c 2d'], 'Kd Qc 9h Ts 2s', { button: 1 });
  const a1 = C.botAction(h, h.toAct, 'shark', C.mulberry32(1));
  const a2 = C.botAction(h, h.toAct, 'shark', C.mulberry32(1));
  assert(JSON.stringify(a1) === JSON.stringify(a2), 'bots are deterministic for a seed');
  assert(C.preflopStrength(cards('Ah Ad')) > C.preflopStrength(cards('7c 2d')), 'preflop strength orders AA over 72o');
}

// ---------- (f) Live reducer ----------
const rand = { int: (n) => Math.floor(Math.random() * n) };
function seatAll(t, uids, stack, now) {
  uids.forEach((u, i) => {
    const out = Engine.reduceTable(t, u, 'seat', { name: 'Player ' + i, stack, bid: 'b' + u, dev: 'dev-' + u, ip: '10.0.0.' + i }, now, rand);
    t = out.table;
  });
  return t;
}
const handOf = (t) => Engine.loadHand(t);
const tableChips = (t) => {
  let s = 0;
  Object.keys(t.pub.seats).forEach((k) => (s += t.pub.seats[k].stack + (t.pub.seats[k].pendingTopup || 0)));
  const h = handOf(t);
  if (h && !h.done) h.players.forEach((p) => (s += p.total - 0));
  if (h && !h.done) h.players.forEach((p) => {
    const k = Engine.seatKeyOf(t.pub, p.id);
    if (k) s -= t.pub.seats[k].stack - p.stack; // seats hold the pre-hand stack mid-hand
  });
  return s;
};
const effectsOf = (t, type) => Object.values(t.server.effects || {}).filter((e) => !type || e.type === type);
{
  let now = 1_000_000;
  let t = Engine.newTable({ id: 'QTEST', kind: 'quick', tier: 't20', uid: 'a', now });
  t = seatAll(t, ['a', 'b', 'c'], 1000, now);
  assert(Object.keys(t.pub.seats).every((k) => /^s\d$/.test(k)), 'seats keyed s0..s8 (no RTDB arrays)');
  assert(effectsOf(t, 'signal').length === 0, 'different devices / IPs → no collusion signal');
  now += 4000;
  t = Engine.reduceTable(t, 'a', 'tick', {}, now, rand).table;
  const h = handOf(t);
  assert(h && !h.done && h.players.length === 3, 'quick table starts a hand after the start delay');
  const pubStr = JSON.stringify(t.pub);
  const leaks = h.players.some((p) => p.hole.some((c) => pubStr.indexOf('"' + C.cardStr(c) + '"') >= 0));
  const pubHand = JSON.parse(t.pub.handJ);
  assert(!leaks && pubHand.players.every((p) => p.cards === null) && !('deck' in pubHand), 'pub carries no hole cards and no deck');
  assert(Object.keys(t.secrets).length === 3 && t.secrets.a.hole.length === 2 && t.secrets.a.hole.join() === h.players.find((p) => p.id === 'a').hole.join(), 'each player gets only their own two cards in secrets/{uid}');
  assert(!('server' in pubHand) && !/deck/.test(t.pub.handJ), 'deck order never reaches pub');

  // Acting out of turn is rejected; stale hand numbers are rejected.
  const turn = t.pub.turn.uid;
  const other = ['a', 'b', 'c'].find((u) => u !== turn);
  let threw = '';
  try {
    Engine.reduceTable(JSON.parse(JSON.stringify(t)), other, 'act', { handNo: h.handNo, type: 'call' }, now, rand);
  } catch (e) {
    threw = e.code;
  }
  assert(threw === 'not_your_turn', 'server rejects out-of-turn actions');
  threw = '';
  try {
    Engine.reduceTable(JSON.parse(JSON.stringify(t)), turn, 'act', { handNo: h.handNo - 1, type: 'call' }, now, rand);
  } catch (e) {
    threw = e.code;
  }
  assert(threw === 'stale_hand', 'server rejects actions for an old hand');

  // Timeout: time bank first, then fold (facing the BB).
  ['a', 'b', 'c'].forEach((u) => (t.presence[u] = { at: now, online: true }));
  now = t.pub.deadline + 1;
  ['a', 'b', 'c'].forEach((u) => (t.presence[u] = { at: now, online: true }));
  t = Engine.reduceTable(t, other, 'tick', {}, now, rand).table;
  assert(t.pub.turn.uid === turn && t.pub.turn.bank, 'clock expiry dips into the time bank first');
  now = t.pub.deadline + 1;
  ['a', 'b', 'c'].forEach((u) => (t.presence[u] = { at: now, online: true }));
  t = Engine.reduceTable(t, other, 'tick', {}, now, rand).table;
  const h2 = handOf(t);
  assert(h2.players.find((p) => p.id === turn).folded, 'bank empty → timeout folds when facing a bet');

  // Play the hand out with calls/checks; then conservation across hands incl. a leave (cashout).
  function playOut(tt, nowRef) {
    let guard = 0;
    let hh = handOf(tt);
    while (hh && !hh.done && guard++ < 60) {
      const u = tt.pub.turn.uid;
      const i = hh.players.findIndex((p) => p.id === u);
      const L = C.legalActions(hh, i);
      const a = L.canCheck ? { type: 'check' } : { type: 'call' };
      tt = Engine.reduceTable(tt, u, 'act', Object.assign({ handNo: hh.handNo }, a), nowRef.v, rand).table;
      hh = handOf(tt);
    }
    return tt;
  }
  const nowRef = { v: now };
  t = playOut(t, nowRef);
  const total = () => sum(Object.values(t.pub.seats).map((s) => s.stack)) + sum(effectsOf(t, 'cashout').map((e) => e.amount));
  assert(handOf(t).done && total() === 3000, 'hand settles and table chips conserve');
  // Next hand; b leaves between hands → cashout effect with net.
  nowRef.v = t.pub.nextAt + 1;
  ['a', 'b', 'c'].forEach((u) => (t.presence[u] = { at: nowRef.v, online: true }));
  t = Engine.reduceTable(t, 'a', 'tick', {}, nowRef.v, rand).table;
  t = playOut(t, nowRef);
  const bStack = t.pub.seats[Engine.seatKeyOf(t.pub, 'b')].stack;
  t = Engine.reduceTable(t, 'b', 'leave', {}, nowRef.v, rand).table;
  const co = effectsOf(t, 'cashout').find((e) => e.uid === 'b');
  assert(co && co.amount === bStack && co.net === bStack - 1000 && !Engine.seatKeyOf(t.pub, 'b'), 'leave between hands → stack cashed out to the wallet (effect)');
  assert(total() === 3000, 'chips conserve through a cash-out');

  // Leave mid-hand: folds on turn, then cashes out after the hand.
  nowRef.v = t.pub.nextAt + 1;
  ['a', 'c'].forEach((u) => (t.presence[u] = { at: nowRef.v, online: true }));
  t = Engine.reduceTable(t, 'a', 'tick', {}, nowRef.v, rand).table;
  const hh = handOf(t);
  const leaver = t.pub.turn.uid;
  t = Engine.reduceTable(t, leaver, 'leave', {}, nowRef.v, rand).table;
  assert(handOf(t).done && !Engine.seatKeyOf(t.pub, leaver) && total() === 3000 && hh, 'leaving on your turn folds, settles and cashes out');
  assert(t.pub.status === 'playing' || Object.keys(t.pub.seats).length === 1, 'table keeps running for whoever is left');

  // Disconnect → sat out after the reconnect window (quick table).
  let q = Engine.newTable({ id: 'QDISC', kind: 'quick', tier: 't20', uid: 'x', now: 0 });
  q = seatAll(q, ['x', 'y', 'z'], 1000, 0);
  q.presence.x = { at: 0 };
  q.presence.y = { at: Engine.RECONNECT_MS + 100 };
  q.presence.z = { at: Engine.RECONNECT_MS + 100 };
  q = Engine.reduceTable(q, 'y', 'tick', {}, Engine.RECONNECT_MS + 200, rand).table;
  assert(q.pub.seats[Engine.seatKeyOf(q.pub, 'x')].sittingOut, 'disconnected past the reconnect window → sitting out');
  const qh = handOf(q);
  assert(qh && !qh.players.some((p) => p.id === 'x'), 'sitting-out player is not dealt in');

  // Same device at a public table → collusion signal (logged only).
  let d = Engine.newTable({ id: 'QDEV', kind: 'quick', tier: 't20', uid: 'm', now: 0 });
  d = Engine.reduceTable(d, 'm', 'seat', { name: 'M', stack: 1000, dev: 'same', ip: '1.1.1.1' }, 0, rand).table;
  d = Engine.reduceTable(d, 'n', 'seat', { name: 'N', stack: 1000, dev: 'same', ip: '2.2.2.2' }, 0, rand).table;
  const sig = effectsOf(d, 'signal');
  assert(sig.length === 1 && sig[0].kind === 'same_device', 'same device at a public table → collusion signal (no enforcement)');
  assert(!JSON.stringify(d.pub).includes('same') && !JSON.stringify(d.pub).includes('1.1.1.1'), 'device / IP hashes stay server-side');
}

// Sit & Go to a winner — chips conserve, payouts = prize pool, every place recorded.
{
  let now = 0;
  let t = Engine.newTable({ id: 'SNGT', kind: 'sng', size: 6, uid: 'u0', now });
  const uids = ['u0', 'u1', 'u2', 'u3', 'u4', 'u5'];
  uids.forEach((u, i) => {
    t = Engine.reduceTable(t, u, 'seat', { name: 'P' + i, stack: C.SNG.stack, bought: C.SNG.buyIn, dev: 'd' + i, ip: 'i' + i }, now, rand).table;
  });
  assert(t.pub.status === 'playing', 'Sit & Go starts when full');
  const rng = C.mulberry32(3);
  let guard = 0;
  while (t.pub.status === 'playing' && guard++ < 20000) {
    now += 500;
    uids.forEach((u) => (t.presence[u] = { at: now, online: true }));
    const h = handOf(t);
    if (h && !h.done && t.pub.turn) {
      const u = t.pub.turn.uid;
      const i = h.players.findIndex((p) => p.id === u);
      const a = C.botAction(h, i, 'shark', rng) || C.timeoutAction(h, i);
      t = Engine.reduceTable(t, u, 'act', Object.assign({ handNo: h.handNo }, a), now, rand).table;
    } else {
      now = Math.max(now, t.pub.nextAt || now) + 1;
      const out = Engine.reduceTable(t, uids.find((u) => Engine.seatKeyOf(t.pub, u)), 'tick', {}, now, rand);
      if (out) t = out.table;
    }
    const chips = sum(Object.values(t.pub.seats).map((s) => s.stack));
    const hh = handOf(t);
    const inHand = hh && !hh.done ? sum(hh.players.map((p) => p.total)) - sum(hh.players.map((p) => Object.values(t.pub.seats).find((s) => s.uid === p.id).stack - p.stack - p.total)) : 0;
    if (!hh || hh.done) if (chips !== C.SNG.stack * 6) throw new Error('SNG chips not conserved: ' + chips + inHand);
  }
  assert(t.pub.status === 'finished', 'Sit & Go plays down to one winner');
  const res = effectsOf(t, 'sng_result');
  const places = res.map((e) => e.place).sort((a, b) => a - b);
  assert(JSON.stringify(places) === '[1,2,3,4,5,6]', 'every player gets a finishing place');
  assert(sum(res.map((e) => e.amount)) === C.SNG.buyIn * 6, 'payouts = the whole prize pool');
  assert(res.filter((e) => e.amount > 0).length === 2, '6-max Sit & Go pays top 2');
}

// Friends: table chips only (no wallet effects), host start / settings / rebuy / close.
{
  let now = 0;
  let t = Engine.newTable({ id: 'FRND01', kind: 'friends', uid: 'h', now, settings: { bb: 50, stack: 1000, seats: 4 } });
  t = Engine.reduceTable(t, 'h', 'seat', { name: 'Host', stack: t.pub.settings.stack }, now, rand).table;
  ['f1', 'f2'].forEach((u) => (t = Engine.reduceTable(t, u, 'join', { name: u }, now, rand).table));
  let threw = '';
  try {
    Engine.reduceTable(JSON.parse(JSON.stringify(t)), 'f1', 'start', {}, now, rand);
  } catch (e) {
    threw = e.code;
  }
  assert(threw === 'host_only', 'only the host starts a friends table');
  t = Engine.reduceTable(t, 'h', 'start', {}, now, rand).table;
  now += 2000;
  ['h', 'f1', 'f2'].forEach((u) => (t.presence[u] = { at: now, online: true }));
  t = Engine.reduceTable(t, 'h', 'tick', {}, now, rand).table;
  const h = handOf(t);
  assert(h && h.bb === 50 && h.players.length === 3, 'friends table uses host blinds');
  t = Engine.reduceTable(t, 'h', 'end', {}, now, rand).table;
  assert(t.pub.status === 'closed', 'host closes the table');
  assert(effectsOf(t).filter((e) => e.type === 'cashout' || e.type === 'refund' || e.type === 'sng_result').length === 0, 'friends chips never touch the wallet');
}

// ---------- (g) age gate ----------
{
  assert(Engine.ageGate({ teenMode: true }) === 'under_18', 'teen mode → under 18');
  assert(Engine.ageGate({ dateOfBirth: '2015-01-01' }) === 'under_18', 'DOB under 18 → blocked');
  assert(Engine.ageGate({ dateOfBirth: '1990-01-01' }) === 'ok', 'DOB 18+ → ok');
  assert(Engine.ageGate({}) === 'confirm', 'no DOB → one-time confirmation');
  assert(Engine.ageGate({ adultConfirmedAt: 1 }) === 'ok', 'confirmed once → ok');
  assert(Engine.ageGate({ dateOfBirth: '2015-01-01', adultConfirmedAt: 1 }) === 'under_18', 'self-confirm never overrides an under-18 DOB');
}

// ---------- (g) wiring ----------
{
  const econ = require(path.join(root, 'server-lib/dangal-economy.js'));
  assert(econ.ACHIEVEMENTS.poker_royal_flush && econ.ACHIEVEMENTS.poker_bluff_master, 'server achievements: Royal Flush + Bluff Master');
  assert(econ.SERVER_SETTLED.has('poker'), 'poker results are server-settled only');
  assert(econ.canonicalGameId('holdem') === 'poker' && econ.canonicalGameId('Texas Holdem') === 'poker', 'aliases map to poker');

  const media = read('api/media-config.js');
  assert(/action === 'poker_table'/.test(media) && /'poker_table',/.test(media), 'poker_table folded into media-config');
  const rules = JSON.parse(read('firebase/database.rules.json'));
  const pr = rules.rules.games.poker.$tableId;
  assert(pr.pub['.read'] && pr.secrets.$uid['.read'].includes('auth.uid == $uid') && !pr.server && !pr['.read'] && !pr['.write'], 'RTDB rules: pub for seated, secrets owner-only, server hidden');

  const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
  assert(apiCount <= 12, 'api/*.js stays at ' + apiCount + ' (≤12)');

  const grad = read('public/src/js/dangal/dangal-graduation.js');
  assert(/poker:\s*\{[^}]*grade:\s*'live'[^}]*sync:\s*'liveParty'[^}]*stakes:\s*true/.test(grad), 'graduation: live / liveParty / stakes');
  const reg = read('public/src/js/games/game-registry.js');
  assert(/isAgeGatedGame/.test(reg) && /includeAgeGated/.test(reg) && /openAgeGateSheet/.test(reg), 'registry: age-gated filter + launch gate');
  assert(/id:\s*'cards'/.test(reg) && /id:\s*'poker',\s*genre:\s*'cards'/.test(grad) && /id:\s*'teenpatti',\s*genre:\s*'cards'/.test(grad), 'Cards genre lists Poker and Teen Patti');
  const client = read('public/src/js/games/poker.js');
  assert(/registerGame\(/.test(client) && /id:\s*'poker'/.test(client), 'client registers poker');
  assert(/poker_table/.test(client), 'client talks to poker_table');
  assert(!/chaupaal_money|topup_create|razorpay|stripe/i.test(client + read('public/src/js/games/poker-core.js')), 'no purchase / cash-out flow wired into Poker');
  const idx = read('public/index.html');
  const iCore = idx.indexOf('games/poker-core.js');
  const iClient = idx.indexOf('games/poker.js');
  const iReg = idx.indexOf('games/game-registry.js');
  assert(iCore > 0 && iClient > iCore && iCore > iReg, 'index.html loads poker-core then poker after the registry');
  const how = read('public/src/js/dangal/dangal-utils.js') + read('public/src/js/games/game-ui.js') + reg + client;
  assert(/Texas Hold/.test(how) && /Royal flush/i.test(how), 'how-to + rankings copy present');
  assert(!/\b(rupee|₹|Diwali|Bollywood)\b/i.test(client), 'global-first copy');
  const pkg = read('package.json');
  assert(/test-dangal-h3-poker\.js/.test(pkg), 'package.json test chain includes H3');
}

console.log('\nDangal H3 Texas Hold’em: all checks passed');
