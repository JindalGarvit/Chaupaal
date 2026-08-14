/**
 * Web push via FCM. Tokens stored at users/{uid}/fcmTokens/{id} by Admin only.
 * No-op when Cloud Messaging isn't enabled or no tokens exist.
 */
async function saveToken(adminApp, uid, token) {
  const t = String(token || '').trim();
  if (!adminApp || !uid || t.length < 20 || t.length > 4096) return { ok: false };
  const db = adminApp.firestore();
  const id = require('crypto').createHash('sha256').update(t).digest('hex').slice(0, 40);
  await db.collection('users').doc(uid).collection('fcmTokens').doc(id).set(
    {
      token: t,
      updatedAt: adminApp.firestore.FieldValue.serverTimestamp(),
      ua: 'web',
    },
    { merge: true }
  );
  return { ok: true, id };
}

async function deleteToken(adminApp, uid, token) {
  const t = String(token || '').trim();
  if (!adminApp || !uid || !t) return { ok: false };
  const db = adminApp.firestore();
  const id = require('crypto').createHash('sha256').update(t).digest('hex').slice(0, 40);
  await db.collection('users').doc(uid).collection('fcmTokens').doc(id).delete();
  return { ok: true };
}

async function sendToUser(adminApp, uid, payload) {
  if (!adminApp || !uid || !payload) return { sent: 0 };
  let messaging;
  try {
    messaging = adminApp.messaging();
  } catch (e) {
    return { sent: 0, skipped: 'no_messaging' };
  }
  const db = adminApp.firestore();
  const snap = await db.collection('users').doc(uid).collection('fcmTokens').limit(8).get();
  if (snap.empty) return { sent: 0, skipped: 'no_tokens' };
  const tokens = snap.docs.map((d) => d.data()?.token).filter(Boolean);
  if (!tokens.length) return { sent: 0 };
  const title = String(payload.title || 'Chaupaal').slice(0, 80);
  const body = String(payload.body || '').slice(0, 180);
  const data = {};
  data.title = title;
  data.body = body;
  Object.keys(payload.data || {}).forEach((k) => {
    data[String(k).slice(0, 40)] = String(payload.data[k]).slice(0, 180);
  });
  try {
    const res = await messaging.sendEachForMulticast({
      tokens,
      data,
      webpush: {
        fcmOptions: { link: payload.link || '/' },
      },
    });
    const stale = [];
    (res.responses || []).forEach((r, i) => {
      if (!r.success && /registration-token-not-registered|invalid-argument/i.test(String(r.error?.code || r.error))) {
        stale.push(tokens[i]);
      }
    });
    await Promise.all(stale.map((tok) => deleteToken(adminApp, uid, tok).catch(() => {})));
    return { sent: res.successCount || 0 };
  } catch (e) {
    console.warn('[fcm]', e?.message || e);
    return { sent: 0, error: e?.message };
  }
}

module.exports = {
  saveToken,
  deleteToken,
  sendToUser,
  vapidKey: () => String(process.env.FIREBASE_VAPID_KEY || process.env.FCM_VAPID_KEY || '').trim(),
};
