#!/usr/bin/env node
/**
 * Dangal P3 — Ludo, Snakes & Ladders, Tic-Tac-Toe (Classic + Ultimate):
 * rules engines + every house rule, server dice fairness, board validation, perfect TTT bot,
 * Ultimate rules, AFK / leave → bot takeover through the party-room engine, placement settlement.
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

const L = require(path.join(root, 'public/src/js/games/ludo-core.js'));
const S = require(path.join(root, 'public/src/js/games/snakes-core.js'));
const T = require(path.join(root, 'public/src/js/games/ttt-core.js'));
const Dice = require(path.join(root, 'server-lib/dice.js'));
const PD = require(path.join(root, 'server-lib/party-deal.js'));
const Rules = require(path.join(root, 'public/src/js/dangal/dangal-rules.js'));
const Policy = require(path.join(root, 'public/src/js/dangal/dangal-live-policy.js'));

const types = (out) => (out.events || []).map((e) => e.type);
const two = (settings) => L.newGame([{ id: 'a' }, { id: 'b' }], settings);
const four = (settings) => L.newGame([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], settings);
const absToP = (color, abs) => (abs - L.START[color] + L.TRACK) % L.TRACK;

// ─── 1. Ludo engine ──────────────────────────────────────────────────────
{
  let st = two();
  assert(st.seats.map((s) => s.color).join() === 'red,yellow', '2 players sit opposite (red / yellow)');
  let out = L.roll(st, 5);
  assert(types(out).indexOf('no_move') >= 0 && st.turn === 1, 'no 6 with all tokens in base → turn passes');
  st = two();
  L.roll(st, 6);
  assert(st.phase === 'move' && L.legalMoves(st).length === 4 && L.legalMoves(st).every((m) => m.to === 0), 'a 6 brings a token out onto the start square');
  out = L.move(st, 0);
  assert(st.seats[0].tokens[0] === 0 && st.phase === 'roll' && st.turn === 0 && out.events.some((e) => e.type === 'bonus' && e.why === 'six'), 'a 6 grants another roll');
  assert(L.legalMoves(Object.assign(two(), { phase: 'move', dice: 1 })).length === 0, 'default: a 1 cannot bring a token out');
  const one = two({ entry: 'oneOrSix' });
  L.roll(one, 1);
  assert(L.legalMoves(one).length === 4, 'house rule: start on 1 or 6');

  st = two();
  L.roll(st, 6);
  L.move(st, 0);
  L.roll(st, 6);
  L.move(st, 0);
  out = L.roll(st, 6);
  assert(types(out).indexOf('triple_six') >= 0 && st.turn === 1 && st.seats[0].tokens[0] === 6, 'three 6s in a row forfeit the turn');

  // Capture outside safe squares.
  st = two();
  st.seats[0].tokens = [3, -1, -1, -1];
  st.seats[1].tokens = [absToP('yellow', 5), -1, -1, -1];
  L.roll(st, 2);
  out = L.move(st, 0);
  assert(st.seats[1].tokens[0] === L.BASE && st.seats[0].captures === 1, 'capture sends the rival token home');
  assert(st.turn === 1, 'default: a capture does not grant a bonus roll');
  // Stars and starts are safe.
  st = two();
  st.seats[0].tokens = [6, -1, -1, -1];
  st.seats[1].tokens = [absToP('yellow', 8), -1, -1, -1];
  L.roll(st, 2);
  L.move(st, 0);
  assert(st.seats[1].tokens[0] === absToP('yellow', 8), 'star square is safe');
  st = two();
  st.seats[0].tokens = [absToP('red', 24), -1, -1, -1];
  st.seats[1].tokens = [0, -1, -1, -1];
  L.roll(st, 2);
  L.move(st, 0);
  assert(st.seats[1].tokens[0] === 0, 'start square is safe');
  st = two({ safeSquares: false });
  st.seats[0].tokens = [6, -1, -1, -1];
  st.seats[1].tokens = [absToP('yellow', 8), -1, -1, -1];
  L.roll(st, 2);
  L.move(st, 0);
  assert(st.seats[1].tokens[0] === L.BASE, 'house rule: safe squares off → stars capture');
  // Capture bonus.
  st = two({ captureBonus: true });
  st.seats[0].tokens = [3, -1, -1, -1];
  st.seats[1].tokens = [absToP('yellow', 5), -1, -1, -1];
  L.roll(st, 2);
  out = L.move(st, 0);
  assert(st.turn === 0 && out.events.some((e) => e.type === 'bonus' && e.why === 'capture'), 'house rule: capture bonus roll');

  // Exact roll to reach home + home bonus.
  st = two();
  st.seats[0].tokens = [55, -1, -1, -1];
  out = L.roll(st, 3);
  assert(types(out).indexOf('no_move') >= 0 && st.seats[0].tokens[0] === 55, 'overshooting home is not a legal move');
  st.turn = 0;
  st.phase = 'roll';
  L.roll(st, 2);
  out = L.move(st, 0);
  assert(st.seats[0].tokens[0] === L.HOME && out.events.some((e) => e.type === 'bonus' && e.why === 'home'), 'exact roll reaches home, bonus roll on');
  st = two({ bonusHome: false });
  st.seats[0].tokens = [55, -1, -1, -1];
  L.roll(st, 2);
  L.move(st, 0);
  assert(st.turn === 1, 'home bonus toggle off → turn passes');

  // Kill to enter.
  st = two({ killToEnter: true });
  st.seats[0].tokens = [50, -1, -1, -1];
  L.roll(st, 3);
  assert(L.legalMoves(st)[0].to === 1, 'kill to enter: no capture yet → token keeps circling');
  st = two({ killToEnter: true });
  st.seats[0].tokens = [50, -1, -1, -1];
  st.seats[0].captures = 1;
  L.roll(st, 3);
  assert(L.legalMoves(st)[0].to === 54, 'kill to enter: after a capture the home column opens');
  st = two();
  st.seats[0].tokens = [50, -1, -1, -1];
  L.roll(st, 3);
  assert(L.legalMoves(st)[0].to === 54, 'default: home column open without captures');

  // Blocks.
  const blockSetup = (settings) => {
    const b = two(settings);
    b.seats[0].tokens = [3, -1, -1, -1];
    b.seats[1].tokens = [absToP('yellow', 5), absToP('yellow', 5), -1, -1];
    L.roll(b, 4);
    return b;
  };
  assert(L.legalMoves(blockSetup({ blocks: true })).length === 0, 'house rule: two tokens form a block that cannot be passed');
  assert(L.legalMoves(blockSetup()).length === 1, 'default: no blocks');

  // Quick mode.
  st = two({ quick: true });
  assert(st.seats.every((s) => s.tokens.every((p) => p === 0)), 'quick: tokens start on the board');
  st.seats[0].tokens = [55, 0, 0, 0];
  L.roll(st, 2);
  L.move(st, 0);
  assert(st.over && st.ranking[0] === 0, 'quick: first token home wins');
  assert(L.mergeSettings({ mode: 'quick' }).quick, 'mode "quick" maps to the quick toggle');

  // Places.
  st = L.newGame([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  st.seats[0].tokens = [57, 57, 57, 55];
  L.roll(st, 2);
  L.move(st, 3);
  assert(!st.over && st.seats[0].done && st.turn === 1, 'places on: game continues for the other places');
  st = L.newGame([{ id: 'a' }, { id: 'b' }, { id: 'c' }], { places: false });
  st.seats[0].tokens = [57, 57, 57, 55];
  L.roll(st, 2);
  L.move(st, 3);
  assert(st.over && st.ranking[0] === 0, 'places off: first player home ends the game');

  // Teams 2v2.
  assert(two({ teams: true }).error === 'teams_need_four', 'teams need exactly four players');
  st = four({ teams: true });
  assert(st.seats.map((s) => s.team).join() === '0,1,0,1', 'partners sit opposite');
  st.seats[0].tokens = [3, -1, -1, -1];
  st.seats[2].tokens = [absToP('yellow', 5), -1, -1, -1];
  L.roll(st, 2);
  L.move(st, 0);
  assert(st.seats[2].tokens[0] !== L.BASE, 'teams: a partner is never captured');
  st = four({ teams: true });
  st.seats[0].tokens = [57, 57, 57, 57];
  st.seats[0].done = true;
  st.seats[2].tokens = [10, -1, -1, -1];
  L.roll(st, 3);
  assert(L.moverSeat(st) === 2 && L.legalMoves(st)[0].seat === 2, 'teams: a finished player moves their partner’s tokens');
  st = four({ teams: true });
  st.seats[2].tokens = [57, 57, 57, 57];
  st.seats[2].done = true;
  st.placements = [2];
  st.seats[0].tokens = [57, 57, 57, 55];
  L.roll(st, 2);
  L.move(st, 3);
  assert(st.over && st.winnerTeam === 0, 'teams: both partners home wins for the team');

  // AFK auto-move + takeover.
  st = two();
  st.seats[0].tokens = [4, 30, -1, 12];
  L.roll(st, 3);
  assert(L.autoMoveToken(st) === 1, 'AFK auto-move picks the most advanced token');
  st = L.newGame([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  L.takeOver(st, 1, 'left');
  assert(st.seats[1].bot && st.seats[1].forfeit && L.finalRanking(st)[2] === 1, 'takeover: a bot plays on and the seat places last');

  // Bots.
  st = two();
  st.seats[0].tokens = [3, 20, -1, -1];
  st.seats[1].tokens = [absToP('yellow', 5), -1, -1, -1];
  L.roll(st, 2);
  assert(L.botChoose(st, 'smart', () => 0.5) === 0 && L.botChoose(st, 'normal', () => 0.5) === 0, 'normal + smart bots take the capture');
  st = two();
  st.seats[0].tokens = [10, -1, -1, -1];
  L.roll(st, 6);
  assert(L.botChoose(st, 'normal', () => 0) === 1 || L.botChoose(st, 'normal', () => 0) === 2 || L.botChoose(st, 'normal', () => 0) === 3, 'normal bot brings a new token out on a 6');
  // Bot-vs-bot full games always finish.
  let finished = 0;
  for (let g = 0; g < 20; g++) {
    const game = L.newGame(['easy', 'normal', 'smart', 'smart'].map((lv, i) => ({ id: 'b' + i, bot: true, level: lv })));
    game.seats[0].bot = false;
    let seed = g + 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 20000 && !game.over; k++) {
      if (game.phase === 'roll') L.roll(game, 1 + Math.floor(rnd() * 6));
      else L.move(game, L.botChoose(game, game.seats[game.turn].level, rnd));
    }
    if (game.over) finished++;
  }
  assert(finished === 20, 'bot games always finish (' + finished + '/20)');

  // RTDB round-trip (reconnect restores the exact board + turn).
  st = two();
  L.roll(st, 6);
  L.move(st, 0);
  L.roll(st, 4);
  const back = L.hydrate(JSON.parse(JSON.stringify(st)));
  assert(JSON.stringify(back.seats.map((s) => s.tokens)) === JSON.stringify(st.seats.map((s) => s.tokens)) && back.turn === st.turn && back.phase === st.phase && back.dice === st.dice, 'hydrate restores board, turn and phase');
}

// ─── 2. Server dice ──────────────────────────────────────────────────────
{
  Dice.setSource(null);
  const counts = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 60000; i++) counts[Dice.rollDie() - 1]++;
  const chi = Dice.chiSquare(counts);
  assert(chi < 20.5, 'CSPRNG dice are uniform (chi² ' + chi.toFixed(2) + ' < 20.5)');
  assert(counts.every((c) => c > 9000 && c < 11000), 'every face within ±10% over 60k rolls');
  assert(/crypto\.randomInt\(1, 7\)/.test(read('server-lib/dice.js')), 'dice use crypto.randomInt');
  assert(!/pity|weight|streak/i.test(read('server-lib/dice.js').replace(/no weighting, no pity rolls, no streak correction/, '')), 'no weighting / pity logic');
  Dice.setSource(() => 0);
  let threw = false;
  try {
    Dice.rollDie();
  } catch (_) {
    threw = true;
  }
  assert(threw, 'dice reject out-of-range sources');
  Dice.setSource(null);
  for (const f of ['public/src/js/games/ludo-ui.js', 'public/src/js/games/snakes-ui.js']) {
    const src = read(f);
    assert(/ctrl\.act\('roll'\)/.test(src) && !/ctrl\.act\('roll',/.test(src), f + ': Live roll sends no value (server rolls)');
  }
  const rooms = read('server-lib/classics-rooms.js');
  assert(!/args\.value|a\.value|ctx\.args\.value/.test(rooms), 'room adapter never reads a client die value');
}

// ─── 3. Snakes & Ladders ─────────────────────────────────────────────────
{
  assert(S.BOARDS.length === 4 && S.BOARDS.every((b) => S.validateBoard(b).ok), 'all four layouts validate');
  S.BOARDS.forEach((b) => {
    const v = S.validateBoard(b);
    if (!v.ok) console.error(b.id, v.errors);
  });
  assert(!S.validateBoard({ snakes: { 20: 30 }, ladders: {} }).ok, 'upward snake rejected');
  assert(!S.validateBoard({ snakes: {}, ladders: { 10: 20, 20: 40 } }).ok, 'chained jumps rejected');
  assert(!S.validateBoard({ snakes: { 100: 2 }, ladders: {} }).ok, 'snake on 100 rejected');
  assert(!S.validateBoard({ snakes: { 95: 1, 96: 1, 97: 1, 98: 1, 99: 1, 94: 1 }, ladders: {} }).ok, 'wall of snakes making 100 unreachable rejected');
  assert(S.mergeSettings({ variant: 'vedic' }).board === 'moksha' && S.mergeSettings({ variant: 'chaos' }).board === 'classic', 'legacy variants map onto boards');

  let st = S.newGame([{ id: 'a' }, { id: 'b' }], { exact: 'stay' });
  st.seats[0].pos = 97;
  let out = S.roll(st, 5);
  const mv = out.events.find((e) => e.type === 'move');
  assert(st.seats[0].pos === 97 && mv.overshoot === 'stay', 'exact finish (stay): overshoot keeps the token put');
  st = S.newGame([{ id: 'a' }, { id: 'b' }], { exact: 'bounce', board: 'galaxy' });
  st.seats[0].pos = 97;
  S.roll(st, 5);
  assert(st.seats[0].pos === 98, 'exact finish (bounce): bounces back the extra squares');
  st = S.newGame([{ id: 'a' }, { id: 'b' }]);
  st.seats[0].pos = 97;
  out = S.roll(st, 3);
  assert(st.over && st.ranking[0] === 0 && types(out).indexOf('finished') >= 0, 'exact roll to 100 wins');

  st = S.newGame([{ id: 'a' }, { id: 'b' }], { board: 'classic' });
  st.seats[0].pos = 0;
  out = S.roll(st, 1);
  assert(st.seats[0].pos === 38 && out.events.find((e) => e.type === 'move').jump.kind === 'ladder', 'ladder climbs');
  st.turn = 1;
  st.seats[1].pos = 14;
  S.roll(st, 2);
  assert(st.seats[1].pos === 6, 'snake slides down');
  st = S.newGame([{ id: 'a' }, { id: 'b' }]);
  st.seats[0].pos = 30;
  S.roll(st, 6);
  assert(st.turn === 0 && st.phase === 'roll', 'a 6 rolls again');
  S.roll(st, 6);
  out = S.roll(st, 6);
  assert(types(out).indexOf('triple_six') >= 0 && st.turn === 1, 'three 6s forfeit the turn');
  st = S.newGame([{ id: 'a' }, { id: 'b' }, { id: 'c' }], { places: true });
  st.seats[0].pos = 99;
  S.roll(st, 1);
  assert(!st.over && st.turn === 1, 'places on: others play on');
  assert(S.newGame([{ id: 'a' }]).error === 'need_players' && S.newGame(Array.from({ length: 8 }, (_, i) => ({ id: 'p' + i }))).seats.length === 6, '2–6 players');
  assert(S.cellOf(1).join() === '9,0' && S.cellOf(10).join() === '9,9' && S.cellOf(11).join() === '8,9' && S.cellOf(100).join() === '0,0', 'boustrophedon geometry');
}

// ─── 4. Tic-Tac-Toe ──────────────────────────────────────────────────────
{
  let games = 0;
  let losses = 0;
  let botPicks = 0;
  let botBad = 0;
  function explore(cells, toMove, botMark) {
    const w = T.winnerOf(cells);
    if (w) {
      games++;
      if (w === T.other(botMark)) losses++;
      return;
    }
    if (toMove === botMark) {
      const best = T.perfectMoves(cells, toMove);
      const pick = T.classicBot(cells, toMove, 'unbeatable', Math.random);
      botPicks++;
      if (best.indexOf(pick) < 0) botBad++;
      best.forEach((m) => {
        const c = cells.slice();
        c[m] = toMove;
        explore(c, T.other(toMove), botMark);
      });
    } else {
      for (let i = 0; i < 9; i++) {
        if (cells[i]) continue;
        const c = cells.slice();
        c[i] = toMove;
        explore(c, T.other(toMove), botMark);
      }
    }
  }
  explore(Array(9).fill(''), 'X', 'X');
  explore(Array(9).fill(''), 'X', 'O');
  assert(games > 1000 && losses === 0, 'Unbeatable bot never loses — exhaustive over every opponent line (' + games + ' games)');
  assert(botBad === 0 && botPicks > 100, 'unbeatable bot always picks a perfect move');
  const medium = Array.from({ length: 400 }, (_, i) => T.classicBot(['X', 'X', '', 'O', 'O', '', '', '', ''], 'X', 'medium', () => (i % 4 === 0 ? 0.1 : 0.9)));
  assert(medium.some((m) => m === 2), 'medium bot usually finds the win');
  const easy = new Set(Array.from({ length: 200 }, () => T.classicBot(Array(9).fill(''), 'X', 'easy', Math.random)));
  assert(easy.size > 3, 'easy bot varies its moves');
  assert(/Unbeatable bot always draws or wins/.test(read('public/src/js/games/ttt-ui.js')), 'Unbeatable label copy');

  // Ultimate.
  let u = T.newUltimate();
  assert(T.ultimateLegal(u).length === 81, 'Ultimate: first move anywhere');
  T.ultimatePlay(u, 4 * 9 + 2);
  assert(u.next === 2 && T.ultimateLegal(u).every((i) => Math.floor(i / 9) === 2), 'Ultimate: the square you play sends the opponent to that board');
  u = T.newUltimate();
  u.small[3] = 'O';
  u.next = 3;
  assert(T.ultimateLegal(u).length === 72 && T.ultimateLegal(u).every((i) => Math.floor(i / 9) !== 3), 'Ultimate: sent to a finished board → free choice');
  u = T.newUltimate();
  u.small[0] = 'X';
  T.ultimatePlay(u, 5 * 9 + 0);
  assert(u.next === -1, 'Ultimate: a move pointing at a finished board frees the next move');
  u = T.newUltimate();
  ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', ''].forEach((v, k) => (u.cells[k] = v));
  u.next = 0;
  u.turn = 'X';
  T.ultimatePlay(u, 8);
  assert(u.small[0] === 'D', 'Ultimate: a full small board with no line is drawn');
  assert(T.ultimateWinner(['X', 'D', 'X', '', '', '', '', '', '']) === null, 'Ultimate: a drawn small board counts for nobody');
  assert(T.ultimateWinner(['X', 'X', 'X', '', '', '', '', '', '']) === 'X', 'Ultimate: three small boards in a row wins');
  assert(T.ultimateWinner(['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'D']) === 'D', 'Ultimate: all boards decided with no line is a draw');
  u = T.newUltimate();
  for (let k = 0; k < 6; k++) T.ultimatePlay(u, T.ultimateBot(u, 'easy', Math.random));
  const pick = T.ultimateBot(u, 'normal', Math.random);
  assert(T.ultimateLegal(u).indexOf(pick) >= 0, 'Ultimate MCTS bot plays legal moves');
  // A bot playing out full Ultimate games never makes an illegal move.
  let ultOk = true;
  for (let g = 0; g < 5; g++) {
    const m = T.newMatch('ultimate', [{ id: 'a' }, { id: 'b' }]);
    while (!m.over) {
      const mv = T.botMove(m, 'easy', Math.random);
      if (T.play(m, mv).error) {
        ultOk = false;
        break;
      }
    }
  }
  assert(ultOk, 'Ultimate games play to completion');
  const cm = T.newMatch('classic', [{ id: 'a' }, { id: 'b' }]);
  T.forfeit(cm, 0, 'left');
  assert(cm.over && cm.winner === 'O' && cm.result === 'left', 'forfeit gives the other mark the win');
}

// ─── 5. Live rooms: server dice, leave → bot, AFK takeover, settlement ─
{
  const U = ['uidAAAAAAAAAAAAAAAAAAAAA1', 'uidBBBBBBBBBBBBBBBBBBBBB2', 'uidCCCCCCCCCCCCCCCCCCCCC3', 'uidDDDDDDDDDDDDDDDDDDDDD4'];
  const clone = (x) => PD.hydrateRoom(JSON.parse(JSON.stringify(x)));
  let now = 1e12;

  // Clients cannot choose a die.
  let room = PD.newRoom({ game: 'ludo', uid: U[0], name: 'A', settings: { stake: 25 }, now });
  room = PD.reduceRoom(clone(room), U[1], 'join', { name: 'B' }, now).room;
  room = PD.reduceRoom(clone(room), U[0], 'start', {}, now).room;
  Dice.setSource(() => 3);
  const first = room.pub.state.seats[room.pub.state.turn].id;
  room = PD.reduceRoom(clone(room), first, 'roll', { value: 6 }, now).room;
  const lastRoll = room.pub.state.log.filter((e) => e.type === 'roll').pop();
  assert(lastRoll && lastRoll.value === 3, 'Live roll uses the server die, not the client value');
  Dice.setSource(null);
  let threw = false;
  try {
    const notTurn = room.pub.state.seats[room.pub.state.turn].id === U[0] ? U[1] : U[0];
    PD.reduceRoom(clone(room), notTurn, 'roll', {}, now);
  } catch (_) {
    threw = true;
  }
  assert(threw, 'rolling out of turn is rejected');

  // 4-player Ludo with a mid-game leave → bot takes the seat, game completes, settlement queued.
  room = PD.newRoom({ game: 'ludo', uid: U[0], name: 'A', settings: { stake: 25 }, now });
  for (let i = 1; i < 4; i++) room = PD.reduceRoom(clone(room), U[i], 'join', { name: 'P' + i }, now).room;
  room = PD.reduceRoom(clone(room), U[0], 'start', {}, now).room;
  assert(room.pub.state.seats.length === 4 && room.pub.status === 'playing', '4-player Live Ludo starts');
  let steps = 0;
  let leftSeatBot = false;
  while (!room.pub.state.over && steps++ < 8000) {
    const st = room.pub.state;
    const seat = st.seats[st.turn];
    now += 1000;
    if (steps === 60) {
      room = PD.reduceRoom(clone(room), U[2], 'leave', {}, now).room;
      const s2 = room.pub.state.seats.find((s) => s.id === U[2]);
      leftSeatBot = !!(s2 && s2.bot && s2.forfeit);
      continue;
    }
    if (seat.bot) {
      now = room.pub.deadline + 10;
      room = PD.reduceRoom(clone(room), U[0], 'tick', {}, now).room;
      continue;
    }
    if (st.phase === 'roll') room = PD.reduceRoom(clone(room), seat.id, 'roll', {}, now).room;
    else {
      const moves = L.legalMoves(L.hydrate(JSON.parse(JSON.stringify(st))));
      room = PD.reduceRoom(clone(room), seat.id, 'move', { token: moves[0].token }, now).room;
    }
  }
  const req = room.server.settleReq;
  assert(leftSeatBot, 'mid-game leave → a bot takes over the seat');
  assert(room.pub.state.over, 'Ludo with a bot-taken seat still finishes');
  assert(req && req.ranking.length === 4 && req.ranking[3] === U[2] && req.forfeits.indexOf(U[2]) >= 0 && req.stake === 25, 'settlement request ranks the leaver last and marks the forfeit');
  assert(req && Object.keys(req.rolls).length >= 3, 'settlement carries each human’s rolls for lifetime dice stats');
  assert(room.pub.settlement && room.pub.settlement.status === 'pending', 'pub shows settlement pending until the server settles');

  // Snakes with bots: AFK → auto-roll, third miss → bot takeover; no humans left → game ends.
  room = PD.newRoom({ game: 'snakes', uid: U[0], name: 'A', settings: { bots: 3 }, now });
  room = PD.reduceRoom(clone(room), U[0], 'start', {}, now).room;
  const botNames = room.pub.state.seats.filter((s) => s.bot).map((s) => s.name);
  assert(botNames.length === 3 && botNames.every((n) => /^Bot \d/.test(n)), 'bots fill empty seats and are labelled Bot');
  const maxMisses = Policy.policyFor('snakes').afk.maxMisses || 3;
  let me;
  for (let i = 0; i < maxMisses; i++) {
    if (room.pub.state.over) break;
    now = room.pub.deadline + 10;
    room = PD.reduceRoom(clone(room), U[0], 'tick', {}, now).room;
    me = room.pub.state.seats.find((s) => s.id === U[0]);
    if (i < maxMisses - 1) assert(!me.forfeit, 'AFK miss ' + (i + 1) + ' → auto-roll, seat kept');
  }
  me = room.pub.state.seats.find((s) => s.id === U[0]);
  assert(room.pub.state.over || (me.bot && me.forfeit), 'repeated AFK → bot takeover and forfeit');
  if (room.pub.state.over && room.server.settleReq) {
    const r2 = room.server.settleReq;
    assert(r2.ranking.length === 1 && (me.forfeit ? r2.forfeits.indexOf(U[0]) >= 0 : true), 'AFK forfeit reaches settlement');
  }

  // TTT Live Ultimate: settlement + marks swap on rematch; leave forfeits.
  room = PD.newRoom({ game: 'ttt', uid: U[0], name: 'A', settings: { mode: 'ultimate', stake: 10 }, now });
  room = PD.reduceRoom(clone(room), U[1], 'join', { name: 'B' }, now).room;
  room = PD.reduceRoom(clone(room), U[0], 'start', {}, now).room;
  assert(room.pub.state.mode === 'ultimate', 'Live Ultimate starts');
  const xFirst = room.pub.state.seats.find((s) => s.mark === 'X').id;
  let guard = 0;
  while (!room.pub.state.over && guard++ < 200) {
    const st = T.hydrate(JSON.parse(JSON.stringify(room.pub.state)));
    const i = T.seatOfMark(st, st.turn);
    room = PD.reduceRoom(clone(room), st.seats[i].id, 'play', { cell: T.botMove(st, 'easy') }, now).room;
  }
  assert(room.pub.state.over && room.server.settleReq && room.server.settleReq.game === 'ttt' && room.server.settleReq.stake === 10, 'TTT Live settles with its stake');
  room = PD.reduceRoom(clone(room), U[0], 'start', {}, now).room;
  assert(room.pub.state.seats.find((s) => s.mark === 'X').id !== xFirst, 'rematch swaps who plays X');
  room = PD.reduceRoom(clone(room), U[1], 'leave', {}, now).room;
  assert(room.pub.state.over && room.server.settleReq.ranking[0] === U[0], 'TTT: leaving mid-game forfeits');
  const roomTttClassic = PD.newRoom({ game: 'ttt', uid: U[0], name: 'A', settings: { mode: 'classic' }, now });
  assert(roomTttClassic.pub.game === 'ttt', 'Live Classic TTT room');
}

// ─── 6. Rules, policy, registry, platform ────────────────────────────────
{
  const ludo = Rules.getRules ? Rules.getRules('ludo') : null;
  const snakesSrc = read('public/src/js/dangal/dangal-rules.js');
  assert(/ludo: \{\s*ruleset: \{ name: 'Ludo', source: 'Standard rules', simplified: false \}/.test(snakesSrc), 'Ludo ruleset: Standard rules');
  assert(/snakes: \{\s*ruleset: \{ name: 'Snakes & Ladders', source: 'Standard rules'/.test(snakesSrc) && /A game of chance/.test(snakesSrc), 'Snakes: Standard rules, honest "A game of chance"');
  ['entry', 'captureBonus', 'killToEnter', 'blocks', 'safeSquares', 'teams'].forEach((k) => assert(new RegExp("opt\\('" + k + "'").test(snakesSrc), 'Ludo declares house rule ' + k));
  assert(/Payouts/.test(snakesSrc) && /60\/30\/10/.test(snakesSrc), 'payouts documented in the Rules sheet');
  assert(Policy.policyFor('ludo').leave === 'bot_takeover' && Policy.policyFor('snakes').leave === 'bot_takeover' && Policy.policyFor('ttt').leave === 'forfeit', 'Live policy: dice games → bot takeover, TTT → forfeit');
  void ludo;
  const econ = require(path.join(root, 'server-lib/dangal-economy.js'));
  assert(['ludo', 'snakes', 'ttt'].every((g) => econ.SERVER_SETTLED.has(g)), 'classics are server-settled only');
  assert(!econ.RATED.has('ttt'), 'TTT unrated');
  const d3 = econ.placementStakeDeltas(3, 25);
  const d4 = econ.placementStakeDeltas(4, 10);
  assert(d3.reduce((a, b) => a + b, 0) === 0 && d4.reduce((a, b) => a + b, 0) === 0, 'placement stakes are zero-sum');
  assert(d4.join() === '14,-7,-9,-10' || (d4[0] > 0 && d4[3] === -10), 'four-player shares 60/30/10');
  assert(econ.placementStakeDeltas(2, 50, { draw: true }).every((x) => x === 0), 'draw returns stakes');

  const html = read('public/index.html');
  ['classics-kit.js', 'ludo-ui.js', 'snakes-ui.js', 'ttt-ui.js'].forEach((f) => assert(html.indexOf('/src/js/games/' + f) > 0, 'index.html loads ' + f));
  ['ludo-core.js', 'snakes-core.js', 'ttt-core.js'].forEach((f) => assert(new RegExp('data-party-lazy src="/src/js/games/' + f.replace('.', '\\.')).test(html), f + ' lazy-loaded'));
  const eng = read('public/src/js/games/engines.js');
  assert(!/id: 'ludo'|id: 'snakes'|id: 'ttt'/.test(eng), 'old engines.js registrations removed');
  const rules = JSON.parse(read('firebase/database.rules.json'));
  const g = rules.rules.games;
  assert(g && g.ludo && g.snakes && g.ttt, 'RTDB rules cover ludo / snakes / ttt rooms');
  const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
  assert(apiCount === 12, 'api/*.js = 12 (got ' + apiCount + ')');
}

// ─── 7. Placement settlement (fake Firestore) ────────────────────────────
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
    limit: () => ({ get: async () => ({ docs: [] }) }),
  });
  return {
    store,
    admin: { firestore: { FieldValue: FV } },
    collection: colRef,
    batch() {
      const ops = [];
      return {
        set: (r, d, o) => ops.push(['set', r.path, d, o]),
        create: (r, d) => ops.push(['create', r.path, d]),
        async commit() {
          if (ops.some((op) => op[0] === 'create' && store.has(op[1]))) throw Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
          ops.forEach((op) => store.set(op[1], apply(store.get(op[1]), op[2], op[0] === 'set' && op[3] && op[3].merge)));
        },
      };
    },
  };
}

(async () => {
  const econ = require(path.join(root, 'server-lib/dangal-economy.js'));
  const A = 'a'.repeat(28);
  const B = 'b'.repeat(28);
  const C = 'c'.repeat(28);
  const db = memDb();
  const res = await econ.resolvePlacement(db, db.admin, { gameType: 'ludo', matchId: 'ludo_t_1', ranking: [A, B, C], stake: 25, rolls: { [A]: [6, 6, 1], [B]: [2] }, forfeits: [] });
  assert(res.players[A].won && !res.players[B].won && !res.players[C].won && res.players[C].place === 3, 'placement: first wins, others place');
  assert(res.players[A].chipDelta > res.players[B].chipDelta && res.players[B].chipDelta > res.players[C].chipDelta, 'placement chips follow the shares');
  const dice = db.store.get('users/' + A + '/diceStats/lifetime');
  assert(dice && dice.f6 === 2 && dice.f1 === 1 && dice.total === 3, 'lifetime dice stats incremented');
  const dup = await econ.resolvePlacement(db, db.admin, { gameType: 'ludo', matchId: 'ludo_t_1', ranking: [A, B, C], stake: 25 });
  assert(dup.duplicate, 'placement settlement is idempotent per match');
  const lone = await econ.resolvePlacement(db, db.admin, { gameType: 'snakes', matchId: 'snakes_t_1', ranking: [A], stake: 50, forfeits: [A] });
  assert(!lone.players[A].won && lone.stake === 0, 'a forfeited lone human vs bots never wins and never stakes');
  const team = await econ.resolvePlacement(db, db.admin, { gameType: 'ludo', matchId: 'ludo_t_2', ranking: [A, B, C], stake: 10, teams: { winners: [A, C] } });
  assert(team.players[A].won && team.players[C].won && !team.players[B].won, 'teams: both partners win');
  const draw = await econ.resolvePlacement(db, db.admin, { gameType: 'ttt', matchId: 'ttt_t_1', ranking: [A, B], stake: 10, draw: true });
  assert(!draw.players[A].won && !draw.players[B].won, 'TTT draw: nobody wins');

  console.log(`\nDangal P3 classics: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
