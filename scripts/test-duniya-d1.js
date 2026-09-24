/**
 * Duniya D1 — IG story ring + tap/long-press gestures + create soft-auth resume.
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

const story = read('public/src/js/features/duniya-story.js');
const duniya = read('public/src/js/features/duniya.js');
const compose = read('public/src/js/features/duniya-compose.js');
const refs = read('public/src/js/core/referrals.js');
const gest = read('public/src/js/core/tab-gestures.js');
const css = read('public/src/styles/duniya-story.css');
const dcss = read('public/src/styles/duniya.css');

assert(/renderGuestStrip/.test(story), 'guest self ring');
assert(/data-self="1"/.test(story), 'self always first');
assert(/!s\.isSample && !s\.isDemo/.test(story), 'no SAMPLE authors in live tray');
assert(/openDuniyaPostSheet\(['"]post['"]\)/.test(story), 'long-press → post');
assert(/onLongPress\(selfEl/.test(story), 'long-press binds full self tile');
assert(/delayMs:\s*480/.test(story), 'long-press delay');
assert(/suppressClick/.test(story), 'suppress click after long-press');
assert(/data-add/.test(story) && /startCreate\(\)/.test(story), '+ badge → story create');
assert(/firstUnwatchedIndex/.test(story), 'tap self with story → viewer');
assert(/softAuthForCreate\(['"]duniya_story['"]\)/.test(story), 'guest story soft-auth');
assert(/duniya_story/.test(refs) && /DuniyaStory\.startCreate|startCreate/.test(refs), 'resume duniya_story');
assert(/duniya_compose/.test(refs), 'resume duniya_compose');
assert(/stashPendingAction.*duniya_compose|duniya_compose/.test(duniya), 'post sheet soft-auth stash');
assert(/stashPendingAction\(['"]duniya_compose['"]\)/.test(compose), 'compose soft-auth stash');
assert(/shortcut_duniya_post/.test(gest) && /shortcut_duniya_story/.test(gest), 'morph post + story');
assert(/Create post/.test(gest) && /Create Story/.test(gest), 'morph labels');
assert(/openDuniyaPostSheet\(['"]post['"]\)/.test(gest) && /openDuniyaPostSheet\(['"]story['"]\)/.test(gest), 'morph soft-auth via post sheet stash');
assert(/is-unseen|f58529|dd2a7b/.test(css), 'IG-style gradient ring');
assert(/is-seen .duniya-story-ring/.test(css), 'seen muted ring');
assert(/duniya-story-add-badge/.test(css) && /22px/.test(css), 'compact + badge');
assert(/prefers-reduced-motion/.test(css), 'reduced-motion press');
assert(/duniyaStoriesRow.*vishwa|mode !== 'vishwa'/.test(duniya), 'ring Vishwa-only toggle');
assert(/chaupaal:story-created/.test(story), 'ring refresh on publish');
assert(/chaupaal:auth/.test(story), 'ring refresh on auth');
assert(/overflow-y:visible/.test(dcss) || /overflow-y:visible/.test(css), 'badge overflow ok');

const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js === 12 (got ${apiCount})`);

console.log('\nDuniya D1 checks passed.');
