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
