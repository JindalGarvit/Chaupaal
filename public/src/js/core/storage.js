/**
 * App-wide localStorage schema versioning.
 * Bump SCHEMA_VERSION and add a step in migrate() when shared blob shapes change.
 * Prefer chaupaal_* keys; never store secrets here.
 */
(function () {
  'use strict';

  const SCHEMA_VERSION = 1;
  const VERSION_KEY = 'chaupaal_ls_version';

  function safeGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function safeSet(key, val) {
    try {
      localStorage.setItem(key, val);
      return true;
    } catch (e) {
      return false;
    }
  }

  function safeRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  }

  function getJSON(key, fallback) {
    const raw = safeGet(key);
    if (raw == null || raw === '') return fallback;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function setJSON(key, val) {
    try {
      return safeSet(key, JSON.stringify(val));
    } catch (e) {
      return false;
    }
  }

  /**
   * Incremental migrations from `from` (exclusive) up to SCHEMA_VERSION.
   * Keep steps idempotent — they may re-run after a partial failure.
   */
  function migrate(from) {
    // v0 → v1: normalize language preference key used by chrome i18n.
    if (from < 1) {
      const lang = safeGet('chaupaal_lang');
      if (!lang) {
        // Older builds only stored lang on the user doc; leave default to boot logic.
      }
    }
  }

  function runStorageMigrations() {
    let ver = parseInt(safeGet(VERSION_KEY) || '0', 10);
    if (!Number.isFinite(ver) || ver < 0) ver = 0;
    if (ver >= SCHEMA_VERSION) return { from: ver, to: ver };
    migrate(ver);
    safeSet(VERSION_KEY, String(SCHEMA_VERSION));
    return { from: ver, to: SCHEMA_VERSION };
  }

  const result = runStorageMigrations();

  window.ChaupaalStorage = {
    VERSION: SCHEMA_VERSION,
    migrate: runStorageMigrations,
    lastMigration: result,
    get: safeGet,
    set: safeSet,
    remove: safeRemove,
    getJSON,
    setJSON,
  };
})();
