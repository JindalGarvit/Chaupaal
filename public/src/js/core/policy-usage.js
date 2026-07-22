/**
 * Policy usage counters (anon posts, AI Discovery messaging).
 * Persists under users/{uid}/policyUsage/{feature} — owner-only.
 */
(function () {
  'use strict';

  function limitsFor(feature) {
    const P = window.PolicyLimits;
    if (!P) return { perDay: 0, perWeek: 0 };
    if (feature === 'anon') return P.ANON_POSTS;
    if (feature === 'aiDiscoveryMsg') return P.AI_DISCOVERY_MSG;
    return { perDay: 0, perWeek: 0 };
  }

  function emptyState() {
    const P = window.PolicyLimits;
    return {
      dayKey: P ? P.dayKey() : '',
      dayCount: 0,
      weekKey: P ? P.weekKeyMonday() : '',
      weekCount: 0,
    };
  }

  function normalize(raw) {
    const P = window.PolicyLimits;
    const base = emptyState();
    if (!raw || typeof raw !== 'object') return base;
    const today = P ? P.dayKey() : '';
    const week = P ? P.weekKeyMonday() : '';
    return {
      dayKey: raw.dayKey === today ? today : today,
      dayCount: raw.dayKey === today ? Number(raw.dayCount) || 0 : 0,
      weekKey: raw.weekKey === week ? week : week,
      weekCount: raw.weekKey === week ? Number(raw.weekCount) || 0 : 0,
    };
  }

  async function readUsage(feature) {
    if (!db || !currentUser) return emptyState();
    try {
      const snap = await db
        .collection('users')
        .doc(currentUser.uid)
        .collection('policyUsage')
        .doc(feature)
        .get();
      return normalize(snap.exists ? snap.data() : null);
    } catch (e) {
      console.warn('[policy-usage] read', e?.message || e);
      return emptyState();
    }
  }

  async function getRemaining(feature) {
    const lim = limitsFor(feature);
    const u = await readUsage(feature);
    const dayLeft = Math.max(0, lim.perDay - u.dayCount);
    const weekLeft = Math.max(0, lim.perWeek - u.weekCount);
    const remaining = Math.min(dayLeft, weekLeft);
    const dayExhausted = dayLeft <= 0;
    const weekExhausted = weekLeft <= 0;
    const exhausted = remaining <= 0;
    const unlock =
      typeof window.PolicyLimits?.unlockMessage === 'function'
        ? window.PolicyLimits.unlockMessage({ dayExhausted, weekExhausted })
        : '';
    return {
      ...u,
      perDay: lim.perDay,
      perWeek: lim.perWeek,
      dayLeft,
      weekLeft,
      remaining,
      exhausted,
      dayExhausted,
      weekExhausted,
      unlock,
    };
  }

  async function consume(feature) {
    if (!db || !currentUser) throw new Error('Not signed in');
    const lim = limitsFor(feature);
    const ref = db
      .collection('users')
      .doc(currentUser.uid)
      .collection('policyUsage')
      .doc(feature);
    const P = window.PolicyLimits;
    const today = P.dayKey();
    const week = P.weekKeyMonday();

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const cur = normalize(snap.exists ? snap.data() : null);
      if (cur.dayCount >= lim.perDay) {
        const err = new Error('DAILY_LIMIT');
        err.code = 'DAILY_LIMIT';
        throw err;
      }
      if (cur.weekCount >= lim.perWeek) {
        const err = new Error('WEEKLY_LIMIT');
        err.code = 'WEEKLY_LIMIT';
        throw err;
      }
      tx.set(
        ref,
        {
          dayKey: today,
          dayCount: cur.dayCount + 1,
          weekKey: week,
          weekCount: cur.weekCount + 1,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });
    return getRemaining(feature);
  }

  window.PolicyUsage = {
    readUsage,
    getRemaining,
    consume,
    limitsFor,
  };
})();
