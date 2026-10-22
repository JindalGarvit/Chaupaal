#!/usr/bin/env node
/**
 * Global L5 — string extraction: Dangal (25 games) + content localisation manifest.
 *   lint       zero hard-coded strings in every L5 file (scripts/i18n-surfaces.json → l5)
 *   keys       every tr()/t()/gtx() key exists (tr prefix-aware); placeholders match; counts are ICU plurals
 *   rules      every game's rules declaration resolves from games.<id>.rules.* keys; no "official"
 *   content    no inline Devanagari in default content; Hindi lives in data/locales/hi/*.hi.js
 *   manifest   dangal/content-locales.js covers every content set and every game, and drives availability
 *   modes      Shabd Five daily hidden where there is no lexicon; Quiz "Questions in" honest; Tambola en-only calls
 *   room       room content language drives guess checking (Imposter steal, Charades, Scribble) + Party Hub
 *   speech     TTS tags per language (getTtsLang) at every Dangal voice
 *   pseudo     en-XA transforms every L5 key; ar-XB mirrors chrome, boards stay LTR, names isolated
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const acorn = require('acorn');
const walk = require('acorn-walk');
const { loadI18n } = require('./lib/i18n-runtime');
const { lintSurface } = require('./i18n-lint');
const { coverage } = require('./i18n-coverage');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const L5 = Object.keys(require('./i18n-surfaces.json').l5).filter((f) => fs.existsSync(path.join(ROOT, f)));
const ROSTER = ['tiptap', 'brickbreaker', 'ankjod', 'wordguess', 'chess', 'ttt', 'snakes', 'ludo', 'uno', 'scribble', 'quiz', 'carrom', 'rummy', 'teenpatti', 'bluff', 'tambola', 'streetcricket', 'badminton', 'imposter', 'rajamantri', 'charades', 'mostlikely', 'werewolf', 'penalty', 'poker'];
const DEVANAGARI = /[\u0900-\u097F]/;

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

/** i18n runtime + browser files in one VM (UMD modules attach to its global). */
function viewer(files) {
  const rt = loadI18n({ region: false });
  (files || []).forEach((f) => vm.runInContext(read(f), rt, { filename: f }));
  return rt;
}

const lit = (n) => (n && n.type === 'Literal' && typeof n.value === 'string' ? n.value : n && n.type === 'TemplateLiteral' && !n.expressions.length ? n.quasis[0].value.cooked : null);

/** Every keyed call in a file: { key, params: [names] | null, line } (tr resolved through its prefix). */
function keyedCalls(rel) {
  const src = read(rel);
  const m = src.match(/t\('([\w.]+)\.' \+ key, p \|\| fallback\)/);
  const trPre = m ? m[1] + '.' : null;
  const out = [];
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true, allowHashBang: true });
  walk.simple(ast, {
    CallExpression(c) {
      if (c.callee.type !== 'Identifier') return;
      const fn = c.callee.name;
      const k = lit(c.arguments[0]);
      if (k == null || !/^[\w.]+$/.test(k)) return;
      let key;
      let pi;
      if (fn === 'tr' && trPre) {
        key = trPre + k;
        pi = 2;
      } else if (fn === 'gtx' || fn === 'locText') {
        key = k;
        pi = 2;
      } else if (fn === 't' || fn === 'tHtml' || fn === 'tEn') {
        key = k;
        pi = 1;
      } else if (fn === 'tn') {
        key = k;
        pi = 2;
      } else return;
      if (!/^(games|dangal|common)\./.test(key)) return;
      const p = c.arguments[pi];
      const params = p && p.type === 'ObjectExpression' && !p.properties.some((x) => x.type === 'SpreadElement') ? p.properties.map((x) => (x.key.type === 'Identifier' ? x.key.name : x.key.value)) : null;
      out.push({ key, params, line: src.slice(0, c.start).split('\n').length, fn });
    },
  });
  return out;
}

const placeholders = (s) => {
  const set = new Set();
  String(s || '').replace(/\{\{(\w+)\}\}/g, (m, k) => set.add(k));
  String(s || '').replace(/\{(\w+), (plural|selectordinal|select),/g, (m, k) => set.add(k));
  return set;
};

(async () => {
  const rt = loadI18n({ region: false });
  const en = rt.CHAUPAAL_I18N_EN;
  const exists = (k) => en[k] != null;

  console.log('\nLint (L5 files)');
  {
    const res = lintSurface('l5');
    assert(L5.length >= 90, `L5 surface covers ${L5.length} files`);
    assert(res.hits.length === 0, `zero hard-coded strings in L5 files (${res.hits.length})` + (res.hits.length ? ': ' + res.hits.slice(0, 5).map((h) => `${h.file}:${h.line} ${h.text}`).join(' | ') : ''));
    const ignores = L5.reduce((n, f) => n + (read(f).match(/i18n-ignore/g) || []).length, 0);
    assert(ignores <= 90, `i18n-ignore allowlist stays bounded (${ignores}: codes, CSS classes, PGN tags, en-only traditional calls)`);
    const tpl = require('./lib/i18n-template-scan').scan(L5.map((f) => path.join(ROOT, f)));
    assert(tpl.length === 0, `no copy hiding beside markup in templates (${tpl.length})` + (tpl.length ? ': ' + tpl.slice(0, 4).join(' | ') : ''));
    const enOnly = L5.filter((f) => /i18n-en-only/.test(read(f)));
    assert(enOnly.length === 1 && /tambola-core/.test(enOnly[0]), 'only the traditional Tambola calls are marked en-only');
  }

  console.log('\nKeys, placeholders, plurals');
  const allCalls = [];
  {
    const missing = [];
    const parity = [];
    L5.forEach((rel) =>
      keyedCalls(rel).forEach((c) => {
        allCalls.push(c);
        if (!exists(c.key)) return missing.push(`${rel}:${c.line} ${c.key}`);
        if (!c.params) return;
        const need = [...placeholders(en[c.key])];
        const lost = need.filter((p) => c.params.indexOf(p) < 0);
        if (lost.length) parity.push(`${rel}:${c.line} ${c.key} needs ${lost.join(',')}`);
      })
    );
    assert(missing.length === 0, `every key used in L5 files exists (${allCalls.length} calls; missing ${missing.length})` + (missing.length ? ': ' + missing.slice(0, 6).join(', ') : ''));
    assert(parity.length === 0, `every placeholder in the English template is passed by its call (${parity.length})` + (parity.length ? ': ' + parity.slice(0, 5).join(' | ') : ''));

    const counts = {};
    ROSTER.forEach((g) => (counts[g] = Object.keys(en).filter((k) => k.startsWith('games.' + g + '.')).length));
    const dangalKeys = Object.keys(en).filter((k) => k.startsWith('dangal.')).length;
    console.log('    keys per game: ' + ROSTER.map((g) => `${g}=${counts[g]}`).join(' · ') + ` · dangal.*=${dangalKeys}`);
    assert(ROSTER.every((g) => counts[g] >= 20), 'every one of the 25 games has its own games.<id>.* namespace (≥20 keys)');

    const icu = Object.keys(en).filter((k) => /^(games|dangal)\./.test(k) && /\{\w+, (plural|selectordinal),/.test(en[k]));
    assert(icu.length >= 60, `counts are ICU plurals (${icu.length} plural/ordinal messages in games.* / dangal.*)`);
    assert(rt.t('games.scribble.hints', { hints: 1 }) === '1 hint' && rt.t('games.scribble.hints', { hints: 3 }) === '3 hints', 'Scribble: 1 hint / 3 hints');
    const ord = [1, 2, 3, 4, 11, 22].map((n) => rt.t('dangal.classics.place_ordinal', { n }));
    assert(ord.join(' ') === '1st 2nd 3rd 4th 11th 22nd', `ordinals via selectordinal (${ord.join(' ')})`);
    assert(rt.t('games.ankjod.daily_streak_days_best', { st: 1, best: 4 }) === 'Daily streak: 1 day · best 4', 'Kakuro streak: "1 day" (was day/days in code)');
    const glued = L5.filter((f) => /=== ?1 \? (tr|t)\('([\w]+\.)*(bots?|players?|days?|rounds?|hints?|games?|cards?)'/.test(read(f)) || /-day play streak`/.test(read(f)) || /n \+ tr\('place\.th'/.test(read(f)));
    assert(glued.length === 0, `no hand-made plurals left (${glued.join(', ')})`);
    const wereWas = read('public/src/js/games/werewolf-core.js');
    assert(!/was: many \? 'were' : 'was'/.test(wereWas) && exists('games.werewolf.werewolf.line.takenMany'), 'Werewolf narration: no English grammar injected (taken / takenMany lines)');

    const cov = coverage();
    ['hi', 'ta'].forEach((code) => {
      const l = cov.langs[code];
      const inL5 = (k) => /^(games|dangal)\./.test(k);
      assert(l.placeholderMismatches.filter(inL5).length === 0, `${code}: placeholders match English in games.* / dangal.*`);
      assert(l.pluralGaps.filter(inL5).length === 0, `${code}: plural categories complete in games.* / dangal.*`);
      const keys = Object.keys(en).filter(inL5);
      const pack = JSON.parse(read(`public/src/i18n/${code}.json`));
      const n = keys.filter((k) => k in pack).length;
      console.log(`    ${code}: ${n}/${keys.length} Dangal keys translated (${Math.round((n / keys.length) * 1000) / 10}%)`);
    });
  }

  console.log('\nRules declarations (all 25)');
  {
    const v = viewer(['public/src/js/dangal/dangal-rules.js']);
    const Rules = v.DangalRules;
    const bad = [];
    ROSTER.forEach((id) => {
      const g = Rules.get(id);
      if (!g) return bad.push(id + ': no rules');
      const k = (p) => 'games.' + id + '.rules.' + p;
      g.glance.forEach((l, i) => (!exists(k('glance.' + (i + 1))) || l !== rt.t(k('glance.' + (i + 1)))) && bad.push(id + ' glance.' + (i + 1)));
      g.rules.forEach((r, i) => {
        if (!exists(k('rules.' + (i + 1) + '.h')) || !exists(k('rules.' + (i + 1) + '.body'))) bad.push(id + ' rules.' + (i + 1));
      });
      if (!exists(k('ruleset.source'))) bad.push(id + ' ruleset.source');
      if (/\bofficial\b/i.test(JSON.stringify(g))) bad.push(id + ' says "official"');
    });
    assert(bad.length === 0, `rules (glance, sections, source) resolve from games.<id>.rules.* for all 25 (${bad.slice(0, 6).join(', ')})`);
    const hi = viewer(['public/src/js/dangal/dangal-rules.js']);
    hi.registerI18nLocale('hi', { 'games.chess.rules.rules.1.h': 'Chaal', 'games.chess.rules.glance.1': 'Pehla vaakya' });
    await hi.setAppLanguage('hi');
    hi.currentLang = 'hi';
    const hc = hi.DangalRules.get('chess');
    assert(hc.rules[0].h === 'Chaal' && hc.glance[0] === 'Pehla vaakya', 'a translated rule heading / glance line shows in the Rules sheet');
    const src = read('public/src/js/dangal/dangal-rules.js');
    assert(/const GAMES = \/\* i18n-catalog: games\.\{id\}\.rules \*\//.test(src), 'rules table is an English catalog read through gtx');
  }

  console.log('\nNo inline Hindi in default content');
  {
    const content = ['public/src/js/data/imposter-packs.js', 'public/src/js/data/charades-packs.js', 'public/src/js/data/mostlikely-packs.js'].concat(L5.filter((f) => !/mostlikely-core\.js$/.test(f)));
    const withHi = content.filter((f) => DEVANAGARI.test(read(f)));
    assert(withHi.length === 0, `no Devanagari in default content / Dangal files (${withHi.join(', ')})`);
    const ml = read('public/src/js/games/mostlikely-core.js').split('\n').filter((l) => DEVANAGARI.test(l));
    assert(ml.every((l) => /\bhi: \/|^\s*\/\//.test(l)), `mostlikely-core: Devanagari only in the Hindi safety lexicon (${ml.length} lines)`);
    const overlays = ['imposter-packs', 'charades-packs', 'mostlikely-packs', 'rajamantri'].map((n) => `public/src/js/data/locales/hi/${n}.hi.js`);
    assert(overlays.every((f) => fs.existsSync(path.join(ROOT, f)) && DEVANAGARI.test(read(f))), 'Hindi content lives in data/locales/hi/*.hi.js');
    const Imp = require('../public/src/js/data/imposter-packs.js');
    const RM = require('../public/src/js/games/rajamantri-core.js');
    const ML = require('../public/src/js/data/mostlikely-packs.js');
    assert(Imp.PACKS.some((p) => p.words.some((w) => DEVANAGARI.test(w[1] || ''))) && DEVANAGARI.test(RM.ROLES.raja.hi) && DEVANAGARI.test(ML.uiText('hi', 'toggle')), 'server (Node) applies the hi overlays: packs, RMCS roles, Most Likely toggle');
    const v = viewer(['public/src/js/data/imposter-packs.js', 'public/src/js/games/party-core.js', 'public/src/js/games/rajamantri-core.js']);
    assert(!DEVANAGARI.test(v.RajaMantriCore.ROLES.raja.hi || '') && !v.IMPOSTER_PACKS.PACKS.some((p) => p.words.some((w) => DEVANAGARI.test(w[1] || ''))), 'browser: no Hindi until the overlay loads');
    vm.runInContext(read('public/src/js/data/locales/hi/rajamantri.hi.js'), v);
    vm.runInContext(read('public/src/js/data/locales/hi/imposter-packs.hi.js'), v);
    assert(DEVANAGARI.test(v.RajaMantriCore.ROLES.raja.hi) && v.IMPOSTER_PACKS.PACKS.some((p) => p.words.some((w) => DEVANAGARI.test(w[1] || ''))), 'browser: loading the hi overlay applies it (applyLocale)');
    const q = viewer([]);
    vm.runInContext(read('public/src/js/data/locales/hi/charades-packs.hi.js'), q);
    assert(Array.isArray(q.__dangalPendingLocales) && q.__dangalPendingLocales[0].target === 'CHARADES_PACKS', 'an overlay that arrives before its pack is queued');
    vm.runInContext(read('public/src/js/data/charades-packs.js') + '\n' + read('public/src/js/dangal/content-locales.js'), q);
    q.DangalContentLocales.drain();
    assert(!q.__dangalPendingLocales.length && q.CHARADES_PACKS.PACKS.some((p) => p.titles.some((t) => DEVANAGARI.test(t.hi || ''))), '…and drained into the pack once it loads');
  }

  console.log('\nContent localisation manifest');
  const CL = require('../public/src/js/dangal/content-locales.js');
  {
    assert(JSON.stringify(CL.GAMES.slice().sort()) === JSON.stringify(ROSTER.slice().sort()), 'manifest lists all 25 games');
    const STRATS = ['translate', 'language-specific', 'canonical-subset', 'en-only'];
    const sets = Object.keys(CL.SETS);
    assert(sets.every((id) => STRATS.indexOf(CL.SETS[id].strategy) >= 0 && CL.SETS[id].games.length && CL.SETS[id].note), `${sets.length} content sets, each with a strategy, games and a note`);
    assert(ROSTER.every((g) => CL.setsFor(g).length >= 3), 'every game has rules + FAQ + tips sets (and its own content sets)');
    const need = ['imposter.packs', 'charades.packs', 'mostlikely.prompts', 'werewolf.narration', 'rajamantri.roles', 'scribble.words', 'streetcricket.commentary', 'badminton.umpire', 'tambola.caller', 'uno.shouts', 'tips', 'faq', 'rules', 'shabd.lexicon', 'scribble.regional', 'imposter.regional', 'quiz.bank', 'tambola.traditional'];
    assert(need.every((id) => sets.indexOf(id) >= 0), 'translate / language-specific / subset / en-only sets from the L5 brief are all declared');
    const files = sets.reduce((a, id) => a.concat(Object.values(CL.SETS[id].files || {}).reduce((b, f) => b.concat(f), [])), []);
    assert(files.length >= 4 && files.every((f) => fs.existsSync(path.join(ROOT, 'public/src/js', f))), `every overlay file the manifest names exists (${files.length})`);
    assert(fs.existsSync(path.join(ROOT, CL.SETS['quiz.bank'].server)), 'quiz subset plan lives in server-lib/quiz-locales.js');
    const idx = read('public/index.html');
    assert(idx.indexOf('dangal/content-locales.js') > 0 && idx.indexOf('dangal/content-locales.js') < idx.indexOf('games/party-kit.js'), 'content-locales.js loads before party-kit.js');
    assert(files.every((f) => idx.indexOf('data-party-lazy src="/src/js/' + f) > 0), 'overlays are lazy tags (bust-assets stamps them)');
    assert(CL.overlaysFor('imposter', 'hi').length === 1 && CL.overlaysFor('imposter', 'fr').length === 0 && CL.overlaysFor(CL.PARTY_WORD_GAMES, ['hi']).length === 2, 'overlays requested only for languages that have them');
    assert(CL.available('imposter.packs', 'hi') && !CL.available('imposter.packs', 'fr') && CL.available('imposter.packs', 'en-XA'), 'availability: hi yes, fr no, pseudo-locales read English');
    const st = CL.status('charades', 'fr');
    assert(!st.full && st.english.indexOf('charades.packs') >= 0 && CL.status('charades', 'en').full, 'status: French Charades honestly reports English titles');
    assert(/data-content-note/.test(read('public/src/js/games/party-kit.js')) && exists('dangal.content.in_english') && exists('dangal.content.room_language'), 'lobby shows a small availability note + the room language row');
    assert(/contentLang: uiContentLang\(\)/.test(read('public/src/js/games/party-kit.js')), 'new rooms default the content language to the host UI language');
  }

  console.log('\nModes follow the manifest');
  {
    assert(CL.modeAvailable('wordguess', 'daily', 'en') && CL.modeAvailable('wordguess', 'daily', 'hi') && !CL.modeAvailable('wordguess', 'daily', 'fr') && !CL.modeAvailable('wordguess', 'daily', 'ja'), 'Shabd Five daily: shown in en / hi, hidden in fr / ja');
    const sh = read('public/src/js/games/shabd-ui.js');
    assert((sh.match(/dailyOk\(\)/g) || []).length >= 4 && /!dailyOk\(\) \? 'practice' : wanted/.test(sh), 'Shabd UI: daily entry points hidden; daily falls back to practice with a note');
    const sv = viewer(['public/src/js/dangal/content-locales.js']);
    sv.currentLang = 'fr';
    vm.runInContext(read('public/src/js/dangal/dangal-rules.js') + '\n' + read('public/src/js/dangal/dangal-assist.js'), sv);
    const recFr = sv.DangalAssist.recommend ? sv.DangalAssist.recommend({ players: 1, where: 'here' }) : null;
    const shabdFr = recFr && (recFr.list || recFr).find && (recFr.list || recFr).find((r) => r.id === 'wordguess');
    assert(!shabdFr || !(shabdFr.reasons || []).some((r) => /daily/i.test(r)), 'recommender does not promise a Shabd daily in French');
    const QL = require('../server-lib/quiz-locales.js');
    const core = QL.coreSubset();
    const Bank = require('../server-lib/quiz-bank.js');
    const cats = new Set(core.map((id) => Bank.byId(id).category));
    assert(core.length >= 500 && cats.size >= 12, `Quiz core subset: ${core.length} questions across ${cats.size} categories`);
    assert(QL.available('en') && !QL.available('fr') && QL.localise(Bank.byId(core[0]), 'fr').lang === 'en', 'Quiz: languages without a pass fall back to English per question');
    QL.REGISTRY.zz = () => ({ v: 1, lang: 'zz', items: Object.fromEntries(core.map((id) => [id, { prompt: 'Q-' + id, options: ['a', 'b', 'c', 'd'] }])) });
    assert(QL.available('zz') && QL.localise(Bank.byId(core[0]), 'zz').prompt === 'Q-' + core[0] && QL.dailyPool(core.map((id) => Bank.byId(id)).concat([{ id: 'x' }])).every((q) => q.id !== 'x'), 'a finished language pass: questions localise and the Daily draws from the translated subset');
    delete QL.REGISTRY.zz;
    const svc = read('server-lib/quiz-service.js');
    assert(/dailyPublic\(day, ids, att\.qn, qLang\(body\)\)/.test(svc) && /Locales\.localise\(q, qLang\(body\)\)/.test(svc) && /questionLangs:/.test(svc), 'quiz service: Daily + Practice serve the question language; home lists languages');
    const qui = read('public/src/js/games/quiz-ui.js');
    assert(/lang: questionLang\(\)/.test(qui) && /games\.quiz\.questions_in/.test(qui) && /questionLangNote\(\)/.test(qui), 'Quiz UI: "Questions in" + honest English note');
    assert(CL.flavourVisible('tambola.traditional', 'en') && !CL.flavourVisible('tambola.traditional', 'hi') && !CL.flavourVisible('tambola.traditional', 'fr'), 'traditional Tambola calls: English only');
    const tb = read('public/src/js/games/tambola-ui.js');
    assert(/\$\{tradAvailable\(\) \? `<div class="cl-sub">/.test(tb) && /tradOn\(\)/.test(tb), 'Tambola: the traditional-calls toggle is hidden outside English');
  }

  console.log('\nRoom content language drives guess checking');
  {
    const PC = require('../public/src/js/games/party-core.js');
    const Imp = require('../public/src/js/games/imposter-core.js');
    const Ch = require('../public/src/js/games/charades-core.js');
    const Sc = require('../public/src/js/games/scribble-core.js');
    const word = { en: 'Mango', hi: 'आम', alts: [] };
    assert(Imp.matchGuess('आम', word, 'hi') && !Imp.matchGuess('आम', word, 'en') && Imp.matchGuess('mangoes', word, 'hi') && Imp.matchGuess('MANGO', word, 'fr'), 'Imposter steal: room language label + English; other labels rejected');
    assert(Imp.matchGuess('आम', word), 'older rooms (no content language) keep accepting every label');
    const t = require('../public/src/js/data/charades-packs.js').PACKS.find((p) => p.titles.some((x) => x.hi)).titles.find((x) => x.hi);
    assert(Ch.matchTitle(t.hi, t.key, 'hi') && !Ch.matchTitle(t.hi, t.key, 'en') && Ch.matchTitle(t.en, t.key, 'hi'), 'Charades typed guess: Hindi room accepts Hindi + English; English room English only');
    assert(Imp.mergeSettings({ contentLang: 'hi-IN' }).contentLang === 'hi' && Ch.mergeSettings({ contentLang: 'hi' }).contentLang === 'hi' && Sc.mergeSettings({ contentLang: 'hi' }).contentLang === 'hi', 'room settings keep the content language (normalised code)');
    assert(Sc.normGuess('Café') === Sc.normGuess('cafe') && Sc.normGuess('आम') === 'आम' && Sc.normGuess('ＣＡＴ') === 'cat', 'Scribble: L4 fold, accents forgiven, every script kept (was a-z only)');
    assert(PC.normalize('Ｓholay!') === 'sholay' && PC.fuzzyMatch('தமிழ்', ['தமிழ்']), 'party-core normalisation: full-width + non-Latin scripts');
    const Hub = require('../server-lib/party-hub.js');
    assert(Hub.mergeSettings({ pickBy: 'vote', contentLang: 'hi' }).contentLang === 'hi', 'Party Hub keeps the party content language');
    const hubSrc = read('server-lib/party-hub.js');
    assert(/contentLang: pub\.settings\.contentLang/.test(hubSrc) && /seatedRoom\(plan, uid, Object\.assign\(plan\.contentLang \? \{ contentLang: plan\.contentLang \}/.test(hubSrc), 'each game seated from the hub inherits it');
    const room = Hub.seatedRoom({ game: 'charades', seq: 1, seated: ['h', 'p'], players: [{ id: 'h', name: 'Host' }, { id: 'p', name: 'Priya' }], presence: {} }, 'h', { contentLang: 'hi' }, 'ABCD', Date.now());
    const rs = room && room.pub && Ch.mergeSettings(room.pub.settings);
    assert(rs && rs.contentLang === 'hi', 'mixed en/hi Party Hub: the seated Charades room is Hindi content');
    assert(CL.roomLang({ contentLang: 'hi' }, 'en') === 'hi' && CL.roomLang({}, 'fr-FR') === 'fr', 'room language = setting, else the host / device language');
  }

  console.log('\nSpeech (TTS tags)');
  {
    assert(rt.LANG_CATALOG.every((l) => rt.getTtsLang(l.code) === l.tts), 'getTtsLang returns each language’s TTS tag');
    const voices = ['public/src/js/games/court-sports.js', 'public/src/js/games/cricket-scene.js', 'public/src/js/games/werewolf.js', 'public/src/js/games/tambola-ui.js'];
    assert(voices.every((f) => /getTtsLang\(/.test(read(f)) && !/u\.lang = 'en'/.test(read(f))), 'umpire, commentary, narrator and caller voices use getTtsLang');
  }

  console.log('\nPseudo en-XA + ar-XB');
  {
    const r = loadI18n({ region: false });
    r.setPseudoLocale('en-XA');
    const keys = [...new Set(allCalls.map((c) => c.key).filter(exists))];
    const plain = keys.filter((k) => {
      const s = r.t(k, { count: 2, n: 2, hints: 2, rounds: 2, players: 2 });
      return !(s.startsWith('[') && s.endsWith(']'));
    });
    assert(keys.length > 2000 && plain.length === 0, `en-XA transforms every L5 key (${keys.length}; untransformed: ${plain.slice(0, 5).join(', ')})`);
    const css = read('public/src/styles/i18n.css');
    const boards = ['canvas', '.chess-board', '.ludo-board', '.sl-board', '.cr-board', '.sc-canvas', '.tb-ticket', '.kk-grid', '.sf-grid'];
    assert(boards.every((b) => css.indexOf(b) > 0) && /\[dir="rtl"\] :is\(canvas,[\s\S]*?\) \{\s*direction: ltr;/.test(css), 'ar-XB: boards, canvases and hands stay LTR');
    assert(!/\.pk-modes|\.pk-lobby|\.pk-sheet/.test(css.slice(css.indexOf('[dir="rtl"] :is(canvas'), css.indexOf('direction: ltr'))), 'ar-XB: game chrome (modes, lobby, sheets) mirrors');
    assert(/\.pk-btn, \.pk-mode, \.pk-mode-title/.test(css), 'game chrome wraps long labels (+40% text, 360px)');
    const v = loadI18n({ region: false });
    v.setPseudoLocale('ar-XB');
    await v.setAppLanguage('en');
    assert(v.isRtl() && v.t('games.poker.name_folds', { name: v.bidi('نور') }).includes('\u2068نور\u2069'), 'ar-XB: player names isolated in game lines');
    const iso = ['poker.js', 'ludo-ui.js', 'ohno-ui.js', 'scribble-ui.js', 'rw-sports.js', 'court-sports.js', 'penalty.js', 'werewolf.js'].filter((f) => /function isolateNames\(/.test(read('public/src/js/games/' + f)));
    assert(iso.length === 8, `game tr() helpers isolate {{name}} params (${iso.length}/8)`);
  }

  console.log('\nGuards');
  {
    const apis = fs.readdirSync(path.join(ROOT, 'api')).filter((f) => f.endsWith('.js'));
    assert(apis.length === 12, `api/*.js === 12 (got ${apis.length})`);
    const glossary = rt.I18N_GLOSSARY;
    ['rajamantri', 'teenpatti', 'carrom', 'tambola', 'kakuro', 'shabdfive', 'ohno', 'tiptap', 'muqabala'].forEach((g) => assert(glossary[g], `game-name glossary: {{@${g}}} = ${glossary[g]}`));
    assert(!glossary.ludo && exists('dangal.identity.ludo.label'), 'Ludo is a translatable generic title');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
