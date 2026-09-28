/**
 * ChessCore — FIDE Laws of Chess rules core (standard + Chess960).
 * Shared by the client (window.ChessCore), the Web Worker (importScripts) and
 * the server (require). No DOM, no network.
 *
 * Board: Int8Array(64), a1 = 0 … h8 = 63. Pieces: 1 P, 2 N, 3 B, 4 R, 5 Q, 6 K; black = +8.
 * Castling rights are stored as rook files so Chess960 (X-FEN / Shredder-FEN) works.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ChessCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
  const WHITE = 0, BLACK = 1;
  const F_NORMAL = 0, F_BIG = 1, F_EP = 2, F_CASTLE = 3;
  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const TYPE_CHARS = ' pnbrqk';
  const FILES = 'abcdefgh';

  const colorOf = (p) => p >> 3;
  const typeOf = (p) => p & 7;
  const fileOf = (s) => s & 7;
  const rankOf = (s) => s >> 3;
  const sqName = (s) => FILES[s & 7] + ((s >> 3) + 1);
  function sqIndex(name) {
    const m = /^([a-h])([1-8])$/.exec(String(name || ''));
    return m ? (Number(m[2]) - 1) * 8 + FILES.indexOf(m[1]) : -1;
  }

  // ---------- precomputed attack tables ----------
  const KNIGHT_T = [], KING_T = [], RAYS = [];
  const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  for (let s = 0; s < 64; s++) {
    const f = fileOf(s), r = rankOf(s);
    const kn = [];
    for (const [df, dr] of [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]) {
      const nf = f + df, nr = r + dr;
      if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) kn.push(nr * 8 + nf);
    }
    KNIGHT_T.push(kn);
    const kg = [];
    for (const [df, dr] of DIRS) {
      const nf = f + df, nr = r + dr;
      if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) kg.push(nr * 8 + nf);
    }
    KING_T.push(kg);
    const rays = [];
    for (const [df, dr] of DIRS) {
      const ray = [];
      let nf = f + df, nr = r + dr;
      while (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
        ray.push(nr * 8 + nf);
        nf += df;
        nr += dr;
      }
      rays.push(ray);
    }
    RAYS.push(rays);
  }

  // ---------- zobrist (two 32-bit halves, deterministic) ----------
  let seed = 0x9e3779b9 | 0;
  function rnd32() {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed | 0;
  }
  const Z_LO = new Int32Array(16 * 64), Z_HI = new Int32Array(16 * 64);
  for (let i = 0; i < 16 * 64; i++) {
    Z_LO[i] = rnd32();
    Z_HI[i] = rnd32();
  }
  const ZS_LO = rnd32(), ZS_HI = rnd32();
  const ZC_LO = new Int32Array(4 * 9), ZC_HI = new Int32Array(4 * 9);
  for (let i = 0; i < 36; i++) {
    ZC_LO[i] = rnd32();
    ZC_HI[i] = rnd32();
  }
  const ZE_LO = new Int32Array(8), ZE_HI = new Int32Array(8);
  for (let i = 0; i < 8; i++) {
    ZE_LO[i] = rnd32();
    ZE_HI[i] = rnd32();
  }

  // ---------- Position ----------
  function Position() {
    this.b = new Int8Array(64);
    this.side = WHITE;
    this.castle = new Int8Array([-1, -1, -1, -1]); // wK, wQ, bK, bQ rook files
    this.ep = -1;
    this.half = 0;
    this.full = 1;
    this.kings = [-1, -1];
    this.lo = 0;
    this.hi = 0;
    this.stack = [];
    this.chess960 = false;
  }

  Position.prototype.computeHash = function () {
    let lo = 0, hi = 0;
    for (let s = 0; s < 64; s++) {
      const p = this.b[s];
      if (p) {
        lo ^= Z_LO[p * 64 + s];
        hi ^= Z_HI[p * 64 + s];
      }
    }
    if (this.side) {
      lo ^= ZS_LO;
      hi ^= ZS_HI;
    }
    for (let i = 0; i < 4; i++) {
      lo ^= ZC_LO[i * 9 + this.castle[i] + 1];
      hi ^= ZC_HI[i * 9 + this.castle[i] + 1];
    }
    if (this.ep >= 0) {
      lo ^= ZE_LO[fileOf(this.ep)];
      hi ^= ZE_HI[fileOf(this.ep)];
    }
    this.lo = lo;
    this.hi = hi;
  };

  Position.prototype.load = function (fen, opts) {
    const parts = String(fen || '').trim().split(/\s+/);
    if (parts.length < 4) throw new Error('bad_fen');
    const rows = parts[0].split('/');
    if (rows.length !== 8) throw new Error('bad_fen');
    const b = new Int8Array(64);
    const kings = [-1, -1];
    for (let i = 0; i < 8; i++) {
      const r = 7 - i;
      let f = 0;
      for (const ch of rows[i]) {
        if (/[1-8]/.test(ch)) {
          f += Number(ch);
          continue;
        }
        const t = TYPE_CHARS.indexOf(ch.toLowerCase());
        if (t < 1 || f > 7) throw new Error('bad_fen');
        const c = ch === ch.toUpperCase() ? WHITE : BLACK;
        b[r * 8 + f] = t | (c << 3);
        if (t === K) {
          if (kings[c] >= 0) throw new Error('bad_fen');
          kings[c] = r * 8 + f;
        }
        f += 1;
      }
      if (f !== 8) throw new Error('bad_fen');
    }
    if (kings[0] < 0 || kings[1] < 0) throw new Error('bad_fen');
    this.b = b;
    this.kings = kings;
    this.side = parts[1] === 'b' ? BLACK : WHITE;
    this.castle = new Int8Array([-1, -1, -1, -1]);
    this.chess960 = !!(opts && opts.chess960);
    const cs = parts[2] === '-' ? '' : parts[2];
    for (const ch of cs) {
      const c = ch === ch.toUpperCase() ? WHITE : BLACK;
      const rank = c ? 7 : 0;
      const ks = kings[c];
      if (rankOf(ks) !== rank) continue;
      const kf = fileOf(ks);
      const rook = R | (c << 3);
      const up = ch.toUpperCase();
      let file = -1;
      if (up === 'K') {
        for (let f = 7; f > kf; f--) if (b[rank * 8 + f] === rook) { file = f; break; }
      } else if (up === 'Q') {
        for (let f = 0; f < kf; f++) if (b[rank * 8 + f] === rook) { file = f; break; }
      } else if (up >= 'A' && up <= 'H') {
        file = up.charCodeAt(0) - 65;
        this.chess960 = true;
        if (b[rank * 8 + file] !== rook) file = -1;
      }
      if (file < 0) continue;
      const idx = c * 2 + (file > kf ? 0 : 1);
      this.castle[idx] = file;
      if (file !== (file > kf ? 7 : 0) || kf !== 4) this.chess960 = true;
    }
    this.ep = -1;
    if (parts[3] && parts[3] !== '-') {
      const e = sqIndex(parts[3]);
      if (e >= 0) this.ep = e;
    }
    this.half = Math.max(0, parseInt(parts[4], 10) || 0);
    this.full = Math.max(1, parseInt(parts[5], 10) || 1);
    this.stack = [];
    // Only keep an ep square when a pawn could actually capture there (FEN writers differ).
    if (this.ep >= 0 && !this.epPseudo()) this.ep = -1;
    this.computeHash();
    return this;
  };

  Position.prototype.epPseudo = function () {
    if (this.ep < 0) return false;
    const us = this.side;
    const pawn = P | (us << 3);
    const f = fileOf(this.ep);
    const from = us === WHITE ? this.ep - 8 : this.ep + 8;
    if (f > 0 && this.b[from - 1] === pawn) return true;
    if (f < 7 && this.b[from + 1] === pawn) return true;
    return false;
  };

  Position.prototype.fen = function () {
    let out = '';
    for (let r = 7; r >= 0; r--) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = this.b[r * 8 + f];
        if (!p) {
          empty++;
          continue;
        }
        if (empty) {
          out += empty;
          empty = 0;
        }
        const ch = TYPE_CHARS[typeOf(p)];
        out += colorOf(p) ? ch : ch.toUpperCase();
      }
      if (empty) out += empty;
      if (r) out += '/';
    }
    let cs = '';
    for (let c = 0; c < 2; c++) {
      for (let i = 0; i < 2; i++) {
        const file = this.castle[c * 2 + i];
        if (file < 0) continue;
        let ch = i === 0 ? 'K' : 'Q';
        if (this.chess960) {
          // X-FEN: use the file letter when another rook sits further out on that side.
          const rank = c ? 7 : 0;
          const rook = R | (c << 3);
          let outer = false;
          if (i === 0) {
            for (let f = file + 1; f < 8; f++) if (this.b[rank * 8 + f] === rook) outer = true;
          } else {
            for (let f = 0; f < file; f++) if (this.b[rank * 8 + f] === rook) outer = true;
          }
          if (outer) ch = FILES[file].toUpperCase();
        }
        cs += c ? ch.toLowerCase() : ch;
      }
    }
    const ep = this.ep >= 0 && this.hasLegalEp() ? sqName(this.ep) : '-';
    return `${out} ${this.side ? 'b' : 'w'} ${cs || '-'} ${ep} ${this.half} ${this.full}`;
  };

  Position.prototype.isAttacked = function (sq, by) {
    const b = this.b;
    const f = fileOf(sq);
    if (by === WHITE) {
      if (f > 0 && sq - 9 >= 0 && b[sq - 9] === P) return true;
      if (f < 7 && sq - 7 >= 0 && b[sq - 7] === P) return true;
    } else {
      if (f > 0 && sq + 7 < 64 && b[sq + 7] === (P | 8)) return true;
      if (f < 7 && sq + 9 < 64 && b[sq + 9] === (P | 8)) return true;
    }
    const cb = by << 3;
    const kn = KNIGHT_T[sq];
    for (let i = 0; i < kn.length; i++) if (b[kn[i]] === (N | cb)) return true;
    const kg = KING_T[sq];
    for (let i = 0; i < kg.length; i++) if (b[kg[i]] === (K | cb)) return true;
    const rays = RAYS[sq];
    for (let d = 0; d < 8; d++) {
      const ray = rays[d];
      for (let i = 0; i < ray.length; i++) {
        const p = b[ray[i]];
        if (!p) continue;
        if (colorOf(p) === by) {
          const t = typeOf(p);
          if (t === Q || (d < 4 ? t === R : t === B)) return true;
        }
        break;
      }
    }
    return false;
  };

  Position.prototype.inCheck = function (side) {
    const s = side == null ? this.side : side;
    return this.isAttacked(this.kings[s], s ^ 1);
  };

  function mv(from, to, p, cap, promo, flag) {
    return { from, to, p, cap, promo, flag, rookFrom: -1, rookTo: -1 };
  }

  /** Pseudo-legal moves (castling already fully checked except final king safety). */
  Position.prototype.genPseudo = function (capturesOnly) {
    const out = [];
    const b = this.b;
    const us = this.side, them = us ^ 1;
    const ub = us << 3;
    for (let s = 0; s < 64; s++) {
      const p = b[s];
      if (!p || colorOf(p) !== us) continue;
      const t = typeOf(p);
      if (t === P) {
        const fwd = us === WHITE ? 8 : -8;
        const startRank = us === WHITE ? 1 : 6;
        const promoRank = us === WHITE ? 7 : 0;
        const f = fileOf(s);
        const one = s + fwd;
        if (one >= 0 && one < 64 && !b[one]) {
          if (rankOf(one) === promoRank) {
            out.push(mv(s, one, p, 0, Q, F_NORMAL));
            if (!capturesOnly) {
              out.push(mv(s, one, p, 0, N, F_NORMAL));
              out.push(mv(s, one, p, 0, R, F_NORMAL));
              out.push(mv(s, one, p, 0, B, F_NORMAL));
            }
          } else if (!capturesOnly) {
            out.push(mv(s, one, p, 0, 0, F_NORMAL));
            const two = one + fwd;
            if (rankOf(s) === startRank && !b[two]) out.push(mv(s, two, p, 0, 0, F_BIG));
          }
        }
        for (const df of [-1, 1]) {
          if ((df < 0 && f === 0) || (df > 0 && f === 7)) continue;
          const to = one + df;
          if (to < 0 || to >= 64) continue;
          const tp = b[to];
          if (tp && colorOf(tp) === them) {
            if (rankOf(to) === promoRank) {
              out.push(mv(s, to, p, tp, Q, F_NORMAL));
              out.push(mv(s, to, p, tp, N, F_NORMAL));
              out.push(mv(s, to, p, tp, R, F_NORMAL));
              out.push(mv(s, to, p, tp, B, F_NORMAL));
            } else out.push(mv(s, to, p, tp, 0, F_NORMAL));
          } else if (to === this.ep && !tp) {
            out.push(mv(s, to, p, P | (them << 3), 0, F_EP));
          }
        }
        continue;
      }
      if (t === N || t === K) {
        const tg = t === N ? KNIGHT_T[s] : KING_T[s];
        for (let i = 0; i < tg.length; i++) {
          const to = tg[i];
          const tp = b[to];
          if (tp && colorOf(tp) === us) continue;
          if (capturesOnly && !tp) continue;
          out.push(mv(s, to, p, tp, 0, F_NORMAL));
        }
        if (t === K && !capturesOnly) this.genCastles(out);
        continue;
      }
      const d0 = t === B ? 4 : 0, d1 = t === R ? 4 : 8;
      const rays = RAYS[s];
      for (let d = d0; d < d1; d++) {
        const ray = rays[d];
        for (let i = 0; i < ray.length; i++) {
          const to = ray[i];
          const tp = b[to];
          if (tp) {
            if (colorOf(tp) === them) out.push(mv(s, to, p, tp, 0, F_NORMAL));
            break;
          }
          if (!capturesOnly) out.push(mv(s, to, p, 0, 0, F_NORMAL));
        }
      }
    }
    return out;
  };

  Position.prototype.genCastles = function (out) {
    const us = this.side, them = us ^ 1;
    const rank = us ? 7 : 0;
    const ks = this.kings[us];
    if (rankOf(ks) !== rank) return;
    const king = K | (us << 3), rook = R | (us << 3);
    for (let i = 0; i < 2; i++) {
      const rf = this.castle[us * 2 + i];
      if (rf < 0) continue;
      const rs = rank * 8 + rf;
      if (this.b[rs] !== rook) continue;
      const kd = rank * 8 + (i === 0 ? 6 : 2);
      const rd = rank * 8 + (i === 0 ? 5 : 3);
      const lo = Math.min(ks, rs, kd, rd), hi = Math.max(ks, rs, kd, rd);
      let blocked = false;
      for (let s = lo; s <= hi; s++) {
        if (s !== ks && s !== rs && this.b[s]) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      // King may not be in, pass through, or land on an attacked square (FIDE 3.8.2.2).
      this.b[ks] = 0;
      let safe = true;
      const step = kd >= ks ? 1 : -1;
      for (let s = ks; ; s += step) {
        if (this.isAttacked(s, them)) {
          safe = false;
          break;
        }
        if (s === kd) break;
      }
      this.b[ks] = king;
      if (!safe) continue;
      const m = mv(ks, kd, king, 0, 0, F_CASTLE);
      m.rookFrom = rs;
      m.rookTo = rd;
      out.push(m);
    }
  };

  function xorPiece(pos, p, s) {
    pos.lo ^= Z_LO[p * 64 + s];
    pos.hi ^= Z_HI[p * 64 + s];
  }

  Position.prototype.make = function (m) {
    const b = this.b;
    const us = this.side;
    this.stack.push({
      m,
      castle: this.castle.slice(),
      ep: this.ep,
      half: this.half,
      lo: this.lo,
      hi: this.hi,
    });
    if (this.ep >= 0) {
      this.lo ^= ZE_LO[fileOf(this.ep)];
      this.hi ^= ZE_HI[fileOf(this.ep)];
    }
    for (let i = 0; i < 4; i++) {
      this.lo ^= ZC_LO[i * 9 + this.castle[i] + 1];
      this.hi ^= ZC_HI[i * 9 + this.castle[i] + 1];
    }
    const t = typeOf(m.p);
    if (m.flag === F_CASTLE) {
      const rook = R | (us << 3);
      b[m.from] = 0;
      b[m.rookFrom] = 0;
      xorPiece(this, m.p, m.from);
      xorPiece(this, rook, m.rookFrom);
      b[m.to] = m.p;
      b[m.rookTo] = rook;
      xorPiece(this, m.p, m.to);
      xorPiece(this, rook, m.rookTo);
      this.kings[us] = m.to;
      this.castle[us * 2] = -1;
      this.castle[us * 2 + 1] = -1;
      this.ep = -1;
      this.half += 1;
    } else {
      b[m.from] = 0;
      xorPiece(this, m.p, m.from);
      if (m.flag === F_EP) {
        const cs = us === WHITE ? m.to - 8 : m.to + 8;
        b[cs] = 0;
        xorPiece(this, m.cap, cs);
      } else if (m.cap) {
        xorPiece(this, m.cap, m.to);
      }
      const placed = m.promo ? m.promo | (us << 3) : m.p;
      b[m.to] = placed;
      xorPiece(this, placed, m.to);
      if (t === K) {
        this.kings[us] = m.to;
        this.castle[us * 2] = -1;
        this.castle[us * 2 + 1] = -1;
      } else if (t === R && rankOf(m.from) === (us ? 7 : 0)) {
        const f = fileOf(m.from);
        if (this.castle[us * 2] === f) this.castle[us * 2] = -1;
        if (this.castle[us * 2 + 1] === f) this.castle[us * 2 + 1] = -1;
      }
      if (m.cap && typeOf(m.cap) === R && rankOf(m.to) === (us ? 0 : 7)) {
        const them = us ^ 1;
        const f = fileOf(m.to);
        if (this.castle[them * 2] === f) this.castle[them * 2] = -1;
        if (this.castle[them * 2 + 1] === f) this.castle[them * 2 + 1] = -1;
      }
      this.ep = m.flag === F_BIG ? (m.from + m.to) >> 1 : -1;
      this.half = t === P || m.cap ? 0 : this.half + 1;
    }
    if (us === BLACK) this.full += 1;
    this.side ^= 1;
    this.lo ^= ZS_LO;
    this.hi ^= ZS_HI;
    for (let i = 0; i < 4; i++) {
      this.lo ^= ZC_LO[i * 9 + this.castle[i] + 1];
      this.hi ^= ZC_HI[i * 9 + this.castle[i] + 1];
    }
    if (this.ep >= 0) {
      if (this.epPseudo()) {
        this.lo ^= ZE_LO[fileOf(this.ep)];
        this.hi ^= ZE_HI[fileOf(this.ep)];
      } else this.ep = -1;
    }
  };

  Position.prototype.unmake = function () {
    const u = this.stack.pop();
    if (!u) return null;
    const m = u.m;
    const b = this.b;
    this.side ^= 1;
    const us = this.side;
    if (us === BLACK) this.full -= 1;
    if (m.flag === F_CASTLE) {
      b[m.to] = 0;
      b[m.rookTo] = 0;
      b[m.from] = m.p;
      b[m.rookFrom] = R | (us << 3);
      this.kings[us] = m.from;
    } else {
      b[m.from] = m.p;
      if (m.flag === F_EP) {
        b[m.to] = 0;
        b[us === WHITE ? m.to - 8 : m.to + 8] = m.cap;
      } else b[m.to] = m.cap;
      if (typeOf(m.p) === K) this.kings[us] = m.from;
    }
    this.castle = u.castle;
    this.ep = u.ep;
    this.half = u.half;
    this.lo = u.lo;
    this.hi = u.hi;
    return m;
  };

  /** Null move for search (never used for game play). */
  Position.prototype.makeNull = function () {
    this.stack.push({ m: null, castle: this.castle.slice(), ep: this.ep, half: this.half, lo: this.lo, hi: this.hi });
    if (this.ep >= 0) {
      this.lo ^= ZE_LO[fileOf(this.ep)];
      this.hi ^= ZE_HI[fileOf(this.ep)];
    }
    this.ep = -1;
    this.side ^= 1;
    this.lo ^= ZS_LO;
    this.hi ^= ZS_HI;
    this.half += 1;
  };
  Position.prototype.unmakeNull = function () {
    const u = this.stack.pop();
    this.side ^= 1;
    this.castle = u.castle;
    this.ep = u.ep;
    this.half = u.half;
    this.lo = u.lo;
    this.hi = u.hi;
  };

  Position.prototype.legalMoves = function () {
    const out = [];
    const ps = this.genPseudo(false);
    const us = this.side;
    for (let i = 0; i < ps.length; i++) {
      this.make(ps[i]);
      if (!this.isAttacked(this.kings[us], us ^ 1)) out.push(ps[i]);
      this.unmake();
    }
    return out;
  };

  Position.prototype.hasLegalMove = function () {
    const ps = this.genPseudo(false);
    const us = this.side;
    for (let i = 0; i < ps.length; i++) {
      this.make(ps[i]);
      const ok = !this.isAttacked(this.kings[us], us ^ 1);
      this.unmake();
      if (ok) return true;
    }
    return false;
  };

  Position.prototype.hasLegalEp = function () {
    if (this.ep < 0) return false;
    const us = this.side;
    const ps = this.genPseudo(true);
    for (const m of ps) {
      if (m.flag !== F_EP) continue;
      this.make(m);
      const ok = !this.isAttacked(this.kings[us], us ^ 1);
      this.unmake();
      if (ok) return true;
    }
    return false;
  };

  /** Repetition key per FIDE 9.2.3: ep only counts when the capture is actually legal. */
  Position.prototype.repKey = function () {
    let lo = this.lo, hi = this.hi;
    if (this.ep >= 0 && !this.hasLegalEp()) {
      lo ^= ZE_LO[fileOf(this.ep)];
      hi ^= ZE_HI[fileOf(this.ep)];
    }
    return (lo >>> 0).toString(36) + '.' + (hi >>> 0).toString(36);
  };

  Position.prototype.perft = function (depth) {
    if (depth === 0) return 1;
    const moves = this.legalMoves();
    if (depth === 1) return moves.length;
    let n = 0;
    for (const m of moves) {
      this.make(m);
      n += this.perft(depth - 1);
      this.unmake();
    }
    return n;
  };

  // ---------- material rules ----------
  function materialOf(b) {
    const m = { w: { p: 0, n: 0, b: 0, r: 0, q: 0, bl: 0, bd: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0, bl: 0, bd: 0 } };
    for (let s = 0; s < 64; s++) {
      const p = b[s];
      if (!p) continue;
      const side = colorOf(p) ? m.b : m.w;
      const t = typeOf(p);
      if (t === P) side.p++;
      else if (t === N) side.n++;
      else if (t === B) {
        side.b++;
        if ((fileOf(s) + rankOf(s)) % 2 === 1) side.bl++;
        else side.bd++;
      } else if (t === R) side.r++;
      else if (t === Q) side.q++;
    }
    return m;
  }

  /** Dead position by material (FIDE 5.2.2 common cases): K v K, K+minor v K, bishops all on one colour. */
  function insufficientMaterial(b) {
    const m = materialOf(b);
    for (const c of ['w', 'b']) if (m[c].p || m[c].r || m[c].q) return false;
    const minors = m.w.n + m.w.b + m.b.n + m.b.b;
    if (minors <= 1) return true;
    if (m.w.n + m.b.n === 0) {
      const light = m.w.bl + m.b.bl, dark = m.w.bd + m.b.bd;
      if (light === 0 || dark === 0) return true;
    }
    return false;
  }

  /**
   * Could `color` ('w'|'b') ever checkmate by any legal sequence of moves? (FIDE 6.9)
   * Conservative: only returns false for material that can never mate.
   */
  function canMate(b, color) {
    const m = materialOf(b);
    const me = m[color], op = m[color === 'w' ? 'b' : 'w'];
    if (me.p || me.r || me.q) return true;
    const minors = me.n + me.b;
    if (minors === 0) return false;
    const opOther = op.p + op.n + op.b + op.r + op.q;
    if (me.n >= 2 || (me.n >= 1 && me.b >= 1) || (me.bl && me.bd)) return true;
    if (me.n === 1) return opOther > 0;
    // Bishops of a single colour: need an opposing blocker that can stand on the other colour.
    const myLight = me.bl > 0;
    const blockers = op.p + op.n + op.r + op.q + (myLight ? op.bd : op.bl);
    return blockers > 0;
  }

  // ---------- Chess960 ----------
  const KNIGHT_PATTERNS = [[0, 1], [0, 2], [0, 3], [0, 4], [1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]];
  function chess960Fen(n) {
    let x = ((Number(n) % 960) + 960) % 960;
    const row = new Array(8).fill('');
    row[[1, 3, 5, 7][x % 4]] = 'B';
    x = Math.floor(x / 4);
    row[[0, 2, 4, 6][x % 4]] = 'B';
    x = Math.floor(x / 4);
    const empties = () => row.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
    row[empties()[x % 6]] = 'Q';
    x = Math.floor(x / 6);
    const pat = KNIGHT_PATTERNS[x];
    const e = empties();
    row[e[pat[0]]] = 'N';
    row[e[pat[1]]] = 'N';
    const rest = empties();
    row[rest[0]] = 'R';
    row[rest[1]] = 'K';
    row[rest[2]] = 'R';
    const white = row.join('');
    return `${white.toLowerCase()}/pppppppp/8/8/8/8/PPPPPPPP/${white} w KQkq - 0 1`;
  }

  // ---------- SAN / UCI ----------
  const PIECE_LETTER = ['', '', 'N', 'B', 'R', 'Q', 'K'];

  function sanOf(pos, m, legal) {
    let s;
    if (m.flag === F_CASTLE) s = fileOf(m.to) === 6 ? 'O-O' : 'O-O-O';
    else {
      const t = typeOf(m.p);
      const capture = !!m.cap;
      if (t === P) {
        s = (capture ? FILES[fileOf(m.from)] + 'x' : '') + sqName(m.to);
        if (m.promo) s += '=' + PIECE_LETTER[m.promo];
      } else {
        const rivals = legal.filter(
          (o) => o !== m && o.flag !== F_CASTLE && o.to === m.to && o.p === m.p && o.from !== m.from
        );
        let dis = '';
        if (rivals.length) {
          const sameFile = rivals.some((o) => fileOf(o.from) === fileOf(m.from));
          const sameRank = rivals.some((o) => rankOf(o.from) === rankOf(m.from));
          if (!sameFile) dis = FILES[fileOf(m.from)];
          else if (!sameRank) dis = String(rankOf(m.from) + 1);
          else dis = sqName(m.from);
        }
        s = PIECE_LETTER[t] + dis + (capture ? 'x' : '') + sqName(m.to);
      }
    }
    pos.make(m);
    if (pos.inCheck()) s += pos.hasLegalMove() ? '+' : '#';
    pos.unmake();
    return s;
  }

  function uciOf(pos, m) {
    const to = m.flag === F_CASTLE && pos.chess960 ? m.rookFrom : m.to;
    return sqName(m.from) + sqName(to) + (m.promo ? TYPE_CHARS[m.promo] : '');
  }

  function cleanSan(s) {
    return String(s || '')
      .trim()
      .replace(/[+#!?]+$/g, '')
      .replace(/0/g, 'O')
      .replace(/^([a-h][1-8])-?([a-h][1-8])/, '$1$2');
  }

  // ---------- Game (public API) ----------
  function Game(opts) {
    const o = typeof opts === 'string' ? { fen: opts } : opts || {};
    this.pos = new Position();
    this.load(o.fen || START_FEN, { chess960: !!o.chess960 });
  }

  Game.prototype.load = function (fen, opts) {
    const p = new Position();
    p.load(fen, opts);
    this.pos = p;
    this.startFen = p.fen();
    this.chess960 = p.chess960;
    this.sans = [];
    this.keys = [p.repKey()];
    this.headers = {};
    return this;
  };

  Game.prototype.fen = function () {
    return this.pos.fen();
  };
  Game.prototype.turn = function () {
    return this.pos.side ? 'b' : 'w';
  };
  Game.prototype.get = function (square) {
    const s = typeof square === 'number' ? square : sqIndex(square);
    if (s < 0) return null;
    const p = this.pos.b[s];
    return p ? { type: TYPE_CHARS[typeOf(p)], color: colorOf(p) ? 'b' : 'w' } : null;
  };
  /** 8×8 array, rank 8 first (chess.js shape). */
  Game.prototype.board = function () {
    const rows = [];
    for (let r = 7; r >= 0; r--) {
      const row = [];
      for (let f = 0; f < 8; f++) {
        const s = r * 8 + f;
        const p = this.pos.b[s];
        row.push(p ? { square: sqName(s), type: TYPE_CHARS[typeOf(p)], color: colorOf(p) ? 'b' : 'w' } : null);
      }
      rows.push(row);
    }
    return rows;
  };

  Game.prototype.verbose = function (m, legal) {
    const pos = this.pos;
    const castle = m.flag === F_CASTLE;
    let flags = 'n';
    if (castle) flags = fileOf(m.to) === 6 ? 'k' : 'q';
    else if (m.flag === F_EP) flags = 'e';
    else if (m.flag === F_BIG) flags = 'b';
    else if (m.cap) flags = 'c';
    if (m.promo) flags += 'p';
    const out = {
      color: colorOf(m.p) ? 'b' : 'w',
      from: sqName(m.from),
      to: sqName(castle && this.chess960 ? m.rookFrom : m.to),
      piece: TYPE_CHARS[typeOf(m.p)],
      flags,
      san: sanOf(pos, m, legal || pos.legalMoves()),
      lan: uciOf(pos, m),
    };
    if (m.cap) out.captured = TYPE_CHARS[typeOf(m.cap)];
    if (m.promo) out.promotion = TYPE_CHARS[m.promo];
    if (castle) {
      out.kingTo = sqName(m.to);
      out.rookFrom = sqName(m.rookFrom);
      out.rookTo = sqName(m.rookTo);
    }
    return out;
  };

  Game.prototype.moves = function (opts) {
    const o = opts || {};
    const legal = this.pos.legalMoves();
    let list = legal;
    if (o.square) {
      const s = sqIndex(o.square);
      list = legal.filter((m) => m.from === s);
    }
    if (o.verbose) return list.map((m) => this.verbose(m, legal));
    return list.map((m) => sanOf(this.pos, m, legal));
  };

  /** Resolve a SAN string, UCI string or {from,to,promotion} to an internal legal move. */
  Game.prototype.findMove = function (input) {
    const pos = this.pos;
    const legal = pos.legalMoves();
    if (!input) return null;
    if (typeof input === 'object') {
      const from = sqIndex(input.from), to = sqIndex(input.to);
      const promo = input.promotion ? TYPE_CHARS.indexOf(String(input.promotion).toLowerCase()) : 0;
      for (const m of legal) {
        if (m.from !== from) continue;
        if (m.flag === F_CASTLE) {
          const hit = this.chess960 ? to === m.rookFrom || (to === m.to && to !== m.from && !legal.some((o) => o !== m && o.from === from && o.to === to && o.flag !== F_CASTLE)) : to === m.to || to === m.rookFrom;
          if (hit) return m;
          continue;
        }
        if (m.to !== to) continue;
        if (m.promo && (promo || Q) !== m.promo) continue;
        return m;
      }
      return null;
    }
    const str = String(input).trim();
    const uci = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/i.exec(str);
    if (uci) return this.findMove({ from: uci[1].toLowerCase(), to: uci[2].toLowerCase(), promotion: uci[3] });
    const want = cleanSan(str).replace(/=/g, '');
    for (const m of legal) {
      const san = cleanSan(sanOf(pos, m, legal)).replace(/=/g, '');
      if (san === want) return m;
    }
    // Lenient: over-disambiguated or promotion without "=" (e.g. "Ngf3", "e8Q").
    for (const m of legal) {
      if (m.flag === F_CASTLE) continue;
      const t = typeOf(m.p);
      const long = (t === P ? '' : PIECE_LETTER[t]) + sqName(m.from) + (m.cap ? 'x' : '') + sqName(m.to) + (m.promo ? PIECE_LETTER[m.promo] : '');
      const alt = long.replace('x', '');
      if (want === long || want === alt) return m;
    }
    return null;
  };

  Game.prototype.move = function (input) {
    const m = this.findMove(input);
    if (!m) return null;
    const legal = this.pos.legalMoves();
    const v = this.verbose(m, legal);
    v.before = this.pos.fen();
    this.pos.make(m);
    v.after = this.pos.fen();
    this.sans.push(v);
    this.keys.push(this.pos.repKey());
    return v;
  };

  Game.prototype.undo = function () {
    if (!this.sans.length) return null;
    this.pos.unmake();
    this.keys.pop();
    return this.sans.pop();
  };

  Game.prototype.history = function (opts) {
    return opts && opts.verbose ? this.sans.slice() : this.sans.map((v) => v.san);
  };

  Game.prototype.isCheck = function () {
    return this.pos.inCheck();
  };
  Game.prototype.inCheck = Game.prototype.isCheck;
  Game.prototype.isCheckmate = function () {
    return this.pos.inCheck() && !this.pos.hasLegalMove();
  };
  Game.prototype.isStalemate = function () {
    return !this.pos.inCheck() && !this.pos.hasLegalMove();
  };
  Game.prototype.isInsufficientMaterial = function () {
    return insufficientMaterial(this.pos.b);
  };
  Game.prototype.repetitionCount = function () {
    const k = this.keys[this.keys.length - 1];
    let n = 0;
    // Repetitions can only happen since the last irreversible move.
    const from = Math.max(0, this.keys.length - 1 - this.pos.half);
    for (let i = from; i < this.keys.length; i++) if (this.keys[i] === k) n++;
    return n;
  };
  Game.prototype.isThreefoldRepetition = function () {
    return this.repetitionCount() >= 3;
  };
  Game.prototype.isDrawByFiftyMoves = function () {
    return this.pos.half >= 100;
  };
  Game.prototype.canMate = function (color) {
    return canMate(this.pos.b, color);
  };

  /** Draw a player may claim now (FIDE 9.2 / 9.3), or null. */
  Game.prototype.claimable = function () {
    if (this.repetitionCount() >= 3) return 'threefold';
    if (this.pos.half >= 100) return 'fifty';
    return null;
  };

  /**
   * Board-determined outcome, or null while the game goes on.
   * autoClaim: treat claimable draws (threefold / 50-move) as automatic.
   */
  Game.prototype.outcome = function (opts) {
    const autoClaim = !!(opts && opts.autoClaim);
    const pos = this.pos;
    const hasMove = pos.hasLegalMove();
    if (!hasMove) {
      if (pos.inCheck()) return { over: true, result: pos.side ? '1-0' : '0-1', reason: 'checkmate', winner: pos.side ? 'w' : 'b' };
      return { over: true, result: '1/2-1/2', reason: 'stalemate', winner: null };
    }
    if (insufficientMaterial(pos.b)) return { over: true, result: '1/2-1/2', reason: 'insufficient', winner: null };
    const reps = this.repetitionCount();
    if (reps >= 5) return { over: true, result: '1/2-1/2', reason: 'fivefold', winner: null };
    if (pos.half >= 150) return { over: true, result: '1/2-1/2', reason: 'seventyfive', winner: null };
    if (autoClaim) {
      if (reps >= 3) return { over: true, result: '1/2-1/2', reason: 'threefold', winner: null };
      if (pos.half >= 100) return { over: true, result: '1/2-1/2', reason: 'fifty', winner: null };
    }
    return null;
  };

  /** FIDE 6.9: flag fall loses unless the opponent cannot mate by any legal sequence. */
  Game.prototype.timeoutOutcome = function (flagged) {
    const other = flagged === 'w' ? 'b' : 'w';
    if (!canMate(this.pos.b, other)) return { over: true, result: '1/2-1/2', reason: 'timeout_insufficient', winner: null };
    return { over: true, result: other === 'w' ? '1-0' : '0-1', reason: 'timeout', winner: other };
  };

  Game.prototype.isGameOver = function () {
    return !!this.outcome();
  };

  /** Captured pieces and material balance (from White's view, pawns = 1). */
  Game.prototype.material = function () {
    const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
    const start = { p: 8, n: 2, b: 2, r: 2, q: 1 };
    const have = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
    for (let s = 0; s < 64; s++) {
      const p = this.pos.b[s];
      if (!p || typeOf(p) === K) continue;
      have[colorOf(p) ? 'b' : 'w'][TYPE_CHARS[typeOf(p)]]++;
    }
    const captured = { w: [], b: [] };
    let score = 0;
    for (const c of ['w', 'b']) {
      for (const t of ['q', 'r', 'b', 'n', 'p']) {
        const lost = Math.max(0, start[t] - have[c][t]);
        for (let i = 0; i < lost; i++) captured[c === 'w' ? 'b' : 'w'].push(t);
        score += (c === 'w' ? 1 : -1) * have[c][t] * VAL[t];
      }
    }
    return { captured, diff: score };
  };

  Game.prototype.pgn = function (headers) {
    const h = Object.assign({}, this.headers, headers || {});
    const std = this.startFen === START_FEN;
    if (!std) {
      h.SetUp = '1';
      h.FEN = this.startFen;
    }
    if (this.chess960) h.Variant = 'Chess960';
    if (!h.Result) {
      const o = this.outcome();
      h.Result = o ? o.result : '*';
    }
    const order = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result'];
    const keys = order.filter((k) => h[k] != null).concat(Object.keys(h).filter((k) => !order.includes(k)));
    const tags = keys.map((k) => `[${k} "${String(h[k]).replace(/"/g, "'")}"]`).join('\n');
    const startBlack = / b /.test(this.startFen);
    let num = parseInt(this.startFen.split(/\s+/)[5], 10) || 1;
    const parts = [];
    this.sans.forEach((v, i) => {
      const white = startBlack ? i % 2 === 1 : i % 2 === 0;
      if (white) parts.push(`${num}. ${v.san}`);
      else {
        if (i === 0) parts.push(`${num}... ${v.san}`);
        else parts.push(v.san);
        num++;
      }
    });
    parts.push(h.Result);
    return `${tags}\n\n${parts.join(' ')}`.trim();
  };

  /** Load PGN movetext (comments, NAGs and variations are skipped). Returns false on an illegal move. */
  Game.prototype.loadPgn = function (text) {
    const src = String(text || '');
    const headers = {};
    src.replace(/\[(\w+)\s+"([^"]*)"\]/g, (_, k, v) => {
      headers[k] = v;
      return '';
    });
    let body = src.replace(/\[[^\]]*\]/g, ' ').replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ');
    let prev;
    do {
      prev = body;
      body = body.replace(/\([^()]*\)/g, ' ');
    } while (body !== prev);
    body = body.replace(/\$\d+/g, ' ').replace(/\d+\.(\.\.)?/g, ' ');
    const chess960 = /960/.test(headers.Variant || '');
    try {
      this.load(headers.FEN || START_FEN, { chess960 });
    } catch (e) {
      return false;
    }
    this.headers = headers;
    const tokens = body.split(/\s+/).filter(Boolean);
    for (const tok of tokens) {
      if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(tok)) break;
      if (!this.move(tok)) return false;
    }
    return true;
  };

  return {
    START_FEN,
    Position,
    Game,
    sqName,
    sqIndex,
    insufficientMaterial,
    canMate,
    chess960Fen,
    sanOf,
    uciOf,
    PIECES: { P, N, B, R, Q, K },
    FLAGS: { F_NORMAL, F_BIG, F_EP, F_CASTLE },
    TYPE_CHARS,
    tables: { KNIGHT_T, KING_T, RAYS },
    colorOf,
    typeOf,
  };
});
