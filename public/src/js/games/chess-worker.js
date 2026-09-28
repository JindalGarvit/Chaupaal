/* Chess engine worker — loads ChessCore + ChessSearch on demand (URLs arrive in the init message). */
'use strict';
let searcher = null;
let ready = false;

function uciOf(pos, m) {
  return self.ChessCore.uciOf(pos, m);
}

function position(msg) {
  const Core = self.ChessCore;
  const g = new Core.Game({ fen: msg.startFen || Core.START_FEN, chess960: !!msg.chess960 });
  // Played moves stay on the make() stack so the search sees repetitions.
  for (const u of msg.moves || []) {
    const m = g.findMove(u);
    if (!m) break;
    g.pos.make(m);
  }
  return g.pos;
}

function describe(pos, r) {
  return {
    move: r.move ? uciOf(pos, r.move) : null,
    score: r.score,
    mate: self.ChessSearch.mateIn(r.score),
    depth: r.depth,
    pv: (r.pv || []).map((m) => uciOf(pos, m)),
    nodes: r.nodes || 0,
  };
}

self.onmessage = function (e) {
  const msg = e.data || {};
  try {
    if (msg.type === 'init') {
      if (!ready) {
        importScripts.apply(self, msg.urls || []);
        searcher = new self.ChessSearch.Searcher({ ttBits: 20 });
        ready = true;
      }
      self.postMessage({ id: msg.id, ok: true });
      return;
    }
    if (!ready) throw new Error('not_ready');
    if (msg.type === 'bot') {
      const pos = position(msg);
      const r = self.ChessSearch.botMove(pos, { level: msg.level, persona: msg.persona, searcher });
      self.postMessage({ id: msg.id, ok: true, result: describe(pos, r) });
      return;
    }
    if (msg.type === 'analyse') {
      const pos = position(msg);
      searcher.style = null;
      const r = searcher.search(pos, { depth: msg.depth || 64, timeMs: msg.timeMs || 800 });
      self.postMessage({ id: msg.id, ok: true, result: describe(pos, r) });
      return;
    }
    if (msg.type === 'review') {
      // Analyse every position of a finished game; progress is streamed back.
      const Core = self.ChessCore;
      const g = new Core.Game({ fen: msg.startFen || Core.START_FEN, chess960: !!msg.chess960 });
      const out = [];
      const per = Math.max(80, Math.min(1500, msg.perMoveMs || 350));
      const moves = msg.moves || [];
      for (let i = 0; i <= moves.length; i++) {
        if (g.outcome()) {
          out.push({ score: g.isCheckmate() ? -self.ChessSearch.MATE : 0, mate: 0, best: '', pv: [] });
        } else {
          const r = searcher.search(g.pos, { depth: msg.depth || 64, timeMs: per });
          out.push(describe(g.pos, r));
        }
        self.postMessage({ id: msg.id, progress: (i + 1) / (moves.length + 1) });
        if (i < moves.length && !g.move(moves[i])) break;
      }
      self.postMessage({ id: msg.id, ok: true, result: out });
      return;
    }
    throw new Error('bad_type');
  } catch (err) {
    self.postMessage({ id: msg.id, ok: false, error: String((err && err.message) || err) });
  }
};
