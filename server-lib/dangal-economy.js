/**
 * Server-trust Dangal economy: virtual chips, Elo, achievements, weekly scores.
 * Called from api/media-config.js (no extra Vercel function).
 */
const STARTING_CHIPS = 1000;
const MAX_STAKE = 500;
const DAILY_CHIP_RESOLVES = 60;
const Ratings = require('./dangal-ratings');
/** Rated titles live in the ratings service (Glicko-2). Tic-Tac-Toe is unrated quick-play. */
const RATED = Ratings.RATED;
/** Results only the server may report (it resolved every move) — client claims are ignored. */
const SERVER_SETTLED = new Set(['penalty', 'poker', 'chess', 'ludo', 'snakes', 'ttt', 'uno', 'scribble', 'quiz', 'carrom']);
/**
 * Placement payouts for N-player staked games (Ludo, Snakes & Ladders): everyone antes the stake,
 * the pot splits by finishing place. Teams (2v2) and 1v1 are winner-takes-the-other-stake.
 */
const PLACEMENT_SHARES = {
  1: [1],
  2: [1, 0],
  3: [0.7, 0.3, 0],
  4: [0.6, 0.3, 0.1, 0],
  5: [0.5, 0.3, 0.2, 0, 0],
  6: [0.5, 0.3, 0.2, 0, 0, 0],
};
/** Games whose ratings are kept per time-control bucket (gameStats/{game}_{bucket}). */
const RATING_BUCKETS = { chess: ['bullet', 'blitz', 'rapid', 'classical', 'daily'] };
/** Chips move only through the game's own server path — even practice results are ignored here. */
const SERVER_ONLY = new Set(['poker']);

const ALIASES = {
  snakesladders: 'snakes',
  tictactoe: 'ttt',
  ohnocards: 'uno',
  muqabala: 'quiz',
  shabdfive: 'wordguess',
  kakuro: 'ankjod',
  penaltyshootout: 'penalty',
  holdem: 'poker',
  texasholdem: 'poker',
  'texashold\'em': 'poker',
  shootout: 'penalty',
  cricket: 'streetcricket',
};

/** Titles culled in Dangal G0 (+ legacy spellings). Mirrors DANGAL_RETIRED_IDS on the client. */
const RETIRED_GAME_IDS = new Set([
  'rushrunner', 'pool', 'bowling', 'pickleball', 'tennis', 'fiveinrow', 'andarbaahar',
  'sattepe', 'business', 'tabletennis', 'kabaddi', 'khokho', 'gullykick',
  'fiveinarow', 'football', 'snooker', 'billiards', 'andarbahar', 'sattepesatta',
  'patangbaazi', 'kite', 'kitefight', 'patang',
]);

const ACHIEVEMENTS = {
  first_game: { label: 'Pehla Qadam', desc: 'Play your first Dangal game', chips: 100 },
  first_win: { label: 'Pehli Jeet', desc: 'Win your first game', chips: 150 },
  ten_games: { label: 'Khiladi', desc: 'Play 10 Dangal games', chips: 250 },
  fifty_games: { label: 'Ustaad', desc: 'Play 50 Dangal games', chips: 500 },
  hundred_games: { label: 'Dangal Guru', desc: 'Play 100 Dangal games', chips: 1000 },
  won_stake: { label: 'Raazi Tha', desc: 'Win a chip-staked game', chips: 100 },
  chess_first_win: { label: 'Pehli Chaal', desc: 'Win your first chess game', chips: 150 },
  penalty_clean_sheet: { label: 'Clean Sheet', desc: 'Win a penalty shootout without conceding', chips: 150 },
  penalty_panenka: { label: 'Panenka', desc: 'Score a soft chip down the middle', chips: 150 },
  poker_royal_flush: { label: 'Royal Flush', desc: 'Make a royal flush at Texas Hold’em', chips: 250 },
  poker_bluff_master: { label: 'Bluff Master', desc: 'Win 10 pots without a showdown at public tables', chips: 200 },
};

function canonicalGameId(id) {
  const raw = String(id || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '');
  return ALIASES[raw] || raw;
}

function isRetiredGameId(id) {
  return RETIRED_GAME_IDS.has(canonicalGameId(id));
}

/** Pure head-to-head rating delta for A (display points), via the ratings service. */
function computeEloDelta(eloA, gamesA, eloB, gamesB, scoreA) {
  return Ratings.rateMatch(
    Ratings.fromStats({ elo: eloA, totalGames: gamesA }),
    Ratings.fromStats({ elo: eloB, totalGames: gamesB }),
    scoreA
  ).deltaA;
}

function weekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return date.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
}

async function ensureWallet(db, FieldValue, uid) {
  const ref = db.collection('users').doc(uid).collection('wallet').doc('chips');
  const snap = await ref.get();
  if (snap.exists) return { ref, data: snap.data() || { balance: 0, lifetimeEarned: 0 } };
  const data = { balance: STARTING_CHIPS, lifetimeEarned: STARTING_CHIPS, grantedStart: true };
  await ref.set(data, { merge: true });
  await db.collection('users').doc(uid).collection('chipTransactions').add({
    amount: STARTING_CHIPS,
    reason: 'starting_grant',
    at: FieldValue.serverTimestamp(),
  });
  return { ref, data };
}

function evaluateNewAchievements(earnedSet, ctx) {
  const out = [];
  const tryAdd = (key) => {
    if (!earnedSet.has(key) && ACHIEVEMENTS[key]) out.push(key);
  };
  if (ctx.totalGamesEver === 1) tryAdd('first_game');
  if (ctx.isFirstWin) tryAdd('first_win');
  if (ctx.totalGamesEver === 10) tryAdd('ten_games');
  if (ctx.totalGamesEver === 50) tryAdd('fifty_games');
  if (ctx.totalGamesEver === 100) tryAdd('hundred_games');
  if (ctx.wonWithStake) tryAdd('won_stake');
  if (ctx.gameType === 'chess' && ctx.isFirstWin) tryAdd('chess_first_win');
  (ctx.extra || []).forEach((key) => {
    if (out.indexOf(key) < 0) tryAdd(key);
  });
  return out;
}

function seedFromLegacy(legacy) {
  const rec = Ratings.fromStats(legacy);
  return { elo: Math.round(rec.r), totalGames: 0 };
}

function isPersistableUid(uid) {
  const s = String(uid || '');
  if (s.length < 20 || s.length > 128) return false;
  if (/^(ai|random)$/i.test(s)) return false;
  if (/^(chat_|grp_|dm_|friend_)/.test(s)) return false;
  return true;
}

async function getWallet(db, admin, uid) {
  const FieldValue = admin.firestore.FieldValue;
  const { data } = await ensureWallet(db, FieldValue, uid);
  return { balance: Number(data.balance) || 0, lifetimeEarned: Number(data.lifetimeEarned) || 0 };
}

async function settleSide(db, FieldValue, uid, opts, batch) {
  const { gameType, won, isDraw, eloDelta, rating, stake, stakeDelta, resultTag, dayKey, extra, matchId, ratingDocId } = opts;
  const dailyRef = db.collection('users').doc(uid).collection('dailyCredits').doc(dayKey);
  const dailySnap = await dailyRef.get();
  const dailyCount = Number(dailySnap.data()?.resolves) || 0;
  const chipEligible = dailyCount < DAILY_CHIP_RESOLVES;

  const statsRef = db.collection('users').doc(uid).collection('gameStats').doc(gameType);
  const statsSnap = await statsRef.get();
  const stats = statsSnap.data() || {};
  const totalBefore = Number(stats.totalGames) || 0;
  const winsBefore = Number(stats.wins) || 0;
  const isFirstWin = won && winsBefore === 0;

  const { ref: walletRef, data: wallet } = await ensureWallet(db, FieldValue, uid);
  let chipDelta = 0;
  // The daily cap limits the +25 win bonus only; stakes always move on both sides so they stay zero-sum.
  if (chipEligible && won) chipDelta += 25;
  if (typeof stakeDelta === 'number') chipDelta += stakeDelta;
  else {
    if (stake > 0 && won) chipDelta += stake;
    if (stake > 0 && !won && !isDraw) chipDelta -= stake;
  }
  const nextBal = Math.max(0, (Number(wallet.balance) || 0) + chipDelta);

  const achRef = db.collection('users').doc(uid).collection('achievements');
  const achSnap = await achRef.limit(80).get();
  const earned = new Set(achSnap.docs.map((d) => d.id));
  const totalEver = totalBefore + 1;
  const newKeys = evaluateNewAchievements(earned, {
    totalGamesEver: totalEver,
    isFirstWin,
    wonWithStake: won && stake > 0,
    gameType,
    extra: Array.isArray(extra) ? extra : [],
  });
  let achChips = 0;
  newKeys.forEach((k) => {
    achChips += ACHIEVEMENTS[k].chips;
  });

  const statsWrite = {
    gameType,
    totalGames: totalEver,
    wins: winsBefore + (won ? 1 : 0),
    lastResult: resultTag,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (rating && ratingDocId && ratingDocId !== gameType) {
    statsWrite.lastBucket = ratingDocId.slice(gameType.length + 1);
    batch.set(
      db.collection('users').doc(uid).collection('gameStats').doc(ratingDocId),
      Object.assign({ gameType, bucket: statsWrite.lastBucket, totalGames: rating.rating.games, updatedAt: FieldValue.serverTimestamp() }, rating),
      { merge: true }
    );
    // The game doc mirrors the last-played speed so the shown rating and matchmaking stay current.
    Object.assign(statsWrite, rating);
  } else if (rating) Object.assign(statsWrite, rating);
  batch.set(statsRef, statsWrite, { merge: true });
  const txCol = db.collection('users').doc(uid).collection('chipTransactions');
  const ledgerAmount = chipDelta + achChips;
  if (matchId) {
    batch.set(txCol.doc('m_' + matchId), {
      amount: ledgerAmount,
      reason: 'dangal_match',
      gameType,
      matchId,
      result: resultTag,
      stake: stake || 0,
      at: FieldValue.serverTimestamp(),
    });
  } else if (ledgerAmount) {
    batch.set(txCol.doc(), {
      amount: ledgerAmount,
      reason: 'dangal_game',
      gameType,
      result: resultTag,
      at: FieldValue.serverTimestamp(),
    });
  }
  batch.set(
    walletRef,
    {
      balance: nextBal + achChips,
      lifetimeEarned: (Number(wallet.lifetimeEarned) || 0) + Math.max(0, chipDelta) + achChips,
    },
    { merge: true }
  );
  newKeys.forEach((key) => {
    batch.set(achRef.doc(key), { earnedAt: FieldValue.serverTimestamp(), key });
  });
  const wk = weekKey();
  batch.set(
    db.collection('weeklyLeaderboard').doc(wk).collection('scores').doc(gameType + '_' + uid),
    {
      uid,
      gameType,
      score: FieldValue.increment(won ? 10 : isDraw ? 4 : 1),
      wins: FieldValue.increment(won ? 1 : 0),
      games: FieldValue.increment(1),
    },
    { merge: true }
  );
  batch.set(dailyRef, { resolves: dailyCount + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

  return {
    chips: nextBal + achChips,
    chipDelta: chipDelta + achChips,
    eloDelta,
    achievements: newKeys.map((k) => ({ key: k, ...ACHIEVEMENTS[k] })),
  };
}

/**
 * @param {object} [opts] server-internal only (never from a request body):
 *   trusted — the caller resolved the match itself (required for SERVER_SETTLED games);
 *   flags — { [uid]: achievementKey[] } proven by that server.
 */
async function resolveGame(db, admin, uid, body, opts) {
  const FieldValue = admin.firestore.FieldValue;
  const gameType = canonicalGameId(body.gameType);
  if (!gameType || gameType.length > 40) {
    const err = new Error('Invalid gameType');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  const trusted = !!(opts && opts.trusted);
  const flags = (opts && opts.flags) || {};

  // Practice (no opponent, no stake) reports like any other title; a Live claim is ignored.
  const claimsLive = !!String(body.opponentUid || '').trim() || Number(body.stake) > 0;
  if (SERVER_SETTLED.has(gameType) && !trusted && (claimsLive || SERVER_ONLY.has(gameType))) {
    const w = await getWallet(db, admin, uid);
    return {
      gameType,
      serverSettled: true,
      won: false,
      isDraw: false,
      eloDelta: 0,
      chips: w.balance,
      chipDelta: 0,
      achievements: [],
      matchId: null,
      shared: false,
    };
  }

  // Retired title: void the match. Stakes only move at resolve (no escrow), so voiding
  // returns every staked virtual chip to both sides; no stats / Elo / leaderboard writes.
  if (RETIRED_GAME_IDS.has(gameType)) {
    const w = await getWallet(db, admin, uid);
    return {
      gameType,
      retired: true,
      won: false,
      isDraw: false,
      eloDelta: 0,
      chips: w.balance,
      chipDelta: 0,
      achievements: [],
      matchId: null,
      shared: false,
    };
  }

  const rawResult = String(body.result || '').toLowerCase();
  const isComplete = rawResult === 'complete' || rawResult === 'finished';
  const isDraw =
    !isComplete &&
    (!!body.isDraw || rawResult === 'draw' || rawResult === 'tie' || rawResult === 'stalemate');
  const won = !isComplete && !isDraw && (body.won === true || rawResult === 'win' || rawResult === 'won');
  const resultTag = (isComplete ? 'complete' : isDraw ? 'draw' : won ? 'win' : 'loss').slice(0, 40);

  const opponentUidRaw = body.opponentUid ? String(body.opponentUid).slice(0, 128) : '';
  let opponentUid =
    !isComplete && isPersistableUid(opponentUidRaw) && opponentUidRaw !== uid ? opponentUidRaw : '';
  let stake = Math.max(0, Math.min(MAX_STAKE, Math.floor(Number(body.stake) || 0)));

  const rawMatchId = String(body.matchId || body.sessionId || '')
    .replace(/[^\w.-]/g, '')
    .slice(0, 116);
  // Client reports live in their own namespace, so a client can never pre-claim a server match id.
  const matchId = rawMatchId && !trusted ? 'c_' + rawMatchId : rawMatchId;
  const matchRef = matchId ? db.collection('dangalMatches').doc(matchId) : null;
  if (matchRef) {
    const matchSnap = await matchRef.get();
    if (matchSnap.exists) return duplicateFor(db, admin, uid, matchId, matchSnap.data());
  }
  const lockRef = matchId ? db.collection('users').doc(uid).collection('gameResolves').doc(matchId) : null;
  if (lockRef) {
    const lockSnap = await lockRef.get();
    if (lockSnap.exists) {
      const w = await getWallet(db, admin, uid);
      return Object.assign({}, lockSnap.data()?.result || {}, { duplicate: true, chips: w.balance });
    }
  }

  // A client-reported head-to-head (peer-hosted Live titles): the server never saw the moves. Losing
  // only costs the reporter, so a loss settles at once; a win or draw claim waits until the opponent's
  // own report agrees. Nobody can take chips or rating from another player on their word alone.
  if (!trusted && opponentUid && (won || isDraw)) {
    if (!matchId) {
      opponentUid = '';
      stake = 0;
    } else {
      const claim = await recordClaim(db, FieldValue, matchId, uid, { result: resultTag, opp: opponentUid, stake });
      if (!(isDraw && claim.theirs && claim.theirs.opp === uid && claim.theirs.result === 'draw')) {
        const w = await getWallet(db, admin, uid);
        return {
          gameType,
          pending: true,
          disputed: !!(claim.theirs && claim.theirs.result !== 'loss'),
          won: false,
          isDraw: false,
          eloDelta: 0,
          chips: w.balance,
          chipDelta: 0,
          achievements: [],
          matchId,
          shared: true,
        };
      }
    }
  }
  // The loser can only pay what they hold; the winner is credited exactly that.
  if (opponentUid && stake > 0 && !isDraw) {
    const loserBal = (await getWallet(db, admin, won ? opponentUid : uid)).balance;
    stake = Math.max(0, Math.min(stake, Math.floor(loserBal)));
  }
  const winnerUid = isDraw ? '' : String(body.winnerUid || (won ? uid : opponentUid || '')).slice(0, 128);

  const bucketRaw = trusted && opts && opts.ratingBucket ? String(opts.ratingBucket) : '';
  const bucket = bucketRaw && (RATING_BUCKETS[gameType] || []).indexOf(bucketRaw) >= 0 ? bucketRaw : '';
  const ratingDocId = bucket ? gameType + '_' + bucket : gameType;
  async function ratingData(who) {
    const col = db.collection('users').doc(who).collection('gameStats');
    const snap = await col.doc(ratingDocId).get();
    if (snap.exists || !bucket) return snap.data() || {};
    // A new bucket starts from the player's legacy rating, fully provisional.
    return seedFromLegacy((await col.doc(gameType).get()).data() || {});
  }
  const rData = await ratingData(uid);
  const oData = opponentUid ? await ratingData(opponentUid) : {};
  let eloDelta = 0;
  let oppEloDelta = 0;
  let rated = null;
  if (!isComplete) {
    rated = Ratings.rateHeadToHead(rData, oData, isDraw ? 0.5 : won ? 1 : 0, {
      gameType,
      opponentUid,
      vsBot: !!body.vsBot,
      practice: !!body.practice,
      // Friend-only private tables are unrated unless the host marked them rated.
      privateTable: !!matchId && !/_mm_/.test(matchId) && !trusted,
      rated: body.rated === true ? true : trusted && body.rated === false ? false : undefined,
    });
    if (rated) {
      eloDelta = rated.deltaA;
      oppEloDelta = rated.deltaB;
    }
  }

  const dayKey = new Date().toISOString().slice(0, 10);
  const batch = db.batch();
  const reporter = await settleSide(
    db,
    FieldValue,
    uid,
    {
      gameType,
      won,
      isDraw,
      eloDelta: isComplete ? 0 : eloDelta,
      rating: rated ? rated.a : null,
      ratingDocId,
      stake: isComplete ? 0 : stake,
      resultTag,
      dayKey,
      matchId,
      extra: trusted ? flags[uid] : null,
    },
    batch
  );

  let opponent = null;
  if (opponentUid) {
    opponent = await settleSide(
      db,
      FieldValue,
      opponentUid,
      {
        gameType,
        won: !isDraw && !won,
        isDraw,
        eloDelta: oppEloDelta,
        rating: rated ? rated.b : null,
        ratingDocId,
        stake,
        resultTag: isDraw ? 'draw' : won ? 'loss' : 'win',
        dayKey,
        matchId,
        extra: trusted ? flags[opponentUid] : null,
      },
      batch
    );
  }

  const payload = {
    gameType,
    won,
    isDraw,
    eloDelta,
    rated: !!rated,
    bucket: bucket || undefined,
    provisional: rated ? rated.a.provisional : undefined,
    chips: reporter.chips,
    chipDelta: reporter.chipDelta,
    achievements: reporter.achievements,
    matchId: matchId || null,
    shared: !!opponentUid,
  };
  if (opponent) {
    payload.opponent = {
      chips: opponent.chips,
      chipDelta: opponent.chipDelta,
      eloDelta: opponent.eloDelta,
      achievements: opponent.achievements,
    };
  }
  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
  // create() makes a concurrent double-report fail the whole batch instead of settling twice.
  if (lockRef) batch.create(lockRef, { result: payload, at: FieldValue.serverTimestamp() });
  if (matchRef) {
    batch.create(matchRef, {
      gameType,
      reporterUid: uid,
      opponentUid: opponentUid || null,
      winnerUid: winnerUid || null,
      isDraw,
      payload,
      at: FieldValue.serverTimestamp(),
    });
  }
  try {
    await batch.commit();
  } catch (e) {
    const exists = e && (e.code === 6 || e.code === 'already-exists' || /already exists/i.test(String(e.message || '')));
    if (!exists || !matchRef) throw e;
    const again = await matchRef.get();
    return duplicateFor(db, admin, uid, matchId, again.exists ? again.data() : null);
  }
  if (!trusted && matchId && opponentUid) {
    db.collection('dangalClaims').doc(matchId).delete().catch(() => {});
  }
  return payload;
}

/** A settled match seen again: answer from the caller's side and with the caller's own balance only. */
async function duplicateFor(db, admin, uid, matchId, doc) {
  const w = await getWallet(db, admin, uid);
  const d = doc || {};
  const p = d.payload || {};
  const mine = !d.reporterUid || d.reporterUid === uid;
  const side = mine ? p : p.opponent || {};
  const out = {
    duplicate: true,
    gameType: p.gameType || d.gameType,
    won: mine ? !!p.won : !p.isDraw && !p.won && d.opponentUid === uid,
    isDraw: !!p.isDraw,
    eloDelta: Number(side.eloDelta) || 0,
    rated: !!p.rated,
    chips: w.balance,
    chipDelta: mine || d.opponentUid === uid ? Number(side.chipDelta) || 0 : 0,
    achievements: [],
    matchId,
    shared: !!p.shared,
  };
  if (mine && p.opponent) out.opponent = { chipDelta: Number(p.opponent.chipDelta) || 0, eloDelta: Number(p.opponent.eloDelta) || 0, achievements: [] };
  return out;
}

/** Store this player's claim on a client-reported match; returns the opponent's claim if any. */
async function recordClaim(db, FieldValue, matchId, uid, claim) {
  const ref = db.collection('dangalClaims').doc(matchId);
  let theirs = null;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = (snap.exists && snap.data()) || {};
    const claims = data.claims || {};
    theirs = claims[claim.opp] || null;
    claims[uid] = Object.assign({}, claim, { at: Date.now() });
    tx.set(ref, { claims, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  return { theirs };
}

/** Stake delta per finishing place (index 0 = winner). Pot = stake × players. */
function placementStakeDeltas(n, stake, opts) {
  const o = opts || {};
  const s = Math.max(0, Math.min(MAX_STAKE, Math.floor(Number(stake) || 0)));
  if (!s || n < 2 || o.draw) return Array(Math.max(0, n)).fill(0);
  const shares = PLACEMENT_SHARES[Math.min(6, n)] || PLACEMENT_SHARES[6];
  const pot = s * n;
  const out = [];
  let paid = 0;
  for (let k = 0; k < n; k++) {
    const win = k === 0 ? 0 : Math.floor(pot * (shares[k] || 0));
    out.push(win - s);
    paid += win;
  }
  out[0] = pot - paid - s;
  return out;
}

/**
 * Server-only settlement for a finished room game (Ludo / Snakes / Tic-Tac-Toe). Idempotent by matchId.
 * @param {{ gameType: string, matchId: string, ranking: string[], teams?: { winners: string[] } | null,
 *           stake?: number, draw?: boolean, rolls?: Record<string, number[]> }} req — ranking = humans, best first
 */
async function resolvePlacement(db, admin, req) {
  const FieldValue = admin.firestore.FieldValue;
  const gameType = canonicalGameId(req.gameType);
  const matchId = String(req.matchId || '').replace(/[^\w.-]/g, '').slice(0, 120);
  if (!gameType || !matchId) {
    const err = new Error('Invalid placement');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }
  const matchRef = db.collection('dangalMatches').doc(matchId);
  const existing = await matchRef.get();
  if (existing.exists) return Object.assign({ duplicate: true }, existing.data()?.payload || {});

  let ranking = (req.ranking || []).map(String).filter((id, i, a) => isPersistableUid(id) && a.indexOf(id) === i);
  const n = ranking.length;
  let forfeits = Array.isArray(req.forfeits) ? req.forfeits.map(String) : [];
  const stayer = req.stayer ? String(req.stayer) : '';
  if (stayer && ranking.indexOf(stayer) >= 0) {
    // Everyone walked out; the last to leave stayed while the others forfeited → they take first.
    forfeits = forfeits.filter((id) => id !== stayer);
    ranking = [stayer].concat(ranking.filter((id) => id !== stayer));
  }
  // Every human forfeited (both gone) → void: no stake moves.
  const draw = !!req.draw || (n >= 2 && ranking.every((id) => forfeits.indexOf(id) >= 0));
  let stake = n >= 2 ? Math.max(0, Math.min(MAX_STAKE, Math.floor(Number(req.stake) || 0))) : 0;
  if (stake && !draw) {
    // Everyone antes the same amount, capped by the poorest seat so the pot is always covered.
    for (const id of ranking) stake = Math.min(stake, Math.floor((await getWallet(db, admin, id)).balance));
    stake = Math.max(0, stake);
  }
  const teamWinners = req.teams && Array.isArray(req.teams.winners) ? req.teams.winners.map(String) : null;
  const deltas = teamWinners ? null : placementStakeDeltas(n, stake, { draw });
  if (deltas) {
    // A forfeited seat never profits: any share it would get goes to the best finisher who stayed.
    const best = ranking.findIndex((id) => forfeits.indexOf(id) < 0);
    ranking.forEach((id, k) => {
      if (forfeits.indexOf(id) >= 0 && deltas[k] > 0 && best >= 0) {
        deltas[best] += deltas[k];
        deltas[k] = 0;
      }
    });
  }
  const dayKey = new Date().toISOString().slice(0, 10);
  const batch = db.batch();
  const players = {};
  for (let k = 0; k < n; k++) {
    const uid = ranking[k];
    const won = !draw && forfeits.indexOf(uid) < 0 && (teamWinners ? teamWinners.indexOf(uid) >= 0 : k === 0);
    const stakeDelta = teamWinners ? (stake ? (won ? stake : -stake) : 0) : deltas[k];
    const side = await settleSide(
      db,
      FieldValue,
      uid,
      {
        gameType,
        won,
        isDraw: draw,
        eloDelta: 0,
        rating: null,
        stake,
        stakeDelta,
        resultTag: draw ? 'draw' : won ? 'win' : 'place_' + (k + 1),
        dayKey,
        matchId,
      },
      batch
    );
    players[uid] = { place: draw ? 1 : k + 1, won, chipDelta: side.chipDelta, chips: side.chips, achievements: side.achievements };
    const rolls = (req.rolls && req.rolls[uid]) || [];
    if (rolls.length) {
      const inc = { total: FieldValue.increment(0), updatedAt: FieldValue.serverTimestamp() };
      let total = 0;
      [1, 2, 3, 4, 5, 6].forEach((f) => {
        const c = rolls.filter((v) => Number(v) === f).length;
        total += c;
        if (c) inc['f' + f] = FieldValue.increment(c);
      });
      inc.total = FieldValue.increment(total);
      batch.set(db.collection('users').doc(uid).collection('diceStats').doc('lifetime'), inc, { merge: true });
    }
  }
  const payload = { gameType, matchId, stake, draw, players };
  batch.create(matchRef, { gameType, ranking, stake, draw, payload, at: FieldValue.serverTimestamp() });
  try {
    await batch.commit();
  } catch (e) {
    const exists = e && (e.code === 6 || e.code === 'already-exists' || /already exists/i.test(String(e.message || '')));
    if (!exists) throw e;
    const again = await matchRef.get();
    return Object.assign({ duplicate: true }, (again.exists && again.data()?.payload) || {});
  }
  return payload;
}

module.exports = {
  STARTING_CHIPS,
  PLACEMENT_SHARES,
  placementStakeDeltas,
  resolvePlacement,
  canonicalGameId,
  isRetiredGameId,
  RETIRED_GAME_IDS,
  computeEloDelta,
  getWallet,
  ensureWallet,
  resolveGame,
  ACHIEVEMENTS,
  RATED,
  SERVER_SETTLED,
  RATING_BUCKETS,
  weekKey,
};
