/**
 * Dangal ratings service — the one server-authoritative writer of per-game ratings.
 * Glicko-2 on the 1200 scale (math shared with the client in dangal-rating-math.js).
 * Storage: users/{uid}/gameStats/{game} keeps `elo` (existing UI + leaderboards) and gains
 * `rating { r, rd, vol, games, v }` + `provisional`. Legacy Elo docs migrate lazily on read —
 * nobody is ever reset.
 */
'use strict';

const M = require('../public/src/js/dangal/dangal-rating-math.js');

const RATED = new Set(M.RATED);

function isRated(gameType) {
  return RATED.has(String(gameType || '').toLowerCase());
}

/** Rating record from a gameStats doc (legacy `elo` → Glicko-2 with RD shrunk by games played). */
function fromStats(stats) {
  return M.fromStats(stats);
}

function publicView(stats) {
  const rec = fromStats(stats);
  return { rating: Math.round(rec.r), rd: Math.round(rec.rd), games: rec.games, provisional: M.isProvisional(rec) };
}

async function loadRating(db, uid, gameType) {
  try {
    const snap = await db.collection('users').doc(uid).collection('gameStats').doc(gameType).get();
    return fromStats(snap.exists ? snap.data() : null);
  } catch (e) {
    return fromStats(null);
  }
}

/**
 * Head-to-head update. `ctx` = { gameType, opponentUid, vsBot, practice, privateTable, rated }.
 * Returns null when the match must not move ratings, else
 * { a: statsFields, b: statsFields, deltaA, deltaB }.
 */
function rateHeadToHead(statsA, statsB, scoreA, ctx) {
  if (!M.shouldRate(ctx)) return null;
  const a = fromStats(statsA);
  const b = fromStats(statsB);
  const out = M.rateMatch(a, b, scoreA);
  return {
    a: M.statsFields(out.a),
    b: M.statsFields(out.b),
    deltaA: out.deltaA,
    deltaB: out.deltaB,
  };
}

/** Matchmaking read: the displayed rating (legacy Elo for anyone not yet migrated). */
async function matchmakingRating(db, uid, gameType) {
  const rec = await loadRating(db, uid, gameType);
  return Math.round(rec.r);
}

/** Leaderboard rows: accepts gameStats docs, returns sorted { uid, rating, provisional }. */
function leaderboardRows(docs) {
  return (docs || [])
    .map((d) => Object.assign({ uid: d.uid || d.id }, publicView(d)))
    .sort((x, y) => y.rating - x.rating);
}

module.exports = {
  RATED,
  isRated,
  fromStats,
  publicView,
  loadRating,
  rateHeadToHead,
  matchmakingRating,
  leaderboardRows,
  isProvisional: M.isProvisional,
  shouldRate: M.shouldRate,
  rateMatch: M.rateMatch,
};
