/**
 * P9 dogfood static checks — no Firebase / network required.
 * Verifies disclosure claims, Hobby cap, and 6A (no LLM in ranking path).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  console.log('✓', msg);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

// --- Hobby cap ---
const apiFiles = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js'));
assert(apiFiles.length === 12, `api/*.js count === 12 (got ${apiFiles.length})`);
const expected = [
  'admin-feedback.js',
  'anthropic.js',
  'chaupaal-chat.js',
  'chaupaal-events.js',
  'chaupaal-scheduler.js',
  'check-rate.js',
  'media-config.js',
  'peepal-reactions.js',
  'refresh-category-cache.js',
  'relationships.js',
  'revoke-sessions.js',
  'stories.js',
].sort();
assert(apiFiles.sort().join(',') === expected.join(','), 'api/*.js exact list');

// --- 6A: ranking / matchmaking never callAI ---
['server-lib/retrieve-rank.js', 'server-lib/match-quality.js', 'server-lib/dangal-matchmaking.js'].forEach(
  (f) => {
    const src = read(f);
    assert(!/require\(['"]\.\/ai['"]\)|callAI\(/.test(src), `${f} has no callAI`);
  }
);

// --- Opt-out / privacy projection ---
assert(/activitySignalsOptOut/.test(read('public/src/js/core/signal-spine.js')), 'client signal opt-out');
assert(/friend_projection/.test(read('public/src/js/core/users-public.js')), 'friend_projection projection');
assert(/showIncome/.test(read('public/src/js/core/users-public.js')), 'show* income gate');
assert(/allow read, write: if false/.test(read('firebase/firestore.rules')) && /userModels/.test(read('firebase/firestore.rules')), 'userModels admin-only');
assert(/signalEvents/.test(read('firebase/firestore.rules')), 'signalEvents rules present');

// --- Disclosure shipped ---
const firstRun = read('public/src/js/core/first-run.js');
assert(/What Chaupaal collects/.test(firstRun), 'collects sheet title');
assert(/Hashed search/.test(firstRun), 'hashed search claim');
assert(/never invent/.test(firstRun) || /never collect or infer/i.test(firstRun), 'no sensitive inference claim');
assert(/openSettingsPrivacyFocus|data-collects-focus/.test(firstRun), 'deep links to settings');
assert(/openCollectsDisclosureBtn/.test(read('public/index.html')), 'Settings link row');
assert(/openSettingsPrivacyFocus/.test(read('public/src/js/core/state.js')), 'settings focus helper');

// --- Scheduler soft budget ---
const sched = read('api/chaupaal-scheduler.js');
assert(/SOFT_BUDGET_MS/.test(sched), 'scheduler soft budget');
assert(/timing:/.test(sched), 'scheduler timing in response');
assert(/maxDuration:\s*120/.test(sched), 'scheduler maxDuration 120');

// --- P8 residuals honesty ---
const enrich = read('server-lib/ai-enrichment.js');
assert(/P6_does_not_consume_content_vectors/.test(enrich), 'content embeddings skipped documented');
assert(/isCategoryCronPaused/.test(read('server-lib/ai-config.js')), 'category cron env gate');

console.log('\nP9 dogfood static checks passed.');
console.log('api/*.js =', apiFiles.length, apiFiles.join(', '));
