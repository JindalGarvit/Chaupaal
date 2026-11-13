/**
 * Verifiable parental consent (Phase 2 → Global L8). Admin SDK; folded into api/media-config.
 *
 * Who needs it: below the region's digital consent age where its law asks for a parent
 * (data/consent-ages.js: India DPDP 18; EU/EEA consent basis 13–16; default 16).
 * Until verified: Teen mode + every consent-dependent purpose off. Verifying does NOT lift Teen
 * mode — only the 18th birthday does.
 *
 * Delivery of the one-time code to the parent:
 *   - parent email (any address): email via Resend when RESEND_API_KEY is set, plus an in-app
 *     notification when that email belongs to an adult Chaupaal account;
 *   - parent phone: only when it belongs to an adult Chaupaal account (no SMS provider) → in-app.
 * The child types the code the parent gives them. Every verified consent is recorded in
 * parentalConsents/{id} (who, how, when, under which policy / region / consent age).
 */
'use strict';

const crypto = require('crypto');
const Compliance = require('../public/src/js/core/compliance.js');

const CODE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SENDS_PER_DAY = 5;
const MAX_VERIFY_ATTEMPTS = 5;

function cleanContact(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .slice(0, 180);
}

function isEmail(c) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c);
}

function maskContact(c) {
  if (isEmail(c)) {
    const [u, d] = c.split('@');
    return (u.slice(0, 1) || '*') + '***@' + d;
  }
  const digits = c.replace(/\D/g, '');
  return digits.length > 4 ? '***' + digits.slice(-4) : '***';
}

function hashContact(c) {
  return crypto.createHash('sha256').update('pc:' + c).digest('hex');
}

function makeOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function otpHash(otp, childUid) {
  return crypto.createHash('sha256').update(String(otp) + childUid).digest('hex');
}

async function resolveAdultByContact(adminApp, contact) {
  const db = adminApp.firestore();
  const c = cleanContact(contact);
  if (!c) return null;
  const adultCheck = async (uid) => {
    const snap = await db.collection('users').doc(uid).get();
    if (!snap.exists) return null;
    const info = Compliance.ageInfo(snap.data() || {});
    if (info.teen || info.blocked) return { error: 'PARENT_NOT_ADULT' };
    return { uid, email: snap.data()?.email || null, phone: snap.data()?.phone || null };
  };
  if (isEmail(c)) {
    try {
      const user = await adminApp.auth().getUserByEmail(c);
      if (user?.uid) return adultCheck(user.uid);
    } catch (e) {}
    return null;
  }
  const digits = c.replace(/\D/g, '');
  if (digits.length >= 8) {
    const variants = [c, '+' + digits];
    for (const v of variants) {
      for (const col of ['phoneIndex', 'phone_index']) {
        const idx = await db.collection(col).doc(v).get().catch(() => null);
        if (idx?.exists && idx.data()?.uid) return adultCheck(idx.data().uid);
      }
    }
  }
  return null;
}

async function sendConsentEmail(to, otp, childName) {
  const key = process.env.RESEND_API_KEY || process.env.FEEDBACK_EMAIL_API_KEY;
  if (!key || typeof fetch !== 'function') return { sent: false, reason: 'no_mailer' };
  const name = String(childName || 'Your child').slice(0, 60);
  const text = [
    `${name} is setting up a Chaupaal account and asked you, as their parent or guardian, to approve it.`,
    '',
    `If you agree, give them this code to type into the app: ${otp}`,
    '',
    'The code works for 24 hours. Approving lets Chaupaal use optional features that need consent',
    '(personalised recommendations, AI features, analytics) for their account. Teen protections stay on',
    'until they turn 18: no 18+ features, messages only from friends, private profile by default.',
    '',
    'If you did not expect this email, you can ignore it — nothing changes without the code.',
    'Questions: reply to this email or see the Children & Teens notice in the app (Settings → Privacy & data).',
  ].join('\n');
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.PARENTAL_CONSENT_EMAIL_FROM || process.env.FEEDBACK_EMAIL_FROM || 'Chaupaal <onboarding@resend.dev>',
        to: [to],
        subject: 'Approve your child’s Chaupaal account',
        text,
      }),
    });
    return { sent: res.ok, reason: res.ok ? null : 'http_' + res.status };
  } catch (e) {
    return { sent: false, reason: 'error' };
  }
}

function returnOtpAllowed() {
  return (
    process.env.PARENTAL_CONSENT_RETURN_OTP === '1' ||
    process.env.NODE_ENV === 'development' ||
    process.env.VERCEL_ENV === 'development' ||
    process.env.VERCEL_ENV === 'preview'
  );
}

/**
 * @param {*} adminApp
 * @param {string} childUid
 * @param {string} contact  parent email or phone
 * @param {{ deps?: { sendEmail?, notify? } }} [opts]
 */
async function startParentalConsent(adminApp, childUid, contact, opts) {
  const o = opts || {};
  if (!adminApp || !childUid) return { ok: false, error: 'MISSING' };
  const db = adminApp.firestore();
  const childSnap = await db.collection('users').doc(childUid).get();
  const child = childSnap.exists ? childSnap.data() || {} : {};
  const info = Compliance.ageInfo(child);
  if (!info.needsParentalConsent) return { ok: false, error: 'NOT_REQUIRED' };

  const c = cleanContact(contact);
  if (!c || (!isEmail(c) && c.replace(/\D/g, '').length < 8)) return { ok: false, error: 'INVALID_CONTACT' };
  const own = [child.email, child.phone].map(cleanContact).filter(Boolean);
  if (own.indexOf(c) >= 0) return { ok: false, error: 'SELF_PARENT' };

  const prev = child.parentalConsentPending || {};
  const day = new Date().toISOString().slice(0, 10);
  const sends = prev.day === day ? Number(prev.sends) || 0 : 0;
  if (sends >= MAX_SENDS_PER_DAY) return { ok: false, error: 'RATE_LIMITED' };

  const parent = await resolveAdultByContact(adminApp, c);
  if (parent?.error === 'PARENT_NOT_ADULT') return { ok: false, error: 'PARENT_NOT_ADULT' };
  if (parent?.uid === childUid) return { ok: false, error: 'SELF_PARENT' };
  if (!isEmail(c) && !parent?.uid) return { ok: false, error: 'PARENT_PHONE_UNSUPPORTED', needEmail: true };

  const otp = makeOtp();
  const delivery = [];
  if (isEmail(c)) {
    const sendEmail = (o.deps && o.deps.sendEmail) || sendConsentEmail;
    const r = await sendEmail(c, otp, child.name || child.profile?.displayName);
    if (r && r.sent) delivery.push('email');
  }
  if (parent?.uid) {
    try {
      const notify =
        (o.deps && o.deps.notify) ||
        (async (uid, payload) => {
          const { upsertNotification, resolveActor } = require('./notifications');
          const actor = await resolveActor(adminApp, childUid);
          return upsertNotification(adminApp, uid, { ...payload, actor });
        });
      await notify(parent.uid, {
        type: 'parental_consent',
        refId: childUid,
        previewKey: 'notifications.push.parental_consent',
        previewParams: { otp },
        deepLink: { uid: childUid },
      });
      delivery.push('notification');
    } catch (e) {
      console.warn('[parental-consent] notif', e?.message || e);
    }
  }
  const devOtp = returnOtpAllowed();
  if (!delivery.length && !devOtp) return { ok: false, error: 'DELIVERY_UNAVAILABLE' };

  await db
    .collection('users')
    .doc(childUid)
    .set(
      {
        parentalConsentPending: {
          parentUid: parent?.uid || null,
          contactHash: hashContact(c),
          contactMasked: maskContact(c),
          method: isEmail(c) ? 'email_otp' : 'account_otp',
          otpHash: otpHash(otp, childUid),
          createdAt: Date.now(),
          expiresAt: Date.now() + CODE_TTL_MS,
          attempts: 0,
          day,
          sends: sends + 1,
        },
      },
      { merge: true }
    );

  return {
    ok: true,
    delivery: delivery.length ? delivery : ['dev'],
    sentTo: maskContact(c),
    otp: devOtp ? otp : undefined,
  };
}

async function verifyParentalConsent(adminApp, childUid, otp) {
  if (!adminApp || !childUid || !otp) return { ok: false, error: 'MISSING' };
  const db = adminApp.firestore();
  const ref = db.collection('users').doc(childUid);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: 'USER_NOT_FOUND' };
  const child = snap.data() || {};
  const pending = child.parentalConsentPending;
  if (!pending?.otpHash) return { ok: false, error: 'NO_PENDING' };
  if (pending.expiresAt && Date.now() > pending.expiresAt) return { ok: false, error: 'EXPIRED' };
  if ((Number(pending.attempts) || 0) >= MAX_VERIFY_ATTEMPTS) return { ok: false, error: 'TOO_MANY_ATTEMPTS' };
  const a = Buffer.from(otpHash(String(otp).replace(/\D/g, ''), childUid));
  const b = Buffer.from(String(pending.otpHash));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    await ref.set({ parentalConsentPending: { attempts: (Number(pending.attempts) || 0) + 1 } }, { merge: true });
    return { ok: false, error: 'INVALID_OTP' };
  }

  const info = Compliance.ageInfo(child);
  const nowMs = Date.now();
  const record = {
    childUid,
    parentUid: pending.parentUid || null,
    contactHash: pending.contactHash || null,
    contactMasked: pending.contactMasked || null,
    method: pending.method || 'email_otp',
    verifiedAtMs: nowMs,
    policyVersion: Compliance.POLICY_VERSION,
    termsVersion: Compliance.TERMS_VERSION,
    country: info.country,
    consentAge: info.consentAge,
    rule: info.rule,
    childAgeAtConsent: info.age,
    scope: ['account', 'consent_dependent_processing'],
  };
  const recRef = db.collection('parentalConsents').doc();
  await recRef.set(record);
  const consent = {
    verified: true,
    required: true,
    method: record.method,
    parentUid: record.parentUid,
    parentContact: record.contactMasked,
    verifiedAt: nowMs,
    recordId: recRef.id,
    policyVersion: record.policyVersion,
  };
  await ref.set(
    {
      parentalConsent: consent,
      parentalConsentPending: adminApp.firestore.FieldValue.delete(),
      // Teen mode stays: consent unlocks consent-dependent processing, the 18th birthday lifts Teen mode.
      teenMode: info.teen,
      isMinor: info.teen,
    },
    { merge: true }
  );
  return { ok: true, parentalConsent: consent };
}

module.exports = {
  startParentalConsent,
  verifyParentalConsent,
  resolveAdultByContact,
  maskContact,
  CODE_TTL_MS,
};
