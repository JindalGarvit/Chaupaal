#!/usr/bin/env node
/**
 * Dangal P8 — Rummy (13-card Points / Pool / Deals + Gin) and Teen Patti: rules, scoring, bots,
 * coach, server-authoritative Live rooms (hidden hands, settlement, chip conservation), 18+ gate
 * and wiring.
 *   node scripts/test-dangal-p8-cards.js
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

const R = require(path.join(root, 'public/src/js/games/rummy-core.js'));
const T = require(path.join(root, 'public/src/js/games/teenpatti-core.js'));
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

// ======================================================================= Rummy: validator

{
  assert(R.classify(['4H1', '5H1', '6H1'], 9) === 'pure', 'pure sequence: 3 consecutive cards of one suit');
  assert(R.classify(['QS1', 'KS1', 'AS1'], 9) === 'pure' && R.classify(['AS1', '2S1', '3S1'], 9) === 'pure', 'Ace plays low (A-2-3) or high (Q-K-A)');
  assert(R.classify(['KS1', 'AS1', '2S1'], 9) === 'invalid', 'no wrap-around K-A-2');
  assert(R.classify(['4H1', 'JK1', '6H1'], 9) === 'impure', 'a printed joker fills a gap → impure sequence');
  assert(R.classify(['4H1', '9C1', '6H1'], 9) === 'impure', 'a wild-rank card fills a gap → impure');
  assert(R.classify(['8H1', '9H1', 'TH1'], 9) === 'pure', 'a wild card in its natural place keeps the sequence pure');
  assert(R.classify(['7S1', '7H1', '7D1'], 9) === 'set' && R.classify(['7S1', '7H1', 'JK1', '7C1'], 9) === 'set', 'sets: 3–4 of a rank, jokers may fill');
  assert(R.classify(['7S1', '7S2', '7H1'], 9) === 'invalid', 'a set needs different suits');
  assert(R.classify(['7S1', '7H1', '7D1', '7C1', 'JK1'], 9) === 'invalid', 'a set has at most 4 cards');

  const hand = ['AH1', '2H1', '3H1', '5S1', '6S1', 'JK2', '9C1', '9D1', '9H1', 'TD1', 'JD1', 'QD1', 'KD1'];
  const good = [['AH1', '2H1', '3H1'], ['5S1', '6S1', 'JK2'], ['9C1', '9D1', '9H1'], ['TD1', 'JD1', 'QD1', 'KD1']];
  assert(R.checkDeclaration(good, hand, 4).valid, 'valid declaration: 2+ sequences, 1 pure, every card grouped');
  const noPure = ['AH1', '2H1', 'JK1', '5S1', '6S1', 'JK2', '9C1', '9D1', '9H1', 'KS1', 'KD1', 'KH1', 'KC1'];
  const np = R.checkDeclaration([['AH1', '2H1', 'JK1'], ['5S1', '6S1', 'JK2'], ['9C1', '9D1', '9H1'], ['KS1', 'KD1', 'KH1', 'KC1']], noPure, 11);
  assert(!np.valid && np.reason === 'no_pure', 'two impure sequences but no pure one → wrong show');
  const secondHand = ['AH1', '2H1', '3H1', '5S1', '5D1', '5C1', '9C1', '9D1', '9H1', 'KS1', 'KD1', 'KH1', 'KC1'];
  const second = R.checkDeclaration([['AH1', '2H1', '3H1'], ['5S1', '5D1', '5C1'], ['9C1', '9D1', '9H1'], ['KS1', 'KD1', 'KH1', 'KC1']], secondHand, 7);
  assert(!second.valid && second.reason === 'no_second', 'a pure sequence alone is not enough → needs a second sequence');
  assert(R.checkDeclaration(good.slice(0, 3), hand, 4).reason === 'cards', 'every card must be in a group');

  const high = ['KS1', 'KH2', 'QD1', 'QC1', 'JS1', 'JH1', 'TD2', 'AS1', 'AC1', 'KD1', 'QH1', 'JD1', 'TS1'];
  const ev = R.evaluate([high], 5);
  assert(ev.points === 80, 'points: A/K/Q/J/10 = 10 each, capped at 80');
  assert(R.value13('JK1', 5) === 0 && R.value13('5H1', 5) === 0 && R.value13('7H1', 5) === 7 && R.value13('AH1', 5) === 10, 'jokers 0, number cards face value, Ace 10');
  const partial = R.evaluate([['4H1', '5H1', '6H1'], ['KS1', 'KD1'], ['2C1', '9D1']], 7);
  assert(partial.points === 20 + 11, 'pure but no second sequence: everything except the pure sequence counts');
  const noPureCount = R.evaluate([['4H1', 'JK1', '6H1'], ['KS1']], 9);
  assert(noPureCount.points === 4 + 6 + 10, 'no pure sequence: every card counts (jokers 0)');
}

// ======================================================================= Rummy: drops, wrong show, full count

function fresh13(n, settings, seed) {
  const st = R.newMatch(people(n), Object.assign({ mode: '13' }, settings || {}), seeded(seed || 1));
  return st;
}
{
  const st = fresh13(3, { format: 'points' }, 2);
  const a = st.deal.turn;
  assert(R.apply(st, a, { type: 'drop' }).ok && st.deal.results[a].points === 20 && st.deal.results[a].kind === 'first_drop', 'first drop (before your first draw) = 20');
  const b = st.deal.turn;
  R.apply(st, b, { type: 'draw', from: 'closed' });
  R.apply(st, b, { type: 'discard', card: st.deal.hands[b][0] });
  const c = st.deal.turn;
  R.apply(st, c, { type: 'draw', from: 'closed' });
  R.apply(st, c, { type: 'discard', card: st.deal.hands[c][0] });
  assert(st.deal.turn === b && R.apply(st, b, { type: 'drop' }).ok && st.deal.results[b].points === 40, 'middle drop = 40');
  assert(st.over && st.winner === c && st.seats[c].score === 0, 'last player standing wins the Points deal');

  const p201 = fresh13(3, { format: 'pool', pool: 201 }, 3);
  const t = p201.deal.turn;
  R.apply(p201, t, { type: 'drop' });
  assert(p201.deal.results[t].points === 25 && R.dropCost(p201, false) === 50, 'Pool 201 drops: 25 first / 50 middle');

  const deals = fresh13(2, { format: 'deals', deals: 2 }, 4);
  assert(R.apply(deals, deals.deal.turn, { type: 'drop' }).error === 'no_drop', 'no drop in Deals');

  const w = fresh13(3, { format: 'points' }, 5);
  const s = w.deal.turn;
  R.apply(w, s, { type: 'draw', from: 'closed' });
  const h = w.deal.hands[s];
  const out = R.apply(w, s, { type: 'declare', card: h[0], groups: [h.slice(1)] });
  assert(out.ok && out.valid === false && w.deal.results[s].points === 80 && w.deal.results[s].kind === 'wrong' && !w.deal.active[s], 'wrong declaration = 80 and out of the deal (detected by the rules, not the phone)');
  assert(R.apply(w, w.deal.turn, { type: 'declare', card: 'AS1', groups: [] }).error, 'declare needs the card and matching groups');

  const lv = fresh13(3, { format: 'points' }, 6);
  const who = lv.deal.turn;
  R.apply(lv, who, { type: 'forfeit', reason: 'timeout' });
  assert(lv.deal.results[who].points === 80, 'full count (timeout / leaving mid-deal) = 80');

  const jk = fresh13(2, { format: 'points' }, 7);
  const d = jk.deal;
  d.open.push('JK1');
  d.firstOpen = false;
  assert(R.apply(jk, d.turn, { type: 'draw', from: 'open' }).error === 'joker_pick', 'jokers can’t be picked from the open pile');
  d.firstOpen = true;
  assert(R.apply(jk, d.turn, { type: 'draw', from: 'open' }).ok, '…except the very first open card');
  const picked = d.drawnCard;
  assert(R.apply(jk, d.turn, { type: 'discard', card: picked }).error === 'same_card', 'can’t throw back the card you just picked from the open pile');

  const two = fresh13(2, {}, 8);
  const six = fresh13(6, {}, 8);
  assert(two.deal.decks === 1 && six.deal.decks === 2 && two.deal.hands[0].length === 13, '2 players: 1 deck; 3–6: 2 decks; 13 cards each');
  assert(two.deal.wildRank >= 1 && two.deal.wildRank <= 13 && two.deal.wildCard, 'a card is cut for the wild joker rank');
}

// Valid declaration → others meld → points.
{
  const st = fresh13(3, { format: 'points' }, 9);
  const d = st.deal;
  const s = d.turn;
  d.wildRank = 8;
  d.hands[s] = ['AH1', '2H1', '3H1', '5S1', '6S1', 'JK2', '9C1', '9D1', '9H1', 'TD1', 'JD1', 'QD1', 'KD1'];
  d.closed.push('4C2');
  R.apply(st, s, { type: 'draw', from: 'closed' });
  const good = [['AH1', '2H1', '3H1'], ['5S1', '6S1', 'JK2'], ['9C1', '9D1', '9H1'], ['TD1', 'JD1', 'QD1', 'KD1']];
  const out = R.apply(st, s, { type: 'declare', card: '4C2', groups: good });
  assert(out.valid && d.phase === 'meld' && d.finish === '4C2', 'valid show → the others meld');
  const pend = R.meldPending(st);
  assert(pend.length === 2 && pend.indexOf(s) < 0, 'everyone else owes their groups');
  const pv = R.publicView(st);
  assert(pv.deal.results[s].groups && pv.deal.results[pend[0]] === null, 'the declarer’s show is public at once; others’ melds stay private until all are in');
  R.apply(st, pend[0], { type: 'auto_meld' });
  R.apply(st, pend[1], { type: 'meld', groups: [d.hands[pend[1]]] });
  assert(d.phase === 'done' && st.over && st.winner === s, 'deal over once everyone has shown');
  assert(st.seats[pend[1]].score === Math.min(80, R.evaluate([d.hands[pend[1]]], 8).points), 'meld score = the hand’s points under the cap');
}

// ======================================================================= Rummy: Pool elimination + rejoin, Deals scoring

{
  const st = fresh13(3, { format: 'pool', pool: 101 }, 10);
  const x = st.deal.turn;
  st.seats[x].score = 95;
  R.apply(st, x, { type: 'drop' });
  const y = st.deal.turn;
  R.apply(st, y, { type: 'drop' });
  const z = [0, 1, 2].find((i) => i !== x && i !== y);
  assert(st.deal.phase === 'done' && st.seats[x].score === 115 && st.seats[x].out && !st.over, 'Pool 101: reaching the limit eliminates');
  assert(R.canRejoin(st, x), 'Pool: rejoin while the highest remaining score ≤ 79');
  assert(R.rejoin(st, x).ok && !st.seats[x].out && st.seats[x].score === Math.max(st.seats[y].score, st.seats[z].score) + 1 && st.seats[x].entries === 2, 'rejoin at the highest remaining score + 1');
  st.seats[x].score = 150;
  st.seats[x].out = true;
  assert(!R.canRejoin(st, x), 'one rejoin only');
  const late = fresh13(3, { format: 'pool', pool: 101 }, 11);
  late.seats[0].score = 110;
  late.seats[0].out = true;
  late.seats[1].score = 80;
  late.deal.phase = 'done';
  assert(!R.canRejoin(late, 0), 'no rejoin once someone remaining is over 79');
  const end = fresh13(2, { format: 'pool', pool: 101 }, 12);
  const e = end.deal.turn;
  end.seats[e].score = 90;
  R.apply(end, e, { type: 'drop' });
  assert(end.over && end.winner === 1 - e && end.ranking[0] === 1 - e, 'Pool: last player standing wins');
}
{
  const st = fresh13(2, { format: 'deals', deals: 2 }, 13);
  assert(st.seats.every((s) => s.score === 160), 'Deals: everyone starts with 80 × deals chips');
  const s = st.deal.turn;
  R.apply(st, s, { type: 'draw', from: 'closed' });
  const h = st.deal.hands[s];
  R.apply(st, s, { type: 'declare', card: h[0], groups: [h.slice(1)] });
  assert(st.deal.phase === 'done' && st.seats[s].score === 80 && st.seats[1 - s].score === 240, 'Deals: the deal winner takes the losers’ points');
  assert(!st.over && R.nextDeal(st, seeded(1)).ok && st.dealNo === 2, 'Deals: next deal until the count is reached');
  const s2 = st.deal.turn;
  st.seats[0].score = 160;
  st.seats[1].score = 160;
  R.apply(st, s2, { type: 'forfeit', reason: 'timeout' });
  assert(st.over && st.winner === 1 - s2, 'Deals: most chips after the last deal wins');
  // Last deal: the loser's 80 leaves both on 160 → one more deal between the tied.
  const tie = fresh13(2, { format: 'deals', deals: 2 }, 14);
  tie.dealNo = 2;
  const tw = tie.deal.turn;
  tie.seats[tw].score = 240;
  tie.seats[1 - tw].score = 80;
  R.apply(tie, tw, { type: 'forfeit', reason: 'timeout' });
  assert(tie.seats[0].score === 160 && tie.seats[1].score === 160 && !tie.over && tie.tiebreak && tie.tiebreak.length === 2, 'Deals: a tie on chips plays one more deal between the tied');
  R.nextDeal(tie, seeded(2));
  const tb = tie.deal.turn;
  R.apply(tie, tb, { type: 'forfeit', reason: 'timeout' });
  assert(tie.over && tie.winner === 1 - tb, 'Deals tiebreak deal decides the winner');
}

// ======================================================================= Gin

function ginWith(h0, h1, settings) {
  const st = R.newMatch(people(2), Object.assign({ mode: 'gin' }, settings || {}), seeded(3));
  const d = st.deal;
  const all = new Set(h0.concat(h1));
  d.hands = [h0.slice(), h1.slice()];
  d.closed = R.makeDeck(1, 0).filter((c) => !all.has(c));
  d.open = [d.closed.pop()];
  d.turn = 0;
  d.phase = 'discard';
  d.drawnFrom = 'closed';
  d.drawnCard = h0[h0.length - 1];
  return st;
}
{
  const knock = ginWith(['AS1', '2S1', '3S1', '4H1', '4D1', '4C1', '7C1', '8C1', '9C1', '2D1', 'KH1'], ['5D1', '5S1', '5H1', 'TD1', 'JD1', 'QD1', '4S1', 'KC1', '8H1', '6C1']);
  assert(R.apply(knock, 0, { type: 'knock', card: 'KH1' }).ok, 'knock with deadwood ≤ the knock limit');
  const r = knock.deal.result;
  assert(r.kind === 'knock' && r.winner === 0 && r.knocker.points === 2, 'knock: the knocker’s deadwood counts (2)');
  assert(r.defender.laid.indexOf('4S1') >= 0 && r.defender.laid.indexOf('6C1') >= 0 && r.defender.points === 18 && r.pts === 16, 'lay-off: the defender lays 4♠ onto A-2-3♠ and 6♣ onto 7-8-9♣, then the difference scores (18 − 2)');
  assert(knock.seats[0].score === 16, 'knock points go to the knocker');

  const bad = ginWith(['AS1', '2S1', '3S1', '4H1', '4D1', '4C1', '7C1', '8C1', 'QH1', 'JD1', 'KH1'], ['5D1', '5S1', '5H1', 'TD1', '9D1', 'QD1', '4S1', 'KC1', '8H1', '6C1']);
  assert(R.apply(bad, 0, { type: 'knock', card: 'KH1' }).error === 'cant_knock', 'no knock above the limit');
  const five = ginWith(['AS1', '2S1', '3S1', '4H1', '4D1', '4C1', '7C1', '8C1', '9C1', '9D1', 'KH1'], ['5D1', '5S1', '5H1', 'TD1', 'JD1', 'QD1', '6S1', '7S1', '8S1', 'AD1'], { knock: 5 });
  assert(R.apply(five, 0, { type: 'knock', card: 'KH1' }).error === 'cant_knock', 'the knock limit is a table setting (5)');

  const under = ginWith(['AS1', '2S1', '3S1', '4H1', '4D1', '4C1', '7C1', '8C1', '9C1', '9D1', 'KH1'], ['5D1', '5S1', '5H1', 'TD1', 'JD1', 'QD1', '6S1', '7S1', '8S1', 'AD1']);
  R.apply(under, 0, { type: 'knock', card: 'KH1' });
  const u = under.deal.result;
  assert(u.kind === 'undercut' && u.winner === 1 && u.pts === 9 - 1 + 25, 'undercut: defender ≤ knocker scores the difference + 25');

  const gin = ginWith(['AS1', '2S1', '3S1', '4H1', '4D1', '4C1', '7C1', '8C1', '9C1', 'TC1', 'KH1'], ['5D1', '5S1', '5H1', 'TD1', 'JD1', 'QD1', '4S1', 'KC1', '8H1', '6C1']);
  R.apply(gin, 0, { type: 'knock', card: 'KH1' });
  const g = gin.deal.result;
  assert(g.kind === 'gin' && g.pts === 25 + 28 && g.defender.laid.length === 0, 'Gin: 0 deadwood, +25, no lay-offs');

  const big = ginWith(['AS1', '2S1', '3S1', '4H1', '4D1', '4C1', '7C1', '8C1', '9C1', 'TC1', 'JC1'], ['5D1', '5S1', '5H1', 'TD1', 'JD1', 'QD1', '4S1', 'KC1', '8H1', '6C1']);
  assert(R.apply(big, 0, { type: 'biggin' }).error === 'no_biggin', 'Big Gin is off unless the table turns it on');
  const big2 = ginWith(['AS1', '2S1', '3S1', '4H1', '4D1', '4C1', '7C1', '8C1', '9C1', 'TC1', 'JC1'], ['5D1', '5S1', '5H1', 'TD1', 'JD1', 'QD1', '4S1', 'KC1', '8H1', '6C1'], { bigGin: true });
  R.apply(big2, 0, { type: 'biggin' });
  assert(big2.deal.result.kind === 'biggin' && big2.deal.result.pts === 31 + 28, 'Big Gin (optional): all 11 melded, +31');

  const target = ginWith(['AS1', '2S1', '3S1', '4H1', '4D1', '4C1', '7C1', '8C1', '9C1', 'TC1', 'KH1'], ['5D1', '5S1', '5H1', 'TD1', 'JD1', 'QD1', '4S1', 'KC1', '8H1', '6C1'], { scoring: 'classic' });
  target.seats[0].score = 60;
  target.seats[0].wins = 2;
  target.seats[1].score = 0;
  R.apply(target, 0, { type: 'knock', card: 'KH1' });
  assert(target.over && target.winner === 0 && target.final.totals[0] === (60 + 53 + 100 + 3 * 25) * 2 && target.final.shutout, 'Classic scoring: game bonus 100 + 25 a box, doubled on a shutout');
  const simple = ginWith(['AS1', '2S1', '3S1', '4H1', '4D1', '4C1', '7C1', '8C1', '9C1', 'TC1', 'KH1'], ['5D1', '5S1', '5H1', 'TD1', 'JD1', 'QD1', '4S1', 'KC1', '8H1', '6C1']);
  simple.seats[0].score = 60;
  R.apply(simple, 0, { type: 'knock', card: 'KH1' });
  assert(simple.over && simple.final.totals[0] === 113, 'Simple scoring: first to 100, no line bonuses');

  const up = R.newMatch(people(2), { mode: 'gin' }, seeded(4));
  const nd = 1 - up.dealer;
  assert(up.deal.phase === 'upcard' && up.deal.turn === nd && up.deal.hands[0].length === 10, 'Gin: 10 cards, upcard offered to the non-dealer first');
  R.apply(up, nd, { type: 'pass' });
  R.apply(up, up.dealer, { type: 'pass' });
  assert(up.deal.phase === 'draw' && up.deal.turn === nd && R.apply(up, nd, { type: 'draw', from: 'open' }).error === 'stock_only', 'both pass → the non-dealer draws from the stock');
}

// ======================================================================= Teen Patti: rankings

{
  const S = (c, v, j) => T.strength(c, v || 'classic', j);
  const order = [['2S', '2H', '2D'], ['AS', 'KS', 'QS'], ['AS', 'KH', 'QD'], ['2H', '7H', '9H'], ['QS', 'QH', '4D'], ['AS', 'JH', '9D']];
  assert(order.every((h, i) => i === 0 || S(order[i - 1]) > S(h)), 'rank order: Trail > Pure sequence > Sequence > Colour > Pair > High card');
  assert(S(['AS', 'KH', 'QD']) > S(['AS', '2H', '3D']) && S(['AS', '2H', '3D']) > S(['KS', 'QH', 'JD']), 'sequences: A-K-Q highest, A-2-3 second, then K-Q-J');
  assert(S(['4S', '3H', '2D']) > S(['AS', 'KH', 'JD']) && T.evalNatural(['KS', 'AH', '2D']).cat === 0, 'no wrap: K-A-2 is a high card');
  assert(S(['AS', 'AH', 'AD']) > S(['KS', 'KH', 'KD']) && S(['3S', '3H', '3D']) > S(['AS', 'KS', 'QS']), 'trails by rank; any trail beats a pure sequence');
  assert(S(['KS', 'KH', 'AD']) > S(['KD', 'KC', 'QS']) && S(['AH', 'KH', '9H']) > S(['AD', 'QD', 'JD']), 'pairs by pair then kicker; colours by high cards');
  assert(S(['AS', 'KH', 'QD']) === S(['AH', 'KD', 'QC']), 'suits never rank (equal hands)');
  assert(T.describe(['AS', '2H', '3D']) === 'Sequence A-2-3' && T.describe(['AS', 'KS', 'QS']) === 'Pure sequence A-K-Q', 'hand names say A-2-3 / A-K-Q');
  assert(S(['2S', '3H', '5D'], 'muflis') > S(['AS', 'AH', 'AD'], 'muflis') && S(['2S', '3H', '5D'], 'muflis') > S(['2H', '3D', '6C'], 'muflis'), 'Muflis: the lowest hand wins');
  assert(T.evalHand(['AS', '7H', '2D'], T.wildRanks('ak47')).cat === 5 && T.describe(['4S', '9H', '2D'], 'ak47') === 'Pair of Nines', 'AK47: A, K, 4 and 7 are wild');
  assert(T.evalHand(['5S', '9H', 'QD'], T.wildRanks('joker', '5C')).cat === 1 && S(['5S', '9H', 'QD'], 'joker', '5C') > S(['KS', '9C', 'QH'], 'joker', '5C'), 'Joker: the cut rank is wild');
  assert(T.wildRanks('classic').length === 0 && T.VARIANTS.join() === 'classic,muflis,ak47,joker', 'variants: Classic, Muflis, AK47, Joker');
}

// ======================================================================= Teen Patti: betting

function tpTable(n, settings, seed) {
  return T.newMatch(people(n), Object.assign({ buyIn: 0 }, settings || {}), seeded(seed || 1));
}
{
  const st = tpTable(3, {}, 1);
  const h = st.hand;
  assert(st.boot === 10 && h.pot === 30 && h.stake === 10 && st.seats.every((s) => s.stack === 990), 'everyone pays the boot; the first stake = the boot');
  const a = h.turn;
  const L = T.legal(st, a);
  assert(L.chaal.cost === 10 && L.chaal.blind && L.raise.cost === 20, 'blind: chaal = stake, raise = 2 × stake');
  T.apply(st, a, { type: 'chaal' });
  const b = h.turn;
  T.apply(st, b, { type: 'see' });
  const Lb = T.legal(st, b);
  assert(Lb.chaal.cost === 20 && !Lb.chaal.blind && Lb.raise.cost === 40, 'seen: chaal = 2 × stake; a seen raise = 4 × the old stake');
  T.apply(st, b, { type: 'raise' });
  assert(h.stake === 20 && st.seats[b].stack === 990 - 40, 'raise doubles the stake');
  const c = h.turn;
  assert(T.legal(st, c).chaal.cost === 20 && T.legal(st, c).show === null, 'blind player now pays the new stake; no show with three in');
  T.apply(st, c, { type: 'pack' });
  assert(!h.inHand[c] && h.turn === a, 'pack leaves the hand');
  const blindA = T.legal(st, a);
  assert(blindA.show && blindA.show.cost === 20, 'show (two left): costs your current bet');
  const seenB = (() => {
    const t2 = clone(st);
    t2.hand.turn = b;
    return T.legal(t2, b);
  })();
  assert(seenB.show === null, 'a seen player can’t ask a blind player for a show');
  const before = sum(st.seats.map((s) => s.stack)) + h.pot;
  h.cards[a] = ['AS', 'AH', 'AD'];
  h.cards[b] = ['KS', 'QS', 'JS'];
  T.apply(st, a, { type: 'show' });
  assert(h.phase === 'done' && h.result.winners[0] === a && h.result.reason === 'show' && h.result.shown[b], 'show: both hands open, the best takes the pot');
  assert(sum(st.seats.map((s) => s.stack)) === before, 'chips conserve through a show');

  const tie = tpTable(3, {}, 2);
  const th = tie.hand;
  const x = th.turn;
  T.apply(tie, x, { type: 'pack' });
  const y = th.turn;
  const z = tie.seats.map((_, i) => i).find((i) => i !== x && i !== y);
  th.cards[y] = ['AS', 'KH', 'QD'];
  th.cards[z] = ['AH', 'KD', 'QC'];
  T.apply(tie, y, { type: 'show' });
  assert(th.result.winners[0] === z, 'equal hands at a show: whoever asked loses');

  const bl = tpTable(3, { blindMax: 2 }, 3);
  const bh = bl.hand;
  for (let i = 0; i < 6; i++) T.apply(bl, bh.turn, { type: 'chaal' });
  assert(bh.blind.every((b) => b === 2) && bh.seen[bh.turn] && T.legal(bl, bh.turn).chaal.cost === 20, 'blind limit: after 2 blind bets a player must look (and pays the seen rate)');
}

// Side show.
function sideTable(acceptCards) {
  const st = tpTable(4, {}, 5);
  const h = st.hand;
  h.seen = [true, true, true, true];
  h.turn = 2;
  h.cards = [['2S', '5H', '9D'], ['KS', 'KH', '3D'], acceptCards, ['4C', '6D', '8S']];
  return st;
}
{
  const st = sideTable(['AS', 'AH', 'AD']);
  const L = T.legal(st, 2);
  assert(L.sideshow && L.sideshow.to === 1 && L.sideshow.cost === 20, 'side show: ask the previous player still in (seen), paying a seen bet');
  T.apply(st, 2, { type: 'sideshow' });
  assert(st.hand.phase === 'sideshow' && T.actor(st) === 1 && T.legal(st, 1).respond, 'the asked player must accept or deny');
  T.apply(st, 1, { type: 'respond', accept: true });
  assert(!st.hand.inHand[1] && st.hand.inHand[2] && st.hand.peeks[2][0] === 1 && st.hand.peeks[1][0] === 2, 'accept: they compare privately, the lower hand packs');
  const pv = T.privateView(st, 2);
  assert(pv.peek[1] && pv.peek[1].join() === 'KS,KH,3D' && !T.privateView(st, 0).peek[1], 'side-show cards reach only the two players involved');
  const lose = sideTable(['2C', '3H', '7D']);
  T.apply(lose, 2, { type: 'sideshow' });
  T.apply(lose, 1, { type: 'respond', accept: true });
  assert(!lose.hand.inHand[2] && lose.hand.inHand[1], 'accept: the asker packs when their hand is lower');
  const eq = sideTable(['KD', 'KC', '3S']);
  T.apply(eq, 2, { type: 'sideshow' });
  T.apply(eq, 1, { type: 'respond', accept: true });
  assert(!eq.hand.inHand[2], 'equal side show: the asker packs');
  const deny = sideTable(['AS', 'AH', 'AD']);
  T.apply(deny, 2, { type: 'sideshow' });
  T.apply(deny, 1, { type: 'respond', accept: false });
  assert(deny.hand.inHand[1] && deny.hand.inHand[2] && deny.hand.phase === 'bet' && deny.hand.turn === 3, 'deny: play simply moves on');
  const blindPrev = sideTable(['AS', 'AH', 'AD']);
  blindPrev.hand.seen[1] = false;
  assert(T.legal(blindPrev, 2).sideshow === null, 'no side show against a blind player');
}

// Pot limit → auto show.
{
  const st = tpTable(3, { potX: 25 }, 6);
  const h = st.hand;
  assert(st.potLimit === 250, 'pot limit = 25 × boot at this table');
  let guard = 0;
  while (h.phase !== 'done' && guard++ < 50) T.apply(st, h.turn, { type: T.legal(st, h.turn).raise ? 'raise' : 'chaal' });
  assert(h.phase === 'done' && h.result.reason === 'potlimit' && Object.keys(h.result.shown).length === 3 && h.pot >= 250, 'pot limit reached → every hand in is shown, best takes the pot');
  assert(sum(st.seats.map((s) => s.stack)) === 3000, 'chips conserve through the pot-limit show');
}

// Bots: legal moves, chips conserve, every variant.
{
  let legal = true;
  let conserve = true;
  let moves = 0;
  const reasons = {};
  T.VARIANTS.forEach((variant, vi) => {
    for (let g = 0; g < 3; g++) {
      const n = 3 + ((g + vi) % 5);
      const rng = seeded(100 + vi * 10 + g);
      const st = T.newMatch(people(n, (i) => ({ bot: true, level: T.LEVELS[i % 3] })), { variant, buyIn: 250, hands: 10 }, rng);
      const total = sum(st.seats.map((s) => s.stack)) + st.hand.pot;
      let guard = 0;
      while (!st.over && guard++ < 4000) {
        if (st.hand.phase === 'done') {
          reasons[st.hand.result.reason] = (reasons[st.hand.result.reason] || 0) + 1;
          T.nextHand(st, rng);
          continue;
        }
        const seat = T.actor(st);
        const out = T.apply(st, seat, T.botAction(st, seat, rng));
        moves++;
        if (out.error) legal = false;
        const now = sum(st.seats.map((s) => s.stack)) + (st.hand.phase === 'done' ? 0 : st.hand.pot);
        if (now !== total) conserve = false;
      }
    }
  });
  assert(legal && moves > 300, 'Teen Patti bots (Easy / Normal / Smart) only make legal moves (' + moves + ')');
  assert(conserve, 'chips conserve through every bot table and variant');
  assert(reasons.show && reasons.fold && (reasons.sideshow || reasons.potlimit), 'bot tables reach shows, folds and side shows / pot-limit shows (' + JSON.stringify(reasons) + ')');
  let smart = 0;
  let easy = 0;
  for (let g = 0; g < 6; g++) {
    const rng = seeded(500 + g);
    const st = T.newMatch([{ id: 's', name: 'S', bot: true, level: 'smart' }, { id: 'e1', name: 'E1', bot: true, level: 'easy' }, { id: 'e2', name: 'E2', bot: true, level: 'easy' }], { buyIn: 500, hands: 30 }, rng);
    let guard = 0;
    while (!st.over && guard++ < 6000) {
      if (st.hand.phase === 'done') T.nextHand(st, rng);
      else T.apply(st, T.actor(st), T.botAction(st, T.actor(st), rng));
    }
    smart += st.seats[0].stack - st.seats[0].initial;
    easy += st.seats[1].stack - st.seats[1].initial + st.seats[2].stack - st.seats[2].initial;
  }
  assert(smart > 0 && smart > easy / 2, 'Smart bots out-earn Easy bots over 6 tables (smart ' + smart + ', easy ' + easy + ')');
}

// ======================================================================= Rummy bots + coach

function botSeats(levels) {
  return levels.map((l, i) => ({ id: 'b' + i, name: 'Bot ' + i, bot: true, level: l }));
}
function playOut(st, rng, cap) {
  let guard = 0;
  let bad = 0;
  while (!st.over && guard++ < (cap || 4000)) {
    if (st.deal.phase === 'done') {
      R.nextDeal(st, rng);
      continue;
    }
    const pend = R.meldPending(st);
    const seat = st.deal.phase === 'meld' ? pend[0] : st.deal.turn;
    const a = R.botAction(st, seat, rng);
    const out = R.apply(st, seat, a, { rng });
    if (out.error) bad++;
    if (out.valid === false) bad++;
  }
  return bad;
}
{
  let bad = 0;
  const rng = seeded(71);
  [['easy', 'normal', 'expert'], ['expert', 'expert', 'easy', 'normal', 'expert', 'easy']].forEach((lv) => {
    const st = R.newMatch(botSeats(lv), { mode: '13', format: 'pool', pool: 101 }, rng);
    bad += playOut(st, rng);
    if (!st.over) bad++;
  });
  const deals = R.newMatch(botSeats(['expert', 'normal', 'easy']), { mode: '13', format: 'deals', deals: 3 }, rng);
  bad += playOut(deals, rng);
  const gin = R.newMatch(botSeats(['expert', 'easy']), { mode: 'gin', target: 50 }, rng);
  bad += playOut(gin, rng, 3000);
  assert(bad === 0 && deals.over && gin.over, 'Rummy bots (Easy / Normal / Expert) play Pool, Deals and Gin to the end with only legal moves and no wrong shows');

  let expert = 0;
  const games = 12;
  for (let g = 0; g < games; g++) {
    const r = seeded(900 + g);
    const lv = g % 2 ? ['expert', 'easy'] : ['easy', 'expert'];
    const st = R.newMatch(botSeats(lv), { mode: '13', format: 'points' }, r);
    playOut(st, r);
    if (st.seats[st.winner].level === 'expert') expert++;
  }
  assert(expert >= Math.ceil(games * 0.6), 'Expert beats Easy in most 13-card deals (' + expert + '/' + games + ')');
  let ginExpert = 0;
  const handsWon = { expert: 0, easy: 0 };
  for (let g = 0; g < 12; g++) {
    const r = seeded(1300 + g);
    const lv = g % 2 ? ['expert', 'easy'] : ['easy', 'expert'];
    const st = R.newMatch(botSeats(lv), { mode: 'gin', target: 100 }, r);
    let guard = 0;
    while (!st.over && guard++ < 5000) {
      if (st.deal.phase === 'done') {
        const res = st.deal.result;
        if (res.winner >= 0) handsWon[st.seats[res.winner].level]++;
        R.nextDeal(st, r);
        continue;
      }
      R.apply(st, st.deal.turn, R.botAction(st, st.deal.turn, r), { rng: r });
    }
    if (st.over && st.seats[st.winner].level === 'expert') ginExpert++;
  }
  const share = handsWon.expert / Math.max(1, handsWon.expert + handsWon.easy);
  assert(ginExpert >= 7 && share > 0.55, 'Expert wins most Gin games against Easy (' + ginExpert + '/12 games, ' + Math.round(share * 100) + '% of hands)');
  const src = read('public/src/js/games/rummy-core.js');
  assert(!/fetch\(|anthropic|AI_FEATURES|callModel/i.test(src), 'Rummy bots are deterministic search, no AI calls');
}
{
  // Coach: mistakes are found by the rules engine; the review names only those cards.
  const st = fresh13(2, { format: 'points' }, 21);
  const d = st.deal;
  const s = d.turn;
  d.wildRank = 13;
  d.hands[s] = ['AH1', '2H1', '3H1', '5S1', '6S1', '7S1', '9C1', '9D1', '9H1', 'TD1', 'JD1', 'QD1', 'KD1'];
  d.closed.push('2C1');
  R.apply(st, s, { type: 'draw', from: 'closed' });
  const miss = R.coachCheck(st, s, { type: 'discard', card: '2C1' });
  assert(miss && miss.kind === 'declare', 'coach spots a missed valid show');
  const jok = fresh13(2, {}, 22);
  const jd = jok.deal;
  const js = jd.turn;
  jd.wildRank = 5;
  jd.hands[js] = ['AH1', '2H1', '3H1', '5S1', '6S1', 'KS1', '9C1', 'QD1', '9H1', 'TD1', '8D1', '3D1', '4C1'];
  jd.closed.push('7C1');
  R.apply(jok, js, { type: 'draw', from: 'closed' });
  const jm = R.coachCheck(jok, js, { type: 'discard', card: '5S1' });
  assert(jm && jm.kind === 'joker', 'coach flags throwing a joker');
  const rv = R.coachReview([miss, jm], { won: false, points: 40 });
  assert(rv.tips.length === 2 && rv.allowedCards.indexOf('2♣') >= 0 && /40 points/.test(rv.text), 'deterministic review: top mistakes, tips, allowed cards');
  assert(R.validateCoachText(rv.text + ' ' + rv.tips.join(' '), rv.allowedCards).ok, 'the deterministic review passes its own grounding check');
  assert(!R.validateCoachText('Throw the Jack of clubs next time', rv.allowedCards).ok && !R.validateCoachText('Keep the 6♥', rv.allowedCards).ok, 'grounding rejects any card not in the review');
}

// ======================================================================= Live rooms

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
const codeOf = (fn) => {
  try {
    fn();
    return null;
  } catch (e) {
    return e.code || e.message;
  }
};

/** Play a Rummy room with each human seat choosing the bot's move, sent through the room ops. */
function driveRummy(room, now, cap) {
  let t = now;
  const rng = seeded(41);
  for (let i = 0; i < (cap || 3000); i++) {
    const st = room.server.pub;
    if (st.over) break;
    t += 10;
    const d = st.deal;
    if (d.phase === 'done' || st.seats[d.turn].bot) {
      t = Math.max(t, (room.pub.deadline || t) + 1);
      room = PD.reduceRoom(rt(room), A, 'tick', {}, t).room;
      continue;
    }
    if (d.phase === 'meld') {
      const seat = R.meldPending(st)[0];
      room = PD.reduceRoom(rt(room), st.seats[seat].id, 'meld', { groups: R.arrange(d.hands[seat], d.wildRank) }, t).room;
      continue;
    }
    const seat = d.turn;
    const a = R.botAction(st, seat, rng);
    const args = Object.assign({}, a);
    delete args.type;
    room = PD.reduceRoom(rt(room), st.seats[seat].id, a.type, args, t).room;
  }
  return { room, now: t };
}

function handCardsIn(json, cards) {
  return cards.filter((c) => json.indexOf('"' + c + '"') >= 0);
}

{
  const now = 1.7e12;
  // Friendly (no chips) 13-card table: anyone may play, no age gate.
  let room = PD.newRoom({ game: 'rummy', uid: A, name: 'Asha', settings: { mode: '13', format: 'points', rate: 0 }, now, adult: 'under_18' });
  room = PD.reduceRoom(rt(room), B, 'join', { name: 'Ben', adult: 'confirm' }, now).room;
  room = PD.reduceRoom(rt(room), Cc, 'join', { name: 'Cy', adult: 'ok' }, now).room;
  room = PD.reduceRoom(rt(room), A, 'start', { adult: 'under_18' }, now).room;
  const st = room.server.pub;
  assert(room.pub.status === 'playing' && st.seats.length === 3 && st.mode === '13', 'friendly Rummy table: open to everyone (no chips, no age gate)');
  assert(room.pub.deadline === now + Policy.policyFor('rummy').turnMs, 'Live turn clock from the Live policy');
  const pubJson = JSON.stringify(room.pub);
  const leaks = st.seats.map((s, i) => handCardsIn(pubJson, st.deal.hands[i]).length);
  assert(leaks.every((n) => n === 0) && !room.pub.state.deal.hands, 'no hand appears in the public room state');
  const others = st.seats.map((s, i) => i).filter((i) => st.seats[i].id !== A);
  const aSecret = JSON.stringify(room.secrets[A]);
  assert(room.secrets[A].hand.length >= 13 && others.every((i) => handCardsIn(aSecret, st.deal.hands[i]).length === 0), 'each secret holds only its owner’s hand');
  assert(room.pub.state.deal.closed === st.deal.closed.length && typeof room.pub.state.deal.closed === 'number', 'the closed deck is only a count in public');
  const notTurn = st.seats.find((s, i) => i !== st.deal.turn).id;
  assert(codeOf(() => PD.reduceRoom(rt(room), notTurn, 'draw', { from: 'closed' }, now + 5)) === 'not_your_turn', 'server rejects a move out of turn');
  const turnId = st.seats[st.deal.turn].id;
  const r2 = PD.reduceRoom(rt(room), turnId, 'draw', { from: 'closed' }, now + 5).room;
  const bad = codeOf(() => PD.reduceRoom(rt(r2), turnId, 'discard', { card: 'ZZ9' }, now + 6));
  assert(bad === 'no_card', 'server rejects a card you don’t hold');
  const hand = r2.server.pub.deal.hands[r2.server.pub.deal.turn];
  const wrong = PD.reduceRoom(rt(r2), turnId, 'declare', { card: hand[0], groups: [hand.slice(1)] }, now + 7);
  assert(wrong.result.valid === false && wrong.room.server.pub.deal.results[r2.server.pub.deal.turn].points === 80, 'a wrong declaration from the phone is detected by the server (80)');
  const out = driveRummy(room, now + 10);
  assert(out.room.server.pub.over, 'Live Points deal plays to the end on the server');
  const req = out.room.server.settleReq;
  assert(req && !req.kind && req.stake === 0 && req.ranking.length === 3, 'friendly table settles as a chip-free placement');
  const fin = JSON.stringify(out.room.pub.state);
  assert(out.room.pub.state.deal.phase === 'done' && out.room.pub.state.deal.results.every((r) => !r || r.groups === null || Array.isArray(r.groups)), 'after the deal, the shows become public');
  assert(fin.length > 0, 'final state publishes');

  // Reconnect: cold hydrate after RTDB drops empties.
  const cold = rt(room);
  assert(cold.server.pub.deal.hands.length === 3 && Array.isArray(cold.server.pub.deal.picks[0]) && cold.server.bank.length === 3, 'reconnect: server state restores after RTDB drops empty arrays');
}

// Chip tables are 18+: create / join / settings / start all check the server-side status.
{
  const now = 1.75e12;
  assert(codeOf(() => PD.newRoom({ game: 'rummy', uid: A, name: 'A', settings: { mode: '13', format: 'points', rate: 1 }, now, adult: 'confirm' })) === 'age_confirm', 'Rummy chip table: unconfirmed host must confirm 18+');
  assert(codeOf(() => PD.newRoom({ game: 'rummy', uid: A, name: 'A', settings: { mode: '13', format: 'points', rate: 1 }, now, adult: 'under_18' })) === 'age_gate', 'Rummy chip table: under-18 blocked');
  let room = PD.newRoom({ game: 'rummy', uid: A, name: 'A', settings: { mode: '13', format: 'points', rate: 1 }, now, adult: 'ok' });
  assert(codeOf(() => PD.reduceRoom(rt(room), B, 'join', { name: 'B', adult: 'under_18' }, now)) === 'age_gate', 'Rummy chip table: an under-18 player can’t join');
  let fr = PD.newRoom({ game: 'rummy', uid: A, name: 'A', settings: { mode: '13', format: 'points', rate: 0 }, now, adult: 'ok' });
  fr = PD.reduceRoom(rt(fr), B, 'join', { name: 'B', adult: 'under_18' }, now).room;
  assert(codeOf(() => PD.reduceRoom(rt(fr), A, 'settings', { settings: { rate: 1 }, adult: 'ok' }, now)) === 'age_gate', 'Rummy: a table with a minor can’t switch to chips');
  const withBots = PD.newRoom({ game: 'rummy', uid: A, name: 'A', settings: { mode: '13', format: 'points', rate: 5, bots: 2 }, now, adult: 'under_18' });
  assert(withBots.pub.status === 'lobby', 'Rummy: a table with bots is friendly (no chips) → open');

  assert(codeOf(() => PD.newRoom({ game: 'teenpatti', uid: A, name: 'A', settings: { buyIn: 0 }, now, adult: 'confirm' })) === 'age_confirm', 'Teen Patti: 18+ confirmation required, even with play chips');
  assert(codeOf(() => PD.newRoom({ game: 'teenpatti', uid: A, name: 'A', settings: { buyIn: 0, bots: 3 }, now, adult: 'under_18' })) === 'age_gate', 'Teen Patti: under-18 blocked everywhere');
  let tp = PD.newRoom({ game: 'teenpatti', uid: A, name: 'A', settings: { buyIn: 0, bots: 2 }, now, adult: 'ok' });
  assert(codeOf(() => PD.reduceRoom(rt(tp), B, 'join', { name: 'B', adult: 'confirm' }, now)) === 'age_confirm', 'Teen Patti: joiners confirm 18+ too');
  tp = PD.reduceRoom(rt(tp), B, 'join', { name: 'B', adult: 'ok' }, now).room;
  tp = PD.reduceRoom(rt(tp), A, 'start', { adult: 'ok' }, now).room;
  assert(tp.server.pub.seats.length === 4 && tp.server.chip === 0, 'Teen Patti with bots: play chips only');

  const graduation = read('public/src/js/dangal/dangal-graduation.js');
  assert(/AGE_GATED_IDS = \['poker', 'teenpatti'\]/.test(graduation), 'client: Teen Patti is age-gated at launch and hidden from under-18 lists');
  const rui = read('public/src/js/games/rummy-ui.js');
  const tui = read('public/src/js/games/teenpatti-ui.js');
  assert(/openAgeGateSheet/.test(rui) && /isChipTable/.test(rui) && /openAgeGateSheet|adultOk/.test(tui), 'client: Rummy asks for 18+ only at chip tables; Teen Patti always');
}

// Rummy chip ledger: 3 humans, Points at 1 chip a point.
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
          else store[p] = clone(next);
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

/** Play a Teen Patti room: humans follow the bot policy through the room ops. */
function driveTp(room, now, cap) {
  let t = now;
  const rng = seeded(61);
  const checks = { blindHidden: true, seenOwn: false, noCross: true };
  for (let i = 0; i < (cap || 6000); i++) {
    const st = room.server.pub;
    if (st.over) break;
    t += 10;
    const h = st.hand;
    const seat = T.actor(st);
    const pubJson = JSON.stringify(room.pub);
    st.seats.forEach((s, k) => {
      if (h.phase !== 'done' && handCardsIn(pubJson, h.cards[k] || []).length) checks.blindHidden = false;
      const sec = room.secrets[s.id];
      if (!sec) return;
      if (!h.seen[k] && h.phase !== 'done' && sec.cards) checks.blindHidden = false;
      if (h.seen[k] && sec.cards && sec.cards.join() === h.cards[k].join()) checks.seenOwn = true;
      st.seats.forEach((o, j) => {
        if (j === k || h.phase === 'done') return;
        const peeked = (h.peeks[k] || []).indexOf(j) >= 0;
        if (!peeked && handCardsIn(JSON.stringify(sec), h.cards[j] || []).length) checks.noCross = false;
      });
    });
    if (h.phase === 'done' || seat < 0 || st.seats[seat].bot) {
      t = Math.max(t, (room.pub.deadline || t) + 1);
      room = PD.reduceRoom(rt(room), A, 'tick', {}, t).room;
      continue;
    }
    const a = T.botAction(st, seat, rng);
    const args = Object.assign({}, a);
    delete args.type;
    room = PD.reduceRoom(rt(room), st.seats[seat].id, a.type, args, t).room;
  }
  return { room, now: t, checks };
}

(async () => {
  const econ = require(path.join(root, 'server-lib/dangal-economy.js'));
  assert(econ.SERVER_SETTLED.has('rummy') && econ.SERVER_SETTLED.has('teenpatti'), 'Rummy and Teen Patti are server-settled only (clients can’t self-report)');

  // ledgerDeltas: pure conservation + caps.
  {
    const d1 = econ.ledgerDeltas({ x: -30, y: -50, z: 80 }, { x: 1000, y: 1000 });
    assert(sum(Object.values(d1)) === 0 && d1.z === 80, 'ledger: winners receive exactly what losers pay');
    const d2 = econ.ledgerDeltas({ x: -300, y: -50, z: 350 }, { x: 100, y: 1000 });
    assert(d2.x === -100 && d2.z === 150 && sum(Object.values(d2)) === 0, 'ledger: a loss is capped at the wallet balance; the winner gets only what was paid');
    const d3 = econ.ledgerDeltas({ x: -900, z: 900 }, { x: 5000 });
    assert(d3.x === -500 && d3.z === 500, 'ledger: a loss is capped at the stake cap (500)');
    const d4 = econ.ledgerDeltas({ x: -41, y: 20, z: 21 }, { x: 1000 });
    assert(sum(Object.values(d4)) === 0 && d4.y + d4.z === 41, 'ledger: several winners share pro rata, remainder to the top winner');
    const d5 = econ.ledgerDeltas({ x: -10, y: -10 }, { x: 100, y: 100 });
    assert(d5.x === 0 && d5.y === 0, 'ledger: no winner → nothing moves');
  }

  const seed = async (db, ids, bal) => {
    for (const id of ids) {
      for (const k of ['first_game', 'first_win', 'won_stake']) await db.collection('users').doc(id).collection('achievements').doc(k).set({ key: k });
      await db.collection('users').doc(id).collection('wallet').doc('chips').set({ balance: bal, lifetimeEarned: bal });
    }
  };
  const balOf = (db, u) => (db.store.get('users/' + u + '/wallet/chips') || {}).balance;

  // Rummy chip table (3 humans, Points 1 chip/point) → ledger.
  {
    const now = 2e12;
    let room = PD.newRoom({ game: 'rummy', uid: A, name: 'Asha', settings: { mode: '13', format: 'points', rate: 1 }, now, adult: 'ok' });
    room = PD.reduceRoom(rt(room), B, 'join', { name: 'Ben', adult: 'ok' }, now).room;
    room = PD.reduceRoom(rt(room), Cc, 'join', { name: 'Cy', adult: 'ok' }, now).room;
    room = PD.reduceRoom(rt(room), A, 'start', { adult: 'ok' }, now).room;
    assert(room.server.chip === 1, 'chip table: 3 adults, Points at 1 chip a point');
    const out = driveRummy(room, now + 10);
    room = out.room;
    const st = room.server.pub;
    const req = room.server.settleReq;
    assert(st.over && req && req.kind === 'ledger' && sum(Object.values(req.deltas)) === 0, 'Points chip table settles as a zero-sum ledger');
    const loser = st.seats.find((s, i) => i !== st.winner);
    assert(req.deltas[loser.id] === -loser.score, 'each loser pays their points × the rate');
    const db = memDb();
    await seed(db, [A, B, Cc], 1000);
    const r = fakeRtdb();
    const key = 'games/rummy/RMYABC';
    r.store[key] = clone(room);
    const res = await PD.settleRoom({ database: () => r }, r, key, clone(req), { economy: econ, db, admin: db.admin });
    const totalAfter = sum([A, B, Cc].map((u) => balOf(db, u)));
    const bonus = sum([A, B, Cc].map((u) => res.results[u].chipDelta)) - sum(Object.values(req.deltas));
    assert(res.status === 'done' && totalAfter === 3000 + bonus && (bonus === 0 || bonus === 25), 'settlement: chips conserve (only the usual +25 win bonus is minted)');
    const again = await PD.settleRoom({ database: () => r }, r, key, clone(req), { economy: econ, db, admin: db.admin });
    assert(again.status === 'done' && sum([A, B, Cc].map((u) => balOf(db, u))) === totalAfter, 'ledger settlement is idempotent by match id');
    const claim = await econ.resolveGame(db, db.admin, A, { gameType: 'rummy', result: 'win', won: true, opponentUid: B, stake: 100, matchId: 'x1' });
    assert(claim.serverSettled && sum([A, B, Cc].map((u) => balOf(db, u))) === totalAfter, 'a client-reported Rummy win is ignored');
  }

  // Rummy Pool with rejoin fee through the room (2 humans + chips → h2h pot).
  {
    const now = 2.1e12;
    let room = PD.newRoom({ game: 'rummy', uid: A, name: 'A', settings: { mode: '13', format: 'pool', pool: 101, fee: 10 }, now, adult: 'ok' });
    room = PD.reduceRoom(rt(room), B, 'join', { name: 'B', adult: 'ok' }, now).room;
    room = PD.reduceRoom(rt(room), Cc, 'join', { name: 'C', adult: 'ok' }, now).room;
    room = PD.reduceRoom(rt(room), A, 'start', { adult: 'ok' }, now).room;
    assert(room.server.pot === 30, 'Pool: every entry pays the fee into the pot');
    const st = room.server.pub;
    const x = st.deal.turn;
    st.seats[x].score = 95;
    let t = now + 5;
    room = PD.reduceRoom(rt(room), st.seats[x].id, 'drop', {}, t).room;
    const y = room.server.pub.deal.turn;
    room = PD.reduceRoom(rt(room), room.server.pub.seats[y].id, 'drop', {}, t + 1).room;
    const xs = room.server.pub.seats[x];
    assert(xs.out && room.secrets[xs.id].canRejoin, 'Pool: eliminated player is offered a rejoin');
    room = PD.reduceRoom(rt(room), xs.id, 'rejoin', {}, t + 2).room;
    assert(!room.server.pub.seats[x].out && room.server.pot === 40 && room.server.pub.seats[x].entries === 2, 'Pool rejoin pays another fee into the pot');
    const out = driveRummy(room, t + 3, 6000);
    const req = out.room.server.settleReq;
    assert(out.room.server.pub.over && req.kind === 'ledger' && sum(Object.values(req.deltas)) === 0 && req.deltas[xs.id] <= -20 + (req.winners[0] === xs.id ? 40 : 0), 'Pool ledger: entries + rejoins pay in, the winner takes the pot (zero-sum)');
  }

  // Gin Live: two humans → rated head-to-head.
  {
    const now = 2.2e12;
    let room = PD.newRoom({ game: 'rummy', uid: A, name: 'A', settings: { mode: 'gin', target: 50, stake: 25 }, now, adult: 'ok' });
    room = PD.reduceRoom(rt(room), B, 'join', { name: 'B', adult: 'ok' }, now).room;
    assert(codeOf(() => PD.reduceRoom(rt(room), Cc, 'join', { name: 'C', adult: 'ok' }, now)) === 'room_full', 'Gin seats two');
    room = PD.reduceRoom(rt(room), A, 'start', { adult: 'ok' }, now).room;
    const out = driveRummy(room, now + 5, 6000);
    const req = out.room.server.settleReq;
    assert(out.room.server.pub.over && req.kind === 'h2h' && req.rated && req.stake === 25, 'Gin Live: two humans settle rated head-to-head with the stake');
    let rs = PD.newRoom({ game: 'rummy', uid: A, name: 'A', settings: { mode: 'gin' }, now, adult: 'ok' });
    rs = PD.reduceRoom(rt(rs), B, 'join', { name: 'B', adult: 'ok' }, now).room;
    rs = PD.reduceRoom(rt(rs), A, 'start', { adult: 'ok' }, now).room;
    rs = PD.reduceRoom(rt(rs), B, 'resign', {}, now + 5).room;
    assert(rs.server.pub.over && rs.server.pub.winner === rs.server.pub.seats.findIndex((s) => s.id === A), 'Gin: resign concedes the game');
  }

  // AFK: turn clock → extra-time bank → auto-play → auto-drop.
  {
    const now = 2.3e12;
    let room = PD.newRoom({ game: 'rummy', uid: A, name: 'A', settings: { mode: '13', format: 'points' }, now, adult: 'ok' });
    room = PD.reduceRoom(rt(room), B, 'join', { name: 'B', adult: 'ok' }, now).room;
    room = PD.reduceRoom(rt(room), Cc, 'join', { name: 'C', adult: 'ok' }, now).room;
    room = PD.reduceRoom(rt(room), A, 'start', { adult: 'ok' }, now).room;
    const first = room.server.pub.deal.turn;
    let t = room.pub.deadline + 1;
    room = PD.reduceRoom(rt(room), A, 'tick', {}, t).room;
    assert(room.server.inBank && room.pub.state.inBank && room.server.pub.deal.turn === first, 'turn clock runs out → the extra-time bank starts');
    t = room.pub.deadline + 1;
    room = PD.reduceRoom(rt(room), A, 'tick', {}, t).room;
    assert(room.server.pub.deal.turn !== first && room.server.pub.seats[first].afk === 1 && room.server.bank[first] === 0, 'bank spent → auto-play (draw + throw), one AFK miss');
    let guard = 0;
    while (!room.server.pub.over && room.server.pub.deal.turn !== first && guard++ < 20) {
      t = room.pub.deadline + 1;
      room = PD.reduceRoom(rt(room), A, 'tick', {}, t).room;
    }
    t = room.pub.deadline + 1;
    room = PD.reduceRoom(rt(room), A, 'tick', {}, t).room;
    const r = room.server.pub.deal.results[first];
    assert(r && /drop/.test(r.kind), 'second miss in a row → auto-drop (' + (r && r.kind) + ')');
    const lv = PD.reduceRoom(rt(room), room.server.pub.seats.find((s, i) => i !== first && room.server.pub.deal.active[i]).id, 'leave', {}, t + 1).room;
    assert(lv.server.pub.over || lv.server.pub.deal.results.filter(Boolean).some((x) => x.kind === 'left'), 'leaving mid-deal = full count, the deal plays on');
  }

  // Teen Patti Live: 3 adults, 100 buy-in, stacks from the wallet, zero-sum ledger.
  {
    const now = 2.4e12;
    let room = PD.newRoom({ game: 'teenpatti', uid: A, name: 'A', settings: { buyIn: 100, hands: 10 }, now, adult: 'ok' });
    room = PD.reduceRoom(rt(room), B, 'join', { name: 'B', adult: 'ok' }, now).room;
    assert(codeOf(() => PD.reduceRoom(rt(room), A, 'start', { adult: 'ok', prep: { balances: { [A]: 500, [B]: 500 } } }, now)) === 'need_players', 'Teen Patti needs 3 players');
    room = PD.reduceRoom(rt(room), Cc, 'join', { name: 'C', adult: 'ok' }, now).room;
    assert(codeOf(() => PD.reduceRoom(rt(room), A, 'start', { adult: 'ok', prep: { balances: { [A]: 500, [B]: 500, [Cc]: 3 } } }, now)) === 'insufficient_chips', 'a player without enough chips for the table can’t be dealt in');
    room = PD.reduceRoom(rt(room), A, 'start', { adult: 'ok', prep: { balances: { [A]: 500, [B]: 60, [Cc]: 1000 } } }, now).room;
    const st = room.server.pub;
    assert(room.server.chip === 100 && st.seats.map((s) => s.initial).join() === '100,60,100', 'stack = min(buy-in, wallet)');
    assert(st.boot === 2 && st.hand.pot === 6, 'boot scales with the buy-in (buy-in / 50)');
    assert([A, B, Cc].every((u) => room.secrets[u].cards === null && room.secrets[u].seen === false), 'blind play is real: no cards reach a phone until its owner looks');
    const turnId = st.seats[st.hand.turn].id;
    const seenRoom = PD.reduceRoom(rt(room), turnId, 'see', {}, now + 1).room;
    const ti = st.hand.turn;
    assert(seenRoom.secrets[turnId].cards.join() === seenRoom.server.pub.hand.cards[ti].join() && seenRoom.secrets[turnId].name, 'after “See cards” only that player receives their hand');
    const other = [A, B, Cc].find((u) => u !== turnId);
    assert(handCardsIn(JSON.stringify(seenRoom.secrets[other]), seenRoom.server.pub.hand.cards[ti]).length === 0, 'other players never receive it');
    const out = driveTp(room, now + 5);
    room = out.room;
    const fin = room.server.pub;
    assert(fin.over && out.checks.blindHidden && out.checks.seenOwn && out.checks.noCross, 'Live table plays out; hands stay hidden from everyone else throughout');
    const req = room.server.settleReq;
    assert(req && req.kind === 'ledger' && sum(Object.values(req.deltas)) === 0, 'Teen Patti table settles stacks − starting stacks as a zero-sum ledger');
    assert(sum(fin.seats.map((s) => s.stack)) === 260, 'chips conserve on the table');
    const db = memDb();
    await seed(db, [A, B, Cc], 0);
    await db.collection('users').doc(A).collection('wallet').doc('chips').set({ balance: 500, lifetimeEarned: 500 });
    await db.collection('users').doc(B).collection('wallet').doc('chips').set({ balance: 60, lifetimeEarned: 60 });
    await db.collection('users').doc(Cc).collection('wallet').doc('chips').set({ balance: 1000, lifetimeEarned: 1000 });
    const r = fakeRtdb();
    const key = 'games/teenpatti/TPABCD';
    r.store[key] = clone(room);
    const direct = await econ.resolveLedger(db, db.admin, { gameType: 'teenpatti', matchId: req.matchId, deltas: req.deltas, ranking: req.ranking, winners: req.winners });
    const stakeSum = sum(Object.values(direct.players).map((p) => p.stakeDelta));
    assert(stakeSum === 0 && Object.keys(direct.players).length === 3, 'resolveLedger moves a zero-sum set of chips');
    const res = await PD.settleRoom({ database: () => r }, r, key, clone(req), { economy: econ, db, admin: db.admin });
    assert(res.status === 'done' && sum([A, B, Cc].map((u) => balOf(db, u))) === 1560 + sum(Object.values(direct.players).map((p) => p.chipDelta - p.stakeDelta)), 'Teen Patti settlement is idempotent after the direct resolve (same match id)');

    // prepare() reads wallets outside the transaction.
    const prepRtdb = fakeRtdb();
    prepRtdb.store['games/teenpatti/PREPAB'] = { pub: { settings: { buyIn: 250 }, players: { [A]: { name: 'A' }, [B]: { name: 'B' } } } };
    const prep = await PD.GAMES.teenpatti.prepare({}, prepRtdb, 'games/teenpatti/PREPAB', A, { economy: econ, db, admin: db.admin });
    assert(prep.balances && typeof prep.balances[A] === 'number' && typeof prep.balances[B] === 'number', 'start reads each wallet on the server for the buy-in');
  }

  // Teen Patti AFK: a timeout packs; two in a row sit the player out.
  {
    const now = 2.5e12;
    let room = PD.newRoom({ game: 'teenpatti', uid: A, name: 'A', settings: { buyIn: 0, bots: 0 }, now, adult: 'ok' });
    room = PD.reduceRoom(rt(room), B, 'join', { name: 'B', adult: 'ok' }, now).room;
    room = PD.reduceRoom(rt(room), Cc, 'join', { name: 'C', adult: 'ok' }, now).room;
    room = PD.reduceRoom(rt(room), D, 'join', { name: 'D', adult: 'ok' }, now).room;
    room = PD.reduceRoom(rt(room), A, 'start', { adult: 'ok' }, now).room;
    const first = room.server.pub.hand.turn;
    let t = room.pub.deadline + 1;
    room = PD.reduceRoom(rt(room), A, 'tick', {}, t).room;
    assert(room.server.inBank, 'turn clock → extra-time bank');
    t = room.pub.deadline + 1;
    room = PD.reduceRoom(rt(room), A, 'tick', {}, t).room;
    assert(!room.server.pub.hand.inHand[first] && room.server.pub.seats[first].afk === 1, 'a timeout packs (one AFK miss)');
    const lv = PD.reduceRoom(rt(room), room.server.pub.seats[room.server.pub.hand.turn].id, 'leave', {}, t + 1).room;
    assert(lv.server.pub.seats.some((s) => s.left), 'leaving packs and leaves the table');
  }

  // Coach with AI off → the deterministic review; AI output naming other cards is rejected.
  {
    const AI = require(path.join(root, 'server-lib/dangal-ai.js'));
    const review = { text: 'You finished on 40 points. 1 decision cost about 30 points. Biggest: put 4♣ on Finish.', tips: ['Turn 3: you had a valid show — put 4♣ on Finish and declare.'], allowedCards: ['4♣', '2♣'] };
    const off = AI.createDangalAI({ env: {}, callAI: () => {
      throw new Error('should not be called');
    } });
    const r1 = await off.coachExplain({ gameId: 'rummy', situation: 'review', move: '', engineText: review.text, engineTips: review.tips, allowedCards: review.allowedCards });
    assert(r1.source === 'fallback' && r1.data.text === review.text && r1.data.tips[0] === review.tips[0], 'coach with AI off: the deterministic review, word for word');
    const on = AI.createDangalAI({ env: { AI_FEATURES_ENABLED: 'true' }, callAI: async () => ({ text: JSON.stringify({ text: 'Next time throw the K♠ early.', tips: [] }) }) });
    const r2 = await on.coachExplain({ gameId: 'rummy', situation: 'review', move: '', engineText: review.text, engineTips: review.tips, allowedCards: review.allowedCards }, { uid: 'u1' });
    assert(r2.source === 'fallback' && r2.reason === 'invalid_output', 'AI coach text naming a card outside the review is rejected (grounded)');
    const on2 = AI.createDangalAI({ env: { AI_FEATURES_ENABLED: 'true' }, callAI: async () => ({ text: JSON.stringify({ text: 'You had a winning hand — the 4♣ belonged on Finish.', tips: ['Check for a valid show before you throw.'] }) }) });
    const r3 = await on2.coachExplain({ gameId: 'rummy', situation: 'review2', move: '', engineText: review.text, engineTips: review.tips, allowedCards: review.allowedCards }, { uid: 'u2' });
    assert(r3.source === 'ai', 'grounded AI rephrasing is accepted');
    assert(!AI.cardsGrounded({ gameId: 'rummy' }, { text: 'x', tips: [] }), 'a Rummy coach call without allowed cards is never trusted');
    const ui = read('public/src/js/games/rummy-ui.js');
    assert(/coachExplain/.test(ui) && /validateCoachText/.test(ui) && /!vm\.live|practice|local/i.test(ui), 'client: the coach runs only in practice / vs bots and re-checks the AI text');
  }

  // ======================================================================= wiring + compliance
  {
    const html = read('public/index.html');
    assert(/data-party-lazy src="\/src\/js\/games\/rummy-core\.js/.test(html) && /src="\/src\/js\/games\/rummy-ui\.js/.test(html), 'index.html loads rummy core (lazy) + rummy-ui');
    assert(/data-party-lazy src="\/src\/js\/games\/teenpatti-core\.js/.test(html) && /src="\/src\/js\/games\/teenpatti-ui\.js/.test(html), 'index.html loads teen patti core (lazy) + teenpatti-ui');
    const kit = read('public/src/js/games/party-kit.js');
    assert(/rummy: \['games\/rummy-core\.js'\]/.test(kit) && /teenpatti: \['games\/teenpatti-core\.js'\]/.test(kit), 'party-kit lazy data for both games');
    const pc = read('public/src/js/games/party-classics.js');
    assert(!/\{ id: 'rummy', name:/.test(pc) && !/\{ id: 'teenpatti', name:/.test(pc) && !/window\.openRummy = /.test(pc) && !/window\.openTeenPatti = /.test(pc), 'old party-classics Rummy / Teen Patti no longer registered');
    const rui = read('public/src/js/games/rummy-ui.js');
    const tui = read('public/src/js/games/teenpatti-ui.js');
    assert(/id: 'rummy'/.test(rui) && /registerPartyGame\(GAME/.test(rui) && /window\.openRummy/.test(rui) && /t\('rummy\.' \+ key/.test(rui), 'rummy-ui registers the game + party room, copy through i18n');
    assert(/id: 'teenpatti'/.test(tui) && /registerPartyGame\(GAME/.test(tui) && /window\.openTeenPatti/.test(tui) && /t\('teenpatti\.' \+ key/.test(tui), 'teenpatti-ui registers the game + party room, copy through i18n');
    assert(/isIndiaLocale\(\) \? '13' : 'gin'/.test(rui), 'locale default: India → 13-card, elsewhere → Gin');
    assert(/tr\('bot', 'Bot'\)/.test(rui) && /'Bot ' \+/.test(read('server-lib/rummy-engine.js')) && /'Bot ' \+/.test(read('server-lib/teenpatti-engine.js')), 'bots are labelled "Bot"');
    assert(/helper/.test(rui) && /coach: true, helper: false/.test(rui), 'beginner helpers off by default (practice toggle), coach on');
    const Rules = require(path.join(root, 'public/src/js/dangal/dangal-rules.js'));
    const rr = Rules.get('rummy');
    const tr = Rules.get('teenpatti');
    assert(rr && rr.variants.some((v) => v.key === 'mode') && rr.variants.some((v) => v.key === 'format') && JSON.stringify(rr).indexOf('80') >= 0, 'Rules sheet: Rummy modes, formats and the 80-point cap');
    assert(tr && tr.variants.some((v) => v.key === 'variant') && /A-2-3/.test(JSON.stringify(tr)), 'Rules sheet: Teen Patti variants and the A-2-3 ruling');
    assert(!/real money|cash out|buy chips/i.test(rui + tui) || /can’t be bought|never money|no real money/i.test(rui + tui), 'no real-money language (virtual chips only)');
    const gradSrc = read('public/src/js/dangal/dangal-graduation.js');
    assert(/rummy:\s*\{[^}]*liveParty/.test(gradSrc) && /teenpatti:\s*\{[^}]*liveParty/.test(gradSrc), 'graduation: both are Live party games');
    const rules = JSON.parse(read('firebase/database.rules.json'));
    const g = rules.rules.games || {};
    assert(g.rummy && g.rummy.$code.server['.read'] === false && g.rummy.$code.secrets && g.teenpatti && g.teenpatti.$code.server['.read'] === false, 'RTDB rules: rummy + teenpatti rooms, server state hidden, secrets per uid');
    const secretRule = JSON.stringify(g.teenpatti.$code.secrets);
    assert(/auth\.uid/.test(secretRule), 'RTDB rules: each secret readable only by its owner');
    const pol = Policy.policyFor('rummy');
    const tpol = Policy.policyFor('teenpatti');
    assert(pol.turnMs && pol.bankMs && tpol.turnMs && tpol.bankMs, 'Live policy: turn timer + extra-time bank for both');
    assert(!/Wordle|skribbl/i.test(rui + tui + read('server-lib/rummy-engine.js') + read('server-lib/teenpatti-engine.js')), 'no banned names');
    assert(!/players online|\d+ playing now/i.test(rui + tui), 'no fake player counts');
    const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
    assert(apiCount === 12, 'api/*.js = 12 (got ' + apiCount + ')');
  }

  if (failed) {
    console.error('\n' + failed + ' failure(s)');
    process.exit(1);
  }
  console.log('\nAll Dangal P8 card-game checks passed.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
