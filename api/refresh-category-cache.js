/**
 * Vercel Cron: pre-generate Khabar (news) + Sawaal (mcq) for all seeded categories.
 * Schedule: every 6 hours (see vercel.json). Auth: Bearer CRON_SECRET.
 *
 * Env:
 *   ANTHROPIC_API_KEY
 *   CRON_SECRET
 *   FIREBASE_SERVICE_ACCOUNT_JSON  — stringified service-account JSON
 */
const admin = require('firebase-admin');
const { CACHE_VERSION, generateCatNewsGrounded, generateCatMCQGrounded } = require('./lib/cat-content');
const { sendSuccess, sendError, requireMethod, parseJsonBody } = require('./lib/http');
const { requireCronSecret } = require('./lib/auth');
const { asInt } = require('./lib/validate');

// Flip to false when ready to spend Anthropic credits again (also re-add cron in vercel.json).
const CATEGORY_CRON_PAUSED = true;

// Align with client CAT_CACHE_TTL_MS.
// Hobby Vercel: daily cron. Pro/external: change schedule to 0 */6 * * * and set to 6h.
const REFRESH_MS = 24 * 60 * 60 * 1000;
const FRESH_SKEW_MS = 30 * 60 * 1000; // skip if newer than interval - 30m

const SCHEDULED_CATEGORIES = [
  // Core Akhbaar / ratings categories
  'GK',
  'Sports',
  'Tech',
  'Business',
  'India',
  'World',
  // Categories tab suggestions
  'Cricket',
  'Bollywood',
  'Food & Recipes',
  'Automobiles',
  'Gadgets',
  'Personal Finance',
  'Gaming',
  'Travel',
  'Environment',
  'Music',
  'Football',
  'Fitness',
  'Fashion',
  'Science',
  'Entertainment',
  'Education',
  'Real Estate',
  'Agriculture',
  'Law & Justice',
  'Art & Culture',
];

function initAdmin() {
  if (admin.apps.length) return admin.firestore();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not configured');
  const cred = typeof raw === 'string' ? JSON.parse(raw) : raw;
  admin.initializeApp({ credential: admin.credential.cert(cred) });
  return admin.firestore();
}

function authorize(req) {
  // kept for clarity — prefer requireCronSecret in handler
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.authorization || '';
  return header === `Bearer ${secret}`;
}

function isFresh(data) {
  if (!data || !data.webGrounded || data.cacheVersion !== CACHE_VERSION) return false;
  if (!data.news || !data.mcq) return false;
  const newsTs = typeof data.newsTs === 'number' ? data.newsTs : data.ts;
  const mcqTs = typeof data.mcqTs === 'number' ? data.mcqTs : data.ts;
  if (typeof newsTs !== 'number' || typeof mcqTs !== 'number') return false;
  const ageNews = Date.now() - newsTs;
  const ageMcq = Date.now() - mcqTs;
  return ageNews < REFRESH_MS - FRESH_SKEW_MS && ageMcq < REFRESH_MS - FRESH_SKEW_MS;
}

async function refreshOne(db, catName) {
  const id = catName.toLowerCase();
  const ref = db.collection('category_cache').doc(id);
  const snap = await ref.get();
  if (snap.exists && isFresh(snap.data())) {
    return { category: catName, status: 'skipped_fresh' };
  }

  const news = await generateCatNewsGrounded(catName);
  const mcq = await generateCatMCQGrounded(catName);

  if (!news?.length && !mcq?.length) {
    return { category: catName, status: 'empty' };
  }

  const now = Date.now();
  const payload = {
    name: catName,
    news: news || [],
    mcq: mcq || [],
    ts: now,
    newsTs: now,
    mcqTs: now,
    webGrounded: true,
    cacheVersion: CACHE_VERSION,
    generatedBy: 'cron',
  };
  await ref.set(payload, { merge: true });
  return {
    category: catName,
    status: 'updated',
    newsCount: (news || []).length,
    mcqCount: (mcq || []).length,
  };
}

async function runRefresh({ offset = 0, limit = SCHEDULED_CATEGORIES.length } = {}) {
  const db = initAdmin();
  const slice = SCHEDULED_CATEGORIES.slice(offset, offset + limit);
  const results = [];
  // Leave buffer before Vercel kills the function (~300s max)
  const deadline = Date.now() + 270000;

  for (const cat of slice) {
    if (Date.now() > deadline) {
      results.push({
        category: cat,
        status: 'deferred',
        error: 'Approaching function timeout — re-run with higher offset',
      });
      break;
    }
    try {
      results.push(await refreshOne(db, cat));
    } catch (err) {
      results.push({ category: cat, status: 'error', error: err.message });
    }
  }

  return {
    ok: true,
    cacheVersion: CACHE_VERSION,
    refreshedAt: new Date().toISOString(),
    offset,
    limit,
    totalCategories: SCHEDULED_CATEGORIES.length,
    results,
  };
}

module.exports = async function handler(req, res) {
  // Vercel Cron uses GET; allow POST for manual trigger
  if (!requireMethod(req, res, ['GET', 'POST'])) return;

  if (CATEGORY_CRON_PAUSED) {
    return sendError(
      res,
      503,
      'CRON_PAUSED',
      'Category cache refresh is paused — no Anthropic spend until explicitly re-enabled',
      { paused: true }
    );
  }

  if (!requireCronSecret(req, res)) return;

  try {
    let offset = 0;
    let limit = SCHEDULED_CATEGORIES.length;
    if (req.method === 'POST') {
      try {
        const body = parseJsonBody(req);
        offset = asInt(body.offset, { min: 0, max: 10_000 }) ?? 0;
        limit =
          asInt(body.limit, { min: 1, max: SCHEDULED_CATEGORIES.length }) ??
          SCHEDULED_CATEGORIES.length;
      } catch {
        return sendError(res, 400, 'INVALID_JSON', 'Invalid JSON body');
      }
    } else {
      const q = req.query || {};
      offset = asInt(q.offset, { min: 0, max: 10_000 }) ?? 0;
      limit =
        asInt(q.limit, { min: 1, max: SCHEDULED_CATEGORIES.length }) ??
        SCHEDULED_CATEGORIES.length;
    }

    const summary = await runRefresh({ offset, limit });
    const failed = (summary.results || []).filter((r) => r.status === 'error').length;
    const updated = (summary.results || []).filter((r) => r.status === 'updated').length;
    const deferred = (summary.results || []).filter((r) => r.status === 'deferred').length;
    const data = {
      cacheVersion: summary.cacheVersion,
      refreshedAt: summary.refreshedAt,
      offset: summary.offset,
      limit: summary.limit,
      totalCategories: summary.totalCategories,
      results: summary.results,
      stats: {
        updated,
        failed,
        deferred,
        skipped: (summary.results || []).filter((r) => r.status === 'skipped_fresh').length,
      },
    };
    const ok = updated > 0 || (failed === 0 && deferred === 0);
    return sendSuccess(res, data, { status: failed && !updated ? 502 : 200, meta: { ok } });
  } catch (err) {
    return sendError(res, 500, 'REFRESH_FAILED', err.message || 'Refresh failed');
  }
};

// Pro/Fluid: batch can take several minutes on a cold cache
module.exports.config = { maxDuration: 300 };
