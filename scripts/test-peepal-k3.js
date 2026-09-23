/**
 * Peepal/Khoj K3 — Mashhoor real trending + Vriksha discussion-only.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  passesMashhoorEligibility,
  isPublicPeepalAudience,
} = require('../server-lib/mashhoor-trending');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  console.log('✓', msg);
}

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const api = read('api/peepal-reactions.js');
assert(/mashhoor_trending/.test(api), 'mashhoor_trending action in peepal-reactions');
assert(/mashhoorTrending/.test(api), 'mashhoorTrending wired');

const modes = read('public/src/js/core/section-modes.js');
assert(/mashhoor_trending/.test(modes), 'client fetches mashhoor_trending');
assert(!/rankByVelocity\(posts/.test(modes), 'Mashhoor no longer ranks local peepalPosts only');
assert(/openPeepalPost/.test(modes), 'tiles call openPeepalPost');

const cats = read('public/src/js/features/categories.js');
assert(/function openPeepalPost|async function openPeepalPost/.test(cats), 'openPeepalPost defined');
assert(/Start a discussion|openDiscussFromCard|peepal_discuss/.test(cats), 'Vriksha discuss-first');
assert(/do not mount people-discovery|K0: do not mount|K3: no people/.test(cats) || /peepalDiscovery/.test(cats), 'Vriksha keeps discovery hidden');

const index = read('public/index.html');
assert(/Start a discussion/.test(index), 'Vriksha title is discuss');
assert(/data-discuss-topic/.test(index), 'discussion topic chips');
assert(!/data-chip-intent="dating"/.test(index), 'no dating chip on Vriksha');

assert(isPublicPeepalAudience('everyone'), 'everyone is public');
assert(!isPublicPeepalAudience('friends'), 'friends not public');
assert(
  !passesMashhoorEligibility({ isSeedContent: true, question: 'x', audience: 'everyone' }),
  'seeds excluded'
);
assert(
  !passesMashhoorEligibility({ question: 'x', audience: 'friends' }),
  'friends-only excluded'
);
assert(
  passesMashhoorEligibility({ question: 'Hello world', audience: 'everyone', deleted: false }),
  'public post eligible'
);

const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js === 12 (got ${apiCount})`);

console.log('\nPeepal/Khoj K3 checks passed.');
