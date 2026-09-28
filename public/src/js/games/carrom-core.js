/**
 * Carrom rules (Dangal P7) — "Rules based on the ICF Laws of Carrom". Pure state machine shared by the
 * browser (vs AI, Pass & Play, Practice) and the server (server-lib/carrom-engine.js, Live rooms).
 * Law numbers in comments refer to the ICF Laws of Carrom.
 *
 * State: seats (turn order = sides S → E → N → W, partners opposite), a board (men as integer
 * 0.01 mm positions, pocketed ids per colour, dues, Queen), a phase ('shot' | 'place' | 'boardOver' |
 * 'over'), the game score per team and the board history.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./carrom-physics.js'));
  else root.CarromCore = factory(root.CarromPhysics);
})(typeof self !== 'undefined' ? self : this, function (Phys) {
  'use strict';

  const VARIANTS = ['icf', 'quick', 'freestyle'];
  const LEVELS = ['easy', 'normal', 'hard'];
  const GAME_POINTS = 25; // Law 56
  const GAME_BOARDS = 8; // Law 56
  const QUEEN_PTS = 3; // Law 52
  const QUEEN_CUTOFF = 21; // Queen counts "up to and including 21 points" (52, 54)
  const BOARD_MAX = 12; // Law 55
  const BREAK_TRIES = 3; // Law 45: first try + two more chances
  const FREE_PTS = { w: 20, b: 10, q: 50 };
  const FREE_TARGET = 160;
  const SHOT_MS = 20000;
  const PLACE_MS = 15000; // Law 88
  const OUTER_R = 85; // outer circle (17 cm)
  const CENTRE_R = 15.9; // centre circle (3.18 cm)
  const LOG_MAX = 4;

  const MR = Phys.MAN_R;
  const SR = Phys.STRIKER_R;
  const C = Phys.CENTRE;
  const OTHER = { w: 'b', b: 'w' };
  const COLOR_NAME = { w: 'White', b: 'Black', q: 'Queen' };

  const clone = (x) => JSON.parse(JSON.stringify(x));

  // ---------------------------------------------------------------- geometry

  /** ICF 41 formation: Queen in the centre, 6 alternate in the first ring, whites forming a "Y". */
  function formation(breakerSide) {
    const d = 2 * MR + 0.02;
    const spots = [];
    for (let k = 0; k < 6; k++) spots.push({ c: k % 2 ? 'b' : 'w', r: d, a: k * 60 });
    for (let k = 0; k < 6; k++) spots.push({ c: k % 2 ? 'b' : 'w', r: 2 * d, a: k * 60 });
    for (let k = 0; k < 6; k++) spots.push({ c: k % 2 ? 'b' : 'w', r: d * 1.7320508075688772, a: k * 60 + 30 });
    const f = Phys.FORWARD[breakerSide & 3];
    const rt = Phys.RIGHT[breakerSide & 3];
    const out = [{ id: 'q', c: 'q', x: C * 100, y: C * 100 }];
    const n = { w: 0, b: 0 };
    spots.forEach((s) => {
      const th = (s.a * Phys.PI) / 180;
      // a = 0 points at the breaker (−forward); + turns to the breaker's right.
      const lu = s.r * Phys.dsin(th);
      const lv = -s.r * Phys.dcos(th);
      const bx = C + rt[0] * lu + f[0] * lv;
      const by = C + rt[1] * lu + f[1] * lv;
      out.push({ id: s.c + n[s.c]++, c: s.c, x: Math.round(bx * 100), y: Math.round(by * 100) });
    });
    return out;
  }

  const BASE_CIRCLE_R = 15.9;
  const BASE_CIRCLE_U = 219.1; // circle centres close the 47 cm baselines
  const U_LIMIT = 2300; // input x range (0.1 mm)

  function dist2(ax, ay, bx, by) {
    return (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
  }

  /** Distance from a point to the corner arrow (the board diagonal through that corner). */
  function arrowDist(px, py, side, u) {
    // The arrow nearest this end of the baseline runs along a board diagonal.
    const end = u < 0 ? -1 : 1;
    const corner = Phys.toBoard(side, end * C, -Phys.BASE_DEPTH); // frame corner at that end of the baseline
    const cx = Math.round(corner[0]);
    const cy = Math.round(corner[1]);
    // Diagonal through (cx, cy) and the centre: direction (C - cx, C - cy)/|…|
    const dx = C - cx;
    const dy = C - cy;
    const len = Math.sqrt(dx * dx + dy * dy);
    return Math.abs((px - cx) * dy - (py - cy) * dx) / len;
  }

  /**
   * Law 130: the striker touches both baselines (we centre it between them) and, if played from a
   * base circle, covers it fully without touching the arrow. It may not sit on a carrom man.
   * @returns {{ ok: boolean, why?: string }}
   */
  function strikerSpot(pieces, side, xTenths) {
    const xi = Math.round(Number(xTenths));
    if (!isFinite(xi) || Math.abs(xi) > U_LIMIT) return { ok: false, why: 'off_baseline' };
    const u = xi / 10;
    const p = Phys.toBoard(side, u, 0);
    for (const end of [-1, 1]) {
      const cc = Phys.toBoard(side, end * BASE_CIRCLE_U, 0);
      const d = Math.sqrt(dist2(p[0], p[1], cc[0], cc[1]));
      if (d < SR + BASE_CIRCLE_R && d > SR - BASE_CIRCLE_R) return { ok: false, why: 'base_circle' };
    }
    if (Math.abs(u) > BASE_CIRCLE_U - (SR + BASE_CIRCLE_R) && arrowDist(p[0], p[1], side, u) < SR) return { ok: false, why: 'arrow' };
    if (Math.abs(u) > BASE_CIRCLE_U + (SR - BASE_CIRCLE_R)) return { ok: false, why: 'off_baseline' };
    for (const m of pieces || []) {
      if (dist2(p[0], p[1], m.x / 100, m.y / 100) < (SR + MR) * (SR + MR)) return { ok: false, why: 'on_man' };
    }
    return { ok: true };
  }

  /** Every legal baseline x (0.1 mm) on a grid — UI clamping, bots and the Law 142 check. */
  function legalSpots(pieces, side, stepTenths) {
    const step = stepTenths || 10;
    const out = [];
    for (let x = -U_LIMIT; x <= U_LIMIT; x += step) if (strikerSpot(pieces, side, x).ok) out.push(x);
    return out;
  }

  /** Nearest legal x to a wanted one (keeps the striker sliding smoothly past blocked spots). */
  function nearestLegal(pieces, side, xTenths) {
    const want = Math.max(-U_LIMIT, Math.min(U_LIMIT, Math.round(xTenths)));
    if (strikerSpot(pieces, side, want).ok) return want;
    for (let d = 5; d <= 2 * U_LIMIT; d += 5) {
      if (strikerSpot(pieces, side, want - d).ok) return want - d;
      if (strikerSpot(pieces, side, want + d).ok) return want + d;
    }
    return null;
  }

  /** Law 84/85/89/86: a due man goes fully inside the outer circle, off the centre circle, touching nothing. */
  function placeSpot(pieces, xh, yh) {
    const x = Number(xh) / 100;
    const y = Number(yh) / 100;
    if (!isFinite(x) || !isFinite(y)) return { ok: false, why: 'bad' };
    const dc = Math.sqrt(dist2(x, y, C, C));
    if (dc + MR > OUTER_R && (dc + MR > OUTER_R + OVERFLOW_R || roomInside(pieces))) return { ok: false, why: 'outside' };
    if (dc < MR + CENTRE_R) return { ok: false, why: 'centre' };
    if (!clearOf(pieces, x, y)) return { ok: false, why: 'touching' };
    return { ok: true };
  }

  const OVERFLOW_R = 40;
  const clearOf = (pieces, x, y) => pieces.every((m) => dist2(x, y, m.x / 100, m.y / 100) >= (2 * MR) * (2 * MR));

  /** Candidate due spots (mm) inside the outer circle, then the overflow ring just outside it. */
  function placeGrid(inside) {
    const out = [];
    const lo = inside ? CENTRE_R + MR + 0.5 : OUTER_R - MR + 1;
    const hi = inside ? OUTER_R - MR - 0.5 : OUTER_R - MR + OVERFLOW_R - 0.5;
    for (let rad = lo; rad <= hi; rad += 3) {
      for (let k = 0; k < 48; k++) {
        const th = (k * 7.5 * Phys.PI) / 180;
        out.push([C + Phys.dcos(th) * rad, C + Phys.dsin(th) * rad]);
      }
    }
    return out;
  }

  /** Laws 84–89: a due man goes inside the outer circle; only if no clear spot exists there may it sit just outside. */
  function roomInside(pieces) {
    return placeGrid(true).some((p) => clearOf(pieces, p[0], p[1]));
  }

  /** Laws 93/94: the Queen goes on the centre circle, or the nearest free spot, never easy for the shooter. */
  function queenSpot(pieces, awayFromSide) {
    const free = (x, y) => pieces.every((m) => dist2(x, y, m.x / 100, m.y / 100) >= (2 * MR + 0.02) * (2 * MR + 0.02));
    if (free(C, C)) return [C * 100, C * 100];
    const f = Phys.FORWARD[awayFromSide & 3];
    for (let rad = 4; rad <= 200; rad += 4) {
      // Prefer spots further from the shooter (toward their forward direction).
      for (let k = 0; k < 24; k++) {
        const th = ((k % 2 ? 1 : -1) * Math.ceil(k / 2) * 15 * Phys.PI) / 180;
        const cs = Phys.dcos(th);
        const sn = Phys.dsin(th);
        const dx = f[0] * cs - f[1] * sn;
        const dy = f[1] * cs + f[0] * sn;
        const x = C + dx * rad;
        const y = C + dy * rad;
        if (free(x, y)) return [Math.round(x * 100), Math.round(y * 100)];
      }
    }
    return [C * 100, C * 100];
  }

  // ---------------------------------------------------------------- setup

  /**
   * @param {{id:string,name:string,bot?:boolean,level?:string}[]} players 2 (singles) or 4 (doubles, partners = seats 0+2 and 1+3)
   * @param {{ variant?: string, breaker?: number }} [opts] breaker = seat that won the toss (Law 39: the winner breaks)
   */
  function newGame(players, opts) {
    const o = opts || {};
    const list = (players || []).slice(0, 4);
    if (list.length !== 2 && list.length !== 4) return { error: 'need_players' };
    const doubles = list.length === 4;
    const variant = VARIANTS.indexOf(o.variant) >= 0 ? o.variant : 'icf';
    const st = {
      v: 1,
      variant,
      mode: doubles ? 'doubles' : 'singles',
      seats: list.map((p, i) => ({
        id: String(p.id),
        name: String(p.name || 'Player ' + (i + 1)).slice(0, 32),
        side: doubles ? i : i * 2,
        team: i % 2,
        bot: !!p.bot,
        level: p.bot ? (LEVELS.indexOf(p.level) >= 0 ? p.level : 'normal') : null,
        afk: 0,
      })),
      scores: [0, 0],
      boards: [],
      extra: false,
      turn: 0,
      phase: 'shot',
      place: [],
      nextTurn: 0,
      board: null,
      log: [],
      shotNo: 0,
      seq: 0,
      over: false,
      winner: null,
      result: null,
      note: '',
      firstBreaker: Math.max(0, Math.min(list.length - 1, Math.floor(Number(o.breaker) || 0))),
    };
    newBoard(st, st.firstBreaker);
    return st;
  }

  function newBoard(st, breaker) {
    const seat = st.seats[breaker];
    const colors = {};
    colors[seat.team] = 'w'; // Law 43: the breaker plays white
    colors[1 - seat.team] = 'b';
    st.board = {
      no: st.boards.length + 1,
      breaker,
      colors,
      pieces: formation(seat.side),
      pocketed: { w: [], b: [], q: [] },
      ever: { w: false, b: false },
      due: { w: 0, b: 0 },
      queen: { s: 'board', by: null },
      broken: false,
      tries: 0,
      strokes: 0,
      pts: [0, 0],
      best: null,
    };
    st.turn = breaker;
    st.phase = 'shot';
    st.place = [];
    st.nextTurn = breaker;
    st.note = seat.name + ' breaks with white';
    st.seq += 1;
  }

  // ---------------------------------------------------------------- helpers

  const teamOf = (st, seat) => st.seats[seat].team;
  const colorOf = (st, team) => st.board.colors[team];
  const teamColor = (st, seat) => st.board.colors[st.seats[seat].team];
  const menLeft = (st, c) => 9 - st.board.pocketed[c].length;
  const nextSeat = (st, seat) => (seat + 1) % st.seats.length;
  /** Law 78b: a due is placed by the player on the right of the one having the turn (the next seat). */
  const placerFor = (st, shooter) => nextSeat(st, shooter);
  const teamName = (st, team) =>
    st.seats
      .filter((s) => s.team === team)
      .map((s) => s.name)
      .join(' & ');
  /** "A wins" in singles, "A & C win" in doubles. */
  const teamSays = (st, team, verb) =>
    teamName(st, team) + ' ' + (st.seats.filter((s) => s.team === team).length > 1 || teamName(st, team) === 'You' ? verb : verb + (/(sh|ch|s|x)$/.test(verb) ? 'es' : 's'));

  function queenValue(st, team) {
    return st.scores[team] <= QUEEN_CUTOFF ? QUEEN_PTS : 0;
  }
  /** Law 102–112: "3 points; if the score is 22 or more, 1 point". */
  function threeOrOne(st, team) {
    return st.scores[team] <= QUEEN_CUTOFF ? 3 : 1;
  }

  function plural(n, c) {
    return n + ' ' + (c === 'q' ? 'Queen' : COLOR_NAME[c].toLowerCase());
  }

  function returnQueen(st, shooterSide) {
    const b = st.board;
    const at = queenSpot(b.pieces, shooterSide);
    b.pieces.push({ id: 'q', c: 'q', x: at[0], y: at[1] });
    b.pocketed.q = [];
    b.queen = { s: 'board', by: null };
  }

  function queuePlace(st, c, n, placer, ids) {
    if (n <= 0) return;
    const job = { c, n, seat: placer };
    if (ids && ids.length) job.ids = ids.slice(0, n);
    st.place.push(job);
  }

  // ---------------------------------------------------------------- a stroke

  /**
   * Play one stroke. input = { x, angle, power } (see CarromPhysics.strikerFromInput).
   * @returns {{ ok?: true, error?: string, res?: object, entry?: object }}
   */
  function shoot(st, seat, input) {
    if (st.over) return { error: 'over' };
    if (st.phase !== 'shot') return { error: 'phase' };
    if (seat !== st.turn) return { error: 'not_your_turn' };
    const inp = cleanInput(input);
    if (!inp) return { error: 'bad_shot' };
    const side = st.seats[seat].side;
    const spot = strikerSpot(st.board.pieces, side, inp.x);
    if (!spot.ok) return { error: 'illegal_position', why: spot.why };
    const before = clone(st.board.pieces);
    const res = Phys.simulate(before, Phys.strikerFromInput(side, inp));
    st.seats[seat].afk = 0;
    const entry = { no: ++st.shotNo, seat, side, input: inp, before, steps: res.steps, pocketed: res.pocketed.map((p) => p.c), msg: '' };
    applyStroke(st, seat, res, entry);
    st.log.push(entry);
    if (st.log.length > LOG_MAX) st.log.splice(0, st.log.length - LOG_MAX);
    st.seq += 1;
    return { ok: true, res, entry };
  }

  function cleanInput(input) {
    const i = input || {};
    const x = Math.round(Number(i.x));
    const angle = Math.round(Number(i.angle));
    const power = Math.round(Number(i.power));
    if (![x, angle, power].every((v) => isFinite(v))) return null;
    if (Math.abs(x) > U_LIMIT || Math.abs(angle) > 18000 || power < 0 || power > 1000) return null;
    return { x, angle, power };
  }

  function applyStroke(st, seat, res, entry) {
    const b = st.board;
    b.strokes += 1;
    const pk = res.pocketed;
    const pS = pk.some((p) => p.c === 's');
    const touched = res.touched;
    b.pieces = res.pieces;
    const msgs = [];
    const name = st.seats[seat].name;

    if (!b.broken) {
      if (!touched) {
        // Law 45: the break needs the striker to touch a man — up to three tries, then the turn passes.
        if (pS) {
          msgs.push('Striker pocketed without touching a man — the break passes (no due on the break).');
          b.tries = 0;
          return endTurn(st, seat, false, msgs, entry);
        }
        b.tries += 1;
        if (b.tries >= BREAK_TRIES) {
          b.tries = 0;
          msgs.push('Three tries without touching a man — the break passes.');
          return endTurn(st, seat, false, msgs, entry);
        }
        msgs.push('Missed the men — try ' + (b.tries + 1) + ' of 3 to break.');
        return endTurn(st, seat, true, msgs, entry);
      }
      b.broken = true;
    }
    if (st.variant === 'freestyle') return freestyleStroke(st, seat, pk, pS, msgs, entry);

    const T = teamOf(st, seat);
    const O = 1 - T;
    const myC = colorOf(st, T);
    const opC = colorOf(st, O);
    const pOwn = pk.filter((p) => p.c === myC).length;
    const pOpp = pk.filter((p) => p.c === opC).length;
    const pQ = pk.some((p) => p.c === 'q');
    const beforeOwn = b.pocketed[myC].length;
    const beforeOpp = b.pocketed[opC].length;
    const qBefore = b.queen.s;
    const qBy = b.queen.by;
    pk.forEach((p) => {
      if (p.c === 'w' || p.c === 'b' || p.c === 'q') b.pocketed[p.c].push(p.id);
    });
    const lastOwn = pOwn > 0 && beforeOwn + pOwn === 9;
    const lastOpp = pOpp > 0 && beforeOpp + pOpp === 9;
    const queenOnBoard = qBefore === 'board' && !pQ;
    const extra = pS ? 1 : 0; // "one additional point for the pocketed striker" — always claimed (Law 87b)
    if (!pS) trackBest(st, seat, entry, pOwn + (pQ ? 1 : 0));

    // ---- finishing strokes (Laws 102–112) ----
    if (lastOpp && !lastOwn) {
      // 103 / 106 / 111: pocketing the opponent's last man loses the board — by your men left plus the
      // Queen, unless you had already covered it.
      const q = qBefore === 'covered' && qBy === T ? 0 : queenValue(st, O);
      msgs.push('Pocketed ' + (teamName(st, O) === 'You' ? 'your' : teamName(st, O) + '’s') + ' last man — that loses the board.');
      return endBoard(st, O, menLeft(st, myC) + q + extra, 'opp_last', msgs, entry);
    }
    if (lastOwn && lastOpp) {
      if (pS) {
        const pts = (qBefore === 'covered' && qBy === T ? 1 : threeOrOne(st, O)) + 1; // 109 / 110 / 112
        msgs.push('Both last men went in with the striker — the board goes to ' + teamName(st, O) + '.');
        return endBoard(st, O, pts, 'both_last_striker', msgs, entry);
      }
      if (queenOnBoard) {
        msgs.push('Both last men went in with the Queen still on the board — the board goes to ' + teamName(st, O) + '.'); // 105
        return endBoard(st, O, threeOrOne(st, O), 'both_last_queen', msgs, entry);
      }
      if (qBefore === 'covered' && qBy === O) {
        msgs.push('Last men down together — ' + teamSays(st, T, 'finish') + ' first.');
        return endBoard(st, T, 1, 'both_last', msgs, entry);
      }
      msgs.push('Queen and both last men — ' + teamSays(st, T, 'take') + ' the board.'); // 102 / 104
      if (pQ || qBefore === 'pending') b.queen = { s: 'covered', by: T };
      return endBoard(st, T, threeOrOne(st, T), 'both_last_cover', msgs, entry);
    }
    if (lastOwn) {
      if (queenOnBoard) {
        // 107 / 108: finishing your men with the Queen still on the board loses by 3.
        msgs.push('Last man pocketed with the Queen still on the board — that loses the board.');
        return endBoard(st, O, threeOrOne(st, O) + extra, 'queen_left', msgs, entry);
      }
      if (!pS) {
        const covering = pQ || qBefore === 'pending';
        if (covering) b.queen = { s: 'covered', by: T };
        const q = b.queen.s === 'covered' && b.queen.by === T ? queenValue(st, T) : 0;
        msgs.push(teamSays(st, T, 'pocket') + ' their last man' + (covering ? ' and cover the Queen' : '') + '.');
        return endBoard(st, T, menLeft(st, opC) + q, 'cleared', msgs, entry);
      }
      // With the striker the men come back (73 / 98 / 101) — the board goes on.
    }

    // ---- ordinary strokes ----
    let cont = false;
    let returnOwn = 0;
    let dues = 0;
    let queenBack = false;
    let queenPend = false;
    let queenCover = false;
    const nineOnBoard = beforeOwn === 0;
    const pendingBefore = qBefore === 'pending';
    if (pS) {
      if (pOwn > 0) {
        returnOwn = pOwn; // 73 / 75: own men pocketed with the striker come back, plus a due
        dues = 1;
        cont = true;
        if (pQ) queenBack = true; // 98a
        msgs.push('Striker pocketed with ' + plural(pOwn, myC) + ' — they come back with a due. Shoot again.');
      } else if (pQ) {
        queenBack = true;
        dues = 1;
        // 99a: continue — unless all nine are still on the board (95d) or the Queen wasn't yours to take (95a/b).
        cont = !nineOnBoard && b.ever[myC] && b.due[myC] === 0;
        msgs.push('Queen and striker pocketed — the Queen goes back and you owe a due.' + (cont ? ' Shoot again.' : ''));
      } else {
        dues = 1; // 72a / 74
        if (pendingBefore) queenBack = true; // 100a
        msgs.push('Striker pocketed — due: one ' + COLOR_NAME[myC].toLowerCase() + ' man goes back.');
      }
    } else {
      if (pQ) {
        if (b.due[myC] > 0) {
          queenBack = true; // 95b
          msgs.push('Queen pocketed while you owe a due — it goes back and the turn passes.');
        } else if (!b.ever[myC] && pOwn === 0) {
          queenBack = true; // 95a
          msgs.push('Queen pocketed before any of your men — it goes back and the turn passes.');
        } else if (pOwn > 0) {
          if (nineOnBoard && pOwn === 1) queenPend = true; // 97b
          else queenCover = true; // 97a
        } else queenPend = true;
      }
      if (pendingBefore) {
        if (pOwn > 0) queenCover = true;
        else {
          queenBack = true; // 96
          msgs.push('Queen not covered — back to the centre.');
        }
      }
      cont = !queenBack && (pOwn > 0 || queenPend || queenCover);
      if (pQ && b.due[myC] > 0) cont = false;
    }
    if (pOpp > 0) msgs.push('Pocketed ' + plural(pOpp, opC) + ' — ' + (pOpp > 1 ? 'they count' : 'it counts') + ' for ' + teamName(st, O) + '.'); // 74 / 125
    if (!pS && pOwn > 0) msgs.unshift('Pocketed ' + plural(pOwn, myC) + '.');
    if (queenCover) msgs.push('Queen covered!');
    if (queenPend) msgs.push('Queen pocketed — cover it with one of your men next shot.');

    // Queen bookkeeping
    if (queenCover) b.queen = { s: 'covered', by: T };
    else if (queenPend) b.queen = { s: 'pending', by: T };
    if (queenBack) returnQueen(st, st.seats[seat].side);

    const kept = pOwn - returnOwn;
    if (kept > 0) b.ever[myC] = true;
    if (pOpp > 0) b.ever[opC] = true;
    // Dues (72c / 78a): take what is available now, the rest stays outstanding.
    const owed = returnOwn + dues + b.due[myC];
    const take = Math.min(owed, b.pocketed[myC].length);
    b.due[myC] = owed - take;
    const owedO = b.due[opC];
    const takeO = Math.min(owedO, b.pocketed[opC].length);
    b.due[opC] = owedO - takeO;
    if (take > 0) queuePlace(st, myC, take, placerFor(st, seat));
    if (takeO > 0) queuePlace(st, opC, takeO, seat); // 78b-ii: the shooter places the opponent's outstanding due
    if (b.due[myC] > 0 && dues > 0) msgs.push('Due owed: ' + plural(b.due[myC], myC) + ' comes back as soon as you pocket one.');
    return endTurn(st, seat, cont, msgs, entry);
  }

  function trackBest(st, seat, entry, n) {
    const b = st.board;
    if (n >= 2 && (!b.best || n > b.best.n)) b.best = { n, seat, side: entry.side, input: entry.input, before: entry.before };
  }

  // ---------------------------------------------------------------- Freestyle (casual)

  function freestyleStroke(st, seat, pk, pS, msgs, entry) {
    const b = st.board;
    const T = teamOf(st, seat);
    b.fp = b.fp || [[], []];
    const men = pk.filter((p) => p.c === 'w' || p.c === 'b');
    const pQ = pk.some((p) => p.c === 'q');
    const pending = b.queen.s === 'pending';
    let cont = false;
    const owedPlace = [];
    if (pS) {
      // Striker foul: this stroke's men come back, plus your last pocketed man; turn passes.
      men.forEach((p) => owedPlace.push(p.id));
      if (pQ || pending) returnQueen(st, st.seats[seat].side);
      let back = b.fp[T].pop();
      if (back === 'q') back = b.fp[T].pop() || null;
      if (back) owedPlace.push(back);
      const n = owedPlace.length;
      msgs.push('Striker pocketed — ' + (n ? n + (n > 1 ? ' men go' : ' man goes') + ' back to the centre' : 'turn passes') + '.');
    } else {
      men.forEach((p) => b.fp[T].push(p.id));
      if (men.length) msgs.push('Pocketed ' + men.map((p) => COLOR_NAME[p.c].toLowerCase()).join(' + ') + '.');
      if (pQ && men.length) {
        b.queen = { s: 'covered', by: T };
        b.fp[T].push('q');
        msgs.push('Queen covered — 50 points!');
      } else if (pQ) {
        b.queen = { s: 'pending', by: T };
        msgs.push('Queen pocketed — cover it with any man next shot.');
      } else if (pending) {
        if (men.length) {
          b.queen = { s: 'covered', by: T };
          b.fp[T].push('q');
          msgs.push('Queen covered — 50 points!');
        } else {
          returnQueen(st, st.seats[seat].side);
          msgs.push('Queen not covered — back to the centre.');
        }
      }
      cont = men.length > 0 || b.queen.s === 'pending';
    }
    pk.forEach((p) => {
      if (p.c === 'w' || p.c === 'b') b.pocketed[p.c].push(p.id);
      if (p.c === 'q' && b.queen.s !== 'board') b.pocketed.q = ['q'];
    });
    ['w', 'b'].forEach((c) => {
      const ids = owedPlace.filter((id) => id.charAt(0) === c);
      if (ids.length) queuePlace(st, c, ids.length, placerFor(st, seat), ids);
    });
    freeScores(st);
    if (!pS) trackBest(st, seat, entry, men.length + (pQ ? 1 : 0));
    const top = st.scores[T] >= FREE_TARGET ? T : st.scores[1 - T] >= FREE_TARGET ? 1 - T : null;
    const menGone = b.pieces.every((p) => p.c === 'q') && !st.place.length;
    if (top != null || menGone) {
      st.place = [];
      entry.msg = msgs.join(' ');
      st.note = entry.msg;
      const w = top != null ? top : st.scores[0] === st.scores[1] ? null : st.scores[0] > st.scores[1] ? 0 : 1;
      st.boards.push({ no: b.no, winner: w, pts: w == null ? 0 : st.scores[w], why: top != null ? 'target' : 'cleared' });
      return finish(st, w, 'points');
    }
    return endTurn(st, seat, cont, msgs, entry);
  }

  function freeScores(st) {
    const b = st.board;
    const fp = b.fp || [[], []];
    st.scores = [0, 1].map((t) => fp[t].reduce((s, id) => s + (FREE_PTS[id.charAt(0)] || 0), 0));
    b.pts = st.scores.slice();
  }

  // ---------------------------------------------------------------- turn / board / game

  function endTurn(st, seat, cont, msgs, entry) {
    const next = cont ? seat : nextSeat(st, seat);
    st.nextTurn = next;
    if (!msgs.length) msgs.push('No pocket.');
    if (entry) entry.msg = msgs.join(' ');
    st.note = [msgs.join(' '), cont ? (/again/.test(msgs.join(' ')) ? '' : 'Shoot again.') : st.seats[next].name === 'You' ? 'Your turn.' : st.seats[next].name + '’s turn.'].filter(Boolean).join(' ');
    if (st.place.length) st.phase = 'place';
    else startTurn(st, next);
    return { ok: true };
  }

  function startTurn(st, seat) {
    st.phase = 'shot';
    st.turn = seat;
    st.place = [];
    // Law 142: no room on the baseline for the striker → the board is replayed.
    if (!legalSpots(st.board.pieces, st.seats[seat].side, 40).length && !legalSpots(st.board.pieces, st.seats[seat].side, 5).length) {
      const br = st.board.breaker;
      st.note = 'No room for the striker on the baseline — the board is replayed.';
      const keepScores = st.scores.slice();
      newBoard(st, br);
      st.scores = keepScores;
    }
  }

  function endBoard(st, winner, points, why, msgs, entry) {
    const b = st.board;
    const pts = Math.max(0, Math.min(BOARD_MAX, points));
    b.pts = [0, 0];
    b.pts[winner] = pts;
    st.scores[winner] += pts;
    st.boards.push({ no: b.no, winner, pts, why, queen: b.queen.s === 'covered' ? b.queen.by : null });
    if (entry) entry.msg = msgs.join(' ');
    st.place = [];
    st.note = msgs.join(' ') + ' ' + teamSays(st, winner, 'win') + ' the board +' + pts + '.';
    if (st.variant === 'quick') return finish(st, winner, 'board');
    if (st.scores[winner] >= GAME_POINTS) return finish(st, winner, 'points');
    if (st.boards.length >= GAME_BOARDS) {
      if (st.scores[0] !== st.scores[1]) return finish(st, st.scores[0] > st.scores[1] ? 0 : 1, 'boards');
      st.extra = true; // Law 56b: level after eight boards → one extra board, toss for the break
    }
    st.phase = 'boardOver';
    return { ok: true, boardOver: true };
  }

  function finish(st, winner, result) {
    st.over = true;
    st.winner = winner;
    st.result = result;
    st.phase = 'over';
    st.seq += 1;
    return { ok: true, over: true };
  }

  /** Next board: the break alternates (singles) or passes to the right (doubles, Law 49). */
  function nextBoard(st, rng) {
    if (st.phase !== 'boardOver') return { error: 'phase' };
    const prev = st.board.breaker;
    let br = nextSeat(st, prev);
    if (st.extra) br = Math.floor((typeof rng === 'function' ? rng() : 0) * st.seats.length) % st.seats.length;
    const scores = st.scores.slice();
    newBoard(st, br);
    st.scores = scores;
    if (st.extra) st.note = 'Level after eight boards — extra board. ' + st.seats[br].name + ' won the toss and breaks.';
    return { ok: true };
  }

  // ---------------------------------------------------------------- placement (dues)

  function placeMan(st, seat, xh, yh) {
    if (st.phase !== 'place' || !st.place.length) return { error: 'phase' };
    const job = st.place[0];
    if (seat !== job.seat) return { error: 'not_your_turn' };
    const b = st.board;
    const x = Math.round(Number(xh));
    const y = Math.round(Number(yh));
    const ok = placeSpot(b.pieces, x, y);
    if (!ok.ok) return { error: 'bad_spot', why: ok.why };
    let id = null;
    if (job.ids && job.ids.length) {
      id = job.ids.pop();
      const at = b.pocketed[job.c].indexOf(id);
      if (at >= 0) b.pocketed[job.c].splice(at, 1);
    } else id = b.pocketed[job.c].pop();
    if (!id) return donePlacing(st, true);
    b.pieces.push({ id, c: job.c, x, y });
    if (st.variant === 'freestyle' && b.fp) {
      // The returned man leaves whichever team had it.
      [0, 1].forEach((t) => {
        const i = b.fp[t].indexOf(id);
        if (i >= 0) b.fp[t].splice(i, 1);
      });
      freeScores(st);
    }
    job.n -= 1;
    st.seq += 1;
    if (job.n <= 0) return donePlacing(st, true);
    return { ok: true };
  }

  /** Forgo (Law 80/87a, all of this due) or time out (88) — the rest of this due is written off. */
  function forgo(st, seat) {
    if (st.phase !== 'place' || !st.place.length) return { error: 'phase' };
    if (seat != null && seat !== st.place[0].seat) return { error: 'not_your_turn' };
    st.note = st.seats[st.place[0].seat].name + ' let the due go.';
    return donePlacing(st, true);
  }

  function donePlacing(st, shift) {
    if (shift) st.place.shift();
    st.seq += 1;
    if (!st.place.length) startTurn(st, st.nextTurn);
    return { ok: true };
  }

  // ---------------------------------------------------------------- timeouts + forfeits

  /** Law 50 (15 s per stroke) → a foul (64a): one man comes out for placing and the turn is lost. */
  function timeoutFoul(st, seat) {
    if (st.over || st.phase !== 'shot' || seat !== st.turn) return { error: 'phase' };
    const b = st.board;
    const msgs = [st.seats[seat].name + ' ran out of time'];
    if (!b.broken) {
      b.tries = 0;
      msgs[0] += ' — the break passes (no penalty on the break).';
      return endTurn(st, seat, false, msgs, null);
    }
    const T = teamOf(st, seat);
    const myC = colorOf(st, T);
    if (b.queen.s === 'pending') returnQueen(st, st.seats[seat].side);
    if (st.variant === 'freestyle') {
      b.fp = b.fp || [[], []];
      let back = b.fp[T].pop();
      if (back === 'q') back = b.fp[T].pop() || null;
      if (back) queuePlace(st, back.charAt(0), 1, placerFor(st, seat), [back]);
      freeScores(st);
      msgs[0] += ' — foul, turn passes.';
      return endTurn(st, seat, false, msgs, null);
    }
    const owed = 1 + b.due[myC];
    const take = Math.min(owed, b.pocketed[myC].length);
    b.due[myC] = owed - take;
    if (take) queuePlace(st, myC, take, placerFor(st, seat));
    msgs[0] += ' — foul: one ' + COLOR_NAME[myC].toLowerCase() + ' man ' + (take ? 'comes back' : 'is owed') + ' and the turn passes.';
    return endTurn(st, seat, false, msgs, null);
  }

  /** Resign / leave / AFK: the team loses the game (ICF XVII: leaving the match loses it). */
  function forfeit(st, seat, reason) {
    if (st.over) return { error: 'over' };
    const T = teamOf(st, seat);
    st.forfeit = { seat, team: T, reason: reason || 'resign' };
    st.note = st.seats[seat].name + (reason === 'left' ? ' left' : reason === 'afk' ? ' timed out three times' : ' resigned') + ' — ' + teamSays(st, 1 - T, 'win') + '.';
    return finish(st, 1 - T, reason || 'resign');
  }

  // ---------------------------------------------------------------- bots

  function localDir(side, dx, dy) {
    const f = Phys.FORWARD[side & 3];
    const r = Phys.RIGHT[side & 3];
    return [dx * r[0] + dy * r[1], dx * f[0] + dy * f[1]]; // (u, v)
  }
  function angleOf(side, dx, dy) {
    const l = localDir(side, dx, dy);
    return Math.round((Math.atan2(l[0], l[1]) * 18000) / Math.PI);
  }

  function segClear(ax, ay, bx, by, pieces, skip, rad) {
    const sx = bx - ax;
    const sy = by - ay;
    const ss = sx * sx + sy * sy || 1;
    for (const m of pieces) {
      if (skip && skip.indexOf(m.id) >= 0) continue;
      const mx = m.x / 100;
      const my = m.y / 100;
      let t = ((mx - ax) * sx + (my - ay) * sy) / ss;
      if (t < 0 || t > 1) continue;
      const cx = ax + sx * t - mx;
      const cy = ay + sy * t - my;
      if (cx * cx + cy * cy < rad * rad) return false;
    }
    return true;
  }

  function gauss(rng) {
    let s = 0;
    for (let i = 0; i < 4; i++) s += rng();
    return (s - 2) * 1.7320508;
  }

  const BOT = {
    easy: { top: 3, powers: [1.1], step: 160, noiseA: 220, noiseP: 0.1, safety: 0, rebound: false },
    normal: { top: 8, powers: [1, 1.25], step: 100, noiseA: 90, noiseP: 0.06, safety: 0.5, rebound: false },
    hard: { top: 14, powers: [0.95, 1.15, 1.4], step: 60, noiseA: 35, noiseP: 0.03, safety: 1.5, rebound: true },
  };

  /** Value of a trial stroke from the bot's point of view (runs the real rules on a copy). */
  function trialValue(st, seat, input, cfg) {
    const t = clone(st);
    t.log = [];
    const out = shoot(t, seat, input);
    if (out.error) return -1e9;
    const T = teamOf(st, seat);
    if (t.over || t.phase === 'boardOver') {
      const last = t.boards[t.boards.length - 1];
      const won = t.over ? t.winner === T : last && last.winner === T;
      return won ? 1000 + (last ? last.pts : 0) : -1000;
    }
    let v = 0;
    if (st.variant === 'freestyle') {
      v += (t.scores[T] - st.scores[T]) * 0.5 - (t.scores[1 - T] - st.scores[1 - T]) * 0.3;
    } else {
      const myC = colorOf(st, T);
      const opC = OTHER[myC];
      v += (t.board.pocketed[myC].length - st.board.pocketed[myC].length) * 10;
      v -= (t.board.pocketed[opC].length - st.board.pocketed[opC].length) * 5;
      v -= (t.board.due[myC] - st.board.due[myC]) * 12;
      v -= t.place.filter((p) => p.c === myC).reduce((s, p) => s + p.n, 0) * 12;
      if (t.board.queen.s === 'covered' && t.board.queen.by === T && st.board.queen.s !== 'covered') v += 14;
      if (t.board.queen.s === 'pending' && st.board.queen.s !== 'pending') v += 4;
      if (st.board.queen.s === 'pending' && t.board.queen.s === 'board') v -= 10;
    }
    const cont = t.phase !== 'boardOver' && (t.phase === 'place' ? t.nextTurn === seat : t.turn === seat);
    if (cont) v += 6;
    else if (cfg.safety) {
      // Leave nothing easy: men of the next shooter sitting near a pocket.
      const nextT = 1 - T;
      const theirC = st.variant === 'freestyle' ? null : colorOf(st, nextT);
      let easy = 0;
      t.board.pieces.forEach((m) => {
        if (theirC && m.c !== theirC) return;
        const px = m.x / 100;
        const py = m.y / 100;
        if (Phys.POCKETS.some((p) => dist2(px, py, p[0], p[1]) < 110 * 110)) easy += 1;
      });
      v -= easy * cfg.safety;
    }
    return v;
  }

  /**
   * Deterministic shot search (no LLM): ghost-ball candidates through the physics module,
   * scored by the rules, then level-based aim noise. `rng` = seeded RNG.
   * @returns {{ x: number, angle: number, power: number }}
   */
  function botShot(st, seat, level, rng, opts) {
    const o = opts || {};
    const R = typeof rng === 'function' ? rng : Math.random;
    const cfg = BOT[level] || BOT.normal;
    const side = st.seats[seat].side;
    const b = st.board;
    const pieces = b.pieces;
    const spots = legalSpots(pieces, side, cfg.step);
    if (!spots.length) return { x: 0, angle: 0, power: 600 };
    const T = teamOf(st, seat);
    let best = null;
    const consider = (input, v) => {
      if (!best || v > best.v) best = { input, v };
    };
    if (!b.broken) {
      const x = nearestLegal(pieces, side, 0) || spots[Math.floor(spots.length / 2)];
      const sp = Phys.toBoard(side, x / 10, 0);
      const base = angleOf(side, C - sp[0], C - sp[1]);
      const tries = level === 'hard' ? [-120, 0, 120] : [0];
      tries.forEach((d) => {
        const input = { x, angle: base + d, power: level === 'easy' ? 850 : 1000 };
        consider(input, trialValue(st, seat, input, cfg));
      });
    } else {
      const myC = st.variant === 'freestyle' ? null : colorOf(st, T);
      const pending = b.queen.s === 'pending';
      const queenOk = st.variant === 'freestyle' || (!pending && b.ever[myC] && b.due[myC] === 0 && menLeft(st, myC) > 1);
      const targets = pieces.filter((m) => (myC ? m.c === myC : m.c !== 'q') || (m.c === 'q' && queenOk));
      const cands = [];
      targets.forEach((m) => {
        const tx = m.x / 100;
        const ty = m.y / 100;
        Phys.POCKETS.forEach((p) => {
          const dxp = p[0] - tx;
          const dyp = p[1] - ty;
          const dtp = Math.sqrt(dxp * dxp + dyp * dyp);
          if (dtp < 1) return;
          const ux = dxp / dtp;
          const uy = dyp / dtp;
          const gx = tx - ux * (SR + MR);
          const gy = ty - uy * (SR + MR);
          if (!segClear(tx, ty, p[0], p[1], pieces, [m.id], 2 * MR - 1)) return;
          spots.forEach((x) => {
            const s = Phys.toBoard(side, x / 10, 0);
            const aims = [[gx, gy, 0]];
            if (cfg.rebound) {
              // One-cushion rebound off the far frame: aim at the ghost mirrored in that cushion.
              const f = Phys.FORWARD[side];
              if (f[1] !== 0) {
                const wall = f[1] < 0 ? SR : Phys.BOARD - SR;
                aims.push([gx, 2 * wall - gy, 1]);
              } else {
                const wall = f[0] < 0 ? SR : Phys.BOARD - SR;
                aims.push([2 * wall - gx, gy, 1]);
              }
            }
            aims.forEach(([ax, ay, reb]) => {
              const dx = ax - s[0];
              const dy = ay - s[1];
              const dsg = Math.sqrt(dx * dx + dy * dy);
              if (dsg < 1) return;
              const cut = reb ? 0.6 : (dx * ux + dy * uy) / dsg;
              if (cut < 0.25) return;
              if (!reb && !segClear(s[0], s[1], gx, gy, pieces, [m.id], SR + MR - 1)) return;
              const need = Math.sqrt(2 * Phys.K.frictionMan * dtp) * 1.25 + 0.25;
              const atContact = need / Math.max(0.3, cut * ((1 + Phys.K.eStriker) * Phys.STRIKER_M) / (Phys.STRIKER_M + Phys.MAN_M));
              const travel = reb ? dsg * 1.1 : dsg;
              const v0 = Math.sqrt(atContact * atContact + 2 * Phys.K.frictionStriker * travel) / (reb ? Phys.K.eCushion : 1);
              const score = cut * cut * (m.c === 'q' ? 1.3 : 1) * (1 / (1 + dtp / 350)) * (1 / (1 + dsg / 900)) * (reb ? 0.55 : 1);
              cands.push({ x, angle: angleOf(side, dx, dy), v0, score });
            });
          });
        });
      });
      cands.sort((a, c) => c.score - a.score);
      cands.slice(0, cfg.top).forEach((c) => {
        cfg.powers.forEach((k) => {
          const v = Math.min(Phys.K.vMax, c.v0 * k);
          const power = Math.max(40, Math.min(1000, Math.round(((v - Phys.K.vMin) / (Phys.K.vMax - Phys.K.vMin)) * 1000)));
          const input = { x: c.x, angle: c.angle, power };
          consider(input, trialValue(st, seat, input, cfg) + c.score * 2);
        });
      });
      if (!best) {
        // Nothing lines up: a soft safety shot at the nearest man of ours (or anything).
        const x = spots[Math.floor(R() * spots.length)];
        const s = Phys.toBoard(side, x / 10, 0);
        let tgt = null;
        let bd = Infinity;
        pieces.forEach((m) => {
          if (myC && m.c !== myC && targets.length) return;
          const d = dist2(s[0], s[1], m.x / 100, m.y / 100);
          if (d < bd) {
            bd = d;
            tgt = m;
          }
        });
        const input = tgt ? { x, angle: angleOf(side, tgt.x / 100 - s[0], tgt.y / 100 - s[1]), power: 380 } : { x, angle: 0, power: 400 };
        consider(input, 0);
      }
    }
    const pick = best.input;
    if (o.noNoise) return pick;
    const angle = Math.max(-18000, Math.min(18000, Math.round(pick.angle + gauss(R) * cfg.noiseA)));
    const power = Math.max(30, Math.min(1000, Math.round(pick.power * (1 + gauss(R) * cfg.noiseP))));
    return { x: pick.x, angle, power };
  }

  /** Bot due placement: a legal spot as far from the offender's baseline pockets as possible. */
  function botPlace(st, rng) {
    const job = st.place[0];
    if (!job) return null;
    const b = st.board;
    const offenderSide = st.seats[st.turn] ? st.seats[st.turn].side : 0;
    const f = Phys.FORWARD[offenderSide & 3];
    let best = null;
    const grid = roomInside(b.pieces) ? placeGrid(true) : placeGrid(false);
    for (const [x, y] of grid) {
      const xh = Math.round(x * 100);
      const yh = Math.round(y * 100);
      if (!placeSpot(b.pieces, xh, yh).ok) continue;
      // Toward the offender's far side = farther from their easy cuts.
      const score = (x - C) * f[0] + (y - C) * f[1] + (typeof rng === 'function' ? rng() : 0) * 2;
      if (!best || score > best.score) best = { x: xh, y: yh, score };
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  // ---------------------------------------------------------------- views

  function hydrate(st) {
    if (!st) return st;
    st.seats = st.seats || [];
    st.scores = st.scores || [0, 0];
    st.boards = st.boards || [];
    st.place = st.place || [];
    st.log = st.log || [];
    st.log.forEach((e) => {
      e.before = e.before || [];
      e.pocketed = e.pocketed || [];
    });
    const b = st.board;
    if (b) {
      b.pieces = b.pieces || [];
      b.pocketed = b.pocketed || {};
      ['w', 'b', 'q'].forEach((c) => (b.pocketed[c] = b.pocketed[c] || []));
      b.ever = b.ever || { w: false, b: false };
      b.due = Object.assign({ w: 0, b: 0 }, b.due || {});
      b.queen = b.queen || { s: 'board', by: null };
      if (b.queen.by === undefined) b.queen.by = null;
      b.colors = b.colors || { 0: 'w', 1: 'b' };
      b.pts = b.pts || [0, 0];
      if (b.fp || st.variant === 'freestyle') b.fp = [(b.fp && b.fp[0]) || [], (b.fp && b.fp[1]) || []];
      if (b.best) b.best.before = b.best.before || [];
    }
    return st;
  }

  function seatOfUid(st, uid) {
    return (st.seats || []).findIndex((s) => s.id === uid);
  }

  return {
    VARIANTS,
    LEVELS,
    GAME_POINTS,
    GAME_BOARDS,
    QUEEN_PTS,
    QUEEN_CUTOFF,
    BOARD_MAX,
    BREAK_TRIES,
    FREE_PTS,
    FREE_TARGET,
    SHOT_MS,
    PLACE_MS,
    OUTER_R,
    CENTRE_R,
    BASE_CIRCLE_U,
    BASE_CIRCLE_R,
    U_LIMIT,
    COLOR_NAME,
    formation,
    strikerSpot,
    legalSpots,
    nearestLegal,
    placeSpot,
    queenSpot,
    newGame,
    newBoard,
    shoot,
    applyStroke,
    nextBoard,
    placeMan,
    forgo,
    timeoutFoul,
    forfeit,
    botShot,
    botPlace,
    trialValue,
    hydrate,
    seatOfUid,
    teamName,
    teamColor,
    menLeft,
    queenValue,
  };
});
