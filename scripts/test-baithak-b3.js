/**
 * Baithak B3 — Splits tray: Split naming, guest honesty, soft-auth compose.
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

const stories = read('public/src/js/core/stories.js');
const data = read('public/src/js/features/baithak-data.js');
const baithak = read('public/src/js/features/baithak.js');
const referrals = read('public/src/js/core/referrals.js');
const chat = read('public/src/js/features/baithak-chat.js');
const i18n = read('public/src/js/core/i18n.js');
const index = read('public/index.html');
const gestures = read('public/src/js/core/tab-gestures.js');
const conventions = read('CONVENTIONS.md');

assert(/renderGuestSplitTray/.test(stories), 'guest Split tray (Add only)');
assert(/requireSplitAuth/.test(stories), 'soft-auth for compose');
assert(/baithak_split/.test(referrals) && /baithak_split_camera/.test(referrals), 'auth resume pending actions');
assert(/!s\.isSample/.test(stories) && /!s\.isDemo/.test(stories), 'signed-in tray filters SAMPLE/Demo');
assert(/shareBaithakSplit/.test(stories) && /renderBaithakInstants\(\)/.test(stories), 'publish refreshes tray');
assert(/NEVER paint as live friend Splits|never inject SAMPLE_STORIES/.test(data), 'SAMPLE_STORIES not painted as friends');
assert(/renderBaithakInstants\(\)/.test(data) && /renderStories/.test(data), 'renderStories redirects to Split tray');
assert(!/else if\(typeof renderStories==='function'\) renderStories\(\)/.test(baithak), 'baithak init never falls to SAMPLE renderStories');
assert(/renderBaithakInstants/.test(baithak), 'init + auth refresh Split tray');
assert(/stashPendingAction\('baithak_split_camera'\)/.test(chat), 'camera soft-auth stash');
assert(/aria-label="Splits"/.test(index), 'HTML tray aria Split');
assert(/New Split/.test(gestures) || /shortcut_baithak_instant/.test(gestures), 'morph New Split');
assert(/Leave a Split/.test(i18n) && /Share Split/.test(i18n), 'i18n Split capitalization');
assert(!/"instants_leave_note": "Leave a split"/.test(i18n), 'no lowercase Leave a split in EN');
assert(/Baithak B3/.test(conventions), 'CONVENTIONS documents B3');

// Alias map sanity (internal instant → UI Split)
assert(/openBaithakInstantComposer/.test(stories), 'legacy openBaithakInstantComposer alias kept');
assert(/expandBaithakSplitComposer/.test(stories), 'expandBaithakSplitComposer is Split entry');

const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js === 12 (got ${apiCount})`);

console.log('\nBaithak B3 checks passed.');
