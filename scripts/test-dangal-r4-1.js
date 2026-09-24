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
assert(/law:\s*'BWF-lite'/.test(ds), 'badminton BWF-lite');
assert(/law:\s*'ITTF-lite'/.test(ds), 'table tennis ITTF-lite');
assert(/law:\s*'Pickle-lite'/.test(ds), 'pickleball Pickle-lite');
assert(/law:\s*'Games-lite'/.test(ds), 'tennis Games-lite');
assert(/law:\s*'PKL-lite'/.test(ds), 'kabaddi PKL-lite');
assert(/Arcade chase/.test(ds) && /not full federation/.test(ds), 'kho kho arcade chase');
assert(/USBC-lite/.test(ds), 'bowling USBC-lite identity');

assert(/BWF-lite · Game to 21/.test(court), 'rally subtitle BWF-lite');
assert(/ITTF-lite · Game to 11/.test(court), 'rally subtitle ITTF-lite');
assert(/Pickle-lite · Game to 11/.test(court), 'rally subtitle Pickle-lite');
assert(/Games-lite · First to 2 games/.test(court), 'rally subtitle Games-lite');
assert(/arcade timing · Live 1v1/.test(court), 'rally registry desc honesty');
assert(/PKL-lite · raid, tackle/.test(court), 'kabaddi registry PKL-lite');
assert(/not full federation/.test(court), 'kho kho not full federation');
assert(/USBC-lite frames/.test(court) || /USBC-lite 10-frame/.test(court), 'bowling USBC-lite copy');
assert(!/Alternate frames · X\/／ USBC · Practice/.test(court), 'no bare USBC oil claim in how-to');
assert(/function attachHowTo/.test(gameUi) && /GameUI[\s\S]*attachHowTo/.test(gameUi), 'GameUI.attachHowTo wired');
assert(/federationHonestyHtml\(gameId\)/.test(registry), 'Manch prepare shows honesty chip');
assert(/BWF-lite · one game to 21/.test(gameUi), 'coach tips BWF-lite');
assert(/Street formats/.test(rw), 'street sports desc honesty');

assert(/Math\.abs\(y - o\) >= 2/.test(court) && /bwf21/.test(court), 'BWF win-by-2 still in scorebook');
assert(/gameMarkHtml/.test(ds) && /mark:\s*M\.badminton/.test(ds), 'R4-0 marks still present');
assert(/Dangal R4-1/.test(conventions), 'CONVENTIONS documents R4-1');

const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js count is 12 (got ${apiCount})`);

console.log('\nR4-1 federation honesty checks passed.');
