/**
 * Global L11 — Urdu (ur) language pass: the L10 checklist for ur + RTL (first right-to-left language).
 *   node -r ./scripts/lib/i18n-node-shim.js scripts/test-global-l11-ur.js
 *
 * Coverage 100% · placeholders · plurals · glossary · Urdu-script share · search (Urdu + Roman Urdu) ·
 * Dangal content minimums · Shabd Five hidden (no ur lexicon) · store listing + manifest + OG ·
 * server templates in ur · RTL: dir, logical CSS, mirrored icons, story swipe, boards LTR, bidi
 * isolation, Nastaliq / Naskh font rules.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const LANG = 'ur';
const SCRIPT = /[\u0600-\u06FF]/;
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

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

const { check } = require('./i18n-check');
const { pluralBlocks } = require('./i18n-coverage');
const { loadI18n } = require('./lib/i18n-runtime');
const res = check();
const en = res.en;
const pack = res.packs[LANG] || {};
const enKeys = Object.keys(en);
const GLOSSARY = JSON.parse(read('public/src/i18n/glossary.json'));

const nonLanguage = (s) => {
  const bare = String(s)
    .replace(/\{\{@?\w+\}\}/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\{\s*\w+\s*,\s*(plural|select|selectordinal)\s*,/g, '')
    .replace(/\b(one|other|zero|few|many|two|male|female)\b/g, '')
    .replace(/\b(AI|OTP|PIN|URL|GIF|DM|QR|Wi-Fi|PDF|ID|FAQ|OK|VS|vs|XP|MVP|LBW|DRS|T20|ODI|UNO|ECO|HD|GPS|API|SMS|PRO|Pro|K|Q|J|A|N|S|E|W)\b/g, '')
    .replace(/[A-Z]\d+|\d+[a-z]{0,2}|[a-h][1-8]|O-O(-O)?|[+\-x×=#…·•→←↑↓%$€£₹¥!?.,:;'"()\[\]\/\\|&*_~^`<>@{}\s\d—–-]/g, '')
    .replace(/[\p{Extended_Pictographic}\u200d\ufe0f]/gu, '');
  return !/[A-Za-z]{2,}/.test(bare);
};

(async () => {
  console.log('\nCoverage');
  {
    const missing = enKeys.filter((k) => !(k in pack));
    assert(missing.length === 0, `100% of ${enKeys.length} keys translated (missing ${missing.length}${missing.length ? ': ' + missing.slice(0, 5).join(', ') : ''})`);
    const errs = res.errors.filter((e) => e.startsWith(LANG + ':') || e.startsWith(LANG + '.json'));
    assert(errs.length === 0, `no placeholder / brand-token / brace errors in ${LANG}.json (${errs.length}${errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''})`);
    const need = new Intl.PluralRules(LANG).resolvedOptions().pluralCategories;
    const gaps = [];
    Object.keys(pack).forEach((k) => pluralBlocks(String(pack[k])).forEach((b) => b.type === 'plural' && need.some((c) => !b.cats.has(c)) && gaps.push(k)));
    assert(gaps.length === 0, `every plural block has ${need.join(' + ')} (${gaps.length} gaps)`);
    const latinOnly = Object.keys(pack).filter((k) => !SCRIPT.test(pack[k]) && !nonLanguage(pack[k]) && !nonLanguage(en[k]));
    assert(latinOnly.length <= Math.ceil(enKeys.length * 0.005), `Urdu script everywhere words appear (${latinOnly.length} Latin-only${latinOnly.length ? ': ' + latinOnly.slice(0, 5).join(', ') : ''})`);
    const easternDigits = Object.keys(pack).filter((k) => /[\u06F0-\u06F9\u0660-\u0669]/.test(pack[k]));
    assert(easternDigits.length === 0, `Western digits by default (no Urdu/Arabic-Indic numerals in the pack: ${easternDigits.length})`);
    const hindiInUrdu = Object.keys(pack).filter((k) => /[\u0900-\u097F]/.test(pack[k]));
    assert(hindiInUrdu.length === 0, `no Devanagari inside the Urdu pack (${hindiInUrdu.length})`);
  }

  console.log('\nGlossary');
  {
    const tokenised = enKeys.filter((k) => /\{\{@\w+\}\}/.test(en[k]) && !(String(en[k]).match(/\{\{@\w+\}\}/g) || []).every((t) => String(pack[k] || '').includes(t)));
    assert(tokenised.length === 0, `brand tokens kept untranslated (${tokenised.length})`);
    assert(GLOSSARY.ur && Object.keys(GLOSSARY.ur).length > 80, `glossary.json has a ur term list (${Object.keys(GLOSSARY.ur || {}).length} terms)`);
    const terms = { Cancel: 'منسوخ', Save: 'محفوظ', Share: 'شیئر', Delete: 'حذف', Settings: 'سیٹنگز', Profile: 'پروفائل', Friends: 'دوست', Send: 'بھیجیں', Report: 'رپورٹ', Block: 'بلاک' };
    const off = [];
    Object.entries(terms).forEach(([e, u]) => enKeys.filter((k) => en[k] === e).forEach((k) => pack[k] && !String(pack[k]).includes(u) && off.push(k + '=' + pack[k])));
    assert(off.length <= 8, `exact UI labels follow the ur term list (${off.length} off${off.length ? ': ' + off.slice(0, 4).join(', ') : ''})`);
  }

  console.log('\nSearch (Khoj intents: Urdu + Roman Urdu)');
  {
    const src = read('public/src/js/core/chaupaal-intents-manifest.js') + read('public/src/js/dangal/dangal-assist.js');
    const hiLists = (src.match(/\bhi\s*:\s*\[\s*['"]/g) || []).length;
    const urLists = (src.match(/\bur\s*:\s*\[\s*['"]/g) || []).length;
    assert(urLists >= hiLists && urLists > 0, `every keyword list that has hi also has ur (${urLists} ur / ${hiLists} hi)`);
    const urText = (src.match(/\bur\s*:\s*\[[^\]]*\]/g) || []).join(' ');
    ['کھیل', 'دوست', 'خبر', 'شطرنج'].forEach((w) => assert(urText.includes(w), `Urdu keyword “${w}”`));
    ['khel', 'dost', 'khabar', 'gana'].forEach((w) => assert(new RegExp("['\"]" + w).test(urText), `Roman Urdu keyword “${w}”`));
  }

  console.log('\nDangal content');
  {
    global.window = global;
    const CL = require('../public/src/js/dangal/content-locales.js');
    ['imposter.packs', 'charades.packs', 'mostlikely.prompts', 'rajamantri.roles', 'scribble.words'].forEach((id) => assert(CL.available(id, LANG), `manifest: ${id} available in ${LANG}`));
    assert(!CL.available('shabd.lexicon', LANG) && !CL.modeAvailable('wordguess', 'daily', LANG), 'Shabd Five: no ur lexicon → the Daily stays hidden for ur (not faked)');
    ['werewolf.narration', 'streetcricket.commentary', 'badminton.umpire', 'tambola.caller', 'uno.shouts', 'chess.openings', 'rules', 'faq', 'tips'].forEach((id) => {
      const ks = enKeys.filter((k) => CL.SETS[id].keys.some((p) => k.startsWith(p)));
      const have = ks.filter((k) => k in pack).length;
      assert(ks.length && have / ks.length >= CL.KEY_COVERAGE, `${id}: ${have}/${ks.length} keys in ${LANG}`);
    });
    const faqShort = CL.GAMES.filter((g) => Object.keys(pack).filter((k) => new RegExp('^games\\.' + g + '\\.faq\\.\\d+\\.q$').test(k)).length < 5);
    assert(faqShort.length === 0, `rules FAQ ≥5 per game in ${LANG} (${faqShort.join(', ') || 'none short'})`);
    const files = ['imposter', 'charades', 'mostlikely', 'rajamantri'].map((g) => 'public/src/js/data/locales/ur/' + (g === 'rajamantri' ? 'rajamantri.ur.js' : g + '-packs.ur.js'));
    assert(files.every((f) => fs.existsSync(path.join(ROOT, f))), 'Urdu overlays for Imposter, Charades, Most Likely To, Raja Mantri Chor Sipahi');
    const Words = require('../server-lib/scribble-words.js');
    assert(Words.coreCount(LANG) >= 600 && Words.languages().includes(LANG), `Scribble: ${Words.coreCount(LANG)} Urdu core words (≥600)`);
    const pool = Words.wordsFor(['everyday', 'animals'], LANG);
    assert(pool.easy.length && pool.easy.every((w) => SCRIPT.test(w.split('|')[0])), 'Scribble: an Urdu room is dealt Urdu words');
    const SC = require('../public/src/js/games/scribble-core.js');
    const w = pool.easy[0];
    const roman = w.split('|')[1];
    assert(SC.isCorrect(w.split('|')[0], w) && (!roman || SC.isCorrect(roman, w)), 'Scribble: Urdu-script and Roman Urdu guesses both count');
    const QL = require('../server-lib/quiz-locales.js');
    assert(QL.coverage(LANG) >= QL.CORE_MIN && QL.available(LANG), `Quiz: ${QL.coverage(LANG)} core questions in Urdu (≥${QL.CORE_MIN})`);
  }

  console.log('\nStore + web');
  {
    const L = JSON.parse(read('store/listings/ur/listing.json'));
    assert(L.translated === true && SCRIPT.test(L.apple.description) && SCRIPT.test(L.google.shortDescription), 'store listing translated');
    const sv = spawnSync(process.execPath, [path.join(__dirname, 'store-validate.js')], { encoding: 'utf8' });
    assert(sv.status === 0, 'store listing lengths within limits: ' + String(sv.stdout).trim().split('\n').pop());
    const M = JSON.parse(read('public/manifests/manifest.ur.json'));
    assert(SCRIPT.test(M.description) && M.lang === 'ur' && M.dir === 'rtl', 'PWA manifest localised (lang ur, dir rtl)');
    const og = require('../server-lib/og-preview.js');
    assert(SCRIPT.test(og.genericCard('https://chaupaal.app', '/', LANG).description), 'OG / meta description in ur');
  }

  console.log('\nServer templates');
  {
    const S = require('../server-lib/i18n-server.js');
    ['notifications.push.moderation_action', 'moderation.sor_redress', 'notifications.bundle_follow'].forEach((k) => {
      if (!S.hasKey(k)) return;
      const out = S.serverT(LANG, k, { actor: 'Asha', name: 'Asha' });
      assert(SCRIPT.test(out), `serverT(ur, ${k}) → ${out.slice(0, 40)}`);
    });
    const pushKeys = enKeys.filter((k) => k.startsWith('notifications.'));
    assert(pushKeys.every((k) => SCRIPT.test(String(pack[k] || '')) || nonLanguage(en[k])), `push / in-app templates in ur (${pushKeys.length})`);
  }

  console.log('\nRTL');
  {
    const cat = vm.runInNewContext(read('public/src/js/core/i18n.js').match(/const LANG_CATALOG = (\[[\s\S]*?\]);/)[1]);
    const ur = cat.find((l) => l.code === 'ur');
    assert(ur && ur.dir === 'rtl' && ur.tts === 'ur-PK', 'catalog: ur is RTL, TTS ur-PK');
    const rt = loadI18n({ storage: { chaupaal_lang: 'ur' }, languages: ['ur'] });
    await rt.setAppLanguage('ur');
    rt.currentLang = 'ur';
    assert(rt.document.documentElement.dir === 'rtl' && rt.document.documentElement.lang === 'ur', 'html dir="rtl" lang="ur" when the UI is Urdu');
    const brand = rt.t('common.find_on_khoj');
    assert(/\u2068Khoj\u2069/.test(brand) && SCRIPT.test(brand), `brand names bidi-isolated inside Urdu sentences ("${brand.replace(/[\u2068\u2069]/g, '|')}")`);
    rt.registerI18nLocale('ur', { 'common.zz_l11_handle': '{{name}} نے {{url}} شیئر کیا' });
    const iso = rt.t('common.zz_l11_handle', { name: '@asha_k', url: 'https://x.app/p' });
    assert(iso.includes('\u2068@asha_k\u2069') && iso.includes('https://x.app/p') && !iso.includes('\u2068https'), '@handles isolated; URL params left raw (never inside href marks)');
    const enRt = loadI18n({ storage: { chaupaal_lang: 'en' }, languages: ['en'] });
    assert(!/[\u2068\u2069]/.test(enRt.t('common.find_on_khoj')), 'LTR languages get no isolate marks');

    const css = fs.readdirSync(path.join(ROOT, 'public/src/styles')).filter((f) => f.endsWith('.css')).map((f) => read('public/src/styles/' + f)).join('\n');
    const phys = (css.match(/(?:^|[^-\w])(?:margin|padding|border)-(?:left|right)\s*:|text-align\s*:\s*(?:left|right)|float\s*:\s*(?:left|right)|(?:^|[;{\s])(?:left|right)\s*:\s*(?!50%)[^;}]+/gm) || []).filter((m) => !/\b(left|right)\s*:\s*(0|auto)\b/.test(m) || /margin|padding|text-align|float/.test(m));
    assert(phys.length <= 12, `shared CSS uses logical properties (${phys.length} physical left/right outside centring/0 offsets${phys.length ? ': ' + phys.slice(0, 3).join(' | ') : ''})`);
    const jsUi = ['public/src/js/features/baithak.js', 'public/src/js/features/baithak-chat.js', 'public/src/js/core/profile-sections.js', 'public/src/js/games/party-classics.js'].filter((f) => /text-align:\s*left|margin-left:\s*\d/.test(read(f)));
    assert(jsUi.length === 0, `UI text in templates is start/end-aligned, not left/right (${jsUi.join(', ') || 'clean'})`);
    assert(/\[dir="rtl"\] :is\(\.cp-flip-rtl/.test(css) && /DIRECTIONAL = new Set\(\[\s*'arrow-left', 'arrow-right', 'chevron-left', 'chevron-right'/.test(read('public/src/js/core/icons.js')), 'directional icons get .cp-flip-rtl and mirror in RTL');
    assert(/\[dir="rtl"\] :is\(canvas,[\s\S]*?\.chess-board[\s\S]*?\.ludo-board[\s\S]*?\{\s*direction: ltr;/.test(css), 'boards / canvases / hands stay LTR (unmirrored) in RTL');
    assert(/const forward = typeof isRtl === 'function' && isRtl\(\) \? dx > 0 : dx < 0;/.test(read('public/src/js/features/duniya-story-viewer.js')) && /\.ds-hit-l\{inset-inline-start:0;\}/.test(css), 'Duniya stories advance in reading direction (swipe + tap zones mirror)');
    assert(/isRtl\(\) \? -1 : 1/.test(read('public/src/js/core/swipe-pager.js')) && /isRtl\(\)/.test(read('public/src/js/core/section-swipe.js')), 'tab / section swipes reverse in RTL');
    assert(/unicode-bidi: isolate/.test(css) && /unicode-bidi: plaintext/.test(css), 'names / handles isolate; user text takes its own direction (dir=auto + plaintext)');
    const layout = read('public/src/js/core/i18n-layout.js');
    assert(/'Noto Nastaliq Urdu', alias: 'CP Nastaliq'/.test(layout) && /'Noto Naskh Arabic', alias: 'CP Naskh'/.test(layout), 'fonts: Nastaliq (running text) + Naskh (compact UI) lazy-loaded for ur');
    assert(/:root:lang\(ur\) body \{ line-height: 2; \}/.test(css) && /--font-naskh/.test(css) && /\.bottom-tabs \.tab-btn[\s\S]{0,400}font-family: 'Inter', var\(--font-naskh\)/.test(css), 'font rules: Nastaliq line-height 2; tabs / chips / badges / HUDs fall back to Naskh');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
