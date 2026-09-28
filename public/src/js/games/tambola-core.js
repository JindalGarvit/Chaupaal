/**
 * Tambola (Dangal P9) — 90-ball Tambola / Housie and 75-ball Bingo: tickets, draws, prizes, claims
 * and bots. Shared by the browser (practice, Caller mode) and the server (server-lib/tambola-engine.js).
 * UMD, no DOM.
 *
 * 90-ball tickets follow the standard: a 3×9 grid, 15 numbers, exactly 5 per row, every column holds
 * 1–3 numbers from its band (1–9, 10–19 … 70–79, 80–90) sorted top to bottom. Tickets are cut from
 * strips of 6 that cover 1–90 exactly once, so a full sheet never repeats a number.
 * 75-ball cards: 5×5, columns B 1–15 · I 16–30 · N 31–45 · G 46–60 · O 61–75, free centre.
 *
 * Claims are checked against the numbers called at claim time. The first valid claim wins; a valid
 * claim for the same prize within TIE_MS of it (on a ticket already complete at that call) shares it.
 * An invalid claim is a bogey: that ticket is blocked for that prize (or, with the warn setting, the
 * first bogey is only a warning).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TambolaCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VARIANTS = ['90', '75'];
  const PACES = [5, 8, 12];
  const MODES = ['fun', 'table', 'wallet'];
  const TIE_MS = 1000;
  const CLAIM_GAP_MS = 1500;
  const MAX_TICKETS = 6;
  const PRICES = [5, 10, 25];
  const BOT_DELAY = [1500, 4500];
  const LOG_MAX = 10;

  const PRIZES_90 = {
    early5: { label: 'Early Five', desc: 'The first five numbers on one ticket' },
    top: { label: 'Top Line', desc: 'All five numbers on the top row' },
    middle: { label: 'Middle Line', desc: 'All five numbers on the middle row' },
    bottom: { label: 'Bottom Line', desc: 'All five numbers on the bottom row' },
    corners: { label: 'Four Corners', desc: 'First and last numbers of the top and bottom rows' },
    full: { label: 'Full House', desc: 'All fifteen numbers' },
    full2: { label: '2nd Full House', desc: 'The next Full House after the first' },
    full3: { label: '3rd Full House', desc: 'The next Full House after the second' },
    early7: { label: 'Early Seven', desc: 'The first seven numbers on one ticket' },
    star: { label: 'Star', desc: 'Four corners plus the centre number of the middle row' },
    breakfast: { label: 'Breakfast', desc: 'Every number in columns 1–3' },
    lunch: { label: 'Lunch', desc: 'Every number in columns 4–6' },
    dinner: { label: 'Dinner', desc: 'Every number in columns 7–9' },
  };
  const PRIZES_75 = {
    line: { label: 'Any Line', desc: 'A full row, column or diagonal (the free centre counts)' },
    corners: { label: 'Four Corners', desc: 'The four corner squares' },
    x: { label: 'X', desc: 'Both diagonals' },
    blackout: { label: 'Blackout', desc: 'Every square on the card' },
    custom: { label: 'Custom pattern', desc: 'The host’s own pattern' },
  };
  const DEFAULT_PRIZES = { 90: ['early5', 'top', 'middle', 'bottom', 'corners', 'full'], 75: ['line', 'corners', 'x', 'blackout'] };
  const DEFAULT_SHARES = { early5: 10, top: 10, middle: 10, bottom: 10, corners: 10, full: 40, full2: 20, full3: 10, early7: 10, star: 10, breakfast: 10, lunch: 10, dinner: 10, line: 15, x: 20, blackout: 45, custom: 20 };
  /** A prize that opens only once the one before it has been won. */
  const AFTER = { full2: 'full', full3: 'full2' };

  // ---------------------------------------------------------------- RNG + helpers

  /** mulberry32 — deterministic tickets from a printed code (Caller mode) and seeded tests. */
  function seeded(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let x = s;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(list, rng) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }
  const range = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  /** Tickets travel packed: two digits per cell ("05000031…"), 54 chars for 90-ball, 50 for 75-ball. */
  const pack = (g) => arr(g).map((n) => String(Number(n) || 0).padStart(2, '0')).join('');
  const unpack = (s) => {
    if (Array.isArray(s)) return s.map((n) => Number(n) || 0);
    const str = String(s || '');
    const out = [];
    for (let i = 0; i + 1 < str.length; i += 2) out.push(Number(str.slice(i, i + 2)) || 0);
    return out;
  };
  const arr = (x) => {
    if (Array.isArray(x)) return x;
    if (x && typeof x === 'object') {
      const out = [];
      Object.keys(x)
        .filter((k) => /^\d+$/.test(k))
        .forEach((k) => (out[Number(k)] = x[k]));
      return out;
    }
    return [];
  };

  // ---------------------------------------------------------------- 90-ball tickets

  /** Column band for a 90-ball ticket: 1–9, 10–19 … 70–79, 80–90. */
  function band90(c) {
    if (c === 0) return [1, 9];
    if (c === 8) return [80, 90];
    return [c * 10, c * 10 + 9];
  }
  const col90 = (n) => (n >= 90 ? 8 : Math.floor(n / 10));

  /** Six tickets from one strip: counts per column (1–3), 15 per ticket, every number once. */
  function stripCounts(rng) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const counts = Array.from({ length: 6 }, () => Array(9).fill(1));
      const need = Array(6).fill(6);
      const cols = range(0, 8)
        .map((c) => ({ c, extra: band90(c)[1] - band90(c)[0] + 1 - 6 }))
        .sort((a, b) => b.extra - a.extra || rng() - 0.5);
      let ok = true;
      for (const { c, extra } of cols) {
        for (let e = 0; e < extra; e++) {
          const opts = range(0, 5).filter((t) => need[t] > 0 && counts[t][c] < 3);
          if (!opts.length) {
            ok = false;
            break;
          }
          const top = Math.max.apply(null, opts.map((t) => need[t]));
          const best = opts.filter((t) => need[t] === top);
          const t = best[Math.floor(rng() * best.length)];
          counts[t][c]++;
          need[t]--;
        }
        if (!ok) break;
      }
      if (ok && need.every((x) => x === 0)) return counts;
    }
    return null;
  }

  /** Which rows each column fills so every row ends with exactly 5 numbers (backtracking). */
  function placeRows(counts, rng) {
    const order = range(0, 8).sort((a, b) => counts[b] - counts[a] || rng() - 0.5);
    const rows = [0, 0, 0];
    const pick = Array(9).fill(null);
    const subsets = { 1: [[0], [1], [2]], 2: [[0, 1], [0, 2], [1, 2]], 3: [[0, 1, 2]] };
    const go = (k) => {
      if (k === order.length) return rows.every((r) => r === 5);
      const c = order[k];
      const opts = shuffle(subsets[counts[c]], rng).sort((a, b) => a.reduce((s, r) => s + rows[r], 0) - b.reduce((s, r) => s + rows[r], 0));
      for (const set of opts) {
        if (set.some((r) => rows[r] >= 5)) continue;
        set.forEach((r) => rows[r]++);
        pick[c] = set;
        if (go(k + 1)) return true;
        set.forEach((r) => rows[r]--);
      }
      return false;
    };
    return go(0) ? pick : null;
  }

  /** @returns {number[][]} six 27-cell grids (row-major, 0 = blank) covering 1–90 exactly once */
  function strip90(rng) {
    const R = rng || Math.random;
    for (let attempt = 0; attempt < 50; attempt++) {
      const counts = stripCounts(R);
      if (!counts) continue;
      const pools = range(0, 8).map((c) => shuffle(range(band90(c)[0], band90(c)[1]), R));
      const grids = [];
      let ok = true;
      for (let t = 0; t < 6 && ok; t++) {
        const rowsFor = placeRows(counts[t], R);
        if (!rowsFor) {
          ok = false;
          break;
        }
        const g = Array(27).fill(0);
        for (let c = 0; c < 9; c++) {
          const nums = pools[c].splice(0, counts[t][c]).sort((a, b) => a - b);
          rowsFor[c]
            .slice()
            .sort((a, b) => a - b)
            .forEach((r, k) => (g[r * 9 + c] = nums[k]));
        }
        grids.push(g);
      }
      if (ok) return grids;
    }
    throw new Error('Tambola: could not build a strip');
  }

  /** One valid ticket (a random ticket from a fresh strip). */
  function ticket90(rng) {
    const R = rng || Math.random;
    const strip = strip90(R);
    return strip[Math.floor(R() * 6)];
  }

  function validTicket90(g) {
    const t = arr(g).map(Number);
    if (t.length !== 27) return false;
    const seen = new Set();
    for (let r = 0; r < 3; r++) {
      let n = 0;
      for (let c = 0; c < 9; c++) if (t[r * 9 + c]) n++;
      if (n !== 5) return false;
    }
    for (let c = 0; c < 9; c++) {
      const [lo, hi] = band90(c);
      const col = [0, 1, 2].map((r) => t[r * 9 + c]).filter(Boolean);
      if (col.length < 1 || col.length > 3) return false;
      for (let k = 0; k < col.length; k++) {
        if (col[k] < lo || col[k] > hi || !Number.isInteger(col[k])) return false;
        if (k && col[k] <= col[k - 1]) return false;
        if (seen.has(col[k])) return false;
        seen.add(col[k]);
      }
    }
    return seen.size === 15;
  }

  const rows90 = (g) => [0, 1, 2].map((r) => arr(g).slice(r * 9, r * 9 + 9).filter(Boolean));
  const nums90 = (g) => arr(g).filter(Boolean);

  // ---------------------------------------------------------------- 75-ball cards

  const LETTERS = ['B', 'I', 'N', 'G', 'O'];
  const band75 = (c) => [c * 15 + 1, c * 15 + 15];
  const letter75 = (n) => LETTERS[Math.min(4, Math.floor((n - 1) / 15))];

  function card75(rng) {
    const R = rng || Math.random;
    const g = Array(25).fill(0);
    for (let c = 0; c < 5; c++) {
      const [lo, hi] = band75(c);
      const nums = shuffle(range(lo, hi), R).slice(0, 5);
      for (let r = 0; r < 5; r++) g[r * 5 + c] = r === 2 && c === 2 ? 0 : nums[r];
    }
    return g;
  }

  function validCard75(g) {
    const t = arr(g).map(Number);
    if (t.length !== 25 || t[12] !== 0) return false;
    const seen = new Set();
    for (let c = 0; c < 5; c++) {
      const [lo, hi] = band75(c);
      for (let r = 0; r < 5; r++) {
        if (r === 2 && c === 2) continue;
        const n = t[r * 5 + c];
        if (!(n >= lo && n <= hi) || seen.has(n)) return false;
        seen.add(n);
      }
    }
    return seen.size === 24;
  }

  const LINES_75 = (() => {
    const L = [];
    for (let r = 0; r < 5; r++) L.push(range(0, 4).map((c) => r * 5 + c));
    for (let c = 0; c < 5; c++) L.push(range(0, 4).map((r) => r * 5 + c));
    L.push([0, 6, 12, 18, 24], [4, 8, 12, 16, 20]);
    return L;
  })();
  /** Custom pattern mask (25 bits, row-major) → cell indices. Always includes nothing outside 0–24. */
  const maskCells = (mask) => range(0, 24).filter((i) => ((Number(mask) >>> 0) >>> i) & 1);

  // ---------------------------------------------------------------- prizes

  /**
   * Cell groups that complete a prize. For "early" prizes the special count rule applies.
   * @returns {{ any?: number[][], all?: number[], early?: number }}
   */
  function prizeCells(variant, key, g, mask) {
    const t = arr(g).map(Number);
    if (variant === '75') {
      if (key === 'line') return { any: LINES_75 };
      if (key === 'corners') return { all: [0, 4, 20, 24] };
      if (key === 'x') return { all: [0, 6, 12, 18, 24, 4, 8, 16, 20] };
      if (key === 'blackout') return { all: range(0, 24) };
      if (key === 'custom') return { all: maskCells(mask) };
      return null;
    }
    const idx = (pred) => range(0, 26).filter((i) => t[i] && pred(i));
    const rowCells = (r) => idx((i) => Math.floor(i / 9) === r);
    if (key === 'early5') return { early: 5 };
    if (key === 'early7') return { early: 7 };
    if (key === 'top') return { all: rowCells(0) };
    if (key === 'middle') return { all: rowCells(1) };
    if (key === 'bottom') return { all: rowCells(2) };
    if (key === 'corners' || key === 'star') {
      const top = rowCells(0);
      const bot = rowCells(2);
      const cells = [top[0], top[top.length - 1], bot[0], bot[bot.length - 1]];
      if (key === 'star') cells.push(rowCells(1)[2]);
      return { all: cells };
    }
    if (key === 'breakfast') return { all: idx((i) => i % 9 <= 2) };
    if (key === 'lunch') return { all: idx((i) => i % 9 >= 3 && i % 9 <= 5) };
    if (key === 'dinner') return { all: idx((i) => i % 9 >= 6) };
    if (key === 'full' || key === 'full2' || key === 'full3') return { all: idx(() => true) };
    return null;
  }

  /**
   * When did this ticket complete the prize? 1-based position in `order` (the called list), or 0 if
   * it isn't complete. The free centre (75-ball) is always marked.
   */
  function completedAt(variant, key, g, order, mask) {
    const spec = prizeCells(variant, key, g, mask);
    if (!spec) return 0;
    const t = arr(g).map(Number);
    const pos = {};
    arr(order).forEach((n, i) => (pos[n] = i + 1));
    const at = (cell) => (t[cell] === 0 ? (variant === '75' ? 0 : Infinity) : pos[t[cell]] || Infinity);
    const allAt = (cells) => (cells.length ? Math.max.apply(null, cells.map(at)) : Infinity);
    let best = Infinity;
    if (spec.early) {
      const hits = nums90(t)
        .map((n) => pos[n] || Infinity)
        .sort((a, b) => a - b);
      best = hits[spec.early - 1];
    } else if (spec.any) best = Math.min.apply(null, spec.any.map(allAt));
    else best = allAt(spec.all);
    return Number.isFinite(best) ? Math.max(1, best) : 0;
  }
  const prizeDone = (variant, key, g, order, mask) => completedAt(variant, key, g, order, mask) > 0;

  function prizeInfo(variant, key) {
    return (variant === '75' ? PRIZES_75 : PRIZES_90)[key] || null;
  }

  // ---------------------------------------------------------------- settings

  function mergeSettings(raw, trusted) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const variant = VARIANTS.indexOf(String(r.variant)) >= 0 ? String(r.variant) : '90';
    const table = variant === '75' ? PRIZES_75 : PRIZES_90;
    let prizes = arr(r.prizes)
      .map(String)
      .filter((k, i, a) => table[k] && a.indexOf(k) === i);
    if (!prizes.length) prizes = DEFAULT_PRIZES[variant].slice();
    if (variant === '90') {
      if (prizes.indexOf('full3') >= 0 && prizes.indexOf('full2') < 0) prizes.push('full2');
      if (prizes.indexOf('full2') >= 0 && prizes.indexOf('full') < 0) prizes.push('full');
    }
    const order = Object.keys(table);
    prizes.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const shares = {};
    const rs = r.shares && typeof r.shares === 'object' ? r.shares : {};
    prizes.forEach((k) => {
      const v = Math.floor(Number(rs[k]));
      shares[k] = v >= 0 && v <= 100 ? v : DEFAULT_SHARES[k] || 10;
    });
    if (!prizes.some((k) => shares[k] > 0)) prizes.forEach((k) => (shares[k] = DEFAULT_SHARES[k] || 10));
    const pace = PACES.indexOf(Number(r.pace)) >= 0 ? Number(r.pace) : 8;
    let mode = MODES.indexOf(r.mode) >= 0 ? r.mode : 'fun';
    if (mode === 'wallet' && !trusted) mode = 'table';
    const price = PRICES.indexOf(Number(r.price)) >= 0 ? Number(r.price) : 10;
    const labels = {};
    const rl = r.labels && typeof r.labels === 'object' ? r.labels : {};
    prizes.forEach((k) => {
      const s = String(rl[k] || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24);
      if (s) labels[k] = s;
    });
    return {
      variant,
      pace,
      prizes,
      shares,
      labels,
      mask: variant === '75' ? (Number(r.mask) >>> 0) & 0x1ffffff || 0x1f : 0,
      mode,
      price: mode === 'fun' ? 0 : price,
      maxTickets: Math.max(1, Math.min(MAX_TICKETS, Math.floor(Number(r.maxTickets) || MAX_TICKETS))),
      daub: r.daub === 'auto' ? 'auto' : 'manual',
      bogey: r.bogey === 'warn' ? 'warn' : 'block',
      public: trusted ? !!r.public : false,
    };
  }

  // ---------------------------------------------------------------- game

  /**
   * @param {{id:string,name:string,bot?:boolean,tickets?:number,sheet?:boolean,paid?:boolean}[]} players
   * @param {object} settings mergeSettings()
   * @param {() => number} rng CSPRNG on the server
   * @param {number} now
   */
  function newGame(players, settings, rng, now) {
    const set = settings && settings.labels && settings.shares && settings.pace ? settings : mergeSettings(settings, true);
    const R = rng || Math.random;
    const seats = [];
    const tickets = [];
    (players || []).forEach((p) => {
      const want = p.sheet ? 6 : Math.max(0, Math.min(set.maxTickets, Math.floor(Number(p.tickets) || 1)));
      if (!want) return;
      const list = set.variant === '75' ? Array.from({ length: want }, () => card75(R)) : strip90(R).slice(0, want);
      seats.push({ id: String(p.id), name: String(p.name || 'Player'), bot: !!p.bot, n: want, left: false, paid: !p.bot && set.mode !== 'fun' ? want * set.price : 0 });
      tickets.push(list.map(pack));
    });
    const total = set.variant === '75' ? 75 : 90;
    const st = {
      v: 1,
      variant: set.variant,
      paceMs: set.pace * 1000,
      mode: set.mode,
      price: set.price,
      bogey: set.bogey,
      daub: set.daub,
      mask: set.mask,
      seats,
      tickets,
      bag: shuffle(range(1, total), R),
      called: [],
      prizes: set.prizes.map((k) => ({ key: k, label: set.labels[k] || prizeInfo(set.variant, k).label, share: set.shares[k], status: 'open', winners: [], firstAt: 0, ball: 0 })),
      blocked: [],
      warned: [],
      lastClaim: {},
      botPlan: [],
      nextAt: (Number(now) || 0) + 3000,
      now: Number(now) || 0,
      over: false,
      endReason: '',
      results: null,
      log: [],
      seq: 0,
    };
    return st;
  }

  const potOf = (st) => st.seats.reduce((a, s) => a + (s.paid || 0), 0);
  const pushLog = (st, e) => {
    st.log.push(e);
    if (st.log.length > LOG_MAX) st.log.splice(0, st.log.length - LOG_MAX);
  };
  const prizeOf = (st, key) => st.prizes.find((p) => p.key === key) || null;
  /** A prize can be claimed now: open, and the prize it follows (2nd / 3rd Full House) is already won. */
  function claimable(st, p) {
    if (!p || p.status !== 'open') return false;
    const before = AFTER[p.key] && prizeOf(st, AFTER[p.key]);
    return !before || before.status !== 'open';
  }
  const blockKey = (seat, t, key) => seat + ':' + t + ':' + key;

  /** Close tie windows that have run out; the game ends when every prize is settled or the bag is empty. */
  function settle(st, now) {
    st.prizes.forEach((p) => {
      if (p.status === 'won' && now - p.firstAt >= TIE_MS) p.status = 'closed';
    });
    if (st.prizes.every((p) => p.status === 'closed')) end(st, 'prizes');
    else if (!st.bag.length && st.prizes.every((p) => p.status !== 'won')) end(st, 'numbers');
  }

  /** Schedule bot claims (human-like delay) for every bot ticket that completes a claimable prize. */
  function planBots(st, now, rng) {
    const R = rng || Math.random;
    st.botPlan = st.botPlan.filter((b) => {
      const p = prizeOf(st, b.key);
      return p && (claimable(st, p) || (p.status === 'won' && now - p.firstAt < TIE_MS));
    });
    st.seats.forEach((s, i) => {
      if (!s.bot || s.left) return;
      st.prizes.forEach((p) => {
        if (!claimable(st, p)) return;
        if (p.winners.some((w) => w.seat === i)) return;
        if (st.botPlan.some((b) => b.seat === i && b.key === p.key)) return;
        const t = st.tickets[i].findIndex((g, k) => st.blocked.indexOf(blockKey(i, k, p.key)) < 0 && prizeDone(st.variant, p.key, unpack(g), st.called, st.mask));
        if (t < 0) return;
        const delay = Math.round(BOT_DELAY[0] + R() * (BOT_DELAY[1] - BOT_DELAY[0]));
        st.botPlan.push({ seat: i, key: p.key, t, at: now + delay });
      });
    });
  }

  function draw(st, now, rng) {
    if (st.over) return { error: 'over' };
    if (!st.bag.length) return { error: 'empty' };
    const n = st.bag.shift();
    st.called.push(n);
    st.now = now;
    st.nextAt = now + st.paceMs;
    pushLog(st, { k: 'ball', n, at: now });
    planBots(st, now, rng);
    st.seq++;
    return { n };
  }

  /**
   * A claim for a prize on one of the seat's tickets, checked against the numbers called so far.
   * @returns {{error?: string, won?: boolean, tie?: boolean, bogey?: boolean, warned?: boolean, blocked?: boolean}}
   */
  function claim(st, seat, a, now) {
    if (st.over) return { error: 'over' };
    const s = st.seats[seat];
    if (!s) return { error: 'not_seated' };
    if (s.left) return { error: 'left' };
    const p = prizeOf(st, String((a && a.key) || ''));
    if (!p) return { error: 'no_prize' };
    const t = Math.floor(Number(a && a.t));
    const packed = st.tickets[seat] && st.tickets[seat][t];
    if (!packed) return { error: 'no_ticket' };
    const g = unpack(packed);
    const last = Number(st.lastClaim[seat]) || 0;
    if (last && now - last < CLAIM_GAP_MS) return { error: 'slow_down' };
    if (st.blocked.indexOf(blockKey(seat, t, p.key)) >= 0) return { error: 'blocked' };
    const tieOpen = p.status === 'won' && now - p.firstAt < TIE_MS;
    if (!claimable(st, p) && !tieOpen) return { error: p.status === 'open' ? 'not_yet' : 'taken' };
    if (p.winners.some((w) => w.seat === seat)) return { error: 'already_won' };
    st.lastClaim[seat] = now;
    st.now = now;
    const done = completedAt(st.variant, p.key, g, st.called, st.mask);
    if (!done || (tieOpen && done > p.ball)) {
      if (tieOpen && done) return { error: 'taken' };
      const warn = st.bogey === 'warn' && st.warned.indexOf(seat) < 0;
      if (warn) st.warned.push(seat);
      else st.blocked.push(blockKey(seat, t, p.key));
      pushLog(st, { k: 'bogey', s: seat, name: s.name, key: p.key, warned: warn, at: now });
      st.seq++;
      return { bogey: true, warned: warn, blocked: !warn };
    }
    // Same-prize fullness: a ticket already holding the Full House can't also take 2nd / 3rd.
    if (AFTER[p.key]) {
      const chain = [];
      let k = AFTER[p.key];
      while (k) {
        chain.push(k);
        k = AFTER[k];
      }
      if (chain.some((key) => (prizeOf(st, key) || { winners: [] }).winners.some((w) => w.seat === seat && w.t === t))) return { error: 'already_won' };
    }
    if (tieOpen) {
      p.winners.push({ seat, t, at: now, name: s.name });
      pushLog(st, { k: 'tie', s: seat, name: s.name, key: p.key, at: now });
    } else {
      p.status = 'won';
      p.firstAt = now;
      p.ball = st.called.length;
      p.winners = [{ seat, t, at: now, name: s.name }];
      pushLog(st, { k: 'win', s: seat, name: s.name, key: p.key, at: now });
    }
    st.seq++;
    return { won: true, tie: tieOpen };
  }

  /** Server clock step: settle ties, fire due bot claims, draw when due. */
  function advance(st, now, rng) {
    if (st.over) return {};
    st.now = now;
    const before = st.seq;
    settle(st, now);
    if (st.over) {
      st.seq++;
      return {};
    }
    st.botPlan
      .filter((b) => b.at <= now)
      .sort((a, b) => a.at - b.at)
      .forEach((b) => {
        st.botPlan = st.botPlan.filter((x) => x !== b);
        delete st.lastClaim[b.seat];
        claim(st, b.seat, { key: b.key, t: b.t }, b.at);
      });
    planBots(st, now, rng);
    settle(st, now);
    if (!st.over && now >= st.nextAt && st.bag.length) draw(st, now, rng);
    if (!st.over && !st.bag.length) settle(st, now);
    if (st.seq === before) st.seq++;
    return {};
  }

  /** The next moment the server must act: a draw, a bot claim, or a tie window closing. */
  function nextEventAt(st) {
    if (st.over) return 0;
    const times = [];
    if (st.bag.length) times.push(st.nextAt);
    st.botPlan.forEach((b) => times.push(b.at));
    st.prizes.forEach((p) => {
      if (p.status === 'won') times.push(p.firstAt + TIE_MS);
    });
    if (!times.length) times.push(st.now + 1000);
    return Math.min.apply(null, times);
  }

  /** Shift every clock by `ms` (the host paused the room). */
  function shiftClock(st, ms) {
    const d = Math.max(0, Number(ms) || 0);
    st.nextAt += d;
    st.botPlan.forEach((b) => (b.at += d));
    st.prizes.forEach((p) => {
      if (p.firstAt) p.firstAt += d;
    });
    Object.keys(st.lastClaim).forEach((k) => (st.lastClaim[k] += d));
  }

  /**
   * Prize money: each prize's share of the pot (by weight) splits between its winners. A prize won by
   * a bot, or never claimed, goes back to the ticket buyers pro rata — bots never take chips.
   * Fun rooms score points (the share weights). Everything is an integer and sums to zero in chip modes.
   */
  function computeResults(st) {
    const n = st.seats.length;
    const win = Array(n).fill(0);
    const pot = potOf(st);
    const weight = st.prizes.reduce((a, p) => a + (p.share || 0), 0) || 1;
    const chips = st.mode !== 'fun';
    let back = 0;
    let given = 0;
    st.prizes.forEach((p, k) => {
      const amount = chips ? (k === st.prizes.length - 1 ? pot - given : Math.floor((pot * (p.share || 0)) / weight)) : p.share || 0;
      if (chips) given += amount;
      const humans = p.winners.filter((w) => !st.seats[w.seat].bot);
      if (!p.winners.length || (chips && humans.length < p.winners.length)) {
        const botPart = p.winners.length ? Math.floor((amount * (p.winners.length - humans.length)) / p.winners.length) : amount;
        if (chips) back += botPart;
        const rest = amount - (chips ? botPart : 0);
        splitAmong(humans, rest, win);
        return;
      }
      splitAmong(p.winners, amount, win);
    });
    if (chips && back > 0 && pot > 0) {
      let spread = 0;
      const payers = st.seats.map((s, i) => i).filter((i) => st.seats[i].paid > 0);
      payers.forEach((i) => {
        const r = Math.floor((back * st.seats[i].paid) / pot);
        win[i] += r;
        spread += r;
      });
      if (payers.length) win[payers[0]] += back - spread;
    }
    const net = st.seats.map((s, i) => win[i] - (chips ? s.paid : 0));
    return { pot, win, net, points: !chips };
  }
  function splitAmong(winners, amount, win) {
    if (!winners.length || !amount) return;
    const each = Math.floor(amount / winners.length);
    winners.forEach((w) => (win[w.seat] += each));
    win[winners[0].seat] += amount - each * winners.length;
  }

  function end(st, reason) {
    if (st.over) return;
    st.over = true;
    st.endReason = reason || 'prizes';
    st.prizes.forEach((p) => {
      if (p.status === 'won') p.status = 'closed';
    });
    st.botPlan = [];
    st.results = computeResults(st);
  }

  function leave(st, seat) {
    const s = st.seats[seat];
    if (!s || s.left) return;
    s.left = true;
    st.botPlan = st.botPlan.filter((b) => b.seat !== seat);
    st.seq++;
  }

  // ---------------------------------------------------------------- views

  /** Numbers-only public state: tickets never appear here. */
  function publicView(st) {
    const humans = st.seats.filter((s) => !s.bot).length;
    return {
      v: st.v,
      variant: st.variant,
      paceMs: st.paceMs,
      mode: st.mode,
      price: st.price,
      bogey: st.bogey,
      daub: st.daub,
      mask: st.mask,
      called: st.called.slice(),
      count: st.called.length,
      total: st.variant === '75' ? 75 : 90,
      nextAt: st.nextAt,
      prizes: st.prizes.map((p) => ({ key: p.key, label: p.label, share: p.share, status: p.status, firstAt: p.firstAt, ball: p.ball, winners: p.winners.map((w) => ({ seat: w.seat, t: w.t, name: w.name, bot: !!st.seats[w.seat].bot })) })),
      players: humans,
      bots: st.seats.length - humans,
      tickets: st.seats.reduce((a, s) => a + s.n, 0),
      pot: potOf(st),
      over: st.over,
      endReason: st.endReason,
      log: st.log.filter((e) => e.k !== 'ball').slice(-6),
      seq: st.seq,
    };
  }

  function privateView(st, seat) {
    const s = st.seats[seat];
    if (!s) return { seat: -1, tickets: [] };
    const out = {
      seat,
      tickets: st.tickets[seat].slice(),
      blocked: st.blocked.filter((b) => b.indexOf(seat + ':') === 0).map((b) => b.slice(String(seat).length + 1)),
      warned: st.warned.indexOf(seat) >= 0,
      paid: s.paid,
    };
    if (st.over && st.results) out.result = { win: st.results.win[seat], net: st.results.net[seat], points: st.results.points };
    return out;
  }

  function hydrate(raw) {
    const st = raw || {};
    st.seats = arr(st.seats).filter(Boolean).map((s) => Object.assign({ bot: false, left: false, paid: 0, n: 0 }, s));
    const tk = arr(st.tickets);
    st.tickets = st.seats.map((s, i) => arr(tk[i]).filter(Boolean).map((g) => (typeof g === 'string' ? g : pack(g))));
    st.bag = arr(st.bag).filter((x) => x != null).map(Number);
    st.called = arr(st.called).filter((x) => x != null).map(Number);
    st.prizes = arr(st.prizes)
      .filter(Boolean)
      .map((p) => Object.assign({ status: 'open', firstAt: 0, ball: 0 }, p, { winners: arr(p.winners).filter(Boolean) }));
    st.blocked = arr(st.blocked).filter(Boolean);
    st.warned = arr(st.warned).filter((x) => x != null).map(Number);
    st.lastClaim = st.lastClaim && typeof st.lastClaim === 'object' ? st.lastClaim : {};
    st.botPlan = arr(st.botPlan).filter(Boolean);
    st.log = arr(st.log).filter(Boolean);
    st.over = !!st.over;
    st.results = st.results ? { pot: Number(st.results.pot) || 0, win: arr(st.results.win).map((x) => Number(x) || 0), net: arr(st.results.net).map((x) => Number(x) || 0), points: !!st.results.points } : null;
    if (st.results) {
      while (st.results.win.length < st.seats.length) st.results.win.push(0);
      while (st.results.net.length < st.seats.length) st.results.net.push(0);
    }
    ['paceMs', 'price', 'mask', 'nextAt', 'now', 'seq'].forEach((k) => (st[k] = Number(st[k]) || 0));
    return st;
  }

  function hydratePublic(raw) {
    const v = raw || {};
    v.called = arr(v.called).filter((x) => x != null).map(Number);
    v.prizes = arr(v.prizes)
      .filter(Boolean)
      .map((p) => Object.assign({}, p, { winners: arr(p.winners).filter(Boolean) }));
    v.log = arr(v.log).filter(Boolean);
    v.over = !!v.over;
    return v;
  }

  // ---------------------------------------------------------------- calls + Caller mode

  /** Traditional 90-ball calls (English). Numbers without a well-known call read as digits. */
  const CALLS = {
    1: 'Kelly’s eye', 2: 'One little duck', 3: 'Cup of tea', 4: 'Knock at the door', 5: 'Man alive', 6: 'Half a dozen', 7: 'Lucky seven', 8: 'Garden gate', 9: 'Doctor’s orders',
    10: 'Cock and hen', 11: 'Legs eleven', 12: 'One dozen', 13: 'Unlucky for some', 14: 'Valentine’s Day', 15: 'Young and keen', 16: 'Sweet sixteen', 17: 'Dancing queen', 18: 'Coming of age', 19: 'Goodbye teens',
    20: 'One score', 21: 'Key of the door', 22: 'Two little ducks', 23: 'Thee and me', 24: 'Two dozen', 25: 'Duck and dive', 26: 'Pick and mix', 27: 'Gateway to heaven', 28: 'Duck and its mate', 29: 'Rise and shine',
    30: 'Flirty thirty', 31: 'Get up and run', 32: 'Buckle my shoe', 33: 'All the threes', 34: 'Ask for more', 35: 'Jump and jive', 36: 'Three dozen', 38: 'Christmas cake', 39: 'Thirty-nine steps',
    40: 'Naughty forty', 41: 'Time for fun', 42: 'Winnie the Pooh', 43: 'Down on your knees', 44: 'All the fours', 45: 'Halfway there', 46: 'Up to tricks', 48: 'Four dozen',
    50: 'Half a century', 51: 'Tweak of the thumb', 52: 'Deck of cards', 53: 'Stuck in the tree', 54: 'Clean the floor', 55: 'Snakes alive', 57: 'Heinz varieties', 58: 'Make them wait', 59: 'Brighton line',
    60: 'Five dozen', 61: 'Baker’s bun', 62: 'Tickety-boo', 63: 'Tickle me', 65: 'Stop work', 66: 'Clickety click', 67: 'Made in heaven', 68: 'Saving grace', 69: 'Either way up',
    70: 'Three score and ten', 71: 'Bang on the drum', 72: 'Six dozen', 73: 'Queen bee', 74: 'Candy store', 75: 'Strive and strive', 76: 'Trombones', 77: 'Sunset strip', 78: 'Heaven’s gate', 79: 'One more time',
    80: 'Eight and blank', 81: 'Stop and run', 82: 'Straight on through', 83: 'Time for tea', 84: 'Seven dozen', 85: 'Staying alive', 86: 'Between the sticks', 88: 'Two snowmen', 89: 'Nearly there', 90: 'Top of the shop',
  };

  /** What the caller says. 75-ball adds the column letter ("B 12"). */
  function callText(n, variant, traditional) {
    if (variant === '75') return letter75(n) + ' ' + n;
    if (!traditional) return String(n);
    if (CALLS[n]) return CALLS[n] + ', ' + n;
    if (n < 10) return 'On its own, number ' + n;
    const d = String(n);
    return d[0] + ' and ' + d[1] + ', ' + n;
  }

  /** Printed-ticket code: seed (base 36) + sheet + ticket, e.g. "K3F9Q-4.2". */
  function ticketCode(seed, sheet, t) {
    return (seed >>> 0).toString(36).toUpperCase() + '-' + (sheet + 1) + '.' + (t + 1);
  }
  function parseCode(code) {
    const m = /^([0-9A-Z]{1,8})-(\d{1,3})\.(\d)$/.exec(String(code || '').trim().toUpperCase());
    if (!m) return null;
    const seed = parseInt(m[1], 36) >>> 0;
    const sheet = Number(m[2]) - 1;
    const t = Number(m[3]) - 1;
    if (sheet < 0 || t < 0 || t > 5) return null;
    return { seed, sheet, t };
  }
  /** Sheet k of a printed batch (Caller mode): six 90-ball tickets or six 75-ball cards. */
  function printedSheet(variant, seed, sheet) {
    const R = seeded((seed >>> 0) + sheet * 7919);
    return variant === '75' ? Array.from({ length: 6 }, () => card75(R)) : strip90(R);
  }
  function ticketFromCode(variant, code) {
    const c = parseCode(code);
    if (!c) return null;
    return printedSheet(variant, c.seed, c.sheet)[c.t] || null;
  }

  /** "Check a ticket" by numbers: which of the entered numbers haven't been called. */
  function checkNumbers(nums, called) {
    const got = new Set(arr(called).map(Number));
    const list = arr(nums)
      .map((n) => Math.floor(Number(n)))
      .filter((n, i, a) => n > 0 && a.indexOf(n) === i);
    const missing = list.filter((n) => !got.has(n));
    return { numbers: list, missing, ok: list.length > 0 && !missing.length };
  }

  /** "Check a ticket" by code: every prize, complete or not, with the call it completed on. */
  function checkTicket(variant, g, called, prizes, mask) {
    const keys = arr(prizes).length ? arr(prizes) : DEFAULT_PRIZES[variant];
    return keys.map((k) => ({ key: k, label: (prizeInfo(variant, k) || { label: k }).label, at: completedAt(variant, k, g, called, mask) }));
  }

  // ---------------------------------------------------------------- bots (practice + filler seats)

  const BOT_NAMES = ['Ava', 'Leo', 'Mia', 'Kai', 'Zoe', 'Sam', 'Ivy', 'Max', 'Noa', 'Eli', 'Ria', 'Ben', 'Lia', 'Tom', 'Uma', 'Jay', 'Ana', 'Raf', 'Isa', 'Dev'];
  const botName = (i) => BOT_NAMES[i % BOT_NAMES.length] + ' · Bot';

  return {
    VARIANTS,
    PACES,
    MODES,
    PRICES,
    TIE_MS,
    CLAIM_GAP_MS,
    MAX_TICKETS,
    PRIZES_90,
    PRIZES_75,
    DEFAULT_PRIZES,
    DEFAULT_SHARES,
    AFTER,
    LETTERS,
    CALLS,
    seeded,
    shuffle,
    pack,
    unpack,
    band90,
    col90,
    strip90,
    ticket90,
    validTicket90,
    rows90,
    nums90,
    band75,
    letter75,
    card75,
    validCard75,
    LINES_75,
    maskCells,
    prizeCells,
    completedAt,
    prizeDone,
    prizeInfo,
    mergeSettings,
    newGame,
    potOf,
    claimable,
    draw,
    claim,
    advance,
    nextEventAt,
    shiftClock,
    computeResults,
    end,
    leave,
    publicView,
    privateView,
    hydrate,
    hydratePublic,
    callText,
    ticketCode,
    parseCode,
    printedSheet,
    ticketFromCode,
    checkNumbers,
    checkTicket,
    botName,
  };
});
