/**
 * Server-trust Dangal economy: virtual chips, Elo, achievements, weekly scores.
 * Called from api/media-config.js (no extra Vercel function).
 */
const STARTING_CHIPS = 1000;
const MAX_STAKE = 500;
const DAILY_CHIP_RESOLVES = 60;
const RATED = new Set(['chess', 'fiveinrow', 'ttt', 'streetcricket', 'gullykick', 'quiz']);

const ALIASES = {
  snakesladders: 'snakes',
  tictactoe: 'ttt',
  ohnocards: 'uno',
  muqabala: 'quiz',
  fiveinarow: 'fiveinrow',
  shabdfive: 'wordguess',
  kakuro: 'ankjod',
  cricket: 'streetcricket',
  football: 'gullykick',
};

const ACHIEVEMENTS = {
  first_game: { label: 'Pehla Qadam', desc: 'Play your first Dangal game', chips: 100 },
  first_win: { label: 'Pehli Jeet', desc: 'Win your first game', chips: 150 },
  ten_games: { label: 'Khiladi', desc: 'Play 10 Dangal games', chips: 250 },
  fifty_games: { label: 'Ustaad', desc: 'Play 50 Dangal games', chips: 500 },
  hundred_games: { label: 'Dangal Guru', desc: 'Play 100 Dangal games', chips: 1000 },
  won_stake: { label: 'Raazi Tha', desc: 'Win a chip-staked game', chips: 100 },
  chess_first_win: { label: 'Pehli Chaal', desc: 'Win your first chess game', chips: 150 },
};

function canonicalGameId(id) {
  const raw = String(id || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '');
  return ALIASES[raw] || raw;
}

function kFactor(games) {
  return (Number(games) || 0) < 30 ? 20 : 10;
}

function computeEloDelta(eloA, gamesA, eloB, gamesB, scoreA) {
  const expA = 1 / (1 + Math.pow(10, ((eloB || 1200) - (eloA || 1200)) / 400));
  return Math.round(kFactor(gamesA) * (scoreA - expA));
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
  return out;
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
  const { gameType, won, isDraw, eloDelta, stake, resultTag, dayKey } = opts;
  const dailyRef = db.collection('users').doc(uid).collection('dailyCredits').doc(dayKey);
  const dailySnap = await dailyRef.get();
  const dailyCount = Number(dailySnap.data()?.resolves) || 0;
  const chipEligible = dailyCount < DAILY_CHIP_RESOLVES;

  const statsRef = db.collection('users').doc(uid).collection('gameStats').doc(gameType);
  const statsSnap = await statsRef.get();
  const stats = statsSnap.data() || {};
  const totalBefore = Number(stats.totalGames) || 0;
  const winsBefore = Number(stats.wins) || 0;
  const eloBefore = Number(stats.elo) || 1200;
  const isFirstWin = won && winsBefore === 0;

  const { ref: walletRef, data: wallet } = await ensureWallet(db, FieldValue, uid);
  let chipDelta = 0;
  if (chipEligible) {
    if (won) chipDelta += 25;
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
  });
  let achChips = 0;
  newKeys.forEach((k) => {
    achChips += ACHIEVEMENTS[k].chips;
  });

  batch.set(
    statsRef,
    {
      totalGames: totalEver,
      wins: winsBefore + (won ? 1 : 0),
      elo: RATED.has(gameType) ? eloBefore + eloDelta : eloBefore,
      lastResult: resultTag,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
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

async function resolveGame(db, admin, uid, body) {
  const FieldValue = admin.firestore.FieldValue;
  const gameType = canonicalGameId(body.gameType);
  if (!gameType || gameType.length > 40) {
    const err = new Error('Invalid gameType');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const rawResult = String(body.result || '').toLowerCase();
  const isDraw =
    !!body.isDraw || rawResult === 'draw' || rawResult === 'tie' || rawResult === 'stalemate';
  const won = !isDraw && (body.won === true || rawResult === 'win' || rawResult === 'won');
  const resultTag = (isDraw ? 'draw' : won ? 'win' : 'loss').slice(0, 40);

  const opponentUidRaw = body.opponentUid ? String(body.opponentUid).slice(0, 128) : '';
  const opponentUid = isPersistableUid(opponentUidRaw) && opponentUidRaw !== uid ? opponentUidRaw : '';
  const winnerUid = isDraw ? '' : String(body.winnerUid || (won ? uid : opponentUid || '')).slice(0, 128);
  const stake = Math.max(0, Math.min(MAX_STAKE, Math.floor(Number(body.stake) || 0)));

  const matchId = String(body.matchId || body.sessionId || '')
    .replace(/[^\w.-]/g, '')
    .slice(0, 120);
  const matchRef = matchId ? db.collection('dangalMatches').doc(matchId) : null;
  if (matchRef) {
    const matchSnap = await matchRef.get();
    if (matchSnap.exists) {
      const w = await getWallet(db, admin, uid);
      return Object.assign({ duplicate: true, chips: w.balance, matchId }, matchSnap.data()?.payload || {});
    }
  }
  const lockRef = matchId ? db.collection('users').doc(uid).collection('gameResolves').doc(matchId) : null;
  if (lockRef) {
    const lockSnap = await lockRef.get();
    if (lockSnap.exists) {
      const w = await getWallet(db, admin, uid);
      return Object.assign({ duplicate: true, chips: w.balance }, lockSnap.data()?.result || {});
    }
  }

  const reporterStats = await db.collection('users').doc(uid).collection('gameStats').doc(gameType).get();
  const oppStats = opponentUid
    ? await db.collection('users').doc(opponentUid).collection('gameStats').doc(gameType).get()
    : null;
  const rData = reporterStats.data() || {};
  const oData = (oppStats && oppStats.data()) || {};
  let eloDelta = 0;
  let oppEloDelta = 0;
  if (RATED.has(gameType) && opponentUid) {
    const scoreA = isDraw ? 0.5 : won ? 1 : 0;
    eloDelta = computeEloDelta(
      Number(rData.elo) || 1200,
      Number(rData.totalGames) || 0,
      Number(oData.elo) || 1200,
      Number(oData.totalGames) || 0,
      scoreA
    );
    oppEloDelta = -eloDelta;
  }

  const dayKey = new Date().toISOString().slice(0, 10);
  const batch = db.batch();
  const reporter = await settleSide(
    db,
    FieldValue,
    uid,
    { gameType, won, isDraw, eloDelta, stake, resultTag, dayKey },
    batch
  );

  if (opponentUid) {
    await settleSide(
      db,
      FieldValue,
      opponentUid,
      {
        gameType,
        won: !isDraw && !won,
        isDraw,
        eloDelta: oppEloDelta,
        stake,
        resultTag: isDraw ? 'draw' : won ? 'loss' : 'win',
        dayKey,
      },
      batch
    );
  }

  const payload = {
    gameType,
    won,
    isDraw,
    eloDelta,
    chips: reporter.chips,
    chipDelta: reporter.chipDelta,
    achievements: reporter.achievements,
    matchId: matchId || null,
    shared: !!opponentUid,
  };
  if (lockRef) batch.set(lockRef, { result: payload, at: FieldValue.serverTimestamp() });
  if (matchRef) {
    batch.set(matchRef, {
      gameType,
      reporterUid: uid,
      opponentUid: opponentUid || null,
      winnerUid: winnerUid || null,
      isDraw,
      payload,
      at: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  return payload;
}

module.exports = {
  STARTING_CHIPS,
  canonicalGameId,
  computeEloDelta,
  getWallet,
  resolveGame,
  ACHIEVEMENTS,
};
