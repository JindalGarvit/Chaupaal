/**
 * Server-side policy usage counters (anon posts, AI Discovery messaging).
 *
 * Single write path for users/{uid}/policyUsage/{feature} — Firestore rules
 * make these docs client-read-only, so quotas cannot be reset from a browser
 * console. Limits mirror public/src/js/config/policy-limits.js; change both
 * together (client copy drives UI hints only, this file is enforcement).
 *
 * Period keys use IST (UTC+5:30, no DST) so the reset matches the Indian
 * calendar day / Monday week regardless of serverless region.
 */

const UNLIMITED = 999999;

/** Mirrors public/src/js/config/policy-limits.js TIER_LIMITS — keep in sync. */
const TIER_LIMITS = Object.freeze({
  free: Object.freeze({
    anon: Object.freeze({ perDay: 2, perWeek: 7 }),
    aiDiscoveryMsg: Object.freeze({ perDay: 3, perWeek: 10 }),
    peepalPost: Object.freeze({ perDay: 5, perWeek: 5 }),
    aiKb: Object.freeze({ perDay: 5, perWeek: 35 }),
  }),
  pradhan: Object.freeze({
    anon: Object.freeze({ perDay: 6, perWeek: 21 }),
    aiDiscoveryMsg: Object.freeze({ perDay: 9, perWeek: 30 }),
    peepalPost: Object.freeze({ perDay: 15, perWeek: 15 }),
    aiKb: Object.freeze({ perDay: 15, perWeek: 105 }),
  }),
  sarpanch: Object.freeze({
    anon: Object.freeze({ perDay: UNLIMITED, perWeek: UNLIMITED }),
    aiDiscoveryMsg: Object.freeze({ perDay: UNLIMITED, perWeek: UNLIMITED }),
    peepalPost: Object.freeze({ perDay: UNLIMITED, perWeek: UNLIMITED }),
    aiKb: Object.freeze({ perDay: UNLIMITED, perWeek: UNLIMITED }),
  }),
});

const LIMITS = TIER_LIMITS.free;

function limitsForTier(tier, feature) {
  const t = String(tier || 'free').toLowerCase();
  const bucket = TIER_LIMITS[t] || TIER_LIMITS.free;
  return bucket[feature] || LIMITS[feature];
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function istNow(now = new Date()) {
  return new Date(now.getTime() + IST_OFFSET_MS);
}

/** YYYY-MM-DD for the current IST calendar day. */
function dayKeyIST(now = new Date()) {
  return istNow(now).toISOString().slice(0, 10);
}

/** YYYY-MM-DD of the Monday starting the current IST week. */
function weekKeyMondayIST(now = new Date()) {
  const d = istNow(now);
  const dow = d.getUTCDay(); // 0 Sun … 6 Sat (already shifted to IST)
  const toMon = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d.getTime() + toMon * 24 * 60 * 60 * 1000);
  return monday.toISOString().slice(0, 10);
}

/**
 * Atomically consume one unit of a feature quota for a user.
 * @param {object} admin firebase-admin namespace (from initAdmin())
 * @param {string} uid verified auth uid
 * @param {string} feature 'anon' | 'aiDiscoveryMsg' | 'peepalPost' | 'aiKb'
 * @returns {Promise<{ok:boolean, code?:string, dayLeft?:number, weekLeft?:number, perDay?:number, perWeek?:number}>}
 */
async function consumePolicyUsage(admin, uid, feature) {
  if (!TIER_LIMITS.free[feature]) return { ok: false, code: 'INVALID_FEATURE' };
  const db = admin.firestore();
  let tier = 'free';
  try {
    const { getUserEffectiveTier } = require('./subscription');
    tier = await getUserEffectiveTier(db, uid);
  } catch (e) {
    console.warn('[policy-usage] tier read', e?.message || e);
  }
  const lim = limitsForTier(tier, feature);
  const ref = db.collection('users').doc(uid).collection('policyUsage').doc(feature);
  const today = dayKeyIST();
  const week = weekKeyMondayIST();
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const cur = snap.exists ? snap.data() || {} : {};
      const dayCount = cur.dayKey === today ? Number(cur.dayCount) || 0 : 0;
      const weekCount = cur.weekKey === week ? Number(cur.weekCount) || 0 : 0;
      if (lim.perDay < UNLIMITED && dayCount >= lim.perDay) return { ok: false, code: 'DAILY_LIMIT' };
      if (lim.perWeek < UNLIMITED && weekCount >= lim.perWeek) return { ok: false, code: 'WEEKLY_LIMIT' };
      tx.set(
        ref,
        {
          dayKey: today,
          dayCount: dayCount + 1,
          weekKey: week,
          weekCount: weekCount + 1,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      const dayLeft = lim.perDay >= UNLIMITED ? UNLIMITED : lim.perDay - dayCount - 1;
      const weekLeft = lim.perWeek >= UNLIMITED ? UNLIMITED : lim.perWeek - weekCount - 1;
      return {
        ok: true,
        dayLeft,
        weekLeft,
        perDay: lim.perDay,
        perWeek: lim.perWeek,
        tier,
      };
    });
  } catch (e) {
    console.warn('[policy-usage] consume', feature, e?.message || e);
    return { ok: false, code: 'QUOTA_UNAVAILABLE' };
  }
}

module.exports = {
  POLICY_LIMITS: LIMITS,
  TIER_LIMITS,
  limitsForTier,
  dayKeyIST,
  weekKeyMondayIST,
  consumePolicyUsage,
};
