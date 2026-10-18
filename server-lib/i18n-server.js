/**
 * Server-side copy from the SAME catalog the client uses (public/src/i18n): en.js + legacy-keys.js +
 * core/i18n.js run once per cold start in a VM; language packs are registered on first use.
 * Push notifications render here in the recipient's users/{uid}.lang, English when the key or pack
 * is missing. No server-only string tables.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Static require() per pack so the Vercel file tracer bundles every JSON with the function.
const PACK_LOADERS = {
  hi: () => require('../public/src/i18n/hi.json'),
  bn: () => require('../public/src/i18n/bn.json'),
  ta: () => require('../public/src/i18n/ta.json'),
  te: () => require('../public/src/i18n/te.json'),
  mr: () => require('../public/src/i18n/mr.json'),
  ur: () => require('../public/src/i18n/ur.json'),
  ar: () => require('../public/src/i18n/ar.json'),
  es: () => require('../public/src/i18n/es.json'),
  fr: () => require('../public/src/i18n/fr.json'),
  pt: () => require('../public/src/i18n/pt.json'),
  de: () => require('../public/src/i18n/de.json'),
  id: () => require('../public/src/i18n/id.json'),
  ja: () => require('../public/src/i18n/ja.json'),
  ko: () => require('../public/src/i18n/ko.json'),
  zh: () => require('../public/src/i18n/zh.json'),
};

let runtime = null;
const registered = new Set(['en']);

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

function boot() {
  if (runtime) return runtime;
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    localStorage: memoryStorage(),
    navigator: { languages: ['en'], language: 'en' },
    location: { hostname: 'server', search: '' },
    URLSearchParams,
    Intl,
    CustomEvent: class {
      constructor(type, init) {
        this.type = type;
        this.detail = init && init.detail;
      }
    },
    document: {
      readyState: 'complete',
      documentElement: {},
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener() {},
      dispatchEvent() {},
    },
    setTimeout,
    clearTimeout,
    Promise,
    currentLang: 'en',
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  // Literal path.join(__dirname, …) per file so the Vercel tracer bundles them with the function.
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'src', 'i18n', 'en.js'), 'utf8'), ctx, { filename: 'en.js' });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'src', 'i18n', 'legacy-keys.js'), 'utf8'), ctx, { filename: 'legacy-keys.js' });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'src', 'js', 'core', 'i18n.js'), 'utf8'), ctx, { filename: 'i18n.js' });
  runtime = ctx;
  return ctx;
}

/** Supported UI language for a stored value ('hi-IN' → 'hi', unknown → 'en'). */
function serverLang(lang) {
  const rt = boot();
  return rt.normalizeLang(lang || 'en');
}

function ensurePack(code) {
  if (registered.has(code)) return true;
  const load = PACK_LOADERS[code];
  if (!load) return false;
  try {
    boot().registerI18nLocale(code, load());
    registered.add(code);
    return true;
  } catch (e) {
    console.warn('[i18n-server] pack', code, e?.message || e);
    return false;
  }
}

/** Plain-text message in `lang` (English fallback per key). */
function serverT(lang, key, params) {
  const rt = boot();
  const code = serverLang(lang);
  ensurePack(code);
  const prev = rt.currentLang;
  rt.currentLang = code;
  try {
    return rt.t(key, params || {});
  } finally {
    rt.currentLang = prev;
  }
}

function hasKey(key) {
  return !!boot().i18nLookup(key, 'en');
}

/** Recipient UI language from users/{uid}.lang (English when unset / unreadable). */
async function langForUser(db, uid) {
  if (!db || !uid) return 'en';
  try {
    const snap = await db.collection('users').doc(uid).get();
    const d = snap.exists ? snap.data() || {} : {};
    return serverLang(d.lang || d.profile?.lang || 'en');
  } catch (e) {
    return 'en';
  }
}

module.exports = { serverT, serverLang, langForUser, hasKey, PACK_LOADERS };
