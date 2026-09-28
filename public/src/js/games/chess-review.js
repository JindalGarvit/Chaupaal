/**
 * ChessReview — game review from engine analysis (no network).
 *
 * Win% (from centipawns):  W(cp) = 50 + 50 · (2 / (1 + e^(−0.00368208·cp)) − 1)
 * Expected-points loss of a move = W(best before) − W(after played), mover's view, 0…1.
 * Classification thresholds (expected points lost):
 *   best        engine's top move, or ≤ 0.01
 *   good        ≤ 0.05
 *   inaccuracy  ≤ 0.10
 *   mistake     ≤ 0.20
 *   blunder     > 0.20
 * Move accuracy  = 103.1668 · e^(−0.04354 · loss%) − 3.1669, clamped 0–100; game accuracy = mean.
 * Brilliant flag = a best move that sacrifices material (N/B/R/Q left en prise) while not already winning.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./chess-core.js'));
  else root.ChessReview = factory(root.ChessCore);
})(typeof self !== 'undefined' ? self : this, function (Core) {
  'use strict';

  const MATE = 30000;
  const THRESHOLDS = { best: 0.01, good: 0.05, inaccuracy: 0.1, mistake: 0.2 };
  const LABELS = { best: 'Best', good: 'Good', inaccuracy: 'Inaccuracy', mistake: 'Mistake', blunder: 'Blunder' };
  const PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
  const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

  function toCp(a) {
    if (!a) return 0;
    if (a.mate) return a.mate > 0 ? 10000 - a.mate : -10000 - a.mate;
    const s = Number(a.score) || 0;
    if (s > MATE - 200) return 10000;
    if (s < -MATE + 200) return -10000;
    return Math.max(-10000, Math.min(10000, s));
  }

  function winPct(cp) {
    return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
  }

  function classify(loss, isTop) {
    if (isTop || loss <= THRESHOLDS.best) return 'best';
    if (loss <= THRESHOLDS.good) return 'good';
    if (loss <= THRESHOLDS.inaccuracy) return 'inaccuracy';
    if (loss <= THRESHOLDS.mistake) return 'mistake';
    return 'blunder';
  }

  function moveAccuracy(loss) {
    const diff = Math.max(0, loss * 100);
    return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * diff) - 3.1669));
  }

  function evalText(cpWhite) {
    if (cpWhite >= 9000) return 'White mates';
    if (cpWhite <= -9000) return 'Black mates';
    const v = (cpWhite / 100).toFixed(1);
    return cpWhite > 0 ? '+' + v : v;
  }

  function sanLine(fen, chess960, ucis, max) {
    const out = [];
    try {
      const g = new Core.Game({ fen, chess960 });
      for (const u of (ucis || []).slice(0, max || 6)) {
        const v = g.move(u);
        if (!v) break;
        out.push(v.san);
      }
    } catch (e) {}
    return out;
  }

  /** Did the move leave a minor/major piece en prise (a real sacrifice)? */
  function isSacrifice(afterFen, chess960, mv) {
    if (!mv || !VALUE[mv.piece] || mv.piece === 'p' || mv.piece === 'k' || mv.promotion) return false;
    const v = VALUE[mv.piece];
    if (mv.captured && VALUE[mv.captured] >= v) return false;
    const pos = new Core.Position().load(afterFen, { chess960 });
    const to = Core.sqIndex(mv.flags && /[kq]/.test(mv.flags) && mv.kingTo ? mv.kingTo : mv.to);
    if (to < 0) return false;
    const captures = pos.legalMoves().filter((m) => m.to === to && m.cap);
    if (!captures.length) return false;
    const minAttacker = Math.min(...captures.map((m) => VALUE[Core.TYPE_CHARS[m.p & 7]]));
    const defended = pos.isAttacked(to, pos.side ^ 1);
    return minAttacker < v || !defended;
  }

  /**
   * @param {object} input
   *   startFen, chess960, moves: [uci], analysis: [{ score, mate, best, pv: [uci] }] (length moves+1,
   *   each from the side-to-move's point of view for the position BEFORE that ply)
   */
  function buildReview(input) {
    const chess960 = !!input.chess960;
    const g = new Core.Game({ fen: input.startFen || Core.START_FEN, chess960 });
    const analysis = input.analysis || [];
    const plies = [];
    const graph = [];
    for (let i = 0; i < (input.moves || []).length; i++) {
      const before = g.fen();
      const turn = g.turn();
      const mv = g.move(input.moves[i]);
      if (!mv) break;
      plies.push({ i, before, after: g.fen(), color: turn, mv });
    }
    const final = g.outcome();
    const lastA = analysis[plies.length] || null;
    const endA = final && final.reason === 'checkmate' ? { score: -MATE, mate: 0 } : final ? { score: 0 } : lastA;

    const out = [];
    const acc = { w: [], b: [] };
    for (const p of plies) {
      const a = analysis[p.i] || {};
      const aNext = p.i + 1 === plies.length ? endA || {} : analysis[p.i + 1] || {};
      const cpBefore = toCp(a);
      const cpAfter = aNext.mate === 0 && aNext.score === -MATE ? 10000 : -toCp(aNext);
      const wBefore = winPct(cpBefore) / 100;
      const wAfter = winPct(cpAfter) / 100;
      const isTop = !!a.best && a.best === p.mv.lan;
      const loss = isTop ? 0 : Math.max(0, wBefore - wAfter);
      const cls = classify(loss, isTop);
      const accuracy = moveAccuracy(loss);
      acc[p.color].push(accuracy);
      const bestSan = a.best ? sanLine(p.before, chess960, [a.best], 1)[0] || '' : '';
      const pvSan = sanLine(p.before, chess960, a.pv && a.pv.length ? a.pv : a.best ? [a.best] : [], 6);
      const replyPv = sanLine(p.after, chess960, aNext.pv && aNext.pv.length ? aNext.pv : aNext.best ? [aNext.best] : [], 4);
      let replyMv = null;
      if (aNext.best) {
        try {
          const g2 = new Core.Game({ fen: p.after, chess960 });
          replyMv = g2.move(aNext.best);
        } catch (e) {}
      }
      const brilliant = cls === 'best' && wBefore < 0.9 && wAfter >= 0.5 && isSacrifice(p.after, chess960, p.mv);
      const whiteCp = p.color === 'w' ? cpAfter : -cpAfter;
      graph.push(whiteCp);
      out.push({
        ply: p.i,
        color: p.color,
        san: p.mv.san,
        uci: p.mv.lan,
        before: p.before,
        after: p.after,
        cls,
        label: LABELS[cls],
        loss: Math.round(loss * 1000) / 1000,
        accuracy: Math.round(accuracy * 10) / 10,
        brilliant,
        bestSan,
        bestUci: a.best || '',
        pvSan,
        replySan: replyMv ? replyMv.san : '',
        replyCaptured: replyMv && replyMv.captured ? replyMv.captured : '',
        replyPv,
        mateBefore: a.mate || 0,
        mateAfter: aNext.mate || 0,
        evalAfter: evalText(whiteCp),
        whiteCp,
      });
    }
    const mean = (xs) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);
    const counts = { w: {}, b: {} };
    for (const m of out) counts[m.color][m.cls] = (counts[m.color][m.cls] || 0) + 1;
    const keyMoments = out
      .filter((m) => m.brilliant || m.cls === 'blunder' || m.cls === 'mistake' || (m.mateBefore > 0 && m.cls !== 'best'))
      .sort((a, b) => Number(b.brilliant) - Number(a.brilliant) || b.loss - a.loss)
      .slice(0, 4)
      .sort((a, b) => a.ply - b.ply)
      .map((m) => ({ ply: m.ply, san: m.san, color: m.color, cls: m.cls, brilliant: m.brilliant, text: coachFallback(m).text }));
    return {
      moves: out,
      graph,
      accuracy: { w: mean(acc.w), b: mean(acc.b) },
      counts,
      keyMoments,
      brilliant: out.find((m) => m.brilliant) || null,
      thresholds: Object.assign({}, THRESHOLDS),
    };
  }

  /** Deterministic coach line from engine facts (works with AI off). */
  function coachFallback(m) {
    const tips = [];
    if (m.bestSan && m.cls !== 'best') tips.push('Engine line: ' + (m.pvSan.slice(0, 4).join(' ') || m.bestSan));
    tips.push('Evaluation after the move: ' + m.evalAfter);
    let text;
    if (m.brilliant) text = `Brilliant! ${m.san} gives up material and it is still the best move.`;
    else if (m.cls === 'best') {
      text = m.mateBefore > 0 ? `${m.san} keeps the forced mate going (mate in ${m.mateBefore}).` : `${m.san} is the engine's top choice.`;
    } else if (m.mateBefore > 0 && m.bestSan) {
      text = `Missed mate in ${m.mateBefore}: ${m.bestSan} wins by force.`;
    } else if (m.mateAfter > 0 && m.replySan) {
      text = `${m.san} allows mate in ${m.mateAfter} after ${m.replySan}.` + (m.bestSan ? ` ${m.bestSan} was safer.` : '');
    } else if ((m.cls === 'mistake' || m.cls === 'blunder') && m.replyCaptured && VALUE[m.replyCaptured] >= 3) {
      text = `This loses the ${PIECE_NAMES[m.replyCaptured]} after ${m.replySan}.` + (m.bestSan ? ` ${m.bestSan} was better.` : '');
    } else if (m.cls === 'good') {
      text = m.bestSan ? `${m.san} is fine; ${m.bestSan} was slightly better.` : `${m.san} is a good move.`;
    } else {
      text = `${LABELS[m.cls]}. ` + (m.bestSan ? `${m.bestSan} was stronger (${m.evalAfter} after this move).` : `Evaluation: ${m.evalAfter}.`);
    }
    return { text: text.slice(0, 280), tips: tips.slice(0, 3) };
  }

  /** Every SAN the review is allowed to mention for this move (engine output + the move itself). */
  function allowedMoves(m) {
    return [m.san, m.bestSan].concat(m.pvSan || [], m.replySan ? [m.replySan] : [], m.replyPv || []).filter(Boolean);
  }

  const SAN_RE = /\b(O-O-O|O-O|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h]x[a-h][1-8](?:=[QRBN])?|[a-h][1-8](?:=[QRBN])?)(?![\w])/g;
  function strip(s) {
    return String(s || '').replace(/[+#!?=]+/g, '');
  }

  /**
   * Validate LLM coach text: every move-like token must be one of the engine's moves;
   * bare squares must belong to one of those moves.
   */
  function validateCoachText(text, allowed) {
    const set = new Set((allowed || []).map(strip));
    const squares = new Set();
    for (const s of allowed || []) {
      const m = String(s).match(/[a-h][1-8]/g);
      if (m) m.forEach((q) => squares.add(q));
    }
    const bad = [];
    const src = String(text || '');
    let m;
    SAN_RE.lastIndex = 0;
    while ((m = SAN_RE.exec(src))) {
      const tok = strip(m[1]);
      if (set.has(tok)) continue;
      if (/^[a-h][1-8]$/.test(tok) && squares.has(tok)) continue;
      bad.push(m[1]);
    }
    return { ok: bad.length === 0, bad };
  }

  return {
    THRESHOLDS,
    LABELS,
    winPct,
    toCp,
    classify,
    moveAccuracy,
    buildReview,
    coachFallback,
    allowedMoves,
    validateCoachText,
    isSacrifice,
  };
});
