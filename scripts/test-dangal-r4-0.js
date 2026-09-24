/**
 * Dangal R4-0 — custom SVG marks in GAME_IDENTITY.
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
const ratings = read('public/src/js/features/dangal-ratings.js');
const registry = read('public/src/js/games/game-registry.js');
const challenge = read('public/src/js/dangal/dangal-challenge-cards.js');
const gestures = read('public/src/js/core/tab-gestures.js');
const gameUi = read('public/src/js/games/game-ui.js');
const conventions = read('CONVENTIONS.md');
const utils = read('public/src/js/dangal/dangal-utils.js');

assert(/function gameMarkHtml/.test(ds), 'gameMarkHtml defined');
assert(/window\.gameMarkHtml\s*=\s*gameMarkHtml/.test(ds), 'gameMarkHtml exported');

const canonIds = [
  'chess',
  'snakes',
  'ludo',
  'ttt',
  'uno',
  'wordguess',
  'fiveinrow',
  'business',
  'tambola',
  'carrom',
  'streetcricket',
  'gullykick',
  'badminton',
  'tabletennis',
  'pickleball',
  'kabaddi',
  'khokho',
  'bowling',
  'tennis',
  'rummy',
  'teenpatti',
  'bluff',
  'sattepe',
  'andarbaahar',
  'scribble',
  'quiz',
  'rushrunner',
  'patangbaazi',
  'pool',
  'ankjod',
  'tiptap',
  'brickbreaker',
];
canonIds.forEach((id) => {
  assert(ds.includes(`mark: M.${id}`), `${id} has curated mark`);
});

assert(/gameMarkHtml\(g\.id/.test(ratings), 'Manch tiles use gameMarkHtml');
assert(/gotdMark/.test(ratings) && /gameMarkHtml\(g\.id/.test(ratings), 'GOTD uses mark');
assert(/dangal-picker-mark/.test(registry) && /gameMarkHtml\(gameId/.test(registry), 'chat picker / prepare use mark');
assert(/gameMarkHtml\(att\.gameType/.test(challenge), 'challenge cards prefer SVG mark');
assert(/gameMarkHtml\(game\.id/.test(gestures), 'challenge pick sheet uses mark');
assert(/game-chrome-mark/.test(gameUi) && /prepareGameOverlay[\s\S]*gameMarkHtml/.test(gameUi), 'overlay chrome injects mark');
assert(/game-share-mark/.test(gameUi), 'share cards show mark');
assert(/muqabala:\s*'quiz'/.test(utils) && /tictactoe:\s*'ttt'/.test(utils), 'aliases map to canonical ids');
assert(/Dangal R4-0/.test(conventions), 'CONVENTIONS documents R4-0');

const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js count is 12 (got ${apiCount})`);

assert(ds.includes('mark: M.badminton') && ds.includes('mark: M.tabletennis') && ds.includes('mark: M.tennis'), 'racket sports have separate marks');
assert(ds.includes('mark: M.kabaddi') && ds.includes('mark: M.khokho'), 'kabaddi ≠ kho kho marks');
assert(ds.includes('mark: M.rummy') && ds.includes('mark: M.teenpatti') && ds.includes('mark: M.uno'), 'party card marks distinct');

console.log('\nR4-0 marks checks passed.');
