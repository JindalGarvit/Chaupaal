/**
 * Game of the Day — fairness × popularity weighted pick, cached once per IST day.
 * Used by /api/media-config actions (no separate serverless function).
 *
 * Rules:
 *  - Never same gameId within last 7 IST days (when alternatives exist)
 *  - Never same genre as yesterday’s GOTD (when alternatives exist)
 *  - Fallback: relax 7-day ban before relaxing genre ban
 */

/** Play floor for "low engagement" flag (informational only). */
const LOW_ENGAGEMENT_MAX_PLAYS = 5;
/** Minimum age before a quiet game can be flagged. */
const LOW_ENGAGEMENT_MIN_AGE_DAYS = 14;
/** Never-featured fairness base (days) so new games get a strong rotation boost. */
const NEVER_FEATURED_FAIRNESS_DAYS = 365;
/** Do not re-feature the same gameId within this many IST days. */
const GOTD_GAME_COOLDOWN_DAYS = 7;

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
  'streetcricket',
  'gullykick',
];

/** Single source of truth for GOTD genre filters (mirrors client registry). */
const GAME_GENRE_BY_ID = {
  quiz: 'quiz',
  chess: 'board',
  snakes: 'board',
  ludo: 'board',
  uno: 'party',
  ttt: 'board',
  wordguess: 'brain',
  fiveinrow: 'board',
  business: 'board',
  scribble: 'party',
  rushrunner: 'arcade',
  tiptap: 'brain',
  ankjod: 'brain',
  streetcricket: 'rw_sports',
  gullykick: 'rw_sports',
};

function genreForGameId(id, gameDoc) {
  if (gameDoc && gameDoc.genre) return String(gameDoc.genre);
  return GAME_GENRE_BY_ID[id] || 'other';
}

function calendarDateIST(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Previous IST calendar date string (YYYY-MM-DD). */
function previousIstDate(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d, 12, 0, 0);
  const prev = new Date(utc - 86400000);
  return calendarDateIST(prev);
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
    const id = KNOWN_GAME_IDS[i];
    const genre = GAME_GENRE_BY_ID[id] || 'other';
    if (!snap.exists) {
      batch.set(snap.ref, {
        playCount: 0,
        likeCount: 0,
        featuredCount: 0,
        lastFeaturedAt: null,
        createdAt: FieldValue.serverTimestamp(),
        active: true,
        flaggedLowEngagement: false,
        genre,
      });
      writes += 1;
      return;
    }
    const data = snap.data() || {};
    if (!data.genre) {
      batch.set(snap.ref, { genre, active: true }, { merge: true });
      writes += 1;
    }
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

/** IST calendar dates in [date − days, date) — used for gameId cooldown. */
function istCooldownDateSet(date, days = GOTD_GAME_COOLDOWN_DAYS) {
  const set = new Set();
  let d = previousIstDate(date);
  for (let i = 0; i < days; i++) {
    set.add(d);
    d = previousIstDate(d);
  }
  return set;
}

/**
 * Build candidate list with GOTD constraints.
 *
 * Fallback order (documented):
 *  1. none     — exclude gameIds featured in last 7 IST days AND exclude yesterday’s genre
 *  2. cooldown — relax 7-day gameId ban; keep yesterday-genre ban (still skip exact meta.gameId)
 *  3. genre    — relax genre ban; still skip exact yesterday/meta gameId
 *  4. all      — any active known game (last resort)
 */
function pickGotdCandidates(active, meta, date) {
  const recent = Array.isArray(meta.recent) ? meta.recent : [];
  const cooldownDates = istCooldownDateSet(date, GOTD_GAME_COOLDOWN_DAYS);
  const yDate = previousIstDate(date);

  const recentIds = new Set(
    recent
      .filter((r) => r && r.gameId && r.date && cooldownDates.has(String(r.date)))
      .map((r) => String(r.gameId))
  );
  // Top-level meta may not yet be pushed into recent[]
  if (meta.gameId && meta.date && cooldownDates.has(String(meta.date))) {
    recentIds.add(String(meta.gameId));
  }

  let yesterdayGenre = null;
  if (meta.date === yDate) {
    yesterdayGenre = meta.genre || (meta.gameId ? genreForGameId(String(meta.gameId), null) : null);
  } else {
    const yEntry = recent.find((r) => r && r.date === yDate);
    if (yEntry) {
      yesterdayGenre = yEntry.genre || genreForGameId(String(yEntry.gameId), null);
    }
  }

  const withMeta = active.map((g) => ({
    ...g,
    genre: genreForGameId(g.id, g),
  }));

  const yesterdayGameId =
    (meta.date === yDate && meta.gameId && String(meta.gameId)) ||
    recent.find((r) => r && r.date === yDate)?.gameId ||
    null;

  let pool = withMeta.filter((g) => !recentIds.has(g.id) && g.genre !== yesterdayGenre);
  if (pool.length) return { candidates: pool, relaxed: 'none', yesterdayGenre };

  // Fallback 1: relax 7-day gameId cooldown, keep genre constraint
  pool = withMeta.filter(
    (g) => g.genre !== yesterdayGenre && g.id !== yesterdayGameId && g.id !== meta.gameId
  );
  if (pool.length) return { candidates: pool, relaxed: 'cooldown', yesterdayGenre };

  // Fallback 2: relax genre, keep excluding yesterday’s exact game
  pool = withMeta.filter((g) => g.id !== yesterdayGameId && g.id !== meta.gameId);
  if (pool.length) return { candidates: pool, relaxed: 'genre', yesterdayGenre };

  return { candidates: withMeta.slice(), relaxed: 'all', yesterdayGenre };
}

/**
 * Read cached GOTD or compute once for the IST calendar day.
 * @returns {{ gameId: string, date: string, genre?: string, cached: boolean }}
 */
async function getOrComputeGameOfDay(adminApp) {
  const db = adminApp.firestore();
  const FieldValue = adminApp.firestore.FieldValue;
  const date = calendarDateIST();
  const metaRef = db.collection('meta').doc('gameOfDay');

  const metaSnap = await metaRef.get();
  const meta = metaSnap.exists ? metaSnap.data() || {} : {};
  if (meta.date === date && meta.gameId) {
    return {
      gameId: String(meta.gameId),
      date,
      genre: meta.genre || genreForGameId(String(meta.gameId), null),
      cached: true,
    };
  }

  await ensureGamesSeeded(db, FieldValue);

  const gamesSnap = await db.collection('games').get();
  const allGames = gamesSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  const active = allGames.filter((g) => g.active !== false && KNOWN_GAME_IDS.includes(g.id));

  const { candidates, yesterdayGenre } = pickGotdCandidates(active, meta, date);
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

  const pickGenre = genreForGameId(pick.id, pick);

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
    const prevRecent = Array.isArray(freshData.recent) ? freshData.recent.slice() : [];
    // Push previous featured day into recent history
    if (freshData.date && freshData.gameId) {
      prevRecent.unshift({
        date: String(freshData.date),
        gameId: String(freshData.gameId),
        genre: freshData.genre || genreForGameId(String(freshData.gameId), null),
      });
    }
    const recent = prevRecent
      .filter((r) => r && r.date && r.gameId)
      .slice(0, GOTD_GAME_COOLDOWN_DAYS + 3);

    tx.set(
      metaRef,
      {
        gameId: pick.id,
        date,
        genre: pickGenre,
        previousGameId: freshData.gameId || null,
        previousGenre: yesterdayGenre || freshData.genre || null,
        recent,
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
        genre: pickGenre,
      },
      { merge: true }
    );
  });

  const finalSnap = await metaRef.get();
  const final = finalSnap.exists ? finalSnap.data() || {} : {};
  return {
    gameId: final.gameId ? String(final.gameId) : pick.id,
    date: final.date || date,
    genre: final.genre || pickGenre,
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
        genre: GAME_GENRE_BY_ID[id] || 'other',
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
        genre: GAME_GENRE_BY_ID[id] || 'other',
      });
      return;
    }
    tx.set(
      ref,
      {
        playCount: FieldValue.increment(1),
        active: true,
        genre: snap.data()?.genre || GAME_GENRE_BY_ID[id] || 'other',
      },
      { merge: true }
    );
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
      genre: data.genre || GAME_GENRE_BY_ID[d.id] || 'other',
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
  GOTD_GAME_COOLDOWN_DAYS,
  KNOWN_GAME_IDS,
  GAME_GENRE_BY_ID,
  calendarDateIST,
  previousIstDate,
  istCooldownDateSet,
  getOrComputeGameOfDay,
  recordGamePlaySafe,
  recordGameLike,
  listGamesHealth,
  fairnessScore,
  popularityScores,
  genreForGameId,
  pickGotdCandidates,
};
