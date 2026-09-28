/**
 * Dangal P9 — Tambola / Housie (90-ball) and Bingo (75-ball) rooms on the party-room engine
 * (GAMES.tambola). Built for big groups: 2 to 120 players in one room.
 *
 * - Server authority: CSPRNG tickets and draw order live in `server` (Admin only). `pub.state` is
 *   numbers only (called list, prizes, winners) — it never carries a ticket.
 * - Tickets are written once to games/tambola/{code}/secrets/{uid} at the deal (packed strings);
 *   a player's secret changes again only when their own claim is blocked or the game ends.
 * - Daubs are client-side (no writes). A claim is one op, checked against the numbers called at
 *   claim time; first valid claim wins, same-call claims within TambolaCore.TIE_MS share it; a bogey
 *   blocks that ticket for that prize (or warns first — host setting). One claim per 1.5 s per player.
 * - Private rooms (host-run, Baithak/Mehfil): "just for fun" points or table-only chips. Nothing
 *   touches the wallet or Firestore.
 * - Public tables (op quick): wallet chip tickets, 18+, up to 40 humans (one Firestore batch), bots
 *   fill empty seats. The lobby counts down and starts itself (lobbyTick). Prizes are shares of the
 *   ticket pot; a bot's winnings and unclaimed prizes go back to the buyers — bots never take chips.
 *   Settled as one zero-sum ledger. Virtual chips, never money.
 */
'use strict';

const crypto = require('crypto');
const Core = require('../public/src/js/games/tambola-core.js');

const MAX_ROOM = 120;
const MAX_WALLET_HUMANS = 40;
const MAX_BOTS = 30;
const PUBLIC_MIN_SEATS = 6;
const PUBLIC_LOBBY_MS = 45000;
const PUBLIC_PATH = 'tambolaPublic/p';

const REASONS = {
  slow_down: 'Wait a moment before claiming again',
  blocked: 'That ticket is blocked for this prize after a bogey',
  not_yet: 'That prize opens after the one before it is won',
  taken: 'That prize has already been won',
  already_won: 'You’ve already won that prize',
  no_ticket: 'Pick one of your tickets',
  no_prize: 'That prize isn’t in this game',
  left: 'You left this game',
  not_seated: 'You’re watching this game',
  over: 'This game has finished',
};

const cryptoRng = () => crypto.randomInt(0, 0x100000000) / 0x100000000;

function createTambolaAdapter({ err, rng }) {
  const shuffleRng = typeof rng === 'function' ? rng : cryptoRng;

  function mergeSettings(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const s = Core.mergeSettings(r);
    s.bots = Math.max(0, Math.min(MAX_BOTS, Math.floor(Number(r.bots) || 0)));
    return s;
  }

  /** Settings for the deal: public tables are wallet-priced (server-set `pub.table`, never client input). */
  function dealSettings(room) {
    const set = mergeSettings(room.pub.settings);
    const table = room.pub.table;
    if (table && table.public) Object.assign(set, { mode: 'wallet', price: Number(table.price) || 10, public: true, bogey: 'block', daub: set.daub });
    return set;
  }

  const seatOf = (s, uid) => (s && s.pub ? s.pub.seats.findIndex((x) => x.id === uid && !x.bot) : -1);

  function syncPrivate(room) {
    const st = room.server.pub;
    const next = {};
    st.seats.forEach((x, i) => {
      if (x.bot || !room.pub.players[x.id]) return;
      next[x.id] = Object.assign({ roundNo: room.server.roundNo || room.pub.roundNo }, Core.privateView(st, i));
    });
    room.secrets = next;
  }

  function queueSettlement(room) {
    const s = room.server;
    const st = s.pub;
    if (!st.over || s.scored) return;
    s.scored = true;
    const res = st.results || { net: [], win: [] };
    st.seats.forEach((x, i) => {
      if (x.bot || !room.pub.players[x.id]) return;
      room.pub.scores[x.id] = (Number(room.pub.scores[x.id]) || 0) + (res.points ? res.win[i] || 0 : res.net[i] || 0);
    });
    if (st.mode !== 'wallet') {
      room.pub.settlement = null;
      return;
    }
    const humans = st.seats.map((x, i) => ({ x, i })).filter(({ x }) => !x.bot && x.paid > 0);
    const deltas = {};
    humans.forEach(({ x, i }) => (deltas[x.id] = res.net[i] || 0));
    const ranking = humans
      .slice()
      .sort((a, b) => (res.net[b.i] || 0) - (res.net[a.i] || 0))
      .map(({ x }) => x.id);
    const winners = humans.filter(({ i }) => (res.win[i] || 0) > 0).map(({ x }) => x.id);
    room.pub.settlement = { status: 'pending' };
    s.settleReq = { kind: 'ledger', matchId: s.matchId, game: 'tambola', deltas, ranking, winners, forfeits: [], done: false };
  }

  function ticketsFor(room, id, set) {
    const p = room.pub.players[id] || {};
    if (p.sheet && set.variant === '90') return { sheet: true, tickets: 6 };
    return { tickets: Math.max(1, Math.min(set.maxTickets, Math.floor(Number(p.tk) || 1))) };
  }

  return {
    core: Core,
    min: 1,
    max: MAX_ROOM,
    maxFor: (room) => (room.pub.table && room.pub.table.public ? MAX_WALLET_HUMANS : MAX_ROOM),
    mergeSettings,
    deal(room, ids, ctx) {
      const set = dealSettings(room);
      const players = ids.map((id) => Object.assign({ id, name: room.pub.players[id].name }, ticketsFor(room, id, set)));
      let bots = set.public ? Math.max(0, PUBLIC_MIN_SEATS - ids.length) : set.bots;
      if (!set.public && ids.length + bots < 2) bots = 2 - ids.length;
      for (let i = 0; i < bots; i++) players.push({ id: 'bot' + (i + 1), name: Core.botName(i), bot: true, tickets: 1 + Math.floor(shuffleRng() * 2) });
      const st = Core.newGame(players, set, shuffleRng, ctx.now);
      room.server = {
        settings: set,
        pub: st,
        roundNo: ctx.roundNo,
        scored: false,
        matchId: 'tambola_' + String(room.pub.host || '').slice(0, 10) + '_' + (room.pub.createdAt || ctx.now) + '_' + ctx.roundNo,
        settleReq: null,
      };
      room.pub.settlement = null;
      syncPrivate(room);
    },
    view: (s) => Core.publicView(s.pub),
    phaseKey: (s) => (s.pub.over ? 'over' : 'q' + s.pub.seq),
    deadlineMs(s) {
      const st = s.pub;
      if (st.over) return 0;
      return Math.max(50, Core.nextEventAt(st) - (Number(st.now) || 0));
    },
    apply(room, action) {
      const s = room.server;
      const st = s.pub;
      if (st.over) return { error: 'over', reason: REASONS.over };
      const now = Number(action.now) || Date.now();
      let out = {};
      switch (action.type) {
        case 'advance':
          out = Core.advance(st, now, shuffleRng);
          break;
        case 'claim':
          out = Core.claim(st, Number(action.seat), { key: action.key, t: action.t }, now);
          break;
        case 'pace': {
          const pace = Core.PACES.indexOf(Number(action.pace)) >= 0 ? Number(action.pace) : 8;
          st.paceMs = pace * 1000;
          st.nextAt = Math.min(st.nextAt, now + st.paceMs);
          st.now = now;
          st.seq++;
          break;
        }
        case 'end':
          Core.end(st, 'host');
          st.seq++;
          break;
        default:
          return { error: 'bad_action' };
      }
      if (out && out.error) return Object.assign({}, out, { reason: REASONS[out.error] || out.error });
      return out || {};
    },
    afterChange(room) {
      syncPrivate(room);
      queueSettlement(room);
    },
    absent() {},
    timeout(room, ctx) {
      if (room.server.pub.over) return;
      ctx.act({ type: 'advance', now: ctx.now }, true);
    },
    onResume(room, ms) {
      if (room.server && room.server.pub) Core.shiftClock(room.server.pub, ms);
    },
    betweenRounds: (s) => !!s.pub.over,
    canNext: () => false,
    newGameOnStart: () => false,
    onJoinPlaying: () => true,
    onJoinLobby(room, uid) {
      const p = room.pub.players[uid];
      if (p && !p.tk) p.tk = 1;
    },
    onLeave(room, uid) {
      const s = room.server;
      const i = seatOf(s, uid);
      if (i < 0 || s.pub.over) return;
      Core.leave(s.pub, i);
      const alive = s.pub.seats.filter((x) => !x.bot && !x.left);
      if (!alive.length) Core.end(s.pub, 'empty');
    },
    /** Public tables start when the lobby countdown ends. */
    lobbyTick: (room) => !!(room.pub.table && room.pub.table.public),
    ageGated: true,
    /** Only wallet (public) tables are 18+; private rooms are for everyone. Public settings are fixed. */
    ageCheck(room, uid, op, status) {
      const table = room.pub.table;
      if (!table || !table.public) return;
      if (op === 'settings') throw err('fixed', 'Public tables have fixed settings');
      if (op === 'start') throw err('auto_start', 'Public tables start on their own');
      if (status !== 'ok') {
        throw status === 'under_18'
          ? err('age_gate', 'Chip tables are for players 18 and over — try a private room')
          : err('age_confirm', 'Confirm you’re 18 or older to buy chip tickets');
      }
    },
    prepareOps: ['tickets'],
    /** Wallet balance for chip tickets (outside the room transaction). */
    async prepare(adminApp, rtdb, path, uid, deps) {
      const snap = await rtdb.ref(path + '/pub/table').once('value');
      const table = snap.val();
      if (!table || !table.public) return {};
      const economy = (deps && deps.economy) || require('./dangal-economy.js');
      const db = (deps && deps.db) || adminApp.firestore();
      const admin = (deps && deps.admin) || adminApp;
      return { balance: (await economy.getWallet(db, admin, uid)).balance };
    },
    ops: {
      claim(ctx) {
        const i = seatOf(ctx.room.server, ctx.uid);
        if (i < 0) throw err('not_seated', REASONS.not_seated);
        return ctx.act({ type: 'claim', seat: i, key: String(ctx.args.key || ''), t: Math.floor(Number(ctx.args.t) || 0), now: ctx.now }) || {};
      },
      pace(ctx) {
        if (!ctx.isHost) throw err('host_only', 'Only the host can change the pace');
        if (ctx.room.pub.table && ctx.room.pub.table.public) throw err('fixed', 'Public tables have a fixed pace');
        ctx.act({ type: 'pace', pace: ctx.args.pace, now: ctx.now });
        return {};
      },
      end_game(ctx) {
        if (!ctx.isHost) throw err('host_only', 'Only the host can end the game');
        if (ctx.room.pub.table && ctx.room.pub.table.public) throw err('fixed', 'Public tables play to the end');
        ctx.act({ type: 'end', now: ctx.now });
        return {};
      },
    },
    lobbyOps: {
      /** How many tickets I'm buying (1–6), or a full sheet of six (90-ball: every number once). */
      tickets(ctx) {
        const p = ctx.room.pub.players[ctx.uid];
        const set = dealSettings(ctx.room);
        const sheet = !!ctx.args.sheet && set.variant === '90';
        const n = sheet ? 6 : Math.max(1, Math.min(set.maxTickets, Math.floor(Number(ctx.args.n) || 1)));
        if (set.mode === 'wallet') {
          const bal = Math.floor(Number(ctx.args.prep && ctx.args.prep.balance) || 0);
          if (n * set.price > bal) throw err('insufficient_chips', 'Not enough chips for ' + n + ' ticket' + (n > 1 ? 's' : ''));
        }
        p.tk = n;
        p.sheet = sheet;
        return { tickets: n, sheet };
      },
      setBots(ctx) {
        if (!ctx.isHost) throw err('host_only', 'Only the host can add bots');
        if (ctx.room.pub.table && ctx.room.pub.table.public) throw err('fixed', 'Public tables fill seats on their own');
        const p = ctx.room.pub;
        p.settings = mergeSettings(Object.assign({}, p.settings, { bots: ctx.args.bots }));
        return { settings: p.settings };
      },
    },
    hydrate(s) {
      s.settings = Object.assign(mergeSettings(s.settings), s.settings && s.settings.public ? { mode: 'wallet', price: Number(s.settings.price) || 10, public: true } : {});
      s.pub = Core.hydrate(s.pub);
      s.scored = !!s.scored;
      s.roundNo = Number(s.roundNo) || 0;
      if (s.settleReq) {
        s.settleReq.ranking = s.settleReq.ranking || [];
        s.settleReq.forfeits = s.settleReq.forfeits || [];
        s.settleReq.deltas = s.settleReq.deltas || {};
        s.settleReq.winners = s.settleReq.winners || [];
        s.settleReq.done = !!s.settleReq.done;
      }
    },
    pendingSettlement: (s) => (s && s.settleReq && !s.settleReq.done ? s.settleReq : null),

    /**
     * Public chip table (op quick): join the table filling up at this ticket price, or open one.
     * The table is marked public by the server (`pub.table`), starts after a 45 s countdown, and
     * tops up with bots to 6 seats.
     */
    async quick(adminApp, uid, op, body, now, partyRoom, tools) {
      if (op === 'quick_cancel') return { cancelled: true };
      if (body.adult !== 'ok') {
        throw body.adult === 'under_18'
          ? err('age_gate', 'Chip tables are for players 18 and over — try a private room')
          : err('age_confirm', 'Confirm you’re 18 or older to buy chip tickets');
      }
      const price = Core.PRICES.indexOf(Number(body.price)) >= 0 ? Number(body.price) : 10;
      const deps = (tools && tools.deps) || {};
      const economy = deps.economy || require('./dangal-economy.js');
      const db = deps.db || adminApp.firestore();
      const admin = deps.admin || adminApp;
      const bal = (await economy.getWallet(db, admin, uid)).balance;
      if (bal < price) throw err('insufficient_chips', 'You need ' + price + ' chips for a ticket');
      const ref = adminApp.database().ref(PUBLIC_PATH + price);
      const cur = (await ref.once('value')).val();
      if (cur && cur.code && now - (Number(cur.at) || 0) < PUBLIC_LOBBY_MS - 3000) {
        try {
          const out = await partyRoom(adminApp, uid, { op: 'join', game: 'tambola', code: cur.code, name: body.name });
          if (!out.pending) return { code: cur.code, host: false, price, startsAt: Number(cur.at) + PUBLIC_LOBBY_MS };
        } catch (e) {
          if (['room_full', 'room_closed', 'room_not_found', 'not_member'].indexOf(e.code) < 0) throw e;
        }
      }
      const made = await partyRoom(adminApp, uid, { op: 'create', game: 'tambola', name: body.name, settings: { variant: '90', pace: 8, mode: 'table', price } });
      const path = 'games/tambola/' + made.code;
      await tools.transact(path, (room) => {
        if (!room || !room.pub) return null;
        room.pub.table = { public: true, price };
        room.pub.settings = Object.assign(mergeSettings({ variant: '90', pace: 8, price }), { mode: 'wallet', price, public: true });
        room.pub.deadline = now + PUBLIC_LOBBY_MS;
        if (room.pub.players[uid]) room.pub.players[uid].adult = true;
        return { room, result: {} };
      });
      await ref.set({ code: made.code, at: now });
      return { code: made.code, host: true, price, startsAt: now + PUBLIC_LOBBY_MS };
    },
  };
}

module.exports = { createTambolaAdapter, cryptoRng, REASONS, PUBLIC_LOBBY_MS, MAX_WALLET_HUMANS };
