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
assert(/law:\s*'Simplified rules'/.test(ds) && /BWF Laws of Badminton/.test(ds), 'badminton: simplified rules + plain attribution (P0 honesty)');
assert(/law:\s*'Street formats'/.test(ds), 'street cricket honest law label');

assert(/'Game to 21'/.test(court) && !/BWF-lite/.test(court), 'rally subtitle without federation wording');
assert(/arcade timing · Live 1v1/.test(court), 'rally registry desc honesty');
assert(/function attachHowTo/.test(gameUi) && /GameUI[\s\S]*attachHowTo/.test(gameUi), 'GameUI.attachHowTo wired');
assert(/federationHonestyHtml\(gameId\)/.test(registry), 'Manch prepare shows honesty chip');
assert(/Simplified rules · one game to 21/.test(gameUi), 'coach tips: simplified rules');
assert(/Street formats/.test(rw), 'street sports desc honesty');

assert(/Math\.abs\(y - o\) >= 2/.test(court) && /bwf21/.test(court), 'BWF win-by-2 still in scorebook');
assert(/gameMarkHtml/.test(ds) && /mark:\s*M\.badminton/.test(ds), 'R4-0 marks still present');
assert(/Dangal R4-1/.test(conventions), 'CONVENTIONS documents R4-1');

const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js count is 12 (got ${apiCount})`);

console.log('\nR4-1 federation honesty checks passed.');
