/**
 * Local events provider — curated festival + seasonal prompts (free), scoped by region and city.
 * Interface is pluggable so Ticketmaster/PredictHQ can replace fetchLocalEvents later.
 *
 * Global-first (D1): every row says where it applies (regions: country codes, or null = everyone;
 * hemisphere for seasons) and its copy is a catalog key (notifications.card.seasonal_<id>_{title,text})
 * rendered in the reader's language.
 */

const { festivalForDate, festivalText } = require('./companion-outreach');

const SOUTHERN = new Set('AU NZ ZA AR CL UY PY BR'.split(' '));

/** months 1–12; regions null = everyone; cities matched against the profile city. */
const CITY_SEASONAL = [
  { id: 'winter_cozy', months: [12, 1, 2], hemisphere: 'north', regions: null, cities: null },
  { id: 'winter_cozy', months: [6, 7, 8], hemisphere: 'south', regions: null, cities: null },
  { id: 'summer_heat', months: [6, 7, 8], hemisphere: 'north', regions: null, cities: null, exclude: ['IN', 'BD', 'PK', 'NP', 'LK'] },
  { id: 'summer_heat', months: [12, 1, 2], hemisphere: 'south', regions: null, cities: null },
  { id: 'monsoon', months: [6, 7, 8, 9], regions: ['IN', 'BD', 'PK', 'NP', 'LK'], cities: null },
  { id: 'summer_heat', months: [4, 5], regions: ['IN', 'BD', 'PK', 'NP', 'LK'], cities: null },
  { id: 'city_winter_fog', months: [12, 1, 2], regions: ['IN'], cities: ['delhi', 'noida', 'gurgaon', 'gurugram'] },
  { id: 'city_rains', months: [6, 7, 8, 9], regions: ['IN'], cities: ['mumbai', 'bombay'] },
  { id: 'weekend_plans', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], regions: null, cities: null, weekendOnly: true },
];

function monthIn(date, tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'numeric', weekday: 'short' }).formatToParts(date);
    return { month: Number(parts.find((p) => p.type === 'month')?.value), weekday: parts.find((p) => p.type === 'weekday')?.value };
  } catch {
    return { month: date.getUTCMonth() + 1, weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getUTCDay()] };
  }
}

/**
 * @param {{ city?: string, date?: Date, tz?: string, country?: string, lang?: string }} opts
 * @returns {Promise<Array<{ id: string, title: string, text: string, source: string }>>}
 */
async function fetchLocalEvents(opts = {}) {
  const { serverT } = require('./i18n-server');
  const tz = opts.tz || 'UTC';
  const date = opts.date || new Date();
  const city = String(opts.city || '').toLowerCase().trim();
  const country = String(opts.country || '').toUpperCase() || null;
  const lang = opts.lang || 'en';
  const out = [];

  const fest = festivalForDate(date, tz, country);
  if (fest) {
    const ft = festivalText(fest, lang);
    out.push({ id: `festival_${fest.id}`, title: ft.name, text: ft.wish, source: 'curated_festival' });
  }

  const { month, weekday } = monthIn(date, tz);
  const hemi = country && SOUTHERN.has(country) ? 'south' : 'north';
  const seen = new Set();
  CITY_SEASONAL.forEach((row) => {
    if (!row.months.includes(month) || seen.has(row.id)) return;
    if (row.hemisphere && (!country || row.hemisphere !== hemi)) return;
    if (row.regions && (!country || row.regions.indexOf(country) < 0)) return;
    if (row.exclude && country && row.exclude.indexOf(country) >= 0) return;
    if (row.cities && (!city || !row.cities.some((c) => city.includes(c)))) return;
    if (row.weekendOnly && weekday !== 'Fri' && weekday !== 'Sat') return;
    seen.add(row.id);
    out.push({
      id: row.id,
      title: serverT(lang, `notifications.card.seasonal_${row.id}_title`),
      text: serverT(lang, `notifications.card.seasonal_${row.id}_text`),
      source: 'curated_seasonal',
    });
  });

  return out.slice(0, 5);
}

module.exports = {
  fetchLocalEvents,
  CITY_SEASONAL,
};
