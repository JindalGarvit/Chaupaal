/**
 * Badminton laws engine — pure, shared by the phone, the server (server-lib/badminton-engine.js)
 * and the tests. The plain rule-source line lives in design-system RULE_SOURCES (no logo, never
 * "official").
 *
 * replay(config, log) → state. The log is the only truth; score, server, receiver, service courts,
 * ends, intervals, umpire calls and stats are all derived from it.
 *
 * Log events:
 *   { t: 'start', server: { side, player }, receiver: player }  — who serves / receives first in a
 *                                                                  game (only at 0–0 of a game)
 *   { t: 'rally', w: side, code, by: side, hits }              — w won the rally; `by` hit the
 *                                                                  winner or made the fault
 *   { t: 'let', code }                                          — replay the rally, same server
 *   { t: 'end', reason: 'forfeit' | 'retired', winner: side }
 *
 * Laws implemented (see LAWS for the table the app shows):
 *   Law 7  scoring — rally point; 21 with a 2-point lead; 20-all → 2 clear; 29-all → 30th point;
 *          best of 3; the game winner serves first in the next game.
 *   Law 8  change of ends — after each game; in the deciding game when the leading score reaches 11.
 *   Law 10 singles — serve from the right service court on an even server's score, left on odd;
 *          diagonal; the rally winner scores and serves next.
 *   Law 11 doubles — one service per side; the serving side wins → same server, other court; the
 *          receiving side wins → they serve, from the court matching their score; players swap
 *          service courts only when they win a point on their own serve; receiver is diagonal.
 *   Law 12 service court errors — corrected, the score stands (checkService).
 *   Law 13 faults / Law 14 lets — FAULTS / LETS codes.
 *   Law 16 intervals — when the leading score reaches 11 in a game, and between games.
 *
 * The second half of the file is the gameplay layer (PLAY): how a timed tap becomes a landing
 * spot and which faults it risks. Laws never depend on it; the server uses it with its own seed.
 */
/** Game text: the catalog (t) in the browser; the English given here where there is no catalog (server rooms, Node). */
function gtx(key, en, params) {
  const g = typeof globalThis !== 'undefined' ? globalThis : {};
  if (typeof g.t === 'function') {
    const v = g.t(key, params || {});
    if (v && v !== key) return v;
  }
  const val = (k) => {
    const v = params && params[k];
    return v == null ? null : typeof v === 'object' && v.text != null ? v.text : String(v);
  };
  // English ICU {n, plural|selectordinal, one {…} other {…}} for the no-catalog path.
  const s = String(en).replace(/\{(\w+), (plural|selectordinal), ((?:=?\w+ \{(?:[^{}]|\{\{\w+\}\})*\}\s*)+)\}/g, (m, k, type, body) => {
    const n = Number(val(k));
    const cases = {};
    body.replace(/(=?\w+) \{((?:[^{}]|\{\{\w+\}\})*)\}/g, (x, c, txt) => (cases[c] = txt));
    let cat = 'other';
    try {
      cat = new Intl.PluralRules('en', { type: type === 'plural' ? 'cardinal' : 'ordinal' }).select(n);
    } catch (e) {}
    const txt = cases['=' + n] != null ? cases['=' + n] : cases[cat] != null ? cases[cat] : cases.other || '';
    return txt.replace(/#/g, String(n));
  });
  return s.replace(/\{\{(\w+)\}\}/g, (m, k) => (val(k) == null ? m : val(k)));
}

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BadmintonEngine = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- formats

  /**
   * games: best of N · points: game target · cap: the point that always wins · interval: the leading
   * score that triggers the mid-game interval (and the end change in the deciding game).
   */
  const FORMATS = {
    standard: { id: 'standard', label: gtx('games.badminton.standard', 'Standard'), blurb: gtx('games.badminton.best_of_3_games_to_21', 'Best of 3 games to 21'), games: 3, points: 21, cap: 30, interval: 11, rated: true },
    single: { id: 'single', label: gtx('games.badminton.single_game', 'Single game'), blurb: gtx('games.badminton.one_game_to_21', 'One game to 21'), games: 1, points: 21, cap: 30, interval: 11, rated: false },
    quick11: { id: 'quick11', label: gtx('games.badminton.quick_11', 'Quick 11'), blurb: gtx('games.badminton.best_of_3_to_11_a', 'Best of 3 to 11 (a Chaupaal quick format)'), games: 3, points: 11, cap: 15, interval: 6, rated: false, chaupaal: true },
  };
  const FORMAT_ORDER = ['standard', 'single', 'quick11'];
  const DISCIPLINES = ['singles', 'doubles'];

  function normFormat(f) {
    return FORMATS[f] ? f : 'standard';
  }
  function normDiscipline(d) {
    return d === 'doubles' ? 'doubles' : 'singles';
  }

  // ---------------------------------------------------------------- court (Law 1)

  /**
   * Metres. A landing spot is { x, y } in the receiving side's own frame: y = distance from the net
   * into their half (≤ 0 = didn't cross), x = distance from the centre line, positive to their right.
   */
  const COURT = {
    half: 6.7,
    doublesWidth: 6.1,
    singlesWidth: 5.18,
    shortService: 1.98,
    /** Doubles long service line: 0.76 m inside the back boundary. Singles serves to the back line. */
    doublesLongService: 5.94,
    serviceHeight: 1.15,
    netHeight: 1.524,
  };

  function widthOf(discipline) {
    return discipline === 'doubles' ? COURT.doublesWidth : COURT.singlesWidth;
  }

  /**
   * '' when the spot is in; otherwise why it's out. Lines are in.
   * Serve: into the diagonal service court (right court = x ≥ 0 in the receiver's frame), past the
   * short service line and inside the long service line (singles: back line · doubles: 5.94 m) and
   * the sideline (singles: narrow · doubles: wide).
   */
  function landingFault(land, o) {
    const opt = o || {};
    const half = widthOf(opt.discipline) / 2;
    const x = Number(land && land.x) || 0;
    const y = Number(land && land.y) || 0;
    if (y <= 0) return opt.serve ? 'serve_net' : 'net';
    if (opt.serve) {
      if (y < COURT.shortService) return 'serve_short';
      if (y > (opt.discipline === 'doubles' ? COURT.doublesLongService : COURT.half)) return 'serve_long';
      if (Math.abs(x) > half) return 'serve_wide';
      if ((opt.court === 'L' && x > 0) || (opt.court !== 'L' && x < 0)) return 'serve_wide';
      return '';
    }
    if (y > COURT.half) return 'out';
    if (Math.abs(x) > half) return 'out';
    return '';
  }

  // ---------------------------------------------------------------- codes (Laws 13 + 14)

  /** Rally-ending codes. kind: 'winner' (the hitter's side wins) or 'fault' (the hitter's side loses). */
  const CODES = {
    winner: { kind: 'winner', label: gtx('games.badminton.winner', 'Winner'), law: gtx('games.badminton.law_13_3_lands_in_court', 'Law 13.3 — lands in court'), say: gtx('games.badminton.lands_in', 'lands in') },
    out: { kind: 'fault', label: gtx('games.badminton.out', 'Out'), law: gtx('games.badminton.law_13_3_lands_outside_the', 'Law 13.3 — lands outside the boundary lines'), say: 'out' },
    net: { kind: 'fault', label: gtx('games.badminton.into_the_net', 'Into the net'), law: gtx('games.badminton.law_13_3_fails_to_pass', 'Law 13.3 — fails to pass over the net'), say: gtx('games.badminton.into_the_net_2', 'into the net') },
    net_touch: { kind: 'fault', label: gtx('games.badminton.touched_the_net', 'Touched the net'), law: gtx('games.badminton.law_13_4_racket_or_body', 'Law 13.4 — racket or body touches the net or posts'), say: gtx('games.badminton.touched_the_net_2', 'touched the net') },
    double_hit: { kind: 'fault', label: gtx('games.badminton.double_hit', 'Double hit'), law: gtx('games.badminton.law_13_3_hit_twice_or', 'Law 13.3 — hit twice, or by partners in succession'), say: gtx('games.badminton.double_hit_2', 'double hit') },
    obstruction: { kind: 'fault', label: gtx('games.badminton.obstruction', 'Obstruction'), law: gtx('games.badminton.law_13_4_obstructs_an_opponent', 'Law 13.4 — obstructs an opponent'), say: 'obstruction' },
    serve_height: { kind: 'fault', label: gtx('games.badminton.service_fault_above_1_15_m', 'Service fault — above 1.15 m'), law: gtx('games.badminton.law_9_1_whole_shuttle_below', 'Law 9.1 — whole shuttle below 1.15 m at impact'), say: gtx('games.badminton.service_fault', 'service fault') },
    serve_feet: { kind: 'fault', label: gtx('games.badminton.service_fault_feet_moved', 'Service fault — feet moved'), law: gtx('games.badminton.law_9_1_feet_stationary_until', 'Law 9.1 — feet stationary until the serve is delivered'), say: gtx('games.badminton.service_fault', 'service fault') },
    serve_net: { kind: 'fault', label: gtx('games.badminton.serve_into_the_net', 'Serve into the net'), law: gtx('games.badminton.law_13_2_the_serve_fails', 'Law 13.2 — the serve fails to pass the net or is caught in it'), say: gtx('games.badminton.serve_into_the_net_2', 'serve into the net') },
    serve_short: { kind: 'fault', label: gtx('games.badminton.serve_short', 'Serve short'), law: gtx('games.badminton.law_9_1_must_pass_the', 'Law 9.1 — must pass the short service line'), say: 'short' },
    serve_long: { kind: 'fault', label: gtx('games.badminton.serve_long', 'Serve long'), law: gtx('games.badminton.law_10_11_beyond_the_long', 'Law 10 / 11 — beyond the long service line'), say: 'long' },
    serve_wide: { kind: 'fault', label: gtx('games.badminton.serve_wide', 'Serve wide'), law: gtx('games.badminton.law_9_1_into_the_diagonal', 'Law 9.1 — into the diagonal service court'), say: 'wide' },
  };
  const LETS = {
    not_ready: { label: gtx('games.badminton.let_receiver_not_ready', 'Let — receiver not ready'), law: gtx('games.badminton.law_14_2_server_served_before', 'Law 14.2 — server served before the receiver was ready') },
    caught_net: { label: gtx('games.badminton.let_caught_in_the_net', 'Let — caught in the net'), law: gtx('games.badminton.law_14_2_caught_in_the', 'Law 14.2 — caught in the net after passing over (not on the serve)') },
    both_fault: { label: gtx('games.badminton.let_both_faulted', 'Let — both faulted'), law: gtx('games.badminton.law_14_2_server_and_receiver', 'Law 14.2 — server and receiver faulted at the same time') },
    disintegrated: { label: gtx('games.badminton.let_shuttle_broke', 'Let — shuttle broke'), law: gtx('games.badminton.law_14_2_the_shuttle_came', 'Law 14.2 — the shuttle came apart') },
    disturbed: { label: gtx('games.badminton.let', 'Let'), law: gtx('games.badminton.law_14_2_an_unforeseen_or', 'Law 14.2 — an unforeseen or accidental occurrence') },
  };
  const isFault = (code) => !!(CODES[code] && CODES[code].kind === 'fault');

  /** The table the Rules sheet shows (and the tests read). */
  const LAWS = [
    { law: gtx('games.badminton.law_n', 'Law {{n}}', { n: 7 }), h: gtx('games.badminton.law_h.scoring', 'Scoring'), body: gtx('games.badminton.rally_point_scoring_a_game_is', 'Rally point scoring. A game is won at 21 with a 2-point lead; from 20-all the first side 2 points clear wins; at 29-all the 30th point wins. Best of 3 games; the game winner serves first in the next game.') },
    { law: gtx('games.badminton.law_n', 'Law {{n}}', { n: 8 }), h: gtx('games.badminton.law_h.ends', 'Ends'), body: gtx('games.badminton.change_ends_after_each_game_and', 'Change ends after each game, and in the deciding game when the leading score reaches 11.') },
    { law: gtx('games.badminton.law_n', 'Law {{n}}', { n: 16 }), h: gtx('games.badminton.law_h.intervals', 'Intervals'), body: gtx('games.badminton.a_short_interval_when_the_leading', 'A short interval when the leading score reaches 11 in a game; a longer one between games.') },
    { law: gtx('games.badminton.law_n', 'Law {{n}}', { n: 10 }), h: gtx('games.badminton.singles_serve', 'Singles serve'), body: gtx('games.badminton.serve_from_the_right_service_court', 'Serve from the right service court on an even score, the left on an odd score, diagonally. The rally winner scores and serves next. The singles court is long and narrow; the serve may reach the back line.') },
    { law: gtx('games.badminton.law_n', 'Law {{n}}', { n: 11 }), h: gtx('games.badminton.doubles_serve', 'Doubles serve'), body: gtx('games.badminton.one_service_per_side_serving_side', 'One service per side. Serving side wins → the same server serves again from the other court. Receiving side wins → they score and serve, from the court matching their score. Players change service courts only when they win a point on their own serve. The doubles court is wide; the serve must land short of the long service line.') },
    { law: gtx('games.badminton.law_n', 'Law {{n}}', { n: 12 }), h: gtx('games.badminton.service_court_errors', 'Service court errors'), body: gtx('games.badminton.a_wrong_server_court_or_receiver', 'A wrong server, court or receiver is corrected and the score stands.') },
    { law: gtx('games.badminton.law_n', 'Law {{n}}', { n: 13 }), h: gtx('games.badminton.law_h.faults', 'Faults'), body: gtx('games.badminton.out_into_the_net_touching_the', 'Out, into the net, touching the net, hitting twice (or partners in succession), obstruction, and service faults (above 1.15 m, feet moving, short, long, wide).') },
    { law: gtx('games.badminton.law_n', 'Law {{n}}', { n: 14 }), h: gtx('games.badminton.law_h.lets', 'Lets'), body: gtx('games.badminton.receiver_not_ready_caught_in_the', 'Receiver not ready, caught in the net after passing over, both faulted at once, a broken shuttle or an unforeseen event — the rally is replayed by the same server.') },
  ];

  // ---------------------------------------------------------------- config

  /**
   * @param {{ discipline?: string, format?: string, sides?: { name?: string, players?: string[] }[] }} o
   */
  function createConfig(o) {
    const c = o || {};
    const discipline = normDiscipline(c.discipline);
    const n = discipline === 'doubles' ? 2 : 1;
    const sides = [0, 1].map((i) => {
      const s = (c.sides && c.sides[i]) || {};
      const players = [];
      for (let k = 0; k < n; k++) players.push(String((s.players && s.players[k]) || (i === 0 ? 'A' : 'B') + (n > 1 ? k + 1 : '')));
      return { name: String(s.name || players.join(' & ')), players };
    });
    return { discipline, format: normFormat(c.format), sides, perSide: n };
  }

  // ---------------------------------------------------------------- state

  function blankStats() {
    return {
      rallies: 0,
      longest: 0,
      hits: 0,
      lets: 0,
      serveWon: [0, 0],
      serveTot: [0, 0],
      recvWon: [0, 0],
      recvTot: [0, 0],
      winners: [0, 0],
      errors: [0, 0],
      codes: {},
      streak: { side: -1, n: 0 },
      bestStreak: [0, 0],
      points: [0, 0],
    };
  }

  function newGame(state, server, receiverPlayer) {
    const cfg = state.config;
    const srvSide = server.side;
    const rcvSide = 1 - srvSide;
    const pos = [[0], [0]];
    if (cfg.perSide === 2) {
      // Even (0–0): the first server stands in the right court; the first receiver is diagonal — also right.
      pos[srvSide] = [server.player, 1 - server.player];
      pos[rcvSide] = [receiverPlayer, 1 - receiverPlayer];
    }
    state.games.push({ score: [0, 0], winner: -1, rallies: 0, firstServer: { side: srvSide, player: server.player }, firstReceiver: { side: rcvSide, player: cfg.perSide === 2 ? receiverPlayer : 0 } });
    state.g = state.games.length - 1;
    state.score = [0, 0];
    state.server = { side: srvSide, player: server.player };
    state.pos = pos;
    state.intervalTaken = false;
    state.endsChangedInGame = false;
    placeService(state);
  }

  /** Service court + receiver from the serving side's score (Laws 10.1 / 11.1). */
  function placeService(state) {
    const cfg = state.config;
    const srv = state.server.side;
    const rcv = 1 - srv;
    const court = state.score[srv] % 2 === 0 ? 'R' : 'L';
    state.court = court;
    if (cfg.perSide === 2) {
      const idx = court === 'R' ? 0 : 1;
      state.server.player = state.pos[srv][idx];
      state.receiver = { side: rcv, player: state.pos[rcv][idx] };
    } else {
      state.receiver = { side: rcv, player: 0 };
    }
  }

  function initState(config) {
    const cfg = config && config.sides ? config : createConfig(config);
    const state = {
      config: cfg,
      format: FORMATS[cfg.format],
      log: [],
      games: [],
      g: 0,
      score: [0, 0],
      server: { side: 0, player: 0 },
      receiver: { side: 1, player: 0 },
      court: 'R',
      pos: [[0], [0]],
      swapped: false,
      intervalTaken: false,
      endsChangedInGame: false,
      pause: null,
      changeEnds: false,
      calls: [],
      last: null,
      stats: blankStats(),
      result: null,
      over: false,
      started: false,
    };
    return state;
  }

  function gamesWon(state) {
    const w = [0, 0];
    state.games.forEach((g) => {
      if (g.winner >= 0) w[g.winner] += 1;
    });
    return w;
  }
  function isDecider(state) {
    return state.g === state.format.games - 1;
  }
  /** Does side i win the game with the next point? */
  function gamePointFor(state, i) {
    const f = state.format;
    const s = state.score.slice();
    s[i] += 1;
    return (s[i] >= f.points && s[i] - s[1 - i] >= 2) || s[i] >= f.cap;
  }
  function gameWonBy(state) {
    const f = state.format;
    const s = state.score;
    for (let i = 0; i < 2; i++) {
      if ((s[i] >= f.points && s[i] - s[1 - i] >= 2) || s[i] >= f.cap) return i;
    }
    return -1;
  }
  function needGames(state) {
    return Math.floor(state.format.games / 2) + 1;
  }

  // ---------------------------------------------------------------- umpire calls

  const ORDINAL = /* i18n-copy */ [gtx('games.badminton.first', 'First'), gtx('games.badminton.second', 'Second'), gtx('games.badminton.final', 'Final')];
  function n2w(n) {
    return n === 0 ? 'love' : String(n);
  }
  function scoreCall(state) {
    const a = state.score[state.server.side];
    const b = state.score[1 - state.server.side];
    return a === b ? n2w(a) + ' all' : n2w(a) + '–' + n2w(b);
  }
  function pointCall(state) {
    const srv = state.server.side;
    if (!gamePointFor(state, srv)) return '';
    const wonGames = gamesWon(state)[srv];
    return wonGames + 1 >= needGames(state) ? gtx('games.badminton.match_point', 'match point') : gtx('games.badminton.game_point', 'game point');
  }
  function scoreWithPoint(state) {
    const pc = pointCall(state);
    if (!pc) return scoreCall(state);
    const a = state.score[state.server.side];
    const b = state.score[1 - state.server.side];
    return n2w(a) + ' ' + pc + ' ' + n2w(b);
  }
  function gameStartCall(state) {
    if (state.format.games === 1 || state.g === 0) return gtx('games.badminton.love_all_play', 'Love all, play');
    const label = isDecider(state) ? ORDINAL[2] : ORDINAL[Math.min(1, state.g)];
    return gtx('games.badminton.label_game_love_all_play', '{{label}} game, love all, play', { label });
  }
  function gameLine(g) {
    return g.score[0] + '–' + g.score[1];
  }

  // ---------------------------------------------------------------- reducer

  function startIfNeeded(state, ev) {
    if (state.started) return;
    state.started = true;
    const srv = ev && ev.t === 'start' && ev.server ? ev.server : { side: 0, player: 0 };
    const side = srv.side === 1 ? 1 : 0;
    const player = state.config.perSide === 2 && srv.player === 1 ? 1 : 0;
    const rp = state.config.perSide === 2 && ev && ev.t === 'start' && ev.receiver === 1 ? 1 : 0;
    newGame(state, { side, player }, rp);
    state.calls = [{ k: 'start', text: gameStartCall(state) }];
  }

  function bump(obj, k) {
    obj[k] = (obj[k] || 0) + 1;
  }

  /** Apply one event in place. Returns state. Unknown / late events are ignored (never throw on replay). */
  function applyEvent(state, ev) {
    if (!ev || typeof ev !== 'object') return state;
    state.log.push(ev);
    state.pause = null;
    state.changeEnds = false;
    state.calls = [];
    state.last = ev;
    if (state.over) return state;

    if (ev.t === 'start') {
      const g = state.games[state.g];
      if (!state.started) startIfNeeded(state, ev);
      else if (g && g.rallies === 0 && state.score[0] === 0 && state.score[1] === 0) {
        // Re-pick server / receiver for this game (Law 11.4: any player of the winning side may serve).
        const side = g.firstServer.side;
        const player = state.config.perSide === 2 && ev.server && ev.server.player === 1 ? 1 : 0;
        const rp = state.config.perSide === 2 && ev.receiver === 1 ? 1 : 0;
        state.games.pop();
        newGame(state, { side, player }, rp);
        state.calls = [{ k: 'start', text: gameStartCall(state) }];
      }
      return state;
    }
    startIfNeeded(state, null);

    if (ev.t === 'end') {
      const w = ev.winner === 1 ? 1 : 0;
      state.over = true;
      state.result = { winner: w, games: state.games.map((g) => g.score.slice()), by: ev.reason === 'retired' ? 'retired' : 'forfeit', text: '' };
      state.result.text = gtx(ev.reason === 'retired' ? 'games.badminton.result_opp_retired' : 'games.badminton.result_opp_left', state.config.sides[w].name + ' win' + (state.config.perSide === 2 ? '' : 's') + ' — ' + (ev.reason === 'retired' ? 'opponent retired' : 'opponent left'), { name: state.config.sides[w].name, count: state.config.perSide === 2 ? 2 : 1 });
      state.calls = [{ k: 'match', text: gtx('games.badminton.match_won_by_name_value', 'Match won by {{name}}{{value}}', { name: state.config.sides[w].name, value: ev.reason === 'retired' ? gtx('games.badminton.retired', ', retired') : gtx('games.badminton.walkover', ', walkover') }) }];
      return state;
    }

    if (ev.t === 'let') {
      state.stats.lets += 1;
      bump(state.stats.codes, 'let_' + (LETS[ev.code] ? ev.code : 'disturbed'));
      state.calls = [{ k: 'let', text: gtx('games.badminton.let', 'Let') }, { k: 'score', text: scoreWithPoint(state) }];
      return state;
    }

    if (ev.t !== 'rally') return state;
    const w = ev.w === 1 ? 1 : 0;
    const srv = state.server.side;
    const game = state.games[state.g];
    const st = state.stats;
    const code = CODES[ev.code] ? ev.code : 'winner';

    // Stats before the score moves.
    st.rallies += 1;
    game.rallies += 1;
    const hits = Math.max(1, Math.floor(Number(ev.hits) || 1));
    st.hits += hits;
    st.longest = Math.max(st.longest, hits);
    st.serveTot[srv] += 1;
    st.recvTot[1 - srv] += 1;
    if (w === srv) st.serveWon[srv] += 1;
    else st.recvWon[1 - srv] += 1;
    if (CODES[code].kind === 'winner') st.winners[w] += 1;
    else st.errors[1 - w] += 1;
    bump(st.codes, code);
    st.points[w] += 1;
    if (st.streak.side === w) st.streak.n += 1;
    else st.streak = { side: w, n: 1 };
    st.bestStreak[w] = Math.max(st.bestStreak[w], st.streak.n);

    // Law 7.2 point; Law 10.3 / 11 service.
    state.score[w] += 1;
    game.score = state.score.slice();
    let serviceOver = false;
    if (w === srv) {
      if (state.config.perSide === 2) state.pos[srv] = [state.pos[srv][1], state.pos[srv][0]];
    } else {
      serviceOver = true;
      state.server = { side: w, player: 0 };
    }
    placeService(state);

    const gw = gameWonBy(state);
    if (gw >= 0) {
      game.winner = gw;
      const won = gamesWon(state);
      const line = gameLine(game);
      if (won[gw] >= needGames(state)) {
        state.over = true;
        const lines = state.games.map(gameLine).join(', ');
        state.result = { winner: gw, games: state.games.map((g) => g.score.slice()), by: 'games', text: state.config.sides[gw].name + ' win' + (state.config.perSide === 2 ? '' : 's') + ' ' + lines };
        state.calls = [{ k: 'game', text: gtx('games.badminton.value_won_by_name_lines', '{{value}} won by {{name}}, {{lines}}', { value: state.format.games === 1 ? gtx('games.badminton.game', 'Game') : gtx('games.badminton.match', 'Match'), name: state.config.sides[gw].name, lines }) }];
        return state;
      }
      // Next game: the winner serves first (Law 7.6); ends change (Law 8.1); interval (Law 16).
      const ord = ORDINAL[Math.min(1, state.g)];
      state.swapped = !state.swapped;
      state.changeEnds = true;
      state.pause = { kind: 'game', game: state.g };
      state.calls = [{ k: 'game', text: gtx('games.badminton.ord_game_won_by_name_line', '{{ord}} game won by {{name}}, {{line}}', { ord, name: state.config.sides[gw].name, line }) }, { k: 'ends', text: gtx('games.badminton.interval.ends', 'Change ends') }];
      const rp = 0;
      newGame(state, { side: gw, player: 0 }, rp);
      return state;
    }

    // Mid-game interval when the leading score first reaches the interval mark (Law 16).
    const lead = Math.max(state.score[0], state.score[1]);
    let interval = false;
    if (!state.intervalTaken && lead >= state.format.interval) {
      state.intervalTaken = true;
      interval = true;
      state.pause = { kind: 'interval', game: state.g };
    }
    const calls = [];
    calls.push({ k: serviceOver ? 'service_over' : 'score', text: serviceOver ? gtx('games.badminton.service_over_score', 'Service over, ' + scoreWithPoint(state), { score: scoreWithPoint(state) }) : scoreWithPoint(state) });
    if (interval) {
      calls[0].text += ', interval';
      if (isDecider(state) && !state.endsChangedInGame) {
        state.endsChangedInGame = true;
        state.swapped = !state.swapped;
        state.changeEnds = true;
        calls.push({ k: 'ends', text: gtx('games.badminton.interval.ends', 'Change ends') });
      }
    }
    state.calls = calls;
    return state;
  }

  function replay(config, log) {
    const state = initState(config);
    (log || []).forEach((ev) => applyEvent(state, ev));
    if (!state.started) startIfNeeded(state, null);
    if (!(log || []).length || (log.length === 1 && log[0] && log[0].t === 'start')) state.calls = [{ k: 'start', text: gameStartCall(state) }];
    return state;
  }

  /** Who should serve / receive now and from where (the source of truth for positions). */
  function expectedService(state) {
    return {
      server: { side: state.server.side, player: state.server.player },
      receiver: { side: state.receiver.side, player: state.receiver.player },
      court: state.court,
    };
  }

  /**
   * Law 12: compare what's on court with the Laws. Any error is corrected and the score stands.
   * @param {{ server?: {side, player}, receiver?: {side, player}, court?: 'R'|'L' }} seen
   */
  function checkService(state, seen) {
    const want = expectedService(state);
    const s = seen || {};
    const errors = [];
    if (s.server && (s.server.side !== want.server.side || s.server.player !== want.server.player)) errors.push('wrong_server');
    if (s.court && s.court !== want.court) errors.push('wrong_court');
    if (s.receiver && (s.receiver.side !== want.receiver.side || s.receiver.player !== want.receiver.player)) errors.push('wrong_receiver');
    return { ok: !errors.length, errors, correct: want, score: state.score.slice() };
  }

  /** Scoreboard line for any viewer ("12–10" from side 0's point of view). */
  function scoreLine(state) {
    return state.score[0] + '–' + state.score[1];
  }
  function playerName(state, side, player) {
    const s = state.config.sides[side];
    return (s && s.players[player]) || (s && s.name) || '';
  }

  // ---------------------------------------------------------------- gameplay layer (PLAY)

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

  /**
   * Timing windows (fractions of the contact window), window sizes and per-quality landing spreads.
   * P12 maps the existing one-button rally onto the laws; P13 replaces this layer with shot depth.
   */
  const PLAY = {
    windowMs: 720,
    serveWindowMs: 980,
    minWindow: 380,
    maxWindow: 980,
    sweet: [0.42, 0.78],
    perfect: [0.52, 0.68],
    /** Next contact window multiplier by the quality of this contact. */
    shrink: { perfect: 0.86, good: 0.94, early: 1.14, late: 1.14 },
    /** Aim (depth y, lateral fraction of the half-width) and spread by quality. */
    aim: {
      perfect: { y: 5.9, sy: 0.55, x: 0.72, sx: 0.28 },
      good: { y: 4.4, sy: 0.9, x: 0.45, sx: 0.3 },
      early: { y: 1.1, sy: 1.5, x: 0.35, sx: 0.55 },
      late: { y: 6.3, sy: 1.1, x: 0.6, sx: 0.55 },
    },
    serveAim: {
      perfect: { y: 2.4, sy: 0.16, x: 0.35, sx: 0.18 },
      good: { y: 2.75, sy: 0.32, x: 0.45, sx: 0.25 },
      early: { y: 3.8, sy: 1.8, x: 0.5, sx: 0.5 },
      late: { y: 1.6, sy: 0.9, x: 0.45, sx: 0.4 },
    },
    /** Illegal-serve likelihood (the laws engine only records the code). */
    serveFault: { early: { serve_height: 0.5 }, late: {}, good: { serve_feet: 0.01 }, perfect: { serve_feet: 0.005 } },
    /** A clean shot the receiver can't reach (outright winner), by quality; doubles covers more court. */
    winner: { perfect: 0.2, good: 0.05, doublesFactor: 0.7 },
    /** Rare in-rally faults and lets. */
    rare: { netTouchPerfect: 0.012, obstructionDoubles: 0.003, doubleHitCentre: 0.04, caughtNet: 0.12, disintegrate: 0.0015 },
  };

  function timingOf(p) {
    if (p == null || !isFinite(p) || p < 0) return 'none';
    if (p < PLAY.sweet[0]) return 'early';
    if (p > PLAY.sweet[1]) return 'late';
    if (p >= PLAY.perfect[0] && p <= PLAY.perfect[1]) return 'perfect';
    return 'good';
  }
  /** A representative tap point (fraction of the window) for a timing — for bots and animation. */
  function tapFor(timing, rng) {
    const r = rng ? rng() : 0.5;
    if (timing === 'perfect') return PLAY.perfect[0] + r * (PLAY.perfect[1] - PLAY.perfect[0]);
    if (timing === 'good') return r < 0.5 ? PLAY.sweet[0] + r * 0.2 : PLAY.perfect[1] + (r - 0.5) * 0.2;
    if (timing === 'early') return 0.12 + r * 0.28;
    if (timing === 'late') return 0.8 + r * 0.18;
    return 1;
  }
  function gauss(rng) {
    const u = Math.max(1e-9, rng());
    const v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function clampWindow(ms) {
    return Math.round(Math.max(PLAY.minWindow, Math.min(PLAY.maxWindow, ms)));
  }

  /**
   * Resolve one contact.
   * @param {{ discipline: string, serve?: boolean, court?: 'R'|'L', timing: string, windowMs?: number,
   *           prevLand?: {x,y} }} ctx — timing ∈ perfect | good | early | late
   * @param {() => number} rng
   * @returns {{ kind: 'in'|'winner'|'fault'|'let', code: string, land: {x,y}, nextWindow: number }}
   */
  function resolveContact(ctx, rng) {
    const c = ctx || {};
    const timing = ['perfect', 'good', 'early', 'late'].indexOf(c.timing) >= 0 ? c.timing : 'late';
    const doubles = c.discipline === 'doubles';
    const half = widthOf(c.discipline) / 2;
    const win = Number(c.windowMs) || PLAY.windowMs;
    const out = (kind, code, land) => ({ kind, code, land: land || { x: 0, y: 0 }, nextWindow: clampWindow(win * PLAY.shrink[timing]) });

    if (c.serve) {
      const sf = PLAY.serveFault[timing] || {};
      for (const code of Object.keys(sf)) if (rng() < sf[code]) return out('fault', code, { x: 0, y: 0 });
      const a = PLAY.serveAim[timing];
      const side = c.court === 'L' ? -1 : 1;
      const land = { x: side * half * Math.max(0.02, a.x + gauss(rng) * a.sx), y: a.y + gauss(rng) * a.sy };
      if (land.y <= 0.05 && land.y > -0.3 && rng() < 0.5) land.y = -0.01;
      const fault = landingFault(land, { discipline: c.discipline, serve: true, court: c.court });
      if (fault) return out('fault', fault, land);
      return Object.assign(out('in', '', land), { nextWindow: clampWindow(PLAY.windowMs * PLAY.shrink[timing]) });
    }

    // Partners both going for a shuttle down the middle (Law 13: partners hitting in succession).
    if (doubles && c.prevLand && Math.abs(c.prevLand.x) < 0.35 && rng() < PLAY.rare.doubleHitCentre) return out('fault', 'double_hit', c.prevLand);
    if (rng() < PLAY.rare.disintegrate) return out('let', 'disintegrated');
    if (timing === 'perfect' && rng() < PLAY.rare.netTouchPerfect) return out('fault', 'net_touch');
    if (doubles && timing === 'perfect' && rng() < PLAY.rare.obstructionDoubles) return out('fault', 'obstruction');

    const a = PLAY.aim[timing];
    const sgn = rng() < 0.5 ? -1 : 1;
    const land = { x: sgn * half * Math.abs(a.x + gauss(rng) * a.sx), y: a.y + gauss(rng) * a.sy };
    const fault = landingFault(land, { discipline: c.discipline });
    if (fault === 'net') {
      // Clipped the tape, went over and hung in the net → a let (Law 14.2), except on the serve.
      if (land.y > -0.25 && rng() < PLAY.rare.caughtNet) return out('let', 'caught_net', land);
      return out('fault', 'net', land);
    }
    if (fault) return out('fault', fault, land);
    const wp = (PLAY.winner[timing] || 0) * (doubles ? PLAY.winner.doublesFactor : 1);
    // Deep or wide placements are the ones that beat the receiver.
    const edge = land.y > 5.6 || Math.abs(land.x) > half * 0.75 ? 1.4 : 0.6;
    if (rng() < wp * edge) return out('winner', 'winner', land);
    return out('in', '', land);
  }

  /** Bot tiers (P12 keeps the shipped Practice levels; P13 deepens the AI). */
  const TIERS = {
    easy: { label: gtx('games.badminton.easy', 'Easy'), hit: 0.66, perfect: 0.12, pressure: 0.012 },
    normal: { label: gtx('games.badminton.normal', 'Normal'), hit: 0.76, perfect: 0.26, pressure: 0.01 },
    sharp: { label: gtx('games.badminton.sharp', 'Sharp'), hit: 0.84, perfect: 0.42, pressure: 0.008 },
  };
  const TIER_ORDER = ['easy', 'normal', 'sharp'];
  function tierOf(t) {
    return TIERS[t] ? t : t === 'hard' || t === 'pro' ? 'sharp' : 'normal';
  }
  /** A bot's timing for a contact: tighter windows and long rallies make misses likelier. */
  function botTiming(o, rng) {
    const opt = o || {};
    const T = TIERS[tierOf(opt.tier)];
    const win = Number(opt.windowMs) || PLAY.windowMs;
    let hit = T.hit - Math.max(0, (PLAY.windowMs - win) / PLAY.windowMs) * 0.35 - Math.min(0.2, (opt.rally || 0) * T.pressure);
    if (opt.serve) hit = Math.min(0.97, hit + 0.18);
    hit = Math.max(0.3, Math.min(0.97, hit));
    if (rng() < hit) return rng() < T.perfect ? 'perfect' : 'good';
    return rng() < 0.5 ? 'early' : 'late';
  }

  /** Which receiving-side player takes the next contact: whoever covers the landing side. */
  function hitterFor(state, side, land, serve) {
    if (state.config.perSide !== 2) return 0;
    if (serve) return state.receiver.player;
    const x = Number(land && land.x) || 0;
    return state.pos[side][x >= 0 ? 0 : 1];
  }

  return {
    FORMATS,
    FORMAT_ORDER,
    DISCIPLINES,
    COURT,
    CODES,
    LETS,
    LAWS,
    PLAY,
    TIERS,
    TIER_ORDER,
    normFormat,
    normDiscipline,
    widthOf,
    landingFault,
    isFault,
    createConfig,
    initState,
    applyEvent,
    replay,
    expectedService,
    checkService,
    gamesWon,
    gamePointFor,
    scoreCall,
    scoreLine,
    playerName,
    mulberry32,
    timingOf,
    tapFor,
    resolveContact,
    botTiming,
    tierOf,
    hitterFor,
  };
});
