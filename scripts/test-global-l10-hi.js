/**
 * Global L10 — Hindi (hi) language pass. Template for L11–L24: copy, set LANG + script range.
 *   node -r ./scripts/lib/i18n-node-shim.js scripts/test-global-l10-hi.js
 *
 * Coverage 100% · placeholders · plurals · glossary (brands + hi term list) · Devanagari share ·
 * search intents (Devanagari + Hinglish) · Dangal content minimums (packs, Scribble ≥600, Quiz ≥500 +
 * Daily pool, rules FAQs ≥5/game) · Shabd Five daily · store listing + PWA manifest + OG meta ·
 * server templates (push, cards, statements of reasons) render in hi.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const LANG = 'hi';
const SCRIPT = /[\u0900-\u097F]/;
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
const res = check();
const en = res.en;
const pack = res.packs[LANG] || {};
const enKeys = Object.keys(en);
const GLOSSARY = JSON.parse(read('public/src/i18n/glossary.json'));

// Strings that legitimately carry no Hindi letters (symbols, numbers, codes, brand-only, notation).
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
    Object.keys(pack).forEach((k) =>
      pluralBlocks(String(pack[k])).forEach((b) => {
        if (b.type === 'plural' && need.some((c) => !b.cats.has(c))) gaps.push(k);
      })
    );
    assert(gaps.length === 0, `every plural block has ${need.join(' + ')} (${gaps.length} gaps${gaps.length ? ': ' + gaps.slice(0, 3).join(', ') : ''})`);
    const icu = enKeys.filter((k) => /\{\s*\w+\s*,\s*(plural|select)/.test(en[k]) && !/\{\s*\w+\s*,\s*(plural|select)/.test(String(pack[k] || '')));
    assert(icu.length === 0, `plural / select messages keep their ICU block (${icu.length})`);
    const latinOnly = Object.keys(pack).filter((k) => !SCRIPT.test(pack[k]) && !nonLanguage(pack[k]) && !nonLanguage(en[k]));
    assert(latinOnly.length <= Math.ceil(enKeys.length * 0.005), `Devanagari everywhere words appear (${latinOnly.length} Latin-only${latinOnly.length ? ': ' + latinOnly.slice(0, 5).join(', ') : ''})`);
    const devDigits = Object.keys(pack).filter((k) => /[\u0966-\u096F]/.test(pack[k]));
    assert(devDigits.length === 0, `Western digits by default (no Devanagari numerals in the pack: ${devDigits.length})`);
  }

  console.log('\nGlossary');
  {
    const brands = Object.values(GLOSSARY.brands);
    // Only names that aren't also everyday words (खोज = search, दुनिया = world, ख़बर/अख़बार = news are fine in prose).
    const dev = { Chaupaal: 'चौपाल', Dangal: 'दंगल', Baithak: 'बैठक', Mehfil: 'महफ़िल', Peepal: 'पीपल', Vriksha: 'वृक्ष' };
    const tokenised = enKeys.filter((k) => /\{\{@\w+\}\}/.test(en[k]) && !(String(en[k]).match(/\{\{@\w+\}\}/g) || []).every((t) => String(pack[k] || '').includes(t)));
    assert(tokenised.length === 0, `brand tokens kept untranslated (${tokenised.length})`);
    assert(brands.length >= 9 && GLOSSARY.hi && Object.keys(GLOSSARY.hi).length > 80, `glossary.json has brands + a hi term list (${Object.keys(GLOSSARY.hi || {}).length} terms)`);
    // A surface name spelled in Devanagari where English uses the token = a translated brand.
    const spelled = enKeys.filter((k) => Object.entries(dev).some(([b, d]) => String(en[k]).includes('{{@' + b.toLowerCase() + '}}') && String(pack[k] || '').replace(/\{\{@\w+\}\}/g, '').includes(d) && !String(en[k]).toLowerCase().includes(d)));
    assert(spelled.length <= 3, `no brand spelled out in Devanagari next to its token (${spelled.length}${spelled.length ? ': ' + spelled.slice(0, 3).join(', ') : ''})`);
    // Term consistency: exact-match English UI labels use the glossary term.
    const terms = { Cancel: 'रद्द करें', Save: 'सेव करें', Share: 'शेयर करें', Delete: 'डिलीट करें', Settings: 'सेटिंग्स', Profile: 'प्रोफ़ाइल', Friends: 'दोस्त', Send: 'भेजें', 'Try again': 'फिर से कोशिश करें', Report: 'रिपोर्ट करें', Block: 'ब्लॉक करें' };
    const off = [];
    Object.entries(terms).forEach(([e, h]) => enKeys.filter((k) => en[k] === e).forEach((k) => pack[k] && !String(pack[k]).includes(h.split(' ')[0]) && off.push(k + '=' + pack[k])));
    assert(off.length <= 8, `exact UI labels follow the hi term list (${off.length} off${off.length ? ': ' + off.slice(0, 4).join(', ') : ''})`);
  }

  console.log('\nSearch (Khoj intents)');
  {
    const src = read('public/src/js/core/chaupaal-intents-manifest.js');
    const hiLists = (src.match(/\bhi\s*:\s*\[/g) || []).length;
    const kwCalls = (src.match(/\bkw\(/g) || []).length;
    assert(kwCalls > 0 && hiLists >= kwCalls - 1, `every kw() keyword list has hi entries (${hiLists} hi lists / ${kwCalls} kw calls)`);
    const hiText = (src.match(/\bhi\s*:\s*\[[^\]]*\]/g) || []).join(' ');
    ['खेल', 'दोस्त', 'ख़बर', 'शतरंज', 'सेटिंग्स'].forEach((w) => assert(hiText.includes(w), `Devanagari keyword “${w}”`));
    ['khel', 'dost', 'khabar', 'shatranj'].forEach((w) => assert(new RegExp("['\"]" + w).test(hiText), `Hinglish keyword “${w}”`));
  }

  console.log('\nDangal content');
  {
    global.window = global;
    const CL = require('../public/src/js/dangal/content-locales.js');
    ['imposter.packs', 'charades.packs', 'mostlikely.prompts', 'rajamantri.roles', 'scribble.words', 'shabd.lexicon', 'imposter.regional'].forEach((id) => assert(CL.available(id, LANG), `manifest: ${id} available in ${LANG}`));
    const keyed = ['werewolf.narration', 'streetcricket.commentary', 'badminton.umpire', 'tambola.caller', 'uno.shouts', 'chess.openings', 'rules', 'faq', 'tips'];
    keyed.forEach((id) => {
      const prefixes = CL.SETS[id].keys;
      const ks = enKeys.filter((k) => prefixes.some((p) => k.startsWith(p)));
      const have = ks.filter((k) => k in pack).length;
      assert(ks.length && have / ks.length >= CL.KEY_COVERAGE, `${id}: ${have}/${ks.length} keys in ${LANG}`);
    });
    const faqShort = CL.GAMES.filter((g) => {
      const qs = Object.keys(pack).filter((k) => new RegExp('^games\\.' + g + '\\.faq\\.\\d+\\.q$').test(k));
      return qs.length < 5;
    });
    assert(faqShort.length === 0, `rules FAQ ≥5 per game in ${LANG} for all ${CL.GAMES.length} games (${faqShort.join(', ') || 'none short'})`);

    const coverPacks = (name, mod, hi, field) => {
      const M = require('../public/src/js/data/' + mod);
      const H = require('../public/src/js/data/locales/hi/' + hi);
      if (typeof M.applyLocale === 'function') M.applyLocale(LANG, H);
      return M;
    };
    const Imp = coverPacks('imposter', 'imposter-packs.js', 'imposter-packs.hi.js');
    const impCore = Object.values(Imp.PACKS).filter((p) => !p.regional);
    const impMissing = impCore.filter((p) => !SCRIPT.test(JSON.stringify(p.items || p)));
    assert(impMissing.length === 0, `Imposter: every core pack has Hindi words (${impCore.length} packs${impMissing.length ? '; missing ' + impMissing.map((p) => p.id).join(',') : ''})`);
    const ML = coverPacks('mostlikely', 'mostlikely-packs.js', 'mostlikely-packs.hi.js');
    const mlCore = Object.values(ML.PACKS).filter((p) => !p.regional);
    const has = (s) => !!s && SCRIPT.test(s);
    // Never Have I Ever lines are UI-keyed (games.mostlikely.nhie.<pack>.<n>); the other modes carry their language inline.
    const nhieKey = (x) => 'games.mostlikely.nhie.' + String(x.pack).replace(/-/g, '_') + '.' + String(x.key).split(':')[1];
    const mlGap = mlCore.filter(
      (p) =>
        (p.likely || []).some((x) => !has(x.hi)) ||
        (p.rather || []).some((x) => !has(x.a && x.a.hi) || !has(x.b && x.b.hi)) ||
        (p.never || []).some((x) => !has(x.hi) && !has(pack[nhieKey(x)]))
    );
    assert(mlGap.length === 0, `Most Likely To / Would You Rather / Never Have I Ever: every core prompt has Hindi (${mlCore.length} packs${mlGap.length ? '; gaps ' + mlGap.map((p) => p.id).join(',') : ''})`);
    const CH = coverPacks('charades', 'charades-packs.js', 'charades-packs.hi.js');
    const chGap = Object.values(CH.PACKS).filter((p) => !p.regional && (p.titles || []).some((t) => !t.hi || !SCRIPT.test(t.hi)));
    assert(chGap.length === 0, `Charades: every core title has Hindi (${chGap.map((p) => p.id).join(',') || 'complete'})`);

    const Words = require('../server-lib/scribble-words.js');
    assert(Words.coreCount(LANG) >= 600 && Words.languages().includes(LANG), `Scribble: ${Words.coreCount(LANG)} Hindi core words (≥600)`);
    const hiPool = Words.wordsFor(['everyday', 'animals', 'food'], LANG);
    assert(hiPool.easy.length && hiPool.easy.every((w) => SCRIPT.test(w.split('|')[0])), 'Scribble: a Hindi room is dealt Devanagari words');
    const SC = require('../public/src/js/games/scribble-core.js');
    assert(SC.isCorrect('पतंग', 'पतंग|patang|kite') && SC.isCorrect('Patang', 'पतंग|patang|kite') && !SC.isCorrect('पतन', 'पतंग|patang'), 'Scribble: Devanagari and Hinglish guesses both count');
    assert(SC.pattern('पतंग|patang', []) === '___' && SC.pattern('किताब', [0]) === 'कि__', 'Scribble: hints reveal whole syllables (matras never split)');
    assert(SC.drawerSecret({ drawer: 'a', phase: 'draw', turnKey: 'k', word: 'पतंग|patang' }).word === 'पतंग', 'Scribble: accepted spellings never reach clients');

    const QL = require('../server-lib/quiz-locales.js');
    assert(QL.coverage(LANG) >= QL.CORE_MIN && QL.available(LANG), `Quiz: ${QL.coverage(LANG)} of ${QL.coreSubset().length} core questions in Hindi (≥${QL.CORE_MIN})`);
    const B = require('../server-lib/quiz-bank.js');
    const q = B.bank().find((x) => x.id === QL.coreSubset()[0]);
    const lq = QL.localise(q, LANG);
    assert(SCRIPT.test(lq.prompt) && lq.options.length === 4 && lq.correctIndex === q.correctIndex, 'Quiz: localised question keeps the answer index');
    const daily = QL.dailyPool(B.bank());
    assert(daily.length >= 10 && daily.every((x) => QL.coreSubset().includes(x.id)), 'Quiz: the Daily draws from the translated core subset');

    assert(CL.modeAvailable('wordguess', 'daily', LANG), 'Shabd Five: the Daily is offered to Hindi readers (English five-letter lexicon, per the manifest)');
    const SH = require('../public/src/js/games/shabd-core.js');
    global.SHABD_ANSWERS_ENC = undefined;
    vm.runInThisContext(read('public/src/js/games/data/shabd-answers.js'));
    const sched = SH.decodeSchedule(global.SHABD_ANSWERS_ENC);
    assert(sched.length > 300 && /^[A-Z]{5}$/i.test(SH.dailyAnswer(SH.dayNumber(new Date()), sched)), 'Shabd Five: today’s Daily answer decodes');
  }

  console.log('\nStore + web');
  {
    const L = JSON.parse(read('store/listings/hi/listing.json'));
    assert(L.translated === true && SCRIPT.test(L.apple.description) && SCRIPT.test(L.google.shortDescription), 'store listing translated (App Store + Google Play)');
    const sv = spawnSync(process.execPath, [path.join(__dirname, 'store-validate.js')], { encoding: 'utf8' });
    assert(sv.status === 0, 'store listing lengths within limits: ' + String(sv.stdout).trim().split('\n').pop());
    const M = JSON.parse(read('public/manifests/manifest.hi.json'));
    assert(SCRIPT.test(M.description) && M.start_url === '/?lang=hi' && M.lang === 'hi', 'PWA manifest localised');
    const og = require('../server-lib/og-preview.js');
    const card = og.genericCard('https://chaupaal.app', '/', LANG);
    assert(SCRIPT.test(card.description), 'OG / meta description for public pages in hi');
    assert(og.ogLang({ headers: { 'accept-language': 'hi-IN,hi;q=0.9' }, query: {} }) === LANG, 'OG language follows Accept-Language hi-IN');
  }

  console.log('\nServer templates');
  {
    const S = require('../server-lib/i18n-server.js');
    ['notifications.card.festival_diwali_wish', 'notifications.card.birthday_title', 'moderation.sor_redress', 'moderation.sor_action_remove', 'common.og_profile_title'].forEach((k) => {
      if (!S.hasKey(k)) return;
      const out = S.serverT(LANG, k, { name: 'Asha', days: 3, rule: 'x', country: 'IN', basis: 'x', facts: 'x' });
      assert(SCRIPT.test(out), `serverT(hi, ${k}) → ${out.slice(0, 40)}`);
    });
    const pushKeys = enKeys.filter((k) => k.startsWith('notifications.'));
    const pushHi = pushKeys.filter((k) => SCRIPT.test(String(pack[k] || '')) || nonLanguage(en[k]));
    assert(pushHi.length === pushKeys.length, `push / in-app notification templates in hi (${pushHi.length}/${pushKeys.length})`);
    const sor = enKeys.filter((k) => k.startsWith('moderation.'));
    assert(sor.every((k) => k in pack), `statements of reasons + moderation templates in hi (${sor.length})`);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
