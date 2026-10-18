#!/usr/bin/env node
/**
 * Physical → logical CSS (Global L1 RTL). Converts public/src/styles/*.css in place:
 *   margin|padding-left/right      → margin|padding-inline-start/end
 *   border-left/right[-width|style|color] → border-inline-start/end[…]
 *   border-{top|bottom}-{left|right}-radius → border-{start|end}-{start|end}-radius
 *   left / right                   → inset-inline-start / inset-inline-end
 *   text-align: left|right         → start|end      float/clear: left|right → inline-start|inline-end
 *   margin/padding/inset with 4 values (left ≠ right) → *-block + *-inline
 *   asymmetric border-radius       → the four logical corner longhands
 *
 * Kept physical on purpose (and allowed by --check):
 *   left/right: 50% (or calc(50% …)) — the translate(-50%) centering idiom stays put in RTL
 *   any rule whose selector contains [dir — it is already direction-specific
 *   a declaration followed by a  rtl-ok  comment
 *
 * Usage: node scripts/css-logical.js --write | --check [--json]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'public', 'src', 'styles');
const SKIP_FILES = new Set(['i18n.css']);

const SIMPLE = {
  'margin-left': 'margin-inline-start',
  'margin-right': 'margin-inline-end',
  'padding-left': 'padding-inline-start',
  'padding-right': 'padding-inline-end',
  'border-left': 'border-inline-start',
  'border-right': 'border-inline-end',
  'border-left-width': 'border-inline-start-width',
  'border-right-width': 'border-inline-end-width',
  'border-left-style': 'border-inline-start-style',
  'border-right-style': 'border-inline-end-style',
  'border-left-color': 'border-inline-start-color',
  'border-right-color': 'border-inline-end-color',
  'border-top-left-radius': 'border-start-start-radius',
  'border-top-right-radius': 'border-start-end-radius',
  'border-bottom-left-radius': 'border-end-start-radius',
  'border-bottom-right-radius': 'border-end-end-radius',
  left: 'inset-inline-start',
  right: 'inset-inline-end',
};
const PHYSICAL_PROPS = Object.keys(SIMPLE);
const DECL = /(^|[{;\s])(margin-left|margin-right|padding-left|padding-right|border-left-width|border-right-width|border-left-style|border-right-style|border-left-color|border-right-color|border-left|border-right|border-top-left-radius|border-top-right-radius|border-bottom-left-radius|border-bottom-right-radius|left|right|text-align|float|clear|margin|padding|inset|border-radius)(\s*:\s*)([^;{}]*?)(\s*!important)?(\s*)(?=;|\}|$)/g;

const centering = (v) => /^\s*(50%|calc\(\s*50%)/.test(v);

/** Split a value on top-level spaces (keeps calc(), var() intact). */
function splitValue(v) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const c of v.trim()) {
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (/\s/.test(c) && depth === 0) {
      if (cur) out.push(cur);
      cur = '';
    } else cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

function convertDecl(prop, value, imp) {
  const bang = imp || '';
  if (SIMPLE[prop]) {
    if ((prop === 'left' || prop === 'right') && centering(value)) return null;
    return `${SIMPLE[prop]}:${value}${bang}`;
  }
  if (prop === 'text-align') {
    const v = value.trim();
    if (v === 'left') return `text-align:start${bang}`;
    if (v === 'right') return `text-align:end${bang}`;
    return null;
  }
  if (prop === 'float' || prop === 'clear') {
    const v = value.trim();
    if (v === 'left') return `${prop}:inline-start${bang}`;
    if (v === 'right') return `${prop}:inline-end${bang}`;
    return null;
  }
  if (prop === 'margin' || prop === 'padding' || prop === 'inset') {
    const parts = splitValue(value);
    if (parts.length !== 4 || parts[1] === parts[3]) return null;
    const [top, right, bottom, left] = parts;
    const block = top === bottom ? top : `${top} ${bottom}`;
    return `${prop}-block:${block}${bang};${prop}-inline:${left} ${right}${bang}`;
  }
  if (prop === 'border-radius') {
    if (value.includes('/')) return null;
    const p = splitValue(value);
    let tl;
    let tr;
    let br;
    let bl;
    if (p.length === 2) [tl, tr, br, bl] = [p[0], p[1], p[0], p[1]];
    else if (p.length === 3) [tl, tr, br, bl] = [p[0], p[1], p[2], p[1]];
    else if (p.length === 4) [tl, tr, br, bl] = p;
    else return null;
    // Mirror-symmetric shapes look the same in RTL — leave them alone.
    if (tl === tr && bl === br) return null;
    return `border-start-start-radius:${tl}${bang};border-start-end-radius:${tr}${bang};border-end-end-radius:${br}${bang};border-end-start-radius:${bl}${bang}`;
  }
  return null;
}

/** Visit innermost { … } bodies with their selector (handles @media / @supports nesting). */
function eachBlock(css, fn) {
  let out = '';
  let i = 0;
  const re = /([^{}]*)\{([^{}]*)\}/g;
  let m;
  // Comments can contain braces — mask them first.
  const comments = [];
  const masked = css.replace(/\/\*[\s\S]*?\*\//g, (c) => {
    comments.push(c);
    return `/*__C${comments.length - 1}${/rtl-ok/.test(c) ? '_RTLOK' : ''}__*/`;
  });
  while ((m = re.exec(masked))) {
    out += masked.slice(i, m.index);
    out += fn(m[1], m[2]);
    i = re.lastIndex;
  }
  out += masked.slice(i);
  return out.replace(/\/\*__C(\d+)(?:_RTLOK)?__\*\//g, (s, n) => comments[Number(n)]);
}

function convertCss(css) {
  let changes = 0;
  const out = eachBlock(css, (selector, body) => {
    if (/\[dir/.test(selector)) return `${selector}{${body}}`;
    const next = body.replace(DECL, (full, pre, prop, colon, value, imp, ws, offset, whole) => {
      const after = whole.slice(offset + full.length, offset + full.length + 30);
      if (/_RTLOK__/.test(full) || /^\s*;?\s*\/\*__C\d+_RTLOK__\*\//.test(after)) return full;
      const conv = convertDecl(prop, value, imp);
      if (!conv) return full;
      changes++;
      return pre + conv + ws;
    });
    return `${selector}{${next}}`;
  });
  return { css: out, changes };
}

/** Physical declarations still present (not allow-listed) — [{ line, prop, value }]. */
function findPhysical(css) {
  const left = [];
  eachBlock(css, (selector, body) => {
    if (/\[dir/.test(selector)) return '';
    body.replace(DECL, (full, pre, prop, colon, value, imp, ws, offset, whole) => {
      if (/_RTLOK__/.test(full) || /^\s*;?\s*\/\*__C\d+_RTLOK__\*\//.test(whole.slice(offset + full.length, offset + full.length + 30))) return full;
      if (!PHYSICAL_PROPS.includes(prop) && prop !== 'text-align' && prop !== 'float') return full;
      if (prop === 'text-align' && !/^\s*(left|right)\s*$/.test(value)) return full;
      if (prop === 'float' && !/^\s*(left|right)\s*$/.test(value)) return full;
      if ((prop === 'left' || prop === 'right') && centering(value)) return full;
      left.push({ selector: selector.trim().slice(-60), prop, value: value.trim() });
      return full;
    });
    return '';
  });
  return left;
}

function files() {
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith('.css') && !SKIP_FILES.has(f))
    .map((f) => path.join(DIR, f));
}

if (require.main === module) {
  const write = process.argv.includes('--write');
  let total = 0;
  let remaining = 0;
  files().forEach((file) => {
    const src = fs.readFileSync(file, 'utf8');
    if (write) {
      const { css, changes } = convertCss(src);
      if (changes) fs.writeFileSync(file, css);
      total += changes;
      console.log(`${path.basename(file).padEnd(24)} ${String(changes).padStart(4)} converted`);
    }
    const rest = findPhysical(write ? fs.readFileSync(file, 'utf8') : src);
    remaining += rest.length;
    rest.slice(0, 5).forEach((r) => console.log(`  physical: ${path.basename(file)} ${r.selector} { ${r.prop}: ${r.value} }`));
  });
  if (write) console.log(`converted ${total}`);
  console.log(`remaining physical (not allow-listed): ${remaining}`);
  process.exit(!write && remaining ? 1 : 0);
}

module.exports = { convertCss, findPhysical, convertDecl, files };
