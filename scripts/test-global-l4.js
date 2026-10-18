#!/usr/bin/env node
/**
 * Global L4 — string extraction: Duniya, Akhbaar, Peepal, Khoj, Vriksha, discovery, Premium.
 *   lint       zero hard-coded strings in every L4 file (scripts/i18n-surfaces.json → l4)
 *   keys       every t()-family key exists; placeholders + plurals intact in hi / ta
 *   taxonomy   categories / intents / industries stored as English codes, shown as translated labels
 *   intents    keyword lists are per-language ({ en: [...], hi: [], … }); matching reads UI + en + "Languages I read"
 *   search     normalisation (case, diacritics, NFC/NFKC, full-width, kana) + Latin-script Hindi/Urdu
 *   ai         UI-text calls carry lang, wrong-language answers fall back to English, caches keyed by lang
 *   premium    prices through the L1 currency helper
 *   pseudo     en-XA transforms every L4 key; ar-XB isolates names
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const acorn = require('acorn');
const { loadI18n } = require('./lib/i18n-runtime');
const { lintSurface, isCopy } = require('./i18n-lint');
const { classify } = require('./lib/i18n-ast');
const { coverage } = require('./i18n-coverage');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const L4 = Object.keys(require('./i18n-surfaces.json').l4).filter((f) => fs.existsSync(path.join(ROOT, f)));
const L4_NS = ['duniya', 'akhbaar', 'peepal', 'khoj', 'vriksha', 'discovery', 'premium'];
const HI_TEST = {
  'akhbaar.cat.sports': 'Khel',
  'akhbaar.tag_sample': '{{category}} · Namoona',
  'discovery.why.same_city': 'Ek hi shehar',
  'khoj.intent_open_surface': '{{name}} kholein',
};

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

function viewer(lang, files, extra) {
  const rt = loadI18n({ region: false });
  if (lang === 'hi') rt.registerI18nLocale('hi', HI_TEST);
  Object.assign(rt, extra || {});
  (files || []).forEach((f) => vm.runInContext(read(f), rt, { filename: f }));
  return rt;
}

/** Lift top-level functions / consts out of a browser file (they run in the viewer VM unchanged). */
function lift(rt, file, names) {
  const src = read(file);
  const ast = acorn.parse(src, { ecmaVersion: 'latest' });
  const parts = names.map((name) => {
    const node = ast.body.find(
      (n) => (n.type === 'FunctionDeclaration' && n.id.name === name) || (n.type === 'VariableDeclaration' && n.declarations.some((d) => d.id.name === name))
    );
    if (!node) throw new Error(`${file}: ${name} not found`);
    return src.slice(node.start, node.end);
  });
  vm.runInContext(parts.join('\n'), rt, { filename: file + '#lift' });
}

const strip = (html) => String(html).replace(/<[^>]+>/g, '').replace(/[\u2068\u2069]/g, '').replace(/\s+/g, ' ').trim();

(async () => {
  const rt = loadI18n({ region: false });
  const en = rt.CHAUPAAL_I18N_EN;
  const exists = (k) => !!rt.i18nLookup(k, 'en');

  console.log('\nLint (L4 files)');
  {
    const res = lintSurface('l4');
    assert(L4.length >= 29, `L4 surface covers ${L4.length} files`);
    assert(res.hits.length === 0, `zero hard-coded strings in L4 files (${res.hits.length})` + (res.hits.length ? ': ' + res.hits.slice(0, 5).map((h) => `${h.file}:${h.line} ${h.text}`).join(' | ') : ''));
    const ignores = L4.reduce((n, f) => n + (read(f).match(/i18n-ignore/g) || []).length, 0);
    assert(ignores <= 12, `i18n-ignore allowlist stays small (${ignores}: model input, canvas font, brand-name tuples, codes)`);
    assert(!/Wish \$\{friendName/.test(read('public/src/js/features/akhbaar.js')) && !/'👥 Personal'/.test(read('public/src/js/features/akhbaar.js')), 'Akhbaar tags + wish button come from the catalog');
    assert(!/NOTIFICATION_TEMPLATES/.test(read('public/src/js/features/categories.js')), 'per-language notification map replaced by catalog keys');
  }

  console.log('\nKeys + packs');
  {
    const missing = [];
    L4.forEach((rel) => {
      classify(read(rel), isCopy).calls.forEach((c) => {
        if (c.name === 'optionLabel' || c.name === 'optionLabelHtml') return;
        if (!/^[a-z][\w]*(\.[\w]+)+$/.test(c.key) && c.fallback) return;
        if (!exists(c.key)) missing.push(`${rel}:${c.line} ${c.key}`);
      });
    });
    assert(missing.length === 0, `every key used in L4 files exists (${missing.length})` + (missing.length ? ': ' + missing.slice(0, 6).join(', ') : ''));
    const counts = {};
    Object.keys(en).forEach((k) => {
      const ns = k.split('.')[0];
      if (L4_NS.includes(ns)) counts[ns] = (counts[ns] || 0) + 1;
    });
    console.log('    keys per namespace: ' + L4_NS.map((ns) => `${ns}=${counts[ns] || 0}`).join(' · '));
    assert(L4_NS.every((ns) => counts[ns] > 0), 'every L4 namespace has keys (incl. vriksha., premium.)');
    const cov = coverage();
    ['hi', 'ta'].forEach((code) => {
      const l = cov.langs[code];
      const inL4 = (k) => L4_NS.includes(k.split('.')[0]);
      assert(l.placeholderMismatches.filter(inL4).length === 0, `${code}: placeholders match English in L4 namespaces`);
      assert(l.pluralGaps.filter(inL4).length === 0, `${code}: plural categories complete in L4 namespaces`);
      const keys = Object.keys(en).filter(inL4);
      const pack = JSON.parse(read(`public/src/i18n/${code}.json`));
      const n = keys.filter((k) => k in pack).length;
      console.log(`    ${code}: ${n}/${keys.length} L4 keys translated (${Math.round((n / keys.length) * 1000) / 10}%)`);
      assert(n >= 30, `${code}: existing translations carried onto L4 keys (${n})`);
      assert(pack['peepal.notif_streak'] && /\{\{name\}\}/.test(pack['peepal.notif_streak']), `${code}: hand-written notification copy preserved as a translation`);
    });
    const plural = (k) => /\{count, plural,/.test(en[k] || '');
    ['duniya.likes_count', 'duniya.view_all_comments', 'duniya.live_count', 'duniya.tagged_count', 'discovery.top_matches', 'peepal.form_submitted_responses', 'akhbaar.share_meta_streak'].forEach((k) =>
      assert(plural(k), `${k} is an ICU plural`)
    );
    assert(rt.t('duniya.likes_count', { count: 1, shown: '1' }) === '1 like' && rt.t('duniya.likes_count', { count: 1200, shown: '1.2K' }) === '1.2K likes', 'likes: plural on the number, compact count shown');
    const glued = L4.filter((f) => /\$\{[\w.()]+\} (likes|comments|responses|matches)\b|' tagged'|`Top \$\{/.test(read(f)));
    assert(glued.length === 0, `no hand-glued counts left (${glued.join(', ')})`);
  }

  console.log('\nTaxonomy codes (stored) → labels (shown)');
  {
    const CODES = ['GK', 'Sports', 'Tech', 'Business', 'India', 'World', 'Cricket', 'Bollywood', 'Food & Recipes', 'Automobiles', 'Gadgets', 'Personal Finance', 'Gaming', 'Travel', 'Environment', 'Music', 'Football', 'Fitness', 'Fashion', 'Science', 'Entertainment', 'Education', 'Real Estate', 'Agriculture', 'Law & Justice', 'Art & Culture', 'Food', 'Movies', 'News'];
    const missing = CODES.filter((c) => !exists('akhbaar.cat.' + rt.optionCode(c)));
    assert(missing.length === 0, `every Akhbaar category code has a label key (${CODES.length}; missing: ${missing.join(', ')})`);
    const i18nSrc = read('public/src/js/core/i18n.js');
    assert(/CATEGORY_SUGGESTIONS = \/\* i18n-values: akhbaar\.cat \*\/ \[/.test(i18nSrc) && /\{emoji:'🏏',name:'Cricket'\}/.test(i18nSrc), 'suggestions keep English names (the stored code)');
    const hi = viewer('hi', [], {});
    await hi.setAppLanguage('hi');
    assert(hi.optionLabel('akhbaar.cat', 'Sports') === 'Khel' && hi.optionLabel('akhbaar.cat', 'My Garden Club') === 'My Garden Club', 'label translated; a user-typed category shows as typed');
    lift(hi, 'public/src/js/features/akhbaar.js', ['akhbaarEscAttr', 'akhbaarTagLabel']);
    assert(strip(hi.akhbaarTagLabel({ category: 'Sports' }, { sample: true })) === 'Khel · Namoona', 'Akhbaar tag reads in the viewer language');
    const ak = read('public/src/js/features/akhbaar.js');
    assert(/data-cat="\$\{akhbaarEscAttr\(data\.category\|\|'News'\)\}"/.test(ak), 'reel tag carries the stored code (data-cat)');
    assert(/tag\.dataset\.cat \? tag\.dataset\.cat === cat/.test(read('public/src/js/features/akhbaar-catbar.js')), 'category filter matches the code, not the (translated) label');
    assert(/optionLabelHtml\('akhbaar\.cat', cat\.name\)/.test(read('public/src/js/features/akhbaar-catbar.js')), 'category chips show labels');
    assert(/optionLabelHtml\('akhbaar\.cat', c\.name\)/.test(read('public/src/js/features/peepal.js')), 'Peepal onboarding chips show labels');
    const dc = read('public/src/js/core/discovery-core.js');
    assert(/PEEPAL_MATCH_INTENTS = \/\* i18n-values: intent \*\//.test(dc) && /optionLabelHtml\('intent', i\)/.test(dc), 'match intents: code stored, label shown');
    assert(/intentOverride: 'Friendship'/.test(dc) && /'Networking \/ Professional connections'; \/\/ i18n-ignore/.test(dc), 'intent codes sent to ranking stay English (never t())');
    ['language_exchange', 'job_hunt', 'travel_buddies'].forEach((c) => assert(exists('profile.opt.intent.' + c), `profile.opt.intent.${c}`));
    lift(hi, 'public/src/js/core/discovery-core.js', ['DISCOVERY_WHY_FIXED', 'DISCOVERY_WHY_BITS', 'discoveryWhyPhrase', 'discoveryExplainText']);
    assert(hi.discoveryExplainText(['Same city']) === 'Ek hi shehar', '"because you…" from the ranking server reads in the viewer language');
    const en2 = viewer('en', [], {});
    lift(en2, 'public/src/js/core/discovery-core.js', ['DISCOVERY_WHY_FIXED', 'DISCOVERY_WHY_BITS', 'discoveryWhyPhrase', 'discoveryExplainText']);
    assert(en2.discoveryExplainText('Matched on city & interests') === 'Matched on city and interests', 'list joined with the locale list formatter');
    assert(en2.discoveryExplainText(['Same industry · Technology · Hiring']) === 'Same industry · Technology · Hiring', 'industry phrase keeps its value');
    assert(en2.discoveryExplainText(['Something new from the server']) === 'Something new from the server', 'unknown server phrase shows as sent');
    assert(en2.discoveryExplainText([]) === 'Matched on open profile', 'empty → open-profile line');
    assert(/optionLabel\('discovery\.refine', c\.id\)/.test(read('public/src/js/features/discovery.js')), 'refine chips labelled by id');
    const story = read('public/src/js/features/duniya-story.js');
    assert(/function stickerText/.test(story) && /tEn\('duniya\.sticker_vote'\)/.test(read('public/src/js/features/duniya-story-editor.js')), 'sticker defaults stored in English, shown in the viewer language');
  }

  console.log('\nIntents manifest (per-language keywords)');
  const intentsRt = viewer('en', ['public/src/js/core/search-normalize.js', 'public/src/js/dangal/dangal-graduation.js', 'public/src/js/dangal/dangal-assist.js', 'public/src/js/core/chaupaal-intents.js', 'public/src/js/core/chaupaal-intents-manifest.js'], {});
  const CI = intentsRt.ChaupaalIntents;
  {
    const codes = intentsRt.LANG_CATALOG.map((l) => l.code);
    const list = CI.list();
    const bad = list.filter((i) => !i.keywords || !Array.isArray(i.keywords.en) || codes.some((c) => !Array.isArray(i.keywords[c])));
    assert(list.length >= 60 && bad.length === 0, `${list.length} intents, every keyword list keyed by all ${codes.length} languages (bad: ${bad.map((i) => i.id).slice(0, 4).join(', ')})`);
    const tabs = list.filter((i) => /^tab\./.test(i.id));
    assert(tabs.every((i) => i.keywords.en.length > 0) && codes.filter((c) => c !== 'en').every((c) => list.every((i) => i.keywords[c].length === 0)), 'English filled; other languages start empty');
    assert(/keywords: kw\(\[/.test(read('public/src/js/core/chaupaal-intents-manifest.js')) && !/keywords: \[/.test(read('public/src/js/core/chaupaal-intents-manifest.js')), 'manifest uses kw([...]) everywhere');
    CI.register({ id: 'test.legacy', label: 'Legacy', keywords: ['zzlegacyword'], priority: 50 });
    assert(CI.parse('zzlegacyword', { langs: ['en'] }).best?.id === 'test.legacy', 'a bare keyword array (older registrations) still counts as English');
    CI.register({ id: 'test.hi', label: 'Hindi kw', keywords: { en: ['zzenonly'], hi: ['खेलकूदटेस्ट'] }, priority: 50 });
    assert(CI.parse('खेलकूदटेस्ट', { langs: ['hi', 'en'] }).best?.id === 'test.hi', 'hi keywords match for a Hindi UI');
    assert(!CI.parse('खेलकूदटेस्ट', { langs: ['en'] }).matches.some((m) => m.id === 'test.hi'), 'hi keywords ignored when Hindi is neither UI nor a reading language');
    const hiRt = viewer('hi', ['public/src/js/core/search-normalize.js', 'public/src/js/core/chaupaal-intents.js', 'public/src/js/core/chaupaal-intents-manifest.js'], {});
    await hiRt.setAppLanguage('hi');
    hiRt.setContentLangs(['hi', 'ta']);
    assert(JSON.stringify(hiRt.ChaupaalIntents.searchLangs()) === JSON.stringify(['hi', 'en', 'ta']), 'search languages = UI + English + "Languages I read"');
    assert(hiRt.ChaupaalIntents.parse('akhbaar kholein').best?.id === 'tab.akhbaar', 'the translated label is searchable ("akhbaar kholein")');
    assert(CI.parse('play kakuro', { langs: ['en'] }).best?.id === 'dangal.game.ankjod', 'renamed game id still resolves (kakuro → ankjod)');
    const r = intentsRt.DangalAssist.resolveGame('play kabaddi');
    assert(r && r.retired === 'kabaddi', 'retired game id resolves to the retired screen');
  }

  console.log('\nSearch normalisation');
  {
    const SN = intentsRt.SearchNormalize;
    const fx = [
      ['Café', 'cafe'], ['ÉCOLE', 'ecole'], ['Straße', 'strasse'], ['Ångström', 'angstrom'], ['naïve  jalapeño', 'naive jalapeno'],
      ['ＡＢＣ１２３', 'abc123'], ['ｃｈｅｓｓ', 'chess'], ['ｶﾀｶﾅ', 'かたかな'], ['カタカナ', 'かたかな'],
      ['e\u0301', 'e'], ['\u00e9', 'e'], ['ﬁle', 'file'], ['it’s', "it's"], ['zero\u200bwidth', 'zerowidth'],
      ['हिंदी', 'हिंदी'], ['தமிழ்', 'தமிழ்'], ['مرحبا', 'مرحبا'], ['한국어', '한국어'],
    ];
    fx.forEach(([a, b]) => assert(SN.fold(a) === b, `fold(${JSON.stringify(a)}) → ${JSON.stringify(b)} (got ${JSON.stringify(SN.fold(a))})`));
    assert(SN.fold('\u0915\u093f') === '\u0915\u093f', 'Devanagari vowel signs are kept (only Latin diacritics strip)');
    assert(/dangal/.test(SN.translit('khel')) && /news/.test(SN.translit('khabar')) && /friends/.test(SN.translit('dost')) && /music/.test(SN.translit('gaana')), 'Latin-script Hindi/Urdu: khel, khabar, dost, gaana');
    assert(SN.translit('hello world') === '', 'no transliteration for ordinary English');
    const best = (q) => CI.parse(q, { langs: ['en'] }).best?.id;
    assert(['dangal.khel', 'tab.dangal'].includes(best('khel')), `"khel" → Dangal (${best('khel')})`);
    assert(/akhbaar/.test(best('khabar dikhao') || ''), `"khabar dikhao" → Akhbaar (${best('khabar dikhao')})`);
    assert(/music/.test(best('gaana') || ''), `"gaana" → Music (${best('gaana')})`);
    assert(/find_people|khoj/.test(best('dost dhoondo') || ''), `"dost dhoondo" → find people (${best('dost dhoondo')})`);
    assert(best('ｏｐｅｎ ａｋｈｂａａｒ') === 'tab.akhbaar' && best('OPEN AKHBAAR') === 'tab.akhbaar', 'full-width + upper case → Open Akhbaar');
    assert(best('admin') !== 'dangal.game.badminton', 'labels match on word starts (admin ≠ badminton)');
    assert(/SearchNormalize\.fold/.test(read('public/src/js/core/search.js')) && /fold\(row\.name\)/.test(read('public/src/js/core/search.js')), 'universal search compares folded text (Firestore prefix query unchanged)');
    assert(/SearchNormalize\.expand\(query\)/.test(read('public/src/js/features/discovery.js')), 'Khoj local fallback reads Latin-script Hindi too');
    const idx = read('public/index.html');
    assert(idx.indexOf('core/search-normalize.js') > 0 && idx.indexOf('core/search-normalize.js') < idx.indexOf('core/chaupaal-intents.js'), 'search-normalize.js loads before search + intents');
  }

  console.log('\nAI output language');
  {
    const AiLang = require('../public/src/js/ai/ai-lang.js');
    assert(/Respond in Hindi\./.test(AiLang.directive('hi')) && /Respond in English\./.test(AiLang.directive('xx')), 'directive names the language; unknown → English');
    assert(AiLang.validate('यह आपके खेल का नियम है।', 'hi').ok && !AiLang.validate('This is the rule for your game.', 'hi').ok, 'hi: Devanagari passes, English fails');
    assert(AiLang.validate('هذه قاعدة اللعبة', 'ar').ok && !AiLang.validate('这是游戏的规则', 'ja').ok && AiLang.validate('これはゲームのルールです', 'ja').ok, 'ar / ja script checks');
    assert(!AiLang.validate('The rule is that you and your partner move to the next square on the board.', 'es').ok && AiLang.validate('La regla es que tú y tu compañero pasan a la siguiente casilla del tablero.', 'es').ok, 'es vs English via stop words');
    assert(AiLang.validate('{"answer":"यह नियम है","cite":["s1"],"covered":true}', 'hi', { json: true }).ok, 'JSON: only values checked, keys ignored');
    assert(AiLang.cacheKey('rules:chess', 'hi-IN') === 'rules:chess::hi', 'cache keys carry the language');

    const ai = require('../server-lib/ai');
    const provider = ai.PROVIDERS.anthropic;
    const saved = provider.complete;
    const calls = [];
    let replies = [];
    provider.complete = async (req) => {
      calls.push(req);
      return { content: [{ type: 'text', text: replies.shift() || '' }] };
    };
    try {
      replies = ['Here is your answer in English.', 'Here is your answer in English.'];
      const r1 = await ai.callAI({ bypassKillSwitch: true, model: 'm', system: 'SYS', messages: [{ role: 'user', content: 'q' }], lang: 'hi' });
      assert(calls.length === 2 && /Respond in Hindi/.test(calls[0].system) && /Respond in English/.test(calls[1].system), 'wrong-language answer → one retry in English');
      assert(r1.lang === 'en' && r1.langFallback === true, 'result says it fell back to English');
      calls.length = 0;
      replies = ['यह आपका उत्तर है।'];
      const r2 = await ai.callAI({ bypassKillSwitch: true, model: 'm', system: 'SYS', messages: [{ role: 'user', content: 'q' }], lang: 'hi' });
      assert(calls.length === 1 && r2.lang === 'hi' && !r2.langFallback && r2.text === 'यह आपका उत्तर है।', 'right language → no retry');
      calls.length = 0;
      replies = ['Shared English content.'];
      const r3 = await ai.callAI({ bypassKillSwitch: true, model: 'm', system: 'SYS', messages: [{ role: 'user', content: 'q' }] });
      assert(calls.length === 1 && calls[0].system === 'SYS' && r3.lang === null, 'no lang (shared content) → prompt untouched, English canonical');
    } finally {
      provider.complete = saved;
    }

    const { createDangalAI } = require('../server-lib/dangal-ai');
    const seen = [];
    const dai = createDangalAI({
      env: { AI_FEATURES_ENABLED: 'true', AI_DAILY_CALL_CAP: '1000' },
      callAI: async (opts) => {
        seen.push(opts);
        return { text: JSON.stringify({ answer: 'x', cite: [], covered: false }) };
      },
    });
    const q = { gameId: 'chess', question: 'Can a pawn move backwards?' };
    await dai.run('rulesQA', q, { uid: 'u1', lang: 'hi' });
    await dai.run('rulesQA', q, { uid: 'u1', lang: 'hi' });
    await dai.run('rulesQA', q, { uid: 'u1', lang: 'en' });
    assert(seen.length === 2 && seen[0].lang === 'hi' && seen[0].langJson === true && seen[1].lang === 'en', `rules Q&A asks in the viewer language; cache keyed by lang (${seen.length} provider calls for hi, hi, en)`);
    seen.length = 0;
    await dai.run('generateWordPack', { game: 'scribble', theme: 'animals', count: 10 }, { uid: 'u1', lang: 'hi' });
    assert(seen.length <= 1 && (!seen[0] || seen[0].lang === undefined), 'shared word packs stay English canonical (no lang)');
    const off = createDangalAI({ env: { AI_FEATURES_ENABLED: 'false' } });
    const offOut = await off.run('rulesQA', q, { uid: 'u1', lang: 'hi' });
    assert(offOut && offOut.source !== 'ai' && offOut.data && typeof offOut.data.answer === 'string', 'AI off → deterministic answer, no provider');
    assert(/lang = String\(body\.lang \|\| \(req\.headers && req\.headers\['x-chaupaal-lang'\]\)/.test(read('api/media-config.js')), 'dangal_ai route passes the viewer language');
    assert(/headers\['X-Chaupaal-Lang'\]/.test(read('public/src/js/core/api-client.js')), 'apiFetch sends the UI language');

    const client = viewer('hi', ['public/src/js/ai/ai-lang.js', 'public/src/js/ai/call-ai.js'], {});
    await client.setAppLanguage('hi');
    let body = null;
    client.isAiFeaturesEnabled = async () => true;
    client.fetch = async (url, init) => {
      body = JSON.parse(init.body);
      return { ok: true, status: 200, json: async () => ({ ok: true, data: { text: 'ठीक है', content: [{ type: 'text', text: 'ठीक है' }], lang: 'hi' } }) };
    };
    await client.callAI({ tier: 'fast', messages: [{ role: 'user', content: 'x' }], lang: client.aiUiLang() });
    assert(body && body.lang === 'hi', 'client callAI forwards lang (viewer UI language)');
    assert(client.aiCacheKey('brief') === 'brief::hi', 'client cache key helper includes the language');
    ['public/src/js/features/onboarding.js', 'public/src/js/features/dangal.js', 'public/src/js/features/profile.js', 'public/src/js/core/profile-facts.js'].forEach((f) =>
      assert(/lang: typeof aiUiLang ?=== ?'function' ?\? ?aiUiLang\(\)/.test(read(f)), `${path.basename(f)}: UI-text AI call passes the viewer language`)
    );
    assert(/messages: \[\{ role: 'user', content: prompt \}\]/.test(read('public/src/js/core/profile-facts.js')), 'profile trivia call uses the real callAI shape (was { prompt } — never ran)');
    ['api/chaupaal-chat.js', 'api/chaupaal-events.js', 'server-lib/akhbaar-personalize.js', 'server-lib/companion-outreach.js', 'api/chaupaal-scheduler.js'].forEach((f) =>
      assert(/\blang: /.test(read(f)), `${f}: per-recipient AI text asks for the recipient language`)
    );
    assert(!/\blang: /.test(read('server-lib/quiz-ai-pipeline.js')) && !/\blang: /.test(read('api/refresh-category-cache.js')), 'batch content (quiz bank, category cache) stays English canonical');
  }

  console.log('\nPremium');
  {
    const money = read('public/src/js/core/chaupaal-money.js');
    assert(/formatCurrency\(num, cur\)/.test(money) && /tHtml\('premium\.price_per_month', \{ price: formatAmount\(pricing\.pradhan/.test(money), 'tier prices: L1 currency helper + catalog "/ mo"');
    const r = loadI18n({ region: false });
    assert(typeof r.formatCurrency === 'function' && /₹/.test(r.formatCurrency(299, 'INR')) && /299/.test(r.formatCurrency(299, 'INR')), 'formatCurrency renders the amount in its own currency');
    assert(!/[₹$€£]\s?\d/.test(read('public/src/js/config/policy-limits.js') + read('public/src/js/core/policy-usage.js')), 'no hard-coded prices in policy copy');
  }

  console.log('\nBidi (ar-XB)');
  {
    const v = viewer('en', [], {});
    v.setPseudoLocale('ar-XB');
    await v.setAppLanguage('en');
    assert(v.isRtl(), 'ar-XB is RTL');
    const html = v.tHtml('akhbaar.beat_shared_score', { name: v.bidi('نور') });
    assert(/<bdi>نور<\/bdi>/.test(html), 'challenger name isolated in the Akhbaar banner');
    assert(v.t('duniya.restory_credit', { name: v.bidi('Asha') }).includes('\u2068Asha\u2069'), 'text-mode names get FSI…PDI');
    assert(/challenger: bidi\(beat\.challenger\)/.test(read('public/src/js/features/akhbaar.js')) && /name: bidi\(ov\.name\)/.test(read('public/src/js/features/duniya-story.js')), 'Akhbaar + story names wrapped');
  }

  console.log('\nPseudo en-XA');
  {
    const r4 = loadI18n({ region: false });
    r4.setPseudoLocale('en-XA');
    const keys = new Set();
    L4.forEach((rel) => classify(read(rel), isCopy).calls.forEach((c) => exists(c.key) && keys.add(c.key)));
    const plain = [...keys].filter((k) => {
      const s = r4.t(k, { count: 2, n: 2, who: 'other' });
      return !(s.startsWith('[') && s.endsWith(']'));
    });
    assert(keys.size > 600 && plain.length === 0, `en-XA transforms every L4 key (${keys.size}; untransformed: ${plain.slice(0, 5).join(', ')})`);
    assert(r4.optionLabel('akhbaar.cat', 'Sports').startsWith('['), 'option labels pseudo-localise too');
  }

  console.log('\nGuards');
  {
    const apis = fs.readdirSync(path.join(ROOT, 'api')).filter((f) => f.endsWith('.js'));
    assert(apis.length === 12, `api/*.js === 12 (got ${apis.length})`);
    const idx = read('public/index.html');
    assert(/ai\/ai-lang\.js/.test(idx) && idx.indexOf('ai/ai-lang.js') < idx.indexOf('ai/call-ai.js'), 'ai-lang.js loads before call-ai.js');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
