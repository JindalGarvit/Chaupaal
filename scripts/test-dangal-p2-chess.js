#!/usr/bin/env node
/**
 * Dangal P2 — Chess: FIDE rules core, server-authoritative Live/Daily, engine + bots,
 * game review thresholds, grounded coach, rating buckets, wiring.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let failed = 0;
let passed = 0;
function assert(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    console.error('FAIL:', msg);
  }
}
function throwsCode(fn, code) {
  try {
    fn();
  } catch (e) {
    return e && e.code === code;
  }
  return false;
}

const Core = require(path.join(root, 'public/src/js/games/chess-core.js'));
const Search = require(path.join(root, 'public/src/js/games/chess-search.js'));
const Review = require(path.join(root, 'public/src/js/games/chess-review.js'));
const Eco = require(path.join(root, 'public/src/js/games/chess-eco.js'));
const Engine = require(path.join(root, 'server-lib/chess-engine.js'));
const AI = require(path.join(root, 'server-lib/dangal-ai.js'));
const Rules = require(path.join(root, 'public/src/js/dangal/dangal-rules.js'));

// ─── 1. Move generation: perft against published counts (incl. Chess960) ───
const PERFT = [
  [Core.START_FEN, [20, 400, 8902, 197281]],
  ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
  ['bqnb1rkr/pp3ppp/3ppn2/2p5/5P2/P2P4/NPP1P1PP/BQ1BNRKR w HFhf - 2 9', [21, 528, 12189]],
  ['2nnrbkr/p1qppppp/8/1ppb4/6PP/3PP3/PPP2P2/BQNNRBKR w HEhe - 1 9', [21, 807, 18002]],
];
PERFT.forEach(([fen, counts]) => {
  const p = new Core.Position().load(fen);
  counts.forEach((n, i) => assert(p.perft(i + 1) === n, `perft ${i + 1} of ${fen.slice(0, 24)}… = ${n}`));
});

// ─── 2. Cross-check against chess.js (BSD-2-Clause, dev only) on random games ─
(function crossCheck() {
  let ChessJs;
  try {
    ChessJs = require('chess.js').Chess;
  } catch (e) {
    return;
  }
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let mismatches = 0;
  for (let game = 0; game < 25; game++) {
    const ours = new Core.Game();
    const ref = new ChessJs();
    for (let ply = 0; ply < 140; ply++) {
      const a = ours.moves().sort().join(' ');
      const b = ref.moves().sort().join(' ');
      if (a !== b) mismatches++;
      const f1 = ours.fen().split(' ').slice(0, 3).join(' ');
      const f2 = ref.fen().split(' ').slice(0, 3).join(' ');
      if (f1 !== f2) mismatches++;
      const list = ref.moves();
      if (!list.length || ref.isGameOver()) break;
      const san = list[Math.floor(rnd() * list.length)];
      ref.move(san);
      if (!ours.move(san)) mismatches++;
    }
  }
  assert(mismatches === 0, 'legal moves + FEN match chess.js across 25 random games (mismatches: ' + mismatches + ')');
})();

// ─── 3. Special moves ─────────────────────────────────────────────────────
{
  const g = new Core.Game({ fen: 'r3k2r/8/8/8/8/8/5r2/R3K2R w KQkq - 0 1' });
  const ms = g.moves();
  assert(ms.indexOf('O-O') < 0 && ms.indexOf('O-O-O') >= 0, 'cannot castle through an attacked square (f1); queenside still legal');
  const g2 = new Core.Game({ fen: 'r3k2r/8/8/8/8/8/8/R3K2r w Qkq - 0 1' });
  assert(g2.isCheck() && g2.moves().indexOf('O-O-O') < 0, 'cannot castle out of check');
  const ep = new Core.Game();
  ['e4', 'a6', 'e5', 'd5'].forEach((s) => ep.move(s));
  assert(ep.moves().indexOf('exd6') >= 0, 'en passant available right after the double step');
  ep.move('a3');
  ep.move('a5');
  assert(ep.moves().indexOf('exd6') < 0, 'en passant expires after one move');
  const pinned = new Core.Game({ fen: '8/8/8/K2pP2r/8/8/8/7k w - d6 0 1' });
  assert(pinned.moves().indexOf('exd6') < 0, 'en passant that exposes the king is illegal');
  assert(/ - 0 1$/.test(pinned.fen()), 'illegal en passant square is not part of the FEN / repetition key');
  const promo = new Core.Game({ fen: '8/P7/8/8/8/8/8/k6K w - - 0 1' });
  const n = promo.move('a8=N');
  assert(n && n.promotion === 'n' && promo.get('a8').type === 'n', 'underpromotion to a knight');
  const promo2 = new Core.Game({ fen: '8/P7/8/8/8/8/8/k6K w - - 0 1' });
  assert(promo2.move({ from: 'a7', to: 'a8', promotion: 'r' }).san === 'a8=R+', 'promotion picker object move (rook, with check)');
  const promo3 = new Core.Game({ fen: '8/P7/8/8/8/8/8/k6K w - - 0 1' });
  assert(promo3.move({ from: 'a7', to: 'a8' }).promotion === 'q', 'promotion defaults to queen only when no piece is given');
  const g3 = new Core.Game();
  assert(g3.move('e2e4') && g3.move('e7e5') && g3.move('Ng1f3'), 'accepts UCI and over-disambiguated SAN');
  const pg = new Core.Game();
  assert(pg.loadPgn('[Event "t"]\n1. e4 {comment} e5 (1... c5 2. Nf3) 2. Nf3 Nc6 3. Bb5 a6 *') && pg.history().length === 6, 'PGN import skips comments + variations');
  assert(/1\. e4 e5 2\. Nf3 Nc6 3\. Bb5 a6/.test(pg.pgn()), 'PGN export');
}

// ─── 4. Draw rules: automatic vs claimable, FIDE 6.9 ─────────────────────
{
  const st = new Core.Game({ fen: 'k7/8/1Q6/8/8/8/8/7K b - - 0 1' });
  assert(st.outcome().reason === 'stalemate', 'stalemate is an automatic draw');
  assert(new Core.Game({ fen: 'k7/8/8/8/8/8/8/6BK w - - 0 1' }).outcome().reason === 'insufficient', 'K+B v K is insufficient material');
  assert(!new Core.Game({ fen: 'k7/8/8/8/8/8/8/5NNK w - - 0 1' }).outcome(), 'K+N+N v K is not a dead position');
  assert(!new Core.Game({ fen: 'k1b5/8/8/8/8/8/8/6BK w - - 0 1' }).isInsufficientMaterial(), 'opposite-colour bishops are not a dead position');
  assert(new Core.Game({ fen: 'kb6/8/8/8/8/8/8/6BK w - - 0 1' }).isInsufficientMaterial(), 'same-colour bishops only → insufficient');

  const rep = new Core.Game();
  const cycle = ['Nf3', 'Nf6', 'Ng1', 'Ng8'];
  cycle.concat(cycle).forEach((s) => rep.move(s));
  assert(rep.repetitionCount() === 3 && rep.claimable() === 'threefold', 'threefold repetition is claimable');
  assert(rep.outcome() === null, 'threefold is NOT automatic without auto-claim');
  assert(rep.outcome({ autoClaim: true }).reason === 'threefold', 'auto-claim ends the game at threefold');
  cycle.concat(cycle).forEach((s) => rep.move(s));
  assert(rep.repetitionCount() === 5 && rep.outcome().reason === 'fivefold', 'fivefold repetition is automatic (FIDE 9.6.1)');

  const fifty = new Core.Game({ fen: '8/8/8/8/8/2k5/8/R3K3 w - - 99 80' });
  fifty.move('Ra2');
  assert(fifty.claimable() === 'fifty' && fifty.outcome() === null, '50-move rule is claimable, not automatic');
  const sf = new Core.Game({ fen: '8/8/8/8/8/2k5/8/R3K3 w - - 149 110' });
  sf.move('Ra2');
  assert(sf.outcome().reason === 'seventyfive', '75-move rule is automatic (FIDE 9.6.2)');
  const mateAt150 = new Core.Game({ fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 149 110' });
  mateAt150.move('Ra8');
  assert(mateAt150.outcome().reason === 'checkmate', 'checkmate on the 75th move beats the 75-move draw');

  const kn = new Core.Game({ fen: 'k7/8/8/8/8/8/8/6NK w - - 0 1' });
  assert(kn.timeoutOutcome('b').reason === 'timeout_insufficient', 'FIDE 6.9: flag vs lone K+N → draw');
  assert(kn.timeoutOutcome('w').reason === 'timeout_insufficient', 'FIDE 6.9: flag with lone king opponent → draw');
  const kr = new Core.Game({ fen: 'k7/8/8/8/8/8/8/6RK w - - 0 1' });
  assert(kr.timeoutOutcome('b').result === '1-0', 'flag vs K+R → loss');
  const knp = new Core.Game({ fen: 'k7/p7/8/8/8/8/8/6NK w - - 0 1' });
  assert(knp.timeoutOutcome('b').result === '1-0', 'K+N vs K+P: knight can still mate (helpmate) → loss on time');
  assert(Core.canMate(new Core.Position().load('k7/8/8/8/8/8/8/5BBK w - - 0 1').b, 'w'), 'bishop pair can mate');
}

// ─── 5. Chess960 ──────────────────────────────────────────────────────────
{
  assert(Core.chess960Fen(518) === Core.START_FEN, 'Chess960 position 518 is the standard setup');
  const seen = new Set();
  let ok = true;
  for (let i = 0; i < 960; i++) {
    const fen = Core.chess960Fen(i);
    seen.add(fen.split(' ')[0]);
    const row = fen.split('/')[7].split(' ')[0];
    const k = row.indexOf('K'), r1 = row.indexOf('R'), r2 = row.lastIndexOf('R');
    const b1 = row.indexOf('B'), b2 = row.lastIndexOf('B');
    if (!(r1 < k && k < r2) || b1 % 2 === b2 % 2) ok = false;
    const g = new Core.Game({ fen, chess960: true });
    if (g.moves().length < 16) ok = false;
  }
  assert(ok && seen.size === 960, 'all 960 start positions are distinct, king between rooks, bishops on opposite colours');
  const c = new Core.Game({ fen: 'r3k2r/8/8/8/8/8/8/1R2K1R1 w KQkq - 0 1' });
  assert(c.chess960, 'non-standard rook files switch on Chess960 castling');
  const oo = c.move({ from: 'e1', to: 'g1' });
  assert(oo && oo.san === 'O-O' && /1R3RK1 b/.test(c.fen()), '960 O-O: king to g1, rook to f1 (king onto own rook)');
  const c2 = new Core.Game({ fen: 'r3k2r/8/8/8/8/8/8/1R2K1R1 w KQkq - 0 1' });
  const blocked = new Core.Game({ fen: '1r2k1r1/8/8/8/8/8/8/1R2K1R1 w KQkq - 0 1' });
  assert(blocked.moves().indexOf('O-O') < 0, '960: cannot castle onto a square the enemy rook attacks');
  const ooo = c2.move('e1b1');
  assert(ooo && ooo.san === 'O-O-O' && /2KR2R1 b/.test(c2.fen()), '960 O-O-O via UCI king-takes-rook: king c1, rook d1');
  const c3 = new Core.Game({ fen: '6kr/8/8/8/8/8/8/6KR w Kk - 0 1' });
  const stay = c3.move({ from: 'g1', to: 'h1' });
  assert(stay && stay.san === 'O-O' && /5RK1 b k/.test(c3.fen()), '960 O-O with the king already on g1 (rook hops over)');
  c3.undo();
  assert(c3.fen() === '6kr/8/8/8/8/8/8/6KR w Kk - 0 1', '960 castling undo restores the position');
  const c4 = new Core.Game({ fen: 'rk2r3/8/8/8/8/8/8/RK2R3 w KQkq - 0 1', chess960: true });
  assert(c4.moves().indexOf('O-O-O') >= 0, '960: king b1 + rook a1 may castle queenside (king c1, rook d1)');
  const c5 = new Core.Game({ fen: 'rk2r3/8/8/8/8/8/8/RKN1R3 w KQkq - 0 1', chess960: true });
  assert(c5.moves().indexOf('O-O-O') < 0 && c5.moves().indexOf('O-O') < 0, '960: castling blocked by a piece on the king/rook path');
}

// ─── 6. Server: validation, clocks, draws, abort, rematch, seats, Daily ──
const A = 'whiteUser01', B = 'blackUser02';
const rng0 = () => 0.1;
function created(extra) {
  let t = 1000000;
  let r = Engine.reduceMatch(null, A, 'join', Object.assign({ matchId: 'ch_mm_1', opponentUid: B, name: 'Ann', tc: { minutes: 3, increment: 2 }, color: 'w', deviceId: 'devA' }, extra || {}), t, { rng: rng0 });
  let m = r.match;
  r = Engine.reduceMatch(m, B, 'join', { matchId: 'ch_mm_1', name: 'Ben', deviceId: 'devB' }, t + 10, { rng: rng0 });
  return { m: r.match, t: t + 10, r };
}
const step = (m, uid, op, args, now) => Engine.reduceMatch(JSON.parse(JSON.stringify(m)), uid, op, Object.assign({ matchId: 'ch_mm_1' }, args || {}), now, { rng: rng0 });
{
  const { m, t, r } = created();
  assert(r.result.started && m.pub.status === 'playing' && m.pub.white === A && m.pub.black === B, 'both joined → playing; host picked white');
  assert(m.pub.rated === true && m.pub.bucket === 'blitz', 'matchmaking 3+2 game is rated in the Blitz bucket');
  assert(throwsCode(() => step(m, B, 'move', { move: 'e5', deviceId: 'devB' }, t + 100), 'not_your_turn'), 'out-of-turn move rejected');
  assert(throwsCode(() => step(m, A, 'move', { move: 'e5', deviceId: 'devA' }, t + 100), 'illegal_move'), 'illegal move rejected');
  assert(throwsCode(() => step(m, A, 'move', { move: 'e4', ply: 3, deviceId: 'devA' }, t + 100), 'stale_move'), 'stale ply rejected');
  assert(throwsCode(() => step(m, A, 'move', { move: 'e4', deviceId: 'devX' }, t + 100), 'other_device'), 'a second device of the same account cannot move');
  const spect = step(m, A, 'join', { deviceId: 'devX' }, t + 200);
  assert(spect.result.role === 'spectator', 'second device joins as spectator (single seat)');

  let s = step(m, A, 'move', { move: 'e4', deviceId: 'devA' }, t + 1000).match;
  assert(s.pub.clock.w === 180000 && !s.pub.clock.running, 'no clock charge before both sides moved');
  s = step(s, B, 'move', { move: 'e5', deviceId: 'devB' }, t + 2000).match;
  assert(s.pub.clock.running && s.pub.clock.b === 180000, 'clocks start after each side’s first move');
  s = step(s, A, 'move', { move: 'Nf3', lagMs: 300, deviceId: 'devA' }, t + 5000).match;
  assert(s.pub.clock.w === 180000 - 2700 + 2000, 'server clock: elapsed − lag credit + increment (got ' + s.pub.clock.w + ')');
  s = step(s, B, 'move', { move: 'Nc6', lagMs: 99999, deviceId: 'devB' }, t + 15000).match;
  assert(s.pub.clock.b === 180000 - 9500 + 2000, 'lag credit capped at ' + Engine.MAX_LAG_MS + 'ms');
  assert(s.spec.moves.length === 1 && s.spec.delayPlies === 3, 'spectator view runs 3 plies behind');

  // Draw offers
  let d = step(s, A, 'offer_draw', {}, t + 16000).match;
  assert(d.pub.drawOffer && d.pub.drawOffer.by === A, 'draw offer recorded');
  d = step(d, A, 'move', { move: 'Bb5', deviceId: 'devA' }, t + 17000).match;
  assert(d.pub.drawOffer, 'offer stands after the offerer’s own move');
  d = step(d, B, 'move', { move: 'a6', deviceId: 'devB' }, t + 18000).match;
  assert(!d.pub.drawOffer, 'opponent moving declines the offer');
  assert(throwsCode(() => step(d, A, 'offer_draw', {}, t + 19000), 'offer_limit'), 'one draw offer per ' + Engine.DRAW_OFFER_GAP_PLIES / 2 + ' moves');
  let acc = step(d, B, 'offer_draw', {}, t + 19000).match;
  acc = step(acc, A, 'respond_draw', { accept: true }, t + 19500);
  assert(acc.match.pub.status === 'over' && acc.match.pub.reason === 'agreement' && acc.result.ended, 'accepted offer → draw by agreement');

  assert(throwsCode(() => step(s, A, 'claim_draw', {}, t + 16000), 'no_claim'), 'claiming without a claimable position is rejected');
  const flag = step(s, A, 'tick', { deviceId: 'devA' }, t + 15000 + 180000 + 5000);
  assert(flag.match.pub.status === 'over' && flag.match.pub.reason === 'timeout' && flag.match.pub.winner === B, 'flag fall → loss when the opponent can mate');
  const res = step(s, B, 'resign', {}, t + 16000).match;
  assert(res.pub.winner === A && res.pub.result === '1-0' && res.pub.reason === 'resignation', 'resignation');
}
{
  // Threefold: claim (auto-claim off) vs automatic (auto-claim on by default)
  let { m, t } = created({ autoClaim: false });
  m = step(m, B, 'settings', { autoClaim: false }, t).match;
  const cyc = ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8'];
  cyc.forEach((mv, i) => (m = step(m, i % 2 ? B : A, 'move', { move: mv }, t + 100 * (i + 1)).match));
  assert(m.pub.status === 'playing' && m.pub.claimable === 'threefold', 'threefold → Claim draw offered (auto-claim off)');
  const cl = step(m, B, 'claim_draw', {}, t + 2000).match;
  assert(cl.pub.reason === 'threefold' && cl.pub.result === '1/2-1/2', 'claimed threefold draw');
  let auto = created({ autoClaim: true }).m;
  cyc.forEach((mv, i) => (auto = step(auto, i % 2 ? B : A, 'move', { move: mv }, t + 100 * (i + 1)).match));
  assert(auto.pub.status === 'over' && auto.pub.reason === 'threefold', 'auto-claim (opted in) ends at threefold');
  let dflt = created().m;
  cyc.forEach((mv, i) => (dflt = step(dflt, i % 2 ? B : A, 'move', { move: mv }, t + 100 * (i + 1)).match));
  assert(dflt.pub.status === 'playing' && dflt.pub.claimable === 'threefold', 'default: threefold is a claim, not automatic');
}
{
  // FIDE 6.9 on the server + abort rules + first-move timeout
  let { m, t } = created();
  m.pub.startFen = 'k7/8/8/8/8/8/8/6NK b - - 0 1';
  m.pub.fen = m.pub.startFen;
  m.pub.turn = 'b';
  m.pub.ply = 2;
  m.pub.clock = { w: 5000, b: 1000, at: t, running: true };
  const r = step(m, A, 'tick', {}, t + 2000);
  assert(r.match.pub.status === 'over' && r.match.pub.reason === 'timeout_insufficient' && r.match.pub.result === '1/2-1/2', 'server: flag vs lone knight → draw (FIDE 6.9)');

  const fresh = created().m;
  const ab = step(fresh, A, 'abort', {}, t + 100);
  assert(ab.match.pub.status === 'aborted' && ab.result.aborted, 'white may abort before the first move');
  const one = step(fresh, A, 'move', { move: 'e4' }, t + 100).match;
  assert(throwsCode(() => step(one, A, 'abort', {}, t + 200), 'cannot_abort'), 'white cannot abort after moving');
  assert(step(one, B, 'abort', {}, t + 200).match.pub.status === 'aborted', 'black may abort before their first move');
  const late = step(fresh, B, 'tick', {}, t + Engine.FIRST_MOVE_MS + 50).match;
  assert(late.pub.status === 'aborted' && late.pub.reason === 'no_first_move', 'no first move in time → aborted (unrated)');
}
{
  // Rematch swaps colours; settlement uses the bucket; unrated friend games stay unrated
  let { m, t } = created();
  m = step(m, B, 'resign', {}, t + 100).match;
  let rm = step(m, A, 'rematch', {}, t + 200);
  assert(rm.result.waiting, 'rematch waits for both');
  rm = step(rm.match, B, 'rematch', {}, t + 300);
  const next = rm.result.createNext;
  assert(next && next.colorA === 'b' && next.tc.base === 180000 && next.tc.inc === 2000, 'rematch: colours swap, same time control');
  const nm = Engine.newMatch(Object.assign({ now: t, rng: rng0 }, next));
  assert(nm.pub.white === B && nm.pub.black === A, 'rematch match seats swapped');

  const calls = [];
  const econ = {
    async resolveGame(db, admin, uid, body, opts) {
      calls.push({ uid, body, opts });
      return { chipDelta: 25, eloDelta: 9, rated: true, opponent: { chipDelta: 0, eloDelta: -9 } };
    },
  };
  const fakeAdmin = { firestore: () => ({}) };
  Engine.settleMatch(fakeAdmin, Engine.hydrate(m).pub, econ).then((out) => {
    const c = calls[0];
    assert(c.uid === A && c.body.result === 'win' && c.opts.trusted && c.opts.ratingBucket === 'blitz' && c.body.rated === true, 'settle: trusted, winner reports, Blitz bucket');
    assert(out[A].eloDelta === 9 && out[B].eloDelta === -9 && out.bucket === 'blitz', 'settlement per player');
  });
  const friend = Engine.reduceMatch(null, A, 'join', { matchId: 'friend_1', opponentUid: B, tc: { minutes: 10 } }, t, { rng: rng0 }).match;
  assert(friend.pub.rated === false && friend.pub.bucket === 'rapid', 'friend game unrated unless the host marks it rated');
  const untimed = Engine.reduceMatch(null, A, 'join', { matchId: 'u_mm_1', opponentUid: B, tc: {} }, t, { rng: rng0 }).match;
  assert(untimed.pub.rated === false && untimed.pub.bucket === '', 'untimed games are never rated');
  const c960 = Engine.reduceMatch(null, A, 'join', { matchId: 'c9_1', opponentUid: B, variant: 'chess960', tc: { minutes: 5 } }, t, { rng: () => 0.37 }).match;
  assert(c960.pub.variant === 'chess960' && c960.pub.startFen === Core.chess960Fen(Math.floor(0.37 * 960)), 'Chess960 start position generated by the server');
}
{
  const B_ = Engine.bucketOf;
  const b = (min, inc) => B_(Engine.normTc({ minutes: min, increment: inc }));
  assert(b(1, 0) === 'bullet' && b(2, 1) === 'bullet' && b(3, 0) === 'blitz' && b(3, 2) === 'blitz' && b(5, 0) === 'blitz', 'buckets: bullet / blitz');
  assert(b(10, 0) === 'rapid' && b(15, 10) === 'rapid' && b(30, 0) === 'classical' && B_(Engine.normTc({ days: 3 })) === 'daily', 'buckets: rapid / classical / daily');
  // Daily game: move produces a notification + index update
  let m = Engine.reduceMatch(null, A, 'join', { matchId: 'cd_1', opponentUid: B, tc: { days: 1 }, color: 'w' }, 1000, { rng: rng0 }).match;
  m = Engine.reduceMatch(m, B, 'join', { matchId: 'cd_1' }, 2000, { rng: rng0 }).match;
  assert(m.pub.deadline === 2000 + 86400000, 'Daily: one day per move');
  const r = Engine.reduceMatch(JSON.parse(JSON.stringify(m)), A, 'move', { matchId: 'cd_1', move: 'd4' }, 5000, { rng: rng0 });
  assert(r.result.notify && r.result.notify.to === B && r.result.daily.turnUid === B, 'Daily move → “Your move” notification to the opponent');
  const late = Engine.reduceMatch(JSON.parse(JSON.stringify(r.match)), B, 'tick', { matchId: 'cd_1' }, 5000 + 86400000 + 1, { rng: rng0 }).match;
  assert(late.pub.status === 'aborted' || late.pub.status === 'over', 'Daily deadline passes → game ends');
}

// ─── 7. Engine + bots ─────────────────────────────────────────────────────
{
  const s = new Search.Searcher({ ttBits: 16 });
  const mate1 = new Core.Position().load('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1');
  const r1 = s.search(mate1, { depth: 4 });
  assert(Core.uciOf(mate1, r1.move) === 'd1d8' && r1.mate === 1, 'engine finds back-rank mate in 1');
  const mate2 = new Core.Position().load('r2qkb1r/pp2nppp/3p4/2pNN1B1/2BnP3/3P4/PPP2PPP/R2bK2R w KQkq - 1 1');
  const r2 = s.search(mate2, { depth: 5 });
  assert(Core.uciOf(mate2, r2.move) === 'd5f6' && r2.mate === 2, 'engine finds mate in 2 (Nf6+)');
  let seed = 7;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  [1, 4, 8].forEach((level) => {
    const pos = new Core.Position().load('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3');
    const legal = pos.legalMoves().map((m) => Core.uciOf(pos, m));
    const r = Search.botMove(pos, { level, rng, timeMs: level === 8 ? 600 : undefined });
    assert(r.move && legal.indexOf(Core.uciOf(pos, r.move)) >= 0, `bot level ${level} plays a legal move`);
  });
  [4, 8].forEach((level) => {
    const pos = new Core.Position().load('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1');
    const r = Search.botMove(pos, { level, rng, timeMs: 400 });
    assert(Core.uciOf(pos, r.move) === 'd1d8', `bot level ${level} never misses mate in 1`);
  });
  const hang = new Core.Position().load('rnb1kbnr/pppp1ppp/8/4p1q1/3P4/2N5/PPP1PPPP/R1BQKBNR b KQkq - 0 3');
  const keep = Search.botMove(hang, { level: 6, rng });
  hang.make(keep.move);
  const reply = new Search.Searcher({ ttBits: 16 }).search(hang, { depth: 3 });
  assert(reply.score < 250, 'level 6 does not hang its queen');
  assert(Search.LEVELS.length === 8 && Search.LEVELS.every((l, i) => !i || l.approx > Search.LEVELS[i - 1].approx), '8 bot levels with increasing approx. ratings');
  assert(['aggressive', 'solid', 'tricky', 'friendly'].every((p) => Search.PERSONAS[p]), '4 bot personas');
  assert(['aggressive', 'solid', 'tricky', 'friendly'].every((p) => /Bot$/.test(AI.FALLBACKS.botPersona({ gameId: 'chess', persona: p }).name)), 'chess personas are labelled as bots');
}

// ─── 8. Review: thresholds + fixture game ─────────────────────────────────
{
  assert(Review.classify(0, true) === 'best' && Review.classify(0.009) === 'best' && Review.classify(0.03) === 'good', 'classify best/good');
  assert(Review.classify(0.08) === 'inaccuracy' && Review.classify(0.15) === 'mistake' && Review.classify(0.35) === 'blunder', 'classify inaccuracy/mistake/blunder');
  assert(Math.abs(Review.winPct(0) - 50) < 1e-9 && Review.winPct(300) > 70 && Review.winPct(-300) < 30, 'win% curve');
  assert(Review.moveAccuracy(0) > 99.9 && Review.moveAccuracy(0.3) < 30, 'accuracy curve');
  const moves = ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6', 'h5f7'];
  const g = new Core.Game();
  const s = new Search.Searcher({ ttBits: 16 });
  const analysis = [];
  for (let i = 0; i <= moves.length; i++) {
    if (g.outcome()) analysis.push({ score: -Search.MATE, mate: 0, best: '', pv: [] });
    else {
      const r = s.search(g.pos, { depth: 3 });
      analysis.push({ score: r.score, mate: Search.mateIn(r.score), best: Core.uciOf(g.pos, r.move), pv: r.pv.map((m) => Core.uciOf(g.pos, m)) });
    }
    if (i < moves.length) g.move(moves[i]);
  }
  const rev = Review.buildReview({ moves, analysis });
  const nf6 = rev.moves[5];
  const qxf7 = rev.moves[6];
  assert(nf6.san === 'Nf6' && nf6.cls === 'blunder', 'fixture: 3…Nf6?? is a blunder');
  assert(qxf7.cls === 'best', 'fixture: Qxf7# is best');
  assert(/allows mate in 1 after Qxf7#/.test(Review.coachFallback(nf6).text), 'coach (AI off): “allows mate in 1 after Qxf7#” (' + Review.coachFallback(nf6).text + ')');
  assert(rev.keyMoments.some((k) => k.ply === 5), 'key moments include the blunder');
  assert(rev.accuracy.w > rev.accuracy.b, 'accuracy: the mating side scores higher');
  const missed = Review.coachFallback({ san: 'Qe2', cls: 'blunder', mateBefore: 2, bestSan: 'Nf6+', pvSan: ['Nf6+', 'gxf6', 'Bxf7#'], evalAfter: '+0.3' });
  assert(/Missed mate in 2: Nf6\+/.test(missed.text), 'coach (AI off): missed mate in 2');
  const loses = Review.coachFallback({ san: 'Nd5', cls: 'mistake', mateBefore: 0, mateAfter: 0, replySan: 'cxd5', replyCaptured: 'n', bestSan: 'Nf3', pvSan: ['Nf3'], evalAfter: '-2.1' });
  assert(/This loses the knight after cxd5/.test(loses.text), 'coach (AI off): “This loses the knight after …”');
  assert(Review.validateCoachText('Nf6+ was the move, then Bxf7#.', ['Nf6+', 'gxf6', 'Bxf7#']).ok, 'SAN validator accepts engine moves');
  const bad = Review.validateCoachText('Play Qh5 instead.', ['Nf6+', 'gxf6']);
  assert(!bad.ok && bad.bad[0] === 'Qh5', 'SAN validator rejects moves the engine did not give');
}

// ─── 9. Coach via dangal-ai: AI off → deterministic; AI output grounded ──
async function aiChecks() {
  const input = { gameId: 'chess', situation: 'move 3', move: 'Nf6', engineText: 'Nf6 allows mate in 1 after Qxf7#.', engineTips: ['Engine line: Nc6'], allowedMoves: ['Nf6', 'Qxf7#', 'Nh6', 'g6'] };
  const off = AI.createDangalAI({ env: {} });
  const r0 = await off.run('coachExplain', input, { uid: 'u1' });
  assert(r0.source === 'fallback' && r0.data.text === input.engineText, 'coach with AI off = deterministic engine explanation');
  const liar = AI.createDangalAI({ env: { AI_FEATURES_ENABLED: 'true' }, callAI: async () => ({ text: '{"text":"You should have played Qd8 here.","tips":[]}' }) });
  const r1 = await liar.run('coachExplain', input, { uid: 'u1' });
  assert(r1.source === 'fallback' && r1.reason === 'invalid_output', 'LLM naming a move outside the engine line → fallback');
  const honest = AI.createDangalAI({ env: { AI_FEATURES_ENABLED: 'true' }, callAI: async () => ({ text: '{"text":"Nf6 walks into Qxf7#. g6 was needed.","tips":["Watch f7"]}' }) });
  const r2 = await honest.run('coachExplain', input, { uid: 'u1' });
  assert(r2.source === 'ai', 'LLM text that only uses engine moves is accepted');
}

// ─── 10. ECO + rules + wiring ─────────────────────────────────────────────
{
  let bad = 0;
  Eco.TABLE.forEach((row) => {
    const g = new Core.Game();
    if (!row.moves.every((s) => g.move(s))) bad++;
  });
  assert(bad === 0 && Eco.TABLE.length >= 120, 'ECO: ' + Eco.TABLE.length + ' bundled lines, all legal');
  assert(Eco.lookup(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4']).name === 'Ruy López: Morphy Defence', 'ECO longest-prefix lookup');
  assert(Eco.lookup(['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6']).eco === 'B90', 'ECO: Najdorf');

  const chess = Rules.get('chess');
  assert(chess.ruleset.source === 'Rules based on the FIDE Laws of Chess', 'rules contract declares FIDE');
  const tv = chess.variants.find((v) => v.key === 'time');
  assert(['1+0', '2+1', '3+0', '3+2', '5+0', '10+0', '15+10', '30+0', 'custom', 'daily1', 'daily3'].every((t) => tv.options.indexOf(t) >= 0), 'rules list every time control');
  assert(Rules.fromLaunchCtx('chess', { min: 7, inc: 5 }).time === 'custom' && Rules.fromLaunchCtx('chess', { days: 3 }).time === 'daily3', 'launch ctx maps custom / daily');
  assert(/fivefold/.test(JSON.stringify(chess.rules)) && /75-move/.test(JSON.stringify(chess.rules)) && /cannot possibly checkmate/.test(JSON.stringify(chess.rules)), 'rules text covers automatic draws + FIDE 6.9');

  const apiFiles = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js'));
  assert(apiFiles.length === 12, 'api/*.js = 12 (got ' + apiFiles.length + ')');
  const mc = read('api/media-config.js');
  assert(/action === 'chess_game'/.test(mc) && /'chess_game',/.test(mc), 'chess_game folded into media-config + allowlisted');
  assert(/sweepDailyGames/.test(read('api/chaupaal-scheduler.js')), 'scheduler sweeps Daily timeouts');
  const econ = read('server-lib/dangal-economy.js');
  assert(/SERVER_SETTLED = new Set\(\[[^\]]*'chess'/.test(econ) && /RATING_BUCKETS/.test(econ), 'chess is server-settled with per-bucket ratings');
  const rules = JSON.parse(read('firebase/database.rules.json'));
  const cr = rules.rules.games.chess.$matchId;
  assert(cr && cr.pub['.read'] && !cr.pub['.write'] && cr.spec['.read'] === 'auth != null', 'RTDB: chess pub server-write only; delayed spec readable');
  const html = read('public/index.html');
  assert(/src="\/src\/js\/games\/chess-core\.js/.test(html) && /src="\/src\/js\/games\/chess-ui\.js/.test(html), 'index.html loads chess-core + chess-ui');
  assert(/data-chess-lazy[^>]*chess-search\.js/.test(html) && /data-chess-lazy[^>]*chess-worker\.js/.test(html) && /data-chess-lazy[^>]*chess-review\.js/.test(html), 'engine, worker and review are lazy-loaded');
  assert(!/<script src="\/vendor\/chess\.js/.test(html), 'vendor chess.js no longer loaded on first paint');
  const ui = read('public/src/js/games/chess-ui.js');
  assert(/Licences/.test(ui) && /BSD 2-Clause/.test(ui) && /no third-party engine/.test(ui), 'in-app licences screen');
  assert(/Claim draw/.test(ui) && /Abort/.test(ui) && /Offer draw/.test(ui) && /Resign/.test(ui), 'Live controls: claim draw, abort, offer draw, resign');
  assert(/aria-live/.test(ui), 'screen-reader move announcements');
  assert(/hints are off in rated|Hints are off/i.test(ui), 'hints disabled in Live / rated games');
  assert(!/stockfish/i.test(read('public/src/js/games/chess-search.js')), 'no GPL engine code bundled');
  const engines = read('public/src/js/games/engines.js');
  assert(/ChessUI\.open/.test(engines), 'openChessGame delegates to ChessUI');
  const pkg = JSON.parse(read('package.json'));
  assert(/test-dangal-p2-chess\.js/.test(pkg.scripts.test), 'npm test runs the P2 chess suite');
  assert(/Dangal P2/.test(read('CONVENTIONS.md')), 'CONVENTIONS documents P2');
}

aiChecks()
  .catch((e) => assert(false, 'ai checks threw: ' + e.message))
  .then(() => new Promise((r) => setTimeout(r, 50)))
  .then(() => {
    console.log(`\nDangal P2 chess: ${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  });
