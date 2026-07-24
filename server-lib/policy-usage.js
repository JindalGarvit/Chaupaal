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

const LIMITS = Object.freeze({
  anon: Object.freeze({ perDay: 2, perWeek: 7 }),
  aiDiscoveryMsg: Object.freeze({ perDay: 3, perWeek: 10 }),
});

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
 * @param {string} feature 'anon' | 'aiDiscoveryMsg'
 * @returns {Promise<{ok:boolean, code?:string, dayLeft?:number, weekLeft?:number, perDay?:number, perWeek?:number}>}
 */
async function consumePolicyUsage(admin, uid, feature) {
  const lim = LIMITS[feature];
  if (!lim) return { ok: false, code: 'INVALID_FEATURE' };
  const db = admin.firestore();
  const ref = db.collection('users').doc(uid).collection('policyUsage').doc(feature);
  const today = dayKeyIST();
  const week = weekKeyMondayIST();
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const cur = snap.exists ? snap.data() || {} : {};
      const dayCount = cur.dayKey === today ? Number(cur.dayCount) || 0 : 0;
      const weekCount = cur.weekKey === week ? Number(cur.weekCount) || 0 : 0;
      if (dayCount >= lim.perDay) return { ok: false, code: 'DAILY_LIMIT' };
      if (weekCount >= lim.perWeek) return { ok: false, code: 'WEEKLY_LIMIT' };
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
      return {
        ok: true,
        dayLeft: lim.perDay - dayCount - 1,
        weekLeft: lim.perWeek - weekCount - 1,
        perDay: lim.perDay,
        perWeek: lim.perWeek,
      };
    });
  } catch (e) {
    console.warn('[policy-usage] consume', feature, e?.message || e);
    return { ok: false, code: 'QUOTA_UNAVAILABLE' };
  }
}

module.exports = {
  POLICY_LIMITS: LIMITS,
  dayKeyIST,
  weekKeyMondayIST,
  consumePolicyUsage,
};
