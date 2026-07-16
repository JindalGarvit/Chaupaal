/**
 * Heuristic scan for undefined global / bare-identifier bugs.
 * Run: node scripts/scan-undefined.js
 */
const fs = require('fs');
const path = require('path');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
  const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const root = path.join('public', 'src', 'js');
const files = walk(root);
const rel = (f) => path.relative(root, f).replace(/\\/g, '/');

// 1) dataset.X written, bare X used without `const X = ...dataset.X`
console.log('=== 1. Bare identifiers that match dataset keys (possible wasCorrect-style bugs) ===');
for (const f of files) {
  const t = fs.readFileSync(f, 'utf8');
  const keys = [...new Set([...t.matchAll(/\.dataset\.([A-Za-z_$][\w$]*)\s*=/g)].map((m) => m[1]))];
  // camelCase dataset keys are the risky ones (wasCorrect); skip tiny names
  for (const key of keys) {
    if (key.length < 4) continue;
    if (['loaded', 'type', 'name', 'tagged', 'format', 'intercepted', 'reactWired', 'uid', 'answered'].includes(key))
      continue;
    const lines = t.split(/\n/);
    const hits = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('dataset.' + key)) continue;
      if (/(?:const|let|var)\s+/.test(line) && new RegExp('\\b' + key + '\\b').test(line)) continue;
      // skip object keys / strings lightly
      if (new RegExp("['\"`].*" + key).test(line) && !new RegExp('[^\\w$]' + key + '[^\\w$]').test(line.replace(/['"`][^'"`]*['"`]/g, '""')))
        continue;
      const re = new RegExp('(?:^|[^.\\w$])(' + key + ')(?![\\w$])');
      if (re.test(line)) hits.push(i + 1);
    }
    // only flag if never declared from dataset in this file
    const declared = new RegExp('(?:const|let|var)\\s+' + key + '\\s*=').test(t);
    if (hits.length && !declared) {
      console.log(`  ${rel(f)}: bare \`${key}\` @ lines ${hits.join(', ')} (set via dataset.${key})`);
    }
  }
}

// 2) Self-referential function patches (hoisting trap)
console.log('\n=== 2. Self-patch / hoisting traps (_origX = X then function X) ===');
for (const f of files) {
  const t = fs.readFileSync(f, 'utf8');
  const lines = t.split(/\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/const\s+(_orig\w+)\s*=\s*([A-Za-z_$][\w$]*)\s*;/);
    if (!m) continue;
    const [, orig, name] = m;
    // next few lines redefine same name?
    const window = new RegExp('window\\.' + name + '\\s*=');
    const fn = new RegExp('function\\s+' + name + '\\s*\\(');
    let redefined = false;
    for (let j = i; j < Math.min(i + 5, lines.length); j++) {
      if (fn.test(lines[j]) || window.test(lines[j])) redefined = true;
    }
    // Is name defined in earlier-loading file?
    const definedElsewhere = files.some((g) => {
      if (g === f) return false;
      const gt = fs.readFileSync(g, 'utf8');
      return (
        new RegExp('(?:async\\s+)?function\\s+' + name + '\\b').test(gt) ||
        new RegExp('(?:const|let|var)\\s+' + name + '\\s*=').test(gt) ||
        new RegExp('window\\.' + name + '\\s*=').test(gt)
      );
    });
    const definedLocallyBefore = lines
      .slice(0, i)
      .some(
        (l) =>
          new RegExp('(?:async\\s+)?function\\s+' + name + '\\b').test(l) ||
          new RegExp('(?:const|let|var)\\s+' + name + '\\s*=').test(l)
      );
    if (redefined && !definedElsewhere && !definedLocallyBefore) {
      console.log(
        `  ${rel(f)}:${i + 1} \`${orig} = ${name}\` then redefines ${name} — no prior def (self-recursion / TDZ)`
      );
    } else if (!definedElsewhere && !definedLocallyBefore && !redefined) {
      // capture only — check if symbol exists at all later in same file as function
      const laterFn = lines.slice(i + 1).some((l) => fn.test(l) || window.test(l));
      if (!laterFn) {
        // maybe unused capture of missing global
        const existsAnywhere = files.some((g) => {
          const gt = fs.readFileSync(g, 'utf8');
          return (
            new RegExp('(?:async\\s+)?function\\s+' + name + '\\b').test(gt) ||
            new RegExp('window\\.' + name + '\\s*=').test(gt)
          );
        });
        if (!existsAnywhere && name !== 'document') {
          console.log(`  ${rel(f)}:${i + 1} \`${orig} = ${name}\` — ${name} never defined`);
        }
      }
    }
  }
}

// 3) Critical onclick / window handlers from index.html
console.log('\n=== 3. Handlers referenced from HTML onclick / on* ===');
const html = fs.readFileSync('public/index.html', 'utf8');
const htmlHandlers = new Set();
for (const m of html.matchAll(/on\w+="([A-Za-z_$][\w$]*)\s*\(/g)) htmlHandlers.add(m[1]);
const decls = new Set();
for (const f of files) {
  const t = fs.readFileSync(f, 'utf8');
  for (const m of t.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) decls.add(m[1]);
  for (const m of t.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)) decls.add(m[1]);
}
for (const h of [...htmlHandlers].sort()) {
  if (!decls.has(h)) console.log(`  MISSING: ${h}`);
}

// 4) Load order for top-level _orig captures of known globals
console.log('\n=== 4. Load-order: patch file before definition file ===');
const scripts = [...html.matchAll(/src="(\/src\/js\/[^"]+)"/g)].map((m) =>
  m[1].replace(/^\/src\/js\//, '')
);
const order = new Map(scripts.map((s, i) => [s, i]));
for (const f of files) {
  const r = rel(f);
  const t = fs.readFileSync(f, 'utf8');
  const lines = t.split(/\n/);
  lines.forEach((line, i) => {
    const m = line.match(/const\s+_orig\w+\s*=\s*([A-Za-z_$][\w$]*)/);
    if (!m) return;
    const target = m[1];
    if (target === 'document') return;
    let defFile = null;
    for (const g of files) {
      const gt = fs.readFileSync(g, 'utf8');
      // skip the patch line itself
      if (
        new RegExp('(?:async\\s+)?function\\s+' + target + '\\b').test(gt) ||
        (new RegExp('(?:const|let|var)\\s+' + target + '\\s*=').test(gt) &&
          !new RegExp('const\\s+_orig\\w+\\s*=\\s*' + target).test(gt))
      ) {
        // ensure not only the self-redefine
        const hasReal =
          new RegExp('(?:async\\s+)?function\\s+' + target + '\\b').test(gt) ||
          [...gt.matchAll(new RegExp('(?:const|let|var)\\s+' + target + '\\s*=', 'g'))].some((mm) => {
            const lineStart = gt.lastIndexOf('\n', mm.index) + 1;
            const line = gt.slice(lineStart, gt.indexOf('\n', mm.index));
            return !line.includes('_orig');
          });
        if (hasReal) {
          defFile = rel(g);
          if (defFile !== r) break;
        }
      }
    }
    const patchIdx = order.get(r);
    const defIdx = defFile != null ? order.get(defFile) : -1;
    if (defIdx >= 0 && patchIdx < defIdx) {
      console.log(`  ${r}:${i + 1} patches ${target} BEFORE def in ${defFile}`);
    }
    if (defIdx < 0 && defFile == null) {
      // already reported in section 2
    }
  });
}

console.log('\nDone.');
