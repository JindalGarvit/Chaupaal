/**
 * Radio / trending / recommend — deterministic when AI is off.
 * Cache keys (Firestore musicCache/{id} when Admin available; else in-memory TTL):
 *   radio__{mood}_{genre}_{lang}__{istDay}
 *   trending__{scope}__{istHourBucket}   (3h buckets)
 *   recommend__{seedHash}__{istDay}
 *
 * Batch size ~24; client silently refills when remaining < 5.
 */
const { callMusicProvider } = require('./music');

const BATCH = 24;
const MEM_TTL_MS = 45 * 60 * 1000;
const mem = new Map();

const MOOD_SEEDS = {
  chill: ['lofi chill beats', 'acoustic soft hindi', 'rainy day indie'],
  energy: ['workout bollywood', 'edm party anthem', 'upbeat pop hits'],
  focus: ['instrumental study', 'soft piano ambient', 'classical focus'],
  romance: ['romantic bollywood', 'love songs arijit', 'slow dance pop'],
  nostalgia: ['90s bollywood hits', 'classic rock anthems', 'retro hindi'],
  discovery: ['indie emerging artists', 'fresh hindi indie', 'new music friday'],
};

const GENRE_SEEDS = {
  bollywood: ['bollywood hits', 'arijit singh', 'shreya ghoshal'],
  punjabi: ['punjabi hits', 'diljit dosanjh', 'sidhu moose wala'],
  hiphop: ['desi hip hop', 'indian rap hits', 'trap bollywood'],
  pop: ['pop hits 2024', 'taylor swift', 'ariana grande'],
  classical: ['hindustani classical', 'raag evening', 'sitar fusion'],
  indie: ['indian indie', 'prateek kuhad', 'the local train'],
  any: ['trending songs india', 'viral hindi songs', 'top charts'],
};

const LANG_SEEDS = {
  hi: ['hindi songs', 'bollywood chartbusters'],
  en: ['english pop hits', 'uk chart songs'],
  pa: ['punjabi chartbusters', 'punjabi party'],
  ta: ['tamil hits', 'anirudh ravichander'],
  te: ['telugu hits', 'dsp songs'],
  any: ['worldwide viral songs'],
};

const TRENDING_SEEDS = {
  global: ['top songs worldwide', 'billboard hot', 'viral global hits'],
  local: ['trending india songs', 'bollywood viral', 'desi chart toppers'],
  circle: ['friends party playlist', 'shared vibes bollywood', 'group listen hits'],
};

function istDayKey() {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch (e) {
    return new Date().toISOString().slice(0, 10);
  }
}

function istHourBucket(hours = 3) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const h = Number(parts.find((p) => p.type === 'hour')?.value || 0);
    return `${istDayKey()}_h${Math.floor(h / hours) * hours}`;
  } catch (e) {
    return `${istDayKey()}_h0`;
  }
}

function slug(s) {
  return String(s || 'any')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 32) || 'any';
}

function seedHash(seeds) {
  const raw = (seeds || []).slice(0, 6).map((s) => String(s || '').toLowerCase().slice(0, 40)).join('|');
  let h = 0;
  for (let i = 0; i < raw.length; i++) h = (h * 31 + raw.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function memGet(key) {
  const hit = mem.get(key);
  if (!hit) return null;
  if (Date.now() > hit.exp) {
    mem.delete(key);
    return null;
  }
  return hit.data;
}

function memSet(key, data) {
  mem.set(key, { data, exp: Date.now() + MEM_TTL_MS });
  if (mem.size > 80) {
    const first = mem.keys().next().value;
    mem.delete(first);
  }
}

async function firestoreGet(db, key) {
  if (!db) return null;
  try {
    const snap = await db.collection('musicCache').doc(key).get();
    if (!snap.exists) return null;
    const d = snap.data() || {};
    const exp = Number(d.expiresAtMs) || 0;
    if (exp && Date.now() > exp) return null;
    if (!Array.isArray(d.tracks) || !d.tracks.length) return null;
    return { tracks: d.tracks, cacheKey: key, fromCache: true, provider: d.provider || null };
  } catch (e) {
    return null;
  }
}

async function firestoreSet(db, key, tracks, provider) {
  if (!db || !tracks?.length) return;
  try {
    await db.collection('musicCache').doc(key).set(
      {
        tracks: tracks.slice(0, BATCH),
        provider: provider || null,
        expiresAtMs: Date.now() + MEM_TTL_MS,
        updatedAtMs: Date.now(),
      },
      { merge: true }
    );
  } catch (e) {
    /* cache write best-effort */
  }
}

function pickQueries({ mood, genre, language, scope, seeds }) {
  const qs = [];
  if (Array.isArray(seeds) && seeds.length) {
    seeds.slice(0, 4).forEach((s) => {
      const t = String(s || '').trim();
      if (t) qs.push(t);
    });
  }
  const m = MOOD_SEEDS[slug(mood)] || MOOD_SEEDS.discovery;
  const g = GENRE_SEEDS[slug(genre)] || GENRE_SEEDS.any;
  const l = LANG_SEEDS[slug(language)] || LANG_SEEDS.any;
  const tr = TRENDING_SEEDS[slug(scope)] || TRENDING_SEEDS.global;
  qs.push(...m.slice(0, 2), g[0], l[0], tr[0]);
  return [...new Set(qs.map((q) => q.slice(0, 80)))].slice(0, 6);
}

function dedupeTracks(list) {
  const seen = new Set();
  const out = [];
  for (const t of list || []) {
    if (!t || !t.title) continue;
    const k = `${String(t.title).toLowerCase()}|${String(t.artist || '').toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

async function fetchBatch(queries, limit = BATCH) {
  const per = Math.max(4, Math.ceil(limit / Math.max(1, queries.length)));
  const chunks = await Promise.all(
    queries.map((q) =>
      callMusicProvider({ query: q, limit: per }).catch(() => ({ results: [], provider: null }))
    )
  );
  let provider = null;
  const merged = [];
  chunks.forEach((c) => {
    if (c.provider) provider = c.provider;
    (c.results || []).forEach((t) => merged.push(t));
  });
  // Prefer playable
  const playable = dedupeTracks(merged).filter((t) => t.previewUrl);
  const rest = dedupeTracks(merged).filter((t) => !t.previewUrl);
  return { tracks: [...playable, ...rest].slice(0, limit), provider };
}

/**
 * @param {{ db?: FirebaseFirestore, mood?: string, genre?: string, language?: string, seeds?: string[] }} opts
 */
async function generateRadio(opts = {}) {
  const mood = slug(opts.mood || 'discovery');
  const genre = slug(opts.genre || 'any');
  const language = slug(opts.language || 'any');
  const key = `radio__${mood}_${genre}_${language}__${istDayKey()}`;

  const cached = memGet(key) || (await firestoreGet(opts.db, key));
  if (cached) {
    memSet(key, cached);
    return { ...cached, cacheKey: key };
  }

  const queries = pickQueries({ mood, genre, language, seeds: opts.seeds });
  const { tracks, provider } = await fetchBatch(queries, BATCH);
  const payload = { tracks, cacheKey: key, fromCache: false, provider };
  memSet(key, payload);
  await firestoreSet(opts.db, key, tracks, provider);
  return payload;
}

/**
 * @param {{ db?: FirebaseFirestore, scope?: 'global'|'local'|'circle', seeds?: string[] }} opts
 */
async function generateTrending(opts = {}) {
  const scope = slug(opts.scope || 'global');
  const extraSeeds = Array.isArray(opts.seeds) ? opts.seeds.filter(Boolean).slice(0, 8) : [];
  // Circle: fold local play seeds into cache identity when present (no invented friend data).
  const key =
    scope === 'circle' && extraSeeds.length
      ? `trending__${scope}__${seedHash(extraSeeds)}__${istHourBucket(3)}`
      : `trending__${scope}__${istHourBucket(3)}`;

  const cached = memGet(key) || (await firestoreGet(opts.db, key));
  if (cached) {
    memSet(key, cached);
    return { ...cached, cacheKey: key, scope };
  }

  const queries = pickQueries({
    scope,
    mood: 'discovery',
    genre: 'any',
    language: 'any',
    seeds: extraSeeds,
  });
  const { tracks, provider } = await fetchBatch(queries, BATCH);
  const payload = { tracks, cacheKey: key, fromCache: false, provider, scope };
  memSet(key, payload);
  await firestoreSet(opts.db, key, tracks, provider);
  return payload;
}

/**
 * @param {{ db?: FirebaseFirestore, seeds?: string[] }} opts
 */
async function generateRecommendations(opts = {}) {
  const seeds = Array.isArray(opts.seeds) ? opts.seeds.filter(Boolean).slice(0, 8) : [];
  const hash = seedHash(seeds.length ? seeds : ['discovery']);
  const key = `recommend__${hash}__${istDayKey()}`;

  const cached = memGet(key) || (await firestoreGet(opts.db, key));
  if (cached) {
    memSet(key, cached);
    return { ...cached, cacheKey: key };
  }

  const queries = pickQueries({
    mood: 'discovery',
    genre: 'any',
    language: 'any',
    seeds: seeds.length ? seeds : ['trending songs india', 'indie hindi soft'],
  });
  const { tracks, provider } = await fetchBatch(queries, BATCH);
  const payload = { tracks, cacheKey: key, fromCache: false, provider };
  memSet(key, payload);
  await firestoreSet(opts.db, key, tracks, provider);
  return payload;
}

module.exports = {
  generateRadio,
  generateTrending,
  generateRecommendations,
  BATCH,
  istDayKey,
};
