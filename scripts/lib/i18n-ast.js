/**
 * Shared AST classifier for user-visible strings (i18n-lint + i18n-extract).
 * Every string / template literal in a JS file is classified by where it sits:
 *   skip      t()-family args, logs/errors/analytics, comparisons, object keys, selectors, storage keys …
 *   sink      showToast / alert / confirm / prompt arg, el.textContent|title|placeholder|ariaLabel = …,
 *             setAttribute('aria-label'|'placeholder'|'title'|'alt', …)
 *   label     value of { title|label|message|… : … }, label args of profileField / profileToggle
 *   prose     any other sentence-like literal (returns, defaults, arguments)
 *   html      HTML in a literal → its text nodes / attributes
 *   array     element of an array literal (often stored values — never auto-rewritten);
 *             arrays preceded by a  i18n-values  comment hold codes whose labels come from optionLabel()
 *   concat    copy glued with + (needs a full-sentence message)
 *   complex   template with an expression that can't become a {{param}}
 * Lines with an  i18n-ignore  comment are skipped (keep that allowlist tiny).
 */
'use strict';

const acorn = require('acorn');
const walk = require('acorn-walk');

const T_FUNCS = new Set(['t', 'tt', 'tr', 'tx', 'txv', 'tn', 'tHtml', 'htt', 'i18nT', 'ptrLabel', 'tLabel', 'optionLabel', 'optionLabelHtml', 'tv', 'tEn']);
const LOG_CALLS = new Set(['log', 'warn', 'error', 'info', 'debug', 'trace', 'reportClientError', 'trackEvent', 'trackSignal', 'logEvent', 'captureException', 'debugLog', 'gtag', 'track']);
const NONUI_METHODS = new Set([
  'querySelector', 'querySelectorAll', 'getElementById', 'getElementsByClassName', 'closest', 'matches',
  'includes', 'startsWith', 'endsWith', 'indexOf', 'lastIndexOf', 'test', 'match', 'matchAll', 'replace', 'replaceAll', 'split', 'search',
  'getItem', 'setItem', 'removeItem', 'addEventListener', 'removeEventListener', 'dispatchEvent', 'getAttribute',
  'removeAttribute', 'hasAttribute', 'toggleAttribute', 'add', 'remove', 'toggle', 'contains', 'fetch', 'apiFetch',
  'collection', 'doc', 'where', 'orderBy', 'child', 'ref', 'require', 'importScripts', 'postMessage', 'createElement',
  'insertAdjacentElement', 'setProperty', 'getPropertyValue', 'open', 'has', 'get', 'set', 'delete', 'emit', 'on', 'off',
  'once', 'join', 'padStart', 'padEnd', 'normalize', 'localeCompare', 'toLocaleString', 'format', 'CustomEvent', 'Event',
  'RegExp', 'URL', 'URLSearchParams', 'Blob', 'File', 'Audio', 'Image', 'setTimeout', 'matchMedia', 'getComputedStyle',
  'scrollTo', 'animate', 'callAI', 'readCache', 'writeCache', 'safeFeature', 'beginOverlayScope', 'pushNavLayer',
]);
const SINK_PROPS = new Set(['textContent', 'innerText', 'title', 'placeholder', 'ariaLabel', 'alt']);
const HTML_PROPS = new Set(['innerHTML', 'outerHTML']);
const SINK_CALLS = new Set(['showToast', 'alert', 'confirm', 'prompt', 'showInlineError']);
const LABEL_CALLS = { profileField: [0, 3], profileToggle: [0], privacyInline: [1] };
const LABEL_KEYS = new Set([
  'title', 'label', 'message', 'msg', 'body', 'hint', 'placeholder', 'desc', 'description', 'subtitle', 'sub', 'cta',
  'ctaLabel', 'actionLabel', 'retryLabel', 'confirmLabel', 'cancelLabel', 'okLabel', 'ariaLabel', 'tooltip', 'emptyText',
  'heading', 'caption', 'lead', 'note', 'tip', 'helper', 'headline', 'kicker', 'eyebrow', 'payoff', 'empty', 'confirmText',
  'cancelText', 'buttonLabel', 'primaryLabel', 'secondaryLabel', 'doneLabel', 'blurb', 'tagline',
]);
const SINK_ATTRS = new Set(['aria-label', 'placeholder', 'title', 'alt']);
const NONUI_PROPS = new Set(['rel', 'target', 'id', 'className', 'href', 'src', 'type', 'name', 'key', 'method', 'lang', 'dir', 'autocomplete', 'inputMode', 'role', 'download', 'accept']);
/** File names, paths and URLs are never copy. */
const ASSET_RE = /^(https?:|data:|blob:|\/|\.\/)|\.(png|jpe?g|svg|gif|webp|ico|mp3|mp4|webm|json|js|css|html)$/i;
const HTML_RE = /<\/?[a-z][\w-]*[\s>/]/i;

function parse(src) {
  const comments = [];
  const opts = { ecmaVersion: 'latest', allowHashBang: true, allowReturnOutsideFunction: true, onComment: comments, locations: true };
  try {
    return { ast: acorn.parse(src, Object.assign({ sourceType: 'script' }, opts)), comments };
  } catch (e) {
    comments.length = 0;
    return { ast: acorn.parse(src, Object.assign({ sourceType: 'module' }, opts)), comments };
  }
}

function calleeName(call) {
  const c = call.callee;
  if (!c) return '';
  if (c.type === 'Identifier') return c.name;
  if (c.type === 'MemberExpression' && !c.computed && c.property) return c.property.name;
  return '';
}

function isConsole(call) {
  const c = call.callee;
  return c && c.type === 'MemberExpression' && c.object && c.object.type === 'Identifier' && c.object.name === 'console';
}

/** Sentence-like copy (2+ words) — shared with i18n-lint's isCopy. */
function makeIsProse(isCopy) {
  return function isProse(raw) {
    const s = String(raw || '').trim();
    if (s.length < 6 || !/\s/.test(s) || !/[a-z]{2,}/.test(s)) return false;
    if (!/^[\p{L}\p{Emoji}"“‘'(¿¡]/u.test(s)) return false;
    if ((s.match(/[A-Za-z]{2,}/g) || []).length < 2) return false;
    if (/[{};]|=>|\$\(|\bfunction\b|\breturn\b|&&|\|\||^use strict$|\bvar\(--|\brgba?\(|\b\d+px\b/.test(s)) return false;
    if (/^[\w-]+(\s+[\w-]+)*$/.test(s) && /-/.test(s) && !/\s[a-z]+\s/.test(s)) return false;
    if (/^(\.|#|\[|@|\/|https?:)/.test(s) || /:\s*[\w#-]+;?\s*$/.test(s)) return false;
    if (/^[a-z-]+\([^)]*\)(\s+[a-z-]+\([^)]*\))*$/i.test(s)) return false; // CSS functions: translate(0,0) rotate(0deg)
    return isCopy(s);
  };
}

/** Simple ${expr} → param name; null when it can't be a {{param}}. */
function paramFor(expr, src) {
  const text = src.slice(expr.start, expr.end);
  const chain = (n) => n.type === 'Identifier' || (n.type === 'MemberExpression' && !n.computed && chain(n.object)) || (n.type === 'MemberExpression' && n.computed && n.property.type === 'Literal' && chain(n.object)) || n.type === 'ThisExpression';
  const simple = chain(expr) || (expr.type === 'ChainExpression' && chain(expr.expression)) || (expr.type === 'CallExpression' && expr.arguments.length <= 2 && chain(expr.callee));
  if (!simple) return null;
  let name = (text.match(/([A-Za-z_$][\w$]*)\s*(\(.*\))?\s*$/) || [])[1] || 'value';
  if (/^(length|size|count)$/.test(name)) {
    const parts = text.replace(/\(.*\)$/, '').split(/\??\./);
    name = (parts[parts.length - 2] || 'item').replace(/\W/g, '') + 'Count';
  }
  if (/^(esc|escape|escapeHtml|escHtml|escAttr|String|Number|fmt|formatNumber|formatDate|formatTime|formatCompact|formatRelativeTime)$/.test(name) && expr.type === 'CallExpression' && expr.arguments[0]) {
    const inner = src.slice(expr.arguments[0].start, expr.arguments[0].end);
    name = (inner.match(/([A-Za-z_$][\w$]*)\s*$/) || [])[1] || 'value';
  }
  return { name, src: text };
}

/**
 * @returns {{ findings: object[] }} each: { kind, start, end, mode, text, params?, raw?, quote? }
 */
function classify(src, isCopy) {
  const isProse = makeIsProse(isCopy);
  const { ast, comments } = parse(src);
  const ignoredLines = new Set();
  const valueMarks = [];
  const copyMarks = [];
  comments.forEach((c) => {
    if (/i18n-ignore/.test(c.value)) ignoredLines.add(c.loc.start.line);
    if (/i18n-values/.test(c.value)) valueMarks.push(c.end);
    if (/i18n-copy/.test(c.value)) copyMarks.push(c.end);
  });
  const findings = [];
  /** A marker comment right before this node or any ancestor applies to everything nested in it. */
  const marked = (ancestors, marks) => ancestors.some((a) => marks.some((e) => a.start >= e && a.start - e < 80 && /^[\s=:(]*$/.test(src.slice(e, a.start)) ));
  const lineOf = (pos) => src.slice(0, pos).split('\n').length;

  function context(node, ancestors) {
    let child = node;
    let i = ancestors.length - 2;
    let concat = false;
    let html = false;
    let inTag = false;
    let copyAttr = false;
    while (i >= 0) {
      const p = ancestors[i];
      if (p.type === 'ConditionalExpression' && p.test !== child) {
        child = p;
        i--;
        continue;
      }
      if (p.type === 'LogicalExpression' || p.type === 'ChainExpression' || p.type === 'AwaitExpression') {
        child = p;
        i--;
        continue;
      }
      if (p.type === 'BinaryExpression' && p.operator === '+') {
        concat = true;
        child = p;
        i--;
        continue;
      }
      if (p.type === 'TemplateLiteral') {
        if (p.quasis.some((q) => HTML_RE.test(q.value.cooked || q.value.raw))) {
          html = true;
          // ${…} inside a tag (`class="x ${on?'active':''}"`) is markup unless it sits in a copy attribute.
          const at = p.expressions.indexOf(child);
          if (at >= 0 && !inTag) {
            const before = p.quasis.slice(0, at + 1).map((q) => q.value.raw).join('\u0000');
            const lt = before.lastIndexOf('<');
            if (lt > before.lastIndexOf('>')) {
              inTag = true;
              copyAttr = /\b(title|aria-label|placeholder|alt)=["'][^"']*$/.test(before.slice(lt));
            }
          }
        }
        child = p;
        i--;
        continue;
      }
      break;
    }
    return { parent: ancestors[i] || null, child, concat, html, grand: ancestors[i - 1] || null, inTag, copyAttr };
  }

  function decide(node, ancestors) {
    const { parent: p, child, concat, html, grand, inTag, copyAttr } = context(node, ancestors);
    if (inTag && !copyAttr) return { role: 'skip' };
    if (!p) return { role: 'prose', concat, html };
    // Anything inside a  i18n-values  list or map is a stored value / id, never copy.
    if (marked(ancestors, valueMarks)) return { role: 'skip' };
    switch (p.type) {
      case 'CallExpression':
      case 'NewExpression': {
        const name = calleeName(p);
        if (T_FUNCS.has(name)) return { role: 'skip' };
        if (isConsole(p) || LOG_CALLS.has(name) || name === 'Error' || /Error$/.test(name)) return { role: 'skip' };
        const argIdx = p.arguments.indexOf(child);
        if (SINK_CALLS.has(name) && argIdx === 0) return { role: 'sink', concat, html };
        if (name === 'setAttribute' && argIdx === 1 && p.arguments[0] && p.arguments[0].type === 'Literal' && SINK_ATTRS.has(p.arguments[0].value)) return { role: 'sink', concat, html };
        if (name === 'insertAdjacentHTML' && argIdx === 1) return { role: 'sink', concat, html: true };
        if (Object.prototype.hasOwnProperty.call(LABEL_CALLS, name) && LABEL_CALLS[name].includes(argIdx)) return { role: 'label', concat, html };
        if (NONUI_METHODS.has(name)) return { role: 'skip' };
        return { role: 'prose', concat, html };
      }
      case 'ThrowStatement':
        return { role: 'skip' };
      case 'AssignmentExpression': {
        if (p.right !== child) return { role: 'skip' };
        const l = p.left;
        const prop = l.type === 'MemberExpression' && !l.computed ? l.property.name : '';
        if (SINK_PROPS.has(prop)) return { role: 'sink', concat, html };
        if (HTML_PROPS.has(prop)) return { role: 'sink', concat, html: true };
        if (NONUI_PROPS.has(prop)) return { role: 'skip' };
        if (l.type === 'MemberExpression' && l.object && /dataset|style/.test(src.slice(l.object.start, l.object.end))) return { role: 'skip' };
        return { role: 'prose', concat, html };
      }
      case 'Property': {
        if (p.key === child && !p.computed) return { role: 'skip' };
        const k = p.key && (p.key.name || p.key.value);
        if (LABEL_KEYS.has(k)) return { role: 'label', concat, html };
        if (/^(id|key|type|kind|mode|icon|emoji|class|className|cls|tab|section|surface|action|event|route|path|url|href|src|value|code|field|name|slug|tag|variant|accent|color|status|state|role|feature|source|transform|easing|fill|transition|animation)$/i.test(k)) return { role: 'skip' };
        if (/[a-z](Sec|Section|Tab|Id|Key|Code|Type|Kind|Mode|Status|Visibility|Route|Path|Url)$/.test(k)) return { role: 'skip' };
        return { role: 'prose', concat, html };
      }
      case 'BinaryExpression':
        return { role: 'skip' }; // comparisons / in / instanceof
      case 'SwitchCase':
      case 'ImportExpression':
      case 'ImportDeclaration':
      case 'ExportNamedDeclaration':
        return { role: 'skip' };
      case 'MemberExpression':
        return p.computed && p.property === child ? { role: 'skip' } : { role: 'prose', concat, html };
      case 'ArrayExpression': {
        if (marked(ancestors, valueMarks)) return { role: 'skip' };
        if (marked(ancestors, copyMarks)) return { role: 'copy', concat, html };
        // Option lists: { key, options: [...] } and profileField(label, key, type, ph, [...])
        const gp = grand;
        if (gp && gp.type === 'Property' && (gp.key.name || gp.key.value) === 'options') return { role: 'skip' };
        if (gp && gp.type === 'CallExpression' && calleeName(gp) === 'profileField' && gp.arguments[4] === p) return { role: 'skip' };
        return { role: 'array', concat, html };
      }
      case 'ExpressionStatement':
        return { role: 'skip' }; // 'use strict' and bare literals
      default:
        return { role: 'prose', concat, html };
    }
  }

  function push(f) {
    if (ignoredLines.has(lineOf(f.start))) return;
    findings.push(f);
  }

  function htmlInRaw(rawStart, raw, mode, quote) {
    // Text nodes + static attributes in one quasi / string body (positions absolute).
    let m;
    const textRe = />([^<>]+)</g;
    while ((m = textRe.exec(raw))) {
      const text = m[1];
      const lead = text.match(/^\s*/)[0];
      const trail = text.match(/\s*$/)[0];
      const value = text.trim();
      if (!value || /\$\{/.test(value) || !isCopy(decode(value))) continue;
      push({ kind: 'html-text', start: rawStart + m.index + 1 + lead.length, end: rawStart + m.index + 1 + text.length - trail.length, mode, text: decode(value), quote });
    }
    const attrRe = /\b(placeholder|aria-label|title|alt)=(\\?["'])([^"'\\$]+)\2/g;
    while ((m = attrRe.exec(raw))) {
      const v = decode(m[3]);
      if (!isCopy(v)) continue;
      const st = rawStart + m.index + m[0].indexOf(m[3], m[1].length);
      push({ kind: 'html-attr', start: st, end: st + m[3].length, mode, text: v, quote });
    }
  }

  walk.fullAncestor(ast, (node, state, ancestors) => {
    if (node.type === 'Literal' && typeof node.value === 'string') {
      const parentT = ancestors[ancestors.length - 2];
      if (parentT && parentT.type === 'TaggedTemplateExpression') return;
      const value = node.value;
      if (ASSET_RE.test(value.trim())) return;
      const d = decide(node, ancestors);
      if (d.role === 'skip') return;
      if (HTML_RE.test(value)) {
        htmlInRaw(node.start + 1, src.slice(node.start + 1, node.end - 1), 'html', src[node.start]);
        // Copy hanging off a tag edge ("…</b> joined") needs a sentence.
        if (d.concat && /^[^<]*[A-Za-z]{2,}[^<]*</.test(value) && isCopy(value.split('<')[0])) push({ kind: 'concat', start: node.start, end: node.end, text: value.split('<')[0].trim() });
        return;
      }
      if (d.role === 'array') {
        if (isCopy(value) && (isProse(value) || /^[A-Z][a-z]/.test(value))) push({ kind: 'array', start: node.start, end: node.end, text: value });
        return;
      }
      const copy =
        d.role === 'sink' || d.role === 'label'
          ? isCopy(value)
          : d.role === 'copy'
            ? isProse(value) || (/^[A-Z][a-z]/.test(value) && isCopy(value))
            : isProse(value);
      if (!copy) return;
      if (d.concat) {
        push({ kind: 'concat', start: node.start, end: node.end, text: value });
        return;
      }
      push({ kind: d.role === 'copy' ? 'label' : d.role, start: node.start, end: node.end, mode: d.html ? 'html' : 'text', text: value });
      return;
    }
    if (node.type === 'TemplateLiteral') {
      const parentT = ancestors[ancestors.length - 2];
      if (parentT && parentT.type === 'TaggedTemplateExpression') return;
      const hasHtml = node.quasis.some((q) => HTML_RE.test(q.value.cooked || q.value.raw));
      if (hasHtml) {
        const d = decide(node, ancestors);
        if (d.role === 'skip') return;
        node.quasis.forEach((q, qi) => {
          const raw = src.slice(q.start, q.end);
          htmlInRaw(q.start, raw, 'html', null);
          if (node.expressions.length) {
            const head = qi > 0 ? (/^([^<>]*)</.exec(raw) || [])[1] : null;
            const tail = qi < node.quasis.length - 1 ? (/>([^<>]*)$/.exec(raw) || [])[1] : null;
            [head, tail].forEach((piece) => {
              if (piece && /[A-Za-z]{2,}/.test(piece) && isCopy(piece.trim())) push({ kind: 'complex', start: q.start, end: q.end, text: piece.trim(), why: 'text next to ${…} in HTML' });
            });
          }
        });
        return;
      }
      // Keys / ids built from parts (chaupaal_tab_nudge_v1_${uid}) — no quasi has a space.
      if (node.expressions.length && node.quasis.every((q) => /^[\w.:/#-]*$/.test(q.value.cooked || ''))) return;
      const d = decide(node, ancestors);
      if (d.role === 'skip') return;
      const plain = node.quasis.map((q) => q.value.cooked || '').join(' ');
      const copy = d.role === 'sink' || d.role === 'label' ? isCopy(plain) : isProse(plain);
      if (!copy) return;
      if (d.concat) {
        push({ kind: 'concat', start: node.start, end: node.end, text: plain });
        return;
      }
      if (d.role === 'array') {
        push({ kind: 'array', start: node.start, end: node.end, text: plain });
        return;
      }
      const params = [];
      for (const ex of node.expressions) {
        const pf = paramFor(ex, src);
        if (!pf) {
          push({ kind: 'complex', start: node.start, end: node.end, text: plain, why: 'expression' });
          return;
        }
        let nm = pf.name;
        let k = 2;
        while (params.some((x) => x.name === nm)) nm = pf.name + k++;
        params.push({ name: nm, src: pf.src });
      }
      let english = '';
      node.quasis.forEach((q, qi) => {
        english += q.value.cooked || '';
        if (qi < params.length) english += '{{' + params[qi].name + '}}';
      });
      push({ kind: d.role, start: node.start, end: node.end, mode: d.html ? 'html' : 'text', text: english, params });
    }
  });

  // Existing t()-family calls whose key has no English message: (key, fallback) pairs.
  const calls = [];
  walk.simple(ast, {
    CallExpression(c) {
      const name = calleeName(c);
      if (!T_FUNCS.has(name) || name === 'optionLabel') return;
      const k = c.arguments[0];
      if (!k || k.type !== 'Literal' || typeof k.value !== 'string') return;
      const fb = c.arguments[1];
      calls.push({ name, key: k.value, keyStart: k.start, keyEnd: k.end, fallback: fb && fb.type === 'Literal' && typeof fb.value === 'string' ? fb.value : null, line: lineOf(c.start) });
    },
  });
  return { findings, calls };
}

function decode(s) {
  return String(s)
    .replace(/\\u\{([0-9a-f]+)\}/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/\\u([0-9a-f]{4})/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\n/g, '\n')
    .replace(/\\(['"`\\])/g, '$1')
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

module.exports = { classify, parse, decode, T_FUNCS };
