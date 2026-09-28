/**
 * OhNoCore — "Oh No!", our shedding card game: rules based on the classic shedding card game,
 * declared house rules, bots. UMD: the party-room server (server-lib/ohno-engine.js), vs-bots
 * practice and tests share this file.
 *
 * Cards are two-character codes: colour (r y g b) + value (0–9, S skip, R reverse, D draw two).
 * Wilds are 'W' (wild) and 'F' (wild draw four). The chosen colour lives in `st.color`.
 * Hands and the draw pile live only in the full state; publicView() never includes them.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OhNoCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const COLORS = ['r', 'y', 'g', 'b'];
  const COLOR_LABEL = { r: 'Red', y: 'Yellow', g: 'Green', b: 'Blue' };
  const COLOR_HEX = { r: '#D94F3D', y: '#F2C12E', g: '#2E9E6A', b: '#2F7BD6' };
  /** Colour-blind mode: a shape per colour so colour is never the only cue. */
  const COLOR_SHAPE = { r: 'circle', y: 'square', g: 'triangle', b: 'diamond' };
  const MIN_PLAYERS = 2;
  const MAX_PLAYERS = 10;
  const LEVELS = ['easy', 'normal', 'smart'];
  const TARGETS = [0, 250, 500];
  const CATCH_MS = 6000;
  const PEEK_MS = 10000;
  const LOG_MAX = 30;

  const DEFAULTS = Object.freeze({
    target: 500,
    stacking: false,
    stackMix: false,
    jumpIn: false,
    sevenZero: false,
    drawUntil: false,
    forcePlay: false,
    noBluff: false,
    quick: false,
  });
  const TOGGLES = ['stacking', 'stackMix', 'jumpIn', 'sevenZero', 'drawUntil', 'forcePlay', 'noBluff', 'quick'];

  function mergeSettings(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const s = Object.assign({}, DEFAULTS);
    const t = Number(r.target);
    if (TARGETS.indexOf(t) >= 0) s.target = t;
    TOGGLES.forEach((k) => {
      if (typeof r[k] === 'boolean') s[k] = r[k];
    });
    if (!s.stacking) s.stackMix = false;
    return s;
  }

  // ---------------- cards ----------------

  function buildDeck() {
    const d = [];
    COLORS.forEach((c) => {
      d.push(c + '0');
      for (let v = 1; v <= 9; v++) d.push(c + v, c + v);
      ['S', 'R', 'D'].forEach((a) => d.push(c + a, c + a));
    });
    for (let i = 0; i < 4; i++) d.push('W', 'F');
    return d;
  }
  const colorOf = (card) => (card && card.length === 2 ? card[0] : null);
  const valueOf = (card) => (card && card.length === 2 ? card[1] : card);
  const isWild = (card) => card === 'W' || card === 'F';
  function points(card) {
    if (isWild(card)) return 50;
    const v = valueOf(card);
    return v >= '0' && v <= '9' ? Number(v) : 20;
  }
  function handPoints(hand) {
    return (hand || []).reduce((s, c) => s + points(c), 0);
  }
  function shuffle(arr, rng) {
    const r = typeof rng === 'function' ? rng : Math.random;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }
  /** Sort for display: by colour (r y g b), then value, wilds last. */
  function sortHand(hand) {
    const rank = (c) => (isWild(c) ? 40 + (c === 'F' ? 1 : 0) : COLORS.indexOf(colorOf(c)) * 10 + '0123456789SRD'.indexOf(valueOf(c)) / 1.5);
    return hand.slice().sort((a, b) => rank(a) - rank(b));
  }

  // ---------------- state ----------------

  /**
   * @param {{id:string,name?:string,bot?:boolean,level?:string,persona?:string}[]} players 2–10 seats in turn order.
   */
  function newMatch(players, settings, rng) {
    const list = (players || []).slice(0, MAX_PLAYERS);
    if (list.length < MIN_PLAYERS) return { error: 'need_players' };
    const st = {
      game: 'uno',
      v: 1,
      settings: mergeSettings(settings),
      seats: list.map((p) => ({
        id: String(p.id),
        name: String(p.name || (p.bot ? 'Bot' : 'Player')).slice(0, 32),
        bot: !!p.bot,
        level: LEVELS.indexOf(p.level) >= 0 ? p.level : 'normal',
        persona: p.persona === 'bluffer' ? 'bluffer' : 'honest',
        hand: [],
        called: false,
        afk: 0,
        forfeit: false,
      })),
      scores: list.map(() => 0),
      round: 0,
      dealer: list.length - 1,
      draw: [],
      discard: [],
      color: null,
      dir: 1,
      turn: 0,
      phase: 'play',
      pending: 0,
      pendingKind: null,
      drawn: null,
      wd4: null,
      ohno: null,
      peek: null,
      plays: list.map(() => ({ r: 0, y: 0, g: 0, b: 0 })),
      drewOn: list.map(() => ''),
      seq: 0,
      log: [],
      lastRound: null,
      roundOver: false,
      over: false,
      ranking: null,
    };
    startRound(st, rng);
    return st;
  }

  const arr = (v) => (Array.isArray(v) ? v.slice() : v && typeof v === 'object' ? Object.keys(v).sort((a, b) => a - b).map((k) => v[k]) : []);
  function arrN(v, n, fill) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const x = Array.isArray(v) ? v[i] : v && typeof v === 'object' ? v[i] : undefined;
      out.push(x === undefined || x === null ? (typeof fill === 'function' ? fill() : fill) : x);
    }
    return out;
  }

  /** Restore shapes after an RTDB round-trip (empty arrays and nulls are dropped). */
  function hydrate(st) {
    if (!st) return st;
    st.seats = arr(st.seats).map((s) => Object.assign(s, { hand: arr(s.hand), called: !!s.called, forfeit: !!s.forfeit, bot: !!s.bot, afk: Number(s.afk) || 0 }));
    const n = st.seats.length;
    st.settings = mergeSettings(st.settings);
    st.scores = arrN(st.scores, n, 0).map(Number);
    st.draw = arr(st.draw);
    st.discard = arr(st.discard);
    st.log = arr(st.log).map((e) => {
      if (e && e.type === 'round_over') e.points = Number(e.points) || 0;
      return e;
    });
    st.plays = arrN(st.plays, n, () => ({})).map((p) => ({ r: Number(p.r) || 0, y: Number(p.y) || 0, g: Number(p.g) || 0, b: Number(p.b) || 0 }));
    st.drewOn = arrN(st.drewOn, n, '');
    ['color', 'pendingKind', 'drawn', 'wd4', 'ohno', 'peek', 'lastRound', 'ranking'].forEach((k) => {
      if (st[k] === undefined) st[k] = null;
    });
    if (st.peek) st.peek.hand = arr(st.peek.hand);
    if (st.lastRound) {
      st.lastRound.hands = arrN(st.lastRound.hands, n, () => []).map(arr);
      st.lastRound.handPoints = arrN(st.lastRound.handPoints, n, 0).map(Number);
    }
    if (st.ranking) st.ranking = arr(st.ranking).map(Number);
    st.pending = Number(st.pending) || 0;
    st.dir = st.dir === -1 ? -1 : 1;
    st.over = !!st.over;
    st.roundOver = !!st.roundOver;
    return st;
  }

  function pushLog(st, e) {
    st.seq += 1;
    e.seq = st.seq;
    st.log.push(e);
    if (st.log.length > LOG_MAX) st.log.splice(0, st.log.length - LOG_MAX);
    return e;
  }

  function nextSeat(st, from, k) {
    const n = st.seats.length;
    const step = k == null ? 1 : k;
    return (((from + st.dir * step) % n) + n) % n;
  }

  function reshuffle(st, rng) {
    if (st.discard.length <= 1) return false;
    const top = st.discard.pop();
    st.draw = shuffle(st.discard, rng);
    st.discard = [top];
    pushLog(st, { type: 'reshuffle', n: st.draw.length });
    return true;
  }

  /** Draw `k` cards for `seat`; reshuffles the discards (except the top card) when the pile runs out. */
  function drawCards(st, seat, k, rng) {
    const got = [];
    for (let i = 0; i < k; i++) {
      if (!st.draw.length && !reshuffle(st, rng)) break;
      const c = st.draw.pop();
      st.seats[seat].hand.push(c);
      got.push(c);
    }
    if (st.seats[seat].hand.length > 1) st.seats[seat].called = false;
    return got;
  }

  function startRound(st, rng) {
    const n = st.seats.length;
    st.round += 1;
    st.dealer = (st.dealer + 1) % n;
    st.dir = 1;
    st.draw = shuffle(buildDeck(), rng);
    st.discard = [];
    st.pending = 0;
    st.pendingKind = null;
    st.drawn = null;
    st.wd4 = null;
    st.ohno = null;
    st.peek = null;
    st.roundOver = false;
    st.plays = st.seats.map(() => ({ r: 0, y: 0, g: 0, b: 0 }));
    st.drewOn = st.seats.map(() => '');
    st.seats.forEach((s) => {
      s.hand = [];
      s.called = false;
    });
    const deal = st.settings.quick ? 5 : 7;
    for (let k = 0; k < deal; k++) st.seats.forEach((s) => s.hand.push(st.draw.pop()));
    // A Wild Draw Four can't start the pile: return it, reshuffle, flip again.
    let top = st.draw.pop();
    while (top === 'F') {
      st.draw.push(top);
      shuffle(st.draw, rng);
      top = st.draw.pop();
    }
    st.discard.push(top);
    const first = nextSeat(st, st.dealer, 1);
    st.color = colorOf(top);
    st.phase = 'play';
    st.turn = first;
    pushLog(st, { type: 'round_start', round: st.round, dealer: st.dealer, top });
    const v = valueOf(top);
    if (top === 'W') {
      st.phase = 'color';
    } else if (v === 'S') {
      pushLog(st, { type: 'skip', seat: first });
      st.turn = nextSeat(st, first, 1);
    } else if (v === 'R') {
      if (n > 2) st.dir = -1;
      pushLog(st, { type: 'reverse', dir: st.dir });
      st.turn = st.dealer;
    } else if (v === 'D') {
      drawCards(st, first, 2, rng);
      pushLog(st, { type: 'draw', seat: first, n: 2, forced: true });
      st.turn = nextSeat(st, first, 1);
    }
  }

  // ---------------- legality ----------------

  function top(st) {
    return st.discard[st.discard.length - 1];
  }

  /** Can `seat` play `card` right now (in turn)? Wild Draw Four is always playable; honesty is a challenge question. */
  function canPlay(st, seat, card) {
    if (st.over || st.roundOver || seat !== st.turn) return false;
    const s = st.settings;
    if (st.phase === 'drawn') {
      if (card !== st.drawn) return false;
    } else if (st.phase === 'challenge') {
      if (!s.stacking) return false;
    } else if (st.phase !== 'play') return false;
    if (st.pending > 0) {
      if (!s.stacking) return false;
      if (st.pendingKind === 'D') return valueOf(card) === 'D' || (s.stackMix && card === 'F');
      return card === 'F' || (s.stackMix && valueOf(card) === 'D' && colorOf(card) === st.color);
    }
    if (isWild(card)) return true;
    const t = top(st);
    return colorOf(card) === st.color || (!isWild(t) && valueOf(card) === valueOf(t));
  }

  function legalCards(st, seat) {
    const hand = st.seats[seat].hand;
    const out = [];
    hand.forEach((c) => {
      if (out.indexOf(c) < 0 && canPlay(st, seat, c)) out.push(c);
    });
    return out;
  }

  /** Wild Draw Four is honest only when you hold no card of the current colour. */
  function wd4Legal(st, seat) {
    return !st.seats[seat].hand.some((c) => colorOf(c) === st.color);
  }

  /** Out-of-turn identical card (Jump-In house rule). `seq` = the state the player saw (first valid arrival wins). */
  function canJumpIn(st, seat, card, seq) {
    if (!st.settings.jumpIn || st.over || st.roundOver) return false;
    if (st.phase !== 'play' && st.phase !== 'drawn') return false;
    if (st.pending > 0 || isWild(card) || seat === st.turn) return false;
    if (seq != null && Number(seq) !== st.seq) return false;
    return card === top(st) && st.seats[seat].hand.indexOf(card) >= 0;
  }

  // ---------------- actions ----------------

  function expire(st, now) {
    if (st.ohno && now > st.ohno.closesAt) st.ohno = null;
    if (st.peek && now > st.peek.until) st.peek = null;
  }
  /** The next player starting their turn closes the catch window. */
  function closeOhno(st, actor) {
    if (st.ohno && st.ohno.seat !== actor) st.ohno = null;
  }

  function endTurn(st, to) {
    st.turn = to;
    st.phase = 'play';
    st.drawn = null;
  }

  function endRound(st, winner) {
    const n = st.seats.length;
    const hp = st.seats.map((s) => handPoints(s.hand));
    const pts = hp.reduce((a, b, i) => (i === winner ? a : a + b), 0);
    st.scores[winner] += pts;
    st.lastRound = { round: st.round, winner, points: pts, hands: st.seats.map((s) => s.hand.slice()), handPoints: hp };
    st.roundOver = true;
    st.phase = 'roundOver';
    st.pending = 0;
    st.pendingKind = null;
    st.wd4 = null;
    st.ohno = null;
    st.drawn = null;
    pushLog(st, { type: 'round_over', seat: winner, points: pts, round: st.round });
    const target = st.settings.target;
    if (!target || st.scores[winner] >= target) finishMatch(st, 'target');
    else if (n < 2) finishMatch(st, 'players');
  }

  function finalRanking(st) {
    const idx = st.seats.map((s, i) => i);
    const lr = st.lastRound;
    idx.sort((a, b) => {
      if (st.scores[b] !== st.scores[a]) return st.scores[b] - st.scores[a];
      if (lr) return (lr.handPoints[a] || 0) - (lr.handPoints[b] || 0);
      return st.seats[a].hand.length - st.seats[b].hand.length;
    });
    return idx.filter((i) => !st.seats[i].forfeit).concat(idx.filter((i) => st.seats[i].forfeit));
  }

  function finishMatch(st, reason) {
    st.over = true;
    st.phase = 'over';
    st.ranking = finalRanking(st);
    pushLog(st, { type: 'over', reason, ranking: st.ranking.slice() });
  }

  function nextRound(st, rng) {
    if (st.over || !st.roundOver) return { error: 'round_in_progress' };
    const from = st.seq;
    startRound(st, rng);
    return { events: st.log.filter((e) => e.seq > from) };
  }

  function playCard(st, seat, a, rng, now, jump) {
    const s = st.settings;
    const me = st.seats[seat];
    const card = String(a.card || '');
    const n = st.seats.length;
    if (isWild(card) && COLORS.indexOf(a.color) < 0) return { error: 'pick_color' };
    let target = null;
    if (s.sevenZero && valueOf(card) === '7') {
      target = n === 2 ? nextSeat(st, seat, 1) : Number(a.target);
      if (!(target >= 0 && target < n) || target === seat) return { error: 'pick_player' };
    }
    const wasChallenge = st.phase === 'challenge';
    if (a.call && me.hand.length === 2) me.called = true;
    const honest = card === 'F' ? wd4Legal(st, seat) : true;
    me.hand.splice(me.hand.indexOf(card), 1);
    st.discard.push(card);
    const prevColor = st.color;
    st.color = isWild(card) ? a.color : colorOf(card);
    if (!isWild(card)) st.plays[seat][st.color] += 1;
    if (jump) pushLog(st, { type: 'jump', seat, card });
    pushLog(st, { type: 'play', seat, card, color: st.color, left: me.hand.length });
    st.drawn = null;
    st.phase = 'play';
    if (wasChallenge) st.wd4 = null;

    if (me.hand.length === 1) {
      if (me.called) pushLog(st, { type: 'ohno', seat });
      else st.ohno = { seat, closesAt: now + CATCH_MS };
    } else if (me.hand.length > 1) me.called = false;

    const v = valueOf(card);
    if (!me.hand.length) {
      const victim = nextSeat(st, seat, 1);
      const owed = st.pending + (v === 'D' ? 2 : card === 'F' ? 4 : 0);
      if (owed) {
        drawCards(st, victim, owed, rng);
        pushLog(st, { type: 'draw', seat: victim, n: owed, forced: true });
      }
      endRound(st, seat);
      return {};
    }

    if (s.sevenZero && v === '7') {
      const mine = me.hand;
      me.hand = st.seats[target].hand;
      st.seats[target].hand = mine;
      pushLog(st, { type: 'swap', seat, target });
      st.ohno = null;
      [seat, target].forEach((i) => (st.seats[i].called = st.seats[i].hand.length === 1));
      endTurn(st, nextSeat(st, seat, 1));
      return {};
    }
    if (s.sevenZero && v === '0') {
      const hands = st.seats.map((x) => x.hand);
      st.seats.forEach((x, i) => (st.seats[nextSeat(st, i, 1)].hand = hands[i]));
      pushLog(st, { type: 'rotate', dir: st.dir });
      st.ohno = null;
      st.seats.forEach((x) => (x.called = x.hand.length === 1));
      endTurn(st, nextSeat(st, seat, 1));
      return {};
    }
    if (v === 'S') {
      pushLog(st, { type: 'skip', seat: nextSeat(st, seat, 1) });
      endTurn(st, nextSeat(st, seat, 2));
    } else if (v === 'R') {
      if (n === 2) {
        pushLog(st, { type: 'skip', seat: nextSeat(st, seat, 1) });
        endTurn(st, seat);
      } else {
        st.dir = -st.dir;
        pushLog(st, { type: 'reverse', dir: st.dir });
        endTurn(st, nextSeat(st, seat, 1));
      }
    } else if (v === 'D') {
      const victim = nextSeat(st, seat, 1);
      if (s.stacking) {
        st.pending += 2;
        st.pendingKind = 'D';
        endTurn(st, victim);
      } else {
        drawCards(st, victim, 2, rng);
        pushLog(st, { type: 'draw', seat: victim, n: 2, forced: true });
        endTurn(st, nextSeat(st, seat, 2));
      }
    } else if (card === 'F') {
      const victim = nextSeat(st, seat, 1);
      if (s.noBluff && !s.stacking) {
        drawCards(st, victim, 4, rng);
        pushLog(st, { type: 'draw', seat: victim, n: 4, forced: true });
        endTurn(st, nextSeat(st, seat, 2));
      } else {
        st.pending += 4;
        st.pendingKind = 'F';
        endTurn(st, victim);
        if (!s.noBluff) {
          st.wd4 = { by: seat, prevColor, guilty: !honest };
          st.phase = 'challenge';
        }
      }
    } else {
      endTurn(st, nextSeat(st, seat, 1));
    }
    return {};
  }

  /**
   * Apply one player action. ctx = { rng, now }.
   * Actions: play {card, color?, target?, call?, seq?} · draw · pass · color {color} · challenge · accept
   * · ohno (call) · catch {target}.
   */
  function apply(st, seat, action, ctx) {
    const a = action || {};
    const c = ctx || {};
    const rng = c.rng || Math.random;
    const now = Number(c.now) || Date.now();
    if (st.over) return { error: 'over' };
    if (!(seat >= 0 && seat < st.seats.length)) return { error: 'not_seated' };
    expire(st, now);
    const from = st.seq;
    const me = st.seats[seat];
    const done = (out) => (out && out.error ? out : { events: st.log.filter((e) => e.seq > from) });
    if (st.roundOver && a.type !== 'catch') return { error: 'round_over' };

    switch (a.type) {
      case 'play': {
        const card = String(a.card || '');
        if (me.hand.indexOf(card) < 0) return { error: 'not_in_hand' };
        // Jump-In sends the seq it saw; anything else landed first, so this one lost the race.
        if (a.seq != null && Number(a.seq) !== st.seq) return { error: 'too_late' };
        if (seat !== st.turn) {
          if (!canJumpIn(st, seat, card, a.seq)) return { error: st.settings.jumpIn ? 'too_late' : 'not_your_turn' };
          closeOhno(st, seat);
          endTurn(st, seat);
          return done(playCard(st, seat, a, rng, now, true));
        }
        if (!canPlay(st, seat, card)) return { error: 'illegal_card' };
        closeOhno(st, seat);
        return done(playCard(st, seat, a, rng, now, false));
      }
      case 'draw': {
        if (seat !== st.turn) return { error: 'not_your_turn' };
        if (st.phase !== 'play') return { error: 'phase' };
        closeOhno(st, seat);
        if (st.pending > 0) {
          const k = st.pending;
          drawCards(st, seat, k, rng);
          pushLog(st, { type: 'draw', seat, n: k, forced: true });
          st.pending = 0;
          st.pendingKind = null;
          endTurn(st, nextSeat(st, seat, 1));
          return done();
        }
        st.drewOn[seat] = st.color || '';
        let got = [];
        let last = null;
        do {
          const one = drawCards(st, seat, 1, rng);
          if (!one.length) break;
          got = got.concat(one);
          last = one[0];
        } while (st.settings.drawUntil && !canPlay(st, seat, last));
        pushLog(st, { type: 'draw', seat, n: got.length });
        if (last && canPlay(st, seat, last)) {
          st.phase = 'drawn';
          st.drawn = last;
        } else endTurn(st, nextSeat(st, seat, 1));
        return done();
      }
      case 'pass': {
        if (seat !== st.turn || st.phase !== 'drawn') return { error: 'phase' };
        if (st.settings.forcePlay) return { error: 'must_play' };
        pushLog(st, { type: 'pass', seat });
        endTurn(st, nextSeat(st, seat, 1));
        return done();
      }
      case 'color': {
        if (seat !== st.turn || st.phase !== 'color') return { error: 'phase' };
        if (COLORS.indexOf(a.color) < 0) return { error: 'pick_color' };
        st.color = a.color;
        st.phase = 'play';
        pushLog(st, { type: 'color', seat, color: a.color });
        return done();
      }
      case 'challenge': {
        if (seat !== st.turn || st.phase !== 'challenge' || !st.wd4) return { error: 'phase' };
        closeOhno(st, seat);
        const by = st.wd4.by;
        const guilty = !!st.wd4.guilty;
        st.peek = { by: seat, seat: by, hand: st.seats[by].hand.slice(), until: now + PEEK_MS };
        pushLog(st, { type: 'challenge', seat, target: by, guilty });
        st.wd4 = null;
        if (guilty) {
          drawCards(st, by, 4, rng);
          pushLog(st, { type: 'draw', seat: by, n: 4, forced: true });
          st.pending = Math.max(0, st.pending - 4);
          if (!st.pending) st.pendingKind = null;
          st.phase = 'play';
        } else {
          const k = st.pending + 2;
          drawCards(st, seat, k, rng);
          pushLog(st, { type: 'draw', seat, n: k, forced: true });
          st.pending = 0;
          st.pendingKind = null;
          endTurn(st, nextSeat(st, seat, 1));
        }
        return done();
      }
      case 'accept': {
        if (seat !== st.turn || st.phase !== 'challenge') return { error: 'phase' };
        closeOhno(st, seat);
        const k = st.pending;
        drawCards(st, seat, k, rng);
        pushLog(st, { type: 'draw', seat, n: k, forced: true });
        st.pending = 0;
        st.pendingKind = null;
        st.wd4 = null;
        endTurn(st, nextSeat(st, seat, 1));
        return done();
      }
      case 'ohno': {
        if (me.hand.length === 1 && st.ohno && st.ohno.seat === seat) {
          st.ohno = null;
          me.called = true;
          pushLog(st, { type: 'ohno', seat });
          return done();
        }
        if (me.hand.length === 2 && seat === st.turn && legalCards(st, seat).length) {
          me.called = true;
          return done();
        }
        return { error: 'cant_call' };
      }
      case 'catch': {
        const t = Number(a.target);
        if (!st.ohno || st.ohno.seat !== t || t === seat) return { error: 'too_late' };
        if (st.seats[t].hand.length !== 1 || st.seats[t].called) return { error: 'too_late' };
        st.ohno = null;
        drawCards(st, t, 2, rng);
        pushLog(st, { type: 'catch', seat, target: t });
        pushLog(st, { type: 'draw', seat: t, n: 2, forced: true });
        return done();
      }
      default:
        return { error: 'bad_action' };
    }
  }

  /** A seat leaves / goes AFK too often: a bot finishes it so the table can play on; it places last. */
  function takeOver(st, seat, reason) {
    const s = st.seats[seat];
    if (!s || s.forfeit) return false;
    s.bot = true;
    s.forfeit = true;
    s.level = 'normal';
    s.persona = 'honest';
    pushLog(st, { type: 'takeover', seat, reason: reason || 'left' });
    if (!st.over && !st.seats.some((x) => !x.bot && !x.forfeit)) finishMatch(st, 'no_humans');
    return true;
  }

  /** AFK: auto-draw, then pass (policy). Returns the action to run for the seat whose turn it is. */
  function autoAction(st, seat) {
    if (st.phase === 'color') return { type: 'color', color: bestColor(st, seat, 'normal') };
    if (st.phase === 'challenge') return { type: 'accept' };
    if (st.phase === 'drawn') {
      if (!st.settings.forcePlay) return { type: 'pass' };
      return withChoices(st, seat, { type: 'play', card: st.drawn }, 'normal');
    }
    return { type: 'draw' };
  }

  // ---------------- bots ----------------

  const CALL_CHANCE = { easy: 0.7, normal: 0.92, smart: 1 };
  const CATCH_CHANCE = { easy: 0.2, normal: 0.5, smart: 0.92 };
  const PERSONAS = {
    honest: { name: 'Honest', style: { aggression: 0.5, bluff: 0, speed: 0.6, chattiness: 0.3 } },
    bluffer: { name: 'Bluffer', style: { aggression: 0.7, bluff: 0.6, speed: 0.6, chattiness: 0.4 } },
  };

  function colorCounts(hand) {
    const c = { r: 0, y: 0, g: 0, b: 0 };
    hand.forEach((x) => {
      const k = colorOf(x);
      if (k) c[k] += 1;
    });
    return c;
  }

  /** Colour for a Wild: the one we hold most of; Smart also avoids colours the next player keeps playing. */
  function bestColor(st, seat, level, rng, exclude) {
    const r = rng || Math.random;
    const hand = st.seats[seat].hand.slice();
    if (exclude) hand.splice(hand.indexOf(exclude), 1);
    const counts = colorCounts(hand);
    if (level === 'easy') return COLORS[Math.floor(r() * 4)];
    const nx = nextSeat(st, seat, 1);
    let best = COLORS[0];
    let bestScore = -Infinity;
    COLORS.forEach((c) => {
      let sc = counts[c] * 3 + r() * 0.5;
      if (level === 'smart') {
        sc -= (st.plays[nx][c] || 0) * 1.2;
        if (st.drewOn[nx] === c) sc += 2.5;
        sc += hand.filter((x) => colorOf(x) === c && points(x) >= 20).length * 0.5;
      }
      if (sc > bestScore) {
        bestScore = sc;
        best = c;
      }
    });
    return best;
  }

  function withChoices(st, seat, action, level, rng) {
    const a = Object.assign({}, action);
    if (isWild(a.card)) a.color = bestColor(st, seat, level, rng, a.card);
    if (st.settings.sevenZero && valueOf(a.card) === '7') {
      const n = st.seats.length;
      let pick = nextSeat(st, seat, 1);
      let min = Infinity;
      for (let i = 0; i < n; i++) {
        if (i === seat) continue;
        const len = st.seats[i].hand.length;
        if (len < min) {
          min = len;
          pick = i;
        }
      }
      a.target = pick;
    }
    return a;
  }

  /** Probability (estimate) that the Draw Four player actually held the old colour. */
  function guiltEstimate(st, by) {
    const h = st.seats[by].hand.length + 1;
    let p = 1 - Math.pow(0.75, Math.max(0, h - 1));
    if (st.wd4 && st.drewOn[by] && st.drewOn[by] === st.wd4.prevColor) p *= 0.35;
    return p;
  }

  function scoreCard(st, seat, card, level) {
    const me = st.seats[seat];
    const n = st.seats.length;
    const nx = nextSeat(st, seat, 1);
    const nextLow = st.seats[nx].hand.length <= 2;
    const anyLow = st.seats.some((s, i) => i !== seat && s.hand.length <= 2);
    const v = valueOf(card);
    const after = me.hand.slice();
    after.splice(after.indexOf(card), 1);
    let sc = 10;
    if (v >= '0' && v <= '9') sc += Number(v) * 0.4;
    if (v === 'S' || v === 'R' || v === 'D') sc += 4 + (nextLow ? 14 : 0) + (v === 'D' ? 2 : 0);
    if (card === 'W') sc = 3;
    if (card === 'F') sc = 2 + (nextLow ? 20 : 0);
    if (!isWild(card)) sc += colorCounts(after)[colorOf(card)] * 1.5;
    if (level === 'smart') {
      if (anyLow) sc += points(card) * 0.35;
      if (isWild(card) && after.length > 2 && !nextLow) sc -= 10;
      if (!isWild(card) && colorOf(card) !== st.color && st.drewOn[nx] === colorOf(card)) sc += 5;
      if (!isWild(card) && (st.plays[nx][colorOf(card)] || 0) >= 2) sc -= 2;
      if (st.settings.sevenZero && v === '7') {
        const min = Math.min.apply(null, st.seats.filter((s, i) => i !== seat).map((s) => s.hand.length));
        sc += (after.length - min) * 4;
      }
      if (st.settings.sevenZero && v === '0') {
        const prev = st.seats[nextSeat(st, seat, -1)] || st.seats[(seat + n - st.dir) % n];
        sc += (after.length - prev.hand.length) * 3;
      }
    }
    return sc;
  }

  /**
   * Bot decision for the seat whose turn it is. opts.style from the botPersona hook ({ bluff }).
   * Honest bots only play Draw Four legally; a bluffing persona may bluff and can be challenged.
   */
  function botAction(st, seat, rng, opts) {
    const r = rng || Math.random;
    const me = st.seats[seat];
    const level = me.level || 'normal';
    const bluff = (opts && opts.style && Number(opts.style.bluff)) || (PERSONAS[me.persona] || PERSONAS.honest).style.bluff;
    const call = r() < (CALL_CHANCE[level] || 0.9);
    const finish = (a) => {
      const out = withChoices(st, seat, a, level, r);
      if (out.type === 'play' && me.hand.length === 2 && call) out.call = true;
      return out;
    };
    if (st.phase === 'color') return { type: 'color', color: bestColor(st, seat, level, r) };
    const legal = legalCards(st, seat);
    const honestF = st.settings.noBluff || wd4Legal(st, seat);
    const usable = legal.filter((c) => c !== 'F' || honestF || r() < bluff);
    if (st.phase === 'challenge') {
      const stack = usable.filter((c) => c === 'F' || valueOf(c) === 'D');
      if (stack.length && (level !== 'easy' || r() < 0.5)) return finish({ type: 'play', card: stack[0] });
      const p = guiltEstimate(st, st.wd4 ? st.wd4.by : seat);
      const go = level === 'easy' ? r() < 0.15 : level === 'normal' ? p > 0.6 && r() < 0.7 : p > 0.4;
      return { type: go ? 'challenge' : 'accept' };
    }
    if (st.phase === 'drawn') {
      if (st.settings.forcePlay || level !== 'easy' || r() < 0.8) {
        if (st.drawn !== 'F' || honestF || st.settings.forcePlay || r() < bluff) return finish({ type: 'play', card: st.drawn });
      }
      return { type: 'pass' };
    }
    if (!usable.length) return { type: 'draw' };
    if (st.pending > 0 && level === 'easy' && r() < 0.4) return { type: 'draw' };
    if (level === 'easy') return finish({ type: 'play', card: usable[Math.floor(r() * usable.length)] });
    let best = usable[0];
    let bestSc = -Infinity;
    usable.forEach((c) => {
      const sc = scoreCard(st, seat, c, level) + r() * 0.8;
      if (sc > bestSc) {
        bestSc = sc;
        best = c;
      }
    });
    return finish({ type: 'play', card: best });
  }

  /** Would a bot at `level` catch a missed Oh No! call right now? (Smart remembers who called.) */
  function botWouldCatch(st, level, rng) {
    if (!st.ohno) return false;
    const t = st.seats[st.ohno.seat];
    if (!t || t.called || t.hand.length !== 1) return false;
    return (rng || Math.random)() < (CATCH_CHANCE[level] || 0.5);
  }

  // ---------------- views ----------------

  /** Everything any player may see: no hands, no draw pile, no drawn card, no Draw Four honesty. */
  function publicView(st) {
    return {
      game: 'uno',
      v: 1,
      settings: Object.assign({}, st.settings),
      seats: st.seats.map((s) => ({ id: s.id, name: s.name, bot: s.bot, level: s.level, count: s.hand.length, called: s.called, afk: s.afk, forfeit: s.forfeit })),
      scores: st.scores.slice(),
      round: st.round,
      dealer: st.dealer,
      drawCount: st.draw.length,
      discardCount: st.discard.length,
      recent: st.discard.slice(-4),
      color: st.color,
      dir: st.dir,
      turn: st.turn,
      phase: st.phase,
      pending: st.pending,
      pendingKind: st.pendingKind,
      wd4: st.wd4 ? { by: st.wd4.by } : null,
      ohno: st.ohno ? { seat: st.ohno.seat, closesAt: st.ohno.closesAt } : null,
      drawnBy: st.phase === 'drawn' ? st.turn : null,
      seq: st.seq,
      log: st.log.map((e) => Object.assign({}, e)),
      lastRound: st.lastRound ? JSON.parse(JSON.stringify(st.lastRound)) : null,
      roundOver: st.roundOver,
      over: st.over,
      ranking: st.ranking ? st.ranking.slice() : null,
      plays: st.plays.map((p) => Object.assign({}, p)),
      drewOn: st.drewOn.slice(),
    };
  }

  /** Restore a public view after an RTDB round-trip. */
  function hydrateView(v) {
    if (!v) return v;
    v.seats = arr(v.seats).map((s) => Object.assign(s, { count: Number(s.count) || 0, called: !!s.called, forfeit: !!s.forfeit, bot: !!s.bot }));
    const n = v.seats.length;
    v.settings = mergeSettings(v.settings);
    v.scores = arrN(v.scores, n, 0).map(Number);
    v.recent = arr(v.recent);
    v.log = arr(v.log);
    v.plays = arrN(v.plays, n, () => ({}));
    v.drewOn = arrN(v.drewOn, n, '');
    ['color', 'pendingKind', 'wd4', 'ohno', 'drawnBy', 'lastRound', 'ranking'].forEach((k) => {
      if (v[k] === undefined) v[k] = null;
    });
    if (v.lastRound) {
      v.lastRound.hands = arrN(v.lastRound.hands, n, () => []).map(arr);
      v.lastRound.handPoints = arrN(v.lastRound.handPoints, n, 0).map(Number);
    }
    if (v.ranking) v.ranking = arr(v.ranking).map(Number);
    v.pending = Number(v.pending) || 0;
    v.dir = v.dir === -1 ? -1 : 1;
    v.over = !!v.over;
    v.roundOver = !!v.roundOver;
    return v;
  }

  /** One player's private view: their hand, the card they just drew, a challenge peek meant for them. */
  function privateView(st, seat) {
    const s = st.seats[seat];
    return {
      round: st.round,
      seq: st.seq,
      hand: s ? s.hand.slice() : [],
      drawn: st.phase === 'drawn' && st.turn === seat ? st.drawn : null,
      peek: st.peek && st.peek.by === seat ? { seat: st.peek.seat, hand: st.peek.hand.slice() } : null,
    };
  }

  return {
    COLORS,
    COLOR_LABEL,
    COLOR_HEX,
    COLOR_SHAPE,
    MIN_PLAYERS,
    MAX_PLAYERS,
    LEVELS,
    TARGETS,
    CATCH_MS,
    DEFAULTS,
    TOGGLES,
    PERSONAS,
    mergeSettings,
    buildDeck,
    colorOf,
    valueOf,
    isWild,
    points,
    handPoints,
    shuffle,
    sortHand,
    newMatch,
    hydrate,
    startRound,
    nextRound,
    nextSeat,
    top,
    canPlay,
    legalCards,
    wd4Legal,
    canJumpIn,
    drawCards,
    apply,
    takeOver,
    autoAction,
    bestColor,
    botAction,
    botWouldCatch,
    guiltEstimate,
    finalRanking,
    publicView,
    hydrateView,
    privateView,
  };
});
