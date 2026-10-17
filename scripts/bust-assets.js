/**
 * Fingerprint static assets in public/index.html (?v=<sha1-8>)
 * and bump the service-worker cache name from the index hash.
 *
 * Usage: node scripts/bust-assets.js
 *        npm run bust
 *
 * Does not bundle or minify — keeps the multi-script architecture.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'public', 'index.html');
const SW = path.join(ROOT, 'public', 'sw.js');

function hashFile(abs) {
  const buf = fs.readFileSync(abs);
  return crypto.createHash('sha1').update(buf).digest('hex').slice(0, 8);
}

function publicPath(urlPath) {
  // "/src/js/foo.js" → public/src/js/foo.js
  const rel = urlPath.replace(/^\//, '');
  return path.join(ROOT, 'public', rel);
}

// Language packs are lazy-loaded, so their hashes live in i18n.js (stamped before i18n.js is hashed).
const I18N_DIR = path.join(ROOT, 'public', 'src', 'i18n');
const I18N_JS = path.join(ROOT, 'public', 'src', 'js', 'core', 'i18n.js');
if (fs.existsSync(I18N_DIR) && fs.existsSync(I18N_JS)) {
  const versions = {};
  fs.readdirSync(I18N_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .forEach((f) => (versions[f.replace(/\.json$/, '')] = hashFile(path.join(I18N_DIR, f))));
  const js = fs.readFileSync(I18N_JS, 'utf8');
  const next = js.replace(/const I18N_PACK_VERSIONS = \{[^}]*\};/, `const I18N_PACK_VERSIONS = ${JSON.stringify(versions)};`);
  if (next === js && !js.includes('const I18N_PACK_VERSIONS = ' + JSON.stringify(versions))) {
    console.warn('[bust] could not find I18N_PACK_VERSIONS in i18n.js');
  }
  fs.writeFileSync(I18N_JS, next);
}

let html = fs.readFileSync(INDEX, 'utf8');
let updated = 0;
let missing = 0;

html = html.replace(
  /(href|src)="(\/[^"?]+\.(?:css|js))(?:\?v=[^"]*)?"/g,
  (full, attr, filePath) => {
    const abs = publicPath(filePath);
    if (!fs.existsSync(abs)) {
      missing += 1;
      console.warn('[bust] missing:', filePath);
      return full;
    }
    const h = hashFile(abs);
    updated += 1;
    return `${attr}="${filePath}?v=${h}"`;
  }
);

fs.writeFileSync(INDEX, html);

const indexHash = hashFile(INDEX).slice(0, 6);
let sw = fs.readFileSync(SW, 'utf8');
const nextCache = `chaupaal-v${indexHash}`;
if (/const CACHE = 'chaupaal-v[^']+'/.test(sw)) {
  sw = sw.replace(/const CACHE = 'chaupaal-v[^']+'/, `const CACHE = '${nextCache}'`);
  fs.writeFileSync(SW, sw);
} else {
  console.warn('[bust] could not find CACHE const in sw.js');
}

console.log(`[bust] stamped ${updated} asset URLs; SW cache → ${nextCache}`);
if (missing) console.warn(`[bust] ${missing} referenced files not found on disk`);
