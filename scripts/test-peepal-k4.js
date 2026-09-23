/**
 * Peepal/Khoj K4 — arc dogfood static invariants (K0–K3 + soft-auth resume).
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

const api = read('api/peepal-reactions.js');
const modes = read('public/src/js/core/section-modes.js');
const khoj = read('public/src/js/features/khoj.js');
const discovery = read('public/src/js/features/discovery.js');
const cats = read('public/src/js/features/categories.js');
const core = read('public/src/js/core/discovery-core.js');
const refs = read('public/src/js/core/referrals.js');
const first = read('public/src/js/core/first-run.js');
const index = read('public/index.html');
const gest = read('public/src/js/core/tab-gestures.js');
const i18n = read('public/src/js/core/i18n.js');

// Surface split
assert(/do not mount people-discovery|K0: do not mount|K3: no people/.test(cats), '1 Vriksha hides discovery');
assert(/setPeepalMode\(['"]khoj['"]\)/.test(cats), '1 Find routes to Khoj');
assert(/peepalKhojSurface|renderKhojSurface/.test(khoj), '2 Khoj people surface');
assert(/mashhoor_trending/.test(modes) && /mashhoor_trending/.test(api), '3 Mashhoor server trending');
assert(/\['khoj',\s*'vriksha',\s*'mashhoor'\]/.test(modes), '4 swipe order Khoj→Vriksha→Mashhoor');
assert(/shortcut_peepal_global_search/.test(gest) && /openUniversalSearch/.test(gest), '4 morph Search Chaupaal');

// Honesty
assert(/isDiscoveryEligibleUser/.test(core) && /filterStrangersOnly|stranger/.test(api), '5 stranger filters');
assert(/signedIn \? \[\] :/.test(core) || /never seed SAMPLE into signed-in/.test(core), '6 no SAMPLE pad signed-in');
assert(/cp-demo-badge.*Sample|Sample · sign in/.test(core), '7 guest Sample labeled');
assert(!/discovery-match-badge/.test(core) && !/matchPct/.test(khoj), '8 no match % badges');

// Khoj core
assert(/openUniversalSearch\(\{\s*types:\s*\[['"]users['"]/.test(khoj), '9 top bar universal search');
assert(/intent_discover/.test(discovery), '10 Find uses intent_discover');
assert(/wireKhojFilters|renderKhojFiltersMarkup/.test(khoj), '11 filters wired');
assert(/discovery_person_signal/.test(discovery) && /discovery_person_signal/.test(api), '12 feedback signal');

// Pro
assert(/professional_match/.test(core) && /professional_match/.test(api), '13 Pro networking path');
assert(/INTENT_CHIPS_PRO/.test(khoj) && !/INTENT_CHIPS_PRO[\s\S]*Dating/.test(khoj), '14 Pro chips no Dating');
assert(/khoj_ph_pro|co-founder/.test(khoj), '15 Pro free-text; Personal has Dating');
assert(/INTENT_CHIPS_PERSONAL[\s\S]*Dating/.test(khoj), '15 Personal Dating chip');

// Mashhoor
assert(/openPeepalPost/.test(modes), '16 tiles open real posts');
assert(/isSeedContent/.test(read('server-lib/mashhoor-trending.js')), '17 seeds excluded from trending');
assert(/mashhoor_empty|Explore Khoj|Start a discussion|setPeepalMode\(['"]vriksha['"]\)/.test(modes), '18 honest empty CTAs');

// Cross-cutting
assert(/data-meet=["']khoj["']/.test(first) && /setPeepalMode\(['"]khoj['"]\)/.test(first), '19 Day-0 Meet → Khoj');
assert(/khoj_find/.test(refs) && /stashPendingAction\(['"]khoj_find['"]\)/.test(khoj), '20 soft-auth Find resume');
assert(/chaupaal_khoj_pending_query/.test(khoj) && /chaupaal_khoj_pending_query/.test(discovery), '20 pending query preserved');
assert(/quiet-mode|prefers-reduced-motion/.test(read('public/src/js/core/tab-gestures.js')), '21 quiet / reduced-motion aware');

const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `23 api/*.js === 12 (got ${apiCount})`);

assert(/Find on Khoj/.test(index) || /peepal_find_btn:'Find on Khoj'/.test(i18n), 'Vriksha Find copy → Khoj');
assert(/peepal_find_btn:'Find on Khoj'/.test(i18n), 'i18n Find on Khoj');

console.log('\nPeepal/Khoj K4 dogfood checks passed.');
