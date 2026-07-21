/**
 * Provider-agnostic music entrypoint (mirrors server-lib/ai.js).
 *
 * Usage:
 *   const { callMusicProvider } = require('./music');
 *   const { results } = await callMusicProvider({ query: 'Kesariya Arijit' });
 *
 * To swap providers later:
 *   1. Add server-lib/providers/<name>.js exporting { id, search }
 *   2. Register in PROVIDERS below
 *   3. Set MUSIC_PROVIDER=<name>
 *   Features keep calling callMusicProvider() — no per-feature changes.
 *
 * Fallback: if primary returns nothing (or music_resolve), try iTunes Search
 * (https://itunes.apple.com/search — free, no auth).
 */
const jiosaavnProvider = require('./providers/jiosaavn');

const PROVIDERS = {
  jiosaavn: jiosaavnProvider,
  // spotify: require('./providers/spotify'),
};

const MUSIC_PROVIDER = (process.env.MUSIC_PROVIDER || 'jiosaavn').trim().toLowerCase();
const ITUNES_TIMEOUT_MS = 4000;
const PROVIDER_TIMEOUT_MS = 4000;

function getProvider(name = MUSIC_PROVIDER) {
  const p = PROVIDERS[name];
  if (!p) {
    const err = new Error(`Unknown MUSIC_PROVIDER: ${name}`);
    err.code = 'MUSIC_PROVIDER_UNKNOWN';
    throw err;
  }
  return p;
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${label || 'music'} timed out`);
      err.code = 'MUSIC_TIMEOUT';
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function normalizeItunesTrack(track) {
  if (!track || typeof track !== 'object') return null;
  const title = String(track.trackName || '').trim();
  if (!title) return null;
  const artist = String(track.artistName || 'Unknown artist').trim();
  const artwork = String(track.artworkUrl100 || track.artworkUrl60 || '').trim();
  const thumbnail = artwork ? artwork.replace('100x100bb', '200x200bb') : '';
  const previewUrl = String(track.previewUrl || '').trim() || null;
  return {
    id: track.trackId != null ? `itunes_${track.trackId}` : '',
    title,
    artist,
    thumbnail,
    previewUrl,
    source: 'itunes',
  };
}

async function searchItunes(query, limit = 12) {
  const q = String(query || '').trim();
  if (!q) return [];
  const url =
    `https://itunes.apple.com/search` +
    `?term=${encodeURIComponent(q)}&media=music&entity=song&limit=${Math.min(25, Math.max(1, limit))}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ITUNES_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!res.ok) return [];
    const data = await res.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    return results.map(normalizeItunesTrack).filter(Boolean);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Search songs via configured provider, falling back to iTunes when empty.
 * Never throws for empty upstream — returns { results: [], provider, fallbackUsed }.
 *
 * @param {{ query: string, limit?: number }} opts
 */
async function callMusicProvider(opts = {}) {
  const query = String(opts.query || '').trim().slice(0, 120);
  const limit = Math.min(20, Math.max(1, Number(opts.limit) || 12));
  if (!query) {
    return { results: [], provider: MUSIC_PROVIDER, fallbackUsed: false };
  }

  let providerId = MUSIC_PROVIDER;
  let results = [];
  let fallbackUsed = false;

  try {
    const provider = getProvider();
    providerId = provider.id;
    results = await withTimeout(
      provider.search({ query, limit }),
      PROVIDER_TIMEOUT_MS,
      provider.id
    );
    if (!Array.isArray(results)) results = [];
  } catch (e) {
    console.warn('[music] provider search failed:', e?.code || e?.message || e);
    results = [];
  }

  if (!results.length) {
    const itunes = await searchItunes(query, limit);
    if (itunes.length) {
      results = itunes;
      fallbackUsed = true;
      providerId = 'itunes';
    }
  }

  return {
    results: results.slice(0, limit),
    provider: providerId,
    fallbackUsed,
  };
}

/**
 * Resolve a playable preview when the stored URL fails / is missing.
 * Prefers iTunes 30s preview for title+artist.
 *
 * @param {{ title: string, artist?: string }} opts
 */
async function resolveMusicPreview(opts = {}) {
  const title = String(opts.title || '').trim().slice(0, 120);
  const artist = String(opts.artist || '').trim().slice(0, 120);
  if (!title) return { previewUrl: null, source: 'none', song: null };

  const query = artist ? `${title} ${artist}` : title;
  const itunes = await searchItunes(query, 5);
  const match =
    itunes.find(
      (s) =>
        s.previewUrl &&
        s.title.toLowerCase().includes(title.toLowerCase().slice(0, 24))
    ) || itunes.find((s) => s.previewUrl) || itunes[0] || null;

  if (!match) {
    return { previewUrl: null, source: 'none', song: null };
  }
  return {
    previewUrl: match.previewUrl || null,
    source: match.previewUrl ? 'itunes' : 'none',
    song: match,
  };
}

module.exports = {
  callMusicProvider,
  resolveMusicPreview,
  getProvider,
  PROVIDERS,
  MUSIC_PROVIDER,
};
