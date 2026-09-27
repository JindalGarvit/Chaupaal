/**
 * Texas Hold'em (No-Limit) core — pure. Shared by the client (Practice vs bots) and
 * server-lib/poker-engine.js (Live tables, where the server shuffles, deals and runs every hand).
 *
 * Cards are ints 0..51: rank = c >> 2 (0 = Two … 12 = Ace), suit = c & 3 (s h d c).
 * A hand object holds every hole card — only the server (or the local Practice table) ever has
 * one; clients get publicHand(), which carries nobody's cards except hands shown at showdown.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PokerCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RANKS = '23456789TJQKA';
  const SUITS = 'shdc';
  const SUIT_SYMBOLS = ['♠', '♥', '♦', '♣'];
  const RANK_NAMES = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
  const RANK_PLURAL = ['Twos', 'Threes', 'Fours', 'Fives', 'Sixes', 'Sevens', 'Eights', 'Nines', 'Tens', 'Jacks', 'Queens', 'Kings', 'Aces'];
  const CATEGORIES = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];

  /** Best to worst, for the rankings sheet. */
  const RANKINGS = [
    { name: 'Royal flush', example: ['As', 'Ks', 'Qs', 'Js', 'Ts'], desc: 'A-K-Q-J-10, all one suit' },
    { name: 'Straight flush', example: ['9h', '8h', '7h', '6h', '5h'], desc: 'Five in a row, all one suit' },
    { name: 'Four of a kind', example: ['Qs', 'Qh', 'Qd', 'Qc', '7s'], desc: 'Four cards of one rank' },
    { name: 'Full house', example: ['Kh', 'Kd', 'Ks', '5c', '5h'], desc: 'Three of a kind plus a pair' },
    { name: 'Flush', example: ['Ad', 'Jd', '8d', '6d', '2d'], desc: 'Any five of one suit' },
    { name: 'Straight', example: ['Tc', '9d', '8h', '7s', '6c'], desc: 'Five in a row (A-2-3-4-5 is the lowest)' },
    { name: 'Three of a kind', example: ['7c', '7d', '7h', 'Ks', '2d'], desc: 'Three cards of one rank' },
    { name: 'Two pair', example: ['Js', 'Jc', '4d', '4h', 'As'], desc: 'Two different pairs' },
    { name: 'Pair', example: ['Th', 'Td', 'Ks', '8c', '3d'], desc: 'Two cards of one rank' },
    { name: 'High card', example: ['Ac', 'Qd', '9s', '6h', '3c'], desc: 'None of the above — highest card plays' },
  ];

  const MAX_SEATS = 9;

  /** Quick table stake tiers (wallet buy-in 40–100 big blinds). */
  const TIERS = [
    { id: 't20', sb: 10, bb: 20, min: 400, max: 2000, label: '10/20' },
    { id: 't100', sb: 50, bb: 100, min: 2000, max: 10000, label: '50/100' },
    { id: 't500', sb: 250, bb: 500, min: 10000, max: 50000, label: '250/500' },
  ];
  const QUICK_SEATS = 6;

  /** Sit & Go: fixed buy-in, table chips, escalating blinds, top 2 (6-max) / top 3 (9-max) paid. */
  const SNG = {
    buyIn: 100,
    stack: 1500,
    sizes: [6, 9],
    levelMs: 3 * 60 * 1000,
    levels: [
      [10, 20], [15, 30], [25, 50], [50, 100], [75, 150], [100, 200], [150, 300],
      [200, 400], [300, 600], [400, 800], [600, 1200], [1000, 2000], [1500, 3000],
    ],
    payouts: { 6: [0.65, 0.35], 9: [0.5, 0.3, 0.2] },
  };

  const FRIENDS_DEFAULTS = { sb: 10, bb: 20, stack: 2000, blindMinutes: 0, seats: 6 };
  const FRIENDS_BLINDS = [[5, 10], [10, 20], [25, 50], [50, 100]];
  const FRIENDS_STACKS = [1000, 2000, 5000, 10000];
  const FRIENDS_TIMERS = [0, 10, 15, 20];

  const BOT_LEVELS = ['beginner', 'regular', 'shark'];

  // ------------------------------------------------------------------ cards

  const rankOf = (c) => c >> 2;
  const suitOf = (c) => c & 3;

  function cardStr(c) {
    return RANKS[rankOf(c)] + SUITS[suitOf(c)];
  }

  function parseCard(s) {
    const str = String(s || '');
    const r = RANKS.indexOf(str[0] === '1' && str[1] === '0' ? 'T' : str[0].toUpperCase());
    const suitCh = str[str.length - 1].toLowerCase();
    const su = SUITS.indexOf(suitCh);
    if (r < 0 || su < 0) throw new Error('bad card ' + s);
    return r * 4 + su;
  }

  const parseCards = (list) => (Array.isArray(list) ? list : String(list).split(/\s+/).filter(Boolean)).map(parseCard);

  function isCard(c) {
    return Number.isInteger(c) && c >= 0 && c < 52;
  }

  function newDeck() {
    const d = [];
    for (let i = 0; i < 52; i++) d.push(i);
    return d;
  }

  /** Fisher–Yates with an injected uniform integer source (server: crypto.randomInt). */
  function shuffle(deck, randInt) {
    const d = deck.slice();
    for (let i = d.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      const t = d[i];
      d[i] = d[j];
      d[j] = t;
    }
    return d;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const intFrom = (rng) => (n) => Math.floor(rng() * n);

  // ------------------------------------------------------------------ evaluator

  function evaluate5(cards) {
    const rs = cards.map(rankOf).sort((a, b) => b - a);
    const s0 = suitOf(cards[0]);
    const flush = cards.every((c) => suitOf(c) === s0);
    const counts = {};
    rs.forEach((r) => (counts[r] = (counts[r] || 0) + 1));
    const groups = Object.keys(counts)
      .map((r) => ({ r: Number(r), n: counts[r] }))
      .sort((a, b) => b.n - a.n || b.r - a.r);
    let straightHigh = -1;
    if (groups.length === 5) {
      if (rs[0] - rs[4] === 4) straightHigh = rs[0];
      else if (rs[0] === 12 && rs[1] === 3 && rs[4] === 0) straightHigh = 3;
    }
    let cat;
    let tb;
    if (straightHigh >= 0 && flush) {
      cat = 8;
      tb = [straightHigh];
    } else if (groups[0].n === 4) {
      cat = 7;
      tb = [groups[0].r, groups[1].r];
    } else if (groups[0].n === 3 && groups[1].n === 2) {
      cat = 6;
      tb = [groups[0].r, groups[1].r];
    } else if (flush) {
      cat = 5;
      tb = rs;
    } else if (straightHigh >= 0) {
      cat = 4;
      tb = [straightHigh];
    } else if (groups[0].n === 3) {
      cat = 3;
      tb = [groups[0].r, groups[1].r, groups[2].r];
    } else if (groups[0].n === 2 && groups[1].n === 2) {
      cat = 2;
      tb = [groups[0].r, groups[1].r, groups[2].r];
    } else if (groups[0].n === 2) {
      cat = 1;
      tb = [groups[0].r, groups[1].r, groups[2].r, groups[3].r];
    } else {
      cat = 0;
      tb = rs;
    }
    return { score: encode(cat, tb), cat, tb };
  }

  function handName(ev) {
    const t = ev.tb;
    switch (ev.cat) {
      case 8:
        return t[0] === 12 ? 'Royal flush' : 'Straight flush, ' + RANK_NAMES[t[0]] + ' high';
      case 7:
        return 'Four of a kind, ' + RANK_PLURAL[t[0]];
      case 6:
        return 'Full house, ' + RANK_PLURAL[t[0]] + ' full of ' + RANK_PLURAL[t[1]];
      case 5:
        return 'Flush, ' + RANK_NAMES[t[0]] + ' high';
      case 4:
        return 'Straight, ' + RANK_NAMES[t[0]] + ' high';
      case 3:
        return 'Three of a kind, ' + RANK_PLURAL[t[0]];
      case 2:
        return 'Two pair, ' + RANK_PLURAL[t[0]] + ' and ' + RANK_PLURAL[t[1]];
      case 1:
        return 'Pair of ' + RANK_PLURAL[t[0]];
      default:
        return RANK_NAMES[t[0]] + ' high';
    }
  }

  /** Best five of 5–7 cards. No suit ranking; A-2-3-4-5 is the lowest straight. */
  function evaluate(cards) {
    const n = cards.length;
    if (n < 5) throw new Error('need 5+ cards');
    let best = null;
    let bestCards = null;
    const idx = [0, 1, 2, 3, 4];
    for (let a = 0; a < n - 4; a++)
      for (let b = a + 1; b < n - 3; b++)
        for (let c = b + 1; c < n - 2; c++)
          for (let d = c + 1; d < n - 1; d++)
            for (let e = d + 1; e < n; e++) {
              idx[0] = a;
              idx[1] = b;
              idx[2] = c;
              idx[3] = d;
              idx[4] = e;
              const five = idx.map((i) => cards[i]);
              const ev = evaluate5(five);
              if (!best || ev.score > best.score) {
                best = ev;
                bestCards = five;
              }
            }
    return {
      score: best.score,
      cat: best.cat,
      tb: best.tb,
      best: bestCards,
      name: handName(best),
      category: best.cat === 8 && best.tb[0] === 12 ? 'Royal flush' : CATEGORIES[best.cat],
      royal: best.cat === 8 && best.tb[0] === 12,
    };
  }

  function encode(cat, tb) {
    let score = cat;
    for (let i = 0; i < 5; i++) score = score * 15 + (tb[i] == null ? 0 : tb[i] + 1);
    return score;
  }

  function straightHighOf(mask) {
    for (let hi = 12; hi >= 4; hi--) {
      const need = 0x1f << (hi - 4);
      if ((mask & need) === need) return hi;
    }
    return (mask & 0x100f) === 0x100f ? 3 : -1;
  }

  function topRanks(mask, n, skip) {
    const out = [];
    for (let r = 12; r >= 0 && out.length < n; r--) if (mask & (1 << r) && (!skip || skip.indexOf(r) < 0)) out.push(r);
    return out;
  }

  /** Same score as evaluate() without building combinations — for Monte Carlo equity. */
  function scoreFast(cards) {
    const cnt = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const suitCnt = [0, 0, 0, 0];
    const suitMask = [0, 0, 0, 0];
    let mask = 0;
    for (let k = 0; k < cards.length; k++) {
      const r = cards[k] >> 2;
      const s = cards[k] & 3;
      cnt[r]++;
      suitCnt[s]++;
      suitMask[s] |= 1 << r;
      mask |= 1 << r;
    }
    let fs = -1;
    for (let s = 0; s < 4; s++) if (suitCnt[s] >= 5) fs = s;
    if (fs >= 0) {
      const sh = straightHighOf(suitMask[fs]);
      if (sh >= 0) return encode(8, [sh]);
    }
    let quad = -1;
    const trips = [];
    const pairs = [];
    for (let r = 12; r >= 0; r--) {
      if (cnt[r] === 4 && quad < 0) quad = r;
      else if (cnt[r] === 3) trips.push(r);
      else if (cnt[r] === 2) pairs.push(r);
    }
    if (quad >= 0) return encode(7, [quad, topRanks(mask, 1, [quad])[0]]);
    if (trips.length && (trips.length > 1 || pairs.length)) {
      return encode(6, [trips[0], Math.max(trips[1] == null ? -1 : trips[1], pairs[0] == null ? -1 : pairs[0])]);
    }
    if (fs >= 0) return encode(5, topRanks(suitMask[fs], 5));
    const sh = straightHighOf(mask);
    if (sh >= 0) return encode(4, [sh]);
    if (trips.length) return encode(3, [trips[0]].concat(topRanks(mask, 2, [trips[0]])));
    if (pairs.length >= 2) return encode(2, [pairs[0], pairs[1]].concat(topRanks(mask, 1, [pairs[0], pairs[1]])));
    if (pairs.length) return encode(1, [pairs[0]].concat(topRanks(mask, 3, [pairs[0]])));
    return encode(0, topRanks(mask, 5));
  }

  /** Beginner helper line: what you have right now (hole cards only preflop). */
  function currentHand(hole, board) {
    if (!Array.isArray(hole) || hole.length !== 2 || !hole.every(isCard)) return null;
    const b = (board || []).filter(isCard);
    if (b.length < 3) {
      const r0 = rankOf(hole[0]);
      const r1 = rankOf(hole[1]);
      if (r0 === r1) return { name: 'Pair of ' + RANK_PLURAL[r0], cat: 1 };
      return { name: RANK_NAMES[Math.max(r0, r1)] + ' high', cat: 0 };
    }
    const ev = evaluate(hole.concat(b));
    return { name: ev.name, cat: ev.cat };
  }

  // ------------------------------------------------------------------ pots

  /**
   * Layered pots from each player's total contribution this hand. Folded chips stay in the pot
   * but folded players are never eligible. Pots with the same eligible set merge.
   * @param {{ total: number, folded: boolean }[]} contribs
   * @returns {{ amount: number, eligible: number[] }[]}
   */
  function sidePots(contribs) {
    const levels = [];
    contribs.forEach((p) => {
      if (!p.folded && p.total > 0 && levels.indexOf(p.total) < 0) levels.push(p.total);
    });
    levels.sort((a, b) => a - b);
    const pots = [];
    let prev = 0;
    levels.forEach((L) => {
      let amount = 0;
      contribs.forEach((p) => {
        amount += Math.min(p.total, L) - Math.min(p.total, prev);
      });
      const eligible = [];
      contribs.forEach((p, i) => {
        if (!p.folded && p.total >= L) eligible.push(i);
      });
      if (amount > 0) {
        const last = pots[pots.length - 1];
        if (last && last.eligible.join(',') === eligible.join(',')) last.amount += amount;
        else pots.push({ amount, eligible });
      }
      prev = L;
    });
    const top = levels.length ? levels[levels.length - 1] : 0;
    let extra = 0;
    contribs.forEach((p) => {
      extra += Math.max(0, p.total - top);
    });
    if (extra > 0) {
      if (pots.length) pots[pots.length - 1].amount += extra;
      else {
        const live = [];
        contribs.forEach((p, i) => !p.folded && live.push(i));
        pots.push({ amount: extra, eligible: live });
      }
    }
    return pots;
  }

  // ------------------------------------------------------------------ hand engine

  const STREETS = ['preflop', 'flop', 'turn', 'river'];
  const canAct = (p) => !p.folded && !p.allIn;

  function nextIdx(h, from, pred) {
    const n = h.players.length;
    for (let k = 1; k <= n; k++) {
      const i = (((from + k) % n) + n) % n;
      if (pred(h.players[i], i)) return i;
    }
    return -1;
  }

  function put(h, i, amount) {
    const p = h.players[i];
    const a = Math.max(0, Math.min(Math.floor(amount), p.stack));
    p.stack -= a;
    p.bet += a;
    p.total += a;
    if (p.stack === 0) p.allIn = true;
    return a;
  }

  /**
   * Start a hand. Players are in clockwise seat order; `button` indexes into them.
   * posts: returning players owing blinds — { index, live, dead } (live = BB in front, dead = SB to the pot).
   * @param {{ players: {id:string,name?:string,seat?:number,stack:number}[], button: number, sb: number, bb: number,
   *   deck: number[], handNo?: number, posts?: {index:number, live?:number, dead?:number}[] }} o
   */
  function createHand(o) {
    const players = (o.players || []).map((p, i) => ({
      id: String(p.id),
      name: String(p.name || 'Player'),
      seat: p.seat == null ? i : p.seat,
      stack: Math.max(0, Math.floor(Number(p.stack) || 0)),
      start: Math.max(0, Math.floor(Number(p.stack) || 0)),
      bet: 0,
      total: 0,
      folded: false,
      allIn: false,
      acted: false,
      canRaise: true,
      hole: [],
      last: null,
    }));
    const n = players.length;
    if (n < 2) throw new Error('need_players');
    if (!Array.isArray(o.deck) || o.deck.length < 5 + 2 * n + 3) throw new Error('bad_deck');
    const sb = Math.max(1, Math.floor(o.sb));
    const bb = Math.max(sb, Math.floor(o.bb));
    const button = ((Math.floor(o.button) % n) + n) % n;
    const h = {
      v: 1,
      handNo: Number(o.handNo) || 1,
      sb,
      bb,
      players,
      button,
      sbIndex: n === 2 ? button : (button + 1) % n,
      bbIndex: 0,
      deck: o.deck.slice(),
      board: [],
      street: 'preflop',
      toAct: -1,
      currentBet: 0,
      minRaise: bb,
      aggressor: -1,
      runout: false,
      log: [],
      done: false,
      result: null,
    };
    h.bbIndex = (h.sbIndex + 1) % n;
    for (let r = 0; r < 2; r++) for (let k = 1; k <= n; k++) players[(button + k) % n].hole.push(h.deck.shift());
    const sbAmt = put(h, h.sbIndex, sb);
    h.log.push({ i: h.sbIndex, a: 'sb', amt: sbAmt, st: 'preflop' });
    const bbAmt = put(h, h.bbIndex, bb);
    h.log.push({ i: h.bbIndex, a: 'bb', amt: bbAmt, st: 'preflop' });
    (o.posts || []).forEach((po) => {
      const i = po.index;
      if (i == null || i === h.sbIndex || i === h.bbIndex || !players[i]) return;
      const p = players[i];
      if (po.dead) {
        const d = Math.min(p.stack, Math.floor(po.dead));
        p.stack -= d;
        p.total += d;
        if (p.stack === 0) p.allIn = true;
        h.log.push({ i, a: 'dead', amt: d, st: 'preflop' });
      }
      if (po.live && !p.allIn) {
        const a = put(h, i, po.live);
        h.log.push({ i, a: 'post', amt: a, st: 'preflop' });
      }
    });
    h.currentBet = Math.max(bb, ...players.map((p) => p.bet));
    progress(h, h.bbIndex);
    return h;
  }

  function roundComplete(h) {
    const ps = h.players;
    const live = ps.filter((p) => !p.folded);
    if (live.length <= 1) return true;
    const actors = ps.filter(canAct);
    if (actors.length === 0) return true;
    if (actors.length === 1) {
      const a = actors[0];
      const maxOther = Math.max(0, ...live.filter((p) => p !== a).map((p) => p.bet));
      if (a.bet >= maxOther) return true;
    }
    return actors.every((p) => p.acted && p.bet === h.currentBet);
  }

  const needsAction = (h) => (p) => canAct(p) && (!p.acted || p.bet < h.currentBet);

  function progress(h, lastIdx) {
    if (roundComplete(h)) {
      endRound(h);
      return;
    }
    h.toAct = nextIdx(h, lastIdx, needsAction(h));
  }

  function returnUncalled(h) {
    let maxI = -1;
    let max = -1;
    let second = 0;
    h.players.forEach((p, i) => {
      if (p.bet > max) {
        second = Math.max(second, max);
        max = p.bet;
        maxI = i;
      } else second = Math.max(second, p.bet);
    });
    if (maxI >= 0 && max > second) {
      const p = h.players[maxI];
      const d = max - second;
      p.stack += d;
      p.bet -= d;
      p.total -= d;
      if (p.stack > 0) p.allIn = false;
      h.log.push({ i: maxI, a: 'return', amt: d, st: h.street });
    }
  }

  function endRound(h) {
    returnUncalled(h);
    h.players.forEach((p) => (p.bet = 0));
    const live = [];
    h.players.forEach((p, i) => !p.folded && live.push(i));
    if (live.length === 1) return awardUncontested(h, live[0]);
    if (h.street === 'river') return showdown(h);
    const actorsBefore = h.players.filter(canAct).length;
    const next = STREETS[STREETS.indexOf(h.street) + 1];
    h.deck.shift(); // burn
    const deal = next === 'flop' ? 3 : 1;
    for (let k = 0; k < deal; k++) h.board.push(h.deck.shift());
    h.street = next;
    h.log.push({ st: next, board: h.board.slice() });
    h.players.forEach((p) => {
      p.acted = false;
      p.canRaise = true;
      if (!p.folded && !p.allIn) p.last = null;
    });
    h.currentBet = 0;
    h.minRaise = h.bb;
    h.aggressor = -1;
    if (actorsBefore < 2) h.runout = true;
    progress(h, h.button);
  }

  function finish(h) {
    h.done = true;
    h.street = 'done';
    h.toAct = -1;
  }

  function awardUncontested(h, w) {
    let amount = 0;
    h.players.forEach((p) => (amount += p.total));
    h.players[w].stack += amount;
    h.result = {
      showdown: false,
      pots: [{ amount, eligible: [w], winners: [w], shares: { [w]: amount } }],
      winnings: { [w]: amount },
      winners: [w],
      shown: {},
      names: {},
      order: [],
    };
    finish(h);
  }

  function distFromButton(h, i) {
    const n = h.players.length;
    return (((i - h.button - 1) % n) + n) % n;
  }

  function showdown(h) {
    const ps = h.players;
    const live = [];
    ps.forEach((p, i) => !p.folded && live.push(i));
    const evals = {};
    live.forEach((i) => (evals[i] = evaluate(ps[i].hole.concat(h.board))));
    const pots = sidePots(ps.map((p) => ({ total: p.total, folded: p.folded })));
    const winnings = {};
    pots.forEach((pot) => {
      let best = -1;
      pot.eligible.forEach((i) => (best = Math.max(best, evals[i].score)));
      const winners = pot.eligible.filter((i) => evals[i].score === best).sort((a, b) => distFromButton(h, a) - distFromButton(h, b));
      const share = Math.floor(pot.amount / winners.length);
      let rem = pot.amount - share * winners.length;
      pot.winners = winners;
      pot.shares = {};
      winners.forEach((i) => {
        const amt = share + (rem > 0 ? 1 : 0);
        if (rem > 0) rem--;
        pot.shares[i] = amt;
        winnings[i] = (winnings[i] || 0) + amt;
        ps[i].stack += amt;
      });
    });
    // Last aggressor on the river shows first, else the first live seat left of the button.
    const start = h.aggressor >= 0 && !ps[h.aggressor].folded ? h.aggressor : nextIdx(h, h.button, (p) => !p.folded);
    const order = [];
    for (let k = 0; k < ps.length; k++) {
      const i = (start + k) % ps.length;
      if (!ps[i].folded) order.push(i);
    }
    const shown = {};
    let bestShown = -1;
    order.forEach((i) => {
      if (h.runout || winnings[i] > 0 || evals[i].score >= bestShown) {
        shown[i] = true;
        bestShown = Math.max(bestShown, evals[i].score);
      }
    });
    const names = {};
    const best = {};
    Object.keys(shown).forEach((i) => {
      names[i] = evals[i].name;
      best[i] = evals[i].best;
    });
    h.result = {
      showdown: true,
      pots,
      winnings,
      winners: Object.keys(winnings).map(Number),
      shown,
      names,
      best,
      order,
    };
    finish(h);
  }

  function legalActions(h, i) {
    const p = h.players[i];
    if (!p || h.done || h.toAct !== i) return null;
    const toCall = Math.max(0, h.currentBet - p.bet);
    const call = Math.min(toCall, p.stack);
    const maxTo = p.bet + p.stack;
    const minRaiseTo = h.currentBet + h.minRaise;
    const canRaise = p.canRaise && maxTo > h.currentBet;
    return {
      toCall,
      call,
      canCheck: toCall === 0,
      canCall: toCall > 0,
      canRaise,
      isBet: h.currentBet === 0,
      minTo: canRaise ? Math.min(minRaiseTo, maxTo) : 0,
      maxTo,
      allInIsCall: maxTo <= h.currentBet,
      pot: potTotal(h),
    };
  }

  function potTotal(h) {
    let t = 0;
    h.players.forEach((p) => (t += p.total));
    return t;
  }

  /**
   * Apply one action for the player to act. Returns { ok } or { error }.
   * @param {{ type: 'fold'|'check'|'call'|'bet'|'raise'|'allin', to?: number }} action — `to` = total bet this street
   */
  function applyAction(h, id, action) {
    if (h.done) return { error: 'hand_over' };
    const i = h.players.findIndex((p) => p.id === String(id));
    if (i < 0) return { error: 'not_in_hand' };
    if (h.toAct !== i) return { error: 'not_your_turn' };
    const L = legalActions(h, i);
    const p = h.players[i];
    let type = String((action && action.type) || '');
    let to = Math.floor(Number(action && action.to));
    if (type === 'allin') {
      if (L.allInIsCall || !L.canRaise) type = 'call';
      else {
        type = 'raise';
        to = L.maxTo;
      }
    }
    if (type === 'bet') type = 'raise';
    let logAmt = 0;
    if (type === 'fold') {
      p.folded = true;
      p.last = { a: 'fold' };
    } else if (type === 'check') {
      if (!L.canCheck) return { error: 'cannot_check' };
      p.last = { a: 'check' };
    } else if (type === 'call') {
      if (!L.canCall) return { error: 'nothing_to_call' };
      logAmt = put(h, i, L.call);
      p.last = { a: p.allIn ? 'allin' : 'call', amt: p.bet };
    } else if (type === 'raise') {
      if (!L.canRaise) return { error: 'cannot_raise' };
      if (!Number.isFinite(to)) return { error: 'bad_amount' };
      if (to >= L.maxTo) to = L.maxTo;
      if (to <= h.currentBet) return { error: 'bad_amount' };
      if (to < h.currentBet + h.minRaise && to !== L.maxTo) return { error: 'min_raise' };
      const wasBet = h.currentBet === 0;
      logAmt = to;
      put(h, i, to - p.bet);
      const inc = to - h.currentBet;
      const full = inc >= h.minRaise;
      if (full) h.minRaise = inc;
      h.currentBet = to;
      h.aggressor = i;
      h.players.forEach((q, j) => {
        if (j === i || !canAct(q)) return;
        q.acted = false;
        if (full) q.canRaise = true;
      });
      p.last = { a: p.allIn ? 'allin' : wasBet ? 'bet' : 'raise', amt: to };
      type = wasBet ? 'bet' : 'raise';
    } else return { error: 'bad_action' };
    p.acted = true;
    p.canRaise = false;
    h.log.push({ i, a: p.allIn && type !== 'fold' && type !== 'check' ? 'allin' : type, amt: logAmt, st: h.street, to: p.bet });
    progress(h, i);
    return { ok: true };
  }

  /** Clock ran out: check when free, otherwise fold. */
  function timeoutAction(h, i) {
    const L = legalActions(h, i);
    return L && L.canCheck ? { type: 'check' } : { type: 'fold' };
  }

  /** Hand shown after it ended by the player's own choice (e.g. a bluff). */
  function voluntaryShow(h, id) {
    if (!h.done || !h.result) return false;
    const i = h.players.findIndex((p) => p.id === String(id));
    if (i < 0) return false;
    h.result.shown[i] = true;
    if (h.board.length >= 3 && !h.result.names[i]) h.result.names[i] = evaluate(h.players[i].hole.concat(h.board)).name;
    return true;
  }

  /** Nobody's cards but hands shown at (or after) showdown. The deck never leaves the server. */
  function publicHand(h) {
    const res = h.result;
    return {
      handNo: h.handNo,
      street: h.street,
      board: h.board.slice(),
      button: h.button,
      sbIndex: h.sbIndex,
      bbIndex: h.bbIndex,
      toAct: h.toAct,
      currentBet: h.currentBet,
      minRaise: h.minRaise,
      sb: h.sb,
      bb: h.bb,
      pot: potTotal(h),
      done: h.done,
      runout: h.runout,
      players: h.players.map((p, i) => ({
        id: p.id,
        name: p.name,
        seat: p.seat,
        stack: p.stack,
        start: p.start,
        bet: p.bet,
        total: p.total,
        folded: p.folded,
        allIn: p.allIn,
        canRaise: p.canRaise,
        acted: p.acted,
        last: p.last,
        cards: res && res.shown && res.shown[i] ? p.hole.slice() : null,
      })),
      log: h.log.map((e) => Object.assign({}, e)),
      result: res
        ? {
            showdown: res.showdown,
            winnings: Object.assign({}, res.winnings),
            winners: res.winners.slice(),
            pots: res.pots.map((pt) => ({ amount: pt.amount, eligible: pt.eligible.slice(), winners: pt.winners.slice(), shares: Object.assign({}, pt.shares) })),
            shown: Object.assign({}, res.shown),
            names: Object.assign({}, res.names),
            best: Object.keys(res.best || {}).reduce((o, k) => ((o[k] = res.best[k].slice()), o), {}),
            order: (res.order || []).slice(),
          }
        : null,
    };
  }

  /** Legal options for `i` computed from a public hand (UI + bots never need the deck). */
  function legalFromPublic(pubHand, i) {
    if (!pubHand || pubHand.done || pubHand.toAct !== i) return null;
    return legalActions(
      {
        players: pubHand.players,
        done: false,
        toAct: pubHand.toAct,
        currentBet: pubHand.currentBet,
        minRaise: pubHand.minRaise,
      },
      i
    );
  }

  // ------------------------------------------------------------------ table seating + blinds

  /**
   * Who is dealt in, where the button goes and who owes blinds.
   * seats: [{ seat, id, name, stack, sittingOut, missedBB, missedSB, newcomer }]
   * Sitting-out players are skipped; any the blinds pass over owe them on return (BB live + SB dead),
   * as do newcomers joining a running table — unless they are in the blinds anyway.
   * @returns {{ players: object[], button: number, buttonSeat: number, posts: object[], missed: object } | null}
   */
  function planHand(seats, prevButtonSeat) {
    const ring = (seats || []).filter((s) => s && s.stack > 0).sort((a, b) => a.seat - b.seat);
    const live = ring.filter((s) => !s.sittingOut);
    if (live.length < 2) return null;
    let bi = live.findIndex((s) => s.seat > (prevButtonSeat == null ? -1 : prevButtonSeat));
    if (bi < 0) bi = 0;
    const n = live.length;
    const sbI = n === 2 ? bi : (bi + 1) % n;
    const bbI = (sbI + 1) % n;
    const buttonSeat = live[bi].seat;
    const bbSeat = live[bbI].seat;
    const sbSeat = live[sbI].seat;
    const missed = {};
    const between = (seat, a, b) => (a < b ? seat > a && seat < b : seat > a || seat < b);
    ring.forEach((s) => {
      if (!s.sittingOut) return;
      if (between(s.seat, buttonSeat, bbSeat) || s.seat === bbSeat) {
        missed[s.id] = { bb: true, sb: n > 2 && (between(s.seat, buttonSeat, sbSeat) || s.seat === sbSeat) };
      }
    });
    const posts = [];
    live.forEach((s, i) => {
      const owes = s.missedBB || s.newcomer;
      if (!owes || n === 2 || i === bbI || i === sbI) return;
      posts.push({ index: i, id: s.id, live: 1, dead: s.missedSB ? 1 : 0 });
    });
    return {
      players: live.map((s) => ({ id: s.id, name: s.name, seat: s.seat, stack: s.stack })),
      button: bi,
      buttonSeat,
      posts,
      missed,
    };
  }

  /** Scale plan posts (1 = one blind) to amounts. */
  function scalePosts(posts, sb, bb) {
    return (posts || []).map((p) => ({ index: p.index, live: p.live ? bb : 0, dead: p.dead ? sb : 0 }));
  }

  function sngBlinds(elapsedMs) {
    const lv = Math.max(0, Math.min(SNG.levels.length - 1, Math.floor(Math.max(0, elapsedMs) / SNG.levelMs)));
    return { level: lv, sb: SNG.levels[lv][0], bb: SNG.levels[lv][1] };
  }

  /** Friends blind timer: blinds double every N minutes (0 = fixed). */
  function friendsBlinds(settings, elapsedMs) {
    const s = mergeFriendsSettings(settings);
    if (!s.blindMinutes) return { level: 0, sb: s.sb, bb: s.bb };
    const lv = Math.min(8, Math.floor(Math.max(0, elapsedMs) / (s.blindMinutes * 60000)));
    return { level: lv, sb: s.sb * Math.pow(2, lv), bb: s.bb * Math.pow(2, lv) };
  }

  function sngPayouts(size, buyIn) {
    const shares = SNG.payouts[size] || SNG.payouts[6];
    const prize = (Number(buyIn) || SNG.buyIn) * size;
    const out = shares.map((s) => Math.floor(prize * s));
    out[0] += prize - out.reduce((a, b) => a + b, 0);
    return out;
  }

  function mergeFriendsSettings(raw) {
    const r = raw || {};
    const out = Object.assign({}, FRIENDS_DEFAULTS);
    const blind = FRIENDS_BLINDS.find((b) => b[1] === Number(r.bb));
    if (blind) {
      out.sb = blind[0];
      out.bb = blind[1];
    }
    if (FRIENDS_STACKS.indexOf(Number(r.stack)) >= 0) out.stack = Number(r.stack);
    if (FRIENDS_TIMERS.indexOf(Number(r.blindMinutes)) >= 0) out.blindMinutes = Number(r.blindMinutes);
    const seats = Math.floor(Number(r.seats));
    if (seats >= 2 && seats <= MAX_SEATS) out.seats = seats;
    return out;
  }

  function tierById(id) {
    return TIERS.find((t) => t.id === id) || null;
  }

  // ------------------------------------------------------------------ bots (no LLM)

  /** Chen formula → 0..1 preflop strength. */
  function preflopStrength(hole) {
    const r0 = rankOf(hole[0]);
    const r1 = rankOf(hole[1]);
    const hi = Math.max(r0, r1);
    const lo = Math.min(r0, r1);
    const pts = (r) => (r === 12 ? 10 : r === 11 ? 8 : r === 10 ? 7 : r === 9 ? 6 : (r + 2) / 2);
    let s = pts(hi);
    if (hi === lo) s = Math.max(5, s * 2);
    if (suitOf(hole[0]) === suitOf(hole[1])) s += 2;
    const gap = hi - lo - 1;
    if (hi !== lo) {
      if (gap === 1) s -= 1;
      else if (gap === 2) s -= 2;
      else if (gap === 3) s -= 4;
      else if (gap >= 4) s -= 5;
      if (gap <= 0 && hi < 10) s += 1;
    }
    return Math.max(0, Math.min(1, Math.ceil(s) / 20));
  }

  /** Monte Carlo equity vs `opp` random hands, using only cards this player can see. */
  function equity(hole, board, opp, sims, rng) {
    const known = hole.concat(board);
    const rest = newDeck().filter((c) => known.indexOf(c) < 0);
    const need = opp * 2 + (5 - board.length);
    let score = 0;
    for (let s = 0; s < sims; s++) {
      const d = rest.slice();
      for (let k = 0; k < need; k++) {
        const j = k + Math.floor(rng() * (d.length - k));
        const t = d[k];
        d[k] = d[j];
        d[j] = t;
      }
      const fullBoard = board.concat(d.slice(opp * 2, need));
      const mine = scoreFast(hole.concat(fullBoard));
      let beat = false;
      let ties = 0;
      for (let o = 0; o < opp; o++) {
        const theirs = scoreFast([d[o * 2], d[o * 2 + 1]].concat(fullBoard));
        if (theirs > mine) {
          beat = true;
          break;
        }
        if (theirs === mine) ties++;
      }
      if (!beat) score += 1 / (ties + 1);
    }
    return score / sims;
  }

  const BOT_PROFILES = {
    beginner: { sims: 60, aggr: 0.15, bluff: 0.03, slack: 0.14, noise: 0.16, size: 0.5, positional: 0 },
    regular: { sims: 150, aggr: 0.45, bluff: 0.07, slack: 0.03, noise: 0.07, size: 0.6, positional: 0.03 },
    shark: { sims: 300, aggr: 0.7, bluff: 0.12, slack: -0.02, noise: 0.03, size: 0.7, positional: 0.06 },
  };

  /**
   * Deterministic bot decision from hand strength, position, pot odds and a little bluffing.
   * Reads only its own hole cards + the public state (never other players' cards).
   * @param {object} h — full hand (local Practice) or public hand + `hole`
   */
  function botAction(h, i, level, rng, hole) {
    const prof = BOT_PROFILES[level] || BOT_PROFILES.regular;
    const r = typeof rng === 'function' ? rng : Math.random;
    const L = legalActions(h, i);
    if (!L) return null;
    const me = h.players[i];
    const cards = hole || me.hole;
    const opp = Math.max(1, Math.min(3, h.players.filter((p, j) => j !== i && !p.folded).length));
    let eq;
    if (h.board.length < 3) {
      const s = preflopStrength(cards);
      eq = 0.25 + s * 0.6 - (opp - 1) * 0.05;
    } else eq = equity(cards, h.board, opp, prof.sims, r);
    const n = h.players.length;
    const dist = (((i - h.button) % n) + n) % n;
    const late = n <= 3 ? dist === 0 : dist === 0 || dist === n - 1;
    eq += (r() - 0.5) * 2 * prof.noise + (late ? prof.positional : 0);
    const pot = L.pot;
    const potOdds = L.call > 0 ? L.call / (pot + L.call) : 0;
    const sizeTo = (frac) => {
      const target = h.currentBet + Math.max(h.minRaise, Math.round((pot + L.call) * frac));
      return Math.max(L.minTo, Math.min(L.maxTo, Math.round(target / h.bb) * h.bb || target));
    };
    const bluffP = prof.bluff * (late ? 1.5 : 1);
    if (L.canCheck) {
      if (L.canRaise && eq > 0.7 && r() < prof.aggr + 0.25) return { type: 'raise', to: sizeTo(prof.size) };
      if (L.canRaise && eq > 0.55 && r() < prof.aggr) return { type: 'raise', to: sizeTo(0.5) };
      if (L.canRaise && r() < bluffP) return { type: 'raise', to: sizeTo(0.5) };
      return { type: 'check' };
    }
    const shortCall = L.call >= me.stack * 0.9;
    if (L.canRaise && eq > 0.8 && r() < prof.aggr + 0.25) {
      if (eq > 0.9 && (level === 'shark' || me.stack < h.bb * 15)) return { type: 'allin' };
      return { type: 'raise', to: sizeTo(0.75) };
    }
    if (eq >= potOdds - prof.slack && !(shortCall && eq < 0.5 && level !== 'beginner')) return { type: 'call' };
    if (L.canRaise && L.call < me.stack * 0.2 && r() < bluffP * 0.5) return { type: 'raise', to: sizeTo(0.6) };
    return { type: 'fold' };
  }

  // ------------------------------------------------------------------ copy helpers

  function formatChips(n) {
    const v = Math.round(Number(n) || 0);
    return (v < 0 ? '-' : '') + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /** Share card line — your own result only; never anyone else's hole cards. */
  function shareText(o) {
    const amt = formatChips(o.amount);
    const hand = o.handName ? ' with ' + (/^[AEIOU]/.test(o.handName) ? 'an ' : 'a ') + o.handName.replace(/^./, (c) => c.toLowerCase()) : '';
    return 'Won ' + amt + ' chips' + hand + " — Texas Hold'em on Chaupaal";
  }

  function actionLabel(last) {
    if (!last) return '';
    const amt = last.amt ? ' ' + formatChips(last.amt) : '';
    return { fold: 'Fold', check: 'Check', call: 'Call' + amt, bet: 'Bet' + amt, raise: 'Raise to' + amt, allin: 'All-in' + amt }[last.a] || '';
  }

  return {
    RANKS,
    SUITS,
    SUIT_SYMBOLS,
    RANK_NAMES,
    CATEGORIES,
    RANKINGS,
    MAX_SEATS,
    TIERS,
    QUICK_SEATS,
    SNG,
    FRIENDS_DEFAULTS,
    FRIENDS_BLINDS,
    FRIENDS_STACKS,
    FRIENDS_TIMERS,
    BOT_LEVELS,
    rankOf,
    suitOf,
    cardStr,
    parseCard,
    parseCards,
    isCard,
    newDeck,
    shuffle,
    mulberry32,
    intFrom,
    evaluate5,
    evaluate,
    scoreFast,
    handName,
    currentHand,
    sidePots,
    createHand,
    legalActions,
    legalFromPublic,
    applyAction,
    timeoutAction,
    voluntaryShow,
    publicHand,
    potTotal,
    planHand,
    scalePosts,
    sngBlinds,
    friendsBlinds,
    sngPayouts,
    mergeFriendsSettings,
    tierById,
    preflopStrength,
    equity,
    botAction,
    formatChips,
    shareText,
    actionLabel,
  };
});
