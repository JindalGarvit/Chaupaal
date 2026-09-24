/**
 * Duniya D5 / soak — auth transition, morph soft-auth, story sample deeplink, long-press hit target.
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
const persist = read('public/src/js/core/social-persistence.js');
const conventions = read('CONVENTIONS.md');

assert(/chaupaal:auth/.test(authUi) && /dispatchEvent/.test(authUi), 'auth-ui dispatches chaupaal:auth');
assert(/dbReady:\s*false/.test(authUi), 'auth fires even when db not ready');
assert(/addEventListener\(['"]chaupaal:auth['"]/.test(duniya), 'duniya listens for chaupaal:auth');
assert(/Eagerly drop guest SAMPLE/.test(duniya), 'auth eagerly clears SAMPLE');
assert(/loadDuniyaPage\(\{\s*reset:\s*true/.test(duniya), 'auth → reload live feed');
assert(/never paint guest SAMPLE|Signed-in but Firestore/.test(duniya), 'signed-in without db skips SAMPLE');
assert(/renderDuniyaStories/.test(duniya) && /chaupaal:auth/.test(story), 'auth → refresh story ring');

assert(/openDuniyaPostSheet\(['"]post['"]\)/.test(gest), 'morph Create post uses openDuniyaPostSheet');
assert(/openDuniyaPostSheet\(['"]story['"]\)/.test(gest), 'morph Create Story uses openDuniyaPostSheet');
assert(/duniya_compose|duniya_story/.test(duniya), 'post sheet stashes resume actions');

assert(/route\.name === 'story'[\s\S]{0,200}d\[1-5\]/.test(deep), 'story route guards sample ids');
assert(/Demo sample — not a live post/.test(deep), 'Demo toast on sample story deeplink');

assert(/onLongPress\(selfEl/.test(story), 'long-press on full self tile');

assert(/rankDuniyaVishwaFeed/.test(duniya), 'D2 rank present');
assert(/toggleLeharLike|toggleContentLike\('duniya'/.test(duniya), 'D3 Lehar persist present');
assert(/prasidha_trending/.test(duniya), 'D4 Prasidha fetch present');
assert(/Duniya D5|dogfood|soak/.test(conventions), 'CONVENTIONS documents D5/soak');

assert(/const id = contentId\(content\)/.test(persist), 'canPersist uses contentId');
assert(/\^d\[1-5\]\$/.test(persist), 'canPersist rejects sample ids');

const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js === 12 (got ${apiCount})`);

console.log('\nDuniya D5 checks passed.');
