/**
 * Local events provider — curated India festival/city calendar (free).
 * Interface is pluggable so Ticketmaster/PredictHQ can replace fetchLocalEvents later.
 *
 * Tradeoff (Part 2 judgment call): paid live-event APIs deferred; curated calendar
 * covers festivals + seasonal prompts without ongoing cost or a new serverless fn.
 */

const { festivalForDate } = require('./companion-outreach');

/**
 * Extra curated city/season prompts (month 1–12). Not exhaustive — extend freely.
 */
const CITY_SEASONAL = [
  { id: 'monsoon_chai', months: [6, 7, 8, 9], cities: null, title: 'Monsoon mood', text: 'First rains or a grey sky — anyone up for chai?' },
  { id: 'summer_break', months: [4, 5], cities: null, title: 'Hot afternoon', text: 'Scorching day — what are you doing to stay cool?' },
  { id: 'winter_delhi', months: [12, 1, 2], cities: ['delhi', 'noida', 'gurgaon', 'gurugram'], title: 'Winter in the NCR', text: 'Foggy morning energy — anyone else feeling slow and cozy?' },
  { id: 'mumbai_rain', months: [6, 7, 8, 9], cities: ['mumbai', 'bombay'], title: 'Mumbai rains', text: 'Bombay rains hit different — share a monsoon memory?' },
  { id: 'bangalore_weekend', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], cities: ['bengaluru', 'bangalore'], title: 'Weekend plans', text: 'Bengaluru weekend — cafe hop, trek, or stay in?' },
];

/**
 * @param {{ city?: string, date?: Date, tz?: string }} opts
 * @returns {Promise<Array<{ id: string, title: string, text: string, source: string }>>}
 */
async function fetchLocalEvents(opts = {}) {
  const tz = opts.tz || 'Asia/Kolkata';
  const date = opts.date || new Date();
  const city = String(opts.city || '').toLowerCase().trim();
  const out = [];

  const fest = festivalForDate(date, tz);
  if (fest) {
    out.push({
      id: `festival_${fest.id}`,
      title: fest.name,
      text: fest.wish || `It's ${fest.name} — how are you celebrating?`,
      source: 'curated_festival',
    });
  }

  let month;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      month: 'numeric',
    }).formatToParts(date);
    month = Number(parts.find((p) => p.type === 'month')?.value);
  } catch {
    month = date.getUTCMonth() + 1;
  }

  CITY_SEASONAL.forEach((row) => {
    if (!row.months.includes(month)) return;
    if (row.cities && (!city || !row.cities.some((c) => city.includes(c)))) return;
    out.push({
      id: row.id,
      title: row.title,
      text: row.text,
      source: 'curated_seasonal',
    });
  });

  return out.slice(0, 5);
}

module.exports = {
  fetchLocalEvents,
  CITY_SEASONAL,
};
