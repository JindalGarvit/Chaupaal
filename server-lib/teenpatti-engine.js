/**
 * Dangal P8 — Teen Patti Live tables on the party-room engine (GAMES.teenpatti). 18+ everywhere.
 *
 * - Server authority: CSPRNG shuffle and deal here; every hand lives in `server` (Admin only).
 *   `pub.state` is TeenPattiCore.publicView() — stakes, pot, who is blind/seen, and only the hands
 *   shown at a show. Your own cards reach games/teenpatti/{code}/secrets/{uid} only after you look
 *   (blind play is real); a side-show peek is written only to the two players involved.
 * - Every bet, show and side show is validated by TeenPattiCore.apply() in the room transaction.
 * - Turn clock: turnMs, then the seat's extra-time bank; a timeout packs. Two timeouts in a row sit
 *   the seat out (auto-pack) until the player taps I'm back. Leaving packs and leaves the table.
 * - Chips: the host picks a buy-in; each stack is min(buy-in, wallet) read before the deal. The
 *   table plays a fixed number of hands (or until the host ends it); then everyone's result is
 *   stack − starting stack, settled as one zero-sum ledger (dangal-economy.resolveLedger).
 *   Any bot at the table → play chips only, nothing moves. Unrated. Virtual chips, never money.
 */
'use strict';

const crypto = require('crypto');
const Core = require('../public/src/js/games/teenpatti-core.js');
const Policy = require('../public/src/js/dangal/dangal-live-policy.js');

const POL = Policy.policyFor('teenpatti');
const TURN_MS = POL.turnMs || Core.TURN_MS;
const BANK_MS = POL.bankMs || Core.BANK_MS;
const BOT_MS = 1200;
const AWAY_MS = 900;
const HAND_GAP_MS = 7000;

const REASONS = {
  not_your_turn: 'Not your turn',
  phase: 'Not now',
  short: 'Not enough chips for that — pack, or show if two remain',
  cap: 'The stake is at the chaal limit',
  show_blind: 'You can’t ask a blind player for a show',
  show_two: 'Show is only for the last two players',
  no_sideshow: 'Side show needs the previous player to be seen',
  not_in_hand: 'You’re out of this hand',
  seen: 'You’ve already looked',
  over: 'This table has finished',
};

const cryptoRng = () => crypto.randomInt(0, 0x100000000) / 0x100000000;

function createTeenPattiAdapter({ err, rng }) {
  const shuffleRng = typeof rng === 'function' ? rng : cryptoRng;

  function mergeSettings(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const s = Core.mergeSettings(r);
    s.bots = Math.max(0, Math.min(Core.MAX_PLAYERS - 1, Math.floor(Number(r.bots) || 0)));
    s.botLevel = Core.LEVELS.indexOf(r.botLevel) >= 0 ? r.botLevel : 'normal';
    return s;
  }

  const seatOf = (s, uid) => (s && s.pub ? s.pub.seats.findIndex((x) => x.id === uid && !x.bot) : -1);
  const botName = (i, level) => 'Bot ' + (i + 1) + ' · ' + level.charAt(0).toUpperCase() + level.slice(1);

  function syncPrivate(room) {
    const s = room.server;
    const st = s.pub;
    room.secrets = {};
    st.seats.forEach((x, i) => {
      if (x.bot || !room.pub.players[x.id]) return;
      room.secrets[x.id] = Object.assign({ roundNo: room.pub.roundNo }, Core.privateView(st, i));
    });
    st.seats.forEach((x) => {
      if (room.pub.players[x.id]) room.pub.scores[x.id] = x.stack;
    });
  }

  function queueSettlement(room) {
    const s = room.server;
    const st = s.pub;
    if (!st.over || s.settleReq) return;
    const inRoom = (x) => !x.bot && !!room.pub.players[x.id];
    const humans = st.seats.filter(inRoom);
    const ranking = (st.ranking || []).map((i) => st.seats[i]).filter((x) => x && inRoom(x)).map((x) => x.id);
    const forfeits = st.seats.filter((x) => inRoom(x) && x.left).map((x) => x.id);
    room.pub.settlement = { status: 'pending' };
    if (!s.chip || humans.length < 2) {
      s.settleReq = { matchId: s.matchId, game: 'teenpatti', ranking, teams: null, stake: 0, draw: false, rolls: {}, forfeits, stayer: null, done: false };
      return;
    }
    const deltas = {};
    humans.forEach((x) => (deltas[x.id] = x.stack - x.initial));
    const top = Math.max.apply(null, humans.map((x) => deltas[x.id]));
    const winners = top > 0 ? humans.filter((x) => deltas[x.id] === top).map((x) => x.id) : [];
    s.settleReq = { kind: 'ledger', matchId: s.matchId, game: 'teenpatti', deltas, ranking, winners, forfeits, done: false };
  }

  function actorSeat(st) {
    return Core.actor(st);
  }

  function seatAction(ctx, type, extra) {
    const i = seatOf(ctx.room.server, ctx.uid);
    if (i < 0) throw err('not_seated', 'You’re watching this table');
    ctx.act(Object.assign({ type: 'act', seat: i, now: ctx.now, a: Object.assign({ type }, extra || {}) }));
    return {};
  }

  return {
    core: Core,
    min: 1,
    max: Core.MAX_PLAYERS,
    mergeSettings,
    deal(room, ids, ctx) {
      const set = mergeSettings(room.pub.settings);
      const humans = ids.slice();
      if (humans.some((id) => !room.pub.players[id].adult)) throw err('age_gate', 'Teen Patti is for players 18 and over');
      const bots = Math.max(0, Math.min(set.bots, Core.MAX_PLAYERS - humans.length));
      if (humans.length + bots < Core.MIN_PLAYERS) throw err('need_players', 'Teen Patti needs 3 players — add bots or invite friends');
      const chip = bots > 0 ? 0 : set.buyIn;
      const balances = (ctx.args && ctx.args.prep && ctx.args.prep.balances) || {};
      const boot = Core.bootFor(Object.assign({}, set, { buyIn: chip }));
      const players = humans.map((id) => {
        const p = { id, name: room.pub.players[id].name };
        if (chip) {
          const bal = Math.floor(Number(balances[id]) || 0);
          p.stack = Math.min(chip, bal);
          if (p.stack < boot * 2) throw err('insufficient_chips', p.name + ' needs at least ' + boot * 2 + ' chips for this table');
        }
        return p;
      });
      for (let i = 0; i < bots; i++) players.push({ id: 'bot' + (i + 1), name: botName(i, set.botLevel), bot: true, level: set.botLevel });
      const st = Core.newMatch(players, Object.assign({}, set, { buyIn: chip }), shuffleRng);
      if (st.error) throw err('need_players', 'Teen Patti needs more players');
      room.server = {
        settings: set,
        pub: st,
        chip,
        bank: players.map(() => BANK_MS),
        inBank: false,
        bankAt: 0,
        matchId: 'teenpatti_' + String(room.pub.host || '').slice(0, 10) + '_' + (room.pub.createdAt || ctx.now) + '_' + ctx.roundNo,
        settleReq: null,
      };
      room.pub.settlement = null;
      syncPrivate(room);
    },
    view: (s) => Object.assign(Core.publicView(s.pub), { chip: s.chip || 0, bank: (s.bank || []).slice(), inBank: !!s.inBank }),
    phaseKey: (s) => (s.pub.over ? 'over:' + s.pub.seq : [s.pub.handNo, s.pub.hand ? s.pub.hand.phase : 'none', actorSeat(s.pub), s.inBank ? 1 : 0].join(':')),
    deadlineMs(s) {
      const st = s.pub;
      if (st.over || !st.hand) return 0;
      if (st.hand.phase === 'done') return HAND_GAP_MS;
      const a = actorSeat(st);
      const who = st.seats[a];
      if (!who) return TURN_MS;
      if (who.bot) return BOT_MS;
      if (who.away || who.left) return AWAY_MS;
      if (s.inBank) return Math.max(1000, Number(s.bank[a]) || 0);
      return TURN_MS;
    },
    apply(room, action) {
      const s = room.server;
      const st = s.pub;
      if (st.over) return { error: 'over' };
      const now = Number(action.now) || Date.now();
      const before = st.handNo + ':' + actorSeat(st) + ':' + (st.hand ? st.hand.phase : '');
      let out = {};
      switch (action.type) {
        case 'act': {
          const seat = Number(action.seat);
          const mine = s.inBank && actorSeat(st) === seat;
          out = Core.apply(st, seat, action.a || {});
          if (!out.error && mine) s.bank[seat] = Math.max(0, (Number(s.bank[seat]) || 0) - Math.max(0, now - (Number(s.bankAt) || now)));
          break;
        }
        case 'bank':
          if (s.inBank) return { error: 'phase' };
          s.inBank = true;
          s.bankAt = now;
          return {};
        case 'bot': {
          const seat = actorSeat(st);
          if (seat < 0 || !st.seats[seat].bot) return { error: 'phase' };
          let guard = 0;
          // A bot's "see" doesn't end its turn: keep going until it has bet, packed or answered.
          do {
            const a = Core.botAction(st, seat, Math.random) || Core.autoAction(st, seat);
            out = Core.apply(st, seat, a);
            if (out.error) out = Core.apply(st, seat, Core.autoAction(st, seat));
          } while (!out.error && !st.over && actorSeat(st) === seat && st.hand.phase !== 'done' && guard++ < 3);
          break;
        }
        case 'auto': {
          const seat = Number(action.seat);
          out = Core.apply(st, seat, Core.autoAction(st, seat));
          break;
        }
        case 'next_hand':
          out = Core.nextHand(st, shuffleRng);
          break;
        case 'end':
          if (st.hand && st.hand.phase !== 'done') return { error: 'phase' };
          out = Core.endMatch(st);
          break;
        default:
          return { error: 'bad_action' };
      }
      if (out && out.error) return Object.assign({}, out, { reason: REASONS[out.error] || out.error });
      const after = st.handNo + ':' + actorSeat(st) + ':' + (st.hand ? st.hand.phase : '');
      if (after !== before) s.inBank = false;
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
      if (st.over || !st.hand) return;
      if (st.hand.phase === 'done') return ctx.act({ type: 'next_hand', now: ctx.now }, true);
      const seat = actorSeat(st);
      if (seat < 0) return;
      const who = st.seats[seat];
      if (who.bot) return ctx.act({ type: 'bot', now: ctx.now }, true);
      if (who.away || who.left) return ctx.act({ type: 'auto', seat, now: ctx.now }, true);
      if (!s.inBank && (Number(s.bank[seat]) || 0) >= 1000) return ctx.act({ type: 'bank', now: ctx.now }, true);
      s.bank[seat] = 0;
      const step = Policy.afkStep(who.afk || 0, POL);
      if (step.forfeit && st.hand.phase === 'bet') {
        ctx.act({ type: 'act', seat, now: ctx.now, a: { type: 'forfeit', reason: 'afk', auto: true } }, true);
        who.afk = 0;
        return;
      }
      ctx.act({ type: 'auto', seat, now: ctx.now }, true);
      who.afk = step.misses;
    },
    betweenRounds: (s) => !!s.pub.over,
    canNext: () => false,
    newGameOnStart: () => true,
    onJoinPlaying: () => true,
    onLeave(room, uid) {
      const s = room.server;
      const i = seatOf(s, uid);
      if (i < 0 || s.pub.over) return;
      Core.apply(s.pub, i, { type: 'forfeit', reason: 'left' });
      const alive = s.pub.seats.filter((x) => !x.left && !x.bot);
      if (!alive.length && (!s.pub.hand || s.pub.hand.phase === 'done')) Core.endMatch(s.pub);
    },
    ageGated: true,
    /** 18+ for every Teen Patti seat, chip or not (server-verified). */
    ageCheck(room, uid, op, status) {
      if (op !== 'start' && status !== 'ok') {
        throw status === 'under_18'
          ? err('age_gate', 'Teen Patti is for players 18 and over')
          : err('age_confirm', 'Confirm you’re 18 or older to play Teen Patti');
      }
      if (op === 'start') {
        const minors = Object.keys(room.pub.players).filter((id) => !room.pub.players[id].left && !room.pub.players[id].adult);
        if (minors.length) throw err('age_gate', 'Teen Patti is for players 18 and over');
      }
    },
    /** Wallet balances for the buy-in (outside the room transaction). */
    async prepare(adminApp, rtdb, path, uid, deps) {
      const snap = await rtdb.ref(path + '/pub').once('value');
      const pub = snap.val() || {};
      const set = mergeSettings(pub.settings);
      if (!set.buyIn || set.bots > 0) return {};
      const economy = (deps && deps.economy) || require('./dangal-economy.js');
      const db = (deps && deps.db) || adminApp.firestore();
      const admin = (deps && deps.admin) || adminApp;
      const players = pub.players || {};
      const ids = Object.keys(players).filter((id) => !players[id].left);
      const balances = {};
      for (const id of ids) balances[id] = (await economy.getWallet(db, admin, id)).balance;
      return { balances };
    },
    ops: {
      see: (ctx) => seatAction(ctx, 'see'),
      pack: (ctx) => seatAction(ctx, 'pack'),
      chaal: (ctx) => seatAction(ctx, 'chaal'),
      raise: (ctx) => seatAction(ctx, 'raise'),
      show: (ctx) => seatAction(ctx, 'show'),
      sideshow: (ctx) => seatAction(ctx, 'sideshow'),
      respond: (ctx) => seatAction(ctx, 'respond', { accept: !!ctx.args.accept }),
      back: (ctx) => seatAction(ctx, 'back'),
      end_table(ctx) {
        if (!ctx.isHost) throw err('host_only', 'Only the host can end the table');
        ctx.act({ type: 'end', now: ctx.now });
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
      const n = s.pub.seats.length;
      const bank = Array.isArray(s.bank) ? s.bank : [];
      s.bank = [];
      for (let i = 0; i < n; i++) s.bank.push(bank[i] == null ? BANK_MS : Number(bank[i]) || 0);
      s.inBank = !!s.inBank;
      s.bankAt = Number(s.bankAt) || 0;
      s.chip = Number(s.chip) || 0;
      if (s.settleReq) {
        if (s.settleReq.kind !== 'h2h') {
          s.settleReq.ranking = s.settleReq.ranking || [];
          s.settleReq.forfeits = s.settleReq.forfeits || [];
          s.settleReq.rolls = s.settleReq.rolls || {};
          s.settleReq.deltas = s.settleReq.deltas || {};
          s.settleReq.winners = s.settleReq.winners || [];
        }
        s.settleReq.done = !!s.settleReq.done;
      }
    },
    pendingSettlement: (s) => (s && s.settleReq && !s.settleReq.done ? s.settleReq : null),
  };
}

module.exports = { createTeenPattiAdapter, cryptoRng };
