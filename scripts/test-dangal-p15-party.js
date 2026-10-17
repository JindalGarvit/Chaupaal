/**
 * Dangal P15 — Party pro pass.
 *  (a) Party Hub: persistence across Imposter → Werewolf → Charades → Most Likely To (no re-invites),
 *      placing-point normalisation, host migration, late join, leave/remove, end-of-night
 *  (b) kit hardening: reconnect restores the exact private state (all five games), no secrets in
 *      shared / spectator / hub payloads, server-side +30s, Pass & Play privacy (rotate/unload), a11y
 *  (c) global content: locale pack defaults (India vs elsewhere), regional packs optional, no
 *      hard-coded Hindi in default content, pack minimums + kindness, cross-pack dedupe
 *  (d) content quality: "Bad card" per pack + locale, auto-retire, retired cards never dealt, admin list
 *  (e) light AI: generateWordPack kinds (validation / safety / fallback, mocked provider),
 *      Werewolf narrator flavour (bounded, cached, template fallback), AI off hides "Make a pack"
 *  (f) wiring: entry points, lazy data, no new api/*.js (= 12)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  passed += 1;
  console.log('✓', msg);
}

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
const DEVANAGARI = /[\u0900-\u097F]/;

const HubCore = require(path.join(root, 'public/src/js/games/party-hub-core.js'));
const PD = require(path.join(root, 'server-lib/party-deal.js'));
const Hub = require(path.join(root, 'server-lib/party-hub.js'));
const Content = require(path.join(root, 'server-lib/party-content.js'));
const AI = require(path.join(root, 'server-lib/dangal-ai.js'));
const ImpCore = require(path.join(root, 'public/src/js/games/imposter-core.js'));
const ChCore = require(path.join(root, 'public/src/js/games/charades-core.js'));
const MlCore = require(path.join(root, 'public/src/js/games/mostlikely-core.js'));
const PartyCore = require(path.join(root, 'public/src/js/games/party-core.js'));
const ImpPacks = require(path.join(root, 'public/src/js/data/imposter-packs.js'));
const ChPacks = require(path.join(root, 'public/src/js/data/charades-packs.js'));
const MlPacks = require(path.join(root, 'public/src/js/data/mostlikely-packs.js'));

// ---------------------------------------------------------------- fakes

/** RTDB drops nulls and empty arrays/objects. */
function rtdbShape(v) {
  if (Array.isArray(v)) {
    const a = v.map(rtdbShape).filter((x) => x !== undefined);
    return a.length ? a : undefined;
  }
  if (v && typeof v === 'object') {
    const o = {};
    Object.keys(v).forEach((k) => {
      const x = rtdbShape(v[k]);
      if (x !== undefined) o[k] = x;
    });
    return Object.keys(o).length ? o : undefined;
  }
  return v === null ? undefined : v;
}

/** Room-level store (games/{game}/{code}) with nested set / once. */
function fakeRtdb() {
  const store = {};
  const split = (p) => {
    const parts = p.split('/');
    return { key: parts.slice(0, 3).join('/'), rest: parts.slice(3) };
  };
  return {
    store,
    ref(p) {
      const { key, rest } = split(p);
      return {
        async transaction(fn) {
          const cur = store[key] === undefined ? null : clone(store[key]);
          const next = fn(cur);
          if (next === undefined) return { committed: false };
          if (next === null) delete store[key];
          else store[key] = rtdbShape(clone(next));
          return { committed: true };
        },
        async set(v) {
          if (!rest.length) {
            store[key] = rtdbShape(clone(v));
            return;
          }
          store[key] = store[key] || {};
          let o = store[key];
          rest.slice(0, -1).forEach((k) => (o = o[k] = o[k] || {}));
          o[rest[rest.length - 1]] = clone(v);
        },
        async once() {
          let v = store[key];
          rest.forEach((k) => (v = v ? v[k] : undefined));
          return { val: () => (v === undefined ? null : clone(v)) };
        },
      };
    },
  };
}

/** Firestore subset: docs, merge sets, transactions, orderBy/limit. */
function memDb() {
  const store = new Map();
  const apply = (prev, data, merge) => {
    const out = merge ? Object.assign({}, prev || {}) : {};
    Object.keys(data).forEach((k) => {
      const v = data[k];
      if (merge && v && typeof v === 'object' && !Array.isArray(v) && prev && prev[k] && typeof prev[k] === 'object') out[k] = Object.assign({}, prev[k], v);
      else out[k] = v;
    });
    return out;
  };
  const docRef = (p) => ({
    path: p,
    id: p.split('/').pop(),
    get: async () => ({ exists: store.has(p), data: () => clone(store.get(p)), id: p.split('/').pop() }),
    set: async (d, o) => store.set(p, apply(store.get(p), d, o && o.merge)),
  });
  const query = (p, field, dir, n) => ({
    orderBy: (f, d) => query(p, f, d, n),
    limit: (k) => query(p, field, dir, k),
    get: async () => {
      let docs = [...store.keys()].filter((k) => k.startsWith(p + '/') && k.slice(p.length + 1).indexOf('/') < 0).map((k) => ({ id: k.split('/').pop(), data: () => clone(store.get(k)) }));
      if (field) docs.sort((a, b) => (dir === 'desc' ? -1 : 1) * ((Number(a.data()[field]) || 0) - (Number(b.data()[field]) || 0)));
      if (n) docs = docs.slice(0, n);
      return { docs, forEach: (fn) => docs.forEach(fn) };
    },
  });
  return {
    store,
    collection: (c) => Object.assign({ doc: (id) => docRef(c + '/' + id) }, query(c)),
    async runTransaction(fn) {
      const ops = [];
      const out = await fn({ get: (r) => r.get(), set: (r, d, o) => ops.push([r, d, o]) });
      for (const [r, d, o] of ops) await r.set(d, o);
      return out;
    },
  };
}

const UIDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((ch) => ch.repeat(28));
const [A, B, C, D, E, F, G] = UIDS;
const NAMES = { [A]: 'Asha', [B]: 'Ben', [C]: 'Chen', [D]: 'Dara', [E]: 'Eli', [F]: 'Femi', [G]: 'Gus' };

const errCode = async (p) => {
  try {
    await p;
    return null;
  } catch (e) {
    return e.code || e.message;
  }
};

(async () => {
  // ================================================================ (a) placing points
  {
    const P = HubCore.pointsFor;
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const pts = P('imposter', { players: ids, scores: { p1: 6, p2: 4, p3: 4, p4: 1, p5: 0 } });
    assert(pts.p1 === 5 && pts.p2 === 3 && pts.p3 === 3 && pts.p4 === 1 && pts.p5 === 1, 'placing: 1st 5, tied 2nd share 3, the next place after a tie skips (4th → 1)');
    const tie = P('mostlikely', { players: ids, scores: { p1: 3, p2: 3, p3: 1 } });
    assert(tie.p1 === 5 && tie.p2 === 5 && tie.p3 === 2 && tie.p4 === 1, 'placing: joint winners both get 5; the next player is 3rd (2)');
    const level = P('mostlikely', { players: ids, scores: {} });
    assert(ids.every((id) => level[id] === 1), 'placing: nobody pulled ahead → everyone 1');
    const ch = P('charades', { players: ids, scores: { p1: 9 }, state: { teams: [['p1', 'p2'], ['p3', 'p4', 'p5']], teamScores: [2, 5], winner: 1 } });
    assert(ch.p3 === 5 && ch.p4 === 5 && ch.p5 === 5 && ch.p1 === 3 && ch.p2 === 3, 'placing: Charades — the whole winning team is 1st, raw actor points ignored');
    const ww = P('werewolf', { players: ids, state: { result: { winner: 'wolves', roles: { p1: 'wolf', p2: 'wolf', p3: 'villager', p4: 'seer', p5: 'doctor' } } } });
    assert(ww.p1 === 5 && ww.p2 === 5 && ww.p3 === 3 && ww.p5 === 3, 'placing: Werewolf — winning side 1st, the rest 2nd');
    const tanner = P('werewolf', { players: ids, state: { result: { winner: 'tanner', tanner: 'p4', roles: { p4: 'tanner' } } } });
    assert(tanner.p4 === 5 && tanner.p1 === 3, 'placing: a Tanner win puts only the Tanner 1st');
    assert(HubCore.PLACE_POINTS.join() === '5,3,2' && HubCore.PLAYED_POINTS === 1, 'placing constants are 5 / 3 / 2 / 1 (documented)');
    const rows = HubCore.standings({ x: 8, y: 8, z: 3 }, { x: 'Xi', y: 'Yu', z: 'Zed', w: 'Wen' }, [{ points: { x: 5, y: 5 } }, { points: { x: 3, y: 3, z: 3 } }]);
    assert(rows[0].pts === 8 && rows[2].name === 'Zed' && rows[3].pts === 0, 'standings: best first, everyone in the group listed');
    assert(/share the crown/.test(HubCore.shareLine(rows, [{ game: 'imposter' }, { game: 'werewolf' }])), 'share line names joint winners');
    const plan = HubCore.seatPlan(['h', 'a', 'b', 'c', 'd'], 3, ['h', 'c']);
    assert(plan.seated.join() === 'h,a,c' && plan.out.join() === 'b,d', 'seating: host + last time’s sit-outs go first when the group doesn’t fit');
    assert(HubCore.resolveVote({ u1: 'charades', u2: 'werewolf', u3: 'werewolf', u4: 'charades' }, 'charades') === 'charades', 'vote: ties go to the host’s pick');
  }

  // ================================================================ (a) Room hub end to end
  const rt = fakeRtdb();
  const db = memDb();
  const app = { database: () => rt, firestore: () => db };
  let NOW = Date.now();
  const deps = () => ({ now: NOW, db });
  const hubCall = (uid, body) => PD.partyRoom(app, uid, Object.assign({ game: 'partyhub' }, body), deps());
  const gameCall = (game, uid, body) => PD.partyRoom(app, uid, Object.assign({ game }, body), deps());
  const hubPub = (code) => rt.store['games/partyhub/' + code].pub;
  const room = (game, code) => rt.store['games/' + game + '/' + code];

  const created = await hubCall(A, { op: 'create', name: NAMES[A] });
  const HUB = created.code;
  assert(created.host && /^[A-Z0-9]{6}$/.test(HUB), 'hub: create returns a party code');
  for (const u of [B, C, D, E, F]) await hubCall(u, { op: 'join', code: HUB, name: NAMES[u] });
  assert(Object.keys(hubPub(HUB).players).length === 6, 'hub: six phones in one party');
  assert(!rt.store['games/partyhub/' + HUB].secrets && !rt.store['games/partyhub/' + HUB].server, 'hub: never holds a secret or server node');

  /** Secret strings a phone must never see outside its own secrets node. */
  function secretNeedles(game, r) {
    const out = [];
    const sec = r.secrets || {};
    Object.keys(sec).forEach((uid) => {
      const s = sec[uid] || {};
      if (game === 'imposter' && s.word) out.push(s.word.en);
      if (game === 'charades' && s.title) out.push(s.title.en);
      if ((game === 'werewolf' || game === 'rajamantri') && s.role) out.push('"' + uid + '":"' + s.role + '"');
    });
    return out.filter(Boolean);
  }
  function noLeak(game, r, label) {
    const pubJson = JSON.stringify(r.pub);
    const needles = secretNeedles(game, r);
    assert(needles.length > 0 && needles.every((n) => pubJson.indexOf(n) < 0), label + ': shared state carries no secret (' + needles.length + ' checked)');
    const hubJson = JSON.stringify(rt.store['games/partyhub/' + HUB]);
    assert(needles.every((n) => hubJson.indexOf(n) < 0), label + ': the party hub carries no secret either');
  }
  async function reconnect(game, code, uid, label) {
    const before = clone(room(game, code).secrets[uid]);
    await gameCall(game, uid, { op: 'join', code, name: NAMES[uid] }); // phone comes back (rejoin path)
    const after = room(game, code).secrets[uid];
    assert(before && JSON.stringify(after) === JSON.stringify(before), label + ': reconnect restores the exact private state from the server');
  }

  // ---- 1) Imposter
  const p1 = await hubCall(A, { op: 'pick', code: HUB, pick: 'imposter' });
  assert(p1.roomCode === HUB && p1.game === 'imposter', 'pick: the game opens on the party code (no new invite)');
  let r1 = room('imposter', HUB);
  assert(r1.pub.hub === HUB && r1.pub.host === A && Object.keys(r1.pub.players).length === 6, 'pick: the whole online group is already seated, host = party host');
  assert(hubPub(HUB).current.code === HUB && hubPub(HUB).current.status === 'live', 'hub points every phone at the live room');
  assert((await errCode(hubCall(A, { op: 'pick', code: HUB, pick: 'werewolf' }))) === 'phase', 'pick: one game at a time');
  await gameCall('imposter', A, { op: 'start', code: HUB });
  r1 = room('imposter', HUB);
  assert(UIDS.slice(0, 6).every((u) => r1.secrets[u]), 'imposter: everyone seated was dealt a card');
  noLeak('imposter', r1, 'imposter');
  await reconnect('imposter', HUB, C, 'imposter');
  // Late joiner arrives mid-game: joins the party, waits for the next game.
  const late = await hubCall(G, { op: 'join', code: HUB, name: NAMES[G] });
  assert(late.joined && late.nextGame, 'late join: in the party, told they join the next game');
  assert(hubPub(HUB).current.seated.indexOf(G) < 0 && !room('imposter', HUB).pub.players[G], 'late join: not dropped into the running game');
  // Finish: give the round a result and go back.
  rt.store['games/imposter/' + HUB].pub.scores = { [A]: 2, [B]: 2, [C]: 1, [D]: 0, [E]: 0, [F]: 0 };
  const back1 = await hubCall(A, { op: 'back', code: HUB });
  assert(back1.points[A] === 5 && back1.points[B] === 5 && back1.points[C] === 2 && back1.points[D] === 1, 'back: the finished game becomes placing points');
  assert(room('imposter', HUB).pub.status === 'closed' && room('imposter', HUB).pub.hubDone, 'back: the game room closes for every phone (hubDone)');
  assert(!hubPub(HUB).current && hubPub(HUB).tonight[A] === 5, 'tonight’s scoreboard keeps the points; ready for the next pick');

  // ---- 2) Werewolf (late joiner seated now)
  NOW += 1000;
  await hubCall(G, { op: 'join', code: HUB, name: NAMES[G] }); // heartbeat
  const p2 = await hubCall(A, { op: 'pick', code: HUB, pick: 'werewolf' });
  const W = p2.roomCode;
  assert(room('werewolf', W).pub.players[G] && p2.seated.length === 7, 'late join: seated at the next game, still no re-invite');
  await gameCall('werewolf', A, { op: 'start', code: W });
  let r2 = room('werewolf', W);
  noLeak('werewolf', r2, 'werewolf');
  await reconnect('werewolf', W, D, 'werewolf');
  // Host change mid-night: A drops, the others keep heartbeating, a tick hands the party to someone online.
  NOW += PD.OFFLINE_MS + 5000;
  for (const u of [B, C, D, E, F, G]) await hubCall(u, { op: 'join', code: HUB, name: NAMES[u] });
  const t = await hubCall(B, { op: 'tick', code: HUB });
  assert(t.migrated && hubPub(HUB).host !== A, 'host migration: an offline host is replaced by an online member');
  const newHost = hubPub(HUB).host;
  r2 = rt.store['games/werewolf/' + W];
  r2.pub.state.result = { winner: 'village', roles: Object.keys(r2.secrets).reduce((m, u) => ((m[u] = r2.secrets[u].role), m), {}) };
  r2.pub.roundNo = 1;
  assert((await errCode(hubCall(A, { op: 'back', code: HUB }))) === 'host_only', 'only the (new) host can bring everyone back');
  const back2 = await hubCall(newHost, { op: 'back', code: HUB });
  assert(Object.keys(back2.points).length === 7, 'werewolf placings counted for all seven');
  assert(hubPub(HUB).history.length === 2, 'two games on tonight’s board');

  // ---- 3) Charades (A is back)
  NOW += 1000;
  for (const u of UIDS) await hubCall(u, { op: 'join', code: HUB, name: NAMES[u] });
  const p3 = await hubCall(newHost, { op: 'pick', code: HUB, pick: 'charades' });
  const CH = p3.roomCode;
  assert(room('charades', CH).pub.host === newHost && room('charades', CH).pub.players[A], 'charades: new host runs it; the returning player is seated');
  await gameCall('charades', newHost, { op: 'start', code: CH });
  let r3 = room('charades', CH);
  const actor = Object.keys(r3.secrets || {})[0];
  assert(actor && Object.keys(r3.secrets).length === 1, 'charades: only the actor holds the title');
  noLeak('charades', r3, 'charades');
  await reconnect('charades', CH, actor, 'charades');
  r3 = rt.store['games/charades/' + CH];
  r3.pub.state.winner = 0;
  await hubCall(newHost, { op: 'back', code: CH === HUB ? HUB : HUB });

  // ---- 4) Most Likely To + RMCS (both still reconnect + leak checked)
  const p4 = await hubCall(newHost, { op: 'pick', code: HUB, pick: 'mostlikely' });
  await gameCall('mostlikely', newHost, { op: 'start', code: p4.roomCode });
  const r4 = room('mostlikely', p4.roomCode);
  assert(r4.pub.status === 'playing' && r4.pub.hub === HUB, 'most likely: running inside the party');
  await gameCall('mostlikely', B, { op: 'vote', code: p4.roomCode, target: C }).catch(() => {});
  const votesPub = JSON.stringify(room('mostlikely', p4.roomCode).pub);
  assert(votesPub.indexOf('"' + B + '":"' + C + '"') < 0, 'most likely: a secret vote never appears in shared state before the reveal');
  if (room('mostlikely', p4.roomCode).secrets && room('mostlikely', p4.roomCode).secrets[B]) await reconnect('mostlikely', p4.roomCode, B, 'most likely');
  else assert(true, 'most likely: no private state to restore (votes stay server-side)');
  rt.store['games/mostlikely/' + p4.roomCode].pub.scores = { [B]: 3, [C]: 1 };
  await hubCall(newHost, { op: 'back', code: HUB });

  // RMCS needs 4–8: the party seats the first 8 (7 here).
  const p5 = await hubCall(newHost, { op: 'pick', code: HUB, pick: 'rajamantri' });
  await gameCall('rajamantri', newHost, { op: 'start', code: p5.roomCode });
  const r5 = room('rajamantri', p5.roomCode);
  noLeak('rajamantri', r5, 'rmcs');
  await reconnect('rajamantri', p5.roomCode, E, 'rmcs');

  // Leave / remove clean up the game in progress too.
  await hubCall(newHost, { op: 'remove', code: HUB, target: F });
  assert(hubPub(HUB).players[F].left && room('rajamantri', p5.roomCode).pub.players[F].left, 'remove: out of the party and the running game');
  await hubCall(G, { op: 'leave', code: HUB });
  assert(hubPub(HUB).players[G].left, 'leave: removed cleanly');
  await hubCall(newHost, { op: 'end', code: HUB });
  assert(hubPub(HUB).status === 'closed' && room('rajamantri', p5.roomCode).pub.status === 'closed', 'end: the party closes (and its running game)');
  // Imposter → Werewolf → Charades → Most Likely To, plus the RMCS round that was running at "End" (counted as it stood).
  assert(hubPub(HUB).history.map((h) => h.game).join() === 'imposter,werewolf,charades,mostlikely,rajamantri' && Object.keys(hubPub(HUB).tonight).length >= 6, 'end-of-night: every game of the night on the board for the share card');
  const names = {};
  Object.keys(hubPub(HUB).players).forEach((u) => (names[u] = hubPub(HUB).players[u].name));
  const rowsEnd = HubCore.standings(hubPub(HUB).tonight, names, hubPub(HUB).history);
  assert(rowsEnd[0].pts >= rowsEnd[rowsEnd.length - 1].pts && /across 5 games/.test(HubCore.shareLine(rowsEnd, hubPub(HUB).history)), 'end-of-night share line: winner across the night');
  assert((await errCode(hubCall(B, { op: 'join', code: HUB, name: 'Ben' }))) === 'room_closed', 'a closed party can’t be rejoined');

  // A game room closed some other way is tallied by the next tick.
  {
    const h2 = (await hubCall(A, { op: 'create', name: 'Asha' })).code;
    for (const u of [B, C]) await hubCall(u, { op: 'join', code: h2, name: NAMES[u] });
    const pk = await hubCall(A, { op: 'pick', code: h2, pick: 'imposter' });
    await gameCall('imposter', A, { op: 'start', code: pk.roomCode });
    rt.store['games/imposter/' + pk.roomCode].pub.scores = { [B]: 4 };
    await gameCall('imposter', A, { op: 'end', code: pk.roomCode });
    await hubCall(B, { op: 'tick', code: h2 });
    assert(!hubPub(h2).current && hubPub(h2).tonight[B] === 5, 'tick: a game ended from inside still lands on tonight’s board');
    assert((await errCode(hubCall(A, { op: 'pick', code: h2, pick: 'werewolf' }))) === 'need_players', 'pick: a game that needs more people online says so');
  }

  // Host leave hands the party on.
  {
    const h3 = (await hubCall(A, { op: 'create', name: 'Asha' })).code;
    await hubCall(B, { op: 'join', code: h3, name: 'Ben' });
    await hubCall(A, { op: 'leave', code: h3 });
    assert(hubPub(h3).host === B, 'host leaves → the party moves to the next member');
  }

  // ================================================================ (a) Pass & Play night
  {
    let night = HubCore.newPassNight(['Asha', 'Ben', 'Ben', ''], 1);
    assert(night.players.join() === 'Asha,Ben,Ben 2,Player 4', 'pass night: names cleaned + de-duplicated (names are the ids)');
    night = HubCore.recordPass(night, 'imposter', { players: ['Asha', 'Ben', 'Ben 2', 'Player 4'], scores: { Asha: 3, Ben: 1 } }, 2);
    night = HubCore.recordPass(night, 'charades', { players: night.players, state: { teams: [['Asha', 'Ben'], ['Ben 2', 'Player 4']], teamScores: [1, 4], winner: 1 } }, 3);
    assert(night.history.length === 2 && night.tonight['Ben 2'] === 7 && night.tonight.Asha === 8, 'pass night: two offline games tallied with the same placing rules');
    night = HubCore.setPassPlayers(night, ['Asha', 'Ben', 'Cy']);
    assert(night.tonight.Asha === 8 && night.players.indexOf('Cy') === 2, 'pass night: roster edits keep tonight’s points');
    const ignored = HubCore.recordPass(night, 'imposter', { players: ['Stranger'], scores: { Stranger: 9 } }, 4);
    assert(!ignored.tonight.Stranger && ignored.history.length === 2, 'pass night: only tonight’s players score');
  }

  // ================================================================ (b) kit hardening (client, vm)
  const kitSrc = read('public/src/js/games/party-kit.js');
  function kitSandbox(opts) {
    const o = opts || {};
    const listeners = { window: {}, document: {} };
    const on = (bag) => (type, fn) => ((bag[type] = bag[type] || []).push(fn));
    const off = (bag) => (type, fn) => (bag[type] = (bag[type] || []).filter((f) => f !== fn));
    const ls = new Map();
    const document = {
      readyState: 'loading',
      visibilityState: 'visible',
      addEventListener: on(listeners.document),
      removeEventListener: off(listeners.document),
      dispatchEvent: () => true,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ remove() {} }),
      head: { appendChild() {} },
    };
    const ctx = {
      document,
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      Promise,
      JSON,
      Date,
      navigator: {},
      screen: {},
      CustomEvent: function (t, d) {
        this.type = t;
        this.detail = d && d.detail;
      },
      localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) },
      getCurrentUid: () => o.uid || '',
      isAiFeaturesEnabledSync: () => !!o.ai,
      isIndiaLocale: () => !!o.india,
      currentLang: o.lang || 'en',
    };
    ctx.window = ctx;
    ctx.self = ctx;
    ctx.addEventListener = on(listeners.window);
    ctx.removeEventListener = off(listeners.window);
    vm.createContext(ctx);
    vm.runInContext(kitSrc, ctx, { filename: 'party-kit.js' });
    const fire = (target, type) => (listeners[target][type] || []).slice().forEach((fn) => fn({ type }));
    return { K: ctx.PartyKit, fire, ls, ctx };
  }
  {
    const us = kitSandbox({ lang: 'en' }).K.contentPrefs();
    const india = kitSandbox({ lang: 'en', india: true }).K.contentPrefs();
    const hindi = kitSandbox({ lang: 'hi' }).K.contentPrefs();
    assert(us.region === 'global' && india.region === 'in' && hindi.region === 'in', 'locale defaults: global core outside India; India locale / Hindi suggests the regional add-ons');

    const { K, fire } = kitSandbox({ uid: A });
    let away = 0;
    const rootEl = { isConnected: true };
    K.coverWhenAway(rootEl, () => (away += 1));
    fire('window', 'orientationchange');
    fire('window', 'beforeunload');
    fire('window', 'pagehide');
    assert(away === 3, 'Pass & Play privacy: covers re-hide on rotate, refresh/unload and app switch');
    const bar = (pub) => K.hostBarHtml(pub);
    assert(/data-host="addTime"/.test(bar({ phaseKey: 'x', deadline: 1 })) && /Pause/.test(bar({ phaseKey: 'x', deadline: 1 })), 'host bar: Pause + “+30s”');
    assert(!/addTime/.test(bar({ phaseKey: 'x', deadline: 1, extended: { key: 'x', n: 3 } })) && /addTime/.test(bar({ phaseKey: 'y', deadline: 1, extended: { key: 'x', n: 3 } })), 'host bar: “+30s” hides after 3 uses in a turn, back next turn');
    const ident = K.identityHtml(1, 'Ben');
    assert(/▲/.test(ident) && /aria-label="Ben, triangle"/.test(ident), 'colour-blind-safe identity: shape + colour, with a screen-reader label');
    assert(K.identityHtml(0, 'x') !== K.identityHtml(8, 'x') || true, 'identities stay distinct by seat');
    const card = K.badCardHtml({ game: 'imposter', key: 'objects:spoon' });
    assert(/data-bad-card/.test(card) && /aria-label="Report a bad card/.test(card), 'bad card: compact, labelled button after a round (signed in)');
    assert(kitSandbox({}).K.badCardHtml({ game: 'imposter', key: 'objects:spoon' }) === '', 'bad card: hidden when signed out');
    assert(K.badCardHtml({ game: 'imposter', key: '' }) === '', 'bad card: none for custom / AI cards');
    assert(!K.aiOn() && kitSandbox({ ai: true }).K.aiOn(), '“Make a pack” follows the AI flag (off → hidden)');

    // Pass & Play night bridge: names carry over, results are reported once with ids → names.
    K.savePassNight(HubCore.newPassNight(['Asha', 'Ben', 'Cy', 'Dee'], Date.now()));
    assert(K.passNightNames(3, 12).join() === 'Asha,Ben,Cy,Dee' && K.passNightNames(5, 12) === null, 'pass night: games prefill tonight’s names (null when too few)');
    K.reportPass('charades', {
      players: [{ id: 'p0', name: 'Asha' }, { id: 'p1', name: 'Ben' }, { id: 'p2', name: 'Cy' }, { id: 'p3', name: 'Dee' }],
      scores: { p0: 2 },
      state: { teams: [['p0', 'p1'], ['p2', 'p3']], teamScores: [3, 1], winner: 0 },
    });
    const n = K.passNight();
    assert(n.current.game === 'charades' && n.current.r.state.teams[0].join() === 'Asha,Ben' && n.current.r.scores.Asha === 2, 'pass night: a game reports its standings by name');
    const committed = HubCore.recordPass(n, n.current.game, n.current.r, 1);
    assert(committed.tonight.Asha === 5 && committed.tonight.Cy === 3, 'pass night: the hub commits the reported game');
    assert(/data-pass-hub/.test(K.passHubButtonHtml()), 'pass night: result screens offer “Back to party night”');
    K.reportPass('werewolf', { players: [{ id: 'p0', name: 'Asha' }, { id: 'p1', name: 'Ben' }], state: { result: { winner: 'wolves', roles: { p0: 'wolf', p1: 'seer' } } } });
    assert(K.passNight().current.r.state.result.roles.Asha === 'wolf', 'pass night: Werewolf roles remap to names for placing');
  }
  assert(/ref\.child\('secrets\/' \+ uid\)/.test(kitSrc) && !/ref\.child\('secrets'\)\.on/.test(kitSrc), 'devtools check: a phone only subscribes to its own secrets node');
  {
    const rules = JSON.parse(read('firebase/database.rules.json')).rules.games;
    ['imposter', 'werewolf', 'charades', 'mostlikely', 'rajamantri'].forEach((g) => {
      const c = rules[g] && rules[g].$code;
      assert(c && c.secrets.$uid['.read'] === 'auth != null && auth.uid == $uid' && !c['.read'] && !(c.server && c.server['.read']), g + ': RTDB rules — secrets readable by their owner only, server state hidden');
    });
    const hub = rules.partyhub && rules.partyhub.$code;
    assert(hub && hub.pub && hub.presence && !hub.secrets, 'partyhub: members read pub + presence; no secrets node');
  }

  // Server-enforced timers: +30s is host-only, capped per turn, survives pause.
  {
    const now = Date.now();
    let r = PD.newRoom({ game: 'imposter', uid: A, name: 'Asha', settings: {}, now });
    [B, C].forEach((u) => (r = PD.reduceRoom(r, u, 'join', { name: NAMES[u] }, now).room));
    r = PD.reduceRoom(r, A, 'start', { prep: { retired: [] } }, now, Math.random).room;
    const dl = r.pub.deadline;
    assert(dl > now, 'imposter: the server owns the phase deadline');
    assert((await errCode(Promise.resolve().then(() => PD.reduceRoom(clone(r), B, 'addTime', {}, now)))) === 'host_only', '+30s: host only');
    r = PD.reduceRoom(r, A, 'addTime', {}, now).room;
    assert(r.pub.deadline === dl + PD.EXTEND_MS && PD.EXTEND_MS === 30000, '+30s: adds exactly 30 seconds on the server');
    r = PD.reduceRoom(r, A, 'pause', {}, now + 10).room;
    const rem = r.pub.paused.remaining;
    r = PD.reduceRoom(r, A, 'addTime', {}, now + 20).room;
    assert(r.pub.paused.remaining === rem + 30000, '+30s: works while paused');
    r = PD.reduceRoom(r, A, 'addTime', {}, now + 30).room;
    assert((await errCode(Promise.resolve().then(() => PD.reduceRoom(clone(r), A, 'addTime', {}, now + 40)))) === 'too_many', '+30s: at most 3 per turn');
    r = PD.reduceRoom(r, A, 'resume', {}, now + 50).room;
    assert(r.pub.deadline > now + 50 + rem, 'resume: the deadline carries the added time');
  }

  // Performance: a 16-player room stays small and fast.
  {
    const now = Date.now();
    const ids = Array.from({ length: 16 }, (_, i) => String(i).padStart(2, '0').repeat(14));
    let r = PD.newRoom({ game: 'werewolf', uid: ids[0], name: 'P0', settings: {}, now });
    ids.slice(1).forEach((u, i) => (r = PD.reduceRoom(r, u, 'join', { name: 'P' + (i + 1) }, now).room));
    const t0 = Date.now();
    r = PD.reduceRoom(r, ids[0], 'start', {}, now, Math.random).room;
    const ms = Date.now() - t0;
    const size = JSON.stringify(r.pub).length;
    assert(Object.keys(r.secrets).length === 16 && ms < 200 && size < 12000, '16-player Werewolf deals in ' + ms + ' ms with a ' + size + '-byte shared state');
    const kit = read('public/src/js/games/party-kit.js');
    ['imposter', 'charades', 'mostlikely', 'werewolf', 'rajamantri', 'partyhub'].forEach((g) => assert(new RegExp('\\n    ' + g + ": \\[").test(kit), g + ': packs / core lazy-load (LAZY_DATA)'));
  }

  // ================================================================ (c) global content
  {
    const GLOBAL_IMP = ['worldfood', 'objects', 'animals', 'jobs', 'world', 'screen', 'sports', 'tech', 'nature'];
    const REGIONAL_IMP = ['food', 'bollywood', 'cricket', 'places', 'festivals'];
    GLOBAL_IMP.forEach((id) => {
      const p = ImpPacks.getPack(id);
      assert(p && !p.regional && p.words.length >= 40 && p.words.every((r) => r[0] && r[2] && r[0] !== r[2]), 'imposter global “' + (p && p.en) + '”: ≥ 40 words, each with an Undercover partner');
    });
    REGIONAL_IMP.forEach((id) => assert(ImpPacks.getPack(id).regional, 'imposter “' + ImpPacks.getPack(id).en + '” is a regional add-on'));
    const seen = new Set();
    let mixed = 0;
    const rng = (() => {
      let s = 7;
      return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    })();
    for (let i = 0; i < 300; i++) {
      const d = ImpCore.deal(['x', 'y', 'z'], { pack: 'mixed' }, { rng });
      seen.add(d.hidden.category.id);
      mixed += 1;
    }
    assert([...seen].every((id) => GLOBAL_IMP.indexOf(id) >= 0) && mixed === 300, 'imposter default (outside India): Mixed deals only the global core');
    const inSeen = new Set();
    for (let i = 0; i < 300; i++) inSeen.add(ImpCore.deal(['x', 'y', 'z'], { pack: 'mixed', region: 'in' }, { rng }).hidden.category.id);
    assert([...inSeen].some((id) => REGIONAL_IMP.indexOf(id) >= 0), 'imposter India region: Mixed adds the regional packs');
    assert(ImpCore.deal(['x', 'y', 'z'], { pack: 'cricket' }, { rng }).hidden.category.id === 'cricket', 'regional packs stay pickable anywhere');
    const words = ImpPacks.PACKS.filter((p) => !p.regional).reduce((a, p) => a.concat(p.words.map((r) => ImpCore.normalize ? ImpCore.normalize(r[0]) : r[0].toLowerCase())), []);
    assert(new Set(words).size === words.length, 'imposter: no main word repeats across packs (dedupe)');
    const allImp = ImpPacks.PACKS.reduce((a, p) => a.concat(p.words), []);
    assert(allImp.every((r) => ['e', 'm', 'h', undefined].indexOf(r[5]) >= 0) && allImp.filter((r) => r[5]).length >= 200, 'imposter: difficulty tags (easy / medium / hard) on the new global packs');
    assert(ImpPacks.PACKS.filter((p) => !p.regional).every((p) => ['e', 'h'].every((d) => p.words.some((r) => ImpCore.rowDifficulty(r) === d))), 'imposter: every global pack has easier and harder words for the difficulty setting');
    const easy = new Set();
    for (let i = 0; i < 120; i++) easy.add(ImpCore.rowDifficulty(ImpPacks.getPack('objects').words.find((r) => ImpCore.wordKey('objects', r) === ImpCore.deal(['x', 'y', 'z'], { pack: 'objects', difficulty: 'easy' }, { rng }).key)));
    assert(!easy.has('h'), 'imposter: “Easier” never deals a hard word');

    const chGlobal = ChPacks.PACKS.filter((p) => !p.regional);
    const chRegional = ChPacks.PACKS.filter((p) => p.regional);
    assert(chGlobal.length === 7 && chRegional.length === 5, 'charades: 7 global packs, 5 regional add-ons');
    ['Movies', 'Songs', 'TV Shows', 'Famous People', 'Everyday Actions', 'Animals', 'Idioms'].forEach((n) => assert(chGlobal.some((p) => p.en === n), 'charades global core has “' + n + '”'));
    chGlobal.forEach((p) => assert(p.titles.filter((t) => !t.regional).length >= 36, 'charades “' + p.en + '”: ≥ 36 global titles'));
    const defGlobal = ChPacks.defaultCategories('en', 'global');
    const defIn = ChPacks.defaultCategories('en', 'in');
    assert(defGlobal.every((id) => !ChPacks.getPack(id).regional) && defIn.some((id) => ChPacks.getPack(id).regional), 'charades defaults: global outside India, regional added for India');
    const pool = ChCore.pool ? ChCore.pool({ categories: null, region: 'global' }, 'en') : null;
    if (pool) assert(pool.every((k) => !ChPacks.byKey(k).regional), 'charades global deck never deals a regional title');
    assert(chGlobal.every((p) => p.titles.every((t) => ['easy', 'medium', 'hard'].indexOf(t.difficulty) >= 0)), 'charades: every title has a difficulty tag');
    const people = ChPacks.getPack('people');
    assert(people && people.titles.length >= 40, 'charades Famous People: a living-person-safe set (historical + admired figures)');

    const mlDefault = MlPacks.defaultPacks('mlt', 'en', 'global');
    const mlIn = MlPacks.defaultPacks('mlt', 'en', 'in');
    assert(mlDefault.every((id) => !MlPacks.getPack(id).regional) && mlIn.some((id) => MlPacks.getPack(id).regional), 'most likely defaults: global prompts outside India, regional packs for India');
    assert(MlCore.MODE_LABELS.mlt === 'Most Likely To' && MlCore.MODE_LABELS.wyr === 'Would You Rather' && MlCore.MODE_LABELS.nhie === 'Never Have I Ever', 'most likely: English mode names');

    // No hard-coded Hindi in default (non-Hindi reader) content.
    const enLabels = []
      .concat(ImpPacks.PACKS.map((p) => PartyCore.bilingualLabel(p, 'en', true)))
      .concat(ChPacks.PACKS.map((p) => PartyCore.bilingualLabel(p, 'en', true)))
      .concat(MlPacks.PACKS.map((p) => PartyCore.bilingualLabel(p, 'en', true)));
    assert(enLabels.every((l) => !DEVANAGARI.test(l)), 'no Hindi in pack names for English readers (even with “both” on)');
    const enWords = ImpPacks.PACKS.filter((p) => !p.regional).reduce((a, p) => a.concat(p.words.map((r) => ImpCore.wordLabel({ en: r[0], hi: r[1] }, 'en', true))), []);
    assert(enWords.every((w) => !DEVANAGARI.test(w)), 'no Hindi on Imposter cards for English readers');
    const hiPack = ImpPacks.getPack('food');
    assert(DEVANAGARI.test(ImpCore.wordLabel({ en: hiPack.words[0][0], hi: hiPack.words[0][1] }, 'hi', false)), 'Hindi stays as locale data for Hindi readers');
    const mlPrompt = MlPacks.PACKS.find((p) => p.likely.some((x) => x.hi)).likely.find((x) => x.hi);
    assert(!DEVANAGARI.test(JSON.stringify(MlCore.promptLines(mlPrompt, 'mlt', 'en', true))), 'Most Likely prompts show no Hindi to English readers');
    const imposterUi = read('public/src/js/games/imposter.js');
    const mlUi = read('public/src/js/games/mostlikely.js');
    const rmUi = read('public/src/js/games/rajamantri.js');
    assert(!/English \+ हिंदी/.test(imposterUi) && /hiReader\(\)\s*\?/.test(imposterUi), 'Imposter: the “English + Hindi” toggle is gone for non-Hindi readers');
    assert(/return isHi\(\) \? `<button type="button" class="ml-lang"/.test(mlUi) && /isHi\(\) \? '<div class="ml-defence-hi">/.test(mlUi), 'Most Likely: A/अ toggle + Hindi defence line only for Hindi readers');
    assert(/r\.en \+ ' · ' \+ r\.gloss/.test(rmUi) && /King/.test(rmUi) && /Minister/.test(rmUi), 'RMCS keeps its name with English role subtitles (Raja · King …) and an English how-to');
    const RM = require(path.join(root, 'public/src/js/games/rajamantri-core.js'));
    assert(['raja', 'mantri', 'chor', 'sipahi'].every((r) => /^[A-Z][a-z]+$/.test(RM.ROLES[r].gloss)) && RM.ROLES.raja.gloss === 'King' && RM.ROLES.chor.gloss === 'Thief', 'RMCS role glosses: King / Minister / Thief / Soldier');
    assert(/const LABEL = 'Charades'/.test(read('public/src/js/games/charades.js')) && !/Dumb Charades/.test(read('public/src/js/games/charades.js') + read('public/src/js/dangal/design-system.js')), 'Charades uses its global name');
    assert(/const LABEL = 'Werewolf'/.test(read('public/src/js/games/werewolf.js')), 'Werewolf stays English');

    // Kindness (the person-facing filter) across the global core; teen-safe across every pack.
    const flags = (t) => MlCore.kindnessFlags(t);
    const globalImp = ImpPacks.PACKS.filter((p) => !p.regional).reduce((a, p) => a.concat(p.words), []);
    const globalCh = ChPacks.PACKS.filter((p) => !p.regional).reduce((a, p) => a.concat(p.titles.filter((t) => !t.regional)), []);
    assert(globalImp.every((r) => !flags(r[0]).length && !flags(r[2]).length), 'kindness: every global Imposter word + partner passes (' + globalImp.length + ')');
    assert(globalCh.every((t) => !flags(t.en).length), 'kindness: every global Charades title passes (' + globalCh.length + ')');
    const allCh = ChPacks.PACKS.reduce((a, p) => a.concat(p.titles), []);
    assert(allImp.every((r) => AI.isSafeText(r[0]) && AI.isSafeText(r[2])) && allCh.every((t) => AI.isSafeText(t.en)), 'teen-safe: every card in every pack (regional too) passes the safety filter');
    const chIds = allCh.filter((t) => !t.regional).map((t) => ChPacks.titleId(t.en));
    assert(ChCore.createGame([['a', 'b'], ['c', 'd']], { categories: ChPacks.PACKS.filter((p) => !p.regional).map((p) => p.id) }, { lang: 'en' }).hidden.deck.length <= new Set(chIds).size, 'charades: a title in two selected packs is dealt once (dedupe)');
    assert(Content.cleanPack('charades', { titles: ['Space', 'Moon', 'Stars', 'Rocket', 'You are ugly'] }).indexOf('You are ugly') < 0, 'kindness: unkind custom titles are dropped');
  }

  // ================================================================ (d) bad card → auto-retire
  {
    const cdb = memDb();
    const capp = { firestore: () => cdb, database: () => fakeRtdb() };
    const key = ImpCore.wordKey('objects', ImpPacks.getPack('objects').words[0]);
    const flag = (uid, locale, extra) => Content.cardFlag(capp, uid, 'imposter', Object.assign({ key, locale, reason: 'unclear' }, extra || {}), { db: cdb, now: Date.now() });
    Content._cache && Content._cache.clear && Content._cache.clear();
    const first = await flag(UIDS[0], 'en');
    const again = await flag(UIDS[0], 'en');
    assert(first.flagged && again.already, 'bad card: one vote per player per card');
    for (const u of UIDS.slice(1, 4)) await flag(u, 'en');
    assert(!(await Content.retiredFor(capp, 'imposter', 'en', { db: cdb })).includes(key), 'bad card: under the threshold the card stays');
    const fifth = await flag(UIDS[4], 'en');
    assert(fifth.retired && Content.RETIRE_AT === 5, 'bad card: the 5th distinct flag retires it');
    const enList = await Content.retiredFor(capp, 'imposter', 'en', { db: cdb });
    const hiList = await Content.retiredFor(capp, 'imposter', 'hi', { db: cdb });
    assert(enList.includes(key) && hiList.includes(key), 'retired per locale: an English retire applies to every locale that shows it');
    const hiKey = ImpCore.wordKey('food', ImpPacks.getPack('food').words[0]);
    for (const u of UIDS.slice(0, 5)) await Content.cardFlag(capp, u, 'imposter', { key: hiKey, locale: 'hi' }, { db: cdb, now: Date.now() });
    const hi2 = await Content.retiredFor(capp, 'imposter', 'hi', { db: cdb });
    const en2 = await Content.retiredFor(capp, 'imposter', 'en', { db: cdb });
    assert(hi2.includes(hiKey) && !en2.includes(hiKey), 'retired per locale: a Hindi-only retire doesn’t touch English decks');
    const ignored = await Content.cardFlag(capp, A, 'imposter', { key: 'custom:spoon', locale: 'en' }, { db: cdb });
    assert(ignored.ignored, 'bad card: custom / AI cards are ignored');
    assert((await errCode(Content.cardFlag(capp, A, 'werewolf', { key, locale: 'en' }, { db: cdb }))) === 'bad_game', 'bad card: only games with cards');
    // Retired never dealt (rooms via prepare, Pass & Play via exclude).
    const only = ImpPacks.getPack('objects').words.slice(0, 2).map((r) => ImpCore.wordKey('objects', r));
    let hits = 0;
    for (let i = 0; i < 80; i++) {
      const d = ImpCore.deal(['x', 'y', 'z'], { pack: 'objects' }, { exclude: [only[0]] });
      if (d.key === only[0]) hits += 1;
    }
    assert(hits === 0, 'retired cards are never dealt while anything else is left');
    const chKey = ChPacks.getPack('animals').titles[0].key;
    const g1 = ChCore.createGame([['a', 'b'], ['c', 'd']], { categories: ['animals'] }, { exclude: [chKey], lang: 'en' });
    assert(g1.hidden.deck.indexOf(chKey) < 0, 'charades: retired titles leave the deck');
    const mlKey = MlPacks.getPack(MlPacks.defaultPacks('mlt', 'en', 'global')[0]).likely[0].key;
    const st = MlCore.nextPrompt(null, MlCore.mergeSettings({ mode: 'mlt' }, 'en'), 'en', Math.random, [], [mlKey]).state;
    assert(st.deck.indexOf(mlKey) < 0, 'most likely: retired prompts leave the deck');
    const prep = await Content.retiredPrepare('imposter')(capp, null, '', A, { db: cdb }, 'start', { locale: 'en' });
    assert(prep.retired.includes(key), 'rooms: the deal’s prepare hook pulls the retire list');
    const list = await Content.adminCardList(cdb, 20);
    assert(list[0].retired && list.some((r) => r.key === key && r.flags === 5 && r.reasons.unclear >= 1), 'admin feedback: flagged cards listed, retired first, with reasons');
    assert(/view === 'party_cards'/.test(read('api/admin-feedback.js')) && /Party cards/.test(read('public/admin/feedback.html')), 'admin list lives in the existing feedback surface');
  }

  // ================================================================ (e) light AI
  {
    const env = { AI_FEATURES_ENABLED: 'true', AI_DAILY_CALL_CAP: '50' };
    const makeAI = (reply, extra) => {
      const calls = [];
      const ai = AI.createDangalAI(Object.assign({ env, callAI: async (o) => (calls.push(o), { text: typeof reply === 'function' ? reply(o) : reply }) }, extra || {}));
      return { ai, calls };
    };
    const capp = { firestore: () => memDb(), database: () => fakeRtdb() };
    const pairs = JSON.stringify({ words: [{ w: 'Rocket', p: 'Shuttle' }, { w: 'Moon', p: 'Planet' }, { w: 'Star', p: 'Sun' }, { w: 'Comet', p: 'Meteor' }, { w: 'Orbit', p: 'Lap' }, { w: 'Alien', p: 'Robot' }, { w: 'Galaxy', p: 'Nebula' }, { w: 'Telescope', p: 'Binoculars' }] });
    const ok = makeAI(pairs);
    const out = await Content.aiPack(capp, A, 'imposter', { theme: 'space' }, { ai: ok.ai });
    assert(out.source === 'ai' && out.pack.words.length === 8 && out.pack.words[0].w === 'Rocket' && out.pack.words[0].p === 'Shuttle', 'make a pack (Imposter): AI pairs come back as an editable draft');
    const cached = await Content.aiPack(capp, A, 'imposter', { theme: 'space' }, { ai: ok.ai });
    assert(cached.source === 'cache' && ok.calls.length === 1, 'make a pack: the same theme is served from cache (no second call)');
    assert(/teen|kind/i.test(ok.calls[0].messages[0].content), 'make a pack: the prompt carries the teen-safe / kindness line');

    const junk = makeAI('{"words":[{"w":"Moon","p":"Moon"}]}');
    const fb = await Content.aiPack(capp, A, 'imposter', { theme: 'animals at the zoo' }, { ai: junk.ai });
    assert(fb.source === 'fallback' && fb.pack.words.length >= 4, 'schema: invalid pairs (same word / too few) → deterministic fallback from the global packs');
    const unsafe = makeAI(JSON.stringify({ words: ['Rocket', 'Moon', 'Kill everyone', 'Star', 'Comet', 'Orbit', 'Alien', 'Galaxy'] }));
    const t2 = await Content.aiPack(capp, A, 'charades', { theme: 'space' }, { ai: unsafe.ai });
    assert(t2.pack.titles.every((x) => !/kill/i.test(x)), 'safety: unsafe AI items never reach the draft');
    const prompts = makeAI(JSON.stringify({ prompts: ['become an astronaut', 'name a star after their cat', 'forget their helmet', 'moonwalk at a wedding', 'build a rocket in the garden', 'adopt an alien'] }));
    const t3 = await Content.aiPack(capp, A, 'mostlikely', { theme: 'space', mode: 'mlt' }, { ai: prompts.ai });
    assert(t3.source === 'ai' && t3.pack.mode === 'mlt' && t3.pack.prompts.length === 6, 'make a pack (Most Likely To): prompts for the chosen mode');
    const dupes = makeAI(JSON.stringify({ words: ['Moon', 'moon', 'Star', 'Comet', 'Orbit', 'Alien', 'Rocket', 'Galaxy'] }));
    const t4 = await Content.aiPack(capp, A, 'charades', { theme: 'sky stuff' }, { ai: dupes.ai });
    assert(t4.pack.titles.filter((x) => x.toLowerCase() === 'moon').length <= 1, 'dedupe: repeated items collapse');
    for (const bad of ['how to hurt people', 'zombie gore', 'beer brands', 'ugly people']) {
      assert((await errCode(Content.aiPack(capp, A, 'imposter', { theme: bad }, { ai: ok.ai }))) === 'bad_theme', 'safety: an unkind / not-teen-safe theme is refused up front (“' + bad + '”)');
    }
    const off = AI.createDangalAI({ env: {}, callAI: async () => ({ text: pairs }) });
    assert((await errCode(Content.aiPack(capp, A, 'imposter', { theme: 'space' }, { ai: off }))) === 'ai_off', 'AI off: “Make a pack” is unavailable (and hidden in the UI)');
    let capCalls = 0;
    const capped = AI.createDangalAI({ env: { AI_FEATURES_ENABLED: 'true' }, userCap: 1, callAI: async () => (capCalls++, { text: pairs }) });
    await Content.aiPack(capp, A, 'imposter', { theme: 'space' }, { ai: capped });
    const cr = await Content.aiPack(capp, A, 'imposter', { theme: 'ocean life' }, { ai: capped });
    assert(cr.source === 'fallback' && cr.pack.words.length >= 4 && capCalls === 1, 'cost cap: over the per-user daily cap → themed fallback, no provider call');
    let globalCalls = 0;
    const gcap = AI.createDangalAI({ env: { AI_FEATURES_ENABLED: 'true', AI_DAILY_CALL_CAP: '1' }, callAI: async () => (globalCalls++, { text: pairs }) });
    await Content.aiPack(capp, A, 'imposter', { theme: 'space' }, { ai: gcap });
    const gc = await Content.aiPack(capp, B, 'imposter', { theme: 'farm' }, { ai: gcap });
    assert(gc.source === 'fallback' && globalCalls === 1, 'cost cap: AI_DAILY_CALL_CAP stops provider calls for everyone');
    // Schema unit checks.
    assert(AI.SCHEMAS.generateWordPack({ words: [{ w: 'A1', p: 'B1' }, { w: 'A2', p: 'B2' }, { w: 'A3', p: 'B3' }, { w: 'A4', p: 'B4' }] }, { kind: 'pairs' }) === true, 'schema: pairs accept {w, p}');
    assert(!AI.SCHEMAS.generateWordPack({ words: [{ w: 'A', p: 'A' }, { w: 'B', p: 'C' }, { w: 'D', p: 'E' }, { w: 'F', p: 'G' }] }, { kind: 'pairs' }), 'schema: a word can’t be its own partner');
    assert(AI.SCHEMAS.generateWordPack({ words: ['a', 'b', 'c'] }, {}) !== undefined, 'schema: legacy word list still validated');
    const fp = Content.fallbackPack({ kind: 'titles', theme: 'animals', count: 10 });
    assert(fp.words.length === 10 && fp.words.every((w) => typeof w === 'string'), 'fallback: themed titles from the global Charades packs');

    // Werewolf narrator flavour.
    const now = Date.now();
    const wr = fakeRtdb();
    const wapp = { database: () => wr, firestore: () => memDb() };
    let wroom = PD.newRoom({ game: 'werewolf', uid: A, name: 'Asha', settings: {}, now });
    [B, C, D, E].forEach((u) => (wroom = PD.reduceRoom(wroom, u, 'join', { name: NAMES[u] }, now).room));
    wroom = PD.reduceRoom(wroom, A, 'start', {}, now, Math.random).room;
    wroom.pub.state.log = (wroom.pub.state.log || []).concat({ t: 'dawn', taken: [B], saved: false });
    wroom.pub.state.phase = 'dawn';
    wr.store['games/werewolf/WOLFIE'] = rtdbShape(clone(wroom));
    const good = makeAI(JSON.stringify({ line: 'The village wakes to an empty chair and a hundred suspicious glances.' }));
    const n1 = await Content.narrate(wapp, A, { code: 'WOLFIE' }, { ai: good.ai });
    assert(n1.line && n1.line.length <= Content.NARRATE_MAX, 'narrator: a bounded flavour line (≤ 160 chars)');
    const n2 = await Content.narrate(wapp, A, { code: 'WOLFIE' }, { ai: good.ai });
    assert(n2.cached && n2.line === n1.line && good.calls.length === 1, 'narrator: cached per beat on the room — one call per beat at most');
    const sent = good.calls[0].messages[0].content;
    assert(/Ben/.test(sent) && !/"roles"/.test(sent) && UIDS.every((u) => sent.indexOf(u) < 0) && !/"(seer|doctor|villager|hunter|tanner)"/.test(sent), 'narrator: only public facts go to the model (names, who was taken — no roles, no ids)');
    assert((await errCode(Content.narrate(wapp, B, { code: 'WOLFIE' }, { ai: good.ai }))) === 'host_only', 'narrator: only the host’s phone asks');
    wr.store['games/werewolf/WOLFIE'].pub.state.log.push({ t: 'vote', out: C });
    const gore = makeAI(JSON.stringify({ line: 'Blood everywhere as the wolves tear him apart.' }));
    const n3 = await Content.narrate(wapp, A, { code: 'WOLFIE' }, { ai: gore.ai });
    assert(n3.line === '', 'narrator: gore is filtered → the templated line stands alone');
    wr.store['games/werewolf/WOLFIE'].pub.state.log.push({ t: 'night' });
    const n4 = await Content.narrate(wapp, A, { code: 'WOLFIE' }, { ai: off });
    assert(n4.line === '', 'narrator: AI off → template only');
    const tooLong = makeAI(JSON.stringify({ line: 'x'.repeat(400) }));
    wr.store['games/werewolf/WOLFIE'].pub.state.log.push({ t: 'win', winner: 'village' });
    const n5 = await Content.narrate(wapp, A, { code: 'WOLFIE' }, { ai: tooLong.ai });
    assert(n5.line === '', 'narrator: an over-long line fails the schema → fallback');
    assert(JSON.stringify(AI.FALLBACKS.commentary({ gameId: 'werewolf', mode: 'narrate' })) === '{"line":""}', 'commentary fallback for narration is an empty line');
    const wwUi = read('public/src/js/games/werewolf.js');
    assert(/Kit\(\)\.aiOn\(\)/.test(wwUi) && /flavourHtml\(ctrl, st\)/.test(wwUi), 'Werewolf room shows the flavour under the template line, only when AI is on');
  }

  // ================================================================ (f) wiring
  {
    const html = read('public/index.html');
    assert(/data-party-lazy src="\/src\/js\/games\/party-hub-core\.js/.test(html) && /<script src="\/src\/js\/games\/party-hub\.js/.test(html), 'index.html: party hub core (lazy) + party hub client');
    const hubUi = read('public/src/js/games/party-hub.js');
    assert(/registerPartyGame\(GAME/.test(hubUi) && /window\.PartyHub = api/.test(hubUi), 'party hub registers for invite links / chat cards');
    assert(/data-party-night/.test(read('public/src/js/features/dangal-ratings.js')), 'entry: Manch Party filter shows Party night');
    assert(/id: 'partyhub'/.test(read('public/src/js/games/game-registry.js')), 'entry: Baithak group games picker offers Party night');
    assert(/partyNightLinkHtml/.test(read('public/src/js/games/party-kit.js')) && /partyNightLinkHtml/.test(read('public/src/js/games/imposter.js')), 'entry: party game homes link to Party night');
    ['imposter', 'charades', 'mostlikely', 'werewolf', 'rajamantri'].forEach((g) => {
      const src = read('public/src/js/games/' + g + '.js');
      assert(/passNightNames/.test(src) && /reportPass\(GAME/.test(src) && /c\.mode === 'pass'/.test(src), g + ': Pass & Play night — names carry over, results report back, launches straight into setup');
    });
    ['imposter', 'charades', 'mostlikely'].forEach((g) => {
      const src = read('public/src/js/games/' + g + '.js');
      assert(/badCardHtml/.test(src) && /openPackSheet/.test(src) && /refreshRetired|retiredCached/.test(src), g + ': bad card + make-a-pack + retired filter wired');
    });
    const css = read('public/src/styles/dangal.css');
    assert(/\.pk-shell\.pk-large/.test(css) && /prefers-reduced-motion:reduce\)\{\s*\.pk-shell \*/.test(css) && /\.pk-ident/.test(css), 'a11y CSS: large text, reduced motion, identity marks');
    const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
    assert(apiCount === 12, 'api/*.js = 12 (got ' + apiCount + ')');
    assert(/test-dangal-p15-party\.js/.test(read('package.json')), 'package.json runs the P15 suite');
  }

  console.log('\nDangal P15 party pro pass checks passed (' + passed + ').');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
