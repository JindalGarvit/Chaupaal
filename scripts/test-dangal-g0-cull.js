/**
 * Dangal G0 — roster cull (13 titles retired, 19 kept).
 *  (a) no retired id in registries / identity / graduation / game-of-day / matchmaking
 *  (b) every kept id resolves (roster, registration, identity, graduation, GOTD)
 *  (c) a retired id resolves to the retired screen (client) and voids cleanly (server)
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

const RETIRED = [
  'rushrunner', 'pool', 'bowling', 'pickleball', 'tennis', 'fiveinrow', 'andarbaahar',
  'sattepe', 'business', 'tabletennis', 'kabaddi', 'khokho', 'gullykick',
];
const KEPT = [
  'tiptap', 'brickbreaker', 'ankjod', 'wordguess', 'chess', 'ttt', 'snakes', 'ludo', 'uno',
  'scribble', 'quiz', 'carrom', 'rummy', 'teenpatti', 'bluff', 'tambola', 'streetcricket',
  'badminton', 'patangbaazi',
];

// ---------- (a) retired ids absent from shipped registries ----------
const stripRetiredLists = (src) =>
  src
    .replace(/const RETIRED_IDS = \[[\s\S]*?\];/, '')
    .replace(/const RETIRED_ALIASES = \[[\s\S]*?\];/, '')
    .replace(/const RETIRED_GAME_IDS = new Set\(\[[\s\S]*?\]\);/, '');

const scanned = {
  'game-registry': read('public/src/js/games/game-registry.js'),
  'design-system (identity)': read('public/src/js/dangal/design-system.js'),
  'dangal-graduation': stripRetiredLists(read('public/src/js/dangal/dangal-graduation.js')),
  'dangal-utils (aliases)': read('public/src/js/dangal/dangal-utils.js'),
  'game-ui (labels/accents)': read('public/src/js/games/game-ui.js'),
  'game-of-day': read('server-lib/game-of-day.js'),
  'dangal-matchmaking': read('server-lib/dangal-matchmaking.js'),
  'dangal-economy': stripRetiredLists(read('server-lib/dangal-economy.js')),
  'khel-daily': read('public/src/js/dangal/dangal-khel-daily.js'),
  'challenge-cards': read('public/src/js/dangal/dangal-challenge-cards.js'),
};
for (const [name, src] of Object.entries(scanned)) {
  const hits = RETIRED.filter((id) => new RegExp(`['"\`]${id}['"\`]|\\b${id}\\s*:|M\\.${id}\\b`).test(src));
  assert(hits.length === 0, `${name}: no retired ids${hits.length ? ' (found ' + hits.join(',') + ')' : ''}`);
}

const gameFiles = ['arcade', 'board-games', 'rw-sports', 'court-sports', 'party-classics', 'engines', 'brick-breaker', 'ank-jod']
  .concat(['game-registry'])
  .map((f) => read(`public/src/js/games/${f}.js`))
  .join('\n');
RETIRED.forEach((id) => {
  assert(!new RegExp(`id:\\s*'${id}'`).test(gameFiles), `${id} not registered by any game file`);
});
['openPool', 'openBowling', 'openBusinessGame', 'openGullyKick', 'openKabaddi', 'openKhoKho', 'openSattePeSatta', 'openAndarBahar', 'openRushRunner', 'openFiveInRow', 'openTableTennis', 'openPickleball', 'openTennis'].forEach((fn) => {
  assert(!new RegExp(`window\\.${fn}\\s*=`).test(gameFiles), `${fn} launcher removed`);
});

// ---------- load graduation in a sandbox ----------
const appended = [];
function fakeEl() {
  const listeners = {};
  const el = {
    className: '',
    dataset: {},
    attrs: {},
    innerHTML: '',
    removed: false,
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(t, fn) { listeners[t] = fn; },
    remove() { this.removed = true; },
    querySelector(sel) {
      if (!this.innerHTML.includes(sel.replace(/[[\]]/g, ''))) return null;
      return { addEventListener(t, fn) { listeners[sel + ':' + t] = fn; } };
    },
    fire(key) { if (listeners[key]) listeners[key]({ target: null }); },
  };
  return el;
}
const device = { appendChild(el) { appended.push(el); } };
let tabClicked = false;
const sandbox = {
  window: {},
  document: {
    createElement: () => fakeEl(),
    querySelector: (sel) => {
      if (sel === '.device') return device;
      if (sel === '.tab-btn[data-tab="dangal"]') return { click() { tabClicked = true; } };
      return null;
    },
    body: device,
  },
  console,
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(read('public/src/js/dangal/dangal-graduation.js'), sandbox);

// ---------- (b) kept ids resolve ----------
assert(Array.isArray(sandbox.DANGAL_ROSTER_IDS), 'DANGAL_ROSTER_IDS exported');
assert(sandbox.DANGAL_ROSTER_IDS.length === 19, `roster has 19 titles (got ${sandbox.DANGAL_ROSTER_IDS.length})`);
assert(
  KEPT.every((id) => sandbox.DANGAL_ROSTER_IDS.includes(id)) && sandbox.DANGAL_ROSTER_IDS.every((id) => KEPT.includes(id)),
  'roster == the 19 kept ids'
);
assert(sandbox.isRosterGameId('kakuro'), 'kakuro alias resolves to roster (ankjod)');
assert(
  sandbox.DANGAL_ROSTER_SECTIONS.some((s) => s.id === 'party' && s.label),
  'party section label exported for G1–G3'
);
const ds = read('public/src/js/dangal/design-system.js');
const registry = read('public/src/js/games/game-registry.js');
KEPT.forEach((id) => {
  assert(sandbox.isRosterGameId(id) && !sandbox.isRetiredGameId(id), `${id} on roster, not retired`);
  assert(new RegExp(`id:\\s*'${id}'`).test(gameFiles), `${id} registered by a game file`);
  assert(ds.includes(`mark: M.${id}`), `${id} keeps identity mark`);
  const grad = sandbox.getGameGraduation(id);
  assert(grad && grad.grade !== 'practice', `${id} graduation entry present`);
  assert(!!sandbox.rosterGenre(id), `${id} has a roster genre`);
});
assert(/window\.DANGAL_ROSTER/.test(registry) && /isRosterGameId\(g\.id\)/.test(registry), 'registry genre + getGames read the roster');
assert(/isRetiredGameId\(descriptor\.id\)/.test(registry), 'registerGame rejects retired ids');

const gotd = require(path.join(root, 'server-lib/game-of-day.js'));
assert(
  gotd.KNOWN_GAME_IDS.length === 19 && KEPT.every((id) => gotd.KNOWN_GAME_IDS.includes(id)),
  'game-of-day rotates the 19-title roster'
);
KEPT.forEach((id) => {
  assert(gotd.GAME_GENRE_BY_ID[id] === sandbox.rosterGenre(id), `${id} GOTD genre matches roster`);
});

// ---------- (c) retired id → retired screen ----------
RETIRED.concat(['snooker', 'fiveinarow', 'football', 'kho-kho']).forEach((id) => {
  assert(sandbox.isRetiredGameId(id), `${id} recognised as retired`);
});
assert(sandbox.dangalManchVisibility('pool') === 'hidden', 'retired id hidden from Manch');
const screen = sandbox.openRetiredGameScreen('gullykick');
assert(screen && appended.includes(screen), 'retired screen mounts on device');
assert(/This game has retired/.test(screen.innerHTML), 'retired screen copy');
assert(/Browse games/.test(screen.innerHTML), 'retired screen Browse games CTA');
assert(!/error|undefined|null/i.test(screen.innerHTML), 'retired screen shows no raw error');
screen.fire('[data-retired-browse]:click');
assert(tabClicked && screen.removed, 'Browse games closes screen and opens Manch');

['launchDangalGame', 'launchDangalWithOpponent', 'handleDangalGameTap'].forEach((fn) => {
  const body = registry.slice(registry.indexOf(`function ${fn}(`), registry.indexOf(`function ${fn}(`) + 400);
  assert(/showRetiredIfRetired\(/.test(body), `${fn} routes retired ids to the retired screen`);
});
const cards = read('public/src/js/dangal/dangal-challenge-cards.js');
assert(/isRetiredGameId\(att\.gameType\)/.test(cards) && /openRetiredGameScreen\(att\.gameType\)/.test(cards), 'old challenge cards → retired screen');
const onboarding = read('public/src/js/features/onboarding.js');
assert(/isRetiredGameId\(game\)[\s\S]{0,300}openRetiredGameScreen\(game\)/.test(onboarding), '/challenge/{retired} deep link → retired screen');
const streak = read('public/src/js/features/streak.js');
assert(/status==='retired'[\s\S]{0,400}openRetiredGameScreen/.test(streak), 'matchmaking retired status → retired screen');

// ---------- server: void + queue reject ----------
function fakeDb() {
  const writes = [];
  const doc = (p) => ({
    path: p,
    collection: (c) => col(p + '/' + c),
    get: async () => ({ exists: p.endsWith('/wallet/chips'), data: () => ({ balance: 740, lifetimeEarned: 1200 }) }),
    set: async (d) => writes.push(['set', p, d]),
    delete: async () => writes.push(['delete', p]),
  });
  const col = (p) => ({
    doc: (id) => doc(p + '/' + id),
    add: async (d) => { writes.push(['add', p, d]); return { id: 'x' }; },
    orderBy: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }),
    limit: () => ({ get: async () => ({ docs: [] }) }),
  });
  return { writes, collection: col, batch: () => ({ set: (r, d) => writes.push(['batch', r.path, d]), commit: async () => {} }) };
}
const admin = { firestore: { FieldValue: { serverTimestamp: () => 'ts', increment: (n) => n } } };

(async () => {
  const econ = require(path.join(root, 'server-lib/dangal-economy.js'));
  assert(!econ.RATED.has('fiveinrow') && !econ.RATED.has('gullykick') && econ.RATED.has('chess'), 'rated set = roster only');
  const db1 = fakeDb();
  const res = await econ.resolveGame(db1, admin, 'u'.repeat(28), {
    gameType: 'pool', result: 'win', won: true, stake: 50, opponentUid: 'o'.repeat(28), matchId: 'm1',
  });
  assert(res.retired === true && res.chipDelta === 0 && res.eloDelta === 0, 'retired match voids: 0 chips, 0 Elo');
  assert(res.chips === 740, 'void returns current wallet balance untouched');
  assert(!db1.writes.some((w) => w[0] === 'batch'), 'void writes no stats / leaderboard / wallet');

  const mm = require(path.join(root, 'server-lib/dangal-matchmaking.js'));
  const db2 = fakeDb();
  const step = await mm.dangalMatchStep(db2, admin, { uid: 'u'.repeat(28), name: 'A', category: 'kabaddi', gameId: 'kabaddi' });
  assert(step.status === 'retired', 'matchmaking rejects retired id');
  assert(!db2.writes.some((w) => w[0] === 'add'), 'retired id never enqueued');
  const ok = await mm.dangalMatchStep(fakeDb(), admin, { uid: 'u'.repeat(28), name: 'A', category: 'chess', gameId: 'chess' });
  assert(ok.status === 'waiting', 'kept id still queues');

  const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
  assert(apiCount === 12, `api/*.js = 12 (got ${apiCount})`);

  console.log('\nDangal G0 cull checks passed.');
})().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
