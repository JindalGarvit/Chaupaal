/**
 * Shabd Five social + sync (Dangal P5). Served by POST /api/media-config { action: 'shabd', op }.
 *
 *   sync        { stats }                  → merged stats (profile copy ∪ this device) — streak follows the account
 *   submit      { dayNo, rows, hard }      → this player's Daily result for friends (colour rows only, no letters)
 *   leaderboard { dayNo }                  → friends' results for that Daily, only after you've submitted yours
 *
 * Firestore:
 *   users/{uid}/gameStats/shabd            { stats, updatedAt }
 *   shabdDaily/{dayNo}/results/{uid}       { name, won, guesses, hard, rows, at }
 * Guesses are checked on the device (the answer never leaves it), so results are self-reported;
 * the server only enforces shape, the day window and one result per player per day.
 */
'use strict';

const Core = require('../public/src/js/games/shabd-core.js');

const FRIEND_CAP = 200;

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

/** Server "today" in puzzle numbers; local days sit within ±1 of it (UTC−12 … UTC+14). */
function serverDay(now) {
  const d = new Date(now);
  return Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Core.EPOCH_UTC) / 86400000);
}

function cleanDay(v, now) {
  const n = Math.floor(Number(v));
  const today = serverDay(now);
  if (!Number.isFinite(n) || n < today - 1 || n > today + 1) throw err('VALIDATION_ERROR', 'That puzzle isn’t open');
  return n;
}

function cleanRows(rows) {
  const list = Array.isArray(rows) ? rows.slice(0, Core.MAX_GUESSES) : [];
  if (!list.length || !list.every((r) => /^[gyx]{5}$/.test(String(r)))) throw err('VALIDATION_ERROR', 'Bad result');
  const won = list[list.length - 1] === 'ggggg';
  if (list.slice(0, -1).some((r) => r === 'ggggg')) throw err('VALIDATION_ERROR', 'Bad result');
  if (!won && list.length !== Core.MAX_GUESSES) throw err('VALIDATION_ERROR', 'Bad result');
  return { rows: list.map(String), won, guesses: list.length };
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

async function sync(db, uid, body) {
  const ref = db.collection('users').doc(uid).collection('gameStats').doc('shabd');
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const stored = snap.exists ? (snap.data() || {}).stats : null;
    const merged = Core.mergeStats(stored, body.stats);
    tx.set(ref, { stats: merged, updatedAt: Date.now() }, { merge: true });
    return { stats: merged };
  });
}

async function submit(db, uid, body, now) {
  const dayNo = cleanDay(body.dayNo, now);
  const r = cleanRows(body.rows);
  const ref = db.collection('shabdDaily').doc(String(dayNo)).collection('results').doc(uid);
  const name = await displayName(db, uid);
  const out = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return { already: true };
    tx.set(ref, { name, won: r.won, guesses: r.guesses, hard: !!body.hard, rows: r.rows, at: now });
    return { already: false };
  });
  const statsRef = db.collection('users').doc(uid).collection('gameStats').doc('shabd');
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(statsRef);
    const stored = snap.exists ? (snap.data() || {}).stats : null;
    const merged = Core.recordDaily(stored, dayNo, { won: r.won, guesses: r.guesses, hard: !!body.hard }, now);
    tx.set(statsRef, { stats: merged, updatedAt: now }, { merge: true });
  });
  return Object.assign({ dayNo }, out);
}

async function leaderboard(db, uid, body, now) {
  const dayNo = cleanDay(body.dayNo, now);
  const col = db.collection('shabdDaily').doc(String(dayNo)).collection('results');
  const mine = await col.doc(uid).get();
  if (!mine.exists) return { dayNo, locked: true, rows: [] };
  const fol = await db.collection('users').doc(uid).collection('following').limit(FRIEND_CAP).get();
  const ids = [uid].concat(fol.docs.map((d) => d.id).filter((id) => id !== uid));
  const refs = ids.map((id) => col.doc(id));
  const snaps = [];
  for (let i = 0; i < refs.length; i += 100) {
    const chunk = refs.slice(i, i + 100);
    snaps.push(...(await db.getAll(...chunk)));
  }
  const rows = snaps
    .filter((s) => s.exists)
    .map((s) => {
      const d = s.data() || {};
      return { uid: s.id, me: s.id === uid, name: d.name || 'Player', won: !!d.won, guesses: Number(d.guesses) || 0, hard: !!d.hard, rows: d.rows || [], at: Number(d.at) || 0 };
    })
    .sort((a, b) => (b.won - a.won) || (a.won ? a.guesses - b.guesses : 0) || (b.hard - a.hard) || a.at - b.at);
  return { dayNo, locked: false, rows };
}

async function shabdAction(db, uid, body, now) {
  const b = body || {};
  const t = now || Date.now();
  const op = String(b.op || '');
  if (op === 'sync') return sync(db, uid, b);
  if (op === 'submit') return submit(db, uid, b, t);
  if (op === 'leaderboard') return leaderboard(db, uid, b, t);
  throw err('VALIDATION_ERROR', 'Unknown Shabd action');
}

module.exports = { shabdAction, cleanRows, cleanDay, serverDay };
