/**
 * Server-side Klipy media search (GIFs, stickers, memes, clips) with Firestore cache.
 *
 * Env: KLIPY_API_KEY (never expose to client). Path-key auth:
 *   GET https://api.klipy.com/api/v1/{API_KEY}/{kind}s/search|trending?…
 *   kind ∈ gif | sticker | meme | clip  → path segment gifs | stickers | memes | clips
 *
 * Cache: klipyCache/{kind}__{docId} — Admin SDK only (see firestore.rules).
 * Legacy GIF trending may still live under gifCache/__trending__ (read fallback).
 *
 * Soft-fail: no key → { configured:false, results:[] }. HTTP/timeout → empty + log.
 */

const QUERY_CACHE_TTL_MS = 4 * 60 * 60 * 1000;
const TRENDING_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_LIMIT = 24;
const KLIPY_PER_PAGE_MIN = 8;
const KLIPY_TIMEOUT_MS = 5000;
const TRENDING_DOC_ID = '__trending__';
const DEFAULT_LOCALE = 'in_IN';
const KLIPY_KINDS = Object.freeze(['gif', 'sticker', 'meme', 'clip']);
const KIND_PATH = Object.freeze({
  gif: 'gifs',
  sticker: 'stickers',
  meme: 'memes',
  clip: 'clips',
});

/** Preferred formats per kind (send URL first, then preview-friendly). */
const KIND_SEND_FORMATS = Object.freeze({
  gif: ['gif', 'webp', 'mp4', 'webm', 'jpg', 'png'],
  sticker: ['webp', 'png', 'gif', 'mp4', 'webm'],
  meme: ['webp', 'png', 'jpg', 'gif'],
  clip: ['mp4', 'webm', 'gif', 'webp'],
});
const KIND_PREVIEW_FORMATS = Object.freeze({
  gif: ['gif', 'webp', 'jpg', 'png', 'mp4'],
  sticker: ['webp', 'png', 'gif', 'jpg'],
  meme: ['webp', 'png', 'jpg', 'gif'],
  clip: ['jpg', 'webp', 'png', 'gif', 'mp4', 'webm'],
});

function getKlipyKey() {
  const k = typeof process.env.KLIPY_API_KEY === 'string' ? process.env.KLIPY_API_KEY.trim() : '';
  return k || '';
}

function isKlipyConfigured() {
  return !!getKlipyKey();
}

function normalizeKind(raw) {
  const k = String(raw || 'gif')
    .trim()
    .toLowerCase();
  if (k === 'gifs') return 'gif';
  if (k === 'stickers') return 'sticker';
  if (k === 'memes') return 'meme';
  if (k === 'clips') return 'clip';
  return KLIPY_KINDS.includes(k) ? k : 'gif';
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

function kindCacheDocId(kind, query) {
  return `${normalizeKind(kind)}__${cacheDocIdForQuery(query)}`;
}

function klipyPerPage(limit) {
  const lim = Math.min(MAX_LIMIT, Math.max(1, Number(limit) || MAX_LIMIT));
  return Math.min(50, Math.max(KLIPY_PER_PAGE_MIN, lim));
}

function mimeForFormat(fmt) {
  const f = String(fmt || '').toLowerCase();
  if (f === 'gif') return 'image/gif';
  if (f === 'webp' || f.includes('webp')) return 'image/webp';
  if (f === 'png') return 'image/png';
  if (f === 'jpg' || f === 'jpeg') return 'image/jpeg';
  if (f === 'mp4') return 'video/mp4';
  if (f === 'webm') return 'video/webm';
  return '';
}

function pickFromBucket(bucket, preferredFormats) {
  if (!bucket || typeof bucket !== 'object') return null;
  for (const fmt of preferredFormats) {
    const media = bucket[fmt];
    if (media && typeof media === 'object' && media.url) {
      return { media, format: fmt };
    }
  }
  for (const [fmt, media] of Object.entries(bucket)) {
    if (media && typeof media === 'object' && media.url) {
      return { media, format: fmt };
    }
  }
  return null;
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
 * Normalize one Klipy item → { id, title, kind, url, previewUrl, width, height, mime?, duration? }.
 */
function normalizeKlipyItem(r, kind = 'gif') {
  if (!r || typeof r !== 'object') return null;
  const k = normalizeKind(kind);
  const files = r.file || r.files || {};
  const sendPrefs = KIND_SEND_FORMATS[k] || KIND_SEND_FORMATS.gif;
  const previewPrefs = KIND_PREVIEW_FORMATS[k] || KIND_PREVIEW_FORMATS.gif;
  const sizeOrder = k === 'clip' ? ['md', 'hd', 'sm', 'xs'] : ['md', 'hd', 'sm', 'xs'];

  let fullPick = null;
  for (const sizeKey of sizeOrder) {
    const bucket = files[sizeKey];
    const picked = pickFromBucket(bucket, sendPrefs);
    if (picked) {
      fullPick = picked;
      break;
    }
  }
  if (!fullPick?.media?.url) return null;

  let previewPick = null;
  const previewOrder = ['sm', 'xs', 'md', 'hd'];
  for (const sizeKey of previewOrder) {
    const bucket = files[sizeKey];
    const picked = pickFromBucket(bucket, previewPrefs);
    if (picked) {
      previewPick = picked;
      break;
    }
  }
  if (!previewPick) previewPick = fullPick;

  const full = fullPick.media;
  const preview = previewPick.media;
  const durationRaw = Number(r.duration ?? full.duration ?? preview.duration);
  const out = {
    id: String(r.id ?? r.slug ?? ''),
    title: String(r.title || r.slug || k.toUpperCase()).slice(0, 120),
    kind: k,
    url: String(full.url),
    previewUrl: String(preview.url || full.url),
    width: Number(full.width) || null,
    height: Number(full.height) || null,
    mime: mimeForFormat(fullPick.format) || undefined,
  };
  if (Number.isFinite(durationRaw) && durationRaw > 0) {
    out.duration = Math.round(durationRaw * 10) / 10;
  }
  return out;
}

function extractKlipyList(data) {
  if (Array.isArray(data?.data?.data)) return data.data.data;
  if (Array.isArray(data?.data) && !data.data.data) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function normalizeKlipyResponse(data, kind = 'gif') {
  const k = normalizeKind(kind);
  return extractKlipyList(data)
    .map((item) => normalizeKlipyItem(item, k))
    .filter(Boolean);
}

async function fetchKlipy(pathAndQuery) {
  const key = getKlipyKey();
  if (!key) {
    const err = new Error('KLIPY_UNCONFIGURED');
    err.code = 'KLIPY_UNCONFIGURED';
    throw err;
  }
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

async function readCache(db, collectionName, docId, { allowStale = false } = {}) {
  try {
    const snap = await db.collection(collectionName).doc(docId).get();
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
    console.warn('[klipy-search] cache read', e?.message || e);
    return null;
  }
}

async function writeCache(db, FieldValue, docId, { kind, query, results, source, ttlMs }) {
  try {
    await db
      .collection('klipyCache')
      .doc(docId)
      .set(
        {
          kind: normalizeKind(kind),
          query: query || '',
          results: results || [],
          source: source || 'klipy',
          fetchedAt: FieldValue.serverTimestamp(),
          expiresAt: Date.now() + ttlMs,
        },
        { merge: true }
      );
  } catch (e) {
    console.warn('[klipy-search] cache write', e?.message || e);
  }
}

async function readKindCache(db, kind, query, opts) {
  const k = normalizeKind(kind);
  const docId = kindCacheDocId(k, query);
  let hit = await readCache(db, 'klipyCache', docId, opts);
  if (hit) return hit;
  // Legacy GIF cache (pre–multi-kind) — trending / query without kind prefix
  if (k === 'gif') {
    const legacyId = cacheDocIdForQuery(query);
    hit = await readCache(db, 'gifCache', legacyId, opts);
    if (hit) {
      hit.results = (hit.results || []).map((r) =>
        r && !r.kind ? Object.assign({}, r, { kind: 'gif' }) : r
      );
    }
  }
  return hit;
}

async function fetchAndCacheTrending(adminApp, kind) {
  const k = normalizeKind(kind);
  const pathSeg = KIND_PATH[k];
  const db = adminApp.firestore();
  const FieldValue = adminApp.firestore.FieldValue;
  const perPage = klipyPerPage(MAX_LIMIT);
  const data = await fetchKlipy(
    `${pathSeg}/trending?per_page=${perPage}&page=1&locale=${encodeURIComponent(DEFAULT_LOCALE)}`
  );
  const results = normalizeKlipyResponse(data, k);
  if (results.length) {
    await writeCache(db, FieldValue, kindCacheDocId(k, ''), {
      kind: k,
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
 *   kind: string,
 *   cached?: boolean,
 *   query?: string
 * }>}
 */
async function searchKlipyMedia(adminApp, { kind = 'gif', query = '', limit = 24 } = {}) {
  const k = normalizeKind(kind);
  const configured = isKlipyConfigured();
  const lim = Math.min(MAX_LIMIT, Math.max(1, Number(limit) || 24));
  const q = normalizeQuery(query);

  if (!configured) {
    return { results: [], source: 'unconfigured', configured: false, kind: k, query: q };
  }

  if (!adminApp) {
    return { results: [], source: 'unavailable', configured: true, kind: k, query: q };
  }

  const db = adminApp.firestore();
  const FieldValue = adminApp.firestore.FieldValue;
  const pathSeg = KIND_PATH[k];

  if (!q) {
    const cached = await readKindCache(db, k, '');
    if (cached) {
      return {
        results: cached.results.slice(0, lim),
        source: 'trending',
        configured: true,
        kind: k,
        cached: true,
        query: '',
      };
    }
    try {
      const results = await fetchAndCacheTrending(adminApp, k);
      return {
        results: results.slice(0, lim),
        source: 'trending',
        configured: true,
        kind: k,
        cached: false,
        query: '',
      };
    } catch (e) {
      console.warn(`[klipy-search] ${k} trending`, e?.message || e);
      return { results: [], source: 'error', configured: true, kind: k, query: '' };
    }
  }

  const hit = await readKindCache(db, k, q);
  if (hit) {
    return {
      results: hit.results.slice(0, lim),
      source: 'cache',
      configured: true,
      kind: k,
      cached: true,
      query: q,
    };
  }

  try {
    const perPage = klipyPerPage(lim);
    const data = await fetchKlipy(
      `${pathSeg}/search?q=${encodeURIComponent(q)}&per_page=${perPage}&page=1&locale=${encodeURIComponent(DEFAULT_LOCALE)}`
    );
    const results = normalizeKlipyResponse(data, k);
    if (results.length) {
      await writeCache(db, FieldValue, kindCacheDocId(k, q), {
        kind: k,
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
      kind: k,
      cached: false,
      query: q,
    };
  } catch (e) {
    console.warn(`[klipy-search] ${k} search failed`, e?.message || e);
    const trending = await readKindCache(db, k, '', { allowStale: true });
    if (trending) {
      return {
        results: trending.results.slice(0, lim),
        source: 'trending',
        configured: true,
        kind: k,
        cached: true,
        query: q,
      };
    }
    return { results: [], source: 'error', configured: true, kind: k, query: q };
  }
}

/** Back-compat wrapper — same as searchKlipyMedia({ kind: 'gif' }). */
async function searchGifs(adminApp, opts) {
  return searchKlipyMedia(adminApp, Object.assign({}, opts, { kind: 'gif' }));
}

module.exports = {
  QUERY_CACHE_TTL_MS,
  TRENDING_CACHE_TTL_MS,
  MAX_LIMIT,
  TRENDING_DOC_ID,
  DEFAULT_LOCALE,
  KLIPY_KINDS,
  KIND_PATH,
  getKlipyKey,
  isKlipyConfigured,
  normalizeKind,
  normalizeQuery,
  cacheDocIdForQuery,
  kindCacheDocId,
  klipyPerPage,
  pickSizeMedia,
  normalizeKlipyItem,
  normalizeKlipyResponse,
  searchKlipyMedia,
  searchGifs,
};
