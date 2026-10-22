#!/usr/bin/env node
/**
 * Content catalogs (Global L5). Big tables of game text that code picks from at run time —
 * commentary templates, rulebooks, tip libraries, caller phrases, narration — stay in the source
 * as English and are marked:
 *
 *   const T = /* i18n-catalog: games.streetcricket.comm *\/ { calm: { four: ['{bat} finds the gap — four.', …] } };
 *
 * Every string leaf gets the key  <prefix>.<path>  (object keys, 1-based array indexes):
 * games.streetcricket.comm.calm.four.1 → "{{bat}} finds the gap — four." ({x} placeholders become
 * {{x}}). A `{id}` in the prefix takes the first-level key (games.{id}.rules → games.chess.rules…).
 * opt(key, label, …) / range(key, label, …) calls inside a catalog become variant.<key>.label and
 * their `labels` map variant.<key>.labels.<value>.
 * Use sites resolve through gtx(key, english, params) — the catalog in the browser, the English
 * in Node (server rooms stay canonical English).
 *
 * Usage: node scripts/i18n-catalog.js --surface l5 [--write]   ·   collect(src) for tests.
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
const SKIP_KEYS = /^(id|key|who|default|options|range|accent|snap|icon|emoji|kind|type|code|value|tag|tint|color|min|max|weight|seed|url|href|src)$/;

function braces(s) {
  return String(s).replace(/(^|[^{])\{(\w+)\}(?!\})/g, '$1{{$2}}');
}

function strOf(n) {
  if (n.type === 'Literal' && typeof n.value === 'string') return n.value;
  if (n.type === 'TemplateLiteral' && !n.expressions.length) return n.quasis[0].value.cooked;
  return null;
}

/**
 * (s) => 'You lost ' + s.livesLost + ' lives' → 'You lost {{livesLost}} lives'. A trailing
 * (n(s, 'x') === 1 ? '' : 's') becomes an ICU plural on x. null when the body is anything else.
 */
function fnTemplate(fn, src) {
  const parts = [];
  const flat = (n) => {
    if (n.type === 'BinaryExpression' && n.operator === '+') {
      flat(n.left);
      flat(n.right);
    } else parts.push(n);
  };
  flat(fn.body);
  let text = '';
  let pluralVar = null;
  for (const p of parts) {
    if (p.type === 'Literal' && typeof p.value === 'string') text += p.value;
    else if (p.type === 'TemplateLiteral' && !p.expressions.length) text += p.quasis[0].value.cooked;
    else if (p.type === 'MemberExpression' && !p.computed && p.object.type === 'Identifier') text += '{{' + p.property.name + '}}';
    else if (p.type === 'ConditionalExpression' && /\(s, '(\w+)'\) === 1/.test(src.slice(p.test.start, p.test.end))) {
      pluralVar = /\(s, '(\w+)'\)/.exec(src.slice(p.test.start, p.test.end))[1];
      text += '\u0000';
    } else return null;
  }
  if (!pluralVar) return text;
  const one = text.replace(/\u0000/g, '');
  const other = text.replace(/\u0000/g, 's');
  return `{${pluralVar}, plural, one {${one}} other {${other}}}`;
}

/** [{ key, en, start, end }] for every catalog-marked literal in src. */
function collect(src) {
  const { ast, comments } = parse(src);
  const marks = comments
    .filter((c) => /i18n-catalog:\s*([\w.{}]+)/.test(c.value))
    .map((c) => ({ end: c.end, prefix: /i18n-catalog:\s*([\w.{}]+)/.exec(c.value)[1] }));
  const out = [];
  if (!marks.length) return out;
  const visit = (node, prefix, segs) => {
    if (!node) return;
    const s = strOf(node);
    if (s != null) {
      if (!s.trim() || !isCopy(s.replace(/\{\w+\}/g, 'x'))) return;
      let key = prefix;
      let rest = segs;
      if (/\{id\}/.test(key)) {
        key = key.replace('{id}', segs[0]);
        rest = segs.slice(1);
      }
      out.push({ key: [key].concat(rest).join('.'), en: s, start: node.start, end: node.end });
      return;
    }
    if (node.type === 'ObjectExpression') {
      node.properties.forEach((p) => {
        if (p.type !== 'Property') return;
        const k = p.key.name || p.key.value;
        if (SKIP_KEYS.test(String(k))) return;
        visit(p.value, prefix, segs.concat(String(k)));
      });
    } else if (node.type === 'ArrayExpression') {
      node.elements.forEach((e, i) => visit(e, prefix, segs.concat(String(i + 1))));
    } else if (node.type === 'CallExpression') {
      const name = node.callee.name;
      const a = node.arguments;
      const plain = segs.filter((x) => !/^\d+$/.test(x));
      if ((name === 'T' || name === 'G') && a[0] && a[0].type === 'Literal') {
        // Tip library: T(id, when, text) / G(id, text) → <prefix>.<id>; a text function becomes a template.
        const leaf = name === 'G' ? a[1] : a[2];
        if (leaf && /FunctionExpression/.test(leaf.type)) {
          const tpl = fnTemplate(leaf, src);
          let key = prefix.replace('{id}', plain[0]);
          if (tpl) out.push({ key: [key].concat(/\{id\}/.test(prefix) ? plain.slice(1) : plain, String(a[0].value)).join('.'), en: tpl, start: leaf.start, end: leaf.end });
        } else visit(leaf, prefix, plain.concat(String(a[0].value)));
      } else if (name === 'q' && a[0]) {
        visit(a[0], prefix, segs.concat('q'));
        visit(a[1], prefix, segs.concat('a'));
      } else if ((name === 'opt' || name === 'range') && a[0] && a[0].type === 'Literal') {
        const base = (/\{id\}/.test(prefix) ? segs.slice(0, 1) : segs.filter((x) => !/^\d+$/.test(x) && x !== 'variants')).concat('variant', String(a[0].value));
        visit(a[1], prefix, base.concat('label'));
        const extra = a[name === 'opt' ? 5 : 6];
        if (extra && extra.type === 'ObjectExpression') visit(extra, prefix, base);
      }
    }
  };
  walk.full(ast, (node) => {
    if (node.type !== 'ObjectExpression' && node.type !== 'ArrayExpression') return;
    const m = marks.find((mk) => node.start >= mk.end && node.start - mk.end < 80 && /^[\s=:(]*$/.test(src.slice(mk.end, node.start)));
    if (m && !m.used) {
      m.used = true;
      visit(node, m.prefix, []);
    }
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
  const entries = [];
  let changed = 0;
  files.forEach((rel) => {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) return;
    collect(fs.readFileSync(abs, 'utf8')).forEach((e) => {
      entries.push(Object.assign({ file: rel }, e));
      const v = tokenize(braces(e.en));
      if (en[e.key] !== v) {
        en[e.key] = v;
        changed++;
      }
    });
  });
  if (write && changed) {
    const sorted = Object.keys(en).sort().reduce((a, k) => ((a[k] = en[k]), a), {});
    const src = fs.readFileSync(EN_FILE, 'utf8');
    fs.writeFileSync(EN_FILE, src.slice(0, src.indexOf('window.CHAUPAAL_I18N_EN')) + 'window.CHAUPAAL_I18N_EN = ' + JSON.stringify(sorted, null, 2) + ';\n');
  }
  return { entries, changed };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const surface = args[args.indexOf('--surface') + 1];
  const files = Object.keys(require('./i18n-surfaces.json')[surface] || {});
  const res = run(files, args.includes('--write'));
  const dupes = {};
  res.entries.forEach((e) => (dupes[e.key] = (dupes[e.key] || 0) + 1));
  const d = Object.keys(dupes).filter((k) => dupes[k] > 1);
  console.log(`catalog strings: ${res.entries.length} · new/changed keys: ${res.changed}${d.length ? ' · DUPLICATE keys: ' + d.slice(0, 5).join(', ') : ''}`);
}

module.exports = { collect, run, braces };
