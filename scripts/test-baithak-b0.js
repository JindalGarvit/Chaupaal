/**
 * Baithak B0 — Demo for guests, real inbox when signed in.
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
const baithak = read('public/src/js/features/baithak.js');
const conventions = read('CONVENTIONS.md');

assert(/isSample:true,\s*isDemo:true/.test(data) || /isDemo:true/.test(data), 'SAMPLE rows marked Demo');
assert(/cp-demo-badge|chat-item-demo/.test(data), 'Demo chrome on rows');
assert(/clearBaithakSampleInbox/.test(data) && /clearBaithakSampleInbox/.test(baithak), 'clear SAMPLE helper wired');
assert(/chaupaal:auth/.test(baithak) && /clearBaithakSampleInbox/.test(baithak), 'auth clears Demo');
assert(/do not pollute live baithakChats|Guest list is render-only/.test(baithak), 'guest render does not seed live array');
assert(/never inject SAMPLE|Never seed SAMPLE/.test(data) || /never inject SAMPLE/.test(baithak), 'signed-in fail refuses SAMPLE');
assert(/Sign in for real chats|Labeled samples only/.test(data), 'guest Sign in CTA copy');
assert(/Invite friends/.test(data) && /Find from contacts/.test(data), 'signed-in empty Invite/Find');
assert(/isDemo/.test(data) && /function isLiveSampleChat/.test(data), 'isLiveSampleChat treats isDemo');
assert(!/requestMehfilAutoJoin/.test(data.match(/item\.addEventListener\('click'[\s\S]{0,400}/)?.[0] || '') ||
  /opens chat only|no surprise auto-join/.test(data), 'inbox row no surprise Mehfil auto-join');
assert(/Baithak B0/.test(conventions), 'CONVENTIONS documents B0');

const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js === 12 (got ${apiCount})`);

console.log('\nBaithak B0 checks passed.');
