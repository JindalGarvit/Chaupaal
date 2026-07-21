/**
 * Live location shares — expire active docs past expiresAt (Admin SDK).
 */
async function expireLiveLocationShares(db, admin, { limit = 40 } = {}) {
  const now = new Date();
  const snap = await db
    .collection('liveLocationShares')
    .where('active', '==', true)
    .limit(limit)
    .get();

  let expired = 0;
  const batch = db.batch();
  snap.docs.forEach((doc) => {
    const data = doc.data() || {};
    const exp = data.expiresAt?.toDate?.() || (data.expiresAt ? new Date(data.expiresAt) : null);
    if (!exp || exp.getTime() > now.getTime()) return;
    batch.set(
      doc.ref,
      {
        active: false,
        expired: true,
        stoppedAt: admin.firestore.FieldValue.serverTimestamp(),
        stopReason: 'duration_elapsed',
      },
      { merge: true }
    );
    expired++;
  });
  if (expired) await batch.commit();
  return { scanned: snap.size, expired };
}

module.exports = { expireLiveLocationShares };
