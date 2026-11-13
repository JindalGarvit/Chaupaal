#!/usr/bin/env node
/**
 * Translation coverage per language (Global L1).
 *   coverage %   share of English keys the pack translates
 *   missing      English keys with no translation (falls back to English at runtime)
 *   unused       English keys no code / HTML references (legacy flat or namespaced; dynamic
 *                prefixes like t('carrom.' + key) count as used for that namespace)
 *   placeholders a {{param}} the English uses but the translation drops (or invents)
 *   plurals      ICU plural blocks missing a category Intl.PluralRules needs for that language
 *   glossary     brand tokens dropped / spelled out (from i18n-check)
 *
 *   context      translator note per English key (scripts/i18n-context.json, longest prefix wins);
 *                "missing context" must be 0
 *
 * Usage: node scripts/i18n-coverage.js [--json] [--missing <code>]
 *        node scripts/i18n-coverage.js --lang <code> [--out <file.md>] [--csv <file.csv>]
 *          one language's worksheet: summary, missing keys grouped by namespace with English + context,
 *          placeholder / plural / glossary problems (the L10–L24 language passes start here)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { check } = require('./i18n-check');

const ROOT = path.join(__dirname, '..');

function walk(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|html)$/.test(e.name)) out.push(p);
  });
  return out;
}

/** All code + HTML (minus the packs themselves) as one searchable blob. */
function codeCorpus() {
  const files = walk(path.join(ROOT, 'public'), []).filter((f) => !/[\\/]i18n[\\/](en|legacy-keys)\.js$/.test(f));
  return files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
}

/** Plural categories each ICU plural block in `msg` defines. */
function pluralBlocks(msg) {
  const blocks = [];
  const re = /\{\s*(\w+)\s*,\s*(plural|selectordinal)\s*,/g;
  let m;
  while ((m = re.exec(msg))) {
    const cats = new Set();
    let depth = 1;
    let i = re.lastIndex;
    let token = '';
    for (; i < msg.length && depth > 0; i++) {
      const c = msg[i];
      if (c === '{') {
        if (depth === 1 && token.trim()) cats.add(token.trim());
        token = '';
        depth++;
      } else if (c === '}') depth--;
      else if (depth === 1) token += c;
    }
    blocks.push({ type: m[2], cats });
  }
  return blocks;
}

function coverage() {
  const res = check();
  const { en, legacy, packs, catalog } = res;
  const enKeys = Object.keys(en);
  const corpus = codeCorpus();
  const reverse = {};
  Object.entries(legacy).forEach(([flat, nk]) => (reverse[nk] = reverse[nk] || []).push(flat));
  const dynamicPrefixes = new Set((corpus.match(/['"`]([a-z]+(?:\.[a-z_]+)*\.)['"`]\s*\+/g) || []).map((s) => s.slice(1, s.indexOf('.') + 1)));
  const used = (k) => {
    if (corpus.includes(`'${k}'`) || corpus.includes(`"${k}"`) || corpus.includes('`' + k + '`')) return true;
    if ((reverse[k] || []).some((f) => corpus.includes(`'${f}'`) || corpus.includes(`"${f}"`) || corpus.includes('`' + f + '`'))) return true;
    return dynamicPrefixes.has(k.split('.')[0] + '.');
  };
  const unused = enKeys.filter((k) => !used(k));

  const langs = {};
  catalog
    .filter((l) => l.code !== 'en')
    .forEach((l) => {
      const pack = packs[l.code] || {};
      const keys = Object.keys(pack).filter((k) => k in en);
      const missing = enKeys.filter((k) => !(k in pack));
      const placeholder = [];
      const plural = [];
      let needed = ['other'];
      try {
        needed = new Intl.PluralRules(l.html || l.code).resolvedOptions().pluralCategories;
      } catch (e) {}
      keys.forEach((k) => {
        // A translation may consume a param as an ICU variable ({n, plural, …}) instead of {{n}} (Arabic plurals).
        const used = (s) => [...new Set([...(String(s).replace(/\{\{(@?\w+)\|[^{}|]+\/[^{}|]+\}\}/g, '{{$1}}').match(/\{\{\w+\}\}/g) || []), ...[...String(s).matchAll(/\{\s*(\w+)\s*,\s*(?:plural|select|selectordinal)\s*,/g)].map((m) => '{{' + m[1] + '}}')])].sort().join();
        const want = used(en[k]);
        const have = used(pack[k]);
        if (want !== have) placeholder.push(k);
        pluralBlocks(String(pack[k])).forEach((b) => {
          if (b.type !== 'plural') return;
          const gaps = needed.filter((c) => !b.cats.has(c));
          if (gaps.length) plural.push(`${k} (needs ${gaps.join(', ')})`);
        });
      });
      const glossary = res.errors.filter((e) => e.startsWith(l.code + ':') && /brand|spells/.test(e));
      langs[l.code] = {
        name: l.name,
        translated: keys.length,
        coverage: Math.round((keys.length / enKeys.length) * 1000) / 10,
        missing: missing.length,
        placeholderMismatches: placeholder,
        pluralGaps: plural,
        glossaryViolations: glossary,
        missingKeys: missing,
      };
    });
  const enPluralGaps = [];
  enKeys.forEach((k) =>
    pluralBlocks(String(en[k])).forEach((b) => {
      if (b.type === 'plural' && !b.cats.has('other')) enPluralGaps.push(k);
    })
  );
  const contextMissing = enKeys.filter((k) => !contextFor(k));
  return { enKeys: enKeys.length, unused, enPluralGaps, contextMissing, langs, en };
}

let CONTEXT = null;
/** Translator note for a key: exact entry, else the longest matching prefix, plus placeholder notes. */
function contextFor(key, englishText) {
  if (!CONTEXT) CONTEXT = JSON.parse(fs.readFileSync(path.join(__dirname, 'i18n-context.json'), 'utf8'));
  let note = CONTEXT.keys[key] || '';
  if (!note) {
    const best = Object.keys(CONTEXT.prefixes)
      .filter((p) => key.startsWith(p))
      .sort((a, b) => b.length - a.length)[0];
    note = best ? CONTEXT.prefixes[best] : '';
  }
  if (!note) return '';
  const params = [...new Set((String(englishText || '').match(/\{\{(\w+)\}\}/g) || []).map((p) => p.slice(2, -2)))];
  const pnotes = params.filter((p) => CONTEXT.params[p]).map((p) => `{{${p}}} = ${CONTEXT.params[p]}`);
  return pnotes.length ? `${note} (${pnotes.join('; ')})` : note;
}

function csvCell(s) {
  const v = String(s == null ? '' : s);
  return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

/** Markdown worksheet + CSV for one language pass. */
function languageReport(r, code) {
  const l = r.langs[code];
  if (!l) throw new Error('unknown language ' + code);
  const byNs = {};
  l.missingKeys.forEach((k) => (byNs[k.split('.').slice(0, k.startsWith('games.') || k.startsWith('dangal.') || k.startsWith('notifications.') ? 2 : 1).join('.')] = byNs[k.split('.').slice(0, k.startsWith('games.') || k.startsWith('dangal.') || k.startsWith('notifications.') ? 2 : 1).join('.')] || []).push(k));
  const md = [
    `# ${l.name} (${code}) — translation worksheet`,
    '',
    `Coverage **${l.coverage}%** · translated ${l.translated} · missing ${l.missing} · placeholder mismatches ${l.placeholderMismatches.length} · plural gaps ${l.pluralGaps.length} · glossary ${l.glossaryViolations.length}`,
    '',
    '## Fix first',
    ...(l.placeholderMismatches.length ? l.placeholderMismatches.map((k) => `- placeholder: \`${k}\``) : ['- placeholders: none']),
    ...(l.pluralGaps.length ? l.pluralGaps.map((k) => `- plural: \`${k}\``) : ['- plurals: none']),
    ...(l.glossaryViolations.length ? l.glossaryViolations.map((e) => `- glossary: ${e}`) : ['- glossary: none']),
    '',
    '## Missing by namespace',
    '',
    '| namespace | missing |',
    '|---|---|',
    ...Object.keys(byNs)
      .sort((a, b) => byNs[b].length - byNs[a].length)
      .map((ns) => `| ${ns} | ${byNs[ns].length} |`),
    '',
  ];
  const rows = [['key', 'english', 'context', 'translation']];
  l.missingKeys.forEach((k) => rows.push([k, r.en[k], contextFor(k, r.en[k]), '']));
  return { md: md.join('\n'), csv: rows.map((row) => row.map(csvCell).join(',')).join('\n') + '\n', byNs };
}

if (require.main === module) {
  const r = coverage();
  const args = process.argv.slice(2);
  if (args.includes('--lang')) {
    const code = args[args.indexOf('--lang') + 1];
    const rep = languageReport(r, code);
    const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
    const csv = args.includes('--csv') ? args[args.indexOf('--csv') + 1] : null;
    if (out) fs.writeFileSync(out, rep.md + '\n');
    if (csv) fs.writeFileSync(csv, rep.csv);
    console.log(rep.md);
    if (csv) console.log(`CSV for translators → ${csv} (key, english, context, translation)`);
  } else if (args.includes('--json')) {
    const slim = JSON.parse(JSON.stringify(r));
    delete slim.en;
    Object.values(slim.langs).forEach((l) => delete l.missingKeys);
    console.log(JSON.stringify(slim, null, 2));
  } else if (args.includes('--missing')) {
    const code = args[args.indexOf('--missing') + 1];
    (r.langs[code]?.missingKeys || []).forEach((k) => console.log(k));
  } else {
    console.log(`English keys: ${r.enKeys} · possibly unused: ${r.unused.length} · English plural blocks without "other": ${r.enPluralGaps.length} · missing context notes: ${r.contextMissing.length}`);
    console.log('lang  coverage  translated  missing  placeholders  plurals  glossary');
    Object.entries(r.langs).forEach(([c, l]) =>
      console.log(
        `${c.padEnd(5)} ${String(l.coverage).padStart(7)}%  ${String(l.translated).padStart(10)}  ${String(l.missing).padStart(7)}  ${String(l.placeholderMismatches.length).padStart(12)}  ${String(l.pluralGaps.length).padStart(7)}  ${String(l.glossaryViolations.length).padStart(8)}`
      )
    );
  }
}

module.exports = { coverage, pluralBlocks, contextFor, languageReport };
