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
 * Usage: node scripts/i18n-coverage.js [--json] [--missing <code>]
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
        const want = (String(en[k]).match(/\{\{\w+\}\}/g) || []).sort().join();
        const have = (String(pack[k]).match(/\{\{\w+\}\}/g) || []).sort().join();
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
  return { enKeys: enKeys.length, unused, enPluralGaps, langs };
}

if (require.main === module) {
  const r = coverage();
  const args = process.argv.slice(2);
  if (args.includes('--json')) {
    const slim = JSON.parse(JSON.stringify(r));
    Object.values(slim.langs).forEach((l) => delete l.missingKeys);
    console.log(JSON.stringify(slim, null, 2));
  } else if (args.includes('--missing')) {
    const code = args[args.indexOf('--missing') + 1];
    (r.langs[code]?.missingKeys || []).forEach((k) => console.log(k));
  } else {
    console.log(`English keys: ${r.enKeys} · possibly unused: ${r.unused.length} · English plural blocks without "other": ${r.enPluralGaps.length}`);
    console.log('lang  coverage  translated  missing  placeholders  plurals  glossary');
    Object.entries(r.langs).forEach(([c, l]) =>
      console.log(
        `${c.padEnd(5)} ${String(l.coverage).padStart(7)}%  ${String(l.translated).padStart(10)}  ${String(l.missing).padStart(7)}  ${String(l.placeholderMismatches.length).padStart(12)}  ${String(l.pluralGaps.length).padStart(7)}  ${String(l.glossaryViolations.length).padStart(8)}`
      )
    );
  }
}

module.exports = { coverage, pluralBlocks };
