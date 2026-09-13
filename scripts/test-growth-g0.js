/**
 * Growth G0 unit checks — invite parse, FCM href, honest nudges (no network).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { hrefFromDeepLink } = require('../server-lib/notifications');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  console.log('✓', msg);
}

// --- parseDeepLink join route (extract from source) ---
const deeplinkSrc = fs.readFileSync(path.join(__dirname, '../public/src/js/core/deeplinks.js'), 'utf8');
assert(/name: 'join', re: \/\^\\\/join/.test(deeplinkSrc), 'join pathname route defined');
assert(/PENDING_GROUP_INVITE_KEY/.test(deeplinkSrc), 'guest invite stash key');
assert(/resumePendingGroupInvite/.test(deeplinkSrc), 'resume after auth');
assert(/deeplinks_v1/.test(deeplinkSrc), 'deeplinks_v1 kill switch wired');

const vercel = fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8');
assert(/\/join\/g\/\(\.\*\)/.test(vercel), 'vercel rewrite /join/g/');

// --- hrefFromDeepLink ---
assert(hrefFromDeepLink({ chatId: 'abc' }) === '/chat/abc', 'DM → /chat');
assert(hrefFromDeepLink({ chatId: 'abc', mehfil: 1 }) === '/chat/abc?mehfil=1', 'Mehfil ring');
assert(hrefFromDeepLink({ postId: 'p1' }) === '/post/p1', 'post');
assert(hrefFromDeepLink({ path: '/post/x' }) === '/post/x', 'explicit path');
assert(hrefFromDeepLink({ username: 'alice' }) === '/profile/alice', 'profile username');
assert(hrefFromDeepLink({ uid: 'u1' }) === '/?uid=u1', 'uid query');
assert(hrefFromDeepLink(null, { type: 'like' }) === '/', 'missing → home');

// --- FCM uses link not hard-coded / ---
const notifSrc = fs.readFileSync(path.join(__dirname, '../server-lib/notifications.js'), 'utf8');
assert(/hrefFromDeepLink\(link/.test(notifSrc), 'FCM link from deepLink');
assert(!/link:\s*['"]\/['"]/.test(notifSrc), 'no hard-coded link /');

// --- Honest nudges ---
const nudgeSrc = fs.readFileSync(path.join(__dirname, '../public/src/js/core/tab-nudges.js'), 'utf8');
assert(!/Your profile is attracting looks/.test(nudgeSrc), 'no fake profile looks');
assert(!/Someone nearby is looking/.test(nudgeSrc), 'no fake nearby');
assert(/resolveHonestNudge/.test(nudgeSrc), 'honest resolver');

// --- Auth alias ---
const authSrc = fs.readFileSync(path.join(__dirname, '../public/src/js/auth/auth-events.js'), 'utf8');
assert(/function openAuthSheet/.test(authSrc), 'openAuthSheet defined');
assert(/Create my account/.test(fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8')), 'register label consistent');

// --- No SAMPLE_BREAKING fallback ---
const onboard = fs.readFileSync(path.join(__dirname, '../public/src/js/features/onboarding.js'), 'utf8');
assert(!/SAMPLE_BREAKING/.test(onboard), 'SAMPLE_BREAKING removed');
assert(!/const SAMPLE_NEARBY\s*=/.test(onboard), 'SAMPLE_NEARBY const removed');

// --- api count ---
const apiCount = fs.readdirSync(path.join(__dirname, '../api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js === 12 (got ${apiCount})`);

console.log('\nGrowth G0 checks passed.');
