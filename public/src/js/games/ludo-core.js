/**
 * LudoCore — standard Ludo rules + declared house-rule toggles + bots. UMD: client practice,
 * party-room server adapter (server-lib/classics-rooms.js) and tests share this file.
 *
 * Token progress `p`: -1 base · 0..50 main track (relative to the owner's start square) ·
 * 51 = the square before the owner's start (only visited while "kill to enter" keeps a token
 * circling) · 52..56 home column · 57 home. Absolute track squares 0..51 start at Red's start.
 *
 * Dice values always come from the caller (server CSPRNG in Live, seeded RNG in practice):
 * the core never rolls and never weights anything.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LudoCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const COLORS = ['red', 'green', 'yellow', 'blue'];
  const COLOR_LABEL = { red: 'Red', green: 'Green', yellow: 'Yellow', blue: 'Blue' };
  /** Colour-blind-safe palette (Okabe–Ito) + a shape marker per colour. */
  const COLOR_HEX = { red: '#D55E00', green: '#009E73', yellow: '#F0E442', blue: '#0072B2' };
  const SHAPES = { red: 'circle', green: 'triangle', yellow: 'square', blue: 'diamond' };
  const START = { red: 0, green: 13, yellow: 26, blue: 39 };
  const STARS = [8, 21, 34, 47];
  const START_SQUARES = [0, 13, 26, 39];
  const TRACK = 52;
  const LAST_TRACK = 50;
  const COLUMN_FIRST = 52;
  const HOME = 57;
  const BASE = -1;
  const MIN_PLAYERS = 2;
  const MAX_PLAYERS = 4;
  const LOG_MAX = 40;
  const LEVELS = ['easy', 'normal', 'smart'];

  const DEFAULTS = Object.freeze({
    entry: 'six', // 'six' | 'oneOrSix'
    sixAgain: true,
    tripleSix: true,
    bonusHome: true,
    captureBonus: false,
    killToEnter: false,
    blocks: false,
    safeSquares: true,
    quick: false,
    teams: false,
    places: true,
  });
  const TOGGLES = ['bonusHome', 'captureBonus', 'killToEnter', 'blocks', 'safeSquares', 'quick', 'teams', 'places'];

  /** Placement payouts (share of the pot, humans only) — documented in the Rules sheet. */
  const PLACEMENT_SHARES = { 1: [1], 2: [1, 0], 3: [0.7, 0.3, 0], 4: [0.6, 0.3, 0.1, 0] };

  function mergeSettings(raw) {
    const s = Object.assign({}, DEFAULTS);
    const r = raw && typeof raw === 'object' ? raw : {};
    if (r.entry === 'oneOrSix' || r.entry === 'six') s.entry = r.entry;
    TOGGLES.forEach((k) => {
      if (typeof r[k] === 'boolean') s[k] = r[k];
    });
    if (r.mode === 'quick') s.quick = true;
    return s;
  }

  function colorsFor(n) {
    if (n <= 2) return ['red', 'yellow'];
    if (n === 3) return ['red', 'green', 'yellow'];
    return COLORS.slice();
  }

  /**
   * @param {{id:string,name?:string,bot?:boolean,level?:string}[]} players 2–4 seats, in turn order.
   */
  function newGame(players, settings) {
    const s = mergeSettings(settings);
    const list = (players || []).slice(0, MAX_PLAYERS);
    if (list.length < MIN_PLAYERS) return { error: 'need_players' };
    if (s.teams && list.length !== 4) return { error: 'teams_need_four' };
    const colors = colorsFor(list.length);
    const seats = list.map((p, i) => ({
      id: String(p.id),
      name: String(p.name || (p.bot ? 'Bot' : 'Player')).slice(0, 32),
      color: colors[i],
      bot: !!p.bot,
      level: LEVELS.indexOf(p.level) >= 0 ? p.level : 'normal',
      tokens: [0, 1, 2, 3].map(() => (s.quick ? 0 : BASE)),
      captures: 0,
      done: false,
      place: 0,
      forfeit: false,
      afk: 0,
      team: s.teams ? i % 2 : i,
    }));
    return {
      game: 'ludo',
      v: 1,
      settings: s,
      seats,
      turn: 0,
      phase: 'roll',
      dice: 0,
      sixes: 0,
      seq: 0,
      log: [],
      rolls: seats.map(() => []),
      placements: [],
      winnerTeam: null,
      over: false,
    };
  }

  function hydrate(st) {
    if (!st) return st;
    const arr = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.keys(v).sort((a, b) => a - b).map((k) => v[k]) : []);
    st.seats = arr(st.seats).map((x) => Object.assign(x, { tokens: arr(x.tokens).map(Number) }));
    st.log = arr(st.log).map((e) => {
      if (e.type === 'move') {
        e.path = arr(e.path);
        e.captures = arr(e.captures);
      }
      if (e.type === 'over') e.ranking = arr(e.ranking);
      return e;
    });
    if (st.ranking !== undefined) st.ranking = arr(st.ranking);
    if (st.winnerTeam === undefined) st.winnerTeam = null;
    st.rolls = arr(st.rolls).map(arr);
    while (st.rolls.length < st.seats.length) st.rolls.push([]);
    st.placements = arr(st.placements);
    st.settings = mergeSettings(st.settings);
    st.over = !!st.over;
    return st;
  }

  function absOf(color, p) {
    if (p < 0 || p > 51) return null;
    return (START[color] + p) % TRACK;
  }
  function isSafe(st, abs) {
    return !!st.settings.safeSquares && (STARS.indexOf(abs) >= 0 || START_SQUARES.indexOf(abs) >= 0);
  }
  function partners(st, a, b) {
    return a === b || (!!st.settings.teams && a % 2 === b % 2);
  }
  function canEnter(st, die) {
    return die === 6 || (st.settings.entry === 'oneOrSix' && die === 1);
  }
  /** Seat whose tokens the current player moves (a finished team-mate plays for their partner). */
  function moverSeat(st) {
    const t = st.turn;
    if (st.settings.teams && st.seats[t].done) {
      const p = (t + 2) % 4;
      if (!st.seats[p].done) return p;
    }
    return t;
  }
  function canEnterHome(st, seatIdx) {
    return !st.settings.killToEnter || st.seats[seatIdx].captures > 0;
  }

  /** Squares visited moving `d` from `p` (null = no legal path, e.g. overshooting home). */
  function advance(p, d, homeOk) {
    const path = [];
    let cur = p;
    for (let i = 0; i < d; i++) {
      if (cur >= 0 && cur <= 51) {
        if (cur === LAST_TRACK) cur = homeOk ? COLUMN_FIRST : 51;
        else if (cur === 51) cur = 0;
        else cur += 1;
      } else if (cur >= COLUMN_FIRST && cur < HOME) cur += 1;
      else return null;
      path.push(cur);
    }
    return path;
  }

  /** Tokens (other than `seatIdx`'s side) standing on absolute square `abs`. */
  function occupants(st, abs) {
    const out = [];
    st.seats.forEach((seat, si) => {
      seat.tokens.forEach((p, ti) => {
        if (absOf(seat.color, p) === abs) out.push({ seat: si, token: ti });
      });
    });
    return out;
  }
  function blockAt(st, abs, seatIdx) {
    if (!st.settings.blocks) return false;
    const counts = {};
    occupants(st, abs).forEach((o) => {
      if (!partners(st, o.seat, seatIdx)) counts[o.seat] = (counts[o.seat] || 0) + 1;
    });
    return Object.keys(counts).some((k) => counts[k] >= 2);
  }

  function legalMoves(st) {
    if (st.over || st.phase !== 'move') return [];
    const si = moverSeat(st);
    const seat = st.seats[si];
    const die = st.dice;
    const homeOk = canEnterHome(st, si);
    const out = [];
    seat.tokens.forEach((p, ti) => {
      let path;
      if (p === BASE) {
        if (!canEnter(st, die)) return;
        path = [0];
      } else if (p === HOME) return;
      else path = advance(p, die, homeOk);
      if (!path) return;
      for (const q of path) {
        const a = absOf(seat.color, q);
        if (a != null && blockAt(st, a, si)) return;
      }
      const to = path[path.length - 1];
      const a = absOf(seat.color, to);
      const captures = a != null && !isSafe(st, a) ? occupants(st, a).filter((o) => !partners(st, o.seat, si)) : [];
      out.push({ token: ti, seat: si, from: p, to, path, captures, home: to === HOME });
    });
    return out;
  }

  function progress(p) {
    return p < 0 ? 0 : p + 1;
  }
  function seatProgress(seat) {
    return seat.tokens.reduce((s, p) => s + progress(p), 0);
  }

  function pushLog(st, e) {
    st.seq += 1;
    e.seq = st.seq;
    st.log.push(e);
    if (st.log.length > LOG_MAX) st.log.splice(0, st.log.length - LOG_MAX);
    return e;
  }

  function activeUnfinished(st) {
    return st.seats.map((s, i) => i).filter((i) => !st.seats[i].done);
  }

  /** Final ranking: finish order, then unfinished by progress; seats that forfeited go last. */
  function finalRanking(st) {
    const finished = st.placements.slice();
    const rest = st.seats
      .map((s, i) => i)
      .filter((i) => finished.indexOf(i) < 0)
      .sort((a, b) => seatProgress(st.seats[b]) - seatProgress(st.seats[a]));
    const all = finished.concat(rest);
    return all.filter((i) => !st.seats[i].forfeit).concat(all.filter((i) => st.seats[i].forfeit));
  }

  function finish(st, reason) {
    st.over = true;
    st.phase = 'over';
    st.dice = 0;
    st.ranking = finalRanking(st);
    if (st.settings.teams) {
      if (st.winnerTeam == null) st.winnerTeam = st.seats[st.ranking[0]].team;
      const wt = st.winnerTeam;
      st.ranking = st.ranking.filter((si) => st.seats[si].team === wt).concat(st.ranking.filter((si) => st.seats[si].team !== wt));
    }
    st.ranking.forEach((si, k) => (st.seats[si].place = k + 1));
    pushLog(st, { type: 'over', reason, ranking: st.ranking.slice(), winnerTeam: st.winnerTeam });
  }

  function checkOver(st) {
    const s = st.settings;
    if (s.teams) {
      for (const team of [0, 1]) {
        const ids = [team, team + 2];
        if (ids.every((i) => st.seats[i].done)) {
          ids.forEach((i) => st.placements.indexOf(i) < 0 && st.placements.push(i));
          st.winnerTeam = team;
          finish(st, 'team');
          return true;
        }
      }
      return false;
    }
    if (s.quick && st.placements.length) {
      finish(st, 'quick');
      return true;
    }
    if (!s.places && st.placements.length) {
      finish(st, 'first');
      return true;
    }
    const left = activeUnfinished(st);
    const humansLeft = left.filter((i) => !st.seats[i].bot && !st.seats[i].forfeit);
    if (left.length <= 1 || !humansLeft.length) {
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
      const seat = st.seats[i];
      if (!seat.done) {
        st.turn = i;
        return;
      }
      if (st.settings.teams && !st.seats[(i + 2) % 4].done) {
        st.turn = i;
        return;
      }
    }
  }

  /** Apply a die value for the current seat. Returns { events } or { error }. */
  function roll(st, value) {
    if (st.over) return { error: 'over' };
    if (st.phase !== 'roll') return { error: 'not_roll_phase' };
    const v = Number(value);
    if (!(v >= 1 && v <= 6 && Math.floor(v) === v)) return { error: 'bad_die' };
    const from = st.seq;
    const seatIdx = st.turn;
    st.rolls[seatIdx].push(v);
    st.dice = v;
    st.sixes = v === 6 ? st.sixes + 1 : 0;
    pushLog(st, { type: 'roll', seat: seatIdx, value: v });
    if (v === 6 && st.settings.tripleSix && st.sixes >= 3) {
      pushLog(st, { type: 'triple_six', seat: seatIdx });
      nextTurn(st);
      return { events: st.log.filter((e) => e.seq > from) };
    }
    st.phase = 'move';
    if (!legalMoves(st).length) {
      pushLog(st, { type: 'no_move', seat: seatIdx });
      if (v === 6 && st.settings.sixAgain) {
        st.phase = 'roll';
        st.dice = 0;
      } else nextTurn(st);
    }
    return { events: st.log.filter((e) => e.seq > from) };
  }

  function move(st, tokenIdx) {
    if (st.over) return { error: 'over' };
    if (st.phase !== 'move') return { error: 'not_move_phase' };
    const t = Number(tokenIdx);
    const mv = legalMoves(st).find((m) => m.token === t);
    if (!mv) return { error: 'illegal_move' };
    const from = st.seq;
    const s = st.settings;
    const seat = st.seats[mv.seat];
    seat.tokens[t] = mv.to;
    mv.captures.forEach((c) => {
      st.seats[c.seat].tokens[c.token] = BASE;
    });
    if (mv.captures.length) seat.captures += mv.captures.length;
    pushLog(st, { type: 'move', seat: mv.seat, by: st.turn, token: t, from: mv.from, to: mv.to, path: mv.path, captures: mv.captures });
    if (mv.to === HOME && seat.tokens.every((p) => p === HOME)) {
      seat.done = true;
      st.placements.push(mv.seat);
      pushLog(st, { type: 'finished', seat: mv.seat, place: st.placements.length });
    } else if (mv.to === HOME && s.quick) {
      seat.done = true;
      st.placements.push(mv.seat);
      pushLog(st, { type: 'finished', seat: mv.seat, place: 1 });
    }
    if (checkOver(st)) return { events: st.log.filter((e) => e.seq > from) };
    const bonus = (st.dice === 6 && s.sixAgain) || (mv.captures.length > 0 && s.captureBonus) || (mv.to === HOME && s.bonusHome);
    const moverStillPlays = !st.seats[st.turn].done || (s.teams && !st.seats[(st.turn + 2) % 4].done);
    if (bonus && moverStillPlays) {
      const why = st.dice === 6 && s.sixAgain ? 'six' : mv.captures.length && s.captureBonus ? 'capture' : 'home';
      st.phase = 'roll';
      st.dice = 0;
      pushLog(st, { type: 'bonus', seat: st.turn, why });
    } else nextTurn(st);
    return { events: st.log.filter((e) => e.seq > from) };
  }

  /** Seat leaves / goes AFK too often: a bot plays it so the others can finish; it places last. */
  function takeOver(st, seatIdx, reason) {
    const seat = st.seats[seatIdx];
    if (!seat || seat.forfeit) return false;
    seat.bot = true;
    seat.forfeit = true;
    seat.forfeitWhy = reason || 'left';
    seat.forfeitAt = st.forfeitCount = (Number(st.forfeitCount) || 0) + 1;
    seat.level = 'normal';
    pushLog(st, { type: 'takeover', seat: seatIdx, reason: reason || 'left' });
    if (!st.over) checkOver(st);
    return true;
  }

  // ---------------- bots ----------------

  /** How many rival tokens could hit absolute square `abs` with one roll. */
  function threatAt(st, abs, seatIdx) {
    if (abs == null || isSafe(st, abs)) return 0;
    let n = 0;
    st.seats.forEach((seat, si) => {
      if (partners(st, si, seatIdx) || seat.done) return;
      seat.tokens.forEach((p) => {
        const a = absOf(seat.color, p);
        if (a == null || p > LAST_TRACK) return;
        const dist = (abs - a + TRACK) % TRACK;
        if (dist >= 1 && dist <= 6 && p + dist <= LAST_TRACK) n++;
      });
      if (abs === START[seat.color] && seat.tokens.some((p) => p === BASE)) n++;
    });
    return n;
  }

  function scoreMove(st, m, level) {
    const seat = st.seats[m.seat];
    const color = seat.color;
    let score = 0;
    if (m.captures.length) {
      score += 60;
      m.captures.forEach((c) => (score += progress(st.seats[c.seat].tokens[c.token])));
    }
    if (m.home) score += 55;
    else if (m.to >= COLUMN_FIRST && m.from < COLUMN_FIRST) score += 28;
    if (m.from === BASE) score += 32;
    const toAbs = absOf(color, m.to);
    const fromAbs = absOf(color, m.from);
    if (level === 'smart') {
      if (toAbs != null && isSafe(st, toAbs)) score += 14;
      score -= 16 * threatAt(st, toAbs, m.seat);
      score += 12 * threatAt(st, fromAbs, m.seat);
      if (st.settings.blocks && toAbs != null && seat.tokens.some((p, i) => i !== m.token && absOf(color, p) === toAbs)) score += 10;
      if (m.from >= 40 && m.from <= LAST_TRACK) score += 6;
      score += m.to * 0.25;
    } else {
      score += m.to * 0.1;
    }
    return score;
  }

  /** Pick a token for the current seat. level: easy (random) · normal (greedy) · smart (weighs danger). */
  function botChoose(st, level, rng) {
    const r = typeof rng === 'function' ? rng : Math.random;
    const moves = legalMoves(st);
    if (!moves.length) return null;
    if (level === 'easy' || moves.length === 1) return moves[Math.floor(r() * moves.length)].token;
    let best = -Infinity;
    let pick = [];
    moves.forEach((m) => {
      const sc = scoreMove(st, m, level);
      if (sc > best + 1e-9) {
        best = sc;
        pick = [m];
      } else if (Math.abs(sc - best) <= 1e-9) pick.push(m);
    });
    return pick[Math.floor(r() * pick.length)].token;
  }

  /** AFK auto-move: the most advanced token that can legally move. */
  function autoMoveToken(st) {
    const moves = legalMoves(st);
    if (!moves.length) return null;
    return moves.reduce((a, b) => (progress(b.from) > progress(a.from) ? b : a)).token;
  }

  function placementDeltas(n, stake) {
    const shares = PLACEMENT_SHARES[n] || PLACEMENT_SHARES[4];
    const pot = n * stake;
    return shares.map((sh) => Math.round(pot * sh) - stake);
  }

  // ---------------- board geometry (15×15 grid, shared by the UI) ----------------

  const TRACK_CELLS = (function () {
    const c = [];
    const push = (r0, c0, r1, c1) => {
      const dr = Math.sign(r1 - r0), dc = Math.sign(c1 - c0);
      let r = r0, k = c0;
      for (;;) {
        c.push([r, k]);
        if (r === r1 && k === c1) break;
        r += dr;
        k += dc;
      }
    };
    push(6, 1, 6, 5);
    push(5, 6, 0, 6);
    push(0, 7, 0, 7);
    push(0, 8, 5, 8);
    push(6, 9, 6, 14);
    push(7, 14, 7, 14);
    push(8, 14, 8, 9);
    push(9, 8, 14, 8);
    push(14, 7, 14, 7);
    push(14, 6, 9, 6);
    push(8, 5, 8, 0);
    push(7, 0, 7, 0);
    push(6, 0, 6, 0);
    return c;
  })();
  const COLUMN_CELLS = {
    red: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
    green: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
    yellow: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
    blue: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
  };
  const HOME_CELLS = { red: [7, 6.2], green: [6.2, 7], yellow: [7, 7.8], blue: [7.8, 7] };
  const BASE_ORIGIN = { red: [0, 0], green: [0, 9], yellow: [9, 9], blue: [9, 0] };
  const BASE_SLOTS = [[1.5, 1.5], [1.5, 3.5], [3.5, 1.5], [3.5, 3.5]];

  /** [row, col] (cell units, may be fractional) for a token of `color` at progress `p`. */
  function cellOf(color, p, tokenIdx) {
    if (p === BASE) {
      const o = BASE_ORIGIN[color];
      const s = BASE_SLOTS[tokenIdx || 0];
      return [o[0] + s[0] - 0.5, o[1] + s[1] - 0.5];
    }
    if (p === HOME) return HOME_CELLS[color];
    if (p >= COLUMN_FIRST) return COLUMN_CELLS[color][p - COLUMN_FIRST];
    return TRACK_CELLS[absOf(color, p)];
  }

  return {
    COLORS,
    COLOR_LABEL,
    COLOR_HEX,
    SHAPES,
    START,
    STARS,
    START_SQUARES,
    TRACK,
    HOME,
    BASE,
    COLUMN_FIRST,
    MIN_PLAYERS,
    MAX_PLAYERS,
    LEVELS,
    DEFAULTS,
    TOGGLES,
    PLACEMENT_SHARES,
    TRACK_CELLS,
    COLUMN_CELLS,
    BASE_ORIGIN,
    mergeSettings,
    colorsFor,
    newGame,
    hydrate,
    absOf,
    isSafe,
    advance,
    legalMoves,
    roll,
    move,
    takeOver,
    moverSeat,
    botChoose,
    autoMoveToken,
    threatAt,
    seatProgress,
    finalRanking,
    placementDeltas,
    cellOf,
  };
});
