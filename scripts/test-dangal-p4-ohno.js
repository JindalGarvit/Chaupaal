#!/usr/bin/env node
/**
 * Dangal P4 — Oh No! (shedding card game): official rules, house rules, server authority,
 * private hands, bots, Live rooms, registry.
 *   node scripts/test-dangal-p4-ohno.js
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
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const O = require(path.join(root, 'public/src/js/games/ohno-core.js'));
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
const players = (n) => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'P' + i }));
const NOW = 1e12;
const ctx = (rng) => ({ rng: rng || seeded(7), now: NOW });

/** A match in a known position: hands[i] per seat, `top` on the discard, `draw` pile (top = last). */
function rig(n, settings, hands, top, draw, extra) {
  const st = O.newMatch(players(n), settings, seeded(1));
  st.seats.forEach((s, i) => (s.hand = (hands[i] || []).slice()));
  st.discard = [top];
  st.color = O.isWild(top) ? (extra && extra.color) || 'r' : O.colorOf(top);
  st.draw = (draw || []).slice();
  st.turn = 0;
  st.dir = 1;
  st.phase = 'play';
  st.pending = 0;
  st.pendingKind = null;
  st.ohno = null;
  st.wd4 = null;
  return Object.assign(st, extra || {});
}
const totalCards = (st) => st.draw.length + st.discard.length + st.seats.reduce((a, s) => a + s.hand.length, 0);

// ─── 1. Deck, deal, starting card ────────────────────────────────────────
{
  const d = O.buildDeck();
  assert(d.length === 108, 'deck has 108 cards');
  assert(d.filter((c) => c === 'W').length === 4 && d.filter((c) => c === 'F').length === 4, '4 Wilds + 4 Wild Draw Fours');
  assert(O.COLORS.every((c) => d.filter((x) => x === c + '0').length === 1 && d.filter((x) => x === c + '5').length === 2), 'one 0 and two of 1–9 per colour');
  assert(O.COLORS.every((c) => ['S', 'R', 'D'].every((v) => d.filter((x) => x === c + v).length === 2)), 'two Skip / Reverse / Draw Two per colour');
  assert(O.points('r7') === 7 && O.points('gS') === 20 && O.points('bD') === 20 && O.points('W') === 50 && O.points('F') === 50, 'card points: face / 20 / 50');

  const st = O.newMatch(players(4), {}, seeded(3));
  assert(st.seats.every((s) => s.hand.length === 7) && totalCards(st) === 108, 'deal 7 each; 108 cards conserved');
  const q = O.newMatch(players(3), { quick: true }, seeded(3));
  assert(q.seats.reduce((a, s) => a + s.hand.length, 0) === 15 + (O.valueOf(q.discard[0]) === 'D' ? 2 : 0), 'quick round deals 5');
  assert(O.newMatch(players(1), {}, seeded(1)).error && !O.newMatch(players(10), {}, seeded(1)).error, '2–10 players');

  // Starting-card cases across seeds.
  let sawW = false;
  let sawS = false;
  let sawR = false;
  let sawD = false;
  for (let seed = 1; seed < 4000 && !(sawW && sawS && sawR && sawD); seed++) {
    const s = O.newMatch(players(4), {}, seeded(seed));
    const top = s.discard[0];
    const first = (s.dealer + 1) % 4;
    if (top === 'F') break;
    const v = O.valueOf(top);
    if (top === 'W' && !sawW) {
      sawW = true;
      assert(s.phase === 'color' && s.turn === first, 'starting Wild: the first player picks the colour');
      const r = O.apply(s, first, { type: 'color', color: 'g' }, ctx());
      assert(!r.error && s.color === 'g' && s.phase === 'play' && s.turn === first, '…then plays on it');
    } else if (v === 'S' && !sawS) {
      sawS = true;
      assert(s.turn === (first + 1) % 4, 'starting Skip: the first player is skipped');
    } else if (v === 'R' && !sawR) {
      sawR = true;
      assert(s.dir === -1 && s.turn === s.dealer, 'starting Reverse: play starts with the dealer, going the other way');
    } else if (v === 'D' && !sawD) {
      sawD = true;
      assert(s.seats[first].hand.length === 9 && s.turn === (first + 1) % 4, 'starting Draw Two: first player draws 2 and is skipped');
    }
  }
  assert(sawW && sawS && sawR && sawD, 'all starting-card cases seen');
  // Starting Wild Draw Four → reshuffle and flip again (checked directly).
  let fOk = true;
  for (let seed = 1; seed < 300; seed++) {
    const s = O.newMatch(players(3), {}, seeded(seed));
    if (s.discard[0] === 'F') fOk = false;
  }
  assert(fOk, 'starting Wild Draw Four is returned and a new card flipped');
}

// ─── 2. Turns: match, draw-then-play, pass, 2-player Reverse ─────────────
{
  let st = rig(3, {}, [['r5', 'g7', 'b2'], ['y1', 'y2'], ['g1', 'g2']], 'r3', ['b9', 'r8']);
  assert(O.canPlay(st, 0, 'r5') && !O.canPlay(st, 0, 'g7') && !O.canPlay(st, 1, 'y1'), 'match colour; not on another seat');
  st.discard = ['b7'];
  st.color = 'b';
  assert(O.canPlay(st, 0, 'g7') && O.canPlay(st, 0, 'b2'), 'match number or colour');
  // Draw even when you could play; drawn playable card may be played immediately.
  st = rig(3, {}, [['r5', 'g7'], ['y1', 'y2'], ['g1', 'g2']], 'r3', ['b9', 'r8']);
  let out = O.apply(st, 0, { type: 'draw' }, ctx());
  assert(!out.error && st.phase === 'drawn' && st.drawn === 'r8' && st.turn === 0, 'you may draw while holding a playable card; drawn playable → may play');
  assert(O.apply(st, 0, { type: 'play', card: 'r5' }, ctx()).error === 'illegal_card', 'after drawing, only the drawn card may be played');
  out = O.apply(st, 0, { type: 'play', card: 'r8' }, ctx());
  assert(!out.error && st.turn === 1 && O.top(st) === 'r8', 'drawn card played immediately');
  st = rig(3, {}, [['r5', 'g7'], ['y1', 'y2'], ['g1', 'g2']], 'r3', ['b9', 'r8']);
  O.apply(st, 0, { type: 'draw' }, ctx());
  out = O.apply(st, 0, { type: 'pass' }, ctx());
  assert(!out.error && st.turn === 1, 'or keep it and pass');
  st = rig(3, {}, [['r5', 'g7'], ['y1', 'y2'], ['g1', 'g2']], 'r3', ['r8', 'b9']);
  O.apply(st, 0, { type: 'draw' }, ctx());
  assert(st.turn === 1 && st.phase === 'play', 'unplayable drawn card → play passes');
  // Two players: Reverse acts as Skip.
  st = rig(2, {}, [['rR', 'r1', 'r2'], ['y1', 'y2']], 'r3', ['b9']);
  O.apply(st, 0, { type: 'play', card: 'rR' }, ctx());
  assert(st.turn === 0 && st.dir === 1, '2-player: Reverse = Skip (you go again)');
  st = rig(3, {}, [['rR', 'r1'], ['y1', 'y2'], ['g1', 'g2']], 'r3', []);
  O.apply(st, 0, { type: 'play', card: 'rR' }, ctx());
  assert(st.dir === -1 && st.turn === 2, '3+ players: Reverse flips direction');
  st = rig(3, {}, [['rS', 'r1'], ['y1', 'y2'], ['g1', 'g2']], 'r3', []);
  O.apply(st, 0, { type: 'play', card: 'rS' }, ctx());
  assert(st.turn === 2, 'Skip skips the next player');
  st = rig(3, {}, [['rD', 'r1'], ['y1', 'y2'], ['g1', 'g2']], 'r3', ['b1', 'b2', 'b3']);
  O.apply(st, 0, { type: 'play', card: 'rD' }, ctx());
  assert(st.seats[1].hand.length === 4 && st.turn === 2, 'Draw Two: next draws 2 and is skipped');
  st = rig(3, {}, [['W', 'r1'], ['y1', 'y2'], ['g1', 'g2']], 'r3', []);
  assert(O.apply(st, 0, { type: 'play', card: 'W' }, ctx()).error === 'pick_color', 'Wild needs a colour');
  O.apply(st, 0, { type: 'play', card: 'W', color: 'y' }, ctx());
  assert(st.color === 'y' && st.turn === 1, 'Wild sets the colour');
}

// ─── 3. Wild Draw Four: legality + challenge outcomes, private peek ──────
{
  const hands = () => [['F', 'r1', 'g5'], ['y1', 'y2', 'y3'], ['g1', 'g2']];
  let st = rig(3, {}, hands(), 'r3', Array(20).fill('b1'));
  assert(!O.wd4Legal(st, 0), 'holding the current colour → Draw Four is a bluff');
  O.apply(st, 0, { type: 'play', card: 'F', color: 'g' }, ctx());
  assert(st.phase === 'challenge' && st.turn === 1 && st.pending === 4, 'Draw Four opens a challenge for the next player');
  const pub = O.publicView(st);
  assert(pub.wd4 && pub.wd4.guilty === undefined, 'public view hides whether the Draw Four was honest');
  O.apply(st, 1, { type: 'challenge' }, ctx());
  assert(st.seats[0].hand.length === 6 && st.seats[1].hand.length === 3 && st.turn === 1 && st.phase === 'play', 'guilty → the offender draws 4; challenger plays on');
  assert(O.privateView(st, 1).peek && O.privateView(st, 1).peek.hand.length === 2, 'challenger privately sees the offender’s hand');
  assert(!O.privateView(st, 2).peek && !O.privateView(st, 0).peek && !O.publicView(st).peek, 'nobody else sees the peek');

  st = rig(3, {}, [['F', 'g5', 'b1'], ['y1', 'y2', 'y3'], ['g1', 'g2']], 'r3', Array(20).fill('b1'));
  assert(O.wd4Legal(st, 0), 'no current colour → Draw Four is legal');
  O.apply(st, 0, { type: 'play', card: 'F', color: 'g' }, ctx());
  O.apply(st, 1, { type: 'challenge' }, ctx());
  assert(st.seats[1].hand.length === 9 && st.turn === 2, 'innocent → the challenger draws 6 and is skipped');
  st = rig(3, {}, [['F', 'g5', 'b1'], ['y1', 'y2', 'y3'], ['g1', 'g2']], 'r3', Array(20).fill('b1'));
  O.apply(st, 0, { type: 'play', card: 'F', color: 'g' }, ctx());
  O.apply(st, 1, { type: 'accept' }, ctx());
  assert(st.seats[1].hand.length === 7 && st.turn === 2, 'no challenge → draw 4, skipped');
  // No bluffing: no challenge, Draw Four always legal.
  st = rig(3, { noBluff: true }, [['F', 'r1', 'g5'], ['y1'], ['g1']], 'r3', Array(20).fill('b1'));
  O.apply(st, 0, { type: 'play', card: 'F', color: 'g' }, ctx());
  assert(st.phase === 'play' && st.seats[1].hand.length === 5 && st.turn === 2, 'no-bluff: Draw Four always legal, no challenge');
}

// ─── 4. "Oh No!" call and catch window ───────────────────────────────────
{
  let st = rig(3, {}, [['r1', 'r2'], ['y1', 'y2', 'r9'], ['g1', 'g2']], 'r3', Array(10).fill('b1'));
  O.apply(st, 0, { type: 'play', card: 'r1' }, ctx());
  assert(st.ohno && st.ohno.seat === 0 && st.ohno.closesAt === NOW + O.CATCH_MS, 'one card without calling → catch window opens (server-timed)');
  let out = O.apply(st, 2, { type: 'catch', target: 0 }, ctx());
  assert(!out.error && st.seats[0].hand.length === 3 && !st.ohno, 'caught before the next turn → draw 2');
  st = rig(3, {}, [['r1', 'r2'], ['y1', 'y2', 'r9'], ['g1', 'g2']], 'r3', Array(10).fill('b1'));
  O.apply(st, 0, { type: 'play', card: 'r1', call: true }, ctx());
  assert(!st.ohno && st.seats[0].called, 'calling "Oh No!" with the play → safe');
  assert(O.apply(st, 2, { type: 'catch', target: 0 }, ctx()).error, 'cannot catch a player who called');
  st = rig(3, {}, [['r1', 'r2'], ['y1', 'y2', 'r9'], ['g1', 'g2']], 'r3', Array(10).fill('b1'));
  O.apply(st, 0, { type: 'play', card: 'r1' }, ctx());
  O.apply(st, 0, { type: 'ohno' }, ctx());
  assert(!st.ohno && st.seats[0].called, 'a late call before anyone catches → safe');
  st = rig(3, {}, [['r1', 'r2'], ['y1', 'y2', 'r9'], ['g1', 'g2']], 'r3', Array(10).fill('b1'));
  O.apply(st, 0, { type: 'play', card: 'r1' }, ctx());
  O.apply(st, 1, { type: 'play', card: 'r9' }, ctx());
  assert(O.apply(st, 2, { type: 'catch', target: 0 }, ctx()).error === 'too_late', 'next player started their turn → too late to catch');
  st = rig(3, {}, [['r1', 'r2'], ['y1', 'y2', 'r9'], ['g1', 'g2']], 'r3', Array(10).fill('b1'));
  O.apply(st, 0, { type: 'play', card: 'r1' }, ctx());
  out = O.apply(st, 2, { type: 'catch', target: 0 }, { rng: seeded(1), now: NOW + O.CATCH_MS + 1 });
  assert(out.error === 'too_late', 'window closes after the timer');
}

// ─── 5. Reshuffle, round scoring, match to 500 ───────────────────────────
{
  const st = rig(3, {}, [['r1', 'r2'], ['y1'], ['g1']], 'r3', ['b1'], {});
  st.discard = ['g4', 'y5', 'b6', 'r3'];
  O.apply(st, 0, { type: 'draw' }, ctx());
  O.apply(st, 1, { type: 'draw' }, ctx());
  assert(st.log.some((e) => e.type === 'reshuffle') && O.top(st) === 'r3' && st.discard.length === 1, 'empty draw pile → reshuffle discards except the top card');

  const s2 = rig(3, { target: 500 }, [['r1'], ['y5', 'gS', 'W'], ['bD', 'F', 'g9']], 'r3', Array(10).fill('b1'));
  O.apply(s2, 0, { type: 'play', card: 'r1' }, ctx());
  assert(s2.roundOver && s2.scores[0] === 5 + 20 + 50 + 20 + 50 + 9 && !s2.over, 'round winner scores the others’ cards (154)');
  assert(s2.lastRound && s2.lastRound.winner === 0 && s2.lastRound.handPoints[1] === 75, 'round summary has each hand’s points');
  s2.scores[0] = 480;
  O.nextRound(s2, seeded(5));
  s2.seats.forEach((s, i) => (s.hand = i === 0 ? ['r1'] : ['y9', 'W']));
  s2.discard = ['r3'];
  s2.color = 'r';
  s2.turn = 0;
  s2.phase = 'play';
  O.apply(s2, 0, { type: 'play', card: 'r1' }, ctx());
  assert(s2.over && s2.ranking[0] === 0, 'first to 500 wins the match');
  const s3 = rig(2, { target: 0 }, [['r1'], ['y5']], 'r3', []);
  O.apply(s3, 0, { type: 'play', card: 'r1' }, ctx());
  assert(s3.over, 'single-round target ends after one round');
  const s4 = rig(3, {}, [['rD'], ['y5'], ['g5']], 'r3', Array(10).fill('b1'));
  O.apply(s4, 0, { type: 'play', card: 'rD' }, ctx());
  assert(s4.seats[1].hand.length === 3 && s4.roundOver, 'going out on a Draw Two still makes the next player draw (counts in the score)');
  // Full simulated match to 500 with bots.
  const m = O.newMatch(players(4).map((p, i) => Object.assign(p, { bot: true, level: O.LEVELS[i % 3] })), { target: 500 }, seeded(11));
  let guard = 0;
  while (!m.over && guard++ < 50000) {
    if (m.roundOver) O.nextRound(m, seeded(guard));
    else {
      const r = O.apply(m, m.turn, O.botAction(m, m.turn, seeded(guard)), ctx(seeded(guard)));
      if (r.error) break;
    }
  }
  assert(m.over && Math.max.apply(null, m.scores) >= 500, 'bots play a full match to 500');
}

// ─── 6. House rules ──────────────────────────────────────────────────────
{
  // Stacking Draw Two on Draw Two.
  let st = rig(3, { stacking: true }, [['rD', 'r1'], ['gD', 'y2'], ['g1', 'g2']], 'r3', Array(20).fill('b1'));
  O.apply(st, 0, { type: 'play', card: 'rD' }, ctx());
  assert(st.pending === 2 && st.turn === 1, 'stacking: Draw Two passes the debt on');
  assert(!O.canPlay(st, 1, 'y2'), 'stacking: only a Draw Two answers a Draw Two');
  O.apply(st, 1, { type: 'play', card: 'gD' }, ctx());
  assert(st.pending === 4 && st.turn === 2, 'stack chain grows to 4');
  O.apply(st, 2, { type: 'draw' }, ctx());
  assert(st.seats[2].hand.length === 6 && st.turn === 0 && st.pending === 0, 'the player who can’t stack draws the whole chain and is skipped');
  // Draw Four on Draw Four, and the mix option.
  st = rig(3, { stacking: true }, [['F', 'r1'], ['F', 'y2'], ['gD', 'g2']], 'r3', Array(20).fill('b1'));
  O.apply(st, 0, { type: 'play', card: 'F', color: 'g' }, ctx());
  assert(O.canPlay(st, 1, 'F'), 'stacking: Draw Four on Draw Four');
  O.apply(st, 1, { type: 'play', card: 'F', color: 'g' }, ctx());
  assert(st.pending === 8 && st.turn === 2 && !O.canPlay(st, 2, 'gD'), 'without mix a Draw Two can’t answer a Draw Four');
  const mix = rig(3, { stacking: true, stackMix: true }, [['rD', 'r1'], ['F', 'y2'], ['gD', 'g2']], 'r3', Array(20).fill('b1'));
  O.apply(mix, 0, { type: 'play', card: 'rD' }, ctx());
  assert(O.canPlay(mix, 1, 'F'), 'mix: Draw Four on a Draw Two');
  O.apply(mix, 1, { type: 'play', card: 'F', color: 'g' }, ctx());
  assert(O.canPlay(mix, 2, 'gD') && mix.pending === 6, 'mix: a same-colour Draw Two on a Draw Four');
  assert(O.mergeSettings({ stackMix: true }).stackMix === false, 'mix needs stacking');

  // Jump-In race: first valid arrival wins.
  st = rig(3, { jumpIn: true }, [['r1', 'y5'], ['y2', 'y7'], ['r3', 'g2']], 'r3', Array(20).fill('b1'));
  const seq0 = st.seq;
  let out = O.apply(st, 2, { type: 'play', card: 'r3', seq: seq0 }, ctx());
  assert(!out.error && st.turn === 0 && st.log.some((e) => e.type === 'jump' && e.seat === 2), 'Jump-In: an identical card out of turn plays and takes the turn');
  const late = O.apply(st, 1, { type: 'play', card: 'y2', seq: seq0 }, ctx());
  assert(late.error === 'too_late' || late.error === 'illegal_card' || late.error, 'second arrival on the same state loses the race');
  const st2 = rig(3, { jumpIn: true }, [['r1', 'y5'], ['r3', 'y7'], ['r3', 'g2']], 'r3', Array(20).fill('b1'));
  const s0 = st2.seq;
  const w = O.apply(st2, 1, { type: 'play', card: 'r3', seq: s0 }, ctx());
  const l = O.apply(st2, 2, { type: 'play', card: 'r3', seq: s0 }, ctx());
  assert(!w.error && l.error === 'too_late', 'two identical Jump-Ins: first valid arrival wins, second is too late');
  const st3 = rig(3, {}, [['r1', 'y5'], ['r3', 'y7'], ['g1', 'g2']], 'r3', Array(20).fill('b1'));
  assert(O.apply(st3, 1, { type: 'play', card: 'r3', seq: st3.seq }, ctx()).error === 'not_your_turn', 'no Jump-In unless the house rule is on');

  // 7-0.
  st = rig(3, { sevenZero: true }, [['r7', 'y5', 'g5'], ['y2'], ['b1', 'b2', 'b3', 'b4']], 'r3', Array(20).fill('b1'));
  assert(O.apply(st, 0, { type: 'play', card: 'r7' }, ctx()).error === 'pick_player', '7 needs a target');
  O.apply(st, 0, { type: 'play', card: 'r7', target: 1 }, ctx());
  assert(st.seats[0].hand.join() === 'y2' && st.seats[1].hand.join() === 'y5,g5', '7 swaps hands with the chosen player');
  st = rig(3, { sevenZero: true }, [['r0', 'y5'], ['y2', 'y3'], ['b1', 'b2', 'b3']], 'r3', Array(20).fill('b1'));
  O.apply(st, 0, { type: 'play', card: 'r0' }, ctx());
  assert(st.seats[1].hand.join() === 'y5' && st.seats[2].hand.join() === 'y2,y3' && st.seats[0].hand.join() === 'b1,b2,b3', '0 passes every hand in the play direction');

  // Draw until playable.
  st = rig(3, { drawUntil: true }, [['g5'], ['y2'], ['b1']], 'r3', ['r9', 'b1', 'b2', 'y4']);
  O.apply(st, 0, { type: 'draw' }, ctx());
  assert(st.seats[0].hand.length === 5 && st.drawn === 'r9' && st.phase === 'drawn', 'draw-until-playable keeps drawing until a playable card');
  // Force play.
  st = rig(3, { forcePlay: true }, [['g5'], ['y2'], ['b1']], 'r3', ['r9']);
  O.apply(st, 0, { type: 'draw' }, ctx());
  assert(O.apply(st, 0, { type: 'pass' }, ctx()).error === 'must_play', 'force play: a playable drawn card must be played');
  assert(O.autoAction(st, 0).type === 'play', 'force play: AFK auto-plays the drawn card');
}

// ─── 7. Bots never play illegal cards (all levels, personas, house rules) ─
{
  const combos = [{}, { stacking: true, stackMix: true }, { jumpIn: true, sevenZero: true }, { drawUntil: true, forcePlay: true }, { noBluff: true, quick: true }, { stacking: true, noBluff: true }];
  let illegal = 0;
  let bluffs = 0;
  let honestBluffs = 0;
  let games = 0;
  let conserved = true;
  combos.forEach((set, ci) => {
    for (let g = 0; g < 12; g++) {
      const n = 2 + ((g + ci) % 9);
      const rng = seeded(1000 + ci * 50 + g);
      const ps = players(n).map((p, i) => Object.assign(p, { bot: true, level: O.LEVELS[(i + g) % 3], persona: i % 2 ? 'bluffer' : 'honest' }));
      const m = O.newMatch(ps, Object.assign({ target: 0 }, set), rng);
      let guard = 0;
      while (!m.over && guard++ < 5000) {
        const t = m.turn;
        const a = O.botAction(m, t, rng, { style: m.seats[t].persona === 'bluffer' ? { bluff: 0.6 } : { bluff: 0 } });
        if (a.type === 'play') {
          const legal = m.phase === 'color' ? false : O.canPlay(m, t, a.card);
          if (!legal) illegal++;
          if (a.card === 'F' && !set.noBluff && !O.wd4Legal(m, t)) {
            if (m.seats[t].persona === 'bluffer') bluffs++;
            else honestBluffs++;
          }
        }
        const r = O.apply(m, t, a, { rng, now: NOW });
        if (r.error) {
          illegal++;
          break;
        }
        if (totalCards(m) !== 108) conserved = false;
      }
      if (m.over) games++;
    }
  });
  assert(illegal === 0, 'bots never attempt an illegal card or action (' + games + ' games)');
  assert(honestBluffs === 0, 'honest bots play Draw Four legally only');
  assert(bluffs > 0, 'the bluffing persona sometimes bluffs (' + bluffs + ') — and can be challenged');
  assert(conserved, '108 cards conserved through every move');
  assert(games === combos.length * 12, 'every bot game finishes');
  const AI = require(path.join(root, 'server-lib/dangal-ai.js'));
  const bp = AI.FALLBACKS.botPersona({ gameId: 'uno', persona: 'bluffer', level: 'smart' });
  const hp = AI.FALLBACKS.botPersona({ gameId: 'uno', persona: 'honest', level: 'smart' });
  assert(bp && bp.style.bluff > 0 && hp && hp.style.bluff === 0, 'P1 botPersona hook: bluffer vs honest Oh No! personas');
}

// ─── 8. Live rooms: private hands, server deal, challenge, catch, leave → bot ─
{
  const U = ['uidAAAAAAAAAAAAAAAAAAAAA1', 'uidBBBBBBBBBBBBBBBBBBBBB2', 'uidCCCCCCCCCCCCCCCCCCCCC3', 'uidDDDDDDDDDDDDDDDDDDDDD4'];
  const clone = (x) => PD.hydrateRoom(JSON.parse(JSON.stringify(x)));
  let now = 1e12;
  let room = PD.newRoom({ game: 'uno', uid: U[0], name: 'A', settings: { stake: 25, target: 500 }, now });
  for (let i = 1; i < 4; i++) room = PD.reduceRoom(clone(room), U[i], 'join', { name: 'P' + i }, now).room;
  room = PD.reduceRoom(clone(room), U[0], 'start', {}, now).room;
  const st0 = room.pub.state;
  // A Draw Two as the first face-up card makes the first player draw 2 (9 cards) — standard rules.
  const dealt = st0.seats.map((s) => s.count).sort().join();
  assert(room.pub.status === 'playing' && st0.seats.length === 4 && (dealt === '7,7,7,7' || dealt === '7,7,7,9'), '4-player Live Oh No! deals 7 each on the server');
  const pubJson = JSON.stringify(room.pub);
  const fullHands = room.server.pub.seats.map((s) => s.hand);
  assert(!/"hand"/.test(pubJson) && !/"draw"\s*:/.test(pubJson), 'pub has no hands and no draw pile');
  assert(Object.keys(room.secrets).length === 4 && U.every((u, i) => room.secrets[u].hand.join() === room.server.pub.seats[room.server.pub.seats.findIndex((s) => s.id === u)].hand.join()), 'each hand is written only to its owner’s secret');
  void fullHands;
  const rtdb = (v) => {
    if (Array.isArray(v)) {
      const a = v.map(rtdb);
      return a.every((x) => x === undefined) ? undefined : a;
    }
    if (v && typeof v === 'object') {
      const out = {};
      Object.keys(v).forEach((k) => {
        const x = rtdb(v[k]);
        if (x !== undefined) out[k] = x;
      });
      return Object.keys(out).length ? out : undefined;
    }
    return v === null || v === false ? (v === false ? false : undefined) : v;
  };
  const hv = O.hydrateView(rtdb(JSON.parse(JSON.stringify(room.pub.state))));
  assert(hv.seats.length === 4 && hv.recent.length >= 1 && Array.isArray(hv.log) && hv.scores.length === 4 && hv.pending === 0, 'public view survives an RTDB round-trip (Live clients)');
  const rules = JSON.parse(read('firebase/database.rules.json'));
  const g = rules.rules.games.uno;
  assert(g && g.$code.secrets.$uid['.read'] === 'auth != null && auth.uid == $uid', 'RTDB: uno secrets readable only by their owner');
  assert(g.$code.pub['.read'].indexOf('players') > 0 && !g.$code.server, 'RTDB: pub readable by seated players; no server node exposed');
  assert(room.server.matchId.indexOf('uno_') === 0, 'matchId per game');

  let threw = false;
  try {
    const notTurn = st0.seats.find((s, i) => i !== st0.turn).id;
    PD.reduceRoom(clone(room), notTurn, 'draw', {}, now);
  } catch (e) {
    threw = true;
  }
  assert(threw, 'server rejects an out-of-turn draw');
  threw = false;
  try {
    const t = st0.seats[st0.turn].id;
    PD.reduceRoom(clone(room), t, 'play', { card: 'Q9' }, now);
  } catch (e) {
    threw = true;
  }
  assert(threw, 'server rejects a card not in the hand');

  // Play the match to the end with humans; force a challenge, a catch and a mid-game leave.
  let steps = 0;
  let sawChallenge = false;
  let sawCatch = false;
  let leftBot = false;
  const rng = seeded(77);
  while (!room.pub.state.over && steps++ < 20000) {
    const S = room.server.pub;
    now += 500;
    if (steps >= 150 && !leftBot && !S.roundOver) {
      room = PD.reduceRoom(clone(room), U[3], 'leave', {}, now).room;
      const sx = room.pub.state.seats.find((s) => s.id === U[3]);
      leftBot = !!(sx && sx.bot && sx.forfeit);
      continue;
    }
    if (S.roundOver) {
      room = PD.reduceRoom(clone(room), U[0], 'next_round', {}, now).room;
      continue;
    }
    if (S.ohno && !S.seats[S.ohno.seat].bot) {
      const catcher = S.seats.find((s, i) => i !== S.ohno.seat && !s.bot);
      if (catcher) {
        room = PD.reduceRoom(clone(room), catcher.id, 'catch', { target: S.ohno.seat }, now).room;
        sawCatch = true;
        continue;
      }
    }
    const seat = S.seats[S.turn];
    if (seat.bot) {
      now = room.pub.deadline + 10;
      room = PD.reduceRoom(clone(room), U[0], 'tick', {}, now).room;
      continue;
    }
    const view = JSON.parse(JSON.stringify(S));
    O.hydrate(view);
    let a = O.botAction(view, S.turn, rng, { style: { bluff: 0.5 } });
    if (a.type === 'play' && a.call && rng() < 0.5) a.call = false;
    if (S.phase === 'challenge') {
      a = { type: 'challenge' };
      sawChallenge = true;
    }
    const args = Object.assign({}, a);
    delete args.type;
    room = PD.reduceRoom(clone(room), seat.id, a.type, args, now).room;
  }
  const req = room.server.settleReq;
  assert(room.pub.state.over && Math.max.apply(null, room.pub.state.scores) >= 500, 'Live match to 500 completes');
  assert(sawChallenge, 'Live: a Draw Four challenge happened');
  assert(sawCatch, 'Live: an "Oh No!" catch happened');
  assert(leftBot, 'Live: a mid-game leave → a bot takes the seat');
  assert(req && req.game === 'uno' && req.ranking.length === 4 && req.ranking[3] === U[3] && req.forfeits.indexOf(U[3]) >= 0 && req.stake === 25, 'settlement ranks the leaver last with the forfeit and stake');
  assert(room.pub.settlement && room.pub.settlement.status === 'pending', 'settlement pending until the server pays out');

  // Bots fill seats, are labelled, play on the server; AFK → auto-draw then takeover.
  room = PD.newRoom({ game: 'uno', uid: U[0], name: 'A', settings: { bots: 3, botLevel: 'smart', target: 0 }, now });
  room = PD.reduceRoom(clone(room), U[0], 'start', {}, now).room;
  const bots = room.pub.state.seats.filter((s) => s.bot);
  assert(bots.length === 3 && bots.every((b) => /^Bot \d · Smart$/.test(b.name)), 'bots fill empty seats and are labelled');
  assert(room.pub.state.seats[room.pub.state.turn].bot === false || room.pub.state.over, 'bot turns run on the server until a human is up');
  const pol = Policy.policyFor('uno');
  assert(pol.turnMs === 20000 && pol.afk.action === 'auto_draw' && pol.leave === 'bot_takeover', 'Live policy: 20s turn, AFK auto-draw, leave → bot');
  let misses = 0;
  let before = room.pub.state.seats[0].count;
  while (!room.pub.state.over && misses < pol.afk.maxMisses + 2) {
    const S = room.server.pub;
    now = room.pub.deadline + 10;
    const humanTurn = S.turn === 0 && !S.seats[0].bot && !S.roundOver;
    room = PD.reduceRoom(clone(room), U[0], 'tick', {}, now).room;
    if (humanTurn) misses++;
  }
  const me = room.pub.state.seats[0];
  assert(room.pub.state.over || (me.bot && me.forfeit), 'repeated AFK → a bot takes the seat');
  void before;
  const html = read('public/index.html');
  void html;
}

// ─── 9. Registry, rules sheet, naming, platform ──────────────────────────
{
  const rulesSrc = read('public/src/js/dangal/dangal-rules.js');
  assert(/uno: \{\s*ruleset: \{ name: 'Oh No!', source: 'Rules based on the classic shedding card game'/.test(rulesSrc), 'ruleset: Oh No! — rules based on the classic shedding card game');
  ['stacking', 'stackMix', 'jumpIn', 'sevenZero', 'drawUntil', 'forcePlay', 'noBluff', 'quick'].forEach((k) => assert(new RegExp("opt\\('" + k + "'").test(rulesSrc), 'house rule declared: ' + k));
  const ui = fs.existsSync(path.join(root, 'public/src/js/games/ohno-ui.js')) ? read('public/src/js/games/ohno-ui.js') : '';
  const all = [ui, read('public/src/js/games/ohno-core.js'), read('server-lib/ohno-engine.js'), rulesSrc.slice(rulesSrc.indexOf('uno: {'), rulesSrc.indexOf('uno: {') + 4000)].join('\n');
  assert(!/\bUNO\b/.test(all), 'no "UNO" trademark in the game’s files');
  assert(ui && /registerGame\(\{[\s\S]{0,200}id: 'uno'/.test(ui) && /registerPartyGame/.test(ui), 'ohno-ui registers the game + party room');
  assert(/Oh No!/.test(ui) && /Catch!/.test(ui), 'UI has the "Oh No!" and "Catch!" buttons');
  assert(!/Pass (&|and) Play/i.test(ui), 'no Pass & Play (vs bots is the solo mode)');
  const html = read('public/index.html');
  assert(/data-party-lazy src="\/src\/js\/games\/ohno-core\.js/.test(html) && html.indexOf('/src/js/games/ohno-ui.js') > 0, 'index.html loads ohno-core (lazy) + ohno-ui');
  const eng = read('public/src/js/games/engines.js');
  assert(!/id: 'uno'/.test(eng) && !/openUnoGame/.test(eng), 'old engines.js Oh No! removed');
  const econ = require(path.join(root, 'server-lib/dangal-economy.js'));
  assert(econ.SERVER_SETTLED.has('uno'), 'Oh No! is server-settled only');
  const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
  assert(apiCount === 12, 'api/*.js = 12 (got ' + apiCount + ')');
}

if (failed) {
  console.error('\n' + failed + ' failure(s)');
  process.exit(1);
}
console.log('\nAll Dangal P4 Oh No! checks passed.');
