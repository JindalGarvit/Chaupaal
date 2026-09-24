/**
 * Trust T0 — cross-app honesty: seeds off, no Coming soon spam, SAMPLE guest-only.
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

const categories = read('public/src/js/features/categories.js');
const discovery = read('public/src/js/features/discovery.js');
const baithak = read('public/src/js/features/baithak.js');
const onboarding = read('public/src/js/features/onboarding.js');
const conventions = read('CONVENTIONS.md');

assert(/PEEPAL_SEED_CONTENT_ENABLED\s*=\s*false/.test(categories), 'Peepal seeds flipped OFF');
assert(/let peepalQuestions\s*=\s*\[\]/.test(categories), 'Peepal starts empty (no SAMPLE pad at boot)');
assert(/isSample:true,isDemo:true/.test(categories), 'guest SAMPLE_PEEPAL labeled Demo');
assert(/filter\(q=>PEEPAL_SEED_CONTENT_ENABLED\|\|!q\.isSeedContent\)/.test(categories), 'render filters seed docs');
assert(!/toastSoon/.test(discovery), 'toastSoon removed');
assert(/toastUnavailable/.test(discovery) && /isn.t available/.test(discovery), 'honest unavailable toasts');
assert(/disabled aria-disabled/.test(baithak) && /not available/.test(baithak), 'AI chip disabled when off');
assert(!/AI quiz generation coming soon/.test(baithak), 'no AI coming-soon toast copy');
assert(/Guest-only Demo fixtures|never mutate SAMPLE/.test(onboarding), 'onboarding SAMPLE only when guest');
assert(/Trust T0/.test(conventions), 'CONVENTIONS documents T0');

const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js === 12 (got ${apiCount})`);

console.log('\nTrust T0 checks passed.');
