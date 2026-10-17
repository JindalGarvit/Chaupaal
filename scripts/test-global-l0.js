#!/usr/bin/env node
/**
 * Global L0 — core translation system, 16-language library, region detection.
 * Runs the real runtime (public/src/i18n/*, i18n.js, region.js) in a VM via scripts/lib/i18n-runtime.js.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { loadI18n, memoryStorage, ROOT } = require('./lib/i18n-runtime');
const { check } = require('./i18n-check');

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let passes = 0;
let failures = 0;
function assert(cond, msg) {
  if (cond) {
    passes++;
    console.log('  ✓ ' + msg);
  } else {
    failures++;
    console.log('  ✗ ' + msg);
  }
}
const tick = () => new Promise((r) => setTimeout(r, 20));

const LOCKED = ['en', 'hi', 'bn', 'ta', 'te', 'mr', 'ur', 'ar', 'es', 'fr', 'pt', 'de', 'id', 'ja', 'ko', 'zh'];
const RETIRED = ['gu', 'kn', 'ml', 'pa', 'or', 'as', 'ne', 'it', 'tr', 'ru'];

function fakeDb() {
  const writes = [];
  return {
    writes,
    collection: (c) => ({
      doc: (id) => ({
        set: (data, opts) => {
          writes.push({ c, id, data, merge: !!(opts && opts.merge) });
          return Promise.resolve();
        },
      }),
    }),
  };
}

async function run() {
  console.log('\nGlobal L0 — catalog');
  {
    const rt = loadI18n();
    const codes = rt.LANG_CATALOG.map((l) => l.code);
    assert(codes.length === 16 && LOCKED.every((c) => codes.includes(c)), 'catalog has exactly the 16 locked languages');
    assert(rt.LANG_CATALOG.every((l) => l.native && l.name && /^[a-z]{2,3}-[A-Z]{2}$/.test(l.tts) && l.html), 'every language has native + English name, TTS tag and html lang');
    const e = (c) => rt.LANG_CATALOG.find((l) => l.code === c);
    assert(e('zh').tts === 'zh-CN' && e('zh').html === 'zh-Hans' && /Simplified/.test(e('zh').name), 'zh = Simplified Chinese (zh-Hans), TTS zh-CN');
    assert(e('pt').tts === 'pt-BR' && e('pt').html === 'pt-BR', 'pt = Brazilian Portuguese by default');
    assert(e('ar').tts === 'ar-SA' && e('ar').dir === 'rtl' && e('ur').tts === 'ur-PK' && e('ur').dir === 'rtl', 'ar / ur are RTL with ar-SA / ur-PK TTS');
    assert(RETIRED.every((c) => !codes.includes(c)) && JSON.stringify([...rt.I18N_RETIRED_LANGS].sort()) === JSON.stringify([...RETIRED].sort()), 'retired codes removed from the catalog, listed once in I18N_RETIRED_LANGS');
  }

  console.log('\nnormalizeLang');
  {
    const rt = loadI18n();
    const cases = { 'pt-BR': 'pt', 'zh-CN': 'zh', 'zh-Hans': 'zh', zh_TW: 'zh', 'en-GB': 'en', 'ar-EG': 'ar', 'ur-IN': 'ur', 'hi-IN': 'hi', in: 'id', 'id-ID': 'id', 'JA-jp': 'ja', xx: 'en', '': 'en', gu: 'en', 'ru-RU': 'en' };
    const bad = Object.entries(cases).filter(([k, v]) => rt.normalizeLang(k) !== v);
    assert(!bad.length, 'variants map to catalog codes (' + (bad.map(([k]) => k + '→' + rt.normalizeLang(k)).join(', ') || 'all ok') + ')');
    assert(rt.matchSupportedLang('gu-IN') === null && rt.isRetiredLang('gu-IN') && !rt.isRetiredLang('hi'), 'matchSupportedLang / isRetiredLang distinguish removed languages');
  }

  console.log('\nRetired language → English + one-time notice');
  {
    const rt = loadI18n({ storage: { chaupaal_lang: 'gu' } });
    assert(rt.currentLang === 'en' && rt.html.lang === 'en', 'saved Gujarati falls back to English on boot');
    assert(rt.localStorage.getItem('chaupaal_lang_retired_notice') === 'gu', 'notice flag queued');
    assert(rt.takeRetiredLangNotice() === 'gu' && rt.takeRetiredLangNotice() === null, 'notice is handed out once');
    rt.setAppLanguage('kn');
    assert(rt.takeRetiredLangNotice() === null, 'never shown again on this device after it was seen');
    assert(rt.t('settings.lang_retired_notice') === 'Your language isn’t available yet — showing English', 'notice copy');
    const picker = read('public/src/js/core/lang-picker.js');
    assert(/maybeShowRetiredNotice/.test(picker) && /data-notice-close/.test(picker) && /data-notice-change/.test(picker), 'notice is dismissible and offers Change');
  }

  console.log('\nFirst run picks the device language');
  {
    const rt = loadI18n({ languages: ['ta-IN', 'en-IN'] });
    assert(rt.currentLang === 'ta' && rt.localStorage.getItem('chaupaal_lang_source') === 'device', 'ta-IN device → Tamil UI on first run');
    const rt2 = loadI18n({ languages: ['gu-IN', 'pt-BR'] });
    assert(rt2.currentLang === 'pt' && !rt2.localStorage.getItem('chaupaal_lang_retired_notice'), 'unsupported device languages are skipped silently (no notice)');
    const rt3 = loadI18n({ languages: ['sw-KE'] });
    assert(rt3.currentLang === 'en', 'nothing supported → English');
    assert(JSON.stringify(rt.getDeviceLangs()) === JSON.stringify(['ta', 'en']), 'getDeviceLangs → supported, deduped, ordered (Suggested)');
  }

  console.log('\nLazy load + cache round trip');
  {
    const storage = memoryStorage();
    const rt = loadI18n({ localStorage: storage });
    assert(rt.fetchLog.length === 0, 'English is bundled — nothing fetched for en');
    const en = rt.t('correct');
    await rt.setAppLanguage('hi');
    await tick();
    const hiPack = JSON.parse(read('public/src/i18n/hi.json'));
    assert(rt.fetchLog.length === 1 && /\/src\/i18n\/hi\.json\?v=/.test(rt.fetchLog[0]), 'hi.json fetched once on selection (versioned URL)');
    assert(rt.t('correct') === hiPack['akhbaar.correct'] && rt.t('correct') !== en, 'existing Hindi copy applies after load (' + rt.t('correct') + ')');
    assert(!!JSON.parse(storage.getItem('chaupaal_i18n_pack_v1')).data['akhbaar.correct'], 'active pack cached for the next boot');
    await rt.setAppLanguage('hi');
    assert(rt.fetchLog.length === 1, 'reselecting does not refetch');
    const rt2 = loadI18n({ localStorage: storage });
    assert(rt2.currentLang === 'hi' && rt2.t('correct') === hiPack['akhbaar.correct'] && rt2.fetchLog.length === 0, 'reboot: Hindi applies synchronously from cache, no fetch');
    const ta = JSON.parse(read('public/src/i18n/ta.json'));
    await rt2.setAppLanguage('ta');
    assert(rt2.t('correct') === ta['akhbaar.correct'], 'Tamil copy still works');
    assert(rt2.events.some((e) => e.type === 'chaupaal:lang-changed' && e.detail.lang === 'ta'), 'chaupaal:lang-changed fires after the pack applies');
    const failing = loadI18n({ fetch: () => Promise.reject(new Error('offline')) });
    await failing.setAppLanguage('ja');
    assert(failing.currentLang === 'ja' && failing.t('settings.app_language') === 'App language', 'offline + uncached pack → English strings, app keeps working');
    const sw = read('public/sw.js');
    assert(/I18N_CACHE = 'chaupaal-i18n'/.test(sw) && /isI18nPack\(e\.request\.url\)/.test(sw) && /k !== I18N_CACHE/.test(sw), 'sw.js caches packs (cache-first, kept across app versions)');
    const bust = read('scripts/bust-assets.js');
    assert(/I18N_PACK_VERSIONS/.test(bust) && /const I18N_PACK_VERSIONS = \{/.test(read('public/src/js/core/i18n.js')), 'bust-assets stamps pack hashes into i18n.js');
  }

  console.log('\nMessage format');
  {
    const rt = loadI18n();
    rt.registerI18nLocale('en', {
      'common.test_items': '{count, plural, =0 {No items} one {# item} other {# items}}',
      'common.test_rank': '{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}',
      'common.test_gender': '{g, select, female {She joined} male {He joined} other {They joined}}',
      'common.test_rich': '<strong>{{name}}</strong> joined {{@mehfil}}',
    });
    assert([0, 1, 5].map((n) => rt.tn('common.test_items', n)).join('|') === 'No items|1 item|5 items', 'en plural (=0 / one / other)');
    assert([1, 2, 3, 11].map((n) => rt.t('common.test_rank', { n })).join(' ') === '1st 2nd 3rd 11th', 'selectordinal');
    assert(rt.t('common.test_gender', { g: 'female' }) === 'She joined' && rt.t('common.test_gender', { g: 'x' }) === 'They joined', 'select (gender) with other fallback');
    rt.registerI18nLocale('ar', {
      'common.test_items': '{count, plural, zero {zero} one {one} two {two} few {few:#} many {many:#} other {other:#}}',
    });
    await rt.setAppLanguage('ar');
    const ar = [0, 1, 2, 3, 11, 100].map((n) => rt.tn('common.test_items', n));
    const num = (n) => new Intl.NumberFormat('ar').format(n);
    assert(ar.join('|') === `zero|one|two|few:${num(3)}|many:${num(11)}|other:${num(100)}`, 'Arabic six plural forms via Intl.PluralRules, # in the locale’s digits (' + ar.join('|') + ')');
    rt.registerI18nLocale('ja', { 'common.test_items': '{count, plural, other {#件}}' });
    await rt.setAppLanguage('ja');
    assert(rt.tn('common.test_items', 1) === '1件' && rt.tn('common.test_items', 7) === '7件', 'Japanese: single other form');
    const ru = [1, 2, 5, 21].map((n) => rt.i18nFormat('{n, plural, one {one} few {few} many {many} other {other}}', { n }, 'ru', 'text'));
    assert(ru.join(' ') === 'one few many one', 'Russian-style one/few/many (1, 2, 5, 21)');
    await rt.setAppLanguage('en');
    assert(rt.tn('common.test_items', 3) === '3 items', 'a language without the key uses English plural rules for the English text');
    assert(rt.t('opp_thinking', { name: 'Asha' }) === 'Asha is thinking…', 'legacy {{param}} interpolation unchanged');
    assert(rt.i18nFormat('{{a}} and {{a}}', { a: 'x' }, 'en', 'text') === 'x and x', 'every occurrence of a param is replaced');
  }

  console.log('\nEscaping (no HTML injection)');
  {
    const rt = loadI18n();
    const evil = '<img src=x onerror=alert(1)>';
    const html = rt.tHtml('common.test_rich_missing', { name: evil }, '<strong>{{name}}</strong> joined');
    assert(!/<img/i.test(html) && /&lt;img/.test(html) && /^<strong>/.test(html), 'tHtml escapes params, keeps <strong>');
    rt.registerI18nLocale('hi', { 'common.test_rich': '<script>steal()</script><strong>{{name}}</strong> <a href=x>link</a>' });
    await rt.setAppLanguage('hi');
    const h = rt.tHtml('common.test_rich', { name: 'Ravi' });
    assert(!/<script|<a /i.test(h) && /&lt;script&gt;/.test(h) && /<strong>Ravi<\/strong>/.test(h), 'a translation cannot inject markup — only the rich-tag whitelist survives');
    assert(rt.t('common.test_rich', { name: 'Ravi' }).indexOf('<strong>') < 0, 't() returns plain text (rich tags stripped)');
    assert(/function htt\(/.test(read('public/src/js/core/notification-panel.js')) && /tHtml\(key/.test(read('public/src/js/core/notification-panel.js')), 'notification bundles render through tHtml');
  }

  console.log('\nFallbacks');
  {
    const warned = [];
    const rt = loadI18n({ console: { log() {}, error() {}, warn: (...a) => warned.push(a.join(' ')) } });
    await rt.setAppLanguage('fr');
    assert(rt.t('settings.app_language') === 'App language', 'key missing in fr → English');
    assert(rt.t('settings.title') !== 'settings.title' && rt.t('settings_title') === rt.t('settings.title'), 'legacy flat key resolves to the namespaced key');
    assert(rt.t('nope.missing', 'Fallback copy') === 'Fallback copy', 'caller fallback beats the raw key');
    rt.location.hostname = 'localhost';
    assert(rt.t('nope.really_missing') === 'nope.really_missing', 'no message anywhere → the key itself, never blank');
    assert(warned.some((w) => /missing key: nope\.really_missing/.test(w)), 'dev build warns once in the console');
  }

  console.log('\nGlossary');
  {
    const res = check();
    assert(res.errors.length === 0, 'i18n-check: packs valid (' + (res.errors.slice(0, 3).join('; ') || 'no errors') + ')');
    const rt = loadI18n();
    const brands = ['Chaupaal', 'Dangal', 'Baithak', 'Mehfil', 'Peepal', 'Akhbaar', 'Duniya', 'Khoj', 'Vriksha'];
    assert(brands.every((b) => Object.values(rt.I18N_GLOSSARY).includes(b)), 'all surface names are glossary constants');
    const en = res.en;
    const spelled = Object.entries(en).filter(([, v]) => brands.some((b) => new RegExp('(^|[^A-Za-z@{])' + b + '(?![A-Za-z])').test(v)));
    assert(spelled.length === 0, 'English messages reference brands as {{@id}} tokens (' + spelled.slice(0, 2).map((e) => e[0]).join(', ') + ')');
    let checked = 0;
    let ok = true;
    Object.entries(res.packs).forEach(([code, pack]) =>
      Object.entries(pack).forEach(([k, v]) => {
        (String(en[k]).match(/\{\{@[a-z0-9]+\}\}/g) || []).forEach((tok) => {
          checked++;
          if (!String(v).includes(tok)) ok = false;
        });
      })
    );
    assert(ok && checked > 50, `brand tokens untranslated in every pack (${checked} checked)`);
    await rt.setAppLanguage('te');
    assert(rt.t('dangal_title') === 'Dangal', 'Telugu UI still shows "Dangal" (was transliterated)');
  }

  console.log('\nKeys + files');
  {
    const res = check();
    const ns = new Set(Object.keys(res.en).map((k) => k.split('.')[0]));
    ['common', 'settings', 'baithak', 'mehfil', 'akhbaar', 'peepal', 'dangal', 'notifications', 'profile', 'auth'].forEach((n) =>
      assert(ns.has(n), `namespace ${n}.`)
    );
    const files = fs.readdirSync(path.join(ROOT, 'public/src/i18n'));
    assert(LOCKED.filter((c) => c !== 'en').every((c) => files.includes(c + '.json')) && files.includes('en.js'), 'one message file per language (en.js bundled, 15 lazy .json)');
    assert(!RETIRED.some((c) => files.includes(c + '.json')), 'no packs for removed languages are served');
    assert(RETIRED.filter((c) => c !== 'ar').every((c) => fs.existsSync(path.join(ROOT, 'scripts/i18n-retired', c + '.json'))), 'removed packs archived in scripts/i18n-retired/ (can return later)');
    assert(!fs.existsSync(path.join(ROOT, 'public/src/js/core/i18n-locales.js')) && !fs.existsSync(path.join(ROOT, 'scripts/gen-i18n-locales.js')), 'thin auto-generated packs + generator retired');
    const hi = JSON.parse(read('public/src/i18n/hi.json'));
    assert(Object.keys(hi).length > 700, 'Hindi pack kept (' + Object.keys(hi).length + ' keys)');
  }

  console.log('\n<html lang/dir>');
  {
    const rt = loadI18n();
    await rt.setAppLanguage('ar');
    assert(rt.html.lang === 'ar' && rt.html.dir === 'rtl', 'Arabic → lang=ar dir=rtl (no reload)');
    await rt.setAppLanguage('ur');
    assert(rt.html.dir === 'rtl', 'Urdu → rtl');
    await rt.setAppLanguage('zh');
    assert(rt.html.lang === 'zh-Hans' && rt.html.dir === 'ltr', 'Chinese → lang=zh-Hans dir=ltr');
    await rt.setAppLanguage('pt-BR');
    assert(rt.html.lang === 'pt-BR' && rt.getTtsLang() === 'pt-BR', 'Portuguese → pt-BR (html + TTS)');
  }

  console.log('\nRegion detection');
  {
    const R = loadI18n().ChaupaalRegion;
    const fx = [
      [{ languages: ['en-US'], timeZone: 'Asia/Kolkata' }, 'IN', 'timezone'],
      [{ languages: ['en-GB'], timeZone: 'Europe/London' }, 'GB', 'timezone'],
      [{ languages: ['en-IN'], timeZone: 'Asia/Dubai' }, 'AE', 'timezone'],
      [{ languages: ['de-DE'], timeZone: 'UTC' }, 'DE', 'language'],
      [{ languages: ['zh-Hans-CN'], timeZone: 'Etc/GMT-8' }, 'CN', 'language'],
      [{ languages: ['pt-BR'], timeZone: 'America/Sao_Paulo' }, 'BR', 'timezone'],
      [{ languages: ['es-419'], timeZone: 'America/Mexico_City' }, 'MX', 'timezone'],
      [{ languages: ['ja'], timeZone: 'Asia/Tokyo' }, 'JP', 'timezone'],
      [{ languages: ['ar'], timeZone: 'UTC', uiLang: 'ar' }, 'SA', 'language_default'],
      [{ languages: [], timeZone: '', uiLang: 'en' }, 'US', 'language_default'],
    ];
    fx.forEach(([sig, want, via]) => {
      const got = R.detectRegion(sig);
      assert(got.country === want && got.via === via, `${JSON.stringify(sig.languages)} + ${sig.timeZone || '∅'} → ${want} (${via}) [got ${got.country}/${got.via}]`);
    });
    const rt = loadI18n({ languages: ['en-US'], timeZone: 'Asia/Kolkata' });
    assert(rt.ChaupaalRegion.getRegion().country === 'IN' && rt.ChaupaalRegion.getRegion().source === 'auto', 'first run detects and stores the region (auto)');
    const P = (c) => rt.getRegionPrefs(c);
    const IN = P('IN');
    assert(IN.currency === 'INR' && IN.callingCode === '+91' && IN.timeZone === 'Asia/Kolkata' && IN.hour12 === true && IN.firstDayOfWeek === 0 && IN.measurement === 'metric' && IN.contentRegion === 'in' && IN.contentArea === 'south_asia', 'getRegionPrefs(IN)');
    const US = P('US');
    assert(US.currency === 'USD' && US.callingCode === '+1' && US.measurement === 'imperial' && US.hour12 && US.firstDayOfWeek === 0, 'getRegionPrefs(US): USD, +1, imperial, 12h, Sunday');
    const DE = P('DE');
    assert(DE.currency === 'EUR' && DE.callingCode === '+49' && DE.hour12 === false && DE.firstDayOfWeek === 1 && DE.contentArea === 'europe', 'getRegionPrefs(DE): EUR, +49, 24h, Monday');
    assert(P('GB').measurement === 'uk' && P('JP').hour12 === false && P('BR').currency === 'BRL', 'GB uk units, JP 24h, BR BRL');
    assert(US.timeZone === 'UTC', 'region set away from the device zone → neutral UTC default, not the phone clock');
    assert(Object.keys(rt.ChaupaalRegion.COUNTRIES).length >= 240 && rt.ChaupaalRegion.listCountries('en').length >= 240, 'searchable country list (240+)');
    assert(rt.ChaupaalRegion.setRegion('ZZ') === null, 'invalid country rejected');
  }

  console.log('\nProfile sync');
  {
    const db = fakeDb();
    const rt = loadI18n({ languages: ['en-US'], timeZone: 'America/New_York', db, currentUser: { uid: 'u1' } });
    await rt.setAppLanguage('es', { persistRemote: true });
    rt.setContentLangs(['es', 'en', 'xx'], { persistRemote: true });
    rt.ChaupaalRegion.setRegion('MX', { persistRemote: true });
    const w = db.writes.map((x) => x.data);
    assert(w.some((d) => d.lang === 'es') && w.some((d) => JSON.stringify(d.contentLangs) === '["es","en"]') && w.some((d) => d.region && d.region.country === 'MX' && d.region.source === 'user'), 'UI language, languages I read and region write users/{uid} (merge)');
    assert(db.writes.every((x) => x.c === 'users' && x.id === 'u1' && x.merge), 'writes are merges on the owner doc');

    const db2 = fakeDb();
    const other = loadI18n({ languages: ['en-US'], timeZone: 'America/New_York', db: db2, currentUser: { uid: 'u1' } });
    const writes = other.hydrateLocaleFromProfile({ lang: 'es', contentLangs: ['es', 'en'], region: { country: 'MX', source: 'user' } });
    await tick();
    assert(other.currentLang === 'es' && JSON.stringify(other.getContentLangs()) === '["es","en"]' && other.ChaupaalRegion.getRegion().country === 'MX', 'second device adopts the profile choices on sign-in');
    assert(Object.keys(writes).length === 0 && db2.writes.length === 0, 'nothing written back when the profile is complete');

    const db3 = fakeDb();
    const fresh = loadI18n({ languages: ['hi-IN'], timeZone: 'Asia/Kolkata', db: db3, currentUser: { uid: 'u2' } });
    fresh.ChaupaalRegion.setRegion('SG', { source: 'user' });
    fresh.hydrateLocaleFromProfile({ region: { country: 'IN', source: 'auto' } });
    const d3 = Object.assign({}, ...db3.writes.map((x) => x.data));
    assert(d3.lang === 'hi' && d3.region && d3.region.country === 'SG', 'profile missing choices ← this device fills them; a picked region beats a detected one');
    const retiredProfile = loadI18n();
    retiredProfile.hydrateLocaleFromProfile({ lang: 'ml' });
    assert(retiredProfile.currentLang === 'en' && retiredProfile.localStorage.getItem('chaupaal_lang_retired_notice') === 'ml', 'a retired language on the profile → English + notice');
  }

  console.log('\nUI wiring');
  {
    const html = read('public/index.html');
    assert(/id="langPickerBtn"/.test(html) && /id="contentLangsBtn"/.test(html) && /id="regionPickerBtn"/.test(html), 'Settings rows: App language, Languages I read, Region');
    assert(!/value="gu"/.test(html) && !/i18n-locales\.js/.test(html), 'no hard-coded removed languages / locale file in index.html');
    const order = ['/src/i18n/en.js', '/src/i18n/legacy-keys.js', '/src/js/core/i18n.js', '/src/js/core/region.js', '/src/js/core/lang-picker.js'].map((s) => html.indexOf(s));
    assert(order.every((i, n) => i > 0 && (n === 0 || i > order[n - 1])), 'script order: en → legacy → i18n → region → lang-picker');
    const picker = read('public/src/js/core/lang-picker.js');
    assert(/data-lang-search/.test(picker) && /settings\.lang_suggested/.test(picker) && /settings\.lang_current/.test(picker), 'picker: search + Suggested + current pinned');
    assert(/role="\$\{multi \? 'checkbox'/.test(picker) && /setContentLangs\(order, \{ persistRemote: true \}\)/.test(picker), 'Languages I read: multi-select, synced');
    assert(/chipHtml\(\)/.test(read('public/src/js/core/first-run.js')), 'onboarding shows the Language · Change chip');
    assert(/hydrateLocaleFromProfile\(userProfile\)/.test(read('public/src/js/auth/auth-ui.js')), 'sign-in hydrates language / reading languages / region');
    const apiCount = fs.readdirSync(path.join(ROOT, 'api')).filter((f) => f.endsWith('.js')).length;
    assert(apiCount === 12, `api/*.js === 12 (got ${apiCount})`);
  }

  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
