/**
 * Bluff (Dangal P9) — rules, state machine and bots, shared by the browser (practice) and the
 * server (server-lib/bluff-engine.js). UMD, no DOM.
 *
 * Two rule styles (Dangal P1 variant `style`):
 *   sequence — "Cheat" / "I Doubt It": claims run A, 2, 3 … K, A …; every turn you must play 1+ cards
 *              face down claiming the current rank. After a challenge the sequence simply carries on
 *              with the next rank and the next player after the one who played.
 *   follow   — "Follow the rank" (common in South Asia): the leader names a rank; each next player
 *              claims the same rank or passes. When everyone else passes in a row, the pile is
 *              discarded out of play and the last player to have placed cards leads a new rank.
 *              After a challenge the pile goes to the loser and the challenge winner leads.
 * Both: anyone still holding cards may call "Bluff!" during the timed window after a play; the first
 * valid call wins the race. Only the last play is turned over. Any card that isn't the claimed rank
 * (jokers are wild when enabled) → the player who played picks up the whole pile; otherwise the
 * caller does. You win by emptying your hand and surviving the window after your last play.
 *
 * Card ids: rank char + suit + deck ('AS1', 'TD2'); jokers 'X1' … 'X4'.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BluffCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'];
  const RANK_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const RANK_NAMES = ['Aces', 'Twos', 'Threes', 'Fours', 'Fives', 'Sixes', 'Sevens', 'Eights', 'Nines', 'Tens', 'Jacks', 'Queens', 'Kings'];
  const RANK_ONE = ['Ace', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King'];
  const SUITS = ['S', 'H', 'D', 'C'];
  const SUIT_SYMBOLS = { S: '♠', H: '♥', D: '♦', C: '♣' };
  const STYLES = ['sequence', 'follow'];
  const WINDOWS = [3, 5, 8];
  const MAX_PLAYS = [0, 3, 4, 6];
  const LEVELS = ['easy', 'normal', 'smart'];
  const MIN_PLAYERS = 3;
  const MAX_PLAYERS = 8;
  const TWO_DECKS_AT = 6;
  const LOG_MAX = 24;
  /** Long-game limit (endless pick-up loops): after this many plays per seat, fewest cards wins. */
  const PLAYS_PER_SEAT = 60;

  const isJoker = (c) => typeof c === 'string' && c[0] === 'X';
  const rankOf = (c) => (isJoker(c) ? -1 : RANKS.indexOf(String(c)[0]));
  const suitOf = (c) => (isJoker(c) ? '' : String(c)[1]);
  const matches = (c, r, jokers) => rankOf(c) === r || (!!jokers && isJoker(c));

  function mergeSettings(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const win = Number(r.windowSec);
    const mp = Math.floor(Number(r.maxPlay) || 0);
    const dk = Math.floor(Number(r.decks) || 0);
    return {
      style: STYLES.indexOf(r.style) >= 0 ? r.style : 'sequence',
      windowSec: WINDOWS.indexOf(win) >= 0 ? win : 5,
      jokers: r.jokers === true || r.jokers === 'true',
      placements: r.placements === true || r.placements === 'true',
      maxPlay: MAX_PLAYS.indexOf(mp) >= 0 ? mp : 0,
      decks: dk === 1 || dk === 2 ? dk : 0,
    };
  }

  /** One deck up to five players, two decks at six or more (unless the table picks). */
  const decksFor = (n, set) => (set && set.decks) || (n >= TWO_DECKS_AT ? 2 : 1);
  /** Max cards per play: 4 with one deck, 6 with two (a table may lower it to 3). */
  function maxPlayFor(decks, set) {
    const m = set && set.maxPlay;
    if (!m) return decks >= 2 ? 6 : 4;
    return m === 6 && decks < 2 ? 4 : m;
  }
  /** Copies of a rank that exist at the table (wild jokers can stand in for any rank). */
  const copiesOf = (st) => st.decks * 4 + (st.jokers ? st.decks * 2 : 0);

  function makeDeck(decks, jokers) {
    const out = [];
    for (let d = 1; d <= decks; d++) {
      SUITS.forEach((s) => RANKS.forEach((r) => out.push(r + s + d)));
    }
    if (jokers) for (let k = 1; k <= decks * 2; k++) out.push('X' + k);
    return out;
  }

  function shuffle(list, rng) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  /** Display order in a hand: by rank (A … K), then suit; jokers last. */
  function sortHand(hand) {
    return hand.slice().sort((a, b) => {
      const ra = isJoker(a) ? 99 : rankOf(a);
      const rb = isJoker(b) ? 99 : rankOf(b);
      if (ra !== rb) return ra - rb;
      return String(a).localeCompare(String(b));
    });
  }

  /**
   * @param {{id:string,name:string,bot?:boolean,level?:string}[]} players 3–8 in seat order
   * @param {object} settings mergeSettings()
   * @param {() => number} rng
   * @param {{dealer?: number}} [opts]
   */
  function newGame(players, settings, rng, opts) {
    const n = (players || []).length;
    if (n < MIN_PLAYERS || n > MAX_PLAYERS) return { error: 'need_players' };
    const set = mergeSettings(settings);
    const decks = decksFor(n, set);
    const dealer = Math.max(0, Math.floor(Number(opts && opts.dealer) || 0)) % n;
    const deck = shuffle(makeDeck(decks, set.jokers), rng || Math.random);
    const hands = players.map(() => []);
    deck.forEach((c, i) => hands[(dealer + 1 + i) % n].push(c));
    const first = (dealer + 1) % n;
    return {
      v: 1,
      style: set.style,
      decks,
      maxPlay: maxPlayFor(decks, set),
      windowMs: set.windowSec * 1000,
      jokers: set.jokers,
      placements: set.placements,
      seats: players.map((p) => ({
        id: String(p.id),
        name: String(p.name || 'Player'),
        bot: !!p.bot,
        level: p.bot ? (LEVELS.indexOf(p.level) >= 0 ? p.level : 'normal') : '',
        place: 0,
        afk: 0,
        forfeit: '',
      })),
      hands: hands.map(sortHand),
      pile: [],
      rank: set.style === 'sequence' ? 0 : -1,
      turn: first,
      dealer,
      phase: 'play',
      last: null,
      playNo: 0,
      passes: 0,
      lastPlacer: -1,
      pending: -1,
      wpass: [],
      reveal: null,
      after: -1,
      discarded: 0,
      finished: [],
      ranking: [],
      winner: -1,
      over: false,
      known: players.map(() => []),
      stats: players.map(() => ({ caught: 0, honest: 0, good: 0, bad: 0 })),
      log: [],
      seq: 0,
    };
  }

  const pileCount = (st) => st.pile.reduce((a, p) => a + p.cards.length, 0);
  const isActive = (st, i) => i >= 0 && i < st.seats.length && st.finished.indexOf(i) < 0;
  const holding = (st, i) => isActive(st, i) && st.hands[i].length > 0;

  function nextHolding(st, from) {
    const n = st.seats.length;
    for (let k = 1; k <= n; k++) {
      const j = (from + k + n) % n;
      if (holding(st, j)) return j;
    }
    return -1;
  }

  function pushLog(st, e) {
    st.log.push(e);
    if (st.log.length > LOG_MAX) st.log.splice(0, st.log.length - LOG_MAX);
  }

  /** Seats that may call "Bluff!" on the current play: everyone still holding cards except the player. */
  function callers(st) {
    if (st.phase !== 'window' || !st.last) return [];
    return st.seats.map((s, i) => i).filter((i) => i !== st.last.seat && holding(st, i));
  }

  function finishSeat(st, seat) {
    if (st.finished.indexOf(seat) >= 0) return;
    st.pending = st.pending === seat ? -1 : st.pending;
    st.finished.push(seat);
    st.seats[seat].place = st.finished.length;
    pushLog(st, { k: 'out', s: seat, place: st.finished.length });
  }

  function endGame(st) {
    const rest = st.seats
      .map((s, i) => i)
      .filter((i) => st.finished.indexOf(i) < 0)
      .sort((a, b) => st.hands[a].length - st.hands[b].length || a - b);
    st.ranking = st.finished.concat(rest);
    rest.forEach((i, k) => (st.seats[i].place = st.finished.length + k + 1));
    st.winner = st.ranking[0];
    st.over = true;
    st.phase = 'over';
    st.turn = -1;
  }

  /** First out wins (default); with placements on, play continues until one player holds cards. */
  function checkOver(st) {
    if (st.over) return true;
    const left = st.seats.map((s, i) => i).filter((i) => isActive(st, i));
    if (!st.placements && st.finished.length >= 1) {
      endGame(st);
      return true;
    }
    if (left.length <= 1) {
      endGame(st);
      return true;
    }
    if (st.playNo >= PLAYS_PER_SEAT * st.seats.length) {
      pushLog(st, { k: 'limit' });
      endGame(st);
      return true;
    }
    return false;
  }

  /** The window after a play closed with no call. */
  function closeWindow(st) {
    const p = st.last.seat;
    st.wpass = [];
    if (st.pending === p) finishSeat(st, p);
    if (checkOver(st)) return;
    if (st.style === 'sequence') st.rank = (st.last.rank + 1) % 13;
    st.turn = nextHolding(st, p);
    st.phase = 'play';
  }

  /** Follow the rank: everyone else passed in a row since the last placement → discard the pile. */
  function maybeDiscard(st) {
    const others = st.seats.map((s, i) => i).filter((i) => holding(st, i) && i !== st.lastPlacer);
    if (st.passes < others.length) return;
    const n = pileCount(st);
    st.discarded += n;
    st.pile = [];
    st.rank = -1;
    st.passes = 0;
    const lead = holding(st, st.lastPlacer) ? st.lastPlacer : nextHolding(st, st.lastPlacer >= 0 ? st.lastPlacer : st.turn);
    pushLog(st, { k: 'discard', n, lead });
    st.lastPlacer = -1;
    st.turn = lead;
  }

  function resolveCall(st, caller) {
    const play = st.pile[st.pile.length - 1];
    const p = play.seat;
    const truth = play.cards.every((c) => matches(c, play.rank, st.jokers));
    const taker = truth ? caller : p;
    const all = [];
    st.pile.forEach((x) => x.cards.forEach((c) => all.push(c)));
    st.hands[taker] = sortHand(st.hands[taker].concat(all));
    st.pile = [];
    st.passes = 0;
    st.lastPlacer = -1;
    st.reveal = { no: play.no, seat: p, caller, cards: play.cards.slice(), rank: play.rank, truth, taker, n: all.length };
    const sp = st.stats[p];
    const sc = st.stats[caller];
    if (truth) {
      sp.honest++;
      sc.bad++;
    } else {
      sp.caught++;
      sc.good++;
    }
    st.known[taker] = st.known[taker].concat(play.cards);
    st.after = truth ? p : caller;
    pushLog(st, { k: 'call', s: caller, p, truth, taker, n: all.length });
    st.wpass = [];
    if (st.pending === p) {
      if (truth) finishSeat(st, p);
      else st.pending = -1;
    }
    st.phase = 'reveal';
  }

  /** After the reveal: carry on (sequence) or the challenge winner leads a new rank (follow). */
  function resume(st) {
    if (checkOver(st)) return;
    const r = st.reveal;
    if (st.style === 'sequence') {
      st.rank = (r.rank + 1) % 13;
      st.turn = nextHolding(st, r.seat);
    } else {
      st.rank = -1;
      st.passes = 0;
      st.turn = holding(st, st.after) ? st.after : nextHolding(st, st.after);
      if (st.turn >= 0) pushLog(st, { k: 'lead', s: st.turn });
    }
    st.after = -1;
    st.phase = 'play';
  }

  /**
   * Public memory: revealed cards a seat picked up are certainly still in its hand until that seat
   * plays again (any card may then have gone face down), so a play wipes what everyone knew.
   */
  function forgetKnown(st, seat) {
    st.known[seat] = [];
  }

  /**
   * One action. seat = acting seat index.
   * a.type: play {cards, rank} · pass · call {no} · letgo {no} · close · resume
   * @returns {{error?: string, truth?: boolean, taker?: number}}
   */
  function apply(st, seat, a) {
    const act = a || {};
    if (st.over) return { error: 'over' };
    const type = String(act.type || '');
    if (type === 'close') {
      if (st.phase !== 'window') return { error: 'phase' };
      closeWindow(st);
      st.seq++;
      return {};
    }
    if (type === 'resume') {
      if (st.phase !== 'reveal') return { error: 'phase' };
      resume(st);
      st.seq++;
      return {};
    }
    if (!(seat >= 0 && seat < st.seats.length)) return { error: 'not_seated' };
    if (type === 'play') {
      if (st.phase !== 'play') return { error: st.phase === 'window' ? 'window_open' : 'phase' };
      if (st.turn !== seat) return { error: 'not_your_turn' };
      const cards = Array.isArray(act.cards) ? act.cards.map(String) : [];
      if (!cards.length) return { error: 'no_cards' };
      if (cards.length > st.maxPlay) return { error: 'too_many' };
      const hand = st.hands[seat];
      const uniq = cards.filter((c, i) => cards.indexOf(c) === i);
      if (uniq.length !== cards.length || uniq.some((c) => hand.indexOf(c) < 0)) return { error: 'no_card' };
      const rank = Math.floor(Number(act.rank));
      if (st.style === 'sequence' || st.rank >= 0) {
        if (act.rank != null && rank !== st.rank) return { error: 'wrong_rank' };
      } else if (!(rank >= 0 && rank < 13)) return { error: 'pick_rank' };
      const claim = st.style === 'sequence' || st.rank >= 0 ? st.rank : rank;
      if (st.style === 'follow' && st.rank < 0) {
        st.rank = claim;
        pushLog(st, { k: 'lead', s: seat, r: claim });
      }
      st.hands[seat] = hand.filter((c) => cards.indexOf(c) < 0);
      st.playNo++;
      st.pile.push({ seat, cards, rank: claim, no: st.playNo });
      st.last = { seat, n: cards.length, rank: claim, no: st.playNo };
      st.passes = 0;
      st.lastPlacer = seat;
      st.reveal = null;
      st.seats[seat].afk = act.auto ? st.seats[seat].afk : 0;
      forgetKnown(st, seat);
      if (!st.hands[seat].length) st.pending = seat;
      pushLog(st, { k: 'play', s: seat, n: cards.length, r: claim });
      st.phase = 'window';
      st.wpass = [];
      st.seq++;
      if (!callers(st).length) closeWindow(st);
      return {};
    }
    if (type === 'pass') {
      if (st.phase !== 'play') return { error: 'phase' };
      if (st.turn !== seat) return { error: 'not_your_turn' };
      if (st.style !== 'follow') return { error: 'no_pass' };
      if (st.rank < 0) return { error: 'must_lead' };
      st.passes++;
      if (!act.auto) st.seats[seat].afk = 0;
      pushLog(st, { k: 'pass', s: seat });
      st.turn = nextHolding(st, seat);
      maybeDiscard(st);
      st.seq++;
      return {};
    }
    if (type === 'call') {
      if (st.phase !== 'window' || !st.last) return { error: 'too_late' };
      if (act.no != null && Number(act.no) !== st.last.no) return { error: 'too_late' };
      if (seat === st.last.seat) return { error: 'own_play' };
      if (!holding(st, seat)) return { error: 'not_in_game' };
      resolveCall(st, seat);
      st.seq++;
      return { truth: st.reveal.truth, taker: st.reveal.taker };
    }
    if (type === 'letgo') {
      if (st.phase !== 'window' || !st.last) return { error: 'too_late' };
      if (act.no != null && Number(act.no) !== st.last.no) return { error: 'too_late' };
      const list = callers(st);
      if (list.indexOf(seat) < 0) return { error: 'not_in_game' };
      if (st.wpass.indexOf(seat) < 0) st.wpass.push(seat);
      if (list.every((i) => st.wpass.indexOf(i) >= 0)) {
        closeWindow(st);
        st.seq++;
      }
      return {};
    }
    return { error: 'bad_action' };
  }

  /** A bot takes a seat (left or AFK); the hand is kept so the table plays on. */
  function takeOver(st, seat, reason) {
    const s = st.seats[seat];
    if (!s || s.bot) return;
    s.bot = true;
    s.level = 'normal';
    s.forfeit = reason || 'left';
    s.name = s.name + ' · Bot';
  }

  // ---------------------------------------------------------------- bots

  const LEVEL_CFG = {
    easy: { callBase: 0.12, delay: [1600, 2800] },
    normal: { callBase: 0.1, delay: [1100, 2300] },
    smart: { callBase: 0.08, delay: [800, 1800] },
  };

  function lnC(n, k) {
    if (k < 0 || k > n) return -Infinity;
    let s = 0;
    for (let i = 1; i <= k; i++) s += Math.log(n - k + i) - Math.log(i);
    return s;
  }
  /** P(X = x) for X ~ Hypergeometric(population, successes, draws). */
  function pmf(population, successes, draws, x) {
    const N = Math.max(0, population);
    const K = Math.max(0, Math.min(N, successes));
    const d = Math.max(0, Math.min(N, draws));
    if (x < 0 || x > K || x > d || d - x > N - K) return 0;
    return Math.exp(lnC(K, x) + lnC(N - K, d - x) - lnC(N, d));
  }
  /** P(X ≥ k) for X ~ Hypergeometric(population, successes, draws). */
  function atLeast(population, successes, draws, k) {
    if (k <= 0) return 1;
    let p = 0;
    for (let x = k; x <= draws; x++) p += pmf(population, successes, draws, x);
    return Math.max(0, Math.min(1, p));
  }

  /** Cards a seat would least like to keep (the ones to shed as a bluff). */
  function dumpOrder(st, seat) {
    const hand = st.hands[seat].filter((c) => !isJoker(c));
    if (st.style === 'sequence') {
      const m = Math.max(1, st.seats.filter((s, i) => holding(st, i)).length);
      const soon = (r) => {
        for (let k = 1; k <= 13; k++) if ((st.rank + k * m) % 13 === r) return k;
        return 99;
      };
      return hand.slice().sort((a, b) => soon(rankOf(b)) - soon(rankOf(a)) || String(a).localeCompare(String(b)));
    }
    const count = (r) => hand.filter((c) => rankOf(c) === r).length;
    return hand.slice().sort((a, b) => count(rankOf(a)) - count(rankOf(b)) || String(a).localeCompare(String(b)));
  }

  function pick(list, rng) {
    return list[Math.floor(rng() * list.length) % Math.max(1, list.length)];
  }

  /** The bot's play for its turn (deterministic given rng). */
  function botAction(st, seat, rng) {
    const R = rng || Math.random;
    if (st.phase !== 'play' || st.turn !== seat) return null;
    const lvl = st.seats[seat].level || 'normal';
    const hand = st.hands[seat];
    const jokers = st.jokers ? hand.filter(isJoker) : [];
    const pileN = pileCount(st);
    const lie = (count, exclude) => {
      const order = lvl === 'easy' ? shuffle(hand.filter((c) => !isJoker(c)), R) : dumpOrder(st, seat);
      return order.filter((c) => (exclude || []).indexOf(c) < 0).slice(0, count);
    };
    const withFinish = (truthCards) => {
      const all = truthCards.concat(jokers.filter((c) => truthCards.indexOf(c) < 0));
      return all.length === hand.length && all.length <= st.maxPlay ? all : truthCards;
    };
    const leading = st.style === 'follow' && st.rank < 0;
    if (leading) {
      const groups = {};
      hand.forEach((c) => {
        if (!isJoker(c)) (groups[rankOf(c)] = groups[rankOf(c)] || []).push(c);
      });
      const ranks = Object.keys(groups).map(Number);
      if (!ranks.length) return { type: 'play', cards: hand.slice(0, Math.min(st.maxPlay, hand.length)), rank: 0 };
      let r = lvl === 'easy' ? pick(ranks, R) : ranks.sort((a, b) => groups[b].length - groups[a].length || a - b)[0];
      let cards = withFinish(groups[r].slice(0, st.maxPlay));
      if (lvl === 'smart' && cards.length < st.maxPlay && hand.length - cards.length > 6 && R() < 0.3) cards = cards.concat(lie(1, cards));
      return { type: 'play', cards, rank: r };
    }
    const r = st.rank;
    const truth = hand.filter((c) => rankOf(c) === r).slice(0, st.maxPlay);
    if (truth.length) {
      let cards = withFinish(truth);
      const extraP = lvl === 'smart' ? 0.2 : lvl === 'normal' ? 0.18 : 0;
      if (cards.length < st.maxPlay && hand.length - cards.length > 6 && pileN < 6 && R() < extraP) cards = cards.concat(lie(1, cards));
      return { type: 'play', cards, rank: r };
    }
    if (jokers.length && (hand.length <= st.maxPlay || R() < 0.4)) return { type: 'play', cards: withFinish([jokers[0]]), rank: r };
    if (st.style === 'follow') {
      const claimed = st.pile.reduce((a, p) => a + p.cards.length, 0);
      if (lvl === 'easy') return R() < 0.3 ? { type: 'play', cards: lie(1), rank: r } : { type: 'pass' };
      if (lvl === 'normal') return pileN <= 6 && R() < 0.35 ? { type: 'play', cards: lie(1), rank: r } : { type: 'pass' };
      if (claimed + 1 > copiesOf(st)) return { type: 'pass' };
      return hand.length >= 6 && pileN <= 8 && R() < 0.45 ? { type: 'play', cards: lie(1), rank: r } : { type: 'pass' };
    }
    const cards = lie(1);
    return { type: 'play', cards: cards.length ? cards : hand.slice(0, 1), rank: r };
  }

  /** Would this bot call "Bluff!" on the current play? */
  function botWantsCall(st, seat, rng) {
    const R = rng || Math.random;
    const play = st.last;
    if (!play || st.phase !== 'window' || seat === play.seat) return false;
    const lvl = st.seats[seat].level || 'normal';
    const p = play.seat;
    const r = play.rank;
    const n = play.n;
    const total = copiesOf(st);
    const mine = st.hands[seat].filter((c) => matches(c, r, st.jokers)).length;
    let knownOthers = 0;
    st.known.forEach((list, j) => {
      if (j !== seat && j !== p) knownOthers += list.filter((c) => matches(c, r, st.jokers)).length;
    });
    const goingOut = st.hands[p].length === 0;
    const pileN = pileCount(st);
    if (lvl === 'easy') return R() < LEVEL_CFG.easy.callBase + (goingOut ? 0.3 : 0);
    if (n + mine + knownOthers > total) return true;
    const claimedInPile = st.style === 'follow' ? st.pile.reduce((a, x) => a + x.cards.length, 0) : n;
    if (st.style === 'follow' && claimedInPile + mine > total) return lvl === 'smart' || R() < 0.6;
    const pLie = lieOdds(st, seat, { mine, knownOthers, pileN, smart: lvl === 'smart' });
    const threshold = 0.52 + Math.min(0.25, pileN * 0.015) - (goingOut ? 0.3 : 0);
    if (lvl === 'normal') return pLie + (R() - 0.5) * 0.3 > threshold + 0.05;
    return pLie > threshold + 0.05;
  }

  /**
   * Bayesian odds that the last play is a lie, from public information only: how likely the player
   * was to hold exactly the claimed count (honest players show all they have) against holding none
   * and bluffing (almost always one card) or topping up a real claim with one extra. Smart bots
   * scale the lie side by that opponent's record (bluffs caught vs honest reveals).
   */
  function lieOdds(st, seat, o) {
    const play = st.last;
    const p = play.seat;
    const n = play.n;
    const total = copiesOf(st);
    const pileN = o.pileN;
    const totalCards = st.decks * 52 + (st.jokers ? st.decks * 2 : 0);
    const knownElsewhere = st.known.reduce((a, list, j) => a + (j !== p && j !== seat ? list.length : 0), 0);
    const population = Math.max(1, totalCards - st.hands[seat].length - st.discarded - (pileN - n) - knownElsewhere);
    const successes = Math.max(0, total - o.mine - o.knownOthers);
    const handBefore = st.hands[p].length + n;
    const P = (x) => pmf(population, successes, handBefore, x);
    let liePrior = st.style === 'follow' ? 0.5 : 1;
    if (o.smart) {
      const s = st.stats[p];
      liePrior *= Math.max(0.4, Math.min(2.2, ((s.caught + 1) / (s.caught + s.honest + 3)) * 3));
    }
    const honest = P(n);
    // Pure bluffs are almost always one card; a real claim topped up with one extra is the other lie.
    const pure = n === 1 ? 0.8 : n === 2 ? 0.15 : 0.02;
    const lie = (pure * P(0) + (n > 1 ? 0.06 * P(n - 1) : 0)) * liePrior;
    if (honest + lie <= 0) return 1;
    return lie / (honest + lie);
  }

  /**
   * Bots' reaction to a fresh play: the earliest bot caller (with a human-like delay) or none;
   * the bots that don't want to call let it go straight away.
   * @returns {{ caller: number, delay: number, letgo: number[] }}
   */
  function windowPlan(st, rng) {
    const R = rng || Math.random;
    const out = { caller: -1, delay: 0, letgo: [] };
    callers(st).forEach((i) => {
      const s = st.seats[i];
      if (!s.bot) return;
      if (botWantsCall(st, i, R)) {
        const cfg = LEVEL_CFG[s.level] || LEVEL_CFG.normal;
        const d = Math.round(cfg.delay[0] + R() * (cfg.delay[1] - cfg.delay[0]));
        const delay = Math.max(400, Math.min(st.windowMs - 300, d));
        if (out.caller < 0 || delay < out.delay) {
          if (out.caller >= 0) out.letgo.push(out.caller);
          out.caller = i;
          out.delay = delay;
        } else out.letgo.push(i);
      } else out.letgo.push(i);
    });
    return out;
  }

  /** AFK / timeout: the smallest legal play (one card, honest if possible) or a pass. */
  function autoAction(st, seat) {
    if (st.phase === 'window') return { type: 'letgo', no: st.last ? st.last.no : null, auto: true };
    if (st.phase !== 'play' || st.turn !== seat) return null;
    const hand = st.hands[seat];
    if (st.style === 'follow' && st.rank >= 0) return { type: 'pass', auto: true };
    if (st.style === 'follow') {
      const c = hand.find((x) => !isJoker(x)) || hand[0];
      return { type: 'play', cards: [c], rank: Math.max(0, rankOf(c)), auto: true };
    }
    const honest = hand.find((c) => rankOf(c) === st.rank);
    const c = honest || dumpOrder(st, seat)[0] || hand[0];
    return { type: 'play', cards: [c], rank: st.rank, auto: true };
  }

  // ---------------------------------------------------------------- views

  function legal(st, seat) {
    const out = { play: false, pass: false, call: false, ranks: [], max: st.maxPlay };
    if (st.over || seat < 0) return out;
    if (st.phase === 'play' && st.turn === seat) {
      out.play = true;
      out.pass = st.style === 'follow' && st.rank >= 0;
      out.ranks = st.style === 'follow' && st.rank < 0 ? RANKS.map((r, i) => i) : [st.rank];
    }
    if (st.phase === 'window' && callers(st).indexOf(seat) >= 0) out.call = st.wpass.indexOf(seat) < 0 ? 'open' : 'passed';
    return out;
  }

  /** Everything everyone may see: counts, claims, the reveal — never a face-down card. */
  function publicView(st) {
    return {
      v: st.v,
      style: st.style,
      decks: st.decks,
      maxPlay: st.maxPlay,
      windowMs: st.windowMs,
      jokers: st.jokers,
      placements: st.placements,
      seats: st.seats.map((s, i) => ({ id: s.id, name: s.name, bot: s.bot, level: s.level, place: s.place, forfeit: s.forfeit || '', n: st.hands[i].length })),
      pile: pileCount(st),
      claims: st.pile.map((p) => ({ seat: p.seat, n: p.cards.length, rank: p.rank })),
      rank: st.rank,
      turn: st.turn,
      dealer: st.dealer,
      phase: st.phase,
      last: st.last ? Object.assign({}, st.last) : null,
      playNo: st.playNo,
      passes: st.passes,
      lastPlacer: st.lastPlacer,
      pending: st.pending,
      wpass: st.wpass.slice(),
      reveal: st.reveal ? Object.assign({}, st.reveal, { cards: st.reveal.cards.slice() }) : null,
      discarded: st.discarded,
      finished: st.finished.slice(),
      ranking: st.ranking.slice(),
      winner: st.winner,
      over: st.over,
      log: st.log.slice(-12),
      seq: st.seq,
    };
  }

  function privateView(st, seat) {
    if (!(seat >= 0 && seat < st.seats.length)) return { seat: -1, hand: [], legal: legal(st, -1) };
    return { seat, hand: st.hands[seat].slice(), legal: legal(st, seat) };
  }

  const arr = (x) => {
    if (Array.isArray(x)) return x;
    if (x && typeof x === 'object') {
      const out = [];
      Object.keys(x)
        .filter((k) => /^\d+$/.test(k))
        .forEach((k) => (out[Number(k)] = x[k]));
      return out;
    }
    return [];
  };

  /** RTDB drops nulls and empty arrays — restore every shape the reducer expects. */
  function hydrate(raw) {
    const st = raw || {};
    st.seats = arr(st.seats).filter(Boolean).map((s) => Object.assign({ place: 0, afk: 0, forfeit: '', level: '', bot: false }, s));
    const n = st.seats.length;
    const hands = arr(st.hands);
    const known = arr(st.known);
    const stats = arr(st.stats);
    st.hands = [];
    st.known = [];
    st.stats = [];
    for (let i = 0; i < n; i++) {
      st.hands.push(arr(hands[i]).filter(Boolean));
      st.known.push(arr(known[i]).filter(Boolean));
      st.stats.push(Object.assign({ caught: 0, honest: 0, good: 0, bad: 0 }, stats[i] || {}));
    }
    st.pile = arr(st.pile).filter(Boolean).map((p) => Object.assign({}, p, { cards: arr(p.cards).filter(Boolean) }));
    st.finished = arr(st.finished).filter((x) => x != null).map(Number);
    st.ranking = arr(st.ranking).filter((x) => x != null).map(Number);
    st.wpass = arr(st.wpass).filter((x) => x != null).map(Number);
    st.log = arr(st.log).filter(Boolean);
    st.last = st.last || null;
    st.reveal = st.reveal ? Object.assign({}, st.reveal, { cards: arr(st.reveal.cards).filter(Boolean) }) : null;
    ['rank', 'turn', 'lastPlacer', 'pending', 'winner', 'after'].forEach((k) => (st[k] = st[k] == null ? -1 : Number(st[k])));
    ['playNo', 'passes', 'discarded', 'seq', 'dealer', 'decks', 'maxPlay', 'windowMs'].forEach((k) => (st[k] = Number(st[k]) || 0));
    st.over = !!st.over;
    st.jokers = !!st.jokers;
    st.placements = !!st.placements;
    st.phase = st.phase || 'play';
    return st;
  }

  /** Public-view hydrate for clients (seats, claims, reveal). */
  function hydratePublic(raw) {
    const v = raw || {};
    v.seats = arr(v.seats).filter(Boolean);
    v.claims = arr(v.claims).filter(Boolean);
    v.finished = arr(v.finished).filter((x) => x != null).map(Number);
    v.ranking = arr(v.ranking).filter((x) => x != null).map(Number);
    v.wpass = arr(v.wpass).filter((x) => x != null).map(Number);
    v.log = arr(v.log).filter(Boolean);
    v.last = v.last || null;
    v.reveal = v.reveal ? Object.assign({}, v.reveal, { cards: arr(v.reveal.cards).filter(Boolean) }) : null;
    ['rank', 'turn', 'lastPlacer', 'pending', 'winner'].forEach((k) => (v[k] = v[k] == null ? -1 : Number(v[k])));
    v.over = !!v.over;
    return v;
  }

  function cardLabel(c) {
    if (isJoker(c)) return 'Joker';
    return RANK_LABELS[rankOf(c)] + SUIT_SYMBOLS[suitOf(c)];
  }
  function claimText(n, r) {
    return n + ' ' + (n === 1 ? RANK_ONE[r] : RANK_NAMES[r]);
  }

  return {
    RANKS,
    RANK_LABELS,
    RANK_NAMES,
    RANK_ONE,
    SUITS,
    SUIT_SYMBOLS,
    STYLES,
    WINDOWS,
    MAX_PLAYS,
    LEVELS,
    MIN_PLAYERS,
    MAX_PLAYERS,
    TWO_DECKS_AT,
    PLAYS_PER_SEAT,
    isJoker,
    rankOf,
    suitOf,
    matches,
    mergeSettings,
    decksFor,
    maxPlayFor,
    makeDeck,
    shuffle,
    sortHand,
    newGame,
    apply,
    takeOver,
    endGame,
    callers,
    pileCount,
    holding,
    botAction,
    botWantsCall,
    windowPlan,
    autoAction,
    atLeast,
    legal,
    publicView,
    privateView,
    hydrate,
    hydratePublic,
    cardLabel,
    claimText,
  };
});
