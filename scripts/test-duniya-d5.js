/**
 * Duniya D5 — arc dogfood invariants (auth transition, morph soft-auth, story sample deeplink).
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

const authUi = read('public/src/js/auth/auth-ui.js');
const duniya = read('public/src/js/features/duniya.js');
const story = read('public/src/js/features/duniya-story.js');
const gest = read('public/src/js/core/tab-gestures.js');
const deep = read('public/src/js/core/deeplinks.js');
const conventions = read('CONVENTIONS.md');

// Auth transition clears SAMPLE + refreshes ring
assert(/chaupaal:auth/.test(authUi) && /dispatchEvent/.test(authUi), 'auth-ui dispatches chaupaal:auth');
assert(/addEventListener\(['"]chaupaal:auth['"]/.test(duniya), 'duniya listens for chaupaal:auth');
assert(/loadDuniyaPage\(\{\s*reset:\s*true/.test(duniya), 'auth → reload live feed');
assert(/renderDuniyaStories/.test(duniya) && /chaupaal:auth/.test(story), 'auth → refresh story ring');

// Morph soft-auth resume
assert(/openDuniyaPostSheet\(['"]post['"]\)/.test(gest), 'morph Create post uses openDuniyaPostSheet');
assert(/openDuniyaPostSheet\(['"]story['"]\)/.test(gest), 'morph Create Story uses openDuniyaPostSheet');
assert(/duniya_compose|duniya_story/.test(duniya), 'post sheet stashes resume actions');

// Story sample deeplink honesty
assert(/route\.name === 'story'[\s\S]{0,200}d\[1-5\]/.test(deep), 'story route guards sample ids');
assert(/Demo sample — not a live post/.test(deep), 'Demo toast on sample story deeplink');

// Cross-arc smoke: D0–D4 still present
assert(/rankDuniyaVishwaFeed/.test(duniya), 'D2 rank present');
assert(/toggleLeharLike|toggleContentLike\('duniya'/.test(duniya), 'D3 Lehar persist present');
assert(/prasidha_trending/.test(duniya), 'D4 Prasidha fetch present');
assert(/Duniya D5|dogfood/.test(conventions), 'CONVENTIONS documents D5');

const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js === 12 (got ${apiCount})`);

console.log('\nDuniya D5 checks passed.');
