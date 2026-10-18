#!/usr/bin/env node
/**
 * Global L1 — locale formatting, RTL layout, script fonts, pseudo-locales, string lint + coverage.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadI18n, ROOT } = require('./lib/i18n-runtime');
const cssLogical = require('./css-logical');
const { lint } = require('./i18n-lint');
const { coverage } = require('./i18n-coverage');

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let passes = 0;
let failures = 0;
function assert(cond, msg) {
  if (cond) {
    passes++;
    console.log('  ✓ ' + msg);
  } else {
    failures++;
    console.log('  FAIL ' + msg);
  }
}
const NNBSP = '\u202f';
const T0 = Date.UTC(2026, 0, 5, 15, 4); // Mon 5 Jan 2026 15:04 UTC
const UTC = { timeZone: 'UTC' };

/** Runtime with a UI language + a user-picked region. */
function rtFor(lang, country, extra) {
  const rt = loadI18n(
    Object.assign(
      {
        storage: { chaupaal_lang: lang, chaupaal_region: JSON.stringify({ country, source: 'user' }) },
        languages: [lang],
      },
      extra || {}
    )
  );
  return rt;
}

async function run() {
  console.log('\nFormat locale');
  {
    const cases = [
      ['en', 'US', 'en-US'],
      ['en', 'IN', 'en-IN'],
      ['hi', 'IN', 'hi-IN'],
      ['ar', 'SA', 'ar-SA'],
      ['zh', 'CN', 'zh-Hans-CN'],
      ['pt', 'BR', 'pt-BR'],
      ['de', 'AT', 'de-AT'],
    ];
    cases.forEach(([lang, cc, want]) => {
      const F = rtFor(lang, cc).ChaupaalFormat;
      assert(F.formatLocale() === want, `${lang} + region ${cc} → ${want} (got ${F.formatLocale()})`);
    });
  }

  console.log('\nNumbers, compact, percent');
  {
    const us = rtFor('en', 'US').ChaupaalFormat;
    const inn = rtFor('en', 'IN').ChaupaalFormat;
    const hi = rtFor('hi', 'IN').ChaupaalFormat;
    const ar = rtFor('ar', 'SA').ChaupaalFormat;
    const de = rtFor('de', 'DE').ChaupaalFormat;
    const fr = rtFor('fr', 'FR').ChaupaalFormat;
    const ja = rtFor('ja', 'JP').ChaupaalFormat;
    const zh = rtFor('zh', 'CN').ChaupaalFormat;
    assert(us.formatNumber(1234567.5) === '1,234,567.5', 'en-US 1,234,567.5');
    assert(inn.formatNumber(1234567) === '12,34,567' && hi.formatNumber(1234567) === '12,34,567', 'en-IN / hi-IN lakh–crore grouping 12,34,567');
    const sp = (s) => String(s).replace(/[\u00a0\u202f]/g, ' ');
    assert(inn.formatCompact(120000) === '1.2L' && sp(inn.formatCompact(120000, { long: true })) === '1.2 lakh', 'en-IN compact 1.2L / 1.2 lakh');
    assert(us.formatCompact(1234) === '1.2K', 'en-US compact 1.2K');
    assert(ja.formatCompact(123456) === '12万' && zh.formatCompact(123456) === '12万', 'ja / zh compact 12万');
    assert(de.formatNumber(1234567.5) === '1.234.567,5', 'de decimal comma 1.234.567,5');
    assert(fr.formatNumber(1234567.5) === `1${NNBSP}234${NNBSP}567,5`, 'fr narrow no-break space grouping');
    assert(/^42[\u00a0\u202f]%$/.test(fr.formatPercent(0.42)) && us.formatPercent(0.42) === '42%', 'percent: 42% / fr 42 % (no-break space)');
    assert(ar.formatNumber(1234) === '١٬٢٣٤' && ar.localeUsesNativeDigits(), 'ar-SA Arabic-Indic digits by default');
    ar.setDigitsPref('latn');
    assert(ar.formatNumber(1234) === '1,234' && ar.formatLocale() === 'ar-SA-u-nu-latn', '“Use Western digits” → 0–9');
    ar.setDigitsPref('');
    assert(!rtFor('hi', 'IN').ChaupaalFormat.localeUsesNativeDigits() && rtFor('mr', 'IN').ChaupaalFormat.localeUsesNativeDigits(), 'digit toggle only offered where native digits are the norm (mr yes, hi no)');
  }

  console.log('\nDates, times, relative');
  {
    const us = rtFor('en', 'US').ChaupaalFormat;
    const inn = rtFor('en', 'IN').ChaupaalFormat;
    const de = rtFor('de', 'DE').ChaupaalFormat;
    const hi = rtFor('hi', 'IN').ChaupaalFormat;
    assert(us.formatDate(T0, 'medium', UTC) === 'Jan 5, 2026' && inn.formatDate(T0, 'medium', UTC) === '5 Jan 2026', 'medium date per locale (Jan 5, 2026 / 5 Jan 2026)');
    assert(us.formatTime(T0, UTC) === '3:04 PM' && /^3:04\s?pm$/i.test(inn.formatTime(T0, UTC)) && de.formatTime(T0, UTC) === '15:04', '12/24 h from region (3:04 PM · 3:04 pm · 15:04)');
    assert(de.formatDate(T0, 'long', UTC) === '5. Januar 2026', 'de long date');
    assert(us.formatDate(T0, 'weekday', UTC) === 'Monday, Jan 5', 'weekday style');
    const now = T0;
    assert(us.formatRelative(now - 20e3, { now }) === 'Just now', 'relative: Just now');
    assert(us.formatRelative(now - 3 * 60e3, { now }) === '3 minutes ago', 'relative: 3 minutes ago');
    assert(us.formatRelative(now - 2 * 3600e3, { now }) === '2 hours ago', 'relative: 2 hours ago');
    assert(us.formatRelative(now - 26 * 3600e3, { now }) === 'Yesterday', 'relative: Yesterday');
    assert(us.formatRelative(now - 40 * 86400e3, Object.assign({ now }, UTC)) === 'Nov 26, 2025', 'relative: older → a date');
    assert(hi.formatRelative(now - 3 * 60e3, { now }) === '3 मिनट पहले', 'hi relative: 3 मिनट पहले');
    assert(us.formatRelative({ seconds: (now - 60e3 * 5) / 1000 }, { now }) === '5 minutes ago', 'Firestore Timestamp-like input');
  }

  console.log('\nCurrency, lists, units, durations');
  {
    const de = rtFor('de', 'DE').ChaupaalFormat;
    const inn = rtFor('en', 'IN').ChaupaalFormat;
    const us = rtFor('en', 'US').ChaupaalFormat;
    assert(de.formatCurrency(5) === `5${'\u00a0'}€` && inn.formatCurrency(1234) === '₹1,234', 'currency defaults to the region (5 € · ₹1,234)');
    assert(us.formatCurrency(1234, 'INR') === '₹1,234' && de.formatCurrency(1234, 'INR') === `1.234${'\u00a0'}₹`, 'a stored INR amount stays INR in any region (no conversion)');
    assert(us.formatCurrency(9.5, 'USD') === '$9.50', 'cents kept when the amount has them');
    assert(us.formatList(['A', 'B', 'C']) === 'A, B, and C' && inn.formatList(['A', 'B', 'C']) === 'A, B and C', 'lists: A, B, and C (US) · A, B and C (IN)');
    assert(rtFor('hi', 'IN').ChaupaalFormat.formatList(['A', 'B', 'C']) === 'A, B, और C', 'hi list uses और (CLDR)');
    assert(inn.formatDistance(1500) === '1.5 km' && inn.formatDistance(400) === '400 m', 'metric distances');
    assert(us.formatDistance(1500) === '0.9 mi' && us.formatDistance(30) === '98 ft', 'imperial distances (US)');
    assert(rtFor('en', 'GB').ChaupaalFormat.formatDistance(5000) === '3.1 mi', 'UK distances in miles');
    assert(us.formatDuration(65) === '1:05' && us.formatDuration(3723) === '1:02:03' && us.formatDuration(-3) === '0:00', 'durations m:ss / h:mm:ss');
    assert(rtFor('ar', 'SA').ChaupaalFormat.formatDuration(65) === '١:٠٥', 'ar-SA duration in Arabic-Indic digits');
  }

  console.log('\nApp call sites use the helper');
  {
    const checks = [
      ['public/src/js/core/ui-states.js', /ChaupaalFormat\.formatRelative\(/, 'formatRelativeTime → formatRelative'],
      ['public/src/js/core/chaupaal-money.js', /formatCurrency\(num, cur\)/, 'Chaupaal Money in its stored currency'],
      ['public/src/js/core/baithak-transport.js', /formatTime\(m\.ts/, 'chat message times'],
      ['public/src/js/core/media-player.js', /formatDuration\(sec\)/, 'music player m:ss'],
      ['public/src/js/features/duniya.js', /formatCompact\(n\)/, 'Duniya like counts compact'],
      ['public/src/js/features/akhbaar.js', /formatDate\(new Date\(\),'dayMonth'\)/, 'Akhbaar result date'],
      ['public/src/js/core/journal-checkin.js', /formatDate\(d, 'medium'\)/, 'journal dates in the user’s zone + locale'],
      ['public/src/js/games/brick-breaker.js', /function bbFmt/, 'game scores grouped per locale'],
    ];
    checks.forEach(([f, re, msg]) => assert(re.test(read(f)), msg));
    const leftovers = [];
    const walk = (d) =>
      fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).forEach((e) => {
        const rel = d + '/' + e.name;
        if (e.isDirectory()) return walk(rel);
        if (!rel.endsWith('.js')) return;
        read(rel)
          .split('\n')
          .forEach((line, i) => {
            if (/\.toLocale(Date|Time)?String\(/.test(line) && !/typeof format(Date|Time|Number)\s*===|formatNumber|formatDate|formatTime|function bbFmt|i18n-format fallback/.test(line)) leftovers.push(rel + ':' + (i + 1));
          });
      });
    walk('public/src/js');
    assert(leftovers.length === 0, 'no unguarded toLocale*String left in UI code (' + leftovers.slice(0, 4).join(', ') + ')');
  }

  console.log('\nRTL');
  {
    const rt = loadI18n();
    await rt.setAppLanguage('ar');
    assert(rt.html.dir === 'rtl' && rt.isRtl(), 'Arabic → dir=rtl, isRtl()');
    await rt.setAppLanguage('ur');
    assert(rt.html.dir === 'rtl', 'Urdu → rtl');
    await rt.setAppLanguage('en');
    assert(rt.html.dir === 'ltr' && !rt.isRtl(), 'English → ltr');
    let remaining = 0;
    cssLogical.files().forEach((f) => (remaining += cssLogical.findPhysical(fs.readFileSync(f, 'utf8')).length));
    assert(remaining === 0, 'styles/*.css: no physical left/right left (centering 50% + [dir] rules allow-listed)');
    const conv = cssLogical.convertCss('.b{border-radius:18px 18px 4px 18px;margin:0 4px 0 12px;left:50%}').css;
    assert(/border-end-end-radius:4px/.test(conv) && /margin-inline:12px 4px/.test(conv) && /left:50%/.test(conv), 'codemod: bubble tail, asymmetric shorthand, centering idiom kept');
    const i18nCss = read('public/src/styles/i18n.css');
    const icons = loadI18n({ icons: true });
    assert(/cp-flip-rtl/.test(icons.iconHtml('arrow-left')) && /cp-flip-rtl/.test(icons.iconHtml('send')) && !/cp-flip-rtl/.test(icons.iconHtml('search')), 'iconHtml marks directional icons .cp-flip-rtl (not search/media)');
    assert(/\[dir="rtl"\] :is\(\.cp-flip-rtl[^{]*\{\s*transform: scaleX\(-1\)/.test(i18nCss), 'RTL mirrors .cp-flip-rtl');
    assert(/\.game-back-btn:not\(:has\(svg\)\)/.test(i18nCss), 'text ← back buttons flip; SVG ones never flip twice');
    ['canvas', '.chess-board', '.ludo-board', '.snakes-board', '.ttt-grid', '.kk-grid', '.sf-grid', '.pc-carrom-field', '.tb-ticket', '.uno-hand'].forEach((sel) =>
      assert(new RegExp('\\[dir="rtl"\\] :is\\([^)]*' + sel.replace('.', '\\.') + '[\\s,)]').test(i18nCss), `board / cards stay LTR: ${sel}`)
    );
    assert(/unicode-bidi: isolate/.test(i18nCss) && /unicode-bidi: plaintext/.test(i18nCss), 'bidi isolation for names / handles; plaintext for user text');
    assert(/setAttribute\('dir', 'auto'\)/.test(read('public/src/js/core/i18n-layout.js')), 'typed fields get dir="auto"');
  }

  console.log('\nGestures flip in RTL');
  {
    const src = read('public/src/js/core/section-swipe.js');
    const mk = (rtl) => {
      const listeners = {};
      const root = { dataset: {}, addEventListener: (t, fn) => (listeners[t] = fn) };
      const got = [];
      const ctx = { window: {}, isRtl: () => rtl };
      vm.createContext(ctx);
      vm.runInContext(src, ctx);
      ctx.window.wireSectionSwipe(root, { onSwipe: (d) => got.push(d) });
      const touch = (x, y) => ({ touches: [{ clientX: x, clientY: y }], changedTouches: [{ clientX: x, clientY: y }], target: {}, preventDefault() {} });
      listeners.touchstart(touch(200, 100));
      listeners.touchmove(touch(100, 102));
      listeners.touchend(touch(100, 102));
      return got[0];
    };
    assert(mk(false) === 1 && mk(true) === -1, 'section swipe: leftward = next in LTR, previous in RTL');
    assert(/dirSign\(\)/.test(read('public/src/js/core/swipe-pager.js')) && /-index \* 100 \* dirSign\(\)/.test(read('public/src/js/core/swipe-pager.js')), 'swipe pager track + direction flip in RTL');
    assert(/window\.innerWidth \|\| 0\) - t\.clientX/.test(read('public/src/js/core/touch.js')), 'swipe-to-go-back starts from the right edge in RTL');
  }

  console.log('\nScript fonts');
  {
    const css = read('public/src/styles/i18n.css');
    [['hi', 'Devanagari'], ['bn', 'Bengali'], ['ta', 'Tamil'], ['te', 'Telugu'], ['ar', 'Arabic'], ['ur', 'Nastaliq'], ['ja', 'JP'], ['ko', 'KR'], ['zh', 'SC']].forEach(([l, s]) =>
      assert(new RegExp(':root:lang\\(' + l + '\\)[^{]*\\{[^}]*--font-script:[^}]*' + s).test(css), `:lang(${l}) stack → ${s}`)
    );
    assert(/--font-ui: 'Inter', var\(--font-script\)/.test(css), 'Latin first, then the script stack (system fonts before the web alias)');
    assert(/:lang\(ur\) body \{ line-height: 2; \}/.test(css) && /letter-spacing: normal !important/.test(css) && /word-break: keep-all/.test(css), 'per-script line-height, no letter-spacing on Indic/Arabic, CJK breaking');
    const inter = (read('public/src/styles/components.css') + read('public/src/styles/dangal.css')).match(/(['"]?)Inter\1\s*,\s*sans-serif/g) || [];
    assert(inter.length === 0, 'hard-coded Inter stacks replaced by var(--font-ui)');
    const layout = read('public/src/js/core/i18n-layout.js');
    const ctx = { window: {}, document: { readyState: 'complete', addEventListener() {}, querySelectorAll: () => [], head: { appendChild() {} }, createElement: () => ({ dataset: {} }) }, fetch: (u) => (ctx.fetched.push(u), Promise.resolve({ ok: false })), fetched: [], normalizeLang: (c) => c, currentLang: 'en' };
    vm.createContext(ctx);
    vm.runInContext(layout, ctx);
    assert(ctx.fetched.length === 0, 'English boot fetches no web font');
    ctx.window.ChaupaalFonts.ensureForLang('hi');
    assert(ctx.fetched.length === 1 && /Noto\+Sans\+Devanagari/.test(ctx.fetched[0]) && /display=swap/.test(ctx.fetched[0]), 'Hindi lazily requests Noto Sans Devanagari (display=swap)');
    const sample = "@font-face {\n  font-family: 'Noto Sans Devanagari';\n  font-weight: 700;\n  font-display: swap;\n  src: url(https://fonts.gstatic.com/x.woff2) format('woff2');\n  unicode-range: U+0900-097F;\n}";
    const out = ctx.window.ChaupaalFonts.rewriteFaces(sample, ctx.window.ChaupaalFonts.SCRIPT_FONTS.hi);
    assert(/font-family: 'CP Devanagari'/.test(out) && /src: local\('Noto Sans Devanagari Bold'\), local\('NotoSansDevanagari-Bold'\), url/.test(out) && /unicode-range/.test(out), 'web face renamed + local() first (no download when installed), subsets kept');
    assert(!/fonts\.googleapis\.com\/css2\?family=Noto/.test(read('public/index.html')), 'no script web font in index.html (first paint unchanged)');
  }

  console.log('\nPseudo-locales');
  {
    const rt = loadI18n({ search: '?pseudo=en-XA' });
    const s = rt.t('settings.app_language');
    assert(/^\[Åþþ ļáñĝûáĝé ·+\]$/.test(s), 'en-XA accents + pads: ' + s);
    assert(s.length >= Math.ceil('App language'.length * 1.4), 'en-XA ≥ 40% longer');
    assert(rt.html.lang === 'en-XA' && rt.html.dir === 'ltr', 'en-XA html lang');
    assert(/^\[<strong>Ĥî<\/strong> ţĥéŕé ·+\]$/.test(rt.tHtml('common.x', {}, '<strong>Hi</strong> there')), 'en-XA never accents inside tags');
    rt.setPseudoLocale('ar-XB');
    assert(rt.t('settings.app_language').includes('\u202e') && rt.html.dir === 'rtl' && rt.html.lang === 'ar-XB', 'ar-XB: RTL override marks + dir=rtl');
    rt.setPseudoLocale(null);
    assert(rt.t('settings.app_language') === 'App language' && rt.html.dir === 'ltr', 'off again');
    assert(!rt.LANG_CATALOG.some((l) => /XA|XB/.test(l.code + l.html)), 'pseudo-locales absent from the production picker');
    const off = loadI18n({ search: '?pseudo=off', storage: { chaupaal_pseudo_locale: 'en-XA' } });
    assert(!off.isPseudoLocale(), '?pseudo=off clears the sticky flag');
    const fmt = rtFor('en', 'IN', { search: '?pseudo=ar-XB' }).ChaupaalFormat;
    assert(fmt.formatLocale() === 'en-IN', 'pseudo keeps English formatting (only text is transformed)');
  }

  console.log('\nLint + coverage baselines');
  {
    const res = lint();
    const base = JSON.parse(read('scripts/i18n-lint-baseline.json'));
    // Extraction arcs (L2+) empty whole surfaces, so only "the lint found something somewhere" is stable.
    assert(res.total > 0 && Object.keys(res.bySurface).length >= 1, `lint ran: ${res.total} hard-coded strings across ${Object.keys(res.bySurface).length} surfaces`);
    const worse = Object.entries(res.bySurface).filter(([s, n]) => n > (base.bySurface[s] || 0));
    assert(worse.length === 0, 'no surface above its baseline (ratchet) ' + worse.map((w) => w.join('=')).join(' '));
    assert(res.hits.every((h) => h.file && h.line > 0 && h.text), 'every hit has file:line + text');
    const cov = coverage();
    // Extraction (L2+) grows the English catalog every arc, so hi is held to its translated count, not a %.
    assert(cov.enKeys > 900 && cov.langs.hi.translated >= 800 && cov.langs.ja.coverage < 10, `coverage: hi ${cov.langs.hi.coverage}% · ja ${cov.langs.ja.coverage}%`);
    assert(Object.values(cov.langs).every((l) => !l.placeholderMismatches.length && !l.pluralGaps.length && !l.glossaryViolations.length), 'no placeholder / plural / glossary problems in shipped packs');
  }

  console.log('\nGuards');
  {
    const apiCount = fs.readdirSync(path.join(ROOT, 'api')).filter((f) => f.endsWith('.js')).length;
    assert(apiCount === 12, `api/*.js === 12 (got ${apiCount})`);
    const html = read('public/index.html');
    const order = ['/src/js/core/i18n.js', '/src/js/core/region.js', '/src/js/core/i18n-format.js', '/src/js/core/i18n-layout.js', '/src/js/core/lang-picker.js'].map((s) => html.indexOf(s));
    assert(order.every((i, n) => i > 0 && (n === 0 || i > order[n - 1])), 'script order i18n → region → format → layout → picker');
    assert(/\/src\/styles\/i18n\.css/.test(html) && /id="westernDigitsRow" hidden/.test(html), 'i18n.css linked; Western-digits row hidden by default');
  }

  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
