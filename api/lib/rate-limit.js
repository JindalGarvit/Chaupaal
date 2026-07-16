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
}

module.exports = {
  LIMITS,
  checkActionRateLimit,
  getRedis,
};
