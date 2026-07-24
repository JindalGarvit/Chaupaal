/**
 * Walk public/, api/, server-lib/ and `node --check` every .js file.
 * Failures print the path; exit 1 if any fail. Used by CI and locally.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOTS = ['public', 'api', 'server-lib', 'scripts'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'vendor']);

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.isFile() && e.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const files = ROOTS.flatMap((r) => walk(path.join(process.cwd(), r)));
let failed = 0;
for (const file of files) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) {
    failed += 1;
    const rel = path.relative(process.cwd(), file);
    process.stderr.write(`FAIL ${rel}\n${r.stderr || r.stdout || ''}`);
  }
}
if (failed) {
  process.stderr.write(`\n${failed} of ${files.length} files failed syntax check\n`);
  process.exit(1);
}
process.stdout.write(`OK — ${files.length} files passed node --check\n`);
