/**
 * Duniya D4 — Prasidha server ~7-day velocity trending.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  passesPrasidhaEligibility,
  isPublicDuniyaAudience,
} = require('../server-lib/prasidha-trending');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  console.log('✓', msg);
}

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const stories = read('api/stories.js');
assert(/prasidha_trending/.test(stories), 'prasidha_trending action in stories.js');
assert(/prasidhaTrending/.test(stories), 'prasidhaTrending wired');
assert(/verifyBearer/.test(stories), 'optional auth via verifyBearer');

const lib = read('server-lib/prasidha-trending.js');
assert(/windowDays/.test(lib) && /7/.test(lib), '7-day window');
assert(/rankContentItems/.test(lib), 'uses retrieve-rank velocity');
assert(/friendSlots:\s*3/.test(lib), 'light follow boost (3 slots)');
assert(/isSample|isDemo|isSeedContent/.test(lib), 'excludes SAMPLE/demo/seed');
assert(/saveOnly|archived/.test(lib), 'excludes archive/saveOnly');
assert(/Live query/.test(lib) || /no denorm/.test(lib), 'live query documented');

const duniyaPosts = read('server-lib/duniya-posts.js');
assert(/prasidha_trending/.test(duniyaPosts), 'duniya-posts recognizes prasidha_trending');

const client = read('public/src/js/features/duniya.js');
assert(/prasidha_trending/.test(client), 'client fetches prasidha_trending');
assert(/fetchPrasidhaTrending/.test(client), 'fetchPrasidhaTrending helper');
assert(!/rankByVelocity\(realPool/.test(client), 'Prasidha no longer ranks local duniyaPosts only');
assert(!/requestContentRank\('duniya'/.test(client), 'no client-only content rank for Prasidha');
assert(/openDuniyaPostById|openDuniyaDetail/.test(client), 'tiles open real post');
assert(/Create post|Open Vishwa/.test(client), 'honest empty CTAs');
assert(/duniyaIsDemoPost/.test(client), 'filters Demo from trending tiles');

const conventions = read('CONVENTIONS.md');
assert(/Duniya D4|Prasidha/.test(conventions) && /prasidha_trending/.test(conventions), 'CONVENTIONS documents D4');

assert(isPublicDuniyaAudience('public'), 'public is public');
assert(isPublicDuniyaAudience('everyone'), 'everyone is public');
assert(!isPublicDuniyaAudience('friends'), 'friends not public');
assert(!isPublicDuniyaAudience('private'), 'private not public');
assert(
  !passesPrasidhaEligibility('x', { isSample: true, caption: 'hi', audience: 'public' }),
  'SAMPLE excluded'
);
assert(
  !passesPrasidhaEligibility('d1', { caption: 'hi', audience: 'public' }),
  'sample id d1 excluded'
);
assert(
  !passesPrasidhaEligibility('x', { caption: 'hi', audience: 'friends' }),
  'friends-only excluded'
);
assert(
  !passesPrasidhaEligibility('x', { caption: 'hi', audience: 'public', saveOnly: true }),
  'saveOnly excluded'
);
assert(
  !passesPrasidhaEligibility('x', { caption: 'hi', audience: 'public', archived: true }),
  'archived excluded'
);
assert(
  passesPrasidhaEligibility('abc', { caption: 'Hello world', audience: 'public', deleted: false }),
  'public caption post eligible'
);
assert(
  passesPrasidhaEligibility('abc', {
    media: 'https://x/a.jpg',
    audience: 'public',
    deleted: false,
  }),
  'public media post eligible'
);

const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js === 12 (got ${apiCount})`);

console.log('\nDuniya D4 checks passed.');
