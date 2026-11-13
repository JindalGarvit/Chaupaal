/**
 * Global L13 — Tamil (ta) language pass.
 *   node -r ./scripts/lib/i18n-node-shim.js scripts/test-global-l13-ta.js
 *
 * Shared checks (scripts/lib/lang-pass.js) + Tamil: Western digits by default, no Devanagari leak,
 * long-text budget for compact labels (Tamil runs long), font + line-height rules.
 */
'use strict';
const { main } = require('./lib/lang-pass');

main({
  lang: 'ta',
  name: 'Tamil',
  script: /[\u0B80-\u0BFF]/,
  banned: [
    [/[\u0900-\u0963\u0966-\u097F]/, 'Devanagari (danda । ॥ excepted)'],
    [/[\u0BE6-\u0BEF]/, 'Tamil digits baked into copy'],
  ],
  terms: { Cancel: 'ரத்து', Save: 'சேமி', Share: 'பகிர்', Delete: 'நீக்கு', Settings: 'அமைப்புகள்', Profile: 'புரொஃபைல்', Send: 'அனுப்பு', Report: 'புகார', Block: 'தடு' },
  searchNative: ['விளையாட்டு', 'நண்பர்', 'செய்தி', 'சதுரங்கம்'],
  searchLatin: ['vilayattu', 'nanbar', 'seithi'],
  extra: async ({ assert, en, pack, enKeys, read, fmtFor }) => {
    const latn = (f) => /^[\d,.\s\u00a0]+$/.test(f.formatNumber(1234));
    assert(latn(fmtFor('ta', 'IN')) && latn(fmtFor('ta', 'LK')) && latn(fmtFor('ta', 'SG')), 'digits: Western 0–9 for ta-IN, ta-LK and ta-SG');
    // Compact labels (≤12 English chars: buttons, tabs, chips) may grow but must stay within 3× + 6 characters.
    const short = enKeys.filter((k) => en[k].length <= 12 && !/\{|</.test(en[k]) && pack[k]);
    const long = short.filter((k) => [...String(pack[k])].length > en[k].length * 3 + 6);
    assert(long.length <= Math.ceil(short.length * 0.02), `long-text budget: compact labels stay ≤3×+6 chars (${long.length}/${short.length} over${long.length ? ': ' + long.slice(0, 4).join(', ') : ''})`);
    const layout = read('public/src/js/core/i18n-layout.js');
    const css = read('public/src/styles/i18n.css');
    assert(/ta: \{ family: 'Noto Sans Tamil'/.test(layout) && /:root:lang\(ta\) \{ --font-script:/.test(css), 'fonts: Noto Sans Tamil lazy-loaded behind system Tamil fonts');
    assert(/:lang\(ta\)[^{]*\) body \{ line-height: 1\.6; \}/.test(css), 'line-height 1.6 for Tamil');
  },
});
