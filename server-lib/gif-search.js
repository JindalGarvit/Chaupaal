/**
 * Server-side Klipy GIF search with Firestore query/trending cache.
 *
 * Env: KLIPY_API_KEY (never expose to client). Auth is path-based:
 *   GET https://api.klipy.com/api/v1/{API_KEY}/gifs/search?q=…
 *   GET https://api.klipy.com/api/v1/{API_KEY}/gifs/trending?per_page=…
 *
 * Cache: gifCache/{docId} — Admin SDK only (see firestore.rules).
 *
 * Degrades open when the key is unset: callers get { configured:false, results:[] }
 * so the client can fall back to the local curated Giphy pack.
 */

const QUERY_CACHE_TTL_MS = 4 * 60 * 60 * 1000; // a few hours
const TRENDING_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // daily
const MAX_LIMIT = 24;
/** Klipy rejects per_page below 8 / above 50 — clamp outbound requests. */
const KLIPY_PER_PAGE_MIN = 8;
const KLIPY_TIMEOUT_MS = 5000;
const TRENDING_DOC_ID = '__trending__';
/** India-first locale for trending personalization (ISO-style xx_XX). */
const DEFAULT_LOCALE = 'in_IN';

function getKlipyKey() {
  const k = typeof process.env.KLIPY_API_KEY === 'string' ? process.env.KLIPY_API_KEY.trim() : '';
  return k || '';
}

function isKlipyConfigured() {
  return !!getKlipyKey();
}

function normalizeQuery(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

function cacheDocIdForQuery(query) {
  const n = normalizeQuery(query);
  if (!n) return TRENDING_DOC_ID;
  const safe = n.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 80) || 'q';
  return `q_${safe}`;
}

function klipyPerPage(limit) {
  const lim = Math.min(MAX_LIMIT, Math.max(1, Number(limit) || MAX_LIMIT));
  return Math.min(50, Math.max(KLIPY_PER_PAGE_MIN, lim));
}

/** Prefer gif under a size bucket; tolerate `file` or legacy `files`. */
function pickSizeMedia(files, sizeKey) {
  if (!files || typeof files !== 'object') return null;
  const bucket = files[sizeKey];
  if (!bucket || typeof bucket !== 'object') return null;
  const media = bucket.gif || bucket.webp || bucket.jpg || null;
  if (!media?.url) return null;
  return media;
}

/**
 * Normalize one Klipy item → { id, url, previewUrl, width, height, title }.
 * Full send URL: md.gif (chat-friendly). Preview: sm/xs.
 */
function normalizeKlipyItem(r) {
  if (!r || typeof r !== 'object') return null;
  const files = r.file || r.files || {};
  const full = pickSizeMedia(files, 'md') || pickSizeMedia(files, 'hd') || pickSizeMedia(files, 'sm');
  if (!full?.url) return null;
  const preview =
    pickSizeMedia(files, 'sm') || pickSizeMedia(files, 'xs') || pickSizeMedia(files, 'md') || full;
  return {
    id: String(r.id ?? r.slug ?? ''),
    url: String(full.url),
    previewUrl: String(preview.url || full.url),
    width: Number(full.width) || null,
    height: Number(full.height) || null,
    title: String(r.title || r.slug || 'GIF').slice(0, 120),
  };
}

function extractKlipyList(data) {
  // Envelope: { result: true, data: { data: [...], current_page, per_page, has_next } }
  if (Array.isArray(data?.data?.data)) return data.data.data;
  if (Array.isArray(data?.data) && !data.data.data) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function normalizeKlipyResponse(data) {
  return extractKlipyList(data).map(normalizeKlipyItem).filter(Boolean);
}

async function fetchKlipy(pathAndQuery) {
  const key = getKlipyKey();
  if (!key) {
    const err = new Error('KLIPY_UNCONFIGURED');
    err.code = 'KLIPY_UNCONFIGURED';
    throw err;
  }
  // Key lives in the path — never return it to the client.
  const url = `https://api.klipy.com/api/v1/${encodeURIComponent(key)}/${pathAndQuery}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), KLIPY_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const err = new Error(`Klipy HTTP ${res.status}`);
      err.code = 'KLIPY_HTTP';
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function readCache(db, docId, { allowStale = false } = {}) {
  try {
    const snap = await db.collection('gifCache').doc(docId).get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    const expiresAt = Number(data.expiresAt) || 0;
    const expired = expiresAt && Date.now() > expiresAt;
    if (expired && !allowStale) return null;
    const results = Array.isArray(data.results) ? data.results : [];
    if (!results.length) return null;
    return {
      results,
      source: data.source || 'cache',
      cached: true,
      stale: !!expired,
    };
  } catch (e) {
    console.warn('[gif-search] cache read', e?.message || e);
    return null;
  }
}

async function writeCache(db, FieldValue, docId, { query, results, source, ttlMs }) {
  try {
    await db
      .collection('gifCache')
      .doc(docId)
      .set(
        {
          query: query || '',
          results: results || [],
          source: source || 'klipy',
          fetchedAt: FieldValue.serverTimestamp(),
          expiresAt: Date.now() + ttlMs,
        },
        { merge: true }
      );
  } catch (e) {
    console.warn('[gif-search] cache write', e?.message || e);
  }
}

async function fetchAndCacheTrending(adminApp) {
  const db = adminApp.firestore();
  const FieldValue = adminApp.firestore.FieldValue;
  const perPage = klipyPerPage(MAX_LIMIT);
  const data = await fetchKlipy(
    `gifs/trending?per_page=${perPage}&page=1&locale=${encodeURIComponent(DEFAULT_LOCALE)}`
  );
  const results = normalizeKlipyResponse(data);
  if (results.length) {
    await writeCache(db, FieldValue, TRENDING_DOC_ID, {
      query: '',
      results,
      source: 'klipy_trending',
      ttlMs: TRENDING_CACHE_TTL_MS,
    });
  }
  return results;
}

/**
 * @returns {Promise<{
 *   results: object[],
 *   source: string,
 *   configured: boolean,
 *   cached?: boolean,
 *   query?: string
 * }>}
 */
async function searchGifs(adminApp, { query = '', limit = 24 } = {}) {
  const configured = isKlipyConfigured();
  const lim = Math.min(MAX_LIMIT, Math.max(1, Number(limit) || 24));
  const q = normalizeQuery(query);

  if (!configured) {
    return { results: [], source: 'unconfigured', configured: false, query: q };
  }

  if (!adminApp) {
    return { results: [], source: 'unavailable', configured: true, query: q };
  }

  const db = adminApp.firestore();
  const FieldValue = adminApp.firestore.FieldValue;
  const docId = cacheDocIdForQuery(q);

  // Empty query → trending (cached daily)
  if (!q) {
    const cached = await readCache(db, TRENDING_DOC_ID);
    if (cached) {
      return {
        results: cached.results.slice(0, lim),
        source: 'trending',
        configured: true,
        cached: true,
        query: '',
      };
    }
    try {
      const results = await fetchAndCacheTrending(adminApp);
      return {
        results: results.slice(0, lim),
        source: 'trending',
        configured: true,
        cached: false,
        query: '',
      };
    } catch (e) {
      console.warn('[gif-search] trending', e?.message || e);
      return { results: [], source: 'error', configured: true, query: '' };
    }
  }

  const hit = await readCache(db, docId);
  if (hit) {
    return {
      results: hit.results.slice(0, lim),
      source: 'cache',
      configured: true,
      cached: true,
      query: q,
    };
  }

  try {
    const perPage = klipyPerPage(lim);
    const data = await fetchKlipy(
      `gifs/search?q=${encodeURIComponent(q)}&per_page=${perPage}&page=1&locale=${encodeURIComponent(DEFAULT_LOCALE)}`
    );
    const results = normalizeKlipyResponse(data);
    if (results.length) {
      await writeCache(db, FieldValue, docId, {
        query: q,
        results,
        source: 'klipy',
        ttlMs: QUERY_CACHE_TTL_MS,
      });
    }
    return {
      results: results.slice(0, lim),
      source: 'klipy',
      configured: true,
      cached: false,
      query: q,
    };
  } catch (e) {
    console.warn('[gif-search] search failed', e?.message || e);
    // Soft-stale trending so a Klipy blip still yields something live-feeling.
    const trending = await readCache(db, TRENDING_DOC_ID, { allowStale: true });
    if (trending) {
      return {
        results: trending.results.slice(0, lim),
        source: 'trending',
        configured: true,
        cached: true,
        query: q,
      };
    }
    return { results: [], source: 'error', configured: true, query: q };
  }
}

module.exports = {
  QUERY_CACHE_TTL_MS,
  TRENDING_CACHE_TTL_MS,
  MAX_LIMIT,
  TRENDING_DOC_ID,
  DEFAULT_LOCALE,
  getKlipyKey,
  isKlipyConfigured,
  normalizeQuery,
  cacheDocIdForQuery,
  klipyPerPage,
  normalizeKlipyItem,
  normalizeKlipyResponse,
  searchGifs,
};
