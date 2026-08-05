/**
 * Similar-query discovery candidate cache (quality-first).
 *
 * Caches a SHARED candidate pool (uids + base scores) for identical normalized
 * queries under the same hard audience/intent constraints — then each viewer
 * re-filters (blocks, mute, teen, prefs) and re-ranks.
 *
 * NEVER store another user's final UI list. NEVER put uid / blocks in the key.
 *
 * Similarity: exact normalized match only by default. Near-duplicate skipped
 * when confidence is low (quality > savings).
 *
 * TTL: 45 minutes. Invalidate by bumping CACHE_VERSION on policy changes.
 */
'use strict';

const crypto = require('crypto');

const CACHE_VERSION = 'dq1';
const TTL_MS = 45 * 60 * 1000;
const COLLECTION = 'discovery_query_cache';

/** Light synonym / canonical intent map — keep conservative. */
const INTENT_SYNONYMS = {
  date: 'dating',
  dating: 'dating',
  romance: 'dating',
  marriage: 'dating',
  friend: 'friendship',
  friends: 'friendship',
  friendship: 'friendship',
  job: 'job',
  hire: 'job',
  hiring: 'job',
  cofounder: 'cofounder',
  'co-founder': 'cofounder',
  flatmate: 'flatmate',
  roommate: 'flatmate',
  travel: 'travel',
  gaming: 'gaming',
  music: 'music',
};

function normalizeDiscoveryQuery(raw) {
  let q = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  if (!q) return '';
  // Canonicalize leading intent word when unambiguous
  const parts = q.split(' ');
  if (parts[0] && INTENT_SYNONYMS[parts[0]]) {
    parts[0] = INTENT_SYNONYMS[parts[0]];
    q = parts.join(' ');
  }
  return q;
}

function hardFilterBucket(hardFilters) {
  const hf = hardFilters || {};
  const keys = ['gender', 'city', 'college', 'company', 'ageMin', 'ageMax']
    .filter((k) => hf[k] != null && hf[k] !== '' && hf[k] !== 'any')
    .map((k) => `${k}=${String(hf[k]).toLowerCase()}`);
  keys.sort();
  return keys.join('|') || 'none';
}

/**
 * Audience bucket from plan — shared across viewers with same teen/gender rules
 * already encoded in hard filters. Viewer-specific blocks stay OUT of the key.
 */
function audienceBucket(plan) {
  const intent = String(plan?.searchIntent || 'any').toLowerCase();
  const hard = hardFilterBucket(plan?.hardFilters);
  const assumptions = (plan?.appliedAssumptionIds || []).slice().sort().join(',');
  return `${intent}|${hard}|a:${assumptions || 'none'}`;
}

function buildDiscoveryCacheKey({ query, plan }) {
  const norm = normalizeDiscoveryQuery(query || plan?.query);
  if (!norm) return null;
  // Skip cache for ultra-short / ambiguous queries — quality guard
  if (norm.length < 3) return null;
  const bucket = audienceBucket(plan);
  const raw = `${CACHE_VERSION}|${norm}|${bucket}`;
  const hash = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 40);
  return { docId: hash, norm, bucket, raw };
}

async function readDiscoveryCandidateCache(db, keyInfo) {
  if (!db || !keyInfo?.docId) return null;
  try {
    const snap = await db.collection(COLLECTION).doc(keyInfo.docId).get();
    if (!snap.exists) return { hit: false, reason: 'miss' };
    const data = snap.data() || {};
    if (data.cacheVersion !== CACHE_VERSION) return { hit: false, reason: 'version' };
    const ts = typeof data.ts === 'number' ? data.ts : 0;
    if (!ts || Date.now() - ts > TTL_MS) return { hit: false, reason: 'ttl' };
    if (!Array.isArray(data.candidates) || !data.candidates.length) {
      return { hit: false, reason: 'empty' };
    }
    return {
      hit: true,
      candidates: data.candidates,
      planSnapshot: data.planSnapshot || null,
      norm: data.norm,
      ts,
    };
  } catch (e) {
    console.warn('[discovery-cache] read', e?.message || e);
    return { hit: false, reason: 'error' };
  }
}

async function writeDiscoveryCandidateCache(db, keyInfo, { candidates, plan }) {
  if (!db || !keyInfo?.docId || !Array.isArray(candidates)) return;
  // Cap shared pool — ranked ids + scores only (no PII blobs)
  const slim = candidates.slice(0, 80).map((c) => ({
    uid: c.uid,
    score: typeof c.score === 'number' ? Math.round(c.score * 1000) / 1000 : 0,
  }));
  try {
    await db
      .collection(COLLECTION)
      .doc(keyInfo.docId)
      .set(
        {
          cacheVersion: CACHE_VERSION,
          norm: keyInfo.norm,
          bucket: keyInfo.bucket,
          ts: Date.now(),
          ttlMs: TTL_MS,
          candidates: slim,
          planSnapshot: {
            searchIntent: plan?.searchIntent || 'any',
            hardFilters: plan?.hardFilters || {},
            appliedAssumptionIds: plan?.appliedAssumptionIds || [],
            version: plan?.version || null,
          },
        },
        { merge: true }
      );
  } catch (e) {
    console.warn('[discovery-cache] write', e?.message || e);
  }
}

/**
 * Quality guard: skip caching when query is too vague or hard filters conflict.
 */
function shouldCacheDiscoveryQuery({ query, plan }) {
  const norm = normalizeDiscoveryQuery(query || plan?.query);
  if (!norm || norm.length < 4) return false;
  // Very open "any" with no hard filters + short query → miss (precision risk)
  const intent = plan?.searchIntent || 'any';
  const hardKeys = Object.keys(plan?.hardFilters || {}).filter(
    (k) => plan.hardFilters[k] != null && plan.hardFilters[k] !== '' && plan.hardFilters[k] !== 'any'
  );
  if (intent === 'any' && hardKeys.length === 0 && norm.split(' ').length < 2) return false;
  return true;
}

module.exports = {
  CACHE_VERSION,
  TTL_MS,
  COLLECTION,
  normalizeDiscoveryQuery,
  buildDiscoveryCacheKey,
  readDiscoveryCandidateCache,
  writeDiscoveryCandidateCache,
  shouldCacheDiscoveryQuery,
  audienceBucket,
};
