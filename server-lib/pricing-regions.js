/**
 * Regional pricing buckets for Pradhan / Sarpanch (Chaupaal Money per month).
 *
 * Country → bucket (loose mapping; override via users/{uid}.pricingRegion):
 *   developed: US, GB, DE, AU, CA, SG, FR, NL, SE, NO, CH, JP, KR, NZ, IE, AT, BE, DK, FI
 *   developing: IN, PK, BD, NP, LK, PH, ID, VN, TH, MY, MX, BR, ZA, EG, NG, KE
 *   underdeveloped: default for unlisted countries
 *
 * Prices are returned ONLY for the caller's bucket — never expose full table to client.
 */
const DEVELOPED = new Set([
  'US', 'GB', 'DE', 'AU', 'CA', 'SG', 'FR', 'NL', 'SE', 'NO', 'CH', 'JP', 'KR', 'NZ', 'IE', 'AT', 'BE', 'DK', 'FI',
]);
const DEVELOPING = new Set([
  'IN', 'PK', 'BD', 'NP', 'LK', 'PH', 'ID', 'VN', 'TH', 'MY', 'MX', 'BR', 'ZA', 'EG', 'NG', 'KE',
]);

/** CM amounts — 1:1 with local fiat unit in bucket */
const BUCKET_PRICES = Object.freeze({
  developed: { currency: 'USD', symbol: '$', pradhan: 10, sarpanch: 40 },
  developing: { currency: 'INR', symbol: '₹', pradhan: 500, sarpanch: 2000 },
  underdeveloped: { currency: 'INR', symbol: '₹', pradhan: 250, sarpanch: 1000 },
});

function normalizeCountry(raw) {
  const c = String(raw || '')
    .trim()
    .toUpperCase()
    .slice(0, 2);
  return c.length === 2 ? c : '';
}

function bucketFromCountry(country) {
  if (DEVELOPED.has(country)) return 'developed';
  if (DEVELOPING.has(country)) return 'developing';
  if (country) return 'underdeveloped';
  return 'developing';
}

function resolvePricingBucket(_uid, userDoc) {
  const u = userDoc && typeof userDoc === 'object' ? userDoc : {};
  const explicit = String(u.pricingRegion || u.pricingBucket || '').toLowerCase();
  if (explicit === 'developed' || explicit === 'developing' || explicit === 'underdeveloped') {
    return explicit;
  }
  const country = normalizeCountry(
    u.country || u.signupCountry || u.profile?.country || u.profile?.currentCountry
  );
  return bucketFromCountry(country);
}

function getVisiblePricing(bucket, profileType) {
  const b = BUCKET_PRICES[bucket] || BUCKET_PRICES.developing;
  const isPro = String(profileType || 'personal').toLowerCase() === 'professional';
  return {
    bucket: bucket in BUCKET_PRICES ? bucket : 'developing',
    currency: b.currency,
    symbol: b.symbol,
    pradhan: isPro ? null : b.pradhan,
    sarpanch: b.sarpanch,
    cmPerUnit: 1,
  };
}

function priceForTier(bucket, tier, profileType) {
  const visible = getVisiblePricing(bucket, profileType);
  const t = String(tier || '').toLowerCase();
  if (t === 'pradhan') return visible.pradhan;
  if (t === 'sarpanch') return visible.sarpanch;
  return null;
}

module.exports = {
  resolvePricingBucket,
  getVisiblePricing,
  priceForTier,
  BUCKET_PRICES,
};
