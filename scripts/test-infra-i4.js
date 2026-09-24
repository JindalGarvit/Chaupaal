/**
 * Infra I4 close — dogfood + soak across I0–I3 (static; no live Firebase/Vercel).
 * Checklist: category cron, vector people, content embeds, jobs/env, hygiene.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  console.log('✓', msg);
}

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function runScript(rel) {
  console.log(`\n=== ${rel} ===`);
  execFileSync(process.execPath, [path.join(root, rel)], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
}

runScript('scripts/test-infra-i1.js');
runScript('scripts/test-retrieve-rank.js');
runScript('scripts/test-infra-i3.js');
runScript('scripts/test-p9-dogfood.js');

console.log('\n=== I4 close hygiene ===');
const {
  RETRIEVAL_BACKEND,
  VECTOR_PREFILTER_CAP,
  VECTOR_HYDRATE_CAP,
  PEOPLE_RETRIEVE_DEFAULT,
  CONTENT_WEIGHTS,
} = require('../server-lib/retrieve-rank');
const { embedBudgetAllows, AI_DAILY_CALL_CAP } = require('../server-lib/ai-enrichment');

assert(
  RETRIEVAL_BACKEND === 'firestore-shards' || RETRIEVAL_BACKEND === 'vector-index',
  'retrieval backend is known value'
);
assert(VECTOR_PREFILTER_CAP <= 96 && VECTOR_HYDRATE_CAP <= 80, 'vector read caps Hobby-bounded');
assert(PEOPLE_RETRIEVE_DEFAULT > 0, 'people retrieve default set');
assert(CONTENT_WEIGHTS.embedding > 0, 'content rank has embedding weight (I2)');
assert(embedBudgetAllows({ paused: false, calls: AI_DAILY_CALL_CAP }) === false, 'I3 cap stop');

const apiFiles = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js'));
assert(apiFiles.length === 12, `api/*.js = 12 (got ${apiFiles.length})`);

const sched = read('api/chaupaal-scheduler.js');
const catCron = read('api/refresh-category-cache.js');
assert(/requireCronSecret/.test(sched) && /requireCronSecret/.test(catCron), 'both crons require CRON_SECRET');
assert(/SOFT_BUDGET_MS\s*=\s*95_000/.test(sched), 'scheduler soft budget 95s');
assert(/deadlineMs:\s*startedAt\s*\+\s*SOFT_BUDGET_MS/.test(sched), 'enrichment gets soft deadline');

const enrich = read('server-lib/ai-enrichment.js');
assert(/runContentEmbeddingJob/.test(enrich) && /embedBudgetAllows/.test(enrich), 'content embeds + budget');
assert(!/P6_does_not_consume_content_vectors/.test(enrich), 'no permanent content-embed skip lie');

const rr = read('server-lib/retrieve-rank.js');
assert(/retrieveViaVectorIndex/.test(rr) && /pool-prefilter-cosine/.test(rr), 'vector people path real');
assert(/fall through to firestore-shards/.test(rr), 'vector miss falls through to shards');

const cats = read('public/src/js/features/categories.js');
assert(/Offline — no scheduled cache/.test(cats), 'I0 client cold Offline honesty');
assert(/CAT_LIVE_AI_PAUSED\s*=\s*true/.test(cats), 'live AI still paused by default');

const disclosure = read('public/src/js/core/first-run.js');
assert(/never call an AI model at request time/.test(disclosure), 'disclosure: no request-time LLM');
assert(/embeddings \(profiles and public posts\)|public posts/.test(disclosure), 'disclosure honest about embeds');

const envEx = read('.env.example');
assert(/Unpause checklist/.test(envEx), 'env operator matrix');
assert(/CHAUPAAL_RETRIEVAL_BACKEND/.test(envEx) && /AI_DAILY_CALL_CAP/.test(envEx), 'env lists backend + cap');

const conventions = read('CONVENTIONS.md');
assert(/Infra I4|Infra complete \(I0/.test(conventions), 'CONVENTIONS marks I4 / complete');

console.log('\nInfra I4 dogfood+soak passed — I0–I4 closed.');
console.log('api/*.js =', apiFiles.length);
console.log(
  'External residuals (not blockers): paid ANN at massive scale; full legacy content backfill; Pro sub-daily cron.'
);
