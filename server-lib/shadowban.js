/**
 * Shadow-ban helpers (Admin SDK only).
 * Tiers: none | soft (hidden from discovery) | severe (discovery hide + content create deny).
 * Soft bans decay after DECAY_MS with no new signals.
 */
const SOFT_THRESHOLD = 2;
const SEVERE_THRESHOLD = 5;
const IMMEDIATE_SEVERE = new Set(['harassment', 'impersonation']);
const DECAY_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

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

/**
 * Pure soft-ban decay decision (no Firestore).
 * @returns {{ decayed: false, tier: string, count: number } | { decayed: true, tier: string, count: number }}
 */
function softDecayNext({ tier, count, updatedAtMs, nowMs = Date.now(), decayMs = DECAY_MS } = {}) {
  const n = Math.max(0, Number(count) || 0);
  const t = tier || 'none';
  if (t !== 'soft') return { decayed: false, tier: t, count: n };
  const updated = Number(updatedAtMs) || 0;
  if (!updated || nowMs - updated < decayMs) {
    return { decayed: false, tier: 'soft', count: n };
  }
  const nextCount = Math.max(0, n - 1);
  const nextTier = nextCount >= SOFT_THRESHOLD ? 'soft' : 'none';
  return { decayed: true, tier: nextTier, count: nextCount };
}

function updatedAtMs(data) {
  if (!data) return 0;
  return data.updatedAt?.toMillis?.() || Number(data.updatedAt) || 0;
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
 * Soften soft tier when last signal is older than DECAY_MS.
 * @returns {{ tier, count, decayed }}
 */
async function maybeDecayShadowban(db, admin, uid) {
  if (!uid) return { tier: 'none', count: 0, decayed: false };
  const ref = db.collection('shadowbans').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) return { tier: 'none', count: 0, decayed: false };
  const data = snap.data() || {};
  const decision = softDecayNext({
    tier: data.tier || 'none',
    count: Number(data.count) || 0,
    updatedAtMs: updatedAtMs(data),
  });
  if (!decision.decayed) {
    return { tier: decision.tier, count: decision.count, decayed: false };
  }
  await ref.set(
    {
      count: decision.count,
      tier: decision.tier,
      decayedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  if (decision.tier === 'none') await setDiscoveryHidden(db, uid, false);
  return { tier: decision.tier, count: decision.count, decayed: true };
}

/**
 * Apply a report signal toward shadowban.
 * @returns {{ tier, count, escalated }}
 */
async function applyFlagSignal(db, admin, { reportedUid, reporterUid, reasonCode, chatId }) {
  if (!reportedUid || !reporterUid || reportedUid === reporterUid) {
    return { ok: false, reason: 'invalid' };
  }
  await maybeDecayShadowban(db, admin, reportedUid).catch(() => {});
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
    const { tier, count } = tierAfterBlock({
      prevTier: data.tier || 'none',
      prevCount: Number(data.count) || 0,
    });
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
  tierAfterFlag,
  tierAfterBlock,
  softDecayNext,
  SOFT_THRESHOLD,
  SEVERE_THRESHOLD,
  IMMEDIATE_SEVERE,
  DECAY_MS,
};
