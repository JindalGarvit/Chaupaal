/**
 * Infra I1 soak — category cron dogfood invariants (extends I0).
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

require('./test-infra-i0.js');

const refresh = read('api/refresh-category-cache.js');
const enrich = read('server-lib/ai-enrichment.js');
const cats = read('public/src/js/features/categories.js');
const envEx = read('.env.example');
const conventions = read('CONVENTIONS.md');
const auth = read('server-lib/auth.js');

assert(/bumpBudget\(db,\s*admin/.test(refresh), 'cron bumps aiBudget after generates');
assert(/bumpBudget,/.test(enrich) || /bumpBudget\s*,/.test(enrich), 'bumpBudget exported');
assert(/Only write sides that succeeded|never merge empty/.test(refresh), 'partial field merge safe');
assert(/limit == null \? jobs\.length/.test(refresh), 'default limit = all scoped jobs');
assert(/webGrounded.*cacheVersion|cacheVersion!==CAT_CACHE_VERSION/.test(cats), 'hasUsableCatCache gates webGrounded v2');
assert(/AI_JOBS_PAUSED/.test(envEx), 'unpause checklist mentions AI_JOBS_PAUSED');
assert(/CAT_LIVE_AI_PAUSED.*hardcoded|client const/i.test(envEx), 'CAT_LIVE_AI_PAUSED not fake env');
assert(/header !== `Bearer \$\{secret\}`/.test(auth), 'cron auth Bearer secret');
assert(/Infra I1/.test(conventions), 'CONVENTIONS documents I1 soak');

const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js = 12 (got ${apiCount})`);

console.log('\nInfra I1 soak checks passed.');
