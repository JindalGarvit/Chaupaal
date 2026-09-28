/**
 * Quiz Muqabala service (Dangal P6). Served by POST /api/media-config { action: 'quiz', op }.
 * Every mode is graded here; clients never receive a correct index before they answer.
 *
 *   home          {}                          → categories, regions, Daily status, streak, newsAvailable
 *   daily_start   { day }                     → current Daily question (one attempt, resumes, no restarts)
 *   daily_answer  { day, qn, i }              → reveal for qn + next question (served after a short pause)
 *   daily_board   { day, scope }              → global / friends leaderboard (after you finish)
 *   solo_next     { mode, category, difficulty, region } → Practice (unlimited) or News question
 *   solo_answer   { qid, i }                  → reveal + running score
 *   report        { qid, reason, note }       → quizReports + quizStats.reports
 *
 * Firestore (Admin only):
 *   quizItems/{id}                AI / news questions { …item, status, norm, createdAt, expiresAt }
 *   quizStats/{id}                { answers, correct, ms, reports, confirmedReports, updatedAt }
 *   quizReports/{id}_{uid}        { qid, uid, reason, note, status: open|dismissed|actioned, at }
 *   quizConfig/calibration        { ratings: {id: n}, retired: {id: true}, at }
 *   quizDaily/{day}               { ids } — frozen the first time the day is opened
 *   quizDaily/{day}/attempts/{uid} one attempt: { qn, servedAt, answers[], score, time, done }
 *   quizDaily/{day}/scores/{uid}  { name, score, correct, time, key, grid, at }
 *   users/{uid}/quizMeta/seen     { ids: [...last 400] }
 *   users/{uid}/quizMeta/session  Practice / News session
 *   users/{uid}/quizMeta/daily    { lastDay, streak, best, played }
 */
'use strict';

const crypto = require('crypto');
const Core = require('../public/src/js/games/quiz-core.js');
const Bank = require('./quiz-bank.js');

const FRIEND_CAP = 200;
const EXTRAS_TTL_MS = 5 * 60 * 1000;
const CALIB_TTL_MS = 10 * 60 * 1000;
const NEXT_PAUSE_MS = 2500;
const SOLO_ALLOWANCE_MS = 150;
const NEWS_ROUND = 5;
const REPORT_REASONS = ['wrong', 'unclear', 'offensive'];

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

// ---------------------------------------------------------------- pool

let extrasCache = { at: 0, items: [] };
let calibCache = { at: 0, data: null };

/** Firestore quizItems doc → servable item (null when malformed). */
function normalizeItem(id, d) {
  if (!d || !Array.isArray(d.options) || d.options.length !== 4) return null;
  const ci = Number(d.correctIndex);
  if (!Number.isInteger(ci) || ci < 0 || ci > 3 || !d.prompt) return null;
  const rating = Number(d.rating) || Core.TIER_RATING[d.difficulty] || 1500;
  return {
    id: String(id),
    prompt: String(d.prompt),
    options: d.options.map(String),
    correctIndex: ci,
    explanation: String(d.explanation || ''),
    category: Core.CATEGORY_IDS.includes(d.category) ? d.category : 'gk',
    subcategory: String(d.subcategory || d.source || 'ai'),
    difficulty: Core.tierOf(rating),
    rating,
    locale: d.locale || 'global',
    source: d.source === 'news' ? 'news' : 'ai',
    articleId: d.articleId || null,
    status: d.status === 'active' ? 'active' : d.status === 'retired' ? 'retired' : 'pending',
    createdAt: Number(d.createdAt) || 0,
    expiresAt: Number(d.expiresAt) || null,
  };
}

async function loadExtras(db, now) {
  const t = now || Date.now();
  if (t - extrasCache.at < EXTRAS_TTL_MS) return extrasCache.items;
  try {
    const col = db.collection('quizItems');
    const [act, pend] = await Promise.all([col.where('status', '==', 'active').limit(400).get(), col.where('status', '==', 'pending').limit(120).get()]);
    const items = act.docs
      .concat(pend.docs)
      .map((d) => normalizeItem(d.id, d.data()))
      .filter((q) => q && (!q.expiresAt || q.expiresAt > t));
    extrasCache = { at: t, items };
  } catch (e) {
    console.warn('[quiz] extras', e && e.message);
  }
  return extrasCache.items;
}

async function loadCalibration(db, now) {
  const t = now || Date.now();
  if (calibCache.data && t - calibCache.at < CALIB_TTL_MS) return calibCache.data;
  try {
    const snap = await db.collection('quizConfig').doc('calibration').get();
    const d = snap.exists ? snap.data() || {} : {};
    calibCache = { at: t, data: { ratings: d.ratings || {}, retired: d.retired || {} } };
  } catch (e) {
    calibCache = { at: t, data: calibCache.data || { ratings: {}, retired: {} } };
  }
  return calibCache.data;
}

function resetCaches() {
  extrasCache = { at: 0, items: [] };
  calibCache = { at: 0, data: null };
}

/**
 * Bundled bank (global + optional regional pack) with calibrated ratings, minus retired items,
 * plus AI items. News items only join when `news` is set (News Quiz).
 */
function buildPool(opts) {
  const o = opts || {};
  const calib = o.calib || { ratings: {}, retired: {} };
  const out = [];
  for (const q of Bank.bank()) {
    if (q.locale !== 'global' && q.locale !== o.region) continue;
    if (calib.retired && calib.retired[q.id]) continue;
    const r = calib.ratings && Number(calib.ratings[q.id]);
    out.push(r ? Object.assign({}, q, { rating: r, difficulty: Core.tierOf(r) }) : q);
  }
  for (const q of o.extras || []) {
    if (!q || q.status === 'retired' || (calib.retired && calib.retired[q.id])) continue;
    if (q.source === 'news' ? !o.news : o.news) continue;
    if (q.locale !== 'global' && q.locale !== o.region) continue;
    out.push(q);
  }
  return out;
}

async function findItem(db, id) {
  const b = Bank.byId(id);
  if (b) return b;
  const hit = extrasCache.items.find((q) => q.id === id);
  if (hit) return hit;
  try {
    const snap = await db.collection('quizItems').doc(String(id)).get();
    return snap.exists ? normalizeItem(snap.id, snap.data()) : null;
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------- per-player data

async function loadSeen(db, ids) {
  const out = {};
  await Promise.all(
    (ids || []).map(async (id) => {
      try {
        const snap = await db.collection('users').doc(id).collection('quizMeta').doc('seen').get();
        out[id] = (snap.exists && Array.isArray(snap.data().ids) && snap.data().ids) || [];
      } catch (e) {
        out[id] = [];
      }
    })
  );
  return out;
}

async function loadRatings(db, ids) {
  const Ratings = require('./dangal-ratings.js');
  const out = {};
  await Promise.all(
    (ids || []).map(async (id) => {
      try {
        const snap = await db.collection('users').doc(id).collection('gameStats').doc('quiz').get();
        out[id] = Ratings.fromStats(snap.exists ? snap.data() : {}).r;
      } catch (e) {
        out[id] = 1500;
      }
    })
  );
  return out;
}

const mergeSeen = (prev, add) => {
  const keep = (prev || []).filter((x) => !(add || []).includes(x)).concat(add || []);
  return keep.slice(-Core.SEEN_MEMORY);
};

/** Stats + seen lists after a room match (called after economy settlement). */
async function recordMatch(db, admin, req) {
  const FieldValue = admin.firestore.FieldValue;
  const now = Date.now();
  const batch = db.batch();
  for (const s of req.stats || []) {
    if (!s || !s.id || !s.answers) continue;
    batch.set(
      db.collection('quizStats').doc(String(s.id)),
      { answers: FieldValue.increment(s.answers), correct: FieldValue.increment(s.correct || 0), ms: FieldValue.increment(s.ms || 0), updatedAt: now },
      { merge: true }
    );
  }
  const seen = req.seen || {};
  const ids = Object.keys(seen);
  const prev = await loadSeen(db, ids);
  ids.forEach((uid) => batch.set(db.collection('users').doc(uid).collection('quizMeta').doc('seen'), { ids: mergeSeen(prev[uid], seen[uid]), updatedAt: now }, { merge: true }));
  await batch.commit();
}

async function displayName(db, uid) {
  try {
    const snap = await db.collection('users').doc(uid).get();
    const d = snap.exists ? snap.data() || {} : {};
    return String(d.name || d.displayName || d.username || 'Player').slice(0, 40);
  } catch (e) {
    return 'Player';
  }
}

// ---------------------------------------------------------------- daily

function dayOf(body, now) {
  const key = String((body && body.day) || '');
  if (!Core.validDayKey(key, now)) throw err('VALIDATION_ERROR', 'That Daily Quiz isn’t open');
  return key;
}

async function dailyIds(db, day, now) {
  const ref = db.collection('quizDaily').doc(day);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() || {} : {};
    const ids = Array.isArray(data.ids) && data.ids.length ? data.ids : null;
    const salt = data.salt || crypto.randomBytes(8).toString('hex');
    if (ids) {
      if (!data.salt) tx.set(ref, { salt }, { merge: true });
      return Object.assign(ids.slice(), { salt });
    }
    const calib = await loadCalibration(db, now);
    const pool = buildPool({ calib }).filter((q) => q.source === 'bundled' && q.locale === 'global');
    const set = Core.dailySet(pool, day).map((q) => q.id);
    tx.set(ref, { ids: set, salt, createdAt: now });
    return Object.assign(set, { salt });
  });
}

/** Same order for everyone that day, but seeded by a server-only salt so the browser can't rebuild it. */
const dailySeed = (day, ids) => 'daily:' + day + ':' + ((ids && ids.salt) || '');

function dailyPublic(day, ids, qn) {
  const q = Bank.byId(ids[qn]);
  if (!q) return null;
  return Object.assign(Core.publicQuestion(q, Core.optionOrder(dailySeed(day, ids), q.id, 4)), { n: qn + 1 });
}

/** Skip questions whose clock ran out while the player was away (one attempt — no restarts). */
function catchUp(att, ids, now) {
  while (!att.done && att.qn < ids.length && now > att.servedAt + Core.DAILY_MS + 1000) {
    att.answers.push({ i: null, ms: Core.DAILY_MS, ok: false, pts: 0 });
    att.time += Core.DAILY_MS;
    att.qn++;
    att.servedAt = att.servedAt + Core.DAILY_MS + NEXT_PAUSE_MS;
    if (att.qn >= ids.length) att.done = true;
  }
  if (att.servedAt < now - Core.DAILY_MS) att.servedAt = now;
}

async function finishDaily(db, uid, day, att, now) {
  const name = await displayName(db, uid);
  const correct = att.answers.filter((a) => a.ok).length;
  const grid = Core.shareGrid(att.answers.map((a) => (a.i == null ? null : a.ok)));
  const key = att.score * 1e6 - Math.min(999999, att.time);
  await db.collection('quizDaily').doc(day).collection('scores').doc(uid).set({ name, score: att.score, correct, time: att.time, key, grid, at: now });
  const metaRef = db.collection('users').doc(uid).collection('quizMeta').doc('daily');
  const dayNo = Core.dayNoFromKey(day);
  const streak = await db.runTransaction(async (tx) => {
    const snap = await tx.get(metaRef);
    const m = snap.exists ? snap.data() || {} : {};
    const last = Number.isFinite(m.lastDay) ? m.lastDay : null;
    let s = Number(m.streak) || 0;
    // Never move backwards (e.g. yesterday finished after tomorrow's key): keep the streak as is.
    if (last != null && dayNo <= last) return m;
    s = last === dayNo - 1 ? s + 1 : 1;
    const next = { lastDay: dayNo, streak: s, best: Math.max(Number(m.best) || 0, s), played: (Number(m.played) || 0) + 1, lastScore: att.score, updatedAt: now };
    tx.set(metaRef, next, { merge: true });
    return next;
  });
  return { score: att.score, correct, total: att.answers.length, time: att.time, grid, streak: streak.streak || 1, best: streak.best || 1 };
}

async function dailyStart(db, uid, body, now) {
  const day = dayOf(body, now);
  const ids = await dailyIds(db, day, now);
  const ref = db.collection('quizDaily').doc(day).collection('attempts').doc(uid);
  const att = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const a = snap.exists ? Object.assign({ answers: [] }, snap.data()) : { qn: 0, servedAt: now + 1200, answers: [], score: 0, time: 0, done: false, startedAt: now };
    catchUp(a, ids, now);
    tx.set(ref, a);
    return a;
  });
  if (att.done) {
    const final = att.final || (await finishDaily(db, uid, day, att, now));
    if (!att.final) await ref.set({ final }, { merge: true });
    return { day, done: true, final, total: ids.length };
  }
  return { day, done: false, qn: att.qn, total: ids.length, score: att.score, q: dailyPublic(day, ids, att.qn), servedAt: att.servedAt, limitMs: Core.DAILY_MS, serverNow: now };
}

async function dailyAnswer(db, uid, body, now) {
  const day = dayOf(body, now);
  const ids = await dailyIds(db, day, now);
  const ref = db.collection('quizDaily').doc(day).collection('attempts').doc(uid);
  let reveal = null;
  const att = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw err('VALIDATION_ERROR', 'Start the Daily Quiz first');
    const a = Object.assign({ answers: [] }, snap.data());
    if (a.done) return a;
    if (Number(body.qn) !== a.qn) throw err('VALIDATION_ERROR', 'That question has closed');
    if (now < a.servedAt) throw err('VALIDATION_ERROR', 'Wait for the question');
    const q = Bank.byId(ids[a.qn]);
    const order = Core.optionOrder(dailySeed(day, ids), q.id, 4);
    const correct = Core.displayedCorrect(q, order);
    const ms = Math.max(0, now - a.servedAt - SOLO_ALLOWANCE_MS);
    const i = Number(body.i);
    const inTime = ms <= Core.DAILY_MS + 500;
    const picked = inTime && Number.isInteger(i) && i >= 0 && i <= 3 ? i : null;
    const ok = picked != null && picked === correct;
    const pts = picked != null ? Core.scoreAnswer(ok, Math.min(ms, Core.DAILY_MS), Core.DAILY_MS) : 0;
    a.answers.push({ i: picked, ms: Math.min(ms, Core.DAILY_MS), ok, pts });
    a.score += pts;
    a.time += Math.min(ms, Core.DAILY_MS);
    a.qn++;
    a.servedAt = now + NEXT_PAUSE_MS;
    if (a.qn >= ids.length) a.done = true;
    reveal = { qn: a.qn - 1, qid: q.id, correct, picked, isCorrect: ok, gained: pts, explanation: q.explanation || '', ms: Math.min(ms, Core.DAILY_MS) };
    tx.set(ref, a);
    return a;
  });
  if (reveal) await bumpStats(db, [{ id: reveal.qid, answers: reveal.picked == null ? 0 : 1, correct: reveal.isCorrect ? 1 : 0, ms: reveal.ms }]);
  if (att.done) {
    const final = att.final || (await finishDaily(db, uid, day, att, now));
    if (!att.final) await ref.set({ final }, { merge: true });
    return { day, reveal, done: true, final, score: att.score };
  }
  return { day, reveal, done: false, qn: att.qn, total: ids.length, score: att.score, q: dailyPublic(day, ids, att.qn), servedAt: att.servedAt, limitMs: Core.DAILY_MS, serverNow: now };
}

async function dailyBoard(db, uid, body, now) {
  const day = dayOf(body, now);
  const col = db.collection('quizDaily').doc(day).collection('scores');
  const mine = await col.doc(uid).get();
  if (!mine.exists) return { day, locked: true, rows: [] };
  const shape = (s) => {
    const d = s.data() || {};
    return { uid: s.id, me: s.id === uid, name: d.name || 'Player', score: Number(d.score) || 0, correct: Number(d.correct) || 0, time: Number(d.time) || 0, grid: d.grid || '' };
  };
  if (body.scope === 'friends') {
    const fol = await db.collection('users').doc(uid).collection('following').limit(FRIEND_CAP).get();
    const ids = [uid].concat(fol.docs.map((d) => d.id).filter((id) => id !== uid));
    const snaps = [];
    for (let i = 0; i < ids.length; i += 100) snaps.push(...(await db.getAll(...ids.slice(i, i + 100).map((id) => col.doc(id)))));
    const rows = Core.rank(snaps.filter((s) => s.exists).map(shape));
    return { day, scope: 'friends', locked: false, rows };
  }
  const top = await col.orderBy('key', 'desc').limit(50).get();
  const rows = top.docs.map(shape);
  if (!rows.some((r) => r.me)) rows.push(shape(mine));
  return { day, scope: 'global', locked: false, rows };
}

// ---------------------------------------------------------------- practice / news

async function bumpStats(db, stats) {
  const admin = require('firebase-admin');
  const FieldValue = admin.firestore.FieldValue;
  const batch = db.batch();
  let n = 0;
  for (const s of stats) {
    if (!s.answers) continue;
    n++;
    batch.set(db.collection('quizStats').doc(String(s.id)), { answers: FieldValue.increment(s.answers), correct: FieldValue.increment(s.correct || 0), ms: FieldValue.increment(s.ms || 0), updatedAt: Date.now() }, { merge: true });
  }
  if (n) await batch.commit().catch((e) => console.warn('[quiz] stats', e && e.message));
}

async function soloNext(db, uid, body, now) {
  const mode = body.mode === 'news' ? 'news' : 'practice';
  const sessRef = db.collection('users').doc(uid).collection('quizMeta').doc('session');
  const [sessSnap, seenMap, extras, calib] = await Promise.all([sessRef.get(), loadSeen(db, [uid]), loadExtras(db, now), loadCalibration(db, now)]);
  const prev = sessSnap.exists ? sessSnap.data() || {} : {};
  const fresh = prev.mode !== mode || body.restart === true;
  const region = Core.REGIONS.some((r) => r.id === body.region) ? body.region : null;
  const cat = Core.CATEGORY_IDS.includes(body.category) ? body.category : null;
  const diff = [1, 2, 3].includes(Number(body.difficulty)) ? Number(body.difficulty) : null;
  const sess = fresh
    ? { mode, n: 0, score: 0, correct: 0, streak: 0, recent: [], startedAt: now }
    : Object.assign({ recent: [] }, prev);
  if (mode === 'news' && sess.n >= NEWS_ROUND) return { done: true, mode, score: sess.score, correct: sess.correct, total: sess.n };
  const pool = buildPool({ region, extras, calib, news: mode === 'news' }).filter((q) => (mode === 'news' ? q.source === 'news' : true));
  const seen = new Set((seenMap[uid] || []).concat(sess.recent || []));
  const picks = Core.selectQuestions(pool, {
    count: 1,
    seed: Core.hash(uid + ':' + now),
    seen,
    categories: mode === 'news' || !cat ? null : [cat],
    difficulty: mode === 'news' ? null : diff,
    maxPending: mode === 'news' ? 1 : sess.n % 5 === 4 ? 1 : 0,  });
  const q = picks[0];
  if (!q) return { empty: true, mode };
  const order = Core.optionOrder(crypto.randomBytes(8).toString('hex'), q.id, 4);
  const servedAt = now + 400;
  Object.assign(sess, { qid: q.id, order, servedAt, answered: false, cat, diff, region });
  await sessRef.set(sess);
  return {
    mode,
    q: Object.assign(Core.publicQuestion(q, order), { n: sess.n + 1 }),
    total: mode === 'news' ? NEWS_ROUND : null,
    servedAt,
    limitMs: Core.PRACTICE_MS,
    serverNow: now,
    score: sess.score,
    streak: sess.streak,
  };
}

async function soloAnswer(db, uid, body, now) {
  const sessRef = db.collection('users').doc(uid).collection('quizMeta').doc('session');
  const snap = await sessRef.get();
  const sess = snap.exists ? snap.data() || {} : null;
  if (!sess || !sess.qid || sess.qid !== String(body.qid || '')) throw err('VALIDATION_ERROR', 'That question has closed');
  if (sess.answered) throw err('VALIDATION_ERROR', 'Already answered');
  if (now < sess.servedAt) throw err('VALIDATION_ERROR', 'Wait for the question');
  const q = await findItem(db, sess.qid);
  if (!q) throw err('VALIDATION_ERROR', 'That question is no longer available');
  const correct = Core.displayedCorrect(q, sess.order);
  const ms = Math.min(Core.PRACTICE_MS, Math.max(0, now - sess.servedAt - SOLO_ALLOWANCE_MS));
  const i = Number(body.i);
  const inTime = now - sess.servedAt <= Core.PRACTICE_MS + 800;
  const picked = inTime && Number.isInteger(i) && i >= 0 && i <= 3 ? i : null;
  const ok = picked != null && picked === correct;
  const pts = picked != null ? Core.scoreAnswer(ok, ms, Core.PRACTICE_MS) : 0;
  sess.answered = true;
  sess.n = (sess.n || 0) + 1;
  sess.score = (sess.score || 0) + pts;
  sess.correct = (sess.correct || 0) + (ok ? 1 : 0);
  sess.streak = ok ? (sess.streak || 0) + 1 : 0;
  sess.recent = (sess.recent || []).concat([q.id]).slice(-60);
  const seenMap = await loadSeen(db, [uid]);
  const batch = db.batch();
  batch.set(sessRef, sess);
  batch.set(db.collection('users').doc(uid).collection('quizMeta').doc('seen'), { ids: mergeSeen(seenMap[uid], [q.id]), updatedAt: now }, { merge: true });
  await batch.commit();
  if (picked != null) await bumpStats(db, [{ id: q.id, answers: 1, correct: ok ? 1 : 0, ms }]);
  return {
    qid: q.id,
    correct,
    picked,
    isCorrect: ok,
    gained: pts,
    explanation: q.explanation || '',
    score: sess.score,
    streak: sess.streak,
    n: sess.n,
    done: sess.mode === 'news' && sess.n >= NEWS_ROUND,
    source: q.source,
  };
}

// ---------------------------------------------------------------- report / home

async function report(db, uid, body, now) {
  const qid = String(body.qid || '').slice(0, 60);
  const reason = REPORT_REASONS.includes(body.reason) ? body.reason : null;
  if (!qid || !reason) throw err('VALIDATION_ERROR', 'Pick a reason');
  const q = await findItem(db, qid);
  if (!q) throw err('VALIDATION_ERROR', 'That question is no longer available');
  const note = String(body.note || '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 240);
  const ref = db.collection('quizReports').doc(qid + '_' + uid);
  const admin = require('firebase-admin');
  const created = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return false;
    tx.set(ref, { qid, uid, reason, note, status: 'open', at: now, prompt: q.prompt, options: q.options, correctIndex: q.correctIndex, source: q.source, category: q.category });
    tx.set(db.collection('quizStats').doc(qid), { reports: admin.firestore.FieldValue.increment(1), updatedAt: now }, { merge: true });
    return true;
  });
  return { reported: true, duplicate: !created };
}

async function home(db, uid, body, now) {
  const extras = await loadExtras(db, now);
  const newsAvailable = extras.some((q) => q.source === 'news' && q.status !== 'retired' && (!q.expiresAt || q.expiresAt > now));
  let daily = null;
  let streak = { streak: 0, best: 0 };
  try {
    const day = Core.validDayKey(body.day, now) ? String(body.day) : null;
    const [meta, att] = await Promise.all([
      db.collection('users').doc(uid).collection('quizMeta').doc('daily').get(),
      day ? db.collection('quizDaily').doc(day).collection('attempts').doc(uid).get() : Promise.resolve(null),
    ]);
    const m = meta.exists ? meta.data() || {} : {};
    const today = day ? Core.dayNoFromKey(day) : null;
    const alive = Number.isFinite(m.lastDay) && today != null && today - m.lastDay <= 1;
    streak = { streak: alive ? Number(m.streak) || 0 : 0, best: Number(m.best) || 0 };
    if (day) daily = { day, done: !!(att && att.exists && att.data().done), started: !!(att && att.exists), final: (att && att.exists && att.data().final) || null };
  } catch (e) {}
  const counts = Bank.counts();
  return { categories: Core.CATEGORIES, regions: Core.REGIONS, newsAvailable, daily, streak, bank: counts.global };
}

// ---------------------------------------------------------------- duel quick match

const QUEUE_PATH = 'quizQueue/duel';
const QUEUE_TTL_MS = 45 * 1000;

/**
 * One waiting slot (RTDB quizQueue/duel, Admin only). Claim a fresh opponent's room, or open a
 * Duel room and wait in the slot. Clients poll every few seconds; a poll refreshes the slot.
 */
async function duelFind(adminApp, uid, body, now) {
  const rtdb = adminApp.database();
  const ref = rtdb.ref(QUEUE_PATH);
  const fresh = (w) => w && w.code && w.uid && now - (Number(w.at) || 0) < QUEUE_TTL_MS;
  let claimed = null;
  let mine = null;
  await ref.transaction((w) => {
    claimed = null;
    mine = null;
    if (w == null) return null;
    if (fresh(w) && w.uid !== uid) {
      claimed = w.code;
      return null;
    }
    if (fresh(w) && w.uid === uid) {
      mine = w.code;
      return Object.assign({}, w, { at: now });
    }
    return undefined;
  });
  if (claimed) return { matched: true, code: claimed, host: false };
  if (mine) return { matched: false, code: mine, host: true, waiting: true };
  const { partyRoom } = require('./party-deal.js');
  const made = await partyRoom(adminApp, uid, { op: 'create', game: 'quizroom', name: body.name, settings: { mode: 'duel', quick: true } });
  let other = null;
  await ref.transaction((w) => {
    other = null;
    if (fresh(w) && w.uid !== uid) {
      other = w.code;
      return null;
    }
    return { code: made.code, uid, at: now };
  });
  if (other) {
    await partyRoom(adminApp, uid, { op: 'end', game: 'quizroom', code: made.code }).catch(() => {});
    return { matched: true, code: other, host: false };
  }
  return { matched: false, code: made.code, host: true, waiting: true };
}

async function duelCancel(adminApp, uid) {
  await adminApp
    .database()
    .ref(QUEUE_PATH)
    .transaction((w) => (w == null || w.uid === uid ? null : undefined));
  return { cancelled: true };
}

async function quizAction(adminApp, uid, body, now) {
  const b = body || {};
  const t = now || Date.now();
  const db = adminApp.firestore();
  const op = String(b.op || '');
  if (op === 'duel_find') return duelFind(adminApp, uid, b, t);
  if (op === 'duel_cancel') return duelCancel(adminApp, uid);
  if (op === 'home') return home(db, uid, b, t);
  if (op === 'daily_start') return dailyStart(db, uid, b, t);
  if (op === 'daily_answer') return dailyAnswer(db, uid, b, t);
  if (op === 'daily_board') return dailyBoard(db, uid, b, t);
  if (op === 'solo_next') return soloNext(db, uid, b, t);
  if (op === 'solo_answer') return soloAnswer(db, uid, b, t);
  if (op === 'report') return report(db, uid, b, t);
  throw err('VALIDATION_ERROR', 'Unknown quiz action');
}

module.exports = {
  quizAction,
  buildPool,
  normalizeItem,
  loadExtras,
  loadCalibration,
  loadSeen,
  loadRatings,
  recordMatch,
  mergeSeen,
  findItem,
  resetCaches,
  REPORT_REASONS,
  NEWS_ROUND,
};
