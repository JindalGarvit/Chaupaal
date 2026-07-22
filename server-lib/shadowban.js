/**
 * Shadow-ban helpers (Admin SDK only).
 * Tiers: none | soft (hidden from discovery) | severe (discovery hide + content create deny).
 */
const SOFT_THRESHOLD = 2;
const SEVERE_THRESHOLD = 5;
const IMMEDIATE_SEVERE = new Set(['harassment', 'impersonation']);

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
    let tier = data.tier === 'severe' ? 'severe' : data.tier === 'soft' ? 'soft' : 'none';
    if (IMMEDIATE_SEVERE.has(String(reasonCode || ''))) tier = 'severe';
    else if (count >= SEVERE_THRESHOLD) tier = 'severe';
    else if (count >= SOFT_THRESHOLD) tier = tier === 'severe' ? 'severe' : 'soft';

    const prevTier = data.tier || 'none';
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
  SOFT_THRESHOLD,
  SEVERE_THRESHOLD,
};
