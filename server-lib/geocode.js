/**
 * Nominatim geocoding proxy (server-side).
 *
 * Free OpenStreetMap Nominatim — browsers cannot set User-Agent, so we proxy here.
 * Debounce + short cache live on the client; this layer adds a server cache and
 * identifying User-Agent per https://operations.osmfoundation.org/policies/nominatim/
 *
 * Scale note: fine for current Hobby usage. Self-host Nominatim or switch to
 * LocationIQ / Mapbox Geocoding once query volume grows meaningfully.
 */
const CACHE = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

function cacheKey(q) {
  return String(q || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 120);
}

async function searchPlaces(query, limit = 6) {
  const q = cacheKey(query);
  if (q.length < 2) return { results: [] };
  const hit = CACHE.get(q);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { results: hit.results, cached: true };
  }

  const url =
    `${NOMINATIM}?format=json&addressdetails=1&limit=${Math.min(10, Math.max(1, limit))}` +
    `&q=${encodeURIComponent(q)}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        // Required by Nominatim usage policy
        'User-Agent': 'Chaupaal/1.0 (https://chaupaal.vercel.app; contact@chaupaal.app)',
      },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      return { results: [], error: `nominatim_${res.status}` };
    }
    const data = await res.json();
    const results = (Array.isArray(data) ? data : [])
      .map((row) => {
        const lat = Number(row.lat);
        const lng = Number(row.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        const display = String(row.display_name || '').trim();
        const name =
          row.name ||
          row.address?.amenity ||
          row.address?.building ||
          display.split(',')[0] ||
          'Place';
        return {
          placeName: String(name).slice(0, 120),
          address: display.slice(0, 240),
          lat,
          lng,
          osmId: row.osm_id != null ? String(row.osm_id) : null,
        };
      })
      .filter(Boolean);
    CACHE.set(q, { at: Date.now(), results });
    return { results };
  } catch (e) {
    return { results: [], error: e?.name === 'AbortError' ? 'timeout' : 'fetch_failed' };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { searchPlaces };
