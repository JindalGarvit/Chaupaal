/**
 * Party rooms (Dangal party kit) — server-authoritative dealing + round state.
 * Served by POST /api/media-config { action: 'party_room', op, ... } (no extra Vercel function).
 *
 * RTDB layout, one node per room so every op is a single transaction:
 *   games/{game}/{code}/pub            members read   — lobby, settings, scores, public round state
 *   games/{game}/{code}/presence/{uid} members read   — { at, online }; each client writes its own
 *   games/{game}/{code}/secrets/{uid}  only that uid  — this player's card for the current round
 *   games/{game}/{code}/server         nobody         — roles, words, full votes (Admin SDK only)
 * Roles never enter `pub` until the result screen; the host reads nothing more than anyone else.
 */
'use strict';

const ImposterCore = require('../public/src/js/games/imposter-core.js');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 6;
const OFFLINE_MS = 45000;
const REVEAL_MS = 60000;
const STEAL_MS = 45000;
const ROOM_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_NAME = 32;

/** Per-game handlers. G2/G3 party titles add an entry here. */
const GAMES = {
  imposter: {
    core: ImposterCore,
    min: ImposterCore.MIN_PLAYERS,
    max: ImposterCore.MAX_PLAYERS,
  },
};

function makeCode(rng) {
  const r = typeof rng === 'function' ? rng : Math.random;
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) s += CODE_ALPHABET[Math.floor(r() * CODE_ALPHABET.length)];
  return s;
}

function cleanCode(code) {
  const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length === CODE_LEN ? c : '';
}

function cleanName(name) {
  const n = String(name || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, MAX_NAME);
  return n || 'Player';
}

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

function seatOrder(pub) {
  return Object.keys(pub.players || {}).sort(
    (a, b) => (pub.players[a].seat || 0) - (pub.players[b].seat || 0)
  );
}

function activeIds(pub) {
  return seatOrder(pub).filter((id) => !pub.players[id].left && !pub.players[id].pending);
}

function isOnline(room, uid, now) {
  const p = room.presence && room.presence[uid];
  if (!p) return false;
  if (p.online === false) return false;
  return now - (Number(p.at) || 0) < OFFLINE_MS;
}

/** Publish the public view of the server round state. */
function publish(room, now) {
  const s = room.server;
  room.pub.state = s && s.pub ? ImposterCore.publicView(s.pub) : null;
  room.pub.updatedAt = now;
  room.pub.serverNow = now;
  room.pub.rev = (Number(room.pub.rev) || 0) + 1;
}

function setDeadline(room, now) {
  const s = room.server;
  const st = s.pub;
  const set = s.settings;
  let ms = 0;
  if (st.phase === 'reveal') ms = REVEAL_MS;
  else if (st.phase === 'clues') ms = set.clueSec * 1000;
  else if (st.phase === 'discuss') ms = set.discussionSec * 1000;
  else if (st.phase === 'vote' || st.phase === 'revote') ms = set.voteSec * 1000;
  else if (st.phase === 'defence') ms = set.defenceSec * 1000;
  else if (st.phase === 'steal') ms = STEAL_MS;
  room.pub.paused = null;
  room.pub.deadline = ms > 0 ? now + ms : null;
  room.pub.phaseKey = st.phase + ':' + st.turn + ':' + st.voteRound + ':' + (st.revote ? 1 : 0);
}

function applyCore(room, action, now) {
  const s = room.server;
  const before = s.pub.phase + ':' + s.pub.turn + ':' + s.pub.voteRound + ':' + s.pub.revote;
  const out = ImposterCore.applyAction(s.pub, s.hidden, s.settings, action);
  if (out.error) throw err(out.error, out.reason || out.error);
  s.pub = out.pub;
  // Discussion of 0s skips straight to the vote.
  if (s.pub.phase === 'discuss' && s.settings.discussionSec <= 0) {
    s.pub = ImposterCore.applyAction(s.pub, s.hidden, s.settings, { type: 'startVote' }).pub;
  }
  const after = s.pub.phase + ':' + s.pub.turn + ':' + s.pub.voteRound + ':' + s.pub.revote;
  if (before !== after) setDeadline(room, now);
  if (s.pub.phase === 'result' && !s.scored) {
    s.scored = true;
    const pts = s.pub.result.points || {};
    Object.keys(pts).forEach((id) => {
      room.pub.scores[id] = (Number(room.pub.scores[id]) || 0) + pts[id];
    });
    room.pub.deadline = null;
  }
  skipAbsent(room, now);
}

/** Skip clue turns of players who left or dropped offline; close votes once everyone present voted. */
function skipAbsent(room, now) {
  const s = room.server;
  if (!s || !s.pub) return;
  let guard = 0;
  while (s.pub.phase === 'clues' && guard++ < 40) {
    const giver = ImposterCore.currentClueGiver(s.pub);
    const gone = !giver || (room.pub.players[giver] && room.pub.players[giver].left) || !isOnline(room, giver, now);
    if (!gone) break;
    applyCoreRaw(room, { type: 'skipTurn' }, now);
  }
  if ((s.pub.phase === 'vote' || s.pub.phase === 'revote') && s.pub.voters.length) {
    const present = s.pub.voters.filter(
      (id) => !(room.pub.players[id] && room.pub.players[id].left) && isOnline(room, id, now)
    );
    const pending = present.filter((id) => s.pub.voted.indexOf(id) < 0);
    if (present.length && !pending.length) applyCoreRaw(room, { type: 'closeVote' }, now);
  }
}

function applyCoreRaw(room, action, now) {
  const s = room.server;
  const out = ImposterCore.applyAction(s.pub, s.hidden, s.settings, action);
  if (out.error) return;
  s.pub = out.pub;
  if (s.pub.phase === 'discuss' && s.settings.discussionSec <= 0) {
    s.pub = ImposterCore.applyAction(s.pub, s.hidden, s.settings, { type: 'startVote' }).pub;
  }
  setDeadline(room, now);
  if (s.pub.phase === 'result' && !s.scored) {
    s.scored = true;
    const pts = s.pub.result.points || {};
    Object.keys(pts).forEach((id) => {
      room.pub.scores[id] = (Number(room.pub.scores[id]) || 0) + pts[id];
    });
    room.pub.deadline = null;
  }
}

function migrateHost(room, now) {
  const pub = room.pub;
  const host = pub.players[pub.host];
  if (host && !host.left && isOnline(room, pub.host, now)) return false;
  const next = seatOrder(pub).find((id) => !pub.players[id].left && isOnline(room, id, now));
  if (next && next !== pub.host) {
    pub.host = next;
    return true;
  }
  return false;
}

function dealRound(room, now, rng) {
  const pub = room.pub;
  // Pending joiners take a seat; players who left are dropped between rounds.
  seatOrder(pub).forEach((id) => {
    if (pub.players[id].left) {
      delete pub.players[id];
      delete pub.scores[id];
      if (room.secrets) delete room.secrets[id];
    } else if (pub.players[id].pending) {
      delete pub.players[id].pending;
    }
  });
  const ids = activeIds(pub);
  const game = GAMES[pub.game];
  if (ids.length < game.min) throw err('need_players', 'Need at least ' + game.min + ' players');
  if (ids.length > game.max) throw err('too_many_players', 'Max ' + game.max + ' players');
  const prev = room.server || {};
  const usedKeys = Array.isArray(prev.usedKeys) ? prev.usedKeys : [];
  const roundNo = (Number(pub.roundNo) || 0) + 1;
  const dealt = ImposterCore.deal(ids, pub.settings, { rng, usedKeys });
  const starterIndex = (roundNo - 1) % ids.length;
  room.server = {
    settings: dealt.settings,
    hidden: dealt.hidden,
    pub: ImposterCore.createRound(ids, dealt.settings, starterIndex),
    usedKeys: usedKeys.concat(dealt.key).slice(-200),
    scored: false,
  };
  room.secrets = {};
  ids.forEach((id) => {
    room.secrets[id] = Object.assign({ roundNo }, dealt.secrets[id]);
    if (!(id in pub.scores)) pub.scores[id] = 0;
  });
  pub.roundNo = roundNo;
  pub.status = 'playing';
  pub.seen = {};
  pub.settings = dealt.settings;
  setDeadline(room, now);
}

function newRoom({ game, uid, name, settings, chatId, now }) {
  const g = GAMES[game];
  if (!g) throw err('unknown_game', 'Unknown party game');
  return {
    pub: {
      game,
      host: uid,
      status: 'lobby',
      createdAt: now,
      updatedAt: now,
      expiresAt: now + ROOM_TTL_MS,
      settings: g.core.mergeSettings(settings),
      players: { [uid]: { name: cleanName(name), seat: 0, joinedAt: now } },
      scores: { [uid]: 0 },
      roundNo: 0,
      seen: {},
      chatId: chatId ? String(chatId).slice(0, 128) : null,
      state: null,
      deadline: null,
      paused: null,
      rev: 1,
      serverNow: now,
    },
    presence: { [uid]: { at: now, online: true } },
    secrets: {},
    server: null,
  };
}

/**
 * Pure room reducer — every op except create. Mutates and returns `room`.
 * @returns {{ room: object, result?: object }}
 */
function reduceRoom(room, uid, op, args, now, rng) {
  const a = args || {};
  if (!room || !room.pub) throw err('room_not_found', 'Room not found');
  const pub = room.pub;
  pub.players = pub.players || {};
  pub.scores = pub.scores || {};
  pub.seen = pub.seen || {};
  room.presence = room.presence || {};
  if (pub.status === 'closed') throw err('room_closed', 'This room has closed');
  const me = pub.players[uid];
  const isHost = pub.host === uid;
  const game = GAMES[pub.game];

  if (op === 'join') {
    if (me && !me.left) {
      room.presence[uid] = { at: now, online: true };
      return { room, result: { rejoined: true } };
    }
    const seats = seatOrder(pub).filter((id) => !pub.players[id].left);
    if (seats.length >= game.max) throw err('room_full', 'This room is full');
    const seat = seatOrder(pub).reduce((m, id) => Math.max(m, pub.players[id].seat || 0), -1) + 1;
    pub.players[uid] = { name: cleanName(a.name), seat, joinedAt: now };
    if (pub.status === 'playing') pub.players[uid].pending = true;
    if (!(uid in pub.scores)) pub.scores[uid] = 0;
    room.presence[uid] = { at: now, online: true };
    pub.updatedAt = now;
    pub.rev = (Number(pub.rev) || 0) + 1;
    return { room, result: { joined: true, pending: !!pub.players[uid].pending } };
  }

  if (!me) throw err('not_member', 'You are not in this room');
  if (op !== 'leave' && me.left) throw err('not_member', 'You left this room');
  room.presence[uid] = { at: now, online: true };

  const s = room.server;
  const phase = s && s.pub ? s.pub.phase : null;
  const needRound = () => {
    if (!s || !s.pub || pub.status !== 'playing') throw err('no_round', 'No round in progress');
  };

  switch (op) {
    case 'leave': {
      if (pub.status === 'lobby') {
        delete pub.players[uid];
        delete pub.scores[uid];
      } else {
        me.left = true;
      }
      if (room.presence[uid]) room.presence[uid] = { at: now, online: false };
      const remaining = seatOrder(pub).filter((id) => !pub.players[id].left);
      if (!remaining.length) pub.status = 'closed';
      else if (pub.host === uid) pub.host = remaining[0];
      if (s && s.pub && pub.status === 'playing') {
        s.pub.voters = s.pub.voters.filter((id) => id !== uid);
        skipAbsent(room, now);
        publish(room, now);
      } else {
        pub.rev = (Number(pub.rev) || 0) + 1;
        pub.updatedAt = now;
      }
      return { room, result: { left: true } };
    }

    case 'settings': {
      if (!isHost) throw err('host_only', 'Only the host can change settings');
      if (pub.status === 'playing' && phase !== 'result') throw err('phase', 'Change settings between rounds');
      pub.settings = game.core.mergeSettings(Object.assign({}, pub.settings, a.settings || {}));
      pub.rev = (Number(pub.rev) || 0) + 1;
      pub.updatedAt = now;
      return { room, result: { settings: pub.settings } };
    }

    case 'start':
    case 'next': {
      if (!isHost) throw err('host_only', 'Only the host can start');
      if (op === 'next' && phase !== 'result') throw err('phase', 'Finish this round first');
      if (op === 'start' && pub.status === 'playing' && phase !== 'result') throw err('phase', 'Round in progress');
      dealRound(room, now, rng);
      publish(room, now);
      return { room, result: { roundNo: pub.roundNo } };
    }

    case 'seen': {
      needRound();
      if (phase !== 'reveal') return { room, result: {} };
      pub.seen[uid] = true;
      const waiting = s.pub.players.filter(
        (id) => !pub.seen[id] && !(pub.players[id] && pub.players[id].left) && isOnline(room, id, now)
      );
      if (!waiting.length) applyCore(room, { type: 'startClues' }, now);
      publish(room, now);
      return { room, result: {} };
    }

    case 'clue': {
      needRound();
      applyCore(room, { type: 'clue', id: uid, text: a.text }, now);
      publish(room, now);
      return { room, result: {} };
    }

    case 'skipDiscussion': {
      needRound();
      if (!isHost) throw err('host_only', 'Only the host can skip');
      if (phase !== 'discuss') throw err('phase', 'Not in discussion');
      applyCore(room, { type: 'startVote' }, now);
      publish(room, now);
      return { room, result: {} };
    }

    case 'vote': {
      needRound();
      applyCore(room, { type: 'vote', id: uid, target: String(a.target || '') }, now);
      publish(room, now);
      return { room, result: {} };
    }

    case 'steal': {
      needRound();
      applyCore(room, { type: 'steal', id: uid, guess: a.guess }, now);
      publish(room, now);
      return { room, result: {} };
    }

    case 'pause': {
      needRound();
      if (!isHost) throw err('host_only', 'Only the host can pause');
      if (pub.paused || !pub.deadline) return { room, result: {} };
      pub.paused = { remaining: Math.max(0, pub.deadline - now) };
      pub.deadline = null;
      publish(room, now);
      return { room, result: {} };
    }

    case 'resume': {
      needRound();
      if (!isHost) throw err('host_only', 'Only the host can resume');
      if (!pub.paused) return { room, result: {} };
      pub.deadline = now + (Number(pub.paused.remaining) || 0);
      pub.paused = null;
      publish(room, now);
      return { room, result: {} };
    }

    case 'tick': {
      // Any member may nudge the clock; the server decides whether anything is due.
      const migrated = migrateHost(room, now);
      if (s && s.pub && pub.status === 'playing') {
        const before = JSON.stringify(s.pub) + '|' + pub.deadline;
        skipAbsent(room, now);
        if (!pub.paused && pub.deadline && now >= pub.deadline) {
          const p = s.pub.phase;
          if (p === 'reveal') applyCore(room, { type: 'startClues' }, now);
          else if (p === 'clues') applyCore(room, { type: 'skipTurn' }, now);
          else if (p === 'discuss') applyCore(room, { type: 'startVote' }, now);
          else if (p === 'vote' || p === 'revote') applyCore(room, { type: 'closeVote' }, now);
          else if (p === 'defence') applyCore(room, { type: 'endDefence' }, now);
          else if (p === 'steal') applyCore(room, { type: 'steal', id: s.pub.stealer, guess: '' }, now);
        }
        const after = JSON.stringify(room.server.pub) + '|' + pub.deadline;
        if (before !== after || migrated) publish(room, now);
      } else if (migrated) {
        pub.rev = (Number(pub.rev) || 0) + 1;
      }
      return { room, result: {} };
    }

    case 'end': {
      if (!isHost) throw err('host_only', 'Only the host can end the room');
      pub.status = 'closed';
      pub.deadline = null;
      pub.rev = (Number(pub.rev) || 0) + 1;
      return { room, result: { closed: true } };
    }

    default:
      throw err('bad_op', 'Unknown room action');
  }
}

/** Run a reducer against one RTDB node atomically (Admin SDK transaction). */
async function transactRoom(rtdb, path, fn, { allowEmpty = false } = {}) {
  let outcome = null;
  let failure = null;
  const ref = rtdb.ref(path);
  const tx = await ref.transaction((current) => {
    failure = null;
    outcome = null;
    // The Admin SDK often runs the handler first with a cold (null) cache. Writing null back is a
    // no-op that the server rejects if data exists, so the handler re-runs with the real value.
    if (current == null && !allowEmpty) return null;
    try {
      const next = fn(current == null ? null : hydrateRoom(current));
      if (!next) return undefined;
      outcome = next.result || {};
      return next.room;
    } catch (e) {
      failure = e;
      return undefined; // abort
    }
  });
  if (failure) throw failure;
  if (!tx.committed) throw err('busy', 'Room busy — try again');
  if (!outcome) throw err('room_not_found', 'Room not found');
  return outcome;
}

/** RTDB drops empty arrays/objects and nulls — restore the shapes the reducers expect. */
function hydrateRoom(room) {
  if (!room || !room.pub) return room;
  room.pub.players = room.pub.players || {};
  room.pub.scores = room.pub.scores || {};
  room.pub.seen = room.pub.seen || {};
  room.presence = room.presence || {};
  room.secrets = room.secrets || {};
  if (room.server) {
    const g = GAMES[room.pub.game];
    room.server.usedKeys = room.server.usedKeys || [];
    room.server.pub = g.core.hydrateState(room.server.pub);
    const h = room.server.hidden || {};
    h.imposters = h.imposters || [];
    h.minority = h.minority || null;
    if (h.majority) h.majority.alts = h.majority.alts || [];
    room.server.hidden = h;
  } else {
    room.server = null;
  }
  return room;
}

/**
 * Entry point for the `party_room` action.
 * @param {import('firebase-admin')} adminApp
 * @param {string} uid
 * @param {object} body { op, game, code, name, settings, text, target, guess, chatId }
 */
async function partyRoom(adminApp, uid, body) {
  const b = body || {};
  const op = String(b.op || '');
  const game = String(b.game || 'imposter');
  if (!GAMES[game]) throw err('unknown_game', 'Unknown party game');
  const rtdb = adminApp.database();
  const now = Date.now();

  if (op === 'create') {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = makeCode();
      try {
        await transactRoom(
          rtdb,
          `games/${game}/${code}`,
          (current) => {
            if (current && current.pub && current.pub.status !== 'closed' && (current.pub.expiresAt || 0) > now) {
              throw err('code_taken');
            }
            return {
              room: newRoom({ game, uid, name: b.name, settings: b.settings, chatId: b.chatId, now }),
              result: {},
            };
          },
          { allowEmpty: true }
        );
        return { code, game, host: true };
      } catch (e) {
        if (e.code !== 'code_taken') throw e;
      }
    }
    throw err('busy', 'Could not create a room — try again');
  }

  const code = cleanCode(b.code);
  if (!code) throw err('bad_code', 'Check the room code');
  const result = await transactRoom(rtdb, `games/${game}/${code}`, (current) =>
    reduceRoom(current, uid, op, b, now, Math.random)
  );
  return Object.assign({ code, game }, result);
}

module.exports = {
  GAMES,
  CODE_LEN,
  OFFLINE_MS,
  makeCode,
  cleanCode,
  newRoom,
  hydrateRoom,
  reduceRoom,
  dealRound,
  partyRoom,
};
