/**
 * Regenerate PWA/brand icons from IconV2 charpai source — **as-is, no zoom crop**.
 *
 * Source is already a square 1024² product shot; we only resize.
 * Writes *-charpai-v2as* filenames (cache-bust vs prior zoomed *-charpai-v2*),
 * and refreshes older icon paths with the same pixels.
 *
 * Source: public/brand/chaupaal-icon-source-v2.png
 */
'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'public', 'brand', 'chaupaal-icon-source-v2.png');
const PUBLIC = path.join(ROOT, 'public');
const BRAND = path.join(PUBLIC, 'brand');

/** Suffix for primary cache-bust URLs (as-is, no crop). */
const SUFFIX = 'charpai-v2as';

async function resizePng(size, out) {
  await sharp(SRC)
    .resize(size, size, { fit: 'fill' })
    .png()
    .toFile(out);
  console.log('wrote', path.relative(PUBLIC, out), fs.statSync(out).size);
}

/**
 * Maskable: same full art (as-is). OS may crop edges; user asked for no zoom.
 */
async function maskablePng(size, out) {
  await resizePng(size, out);
}

function copy(from, to) {
  fs.copyFileSync(from, to);
  console.log('copied', path.relative(PUBLIC, to));
}

(async () => {
  if (!fs.existsSync(SRC)) {
    console.error('Source image missing:', SRC);
    process.exit(1);
  }

  const meta = await sharp(SRC).metadata();
  console.log(`source: ${meta.width}x${meta.height} ${meta.format} — as-is resize only (no crop)`);

  const primary = {
    icon: path.join(PUBLIC, `icon-${SUFFIX}.png`),
    icon512: path.join(PUBLIC, `icon-512-${SUFFIX}.png`),
    icon192: path.join(PUBLIC, `icon-192-${SUFFIX}.png`),
    apple: path.join(PUBLIC, `apple-touch-icon-${SUFFIX}.png`),
    maskable: path.join(PUBLIC, `icon-maskable-512-${SUFFIX}.png`),
    mark: path.join(BRAND, `chaupaal-mark-${SUFFIX}.png`),
    mark512: path.join(BRAND, `chaupaal-icon-512-${SUFFIX}.png`),
    mark32: path.join(BRAND, `chaupaal-mark-32-${SUFFIX}.png`),
  };

  await resizePng(1024, primary.icon);
  await resizePng(512, primary.icon512);
  await resizePng(192, primary.icon192);
  await resizePng(180, primary.apple);
  await resizePng(512, primary.mark);
  await resizePng(512, primary.mark512);
  await resizePng(32, primary.mark32);
  await maskablePng(512, primary.maskable);

  // Prior -charpai-v2 (zoomed) URLs
  copy(primary.icon, path.join(PUBLIC, 'icon-charpai-v2.png'));
  copy(primary.icon512, path.join(PUBLIC, 'icon-512-charpai-v2.png'));
  copy(primary.icon192, path.join(PUBLIC, 'icon-192-charpai-v2.png'));
  copy(primary.apple, path.join(PUBLIC, 'apple-touch-icon-charpai-v2.png'));
  copy(primary.maskable, path.join(PUBLIC, 'icon-maskable-512-charpai-v2.png'));
  copy(primary.mark, path.join(BRAND, 'chaupaal-mark-charpai-v2.png'));
  copy(primary.mark512, path.join(BRAND, 'chaupaal-icon-512-charpai-v2.png'));
  copy(primary.mark32, path.join(BRAND, 'chaupaal-mark-32-charpai-v2.png'));

  // Prior -charpai-z
  copy(primary.icon, path.join(PUBLIC, 'icon-charpai-z.png'));
  copy(primary.icon512, path.join(PUBLIC, 'icon-512-charpai-z.png'));
  copy(primary.icon192, path.join(PUBLIC, 'icon-192-charpai-z.png'));
  copy(primary.apple, path.join(PUBLIC, 'apple-touch-icon-charpai-z.png'));
  copy(primary.maskable, path.join(PUBLIC, 'icon-maskable-512-charpai-z.png'));
  copy(primary.mark, path.join(BRAND, 'chaupaal-mark-charpai-z.png'));
  copy(primary.mark512, path.join(BRAND, 'chaupaal-icon-512-charpai-z.png'));
  copy(primary.mark32, path.join(BRAND, 'chaupaal-mark-32-charpai-z.png'));

  // Prior -charpai
  copy(primary.icon, path.join(PUBLIC, 'icon-charpai.png'));
  copy(primary.icon512, path.join(PUBLIC, 'icon-512-charpai.png'));
  copy(primary.icon192, path.join(PUBLIC, 'icon-192-charpai.png'));
  copy(primary.apple, path.join(PUBLIC, 'apple-touch-icon-charpai.png'));
  copy(primary.maskable, path.join(PUBLIC, 'icon-maskable-512-charpai.png'));
  copy(primary.mark, path.join(BRAND, 'chaupaal-mark-charpai.png'));
  copy(primary.mark512, path.join(BRAND, 'chaupaal-icon-512-charpai.png'));
  copy(primary.mark32, path.join(BRAND, 'chaupaal-mark-32-charpai.png'));

  // Legacy un-suffixed
  copy(primary.icon, path.join(PUBLIC, 'icon.png'));
  copy(primary.icon512, path.join(PUBLIC, 'icon-512.png'));
  copy(primary.icon192, path.join(PUBLIC, 'icon-192.png'));
  copy(primary.apple, path.join(PUBLIC, 'apple-touch-icon.png'));
  copy(primary.maskable, path.join(PUBLIC, 'icon-maskable-512.png'));
  copy(primary.mark, path.join(BRAND, 'chaupaal-mark.png'));
  copy(primary.mark512, path.join(BRAND, 'chaupaal-icon-512.png'));
  copy(primary.mark32, path.join(BRAND, 'chaupaal-mark-32.png'));

  console.log('done — primary URLs use *-' + SUFFIX + '.png (full frame, no zoom)');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
