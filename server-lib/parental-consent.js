/**
 * Parental consent for 13–17 accounts (Admin SDK).
 * Parent contact must resolve to an existing adult Chaupaal user.
 */
'use strict';

const crypto = require('crypto');

function cleanContact(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .slice(0, 180);
}

function makeOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function resolveAdultByContact(adminApp, contact) {
  const db = adminApp.firestore();
  const c = cleanContact(contact);
  if (!c) return null;

  // Email path
  if (c.includes('@')) {
    try {
      const user = await adminApp.auth().getUserByEmail(c);
      if (!user?.uid) return null;
      const snap = await db.collection('users').doc(user.uid).get();
      if (!snap.exists) return null;
      const age = Number(snap.data()?.age) || 0;
      if (age > 0 && age < 18) return { error: 'PARENT_NOT_ADULT' };
      return { uid: user.uid, email: c, phone: snap.data()?.phone || null };
    } catch (e) {
      return null;
    }
  }

  // Phone / username via indexes if present (client writes phoneIndex / phoneHashIndex)
  const phoneKey = c.replace(/\D/g, '');
  if (phoneKey.length >= 10) {
    const variants = [
      c,
      '+' + phoneKey,
      '+91' + phoneKey.slice(-10),
      phoneKey.length === 10 ? '+91' + phoneKey : null,
    ].filter(Boolean);
    for (const v of variants) {
      for (const col of ['phoneIndex', 'phone_index']) {
        const idx = await db.collection(col).doc(v).get().catch(() => null);
        if (idx?.exists) {
          const uid = idx.data()?.uid;
          if (!uid) continue;
          const snap = await db.collection('users').doc(uid).get();
          if (!snap.exists) continue;
          const age = Number(snap.data()?.age) || 0;
          if (age > 0 && age < 18) return { error: 'PARENT_NOT_ADULT' };
          return { uid, phone: v, email: snap.data()?.email || null };
        }
      }
    }
  }
  return null;
}

async function startParentalConsent(adminApp, childUid, contact) {
  if (!adminApp || !childUid) return { ok: false, error: 'MISSING' };
  const parent = await resolveAdultByContact(adminApp, contact);
  if (parent?.error === 'PARENT_NOT_ADULT') {
    return { ok: false, error: 'PARENT_NOT_ADULT', needParentSignup: true };
  }
  if (!parent?.uid) {
    return { ok: false, error: 'PARENT_NOT_FOUND', needParentSignup: true };
  }
  if (parent.uid === childUid) {
    return { ok: false, error: 'SELF_PARENT' };
  }

  const otp = makeOtp();
  const hash = crypto.createHash('sha256').update(otp + childUid).digest('hex');
  const db = adminApp.firestore();
  await db
    .collection('users')
    .doc(childUid)
    .set(
      {
        parentalConsentPending: {
          parentUid: parent.uid,
          parentContact: cleanContact(contact),
          otpHash: hash,
          createdAt: Date.now(),
          expiresAt: Date.now() + 15 * 60 * 1000,
        },
      },
      { merge: true }
    );

  // Soft deliver: parent Chaupaal notification inbox (not SMS).
  // Optional: return OTP in API when PARENTAL_CONSENT_RETURN_OTP=1 or non-production.
  try {
    const { upsertNotification, resolveActor } = require('./notifications');
    const actor = await resolveActor(adminApp, childUid);
    await upsertNotification(adminApp, parent.uid, {
      type: 'parental_consent',
      refId: childUid,
      actor,
      preview: `Consent code ${otp} for a teen account`,
      deepLink: { uid: childUid },
    });
  } catch (e) {
    console.warn('[parental-consent] notif', e?.message || e);
  }

  const returnOtp =
    process.env.PARENTAL_CONSENT_RETURN_OTP === '1' ||
    process.env.NODE_ENV === 'development' ||
    process.env.VERCEL_ENV === 'development' ||
    process.env.VERCEL_ENV === 'preview';

  return {
    ok: true,
    needParentSignup: false,
    delivery: 'parent_notification',
    // Surface OTP in API only when explicitly allowed (local/dev/preview).
    otp: returnOtp ? otp : undefined,
  };
}

async function verifyParentalConsent(adminApp, childUid, otp) {
  if (!adminApp || !childUid || !otp) return { ok: false, error: 'MISSING' };
  const db = adminApp.firestore();
  const snap = await db.collection('users').doc(childUid).get();
  if (!snap.exists) return { ok: false, error: 'USER_NOT_FOUND' };
  const pending = snap.data()?.parentalConsentPending;
  if (!pending?.otpHash) return { ok: false, error: 'NO_PENDING' };
  if (pending.expiresAt && Date.now() > pending.expiresAt) {
    return { ok: false, error: 'EXPIRED' };
  }
  const hash = crypto.createHash('sha256').update(String(otp) + childUid).digest('hex');
  if (hash !== pending.otpHash) return { ok: false, error: 'INVALID_OTP' };

  const consent = {
    verified: true,
    required: true,
    method: 'otp',
    parentUid: pending.parentUid,
    parentContact: pending.parentContact,
    verifiedAt: Date.now(),
    deviceId: null,
  };
  await db
    .collection('users')
    .doc(childUid)
    .set(
      {
        parentalConsent: consent,
        parentalConsentPending: adminApp.firestore.FieldValue.delete(),
        teenMode: true,
        isMinor: true,
      },
      { merge: true }
    );
  return { ok: true, parentalConsent: consent };
}

module.exports = {
  startParentalConsent,
  verifyParentalConsent,
  resolveAdultByContact,
};
