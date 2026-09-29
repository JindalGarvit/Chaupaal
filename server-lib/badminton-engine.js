/**
 * Badminton — Live singles + doubles (server-resolved). Served by POST /api/media-config
 * { action: 'badminton_match', op, matchId, ... } (no extra Vercel function).
 *
 * RTDB games/badminton/{matchId}:
 *   pub      — any signed-in viewer reads (players + spectators): seats, format, toss, the rally log,
 *              the contact in play, the current rally's hits, interval, settlement
 *   presence — presence/{uid}: player heartbeat { at, online }
 *   server   — no client access: settle lease
 * RTDB games/badmintonQueue — no client access: the doubles matchmaking queue.
 *
 * The reducer (public/src/js/games/badminton-match.js) and the laws (badminton-engine.js) are the
 * same files the phone runs for vs Bot games. A phone never sends a point, a score or a fault code —
 * only `hit { n, k, t, rtt }`; this server clamps the tap and rolls every contact with its own rng.
 */
'use strict';

const E = require('../public/src/js/games/badminton-engine.js');
const BM = require('../public/src/js/games/badminton-match.js');

const QUEUE_PATH = 'games/badmintonQueue';
/** A queued player must poll at least this often to stay in the doubles queue. */
const QUEUE_STALE_MS = 15000;
const QUEUE_OPS = new Set(['queue', 'unqueue']);

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}
const plain = (v) => JSON.parse(JSON.stringify(v));

/** Run the reducer against one RTDB node atomically. */
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
      return plain(next.match);
    } catch (e) {
      failure = e;
      // The first run may see an empty local cache: writing null makes RTDB retry with the stored
      // node if there is one (and changes nothing if there isn't); `failure` is rethrown after.
      return current == null ? null : undefined;
    }
  });
  if (failure) throw failure;
  if (noop) return { noop: true };
  if (!tx.committed) throw err('busy', 'Match busy — try again');
  if (!outcome) throw err('match_not_found', 'Match not found');
  return outcome;
}

/**
 * Chips + rating (singles, two people) or team results (doubles) through the shared economy —
 * trusted because the server resolved every contact. Doubles is unrated (no team ratings yet).
 */
async function settleMatch(adminApp, pub, econ) {
  const e = econ || require('./dangal-economy');
  const humans = BM.humans(pub);
  if (humans.length < 2) return {};
  const db = adminApp.firestore();
  if (pub.discipline === 'singles') {
    const actor = BM.sideUids(pub, pub.winner)[0] || humans[0];
    const opp = humans.find((u) => u !== actor);
    const payload = await e.resolveGame(
      db,
      adminApp,
      actor,
      { gameType: 'badminton', result: 'win', won: true, isDraw: false, opponentUid: opp, winnerUid: actor, stake: pub.stake, matchId: pub.matchId, rated: !!pub.rated },
      { trusted: true, flags: {} }
    );
    const side = (p) => ({ chipDelta: Number(p && p.chipDelta) || 0, eloDelta: Number(p && p.eloDelta) || 0 });
    const out = {};
    out[actor] = side(payload);
    out[opp] = side(payload && payload.opponent);
    return out;
  }
  const winners = BM.sideUids(pub, pub.winner);
  const ranking = winners.concat(humans.filter((u) => winners.indexOf(u) < 0));
  const payload = await e.resolvePlacement(db, adminApp, { gameType: 'badminton', matchId: pub.matchId, ranking, teams: { winners }, stake: 0 });
  const out = {};
  humans.forEach((u) => {
    const p = payload && payload.players && payload.players[u];
    out[u] = { chipDelta: Number(p && p.chipDelta) || 0, eloDelta: 0, team: true, won: winners.indexOf(u) >= 0 };
  });
  return out;
}

async function maybeSettle(adminApp, rtdb, path, uid, now, deps) {
  const claim = await transactMatch(rtdb, path, (cur) => BM.reduceMatch(cur, uid, 'settle_claim', {}, now));
  if (!claim.settleClaim) return null;
  const snap = await rtdb.ref(path + '/pub').once('value');
  const pub = BM.hydrate({ pub: snap.val() }).pub;
  const settlement = await settleMatch(adminApp, pub, deps && deps.econ);
  await transactMatch(rtdb, path, (cur) => BM.reduceMatch(cur, uid, 'settle_done', { settlement }, now));
  return settlement;
}

/**
 * Doubles matchmaking: a queue node with { uid: { at, name } }. Each poll refreshes you; the fourth
 * fresh player creates a match (random pairs) and the others pick up their matchId on the next poll.
 */
function reduceQueue(current, uid, op, args, now, rng) {
  const q = current && typeof current === 'object' ? current : {};
  const waiting = Object.assign({}, q.waiting || {});
  const assigned = Object.assign({}, q.assigned || {});
  Object.keys(waiting).forEach((u) => {
    if (now - (Number(waiting[u].at) || 0) > QUEUE_STALE_MS) delete waiting[u];
  });
  Object.keys(assigned).forEach((u) => {
    if (now - (Number(assigned[u].at) || 0) > 60000) delete assigned[u];
  });
  if (op === 'unqueue') {
    delete waiting[uid];
    return { next: { waiting, assigned }, result: { left: true } };
  }
  if (assigned[uid]) {
    const got = assigned[uid];
    delete assigned[uid];
    delete waiting[uid];
    return { next: { waiting, assigned }, result: { matchId: got.matchId } };
  }
  waiting[uid] = { at: now, name: String((args && args.name) || 'Player').replace(/[<>]/g, '').slice(0, 24), format: E.normFormat(args && args.format) };
  const ids = Object.keys(waiting).sort((a, b) => waiting[a].at - waiting[b].at);
  if (ids.length >= 4 && ids.indexOf(uid) >= 0) {
    const four = [uid].concat(ids.filter((u) => u !== uid).slice(0, 3));
    for (let i = four.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = four[i];
      four[i] = four[j];
      four[j] = t;
    }
    const matchId = 'badminton_dq_' + now.toString(36) + '_' + Math.floor(rng() * 1e6).toString(36);
    const seats = { A0: four[0], A1: four[1], B0: four[2], B1: four[3] };
    const names = {};
    Object.keys(seats).forEach((s) => (names[s] = waiting[seats[s]].name));
    four.forEach((u) => {
      delete waiting[u];
      if (u !== uid) assigned[u] = { matchId, at: now };
    });
    return { next: { waiting, assigned }, result: { matchId, create: { matchId, discipline: 'doubles', format: 'standard', seats, names, host: four[0] } } };
  }
  return { next: { waiting, assigned }, result: { waiting: true, count: ids.length } };
}

async function queueOp(rtdb, uid, op, body, now, rng) {
  let outcome = null;
  const tx = await rtdb.ref(QUEUE_PATH).transaction((current) => {
    const r = reduceQueue(current, uid, op, body, now, rng);
    outcome = r.result;
    return r.next;
  });
  if (!tx.committed) throw err('busy', 'Queue busy — try again');
  if (outcome && outcome.create) {
    const c = outcome.create;
    await transactMatch(
      rtdb,
      `games/badminton/${c.matchId}`,
      (cur) => (cur ? null : { match: BM.newMatch(Object.assign({ now }, c)), result: {} }),
      { allowEmpty: true }
    );
    delete outcome.create;
  }
  return outcome || {};
}

/**
 * Entry point for the `badminton_match` action.
 * deps: { now, rng, econ }.
 */
async function badmintonMatch(adminApp, uid, body, deps) {
  const b = body || {};
  const op = String(b.op || '');
  const rtdb = adminApp.database();
  const now = (deps && deps.now) || Date.now();
  const rng = (deps && deps.rng) || Math.random;
  if (QUEUE_OPS.has(op)) return Object.assign({ serverNow: now }, await queueOp(rtdb, uid, op, b, now, rng));
  if (!BM.CLIENT_OPS.has(op)) throw err('bad_op', 'Unknown match action');
  const matchId = String(b.matchId || '')
    .replace(/[^\w.-]/g, '')
    .slice(0, 120);
  if (!matchId) throw err('bad_match', 'Missing match');
  const path = `games/badminton/${matchId}`;
  // `local` rooms never exist on the server.
  const args = Object.assign({}, b, { local: false });
  const result = await transactMatch(rtdb, path, (cur) => BM.reduceMatch(cur, uid, op, args, now, rng), {
    allowEmpty: op === 'join' || op === 'create',
  });

  if (result.createNext) {
    const c = result.createNext;
    await transactMatch(
      rtdb,
      `games/badminton/${c.matchId}`,
      (cur) => (cur ? null : { match: BM.newMatch(Object.assign({ now }, c, { local: false })), result: {} }),
      { allowEmpty: true }
    ).catch(() => {});
    delete result.createNext;
  }

  if (result.ended || op === 'settle' || op === 'tick' || op === 'join') {
    await maybeSettle(adminApp, rtdb, path, uid, now, deps).catch((e) => {
      console.warn('[badminton] settle', e && e.message);
    });
  }
  return Object.assign({ matchId, serverNow: now }, result);
}

module.exports = {
  QUEUE_PATH,
  QUEUE_STALE_MS,
  reduceQueue,
  settleMatch,
  badmintonMatch,
  reduceMatch: BM.reduceMatch,
  newMatch: BM.newMatch,
  hydrate: BM.hydrate,
  stateOf: BM.stateOf,
  clampTap: BM.clampTap,
  MAX_COMP_MS: BM.MAX_COMP_MS,
};
