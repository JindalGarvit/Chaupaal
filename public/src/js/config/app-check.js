/**
 * Firebase App Check (reCAPTCHA v3) — scaffold only.
 * Inactive unless window.CHAUPAAL_RECAPTCHA_SITE_KEY (or meta) is a non-empty string.
 * Do NOT enable Console enforcement until this key is live in production.
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
      console.info('[app-check] skipped — no RECAPTCHA site key (set CHAUPAAL_RECAPTCHA_SITE_KEY when ready)');
      return null;
    }
    if (typeof firebase === 'undefined' || !firebase.appCheck) {
      console.warn('[app-check] firebase-app-check SDK not loaded');
      return null;
    }
    try {
      const appCheck = firebase.appCheck();
      appCheck.activate(siteKey, true /* isTokenAutoRefreshEnabled */);
      window.__chaupaalAppCheck = appCheck;
      console.info('[app-check] activated (ensure Console enforcement is still OFF until verified)');
      return appCheck;
    } catch (e) {
      console.warn('[app-check] activate failed', e?.message || e);
      return null;
    }
  }

  // Run after firebase compat app-check script + firebase.js init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAppCheck);
  } else {
    setTimeout(initAppCheck, 0);
  }

  window.initChaupaalAppCheck = initAppCheck;
})();
