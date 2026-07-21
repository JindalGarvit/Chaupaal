/**
 * JioSaavn music provider (unofficial community wrapper).
 *
 * Upstream: sumitkolhe/jiosaavn-api (MIT)
 *   Docs: https://saavn.dev/docs (alias; public host below)
 *   Public instance pinned: https://saavn.sumit.co
 *   Override with env JIOSAAVN_API_BASE if you self-host.
 *
 * Not affiliated with JioSaavn / Saavn Media. Endpoints may change;
 * keep timeouts short and never block chat/story send on failure.
 */
const DEFAULT_BASE = 'https://saavn.sumit.co';
const SEARCH_TIMEOUT_MS = 4000;

function baseUrl() {
  const fromEnv =
    typeof process.env.JIOSAAVN_API_BASE === 'string'
      ? process.env.JIOSAAVN_API_BASE.trim().replace(/\/$/, '')
      : '';
  return fromEnv || DEFAULT_BASE;
}

function pickImage(images) {
  if (!Array.isArray(images) || !images.length) return '';
  const preferred =
    images.find((i) => i.quality === '150x150') ||
    images.find((i) => i.quality === '500x500') ||
    images[images.length - 1] ||
    images[0];
  return String(preferred?.url || '').trim();
}

function pickPreviewUrl(downloadUrl) {
  if (!Array.isArray(downloadUrl) || !downloadUrl.length) return '';
  // Prefer mid-bitrate for faster first paint; fall back to highest available.
  const mid =
    downloadUrl.find((d) => d.quality === '96kbps') ||
    downloadUrl.find((d) => d.quality === '160kbps') ||
    downloadUrl.find((d) => d.quality === '48kbps');
  const pick = mid || downloadUrl[downloadUrl.length - 1] || downloadUrl[0];
  return String(pick?.url || '').trim();
}

function artistNames(song) {
  const primary = song?.artists?.primary;
  if (Array.isArray(primary) && primary.length) {
    return primary
      .map((a) => a?.name)
      .filter(Boolean)
      .join(', ');
  }
  if (typeof song?.primaryArtists === 'string') return song.primaryArtists;
  if (Array.isArray(song?.primaryArtists) && song.primaryArtists.length) {
    return song.primaryArtists.map((a) => a?.name || a).filter(Boolean).join(', ');
  }
  return '';
}

function normalizeSong(song) {
  if (!song || typeof song !== 'object') return null;
  const title = String(song.name || song.title || '').trim();
  if (!title) return null;
  const artist = artistNames(song) || 'Unknown artist';
  const thumbnail = pickImage(song.image);
  const previewUrl = pickPreviewUrl(song.downloadUrl || song.download_url);
  return {
    id: String(song.id || ''),
    title,
    artist,
    thumbnail,
    previewUrl: previewUrl || null,
    source: 'jiosaavn',
  };
}

async function fetchJson(url, timeoutMs = SEARCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const err = new Error(`JioSaavn HTTP ${res.status}`);
      err.code = 'UPSTREAM_ERROR';
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {{ query: string, limit?: number }} req
 * @returns {Promise<Array<{ id, title, artist, thumbnail, previewUrl, source }>>}
 */
async function search(req) {
  const query = String(req?.query || '').trim();
  if (!query) return [];
  const limit = Math.min(20, Math.max(1, Number(req?.limit) || 12));
  const url =
    `${baseUrl()}/api/search/songs` +
    `?query=${encodeURIComponent(query)}&limit=${limit}`;
  const data = await fetchJson(url);
  const results = data?.data?.results || data?.results || [];
  if (!Array.isArray(results)) return [];
  return results.map(normalizeSong).filter(Boolean);
}

module.exports = {
  id: 'jiosaavn',
  search,
  DEFAULT_BASE,
};
