/**
 * Classics party-room adapters — Ludo (2–4, teams), Snakes & Ladders (2–6) and Tic-Tac-Toe
 * (Classic + Ultimate, 1v1). Plugged into server-lib/party-deal.js GAMES, so rooms, invites, lobby,
 * presence and ticks are the shared party engine.
 *
 * - Every Live die comes from server-lib/dice.js (CSPRNG). Clients only send "roll".
 * - Bots fill empty seats (host picks count + level in the lobby) and play instantly on the server.
 * - AFK: the turn clock runs out → auto-play (roll / most advanced token / a quick TTT move);
 *   after the policy's maxMisses the seat is taken over by a bot and forfeits its placement.
 * - Leaving mid-game: Ludo / Snakes → bot takeover; Tic-Tac-Toe → the opponent wins.
 * - When a game ends the adapter queues a settlement (placement chips via dangal-economy);
 *   party-deal runs it after the room transaction commits.
 */
'use strict';

const LudoCore = require('../public/src/js/games/ludo-core.js');
const SnakesCore = require('../public/src/js/games/snakes-core.js');
const TttCore = require('../public/src/js/games/ttt-core.js');
const Policy = require('../public/src/js/dangal/dangal-live-policy.js');
const Dice = require('./dice.js');

const STAKES = [0, 10, 25, 50, 100];
const BOT_MS_PER_EVENT = 450;
const MAX_SLACK_MS = 15000;

function pickStake(v) {
  const n = Math.floor(Number(v) || 0);
  return STAKES.indexOf(n) >= 0 ? n : 0;
}

function seatOf(s, uid) {
  const i = (s.pub.seats || []).findIndex((x) => x.id === uid);
  return i;
}

function createClassicsAdapters({ err }) {
  // ------------------------------------------------------------ shared dice-game plumbing

  function diceAdapter(game, Core, opts) {
    const pol = Policy.policyFor(game);
    const maxSeats = opts.maxSeats;
    const levels = opts.levels;

    function mergeSettings(raw) {
      const r = raw && typeof raw === 'object' ? raw : {};
      const s = Core.mergeSettings(r);
      s.bots = Math.max(0, Math.min(maxSeats - 1, Math.floor(Number(r.bots) || 0)));
      s.botLevel = levels.indexOf(r.botLevel) >= 0 ? r.botLevel : levels[1] || levels[0];
      s.stake = pickStake(r.stake);
      return s;
    }

    function botName(i, level) {
      return 'Bot ' + (i + 1) + ' · ' + level.charAt(0).toUpperCase() + level.slice(1);
    }

    function runBots(room) {
      const s = room.server;
      const st = s.pub;
      const before = st.seq;
      let guard = 0;
      while (!st.over && st.seats[st.turn] && st.seats[st.turn].bot && guard++ < 600) opts.botStep(st);
      s.slack = Math.min(MAX_SLACK_MS, (st.seq - before) * BOT_MS_PER_EVENT);
    }

    function queueSettlement(room) {
      const s = room.server;
      const st = s.pub;
      if (!st.over || s.settleReq) return;
      const ranking = (st.ranking || []).map((i) => st.seats[i]).filter((x) => !x.bot || x.forfeit).map((x) => x.id);
      const humans = ranking.filter((id) => room.pub.players[id]);
      const rolls = {};
      st.seats.forEach((x, i) => {
        if (room.pub.players[x.id]) rolls[x.id] = (st.rolls[i] || []).slice(-400);
      });
      let teams = null;
      if (game === 'ludo' && st.settings.teams && st.winnerTeam != null) {
        teams = { winners: st.seats.filter((x) => x.team === st.winnerTeam).map((x) => x.id).filter((id) => room.pub.players[id]) };
      }
      const forfeits = st.seats.filter((x) => x.forfeit && room.pub.players[x.id]).map((x) => x.id);
      s.settleReq = { matchId: s.matchId, game, ranking: humans, teams, stake: s.settings.stake, draw: false, rolls, forfeits, done: false };
      room.pub.settlement = { status: 'pending' };
      const top = (teams ? teams.winners : humans.slice(0, 1)).filter((id) => forfeits.indexOf(id) < 0);
      top.forEach((id) => (room.pub.scores[id] = (Number(room.pub.scores[id]) || 0) + 1));
    }

    return {
      core: Core,
      min: 1,
      max: maxSeats,
      mergeSettings,
      deal(room, ids, ctx) {
        const set = mergeSettings(room.pub.settings);
        const rot = (ctx.roundNo - 1) % ids.length;
        const humans = ids.slice(rot).concat(ids.slice(0, rot));
        const players = humans.map((id) => ({ id, name: room.pub.players[id].name }));
        const room4 = game === 'ludo' && set.teams ? 4 : maxSeats;
        const bots = Math.max(0, Math.min(set.bots, room4 - players.length));
        for (let i = 0; i < bots; i++) players.push({ id: 'bot' + (i + 1), name: botName(i, set.botLevel), bot: true, level: set.botLevel });
        if (players.length < 2) throw err('need_players', opts.label + ' needs 2 players — add a bot or invite a friend');
        if (game === 'ludo' && set.teams && players.length !== 4) throw err('need_players', 'Teams 2v2 needs 4 players — add bots to fill seats');
        const st = Core.newGame(players, set);
        if (st.error) throw err('need_players', opts.label + ' needs more players');
        room.server = {
          settings: set,
          pub: st,
          slack: 0,
          matchId: game + '_' + String(room.pub.host || '').slice(0, 10) + '_' + (room.pub.createdAt || ctx.now) + '_' + ctx.roundNo,
          settleReq: null,
        };
        room.pub.settlement = null;
        room.secrets = {};
        runBots(room);
      },
      view: (s) => Object.assign({}, s.pub, { slack: s.slack || 0 }),
      phaseKey: (s) => (s.pub.over ? 'over:' + s.pub.seq : s.pub.phase + ':' + s.pub.turn + ':' + s.pub.seq),
      deadlineMs: (s) => (s.pub.over ? 0 : opts.turnMs + (s.slack || 0)),
      apply(room, action) {
        const s = room.server;
        const st = s.pub;
        if (st.over) return { error: 'over' };
        const seat = st.seats[st.turn];
        let out = {};
        if (action.type === 'roll') {
          if (action.seat !== st.turn) return { error: 'not_your_turn' };
          seat.afk = 0;
          out = Core.roll(st, Dice.rollDie());
        } else if (action.type === 'move') {
          if (action.seat !== st.turn) return { error: 'not_your_turn' };
          seat.afk = 0;
          out = opts.move(st, action.token);
        } else if (action.type === 'auto') {
          out = opts.autoStep(st);
        } else if (action.type === 'takeover') {
          Core.takeOver(st, action.seat, action.reason || 'afk');
        } else return { error: 'bad_action' };
        if (out && out.error) return out;
        runBots(room);
        return out || {};
      },
      afterChange(room) {
        queueSettlement(room);
      },
      absent() {},
      timeout(room, ctx) {
        const st = room.server.pub;
        if (st.over) return;
        const seat = st.seats[st.turn];
        if (!seat || seat.bot) return;
        const step = Policy.afkStep(seat.afk || 0, pol);
        seat.afk = step.misses;
        if (step.forfeit) ctx.act({ type: 'takeover', seat: st.turn, reason: 'afk' }, true);
        else ctx.act({ type: 'auto' }, true);
      },
      betweenRounds: (s) => !!s.pub.over,
      canNext: () => false,
      newGameOnStart: () => false,
      onJoinPlaying: () => true,
      onLeave(room, uid) {
        const s = room.server;
        const i = seatOf(s, uid);
        if (i < 0 || s.pub.over) return;
        Core.takeOver(s.pub, i, 'left');
        runBots(room);
      },
      ops: {
        roll(ctx) {
          const i = seatOf(ctx.room.server, ctx.uid);
          if (i < 0) throw err('not_seated', 'You’re watching this game');
          const out = ctx.act({ type: 'roll', seat: i });
          return { value: ctx.room.server.pub.rolls[i].slice(-1)[0] || null, events: (out.events || []).length };
        },
        move(ctx) {
          const i = seatOf(ctx.room.server, ctx.uid);
          if (i < 0) throw err('not_seated', 'You’re watching this game');
          ctx.act({ type: 'move', seat: i, token: Number(ctx.args.token) });
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
        s.pub = Core.hydrate(s.pub);
        s.slack = Number(s.slack) || 0;
        if (s.settleReq) {
          s.settleReq.ranking = s.settleReq.ranking || [];
          s.settleReq.rolls = s.settleReq.rolls || {};
          s.settleReq.forfeits = s.settleReq.forfeits || [];
        }
      },
      pendingSettlement: (s) => (s && s.settleReq && !s.settleReq.done ? s.settleReq : null),
    };
  }

  // ------------------------------------------------------------ Ludo

  const ludo = diceAdapter('ludo', LudoCore, {
    label: 'Ludo',
    maxSeats: LudoCore.MAX_PLAYERS,
    levels: LudoCore.LEVELS,
    turnMs: Policy.policyFor('ludo').turnMs || 20000,
    move: (st, token) => LudoCore.move(st, token),
    autoStep(st) {
      if (st.phase === 'roll') return LudoCore.roll(st, Dice.rollDie());
      return LudoCore.move(st, LudoCore.autoMoveToken(st));
    },
    botStep(st) {
      const seat = st.seats[st.turn];
      if (st.phase === 'roll') LudoCore.roll(st, Dice.rollDie());
      else LudoCore.move(st, LudoCore.botChoose(st, seat.level || 'normal', Math.random));
    },
  });

  // ------------------------------------------------------------ Snakes & Ladders

  const snakes = diceAdapter('snakes', SnakesCore, {
    label: 'Snakes & Ladders',
    maxSeats: SnakesCore.MAX_PLAYERS,
    levels: ['normal'],
    turnMs: Policy.policyFor('snakes').turnMs || 15000,
    move: () => ({ error: 'no_moves_in_snakes' }),
    autoStep: (st) => SnakesCore.roll(st, Dice.rollDie()),
    botStep: (st) => SnakesCore.roll(st, Dice.rollDie()),
  });

  // ------------------------------------------------------------ Tic-Tac-Toe (Classic + Ultimate)

  const tttPol = Policy.policyFor('ttt');
  const TTT_TURN_MS = tttPol.turnMs || 30000;

  function tttSettings(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    return { mode: r.mode === 'ultimate' ? 'ultimate' : 'classic', stake: pickStake(r.stake) };
  }

  function tttQueue(room) {
    const s = room.server;
    const st = s.pub;
    if (!st.over || s.settleReq) return;
    const draw = st.winner === 'D';
    const w = draw ? -1 : TttCore.seatOfMark(st, st.winner);
    const ids = st.seats.map((x) => x.id);
    const ranking = w >= 0 ? [ids[w], ids[1 - w]] : ids.slice();
    s.settleReq = { matchId: s.matchId, game: 'ttt', ranking, teams: null, stake: s.settings.stake, draw, rolls: {}, done: false };
    room.pub.settlement = { status: 'pending' };
    if (!draw) room.pub.scores[ids[w]] = (Number(room.pub.scores[ids[w]]) || 0) + 1;
  }

  const ttt = {
    core: TttCore,
    min: 2,
    max: 2,
    mergeSettings: tttSettings,
    deal(room, ids, ctx) {
      const set = tttSettings(room.pub.settings);
      const order = (ctx.roundNo - 1) % 2 === 0 ? ids : ids.slice().reverse();
      const st = TttCore.newMatch(set.mode, order.map((id) => ({ id, name: room.pub.players[id].name })));
      room.server = {
        settings: set,
        pub: st,
        matchId: 'ttt_' + String(room.pub.host || '').slice(0, 10) + '_' + (room.pub.createdAt || ctx.now) + '_' + ctx.roundNo,
        settleReq: null,
      };
      room.pub.settlement = null;
      room.secrets = {};
    },
    view: (s) => s.pub,
    phaseKey: (s) => (s.pub.over ? 'over:' + s.pub.seq : 'turn:' + s.pub.seq),
    deadlineMs: (s) => (s.pub.over ? 0 : TTT_TURN_MS),
    apply(room, action) {
      const st = room.server.pub;
      if (st.over) return { error: 'over' };
      const turnSeat = TttCore.seatOfMark(st, st.turn);
      if (action.type === 'play') {
        if (action.seat !== turnSeat) return { error: 'not_your_turn' };
        st.seats[turnSeat].afk = 0;
        return TttCore.play(st, action.cell);
      }
      if (action.type === 'auto') return TttCore.play(st, TttCore.botMove(st, 'easy', Math.random));
      if (action.type === 'forfeit') {
        TttCore.forfeit(st, action.seat, action.reason || 'forfeit');
        return {};
      }
      return { error: 'bad_action' };
    },
    afterChange(room) {
      tttQueue(room);
    },
    absent() {},
    timeout(room, ctx) {
      const st = room.server.pub;
      if (st.over) return;
      const i = TttCore.seatOfMark(st, st.turn);
      const seat = st.seats[i];
      const step = Policy.afkStep(seat.afk || 0, tttPol);
      seat.afk = step.misses;
      if (step.forfeit) ctx.act({ type: 'forfeit', seat: i, reason: 'timeout' }, true);
      else ctx.act({ type: 'auto' }, true);
    },
    betweenRounds: (s) => !!s.pub.over,
    canNext: () => false,
    newGameOnStart: () => false,
    onJoinPlaying: () => true,
    onLeave(room, uid) {
      const s = room.server;
      const i = seatOf(s, uid);
      if (i < 0 || s.pub.over) return;
      TttCore.forfeit(s.pub, i, 'left');
    },
    ops: {
      play(ctx) {
        const i = seatOf(ctx.room.server, ctx.uid);
        if (i < 0) throw err('not_seated', 'You’re watching this game');
        ctx.act({ type: 'play', seat: i, cell: Number(ctx.args.cell) });
        return {};
      },
      resign(ctx) {
        const i = seatOf(ctx.room.server, ctx.uid);
        if (i < 0) throw err('not_seated', 'You’re watching this game');
        ctx.act({ type: 'forfeit', seat: i, reason: 'resign' });
        return {};
      },
    },
    hydrate(s) {
      s.settings = tttSettings(s.settings);
      s.pub = TttCore.hydrate(s.pub);
    },
    pendingSettlement: (s) => (s && s.settleReq && !s.settleReq.done ? s.settleReq : null),
  };

  return { ludo, snakes, ttt };
}

module.exports = { createClassicsAdapters, STAKES };
