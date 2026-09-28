/**
 * Street Cricket — Live 1v1 (server-resolved). Served by POST /api/media-config
 * { action: 'cricket_match', op, matchId, ... } (no extra Vercel function).
 *
 * RTDB games/cricket/{matchId}:
 *   pub      — both players read: seats, settings, the ball-by-ball log, the ball in flight
 *   presence — presence/{uid}: client heartbeat { at, online }
 *   server   — no client access: settle lease
 *
 * Flow per ball: the bowler submits a delivery → the server stamps a release time (startAt) a
 * little in the future so both phones start the run-up together → the batter submits shot + the
 * tap time relative to startAt (server clock) → the server clamps that tap to what could really
 * have happened given when the request arrived, classifies the timing, rolls the outcome with its
 * own seed and appends the event. A phone never sends runs or a dismissal; both render the log.
 */
'use strict';

const CE = require('../public/src/js/games/cricket-engine.js');
const Policy = require('../public/src/js/dangal/dangal-live-policy.js');

const POLICY = Policy.policyFor('streetcricket');
/** Bowler picks a delivery inside this window, or the server bowls for them. */
const BOWL_MS = POLICY.turnMs || 12000;
/** Release lead: both phones get the ball before its run-up starts. */
const LEAD_MS = 900;
/** After the ball passes the stumps, a missing hit is a miss. Covers network lag. */
const GRACE_MS = 1500;
/** A tap may be at most this old when it reaches the server (RTT compensation cap). */
const MAX_LAG_MS = 1500;
/** Result flash before the bowler's clock runs again. */
const RESULT_MS = 2200;
/** Innings break / Super Over call. */
const BREAK_MS = 5000;
const INTRO_MS = 2500;
const JOIN_MS = 10 * 60 * 1000;
const RECONNECT_MS = POLICY.reconnectMs;
const MAX_STAKE = 500;
const SETTLE_LEASE_MS = 30000;
/** settle_claim / settle_done are internal to maybeSettle — never callable from a phone. */
const CLIENT_OPS = new Set(['join', 'bowl', 'hit', 'tick', 'leave', 'rematch', 'settle']);

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
function cleanToggles(raw) {
  const out = {};
  const t = raw && typeof raw === 'object' ? raw : {};
  ['sixOut', 'lastManStands', 'tipAndRun', 'bounceCatch'].forEach((k) => {
    if (t[k] != null) out[k] = !!t[k];
  });
  return out;
}

function other(pub, uid) {
  return uid === pub.playerA ? pub.playerB : pub.playerA;
}

function applySettings(pub, a) {
  if (a.format != null) pub.format = CE.normFormat(a.format);
  if (a.preset != null) pub.preset = CE.normPreset(a.preset);
  if (a.toggles != null) pub.toggles = cleanToggles(a.toggles);
  if (a.tie != null) pub.tie = CE.normTie(a.tie);
  if (a.stake != null) pub.stake = Math.max(0, Math.min(MAX_STAKE, Math.floor(Number(a.stake) || 0)));
  pub.rated = !!CE.PRESETS[pub.preset].rated;
}

function newMatch(o) {
  const now = o.now;
  const players = {};
  players[o.playerA] = true;
  players[o.playerB] = true;
  const pub = {
    game: 'streetcricket',
    matchId: o.matchId,
    playerA: o.playerA,
    playerB: o.playerB,
    players,
    names: Object.assign({}, o.names || {}),
    format: 'standard',
    preset: 'standard',
    toggles: {},
    tie: 'superover',
    rated: true,
    stake: 0,
    status: 'waiting',
    joined: {},
    toss: null,
    log: [],
    phase: '',
    ball: null,
    deadline: now + JOIN_MS,
    misses: {},
    createdAt: now,
    startedAt: 0,
    endedAt: 0,
    winner: null,
    draw: false,
    reason: '',
    result: '',
    rematch: {},
    nextMatchId: '',
    rematchOf: o.rematchOf || '',
    settlement: null,
  };
  applySettings(pub, o);
  return { pub, server: { settled: false, settling: 0 }, presence: {} };
}

/** RTDB drops empty objects / arrays and nulls — restore the shapes the reducer expects. */
function hydrate(m) {
  if (!m || !m.pub) return m;
  const p = m.pub;
  p.players = p.players || {};
  p.names = p.names || {};
  p.joined = p.joined || {};
  p.toggles = p.toggles || {};
  p.misses = p.misses || {};
  p.rematch = p.rematch || {};
  p.log = Array.isArray(p.log) ? p.log.filter(Boolean) : p.log ? Object.keys(p.log).sort((x, y) => x - y).map((k) => p.log[k]) : [];
  p.log.forEach((e) => {
    e.extra = e.extra || '';
    e.out = e.out || '';
    e.runs = e.runs || 0;
  });
  p.ball = p.ball || null;
  p.toss = p.toss || null;
  p.winner = p.winner || null;
  p.settlement = p.settlement || null;
  m.server = m.server || {};
  m.presence = m.presence || {};
  return m;
}

/** Engine config for this match: side 0 = playerA, side 1 = playerB. */
function configOf(pub) {
  return CE.liveConfig(pub);
}
function stateOf(pub) {
  return CE.replay(configOf(pub), pub.log);
}
function sideUid(pub, side) {
  return side === 1 ? pub.playerB : pub.playerA;
}
/** { batter, bowler } uids for the ball about to be bowled. */
function rolesOf(pub, state) {
  const st = state || stateOf(pub);
  const inn = CE.current(st);
  return { batter: sideUid(pub, inn.bat), bowler: sideUid(pub, inn.bowl), innings: inn.n };
}

function presenceGone(m, uid, now) {
  const p = m.presence[uid];
  const since = p && Number(p.at) ? Number(p.at) : m.pub.startedAt || m.pub.createdAt;
  return now - since > RECONNECT_MS;
}

function finish(m, now, winner, reason, text) {
  const pub = m.pub;
  pub.status = 'over';
  pub.winner = winner || null;
  pub.draw = !winner;
  pub.reason = reason;
  pub.result = text || '';
  pub.phase = '';
  pub.ball = null;
  pub.deadline = 0;
  pub.endedAt = now;
}

/** Next phase after the log changed: finished, an innings break, or the bowler's clock. */
function afterEvent(m, now, prevInnings) {
  const pub = m.pub;
  const st = stateOf(pub);
  if (st.result) {
    const r = st.result;
    const winner = r.kind === 'win' ? sideUid(pub, r.winner) : null;
    finish(m, now, winner, r.by || r.kind, r.text);
    return { ended: true };
  }
  const inn = CE.current(st);
  pub.ball = null;
  if (inn.n !== prevInnings) {
    pub.phase = 'break';
    pub.deadline = now + RESULT_MS + BREAK_MS;
    return { inningsBreak: true };
  }
  pub.phase = 'bowl';
  pub.deadline = now + RESULT_MS + BOWL_MS;
  return {};
}

function startBall(pub, delivery, now) {
  const d = CE.deliveryById(delivery);
  const startAt = now + LEAD_MS;
  pub.ball = {
    n: pub.log.length,
    del: d.id,
    startAt,
    runupMs: d.runupMs,
    flightMs: d.flightMs,
  };
  pub.phase = 'ball';
  pub.deadline = startAt + d.runupMs + d.flightMs + GRACE_MS;
}

/**
 * Clamp a claimed tap time (ms since startAt, server clock) to what the network allows: it can't
 * be later than the moment the request arrived, nor older than the RTT cap.
 */
function clampTap(claimed, elapsed, rtt) {
  const lag = Math.max(150, Math.min(MAX_LAG_MS, (Number(rtt) || 0) + 150));
  const t = Number(claimed);
  if (!isFinite(t)) return elapsed;
  return Math.max(elapsed - lag, Math.min(elapsed, t));
}

function resolveBallNow(m, now, rng, shot, tap) {
  const pub = m.pub;
  const st = stateOf(pub);
  const inn = CE.current(st);
  const ball = pub.ball;
  const timing = tap == null ? 'miss' : CE.timingFromOffset(ball.del, tap);
  const seed = Math.floor(rng() * 4294967296) >>> 0;
  const ev = CE.resolveBall(
    { delivery: ball.del, shot, timing, rules: st.config.rules, freeHit: inn.freeHit, firstBall: CE.firstBallFor(st) },
    seed
  );
  ev.at = now;
  if (tap != null) ev.tap = Math.round(tap);
  pub.log.push(ev);
  return afterEvent(m, now, inn.n);
}

function afk(m, uid) {
  const step = Policy.afkStep(m.pub.misses[uid], POLICY);
  m.pub.misses[uid] = step.misses;
  return step.forfeit;
}

/**
 * Pure reducer — (match, uid, op, args) → { match, result }. Throws coded errors.
 * `rng` rolls the toss, auto deliveries and every ball seed.
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
      const hostArgs = playerA === uid ? a : {};
      const m = newMatch({
        matchId,
        playerA,
        playerB,
        now,
        format: hostArgs.format,
        preset: hostArgs.preset,
        toggles: hostArgs.toggles,
        tie: hostArgs.tie,
        stake: hostArgs.stake,
      });
      m.pub.joined[uid] = true;
      m.pub.names[uid] = cleanName(a.name) || 'Player';
      return { match: m, result: { created: true } };
    }
    const m = hydrate(current);
    const pub = m.pub;
    if (!pub.players[uid]) throw err('not_in_match', 'This match is for two other players');
    pub.joined[uid] = true;
    if (a.name) pub.names[uid] = cleanName(a.name) || pub.names[uid] || 'Player';
    if (pub.status === 'waiting') {
      // The host's settings win while nothing has been bowled (a guest may have created the node).
      if (uid === pub.playerA) applySettings(pub, a);
      if (pub.joined[pub.playerA] && pub.joined[pub.playerB]) {
        const tossWinner = rng() < 0.5 ? pub.playerA : pub.playerB;
        // Street default: the toss winner bats first.
        pub.toss = { winner: tossWinner, bats: tossWinner };
        pub.status = 'playing';
        pub.startedAt = now;
        pub.phase = 'bowl';
        pub.deadline = now + INTRO_MS + BOWL_MS;
      }
    }
    return { match: m, result: { joined: true } };
  }

  if (!current) throw err('match_not_found', 'Match not found');
  const m = hydrate(current);
  const pub = m.pub;
  if (!pub.players[uid]) throw err('not_in_match', 'This match is for two other players');

  if (op === 'bowl') {
    if (pub.status !== 'playing') throw err('not_playing', 'This match isn’t live');
    if (pub.phase !== 'bowl') throw err('not_your_turn', 'Wait for the next ball');
    if (Number(a.ballNo) !== pub.log.length) throw err('stale_ball', 'That ball already happened');
    const roles = rolesOf(pub);
    if (uid !== roles.bowler) throw err('not_bowler', 'You’re batting this innings');
    if (!CE.DELIVERIES[a.delivery]) throw err('bad_delivery', 'Pick a delivery');
    pub.misses[uid] = 0;
    startBall(pub, a.delivery, now);
    return { match: m, result: { bowled: true, startAt: pub.ball.startAt } };
  }

  if (op === 'hit') {
    if (pub.status !== 'playing') throw err('not_playing', 'This match isn’t live');
    if (pub.phase !== 'ball' || !pub.ball) throw err('no_ball', 'No ball in flight');
    if (Number(a.ballNo) !== pub.ball.n) throw err('stale_ball', 'That ball already happened');
    const roles = rolesOf(pub);
    if (uid !== roles.batter) throw err('not_batter', 'You’re bowling this innings');
    const elapsed = now - pub.ball.startAt;
    if (elapsed < 0) throw err('too_early', 'The ball isn’t bowled yet');
    const shot = CE.SHOTS[a.shot] ? a.shot : 'push';
    // Only the shot and the tap time are read — any claimed runs / dismissal are ignored.
    const tap = clampTap(a.t, elapsed, a.rtt);
    pub.misses[uid] = 0;
    const res = resolveBallNow(m, now, rng, shot, tap);
    return { match: m, result: Object.assign({ resolved: true }, res) };
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
      forfeit(m, now, opp, 'disconnect');
      return { match: m, result: { ended: true, forfeit: true } };
    }
    if (now < pub.deadline) return null;
    const roles = rolesOf(pub);
    if (pub.phase === 'break') {
      pub.phase = 'bowl';
      pub.deadline = now + BOWL_MS;
      return { match: m, result: { resumed: true } };
    }
    if (pub.phase === 'bowl') {
      if (afk(m, roles.bowler)) {
        forfeit(m, now, roles.bowler, 'afk');
        return { match: m, result: { ended: true, forfeit: true } };
      }
      const st = stateOf(pub);
      const inn = CE.current(st);
      const last = pub.log.length ? pub.log[pub.log.length - 1].del : '';
      startBall(pub, CE.aiDelivery({ balls: inn.legal, last }, Math.floor(rng() * 4294967296)), now);
      return { match: m, result: { autoBowled: true } };
    }
    if (pub.phase === 'ball') {
      if (afk(m, roles.batter)) {
        forfeit(m, now, roles.batter, 'afk');
        return { match: m, result: { ended: true, forfeit: true } };
      }
      const res = resolveBallNow(m, now, rng, 'push', null);
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
    forfeit(m, now, uid, 'left');
    return { match: m, result: { ended: true, forfeit: true } };
  }

  if (op === 'rematch') {
    if (pub.status !== 'over') throw err('not_over', 'Finish this match first');
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
            playerA: pub.playerB,
            playerB: pub.playerA,
            names: pub.names,
            format: pub.format,
            preset: pub.preset,
            toggles: pub.toggles,
            tie: pub.tie,
            stake: pub.stake,
            rematchOf: pub.matchId,
          },
        },
      };
    }
    return { match: m, result: { waiting: true } };
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
    return { match: m, result: { settled: true } };
  }

  throw err('bad_op', 'Unknown match action');
}

/** Forfeit goes into the log too, so the scorecard's result line matches the settlement. */
function forfeit(m, now, loserUid, reason) {
  const pub = m.pub;
  const winnerUid = other(pub, loserUid);
  pub.log.push({ t: 'end', reason: 'forfeit', winner: winnerUid === pub.playerA ? 0 : 1, why: reason, at: now });
  const st = stateOf(pub);
  finish(m, now, winnerUid, reason, st.result ? st.result.text : '');
}

/** Achievements the server can prove from the log. */
function achievementFlags(pub) {
  const flags = {};
  stateOf(pub).innings.forEach((inn) => {
    const uid = sideUid(pub, inn.bat);
    if (inn.sixes >= 3) flags[uid] = ['cricket_three_sixes'];
  });
  return flags;
}

/** Chips + rating through the shared economy — trusted because the server resolved every ball. */
async function settleMatch(adminApp, pub, econ) {
  const e = econ || require('./dangal-economy');
  const flags = achievementFlags(pub);
  const draw = !pub.winner;
  const actor = pub.winner || pub.playerA;
  const opp = other(pub, actor);
  const payload = await e.resolveGame(
    adminApp.firestore(),
    adminApp,
    actor,
    {
      gameType: 'streetcricket',
      result: draw ? 'draw' : 'win',
      won: !draw,
      isDraw: draw,
      opponentUid: opp,
      winnerUid: draw ? '' : actor,
      stake: pub.stake,
      matchId: pub.matchId,
      rated: !!pub.rated,
    },
    { trusted: true, flags }
  );
  const side = (p) => ({
    chipDelta: Number(p && p.chipDelta) || 0,
    eloDelta: Number(p && p.eloDelta) || 0,
    achievements: ((p && p.achievements) || []).map((x) => x.key || x),
  });
  const out = {};
  out[actor] = side(payload);
  out[opp] = side(payload && payload.opponent);
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
 * Entry point for the `cricket_match` action.
 * @param {import('firebase-admin')} adminApp
 */
async function cricketMatch(adminApp, uid, body, deps) {
  const b = body || {};
  const op = String(b.op || '');
  if (!CLIENT_OPS.has(op)) throw err('bad_op', 'Unknown match action');
  const matchId = cleanMatchId(b.matchId);
  if (!matchId) throw err('bad_match', 'Missing match');
  const rtdb = adminApp.database();
  const now = (deps && deps.now) || Date.now();
  const path = `games/cricket/${matchId}`;
  const rng = (deps && deps.rng) || Math.random;
  const result = await transactMatch(rtdb, path, (cur) => reduceMatch(cur, uid, op, b, now, rng), {
    allowEmpty: op === 'join',
  });

  if (result.createNext) {
    const c = result.createNext;
    await transactMatch(
      rtdb,
      `games/cricket/${c.matchId}`,
      (cur) => (cur ? null : { match: newMatch(Object.assign({ now }, c)), result: {} }),
      { allowEmpty: true }
    ).catch(() => {});
    delete result.createNext;
  }

  if (result.ended || op === 'settle' || op === 'tick' || op === 'join') {
    await maybeSettle(adminApp, rtdb, path, uid, now, deps).catch((e) => {
      console.warn('[cricket] settle', e && e.message);
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
  BOWL_MS,
  LEAD_MS,
  GRACE_MS,
  MAX_LAG_MS,
  RESULT_MS,
  BREAK_MS,
  JOIN_MS,
  RECONNECT_MS,
  CLIENT_OPS,
  newMatch,
  hydrate,
  configOf,
  stateOf,
  rolesOf,
  clampTap,
  reduceMatch,
  achievementFlags,
  settleMatch,
  cricketMatch,
};
