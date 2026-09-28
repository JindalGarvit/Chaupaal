#!/usr/bin/env node
/**
 * Dangal P1 — shared pro contracts conformance:
 * rules declarations, Live edge-case policy, ratings service (Glicko-2), AI hooks.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let failed = 0;
let passed = 0;
function assert(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    console.error('FAIL:', msg);
  }
}
const near = (a, b, eps) => Math.abs(a - b) <= (eps || 0.01);

// ─── Browser globals from dangal-graduation (roster + live grades) ─────────
const box = { window: {}, console, localStorage: { getItem: () => null, setItem() {} } };
box.window = box;
vm.createContext(box);
vm.runInContext(read('public/src/js/dangal/dangal-graduation.js'), box);
const ROSTER = box.DANGAL_ROSTER_IDS || [];
const grad = (id) => (typeof box.getGameGraduation === 'function' ? box.getGameGraduation(id) : {});

const Rules = require(path.join(root, 'public/src/js/dangal/dangal-rules.js'));
const Policy = require(path.join(root, 'public/src/js/dangal/dangal-live-policy.js'));
const RM = require(path.join(root, 'public/src/js/dangal/dangal-rating-math.js'));

// ─── 1. Rules contract ────────────────────────────────────────────────────
assert(ROSTER.length === 25, 'roster has 25 games (got ' + ROSTER.length + ')');
const ruleSources = {};
read('public/src/js/dangal/design-system.js').replace(/^\s{4}(\w+): '([^']+)',$/gm, (_, k, v) => (ruleSources[k] = v));
ROSTER.forEach((id) => {
  const g = Rules.get(id);
  assert(!!g, id + ': declares rules');
  if (!g) return;
  assert(g.ruleset && g.ruleset.name && g.ruleset.source && typeof g.ruleset.simplified === 'boolean', id + ': ruleset name/source/simplified');
  assert(!ruleSources[id] || ruleSources[id] === g.ruleset.source, id + ': ruleset source matches the How-to attribution');
  assert(Array.isArray(g.variants), id + ': variants array');
  g.variants.forEach((v) => {
    assert(['host', 'both', 'solo'].indexOf(v.who) >= 0, id + '.' + v.key + ': who may change it');
    assert(v.options ? v.options.indexOf(v.default) >= 0 : v.range && v.default >= v.range[0] && v.default <= v.range[1], id + '.' + v.key + ': default within options/range');
  });
  assert(g.glance.length === 3 && g.glance.every((l) => typeof l === 'string' && l.length <= 90), id + ': 3-line glance');
  assert(g.rules.length >= 2 && g.rules.every((r) => r.h && r.body), id + ': full rulebook text');
  assert(/Simplified rules/.test(Rules.sheetHtml(id)) === g.ruleset.simplified, id + ': sheet shows Simplified tag only when simplified');
});
assert(Rules.IDS.length === 25 && Rules.IDS.every((id) => ROSTER.indexOf(id) >= 0), 'no rules for games outside the roster');
assert(Rules.nonDefault('chess', Rules.defaults('chess')).length === 0, 'defaults produce no house rules');
const house = Rules.nonDefault('chess', { time: '3+2', chess960: true, bogus: 1 });
assert(house.length === 2 && /Time control: 3\+2/.test(house[0].text) && /On/.test(house[1].text), 'house rules list only non-defaults');
assert(/House rules in this game/.test(Rules.sheetHtml('chess', { variants: { chess960: true } })) && !/House rules/.test(Rules.sheetHtml('chess')), 'sheet: house-rules block only when non-default');
assert(Rules.normalize('penalty', { bestOf: 7 }).bestOf === 5 && Rules.normalize('bluff', { lives: 99 }).lives === 5, 'normalize coerces into options/range');
const locked = Rules.lockVariants('snakes', { variant: 'moksha' });
assert(Object.isFrozen(locked) && Object.isFrozen(locked.values) && locked.values.variant === 'moksha' && locked.locked, 'lockVariants freezes the match record');
assert(Rules.fromLaunchCtx('chess', { timeControl: '∞', chess960: true }).time === 'none' && Rules.fromLaunchCtx('ludo', { ludoMode: 'quick' }).mode === 'quick', 'launch context maps onto declared variants');
assert(!Rules.canChange('chess', 'time', { live: true, isHost: false }) && Rules.canChange('chess', 'time', { live: true, isHost: true }) && !Rules.canChange('chess', 'time', { locked: true, isHost: true }), 'host-only variants lock at start');
const live = read('public/src/js/dangal/dangal-live.js');
assert(/variants: lockedVariants\(\)/.test(live) && /__dangalLiveVariants/.test(live), 'Live match stores locked variants; both players read them');
assert(/ensureRulesButton\(gameId\)/.test(read('public/src/js/games/game-registry.js')), 'every launch gets the shared Rules sheet button');
assert(/DangalRules\.openSheet/.test(read('public/src/js/games/game-ui.js')), 'How-to opens the shared Rules sheet');
const html = read('public/index.html');
['dangal-rating-math.js', 'dangal-live-policy.js', 'dangal-rules.js'].forEach((f) => {
  assert(html.indexOf(f) > 0 && html.indexOf(f) < html.indexOf('dangal/design-system.js'), f + ' loads before design-system/live');
});
assert(html.indexOf('chess-elo.js') < 0 && !fs.existsSync(path.join(root, 'public/src/js/dangal/chess-elo.js')), 'chess-elo.js removed');

// ─── 2. Live policy ───────────────────────────────────────────────────────
const liveIds = ROSTER.filter((id) => {
  const g = grad(id);
  return g.grade === 'live' || g.sync === 'live1v1' || g.sync === 'liveParty';
});
assert(liveIds.length >= 15, 'graduation exposes Live games (' + liveIds.length + ')');
liveIds.forEach((id) => assert(Policy.LIVE_GAMES.indexOf(id) >= 0, id + ': Live game has a policy'));
Policy.LIVE_GAMES.forEach((id) => {
  const p = Policy.policyFor(id);
  assert(p.reconnectMs >= 30000 && p.heartbeatMs > 0 && p.afk.maxMisses >= 1 && p.dualLeave, id + ': complete policy');
});
assert(Policy.policyFor('chess').reconnectMs === 60000 && Policy.DEFAULTS.reconnectMs === 60000, 'default reconnect window 60s');
assert(Policy.policyFor('poker').reconnectMs === 90000 && Policy.policyFor('penalty').reconnectMs === 90000, 'server engines keep 90s');
assert(require(path.join(root, 'server-lib/party-deal.js')).OFFLINE_MS === 45000, 'party rooms keep 45s via policy');
assert(/LIVE_POLICY\.reconnectMs/.test(read('server-lib/poker-engine.js')) && /policyFor\('penalty'\)/.test(read('server-lib/penalty-engine.js')), 'engines read the policy');

// Simulated match: A drops, reconnects within the window, state is untouched.
const pol = Policy.policyFor('ludo');
const t0 = 1_000_000;
const match = { state: { board: 'X', turn: 'A' }, seats: { A: { dev: 'phoneA', at: t0 } }, presence: { A: { at: t0, online: false } } };
const before = JSON.stringify(match.state);
let st = Policy.reconnectStatus(match.presence.A, t0 + 30000, pol);
assert(!st.online && !st.expired && st.msLeft === 30000 && st.warn, 'reconnect: countdown running, not expired at 30s');
assert(Policy.countdownText(st.msLeft) === '0:30', 'countdown text');
const rejoin = Policy.claimSeat(match.seats.A, 'phoneA', t0 + 30000, pol);
assert(rejoin.role === 'player' && JSON.stringify(match.state) === before, 'reconnect: same device reclaims seat, exact state restored');
st = Policy.reconnectStatus({ at: t0, online: true }, t0 + pol.heartbeatMs * 3, pol);
assert(!st.online, 'killed app: silent heartbeat counts as offline');
st = Policy.reconnectStatus(match.presence.A, t0 + 60000, pol);
assert(st.expired, 'reconnect window expires at 60s');
assert(Policy.abandonOutcome(['A', 'B'], ['A'], pol).status === 'forfeit' && Policy.abandonOutcome(['A', 'B'], ['A'], pol).winner === 'B', 'abandon: the one who stayed wins');

// AFK → auto-action → forfeit after N misses.
let misses = 0;
let step;
for (let i = 0; i < 5; i++) {
  step = Policy.afkStep(misses, pol);
  misses = step.misses;
  if (step.forfeit) break;
}
assert(step.forfeit && misses === pol.afk.maxMisses && step.action === 'auto_play', 'AFK: auto-play, then forfeit after maxMisses');
assert(Policy.afkStep(0, Policy.policyFor('teenpatti')).action === 'fold', 'Teen Patti AFK folds');

// Dual leave → void + refund; tables/rooms continue.
const both = Policy.abandonOutcome(['A', 'B'], ['A', 'B'], pol);
assert(both.status === 'void' && both.refund && !both.rated && both.winner === null, 'dual leave: void + refund, unrated');
assert(Policy.abandonOutcome(['A', 'B', 'C'], ['A'], Policy.policyFor('imposter')).status === 'playing', 'party room continues with 2+');
assert(/status = 'void'/.test(live) && /voidReason/.test(live), 'dangal-live voids when both players are gone');

// Duplicate device → one seat, the other watches.
const dup = Policy.claimSeat({ dev: 'phoneA', at: t0 }, 'tabletA', t0 + 5000, pol);
assert(dup.role === 'spectator', 'duplicate device: second device is a spectator');
assert(Policy.claimSeat({ dev: 'phoneA', at: t0 }, 'tabletA', t0 + pol.reconnectMs, pol).tookOver, 'stale seat can be taken over after the window');
assert(/becomeSpectator\('device'\)/.test(live) && /claimSeat/.test(live), 'dangal-live enforces single seat');

// Version / rematch / server time.
assert(Policy.versionMismatch(1) && !Policy.versionMismatch(Policy.PROTOCOL) && !Policy.versionMismatch(undefined), 'version mismatch detection');
assert(JSON.stringify(Policy.rematchSeats(['A', 'B'], pol)) === '["B","A"]' && JSON.stringify(Policy.rematchSeats(['A', 'B'], Policy.policyFor('quiz'))) === '["A","B"]', 'rematch swaps sides where the game has sides');
assert(Policy.serverNow(250, 1000) === 1250, 'server time = local + RTDB offset');
assert(Policy.settlementKey('m/1', 'u') === 'm1_u', 'settlement key is deterministic');
assert(Policy.policyFor('chess').draw && Policy.policyFor('chess').spectate && !Policy.policyFor('poker').resign, 'draw / spectate / resign flags per game');

// ─── 3. Ratings ───────────────────────────────────────────────────────────
// Glickman (2012) worked example, shifted from 1500 to our 1200 base.
const g = RM.update({ r: 1200, rd: 200, vol: 0.06, games: 0 }, [
  { r: 1100, rd: 30, score: 1 },
  { r: 1250, rd: 100, score: 0 },
  { r: 1400, rd: 300, score: 0 },
]);
assert(near(g.r, 1164.05, 0.05) && near(g.rd, 151.52, 0.05) && near(g.vol, 0.05999, 0.00001), 'Glicko-2 matches the reference fixture');
const legacy = RM.fromStats({ elo: 1437, totalGames: 42 });
assert(legacy.r === 1437 && legacy.games === 42 && legacy.rd === 80, 'legacy Elo migrates without reset');
assert(RM.fromStats({ elo: 1300, rating: { r: 1310.5, rd: 90, vol: 0.06, games: 12 } }).r === 1310.5, 'migrated record preferred');
assert(RM.isProvisional(RM.fromStats({ elo: 1200, totalGames: 3 })) && !RM.isProvisional(legacy), 'provisional under 10 games');
assert(JSON.stringify(RM.RATED) === JSON.stringify(['chess', 'streetcricket', 'quiz', 'penalty', 'carrom', 'badminton', 'rummy']), 'rated set');
assert(!RM.isRated('ttt'), 'Tic-Tac-Toe is unrated');
assert(!RM.shouldRate({ gameType: 'chess', opponentUid: 'x', vsBot: true }) && !RM.shouldRate({ gameType: 'chess', opponentUid: 'x', privateTable: true }) && RM.shouldRate({ gameType: 'chess', opponentUid: 'x', privateTable: true, rated: true }), 'no rating vs bots or unrated private tables');
const rm = RM.rateMatch(RM.fromStats({ elo: 1200, totalGames: 40 }), RM.fromStats({ elo: 1200, totalGames: 40 }), 1);
assert(rm.deltaA > 0 && rm.deltaB < 0 && Math.abs(rm.deltaA + rm.deltaB) <= 1, 'equal players: symmetric deltas');
const ds = read('public/src/js/dangal/design-system.js');
assert(!/RATED_GAMES = \[[^\]]*'ttt'/.test(ds) && /DangalRatingMath/.test(ds), 'client rated list drops ttt');
assert(!/recordGameResult[\s\S]{0,400}ratings\[key\]=/.test(read('public/src/js/features/dangal-ratings.js')), 'client no longer invents local ratings');

// In-memory Firestore with create() semantics (for settlement idempotency).
function memDb() {
  const store = new Map();
  let auto = 0;
  const FV = {
    serverTimestamp: () => ({ __ts: true }),
    increment: (n) => ({ __inc: n }),
  };
  const apply = (prev, data, merge) => {
    const out = merge ? Object.assign({}, prev || {}) : {};
    Object.keys(data).forEach((k) => {
      const v = data[k];
      out[k] = v && v.__inc !== undefined ? (Number((prev || {})[k]) || 0) + v.__inc : v;
    });
    return out;
  };
  const docRef = (p) => ({
    path: p,
    id: p.split('/').pop(),
    collection: (c) => colRef(p + '/' + c),
    get: async () => ({ exists: store.has(p), data: () => store.get(p), id: p.split('/').pop(), ref: docRef(p) }),
    set: async (d, o) => store.set(p, apply(store.get(p), d, o && o.merge)),
    update: async (d) => store.set(p, apply(store.get(p), d, true)),
    delete: async () => store.delete(p),
  });
  const colRef = (p) => ({
    doc: (id) => docRef(p + '/' + (id || 'auto' + ++auto)),
    add: async (d) => {
      const r = docRef(p + '/auto' + ++auto);
      await r.set(d);
      return r;
    },
    limit: () => ({ get: async () => ({ docs: [...store.keys()].filter((k) => k.startsWith(p + '/') && k.split('/').length === p.split('/').length + 1).map((k) => ({ id: k.split('/').pop(), data: () => store.get(k) })) }) }),
  });
  return {
    store,
    admin: { firestore: { FieldValue: FV } },
    collection: colRef,
    async runTransaction(fn) {
      const ops = [];
      await fn({ get: (r) => r.get(), set: (r, d, o) => ops.push([r, d, o]) });
      for (const [r, d, o] of ops) await r.set(d, o);
    },
    batch() {
      const ops = [];
      return {
        set: (r, d, o) => ops.push(['set', r.path, d, o]),
        create: (r, d) => ops.push(['create', r.path, d]),
        async commit() {
          await new Promise((res) => setImmediate(res));
          if (ops.some((op) => op[0] === 'create' && store.has(op[1]))) throw Object.assign(new Error('6 ALREADY_EXISTS: Document already exists'), { code: 6 });
          ops.forEach((op) => store.set(op[1], apply(store.get(op[1]), op[2], op[0] === 'set' && op[3] && op[3].merge)));
        },
      };
    },
  };
}

(async () => {
  const econ = require(path.join(root, 'server-lib/dangal-economy.js'));
  assert(!econ.RATED.has('ttt') && econ.RATED.has('carrom') && econ.RATED.has('rummy'), 'server rated set from the ratings service');
  const A = 'a'.repeat(28);
  const B = 'b'.repeat(28);

  // Existing ratings preserved + Glicko fields written on first rated match.
  const db = memDb();
  await db.collection('users').doc(A).collection('gameStats').doc('carrom').set({ elo: 1480, totalGames: 35, wins: 20 });
  await db.collection('users').doc(B).collection('gameStats').doc('carrom').set({ elo: 1450, totalGames: 30, wins: 15 });
  const body = { gameType: 'carrom', result: 'win', won: true, opponentUid: B, stake: 50, matchId: 'carrom_mm_abc' };
  const [r1, r2] = await Promise.all([econ.resolveGame(db, db.admin, A, body), econ.resolveGame(db, db.admin, B, Object.assign({}, body, { won: false, result: 'loss', opponentUid: A }))]);
  assert(r1.pending && !r1.chipDelta && !r2.duplicate && !r2.pending, 'client win claim waits; the loser’s report settles');
  const r3 = await econ.resolveGame(db, db.admin, B, Object.assign({}, body, { won: false, result: 'loss', opponentUid: A }));
  assert(r3.duplicate, 'double report settles once (create() guard)');
  const aStats = db.store.get('users/' + A + '/gameStats/carrom');
  assert(aStats.elo > 1480 && aStats.elo < 1500 && aStats.rating && aStats.rating.games === 36 && aStats.rating.v === 2, 'rated win: Elo number continues, Glicko record added');
  const again = await econ.resolveGame(db, db.admin, A, body);
  assert(again.duplicate && db.store.get('users/' + A + '/gameStats/carrom').totalGames === 36, 'retry is idempotent');
  const ledger = [...db.store.keys()].filter((k) => /chipTransactions\/m_c_carrom_mm_abc$/.test(k));
  assert(ledger.length === 2 && db.store.get(ledger[0]).matchId === 'c_carrom_mm_abc', 'one ledger entry per side, keyed by (client-namespaced) matchId');

  // TTT: history kept, rating frozen.
  await db.collection('users').doc(A).collection('gameStats').doc('ttt').set({ elo: 1333, totalGames: 9 });
  const ttt = await econ.resolveGame(db, db.admin, A, { gameType: 'ttt', result: 'win', won: true, opponentUid: B, matchId: 'ttt_mm_1' }, { trusted: true });
  const tStats = db.store.get('users/' + A + '/gameStats/ttt');
  assert(ttt.eloDelta === 0 && !ttt.rated && tStats.elo === 1333 && tStats.totalGames === 10 && !tStats.rating, 'TTT unrated: history kept, rating untouched');

  // Friend-only private table: unrated unless marked rated; bots never rated.
  const priv = await econ.resolveGame(db, db.admin, B, { gameType: 'carrom', result: 'loss', won: false, opponentUid: A, matchId: 'carrom_friend_1' });
  assert(!priv.rated && priv.eloDelta === 0, 'private friend table unrated by default');
  const privRated = await econ.resolveGame(db, db.admin, B, { gameType: 'carrom', result: 'loss', won: false, opponentUid: A, matchId: 'carrom_friend_2', rated: true });
  assert(privRated.rated && privRated.eloDelta < 0, 'private table rated when marked');
  const bot = await econ.resolveGame(db, db.admin, A, { gameType: 'carrom', result: 'win', won: true, vsBot: true, matchId: 'carrom_bot_1' });
  assert(!bot.rated && bot.eloDelta === 0, 'no rating change vs bots');

  // Matchmaking reads migrated ratings + rematch spam guard.
  const mm = require(path.join(root, 'server-lib/dangal-matchmaking.js'));
  assert((await mm.loadGameElo(db, A, 'carrom')) === db.store.get('users/' + A + '/gameStats/carrom').elo, 'matchmaking reads the rating service');
  assert(!mm.isRatedGame('ttt') && mm.isRatedGame('badminton'), 'matchmaking rated set');
  const nowMs = Date.now();
  const avoid = mm.repeatAvoidSet({ x: [nowMs - 1000, nowMs - 2000, nowMs - 3000], y: [nowMs - 1000], z: [nowMs - 2 * 3600e3, nowMs - 2 * 3600e3, nowMs - 2 * 3600e3] }, nowMs);
  assert(avoid.has('x') && !avoid.has('y') && !avoid.has('z'), 'rematch spam guard: 3 pairings / hour');
  const pick = mm.pickBestOpponent('me', 1200, [{ uid: 'x', elo: 1200 }, { uid: 'w', elo: 1260 }], { avoid });
  assert(pick.opponent && pick.opponent.uid === 'w', 'matchmaking skips spam-paired opponent');
  assert(mm.eloBandForWaitMs(0) < mm.eloBandForWaitMs(20000), 'rating band widens with wait');

  // ─── 4. AI contract ─────────────────────────────────────────────────────
  const AI = require(path.join(root, 'server-lib/dangal-ai.js'));
  assert(JSON.stringify(AI.HOOKS) === JSON.stringify(['coachExplain', 'commentary', 'generateQuestions', 'generateWordPack', 'botPersona']), 'five AI hooks');
  const off = AI.createDangalAI({ env: { AI_FEATURES_ENABLED: 'TRUE' }, callAI: () => { throw new Error('must not call'); } });
  const INPUTS = {
    coachExplain: { gameId: 'chess', move: 'e4' },
    commentary: { gameId: 'penalty', event: 'goal' },
    generateQuestions: { category: 'GK', count: 4 },
    generateWordPack: { game: 'imposter', count: 6 },
    botPersona: { gameId: 'poker', level: 'shark' },
  };
  for (const h of AI.HOOKS) {
    const out = await off.run(h, INPUTS[h]);
    assert(out.source === 'fallback' && AI.SCHEMAS[h](out.data) && AI.isSafe(out.data), h + ': AI off → valid fallback (only exact "true" enables)');
  }
  const GOOD = {
    coachExplain: { text: 'Strong centre move.', tips: ['Develop knights', 'Castle early'] },
    commentary: { line: 'Top corner!' },
    generateQuestions: { questions: [{ q: 'Largest planet?', options: ['Mars', 'Jupiter', 'Earth', 'Venus'], answer: 1 }] },
    generateWordPack: { words: ['Moon', 'Star', 'Comet', 'Orbit'] },
    botPersona: { name: 'Nova', style: { aggression: 0.4, bluff: 0.2, speed: 0.7, chattiness: 0.3 } },
  };
  let calls = 0;
  const on = AI.createDangalAI({ env: { AI_FEATURES_ENABLED: 'true', AI_DAILY_CALL_CAP: '100' }, userCap: 50, callAI: async (o) => { calls++; const h = o.feature.replace('dangal_', ''); return { text: 'Here: ' + JSON.stringify(GOOD[h]) }; } });
  for (const h of AI.HOOKS) {
    const out = await on.run(h, INPUTS[h], { uid: 'u1' });
    assert(out.source === 'ai' && JSON.stringify(out.data) === JSON.stringify(GOOD[h]), h + ': mocked provider output passes schema');
  }
  const cached = await on.run('commentary', INPUTS.commentary, { uid: 'u1' });
  assert(cached.source === 'cache' && calls === 5, 'cache by input hash');
  const tel = on.telemetry();
  assert(tel.aiCalls === 5 && tel.hooks.commentary.cacheHits === 1 && tel.costUsdEst > 0, 'telemetry counters + cost estimate');

  const bad = (text) => AI.createDangalAI({ env: { AI_FEATURES_ENABLED: 'true' }, callAI: async () => ({ text }) });
  assert((await bad('{"line": 42}').run('commentary', {})).source === 'fallback', 'schema violation → fallback');
  assert((await bad('not json').run('commentary', {})).source === 'fallback', 'unparseable → fallback');
  assert((await bad('{"line":"visit https://x.io"}').run('commentary', {})).source === 'fallback', 'unsafe output → fallback');
  assert((await bad('{"questions":[{"q":"a?","options":["x","x","y","z"],"answer":1}]}').run('generateQuestions', {})).source === 'fallback', 'duplicate options rejected');
  assert((await bad('{"name":"Bot","style":{"aggression":2,"bluff":0,"speed":0,"chattiness":0}}').run('botPersona', {})).source === 'fallback', 'persona style out of range rejected');
  const thrower = AI.createDangalAI({ env: { AI_FEATURES_ENABLED: 'true' }, callAI: async () => { throw Object.assign(new Error('401 raw provider error'), { code: 'AI_NOT_CONFIGURED' }); } });
  const thrown = await thrower.run('commentary', { event: 'win' });
  assert(thrown.source === 'fallback' && !/401/.test(JSON.stringify(thrown)), 'missing key / provider error → fallback, no raw error');
  const slow = AI.createDangalAI({ env: { AI_FEATURES_ENABLED: 'true' }, timeoutMs: 30, callAI: () => new Promise((r) => setTimeout(() => r({ text: '{"line":"late"}' }), 200)) });
  const timed = await slow.run('commentary', {});
  assert(timed.source === 'fallback' && timed.reason === 'timeout', 'timeout → fallback');
  const capped = AI.createDangalAI({ env: { AI_FEATURES_ENABLED: 'true' }, userCap: 1, callAI: async () => ({ text: '{"line":"ok"}' }) });
  await capped.run('commentary', { n: 1 }, { uid: 'z' });
  assert((await capped.run('commentary', { n: 2 }, { uid: 'z' })).reason === 'user_cap', 'per-user cap');
  const gcap = AI.createDangalAI({ env: { AI_FEATURES_ENABLED: 'true', AI_DAILY_CALL_CAP: '1' }, callAI: async () => ({ text: '{"line":"ok"}' }) });
  await gcap.run('commentary', { n: 1 }, { uid: 'p' });
  assert((await gcap.run('commentary', { n: 2 }, { uid: 'q' })).reason === 'global_cap', 'global daily cap');
  const paused = AI.createDangalAI({ env: { AI_FEATURES_ENABLED: 'true', AI_JOBS_PAUSED: 'true' }, callAI: () => { throw new Error('no'); } });
  assert((await paused.run('commentary', {})).reason === 'ai_off', 'AI_JOBS_PAUSED respected');
  assert(/action === 'dangal_ai'/.test(read('api/media-config.js')), 'AI hooks folded into media-config');
  assert(!/sk-ant-|xai-[A-Za-z0-9]{10}/.test(read('server-lib/dangal-ai.js')), 'no embedded keys');

  // ─── Platform ───────────────────────────────────────────────────────────
  const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
  assert(apiCount === 12, 'api/*.js = 12 (got ' + apiCount + ')');

  console.log(`\nDangal P1 contracts: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
