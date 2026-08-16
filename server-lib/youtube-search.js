/**
 * YouTube Data API v3 Search.list with Redis + Firestore cache.
 * Env: YOUTUBE_API_KEY (server-only). Never scrape HTML / unofficial frontends.
 *
 * Search.list ≈ 100 quota units. Cache hits skip Google.
 */

const crypto = require('crypto');

const USER_TTL_MS = 45 * 60 * 1000;
const REC_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_QUERY = 80;
const MAX_RESULTS = 8;
const FETCH_MS = 8000;
const CACHE_COL = 'youtubeSearchCache';
const REC_QUERIES = ['lofi chill', 'bollywood hits', 'indie acoustic', 'focus music', 'chaupaal vibes'];

function getYoutubeKey() {
  const k = typeof process.env.YOUTUBE_API_KEY === 'string' ? process.env.YOUTUBE_API_KEY.trim() : '';
  return k || '';
}

function isYoutubeConfigured() {
  return !!getYoutubeKey();
}

function normalizeYoutubeQuery(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, MAX_QUERY);
}

function isRecQuery(normalized) {
  return REC_QUERIES.includes(String(normalized || ''));
}

function ttlMsForQuery(normalized) {
  return isRecQuery(normalized) ? REC_TTL_MS : USER_TTL_MS;
}

function cacheDocId(normalized) {
  const n = normalizeYoutubeQuery(normalized);
  const hash = crypto.createHash('sha1').update(n).digest('hex').slice(0, 24);
  return `q_${hash}`;
}

function redisKey(normalized) {
  return `ytsearch:v1:${normalized}`;
}

function mapItems(items) {
  return (items || [])
    .map((it) => ({
      id: it.id?.videoId || it.id,
      title: String(it.snippet?.title || '').slice(0, 160),
      channel: String(it.snippet?.channelTitle || '').slice(0, 120),
      thumb:
        it.snippet?.thumbnails?.medium?.url ||
        it.snippet?.thumbnails?.default?.url ||
        '',
    }))
    .filter((r) => r.id && typeof r.id === 'string');
}

function googleErrorCode(data, httpStatus) {
  const reason = data?.error?.errors?.[0]?.reason || data?.error?.status || '';
  if (httpStatus === 403 || /quota/i.test(reason) || /quotaExceeded/i.test(String(data?.error?.message || ''))) {
    return 'YOUTUBE_QUOTA';
  }
  if (httpStatus === 400 || /keyInvalid|API_KEY/i.test(reason + String(data?.error?.message || ''))) {
    return 'YOUTUBE_KEY';
  }
  return 'YOUTUBE_ERROR';
}

async function readRedis(normalized) {
  try {
    const { getRedis } = require('./rate-limit');
    const redis = getRedis();
    if (!redis) return null;
    const raw = await redis.get(redisKey(normalized));
    if (!raw) return null;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const results = Array.isArray(parsed?.results) ? parsed.results : [];
    if (!results.length) return null;
    return results;
  } catch (e) {
    console.warn('[youtube-search] redis read', e?.message || e);
    return null;
  }
}

async function writeRedis(normalized, results, ttlMs) {
  try {
    const { getRedis } = require('./rate-limit');
    const redis = getRedis();
    if (!redis) return;
    const sec = Math.max(60, Math.floor(ttlMs / 1000));
    await redis.set(redisKey(normalized), JSON.stringify({ results }), { ex: sec });
  } catch (e) {
    console.warn('[youtube-search] redis write', e?.message || e);
  }
}

async function readFirestore(adminApp, normalized) {
  if (!adminApp) return null;
  try {
    const snap = await adminApp.firestore().collection(CACHE_COL).doc(cacheDocId(normalized)).get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    const expiresAt = Number(data.expiresAt) || 0;
    if (expiresAt && Date.now() > expiresAt) return null;
    const results = Array.isArray(data.results) ? data.results : [];
    return results.length ? results : null;
  } catch (e) {
    console.warn('[youtube-search] firestore read', e?.message || e);
    return null;
  }
}

async function writeFirestore(adminApp, normalized, results, ttlMs) {
  if (!adminApp) return;
  try {
    const FieldValue = adminApp.firestore.FieldValue;
    await adminApp
      .firestore()
      .collection(CACHE_COL)
      .doc(cacheDocId(normalized))
      .set(
        {
          query: normalized,
          results: results || [],
          fetchedAt: FieldValue.serverTimestamp(),
          expiresAt: Date.now() + ttlMs,
        },
        { merge: true }
      );
  } catch (e) {
    console.warn('[youtube-search] firestore write', e?.message || e);
  }
}

async function fetchYoutube(normalized, limit) {
  const key = getYoutubeKey();
  const maxResults = Math.min(MAX_RESULTS, Math.max(1, Number(limit) || MAX_RESULTS));
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&safeSearch=moderate&maxResults=${maxResults}&q=${encodeURIComponent(
    normalized
  )}&key=${encodeURIComponent(key)}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_MS);
  try {
    const resp = await fetch(url, { signal: ac.signal });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const code = googleErrorCode(data, resp.status);
      console.warn('[youtube-search] google', resp.status, data?.error?.message || code);
      return { results: [], error: code };
    }
    return { results: mapItems(data.items).slice(0, maxResults), error: null };
  } catch (e) {
    const aborted = e?.name === 'AbortError';
    console.warn('[youtube-search] fetch', e?.message || e);
    return { results: [], error: aborted ? 'YOUTUBE_TIMEOUT' : 'YOUTUBE_ERROR' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @returns {Promise<{ results: object[], configured: boolean, provider: string|null, cached: boolean, error?: string }>}
 */
async function searchYoutube(adminApp, { query, limit } = {}) {
  if (!isYoutubeConfigured()) {
    return { results: [], configured: false, provider: null, cached: false };
  }
  const normalized = normalizeYoutubeQuery(query);
  if (!normalized) {
    return { results: [], configured: true, provider: 'youtube', cached: false, error: 'VALIDATION_ERROR' };
  }
  const lim = Math.min(MAX_RESULTS, Math.max(1, Number(limit) || MAX_RESULTS));
  const ttl = ttlMsForQuery(normalized);

  const fromRedis = await readRedis(normalized);
  if (fromRedis) {
    return {
      results: fromRedis.slice(0, lim),
      configured: true,
      provider: 'youtube',
      cached: true,
    };
  }
  const fromFs = await readFirestore(adminApp, normalized);
  if (fromFs) {
    writeRedis(normalized, fromFs, ttl).catch(() => {});
    return {
      results: fromFs.slice(0, lim),
      configured: true,
      provider: 'youtube',
      cached: true,
    };
  }

  const fetched = await fetchYoutube(normalized, lim);
  if (fetched.results.length) {
    await Promise.all([
      writeRedis(normalized, fetched.results, ttl),
      writeFirestore(adminApp, normalized, fetched.results, ttl),
    ]);
  }
  return {
    results: fetched.results,
    configured: true,
    provider: 'youtube',
    cached: false,
    ...(fetched.error ? { error: fetched.error } : {}),
  };
}

module.exports = {
  searchYoutube,
  normalizeYoutubeQuery,
  isRecQuery,
  ttlMsForQuery,
  isYoutubeConfigured,
  REC_QUERIES,
  USER_TTL_MS,
  REC_TTL_MS,
};
