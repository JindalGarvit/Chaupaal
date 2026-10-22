/**
 * Dangal D4 — final dogfood (all 25 games).
 *  (a) aggregate: every scripts/test-dangal-*.js passes (each in its own process)
 *  (b) regression checks for the bugs found while dogfooding D4 in a browser
 *  (c) roster-wide invariants the journeys rely on (identity, how-to, graduation, rules, attribution)
 *  (d) balance sims: the full runs with D4_FULL_SIMS=1 (≈ 13 min); the P11 / P13 suites run small sims
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

let passed = 0;
function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  passed += 1;
  console.log('✓', msg);
}

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// ================================================================ (a) aggregate
const suites = fs
  .readdirSync(__dirname)
  // The RTDB secrecy sweep needs the emulator — it runs under `npm run test:rules`.
  .filter((f) => /^test-dangal-.+\.js$/.test(f) && f !== path.basename(__filename) && f !== 'test-dangal-rtdb-secrecy.js')
  .sort();
assert(suites.length >= 30, 'found ' + suites.length + ' Dangal suites');
// --chain (inside `npm test`): the chain already runs most suites — run only the ones it doesn't list.
const chain = process.argv.indexOf('--chain') >= 0;
const listed = (JSON.parse(read('package.json')).scripts.test.match(/test-dangal-[\w-]+\.js/g) || []);
const toRun = chain ? suites.filter((f) => listed.indexOf(f) < 0) : suites;
assert(suites.every((f) => listed.indexOf(f) >= 0 || toRun.indexOf(f) >= 0), 'every Dangal suite runs (' + (chain ? listed.filter((f) => suites.indexOf(f) >= 0).length + ' in the npm chain + ' + toRun.length + ' here' : toRun.length + ' here') + ')');
{
  toRun.forEach((f) => {
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [path.join(__dirname, f)], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) {
      process.stdout.write((r.stdout || '').slice(-4000));
      process.stderr.write((r.stderr || '').slice(-4000));
    }
    assert(r.status === 0, f + ' passes (' + Math.round((Date.now() - t0) / 1000) + ' s)');
  });
}

// ================================================================ (b) D4 regressions
{
  const DA = require(path.join(root, 'public/src/js/dangal/dangal-assist.js'));
  // Suggestions: the variety nudge must not stamp "Something different" on every row.
  const rec = DA.recommend({ players: 2, where: 'together', minutes: 15, recent: ['chess'] });
  assert(rec.length && rec.every((g) => !/Something different/.test(g.reason)) && rec.every((g) => /Great for 2 people/.test(g.reason) || /just played/.test(g.reason)), 'D4: suggestion reasons stay specific (no blanket “Something different”)');

  // Manch: the mode chips must not reuse a section chip's name (two "Solo" chips read as a bug).
  const ratings = read('public/src/js/features/dangal-ratings.js');
  const modeLabels = (ratings.match(/kind: 'mode'[^}]*/g) || []).map((s) => '').length;
  const modeBlock = ratings.slice(ratings.indexOf('const modeFilters = ['), ratings.indexOf('const genreFilters'));
  const rt = require('./lib/i18n-node-shim').runtime;
  const labels = Array.from(modeBlock.matchAll(/label: (?:'([^']+)'|t\('([\w.]+)'\))/g)).map((m) => m[1] || rt.t(m[2]));
  const sections = ['Solo', 'Boards', 'Words', 'Cards', 'Sports', 'Party'];
  assert(modeLabels >= 0 && labels.length === 5 && labels.every((l) => sections.indexOf(l) < 0) && ['1 player', '2 players', 'Groups'].every((l) => labels.indexOf(l) >= 0), 'D4: Manch mode chips say 1 player / 2 players / Groups (no second “Solo”)');

  // Opponent sheet: a double tap must not stack sheets whose buttons share ids.
  const reg = read('public/src/js/games/game-registry.js');
  assert(/document\.querySelectorAll\('\.dangal-opp-sheet'\)\.forEach\(\(s\) => s\.remove\(\)\)/.test(reg) && (reg.match(/sheet\.className = 'dangal-opp-sheet'/g) || []).length === 2, 'D4: Practice / Challenge sheet is deduped on a double tap');
  assert(!/document\.getElementById\('dg(CancelGame|PracticeAi|FriendOpp)'\)/.test(reg) && (reg.match(/sheet\.querySelector\('#dg(CancelGame|PracticeAi|FriendOpp)'\)/g) || []).length === 6, 'D4: opponent sheet buttons are wired inside their own sheet');

  // Post-game tip: sits under the top bar, never over the result screen's Play again / Share.
  const css = read('public/src/styles/dangal.css');
  const tipRule = (css.match(/\.dangal-tip-card\{[^}]*\}/) || [''])[0];
  assert(/top:calc\(62px/.test(tipRule) && !/bottom:/.test(tipRule) && /z-index:900/.test(tipRule), 'D4: tip card is anchored to the top (result buttons stay reachable)');

  // Shabd Five: the hint is a pill under the board, not a fourth icon squeezing the title.
  const shabd = read('public/src/js/games/shabd-ui.js');
  const rightLine = (shabd.match(/const right = `[^`]*`/) || [''])[0];
  assert(rightLine && !/hint/i.test(rightLine) && /class="sf-hint-btn" data-act="hint"/.test(shabd) && /\$\{hintNote \|\| hintBtn\}/.test(shabd) && /\.sf-hint-btn\{/.test(css), 'D4: Shabd Five hint pill lives under the board');
  assert(/mode !== 'daily'/.test(shabd), 'D4: still no hints in the Daily');

  // Khoj: an age-unconfirmed user searching "poker" gets "confirm your age", not an empty dead end;
  // known under-18 accounts still see nothing.
  const search = read('public/src/js/core/search.js');
  assert(/ageGateStatus\(\) !== 'ok' && ageGateStatus\(\) !== 'under_18'/.test(search) && /ageGate: true/.test(search) && /openAgeGateSheet\(r\.id\)\.then\(\(ok\) => ok && /.test(search), 'D4: Khoj shows 18+ titles as “confirm your age” (never to known under-18s)');
}

// ================================================================ (c) roster invariants
{
  const ctx = { console, document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] }, localStorage: { getItem: () => null, setItem() {} } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('public/src/js/dangal/dangal-graduation.js'), ctx);
  const ids = Array.from(ctx.DANGAL_ROSTER_IDS);
  assert(ids.length === 25, 'roster = 25');
  const Rules = require(path.join(root, 'public/src/js/dangal/dangal-rules.js'));
  const DA = require(path.join(root, 'public/src/js/dangal/dangal-assist.js'));
  const design = read('public/src/js/dangal/design-system.js');
  const sections = new Set(['solo', 'board', 'words', 'cards', 'rw_sports', 'party']);
  ids.forEach((id) => {
    const r = Rules.get(id);
    const g = ctx.getGameGraduation(id);
    assert(
      r && r.glance.length === 3 && r.rules.length >= 3 && r.ruleset.source && g && g.grade && sections.has(ctx.rosterGenre(id)) && new RegExp('\\b' + id + ': \\{').test(design) && (DA.FAQ[DA.canonId(id)] || []).length >= 5,
      id + ': rules (glance + rulebook + source), graduation tag, Manch section, identity, FAQ'
    );
  });
  assert(ctx.isRetiredGameId('patangbaazi') && Array.from(ctx.DANGAL_RETIRED_IDS).length === 14 && ids.every((id) => !ctx.isRetiredGameId(id)), 'retired: 13 culled + patangbaazi; no roster title is retired');
  assert(ctx.isRosterGameId('kakuro') && DA.canonId('kakuro') === 'ankjod', 'the kakuro alias resolves to ankjod');
  const lazy = read('public/src/js/games/party-kit.js');
  ['imposter', 'charades', 'mostlikely', 'werewolf', 'rajamantri', 'carrom', 'streetcricket', 'badminton', 'poker', 'ankjod', 'wordguess', 'tiptap', 'partyhub'].forEach((g) => assert(new RegExp('\\n    ' + g + ': \\[').test(lazy), g + ': game assets lazy-load (Manch first paint stays light)'));
  const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
  assert(apiCount === 12, 'api/*.js = 12 (got ' + apiCount + ')');
  assert(/test-dangal-d4-final\.js/.test(read('package.json')), 'package.json runs the D4 suite');
  const pkg = JSON.parse(read('package.json')).scripts;
  const sec = read('scripts/test-dangal-rtdb-secrecy.js');
  assert(/test-dangal-rtdb-secrecy\.js/.test(pkg['test:rules']) && /peer reads another player’s secrets/.test(sec) && /stranger reads the whole room/.test(sec) && /allowed < 15/.test(sec), 'secrecy sweep runs against the RTDB emulator in npm run test:rules (denials + positive controls)');
}

// ================================================================ (d) full balance sims (opt-in)
if (process.env.D4_FULL_SIMS === '1') {
  const c = spawnSync(process.execPath, [path.join(__dirname, 'sim-cricket.js')], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  assert(c.status === 0 && /All balance targets met/.test(c.stdout), 'sim-cricket: all balance targets met');
  const b = spawnSync(process.execPath, [path.join(__dirname, 'sim-badminton.js'), '10000'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const rallies = Array.from((b.stdout || '').matchAll(/rally (\d+\.\d+)/g)).map((m) => Number(m[1]));
  const grad = JSON.parse(((b.stdout || '').match(/gradient \(\d+ each\) (\{[^}]+\})/) || [0, '{}'])[1]);
  assert(b.status === 0 && rallies.length === 4 && rallies.every((r) => r >= 6 && r <= 14) && grad['pro>beginner'] > 0.9 && grad['club>beginner'] > 0.6, 'sim-badminton: rally lengths and the level gradient on target');
}

console.log('\nDangal D4 final dogfood checks passed (' + passed + ').');
