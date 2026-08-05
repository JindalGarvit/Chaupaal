/**
 * Shared Khabar/Sawaal cache identity.
 *
 * Keys are shareable across users with the same relevance slice — generate once,
 * serve many. Never include viewer uid / blocks / private context.
 *
 * Format: `{catSlug}__{istDay}` optionally `__c_{citySlug}` and/or `__i_{industrySlug}`
 * Legacy docs used bare `{catSlug}` — readers should fall back.
 *
 * TTL: IST calendar day bucket + REFRESH_MS (24h) freshness check.
 * Custom categories use the same scheme when shareable (no PII in the slug).
 */
'use strict';

const CACHE_VERSION = 'v2';
const TTL_MS = 24 * 60 * 60 * 1000;

function slugPart(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_\-]/g, '')
    .slice(0, 48);
}

/** YYYY-MM-DD in Asia/Kolkata */
function istDayKey(date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch (e) {
    const d = new Date(date.getTime() + 5.5 * 3600 * 1000);
    return d.toISOString().slice(0, 10);
  }
}

/**
 * @param {object} opts
 * @param {string} opts.category - category name (GK, Sports, custom…)
 * @param {string} [opts.city] - city / geo slug when news is geo-tagged
 * @param {string} [opts.industry] - industry when professional-tagged
 * @param {string|Date} [opts.day] - IST day override
 * @param {boolean} [opts.includeDay=true]
 */
function buildCatCacheDocId(opts = {}) {
  const cat = slugPart(opts.category);
  if (!cat) return null;
  const parts = [cat];
  if (opts.includeDay !== false) {
    const day =
      typeof opts.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(opts.day)
        ? opts.day
        : istDayKey(opts.day instanceof Date ? opts.day : new Date());
    parts.push(day);
  }
  const city = slugPart(opts.city);
  if (city) parts.push(`c_${city}`);
  const industry = slugPart(opts.industry);
  if (industry) parts.push(`i_${industry}`);
  return parts.join('__');
}

/** Prefer day-keyed id; also return legacy bare category id for fallback reads. */
function catCacheLookupIds(opts = {}) {
  const dayId = buildCatCacheDocId({ ...opts, includeDay: true });
  const legacy = slugPart(opts.category);
  const ids = [];
  if (dayId) ids.push(dayId);
  if (legacy && legacy !== dayId) ids.push(legacy);
  return ids;
}

function isCatCacheFresh(data, { ttlMs = TTL_MS, skewMs = 30 * 60 * 1000 } = {}) {
  if (!data || !data.webGrounded || data.cacheVersion !== CACHE_VERSION) return false;
  if (!data.news || !data.mcq) return false;
  const newsTs = typeof data.newsTs === 'number' ? data.newsTs : data.ts;
  const mcqTs = typeof data.mcqTs === 'number' ? data.mcqTs : data.ts;
  if (typeof newsTs !== 'number' || typeof mcqTs !== 'number') return false;
  const limit = ttlMs - skewMs;
  return Date.now() - newsTs < limit && Date.now() - mcqTs < limit;
}

module.exports = {
  CACHE_VERSION,
  TTL_MS,
  slugPart,
  istDayKey,
  buildCatCacheDocId,
  catCacheLookupIds,
  isCatCacheFresh,
};
