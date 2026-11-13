/**
 * Compliance rules (Global L8) — age, Teen mode, parental consent, privacy prefs, tracking consent.
 *
 * Pure part (`ChaupaalCompliance`, also `require`d by server-lib/privacy.js and the tests): every
 * decision takes the user doc / region / record explicitly, so the server and the client agree.
 * Browser part (`ChaupaalPrivacy`): the device's consent record, the signed-in profile and region,
 * and `allows(purpose)` — the one gate analytics, crash reports and marketing nudges check.
 *
 *   Teen mode = under 18 by date of birth, everywhere. It lifts by itself on the 18th birthday;
 *   parental consent does not lift it (consent only unlocks consent-dependent processing).
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const Ages = isNode ? require('../data/consent-ages.js') : root.ChaupaalConsentAges;
  const api = factory(Ages);
  if (isNode) module.exports = api;
  else root.ChaupaalCompliance = api;
})(typeof self !== 'undefined' ? self : this, function (Ages) {
  'use strict';

  /** Privacy Policy + consent purposes. Bump on a material change → everyone is asked again. */
  const POLICY_VERSION = '2026-11-13';
  /** Terms of Service + Community Guidelines. Bump on a material change → acceptance asked again. */
  const TERMS_VERSION = '2026-11-13';
  const PURPOSES = ['analytics', 'crash', 'marketing'];
  const MIN_AGE = Ages.MIN_AGE;
  const ADULT_AGE = Ages.ADULT_AGE;
  /** After an under-13 answer this device shows the "not yet" screen instead of signup for this long. */
  const AGE_LOCK_DAYS = 7;
  const DAY_MS = 86400000;

  const TEEN_RULES = [
    'peepal_hidden',
    'adult_games_hidden',
    'dms_friends_only',
    'profile_private',
    'no_personalised_ads',
    'no_behavioural_tracking',
    'sensitive_fields_hidden',
    'location_off',
    'strict_discovery',
    'ai_conservative',
  ];

  function code(c) {
    return String(c || '').trim().toUpperCase().slice(0, 2);
  }

  /** 'YYYY-MM-DD' | Date | ms | Firestore Timestamp → { y, m, d } (calendar date) or null. */
  function parseDob(v) {
    if (v == null || v === '') return null;
    let parts = null;
    if (typeof v === 'string') {
      const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v.trim());
      if (m) parts = { y: +m[1], m: +m[2], d: +m[3] };
      else v = new Date(v);
    }
    if (!parts) {
      let d = null;
      if (typeof v === 'number') d = new Date(v);
      else if (v instanceof Date) d = v;
      else if (v && typeof v.toDate === 'function') d = v.toDate();
      else if (v && typeof v.seconds === 'number') d = new Date(v.seconds * 1000);
      if (!d || Number.isNaN(d.getTime())) return null;
      parts = { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
    }
    if (parts.y < 1900 || parts.m < 1 || parts.m > 12 || parts.d < 1 || parts.d > 31) return null;
    return parts;
  }

  /** Whole years on `now` (birthday-exact, UTC calendar). null when the DOB is missing / invalid / future. */
  function exactAge(dob, now) {
    const p = parseDob(dob);
    if (!p) return null;
    const n = new Date(now != null ? now : Date.now());
    const ny = n.getUTCFullYear();
    const nm = n.getUTCMonth() + 1;
    const nd = n.getUTCDate();
    const age = ny - p.y - (nm < p.m || (nm === p.m && nd < p.d) ? 1 : 0);
    return age >= 0 && age <= 130 ? age : null;
  }

  function dobOf(u) {
    if (!u) return null;
    return u.dob || u.dateOfBirth || (u.profile && u.profile.dateOfBirth) || null;
  }

  /** { age, source: 'dob' | 'stored' | null } — a DOB always wins over a stored (possibly stale) age. */
  function ageOf(u, now) {
    const a = exactAge(dobOf(u), now);
    if (a != null) return { age: a, source: 'dob' };
    const stored = Number(u && u.age);
    if (Number.isFinite(stored) && stored > 0) return { age: Math.floor(stored), source: 'stored' };
    return { age: null, source: null };
  }

  function regionOf(u, fallback) {
    const r = (u && u.region) || fallback || {};
    return { country: code(r.country) || null, subdivision: String(r.subdivision || '').trim().toUpperCase() || null };
  }

  /**
   * The age facts every gate reads.
   * @param {object} u  user doc / profile ({ dob|dateOfBirth|profile.dateOfBirth, age, teenMode, isMinor, parentalConsent, region })
   * @param {{ country?: string, now?: number }} [opts]
   */
  function ageInfo(u, opts) {
    const o = opts || {};
    const user = u || {};
    const country = code(o.country) || regionOf(user).country;
    const row = Ages.forCountry(country);
    const { age, source } = ageOf(user, o.now);
    const known = age != null;
    const flagged = user.teenMode === true || user.isMinor === true;
    // A real DOB decides; a stored age / teen flag only stands in when there is no DOB.
    const blocked = known && age < MIN_AGE;
    const teen = blocked ? false : known ? age < ADULT_AGE : flagged;
    const verified = !!(user.parentalConsent && user.parentalConsent.verified === true);
    const belowConsentAge = known ? age < row.consentAge : flagged && row.consentAge >= ADULT_AGE;
    const needsParentalConsent = !blocked && belowConsentAge && row.rule !== 'none' && !verified;
    return {
      age,
      ageSource: source,
      known,
      blocked,
      teen,
      adult: known ? age >= ADULT_AGE : !flagged,
      country: row.country,
      consentAge: row.consentAge,
      rule: row.rule,
      needsParentalConsent,
      parentalConsentVerified: verified,
      /** Consent-dependent purposes (analytics, marketing, personalisation, AI on personal data) stay off. */
      consentDependentOff: needsParentalConsent,
      birthdayLiftsTeenMode: teen && known,
    };
  }

  function isTeen(u, opts) {
    return ageInfo(u, opts).teen;
  }

  /**
   * 18+ / age-gated features ('peepal', 'adult_games', 'stranger_dms').
   * 'ok' | 'teen' | 'need_dob' (no DOB and the one allowed skip is used) | 'blocked'.
   */
  function ageGate(u, feature, opts) {
    const info = ageInfo(u, opts);
    if (info.blocked) return 'blocked';
    if (info.teen) return 'teen';
    if (!info.known && dobSkipsUsed(u) >= 1) return 'need_dob';
    return 'ok';
  }

  function dobSkipsUsed(u) {
    const p = u && u.dobPrompt;
    return p && Number(p.skips) > 0 ? Number(p.skips) : 0;
  }

  /** Existing user without a DOB: 'ask' (skippable), 'require' (skip used), or null (nothing to ask). */
  function dobPromptMode(u) {
    if (!u || ageOf(u).source === 'dob') return null;
    return dobSkipsUsed(u) >= 1 ? 'require' : 'ask';
  }

  /**
   * Effective privacy prefs. Stored as users/{uid}.privacy { personalizedRecs, useAi, doNotSell, teenNonFriendDms }.
   * Teens: personalised recommendations off (no behavioural profiling) and AI off by default (may opt in);
   * pending parental consent: both locked off.
   */
  function privacyPrefs(u, opts) {
    const o = opts || {};
    const info = ageInfo(u, o);
    const p = (u && u.privacy) || {};
    const consentLock = info.consentDependentOff;
    const recsLocked = consentLock || info.teen;
    return {
      personalizedRecs: recsLocked ? false : p.personalizedRecs !== false,
      useAi: consentLock ? false : info.teen ? p.useAi === true : p.useAi !== false,
      doNotSell: p.doNotSell === true || o.gpc === true,
      teenNonFriendDms: info.teen && p.teenNonFriendDms === true,
      locked: { personalizedRecs: recsLocked, useAi: consentLock },
    };
  }

  function aiAllowed(u, opts) {
    return privacyPrefs(u, opts).useAi;
  }

  function personalizationAllowed(u, opts) {
    const d = u || {};
    if (d.activitySignalsOptOut === true || (d.profile && d.profile.activitySignalsOptOut === true)) return false;
    return privacyPrefs(d, opts).personalizedRecs;
  }

  /**
   * DM gate. Adults and teens who are not friends never connect; a teen gets DMs from non-friends
   * only when both sides are teens and the recipient turned "Messages from other teens" on.
   */
  function canMessage(me, them, rel, opts) {
    const meTeen = isTeen(me, opts);
    const themTeen = isTeen(them, opts);
    if (rel && rel.friend) return { ok: true };
    if (!meTeen && !themTeen) return { ok: true };
    if (meTeen && !themTeen) return { ok: false, reason: 'teen_adult_stranger' };
    if (!meTeen && themTeen) return { ok: false, reason: 'adult_teen_stranger' };
    if (privacyPrefs(them, opts).teenNonFriendDms) return { ok: true };
    return { ok: false, reason: 'teen_friends_only' };
  }

  // ─── Teen discovery filter (Duniya / Akhbaar): flags first, then a small mature-topic lexicon ───
  // English-first lexicon (global-first); other languages rely on the flags until moderation labels land.
  const TEEN_LEXICON = 'nsfw|18\\+|onlyfans|porn\\w*|sex|sexy|sexting|nudes?|naked|hookups?|escorts?|strip ?club|betting|casino|gambl\\w*|poker night|weed|cannabis|cocaine|meth|drugs?|vodka|whiske?y|tequila|beer|drunk|vape|gore|self[- ]harm'; // i18n-ignore (filter lexicon)
  const TEEN_BLOCK_RE = new RegExp('(^|[^a-z0-9])(' + TEEN_LEXICON + ')([^a-z0-9]|$)', 'i');
  const TEEN_BLOCK_CATEGORIES = ['dating', 'betting', 'gambling', 'adult', 'nightlife', 'alcohol', 'crime']; // i18n-ignore (category ids)

  /** May a teen see this discovery item? (posts / stories / articles / categories from people they don't follow) */
  function teenContentOk(item) {
    if (!item || typeof item !== 'object') return true;
    if (item.nsfw === true || item.ageRestricted === true || item.adultOnly === true || item.mature === true) return false;
    if (item.flagged === true || item.reported === true || Number(item.reportCount) >= 3) return false;
    const cat = String(item.category || item.categoryId || item.cat || '').toLowerCase();
    if (cat && TEEN_BLOCK_CATEGORIES.indexOf(cat) >= 0) return false;
    const tags = Array.isArray(item.tags) ? item.tags.join(' ') : '';
    const text = [item.caption, item.text, item.title, item.question, item.summary, item.description, tags].filter(Boolean).join(' ');
    return !TEEN_BLOCK_RE.test(text);
  }

  // ─── Tracking consent ───────────────────────────────────────────────────
  function trackingMode(country) {
    return Ages.requiresOptIn(country) ? 'opt_in' : 'opt_out';
  }

  function normalizeChoices(c) {
    const out = {};
    PURPOSES.forEach((p) => {
      out[p] = !!(c && c[p] === true);
    });
    return out;
  }

  function allOn() {
    const out = {};
    PURPOSES.forEach((p) => {
      out[p] = true;
    });
    return out;
  }

  /**
   * @param {{ version, choices, at, region }|null} record  device / server consent record
   * @param {{ country }} ctx
   * @returns {{ mode, needsPrompt, current, choices }}
   *   opt_in: nothing non-essential until a current-version choice; a policy bump asks again and
   *           treats every purpose as off until answered. opt_out: on until switched off; a bump on an
   *           existing record re-shows the sheet with their earlier choices.
   */
  function consentStatus(record, ctx) {
    const mode = trackingMode(ctx && ctx.country);
    const rec = record && record.choices ? record : null;
    const current = !!(rec && rec.version === POLICY_VERSION);
    const needsPrompt = mode === 'opt_in' ? !current : !!(rec && !current);
    let choices;
    if (mode === 'opt_in') choices = current ? normalizeChoices(rec.choices) : normalizeChoices({});
    else choices = rec ? normalizeChoices(rec.choices) : allOn();
    return { mode, needsPrompt, current, choices };
  }

  /** The gate: may this non-essential purpose run? ctx { record, country, profile?, now? } */
  function allows(purpose, ctx) {
    if (PURPOSES.indexOf(purpose) < 0) return false;
    const c = ctx || {};
    if (c.profile && ageInfo(c.profile, c).consentDependentOff) return false;
    return consentStatus(c.record, c).choices[purpose] === true;
  }

  /** One log row per purpose: what was chosen, under which policy, where, from which surface. */
  function consentLogRows(choices, meta) {
    const m = meta || {};
    const c = normalizeChoices(choices);
    return PURPOSES.map((purpose) => ({
      purpose,
      choice: c[purpose] ? 'granted' : 'denied',
      policyVersion: m.version || POLICY_VERSION,
      region: code(m.country) || null,
      subdivision: m.subdivision || null,
      source: String(m.source || 'settings').slice(0, 24),
    }));
  }

  // ─── CCPA / CPRA ────────────────────────────────────────────────────────
  function showDoNotSell(region) {
    const r = region || {};
    return code(r.country) === 'US' && String(r.subdivision || '').toUpperCase() === 'CA';
  }

  // ─── Deleted accounts in other people's views ──────────────────────────
  function isDeletedUser(pub) {
    return !!(pub && (pub.deleted === true || pub.deletionStatus === 'deleted'));
  }

  function publicName(pub, deletedLabel) {
    if (isDeletedUser(pub)) return deletedLabel;
    const p = pub || {};
    return p.name || p.displayName || (p.username ? '@' + p.username : '') || deletedLabel;
  }

  // ─── Under-13 device lock (no identity, no DOB — only an expiry) ───────
  function ageLockRecord(now) {
    const t = now != null ? now : Date.now();
    return { until: t + AGE_LOCK_DAYS * DAY_MS };
  }

  function ageLocked(rec, now) {
    const t = now != null ? now : Date.now();
    return !!(rec && Number(rec.until) > t);
  }

  /** Legal acceptance is current when both versions match. */
  function legalCurrent(acc) {
    return !!(acc && acc.terms === TERMS_VERSION && acc.privacy === POLICY_VERSION);
  }

  return {
    POLICY_VERSION,
    TERMS_VERSION,
    PURPOSES,
    MIN_AGE,
    ADULT_AGE,
    AGE_LOCK_DAYS,
    TEEN_RULES,
    Ages,
    parseDob,
    exactAge,
    dobOf,
    ageOf,
    regionOf,
    ageInfo,
    isTeen,
    ageGate,
    dobPromptMode,
    privacyPrefs,
    aiAllowed,
    personalizationAllowed,
    canMessage,
    teenContentOk,
    TEEN_BLOCK_CATEGORIES,
    trackingMode,
    normalizeChoices,
    consentStatus,
    allows,
    consentLogRows,
    showDoNotSell,
    isDeletedUser,
    publicName,
    ageLockRecord,
    ageLocked,
    legalCurrent,
  };
});

/* ─── Browser state: this device's consent record + the signed-in profile / region ─── */
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.ChaupaalCompliance) return;
  const C = window.ChaupaalCompliance;
  const CONSENT_KEY = 'chaupaal_consent_v1';
  const AGE_LOCK_KEY = 'chaupaal_age_check_v1';
  const listeners = new Set();

  function readJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch (e) {
      return null;
    }
  }
  function writeJson(key, val) {
    try {
      if (val == null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {}
  }

  function profile() {
    try {
      return typeof userProfile !== 'undefined' && userProfile ? userProfile : null;
    } catch (e) {
      return null;
    }
  }

  function region() {
    const R = window.ChaupaalRegion;
    const rec = R && typeof R.getRegion === 'function' ? R.getRegion() : { country: 'US' };
    const sub = R && typeof R.getSubdivision === 'function' ? R.getSubdivision() : rec.subdivision || null;
    return { country: rec.country, subdivision: sub };
  }

  function gpc() {
    try {
      return navigator.globalPrivacyControl === true;
    } catch (e) {
      return false;
    }
  }

  function record() {
    return readJson(CONSENT_KEY);
  }

  function ctx() {
    return { record: record(), country: region().country, profile: profile() };
  }

  function allows(purpose) {
    try {
      return C.allows(purpose, ctx());
    } catch (e) {
      return false;
    }
  }

  function status() {
    return C.consentStatus(record(), { country: region().country });
  }

  function emit(detail) {
    listeners.forEach((fn) => {
      try {
        fn(detail);
      } catch (e) {}
    });
    try {
      window.dispatchEvent(new CustomEvent('chaupaal:consent-changed', { detail }));
    } catch (e) {}
  }

  /** Save a choice on this device, then (signed in) in the server-side consent log. */
  function setConsent(choices, opts) {
    const o = opts || {};
    const r = region();
    const rec = {
      version: C.POLICY_VERSION,
      choices: C.normalizeChoices(choices),
      at: Date.now(),
      region: r.country,
      subdivision: r.subdivision || null,
      source: String(o.source || 'settings').slice(0, 24),
    };
    writeJson(CONSENT_KEY, rec);
    emit(rec);
    if (o.remote !== false) syncRemote(rec);
    return rec;
  }

  function syncRemote(rec) {
    try {
      if (typeof apiFetch !== 'function' || typeof currentUser === 'undefined' || !currentUser) return null;
      return apiFetch('/api/media-config', {
        method: 'POST',
        needAuth: true,
        body: {
          action: 'consent_log',
          choices: rec.choices,
          version: rec.version,
          country: rec.region,
          subdivision: rec.subdivision,
          source: rec.source,
        },
      }).catch(() => null);
    } catch (e) {
      return null;
    }
  }

  /** Sign-in: the newer of the device record and users/{uid}.consents wins; the device one is logged once. */
  function hydrateFromProfile(p) {
    const remote = p && p.consents && p.consents.choices ? p.consents : null;
    const local = record();
    if (remote && (!local || Number(remote.atMs || 0) >= Number(local.at || 0))) {
      writeJson(CONSENT_KEY, {
        version: remote.version,
        choices: C.normalizeChoices(remote.choices),
        at: Number(remote.atMs) || Date.now(),
        region: remote.region || region().country,
        subdivision: remote.subdivision || null,
        source: 'account',
      });
      emit(record());
    } else if (local && (!remote || Number(local.at || 0) > Number(remote.atMs || 0))) {
      syncRemote(local);
    }
  }

  function ageLock() {
    writeJson(AGE_LOCK_KEY, C.ageLockRecord());
  }
  function ageLocked() {
    return C.ageLocked(readJson(AGE_LOCK_KEY));
  }

  window.ChaupaalPrivacy = {
    allows,
    status,
    record,
    setConsent,
    hydrateFromProfile,
    region,
    gpc,
    ageLock,
    ageLocked,
    onChange: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    ageInfo: (u) => C.ageInfo(u || profile() || {}, { country: region().country }),
    prefs: (u) => C.privacyPrefs(u || profile() || {}, { country: region().country, gpc: gpc() }),
    isTeen: (u) => C.isTeen(u || profile() || {}, { country: region().country }),
    ageGate: (feature, u) => C.ageGate(u || profile() || {}, feature, { country: region().country }),
    aiAllowed: (u) => {
      const p = u || profile();
      return p ? C.aiAllowed(p, { country: region().country }) : true;
    },
    showDoNotSell: () => C.showDoNotSell(region()),
    /** Teen discovery filter for someone else's item (own items always pass). */
    discoveryOk: (item) => {
      const p = profile();
      if (!p || !C.isTeen(p, { country: region().country })) return true;
      const owner = item && (item.uid || (item.user && item.user.uid));
      if (owner && owner === p.uid) return true;
      return C.teenContentOk(item);
    },
  };
})();
