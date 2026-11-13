/**
 * Global L12 — Bengali (bn) language pass.
 *   node -r ./scripts/lib/i18n-node-shim.js scripts/test-global-l12-bn.js
 *
 * Shared checks (scripts/lib/lang-pass.js) + Bengali: region digits (Bangladesh native ০–৯, India Western),
 * conjunct / khanda-ta / chandrabindu search folding, Bengali font + tall-line rules, no Devanagari leak.
 */
'use strict';
const { main } = require('./lib/lang-pass');

main({
  lang: 'bn',
  name: 'Bengali',
  script: /[\u0980-\u09FF]/,
  banned: [
    [/[\u0900-\u0963\u0966-\u097F]/, 'Devanagari (danda । ॥ excepted)'],
    [/[\u09E6-\u09EF]/, 'Bengali digits baked into copy (digits are localised at render time)'],
  ],
  terms: { Cancel: 'বাতিল', Save: 'সেভ', Share: 'শেয়ার', Delete: 'মুছ', Settings: 'সেটিংস', Profile: 'প্রোফাইল', Send: 'পাঠান', Report: 'রিপোর্ট', Block: 'ব্লক' },
  searchNative: ['খেলা', 'বন্ধু', 'খবর', 'দাবা'],
  searchLatin: ['khela', 'bondhu', 'khobor', 'gaan'],
  extra: async ({ assert, read, fmtFor }) => {
    const bd = fmtFor('bn', 'BD');
    const inn = fmtFor('bn', 'IN');
    assert(/[০-৯]/.test(bd.formatNumber(1234)) && bd.localeUsesNativeDigits(), `digits: bn-BD renders Bengali numerals (${bd.formatNumber(1234)})`);
    assert(/^[\d,.\s\u00a0]+$/.test(inn.formatNumber(1234)), `digits: bn-IN renders 0–9 (${inn.formatNumber(1234)})`);
    const SN = require('../public/src/js/core/search-normalize.js');
    assert(SN.fold('উৎসব') === SN.fold('উত্\u200Cসব'), 'search: khanda ta ৎ matches ত + hasanta');
    assert(SN.fold('খুঁজুন') === SN.fold('খুজুন'), 'search: chandrabindu is optional');
    assert(SN.fold('৫') === '5', 'search: Bengali digits fold to 0–9');
    assert(SN.fold('য়') === SN.fold('য\u09BC'), 'search: precomposed য় matches য + nukta');
    const layout = read('public/src/js/core/i18n-layout.js');
    const css = read('public/src/styles/i18n.css');
    assert(/bn: \{ family: 'Noto Sans Bengali'/.test(layout) && /:root:lang\(bn\) \{ --font-script:/.test(css), 'fonts: Noto Sans Bengali lazy-loaded behind system Bengali fonts');
    assert(/:lang\(bn\)[^{]*\) body \{ line-height: 1\.6; \}/.test(css), 'tall-mark scripts get line-height 1.6 (no clipped conjuncts / vowel signs)');
  },
});
