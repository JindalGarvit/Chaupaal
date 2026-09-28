/**
 * Dangal D1 — dogfood wave A (P0–P6). Aggregates every P-arc test and adds a regression check
 * for each bug the dogfood pass found:
 *  (a) aggregate P0 residuals, P1 contracts, P2 chess, P3 classics, P4 Oh No!, P5 words, P6 quiz
 *  (b) economy: client claims can't take chips, loser-pays cap, stake symmetry, void / stayer / forfeit
 *  (c) live edge cases: chess both-gone void, last leaver settles, Oh No! secrets, rematch consent
 *  (d) rules: Ludo 2v2 winning team, chess draws are claims by default, AFK = one miss per turn
 *  (e) words + quiz: Scribble leaks, pause clocks, quiz shuffle secrecy, latency, rejoin lock, Shabd midnight
 *  (f) UX: hardware Back, How-to sheet, feedback prefs, lazy Shabd data, tap targets, colour-blind, tablet
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error('FAIL: ' + msg);
  } else console.log('ok: ' + msg);
}

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');

// ---------- (a) aggregate ----------
[
  'test-dangal-p0-residuals.js',
  'test-dangal-p1-contracts.js',
  'test-dangal-p2-chess.js',
  'test-dangal-p3-classics.js',
  'test-dangal-p4-ohno.js',
  'test-dangal-p5-words.js',
  'test-dangal-p6-quiz.js',
].forEach((f) => {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) console.error(String(r.stdout).slice(-2000), String(r.stderr).slice(-2000));
  assert(r.status === 0, 'aggregate: ' + f);
});

// In-memory Firestore (create() + transactions) for settlement checks.
function memDb() {
  const store = new Map();
  let auto = 0;
  const FV = { serverTimestamp: () => ({ __ts: true }), increment: (n) => ({ __inc: n }) };
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
      const out = await fn({ get: (r) => r.get(), set: (r, d, o) => ops.push([r, d, o]) });
      for (const [r, d, o] of ops) await r.set(d, o);
      return out;
    },
    batch() {
      const ops = [];
      return {
        set: (r, d, o) => ops.push(['set', r.path, d, o]),
        create: (r, d) => ops.push(['create', r.path, d]),
        async commit() {
          if (ops.some((op) => op[0] === 'create' && store.has(op[1]))) throw Object.assign(new Error('6 ALREADY_EXISTS'), { code: 6 });
          ops.forEach((op) => store.set(op[1], apply(store.get(op[1]), op[2], op[0] === 'set' && op[3] && op[3].merge)));
        },
      };
    },
  };
}

(async () => {
  const econ = require(path.join(root, 'server-lib/dangal-economy.js'));
  const A = 'a'.repeat(28);
  const B = 'b'.repeat(28);
  const C = 'c'.repeat(28);
  const bal = (db, uid) => (db.store.get('users/' + uid + '/wallet/chips') || {}).balance;
  // One-time achievement chips would blur the stake maths — mark them earned up front.
  const seasoned = async (db, ids) => {
    for (const id of ids) {
      for (const k of ['first_game', 'first_win', 'won_stake', 'chess_first_win']) await db.collection('users').doc(id).collection('achievements').doc(k).set({ key: k });
      await db.collection('users').doc(id).collection('wallet').doc('chips').set({ balance: 1000, lifetimeEarned: 1000 });
    }
  };

  // ---------- (b) economy ----------
  {
    const db = memDb();
    await seasoned(db, [A, B]);
    const win = await econ.resolveGame(db, db.admin, A, { gameType: 'rummy', result: 'win', won: true, opponentUid: B, stake: 500, matchId: 'rummy_x1' });
    assert(win.pending && win.chipDelta === 0 && bal(db, B) === 1000, 'client win claim alone moves nobody’s chips (was: take chips from any uid)');
    const noId = await econ.resolveGame(db, db.admin, A, { gameType: 'rummy', result: 'win', won: true, opponentUid: B, stake: 500 });
    assert(!noId.shared && bal(db, B) === 1000 && noId.chipDelta === 25, 'claim without a match id is solo-only');
    const loss = await econ.resolveGame(db, db.admin, B, { gameType: 'rummy', result: 'loss', won: false, opponentUid: A, stake: 100, matchId: 'rummy_x1' });
    assert(!loss.pending && loss.chipDelta === -100 && bal(db, B) === 900, 'the loser’s own report settles the match');
    const dup = await econ.resolveGame(db, db.admin, A, { gameType: 'rummy', result: 'win', won: true, opponentUid: B, stake: 500, matchId: 'rummy_x1' });
    assert(dup.duplicate && dup.won === true && dup.chips === bal(db, A) && dup.chipDelta === 125, 'duplicate answers from the caller’s side with only their own balance');
    const draw1 = await econ.resolveGame(db, db.admin, A, { gameType: 'rummy', result: 'draw', isDraw: true, opponentUid: B, matchId: 'rummy_d1' });
    const draw2 = await econ.resolveGame(db, db.admin, B, { gameType: 'rummy', result: 'draw', isDraw: true, opponentUid: A, matchId: 'rummy_d1' });
    assert(draw1.pending && !draw2.pending && draw2.isDraw, 'a draw settles when both sides report it');
    const disputed = await econ.resolveGame(db, db.admin, B, { gameType: 'rummy', result: 'win', won: true, opponentUid: A, matchId: 'rummy_w2' });
    const disputed2 = await econ.resolveGame(db, db.admin, A, { gameType: 'rummy', result: 'win', won: true, opponentUid: B, matchId: 'rummy_w2' });
    assert(disputed.pending && disputed2.pending && disputed2.disputed, 'two win claims = disputed, nothing settles');

    // Client ids are namespaced: a client can't pre-burn a server match id.
    await econ.resolveGame(db, db.admin, A, { gameType: 'wordguess', result: 'complete', matchId: 'chess_mm_real' });
    const real = await econ.resolveGame(db, db.admin, A, { gameType: 'chess', result: 'win', won: true, opponentUid: B, matchId: 'chess_mm_real', stake: 0 }, { trusted: true });
    assert(!real.duplicate && real.shared, 'client report can’t block a server settlement (namespaced ids)');

    // Loser can only pay what they hold; the daily cap never makes a stake one-sided.
    const db2 = memDb();
    await seasoned(db2, [A, B]);
    await db2.collection('users').doc(B).collection('wallet').doc('chips').set({ balance: 10, lifetimeEarned: 10 });
    await econ.resolveGame(db2, db2.admin, A, { gameType: 'chess', result: 'win', won: true, opponentUid: B, matchId: 'chess_mm_cap', stake: 500 }, { trusted: true });
    assert(bal(db2, B) === 0 && bal(db2, A) === 1000 + 25 + 10, 'winner credited only what the loser held (no chips minted)');
    const day = new Date().toISOString().slice(0, 10);
    await db2.collection('users').doc(A).collection('dailyCredits').doc(day).set({ resolves: 99 });
    await db2.collection('users').doc(B).collection('wallet').doc('chips').set({ balance: 200 }, { merge: true });
    const aBefore = bal(db2, A);
    await econ.resolveGame(db2, db2.admin, A, { gameType: 'chess', result: 'loss', won: false, opponentUid: B, matchId: 'chess_mm_cap2', stake: 50 }, { trusted: true });
    assert(bal(db2, A) === aBefore - 50, 'past the daily cap the loser still pays the stake (winner isn’t paid from nowhere)');

    // Placement: void when everyone forfeited; stayer wins; a forfeiter never profits.
    const db3 = memDb();
    await seasoned(db3, [A, B, C]);
    const v = await econ.resolvePlacement(db3, db3.admin, { gameType: 'ludo', matchId: 'ludo_v', ranking: [A, B], stake: 100, forfeits: [A, B] });
    assert(v.draw && v.players[A].chipDelta === 0 && v.players[B].chipDelta === 0, 'everyone forfeited → void, no stake moves');
    const st = await econ.resolvePlacement(db3, db3.admin, { gameType: 'ludo', matchId: 'ludo_s', ranking: [A, B], stake: 100, forfeits: [A, B], stayer: B });
    assert(st.players[B].won && st.players[B].chipDelta > 0 && st.players[A].chipDelta === -100, 'last to leave stayed → wins; the first leaver still forfeits');
    const f3 = await econ.resolvePlacement(db3, db3.admin, { gameType: 'ludo', matchId: 'ludo_f', ranking: [A, B, C], stake: 100, forfeits: [B] });
    assert(f3.players[B].chipDelta <= 0 && f3.players[A].chipDelta > 0, 'a forfeited seat never takes a pot share');
  }

  // ---------- (c) live edge cases ----------
  {
    const Engine = require(path.join(root, 'server-lib/chess-engine.js'));
    const rng0 = () => 0.1;
    let t = 1000000;
    let m = Engine.reduceMatch(null, A, 'join', { matchId: 'ch_mm_9', opponentUid: B, name: 'Ann', tc: { minutes: 3, increment: 2 }, color: 'w', deviceId: 'devA' }, t, { rng: rng0 }).match;
    m = Engine.reduceMatch(m, B, 'join', { matchId: 'ch_mm_9', name: 'Ben', deviceId: 'devB' }, t + 10, { rng: rng0 }).match;
    m = Engine.reduceMatch(m, A, 'move', { matchId: 'ch_mm_9', move: 'e4', deviceId: 'devA' }, t + 1000, { rng: rng0 }).match;
    m = Engine.reduceMatch(m, B, 'move', { matchId: 'ch_mm_9', move: 'e5', deviceId: 'devB' }, t + 2000, { rng: rng0 }).match;
    const back = Engine.reduceMatch(JSON.parse(JSON.stringify(m)), A, 'join', { matchId: 'ch_mm_9', deviceId: 'devA' }, t + 5 * 60000, { rng: rng0 }).match;
    assert(back.pub.status === 'void' && back.pub.reason === 'both_left', 'chess: both gone → void on rejoin (no time-out / abandonment win)');
    assert(/both_left:/.test(read('public/src/js/games/chess-ui.js')), 'chess: void reason has player copy');

    const Party = require(path.join(root, 'server-lib/party-deal.js'));
    const now = 5000000;
    let room = Party.newRoom({ game: 'ludo', uid: A, name: 'Ann', settings: { stake: 10 }, now });
    room = Party.reduceRoom(room, B, 'join', { name: 'Ben' }, now).room;
    room = Party.reduceRoom(room, A, 'start', {}, now, Math.random).room;
    room = Party.reduceRoom(room, A, 'leave', {}, now + 1000).room;
    room = Party.reduceRoom(room, B, 'leave', {}, now + 2000).room;
    const req = room.server && room.server.settleReq;
    assert(room.pub.status === 'closed' && req && req.stayer === B && req.forfeits.indexOf(A) >= 0, 'rooms: last leaver still settles; first leaver keeps the forfeit');

    let uno = Party.newRoom({ game: 'uno', uid: A, name: 'Ann', settings: {}, now });
    uno = Party.reduceRoom(uno, B, 'join', { name: 'Ben' }, now).room;
    uno = Party.reduceRoom(uno, C, 'join', { name: 'Cy' }, now).room;
    uno = Party.reduceRoom(uno, A, 'start', {}, now, Math.random).room;
    uno = Party.reduceRoom(uno, C, 'leave', {}, now + 500).room;
    assert(!uno.secrets[C] && uno.secrets[A] && uno.secrets[B], 'Oh No!: a seat taken over by a bot no longer writes its hand to the old owner');

    const Rooms = require(path.join(root, 'server-lib/classics-rooms.js'));
    const seats = [{ id: A, forfeit: true, forfeitAt: 1, forfeitWhy: 'left' }, { id: B, forfeit: true, forfeitAt: 2, forfeitWhy: 'afk' }];
    assert(Rooms.abandonStayer(seats, () => true) === null, 'both AFK (nobody stayed) → no stayer → void');
    seats[1].forfeitWhy = 'left';
    assert(Rooms.abandonStayer(seats, () => true) === B, 'sequential leave → the later leaver is the stayer');

    const pd = read('server-lib/party-deal.js');
    assert(/Rematch:[\s\S]{0,400}isOnline\(room, id, now\)\) pub\.players\[id\]\.pending = true/.test(pd), 'rematch: players who walked away aren’t dealt in');
    assert(/!settledBefore/.test(pd) && /settledBefore = !!\(out && out\.duplicate\)/.test(pd), 'post-settle quiz stats never run twice');
    assert(/game\.onResume\(room, Math\.max\(0, now - Number\(pub\.paused\.at\)\)\)/.test(pd), 'resume shifts game phase clocks');
    const pk = read('public/src/js/games/party-kit.js');
    assert(/\.info\/connected/.test(pk) && /armDisconnect\(\);\s*beat\(\);/.test(pk), 'party presence re-arms onDisconnect after reconnect');
    assert(/reconnectStatus\(pr, ctx\.now, pol\)\.expired/.test(read('server-lib/quiz-engine.js')), 'Quiz Duel: stale heartbeat counts as offline');
  }

  // ---------- (d) rules ----------
  {
    const Ludo = require(path.join(root, 'public/src/js/games/ludo-core.js'));
    const st = Ludo.newGame([{ id: 'r' }, { id: 'g' }, { id: 'y' }, { id: 'b' }].map((p, i) => ({ id: p.id, name: 'P' + i })), Ludo.mergeSettings({ teams: true }));
    st.seats[0].done = true;
    st.seats[1].done = true;
    st.seats[3].done = true;
    st.placements = [0, 1, 3];
    Ludo.takeOver(st, 2, 'afk');
    assert(st.over && st.winnerTeam === 1 && st.seats[st.ranking[0]].team === 1, 'Ludo 2v2: the team that finished wins (not the first finisher’s team)');

    const rooms = read('server-lib/classics-rooms.js');
    assert(/autoStep: \(st\) =>\s*wholeTurn\(/.test(rooms) && /wholeTurn\(st, \(\) => SnakesCore\.roll/.test(rooms), 'AFK auto-play covers a whole turn (one miss per turn)');
    assert(/autoClaim: false,/.test(read('public/src/js/games/chess-ui.js')) && !/a\.autoClaim !== false/.test(read('server-lib/chess-engine.js')), 'chess: threefold / 50-move are claims unless auto-claim is opted in');
    assert(/Object\.assign\(statsWrite, rating\);\s*\} else if \(rating\)/.test(read('server-lib/dangal-economy.js')), 'chess: game doc mirrors the latest speed rating (display + matchmaking)');
    assert(/!s\.bucket\)/.test(read('public/src/js/dangal/dangal-profile-stats.js')), 'profile totals skip per-speed rating docs');
    assert(/fromStats\(snap\.exists \? snap\.data\(\) : \{\}\)\.r;/.test(read('server-lib/quiz-service.js')), 'quiz duel difficulty reads the real rating');
  }

  // ---------- (e) words + quiz ----------
  {
    const S = require(path.join(root, 'public/src/js/games/scribble-core.js'));
    const st = S.newGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], S.mergeSettings({}));
    S.beginTurn(st, 'a', ['elephant', 'apple', 'volcano'], 1000);
    const pickLeak = S.guess(st, 'a', 'apple or volcano?', 1100, ['b', 'c']);
    assert(pickLeak.error === 'word_blocked', 'Scribble: drawer can’t type the choices during pick');
    S.pick(st, 'a', 0, 1200, () => 0.3);
    const near = S.guess(st, 'b', 'elephnt', 1300, ['b', 'c']);
    const plural = S.guess(st, 'c', 'elephants', 1400, ['b', 'c']);
    const chat = JSON.stringify(st.chat || []);
    assert(near.close && near.hidden && plural.hidden && !/elephnt|elephants/.test(chat), 'Scribble: near-miss stays private (was shown to everyone)');

    const Party = require(path.join(root, 'server-lib/party-deal.js'));
    const sRoom = { server: { pub: { phaseAt: 1000, over: false } } };
    Party.GAMES.scribble.onResume(sRoom, 5000);
    const qRoom = { server: { pub: { startAt: 100, endsAt: 200, over: false } } };
    Party.GAMES.quizroom.onResume(qRoom, 50);
    assert(sRoom.server.pub.phaseAt === 6000 && qRoom.server.pub.startAt === 150 && qRoom.server.pub.endsAt === 250, 'pause/resume keeps Scribble + Quiz clocks');
    const se = read('server-lib/scribble-engine.js');
    assert(/const forfeits = Object\.keys\(room\.pub\.players\)\.filter\(out\)/.test(se) && /staying\.length < 2/.test(se), 'Scribble: leavers forfeit and a one-player game ends');

    const qs = read('server-lib/quiz-service.js');
    assert(/dailySeed\(day, ids\)/.test(qs) && !/optionOrder\('daily:' \+ day, q\.id/.test(qs) && /optionOrder\(crypto\.randomBytes\(8\)/.test(qs), 'Quiz: Daily / Practice option order can’t be rebuilt in the browser');
    assert(/dayNo <= last\) return m;/.test(qs), 'Quiz Daily streak never moves backwards');
    assert(/MAX_ECHO_MS = 1500/.test(read('server-lib/quiz-engine.js')), 'Quiz latency echo window is short (no faked RTT allowance beyond the cap)');
    assert(/st\.answered && st\.answered\[me\(\)\]/.test(read('public/src/js/games/quiz-ui.js')), 'Quiz: rejoin mid-question keeps options locked');
    const sh = read('public/src/js/games/shabd-ui.js');
    assert(/today\(\) !== dayNo/.test(sh) && /reopen\(\{ mode: 'daily' \}\), 1500\)/.test(sh), 'Shabd: board rolls to the new Daily after local midnight');
  }

  // ---------- (f) UX + earlier dogfood fixes ----------
  {
    const cs = read('public/src/js/games/court-sports.js');
    assert(/gameId: spec\.id, title: 'How to play '/.test(cs), 'Badminton How-to opens the shared Rules sheet');
    const oh = read('public/src/js/games/ohno-ui.js');
    assert(/function eventText\(e, nameOf, me\)/.test(oh) && !/function eventText[\s\S]{0,1500}\bui\./.test(oh.slice(oh.indexOf('function eventText'), oh.indexOf('function eventText') + 1500)), 'Oh No! round log no longer throws (ui is not defined)');
    const ns = read('public/src/js/core/nav-stack.js');
    assert(/navClosing/.test(ns) && /game-overlay/.test(ns) && /document\.querySelector\('\.chess-sheet \.chess-sheet__cancel'\)/.test(ns), 'hardware Back: games own their exit (confirm, cancel, no history desync)');
    assert(/data-leave-stay data-overlay-dismiss/.test(read('public/src/js/games/game-ui.js')), 'leave confirm resolves when dismissed');
    const kit = read('public/src/js/games/party-kit.js');
    assert(/function buzz\(\) \{\s*const p = feedbackPrefs\(\);/.test(kit) && /function ding\(\) \{\s*const p = feedbackPrefs\(\);/.test(kit) && /if \(p\.sound && window\.Sound\)/.test(kit), 'party sounds / haptics respect the toggles');
    const idx = read('public/index.html');
    assert(['shabd-answers', 'shabd-allowed', 'shabd-gloss', 'shabd-lexicon'].every((n) => new RegExp('type="text/x-lazy" data-party-lazy src="[^"]*' + n).test(idx)), 'Shabd word data is lazy (off first paint)');
    assert(/wordguess: \[/.test(kit) && /PartyKit\.withGameData\('wordguess'/.test(read('public/src/js/games/shabd-ui.js')), 'Shabd entry points load their data on demand');
    const css = read('public/src/styles/dangal.css');
    assert(/\.ld-token\.is-legal::before\{[^}]*inset:-55%/.test(css), 'Ludo tokens have a finger-sized hit area');
    assert(/\.qz-opt\.is-correct \.qz-opt-key::after\{content:'✓'/.test(css) && /\.qz-opt\.is-wrong \.qz-opt-key::after\{content:'✗'/.test(css), 'Quiz reveal is readable without colour');
    assert(/@media \(min-width:700px\) and \(min-height:860px\)\{\.pk-page\.ld-game/.test(css), 'tablet: boards use the space');
  }

  const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
  assert(apiCount === 12, 'api/*.js = 12 (got ' + apiCount + ')');
  assert(/test-dangal-d1-dogfood\.js/.test(read('package.json')), 'package.json runs D1');

  if (failed) {
    console.error('\n' + failed + ' failure(s)');
    process.exit(1);
  }
  console.log('\nDangal D1 dogfood: all checks passed');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
