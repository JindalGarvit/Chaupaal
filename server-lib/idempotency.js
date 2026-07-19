/**
 * Duplicate-request / idempotency helper (Phase 5).
 *
 * Clients send header: Idempotency-Key: <opaque string>
 * Within TTL, a repeated key returns the cached response (or 409 while in-flight).
 *
 * Uses in-memory Map on the function instance; optionally Upstash when configured
 * (cross-instance). Fine for serverless soft-dedupe of double-clicks / retries.
 *
 * PRE-LAUNCH NOTE (error logging deferred):
 * Centralized error logging is intentionally not wired yet — console + Vercel
 * logs are enough with no production users. Closer to / after launch, add
 * Sentry (free tier) as the recommended option for aggregating API + client
 * exceptions. Do not invent a custom logger farm before then.
 */

const crypto = require('crypto');

const MEMORY_TTL_MS = 5 * 60 * 1000;
/** @type {Map<string, { at: number, status: number, body: object, pending?: boolean }>} */
const memory = new Map();

function cleanupMemory() {
  const now = Date.now();
  for (const [k, v] of memory) {
    if (now - v.at > MEMORY_TTL_MS) memory.delete(k);
  }
}

function getIdempotencyKey(req) {
  const raw =
    req.headers['idempotency-key'] ||
    req.headers['Idempotency-Key'] ||
    req.headers['x-idempotency-key'];
  if (typeof raw !== 'string') return null;
  const key = raw.trim().slice(0, 128);
  return key || null;
}

function hashKey(uid, route, key) {
  return crypto.createHash('sha256').update(`${uid || 'anon'}:${route}:${key}`).digest('hex');
}

/**
 * @returns {null | { replay: true, status: number, body: object } | { conflict: true }}
 */
function beginIdempotent(route, uid, key) {
  if (!key) return null;
  cleanupMemory();
  const id = hashKey(uid, route, key);
  const existing = memory.get(id);
  if (existing) {
    if (existing.pending) return { conflict: true };
    return { replay: true, status: existing.status, body: existing.body };
  }
  memory.set(id, { at: Date.now(), status: 0, body: null, pending: true });
  return { id, pending: true };
}

function completeIdempotent(handle, status, body) {
  if (!handle?.id) return;
  memory.set(handle.id, { at: Date.now(), status, body, pending: false });
}

function abortIdempotent(handle) {
  if (!handle?.id) return;
  memory.delete(handle.id);
}

module.exports = {
  getIdempotencyKey,
  beginIdempotent,
  completeIdempotent,
  abortIdempotent,
};
