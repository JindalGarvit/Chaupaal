/**
 * Dangal P7 — Carrom Live rooms (singles 1v1 rated, doubles 2v2) on the party-room engine.
 *
 * The server owns the game: the client sends { x, angle, power } for a stroke, the server validates the
 * striker spot, runs the shared deterministic physics (public/src/js/games/carrom-physics.js) and the
 * ICF rules (carrom-core.js), and publishes the result. Clients animate the same input with the same
 * module and snap to the published pieces.
 *
 * Bots (doubles fill only) take one stroke per server tick, paced by the room deadline, so every client
 * sees every stroke animate in order.
 */
const Core = require('../public/src/js/games/carrom-core.js');
const Policy = require('../public/src/js/dangal/dangal-live-policy.js');
const { STAKES } = require('./classics-rooms.js');

const POL = Policy.policyFor('carrom');
const SHOT_MS = POL.turnMs || Core.SHOT_MS;
const PLACE_MS = POL.placeMs || Core.PLACE_MS;
const BOARD_BREAK_MS = 5000;
const BOT_THINK_MS = 900;
const ANIM_PAD_MS = 700;
const MAX_ANIM_MS = 9000;

const QUEUE_TTL_MS = 45 * 1000;
const QUEUE_PATHS = { singles: 'carromQueue/singles', doubles: 'carromQueue/doubles' };

const REASONS = {
  not_your_turn: 'Not your turn',
  phase: 'Wait for the board to settle',
  bad_shot: 'That shot didn’t send — try again',
  illegal_position: 'The striker must sit on your baseline, clear of the circles and the men',
  bad_spot: 'Place the man inside the outer circle, off the centre spot, touching nothing',
  over: 'This game is over',
};

function pickStake(v) {
  const n = Math.floor(Number(v) || 0);
  return STAKES.indexOf(n) >= 0 ? n : 0;
}

function mergeSettings(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    variant: Core.VARIANTS.indexOf(r.variant) >= 0 ? r.variant : 'icf',
    mode: r.mode === 'doubles' ? 'doubles' : 'singles',
    stake: pickStake(r.stake),
    botLevel: Core.LEVELS.indexOf(r.botLevel) >= 0 ? r.botLevel : 'normal',
    pair: Math.max(0, Math.min(2, Math.floor(Number(r.pair) || 0))),
    quick: !!r.quick,
  };
}

function seatOf(s, uid) {
  return Core.seatOfUid(s.pub, uid);
}

function botName(i, level) {
  return 'Bot ' + (i + 1) + ' · ' + level.charAt(0).toUpperCase() + level.slice(1);
}

/** Doubles seating: partners sit opposite (seats 0+2, 1+3). `pair` picks the first player's partner. */
function doublesOrder(ids, pair) {
  const first = ids[0];
  const others = [0, 1, 2].map((i) => ids[i + 1] || null);
  const p = Math.max(0, Math.min(2, pair || 0));
  const rest = others.filter((_, i) => i !== p);
  return [first, rest[0], others[p], rest[1]];
}

/** Whoever must act now: the shooter, the due placer, or nobody between boards. */
function actorSeat(st) {
  if (st.over) return -1;
  if (st.phase === 'place') return st.place[0] ? st.place[0].seat : -1;
  if (st.phase === 'shot') return st.turn;
  return -1;
}

function createCarromAdapter({ err }) {
  function queueSettlement(room) {
    const s = room.server;
    const st = s.pub;
    if (!st.over || s.settleReq) return;
    const human = (x) => !x.bot && !!room.pub.players[x.id];
    const win = st.winner;
    const hasBots = st.seats.some((x) => x.bot);
    const forfeits = st.forfeit && st.seats[st.forfeit.seat] && human(st.seats[st.forfeit.seat]) ? [st.seats[st.forfeit.seat].id] : [];
    if (s.settings.mode === 'singles' && !hasBots && st.seats.length === 2) {
      const a = st.seats[0];
      const b = st.seats[1];
      const result = win == null ? 'draw' : win === a.team ? 'win' : 'loss';
      s.settleReq = {
        kind: 'h2h',
        matchId: s.matchId,
        game: 'carrom',
        a: a.id,
        b: b.id,
        result,
        // ICF Standard + Quick are rated; Freestyle is the casual house variant.
        rated: s.settings.variant !== 'freestyle',
        stake: s.settings.stake,
        forfeit: st.forfeit || null,
        done: false,
      };
    } else {
      const humans = st.seats.filter(human);
      const winners = humans.filter((x) => x.team === win).map((x) => x.id);
      const losers = humans.filter((x) => x.team !== win).map((x) => x.id);
      s.settleReq = {
        matchId: s.matchId,
        game: 'carrom',
        ranking: winners.concat(losers),
        teams: winners.length ? { winners } : null,
        // Any bot at the table (or a lone human side) = friendly: no chips move.
        stake: hasBots || !winners.length || !losers.length ? 0 : s.settings.stake,
        draw: win == null,
        rolls: {},
        forfeits,
        stayer: null,
        done: false,
      };
    }
    room.pub.settlement = { status: 'pending' };
    st.seats.forEach((x) => {
      if (x.team === win && room.pub.players[x.id] && forfeits.indexOf(x.id) < 0) room.pub.scores[x.id] = (Number(room.pub.scores[x.id]) || 0) + 1;
    });
  }

  function animMs(st) {
    const last = st.log[st.log.length - 1];
    return last ? Math.min(MAX_ANIM_MS, (Number(last.steps) || 0) + ANIM_PAD_MS) : 0;
  }

  function botAct(room, rng) {
    const st = room.server.pub;
    const R = typeof rng === 'function' ? rng : Math.random;
    if (st.phase === 'boardOver') return Core.nextBoard(st, R);
    const seat = actorSeat(st);
    if (seat < 0 || !st.seats[seat].bot) return { error: 'phase' };
    if (st.phase === 'place') {
      const spot = Core.botPlace(st, R);
      return spot ? Core.placeMan(st, seat, spot.x, spot.y) : Core.forgo(st, seat);
    }
    return Core.shoot(st, seat, Core.botShot(st, seat, st.seats[seat].level || 'normal', R));
  }

  return {
    core: Core,
    min: 1,
    max: 4,
    maxFor: (room) => (mergeSettings(room.pub.settings).mode === 'doubles' ? 4 : 2),
    mergeSettings,
    deal(room, ids, ctx) {
      const set = mergeSettings(room.pub.settings);
      const R = ctx.rng;
      let players;
      if (set.mode === 'doubles') {
        if (ids.length > 4) throw err('too_many_players', 'Doubles seats four');
        const order = doublesOrder(ids, set.pair);
        let bi = 0;
        players = order.map((id) => {
          if (id) return { id, name: room.pub.players[id].name };
          const b = { id: 'bot' + (bi + 1), name: botName(bi, set.botLevel), bot: true, level: set.botLevel };
          bi += 1;
          return b;
        });
      } else {
        if (ids.length !== 2) throw err('need_players', 'Carrom singles needs 2 players');
        // Rematches swap sides.
        const order = (ctx.roundNo - 1) % 2 === 0 ? ids : ids.slice().reverse();
        players = order.map((id) => ({ id, name: room.pub.players[id].name }));
      }
      // Toss (Law 42–43): the winner takes the break and plays white.
      const breaker = Math.floor(R() * players.length) % players.length;
      const st = Core.newGame(players, { variant: set.variant, breaker });
      st.note = players[breaker].name + ' won the toss and breaks with white.';
      const tag = set.quick ? '_mm_' : '_';
      room.server = {
        settings: set,
        pub: st,
        slack: 0,
        matchId: 'carrom' + tag + String(room.pub.host || '').slice(0, 10) + '_' + (room.pub.createdAt || ctx.now) + '_' + ctx.roundNo,
        settleReq: null,
      };
      room.pub.settlement = null;
      room.secrets = {};
    },
    view: (s) => Object.assign({}, s.pub, { slack: s.slack || 0, mode: s.settings.mode, stake: s.settings.stake }),
    phaseKey: (s) => (s.pub.over ? 'over:' + s.pub.seq : s.pub.phase + ':' + actorSeat(s.pub) + ':' + s.pub.seq),
    deadlineMs(s) {
      const st = s.pub;
      if (st.over) return 0;
      const slack = s.slack || 0;
      if (st.phase === 'boardOver') return slack + BOARD_BREAK_MS;
      const seat = actorSeat(st);
      const bot = seat >= 0 && st.seats[seat].bot;
      if (bot) return slack + BOT_THINK_MS;
      return slack + (st.phase === 'place' ? PLACE_MS : SHOT_MS);
    },
    apply(room, action) {
      const s = room.server;
      const st = s.pub;
      if (st.over) return { error: 'over' };
      let out;
      if (action.type === 'shot') {
        out = Core.shoot(st, action.seat, action.input);
        if (!out.error) {
          s.slack = animMs(st);
          return { ok: true, no: out.entry.no, msg: out.entry.msg };
        }
      } else if (action.type === 'place') {
        out = Core.placeMan(st, action.seat, action.x, action.y);
        if (!out.error) s.slack = 0;
      } else if (action.type === 'forgo') {
        out = Core.forgo(st, action.seat);
        if (!out.error) s.slack = 0;
      } else if (action.type === 'bot') {
        out = botAct(room, action.rng);
        if (!out.error) s.slack = out.entry ? animMs(st) : 0;
      } else if (action.type === 'foul') {
        out = Core.timeoutFoul(st, action.seat);
        if (!out.error) s.slack = 0;
      } else if (action.type === 'forfeit') {
        out = Core.forfeit(st, action.seat, action.reason || 'resign');
      } else return { error: 'bad_action' };
      if (out && out.error) return Object.assign({}, out, { reason: REASONS[out.error] || out.error });
      return out || {};
    },
    afterChange(room) {
      queueSettlement(room);
    },
    absent() {},
    timeout(room, ctx) {
      const st = room.server.pub;
      if (st.over) return;
      if (st.phase === 'boardOver') {
        ctx.act({ type: 'bot', rng: ctx.rng }, true);
        return;
      }
      const seat = actorSeat(st);
      if (seat < 0) return;
      const who = st.seats[seat];
      if (who.bot) {
        ctx.act({ type: 'bot', rng: ctx.rng }, true);
        return;
      }
      if (st.phase === 'place') {
        // Law 88: 15 seconds to place — out of time forfeits the placement.
        ctx.act({ type: 'forgo', seat }, true);
        return;
      }
      const step = Policy.afkStep(who.afk || 0, POL);
      if (step.forfeit) {
        ctx.act({ type: 'forfeit', seat, reason: 'afk' }, true);
        return;
      }
      // timeoutFoul ends the turn; keep the running miss count on the seat afterwards.
      ctx.act({ type: 'foul', seat }, true);
      who.afk = step.misses;
    },
    betweenRounds: (s) => !!s.pub.over,
    canNext: () => false,
    newGameOnStart: () => false,
    onJoinPlaying: () => true,
    onLeave(room, uid) {
      const s = room.server;
      const i = seatOf(s, uid);
      if (i < 0 || s.pub.over) return;
      Core.forfeit(s.pub, i, 'left');
    },
    ops: {
      shot(ctx) {
        const i = seatOf(ctx.room.server, ctx.uid);
        if (i < 0) throw err('not_seated', 'You’re watching this game');
        const a = ctx.args;
        const input = { x: Number(a.x), angle: Number(a.angle), power: Number(a.power) };
        const done = ctx.act({ type: 'shot', seat: i, input });
        return { no: done.no, msg: done.msg };
      },
      place(ctx) {
        const i = seatOf(ctx.room.server, ctx.uid);
        if (i < 0) throw err('not_seated', 'You’re watching this game');
        ctx.act({ type: 'place', seat: i, x: Number(ctx.args.x), y: Number(ctx.args.y) });
        return {};
      },
      forgo(ctx) {
        const i = seatOf(ctx.room.server, ctx.uid);
        if (i < 0) throw err('not_seated', 'You’re watching this game');
        ctx.act({ type: 'forgo', seat: i });
        return {};
      },
      resign(ctx) {
        const i = seatOf(ctx.room.server, ctx.uid);
        if (i < 0) throw err('not_seated', 'You’re watching this game');
        ctx.act({ type: 'forfeit', seat: i, reason: 'resign' });
        return {};
      },
    },
    lobbyOps: {
      pair(ctx) {
        if (!ctx.isHost) throw err('host_only', 'Only the host can set partners');
        const p = ctx.room.pub;
        p.settings = mergeSettings(Object.assign({}, p.settings, { pair: ctx.args.pair }));
        return { settings: p.settings };
      },
    },
    hydrate(s) {
      s.settings = mergeSettings(s.settings);
      s.pub = Core.hydrate(s.pub);
      s.slack = Number(s.slack) || 0;
      if (s.settleReq) {
        if (s.settleReq.kind !== 'h2h') {
          s.settleReq.ranking = s.settleReq.ranking || [];
          s.settleReq.forfeits = s.settleReq.forfeits || [];
          s.settleReq.rolls = s.settleReq.rolls || {};
        }
        s.settleReq.done = !!s.settleReq.done;
      }
    },
    pendingSettlement: (s) => (s && s.settleReq && !s.settleReq.done ? s.settleReq : null),

    /**
     * Quick match (RTDB carromQueue/singles|doubles, Admin only): claim a fresh waiting room or open one
     * and wait. Singles pairs two; doubles fills four (the slot stays open until the room is full).
     */
    async quick(adminApp, uid, op, body, now, partyRoom) {
      const mode = body && body.mode === 'doubles' ? 'doubles' : 'singles';
      const need = mode === 'doubles' ? 4 : 2;
      const ref = adminApp.database().ref(QUEUE_PATHS[mode]);
      if (op === 'quick_cancel') {
        await ref.transaction((w) => (w == null || w.uid === uid ? null : undefined));
        return { cancelled: true };
      }
      const fresh = (w) => w && w.code && w.uid && now - (Number(w.at) || 0) < QUEUE_TTL_MS;
      let claimed = null;
      let mine = null;
      await ref.transaction((w) => {
        claimed = null;
        mine = null;
        if (w == null) return null;
        if (fresh(w) && w.uid === uid) {
          mine = w.code;
          return Object.assign({}, w, { at: now });
        }
        if (fresh(w)) {
          claimed = w.code;
          const joined = Object.assign({}, w.joined || {});
          joined[uid] = now;
          return Object.keys(joined).length + 1 >= need ? null : Object.assign({}, w, { joined });
        }
        return undefined;
      });
      if (claimed) return { matched: true, code: claimed, host: false, mode };
      if (mine) return { matched: false, code: mine, host: true, waiting: true, mode };
      const settings = { mode, variant: 'icf', stake: 0, quick: true };
      const made = await partyRoom(adminApp, uid, { op: 'create', game: 'carrom', name: body && body.name, settings });
      let other = null;
      await ref.transaction((w) => {
        other = null;
        if (fresh(w) && w.uid !== uid) {
          other = w.code;
          const joined = Object.assign({}, w.joined || {});
          joined[uid] = now;
          return Object.keys(joined).length + 1 >= need ? null : Object.assign({}, w, { joined });
        }
        return { code: made.code, uid, at: now };
      });
      if (other) {
        await partyRoom(adminApp, uid, { op: 'end', game: 'carrom', code: made.code }).catch(() => {});
        return { matched: true, code: other, host: false, mode };
      }
      return { matched: false, code: made.code, host: true, waiting: true, mode };
    },
  };
}

module.exports = { createCarromAdapter, mergeSettings, doublesOrder, actorSeat, QUEUE_PATHS };
