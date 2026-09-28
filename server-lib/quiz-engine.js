/**
 * Quiz Muqabala room adapter (Dangal P6) — plugged into server-lib/party-deal.js GAMES as `quizroom`
 * (RTDB games/quizroom/{code}; the legacy client-written games/quiz/* path stays untouched).
 *
 * Modes: Duel (exactly 2, rated, 10 questions) and Party (2–50, host picks categories / length).
 * Fairness:
 * - Full questions (with the correct index) live only in `room.server`, which no client can read.
 *   pub.state carries the public question (prompt + shuffled options) from the "ready" phase with a
 *   synchronized `startAt`; answers before startAt are rejected, grading happens here at the reveal.
 * - Answer time = server receive time − startAt − half the player's median RTT (capped 250 ms).
 *   RTT is server-measured by a two-step ping outside the room transaction (games/quizroom/{code}/lat).
 * - Options are shuffled once per question per match; every player sees the same order.
 * Live policy: a disconnect mid-question is simply no answer; rejoin continues the match. In a Duel,
 * leaving or staying offline past the reconnect window forfeits (rated). Party rooms play on.
 * Settlement: Duel → dangal-economy.resolveGame (trusted, rated); Party → resolvePlacement.
 * Question stats / seen-lists are written after settlement (quiz-service.recordMatch).
 */
'use strict';

const crypto = require('crypto');
const Core = require('../public/src/js/games/quiz-core.js');
const Policy = require('../public/src/js/dangal/dangal-live-policy.js');
const Service = require('./quiz-service.js');

const MIN_TICK_MS = 200;
const LATE_GRACE_MS = 300;
const MAX_RTT_SAMPLES = 7;
const PARTY_QUESTION_MS = [10000, 15000, 20000, 30000];

const cryptoRng = () => crypto.randomInt(0, 0x100000000) / 0x100000000;

function createQuizAdapter({ err, rng, poolFn }) {
  const pol = Policy.policyFor('quiz');
  const R = typeof rng === 'function' ? rng : cryptoRng;

  function mergeSettings(raw) {
    const r = raw || {};
    const mode = r.mode === 'duel' ? 'duel' : 'party';
    const cats = Array.isArray(r.categories) ? r.categories.map(String).filter((c) => Core.CATEGORY_IDS.includes(c)) : [];
    const length = mode === 'duel' ? Core.TIMING.duel.questions : Core.PARTY_LENGTHS.includes(Number(r.length)) ? Number(r.length) : Core.TIMING.party.questions;
    const difficulty = mode === 'party' && [1, 2, 3].includes(Number(r.difficulty)) ? Number(r.difficulty) : 0;
    const region = Core.REGIONS.some((x) => x.id === r.region) ? r.region : null;
    const questionMs = mode === 'duel' ? Core.TIMING.duel.questionMs : PARTY_QUESTION_MS.includes(Number(r.questionMs)) ? Number(r.questionMs) : Core.TIMING.party.questionMs;
    const hostPlays = mode === 'duel' || r.hostPlays !== false;
    return { mode, quick: mode === 'duel' && !!r.quick, categories: Array.from(new Set(cats)).slice(0, 12), length, difficulty, region, questionMs, hostPlays };
  }

  const present = (room, id) => !!room.pub.players[id] && !room.pub.players[id].left;
  const samplesOf = (room, id) => {
    const l = room.lat && room.lat[id];
    return l && Array.isArray(l.s) ? l.s.map(Number).filter(Number.isFinite) : [];
  };

  function currentQ(s) {
    return s.qs[s.pub.qn] || null;
  }

  function open(st, now) {
    if (st.phase === 'ready' && now >= st.startAt) st.phase = 'question';
  }

  function grade(s, now) {
    const st = s.pub;
    const q = currentQ(s);
    const correct = Core.displayedCorrect(q, s.orders[st.qn]);
    const entry = { qid: q.id, correct, picks: {}, gained: {}, ms: {} };
    const qs = (s.qstats[q.id] = s.qstats[q.id] || { answers: 0, correct: 0, ms: 0 });
    Object.keys(st.players).forEach((id) => {
      const p = st.players[id];
      if (p.out) return;
      const a = st.answers[id];
      const ok = !!a && a.i === correct;
      const pts = a ? Core.scoreAnswer(ok, a.ms, st.questionMs) : 0;
      p.score += pts;
      p.time += a ? a.ms : st.questionMs;
      p.correct += ok ? 1 : 0;
      p.streak = ok ? p.streak + 1 : 0;
      p.best = Math.max(p.best, p.streak);
      if (a) {
        entry.picks[id] = a.i;
        entry.ms[id] = a.ms;
        qs.answers++;
        qs.correct += ok ? 1 : 0;
        qs.ms += a.ms;
      }
      entry.gained[id] = pts;
    });
    st.history.push(entry);
    st.phase = 'reveal';
    st.revealUntil = now + st.revealMs;
  }

  function advance(st, now) {
    if (st.qn + 1 >= st.total) {
      st.phase = 'over';
      st.over = true;
      return;
    }
    st.qn++;
    st.phase = 'ready';
    st.answers = {};
    st.startAt = now + st.readyMs;
    st.endsAt = st.startAt + st.questionMs;
    st.revealUntil = 0;
  }

  function forfeit(st, uid, now) {
    const p = st.players[uid];
    if (!p || p.out || st.over) return;
    p.out = true;
    if (st.mode === 'duel') {
      st.forfeit = uid;
      st.phase = 'over';
      st.over = true;
      st.endedAt = now;
    }
  }

  const activeIds = (room) => {
    const st = room.server.pub;
    return Object.keys(st.players).filter((id) => !st.players[id].out && present(room, id));
  };

  function syncScores(room) {
    const st = room.server.pub;
    Object.keys(st.players).forEach((id) => {
      if (room.pub.players[id]) room.pub.scores[id] = st.players[id].score;
    });
  }

  function queueSettlement(room) {
    const s = room.server;
    const st = s.pub;
    if (!st.over || s.settleReq) return;
    const revealed = st.history.map((h) => h.qid);
    const stats = revealed.map((id) => Object.assign({ id }, s.qstats[id] || { answers: 0, correct: 0, ms: 0 }));
    const seen = {};
    Object.keys(st.players).forEach((id) => (seen[id] = revealed));
    const lines = Object.keys(st.players).map((id) => Object.assign({ uid: id }, st.players[id]));
    const base = { matchId: s.matchId, game: 'quiz', stats, seen, done: false };
    if (st.mode === 'duel') {
      const [a, b] = st.order;
      let result = 'draw';
      if (st.forfeit) result = st.forfeit === a ? 'loss' : 'win';
      else {
        const h = Core.headToHead(lines.find((l) => l.uid === a) || {}, lines.find((l) => l.uid === b) || {});
        result = h === 'a' ? 'win' : h === 'b' ? 'loss' : 'draw';
      }
      s.settleReq = Object.assign(base, { kind: 'h2h', a, b, result, rated: true, forfeit: st.forfeit || null });
    } else {
      const inGame = lines.filter((l) => !l.out);
      const out = lines.filter((l) => l.out).map((l) => l.uid);
      const ranking = Core.rank(inGame).map((l) => l.uid).concat(out);
      s.settleReq = Object.assign(base, { kind: 'placement', ranking, stake: 0, draw: false, rolls: {}, forfeits: out, teams: null });
    }
    room.pub.settlement = { status: 'pending' };
  }

  function publicPlayers(room) {
    const st = room.server.pub;
    const lines = Object.keys(st.players).map((id) => ({
      id,
      name: st.players[id].name,
      score: st.players[id].score,
      correct: st.players[id].correct,
      streak: st.players[id].streak,
      best: st.players[id].best,
      time: st.players[id].time,
      out: !!st.players[id].out,
    }));
    return Core.rank(lines.map((l) => Object.assign({ uid: l.id }, l))).map(({ uid, ...rest }) => rest);
  }

  function view(s) {
    const st = s.pub;
    const q = currentQ(s);
    const showQ = q && (st.phase === 'ready' || st.phase === 'question' || st.phase === 'reveal');
    const last = st.history[st.history.length - 1];
    const out = {
      mode: st.mode,
      total: st.total,
      qn: st.qn,
      phase: st.phase,
      startAt: st.startAt,
      endsAt: st.endsAt,
      revealUntil: st.revealUntil,
      questionMs: st.questionMs,
      categories: s.settings.categories,
      hostPlays: s.settings.hostPlays !== false,
      over: !!st.over,
      forfeit: st.forfeit || null,
      players: s._players || [],
      answered: Object.keys(st.answers).reduce((m, id) => ((m[id] = true), m), {}),
      question: showQ ? Object.assign(Core.publicQuestion(q, s.orders[st.qn]), { n: st.qn + 1 }) : null,
      reveal: null,
      summary: null,
    };
    if (st.phase === 'reveal' && last && last.qid === (q && q.id)) {
      out.reveal = { qid: last.qid, correct: last.correct, explanation: q.explanation || '', picks: last.picks, gained: last.gained, ms: last.ms, counts: [0, 1, 2, 3].map((i) => Object.values(last.picks).filter((v) => v === i).length) };
    }
    if (st.over) {
      out.summary = {
        history: st.history.map((h, i) => {
          const hq = s.qs[i];
          return { qid: h.qid, prompt: hq.prompt, options: s.orders[i].map((k) => hq.options[k]), correct: h.correct, picks: h.picks, gained: h.gained, explanation: hq.explanation || '' };
        }),
      };
    }
    return out;
  }

  return {
    core: Core,
    min: 2,
    max: 50,
    maxFor: (room) => (room.pub.settings && room.pub.settings.mode === 'duel' ? 2 : 50),
    mergeSettings,
    deal(room, seated, ctx) {
      const set = mergeSettings(room.pub.settings);
      const ids = set.hostPlays ? seated : seated.filter((id) => id !== room.pub.host);
      if (set.mode === 'duel' && ids.length !== 2) throw err('need_players', 'A Duel needs exactly 2 players');
      if (ids.length < 1) throw err('need_players', 'Need at least 1 player besides the big screen');
      const prep = (ctx.args && ctx.args.prep) || {};
      const pool = (poolFn || Service.buildPool)({ region: set.region, extras: prep.extras, calib: prep.calib });
      const seen = new Set();
      ids.forEach((id) => ((prep.seen && prep.seen[id]) || []).forEach((q) => seen.add(q)));
      const ratings = ids.map((id) => (prep.ratings && prep.ratings[id]) || 1500);
      const qs = Core.selectQuestions(pool, {
        count: set.length,
        seed: Math.floor(R() * 0x7fffffff),
        seen,
        categories: set.categories,
        target: set.mode === 'duel' ? Core.targetRating(ratings) : null,
        difficulty: set.difficulty || null,
        maxPending: set.mode === 'duel' ? 1 : Core.MAX_PENDING_PER_MATCH,
      });
      if (qs.length < Math.min(3, set.length)) throw err('no_questions', 'Not enough questions for those categories — pick more');
      const seed = crypto.randomBytes(8).toString('hex');
      const now = ctx.now;
      const timing = Core.TIMING[set.mode];
      const players = {};
      ids.forEach((id) => (players[id] = { name: room.pub.players[id].name, score: 0, time: 0, correct: 0, streak: 0, best: 0 }));
      room.server = {
        settings: set,
        matchId: 'quiz_' + set.mode + '_' + String(room.pub.host || '').slice(0, 10) + '_' + (room.pub.createdAt || now) + '_' + ctx.roundNo,
        clock: now,
        qs: qs.map((q) => ({ id: q.id, prompt: q.prompt, options: q.options.slice(0, 4), correctIndex: q.correctIndex, explanation: q.explanation || '', category: q.category, difficulty: q.difficulty || Core.tierOf(q.rating || 1500), status: q.status, source: q.source })),
        orders: qs.map((q) => Core.optionOrder(seed, q.id, 4)),
        qstats: {},
        settleReq: null,
        pub: {
          mode: set.mode,
          total: qs.length,
          qn: 0,
          phase: 'ready',
          readyMs: timing.readyMs,
          revealMs: timing.revealMs,
          questionMs: set.questionMs,
          startAt: now + timing.readyMs,
          endsAt: now + timing.readyMs + set.questionMs,
          revealUntil: 0,
          players,
          order: ids.slice(),
          answers: {},
          history: [],
          forfeit: null,
          over: false,
        },
      };
      room.pub.settlement = null;
      room.server._players = publicPlayers(room);
      syncScores(room);
    },
    view,
    phaseKey: (s) => [s.pub.qn, s.pub.phase, s.pub.over ? 1 : 0].join(':'),
    deadlineMs(s) {
      const st = s.pub;
      const now = Number(s.clock) || 0;
      let at = 0;
      if (st.over) return 0;
      if (st.phase === 'ready') at = st.startAt;
      else if (st.phase === 'question') at = st.endsAt + LATE_GRACE_MS;
      else if (st.phase === 'reveal') at = st.revealUntil;
      else return 0;
      return Math.max(MIN_TICK_MS, at - now);
    },
    apply(room, action) {
      const s = room.server;
      const st = s.pub;
      const now = Number(action.now) || Date.now();
      s.clock = now;
      if (st.over) return { error: 'over' };
      switch (action.type) {
        case 'open':
          open(st, now);
          return {};
        case 'answer': {
          open(st, now);
          if (now < st.startAt) return { error: 'too_early' };
          if (st.phase !== 'question') return { error: 'phase' };
          if (Number(action.qn) !== st.qn) return { error: 'stale' };
          const p = st.players[action.uid];
          if (!p || p.out) return { error: 'not_playing' };
          if (st.answers[action.uid]) return { error: 'answered' };
          const i = Number(action.i);
          if (!Number.isInteger(i) || i < 0 || i > 3) return { error: 'bad_choice' };
          const allowance = Core.rttAllowance(action.samples);
          if (now - st.startAt - allowance > st.questionMs) return { error: 'too_late' };
          const ms = Core.answerTime(now, st.startAt, action.samples, st.questionMs);
          st.answers[action.uid] = { i, ms };
          return { ms };
        }
        case 'reveal':
          open(st, now);
          if (st.phase !== 'question') return { error: 'phase' };
          grade(s, now);
          return {};
        case 'next':
          if (st.phase !== 'reveal') return { error: 'phase' };
          advance(st, now);
          return {};
        case 'forfeit':
          forfeit(st, action.uid, now);
          return {};
        default:
          return { error: 'bad_action' };
      }
    },
    afterChange(room) {
      room.server._players = publicPlayers(room);
      syncScores(room);
      queueSettlement(room);
    },
    absent(room, ctx) {
      const s = room.server;
      const st = s.pub;
      if (st.over) return;
      if (st.mode === 'duel') {
        for (const id of st.order) {
          const pr = room.presence && room.presence[id];
          const offline = !pr || pr.online === false ? ctx.now - (Number(pr && pr.at) || 0) : 0;
          if (!present(room, id) || (pr && offline >= pol.reconnectMs)) {
            ctx.act({ type: 'forfeit', uid: id, now: ctx.now }, true);
            return;
          }
        }
      }
      if (st.phase === 'ready' && ctx.now >= st.startAt) ctx.act({ type: 'open', now: ctx.now }, true);
      if (st.phase === 'question') {
        const live = activeIds(room).filter((id) => !ctx.gone(id));
        if (live.length && live.every((id) => st.answers[id])) ctx.act({ type: 'reveal', now: ctx.now }, true);
      }
    },
    timeout(room, ctx) {
      const st = room.server.pub;
      if (st.over) return;
      if (st.phase === 'ready') ctx.act({ type: 'open', now: ctx.now }, true);
      else if (st.phase === 'question') ctx.act({ type: 'reveal', now: ctx.now }, true);
      else if (st.phase === 'reveal') ctx.act({ type: 'next', now: ctx.now }, true);
    },
    betweenRounds: (s) => !!s.pub.over,
    canNext: () => false,
    newGameOnStart: () => true,
    onJoinPlaying(room, uid) {
      const st = room.server && room.server.pub;
      if (!st || st.over || st.mode === 'duel') return true;
      if (!st.players[uid]) st.players[uid] = { name: room.pub.players[uid].name, score: 0, time: 0, correct: 0, streak: 0, best: 0 };
      else delete st.players[uid].out;
      return false;
    },
    onLeave(room, uid, now) {
      const st = room.server.pub;
      if (st.over) return;
      room.server.clock = now || Date.now();
      forfeit(st, uid, room.server.clock);
    },
    ops: {
      answer(ctx) {
        const out = ctx.act({ type: 'answer', uid: ctx.uid, qn: ctx.args.qn, i: ctx.args.i, samples: samplesOf(ctx.room, ctx.uid), now: ctx.now }, true);
        if (!out) {
          const st = ctx.room.server.pub;
          if (ctx.now < st.startAt) throw err('too_early', 'Wait for the question');
          if (st.answers[ctx.uid]) return { accepted: false, already: true };
          return { accepted: false, late: true };
        }
        return { accepted: true, ms: out.ms };
      },
      resign(ctx) {
        ctx.act({ type: 'forfeit', uid: ctx.uid, now: ctx.now });
        return { resigned: true };
      },
    },
    hydrate(s) {
      s.settings = mergeSettings(s.settings);
      s.qs = (s.qs || []).map((q) => Object.assign({}, q, { options: q.options || [] }));
      s.orders = s.orders || [];
      s.qstats = s.qstats || {};
      s.clock = Number(s.clock) || 0;
      s._players = s._players || [];
      const st = (s.pub = s.pub || {});
      st.players = st.players || {};
      st.answers = st.answers || {};
      st.history = (st.history || []).map((h) => Object.assign({ picks: {}, gained: {}, ms: {} }, h));
      st.order = st.order || Object.keys(st.players);
      st.forfeit = st.forfeit || null;
      st.over = !!st.over;
      if (s.settleReq) {
        s.settleReq.stats = s.settleReq.stats || [];
        s.settleReq.seen = s.settleReq.seen || {};
        s.settleReq.ranking = s.settleReq.ranking || [];
        s.settleReq.forfeits = s.settleReq.forfeits || [];
        s.settleReq.rolls = s.settleReq.rolls || {};
      }
    },
    pendingSettlement: (s) => (s && s.settleReq && !s.settleReq.done ? s.settleReq : null),

    /** Loaded outside the room transaction before `start`: seen lists, ratings, AI items, calibration. */
    async prepare(adminApp, rtdb, path) {
      const snap = await rtdb.ref(path + '/pub/players').once('value');
      const players = snap.val() || {};
      const ids = Object.keys(players).filter((id) => !players[id].left);
      const db = adminApp.firestore();
      const [seen, ratings, extras, calib] = await Promise.all([
        Service.loadSeen(db, ids),
        Service.loadRatings(db, ids),
        Service.loadExtras(db),
        Service.loadCalibration(db),
      ]);
      return { seen, ratings, extras, calib };
    },

    /** Two-step server-measured RTT (no room transaction): step 1 issues a nonce, step 2 echoes it. */
    direct: {
      async ping(adminApp, rtdb, path, uid, body) {
        const member = await rtdb.ref(path + '/pub/players/' + uid).once('value');
        if (!member.exists()) throw err('not_member', 'You are not in this room');
        const ref = rtdb.ref(path + '/lat/' + uid);
        const now = Date.now();
        if (!body.n) {
          const n = crypto.randomBytes(6).toString('hex');
          await ref.child('p').set({ n, at: now });
          return { n };
        }
        const cur = (await ref.once('value')).val() || {};
        const p = cur.p || {};
        if (p.n !== String(body.n) || now - (Number(p.at) || 0) > 5000) return { rtt: null };
        const rtt = now - Number(p.at);
        const s = (Array.isArray(cur.s) ? cur.s : []).concat([rtt]).slice(-MAX_RTT_SAMPLES);
        await ref.set({ s });
        return { rtt, allowance: Core.rttAllowance(s) };
      },
    },

    /** After economy settlement: question stats, seen lists, Daily-independent quiz stats. */
    async afterSettle(adminApp, req, deps) {
      const db = (deps && deps.db) || adminApp.firestore();
      const admin = (deps && deps.admin) || adminApp;
      await Service.recordMatch(db, admin, req);
    },
  };
}

module.exports = { createQuizAdapter, cryptoRng, PARTY_QUESTION_MS };
