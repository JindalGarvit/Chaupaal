/**
 * Elo-aware Dangal stranger matching (P7).
 * Strangers only — friend challenges untouched.
 *
 * Band widens with wait time; timeout → Practice AI (honest, never fake human).
 * Queue ops are transactional to prevent double-claim.
 */
'use strict';

const { canonicalGameId, RATED } = (() => {
  try {
    const econ = require('./dangal-economy');
    return {
      canonicalGameId: econ.canonicalGameId,
      RATED: econ.RATED || new Set(['chess', 'fiveinrow', 'ttt', 'streetcricket', 'gullykick', 'quiz']),
    };
  } catch (e) {
    return {
      canonicalGameId: (id) => String(id || '').toLowerCase(),
      RATED: new Set(['chess', 'fiveinrow', 'ttt', 'streetcricket', 'gullykick', 'quiz']),
    };
  }
})();

const QUEUE_TTL_MS = 90 * 1000; // prune waiting older than 90s
const MATCH_TIMEOUT_MS = 20 * 1000;
/** Wait ms → max |ΔElo| allowed */
const ELO_BAND_SCHEDULE = [
  { afterMs: 0, band: 80 },
  { afterMs: 4000, band: 150 },
  { afterMs: 8000, band: 250 },
  { afterMs: 14000, band: 400 },
  { afterMs: 18000, band: 700 },
];

function eloBandForWaitMs(waitMs) {
  const w = Math.max(0, Number(waitMs) || 0);
  let band = ELO_BAND_SCHEDULE[0].band;
  for (const row of ELO_BAND_SCHEDULE) {
    if (w >= row.afterMs) band = row.band;
  }
  return band;
}

function isRatedGame(gameId) {
  const id = canonicalGameId(gameId);
  return RATED.has(id);
}

function pickBestOpponent(myUid, myElo, waiters, { now = Date.now(), waitMs = 0 } = {}) {
  const band = eloBandForWaitMs(waitMs);
  const rated = true;
  let best = null;
  let bestDelta = Infinity;
  for (const w of waiters || []) {
    if (!w || w.uid === myUid || w.claimedBy) continue;
    if (w.tsMs && now - Number(w.tsMs) > QUEUE_TTL_MS) continue;
    const elo = Number(w.elo);
    if (!Number.isFinite(elo)) {
      // Unrated / missing elo — only match if we're also treating as unrated path
      if (best == null && !rated) best = w;
      continue;
    }
    const delta = Math.abs(elo - (Number(myElo) || 1200));
    if (delta <= band && delta < bestDelta) {
      best = w;
      bestDelta = delta;
    }
  }
  return { opponent: best, band, delta: best === null ? null : bestDelta };
}

async function loadGameElo(db, uid, gameId) {
  const id = canonicalGameId(gameId);
  try {
    const snap = await db.collection('users').doc(uid).collection('gameStats').doc(id).get();
    if (snap.exists) {
      const d = snap.data() || {};
      return Number(d.elo) || 1200;
    }
  } catch (e) {}
  return 1200;
}

function waitingCol(db, category) {
  const cat = String(category || 'GK').slice(0, 40);
  return db.collection('matchmaking').doc(cat).collection('waiting');
}

/**
 * Try to claim an opponent within Elo band; else enqueue self.
 * Returns { status: 'matched'|'waiting'|'practice_ai', ... }
 */
async function dangalMatchStep(db, admin, { uid, name, category, gameId, filters, waitingId }) {
  const FieldValue = admin.firestore.FieldValue;
  const cat = String(category || filters?.category || 'GK').slice(0, 40);
  const game = canonicalGameId(gameId || filters?.gameId || cat);
  const rated = isRatedGame(game);
  const elo = rated ? await loadGameElo(db, uid, game) : null;
  const col = waitingCol(db, cat);
  const now = Date.now();

  // If already waiting, check claim / try widen band claim
  if (waitingId) {
    const myRef = col.doc(String(waitingId));
    const mySnap = await myRef.get();
    if (!mySnap.exists) {
      return { status: 'practice_ai', reason: 'waiting_gone', simulated: true, label: 'Practice AI' };
    }
    const mine = mySnap.data() || {};
    if (mine.claimedBy && mine.claimedBy !== uid) {
      try {
        await myRef.delete();
      } catch (e) {}
      return {
        status: 'matched',
        simulated: false,
        uid: mine.claimedBy,
        name: mine.claimerName || 'Your opponent',
        eloDelta: null,
      };
    }
    const joined = Number(mine.tsMs) || now;
    const waitMs = now - joined;
    if (waitMs >= MATCH_TIMEOUT_MS) {
      try {
        await myRef.delete();
      } catch (e) {}
      return { status: 'practice_ai', reason: 'timeout', simulated: true, label: 'Practice AI', waitMs };
    }

    // Scan queue for band match
    let snap;
    try {
      snap = await col.orderBy('tsMs', 'asc').limit(25).get();
    } catch (e) {
      snap = await col.limit(25).get();
    }
    const waiters = snap.docs
      .map((d) => ({ id: d.id, ref: d.ref, ...(d.data() || {}) }))
      .filter((w) => w.uid && w.uid !== uid && !w.claimedBy);

    if (rated && elo != null) {
      const { opponent, band, delta } = pickBestOpponent(uid, elo, waiters, { now, waitMs });
      if (opponent) {
        try {
          await db.runTransaction(async (tx) => {
            const fresh = await tx.get(opponent.ref);
            if (!fresh.exists) throw new Error('gone');
            const d = fresh.data() || {};
            if (d.claimedBy) throw new Error('claimed');
            tx.update(opponent.ref, {
              claimedBy: uid,
              claimerName: name || 'You',
              claimedAt: FieldValue.serverTimestamp(),
              claimElo: elo,
              claimBand: band,
            });
          });
          try {
            await opponent.ref.delete();
          } catch (e) {}
          try {
            await myRef.delete();
          } catch (e) {}
          return {
            status: 'matched',
            simulated: false,
            uid: opponent.uid,
            name: opponent.name || 'Your opponent',
            eloDelta: delta,
            band,
            rated: true,
          };
        } catch (e) {
          // contention — keep waiting
        }
      }
    } else {
      // Unrated: FIFO among unclaimed (legacy behavior)
      const opp = waiters[0];
      if (opp) {
        try {
          await db.runTransaction(async (tx) => {
            const fresh = await tx.get(opp.ref);
            if (!fresh.exists) throw new Error('gone');
            if ((fresh.data() || {}).claimedBy) throw new Error('claimed');
            tx.update(opp.ref, {
              claimedBy: uid,
              claimerName: name || 'You',
              claimedAt: FieldValue.serverTimestamp(),
            });
          });
          try {
            await opp.ref.delete();
          } catch (e) {}
          try {
            await myRef.delete();
          } catch (e) {}
          return {
            status: 'matched',
            simulated: false,
            uid: opp.uid,
            name: opp.name || 'Your opponent',
            rated: false,
          };
        } catch (e) {}
      }
    }

    return {
      status: 'waiting',
      waitingId,
      waitMs,
      band: rated ? eloBandForWaitMs(waitMs) : null,
      elo,
      rated,
      timeoutMs: MATCH_TIMEOUT_MS,
    };
  }

  // Fresh join: try immediate claim, else enqueue
  let snap;
  try {
    snap = await col.orderBy('tsMs', 'asc').limit(25).get();
  } catch (e) {
    snap = await col.limit(25).get();
  }
  const waiters = snap.docs
    .map((d) => ({ id: d.id, ref: d.ref, ...(d.data() || {}) }))
    .filter((w) => w.uid && w.uid !== uid && !w.claimedBy);

  if (rated && elo != null) {
    const { opponent, band, delta } = pickBestOpponent(uid, elo, waiters, { now, waitMs: 0 });
    if (opponent) {
      try {
        await db.runTransaction(async (tx) => {
          const fresh = await tx.get(opponent.ref);
          if (!fresh.exists) throw new Error('gone');
          if ((fresh.data() || {}).claimedBy) throw new Error('claimed');
          tx.update(opponent.ref, {
            claimedBy: uid,
            claimerName: name || 'You',
            claimedAt: FieldValue.serverTimestamp(),
            claimElo: elo,
            claimBand: band,
          });
        });
        try {
          await opponent.ref.delete();
        } catch (e) {}
        return {
          status: 'matched',
          simulated: false,
          uid: opponent.uid,
          name: opponent.name || 'Your opponent',
          eloDelta: delta,
          band,
          rated: true,
        };
      } catch (e) {}
    }
  } else if (waiters[0]) {
    const opp = waiters[0];
    try {
      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(opp.ref);
        if (!fresh.exists) throw new Error('gone');
        if ((fresh.data() || {}).claimedBy) throw new Error('claimed');
        tx.update(opp.ref, {
          claimedBy: uid,
          claimerName: name || 'You',
          claimedAt: FieldValue.serverTimestamp(),
        });
      });
      try {
        await opp.ref.delete();
      } catch (e) {}
      return {
        status: 'matched',
        simulated: false,
        uid: opp.uid,
        name: opp.name || 'Your opponent',
        rated: false,
      };
    } catch (e) {}
  }

  const doc = await col.add({
    uid,
    name: name || 'You',
    category: cat,
    gameId: game,
    filters: filters || {},
    elo: elo,
    rated,
    tsMs: now,
    ts: FieldValue.serverTimestamp(),
  });

  return {
    status: 'waiting',
    waitingId: doc.id,
    waitMs: 0,
    band: rated ? eloBandForWaitMs(0) : null,
    elo,
    rated,
    timeoutMs: MATCH_TIMEOUT_MS,
  };
}

async function dangalMatchCancel(db, { category, waitingId }) {
  if (!waitingId) return { ok: true };
  const col = waitingCol(db, category || 'GK');
  try {
    await col.doc(String(waitingId)).delete();
  } catch (e) {}
  return { ok: true };
}

/** Scheduler: prune stale waiting nodes across a few categories. */
async function pruneStaleDangalQueues(db, { categories = ['GK', 'chess', 'quiz', 'ttt'], limit = 40 } = {}) {
  const now = Date.now();
  let pruned = 0;
  for (const cat of categories) {
    const col = waitingCol(db, cat);
    let snap;
    try {
      snap = await col.where('tsMs', '<', now - QUEUE_TTL_MS).limit(limit).get();
    } catch (e) {
      try {
        snap = await col.limit(limit).get();
      } catch (err) {
        continue;
      }
    }
    for (const doc of snap.docs) {
      const d = doc.data() || {};
      const ts = Number(d.tsMs) || 0;
      if (ts && now - ts > QUEUE_TTL_MS) {
        try {
          await doc.ref.delete();
          pruned += 1;
        } catch (e) {}
      }
    }
  }
  return { pruned };
}

module.exports = {
  ELO_BAND_SCHEDULE,
  QUEUE_TTL_MS,
  MATCH_TIMEOUT_MS,
  eloBandForWaitMs,
  isRatedGame,
  pickBestOpponent,
  loadGameElo,
  dangalMatchStep,
  dangalMatchCancel,
  pruneStaleDangalQueues,
};
