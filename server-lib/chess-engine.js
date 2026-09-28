/**
 * Chess Live + Daily — server-authoritative. Served by POST /api/media-config
 * { action: 'chess_game', op, matchId, ... } (no extra Vercel function).
 *
 * RTDB games/chess/{matchId}:
 *   players  — { uid: true } (root copy so the generic games rule can read before rules deploy)
 *   pub      — both players read: seats, clocks, moves, offers, result. Server writes only.
 *   spec     — delayed spectator view (SPECTATE_DELAY_PLIES behind while the game is on)
 *   presence — presence/{uid}: client heartbeat { at, online }
 *   server   — no client access: settlement lease, move timings for fair-play logging
 *
 * Every move is validated by ChessCore (FIDE Laws), every clock runs on server time, and
 * chips / ratings settle here through dangal-economy (trusted), never from a client claim.
 */
'use strict';

const crypto = require('crypto');
const Core = require('../public/src/js/games/chess-core.js');
const Policy = require('../public/src/js/dangal/dangal-live-policy.js');

const POLICY = Policy.policyFor('chess');
const JOIN_MS = 10 * 60 * 1000;
/** Each side must make a first move within this or the game is aborted (unrated, no chips). */
const FIRST_MOVE_MS = 30000;
/** Network lag credited back per move, at most. */
const MAX_LAG_MS = 500;
/** One draw offer per player per this many plies (10 moves each). */
const DRAW_OFFER_GAP_PLIES = 20;
const SPECTATE_DELAY_PLIES = 3;
const MAX_STAKE = 500;
const SETTLE_LEASE_MS = 30000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_DAYS = [1, 3];
const MAX_PLIES = 1200;
const CLIENT_OPS = new Set([
  'join',
  'move',
  'tick',
  'claim_draw',
  'offer_draw',
  'respond_draw',
  'resign',
  'abort',
  'rematch',
  'settings',
  'settle',
]);
const SERVER_OPS = new Set(['daily_seek', 'daily_cancel', 'daily_list']);

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}
function cleanMatchId(raw) {
  return String(raw || '')
    .replace(/[^\w.-]/g, '')
    .slice(0, 120);
}
function cleanUid(raw) {
  const s = String(raw || '').trim();
  return /^[\w-]{6,128}$/.test(s) ? s : '';
}
function cleanName(raw) {
  return String(raw || '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 24);
}
function cleanDev(raw) {
  return String(raw || '')
    .replace(/[^\w-]/g, '')
    .slice(0, 64);
}

/** Time control from a request: { base, inc } in ms, or { days } for Daily, or untimed. */
function normTc(raw) {
  const t = raw && typeof raw === 'object' ? raw : {};
  const days = Number(t.days) || 0;
  if (DAILY_DAYS.indexOf(days) >= 0) return { base: 0, inc: 0, days };
  const min = Number(t.minutes != null ? t.minutes : Number(t.base) / 60000);
  const incS = Number(t.increment != null ? t.increment : Number(t.inc) / 1000);
  if (!isFinite(min) || min <= 0) return { base: 0, inc: 0, days: 0 };
  const base = Math.round(Math.max(0.5, Math.min(180, min)) * 60000);
  const inc = Math.round(Math.max(0, Math.min(60, isFinite(incS) ? incS : 0)) * 1000);
  return { base, inc, days: 0 };
}

/** Rating bucket by estimated game length (base + 40 × increment), lichess-style boundaries. */
function bucketOf(tc) {
  if (!tc) return '';
  if (tc.days) return 'daily';
  if (!tc.base) return '';
  const est = tc.base / 1000 + (40 * tc.inc) / 1000;
  if (est < 180) return 'bullet';
  if (est < 480) return 'blitz';
  if (est < 1500) return 'rapid';
  return 'classical';
}

function randInt(n, rng) {
  if (rng) return Math.floor(rng() * n);
  return crypto.randomInt(n);
}

function other(pub, uid) {
  return uid === pub.playerA ? pub.playerB : pub.playerA;
}
function colorOf(pub, uid) {
  return uid === pub.white ? 'w' : uid === pub.black ? 'b' : null;
}
function uidOfColor(pub, c) {
  return c === 'w' ? pub.white : pub.black;
}

function newMatch(o) {
  const now = o.now;
  const players = {};
  players[o.playerA] = true;
  players[o.playerB] = true;
  const chess960 = o.variant === 'chess960';
  const startFen = chess960 ? Core.chess960Fen(randInt(960, o.rng)) : Core.START_FEN;
  const tc = normTc(o.tc);
  const whiteIsA = o.colorA === 'w' ? true : o.colorA === 'b' ? false : randInt(2, o.rng) === 0;
  const pub = {
    game: 'chess',
    protocol: Policy.PROTOCOL,
    matchId: o.matchId,
    playerA: o.playerA,
    playerB: o.playerB,
    white: whiteIsA ? o.playerA : o.playerB,
    black: whiteIsA ? o.playerB : o.playerA,
    players,
    names: {},
    joined: {},
    seats: {},
    autoClaim: {},
    variant: chess960 ? 'chess960' : 'standard',
    startFen,
    fen: startFen,
    moves: [],
    sans: [],
    ply: 0,
    turn: 'w',
    tc,
    bucket: bucketOf(tc),
    rated: !!o.rated && !!bucketOf(tc),
    stake: Math.max(0, Math.min(MAX_STAKE, Math.floor(Number(o.stake) || 0))),
    clock: { w: tc.base, b: tc.base, at: 0, running: false },
    deadline: now + JOIN_MS,
    status: 'waiting',
    check: false,
    lastMove: null,
    claimable: null,
    drawOffer: null,
    lastOfferPly: {},
    result: '',
    winner: null,
    reason: '',
    createdAt: now,
    startedAt: 0,
    endedAt: 0,
    rematch: {},
    nextMatchId: '',
    rematchOf: o.rematchOf || '',
    settlement: null,
    version: 1,
  };
  return { players, pub, spec: specView(pub), presence: {}, server: { settled: false, settling: 0, times: {} } };
}

function hydrate(m) {
  if (!m || !m.pub) return m;
  const p = m.pub;
  const arr = (v) => (Array.isArray(v) ? v.filter((x) => x != null) : v ? Object.keys(v).sort((a, b) => a - b).map((k) => v[k]) : []);
  p.players = p.players || {};
  p.names = p.names || {};
  p.joined = p.joined || {};
  p.seats = p.seats || {};
  p.autoClaim = p.autoClaim || {};
  p.moves = arr(p.moves);
  p.sans = arr(p.sans);
  p.lastOfferPly = p.lastOfferPly || {};
  p.rematch = p.rematch || {};
  p.tc = p.tc || { base: 0, inc: 0, days: 0 };
  p.clock = p.clock || { w: 0, b: 0, at: 0, running: false };
  p.drawOffer = p.drawOffer || null;
  p.claimable = p.claimable || null;
  p.lastMove = p.lastMove || null;
  p.winner = p.winner || null;
  p.settlement = p.settlement || null;
  m.players = m.players || p.players;
  m.presence = m.presence || {};
  m.server = m.server || {};
  m.server.times = m.server.times || {};
  Object.keys(m.server.times).forEach((u) => (m.server.times[u] = arr(m.server.times[u])));
  return m;
}

/** Rebuild the game from the move list (the server never trusts a client FEN). */
function gameOf(pub) {
  const g = new Core.Game({ fen: pub.startFen, chess960: pub.variant === 'chess960' });
  for (const u of pub.moves) {
    if (!g.move(u)) throw err('corrupt', 'Match state is inconsistent');
  }
  return g;
}

function specView(pub) {
  const live = pub.status === 'playing' || pub.status === 'waiting';
  const shown = live ? Math.max(0, pub.moves.length - SPECTATE_DELAY_PLIES) : pub.moves.length;
  return {
    white: pub.white,
    black: pub.black,
    names: pub.names || {},
    variant: pub.variant,
    startFen: pub.startFen,
    moves: pub.moves.slice(0, shown),
    tc: pub.tc,
    status: pub.status,
    result: live ? '' : pub.result || '',
    reason: live ? '' : pub.reason || '',
    delayPlies: live ? SPECTATE_DELAY_PLIES : 0,
  };
}

function isOpen(pub) {
  return pub.status === 'waiting' || pub.status === 'playing';
}

function remaining(pub, color, now) {
  const c = pub.clock;
  let ms = Number(c[color]) || 0;
  if (c.running && pub.turn === color) ms -= Math.max(0, now - (Number(c.at) || now));
  return ms;
}

function finish(m, outcome, now) {
  const pub = m.pub;
  pub.status = 'over';
  pub.result = outcome.result;
  pub.reason = outcome.reason;
  pub.winner = outcome.winner ? uidOfColor(pub, outcome.winner) : null;
  pub.endedAt = now;
  pub.clock.running = false;
  pub.drawOffer = null;
  pub.claimable = null;
  pub.deadline = 0;
}

function abort(m, reason, now) {
  const pub = m.pub;
  pub.status = 'aborted';
  pub.reason = reason;
  pub.result = '*';
  pub.winner = null;
  pub.endedAt = now;
  pub.clock.running = false;
  pub.drawOffer = null;
  pub.deadline = 0;
}

function anyAutoClaim(pub) {
  return !!(pub.autoClaim[pub.white] || pub.autoClaim[pub.black]);
}

/** Flag / first-move / Daily deadline / abandonment checks. Returns true when state changed. */
function checkClocks(m, now, uid) {
  const pub = m.pub;
  if (pub.status === 'waiting') {
    if (now >= pub.deadline) {
      pub.status = 'void';
      pub.reason = 'no_show';
      pub.deadline = 0;
      return true;
    }
    return false;
  }
  if (pub.status !== 'playing') return false;
  if (pub.tc.days) {
    if (pub.deadline && now >= pub.deadline) {
      const g = gameOf(pub);
      if (pub.ply < 2) abort(m, 'no_first_move', now);
      else finish(m, g.timeoutOutcome(pub.turn), now);
      return true;
    }
    return false;
  }
  if (pub.ply < 2 && pub.deadline && now >= pub.deadline) {
    abort(m, 'no_first_move', now);
    return true;
  }
  if (pub.clock.running && remaining(pub, pub.turn, now) <= 0) {
    const g = gameOf(pub);
    pub.clock[pub.turn] = 0;
    finish(m, g.timeoutOutcome(pub.turn), now);
    return true;
  }
  if (uid) {
    const opp = other(pub, uid);
    const oppGone = Policy.reconnectStatus(m.presence[opp], now, POLICY).expired;
    const meHere = !Policy.reconnectStatus(m.presence[uid], now, POLICY).expired;
    if (oppGone && meHere) {
      if (pub.ply < 2) {
        abort(m, 'opponent_left', now);
        return true;
      }
      const out = Policy.abandonOutcome([pub.white, pub.black], [opp], POLICY);
      const g = gameOf(pub);
      const myColor = colorOf(pub, uid);
      // FIDE 6.9 spirit: a win needs material that could still mate.
      if (!g.canMate(myColor)) finish(m, { result: '1/2-1/2', reason: 'abandoned_insufficient', winner: null }, now);
      else finish(m, { result: myColor === 'w' ? '1-0' : '0-1', reason: 'abandoned', winner: myColor }, now);
      pub.abandonedBy = out.loser || opp;
      return true;
    }
  }
  return false;
}

function touchSeat(pub, uid, dev, now) {
  if (!dev) return { role: 'player' };
  const claim = Policy.claimSeat(pub.seats[uid], dev, now, POLICY);
  if (claim.role === 'player') pub.seats[uid] = claim.seat;
  return claim;
}

function bump(m) {
  m.pub.version = (Number(m.pub.version) || 0) + 1;
  m.spec = specView(m.pub);
  return m;
}

/**
 * Pure reducer — (match, uid, op, args, now, deps) → { match, result } | null (no-op). Throws coded errors.
 */
function reduceMatch(current, uid, op, args, now, deps) {
  const a = args || {};
  const rng = deps && deps.rng;
  const matchId = cleanMatchId(a.matchId);
  const dev = cleanDev(a.deviceId);

  if (op === 'join') {
    if (!current) {
      const opp = cleanUid(a.opponentUid);
      if (!opp || opp === uid) throw err('bad_opponent', 'Pick a real opponent');
      const hostA = cleanUid(a.playerA);
      const playerA = hostA === opp ? opp : uid;
      const playerB = playerA === uid ? opp : uid;
      const m = newMatch({
        matchId,
        playerA,
        playerB,
        tc: a.tc,
        variant: a.variant,
        rated: a.rated === true || /_mm_/.test(matchId),
        stake: a.stake,
        colorA: playerA === uid ? a.color : '',
        now,
        rng,
      });
      m.pub.joined[uid] = true;
      m.pub.names[uid] = cleanName(a.name) || 'Player';
      m.pub.autoClaim[uid] = a.autoClaim !== false;
      touchSeat(m.pub, uid, dev, now);
      m.presence[uid] = { at: now, online: true };
      return { match: bump(m), result: { created: true, role: 'player' } };
    }
    const m = hydrate(current);
    const pub = m.pub;
    if (!pub.players[uid]) {
      throw err('not_in_match', 'This game is for two other players');
    }
    if (a.name) pub.names[uid] = cleanName(a.name) || pub.names[uid] || 'Player';
    if (a.autoClaim != null || pub.autoClaim[uid] == null) pub.autoClaim[uid] = a.autoClaim !== false;
    const seat = touchSeat(pub, uid, dev, now);
    if (seat.role === 'spectator') return { match: bump(m), result: { role: 'spectator' } };
    m.presence[uid] = { at: now, online: true };
    pub.joined[uid] = true;
    if (pub.status === 'waiting') {
      if (uid === pub.playerA && pub.ply === 0) {
        if (a.tc) {
          pub.tc = normTc(a.tc);
          pub.bucket = bucketOf(pub.tc);
          pub.clock = { w: pub.tc.base, b: pub.tc.base, at: 0, running: false };
        }
        if (a.rated != null) pub.rated = (a.rated === true || /_mm_/.test(pub.matchId)) && !!pub.bucket;
        if (a.stake != null) pub.stake = Math.max(0, Math.min(MAX_STAKE, Math.floor(Number(a.stake) || 0)));
      }
      if (pub.joined[pub.playerA] && pub.joined[pub.playerB]) {
        pub.status = 'playing';
        pub.startedAt = now;
        pub.clock.at = now;
        pub.deadline = pub.tc.days ? now + pub.tc.days * DAY_MS : now + FIRST_MOVE_MS;
        return { match: bump(m), result: { started: true, role: 'player', daily: !!pub.tc.days } };
      }
    }
    checkClocks(m, now, uid);
    return { match: bump(m), result: { joined: true, role: 'player' } };
  }

  if (!current) throw err('match_not_found', 'Game not found');
  const m = hydrate(current);
  const pub = m.pub;
  if (!pub.players[uid]) throw err('not_in_match', 'This game is for two other players');
  const seatOwner = !dev || !pub.seats[uid] || !pub.seats[uid].dev || pub.seats[uid].dev === dev;

  if (op === 'tick') {
    if (seatOwner && dev && pub.seats[uid]) pub.seats[uid].at = now;
    if (checkClocks(m, now, uid)) return { match: bump(m), result: { ended: pub.status !== 'playing' } };
    if (seatOwner && dev) return { match: m, result: {} };
    return null;
  }

  if (op === 'settings') {
    if (a.autoClaim != null) pub.autoClaim[uid] = a.autoClaim !== false;
    return { match: bump(m), result: { ok: true } };
  }

  if (op === 'move') {
    if (!seatOwner) throw err('other_device', 'This game is open on another device');
    if (checkClocks(m, now, uid)) return { match: bump(m), result: { ended: true, rejected: true } };
    if (pub.status !== 'playing') throw err('not_playing', 'This game isn’t live');
    const color = colorOf(pub, uid);
    if (color !== pub.turn) throw err('not_your_turn', 'Wait for your opponent’s move');
    if (a.ply != null && Number(a.ply) !== pub.ply) throw err('stale_move', 'The board moved on — refreshing');
    if (pub.ply >= MAX_PLIES) throw err('too_long', 'Game too long');
    const g = gameOf(pub);
    const input = a.move && typeof a.move === 'object' ? { from: String(a.move.from || ''), to: String(a.move.to || ''), promotion: a.move.promotion ? String(a.move.promotion) : undefined } : String(a.move || '').slice(0, 12);
    const mv = g.move(input);
    if (!mv) throw err('illegal_move', 'That move isn’t legal');
    // Clock: charge the mover (minus bounded lag), then add the Fischer increment.
    const running = pub.clock.running;
    const spent = running ? Math.max(0, now - (Number(pub.clock.at) || now) - Math.max(0, Math.min(MAX_LAG_MS, Number(a.lagMs) || 0))) : 0;
    if (!pub.tc.days && pub.tc.base) {
      if (running) {
        pub.clock[color] = Math.max(0, (Number(pub.clock[color]) || 0) - spent) + pub.tc.inc;
      }
    }
    (m.server.times[uid] = m.server.times[uid] || []).push(Math.round(now - (Number(pub.clock.at) || now)));
    pub.moves.push(mv.lan);
    pub.sans.push(mv.san);
    pub.ply = pub.moves.length;
    pub.turn = g.turn();
    pub.fen = g.fen();
    pub.check = g.isCheck();
    pub.lastMove = { from: mv.from, to: mv.to, san: mv.san, uci: mv.lan, by: uid, at: now };
    pub.clock.at = now;
    if (pub.tc.base && !pub.tc.days) pub.clock.running = pub.ply >= 2;
    if (pub.drawOffer && pub.drawOffer.by !== uid) pub.drawOffer = null;
    if (pub.tc.days) pub.deadline = now + pub.tc.days * DAY_MS;
    else if (pub.ply < 2) pub.deadline = now + FIRST_MOVE_MS;
    else pub.deadline = 0;
    const out = g.outcome({ autoClaim: anyAutoClaim(pub) });
    pub.claimable = out ? null : g.claimable();
    if (out) finish(m, out, now);
    const res = { moved: true, san: mv.san, ply: pub.ply, ended: pub.status !== 'playing' };
    if (pub.tc.days) {
      res.daily = { turnUid: pub.status === 'playing' ? uidOfColor(pub, pub.turn) : null, deadline: pub.deadline, status: pub.status };
      if (pub.status === 'playing') res.notify = { to: other(pub, uid), from: uid, name: pub.names[uid] || 'Your opponent', san: mv.san };
    }
    return { match: bump(m), result: res };
  }

  if (op === 'claim_draw') {
    if (pub.status !== 'playing') throw err('not_playing', 'This game isn’t live');
    const g = gameOf(pub);
    const why = g.claimable();
    if (!why) throw err('no_claim', 'No draw to claim in this position');
    finish(m, { result: '1/2-1/2', reason: why, winner: null }, now);
    return { match: bump(m), result: { ended: true, reason: why } };
  }

  if (op === 'offer_draw') {
    if (pub.status !== 'playing') throw err('not_playing', 'This game isn’t live');
    if (pub.drawOffer) {
      if (pub.drawOffer.by === uid) return null;
      // Offering while the opponent's offer stands = accepting it.
      finish(m, { result: '1/2-1/2', reason: 'agreement', winner: null }, now);
      return { match: bump(m), result: { ended: true, reason: 'agreement' } };
    }
    const last = pub.lastOfferPly[uid];
    if (last != null && pub.ply - Number(last) < DRAW_OFFER_GAP_PLIES) throw err('offer_limit', 'You can offer a draw again in a few moves');
    pub.drawOffer = { by: uid, ply: pub.ply, at: now };
    pub.lastOfferPly[uid] = pub.ply;
    return { match: bump(m), result: { offered: true } };
  }

  if (op === 'respond_draw') {
    if (pub.status !== 'playing') throw err('not_playing', 'This game isn’t live');
    if (!pub.drawOffer || pub.drawOffer.by === uid) return null;
    if (a.accept === true) {
      finish(m, { result: '1/2-1/2', reason: 'agreement', winner: null }, now);
      return { match: bump(m), result: { ended: true, reason: 'agreement' } };
    }
    pub.drawOffer = null;
    return { match: bump(m), result: { declined: true } };
  }

  if (op === 'resign') {
    if (pub.status === 'waiting') {
      pub.status = 'void';
      pub.reason = 'cancelled';
      pub.deadline = 0;
      return { match: bump(m), result: { voided: true } };
    }
    if (pub.status !== 'playing') return null;
    const oppColor = colorOf(pub, uid) === 'w' ? 'b' : 'w';
    finish(m, { result: oppColor === 'w' ? '1-0' : '0-1', reason: 'resignation', winner: oppColor }, now);
    return { match: bump(m), result: { ended: true } };
  }

  if (op === 'abort') {
    if (pub.status === 'waiting') {
      pub.status = 'void';
      pub.reason = 'cancelled';
      pub.deadline = 0;
      return { match: bump(m), result: { voided: true } };
    }
    if (pub.status !== 'playing') return null;
    const color = colorOf(pub, uid);
    const myMoves = color === 'w' ? Math.ceil(pub.ply / 2) : Math.floor(pub.ply / 2);
    if (myMoves > 0) throw err('cannot_abort', 'You can only abort before your first move');
    abort(m, 'aborted', now);
    pub.abortedBy = uid;
    return { match: bump(m), result: { aborted: true } };
  }

  if (op === 'rematch') {
    if (pub.status !== 'over' && pub.status !== 'aborted') throw err('not_over', 'Finish this game first');
    if (pub.nextMatchId) return { match: m, result: { nextMatchId: pub.nextMatchId } };
    pub.rematch[uid] = true;
    if (pub.rematch[pub.playerA] && pub.rematch[pub.playerB]) {
      const n = (String(pub.matchId).match(/-r(\d+)$/) || [0, 0])[1] | 0;
      pub.nextMatchId = cleanMatchId(String(pub.matchId).replace(/-r\d+$/, '') + '-r' + (n + 1));
      const [nextWhite] = Policy.rematchSeats([pub.white, pub.black], POLICY);
      return {
        match: bump(m),
        result: {
          nextMatchId: pub.nextMatchId,
          createNext: {
            matchId: pub.nextMatchId,
            playerA: pub.playerA,
            playerB: pub.playerB,
            colorA: nextWhite === pub.playerA ? 'w' : 'b',
            tc: pub.tc.days ? { days: pub.tc.days } : { base: pub.tc.base, inc: pub.tc.inc },
            variant: pub.variant,
            rated: pub.rated,
            stake: pub.stake,
            names: pub.names,
            autoClaim: pub.autoClaim,
            rematchOf: pub.matchId,
          },
        },
      };
    }
    return { match: bump(m), result: { waiting: true } };
  }

  if (op === 'settle') return null;

  if (op === 'settle_claim') {
    if (pub.status !== 'over' || m.server.settled) return null;
    if (m.server.settling && now - m.server.settling < SETTLE_LEASE_MS) return null;
    m.server.settling = now;
    return { match: m, result: { settleClaim: true } };
  }

  if (op === 'settle_done') {
    m.server.settled = true;
    m.server.settling = 0;
    pub.settlement = a.settlement || null;
    return { match: bump(m), result: { settled: true } };
  }

  throw err('bad_op', 'Unknown game action');
}

async function transactMatch(rtdb, path, fn, { allowEmpty = false } = {}) {
  let outcome = null;
  let failure = null;
  let noop = false;
  const tx = await rtdb.ref(path).transaction((current) => {
    failure = null;
    outcome = null;
    noop = false;
    if (current == null && !allowEmpty) return null;
    try {
      const next = fn(current == null ? null : current);
      if (!next) {
        noop = true;
        return undefined;
      }
      outcome = next.result || {};
      return next.match;
    } catch (e) {
      failure = e;
      return undefined;
    }
  });
  if (failure) throw failure;
  if (noop) return { noop: true };
  if (!tx.committed) throw err('busy', 'Game busy — try again');
  if (!outcome) throw err('match_not_found', 'Game not found');
  return outcome;
}

/** Chips + rating (per time-control bucket) through the shared economy, trusted. */
async function settleMatch(adminApp, pub, econ) {
  const e = econ || require('./dangal-economy');
  const draw = !pub.winner;
  const reporter = draw ? pub.white : pub.winner;
  const opp = other(pub, reporter);
  const payload = await e.resolveGame(
    adminApp.firestore(),
    adminApp,
    reporter,
    {
      gameType: 'chess',
      result: draw ? 'draw' : 'win',
      won: !draw,
      isDraw: draw,
      opponentUid: opp,
      winnerUid: draw ? '' : reporter,
      stake: pub.stake,
      matchId: pub.matchId,
      rated: !!pub.rated,
    },
    { trusted: true, ratingBucket: pub.rated ? pub.bucket : '' }
  );
  const side = (p) => ({
    chipDelta: Number(p && p.chipDelta) || 0,
    eloDelta: Number(p && p.eloDelta) || 0,
    achievements: ((p && p.achievements) || []).map((x) => x.key || x),
  });
  const out = { bucket: pub.rated ? pub.bucket : '', rated: !!(payload && payload.rated) };
  out[reporter] = side(payload);
  out[opp] = side(payload && payload.opponent);
  return out;
}

/**
 * Light fair-play log for rated games: how often each side matched the engine's first choice
 * (time-budgeted shallow search) plus move-time stats. Logged only — no automated action.
 */
function fairPlayReport(pub, times, opts) {
  const o = opts || {};
  const Search = require('../public/src/js/games/chess-search.js');
  const budgetMs = o.budgetMs || 2500;
  const g = new Core.Game({ fen: pub.startFen, chess960: pub.variant === 'chess960' });
  const s = new Search.Searcher({ ttBits: 16 });
  const tally = { w: { match: 0, n: 0 }, b: { match: 0, n: 0 } };
  const started = Date.now();
  const skipOpening = 16;
  pub.moves.forEach((u, i) => {
    const color = g.turn();
    if (i >= skipOpening && Date.now() - started < budgetMs && !g.outcome()) {
      const r = s.search(g.pos, { depth: 5, timeMs: 60 });
      if (r.move) {
        tally[color].n++;
        if (Core.uciOf(g.pos, r.move) === u) tally[color].match++;
      }
    }
    g.move(u);
  });
  const stats = (uid, c) => {
    const t = (times && times[uid]) || [];
    const avg = t.length ? Math.round(t.reduce((x, y) => x + y, 0) / t.length) : 0;
    const sd = t.length ? Math.round(Math.sqrt(t.reduce((x, y) => x + (y - avg) * (y - avg), 0) / t.length)) : 0;
    return { uid, engineMatch: tally[c].n ? Math.round((tally[c].match / tally[c].n) * 1000) / 1000 : null, sampled: tally[c].n, avgMoveMs: avg, sdMoveMs: sd };
  };
  return { white: stats(pub.white, 'w'), black: stats(pub.black, 'b'), plies: pub.moves.length, bucket: pub.bucket };
}

async function maybeSettle(adminApp, rtdb, path, uid, now, deps) {
  const claim = await transactMatch(rtdb, path, (cur) => reduceMatch(cur, uid, 'settle_claim', {}, now, deps));
  if (!claim.settleClaim) return null;
  const snap = await rtdb.ref(path).once('value');
  const m = hydrate(snap.val());
  const pub = m.pub;
  const settlement = await settleMatch(adminApp, pub, deps && deps.econ);
  await transactMatch(rtdb, path, (cur) => reduceMatch(cur, uid, 'settle_done', { settlement }, now, deps));
  if (pub.rated && !(deps && deps.skipFairPlay)) {
    try {
      const report = fairPlayReport(pub, m.server.times);
      await adminApp
        .firestore()
        .collection('chessFairPlay')
        .doc(pub.matchId)
        .set(Object.assign({ matchId: pub.matchId, at: now, result: pub.result, reason: pub.reason }, report));
    } catch (e) {
      console.warn('[chess] fairplay', e && e.message);
    }
  }
  return settlement;
}

async function writeDaily(adminApp, pub, daily) {
  try {
    await adminApp
      .firestore()
      .collection('chessDaily')
      .doc(pub.matchId)
      .set(
        {
          matchId: pub.matchId,
          players: [pub.white, pub.black],
          white: pub.white,
          black: pub.black,
          names: pub.names || {},
          days: pub.tc.days,
          turnUid: daily.turnUid || null,
          deadline: daily.deadline || 0,
          status: daily.status,
          updatedAt: Date.now(),
        },
        { merge: true }
      );
  } catch (e) {
    console.warn('[chess] daily index', e && e.message);
  }
}

async function notifyMove(adminApp, pub, n) {
  try {
    const { upsertNotification } = require('./notifications');
    await upsertNotification(adminApp, n.to, {
      type: 'dangal_chess_move',
      refId: pub.matchId,
      actor: { uid: n.from, name: n.name },
      preview: `Your move in Daily chess (${n.name} played ${n.san})`,
      deepLink: { section: 'dangal', path: `/?section=dangal&chess=${encodeURIComponent(pub.matchId)}` },
    });
  } catch (e) {
    console.warn('[chess] notify', e && e.message);
  }
}

/** Daily matchmaking: one open seek per speed in Firestore, paired atomically. */
async function dailySeek(adminApp, uid, body, now, rng) {
  const db = adminApp.firestore();
  const days = DAILY_DAYS.indexOf(Number(body.days)) >= 0 ? Number(body.days) : 1;
  const ref = db.collection('chessDailySeeks').doc('d' + days);
  const name = cleanName(body.name) || 'Player';
  const paired = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const seek = snap.exists ? snap.data() : null;
    if (seek && seek.uid && seek.uid !== uid && now - (Number(seek.at) || 0) < 7 * DAY_MS) {
      tx.delete(ref);
      return seek;
    }
    tx.set(ref, { uid, name, at: now, days });
    return null;
  });
  if (!paired) return { waiting: true, days };
  const matchId = cleanMatchId(`cd_mm_${now.toString(36)}_${randInt(1e9, rng).toString(36)}`);
  const m = newMatch({ matchId, playerA: paired.uid, playerB: uid, tc: { days }, variant: 'standard', rated: true, now, rng });
  m.pub.names[paired.uid] = cleanName(paired.name) || 'Player';
  m.pub.names[uid] = name;
  m.pub.joined[paired.uid] = true;
  m.pub.joined[uid] = true;
  m.pub.status = 'playing';
  m.pub.startedAt = now;
  m.pub.clock.at = now;
  m.pub.deadline = now + days * DAY_MS;
  bump(m);
  await adminApp.database().ref(`games/chess/${matchId}`).set(m);
  await writeDaily(adminApp, m.pub, { turnUid: m.pub.white, deadline: m.pub.deadline, status: 'playing' });
  const whiteUid = m.pub.white;
  const blackUid = m.pub.black;
  await notifyMove(adminApp, m.pub, { to: whiteUid, from: blackUid, name: m.pub.names[blackUid] || 'Your opponent', san: 'a new Daily game' });
  return { matched: true, matchId, days };
}

async function dailyList(adminApp, uid) {
  const db = adminApp.firestore();
  const snap = await db.collection('chessDaily').where('players', 'array-contains', uid).limit(40).get();
  const games = snap.docs
    .map((d) => d.data())
    .filter((g) => g.status === 'playing')
    .map((g) => ({ matchId: g.matchId, white: g.white, black: g.black, names: g.names || {}, days: g.days, myTurn: g.turnUid === uid, deadline: g.deadline }))
    .sort((x, y) => Number(y.myTurn) - Number(x.myTurn) || x.deadline - y.deadline);
  const seeks = [];
  for (const days of DAILY_DAYS) {
    const s = await db.collection('chessDailySeeks').doc('d' + days).get();
    if (s.exists && s.data().uid === uid) seeks.push(days);
  }
  return { games, seeks };
}

/** Scheduler sweep: time out Daily games whose move deadline passed. */
async function sweepDailyGames(adminApp, opts) {
  if (!adminApp) return { skipped: true };
  const now = (opts && opts.now) || Date.now();
  const db = adminApp.firestore();
  const snap = await db.collection('chessDaily').where('deadline', '<=', now).limit((opts && opts.limit) || 50).get();
  let timedOut = 0;
  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.status !== 'playing' || !d.turnUid) continue;
    try {
      const out = await chessGame(adminApp, d.turnUid, { op: 'tick', matchId: d.matchId }, { now });
      if (out && out.ended) timedOut++;
    } catch (e) {}
  }
  return { checked: snap.size, timedOut };
}

/**
 * Entry point for the `chess_game` action.
 * @param {import('firebase-admin')} adminApp
 */
async function chessGame(adminApp, uid, body, deps) {
  const b = body || {};
  const op = String(b.op || '');
  const now = (deps && deps.now) || Date.now();
  const rng = deps && deps.rng;
  if (SERVER_OPS.has(op)) {
    if (op === 'daily_seek') return dailySeek(adminApp, uid, b, now, rng);
    if (op === 'daily_list') return dailyList(adminApp, uid);
    if (op === 'daily_cancel') {
      const db = adminApp.firestore();
      for (const days of DAILY_DAYS) {
        const ref = db.collection('chessDailySeeks').doc('d' + days);
        await db.runTransaction(async (tx) => {
          const s = await tx.get(ref);
          if (s.exists && s.data().uid === uid) tx.delete(ref);
        });
      }
      return { cancelled: true };
    }
  }
  if (!CLIENT_OPS.has(op)) throw err('bad_op', 'Unknown game action');
  const matchId = cleanMatchId(b.matchId);
  if (!matchId) throw err('bad_match', 'Missing game');
  const rtdb = adminApp.database();
  const path = `games/chess/${matchId}`;
  const result = await transactMatch(rtdb, path, (cur) => reduceMatch(cur, uid, op, b, now, { rng }), {
    allowEmpty: op === 'join',
  });

  if (result.createNext) {
    const c = result.createNext;
    await transactMatch(
      rtdb,
      `games/chess/${c.matchId}`,
      (cur) => {
        if (cur) return null;
        const m = newMatch(Object.assign({ now, rng }, c));
        m.pub.names = Object.assign({}, c.names || {});
        m.pub.autoClaim = Object.assign({}, c.autoClaim || {});
        return { match: m, result: {} };
      },
      { allowEmpty: true }
    ).catch(() => {});
    delete result.createNext;
  }

  if (result.daily || result.started || result.ended || result.aborted || result.voided) {
    const pub = hydrate((await rtdb.ref(path).once('value')).val()).pub;
    if (pub.tc.days) {
      const playing = pub.status === 'playing';
      await writeDaily(adminApp, pub, { turnUid: playing ? uidOfColor(pub, pub.turn) : null, deadline: playing ? pub.deadline : 0, status: pub.status });
      if (result.notify) await notifyMove(adminApp, pub, result.notify);
    }
  }
  delete result.notify;

  if (result.ended || op === 'settle' || op === 'tick' || op === 'join') {
    await maybeSettle(adminApp, rtdb, path, uid, now, deps).catch((e) => {
      console.warn('[chess] settle', e && e.message);
    });
  }
  return Object.assign({ matchId, serverNow: now }, result);
}

module.exports = {
  JOIN_MS,
  FIRST_MOVE_MS,
  MAX_LAG_MS,
  DRAW_OFFER_GAP_PLIES,
  SPECTATE_DELAY_PLIES,
  DAILY_DAYS,
  CLIENT_OPS,
  normTc,
  bucketOf,
  newMatch,
  hydrate,
  gameOf,
  specView,
  remaining,
  reduceMatch,
  settleMatch,
  fairPlayReport,
  sweepDailyGames,
  chessGame,
};
