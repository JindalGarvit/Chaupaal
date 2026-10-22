#!/usr/bin/env node
/**
 * Hard-coded strings → i18n keys (Global L2–L5 tool). Rewrites source in place and adds English
 * messages to public/src/i18n/en.js (glossary terms become {{@id}} tokens).
 *
 *   node scripts/i18n-extract.js --surface l2 [--write] [--only <file>]
 *
 * Rewrites (JS):
 *   sink literal          showToast('Saved') / el.textContent = 'Saved' / setAttribute('aria-label', 'Back')
 *                         → t('ns.saved')          (`Sent to ${name}` → t('ns.sent_to', { name }))
 *   HTML in templates     <b>Save</b> → <b>${tHtml('ns.save')}</b> · aria-label="Back" → aria-label="${tHtml(…)}"
 *   HTML in '…' strings   '<b>Save</b>' → '<b>' + tHtml('ns.save') + '</b>'
 *   prose literal         return 'Something went wrong' → return t('ns.something_went_wrong')
 *   t/tt/tr('flat_key', 'Fallback') with no English message → renamed to ns.flat_key + English added
 * Rewrites (index.html): leaf text → data-i18n="…" (else wrapped in <span data-i18n>), placeholder /
 * aria-label / title / alt → data-i18n-* attributes.
 * Reuse: identical English (same ns first, then any) reuses the existing key — its hi/ta come along.
 * Not rewritten (reported for hand-fixing): concatenations, HTML text around ${…}, complex ${…}.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { isCopy } = require('./i18n-lint');

const ROOT = path.join(__dirname, '..');
const EN_FILE = path.join(ROOT, 'public', 'src', 'i18n', 'en.js');
const LEGACY_FILE = path.join(ROOT, 'public', 'src', 'i18n', 'legacy-keys.js');

const GLOSSARY = {
  chaupaal: 'Chaupaal', dangal: 'Dangal', baithak: 'Baithak', mehfil: 'Mehfil', peepal: 'Peepal', akhbaar: 'Akhbaar',
  duniya: 'Duniya', khoj: 'Khoj', vriksha: 'Vriksha', muqabala: 'Muqabala', rajamantri: 'Raja Mantri Chor Sipahi',
  teenpatti: 'Teen Patti', carrom: 'Carrom', tambola: 'Tambola', kakuro: 'Kakuro', shabdfive: 'Shabd Five', ohno: 'Oh No!', tiptap: 'Tip Tap',
};

function loadVar(file, name) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx);
  return ctx.window[name];
}

const en = loadVar(EN_FILE, 'CHAUPAAL_I18N_EN');
const legacy = loadVar(LEGACY_FILE, 'CHAUPAAL_I18N_LEGACY');
const added = {};
const report = { rewrites: 0, keys: 0, reused: 0, manual: [] };

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function tokenize(v) {
  let out = v;
  for (const [id, term] of Object.entries(GLOSSARY)) {
    out = out.replace(new RegExp('(^|[^A-Za-z@{])' + esc(term) + '(?![A-Za-z])', 'g'), (m, pre) => pre + '{{@' + id + '}}');
  }
  return out;
}

function decodeEntities(s) {
  return String(s)
    .replace(/&nbsp;/g, '\u00a0')
    .replace(/&middot;/g, '·')
    .replace(/&rarr;/g, '→')
    .replace(/&larr;/g, '←')
    .replace(/&hellip;/g, '…')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

function slug(text) {
  const words = String(text)
    .replace(/\{\{@?(\w+)\}\}/g, ' $1 ')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);
  return (words.join('_') || 'text').slice(0, 42).replace(/_+$/, '');
}

/** New key → existing key with identical English, whose translations are copied over. */
const copyFrom = {};

/**
 * Key for an English message in ns. Identical English in the same namespace (or common.) is
 * reused; identical English elsewhere gets a new ns key that inherits that key's translations.
 */
function keyFor(ns, english) {
  const value = tokenize(english);
  const all = Object.assign({}, en, added);
  const same = Object.keys(all).filter((k) => all[k] === value);
  const local = same.find((k) => k.startsWith(ns + '.')) || same.find((k) => k.startsWith('common.'));
  if (local) {
    report.reused++;
    return local;
  }
  let base = ns + '.' + slug(english);
  let k = base;
  let i = 2;
  while (k in all) k = base + '_' + i++;
  added[k] = value;
  report.keys++;
  if (same.length) copyFrom[k] = same.find((s) => s in en) || same[0];
  return k;
}

/** Carry hi/ta/… translations onto keys created from identical English. */
function copyTranslations() {
  const dir = path.join(ROOT, 'public', 'src', 'i18n');
  fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .forEach((f) => {
      const file = path.join(dir, f);
      const pack = JSON.parse(fs.readFileSync(file, 'utf8'));
      let n = 0;
      Object.entries(copyFrom).forEach(([nk, from]) => {
        if (pack[from] != null && pack[nk] == null) {
          pack[nk] = pack[from];
          n++;
        }
      });
      if (n) {
        const sorted = Object.keys(pack)
          .sort()
          .reduce((a, k) => ((a[k] = pack[k]), a), {});
        fs.writeFileSync(file, JSON.stringify(sorted, null, 2) + '\n');
        report.copied = (report.copied || 0) + n;
      }
    });
}

// ─── JS: AST-classified findings → edits ────────────────────────────────────

const { classify } = require('./lib/i18n-ast');

function rewriteJs(file, ns) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const line = (idx) => src.slice(0, idx).split('\n').length;
  const { findings, calls } = classify(src, isCopy);
  const edits = [];
  // Files shared with the server (game engines) carry their English: gtx('key', 'English', params).
  const gtxMode = /\bfunction gtx\(/.test(src);
  findings.forEach((f) => {
    if (f.kind === 'array' || f.kind === 'concat' || f.kind === 'complex' || (gtxMode && (f.kind === 'html-text' || f.kind === 'html-attr' || f.mode === 'html'))) {
      report.manual.push(`${rel}:${line(f.start)}  ${f.kind}${f.why ? ' (' + f.why + ')' : ''}: ${String(f.text).slice(0, 70)}`);
      return;
    }
    const key = keyFor(ns, f.text);
    if (gtxMode) {
      const params = (f.params || []).map((x) => (x.name === x.src ? x.name : `${x.name}: ${x.src}`));
      const english = JSON.stringify(String(f.text)).replace(/^"|"$/g, '').replace(/'/g, "\\'");
      edits.push({ start: f.start, end: f.end, text: `gtx('${key}', '${english}'${params.length ? `, { ${params.join(', ')} }` : ''})` });
      report.rewrites++;
      return;
    }
    if (f.kind === 'html-text' || f.kind === 'html-attr') {
      const call = `tHtml('${key}')`;
      edits.push({ start: f.start, end: f.end, text: f.quote ? `${f.quote} + ${call} + ${f.quote}` : '${' + call + '}' });
    } else {
      const fn = f.mode === 'html' ? 'tHtml' : 't';
      const params = (f.params || []).map((x) => (x.name === x.src ? x.name : `${x.name}: ${x.src}`));
      edits.push({ start: f.start, end: f.end, text: params.length ? `${fn}('${key}', { ${params.join(', ')} })` : `${fn}('${key}')` });
    }
    report.rewrites++;
  });
  // Existing t()/tt() calls: make sure an English message exists; flat keys move into the namespace.
  calls.forEach((c) => {
    // tr() in game UIs is a per-file prefixed helper (games.<id>.) — its keys are harvested separately.
    if (c.name === 'tr') return;
    const resolved = c.key.includes('.') ? c.key : legacy[c.key];
    if (resolved && (en[resolved] != null || added[resolved] != null)) return;
    if (/[${}]/.test(c.key)) return;
    if (!c.fallback || !c.fallback.trim()) {
      report.manual.push(`${rel}:${c.line}  ${c.name}('${c.key}') has no English message and no fallback`);
      return;
    }
    const nk = c.key.includes('.') ? c.key : ns + '.' + c.key;
    if (!(nk in en) && !(nk in added)) {
      added[nk] = tokenize(c.fallback);
      report.keys++;
    }
    if (nk !== c.key) edits.push({ start: c.keyStart, end: c.keyEnd, text: `'${nk}'` });
  });
  return { src, edits };
}

function applyEdits(src, edits) {
  const sorted = edits.slice().sort((a, b) => b.start - a.start);
  let out = src;
  let lastStart = Infinity;
  for (const e of sorted) {
    if (e.end > lastStart) continue; // overlapping — keep the outer/earlier one
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
    lastStart = e.start;
  }
  return out;
}

// ─── index.html ──────────────────────────────────────────────────────────────

function rewriteHtml(file, ns) {
  const src = fs.readFileSync(file, 'utf8');
  const edits = [];
  const masked = src
    .replace(/<script[\s\S]*?<\/script>/gi, (s) => ' '.repeat(s.length))
    .replace(/<style[\s\S]*?<\/style>/gi, (s) => ' '.repeat(s.length))
    .replace(/<!--[\s\S]*?-->/g, (s) => ' '.repeat(s.length));
  // Attributes on any opening tag.
  const tagRe = /<([a-z][\w-]*)(\s[^<>]*?)?(\/?)>/gi;
  let m;
  const opens = [];
  while ((m = tagRe.exec(masked))) {
    const attrs = m[2] || '';
    opens.push({ start: m.index, end: m.index + m[0].length, tag: m[1].toLowerCase(), attrs });
    const add = [];
    attrs.replace(/\b(placeholder|aria-label|title|alt)\s*=\s*"([^"]*)"/g, (all, attr, val) => {
      const dataName = attr === 'aria-label' ? 'aria' : attr;
      if (new RegExp('data-i18n-' + dataName + '=').test(attrs)) return all;
      const v = decodeEntities(val);
      if (!isCopy(v)) return all;
      add.push(` data-i18n-${dataName}="${keyFor(ns, v)}"`);
      return all;
    });
    if (add.length) {
      const insertAt = m.index + m[0].length - (m[3] ? 2 : 1);
      edits.push({ start: insertAt, end: insertAt, text: add.join('') });
      report.rewrites += add.length;
    }
  }
  // Text nodes.
  const textRe = />([^<>]+)</g;
  while ((m = textRe.exec(masked))) {
    const text = m[1];
    const val = decodeEntities(text).replace(/\s+/g, ' ').trim();
    if (!isCopy(val)) continue;
    const textStart = m.index + 1;
    // Nearest tag before the text.
    const open = opens.filter((o) => o.end <= textStart).pop();
    const prevTag = masked.slice(0, textStart).match(/<(\/?)([a-z][\w-]*)[^<>]*>$/i);
    if (!prevTag) continue;
    if (/^(script|style|title)$/i.test(prevTag[2])) continue;
    const nextTag = masked.slice(m.index + m[0].length - 1).match(/^<(\/?)([a-z][\w-]*)/i);
    const key = keyFor(ns, val);
    const isLeaf = open && prevTag[1] === '' && nextTag && nextTag[1] === '/' && nextTag[2].toLowerCase() === open.tag;
    if (isLeaf && !/data-i18n=/.test(open.attrs)) {
      const insertAt = open.end - 1 - (masked[open.end - 2] === '/' ? 1 : 0);
      edits.push({ start: insertAt, end: insertAt, text: ` data-i18n="${key}"` });
    } else if (prevTag[1] === '' && /data-i18n=/.test(open.attrs || '')) {
      continue;
    } else {
      const lead = text.match(/^\s*/)[0];
      const trail = text.match(/\s*$/)[0];
      const st = textStart + lead.length;
      const en2 = textStart + text.length - trail.length;
      edits.push({ start: st, end: en2, text: `<span data-i18n="${key}">${src.slice(st, en2)}</span>` });
    }
    report.rewrites++;
  }
  return { src, edits };
}

function writeEn() {
  const all = Object.assign({}, en, added);
  const sorted = Object.keys(all)
    .sort()
    .reduce((a, k) => ((a[k] = all[k]), a), {});
  const src = fs.readFileSync(EN_FILE, 'utf8');
  fs.writeFileSync(EN_FILE, src.slice(0, src.indexOf('window.CHAUPAAL_I18N_EN')) + 'window.CHAUPAAL_I18N_EN = ' + JSON.stringify(sorted, null, 2) + ';\n');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const surface = args[args.indexOf('--surface') + 1];
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
  const write = args.includes('--write');
  const files = require('./i18n-surfaces.json')[surface];
  if (!files) {
    console.error('unknown surface', surface);
    process.exit(1);
  }
  Object.entries(files).forEach(([rel, ns]) => {
    if (only && !rel.includes(only)) return;
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) return;
    const before = report.rewrites;
    const { src, edits } = rel.endsWith('.html') ? rewriteHtml(abs, ns) : rewriteJs(abs, ns);
    const out = applyEdits(src, edits);
    if (write && out !== src) fs.writeFileSync(abs, out);
    console.log(`${rel.padEnd(52)} ${String(report.rewrites - before).padStart(4)} rewrites`);
  });
  if (write) {
    writeEn();
    copyTranslations();
  }
  console.log(`rewrites ${report.rewrites} · new keys ${report.keys} · reused ${report.reused} · translations carried ${report.copied || 0}`);
  if (report.manual.length) {
    console.log(`\nHand-fix (${report.manual.length}):`);
    report.manual.forEach((m) => console.log('  ' + m));
  }
}

module.exports = { slug, keyFor, tokenize, decodeEntities, rewriteJs, rewriteHtml, applyEdits };
