/**
 * Dangal P8 — Teen Patti rules core (UMD): shared by practice on the phone and
 * server-lib/teenpatti-engine.js. Pure functions over plain JSON state; randomness is injected.
 *
 * Rulings:
 *  - 3–7 players, one 52-card deck, 3 cards each. Everyone pays the boot; the first stake = boot.
 *  - Blind players bet the stake; seen players bet double. Raise doubles the stake (a seen raise
 *    costs 4× the old stake). The stake is capped at the chaal limit (16 × boot).
 *  - A blind player must look after the blind limit (4 blind bets by default, a table setting).
 *  - Show: only when two players remain. It costs your current bet. A seen player can't ask a
 *    blind player for a show (they chaal or pack instead). Equal hands: whoever asked loses.
 *  - Side show: a seen player asks the previous player still in (who must be seen), paying a seen
 *    bet. Accept → both see each other's cards and the lower hand packs (equal: the asker packs).
 *    Deny → play simply moves on.
 *  - Pot limit (50 × boot by default — one full buy-in): once the pot reaches it, every hand still in is shown and
 *    the best takes the pot (exact ties split).
 *  - Hand ranks: Trail > Pure sequence > Sequence > Colour > Pair > High card. Suits never rank.
 *    Sequences: A-K-Q is highest, A-2-3 second, then K-Q-J down to 4-3-2. No wrap (K-A-2).
 *  - Variants: Classic; Muflis (lowest hand wins, ranking reversed); AK47 (every A, K, 4 and 7
 *    is wild); Joker (a card is cut and its rank is wild for the hand). Wild cards take whatever
 *    value makes the best hand.
 *  - A player who can't cover a bet may pack, or (two left) call an all-in show.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TeenPattiCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RANKS = '23456789TJQKA';
  const SUITS = 'SHDC';
  const SUIT_SYMBOLS = { S: '♠', H: '♥', D: '♦', C: '♣' };
  const RANK_WORDS = { 2: 'Twos', 3: 'Threes', 4: 'Fours', 5: 'Fives', 6: 'Sixes', 7: 'Sevens', 8: 'Eights', 9: 'Nines', 10: 'Tens', 11: 'Jacks', 12: 'Queens', 13: 'Kings', 14: 'Aces' };
  const RANK_SHORT = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  const CATS = ['High card', 'Pair', 'Colour', 'Sequence', 'Pure sequence', 'Trail'];
  const VARIANTS = ['classic', 'muflis', 'ak47', 'joker'];
  const BUYINS = [0, 100, 250, 500];
  const HANDS = [10, 20, 30];
  const BLIND_MAX = [2, 3, 4, 5];
  const POT_X = [25, 50, 100];
  const LEVELS = ['easy', 'normal', 'smart'];
  const FREE_STACK = 1000;
  const FREE_BOOT = 10;
  const CAP_X = 16;
  const MIN_PLAYERS = 3;
  const MAX_PLAYERS = 7;
  const TURN_MS = 20000;
  const BANK_MS = 20000;
  const LOG_MAX = 14;

  const rankOf = (c) => RANKS.indexOf(String(c).charAt(0)) + 2;
  const suitOf = (c) => String(c).charAt(1);
  const isCard = (c) => typeof c === 'string' && c.length === 2 && RANKS.indexOf(c.charAt(0)) >= 0 && SUITS.indexOf(c.charAt(1)) >= 0;
  const cardLabel = (c) => RANK_SHORT[rankOf(c)] + SUIT_SYMBOLS[suitOf(c)];

  function makeDeck() {
    const out = [];
    for (const s of SUITS) for (const r of RANKS) out.push(r + s);
    return out;
  }
  function shuffle(list, rng) {
    const R = typeof rng === 'function' ? rng : Math.random;
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(R() * (i + 1)) % (i + 1);
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  // ---------------------------------------------------------------- hand ranking

  function evalNatural(cards) {
    const r = cards.map(rankOf).sort((a, b) => b - a);
    const s = cards.map(suitOf);
    const flush = s[0] === s[1] && s[1] === s[2];
    const trail = r[0] === r[2];
    let seq = 0;
    if (!trail && r[0] !== r[1] && r[1] !== r[2]) {
      if (r[0] === 14 && r[1] === 13 && r[2] === 12) seq = 15;
      else if (r[0] === 14 && r[1] === 3 && r[2] === 2) seq = 14;
      else if (r[0] - r[1] === 1 && r[1] - r[2] === 1) seq = r[0];
    }
    let cat;
    let tb;
    if (trail) {
      cat = 5;
      tb = [r[0]];
    } else if (seq && flush) {
      cat = 4;
      tb = [seq];
    } else if (seq) {
      cat = 3;
      tb = [seq];
    } else if (flush) {
      cat = 2;
      tb = r;
    } else if (r[0] === r[1] || r[1] === r[2]) {
      cat = 1;
      tb = [r[1], r[0] === r[1] ? r[2] : r[0]];
    } else {
      cat = 0;
      tb = r;
    }
    const score = cat * 65536 + (tb[0] || 0) * 256 + (tb[1] || 0) * 16 + (tb[2] || 0);
    return { cat, tb, score, name: handName(cat, tb) };
  }

  function handName(cat, tb) {
    if (cat === 5) return 'Trail of ' + RANK_WORDS[tb[0]];
    if (cat === 4 || cat === 3) {
      const top = tb[0] === 15 ? 'A-K-Q' : tb[0] === 14 ? 'A-2-3' : RANK_SHORT[tb[0]] + '-' + RANK_SHORT[tb[0] - 1] + '-' + RANK_SHORT[tb[0] - 2];
      return CATS[cat] + ' ' + top;
    }
    if (cat === 2) return 'Colour, ' + RANK_SHORT[tb[0]] + ' high';
    if (cat === 1) return 'Pair of ' + RANK_WORDS[tb[0]];
    return 'High card ' + RANK_SHORT[tb[0]];
  }

  function wildRanks(variant, joker) {
    if (variant === 'ak47') return [14, 13, 4, 7];
    if (variant === 'joker' && joker) return [rankOf(joker)];
    return [];
  }

  /**
   * Best reading of a hand. Wild cards become whatever card makes the best hand.
   * @returns {{ cat: number, tb: number[], score: number, name: string, wild: number }}
   */
  function evalHand(cards, wild) {
    const w = wild || [];
    const nat = cards.filter((c) => w.indexOf(rankOf(c)) < 0);
    const nw = cards.length - nat.length;
    if (!nw) return Object.assign(evalNatural(cards), { wild: 0 });
    if (nw >= 2) {
      const r = nw === 3 ? 14 : rankOf(nat[0]);
      return { cat: 5, tb: [r], score: 5 * 65536 + r * 256, name: handName(5, [r]), wild: nw };
    }
    let best = null;
    for (const s of SUITS) {
      for (const r of RANKS) {
        const e = evalNatural(nat.concat([r + s]));
        if (!best || e.score > best.score) best = e;
      }
    }
    return Object.assign(best, { wild: nw });
  }

  /** Comparable strength (higher = better) for this variant. Muflis reverses the natural order. */
  function strength(cards, variant, joker) {
    if (variant === 'muflis') return -evalNatural(cards).score;
    return evalHand(cards, wildRanks(variant, joker)).score;
  }

  function describe(cards, variant, joker) {
    if (variant === 'muflis') return evalNatural(cards).name;
    return evalHand(cards, wildRanks(variant, joker)).name;
  }

  // ---------------------------------------------------------------- settings

  function mergeSettings(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const pick = (list, v, def) => (list.indexOf(Number(v)) >= 0 ? Number(v) : def);
    return {
      variant: VARIANTS.indexOf(r.variant) >= 0 ? r.variant : 'classic',
      buyIn: pick(BUYINS, r.buyIn, 0),
      hands: pick(HANDS, r.hands, 10),
      blindMax: pick(BLIND_MAX, r.blindMax, 4),
      potX: pick(POT_X, r.potX, 50),
    };
  }
  const bootFor = (set) => (set.buyIn ? Math.max(1, Math.round(set.buyIn / 50)) : FREE_BOOT);
  const variantLabel = (v) => ({ classic: 'Classic', muflis: 'Muflis (lowest wins)', ak47: 'AK47 (A K 4 7 wild)', joker: 'Joker (cut rank wild)' })[v] || 'Classic';

  // ---------------------------------------------------------------- state

  function E(code) {
    return { error: code };
  }
  function log(st, seat, msg) {
    st.seq = (Number(st.seq) || 0) + 1;
    st.log.push({ no: st.seq, seat, msg });
    if (st.log.length > LOG_MAX) st.log.splice(0, st.log.length - LOG_MAX);
  }
  const nameOf = (st, i) => (st.seats[i] ? st.seats[i].name : 'Player');

  /**
   * @param {{id,name,bot?,level?,stack?}[]} players seat order; `stack` defaults to the buy-in
   * @param {object} settings
   * @param {() => number} rng
   */
  function newMatch(players, settings, rng) {
    const set = mergeSettings(settings);
    const R = typeof rng === 'function' ? rng : Math.random;
    const n = (players || []).length;
    if (n < 2 || n > MAX_PLAYERS) return E('players');
    const boot = bootFor(set);
    const st = {
      v: 1,
      variant: set.variant,
      boot,
      cap: boot * CAP_X,
      potLimit: boot * set.potX,
      blindMax: set.blindMax,
      handsMax: set.hands,
      buyIn: set.buyIn,
      seats: players.map((p) => {
        const stack = Math.max(0, Math.floor(p.stack != null ? Number(p.stack) : set.buyIn || FREE_STACK));
        return { id: String(p.id), name: String(p.name || 'Player').slice(0, 40), bot: !!p.bot, level: p.bot ? (LEVELS.indexOf(p.level) >= 0 ? p.level : 'normal') : null, stack, initial: stack, out: false, left: false, away: false, afk: 0 };
      }),
      handNo: 0,
      dealer: Math.floor(R() * n) % n,
      over: false,
      winner: -1,
      ranking: [],
      seq: 0,
      log: [],
      hand: null,
    };
    st.dealer = (st.dealer + n - 1) % n;
    const out = newHand(st, R);
    if (out.error) return out;
    return st;
  }

  const eligible = (st, i) => {
    const s = st.seats[i];
    return !!s && !s.out && !s.left && !s.away && s.stack >= st.boot;
  };

  function nextSeat(st, from, ok) {
    const n = st.seats.length;
    for (let k = 1; k <= n; k++) {
      const i = (from + k) % n;
      if (ok(i)) return i;
    }
    return -1;
  }
  function prevSeat(st, from, ok) {
    const n = st.seats.length;
    for (let k = 1; k < n; k++) {
      const i = (from - k + n) % n;
      if (ok(i)) return i;
    }
    return -1;
  }

  function newHand(st, rng) {
    const R = typeof rng === 'function' ? rng : Math.random;
    st.seats.forEach((s) => {
      if (!s.left && s.stack < st.boot) s.out = true;
    });
    const playing = st.seats.map((_, i) => eligible(st, i));
    if (playing.filter(Boolean).length < 2) return endMatch(st);
    st.handNo += 1;
    st.dealer = nextSeat(st, st.dealer, (i) => playing[i]);
    const deck = shuffle(makeDeck(), R);
    const cards = st.seats.map(() => []);
    for (let r = 0; r < 3; r++) {
      let i = st.dealer;
      for (let k = 0; k < st.seats.length; k++) {
        i = (i + 1) % st.seats.length;
        if (playing[i]) cards[i].push(deck.pop());
      }
    }
    const joker = st.variant === 'joker' ? deck.pop() : null;
    const bet = st.seats.map((s, i) => (playing[i] ? st.boot : 0));
    st.seats.forEach((s, i) => {
      if (playing[i]) s.stack -= st.boot;
    });
    st.hand = {
      no: st.handNo,
      deck,
      cards,
      joker,
      wild: wildRanks(st.variant, joker),
      inHand: playing.slice(),
      dealt: playing.slice(),
      seen: st.seats.map(() => false),
      blind: st.seats.map(() => 0),
      stake: st.boot,
      pot: bet.reduce((a, b) => a + b, 0),
      bet,
      turn: nextSeat(st, st.dealer, (i) => playing[i]),
      phase: 'bet',
      side: null,
      peeks: st.seats.map(() => []),
      last: st.seats.map(() => ''),
      result: null,
    };
    log(st, -1, 'Hand ' + st.handNo + ' · boot ' + st.boot + (joker ? ' · wild: ' + RANK_WORDS[rankOf(joker)] : ''));
    forceSee(st);
    return { ok: true };
  }

  const activeSeats = (st) => (st.hand ? st.hand.inHand.map((a, i) => (a ? i : -1)).filter((i) => i >= 0) : []);

  /** A blind player past the blind limit sees automatically when their turn comes. */
  function forceSee(st) {
    const h = st.hand;
    const t = h.turn;
    if (t >= 0 && !h.seen[t] && h.blind[t] >= st.blindMax) {
      h.seen[t] = true;
      log(st, t, nameOf(st, t) + ' reached the blind limit and looks');
    }
  }

  function costFor(st, seat, stake) {
    return st.hand.seen[seat] ? 2 * stake : stake;
  }

  /** What this seat may do now (the UI's buttons, the bots' options, and the server's check). */
  function legal(st, seat) {
    const h = st.hand;
    const none = { see: false, pack: false, chaal: null, raise: null, show: null, sideshow: null, respond: false, back: false };
    if (!h || st.over || !st.seats[seat]) return none;
    const me = st.seats[seat];
    const out = Object.assign({}, none);
    out.back = !!me.away;
    if (h.phase === 'done' || !h.inHand[seat]) return out;
    out.see = !h.seen[seat];
    if (h.phase === 'sideshow') {
      out.respond = h.side && h.side.to === seat;
      return out;
    }
    if (h.turn !== seat) return out;
    const active = activeSeats(st);
    out.pack = true;
    const call = costFor(st, seat, h.stake);
    if (me.stack >= call) out.chaal = { cost: call, blind: !h.seen[seat] };
    if (h.stake * 2 <= st.cap && me.stack >= costFor(st, seat, h.stake * 2)) out.raise = { cost: costFor(st, seat, h.stake * 2), stake: h.stake * 2 };
    if (active.length === 2) {
      const opp = active[0] === seat ? active[1] : active[0];
      if (!(h.seen[seat] && !h.seen[opp])) out.show = { cost: Math.min(call, me.stack), allIn: me.stack < call };
    } else if (active.length >= 3 && h.seen[seat]) {
      const to = prevSeat(st, seat, (i) => h.inHand[i]);
      if (to >= 0 && h.seen[to] && me.stack >= 2 * h.stake) out.sideshow = { cost: 2 * h.stake, to };
    }
    return out;
  }

  function pay(st, seat, amount) {
    const h = st.hand;
    const a = Math.max(0, Math.min(st.seats[seat].stack, Math.floor(amount)));
    st.seats[seat].stack -= a;
    h.bet[seat] += a;
    h.pot += a;
    return a;
  }

  function advance(st, from) {
    const h = st.hand;
    h.turn = nextSeat(st, from, (i) => h.inHand[i]);
    h.phase = 'bet';
    h.side = null;
    forceSee(st);
  }

  function win(st, w, reason, shownSeats) {
    const h = st.hand;
    const shown = {};
    const names = {};
    (shownSeats || []).forEach((i) => {
      shown[i] = h.cards[i].slice();
      names[i] = describe(h.cards[i], st.variant, h.joker);
    });
    const winners = Array.isArray(w) ? w : [w];
    const share = Math.floor(h.pot / winners.length);
    let rest = h.pot - share * winners.length;
    const won = {};
    winners.forEach((i) => {
      const add = share + (rest > 0 ? 1 : 0);
      rest = Math.max(0, rest - 1);
      st.seats[i].stack += add;
      won[i] = add;
    });
    h.result = { winners, reason, pot: h.pot, won, shown, names };
    h.phase = 'done';
    h.turn = -1;
    const how = { fold: 'everyone else packed', show: 'the show', sideshow: 'the side show', potlimit: 'the pot limit show' }[reason] || reason;
    log(st, winners[0], winners.map((i) => nameOf(st, i)).join(' & ') + ' win' + (winners.length > 1 ? '' : 's') + ' ' + h.pot + ' — ' + how);
    return { ok: true, result: h.result };
  }

  function afterBet(st, seat) {
    const h = st.hand;
    if (h.pot >= st.potLimit) {
      const act = activeSeats(st);
      const best = Math.max.apply(null, act.map((i) => strength(h.cards[i], st.variant, h.joker)));
      const top = act.filter((i) => strength(h.cards[i], st.variant, h.joker) === best);
      log(st, -1, 'Pot limit reached — every hand is shown');
      return win(st, top, 'potlimit', act);
    }
    advance(st, seat);
    return { ok: true };
  }

  /**
   * Apply one action. Types: see, pack, chaal, raise, show, sideshow, respond {accept}, back,
   * forfeit {reason}. `auto` marks server timeouts (doesn't reset the AFK count).
   */
  function apply(st, seat, action) {
    const a = action || {};
    const h = st.hand;
    if (st.over) return E('over');
    if (!h) return E('no_hand');
    const me = st.seats[seat];
    if (!me) return E('bad_seat');
    if (a.type === 'back') {
      if (!me.away) return E('phase');
      me.away = false;
      me.afk = 0;
      log(st, seat, nameOf(st, seat) + ' is back');
      return { ok: true };
    }
    if (a.type === 'forfeit') {
      if (a.reason === 'left') me.left = true;
      if (a.reason === 'afk') me.away = true;
      if (h.phase !== 'done' && h.inHand[seat]) return packSeat(st, seat, a.reason === 'left' ? ' left the table' : ' is sitting out');
      return { ok: true };
    }
    if (h.phase === 'done') return E('phase');
    if (!h.inHand[seat]) return E('not_in_hand');
    if (!a.auto && ['pack', 'chaal', 'raise', 'show', 'sideshow', 'respond', 'see'].indexOf(a.type) >= 0) me.afk = 0;
    if (a.type === 'see') {
      if (h.seen[seat]) return E('seen');
      h.seen[seat] = true;
      h.last[seat] = 'Seen';
      log(st, seat, nameOf(st, seat) + ' looked at their cards');
      return { ok: true };
    }
    if (a.type === 'respond') {
      if (h.phase !== 'sideshow' || !h.side || h.side.to !== seat) return E('phase');
      const from = h.side.from;
      if (!a.accept) {
        log(st, seat, nameOf(st, seat) + ' denied the side show');
        h.last[seat] = 'Denied side show';
        advance(st, from);
        return { ok: true, accepted: false };
      }
      h.peeks[from].push(seat);
      h.peeks[seat].push(from);
      const sf = strength(h.cards[from], st.variant, h.joker);
      const ss = strength(h.cards[seat], st.variant, h.joker);
      const loser = sf > ss ? seat : from;
      h.inHand[loser] = false;
      h.last[loser] = 'Lost side show';
      log(st, seat, nameOf(st, seat) + ' accepted — ' + nameOf(st, loser) + ' packs');
      if (activeSeats(st).length === 1) return win(st, activeSeats(st)[0], 'sideshow', []);
      advance(st, from);
      return { ok: true, accepted: true, loser };
    }
    if (h.phase !== 'bet') return E('phase');
    if (h.turn !== seat) return E('not_your_turn');
    const L = legal(st, seat);
    switch (a.type) {
      case 'pack':
        return packSeat(st, seat, ' packed');
      case 'chaal': {
        if (!L.chaal) return E('short');
        pay(st, seat, L.chaal.cost);
        if (!h.seen[seat]) h.blind[seat] += 1;
        h.last[seat] = (h.seen[seat] ? 'Chaal ' : 'Blind ') + L.chaal.cost;
        log(st, seat, nameOf(st, seat) + (h.seen[seat] ? ' chaal ' : ' blind ') + L.chaal.cost);
        return afterBet(st, seat);
      }
      case 'raise': {
        if (!L.raise) return E('cap');
        h.stake = L.raise.stake;
        pay(st, seat, L.raise.cost);
        if (!h.seen[seat]) h.blind[seat] += 1;
        h.last[seat] = 'Raise ' + L.raise.cost;
        log(st, seat, nameOf(st, seat) + ' raised to ' + L.raise.cost);
        return afterBet(st, seat);
      }
      case 'show': {
        if (!L.show) return E(activeSeats(st).length === 2 ? 'show_blind' : 'show_two');
        const act = activeSeats(st);
        const opp = act[0] === seat ? act[1] : act[0];
        pay(st, seat, L.show.cost);
        h.last[seat] = 'Show';
        log(st, seat, nameOf(st, seat) + ' asked for a show');
        const sm = strength(h.cards[seat], st.variant, h.joker);
        const so = strength(h.cards[opp], st.variant, h.joker);
        return win(st, sm > so ? seat : opp, 'show', [seat, opp]);
      }
      case 'sideshow': {
        if (!L.sideshow) return E('no_sideshow');
        pay(st, seat, L.sideshow.cost);
        h.phase = 'sideshow';
        h.side = { from: seat, to: L.sideshow.to };
        h.last[seat] = 'Side show?';
        log(st, seat, nameOf(st, seat) + ' asked ' + nameOf(st, L.sideshow.to) + ' for a side show');
        if (h.pot >= st.potLimit) return afterBet(st, seat);
        return { ok: true };
      }
      default:
        return E('bad_action');
    }
  }

  function packSeat(st, seat, why) {
    const h = st.hand;
    h.inHand[seat] = false;
    h.last[seat] = 'Packed';
    log(st, seat, nameOf(st, seat) + why);
    const act = activeSeats(st);
    if (act.length === 1) return win(st, act[0], 'fold', []);
    if (h.phase === 'sideshow' && h.side && (h.side.to === seat || h.side.from === seat)) {
      advance(st, h.side.from === seat ? seat : h.side.from);
      return { ok: true };
    }
    if (h.turn === seat) advance(st, seat);
    return { ok: true };
  }

  /** Between hands: deal the next one, or finish the table after the last hand. */
  function nextHand(st, rng) {
    if (st.over || !st.hand || st.hand.phase !== 'done') return E('phase');
    if (st.handNo >= st.handsMax) return endMatch(st);
    return newHand(st, rng);
  }

  function endMatch(st) {
    st.over = true;
    if (st.hand) {
      st.hand.phase = 'done';
      st.hand.turn = -1;
    }
    st.ranking = st.seats.map((s, i) => i).sort((a, b) => st.seats[b].stack - st.seats[a].stack || a - b);
    st.winner = st.ranking[0];
    log(st, st.winner, 'Table over · ' + nameOf(st, st.winner) + ' finishes on top with ' + st.seats[st.winner].stack);
    return { ok: true, over: true };
  }

  /** Who must act now (the side-show target during a side show). */
  function actor(st) {
    const h = st.hand;
    if (!h || st.over || h.phase === 'done') return -1;
    if (h.phase === 'sideshow') return h.side ? h.side.to : -1;
    return h.turn;
  }

  function publicView(st) {
    const h = st.hand || {};
    return {
      v: st.v,
      variant: st.variant,
      boot: st.boot,
      cap: st.cap,
      potLimit: st.potLimit,
      blindMax: st.blindMax,
      handsMax: st.handsMax,
      buyIn: st.buyIn,
      seats: st.seats.map((s) => ({ id: s.id, name: s.name, bot: !!s.bot, level: s.level || null, stack: s.stack, initial: s.initial, out: !!s.out, left: !!s.left, away: !!s.away, afk: s.afk || 0 })),
      handNo: st.handNo,
      dealer: st.dealer,
      over: !!st.over,
      winner: st.winner,
      ranking: (st.ranking || []).slice(),
      seq: st.seq,
      log: st.log.slice(-10),
      hand: st.hand
        ? {
            no: h.no,
            joker: h.joker || null,
            wild: (h.wild || []).slice(),
            inHand: h.inHand.slice(),
            dealt: h.dealt.slice(),
            seen: h.seen.slice(),
            blind: h.blind.slice(),
            stake: h.stake,
            pot: h.pot,
            bet: h.bet.slice(),
            turn: h.turn,
            phase: h.phase,
            side: h.side || null,
            last: h.last.slice(),
            result: h.result || null,
          }
        : null,
    };
  }

  /** Your cards only once you've looked (blind play is real), plus any side-show peek. */
  function privateView(st, seat) {
    const h = st.hand;
    if (!h || !st.seats[seat]) return { seat: -1, cards: null };
    const mine = h.cards[seat] || [];
    const seen = !!h.seen[seat] || (h.phase === 'done' && !!(h.result && h.result.shown && h.result.shown[seat]));
    const peek = {};
    (h.peeks[seat] || []).forEach((o) => (peek[o] = h.cards[o].slice()));
    return {
      seat,
      handNo: st.handNo,
      seen,
      cards: seen && mine.length ? mine.slice() : null,
      name: seen && mine.length ? describe(mine, st.variant, h.joker) : null,
      peek,
      legal: legal(st, seat),
    };
  }

  // ---------------------------------------------------------------- RTDB hydrate

  function arr(x) {
    if (Array.isArray(x)) return x;
    if (x && typeof x === 'object') {
      const out = [];
      Object.keys(x)
        .filter((k) => /^\d+$/.test(k))
        .forEach((k) => (out[Number(k)] = x[k]));
      return out;
    }
    return [];
  }
  function arrN(x, n, fill) {
    const a = arr(x);
    const out = [];
    for (let i = 0; i < n; i++) out.push(a[i] === undefined || a[i] === null ? (typeof fill === 'function' ? fill() : fill) : a[i]);
    return out;
  }

  function hydrate(st) {
    if (!st) return st;
    st.seats = arr(st.seats).filter(Boolean).map((s) => Object.assign({ stack: 0, initial: 0, out: false, left: false, away: false, afk: 0, bot: false, level: null }, s));
    const n = st.seats.length;
    st.log = arr(st.log).filter(Boolean);
    st.ranking = arr(st.ranking).filter((x) => x != null);
    st.over = !!st.over;
    st.winner = st.winner == null ? -1 : Number(st.winner);
    st.seq = Number(st.seq) || 0;
    const h = st.hand;
    if (h) {
      h.deck = arr(h.deck).filter(Boolean);
      h.cards = arrN(h.cards, n, () => []).map((c) => arr(c).filter(Boolean));
      h.joker = h.joker || null;
      h.wild = arr(h.wild).map(Number);
      h.inHand = arrN(h.inHand, n, false).map(Boolean);
      h.dealt = arrN(h.dealt, n, false).map(Boolean);
      h.seen = arrN(h.seen, n, false).map(Boolean);
      h.blind = arrN(h.blind, n, 0).map((x) => Number(x) || 0);
      h.bet = arrN(h.bet, n, 0).map((x) => Number(x) || 0);
      h.peeks = arrN(h.peeks, n, () => []).map((p) => arr(p).map(Number));
      h.last = arrN(h.last, n, '').map((x) => String(x || ''));
      h.side = h.side || null;
      h.turn = h.turn == null ? -1 : Number(h.turn);
      if (h.result) {
        h.result.winners = arr(h.result.winners).map(Number);
        h.result.won = h.result.won || {};
        h.result.shown = h.result.shown || {};
        Object.keys(h.result.shown).forEach((k) => (h.result.shown[k] = arr(h.result.shown[k]).filter(Boolean)));
        h.result.names = h.result.names || {};
      } else h.result = null;
    }
    return st;
  }

  // ---------------------------------------------------------------- bots

  /** Monte Carlo chance this seat's hand beats every other live hand. */
  function winProb(st, seat, iters, rng) {
    const R = typeof rng === 'function' ? rng : Math.random;
    const h = st.hand;
    const mine = h.cards[seat];
    const known = new Set(mine);
    const peeked = {};
    (h.peeks[seat] || []).forEach((o) => {
      peeked[o] = h.cards[o];
      h.cards[o].forEach((c) => known.add(c));
    });
    if (h.joker) known.add(h.joker);
    const pool = makeDeck().filter((c) => !known.has(c));
    const opps = activeSeats(st).filter((i) => i !== seat);
    if (!opps.length) return 1;
    const me = strength(mine, st.variant, h.joker);
    let score = 0;
    const n = Math.max(20, iters || 150);
    for (let it = 0; it < n; it++) {
      const deck = pool.slice();
      let k = deck.length;
      const draw = () => {
        const j = Math.floor(R() * k) % k;
        k -= 1;
        const c = deck[j];
        deck[j] = deck[k];
        deck[k] = c;
        return c;
      };
      let best = -Infinity;
      let ties = 0;
      for (const o of opps) {
        const cards = peeked[o] || [draw(), draw(), draw()];
        const s = strength(cards, st.variant, h.joker);
        if (s > best) {
          best = s;
          ties = s === me ? 1 : 0;
        } else if (s === best && s === me) ties += 1;
      }
      if (me > best) score += 1;
      else if (me === best) score += 1 / (ties + 1);
    }
    return score / n;
  }

  function hash(s) {
    let x = 2166136261;
    for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619) >>> 0;
    return x;
  }

  /**
   * Deterministic-by-rng bot move for the seat that must act. Always legal.
   * Easy: plays by hand category. Normal: Monte Carlo equity with fixed thresholds.
   * Smart: equity vs pot odds, blind pressure, side shows, and a small bluff rate.
   */
  function botAction(st, seat, rng) {
    const R = typeof rng === 'function' ? rng : Math.random;
    const h = st.hand;
    const me = st.seats[seat];
    const level = me.level || 'normal';
    const L = legal(st, seat);
    if (L.respond) {
      if (level === 'easy') return { type: 'respond', accept: R() < 0.5 };
      const p = winProb(st, seat, level === 'smart' ? 200 : 120, R);
      return { type: 'respond', accept: p >= (level === 'smart' ? 0.5 : 0.55) };
    }
    if (h.turn !== seat || h.phase !== 'bet') return null;
    const active = activeSeats(st);
    if (!h.seen[seat]) {
      const plan = level === 'easy' ? 1 : level === 'normal' ? 2 : 1 + (hash(me.id + ':' + h.no) % 3);
      if (h.blind[seat] >= plan || h.stake >= st.boot * 8) return { type: 'see' };
      if (level === 'smart' && L.raise && R() < 0.12) return { type: 'raise' };
      if (L.chaal) return { type: 'chaal' };
      if (L.show) return { type: 'show' };
      return { type: 'pack' };
    }
    const pot = h.pot;
    let p;
    if (level === 'easy') {
      const e = st.variant === 'muflis' ? evalNatural(h.cards[seat]) : evalHand(h.cards[seat], h.wild);
      const good = st.variant === 'muflis' ? e.cat === 0 && e.tb[0] <= 10 : e.cat >= 1 || e.tb[0] >= 13;
      p = good ? 0.6 : 0.2 + R() * 0.2;
    } else p = winProb(st, seat, level === 'smart' ? 220 : 120, R);
    const call = L.chaal ? L.chaal.cost : Infinity;
    if (!L.chaal) {
      if (L.show && p >= 0.35) return { type: 'show' };
      return { type: 'pack' };
    }
    if (active.length === 2 && L.show) {
      const showAt = level === 'smart' ? (pot >= st.boot * 10 ? 0.55 : 0.7) : 0.6;
      if (p >= showAt) return { type: 'show' };
    }
    if (level === 'easy') {
      if (p < 0.3 && R() < 0.6) return { type: 'pack' };
      return L.raise && p > 0.55 && R() < 0.3 ? { type: 'raise' } : { type: 'chaal' };
    }
    if (level === 'normal') {
      if (p < 0.25) return { type: 'pack' };
      if (L.sideshow && p > 0.35 && p < 0.55 && R() < 0.25) return { type: 'sideshow' };
      if (p > 0.72 && L.raise) return { type: 'raise' };
      return { type: 'chaal' };
    }
    const odds = call / (pot + call);
    if (p < odds * 0.9 && !(R() < 0.08 && call <= st.boot * 4)) return { type: 'pack' };
    if (L.sideshow && p > 0.3 && p < 0.58 && R() < 0.35) return { type: 'sideshow' };
    if (p > 0.72 && L.raise) return { type: 'raise' };
    return { type: 'chaal' };
  }

  /** Timeout move: pack (Live policy). A pending side show is denied. */
  function autoAction(st, seat) {
    const h = st.hand;
    if (h && h.phase === 'sideshow' && h.side && h.side.to === seat) return { type: 'respond', accept: false, auto: true };
    return { type: 'pack', auto: true };
  }

  return {
    RANKS,
    SUITS,
    SUIT_SYMBOLS,
    CATS,
    VARIANTS,
    BUYINS,
    HANDS,
    BLIND_MAX,
    POT_X,
    LEVELS,
    FREE_STACK,
    FREE_BOOT,
    CAP_X,
    MIN_PLAYERS,
    MAX_PLAYERS,
    TURN_MS,
    BANK_MS,
    rankOf,
    suitOf,
    isCard,
    cardLabel,
    makeDeck,
    shuffle,
    evalNatural,
    evalHand,
    wildRanks,
    strength,
    describe,
    mergeSettings,
    bootFor,
    variantLabel,
    newMatch,
    newHand,
    nextHand,
    endMatch,
    legal,
    apply,
    actor,
    activeSeats,
    publicView,
    privateView,
    hydrate,
    winProb,
    botAction,
    autoAction,
  };
});
