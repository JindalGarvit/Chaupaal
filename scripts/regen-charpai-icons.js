/**
 * Regenerate PWA/brand icons from the user-provided charpai source PNG.
 *
 * Applies a tight center crop (zoom) so empty photo margins / outer "border"
 * disappear when Android/iOS mask the icon to a circle/squircle.
 *
 * Writes *-charpai-z* filenames (cache-bust vs prior *-charpai*), and refreshes
 * legacy + previous *-charpai* paths with the same pixels.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(
  process.env.USERPROFILE || '',
  '.cursor',
  'projects',
  'c-Users-Garvit-Jindal-OneDrive-Documents-GitHub-Chaupaal',
  'assets',
  'c__Users_Garvit_Jindal_AppData_Roaming_Cursor_User_workspaceStorage_empty-window_images_image-8842bcd3-e9c4-445f-a0c2-1f1a83e00386.png'
);
const PUBLIC = path.join(ROOT, 'public');
const BRAND = path.join(PUBLIC, 'brand');

/**
 * Fraction of source kept after crop. Charpai wood/weave bbox is ~870×539 in
 * 1024² — a bbox-fitting square still leaves large white-wall / red-floor bands
 * that read as a "border" under circle masks. 0.50 ≈ 2.0× zoom fills the
 * square with the bed; outer legs may clip (fine under OS masks).
 * Tuned from wood/weave bbox cy≈549 (CONTENT_CENTER_Y biased lower to drop
 * the white wall above the posts).
 */
const CROP_RATIO = 0.5;
/** Vertical center of crop as fraction of source height (0.5 = geometric). */
const CONTENT_CENTER_Y = 0.575;
/** Extra inset after the main crop (fraction of crop side) to drop JPEG edge fringing. */
const EDGE_TRIM = 0.02;

async function cropRegion() {
  const meta = await sharp(SRC).metadata();
  const w = meta.width;
  const h = meta.height;
  const side = Math.round(Math.min(w, h) * CROP_RATIO);
  let left = Math.round((w - side) / 2);
  let top = Math.round(h * CONTENT_CENTER_Y - side / 2);
  left = Math.max(0, Math.min(left, w - side));
  top = Math.max(0, Math.min(top, h - side));
  const trim = Math.round(side * EDGE_TRIM);
  const inner = side - trim * 2;
  return {
    left: left + trim,
    top: top + trim,
    width: inner,
    height: inner,
    sourceW: w,
    sourceH: h,
  };
}

async function zoomedCoverPng(size, out) {
  const region = await cropRegion();
  await sharp(SRC).extract(region).resize(size, size, { fit: 'fill' }).png().toFile(out);
  console.log('wrote', path.relative(PUBLIC, out), fs.statSync(out).size);
}

async function maskablePng(size, out) {
  const region = await cropRegion();
  // Sample floor red from bottom-center of the *cropped* frame
  const sample = await sharp(SRC)
    .extract({
      left: region.left + Math.floor(region.width / 2),
      top: region.top + region.height - 2,
      width: 1,
      height: 1,
    })
    .ensureAlpha()
    .raw()
    .toBuffer();
  const bg = { r: sample[0], g: sample[1], b: sample[2], alpha: 255 };
  const inner = Math.round(size * 0.8);
  const buf = await sharp(SRC)
    .extract(region)
    .resize(inner, inner, { fit: 'fill' })
    .png()
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: bg },
  })
    .composite([{ input: buf, gravity: 'centre' }])
    .png()
    .toFile(out);
  console.log('wrote', path.relative(PUBLIC, out), fs.statSync(out).size);
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

  const region = await cropRegion();
  const zoom = (region.sourceW / region.width).toFixed(2);
  console.log(
    `crop: ${region.width}x${region.height} @ (${region.left},${region.top})` +
      ` from ${region.sourceW}x${region.sourceH} — CROP_RATIO=${CROP_RATIO}, cy=${CONTENT_CENTER_Y}, trim=${EDGE_TRIM} (~${zoom}× zoom)`
  );

  // Primary cache-bust suffix (-charpai-z)
  await zoomedCoverPng(1024, path.join(PUBLIC, 'icon-charpai-z.png'));
  await zoomedCoverPng(512, path.join(PUBLIC, 'icon-512-charpai-z.png'));
  await zoomedCoverPng(192, path.join(PUBLIC, 'icon-192-charpai-z.png'));
  await zoomedCoverPng(180, path.join(PUBLIC, 'apple-touch-icon-charpai-z.png'));
  await zoomedCoverPng(512, path.join(BRAND, 'chaupaal-mark-charpai-z.png'));
  await zoomedCoverPng(512, path.join(BRAND, 'chaupaal-icon-512-charpai-z.png'));
  await zoomedCoverPng(32, path.join(BRAND, 'chaupaal-mark-32-charpai-z.png'));
  await maskablePng(512, path.join(PUBLIC, 'icon-maskable-512-charpai-z.png'));

  // Prior -charpai URLs (also zoomed, in case anything still points here)
  copy(path.join(PUBLIC, 'icon-charpai-z.png'), path.join(PUBLIC, 'icon-charpai.png'));
  copy(path.join(PUBLIC, 'icon-512-charpai-z.png'), path.join(PUBLIC, 'icon-512-charpai.png'));
  copy(path.join(PUBLIC, 'icon-192-charpai-z.png'), path.join(PUBLIC, 'icon-192-charpai.png'));
  copy(path.join(PUBLIC, 'apple-touch-icon-charpai-z.png'), path.join(PUBLIC, 'apple-touch-icon-charpai.png'));
  copy(path.join(PUBLIC, 'icon-maskable-512-charpai-z.png'), path.join(PUBLIC, 'icon-maskable-512-charpai.png'));
  copy(path.join(BRAND, 'chaupaal-mark-charpai-z.png'), path.join(BRAND, 'chaupaal-mark-charpai.png'));
  copy(path.join(BRAND, 'chaupaal-icon-512-charpai-z.png'), path.join(BRAND, 'chaupaal-icon-512-charpai.png'));
  copy(path.join(BRAND, 'chaupaal-mark-32-charpai-z.png'), path.join(BRAND, 'chaupaal-mark-32-charpai.png'));

  // Legacy un-suffixed paths
  copy(path.join(PUBLIC, 'icon-charpai-z.png'), path.join(PUBLIC, 'icon.png'));
  copy(path.join(PUBLIC, 'icon-512-charpai-z.png'), path.join(PUBLIC, 'icon-512.png'));
  copy(path.join(PUBLIC, 'icon-192-charpai-z.png'), path.join(PUBLIC, 'icon-192.png'));
  copy(path.join(PUBLIC, 'apple-touch-icon-charpai-z.png'), path.join(PUBLIC, 'apple-touch-icon.png'));
  copy(path.join(PUBLIC, 'icon-maskable-512-charpai-z.png'), path.join(PUBLIC, 'icon-maskable-512.png'));
  copy(path.join(BRAND, 'chaupaal-mark-charpai-z.png'), path.join(BRAND, 'chaupaal-mark.png'));
  copy(path.join(BRAND, 'chaupaal-icon-512-charpai-z.png'), path.join(BRAND, 'chaupaal-icon-512.png'));
  copy(path.join(BRAND, 'chaupaal-mark-32-charpai-z.png'), path.join(BRAND, 'chaupaal-mark-32.png'));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
