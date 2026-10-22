/**
 * Copy hiding in HTML templates next to tags ("Moves <strong>…", "</em>. Teams take turns.") — a case the
 * i18n-lint classifier skips. Reports capitalised words / word pairs left once tags and attributes are removed.
 */
'use strict';

const fs = require('fs');
const acorn = require('acorn');
const walk = require('acorn-walk');

const BRAND = /^(Chaupaal|Kakuro|Muqabala|Shabd|Five|JK|OK|AI|Tip|Tap|Oh|No)$/;

function textOf(raw) {
  let s = raw.replace(/<[^>]*>/g, ' ').replace(/^[^<>]*>/, ' ').replace(/<[^>]*$/, ' ');
  s = s.replace(/[\w:-]+=("[^"]*"?|'[^']*'?)/g, ' ').replace(/[\w:-]+=$/g, ' ').replace(/^[^"]*"/, (m) => (/[=]/.test(m) ? ' ' : m));
  return s.replace(/&[#\w]+;/g, ' ').replace(/["'>/]/g, ' ');
}

/** [file:line  words] for every template piece that still carries English beside markup. */
function scan(files) {
  const out = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    let ast;
    try {
      ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true, allowHashBang: true });
    } catch (e) {
      continue;
    }
    const lines = src.split('\n');
    walk.simple(ast, {
      TemplateLiteral(n) {
        if (!/<[a-z]/i.test(n.quasis.map((q) => q.value.raw).join(''))) return;
        n.quasis.forEach((q) => {
          const line = src.slice(0, q.start).split('\n').length;
          if (/i18n-ignore/.test(lines[line - 1] || '')) return;
          const s = textOf(q.value.raw);
          const caps = (s.match(/\b[A-Z][a-z]{2,}\b/g) || []).filter((w) => !BRAND.test(w));
          const phrase = s.match(/\b[a-z]{3,} [a-z]{3,}\b/g) || [];
          if (caps.length || phrase.length) out.push(f + ':' + line + '  ' + caps.concat(phrase).join(' | ').slice(0, 90));
        });
      },
    });
  }
  return out;
}

module.exports = { scan };
