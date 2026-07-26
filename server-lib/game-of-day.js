/**
 * Game of the Day — fairness × popularity weighted pick, cached once per IST day.
 * Used by /api/media-config actions (no separate serverless function).
 */

/** Play floor for "low engagement" flag (informational only). */
const LOW_ENGAGEMENT_MAX_PLAYS = 5;
/** Minimum age before a quiet game can be flagged. */
const LOW_ENGAGEMENT_MIN_AGE_DAYS = 14;
/** Never-featured fairness base (days) so new games get a strong rotation boost. */
const NEVER_FEATURED_FAIRNESS_DAYS = 365;

const KNOWN_GAME_IDS = [
  'quiz',
  'chess',
  'snakes',
  'ludo',
  'uno',
  'ttt',
  'wordguess',
  'fiveinrow',
  'business',
  'scribble',
  'rushrunner',
  'tiptap',
  'ankjod',
];

function calendarDateIST(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysSince(ts, now = new Date()) {
  const d = toDate(ts);
  if (!d) return NEVER_FEATURED_FAIRNESS_DAYS;
  return Math.max(0, (now.getTime() - d.getTime()) / 86400000);
}

function fairnessScore(game, now = new Date()) {
  const featuredCount = Number(game.featuredCount) || 0;
  const days = game.lastFeaturedAt == null ? NEVER_FEATURED_FAIRNESS_DAYS : daysSince(game.lastFeaturedAt, now);
  return days / (featuredCount + 1);
}

function popularityScores(games) {
  const likes = games.map((g) => Math.max(0, Number(g.likeCount) || 0));
  const max = Math.max(0, ...likes);
  if (max <= 0) return games.map(() => 0);
  return likes.map((n) => n / max);
}

function weightedRandomPick(games, weights) {
  const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (!games.length || total <= 0) {
    return games[Math.floor(Math.random() * games.length)] || null;
  }
  let r = Math.random() * total;
  for (let i = 0; i < games.length; i++) {
    r -= Math.max(0, weights[i]);
    if (r <= 0) return games[i];
  }
  return games[games.length - 1];
}

async function ensureGamesSeeded(db, FieldValue) {
  const refs = KNOWN_GAME_IDS.map((id) => db.collection('games').doc(id));
  const snaps = await db.getAll(...refs);
  const batch = db.batch();
  let writes = 0;
  snaps.forEach((snap, i) => {
    if (snap.exists) return;
    const id = KNOWN_GAME_IDS[i];
    batch.set(snap.ref, {
      playCount: 0,
      likeCount: 0,
      featuredCount: 0,
      lastFeaturedAt: null,
      createdAt: FieldValue.serverTimestamp(),
      active: true,
      flaggedLowEngagement: false,
    });
    writes += 1;
  });
  if (writes) await batch.commit();
  return writes;
}

function isLowEngagement(game, now = new Date()) {
  if (game.active === false) return false;
  const plays = Number(game.playCount) || 0;
  if (plays > LOW_ENGAGEMENT_MAX_PLAYS) return false;
  const ageDays = daysSince(game.createdAt, now);
  return ageDays >= LOW_ENGAGEMENT_MIN_AGE_DAYS;
}

async function flagLowEngagementGames(db, games, now = new Date()) {
  const batch = db.batch();
  let n = 0;
  for (const g of games) {
    const shouldFlag = isLowEngagement(g, now);
    const currently = !!g.flaggedLowEngagement;
    if (shouldFlag === currently) continue;
    batch.set(
      db.collection('games').doc(g.id),
      { flaggedLowEngagement: shouldFlag },
      { merge: true }
    );
    n += 1;
    if (n >= 400) break;
  }
  if (n) await batch.commit();
  return n;
}

/**
 * Read cached GOTD or compute once for the IST calendar day.
 * @returns {{ gameId: string, date: string, cached: boolean }}
 */
async function getOrComputeGameOfDay(adminApp) {
  const db = adminApp.firestore();
  const FieldValue = adminApp.firestore.FieldValue;
  const date = calendarDateIST();
  const metaRef = db.collection('meta').doc('gameOfDay');

  const metaSnap = await metaRef.get();
  const meta = metaSnap.exists ? metaSnap.data() || {} : {};
  if (meta.date === date && meta.gameId) {
    return { gameId: String(meta.gameId), date, cached: true };
  }

  await ensureGamesSeeded(db, FieldValue);

  const gamesSnap = await db.collection('games').get();
  const allGames = gamesSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  const active = allGames.filter((g) => g.active !== false && KNOWN_GAME_IDS.includes(g.id));

  // Exclude previous (or current) featured game from immediate re-selection.
  const excludeId = meta.gameId ? String(meta.gameId) : null;
  let candidates = active.filter((g) => g.id !== excludeId);
  if (!candidates.length) candidates = active.slice();
  if (!candidates.length) {
    return { gameId: null, date, cached: false };
  }

  const now = new Date();
  const pops = popularityScores(candidates);
  const weights = candidates.map((g, i) => fairnessScore(g, now) * (1 + pops[i]));
  const pick = weightedRandomPick(candidates, weights);
  if (!pick) {
    return { gameId: null, date, cached: false };
  }

  try {
    await flagLowEngagementGames(db, allGames, now);
  } catch (e) {
    console.warn('[game-of-day] low-engagement flag failed', e?.message || e);
  }

  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(metaRef);
    const freshData = fresh.exists ? fresh.data() || {} : {};
    if (freshData.date === date && freshData.gameId) {
      return;
    }
    tx.set(
      metaRef,
      {
        gameId: pick.id,
        date,
        previousGameId: excludeId || null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    tx.set(
      db.collection('games').doc(pick.id),
      {
        featuredCount: FieldValue.increment(1),
        lastFeaturedAt: FieldValue.serverTimestamp(),
        active: true,
      },
      { merge: true }
    );
  });

  const finalSnap = await metaRef.get();
  const final = finalSnap.exists ? finalSnap.data() || {} : {};
  return {
    gameId: final.gameId ? String(final.gameId) : pick.id,
    date: final.date || date,
    cached: false,
  };
}

/**
 * One like per uid per game (idempotent). Server increments likeCount.
 */
async function recordGameLike(adminApp, uid, gameId) {
  const id = String(gameId || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');
  if (!uid || !id || id.length > 32 || !KNOWN_GAME_IDS.includes(id)) {
    return { ok: false, reason: 'invalid_game' };
  }
  const db = adminApp.firestore();
  const FieldValue = adminApp.firestore.FieldValue;
  const likeRef = db.collection('gameLikes').doc(`${uid}_${id}`);
  const gameRef = db.collection('games').doc(id);

  const result = await db.runTransaction(async (tx) => {
    const likeSnap = await tx.get(likeRef);
    if (likeSnap.exists) {
      return { ok: true, alreadyLiked: true, gameId: id };
    }
    tx.set(likeRef, {
      uid,
      gameId: id,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(
      gameRef,
      {
        likeCount: FieldValue.increment(1),
        active: true,
      },
      { merge: true }
    );
    return { ok: true, alreadyLiked: false, gameId: id };
  });
  return result;
}

/** Increment playCount; seed doc on first play without clobbering createdAt. */
async function recordGamePlaySafe(adminApp, gameId) {
  const id = String(gameId || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');
  if (!id || id.length > 32 || !KNOWN_GAME_IDS.includes(id)) {
    return { ok: false, reason: 'invalid_game' };
  }
  const db = adminApp.firestore();
  const FieldValue = adminApp.firestore.FieldValue;
  const ref = db.collection('games').doc(id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      tx.set(ref, {
        playCount: 1,
        likeCount: 0,
        featuredCount: 0,
        lastFeaturedAt: null,
        createdAt: FieldValue.serverTimestamp(),
        active: true,
        flaggedLowEngagement: false,
      });
      return;
    }
    tx.set(ref, { playCount: FieldValue.increment(1), active: true }, { merge: true });
  });
  return { ok: true, gameId: id };
}

async function listGamesHealth(adminApp, { flaggedOnly = true } = {}) {
  const db = adminApp.firestore();
  const FieldValue = adminApp.firestore.FieldValue;
  await ensureGamesSeeded(db, FieldValue);
  const snap = await db.collection('games').get();
  const now = new Date();
  let items = snap.docs.map((d) => {
    const data = d.data() || {};
    return {
      id: d.id,
      playCount: Number(data.playCount) || 0,
      likeCount: Number(data.likeCount) || 0,
      featuredCount: Number(data.featuredCount) || 0,
      active: data.active !== false,
      flaggedLowEngagement: !!data.flaggedLowEngagement,
      lastFeaturedAt: toDate(data.lastFeaturedAt)?.toISOString?.() || null,
      createdAt: toDate(data.createdAt)?.toISOString?.() || null,
      ageDays: Math.round(daysSince(data.createdAt, now) * 10) / 10,
    };
  });
  items = items.filter((g) => KNOWN_GAME_IDS.includes(g.id));
  if (flaggedOnly) items = items.filter((g) => g.flaggedLowEngagement);
  items.sort((a, b) => a.playCount - b.playCount || a.likeCount - b.likeCount);
  return { items, thresholds: { LOW_ENGAGEMENT_MAX_PLAYS, LOW_ENGAGEMENT_MIN_AGE_DAYS } };
}

module.exports = {
  LOW_ENGAGEMENT_MAX_PLAYS,
  LOW_ENGAGEMENT_MIN_AGE_DAYS,
  KNOWN_GAME_IDS,
  calendarDateIST,
  getOrComputeGameOfDay,
  recordGamePlaySafe,
  recordGameLike,
  listGamesHealth,
  fairnessScore,
  popularityScores,
};
