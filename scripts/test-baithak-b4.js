/**
 * Baithak B4 — Mehfil entry honesty + arc dogfood (B0–B4 close).
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

const data = read('public/src/js/features/baithak-data.js');
const chat = read('public/src/js/features/baithak-chat.js');
const mehfil = read('public/src/js/features/mehfil.js');
const stories = read('public/src/js/core/stories.js');
const baithak = read('public/src/js/features/baithak.js');
const conventions = read('CONVENTIONS.md');

// —— B4 Mehfil entry ——
const rowClick = data.match(/item\.addEventListener\('click'[\s\S]{0,600}?list\.appendChild\(item\)/)?.[0] || '';
assert(/openChatScreen\(chat\)/.test(rowClick), '1 inbox row opens chat');
assert(!/requestMehfilAutoJoin\s*\(/.test(rowClick), '2 list row never calls requestMehfilAutoJoin(');
assert(!/requestMehfilAutoJoin\s*\(/.test(data), '2b baithak-data never calls requestMehfilAutoJoin');
assert(/mehfilLiveJoin/.test(chat) && /ensureOpenMehfil/.test(chat), '3 Join Mehfil CTA wired');
assert(/Forbidden: inbox list/.test(mehfil), '4 auto-join API documents list ban');
assert(/consumeMehfilAutoJoin/.test(chat) && /deeplink|ring Accept|mehfil=1/i.test(chat), '5 pending auto-join only for explicit intent');
assert(/count >= 2/.test(mehfil) && /MEHFIL_WAITING_LABEL|Waiting in Mehfil/.test(mehfil), '6 Live ≥2 / Waiting solo');
assert(/!isSelf&&!isChaupaal\?`<div class="mehfil-live-banner"/.test(chat), '7 Self/Chaupaal no live Join banner');

// —— B0–B3 hold ——
assert(/isDemo:true|isSample:true/.test(data) && /clearBaithakSampleInbox/.test(data), 'B0 Demo + clear helper');
assert(/return \[chaupaal, self, \.\.\.rest\]/.test(data), 'B1 pin order Chaupaal→Me→rest');
assert(/filterBaithakSectionChats/.test(data) && /ALL groups|all groups \(lock 2A\)/.test(data), 'B2 Mitra all groups');
assert(/renderGuestSplitTray/.test(stories) && /Leave a Split/.test(stories), 'B3 guest Split tray');
assert(!/else if\(typeof renderStories==='function'\) renderStories\(\)/.test(baithak), 'B3 no SAMPLE renderStories fallthrough');

assert(/Baithak B4/.test(conventions), 'CONVENTIONS documents B4');

const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js === 12 (got ${apiCount})`);

const bTests = ['test-baithak-b0.js', 'test-baithak-b1.js', 'test-baithak-b2.js', 'test-baithak-b3.js', 'test-baithak-b4.js'];
bTests.forEach((f) => assert(fs.existsSync(path.join(root, 'scripts', f)), `scripts/${f} present`));

console.log('\nBaithak B4 dogfood static checks passed.');
