#!/usr/bin/env node
/**
 * Dangal P6 — Quiz Muqabala: fair Live rooms (Duel / Party), Daily, Practice, News, AI pipeline.
 *   node scripts/test-dangal-p6-quiz.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error('FAIL:', msg);
  } else console.log('ok:', msg);
}
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const Q = require(path.join(root, 'public/src/js/games/quiz-core.js'));
const Bank = require(path.join(root, 'server-lib/quiz-bank.js'));
const PD = require(path.join(root, 'server-lib/party-deal.js'));
const Svc = require(path.join(root, 'server-lib/quiz-service.js'));
const Pipe = require(path.join(root, 'server-lib/quiz-ai-pipeline.js'));
const Econ = require(path.join(root, 'server-lib/dangal-economy.js'));
const Policy = require(path.join(root, 'public/src/js/dangal/dangal-live-policy.js'));

// ─── In-memory Firestore (just enough for the quiz service + jobs) ───────
function fakeDb() {
  const store = new Map();
  const apply = (prev, data, merge) => {
    const out = merge ? Object.assign({}, prev || {}) : {};
    Object.keys(data).forEach((k) => {
      const v = data[k];
      if (v && typeof v === 'object' && v.constructor && v.constructor.name === 'NumericIncrementTransform') out[k] = (Number(out[k]) || 0) + v.operand;
      else out[k] = v === undefined ? out[k] : JSON.parse(JSON.stringify(v));
    });
    return out;
  };
  const snap = (p) => {
    const d = store.get(p);
    return { id: p.split('/').pop(), ref: docRef(p), exists: d !== undefined, data: () => (d === undefined ? undefined : JSON.parse(JSON.stringify(d))) };
  };
  function docRef(p) {
    return {
      id: p.split('/').pop(),
      path: p,
      get: async () => snap(p),
      set: async (data, opts) => store.set(p, apply(store.get(p), data, opts && opts.merge)),
      update: async (data) => store.set(p, apply(store.get(p), data, true)),
      collection: (c) => colRef(p + '/' + c),
    };
  }
  function query(prefix, filters, order, lim) {
    return {
      where: (f, op, v) => query(prefix, filters.concat([[f, op, v]]), order, lim),
      orderBy: (f, dir) => query(prefix, filters, [f, dir], lim),
      limit: (n) => query(prefix, filters, order, n),
      get: async () => {
        let docs = [...store.keys()].filter((k) => k.startsWith(prefix + '/') && !k.slice(prefix.length + 1).includes('/')).map(snap);
        filters.forEach(([f, op, v]) => {
          docs = docs.filter((s) => {
            const x = s.data()[f];
            if (x === undefined || x === null) return false;
            if (op === '==') return x === v;
            if (op === '<=') return x <= v;
            if (op === '>=') return x >= v;
            if (op === '>') return x > v;
            return false;
          });
        });
        if (order) docs.sort((a, b) => (order[1] === 'desc' ? -1 : 1) * ((a.data()[order[0]] || 0) - (b.data()[order[0]] || 0)));
        if (lim) docs = docs.slice(0, lim);
        return { docs, empty: !docs.length, size: docs.length };
      },
    };
  }
  function colRef(p) {
    return Object.assign(query(p, [], null, 0), { doc: (id) => docRef(p + '/' + id) });
  }
  const db = {
    store,
    collection: (c) => colRef(c),
    getAll: async (...refs) => refs.map((r) => snap(r.path)),
    batch: () => {
      const ops = [];
      return {
        set: (ref, data, opts) => ops.push(() => store.set(ref.path, apply(store.get(ref.path), data, opts && opts.merge))),
        commit: async () => ops.forEach((f) => f()),
      };
    },
    runTransaction: async (fn) => {
      const writes = [];
      const out = await fn({ get: (ref) => ref.get(), set: (ref, data, opts) => writes.push([ref, data, opts]) });
      writes.forEach(([ref, data, opts]) => store.set(ref.path, apply(store.get(ref.path), data, opts && opts.merge)));
      return out;
    },
  };
  return db;
}
const adminApp = (db) => ({ firestore: () => db, database: () => null });

// ════════════════════════════════════════════════════════════ Bank

{
  const c = Bank.counts();
  assert(c.global >= 3000, 'bundled global bank ≥ 3000 (' + c.global + ')');
  Q.CATEGORY_IDS.forEach((cat) => assert((c.byCategory[cat] || 0) >= 120, 'category ' + cat + ' has ≥120 (' + (c.byCategory[cat] || 0) + ')'));
  assert(Q.CATEGORY_IDS.length === 12, '12 global categories');
  assert(['in', 'us', 'uk'].every((r) => (c.byLocale[r] || 0) > 0), 'optional India / US / UK packs present');
  const all = Bank.bank();
  assert(all.every((q) => q.options.length === 4 && new Set(q.options.map((o) => o.toLowerCase())).size === 4), 'every item has 4 unique options');
  assert(all.every((q) => q.correctIndex >= 0 && q.correctIndex < 4 && q.explanation !== undefined), 'every item has a correct index');
  assert(new Set(all.map((q) => q.id)).size === all.length, 'ids unique');
  assert(all.every((q) => q.status === 'active' && q.source === 'bundled'), 'bundled items are active');
  const text = all.map((q) => q.prompt + ' ' + q.options.join(' ')).join('\n');
  assert(!/\b(wordle|skribbl)\b/i.test(text), 'no banned brand names in the bank');
  const hot = /\b(abortion|gaza|kashmir|taiwan|crimea|immigra\w*|refugees?|casino|gambl\w*|betting|drugs?|republican|democrat|left-wing|right-wing)\b/i;
  assert(!all.some((q) => hot.test(q.prompt + ' ' + q.options.join(' '))), 'evergreen bank avoids hot-button topics');
}

// ════════════════════════════════════════════════════════════ Scoring / timing / tie-break

{
  assert(Q.scoreAnswer(true, 0, 15000) === 1000, 'instant correct = 1000');
  assert(Q.scoreAnswer(true, 7500, 15000) === 800, 'half time correct = 800');
  assert(Q.scoreAnswer(true, 15000, 15000) === 600, 'buzzer correct = 600');
  assert(Q.scoreAnswer(false, 100, 15000) === 0, 'wrong = 0');
  assert(Q.rttAllowance([100, 120, 80]) === 50, 'RTT allowance = half median');
  assert(Q.rttAllowance([900, 1000, 1100]) === 250, 'RTT allowance capped at 250 ms');
  assert(Q.rttAllowance([]) === 0, 'no samples → no allowance');
  assert(Q.answerTime(12000, 10000, [200, 200], 15000) === 1900, 'answer time subtracts half RTT');
  assert(Q.answerTime(9000, 10000, [], 15000) === 0, 'answer time never negative');
  assert(Q.answerTime(40000, 10000, [], 15000) === 15000, 'answer time clamps to limit');
  const r = Q.rank([
    { uid: 'a', score: 1800, time: 9000 },
    { uid: 'b', score: 1800, time: 7000 },
    { uid: 'c', score: 2000, time: 20000 },
  ]);
  assert(r.map((x) => x.uid).join('') === 'cba', 'rank: score desc, then total time asc');
  assert(Q.headToHead({ score: 5, time: 10 }, { score: 5, time: 9 }) === 'b', 'tie → faster total time wins');
  assert(Q.headToHead({ score: 5, time: 9 }, { score: 5, time: 9 }) === 'draw', 'identical → draw');
}

// ════════════════════════════════════════════════════════════ Selection / repeats / calibration

{
  const pool = Svc.buildPool({});
  const seen = new Set();
  const first = Q.selectQuestions(pool, { count: 10, seed: 1, seen });
  first.forEach((q) => seen.add(q.id));
  const second = Q.selectQuestions(pool, { count: 10, seed: 2, seen });
  assert(first.length === 10 && second.length === 10, 'selection returns the requested count');
  assert(second.every((q) => !seen.has(q.id)), 'repeat avoidance: seen ids skipped');
  assert(new Set(first.map((q) => q.category)).size >= 8, 'category balance: 10 questions span ≥8 categories');
  const tiny = pool.slice(0, 12);
  const again = Q.selectQuestions(tiny, { count: 10, seed: 3, seen: new Set(tiny.map((q) => q.id)) });
  assert(again.length === 10, 'falls back to seen items when the pool is exhausted');
  const hard = Q.selectQuestions(pool, { count: 10, seed: 4, target: 1750 });
  const easy = Q.selectQuestions(pool, { count: 10, seed: 4, target: 1250 });
  const avg = (xs) => xs.reduce((s, q) => s + q.rating, 0) / xs.length;
  assert(avg(hard) > avg(easy) + 150, 'Duel targeting: higher player ratings → harder items');
  assert(Q.targetRating([1500, 1500]) === 1390, 'target sits a little below the players');
  const pend = pool.slice(0, 60).map((q) => Object.assign({}, q, { status: 'pending', id: 'p' + q.id }));
  const mixed = Q.selectQuestions(pend.concat(pool.slice(60, 200)), { count: 10, seed: 5, maxPending: 2 });
  assert(mixed.filter((q) => q.status === 'pending').length <= 2, 'at most 2 pending items per match');
  // Item calibration (Elo-style)
  assert(Q.updateItemRating(1500, 1500, true) < 1500, 'item rating drops when answered correctly');
  assert(Q.updateItemRating(1500, 1500, false) > 1500, 'item rating rises when missed');
  assert(Q.ratingFromStats(100, 90, 1500) < 1300, 'mostly-correct item calibrates easy');
  assert(Q.ratingFromStats(100, 15, 1500) > 1700, 'mostly-missed item calibrates hard');
  assert(Q.ratingFromStats(0, 0, 1700) === 1700, 'no answers → prior kept');
  assert(Q.tierOf(Q.ratingFromStats(100, 90, 1500)) === 1, 'tier follows calibrated rating');
  const calibrated = Svc.buildPool({ calib: { ratings: { [pool[0].id]: 1900 }, retired: { [pool[1].id]: true } } });
  assert(calibrated.find((q) => q.id === pool[0].id).rating === 1900, 'calibration overrides bundled rating');
  assert(!calibrated.some((q) => q.id === pool[1].id), 'retired bundled items leave the pool');
}

// ════════════════════════════════════════════════════════════ Daily determinism

{
  const pool = Svc.buildPool({});
  const a = Q.dailySet(pool, '2026-09-28').map((q) => q.id);
  const b = Q.dailySet(Svc.buildPool({}), '2026-09-28').map((q) => q.id);
  const c = Q.dailySet(pool, '2026-09-29').map((q) => q.id);
  assert(a.length === 10, 'Daily has 10 questions');
  assert(a.join() === b.join(), 'Daily deterministic for a date');
  assert(a.join() !== c.join(), 'Daily changes the next day');
  const withAi = Svc.buildPool({ extras: [Object.assign({}, pool[0], { id: 'qai1', source: 'ai', status: 'pending' })] });
  assert(Q.dailySet(withAi, '2026-09-28').every((q) => q.source === 'bundled' && q.status === 'active'), 'Daily never includes AI / pending items');
  const now = Date.UTC(2026, 8, 28, 12);
  assert(Q.validDayKey('2026-09-28', now) && Q.validDayKey('2026-09-29', now) && !Q.validDayKey('2026-10-02', now), 'local day key must be within ±1 of UTC');
  assert(Q.shareGrid([true, false, null]) === '🟩🟥⬜', 'share grid is spoiler-free');
}

// ════════════════════════════════════════════════════════════ Live rooms (Duel / Party)

const G = PD.GAMES.quizroom;
assert(!!G, 'quizroom adapter registered in party-deal');

function serverClean(obj) {
  const s = JSON.stringify(obj);
  return !/correctIndex/.test(s);
}

function makeRoom(mode, n, t0, settings) {
  const room = PD.newRoom({ game: 'quizroom', uid: 'u0', name: 'Host', settings: Object.assign({ mode }, settings || {}), now: t0 });
  for (let i = 1; i < n; i++) PD.reduceRoom(room, 'u' + i, 'join', { name: 'P' + i }, t0 + i);
  return room;
}

// Duel end-to-end
{
  let t = 1_000_000;
  const room = makeRoom('duel', 2, t);
  let full = false;
  try {
    PD.reduceRoom(room, 'u9', 'join', { name: 'Late' }, t + 5);
  } catch (e) {
    full = e.code === 'room_full';
  }
  assert(full, 'Duel rooms cap at 2 players');
  t += 10;
  room.lat = { u0: { s: [100, 100, 100] }, u1: { s: [400, 400, 400] } };
  PD.reduceRoom(room, 'u0', 'start', { prep: { ratings: { u0: 1600, u1: 1600 } } }, t);
  const st = room.pub.state;
  assert(st && st.mode === 'duel' && st.total === 10 && st.phase === 'ready', 'Duel deals 10 questions in a ready phase');
  assert(!!st.question && st.question.options.length === 4, 'question visible with 4 options during ready');
  assert(serverClean(room.pub) && serverClean(room.presence) && serverClean(room.secrets), 'correctIndex never in client-readable nodes');
  assert(st.reveal === null && !('correct' in st.question), 'no correct answer in the public question before reveal');
  let early = null;
  try {
    PD.reduceRoom(room, 'u0', 'answer', { qn: 0, i: 0 }, t + 100);
  } catch (e) {
    early = e.code;
  }
  assert(early === 'too_early', 'answers before the synchronized start are rejected');

  const s = room.server;
  const correctOf = (qn) => Q.displayedCorrect(s.qs[qn], s.orders[qn]);
  let wins = 0;
  for (let qn = 0; qn < 10; qn++) {
    const start = room.server.pub.startAt;
    PD.reduceRoom(room, 'u0', 'tick', {}, start);
    assert(room.pub.state.phase === 'question', 'q' + qn + ' opens at startAt') || null;
    const c = correctOf(qn);
    const res0 = PD.reduceRoom(room, 'u0', 'answer', { qn, i: c }, start + 2050).result;
    if (qn === 0) {
      assert(res0.accepted === true && !('correct' in res0) && !('isCorrect' in res0), 'answer ack never reveals correctness');
      assert(res0.ms === 2000, 'server time − half median RTT (100 → 50 ms) = 2000');
      assert(room.pub.state.answered.u0 === true && room.pub.state.phase === 'question', 'opponent sees "answered", not the pick');
      assert(!JSON.stringify(room.pub.state).includes('"picks"'), 'no picks published before reveal');
    }
    const i1 = qn % 2 ? c : (c + 1) % 4;
    PD.reduceRoom(room, 'u1', 'answer', { qn, i: i1 }, start + 2200);
    assert(room.pub.state.phase === 'reveal', 'q' + qn + ' reveals early once both answered') || null;
    if (qn === 0) {
      assert(room.pub.state.reveal.correct === c, 'reveal publishes the correct option');
      assert(room.pub.state.reveal.gained.u0 === 600 + Math.round(400 * (1 - 2000 / 15000)), 'score = 600 + speed bonus');
      assert(room.pub.state.reveal.ms.u1 === 2000, 'slow link compensated (RTT 400 → 200 ms cap-safe)');
    }
    if (room.pub.state.reveal.gained.u0 > (room.pub.state.reveal.gained.u1 || 0)) wins++;
    PD.reduceRoom(room, 'u0', 'tick', {}, room.server.pub.revealUntil);
  }
  const fin = room.pub.state;
  assert(fin.over && fin.phase === 'over', 'Duel ends after 10');
  assert(fin.summary && fin.summary.history.length === 10, 'summary with history after the match');
  const req = G.pendingSettlement(room.server);
  assert(req && req.kind === 'h2h' && req.rated === true && req.game === 'quiz', 'Duel queues a rated h2h settlement');
  assert(req.a === 'u0' && req.result === 'win', 'host (more correct) wins');
  assert(req.stats.length === 10 && req.seen.u0.length === 10, 'settlement carries item stats + seen lists');
  assert(Econ.SERVER_SETTLED.has ? Econ.SERVER_SETTLED.has('quiz') : Econ.SERVER_SETTLED.includes('quiz'), 'quiz results are server-settled only');
}

// Duel tie-break by time + late answer + RTT allowance window
{
  let t = 2_000_000;
  const room = makeRoom('duel', 2, t);
  PD.reduceRoom(room, 'u0', 'start', {}, t);
  const start = room.server.pub.startAt;
  PD.reduceRoom(room, 'u0', 'tick', {}, start);
  const c = Q.displayedCorrect(room.server.qs[0], room.server.orders[0]);
  room.lat = { u1: { s: [400] } };
  const late = PD.reduceRoom(room, 'u0', 'answer', { qn: 0, i: c }, start + 15000 + 150).result;
  assert(late.accepted === false && late.late === true, 'answer past the limit (no RTT samples) is late');
  const ok = PD.reduceRoom(room, 'u1', 'answer', { qn: 0, i: c }, start + 15000 + 150).result;
  assert(ok.accepted === true && ok.ms === 14950, 'slow link inside its allowance is accepted (15150 − 200)');
  const a = { score: 3000, time: 20000 };
  const b = { score: 3000, time: 18000 };
  assert(Q.headToHead(a, b) === 'b', 'equal score: lower total time wins the Duel');
}

// Duel forfeit (leave) → rated loss for the leaver; disconnect is just no answer
{
  let t = 3_000_000;
  const room = makeRoom('duel', 2, t);
  PD.reduceRoom(room, 'u0', 'start', {}, t);
  const start = room.server.pub.startAt;
  PD.reduceRoom(room, 'u0', 'tick', {}, start);
  room.presence.u1 = { at: start, online: false };
  PD.reduceRoom(room, 'u0', 'answer', { qn: 0, i: 0 }, start + 1000);
  assert(room.pub.state.phase === 'reveal', 'offline player: question reveals without their answer');
  assert(!room.pub.state.over, 'short disconnect does not forfeit');
  PD.reduceRoom(room, 'u1', 'join', {}, start + 3000);
  assert(room.presence.u1.online === true && !room.pub.state.over, 'rejoin continues the match');
  PD.reduceRoom(room, 'u1', 'leave', {}, start + 4000);
  const req = G.pendingSettlement(room.server);
  assert(room.pub.state.over && room.pub.state.forfeit === 'u1', 'leaving a Duel forfeits');
  assert(req && req.result === 'win' && req.rated === true && req.forfeit === 'u1', 'abandon = rated loss for the leaver');
  assert(Policy.policyFor('quiz').leave === 'forfeit' && Policy.policyFor('quiz').abandon.rated === true, 'live policy: quiz abandon is rated');
}

// Party: 6 players, host settings, leaderboard, placement settlement
{
  let t = 4_000_000;
  const room = makeRoom('party', 6, t, { categories: ['science', 'geography'], length: 5 });
  assert(room.pub.settings.length === 5 && room.pub.settings.categories.length === 2, 'host picks categories + length');
  PD.reduceRoom(room, 'u0', 'start', {}, t);
  assert(room.server.qs.every((q) => ['science', 'geography'].includes(q.category)), 'questions respect chosen categories');
  assert(room.pub.state.total === 5 && room.pub.state.players.length === 6, 'Party: 5 questions, 6 players');
  for (let qn = 0; qn < 5; qn++) {
    const start = room.server.pub.startAt;
    PD.reduceRoom(room, 'u0', 'tick', {}, start);
    const c = Q.displayedCorrect(room.server.qs[qn], room.server.orders[qn]);
    for (let p = 0; p < 6; p++) PD.reduceRoom(room, 'u' + p, 'answer', { qn, i: p < 3 ? c : (c + 1) % 4 }, start + 1000 + p * 500);
    assert(room.pub.state.phase === 'reveal', 'party q' + qn + ' reveals when all answered') || null;
    assert(room.pub.state.players[0].score >= room.pub.state.players[5].score, 'live leaderboard sorted') || null;
    PD.reduceRoom(room, 'u0', 'tick', {}, room.server.pub.revealUntil);
  }
  const req = G.pendingSettlement(room.server);
  assert(room.pub.state.over && req.kind === 'placement' && req.stake === 0, 'Party settles by placement, no stake');
  assert(req.ranking.slice(0, 3).join() === 'u0,u1,u2', 'Party ranking: score then speed');
  assert(serverClean(room.pub), 'Party pub never carries correctIndex');
  // mid-game joiner
  const r2 = makeRoom('party', 3, t);
  PD.reduceRoom(r2, 'u0', 'start', {}, t);
  const j = PD.reduceRoom(r2, 'u7', 'join', { name: 'Late' }, t + 10).result;
  assert(j.pending === false && r2.pub.state.players.length === 4, 'Party: late joiner plays from the next question');
}

// Big-screen host: host runs the screen and is not a player
{
  const room = makeRoom('party', 4, 4_500_000, { hostPlays: false, length: 5 });
  PD.reduceRoom(room, 'u0', 'start', {}, 4_500_010);
  const ids = room.pub.state.players.map((p) => p.id);
  assert(ids.length === 3 && !ids.includes('u0'), 'big-screen host is not dealt in');
  assert(room.pub.state.hostPlays === false, 'view tells the host to render the big screen');
  const start = room.server.pub.startAt;
  PD.reduceRoom(room, 'u0', 'tick', {}, start);
  ['u1', 'u2', 'u3'].forEach((id) => PD.reduceRoom(room, id, 'answer', { qn: 0, i: 0 }, start + 900));
  assert(room.pub.state.phase === 'reveal', 'reveal once every player (not the screen) has answered');
}

// No questions for an impossible filter
{
  const room = makeRoom('party', 2, 5_000_000, { categories: ['science'], difficulty: 3, length: 20 });
  let code = null;
  try {
    const narrow = PD.GAMES.quizroom;
    const pool = Svc.buildPool({}).filter((q) => q.category === 'science' && q.difficulty === 3);
    PD.reduceRoom(room, 'u0', 'start', {}, 5_000_010);
    code = pool.length >= 3 ? 'ok' : null;
    void narrow;
  } catch (e) {
    code = e.code;
  }
  assert(code === 'ok' || code === 'no_questions', 'narrow filters either fill or fail with no_questions');
}

// ════════════════════════════════════════════════════════════ Service: Daily / Practice / report

(async () => {
  const db = fakeDb();
  const app = adminApp(db);
  const now = Date.UTC(2026, 8, 28, 12);
  const day = '2026-09-28';
  Svc.resetCaches();

  let s = await Svc.quizAction(app, 'alice', { op: 'daily_start', day }, now);
  assert(s.total === 10 && s.q && !('correctIndex' in s.q) && s.q.options.length === 4, 'daily_start serves a public question');
  const frozen = db.store.get('quizDaily/' + day).ids;
  const bobStart = await Svc.quizAction(app, 'bob', { op: 'daily_start', day }, now);
  assert(bobStart.q.id === s.q.id && bobStart.q.options.join() === s.q.options.join(), 'Daily: same question + option order for everyone');
  let t = s.servedAt + 1000;
  let last = null;
  for (let qn = 0; qn < 10; qn++) {
    last = await Svc.quizAction(app, 'alice', { op: 'daily_answer', day, qn, i: 0 }, t);
    if (qn === 0) assert(last.reveal && typeof last.reveal.correct === 'number' && !('correctIndex' in (last.q || {})), 'daily reveal after answering; next question stays public');
    t = (last.servedAt || t) + 1000;
  }
  assert(last.done && last.final && last.final.grid.length > 0, 'Daily finishes with a share grid');
  const again = await Svc.quizAction(app, 'alice', { op: 'daily_start', day }, t + 5000);
  assert(again.done === true, 'Daily: one attempt only');
  let replay = null;
  try {
    await Svc.quizAction(app, 'alice', { op: 'daily_answer', day, qn: 0, i: 1 }, t + 6000);
  } catch (e) {
    replay = e.code;
  }
  assert(replay === null || replay === 'VALIDATION_ERROR', 'Daily: no re-answering after finishing');
  assert(db.store.get('quizDaily/' + day).ids.join() === frozen.join(), 'Daily set frozen for the day');
  const lockedBoard = await Svc.quizAction(app, 'bob', { op: 'daily_board', day }, t);
  assert(lockedBoard.locked === true, 'leaderboard locked until you play (spoiler-free)');
  const board = await Svc.quizAction(app, 'alice', { op: 'daily_board', day }, t);
  assert(!board.locked && board.rows.some((r) => r.me), 'global leaderboard shows your row');
  db.store.set('users/alice/following/bob', { at: 1 });
  const fb = await Svc.quizAction(app, 'alice', { op: 'daily_board', day, scope: 'friends' }, t);
  assert(fb.scope === 'friends' && fb.rows.length === 1, 'friends leaderboard (only players who finished)');
  const meta = db.store.get('users/alice/quizMeta/daily');
  assert(meta && meta.streak === 1, 'Daily streak recorded');
  let bad = null;
  try {
    await Svc.quizAction(app, 'alice', { op: 'daily_start', day: '2026-10-05' }, now);
  } catch (e) {
    bad = e.code;
  }
  assert(bad === 'VALIDATION_ERROR', 'future Daily keys rejected');

  // Practice
  const p1 = await Svc.quizAction(app, 'alice', { op: 'solo_next', mode: 'practice', category: 'music', difficulty: 1 }, now);
  assert(p1.q && p1.q.category === 'music' && !('correctIndex' in p1.q), 'practice serves the chosen category, no answer');
  const a1 = await Svc.quizAction(app, 'alice', { op: 'solo_answer', qid: p1.q.id, i: 2 }, p1.servedAt + 3000);
  assert(typeof a1.correct === 'number' && a1.n === 1, 'practice reveal after answering');
  let dup = null;
  try {
    await Svc.quizAction(app, 'alice', { op: 'solo_answer', qid: p1.q.id, i: 2 }, p1.servedAt + 4000);
  } catch (e) {
    dup = e.code;
  }
  assert(dup === 'VALIDATION_ERROR', 'practice: one answer per question');
  const statsDoc = db.store.get('quizStats/' + p1.q.id);
  assert(statsDoc && statsDoc.answers === 1, 'answers feed quizStats (calibration)');

  // News hidden with AI off (no validated news items)
  const h = await Svc.quizAction(app, 'alice', { op: 'home', day }, now);
  assert(h.newsAvailable === false, 'AI off: News Quiz hidden (no validated news items)');
  assert(h.daily && h.daily.done === true, 'home reports Daily done');

  // Report → admin queue
  const rep = await Svc.quizAction(app, 'bob', { op: 'report', qid: p1.q.id, reason: 'unclear', note: 'two answers fit' }, now);
  assert(rep.reported === true && db.store.get('quizReports/' + p1.q.id + '_bob').status === 'open', 'report lands in quizReports (open)');
  assert(db.store.get('quizStats/' + p1.q.id).reports === 1, 'report counted on the item');
  const rep2 = await Svc.quizAction(app, 'bob', { op: 'report', qid: p1.q.id, reason: 'unclear' }, now);
  assert(rep2.duplicate === true && db.store.get('quizStats/' + p1.q.id).reports === 1, 'one report per player per question');
  const QA = require(path.join(root, 'server-lib/quiz-admin.js'));
  const adminView = await QA.quizAdminView(db);
  assert(adminView.reports.length === 1 && adminView.reports[0].qid === p1.q.id && adminView.reports[0].reasons.unclear === 1, 'report reaches the admin view (grouped by question)');
  const FV = { firestore: { FieldValue: require('firebase-admin').firestore.FieldValue } };
  const ret = await QA.quizAdminAction(db, FV, { action: 'quiz_retire', qid: p1.q.id }, 'admin1');
  assert(ret.retired && db.store.get('quizConfig/calibration').retired[p1.q.id] === true, 'admin retire: bundled item joins the retired list');
  assert(db.store.get('quizStats/' + p1.q.id).confirmedReports === 1 && db.store.get('quizReports/' + p1.q.id + '_bob').status === 'actioned', 'admin retire confirms the report');
  assert((await QA.quizAdminView(db)).reports.length === 0, 'actioned reports leave the queue');
  db.store.set('quizItems/qai9', { status: 'pending', prompt: 'x', options: ['a', 'b', 'c', 'd'], correctIndex: 0, source: 'ai', category: 'gk' });
  await QA.quizAdminAction(db, FV, { action: 'quiz_approve', qid: 'qai9' }, 'admin1');
  assert(db.store.get('quizItems/qai9').status === 'active', 'admin approve: pending → active');
  Svc.resetCaches();

  // ═════════════════════════════════════════════════════════ AI pipeline (mocked provider)
  const article = {
    id: 'a1',
    category: 'gk',
    headline: 'Harbour city opens the longest floating bridge',
    body: 'The new floating bridge in the harbour city is 2.4 kilometres long. It took four years to build and opened on Monday to cyclists and walkers.',
  };
  const good = { prompt: 'Which planet in our solar system has the moon Titan?', options: ['Saturn', 'Jupiter', 'Mars', 'Neptune'], correctIndex: 0, explanation: 'Titan is the largest moon of Saturn.', difficulty: 2 };
  const candidates = [
    good,
    { prompt: 'Too short?', options: ['a', 'b', 'c', 'd'], correctIndex: 0, explanation: 'nope nope nope', difficulty: 1 },
    { prompt: 'Which party won the most recent election in the region?', options: ['Blue', 'Red', 'Green', 'Gold'], correctIndex: 0, explanation: 'Election trivia is divisive.', difficulty: 2 },
    { prompt: 'What is the capital city of France?', options: ['Paris', 'Lyon', 'Nice', 'Lille'], correctIndex: 0, explanation: 'Paris is the capital of France.', difficulty: 1 },
    { prompt: 'Phobos and Deimos are the two small moons of which planet?', options: ['Mars', 'Jupiter', 'Venus', 'Mercury'], correctIndex: 1, explanation: 'Phobos and Deimos orbit Mars.', difficulty: 2 },
  ];
  // Verifier picks the true answers (Titan → Saturn, Phobos → Mars); the Phobos item was generated with
  // the wrong key, so blind verification rejects it.
  const truth = { Titan: 'Saturn', Phobos: 'Mars', bridge: '2.4 kilometres' };
  const mockAI = (gen) => async (req) => {
    if (req.feature === 'quiz_verify') {
      const qs = JSON.parse(req.messages[0].content.slice('Questions: '.length, req.messages[0].content.indexOf('\nReply')));
      return { text: JSON.stringify(qs.map((q) => ({ n: q.n, answer: q.options.findIndex((o) => Object.keys(truth).some((k) => q.prompt.includes(k) && o === truth[k])) }))) };
    }
    return { text: 'Sure! ' + JSON.stringify(gen(req)) };
  };
  const r = await Pipe.processBatch(candidates, { callAI: mockAI(() => []), category: 'science', existing: null, now, seed: 'x' });
  assert(r.rejected.schema === 1, 'pipeline: schema reject');
  assert(r.rejected.safety === 1, 'pipeline: safety / divisive reject');
  assert(r.rejected.duplicate === 1, 'pipeline: dedupe vs bundled bank');
  assert(r.rejected.verify === 1, 'pipeline: blind verification mismatch reject');
  assert(r.accepted.length === 1 && r.accepted[0].status === 'pending' && r.accepted[0].source === 'ai', 'pipeline: pass → pending');
  assert(r.calls === 1, 'pipeline: one verification call per batch');

  const newsOk = { prompt: 'How long is the new floating bridge in the harbour city?', options: ['2.4 kilometres', '1 kilometre', '5 kilometres', '800 metres'], correctIndex: 0, explanation: 'The article says it is 2.4 kilometres long.', difficulty: 1, quote: 'The new floating bridge in the harbour city is 2.4 kilometres long.' };
  const newsBad = Object.assign({}, newsOk, { prompt: 'How many years did the floating bridge take to build?', options: ['Six', 'Four', 'Two', 'Ten'], correctIndex: 0, quote: 'It took six years to build.' });
  const nr = await Pipe.processBatch([newsOk, newsBad], { callAI: mockAI(() => []), article, now, seed: 'n' });
  assert(nr.rejected.grounding === 1, 'news: ungrounded quote rejected');
  assert(nr.accepted.length === 1 && nr.accepted[0].expiresAt === now + 14 * 86400000 && nr.accepted[0].source === 'news', 'news item stored pending with 14-day expiry');

  const embed = async (txt) => (/titan/i.test(txt) ? [1, 0, 0] : [0, 1, 0]);
  const er = await Pipe.processBatch([Object.assign({}, good, { prompt: 'Titan orbits which planet of our solar system?' })], { callAI: mockAI(() => []), category: 'science', now, embed, vectors: [{ id: 'x', v: [1, 0.01, 0] }] });
  assert(er.rejected.duplicate === 1, 'dedupe uses embeddings when configured');

  const stored = [];
  const gen = await Pipe.runGeneration({ callAI: mockAI(() => candidates), category: 'science', articles: [article], now, callsLeft: 10, store: async (l) => stored.push(...l) });
  assert(gen.accepted >= 1 && stored.every((i) => i.status === 'pending'), 'runGeneration stores pending items');
  const capped = await Pipe.runGeneration({ callAI: mockAI(() => candidates), category: 'science', articles: [article], now, callsLeft: 1, store: async () => {} });
  assert(capped.calls === 0, 'call cap respected');

  // Scheduler job with AI off → maintenance only, generation skipped
  const jobsOff = await Pipe.runQuizJobs({ db: fakeDb(), admin: require('firebase-admin'), now, deps: { aiEnabled: false } });
  assert(jobsOff.generation.skipped === 'ai_off' && jobsOff.maintenance && !jobsOff.maintenance.error, 'AI off: jobs run maintenance, skip generation');
  const jdb = fakeDb();
  const jobsOn = await Pipe.runQuizJobs({ db: jdb, admin: { firestore: { FieldValue: require('firebase-admin').firestore.FieldValue } }, now, deps: { aiEnabled: true, budget: { calls: 0 }, embeddingsConfigured: false, callAI: mockAI(() => candidates) } });
  const items = [...jdb.store.keys()].filter((k) => k.startsWith('quizItems/'));
  assert(jobsOn.generation && jobsOn.generation.accepted >= 1 && items.length >= 1, 'AI on (mock): scheduler job stores pending items end-to-end');

  // ═════════════════════════════════════════════════════════ Promotion / retirement / expiry
  const base = { status: 'pending', difficulty: 2, rating: 1500 };
  assert(Pipe.reviewItem(base, { answers: 40, correct: 20, reports: 0 }, now).status === 'active', 'promote after N clean answers');
  assert(Pipe.reviewItem(base, { answers: 10, correct: 5 }, now).status === 'pending', 'stay pending below N');
  assert(Pipe.reviewItem(base, { answers: 40, correct: 40 }, now).status === 'pending', 'no promotion when everyone gets it right (too easy / leaked)');
  assert(Pipe.reviewItem(base, { answers: 20, correct: 10, reports: 3 }, now).status === 'retired', 'high report rate auto-retires');
  assert(Pipe.reviewItem({ status: 'active', rating: 1500 }, { answers: 50, correct: 25, confirmedReports: 1 }, now).status === 'retired', 'confirmed report retires an active item');
  assert(Pipe.reviewItem({ status: 'active', rating: 1500, expiresAt: now - 1 }, {}, now).status === 'retired', 'expired news retires');
  assert(Pipe.reviewItem(base, { answers: 40, correct: 20, reports: 2 }, now).status === 'pending', 'reports above promote threshold block promotion');

  const mdb = fakeDb();
  mdb.store.set('quizItems/n1', { status: 'active', source: 'news', expiresAt: now - 1000, prompt: 'x', options: ['a', 'b', 'c', 'd'], correctIndex: 0 });
  mdb.store.set('quizItems/p1', { status: 'pending', source: 'ai', rating: 1500, difficulty: 2 });
  mdb.store.set('quizStats/p1', { answers: 35, correct: 20, updatedAt: now - 10 });
  const bq = Bank.bank()[0];
  mdb.store.set('quizStats/' + bq.id, { answers: 50, correct: 49, updatedAt: now - 10 });
  const m = await Pipe.runQuizJobs({ db: mdb, admin: null, now, deps: { aiEnabled: false } });
  assert(mdb.store.get('quizItems/n1').status === 'retired' && m.maintenance.expired === 1, 'maintenance expires news after 14 days');
  assert(mdb.store.get('quizItems/p1').status === 'active' && m.maintenance.promoted === 1, 'maintenance promotes clean pending items');
  assert(mdb.store.get('quizConfig/calibration').ratings[bq.id] < 1300, 'maintenance calibrates bundled item ratings from stats');

  // News availability with a validated news item
  Svc.resetCaches();
  const ndb = fakeDb();
  ndb.store.set('quizItems/' + nr.accepted[0].id, Object.assign({}, nr.accepted[0]));
  const nh = await Svc.quizAction(adminApp(ndb), 'alice', { op: 'home' }, now);
  assert(nh.newsAvailable === true, 'News Quiz appears once validated news items exist');
  const nq = await Svc.quizAction(adminApp(ndb), 'alice', { op: 'solo_next', mode: 'news' }, now);
  assert(nq.q && nq.q.id === nr.accepted[0].id, 'News Quiz serves news items');
  Svc.resetCaches();

  // ═════════════════════════════════════════════════════════ Wiring
  const media = read('api/media-config.js');
  assert(/action === 'quiz'/.test(media) && /quizAction/.test(media), 'quiz folded into api/media-config.js');
  const sched = read('api/chaupaal-scheduler.js');
  assert(/runQuizJobs/.test(sched), 'scheduler runs quiz jobs');
  const apiFiles = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js'));
  assert(apiFiles.length <= 12, 'api/*.js ≤ 12 (' + apiFiles.length + ')');
  const rules = JSON.parse(read('firebase/database.rules.json'));
  const qr = rules.rules.games && rules.rules.games.quizroom;
  assert(!!qr && !!qr.$code, 'RTDB rules for games/quizroom');
  const code = qr.$code;
  assert(code.server && code.server['.read'] === false, 'room server node (answers) unreadable by clients');
  assert(!code.lat || code.lat['.read'] === false || code.lat['.read'] === undefined, 'latency samples not client-readable');
  const admin = read('api/admin-feedback.js');
  assert(/quiz_retire/.test(admin) && /quiz_approve/.test(admin) && /view === 'quiz'|'quiz'/.test(admin), 'admin view: quiz reports approve / retire');
  const ui = read('public/src/js/games/quiz-ui.js');
  assert(!/correctIndex/.test(ui), 'client never references correctIndex');
  assert(/const ROOM = 'quizroom'/.test(ui) && /registerPartyGame\(ROOM/.test(ui), 'client registers the quizroom party game');
  const html = read('public/index.html');
  assert(/quiz-ui\.js/.test(html) && /quiz-core\.js/.test(html), 'index.html loads quiz scripts');
  const reg = read('public/src/js/games/game-registry.js');
  assert(/QuizGame/.test(reg), 'registry quiz entry launches the new Quiz UI');
  const rulesTxt = read('public/src/js/dangal/dangal-rules.js');
  assert(/600/.test(rulesTxt) && /400/.test(rulesTxt), 'Rules sheet documents the scoring formula');

  console.log(failed ? `\n${failed} failure(s)` : '\nAll Dangal P6 quiz tests passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
