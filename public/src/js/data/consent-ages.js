/**
 * Digital consent ages by country (Global L8) — shared by the client (age screen, Teen mode, consent
 * manager) and the server (set_birthdate, parental consent, AI / personalisation gates).
 *
 * DRAFT — REQUIRES LEGAL REVIEW. Values were compiled from the national laws cited below and last
 * checked on CHECKED. They are product defaults, not legal advice; a lawyer should confirm each row
 * (and the default) before launch in that market.
 *
 *   consentAge  Below this age a child cannot give their own consent to consent-based processing
 *               (GDPR Art. 8 information-society services, DPDP s.9, …).
 *   rule        'parental'      verifiable parental consent is needed before we process the child's data
 *                               beyond what is necessary (India DPDP, South Africa POPIA). Until it is
 *                               given: Teen mode + every consent-dependent purpose off.
 *               'consent_basis' parental consent is only needed for processing that relies on consent
 *                               (analytics, marketing, personalisation, AI on personal data). Until it is
 *                               given those purposes stay off; the core service (contract) works.
 *               'none'          the consent age is at or below our minimum age (13), so no 13+ user needs it.
 *   tracking    'opt_in'  non-essential tracking needs a prior, freely given opt-in (EU ePrivacy / GDPR,
 *                         UK PECR, Swiss FADP practice, DPDP). 'opt_out' everywhere else.
 *
 * Everyone under 18 is in Teen mode regardless of this table; nobody under 13 gets an account.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ChaupaalConsentAges = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CHECKED = '2026-11-13';
  const MIN_AGE = 13;
  const ADULT_AGE = 18;

  // [consentAge, rule, tracking, source]
  const GDPR = 'GDPR Art. 8(1)'; // i18n-ignore (legal citation)
  const T = {
    // ── EU member states (GDPR Art. 8 — national derogations between 13 and 16) ──
    AT: [14, 'consent_basis', 'opt_in', 'Austria DSG §4(4)'], // i18n-ignore (legal citation)
    BE: [13, 'none', 'opt_in', 'Belgium Law of 30 July 2018, art. 7'], // i18n-ignore (legal citation)
    BG: [14, 'consent_basis', 'opt_in', 'Bulgaria Personal Data Protection Act, art. 25c'], // i18n-ignore (legal citation)
    HR: [16, 'consent_basis', 'opt_in', 'Croatia GDPR Implementation Act, art. 19'], // i18n-ignore (legal citation)
    CY: [14, 'consent_basis', 'opt_in', 'Cyprus Law 125(I)/2018, s. 8'], // i18n-ignore (legal citation)
    CZ: [15, 'consent_basis', 'opt_in', 'Czechia Act 110/2019 Coll., s. 7'], // i18n-ignore (legal citation)
    DK: [13, 'none', 'opt_in', 'Denmark Data Protection Act, s. 6(2)'], // i18n-ignore (legal citation)
    EE: [13, 'none', 'opt_in', 'Estonia Personal Data Protection Act, s. 8'], // i18n-ignore (legal citation)
    FI: [13, 'none', 'opt_in', 'Finland Data Protection Act 1050/2018, s. 5'], // i18n-ignore (legal citation)
    FR: [15, 'consent_basis', 'opt_in', 'France Loi Informatique et Libertés, art. 45'], // i18n-ignore (legal citation)
    DE: [16, 'consent_basis', 'opt_in', GDPR + ' (Germany: no derogation, BDSG)'], // i18n-ignore (legal citation)
    GR: [15, 'consent_basis', 'opt_in', 'Greece Law 4624/2019, art. 21'], // i18n-ignore (legal citation)
    HU: [16, 'consent_basis', 'opt_in', GDPR + ' (Hungary: no derogation)'], // i18n-ignore (legal citation)
    IE: [16, 'consent_basis', 'opt_in', 'Ireland Data Protection Act 2018, s. 31'], // i18n-ignore (legal citation)
    IT: [14, 'consent_basis', 'opt_in', 'Italy Privacy Code, art. 2-quinquies'], // i18n-ignore (legal citation)
    LV: [13, 'none', 'opt_in', 'Latvia Personal Data Processing Law, s. 33'], // i18n-ignore (legal citation)
    LT: [14, 'consent_basis', 'opt_in', 'Lithuania Law on Legal Protection of Personal Data, art. 6'], // i18n-ignore (legal citation)
    LU: [16, 'consent_basis', 'opt_in', GDPR + ' (Luxembourg: no derogation)'], // i18n-ignore (legal citation)
    MT: [13, 'none', 'opt_in', 'Malta S.L. 586.11, reg. 3'], // i18n-ignore (legal citation)
    NL: [16, 'consent_basis', 'opt_in', 'Netherlands UAVG, art. 5'], // i18n-ignore (legal citation)
    PL: [16, 'consent_basis', 'opt_in', GDPR + ' (Poland: no derogation)'], // i18n-ignore (legal citation)
    PT: [13, 'none', 'opt_in', 'Portugal Law 58/2019, art. 16'], // i18n-ignore (legal citation)
    RO: [16, 'consent_basis', 'opt_in', GDPR + ' (Romania Law 190/2018: no derogation)'], // i18n-ignore (legal citation)
    SK: [16, 'consent_basis', 'opt_in', 'Slovakia Act 18/2018, s. 15'], // i18n-ignore (legal citation)
    SI: [15, 'consent_basis', 'opt_in', 'Slovenia ZVOP-2 (2023), art. 8'], // i18n-ignore (legal citation)
    ES: [14, 'consent_basis', 'opt_in', 'Spain LOPDGDD 3/2018, art. 7'], // i18n-ignore (legal citation)
    SE: [13, 'none', 'opt_in', 'Sweden Act 2018:218, ch. 2 s. 4'], // i18n-ignore (legal citation)
    // ── EEA / Europe outside the EU ──
    IS: [13, 'none', 'opt_in', 'Iceland Act 90/2018, art. 10'], // i18n-ignore (legal citation)
    LI: [16, 'consent_basis', 'opt_in', GDPR + ' (Liechtenstein: no derogation)'], // i18n-ignore (legal citation)
    NO: [13, 'none', 'opt_in', 'Norway Personal Data Act, s. 5'], // i18n-ignore (legal citation)
    CH: [16, 'consent_basis', 'opt_in', 'Switzerland revFADP — no statutory age (capacity of judgement); 16 used as a conservative default'], // i18n-ignore (legal citation)
    GB: [13, 'none', 'opt_in', 'UK Data Protection Act 2018, s. 9 + PECR reg. 6'], // i18n-ignore (legal citation)
    // ── Rest of world ──
    US: [13, 'none', 'opt_out', 'US COPPA, 15 U.S.C. §6501 / 16 CFR Part 312 (CCPA: opt-in to sale/share for 13–15)'], // i18n-ignore (legal citation)
    CA: [13, 'none', 'opt_out', 'Canada PIPEDA (OPC guidance: under 13 needs a parent; Québec Law 25: 14)'], // i18n-ignore (legal citation)
    IN: [18, 'parental', 'opt_in', 'India DPDP Act 2023, s. 2(f) + s. 9; DPDP Rules 2025, r. 10 (verifiable consent)'], // i18n-ignore (legal citation)
    ZA: [18, 'parental', 'opt_in', 'South Africa POPIA, s. 34–35 (competent person consent for under 18)'], // i18n-ignore (legal citation)
    KR: [14, 'consent_basis', 'opt_in', 'South Korea PIPA, art. 22-2'], // i18n-ignore (legal citation)
    CN: [14, 'consent_basis', 'opt_in', 'China PIPL, art. 28 + 31'], // i18n-ignore (legal citation)
  };
  const DEFAULT = [16, 'consent_basis', 'opt_in', 'Default for countries not listed: GDPR Art. 8 ceiling (16), conservative']; // i18n-ignore (legal citation)

  function code(c) {
    return String(c || '').trim().toUpperCase().slice(0, 2);
  }

  /** { country, consentAge, rule, tracking, source, listed } */
  function forCountry(country) {
    const c = code(country);
    const row = T[c];
    const r = row || DEFAULT;
    return { country: c || null, consentAge: r[0], rule: r[1], tracking: r[2], source: r[3], listed: !!row };
  }

  function consentAge(country) {
    return forCountry(country).consentAge;
  }

  function requiresOptIn(country) {
    return forCountry(country).tracking === 'opt_in';
  }

  /** Rows for docs / admin / tests: [{ country, consentAge, rule, tracking, source }]. */
  function table() {
    return Object.keys(T)
      .sort()
      .map((c) => forCountry(c));
  }

  return { CHECKED, MIN_AGE, ADULT_AGE, DEFAULT: forCountry(''), forCountry, consentAge, requiresOptIn, table };
});
