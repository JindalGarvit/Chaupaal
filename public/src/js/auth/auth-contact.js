/**
 * Pure auth contact / identifier helpers.
 * UMD: browser script tag + Node require for regression tests.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.ChaupaalAuthContact = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /** Common disposable / throwaway email domains — keep short; expand later if needed. */
  var DISPOSABLE_EMAIL_DOMAINS = {
    'mailinator.com': true,
    'guerrillamail.com': true,
    'guerrillamail.net': true,
    'sharklasers.com': true,
    'grr.la': true,
    'tempmail.com': true,
    'temp-mail.org': true,
    'throwaway.email': true,
    'yopmail.com': true,
    'yopmail.fr': true,
    'trashmail.com': true,
    'discard.email': true,
    '10minutemail.com': true,
    'getnada.com': true,
    'maildrop.cc': true,
    'mailnesia.com': true,
    'fakeinbox.com': true,
    'tempail.com': true,
    'emailondeck.com': true,
    'moakt.com': true,
  };

  function isDisposableEmail(email) {
    var domain = String(email || '')
      .trim()
      .toLowerCase()
      .split('@')[1] || '';
    return !!(domain && DISPOSABLE_EMAIL_DOMAINS[domain]);
  }

  /**
   * Email/password accounts must verify; Google + verified phone count as verified contact.
   * Matches Firebase Auth user shape (emailVerified, phoneNumber, providerData).
   */
  function hasVerifiedContact(user) {
    if (!user) return false;
    if (user.emailVerified) return true;
    if (user.phoneNumber) return true;
    var providers = user.providerData || [];
    for (var i = 0; i < providers.length; i++) {
      if (providers[i] && providers[i].providerId === 'google.com') return true;
    }
    return false;
  }

  function userHasPasswordProvider(user) {
    var providers = (user && user.providerData) || [];
    for (var i = 0; i < providers.length; i++) {
      if (providers[i] && providers[i].providerId === 'password') return true;
    }
    return false;
  }

  function looksLikeEmail(raw) {
    return /\S+@\S+\.\S+/.test(String(raw || '').trim());
  }

  /** India-first E.164 normalize (same rules as media-config / auth-events). */
  function normalizePhoneE164(raw) {
    var s = String(raw || '').trim();
    var digits = s.replace(/\D/g, '');
    if (digits.length === 10) return '+91' + digits;
    if (digits.length === 12 && digits.startsWith('91')) return '+' + digits;
    if (s.startsWith('+') && digits.length >= 10) return '+' + digits;
    return null;
  }

  /**
   * Classify unified login identifier without hitting the network.
   * @returns {'email'|'phone'|'username'|'empty'}
   */
  function classifyLoginIdentifier(raw) {
    var s = String(raw || '').trim();
    if (!s) return 'empty';
    if (looksLikeEmail(s)) return 'email';
    if (normalizePhoneE164(s)) return 'phone';
    return 'username';
  }

  function sanitizeUsername(raw) {
    return String(raw || '')
      .toLowerCase()
      .replace(/^@/, '')
      .replace(/[^a-z0-9_]/g, '');
  }

  /** Username length gate used by resolve_identifier (3–20). */
  function isValidUsernameHandle(raw) {
    var u = sanitizeUsername(raw);
    return u.length >= 3 && u.length <= 20;
  }

  return {
    DISPOSABLE_EMAIL_DOMAINS: DISPOSABLE_EMAIL_DOMAINS,
    isDisposableEmail: isDisposableEmail,
    hasVerifiedContact: hasVerifiedContact,
    userHasPasswordProvider: userHasPasswordProvider,
    looksLikeEmail: looksLikeEmail,
    normalizePhoneE164: normalizePhoneE164,
    classifyLoginIdentifier: classifyLoginIdentifier,
    sanitizeUsername: sanitizeUsername,
    isValidUsernameHandle: isValidUsernameHandle,
  };
});
