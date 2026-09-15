/**
 * Growth G2 — referral helpers, URL scheme, API fold, Hobby cap (no network).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  normalizeRefCode,
  INVITEE_CHIPS,
  INVITER_CHIPS,
  MAX_INVITER_REWARDS_PER_DAY,
  COSMETIC_ID,
} = require('../server-lib/referrals');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  console.log('✓', msg);
}

assert(normalizeRefCode('@Ada_1') === 'ada_1', 'normalize ref');
assert(INVITEE_CHIPS === 150 && INVITER_CHIPS === 250, 'reward amounts');
assert(MAX_INVITER_REWARDS_PER_DAY === 20, 'daily cap');
assert(COSMETIC_ID === 'invite_spark', 'cosmetic id');

const media = fs.readFileSync(path.join(__dirname, '../api/media-config.js'), 'utf8');
assert(/referral_claim/.test(media), 'media-config referral_claim');
assert(/referral_activate/.test(media), 'media-config referral_activate');
assert(/server-lib\/referrals/.test(media), 'folds into media-config');

const client = fs.readFileSync(path.join(__dirname, '../public/src/js/core/referrals.js'), 'utf8');
assert(/withReferralParam/.test(client), 'client withReferralParam');
assert(/chaupaal_pending_deep/.test(client), 'pending deep stash');
assert(/virtual chips/.test(client), 'teen-safe copy');
assert(/REF_TTL_MS/.test(client), 'ref TTL');

const deep = fs.readFileSync(path.join(__dirname, '../public/src/js/core/deeplinks.js'), 'utf8');
assert(/withReferralParam/.test(deep), 'shareUrl tags ref');
assert(/name: 'invite'/.test(deep), 'invite route');

const auth = fs.readFileSync(path.join(__dirname, '../public/src/js/auth/auth-events.js'), 'utf8');
assert(/stashPendingDeepLink/.test(auth), 'auth sheet stashes deep');
assert(/afterAuthReferralAndResume/.test(auth), 'post-auth claim+resume');

const rules = fs.readFileSync(path.join(__dirname, '../firebase/firestore.rules'), 'utf8');
assert(/referredBy/.test(rules), 'rules block referredBy client write');
assert(/referralGrants/.test(rules), 'referralGrants Admin-only write');

const vercel = fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8');
assert(/\/invite\/\(\.\*\)/.test(vercel), 'invite SPA rewrite');
assert(/kind=invite/.test(vercel), 'invite OG rewrite');

const apiCount = fs.readdirSync(path.join(__dirname, '../api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js === 12 (got ${apiCount})`);

console.log('\nGrowth G2 checks passed.');
