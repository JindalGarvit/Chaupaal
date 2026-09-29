/**
 * Kakuro — solo cross-sum puzzle. Internal id stays `ankjod` (saves, PBs, leaderboards);
 * `kakuro` is a permanent alias. Digits 1–9, no repeats in a run; each clue is the sum of its run.
 * Puzzles (Dangal P14): the verified bank in data/kakuro-bank.js — every puzzle has exactly one
 * solution and is graded by the techniques it needs (kakuro-core.js), numbered per difficulty,
 * plus one Daily per day (same for everyone) with an archive. The older built-in bank + generator
 * below stay as an offline fallback. Progress, Daily, leaderboards and share: solo-hub.js.
 */
(function () {
  'use strict';

  const DIFFS = [
    { id: 'easy', label: 'Easy', desc: 'Small grids · unique sums', emoji: '🌱' },
    { id: 'medium', label: 'Medium', desc: 'Crossing runs narrow it down', emoji: '🔥' },
    { id: 'hard', label: 'Hard', desc: 'Where can each digit go?', emoji: '💀' },
    { id: 'expert', label: 'Expert', desc: 'Big grids · “what if” eliminations', emoji: '🧠' },
    { id: 'daily', label: 'Daily', desc: 'One puzzle for everyone today', emoji: '📅' },
  ];
  const NUMBERED = ['easy', 'medium', 'hard', 'expert'];
  const GAME = 'ankjod';
  const Hub = () => window.SoloHub;
  const SC = () => window.SoloCore;
  const KB = () => window.KakuroBank;
  const KC = () => window.KakuroCore;
  const FB_KIND = { place: 'valid', win: 'win', invalid: 'invalid', valid: 'valid', select: 'select' };
  /** Sound / haptics through the solo settings toggles. */
  function fb(kind) {
    if (Hub()) Hub().feedback(GAME, FB_KIND[kind] || 'select');
    else if (typeof gameFeedback === 'function') gameFeedback(kind);
  }

  /** @type {Map<string, number[][]>} sum|len → combinations (sorted ascending) */
  const COMBO_CACHE = new Map();

  function combosFor(sum, len) {
    const key = sum + '|' + len;
    if (COMBO_CACHE.has(key)) return COMBO_CACHE.get(key);
    const out = [];
    function walk(start, left, rem, acc) {
      if (left === 0) {
        if (rem === 0) out.push(acc.slice());
        return;
      }
      for (let d = start; d <= 9; d++) {
        if (d > rem) break;
        acc.push(d);
        walk(d + 1, left - 1, rem - d, acc);
        acc.pop();
      }
    }
    walk(1, len, sum, []);
    COMBO_CACHE.set(key, out);
    return out;
  }

  // ─── Board model ───────────────────────────────────────────────────────────
  // Cell: { kind:'wall' } | { kind:'clue', across?:number, down?:number } | { kind:'cell' }
  // Values live in a parallel values[r][c] (0 empty, 1–9 filled).

  function cloneBoard(board) {
    return board.map((row) =>
      row.map((c) => {
        if (c.kind === 'clue') return { kind: 'clue', across: c.across, down: c.down };
        if (c.kind === 'cell') return { kind: 'cell' };
        return { kind: 'wall' };
      })
    );
  }

  function emptyValues(rows, cols) {
    return Array.from({ length: rows }, () => Array(cols).fill(0));
  }

  /** Extract across/down runs: { cells:[[r,c],...], sum, clueR, clueC, dir } */
  function extractRuns(board) {
    const rows = board.length;
    const cols = board[0].length;
    const runs = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = board[r][c];
        if (cell.kind !== 'clue') continue;
        if (cell.across != null) {
          const cells = [];
          for (let cc = c + 1; cc < cols && board[r][cc].kind === 'cell'; cc++) cells.push([r, cc]);
          if (cells.length) runs.push({ cells, sum: cell.across, clueR: r, clueC: c, dir: 'across' });
        }
        if (cell.down != null) {
          const cells = [];
          for (let rr = r + 1; rr < rows && board[rr][c].kind === 'cell'; rr++) cells.push([rr, c]);
          if (cells.length) runs.push({ cells, sum: cell.down, clueR: r, clueC: c, dir: 'down' });
        }
      }
    }
    return runs;
  }

  function cellRunsIndex(runs, rows, cols) {
    const idx = Array.from({ length: rows }, () => Array.from({ length: cols }, () => []));
    runs.forEach((run, i) => {
      run.cells.forEach(([r, c]) => idx[r][c].push(i));
    });
    return idx;
  }

  /**
   * Legal digits for cell (r,c), treating that cell as empty so overwrite is allowed.
   * Intersects combo possibilities across all runs containing the cell.
   */
  function candidatesForCell(values, runs, runIdx, r, c) {
    const runIds = runIdx[r][c];
    if (!runIds || !runIds.length) return [1, 2, 3, 4, 5, 6, 7, 8, 9];
    let possible = null;
    for (let i = 0; i < runIds.length; i++) {
      const run = runs[runIds[i]];
      const used = new Set();
      let emptySlots = 0;
      let filledSum = 0;
      for (let j = 0; j < run.cells.length; j++) {
        const [rr, cc] = run.cells[j];
        const v = rr === r && cc === c ? 0 : values[rr][cc];
        if (v) {
          if (used.has(v)) return [];
          used.add(v);
          filledSum += v;
        } else emptySlots++;
      }
      const remSum = run.sum - filledSum;
      if (remSum < emptySlots || remSum > 9 * emptySlots) return [];
      const ok = new Set();
      const combos = combosFor(run.sum, run.cells.length);
      for (let k = 0; k < combos.length; k++) {
        const combo = combos[k];
        let match = true;
        for (const f of used) {
          if (combo.indexOf(f) === -1) {
            match = false;
            break;
          }
        }
        if (!match) continue;
        for (let d = 0; d < combo.length; d++) {
          if (!used.has(combo[d])) ok.add(combo[d]);
        }
      }
      if (possible == null) possible = ok;
      else {
        const next = new Set();
        possible.forEach((d) => {
          if (ok.has(d)) next.add(d);
        });
        possible = next;
      }
      if (!possible.size) return [];
    }
    return possible ? Array.from(possible).sort((a, b) => a - b) : [1, 2, 3, 4, 5, 6, 7, 8, 9];
  }

  // ─── Solver / uniqueness ───────────────────────────────────────────────────

  /**
   * Count solutions up to `limit` (default 2 for uniqueness).
   * Mutates values in place during search; restores on exit.
   */
  function countSolutions(board, values, limit) {
    const max = limit == null ? 2 : limit;
    const runs = extractRuns(board);
    const rows = board.length;
    const cols = board[0].length;
    const runIdx = cellRunsIndex(runs, rows, cols);

    // Pre-validate: every run must have valid combo table
    for (let i = 0; i < runs.length; i++) {
      if (!combosFor(runs[i].sum, runs[i].cells.length).length) return 0;
    }

    const whites = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (board[r][c].kind === 'cell') whites.push([r, c]);
      }
    }

    function candidates(r, c) {
      const runIds = runIdx[r][c];
      let possible = null;
      for (let i = 0; i < runIds.length; i++) {
        const run = runs[runIds[i]];
        const filled = [];
        const used = new Set();
        let emptySlots = 0;
        for (let j = 0; j < run.cells.length; j++) {
          const [rr, cc] = run.cells[j];
          const v = values[rr][cc];
          if (v) {
            if (used.has(v)) return [];
            used.add(v);
            filled.push(v);
          } else emptySlots++;
        }
        const need = emptySlots; // including current (empty)
        const remSum = run.sum - filled.reduce((a, b) => a + b, 0);
        const ok = new Set();
        const combos = combosFor(run.sum, run.cells.length);
        for (let k = 0; k < combos.length; k++) {
          const combo = combos[k];
          let match = true;
          for (let f = 0; f < filled.length; f++) {
            if (combo.indexOf(filled[f]) === -1) {
              match = false;
              break;
            }
          }
          if (!match) continue;
          // remaining digits in combo
          for (let d = 0; d < combo.length; d++) {
            if (!used.has(combo[d])) ok.add(combo[d]);
          }
        }
        // Also enforce remSum bounds loosely via combo filter above
        if (remSum < need || remSum > 9 * need) return [];
        if (possible == null) possible = ok;
        else {
          const next = new Set();
          possible.forEach((d) => {
            if (ok.has(d)) next.add(d);
          });
          possible = next;
        }
        if (!possible.size) return [];
      }
      return possible ? Array.from(possible).sort((a, b) => a - b) : [1, 2, 3, 4, 5, 6, 7, 8, 9];
    }

    function pickCell() {
      let best = null;
      let bestN = 10;
      for (let i = 0; i < whites.length; i++) {
        const [r, c] = whites[i];
        if (values[r][c]) continue;
        const cands = candidates(r, c);
        if (cands.length === 0) return { r, c, cands: [] };
        if (cands.length < bestN) {
          bestN = cands.length;
          best = { r, c, cands };
          if (bestN === 1) break;
        }
      }
      return best;
    }

    let found = 0;
    function dfs() {
      if (found >= max) return;
      const pick = pickCell();
      if (!pick) {
        found++;
        return;
      }
      if (!pick.cands.length) return;
      const { r, c, cands } = pick;
      // shuffle lightly for generator variety when counting isn't limited to uniqueness
      for (let i = 0; i < cands.length; i++) {
        values[r][c] = cands[i];
        dfs();
        if (found >= max) {
          values[r][c] = 0;
          return;
        }
        values[r][c] = 0;
      }
    }

    // Reject if already inconsistent
    for (let i = 0; i < whites.length; i++) {
      const [r, c] = whites[i];
      if (values[r][c] && !candidates(r, c).includes(values[r][c])) return 0;
    }
    dfs();
    return found;
  }

  function isUnique(board, values) {
    const v = values.map((row) => row.slice());
    return countSolutions(board, v, 2) === 1;
  }

  function solveOne(board) {
    const values = emptyValues(board.length, board[0].length);
    const v = values.map((row) => row.slice());
    // Use internal search that stores first solution
    const runs = extractRuns(board);
    const rows = board.length;
    const cols = board[0].length;
    const runIdx = cellRunsIndex(runs, rows, cols);
    const whites = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (board[r][c].kind === 'cell') whites.push([r, c]);
      }
    }

    function candidates(r, c) {
      const runIds = runIdx[r][c];
      let possible = null;
      for (let i = 0; i < runIds.length; i++) {
        const run = runs[runIds[i]];
        const filled = [];
        const used = new Set();
        for (let j = 0; j < run.cells.length; j++) {
          const [rr, cc] = run.cells[j];
          const val = v[rr][cc];
          if (val) {
            if (used.has(val)) return [];
            used.add(val);
            filled.push(val);
          }
        }
        const ok = new Set();
        const combos = combosFor(run.sum, run.cells.length);
        for (let k = 0; k < combos.length; k++) {
          const combo = combos[k];
          let match = true;
          for (let f = 0; f < filled.length; f++) {
            if (combo.indexOf(filled[f]) === -1) {
              match = false;
              break;
            }
          }
          if (!match) continue;
          for (let d = 0; d < combo.length; d++) {
            if (!used.has(combo[d])) ok.add(combo[d]);
          }
        }
        if (possible == null) possible = ok;
        else {
          const next = new Set();
          possible.forEach((d) => {
            if (ok.has(d)) next.add(d);
          });
          possible = next;
        }
        if (!possible.size) return [];
      }
      return possible ? Array.from(possible).sort((a, b) => a - b) : [1, 2, 3, 4, 5, 6, 7, 8, 9];
    }

    function pickCell() {
      let best = null;
      let bestN = 10;
      for (let i = 0; i < whites.length; i++) {
        const [r, c] = whites[i];
        if (v[r][c]) continue;
        const cands = candidates(r, c);
        if (!cands.length) return { r, c, cands: [] };
        if (cands.length < bestN) {
          bestN = cands.length;
          best = { r, c, cands };
          if (bestN === 1) break;
        }
      }
      return best;
    }

    let solution = null;
    function dfs() {
      if (solution) return;
      const pick = pickCell();
      if (!pick) {
        solution = v.map((row) => row.slice());
        return;
      }
      if (!pick.cands.length) return;
      for (let i = 0; i < pick.cands.length; i++) {
        v[pick.r][pick.c] = pick.cands[i];
        dfs();
        if (solution) return;
        v[pick.r][pick.c] = 0;
      }
    }
    dfs();
    return solution;
  }

  // ─── Masks & generator ─────────────────────────────────────────────────────

  /**
   * Mask chars: # wall, X clue seat, . white cell.
   * Geometry: top-row X's sit on white columns; left-col X's start each across run.
   */
  const MASKS = {
    easy: [
      ['#####', '##XX#', '#X..#', '#X..#', '#####'],
      ['######', '##XXX#', '#X...#', '#X...#', '######'],
      ['######', '##XX##', '#X..X#', '#X..##', '######'],
      ['#######', '##XXX##', '#X...X#', '#X...##', '#######'],
      ['######', '##XX##', '#X..##', '#X..X#', '######'],
    ],
    medium: [
      ['#######', '##XXXX#', '#X....#', '#X...X#', '##XXX##', '#######'],
      ['#######', '##XXX##', '#X...X#', '#X...##', '##XX###', '#######'],
      ['########', '##XXXX##', '#X....X#', '#X....##', '##XXX###', '########'],
      ['########', '##XXXXX#', '#X.....#', '#X....X#', '##XXXX##', '########'],
      ['#######', '##XXXX#', '#X...X#', '#X...##', '#X..X##', '##XX###', '#######'],
    ],
    hard: [
      ['#########', '##XXXXXX#', '#X......#', '#X.....X#', '##XXXXX##', '#########'],
      ['#########', '##XXXXX##', '#X.....X#', '#X.....##', '##XXXX###', '#########'],
      ['########', '##XXXXX#', '#X.....#', '#X....X#', '##XXXX##', '########'],
      ['##########', '##XXXXXXX#', '#X.......#', '#X......X#', '##XXXXXX##', '##########'],
      ['#######', '##XXXX#', '#X....#', '#X...X#', '##XXX##', '#######'],
      ['########', '##XXXX##', '#X....X#', '#X....##', '##XXX###', '########'],
    ],
  };

  const QUALITY = {
    easy: { minWhites: 4, minRun: 2, maxDim: 9 },
    medium: { minWhites: 8, minRun: 2, maxDim: 12 },
    hard: { minWhites: 10, minRun: 2, maxDim: 14 },
  };

  function countWhites(board) {
    let n = 0;
    for (let r = 0; r < board.length; r++) {
      for (let c = 0; c < board[0].length; c++) {
        if (board[r][c].kind === 'cell') n++;
      }
    }
    return n;
  }

  /** Orthogonal connectivity of all white cells — rejects island postage stamps. */
  function whitesConnected(board) {
    const rows = board.length;
    const cols = board[0].length;
    const whites = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (board[r][c].kind === 'cell') whites.push([r, c]);
      }
    }
    if (!whites.length) return false;
    const key = (r, c) => r + ',' + c;
    const set = new Set(whites.map(([r, c]) => key(r, c)));
    const seen = new Set([key(whites[0][0], whites[0][1])]);
    const q = [whites[0]];
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    while (q.length) {
      const [r, c] = q.shift();
      for (let i = 0; i < dirs.length; i++) {
        const rr = r + dirs[i][0];
        const cc = c + dirs[i][1];
        const k = key(rr, cc);
        if (!set.has(k) || seen.has(k)) continue;
        seen.add(k);
        q.push([rr, cc]);
      }
    }
    return seen.size === whites.length;
  }

  function structuralOk(board, minWhites) {
    const runs = extractRuns(board);
    if (!runs.length || runs.some((run) => run.cells.length < 2)) return false;
    let whites = 0;
    const coverCount = {};
    for (let r = 0; r < board.length; r++) {
      for (let c = 0; c < board[0].length; c++) {
        if (board[r][c].kind === 'cell') {
          whites++;
          coverCount[r + ',' + c] = 0;
        }
      }
    }
    if (whites < (minWhites || 4)) return false;
    if (board.length > 14 || board[0].length > 14) return false;
    runs.forEach((run) =>
      run.cells.forEach(([rr, cc]) => {
        coverCount[rr + ',' + cc] = (coverCount[rr + ',' + cc] || 0) + 1;
      })
    );
    if (!Object.keys(coverCount).every((k) => coverCount[k] >= 2)) return false;
    for (let i = 0; i < runs.length; i++) {
      if (!combosFor(runs[i].sum, runs[i].cells.length).length) return false;
    }
    return whitesConnected(board);
  }

  function puzzleQualityOk(board, difficulty) {
    const q = QUALITY[difficulty] || QUALITY.easy;
    if (board.length > q.maxDim || board[0].length > q.maxDim) return false;
    return structuralOk(board, q.minWhites);
  }

  function maskToSkeleton(mask) {
    return mask.map((row) =>
      row.split('').map((ch) => {
        if (ch === '.') return { kind: 'cell' };
        if (ch === 'X') return { kind: 'clue' }; // sums filled later
        return { kind: 'wall' };
      })
    );
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  /** Fill white cells randomly under no-repeat-in-run; return values or null. */
  function randomFill(skeleton) {
    const rows = skeleton.length;
    const cols = skeleton[0].length;
    const values = emptyValues(rows, cols);
    const runs = [];

    // Runs start only from clue seats (standard cross-sum rules)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (skeleton[r][c].kind !== 'clue') continue;
        const across = [];
        for (let cc = c + 1; cc < cols && skeleton[r][cc].kind === 'cell'; cc++) across.push([r, cc]);
        if (across.length) runs.push(across);
        const down = [];
        for (let rr = r + 1; rr < rows && skeleton[rr][c].kind === 'cell'; rr++) down.push([rr, c]);
        if (down.length) runs.push(down);
      }
    }

    const runIdx = Array.from({ length: rows }, () => Array.from({ length: cols }, () => []));
    runs.forEach((cells, i) => cells.forEach(([r, c]) => runIdx[r][c].push(i)));

    const whites = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (skeleton[r][c].kind === 'cell') whites.push([r, c]);
      }
    }

    function usedInRuns(r, c) {
      const used = new Set();
      const ids = runIdx[r][c];
      for (let i = 0; i < ids.length; i++) {
        const cells = runs[ids[i]];
        for (let j = 0; j < cells.length; j++) {
          const [rr, cc] = cells[j];
          if (values[rr][cc]) used.add(values[rr][cc]);
        }
      }
      return used;
    }

    function dfs(i) {
      if (i >= whites.length) return true;
      const [r, c] = whites[i];
      const used = usedInRuns(r, c);
      const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      for (let d = 0; d < digits.length; d++) {
        if (used.has(digits[d])) continue;
        values[r][c] = digits[d];
        if (dfs(i + 1)) return true;
        values[r][c] = 0;
      }
      return false;
    }

    if (!dfs(0)) return null;
    return values;
  }

  function applyCluesFromFill(skeleton, values) {
    const board = skeleton.map((row) =>
      row.map((c) => {
        if (c.kind === 'cell') return { kind: 'cell' };
        if (c.kind === 'clue') return { kind: 'clue' };
        return { kind: 'wall' };
      })
    );
    const rows = board.length;
    const cols = board[0].length;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (board[r][c].kind !== 'clue') continue;
        let acrossSum = 0;
        let acrossN = 0;
        for (let cc = c + 1; cc < cols && board[r][cc].kind === 'cell'; cc++) {
          acrossSum += values[r][cc];
          acrossN++;
        }
        let downSum = 0;
        let downN = 0;
        for (let rr = r + 1; rr < rows && board[rr][c].kind === 'cell'; rr++) {
          downSum += values[rr][c];
          downN++;
        }
        if (acrossN) board[r][c].across = acrossSum;
        if (downN) board[r][c].down = downSum;
        // Clue seat with no runs -> plain wall
        if (!acrossN && !downN) board[r][c] = { kind: 'wall' };
      }
    }
    return board;
  }

/** Generate one unique puzzle from a single mask (retry until unique). */
  function generateFromMask(mask, attempts) {
    const maxAttempts = attempts || 80;
    for (let n = 0; n < maxAttempts; n++) {
      if (mask.some((row) => row.length !== mask[0].length)) return null;
      const skeleton = maskToSkeleton(mask);
      const fill = randomFill(skeleton);
      if (!fill) continue;
      const board = applyCluesFromFill(skeleton, fill);
      if (!structuralOk(board, 4)) continue;
      const blank = emptyValues(board.length, board[0].length);
      if (!isUnique(board, blank)) continue;
      const solved = solveOne(board);
      if (!solved) continue;
      return { board, solution: solved };
    }
    return null;
  }

  /** Prefer single connected masks — composed stamps produced island seas. */
  function generateComposed(difficulty) {
    return null;
  }

  function generateUniquePuzzle(difficulty, attempts) {
    const diff = difficulty === 'daily' ? 'medium' : difficulty || 'easy';
    const maxAttempts = attempts || (diff === 'hard' ? 50 : 36);
    const q = QUALITY[diff] || QUALITY.easy;
    const masks = MASKS[diff] || MASKS.easy;
    for (let n = 0; n < maxAttempts; n++) {
      const mask = masks[Math.floor(Math.random() * masks.length)];
      const got = generateFromMask(mask, 3);
      if (!got) continue;
      if (!puzzleQualityOk(got.board, diff)) continue;
      return { board: got.board, solution: got.solution, source: 'generated', difficulty: diff };
    }
    // Soft fallback: easier mask pool still unique + connected
    if (diff !== 'easy') {
      for (let n = 0; n < 20; n++) {
        const mask = (MASKS.medium || MASKS.easy)[Math.floor(Math.random() * (MASKS.medium || MASKS.easy).length)];
        const got = generateFromMask(mask, 4);
        if (got && structuralOk(got.board, Math.max(6, q.minWhites - 2)) && whitesConnected(got.board)) {
          return { board: got.board, solution: got.solution, source: 'generated', difficulty: diff };
        }
      }
    }
    return null;
  }

  // ─── Verified puzzle banks (solution grids; clues derived; uniqueness gated) ─
  // '#' wall, 'X' clue seat, '1'-'9' white cell with solution digit

  function parseBankString(rows) {
    const skeleton = rows.map((row) =>
      row.split('').map((ch) => {
        if (ch >= '1' && ch <= '9') return { kind: 'cell' };
        if (ch === 'X' || ch === 'x') return { kind: 'clue' };
        return { kind: 'wall' };
      })
    );
    const values = rows.map((row) =>
      row.split('').map((ch) => (ch >= '1' && ch <= '9' ? +ch : 0))
    );
    const board = applyCluesFromFill(skeleton, values);
    return { board, solution: values };
  }

  /** Verified unique banks (clues re-derived; uniqueness + connectivity gated in buildBank). */
  const BANK_STRINGS = {
  easy: [
    [
      "#####",
      "##XX#",
      "#X68#",
      "#X24#",
      "#####"
    ],
    [
      "######",
      "##XX##",
      "#X17##",
      "#X25X#",
      "######"
    ],
    [
      "######",
      "##XXX#",
      "#X984#",
      "#X351#",
      "######"
    ],
    [
      "#####",
      "##XX#",
      "#X57#",
      "#X89#",
      "#####"
    ],
    [
      "#####",
      "##XX#",
      "#X53#",
      "#X89#",
      "#####"
    ],
    [
      "#####",
      "##XX#",
      "#X97#",
      "#X32#",
      "#####"
    ],
    [
      "######",
      "##XXX#",
      "#X678#",
      "#X289#",
      "######"
    ],
    [
      "######",
      "##XXX#",
      "#X298#",
      "#X182#",
      "######"
    ],
    [
      "#####",
      "##XX#",
      "#X13#",
      "#X52#",
      "#####"
    ],
    [
      "######",
      "##XX##",
      "#X18X#",
      "#X39##",
      "######"
    ],
    [
      "######",
      "##XXX#",
      "#X279#",
      "#X896#",
      "######"
    ],
    [
      "######",
      "##XX##",
      "#X21##",
      "#X92X#",
      "######"
    ],
    [
      "######",
      "##XX##",
      "#X71X#",
      "#X52##",
      "######"
    ],
    [
      "#######",
      "##XXX##",
      "#X214X#",
      "#X132##",
      "#######"
    ],
    [
      "#####",
      "##XX#",
      "#X76#",
      "#X98#",
      "#####"
    ],
    [
      "######",
      "##XXX#",
      "#X174#",
      "#X298#",
      "######"
    ],
    [
      "#######",
      "##XXX##",
      "#X896X#",
      "#X472##",
      "#######"
    ],
    [
      "######",
      "##XXX#",
      "#X986#",
      "#X721#",
      "######"
    ],
    [
      "#####",
      "##XX#",
      "#X49#",
      "#X68#",
      "#####"
    ],
    [
      "#####",
      "##XX#",
      "#X27#",
      "#X19#",
      "#####"
    ]
  ],
  medium: [
    [
      "########",
      "##XXXX##",
      "#X4169X#",
      "#X2316##",
      "##XXX###",
      "########"
    ],
    [
      "#######",
      "##XXXX#",
      "#X423X#",
      "#X846##",
      "#X91X##",
      "##XX###",
      "#######"
    ],
    [
      "########",
      "##XXXX##",
      "#X1563X#",
      "#X4978##",
      "##XXX###",
      "########"
    ],
    [
      "########",
      "##XXXX##",
      "#X4261X#",
      "#X7695##",
      "##XXX###",
      "########"
    ],
    [
      "#######",
      "##XXXX#",
      "#X321X#",
      "#X978##",
      "#X81X##",
      "##XX###",
      "#######"
    ],
    [
      "#######",
      "##XXXX#",
      "#X498X#",
      "#X265##",
      "#X58X##",
      "##XX###",
      "#######"
    ],
    [
      "#######",
      "##XXXX#",
      "#X796X#",
      "#X142##",
      "#X27X##",
      "##XX###",
      "#######"
    ],
    [
      "#######",
      "##XXXX#",
      "#X261X#",
      "#X492##",
      "#X12X##",
      "##XX###",
      "#######"
    ],
    [
      "########",
      "##XXXX##",
      "#X7596X#",
      "#X3182##",
      "##XXX###",
      "########"
    ],
    [
      "########",
      "##XXXX##",
      "#X9371X#",
      "#X8693##",
      "##XXX###",
      "########"
    ],
    [
      "#######",
      "##XXXX#",
      "#X925X#",
      "#X731##",
      "#X31X##",
      "##XX###",
      "#######"
    ],
    [
      "#######",
      "##XXXX#",
      "#X193X#",
      "#X241##",
      "#X32X##",
      "##XX###",
      "#######"
    ],
    [
      "########",
      "##XXXX##",
      "#X9875X#",
      "#X1523##",
      "##XXX###",
      "########"
    ],
    [
      "########",
      "##XXXX##",
      "#X5798X#",
      "#X2179##",
      "##XXX###",
      "########"
    ],
    [
      "########",
      "##XXXX##",
      "#X7489X#",
      "#X6195##",
      "##XXX###",
      "########"
    ],
    [
      "########",
      "##XXXX##",
      "#X3241X#",
      "#X8793##",
      "##XXX###",
      "########"
    ]
  ],
  hard: [
    [
      "#########",
      "##XXXXX##",
      "#X12893X#",
      "#X51682##",
      "##XXXX###",
      "#########"
    ],
    [
      "#########",
      "##XXXXX##",
      "#X24613X#",
      "#X76829##",
      "##XXXX###",
      "#########"
    ],
    [
      "#########",
      "##XXXXX##",
      "#X18795X#",
      "#X32571##",
      "##XXXX###",
      "#########"
    ],
    [
      "#########",
      "##XXXXX##",
      "#X87935X#",
      "#X65821##",
      "##XXXX###",
      "#########"
    ],
    [
      "#########",
      "##XXXXX##",
      "#X31895X#",
      "#X14632##",
      "##XXXX###",
      "#########"
    ],
    [
      "#########",
      "##XXXXX##",
      "#X13257X#",
      "#X37498##",
      "##XXXX###",
      "#########"
    ],
    [
      "#########",
      "##XXXXX##",
      "#X51327X#",
      "#X72689##",
      "##XXXX###",
      "#########"
    ],
    [
      "#########",
      "##XXXXX##",
      "#X98613X#",
      "#X36241##",
      "##XXXX###",
      "#########"
    ],
    [
      "#########",
      "##XXXXX##",
      "#X39785X#",
      "#X16398##",
      "##XXXX###",
      "#########"
    ],
    [
      "#########",
      "##XXXXX##",
      "#X26135X#",
      "#X87629##",
      "##XXXX###",
      "#########"
    ],
    [
      "#########",
      "##XXXXX##",
      "#X18954X#",
      "#X29713##",
      "##XXXX###",
      "#########"
    ],
    [
      "#########",
      "##XXXXX##",
      "#X21375X#",
      "#X65798##",
      "##XXXX###",
      "#########"
    ]
  ]
};

  function buildBank() {
    const bank = { easy: [], medium: [], hard: [] };
    Object.keys(BANK_STRINGS).forEach((diff) => {
      BANK_STRINGS[diff].forEach((rows, i) => {
        try {
          const parsed = parseBankString(rows);
          const blank = emptyValues(parsed.board.length, parsed.board[0].length);
          const n = countSolutions(parsed.board, blank.map((r) => r.slice()), 2);
          if (n === 1 && puzzleQualityOk(parsed.board, diff)) {
            bank[diff].push({
              board: parsed.board,
              solution: parsed.solution,
              source: 'bank',
              difficulty: diff,
              id: diff + '_' + i,
            });
          } else if (typeof console !== 'undefined' && console.warn) {
            console.warn('[ank-jod] bank puzzle rejected (solutions=' + n + '):', diff, i);
          }
        } catch (e) {
          if (typeof console !== 'undefined' && console.warn) console.warn('[ank-jod] bank parse failed', diff, i, e);
        }
      });
    });
    return bank;
  }

  const BANK = buildBank();
  const usedBankIds = { easy: new Set(), medium: new Set(), hard: new Set() };
  const GEN_CACHE = { easy: [], medium: [], hard: [] };

  function ensureBankFallback(diff) {
    if (BANK[diff] && BANK[diff].length) return;
    for (let i = 0; i < 3; i++) {
      const g = generateUniquePuzzle(diff, 60);
      if (g && puzzleQualityOk(g.board, diff)) {
        BANK[diff] = [
          {
            board: g.board,
            solution: g.solution,
            source: 'fallback',
            difficulty: diff,
            id: diff + '_fallback_' + i,
          },
        ];
        return;
      }
    }
    // Last resort: known unique connected easy (still gates for connectivity)
    const emergency = parseBankString(['#####', '##XX#', '#X12#', '#X35#', '#####']);
    if (isUnique(emergency.board, emptyValues(5, 5)) && whitesConnected(emergency.board)) {
      BANK[diff] = [
        {
          board: emergency.board,
          solution: emergency.solution,
          source: 'fallback',
          difficulty: diff,
          id: diff + '_fallback',
        },
      ];
    }
  }

  ['easy', 'medium', 'hard'].forEach(ensureBankFallback);

  function dateSeedKey(d) {
    const dt = d || new Date();
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // ─── Verified bank (data/kakuro-bank.js) ───────────────────────────────────

  function bankList(diff) {
    const b = KB();
    return b && Array.isArray(b[diff]) ? b[diff] : [];
  }
  function puzzleKey(diff, n) {
    return diff + '-' + n;
  }
  function loadProgress() {
    return Hub() ? Hub().load(GAME) : { stars: {}, bests: {}, stats: {}, pb: {} };
  }
  function solvedCount(p, diff) {
    const L = bankList(diff).length;
    let k = 0;
    for (let i = 1; i <= L; i++) if (p.stars[puzzleKey(diff, i)]) k++;
    return k;
  }
  /** First unsolved puzzle number for a difficulty (1-based); wraps to 1 once all are solved. */
  function nextNumber(diff, p) {
    const prog = p || loadProgress();
    const L = bankList(diff).length;
    for (let i = 1; i <= L; i++) if (!prog.stars[puzzleKey(diff, i)]) return i;
    return 1;
  }
  function bankPuzzle(diff, n) {
    const list = bankList(diff);
    if (!list.length) return null;
    const num = Math.max(1, Math.min(list.length, Math.floor(Number(n) || 1)));
    const parsed = parseBankString(String(list[num - 1]).split('/'));
    return { board: parsed.board, solution: parsed.solution, source: 'bank', difficulty: diff, id: 'kk_' + puzzleKey(diff, num), n: num };
  }
  function todayNo() {
    return SC() ? SC().dayNumber(new Date()) : 0;
  }
  /** Same indexing as server-lib/solo-scores.js kakuroRows('daily', day). */
  function dailyEntry(dayNo) {
    const b = KB();
    if (!b || !Array.isArray(b.daily) || !b.daily.length) return null;
    const len = b.daily.length;
    const i = (((dayNo - (b.dailyStart || 0)) % len) + len) % len;
    const raw = String(b.daily[i]);
    const at = raw.indexOf(':');
    return { grade: raw.slice(0, at), rows: raw.slice(at + 1).split('/') };
  }
  function dailyBankPuzzle(dayNo) {
    const e = dailyEntry(dayNo);
    if (!e) return null;
    const parsed = parseBankString(e.rows);
    const key = SC() ? SC().dayKeyOf(dayNo) : dateSeedKey();
    return { board: parsed.board, solution: parsed.solution, source: 'daily', difficulty: 'daily', grade: e.grade, id: 'daily_' + key, dailyKey: key, dayNo };
  }
  function firstDay() {
    const b = KB();
    return b ? Math.max(0, b.dailyStart || 0) : 0;
  }

  function pickDailyPuzzle(dayNo) {
    const fromBank = dailyBankPuzzle(dayNo == null ? todayNo() : dayNo);
    if (fromBank) return fromBank;
    const key = dateSeedKey();
    const seed = hashSeed('ankjod-daily-' + key);
    const pool = [...(BANK.medium || []), ...(BANK.easy || []), ...(BANK.hard || [])];
    if (pool.length) {
      const item = pool[seed % pool.length];
      return {
        board: cloneBoard(item.board),
        solution: item.solution.map((r) => r.slice()),
        source: 'daily',
        difficulty: 'daily',
        id: 'daily_' + key,
        dailyKey: key,
      };
    }
    const gen = generateUniquePuzzle('medium', 40);
    if (gen) {
      return {
        board: gen.board,
        solution: gen.solution,
        source: 'daily',
        difficulty: 'daily',
        id: 'daily_' + key,
        dailyKey: key,
      };
    }
    return pickPuzzle('easy');
  }

  function pickFromBank(diff) {
    const list = BANK[diff] || [];
    if (!list.length) return null;
    const used = usedBankIds[diff] || (usedBankIds[diff] = new Set());
    let unused = list.filter((p) => !used.has(p.id));
    if (!unused.length) {
      used.clear();
      unused = list.slice();
    }
    const item = unused[Math.floor(Math.random() * unused.length)];
    used.add(item.id);
    return {
      board: cloneBoard(item.board),
      solution: item.solution.map((r) => r.slice()),
      source: item.source,
      difficulty: diff,
      id: item.id,
    };
  }

  function pickPuzzle(difficulty, n) {
    if (difficulty === 'daily') return pickDailyPuzzle();
    let diff = DIFFS.some((d) => d.id === difficulty) ? difficulty : 'easy';
    if (bankList(diff).length) return bankPuzzle(diff, n || nextNumber(diff));
    if (diff === 'expert') diff = 'hard';
    // Prefer unused bank for variety, then fresh generation, then any bank
    const fromBank = pickFromBank(diff);
    const preferGen = Math.random() < 0.35;
    if (!preferGen && fromBank) return fromBank;
    const gen = generateUniquePuzzle(diff);
    if (gen && puzzleQualityOk(gen.board, diff)) {
      if (GEN_CACHE[diff] && GEN_CACHE[diff].length < 8) {
        GEN_CACHE[diff].push(gen);
      }
      return gen;
    }
    if (fromBank) return fromBank;
    if (GEN_CACHE[diff] && GEN_CACHE[diff].length) {
      const g = GEN_CACHE[diff][Math.floor(Math.random() * GEN_CACHE[diff].length)];
      return {
        board: cloneBoard(g.board),
        solution: g.solution.map((r) => r.slice()),
        source: g.source || 'cache',
        difficulty: diff,
      };
    }
    const any = pickFromBank(diff) || pickFromBank('easy');
    if (any) return any;
    const emergency = parseBankString(['#####', '##XX#', '#X12#', '#X35#', '#####']);
    return {
      board: emergency.board,
      solution: emergency.solution,
      source: 'fallback',
      difficulty: diff,
      id: diff + '_emergency',
    };
  }

  // ─── Validation / mistakes ─────────────────────────────────────────────────

  function analyzeMistakes(board, values) {
    const runs = extractRuns(board);
    const bad = new Set(); // "r,c"
    let completeWrong = 0;
    let incomplete = 0;
    let hasDup = false;
    let hasWrongSum = false;
    let hasImpossible = false;

    runs.forEach((run) => {
      const digits = [];
      let empty = 0;
      let sum = 0;
      const seen = new Set();
      let dup = false;
      run.cells.forEach(([r, c]) => {
        const v = values[r][c];
        if (!v) empty++;
        else {
          sum += v;
          if (seen.has(v)) dup = true;
          seen.add(v);
          digits.push([r, c, v]);
        }
      });
      if (dup) {
        hasDup = true;
        digits.forEach(([r, c]) => bad.add(r + ',' + c));
      }
      if (empty === 0) {
        if (sum !== run.sum || dup) {
          completeWrong++;
          if (sum !== run.sum) hasWrongSum = true;
          run.cells.forEach(([r, c]) => bad.add(r + ',' + c));
        }
      } else {
        incomplete++;
        // Partial: digit not in any valid combo given filled
        if (digits.length) {
          const combos = combosFor(run.sum, run.cells.length);
          const filled = digits.map((d) => d[2]);
          digits.forEach(([r, c, v]) => {
            const ok = combos.some((combo) => {
              if (combo.indexOf(v) === -1) return false;
              return filled.every((f) => combo.indexOf(f) !== -1);
            });
            if (!ok) {
              hasImpossible = true;
              bad.add(r + ',' + c);
            }
          });
        }
      }
    });

    const allFilled = incomplete === 0;
    const won = allFilled && completeWrong === 0 && bad.size === 0;
    return { bad, won, allFilled, completeWrong, hasDup, hasWrongSum, hasImpossible };
  }

  function checkStatusMessage(a) {
    if (!a) return '';
    if (a.won) return 'Puzzle solved!';
    if (a.bad && a.bad.size) {
      if (a.hasDup && a.hasWrongSum) return 'Duplicates and wrong sums — see red cells';
      if (a.hasDup) return 'Duplicate digit in a run — see red cells';
      if (a.hasWrongSum) return 'A completed run doesn’t match its clue';
      if (a.hasImpossible) return 'Some digits don’t fit remaining combos';
      return 'Conflicts on the red cells';
    }
    if (!a.allFilled) return 'No conflicts yet — keep filling';
    return 'Check the red cells — sums or repeats are off';
  }

  // ─── UI helpers ────────────────────────────────────────────────────────────

  function clueLabel(cell) {
    if (cell.kind !== 'clue') return '';
    const a = cell.across != null ? String(cell.across) : '';
    const d = cell.down != null ? String(cell.down) : '';
    return { a, d };
  }

  function formatTime(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m + ':' + String(r).padStart(2, '0');
  }

  // ─── Save / resume (per difficulty) ────────────────────────────────────────
  const SAVE_VER = 1;
  const SAVE_LAST_KEY = 'ankjod_save_last_diff';

  function saveStorageKey(diff) {
    return 'ankjod_save_' + (diff || 'easy');
  }

  function packBoardRows(board, solution) {
    return board.map((row, r) =>
      row
        .map((cell, c) => {
          if (cell.kind === 'cell') return String((solution[r] && solution[r][c]) || '1');
          if (cell.kind === 'clue') return 'X';
          return '#';
        })
        .join('')
    );
  }

  function pencilToJSON(pencil) {
    return pencil.map((row) => row.map((set) => (set && set.size ? Array.from(set).sort((a, b) => a - b) : [])));
  }

  function pencilFromJSON(raw, rows, cols) {
    const out = Array.from({ length: rows }, () => Array.from({ length: cols }, () => new Set()));
    if (!Array.isArray(raw)) return out;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const list = raw[r] && raw[r][c];
        if (Array.isArray(list)) {
          list.forEach((n) => {
            if (n >= 1 && n <= 9) out[r][c].add(n);
          });
        }
      }
    }
    return out;
  }

  function clearAnkSave(diff) {
    try {
      localStorage.removeItem(saveStorageKey(diff));
      const last = localStorage.getItem(SAVE_LAST_KEY);
      if (last === diff) localStorage.removeItem(SAVE_LAST_KEY);
    } catch (e) {}
  }

  function readAnkSave(diff) {
    try {
      const raw = localStorage.getItem(saveStorageKey(diff));
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.v !== SAVE_VER || !Array.isArray(data.rows) || !data.rows.length) {
        clearAnkSave(diff);
        return null;
      }
      if (!data.values || !Array.isArray(data.values)) {
        clearAnkSave(diff);
        return null;
      }
      const parsed = parseBankString(data.rows);
      const rows = parsed.board.length;
      const cols = parsed.board[0].length;
      if (data.values.length !== rows || (data.values[0] && data.values[0].length !== cols)) {
        clearAnkSave(diff);
        return null;
      }
      if (!whitesConnected(parsed.board) || !extractRuns(parsed.board).length) {
        clearAnkSave(diff);
        return null;
      }
      // Yesterday's Daily is gone at local midnight — a new board replaces it.
      if (diff === 'daily' && SC() && data.dailyKey !== SC().dayKeyOf(todayNo())) {
        clearAnkSave(diff);
        return null;
      }
      return data;
    } catch (e) {
      clearAnkSave(diff);
      return null;
    }
  }

  function writeAnkSave(diff, payload) {
    try {
      localStorage.setItem(saveStorageKey(diff), JSON.stringify(payload));
      localStorage.setItem(SAVE_LAST_KEY, diff);
    } catch (e) {}
  }

  function puzzleFromSave(data) {
    const parsed = parseBankString(data.rows);
    return {
      board: parsed.board,
      solution: parsed.solution,
      source: data.source || 'save',
      difficulty: data.difficulty || 'easy',
      id: data.id || 'resume',
      dailyKey: data.dailyKey,
      n: data.n || null,
      grade: data.grade || null,
      dayNo: data.dayNo == null ? null : data.dayNo,
      archive: !!data.archive,
    };
  }

  function diffLabel(id) {
    return (DIFFS.find((d) => d.id === id) || {}).label || (id === 'archive' ? 'Archive' : id);
  }

  function formatPbBestLine(diff) {
    if (typeof getGamePB !== 'function') return '';
    const pbId = typeof ankJodPbGameId === 'function' ? ankJodPbGameId(diff) : 'ankjod';
    const pb = getGamePB(pbId);
    if (pb == null) return '';
    return 'Best ' + formatTime(pb * 1000);
  }

  function savedTitle(save, diff) {
    if (diff === 'daily') return 'Today’s Daily';
    if (diff === 'archive') return 'Daily ' + (save.dailyKey || '');
    return diffLabel(diff) + (save.n ? ' #' + save.n : '');
  }

  /** onNew(): start the same slot over (defaults to a fresh board for that difficulty). */
  function offerContinueOrNew(ctx, diff, save, onDone, onNew) {
    const sheet = document.createElement('div');
    sheet.className = 'game-pause-scrim';
    sheet.style.zIndex = '90';
    const elapsed = formatTime(Math.max(0, Number(save.elapsedMs) || 0));
    sheet.innerHTML = `<div class="game-pause-card" role="dialog" aria-label="Continue puzzle">
      <h3 class="game-pause-title">${savedTitle(save, diff)} in progress</h3>
      <p style="font-size:13px;color:var(--muted,#8A7F72);margin:0 0 16px;line-height:1.4;">Saved at ${elapsed}. Continue where you left off, or start this board again.</p>
      <button type="button" class="game-result-btn game-result-btn--primary" data-aj-cont>Continue</button>
      <button type="button" class="game-result-btn" data-aj-new style="margin-top:8px;">Start over</button>
      <button type="button" class="game-result-btn" data-aj-cancel style="margin-top:8px;">Cancel</button>
    </div>`;
    const device = document.querySelector('.device') || document.body;
    device.appendChild(sheet);
    const close = () => sheet.remove();
    sheet.querySelector('[data-aj-cont]')?.addEventListener('click', () => {
      close();
      if (onDone) onDone();
      startAnkJodGame(ctx, diff, { resume: save });
    });
    sheet.querySelector('[data-aj-new]')?.addEventListener('click', () => {
      clearAnkSave(diff);
      close();
      if (onDone) onDone();
      if (onNew) onNew();
      else if (diff === 'daily' && save.scored) {
        // The scored Daily keeps its clock and hint count — only the digits are wiped.
        const blank = Object.assign({}, save, { values: save.values.map((row) => row.map(() => 0)), pencil: [], selected: null });
        startAnkJodGame(ctx, 'daily', { resume: blank });
      } else if (diff === 'daily') startAnkJodGame(ctx, 'daily', { scored: false });
      else if (diff === 'archive') startAnkJodGame(ctx, 'daily', { dayNo: save.dayNo, archive: true });
      else startAnkJodGame(ctx, diff, { n: save.n || undefined });
    });
    sheet.querySelector('[data-aj-cancel]')?.addEventListener('click', close);
    sheet.addEventListener('click', (e) => {
      if (e.target === sheet) close();
    });
  }

  // ─── Screens ───────────────────────────────────────────────────────────────

  function openDifficultyPicker(ctx) {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:absolute;inset:0;background:var(--cream,#F7F3EC);z-index:80;display:flex;flex-direction:column;';
    let lastDiff = null;
    try {
      lastDiff = localStorage.getItem(SAVE_LAST_KEY);
    } catch (e) {}
    const lastSave = lastDiff ? readAnkSave(lastDiff) : null;
    const prog = loadProgress();
    const continueBanner = lastSave
      ? `<button type="button" id="kkContinueLast" class="kk-diff-btn kk-diff-btn--continue">
          <span class="kk-diff-ico">▶</span>
          <span class="kk-diff-txt"><b>Continue</b><small>${savedTitle(lastSave, lastDiff)} · ${formatTime(Math.max(0, Number(lastSave.elapsedMs) || 0))}</small></span>
        </button>`
      : '';
    const day = todayNo();
    const dEntry = dailyEntry(day);
    const ds = Hub() ? Hub().dailyState(GAME) : null;
    const streak = Hub() ? Hub().streak(GAME) : 0;
    const dailyMeta = [
      dEntry ? diffLabel(dEntry.grade) : 'One puzzle for everyone',
      ds && ds.done && ds.result ? 'Done · ' + ds.result.line : ds && ds.started ? 'Scored try used' : 'Your first try counts',
      streak ? '🔥 ' + streak : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const diffRow = (d) => {
      const L = bankList(d.id).length;
      const st = prog.stats[d.id];
      const bits = L
        ? ['#' + nextNumber(d.id, prog), solvedCount(prog, d.id) + '/' + L + ' solved', st && st.bestMs ? 'Best ' + formatTime(st.bestMs) : '']
        : [d.desc, formatPbBestLine(d.id)];
      if (readAnkSave(d.id)) bits.push('In progress');
      return `<button type="button" data-diff="${d.id}" class="kk-diff-btn">
          <span class="kk-diff-ico">${d.emoji}</span>
          <span class="kk-diff-txt"><b>${d.label}</b><small>${bits.filter(Boolean).join(' · ')}</small></span>
          <span class="kk-diff-go">›</span>
        </button>`;
    };
    overlay.innerHTML = `
      ${gameChromeHtml({ title: 'Kakuro', subtitle: 'Solo', backId: 'kkDiffBack' })}
      <div class="kk-hub">
        <p class="kk-hub-lead">Fill the white cells with 1–9. Each clue is the sum of its run, with no digit repeated in a run.</p>
        ${continueBanner}
        <button type="button" data-diff="daily" class="kk-diff-btn kk-diff-btn--daily">
          <span class="kk-diff-ico">📅</span>
          <span class="kk-diff-txt"><b>Daily Kakuro</b><small>${dailyMeta}</small></span>
          <span class="kk-diff-go">›</span>
        </button>
        ${DIFFS.filter((d) => d.id !== 'daily').map(diffRow).join('')}
        <div class="solo-hub-row">
          ${KB() ? '<button type="button" class="solo-link" id="kkArchive">Archive</button>' : ''}
          <button type="button" class="solo-link" id="kkStats">Stats</button>
          <button type="button" class="solo-link" id="kkRules">How to play</button>
          <button type="button" class="solo-link" id="kkSettings">Settings</button>
        </div>
      </div>`;

    const device = document.querySelector('.device');
    if (device) device.appendChild(overlay);
    else document.body.appendChild(overlay);
    if (typeof prepareGameOverlay === 'function') prepareGameOverlay(overlay, { theme: 'light', gameId: 'ankjod' });

    let unreg = null;
    const scopeId =
      ctx && ctx.overlayScope
        ? ctx.overlayScope
        : typeof window.OVERLAY_SCOPE_CHAT !== 'undefined'
          ? window.OVERLAY_SCOPE_CHAT
          : 'chat';
    if (typeof registerScopedOverlay === 'function') {
      unreg = registerScopedOverlay(scopeId, overlay, () => overlay.remove());
    }

    function close() {
      if (unreg) {
        try {
          unreg();
        } catch (e) {}
        unreg = null;
      }
      overlay.remove();
    }

    overlay.querySelector('#kkDiffBack').addEventListener('click', close);
    overlay.querySelector('#kkContinueLast')?.addEventListener('click', () => {
      if (!lastSave || !lastDiff) return;
      close();
      startAnkJodGame(ctx, lastDiff, { resume: lastSave });
    });
    overlay.querySelectorAll('.kk-diff-btn[data-diff]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const diff = btn.getAttribute('data-diff');
        const save = readAnkSave(diff);
        if (save) {
          offerContinueOrNew(ctx, diff, save, close);
          return;
        }
        if (diff === 'daily') {
          openDailyFlow(ctx, close);
          return;
        }
        close();
        startAnkJodGame(ctx, diff);
      });
    });
    overlay.querySelector('#kkArchive')?.addEventListener('click', () => openArchive(ctx, close));
    overlay.querySelector('#kkStats')?.addEventListener('click', openStats);
    overlay.querySelector('#kkRules')?.addEventListener('click', () => openRules('easy'));
    overlay.querySelector('#kkSettings')?.addEventListener('click', () => openKakuroSettings());
  }

  function openRules(diff) {
    if (window.DangalRules && DangalRules.openSheet) DangalRules.openSheet(GAME, { variants: { difficulty: diff === 'daily' || diff === 'archive' ? 'medium' : diff || 'easy' } });
  }

  function openKakuroSettings(onChange) {
    if (Hub()) Hub().openSettings(GAME, ['sound', 'haptics', 'timer', 'errors'], onChange);
  }

  /** Daily entry: first start of the day is the scored try (server token); later plays are practice. */
  function openDailyFlow(ctx, closeHub) {
    const H = Hub();
    const e = dailyEntry(todayNo());
    if (!H) {
      if (closeHub) closeHub();
      return startAnkJodGame(ctx, 'daily', { scored: false });
    }
    H.openDaily(GAME, {
      title: 'Daily Kakuro',
      detail: (e ? diffLabel(e.grade) + ' · ' : '') + 'fastest time wins · +30 s per hint',
      boardTitle: 'Daily Kakuro',
      onPlay: async (fresh) => {
        if (closeHub) closeHub();
        if (!fresh) return startAnkJodGame(ctx, 'daily', { scored: false, challenge: ctx && ctx.source === 'challenge' ? ctx : null });
        const r = await H.startDaily(GAME);
        if (!r.scored && typeof showToast === 'function') showToast('You’ve already played today’s Daily on another device — this one is practice');
        startAnkJodGame(ctx, 'daily', { scored: !!r.scored, challenge: ctx && ctx.source === 'challenge' ? ctx : null });
      },
    });
  }

  function shortDate(dayNo) {
    const key = SC() ? SC().dayKeyOf(dayNo) : '';
    const parts = key.split('-').map(Number);
    if (parts.length !== 3) return key;
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    try {
      return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    } catch (err) {
      return key;
    }
  }

  /** Past Dailies (practice — they're no longer ranked). Last 60 days, newest first. */
  function openArchive(ctx, closeHub) {
    if (!window.PartyKit || !PartyKit.openSheet) return;
    const prog = loadProgress();
    const today = todayNo();
    const from = Math.max(firstDay(), today - 60);
    const items = [];
    for (let d = today - 1; d >= from; d--) {
      const e = dailyEntry(d);
      if (!e) continue;
      const solved = !!prog.stars['d' + d];
      const best = prog.bests['d' + d];
      items.push(`<button type="button" class="kk-arch-row" data-day="${d}">
        <span class="kk-arch-date">${shortDate(d)}</span>
        <span class="kk-arch-meta">${diffLabel(e.grade)}${solved ? ' · ✓ ' + (best ? formatTime(best) : 'solved') : ''}</span>
      </button>`);
    }
    const x = PartyKit.openSheet({
      title: 'Daily archive',
      bodyHtml: `<div class="kk-arch">${items.length ? items.join('') : '<div class="solo-empty">The archive fills up as the days go by.</div>'}<p class="solo-note">Past Dailies are practice — only today’s counts for the leaderboard.</p></div>`,
    });
    if (!x || !x.el) return;
    x.el.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-day]');
      if (!b) return;
      const dayNo = Number(b.dataset.day);
      x.close();
      const save = readAnkSave('archive');
      if (save && save.dayNo === dayNo) return offerContinueOrNew(ctx, 'archive', save, closeHub);
      if (closeHub) closeHub();
      startAnkJodGame(ctx, 'daily', { dayNo, archive: true });
    });
  }

  function openStats() {
    if (!window.PartyKit || !PartyKit.openSheet) return;
    const prog = loadProgress();
    const rows = NUMBERED.concat(['daily'])
      .map((id) => {
        const s = prog.stats[id] || { played: 0, solved: 0, bestMs: 0, totalMs: 0 };
        const avg = s.solved ? formatTime(s.totalMs / s.solved) : '—';
        return `<tr><th>${diffLabel(id)}</th><td>${s.solved}/${s.played}</td><td>${s.bestMs ? formatTime(s.bestMs) : '—'}</td><td>${avg}</td></tr>`;
      })
      .join('');
    const st = Hub() ? Hub().streak(GAME) : 0;
    PartyKit.openSheet({
      title: 'Your Kakuro stats',
      bodyHtml: `<div class="kk-stats">
        <table class="kk-stats-table"><thead><tr><th></th><th>Solved</th><th>Best</th><th>Average</th></tr></thead><tbody>${rows}</tbody></table>
        <p class="solo-note">Daily streak: ${st} ${st === 1 ? 'day' : 'days'} · best ${prog.daily.best}</p>
      </div>`,
    });
  }

  function startAnkJodGame(ctx, difficulty, opts) {
    const options = opts || {};
    let puzzle;
    let resumeElapsed = 0;
    let resumeValues = null;
    let resumePencil = null;
    let resumeSelected = null;
    let resumePencilMode = false;
    let resumeHints = 0;

    if (options.resume) {
      try {
        puzzle = puzzleFromSave(options.resume);
        resumeElapsed = Math.max(0, Number(options.resume.elapsedMs) || 0);
        resumeValues = options.resume.values;
        resumePencil = options.resume.pencil;
        resumeSelected = Array.isArray(options.resume.selected) ? options.resume.selected : null;
        resumePencilMode = !!options.resume.pencilMode;
        resumeHints = Math.max(0, Number(options.resume.hintsUsed) || 0);
      } catch (e) {
        clearAnkSave(difficulty);
        puzzle = null;
      }
    }
    if (!puzzle) {
      try {
        puzzle = difficulty === 'daily' ? pickDailyPuzzle(options.dayNo) : pickPuzzle(difficulty, options.n);
      } catch (e) {
        puzzle = pickPuzzle('easy');
      }
      if (options.archive) puzzle.archive = true;
    }
    const isDaily = puzzle.difficulty === 'daily';
    // Only today's first Daily start is scored; archive days and replays are practice.
    const scored = isDaily && !puzzle.archive && (options.resume ? !!options.resume.scored : !!options.scored) && puzzle.dayNo === todayNo();
    const challenge = options.challenge && options.challenge.source === 'challenge' ? options.challenge : null;
    const statKey = isDaily ? 'daily' : puzzle.difficulty;
    let prefs = Hub() ? Hub().settings(GAME) : { timer: true, errors: 'mistake' };
    let pendingHint = null;
    let hintWrong = null;
    let winInfo = null;
    if (!options.resume && Hub()) {
      Hub().update(GAME, (p) => {
        const s = p.stats[statKey] || { played: 0, solved: 0, bestMs: 0, totalMs: 0 };
        s.played++;
        p.stats[statKey] = s;
        return p;
      });
    }
    const board = puzzle.board;
    const rows = board.length;
    const cols = board[0].length;
    const runs = extractRuns(board);
    const runIdx = cellRunsIndex(runs, rows, cols);

    let values = resumeValues
      ? resumeValues.map((row) => row.map((v) => (v >= 1 && v <= 9 ? v : 0)))
      : emptyValues(rows, cols);
    let pencil = resumePencil ? pencilFromJSON(resumePencil, rows, cols) : Array.from({ length: rows }, () => Array.from({ length: cols }, () => new Set()));
    let selected = null; // [r,c]
    let showMistakes = false;
    let pencilMode = resumePencilMode;
    let statusMsg = options.resume ? 'Resumed' : '';
    let won = false;
    let winShown = false;
    let timerId = null;
    let session = null;
    let pauseCtrl = null;
    let shellBuilt = false;
    let cellSize = 36;
    let hintFocusRun = null; // run index for Hint step 1
    let lastHintWasFocus = false;
    let hintsUsed = resumeHints;
    let hintFilled = new Set(); // "r,c" subtle style
    let coachEl = null;
    let saveTimer = null;

    const UNDO_MAX = 40;
    let undoStack = [];
    let redoStack = [];

    const root = document.createElement('div');
    root.style.cssText =
      'position:absolute;inset:0;background:var(--cream,#F7F3EC);z-index:80;display:flex;flex-direction:column;';
    if (typeof prepareGameOverlay === 'function') prepareGameOverlay(root, { theme: 'light', gameId: 'ankjod', coach: false });

    const diffMeta = DIFFS.find((d) => d.id === puzzle.difficulty) || DIFFS[0];
    const saveDiff = puzzle.archive ? 'archive' : puzzle.difficulty || difficulty || 'easy';
    const puzzleTitle = isDaily
      ? puzzle.archive
        ? 'Daily ' + (puzzle.dailyKey || '')
        : 'Daily Kakuro'
      : diffMeta.label + (puzzle.n ? ' #' + puzzle.n : '');
    const subtitle = isDaily
      ? (puzzle.archive ? 'Archive' : scored ? 'Daily · counts' : 'Daily · practice') + (puzzle.grade ? ' · ' + diffLabel(puzzle.grade) : '')
      : puzzleTitle;

    function getPlayElapsed() {
      return session ? session.getElapsedMs() : resumeElapsed;
    }

    function persistSave() {
      if (won) return;
      const rowsPack = packBoardRows(board, puzzle.solution);
      writeAnkSave(saveDiff, {
        v: SAVE_VER,
        difficulty: saveDiff,
        id: puzzle.id || fingerprintRowsSafe(rowsPack),
        dailyKey: puzzle.dailyKey || null,
        dayNo: puzzle.dayNo == null ? null : puzzle.dayNo,
        n: puzzle.n || null,
        grade: puzzle.grade || null,
        archive: !!puzzle.archive,
        scored,
        source: puzzle.source || 'play',
        rows: rowsPack,
        values: values.map((row) => row.slice()),
        pencil: pencilToJSON(pencil),
        elapsedMs: getPlayElapsed(),
        selected: selected ? [selected[0], selected[1]] : null,
        pencilMode,
        hintsUsed,
        savedAt: Date.now(),
      });
    }

    function scheduleSave() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveTimer = null;
        persistSave();
      }, 280);
    }

    function fingerprintRowsSafe(rowList) {
      try {
        return 'gen_' + hashSeed(rowList.join('|')).toString(16);
      } catch (e) {
        return 'gen_' + Date.now();
      }
    }

    function computeCellSize() {
      const availW = Math.max(240, (root.clientWidth || 360) - 28);
      const availH = Math.max(200, (root.clientHeight || 640) - 280);
      const byW = Math.floor(availW / Math.max(cols, 1));
      const byH = Math.floor(availH / Math.max(rows, 1));
      return Math.max(28, Math.min(52, byW, byH));
    }

    function snapCell(r, c) {
      return { r, c, value: values[r][c], pencil: [...(pencil[r][c] || [])] };
    }

    function applyCellSnap(s) {
      values[s.r][s.c] = s.value;
      pencil[s.r][s.c] = new Set(s.pencil || []);
    }

    function pushHistory(beforeCells, extra) {
      const x = extra || {};
      undoStack.push({
        cells: beforeCells,
        selected: selected ? selected.slice() : null,
        pencilMode,
        showMistakes,
        hintFocusRun,
        hintFilled: [...hintFilled],
        ...x,
      });
      if (undoStack.length > UNDO_MAX) undoStack.shift();
      redoStack = [];
      updateUndoButtons();
    }

    function captureSelectionMutations(mutateFn) {
      if (won || !selected) return false;
      const [r, c] = selected;
      const before = [snapCell(r, c)];
      mutateFn(r, c);
      pushHistory(before);
      return true;
    }

    function restoreMeta(entry) {
      selected = entry.selected;
      hintFocusRun = entry.hintFocusRun != null ? entry.hintFocusRun : null;
      hintFilled = new Set(entry.hintFilled || []);
      showMistakes = false;
      statusMsg = '';
    }

    function undo() {
      if (won || !undoStack.length) return;
      const entry = undoStack.pop();
      const reverse = entry.cells.map((s) => snapCell(s.r, s.c));
      redoStack.push({
        cells: reverse,
        selected: selected ? selected.slice() : null,
        pencilMode,
        showMistakes,
        hintFocusRun,
        hintFilled: [...hintFilled],
      });
      entry.cells.forEach(applyCellSnap);
      restoreMeta(entry);
      updateUndoButtons();
      fb('select');
      scheduleSave();
      refreshPlay();
    }

    function redo() {
      if (won || !redoStack.length) return;
      const entry = redoStack.pop();
      const reverse = entry.cells.map((s) => snapCell(s.r, s.c));
      undoStack.push({
        cells: reverse,
        selected: selected ? selected.slice() : null,
        pencilMode,
        showMistakes,
        hintFocusRun,
        hintFilled: [...hintFilled],
      });
      if (undoStack.length > UNDO_MAX) undoStack.shift();
      entry.cells.forEach(applyCellSnap);
      restoreMeta(entry);
      updateUndoButtons();
      fb('select');
      scheduleSave();
      refreshPlay();
    }

    function updateUndoButtons() {
      const u = root.querySelector('#kkUndo');
      const r = root.querySelector('#kkRedo');
      if (u) u.disabled = !undoStack.length || won;
      if (r) r.disabled = !redoStack.length || won;
    }

    function legalDigits(r, c) {
      const set = new Set(candidatesForCell(values, runs, runIdx, r, c));
      const cur = values[r][c];
      if (cur) set.add(cur); // allow overwrite / keep current
      return set;
    }

    function highlightSets() {
      const runKeys = new Set();
      const clueMeta = new Map(); // "r,c" -> { across, down }
      const hintKeys = new Set();
      if (won) return { runKeys, clueMeta, hintKeys };

      function addRun(run, asHint) {
        run.cells.forEach(([r, c]) => {
          const key = r + ',' + c;
          if (asHint) hintKeys.add(key);
          else if (!(selected && selected[0] === r && selected[1] === c)) runKeys.add(key);
        });
        const ck = run.clueR + ',' + run.clueC;
        const meta = clueMeta.get(ck) || { across: false, down: false };
        if (run.dir === 'across') meta.across = true;
        else meta.down = true;
        clueMeta.set(ck, meta);
      }

      if (hintFocusRun != null && runs[hintFocusRun]) addRun(runs[hintFocusRun], true);
      if (pendingHint) hintKeys.add(pendingHint.r + ',' + pendingHint.c);
      if (selected) {
        const [sr, sc] = selected;
        (runIdx[sr][sc] || []).forEach((i) => addRun(runs[i], false));
      }
      return { runKeys, clueMeta, hintKeys };
    }

    function remainingCombos(run) {
      const filled = [];
      run.cells.forEach(([r, c]) => {
        const v = values[r][c];
        if (v) filled.push(v);
      });
      return combosFor(run.sum, run.cells.length).filter((combo) =>
        filled.every((f) => combo.indexOf(f) !== -1)
      );
    }

    function findMostConstrainedRun() {
      let best = null;
      let bestN = Infinity;
      runs.forEach((run, i) => {
        const empty = run.cells.filter(([r, c]) => !values[r][c]).length;
        if (!empty) return;
        const rem = remainingCombos(run);
        if (!rem.length) return;
        if (rem.length < bestN || (rem.length === bestN && empty < (best ? best.empty : 99))) {
          bestN = rem.length;
          best = { i, run, rem, empty };
        }
      });
      return best;
    }

    function findForcedCell() {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (board[r][c].kind !== 'cell' || values[r][c]) continue;
          const cands = candidatesForCell(values, runs, runIdx, r, c);
          if (cands.length === 1) return { r, c, n: cands[0] };
        }
      }
      return null;
    }

    /**
     * Hint (kakuro-core nextHint): first tap flags a wrong digit or explains the next logical step in
     * plain words and highlights the cell; tapping Hint again fills that cell in. One hint per explanation.
     */
    function applyHint() {
      if (won) return;
      const K = KC();
      if (!K || !puzzle.solution) return legacyHint();
      if (pendingHint && !values[pendingHint.r][pendingHint.c]) {
        const h = pendingHint;
        pendingHint = null;
        pushHistory([snapCell(h.r, h.c)]);
        values[h.r][h.c] = h.n;
        pencil[h.r][h.c].clear();
        hintFilled.add(h.r + ',' + h.c);
        selected = [h.r, h.c];
        hintFocusRun = null;
        showMistakes = false;
        statusMsg = 'Filled in ' + h.n + '.';
        fb('valid');
        const a = analyzeMistakes(board, values);
        if (a.won) finishWin();
        else {
          scheduleSave();
          refreshPlay();
        }
        return;
      }
      pendingHint = null;
      let h = null;
      try {
        h = K.nextHint(packBoardRows(board, puzzle.solution), values.flat());
      } catch (e) {
        return legacyHint();
      }
      if (!h || h.kind === 'none' || h.cell < 0) {
        statusMsg = h ? h.text : 'No hint available right now';
        refreshPlay();
        return;
      }
      hintsUsed++;
      const r = Math.floor(h.cell / cols);
      const c = h.cell % cols;
      selected = [r, c];
      hintFocusRun = null;
      if (h.kind === 'wrong') {
        hintWrong = r + ',' + c;
        statusMsg = h.text;
      } else {
        pendingHint = { r, c, n: h.digit };
        statusMsg = h.text + ' Tap Hint again to fill it in.';
      }
      fb('select');
      scheduleSave();
      refreshPlay();
    }

    function legacyHint() {
      if (won) return;
      hintsUsed++;
      const forced = findForcedCell();
      if (forced) {
        lastHintWasFocus = false;
        hintFocusRun = null;
        const before = [snapCell(forced.r, forced.c)];
        pushHistory(before);
        values[forced.r][forced.c] = forced.n;
        pencil[forced.r][forced.c].clear();
        hintFilled.add(forced.r + ',' + forced.c);
        selected = [forced.r, forced.c];
        showMistakes = false;
        statusMsg = 'Hint: only ' + forced.n + ' fits here';
        fb('valid');
        const a = analyzeMistakes(board, values);
        if (a.won) finishWin();
        else {
          scheduleSave();
          refreshPlay();
        }
        return;
      }

      const tight = findMostConstrainedRun();
      if (tight) {
        const escalate = lastHintWasFocus && hintFocusRun === tight.i;
        if (!escalate) {
          const prevFocus = hintFocusRun;
          const prevSel = selected ? selected.slice() : null;
          pushHistory([], { hintFocusRun: prevFocus, selected: prevSel });
          hintFocusRun = tight.i;
          lastHintWasFocus = true;
          const emptyCell = tight.run.cells.find(([r, c]) => !values[r][c]);
          if (emptyCell) selected = emptyCell.slice();
          const dir = tight.run.dir === 'across' ? 'across' : 'down';
          statusMsg =
            'This ' +
            dir +
            ' run of ' +
            tight.run.cells.length +
            ' sums to ' +
            tight.run.sum +
            ' — ' +
            tight.rem.length +
            ' combo set' +
            (tight.rem.length === 1 ? '' : 's') +
            ' left';
          fb('select');
          refreshPlay();
          return;
        }
      }

      // Last resort: reveal one solution digit
      lastHintWasFocus = false;
      hintFocusRun = null;
      const sol = puzzle.solution;
      if (!sol) {
        statusMsg = 'No more hints available';
        refreshPlay();
        return;
      }
      let pick = null;
      for (let r = 0; r < rows && !pick; r++) {
        for (let c = 0; c < cols; c++) {
          if (board[r][c].kind !== 'cell') continue;
          const want = sol[r][c];
          if (!want) continue;
          if (values[r][c] !== want) {
            pick = { r, c, n: want };
            break;
          }
        }
      }
      if (!pick) {
        statusMsg = 'Board already matches the solution path';
        refreshPlay();
        return;
      }
      const before = [snapCell(pick.r, pick.c)];
      pushHistory(before);
      values[pick.r][pick.c] = pick.n;
      pencil[pick.r][pick.c].clear();
      hintFilled.add(pick.r + ',' + pick.c);
      selected = [pick.r, pick.c];
      showMistakes = false;
      statusMsg = 'Hint: revealed a correct digit';
      fb('valid');
      const a = analyzeMistakes(board, values);
      if (a.won) finishWin();
      else refreshPlay();
    }

    function autoNotes(scope) {
      if (won) return;
      const before = [];
      const cells = [];
      if (scope === 'run' && selected) {
        const [sr, sc] = selected;
        const ids = runIdx[sr][sc] || [];
        ids.forEach((i) => {
          runs[i].cells.forEach(([r, c]) => cells.push([r, c]));
        });
      } else {
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (board[r][c].kind === 'cell') cells.push([r, c]);
          }
        }
      }
      const seen = new Set();
      cells.forEach(([r, c]) => {
        const key = r + ',' + c;
        if (seen.has(key)) return;
        seen.add(key);
        if (values[r][c]) return;
        const legal = candidatesForCell(values, runs, runIdx, r, c);
        const cur = [...(pencil[r][c] || [])].sort().join(',');
        const next = legal.slice().sort().join(',');
        if (cur === next) return;
        before.push(snapCell(r, c));
        pencil[r][c] = new Set(legal);
      });
      if (!before.length) {
        statusMsg = 'Notes already match candidates';
        refreshPlay();
        return;
      }
      pushHistory(before);
      statusMsg = scope === 'run' ? 'Auto-notes on this run' : 'Auto-notes on empty cells';
      fb('place');
      scheduleSave();
      refreshPlay();
    }

    function cleanPencils(scope) {
      if (won) return;
      const before = [];
      const cells = [];
      if (scope === 'run' && selected) {
        const [sr, sc] = selected;
        (runIdx[sr][sc] || []).forEach((i) => {
          runs[i].cells.forEach(([r, c]) => cells.push([r, c]));
        });
      } else {
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (board[r][c].kind === 'cell') cells.push([r, c]);
          }
        }
      }
      const seen = new Set();
      cells.forEach(([r, c]) => {
        const key = r + ',' + c;
        if (seen.has(key)) return;
        seen.add(key);
        if (values[r][c] || !pencil[r][c] || !pencil[r][c].size) return;
        const legal = new Set(candidatesForCell(values, runs, runIdx, r, c));
        let changed = false;
        const next = new Set();
        pencil[r][c].forEach((n) => {
          if (legal.has(n)) next.add(n);
          else changed = true;
        });
        if (!changed && next.size === pencil[r][c].size) return;
        before.push(snapCell(r, c));
        pencil[r][c] = next;
      });
      if (!before.length) {
        statusMsg = 'No illegal notes to clean';
        refreshPlay();
        return;
      }
      pushHistory(before);
      statusMsg = 'Cleaned impossible pencil notes';
      fb('select');
      scheduleSave();
      refreshPlay();
    }

    function showCoach(force) {
      const key = 'ankjod_coach_v1';
      try {
        if (!force && localStorage.getItem(key)) return;
      } catch (e) {
        return;
      }
      if (coachEl) {
        coachEl.remove();
        coachEl = null;
      }
      coachEl = document.createElement('div');
      coachEl.className = 'kk-coach';
      coachEl.innerHTML = `
        <div class="kk-coach-card" role="dialog" aria-label="Kakuro tips">
          <div class="kk-coach-title">Kakuro</div>
          <ul class="kk-coach-tips">
            <li>Fill each run of white cells with digits 1–9 — no repeats inside a run</li>
            <li>A clue is the sum of the run to its right (across) or below it (down)</li>
            <li>Pencil for notes · Auto-notes fills them in · Sums lists the digit sets for a run</li>
            <li>Hint explains the next step — tap it again to fill the cell in</li>
            <li>Leave anytime — Continue restores your board and timer</li>
          </ul>
          <button type="button" class="kk-coach-dismiss game-tap-target" data-kk-coach-ok>Got it</button>
        </div>`;
      root.appendChild(coachEl);
      const dismiss = () => {
        try {
          localStorage.setItem(key, '1');
        } catch (e) {}
        if (coachEl) {
          coachEl.remove();
          coachEl = null;
        }
      };
      coachEl.querySelector('[data-kk-coach-ok]')?.addEventListener('click', dismiss);
      coachEl.addEventListener('click', (e) => {
        if (e.target === coachEl) dismiss();
      });
    }

    function statusForSelection() {
      if (won) return 'Puzzle solved!';
      if (statusMsg) return statusMsg;
      if (!selected) return pencilMode ? 'Pencil mode — tap digits for notes' : 'Tap a cell, then a digit';
      const [sr, sc] = selected;
      const bits = [];
      (runIdx[sr][sc] || []).forEach((i) => {
        const run = runs[i];
        bits.push((run.dir === 'across' ? 'Across ' : 'Down ') + run.sum);
      });
      return bits.join(' · ') || (pencilMode ? 'Pencil mode' : 'Enter a digit');
    }

    function cellInnerHtml(r, c, pencilFs) {
      const v = values[r][c];
      if (v) return String(v);
      const marks = [...(pencil[r][c] || [])].sort((a, b) => a - b);
      if (!marks.length) return '';
      return `<span class="kk-pencil" style="font-size:${pencilFs}px;">${[1, 2, 3, 4, 5, 6, 7, 8, 9]
        .map((n) => `<i>${marks.includes(n) ? n : ''}</i>`)
        .join('')}</span>`;
    }

    function refreshPlay() {
      if (won && winShown) {
        paintWinResult();
        return;
      }
      if (!shellBuilt) {
        buildShell();
        shellBuilt = true;
      }
      const bad = new Set();
      const errMode = prefs.errors || 'mistake';
      if (!won) {
        if (errMode === 'mistake') wrongCells().forEach((k) => bad.add(k));
        if (showMistakes && errMode !== 'off') {
          analyzeMistakes(board, values).bad.forEach((k) => bad.add(k));
          wrongCells().forEach((k) => bad.add(k));
        }
        if (hintWrong) {
          const [hr, hc] = hintWrong.split(',').map(Number);
          if (values[hr][hc] && puzzle.solution && values[hr][hc] !== puzzle.solution[hr][hc]) bad.add(hintWrong);
          else hintWrong = null;
        }
      }
      const softBad = false;
      const { runKeys, clueMeta, hintKeys } = highlightSets();
      const digitFs = Math.max(14, Math.floor(cellSize * 0.42));
      const pencilFs = Math.max(7, Math.floor(cellSize * 0.22));
      const clueFs = Math.max(8, Math.floor(cellSize * 0.26));

      root.querySelectorAll('.kk-cell--play').forEach((btn) => {
        const r = +btn.dataset.r;
        const c = +btn.dataset.c;
        const key = r + ',' + c;
        const isSel = selected && selected[0] === r && selected[1] === c;
        btn.className =
          'kk-cell kk-cell--play' +
          (isSel ? ' is-selected' : '') +
          (runKeys.has(key) ? ' is-run' : '') +
          (hintKeys.has(key) ? ' is-hint-run' : '') +
          (bad.has(key) ? (softBad ? ' is-soft-bad' : ' is-bad') : '') +
          (hintFilled.has(key) ? ' is-hint-fill' : '') +
          (won ? ' is-won' : '');
        btn.style.fontSize = digitFs + 'px';
        btn.innerHTML = cellInnerHtml(r, c, pencilFs);
      });

      root.querySelectorAll('.kk-cell--clue').forEach((el) => {
        const r = +el.dataset.r;
        const c = +el.dataset.c;
        const key = r + ',' + c;
        const meta = clueMeta.get(key);
        el.classList.toggle('is-clue-hot', !!meta);
        el.style.fontSize = clueFs + 'px';
        const da = el.querySelector('.kk-clue-d');
        const aa = el.querySelector('.kk-clue-a');
        if (da) da.classList.toggle('is-hot', !!(meta && meta.down));
        if (aa) aa.classList.toggle('is-hot', !!(meta && meta.across));
      });

      const statusEl = root.querySelector('#kkStatus');
      if (statusEl) {
        statusEl.className = 'kk-status' + (won ? ' kk-status--won' : '');
        statusEl.textContent = statusForSelection();
      }

      const legal = selected ? legalDigits(selected[0], selected[1]) : null;
      root.querySelectorAll('.kk-num').forEach((btn) => {
        const n = +btn.dataset.n;
        const ok = !selected || !legal || legal.has(n);
        btn.disabled = !ok || won;
        btn.classList.toggle('is-dim', !ok);
      });

      const pen = root.querySelector('#kkPencil');
      if (pen) {
        pen.classList.toggle('is-active', pencilMode);
        pen.textContent = pencilMode ? 'Pencil on' : 'Pencil';
      }
      const timerEl = root.querySelector('#kkTimer');
      if (timerEl) timerEl.hidden = !prefs.timer;
      updateUndoButtons();
    }

    /** Filled cells that disagree with the (unique) solution, as "r,c" keys. */
    function wrongCells() {
      const out = [];
      const sol = puzzle.solution;
      if (!sol) return out;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (board[r][c].kind === 'cell' && values[r][c] && sol[r][c] && values[r][c] !== sol[r][c]) out.push(r + ',' + c);
        }
      }
      return out;
    }

    /** Combination helper: digit sets for the selected cell's runs, plus a lookup for any sum. */
    function openSums() {
      if (!window.PartyKit || !PartyKit.openSheet) return;
      const K = KC();
      const combosOf = (sum, len, must) =>
        K ? K.combos(sum, len, must) : combosFor(sum, len).filter((cb) => must.every((m) => cb.indexOf(m) !== -1));
      const listHtml = (sum, len, must) => {
        const all = combosOf(sum, len, []);
        const fits = new Set(combosOf(sum, len, must).map((cb) => cb.join('')));
        if (!all.length) return '<div class="solo-empty">No digit set makes that sum.</div>';
        return `<div class="kk-sums-list">${all
          .map((cb) => `<span class="${fits.has(cb.join('')) ? '' : 'is-out'}">${cb.join(' ')}</span>`)
          .join('')}</div>`;
      };
      let sections = '';
      if (selected) {
        (runIdx[selected[0]][selected[1]] || []).forEach((i) => {
          const run = runs[i];
          const filled = run.cells.map(([r, c]) => values[r][c]).filter(Boolean);
          sections += `<div class="kk-sums-run"><b>${run.dir === 'across' ? 'Across' : 'Down'} ${run.sum} in ${run.cells.length} cells</b>${
            filled.length ? `<small>Already placed: ${filled.join(', ')} — sets without them are greyed out</small>` : ''
          }${listHtml(run.sum, run.cells.length, filled)}</div>`;
        });
      }
      const lenOpts = [2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<option value="${n}">${n} cells</option>`).join('');
      const x = PartyKit.openSheet({
        title: 'Sums helper',
        bodyHtml: `<div class="kk-sums">${sections || '<p class="solo-note">Select a cell to see the digit sets for its runs.</p>'}
          <div class="kk-sums-run"><b>Look up any sum</b>
            <div class="kk-sums-pick"><select data-k="len" aria-label="Cells">${lenOpts}</select><select data-k="sum" aria-label="Sum"></select></div>
            <div data-k="out"></div></div></div>`,
      });
      if (!x || !x.el) return;
      const lenSel = x.el.querySelector('[data-k="len"]');
      const sumSel = x.el.querySelector('[data-k="sum"]');
      const out = x.el.querySelector('[data-k="out"]');
      const fillSums = () => {
        const L = Number(lenSel.value);
        const lo = (L * (L + 1)) / 2;
        const hi = (L * (19 - L)) / 2;
        const keep = Number(sumSel.value);
        let opts = '';
        for (let s = lo; s <= hi; s++) opts += `<option value="${s}"${s === keep ? ' selected' : ''}>sum ${s}</option>`;
        sumSel.innerHTML = opts;
        out.innerHTML = listHtml(Number(sumSel.value), L, []);
      };
      lenSel.addEventListener('change', fillSums);
      sumSel.addEventListener('change', () => (out.innerHTML = listHtml(Number(sumSel.value), Number(lenSel.value), [])));
      fillSums();
    }

    function paint() {
      refreshPlay();
    }

    function buildShell() {
      cellSize = computeCellSize();
      const clueFs = Math.max(8, Math.floor(cellSize * 0.26));
      let gridHtml = '';
      for (let r = 0; r < rows; r++) {
        gridHtml += '<div class="kk-row">';
        for (let c = 0; c < cols; c++) {
          const cell = board[r][c];
          if (cell.kind === 'wall') {
            gridHtml += `<div class="kk-cell kk-cell--wall" style="width:${cellSize}px;height:${cellSize}px;"></div>`;
          } else if (cell.kind === 'clue') {
            const lab = clueLabel(cell);
            gridHtml += `<div class="kk-cell kk-cell--clue" data-r="${r}" data-c="${c}" style="width:${cellSize}px;height:${cellSize}px;font-size:${clueFs}px;">
              <svg width="100%" height="100%" viewBox="0 0 40 40" preserveAspectRatio="none" aria-hidden="true">
                <line x1="0" y1="0" x2="40" y2="40" stroke="#5A5348" stroke-width="1"/>
              </svg>
              ${lab.d ? `<span class="kk-clue-d">${lab.d}</span>` : ''}
              ${lab.a ? `<span class="kk-clue-a">${lab.a}</span>` : ''}
            </div>`;
          } else {
            gridHtml += `<button type="button" data-r="${r}" data-c="${c}" class="kk-cell kk-cell--play" style="width:${cellSize}px;height:${cellSize}px;"></button>`;
          }
        }
        gridHtml += '</div>';
      }

      const padBtns = [1, 2, 3, 4, 5, 6, 7, 8, 9]
        .map((n) => `<button type="button" data-n="${n}" class="kk-num game-tap-target">${n}</button>`)
        .join('');

      const elapsed = getPlayElapsed();
      root.innerHTML = `
        ${gameChromeHtml({
          title: 'Kakuro',
          subtitle,
          backId: 'kkBack',
          pauseId: 'kkPause',
          rightHtml: `<button type="button" id="kkHelp" class="game-chrome-action game-tap-target" aria-label="How to play">?</button><button type="button" id="kkGear" class="game-chrome-action game-tap-target" aria-label="Settings">⚙</button><button type="button" id="kkNew" class="game-chrome-action">Menu</button>`,
        })}
        <div id="kkTimer" class="game-turn game-turn--waiting" role="status"${prefs.timer ? '' : ' hidden'}>${formatTime(elapsed)}</div>
        <div class="kk-board-area">
          ${challenge && Hub() ? Hub().targetHtml(challenge) : ''}
          <div id="kkStatus" class="kk-status" aria-live="polite"></div>
          <div id="kkGrid" class="kk-grid">${gridHtml}</div>
        </div>
        <div class="kk-keypad">
          <div class="kk-num-row">${padBtns}</div>
          <div class="kk-action-row">
            <button type="button" id="kkPencil" class="kk-action game-tap-target" title="Tap: pencil mode · Long-press: auto-notes">Pencil</button>
            <button type="button" id="kkHint" class="kk-action game-tap-target">Hint</button>
            <button type="button" id="kkErase" class="kk-action game-tap-target">Erase</button>
            <button type="button" id="kkCheck" class="kk-action kk-action--primary game-tap-target">Check</button>
          </div>
          <div class="kk-action-row kk-action-row--secondary">
            <button type="button" id="kkUndo" class="kk-action game-tap-target" disabled>Undo</button>
            <button type="button" id="kkRedo" class="kk-action game-tap-target" disabled>Redo</button>
            <button type="button" id="kkAuto" class="kk-action game-tap-target" title="Fill notes with every digit that still fits">Auto-notes</button>
            <button type="button" id="kkSums" class="kk-action game-tap-target" title="Digit sets for this run">Sums</button>
          </div>
          <div class="kk-action-row kk-action-row--secondary">
            <button type="button" id="kkClean" class="kk-action game-tap-target">Clean notes</button>
            <button type="button" id="kkClear" class="kk-action game-tap-target">Clear all</button>
          </div>
        </div>`;

      wireShellHandlers();
      showCoach(false);
    }

    function wireShellHandlers() {
      if (pauseCtrl) {
        try {
          pauseCtrl.destroy();
        } catch (e) {}
        pauseCtrl = null;
      }
      if (typeof createGamePauseController === 'function' && !won) {
        pauseCtrl = createGamePauseController({
          host: root,
          pauseBtnId: 'kkPause',
          onPause: () => {
            if (session && typeof session.pauseClock === 'function') session.pauseClock();
          },
          onResume: () => {
            if (session && typeof session.resumeClock === 'function') session.resumeClock();
          },
          onQuit: () => {
            persistSave();
            if (session) session.end(won ? 'won' : 'quit');
          },
        });
      }

      root.querySelector('#kkBack')?.addEventListener('click', () => {
        if (won) {
          if (session) session.end('won');
          return;
        }
        const ask =
          typeof confirmLeaveGame === 'function'
            ? confirmLeaveGame({
                title: 'Leave Kakuro?',
                body: scored ? 'Your board and time are saved — Continue from the menu to finish today’s scored try.' : 'Progress will be saved — you can Continue later.',
              })
            : Promise.resolve(window.confirm('Leave Kakuro? Progress will be saved.'));
        Promise.resolve(ask).then((ok) => {
          if (!ok) return;
          persistSave();
          if (session) session.end('quit');
        });
      });
      root.querySelector('#kkNew')?.addEventListener('click', () => {
        persistSave();
        if (session) session.end('restart');
        openDifficultyPicker(ctx);
      });

      root.querySelector('#kkGrid')?.addEventListener('click', (e) => {
        const btn = e.target.closest?.('.kk-cell--play');
        if (!btn || won) return;
        selected = [+btn.dataset.r, +btn.dataset.c];
        statusMsg = '';
        fb('select');
        refreshPlay();
      });

      root.querySelectorAll('.kk-num').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (btn.disabled) {
            fb('invalid');
            return;
          }
          placeDigit(+btn.dataset.n);
        });
      });

      root.querySelector('#kkErase')?.addEventListener('click', eraseCell);
      root.querySelector('#kkUndo')?.addEventListener('click', undo);
      root.querySelector('#kkRedo')?.addEventListener('click', redo);
      root.querySelector('#kkHint')?.addEventListener('click', applyHint);
      root.querySelector('#kkClean')?.addEventListener('click', () => cleanPencils(selected ? 'run' : 'board'));
      root.querySelector('#kkAuto')?.addEventListener('click', () => autoNotes('board'));
      root.querySelector('#kkSums')?.addEventListener('click', openSums);
      root.querySelector('#kkHelp')?.addEventListener('click', () => openRules(puzzle.archive ? 'archive' : puzzle.difficulty));
      root.querySelector('#kkGear')?.addEventListener('click', () =>
        openKakuroSettings((ns) => {
          prefs = ns;
          refreshPlay();
        })
      );
      root.querySelector('#kkClear')?.addEventListener('click', () => {
        if (won) return;
        const ask =
          typeof confirmLeaveGame === 'function'
            ? confirmLeaveGame({ title: 'Clear all cells?', body: 'Every digit and pencil note on this board will be erased.' })
            : Promise.resolve(window.confirm('Clear the entire board?'));
        Promise.resolve(ask).then((ok) => {
          if (!ok) return;
          const before = [];
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              if (board[r][c].kind !== 'cell') continue;
              if (values[r][c] || (pencil[r][c] && pencil[r][c].size)) before.push(snapCell(r, c));
            }
          }
          if (before.length) pushHistory(before);
          values = emptyValues(rows, cols);
          pencil = Array.from({ length: rows }, () => Array.from({ length: cols }, () => new Set()));
          showMistakes = false;
          hintFocusRun = null;
          hintFilled = new Set();
          statusMsg = 'Board cleared';
          scheduleSave();
          refreshPlay();
        });
      });

      const pencilBtn = root.querySelector('#kkPencil');
      let pencilTimer = null;
      let pencilLong = false;
      if (pencilBtn) {
        const clearPencilTimer = () => {
          if (pencilTimer) {
            clearTimeout(pencilTimer);
            pencilTimer = null;
          }
        };
        pencilBtn.addEventListener('pointerdown', (e) => {
          if (won) return;
          pencilLong = false;
          clearPencilTimer();
          pencilTimer = setTimeout(() => {
            pencilLong = true;
            autoNotes(selected ? 'run' : 'board');
            fb('valid');
          }, 450);
          try {
            pencilBtn.setPointerCapture(e.pointerId);
          } catch (err) {}
        });
        pencilBtn.addEventListener('pointerup', () => {
          clearPencilTimer();
          if (pencilLong || won) return;
          pencilMode = !pencilMode;
          statusMsg = pencilMode ? 'Pencil mode on · long-press for auto-notes' : 'Digit mode';
          fb('select');
          refreshPlay();
        });
        pencilBtn.addEventListener('pointercancel', clearPencilTimer);
      }

      root.querySelector('#kkCheck')?.addEventListener('click', () => {
        if (won) return;
        const a = analyzeMistakes(board, values);
        showMistakes = true;
        if (a.won) finishWin();
        else {
          const wrong = wrongCells().length;
          const issues = wrong || a.bad.size;
          if (prefs.errors === 'off') statusMsg = issues ? 'Something’s not right yet — keep looking' : 'No mistakes so far — keep going';
          else if (wrong && !a.bad.size) statusMsg = wrong === 1 ? '1 digit is wrong — marked in red' : wrong + ' digits are wrong — marked in red';
          else statusMsg = checkStatusMessage(a);
          fb(issues ? 'invalid' : 'select');
          refreshPlay();
        }
      });
    }

    function advanceAfterPlace(r, c) {
      const ids = runIdx[r][c] || [];
      let across = null;
      let down = null;
      ids.forEach((i) => {
        if (runs[i].dir === 'across') across = runs[i];
        else down = runs[i];
      });
      const primary = across || down;
      if (!primary) return;
      const cells = primary.cells;
      const idx = cells.findIndex(([rr, cc]) => rr === r && cc === c);
      for (let i = idx + 1; i < cells.length; i++) {
        const [rr, cc] = cells[i];
        if (!values[rr][cc]) {
          selected = [rr, cc];
          return;
        }
      }
      for (let i = 0; i < idx; i++) {
        const [rr, cc] = cells[i];
        if (!values[rr][cc]) {
          selected = [rr, cc];
          return;
        }
      }
    }

    function placeDigit(n) {
      if (won || !selected) return;
      const [r, c] = selected;
      const legal = legalDigits(r, c);
      if (!legal.has(n)) {
        fb('invalid');
        statusMsg = 'That digit can’t fit this run';
        refreshPlay();
        return;
      }
      if (pencilMode) {
        captureSelectionMutations(() => {
          values[r][c] = 0;
          const set = pencil[r][c];
          if (set.has(n)) set.delete(n);
          else set.add(n);
        });
        showMistakes = false;
        statusMsg = '';
        fb('select');
        scheduleSave();
        refreshPlay();
        return;
      }
      if (values[r][c] === n) {
        // no-op overwrite
        return;
      }
      captureSelectionMutations(() => {
        values[r][c] = n;
        pencil[r][c].clear();
      });
      showMistakes = false;
      statusMsg = '';
      fb('place');
      const a = analyzeMistakes(board, values);
      if (a.won) finishWin();
      else {
        advanceAfterPlace(r, c);
        scheduleSave();
        refreshPlay();
      }
    }

    function eraseCell() {
      if (won || !selected) return;
      const [r, c] = selected;
      if (!values[r][c] && !(pencil[r][c] && pencil[r][c].size)) return;
      captureSelectionMutations(() => {
        values[r][c] = 0;
        pencil[r][c].clear();
      });
      showMistakes = false;
      statusMsg = '';
      fb('select');
      scheduleSave();
      refreshPlay();
    }

    function nextPuzzleNumber() {
      const L = bankList(puzzle.difficulty).length;
      if (!L || !puzzle.n) return null;
      const nx = nextNumber(puzzle.difficulty);
      return nx === puzzle.n ? (puzzle.n % L) + 1 : nx;
    }

    function shareWin() {
      const H = Hub();
      if (!H || !winInfo) return;
      const params = isDaily ? { mode: 'daily', day: puzzle.dayNo } : { diff: puzzle.difficulty, n: puzzle.n };
      H.share(GAME, {
        title: puzzleTitle,
        line: winInfo.line,
        score: winInfo.secs,
        label: formatTime(winInfo.ms),
        params,
        text: `Kakuro ${puzzleTitle}: solved in ${winInfo.line}. Can you beat my time?`,
      });
    }

    function paintWinResult() {
      shellBuilt = false;
      if (pauseCtrl) {
        try {
          pauseCtrl.destroy();
        } catch (e) {}
        pauseCtrl = null;
      }
      const w = winInfo || { ms: getPlayElapsed(), line: formatTime(getPlayElapsed()), vsBest: '', status: '', board: null, note: '' };
      const H = Hub();
      const nextN = !isDaily ? nextPuzzleNumber() : null;
      const streak = isDaily && !puzzle.archive && H ? H.streak(GAME) : 0;
      const body = H
        ? H.resultHtml({
            title: 'Solved · ' + puzzleTitle,
            lines: [`<b>${w.line}</b>`, w.vsBest, streak ? `🔥 ${streak} day streak` : ''],
            status: w.status,
            primary: nextN ? 'Next puzzle' : 'More puzzles',
            share: true,
            board: !!w.board,
            closeLabel: 'Done',
          })
        : `<div class="kk-status kk-status--won">Puzzle solved! ${w.line}</div>`;
      root.innerHTML = `
        ${gameChromeHtml({ title: 'Kakuro', subtitle, backId: 'kkBack' })}
        <div class="kk-board-area kk-result">${body}<p class="solo-res-hint" id="kkSubmitNote">${w.note || ''}</p></div>`;
      root.querySelector('#kkBack')?.addEventListener('click', () => {
        if (session) session.end('won');
      });
      if (!H) return;
      H.wireResult(root, {
        primary: () => {
          if (session) session.end('restart');
          if (nextN) startAnkJodGame(ctx, puzzle.difficulty, { n: nextN });
          else openDifficultyPicker(ctx);
        },
        share: shareWin,
        board: () => w.board && H.openBoard(GAME, w.board, { title: 'Kakuro · ' + puzzleTitle }),
        close: () => {
          if (session) session.end('won');
        },
      });
    }

    /** White-cell digits in row-major order — the plausibility payload server-lib/solo-scores.js checks. */
    function solutionDigits() {
      let s = '';
      let n = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (board[r][c].kind === 'cell') {
            s += String(values[r][c] || 0);
            n++;
          }
        }
      }
      return { s, n };
    }

    function finishWin() {
      if (won) return;
      won = true;
      winShown = true;
      showMistakes = false;
      pendingHint = null;
      statusMsg = 'Puzzle solved!';
      clearAnkSave(saveDiff);
      const ms = Math.round(getPlayElapsed());
      const secs = Math.round(ms / 1000);
      const pkey = isDaily ? (puzzle.dayNo != null ? 'd' + puzzle.dayNo : null) : puzzle.n && puzzle.source === 'bank' ? puzzleKey(puzzle.difficulty, puzzle.n) : null;
      const pbId = typeof ankJodPbGameId === 'function' ? ankJodPbGameId(puzzle.difficulty) : 'ankjod';
      const vsBest = typeof formatVsBest === 'function' ? formatVsBest(pbId, secs) : '';
      if (typeof setGamePB === 'function') setGamePB(pbId, secs);
      let prevBest = 0;
      if (Hub()) {
        Hub().update(GAME, (p) => {
          const s = p.stats[statKey] || { played: 0, solved: 0, bestMs: 0, totalMs: 0 };
          s.solved++;
          s.played = Math.max(s.played, s.solved);
          s.totalMs += ms;
          s.bestMs = s.bestMs ? Math.min(s.bestMs, ms) : ms;
          p.stats[statKey] = s;
          if (pkey) {
            prevBest = p.bests[pkey] || 0;
            p.stars[pkey] = 1;
            p.bests[pkey] = prevBest ? Math.min(prevBest, ms) : ms;
          }
          p.pb[pbId] = p.pb[pbId] ? Math.min(p.pb[pbId], secs) : secs;
          return p;
        });
      }
      const line = formatTime(ms) + (hintsUsed ? ' · ' + hintsUsed + (hintsUsed === 1 ? ' hint' : ' hints') : ' · no hints');
      let status = '';
      if (challenge && Number.isFinite(Number(challenge.beatScore)) && challenge.beatScore != null) {
        const who = challenge.challenger || 'your friend';
        status = secs < Number(challenge.beatScore) ? 'You beat ' + who + '’s time!' : who + '’s time still stands — try again';
      }
      const lbId = isDaily
        ? SC() && puzzle.dayNo != null
          ? SC().boardId(GAME, 'daily', puzzle.dayNo)
          : null
        : pkey && SC()
          ? SC().boardId(GAME, 'kakuro', pkey)
          : null;
      winInfo = { ms, secs, line, vsBest, status, board: lbId, note: '' };
      paintWinResult();
      fb('win');
      if (typeof recordGameResult === 'function') {
        try {
          recordGameResult('ankjod', true, false, {
            score: secs,
            difficulty: saveDiff,
            daily: isDaily && !puzzle.archive,
            dailyKey: puzzle.dailyKey || null,
          });
        } catch (e) {}
      }
      // Economy reported once via session.end('won') — avoid double-count
      submitWin(pkey, prevBest);
    }

    async function submitWin(pkey, prevBest) {
      const H = Hub();
      if (!H || !winInfo) return;
      const dig = solutionDigits();
      const run = { solution: dig.s, ms: winInfo.ms, hints: Math.min(hintsUsed, dig.n) };
      const setNote = (txt) => {
        winInfo.note = txt || '';
        const el = root.querySelector('#kkSubmitNote');
        if (el) el.textContent = winInfo.note;
      };
      let res = null;
      if (isDaily && !puzzle.archive) {
        if (!scored) return setNote(H.submitNote({ ranked: false, reason: 'practice' }));
        if (H.signedIn()) setNote('Checking your time…');
        res = await H.finishDaily(GAME, run, { score: winInfo.secs, line: winInfo.line });
        setNote(H.submitNote(res.scored ? res : { ranked: false, reason: 'practice' }));
        return;
      }
      if (puzzle.archive) return setNote('Archive puzzles are practice — only today’s Daily is ranked.');
      if (!pkey || !winInfo.board) return;
      if (!H.signedIn()) return setNote(H.submitNote(null));
      if (prevBest && winInfo.ms >= prevBest) return setNote('Your earlier best still stands.');
      setNote('Checking your time…');
      res = await H.submit(GAME, winInfo.board, run);
      setNote(H.submitNote(res));
    }

    function onKey(e) {
      if (won) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key >= '1' && e.key <= '9' && selected) {
        placeDigit(+e.key);
      } else if ((e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') && selected) {
        eraseCell();
      } else if (e.key === 'p' || e.key === 'P') {
        pencilMode = !pencilMode;
        statusMsg = pencilMode ? 'Pencil mode on' : 'Digit mode';
        refreshPlay();
      } else if (e.key === 'ArrowUp' && selected) {
        moveSel(-1, 0);
      } else if (e.key === 'ArrowDown' && selected) {
        moveSel(1, 0);
      } else if (e.key === 'ArrowLeft' && selected) {
        moveSel(0, -1);
      } else if (e.key === 'ArrowRight' && selected) {
        moveSel(0, 1);
      }
    }

    function moveSel(dr, dc) {
      let r = selected[0] + dr;
      let c = selected[1] + dc;
      for (let n = 0; n < rows * cols; n++) {
        if (r < 0) r = rows - 1;
        if (c < 0) c = cols - 1;
        if (r >= rows) r = 0;
        if (c >= cols) c = 0;
        if (board[r][c].kind === 'cell') {
          selected = [r, c];
          statusMsg = '';
          fb('select');
          refreshPlay();
          return;
        }
        r += dr;
        c += dc;
      }
    }

    if (typeof createGameSession !== 'function') {
      const device = document.querySelector('.device');
      if (device) device.appendChild(root);
      document.addEventListener('keydown', onKey);
      outer: for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (board[r][c].kind === 'cell') {
            selected = [r, c];
            break outer;
          }
        }
      }
      paint();
      root.querySelector('#kkBack')?.addEventListener('click', () => {
        document.removeEventListener('keydown', onKey);
        root.remove();
      });
      return;
    }

    session = createGameSession({
      id: 'ankjod_' + Date.now(),
      type: 'ankjod',
      title: 'Kakuro',
      mode: 'solo',
      elapsedOffsetMs: resumeElapsed,
      context: {
        chat: ctx && ctx.chat,
        overlayScope:
          (ctx && ctx.overlayScope) ||
          (typeof window.OVERLAY_SCOPE_CHAT !== 'undefined' ? window.OVERLAY_SCOPE_CHAT : 'chat'),
        difficulty: puzzle.difficulty,
        source: ctx && ctx.source,
      },
      mount() {
        return root;
      },
      init() {
        document.addEventListener('keydown', onKey);
        if (resumeSelected && board[resumeSelected[0]] && board[resumeSelected[0]][resumeSelected[1]]?.kind === 'cell') {
          selected = [resumeSelected[0], resumeSelected[1]];
        } else {
          outer: for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              if (board[r][c].kind === 'cell') {
                selected = [r, c];
                break outer;
              }
            }
          }
        }
        if (typeof markGamePlayed === 'function') {
          try {
            markGamePlayed('ankjod');
          } catch (e) {}
        }
        timerId = setInterval(() => {
          if (pauseCtrl && pauseCtrl.isPaused()) return;
          const el = root.querySelector('#kkTimer');
          if (el && session) el.textContent = formatTime(session.getElapsedMs());
        }, 1000);
        scheduleSave();
      },
      render() {
        paint();
      },
      onAction(action) {
        if (!action) return;
        if (action.type === 'set' && selected) {
          placeDigit(action.n);
        }
      },
      end() {},
      cleanup() {
        document.removeEventListener('keydown', onKey);
        if (timerId) {
          clearInterval(timerId);
          timerId = null;
        }
        if (saveTimer) {
          clearTimeout(saveTimer);
          saveTimer = null;
        }
        if (pauseCtrl) {
          try {
            pauseCtrl.destroy();
          } catch (e) {}
          pauseCtrl = null;
        }
        if (typeof clearDangalLaunchCtx === 'function') clearDangalLaunchCtx();
        session = null;
      },
    });

    session.init();
  }


  /**
   * Entry. Challenge links carry { diff, n } (a numbered puzzle) or { mode: 'daily', day } — today's
   * day opens the Daily sheet, an earlier day opens that archive puzzle as practice.
   */
  function openAnkJod(ctx) {
    const c = ctx || { source: 'unknown' };
    const go = () => {
      const p = c.params || {};
      if (c.source === 'challenge' && (p.mode === 'daily' || p.day != null)) {
        const d = p.day != null && p.day !== '' ? Number(p.day) : todayNo();
        if (!Number.isFinite(d) || d >= todayNo()) return openDailyFlow(c, null);
        if (d >= firstDay() && dailyEntry(d)) return startAnkJodGame(c, 'daily', { dayNo: d, archive: true, challenge: c });
      }
      if (c.source === 'challenge' && NUMBERED.indexOf(p.diff) !== -1 && bankList(p.diff).length) {
        const n = Math.max(1, Math.min(bankList(p.diff).length, Math.floor(Number(p.n) || 1)));
        const save = readAnkSave(p.diff);
        if (save && save.n === n) return startAnkJodGame(c, p.diff, { resume: save, challenge: c });
        return startAnkJodGame(c, p.diff, { n, challenge: c });
      }
      openDifficultyPicker(c);
    };
    if (window.PartyKit && typeof PartyKit.ensureGameData === 'function') {
      Promise.resolve(PartyKit.ensureGameData(GAME)).then(go, go);
    } else go();
  }

  window.openAnkJod = openAnkJod;
  // `kakuro` alias for deep links / callers; saves and PBs stay keyed on `ankjod`.
  window.openKakuro = openAnkJod;
  window.__ankJodLastGenStats = {};
  window.__ankJodDebug = {
    countSolutions,
    isUnique,
    generateUniquePuzzle,
    pickPuzzle,
    BANK,
    combosFor,
    puzzleQualityOk,
    extractRuns,
    bankPuzzle,
    dailyBankPuzzle,
    nextNumber,
    parseBankString,
    packBoardRows,
  };

  if (typeof registerGame === 'function') {
    registerGame({
      id: 'ankjod',
      name: 'Kakuro',
      desc: 'Cross-sums · 320 puzzles, Easy to Expert · Daily · Solo',
      icon: '🔢',
      ratingKey: 'ankjod',
      gameType: 'solo',
      genre: 'solo',
      solo: true,
      selfChat: true,
      dangal: true,
      chat1v1: false,
      chatGroup: false,
      featured: false,
      order: 95,
      meta: { aliases: ['kakuro'], engine: 'ank-jod', graduated: true, phase: 1 },
      launch(ctx) {
        openAnkJod(ctx || {});
      },
    });
    // Alias id for callers / deep links that expect "kakuro"
    registerGame({
      id: 'kakuro',
      name: 'Kakuro',
      desc: 'Cross-sums · Solo',
      icon: '🔢',
      ratingKey: 'ankjod',
      gameType: 'solo',
      genre: 'solo',
      solo: true,
      selfChat: false,
      dangal: false,
      chat1v1: false,
      chatGroup: false,
      featured: false,
      order: 96,
      meta: { aliasOf: 'ankjod', graduated: true, phase: 1 },
      launch(ctx) {
        openAnkJod(ctx || {});
      },
    });
  }
})();
