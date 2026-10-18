#!/usr/bin/env node
/**
 * Option labels for stored values (Global L2+). Finds every option list whose VALUES are stored and
 * makes sure each value has an English label key `profile.opt.<group>.<code>` (or `<prefix>.<code>`
 * when the group is a full prefix such as common.opt.feedback). Runtime: optionLabel(group, value).
 *
 * Sources:
 *   arrays marked   /* i18n-values: <group> *\/ [ … ]   (nested tuples: every copy-like string)
 *   profileField(label, '<group>', type, placeholder, [ … ])
 *   { key: '<group>', …, options: [ … ] }
 *
 * Usage: node scripts/i18n-options.js --surface l2 [--write]   ·  also exported for tests.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const walk = require('acorn-walk');
const { parse } = require('./lib/i18n-ast');
const { isCopy } = require('./i18n-lint');
const { tokenize } = require('./i18n-extract');

const ROOT = path.join(__dirname, '..');
const EN_FILE = path.join(ROOT, 'public', 'src', 'i18n', 'en.js');

function optionCode(value) {
  return String(value == null ? '' : value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48);
}

function prefixFor(group) {
  return String(group).includes('.') ? group : 'profile.opt.' + group;
}

/** [{ group, value }] for one source file. */
function collect(src) {
  const { ast, comments } = parse(src);
  const marks = comments.filter((c) => /i18n-values:\s*([\w.]+)/.test(c.value)).map((c) => ({ end: c.end, group: /i18n-values:\s*([\w.]+)/.exec(c.value)[1] }));
  const out = [];
  const strings = (node) => {
    const found = [];
    walk.simple(node, {
      Literal(n) {
        if (typeof n.value === 'string' && n.value.trim() && isCopy(n.value) && !/^\p{Emoji}+$/u.test(n.value)) found.push(n.value);
      },
    });
    return found;
  };
  walk.simple(ast, {
    ArrayExpression(arr) {
      const m = marks.find((mk) => arr.start >= mk.end && arr.start - mk.end < 80 && /^[\s=:(]*$/.test(src.slice(mk.end, arr.start)));
      if (m) strings(arr).forEach((v) => out.push({ group: m.group, value: v }));
    },
    CallExpression(c) {
      const name = c.callee.type === 'Identifier' ? c.callee.name : c.callee.property && c.callee.property.name;
      if (name !== 'profileField') return;
      const key = c.arguments[1];
      const opts = c.arguments[4];
      if (key && key.type === 'Literal' && opts && opts.type === 'ArrayExpression') strings(opts).forEach((v) => out.push({ group: key.value, value: v }));
    },
    ObjectExpression(o) {
      const prop = (n) => o.properties.find((p) => p.key && (p.key.name || p.key.value) === n);
      const k = prop('key');
      const opts = prop('options');
      if (k && k.value.type === 'Literal' && opts && opts.value.type === 'ArrayExpression') strings(opts.value).forEach((v) => out.push({ group: k.value.value, value: v }));
    },
  });
  return out;
}

function loadEn() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(EN_FILE, 'utf8'), ctx);
  return ctx.window.CHAUPAAL_I18N_EN;
}

function run(files, write) {
  const en = loadEn();
  const added = {};
  const all = [];
  files.forEach((rel) => {
    const abs = path.join(ROOT, rel);
    if (!rel.endsWith('.js') || !fs.existsSync(abs)) return;
    collect(fs.readFileSync(abs, 'utf8')).forEach((o) => {
      const key = prefixFor(o.group) + '.' + optionCode(o.value);
      all.push({ file: rel, key, value: o.value });
      if (!(key in en) && !(key in added)) added[key] = tokenize(o.value);
    });
  });
  if (write && Object.keys(added).length) {
    const merged = Object.assign({}, en, added);
    const sorted = Object.keys(merged)
      .sort()
      .reduce((a, k) => ((a[k] = merged[k]), a), {});
    const src = fs.readFileSync(EN_FILE, 'utf8');
    fs.writeFileSync(EN_FILE, src.slice(0, src.indexOf('window.CHAUPAAL_I18N_EN')) + 'window.CHAUPAAL_I18N_EN = ' + JSON.stringify(sorted, null, 2) + ';\n');
  }
  return { options: all, added };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const surface = args[args.indexOf('--surface') + 1];
  const files = Object.keys(require('./i18n-surfaces.json')[surface] || {});
  const res = run(files, args.includes('--write'));
  console.log(`option values: ${res.options.length} · new label keys: ${Object.keys(res.added).length}`);
}

module.exports = { collect, run, optionCode, prefixFor };
