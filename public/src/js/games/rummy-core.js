/**
 * Dangal P8 — Rummy rules core (UMD). One module for the phone (practice vs bots, coach, helpers)
 * and the server (server-lib/rummy-engine.js): cards, the declaration validator, the optimal
 * grouping solver, 13-card Rummy (Points / Pool 101·201 / Deals) and Gin Rummy, deterministic
 * bots and the post-hand coach. Pure functions over plain JSON state; randomness is injected.
 *
 * 13-card rulings (Indian Rummy):
 *  - 2 players: 1 deck + 1 printed joker. 3–6 players: 2 decks + 2 printed jokers.
 *  - One card is cut for the wild joker rank (every card of that rank is wild). A printed joker cut
 *    makes Aces wild. The cut card stays face up beside the deck, out of play.
 *  - Draw from the closed deck or the open pile, then discard. Jokers can't be picked from the open
 *    pile, except the very first open card. The card you just picked from the open pile can't be
 *    thrown straight back.
 *  - Valid declaration: all 13 cards in groups of 3+, at least two sequences, at least one pure.
 *    Sequences: 3+ consecutive cards of one suit, Ace low (A-2-3) or high (Q-K-A), never K-A-2.
 *    A wild card in its natural place keeps a sequence pure. Sets: 3–4 cards of one rank, all
 *    different suits (jokers may fill).
 *  - Points: A/K/Q/J/10 = 10, number cards face value, jokers 0; capped at 80. No pure sequence →
 *    every card counts; a pure sequence but no second sequence → everything except pure sequences.
 *  - Drop (your turn, before drawing): first drop 20, middle drop 40 (Pool 201: 25 / 50). No drop
 *    in Deals. Wrong declaration: 80, and you're out of the deal. Leaving mid-deal: 80.
 *  - Pool 101/201: points add up; reaching the limit eliminates. One rejoin while the highest
 *    remaining score is ≤ 79 (101) / ≤ 174 (201), at that score + 1. Last player standing wins.
 *  - Deals (2/3/6): everyone starts with 80 × deals chips; each deal's winner takes the losers'
 *    points. Most chips after the last deal wins; a tie plays one more deal between the tied.
 *
 * Gin rulings: 2 players, 10 cards, one deck. Upcard offer (non-dealer, then dealer). Knock at
 * deadwood ≤ the knock limit (10 by default); Gin = 0 deadwood (+25, no lay-offs). The defender
 * lays off onto the knocker's melds. Undercut (defender ≤ knocker) scores the difference + 25.
 * Aces are low (A = 1, face cards 10). Stock down to 2 cards → the hand is a draw. First to the
 * target (100) wins; Classic scoring adds 100 game bonus + 25 per hand won, doubled on a shutout.
 * Optional Big Gin: all 11 cards melded after drawing, +31.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RummyCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RANKS = 'A23456789TJQK';
  const SUITS = 'SHDC';
  const SUIT_SYMBOLS = { S: '♠', H: '♥', D: '♦', C: '♣' };
  const SUIT_NAMES = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
  const RANK_NAMES = ['', 'Ace', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King'];
  const RANK_SHORT = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  const MODES = ['13', 'gin'];
  const FORMATS = ['points', 'pool', 'deals'];
  const POOLS = [101, 201];
  const DEALS = [2, 3, 6];
  /** Points rummy: virtual chips per point. */
  const RATES = [0, 1, 2, 5];
  /** Pool / Deals entry fee (winner takes the pot). */
  const FEES = [0, 10, 25, 50, 100];
  /** Gin match stake (winner takes it; rated when two humans play). */
  const STAKES = [0, 10, 25, 50, 100];
  const KNOCKS = [10, 5, 0];
  const TARGETS = [100, 50];
  const LEVELS = ['easy', 'normal', 'expert'];
  const MAX_POINTS = 80;
  const WRONG_SHOW = 80;
  const GIN_BONUS = 25;
  const BIG_GIN_BONUS = 31;
  const UNDERCUT_BONUS = 25;
  const GAME_BONUS = 100;
  const BOX_BONUS = 25;
  const REJOIN_MAX = { 101: 79, 201: 174 };
  const TURN_MS = 30000;
  const GIN_TURN_MS = 25000;
  const BANK_MS = 30000;
  const MELD_MS = 45000;
  const LOG_MAX = 16;

  // ---------------------------------------------------------------- cards

  const isPrinted = (c) => typeof c === 'string' && c.length === 3 && c.charAt(0) === 'J' && c.charAt(1) === 'K';
  const rankOf = (c) => (isPrinted(c) ? 0 : RANKS.indexOf(String(c).charAt(0)) + 1);
  const suitOf = (c) => (isPrinted(c) ? '' : String(c).charAt(1));
  const isJoker = (c, wild) => isPrinted(c) || (!!wild && rankOf(c) === wild);
  const value13 = (c, wild) => {
    if (isJoker(c, wild)) return 0;
    const r = rankOf(c);
    return r === 1 || r >= 10 ? 10 : r;
  };
  const valueGin = (c) => Math.min(10, rankOf(c));

  function isCard(c) {
    if (typeof c !== 'string') return false;
    if (isPrinted(c)) return /^JK[12]$/.test(c);
    return c.length === 3 && RANKS.indexOf(c.charAt(0)) >= 0 && SUITS.indexOf(c.charAt(1)) >= 0 && /[12]/.test(c.charAt(2));
  }

  function cardLabel(c) {
    if (isPrinted(c)) return 'Joker';
    return RANK_SHORT[rankOf(c)] + SUIT_SYMBOLS[suitOf(c)];
  }
  function cardName(c) {
    if (isPrinted(c)) return 'Joker';
    return RANK_NAMES[rankOf(c)] + ' of ' + SUIT_NAMES[suitOf(c)];
  }

  function makeDeck(decks, jokers) {
    const out = [];
    for (let d = 1; d <= decks; d++) for (const s of SUITS) for (const r of RANKS) out.push(r + s + d);
    for (let j = 1; j <= jokers; j++) out.push('JK' + j);
    return out;
  }

  function shuffle(list, rng) {
    const R = typeof rng === 'function' ? rng : Math.random;
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(R() * (i + 1)) % (i + 1);
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function cmpCards(a, b) {
    const pa = isPrinted(a);
    const pb = isPrinted(b);
    if (pa || pb) return pa === pb ? (a < b ? -1 : 1) : pa ? 1 : -1;
    const s = SUITS.indexOf(suitOf(a)) - SUITS.indexOf(suitOf(b));
    if (s) return s;
    const r = rankOf(a) - rankOf(b);
    return r || (a < b ? -1 : a > b ? 1 : 0);
  }

  /** Display sort: suits together, low to high, jokers (printed and wild) at the end. */
  function sortHand(cards, wild) {
    return (cards || []).slice().sort((a, b) => {
      const ja = isJoker(a, wild);
      const jb = isJoker(b, wild);
      if (ja !== jb) return ja ? 1 : -1;
      return cmpCards(a, b);
    });
  }

  function removeCard(list, card) {
    const i = list.indexOf(card);
    if (i < 0) return false;
    list.splice(i, 1);
    return true;
  }

  function sameMultiset(a, b) {
    if (a.length !== b.length) return false;
    const x = a.slice().sort();
    const y = b.slice().sort();
    return x.every((c, i) => c === y[i]);
  }

  // ---------------------------------------------------------------- groups

  /** Does a run of `n` cards containing these distinct natural ranks fit in one window? */
  function runFits(ranks, n, gin) {
    const fit = (rs, lo0, hi0) => {
      const mn = Math.min.apply(null, rs);
      const mx = Math.max.apply(null, rs);
      return Math.max(lo0, mx - n + 1) <= Math.min(mn, hi0 - n + 1);
    };
    if (n > 13) return false;
    if (fit(ranks, 1, 13)) return true;
    if (gin || ranks.indexOf(1) < 0) return false;
    return fit(ranks.map((r) => (r === 1 ? 14 : r)), 2, 14);
  }

  /**
   * 'pure' | 'impure' | 'set' | 'invalid'. Gin has no jokers: runs are 'pure', Ace low only.
   * @param {string[]} cards
   * @param {number} wild wild rank (1–13) or 0
   * @param {boolean} [gin]
   */
  function classify(cards, wild, gin) {
    const list = (cards || []).filter(Boolean);
    const n = list.length;
    if (n < 3) return 'invalid';
    const w = gin ? 0 : wild || 0;
    if (list.every((c) => !isPrinted(c))) {
      const s = suitOf(list[0]);
      const rs = list.map(rankOf);
      if (list.every((c) => suitOf(c) === s) && new Set(rs).size === n && runFits(rs, n, gin)) return 'pure';
    }
    if (gin) {
      const r = rankOf(list[0]);
      if (n <= 4 && list.every((c) => rankOf(c) === r) && new Set(list.map(suitOf)).size === n) return 'set';
      return 'invalid';
    }
    const nat = list.filter((c) => !isJoker(c, w));
    if (!nat.length) return n <= 4 ? 'set' : 'impure';
    const s = suitOf(nat[0]);
    const rs = nat.map(rankOf);
    if (nat.every((c) => suitOf(c) === s) && new Set(rs).size === rs.length && runFits(rs, n, false)) return 'impure';
    if (n <= 4 && nat.every((c) => rankOf(c) === rankOf(nat[0])) && new Set(nat.map(suitOf)).size === nat.length) return 'set';
    return 'invalid';
  }

  const GROUP_LABELS = { pure: 'Pure sequence ✓', impure: 'Impure sequence', set: 'Set', invalid: 'Invalid' };
  const GIN_LABELS = { pure: 'Run', impure: 'Run', set: 'Set', invalid: 'Deadwood' };
  function groupLabel(kind, gin) {
    return (gin ? GIN_LABELS : GROUP_LABELS)[kind] || 'Invalid';
  }

  /**
   * Score an arrangement. 13-card: points by the 80-cap rules; Gin: deadwood value.
   * @returns {{ kinds: string[], pure: number, seqs: number, points: number, valid: boolean, missing: string|null }}
   */
  function evaluate(groups, wild, opts) {
    const gin = !!(opts && opts.gin);
    const gs = (groups || []).map((g) => (g || []).filter(Boolean));
    const kinds = gs.map((g) => classify(g, wild, gin));
    const val = gin ? valueGin : (c) => value13(c, wild);
    const sum = (list) => list.reduce((a, c) => a + val(c), 0);
    if (gin) {
      const dead = gs.reduce((a, g, i) => a + (kinds[i] === 'invalid' ? sum(g) : 0), 0);
      return { kinds, pure: 0, seqs: 0, points: dead, valid: dead === 0 && kinds.every((k) => k !== 'invalid'), missing: null };
    }
    const pure = kinds.filter((k) => k === 'pure').length;
    const seqs = pure + kinds.filter((k) => k === 'impure').length;
    let pts;
    if (!pure) pts = gs.reduce((a, g) => a + sum(g), 0);
    else if (seqs < 2) pts = gs.reduce((a, g, i) => a + (kinds[i] === 'pure' ? 0 : sum(g)), 0);
    else pts = gs.reduce((a, g, i) => a + (kinds[i] === 'invalid' ? sum(g) : 0), 0);
    const valid = kinds.every((k) => k !== 'invalid') && pure >= 1 && seqs >= 2;
    return { kinds, pure, seqs, points: valid ? 0 : Math.min(MAX_POINTS, pts), valid, missing: !pure ? 'pure' : seqs < 2 ? 'second' : null };
  }

  /** Declaration check: exactly these 13 cards, every group valid, 2+ sequences with 1+ pure. */
  function checkDeclaration(groups, hand, wild) {
    const flat = [].concat.apply([], (groups || []).map((g) => g || []));
    if (!sameMultiset(flat, hand || [])) return { valid: false, reason: 'cards' };
    const ev = evaluate(groups, wild);
    if (ev.valid) return { valid: true, reason: null, ev };
    const reason = ev.missing === 'pure' ? 'no_pure' : ev.missing === 'second' ? 'no_second' : 'invalid_group';
    return { valid: false, reason, ev };
  }

  // ---------------------------------------------------------------- solver

  /**
   * Best arrangement of a hand: fewest points (13-card) / least deadwood (Gin).
   * `discard: true` also picks the one card to throw (never `keep`). Exhaustive search over melds
   * containing the lowest remaining card, with a node cap for pathological hands.
   * @returns {{ points: number, valid: boolean, groups: string[][], dead: string[], discard: string|null }}
   */
  function solve(cards, opts) {
    const o = opts || {};
    const gin = !!o.gin;
    const wild = gin ? 0 : o.wild || 0;
    const val = gin ? valueGin : (c) => value13(c, wild);
    const CAP = o.cap || 25000;
    const printed = [];
    const wilds = [];
    const plain = [];
    (cards || []).forEach((c) => {
      if (isPrinted(c)) printed.push(c);
      else if (wild && rankOf(c) === wild) wilds.push(c);
      else plain.push(c);
    });
    const k = Math.min(wilds.length, 3);
    let best = null;
    let nodes = 0;
    for (let mask = 0; mask < 1 << k; mask++) {
      const nat = plain.slice();
      const jok = printed.slice();
      wilds.forEach((c, i) => (i < k && (mask >> i) & 1 ? nat : jok).push(c));
      nat.sort(cmpCards);
      search(nat, jok);
      if (best && best.pts === 0 && best.valid) break;
    }
    return finish(best);

    function search(nat, jok) {
      const N = nat.length;
      const used = new Array(N).fill(false);
      const R = nat.map(rankOf);
      const S = nat.map(suitOf);
      const melds = [];
      const dead = [];
      const totalPts = nat.reduce((a, c) => a + val(c), 0);

      function find(suit, rank, taken, self) {
        for (let j = 0; j < N; j++) if (j !== self && !used[j] && S[j] === suit && R[j] === rank && taken.indexOf(j) < 0) return j;
        return -1;
      }

      function options(i, jLeft) {
        const out = [];
        const bySuit = {};
        for (let j = i + 1; j < N; j++) if (!used[j] && R[j] === R[i] && S[j] !== S[i] && bySuit[S[j]] == null) bySuit[S[j]] = j;
        const avail = Object.keys(bySuit).map((s) => bySuit[s]);
        for (let m = 0; m < 1 << avail.length; m++) {
          const pick = avail.filter((_, b) => (m >> b) & 1);
          const base = 1 + pick.length;
          if (base > 4) continue;
          const maxJ = gin ? 0 : Math.min(jLeft, 4 - base);
          for (let jn = 0; jn <= maxJ; jn++) if (base + jn >= 3) out.push({ type: 'set', idx: pick, jokers: jn, pure: false });
        }
        const ps = R[i] === 1 && !gin ? [1, 14] : [R[i]];
        ps.forEach((p) => {
          const loMin = p === 14 ? 2 : 1;
          for (let lo = Math.max(loMin, p - 12); lo <= p; lo++) {
            const hiMax = Math.min(gin || p === 1 ? 13 : 14, lo + 12);
            for (let hi = Math.max(p, lo + 2); hi <= hiMax; hi++) {
              const taken = [];
              const pos = [];
              let jn = 0;
              let ok = true;
              for (let q = lo; q <= hi; q++) {
                if (q === p) {
                  pos.push(i);
                  continue;
                }
                const j = find(S[i], q === 14 ? 1 : q, taken, i);
                if (j >= 0) {
                  taken.push(j);
                  pos.push(j);
                } else {
                  jn += 1;
                  pos.push(-1);
                  if (jn > jLeft || gin) {
                    ok = false;
                    break;
                  }
                }
              }
              if (!ok) break;
              out.push({ type: 'run', idx: taken, jokers: jn, pure: jn === 0, pos });
            }
          }
        });
        out.sort((a, b) => b.idx.length + b.jokers - (a.idx.length + a.jokers) || a.jokers - b.jokers);
        return out;
      }

      function leaf(jLeft, disc) {
        let discJoker = false;
        if (o.discard && disc == null) {
          if (jLeft <= 0) return;
          jLeft -= 1;
          discJoker = true;
        }
        const pure = melds.filter((m) => m.type === 'run' && m.pure).length;
        const seqs = melds.filter((m) => m.type === 'run').length;
        const deadPts = dead.reduce((a, i) => a + val(nat[i]), 0);
        const discPts = disc != null ? val(nat[disc]) : 0;
        let pts;
        if (gin) pts = deadPts;
        else if (!pure) pts = Math.min(MAX_POINTS, totalPts - discPts);
        else if (seqs < 2) {
          const inPure = melds.filter((m) => m.type === 'run' && m.pure).reduce((a, m) => a + val(nat[m.at]) + m.idx.reduce((b, x) => b + val(nat[x]), 0), 0);
          pts = Math.min(MAX_POINTS, totalPts - discPts - inPure);
        } else pts = Math.min(MAX_POINTS, deadPts);
        const valid = gin ? dead.length === 0 : dead.length === 0 && pure >= 1 && seqs >= 2;
        const key = pts * 1000 + (valid ? 0 : 500) + dead.length * 2 - (gin ? 0 : Math.min(pure, 1));
        if (!best || key < best.key) {
          best = {
            key,
            pts,
            valid,
            nat,
            jok,
            melds: melds.map((m) => ({ type: m.type, at: m.at, idx: m.idx.slice(), jokers: m.jokers, pure: m.pure, pos: m.pos ? m.pos.slice() : null })),
            dead: dead.slice(),
            disc,
            discJoker,
          };
        }
      }

      function dfs(start, jLeft, disc) {
        if (best && best.pts === 0 && best.valid) return;
        if (++nodes > CAP && best) return;
        let i = start;
        while (i < N && used[i]) i++;
        if (i >= N) return leaf(jLeft, disc);
        used[i] = true;
        const list = options(i, jLeft);
        for (const m of list) {
          m.at = i;
          m.idx.forEach((x) => (used[x] = true));
          melds.push(m);
          dfs(i + 1, jLeft - m.jokers, disc);
          melds.pop();
          m.idx.forEach((x) => (used[x] = false));
        }
        if (o.discard && disc == null && nat[i] !== o.keep) dfs(i + 1, jLeft, i);
        dead.push(i);
        dfs(i + 1, jLeft, disc);
        dead.pop();
        used[i] = false;
      }

      dfs(0, jok.length, null);
    }

    function finish(b) {
      if (!b) {
        const all = (cards || []).slice();
        const discard = o.discard ? all.filter((c) => c !== o.keep).sort((x, y) => val(y) - val(x))[0] || null : null;
        if (discard) removeCard(all, discard);
        const ev = evaluate([all], wild, { gin });
        return { points: ev.points, valid: false, groups: [], dead: all, discard };
      }
      const jq = b.jok.slice();
      let discard = null;
      if (b.discJoker) discard = jq.pop();
      else if (b.disc != null) discard = b.nat[b.disc];
      const groups = b.melds.map((m) => {
        if (m.type === 'run') return m.pos.map((x) => (x === -1 ? jq.shift() : b.nat[x]));
        const g = [b.nat[m.at]].concat(m.idx.map((x) => b.nat[x]));
        for (let j = 0; j < m.jokers; j++) g.push(jq.shift());
        return g;
      });
      const dead = b.dead.map((i) => b.nat[i]);
      if (jq.length >= 3) groups.push(jq.splice(0));
      while (jq.length) {
        const j = jq.shift();
        const kinds = groups.map((g) => classify(g, wild, gin));
        const pureCount = kinds.filter((x) => x === 'pure').length;
        let at = kinds.findIndex((x, gi) => x === 'impure' || (x === 'set' && groups[gi].length < 4));
        if (at < 0 && pureCount >= 2) at = kinds.indexOf('pure');
        if (at >= 0) groups[at].push(j);
        else dead.push(j);
      }
      return { points: b.pts, valid: b.valid, groups, dead, discard };
    }
  }

  /** Groups for the UI: melds, then the leftover cards as one (invalid) group. */
  function arrange(cards, wild, gin) {
    const sol = solve(cards, { wild, gin });
    const groups = sol.groups.map((g) => g.slice());
    if (sol.dead.length) groups.push(sortHand(sol.dead, wild));
    return groups;
  }

  /** Gin lay-off: defender's deadwood onto the knocker's melds (highest value first, repeated). */
  function layoff(dead, melds) {
    const ms = (melds || []).map((m) => m.slice());
    const rest = (dead || []).slice();
    const laid = [];
    let changed = true;
    while (changed) {
      changed = false;
      rest.sort((a, b) => valueGin(b) - valueGin(a));
      for (const c of rest.slice()) {
        const m = ms.find((g) => classify(g.concat([c]), 0, true) !== 'invalid');
        if (m) {
          m.push(c);
          removeCard(rest, c);
          laid.push(c);
          changed = true;
        }
      }
    }
    return { laid, rest, melds: ms };
  }

  // ---------------------------------------------------------------- settings

  function mergeSettings(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const pick = (list, v, def) => (list.indexOf(Number(v)) >= 0 ? Number(v) : def);
    return {
      mode: MODES.indexOf(String(r.mode)) >= 0 ? String(r.mode) : 'gin',
      format: FORMATS.indexOf(r.format) >= 0 ? r.format : 'points',
      pool: pick(POOLS, r.pool, 101),
      deals: pick(DEALS, r.deals, 2),
      rate: pick(RATES, r.rate, 0),
      fee: pick(FEES, r.fee, 0),
      stake: pick(STAKES, r.stake, 0),
      knock: pick(KNOCKS, r.knock, 10),
      target: pick(TARGETS, r.target, 100),
      scoring: r.scoring === 'classic' ? 'classic' : 'simple',
      bigGin: !!r.bigGin,
    };
  }

  function formatLabel(set) {
    const s = mergeSettings(set);
    if (s.mode === 'gin') return 'Gin Rummy · to ' + s.target;
    if (s.format === 'pool') return 'Pool ' + s.pool;
    if (s.format === 'deals') return 'Deals · best of ' + s.deals;
    return 'Points Rummy';
  }

  /** Does this table move virtual chips? (bots at the table always make it friendly) */
  function chipAmount(set) {
    const s = mergeSettings(set);
    if (s.mode === 'gin') return s.stake;
    return s.format === 'points' ? s.rate : s.fee;
  }

  function dropCost(st, first) {
    if (st.format === 'pool' && st.set.pool === 201) return first ? 25 : 50;
    return first ? 20 : 40;
  }

  // ---------------------------------------------------------------- state

  function E(code) {
    return { error: code };
  }
  function log(st, seat, msg) {
    st.seq = (Number(st.seq) || 0) + 1;
    st.log.push({ no: st.seq, seat, msg });
    if (st.log.length > LOG_MAX) st.log.splice(0, st.log.length - LOG_MAX);
  }
  const nameOf = (st, i) => (st.seats[i] ? st.seats[i].name : 'Player');

  /**
   * @param {{id:string,name:string,bot?:boolean,level?:string}[]} players seat order
   * @param {object} settings mergeSettings shape
   * @param {() => number} rng
   */
  function newMatch(players, settings, rng) {
    const set = mergeSettings(settings);
    const R = typeof rng === 'function' ? rng : Math.random;
    const n = (players || []).length;
    if (set.mode === 'gin' ? n !== 2 : n < 2 || n > 6) return E('players');
    const start = set.mode !== 'gin' && set.format === 'deals' ? MAX_POINTS * set.deals : 0;
    const st = {
      v: 1,
      mode: set.mode,
      format: set.mode === 'gin' ? 'gin' : set.format,
      set: { pool: set.pool, deals: set.deals, knock: set.knock, target: set.target, scoring: set.scoring, bigGin: set.bigGin },
      seats: players.map((p) => ({
        id: String(p.id),
        name: String(p.name || 'Player').slice(0, 40),
        bot: !!p.bot,
        level: p.bot ? (LEVELS.indexOf(p.level) >= 0 ? p.level : 'normal') : null,
        score: start,
        out: false,
        left: false,
        entries: 1,
        wins: 0,
        afk: 0,
      })),
      dealNo: 0,
      dealer: Math.floor(R() * n) % n,
      over: false,
      winner: -1,
      ranking: [],
      tiebreak: null,
      final: null,
      seq: 0,
      log: [],
      deal: null,
    };
    // newDeal moves the button first, so start one seat back.
    st.dealer = (st.dealer + n - 1) % n;
    newDeal(st, R);
    return st;
  }

  function inPlay(st, i) {
    const s = st.seats[i];
    if (!s || s.out || s.left) return false;
    return !st.tiebreak || st.tiebreak.indexOf(i) >= 0;
  }

  function nextSeat(st, from, ok) {
    const n = st.seats.length;
    for (let k = 1; k <= n; k++) {
      const i = (from + k) % n;
      if (ok(i)) return i;
    }
    return -1;
  }

  function newDeal(st, rng) {
    const R = typeof rng === 'function' ? rng : Math.random;
    st.dealNo += 1;
    st.dealer = nextSeat(st, st.dealer, (i) => inPlay(st, i));
    return st.mode === 'gin' ? dealGin(st, R) : deal13(st, R);
  }

  function deal13(st, R) {
    const n = st.seats.length;
    const playing = st.seats.map((_, i) => inPlay(st, i));
    const count = playing.filter(Boolean).length;
    const decks = count <= 2 ? 1 : 2;
    const deck = shuffle(makeDeck(decks, decks), R);
    const hands = st.seats.map(() => []);
    for (let r = 0; r < 13; r++) {
      let i = st.dealer;
      for (let k = 0; k < n; k++) {
        i = (i + 1) % n;
        if (playing[i]) hands[i].push(deck.pop());
      }
    }
    const cut = deck.pop();
    const wildRank = isPrinted(cut) ? 1 : rankOf(cut);
    const first = deck.pop();
    st.deal = {
      no: st.dealNo,
      decks,
      wildCard: cut,
      wildRank,
      closed: deck,
      open: [first],
      firstOpen: true,
      hands,
      turn: nextSeat(st, st.dealer, (i) => playing[i]),
      phase: 'draw',
      drawnFrom: null,
      drawnCard: null,
      active: playing,
      turns: st.seats.map(() => 0),
      results: st.seats.map(() => null),
      picks: st.seats.map(() => []),
      discards: st.seats.map(() => []),
      declarer: -1,
      finish: null,
      winner: -1,
    };
    log(st, -1, 'Deal ' + st.dealNo + ' · wild joker: ' + (isPrinted(cut) ? 'Aces (a printed joker was cut)' : RANK_NAMES[wildRank] + 's'));
    return st;
  }

  function dealGin(st, R) {
    const deck = shuffle(makeDeck(1, 0), R);
    const hands = [[], []];
    for (let r = 0; r < 10; r++) {
      hands[1 - st.dealer].push(deck.pop());
      hands[st.dealer].push(deck.pop());
    }
    const up = deck.pop();
    st.deal = {
      no: st.dealNo,
      closed: deck,
      open: [up],
      hands,
      turn: 1 - st.dealer,
      phase: 'upcard',
      upPass: 0,
      stockOnly: false,
      drawnFrom: null,
      drawnCard: null,
      turns: [0, 0],
      picks: [[], []],
      discards: [[], []],
      result: null,
    };
    log(st, -1, 'Hand ' + st.dealNo + ' · ' + nameOf(st, 1 - st.dealer) + ' may take the upcard');
    return st;
  }

  const activeSeats = (st) => (st.deal && st.deal.active ? st.deal.active.map((a, i) => (a ? i : -1)).filter((i) => i >= 0) : []);

  // ---------------------------------------------------------------- 13-card actions

  function reshuffle(d, R) {
    if (d.closed.length || d.open.length < 2) return;
    const top = d.open.pop();
    d.closed = shuffle(d.open, R);
    d.open = [top];
  }

  function advance13(st) {
    const d = st.deal;
    d.turn = nextSeat(st, d.turn, (i) => d.active[i]);
    d.phase = 'draw';
    d.drawnFrom = null;
    d.drawnCard = null;
  }

  function soleWinner(st) {
    const d = st.deal;
    const left = activeSeats(st);
    if (left.length !== 1) return false;
    const w = left[0];
    d.results[w] = { points: 0, kind: 'win', groups: null };
    d.declarer = w;
    log(st, w, nameOf(st, w) + ' wins the deal — everyone else is out');
    finishDeal(st);
    return true;
  }

  function apply13(st, seat, a, R) {
    const d = st.deal;
    const t = a.type;
    if (t === 'meld' || t === 'auto_meld') {
      if (d.phase !== 'meld') return E('phase');
      if (!d.active[seat] || seat === d.declarer || d.results[seat]) return E('done');
      const hand = d.hands[seat];
      let groups = t === 'auto_meld' ? arrange(hand, d.wildRank) : normGroups(a.groups);
      if (!groups) return E('bad_groups');
      const flat = [].concat.apply([], groups);
      if (!sameMultiset(flat, hand)) return E('bad_groups');
      const ev = evaluate(groups, d.wildRank);
      d.results[seat] = { points: ev.valid ? 0 : ev.points, kind: t === 'auto_meld' ? 'auto' : 'meld', groups };
      if (activeSeats(st).every((i) => d.results[i])) finishDeal(st);
      return { ok: true, points: d.results[seat].points };
    }
    if (d.phase === 'meld' || d.phase === 'done') return E('phase');
    if (t === 'forfeit') return leave13(st, seat, a.reason || 'left');
    if (seat !== d.turn) return E('not_your_turn');
    if (t === 'draw') {
      if (d.phase !== 'draw') return E('phase');
      let card;
      if (a.from === 'open') {
        const top = d.open[d.open.length - 1];
        if (!top) return E('empty');
        if (isJoker(top, d.wildRank) && !d.firstOpen) return E('joker_pick');
        card = d.open.pop();
        d.picks[seat].push(card);
        d.firstOpen = false;
        log(st, seat, nameOf(st, seat) + ' picked ' + cardLabel(card));
      } else {
        reshuffle(d, R);
        if (!d.closed.length) return E('empty');
        card = d.closed.pop();
        log(st, seat, nameOf(st, seat) + ' drew from the deck');
      }
      d.hands[seat].push(card);
      d.drawnFrom = a.from === 'open' ? 'open' : 'closed';
      d.drawnCard = card;
      d.phase = 'discard';
      return { ok: true, card };
    }
    if (t === 'drop') {
      if (d.phase !== 'draw') return E('phase');
      if (st.format === 'deals') return E('no_drop');
      const first = d.turns[seat] === 0;
      const pts = dropCost(st, first);
      d.results[seat] = { points: pts, kind: first ? 'first_drop' : 'middle_drop', groups: null };
      d.active[seat] = false;
      log(st, seat, nameOf(st, seat) + ' dropped (' + pts + ')');
      if (!soleWinner(st)) advance13(st);
      return { ok: true };
    }
    if (t === 'discard' || t === 'declare') {
      if (d.phase !== 'discard') return E('phase');
      const hand = d.hands[seat];
      const card = String(a.card || '');
      if (hand.indexOf(card) < 0) return E('no_card');
      if (d.drawnFrom === 'open' && card === d.drawnCard && hand.filter((c) => c === card).length < 2) return E('same_card');
      if (t === 'discard') {
        removeCard(hand, card);
        d.open.push(card);
        d.discards[seat].push(card);
        d.firstOpen = false;
        d.turns[seat] += 1;
        log(st, seat, nameOf(st, seat) + ' threw ' + cardLabel(card));
        advance13(st);
        return { ok: true };
      }
      const groups = normGroups(a.groups);
      if (!groups) return E('bad_groups');
      const rest = hand.slice();
      removeCard(rest, card);
      const check = checkDeclaration(groups, rest, d.wildRank);
      if (check.reason === 'cards') return E('bad_groups');
      d.turns[seat] += 1;
      if (check.valid) {
        d.hands[seat] = rest;
        d.finish = card;
        d.declarer = seat;
        d.results[seat] = { points: 0, kind: 'win', groups };
        d.phase = 'meld';
        log(st, seat, nameOf(st, seat) + ' declared! Show your groups');
        if (activeSeats(st).every((i) => d.results[i])) finishDeal(st);
        return { ok: true, valid: true };
      }
      d.hands[seat] = rest;
      d.open.push(card);
      d.firstOpen = false;
      d.results[seat] = { points: WRONG_SHOW, kind: 'wrong', groups, reason: check.reason };
      d.active[seat] = false;
      log(st, seat, nameOf(st, seat) + ' made a wrong declaration (' + WRONG_SHOW + ')');
      if (!soleWinner(st)) advance13(st);
      return { ok: true, valid: false, reason: check.reason };
    }
    return E('bad_action');
  }

  function leave13(st, seat, reason) {
    const d = st.deal;
    const s = st.seats[seat];
    if (!s) return E('bad_seat');
    if (reason === 'left') s.left = true;
    if (!d.active[seat] || d.phase === 'done') {
      if (reason === 'left' && st.format !== 'points') checkMatchOver(st);
      return { ok: true };
    }
    const wasTurn = d.turn === seat;
    d.results[seat] = { points: MAX_POINTS, kind: reason === 'left' ? 'left' : 'timeout', groups: null };
    d.active[seat] = false;
    log(st, seat, nameOf(st, seat) + (reason === 'left' ? ' left the table (80)' : ' timed out (80)'));
    if (d.phase === 'meld') {
      if (activeSeats(st).every((i) => d.results[i])) finishDeal(st);
      return { ok: true };
    }
    if (!soleWinner(st) && wasTurn) {
      if (d.phase === 'discard' && d.drawnCard) {
        // Their drawn card goes back to where it came from so the next player sees a fair pile.
        removeCard(d.hands[seat], d.drawnCard);
        if (d.drawnFrom === 'open') d.open.push(d.drawnCard);
        else d.closed.push(d.drawnCard);
      }
      advance13(st);
    }
    return { ok: true };
  }

  function normGroups(raw) {
    if (!Array.isArray(raw) || raw.length > 13) return null;
    const out = [];
    for (const g of raw) {
      if (!Array.isArray(g)) return null;
      const list = g.map(String).filter((c) => c);
      if (list.length > 13 || !list.every(isCard)) return null;
      if (list.length) out.push(list);
    }
    return out;
  }

  function finishDeal(st) {
    const d = st.deal;
    d.phase = 'done';
    const w = d.declarer >= 0 ? d.declarer : activeSeats(st)[0];
    d.winner = w;
    const pts = st.seats.map((_, i) => (d.results[i] ? Number(d.results[i].points) || 0 : null));
    if (w >= 0) st.seats[w].wins += 1;
    if (st.format === 'points') {
      st.seats.forEach((s, i) => {
        if (pts[i] != null) s.score = pts[i];
      });
      st.over = true;
      st.winner = w;
      st.ranking = rankSeats(st, (i) => (i === w ? -1 : pts[i] == null ? 999 : pts[i]));
      log(st, w, nameOf(st, w) + ' wins the deal');
      return;
    }
    if (st.format === 'pool') {
      const limit = st.set.pool;
      st.seats.forEach((s, i) => {
        if (pts[i] == null) return;
        s.score += pts[i];
        if (!s.out && s.score >= limit) {
          s.out = true;
          s.outAt = st.dealNo;
          log(st, i, nameOf(st, i) + ' is out at ' + s.score);
        }
      });
      checkMatchOver(st);
      return;
    }
    // deals
    let pot = 0;
    st.seats.forEach((s, i) => {
      if (pts[i] == null || i === w) return;
      s.score -= pts[i];
      pot += pts[i];
    });
    if (w >= 0) st.seats[w].score += pot;
    log(st, w, nameOf(st, w) + ' wins the deal (+' + pot + ')');
    const played = st.dealNo;
    if (played >= st.set.deals) {
      const contenders = st.seats.map((s, i) => i).filter((i) => !st.seats[i].left);
      const top = Math.max.apply(null, contenders.map((i) => st.seats[i].score));
      const tied = contenders.filter((i) => st.seats[i].score === top);
      if (tied.length === 1 || !contenders.length) {
        st.over = true;
        st.winner = tied[0];
        st.tiebreak = null;
        st.ranking = rankSeats(st, (i) => -st.seats[i].score);
      } else {
        st.tiebreak = tied;
        log(st, -1, 'Tied on ' + top + ' — one more deal between ' + tied.map((i) => nameOf(st, i)).join(' and '));
      }
    }
  }

  function checkMatchOver(st) {
    if (st.over) return;
    if (st.format === 'pool') {
      const alive = st.seats.map((s, i) => i).filter((i) => !st.seats[i].out && !st.seats[i].left);
      if (alive.length <= 1) {
        st.over = true;
        st.winner = alive.length ? alive[0] : st.deal && st.deal.winner >= 0 ? st.deal.winner : -1;
        st.ranking = rankSeats(st, (i) => (i === st.winner ? -1e9 : st.seats[i].left ? 1e9 : -(Number(st.seats[i].outAt) || 0) * 1000 + st.seats[i].score));
        if (st.winner >= 0) log(st, st.winner, nameOf(st, st.winner) + ' wins the pool');
      }
      return;
    }
    if (st.format === 'deals') {
      const alive = st.seats.map((s, i) => i).filter((i) => !st.seats[i].left);
      if (alive.length <= 1) {
        st.over = true;
        st.winner = alive.length ? alive[0] : -1;
        st.ranking = rankSeats(st, (i) => (i === st.winner ? -1e9 : -st.seats[i].score));
      }
    }
    if (st.mode === 'gin') {
      const alive = st.seats.map((s, i) => i).filter((i) => !st.seats[i].left);
      if (alive.length <= 1) {
        st.over = true;
        st.winner = alive.length ? alive[0] : -1;
        st.ranking = alive.concat(st.seats.map((s, i) => i).filter((i) => alive.indexOf(i) < 0));
        st.final = { forfeit: true };
      }
    }
  }

  function rankSeats(st, key) {
    return st.seats
      .map((s, i) => i)
      .sort((a, b) => key(a) - key(b) || a - b);
  }

  /** Pool: may this eliminated seat buy back in before the next deal? */
  function canRejoin(st, seat) {
    if (st.format !== 'pool' || st.over) return false;
    const s = st.seats[seat];
    if (!s || !s.out || s.left || s.entries >= 2) return false;
    const alive = st.seats.filter((x) => !x.out && !x.left);
    if (alive.length < 2) return false;
    const top = Math.max.apply(null, alive.map((x) => x.score));
    return top <= REJOIN_MAX[st.set.pool];
  }

  function rejoin(st, seat) {
    if (!canRejoin(st, seat)) return E('no_rejoin');
    if (st.deal && st.deal.phase !== 'done') return E('phase');
    const alive = st.seats.filter((x) => !x.out && !x.left);
    const top = Math.max.apply(null, alive.map((x) => x.score));
    const s = st.seats[seat];
    s.out = false;
    s.score = top + 1;
    s.entries += 1;
    delete s.outAt;
    log(st, seat, nameOf(st, seat) + ' rejoined at ' + s.score);
    return { ok: true };
  }

  // ---------------------------------------------------------------- Gin actions

  function applyGin(st, seat, a, R) {
    const d = st.deal;
    const t = a.type;
    if (d.phase === 'done') return E('phase');
    if (t === 'forfeit') {
      st.seats[seat].left = a.reason === 'left';
      st.over = true;
      st.winner = 1 - seat;
      st.ranking = [1 - seat, seat];
      st.final = { forfeit: true, reason: a.reason || 'resign' };
      log(st, seat, nameOf(st, seat) + (a.reason === 'left' ? ' left' : a.reason === 'afk' ? ' timed out' : ' resigned') + ' — ' + nameOf(st, 1 - seat) + ' wins');
      return { ok: true };
    }
    if (seat !== d.turn) return E('not_your_turn');
    if (t === 'pass') {
      if (d.phase !== 'upcard') return E('phase');
      d.upPass += 1;
      log(st, seat, nameOf(st, seat) + ' passed the upcard');
      if (d.upPass >= 2) {
        d.turn = 1 - st.dealer;
        d.phase = 'draw';
        d.stockOnly = true;
      } else d.turn = 1 - seat;
      return { ok: true };
    }
    if (t === 'draw') {
      if (d.phase !== 'draw' && d.phase !== 'upcard') return E('phase');
      let card;
      if (a.from === 'open') {
        if (d.stockOnly) return E('stock_only');
        if (!d.open.length) return E('empty');
        card = d.open.pop();
        d.picks[seat].push(card);
        log(st, seat, nameOf(st, seat) + ' took ' + cardLabel(card));
      } else {
        if (d.phase === 'upcard') return E('phase');
        if (!d.closed.length) return E('empty');
        card = d.closed.pop();
        log(st, seat, nameOf(st, seat) + ' drew from the stock');
      }
      d.hands[seat].push(card);
      d.drawnFrom = a.from === 'open' ? 'open' : 'closed';
      d.drawnCard = card;
      d.phase = 'discard';
      d.stockOnly = false;
      return { ok: true, card };
    }
    if (d.phase !== 'discard') return E('phase');
    const hand = d.hands[seat];
    if (t === 'biggin') {
      if (!st.set.bigGin) return E('no_biggin');
      const sol = solve(hand, { gin: true });
      if (sol.points !== 0) return E('cant_knock');
      d.turns[seat] += 1;
      scoreKnock(st, seat, sol, 'biggin');
      return { ok: true };
    }
    const card = String(a.card || '');
    if (hand.indexOf(card) < 0) return E('no_card');
    if (d.drawnFrom === 'open' && card === d.drawnCard) return E('same_card');
    if (t === 'discard') {
      removeCard(hand, card);
      d.open.push(card);
      d.discards[seat].push(card);
      d.turns[seat] += 1;
      log(st, seat, nameOf(st, seat) + ' threw ' + cardLabel(card));
      if (d.closed.length <= 2) {
        d.result = { kind: 'draw', winner: -1, pts: 0 };
        d.phase = 'done';
        log(st, -1, 'Stock is down to two cards — this hand is a draw');
        return { ok: true };
      }
      d.turn = 1 - seat;
      d.phase = 'draw';
      d.drawnFrom = null;
      d.drawnCard = null;
      return { ok: true };
    }
    if (t === 'knock') {
      const rest = hand.slice();
      removeCard(rest, card);
      const sol = solve(rest, { gin: true });
      if (sol.points > st.set.knock && sol.points > 0) return E('cant_knock');
      d.hands[seat] = rest;
      d.open.push(card);
      d.turns[seat] += 1;
      scoreKnock(st, seat, sol, sol.points === 0 ? 'gin' : 'knock');
      return { ok: true };
    }
    return E('bad_action');
  }

  function scoreKnock(st, k, ks, kind) {
    const d = st.deal;
    const o = 1 - k;
    const os = solve(d.hands[o], { gin: true });
    let oDead = os.dead.slice();
    let laid = [];
    let kMelds = ks.groups.map((g) => g.slice());
    if (kind === 'knock') {
      const lo = layoff(oDead, kMelds);
      laid = lo.laid;
      oDead = lo.rest;
      kMelds = lo.melds;
    }
    const oPts = oDead.reduce((a, c) => a + valueGin(c), 0);
    let winner;
    let pts;
    let res = kind;
    if (kind === 'biggin') {
      winner = k;
      pts = BIG_GIN_BONUS + oPts;
    } else if (kind === 'gin') {
      winner = k;
      pts = GIN_BONUS + oPts;
    } else if (ks.points < oPts) {
      winner = k;
      pts = oPts - ks.points;
    } else {
      winner = o;
      pts = ks.points - oPts + UNDERCUT_BONUS;
      res = 'undercut';
    }
    st.seats[winner].score += pts;
    st.seats[winner].wins += 1;
    d.result = {
      kind: res,
      by: k,
      winner,
      pts,
      knocker: { groups: kMelds, dead: ks.dead, points: ks.points },
      defender: { groups: os.groups, dead: oDead, laid, points: oPts },
    };
    d.phase = 'done';
    const how = { gin: 'went Gin', biggin: 'went Big Gin', knock: 'knocked', undercut: 'was undercut' }[res];
    log(st, k, nameOf(st, k) + ' ' + how + ' · ' + nameOf(st, winner) + ' +' + pts);
    if (st.seats[winner].score >= st.set.target) endGin(st, winner);
  }

  function endGin(st, w) {
    const l = 1 - w;
    const totals = st.seats.map((s) => s.score);
    if (st.set.scoring === 'classic') {
      totals[w] += GAME_BONUS;
      totals[0] += st.seats[0].wins * BOX_BONUS;
      totals[1] += st.seats[1].wins * BOX_BONUS;
      if (st.seats[l].score === 0) totals[w] *= 2;
    }
    st.final = { totals, margin: totals[w] - totals[l], shutout: st.seats[l].score === 0 };
    st.over = true;
    st.winner = w;
    st.ranking = [w, l];
    log(st, w, nameOf(st, w) + ' wins the game ' + totals[w] + '–' + totals[l]);
  }

  // ---------------------------------------------------------------- entry points

  /**
   * Validate and apply one action. Types: draw {from}, discard {card}, declare {card, groups},
   * drop, meld {groups}, auto_meld, pass (Gin upcard), knock {card}, biggin, forfeit {reason}.
   */
  function apply(st, seat, action, ctx) {
    if (!st || !st.deal) return E('no_deal');
    if (st.over) return E('over');
    const a = action || {};
    const R = ctx && typeof ctx.rng === 'function' ? ctx.rng : Math.random;
    if (!st.seats[seat]) return E('bad_seat');
    const out = st.mode === 'gin' ? applyGin(st, seat, a, R) : apply13(st, seat, a, R);
    if (!out.error && ['draw', 'discard', 'declare', 'meld', 'knock', 'pass', 'biggin', 'drop'].indexOf(a.type) >= 0 && !a.auto) st.seats[seat].afk = 0;
    return out;
  }

  /** Next deal (Pool / Deals / Gin hands) once the current one is done. */
  function nextDeal(st, rng) {
    if (st.over || !st.deal || st.deal.phase !== 'done') return E('phase');
    newDeal(st, rng);
    return { ok: true };
  }

  /** Who must act now (-1 = nobody / several in the meld phase). */
  function actor(st) {
    if (!st || st.over || !st.deal) return -1;
    const d = st.deal;
    if (d.phase === 'done' || d.phase === 'meld') return -1;
    return d.turn;
  }

  /** Seats still owing a meld after a valid declaration. */
  function meldPending(st) {
    const d = st.deal;
    if (!d || d.phase !== 'meld') return [];
    return activeSeats(st).filter((i) => !d.results[i]);
  }

  /** Timeout / AFK move: draw from the deck and throw the least useful card; auto-group melds. */
  function autoAction(st, seat) {
    const d = st.deal;
    if (st.mode !== 'gin' && d.phase === 'meld') return { type: 'auto_meld', auto: true };
    if (d.phase === 'upcard') return { type: 'pass', auto: true };
    if (d.phase === 'draw') return { type: 'draw', from: 'closed', auto: true };
    if (d.phase === 'discard') {
      const hand = d.hands[seat];
      const keep = d.drawnFrom === 'open' ? d.drawnCard : null;
      const gin = st.mode === 'gin';
      const sol = solve(hand, { wild: gin ? 0 : d.wildRank, gin, discard: true, keep });
      const card = sol.discard || hand.find((c) => c !== keep);
      return { type: 'discard', card, auto: true };
    }
    return null;
  }

  function publicView(st) {
    const d = st.deal || {};
    const base = {
      v: st.v,
      mode: st.mode,
      format: st.format,
      set: Object.assign({}, st.set),
      seats: st.seats.map((s) => ({ id: s.id, name: s.name, bot: !!s.bot, level: s.level || null, score: s.score, out: !!s.out, left: !!s.left, entries: s.entries, wins: s.wins, afk: s.afk || 0 })),
      dealNo: st.dealNo,
      dealer: st.dealer,
      over: !!st.over,
      winner: st.winner,
      ranking: (st.ranking || []).slice(),
      tiebreak: st.tiebreak ? st.tiebreak.slice() : null,
      final: st.final || null,
      seq: st.seq,
      log: st.log.slice(-10),
    };
    const done = d.phase === 'done';
    const common = {
      no: d.no,
      turn: d.turn,
      phase: d.phase,
      closed: (d.closed || []).length,
      open: (d.open || []).slice(-12),
      openCount: (d.open || []).length,
      counts: (d.hands || []).map((h) => (h || []).length),
      drawnFrom: d.drawnFrom || null,
      drawnCard: d.drawnFrom === 'open' ? d.drawnCard : null,
      turns: (d.turns || []).slice(),
      picks: (d.picks || []).map((p) => (p || []).slice(-8)),
      discards: (d.discards || []).map((p) => (p || []).slice(-8)),
    };
    if (st.mode === 'gin') {
      base.deal = Object.assign(common, { upPass: d.upPass || 0, stockOnly: !!d.stockOnly, result: d.result || null, hands: done ? d.hands.map((h) => h.slice()) : null });
    } else {
      const meld = d.phase === 'meld';
      base.deal = Object.assign(common, {
        decks: d.decks,
        wildCard: d.wildCard,
        wildRank: d.wildRank,
        firstOpen: !!d.firstOpen,
        active: (d.active || []).slice(),
        declarer: d.declarer,
        winner: d.winner,
        finish: done ? d.finish : null,
        pending: meldPending(st),
        results: (d.results || []).map((r, i) => {
          if (!r) return null;
          // Melds stay private until everyone has shown; the declarer's show is public at once.
          const showGroups = done || r.kind === 'wrong' || (meld && i === d.declarer);
          return { points: r.points, kind: r.kind, groups: showGroups ? r.groups : null };
        }),
      });
    }
    return base;
  }

  function privateView(st, seat) {
    const d = st.deal || {};
    if (!st.seats[seat]) return { seat: -1, hand: [] };
    const hand = ((d.hands || [])[seat] || []).slice();
    const out = { seat, hand, drawnCard: d.turn === seat ? d.drawnCard || null : null, dealNo: st.dealNo };
    if (st.mode !== 'gin') {
      out.canDrop = st.format !== 'deals' && d.phase === 'draw' && d.turn === seat && !!d.active[seat];
      out.dropCost = dropCost(st, (d.turns || [])[seat] === 0);
      out.mustMeld = d.phase === 'meld' && !!d.active[seat] && !d.results[seat];
      out.canRejoin = canRejoin(st, seat);
    } else {
      const sol = solve(hand.length === 11 ? hand.slice(0, 11) : hand, { gin: true, discard: hand.length === 11, keep: d.drawnFrom === 'open' ? d.drawnCard : null });
      out.deadwood = sol.points;
      out.canKnock = d.phase === 'discard' && d.turn === seat && sol.points <= st.set.knock;
    }
    return out;
  }

  // ---------------------------------------------------------------- RTDB hydrate

  function arr(x) {
    if (Array.isArray(x)) return x;
    if (x && typeof x === 'object') {
      const keys = Object.keys(x).filter((k) => /^\d+$/.test(k)).map(Number);
      const out = [];
      keys.forEach((k) => (out[k] = x[k]));
      return out;
    }
    return [];
  }
  function arrN(x, n, fill) {
    const a = arr(x);
    const out = [];
    for (let i = 0; i < n; i++) out.push(a[i] === undefined || a[i] === null ? (typeof fill === 'function' ? fill() : fill) : a[i]);
    return out;
  }

  /** RTDB drops empty arrays and nulls: restore every shape the reducers expect. */
  function hydrate(st) {
    if (!st) return st;
    st.seats = arr(st.seats).filter(Boolean).map((s) => Object.assign({ score: 0, out: false, left: false, entries: 1, wins: 0, afk: 0, level: null, bot: false }, s));
    const n = st.seats.length;
    st.set = Object.assign({ pool: 101, deals: 2, knock: 10, target: 100, scoring: 'simple', bigGin: false }, st.set || {});
    st.log = arr(st.log).filter(Boolean);
    st.ranking = arr(st.ranking).filter((x) => x != null);
    st.tiebreak = st.tiebreak ? arr(st.tiebreak).filter((x) => x != null) : null;
    st.over = !!st.over;
    st.winner = st.winner == null ? -1 : Number(st.winner);
    st.final = st.final || null;
    st.seq = Number(st.seq) || 0;
    const d = st.deal;
    if (d) {
      d.closed = arr(d.closed).filter(Boolean);
      d.open = arr(d.open).filter(Boolean);
      d.hands = arrN(d.hands, n, () => []).map((h) => arr(h).filter(Boolean));
      d.turns = arrN(d.turns, n, 0).map((x) => Number(x) || 0);
      d.picks = arrN(d.picks, n, () => []).map((h) => arr(h).filter(Boolean));
      d.discards = arrN(d.discards, n, () => []).map((h) => arr(h).filter(Boolean));
      d.drawnFrom = d.drawnFrom || null;
      d.drawnCard = d.drawnCard || null;
      if (st.mode === 'gin') {
        d.upPass = Number(d.upPass) || 0;
        d.stockOnly = !!d.stockOnly;
        d.result = d.result || null;
        if (d.result) {
          ['knocker', 'defender'].forEach((k) => {
            const r = d.result[k];
            if (!r) return;
            r.groups = arr(r.groups).map((g) => arr(g).filter(Boolean));
            r.dead = arr(r.dead).filter(Boolean);
            if (k === 'defender') r.laid = arr(r.laid).filter(Boolean);
          });
        }
      } else {
        d.active = arrN(d.active, n, false).map(Boolean);
        d.results = arrN(d.results, n, null).map((r) => (r ? Object.assign({}, r, { groups: r.groups ? arr(r.groups).map((g) => arr(g).filter(Boolean)) : null }) : null));
        d.firstOpen = !!d.firstOpen;
        d.declarer = d.declarer == null ? -1 : Number(d.declarer);
        d.winner = d.winner == null ? -1 : Number(d.winner);
        d.finish = d.finish || null;
        d.pending = d.pending ? arr(d.pending) : [];
      }
    }
    return st;
  }

  // ---------------------------------------------------------------- bots

  /** What this seat can infer: unseen copies per card, unseen jokers, opponents' picks/discards. */
  function knowledge(st, seat) {
    const d = st.deal;
    const gin = st.mode === 'gin';
    const decks = gin ? 1 : d.decks;
    const wild = gin ? 0 : d.wildRank;
    const cnt = {};
    for (const s of SUITS) for (const r of RANKS) cnt[r + s] = decks;
    let jokers = gin ? 0 : decks;
    if (!gin) {
      // Wild-rank cards are jokers: count them in the joker pool, not as naturals.
      for (const s of SUITS) {
        jokers += decks;
        cnt[RANKS.charAt(wild - 1) + s] = 0;
      }
    }
    const see = (c) => {
      if (isJoker(c, wild)) jokers = Math.max(0, jokers - 1);
      else {
        const k = c.slice(0, 2);
        cnt[k] = Math.max(0, (cnt[k] || 0) - 1);
      }
    };
    d.hands[seat].forEach(see);
    d.open.forEach(see);
    if (!gin && d.wildCard) see(d.wildCard);
    st.seats.forEach((_, i) => {
      if (i === seat) return;
      (d.picks[i] || []).forEach((c) => {
        if (d.open.indexOf(c) < 0) see(c);
      });
    });
    return {
      jokers,
      count: (r, s) => cnt[RANKS.charAt(r - 1) + s] || 0,
    };
  }

  /** Near-meld value of deadwood: pairs and connectors, weighted by live outs. */
  function potential(dead, kn, wild, gin) {
    const val = gin ? valueGin : (c) => value13(c, wild);
    const nd = (dead || []).filter((c) => !isJoker(c, gin ? 0 : wild));
    const jOuts = gin ? 0 : kn.jokers || 0;
    let p = 0;
    for (let i = 0; i < nd.length; i++) {
      for (let j = i + 1; j < nd.length; j++) {
        const a = nd[i];
        const b = nd[j];
        const ra = rankOf(a);
        const rb = rankOf(b);
        const sa = suitOf(a);
        const sb = suitOf(b);
        let outs = 0;
        if (ra === rb && sa !== sb) {
          for (const s of SUITS) if (s !== sa && s !== sb) outs += kn.count(ra, s);
        } else if (sa === sb && ra !== rb) {
          const lo = Math.min(ra, rb);
          const hi = Math.max(ra, rb);
          const gap = hi - lo;
          const at = (r) => (r >= 1 && r <= 13 ? kn.count(r, sa) : r === 14 && !gin ? kn.count(1, sa) : 0);
          if (gap === 1) outs = at(lo - 1) + at(hi + 1);
          else if (gap === 2) outs = at(lo + 1);
          else if (!gin && lo === 1 && (hi === 13 || hi === 12)) outs = at(hi === 13 ? 12 : 13);
          else continue;
        } else continue;
        outs += jOuts;
        if (outs <= 0) continue;
        p += ((val(a) + val(b)) * outs) / (outs + 6);
      }
    }
    return p;
  }

  const LEVEL_W = { easy: 0, normal: 0.45, expert: 0.75 };

  function handCost(cards, st, seat, level, kn) {
    const gin = st.mode === 'gin';
    const wild = gin ? 0 : st.deal.wildRank;
    const sol = solve(cards, { wild, gin, cap: level === 'easy' ? 4000 : 20000 });
    const w = LEVEL_W[level] == null ? LEVEL_W.normal : LEVEL_W[level];
    return { cost: sol.points - w * potential(sol.dead, kn, wild, gin), sol };
  }

  /** How much an opponent seems to want this card (Expert discard safety). */
  function danger(card, st, seat) {
    const d = st.deal;
    const gin = st.mode === 'gin';
    const wild = gin ? 0 : d.wildRank;
    if (isJoker(card, wild)) return 0;
    const r = rankOf(card);
    const s = suitOf(card);
    const n = st.seats.length;
    const next = gin ? 1 - seat : nextSeat(st, seat, (i) => d.active[i]);
    let score = 0;
    for (let k = 1; k < n; k++) {
      const o = (seat + k) % n;
      if (!gin && !d.active[o]) continue;
      const w = o === next ? 1 : 0.5;
      (d.picks[o] || []).forEach((c) => {
        if (isJoker(c, wild)) return;
        if (rankOf(c) === r && suitOf(c) !== s) score += 1.5 * w;
        else if (suitOf(c) === s && Math.abs(rankOf(c) - r) <= 2) score += 1.2 * w;
      });
      (d.discards[o] || []).forEach((c) => {
        if (isJoker(c, wild)) return;
        if (rankOf(c) === r) score -= 0.6 * w;
        else if (suitOf(c) === s && Math.abs(rankOf(c) - r) === 1) score -= 0.3 * w;
      });
    }
    return Math.max(0, score);
  }

  function discardChoices(hand, st, seat, level, keep, R) {
    const gin = st.mode === 'gin';
    const wild = gin ? 0 : st.deal.wildRank;
    const kn = knowledge(st, seat);
    const seen = {};
    const out = [];
    hand.forEach((c) => {
      if (c === keep || seen[c.slice(0, 2)] || (!gin && isJoker(c, wild) && hand.some((x) => !isJoker(x, wild) && x !== keep))) return;
      seen[c.slice(0, 2)] = true;
      const rest = hand.slice();
      removeCard(rest, c);
      const hc = handCost(rest, st, seat, level, kn);
      let cost = hc.cost;
      if (level === 'expert') cost += danger(c, st, seat) * (1 + (gin ? valueGin(c) : value13(c, wild)) / 10);
      out.push({ card: c, cost, points: hc.sol.points, sol: hc.sol });
    });
    out.sort((a, b) => a.cost - b.cost || (gin ? valueGin(b.card) - valueGin(a.card) : value13(b.card, wild) - value13(a.card, wild)));
    if (level === 'easy' && out.length > 1 && R() < 0.3) {
      const alt = out.slice(0, Math.min(4, out.length));
      return [alt[Math.floor(R() * alt.length) % alt.length]].concat(out);
    }
    return out;
  }

  function wantsOpen(st, seat, level, R) {
    const d = st.deal;
    const gin = st.mode === 'gin';
    const top = d.open[d.open.length - 1];
    if (!top) return false;
    if (!gin && isJoker(top, d.wildRank)) return !!d.firstOpen;
    const kn = knowledge(st, seat);
    const hand = d.hands[seat];
    const cur = handCost(hand, st, seat, level, kn).cost;
    const withOpen = discardChoices(hand.concat([top]), st, seat, level, top, R)[0];
    if (!withOpen) return false;
    const margin = level === 'easy' ? 7 + R() * 4 : level === 'normal' ? 2 : 0.8;
    return withOpen.cost < cur - margin;
  }

  function shouldDrop(st, seat, level) {
    if (level === 'easy' || st.format === 'deals') return false;
    const d = st.deal;
    const hand = d.hands[seat];
    const kn = knowledge(st, seat);
    const sol = solve(hand, { wild: d.wildRank });
    const jokers = hand.filter((c) => isJoker(c, d.wildRank)).length;
    const hasPure = sol.groups.some((g) => classify(g, d.wildRank) === 'pure');
    const est = sol.points - potential(sol.dead, kn, d.wildRank, false) * 0.6 - jokers * 6 - (hasPure ? 14 : 0);
    const first = d.turns[seat] === 0;
    const cost = dropCost(st, first);
    const me = st.seats[seat];
    if (st.format === 'pool') {
      // A drop that eliminates is never worth it; near the limit, only drop a hopeless hand.
      if (me.score + cost >= st.set.pool) return false;
      if (me.score + MAX_POINTS >= st.set.pool && est < 55) return false;
    }
    if (first) return !hasPure && jokers === 0 && est >= (level === 'expert' ? 36 : 44);
    if (hasPure || d.turns[seat] < 4) return false;
    const threat = st.seats.some((_, i) => i !== seat && d.active[i] && (d.picks[i] || []).length >= 2);
    return level === 'expert' ? est >= 52 && threat : est >= 60 && d.turns[seat] >= 7;
  }

  function expertKnock(st, seat, dead) {
    const d = st.deal;
    if (dead <= 2) return true;
    if (d.turns[seat] < 6 || d.closed.length <= 12) return true;
    return (d.picks[1 - seat] || []).length >= 2;
  }

  /**
   * Deterministic bot move for the seat on turn (or owing a meld). Always legal.
   * @param {() => number} rng
   */
  function botAction(st, seat, rng) {
    const R = typeof rng === 'function' ? rng : Math.random;
    const d = st.deal;
    const level = st.seats[seat].level || 'normal';
    const gin = st.mode === 'gin';
    if (!gin && d.phase === 'meld') return { type: 'meld', groups: arrange(d.hands[seat], d.wildRank) };
    if (d.phase === 'upcard') return wantsOpen(st, seat, level, R) ? { type: 'draw', from: 'open' } : { type: 'pass' };
    if (d.phase === 'draw') {
      if (!gin && shouldDrop(st, seat, level)) return { type: 'drop' };
      const canOpen = !gin || !d.stockOnly;
      return canOpen && wantsOpen(st, seat, level, R) ? { type: 'draw', from: 'open' } : { type: 'draw', from: 'closed' };
    }
    if (d.phase !== 'discard') return null;
    const hand = d.hands[seat];
    const keep = d.drawnFrom === 'open' ? d.drawnCard : null;
    if (gin) {
      if (st.set.bigGin && solve(hand, { gin: true }).points === 0) return { type: 'biggin' };
      const best = solve(hand, { gin: true, discard: true, keep });
      if (best.points === 0 && best.discard) return { type: 'knock', card: best.discard };
      if (best.points <= st.set.knock && best.discard) {
        const go = level === 'expert' ? expertKnock(st, seat, best.points) : true;
        if (go) return { type: 'knock', card: best.discard };
      }
      const pick = discardChoices(hand, st, seat, level, keep, R)[0];
      return { type: 'discard', card: pick ? pick.card : best.discard };
    }
    const best = solve(hand, { wild: d.wildRank, discard: true, keep });
    if (best.valid && best.discard) {
      const groups = best.groups.map((g) => g.slice());
      if (best.dead.length) groups.push(best.dead.slice());
      return { type: 'declare', card: best.discard, groups };
    }
    const pick = discardChoices(hand, st, seat, level, keep, R)[0];
    return { type: 'discard', card: pick ? pick.card : best.discard };
  }

  // ---------------------------------------------------------------- coach (practice only)

  /**
   * Look at the human's move before it is applied; returns a mistake record or null.
   * Kinds: open, discard, joker, declare, drop, meld, wrong (13-card); gin_open, gin_discard,
   * gin_knock, gin_gin (Gin).
   */
  function coachCheck(st, seat, a) {
    const d = st.deal;
    if (!d || st.over || !a) return null;
    const turn = (d.turns[seat] || 0) + 1;
    const gin = st.mode === 'gin';
    const wild = gin ? 0 : d.wildRank;
    const hand = d.hands[seat] || [];
    const top = d.open[d.open.length - 1];
    if (a.type === 'draw' && (d.phase === 'draw' || d.phase === 'upcard') && a.from !== 'open' && top && !(gin && d.stockOnly)) {
      if (!gin && isJoker(top, wild) && !d.firstOpen) return null;
      const cur = solve(hand, { wild, gin }).points;
      const alt = solve(hand.concat([top]), { wild, gin, discard: true, keep: top });
      const gain = cur - alt.points;
      if (gain >= (gin ? 5 : 8)) return { kind: gin ? 'gin_open' : 'open', turn, card: top, better: alt.discard, impact: gain };
      return null;
    }
    if (a.type === 'pass' && gin && top) {
      const cur = solve(hand, { gin: true }).points;
      const alt = solve(hand.concat([top]), { gin: true, discard: true, keep: top });
      if (cur - alt.points >= 5) return { kind: 'gin_open', turn, card: top, better: alt.discard, impact: cur - alt.points };
      return null;
    }
    const keep = d.drawnFrom === 'open' ? d.drawnCard : null;
    if (gin && (a.type === 'discard' || a.type === 'knock') && d.phase === 'discard') {
      const best = solve(hand, { gin: true, discard: true, keep });
      const rest = hand.slice();
      removeCard(rest, a.card);
      const mine = solve(rest, { gin: true }).points;
      if (best.points === 0 && mine > 0) return { kind: 'gin_gin', turn, card: best.discard, played: a.card, impact: GIN_BONUS + Math.min(mine, 10) };
      if (a.type === 'discard' && best.points <= st.set.knock && best.points <= 4) return { kind: 'gin_knock', turn, card: best.discard, played: a.card, dead: best.points, impact: 10 - best.points };
      if (mine - best.points >= 4) return { kind: 'gin_discard', turn, card: a.card, better: best.discard, impact: mine - best.points };
      return null;
    }
    if (gin) return null;
    if (a.type === 'discard' && d.phase === 'discard') {
      const best = solve(hand, { wild, discard: true, keep });
      if (best.valid && best.discard) return { kind: 'declare', turn, card: best.discard, played: a.card, impact: 30 };
      if (isJoker(a.card, wild) && hand.some((c) => !isJoker(c, wild) && c !== keep)) return { kind: 'joker', turn, card: a.card, better: best.discard, impact: 12 };
      const rest = hand.slice();
      removeCard(rest, a.card);
      const mine = solve(rest, { wild }).points;
      const diff = mine - best.points;
      if (diff >= 6) return { kind: 'discard', turn, card: a.card, better: best.discard, impact: diff };
      return null;
    }
    if (a.type === 'drop' && d.phase === 'draw' && d.turns[seat] > 0) {
      const pts = solve(hand, { wild }).points;
      const cost = dropCost(st, false);
      if (pts + 10 < cost) return { kind: 'drop', turn, pts, cost, impact: cost - pts };
      return null;
    }
    if (a.type === 'meld' && d.phase === 'meld') {
      const auto = solve(hand, { wild }).points;
      const ev = evaluate(a.groups, wild);
      if (ev.points - auto >= 3) return { kind: 'meld', turn, impact: ev.points - auto };
      return null;
    }
    if (a.type === 'declare' && d.phase === 'discard') {
      const rest = hand.slice();
      removeCard(rest, a.card);
      const check = checkDeclaration(a.groups, rest, wild);
      if (!check.valid) return { kind: 'wrong', turn, reason: check.reason, impact: WRONG_SHOW - solve(rest, { wild }).points };
    }
    return null;
  }

  function coachTip(m) {
    const L = cardLabel;
    switch (m.kind) {
      case 'open':
        return 'Turn ' + m.turn + ': picking the open ' + L(m.card) + ' would have saved about ' + m.impact + ' points.';
      case 'discard':
        return 'Turn ' + m.turn + ': throwing ' + L(m.better) + ' instead of ' + L(m.card) + ' keeps ' + m.impact + ' more points off your count.';
      case 'joker':
        return 'Turn ' + m.turn + ': you threw a joker (' + L(m.card) + ') — keep jokers, they fill any gap.';
      case 'declare':
        return 'Turn ' + m.turn + ': you had a valid show — put ' + L(m.card) + ' on Finish and declare.';
      case 'drop':
        return 'Turn ' + m.turn + ': dropping cost ' + m.cost + ' but your hand was only ' + m.pts + ' points.';
      case 'meld':
        return 'Your final grouping left ' + m.impact + ' extra points — tap Auto-sort before you submit.';
      case 'wrong':
        return m.reason === 'no_pure'
          ? 'Wrong show: a valid hand needs a pure sequence (no jokers) first.'
          : m.reason === 'no_second'
            ? 'Wrong show: you need a second sequence as well as the pure one.'
            : 'Wrong show: one of your groups wasn’t a valid sequence or set.';
      case 'fed':
        return 'Turn ' + m.turn + ': ' + m.who + ' picked up your ' + L(m.card) + ' — watch what opponents collect.';
      case 'gin_open':
        return 'Turn ' + m.turn + ': taking ' + L(m.card) + ' would have cut your deadwood by ' + m.impact + '.';
      case 'gin_discard':
        return 'Turn ' + m.turn + ': throwing ' + L(m.better) + ' instead of ' + L(m.card) + ' leaves ' + m.impact + ' less deadwood.';
      case 'gin_knock':
        return 'Turn ' + m.turn + ': you could have knocked with ' + m.dead + ' deadwood by throwing ' + L(m.card) + '.';
      case 'gin_gin':
        return 'Turn ' + m.turn + ': you had Gin — throw ' + L(m.card) + ' and knock for the ' + GIN_BONUS + ' bonus.';
      default:
        return '';
    }
  }

  /**
   * Post-hand review from the recorded mistakes (deterministic; the AI may only rephrase it).
   * @returns {{ text: string, tips: string[], allowedCards: string[], mistakes: object[] }}
   */
  function coachReview(mistakes, ctx) {
    const c = ctx || {};
    const top = (mistakes || []).filter((m) => m && m.impact > 0).sort((a, b) => b.impact - a.impact).slice(0, 3);
    const allowed = [];
    const add = (card) => {
      if (card && isCard(card) && allowed.indexOf(cardLabel(card)) < 0) allowed.push(cardLabel(card));
    };
    top.forEach((m) => {
      add(m.card);
      add(m.better);
      add(m.played);
    });
    const tips = top.map(coachTip).filter(Boolean).map((t) => t.slice(0, 120));
    const unit = c.gin ? 'deadwood' : 'points';
    let text;
    if (!top.length) text = c.won ? 'Clean hand — no costly slips. Nicely played.' : 'No big mistakes this hand — the cards ran against you.';
    else {
      const total = top.reduce((a, m) => a + m.impact, 0);
      text = (c.won ? 'You won, but ' : '') + top.length + (top.length === 1 ? ' decision' : ' decisions') + ' cost about ' + total + ' ' + unit + '. Biggest: ' + tips[0];
    }
    if (c.points != null && !c.won && !c.gin) text = 'You finished on ' + c.points + ' points. ' + text;
    return { text: text.slice(0, 280), tips, allowedCards: allowed, mistakes: top };
  }

  const WORD_RANKS = { ace: 'A', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', jack: 'J', queen: 'Q', king: 'K' };
  const WORD_SUITS = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣', spade: '♠', heart: '♥', diamond: '♦', club: '♣' };

  /** Coach grounding: every card the text names must be in `allowed` (labels like "9♥"). */
  function validateCoachText(text, allowed) {
    const ok = new Set((allowed || []).map(String));
    const s = String(text || '');
    const found = [];
    const sym = /(^|[^0-9A-Za-z])(10|[2-9AJQK])\s?([♠♥♦♣])/g;
    let m;
    while ((m = sym.exec(s))) found.push(m[2] + m[3]);
    const words = /\b(ace|two|three|four|five|six|seven|eight|nine|ten|jack|queen|king|[2-9]|10)s?\s+of\s+(spades?|hearts?|diamonds?|clubs?)\b/gi;
    while ((m = words.exec(s))) {
      const r = WORD_RANKS[m[1].toLowerCase()] || m[1];
      found.push(r + WORD_SUITS[m[2].toLowerCase()]);
    }
    const bad = found.filter((c) => !ok.has(c));
    return { ok: bad.length === 0, bad };
  }

  return {
    RANKS,
    SUITS,
    SUIT_SYMBOLS,
    RANK_NAMES,
    MODES,
    FORMATS,
    POOLS,
    DEALS,
    RATES,
    FEES,
    STAKES,
    KNOCKS,
    TARGETS,
    LEVELS,
    MAX_POINTS,
    WRONG_SHOW,
    GIN_BONUS,
    BIG_GIN_BONUS,
    UNDERCUT_BONUS,
    GAME_BONUS,
    BOX_BONUS,
    REJOIN_MAX,
    TURN_MS,
    GIN_TURN_MS,
    BANK_MS,
    MELD_MS,
    isPrinted,
    isJoker,
    isCard,
    rankOf,
    suitOf,
    value13,
    valueGin,
    cardLabel,
    cardName,
    makeDeck,
    shuffle,
    sortHand,
    classify,
    groupLabel,
    evaluate,
    checkDeclaration,
    solve,
    arrange,
    layoff,
    mergeSettings,
    formatLabel,
    chipAmount,
    dropCost,
    newMatch,
    nextDeal,
    apply,
    actor,
    meldPending,
    activeSeats,
    canRejoin,
    rejoin,
    autoAction,
    publicView,
    privateView,
    hydrate,
    knowledge,
    potential,
    danger,
    botAction,
    coachCheck,
    coachTip,
    coachReview,
    validateCoachText,
  };
});
