/**
 * Infra I0 — Hobby-safe category cache cron wiring.
 */
'use strict';

const fs = require('fs');
const path = require('path');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  console.log('✓', msg);
}

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const vercel = JSON.parse(read('vercel.json'));
const refresh = read('api/refresh-category-cache.js');
const envEx = read('.env.example');
const cats = read('public/src/js/features/categories.js');
const conventions = read('CONVENTIONS.md');
const { isCategoryCronPaused, isAiFeaturesEnabled } = require('../server-lib/ai-config');

const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js = 12 (got ${apiCount})`);
assert(!fs.existsSync(path.join(root, 'api', 'category-cache-cron.js')), 'no extra cron api file');

const crons = vercel.crons || [];
assert(
  crons.some((c) => c.path === '/api/refresh-category-cache'),
  'vercel.json schedules refresh-category-cache'
);
assert(
  crons.some((c) => c.path === '/api/chaupaal-scheduler'),
  'chaupaal-scheduler cron retained'
);
const catCron = crons.find((c) => c.path === '/api/refresh-category-cache');
assert(catCron && /^\d+ \d+ \* \* \*$/.test(catCron.schedule), 'category cron is daily Hobby cadence');

assert(/isCategoryCronPaused\(\)/.test(refresh), 'handler checks pause gate');
assert(/skipPayload\('CATEGORY_CRON_PAUSED'\)/.test(refresh), 'paused → success no-op');
assert(/skipPayload\('AI_DISABLED'\)/.test(refresh), 'AI off → success no-op');
assert(/skipPayload\('AI_BUDGET'/.test(refresh), 'budget → success no-op');
assert(/AI_DAILY_CALL_CAP — stopping mid-run/.test(refresh), 'mid-run budget stop');
assert(/status: 'error'/.test(refresh) && /continue other categories|Partial failure/.test(refresh), 'partial failure continues');
assert(/requireCronSecret/.test(refresh), 'CRON_SECRET required');
assert(!/sendError\(\s*res,\s*503,\s*'CRON_PAUSED'/.test(refresh), 'paused no longer hard 503');

const prev = process.env.CATEGORY_CRON_PAUSED;
delete process.env.CATEGORY_CRON_PAUSED;
assert(isCategoryCronPaused() === true, 'default CATEGORY_CRON_PAUSED paused');
process.env.CATEGORY_CRON_PAUSED = 'false';
assert(isCategoryCronPaused() === false, 'unpause via CATEGORY_CRON_PAUSED=false');
if (prev === undefined) delete process.env.CATEGORY_CRON_PAUSED;
else process.env.CATEGORY_CRON_PAUSED = prev;

assert(/Not live AI news/.test(cats), 'client cold cache honest Offline copy');
assert(/CAT_LIVE_AI_PAUSED\s*=\s*true/.test(cats), 'client live AI still paused by default');
assert(/CATEGORY_CRON_PAUSED=false/.test(envEx), 'env example unpause checklist');
assert(/0 2 \* \* \*/.test(envEx) || /refresh-category-cache/.test(envEx), 'env example documents schedule');
assert(/Infra I0/.test(conventions), 'CONVENTIONS documents I0');
assert(!/vector index productization/.test(refresh), 'no vector build in refresh handler');

console.log('\nInfra I0 category cron checks passed.');
console.log('AI_FEATURES_ENABLED currently', isAiFeaturesEnabled());
