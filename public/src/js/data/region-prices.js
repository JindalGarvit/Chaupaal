/**
 * Premium display prices by region (Global L9) — DISPLAY ONLY. What is charged is unchanged:
 * Chaupaal Money per bucket (server-lib/pricing-regions.js). Local amounts are rounded store-style
 * equivalents of the bucket price, formatted with the L1 helper (ChaupaalFormat.formatCurrency).
 * Inside an app-store wrapper, the store's own localised price (window.ChaupaalStore.localizedPrice)
 * always wins — store price tiers / taxes are the source of truth there.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ChaupaalPricing = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Mirrors server-lib/pricing-regions.js BUCKET_PRICES (CM per month). */
  const BUCKETS = {
    developed: { pradhan: 10, sarpanch: 40 },
    developing: { pradhan: 500, sarpanch: 2000 },
    underdeveloped: { pradhan: 250, sarpanch: 1000 },
  };
  const DEVELOPED = 'US GB DE AU CA SG FR NL SE NO CH JP KR NZ IE AT BE DK FI'.split(' ');
  const DEVELOPING = 'IN PK BD NP LK PH ID VN TH MY MX BR ZA EG NG KE'.split(' ');

  // country → [currency, pradhan, sarpanch] (local display amounts per month)
  const LOCAL = {
    US: ['USD', 9.99, 39.99],
    CA: ['CAD', 12.99, 52.99],
    GB: ['GBP', 7.99, 31.99],
    IE: ['EUR', 9.99, 39.99],
    DE: ['EUR', 9.99, 39.99],
    FR: ['EUR', 9.99, 39.99],
    NL: ['EUR', 9.99, 39.99],
    AT: ['EUR', 9.99, 39.99],
    BE: ['EUR', 9.99, 39.99],
    FI: ['EUR', 9.99, 39.99],
    SE: ['SEK', 109, 429],
    NO: ['NOK', 109, 429],
    DK: ['DKK', 75, 299],
    CH: ['CHF', 9.9, 39],
    AU: ['AUD', 14.99, 59.99],
    NZ: ['NZD', 16.99, 64.99],
    SG: ['SGD', 13.98, 54.98],
    JP: ['JPY', 1500, 6000],
    KR: ['KRW', 14000, 55000],
    IN: ['INR', 499, 1999],
    PK: ['PKR', 1450, 5800],
    BD: ['BDT', 600, 2400],
    NP: ['NPR', 650, 2650],
    LK: ['LKR', 1500, 6000],
    PH: ['PHP', 290, 1150],
    ID: ['IDR', 89000, 349000],
    VN: ['VND', 129000, 499000],
    TH: ['THB', 179, 699],
    MY: ['MYR', 23.9, 94.9],
    MX: ['MXN', 109, 429],
    BR: ['BRL', 29.9, 119.9],
    ZA: ['ZAR', 109, 429],
    EG: ['EGP', 299, 1199],
    NG: ['NGN', 7900, 31900],
    KE: ['KES', 790, 3150],
  };

  function bucketOf(country) {
    const c = String(country || '').toUpperCase();
    if (DEVELOPED.indexOf(c) >= 0) return 'developed';
    if (DEVELOPING.indexOf(c) >= 0) return 'developing';
    return c ? 'underdeveloped' : 'developing';
  }

  /** { currency, amount, cm, source: 'store' | 'table' | 'cm' } for a tier in a country. */
  function priceFor(tier, country, opts) {
    const o = opts || {};
    const t = tier === 'sarpanch' ? 'sarpanch' : 'pradhan';
    const cm = BUCKETS[bucketOf(country)][t];
    const store = o.store !== undefined ? o.store : typeof window !== 'undefined' && window.ChaupaalStore && typeof window.ChaupaalStore.localizedPrice === 'function' ? window.ChaupaalStore.localizedPrice('chaupaal.' + t + '.monthly') : null;
    if (store && store.formatted) return { formatted: store.formatted, currency: store.currency || null, amount: store.amount || null, cm, source: 'store' };
    const row = LOCAL[String(country || '').toUpperCase()];
    if (!row) return { currency: null, amount: null, cm, source: 'cm' };
    return { currency: row[0], amount: t === 'pradhan' ? row[1] : row[2], cm, source: 'table' };
  }

  /** Display string; formatter defaults to ChaupaalFormat.formatCurrency (locale + region aware). */
  function display(tier, country, opts) {
    const o = opts || {};
    const p = priceFor(tier, country, o);
    if (p.source === 'store') return p.formatted;
    if (p.source === 'cm') return null;
    const f = o.format || (typeof ChaupaalFormat !== 'undefined' && ChaupaalFormat.formatCurrency) || ((n, c) => c + ' ' + n);
    return f(p.amount, p.currency);
  }

  return { BUCKETS, LOCAL, bucketOf, priceFor, display };
});
