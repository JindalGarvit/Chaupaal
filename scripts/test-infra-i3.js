/**
 * Infra I3 — budgeted embeds + env matrix honesty (static + unit).
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

require('./test-ai-enrichment.js');

const { embedBudgetAllows, AI_DAILY_CALL_CAP } = require('../server-lib/ai-enrichment');

assert(embedBudgetAllows({ paused: false, calls: AI_DAILY_CALL_CAP - 1 }) === true || process.env.AI_JOBS_PAUSED === 'true', 'under-cap allows when jobs running');
assert(embedBudgetAllows({ paused: false, calls: AI_DAILY_CALL_CAP }) === false, 'exact cap blocks');

const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js = 12 (got ${apiCount})`);

assert(/Infra I3/.test(read('CONVENTIONS.md')), 'CONVENTIONS documents I3');
assert(/shared UTC-day budget|AI_DAILY_CALL_CAP/.test(read('.env.example')), 'env matrix shared budget');

console.log('\nInfra I3 checks passed.');
