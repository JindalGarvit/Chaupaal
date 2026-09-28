#!/usr/bin/env node
/**
 * Dangal P7 — Carrom: ICF rulings, deterministic physics (fixtures, replay, client/server parity),
 * bots, server-authoritative Live rooms (singles rated, doubles 2v2, AFK, leave, reconnect),
 * quick match, settlement and wiring.
 *   node scripts/test-dangal-p7-carrom.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

const P = require(path.join(root, 'public/src/js/games/carrom-physics.js'));
const C = require(path.join(root, 'public/src/js/games/carrom-core.js'));
const PD = require(path.join(root, 'server-lib/party-deal.js'));
const Engine = require(path.join(root, 'server-lib/carrom-engine.js'));
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
const man = (id, x, y) => ({ id, c: id.charAt(0), x: Math.round(x * 100), y: Math.round(y * 100) });
const two = () => [{ id: 'A', name: 'Asha' }, { id: 'B', name: 'Ben' }];
const four = () => ['A', 'B', 'C', 'D'].map((id) => ({ id, name: id }));

/** Feed a stroke outcome straight into the rules (no physics): ids pocketed, 'S' = striker. */
function stroke(st, ids, o) {
  const opts = o || {};
  const b = st.board;
  const pk = (ids || []).map((id) => ({ id, c: id === 'S' ? 's' : id.charAt(0) }));
  const res = { pieces: b.pieces.filter((p) => (ids || []).indexOf(p.id) < 0), pocketed: pk, touched: opts.touched !== false, firstHit: null };
  const entry = { no: ++st.shotNo, seat: st.turn, side: st.seats[st.turn].side, input: { x: 0, angle: 0, power: 500 }, before: [], steps: 0, pocketed: pk.map((p) => p.c), msg: '' };
  C.applyStroke(st, st.turn, res, entry);
  return entry;
}
/** Remove men from the board as if pocketed earlier by `c`'s side. */
function prePocket(st, ids) {
  const b = st.board;
  ids.forEach((id) => {
    b.pieces = b.pieces.filter((p) => p.id !== id);
    const c = id.charAt(0);
    b.pocketed[c].push(id);
    if (c === 'w' || c === 'b') b.ever[c] = true;
  });
  b.broken = true;
}
const range = (c, a, z) => Array.from({ length: z - a + 1 }, (_, i) => c + (a + i));

// ======================================================================= ICF rulings

// Setup (Law 41–43): 19 pieces, Queen centred, breaker plays white.
{
  const st = C.newGame(two(), { variant: 'icf', breaker: 1 });
  const b = st.board;
  assert(b.pieces.length === 19 && b.pieces.filter((p) => p.c === 'w').length === 9 && b.pieces.filter((p) => p.c === 'b').length === 9, 'setup: 9 white, 9 black, Queen');
  const q = b.pieces.find((p) => p.id === 'q');
  assert(q.x === 37000 && q.y === 37000, 'setup: Queen on the centre spot');
  assert(st.turn === 1 && C.teamColor(st, 1) === 'w' && C.teamColor(st, 0) === 'b', 'Law 43: the breaker plays white');
  const overlap = b.pieces.some((a, i) => b.pieces.some((c, j) => j > i && Math.hypot(a.x - c.x, a.y - c.y) < 2 * P.MAN_R * 100 - 1));
  assert(!overlap, 'setup: formation men do not overlap');
}

// Striker placement (Law 130).
{
  const F = C.formation(0);
  assert(C.strikerSpot(F, 0, 0).ok, 'striker: centre of the baseline is legal');
  assert(C.strikerSpot(F, 0, 2191).ok && C.strikerSpot(F, 0, -2191).ok, 'striker: fully covering a base circle is legal');
  assert(C.strikerSpot(F, 0, 2000).why === 'base_circle', 'striker: partly on a base circle is illegal');
  assert(!C.strikerSpot(F, 0, 2300).ok && C.strikerSpot(F, 0, 2400).why === 'off_baseline', 'striker: past the base circle is illegal');
  assert(C.strikerSpot([man('w1', 370, 622.6)], 0, 0).why === 'on_man', 'striker: cannot sit on a man');
  const spots = C.legalSpots(F, 0, 10);
  assert(spots.length > 300 && spots.every((x) => Math.abs(x) <= 2240), 'striker: legal range is the baseline between the base circles');
}

// Break (Law 44–45): three tries, then the turn passes; striker in without touching → passes, no due.
{
  const st = C.newGame(two(), { breaker: 0 });
  stroke(st, [], { touched: false });
  assert(st.turn === 0 && st.board.tries === 1, 'break: a miss gives another try');
  stroke(st, [], { touched: false });
  stroke(st, [], { touched: false });
  assert(st.turn === 1 && !st.board.broken, 'break: three misses pass the break');
  const st2 = C.newGame(two(), { breaker: 0 });
  stroke(st2, ['S'], { touched: false });
  assert(st2.turn === 1 && st2.place.length === 0 && st2.board.due.w === 0, 'break: striker pocketed without touching passes the turn, no due (45c)');
  const st3 = C.newGame(two(), { breaker: 0 });
  stroke(st3, []);
  assert(st3.board.broken && st3.turn === 1, 'break: touching a man completes the break');
}

// Turn continuation (Law 48) and opponent men (Law 74 / 125).
{
  const st = C.newGame(two(), { breaker: 0 });
  stroke(st, []);
  stroke(st, ['b0']);
  assert(st.turn === 1, 'turn: pocketing your own man continues the turn');
  stroke(st, ['w0']);
  assert(st.turn === 0 && st.board.pocketed.w.indexOf('w0') >= 0, 'turn: pocketing an opponent man counts for them and ends the turn');
  stroke(st, ['w1', 'b1']);
  assert(st.turn === 0, 'turn: own + opponent men together still continue');
}

// Queen (Law 92–97).
{
  const st = C.newGame(two(), { breaker: 0 });
  stroke(st, []);
  stroke(st, []);
  stroke(st, ['q']);
  assert(st.board.queen.s === 'board' && st.board.pieces.some((p) => p.id === 'q') && st.turn === 1, 'Queen: before any of your men it goes back and the turn passes (92)');
  const ok = C.newGame(two(), { breaker: 0 });
  stroke(ok, []);
  stroke(ok, []);
  stroke(ok, ['w0']);
  stroke(ok, ['q']);
  assert(ok.board.queen.s === 'pending' && ok.turn === 0, 'Queen: after your own man it is pending and you continue');
  stroke(ok, ['w1']);
  assert(ok.board.queen.s === 'covered' && ok.board.queen.by === 0 && ok.turn === 0, 'Queen cover: your man on the next stroke covers it');
  const miss = C.newGame(two(), { breaker: 0 });
  stroke(miss, []);
  stroke(miss, []);
  stroke(miss, ['w0']);
  stroke(miss, ['q']);
  stroke(miss, []);
  assert(miss.board.queen.s === 'board' && miss.board.pieces.some((p) => p.id === 'q') && miss.turn === 1, 'Queen cover failed: back to the centre, turn passes (96)');
  const together = C.newGame(two(), { breaker: 0 });
  stroke(together, []);
  stroke(together, []);
  stroke(together, ['w0']);
  stroke(together, ['q', 'w1']);
  assert(together.board.queen.s === 'covered', 'Queen + own man on one stroke = covered (97a)');
  const nine = C.newGame(two(), { breaker: 0 });
  stroke(nine, []);
  stroke(nine, []);
  stroke(nine, ['q', 'w0']);
  assert(nine.board.queen.s === 'pending' && nine.turn === 0, 'Queen + one man with all nine on the board still needs a cover (97b)');
  const due = C.newGame(two(), { breaker: 0 });
  stroke(due, []);
  stroke(due, []);
  stroke(due, ['S']);
  assert(due.board.due.w === 1 && due.place.length === 0, 'due outstanding when no man to return (72c)');
  stroke(due, []);
  stroke(due, ['q']);
  assert(due.board.queen.s === 'board' && due.turn === 1, 'Queen while a due is owed goes back, turn passes (95b)');
  const qs = C.newGame(two(), { breaker: 0 });
  stroke(qs, []);
  stroke(qs, []);
  stroke(qs, ['w0']);
  stroke(qs, ['q', 'S']);
  assert(qs.board.queen.s === 'board' && qs.place.length === 1 && qs.place[0].c === 'w', 'Queen with the striker goes back, plus a due');
}

// Fouls and dues (Laws 63–89): each foul + due placement.
{
  const st = C.newGame(two(), { breaker: 0 });
  stroke(st, []);
  stroke(st, []);
  stroke(st, ['w0']);
  stroke(st, ['S']);
  assert(st.phase === 'place' && st.place[0].seat === 1 && st.place[0].c === 'w' && st.place[0].n === 1 && st.nextTurn === 1, 'foul: striker alone → one man due, placed by the opponent, turn passes (72a, 78)');
  assert(C.placeMan(st, 0, 37000, 42000).error === 'not_your_turn', 'due: only the opponent places it');
  assert(C.placeMan(st, 1, 37000, 37000 + 9000).error === 'bad_spot', 'due: outside the outer circle is rejected (84)');
  assert(C.placeMan(st, 1, 37000, 37000 + 1000).error === 'bad_spot', 'due: on the centre circle is rejected (85)');
  const other = st.board.pieces.find((p) => Math.hypot(p.x - 37000, p.y - 37000) < 8000 && p.id !== 'q') || st.board.pieces[0];
  assert(C.placeMan(st, 1, other.x + 500, other.y).error === 'bad_spot', 'due: touching another man is rejected (86/89)');
  const loose = [man('w5', 370, 320)];
  assert(C.placeSpot(loose, 37000, 37000 + 5000).ok && C.placeSpot(loose, 37000, 37000 + 7500).why === 'outside', 'due: a clear spot inside the outer circle is legal; outside is not while room remains');
  const spot = C.botPlace(st, seeded(3));
  const ds = spot && Math.hypot(spot.x - 37000, spot.y - 37000) / 100;
  assert(spot && ds + P.MAN_R > 85 && ds + P.MAN_R <= 125, 'due: unbroken formation leaves no room inside → placed just outside the outer circle (judgement call)');
  assert(spot && C.placeMan(st, 1, spot.x, spot.y).ok && st.phase === 'shot' && st.turn === 1, 'due placed → the opponent shoots');
  assert(st.board.pieces.some((p) => p.id === 'w0'), 'due: the returned man is back on the board');

  const own = C.newGame(two(), { breaker: 0 });
  stroke(own, []);
  stroke(own, []);
  stroke(own, ['w0']);
  stroke(own, ['S', 'w1']);
  assert(own.place.length && own.place.reduce((n, j) => n + j.n, 0) === 2 && own.nextTurn === 0, 'foul: striker with your own man → it returns plus a due, and you continue (73)');

  const opp = C.newGame(two(), { breaker: 0 });
  stroke(opp, []);
  stroke(opp, []);
  stroke(opp, ['w0']);
  stroke(opp, ['S', 'b0']);
  assert(opp.board.pocketed.b.indexOf('b0') >= 0 && opp.place.length === 1 && opp.place[0].c === 'w' && opp.nextTurn === 1, 'foul: striker with an opponent man → theirs counts, you owe a due, turn passes (74)');

  const forgo = C.newGame(two(), { breaker: 0 });
  stroke(forgo, []);
  stroke(forgo, []);
  stroke(forgo, ['w0']);
  stroke(forgo, ['S']);
  assert(C.forgo(forgo, 1).ok && forgo.phase === 'shot' && forgo.turn === 1 && forgo.board.pieces.every((p) => p.id !== 'w0'), 'due: the placer may forgo it in full (80)');

  const late = C.newGame(two(), { breaker: 0 });
  stroke(late, []);
  stroke(late, []);
  stroke(late, ['S']);
  assert(late.board.due.w === 1, 'due owed with nothing pocketed yet');
  stroke(late, []);
  stroke(late, ['w3']);
  assert(late.place.length === 1 && late.place[0].c === 'w' && late.board.due.w === 0, 'outstanding due is taken as soon as a man is pocketed (72c)');

  const t = C.newGame(two(), { breaker: 0 });
  stroke(t, []);
  stroke(t, []);
  stroke(t, ['w0']);
  const out = C.timeoutFoul(t, 0);
  assert(out.ok && t.place.length === 1 && t.place[0].seat === 1 && t.nextTurn === 1, 'shot clock (Law 50) → foul: one man due, turn passes (64)');
  const tb = C.newGame(two(), { breaker: 0 });
  C.timeoutFoul(tb, 0);
  assert(tb.turn === 1 && tb.place.length === 0, 'shot clock on the break: the break passes, no penalty');
}

// Finishing (Laws 102–112): opponent's last man, last own man, board scoring, Queen threshold, cap.
{
  const st = C.newGame(two(), { breaker: 0 });
  prePocket(st, range('b', 0, 7));
  prePocket(st, ['w0', 'w1']);
  st.turn = 0;
  stroke(st, ['b8']);
  const last = st.boards[0];
  assert(st.phase === 'boardOver' && last.winner === 1 && last.pts === 7 + 3, 'opponent’s last man loses the board: your men left + Queen (103/106)');

  const lq = C.newGame(two(), { breaker: 0 });
  prePocket(lq, range('w', 0, 7));
  lq.turn = 0;
  stroke(lq, ['w8']);
  assert(lq.boards[0].winner === 1 && lq.boards[0].pts === 3, 'last own man with the Queen still on the board loses the board (107/108)');

  const win = C.newGame(two(), { breaker: 0 });
  prePocket(win, range('w', 0, 7));
  prePocket(win, ['b0', 'b1', 'b2']);
  win.board.pieces = win.board.pieces.filter((p) => p.id !== 'q');
  win.board.pocketed.q = ['q'];
  win.board.queen = { s: 'covered', by: 0 };
  win.turn = 0;
  stroke(win, ['w8']);
  assert(win.boards[0].winner === 0 && win.boards[0].pts === 6 + 3, 'board win: one point per opponent man left + 3 for your covered Queen (52)');

  const hi = C.newGame(two(), { breaker: 0 });
  hi.scores = [22, 0];
  prePocket(hi, range('w', 0, 7));
  prePocket(hi, ['b0', 'b1', 'b2']);
  hi.board.pieces = hi.board.pieces.filter((p) => p.id !== 'q');
  hi.board.pocketed.q = ['q'];
  hi.board.queen = { s: 'covered', by: 0 };
  hi.turn = 0;
  stroke(hi, ['w8']);
  assert(hi.over && hi.scores[0] === 28 && hi.result === 'points', 'Queen worth nothing from 22 points (54), and 25+ wins the game (56)');
  const at21 = C.newGame(two(), { breaker: 0 });
  at21.scores = [21, 0];
  assert(C.queenValue(at21, 0) === 3 && C.queenValue(Object.assign(at21, { scores: [22, 0] }), 0) === 0, 'Queen threshold: 3 up to and including 21');

  const cap = C.newGame(two(), { breaker: 0 });
  prePocket(cap, range('b', 0, 7));
  cap.turn = 0;
  stroke(cap, ['b8', 'S']);
  assert(cap.boards[0].pts === 12, 'a board is worth at most 12 (55)');

  const eight = C.newGame(two(), { breaker: 0 });
  eight.boards = Array.from({ length: 7 }, (_, i) => ({ no: i + 1, winner: 0, pts: 1, why: 'x', queen: null }));
  eight.scores = [10, 5];
  prePocket(eight, range('b', 0, 7));
  prePocket(eight, range('w', 0, 6));
  eight.board.no = 8;
  eight.turn = 0;
  stroke(eight, ['b8']);
  assert(eight.phase === 'boardOver' && eight.extra && eight.scores[0] === eight.scores[1], 'level after 8 boards → one extra board (56b)');
  C.nextBoard(eight, seeded(9));
  assert(eight.board.no === 9 && /extra board/i.test(eight.note), 'extra board: toss for the break');
  const lead = C.newGame(two(), { breaker: 0 });
  lead.boards = Array.from({ length: 7 }, (_, i) => ({ no: i + 1, winner: 0, pts: 1, why: 'x', queen: null }));
  lead.scores = [12, 5];
  prePocket(lead, range('b', 0, 7));
  prePocket(lead, range('w', 0, 5));
  lead.turn = 0;
  stroke(lead, ['b8']);
  assert(lead.over && lead.winner === 0 && lead.result === 'boards', 'after 8 boards the leader wins (56)');

  const quick = C.newGame(two(), { variant: 'quick', breaker: 0 });
  prePocket(quick, range('w', 0, 7));
  quick.board.pieces = quick.board.pieces.filter((p) => p.id !== 'q');
  quick.board.queen = { s: 'covered', by: 0 };
  quick.turn = 0;
  stroke(quick, ['w8']);
  assert(quick.over && quick.winner === 0 && quick.result === 'board', 'Quick: one board decides the game');
}

// Doubles (Law 49, 78b): partners opposite, turns to the right, dues by the player on the right.
{
  const st = C.newGame(four(), { breaker: 0 });
  assert(st.seats.map((s) => s.side).join() === '0,1,2,3' && st.seats.map((s) => s.team).join() === '0,1,0,1', 'doubles: partners sit opposite (S+N vs E+W)');
  const order = [st.turn];
  stroke(st, []);
  for (let i = 0; i < 4; i++) {
    order.push(st.turn);
    stroke(st, []);
  }
  assert(order.join() === '0,1,2,3,0', 'doubles: turn passes to the right');
  st.turn = 2;
  prePocket(st, ['w0']);
  stroke(st, ['S']);
  assert(st.place[0].seat === 3 && st.nextTurn === 3, 'doubles: a due is placed by the player on the shooter’s right');
  const brk = C.newGame(four(), { breaker: 0 });
  prePocket(brk, range('b', 0, 7));
  brk.turn = 0;
  stroke(brk, ['b8']);
  C.nextBoard(brk, seeded(1));
  assert(brk.board.breaker === 1 && brk.turn === 1, 'doubles: the break moves to the right each board');
}

// Freestyle (casual house variant).
{
  const st = C.newGame(two(), { variant: 'freestyle', breaker: 0 });
  stroke(st, ['w0']);
  assert(st.scores[0] === 20 && st.turn === 0, 'Freestyle: white 20, any man continues');
  stroke(st, ['b0']);
  assert(st.scores[0] === 30, 'Freestyle: black 10');
  stroke(st, ['q']);
  stroke(st, ['b1']);
  assert(st.scores[0] === 90, 'Freestyle: covered Queen 50');
  stroke(st, []);
  stroke(st, ['S']);
  assert(st.phase === 'place' || st.scores[1] === 0, 'Freestyle: striker foul returns a man');
  const big = C.newGame(two(), { variant: 'freestyle', breaker: 0 });
  stroke(big, range('w', 0, 7));
  assert(big.over && big.winner === 0, 'Freestyle: first to 160 wins');
}

// Copy: a signed-out player is "You" — "You pocket … You win", never "You pockets … You wins".
{
  const st = C.newGame([{ id: 'p0', name: 'You' }, { id: 'bot', name: 'Bot · Easy', bot: true }], { breaker: 0 });
  prePocket(st, range('w', 0, 7));
  st.board.pieces = st.board.pieces.filter((p) => p.id !== 'q');
  st.board.queen = { s: 'covered', by: 0 };
  st.turn = 0;
  stroke(st, ['w8']);
  assert(/You pocket their last man/.test(st.note) && /You win the board/.test(st.note) && !/You (pockets|wins)/.test(st.note), 'copy: "You" takes the plain verb');
}

// Forfeit (ICF XVII): leaving loses the match.
{
  const st = C.newGame(four(), { breaker: 0 });
  C.forfeit(st, 1, 'left');
  assert(st.over && st.winner === 0 && st.result === 'left', 'forfeit: the whole team loses');
}

// ======================================================================= physics

/** w2 sits 110 mm off the top-left pocket; w1 lies behind it on the pocket line. */
function comboLayout() {
  const R = P.STRIKER_R + P.MAN_R;
  const p0 = P.POCKETS[0];
  const d0 = Math.hypot(p0[0] - 110, p0[1] - 110);
  const gx = 110 - ((p0[0] - 110) / d0) * R;
  const gy = 110 - ((p0[1] - 110) / d0) * R;
  const d = Math.hypot(gx - 110, gy - 110);
  const ux = (110 - gx) / d;
  const uy = (110 - gy) / d;
  return [man('w1', 110 - ux * 2 * P.MAN_R - ux * 40, 110 - uy * 2 * P.MAN_R - uy * 40), man('w2', 110, 110)];
}

const FIXTURES = [
  { name: 'break at full power', pieces: () => C.formation(0), side: 0, input: { x: 0, angle: 0, power: 1000 }, fp: '5c545f6f', check: (r) => r.touched && r.pieces.length + r.pocketed.filter((p) => p.c !== 's').length === 19 },
  { name: 'soft roll on an empty board stops at v²/2a', pieces: () => [], side: 0, input: { x: 0, angle: 0, power: 250 }, fp: 'cd3c4853', check: (r) => Math.abs((62260 - r.striker.y) / 100 - Math.pow(P.K.vMin + (P.K.vMax - P.K.vMin) * 0.25, 2) / (2 * P.K.frictionStriker)) < 3 },
  { name: 'full power runs ~3.5 lengths (3 cushions)', pieces: () => [], side: 0, input: { x: 0, angle: 0, power: 1000 }, fp: 'e4065a75', check: (r) => r.cushions === 3 },
  { name: 'straight pot', pieces: () => [man('w1', 120, 120)], side: 0, input: { x: -1500, angle: -884, power: 650 }, fp: 'dee56620', check: (r) => r.pocketed.some((p) => p.id === 'w1' && p.pocket === 0) },
  { name: 'cut to the right corner', pieces: () => [man('b1', 600, 150)], side: 0, input: { x: 1200, angle: 1083, power: 700 }, fp: 'e8a3ef16', check: (r) => r.pocketed.some((p) => p.id === 'b1' && p.pocket === 1) },
  { name: 'combination (man into man)', pieces: comboLayout, side: 0, input: { x: -800, angle: -1334, power: 900 }, fp: 'eeb39dbf', check: (r) => r.pocketed.some((p) => p.id === 'w2' && p.pocket === 0) && !r.pocketed.some((p) => p.id === 'w1') },
  { name: 'bank off the cushion first', pieces: () => [man('w3', 200, 110)], side: 0, input: { x: 0, angle: -1410, power: 1000 }, fp: 'ce5e4376', check: (r) => r.pocketed.some((p) => p.id === 'w3' && p.pocket === 3) },
  { name: 'rebound pot from the north', pieces: () => [man('w3', 560, 90)], side: 2, input: { x: 0, angle: -2260, power: 900 }, fp: 'e99c28f5', check: (r) => r.pocketed.some((p) => p.id === 'w3' && p.pocket === 2) },
  { name: 'striker straight into a pocket', pieces: () => [], side: 1, input: { x: 0, angle: -10530, power: 450 }, fp: '26e7a3e1', check: (r) => r.pocketed.length === 1 && r.pocketed[0].id === 'S' && !r.striker },
  { name: 'head-on: heavy striker sends the man further', pieces: () => [man('b2', 370, 400)], side: 0, input: { x: 0, angle: 0, power: 300 }, fp: '833da7e5', check: (r) => r.pieces[0].y < r.striker.y - 20000 },
  { name: 'two men in line: the front one leaves', pieces: () => [man('w4', 370, 420), man('w5', 370, 420 - 2 * P.MAN_R)], side: 0, input: { x: 0, angle: 0, power: 400 }, fp: '3cb06887', check: (r) => r.pieces.find((p) => p.id === 'w5').y < r.pieces.find((p) => p.id === 'w4').y - 15000 },
  { name: 'full-power pot rattles in', pieces: () => [man('w6', 80, 80)], side: 0, input: { x: -1200, angle: -1559, power: 1000 }, fp: 'ae3385ca', check: (r) => r.pocketed.some((p) => p.id === 'w6') },
  { name: 'dying roll drops at the mouth', pieces: () => [man('b3', 70, 70)], side: 0, input: { x: -1500, angle: -1326, power: 340 }, fp: '76eada52', check: (r) => r.pocketed.some((p) => p.id === 'b3') },
  { name: 'west-side break', pieces: () => C.formation(3), side: 3, input: { x: 150, angle: -300, power: 900 }, fp: '039bce92', check: (r) => r.touched },
].filter((f) => f.input);
{
  FIXTURES.forEach((f) => {
    const r = P.simulate(f.pieces(), P.strikerFromInput(f.side, f.input));
    assert(P.fingerprint(r) === f.fp && (!f.check || f.check(r)), 'fixture: ' + f.name + ' (' + P.fingerprint(r) + ')');
  });
  assert(FIXTURES.length >= 10 && FIXTURES.length <= 15, 'physics: 10–15 fixture shots (' + FIXTURES.length + ')');
  const slow = P.simulate([man('b3', 70, 70)], P.strikerFromInput(0, { x: -1500, angle: -1326, power: 300 }));
  assert(!slow.pocketed.some((p) => p.id === 'b3'), 'fixture: a softer roll does not drop');

  // 100 identical replays.
  const F = C.formation(0);
  const inp = { x: 420, angle: 170, power: 930 };
  const fps = new Set();
  for (let i = 0; i < 100; i++) fps.add(P.fingerprint(P.simulate(clone(F), P.strikerFromInput(0, inp))));
  assert(fps.size === 1, 'determinism: 100 identical replays give one result');

  // Client/server parity: load the browser copies (UMD → window) in a fresh VM and compare.
  const sandbox = { self: {}, Math, JSON, Number, Array, Float64Array, Uint8Array, Int8Array, Object, isFinite };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('public/src/js/games/carrom-physics.js'), sandbox);
  vm.runInContext(read('public/src/js/games/carrom-core.js'), sandbox);
  const BP = sandbox.CarromPhysics;
  const BC = sandbox.CarromCore;
  const same = FIXTURES.every((f) => BP.fingerprint(BP.simulate(f.pieces(), BP.strikerFromInput(f.side, f.input))) === f.fp);
  assert(!!BP && !!BC && same, 'parity: the browser module gives the same fingerprints as the server');
  const g1 = C.newGame(two(), { breaker: 0 });
  const g2 = BC.newGame(two(), { breaker: 0 });
  const rngA = seeded(5);
  const rngB = seeded(5);
  let parity = true;
  for (let i = 0; i < 25 && !g1.over; i++) {
    if (g1.phase === 'boardOver') {
      C.nextBoard(g1, rngA);
      BC.nextBoard(g2, rngB);
      continue;
    }
    if (g1.phase === 'place') {
      C.forgo(g1, g1.place[0].seat);
      BC.forgo(g2, g2.place[0].seat);
      continue;
    }
    const a = C.botShot(g1, g1.turn, 'hard', rngA);
    const b = BC.botShot(g2, g2.turn, 'hard', rngB);
    C.shoot(g1, g1.turn, a);
    BC.shoot(g2, g2.turn, b);
    if (JSON.stringify(g1.board) !== JSON.stringify(g2.board) || JSON.stringify(a) !== JSON.stringify(b)) parity = false;
  }
  assert(parity, 'parity: 25 bot strokes give identical boards on client and server cores');
}

// ======================================================================= bots

{
  const levels = ['easy', 'normal', 'hard'];
  let legal = true;
  let shots = 0;
  const rng = seeded(11);
  levels.forEach((lvl) => {
    const st = C.newGame([{ id: 'x', name: 'X', bot: true, level: lvl }, { id: 'y', name: 'Y', bot: true, level: lvl }], { breaker: 0 });
    for (let i = 0; i < 40 && !st.over; i++) {
      if (st.phase === 'boardOver') {
        C.nextBoard(st, rng);
        continue;
      }
      if (st.phase === 'place') {
        const s = C.botPlace(st, rng);
        const out = s ? C.placeMan(st, st.place[0].seat, s.x, s.y) : C.forgo(st, st.place[0].seat);
        if (out.error) legal = false;
        continue;
      }
      const seat = st.turn;
      const inp = C.botShot(st, seat, lvl, rng);
      if (!C.strikerSpot(st.board.pieces, st.seats[seat].side, inp.x).ok) legal = false;
      const out = C.shoot(st, seat, inp);
      if (out.error) legal = false;
      shots++;
    }
  });
  assert(legal && shots > 60, 'bots: every shot and due placement is legal (' + shots + ' shots)');
  const noAi = !/fetch\(|anthropic|AI_FEATURES|callModel/i.test(read('public/src/js/games/carrom-core.js'));
  assert(noAi, 'bots: deterministic search, no AI calls');
  // Hard beats Easy over a short series (search + less aim noise).
  let hard = 0;
  for (let g = 0; g < 2; g++) {
    const r = seeded(100 + g);
    const st = C.newGame([{ id: 'h', name: 'H', bot: true, level: 'hard' }, { id: 'e', name: 'E', bot: true, level: 'easy' }], { variant: 'quick', breaker: g % 2 });
    for (let i = 0; i < 400 && !st.over; i++) {
      if (st.phase === 'place') {
        const s = C.botPlace(st, r);
        if (s) C.placeMan(st, st.place[0].seat, s.x, s.y);
        else C.forgo(st, st.place[0].seat);
        continue;
      }
      C.shoot(st, st.turn, C.botShot(st, st.turn, st.seats[st.turn].level, r));
    }
    if (st.over && st.winner === 0) hard++;
  }
  assert(hard >= 1, 'bots: Hard wins against Easy');
  const src = read('public/src/js/games/carrom-ui.js');
  assert(/tr\('bot', 'Bot'\)/.test(src) && /botName|Bot ' \+/.test(read('server-lib/carrom-engine.js')), 'bots are labelled "Bot"');
  assert(/hint: practice \|\| vsBot/.test(src) && /hint: false/.test(src), 'shot hint only in Practice / vs AI, never in Live');
  assert(/preview: practice \? 'full' : 'first'/.test(src) && /live: true,[\s\S]{0,200}preview: 'first'/.test(src), 'full rebound preview only in Practice; Live shows first contact');
}

// ======================================================================= Live rooms

/** RTDB round trip: empty arrays/objects and nulls disappear. */
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
const A = 'a'.repeat(28);
const B = 'b'.repeat(28);
const Cc = 'c'.repeat(28);
const D = 'd'.repeat(28);

function drive(room, now, humans, maxOps, rng) {
  const R = rng || seeded(21);
  let t = now;
  let ops = 0;
  const seen = { queen: false, foul: false, place: false };
  while (ops++ < maxOps) {
    const st = room.server.pub;
    if (st.over) break;
    if (st.board.queen.s === 'covered') seen.queen = true;
    const actor = st.phase === 'place' ? st.place[0].seat : st.phase === 'shot' ? st.turn : -1;
    const seat = actor >= 0 ? st.seats[actor] : null;
    t += 50;
    if (!seat || seat.bot || humans.indexOf(seat.id) < 0) {
      t = Math.max(t, (room.pub.deadline || t) + 1);
      room = PD.reduceRoom(rt(room), humans[0], 'tick', {}, t).room;
      continue;
    }
    if (st.phase === 'place') {
      seen.place = true;
      const s = C.botPlace(st, R);
      room = PD.reduceRoom(rt(room), seat.id, s ? 'place' : 'forgo', s || {}, t).room;
      continue;
    }
    const inp = C.botShot(st, actor, 'hard', R);
    const before = room.server.pub.shotNo;
    room = PD.reduceRoom(rt(room), seat.id, 'shot', inp, t).room;
    const e = room.server.pub.log[room.server.pub.log.length - 1];
    if (room.server.pub.shotNo === before + 1 && e.pocketed.indexOf('s') >= 0) seen.foul = true;
  }
  return { room, now: t, seen };
}

{
  const now = 1.7e12;
  let room = PD.newRoom({ game: 'carrom', uid: A, name: 'Asha', settings: { variant: 'icf', stake: 25 }, now });
  room = PD.reduceRoom(rt(room), B, 'join', { name: 'Ben' }, now).room;
  let threw = null;
  try {
    PD.reduceRoom(rt(room), Cc, 'join', { name: 'Cy' }, now);
  } catch (e) {
    threw = e.code;
  }
  assert(threw === 'room_full', 'singles room seats two');
  room = PD.reduceRoom(rt(room), A, 'start', {}, now).room;
  const st = room.server.pub;
  assert(room.pub.status === 'playing' && st.seats.length === 2 && room.pub.state && room.pub.deadline === now + Policy.policyFor('carrom').turnMs, 'Live singles starts with a 20s shot clock');
  assert(/won the toss/.test(st.note), 'Live: a toss decides the break');
  const shooter = st.seats[st.turn].id;
  const notShooter = st.seats[1 - st.turn].id;
  let code = null;
  try {
    PD.reduceRoom(rt(room), notShooter, 'shot', { x: 0, angle: 0, power: 500 }, now + 10);
  } catch (e) {
    code = e.code;
  }
  assert(code === 'not_your_turn', 'server rejects a shot out of turn');
  code = null;
  try {
    PD.reduceRoom(rt(room), shooter, 'shot', { x: 2000, angle: 0, power: 500 }, now + 10);
  } catch (e) {
    code = e.code;
  }
  assert(code === 'illegal_position', 'server rejects an illegal striker placement');
  code = null;
  try {
    PD.reduceRoom(rt(room), shooter, 'shot', { x: 0, angle: 0, power: 5000 }, now + 10);
  } catch (e) {
    code = e.code;
  }
  assert(code === 'bad_shot', 'server rejects an out-of-range shot');

  // The server's stroke = the client's replay of the same input from the same pieces.
  const pre = clone(room.server.pub.board.pieces);
  const inp = { x: 0, angle: 40, power: 1000 };
  const side = room.server.pub.seats[room.server.pub.turn].side;
  room = PD.reduceRoom(rt(room), shooter, 'shot', inp, now + 20).room;
  const entry = room.pub.state.log[room.pub.state.log.length - 1];
  const client = P.simulate(entry.before, P.strikerFromInput(entry.side, entry.input));
  const server = P.simulate(pre, P.strikerFromInput(side, inp));
  assert(JSON.stringify(entry.before) === JSON.stringify(pre) && P.fingerprint(client) === P.fingerprint(server), 'Live: the published stroke replays bit-for-bit on the client');
  assert(room.pub.deadline >= now + 20 + Policy.policyFor('carrom').turnMs, 'Live: the next shot clock waits for the animation');

  // Reconnect: a cold read of the room restores the exact board.
  const cold = Engine.createCarromAdapter({ err: (c) => new Error(c) }).core.hydrate(rtdb(clone(room.pub.state)));
  assert(JSON.stringify(cold.board.pieces) === JSON.stringify(room.pub.state.board.pieces) && cold.turn === room.pub.state.turn && cold.phase === room.pub.state.phase, 'reconnect: state restores from the room after RTDB drops empties');

  const out = drive(room, now + 100, [A, B], 3000);
  room = out.room;
  const fin = room.server.pub;
  assert(fin.over && fin.scores[fin.winner] >= 25 || (fin.over && fin.boards.length >= 8), 'Live singles plays a full game to 25 (or 8 boards) on the server');
  assert(out.seen.queen && out.seen.foul && out.seen.place, 'Live singles game included a Queen cover, a striker foul and a due placed by the opponent');
  const req = room.server.settleReq;
  assert(req && req.kind === 'h2h' && req.rated === true && req.stake === 25 && /^carrom_/.test(req.matchId) && (req.result === 'win' || req.result === 'loss'), 'Live singles settles rated head-to-head with the stake');
}

// AFK: three missed shot clocks forfeit; leaving forfeits.
{
  const now = 1.8e12;
  let room = PD.newRoom({ game: 'carrom', uid: A, name: 'Asha', settings: {}, now });
  room = PD.reduceRoom(rt(room), B, 'join', { name: 'Ben' }, now).room;
  room = PD.reduceRoom(rt(room), A, 'start', {}, now).room;
  let t = now;
  let fouls = 0;
  for (let i = 0; i < 30 && !room.server.pub.over; i++) {
    t = room.pub.deadline + 1;
    const before = room.server.pub.note;
    room = PD.reduceRoom(rt(room), A, 'tick', {}, t).room;
    if (/ran out of time/.test(room.server.pub.note) && room.server.pub.note !== before) fouls++;
  }
  const st = room.server.pub;
  assert(st.over && st.result === 'afk' && fouls >= 2, 'AFK: missed shot clocks are fouls, the third in a row forfeits');
  assert(room.server.settleReq && room.server.settleReq.kind === 'h2h', 'AFK forfeit settles');

  let r2 = PD.newRoom({ game: 'carrom', uid: A, name: 'Asha', settings: { variant: 'quick' }, now });
  r2 = PD.reduceRoom(rt(r2), B, 'join', { name: 'Ben' }, now).room;
  r2 = PD.reduceRoom(rt(r2), A, 'start', {}, now).room;
  r2 = PD.reduceRoom(rt(r2), B, 'leave', {}, now + 5).room;
  const s2 = r2.server.pub;
  assert(s2.over && s2.result === 'left' && s2.seats[s2.winner === 0 ? 0 : 1] && r2.server.settleReq.result === (s2.seats[0].id === A ? 'win' : 'loss'), 'leaving forfeits the game (ICF XVII)');

  let r3 = PD.newRoom({ game: 'carrom', uid: A, name: 'Asha', settings: { variant: 'freestyle', stake: 10 }, now });
  r3 = PD.reduceRoom(rt(r3), B, 'join', { name: 'Ben' }, now).room;
  r3 = PD.reduceRoom(rt(r3), A, 'start', {}, now).room;
  r3 = PD.reduceRoom(rt(r3), A, 'resign', {}, now + 5).room;
  assert(r3.server.settleReq.rated === false && r3.server.settleReq.stake === 10, 'Freestyle Live is unrated (stake allowed)');
}

// Doubles: 2 humans + 2 bots, bots paced by the server clock, one Quick board to the end.
{
  const now = 1.9e12;
  let room = PD.newRoom({ game: 'carrom', uid: A, name: 'Asha', settings: { mode: 'doubles', variant: 'quick', pair: 1, botLevel: 'normal', stake: 50 }, now });
  room = PD.reduceRoom(rt(room), B, 'join', { name: 'Ben' }, now).room;
  room = PD.reduceRoom(rt(room), A, 'start', {}, now).room;
  const st = room.server.pub;
  assert(st.seats.length === 4 && st.seats[0].id === A && st.seats[1].id === B && st.seats[2].bot && st.seats[3].bot, 'doubles: host picks an opponent; bots fill the empty seats');
  assert(st.seats[0].team === st.seats[2].team && st.seats[1].team === st.seats[3].team, 'doubles: partners opposite');
  const out = drive(room, now + 10, [A, B], 4000, seeded(31));
  room = out.room;
  const fin = room.server.pub;
  assert(fin.over && fin.boards.length === 1, 'Live doubles board plays to the end (bots on the server clock)');
  const req = room.server.settleReq;
  assert(req && !req.kind && req.stake === 0 && req.teams && req.ranking.length === 2, 'doubles with bots settles as a friendly team placement');

  let full = PD.newRoom({ game: 'carrom', uid: A, name: 'A', settings: { mode: 'doubles', stake: 25 }, now });
  [B, Cc, D].forEach((u) => (full = PD.reduceRoom(rt(full), u, 'join', { name: u.charAt(0) }, now).room));
  full = PD.reduceRoom(rt(full), A, 'start', {}, now).room;
  full = PD.reduceRoom(rt(full), Cc, 'leave', {}, now + 5).room;
  const fq = full.server.settleReq;
  const cTeam = full.server.pub.seats.find((s) => s.id === Cc).team;
  assert(full.server.pub.over && full.server.pub.winner === 1 - cTeam && fq.stake === 25 && fq.teams.winners.length === 2 && fq.forfeits[0] === Cc, 'doubles: a leaver forfeits for the team; 4 humans settle the stake by team');
}

// Settlement through settleRoom (h2h rated + stake) with an in-memory Firestore + RTDB.
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
          if (next === null) delete store[p];
          else store[p] = clone(rtdb(next) === undefined ? next : next);
          return { committed: true };
        },
        async set(v) {
          store[p] = clone(v);
        },
      };
    },
  };
}

(async () => {
  const econ = require(path.join(root, 'server-lib/dangal-economy.js'));
  assert(econ.SERVER_SETTLED.has('carrom'), 'Carrom Live is server-settled only (clients cannot self-report)');
  const db = memDb();
  for (const id of [A, B]) {
    for (const k of ['first_game', 'first_win', 'won_stake']) await db.collection('users').doc(id).collection('achievements').doc(k).set({ key: k });
    await db.collection('users').doc(id).collection('wallet').doc('chips').set({ balance: 1000, lifetimeEarned: 1000 });
  }
  const r = fakeRtdb();
  const pathKey = 'games/carrom/ABCDEF';
  const now = 2e12;
  let room = PD.newRoom({ game: 'carrom', uid: A, name: 'Asha', settings: { variant: 'quick', stake: 50 }, now });
  room = PD.reduceRoom(rt(room), B, 'join', { name: 'Ben' }, now).room;
  room = PD.reduceRoom(rt(room), A, 'start', {}, now).room;
  room = PD.reduceRoom(rt(room), B, 'resign', {}, now + 1).room;
  r.store[pathKey] = clone(room);
  const req = clone(room.server.settleReq);
  const out = await PD.settleRoom({ database: () => r }, r, pathKey, req, { economy: econ, db, admin: db.admin });
  const bal = (u) => (db.store.get('users/' + u + '/wallet/chips') || {}).balance;  assert(out.status === 'done' && out.results[A].chipDelta > 0 && out.results[B].chipDelta < 0 && bal(B) === 950, 'settlement: the loser pays the stake (virtual chips)');
  const aStats = db.store.get('users/' + A + '/gameStats/carrom');
  assert(aStats && aStats.rating && out.results[A].eloDelta > 0, 'settlement: rated — the winner’s Carrom rating moves');
  const again = await PD.settleRoom({ database: () => r }, r, pathKey, req, { economy: econ, db, admin: db.admin });
  assert(bal(B) === 950 && again.status === 'done', 'settlement is idempotent by match id');
  const claim = await econ.resolveGame(db, db.admin, A, { gameType: 'carrom', result: 'win', won: true, opponentUid: B, stake: 100, matchId: 'x1' });
  assert(claim.serverSettled && bal(B) === 950, 'a client-reported Carrom win is ignored');

  // Quick match through party_room.
  const q = fakeRtdb();
  const app = { database: () => q, firestore: () => db };
  const a1 = await PD.partyRoom(app, A, { op: 'quick', game: 'carrom', mode: 'singles', name: 'Asha' });
  const b1 = await PD.partyRoom(app, B, { op: 'quick', game: 'carrom', mode: 'singles', name: 'Ben' });
  assert(a1.waiting && a1.host && b1.matched && b1.code === a1.code, 'quick match: the second player joins the first player’s room');
  const qs = q.store['games/carrom/' + a1.code];
  assert(qs && qs.pub.settings.quick && /_mm_/.test('carrom_mm_') && !q.store['carromQueue/singles'], 'quick match: the slot clears once paired');
  const d1 = await PD.partyRoom(app, A, { op: 'quick', game: 'carrom', mode: 'doubles', name: 'A' });
  const d2 = await PD.partyRoom(app, B, { op: 'quick', game: 'carrom', mode: 'doubles', name: 'B' });
  assert(q.store['carromQueue/doubles'] && d2.code === d1.code, 'quick doubles: the slot stays open until four');
  const d3 = await PD.partyRoom(app, Cc, { op: 'quick', game: 'carrom', mode: 'doubles', name: 'C' });
  const d4 = await PD.partyRoom(app, D, { op: 'quick', game: 'carrom', mode: 'doubles', name: 'D' });
  assert(d3.code === d1.code && d4.code === d1.code && !q.store['carromQueue/doubles'], 'quick doubles: four players share one room, then the slot clears');
  await PD.partyRoom(app, A, { op: 'quick_cancel', game: 'carrom', mode: 'singles' });
  assert(!q.store['carromQueue/singles'], 'quick match: cancel clears your slot');
  const mm = Engine.createCarromAdapter({ err: (c) => new Error(c) });
  const mroom = { pub: { host: A, createdAt: 1, players: { [A]: { name: 'A' }, [B]: { name: 'B' } }, settings: { quick: true } } };
  mm.deal(mroom, [A, B], { rng: seeded(1), roundNo: 1, now: 1 });
  assert(/^carrom_mm_/.test(mroom.server.matchId), 'matchmade games carry an _mm_ match id');

  // ======================================================================= wiring
  const html = read('public/index.html');
  assert(/data-party-lazy src="\/src\/js\/games\/carrom-physics\.js/.test(html) && /data-party-lazy src="\/src\/js\/games\/carrom-core\.js/.test(html) && /src="\/src\/js\/games\/carrom-ui\.js/.test(html), 'index.html loads carrom physics + core (lazy) and carrom-ui');
  assert(/carrom: \['games\/carrom-physics\.js', 'games\/carrom-core\.js'\]/.test(read('public/src/js/games/party-kit.js')), 'party-kit lazy data for carrom');
  const pc = read('public/src/js/games/party-classics.js');
  assert(!/\{ id: 'carrom', name:/.test(pc) && !/window\.openCarrom = openCarrom/.test(pc), 'old party-classics Carrom no longer registered');
  const ui = read('public/src/js/games/carrom-ui.js');
  assert(/id: 'carrom'/.test(ui) && /ratingKey: 'carrom'/.test(ui) && /registerPartyGame\(GAME/.test(ui) && /window\.openCarrom/.test(ui), 'carrom-ui registers the game, the party room and window.openCarrom');
  assert(/t\('carrom\.' \+ key/.test(ui), 'copy goes through i18n (carrom.*)');
  const Rules = require(path.join(root, 'public/src/js/dangal/dangal-rules.js'));
  const cr = Rules.get ? Rules.get('carrom') : null;
  assert(cr && cr.ruleset.source === 'Rules based on the ICF Laws of Carrom' && !cr.ruleset.simplified && cr.variants.some((v) => v.key === 'variant'), 'Rules sheet: ICF attribution, variants, full rulebook');
  assert(!/official|ICF logo/i.test(JSON.stringify(cr)), 'Rules sheet: no “official” claim');
  assert(/Rules based on the ICF Laws of Carrom/.test(read('public/src/js/dangal/design-system.js')), 'design-system source string matches');
  const pol = Policy.policyFor('carrom');
  assert(pol.turnMs === 20000 && pol.afk.maxMisses === 3 && pol.leave === 'forfeit', 'Live policy: 20s shot clock, 3 misses forfeit, leave forfeits');
  const rules = JSON.parse(read('firebase/database.rules.json'));
  const games = rules.rules.games || {};
  assert(games.carrom && games.carrom.$code && games.carrom.$code.server['.read'] === false, 'RTDB rules: carrom rooms (server state hidden)');
  assert(!/Wordle|skribbl/i.test(ui + read('server-lib/carrom-engine.js')), 'no banned names');
  const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
  assert(apiCount === 12, 'api/*.js = 12 (got ' + apiCount + ')');

  if (failed) {
    console.error('\n' + failed + ' failure(s)');
    process.exit(1);
  }
  console.log('\nAll Dangal P7 Carrom checks passed.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
