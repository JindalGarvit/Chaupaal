#!/usr/bin/env node
/**
 * Global D1 — dogfood L0–L9 before the language passes.
 *   node scripts/test-global-d1.js          regression checks for the bugs D1 found + cross-cutting gates
 *   node scripts/test-global-d1.js --all    … and re-run every L0–L9 suite (the npm chain already runs them)
 *
 *   extraction  i18n-lint = 0 app-wide incl. server-rendered copy; reviewed allowlist
 *   coverage    per-language report, context notes for every English key, Hindi / Tamil still render
 *   format      dates, relative times, numbers (lakh for en-IN), currency, lists, units, durations × 10 regions
 *   region      no India-first defaults (festivals / seasons / time zones / web search) — region-scoped
 *   server lang system cards + share pages + statements in the reader's language
 *   teens       D1 product call: AI, activity signals, personalisation, location, profile fields follow the
 *               teen's own settings; Peepal open with stricter filters; DMs / 18+ games stay gated
 *   offline     language packs cached by the service worker; English first paint loads no pack
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const { loadI18n } = require('./lib/i18n-runtime');
const srv = require('../server-lib/i18n-server');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  ✓ ' + msg);
  } else {
    failed++;
    console.log('  FAIL ' + msg);
  }
}
const rtFor = (lang, country, extra) =>
  loadI18n(Object.assign({ storage: { chaupaal_lang: lang, chaupaal_region: JSON.stringify({ country, source: 'user' }) }, languages: [lang] }, extra || {}));
const sp = (s) => String(s).replace(/[\u00a0\u202f]/g, ' ');

(async () => {
  if (process.argv.includes('--all')) {
    console.log('\nL0–L9 suites');
    ['l0', 'l1', 'l2', 'l3', 'l4', 'l5', 'l7', 'l8', 'l9'].forEach((l) => {
      const r = spawnSync(process.execPath, ['-r', './scripts/lib/i18n-node-shim.js', `scripts/test-global-${l}.js`], { cwd: ROOT, encoding: 'utf8' });
      assert(r.status === 0, `test-global-${l}.js`);
    });
  }

  // ═══════════════ 1. extraction ═══════════════
  console.log('\nExtraction');
  {
    const L = require('./i18n-lint');
    const res = L.lint();
    assert(res.total === 0, `i18n-lint: 0 hard-coded strings app-wide incl. server (${res.total}${res.total ? ': ' + res.hits.slice(0, 3).map((h) => h.file + ':' + h.line).join(', ') : ''})`);
    assert(L.lintServer().length === 0 && /\bscanServer\b/.test(read('scripts/i18n-lint.js')), 'server-rendered copy (push / cards / share pages) is linted too');
    const skipSrc = L.SKIP_FILES.source;
    assert(!/-core|-engine|-lexicon|-answers|i18n-format/.test(skipSrc) && /akhbaar-bank/.test(skipSrc), 'allowlist shrunk to named content packs + language catalogue + font names');
    assert(/t\('common\.avatar_for'/.test(read('public/src/js/core/chaupaal-avatar.js')) && !/Avatar for \$\{/.test(read('public/src/js/core/chaupaal-avatar.js')), 'bug: avatar aria-label was English-only → keyed');
    assert(!/err && err\.message\)/.test(read('public/src/js/core/optimistic.js')) && /errors\.undone/.test(read('public/src/js/core/optimistic.js')), 'bug: optimistic-update toast showed raw error messages → errors.undone');
    assert(/intents\.get\(m\.id\)\?\.label \|\| m\.label/.test(read('public/src/js/core/chaupaal-intents.js')), 'bug: Khoj commands showed the server’s English label → client catalog first');
    assert(/subtitleKey/.test(read('server-lib/search-index.js')) && /function subOf/.test(read('public/src/js/core/search.js')) && !/' · Pro'/.test(read('public/src/js/core/search.js')), 'bug: search subtitles / “Pro” badge were English → keys');
  }

  // ═══════════════ 3. coverage tooling ═══════════════
  console.log('\nCoverage tooling');
  {
    const COV = require('./i18n-coverage');
    const r = COV.coverage();
    assert(r.contextMissing.length === 0 && r.enPluralGaps.length === 0, `English: context note for every key (${r.enKeys} keys), plural blocks complete`);
    const langs = Object.keys(r.langs);
    assert(langs.length === 15 && langs.every((c) => r.langs[c].placeholderMismatches.length === 0 && r.langs[c].pluralGaps.length === 0 && r.langs[c].glossaryViolations.length === 0), 'all 15 packs: no placeholder / plural / glossary problems');
    const rep = COV.languageReport(r, 'ta');
    assert(/# Tamil \(ta\)/.test(rep.md) && /## Missing by namespace/.test(rep.md) && rep.csv.startsWith('key,english,context,translation\n') && rep.csv.split('\n').length > 1000, 'per-language worksheet + translator CSV (key, English, context)');
    assert(/\{\{name\}\} = a person's display name/.test(COV.contextFor('notifications.card.bday_title', '{{name}}’s birthday')), 'context notes explain placeholders');
    const hi = rtFor('hi', 'IN');
    const ta = rtFor('ta', 'IN');
    await new Promise((res) => setTimeout(res, 50));
    const hiPack = JSON.parse(read('public/src/i18n/hi.json'));
    const taPack = JSON.parse(read('public/src/i18n/ta.json'));
    const hk = Object.keys(hiPack).find((k) => k.startsWith('common.') && hiPack[k] !== hi.t('__x'));
    const tk = Object.keys(taPack).find((k) => k.startsWith('common.'));
    if (hi.ready) await hi.ready;
    if (ta.ready) await ta.ready;
    assert(r.langs.hi.translated > 900 && r.langs.ta.translated > 900, `existing Hindi (${r.langs.hi.translated}) and Tamil (${r.langs.ta.translated}) translations kept`);
    assert(srv.serverT('hi', hk) === hiPack[hk].replace(/\{\{@chaupaal\}\}/g, 'Chaupaal') || srv.serverT('hi', hk) !== srv.serverT('en', hk), `Hindi renders where the key exists (${hk})`);
    assert(srv.serverT('ta', tk) !== srv.serverT('en', tk), `Tamil renders where the key exists (${tk})`);
  }

  // ═══════════════ 4. formatting × regions ═══════════════
  console.log('\nFormatting fixtures');
  {
    const NOW = Date.UTC(2026, 10, 13, 12);
    const want = {
      IN: { cur: '₹', grouped: '12,34,567' },
      US: { cur: '$', grouped: '1,234,567' },
      GB: { cur: '£', grouped: '1,234,567' },
      DE: { cur: '€', grouped: '1.234.567' },
      AE: { cur: 'AED', grouped: '1,234,567' },
      // English UI in a region CLDR has no en-XX data for → English grouping (the region still sets currency).
      BR: { cur: 'R$', grouped: '1,234,567' },
      JP: { cur: '¥', grouped: '1,234,567' },
      ID: { cur: 'Rp', grouped: '1.234.567' },
      PK: { cur: 'Rs', grouped: '1,234,567' },
      BD: { cur: '৳', grouped: '1,234,567' },
    };
    for (const c of Object.keys(want)) {
      const F = rtFor('en', c).ChaupaalFormat;
      const n = sp(F.formatNumber(1234567));
      const money = sp(F.formatCurrency(1500));
      const date = sp(F.formatDate(NOW, 'medium', { timeZone: 'UTC' }));
      const rel = F.formatRelative(NOW - 3 * 60e3, { now: NOW });
      const list = F.formatList(['A', 'B', 'C']);
      const dist = sp(F.formatDistance(1500));
      const dur = F.formatDuration(3723);
      const ok = n === want[c].grouped && money.includes(want[c].cur) && /2026/.test(date) && rel === '3 minutes ago' && /A.*B.*C/.test(list) && /1(\.|,)5|1,500|1\.500|0\.9/.test(dist) && dur === '1:02:03';
      assert(ok, `${c}: ${n} · ${money} · ${date} · ${rel} · ${list} · ${dist} · ${dur}`);
    }
    assert(sp(rtFor('bn', 'BD').ChaupaalFormat.formatNumber(1234567)).replace(/[০-৯]/g, (d) => '০১২৩৪৫৬৭৮৯'.indexOf(d)) === '12,34,567' && sp(rtFor('pt', 'BR').ChaupaalFormat.formatNumber(1234567)) === '1.234.567', 'local UI languages use local grouping (bn-BD lakh · pt-BR dots)');
    assert(sp(rtFor('en', 'US').ChaupaalFormat.formatDistance(1609)).includes('mi') && sp(rtFor('en', 'DE').ChaupaalFormat.formatDistance(1500)).includes('km'), 'units follow the region (mi in US, km in DE)');
  }

  // ═══════════════ 5. region defaults: no India-first leftovers ═══════════════
  console.log('\nGlobal-first defaults');
  {
    const CO = require('../server-lib/companion-outreach');
    const oct20 = new Date(Date.UTC(2026, 9, 20, 12));
    const jan1 = new Date(Date.UTC(2026, 0, 1, 12));
    assert(CO.festivalForDate(oct20, 'UTC', 'IN')?.id === 'diwali' && !CO.festivalForDate(oct20, 'UTC', 'US') && !CO.festivalForDate(oct20, 'UTC', null), 'bug: Indian festivals went to everyone → region-scoped (Diwali for IN, not US / unknown)');
    assert(CO.festivalForDate(jan1, 'UTC', 'BR')?.id === 'new_year' && CO.festivalForDate(new Date(Date.UTC(2026, 11, 25, 12)), 'UTC', 'DE')?.id === 'christmas', 'New Year for everyone; Christmas where observed');
    assert(!CO.FESTIVAL_CALENDAR.some((f) => f.wish || f.name) && /Happy Diwali/.test(CO.festivalText(CO.FESTIVAL_CALENDAR.find((f) => f.id === 'diwali'), 'en').wish), 'festival copy from the catalog, not inline English');
    const EV = require('../server-lib/events-provider');
    const jul = new Date(Date.UTC(2026, 6, 10, 12));
    const evIN = await EV.fetchLocalEvents({ date: jul, country: 'IN', city: 'Mumbai' });
    const evGB = await EV.fetchLocalEvents({ date: jul, country: 'GB' });
    const evAU = await EV.fetchLocalEvents({ date: jul, country: 'AU' });
    assert(evIN.some((e) => e.id === 'monsoon') && evIN.some((e) => e.id === 'city_rains') && !evGB.some((e) => e.id === 'monsoon') && evGB.some((e) => e.id === 'summer_heat') && evAU.some((e) => e.id === 'winter_cozy'), 'bug: monsoon / Indian-city prompts for everyone → region + hemisphere scoped');
    const left = [];
    ['server-lib', 'api', 'public/src/js'].forEach((d) => {
      const walk = (dir) =>
        fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) walk(p);
          else if (e.name.endsWith('.js') && /'Asia\/Kolkata'/.test(fs.readFileSync(p, 'utf8'))) left.push(path.relative(ROOT, p).replace(/\\/g, '/'));
        });
      walk(path.join(ROOT, d));
    });
    const sharedDay = ['server-lib/cat-cache-keys.js', 'server-lib/game-of-day.js', 'server-lib/music-radio.js', 'public/src/js/features/categories.js', 'public/src/js/features/dangal-ratings.js', 'public/src/js/core/region.js', 'public/src/js/dangal/dangal-graduation.js'];
    assert(left.every((f) => sharedDay.includes(f)), `bug: user time defaulted to Asia/Kolkata → device zone / UTC; only the shared content day + tz map remain (${left.filter((f) => !sharedDay.includes(f)).join(', ') || 'ok'})`);
    const AP = require('../server-lib/providers/anthropic');
    assert(!AP.WEB_SEARCH_TOOL.user_location && AP.webSearchTool({ country: 'de' }).user_location.country === 'DE', 'bug: AI web search pinned to India → region passed by the caller');
    assert(!/Indian social app|general Indian culture/.test(read('server-lib/akhbaar-personalize.js') + read('server-lib/companion-outreach.js') + read('api/chaupaal-scheduler.js')), 'AI prompts are global, not “an Indian social app”');
    {
      const P = vm.createContext({ window: {}, document: { getElementById: () => null }, t: (k) => k, console });
      vm.runInContext(read('public/src/js/auth/phone-otp.js'), P);
      const PO = P.window.PhoneOtp;
      assert(PO.toE164('07700 900123', '+44') === '+447700900123' && PO.toE164('(415) 555-0100', '+1') === '+14155550100' && PO.toE164('9876543210', '+91') === '+919876543210' && PO.toE164('+49 151 2345678', '+1') === '+491512345678' && PO.toE164('12345', '') === null, 'bug: phone sign-in assumed India +91 → region calling code (national) or + (international)');
      const html = read('public/index.html');
      assert(!/India \+91|10-digit mobile/.test(html) && !/'\+91' \+ digits/.test(read('api/media-config.js') + read('public/src/js/core/contacts-find.js') + read('server-lib/parental-consent.js')), 'no India-only phone label / +91 default left in auth, contacts or consent lookup');
      assert(!/Morning with chai|Sports 🏏/.test(read('public/src/js/features/categories.js')), 'sample Peepal polls keyed + global (no chai / cricket defaults)');
    }
    const R = rtFor('en', 'DE', { region: true });
    const prefs = R.getRegionPrefs ? R.getRegionPrefs('DE') : null;
    assert(!prefs || (prefs.currency === 'EUR' && prefs.callingCode === '+49'), 'region change → currency + phone code defaults');
  }

  // ═══════════════ 6. server-side language ═══════════════
  console.log('\nServer-side language');
  {
    const og = require('../server-lib/og-preview');
    const hiCard = await og.buildStoryOg(null, 'https://x', 's1', 'hi');
    const enCard = await og.buildStoryOg(null, 'https://x', 's1', 'en');
    assert(enCard.title === 'A story on Chaupaal' && typeof hiCard.title === 'string', 'share cards built in the viewer’s language');
    const ch = og.buildChallengeOg('https://x', 'quiz', { name: 'Asha', score: '9' }, 'en');
    assert(ch.title === 'Beat Asha on Muqabala' && /score of 9/.test(ch.description), 'challenge card copy from the catalog');
    const notif = require('../server-lib/notifications');
    const fakeDb = (lang) => ({ collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({ lang }) }) }) }) });
    const hiPush = await notif.renderPushCopy(fakeDb('hi'), 'u', { actorName: 'Chaupaal', previewKey: 'notifications.push.moderation_action', previewText: '' });
    const enPush = await notif.renderPushCopy(fakeDb('en'), 'u', { actorName: 'Chaupaal', previewKey: 'notifications.push.moderation_action', previewText: '' });
    assert(hiPush.lang === 'hi' && hiPush.body !== enPush.body && /[\u0900-\u097F]/.test(hiPush.body), 'push in the recipient’s language (en vs hi accounts)');
    const T = (lang) => (k, p) => srv.serverT(lang, 'notifications.card.' + k, p);
    assert(T('en')('journal_title') === 'Goodnight Chaupaal' && T('en')('bday_title', { name: 'Ravi' }) === 'Ravi’s birthday', 'system cards rendered per viewer (journal, birthday)');
    assert(/syncFirebaseAuthLanguage/.test(read('public/src/js/core/i18n.js')) && /languageCode/.test(read('public/src/js/core/i18n.js')), 'Firebase auth emails follow the UI language');
    assert(/lang: await require\('\.\/i18n-server'\)\.langForUser|lang,\n\s+system/.test(read('server-lib/akhbaar-personalize.js') + read('server-lib/companion-outreach.js')), 'AI UI-text calls pass the reader’s lang');
  }

  // ═══════════════ 8. teens (D1 product call) ═══════════════
  console.log('\nTeens');
  {
    const C = require('../public/src/js/core/compliance.js');
    const teen = { dob: '2011-05-01', region: { country: 'US' } };
    const p = C.privacyPrefs(teen);
    assert(p.useAi && p.personalizedRecs && !p.locked.useAi && !p.locked.personalizedRecs, 'teens: AI features + personalised recommendations on by default (their switch)');
    assert(C.TEEN_RULES.join() === 'peepal_stricter,adult_games_hidden,dms_friends_only,strict_discovery', 'Teen mode: Peepal stricter, 18+ games hidden, DMs friends-only, strict discovery');
    const de15 = { dob: '2011-05-01', region: { country: 'DE' } };
    assert(!C.privacyPrefs(de15).useAi && C.privacyPrefs({ ...de15, parentalConsent: { verified: true } }).useAi, 'legal floor kept: DE 15 needs a parent before consent-based processing (then on)');
    const in17 = { dob: '2009-12-01', region: { country: 'IN' }, parentalConsent: { verified: true } };
    assert(C.ageInfo(in17, { now: Date.UTC(2026, 10, 13) }).teen && C.privacyPrefs(in17).useAi, 'IN 17 with parental consent: Teen mode + AI on');
    assert(C.ageGate(teen, 'peepal') === 'ok' && C.ageGate(teen, 'adult_games') === 'teen' && C.canMessage(teen, { dob: '1990-01-01' }, {}).ok === false, 'Peepal open; 18+ games + stranger DMs gated');
    assert(!/TEEN_HIDDEN_FIELDS/.test(read('public/src/js/core/users-public.js')) && !/teenBlocks|allowedForTeen/.test(read('public/src/js/core/signal-spine.js') + read('server-lib/signal-spine.js')), 'profile fields by the teen’s own permissions; activity signals collected as for everyone');
    assert(!/activitySignalsOptOut = true|showLocation = false/.test(read('server-lib/privacy.js')) && !/showLocation: false, activitySignalsOptOut: true/.test(read('public/src/js/auth/auth-events.js')), 'no forced private / location-off / tracking-off defaults for teens');
    assert(/flag for legal review/.test(read('docs/compliance/child-safety.md')), 'policy change flagged for legal review (children’s-code defaults)');
  }

  // ═══════════════ 9. performance / offline ═══════════════
  console.log('\nPerformance + offline');
  {
    const en = rtFor('en', 'US');
    assert(en.fetchLog.length === 0, 'English first paint fetches no language pack');
    const idx = read('public/index.html');
    assert(!/fonts\.googleapis/.test(idx) && /fonts\.css/.test(idx), 'fonts self-hosted (no blocking third-party CSS)');
    const sw = read('public/sw.js');
    assert(/I18N_CACHE/.test(sw) && /i18nPackFirst/.test(sw) && /\/src\/styles\/fonts\.css/.test(sw), 'service worker caches language packs + fonts → offline keeps the chosen language');
    const hi = rtFor('hi', 'IN');
    if (hi.ready) await hi.ready;
    assert(hi.fetchLog.length <= 1, 'switching language loads one pack');
  }

  // ═══════════════ constraints ═══════════════
  console.log('\nConstraints');
  {
    const apis = fs.readdirSync(path.join(ROOT, 'api')).filter((f) => f.endsWith('.js'));
    assert(apis.length === 12, `api/*.js === 12 (got ${apis.length})`);
    const L = vm.runInNewContext(read('public/src/js/core/i18n.js').match(/const LANG_CATALOG = (\[[\s\S]*?\]);/)[1]);
    assert(L.length === 16, '16 UI languages');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
