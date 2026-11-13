/**
 * Seasonal calendar (Global L6) — festivals, holidays and national days scoped by Region. Shared by the
 * server (companion festival cards: server-lib/companion-outreach.js) and the client (seasonal prompts).
 * Grew out of the D1 FESTIVAL_CALENDAR: `regions: null` = everyone, otherwise only users whose Region
 * (getRegionPrefs().country) is listed. Never keyed by UI language.
 *
 * Dates: `fixed: [month, day]`; `rule` for computable ones (Easter-based, nth weekday); `dates` per year for
 * lunar / lunisolar ones (approximate where moon sighting decides — maintain the table yearly; a year that is
 * not in the table matches nothing rather than a wrong day).
 * Copy: notifications.card.festival_<id>_{name,wish} (catalog keys — no inline English).
 *
 * UMD: window.SeasonalCalendar in the browser, module.exports in Node.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.SeasonalCalendar = api;
  else if (root) root.SeasonalCalendar = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const list = (s) => s.split(' ');
  const CHRISTMAS = list('US GB CA AU NZ IE DE FR ES IT PT NL BE AT CH SE NO DK FI PL CZ SK HU RO HR SI GR CY MT LU IS LI BR MX AR CO CL PE PH ZA KE NG GH');
  const MUSLIM_MAJORITY = list('PK BD ID MY AE SA QA KW BH OM EG JO IQ MA DZ TN LY SD YE TR SN NG BN MV AF');

  const EVENTS = [
    { id: 'new_year', regions: null, fixed: [1, 1] },
    { id: 'lunar_new_year', regions: list('CN TW HK MO SG MY KR VN ID'), dates: { 2026: [2, 17], 2027: [2, 6], 2028: [1, 26] } },
    { id: 'eid_al_fitr', regions: MUSLIM_MAJORITY.concat(['IN', 'GB']), dates: { 2026: [3, 20], 2027: [3, 10], 2028: [2, 27] } },
    { id: 'eid_al_adha', regions: MUSLIM_MAJORITY.concat(['IN', 'GB']), dates: { 2026: [5, 27], 2027: [5, 17], 2028: [5, 5] } },
    { id: 'carnival', regions: list('BR PT'), rule: 'easter-47' },
    { id: 'easter', regions: list('US GB CA AU NZ IE DE FR ES IT PT NL BE AT CH PL BR MX AR CO CL PE PH'), rule: 'easter' },
    { id: 'republic_day', regions: ['IN'], fixed: [1, 26] },
    { id: 'holi', regions: ['IN', 'NP'], dates: { 2026: [3, 4], 2027: [3, 22], 2028: [3, 11] } },
    { id: 'bd_independence', regions: ['BD'], fixed: [3, 26] },
    { id: 'pohela_boishakh', regions: ['BD'], fixed: [4, 14] },
    { id: 'golden_week', regions: ['JP'], fixed: [5, 3] },
    { id: 'us_independence', regions: ['US'], fixed: [7, 4] },
    { id: 'pk_independence', regions: ['PK'], fixed: [8, 14] },
    { id: 'independence_day', regions: ['IN'], fixed: [8, 15] },
    { id: 'id_independence', regions: ['ID'], fixed: [8, 17] },
    { id: 'ganesh_chaturthi', regions: ['IN'], dates: { 2026: [9, 14], 2027: [9, 4], 2028: [8, 23] } },
    { id: 'br_independence', regions: ['BR'], fixed: [9, 7] },
    { id: 'sa_national_day', regions: ['SA'], fixed: [9, 23] },
    { id: 'chuseok', regions: ['KR'], dates: { 2026: [9, 25], 2027: [9, 15], 2028: [10, 3] } },
    { id: 'gandhi_jayanti', regions: ['IN'], fixed: [10, 2] },
    { id: 'german_unity', regions: ['DE'], fixed: [10, 3] },
    { id: 'diwali', regions: list('IN NP LK MY SG MU FJ TT GY SR'), dates: { 2026: [11, 8], 2027: [10, 29], 2028: [10, 17] } },
    { id: 'halloween', regions: list('US CA GB IE'), fixed: [10, 31] },
    { id: 'thanksgiving', regions: ['US'], rule: 'nth:11:4:4' },
    { id: 'uae_national_day', regions: ['AE'], fixed: [12, 2] },
    { id: 'bd_victory_day', regions: ['BD'], fixed: [12, 16] },
    { id: 'christmas', regions: CHRISTMAS, fixed: [12, 25] },
  ];
  // D1 shape kept for callers that read month/day directly.
  EVENTS.forEach((e) => {
    if (e.fixed) {
      e.month = e.fixed[0];
      e.day = e.fixed[1];
    }
  });

  /** Gregorian Easter Sunday (Anonymous algorithm) → [month, day]. */
  function easter(y) {
    const a = y % 19;
    const b = Math.floor(y / 100);
    const c = y % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return [month, day];
  }

  function shift([m, d], y, days) {
    const t = new Date(Date.UTC(y, m - 1, d) + days * 86400000);
    return [t.getUTCMonth() + 1, t.getUTCDate()];
  }

  /** [month, day] of an event in a year, or null when unknown for that year. */
  function dateOf(ev, year) {
    if (!ev) return null;
    if (ev.fixed) return ev.fixed.slice();
    if (ev.dates) return ev.dates[year] ? ev.dates[year].slice() : null;
    if (ev.rule === 'easter') return easter(year);
    const em = /^easter([+-]\d+)$/.exec(ev.rule || '');
    if (em) return shift(easter(year), year, Number(em[1]));
    const nm = /^nth:(\d+):(\d):(\d)$/.exec(ev.rule || ''); // nth:<month>:<weekday 0-6>:<n>
    if (nm) {
      const month = Number(nm[1]);
      const wd = Number(nm[2]);
      const n = Number(nm[3]);
      const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
      return [month, 1 + ((wd - first + 7) % 7) + (n - 1) * 7];
    }
    return null;
  }

  function localYmd(date, tz) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(date);
      const get = (t) => Number(parts.find((p) => p.type === t).value);
      return [get('year'), get('month'), get('day')];
    } catch (e) {
      return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
    }
  }

  function observedIn(ev, country) {
    const c = String(country || '').toUpperCase();
    return !ev.regions || (!!c && ev.regions.indexOf(c) >= 0);
  }

  /** Events observed in a country (null / unknown → only the global ones). */
  function eventsFor(country) {
    return EVENTS.filter((e) => observedIn(e, country));
  }

  /** The event on this local day for this Region, or null. */
  function eventForDate(date, tz, country) {
    const d = date instanceof Date ? date : new Date(date == null ? Date.now() : date);
    const [y, m, day] = localYmd(d, tz);
    return eventsFor(country).find((e) => {
      const md = dateOf(e, y);
      return md && md[0] === m && md[1] === day;
    }) || null;
  }

  /** Events in the next `days` days (inclusive of today) for seasonal prompts: [{ id, event, inDays }]. */
  function upcoming(date, country, days, tz) {
    const d = date instanceof Date ? date : new Date(date == null ? Date.now() : date);
    const [y, m, day] = localYmd(d, tz);
    const today = Date.UTC(y, m - 1, day);
    const out = [];
    eventsFor(country).forEach((e) => {
      [y, y + 1].forEach((yy) => {
        const md = dateOf(e, yy);
        if (!md) return;
        const inDays = Math.round((Date.UTC(yy, md[0] - 1, md[1]) - today) / 86400000);
        if (inDays >= 0 && inDays <= (days == null ? 7 : days)) out.push({ id: e.id, event: e, inDays });
      });
    });
    return out.sort((a, b) => a.inDays - b.inDays);
  }

  return { EVENTS, dateOf, easter, eventsFor, eventForDate, upcoming, observedIn };
});
