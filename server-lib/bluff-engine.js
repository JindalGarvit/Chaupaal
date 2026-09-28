/**
 * Dangal P9 — Bluff Live tables on the party-room engine (GAMES.bluff). 3–8 seats, bots can fill.
 *
 * - Server authority: CSPRNG shuffle + deal here; every hand and every face-down pile card lives in
 *   `server` (Admin only). `pub.state` is BluffCore.publicView(): card counts, the claims, and only
 *   the cards turned over by a challenge. Your own hand reaches games/bluff/{code}/secrets/{uid}.
 * - Every play, pass and call is validated by BluffCore.apply() inside the room transaction. The
 *   challenge window is server-timed (3 / 5 / 8 s); the first call to commit wins the race and any
 *   later call for the same play gets `too_late`.
 * - Bots decide the moment a play lands (BluffCore.windowPlan): the earliest bot caller is armed with
 *   a human-like delay (the room deadline), the rest let it go. Humans can still beat the bot.
 * - Turn clock (Live policy): a missed turn auto-plays the smallest legal move (one card, honest if
 *   possible — or a pass in Follow the rank); after maxMisses, or on leave, a bot takes the seat and
 *   the player forfeits. Offline past the reconnect window → turns auto-play straight away.
 * - Chips: optional stake at an all-human table, settled by finishing place (resolvePlacement).
 *   Bots at the table → no stakes. Unrated.
 */
'use strict';

const crypto = require('crypto');
const Core = require('../public/src/js/games/bluff-core.js');
const Policy = require('../public/src/js/dangal/dangal-live-policy.js');

const POL = Policy.policyFor('bluff');
const TURN_MS = POL.turnMs || 25000;
const BOT_MS = 1100;
const AWAY_MS = 1500;
const REVEAL_MS = 2800;
const STAKES = [0, 10, 25, 50, 100];

const REASONS = {
  not_your_turn: 'Not your turn',
  window_open: 'Wait — the Bluff window is open',
  phase: 'Not now',
  no_cards: 'Pick at least one card',
  too_many: 'Too many cards for one play',
  no_card: 'You don’t hold that card',
  wrong_rank: 'Claim the current rank',
  pick_rank: 'Pick a rank to claim',
  no_pass: 'No passing in Sequence — you must play',
  must_lead: 'You lead — play at least one card',
  too_late: 'Too late — someone called first',
  own_play: 'You can’t call your own play',
  not_in_game: 'You’re out of cards — sit back and watch',
  over: 'This game has finished',
};

const cryptoRng = () => crypto.randomInt(0, 0x100000000) / 0x100000000;

function pickStake(v) {
  const n = Math.floor(Number(v) || 0);
  return STAKES.indexOf(n) >= 0 ? n : 0;
}

function createBluffAdapter({ err, rng, botRng }) {
  const shuffleRng = typeof rng === 'function' ? rng : cryptoRng;
  const R = typeof botRng === 'function' ? botRng : Math.random;

  function mergeSettings(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const s = Core.mergeSettings(r);
    s.bots = Math.max(0, Math.min(Core.MAX_PLAYERS - 1, Math.floor(Number(r.bots) || 0)));
    s.botLevel = Core.LEVELS.indexOf(r.botLevel) >= 0 ? r.botLevel : 'normal';
    s.stake = pickStake(r.stake);
    return s;
  }

  const seatOf = (s, uid) => (s && s.pub ? s.pub.seats.findIndex((x) => x.id === uid && !x.bot) : -1);
  const botName = (i, level) => 'Bot ' + (i + 1) + ' · ' + level.charAt(0).toUpperCase() + level.slice(1);
  const human = (room, x) => !!x && !/^bot\d+$/.test(x.id) && !!room.pub.players[x.id];

  function syncPrivate(room) {
    const st = room.server.pub;
    room.secrets = {};
    st.seats.forEach((x, i) => {
      if (x.bot || !room.pub.players[x.id]) return;
      room.secrets[x.id] = Object.assign({ roundNo: room.pub.roundNo }, Core.privateView(st, i));
    });
  }

  function queueSettlement(room) {
    const s = room.server;
    const st = s.pub;
    if (!st.over || s.settleReq) return;
    const ranking = st.ranking.map((i) => st.seats[i]).filter((x) => human(room, x)).map((x) => x.id);
    const forfeits = st.seats.filter((x) => human(room, x) && x.forfeit).map((x) => x.id);
    room.pub.settlement = { status: 'pending' };
    const top = ranking.find((id) => forfeits.indexOf(id) < 0);
    if (top) room.pub.scores[top] = (Number(room.pub.scores[top]) || 0) + 1;
    s.settleReq = { matchId: s.matchId, game: 'bluff', ranking, teams: null, stake: s.stake || 0, draw: false, rolls: {}, forfeits, stayer: null, done: false };
  }

  /**
   * A play just landed: bots decide now. The earliest bot caller is armed as the room deadline. With
   * no bot caller, a no-op checkpoint is armed at a bot-like delay instead, so the public deadline
   * never tells a phone whether a bot is about to call.
   */
  function armWindow(s, now) {
    const st = s.pub;
    s.botCall = null;
    if (st.phase !== 'window') return;
    s.windowEnds = now + st.windowMs;
    const plan = Core.windowPlan(st, R);
    plan.letgo.forEach((i) => {
      if (st.phase === 'window') Core.apply(st, i, { type: 'letgo', no: st.last.no });
    });
    if (st.phase !== 'window') return;
    if (plan.caller >= 0) s.botCall = { seat: plan.caller, delay: plan.delay, no: st.last.no };
    else s.botCall = { seat: -1, delay: Math.max(400, Math.min(st.windowMs - 300, Math.round(800 + R() * 2000))), no: st.last.no };
  }

  function seatAction(ctx, type, extra) {
    const i = seatOf(ctx.room.server, ctx.uid);
    if (i < 0) throw err('not_seated', 'You’re watching this game');
    return ctx.act(Object.assign({ type: 'act', seat: i, now: ctx.now, a: Object.assign({ type }, extra || {}) })) || {};
  }

  /** A missed turn (timed out, or offline): auto-play; the maxMisses-th in a row hands the seat to a bot. */
  function missTurn(room, ctx, seat) {
    const who = room.server.pub.seats[seat];
    const step = Policy.afkStep(who.afk || 0, POL);
    ctx.act({ type: 'auto', seat }, true);
    who.afk = step.misses;
    if (step.forfeit) ctx.act({ type: 'takeover', seat, reason: 'afk' }, true);
  }

  function allHumansGone(room) {
    const st = room.server.pub;
    return !st.seats.some((x) => !x.bot && human(room, x) && !room.pub.players[x.id].left);
  }

  return {
    core: Core,
    min: 1,
    max: Core.MAX_PLAYERS,
    mergeSettings,
    deal(room, ids, ctx) {
      const set = mergeSettings(room.pub.settings);
      const humans = ids.slice(0, Core.MAX_PLAYERS);
      const bots = Math.max(0, Math.min(set.bots, Core.MAX_PLAYERS - humans.length));
      if (humans.length + bots < Core.MIN_PLAYERS) throw err('need_players', 'Bluff needs 3 players — add bots or invite friends');
      const players = humans.map((id) => ({ id, name: room.pub.players[id].name }));
      for (let i = 0; i < bots; i++) players.push({ id: 'bot' + (i + 1), name: botName(i, set.botLevel), bot: true, level: set.botLevel });
      const st = Core.newGame(players, set, shuffleRng, { dealer: (ctx.roundNo - 1) % players.length });
      if (st.error) throw err('need_players', 'Bluff needs 3–8 players');
      room.server = {
        settings: set,
        pub: st,
        stake: bots > 0 || humans.length < 2 ? 0 : set.stake,
        botCall: null,
        matchId: 'bluff_' + String(room.pub.host || '').slice(0, 10) + '_' + (room.pub.createdAt || ctx.now) + '_' + ctx.roundNo,
        settleReq: null,
      };
      room.pub.settlement = null;
      syncPrivate(room);
    },
    view: (s) => Object.assign(Core.publicView(s.pub), { stake: s.stake || 0, windowEnds: s.pub.phase === 'window' ? s.windowEnds || 0 : 0 }),
    phaseKey: (s) => (s.pub.over ? 'over:' + s.pub.seq : [s.pub.phase, s.pub.turn, s.pub.playNo, s.pub.reveal ? s.pub.reveal.no : 0, s.botCall ? 'b' : ''].join(':')),
    deadlineMs(s) {
      const st = s.pub;
      if (st.over) return 0;
      if (st.phase === 'reveal') return REVEAL_MS;
      if (st.phase === 'window') {
        if (s.botCall) return s.botCall.delay;
        return s.windowEnds && s.clock ? Math.max(50, s.windowEnds - s.clock) : st.windowMs;
      }
      const who = st.seats[st.turn];
      if (!who) return TURN_MS;
      if (who.bot) return BOT_MS;
      return TURN_MS;
    },
    apply(room, action) {
      const s = room.server;
      const st = s.pub;
      if (st.over) return { error: 'over' };
      const now = Number(action.now) || s.clock || Date.now();
      s.clock = now;
      let out = {};
      switch (action.type) {
        case 'act': {
          const seat = Number(action.seat);
          out = Core.apply(st, seat, action.a || {});
          if (!out.error && action.a && action.a.type === 'play') armWindow(s, now);
          break;
        }
        case 'bot': {
          const seat = st.turn;
          if (st.phase !== 'play' || seat < 0 || !st.seats[seat].bot) return { error: 'phase' };
          out = Core.apply(st, seat, Core.botAction(st, seat, R) || Core.autoAction(st, seat));
          if (out.error) out = Core.apply(st, seat, Core.autoAction(st, seat));
          if (!out.error) armWindow(s, now);
          break;
        }
        case 'botcall': {
          const bc = s.botCall;
          if (!bc || st.phase !== 'window' || !st.last || st.last.no !== bc.no) return { error: 'phase' };
          if (bc.seat < 0) {
            s.botCall = null;
            return {};
          }
          out = Core.apply(st, bc.seat, { type: 'call', no: bc.no });
          break;
        }
        case 'close':
          out = Core.apply(st, -1, { type: 'close' });
          break;
        case 'resume':
          out = Core.apply(st, -1, { type: 'resume' });
          break;
        case 'auto': {
          const seat = Number(action.seat);
          const a = Core.autoAction(st, seat);
          if (!a) return { error: 'phase' };
          out = Core.apply(st, seat, a);
          if (!out.error && a.type === 'play') armWindow(s, now);
          break;
        }
        case 'takeover': {
          Core.takeOver(st, Number(action.seat), action.reason || 'afk');
          st.seq++;
          break;
        }
        case 'abandon':
          Core.endGame(st);
          st.seq++;
          break;
        default:
          return { error: 'bad_action' };
      }
      if (out && out.error) return Object.assign({}, out, { reason: REASONS[out.error] || out.error });
      if (st.phase !== 'window') s.botCall = null;
      return out || {};
    },
    afterChange(room) {
      syncPrivate(room);
      queueSettlement(room);
    },
    /** Offline past the reconnect window: that player's turns auto-play at once. */
    absent(room, ctx) {
      const st = room.server.pub;
      if (st.over || st.phase !== 'play') return;
      const who = st.seats[st.turn];
      if (who && !who.bot && ctx.gone(who.id)) ctx.act({ type: 'auto', seat: st.turn, now: ctx.now }, true);
    },
    timeout(room, ctx) {
      const s = room.server;
      const st = s.pub;
      if (st.over) return;
      const now = ctx.now;
      if (st.phase === 'window') return ctx.act(s.botCall ? { type: 'botcall', now } : { type: 'close', now }, true);
      if (st.phase === 'reveal') return ctx.act({ type: 'resume', now }, true);
      const seat = st.turn;
      const who = st.seats[seat];
      if (!who) return;
      if (who.bot) return ctx.act({ type: 'bot', now }, true);
      const step = Policy.afkStep(who.afk || 0, POL);
      ctx.act({ type: 'auto', seat, now }, true);
      who.afk = step.misses;
      if (step.forfeit) ctx.act({ type: 'takeover', seat, reason: 'afk', now }, true);
    },
    betweenRounds: (s) => !!s.pub.over,
    canNext: () => false,
    newGameOnStart: () => false,
    onJoinPlaying: () => true,
    /** Leaving: a bot takes your seat (and your hand) so the table plays on; you forfeit. */
    onLeave(room, uid) {
      const s = room.server;
      const i = seatOf(s, uid);
      if (i < 0 || s.pub.over) return;
      Core.takeOver(s.pub, i, 'left');
      s.pub.seq++;
      if (allHumansGone(room)) {
        Core.endGame(s.pub);
        s.pub.seq++;
      }
    },
    ops: {
      play: (ctx) =>
        seatAction(ctx, 'play', {
          cards: (Array.isArray(ctx.args.cards) ? ctx.args.cards : []).slice(0, 8).map((c) => String(c).slice(0, 3)),
          rank: ctx.args.rank == null ? null : Math.floor(Number(ctx.args.rank)),
        }),
      pass: (ctx) => seatAction(ctx, 'pass'),
      call(ctx) {
        const out = seatAction(ctx, 'call', { no: ctx.args.no == null ? null : Number(ctx.args.no) });
        return { truth: !!out.truth, taker: out.taker };
      },
      letgo: (ctx) => seatAction(ctx, 'letgo', { no: ctx.args.no == null ? null : Number(ctx.args.no) }),
    },
    lobbyOps: {
      setBots(ctx) {
        if (!ctx.isHost) throw err('host_only', 'Only the host can add bots');
        const p = ctx.room.pub;
        p.settings = mergeSettings(Object.assign({}, p.settings, { bots: ctx.args.bots, botLevel: ctx.args.botLevel || p.settings.botLevel }));
        return { settings: p.settings };
      },
    },
    hydrate(s) {
      s.settings = mergeSettings(s.settings);
      s.pub = Core.hydrate(s.pub);
      s.stake = Number(s.stake) || 0;
      s.botCall = s.botCall && s.botCall.seat != null ? { seat: Number(s.botCall.seat), delay: Number(s.botCall.delay) || 0, no: Number(s.botCall.no) || 0 } : null;
      s.windowEnds = Number(s.windowEnds) || 0;
      s.clock = Number(s.clock) || 0;
      if (s.settleReq) {
        s.settleReq.ranking = s.settleReq.ranking || [];
        s.settleReq.forfeits = s.settleReq.forfeits || [];
        s.settleReq.rolls = s.settleReq.rolls || {};
        s.settleReq.done = !!s.settleReq.done;
      }
    },
    pendingSettlement: (s) => (s && s.settleReq && !s.settleReq.done ? s.settleReq : null),
  };
}

module.exports = { createBluffAdapter, cryptoRng, REASONS };
