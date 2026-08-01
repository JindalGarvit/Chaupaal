/**
 * Regenerate PWA/brand icons from the user-provided charpai source PNG.
 * Writes new *-charpai* filenames (Android cache-bust) and refreshes legacy names.
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

async function coverPng(size, out) {
  await sharp(SRC).resize(size, size, { fit: 'cover', position: 'centre' }).png().toFile(out);
  console.log('wrote', path.relative(PUBLIC, out), fs.statSync(out).size);
}

async function maskablePng(size, out) {
  const meta = await sharp(SRC).metadata();
  const sample = await sharp(SRC)
    .extract({ left: Math.floor(meta.width / 2), top: Math.max(0, meta.height - 2), width: 1, height: 1 })
    .ensureAlpha()
    .raw()
    .toBuffer();
  const bg = { r: sample[0], g: sample[1], b: sample[2], alpha: 255 };
  const inner = Math.round(size * 0.8);
  const buf = await sharp(SRC).resize(inner, inner, { fit: 'cover', position: 'centre' }).png().toBuffer();
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

  await coverPng(1024, path.join(PUBLIC, 'icon-charpai.png'));
  await coverPng(512, path.join(PUBLIC, 'icon-512-charpai.png'));
  await coverPng(192, path.join(PUBLIC, 'icon-192-charpai.png'));
  await coverPng(180, path.join(PUBLIC, 'apple-touch-icon-charpai.png'));
  await coverPng(512, path.join(BRAND, 'chaupaal-mark-charpai.png'));
  await coverPng(512, path.join(BRAND, 'chaupaal-icon-512-charpai.png'));
  await coverPng(32, path.join(BRAND, 'chaupaal-mark-32-charpai.png'));
  await maskablePng(512, path.join(PUBLIC, 'icon-maskable-512-charpai.png'));

  // Keep legacy paths in sync for any stale hardcodes / CDN edge
  copy(path.join(PUBLIC, 'icon-charpai.png'), path.join(PUBLIC, 'icon.png'));
  copy(path.join(PUBLIC, 'icon-512-charpai.png'), path.join(PUBLIC, 'icon-512.png'));
  copy(path.join(PUBLIC, 'icon-192-charpai.png'), path.join(PUBLIC, 'icon-192.png'));
  copy(path.join(PUBLIC, 'apple-touch-icon-charpai.png'), path.join(PUBLIC, 'apple-touch-icon.png'));
  copy(path.join(PUBLIC, 'icon-maskable-512-charpai.png'), path.join(PUBLIC, 'icon-maskable-512.png'));
  copy(path.join(BRAND, 'chaupaal-mark-charpai.png'), path.join(BRAND, 'chaupaal-mark.png'));
  copy(path.join(BRAND, 'chaupaal-icon-512-charpai.png'), path.join(BRAND, 'chaupaal-icon-512.png'));
  copy(path.join(BRAND, 'chaupaal-mark-32-charpai.png'), path.join(BRAND, 'chaupaal-mark-32.png'));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
