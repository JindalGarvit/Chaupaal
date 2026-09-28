/**
 * Dangal ratings — Glicko-2 math shared by the server service (server-lib/dangal-ratings.js,
 * the only writer) and client display ("Provisional" badges, rated-game checks).
 * Ratings stay on the familiar 1200 scale: Glicko-2 is translation-invariant, so legacy Elo
 * numbers carry over unchanged and only gain a rating deviation (RD).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DangalRatingMath = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Rated heads-up titles. Tic-Tac-Toe is unrated quick-play (history kept, no updates). */
  const RATED = ['chess', 'streetcricket', 'quiz', 'penalty', 'carrom', 'badminton', 'rummy'];
  const BASE = 1200;
  const RD_NEW = 350;
  const RD_MIN = 50;
  const VOL_NEW = 0.06;
  const TAU = 0.5;
  const SCALE = 173.7178;
  const PROVISIONAL_GAMES = 10;
  const PROVISIONAL_RD = 110;
  const EPS = 0.000001;

  function isRated(gameId) {
    return RATED.indexOf(String(gameId || '').toLowerCase()) >= 0;
  }

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  /** Legacy Elo stats → Glicko-2 record (lazy migration; the Elo number is kept as-is). */
  function fromStats(stats) {
    const s = stats || {};
    if (s.rating && Number.isFinite(Number(s.rating.r))) {
      return {
        r: Number(s.rating.r),
        rd: clamp(Number(s.rating.rd) || RD_NEW, RD_MIN, RD_NEW),
        vol: Number(s.rating.vol) || VOL_NEW,
        games: Number(s.rating.games) || Number(s.totalGames) || 0,
      };
    }
    const games = Number(s.totalGames) || 0;
    return {
      r: Number(s.elo) || BASE,
      rd: clamp(RD_NEW - 25 * games, 80, RD_NEW),
      vol: VOL_NEW,
      games,
    };
  }

  function g(phi) {
    return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
  }
  function E(mu, muJ, phiJ) {
    return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
  }

  /**
   * One Glicko-2 rating period for `player` against `results` = [{ r, rd, score }].
   * Returns { r, rd, vol, games }.
   */
  function update(player, results) {
    const p = player;
    const mu = (p.r - BASE) / SCALE;
    const phi = p.rd / SCALE;
    const sigma = p.vol;
    if (!results || !results.length) {
      const phiStar = Math.sqrt(phi * phi + sigma * sigma);
      return { r: p.r, rd: clamp(phiStar * SCALE, RD_MIN, RD_NEW), vol: sigma, games: p.games };
    }
    let vInv = 0;
    let deltaSum = 0;
    results.forEach((o) => {
      const muJ = (o.r - BASE) / SCALE;
      const phiJ = o.rd / SCALE;
      const e = E(mu, muJ, phiJ);
      vInv += g(phiJ) * g(phiJ) * e * (1 - e);
      deltaSum += g(phiJ) * (o.score - e);
    });
    const v = 1 / vInv;
    const delta = v * deltaSum;

    // Volatility (Illinois iteration, Glickman 2012).
    const a = Math.log(sigma * sigma);
    const f = (x) => {
      const ex = Math.exp(x);
      return (ex * (delta * delta - phi * phi - v - ex)) / (2 * Math.pow(phi * phi + v + ex, 2)) - (x - a) / (TAU * TAU);
    };
    let A = a;
    let B;
    if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v);
    else {
      let k = 1;
      while (f(a - k * TAU) < 0 && k < 100) k++;
      B = a - k * TAU;
    }
    let fA = f(A);
    let fB = f(B);
    let guard = 0;
    while (Math.abs(B - A) > EPS && guard++ < 100) {
      const C = A + ((A - B) * fA) / (fB - fA);
      const fC = f(C);
      if (fC * fB <= 0) {
        A = B;
        fA = fB;
      } else fA = fA / 2;
      B = C;
      fB = fC;
    }
    const sigmaNew = Math.exp(A / 2);
    const phiStar = Math.sqrt(phi * phi + sigmaNew * sigmaNew);
    const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
    const muNew = mu + phiNew * phiNew * deltaSum;
    return {
      r: muNew * SCALE + BASE,
      rd: clamp(phiNew * SCALE, RD_MIN, RD_NEW),
      vol: sigmaNew,
      games: (p.games || 0) + results.length,
    };
  }

  /** Head-to-head result. scoreA: 1 win, 0.5 draw, 0 loss. Deltas are rounded display points. */
  function rateMatch(a, b, scoreA) {
    const nextA = update(a, [{ r: b.r, rd: b.rd, score: scoreA }]);
    const nextB = update(b, [{ r: a.r, rd: a.rd, score: 1 - scoreA }]);
    return {
      a: nextA,
      b: nextB,
      deltaA: Math.round(nextA.r) - Math.round(a.r),
      deltaB: Math.round(nextB.r) - Math.round(b.r),
    };
  }

  function isProvisional(rec) {
    const r = rec || {};
    return (Number(r.games) || 0) < PROVISIONAL_GAMES || (Number(r.rd) || RD_NEW) > PROVISIONAL_RD;
  }

  /**
   * Whether a finished match moves ratings: a rated title, two real accounts, never vs bots,
   * and friend-only private tables only when explicitly marked rated.
   */
  function shouldRate(ctx) {
    const c = ctx || {};
    if (!isRated(c.gameType)) return false;
    if (!c.opponentUid || c.vsBot || c.practice) return false;
    if (c.privateTable && c.rated !== true) return false;
    if (c.rated === false) return false;
    return true;
  }

  /** Fields written to users/{uid}/gameStats/{game}: `elo` stays for existing UI + leaderboards. */
  function statsFields(rec) {
    return {
      elo: Math.round(rec.r),
      rating: { r: Math.round(rec.r * 100) / 100, rd: Math.round(rec.rd * 100) / 100, vol: Math.round(rec.vol * 1e6) / 1e6, games: rec.games, v: 2 },
      provisional: isProvisional(rec),
    };
  }

  return {
    RATED,
    BASE,
    RD_NEW,
    PROVISIONAL_GAMES,
    isRated,
    fromStats,
    update,
    rateMatch,
    isProvisional,
    shouldRate,
    statsFields,
  };
});
