/**
 * Shadow-ban helpers (Admin SDK only).
 * Tiers: none | soft (hidden from discovery) | severe (discovery hide + content create deny).
 */
const SOFT_THRESHOLD = 2;
const SEVERE_THRESHOLD = 5;
const IMMEDIATE_SEVERE = new Set(['harassment', 'impersonation']);

/** Pure tier math for a new report (count already includes this signal). */
function tierAfterFlag({ prevTier = 'none', count, reasonCode } = {}) {
  const n = Number(count) || 0;
  let tier = prevTier === 'severe' ? 'severe' : prevTier === 'soft' ? 'soft' : 'none';
  if (IMMEDIATE_SEVERE.has(String(reasonCode || ''))) tier = 'severe';
  else if (n >= SEVERE_THRESHOLD) tier = 'severe';
  else if (n >= SOFT_THRESHOLD) tier = tier === 'severe' ? 'severe' : 'soft';
  return tier;
}

/** Pure tier math for a block signal — at least soft, never downgrades severe. */
function tierAfterBlock({ prevTier = 'none', prevCount = 0 } = {}) {
  const count = Math.max(Number(prevCount) || 0, SOFT_THRESHOLD);
  let tier = prevTier === 'severe' ? 'severe' : 'soft';
  if (count >= SEVERE_THRESHOLD) tier = 'severe';
  return { tier, count };
}

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
 * Apply a report signal toward shadowban.
 * @returns {{ tier, count, escalated }}
 */
async function applyFlagSignal(db, admin, { reportedUid, reporterUid, reasonCode, chatId }) {
  if (!reportedUid || !reporterUid || reportedUid === reporterUid) {
    return { ok: false, reason: 'invalid' };
  }
  const ref = db.collection('shadowbans').doc(reportedUid);
  const now = admin.firestore.FieldValue.serverTimestamp();
  let next = { tier: 'none', count: 0, escalated: false };

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() || {} : {};
    const count = (Number(data.count) || 0) + 1;
    const prevTier = data.tier || 'none';
    const tier = tierAfterFlag({ prevTier, count, reasonCode });
    next = { tier, count, escalated: tier !== prevTier && tier !== 'none' };

    tx.set(
      ref,
      {
        count,
        tier,
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
    next = tierAfterBlock({ prevTier: data.tier || 'none', prevCount: data.count });
    tx.set(
      ref,
      {
        count: next.count,
        tier: next.tier,
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
  tierAfterFlag,
  tierAfterBlock,
  SOFT_THRESHOLD,
  SEVERE_THRESHOLD,
  IMMEDIATE_SEVERE,
};
