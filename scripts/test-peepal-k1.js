/**
 * Peepal/Khoj K1 — Chaupaal search on top, filters, AI text Find, feedback.
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

const khoj = read('public/src/js/features/khoj.js');
assert(/khojChaupaalSearch|khoj-global-search/.test(khoj), 'Khoj has Chaupaal search control');
assert(/openUniversalSearch/.test(khoj), 'top search opens universal search');
assert(/khojIntentInput/.test(khoj) && /khojIntentGo/.test(khoj), 'intent Find still present');
assert(/renderKhojFiltersMarkup|wireKhojFilters/.test(khoj), 'compact filters wired');
assert(/khojBackToPeeks|Back to peeks/.test(khoj), 'way back to peeks');
assert(!/Tip: Search posts, games/.test(khoj), 'morph-only tip removed');
assert(/softAuthForFind|Sign in to find/.test(khoj), 'guest soft-auth on Find');
assert(/chipIntent|khojSelectedChipIntent/.test(khoj), 'chip intent tracked');

const disc = read('public/src/js/features/discovery.js');
assert(/filters/.test(disc) && /getDiscoveryFilterPayload/.test(disc), 'Find sends filters');
assert(/discovery_person_signal/.test(disc), 'feedback signal wired');
assert(/we.ll show fewer like this|Thanks/.test(disc), 'not_interested toast');
assert(!/\$\{matchPct\}%/.test(disc), 'no match % in intent UI');

const core = read('public/src/js/core/discovery-core.js');
assert(/renderKhojFiltersMarkup/.test(core) && /clearDiscoveryFilters/.test(core), 'filter helpers');
assert(/signedIn \? \[\] : \[\.\.\.SAMPLE_DISCOVERY_POOL\]/.test(core), 'K0 SAMPLE policy holds');

const pipe = read('server-lib/discovery-pipeline.js');
assert(/body\.filters|cf\.sameCity/.test(pipe), 'intent_discover merges client filters');
assert(/add_detail/.test(pipe), 'AI-off vague refine chip');
assert(!/matchPct:/.test(pipe), 'no matchPct in intent_discover response');

const assumptions = read('server-lib/discovery-assumptions.js');
assert(/hf\.recentlyJoined|recentlyJoined/.test(assumptions), 'recentlyJoined hard filter');

const modes = read('public/src/js/core/section-modes.js');
assert(
  /getElementById\('peepalDiscovery'\)\?\.classList\.add\('hidden'\)/.test(modes),
  'Vriksha keeps discovery hidden (K0)'
);

const gestures = read('public/src/js/core/tab-gestures.js');
assert(/openUniversalSearch/.test(gestures), 'morph Search Chaupaal kept');

const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js === 12 (got ${apiCount})`);

console.log('\nPeepal/Khoj K1 checks passed.');
