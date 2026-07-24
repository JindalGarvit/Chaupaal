/**
 * Policy usage counters (anon posts, AI Discovery messaging).
 * Persists under users/{uid}/policyUsage/{feature} — owner-only.
 *
 * Fail-safe: a broken quota read must NOT look like “full remaining”.
 * Callers treat readFailed / exhausted as block the costly action.
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
      readFailed: false,
    };
  }

  /** Conservative counters when Firestore read fails — treat as at cap. */
  function failSafeState(feature, reason) {
    const lim = limitsFor(feature);
    const P = window.PolicyLimits;
    const today = P ? P.dayKey() : '';
    const week = P ? P.weekKeyMonday() : '';
    return {
      dayKey: today,
      dayCount: lim.perDay,
      weekKey: week,
      weekCount: lim.perWeek,
      readFailed: true,
      readError: String(reason || 'read_failed').slice(0, 160),
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
      readFailed: false,
    };
  }

  async function readUsage(feature) {
    if (!db || !currentUser) {
      // Signed-out / no db — cannot verify; fail closed for gated features
      return failSafeState(feature, 'no_auth');
    }
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
      if (typeof reportClientError === 'function') {
        reportClientError({
          feature: 'policy_usage_read',
          message: `${feature}: ${e?.message || e}`,
          stack: e?.stack || '',
          screen: feature,
        });
      }
      return failSafeState(feature, e?.message || e);
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
    const exhausted = remaining <= 0 || !!u.readFailed;
    let unlock =
      typeof window.PolicyLimits?.unlockMessage === 'function'
        ? window.PolicyLimits.unlockMessage({ dayExhausted, weekExhausted })
        : '';
    if (u.readFailed) {
      unlock = 'Couldn’t verify your limit — try again in a moment.';
    }
    return {
      ...u,
      perDay: lim.perDay,
      perWeek: lim.perWeek,
      dayLeft: u.readFailed ? 0 : dayLeft,
      weekLeft: u.readFailed ? 0 : weekLeft,
      remaining: u.readFailed ? 0 : remaining,
      exhausted,
      dayExhausted: u.readFailed ? true : dayExhausted,
      weekExhausted: u.readFailed ? true : weekExhausted,
      unlock,
    };
  }

  async function consume(feature) {
    if (!db || !currentUser) {
      const err = new Error('Not signed in');
      err.code = 'AUTH_REQUIRED';
      throw err;
    }
    const lim = limitsFor(feature);
    const ref = db
      .collection('users')
      .doc(currentUser.uid)
      .collection('policyUsage')
      .doc(feature);
    const P = window.PolicyLimits;
    const today = P.dayKey();
    const week = P.weekKeyMonday();

    try {
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
    } catch (e) {
      if (e?.code === 'DAILY_LIMIT' || e?.code === 'WEEKLY_LIMIT' || e?.code === 'AUTH_REQUIRED') {
        throw e;
      }
      // Transaction / network failure — fail closed (do not grant a free send)
      if (typeof reportClientError === 'function') {
        reportClientError({
          feature: 'policy_usage_consume',
          message: `${feature}: ${e?.message || e}`,
          stack: e?.stack || '',
          screen: feature,
        });
      }
      const err = new Error('QUOTA_UNAVAILABLE');
      err.code = 'QUOTA_UNAVAILABLE';
      err.cause = e;
      throw err;
    }
    return getRemaining(feature);
  }

  window.PolicyUsage = {
    readUsage,
    getRemaining,
    consume,
    limitsFor,
  };
})();
