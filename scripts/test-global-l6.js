#!/usr/bin/env node
/**
 * Global L6 — English source polish + global-first defaults.
 *   node -r ./scripts/lib/i18n-node-shim.js scripts/test-global-l6.js
 *
 *   docs        STYLE.md + glossary `terms` (chips, Party Hub, Room mode, Pass & Play, Manch, Split, Streak …)
 *   copy        context note for every English key; US spelling, one term per concept, no Hinglish / India-only
 *               default copy; every English change logged for translators (scripts/_tmp_l6/changed-keys.json)
 *   literals    no India-first literals in default code paths (explicit allowlist for region / payments data)
 *   fixtures    IN US GB AE BR DE JP ID PK BD: currency, phone code, time format, first day, Akhbaar sources,
 *               icebreaker set, seasonal calendar, Dangal defaults — by Region, never by UI language
 *   overrides   Settings → Language & region → More: currency / 12-24 h / first day / units persist + sync
 *   phone       country-code picker on the phone fields (searchable, Region default, E.164 unchanged)
 *   ai          viewer-facing AI prompts carry region + language; Akhbaar search scoped to the region's sources
 */
'use strict';

process.env.AI_FEATURES_ENABLED = 'true';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const { loadI18n, memoryStorage } = require('./lib/i18n-runtime');

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

const FIXTURES = ['IN', 'US', 'GB', 'AE', 'BR', 'DE', 'JP', 'ID', 'PK', 'BD'];
const rtFor = (lang, country, extra) =>
  loadI18n(Object.assign({ storage: { chaupaal_lang: lang, chaupaal_region: JSON.stringify({ country, source: 'user' }) }, languages: [lang] }, extra || {}));

/** Browser file in a VM with the given globals (i18n shim globals are injected by the preload). */
function runBrowser(file, globals) {
  const ctx = Object.assign(
    {
      console,
      Intl,
      localStorage: memoryStorage(),
      navigator: { languages: ['en-US'], language: 'en-US' },
      document: { getElementById: () => null, querySelector: () => null, head: { appendChild() {} }, createElement: () => ({ style: {} }), addEventListener() {} },
      setTimeout,
    },
    globals || {}
  );
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read(file), ctx, { filename: file });
  return ctx;
}

const EN = loadI18n({ region: false, format: false }).CHAUPAAL_I18N_EN;

(async () => {
  // ═══════════════ 1. docs ═══════════════
  console.log('\nStyle guide + glossary');
  {
    const style = exists('public/src/i18n/STYLE.md') ? read('public/src/i18n/STYLE.md') : '';
    const sections = ['Voice', 'Inclusive and global', 'US English', 'Terminology', 'Placeholders, plurals and select', 'Length'];
    assert(sections.every((s) => style.includes(s)), 'STYLE.md: voice, inclusive/global, US English, terminology, placeholders/plurals/select, length budgets');
    assert(/gender-neutral/i.test(style) && /second person/i.test(style) && /idioms/i.test(style) && /\{count, plural/.test(style) && /select/.test(style) && /Button \| ≤ 20/.test(style), 'STYLE.md covers gender-neutral, second person, idioms, ICU plural + select, button length');
    const g = JSON.parse(read('public/src/i18n/glossary.json'));
    const need = ['chips', 'Party Hub', 'Room mode', 'Pass & Play', 'Manch', 'Split', 'Streak', 'Teen mode', 'Languages I read'];
    const terms = g.terms || {};
    assert(need.every((k) => terms[k] && terms[k].def && terms[k].translate && Array.isArray(terms[k].banned) && terms[k].banned.length), `glossary terms: ${need.join(', ')} — each with definition, translate-as-concept note and banned renderings`);
    assert(terms.chips && terms.chips.banned.some((b) => /money/i.test(b)) && /not money/i.test(terms.chips.translate), 'chips = virtual game chips, never money');
    assert(g.brands && g.brands.chaupaal === 'Chaupaal' && g.hi && g.ur && Object.keys(g.hi).length > 80, 'brands + language sections intact (valid JSON)');
  }

  // ═══════════════ 2. English copy ═══════════════
  console.log('\nEnglish source');
  {
    const COV = require('./i18n-coverage');
    const r = COV.coverage();
    assert(r.contextMissing.length === 0 && r.enPluralGaps.length === 0, `every English key has a context note (${r.enKeys} keys), plural blocks complete`);
    assert(/Icebreaker prompt/.test(COV.contextFor('profile.ib.gb_tea', 'x')) && /Language & region/.test(COV.contextFor('settings.region_currency', 'Currency')) && /Festival/.test(COV.contextFor('notifications.card.festival_eid_al_fitr_name', 'Eid')), 'new L6 namespaces have specific context notes');
    const PROTECTED = /^(chat\.auto\.|chat\.sys\.|games\.chess\.opening\.)/;
    const vals = Object.entries(EN).filter(([k]) => !PROTECTED.test(k));
    const brit = vals.filter(([, v]) => /\b(colour|favourite|centre|recognise|cancelled|licence|organisation|personalis|behaviour|analys(e|ing))/i.test(v.replace(/\{\{?\w+\}?\}/g, '')));
    assert(brit.length === 0, `US spelling (${brit.length ? brit.slice(0, 3).map((x) => x[0]).join(', ') : 'no colour / favourite / centre / recognise / cancelled …'})`);
    const logIn = vals.filter(([, v]) => /\blog(ged|ging)? ?(in|out)\b/i.test(v));
    assert(logIn.length === 0 && EN['common.log_in_2'] === 'Sign in →' && EN['common.logout'] === 'Sign out', `one term: Sign in / Sign out (${logIn.map((x) => x[0]).slice(0, 3).join(', ') || 'no Log in / Log out left'})`);
    assert(EN['discovery.why.bit_shared_connections'] === 'mutual friends' && !vals.some(([, v]) => /\b(foodie|new) connections\b/i.test(v)), 'people = friends (connection = network only)');
    const hinglish = vals.filter(([, v]) => /\b(nahi|karein|aapka|aapke|dobara|hain|mein maine|ke baare|aage ki raah)\b/i.test(v));
    assert(hinglish.length === 0, `no Hinglish in the English source (${hinglish.map((x) => x[0]).slice(0, 3).join(', ') || 'clean'})`);
    const indiaDefault = [
      'peepal.notif_morning', 'profile.cai_bio_default', 'common.e_g_mumbai_delhi_bengaluru', 'onboarding.e_g_b_tech_from_iit', 'onboarding.e_g_mumbai_maharashtra',
      'discovery.try_cricket_fan_from_delhi_who', 'discovery.try_travel_buddy_for_ladakh_in', 'discovery.try_morning_runner_or_gym_person', 'peepal.name_india_news',
      'peepal.india_s_role_in_global_name', 'profile.india_local', 'profile.you_both_answered_an_india_local', 'dangal.e_g_someone_my_age_from',
    ].filter((k) => /\b(India|Indian|chai|cricket|Delhi|Mumbai|IIT|Bangalore|Ladakh|Chennai|Bengaluru)\b/.test(EN[k] || ''));
    assert(indiaDefault.length <= 1 && !indiaDefault.includes('peepal.notif_morning'), `default examples / notifications global (${indiaDefault.join(', ') || 'clean'})`);
    const logPath = 'scripts/_tmp_l6/changed-keys.json';
    const log = exists(logPath) ? JSON.parse(read(logPath)) : {};
    const entries = Object.entries(log);
    const stale = entries.filter(([k, e]) => !('old' in e) || !('new' in e) || EN[k] !== e.new);
    const added = entries.filter(([, e]) => e.old === null).length;
    assert(entries.length > 300 && stale.length === 0, `every English change logged with { old, new } and in sync with en.js (${entries.length - added} changed, ${added} added${stale.length ? '; stale: ' + stale.slice(0, 3).map((x) => x[0]).join(', ') : ''})`);
  }

  // ═══════════════ 3. India-first literals ═══════════════
  console.log('\nNo India-first literals in default code paths');
  {
    const BANNED = [
      ['₹', /₹/],
      ["'INR'", /['"]INR['"]/],
      ["'+91'", /['"`]\+91/],
      ['Asia/Kolkata', /['"]Asia\/(Kolkata|Calcutta)['"]/],
      ['"Indian app" prompt', /\b(an )?Indian (news|social)[^'"`]{0,20}app\b|for an Indian audience|India's social/i],
      ['en-IN news link', /hl=en-IN|gl=IN&/],
      ['Hindi UI → India packs', /lang\s*===\s*'hi'\s*\?\s*'in'|\|\|\s*lang\s*===\s*'hi'/],
    ];
    // Explicit allowlist — each entry is region data, a stored-currency / payments path, or the shared IST product day.
    const ALLOW = {
      'public/src/js/core/region.js': 'time-zone → country table',
      'public/src/js/data/region-prices.js': 'per-country price table',
      'public/src/js/features/profile.js': 'India income bands, shown only for Region IN',
      'public/src/js/core/chaupaal-money.js': 'wallet shows the currency it is stored in (INR, Razorpay)',
      'server-lib/chaupaal-money.js': 'wallet stored currency (INR, Razorpay)',
      'server-lib/payments.js': 'Razorpay order currency',
      'server-lib/pricing-regions.js': 'pricing tiers (payments decision — residual)',
      'api/peepal-reactions.js': 'boost order currency (Razorpay)',
      'public/src/js/auth/phone-otp.js': 'deprecated toE164India kept for old callers',
      'public/src/js/dangal/dangal-graduation.js': 'device-hint fallback when no Region is stored',
      'public/src/js/features/categories.js': 'shared IST content day key',
      'public/src/js/features/dangal-ratings.js': 'shared IST content day key',
      'server-lib/cat-cache-keys.js': 'shared IST content day key',
      'server-lib/game-of-day.js': 'shared IST content day key',
      'server-lib/music-radio.js': 'shared IST content day key',
      'public/src/js/data/samples.js': 'offline sample quiz bank (regional India category)',
    };
    const hits = [];
    const walk = (dir) =>
      fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).forEach((e) => {
        const rel = dir + '/' + e.name;
        if (e.isDirectory()) return walk(rel);
        if (!e.name.endsWith('.js') || ALLOW[rel]) return;
        read(rel)
          .split('\n')
          .forEach((ln, i) => BANNED.forEach(([label, re]) => re.test(ln) && hits.push(`${rel}:${i + 1} ${label}`)));
      });
    ['public/src/js', 'server-lib', 'api'].forEach(walk);
    assert(hits.length === 0, `no ₹ / INR / +91 / Asia/Kolkata / "Indian app" prompts / en-IN links / UI-language region outside the allowlist (${hits.slice(0, 4).join('; ') || 'clean'})`);
    assert(Object.keys(ALLOW).every((f) => exists(f)), `allowlist names real files (${Object.keys(ALLOW).length})`);
    const cat = read('public/src/js/features/categories.js') + read('server-lib/cat-content.js') + read('public/src/js/features/onboarding.js') + read('public/src/js/features/dangal.js');
    assert(!/Indian (news|social)|Indian audience|India's social|Consider Indian demographics/.test(cat) && /a global social/.test(cat), 'AI prompts (Akhbaar, assistant, Dangal finder) are global');
  }

  // ═══════════════ 4. region fixtures ═══════════════
  console.log('\nRegion fixtures');
  const AK = require('../public/src/js/core/akhbaar-sources.js');
  const SC = require('../public/src/js/core/seasonal-calendar.js');
  const ice = runBrowser('public/src/js/core/icebreakers.js', { getRegionPrefs: () => ({ country: '' }) });
  const grad = (country) => runBrowser('public/src/js/dangal/dangal-graduation.js', { getRegionPrefs: () => ({ country }) }).dangalLocaleDefaults();
  {
    const d = (y, m, dd) => new Date(Date.UTC(y, m - 1, dd, 12));
    const WANT = {
      IN: { cur: 'INR', dial: '+91', h12: true, day: 0, ak: 'in', ib: 'in', fest: ['diwali', d(2026, 11, 8)], rummy: '13', bluff: 'follow', lead: 'teenpatti', party: 'in' },
      US: { cur: 'USD', dial: '+1', h12: true, day: 0, ak: 'us', ib: 'us', fest: ['thanksgiving', d(2026, 11, 26)], rummy: 'gin', bluff: 'sequence', lead: 'poker', party: 'global' },
      GB: { cur: 'GBP', dial: '+44', h12: false, day: 1, ak: 'uk', ib: 'gb', fest: ['christmas', d(2026, 12, 25)], rummy: 'gin', bluff: 'sequence', lead: 'poker', party: 'global' },
      AE: { cur: 'AED', dial: '+971', h12: true, day: [1, 6], ak: 'arab', ib: 'gulf', fest: ['uae_national_day', d(2026, 12, 2)], rummy: 'gin', bluff: 'sequence', lead: 'poker', party: 'global' },
      BR: { cur: 'BRL', dial: '+55', h12: false, day: 0, ak: 'br_pt', ib: 'br', fest: ['carnival', d(2026, 2, 17)], rummy: 'gin', bluff: 'sequence', lead: 'poker', party: 'global' },
      DE: { cur: 'EUR', dial: '+49', h12: false, day: 1, ak: 'de', ib: 'de', fest: ['german_unity', d(2026, 10, 3)], rummy: 'gin', bluff: 'sequence', lead: 'poker', party: 'global' },
      JP: { cur: 'JPY', dial: '+81', h12: false, day: 0, ak: 'jp', ib: 'jp', fest: ['golden_week', d(2026, 5, 3)], rummy: 'gin', bluff: 'sequence', lead: 'poker', party: 'global' },
      ID: { cur: 'IDR', dial: '+62', h12: false, day: 0, ak: 'id', ib: 'id', fest: ['id_independence', d(2026, 8, 17)], rummy: 'gin', bluff: 'sequence', lead: 'poker', party: 'global' },
      PK: { cur: 'PKR', dial: '+92', h12: true, day: [0, 1], ak: 'pk', ib: 'pk', fest: ['pk_independence', d(2026, 8, 14)], rummy: '13', bluff: 'follow', lead: 'teenpatti', party: 'global' },
      BD: { cur: 'BDT', dial: '+880', h12: true, day: [0, 1, 5, 6], ak: 'bd', ib: 'bd', fest: ['pohela_boishakh', d(2026, 4, 14)], rummy: '13', bluff: 'follow', lead: 'teenpatti', party: 'global' },
    };
    for (const c of FIXTURES) {
      const w = WANT[c];
      const p = rtFor('en', c).getRegionPrefs();
      const days = [].concat(w.day);
      const ev = SC.eventForDate(w.fest[1], 'UTC', c);
      const dg = grad(c);
      const ok =
        p.currency === w.cur &&
        p.callingCode === w.dial &&
        p.hour12 === w.h12 &&
        days.includes(p.firstDayOfWeek) &&
        AK.regionFor(p.contentRegion) === w.ak &&
        ice.icebreakerRegionalSetFor(c) === w.ib &&
        ev && ev.id === w.fest[0] &&
        dg.rummyMode === w.rummy && dg.bluffStyle === w.bluff && dg.cardsLead[0] === w.lead && dg.partyRegion === w.party;
      assert(ok, `${c}: ${p.currency} ${p.callingCode} ${p.hour12 ? '12h' : '24h'} week:${p.firstDayOfWeek} · news:${AK.regionFor(p.contentRegion)} · icebreakers:${ice.icebreakerRegionalSetFor(c)} · ${ev ? ev.id : '—'} · rummy ${dg.rummyMode}, bluff ${dg.bluffStyle}, ${dg.cardsLead[0]} first, packs ${dg.partyRegion}`);
    }
    assert(AK.regionFor('ZZ') === 'intl' && AK.regionFor('') === 'intl' && AK.regionFor('NG') === 'intl' && AK.regionsFor('IN', ['jp', 'nope']).join() === 'in,jp,intl', 'Akhbaar: unknown region → International; user-added regions + International always kept');
    const reg = AK.ids();
    const want = ['intl', 'us', 'uk', 'in', 'pk', 'bd', 'arab', 'es_latam', 'fr', 'br_pt', 'de', 'id', 'jp', 'kr', 'zh_intl'];
    assert(want.every((r) => reg.includes(r) && AK.sourcesFor(r).length >= 4 && AK.sourcesFor(r).every((s) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s.domain) && /^(agency|broadcaster|publisher)$/.test(s.kind))), `Akhbaar source registry: ${want.length} regions, ≥4 public publishers each (domain + kind)`);
    assert(AK.regionFor('MX') === 'es_latam' && AK.regionFor('PT') === 'br_pt' && AK.regionFor('TW') === 'zh_intl' && AK.regionFor('KR') === 'kr' && AK.regionFor('FR') === 'fr' && AK.regionFor('SA') === 'arab', 'Spain + LatAm, Brazil + Portugal, Chinese-language, Korea, France, Gulf mapped');
    // seasonal: region-scoped, no festival leaks
    const diwali = d(2026, 11, 8);
    assert(!SC.eventForDate(diwali, 'UTC', 'US') && !SC.eventForDate(d(2026, 11, 26), 'UTC', 'IN') && !SC.eventForDate(d(2026, 12, 25), 'UTC', 'IN') && SC.eventForDate(d(2026, 1, 1), 'UTC', null).id === 'new_year', 'seasonal: Diwali not for US, Thanksgiving / Christmas not for IN, New Year for everyone');
    assert(SC.eventForDate(d(2026, 3, 20), 'UTC', 'ID').id === 'eid_al_fitr' && SC.eventForDate(d(2026, 2, 17), 'UTC', 'KR').id === 'lunar_new_year' && SC.dateOf(SC.EVENTS.find((e) => e.id === 'diwali'), 2031) === null, 'seasonal: Eid / Lunar New Year by region; unknown lunar year matches nothing (no wrong day)');
    const CO = require('../server-lib/companion-outreach');
    assert(CO.FESTIVAL_CALENDAR === SC.EVENTS && CO.festivalForDate(diwali, 'UTC', 'IN').id === 'diwali' && /Eid Mubarak/.test(CO.festivalText(SC.EVENTS.find((e) => e.id === 'eid_al_fitr'), 'en').wish), 'companion festival cards reuse the shared calendar; copy from the catalog');
    // icebreakers: global core, no India weighting by default
    const core = ice.activeIcebreakerPrompts('');
    assert(!core.some((p) => p.id === 'ib14' || p.id === 'ib16') && core.some((p) => p.id === 'ib21') && core.some((p) => p.id === 'ib22'), 'icebreakers: global core has no India prompts (chai stall / Indian festival)');
    assert(ice.activeIcebreakerPrompts('IN').some((p) => p.id === 'ib14') && ice.getIcebreakerPromptById('ib14') && ice.getIcebreakerPromptById('ib_jp1'), 'India set only for IN; old answers to any regional prompt still resolve');
    let seq = 0;
    const rnd = () => ((seq = (seq * 9301 + 49297) % 233280) / 233280);
    const picks = Array.from({ length: 400 }, () => ice.suggestIcebreakerPrompt([], { country: 'US', random: rnd }));
    const regionalShare = picks.filter((p) => p.regional).length / picks.length;
    assert(regionalShare > 0.2 && regionalShare < 0.5 && !picks.some((p) => p.id === 'ib14'), `suggestions: regional ~1 in 3 for a region with a set (${Math.round(regionalShare * 100)}%), never another region's set`);
    assert(!/0\.65/.test(read('public/src/js/core/icebreakers.js')) && EN['profile.india_local'] === 'Local & community', 'no 65% India/local weighting; category label global');
  }

  // ═══════════════ 5. language ≠ region ═══════════════
  console.log('\nLanguage is not region');
  {
    const enIN = rtFor('en', 'IN');
    const pIN = enIN.getRegionPrefs();
    const dIN = grad(pIN.country);
    assert(pIN.currency === 'INR' && pIN.callingCode === '+91' && AK.regionFor(pIN.contentRegion) === 'in' && dIN.rummyMode === '13' && dIN.partyRegion === 'in', 'English UI in IN → India defaults (₹, +91, Indian sources, 13-card Rummy, India packs)');
    const hiGB = rtFor('hi', 'GB');
    const pGB = hiGB.getRegionPrefs();
    const dGB = grad(pGB.country);
    assert(pGB.currency === 'GBP' && pGB.callingCode === '+44' && pGB.hour12 === false && AK.regionFor(pGB.contentRegion) === 'uk' && ice.icebreakerRegionalSetFor(pGB.country) === 'gb' && dGB.rummyMode === 'gin' && dGB.partyRegion === 'global', 'Hindi UI in GB → GB defaults (£, +44, 24 h, UK sources, UK icebreakers, Gin, global packs)');
    const kit = runBrowser('public/src/js/games/party-kit.js', { currentLang: 'hi', dangalLocaleDefaults: () => dGB, screen: {}, CustomEvent: function () {}, addEventListener() {}, removeEventListener() {} });
    assert(kit.PartyKit.contentPrefs().region === 'global', 'Party Hub content: Hindi UI outside India starts on the global core');
    const srcs = ['public/src/js/games/rummy-ui.js', 'public/src/js/games/bluff-ui.js', 'public/src/js/features/dangal-ratings.js', 'public/src/js/games/party-kit.js'].map(read).join('\n');
    assert((srcs.match(/dangalLocaleDefaults\(\)/g) || []).length >= 4, 'Rummy mode, Bluff style, Teen Patti vs Poker order, party packs read dangalLocaleDefaults (Region)');
  }

  // ═══════════════ 6. overrides ═══════════════
  console.log('\nSettings → Language & region → More');
  {
    const writes = [];
    const db = { collection: () => ({ doc: () => ({ set: (f) => (writes.push(f), Promise.resolve()) }) }) };
    const storage = memoryStorage({ chaupaal_lang: 'en', chaupaal_region: JSON.stringify({ country: 'IN', source: 'user' }) });
    const rt = loadI18n({ localStorage: storage, languages: ['en'], db, currentUser: { uid: 'u1' } });
    const R = rt.ChaupaalRegion;
    assert(R.getRegionPrefs().currency === 'INR' && !R.getRegionPrefs().overridden.currency, 'defaults derived from the Region');
    R.setOverride('currency', 'USD', { persistRemote: true });
    R.setOverride('hour12', false, { persistRemote: true });
    R.setOverride('firstDayOfWeek', 1, { persistRemote: true });
    R.setOverride('measurement', 'imperial', { persistRemote: true });
    const p = R.getRegionPrefs();
    assert(p.currency === 'USD' && p.hour12 === false && p.firstDayOfWeek === 1 && p.measurement === 'imperial' && p.overridden.currency && p.defaults.currency === 'INR' && p.defaults.hour12 === true, 'getRegionPrefs() honours each override (and still reports the derived default)');
    const F = rt.ChaupaalFormat;
    const sp = (s) => String(s).replace(/[\u00a0\u202f]/g, ' ');
    assert(/^13:30$/.test(sp(F.formatTime(Date.UTC(2026, 0, 4, 13, 30), { timeZone: 'UTC' }))) && /mi/.test(sp(F.formatDistance(5000))) && /\$/.test(sp(F.formatCurrency(1500))), 'formatting follows overrides (24 h time, miles, US$)');
    const last = writes[writes.length - 1] || {};
    assert(last.regionPrefs && last.regionPrefs.currency === 'USD' && last.regionPrefs.hour12 === false && last.regionPrefs.measurement === 'imperial', 'overrides sync to the profile (users/{uid}.regionPrefs)');
    const reload = loadI18n({ localStorage: storage, languages: ['en'] });
    assert(reload.getRegionPrefs().currency === 'USD' && reload.getRegionPrefs().hour12 === false, 'overrides persist across a reload (localStorage)');
    assert(R.getRegionPrefs('DE').currency === 'EUR' && R.getRegionPrefs('DE').measurement === 'metric', 'asking about another country gives its plain defaults');
    R.setOverride('currency', 'auto', { persistRemote: true });
    assert(R.getRegionPrefs().currency === 'INR' && !R.getRegionPrefs().overridden.currency, '“Automatic” clears an override');
    const fresh = loadI18n({ storage: { chaupaal_region: JSON.stringify({ country: 'GB', source: 'user' }) }, languages: ['en'] });
    const w = fresh.ChaupaalRegion.hydrateFromProfile({ region: { country: 'GB', source: 'user' }, regionPrefs: { hour12: true, currency: 'XXX' } });
    assert(fresh.getRegionPrefs().hour12 === true && fresh.getRegionPrefs().currency === 'GBP' && !w.regionPrefs, 'sign-in: profile overrides win (invalid values dropped)');
    const html = read('public/index.html');
    assert(/data-i18n="settings\.lang_region"/.test(html) && /id="regionPickerBtn"/.test(html) && html.indexOf('id="langPickerBtn"') < html.indexOf('id="regionMore"') && html.indexOf('id="regionPickerBtn"') < html.indexOf('id="regionMore"'), 'Settings: Language + Region up front, the rest under More');
    assert(['regionCurrencySelect', 'regionHourSelect', 'regionWeekSelect', 'regionUnitsSelect'].every((id) => html.includes(`id="${id}"`)) && /regionMoreOptions/.test(read('public/src/js/core/lang-picker.js')), 'More: currency, time format, first day of week, units — each Automatic or fixed');
    const keys = ['settings.lang_region', 'settings.region_more', 'settings.region_currency', 'settings.region_time_format', 'settings.region_first_day', 'settings.region_units', 'settings.region_auto', 'settings.time_12h', 'settings.time_24h', 'settings.units_metric', 'settings.units_imperial', 'settings.units_uk'];
    assert(keys.every((k) => EN[k]), 'all new Settings strings are keyed in en.js');
  }

  // ═══════════════ 7. phone ═══════════════
  console.log('\nPhone country-code picker');
  {
    const rt = rtFor('en', 'GB');
    const P = runBrowser('public/src/js/auth/phone-otp.js', { ChaupaalRegion: rt.ChaupaalRegion, currentLang: 'en' }).PhoneOtp;
    const codes = (q) => P.countryCodeMatches(q, 'en').map((c) => c.code);
    assert(codes('+44').includes('GB') && codes('971').includes('AE') && codes('united').includes('US') && codes('Deutschland').length === 0 && codes('germany').includes('DE'), 'searchable by country name, ISO code or calling code');
    assert(P.toE164('07700 900123', '+44') === '+447700900123' && P.toE164('9876543210', '+91') === '+919876543210' && P.toE164('+1 415 555 0100', '+44') === '+14155550100', 'E.164 from the picked code (a typed + number wins)');
    assert(P.dialForInput({ dataset: { dial: '+81' } }) === '+81' && P.dialForInput(null) === '+44', 'field code defaults to the Region calling code');
    const src = read('public/src/js/auth/phone-otp.js');
    assert(/toE164\(phoneRaw, dial\)/.test(src) && /\['loginPhone', 'regPhoneOtpInput'\]/.test(src) && /dialForInput\(phoneInput\)/.test(read('public/src/js/auth/auth-events.js')), 'login + signup phone fields get the picker; send OTP uses the picked code');
    assert(EN['auth.country_code'] && EN['auth.country_code_search'] && /\{\{country\}\}/.test(EN['auth.country_code_change']), 'picker strings keyed');
  }

  // ═══════════════ 8. AI + Akhbaar plumbing (mocked) ═══════════════
  console.log('\nAI prompts carry region + language (mocked provider)');
  {
    const anthropic = require('../server-lib/providers/anthropic');
    const realComplete = anthropic.complete;
    const seen = [];
    anthropic.complete = async (req) => {
      seen.push(req);
      return { content: [{ type: 'text', text: 'आज मौसम अच्छा है और आपका दिन शुभ हो, धन्यवाद।' }] };
    };
    try {
      const { callAI, regionLine } = require('../server-lib/ai');
      await callAI({ system: 'You are helpful.', messages: [{ role: 'user', content: 'hi' }], lang: 'hi', region: 'GB' });
      const sys = seen[0] && seen[0].system;
      assert(/United Kingdom \(GB\)/.test(sys) && /Hindi|हिन्दी|हिंदी/.test(sys), 'viewer-facing system prompt includes the Region (United Kingdom) and the language (Hindi)');
      assert(regionLine('') === '' && regionLine('zz1') === '', 'no region → prompt unchanged (no default country)');
      const { callAnthropicServer } = require('../server-lib/anthropic-server');
      const CC = require('../server-lib/cat-content');
      const src = CC.sourceScope({ region: 'in' });
      await callAnthropicServer({ enableWebSearch: true, system: 's', messages: [{ role: 'user', content: 'x' }], country: src.country, allowedDomains: src.allowedDomains });
      const req = seen[seen.length - 1];
      const tool = anthropic.webSearchTool(req);
      assert(req.country === 'IN' && tool.allowed_domains.includes('thehindu.com') && tool.user_location.country === 'IN', 'Akhbaar cron: web search limited to the region’s publishers + approximate location');
      const intl = CC.sourceScope({});
      assert(intl.regionId === 'intl' && intl.country === null && intl.allowedDomains.includes('reuters.com') && /global audience/.test(intl.audience) && !anthropic.webSearchTool({}).allowed_domains, 'no region → International sources, no country pinned');
    } finally {
      anthropic.complete = realComplete;
    }
    delete require.cache[require.resolve('../api/refresh-category-cache.js')];
    process.env.CAT_CACHE_REGIONS = 'in,us,zz,intl';
    const cron = require('../api/refresh-category-cache.js');
    delete process.env.CAT_CACHE_REGIONS;
    const jobs = cron.buildRefreshJobs(['Tech']);
    assert(jobs.length === 3 && jobs[0].scope.region === undefined && jobs[1].scope.region === 'in' && jobs[2].scope.region === 'us', 'cron: International base + CAT_CACHE_REGIONS scopes (unknown ids dropped)');
    const K = require('../server-lib/cat-cache-keys');
    assert(K.buildCatCacheDocId({ category: 'Tech', region: 'in', day: '2026-11-13' }) === 'tech__2026-11-13__r_in' && K.buildCatCacheDocId({ category: 'Tech', region: 'intl', day: '2026-11-13' }) === 'tech__2026-11-13', 'cache ids carry the source region (International = base doc)');
    const cronSrc = read('api/refresh-category-cache.js');
    assert(/isCategoryCronPaused\(\)/.test(cronSrc) && /maxDuration: 300/.test(cronSrc), 'CATEGORY_CRON_PAUSED respected; maxDuration unchanged');
    const catSrc = read('public/src/js/features/categories.js');
    assert(/fetchCategoryCacheDocScoped/.test(catSrc) && /sourceRegion: viewerSourceRegion\(\)/.test(catSrc) && /AkhbaarSources/.test(read('api/anthropic.js')) && /akhbaar-sources\.js/.test(read('public/index.html')), 'client reads region → International docs; live calls send a source region resolved server-side from the registry');
    assert(/body\.region/.test(read('public/src/js/ai/call-ai.js')) && /region: typeof incoming\.region/.test(read('api/anthropic.js')), 'client AI calls for one viewer send their Region with their language');
  }

  // ═══════════════ 9. guest samples ═══════════════
  console.log('\nGuest samples');
  {
    const dc = read('public/src/js/core/discovery-core.js');
    const globalBlock = (dc.split('const SAMPLE_DISCOVERY_POOL_GLOBAL')[1] || '').split('];')[0];
    assert(/const SAMPLE_DISCOVERY_POOL = .*'IN'.*SAMPLE_DISCOVERY_POOL_IN : SAMPLE_DISCOVERY_POOL_GLOBAL/.test(dc) && globalBlock.length > 500 && !/Mumbai|Delhi|Bengaluru|chai|cricket|Sharma/i.test(globalBlock), 'discovery samples: global names / cities by default, India set only for Region IN');
    const du = read('public/src/js/features/duniya.js');
    const duGlobal = (du.split('const SAMPLE_DUNIYA_GLOBAL')[1] || '').split('];')[0];
    assert(duGlobal.length > 300 && !/India|Sharma|Krishnan|5_indian|dal_makhani|ladakh/i.test(duGlobal), 'Duniya samples: global set by default');
    const bd = read('public/src/js/features/baithak-data.js');
    assert(/const SAMPLE_REGION_IN = /.test(bd) && /SAMPLE_REGION_IN\?'Riya Sharma':'Alex Chen'/.test(bd) && /SAMPLE_REGION_IN\?t\('baithak\.airtrunk_investing_30b_in_india'\):t\('baithak\.sample_g\.tech_news'\)/.test(bd), 'Baithak demo chats: neutral names + global copy outside India (ids unchanged)');
  }

  // ═══════════════ constraints ═══════════════
  console.log('\nConstraints');
  {
    const apis = fs.readdirSync(path.join(ROOT, 'api')).filter((f) => f.endsWith('.js'));
    assert(apis.length === 12, `api/*.js === 12 (got ${apis.length})`);
    const L = require('./i18n-lint');
    const res = L.lint();
    assert(res.total === 0, `i18n-lint: 0 (${res.total})`);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
