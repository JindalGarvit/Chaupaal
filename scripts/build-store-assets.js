#!/usr/bin/env node
/**
 * Store + web locale assets for the 16 UI languages (Global L9).
 *   store/listings/{lang}/listing.json   seeded from English (translated:false) until the language pass
 *                                        fills it in — existing files are never overwritten
 *   public/manifests/manifest.{lang}.json  PWA manifest with the localised description / shortcuts
 *                                        (from the language packs; English where a key is missing)
 * Run after editing store/listings/en/listing.json or the common.app_* / manifest keys.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

function langs() {
  const src = fs.readFileSync(path.join(ROOT, 'public/src/js/core/i18n.js'), 'utf8');
  const m = /const LANG_CATALOG = (\[[\s\S]*?\]);/.exec(src);
  return vm.runInNewContext(m[1]).map((l) => l.code);
}

function catalog(lang) {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'public/src/i18n/en.js'), 'utf8'), ctx);
  const en = ctx.window.CHAUPAAL_I18N_EN;
  if (lang === 'en') return en;
  const p = path.join(ROOT, 'public/src/i18n', lang + '.json');
  const pack = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
  return Object.assign({}, en, pack);
}

function tr(cat, key) {
  return String(cat[key] || key).replace(/\{\{@chaupaal\}\}/g, 'Chaupaal').replace(/\{\{@(\w+)\}\}/g, (_, n) => n.charAt(0).toUpperCase() + n.slice(1));
}

function manifestFor(lang) {
  const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/manifest.json'), 'utf8'));
  const cat = catalog(lang);
  const out = { ...base, lang, description: tr(cat, 'common.app_description'), start_url: lang === 'en' ? '/' : '/?lang=' + lang };
  if (lang === 'ar' || lang === 'ur') out.dir = 'rtl';
  out.shortcuts = (base.shortcuts || []).map((s) => {
    const id = /section=(\w+)/.exec(s.url)[1];
    return { ...s, description: tr(cat, 'common.app_shortcut_' + id) };
  });
  return out;
}

function build(opts) {
  const o = opts || {};
  const written = [];
  const enListing = JSON.parse(fs.readFileSync(path.join(ROOT, 'store/listings/en/listing.json'), 'utf8'));
  langs().forEach((lang) => {
    if (lang !== 'en') {
      const f = path.join(ROOT, 'store/listings', lang, 'listing.json');
      if (!fs.existsSync(f) && !o.dry) {
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, JSON.stringify({ ...enListing, lang, source: 'en', translated: false }, null, 2) + '\n');
        written.push(path.relative(ROOT, f));
      }
      const mf = path.join(ROOT, 'public/manifests', 'manifest.' + lang + '.json');
      if (!o.dry) {
        fs.mkdirSync(path.dirname(mf), { recursive: true });
        fs.writeFileSync(mf, JSON.stringify(manifestFor(lang), null, 2) + '\n');
        written.push(path.relative(ROOT, mf));
      }
    }
  });
  return written;
}

if (require.main === module) console.log('wrote', build().length, 'files');

module.exports = { langs, manifestFor, build };
