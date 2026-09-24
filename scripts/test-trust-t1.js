/**
 * Trust T1 — dogfood + soak invariants for cross-app honesty (closes T0).
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
const discoveryCore = read('public/src/js/core/discovery-core.js');
const duniya = read('public/src/js/features/duniya.js');
const baithakData = read('public/src/js/features/baithak-data.js');
const stories = read('public/src/js/core/stories.js');
const search = read('public/src/js/core/search.js');
const wish = read('public/src/js/core/baithak-wish.js');
const akhbaar = read('public/src/js/features/akhbaar.js');
const referrals = read('public/src/js/core/referrals.js');
const conventions = read('CONVENTIONS.md');

// 1 Peepal seeds off + guest Demo
assert(/PEEPAL_SEED_CONTENT_ENABLED\s*=\s*false/.test(categories), '1 Peepal seeds OFF');
assert(/isSample:true,isDemo:true/.test(categories), '1 guest Peepal Demo labeled');

// 2 Duniya
assert(/duniyaIsDemoPost/.test(duniya) && /cp-demo-badge/.test(duniya), '2 Duniya Demo chrome');
assert(/Prasidha|prasidha/.test(duniya) || /exclude/.test(duniya), '2 Duniya live paths guard samples');

// 3 Baithak
assert(/clearBaithakSampleInbox/.test(baithakData), '3 Baithak clears SAMPLE');
assert(/renderGuestSplitTray/.test(stories), '3 Splits guest tray no SAMPLE friends');
assert(!/SAMPLE_CHATS/.test(wish) || /never SAMPLE_CHATS/.test(wish), '3 wish never opens SAMPLE chats signed-in');

// 4 Akhbaar
assert(/akhbaarLiveSet|Sample|isSample/.test(akhbaar), '4 Akhbaar live/Sample awareness');

// 5 Khoj no fake pad signed-in
assert(/signedIn \? \[\]/.test(discoveryCore) || /never pad signed-in/.test(discoveryCore), '5 no SAMPLE pad signed-in discovery');
assert(/never pad signed-in with SAMPLE|guest Demo search only/.test(search), '5 search offline SAMPLE guest-only');

// 6–8 CTAs
assert(!/toastSoon/.test(discovery), '7 no toastSoon Coming soon');
assert(/toastUnavailable/.test(discovery), '7 honest unavailable');
assert(!/Join 10,?000|10,?000 users|top players/.test(discovery + discoveryCore + akhbaar), '8 no Join-10k / top-players brag');

// 9 soft-auth resume
assert(/baithak_split/.test(referrals) && /khoj_find/.test(referrals), '9 soft-auth resume actions');

assert(/Trust T0/.test(conventions), 'T0 documented');
assert(/Trust T1/.test(conventions), 'T1 documented');

const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `12 api/*.js === 12 (got ${apiCount})`);

console.log('\nTrust T1 dogfood checks passed.');
