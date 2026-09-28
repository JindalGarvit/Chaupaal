/**
 * Oh No! party-room adapter (Dangal P4) — plugged into server-lib/party-deal.js GAMES as `uno`,
 * so rooms, invites, lobby, presence and ticks are the shared party engine.
 *
 * - Server authority: the deck is shuffled with the server CSPRNG and dealt here. The full state
 *   (hands, draw pile, Draw Four honesty) lives in `server` (Admin SDK only). `pub.state` is
 *   OhNoCore.publicView(): card counts only. Each hand goes to games/uno/{code}/secrets/{uid},
 *   readable only by that uid; a challenge peek is written only to the challenger's secret.
 * - Every play, Jump-In (first valid arrival wins, by `seq`), stack, challenge and catch is
 *   validated by OhNoCore.apply() inside the room transaction.
 * - Bots fill empty seats and play on the server; the deadline gets animation slack. If a bot
 *   forgets to call "Oh No!" the bot chain pauses so humans can catch it.
 * - Turn clock (Live policy): AFK → auto-draw, then pass; after maxMisses a bot takes the seat
 *   and forfeits its placement. Leaving mid-game → a bot finishes the seat.
 * - Match over → placement chips (dangal-economy.resolvePlacement) after the transaction commits.
 */
'use strict';

const crypto = require('crypto');
const OhNoCore = require('../public/src/js/games/ohno-core.js');
const Policy = require('../public/src/js/dangal/dangal-live-policy.js');
const { abandonStayer } = require('./classics-rooms.js');

const STAKES = [0, 10, 25, 50, 100];
const BOT_MS_PER_EVENT = 750;
const MAX_SLACK_MS = 20000;
const HOLD_MS = 3000;
const ROUND_GAP_MS = 15000;

const cryptoRng = () => crypto.randomInt(0, 0x100000000) / 0x100000000;

function pickStake(v) {
  const n = Math.floor(Number(v) || 0);
  return STAKES.indexOf(n) >= 0 ? n : 0;
}

function botStyle(persona, level) {
  try {
    const AI = require('./dangal-ai.js');
    const p = AI.FALLBACKS.botPersona({ gameId: 'uno', persona, level });
    if (p && p.style) return p.style;
  } catch (e) {
    /* fall through */
  }
  return (OhNoCore.PERSONAS[persona] || OhNoCore.PERSONAS.honest).style;
}

function createOhnoAdapter({ err, rng }) {
  const pol = Policy.policyFor('uno');
  const TURN_MS = pol.turnMs || 20000;
  const shuffleRng = typeof rng === 'function' ? rng : cryptoRng;

  function mergeSettings(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const s = OhNoCore.mergeSettings(r);
    s.bots = Math.max(0, Math.min(OhNoCore.MAX_PLAYERS - 1, Math.floor(Number(r.bots) || 0)));
    s.botLevel = OhNoCore.LEVELS.indexOf(r.botLevel) >= 0 ? r.botLevel : 'normal';
    s.botStyle = r.botStyle === 'bluffer' ? 'bluffer' : 'honest';
    s.stake = pickStake(r.stake);
    return s;
  }

  const seatOf = (s, uid) => (s && s.pub ? s.pub.seats.findIndex((x) => x.id === uid && !x.bot) : -1);
  const botName = (i, level) => 'Bot ' + (i + 1) + ' · ' + level.charAt(0).toUpperCase() + level.slice(1);

  function runBots(room, now, resume) {
    const s = room.server;
    const st = s.pub;
    const ctx = { rng: shuffleRng, now };
    const anyHuman = st.seats.some((x) => !x.bot);
    let n = 0;
    let hold = false;
    let guard = 0;
    while (!st.over && !st.roundOver && guard++ < 500) {
      const t = st.turn;
      const seat = st.seats[t];
      if (!seat.bot) break;
      if (st.ohno && st.ohno.seat !== t && st.seats[st.ohno.seat].bot && anyHuman && !resume) {
        hold = true;
        break;
      }
      resume = false;
      if (st.ohno && st.ohno.seat !== t && OhNoCore.botWouldCatch(st, seat.level, Math.random)) {
        if (!OhNoCore.apply(st, t, { type: 'catch', target: st.ohno.seat }, ctx).error) n++;
      }
      const style = (s.styles && s.styles[t]) || null;
      let out = OhNoCore.apply(st, t, OhNoCore.botAction(st, t, Math.random, { style }), ctx);
      if (out.error) out = OhNoCore.apply(st, t, OhNoCore.autoAction(st, t), ctx);
      if (out.error) break;
      n++;
    }
    const slack = Math.min(MAX_SLACK_MS, n * BOT_MS_PER_EVENT);
    s.hold = hold;
    s.slack = slack + (hold ? HOLD_MS : 0);
    if (hold && st.ohno) st.ohno.closesAt = now + s.slack;
    if (n) s.turnSeq = (Number(s.turnSeq) || 0) + 1;
  }

  function syncPrivate(room) {
    const s = room.server;
    const st = s.pub;
    room.secrets = {};
    st.seats.forEach((x, i) => {
      // A taken-over seat is a bot now: its old owner must not see that hand or a challenge peek.
      if (x.bot) return;
      if (!room.pub.players[x.id]) return;
      room.secrets[x.id] = Object.assign({ roundNo: room.pub.roundNo }, OhNoCore.privateView(st, i));
    });
    st.seats.forEach((x, i) => {
      if (room.pub.players[x.id]) room.pub.scores[x.id] = st.scores[i];
    });
  }

  function queueSettlement(room) {
    const s = room.server;
    const st = s.pub;
    if (!st.over || s.settleReq) return;
    const ranking = (st.ranking || []).map((i) => st.seats[i]).filter((x) => room.pub.players[x.id]).map((x) => x.id);
    const forfeits = st.seats.filter((x) => x.forfeit && room.pub.players[x.id]).map((x) => x.id);
    const stayer = abandonStayer(st.seats, (id) => !!room.pub.players[id]);
    s.settleReq = { matchId: s.matchId, game: 'uno', ranking, teams: null, stake: s.settings.stake, draw: false, rolls: {}, forfeits, stayer, done: false };
    room.pub.settlement = { status: 'pending' };
  }

  function seatAction(ctx, type, extra) {
    const i = seatOf(ctx.room.server, ctx.uid);
    if (i < 0) throw err('not_seated', 'You’re watching this game');
    ctx.act(Object.assign({ type, seat: i, now: ctx.now }, extra || {}));
    return {};
  }

  return {
    core: OhNoCore,
    min: 1,
    max: OhNoCore.MAX_PLAYERS,
    mergeSettings,
    deal(room, ids, ctx) {
      const set = mergeSettings(room.pub.settings);
      const rot = (ctx.roundNo - 1) % ids.length;
      const humans = ids.slice(rot).concat(ids.slice(0, rot));
      const players = humans.map((id) => ({ id, name: room.pub.players[id].name }));
      const bots = Math.max(0, Math.min(set.bots, OhNoCore.MAX_PLAYERS - players.length));
      for (let i = 0; i < bots; i++) players.push({ id: 'bot' + (i + 1), name: botName(i, set.botLevel), bot: true, level: set.botLevel, persona: set.botStyle });
      if (players.length < 2) throw err('need_players', 'Oh No! needs 2 players — add a bot or invite a friend');
      const st = OhNoCore.newMatch(players, set, shuffleRng);
      if (st.error) throw err('need_players', 'Oh No! needs more players');
      room.server = {
        settings: set,
        pub: st,
        styles: players.map((p) => (p.bot ? botStyle(p.persona, p.level) : null)),
        slack: 0,
        hold: false,
        turnSeq: 0,
        matchId: 'uno_' + String(room.pub.host || '').slice(0, 10) + '_' + (room.pub.createdAt || ctx.now) + '_' + ctx.roundNo,
        settleReq: null,
      };
      room.pub.settlement = null;
      runBots(room, ctx.now);
      syncPrivate(room);
    },
    view: (s) => Object.assign(OhNoCore.publicView(s.pub), { slack: s.slack || 0, hold: !!s.hold, stake: s.settings.stake }),
    phaseKey: (s) => (s.pub.over ? 'over:' + s.pub.seq : [s.pub.round, s.pub.phase, s.pub.turn, s.turnSeq || 0, s.hold ? 1 : 0].join(':')),
    deadlineMs(s) {
      const st = s.pub;
      if (st.over) return 0;
      if (st.roundOver) return ROUND_GAP_MS + (s.slack || 0);
      if (s.hold) return s.slack || HOLD_MS;
      if (st.seats[st.turn].bot) return (s.slack || 0) + 1000;
      return TURN_MS + (s.slack || 0);
    },
    apply(room, action) {
      const s = room.server;
      const st = s.pub;
      const now = Number(action.now) || Date.now();
      if (st.over) return { error: 'over' };
      const ctx = { rng: shuffleRng, now };
      let out = {};
      const turnBefore = [st.turn, st.phase, st.round].join(':');
      switch (action.type) {
        case 'next_round':
          out = OhNoCore.nextRound(st, shuffleRng);
          break;
        case 'bots':
          break;
        case 'auto': {
          const t = st.turn;
          out = OhNoCore.apply(st, t, OhNoCore.autoAction(st, t), ctx);
          if (!out.error && st.turn === t && st.phase === 'drawn') out = OhNoCore.apply(st, t, OhNoCore.autoAction(st, t), ctx);
          break;
        }
        case 'takeover':
          OhNoCore.takeOver(st, action.seat, action.reason || 'afk');
          break;
        default: {
          const seat = Number(action.seat);
          const a = Object.assign({}, action);
          delete a.seat;
          delete a.now;
          out = OhNoCore.apply(st, seat, a, ctx);
          if (!out.error && ['play', 'draw', 'pass', 'color', 'challenge', 'accept'].indexOf(action.type) >= 0) st.seats[seat].afk = 0;
        }
      }
      if (out && out.error) return out;
      const moved = [st.turn, st.phase, st.round].join(':') !== turnBefore || ['play', 'draw', 'pass', 'color', 'challenge', 'accept', 'auto', 'next_round', 'takeover', 'bots'].indexOf(action.type) >= 0;
      s.slack = 0;
      s.hold = false;
      if (moved) s.turnSeq = (Number(s.turnSeq) || 0) + 1;
      runBots(room, now, action.type === 'bots');
      return out || {};
    },
    afterChange(room) {
      syncPrivate(room);
      queueSettlement(room);
    },
    absent() {},
    timeout(room, ctx) {
      const s = room.server;
      const st = s.pub;
      if (st.over) return;
      if (st.roundOver) return ctx.act({ type: 'next_round', now: ctx.now }, true);
      const seat = st.seats[st.turn];
      if (s.hold || seat.bot) return ctx.act({ type: 'bots', now: ctx.now }, true);
      const step = Policy.afkStep(seat.afk || 0, pol);
      seat.afk = step.misses;
      if (step.forfeit) ctx.act({ type: 'takeover', seat: st.turn, reason: 'afk', now: ctx.now }, true);
      else ctx.act({ type: 'auto', now: ctx.now }, true);
    },
    betweenRounds: (s) => !!s.pub.over,
    canNext: () => false,
    newGameOnStart: () => true,
    onJoinPlaying: () => true,
    onLeave(room, uid, now) {
      const s = room.server;
      const i = seatOf(s, uid);
      if (i < 0 || s.pub.over) return;
      OhNoCore.takeOver(s.pub, i, 'left');
      s.turnSeq = (Number(s.turnSeq) || 0) + 1;
      runBots(room, now || Date.now());
    },
    ops: {
      play: (ctx) =>
        seatAction(ctx, 'play', {
          card: String(ctx.args.card || '').slice(0, 2),
          color: ctx.args.color ? String(ctx.args.color).slice(0, 1) : null,
          target: ctx.args.target != null ? Number(ctx.args.target) : null,
          call: !!ctx.args.call,
          seq: ctx.args.seq != null ? Number(ctx.args.seq) : null,
        }),
      draw: (ctx) => seatAction(ctx, 'draw'),
      pass: (ctx) => seatAction(ctx, 'pass'),
      color: (ctx) => seatAction(ctx, 'color', { color: String(ctx.args.color || '').slice(0, 1) }),
      challenge: (ctx) => seatAction(ctx, 'challenge'),
      accept: (ctx) => seatAction(ctx, 'accept'),
      ohno: (ctx) => seatAction(ctx, 'ohno'),
      catch: (ctx) => seatAction(ctx, 'catch', { target: Number(ctx.args.target) }),
      next_round(ctx) {
        const st = ctx.room.server.pub;
        if (!st.roundOver || st.over) throw err('phase', 'Finish this round first');
        if (!ctx.isHost) throw err('host_only', 'The host deals the next round');
        ctx.act({ type: 'next_round', now: ctx.now });
        return {};
      },
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
      s.pub = OhNoCore.hydrate(s.pub);
      const n = s.pub.seats.length;
      const styles = [];
      for (let i = 0; i < n; i++) styles.push((s.styles && s.styles[i]) || null);
      s.styles = styles;
      s.slack = Number(s.slack) || 0;
      s.hold = !!s.hold;
      s.turnSeq = Number(s.turnSeq) || 0;
      if (s.settleReq) {
        s.settleReq.ranking = s.settleReq.ranking || [];
        s.settleReq.rolls = s.settleReq.rolls || {};
        s.settleReq.forfeits = s.settleReq.forfeits || [];
      }
    },
    pendingSettlement: (s) => (s && s.settleReq && !s.settleReq.done ? s.settleReq : null),
  };
}

module.exports = { createOhnoAdapter, STAKES, cryptoRng };
