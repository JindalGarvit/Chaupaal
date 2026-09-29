/**
 * Tip Tap match-3 engine (Dangal P14) — pure, integer-only, deterministic. Shared by the phone
 * (arcade.js), the level generator/validator (scripts/gen-tiptap-levels.js) and the server
 * (server-lib/solo-scores.js replays a move log exactly before a score is ranked).
 *
 * Board: rows×cols flat arrays. col[i]: -1 empty · 0..5 colour · 8 item · 9 rainbow.
 * sp[i]: 0 plain · 1 row line · 2 column line · 3 bomb · 4 rainbow · 5 item.
 * lock[i]: chained piece (can't be swapped, doesn't fall; a clear on it breaks the chain only).
 * tile[i]: jelly under the cell (0–2 hp); every clear on the cell removes 1 hp.
 *
 * Swap validity: adjacent, neither piece chained, and the swap makes a line of 3+ — or it is
 * special+special, or a rainbow with any colour piece.
 *
 * Matches → specials (created on the swapped cell when it is part of the match):
 *   3 in a line → cleared · 4 in a row → row line (clears the row) · 4 in a column → column line
 *   L / T / + shape → bomb (clears 3×3) · 5+ in a line → rainbow (colourless).
 * Special × special on swap (centred on the cell the moved piece lands on):
 *   line+line → row + column · line+bomb → 3 rows + 3 columns · bomb+bomb → 5×5
 *   rainbow+colour → every piece of that colour · rainbow+line → that colour turns into lines, all fire
 *   rainbow+bomb → that colour turns into bombs, all fire · rainbow+rainbow → whole board.
 * A special caught in a clear fires too (a rainbow caught in a blast clears the most common colour).
 * Cascades resolve in steps: find every group → clear (with chained fires) → spawn specials →
 * gravity (pieces slide past chained cells) → refill from the seeded stream → items on the bottom
 * row are collected → repeat. No valid move left → deterministic reshuffle (notice event).
 *
 * Score: 20 per piece × cascade step (1, 2, 3…); +60 row/column line, +120 bomb, +200 rainbow made;
 * +40 per jelly layer / chain broken; +500 per item collected; win with moves left → +100 per move.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TipTapEngine = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  const SoloCore = typeof module === 'object' && module.exports ? require('./solo-core.js') : root.SoloCore;

  const SP = { NONE: 0, H: 1, V: 2, BOMB: 3, RAINBOW: 4, ITEM: 5 };
  const ITEM_COL = 8;
  const RAINBOW_COL = 9;
  const POINTS = { piece: 20, line: 60, bomb: 120, rainbow: 200, tile: 40, lock: 40, item: 500, moveLeft: 100 };
  const MAX_CASCADE = 60;

  function rnd(s) {
    const r = SoloCore.mulberryNext(s.rng);
    s.rng = r.state;
    return r.value;
  }

  const isColour = (k) => k >= 0 && k < ITEM_COL;
  const isFirable = (sp) => sp >= SP.H && sp <= SP.RAINBOW;

  // ---------------------------------------------------------------- setup

  function normLevel(level) {
    const L = level || {};
    const rows = Math.max(5, Math.min(10, L.rows || 8));
    const cols = Math.max(5, Math.min(10, L.cols || 8));
    const goals = (Array.isArray(L.goals) && L.goals.length ? L.goals : [{ t: 'score', n: 0 }]).map((g) => Object.assign({}, g));
    return {
      n: L.n || 0,
      rows,
      cols,
      colors: Math.max(4, Math.min(6, L.colors || 5)),
      moves: L.time ? 0 : Math.max(1, L.moves || 25),
      time: L.time ? Math.max(10, L.time) : 0,
      goals,
      tiles: Array.isArray(L.tiles) ? L.tiles : [],
      locks: Array.isArray(L.locks) ? L.locks : [],
      items: L.items && L.items.n ? { n: L.items.n, max: Math.max(1, L.items.max || 2) } : null,
      stars: Array.isArray(L.stars) ? L.stars.slice(0, 3) : [0, 0, 0],
      daily: !!L.daily,
    };
  }

  function createGame(level, seed) {
    const L = normLevel(level);
    const N = L.rows * L.cols;
    const s = {
      v: 1,
      rows: L.rows,
      cols: L.cols,
      colors: L.colors,
      rng: seed >>> 0,
      seed: seed >>> 0,
      col: new Array(N).fill(-1),
      sp: new Array(N).fill(0),
      id: new Array(N).fill(0),
      lock: new Array(N).fill(0),
      tile: new Array(N).fill(0),
      nextId: 1,
      score: 0,
      movesUsed: 0,
      movesLimit: L.moves,
      timeLimit: L.time,
      goals: L.goals,
      scoreOnly: !L.goals.some((g) => g.t !== 'score'),
      items: L.items,
      itemsSpawned: 0,
      collected: { colour: [0, 0, 0, 0, 0, 0], items: 0 },
      tilesLeft: 0,
      locksLeft: 0,
      made: { line: 0, bomb: 0, rainbow: 0, combo: 0 },
      shuffles: 0,
      status: 'play',
      stars: L.stars,
      daily: L.daily,
      log: [],
    };
    L.tiles.forEach((t) => {
      const i = Array.isArray(t) ? t[0] : t;
      const hp = Array.isArray(t) ? t[1] : 1;
      if (i >= 0 && i < N) s.tile[i] = Math.max(1, Math.min(2, hp || 1));
    });
    L.locks.forEach((i) => {
      if (i >= 0 && i < N) s.lock[i] = 1;
    });
    s.tilesLeft = s.tile.reduce((a, v) => a + (v > 0 ? 1 : 0), 0);
    s.locksLeft = s.lock.reduce((a, v) => a + v, 0);
    for (let i = 0; i < N; i++) {
      const r = Math.floor(i / s.cols);
      const c = i % s.cols;
      let k = rnd(s) % s.colors;
      for (let tries = 0; tries < s.colors; tries++) {
        const h2 = c >= 2 && s.col[i - 1] === k && s.col[i - 2] === k;
        const v2 = r >= 2 && s.col[i - s.cols] === k && s.col[i - 2 * s.cols] === k;
        if (!h2 && !v2) break;
        k = (k + 1) % s.colors;
      }
      put(s, i, k, SP.NONE);
    }
    if (s.items) {
      const first = Math.min(s.items.max, s.items.n);
      const colsFree = [];
      for (let c = 0; c < s.cols; c++) if (!s.lock[c]) colsFree.push(c);
      SoloCore.shuffleInPlace(colsFree, () => rnd(s));
      for (let k = 0; k < first && k < colsFree.length; k++) {
        put(s, colsFree[k], ITEM_COL, SP.ITEM);
        s.itemsSpawned++;
      }
    }
    if (!hasMove(s) || findGroups(s).length) reshuffle(s, []);
    return s;
  }

  function put(s, i, k, sp) {
    s.col[i] = k;
    s.sp[i] = sp;
    s.id[i] = s.nextId++;
  }

  function cloneState(s) {
    return Object.assign({}, s, {
      col: s.col.slice(),
      sp: s.sp.slice(),
      id: s.id.slice(),
      lock: s.lock.slice(),
      tile: s.tile.slice(),
      goals: s.goals.map((g) => Object.assign({}, g)),
      collected: { colour: s.collected.colour.slice(), items: s.collected.items },
      made: Object.assign({}, s.made),
      log: s.log.slice(),
    });
  }

  // ---------------------------------------------------------------- matching

  function matchAt(s, i) {
    const k = s.col[i];
    if (!isColour(k)) return false;
    const r = Math.floor(i / s.cols);
    const c = i % s.cols;
    let n = 1;
    for (let x = c - 1; x >= 0 && s.col[r * s.cols + x] === k; x--) n++;
    for (let x = c + 1; x < s.cols && s.col[r * s.cols + x] === k; x++) n++;
    if (n >= 3) return true;
    n = 1;
    for (let y = r - 1; y >= 0 && s.col[y * s.cols + c] === k; y--) n++;
    for (let y = r + 1; y < s.rows && s.col[y * s.cols + c] === k; y++) n++;
    return n >= 3;
  }

  /** Every group of 3+ (runs sharing a cell are one group) with its special kind. */
  function findGroups(s) {
    const runs = [];
    const R = s.rows;
    const C = s.cols;
    for (let r = 0; r < R; r++) {
      let c = 0;
      while (c < C) {
        const k = s.col[r * C + c];
        let e = c + 1;
        if (isColour(k)) while (e < C && s.col[r * C + e] === k) e++;
        if (isColour(k) && e - c >= 3) {
          const cells = [];
          for (let x = c; x < e; x++) cells.push(r * C + x);
          runs.push({ dir: 'h', k, cells });
        }
        c = e;
      }
    }
    for (let c = 0; c < C; c++) {
      let r = 0;
      while (r < R) {
        const k = s.col[r * C + c];
        let e = r + 1;
        if (isColour(k)) while (e < R && s.col[e * C + c] === k) e++;
        if (isColour(k) && e - r >= 3) {
          const cells = [];
          for (let y = r; y < e; y++) cells.push(y * C + c);
          runs.push({ dir: 'v', k, cells });
        }
        r = e;
      }
    }
    if (!runs.length) return [];
    const parent = runs.map((_, i) => i);
    const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    const owner = new Map();
    runs.forEach((run, ri) => {
      run.cells.forEach((cell) => {
        if (owner.has(cell)) parent[find(ri)] = find(owner.get(cell));
        else owner.set(cell, ri);
      });
    });
    const byRoot = new Map();
    runs.forEach((run, ri) => {
      const rt = find(ri);
      if (!byRoot.has(rt)) byRoot.set(rt, []);
      byRoot.get(rt).push(run);
    });
    const groups = [];
    byRoot.forEach((list) => {
      const set = new Set();
      let maxLen = 0;
      let hasH = false;
      let hasV = false;
      let longest = list[0];
      list.forEach((run) => {
        run.cells.forEach((x) => set.add(x));
        if (run.cells.length > maxLen) {
          maxLen = run.cells.length;
          longest = run;
        }
        if (run.dir === 'h') hasH = true;
        else hasV = true;
      });
      let kind = SP.NONE;
      if (maxLen >= 5) kind = SP.RAINBOW;
      else if (hasH && hasV) kind = SP.BOMB;
      else if (maxLen === 4) kind = longest.dir === 'h' ? SP.H : SP.V;
      let cross = -1;
      if (hasH && hasV) {
        const hs = new Set();
        list.forEach((run) => run.dir === 'h' && run.cells.forEach((x) => hs.add(x)));
        list.forEach((run) => {
          if (run.dir === 'v') run.cells.forEach((x) => {
            if (cross < 0 && hs.has(x)) cross = x;
          });
        });
      }
      const cells = Array.from(set).sort((a, b) => a - b);
      groups.push({ k: longest.k, cells, kind, longest: longest.cells, cross });
    });
    groups.sort((a, b) => a.cells[0] - b.cells[0]);
    return groups;
  }

  function spawnCellFor(s, g, pref) {
    const ok = (x) => g.cells.indexOf(x) !== -1 && !s.lock[x];
    for (let i = 0; i < pref.length; i++) if (pref[i] != null && ok(pref[i])) return pref[i];
    if (g.cross >= 0 && ok(g.cross)) return g.cross;
    const mid = g.longest[Math.floor((g.longest.length - 1) / 2)];
    if (ok(mid)) return mid;
    for (let i = 0; i < g.cells.length; i++) if (ok(g.cells[i])) return g.cells[i];
    return -1;
  }

  // ---------------------------------------------------------------- blasts

  function mostCommonColour(s) {
    const n = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < s.col.length; i++) if (isColour(s.col[i]) && s.sp[i] !== SP.RAINBOW) n[s.col[i]]++;
    let best = 0;
    for (let k = 1; k < 6; k++) if (n[k] > n[best]) best = k;
    return best;
  }

  function markRect(s, marks, r0, c0, r1, c1) {
    for (let r = Math.max(0, r0); r <= Math.min(s.rows - 1, r1); r++) {
      for (let c = Math.max(0, c0); c <= Math.min(s.cols - 1, c1); c++) marks.add(r * s.cols + c);
    }
  }

  /** Expand a clear set by firing every unchained special inside it (chain reactions included). */
  function expandFires(s, marks, fired) {
    const queue = Array.from(marks);
    const done = new Set();
    while (queue.length) {
      const i = queue.shift();
      if (done.has(i)) continue;
      done.add(i);
      const sp = s.sp[i];
      if (!isFirable(sp) || s.lock[i]) continue;
      fired.push({ i, sp });
      const r = Math.floor(i / s.cols);
      const c = i % s.cols;
      const before = new Set(marks);
      if (sp === SP.H) markRect(s, marks, r, 0, r, s.cols - 1);
      else if (sp === SP.V) markRect(s, marks, 0, c, s.rows - 1, c);
      else if (sp === SP.BOMB) markRect(s, marks, r - 1, c - 1, r + 1, c + 1);
      else if (sp === SP.RAINBOW) {
        const k = mostCommonColour(s);
        for (let x = 0; x < s.col.length; x++) if (s.col[x] === k) marks.add(x);
      }
      marks.forEach((x) => {
        if (!before.has(x)) queue.push(x);
      });
    }
    return marks;
  }

  // ---------------------------------------------------------------- clear + gravity

  function applyClear(s, marks, spawns, step, events, extra) {
    let gained = 0;
    const cleared = [];
    const broke = [];
    const spawnAt = new Set(spawns.map((x) => x.i));
    marks.forEach((i) => {
      if (s.col[i] === ITEM_COL) return;
      if (s.lock[i]) {
        s.lock[i] = 0;
        s.locksLeft--;
        gained += POINTS.lock;
        broke.push(i);
      } else if (s.col[i] !== -1) {
        const k = s.col[i];
        if (isColour(k)) s.collected.colour[k]++;
        s.col[i] = -1;
        s.sp[i] = 0;
        s.id[i] = 0;
        gained += POINTS.piece * (step + 1);
        cleared.push(i);
      } else return;
      if (s.tile[i] > 0) {
        s.tile[i]--;
        gained += POINTS.tile;
        if (s.tile[i] === 0) s.tilesLeft--;
      }
    });
    const made = [];
    spawns.forEach((x) => {
      if (x.i < 0 || s.col[x.i] !== -1) return;
      const k = x.sp === SP.RAINBOW ? RAINBOW_COL : x.k;
      put(s, x.i, k, x.sp);
      const key = x.sp === SP.RAINBOW ? 'rainbow' : x.sp === SP.BOMB ? 'bomb' : 'line';
      s.made[key]++;
      gained += POINTS[key];
      made.push({ i: x.i, sp: x.sp, k, id: s.id[x.i] });
    });
    s.score += gained;
    events.push(Object.assign({ t: 'clear', step, cells: cleared, broke, made, gained, spawnAt: Array.from(spawnAt) }, extra || {}));
    snapshot(s, events);
    return gained;
  }

  /** With s.snap set (the phone only) every board change is followed by a { t: 'board' } copy for animation. */
  function snapshot(s, events) {
    if (s.snap && events) events.push({ t: 'board', col: s.col.slice(), sp: s.sp.slice(), id: s.id.slice(), lock: s.lock.slice(), tile: s.tile.slice(), score: s.score });
  }

  function spawnPiece(s) {
    const it = s.items;
    if (it && s.itemsSpawned < it.n) {
      let onBoard = 0;
      for (let i = 0; i < s.col.length; i++) if (s.col[i] === ITEM_COL) onBoard++;
      if (onBoard < it.max && rnd(s) % 5 === 0) {
        s.itemsSpawned++;
        return { k: ITEM_COL, sp: SP.ITEM };
      }
    }
    return { k: rnd(s) % s.colors, sp: SP.NONE };
  }

  function gravity(s, events) {
    const moves = [];
    const spawned = [];
    const C = s.cols;
    for (let c = 0; c < C; c++) {
      const slots = [];
      const pieces = [];
      for (let r = s.rows - 1; r >= 0; r--) {
        const i = r * C + c;
        if (s.lock[i] && s.col[i] !== -1) continue;
        slots.push(i);
        if (s.col[i] !== -1) pieces.push({ from: i, k: s.col[i], sp: s.sp[i], id: s.id[i] });
      }
      for (let n = 0; n < slots.length; n++) {
        const to = slots[n];
        if (n < pieces.length) {
          const p = pieces[n];
          s.col[to] = p.k;
          s.sp[to] = p.sp;
          s.id[to] = p.id;
          if (p.from !== to) moves.push([p.from, to]);
        } else {
          const p = spawnPiece(s);
          put(s, to, p.k, p.sp);
          spawned.push({ i: to, k: p.k, sp: p.sp, id: s.id[to], drop: slots.length - n });
        }
      }
    }
    events.push({ t: 'fall', moves, spawned });
    snapshot(s, events);
  }

  function collectItems(s, events) {
    const got = [];
    const base = (s.rows - 1) * s.cols;
    for (let c = 0; c < s.cols; c++) {
      const i = base + c;
      if (s.col[i] === ITEM_COL) {
        s.col[i] = -1;
        s.sp[i] = 0;
        s.id[i] = 0;
        s.collected.items++;
        s.score += POINTS.item;
        got.push(i);
      }
    }
    if (got.length) {
      events.push({ t: 'collect', cells: got, gained: POINTS.item * got.length });
      snapshot(s, events);
    }
    return got.length;
  }

  function settle(s, events) {
    gravity(s, events);
    let guard = 0;
    while (collectItems(s, events) && guard++ < 20) gravity(s, events);
  }

  // ---------------------------------------------------------------- moves

  function adjacent(s, a, b) {
    const N = s.rows * s.cols;
    if (!(a >= 0 && b >= 0 && a < N && b < N) || a === b) return false;
    const ra = Math.floor(a / s.cols);
    const rb = Math.floor(b / s.cols);
    return (ra === rb && Math.abs(a - b) === 1) || Math.abs(a - b) === s.cols;
  }

  function comboKind(s, a, b) {
    const x = s.sp[a];
    const y = s.sp[b];
    if (x === SP.RAINBOW || y === SP.RAINBOW) {
      const other = x === SP.RAINBOW ? b : a;
      if (s.sp[other] === SP.ITEM || s.col[other] === -1) return null;
      return 'rainbow';
    }
    if (isFirable(x) && isFirable(y)) return 'pair';
    return null;
  }

  function validSwap(s, a, b) {
    if (!adjacent(s, a, b)) return false;
    if (s.col[a] === -1 || s.col[b] === -1 || s.lock[a] || s.lock[b]) return false;
    if (comboKind(s, a, b)) return true;
    swapRaw(s, a, b);
    const ok = matchAt(s, a) || matchAt(s, b);
    swapRaw(s, a, b);
    return ok;
  }

  function swapRaw(s, a, b) {
    let t = s.col[a];
    s.col[a] = s.col[b];
    s.col[b] = t;
    t = s.sp[a];
    s.sp[a] = s.sp[b];
    s.sp[b] = t;
    t = s.id[a];
    s.id[a] = s.id[b];
    s.id[b] = t;
  }

  function findMoves(s) {
    const out = [];
    for (let i = 0; i < s.col.length; i++) {
      const c = i % s.cols;
      if (c + 1 < s.cols && validSwap(s, i, i + 1)) out.push([i, i + 1]);
      if (i + s.cols < s.col.length && validSwap(s, i, i + s.cols)) out.push([i, i + s.cols]);
    }
    return out;
  }
  function hasMove(s) {
    for (let i = 0; i < s.col.length; i++) {
      const c = i % s.cols;
      if (c + 1 < s.cols && validSwap(s, i, i + 1)) return true;
      if (i + s.cols < s.col.length && validSwap(s, i, i + s.cols)) return true;
    }
    return false;
  }

  /** Marks for a special combo after the pieces are swapped (moved piece now sits on `b`). */
  function comboMarks(s, a, b) {
    const marks = new Set([a, b]);
    const x = s.sp[a];
    const y = s.sp[b];
    const r = Math.floor(b / s.cols);
    const c = b % s.cols;
    let label = '';
    if (x === SP.RAINBOW && y === SP.RAINBOW) {
      label = 'rainbow+rainbow';
      for (let i = 0; i < s.col.length; i++) marks.add(i);
    } else if (x === SP.RAINBOW || y === SP.RAINBOW) {
      const other = x === SP.RAINBOW ? b : a;
      const k = s.col[other];
      const osp = s.sp[other];
      if (osp === SP.H || osp === SP.V || osp === SP.BOMB) {
        label = osp === SP.BOMB ? 'rainbow+bomb' : 'rainbow+line';
        let flip = 0;
        for (let i = 0; i < s.col.length; i++) {
          if (s.col[i] === k && !s.lock[i]) {
            s.sp[i] = osp === SP.BOMB ? SP.BOMB : flip++ % 2 === 0 ? SP.H : SP.V;
            marks.add(i);
          }
        }
      } else {
        label = 'rainbow+colour';
        for (let i = 0; i < s.col.length; i++) if (s.col[i] === k) marks.add(i);
      }
      s.sp[a === other ? b : a] = SP.NONE;
    } else {
      const lines = (x === SP.H || x === SP.V ? 1 : 0) + (y === SP.H || y === SP.V ? 1 : 0);
      const bombs = (x === SP.BOMB ? 1 : 0) + (y === SP.BOMB ? 1 : 0);
      if (lines === 2) {
        label = 'line+line';
        markRect(s, marks, r, 0, r, s.cols - 1);
        markRect(s, marks, 0, c, s.rows - 1, c);
      } else if (lines === 1 && bombs === 1) {
        label = 'line+bomb';
        markRect(s, marks, r - 1, 0, r + 1, s.cols - 1);
        markRect(s, marks, 0, c - 1, s.rows - 1, c + 1);
      } else {
        label = 'bomb+bomb';
        markRect(s, marks, r - 2, c - 2, r + 2, c + 2);
      }
      s.sp[a] = SP.NONE;
      s.sp[b] = SP.NONE;
    }
    return { marks, label };
  }

  function groupMarks(s, groups, pref) {
    const marks = new Set();
    const spawns = [];
    groups.forEach((g) => {
      g.cells.forEach((x) => marks.add(x));
      if (g.kind) spawns.push({ i: spawnCellFor(s, g, pref), sp: g.kind, k: g.k });
    });
    return { marks, spawns };
  }

  function goalStatus(s) {
    return s.goals.map((g) => {
      let have = 0;
      let need = g.n || 0;
      if (g.t === 'score') have = s.score;
      else if (g.t === 'color') have = s.collected.colour[g.c] || 0;
      else if (g.t === 'items') have = s.collected.items;
      else if (g.t === 'tiles') {
        need = g.n;
        have = g.n - s.tilesLeft;
      } else if (g.t === 'locks') {
        need = g.n;
        have = g.n - s.locksLeft;
      }
      return { t: g.t, c: g.c, need, have: Math.min(have, need || have), done: have >= need };
    });
  }

  function goalsMet(s) {
    return goalStatus(s).every((g) => g.done);
  }

  function updateStatus(s, events) {
    if (s.status !== 'play') return;
    const outOfMoves = s.movesLimit > 0 && s.movesUsed >= s.movesLimit;
    if (s.daily) {
      if (outOfMoves) s.status = 'done';
      return;
    }
    if (!s.scoreOnly && goalsMet(s)) {
      s.status = 'won';
      const left = s.movesLimit > 0 ? s.movesLimit - s.movesUsed : 0;
      if (left > 0) {
        const bonus = left * POINTS.moveLeft;
        s.score += bonus;
        events.push({ t: 'bonus', moves: left, gained: bonus });
      }
      return;
    }
    if (outOfMoves) s.status = goalsMet(s) ? 'won' : 'lost';
  }

  /** Time-limited levels: the UI calls this when the clock runs out. */
  function endByTime(s) {
    if (s.status !== 'play') return s.status;
    s.status = s.daily ? 'done' : goalsMet(s) ? 'won' : 'lost';
    return s.status;
  }

  function reshuffle(s, events) {
    const idx = [];
    for (let i = 0; i < s.col.length; i++) if (s.col[i] !== -1 && !s.lock[i] && s.sp[i] !== SP.ITEM) idx.push(i);
    const pieces = idx.map((i) => ({ k: s.col[i], sp: s.sp[i], id: s.id[i] }));
    const next = () => rnd(s);
    for (let attempt = 0; attempt < 40; attempt++) {
      const order = SoloCore.shuffleInPlace(pieces.slice(), next);
      idx.forEach((i, n) => {
        s.col[i] = order[n].k;
        s.sp[i] = order[n].sp;
        s.id[i] = order[n].id;
      });
      if (!findGroups(s).length && hasMove(s)) {
        s.shuffles++;
        if (events) events.push({ t: 'shuffle', recolour: false });
        snapshot(s, events);
        return true;
      }
    }
    for (let attempt = 0; attempt < 60; attempt++) {
      idx.forEach((i) => {
        if (s.sp[i] === SP.NONE) s.col[i] = rnd(s) % s.colors;
      });
      if (!findGroups(s).length && hasMove(s)) {
        s.shuffles++;
        if (events) events.push({ t: 'shuffle', recolour: true });
        snapshot(s, events);
        return true;
      }
    }
    // Constructive fallback: recolour plain pieces one by one, never completing a line through the
    // cell, so the board can't be left stuck or holding a pre-made match.
    for (let attempt = 0; attempt < 200; attempt++) {
      idx.forEach((i) => {
        if (s.sp[i] !== SP.NONE) return;
        let k = rnd(s) % s.colors;
        for (let tries = 0; tries < s.colors && lineThrough(s, i, k); tries++) k = (k + 1) % s.colors;
        s.col[i] = k;
      });
      if (!findGroups(s).length && hasMove(s)) {
        s.shuffles++;
        if (events) events.push({ t: 'shuffle', recolour: true });
        snapshot(s, events);
        return true;
      }
    }
    return false;
  }

  /** Would colour k at i complete a line of 3+ with the current neighbours? */
  function lineThrough(s, i, k) {
    const r = Math.floor(i / s.cols);
    const c = i % s.cols;
    let n = 1;
    for (let x = c - 1; x >= 0 && s.col[r * s.cols + x] === k; x--) n++;
    for (let x = c + 1; x < s.cols && s.col[r * s.cols + x] === k; x++) n++;
    if (n >= 3) return true;
    n = 1;
    for (let y = r - 1; y >= 0 && s.col[y * s.cols + c] === k; y--) n++;
    for (let y = r + 1; y < s.rows && s.col[y * s.cols + c] === k; y++) n++;
    return n >= 3;
  }

  /**
   * Play one swap. Returns { ok, events, gained } — events drive the UI animation:
   * swap → clear (step, cells, made, fired, combo) → fall (moves, spawned) → collect → … → bonus/shuffle.
   */
  function swap(s, a, b) {
    if (s.status !== 'play') return { ok: false, reason: 'over', events: [] };
    if (!adjacent(s, a, b)) return { ok: false, reason: 'not-adjacent', events: [] };
    if (s.col[a] === -1 || s.col[b] === -1) return { ok: false, reason: 'empty', events: [] };
    if (s.lock[a] || s.lock[b]) return { ok: false, reason: 'locked', events: [] };
    const events = [{ t: 'swap', a, b }];
    const start = s.score;
    const combo = comboKind(s, a, b);
    swapRaw(s, a, b);
    let step = 0;
    if (combo) {
      const res = comboMarks(s, a, b);
      const fired = [];
      expandFires(s, res.marks, fired);
      s.made.combo++;
      applyClear(s, res.marks, [], step, events, { fired, combo: res.label });
    } else {
      const groups = findGroups(s);
      if (!groups.length) {
        swapRaw(s, a, b);
        return { ok: false, reason: 'no-match', events: [] };
      }
      const gm = groupMarks(s, groups, [b, a]);
      const fired = [];
      expandFires(s, gm.marks, fired);
      applyClear(s, gm.marks, gm.spawns, step, events, { fired });
    }
    settle(s, events);
    for (step = 1; step < MAX_CASCADE; step++) {
      const groups = findGroups(s);
      if (!groups.length) break;
      const gm = groupMarks(s, groups, []);
      const fired = [];
      expandFires(s, gm.marks, fired);
      applyClear(s, gm.marks, gm.spawns, step, events, { fired });
      settle(s, events);
    }
    s.movesUsed++;
    s.log.push([a, b]);
    updateStatus(s, events);
    if (s.status === 'play' && !hasMove(s)) reshuffle(s, events);
    return { ok: true, events, gained: s.score - start };
  }

  /**
   * First-step preview of a swap (no refill, state untouched): the cells that would clear and the
   * specials it would make. Used for the move preview, hints and the bot.
   */
  function previewSwap(s, a, b) {
    if (!validSwap(s, a, b)) return null;
    const t = cloneState(s);
    const combo = comboKind(t, a, b);
    swapRaw(t, a, b);
    let marks;
    let spawns = [];
    let label = '';
    if (combo) {
      const res = comboMarks(t, a, b);
      marks = res.marks;
      label = res.label;
    } else {
      const gm = groupMarks(t, findGroups(t), [b, a]);
      marks = gm.marks;
      spawns = gm.spawns;
    }
    const fired = [];
    expandFires(t, marks, fired);
    return { cells: Array.from(marks).filter((i) => t.col[i] !== ITEM_COL).sort((x, y) => x - y), spawns, fired, combo: label };
  }

  function starsFor(s) {
    if (s.status !== 'won') return 0;
    const st = s.stars || [];
    if (st[2] && s.score >= st[2]) return 3;
    if (st[1] && s.score >= st[1]) return 2;
    return 1;
  }

  /** Exact server-side replay of a move log. */
  function replay(level, seed, moves) {
    const s = createGame(level, seed);
    const list = Array.isArray(moves) ? moves : [];
    for (let k = 0; k < list.length; k++) {
      const m = list[k];
      if (!Array.isArray(m) || s.status !== 'play') return { ok: false, at: k, reason: s.status !== 'play' ? 'after-end' : 'bad-move' };
      const res = swap(s, m[0] | 0, m[1] | 0);
      if (!res.ok) return { ok: false, at: k, reason: res.reason };
    }
    return { ok: true, score: s.score, status: s.status, movesUsed: s.movesUsed, stars: starsFor(s), state: s };
  }

  // ---------------------------------------------------------------- bot (level validation + hints)

  /** Heuristic value of a swap from its first-step preview (goal-aware). */
  function scoreMove(s, a, b) {
    const pv = previewSwap(s, a, b);
    if (!pv) return -1;
    const need = {};
    goalStatus(s).forEach((g) => {
      if (!g.done) need[g.t + (g.c != null ? g.c : '')] = true;
    });
    let v = 0;
    pv.cells.forEach((i) => {
      v += 1;
      if (s.tile[i] && need.tiles) v += 3 * s.tile[i];
      if (s.lock[i] && need.locks) v += 3;
      if (need['color' + s.col[i]]) v += 2;
      if (need.items) {
        for (let y = i - s.cols; y >= 0; y -= s.cols) if (s.col[y] === ITEM_COL) v += 2;
      }
      v += Math.floor(i / s.cols) * 0.05;
    });
    pv.spawns.forEach((x) => {
      v += x.sp === SP.RAINBOW ? 10 : x.sp === SP.BOMB ? 6 : 4;
    });
    if (pv.combo) v += 12;
    return v;
  }

  function botMove(s, next, eps) {
    const moves = findMoves(s);
    if (!moves.length) return null;
    if (eps > 0 && next() % 1000 < eps * 1000) return moves[next() % moves.length];
    let best = moves[0];
    let bestV = -Infinity;
    for (let k = 0; k < moves.length; k++) {
      const v = scoreMove(s, moves[k][0], moves[k][1]);
      if (v > bestV) {
        bestV = v;
        best = moves[k];
      }
    }
    return best;
  }

  /**
   * Bot run with no move cap (up to `budget`): records when the goals were met and the score then,
   * so a move limit can be chosen afterwards (the trajectory doesn't depend on the limit).
   */
  function botRun(level, seed, botSeed, opts) {
    const o = opts || {};
    const budget = o.budget || 80;
    const eps = o.eps == null ? 0.15 : o.eps;
    const L = Object.assign({}, level, { moves: budget, time: 0, daily: false });
    const s = createGame(L, seed);
    s.scoreOnly = true; // play on past goals so the trajectory is limit-independent
    const next = SoloCore.stream(botSeed >>> 0);
    const scores = [];
    let doneAt = 0;
    let scoreAtDone = 0;
    for (let m = 0; m < budget; m++) {
      const mv = botMove(s, next, eps);
      if (!mv) break;
      swap(s, mv[0], mv[1]);
      scores.push(s.score);
      if (!doneAt && goalsMet(s) && level.goals.some((g) => g.t !== 'score')) {
        doneAt = m + 1;
        scoreAtDone = s.score;
      }
    }
    return { doneAt, scoreAtDone, scores, moves: s.log.slice() };
  }

  function hintMove(s) {
    const moves = findMoves(s);
    let best = null;
    let bestV = -Infinity;
    moves.forEach((m) => {
      const v = scoreMove(s, m[0], m[1]);
      if (v > bestV) {
        bestV = v;
        best = m;
      }
    });
    return best;
  }

  /** Daily score attack: same seed for everyone, fixed moves, no other goals. */
  function dailyLevel(dayNo) {
    const seed = SoloCore.dailySeed('tiptap', dayNo);
    const next = SoloCore.stream(seed ^ 0x5bd1e995);
    const locks = [];
    const n = 4 + (next() % 5);
    while (locks.length < n) {
      const i = 16 + (next() % 40);
      if (locks.indexOf(i) === -1) locks.push(i);
    }
    return { n: 0, daily: true, rows: 8, cols: 8, colors: 5, moves: 20, goals: [{ t: 'score', n: 0 }], locks, tiles: [], stars: [0, 0, 0], seed };
  }

  /** Theoretical ceiling used by plausibility checks for replay-less paths (never binding for honest play). */
  function maxScorePerMove(level) {
    const L = normLevel(level);
    return L.rows * L.cols * POINTS.piece * 12 + 4000;
  }

  return {
    SP,
    ITEM_COL,
    RAINBOW_COL,
    POINTS,
    normLevel,
    createGame,
    cloneState,
    findGroups,
    findMoves,
    hasMove,
    validSwap,
    previewSwap,
    swap,
    reshuffle,
    goalStatus,
    goalsMet,
    endByTime,
    starsFor,
    replay,
    botMove,
    botRun,
    hintMove,
    dailyLevel,
    maxScorePerMove,
    _swapRaw: swapRaw,
    _comboMarks: comboMarks,
  };
});
