/**
 * Offline Ank Jod bank expander — run: node scripts/ankjod-gen-banks.js
 * Emits JSON of BANK_STRINGS-compatible row arrays that pass uniqueness + connectivity.
 */
'use strict';

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

function emptyValues(rows, cols) {
  return Array.from({ length: rows }, () => Array(cols).fill(0));
}

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
        if (cells.length) runs.push({ cells, sum: cell.across });
      }
      if (cell.down != null) {
        const cells = [];
        for (let rr = r + 1; rr < rows && board[rr][c].kind === 'cell'; rr++) cells.push([rr, c]);
        if (cells.length) runs.push({ cells, sum: cell.down });
      }
    }
  }
  return runs;
}

function cellRunsIndex(runs, rows, cols) {
  const idx = Array.from({ length: rows }, () => Array.from({ length: cols }, () => []));
  runs.forEach((run, i) => run.cells.forEach(([r, c]) => idx[r][c].push(i)));
  return idx;
}

function countSolutions(board, values, limit) {
  const max = limit == null ? 2 : limit;
  const runs = extractRuns(board);
  const rows = board.length;
  const cols = board[0].length;
  const runIdx = cellRunsIndex(runs, rows, cols);
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
      const used = new Set();
      for (let j = 0; j < run.cells.length; j++) {
        const [rr, cc] = run.cells[j];
        const v = values[rr][cc];
        if (v) {
          if (used.has(v)) return [];
          used.add(v);
        }
      }
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
    return possible ? Array.from(possible) : [1, 2, 3, 4, 5, 6, 7, 8, 9];
  }
  function pickCell() {
    let best = null;
    let bestN = 10;
    for (let i = 0; i < whites.length; i++) {
      const [r, c] = whites[i];
      if (values[r][c]) continue;
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
  let found = 0;
  function dfs() {
    if (found >= max) return;
    const pick = pickCell();
    if (!pick) {
      found++;
      return;
    }
    if (!pick.cands.length) return;
    for (let i = 0; i < pick.cands.length; i++) {
      values[pick.r][pick.c] = pick.cands[i];
      dfs();
      if (found >= max) {
        values[pick.r][pick.c] = 0;
        return;
      }
      values[pick.r][pick.c] = 0;
    }
  }
  dfs();
  return found;
}

function solveOne(board) {
  const v = emptyValues(board.length, board[0].length);
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
      const used = new Set();
      for (let j = 0; j < run.cells.length; j++) {
        const [rr, cc] = run.cells[j];
        const val = v[rr][cc];
        if (val) {
          if (used.has(val)) return [];
          used.add(val);
        }
      }
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
    return possible ? Array.from(possible) : [1, 2, 3, 4, 5, 6, 7, 8, 9];
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
  const start = whites[0];
  const seen = new Set([key(start[0], start[1])]);
  const q = [start];
  const dirs = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ];
  while (q.length) {
    const [r, c] = q.shift();
    for (const [dr, dc] of dirs) {
      const rr = r + dr;
      const cc = c + dc;
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
  for (const run of runs) {
    if (!combosFor(run.sum, run.cells.length).length) return false;
  }
  return whitesConnected(board);
}

function maskToSkeleton(mask) {
  return mask.map((row) =>
    row.split('').map((ch) => {
      if (ch === '.') return { kind: 'cell' };
      if (ch === 'X') return { kind: 'clue' };
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

function randomFill(skeleton) {
  const rows = skeleton.length;
  const cols = skeleton[0].length;
  const values = emptyValues(rows, cols);
  const runs = [];
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
      if (!acrossN && !downN) board[r][c] = { kind: 'wall' };
    }
  }
  return board;
}

function toBankString(skeleton, values) {
  return skeleton.map((row, r) =>
    row
      .map((cell, c) => {
        if (cell.kind === 'cell') return String(values[r][c]);
        if (cell.kind === 'clue') return 'X';
        return '#';
      })
      .join('')
  );
}

function generateFromMask(mask, attempts, minWhites) {
  for (let n = 0; n < (attempts || 120); n++) {
    const skeleton = maskToSkeleton(mask);
    const fill = randomFill(skeleton);
    if (!fill) continue;
    const board = applyCluesFromFill(skeleton, fill);
    if (!structuralOk(board, minWhites || 4)) continue;
    const blank = emptyValues(board.length, board[0].length);
    if (countSolutions(board, blank, 2) !== 1) continue;
    const solved = solveOne(board);
    if (!solved) continue;
    return toBankString(skeleton, solved);
  }
  return null;
}

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

const QUALITY = { easy: 4, medium: 8, hard: 10 };
const TARGETS = { easy: 20, medium: 16, hard: 12 };

const fs = require('fs');
const path = require('path');

const out = { easy: [], medium: [], hard: [] };
const seen = { easy: new Set(), medium: new Set(), hard: new Set() };

for (const diff of ['easy', 'medium', 'hard']) {
  const masks = MASKS[diff];
  let guard = 0;
  while (out[diff].length < TARGETS[diff] && guard < TARGETS[diff] * 120) {
    guard++;
    const mask = masks[Math.floor(Math.random() * masks.length)];
    const rows = generateFromMask(mask, 60, QUALITY[diff]);
    if (!rows) continue;
    const sig = rows.join('|');
    if (seen[diff].has(sig)) continue;
    seen[diff].add(sig);
    out[diff].push(rows);
    process.stderr.write(`${diff} ${out[diff].length}/${TARGETS[diff]}\n`);
  }
}

const outPath = path.join(__dirname, '..', 'public', 'src', 'js', 'games', '_ankjod_banks.json');
fs.writeFileSync(outPath, JSON.stringify(out));
process.stderr.write(
  'wrote ' +
    outPath +
    ' ' +
    JSON.stringify({ easy: out.easy.length, medium: out.medium.length, hard: out.hard.length }) +
    '\n'
);
