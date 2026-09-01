/**
 * Upstash Redis rate limiting (Phase 4).
 *
 * Dependencies (explained once):
 * - `@upstash/redis` — serverless REST client for Upstash Redis free tier
 *   (10k commands/day; enough for early Chaupaal write volume).
 * - `@upstash/ratelimit` — sliding-window helpers on top of Redis.
 *
 * Env: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 * (from Upstash console → Redis → REST API).
 *
 * Limits — sized for a genuine heavy user, not overly conservative:
 *   like     60/min  ·  600/hour   (rapid scroll-liking)
 *   follow   20/min  ·  150/hour   (bulk-follow spam starts above this)
 *   message  40/min  ·  400/hour   (active long chat / group)
 *   comment  20/min  ·  150/hour
 *   post      6/min  ·   40/hour   (media posts take longer anyway)
 *
 * If Upstash is not configured, callers should allow (degraded open).
 */

const { Redis } = require('@upstash/redis');
const { Ratelimit } = require('@upstash/ratelimit');

const LIMITS = {
  like: { minute: 60, hour: 600 },
  follow: { minute: 20, hour: 150 },
  message: { minute: 40, hour: 400 },
  comment: { minute: 20, hour: 150 },
  post: { minute: 6, hour: 40 },
  // AI calls (Anthropic / Chaupaal chat) — expensive per request
  ai: { minute: 10, hour: 120 },
  chaupaal_nav: { minute: 40, hour: 400 },
  // Intent people discovery (Khoj / Vriksha) — LLM parse when AI on + Firestore retrieve
  discovery: { minute: 20, hour: 200 },
  dangal: { minute: 40, hour: 400 },
  // Music search/resolve, geocode, URL safety — third-party lookups
  media_lookup: { minute: 40, hour: 400 },
  // GIF search (Klipy proxy) — typing debounce still fires often
  gif_search: { minute: 30, hour: 300 },
  // YouTube Data API Search.list is 100 quota units — keep this tight.
  youtube_search: { minute: 8, hour: 40 },
  // Pre-auth signup username availability (per IP)
  username_check: { minute: 30, hour: 300 },
};

let redis = null;
/** @type {Map<string, import('@upstash/ratelimit').Ratelimit>} */
const limiters = new Map();

function getRedis() {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

function getLimiter(action, window) {
  const key = `${action}:${window}`;
  if (limiters.has(key)) return limiters.get(key);
  const r = getRedis();
  if (!r) return null;
  const cfg = LIMITS[action];
  if (!cfg) return null;
  const limit = window === 'hour' ? cfg.hour : cfg.minute;
  const duration = window === 'hour' ? '1 h' : '1 m';
  const limiter = new Ratelimit({
    redis: r,
    limiter: Ratelimit.slidingWindow(limit, duration),
    prefix: `chaupaal:rl:${action}:${window}`,
  });
  limiters.set(key, limiter);
  return limiter;
}

/**
 * @param {string} uid
 * @param {string} action
 * @returns {Promise<{ ok: boolean, remaining?: number, reset?: number, limit?: number, configured: boolean, window?: string }>}
 */
async function checkActionRateLimit(uid, action) {
  try {
    if (!LIMITS[action]) {
      return { ok: true, configured: true, remaining: null };
    }
    if (!getRedis()) {
      return { ok: true, configured: false, remaining: null };
    }

    const id = `${uid}:${action}`;
    let lastOk = null;
    for (const window of ['minute', 'hour']) {
      const limiter = getLimiter(action, window);
      if (!limiter) continue;
      const result = await limiter.limit(id);
      lastOk = result;
      if (!result.success) {
        return {
          ok: false,
          configured: true,
          remaining: result.remaining,
          reset: result.reset,
          limit: result.limit,
          window,
        };
      }
    }

    return {
      ok: true,
      configured: true,
      remaining: lastOk?.remaining ?? LIMITS[action].minute,
      reset: lastOk?.reset,
      limit: LIMITS[action].minute,
    };
  } catch (e) {
    console.warn('[rate-limit] fail open', action, e?.message || e);
    return { ok: true, configured: false, remaining: null, degraded: true };
  }
}

module.exports = {
  LIMITS,
  checkActionRateLimit,
  getRedis,
};

/** Pre-auth IP rate limit (e.g. username_check). Degrades open when Redis missing. */
async function checkIpRateLimit(ip, action) {
  const safeIp = String(ip || 'unknown').slice(0, 64);
  return checkActionRateLimit(`ip:${safeIp}`, action);
}

module.exports.checkIpRateLimit = checkIpRateLimit;
