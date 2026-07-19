/**
 * Ank Jod — solo sum-run puzzle (Phase 2B).
 * Digits 1–9, no repeats in a run; across/down clues must match sums.
 * Ships verified puzzle banks + light unique-solution generator.
 */
(function () {
  'use strict';

  const DIFFS = [
    { id: 'easy', label: 'Easy', desc: 'Short runs · small grid', emoji: '🌱' },
    { id: 'medium', label: 'Medium', desc: 'Mixed runs · mid grid', emoji: '🔥' },
    { id: 'hard', label: 'Hard', desc: 'Long runs · dense grid', emoji: '💀' },
  ];

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
   * Mask chars: # wall, X clue seat, . white cell
   * Clue seats become walls with across/down sums after a fill.
   */
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
    ],
    medium: [
      [
        '########',
        '##XX#XX#',
        '#X..X..#',
        '#X..X..#',
        '##XX#XX#',
        '#X..X..#',
        '#X..X..#',
        '########',
      ],
      [
        '#######',
        '##XX#XX',
        '#X..X..',
        '#X..X..',
        '##XX#XX',
        '#X..X..',
        '#X..X##',
        '#######',
      ],
      [
        '########',
        '##XXX#X#',
        '#X...X.#',
        '#X...X.#',
        '##XXX#X#',
        '#X...X.#',
        '#X...X##',
        '########',
      ],
      [
        '#########',
        '##XX#XX##',
        '#X..X..##',
        '#X..X..##',
        '##XX#XX##',
        '#X..X..##',
        '#X..X..##',
        '#########',
      ],
    ],
    hard: [
      [
        '#########',
        '##XXX#XX#',
        '#X...X..#',
        '#X...X..#',
        '##XXX#XX#',
        '#X...X..#',
        '#X...X..#',
        '#########',
      ],
      [
        '##########',
        '##XX#XX#X#',
        '#X..X..X.#',
        '#X..X..X.#',
        '##XX#XX#X#',
        '#X..X..X.#',
        '#X..X..X.#',
        '##########',
      ],
      [
        '#########',
        '##XXXX#X#',
        '#X....X.#',
        '#X....X.#',
        '##XXXX#X#',
        '#X....X.#',
        '#X....X##',
        '#########',
      ],
      [
        '##########',
        '##XXX#XXX#',
        '#X...X...#',
        '#X...X...#',
        '##XXX#XXX#',
        '#X...X...#',
        '#X...X..##',
        '##########',
      ],
    ],
  };

  const QUALITY = {
    easy: { minWhites: 4, minRun: 2 },
    medium: { minWhites: 12, minRun: 2 },
    hard: { minWhites: 16, minRun: 2 },
  };

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
        // Clue seat with no runs → plain wall
        if (!acrossN && !downN) board[r][c] = { kind: 'wall' };
      }
    }
    return board;
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
    runs.forEach((run) =>
      run.cells.forEach(([rr, cc]) => {
        coverCount[rr + ',' + cc] = (coverCount[rr + ',' + cc] || 0) + 1;
      })
    );
    return Object.keys(coverCount).every((k) => coverCount[k] >= 2);
  }

  function puzzleQualityOk(board, difficulty) {
    const q = QUALITY[difficulty] || QUALITY.easy;
    return structuralOk(board, q.minWhites);
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

  const BLOCK_MASKS = [
    ['#####', '##XX#', '#X..#', '#X..#', '#####'],
    ['######', '##XXX#', '#X...#', '#X...#', '######'],
    ['######', '##XX##', '#X..X#', '#X..X#', '######'],
  ];

  /**
   * Stamp a small unique block into a larger canvas at (row0,col0).
   * Block boards include their own border walls.
   */
  function stampBlock(canvasBoard, canvasSol, block, row0, col0) {
    const br = block.board.length;
    const bc = block.board[0].length;
    for (let r = 0; r < br; r++) {
      for (let c = 0; c < bc; c++) {
        const cell = block.board[r][c];
        const tr = row0 + r;
        const tc = col0 + c;
        if (tr >= canvasBoard.length || tc >= canvasBoard[0].length) continue;
        if (cell.kind === 'wall') {
          // Don't overwrite existing clues/cells with walls when overlapping borders
          if (canvasBoard[tr][tc].kind === 'wall') continue;
          continue;
        }
        if (cell.kind === 'clue') {
          canvasBoard[tr][tc] = { kind: 'clue', across: cell.across, down: cell.down };
        } else if (cell.kind === 'cell') {
          canvasBoard[tr][tc] = { kind: 'cell' };
          canvasSol[tr][tc] = block.solution[r][c];
        }
      }
    }
  }

  function makeCanvas(rows, cols) {
    const board = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({ kind: 'wall' }))
    );
    const solution = emptyValues(rows, cols);
    return { board, solution };
  }

  function trimBoard(board, solution) {
    let r0 = 0;
    let r1 = board.length - 1;
    let c0 = 0;
    let c1 = board[0].length - 1;
    const rowEmpty = (r) => board[r].every((c) => c.kind === 'wall');
    const colEmpty = (c) => board.every((row) => row[c].kind === 'wall');
    while (r0 < r1 && rowEmpty(r0)) r0++;
    while (r1 > r0 && rowEmpty(r1)) r1--;
    while (c0 < c1 && colEmpty(c0)) c0++;
    while (c1 > c0 && colEmpty(c1)) c1--;
    // Keep content bounds (walls between islands stay)
    const nb = [];
    const ns = [];
    for (let r = r0; r <= r1; r++) {
      nb.push(board[r].slice(c0, c1 + 1));
      ns.push(solution[r].slice(c0, c1 + 1));
    }
    return { board: nb, solution: ns };
  }

  function generateComposed(difficulty) {
    const layouts =
      difficulty === 'hard'
        ? [
            { rows: 12, cols: 13, positions: [[0, 0], [0, 6], [6, 0], [6, 6]] },
            { rows: 12, cols: 14, positions: [[0, 0], [0, 7], [6, 0], [6, 7]] },
          ]
        : [
            { rows: 11, cols: 13, positions: [[0, 0], [0, 6], [5, 3]] },
            { rows: 12, cols: 12, positions: [[0, 0], [0, 6], [6, 0]] },
          ];

    const layout = layouts[Math.floor(Math.random() * layouts.length)];
    const canvas = makeCanvas(layout.rows, layout.cols);

    for (let i = 0; i < layout.positions.length; i++) {
      const mask = BLOCK_MASKS[Math.floor(Math.random() * BLOCK_MASKS.length)];
      const block = generateFromMask(mask, 150);
      if (!block) return null;
      stampBlock(canvas.board, canvas.solution, block, layout.positions[i][0], layout.positions[i][1]);
    }

    const trimmed = trimBoard(canvas.board, canvas.solution);
    const minW = difficulty === 'hard' ? 16 : 12;
    if (!structuralOk(trimmed.board, minW)) return null;

    const blank = emptyValues(trimmed.board.length, trimmed.board[0].length);
    if (!isUnique(trimmed.board, blank)) return null;
    return {
      board: trimmed.board,
      solution: trimmed.solution,
      source: 'composed',
      difficulty,
    };
  }

  function generateUniquePuzzle(difficulty, attempts) {
    const diff = difficulty || 'easy';
    const maxAttempts = attempts || (diff === 'hard' ? 40 : 30);
    let stats = { fill: 0, quality: 0, unique: 0, solve: 0, composed: 0 };

    if (diff === 'medium' || diff === 'hard') {
      for (let n = 0; n < maxAttempts; n++) {
        const composed = generateComposed(diff);
        if (composed) return composed;
        stats.composed++;
      }
    }

    const masks = MASKS[diff] || MASKS.easy;
    for (let n = 0; n < maxAttempts; n++) {
      const mask = masks[Math.floor(Math.random() * masks.length)];
      const got = generateFromMask(mask, 1);
      if (got) {
        return { board: got.board, solution: got.solution, source: 'generated', difficulty: diff };
      }
      stats.unique++;
    }

    if (typeof window !== 'undefined' && window.__ankJodLastGenStats) {
      window.__ankJodLastGenStats[diff] = stats;
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

  /** Verified unique banks (clues re-derived from digits; uniqueness gated in buildBank). */
  const BANK_STRINGS = {
    "easy": [
      [
        "######",
        "##XXX#",
        "#X317#",
        "#X839#",
        "######"
      ],
      [
        "#####",
        "##XX#",
        "#X57#",
        "#X91#",
        "#####"
      ],
      [
        "#####",
        "##XX#",
        "#X98#",
        "#X73#",
        "#####"
      ],
      [
        "#####",
        "##XX#",
        "#X97#",
        "#X83#",
        "#####"
      ],
      [
        "#####",
        "##XX#",
        "#X13#",
        "#X57#",
        "#####"
      ],
      [
        "#####",
        "##XX#",
        "#X46#",
        "#X98#",
        "#####"
      ]
    ],
    "medium": [
      [
        "#XX####XX",
        "X15###X89",
        "X79###X47",
        "#########",
        "#########",
        "#########",
        "#XX######",
        "X62######",
        "X84######"
      ],
      [
        "#XX####XX",
        "X61###X97",
        "X93###X83",
        "#########",
        "#########",
        "#########",
        "#XX######",
        "X98######",
        "X41######"
      ],
      [
        "#XXX###XXX",
        "X924##X617",
        "X748##X849",
        "##########",
        "##########",
        "####XX####",
        "###X15####",
        "###X38####"
      ],
      [
        "#XX####XX",
        "X97###X37",
        "X72###X12",
        "#########",
        "#########",
        "#########",
        "#XX######",
        "X91######",
        "X83######"
      ],
      [
        "#XX####XX",
        "X17###X79",
        "X39###X18",
        "#########",
        "#########",
        "####XXX##",
        "###X895##",
        "###X231##"
      ],
      [
        "#XX####XX",
        "X53###X18",
        "X91###X69",
        "#########",
        "#########",
        "####XX###",
        "###X21###",
        "###X98###"
      ]
    ],
    "hard": [
      [
        "#XX#####XX",
        "X76####X31",
        "X98####X96",
        "##########",
        "##########",
        "##########",
        "#XXX####XX",
        "X968###X93",
        "X312###X61"
      ],
      [
        "#XX####XX",
        "X94###X72",
        "X21###X91",
        "#########",
        "#########",
        "#########",
        "#XXX###XX",
        "X614##X17",
        "X859##X49"
      ],
      [
        "#XXX###XX",
        "X795##X97",
        "X142##X54",
        "#########",
        "#########",
        "#########",
        "#XX####XX",
        "X49###X49",
        "X18###X87"
      ],
      [
        "#XXX###XXX",
        "X412##X249",
        "X531##X187",
        "##########",
        "##########",
        "##########",
        "#XX####XX#",
        "X23###X59#",
        "X15###X78#"
      ],
      [
        "#XX#####XX#",
        "X38####X14#",
        "X13####X29#",
        "###########",
        "###########",
        "###########",
        "#XX#####XXX",
        "X94####X897",
        "X71####X471"
      ],
      [
        "#XX#####XXX",
        "X71####X973",
        "X97####X731",
        "###########",
        "###########",
        "###########",
        "#XXX####XX#",
        "X183###X17#",
        "X397###X39#"
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
          if (n === 1 && structuralOk(parsed.board, 4)) {
            bank[diff].push({
              board: parsed.board,
              solution: parsed.solution,
              source: 'bank',
              difficulty: diff,
              id: diff + '_' + i,
            });
          } else {
            console.warn('[ank-jod] bank puzzle rejected (solutions=' + n + '):', diff, i);
          }
        } catch (e) {
          console.warn('[ank-jod] bank parse failed', diff, i, e);
        }
      });
    });
    return bank;
  }

  const BANK = buildBank();

  function ensureBankFallback(diff) {
    if (BANK[diff] && BANK[diff].length) return;
    const g = generateUniquePuzzle(diff, 40);
    if (g) {
      BANK[diff] = [
        {
          board: g.board,
          solution: g.solution,
          source: 'fallback',
          difficulty: diff,
          id: diff + '_fallback',
        },
      ];
      return;
    }
    const emergency = parseBankString(['#####', '##XX#', '#X12#', '#X35#', '#####']);
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

  ['easy', 'medium', 'hard'].forEach(ensureBankFallback);

  function pickPuzzle(difficulty) {
    const diff = DIFFS.some((d) => d.id === difficulty) ? difficulty : 'easy';
    // Prefer generator for variety; fall back to verified bank
    const gen = generateUniquePuzzle(diff);
    if (gen) return gen;
    const list = BANK[diff] || BANK.easy;
    const item = list[Math.floor(Math.random() * list.length)];
    return {
      board: cloneBoard(item.board),
      solution: item.solution.map((r) => r.slice()),
      source: item.source,
      difficulty: diff,
      id: item.id,
    };
  }

  // ─── Validation / mistakes ─────────────────────────────────────────────────

  function analyzeMistakes(board, values) {
    const runs = extractRuns(board);
    const bad = new Set(); // "r,c"
    let completeWrong = 0;
    let incomplete = 0;

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
        digits.forEach(([r, c]) => bad.add(r + ',' + c));
      }
      if (empty === 0) {
        if (sum !== run.sum || dup) {
          completeWrong++;
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
            if (!ok) bad.add(r + ',' + c);
          });
        }
      }
    });

    const allFilled = incomplete === 0;
    const won = allFilled && completeWrong === 0 && bad.size === 0;
    return { bad, won, allFilled, completeWrong };
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

  // ─── Screens ───────────────────────────────────────────────────────────────

  function openDifficultyPicker(ctx) {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:absolute;inset:0;background:var(--cream,#F7F3EC);z-index:80;display:flex;flex-direction:column;';
    overlay.innerHTML = `
      ${gameChromeHtml({title:'Ank Jod',subtitle:'Choose difficulty',backId:'kkDiffBack'})}
      <div style="flex:1;overflow-y:auto;padding:20px 16px;">
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:22px;margin-bottom:6px;">Pick a challenge</div>
        <div style="font-size:13px;color:var(--muted,#8A7F72);margin-bottom:18px;line-height:1.4;">Fill white cells with 1–9. No repeats in a run — and each run must add up to its clue.</div>
        ${DIFFS.map(
          (d) => `
          <button data-diff="${d.id}" class="kk-diff-btn" style="width:100%;padding:16px;background:var(--white,#fff);border:2px solid var(--line,#E8E0D4);border-radius:16px;margin-bottom:10px;text-align:left;display:flex;align-items:center;gap:14px;cursor:pointer;">
            <span style="font-size:28px;flex-shrink:0;">${d.emoji}</span>
            <span style="flex:1;">
              <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:16px;">${d.label}</div>
              <div style="font-size:12px;color:var(--muted,#8A7F72);margin-top:2px;">${d.desc}</div>
            </span>
            <span style="font-size:18px;color:var(--muted,#8A7F72);">›</span>
          </button>`
        ).join('')}
      </div>`;

    const device = document.querySelector('.device');
    if (device) device.appendChild(overlay);
    else document.body.appendChild(overlay);
    if(typeof prepareGameOverlay==='function') prepareGameOverlay(overlay,{theme:'light',gameId:'ankjod'});

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
    overlay.querySelectorAll('.kk-diff-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const diff = btn.getAttribute('data-diff');
        close();
        startAnkJodGame(ctx, diff);
      });
    });
  }

  function startAnkJodGame(ctx, difficulty) {
    const puzzle = pickPuzzle(difficulty);
    const board = puzzle.board;
    const rows = board.length;
    const cols = board[0].length;
    let values = emptyValues(rows, cols);
    let selected = null; // [r,c]
    let showMistakes = false;
    let statusMsg = '';
    let won = false;
    let timerId = null;
    let session = null;

    const root = document.createElement('div');
    root.style.cssText =
      'position:absolute;inset:0;background:var(--cream,#F7F3EC);z-index:80;display:flex;flex-direction:column;';

    function paint() {
      const analysis = analyzeMistakes(board, values);
      const bad = showMistakes || won ? analysis.bad : new Set();
      const elapsed = session ? session.getElapsedMs() : 0;
      const diffMeta = DIFFS.find((d) => d.id === puzzle.difficulty) || DIFFS[0];

      const cellSize = Math.min(44, Math.floor(320 / Math.max(cols, rows)));

      let gridHtml = '';
      for (let r = 0; r < rows; r++) {
        gridHtml += '<div style="display:flex;">';
        for (let c = 0; c < cols; c++) {
          const cell = board[r][c];
          const key = r + ',' + c;
          if (cell.kind === 'wall') {
            gridHtml += `<div style="width:${cellSize}px;height:${cellSize}px;background:#2C2A28;border:1px solid #1a1918;box-sizing:border-box;"></div>`;
          } else if (cell.kind === 'clue') {
            const lab = clueLabel(cell);
            gridHtml += `<div style="width:${cellSize}px;height:${cellSize}px;background:#2C2A28;border:1px solid #1a1918;box-sizing:border-box;position:relative;overflow:hidden;">
              <svg width="100%" height="100%" viewBox="0 0 40 40" preserveAspectRatio="none" style="position:absolute;inset:0;">
                <line x1="0" y1="0" x2="40" y2="40" stroke="#5A5348" stroke-width="1"/>
              </svg>
              ${lab.d ? `<span style="position:absolute;top:2px;left:3px;font-size:${Math.max(9, cellSize * 0.28)}px;font-family:Space Grotesk,sans-serif;font-weight:700;color:#F5EFE4;line-height:1;">${lab.d}</span>` : ''}
              ${lab.a ? `<span style="position:absolute;bottom:2px;right:3px;font-size:${Math.max(9, cellSize * 0.28)}px;font-family:Space Grotesk,sans-serif;font-weight:700;color:#F5EFE4;line-height:1;">${lab.a}</span>` : ''}
            </div>`;
          } else {
            const v = values[r][c];
            const isSel = selected && selected[0] === r && selected[1] === c;
            const isBad = bad.has(key);
            let bg = '#FFFDF8';
            let border = isSel ? '2px solid var(--red,#C62828)' : '1px solid #C9BFAE';
            let color = '#1A1714';
            if (isBad) {
              bg = '#FDE8E6';
              color = '#B71C1C';
            }
            if (won) {
              bg = '#E7F6EA';
              color = '#1B5E20';
              border = '1px solid #A5D6A7';
            }
            gridHtml += `<button data-r="${r}" data-c="${c}" class="kk-cell" style="width:${cellSize}px;height:${cellSize}px;background:${bg};border:${border};box-sizing:border-box;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:${Math.max(16, cellSize * 0.45)}px;color:${color};cursor:pointer;padding:0;border-radius:0;">${v || ''}</button>`;
          }
        }
        gridHtml += '</div>';
      }

      const padBtns = [1, 2, 3, 4, 5, 6, 7, 8, 9]
        .map(
          (n) =>
            `<button data-n="${n}" class="kk-num" style="flex:1;min-width:0;aspect-ratio:1;max-height:48px;background:var(--white,#fff);border:2px solid var(--line,#E8E0D4);border-radius:10px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;cursor:pointer;color:#1A1714;">${n}</button>`
        )
        .join('');

      root.innerHTML = `
        ${gameChromeHtml({title:'Ank Jod',subtitle:diffMeta.label,backId:'kkBack',rightHtml:`<button id="kkNew" class="game-chrome-action">New</button>`})}
        <div id="kkTimer" class="game-turn game-turn--waiting">${formatTime(elapsed)}</div>
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:12px;gap:10px;overflow:auto;">
          <div id="kkStatus" style="min-height:20px;font-size:13px;font-weight:600;color:${won ? '#1B5E20' : 'var(--muted,#8A7F72)'};text-align:center;">${
            won ? '🎉 Puzzle solved!' : statusMsg || 'Tap a cell, then a digit'
          }</div>
          ${
            won
              ? `<div style="display:flex;gap:8px;margin-bottom:4px;">
            <button id="kkAgain" style="padding:10px 16px;background:var(--red,#C62828);color:#fff;border:none;border-radius:12px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:13px;cursor:pointer;">Play again</button>
            <button id="kkDone" style="padding:10px 16px;background:var(--cream,#F7F3EC);border:2px solid var(--line,#E8E0D4);border-radius:12px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:13px;cursor:pointer;">Done</button>
          </div>`
              : ''
          }
          <div id="kkGrid" style="display:inline-block;box-shadow:0 4px 20px rgba(0,0,0,0.08);border:2px solid #1a1918;border-radius:4px;overflow:hidden;line-height:0;">${gridHtml}</div>
        </div>
        <div style="flex-shrink:0;padding:10px 12px 14px;background:var(--white,#fff);border-top:1px solid var(--line,#E8E0D4);">
          <div style="display:flex;gap:6px;margin-bottom:10px;">${padBtns}</div>
          <div style="display:flex;gap:8px;">
            <button id="kkClear" style="flex:1;padding:12px;background:var(--cream,#F7F3EC);border:2px solid var(--line,#E8E0D4);border-radius:12px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:13px;cursor:pointer;">Clear</button>
            <button id="kkErase" style="flex:1;padding:12px;background:var(--cream,#F7F3EC);border:2px solid var(--line,#E8E0D4);border-radius:12px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:13px;cursor:pointer;">Erase</button>
            <button id="kkCheck" style="flex:1;padding:12px;background:var(--red,#C62828);color:#fff;border:none;border-radius:12px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:13px;cursor:pointer;">Check</button>
          </div>
        </div>`;

      root.querySelector('#kkBack').addEventListener('click', () => {
        if (session) session.end(won ? 'won' : 'quit');
      });
      root.querySelector('#kkNew').addEventListener('click', () => {
        if (session) session.end('restart');
        openDifficultyPicker(ctx);
      });
      const againBtn = root.querySelector('#kkAgain');
      if (againBtn) {
        againBtn.addEventListener('click', () => {
          if (session) session.end('restart');
          openDifficultyPicker(ctx);
        });
      }
      const doneBtn = root.querySelector('#kkDone');
      if (doneBtn) {
        doneBtn.addEventListener('click', () => {
          if (session) session.end('won');
        });
      }
      root.querySelectorAll('.kk-cell').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (won) return;
          selected = [+btn.getAttribute('data-r'), +btn.getAttribute('data-c')];
          statusMsg = '';
          paint();
        });
      });
      root.querySelectorAll('.kk-num').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (won || !selected) return;
          const n = +btn.getAttribute('data-n');
          values[selected[0]][selected[1]] = n;
          showMistakes = false;
          statusMsg = '';
          const a = analyzeMistakes(board, values);
          if (a.won) finishWin();
          else paint();
        });
      });
      root.querySelector('#kkErase').addEventListener('click', () => {
        if (won || !selected) return;
        values[selected[0]][selected[1]] = 0;
        showMistakes = false;
        statusMsg = '';
        paint();
      });
      root.querySelector('#kkClear').addEventListener('click', () => {
        if (won) return;
        values = emptyValues(rows, cols);
        showMistakes = false;
        statusMsg = 'Board cleared';
        paint();
      });
      root.querySelector('#kkCheck').addEventListener('click', () => {
        if (won) return;
        const a = analyzeMistakes(board, values);
        showMistakes = true;
        if (a.won) finishWin();
        else if (!a.allFilled) {
          statusMsg = a.bad.size ? 'Some digits conflict — keep going' : 'Not finished yet';
          paint();
        } else {
          statusMsg = 'Check the red cells — sums or repeats are off';
          paint();
        }
      });
    }

    function finishWin() {
      if (won) return;
      won = true;
      showMistakes = false;
      statusMsg = '🎉 Puzzle solved!';
      paint();
      if (typeof gameFeedback === 'function') gameFeedback('complete');
      if (typeof recordGameResult === 'function') {
        try {
          recordGameResult('ankjod', true);
        } catch (e) {}
      }
    }

    function onKey(e) {
      if (won) return;
      if (e.key >= '1' && e.key <= '9' && selected) {
        values[selected[0]][selected[1]] = +e.key;
        showMistakes = false;
        const a = analyzeMistakes(board, values);
        if (a.won) finishWin();
        else paint();
      } else if ((e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') && selected) {
        values[selected[0]][selected[1]] = 0;
        paint();
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
          paint();
          return;
        }
        r += dr;
        c += dc;
      }
    }

    if (typeof createGameSession !== 'function') {
      // Fallback without runtime (should not happen in production)
      const device = document.querySelector('.device');
      if (device) device.appendChild(root);
      document.addEventListener('keydown', onKey);
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
      title: 'Ank Jod',
      mode: 'solo',
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
        // Select first white cell
        outer: for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (board[r][c].kind === 'cell') {
              selected = [r, c];
              break outer;
            }
          }
        }
        timerId = setInterval(() => {
          const el = root.querySelector('#kkTimer');
          if (el && session) el.textContent = formatTime(session.getElapsedMs());
        }, 1000);
      },
      render() {
        paint();
      },
      onAction(action) {
        if (!action) return;
        if (action.type === 'set' && selected) {
          values[selected[0]][selected[1]] = action.n;
          paint();
        }
      },
      end(result) {
        // rating already recorded on win
        if (result === 'won' && typeof recordGameResult === 'function') {
          // idempotent-ish: recordGameResult may be called twice; dangal typically increments — only call once via finishWin
        }
      },
      cleanup() {
        document.removeEventListener('keydown', onKey);
        if (timerId) {
          clearInterval(timerId);
          timerId = null;
        }
        session = null;
      },
    });

    session.init();
  }

  function openAnkJod(ctx) {
    openDifficultyPicker(ctx || { source: 'unknown' });
  }

  window.openAnkJod = openAnkJod;
  // Kakuro-compatible aliases (localized product name remains Ank Jod).
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
  };

  if (typeof registerGame === 'function') {
    registerGame({
      id: 'ankjod',
      name: 'Ank Jod',
      desc: 'Cross-sums (Kakuro) · easy / medium / hard',
      icon: '🔢',
      ratingKey: 'ankjod',
      gameType: 'solo',
      solo: true,
      selfChat: true,
      dangal: true,
      chat1v1: false,
      chatGroup: false,
      featured: false,
      order: 95,
      meta: { aliases: ['kakuro'], engine: 'ank-jod' },
      launch(ctx) {
        openAnkJod(ctx || {});
      },
    });
    // Alias id for callers / deep links that expect "kakuro"
    registerGame({
      id: 'kakuro',
      name: 'Ank Jod',
      desc: 'Cross-sums (Kakuro) · easy / medium / hard',
      icon: '🔢',
      ratingKey: 'ankjod',
      gameType: 'solo',
      solo: true,
      selfChat: false,
      dangal: false,
      chat1v1: false,
      chatGroup: false,
      featured: false,
      order: 96,
      meta: { aliasOf: 'ankjod' },
      launch(ctx) {
        openAnkJod(ctx || {});
      },
    });
  }
})();
