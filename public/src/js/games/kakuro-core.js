/**
 * Kakuro core (Dangal P14) — pure and deterministic; shared by the phone (ank-jod.js), the bank
 * builder (scripts/gen-kakuro-bank.js), tests and the server (solution checks for ranked times).
 *
 * Rules: fill every white cell with 1–9 so each run sums to its clue with no digit repeated in a run.
 *
 * Puzzle rows use the Kakuro save format: '#' empty block · 'X' clue block · '1'–'9' solution digit.
 * Clues are derived from the solution, so a row list fully describes a puzzle.
 *
 * Generator: seeded symmetric block mask → seeded fill → solution count (must be exactly 1; when it
 * isn't, a cell where two solutions differ is blocked out and the count repeats) → grade.
 * Grade = the hardest technique the logical solver needs (never guessing):
 *   1 Easy    run combinations + singles (a digit that is the only one both runs allow)
 *   2 Medium  combination filtering (drop combos the cells can't hold) + hidden singles
 *   3 Hard    position exclusion (every ordering of the remaining combos is checked per cell)
 *   4 Expert  one-step contradiction (placing a digit leaves some run with no valid combination)
 * Sizes include the clue row/column: Easy 6–7, Medium 7–9, Hard 8–10, Expert 10–12.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KakuroCore = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  const SoloCore = typeof module === 'object' && module.exports ? require('./solo-core.js') : root.SoloCore;

  const DIFFS = ['easy', 'medium', 'hard', 'expert'];
  const GRADE = { easy: 1, medium: 2, hard: 3, expert: 4 };
  const TECH_NAMES = { 1: 'Run combinations', 2: 'Combination filtering', 3: 'Position exclusion', 4: 'Contradiction' };
  const SPECS = {
    easy: { sizes: [[6, 6], [7, 7], [6, 7], [7, 6]], density: [0.3, 0.38], minWhite: 14 },
    medium: { sizes: [[7, 7], [8, 8], [9, 9], [8, 9]], density: [0.28, 0.36], minWhite: 22 },
    hard: { sizes: [[8, 8], [9, 9], [10, 10], [9, 10]], density: [0.26, 0.34], minWhite: 32 },
    expert: { sizes: [[10, 10], [11, 11], [12, 12], [11, 12]], density: [0.25, 0.32], minWhite: 50 },
  };

  // ---------------------------------------------------------------- combinations

  const POP = new Uint8Array(1024);
  for (let m = 1; m < 1024; m++) POP[m] = POP[m >> 1] + (m & 1);
  const COMBOS = {}; // `${sum},${len}` → [mask]
  for (let m = 2; m < 1024; m += 2) {
    let sum = 0;
    for (let d = 1; d <= 9; d++) if (m & (1 << d)) sum += d;
    const k = sum + ',' + POP[m];
    (COMBOS[k] || (COMBOS[k] = [])).push(m);
  }
  function comboMasks(sum, len) {
    return COMBOS[sum + ',' + len] || [];
  }
  function maskDigits(m) {
    const out = [];
    for (let d = 1; d <= 9; d++) if (m & (1 << d)) out.push(d);
    return out;
  }
  function lowDigit(m) {
    for (let d = 1; d <= 9; d++) if (m & (1 << d)) return d;
    return 0;
  }
  /** Combination helper: digit sets for a run's sum/length, optionally containing `must` and avoiding `not`. */
  function combos(sum, len, must, not) {
    let mm = 0;
    (must || []).forEach((d) => (mm |= 1 << d));
    let nm = 0;
    (not || []).forEach((d) => (nm |= 1 << d));
    return comboMasks(sum, len)
      .filter((m) => (m & mm) === mm && !(m & nm))
      .map(maskDigits);
  }

  // ---------------------------------------------------------------- grid model

  /** rows → { R, C, white[], sol[], runs[{cells,sum,dir,clue}], cellRuns[i] = [across, down] } */
  function fromRows(rows) {
    const R = rows.length;
    const C = rows[0].length;
    const white = new Array(R * C).fill(false);
    const sol = new Array(R * C).fill(0);
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        const ch = rows[r][c];
        if (ch >= '1' && ch <= '9') {
          white[r * C + c] = true;
          sol[r * C + c] = +ch;
        }
      }
    }
    return buildRuns({ R, C, white, sol });
  }

  function buildRuns(g) {
    const { R, C, white, sol } = g;
    const runs = [];
    const cellRuns = Array.from({ length: R * C }, () => [-1, -1]);
    for (let r = 0; r < R; r++) {
      let c = 0;
      while (c < C) {
        if (!white[r * C + c]) {
          c++;
          continue;
        }
        const cells = [];
        const start = c;
        while (c < C && white[r * C + c]) cells.push(r * C + c++);
        const sum = sol ? cells.reduce((a, i) => a + (sol[i] || 0), 0) : 0;
        cells.forEach((i) => (cellRuns[i][0] = runs.length));
        runs.push({ cells, sum, dir: 'across', clue: start > 0 ? r * C + start - 1 : -1 });
      }
    }
    for (let c = 0; c < C; c++) {
      let r = 0;
      while (r < R) {
        if (!white[r * C + c]) {
          r++;
          continue;
        }
        const cells = [];
        const start = r;
        while (r < R && white[r * C + c]) cells.push(r++ * C + c);
        const sum = sol ? cells.reduce((a, i) => a + (sol[i] || 0), 0) : 0;
        cells.forEach((i) => (cellRuns[i][1] = runs.length));
        runs.push({ cells, sum, dir: 'down', clue: start > 0 ? (start - 1) * C + c : -1 });
      }
    }
    return Object.assign({}, g, { runs, cellRuns });
  }

  function toRows(g) {
    const out = [];
    for (let r = 0; r < g.R; r++) {
      let s = '';
      for (let c = 0; c < g.C; c++) {
        const i = r * g.C + c;
        if (g.white[i]) s += String(g.sol[i]);
        else {
          const right = c + 1 < g.C && g.white[i + 1];
          const below = r + 1 < g.R && g.white[i + g.C];
          s += right || below ? 'X' : '#';
        }
      }
      out.push(s);
    }
    return out;
  }

  function structureOk(g) {
    const { R, C, white } = g;
    let n = 0;
    for (let i = 0; i < R * C; i++) {
      if (!white[i]) continue;
      n++;
      const r = Math.floor(i / C);
      const c = i % C;
      if (r === 0 || c === 0) return false;
    }
    if (!n) return false;
    for (let k = 0; k < g.runs.length; k++) {
      const L = g.runs[k].cells.length;
      if (L < 2 || L > 9) return false;
    }
    return connected(g);
  }

  function connected(g) {
    const { R, C, white } = g;
    let first = -1;
    let n = 0;
    for (let i = 0; i < R * C; i++) if (white[i]) {
      n++;
      if (first < 0) first = i;
    }
    if (first < 0) return false;
    const seen = new Uint8Array(R * C);
    const q = [first];
    seen[first] = 1;
    let got = 1;
    while (q.length) {
      const i = q.pop();
      const r = Math.floor(i / C);
      const c = i % C;
      const nb = [];
      if (r > 0) nb.push(i - C);
      if (r < R - 1) nb.push(i + C);
      if (c > 0) nb.push(i - 1);
      if (c < C - 1) nb.push(i + 1);
      for (let k = 0; k < nb.length; k++) {
        const j = nb[k];
        if (white[j] && !seen[j]) {
          seen[j] = 1;
          got++;
          q.push(j);
        }
      }
    }
    return got === n;
  }

  // ---------------------------------------------------------------- solution counting (backtracking)

  function countSolutions(g, limit, nodeCap) {
    const lim = limit || 2;
    const cap = nodeCap || 400000;
    const N = g.R * g.C;
    const val = new Uint8Array(N);
    const used = new Uint16Array(g.runs.length);
    const whites = [];
    for (let i = 0; i < N; i++) if (g.white[i]) whites.push(i);
    const sols = [];
    let nodes = 0;
    let aborted = false;
    const allowCache = new Map();
    function allowed(k) {
      const u = used[k];
      const key = k * 1024 + u;
      let v = allowCache.get(key);
      if (v !== undefined) return v;
      const run = g.runs[k];
      const list = comboMasks(run.sum, run.cells.length);
      v = 0;
      for (let t = 0; t < list.length; t++) if ((list[t] & u) === u) v |= list[t] & ~u;
      allowCache.set(key, v);
      return v;
    }
    function rec() {
      if (aborted) return;
      if (++nodes > cap) {
        aborted = true;
        return;
      }
      let best = -1;
      let bestM = 0;
      let bestN = 10;
      for (let w = 0; w < whites.length; w++) {
        const i = whites[w];
        if (val[i]) continue;
        const cr = g.cellRuns[i];
        const m = allowed(cr[0]) & allowed(cr[1]);
        const n = POP[m];
        if (n === 0) return;
        if (n < bestN) {
          bestN = n;
          best = i;
          bestM = m;
          if (n === 1) break;
        }
      }
      if (best < 0) {
        sols.push(Array.from(val));
        return;
      }
      const cr = g.cellRuns[best];
      for (let d = 1; d <= 9 && sols.length < lim && !aborted; d++) {
        if (!(bestM & (1 << d))) continue;
        val[best] = d;
        used[cr[0]] |= 1 << d;
        used[cr[1]] |= 1 << d;
        rec();
        used[cr[0]] &= ~(1 << d);
        used[cr[1]] &= ~(1 << d);
        val[best] = 0;
      }
    }
    rec();
    return { count: aborted ? -1 : sols.length, sols, nodes, aborted };
  }

  function isUnique(g) {
    return countSolutions(g, 2).count === 1;
  }

  // ---------------------------------------------------------------- logical solver (grading + hints)

  function assignable(cands, digits) {
    // cands: array of masks (unsolved cells); digits: mask with popcount === cands.length
    const n = cands.length;
    if (POP[digits] !== n) return false;
    const order = cands.map((m, k) => k).sort((a, b) => POP[cands[a] & digits] - POP[cands[b] & digits]);
    function dfs(k, left) {
      if (k === n) return true;
      const m = cands[order[k]] & left;
      for (let d = 1; d <= 9; d++) if (m & (1 << d) && dfs(k + 1, left & ~(1 << d))) return true;
      return false;
    }
    return dfs(0, digits);
  }

  function positionSupport(cands, digits) {
    // Union of digits each cell can take in some full assignment of `digits`.
    const n = cands.length;
    const sup = new Array(n).fill(0);
    const cur = new Array(n).fill(0);
    let budget = 20000;
    function dfs(k, left) {
      if (budget-- <= 0) return;
      if (k === n) {
        for (let t = 0; t < n; t++) sup[t] |= 1 << cur[t];
        return;
      }
      const m = cands[k] & left;
      for (let d = 1; d <= 9; d++) {
        if (!(m & (1 << d))) continue;
        cur[k] = d;
        dfs(k + 1, left & ~(1 << d));
      }
    }
    dfs(0, digits);
    if (budget <= 0) return cands.slice();
    return sup;
  }

  function initCands(g, values) {
    const N = g.R * g.C;
    const cand = new Uint16Array(N);
    for (let i = 0; i < N; i++) {
      if (!g.white[i]) continue;
      if (values && values[i]) {
        cand[i] = 1 << values[i];
        continue;
      }
      const cr = g.cellRuns[i];
      let m = 0x3fe;
      for (let t = 0; t < 2; t++) {
        const run = g.runs[cr[t]];
        let u = 0;
        comboMasks(run.sum, run.cells.length).forEach((x) => (u |= x));
        m &= u;
      }
      cand[i] = m;
    }
    return cand;
  }

  /** One technique pass over every run. Returns { changed, bad, events }. */
  function pass(g, cand, tech, why) {
    let changed = false;
    for (let k = 0; k < g.runs.length; k++) {
      const run = g.runs[k];
      const cells = run.cells;
      let solvedMask = 0;
      let dup = false;
      const open = [];
      for (let t = 0; t < cells.length; t++) {
        const m = cand[cells[t]];
        if (!m) return { changed, bad: true };
        if (POP[m] === 1) {
          if (solvedMask & m) dup = true;
          solvedMask |= m;
        } else open.push(cells[t]);
      }
      if (dup) return { changed, bad: true };
      let list = comboMasks(run.sum, cells.length).filter((x) => (x & solvedMask) === solvedMask);
      if (tech >= 2) list = list.filter((x) => assignable(open.map((i) => cand[i]), x & ~solvedMask));
      if (!list.length) return { changed, bad: true };
      if (!open.length) continue;
      if (tech >= 3) {
        const sup = new Array(open.length).fill(0);
        list.forEach((x) => {
          const s = positionSupport(open.map((i) => cand[i]), x & ~solvedMask);
          for (let t = 0; t < open.length; t++) sup[t] |= s[t];
        });
        for (let t = 0; t < open.length; t++) {
          const i = open[t];
          const nm = cand[i] & sup[t];
          if (nm !== cand[i]) {
            cand[i] = nm;
            changed = true;
            if (why) why[i] = { tech: 3, run: k };
            if (!nm) return { changed, bad: true };
          }
        }
        continue;
      }
      let allow = 0;
      let need = 0x3fe;
      list.forEach((x) => {
        allow |= x;
        need &= x;
      });
      allow &= ~solvedMask;
      need &= ~solvedMask;
      for (let t = 0; t < open.length; t++) {
        const i = open[t];
        const nm = cand[i] & allow;
        if (nm !== cand[i]) {
          cand[i] = nm;
          changed = true;
          if (why && !why[i]) why[i] = { tech: tech >= 2 ? 2 : 1, run: k };
          if (!nm) return { changed, bad: true };
        }
      }
      // Naked singles remove their digit from the other cells of the run (tech 1).
      for (let t = 0; t < open.length; t++) {
        const i = open[t];
        if (POP[cand[i]] !== 1) continue;
        for (let u = 0; u < open.length; u++) {
          const j = open[u];
          if (j !== i && cand[j] & cand[i]) {
            cand[j] &= ~cand[i];
            changed = true;
            if (why) why[j] = why[j] || { tech: 1, run: k };
            if (!cand[j]) return { changed, bad: true };
          }
        }
      }
      if (tech >= 2 && need) {
        for (let d = 1; d <= 9; d++) {
          if (!(need & (1 << d))) continue;
          let spot = -1;
          let cnt = 0;
          for (let t = 0; t < open.length; t++) if (cand[open[t]] & (1 << d)) {
            cnt++;
            spot = open[t];
          }
          if (cnt === 0) return { changed, bad: true };
          if (cnt === 1 && cand[spot] !== 1 << d) {
            cand[spot] = 1 << d;
            changed = true;
            if (why) why[spot] = { tech: 2, run: k, hidden: d };
          }
        }
      }
    }
    return { changed, bad: false };
  }

  function propagate(g, cand, maxTech, why, usedRef) {
    for (let guard = 0; guard < 400; guard++) {
      let moved = false;
      for (let t = 1; t <= Math.min(3, maxTech); t++) {
        const res = pass(g, cand, t, why);
        if (res.bad) return false;
        if (res.changed) {
          if (usedRef && t > usedRef.max) usedRef.max = t;
          moved = true;
          break;
        }
      }
      if (!moved) return true;
    }
    return true;
  }

  function solvedAll(g, cand) {
    for (let i = 0; i < cand.length; i++) if (g.white[i] && POP[cand[i]] !== 1) return false;
    return true;
  }

  /** Logical solve up to `maxTech`; returns { solved, maxUsed, cand, contradiction }. */
  function logicSolve(g, maxTech, values, why) {
    const cand = initCands(g, values);
    const used = { max: 1 };
    for (let guard = 0; guard < 200; guard++) {
      if (!propagate(g, cand, maxTech, why, used)) return { solved: false, contradiction: true, maxUsed: used.max, cand };
      if (solvedAll(g, cand)) return { solved: true, maxUsed: used.max, cand };
      if (maxTech < 4) break;
      let progressed = false;
      const N = cand.length;
      for (let i = 0; i < N && !progressed; i++) {
        if (!g.white[i] || POP[cand[i]] < 2 || POP[cand[i]] > 3) continue;
        for (let d = 1; d <= 9; d++) {
          if (!(cand[i] & (1 << d))) continue;
          const trial = cand.slice();
          trial[i] = 1 << d;
          if (!propagate(g, trial, 3, null, null)) {
            cand[i] &= ~(1 << d);
            if (why) why[i] = { tech: 4, run: -1, tried: d };
            used.max = 4;
            progressed = true;
            break;
          }
        }
      }
      if (!progressed) break;
    }
    return { solved: solvedAll(g, cand), maxUsed: used.max, cand };
  }

  /** 1–4 = hardest technique needed; 5 = needs guessing beyond one step (rejected by the generator). */
  function gradeOf(g) {
    for (let t = 1; t <= 4; t++) {
      const res = logicSolve(g, t);
      if (res.solved) return t === 4 ? 4 : t;
    }
    return 5;
  }

  // ---------------------------------------------------------------- generator

  function makeMask(R, C, density, next, minWhite) {
    const white = new Array(R * C).fill(false);
    for (let r = 1; r < R; r++) for (let c = 1; c < C; c++) white[r * C + c] = true;
    const partner = (i) => {
      const r = Math.floor(i / C);
      const c = i % C;
      return (R - r) * C + (C - c);
    };
    const inner = (R - 1) * (C - 1);
    const target = Math.floor(inner * density);
    let blacks = 0;
    let guard = 0;
    const tryBlock = (i) => {
      const p = partner(i);
      if (!white[i]) return 0;
      white[i] = false;
      const hadP = p !== i && white[p];
      if (hadP) white[p] = false;
      if (maskValid(R, C, white, false)) return hadP ? 2 : 1;
      white[i] = true;
      if (hadP) white[p] = true;
      return 0;
    };
    while (blacks < target && guard++ < inner * 6) {
      const r = 1 + (next() % (R - 1));
      const c = 1 + (next() % (C - 1));
      blacks += tryBlock(r * C + c);
    }
    // Break any run longer than 9.
    for (let pass = 0; pass < 4 && !maskValid(R, C, white, true); pass++) {
      const g0 = buildRuns({ R, C, white, sol: null });
      g0.runs.forEach((run) => {
        if (run.cells.length <= 9) return;
        const order = run.cells.slice(2, -2);
        SoloCore.shuffleInPlace(order, next);
        for (let k = 0; k < order.length; k++) if (tryBlock(order[k])) break;
      });
    }
    const g = buildRuns({ R, C, white, sol: null });
    let n = 0;
    for (let i = 0; i < white.length; i++) if (white[i]) n++;
    if (n < minWhite || !structureOk(g)) return null;
    return white;
  }

  /** Every white cell sits in an across and a down run of length ≥ 2 (≤ 9 when `strict`), and whites connect. */
  function maskValid(R, C, white, strict) {
    let first = -1;
    let n = 0;
    for (let i = 0; i < R * C; i++) {
      if (!white[i]) continue;
      n++;
      if (first < 0) first = i;
      const r = Math.floor(i / C);
      const c = i % C;
      const left = c > 1 && white[i - 1];
      const right = c < C - 1 && white[i + 1];
      const up = r > 1 && white[i - C];
      const down = r < R - 1 && white[i + C];
      if ((!left && !right) || (!up && !down)) return false;
      if (strict && !left) {
        let h = 0;
        for (let x = c; x < C && white[r * C + x]; x++) h++;
        if (h > 9) return false;
      }
      if (strict && !up) {
        let v = 0;
        for (let y = r; y < R && white[y * C + c]; y++) v++;
        if (v > 9) return false;
      }
    }
    if (!n) return false;
    const seen = new Uint8Array(R * C);
    const q = [first];
    seen[first] = 1;
    let got = 1;
    while (q.length) {
      const i = q.pop();
      const r = Math.floor(i / C);
      const c = i % C;
      const nb = [r > 0 ? i - C : -1, r < R - 1 ? i + C : -1, c > 0 ? i - 1 : -1, c < C - 1 ? i + 1 : -1];
      for (let k = 0; k < 4; k++) {
        const j = nb[k];
        if (j >= 0 && white[j] && !seen[j]) {
          seen[j] = 1;
          got++;
          q.push(j);
        }
      }
    }
    return got === n;
  }

  function repairMask(R, C, white, partner) {
    for (let guard = 0; guard < 200; guard++) {
      let changed = false;
      for (let i = 0; i < R * C; i++) {
        if (!white[i]) continue;
        const r = Math.floor(i / C);
        const c = i % C;
        let h = 1;
        for (let x = c - 1; x >= 1 && white[r * C + x]; x--) h++;
        for (let x = c + 1; x < C && white[r * C + x]; x++) h++;
        let v = 1;
        for (let y = r - 1; y >= 1 && white[y * C + c]; y--) v++;
        for (let y = r + 1; y < R && white[y * C + c]; y++) v++;
        if (h === 1 || v === 1) {
          white[i] = false;
          const p = partner(i);
          if (p >= 0 && p < R * C) white[p] = false;
          changed = true;
        } else if (h > 9 || v > 9) {
          white[i] = false;
          const p = partner(i);
          if (p >= 0 && p < R * C) white[p] = false;
          changed = true;
        }
      }
      if (!changed) return;
    }
  }

  function fillGrid(g, next, preset) {
    const N = g.R * g.C;
    const sol = preset ? preset.slice() : new Array(N).fill(0);
    const used = new Uint16Array(g.runs.length);
    const whites = [];
    for (let i = 0; i < N; i++) if (g.white[i]) whites.push(i);
    whites.forEach((i) => {
      if (!sol[i]) return;
      const cr = g.cellRuns[i];
      used[cr[0]] |= 1 << sol[i];
      used[cr[1]] |= 1 << sol[i];
    });
    let nodes = 0;
    function rec() {
      if (++nodes > 20000) return false;
      let best = -1;
      let bestM = 0;
      let bestN = 10;
      for (let w = 0; w < whites.length; w++) {
        const i = whites[w];
        if (sol[i]) continue;
        const cr = g.cellRuns[i];
        const m = 0x3fe & ~used[cr[0]] & ~used[cr[1]];
        const n = POP[m];
        if (!n) return false;
        if (n < bestN) {
          bestN = n;
          best = i;
          bestM = m;
        }
      }
      if (best < 0) return true;
      const ds = SoloCore.shuffleInPlace(maskDigits(bestM), next);
      const cr = g.cellRuns[best];
      for (let k = 0; k < ds.length; k++) {
        const d = ds[k];
        sol[best] = d;
        used[cr[0]] |= 1 << d;
        used[cr[1]] |= 1 << d;
        if (rec()) return true;
        used[cr[0]] &= ~(1 << d);
        used[cr[1]] &= ~(1 << d);
        sol[best] = 0;
      }
      return false;
    }
    return rec() ? sol : null;
  }

  function withSums(g, sol) {
    return buildRuns({ R: g.R, C: g.C, white: g.white.slice(), sol });
  }

  /**
   * Deterministic puzzle for (difficulty, seed). Returns { rows, difficulty, grade, R, C, whites, seed, attempts } or null.
   */
  function generate(difficulty, seed, opts) {
    const diff = GRADE[difficulty] ? difficulty : 'easy';
    const spec = SPECS[diff];
    const want = GRADE[diff];
    const next = SoloCore.stream(seed >>> 0);
    const maxAttempts = (opts && opts.maxAttempts) || 600;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const size = spec.sizes[next() % spec.sizes.length];
      const R = size[0];
      const C = size[1];
      const dens = spec.density[0] + ((next() % 1000) / 1000) * (spec.density[1] - spec.density[0]);
      const mask = makeMask(R, C, dens, next, spec.minWhite);
      if (!mask) {
        if (opts && opts.stats) opts.stats.mask = (opts.stats.mask || 0) + 1;
        continue;
      }
      const skel = buildRuns({ R, C, white: mask, sol: null });
      let sol = fillGrid(skel, next);
      if (!sol) continue;
      let g = withSums(skel, sol);
      const fixes = (opts && opts.fixes) || Math.max(60, R * C * 2);
      const nodeCap = R * C >= 100 ? 400000 : 150000;
      for (let fix = 0; fix < fixes; fix++) {
        const res = countSolutions(g, 2, nodeCap);
        if (res.count === 1) break;
        if (res.count !== 2) {
          if (opts && opts.stats) opts.stats.aborted = (opts.stats.aborted || 0) + 1;
          g = null;
          break;
        }
        // Two solutions: free both runs through a differing cell and refill them from the stream.
        const a = sol;
        const b = res.sols[0].every((v, i) => v === a[i]) ? res.sols[1] : res.sols[0];
        const diffs = [];
        for (let i = 0; i < a.length; i++) if (skel.white[i] && a[i] !== b[i]) diffs.push(i);
        if (!diffs.length) {
          g = null;
          break;
        }
        const pick = diffs[next() % diffs.length];
        const free = new Set();
        skel.cellRuns[pick].forEach((k) => skel.runs[k].cells.forEach((i) => free.add(i)));
        const preset = sol.map((v, i) => (free.has(i) ? 0 : v));
        const refilled = fillGrid(skel, next, preset);
        if (!refilled) {
          g = null;
          break;
        }
        sol = refilled;
        g = withSums(skel, sol);
      }
      const st = opts && opts.stats;
      if (!g || countSolutions(g, 2, nodeCap).count !== 1) {
        if (st) st.notUnique = (st.notUnique || 0) + 1;
        continue;
      }
      const grade = gradeOf(g);
      if (st) st['g' + grade] = (st['g' + grade] || 0) + 1;
      if (grade !== want) continue;
      let whites = 0;
      for (let i = 0; i < g.white.length; i++) if (g.white[i]) whites++;
      return { rows: toRows(g), difficulty: diff, grade, R: g.R, C: g.C, whites, seed: seed >>> 0, attempts: attempt };
    }
    return null;
  }

  function puzzleSeed(difficulty, n) {
    return SoloCore.fnv('kakuro|' + difficulty + '|' + n);
  }
  /** Daily difficulty rotates through the week (by day number): Mon–Sun style cycle. */
  const DAILY_CYCLE = ['medium', 'easy', 'medium', 'hard', 'medium', 'hard', 'expert'];
  function dailyDifficulty(dayNo) {
    return DAILY_CYCLE[((Math.floor(dayNo) % 7) + 7) % 7];
  }

  // ---------------------------------------------------------------- checking + hints

  /** values: flat array (0 = empty). Returns { complete, correct, wrong[] } against the puzzle rows. */
  function checkValues(rows, values) {
    const g = fromRows(rows);
    const wrong = [];
    let complete = true;
    for (let i = 0; i < g.white.length; i++) {
      if (!g.white[i]) continue;
      const v = values[i] | 0;
      if (!v) complete = false;
      else if (v !== g.sol[i]) wrong.push(i);
    }
    return { complete, correct: complete && !wrong.length, wrong };
  }

  /** Is a flat digit string a valid solution of these rows? (Checks the rules, not just the stored digits.) */
  function verifySolution(rows, digits) {
    const g = fromRows(rows);
    const vals = String(digits || '');
    let w = 0;
    const val = new Array(g.white.length).fill(0);
    for (let i = 0; i < g.white.length; i++) {
      if (!g.white[i]) continue;
      const d = +vals[w++];
      if (!(d >= 1 && d <= 9)) return false;
      val[i] = d;
    }
    if (w !== vals.length) return false;
    for (let k = 0; k < g.runs.length; k++) {
      const run = g.runs[k];
      let m = 0;
      let s = 0;
      for (let t = 0; t < run.cells.length; t++) {
        const d = val[run.cells[t]];
        if (m & (1 << d)) return false;
        m |= 1 << d;
        s += d;
      }
      if (s !== run.sum) return false;
    }
    return true;
  }
  function solutionString(rows) {
    const g = fromRows(rows);
    let s = '';
    for (let i = 0; i < g.white.length; i++) if (g.white[i]) s += g.sol[i];
    return s;
  }

  function runLabel(g, k) {
    const run = g.runs[k];
    return (run.dir === 'across' ? 'Across ' : 'Down ') + run.sum + ' in ' + run.cells.length;
  }
  function runAllowed(g, k, cand) {
    const run = g.runs[k];
    let solved = 0;
    run.cells.forEach((i) => {
      if (POP[cand[i]] === 1) solved |= cand[i];
    });
    let allow = 0;
    comboMasks(run.sum, run.cells.length)
      .filter((x) => (x & solved) === solved)
      .forEach((x) => (allow |= x));
    return maskDigits(allow & ~solved);
  }

  /**
   * Next logical step from the player's board (values flat, 0 = empty). Wrong digits come first.
   * Returns { kind: 'wrong'|'step'|'none', cell, digit, tech, text } with deterministic wording.
   */
  function nextHint(rows, values) {
    const g = fromRows(rows);
    for (let i = 0; i < g.white.length; i++) {
      if (g.white[i] && values[i] && values[i] !== g.sol[i]) {
        return { kind: 'wrong', cell: i, digit: g.sol[i], tech: 0, text: 'This digit doesn’t belong here — it breaks the solution. Clear it and look again.' };
      }
    }
    const filled = values.map((v, i) => (g.white[i] && v ? v : 0));
    for (let tech = 1; tech <= 4; tech++) {
      const why = {};
      const cand = initCands(g, filled);
      let res;
      if (tech < 4) res = propagate(g, cand, tech, why, null) ? { cand } : null;
      else res = logicSolve(g, 4, filled, why);
      const cc = res ? res.cand : null;
      if (!cc) continue;
      let pick = -1;
      for (let i = 0; i < g.white.length; i++) {
        if (g.white[i] && !filled[i] && POP[cc[i]] === 1) {
          const w = why[i];
          if (pick < 0 || (w && (!why[pick] || w.tech < why[pick].tech))) pick = i;
          if (!w || w.tech <= 1) break;
        }
      }
      if (pick < 0) continue;
      const d = lowDigit(cc[pick]);
      const w = why[pick] || { tech: 1, run: g.cellRuns[pick][0] };
      const [ra, rd] = g.cellRuns[pick];
      const base = initCands(g, filled);
      let text;
      if (w.tech <= 1) {
        const a = runAllowed(g, ra, base);
        const b = runAllowed(g, rd, base);
        text = runLabel(g, ra) + ' allows ' + a.join(' ') + '; ' + runLabel(g, rd) + ' allows ' + b.join(' ') + '. Only ' + d + ' fits both.';
      } else if (w.tech === 2) {
        text = w.hidden
          ? runLabel(g, w.run) + ' must use ' + d + ', and this is the only cell in it that can hold ' + d + '.'
          : runLabel(g, w.run) + ': drop the combinations its cells can’t hold, and this cell can only be ' + d + '.';
      } else if (w.tech === 3) {
        text = runLabel(g, w.run) + ': try every order of the digits it still allows — this cell is ' + d + ' in all of them.';
      } else {
        text = 'If this cell were ' + (w.tried || 'anything else') + ', a crossing run would have no valid combination left. So it’s ' + d + '.';
      }
      return { kind: 'step', cell: pick, digit: d, tech: w.tech, techName: TECH_NAMES[w.tech], text };
    }
    return { kind: 'none', cell: -1, digit: 0, tech: 0, text: 'No single step found — try the combination helper on the tightest run.' };
  }

  /** Auto-candidates: every digit both runs still allow, given the placed digits. */
  function autoCandidates(rows, values) {
    const g = fromRows(rows);
    const filled = values.map((v, i) => (g.white[i] && v ? v : 0));
    const cand = initCands(g, filled);
    pass(g, cand, 1, null);
    return Array.from(cand).map((m, i) => (g.white[i] && !filled[i] ? maskDigits(m) : []));
  }

  return {
    DIFFS,
    GRADE,
    SPECS,
    TECH_NAMES,
    DAILY_CYCLE,
    combos,
    comboMasks,
    maskDigits,
    fromRows,
    toRows,
    buildRuns,
    structureOk,
    countSolutions,
    isUnique,
    logicSolve,
    gradeOf,
    generate,
    puzzleSeed,
    dailyDifficulty,
    checkValues,
    verifySolution,
    solutionString,
    nextHint,
    autoCandidates,
  };
});
