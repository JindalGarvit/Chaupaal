/**
 * Dangal P8 — Rummy Live rooms (13-card Points / Pool / Deals, Gin) on the party-room engine (GAMES.rummy).
 *
 * - Server authority: the deck is shuffled with the server CSPRNG and dealt here. Every hand and the
 *   closed deck live in `server` (Admin only). `pub.state` is RummyCore.publicView() — card counts,
 *   the open pile, the declarer's show, and every hand only once the deal is over. Each player's
 *   own hand goes to games/rummy/{code}/secrets/{uid}, readable only by that uid.
 * - Every draw / discard / drop / declaration / meld is validated by RummyCore.apply() inside the
 *   room transaction; a wrong declaration is detected here, never trusted from the phone.
 * - After a valid declaration the others have MELD_MS to show their groups; the server groups
 *   anyone who doesn't (and every bot) with the optimal solver.
 * - Turn clock (Live policy): turnMs, then the seat's extra-time bank, then AFK — the first miss
 *   auto-plays (draw + throw), the second in a row auto-drops (Deals: full count; Gin: forfeit).
 * - Bots are labelled "Bot" and act one move per tick so everyone sees each move. Any bot at the
 *   table makes it friendly: no chips move.
 * - Chips: two humans → rated head-to-head (resolveGame). Three or more → a zero-sum ledger
 *   (dangal-economy.resolveLedger). Chip tables are 18+ (the room's age check, server-verified).
 */
'use strict';

const crypto = require('crypto');
const Core = require('../public/src/js/games/rummy-core.js');
const Policy = require('../public/src/js/dangal/dangal-live-policy.js');

const POL = Policy.policyFor('rummy');
const TURN_MS = POL.turnMs || Core.TURN_MS;
const GIN_TURN_MS = Core.GIN_TURN_MS;
const BANK_MS = POL.bankMs || Core.BANK_MS;
const MELD_MS = POL.meldMs || Core.MELD_MS;
const BOT_MS = 1100;
const DEAL_GAP_MS = 9000;
const MAX_BOTS = 5;

const REASONS = {
  not_your_turn: 'Not your turn',
  phase: 'Not now — wait for your turn',
  joker_pick: 'Jokers can’t be picked from the open pile',
  same_card: 'You can’t throw back the card you just picked',
  no_card: 'That card isn’t in your hand',
  bad_groups: 'Those groups don’t match your cards',
  no_drop: 'There’s no drop in Deals',
  cant_knock: 'Too much deadwood to knock',
  stock_only: 'Draw from the stock this turn',
  no_biggin: 'Big Gin is off at this table',
  no_rejoin: 'Rejoin isn’t open',
  done: 'Your groups are in',
  over: 'This game is over',
};

const cryptoRng = () => crypto.randomInt(0, 0x100000000) / 0x100000000;

function ageError(err, status) {
  return status === 'under_18'
    ? err('age_gate', 'Chip tables are for players 18 and over — chip-free tables and practice are open to everyone')
    : err('age_confirm', 'Confirm you’re 18 or older to play at a chip table');
}

function createRummyAdapter({ err, rng }) {
  const shuffleRng = typeof rng === 'function' ? rng : cryptoRng;

  function mergeSettings(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const s = Core.mergeSettings(r);
    s.bots = Math.max(0, Math.min(MAX_BOTS, Math.floor(Number(r.bots) || 0)));
    if (s.mode === 'gin') s.bots = Math.min(1, s.bots);
    s.botLevel = Core.LEVELS.indexOf(r.botLevel) >= 0 ? r.botLevel : 'normal';
    s.quick = !!r.quick;
    return s;
  }

  /** Chips only move at all-human tables. */
  const chipTable = (set) => Core.chipAmount(set) > 0 && !(set.bots > 0);
  const seatOf = (s, uid) => (s && s.pub ? s.pub.seats.findIndex((x) => x.id === uid && !x.bot) : -1);
  const botName = (i, level) => 'Bot ' + (i + 1) + ' · ' + level.charAt(0).toUpperCase() + level.slice(1);
  const turnMs = (s) => (s.pub.mode === 'gin' ? GIN_TURN_MS : TURN_MS);

  function syncPrivate(room) {
    const s = room.server;
    const st = s.pub;
    room.secrets = {};
    st.seats.forEach((x, i) => {
      if (x.bot || !room.pub.players[x.id]) return;
      room.secrets[x.id] = Object.assign({ roundNo: room.pub.roundNo }, Core.privateView(st, i));
    });
    st.seats.forEach((x) => {
      if (room.pub.players[x.id]) room.pub.scores[x.id] = x.score;
    });
  }

  function queueSettlement(room) {
    const s = room.server;
    const st = s.pub;
    if (!st.over || s.settleReq) return;
    const inRoom = (x) => !x.bot && !!room.pub.players[x.id];
    const humans = st.seats.filter(inRoom);
    const hasBots = st.seats.some((x) => x.bot);
    const winner = st.seats[st.winner] || null;
    const ranking = (st.ranking || []).map((i) => st.seats[i]).filter((x) => x && inRoom(x)).map((x) => x.id);
    const forfeits = st.seats.filter((x) => inRoom(x) && x.left).map((x) => x.id);
    const chip = hasBots ? 0 : s.chip || 0;
    room.pub.settlement = { status: 'pending' };
    if (humans.length === 2 && !hasBots) {
      const a = winner && inRoom(winner) ? winner : humans[0];
      const b = humans.find((x) => x.id !== a.id);
      const ai = st.seats.indexOf(a);
      const bi = st.seats.indexOf(b);
      let stake = 0;
      if (chip) {
        if (st.format === 'points') stake = (st.seats[bi === st.winner ? ai : bi].score || 0) * chip;
        else stake = chip;
      }
      s.settleReq = {
        kind: 'h2h',
        matchId: s.matchId,
        game: 'rummy',
        a: a.id,
        b: b.id,
        result: st.winner === ai ? 'win' : st.winner === bi ? 'loss' : 'draw',
        rated: true,
        stake,
        done: false,
      };
      return;
    }
    if (!chip || humans.length < 2) {
      s.settleReq = { matchId: s.matchId, game: 'rummy', ranking, teams: null, stake: 0, draw: false, rolls: {}, forfeits, stayer: null, done: false };
      return;
    }
    const deltas = {};
    if (st.format === 'points') {
      let pot = 0;
      humans.forEach((x) => {
        const i = st.seats.indexOf(x);
        if (i === st.winner) return;
        const loss = (x.score || 0) * chip;
        deltas[x.id] = -loss;
        pot += loss;
      });
      if (winner) deltas[winner.id] = pot;
    } else {
      // Pool / Deals: every entry (and Pool rejoin) paid the fee into the pot; the winner takes it.
      humans.forEach((x) => (deltas[x.id] = -(x.entries || 1) * chip));
      if (winner) deltas[winner.id] += s.pot || 0;
    }
    s.settleReq = { kind: 'ledger', matchId: s.matchId, game: 'rummy', deltas, ranking, winners: winner ? [winner.id] : [], forfeits, done: false };
  }

  /** Bots owing a meld show at once; returns true if anything changed. */
  function botMelds(st) {
    let n = 0;
    Core.meldPending(st).forEach((i) => {
      if (!st.seats[i].bot) return;
      if (!Core.apply(st, i, { type: 'auto_meld', auto: true }, { rng: shuffleRng }).error) n++;
    });
    return n > 0;
  }

  function phaseGroup(st) {
    const d = st.deal;
    if (!d) return 'none';
    return d.phase === 'discard' ? 'turn' : d.phase === 'draw' ? 'turn' : d.phase;
  }

  function seatAction(ctx, type, extra) {
    const i = seatOf(ctx.room.server, ctx.uid);
    if (i < 0) throw err('not_seated', 'You’re watching this game');
    const out = ctx.act(Object.assign({ type: 'act', seat: i, now: ctx.now, a: Object.assign({ type }, extra || {}) }));
    return out && out.valid === false ? { valid: false, reason: out.reason || null } : {};
  }

  return {
    core: Core,
    min: 1,
    max: 6,
    maxFor: (room) => (mergeSettings(room.pub.settings).mode === 'gin' ? 2 : 6),
    mergeSettings,
    deal(room, ids, ctx) {
      const set = mergeSettings(room.pub.settings);
      const rot = (ctx.roundNo - 1) % Math.max(1, ids.length);
      const humans = ids.slice(rot).concat(ids.slice(0, rot));
      const players = humans.map((id) => ({ id, name: room.pub.players[id].name }));
      const cap = set.mode === 'gin' ? 2 : 6;
      if (players.length > cap) throw err('too_many_players', set.mode === 'gin' ? 'Gin is for two players' : 'Rummy seats up to six');
      const bots = Math.max(0, Math.min(set.bots, cap - players.length));
      for (let i = 0; i < bots; i++) players.push({ id: 'bot' + (i + 1), name: botName(i, set.botLevel), bot: true, level: set.botLevel });
      if (set.mode === 'gin' && players.length !== 2) throw err('need_players', 'Gin needs two players — add a bot or invite a friend');
      if (players.length < 2) throw err('need_players', 'Rummy needs 2 players — add a bot or invite a friend');
      const chip = bots > 0 ? 0 : Core.chipAmount(set);
      if (chip > 0) {
        const minors = humans.filter((id) => !room.pub.players[id].adult);
        if (minors.length) throw err('age_gate', 'Everyone at a chip table must be 18+ — switch to a chip-free table');
      }
      const st = Core.newMatch(players, set, shuffleRng);
      if (st.error) throw err('need_players', 'Rummy needs more players');
      const tag = set.quick ? '_mm_' : '_';
      room.server = {
        settings: set,
        pub: st,
        chip,
        pot: set.mode !== 'gin' && set.format !== 'points' ? chip * humans.length : 0,
        bank: players.map(() => BANK_MS),
        inBank: false,
        bankAt: 0,
        matchId: 'rummy' + tag + String(room.pub.host || '').slice(0, 10) + '_' + (room.pub.createdAt || ctx.now) + '_' + ctx.roundNo,
        settleReq: null,
      };
      room.pub.settlement = null;
      syncPrivate(room);
    },
    view: (s) =>
      Object.assign(Core.publicView(s.pub), {
        chip: s.chip || 0,
        pot: s.pot || 0,
        rate: s.settings.rate,
        fee: s.settings.fee,
        stake: s.settings.stake,
        bank: (s.bank || []).slice(),
        inBank: !!s.inBank,
      }),
    phaseKey: (s) => (s.pub.over ? 'over:' + s.pub.seq : [s.pub.dealNo, phaseGroup(s.pub), s.pub.deal ? s.pub.deal.turn : -1, s.inBank ? 1 : 0].join(':')),
    deadlineMs(s) {
      const st = s.pub;
      if (st.over || !st.deal) return 0;
      const d = st.deal;
      if (d.phase === 'done') return DEAL_GAP_MS;
      if (d.phase === 'meld') return MELD_MS;
      const who = st.seats[d.turn];
      if (who && who.bot) return BOT_MS;
      if (s.inBank) return Math.max(1000, Number(s.bank[d.turn]) || 0);
      return turnMs(s);
    },
    apply(room, action) {
      const s = room.server;
      const st = s.pub;
      if (st.over) return { error: 'over' };
      const now = Number(action.now) || Date.now();
      const ctx = { rng: shuffleRng };
      let out = {};
      const turnBefore = st.deal ? st.dealNo + ':' + st.deal.turn + ':' + phaseGroup(st) : '';
      switch (action.type) {
        case 'act': {
          const seat = Number(action.seat);
          const inBankTurn = s.inBank && st.deal && st.deal.turn === seat;
          out = Core.apply(st, seat, action.a || {}, ctx);
          if (!out.error && inBankTurn) s.bank[seat] = Math.max(0, (Number(s.bank[seat]) || 0) - Math.max(0, now - (Number(s.bankAt) || now)));
          break;
        }
        case 'bank':
          if (s.inBank) return { error: 'phase' };
          s.inBank = true;
          s.bankAt = now;
          return {};
        case 'bot': {
          const d = st.deal;
          if (d.phase === 'done') out = Core.nextDeal(st, shuffleRng);
          else if (d.phase === 'meld') out = botMelds(st) ? {} : { error: 'phase' };
          else {
            const seat = d.turn;
            if (!st.seats[seat].bot) return { error: 'phase' };
            let a = Core.botAction(st, seat, Math.random);
            out = a ? Core.apply(st, seat, a, ctx) : { error: 'phase' };
            if (out.error) {
              a = Core.autoAction(st, seat);
              out = a ? Core.apply(st, seat, a, ctx) : out;
            }
          }
          break;
        }
        case 'next_deal':
          out = Core.nextDeal(st, shuffleRng);
          break;
        case 'auto': {
          // AFK: draw + throw in one go (or auto-group a pending meld).
          const seat = Number(action.seat);
          let a = Core.autoAction(st, seat);
          out = a ? Core.apply(st, seat, a, ctx) : { error: 'phase' };
          if (!out.error && st.deal && st.deal.turn === seat && st.deal.phase === 'discard') {
            a = Core.autoAction(st, seat);
            out = a ? Core.apply(st, seat, a, ctx) : out;
          }
          break;
        }
        case 'meld_timeout':
          Core.meldPending(st).forEach((i) => Core.apply(st, i, { type: 'auto_meld', auto: true }, ctx));
          break;
        case 'rejoin':
          out = Core.rejoin(st, Number(action.seat));
          if (!out.error) s.pot = (Number(s.pot) || 0) + (s.chip || 0);
          break;
        default:
          return { error: 'bad_action' };
      }
      if (out && out.error) return Object.assign({}, out, { reason: REASONS[out.error] || out.error });
      if (!st.over && st.deal && st.deal.phase === 'meld') botMelds(st);
      const turnAfter = st.deal ? st.dealNo + ':' + st.deal.turn + ':' + phaseGroup(st) : '';
      if (turnAfter !== turnBefore) s.inBank = false;
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
      if (st.over || !st.deal) return;
      const d = st.deal;
      if (d.phase === 'done') return ctx.act({ type: 'next_deal', now: ctx.now }, true);
      if (d.phase === 'meld') return ctx.act({ type: 'meld_timeout', now: ctx.now }, true);
      const seat = d.turn;
      const who = st.seats[seat];
      if (who.bot) return ctx.act({ type: 'bot', now: ctx.now }, true);
      if (!s.inBank && (Number(s.bank[seat]) || 0) >= 1000) return ctx.act({ type: 'bank', now: ctx.now }, true);
      s.bank[seat] = 0;
      const step = Policy.afkStep(who.afk || 0, POL);
      if (step.forfeit) {
        if (st.mode === 'gin') return ctx.act({ type: 'act', seat, now: ctx.now, a: { type: 'forfeit', reason: 'afk', auto: true } }, true);
        if (st.format === 'deals') return ctx.act({ type: 'act', seat, now: ctx.now, a: { type: 'forfeit', reason: 'afk', auto: true } }, true);
        if (d.phase === 'draw') {
          const out = ctx.act({ type: 'act', seat, now: ctx.now, a: { type: 'drop', auto: true } }, true);
          who.afk = 0;
          return out;
        }
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
      Core.apply(s.pub, i, { type: 'forfeit', reason: 'left', auto: true }, { rng: shuffleRng });
      if (!s.pub.over && s.pub.deal && s.pub.deal.phase === 'meld') botMelds(s.pub);
    },
    /**
     * Chip tables are 18+ everywhere (server-verified profile / confirmation, never the client's word).
     * `status` is poker-engine ageGate(): 'ok' | 'confirm' | 'under_18'.
     */
    ageGated: true,
    ageCheck(room, uid, op, status) {
      const set = mergeSettings(room.pub.settings);
      if (!chipTable(set)) return;
      if (op !== 'start' && status !== 'ok') throw ageError(err, status);
      if (op === 'settings' || op === 'start') {
        const minors = Object.keys(room.pub.players).filter((id) => !room.pub.players[id].left && !room.pub.players[id].adult);
        if (minors.length) throw err('age_gate', 'Everyone at a chip table must be 18+ — keep this table chip-free');
      }
    },
    ops: {
      draw: (ctx) => seatAction(ctx, 'draw', { from: ctx.args.from === 'open' ? 'open' : 'closed' }),
      discard: (ctx) => seatAction(ctx, 'discard', { card: String(ctx.args.card || '').slice(0, 3) }),
      declare: (ctx) => seatAction(ctx, 'declare', { card: String(ctx.args.card || '').slice(0, 3), groups: ctx.args.groups }),
      drop: (ctx) => seatAction(ctx, 'drop'),
      meld: (ctx) => seatAction(ctx, 'meld', { groups: ctx.args.groups }),
      pass: (ctx) => seatAction(ctx, 'pass'),
      knock: (ctx) => seatAction(ctx, 'knock', { card: String(ctx.args.card || '').slice(0, 3) }),
      biggin: (ctx) => seatAction(ctx, 'biggin'),
      resign: (ctx) => seatAction(ctx, 'forfeit', { reason: 'resign' }),
      rejoin(ctx) {
        const i = seatOf(ctx.room.server, ctx.uid);
        if (i < 0) throw err('not_seated', 'You’re watching this game');
        ctx.act({ type: 'rejoin', seat: i, now: ctx.now });
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
      s.pot = Number(s.pot) || 0;
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

module.exports = { createRummyAdapter, cryptoRng, ageError };
