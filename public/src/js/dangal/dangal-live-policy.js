/**
 * Dangal Live edge-case policy — one object per Live game (defaults + overrides), shared by the
 * client transport (dangal-live.js, party-kit.js) and the server engines (penalty / poker / party).
 * Pure functions only: every decision takes explicit state + server time, so it is testable and
 * never trusts a phone clock.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DangalLivePolicy = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Bump when the Live sync schema changes; older clients are asked to refresh instead of desyncing. */
  const PROTOCOL = 2;

  const DEFAULTS = Object.freeze({
    reconnectMs: 60000,
    warnMs: 12000,
    heartbeatMs: 20000,
    turnMs: 0, // 0 = the game has no shared turn clock
    bankMs: 0,
    afk: Object.freeze({ action: 'pass', maxMisses: 3 }),
    abandon: Object.freeze({ winner: 'remaining', chips: 'stake_to_winner', rated: true }),
    dualLeave: 'void_refund',
    softDisconnectOnHide: true,
    singleSeat: true,
    draw: false,
    resign: true,
    rematch: Object.freeze({ swapSides: true, sameVariants: true }),
    spectate: false,
    versionCheck: true,
  });

  /** Game-specific tuning. Engines keep their shipped timings here until their own P-prompt. */
  const OVERRIDES = {
    chess: { draw: true, spectate: true, afk: { action: 'clock', maxMisses: 1 } },
    // Dangal P3 room games (server-lib/classics-rooms.js): turn clock → auto-play; after maxMisses a
    // bot takes the seat (Ludo / Snakes) or the game is forfeited (Tic-Tac-Toe). Rematch rotates seats.
    ttt: { turnMs: 30000, afk: { action: 'auto_play', maxMisses: 3 }, leave: 'forfeit' },
    snakes: { turnMs: 15000, afk: { action: 'auto_play', maxMisses: 3 }, leave: 'bot_takeover' },
    ludo: { turnMs: 20000, afk: { action: 'auto_play', maxMisses: 3 }, leave: 'bot_takeover' },
    // Dangal P4 Oh No! (server-lib/ohno-engine.js): turn clock → auto-draw then pass; after
    // maxMisses (or on leave) a bot finishes the seat so the table can play on.
    uno: { turnMs: 20000, afk: { action: 'auto_draw', maxMisses: 3 }, leave: 'bot_takeover' },
    // Dangal P5 Scribble (server-lib/scribble-engine.js): pick timeout → auto-pick; the maxMisses-th
    // missed pick in a row skips the turn instead. Drawer disconnect / leave → turn skipped.
    scribble: { afk: { action: 'auto_pick', maxMisses: 3 }, leave: 'skip_turn', resign: false, spectate: false },
    // Dangal P6 Quiz Muqabala (server-lib/quiz-engine.js): a missed question is simply no answer (no
    // forfeit while online). Duel: leaving, or offline past reconnectMs, forfeits (rated). Party plays on.
    quiz: {
      reconnectMs: 60000,
      afk: { action: 'no_answer', maxMisses: 99 },
      leave: 'forfeit',
      abandon: { winner: 'remaining', chips: 'none', rated: true },
      resign: true,
      rematch: { swapSides: false, sameVariants: true },
    },
    // Dangal P7 Carrom (server-lib/carrom-engine.js): 20s shot clock (ICF Law 50 is 15s; +5s for touch
    // aiming). A missed shot is a foul (Law 64 — penalty man + turn passes); 3 misses in a row forfeit.
    // Leaving forfeits (ICF Law XVII); in doubles the whole team loses.
    carrom: { turnMs: 20000, placeMs: 15000, afk: { action: 'foul', maxMisses: 3 }, leave: 'forfeit' },
    // Dangal P8 Rummy (server-lib/rummy-engine.js): 30s turn + a 30s extra-time bank per match; 45s to
    // show groups after a declaration (then the server groups for you). A missed turn auto-plays
    // (draw + throw); the second in a row auto-drops (Deals has no drop → full count; Gin → forfeit).
    rummy: { reconnectMs: 90000, turnMs: 30000, bankMs: 30000, meldMs: 45000, afk: { action: 'auto_drop', maxMisses: 2 }, leave: 'full_count', rematch: { swapSides: false, sameVariants: true } },
    // Dangal P8 Teen Patti (server-lib/teenpatti-engine.js): 20s turn + 20s bank; timeout packs. Two
    // timeouts in a row sit you out (auto-pack) until you tap I'm back.
    teenpatti: { reconnectMs: 90000, turnMs: 20000, bankMs: 20000, afk: { action: 'fold', maxMisses: 2 }, leave: 'pack', abandon: { winner: 'none', chips: 'stack_returns', rated: false }, dualLeave: 'table_continues', resign: false, rematch: { swapSides: false, sameVariants: true } },
    // Dangal P9 Bluff (server-lib/bluff-engine.js): 25s turn; a missed turn passes (Follow the rank)
    // or plays the smallest legal card; 3 misses in a row — or leaving — hands the seat to a bot.
    // The challenge window (3/5/8s) is a room setting, not a turn clock.
    bluff: { reconnectMs: 60000, turnMs: 25000, afk: { action: 'pass_or_smallest', maxMisses: 3 }, leave: 'bot_takeover', resign: false, rematch: { swapSides: false, sameVariants: true } },
    // Dangal P9 Tambola (server-lib/tambola-engine.js): no turns — the draw never waits for anyone.
    // Missing a number is on you (daubs are yours); leaving keeps your tickets in play but you can't claim.
    tambola: { reconnectMs: 120000, afk: { action: 'none', maxMisses: 99 }, leave: 'tickets_idle', abandon: { winner: 'none', chips: 'pot_shares', rated: false }, dualLeave: 'room_continues', resign: false, spectate: true, rematch: { swapSides: false, sameVariants: true } },
    // Dangal P10/P11 Street Cricket (server-lib/cricket-engine.js): 12s to plan + stop the meter, else
    // the server bowls a stock ball; no swing = an auto-defend. Toss call / choice time out to heads /
    // bat. Three missed turns in a row (any role) or leaving forfeits. Spectators read the live pub.
    streetcricket: { reconnectMs: 90000, turnMs: 12000, afk: { action: 'auto_play', maxMisses: 3 }, leave: 'forfeit', spectate: true, rematch: { swapSides: true, sameVariants: true } },
    badminton: { afk: { action: 'auto_play', maxMisses: 3 } },
    // Server-resolved engines (H2 / H3): shipped timings stay the policy until their tuning prompt.
    penalty: { reconnectMs: 90000, turnMs: 20000, afk: { action: 'random_pick', maxMisses: 99 }, rematch: { swapSides: true, sameVariants: true } },
    poker: {
      reconnectMs: 90000,
      turnMs: 20000,
      bankMs: 30000,
      afk: { action: 'check_or_fold', maxMisses: 2 },
      abandon: { winner: 'none', chips: 'stack_returns', rated: false },
      dualLeave: 'table_continues',
      resign: false,
      rematch: { swapSides: false, sameVariants: true },
    },
    // Party-kit Room mode: absent players are skipped; the room continues while 2+ remain.
    party: {
      reconnectMs: 45000,
      afk: { action: 'auto_skip', maxMisses: 99 },
      abandon: { winner: 'none', chips: 'none', rated: false },
      dualLeave: 'room_continues',
      singleSeat: true,
      resign: false,
      rematch: { swapSides: false, sameVariants: true },
      spectate: true,
    },
  };
  ['imposter', 'rajamantri', 'charades', 'mostlikely', 'werewolf'].forEach((id) => (OVERRIDES[id] = OVERRIDES.party));

  const LIVE_GAMES = [
    'chess', 'ttt', 'snakes', 'ludo', 'uno', 'scribble', 'quiz', 'carrom', 'rummy', 'teenpatti', 'bluff',
    'tambola', 'streetcricket', 'badminton', 'penalty', 'poker',
    'imposter', 'rajamantri', 'charades', 'mostlikely', 'werewolf',
  ];

  function merge(base, over) {
    const out = Object.assign({}, base);
    Object.keys(over || {}).forEach((k) => {
      const v = over[k];
      out[k] = v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' ? Object.assign({}, base[k], v) : v;
    });
    return out;
  }

  function policyFor(gameId) {
    const id = String(gameId || '').toLowerCase();
    return Object.freeze(merge(DEFAULTS, OVERRIDES[id] || {}));
  }

  /** Server clock from a client: Date.now() + RTDB .info/serverTimeOffset. */
  function serverNow(offsetMs, localNow) {
    return (localNow == null ? Date.now() : localNow) + (Number(offsetMs) || 0);
  }

  /**
   * Opponent connection state. `presence` = { at: serverMs, online }.
   * A hidden tab / locked screen is a soft disconnect: the clock starts, nothing is forfeited early.
   */
  function reconnectStatus(presence, now, policy) {
    const p = presence || {};
    const pol = policy || DEFAULTS;
    const at = Number(p.at) || 0;
    // Online = explicit online flag and a heartbeat within two beats. Missing heartbeats count
    // from the last beat, so a killed app starts the same reconnect clock as a clean leave.
    const quiet = at > 0 && now - at > pol.heartbeatMs * 2;
    const online = p.online !== false && !quiet;
    const offlineMs = online || !at ? 0 : Math.max(0, now - at);
    return {
      online,
      offlineMs,
      warn: !online && offlineMs >= pol.warnMs,
      msLeft: online ? pol.reconnectMs : Math.max(0, pol.reconnectMs - offlineMs),
      expired: !online && at > 0 && offlineMs >= pol.reconnectMs,
    };
  }

  /**
   * Who wins when someone is gone. `left` = uids that left or expired.
   * Both gone → void + refund (no winner, stakes return, unrated).
   */
  function abandonOutcome(players, left, policy) {
    const pol = policy || DEFAULTS;
    const gone = (players || []).filter((u) => (left || []).indexOf(u) >= 0);
    const stay = (players || []).filter((u) => gone.indexOf(u) < 0);
    if (!gone.length) return { status: 'playing' };
    if (!stay.length) return { status: 'void', winner: null, refund: true, rated: false };
    if (pol.dualLeave === 'room_continues' || pol.dualLeave === 'table_continues') {
      return { status: stay.length >= 2 ? 'playing' : 'ended', skip: gone, winner: null, refund: false, rated: false };
    }
    return { status: 'forfeit', winner: stay.length === 1 ? stay[0] : null, loser: gone[0], refund: false, rated: !!pol.abandon.rated };
  }

  /** AFK: one more missed turn. Returns the auto-action, or a forfeit after maxMisses. */
  function afkStep(misses, policy) {
    const pol = policy || DEFAULTS;
    const n = (Number(misses) || 0) + 1;
    if (n >= pol.afk.maxMisses) return { misses: n, forfeit: true, action: pol.afk.action };
    return { misses: n, forfeit: false, action: pol.afk.action };
  }

  /**
   * One active seat per account. `seat` = { dev, at } currently holding it.
   * A second device becomes a spectator unless the holder has gone quiet past the reconnect window.
   */
  function claimSeat(seat, deviceId, now, policy) {
    const pol = policy || DEFAULTS;
    const s = seat || null;
    if (!pol.singleSeat || !s || !s.dev || s.dev === deviceId) return { role: 'player', seat: { dev: deviceId, at: now } };
    if (now - (Number(s.at) || 0) >= pol.reconnectMs) return { role: 'player', seat: { dev: deviceId, at: now }, tookOver: true };
    return { role: 'spectator', seat: s };
  }

  function versionMismatch(matchProtocol) {
    return matchProtocol != null && Number(matchProtocol) !== PROTOCOL;
  }

  /** Deterministic ledger / idempotency key — retries of the same settlement collide on it. */
  function settlementKey(matchId, uid) {
    return String(matchId || '').replace(/[^\w.-]/g, '').slice(0, 120) + (uid ? '_' + String(uid).slice(0, 128) : '');
  }

  /** Rematch keeps the locked variants and swaps sides when the game has sides. */
  function rematchSeats(players, policy) {
    const pol = policy || DEFAULTS;
    const list = (players || []).slice();
    return pol.rematch.swapSides && list.length === 2 ? [list[1], list[0]] : list;
  }

  /** Rooms bigger than this use designated tickers instead of every phone nudging the clock. */
  const BIG_ROOM = 8;
  const TICK_LEADS = 3;

  /**
   * Who nudges a room's server clock. Small rooms: everyone (jitter spreads it). Big rooms (Tambola):
   * the host and the first two other seats tick on time; everyone else waits 4–8 s past the deadline
   * and only ticks if the leads are gone — so a draw costs ~3 calls, not 100.
   * @returns {{ lead: boolean, delayMs: number }}
   */
  function tickRole(pub, uid) {
    const players = (pub && pub.players) || {};
    const ids = Object.keys(players)
      .filter((id) => !players[id].left && !players[id].pending)
      .sort((a, b) => (players[a].seat || 0) - (players[b].seat || 0));
    if (ids.length <= BIG_ROOM) return { lead: true, delayMs: 0 };
    const host = pub.host && ids.indexOf(pub.host) >= 0 ? [pub.host] : [];
    const leads = host.concat(ids.filter((id) => id !== pub.host)).slice(0, TICK_LEADS);
    if (leads.indexOf(uid) >= 0) return { lead: true, delayMs: 0 };
    const k = Math.max(0, ids.indexOf(uid));
    return { lead: false, delayMs: 4000 + (k % 5) * 1000 };
  }

  /** Friendly countdown text for the opponent-reconnecting banner. */
  function countdownText(msLeft) {
    const s = Math.max(0, Math.ceil((Number(msLeft) || 0) / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  return {
    PROTOCOL,
    DEFAULTS,
    OVERRIDES,
    LIVE_GAMES,
    policyFor,
    serverNow,
    reconnectStatus,
    abandonOutcome,
    afkStep,
    claimSeat,
    versionMismatch,
    settlementKey,
    rematchSeats,
    countdownText,
    BIG_ROOM,
    tickRole,
  };
});
