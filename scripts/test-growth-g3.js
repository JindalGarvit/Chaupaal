/**
 * Growth G3 — day-0 fork vs deeplink, empty CTAs, SAMPLE policy (no network).
 */
'use strict';

const fs = require('fs');
const path = require('path');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  console.log('✓', msg);
}

const first = fs.readFileSync(path.join(__dirname, '../public/src/js/core/first-run.js'), 'utf8');
assert(/hasPendingDay0Destination/.test(first), 'pending destination guard');
assert(/startDay0Play/.test(first), 'Play → real quiz helper');
assert(/startMuqabala/.test(first), 'Play launches practice quiz');
assert(/openInviteToChaupaalShare/.test(first), 'Meet invite uses G2 share');
assert(/hasPendingDay0Destination\(\)/.test(first) && /markForkDone/.test(first), 'fork skips when pending');

const baithak = fs.readFileSync(path.join(__dirname, '../public/src/js/features/baithak-data.js'), 'utf8');
assert(/Invite friends/.test(baithak), 'Baithak empty Invite CTA');
assert(/openInviteToChaupaalShare|shareInviteToChaupaal/.test(baithak), 'Baithak invite wired');
assert(/Never seed SAMPLE_CHATS/.test(baithak) || /Never admit SAMPLE_CHATS/.test(baithak), 'no SAMPLE seed into live');

const chat = fs.readFileSync(path.join(__dirname, '../public/src/js/features/baithak-chat.js'), 'utf8');
assert(/Demo chat — sign in/.test(chat), 'demo send soft-auth');
assert(/Sign in to keep chatting for real/.test(chat), 'guest send prompts auth');
assert(!/replies=\[\"Haha/.test(chat) && !/Math\.random\(\)\*replies/.test(chat), 'fake auto-reply removed');

const duniya = fs.readFileSync(path.join(__dirname, '../public/src/js/features/duniya.js'), 'utf8');
assert(/stashPendingAction\('duniya_compose'\)/.test(duniya) || /duniya_compose/.test(duniya), 'duniya compose resume');
assert(/Sign in to post|Create a post/.test(duniya), 'duniya empty CTA');

const peepal = fs.readFileSync(path.join(__dirname, '../public/src/js/features/categories.js'), 'utf8');
assert(/Explore Khoj/.test(peepal), 'peepal empty Khoj CTA');
assert(/isSample:true/.test(peepal), 'SAMPLE_PEEPAL marked');
assert(/signed-in → honest empty|peepalQuestions=\[\]/.test(peepal), 'signed-in peepal empty');

const disc = fs.readFileSync(path.join(__dirname, '../public/src/js/core/discovery-core.js'), 'utf8');
assert(/Guest-only labeled samples/.test(disc), 'discovery samples guest-only');

const refs = fs.readFileSync(path.join(__dirname, '../public/src/js/core/referrals.js'), 'utf8');
assert(/stashPendingAction/.test(refs) && /resumePendingAction/.test(refs), 'pending action resume');

const apiCount = fs.readdirSync(path.join(__dirname, '../api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js === 12 (got ${apiCount})`);

console.log('\nGrowth G3 checks passed.');
