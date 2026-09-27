/**
 * Werewolf room adapter for the party room engine (server-lib/party-deal.js).
 *
 * Secrecy: roles, night choices, Seer results, uncounted votes, wolf chat and the spectators' chat
 * live only in `room.server` (Admin SDK only). Each player's own slice is rewritten into
 * `room.secrets[uid]` (readable by that uid alone) after every change. `room.pub.state` gets the
 * public game state + the day chat and nothing else — the host reads no more than anyone.
 */
'use strict';

const WerewolfCore = require('../public/src/js/games/werewolf-core.js');

const REVEAL_MS = 60000;
const DAWN_MS = 15000;
const VERDICT_MS = 15000;
const HUNTER_MS = 30000;
const EXTEND_MS = 60000;
const MAX_EXTENDS = 3;
const CHAT_MAX = 160;
const CHAT_KEEP = 40;
const CHAT_GAP_MS = 700;
const DAY_CHAT_PHASES = ['dawn', 'day', 'vote', 'verdict', 'hunter', 'over'];

const PROFANITY = /\b(fuck\w*|shit\w*|bitch\w*|bastard|asshole|arsehole|cunt|slut|whore)\b/i;

function cleanChat(text) {
  return String(text || '')
    .replace(/[\u0000-\u001f<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CHAT_MAX);
}

function pushChat(list, msg) {
  list.push(msg);
  if (list.length > CHAT_KEEP) list.splice(0, list.length - CHAT_KEEP);
}

function emptyChat() {
  return { day: [], wolf: [], dead: [] };
}

/** One player's private slice. Everything here is readable by `id` only. */
function secretFor(s, id) {
  const pub = s.pub;
  const hidden = s.hidden;
  const role = hidden.roles[id];
  if (!role) return null;
  const alive = WerewolfCore.isAlive(pub, id);
  const night = pub.phase === 'night';
  const sec = { roundNo: s.gameNo, role, team: WerewolfCore.TEAM[role], alive };
  const wolves = pub.players.filter((x) => hidden.roles[x] === 'wolf');
  if (role === 'wolf') {
    sec.wolves = wolves;
    sec.wolfChat = s.chat.wolf.slice();
    if (night) sec.pack = WerewolfCore.wolfVotes(pub, hidden);
  }
  if (role === 'seer') sec.seerLog = hidden.seerLog.slice();
  if (role === 'doctor') sec.last = hidden.last.doctor || null;
  if (role === 'bodyguard') sec.last = hidden.last.bodyguard || null;
  if (role === 'witch') {
    sec.potions = { save: !!hidden.witch.save, kill: !!hidden.witch.kill };
    if (night && alive && hidden.witch.save) sec.victim = WerewolfCore.wolfPick(pub, hidden) || null;
  }
  if (night && alive) {
    const mine = hidden.acts[id];
    sec.step = WerewolfCore.nightStep(pub, hidden, s.settings, id);
    delete sec.step.pack;
    if (sec.step.witch) sec.step.witch.victim = sec.victim || null;
    if (mine) sec.myNight = { night: pub.night, target: mine.target || null, save: !!mine.save };
  }
  if (pub.phase === 'vote' && hidden.votes[id]) sec.myVote = { day: pub.day, revote: !!pub.revote, target: hidden.votes[id] };
  if (!alive && pub.phase !== 'over') {
    // Spectators see everything but can only talk to each other.
    const acts = {};
    Object.keys(hidden.acts).forEach((x) => (acts[x] = { verb: hidden.acts[x].verb, target: hidden.acts[x].target || null }));
    sec.spectator = { roles: Object.assign({}, hidden.roles), acts, seerLog: hidden.seerLog.slice(), wolfChat: s.chat.wolf.slice() };
    sec.deadChat = s.chat.dead.slice();
  }
  return sec;
}

function writeSecrets(room) {
  const s = room.server;
  room.secrets = {};
  s.pub.players.forEach((id) => {
    const sec = secretFor(s, id);
    if (sec) room.secrets[id] = sec;
  });
}

function createWerewolfAdapter({ err }) {
  const coreErr = (out) => err(out.error, out.reason || out.error);

  const adapter = {
    core: WerewolfCore,
    min: WerewolfCore.MIN_PLAYERS,
    max: WerewolfCore.MAX_ROOM,
    mergeSettings: (s) => WerewolfCore.mergeSettings(s),
    deal(room, ids, ctx) {
      const g = WerewolfCore.createGame(ids, room.pub.settings, { rng: ctx.rng });
      room.server = { settings: g.settings, pub: g.pub, hidden: g.hidden, chat: emptyChat(), gameNo: ctx.roundNo, extends: 0, scored: false, lastChat: {} };
      writeSecrets(room);
    },
    view(s) {
      return Object.assign(WerewolfCore.publicView(s.pub), { chat: s.chat.day.slice(), extends: s.extends || 0 });
    },
    phaseKey: (s) => [s.pub.phase, s.pub.night, s.pub.day, s.pub.revote ? 1 : 0, s.pub.hunter || ''].join(':'),
    deadlineMs(s) {
      const set = s.settings;
      switch (s.pub.phase) {
        case 'reveal':
          return REVEAL_MS;
        case 'night':
          return set.nightSec * 1000;
        case 'dawn':
          return DAWN_MS;
        case 'day':
          return set.discussSec * 1000;
        case 'vote':
          return set.voteSec * 1000;
        case 'verdict':
          return VERDICT_MS;
        case 'hunter':
          return HUNTER_MS;
        default:
          return 0;
      }
    },
    apply(room, action) {
      const s = room.server;
      const before = s.pub.phase + ':' + s.pub.day;
      const out = WerewolfCore.applyAction(s.pub, s.hidden, s.settings, action, action.rng || Math.random);
      if (s.pub.phase + ':' + s.pub.day !== before && s.pub.phase === 'day') s.extends = 0;
      return out;
    },
    afterChange(room) {
      const s = room.server;
      if (s.pub.phase === 'over') {
        room.pub.over = true;
        if (!s.scored) {
          s.scored = true;
          const r = s.pub.result;
          s.pub.players.forEach((id) => {
            const role = s.hidden.roles[id];
            const won = r.winner === 'tanner' ? id === r.tanner : WerewolfCore.TEAM[role] === r.winner;
            if (won) room.pub.scores[id] = (Number(room.pub.scores[id]) || 0) + 1;
          });
        }
      }
      writeSecrets(room);
    },
    absent(room, ctx) {
      const st = room.server.pub;
      const h = room.server.hidden;
      const present = st.alive.filter((id) => !ctx.gone(id));
      if (st.phase === 'reveal') {
        const waiting = st.players.filter((id) => !room.pub.seen[id] && !ctx.gone(id));
        if (!waiting.length) ctx.act({ type: 'begin' }, true);
      } else if (st.phase === 'night') {
        // A missed night action = no action.
        if (present.length && present.every((id) => h.acted.indexOf(id) >= 0)) ctx.act({ type: 'closeNight', rng: ctx.rng }, true);
      } else if (st.phase === 'vote') {
        // A missed vote = abstain.
        if (present.length && present.every((id) => st.voted.indexOf(id) >= 0)) ctx.act({ type: 'closeVote' }, true);
      } else if (st.phase === 'hunter') {
        if (ctx.gone(st.hunter)) ctx.act({ type: 'shoot', target: null }, true);
      }
    },
    timeout(room, ctx) {
      switch (room.server.pub.phase) {
        case 'reveal':
          return ctx.act({ type: 'begin' }, true);
        case 'night':
          return ctx.act({ type: 'closeNight', rng: ctx.rng }, true);
        case 'dawn':
        case 'verdict':
          return ctx.act({ type: 'continue' }, true);
        case 'day':
          return ctx.act({ type: 'startVote' }, true);
        case 'vote':
          return ctx.act({ type: 'closeVote' }, true);
        case 'hunter':
          return ctx.act({ type: 'shoot', target: null }, true);
        default:
          return null;
      }
    },
    betweenRounds: (s) => s.pub.phase === 'over',
    canNext: () => false,
    newGameOnStart: () => true,
    // Late joiners spectate the public game until the next one.
    onJoinPlaying: () => true,
    onLeave(room, uid) {
      const s = room.server;
      WerewolfCore.removePlayer(s.pub, s.hidden, s.settings, uid, Math.random);
    },
    ops: {
      seen(ctx) {
        const { room, uid } = ctx;
        const st = room.server.pub;
        if (st.phase !== 'reveal') return {};
        room.pub.seen[uid] = true;
        const waiting = st.players.filter((id) => !room.pub.seen[id] && !ctx.gone(id));
        if (!waiting.length) ctx.act({ type: 'begin' });
        return {};
      },
      night(ctx) {
        const { uid, args } = ctx;
        const target = args.target ? String(args.target) : null;
        const out = ctx.act({ type: 'night', id: uid, target, save: args.save === true, rng: ctx.rng });
        return out && out.result ? { team: out.result } : {};
      },
      nominate(ctx) {
        ctx.act({ type: 'nominate', id: ctx.uid, target: ctx.args.target ? String(ctx.args.target) : null });
        return {};
      },
      vote(ctx) {
        const t = String(ctx.args.target || '');
        ctx.act({ type: 'vote', id: ctx.uid, target: t === 'skip' ? 'skip' : t });
        return {};
      },
      shoot(ctx) {
        const st = ctx.room.server.pub;
        if (st.phase !== 'hunter') return {};
        if (st.hunter !== ctx.uid) throw err('not_hunter', 'Only the eliminated player can take this shot');
        ctx.act({ type: 'shoot', id: ctx.uid, target: ctx.args.target ? String(ctx.args.target) : null });
        return {};
      },
      /** Host: move on from the morning / verdict, or end discussion and start the vote. */
      advance(ctx) {
        if (!ctx.isHost) throw err('host_only', 'Only the host can move things along');
        const p = ctx.room.server.pub.phase;
        if (p === 'dawn' || p === 'verdict') ctx.act({ type: 'continue' });
        else if (p === 'day') ctx.act({ type: 'startVote' });
        return {};
      },
      extend(ctx) {
        if (!ctx.isHost) throw err('host_only', 'Only the host can add time');
        const s = ctx.room.server;
        const pub = ctx.room.pub;
        if (s.pub.phase !== 'day') throw err('phase', 'Only during discussion');
        if ((s.extends || 0) >= MAX_EXTENDS) throw err('max_extends', 'That’s the most extra time for today');
        s.extends = (s.extends || 0) + 1;
        if (pub.paused) pub.paused.remaining = (Number(pub.paused.remaining) || 0) + EXTEND_MS;
        else if (pub.deadline) pub.deadline += EXTEND_MS;
        return {};
      },
      chat(ctx) {
        const { room, uid, args, now } = ctx;
        const s = room.server;
        const st = s.pub;
        const text = cleanChat(args.text);
        if (!text) throw err('empty', 'Type a message');
        if (PROFANITY.test(text)) throw err('blocked', 'Keep it friendly');
        s.lastChat = s.lastChat || {};
        if (now - (Number(s.lastChat[uid]) || 0) < CHAT_GAP_MS) throw err('slow_down', 'Slow down a little');
        const role = s.hidden.roles[uid];
        if (!role) throw err('not_player', 'You’re watching this game');
        const alive = WerewolfCore.isAlive(st, uid);
        const channel = String(args.channel || 'day');
        let list;
        if (channel === 'dead') {
          if (alive) throw err('not_allowed', 'Only players who are out can use this chat');
          list = s.chat.dead;
        } else if (channel === 'wolf') {
          if (!alive || role !== 'wolf' || st.phase !== 'night') throw err('not_allowed', 'The pack only talks at night');
          list = s.chat.wolf;
        } else {
          if (!alive && st.phase !== 'over') throw err('not_allowed', 'You’re out — use the spectators’ chat');
          if (DAY_CHAT_PHASES.indexOf(st.phase) < 0) throw err('phase', 'Everyone is asleep');
          list = s.chat.day;
        }
        s.lastChat[uid] = now;
        pushChat(list, { from: uid, text, at: now });
        writeSecrets(room);
        return {};
      },
    },
    hydrate(s) {
      s.settings = WerewolfCore.mergeSettings(s.settings);
      s.pub = WerewolfCore.hydrateState(s.pub);
      s.hidden = WerewolfCore.hydrateHidden(s.hidden);
      const c = s.chat || {};
      s.chat = { day: c.day || [], wolf: c.wolf || [], dead: c.dead || [] };
      s.gameNo = Number(s.gameNo) || 1;
      s.extends = Number(s.extends) || 0;
      s.scored = !!s.scored;
      s.lastChat = s.lastChat || {};
    },
  };
  return adapter;
}

module.exports = { createWerewolfAdapter, secretFor, REVEAL_MS, DAWN_MS, VERDICT_MS, HUNTER_MS, EXTEND_MS, MAX_EXTENDS };
