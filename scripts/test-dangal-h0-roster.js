/**
 * Dangal H0 — roster touch-up.
 *  (a) Kakuro: the display name everywhere; id stays `ankjod`, `kakuro` is a permanent alias
 *      (client utils, graduation, economy, progress normaliser) so old links / PBs / saves keep working
 *  (b) Kite Fight (patangbaazi) retired: no launcher, on the retired list, server voids + rejects
 *  (c) Never Have I Ever ships inside `mostlikely` (one tile) — deep checks live in the G3 test
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  console.log('✓', msg);
}

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// ---------- (a) Kakuro ----------
const ank = read('public/src/js/games/ank-jod.js');
const gameUi = read('public/src/js/games/game-ui.js');
const ds = read('public/src/js/dangal/design-system.js');
const scheduler = read('api/chaupaal-scheduler.js');
const search = read('server-lib/search-index.js');

const shipped = [
  'public/src/js/games/ank-jod.js',
  'public/src/js/games/game-ui.js',
  'public/src/js/games/game-registry.js',
  'public/src/js/dangal/design-system.js',
  'public/src/js/dangal/dangal-graduation.js',
  'api/chaupaal-scheduler.js',
  'public/index.html',
  'public/src/styles/components.css',
  'public/src/styles/dangal.css',
];
shipped.forEach((f) => assert(!/Ank Jod|AnkJod'|'Ank\s?Jod/.test(read(f).replace(/window\.openAnkJod|function openAnkJod|openAnkJod/g, '')), `${f}: no “Ank Jod” user copy`));

assert(/ankjod: \{ primary: '#[0-9A-F]{6}'[^}]*label: 'Kakuro'/.test(ds), 'GAME_IDENTITY label = Kakuro');
assert(/GAME_LABELS\.kakuro = GAME_IDENTITY\.ankjod\.label/.test(ds), 'kakuro alias shares the identity label');
assert(/ankjod: 'Kakuro'/.test(gameUi) && /kakuro: 'Kakuro'/.test(gameUi), 'game-ui labels read Kakuro for both ids');
assert(/ankjod: \[[\s\S]{0,400}(run|clue)/.test(gameUi), 'how-to uses global Kakuro terms (runs / clues)');
assert(/registerGame\(\{\s*id: 'ankjod',\s*name: 'Kakuro'/.test(ank), 'registerGame: id ankjod, name Kakuro');
assert(/registerGame\(\{\s*id: 'kakuro'/.test(ank) && /aliases: \['kakuro'\]/.test(ank), 'kakuro alias id registered');
assert(/window\.openKakuro = openAnkJod/.test(ank) && /window\.openAnkJod = openAnkJod/.test(ank), 'openKakuro + legacy openAnkJod launchers');
assert(/sum/i.test(ank.slice(0, 400)) && /run/i.test(ank.slice(0, 400)), 'file header explains sums + runs');
assert(/title: 'Kakuro'/.test(scheduler), 'scheduler notifications say Kakuro');
assert(/id: 'ankjod', name: 'Kakuro'[^}]*keywords: 'ank jod'/.test(search) && /g\.keywords/.test(search), 'search finds Kakuro by name and the old name');

['chaupaal_pb_ankjod', 'chaupaal_pb_ankjod_easy', 'chaupaal_pb_ankjod_medium', 'chaupaal_pb_ankjod_hard', 'chaupaal_pb_ankjod_daily'].forEach((k) => {
  assert(gameUi.includes(`'${k}'`), `PB key ${k} unchanged (history intact)`);
});
assert(/'ankjod_save_'/.test(ank) && /'ankjod_save_last_diff'/.test(ank), 'in-progress saves keep the ankjod key');
assert(/if \(id === 'kakuro'\) return 'ankjod'/.test(gameUi), 'progress / leaderboard normaliser maps kakuro → ankjod');

const sandbox = { window: {}, document: { createElement: () => ({}), querySelector: () => null }, console, localStorage: { getItem: () => null, setItem() {} } };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(read('public/src/js/dangal/dangal-utils.js'), sandbox);
vm.runInContext(read('public/src/js/dangal/dangal-graduation.js'), sandbox);
assert(sandbox.canonicalGameId('kakuro') === 'ankjod' && sandbox.canonicalGameId('Kakuro') === 'ankjod' && sandbox.canonicalGameId('ankjod') === 'ankjod', 'client: old id + new name resolve to one game');
assert(sandbox.isRosterGameId('ankjod') && sandbox.isRosterGameId('kakuro') && !sandbox.isRetiredGameId('kakuro'), 'roster: ankjod + kakuro both live, never retired');
assert(sandbox.getGameGraduation('kakuro').grade === sandbox.getGameGraduation('ankjod').grade, 'graduation: alias matches');

const econ = require(path.join(root, 'server-lib/dangal-economy.js'));
assert(econ.canonicalGameId('kakuro') === 'ankjod' && econ.canonicalGameId('ankjod') === 'ankjod' && !econ.isRetiredGameId('kakuro'), 'server: kakuro resolves to ankjod (stats / leaderboards intact)');

// ---------- (b) Kite Fight retired ----------
const court = read('public/src/js/games/court-sports.js');
assert(!/patang|kite/i.test(court) && /window\.openBadminton = /.test(court), 'court-sports: badminton only');
['patangbaazi', 'kite', 'kitefight', 'Kite Fight', 'patang'].forEach((id) => {
  assert(sandbox.isRetiredGameId(id) && econ.isRetiredGameId(id), `${id} → retired (client + server)`);
});
assert(!sandbox.isRosterGameId('patangbaazi'), 'patangbaazi off the roster');
[
  'public/src/js/games/game-ui.js',
  'public/src/js/games/game-registry.js',
  'public/src/js/dangal/design-system.js',
  'public/src/js/dangal/dangal-utils.js',
  'server-lib/game-of-day.js',
  'public/src/styles/components.css',
  'public/src/styles/dangal.css',
].forEach((f) => assert(!/patang/i.test(read(f)), `${f}: no Kite Fight leftovers`));

// ---------- (c) Never Have I Ever lives in mostlikely ----------
const ml = read('public/src/js/games/mostlikely.js');
assert((ml.match(/registerGame\(\{\s*id: '/g) || []).length === 1 && /Never Have I Ever/.test(ml), 'Never Have I Ever is a mode on the Most Likely To tile (no new id)');
assert(!/stake|chips/i.test(ml.replace(/Virtual points only; never chips\./, '')), 'party mode: no chips');

const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js = 12 (got ${apiCount})`);

console.log('\nDangal H0 roster checks passed.');
