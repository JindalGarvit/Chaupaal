#!/usr/bin/env node
/**
 * Validate translation packs (replaces gen-i18n-locales.js — packs are now hand-edited files).
 *
 *   public/src/i18n/en.js         source of truth (window.CHAUPAAL_I18N_EN)
 *   public/src/i18n/{code}.json   one per non-English language in LANG_CATALOG
 *   public/src/i18n/legacy-keys.js old flat key → namespaced key
 *
 * Checks: one pack per catalog language and none for retired codes; keys namespaced by surface;
 * every pack key exists in English; {{params}} and {{@glossary}} tokens the English uses survive in
 * each translation; ICU braces balance; legacy aliases point at real keys.
 *
 * Usage: node scripts/i18n-check.js [--quiet]   (exit 1 on errors)
 * Also exported for scripts/test-global-l0.js.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'public', 'src', 'i18n');
const NAMESPACES = [
  'common', 'auth', 'onboarding', 'profile', 'settings', 'baithak', 'chat', 'mehfil', 'music', 'duniya',
  'akhbaar', 'peepal', 'khoj', 'vriksha', 'dangal', 'games', 'errors', 'notifications',
];

function loadWindowVar(file, name) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  return ctx.window[name];
}

function loadCatalog() {
  const src = fs.readFileSync(path.join(ROOT, 'public', 'src', 'js', 'core', 'i18n.js'), 'utf8');
  const grab = (name) => {
    const m = new RegExp('const ' + name + ' = ([\\s\\S]*?\\]);').exec(src);
    return m ? vm.runInNewContext(m[1]) : [];
  };
  const glossary = /const I18N_GLOSSARY = Object\.freeze\((\{[\s\S]*?\})\);/.exec(src);
  return {
    catalog: grab('LANG_CATALOG'),
    retired: grab('I18N_RETIRED_LANGS'),
    glossary: glossary ? vm.runInNewContext('(' + glossary[1] + ')') : {},
  };
}

const params = (s) => [...new Set(String(s).match(/\{\{\w+\}\}/g) || [])].sort();
const glossTokens = (s) => [...new Set(String(s).match(/\{\{@[a-z0-9]+\}\}/g) || [])].sort();

function bracesBalance(s) {
  let d = 0;
  for (const c of String(s)) {
    if (c === '{') d++;
    else if (c === '}' && --d < 0) return false;
  }
  return d === 0;
}

function check() {
  const errors = [];
  const { catalog, retired, glossary } = loadCatalog();
  const en = loadWindowVar(path.join(DIR, 'en.js'), 'CHAUPAAL_I18N_EN') || {};
  const legacy = loadWindowVar(path.join(DIR, 'legacy-keys.js'), 'CHAUPAAL_I18N_LEGACY') || {};
  const codes = catalog.map((l) => l.code);

  Object.keys(en).forEach((k) => {
    const ns = k.split('.')[0];
    if (!k.includes('.') || !NAMESPACES.includes(ns)) errors.push(`en: key "${k}" is not namespaced (${NAMESPACES.join(', ')})`);
    if (!bracesBalance(en[k])) errors.push(`en: unbalanced braces in ${k}`);
    glossTokens(en[k]).forEach((tok) => {
      if (!(tok.slice(3, -2) in glossary)) errors.push(`en: unknown glossary token ${tok} in ${k}`);
    });
  });
  Object.entries(legacy).forEach(([flat, nk]) => {
    if (!(nk in en)) errors.push(`legacy: ${flat} → ${nk} has no English message`);
  });

  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'));
  files.forEach((f) => {
    const code = f.replace(/\.json$/, '');
    if (!codes.includes(code)) errors.push(`pack ${f} is not in LANG_CATALOG${retired.includes(code) ? ' (retired)' : ''}`);
  });
  const packs = {};
  codes
    .filter((c) => c !== 'en')
    .forEach((code) => {
      const file = path.join(DIR, code + '.json');
      if (!fs.existsSync(file)) {
        errors.push(`missing pack public/src/i18n/${code}.json`);
        return;
      }
      let pack;
      try {
        pack = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch (e) {
        errors.push(`${code}.json: invalid JSON (${e.message})`);
        return;
      }
      packs[code] = pack;
      Object.entries(pack).forEach(([k, v]) => {
        if (!(k in en)) {
          errors.push(`${code}: "${k}" has no English source`);
          return;
        }
        if (typeof v !== 'string') errors.push(`${code}: ${k} is not a string`);
        const want = params(en[k]);
        const have = params(v);
        want.forEach((p) => {
          if (!have.includes(p)) errors.push(`${code}: ${k} drops ${p}`);
        });
        have.forEach((p) => {
          if (!want.includes(p)) errors.push(`${code}: ${k} adds unknown ${p}`);
        });
        glossTokens(en[k]).forEach((tok) => {
          if (!glossTokens(v).includes(tok)) errors.push(`${code}: ${k} translates or drops brand ${tok}`);
        });
        Object.values(glossary).forEach((term) => {
          // A spelled-out brand must be the token, so it stays untranslated everywhere.
          if (term.length > 3 && String(v).includes(term) && !String(en[k]).includes(term)) {
            errors.push(`${code}: ${k} spells "${term}" — use {{@…}}`);
          }
        });
        if (!bracesBalance(v)) errors.push(`${code}: unbalanced braces in ${k}`);
      });
    });
  return { errors, en, legacy, packs, catalog, retired, glossary };
}

if (require.main === module) {
  const { errors, en, packs } = check();
  const quiet = process.argv.includes('--quiet');
  if (!quiet) {
    console.log(`en: ${Object.keys(en).length} keys`);
    Object.entries(packs).forEach(([c, p]) => console.log(`${c}: ${Object.keys(p).length} keys`));
  }
  errors.forEach((e) => console.log('  ✗ ' + e));
  console.log(errors.length ? `${errors.length} i18n error(s)` : 'i18n packs OK');
  process.exit(errors.length ? 1 : 0);
}

module.exports = { check, NAMESPACES };
