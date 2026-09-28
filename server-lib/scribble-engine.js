/**
 * Scribble party-room adapter (Dangal P5) — plugged into server-lib/party-deal.js GAMES as `scribble`.
 *
 * - Words are dealt here from server-only packs (scribble-words.js) + the host's moderated custom
 *   words. The word and the three choices sit in `server` (Admin only) and in the drawer's
 *   secrets/{uid}; `pub.state` = ScribbleCore.publicView() → hint pattern only, word at reveal.
 * - Every guess is checked here (correct / near miss / word leak / profanity) inside the room
 *   transaction; near misses are answered privately in the op result.
 * - Strokes don't pass through here: the drawer streams batches to
 *   games/scribble_canvas/{code}/{turnKey} (RTDB rules: only the current drawer writes, members read).
 * - Live policy: drawer disconnects or leaves → turn skipped, no penalty. Pick timeout → auto-pick;
 *   the maxMisses-th missed pick in a row skips the turn. Host migrates (room engine).
 * - Safety: majority vote-kick (3+ players), host kick; kicked players can't rejoin the room.
 * - Optional stake → placement chips by final score (dangal-economy.resolvePlacement).
 */
'use strict';

const crypto = require('crypto');
const Core = require('../public/src/js/games/scribble-core.js');
const Words = require('./scribble-words.js');
const Policy = require('../public/src/js/dangal/dangal-live-policy.js');

const STAKES = [0, 10, 25, 50, 100];
const MIN_TICK_MS = 500;

const cryptoRng = () => crypto.randomInt(0, 0x100000000) / 0x100000000;

function pickStake(v) {
  const n = Math.floor(Number(v) || 0);
  return STAKES.indexOf(n) >= 0 ? n : 0;
}

function createScribbleAdapter({ err, rng }) {
  const pol = Policy.policyFor('scribble');
  const R = typeof rng === 'function' ? rng : cryptoRng;

  function mergeSettings(raw) {
    const s = Core.mergeSettings(raw);
    s.stake = pickStake(raw && raw.stake);
    return s;
  }

  const pickFrom = (list, used) => {
    const fresh = list.filter((w) => used.indexOf(w) < 0);
    const pool = fresh.length ? fresh : list;
    return pool.length ? pool[Math.floor(R() * pool.length)] : null;
  };

  /** One easy, one medium, one hard (custom words: any three), never repeating in this game. */
  function dealChoices(s) {
    const st = s.pub;
    const used = st.used.concat();
    const custom = s.settings.customWords || [];
    const out = [];
    const take = (list) => {
      const w = pickFrom(list.filter((x) => out.indexOf(x) < 0), used);
      if (w) out.push(w);
    };
    if (s.settings.customOnly) {
      for (let i = 0; i < 3; i++) take(custom);
    } else {
      const pool = Words.wordsFor(s.settings.packs);
      if (custom.length) {
        // Custom words join the mix as extra candidates at every difficulty.
        take(R() < 0.5 ? pool.easy.concat(custom) : pool.easy);
        take(pool.medium.concat(custom));
        take(pool.hard.length ? pool.hard : pool.medium);
      } else {
        take(pool.easy.length ? pool.easy : pool.medium);
        take(pool.medium.length ? pool.medium : pool.easy);
        take(pool.hard.length ? pool.hard : pool.medium);
      }
    }
    while (out.length < 3) {
      const all = Words.wordsFor(Core.DEFAULT_PACKS);
      take(all.easy.concat(all.medium));
    }
    return out;
  }

  const present = (room, id) => !!room.pub.players[id] && !room.pub.players[id].left;

  function startNext(room, now) {
    const s = room.server;
    const st = s.pub;
    const next = Core.advance(st, (id) => present(room, id));
    if (next) Core.beginTurn(st, next, dealChoices(s), now);
  }

  function syncPrivate(room) {
    const s = room.server;
    const st = s.pub;
    room.secrets = {};
    const sec = Core.drawerSecret(st);
    if (sec && room.pub.players[st.drawer]) room.secrets[st.drawer] = Object.assign({ roundNo: room.pub.roundNo }, sec);
    Object.keys(st.scores).forEach((id) => {
      if (room.pub.players[id]) room.pub.scores[id] = st.scores[id];
    });
  }

  function queueSettlement(room) {
    const s = room.server;
    const st = s.pub;
    if (!st.over || s.settleReq) return;
    const ranking = Core.ranking(st).filter((id) => room.pub.players[id]);
    const forfeits = Object.keys(st.kicked).filter((id) => room.pub.players[id]);
    s.settleReq = { matchId: s.matchId, game: 'scribble', ranking, teams: null, stake: s.settings.stake, draw: false, rolls: {}, forfeits, done: false };
    room.pub.settlement = s.settings.stake ? { status: 'pending' } : null;
    if (!s.settings.stake) s.settleReq.done = true;
  }

  /** Players who can still score this turn: seated, present, online, not the drawer, not kicked. */
  function eligible(room, gone) {
    const st = room.server.pub;
    return st.players
      .map((p) => p.id)
      .filter((id) => id !== st.drawer && !st.kicked[id] && present(room, id) && !(gone && gone(id)));
  }

  function removePlayer(room, target, reason, now) {
    const st = room.server.pub;
    const p = room.pub.players[target];
    if (p) p.left = true;
    room.pub.kicked = Object.assign({}, room.pub.kicked || {}, { [target]: true });
    if (room.presence && room.presence[target]) room.presence[target] = { at: now, online: false };
    if (room.pub.host === target) {
      const next = Object.keys(room.pub.players)
        .sort((a, b) => (room.pub.players[a].seat || 0) - (room.pub.players[b].seat || 0))
        .find((id) => !room.pub.players[id].left);
      if (next) room.pub.host = next;
    }
    if (st.drawer === target && (st.phase === 'pick' || st.phase === 'draw')) Core.endTurn(st, reason, now, 0);
  }

  return {
    core: Core,
    min: Core.MIN_PLAYERS,
    max: Core.MAX_PLAYERS,
    mergeSettings,
    deal(room, ids, ctx) {
      const set = mergeSettings(room.pub.settings);
      const players = ids.map((id) => ({ id, name: room.pub.players[id].name }));
      if (players.length < Core.MIN_PLAYERS) throw err('need_players', 'Scribble needs at least 2 players');
      const st = Core.newGame(players, set);
      room.server = {
        settings: set,
        pub: st,
        clock: ctx.now,
        matchId: 'scribble_' + String(room.pub.host || '').slice(0, 10) + '_' + (room.pub.createdAt || ctx.now) + '_' + ctx.roundNo,
        settleReq: null,
      };
      room.pub.settlement = null;
      startNext(room, ctx.now);
      syncPrivate(room);
    },
    view: (s) => Object.assign(Core.publicView(s.pub), { stake: s.settings.stake }),
    phaseKey: (s) => [s.pub.turnKey, s.pub.phase, s.pub.shown, s.pub.over ? 1 : 0].join(':'),
    deadlineMs(s) {
      const st = s.pub;
      const now = Number(s.clock) || 0;
      let at = 0;
      if (st.over || st.phase === 'over') return 0;
      if (st.phase === 'pick') at = st.phaseAt + st.pickMs;
      else if (st.phase === 'draw') {
        const hint = Core.nextHintAt(st);
        at = Math.min(hint == null ? Infinity : hint, Core.drawEndsAt(st));
      } else if (st.phase === 'reveal') at = st.phaseAt + Core.REVEAL_MS;
      else return 0;
      return Math.max(MIN_TICK_MS, at - now);
    },
    apply(room, action) {
      const s = room.server;
      const st = s.pub;
      const now = Number(action.now) || Date.now();
      s.clock = now;
      if (st.over) return { error: 'over' };
      let out = {};
      switch (action.type) {
        case 'pick':
          out = Core.pick(st, action.uid, action.idx, now, R);
          if (!out.error) st.misses[action.uid] = 0;
          break;
        case 'autopick':
          out = Core.pick(st, st.drawer, Math.floor(R() * st.choices.length), now, R);
          break;
        case 'guess': {
          out = Core.guess(st, action.uid, action.text, now, action.eligible || []);
          if (!out.error && out.allGuessed) Core.endTurn(st, 'all', now, (action.eligible || []).length);
          break;
        }
        case 'hint':
          Core.revealHints(st, now);
          if (now >= Core.drawEndsAt(st)) Core.endTurn(st, 'time', now, (action.eligible || []).length);
          break;
        case 'end':
          Core.endTurn(st, action.reason || 'time', now, (action.eligible || []).length);
          break;
        case 'skip':
          Core.endTurn(st, action.reason || 'skipped', now, 0);
          break;
        case 'next':
          if (st.phase !== 'reveal') return { error: 'phase' };
          startNext(room, now);
          break;
        case 'remove':
          removePlayer(room, action.target, action.reason || 'kicked', now);
          break;
        default:
          return { error: 'bad_action' };
      }
      return out || {};
    },
    afterChange(room) {
      syncPrivate(room);
      queueSettlement(room);
    },
    absent(room, ctx) {
      const st = room.server.pub;
      if (st.over) return;
      if ((st.phase === 'pick' || st.phase === 'draw') && st.drawer && ctx.gone(st.drawer)) {
        ctx.act({ type: 'skip', reason: 'left', now: ctx.now }, true);
        return;
      }
      if (st.phase === 'draw') {
        const el = eligible(room, ctx.gone);
        if (Object.keys(st.guessed).length && el.every((id) => st.guessed[id])) ctx.act({ type: 'end', reason: 'all', eligible: el, now: ctx.now }, true);
      }
    },
    timeout(room, ctx) {
      const s = room.server;
      const st = s.pub;
      if (st.over) return;
      if (st.phase === 'pick') {
        const step = Policy.afkStep(st.misses[st.drawer] || 0, pol);
        st.misses[st.drawer] = step.misses;
        if (step.forfeit) ctx.act({ type: 'skip', reason: 'skipped', now: ctx.now }, true);
        else ctx.act({ type: 'autopick', now: ctx.now }, true);
      } else if (st.phase === 'draw') ctx.act({ type: 'hint', eligible: eligible(room, ctx.gone), now: ctx.now }, true);
      else if (st.phase === 'reveal') ctx.act({ type: 'next', now: ctx.now }, true);
    },
    betweenRounds: (s) => !!s.pub.over,
    canNext: () => false,
    newGameOnStart: () => true,
    canJoin: (room, uid) => !(room.pub.kicked && room.pub.kicked[uid]),
    onJoinPlaying(room, uid) {
      const st = room.server && room.server.pub;
      if (!st || st.over) return true;
      Core.addPlayer(st, { id: uid, name: room.pub.players[uid].name });
      return false;
    },
    onLeave(room, uid, now) {
      const st = room.server.pub;
      if (st.over) return;
      if (st.drawer === uid && (st.phase === 'pick' || st.phase === 'draw')) {
        room.server.clock = now || Date.now();
        Core.endTurn(st, 'left', room.server.clock, 0);
      }
    },
    ops: {
      pick(ctx) {
        const st = ctx.room.server.pub;
        if (st.drawer !== ctx.uid) throw err('not_drawer', 'It’s not your turn to draw');
        ctx.act({ type: 'pick', uid: ctx.uid, idx: Number(ctx.args.idx), now: ctx.now });
        return {};
      },
      guess(ctx) {
        const text = String(ctx.args.text || '').slice(0, 200);
        const el = eligible(ctx.room, ctx.gone);
        const out = ctx.act({ type: 'guess', uid: ctx.uid, text, eligible: el, now: ctx.now });
        return { correct: !!out.correct, close: !!out.close, pts: out.pts || 0 };
      },
      votekick(ctx) {
        const room = ctx.room;
        const st = room.server.pub;
        const target = String(ctx.args.target || '');
        const active = st.players.map((p) => p.id).filter((id) => present(room, id) && !ctx.gone(id));
        if (active.indexOf(ctx.uid) < 0) active.push(ctx.uid);
        const out = Core.voteKick(st, ctx.uid, target, active);
        if (out.error === 'too_few') throw err('too_few', 'Vote-kick needs at least 3 players — ask the host');
        if (out.error) throw err('bad_target', 'You can’t vote for that player');
        if (out.kicked) ctx.act({ type: 'remove', target, reason: 'kicked', now: ctx.now });
        return { kicked: !!out.kicked, count: out.count, need: out.need };
      },
      kick(ctx) {
        const target = String(ctx.args.target || '');
        if (!ctx.isHost) throw err('host_only', 'Only the host can remove players');
        if (target === ctx.uid || !ctx.room.pub.players[target]) throw err('bad_target', 'You can’t remove that player');
        Core.kick(ctx.room.server.pub, target);
        ctx.act({ type: 'remove', target, reason: 'kicked', now: ctx.now });
        return { kicked: true };
      },
    },
    lobbyOps: {
      remove(ctx) {
        const target = String(ctx.args.target || '');
        if (!ctx.isHost) throw err('host_only', 'Only the host can remove players');
        if (target === ctx.uid || !ctx.room.pub.players[target]) throw err('bad_target', 'You can’t remove that player');
        delete ctx.room.pub.players[target];
        delete ctx.room.pub.scores[target];
        ctx.room.pub.kicked = Object.assign({}, ctx.room.pub.kicked || {}, { [target]: true });
        return { kicked: true };
      },
    },
    hydrate(s) {
      s.settings = mergeSettings(s.settings);
      s.pub = Core.hydrate(s.pub);
      s.clock = Number(s.clock) || 0;
      if (s.settleReq) {
        s.settleReq.ranking = s.settleReq.ranking || [];
        s.settleReq.rolls = s.settleReq.rolls || {};
        s.settleReq.forfeits = s.settleReq.forfeits || [];
      }
    },
    pendingSettlement: (s) => (s && s.settleReq && !s.settleReq.done ? s.settleReq : null),
  };
}

module.exports = { createScribbleAdapter, STAKES, cryptoRng };
