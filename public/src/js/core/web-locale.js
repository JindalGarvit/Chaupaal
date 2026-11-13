/**
 * Web locale (Global L9): the PWA manifest follows the UI language (name / description / shortcuts
 * localised in public/manifests/, built by scripts/build-store-assets.js).
 */
(function () {
  'use strict';
  function langCode() {
    try {
      return typeof normalizeLang === 'function' && typeof currentLang !== 'undefined' ? normalizeLang(currentLang) : 'en';
    } catch (e) {
      return 'en';
    }
  }
  function manifestHref(lang) {
    return !lang || lang === 'en' ? '/manifest.json' : '/manifests/manifest.' + lang + '.json';
  }
  function apply() {
    const link = document.querySelector('link[rel="manifest"]');
    if (link) link.setAttribute('href', manifestHref(langCode()));
  }
  document.addEventListener('chaupaal:lang-changed', apply);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  else apply();
  window.ChaupaalWebLocale = { manifestHref, apply };
})();
