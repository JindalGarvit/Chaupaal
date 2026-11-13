/**
 * Shared checks for a language pass test (test-global-l1x-<lang>.js): coverage, plurals, script share,
 * glossary, Khoj keywords, Dangal content minimums, store / manifest / OG, server templates.
 * Each test passes its config plus `extra(ctx)` for script-specific checks.
 *   cfg = { lang, name, script: RegExp, banned?: [[RegExp, label]], terms: { English: 'native fragment' },
 *           searchNative: [...], searchLatin: [...], dir?: 'ltr' | 'rtl', extra?: async (ctx) => {} }
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

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

async function runLangPass(cfg) {
  const LANG = cfg.lang;
  const SCRIPT = cfg.script;
  let passed = 0;
  let failed = 0;
  const assert = (cond, msg) => {
    if (cond) {
      passed++;
      console.log('  ✓ ' + msg);
    } else {
      failed++;
      console.log('  FAIL ' + msg);
    }
  };

  const { check } = require('../i18n-check');
  const { pluralBlocks } = require('../i18n-coverage');
  const res = check();
  const en = res.en;
  const pack = res.packs[LANG] || {};
  const enKeys = Object.keys(en);
  const GLOSSARY = JSON.parse(read('public/src/i18n/glossary.json'));

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
    assert(latinOnly.length <= Math.ceil(enKeys.length * 0.005), `${cfg.name} script everywhere words appear (${latinOnly.length} Latin-only${latinOnly.length ? ': ' + latinOnly.slice(0, 5).join(', ') : ''})`);
    (cfg.banned || []).forEach(([re, label]) => {
      const hits = Object.keys(pack).filter((k) => re.test(pack[k]));
      assert(hits.length === 0, `no ${label} in the ${LANG} pack (${hits.length}${hits.length ? ': ' + hits.slice(0, 3).join(', ') : ''})`);
    });
  }

  console.log('\nGlossary');
  {
    const tokenised = enKeys.filter((k) => /\{\{@\w+\}\}/.test(en[k]) && !(String(en[k]).match(/\{\{@\w+\}\}/g) || []).every((t) => String(pack[k] || '').includes(t)));
    assert(tokenised.length === 0, `brand tokens kept untranslated (${tokenised.length})`);
    assert(GLOSSARY[LANG] && Object.keys(GLOSSARY[LANG]).length > 80, `glossary.json has a ${LANG} term list (${Object.keys(GLOSSARY[LANG] || {}).length} terms)`);
    const off = [];
    Object.entries(cfg.terms || {}).forEach(([e, u]) => enKeys.filter((k) => en[k] === e).forEach((k) => pack[k] && !String(pack[k]).includes(u) && off.push(k + '=' + pack[k])));
    assert(off.length <= 8, `exact UI labels follow the ${LANG} term list (${off.length} off${off.length ? ': ' + off.slice(0, 4).join(', ') : ''})`);
  }

  console.log(`\nSearch (Khoj intents: ${cfg.name} + romanised)`);
  {
    const src = read('public/src/js/core/chaupaal-intents-manifest.js') + read('public/src/js/dangal/dangal-assist.js');
    const hiLists = (src.match(/\bhi\s*:\s*\[\s*['"]/g) || []).length;
    const re = new RegExp('\\b' + LANG + '\\s*:\\s*\\[\\s*[\'"]', 'g');
    const own = (src.match(re) || []).length;
    assert(own >= hiLists && own > 0, `every keyword list that has hi also has ${LANG} (${own} ${LANG} / ${hiLists} hi)`);
    const text = (src.match(new RegExp('\\b' + LANG + '\\s*:\\s*\\[[^\\]]*\\]', 'g')) || []).join(' ');
    (cfg.searchNative || []).forEach((w) => assert(text.includes(w), `${cfg.name} keyword “${w}”`));
    (cfg.searchLatin || []).forEach((w) => assert(new RegExp('[\'"]' + w).test(text), `romanised keyword “${w}”`));
  }

  console.log('\nDangal content');
  {
    global.window = global;
    const CL = require('../../public/src/js/dangal/content-locales.js');
    ['imposter.packs', 'charades.packs', 'mostlikely.prompts', 'rajamantri.roles', 'scribble.words'].forEach((id) => assert(CL.available(id, LANG), `manifest: ${id} available in ${LANG}`));
    assert(!CL.available('shabd.lexicon', LANG) && !CL.modeAvailable('wordguess', 'daily', LANG), `Shabd Five: no ${LANG} lexicon → the Daily stays hidden (not faked)`);
    ['werewolf.narration', 'streetcricket.commentary', 'badminton.umpire', 'tambola.caller', 'uno.shouts', 'chess.openings', 'rules', 'faq', 'tips'].forEach((id) => {
      const ks = enKeys.filter((k) => CL.SETS[id].keys.some((p) => k.startsWith(p)));
      const have = ks.filter((k) => k in pack).length;
      assert(ks.length && have / ks.length >= CL.KEY_COVERAGE, `${id}: ${have}/${ks.length} keys in ${LANG}`);
    });
    const files = ['imposter', 'charades', 'mostlikely', 'rajamantri'].map((g) => `public/src/js/data/locales/${LANG}/` + (g === 'rajamantri' ? `rajamantri.${LANG}.js` : `${g}-packs.${LANG}.js`));
    assert(files.every((f) => fs.existsSync(path.join(ROOT, f))), `${cfg.name} overlays for Imposter, Charades, Most Likely To, Raja Mantri Chor Sipahi`);
    const html = read('public/index.html');
    assert(files.every((f) => html.indexOf('data-party-lazy src="/' + f.replace(/^public\//, '')) > 0), 'overlays are lazy-loaded from index.html');
    const Words = require('../../server-lib/scribble-words.js');
    assert(Words.coreCount(LANG) >= 600 && Words.languages().includes(LANG), `Scribble: ${Words.coreCount(LANG)} ${cfg.name} core words (≥600)`);
    const pool = Words.wordsFor(['everyday', 'animals'], LANG);
    assert(pool.easy.length && pool.easy.every((w) => SCRIPT.test(w.split('|')[0])), `Scribble: a ${cfg.name} room is dealt ${cfg.name} words`);
    const SC = require('../../public/src/js/games/scribble-core.js');
    const w = pool.easy[0];
    const roman = w.split('|')[1];
    assert(SC.isCorrect(w.split('|')[0], w) && (!roman || SC.isCorrect(roman, w)), 'Scribble: native-script and romanised guesses both count');
    const QL = require('../../server-lib/quiz-locales.js');
    assert(QL.coverage(LANG) >= QL.CORE_MIN && QL.available(LANG), `Quiz: ${QL.coverage(LANG)} core questions in ${cfg.name} (≥${QL.CORE_MIN})`);
  }

  console.log('\nStore + web');
  {
    const L = JSON.parse(read(`store/listings/${LANG}/listing.json`));
    assert(L.translated === true && SCRIPT.test(L.apple.description) && SCRIPT.test(L.google.shortDescription), 'store listing translated');
    const sv = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'store-validate.js')], { encoding: 'utf8' });
    assert(sv.status === 0, 'store listing lengths within limits: ' + String(sv.stdout).trim().split('\n').pop());
    const M = JSON.parse(read(`public/manifests/manifest.${LANG}.json`));
    assert(SCRIPT.test(M.description) && M.lang === LANG && (M.dir || 'ltr') === (cfg.dir || 'ltr'), `PWA manifest localised (lang ${LANG}, dir ${cfg.dir || 'ltr'})`);
    const og = require('../../server-lib/og-preview.js');
    assert(SCRIPT.test(og.genericCard('https://chaupaal.app', '/', LANG).description), `OG / meta description in ${LANG}`);
  }

  console.log('\nServer templates');
  {
    const S = require('../../server-lib/i18n-server.js');
    ['notifications.push.moderation_action', 'moderation.sor_redress', 'notifications.bundle_follow'].forEach((k) => {
      if (!S.hasKey(k)) return;
      const out = S.serverT(LANG, k, { actor: 'Asha', name: 'Asha' });
      assert(SCRIPT.test(out), `serverT(${LANG}, ${k}) → ${out.slice(0, 40)}`);
    });
    const pushKeys = enKeys.filter((k) => k.startsWith('notifications.'));
    assert(pushKeys.every((k) => SCRIPT.test(String(pack[k] || '')) || nonLanguage(en[k])), `push / in-app templates in ${LANG} (${pushKeys.length})`);
  }

  if (cfg.extra) {
    console.log(`\n${cfg.name}-specific`);
    const { loadI18n } = require('./i18n-runtime');
    /** ChaupaalFormat for a UI language + Region (same runtime the app loads). */
    const fmtFor = (lang, country) =>
      loadI18n({ storage: { chaupaal_lang: lang, chaupaal_region: JSON.stringify({ country, source: 'user' }) }, languages: [lang] }).ChaupaalFormat;
    await cfg.extra({ assert, en, pack, enKeys, read, ROOT, fmtFor });
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  return failed;
}

function main(cfg) {
  runLangPass(cfg)
    .then((failed) => process.exit(failed ? 1 : 0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

module.exports = { runLangPass, main, nonLanguage };
