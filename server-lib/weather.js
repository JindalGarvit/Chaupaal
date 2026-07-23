/**
 * Open-Meteo weather helper (free, no API key).
 * Used by Akhbaar personalization + dynamic theming.
 * https://open-meteo.com/
 */

const TIMEOUT_MS = 4000;

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('WEATHER_TIMEOUT')), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Map WMO weather code → coarse bucket for prompts/themes.
 * @param {number} code
 */
function weatherBucket(code) {
  const c = Number(code);
  if (!Number.isFinite(c)) return 'unknown';
  if (c === 0) return 'clear';
  if (c >= 1 && c <= 3) return 'partly_cloudy';
  if (c === 45 || c === 48) return 'fog';
  if (c >= 51 && c <= 67) return 'rain';
  if (c >= 71 && c <= 77) return 'snow';
  if (c >= 80 && c <= 82) return 'rain';
  if (c >= 85 && c <= 86) return 'snow';
  if (c >= 95) return 'storm';
  return 'overcast';
}

/**
 * @param {{ lat: number, lon: number }} opts
 * @returns {Promise<{ ok: boolean, bucket?: string, tempC?: number, code?: number, summary?: string }>}
 */
async function fetchWeatherByCoords(opts = {}) {
  const lat = Number(opts.lat);
  const lon = Number(opts.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { ok: false, reason: 'bad_coords' };
  }
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}` +
    `&current=temperature_2m,weather_code&timezone=auto`;
  try {
    const res = await withTimeout(
      fetch(url, { headers: { Accept: 'application/json' } }),
      TIMEOUT_MS
    );
    if (!res.ok) return { ok: false, reason: 'http_' + res.status };
    const data = await res.json();
    const code = Number(data?.current?.weather_code);
    const tempC = Number(data?.current?.temperature_2m);
    const bucket = weatherBucket(code);
    const summary =
      bucket === 'rain'
        ? 'rainy'
        : bucket === 'clear'
          ? 'clear skies'
          : bucket === 'storm'
            ? 'stormy'
            : bucket === 'fog'
              ? 'foggy'
              : bucket === 'snow'
                ? 'snowy'
                : 'cloudy';
    return { ok: true, bucket, tempC, code, summary };
  } catch (e) {
    return { ok: false, reason: e?.message || 'weather_failed' };
  }
}

/**
 * Geocode city name via Open-Meteo geocoding (also free).
 * @param {string} city
 */
async function geocodeCity(city) {
  const q = String(city || '').trim().slice(0, 80);
  if (!q) return null;
  const url =
    `https://geocoding-api.open-meteo.com/v1/search` +
    `?name=${encodeURIComponent(q)}&count=1&language=en&format=json`;
  try {
    const res = await withTimeout(
      fetch(url, { headers: { Accept: 'application/json' } }),
      TIMEOUT_MS
    );
    if (!res.ok) return null;
    const data = await res.json();
    const hit = Array.isArray(data?.results) ? data.results[0] : null;
    if (!hit) return null;
    return {
      lat: hit.latitude,
      lon: hit.longitude,
      name: hit.name,
      country: hit.country_code || '',
    };
  } catch {
    return null;
  }
}

/**
 * @param {{ city?: string, lat?: number, lon?: number }} opts
 */
async function fetchWeatherForUser(opts = {}) {
  let lat = Number(opts.lat);
  let lon = Number(opts.lon);
  let cityName = String(opts.city || '').trim();
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    const geo = await geocodeCity(cityName);
    if (!geo) return { ok: false, reason: 'no_location' };
    lat = geo.lat;
    lon = geo.lon;
    cityName = geo.name || cityName;
  }
  const wx = await fetchWeatherByCoords({ lat, lon });
  if (!wx.ok) return wx;
  return { ...wx, city: cityName, lat, lon };
}

module.exports = {
  fetchWeatherByCoords,
  fetchWeatherForUser,
  geocodeCity,
  weatherBucket,
};
