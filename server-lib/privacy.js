/**
 * Privacy + age server helpers (Global L8). Folded into api/media-config — no new Hobby function.
 *
 * Same rules as the client: public/src/js/core/compliance.js (+ data/consent-ages.js).
 *   consent_log      users/{uid}/consentLog rows + users/{uid}.consents summary (server time, region, version)
 *   privacy_prefs    users/{uid}.privacy { personalizedRecs, useAi, doNotSell, teenNonFriendDms } (teen locks applied)
 *   set_birthdate    first DOB for accounts without one; under 13 → account closed (purge on the next run)
 *   legal_accept     users/{uid}.legalAcceptance { terms, privacy, at } (signup + material changes)
 */
'use strict';

const Compliance = require('../public/src/js/core/compliance.js');

const PREF_KEYS = ['personalizedRecs', 'useAi', 'doNotSell', 'teenNonFriendDms'];

function code(c) {
  return String(c || '').trim().toUpperCase().slice(0, 2) || null;
}

function sub(c) {
  const s = String(c || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(s) ? s : null;
}

function regionOf(userDoc, body) {
  const b = body || {};
  const r = (userDoc && userDoc.region) || {};
  return { country: code(b.country) || code(r.country), subdivision: sub(b.subdivision) || sub(r.subdivision) };
}

/** Consent-dependent processing allowed for this user doc (AI on personal data, personalisation …). */
function aiAllowedForUser(userDoc) {
  if (!userDoc) return true;
  return Compliance.aiAllowed(userDoc, { country: regionOf(userDoc).country });
}

function personalizationOff(userDoc) {
  if (!userDoc) return false;
  return !Compliance.personalizationAllowed(userDoc, { country: regionOf(userDoc).country });
}

/** Marketing notifications (tips, wishes, re-engagement) — the "marketing" consent purpose. */
function marketingAllowed(userDoc) {
  if (!userDoc) return false;
  const country = regionOf(userDoc).country;
  // No region on file (pre-L4 accounts): the client writes it on the next sign-in; until then only the
  // age / parental-consent lock applies.
  if (!country) return !Compliance.ageInfo(userDoc).consentDependentOff;
  const c = userDoc.consents;
  const record = c && c.choices ? { version: c.version, choices: c.choices } : null;
  return Compliance.allows('marketing', { record, country, profile: userDoc });
}

async function loadUser(db, uid) {
  const snap = await db.collection('users').doc(uid).get();
  return snap.exists ? snap.data() || {} : null;
}

/** Everything the Privacy & data screen needs, computed on the server's clock. */
function privacyStateFrom(userDoc, opts) {
  const u = userDoc || {};
  const region = regionOf(u, opts);
  const info = Compliance.ageInfo(u, { country: region.country });
  const prefs = Compliance.privacyPrefs(u, { country: region.country, gpc: !!(opts && opts.gpc) });
  const consents = u.consents && u.consents.choices ? u.consents : null;
  return {
    region,
    age: {
      known: info.known,
      teen: info.teen,
      consentAge: info.consentAge,
      rule: info.rule,
      needsParentalConsent: info.needsParentalConsent,
      parentalConsentVerified: info.parentalConsentVerified,
      dobPrompt: Compliance.dobPromptMode(u),
    },
    teenRules: info.teen ? Compliance.TEEN_RULES.slice() : [],
    prefs,
    showDoNotSell: Compliance.showDoNotSell(region),
    consent: Compliance.consentStatus(consents, { country: region.country }),
    legal: {
      termsVersion: Compliance.TERMS_VERSION,
      policyVersion: Compliance.POLICY_VERSION,
      current: Compliance.legalCurrent(u.legalAcceptance),
      accepted: u.legalAcceptance || null,
    },
    deletion: u.deletionStatus === 'scheduled' ? { status: 'scheduled', purgeAfterMs: Number(u.purgeAfterMs) || null } : null,
  };
}

async function privacyState(db, uid, opts) {
  const u = await loadUser(db, uid);
  return privacyStateFrom(u || {}, opts);
}

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {object} FieldValue  admin.firestore.FieldValue
 * @param {string} uid
 * @param {{ choices, version?, country?, subdivision?, source? }} body
 */
async function logConsent(db, FieldValue, uid, body) {
  const b = body || {};
  const u = (await loadUser(db, uid)) || {};
  const region = regionOf(u, b);
  const version = String(b.version || Compliance.POLICY_VERSION).slice(0, 20);
  const choices = Compliance.normalizeChoices(b.choices);
  const rows = Compliance.consentLogRows(choices, { version, country: region.country, subdivision: region.subdivision, source: b.source });
  const userRef = db.collection('users').doc(uid);
  const batch = db.batch();
  const nowMs = Date.now();
  rows.forEach((row) => {
    batch.set(userRef.collection('consentLog').doc(), { ...row, at: FieldValue.serverTimestamp(), atMs: nowMs });
  });
  batch.set(
    userRef,
    {
      consents: {
        version,
        choices,
        region: region.country,
        subdivision: region.subdivision,
        source: rows[0].source,
        at: FieldValue.serverTimestamp(),
        atMs: nowMs,
      },
    },
    { merge: true }
  );
  await batch.commit();
  return { logged: rows.length, version, choices, region };
}

/** Validated pref patch; teen / pending-consent locks win over what the client asked for. */
function normalizePrefPatch(userDoc, patch) {
  const p = patch || {};
  const next = { ...((userDoc && userDoc.privacy) || {}) };
  PREF_KEYS.forEach((k) => {
    if (typeof p[k] === 'boolean') next[k] = p[k];
  });
  const region = regionOf(userDoc);
  const info = Compliance.ageInfo(userDoc || {}, { country: region.country });
  if (info.consentDependentOff) {
    next.personalizedRecs = false;
    next.useAi = false;
  } else if (info.teen) {
    next.personalizedRecs = false;
  }
  if (!info.teen) delete next.teenNonFriendDms;
  return next;
}

async function setPrivacyPrefs(db, FieldValue, uid, patch) {
  const u = (await loadUser(db, uid)) || {};
  const privacy = normalizePrefPatch(u, patch);
  privacy.updatedAtMs = Date.now();
  await db.collection('users').doc(uid).set({ privacy }, { merge: true });
  if (typeof (patch || {}).teenNonFriendDms === 'boolean') {
    await db
      .collection('users_public')
      .doc(uid)
      .set({ teenDmsOpen: privacy.teenNonFriendDms === true ? true : FieldValue.delete() }, { merge: true })
      .catch(() => {});
  }
  return privacyStateFrom({ ...u, privacy });
}

/**
 * First DOB for an account that has none (existing users asked once). A stored DOB is not
 * overwritten here — corrections go through support so Teen mode cannot be typed away.
 * Under 13 → { blocked: true }: the account is closed (deletion scheduled for the next purge run).
 */
async function setBirthdate(adminApp, uid, rawDob, opts) {
  const db = adminApp.firestore();
  const FieldValue = adminApp.firestore.FieldValue;
  const o = opts || {};
  const u = (await loadUser(db, uid)) || {};
  if (Compliance.ageOf(u).source === 'dob') return { ok: false, error: 'DOB_ALREADY_SET' };
  const parts = Compliance.parseDob(rawDob);
  const age = parts ? Compliance.exactAge(rawDob) : null;
  if (age == null) return { ok: false, error: 'VALIDATION_ERROR' };
  const dob = `${parts.y}-${String(parts.m).padStart(2, '0')}-${String(parts.d).padStart(2, '0')}`;
  const ref = db.collection('users').doc(uid);
  if (age < Compliance.MIN_AGE) {
    const { scheduleDeletion } = require('./account-purge');
    await scheduleDeletion(adminApp, uid, { reason: 'under_min_age', graceDays: 0 });
    return { ok: true, blocked: true };
  }
  const region = regionOf(u, o);
  const teen = age < Compliance.ADULT_AGE;
  const patch = {
    dob,
    dateOfBirth: dob,
    age,
    teenMode: teen,
    isMinor: teen,
    'profile.dateOfBirth': dob,
    'profile.age': age,
    ageCheckedAt: FieldValue.serverTimestamp(),
    dobPrompt: FieldValue.delete(),
  };
  if (teen) {
    // Teen defaults: private profile unless they already chose; location sharing off.
    const vis = u.profileVisibility || (u.profile && u.profile.profileVisibility);
    if (!vis) {
      patch.profileVisibility = 'Private';
      patch['profile.profileVisibility'] = 'Private';
    }
    patch.showLocation = false;
    patch.activitySignalsOptOut = true;
  }
  const info = Compliance.ageInfo({ ...u, dob }, { country: region.country });
  if (!u.parentalConsent || u.parentalConsent.verified !== true) {
    patch.parentalConsent = { verified: false, required: info.needsParentalConsent };
  }
  await ref.update(patch);
  const after = { ...u, dob, dateOfBirth: dob, age, teenMode: teen, isMinor: teen, parentalConsent: patch.parentalConsent || u.parentalConsent };
  delete after.dobPrompt;
  return { ok: true, blocked: false, state: privacyStateFrom(after) };
}

/** "Not now" on the DOB question for existing accounts — allowed once; after that it is required. */
async function skipDobPrompt(db, FieldValue, uid) {
  const u = (await loadUser(db, uid)) || {};
  if (Compliance.ageOf(u).source === 'dob') return { mode: null };
  const skips = Number(u.dobPrompt && u.dobPrompt.skips) || 0;
  if (skips >= 1) return { mode: 'require', allowed: false };
  await db.collection('users').doc(uid).set({ dobPrompt: { skips: skips + 1, at: FieldValue.serverTimestamp() } }, { merge: true });
  return { mode: 'require', allowed: true };
}

async function acceptLegal(db, FieldValue, uid, body) {
  const b = body || {};
  const acc = {
    terms: String(b.terms || Compliance.TERMS_VERSION).slice(0, 20),
    privacy: String(b.privacy || Compliance.POLICY_VERSION).slice(0, 20),
    source: String(b.source || 'signup').slice(0, 24),
    at: FieldValue.serverTimestamp(),
    atMs: Date.now(),
  };
  await db.collection('users').doc(uid).set({ legalAcceptance: acc }, { merge: true });
  return { accepted: true, terms: acc.terms, privacy: acc.privacy, current: Compliance.legalCurrent(acc) };
}

module.exports = {
  Compliance,
  PREF_KEYS,
  regionOf,
  aiAllowedForUser,
  personalizationOff,
  marketingAllowed,
  privacyState,
  privacyStateFrom,
  logConsent,
  normalizePrefPatch,
  setPrivacyPrefs,
  setBirthdate,
  skipDobPrompt,
  acceptLegal,
};
