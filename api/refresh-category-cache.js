/**
 * Vercel Cron: pre-generate Khabar (news) + Sawaal (mcq) for seeded categories.
 * Schedule: daily Hobby-safe `0 2 * * *` (~07:30 IST ±59m) — see vercel.json.
 * Auth: Bearer CRON_SECRET (Vercel Cron / manual).
 *
 * Env (no invented keys — see .env.example):
 *   CRON_SECRET
 *   FIREBASE_SERVICE_ACCOUNT_JSON
 *   AI_FEATURES_ENABLED=true          master LLM gate
 *   CATEGORY_CRON_PAUSED=false        unpause (default paused)
 *   AI_DAILY_CALL_CAP                 shared with enrichment
 *   AI_PROVIDER + provider keys       anthropic | openai-compatible | …
 *   CAT_CACHE_CITIES / CAT_CACHE_INDUSTRIES  optional (max 8 / 6)
 *
 * Pause / AI-off / budget → 200 no-op (no spend, prior caches kept).
 * Do not raise maxDuration unless inspect proves duration failure.
 */
const admin = require('firebase-admin');
const {
  CACHE_VERSION,
  TTL_MS,
  generateCatNewsGrounded,
  generateCatMCQGrounded,
  buildCatCacheDocId,
  isCatCacheFresh,
  istDayKey,
} = require('../server-lib/cat-content');
const { sendSuccess, sendError, requireMethod, parseJsonBody } = require('../server-lib/http');
const { requireCronSecret } = require('../server-lib/auth');
const { asInt } = require('../server-lib/validate');

// Flip via env CATEGORY_CRON_PAUSED=false when ready (default paused — P8 / I0).
// Also gated by master AI_FEATURES_ENABLED via callAI(), plus AI_DAILY_CALL_CAP budget.
const { isAiFeaturesEnabled, isCategoryCronPaused, AI_DAILY_CALL_CAP } = require('../server-lib/ai-config');

// Align with client CAT_CACHE_TTL_MS / server-lib/cat-cache-keys TTL_MS (24h Hobby).
const REFRESH_MS = TTL_MS || 24 * 60 * 60 * 1000;
const FRESH_SKEW_MS = 30 * 60 * 1000; // skip if newer than interval - 30m

/** Optional city / industry scopes — generate once, reuse for all matching users. */
const GEO_SCOPES = (process.env.CAT_CACHE_CITIES || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .slice(0, 8);
const INDUSTRY_SCOPES = (process.env.CAT_CACHE_INDUSTRIES || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .slice(0, 6);

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

function isFresh(data) {
  return isCatCacheFresh(data, { ttlMs: REFRESH_MS, skewMs: FRESH_SKEW_MS });
}

function skipPayload(reason, extra) {
  return Object.assign(
    {
      ok: true,
      skipped: true,
      reason,
      paused: true,
      cacheVersion: CACHE_VERSION,
      istDay: istDayKey(),
      refreshedAt: new Date().toISOString(),
      results: [],
      stats: { updated: 0, failed: 0, deferred: 0, skipped: 0 },
    },
    extra || {}
  );
}

/**
 * Refresh one shareable cache doc. Key = category + IST day [+ city] [+ industry].
 * Same story is not AI-generated N times the same day for N users.
 */
async function refreshOne(db, catName, scope = {}) {
  const day = istDayKey();
  const id =
    buildCatCacheDocId({
      category: catName,
      city: scope.city,
      industry: scope.industry,
      day,
    }) || catName.toLowerCase();
  const ref = db.collection('category_cache').doc(id);
  const snap = await ref.get();
  if (snap.exists && isFresh(snap.data())) {
    return {
      category: catName,
      cacheId: id,
      status: 'skipped_fresh',
      city: scope.city || null,
      industry: scope.industry || null,
    };
  }

  const { bumpBudget } = require('../server-lib/ai-enrichment');

  const news = await generateCatNewsGrounded(catName, scope);
  try {
    await bumpBudget(db, admin, { calls: 1, tokensEst: 800 });
  } catch (e) {
    console.warn('[refresh-category-cache] bumpBudget news', e?.message || e);
  }

  const mcq = await generateCatMCQGrounded(catName, scope);
  try {
    await bumpBudget(db, admin, { calls: 1, tokensEst: 800 });
  } catch (e) {
    console.warn('[refresh-category-cache] bumpBudget mcq', e?.message || e);
  }

  const newsOk = Array.isArray(news) && news.length > 0;
  const mcqOk = Array.isArray(mcq) && mcq.length > 0;
  if (!newsOk && !mcqOk) {
    return { category: catName, cacheId: id, status: 'empty' };
  }

  const now = Date.now();
  // Only write sides that succeeded — never merge empty arrays over prior good fields
  const payload = {
    name: catName,
    ts: now,
    webGrounded: true,
    cacheVersion: CACHE_VERSION,
    generatedBy: 'cron',
    istDay: day,
    city: scope.city || null,
    industry: scope.industry || null,
    cacheKey: id,
  };
  if (newsOk) {
    payload.news = news;
    payload.newsTs = now;
  }
  if (mcqOk) {
    payload.mcq = mcq;
    payload.mcqTs = now;
  }
  await ref.set(payload, { merge: true });
  // Also mirror to legacy bare-category id for older clients (base scope only)
  if (!scope.city && !scope.industry) {
    await db
      .collection('category_cache')
      .doc(catName.toLowerCase())
      .set({ ...payload, cacheKey: catName.toLowerCase() }, { merge: true });
  }
  return {
    category: catName,
    cacheId: id,
    status: 'updated',
    newsCount: newsOk ? news.length : 0,
    mcqCount: mcqOk ? mcq.length : 0,
    city: scope.city || null,
    industry: scope.industry || null,
  };
}

function buildRefreshJobs(categories) {
  const jobs = [];
  for (const cat of categories) {
    jobs.push({ catName: cat, scope: {} });
    for (const city of GEO_SCOPES) {
      jobs.push({ catName: cat, scope: { city } });
    }
    for (const industry of INDUSTRY_SCOPES) {
      jobs.push({ catName: cat, scope: { industry } });
    }
  }
  return jobs;
}

async function runRefresh({ offset = 0, limit = null, db: dbIn } = {}) {
  const db = dbIn || initAdmin();
  const jobs = buildRefreshJobs(SCHEDULED_CATEGORIES);
  const effectiveLimit = limit == null ? jobs.length : limit;
  const slice = jobs.slice(offset, offset + effectiveLimit);
  const results = [];
  // Leave buffer before Vercel kills the function (~300s max — do not raise without evidence)
  const deadline = Date.now() + 270000;

  let loadBudget = null;
  let budgetAllows = null;
  try {
    const enrich = require('../server-lib/ai-enrichment');
    loadBudget = enrich.loadBudget;
    budgetAllows = enrich.budgetAllows;
  } catch (e) {
    console.warn('[refresh-category-cache] budget helpers unavailable', e?.message || e);
  }

  for (const job of slice) {
    if (Date.now() > deadline) {
      results.push({
        category: job.catName,
        status: 'deferred',
        error: 'Approaching function timeout — re-run with higher offset',
      });
      break;
    }
    // Mid-run budget stop — prior successful writes stay intact
    if (loadBudget && budgetAllows) {
      try {
        const budget = await loadBudget(db);
        if (!budgetAllows(budget) || budget.calls >= AI_DAILY_CALL_CAP) {
          results.push({
            category: job.catName,
            status: 'deferred',
            error: 'AI_DAILY_CALL_CAP — stopping mid-run; prior caches kept',
            calls: budget.calls,
            cap: AI_DAILY_CALL_CAP,
          });
          break;
        }
      } catch (e) {
        console.warn('[refresh-category-cache] mid-run budget', e?.message || e);
      }
    }
    try {
      results.push(await refreshOne(db, job.catName, job.scope));
    } catch (err) {
      // Partial failure: continue other categories; never wipe good docs
      results.push({ category: job.catName, status: 'error', error: err.message });
    }
  }

  return {
    ok: true,
    cacheVersion: CACHE_VERSION,
    istDay: istDayKey(),
    refreshedAt: new Date().toISOString(),
    offset,
    limit: effectiveLimit,
    totalJobs: jobs.length,
    totalCategories: SCHEDULED_CATEGORIES.length,
    results,
  };
}

module.exports = async function handler(req, res) {
  // Vercel Cron uses GET; allow POST for manual trigger
  if (!requireMethod(req, res, ['GET', 'POST'])) return;

  if (!requireCronSecret(req, res)) return;

  // Clean no-ops (200) so cron does not error-loop / retry-spam
  if (isCategoryCronPaused()) {
    console.log('[refresh-category-cache] no-op: CATEGORY_CRON_PAUSED (default)');
    return sendSuccess(res, skipPayload('CATEGORY_CRON_PAUSED'));
  }

  if (!isAiFeaturesEnabled()) {
    console.log('[refresh-category-cache] no-op: AI_FEATURES_ENABLED off');
    return sendSuccess(res, skipPayload('AI_DISABLED'));
  }

  let db;
  try {
    db = initAdmin();
  } catch (err) {
    return sendError(res, 500, 'FIREBASE_CONFIG', err.message || 'Firebase init failed');
  }

  // Shared daily call budget with enrichment jobs (P8)
  try {
    const { loadBudget, budgetAllows } = require('../server-lib/ai-enrichment');
    const budget = await loadBudget(db);
    if (!budgetAllows(budget) || budget.calls >= AI_DAILY_CALL_CAP) {
      console.log('[refresh-category-cache] no-op: AI_DAILY_CALL_CAP', budget.calls, '/', AI_DAILY_CALL_CAP);
      return sendSuccess(
        res,
        skipPayload('AI_BUDGET', { calls: budget.calls, cap: AI_DAILY_CALL_CAP })
      );
    }
  } catch (e) {
    console.warn('[refresh-category-cache] budget check', e?.message || e);
  }

  try {
    let offset = 0;
    let limit = null; // null → all jobs (base + geo/industry scopes)
    if (req.method === 'POST') {
      try {
        const body = parseJsonBody(req);
        offset = asInt(body.offset, { min: 0, max: 10_000 }) ?? 0;
        if (body.limit != null) {
          limit = asInt(body.limit, { min: 1, max: 500 }) ?? null;
        }
      } catch {
        return sendError(res, 400, 'INVALID_JSON', 'Invalid JSON body');
      }
    } else {
      const q = req.query || {};
      offset = asInt(q.offset, { min: 0, max: 10_000 }) ?? 0;
      if (q.limit != null && q.limit !== '') {
        limit = asInt(q.limit, { min: 1, max: 500 }) ?? null;
      }
    }

    const summary = await runRefresh({ offset, limit, db });
    const failed = (summary.results || []).filter((r) => r.status === 'error').length;
    const updated = (summary.results || []).filter((r) => r.status === 'updated').length;
    const deferred = (summary.results || []).filter((r) => r.status === 'deferred').length;
    const data = {
      ok: true,
      skipped: false,
      cacheVersion: summary.cacheVersion,
      istDay: summary.istDay,
      refreshedAt: summary.refreshedAt,
      offset: summary.offset,
      limit: summary.limit,
      totalCategories: summary.totalCategories,
      totalJobs: summary.totalJobs,
      results: summary.results,
      stats: {
        updated,
        failed,
        deferred,
        skipped: (summary.results || []).filter((r) => r.status === 'skipped_fresh').length,
        empty: (summary.results || []).filter((r) => r.status === 'empty').length,
      },
    };
    // Partial failures still 200 when anything updated or only skips — prior caches intact
    const status = failed && !updated && deferred === 0 ? 502 : 200;
    return sendSuccess(res, data, { status, meta: { ok: status === 200 } });
  } catch (err) {
    return sendError(res, 500, 'REFRESH_FAILED', err.message || 'Refresh failed');
  }
};

module.exports.runRefresh = runRefresh;
module.exports.SCHEDULED_CATEGORIES = SCHEDULED_CATEGORIES;
module.exports.skipPayload = skipPayload;

// Pro/Fluid: batch can take several minutes on a cold cache — leave as configured in vercel.json
module.exports.config = { maxDuration: 300 };
