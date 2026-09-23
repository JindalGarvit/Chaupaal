/**
 * Peepal/Khoj K0 — truth: strangers-only, no SAMPLE for signed-in, no match %.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { filterStrangersOnly } = require('../server-lib/discovery-strangers');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  console.log('✓', msg);
}

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const core = read('public/src/js/core/discovery-core.js');
assert(!/SAMPLE_DISCOVERY_POOL\]/.test(core) || /signedIn \? \[\]/.test(core), 'signed-in does not seed SAMPLE pool');
assert(/signedIn \? \[\] : \[\.\.\.SAMPLE_DISCOVERY_POOL\]/.test(core), 'SAMPLE only for guests');
assert(!/Math\.random\(\)\s*\*\s*25/.test(core), 'no Math.random local score jitter');
assert(!/discovery-match-badge/.test(core), 'no discovery-match-badge in render');
assert(!/peepal-compat-peek-pct/.test(core), 'no peek % badge');
assert(/relationshipState/.test(core), 'client stranger filter uses relationshipState');
assert(/Invite|openInviteToChaupaalShare|shareInviteToChaupaal/.test(core), 'empty Invite CTA');

const disc = read('public/src/js/features/discovery.js');
assert(!/\$\{matchPct\}%/.test(disc), 'intent results UI has no %');

const cats = read('public/src/js/features/categories.js');
assert(/setPeepalMode\('khoj'\)|openKhojFind/.test(cats), 'Vriksha Find opens Khoj');
assert(/do not mount people-discovery|K0: do not mount/.test(cats), 'Vriksha skips discovery grid');

const modes = read('public/src/js/core/section-modes.js');
assert(/peepalDiscovery.*classList\.add\('hidden'\)/.test(modes.replace(/\s+/g, ' ')) || /getElementById\('peepalDiscovery'\)\?\.classList\.add\('hidden'\)/.test(modes), 'Vriksha keeps discovery hidden');

const strangers = read('server-lib/discovery-strangers.js');
assert(/loadStrangerExcludeSets/.test(strangers) && /mutualFriend/.test(strangers), 'FoF mutual exclude helper');

const peepalApi = read('api/peepal-reactions.js');
assert(/discovery-strangers|strangerExclude/.test(peepalApi), 'personal_match stranger filter');

const pipe = read('server-lib/discovery-pipeline.js');
assert(/discovery-strangers|filterStrangersOnly/.test(pipe), 'intent_discover stranger filter');

const filtered = filterStrangersOnly(
  [{ uid: 'a' }, { uid: 'b' }, { uid: 'c' }],
  new Set(['b'])
);
assert(filtered.length === 2 && !filtered.find((x) => x.uid === 'b'), 'filterStrangersOnly drops banned');

const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js === 12 (got ${apiCount})`);

console.log('\nPeepal/Khoj K0 checks passed.');
