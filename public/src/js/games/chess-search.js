/**
 * ChessSearch — Chaupaal's own chess engine (no third-party engine code, same licence as the app).
 * Iterative deepening PVS alpha-beta, transposition table, quiescence, killers + history,
 * null-move pruning, late-move reductions, tapered PST evaluation.
 * Runs inside chess-worker.js (lazy-loaded); a shallow main-thread call is the low-end fallback.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./chess-core.js'));
  else root.ChessSearch = factory(root.ChessCore);
})(typeof self !== 'undefined' ? self : this, function (Core) {
  'use strict';

  const { P, N, B, R, Q, K } = Core.PIECES;
  const { F_CASTLE, F_EP } = Core.FLAGS;
  const INF = 32000;
  const MATE = 30000;
  const MG_VAL = [0, 82, 337, 365, 477, 1025, 0];
  const EG_VAL = [0, 94, 281, 297, 512, 936, 0];
  const SEE_VAL = [0, 100, 320, 330, 500, 900, 20000];
  const PHASE_W = [0, 0, 1, 1, 2, 4, 0];

  // Tables are written rank 8 → rank 1 (white's view).
  const PST_P = [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0];
  const PST_N = [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50];
  const PST_B = [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20];
  const PST_R = [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0];
  const PST_Q = [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20];
  const PST_KM = [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20];
  const PST_KE = [-50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30, -30,-10,20,30,30,20,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30, -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50];
  const PASSED_EG = [0, 10, 15, 25, 45, 75, 120, 0];
  const MG_PST = [null, PST_P, PST_N, PST_B, PST_R, PST_Q, PST_KM];
  const EG_PST = [null, PST_P, PST_N, PST_B, PST_R, PST_Q, PST_KE];

  const DEFAULT_STYLE = { kingAttack: 3, shelter: 6, mobility: 0 };

  /** Static evaluation from the side to move's point of view (centipawns). */
  function evaluate(pos, style) {
    const st = style || DEFAULT_STYLE;
    const b = pos.b;
    let mg = 0, eg = 0, phase = 0;
    const pawnFiles = [new Int8Array(8), new Int8Array(8)];
    const bishops = [0, 0];
    for (let s = 0; s < 64; s++) {
      const p = b[s];
      if (p && (p & 7) === P) pawnFiles[p >> 3][s & 7]++;
    }
    const wk = pos.kings[0], bk = pos.kings[1];
    for (let s = 0; s < 64; s++) {
      const p = b[s];
      if (!p) continue;
      const t = p & 7, c = p >> 3;
      const f = s & 7, r = s >> 3;
      const idx = c === 0 ? (7 - r) * 8 + f : r * 8 + f;
      const sign = c === 0 ? 1 : -1;
      let m = MG_VAL[t] + MG_PST[t][idx];
      let e = EG_VAL[t] + EG_PST[t][idx];
      phase += PHASE_W[t];
      if (t === P) {
        if (pawnFiles[c][f] > 1) {
          m -= 8;
          e -= 12;
        }
        const isoL = f === 0 || !pawnFiles[c][f - 1];
        const isoR = f === 7 || !pawnFiles[c][f + 1];
        if (isoL && isoR) {
          m -= 10;
          e -= 8;
        }
        // Passed pawn: no enemy pawns ahead on this or adjacent files.
        let passed = true;
        const dir = c === 0 ? 1 : -1;
        for (let rr = r + dir; rr >= 0 && rr < 8 && passed; rr += dir) {
          for (let ff = Math.max(0, f - 1); ff <= Math.min(7, f + 1); ff++) {
            if (b[rr * 8 + ff] === (P | ((c ^ 1) << 3))) {
              passed = false;
              break;
            }
          }
        }
        if (passed) {
          const adv = c === 0 ? r : 7 - r;
          e += PASSED_EG[adv];
          m += PASSED_EG[adv] >> 2;
        }
      } else if (t === B) bishops[c]++;
      else if (t === R) {
        if (!pawnFiles[c][f]) {
          m += pawnFiles[c ^ 1][f] ? 10 : 20;
          e += 10;
        }
      }
      if (t !== K && t !== P && st.kingAttack) {
        const ek = c === 0 ? bk : wk;
        const dist = Math.max(Math.abs((ek & 7) - f), Math.abs((ek >> 3) - r));
        if (dist <= 2) m += st.kingAttack * (3 - dist);
      }
      mg += sign * m;
      eg += sign * e;
    }
    if (bishops[0] >= 2) {
      mg += 30;
      eg += 45;
    }
    if (bishops[1] >= 2) {
      mg -= 30;
      eg -= 45;
    }
    // Pawn shelter in front of a castled-ish king (middlegame only).
    if (st.shelter) {
      for (let c = 0; c < 2; c++) {
        const ks = pos.kings[c];
        const kf = ks & 7, kr = ks >> 3;
        const home = c === 0 ? kr <= 1 : kr >= 6;
        if (!home) continue;
        const dir = c === 0 ? 8 : -8;
        let shield = 0;
        for (let ff = Math.max(0, kf - 1); ff <= Math.min(7, kf + 1); ff++) {
          const s1 = ks - kf + ff + dir;
          if (s1 >= 0 && s1 < 64 && b[s1] === (P | (c << 3))) shield += 2;
          else if (s1 + dir >= 0 && s1 + dir < 64 && b[s1 + dir] === (P | (c << 3))) shield += 1;
        }
        mg += (c === 0 ? 1 : -1) * shield * st.shelter;
      }
    }
    if (phase > 24) phase = 24;
    const score = Math.round((mg * phase + eg * (24 - phase)) / 24);
    return (pos.side === 0 ? score : -score) + 10;
  }

  function encode(m) {
    return m.from | (m.to << 6) | (m.promo << 12) | ((m.flag === F_CASTLE ? 1 : 0) << 15);
  }

  function hasNonPawn(pos, side) {
    const b = pos.b;
    for (let s = 0; s < 64; s++) {
      const p = b[s];
      if (p && p >> 3 === side) {
        const t = p & 7;
        if (t !== P && t !== K) return true;
      }
    }
    return false;
  }

  function Searcher(opts) {
    const o = opts || {};
    this.ttBits = o.ttBits || 18;
    const size = 1 << this.ttBits;
    this.ttMask = size - 1;
    this.ttKey = new Int32Array(size);
    this.ttMove = new Int32Array(size);
    this.ttScore = new Int16Array(size);
    this.ttDepth = new Int8Array(size);
    this.ttFlag = new Int8Array(size);
    this.history = new Int32Array(16 * 64);
    this.killers = [];
    this.style = o.style || DEFAULT_STYLE;
  }

  Searcher.prototype.clear = function () {
    this.ttKey.fill(0);
    this.ttFlag.fill(0);
    this.history.fill(0);
  };

  Searcher.prototype.ttProbe = function (pos) {
    const i = pos.lo & this.ttMask;
    if (this.ttFlag[i] && this.ttKey[i] === pos.hi) return i;
    return -1;
  };

  Searcher.prototype.ttStore = function (pos, depth, score, flag, move) {
    const i = pos.lo & this.ttMask;
    if (this.ttFlag[i] && this.ttKey[i] === pos.hi && this.ttDepth[i] > depth && flag !== 1) return;
    this.ttKey[i] = pos.hi;
    this.ttDepth[i] = depth;
    this.ttScore[i] = score;
    this.ttFlag[i] = flag; // 1 exact, 2 lower, 3 upper
    this.ttMove[i] = move;
  };

  Searcher.prototype.orderMoves = function (moves, ttMove, ply) {
    const k = this.killers[ply] || [];
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      let s = 0;
      const e = encode(m);
      if (e === ttMove) s = 1e7;
      else if (m.cap) s = 1e6 + SEE_VAL[m.cap & 7] * 10 - SEE_VAL[m.p & 7] / 10;
      else if (m.promo) s = 9e5 + m.promo;
      else if (e === k[0]) s = 8e5;
      else if (e === k[1]) s = 7e5;
      else s = this.history[m.p * 64 + m.to];
      m._s = s;
    }
    moves.sort((a, b) => b._s - a._s);
  };

  Searcher.prototype.isRepetition = function (pos) {
    const st = pos.stack;
    const lim = Math.min(st.length, pos.half);
    for (let i = st.length - 2; i >= st.length - lim && i >= 0; i -= 2) {
      if (st[i].lo === pos.lo && st[i].hi === pos.hi) return true;
    }
    return false;
  };

  Searcher.prototype.timeUp = function () {
    if ((++this.nodes & 1023) === 0) {
      if (this.deadline && Date.now() > this.deadline) this.stop = true;
      if (this.nodeLimit && this.nodes > this.nodeLimit) this.stop = true;
    }
    return this.stop;
  };

  Searcher.prototype.quiesce = function (pos, alpha, beta, ply) {
    if (this.timeUp()) return 0;
    const stand = evaluate(pos, this.style);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    if (ply > 60) return stand;
    const moves = pos.genPseudo(true);
    this.orderMoves(moves, -1, ply);
    const us = pos.side;
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      // Delta pruning: skip captures that cannot raise alpha even with a margin.
      if (!m.promo && stand + SEE_VAL[m.cap & 7] + 200 < alpha) continue;
      pos.make(m);
      if (pos.isAttacked(pos.kings[us], us ^ 1)) {
        pos.unmake();
        continue;
      }
      const sc = -this.quiesce(pos, -beta, -alpha, ply + 1);
      pos.unmake();
      if (this.stop) return 0;
      if (sc >= beta) return beta;
      if (sc > alpha) alpha = sc;
    }
    return alpha;
  };

  Searcher.prototype.negamax = function (pos, depth, alpha, beta, ply, allowNull) {
    if (this.timeUp()) return 0;
    const us = pos.side;
    const inCheck = pos.isAttacked(pos.kings[us], us ^ 1);
    if (ply > 0) {
      if (pos.half >= 100 || this.isRepetition(pos)) return 0;
      if (Core.insufficientMaterial(pos.b)) return 0;
      // Mate distance pruning
      alpha = Math.max(alpha, -MATE + ply);
      beta = Math.min(beta, MATE - ply - 1);
      if (alpha >= beta) return alpha;
    }
    if (inCheck) depth += 1;
    if (depth <= 0) return this.quiesce(pos, alpha, beta, ply);
    const pvNode = beta - alpha > 1;
    const ti = this.ttProbe(pos);
    let ttMove = -1;
    if (ti >= 0) {
      ttMove = this.ttMove[ti];
      if (!pvNode && ply > 0 && this.ttDepth[ti] >= depth) {
        let s = this.ttScore[ti];
        if (s > MATE - 200) s -= ply;
        else if (s < -MATE + 200) s += ply;
        const f = this.ttFlag[ti];
        if (f === 1 || (f === 2 && s >= beta) || (f === 3 && s <= alpha)) return s;
      }
    }
    if (allowNull && !pvNode && !inCheck && depth >= 3 && ply > 0 && hasNonPawn(pos, us)) {
      if (evaluate(pos, this.style) >= beta) {
        pos.makeNull();
        const sc = -this.negamax(pos, depth - 3, -beta, -beta + 1, ply + 1, false);
        pos.unmakeNull();
        if (this.stop) return 0;
        if (sc >= beta) return beta;
      }
    }
    const moves = pos.genPseudo(false);
    this.orderMoves(moves, ttMove, ply);
    let best = -INF, bestMove = 0, legal = 0;
    const alpha0 = alpha;
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      pos.make(m);
      if (pos.isAttacked(pos.kings[us], us ^ 1)) {
        pos.unmake();
        continue;
      }
      legal++;
      const givesCheck = pos.isAttacked(pos.kings[us ^ 1], us);
      let sc;
      if (legal === 1) sc = -this.negamax(pos, depth - 1, -beta, -alpha, ply + 1, true);
      else {
        let red = 0;
        if (depth >= 3 && legal > 3 && !m.cap && !m.promo && !inCheck && !givesCheck) red = legal > 8 ? 2 : 1;
        sc = -this.negamax(pos, depth - 1 - red, -alpha - 1, -alpha, ply + 1, true);
        if (sc > alpha && red) sc = -this.negamax(pos, depth - 1, -alpha - 1, -alpha, ply + 1, true);
        if (sc > alpha && sc < beta) sc = -this.negamax(pos, depth - 1, -beta, -alpha, ply + 1, true);
      }
      pos.unmake();
      if (this.stop) return 0;
      if (sc > best) {
        best = sc;
        bestMove = encode(m);
        if (ply === 0) this.rootBest = m;
      }
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) {
        if (!m.cap) {
          const k = this.killers[ply] || (this.killers[ply] = [0, 0]);
          if (k[0] !== bestMove) {
            k[1] = k[0];
            k[0] = bestMove;
          }
          this.history[m.p * 64 + m.to] += depth * depth;
        }
        break;
      }
    }
    if (!legal) return inCheck ? -MATE + ply : 0;
    let store = best;
    if (store > MATE - 200) store += ply;
    else if (store < -MATE + 200) store -= ply;
    this.ttStore(pos, depth, store, best >= beta ? 2 : best > alpha0 ? 1 : 3, bestMove);
    return best;
  };

  Searcher.prototype.pvLine = function (pos, max) {
    const line = [];
    const made = [];
    for (let i = 0; i < max; i++) {
      const ti = this.ttProbe(pos);
      if (ti < 0) break;
      const code = this.ttMove[ti];
      const m = pos.legalMoves().find((x) => encode(x) === code);
      if (!m) break;
      line.push(m);
      pos.make(m);
      made.push(m);
    }
    for (let i = 0; i < made.length; i++) pos.unmake();
    return line;
  };

  /**
   * Iterative deepening search.
   * @returns {{ move, score, depth, pv, nodes, mate }}
   */
  Searcher.prototype.search = function (pos, opts) {
    const o = opts || {};
    const maxDepth = Math.max(1, Math.min(64, o.depth || 64));
    this.deadline = o.timeMs ? Date.now() + o.timeMs : 0;
    this.nodeLimit = o.nodes || 0;
    this.nodes = 0;
    this.stop = false;
    this.killers = [];
    let result = null;
    const legalRoot = pos.legalMoves();
    if (!legalRoot.length) return { move: null, score: pos.inCheck() ? -MATE : 0, depth: 0, pv: [], nodes: 0 };
    for (let d = 1; d <= maxDepth; d++) {
      this.rootBest = null;
      const sc = this.negamax(pos, d, -INF, INF, 0, false);
      if (this.stop && d > 1) break;
      const move = this.rootBest || legalRoot[0];
      result = { move, score: sc, depth: d, nodes: this.nodes };
      if (Math.abs(sc) > MATE - 100) break;
      if (this.stop) break;
    }
    result.pv = this.pvLine(pos, 12);
    if (!result.pv.length || encode(result.pv[0]) !== encode(result.move)) result.pv = [result.move];
    result.nodes = this.nodes;
    result.mate = mateIn(result.score);
    return result;
  };

  /** Score every legal root move with a full-window search to `depth` (used by the bots). */
  Searcher.prototype.rootScores = function (pos, depth, opts) {
    const o = opts || {};
    this.deadline = o.timeMs ? Date.now() + o.timeMs : 0;
    this.nodeLimit = o.nodes || 0;
    this.nodes = 0;
    this.stop = false;
    const us = pos.side;
    const out = [];
    for (const m of pos.legalMoves()) {
      pos.make(m);
      const givesCheck = pos.isAttacked(pos.kings[us ^ 1], us);
      const sc = -this.negamax(pos, Math.max(0, depth - 1), -INF, INF, 1, true);
      pos.unmake();
      out.push({ move: m, score: this.stop ? -INF : sc, check: givesCheck });
      if (this.stop) break;
    }
    return out;
  };

  function mateIn(score) {
    if (score > MATE - 200) return Math.ceil((MATE - score) / 2);
    if (score < -MATE + 200) return -Math.ceil((MATE + score) / 2);
    return 0;
  }

  // ---------- bots ----------
  /** Approximate strength is an honest estimate from self-play spacing — not a FIDE rating. */
  const LEVELS = [
    { level: 1, approx: 400, depth: 1, temp: 350, blunder: 0.25, thinkMs: 500 },
    { level: 2, approx: 700, depth: 1, temp: 180, blunder: 0.12, thinkMs: 600 },
    { level: 3, approx: 1000, depth: 2, temp: 90, blunder: 0.06, thinkMs: 700 },
    { level: 4, approx: 1200, depth: 2, temp: 50, blunder: 0.03, thinkMs: 800 },
    { level: 5, approx: 1400, depth: 3, temp: 28, blunder: 0.015, thinkMs: 900 },
    { level: 6, approx: 1600, depth: 4, temp: 14, blunder: 0, thinkMs: 1000 },
    { level: 7, approx: 1800, depth: 8, temp: 0, blunder: 0, timeMs: 900 },
    { level: 8, approx: 2000, depth: 14, temp: 0, blunder: 0, timeMs: 2200 },
  ];

  /** Style parameters only — personas never change rules or honesty labels. */
  const PERSONAS = {
    aggressive: { label: 'Aggressive', checkBonus: 25, captureBonus: 20, quietPenalty: 0, tempMul: 1, style: { kingAttack: 7, shelter: 4 } },
    solid: { label: 'Solid', checkBonus: 0, captureBonus: 5, quietPenalty: 0, tempMul: 0.7, style: { kingAttack: 2, shelter: 10 } },
    tricky: { label: 'Tricky', checkBonus: 30, captureBonus: 10, quietPenalty: 0, tempMul: 1.2, style: { kingAttack: 5, shelter: 6 } },
    friendly: { label: 'Friendly', checkBonus: 0, captureBonus: 0, quietPenalty: 0, tempMul: 1.5, style: { kingAttack: 2, shelter: 6 } },
  };

  function levelInfo(level) {
    const n = Math.max(1, Math.min(LEVELS.length, Number(level) || 3));
    return LEVELS[n - 1];
  }

  /**
   * Pick a bot move. `rng` makes it deterministic in tests.
   * @returns {{ move, score, depth, pv }}
   */
  function botMove(pos, opts) {
    const o = opts || {};
    const L = levelInfo(o.level);
    const persona = PERSONAS[o.persona] || null;
    const rng = o.rng || Math.random;
    const searcher = o.searcher || new Searcher({ ttBits: 16, style: persona ? Object.assign({}, DEFAULT_STYLE, persona.style) : DEFAULT_STYLE });
    searcher.style = persona ? Object.assign({}, DEFAULT_STYLE, persona.style) : DEFAULT_STYLE;
    if (!L.temp) {
      const r = searcher.search(pos, { depth: L.depth, timeMs: o.timeMs || L.timeMs });
      return r;
    }
    const scores = searcher.rootScores(pos, L.depth, { timeMs: 4000 }).filter((x) => x.score > -INF);
    if (!scores.length) return searcher.search(pos, { depth: 1 });
    for (const s of scores) {
      if (persona) {
        if (s.check) s.score += persona.checkBonus;
        if (s.move.cap) s.score += persona.captureBonus;
      }
    }
    let temp = L.temp * (persona ? persona.tempMul : 1);
    if (rng() < L.blunder) temp *= 3;
    const best = Math.max(...scores.map((s) => s.score));
    // Never miss a forced mate in one at any level above 1.
    if (L.level > 1 && best > MATE - 5) {
      const mate = scores.find((s) => s.score === best);
      return { move: mate.move, score: best, depth: L.depth, pv: [mate.move] };
    }
    const weights = scores.map((s) => Math.exp(Math.max(-20, (Math.max(-2500, s.score) - best) / temp)));
    const total = weights.reduce((a, b) => a + b, 0);
    let x = rng() * total;
    let pick = scores[0];
    for (let i = 0; i < scores.length; i++) {
      x -= weights[i];
      if (x <= 0) {
        pick = scores[i];
        break;
      }
    }
    return { move: pick.move, score: pick.score, depth: L.depth, pv: [pick.move] };
  }

  return {
    INF,
    MATE,
    evaluate,
    Searcher,
    LEVELS,
    PERSONAS,
    levelInfo,
    botMove,
    mateIn,
    encode,
  };
});
