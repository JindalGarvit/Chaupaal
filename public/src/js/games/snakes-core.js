/**
 * SnakesCore — standard Snakes & Ladders on a 100-square board. A game of chance: there are no
 * decisions, so bots only roll. UMD: client practice, party-room server adapter and tests.
 * Dice values come from the caller (server CSPRNG in Live, seeded RNG in practice).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SnakesCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SQUARES = 100;
  const MIN_PLAYERS = 2;
  const MAX_PLAYERS = 6;
  const LOG_MAX = 40;
  /** Okabe–Ito palette + shape markers, so colour is never the only cue. */
  const TOKENS = [
    { id: 'orange', label: 'Orange', hex: '#E69F00', shape: 'circle' },
    { id: 'sky', label: 'Sky', hex: '#56B4E9', shape: 'triangle' },
    { id: 'green', label: 'Green', hex: '#009E73', shape: 'square' },
    { id: 'yellow', label: 'Yellow', hex: '#F0E442', shape: 'diamond' },
    { id: 'blue', label: 'Blue', hex: '#0072B2', shape: 'star' },
    { id: 'pink', label: 'Pink', hex: '#CC79A7', shape: 'hexagon' },
  ];

  const BOARDS = [
    {
      id: 'classic',
      name: 'Classic',
      theme: 'classic',
      desc: 'The traditional layout — 10 snakes, 9 ladders',
      snakes: { 16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 78 },
      ladders: { 1: 38, 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 100 },
      labels: {},
    },
    {
      id: 'jungle',
      name: 'Jungle',
      theme: 'jungle',
      desc: 'Vines and pythons — long climbs, one nasty drop near the top',
      snakes: { 17: 7, 54: 34, 62: 18, 64: 60, 87: 36, 93: 73, 95: 75, 99: 41 },
      ladders: { 3: 22, 5: 8, 11: 26, 20: 29, 27: 56, 43: 77, 50: 91, 57: 76, 72: 84 },
      labels: {},
    },
    {
      id: 'galaxy',
      name: 'Galaxy',
      theme: 'galaxy',
      desc: 'Rockets up, black holes down — 8 of each',
      snakes: { 25: 4, 46: 13, 53: 31, 69: 48, 76: 58, 83: 61, 92: 70, 97: 79 },
      ladders: { 2: 23, 8: 34, 19: 38, 28: 55, 40: 62, 51: 72, 65: 86, 74: 95 },
      labels: {},
    },
    {
      id: 'moksha',
      name: 'Moksha Patam',
      theme: 'moksha',
      desc: 'The original Indian board: virtues climb, vices slide — more snakes than ladders',
      snakes: { 14: 4, 29: 9, 38: 15, 47: 21, 56: 30, 63: 37, 72: 43, 85: 52, 91: 66, 99: 54 },
      ladders: { 6: 25, 18: 40, 32: 51, 44: 65, 58: 77, 69: 88, 81: 98 },
      labels: {
        6: 'Faith', 18: 'Kindness', 32: 'Truth', 44: 'Patience', 58: 'Generosity', 69: 'Wisdom', 81: 'Humility',
        14: 'Anger', 29: 'Greed', 38: 'Pride', 47: 'Envy', 56: 'Lies', 63: 'Theft', 72: 'Cruelty', 85: 'Vanity', 91: 'Hatred', 99: 'Ego',
        100: 'Moksha',
      },
    },
  ];

  const DEFAULTS = Object.freeze({ board: 'classic', exact: 'stay', sixAgain: true, tripleSix: true, speed: false, places: false });

  function boardById(id) {
    return BOARDS.find((b) => b.id === id) || BOARDS[0];
  }

  function mergeSettings(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const s = Object.assign({}, DEFAULTS);
    const legacy = { vedic: 'moksha', speed: 'classic', chaos: 'classic' };
    const b = r.board || r.variant;
    if (b && BOARDS.some((x) => x.id === b)) s.board = b;
    else if (legacy[b]) s.board = legacy[b];
    if (r.exact === 'bounce' || r.exact === 'stay') s.exact = r.exact;
    ['sixAgain', 'tripleSix', 'speed', 'places'].forEach((k) => {
      if (typeof r[k] === 'boolean') s[k] = r[k];
    });
    return s;
  }

  /**
   * Validate a layout: snakes go down, ladders go up, no square starts two jumps, no jump lands on
   * another jump (no chains / loops), square 100 is never a snake, and every ordinary square can be
   * reached with a die.
   */
  function validateBoard(b) {
    const errors = [];
    const starts = {};
    const jumps = {};
    const add = (map, kind) =>
      Object.keys(map || {}).forEach((k) => {
        const from = Number(k);
        const to = Number(map[k]);
        if (!(from >= 1 && from <= 99 && to >= 1 && to <= SQUARES)) errors.push(kind + ' ' + k + ' out of range');
        if (kind === 'snake' && !(to < from)) errors.push('snake ' + k + ' must go down');
        if (kind === 'ladder' && !(to > from)) errors.push('ladder ' + k + ' must go up');
        if (starts[from]) errors.push('square ' + from + ' starts two jumps');
        starts[from] = kind;
        jumps[from] = to;
      });
    add(b.snakes, 'snake');
    add(b.ladders, 'ladder');
    Object.keys(jumps).forEach((k) => {
      if (starts[jumps[k]]) errors.push('jump from ' + k + ' lands on another jump (' + jumps[k] + ')');
    });
    if (starts[SQUARES]) errors.push('square 100 cannot start a jump');
    const seen = new Set([0]);
    const queue = [0];
    const landed = new Set();
    while (queue.length) {
      const p = queue.shift();
      for (let d = 1; d <= 6; d++) {
        const t = p + d;
        if (t > SQUARES) continue;
        landed.add(t);
        const q = jumps[t] != null ? jumps[t] : t;
        if (!seen.has(q)) {
          seen.add(q);
          queue.push(q);
        }
      }
    }
    for (let sq = 1; sq <= SQUARES; sq++) {
      if (!starts[sq] && !landed.has(sq)) errors.push('square ' + sq + ' is unreachable');
    }
    if (!seen.has(SQUARES)) errors.push('100 is unreachable');
    return { ok: errors.length === 0, errors };
  }

  function newGame(players, settings) {
    const s = mergeSettings(settings);
    const list = (players || []).slice(0, MAX_PLAYERS);
    if (list.length < MIN_PLAYERS) return { error: 'need_players' };
    const seats = list.map((p, i) => ({
      id: String(p.id),
      name: String(p.name || (p.bot ? 'Bot' : 'Player')).slice(0, 32),
      token: TOKENS[i].id,
      bot: !!p.bot,
      pos: 0,
      done: false,
      place: 0,
      forfeit: false,
      afk: 0,
    }));
    return { game: 'snakes', v: 1, settings: s, board: s.board, seats, turn: 0, phase: 'roll', dice: 0, sixes: 0, seq: 0, log: [], rolls: seats.map(() => []), placements: [], over: false };
  }

  function hydrate(st) {
    if (!st) return st;
    const arr = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.keys(v).sort((a, b) => a - b).map((k) => v[k]) : []);
    st.seats = arr(st.seats);
    st.log = arr(st.log);
    st.rolls = arr(st.rolls).map(arr);
    while (st.rolls.length < st.seats.length) st.rolls.push([]);
    st.placements = arr(st.placements);
    if (st.ranking !== undefined) st.ranking = arr(st.ranking);
    st.log.forEach((e) => {
      if (e.type === 'over') e.ranking = arr(e.ranking);
    });
    st.settings = mergeSettings(st.settings);
    st.over = !!st.over;
    return st;
  }

  function pushLog(st, e) {
    st.seq += 1;
    e.seq = st.seq;
    st.log.push(e);
    if (st.log.length > LOG_MAX) st.log.splice(0, st.log.length - LOG_MAX);
  }

  function finalRanking(st) {
    const finished = st.placements.slice();
    const rest = st.seats
      .map((s, i) => i)
      .filter((i) => finished.indexOf(i) < 0)
      .sort((a, b) => st.seats[b].pos - st.seats[a].pos);
    const all = finished.concat(rest);
    return all.filter((i) => !st.seats[i].forfeit).concat(all.filter((i) => st.seats[i].forfeit));
  }

  function finish(st, reason) {
    st.over = true;
    st.phase = 'over';
    st.ranking = finalRanking(st);
    st.ranking.forEach((si, k) => (st.seats[si].place = k + 1));
    pushLog(st, { type: 'over', reason, ranking: st.ranking.slice() });
  }

  function checkOver(st) {
    if (!st.placements.length) {
      if (!st.seats.some((s) => !s.bot && !s.forfeit)) {
        finish(st, 'no_humans');
        return true;
      }
      return false;
    }
    if (!st.settings.places) {
      finish(st, 'first');
      return true;
    }
    const left = st.seats.filter((s) => !s.done);
    if (left.length <= 1 || !left.some((s) => !s.bot && !s.forfeit)) {
      finish(st, 'places');
      return true;
    }
    return false;
  }

  function nextTurn(st) {
    st.sixes = 0;
    st.dice = 0;
    st.phase = 'roll';
    const n = st.seats.length;
    for (let k = 1; k <= n; k++) {
      const i = (st.turn + k) % n;
      if (!st.seats[i].done) {
        st.turn = i;
        return;
      }
    }
  }

  /** Where a roll lands: { to (before jump), final, jump, overshoot }. */
  function landing(st, pos, value) {
    const b = boardById(st.board);
    let to = pos + value;
    let overshoot = null;
    if (to > SQUARES) {
      if (st.settings.exact === 'bounce') {
        to = SQUARES - (to - SQUARES);
        overshoot = 'bounce';
      } else return { to: pos, final: pos, jump: null, overshoot: 'stay' };
    }
    let jump = null;
    let final = to;
    if (b.snakes[to] != null) {
      jump = { kind: 'snake', from: to, to: b.snakes[to] };
      final = b.snakes[to];
    } else if (b.ladders[to] != null) {
      jump = { kind: 'ladder', from: to, to: b.ladders[to] };
      final = b.ladders[to];
    }
    return { to, final, jump, overshoot };
  }

  function roll(st, value) {
    if (st.over) return { error: 'over' };
    if (st.phase !== 'roll') return { error: 'not_roll_phase' };
    const v = Number(value);
    if (!(v >= 1 && v <= 6 && Math.floor(v) === v)) return { error: 'bad_die' };
    const from = st.seq;
    const si = st.turn;
    const seat = st.seats[si];
    st.rolls[si].push(v);
    st.dice = v;
    st.sixes = v === 6 ? st.sixes + 1 : 0;
    pushLog(st, { type: 'roll', seat: si, value: v });
    if (v === 6 && st.settings.tripleSix && st.sixes >= 3) {
      pushLog(st, { type: 'triple_six', seat: si });
      nextTurn(st);
      return { events: st.log.filter((e) => e.seq > from) };
    }
    const l = landing(st, seat.pos, v);
    const start = seat.pos;
    seat.pos = l.final;
    pushLog(st, { type: 'move', seat: si, from: start, to: l.to, final: l.final, jump: l.jump, overshoot: l.overshoot, value: v });
    if (seat.pos === SQUARES) {
      seat.done = true;
      st.placements.push(si);
      pushLog(st, { type: 'finished', seat: si, place: st.placements.length });
    }
    if (checkOver(st)) return { events: st.log.filter((e) => e.seq > from) };
    if (v === 6 && st.settings.sixAgain && !seat.done) {
      st.phase = 'roll';
      st.dice = 0;
      pushLog(st, { type: 'bonus', seat: si, why: 'six' });
    } else nextTurn(st);
    return { events: st.log.filter((e) => e.seq > from) };
  }

  function takeOver(st, seatIdx, reason) {
    const seat = st.seats[seatIdx];
    if (!seat || seat.forfeit) return false;
    seat.bot = true;
    seat.forfeit = true;
    pushLog(st, { type: 'takeover', seat: seatIdx, reason: reason || 'left' });
    if (!st.over) checkOver(st);
    return true;
  }

  /** [row, col] on a 10×10 board (row 0 = top) for square 1..100, boustrophedon from bottom-left. */
  function cellOf(sq) {
    if (sq < 1) return [10, -0.6];
    const i = sq - 1;
    const rowFromBottom = Math.floor(i / 10);
    const k = i % 10;
    const col = rowFromBottom % 2 === 0 ? k : 9 - k;
    return [9 - rowFromBottom, col];
  }

  return {
    SQUARES,
    MIN_PLAYERS,
    MAX_PLAYERS,
    TOKENS,
    BOARDS,
    DEFAULTS,
    boardById,
    mergeSettings,
    validateBoard,
    newGame,
    hydrate,
    landing,
    roll,
    takeOver,
    finalRanking,
    cellOf,
  };
});
