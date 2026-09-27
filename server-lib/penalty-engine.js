/**
 * Penalty Shootout — Live 1v1 (server-resolved). Served by POST /api/media-config
 * { action: 'penalty_kick', op, matchId, ... } (no extra Vercel function).
 *
 * RTDB games/penalty/{matchId}:
 *   pub      — both players read: seats, stake, resolved kicks, who has locked in (never what)
 *   secrets  — secrets/{uid}: only that player's own pending choice (rejoin restores it)
 *   presence — presence/{uid}: client heartbeat { at, online }
 *   server   — no client access: the pending kick + dive until both are in
 *
 * The kicker's aim and the keeper's dive only reach pub after resolveKick() runs, so neither
 * phone can see the other's choice first. Chips / Elo settle here, never from a client claim.
 */
'use strict';

const Core = require('../public/src/js/games/penalty-core.js');

/** Both players choose inside this window; a missing side gets a random choice. */
const KICK_MS = 20000;
/** Reveal animation before the next kick clock starts. */
const ANIM_MS = 4500;
/** Opening grace (kit reveal + first coach). */
const INTRO_MS = 2500;
/** Challenged friend must join within this or the match voids (no chips move). */
const JOIN_MS = 10 * 60 * 1000;
/** Same reconnect window as DangalLive.PRESENCE_FORFEIT_MS. */
const RECONNECT_MS = 90000;
const MAX_STAKE = 500;
const SETTLE_LEASE_MS = 30000;
/** settle_claim / settle_done are internal to maybeSettle — never callable from a phone. */
const CLIENT_OPS = new Set(['join', 'submit', 'tick', 'leave', 'rematch', 'settle']);

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

function other(pub, uid) {
  return uid === pub.playerA ? pub.playerB : pub.playerA;
}
function turnOf(pub) {
  const st = statusOf(pub);
  if (st.over) return null;
  const kicker = st.next === 'A' ? pub.playerA : pub.playerB;
  return { kickNo: pub.kicks.length, kicker, keeper: other(pub, kicker), sudden: st.sudden, round: st.round };
}
function shootoutOf(pub) {
  return {
    bestOf: pub.bestOf,
    kicks: pub.kicks.map((k) => ({ side: k.kicker === pub.playerA ? 'A' : 'B', goal: k.result === 'goal' })),
  };
}
function statusOf(pub) {
  return Core.shootoutStatus(shootoutOf(pub));
}

function newMatch(o) {
  const now = o.now;
  const playerA = o.playerA;
  const playerB = o.playerB;
  const kits = {};
  kits[playerA] = Core.kitById(o.kitA) ? o.kitA : 'crimson';
  kits[playerB] = Core.kitById(o.kitB) && o.kitB !== kits[playerA] ? o.kitB : kits[playerA] === 'royal' ? 'crimson' : 'royal';
  const players = {};
  players[playerA] = true;
  players[playerB] = true;
  const pub = {
    game: 'penalty',
    matchId: o.matchId,
    playerA,
    playerB,
    players,
    names: {},
    kits,
    stake: Math.max(0, Math.min(MAX_STAKE, Math.floor(Number(o.stake) || 0))),
    bestOf: Core.normBestOf(o.bestOf),
    status: 'waiting',
    joined: {},
    kicks: [],
    ready: {},
    turn: null,
    deadline: now + JOIN_MS,
    createdAt: now,
    startedAt: 0,
    winner: null,
    reason: '',
    rematch: {},
    nextMatchId: '',
    rematchOf: o.rematchOf || '',
    settlement: null,
  };
  return { pub, server: { pending: {}, settled: false, settling: 0 }, secrets: {}, presence: {} };
}

/** RTDB drops empty objects / arrays and nulls — restore the shapes the reducer expects. */
function hydrate(m) {
  if (!m || !m.pub) return m;
  const p = m.pub;
  p.players = p.players || {};
  p.names = p.names || {};
  p.kits = p.kits || {};
  p.joined = p.joined || {};
  p.ready = p.ready || {};
  p.rematch = p.rematch || {};
  p.kicks = Array.isArray(p.kicks) ? p.kicks.filter(Boolean) : p.kicks ? Object.values(p.kicks) : [];
  p.kicks.forEach((k) => {
    k.auto = k.auto || {};
  });
  p.turn = p.turn || null;
  p.winner = p.winner || null;
  p.settlement = p.settlement || null;
  m.server = m.server || {};
  m.server.pending = m.server.pending || {};
  m.secrets = m.secrets || {};
  m.presence = m.presence || {};
  return m;
}

function isOpen(pub) {
  return pub.status === 'waiting' || pub.status === 'playing';
}

function finish(m, winner, reason, now) {
  m.pub.status = 'over';
  m.pub.winner = winner;
  m.pub.reason = reason;
  m.pub.turn = null;
  m.pub.ready = {};
  m.pub.deadline = 0;
  m.pub.endedAt = now;
  m.server.pending = {};
  m.secrets = {};
}

function resolvePending(m, now, rng) {
  const pub = m.pub;
  const turn = turnOf(pub);
  const pend = m.server.pending;
  const auto = { kick: !pend.kick, dive: !pend.dive };
  const kick = pend.kick ? Core.normKick(pend.kick) : Core.randomKick(rng);
  const dive = pend.dive ? Core.normDive(pend.dive) : Core.randomDive(rng);
  const seed = Math.floor(rng() * 4294967296) >>> 0;
  const out = Core.resolveKick(kick, dive, seed);
  pub.kicks.push({
    n: turn.kickNo,
    kicker: turn.kicker,
    keeper: turn.keeper,
    kick,
    dive,
    seed,
    result: out.result,
    detail: out.detail,
    ball: out.ball,
    keeperAt: out.keeper,
    panenka: out.panenka,
    auto,
    at: now,
  });
  m.server.pending = {};
  m.secrets = {};
  pub.ready = {};
  const st = statusOf(pub);
  if (st.over) {
    finish(m, st.winner === 'A' ? pub.playerA : pub.playerB, 'shootout', now);
    return { resolved: true, ended: true };
  }
  pub.turn = turnOf(pub);
  pub.deadline = now + ANIM_MS + KICK_MS;
  return { resolved: true };
}

function presenceGone(m, uid, now) {
  const p = m.presence[uid];
  const since = p && Number(p.at) ? Number(p.at) : m.pub.startedAt || m.pub.createdAt;
  return now - since > RECONNECT_MS;
}

/**
 * Pure reducer — (match, uid, op, args) → { match, result }. Throws coded errors.
 * `rng` is only used for timeout fallbacks and the kick seed.
 */
function reduceMatch(current, uid, op, args, now, rng) {
  const a = args || {};
  const matchId = cleanMatchId(a.matchId);

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
        stake: a.stake,
        bestOf: a.bestOf,
        kitA: playerA === uid ? a.kit : '',
        kitB: playerB === uid ? a.kit : '',
        now,
      });
      m.pub.joined[uid] = true;
      m.pub.names[uid] = cleanName(a.name) || 'Player';
      return { match: m, result: { created: true } };
    }
    const m = hydrate(current);
    if (!m.pub.players[uid]) throw err('not_in_match', 'This match is for two other players');
    m.pub.joined[uid] = true;
    if (a.name) m.pub.names[uid] = cleanName(a.name) || m.pub.names[uid] || 'Player';
    if (m.pub.status === 'waiting') {
      // The host's picks win while nobody has kicked (a guest may have created the node first).
      if (uid === m.pub.playerA) {
        if (a.bestOf != null) m.pub.bestOf = Core.normBestOf(a.bestOf);
        if (a.stake != null) m.pub.stake = Math.max(0, Math.min(MAX_STAKE, Math.floor(Number(a.stake) || 0)));
      }
      if (Core.kitById(a.kit) && a.kit !== m.pub.kits[other(m.pub, uid)]) m.pub.kits[uid] = a.kit;
      if (m.pub.joined[m.pub.playerA] && m.pub.joined[m.pub.playerB]) {
        m.pub.status = 'playing';
        m.pub.startedAt = now;
        m.pub.turn = turnOf(m.pub);
        m.pub.deadline = now + INTRO_MS + KICK_MS;
      }
    }
    return { match: m, result: { joined: true } };
  }

  if (!current) throw err('match_not_found', 'Match not found');
  const m = hydrate(current);
  const pub = m.pub;
  if (!pub.players[uid]) throw err('not_in_match', 'This match is for two other players');

  if (op === 'submit') {
    if (pub.status !== 'playing') throw err('not_playing', 'This match isn’t live');
    const turn = turnOf(pub);
    if (Number(a.kickNo) !== turn.kickNo) throw err('stale_kick', 'That kick already happened');
    const role = uid === turn.kicker ? 'kick' : 'dive';
    if (m.server.pending[role]) throw err('already_locked', 'Already locked in');
    const raw = a.choice || {};
    const choice =
      role === 'kick'
        ? Core.isKick(raw) ? Core.normKick(raw) : null
        : Core.isDive(raw) ? Core.normDive(raw) : null;
    if (!choice) throw err('bad_choice', 'Pick a spot first');
    m.server.pending[role] = choice;
    pub.ready[role] = true;
    m.secrets[uid] = { kickNo: turn.kickNo, role, choice };
    if (m.server.pending.kick && m.server.pending.dive) {
      const res = resolvePending(m, now, rng);
      return { match: m, result: Object.assign({ locked: true }, res) };
    }
    return { match: m, result: { locked: true } };
  }

  if (op === 'tick') {
    if (pub.status === 'waiting') {
      if (now >= pub.deadline) {
        pub.status = 'void';
        pub.reason = 'no_show';
        pub.deadline = 0;
        return { match: m, result: { voided: true } };
      }
      return null;
    }
    if (pub.status !== 'playing') return null;
    const opp = other(pub, uid);
    if (presenceGone(m, opp, now) && !presenceGone(m, uid, now)) {
      finish(m, uid, 'disconnect', now);
      return { match: m, result: { ended: true, forfeit: true } };
    }
    if (now >= pub.deadline) {
      const res = resolvePending(m, now, rng);
      return { match: m, result: Object.assign({ timeout: true }, res) };
    }
    return null;
  }

  if (op === 'leave') {
    if (pub.status === 'waiting') {
      pub.status = 'void';
      pub.reason = 'cancelled';
      pub.deadline = 0;
      return { match: m, result: { voided: true } };
    }
    if (pub.status !== 'playing') return null;
    finish(m, other(pub, uid), 'left', now);
    return { match: m, result: { ended: true, forfeit: true } };
  }

  if (op === 'rematch') {
    if (pub.status !== 'over') throw err('not_over', 'Finish this shootout first');
    if (pub.nextMatchId) return { match: m, result: { nextMatchId: pub.nextMatchId } };
    pub.rematch[uid] = true;
    if (pub.rematch[pub.playerA] && pub.rematch[pub.playerB]) {
      const n = (String(pub.matchId).match(/-r(\d+)$/) || [0, 0])[1] | 0;
      pub.nextMatchId = cleanMatchId(String(pub.matchId).replace(/-r\d+$/, '') + '-r' + (n + 1));
      return {
        match: m,
        result: {
          nextMatchId: pub.nextMatchId,
          createNext: {
            matchId: pub.nextMatchId,
            // Whoever kicked second opens the rematch.
            playerA: pub.playerB,
            playerB: pub.playerA,
            stake: pub.stake,
            bestOf: pub.bestOf,
            kitA: pub.kits[pub.playerB],
            kitB: pub.kits[pub.playerA],
            rematchOf: pub.matchId,
          },
        },
      };
    }
    return { match: m, result: { waiting: true } };
  }

  if (op === 'settle') return null;

  if (op === 'settle_claim') {
    if (pub.status !== 'over' || !pub.winner || m.server.settled) return null;
    if (m.server.settling && now - m.server.settling < SETTLE_LEASE_MS) return null;
    m.server.settling = now;
    return { match: m, result: { settleClaim: true } };
  }

  if (op === 'settle_done') {
    m.server.settled = true;
    m.server.settling = 0;
    pub.settlement = a.settlement || null;
    return { match: m, result: { settled: true } };
  }

  throw err('bad_op', 'Unknown match action');
}

/** Achievements the server can prove from the kick log. */
function achievementFlags(pub) {
  const flags = {};
  const add = (uid, key) => {
    (flags[uid] = flags[uid] || []).push(key);
  };
  if (pub.reason === 'shootout' && pub.winner) {
    const conceded = pub.kicks.filter((k) => k.keeper === pub.winner && k.result === 'goal').length;
    if (conceded === 0) add(pub.winner, 'penalty_clean_sheet');
  }
  const seen = {};
  pub.kicks.forEach((k) => {
    if (k.panenka && !seen[k.kicker]) {
      seen[k.kicker] = true;
      add(k.kicker, 'penalty_panenka');
    }
  });
  return flags;
}

/** Chips + Elo through the shared economy, trusted because the server resolved every kick. */
async function settleMatch(adminApp, pub, econ) {
  const e = econ || require('./dangal-economy');
  const winner = pub.winner;
  const loser = other(pub, winner);
  const flags = achievementFlags(pub);
  const payload = await e.resolveGame(
    adminApp.firestore(),
    adminApp,
    winner,
    {
      gameType: 'penalty',
      result: 'win',
      won: true,
      opponentUid: loser,
      winnerUid: winner,
      stake: pub.stake,
      matchId: pub.matchId,
    },
    { trusted: true, flags }
  );
  const side = (p) => ({
    chipDelta: Number(p && p.chipDelta) || 0,
    eloDelta: Number(p && p.eloDelta) || 0,
    achievements: ((p && p.achievements) || []).map((x) => x.key || x),
  });
  const out = {};
  out[winner] = side(payload);
  out[loser] = side(payload && payload.opponent);
  return out;
}

/** Run the reducer against one RTDB node atomically (same cold-cache handling as party rooms). */
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
  if (!tx.committed) throw err('busy', 'Match busy — try again');
  if (!outcome) throw err('match_not_found', 'Match not found');
  return outcome;
}

/**
 * Entry point for the `penalty_kick` action.
 * @param {import('firebase-admin')} adminApp
 */
async function penaltyKick(adminApp, uid, body, deps) {
  const b = body || {};
  const op = String(b.op || '');
  if (!CLIENT_OPS.has(op)) throw err('bad_op', 'Unknown match action');
  const matchId = cleanMatchId(b.matchId);
  if (!matchId) throw err('bad_match', 'Missing match');
  const rtdb = adminApp.database();
  const now = Date.now();
  const path = `games/penalty/${matchId}`;
  const rng = (deps && deps.rng) || Math.random;
  const result = await transactMatch(rtdb, path, (cur) => reduceMatch(cur, uid, op, b, now, rng), {
    allowEmpty: op === 'join',
  });

  if (result.createNext) {
    const c = result.createNext;
    await transactMatch(
      rtdb,
      `games/penalty/${c.matchId}`,
      (cur) => (cur ? null : { match: newMatch(Object.assign({ now }, c)), result: {} }),
      { allowEmpty: true }
    ).catch(() => {});
    delete result.createNext;
  }

  if (result.ended || op === 'settle' || op === 'tick' || op === 'join') {
    await maybeSettle(adminApp, rtdb, path, uid, now, deps).catch((e) => {
      console.warn('[penalty] settle', e && e.message);
    });
  }
  return Object.assign({ matchId, serverNow: now }, result);
}

async function maybeSettle(adminApp, rtdb, path, uid, now, deps) {
  const claim = await transactMatch(rtdb, path, (cur) => reduceMatch(cur, uid, 'settle_claim', {}, now));
  if (!claim.settleClaim) return null;
  const snap = await rtdb.ref(path + '/pub').once('value');
  const pub = hydrate({ pub: snap.val() }).pub;
  const settlement = await settleMatch(adminApp, pub, deps && deps.econ);
  await transactMatch(rtdb, path, (cur) => reduceMatch(cur, uid, 'settle_done', { settlement }, now));
  return settlement;
}

module.exports = {
  KICK_MS,
  ANIM_MS,
  INTRO_MS,
  JOIN_MS,
  RECONNECT_MS,
  newMatch,
  hydrate,
  reduceMatch,
  turnOf,
  statusOf,
  achievementFlags,
  settleMatch,
  penaltyKick,
};
