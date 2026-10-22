/**
 * Party Hub (Room mode) — one group session that runs party game after party game without re-inviting.
 * Served by POST /api/media-config { action: 'party_room', game: 'partyhub', op, ... } (no new function).
 *
 * RTDB games/partyhub/{code}:
 *   pub            members read — roster, host, pick mode + votes, current game, tonight's scoreboard
 *   presence/{uid} members read, self write
 * The hub never holds a secret. Each pick creates an ordinary party room at games/{game}/{code}
 * (the hub's code when free) with the group already seated, `pub.hub` = hub code, host = hub host.
 * Everything secret stays inside that game room's secrets/server nodes exactly as in a standalone room.
 *
 * Ops: create · join · leave · settings · vote · pick · back · remove · tick · end
 *   pick  host starts the next game (Vote mode: most votes, host breaks ties) — seats the online group,
 *         rotating who sits out when it doesn't fit
 *   back  host returns everyone to the hub; the finished game is turned into placing points
 *         (PartyHubCore.pointsFor) and added to `tonight`. A game room closed any other way
 *         (its own "End room", everyone left) is tallied by the next tick.
 */
'use strict';

const HubCore = require('../public/src/js/games/party-hub-core.js');

const HUB = 'partyhub';
const HUB_TTL_MS = 14 * 60 * 60 * 1000;

function PD() {
  return require('./party-deal.js');
}

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

function seatOrder(pub) {
  return Object.keys(pub.players || {}).sort((a, b) => (pub.players[a].seat || 0) - (pub.players[b].seat || 0));
}

function members(pub) {
  return seatOrder(pub).filter((id) => !pub.players[id].left);
}

function isOnline(hub, uid, now) {
  const p = hub.presence && hub.presence[uid];
  if (!p || p.online === false) return false;
  return now - (Number(p.at) || 0) < PD().OFFLINE_MS;
}

function bump(hub, now) {
  hub.pub.rev = (Number(hub.pub.rev) || 0) + 1;
  hub.pub.updatedAt = now;
  hub.pub.serverNow = now;
}

function hydrateHub(hub) {
  if (!hub || !hub.pub) return hub;
  const p = hub.pub;
  p.players = p.players || {};
  p.votes = p.votes || {};
  p.tonight = p.tonight || {};
  p.history = Array.isArray(p.history) ? p.history : Object.values(p.history || {});
  p.satOut = Array.isArray(p.satOut) ? p.satOut : [];
  p.settings = Object.assign({ pickBy: 'host' }, p.settings || {});
  p.current = p.current || null;
  if (p.current) {
    p.current.seated = Array.isArray(p.current.seated) ? p.current.seated : [];
    p.current.out = Array.isArray(p.current.out) ? p.current.out : [];
  }
  hub.presence = hub.presence || {};
  return hub;
}

/** pickBy + the party's content language (host setting; every game room tonight inherits it). */
function mergeSettings(s) {
  const src = s || {};
  const lang = String(src.contentLang || '').toLowerCase().split(/[-_]/)[0];
  return { pickBy: src.pickBy === 'vote' ? 'vote' : 'host', contentLang: /^[a-z]{2,3}$/.test(lang) ? lang : '' };
}

function newHub({ uid, name, settings, chatId, now }) {
  return {
    pub: {
      game: HUB,
      host: uid,
      status: 'playing',
      createdAt: now,
      updatedAt: now,
      expiresAt: now + HUB_TTL_MS,
      settings: mergeSettings(settings),
      players: { [uid]: { name: PD().cleanName(name), seat: 0, joinedAt: now } },
      votes: {},
      current: null,
      history: [],
      tonight: {},
      satOut: [],
      chatId: chatId ? String(chatId).slice(0, 128) : null,
      rev: 1,
      serverNow: now,
    },
    presence: { [uid]: { at: now, online: true } },
  };
}

function migrateHost(hub, now) {
  const pub = hub.pub;
  const host = pub.players[pub.host];
  if (host && !host.left && isOnline(hub, pub.host, now)) return false;
  const next = members(pub).find((id) => isOnline(hub, id, now));
  if (next && next !== pub.host) {
    pub.host = next;
    return true;
  }
  return false;
}

/**
 * Pure reducer for single-node hub ops (everything except the parts of pick / back / leave / end
 * that also touch a game room). Mutates and returns { hub, result }.
 */
function reduceHub(hub, uid, op, args, now) {
  const a = args || {};
  if (!hub || !hub.pub) throw err('room_not_found', 'Party not found');
  hydrateHub(hub);
  const pub = hub.pub;
  if (pub.status === 'closed') throw err('room_closed', 'This party has ended');
  const me = pub.players[uid];
  const isHost = pub.host === uid;

  if (op === 'join') {
    if (me && !me.left) {
      hub.presence[uid] = { at: now, online: true };
      return { hub, result: { rejoined: true } };
    }
    if (members(pub).length >= HubCore.MAX_HUB) throw err('room_full', 'This party is full (' + HubCore.MAX_HUB + ' max)');
    const seat = seatOrder(pub).reduce((m, id) => Math.max(m, pub.players[id].seat || 0), -1) + 1;
    pub.players[uid] = { name: PD().cleanName(a.name), seat, joinedAt: now };
    hub.presence[uid] = { at: now, online: true };
    bump(hub, now);
    return { hub, result: { joined: true, nextGame: !!pub.current } };
  }

  if (!me || me.left) throw err('not_member', 'You are not in this party');
  hub.presence[uid] = { at: now, online: true };

  switch (op) {
    case 'settings': {
      if (!isHost) throw err('host_only', 'Only the host can change that');
      pub.settings = mergeSettings(Object.assign({}, pub.settings, a.settings || {}));
      if (pub.settings.pickBy === 'host') pub.votes = {};
      bump(hub, now);
      return { hub, result: { settings: pub.settings } };
    }
    case 'vote': {
      const g = String(a.pick || '');
      if (HubCore.GAME_IDS.indexOf(g) < 0) throw err('bad_target', 'Pick a party game');
      if (pub.current) throw err('phase', 'A game is already running');
      pub.votes[uid] = g;
      bump(hub, now);
      return { hub, result: { voted: g } };
    }
    case 'remove': {
      if (!isHost) throw err('host_only', 'Only the host can remove players');
      const target = String(a.target || '');
      if (!pub.players[target] || target === uid) throw err('bad_target', 'Pick a player');
      pub.players[target].left = true;
      delete pub.votes[target];
      if (hub.presence[target]) hub.presence[target] = { at: now, online: false };
      bump(hub, now);
      return { hub, result: { removed: target, game: pub.current } };
    }
    case 'leave': {
      me.left = true;
      delete pub.votes[uid];
      hub.presence[uid] = { at: now, online: false };
      const rest = members(pub);
      if (isHost && rest.length) pub.host = rest.find((id) => isOnline(hub, id, now)) || rest[0];
      if (!rest.length) pub.status = 'closed';
      bump(hub, now);
      return { hub, result: { left: true, game: pub.current } };
    }
    case 'tick': {
      const migrated = migrateHost(hub, now);
      if (migrated) bump(hub, now);
      return { hub, result: { migrated, current: pub.current } };
    }
    default:
      throw err('bad_op', 'Unknown party action');
  }
}

/** Placing points for a game room's final public state (null if it never started). */
function tallyRoom(room) {
  if (!room || !room.pub || !(Number(room.pub.roundNo) > 0)) return null;
  const p = room.pub;
  const players = Object.keys(p.players || {}).filter((id) => !p.players[id].left && !p.players[id].pending);
  const points = HubCore.pointsFor(p.game, { players, scores: p.scores || {}, state: p.state || null });
  return Object.keys(points).length ? points : null;
}

/** Apply a finished (or abandoned) game to the hub and clear `current`. */
function finishCurrent(hub, seq, points, now) {
  const pub = hub.pub;
  if (!pub.current || pub.current.seq !== seq) return false;
  if (points) {
    pub.tonight = HubCore.addPoints(pub.tonight, points);
    pub.history = pub.history.concat({ game: pub.current.game, seq, points, at: now }).slice(-HubCore.HISTORY_CAP);
  }
  pub.satOut = pub.current.out || [];
  pub.current = null;
  pub.votes = {};
  bump(hub, now);
  return true;
}

// ------------------------------------------------------------------ entry

async function hubAction(adminApp, uid, body, deps) {
  const b = Object.assign({}, body || {});
  const op = String(b.op || '');
  const rtdb = adminApp.database();
  const now = (deps && deps.now) || Date.now();
  const tx = (path, fn, opts) => PD().transactRoom(rtdb, path, fn, opts);
  const hubTx = (code, fn) =>
    tx(`games/${HUB}/${code}`, (current) => {
      if (!current) return null;
      const out = fn(hydrateHub(current));
      return { room: out.hub, result: out.result };
    });

  if (op === 'create') {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = PD().makeCode();
      try {
        await tx(
          `games/${HUB}/${code}`,
          (current) => {
            if (current && current.pub && current.pub.status !== 'closed' && (current.pub.expiresAt || 0) > now) throw err('code_taken');
            return { room: newHub({ uid, name: b.name, settings: b.settings, chatId: b.chatId, now }), result: {} };
          },
          { allowEmpty: true }
        );
        return { code, game: HUB, host: true, serverNow: now };
      } catch (e) {
        if (e.code !== 'code_taken') throw e;
      }
    }
    throw err('busy', 'Could not start a party — try again');
  }

  const code = PD().cleanCode(b.code);
  if (!code) throw err('bad_code', 'Check the party code');
  const base = { code, game: HUB, serverNow: now };

  if (op === 'pick') return Object.assign(base, await pick(adminApp, rtdb, code, uid, b, now, hubTx));
  if (op === 'back' || op === 'end') return Object.assign(base, await back(rtdb, code, uid, op, now, hubTx));

  const out = await hubTx(code, (hub) => reduceHub(hub, uid, op, b, now));
  // A leaver / removed player also leaves the game in progress (the game room handles its own fallout).
  if ((op === 'leave' || op === 'remove') && out.game && out.game.code) {
    const who = op === 'remove' ? out.removed : uid;
    await leaveGameRoom(rtdb, out.game, who, now);
  }
  // The game room was closed some other way (its own End room, everyone left) → tally it.
  if (op === 'tick' && out.current) {
    const room = await readRoom(rtdb, out.current);
    if (!room || !room.pub || room.pub.status === 'closed') {
      const points = tallyRoom(room);
      await hubTx(code, (hub) => (finishCurrent(hub, out.current.seq, points, now), { hub, result: {} }));
    }
  }
  delete out.game;
  delete out.current;
  return Object.assign(base, out);
}

async function readRoom(rtdb, current) {
  const snap = await rtdb.ref(`games/${current.game}/${current.code}`).once('value');
  const v = snap && snap.val ? snap.val() : null;
  return v ? PD().hydrateRoom(v) : null;
}

async function leaveGameRoom(rtdb, current, who, now) {
  try {
    await PD().transactRoom(rtdb, `games/${current.game}/${current.code}`, (room) => {
      if (!room || !room.pub || !room.pub.players || !room.pub.players[who] || room.pub.players[who].left || room.pub.status === 'closed') {
        return room ? { room, result: {} } : null;
      }
      return PD().reduceRoom(room, who, 'leave', {}, now, Math.random);
    });
  } catch (e) {}
}

async function pick(adminApp, rtdb, code, uid, b, now, hubTx) {
  const G = PD().GAMES;
  // 1) Reserve the next game in the hub (host only, nothing running, enough people online).
  const plan = await hubTx(code, (hub) => {
    const pub = hub.pub;
    if (pub.status === 'closed') throw err('room_closed', 'This party has ended');
    if (!pub.players[uid] || pub.players[uid].left) throw err('not_member', 'You are not in this party');
    if (pub.host !== uid) throw err('host_only', 'Only the host can start the next game');
    if (pub.current) throw err('phase', 'A game is already running');
    let game = String(b.pick || '');
    if (!game && pub.settings.pickBy === 'vote') game = HubCore.resolveVote(pub.votes, pub.votes[uid]) || '';
    const info = HubCore.gameInfo(game);
    if (!info || !G[game]) throw err('bad_target', 'Pick a party game');
    hub.presence[uid] = { at: now, online: true };
    const online = members(pub).filter((id) => id === uid || isOnline(hub, id, now));
    if (online.length < info.min) throw err('need_players', info.label + ' needs at least ' + info.min + ' players online');
    // The host always plays (they run the room); then whoever sat out last time.
    const plan = HubCore.seatPlan(online, info.max, [uid].concat(pub.satOut));
    const offline = members(pub).filter((id) => online.indexOf(id) < 0);
    const seq = (Number(pub.seq) || 0) + 1;
    pub.seq = seq;
    pub.current = { game, code: '', seq, status: 'starting', seated: plan.seated, out: plan.out.concat(offline), at: now };
    bump(hub, now);
    return {
      hub,
      result: {
        game,
        seq,
        seated: plan.seated,
        out: plan.out.concat(offline),
        players: plan.seated.map((id) => ({ id, name: pub.players[id].name })),
        contentLang: pub.settings.contentLang || '',
        presence: plan.seated.reduce((m, id) => ((m[id] = hub.presence[id] || { at: now, online: true }), m), {}),
      },
    };
  });
  // 2) Create the game room (hub code when free, else a fresh code) with the group already seated.
  let roomCode = '';
  try {
    const candidates = [code, PD().makeCode(), PD().makeCode(), PD().makeCode()];
    for (const c of candidates) {
      try {
        await PD().transactRoom(
          rtdb,
          `games/${plan.game}/${c}`,
          (current) => {
            const live = current && current.pub && current.pub.status !== 'closed' && (current.pub.expiresAt || 0) > now;
            if (live && current.pub.hub !== code) throw err('code_taken');
            return { room: seatedRoom(plan, uid, Object.assign(plan.contentLang ? { contentLang: plan.contentLang } : {}, b.settings || {}), code, now), result: {} };
          },
          { allowEmpty: true }
        );
        roomCode = c;
        break;
      } catch (e) {
        if (e.code !== 'code_taken') throw e;
      }
    }
    if (!roomCode) throw err('busy', 'Could not open the game — try again');
  } catch (e) {
    await hubTx(code, (hub) => {
      if (hub.pub.current && hub.pub.current.seq === plan.seq) hub.pub.current = null;
      bump(hub, now);
      return { hub, result: {} };
    });
    throw e;
  }
  // 3) Point the hub at the live room — every phone opens it from here.
  await hubTx(code, (hub) => {
    if (hub.pub.current && hub.pub.current.seq === plan.seq) {
      hub.pub.current.code = roomCode;
      hub.pub.current.status = 'live';
      bump(hub, now);
    }
    return { hub, result: {} };
  });
  return { game: plan.game, roomCode, seq: plan.seq, seated: plan.seated, out: plan.out };
}

/** A fresh party room with the hub's online group already seated (host = hub host). */
function seatedRoom(plan, hostUid, settings, hubCode, now) {
  const pd = PD();
  const g = pd.GAMES[plan.game];
  const host = plan.players.find((p) => p.id === hostUid) || plan.players[0];
  const room = pd.newRoom({ game: plan.game, uid: host.id, name: host.name, settings: settings || {}, now });
  room.pub.hub = hubCode;
  room.pub.hubSeq = plan.seq;
  plan.players.forEach((p, i) => {
    if (p.id === host.id) {
      room.pub.players[p.id].seat = i;
      return;
    }
    room.pub.players[p.id] = { name: pd.cleanName(p.name), seat: i, joinedAt: now };
    room.pub.scores[p.id] = 0;
    room.presence[p.id] = plan.presence[p.id] || { at: now, online: true };
    if (g.onJoinLobby) g.onJoinLobby(room, p.id);
  });
  return room;
}

async function back(rtdb, code, uid, op, now, hubTx) {
  const snap = await rtdb.ref(`games/${HUB}/${code}/pub`).once('value');
  const pub = snap && snap.val ? snap.val() : null;
  if (!pub) throw err('room_not_found', 'Party not found');
  if (!pub.players || !pub.players[uid] || pub.players[uid].left) throw err('not_member', 'You are not in this party');
  if (pub.host !== uid) throw err('host_only', op === 'end' ? 'Only the host can end the party' : 'Only the host can go back to the hub');
  const cur = pub.current || null;
  let points = null;
  if (cur && cur.code) {
    // Close the game room once and read its final standings in the same transaction.
    try {
      points = await PD().transactRoom(rtdb, `games/${cur.game}/${cur.code}`, (room) => {
        if (!room || !room.pub) return null;
        const pts = tallyRoom(room);
        if (room.pub.status !== 'closed') {
          room.pub.status = 'closed';
          room.pub.deadline = null;
          room.pub.paused = null;
        }
        room.pub.hubDone = true;
        room.pub.rev = (Number(room.pub.rev) || 0) + 1;
        room.pub.updatedAt = now;
        return { room, result: { points: pts } };
      });
      points = points && points.points;
    } catch (e) {
      points = null;
    }
  }
  const out = await hubTx(code, (hub) => {
    if (cur) finishCurrent(hub, cur.seq, points, now);
    if (op === 'end') {
      hub.pub.status = 'closed';
      bump(hub, now);
    }
    return { hub, result: { points: points || {}, ended: op === 'end' } };
  });
  return out;
}

module.exports = {
  HUB,
  hubAction,
  reduceHub,
  newHub,
  hydrateHub,
  tallyRoom,
  finishCurrent,
  seatedRoom,
  mergeSettings,
};
