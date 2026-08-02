/**
 * Shadow-ban helpers (Admin SDK only).
 * Tiers: none | soft (hidden from discovery) | severe (discovery hide + content create deny).
 * Soft bans decay after DECAY_MS with no new signals.
 *
 * Trust model: client-supplied reason codes must never jump a target to severe.
 * Each reporterUid contributes at most one count toward thresholds (deduped).
 */
const SOFT_THRESHOLD = 2;
const SEVERE_THRESHOLD = 5;
/** Serious report codes floor at soft (like a block), never skip to severe. */
const SOFT_FLOOR_REASONS = new Set(['harassment', 'impersonation']);
const DECAY_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

async function setDiscoveryHidden(db, uid, hidden) {
  if (!uid) return;
  const pub = { hiddenFromDiscovery: !!hidden };
  if (hidden) pub.openToMeet = false;
  await db.collection('users_public').doc(uid).set(pub, { merge: true }).catch(() => {});
  if (hidden) {
    await db.collection('users').doc(uid).set({ openToMeet: false }, { merge: true }).catch(() => {});
  }
}

/**
 * Pure tier math — exported for unit tests.
 * @returns {{ count: number, tier: string }}
 */
function nextShadowbanState({ prevCount = 0, prevTier = 'none', reasonCode = 'custom', alreadyCounted = false }) {
  if (alreadyCounted) {
    return {
      count: Math.max(0, Number(prevCount) || 0),
      tier: prevTier === 'severe' ? 'severe' : prevTier === 'soft' ? 'soft' : 'none',
    };
  }
  let count = (Number(prevCount) || 0) + 1;
  if (SOFT_FLOOR_REASONS.has(String(reasonCode || ''))) {
    count = Math.max(count, SOFT_THRESHOLD);
  }
  let tier = prevTier === 'severe' ? 'severe' : prevTier === 'soft' ? 'soft' : 'none';
  if (count >= SEVERE_THRESHOLD) tier = 'severe';
  else if (count >= SOFT_THRESHOLD) tier = tier === 'severe' ? 'severe' : 'soft';
  return { count, tier };
}

/**
 * Soften soft tier when last signal is older than DECAY_MS.
 * @returns {{ tier, count, decayed }}
 */
async function maybeDecayShadowban(db, admin, uid) {
  if (!uid) return { tier: 'none', count: 0, decayed: false };
  const ref = db.collection('shadowbans').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) return { tier: 'none', count: 0, decayed: false };
  const data = snap.data() || {};
  if (data.tier !== 'soft') return { tier: data.tier || 'none', count: Number(data.count) || 0, decayed: false };
  const updated = data.updatedAt?.toMillis?.() || data.updatedAt || 0;
  if (!updated || Date.now() - updated < DECAY_MS) {
    return { tier: 'soft', count: Number(data.count) || 0, decayed: false };
  }
  const count = Math.max(0, (Number(data.count) || 0) - 1);
  const tier = count >= SOFT_THRESHOLD ? 'soft' : 'none';
  await ref.set(
    {
      count,
      tier,
      decayedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  if (tier === 'none') await setDiscoveryHidden(db, uid, false);
  return { tier, count, decayed: true };
}

/**
 * Apply a report signal toward shadowban.
 * Same reporterUid never increments count twice for the same reportedUid.
 * @returns {{ ok, tier, count, escalated, duplicate? }}
 */
async function applyFlagSignal(db, admin, { reportedUid, reporterUid, reasonCode, chatId }) {
  if (!reportedUid || !reporterUid || reportedUid === reporterUid) {
    return { ok: false, reason: 'invalid' };
  }
  await maybeDecayShadowban(db, admin, reportedUid).catch(() => {});
  const ref = db.collection('shadowbans').doc(reportedUid);
  const reporterRef = ref.collection('reporters').doc(reporterUid);
  const now = admin.firestore.FieldValue.serverTimestamp();
  let next = { tier: 'none', count: 0, escalated: false, duplicate: false };

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const reporterSnap = await tx.get(reporterRef);
    const data = snap.exists ? snap.data() || {} : {};
    const prevTier = data.tier || 'none';
    const alreadyCounted = reporterSnap.exists;

    const state = nextShadowbanState({
      prevCount: Number(data.count) || 0,
      prevTier,
      reasonCode,
      alreadyCounted,
    });

    next = {
      tier: state.tier,
      count: state.count,
      escalated: !alreadyCounted && state.tier !== prevTier && state.tier !== 'none',
      duplicate: alreadyCounted,
    };

    if (alreadyCounted) {
      // Refresh last-* metadata for moderation, but do not bump count/tier.
      tx.set(
        ref,
        {
          lastReasonCode: String(reasonCode || 'custom').slice(0, 40),
          lastReporterUid: reporterUid,
          lastChatId: chatId ? String(chatId).slice(0, 80) : null,
          updatedAt: now,
        },
        { merge: true }
      );
      return;
    }

    tx.set(
      reporterRef,
      {
        reasonCode: String(reasonCode || 'custom').slice(0, 40),
        chatId: chatId ? String(chatId).slice(0, 80) : null,
        createdAt: now,
      },
      { merge: true }
    );

    tx.set(
      ref,
      {
        count: state.count,
        tier: state.tier,
        lastReasonCode: String(reasonCode || 'custom').slice(0, 40),
        lastReporterUid: reporterUid,
        lastChatId: chatId ? String(chatId).slice(0, 80) : null,
        updatedAt: now,
        createdAt: data.createdAt || now,
        reviewedAt: null,
      },
      { merge: true }
    );
  });

  if (next.tier === 'soft' || next.tier === 'severe') {
    await setDiscoveryHidden(db, reportedUid, true);
  }
  return { ok: true, ...next };
}

/** Block is a strong trust signal — bump toward soft at minimum. */
async function applyBlockSignal(db, admin, { blockedUid, blockerUid }) {
  if (!blockedUid || !blockerUid || blockedUid === blockerUid) {
    return { ok: false, reason: 'invalid' };
  }
  const ref = db.collection('shadowbans').doc(blockedUid);
  const now = admin.firestore.FieldValue.serverTimestamp();
  let next = { tier: 'soft', count: 0 };

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() || {} : {};
    const count = Math.max(Number(data.count) || 0, SOFT_THRESHOLD);
    let tier = data.tier === 'severe' ? 'severe' : 'soft';
    if (count >= SEVERE_THRESHOLD) tier = 'severe';
    next = { tier, count };
    tx.set(
      ref,
      {
        count,
        tier,
        lastReasonCode: 'block',
        lastReporterUid: blockerUid,
        updatedAt: now,
        createdAt: data.createdAt || now,
        blockSignals: admin.firestore.FieldValue.increment(1),
      },
      { merge: true }
    );
  });

  await setDiscoveryHidden(db, blockedUid, true);
  return { ok: true, ...next };
}

module.exports = {
  applyFlagSignal,
  applyBlockSignal,
  setDiscoveryHidden,
  maybeDecayShadowban,
  nextShadowbanState,
  SOFT_THRESHOLD,
  SEVERE_THRESHOLD,
  SOFT_FLOOR_REASONS,
  DECAY_MS,
};
