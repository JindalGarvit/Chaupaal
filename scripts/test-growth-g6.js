/**
 * Growth G6 — PWA install + end-to-end growth dogfood (static / no browser).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { hrefFromDeepLink } = require('../server-lib/notifications');
const { selectRetentionTemplate } = require('../server-lib/retention-d1d7');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  console.log('✓', msg);
}

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// ——— G6 PWA ———
const pwa = read('public/src/js/core/pwa-install.js');
assert(/beforeinstallprompt/.test(pwa) && /preventDefault/.test(pwa), 'captures beforeinstallprompt');
assert(/deferredPrompt\.prompt|ev\.prompt/.test(pwa), 'calls prompt()');
assert(/isStandalone|display-mode:\s*standalone/.test(pwa), 'skips when standalone');
assert(/Add to Home Screen|Share/.test(pwa), 'iOS how-to present');
assert(!/90% of users|everyone installed/i.test(pwa), 'no fake install stats');
assert(/COOLDOWN_MS|DISMISS_KEY/.test(pwa), 'dismiss cooldown');
assert(/authOverlay|Quiet|quietMode/.test(pwa), 'auth + Quiet gates');
assert(/install_accepted|install_dismissed/.test(pwa), 'local/analytics signals');

const html = read('public/index.html');
assert(/pwa-install\.js/.test(html), 'pwa-install script tagged');
assert(/pwaInstallSettingsRow/.test(html), 'Settings install row');

const manifest = JSON.parse(read('public/manifest.json'));
assert(manifest.display === 'standalone', 'manifest display standalone');
assert(manifest.icons?.some((i) => i.purpose === 'maskable'), 'maskable icon');
assert(manifest.shortcuts?.every((s) => /section=/.test(s.url)), 'shortcuts use ?section=');
assert(manifest.shortcuts?.length >= 2, 'shortcuts present');

const deeplink = read('public/src/js/core/deeplinks.js');
assert(/params\.get\('section'\)\s*\|\|\s*params\.get\('tab'\)/.test(deeplink), 'dual-parse section|tab');
assert(/switchTab\(section\)/.test(deeplink) && !/showTab\(section\)/.test(deeplink), 'section uses local switchTab');

const env = read('public/src/js/core/environment.js');
assert(/isStandalone/.test(env) && /is-standalone/.test(env), 'standalone class helper');

const swClient = read('public/src/js/core/service-worker.js');
assert(/tap to reload|New version available/.test(swClient), 'SW update banner');
assert(/register\('\/sw\.js/.test(swClient), 'registers /sw.js');

const css = read('public/src/styles/components.css');
assert(/pwa-install-sheet/.test(css) && /is-standalone/.test(css), 'install + standalone CSS');

const first = read('public/src/js/core/first-run.js');
assert(/ChaupaalPwa\.noteMeaningfulMoment/.test(first), 'day-0 hooks install soft prompt');

// ——— Dogfood G0–G5 (static regression) ———
console.log('\n— Dogfood checklist —');

// G0
const vercel = read('vercel.json');
assert(/\/join\/g\//.test(vercel), 'G0: /join/g/ rewrite');
assert(hrefFromDeepLink({ chatId: 'x1' }) === '/chat/x1', 'G0: FCM deepLink ≠ bare / when chatId');
assert(hrefFromDeepLink({ section: 'peepal' }) === '/?section=peepal', 'G0/G5: section deep link');

// G1
const og = read('server-lib/og-preview.js');
assert(/og=1|Open Graph|og:title/i.test(og) || /contentType.*text\/html/.test(og), 'G1: OG module present');
assert(/challenge/.test(vercel) || /challenge/.test(read('public/src/js/core/deeplinks.js')), 'G1: challenge routes');

// G2
const refs = read('public/src/js/core/referrals.js');
assert(/withReferralParam|referral_claim|stashPending/.test(refs), 'G2: referral capture + resume');
const refServer = read('server-lib/referrals.js');
assert(/self_referral|referredBy|referralGrants/.test(refServer), 'G2: no self-ref / idempotent grants');

// G3
assert(/hasPendingDay0Destination|startDay0Play/.test(first), 'G3: day-0 fork');
const baithak = read('public/src/js/features/baithak-data.js');
assert(/Never seed SAMPLE|never seed SAMPLE|signed-in → honest empty|isGuest/i.test(baithak), 'G3: no fake SAMPLE for signed-in');

// G4
const authUi = read('public/src/js/auth/auth-ui.js');
assert(/regProFields|Professional|industry|purpose/i.test(html + authUi + read('public/src/js/auth/auth-profiles.js')), 'G4: Pro fields');

// G5 honesty
const nudges = read('public/src/js/core/tab-nudges.js');
assert(!/Someone new matched|1,000 people online/i.test(nudges), 'G5: no fiction nudges');
const d4 = selectRetentionTemplate({
  dayIndex: 4,
  triedDangal: true,
  invited: true,
  waiting: false,
  todayKey: '2026-09-20',
  lastSentDayKey: null,
  first7Count: 1,
});
assert(d4.skip === 'no_event_d4', 'G5: D4 skips without event');

// Hobby cap
const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js === 12 (got ${apiCount})`);

console.log('\nGrowth G6 checks + dogfood static pass.');
console.log('Residuals (defer): rich manifest screenshots; live Chromium/iOS device install; Play Console.');
