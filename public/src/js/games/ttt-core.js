/**
 * TttCore — Classic 3×3 and Ultimate (9×9) Tic-Tac-Toe rules + bots. Unrated everywhere.
 * UMD: client play, party-room server adapter and tests share this file.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TttCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  const CLASSIC_LEVELS = ['easy', 'medium', 'unbeatable'];
  const ULTIMATE_LEVELS = ['easy', 'normal', 'hard'];
  const MCTS_ITERS = { easy: 60, normal: 700, hard: 2600 };

  /** 'X' | 'O' | 'D' (draw) | null for a 9-cell array of 'X' | 'O' | '' */
  function winnerOf(cells) {
    for (const [a, b, c] of LINES) {
      const v = cells[a];
      if (v && v !== 'D' && v === cells[b] && v === cells[c]) return v;
    }
    for (let i = 0; i < 9; i++) if (!cells[i]) return null;
    return 'D';
  }

  function winLine(cells) {
    for (const ln of LINES) {
      const v = cells[ln[0]];
      if (v && v !== 'D' && v === cells[ln[1]] && v === cells[ln[2]]) return ln.slice();
    }
    return null;
  }

  function other(p) {
    return p === 'X' ? 'O' : 'X';
  }

  // ---------- Classic ----------

  const memo = new Map();
  /** Score from the perspective of `toMove`: +1 win, 0 draw, -1 loss (with depth tie-breaks). */
  function negamax(cells, toMove) {
    const key = cells.map((c) => c || '-').join('') + toMove;
    if (memo.has(key)) return memo.get(key);
    const w = winnerOf(cells);
    let best;
    if (w === 'D') best = 0;
    else if (w) best = w === toMove ? 10 : -10;
    else {
      best = -Infinity;
      for (let i = 0; i < 9; i++) {
        if (cells[i]) continue;
        cells[i] = toMove;
        const s = -negamax(cells, other(toMove));
        cells[i] = '';
        const adj = s > 0 ? s - 1 : s < 0 ? s + 1 : 0;
        if (adj > best) best = adj;
      }
    }
    memo.set(key, best);
    return best;
  }

  function perfectMoves(cells, toMove) {
    const c = cells.slice();
    let best = -Infinity;
    let moves = [];
    for (let i = 0; i < 9; i++) {
      if (c[i]) continue;
      c[i] = toMove;
      const s = -negamax(c, other(toMove));
      c[i] = '';
      const adj = s > 0 ? s - 1 : s < 0 ? s + 1 : 0;
      if (adj > best) {
        best = adj;
        moves = [i];
      } else if (adj === best) moves.push(i);
    }
    return moves;
  }

  function classicBot(cells, toMove, level, rng) {
    const r = typeof rng === 'function' ? rng : Math.random;
    const empty = [];
    for (let i = 0; i < 9; i++) if (!cells[i]) empty.push(i);
    if (!empty.length) return -1;
    const pick = (arr) => arr[Math.floor(r() * arr.length)];
    if (level === 'easy') {
      const wins = empty.filter((i) => {
        const c = cells.slice();
        c[i] = toMove;
        return winnerOf(c) === toMove;
      });
      if (wins.length && r() < 0.5) return wins[0];
      return pick(empty);
    }
    if (level === 'medium') {
      if (r() < 0.25) return pick(empty);
      return pick(perfectMoves(cells, toMove));
    }
    return pick(perfectMoves(cells, toMove));
  }

  // ---------- Ultimate ----------

  function newUltimate() {
    return { cells: Array(81).fill(''), small: Array(9).fill(''), next: -1, turn: 'X', winner: null, last: -1, moves: 0 };
  }

  function smallCells(u, b) {
    return u.cells.slice(b * 9, b * 9 + 9);
  }

  function ultimateLegal(u) {
    if (u.winner) return [];
    const boards = u.next >= 0 && !u.small[u.next] ? [u.next] : [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((b) => !u.small[b]);
    const out = [];
    boards.forEach((b) => {
      for (let k = 0; k < 9; k++) if (!u.cells[b * 9 + k]) out.push(b * 9 + k);
    });
    return out;
  }

  /** Big-board winner: drawn small boards ('D') count for nobody. */
  function ultimateWinner(small) {
    for (const [a, b, c] of LINES) {
      const v = small[a];
      if (v && v !== 'D' && v === small[b] && v === small[c]) return v;
    }
    return small.every((v) => !!v) ? 'D' : null;
  }

  function ultimatePlay(u, idx) {
    if (u.winner) return { error: 'over' };
    if (ultimateLegal(u).indexOf(idx) < 0) return { error: 'illegal' };
    const b = Math.floor(idx / 9);
    const k = idx % 9;
    u.cells[idx] = u.turn;
    const sw = winnerOf(smallCells(u, b));
    if (sw) u.small[b] = sw;
    u.winner = ultimateWinner(u.small);
    u.next = u.small[k] ? -1 : k;
    u.turn = other(u.turn);
    u.last = idx;
    u.moves += 1;
    return { ok: true, smallWon: sw || null };
  }

  function cloneU(u) {
    return { cells: u.cells.slice(), small: u.small.slice(), next: u.next, turn: u.turn, winner: u.winner, last: u.last, moves: u.moves };
  }

  function rolloutPolicy(u, r) {
    const legal = ultimateLegal(u);
    const me = u.turn;
    for (const idx of legal) {
      const b = Math.floor(idx / 9);
      const c = smallCells(u, b);
      c[idx % 9] = me;
      if (winnerOf(c) === me) return idx;
    }
    return legal[Math.floor(r() * legal.length)];
  }

  function ultimateBot(u, level, rng) {
    const r = typeof rng === 'function' ? rng : Math.random;
    const legal = ultimateLegal(u);
    if (!legal.length) return -1;
    if (legal.length === 1) return legal[0];
    const iters = MCTS_ITERS[level] || MCTS_ITERS.normal;
    const me = u.turn;
    const root = { move: -1, parent: null, kids: null, untried: legal.slice(), n: 0, w: 0, player: other(me) };
    for (let it = 0; it < iters; it++) {
      let node = root;
      const s = cloneU(u);
      while (node.untried.length === 0 && node.kids && node.kids.length) {
        let best = null;
        let bestV = -Infinity;
        const ln = Math.log(node.n);
        for (const ch of node.kids) {
          const v = ch.w / ch.n + 1.2 * Math.sqrt(ln / ch.n);
          if (v > bestV) {
            bestV = v;
            best = ch;
          }
        }
        node = best;
        ultimatePlay(s, node.move);
      }
      if (node.untried.length && !s.winner) {
        const i = Math.floor(r() * node.untried.length);
        const mv = node.untried.splice(i, 1)[0];
        const mover = s.turn;
        ultimatePlay(s, mv);
        const ch = { move: mv, parent: node, kids: null, untried: ultimateLegal(s), n: 0, w: 0, player: mover };
        (node.kids = node.kids || []).push(ch);
        node = ch;
      }
      let guard = 0;
      while (!s.winner && guard++ < 90) {
        const mv = rolloutPolicy(s, r);
        if (mv == null || mv < 0) break;
        ultimatePlay(s, mv);
      }
      const res = s.winner;
      while (node) {
        node.n += 1;
        if (res === 'D' || !res) node.w += 0.5;
        else if (res === node.player) node.w += 1;
        node = node.parent;
      }
    }
    let best = legal[0];
    let bestN = -1;
    (root.kids || []).forEach((ch) => {
      if (ch.n > bestN) {
        bestN = ch.n;
        best = ch.move;
      }
    });
    if (level === 'easy' && r() < 0.3) return legal[Math.floor(r() * legal.length)];
    return best;
  }

  // ---------- Match state (shared by Pass & Play, bots and Live) ----------

  function newMatch(mode, players) {
    const m = mode === 'ultimate' ? 'ultimate' : 'classic';
    const p = (players || []).slice(0, 2);
    const st = { game: 'ttt', v: 1, mode: m, seats: p.map((x, i) => ({ id: String(x.id), name: String(x.name || 'Player').slice(0, 32), mark: i === 0 ? 'X' : 'O', bot: !!x.bot, level: x.level || '', afk: 0 })), over: false, winner: null, result: null, seq: 0 };
    if (m === 'classic') {
      st.cells = Array(9).fill('');
      st.turn = 'X';
      st.last = -1;
    } else Object.assign(st, newUltimate());
    return st;
  }

  function hydrate(st) {
    if (!st) return st;
    const arr = (v, n) => {
      const out = Array(n).fill('');
      if (Array.isArray(v)) v.forEach((x, i) => (out[i] = x || ''));
      else if (v && typeof v === 'object') Object.keys(v).forEach((k) => (out[Number(k)] = v[k] || ''));
      return out;
    };
    const seats = Array.isArray(st.seats) ? st.seats : st.seats ? Object.keys(st.seats).sort().map((k) => st.seats[k]) : [];
    st.seats = seats;
    if (st.mode === 'ultimate') {
      st.cells = arr(st.cells, 81);
      st.small = arr(st.small, 9);
      if (st.next == null) st.next = -1;
    } else st.cells = arr(st.cells, 9);
    st.over = !!st.over;
    return st;
  }

  function legalMoves(st) {
    if (st.over) return [];
    if (st.mode === 'ultimate') return ultimateLegal(st);
    const out = [];
    for (let i = 0; i < 9; i++) if (!st.cells[i]) out.push(i);
    return out;
  }

  function seatOfMark(st, mark) {
    return st.seats.findIndex((s) => s.mark === mark);
  }

  function play(st, idx) {
    if (st.over) return { error: 'over' };
    const i = Number(idx);
    if (legalMoves(st).indexOf(i) < 0) return { error: 'illegal' };
    let w;
    if (st.mode === 'ultimate') {
      ultimatePlay(st, i);
      w = st.winner;
    } else {
      st.cells[i] = st.turn;
      st.turn = other(st.turn);
      st.last = i;
      w = winnerOf(st.cells);
    }
    st.seq += 1;
    if (w) {
      st.over = true;
      st.winner = w;
      st.result = w === 'D' ? 'draw' : 'win';
    }
    return { ok: true };
  }

  function forfeit(st, seatIdx, reason) {
    if (st.over) return false;
    const loser = st.seats[seatIdx];
    if (!loser) return false;
    st.over = true;
    st.winner = other(loser.mark);
    st.result = reason || 'forfeit';
    st.seq += 1;
    return true;
  }

  function botMove(st, level, rng) {
    if (st.mode === 'ultimate') return ultimateBot(st, level, rng);
    return classicBot(st.cells, st.turn, level, rng);
  }

  return {
    LINES,
    CLASSIC_LEVELS,
    ULTIMATE_LEVELS,
    winnerOf,
    winLine,
    other,
    perfectMoves,
    classicBot,
    newUltimate,
    ultimateLegal,
    ultimateWinner,
    ultimatePlay,
    ultimateBot,
    newMatch,
    hydrate,
    legalMoves,
    seatOfMark,
    play,
    forfeit,
    botMove,
  };
});
