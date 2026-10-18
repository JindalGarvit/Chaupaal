/**
 * Copy-aware source reads for tests. After L2–L5 extraction a file says t('auth.welcome') instead
 * of "Welcome!" — withCopy(src) appends the English of every key the source references (as a
 * trailing comment), so copy assertions written against the old literals keep working.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { runtime: rt } = require('./i18n-node-shim');

const ROOT = path.join(__dirname, '..', '..');
const KEY_RE = /\b(?:t|tt|tr|tHtml|htt|tn|tx|txv|tEn)\(\s*['"]([\w.]+)['"]/g;
const DATA_RE = /data-i18n(?:-[a-z]+)?="([\w.]+)"/g;
const OPT_RE = /\boptionLabel(?:Html)?\(\s*['"]([\w.]+)['"]/g;

function withCopy(src) {
  const s = String(src);
  const keys = new Set();
  let m;
  KEY_RE.lastIndex = 0;
  while ((m = KEY_RE.exec(s))) keys.add(m[1]);
  DATA_RE.lastIndex = 0;
  while ((m = DATA_RE.exec(s))) keys.add(m[1]);
  const lines = [];
  keys.forEach((k) => {
    const v = rt.t(k);
    if (v && v !== k) lines.push(v);
  });
  OPT_RE.lastIndex = 0;
  while ((m = OPT_RE.exec(s))) {
    const prefix = m[1].includes('.') ? m[1] : 'profile.opt.' + m[1];
    Object.keys(rt.CHAUPAAL_I18N_EN)
      .filter((k) => k.startsWith(prefix + '.'))
      .forEach((k) => lines.push(rt.t(k)));
  }
  return lines.length ? s + '\n/* i18n copy:\n' + lines.join('\n') + '\n*/\n' : s;
}

/** read(rel) with the English copy appended (JS / HTML only). */
function readWithCopy(rel) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  return /\.(js|html)$/.test(rel) ? withCopy(src) : src;
}

module.exports = { withCopy, readWithCopy };
