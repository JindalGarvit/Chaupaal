/**
 * Dangal R4-1 — federation honesty (lite labels, no overclaim).
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

const ds = read('public/src/js/dangal/design-system.js');
const court = read('public/src/js/games/court-sports.js');
const gameUi = read('public/src/js/games/game-ui.js');
const registry = read('public/src/js/games/game-registry.js');
const rw = read('public/src/js/games/rw-sports.js');
const conventions = read('CONVENTIONS.md');

assert(/function federationHonestyLine/.test(ds), 'federationHonestyLine defined');
assert(/function federationHonestyHtml/.test(ds), 'federationHonestyHtml defined');
assert(/law:\s*'BWF-based laws'/.test(ds) && /'Rules based on the BWF Laws of Badminton'/.test(ds), 'badminton honest law label (P12: full laws engine, plain attribution)');
assert(/law:\s*'MCC-based laws'/.test(ds) && /Based on the MCC Laws of Cricket, adapted for street play/.test(ds), 'street cricket honest law label (P10: MCC-based, adapted)');

assert(!/BWF/.test(court) && /federationHonestyLine\(GAME\)/.test(court), 'badminton UI names no federation; attribution comes from design-system');
assert(/Best of 3 games to 21 · singles \+ doubles · Live/.test(court), 'badminton registry desc honesty');
assert(/function attachHowTo/.test(gameUi) && /GameUI[\s\S]*attachHowTo/.test(gameUi), 'GameUI.attachHowTo wired');
assert(/federationHonestyHtml\(gameId\)/.test(registry), 'Manch prepare shows honesty chip');
assert(/Best of 3 games to 21 — win by 2, 30 caps it/.test(gameUi), 'coach tips: P12 laws');
assert(/Street formats/.test(rw), 'street sports desc honesty');

const bdEngine = read('public/src/js/games/badminton-engine.js');
assert(/s\[i\] - s\[1 - i\] >= 2/.test(bdEngine) && /s\[i\] >= f\.cap/.test(bdEngine), 'win-by-2 + cap live in the shared laws engine');
assert(/gameMarkHtml/.test(ds) && /mark:\s*M\.badminton/.test(ds), 'R4-0 marks still present');
assert(/Dangal R4-1/.test(conventions), 'CONVENTIONS documents R4-1');

const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js count is 12 (got ${apiCount})`);

console.log('\nR4-1 federation honesty checks passed.');
