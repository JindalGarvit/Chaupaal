#!/usr/bin/env node
/**
 * Hard-coded user-visible strings that don't go through t() (Global L1).
 *
 * Scans public/src/js/**\/*.js and public/index.html for copy in UI sinks:
 *   el.textContent / innerText / title / placeholder / ariaLabel = '…'
 *   showToast / alert / confirm / prompt('…')
 *   setAttribute('aria-label' | 'placeholder' | 'title', '…')
 *   HTML in template / string literals: text between tags, placeholder="…", aria-label="…", title="…"
 *   index.html: element text and those attributes without a data-i18n* key
 * Text inside ${…} (e.g. ${tt('key', 'Fallback')}) is not counted — it already goes through t().
 * Allowlisted: glossary terms, numbers/symbols/emoji, ids/classes/CSS/URLs, single words in ALL_CAPS ids.
 *
 * Usage:
 *   node scripts/i18n-lint.js                 per-surface counts
 *   node scripts/i18n-lint.js --list [surface] file:line list
 *   node scripts/i18n-lint.js --json
 *   node scripts/i18n-lint.js --write-baseline   record scripts/i18n-lint-baseline.json
 *   node scripts/i18n-lint.js --ratchet          exit 1 if any surface got worse than the baseline
 * L2–L5 drive each surface to 0.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const JS_DIR = path.join(ROOT, 'public', 'src', 'js');
const BASELINE = path.join(__dirname, 'i18n-lint-baseline.json');

const GLOSSARY = [
  'Chaupaal', 'Dangal', 'Baithak', 'Mehfil', 'Peepal', 'Akhbaar', 'Duniya', 'Khoj', 'Vriksha', 'Muqabala',
  'Raja Mantri Chor Sipahi', 'Teen Patti', 'Carrom', 'Tambola', 'Kakuro', 'Shabd Five', 'Oh No!', 'Tip Tap',
];
const SKIP_FILES = /(^|[\\/])(data[\\/]|i18n\.js$|i18n-format\.js$|i18n-layout\.js$|.*-core\.js$|.*-engine\.js$|.*-bank\.js$|.*-lexicon\.js$|.*-answers\.js$|samples\.js$)/;

function surfaceOf(rel) {
  const f = rel.replace(/\\/g, '/').toLowerCase();
  if (f.endsWith('index.html')) return 'index.html';
  if (/mehfil/.test(f)) return 'mehfil';
  if (/music/.test(f)) return 'music';
  if (/baithak-chat|chat-|-chat\b|media-picker|ai-keyboard/.test(f)) return 'chat';
  if (/baithak|group-info|instants|relationships|contacts/.test(f)) return 'baithak';
  if (/duniya|stories|story/.test(f)) return 'duniya';
  if (/akhbaar|categories|category|streak|safar|quiz-ui/.test(f)) return 'akhbaar';
  if (/khoj|discovery/.test(f)) return 'khoj';
  if (/vriksha/.test(f)) return 'vriksha';
  if (/peepal|comments/.test(f)) return 'peepal';
  if (/\/games\/|dangal/.test(f)) return 'dangal';
  if (/\/auth\//.test(f)) return 'auth';
  if (/onboarding|first-run|day0/.test(f)) return 'onboarding';
  if (/profile|archive|soft-delete|sessions/.test(f)) return 'profile';
  if (/notif|push/.test(f)) return 'notifications';
  if (/settings|state\.js|theme|money|membership|pwa/.test(f)) return 'settings';
  return 'common';
}

/** Is this text something a person reads (and translators should own)? */
function isCopy(raw) {
  let s = String(raw || '')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return false;
  GLOSSARY.forEach((g) => (s = s.split(g).join(' ')));
  s = s.trim();
  if (!/[A-Za-z]{2,}/.test(s)) return false; // numbers, symbols, emoji, glossary-only
  if (/^[\w-]+$/.test(s) && /[-_]/.test(s)) return false; // ids / classes / keys
  if (/^[a-z]+([A-Z][a-z]*)+$/.test(s)) return false; // camelCase identifiers
  if (/^[A-Z0-9_]+$/.test(s)) return false; // CONSTANTS
  if (/^(https?:|\/|#|\.|data:|mailto:)/.test(s)) return false;
  if (/^[\w-]+\s*:\s*[^;]+;?(\s*[\w-]+\s*:\s*[^;]+;?)*$/.test(s) && /;|px|%|var\(/.test(s)) return false; // CSS
  if (/^(px|em|rem|vh|vw|ms|s|deg|auto|none|true|false|null|undefined|on|off)$/i.test(s)) return false;
  if (/[{}<>=]|=>|\(\)/.test(s) && !/\s[a-z]{3,}\s/i.test(s)) return false; // code
  return true;
}

/** Remove ${…} expressions (balanced) so fallbacks passed to t() don't count. */
function stripExpressions(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '$' && s[i + 1] === '{') {
      let depth = 0;
      let j = i + 1;
      for (; j < s.length; j++) {
        if (s[j] === '{') depth++;
        else if (s[j] === '}' && --depth === 0) break;
      }
      out += ' ';
      i = j;
      continue;
    }
    out += s[i];
  }
  return out;
}

function lineOf(src, index) {
  let n = 1;
  for (let i = 0; i < index && i < src.length; i++) if (src.charCodeAt(i) === 10) n++;
  return n;
}

/**
 * Tokenize string / template literals (nested `${ `…` }` included), skipping comments and regex
 * literals. Template text = its static parts joined by a space (expressions dropped).
 */
function extractLiterals(src) {
  const out = [];
  const n = src.length;
  let i = 0;
  let lastSig = '';
  const regexOk = () => !lastSig || /[(,=:[!&|?{};+\-*%<>~^]$/.test(lastSig) || /\b(return|typeof|case|in|of|void|delete|throw)$/.test(lastSig);
  function readString(q, start) {
    let j = start + 1;
    let text = '';
    while (j < n && src[j] !== q) {
      if (src[j] === '\\') {
        text += src[j + 1] || '';
        j += 2;
        continue;
      }
      if (src[j] === '\n') break;
      text += src[j++];
    }
    return { end: j + 1, text };
  }
  function readTemplate(start) {
    let j = start + 1;
    let text = '';
    while (j < n && src[j] !== '`') {
      if (src[j] === '\\') {
        text += src[j + 1] || '';
        j += 2;
        continue;
      }
      if (src[j] === '$' && src[j + 1] === '{') {
        j = skipExpression(j + 2);
        text += ' ';
        continue;
      }
      text += src[j++];
    }
    out.push({ index: start, end: j + 1, text, tpl: true });
    return j + 1;
  }
  function skipExpression(j) {
    let depth = 1;
    while (j < n && depth > 0) {
      const c = src[j];
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (!depth) return j + 1;
      } else if (c === '`') {
        j = readTemplate(j);
        continue;
      } else if (c === '"' || c === "'") {
        const r = readString(c, j);
        out.push({ index: j, end: r.end, text: r.text });
        j = r.end;
        continue;
      } else if (c === '/' && src[j + 1] === '/') {
        while (j < n && src[j] !== '\n') j++;
        continue;
      } else if (c === '/' && src[j + 1] === '*') {
        j = src.indexOf('*/', j + 2) + 2 || n;
        continue;
      }
      j++;
    }
    return j;
  }
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2);
      i = e < 0 ? n : e + 2;
      continue;
    }
    if (c === '/' && regexOk()) {
      let j = i + 1;
      let cls = false;
      while (j < n && src[j] !== '\n') {
        if (src[j] === '\\') j += 2;
        else if (src[j] === '[') cls = true, j++;
        else if (src[j] === ']') cls = false, j++;
        else if (src[j] === '/' && !cls) break;
        else j++;
      }
      i = j + 1;
      while (i < n && /[a-z]/i.test(src[i])) i++;
      lastSig = 'x';
      continue;
    }
    if (c === '"' || c === "'") {
      const r = readString(c, i);
      out.push({ index: i, end: r.end, text: r.text });
      i = r.end;
      lastSig = 'x';
      continue;
    }
    if (c === '`') {
      i = readTemplate(i);
      lastSig = 'x';
      continue;
    }
    if (!/\s/.test(c)) lastSig = (lastSig + c).slice(-8);
    i++;
  }
  return out;
}

const SINK_BEFORE = [
  [/\.(textContent|innerText|title|placeholder|ariaLabel)\s*=\s*$/, (m) => m[1]],
  [/\b(showToast|alert|confirm|prompt|showInlineError)\s*\(\s*$/, (m) => m[1]],
  [/setAttribute\(\s*['"](aria-label|placeholder|title|alt)['"]\s*,\s*$/, (m) => m[1]],
];
/** Literal is a t()/tt()/tr() key or fallback — already translatable. */
const T_ARG_BEFORE = /\b(t|tt|tr|tx|txv|tn|tHtml|htt|i18nT|ptrLabel|tlabel|label)\s*\(\s*(?:['"`][^'"`]*['"`]\s*,\s*)?$/;
/** Developer-facing / non-display positions: logs, errors, analytics, comparisons, selectors. */
const NOT_UI_BEFORE = /(console\.\w+\(\s*|(?:new\s+)?Error\(\s*|reportClientError\([^)]*|trackEvent\(\s*|trackSignal\(\s*|logEvent\(\s*|warn\(\s*|===?\s*|!==?\s*|case\s+|\.(?:includes|startsWith|endsWith|test|match|indexOf|split|replace|querySelector(?:All)?|closest|matches|getItem|setItem|removeItem|getElementById|addEventListener|removeEventListener|dispatchEvent|getAttribute|setAttribute|toggle|add|remove|contains)\(\s*(?:['"`][^'"`]*['"`]\s*,\s*)?|RegExp\(\s*|require\(\s*|import\(\s*|fetch\(\s*|apiFetch\(\s*|collection\(\s*|doc\(\s*|\bin\s+|typeof\s+\w+\s*[!=]==?\s*)$/;

/** Sentence-like text a person reads (2+ words, letters, not code / css / urls / keys). */
function isProse(raw) {
  const s = String(raw || '').trim();
  if (s.length < 6 || !/\s/.test(s) || !/[a-z]{2,}/.test(s)) return false;
  if (!/^[\p{L}\p{Emoji}"“‘'(¿¡]/u.test(s)) return false;
  if ((s.match(/[A-Za-z]{2,}/g) || []).length < 2) return false;
  if (/[{};]|=>|\$\(|\bfunction\b|\breturn\b|&&|\|\||^use strict$|\bvar\(--|\brgba?\(|\b\d+px\b/.test(s)) return false;
  if (/^[\w-]+(\s+[\w-]+)*$/.test(s) && /-/.test(s) && !/\s[a-z]+\s/.test(s)) return false; // class lists
  if (/^(\.|#|\[|@|\/|https?:)/.test(s) || /:\s*[\w#-]+;?\s*$/.test(s)) return false;
  if (/^(Bearer|Basic|GET|POST|PUT|DELETE|application\/|text\/|image\/)/.test(s)) return false;
  return isCopy(s);
}

const HTML_TEXT = />([^<>]+)</g;
const HTML_ATTR = /\b(placeholder|aria-label|title|alt)\s*=\s*\\?["']([^"'\\]+)\\?["']/g;

let astClassify = null;
try {
  astClassify = require('./lib/i18n-ast').classify;
} catch (e) {
  astClassify = null; // acorn not installed — fall back to the tokenizer below
}

function scanJs(rel, src) {
  if (astClassify) {
    try {
      return astClassify(src, isCopy).findings.map((f) => ({
        file: rel,
        line: lineOf(src, f.start),
        kind: f.kind,
        text: String(f.text).replace(/\s+/g, ' ').trim().slice(0, 80),
      }));
    } catch (e) {
      /* unparsable file — tokenizer fallback */
    }
  }
  return scanJsTokens(rel, src);
}

function scanJsTokens(rel, src) {
  const hits = [];
  const add = (index, kind, text) => {
    const t = String(text).replace(/\s+/g, ' ').trim();
    if (isCopy(t)) hits.push({ file: rel, line: lineOf(src, index), kind, text: t.slice(0, 80) });
  };
  extractLiterals(src).forEach((lit) => {
    const before = src.slice(Math.max(0, lit.index - 80), lit.index);
    if (T_ARG_BEFORE.test(before)) return;
    for (const [re, kind] of SINK_BEFORE) {
      const m = re.exec(before);
      if (m) {
        add(lit.index, kind(m), lit.text);
        return;
      }
    }
    const body = lit.text;
    if (body.indexOf('<') < 0 || !/<\/?[a-z][\w-]*[\s>/]/i.test(body)) {
      // Prose: a sentence-like literal anywhere else (returns, defaults, labels in objects …).
      if (isProse(body) && !NOT_UI_BEFORE.test(before) && !/^\s*:/.test(src.slice(lit.end || lit.index, (lit.end || lit.index) + 3))) {
        add(lit.index, 'prose', body);
      }
      return;
    }
    let h;
    HTML_TEXT.lastIndex = 0;
    while ((h = HTML_TEXT.exec(body))) add(lit.index, 'html-text', h[1]);
    HTML_ATTR.lastIndex = 0;
    while ((h = HTML_ATTR.exec(body))) add(lit.index, 'html-' + h[1], h[2]);
  });
  return hits;
}

function scanIndex(rel, src) {
  const hits = [];
  const body = src.replace(/<script[\s\S]*?<\/script>/gi, (s) => ' '.repeat(s.length)).replace(/<style[\s\S]*?<\/style>/gi, (s) => ' '.repeat(s.length)).replace(/<!--[\s\S]*?-->/g, (s) => ' '.repeat(s.length));
  // Element text: the nearest opening tag must carry data-i18n.
  const re = /<([a-z][\w-]*)([^<>]*)>([^<>]+)</gi;
  let m;
  while ((m = re.exec(body))) {
    const [, tag, attrs, text] = m;
    if (/^(script|style|title)$/i.test(tag)) continue;
    if (/data-i18n(-slots)?=/.test(attrs)) continue;
    const t = text.replace(/\s+/g, ' ').trim();
    if (isCopy(t)) hits.push({ file: rel, line: lineOf(src, m.index), kind: 'html-text', text: t.slice(0, 80) });
  }
  // Text after a closing tag ("…</button>. Real identity required.") — only allowed inside a data-i18n-slots sentence.
  const after = /<\/[a-z][\w-]*\s*>([^<>]+)</gi;
  while ((m = after.exec(body))) {
    const t = m[1].replace(/\s+/g, ' ').trim().replace(/^[.,;:!?·—–-]+\s*/, '');
    if (!t || !isCopy(t)) continue;
    const lineStart = body.lastIndexOf('\n', m.index) + 1;
    const lineEnd = body.indexOf('\n', m.index);
    if (/data-i18n-slots=/.test(body.slice(lineStart, lineEnd < 0 ? undefined : lineEnd))) continue;
    hits.push({ file: rel, line: lineOf(src, m.index), kind: 'html-text', text: t.slice(0, 80) });
  }
  const at = /<[a-z][\w-]*([^<>]*)>/gi;
  while ((m = at.exec(body))) {
    const attrs = m[1];
    let a;
    const ar = /\b(placeholder|aria-label|title|alt)\s*=\s*"([^"]*)"/g;
    while ((a = ar.exec(attrs))) {
      const key = a[1] === 'aria-label' ? 'aria' : a[1];
      if (new RegExp('data-i18n-' + key + '=').test(attrs)) continue;
      if (isCopy(a[2])) hits.push({ file: rel, line: lineOf(src, m.index), kind: 'html-' + a[1], text: a[2].slice(0, 80) });
    }
  }
  return hits;
}

function walk(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  });
  return out;
}

function lint() {
  const hits = [];
  walk(JS_DIR, []).forEach((abs) => {
    const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
    if (SKIP_FILES.test(rel)) return;
    hits.push(...scanJs(rel, fs.readFileSync(abs, 'utf8')));
  });
  hits.push(...scanIndex('public/index.html', fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8')));
  const bySurface = {};
  hits.forEach((h) => {
    h.surface = surfaceOf(h.file);
    bySurface[h.surface] = (bySurface[h.surface] || 0) + 1;
  });
  return { total: hits.length, bySurface, hits };
}

/** Findings in the files one extraction arc owns (scripts/i18n-surfaces.json → <id>). */
function lintSurface(id) {
  const files = Object.keys(require('./i18n-surfaces.json')[id] || {});
  const hits = [];
  files.forEach((rel) => {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) return;
    const src = fs.readFileSync(abs, 'utf8');
    hits.push(...(rel.endsWith('.html') ? scanIndex(rel, src) : scanJs(rel, src)));
  });
  return { files: files.length, hits };
}

if (require.main === module && process.argv.includes('--surface')) {
  const id = process.argv[process.argv.indexOf('--surface') + 1];
  const res = lintSurface(id);
  res.hits.forEach((h) => console.log(`${h.file}:${h.line}  [${h.kind}]  ${h.text}`));
  console.log(`${id}: ${res.hits.length} hard-coded strings in ${res.files} files`);
  process.exit(res.hits.length ? 1 : 0);
}

if (require.main === module && !process.argv.includes('--surface')) {
  const res = lint();
  const args = process.argv.slice(2);
  if (args.includes('--json')) {
    console.log(JSON.stringify({ total: res.total, bySurface: res.bySurface }, null, 2));
  } else if (args.includes('--list')) {
    const only = args[args.indexOf('--list') + 1];
    res.hits.filter((h) => !only || only.startsWith('--') || h.surface === only).forEach((h) => console.log(`${h.file}:${h.line}  [${h.kind}]  ${h.text}`));
  } else {
    console.log('Hard-coded UI strings (not through t()) by surface:');
    Object.entries(res.bySurface)
      .sort((a, b) => b[1] - a[1])
      .forEach(([s, n]) => console.log(`  ${s.padEnd(14)} ${String(n).padStart(5)}`));
    console.log(`  ${'TOTAL'.padEnd(14)} ${String(res.total).padStart(5)}`);
  }
  if (args.includes('--write-baseline')) {
    fs.writeFileSync(BASELINE, JSON.stringify({ total: res.total, bySurface: res.bySurface }, null, 2) + '\n');
    console.log('baseline written → scripts/i18n-lint-baseline.json');
  }
  if (args.includes('--ratchet')) {
    const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
    const worse = Object.entries(res.bySurface).filter(([s, n]) => n > (base.bySurface[s] || 0));
    worse.forEach(([s, n]) => console.log(`  ✗ ${s}: ${n} > baseline ${base.bySurface[s] || 0} — new hard-coded copy; use t()`));
    process.exit(worse.length ? 1 : 0);
  }
}

module.exports = { lint, lintSurface, isCopy, scanJs, scanIndex, surfaceOf, stripExpressions };
