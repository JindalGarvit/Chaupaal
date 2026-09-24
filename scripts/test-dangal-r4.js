/**
 * Dangal R4 close — marks + federation honesty soak invariants.
 */
'use strict';

const fs = require('fs');
const path = require('path');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  console.log('✓', msg);
}

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// Re-run arc unit suites
require('./test-dangal-r4-0.js');
require('./test-dangal-r4-1.js');

const court = read('public/src/js/games/court-sports.js');
const index = read('public/index.html');
const conventions = read('CONVENTIONS.md');

// Soak blocker: chrome mark must be wired after DOM (gameId on gameChromeHtml + prepare after innerHTML)
assert(
  /gameChromeHtml\(\{[\s\S]*?gameId:\s*o\.id/.test(court),
  'openShell passes gameId into gameChromeHtml'
);
assert(
  /overlay\.innerHTML\s*=[\s\S]*?prepareGameOverlay\(overlay/.test(court),
  'prepareGameOverlay runs after chrome innerHTML'
);
assert(
  !/prepareGameOverlay\(overlay[\s\S]{0,200}overlay\.innerHTML\s*=/.test(
    court.slice(court.indexOf('function openShell'), court.indexOf('function openShell') + 2500)
  ),
  'openShell does not prepare overlay before chrome HTML'
);

assert(/dangal-utils\.js[\s\S]*design-system\.js/.test(index), 'script order: utils before design-system');
assert(/Dangal R4 done|Dangal R4 close|R4-2/.test(conventions), 'CONVENTIONS documents R4 close');

const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js = 12 (got ${apiCount})`);

console.log('\nR4 soak close checks passed.');
