/**
 * Pradhan / Sarpanch membership — paid in Chaupaal Money, 30-day grants.
 * Firestore: users/{uid}/subscription
 */
const { spend } = require('./chaupaal-money');
const { resolvePricingBucket, priceForTier, getVisiblePricing } = require('./pricing-regions');

const SUB_DOC = 'subscription';
const MS_30_DAYS = 30 * 24 * 60 * 60 * 1000;

function subRef(db, uid) {
  return db.collection('users').doc(uid).collection('subscription').doc('active');
}

function getEffectiveTier(status) {
  const s = status || {};
  const tier = String(s.tier || 'free').toLowerCase();
  if (tier === 'free') return 'free';
  const until = s.activeUntil?.toMillis?.() || Number(s.activeUntil) || 0;
  if (until && until > Date.now()) return tier === 'sarpanch' ? 'sarpanch' : tier === 'pradhan' ? 'pradhan' : 'free';
  return 'free';
}

async function getSubscriptionStatus(db, uid, profileType, userDoc) {
  const snap = await subRef(db, uid).get();
  const data = snap.exists ? snap.data() || {} : { tier: 'free' };
  const bucket = resolvePricingBucket(uid, userDoc);
  const pricing = getVisiblePricing(bucket, profileType);
  const effectiveTier = getEffectiveTier(data);
  return {
    tier: effectiveTier,
    storedTier: String(data.tier || 'free'),
    activeUntil: data.activeUntil?.toMillis?.() || null,
    profileTypeAtPurchase: data.profileTypeAtPurchase || null,
    autoRenew: !!data.autoRenew,
    pricing,
  };
}

async function purchaseSubscription(db, admin, uid, tier, profileType, userDoc) {
  const t = String(tier || '').toLowerCase();
  if (t !== 'pradhan' && t !== 'sarpanch') throw new Error('INVALID_TIER');
  const isPro = String(profileType || 'personal').toLowerCase() === 'professional';
  if (isPro && t === 'pradhan') throw new Error('TIER_NOT_AVAILABLE');

  const bucket = resolvePricingBucket(uid, userDoc);
  const price = priceForTier(bucket, t, profileType);
  if (price == null || price <= 0) throw new Error('TIER_NOT_AVAILABLE');

  const refId = `sub_${t}_${Date.now()}`;
  await spend(db, admin, uid, price, `subscription_${t}`, refId);

  const now = Date.now();
  const snap = await subRef(db, uid).get();
  const prev = snap.exists ? snap.data() || {} : {};
  const prevUntil = prev.activeUntil?.toMillis?.() || 0;
  const base = prevUntil > now ? prevUntil : now;
  const activeUntil = admin.firestore.Timestamp.fromMillis(base + MS_30_DAYS);

  await subRef(db, uid).set(
    {
      tier: t,
      activeUntil,
      profileTypeAtPurchase: isPro ? 'professional' : 'personal',
      lastRenewalAt: admin.firestore.FieldValue.serverTimestamp(),
      autoRenew: false,
    },
    { merge: true }
  );

  const status = await getSubscriptionStatus(db, uid, profileType, userDoc);
  return { ...status, charged: price };
}

async function getUserEffectiveTier(db, uid) {
  const snap = await subRef(db, uid).get();
  if (!snap.exists) return 'free';
  return getEffectiveTier(snap.data());
}

module.exports = {
  getSubscriptionStatus,
  purchaseSubscription,
  getEffectiveTier,
  getUserEffectiveTier,
  subRef,
};
