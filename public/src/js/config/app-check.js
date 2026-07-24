/**
 * Firebase App Check (reCAPTCHA v3).
 * Site key from meta[name="chaupaal-recaptcha-site-key"] or window.CHAUPAAL_RECAPTCHA_SITE_KEY.
 * Console enforcement is ON for Firestore / RTDB — activate before any data calls.
 */
(function () {
  'use strict';

  function resolveSiteKey() {
    if (typeof window.CHAUPAAL_RECAPTCHA_SITE_KEY === 'string' && window.CHAUPAAL_RECAPTCHA_SITE_KEY.trim()) {
      return window.CHAUPAAL_RECAPTCHA_SITE_KEY.trim();
    }
    try {
      const meta = document.querySelector('meta[name="chaupaal-recaptcha-site-key"]');
      const v = meta?.getAttribute('content');
      if (v && v.trim() && v.trim() !== 'REPLACE_ME') return v.trim();
    } catch (e) {}
    return '';
  }

  function initAppCheck() {
    const siteKey = resolveSiteKey();
    if (!siteKey) {
      console.warn('[app-check] missing RECAPTCHA site key — Firestore/RTDB will fail under enforcement');
      return null;
    }
    if (typeof firebase === 'undefined' || !firebase.appCheck) {
      console.warn('[app-check] firebase-app-check SDK not loaded');
      return null;
    }
    try {
      const appCheck = firebase.appCheck();
      // Prefer ReCaptchaV3Provider when the SDK exposes it (compat 10+)
      const provider =
        firebase.appCheck.ReCaptchaV3Provider
          ? new firebase.appCheck.ReCaptchaV3Provider(siteKey)
          : siteKey;
      appCheck.activate(provider, true /* isTokenAutoRefreshEnabled */);
      window.__chaupaalAppCheck = appCheck;
      console.info('[app-check] activated');
      return appCheck;
    } catch (e) {
      console.warn('[app-check] activate failed', e?.message || e);
      if (typeof reportClientError === 'function') {
        try {
          reportClientError({
            feature: 'app_check',
            message: e?.message || String(e),
            stack: e?.stack || '',
          });
        } catch (err) {}
      }
      return null;
    }
  }

  // Must run immediately after firebase.js — before auth/Firestore usage.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAppCheck);
  } else {
    initAppCheck();
  }

  window.initChaupaalAppCheck = initAppCheck;
})();
