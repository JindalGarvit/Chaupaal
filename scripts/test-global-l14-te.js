/**
 * Global L14 — Telugu (te) language pass.
 *   node -r ./scripts/lib/i18n-node-shim.js scripts/test-global-l14-te.js
 *
 * Shared checks (scripts/lib/lang-pass.js) + Telugu: Western digits by default, no Devanagari / Kannada leak,
 * long-text budget, vertical clipping guard (tall vowel signs + stacked consonants need line-height 1.6
 * and no letter-spacing), consistent sub-surface names.
 */
'use strict';
const { main } = require('./lib/lang-pass');

main({
  lang: 'te',
  name: 'Telugu',
  script: /[\u0C00-\u0C7F]/,
  banned: [
    [/[\u0900-\u0963\u0966-\u097F]/, 'Devanagari (danda । ॥ excepted)'],
    [/[\u0C80-\u0CFF]/, 'Kannada letters (look-alike script)'],
    [/[\u0C66-\u0C6F]/, 'Telugu digits baked into copy'],
    [/\b(Manch|Khel)\b/, 'Latin Manch / Khel (written మంచ్ / ఖేల్)'],
  ],
  terms: { Cancel: 'రద్దు', Save: 'సేవ్', Share: 'షేర్', Delete: 'తొలగించ', Settings: 'సెట్టింగ్', Profile: 'ప్రొఫైల్', Send: 'పంప', Report: 'రిపోర్ట్', Block: 'బ్లాక్' },
  searchNative: ['ఆట', 'స్నేహితులు', 'వార్తలు', 'చదరంగం'],
  searchLatin: ['aata', 'snehitulu', 'vartalu'],
  extra: async ({ assert, en, pack, enKeys, read, fmtFor }) => {
    assert(/^[\d,.\s\u00a0]+$/.test(fmtFor('te', 'IN').formatNumber(1234)), 'digits: Western 0–9 for te-IN');
    const short = enKeys.filter((k) => en[k].length <= 12 && !/\{|</.test(en[k]) && pack[k]);
    const long = short.filter((k) => [...String(pack[k])].length > en[k].length * 3 + 6);
    assert(long.length <= Math.ceil(short.length * 0.02), `long-text budget: compact labels stay ≤3×+6 chars (${long.length}/${short.length} over${long.length ? ': ' + long.slice(0, 4).join(', ') : ''})`);
    const layout = read('public/src/js/core/i18n-layout.js');
    const css = read('public/src/styles/i18n.css');
    assert(/te: \{ family: 'Noto Sans Telugu'/.test(layout) && /:root:lang\(te\) \{ --font-script:/.test(css), 'fonts: Noto Sans Telugu lazy-loaded behind system Telugu fonts');
    assert(/:lang\(te\)[^{]*\) body \{ line-height: 1\.6; \}/.test(css), 'vertical clipping: line-height 1.6 for Telugu');
    assert(/:lang\(te\)[^{]*\) :is\(body, body \*\) \{\s*letter-spacing: normal !important;/.test(css), 'vertical clipping: letter-spacing reset (no broken conjuncts)');
  },
});
