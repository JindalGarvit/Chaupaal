/**
 * Boot the real i18n runtime (en.js + legacy-keys.js + i18n.js [+ region.js]) in a VM for tests.
 *   const rt = loadI18n({ languages: ['hi-IN'], timeZone: 'Asia/Kolkata' });
 *   rt.t('peepal_find_btn') → 'Find on Khoj'
 * Options: languages (navigator.languages), timeZone (device zone), storage (seed localStorage),
 * fetch (stub for lazy packs; default reads public/src/i18n/{code}.json), region (load region.js),
 * db / currentUser (Firestore stub for profile sync).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function memoryStorage(seed) {
  const m = new Map(Object.entries(seed || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
    _map: m,
  };
}

function loadI18n(opts) {
  const o = opts || {};
  const fetchLog = [];
  const events = [];
  const html = { lang: '', dir: '' };
  const tz = o.timeZone || 'UTC';
  const RealIntl = Intl;
  const FakeIntl = Object.assign(Object.create(RealIntl), {
    DateTimeFormat: function (...args) {
      const f = new RealIntl.DateTimeFormat(...args);
      const ro = f.resolvedOptions.bind(f);
      f.resolvedOptions = () => Object.assign(ro(), { timeZone: tz });
      return f;
    },
    PluralRules: RealIntl.PluralRules,
    NumberFormat: RealIntl.NumberFormat,
    Locale: RealIntl.Locale,
    DisplayNames: RealIntl.DisplayNames,
  });
  const ctx = {
    console: o.console || { log() {}, warn() {}, error() {} },
    localStorage: o.localStorage || memoryStorage(o.storage),
    navigator: { languages: o.languages || ['en-US'], language: (o.languages || ['en-US'])[0] },
    location: { hostname: 'test' },
    Intl: FakeIntl,
    CustomEvent: class {
      constructor(type, init) {
        this.type = type;
        this.detail = init && init.detail;
      }
    },
    document: {
      readyState: 'complete',
      documentElement: html,
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener() {},
      dispatchEvent: (e) => events.push({ type: e.type, detail: e.detail }),
    },
    fetch:
      o.fetch ||
      ((url) => {
        fetchLog.push(url);
        const m = /\/src\/i18n\/([a-z-]+)\.json/.exec(url);
        const file = m && path.join(ROOT, 'public', 'src', 'i18n', m[1] + '.json');
        if (!file || !fs.existsSync(file)) return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
        const body = fs.readFileSync(file, 'utf8');
        return Promise.resolve({ ok: true, status: 200, json: async () => JSON.parse(body) });
      }),
    setTimeout,
    clearTimeout,
    Promise,
    currentLang: 'en',
    db: o.db,
    currentUser: o.currentUser,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('public/src/i18n/en.js'), ctx, { filename: 'en.js' });
  vm.runInContext(read('public/src/i18n/legacy-keys.js'), ctx, { filename: 'legacy-keys.js' });
  vm.runInContext(read('public/src/js/core/i18n.js'), ctx, { filename: 'i18n.js' });
  if (o.region !== false) vm.runInContext(read('public/src/js/core/region.js'), ctx, { filename: 'region.js' });
  ctx.fetchLog = fetchLog;
  ctx.events = events;
  ctx.html = html;
  return ctx;
}

/** Every English message rendered (glossary tokens resolved) — for copy assertions in older tests. */
function englishCopy() {
  const rt = loadI18n({ region: false });
  return Object.keys(rt.CHAUPAAL_I18N_EN)
    .map((k) => rt.t(k))
    .join('\n');
}

module.exports = { loadI18n, englishCopy, memoryStorage, ROOT };
