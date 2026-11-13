#!/usr/bin/env node
/**
 * Validate store listing sources against each store's length limits (Global L9).
 *   node scripts/store-validate.js   → exit 1 on any problem
 * Limits: App Store Connect (name/subtitle 30, promotional text 170, keywords 100 bytes, description 4000,
 * what's new 4000); Google Play (title 30, short description 80, full description 4000, release notes 500).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LIMITS = {
  apple: { name: 30, subtitle: 30, promotionalText: 170, keywords: 100, description: 4000, whatsNew: 4000 },
  google: { title: 30, shortDescription: 80, fullDescription: 4000, whatsNew: 500 },
};
const REQUIRED = { apple: ['name', 'subtitle', 'description', 'keywords'], google: ['title', 'shortDescription', 'fullDescription'] };

/** Characters as the stores count them (grapheme-ish: code points); keywords are limited in bytes. */
function len(field, value) {
  return field === 'keywords' ? Buffer.byteLength(String(value), 'utf8') : [...String(value)].length;
}

function validateListing(listing, lang) {
  const errs = [];
  ['apple', 'google'].forEach((store) => {
    const s = (listing && listing[store]) || {};
    REQUIRED[store].forEach((f) => {
      if (!s[f] || !String(s[f]).trim()) errs.push(`${lang} ${store}.${f}: missing`);
    });
    Object.keys(LIMITS[store]).forEach((f) => {
      if (s[f] != null && len(f, s[f]) > LIMITS[store][f]) errs.push(`${lang} ${store}.${f}: ${len(f, s[f])} > ${LIMITS[store][f]}`);
    });
    if (store === 'apple' && s.keywords && /,\s/.test(s.keywords)) errs.push(`${lang} apple.keywords: no spaces after commas (they count)`);
  });
  if (listing && listing.lang !== lang) errs.push(`${lang}: lang field is ${listing && listing.lang}`);
  return errs;
}

function validateAll() {
  const dir = path.join(ROOT, 'store', 'listings');
  const out = { langs: [], errors: [] };
  fs.readdirSync(dir).forEach((lang) => {
    const f = path.join(dir, lang, 'listing.json');
    if (!fs.existsSync(f)) return;
    out.langs.push(lang);
    let listing;
    try {
      listing = JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch (e) {
      out.errors.push(`${lang}: invalid JSON`);
      return;
    }
    out.errors.push(...validateListing(listing, lang));
  });
  return out;
}

if (require.main === module) {
  const r = validateAll();
  r.errors.forEach((e) => console.error('  ✗ ' + e));
  console.log(`${r.langs.length} listings, ${r.errors.length} problems`);
  process.exit(r.errors.length ? 1 : 0);
}

module.exports = { LIMITS, len, validateListing, validateAll };
