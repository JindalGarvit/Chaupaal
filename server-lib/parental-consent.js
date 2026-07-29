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

/** SHA-256(otp + childUid) — pure for verify tests. */
function hashConsentOtp(otp, childUid) {
  return crypto.createHash('sha256').update(String(otp) + String(childUid)).digest('hex');
}

/**
 * Parent age gate: age 1–17 rejected; missing/0 age allowed (legacy adults).
 * @returns {'ok'|'PARENT_NOT_ADULT'}
 */
function parentAgeStatus(age) {
  const n = Number(age) || 0;
  if (n > 0 && n < 18) return 'PARENT_NOT_ADULT';
  return 'ok';
}

/** Phone index doc ids to try for a cleaned contact. */
function phoneIndexCandidates(cleaned) {
  const c = String(cleaned || '');
  const phoneKey = c.replace(/\D/g, '');
  if (phoneKey.length < 10) return [];
  return [c, '+' + phoneKey, '+91' + phoneKey.slice(-10)];
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
      if (parentAgeStatus(snap.data()?.age) === 'PARENT_NOT_ADULT') {
        return { error: 'PARENT_NOT_ADULT' };
      }
      return { uid: user.uid, email: c, phone: snap.data()?.phone || null };
    } catch (e) {
      return null;
    }
  }

  // Phone / username via indexes if present
  const variants = phoneIndexCandidates(c);
  for (const v of variants) {
    const idx = await db.collection('phone_index').doc(v).get().catch(() => null);
    if (idx?.exists) {
      const uid = idx.data()?.uid;
      if (!uid) continue;
      const snap = await db.collection('users').doc(uid).get();
      if (!snap.exists) continue;
      if (parentAgeStatus(snap.data()?.age) === 'PARENT_NOT_ADULT') {
        return { error: 'PARENT_NOT_ADULT' };
      }
      return { uid, phone: v, email: snap.data()?.email || null };
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
  const hash = hashConsentOtp(otp, childUid);
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

  // Soft deliver: store for parent inbox notification + return demo OTP only in non-prod
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

  return {
    ok: true,
    needParentSignup: false,
    // Surface OTP in API only when explicitly allowed (local/dev). Production relies on parent notif.
    otp: process.env.PARENTAL_CONSENT_RETURN_OTP === '1' ? otp : undefined,
  };
}

/**
 * Pure pending-OTP check (no Firestore write).
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
function evaluatePendingOtp({ pending, childUid, otp, nowMs = Date.now() }) {
  if (!childUid || otp == null || otp === '') return { ok: false, error: 'MISSING' };
  if (!pending?.otpHash) return { ok: false, error: 'NO_PENDING' };
  if (pending.expiresAt && nowMs > pending.expiresAt) {
    return { ok: false, error: 'EXPIRED' };
  }
  const hash = hashConsentOtp(otp, childUid);
  if (hash !== pending.otpHash) return { ok: false, error: 'INVALID_OTP' };
  return { ok: true };
}

async function verifyParentalConsent(adminApp, childUid, otp) {
  if (!adminApp || !childUid || !otp) return { ok: false, error: 'MISSING' };
  const db = adminApp.firestore();
  const snap = await db.collection('users').doc(childUid).get();
  if (!snap.exists) return { ok: false, error: 'USER_NOT_FOUND' };
  const pending = snap.data()?.parentalConsentPending;
  const check = evaluatePendingOtp({ pending, childUid, otp });
  if (!check.ok) return check;

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
  cleanContact,
  hashConsentOtp,
  parentAgeStatus,
  phoneIndexCandidates,
  evaluatePendingOtp,
};
