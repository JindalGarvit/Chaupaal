#!/usr/bin/env node
/**
 * Store screenshots per language × theme × device (Global L9).
 *   node scripts/store-screenshots.js --dry-run            print the capture plan (no browser)
 *   node scripts/store-screenshots.js --base http://localhost:5174 [--langs en-XA,ar-XB] [--themes light,dark]
 * Captures with Playwright when installed (npm i -D playwright; npx playwright install chromium).
 * Until the language passes, it shoots the pseudo-locales (en-XA long text, ar-XB RTL) — pass
 * --langs hi,es,… once those packs are translated. Output: store/screenshots/{lang}/{device}/{theme}/{screen}.png
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEVICES = {
  'iphone-6.9': { width: 440, height: 956, scale: 3 },
  'iphone-6.5': { width: 414, height: 896, scale: 3 },
  'ipad-13': { width: 1032, height: 1376, scale: 2 },
  'android-phone': { width: 412, height: 915, scale: 2.625 },
  'android-tablet-10': { width: 800, height: 1280, scale: 2 },
};
const SCREENS = [
  { id: '01-akhbaar', section: 'akhbaar' },
  { id: '02-peepal', section: 'peepal' },
  { id: '03-duniya', section: 'duniya' },
  { id: '04-baithak', section: 'baithak' },
  { id: '05-dangal', section: 'dangal' },
  { id: '06-privacy', section: 'akhbaar', settings: 'settingsPrivacyData' },
];
const DEFAULT_LANGS = ['en-XA', 'ar-XB'];
const THEMES = ['light', 'dark'];

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : def;
}

function plan(opts) {
  const o = opts || {};
  const langs = o.langs || DEFAULT_LANGS;
  const themes = o.themes || THEMES;
  const devices = o.devices || Object.keys(DEVICES);
  const out = [];
  langs.forEach((lang) =>
    devices.forEach((device) =>
      themes.forEach((theme) =>
        SCREENS.forEach((s) => out.push({ lang, device, theme, screen: s.id, section: s.section, settings: s.settings || null, file: path.join('store', 'screenshots', lang, device, theme, s.id + '.png') }))
      )
    )
  );
  return out;
}

async function capture(base, shots) {
  let pw;
  try {
    pw = require('playwright');
  } catch (e) {
    console.error('Playwright is not installed: npm i -D playwright && npx playwright install chromium');
    process.exit(2);
  }
  const browser = await pw.chromium.launch();
  for (const s of shots) {
    const d = DEVICES[s.device];
    const ctx = await browser.newContext({ viewport: { width: d.width, height: d.height }, deviceScaleFactor: d.scale, colorScheme: s.theme === 'dark' ? 'dark' : 'light' });
    const page = await ctx.newPage();
    const pseudo = /-X[AB]$/.test(s.lang) ? s.lang : null;
    await page.addInitScript(
      ([lang, pseudoLoc, theme]) => {
        try {
          localStorage.setItem('chaupaal_consent_v1', JSON.stringify({ version: 'screenshot', choices: { analytics: false, crash: false, marketing: false }, at: Date.now() }));
          if (pseudoLoc) localStorage.setItem('chaupaal_pseudo_locale', pseudoLoc);
          else localStorage.setItem('chaupaal_lang', lang);
          localStorage.setItem('chaupaal_display_mode', theme);
        } catch (e) {}
      },
      [s.lang, pseudo, s.theme]
    );
    await page.goto(`${base}/?section=${s.section}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      try {
        document.getElementById('authSkip')?.click();
        document.getElementById('cpConsentBanner')?.remove();
      } catch (e) {}
    });
    if (s.settings) {
      await page.evaluate((id) => {
        if (typeof openSettingsModal === 'function') openSettingsModal();
        const el = document.getElementById(id);
        if (el) {
          el.open = true;
          el.scrollIntoView();
        }
      }, s.settings);
    }
    await page.waitForTimeout(600);
    const out = path.join(ROOT, s.file);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await page.screenshot({ path: out });
    await ctx.close();
    console.log('  ' + s.file);
  }
  await browser.close();
}

if (require.main === module) {
  const langs = arg('langs') ? arg('langs').split(',') : undefined;
  const themes = arg('themes') ? arg('themes').split(',') : undefined;
  const shots = plan({ langs, themes });
  if (process.argv.includes('--dry-run')) {
    console.log(`${shots.length} screenshots planned (${(langs || DEFAULT_LANGS).length} langs × ${Object.keys(DEVICES).length} devices × ${(themes || THEMES).length} themes × ${SCREENS.length} screens)`);
    process.exit(0);
  }
  capture(arg('base', 'http://localhost:5174'), shots).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { DEVICES, SCREENS, THEMES, DEFAULT_LANGS, plan };
