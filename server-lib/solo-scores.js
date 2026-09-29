/**
 * Solo pro pass social + sync (Dangal P14). Served by POST /api/media-config { action: 'solo', op }.
 * Games: tiptap · brickbreaker · ankjod (Kakuro; `kakuro` accepted as an alias).
 *
 *   sync         { game, progress }              → progress merged with the account copy (higher value wins)
 *   daily_start  { game, dayNo }                 → { scored: true, token } for the first attempt of the day, else practice
 *   submit       { game, board, run, token? }    → plausibility check → ranked (or kept local with a reason)
 *   board        { game, board }                 → { top, friends, me } (friends = people you follow, ≤ 200)
 *
 * Firestore (Admin SDK only; clients never read these directly):
 *   users/{uid}/soloProgress/{game}              { progress, updatedAt }
 *   soloDaily/{game}_{dayNo}/attempts/{uid}      { token, startedAt, submitted }
 *   soloBoards/{boardId}/scores/{uid}            { name, score, ms, hints, stars, rank, at }
 *
 * Plausibility (a run that fails is never ranked; the phone keeps it locally):
 *   Tip Tap   exact replay of the move log on the level/daily seed — the replayed score must equal the
 *             claimed score; level boards need a win, the Daily needs all 20 moves; ≥ 200 ms per move;
 *             time-limited levels: every move inside the clock (+1.5 s grace).
 *   Brick     per segment: points ≤ the layout's theoretical maximum, bricks ≤ breakable bricks,
 *             ≥ 60 ms per brick (+1.5 s per cleared layout); segments add up to the claimed score.
 *             (No exact replay: ball trigonometry isn't bit-identical across JS engines.)
 *   Kakuro    the submitted digits must solve the puzzle (every run sums to its clue, no repeats);
 *             ≥ 400 ms per white cell; hints ≤ cells. Ranked by time + 30 s per hint.
 *   Daily     one scored attempt per player per day (started via daily_start), the day must be open
 *             (±1 day of server time) and the run can't be longer than the time since it started.
 */
'use strict';

const SoloCore = require('../public/src/js/games/solo-core.js');
const TipTap = require('../public/src/js/games/tiptap-engine.js');
const TipTapLevels = require('../public/src/js/games/tiptap-levels.js');
const Brick = require('../public/src/js/games/brick-engine.js');
const Kakuro = require('../public/src/js/games/kakuro-core.js');
const KakuroBank = require('../public/src/js/games/data/kakuro-bank.js');

const FRIEND_CAP = 200;
const TOP_N = 50;
const RULES = {
  tiptapMsPerMove: 200,
  tiptapTimeGraceMs: 1500,
  brickMsPerBrick: 60,
  brickMsPerClear: 1500,
  kakuroMsPerCell: 400,
  dailyStartSlackMs: 10000,
};

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}
const int = (v, d) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : d;
};

function cleanGame(g) {
  const id = SoloCore.gameId(g);
  if (!SoloCore.isSoloGame(id)) throw err('VALIDATION_ERROR', 'Unknown game');
  return id;
}

function kakuroRows(kind, key) {
  if (kind === 'daily') {
    const day = int(key, -1);
    const list = KakuroBank.daily || [];
    if (!list.length) return null;
    const k = day - KakuroBank.dailyStart;
    const entry = list[((k % list.length) + list.length) % list.length];
    const at = entry.indexOf(':');
    return { diff: entry.slice(0, at), rows: entry.slice(at + 1).split('/') };
  }
  const m = /^(easy|medium|hard|expert)-(\d+)$/.exec(String(key || ''));
  if (!m) return null;
  const list = KakuroBank[m[1]] || [];
  const n = int(m[2], 0);
  if (n < 1 || n > list.length) return null;
  return { diff: m[1], rows: list[n - 1].split('/') };
}

// ---------------------------------------------------------------- plausibility (pure)

/**
 * Check one run for a board. Returns { ok, reason?, entry? } where entry = { score, ms, hints, stars, rank }.
 * `now` is only used for the Daily window.
 */
function verifyRun(game, boardId, run, now) {
  const b = SoloCore.parseBoardId(boardId);
  if (!b || b.game !== game) return { ok: false, reason: 'bad-board' };
  const r = run && typeof run === 'object' ? run : {};
  const ms = Math.max(0, int(r.ms, 0));
  if (b.kind === 'daily' && !SoloCore.dayOpen(b.key, now || Date.now())) return { ok: false, reason: 'day-closed' };

  if (game === 'tiptap') {
    let level;
    let seed;
    if (b.kind === 'daily') {
      level = TipTap.dailyLevel(int(b.key, 0));
      seed = level.seed;
    } else if (b.kind === 'level') {
      level = TipTapLevels.get(int(b.key, 0));
      if (!level) return { ok: false, reason: 'bad-level' };
      seed = level.seed;
    } else return { ok: false, reason: 'bad-board' };
    const moves = Array.isArray(r.moves) ? r.moves.slice(0, 200) : [];
    if (!moves.length) return { ok: false, reason: 'no-moves' };
    let lastT = 0;
    for (let k = 0; k < moves.length; k++) {
      const m = moves[k];
      if (!Array.isArray(m) || m.length < 2) return { ok: false, reason: 'bad-move' };
      const t = int(m[2], lastT);
      if (t < lastT || t > ms + 1000) return { ok: false, reason: 'timing' };
      lastT = t;
      if (level.time && t > level.time * 1000 + RULES.tiptapTimeGraceMs) return { ok: false, reason: 'over-time' };
    }
    if (ms < moves.length * RULES.tiptapMsPerMove) return { ok: false, reason: 'too-fast' };
    const rep = TipTap.replay(level, seed, moves.map((m) => [int(m[0], -1), int(m[1], -1)]));
    if (!rep.ok) return { ok: false, reason: 'replay-' + rep.reason };
    if (rep.state && level.time && rep.status === 'play') TipTap.endByTime(rep.state);
    const status = rep.state ? rep.state.status : rep.status;
    if (rep.score !== int(r.score, -1)) return { ok: false, reason: 'score-mismatch' };
    if (b.kind === 'daily' && status !== 'done') return { ok: false, reason: 'unfinished' };
    if (b.kind === 'level' && status !== 'won') return { ok: false, reason: 'not-won' };
    const stars = b.kind === 'level' ? TipTap.starsFor(rep.state) : 0;
    return { ok: true, entry: { score: rep.score, ms, hints: 0, stars, rank: SoloCore.rankOf(game, { score: rep.score }) } };
  }

  if (game === 'brickbreaker') {
    const segs = Array.isArray(r.segs) ? r.segs.slice(0, 200) : [];
    if (!segs.length) return { ok: false, reason: 'no-segments' };
    if (b.kind === 'level' && segs.length !== 1) return { ok: false, reason: 'bad-segments' };
    if (b.kind === 'daily' && segs.length !== 1) return { ok: false, reason: 'bad-segments' };
    let total = 0;
    let minMs = 0;
    for (let k = 0; k < segs.length; k++) {
      const sg = segs[k] || {};
      let rows;
      if (b.kind === 'level') {
        const n = int(b.key, 0);
        if (n < 1 || n > Brick.CAMPAIGN_COUNT) return { ok: false, reason: 'bad-level' };
        rows = Brick.layoutFor(n);
      } else if (b.kind === 'daily') rows = Brick.dailyLayout(int(b.key, 0));
      else if (b.kind === 'endless') {
        if (int(sg.w, -1) !== k) return { ok: false, reason: 'wave-order' };
        rows = Brick.endlessLayout(k);
      } else return { ok: false, reason: 'bad-board' };
      const pts = Math.max(0, int(sg.pts, 0));
      const bricks = Math.max(0, int(sg.bricks, 0));
      const cap = Brick.breakableCount(rows);
      if (bricks > cap) return { ok: false, reason: 'bricks' };
      if (pts > Brick.maxPoints(rows)) return { ok: false, reason: 'points' };
      if (b.kind === 'endless' && k < segs.length - 1 && !sg.cleared) return { ok: false, reason: 'wave-order' };
      if (sg.cleared && bricks !== cap) return { ok: false, reason: 'bricks' };
      total += pts;
      minMs += bricks * RULES.brickMsPerBrick + (sg.cleared ? RULES.brickMsPerClear : 0);
    }
    if (b.kind === 'level' && !segs[0].cleared) return { ok: false, reason: 'not-won' };
    if (total !== int(r.score, -1)) return { ok: false, reason: 'score-mismatch' };
    if (ms < minMs) return { ok: false, reason: 'too-fast' };
    const stars = b.kind === 'level' ? Math.max(1, Math.min(3, int(r.stars, 1))) : 0;
    return { ok: true, entry: { score: total, ms, hints: 0, stars, rank: SoloCore.rankOf(game, { score: total }) } };
  }

  if (game === 'ankjod') {
    if (b.kind !== 'daily' && b.kind !== 'kakuro') return { ok: false, reason: 'bad-board' };
    const pz = kakuroRows(b.kind, b.key);
    if (!pz) return { ok: false, reason: 'bad-puzzle' };
    const digits = String(r.solution || '');
    if (!Kakuro.verifySolution(pz.rows, digits)) return { ok: false, reason: 'not-solved' };
    const cells = digits.length;
    const hints = Math.max(0, int(r.hints, 0));
    if (hints > cells) return { ok: false, reason: 'hints' };
    if (ms < cells * RULES.kakuroMsPerCell) return { ok: false, reason: 'too-fast' };
    return { ok: true, entry: { score: 0, ms, hints, stars: 0, rank: SoloCore.rankOf(game, { ms, hints }) } };
  }
  return { ok: false, reason: 'bad-game' };
}

// ---------------------------------------------------------------- Firestore ops

async function displayName(db, uid) {
  try {
    const snap = await db.collection('users').doc(uid).get();
    const d = snap.exists ? snap.data() || {} : {};
    return String(d.name || d.displayName || d.username || 'Player').slice(0, 40);
  } catch (e) {
    return 'Player';
  }
}

function progressRef(db, uid, game) {
  return db.collection('users').doc(uid).collection('soloProgress').doc(game);
}

async function sync(db, uid, body) {
  const game = cleanGame(body.game);
  const ref = progressRef(db, uid, game);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const stored = snap.exists ? (snap.data() || {}).progress : null;
    const merged = SoloCore.mergeProgress(game, stored, body.progress);
    merged.updatedAt = Date.now();
    tx.set(ref, { progress: merged, updatedAt: merged.updatedAt }, { merge: true });
    return { game, progress: merged };
  });
}

function attemptRef(db, game, dayNo, uid) {
  return db.collection('soloDaily').doc(game + '_' + dayNo).collection('attempts').doc(uid);
}

async function dailyStart(db, uid, body, now) {
  const game = cleanGame(body.game);
  const dayNo = int(body.dayNo, -1);
  if (!SoloCore.dayOpen(dayNo, now)) throw err('VALIDATION_ERROR', 'That Daily isn’t open');
  const ref = attemptRef(db, game, dayNo, uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const d = snap.data() || {};
      return { game, dayNo, scored: false, submitted: !!d.submitted };
    }
    const token = SoloCore.fnv(uid + '|' + game + '|' + dayNo + '|' + now).toString(36);
    tx.set(ref, { token, startedAt: now, submitted: false });
    return { game, dayNo, scored: true, token };
  });
}

function scoreRef(db, boardId, uid) {
  return db.collection('soloBoards').doc(boardId).collection('scores').doc(uid);
}

async function submit(db, uid, body, now) {
  const game = cleanGame(body.game);
  const boardId = String(body.board || '');
  const b = SoloCore.parseBoardId(boardId);
  if (!b || b.game !== game) throw err('VALIDATION_ERROR', 'Unknown board');
  const check = verifyRun(game, boardId, body.run, now);
  if (!check.ok) return { accepted: false, ranked: false, reason: check.reason };
  const entry = check.entry;
  const name = await displayName(db, uid);
  if (b.kind === 'daily') {
    const dayNo = int(b.key, -1);
    const aRef = attemptRef(db, game, dayNo, uid);
    const sRef = scoreRef(db, boardId, uid);
    const res = await db.runTransaction(async (tx) => {
      const aSnap = await tx.get(aRef);
      const a = aSnap.exists ? aSnap.data() || {} : null;
      if (!a) return { ranked: false, reason: 'no-attempt' };
      if (a.submitted) return { ranked: false, reason: 'practice' };
      if (!body.token || String(body.token) !== String(a.token)) return { ranked: false, reason: 'practice' };
      if (now - (a.startedAt || now) + RULES.dailyStartSlackMs < entry.ms) return { ranked: false, reason: 'timing' };
      tx.set(aRef, { submitted: true, submittedAt: now }, { merge: true });
      tx.set(sRef, Object.assign({ name, at: now }, entry));
      return { ranked: true };
    });
    if (res.ranked) {
      const pRef = progressRef(db, uid, game);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(pRef);
        const stored = snap.exists ? (snap.data() || {}).progress : null;
        const merged = SoloCore.recordDaily(stored, dayNo);
        merged.updatedAt = now;
        tx.set(pRef, { progress: merged, updatedAt: now }, { merge: true });
      });
    }
    return Object.assign({ accepted: true, entry }, res);
  }
  const sRef = scoreRef(db, boardId, uid);
  const res = await db.runTransaction(async (tx) => {
    const snap = await tx.get(sRef);
    const prev = snap.exists ? snap.data() || {} : null;
    if (prev && Number(prev.rank) >= entry.rank) return { ranked: true, improved: false, best: prev };
    tx.set(sRef, Object.assign({ name, at: now }, entry));
    return { ranked: true, improved: true };
  });
  return Object.assign({ accepted: true, entry }, res);
}

function rowOf(snap, uid) {
  const d = snap.data() || {};
  return { uid: snap.id, me: snap.id === uid, name: d.name || 'Player', score: int(d.score, 0), ms: int(d.ms, 0), hints: int(d.hints, 0), stars: int(d.stars, 0), rank: Number(d.rank) || 0, at: int(d.at, 0) };
}
const byRank = (a, b) => b.rank - a.rank || a.at - b.at;

async function board(db, uid, body) {
  const game = cleanGame(body.game);
  const boardId = String(body.board || '');
  const b = SoloCore.parseBoardId(boardId);
  if (!b || b.game !== game) throw err('VALIDATION_ERROR', 'Unknown board');
  const col = db.collection('soloBoards').doc(boardId).collection('scores');
  const topSnap = await col.orderBy('rank', 'desc').limit(TOP_N).get();
  const top = topSnap.docs.map((d) => rowOf(d, uid)).sort(byRank);
  const fol = await db.collection('users').doc(uid).collection('following').limit(FRIEND_CAP).get();
  const ids = [uid].concat(fol.docs.map((d) => d.id).filter((id) => id !== uid));
  const refs = ids.map((id) => col.doc(id));
  const snaps = [];
  for (let i = 0; i < refs.length; i += 100) snaps.push(...(await db.getAll(...refs.slice(i, i + 100))));
  const friends = snaps.filter((s) => s.exists).map((s) => rowOf(s, uid)).sort(byRank);
  const me = friends.find((r) => r.me) || null;
  let myPlace = null;
  if (me) {
    const idx = top.findIndex((r) => r.me);
    myPlace = idx >= 0 ? idx + 1 : null;
  }
  return { game, board: boardId, top, friends, me, myPlace };
}

async function soloAction(db, uid, body, now) {
  const b = body || {};
  const t = now || Date.now();
  const op = String(b.op || '');
  if (op === 'sync') return sync(db, uid, b);
  if (op === 'daily_start') return dailyStart(db, uid, b, t);
  if (op === 'submit') return submit(db, uid, b, t);
  if (op === 'board') return board(db, uid, b);
  throw err('VALIDATION_ERROR', 'Unknown solo action');
}

module.exports = { soloAction, verifyRun, kakuroRows, RULES };
