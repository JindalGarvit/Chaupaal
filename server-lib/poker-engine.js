/**
 * Texas Hold'em Live tables — server-authoritative. Served by POST /api/media-config
 * { action: 'poker_table', op, ... } (no extra Vercel function).
 *
 * RTDB games/poker/{tableId} (same layout as party rooms / penalty):
 *   pub      — seated players read: seats, stacks, blinds, the public hand (JSON), timers
 *   secrets  — secrets/{uid}: only that player's two hole cards for the current hand
 *   presence — presence/{uid}: client heartbeat { at, online }
 *   server   — no client access: the full hand incl. deck order and every hole card, pending
 *              wallet effects, device/IP hashes for collusion signals
 * games/poker/_lobby/{quick|sng}/… — server-only index of open public tables.
 *
 * Table kinds:
 *   quick   — public, matchmade, wallet buy-in at a stake tier; stack returns to the wallet on leave
 *   sng     — Sit & Go, fixed wallet buy-in, table chips, escalating blinds, top 2 / 3 paid
 *   friends — private (code), host sets blinds / stack / blind timer / seats; table-only chips
 *
 * Money never moves inside the RTDB transaction. Buy-ins debit Firestore first (pending record),
 * then seat; a failed seat refunds. Cash-outs, payouts and achievements are queued as effects in
 * server/effects and applied idempotently (one marker doc per effect) — any later call drains them,
 * so chips are never stranded in escrow.
 */
'use strict';

const crypto = require('crypto');
const Core = require('../public/src/js/games/poker-core.js');

const LIVE_POLICY = require('../public/src/js/dangal/dangal-live-policy.js').policyFor('poker');

const ACTION_MS = LIVE_POLICY.turnMs;
const BANK_MS = LIVE_POLICY.bankMs;
const BANK_REFILL_MS = 5000;
const AWAY_ACTION_MS = 4000;
const HAND_GAP_MS = 4000;
const SHOWDOWN_GAP_MS = 7000;
const START_DELAY_MS = 3000;
const RECONNECT_MS = LIVE_POLICY.reconnectMs;
const SIT_OUT_MAX_MS = 15 * 60 * 1000;
const BUST_GRACE_MS = 2 * 60 * 1000;
const IDLE_CLOSE_MS = 10 * 60 * 1000;
const TABLE_TTL_MS = 12 * 60 * 60 * 1000;
const BUYIN_STALE_MS = 60000;
const BLUFF_WINS = 10;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Internal ops (seat / topup_apply / sweep) are only reachable from pokerTable itself. */
const CLIENT_OPS = new Set([
  'age_confirm', 'reconcile', 'quick_join', 'sng_join', 'friends_create', 'join', 'leave',
  'act', 'tick', 'sit_out', 'sit_in', 'topup', 'rebuy', 'show', 'start', 'settings', 'end',
]);
const SEATING_OPS = new Set(['quick_join', 'sng_join', 'friends_create', 'join']);

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

const cleanName = (raw) => String(raw || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24) || 'Player';
const cleanId = (raw) => String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
const hash = (s) => (s ? crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16) : '');

function randomCode(len) {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return s;
}

const cryptoRand = { int: (n) => crypto.randomInt(n) };

// ------------------------------------------------------------------ table shape

function newTable(o) {
  const kind = o.kind;
  let settings;
  if (kind === 'quick') {
    const t = Core.tierById(o.tier);
    if (!t) throw err('bad_tier', 'Pick a table');
    settings = { sb: t.sb, bb: t.bb, min: t.min, max: t.max, seats: Core.QUICK_SEATS };
  } else if (kind === 'sng') {
    const size = Core.SNG.sizes.indexOf(Number(o.size)) >= 0 ? Number(o.size) : 6;
    settings = { seats: size, buyIn: Core.SNG.buyIn, stack: Core.SNG.stack, sb: Core.SNG.levels[0][0], bb: Core.SNG.levels[0][1] };
  } else settings = Core.mergeFriendsSettings(o.settings);
  const pub = {
    game: 'poker',
    id: o.id,
    kind,
    code: kind === 'friends' ? o.id : null,
    host: kind === 'friends' ? o.uid : null,
    tier: kind === 'quick' ? o.tier : null,
    size: kind === 'sng' ? settings.seats : null,
    status: 'waiting',
    settings,
    players: {},
    seats: {},
    bank: {},
    handNo: 0,
    doneHand: 0,
    buttonSeat: -1,
    handJ: null,
    deadline: 0,
    nextAt: 0,
    turn: null,
    blinds: { sb: settings.sb, bb: settings.bb, level: 0 },
    startedAt: 0,
    sng: kind === 'sng' ? { buyIn: settings.buyIn, payouts: Core.sngPayouts(settings.seats, settings.buyIn), finish: {} } : null,
    createdAt: o.now,
    updatedAt: o.now,
    expiresAt: o.now + TABLE_TTL_MS,
    serverNow: o.now,
    rev: 1,
  };
  return { pub, server: { handJ: null, effects: {}, seq: 0, applied: {}, devices: {} }, secrets: {}, presence: {} };
}

/** RTDB drops empty objects and nulls — restore the shapes the reducer expects. */
function hydrate(t) {
  if (!t || !t.pub) return t;
  const p = t.pub;
  p.players = p.players || {};
  p.seats = p.seats || {};
  p.bank = p.bank || {};
  p.settings = p.settings || {};
  p.blinds = p.blinds || { sb: p.settings.sb, bb: p.settings.bb, level: 0 };
  p.turn = p.turn || null;
  p.handJ = p.handJ || null;
  if (p.kind === 'sng') {
    p.sng = p.sng || {};
    p.sng.finish = p.sng.finish || {};
    p.sng.payouts = Array.isArray(p.sng.payouts) ? p.sng.payouts : Core.sngPayouts(p.settings.seats, p.settings.buyIn);
  }
  t.server = t.server || {};
  t.server.effects = t.server.effects || {};
  t.server.applied = t.server.applied || {};
  t.server.devices = t.server.devices || {};
  t.server.seq = Number(t.server.seq) || 0;
  t.secrets = t.secrets || {};
  t.presence = t.presence || {};
  return t;
}

const seatKey = (n) => 's' + n;
const seatNo = (key) => Number(String(key).slice(1));

function seatList(pub) {
  return Object.keys(pub.seats)
    .map((k) => Object.assign({ key: k, seat: seatNo(k) }, pub.seats[k]))
    .sort((a, b) => a.seat - b.seat);
}

function seatKeyOf(pub, uid) {
  return Object.keys(pub.seats).find((k) => pub.seats[k].uid === uid) || null;
}

function freeSeat(pub) {
  const max = Number(pub.settings.seats) || Core.QUICK_SEATS;
  for (let n = 0; n < max; n++) if (!pub.seats[seatKey(n)]) return n;
  return -1;
}

function loadHand(t) {
  try {
    return t.server.handJ ? JSON.parse(t.server.handJ) : null;
  } catch (e) {
    return null;
  }
}

function saveHand(t, h) {
  t.server.handJ = h ? JSON.stringify(h) : null;
  t.pub.handJ = h ? JSON.stringify(Core.publicHand(h)) : null;
}

function isGone(t, uid, now) {
  const p = t.presence[uid];
  return !p || now - (Number(p.at) || 0) > RECONNECT_MS;
}

function pushEffect(t, e) {
  t.server.seq += 1;
  t.server.effects['e' + t.server.seq] = Object.assign({ at: t.pub.updatedAt || 0 }, e);
}

function inActiveHand(t, uid) {
  const h = loadHand(t);
  if (!h || h.done) return false;
  const p = h.players.find((x) => x.id === uid);
  return !!(p && !p.folded);
}

function eligibleCount(pub) {
  return seatList(pub).filter((s) => s.stack > 0 && (pub.kind === 'sng' || (!s.sittingOut && !s.leaving))).length;
}

// ------------------------------------------------------------------ hands

function blindsFor(t, now) {
  const pub = t.pub;
  if (pub.kind === 'sng') return Core.sngBlinds(now - (pub.startedAt || now));
  if (pub.kind === 'friends') return Core.friendsBlinds(pub.settings, now - (pub.startedAt || now));
  return { level: 0, sb: pub.settings.sb, bb: pub.settings.bb };
}

function maybeSchedule(t, now) {
  const pub = t.pub;
  const h = loadHand(t);
  if (h && !h.done) return;
  if (pub.status === 'closed' || pub.status === 'finished') return;
  if (pub.kind !== 'quick' && pub.status !== 'playing') return;
  if (eligibleCount(pub) < 2) return;
  if (!pub.nextAt) {
    pub.nextAt = now + START_DELAY_MS;
    pub.deadline = pub.nextAt;
  }
}

function startHand(t, now, rand) {
  const pub = t.pub;
  if (pub.status === 'closed' || pub.status === 'finished') return false;
  if (pub.kind !== 'quick' && pub.status !== 'playing') return false;
  const seats = seatList(pub).map((s) => ({
    seat: s.seat,
    id: s.uid,
    name: s.name,
    stack: s.stack,
    sittingOut: pub.kind === 'sng' ? false : !!(s.sittingOut || s.leaving),
    missedBB: !!s.missedBB,
    missedSB: !!s.missedSB,
    newcomer: !!s.newcomer,
  }));
  const plan = Core.planHand(seats, pub.buttonSeat >= 0 ? pub.buttonSeat : null);
  pub.nextAt = 0;
  if (!plan) {
    pub.deadline = 0;
    return false;
  }
  const blinds = blindsFor(t, now);
  Object.keys(plan.missed).forEach((uid) => {
    const k = seatKeyOf(pub, uid);
    if (!k) return;
    pub.seats[k].missedBB = true;
    if (plan.missed[uid].sb) pub.seats[k].missedSB = true;
  });
  plan.players.forEach((p) => {
    const k = seatKeyOf(pub, p.id);
    if (!k) return;
    pub.seats[k].missedBB = false;
    pub.seats[k].missedSB = false;
    pub.seats[k].newcomer = false;
  });
  const deck = Core.shuffle(Core.newDeck(), rand.int);
  const h = Core.createHand({
    players: plan.players,
    button: plan.button,
    sb: blinds.sb,
    bb: blinds.bb,
    deck,
    handNo: (Number(pub.handNo) || 0) + 1,
    posts: Core.scalePosts(plan.posts, blinds.sb, blinds.bb),
  });
  pub.handNo = h.handNo;
  pub.buttonSeat = plan.buttonSeat;
  pub.blinds = { sb: blinds.sb, bb: blinds.bb, level: blinds.level };
  if (pub.kind === 'quick') pub.status = 'playing';
  t.secrets = {};
  h.players.forEach((p) => {
    t.secrets[p.id] = { handNo: h.handNo, hole: p.hole.slice() };
    pub.bank[p.id] = Math.min(BANK_MS, (pub.bank[p.id] == null ? BANK_MS : Number(pub.bank[p.id])) + BANK_REFILL_MS);
  });
  afterAction(t, h, now);
  return true;
}

/** Leaving players fold on their turn; then set the clock (or wrap the hand up). */
function afterAction(t, h, now) {
  const pub = t.pub;
  let guard = 0;
  while (!h.done && guard++ < 20) {
    const k = seatKeyOf(pub, h.players[h.toAct].id);
    if (k && pub.seats[k].leaving) Core.applyAction(h, h.players[h.toAct].id, Core.timeoutAction(h, h.toAct));
    else break;
  }
  saveHand(t, h);
  if (h.done) return onHandDone(t, h, now);
  const uid = h.players[h.toAct].id;
  const k = seatKeyOf(pub, uid);
  const away = k && pub.seats[k].away;
  pub.turn = { uid, i: h.toAct, bank: false, at: now };
  pub.deadline = now + (away ? AWAY_ACTION_MS : ACTION_MS);
}

function onHandDone(t, h, now) {
  const pub = t.pub;
  if (pub.doneHand === h.handNo) return;
  pub.doneHand = h.handNo;
  pub.turn = null;
  const res = h.result;
  h.players.forEach((p) => {
    const k = seatKeyOf(pub, p.id);
    if (k) pub.seats[k].stack = p.stack;
  });
  if (pub.kind !== 'friends' && !res.showdown) res.winners.forEach((i) => pushEffect(t, { type: 'stat', uid: h.players[i].id, noShowdownWin: 1 }));
  if (h.board.length === 5) {
    h.players.forEach((p) => {
      if (!p.folded && Core.evaluate(p.hole.concat(h.board)).royal) pushEffect(t, { type: 'ach', uid: p.id, key: 'poker_royal_flush' });
    });
  }
  pub.nextAt = now + (res.showdown ? SHOWDOWN_GAP_MS : HAND_GAP_MS);
  pub.deadline = pub.nextAt;

  seatList(pub).forEach((s) => {
    const seat = pub.seats[s.key];
    if (seat.pendingTopup) {
      seat.stack += seat.pendingTopup;
      seat.pendingTopup = 0;
    }
    if (seat.leaving && pub.kind !== 'sng') return removeSeat(t, s.key, now);
    if (seat.sitOutNext) {
      seat.sitOutNext = false;
      seat.sittingOut = true;
      seat.sitOutAt = now;
    }
    if (seat.stack === 0 && pub.kind !== 'sng' && !seat.bustAt) seat.bustAt = now;
  });

  if (pub.kind === 'sng') settleSngBusts(t, h, now);
}

function settleSngBusts(t, h, now) {
  const pub = t.pub;
  const finish = pub.sng.finish;
  const startOf = {};
  h.players.forEach((p) => (startOf[p.id] = p.start));
  const busted = seatList(pub)
    .filter((s) => s.stack === 0 && !finish[s.uid])
    .sort((a, b) => (startOf[b.uid] || 0) - (startOf[a.uid] || 0));
  const remaining = seatList(pub).filter((s) => s.stack > 0).length;
  // Players busting together: the bigger starting stack finishes higher.
  busted.forEach((s, idx) => {
    finish[s.uid] = remaining + 1 + idx;
    sngResult(t, s.uid, finish[s.uid]);
  });
  if (remaining === 1) {
    const w = seatList(pub).find((s) => s.stack > 0);
    finish[w.uid] = 1;
    sngResult(t, w.uid, 1);
    pub.status = 'finished';
    pub.nextAt = 0;
    pub.deadline = 0;
    pub.endedAt = now;
  }
}

function sngResult(t, uid, place) {
  const pub = t.pub;
  const amount = pub.sng.payouts[place - 1] || 0;
  const k = seatKeyOf(pub, uid);
  pushEffect(t, { type: 'sng_result', uid, name: k ? pub.seats[k].name : '', place, amount, buyIn: pub.sng.buyIn, size: pub.settings.seats });
}

function removeSeat(t, key, now) {
  const pub = t.pub;
  const s = pub.seats[key];
  if (!s) return;
  delete pub.seats[key];
  delete pub.players[s.uid];
  delete pub.bank[s.uid];
  delete t.secrets[s.uid];
  if (pub.kind === 'quick') pushEffect(t, { type: 'cashout', uid: s.uid, name: s.name, amount: Math.max(0, s.stack || 0), net: (s.stack || 0) - (s.bought || 0), tier: pub.tier });
  if (pub.host === s.uid) {
    const next = seatList(pub)[0];
    pub.host = next ? next.uid : null;
  }
  if (!Object.keys(pub.seats).length) {
    pub.status = 'closed';
    pub.nextAt = 0;
    pub.deadline = 0;
    saveHand(t, null);
  }
}

/** Close the table: an unfinished hand is void (every chip goes back to whoever put it in). */
function closeTable(t, now) {
  const pub = t.pub;
  const h = loadHand(t);
  if (h && !h.done) {
    h.players.forEach((p) => {
      const k = seatKeyOf(pub, p.id);
      if (k) pub.seats[k].stack = p.stack + p.total;
    });
    saveHand(t, null);
  }
  seatList(pub).forEach((s) => {
    if (pub.kind === 'sng') return;
    removeSeat(t, s.key, now);
  });
  pub.status = 'closed';
  pub.nextAt = 0;
  pub.deadline = 0;
  pub.turn = null;
}

// ------------------------------------------------------------------ reducer

function seatPlayer(t, uid, a, now) {
  const pub = t.pub;
  if (seatKeyOf(pub, uid)) throw err('already_seated', 'You’re already at this table');
  if (pub.status === 'closed' || pub.status === 'finished') throw err('table_closed', 'This table has closed');
  if (pub.kind === 'sng' && pub.status !== 'waiting') throw err('table_full', 'This Sit & Go has started');
  const n = freeSeat(pub);
  if (n < 0) throw err('table_full', 'This table is full');
  const started = (Number(pub.handNo) || 0) > 0;
  pub.seats[seatKey(n)] = {
    uid,
    name: cleanName(a.name),
    stack: Math.floor(a.stack),
    bought: Math.floor(a.bought == null ? a.stack : a.bought),
    sittingOut: false,
    newcomer: started && pub.kind !== 'sng',
    joinedAt: now,
    timeouts: 0,
    rebuys: 0,
  };
  pub.players[uid] = true;
  pub.bank[uid] = BANK_MS;
  t.presence[uid] = { at: now, online: true };
  if (a.bid) t.server.applied[a.bid] = uid;
  if (pub.kind !== 'friends') {
    const dev = hash(a.dev);
    const ip = hash(a.ip);
    Object.keys(t.server.devices).forEach((other) => {
      if (other === uid || !seatKeyOf(pub, other)) return;
      const d = t.server.devices[other] || {};
      if (dev && d.dev === dev) pushEffect(t, { type: 'signal', uid, other, kind: 'same_device', table: pub.id });
      else if (ip && d.ip === ip) pushEffect(t, { type: 'signal', uid, other, kind: 'same_ip', table: pub.id });
    });
    t.server.devices[uid] = { dev, ip };
  }
  if (pub.kind === 'sng' && Object.keys(pub.seats).length >= pub.settings.seats) {
    pub.status = 'playing';
    pub.startedAt = now;
    pub.nextAt = now + START_DELAY_MS;
    pub.deadline = pub.nextAt;
  }
  maybeSchedule(t, now);
  return { seat: n };
}

function runTick(t, now, rand) {
  const pub = t.pub;
  if (pub.status === 'closed') return false;
  const before = JSON.stringify(pub) + '|' + (t.server.handJ || '').length + '|' + Object.keys(t.server.effects).length;
  seatList(pub).forEach((s) => {
    const seat = pub.seats[s.key];
    const gone = isGone(t, s.uid, now);
    if (pub.kind === 'sng') {
      if (gone && !seat.away && seat.stack > 0 && pub.status === 'playing') seat.away = true;
    } else if (gone && !seat.sittingOut) {
      seat.sittingOut = true;
      seat.sitOutAt = now;
    }
  });
  const h = loadHand(t);
  if (h && !h.done) {
    const uid = h.players[h.toAct].id;
    const k = seatKeyOf(pub, uid);
    const seat = k ? pub.seats[k] : null;
    const gone = isGone(t, uid, now);
    const autoNow = !seat || seat.leaving || (pub.kind !== 'sng' && gone);
    if (autoNow || now >= pub.deadline) {
      const bank = Number(pub.bank[uid]) || 0;
      if (!autoNow && pub.turn && !pub.turn.bank && bank > 0 && !(seat && seat.away)) {
        pub.turn.bank = true;
        pub.deadline = now + bank;
        pub.bank[uid] = 0;
      } else {
        Core.applyAction(h, uid, Core.timeoutAction(h, h.toAct));
        if (seat) {
          seat.timeouts = (Number(seat.timeouts) || 0) + 1;
          if (seat.timeouts >= 2) {
            if (pub.kind === 'sng') seat.away = true;
            else seat.sitOutNext = true;
          }
        }
        afterAction(t, h, now);
      }
    }
  } else if (pub.nextAt && now >= pub.nextAt) {
    startHand(t, now, rand);
  }
  if (pub.kind === 'quick' && pub.status !== 'closed') {
    seatList(pub).forEach((s) => {
      if (inActiveHand(t, s.uid)) return;
      const seat = pub.seats[s.key];
      if (!seat) return;
      if (seat.sittingOut && seat.sitOutAt && now - seat.sitOutAt > SIT_OUT_MAX_MS) removeSeat(t, s.key, now);
      else if (seat.stack === 0 && seat.bustAt && now - seat.bustAt > BUST_GRACE_MS) removeSeat(t, s.key, now);
    });
    const seats = seatList(pub);
    if (seats.length && seats.every((s) => isGone(t, s.uid, now - IDLE_CLOSE_MS + RECONNECT_MS))) closeTable(t, now);
  }
  if (pub.kind === 'sng' && pub.status === 'waiting') {
    seatList(pub).forEach((s) => {
      if (!isGone(t, s.uid, now)) return;
      delete pub.seats[s.key];
      delete pub.players[s.uid];
      delete pub.bank[s.uid];
      pushEffect(t, { type: 'refund', uid: s.uid, amount: pub.sng.buyIn, reason: 'sng_unregister' });
    });
    if (!Object.keys(pub.seats).length) pub.status = 'closed';
  }
  if (pub.kind === 'friends' && now > (pub.expiresAt || 0)) closeTable(t, now);
  if (pub.status !== 'closed') maybeSchedule(t, now);
  const after = JSON.stringify(pub) + '|' + (t.server.handJ || '').length + '|' + Object.keys(t.server.effects).length;
  return before !== after;
}

/**
 * Pure reducer — (table, uid, op, args) → { table, result } or null (no change). Throws coded errors.
 * `rand.int(n)` shuffles (crypto.randomInt on the server).
 */
function reduceTable(current, uid, op, args, now, rand) {
  const a = args || {};
  const r = rand || cryptoRand;
  if (!current || !current.pub) throw err('table_not_found', 'That table has closed');
  const t = hydrate(current);
  const pub = t.pub;
  pub.updatedAt = now;
  const key = seatKeyOf(pub, uid);
  const seat = key ? pub.seats[key] : null;
  const member = !!(seat || pub.players[uid]);
  const done = (result) => {
    pub.serverNow = now;
    pub.rev = (Number(pub.rev) || 0) + 1;
    return { table: t, result: result || {} };
  };

  if (op === 'seat') return done(seatPlayer(t, uid, a, now));

  if (op === 'join') {
    if (pub.kind !== 'friends') throw err('bad_op', 'Join public tables from the lobby');
    if (pub.status === 'closed') throw err('table_closed', 'This table has closed');
    if (seat) {
      t.presence[uid] = { at: now, online: true };
      return done({ rejoined: true });
    }
    return done(seatPlayer(t, uid, { name: a.name, stack: pub.settings.stack }, now));
  }

  if (op === 'sweep') return runTick(t, now, r) ? done({ swept: true }) : null;

  if (!member) throw err('not_seated', 'You’re not at this table');
  if (pub.status === 'closed' && op !== 'leave') throw err('table_closed', 'This table has closed');
  t.presence[uid] = { at: now, online: true };

  switch (op) {
    case 'tick':
      return runTick(t, now, r) ? done({}) : null;

    case 'act': {
      const h = loadHand(t);
      if (!h || h.done) throw err('no_hand', 'Wait for the next hand');
      if (Number(a.handNo) !== h.handNo) throw err('stale_hand', 'That hand is over');
      const out = Core.applyAction(h, uid, { type: a.type, to: a.to });
      if (out.error) throw err(out.error, out.error.replace(/_/g, ' '));
      if (seat) {
        seat.timeouts = 0;
        seat.away = false;
      }
      afterAction(t, h, now);
      return done({ acted: true });
    }

    case 'leave': {
      if (!seat) {
        delete pub.players[uid];
        return done({ left: true });
      }
      if (pub.kind === 'sng') {
        if (pub.status === 'waiting') {
          delete pub.seats[key];
          delete pub.players[uid];
          delete pub.bank[uid];
          pushEffect(t, { type: 'refund', uid, amount: pub.sng.buyIn, reason: 'sng_unregister' });
          return done({ left: true, refunded: pub.sng.buyIn });
        }
        if (pub.status === 'playing') {
          seat.away = true;
          seat.leftAt = now;
          return done({ left: true, stillIn: true });
        }
        return done({ left: true });
      }
      if (inActiveHand(t, uid)) {
        seat.leaving = true;
        const h = loadHand(t);
        if (h.players[h.toAct].id === uid) afterAction(t, h, now);
        else saveHand(t, h);
        if (pub.seats[key]) return done({ leaving: true });
        return done({ left: true });
      }
      removeSeat(t, key, now);
      return done({ left: true });
    }

    case 'sit_out': {
      if (!seat) throw err('not_seated');
      if (pub.kind === 'sng') seat.away = true;
      else if (inActiveHand(t, uid)) seat.sitOutNext = true;
      else {
        seat.sittingOut = true;
        seat.sitOutAt = now;
      }
      return done({});
    }

    case 'sit_in': {
      if (!seat) throw err('not_seated');
      if (seat.stack <= 0 && pub.kind !== 'sng') throw err('need_rebuy', 'Add chips to sit back in');
      seat.sittingOut = false;
      seat.sitOutNext = false;
      seat.sitOutAt = 0;
      seat.away = false;
      seat.timeouts = 0;
      maybeSchedule(t, now);
      return done({});
    }

    case 'topup_apply': {
      if (!seat) throw err('not_seated');
      if (pub.kind !== 'quick') throw err('bad_op');
      const amt = Math.floor(Number(a.amount) || 0);
      const cur = seat.stack + (seat.pendingTopup || 0);
      if (amt <= 0 || cur + amt > pub.settings.max) throw err('over_max', 'That’s over the table maximum');
      if (inActiveHand(t, uid)) seat.pendingTopup = (seat.pendingTopup || 0) + amt;
      else seat.stack += amt;
      seat.bought = (seat.bought || 0) + amt;
      seat.bustAt = 0;
      if (a.bid) t.server.applied[a.bid] = uid;
      maybeSchedule(t, now);
      return done({ topped: amt });
    }

    case 'rebuy': {
      if (!seat) throw err('not_seated');
      if (pub.kind !== 'friends') throw err('bad_op', 'Top up from the table menu');
      if (seat.stack > 0) throw err('has_chips', 'You still have chips');
      seat.stack = pub.settings.stack;
      seat.rebuys = (seat.rebuys || 0) + 1;
      seat.sittingOut = false;
      seat.bustAt = 0;
      maybeSchedule(t, now);
      return done({ stack: seat.stack });
    }

    case 'show': {
      const h = loadHand(t);
      if (!h || !h.done || !h.players.some((p) => p.id === uid)) throw err('nothing_to_show', 'Nothing to show');
      Core.voluntaryShow(h, uid);
      saveHand(t, h);
      return done({ shown: true });
    }

    case 'start': {
      if (pub.kind !== 'friends' || pub.host !== uid) throw err('host_only', 'Only the host can start');
      if (pub.status === 'playing') return done({});
      if (seatList(pub).filter((s) => s.stack > 0).length < 2) throw err('need_players', 'Need at least 2 players');
      pub.status = 'playing';
      pub.startedAt = now;
      pub.nextAt = now + 1500;
      pub.deadline = pub.nextAt;
      return done({ started: true });
    }

    case 'settings': {
      if (pub.kind !== 'friends' || pub.host !== uid) throw err('host_only', 'Only the host can change settings');
      if (inActiveHand(t, uid) || (loadHand(t) && !loadHand(t).done)) throw err('phase', 'Change settings between hands');
      const next = Core.mergeFriendsSettings(Object.assign({}, pub.settings, a.settings || {}));
      if (next.seats < Object.keys(pub.seats).length) next.seats = Object.keys(pub.seats).length;
      pub.settings = next;
      if (pub.status !== 'playing') pub.blinds = { sb: next.sb, bb: next.bb, level: 0 };
      return done({ settings: next });
    }

    case 'end': {
      if (pub.kind !== 'friends' || pub.host !== uid) throw err('host_only', 'Only the host can close the table');
      closeTable(t, now);
      return done({ closed: true });
    }

    default:
      throw err('bad_op', 'Unknown table action');
  }
}

// ------------------------------------------------------------------ RTDB + Firestore plumbing

async function transactTable(rtdb, path, fn, { allowEmpty = false } = {}) {
  let outcome = null;
  let failure = null;
  let noop = false;
  const tx = await rtdb.ref(path).transaction((current) => {
    failure = null;
    outcome = null;
    noop = false;
    if (current == null && !allowEmpty) return null;
    try {
      const next = fn(current == null ? null : current);
      if (!next) {
        noop = true;
        return undefined;
      }
      outcome = next.result || {};
      return next.table;
    } catch (e) {
      failure = e;
      return undefined;
    }
  });
  if (failure) throw failure;
  if (noop) return { noop: true };
  if (!tx.committed) throw err('busy', 'Table busy — try again');
  if (!outcome) throw err('table_not_found', 'That table has closed');
  return outcome;
}

function ageOf(user) {
  if (Number.isFinite(user.age) && user.age > 0) return Number(user.age);
  const dob = user.dateOfBirth || user.dob || (user.profile && user.profile.dateOfBirth);
  if (!dob) return null;
  const d = typeof dob.toDate === 'function' ? dob.toDate() : new Date(dob);
  const ms = Date.now() - d.getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.floor(ms / (365.25 * 86400000));
}

/** 18+ for Poker (and Teen Patti): profile DOB, else the one-time self-confirmation. */
function ageGate(user) {
  const u = user || {};
  if (u.teenMode === true || u.isMinor === true) return 'under_18';
  const age = ageOf(u);
  if (age != null) return age >= 18 ? 'ok' : 'under_18';
  return u.adultConfirmedAt ? 'ok' : 'confirm';
}

async function requireAdult(db, uid) {
  const snap = await db.collection('users').doc(uid).get();
  const gate = ageGate(snap.exists ? snap.data() : {});
  if (gate === 'under_18') throw err('age_gate', 'Poker is for players 18 and over');
  if (gate === 'confirm') throw err('age_confirm', 'Confirm you’re 18 or older to play');
}

function userRefs(db, uid) {
  const u = db.collection('users').doc(uid);
  return {
    user: u,
    wallet: u.collection('wallet').doc('chips'),
    buyins: u.collection('pokerBuyins'),
    seats: u.collection('pokerSeats'),
    effects: u.collection('pokerEffects'),
    stats: u.collection('gameStats').doc('poker'),
    ach: u.collection('achievements'),
    tx: u.collection('chipTransactions'),
  };
}

async function debitBuyIn(ctx, uid, amount, info) {
  const { db, admin, econ } = ctx;
  await econ.ensureWallet(db, admin.firestore.FieldValue, uid);
  const R = userRefs(db, uid);
  const bid = 'b' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
  await db.runTransaction(async (tx) => {
    const w = await tx.get(R.wallet);
    const bal = Number((w.exists && w.data().balance) || 0);
    if (bal < amount) throw err('insufficient_chips', 'Not enough chips for this table');
    tx.set(R.wallet, { balance: bal - amount }, { merge: true });
    tx.set(R.buyins.doc(bid), { tableId: info.tableId, amount, state: 'pending', kind: info.kind, at: Date.now() });
    tx.set(R.seats.doc(info.tableId), { tableId: info.tableId, kind: info.kind, tier: info.tier || null, size: info.size || null, at: Date.now() }, { merge: true });
    tx.set(R.tx.doc(), { amount: -amount, reason: 'poker_buyin', table: info.tableId, at: Date.now() });
  });
  return bid;
}

async function settleBuyIn(ctx, uid, bid, seated) {
  const { db } = ctx;
  const R = userRefs(db, uid);
  await db.runTransaction(async (tx) => {
    const b = await tx.get(R.buyins.doc(bid));
    if (!b.exists || b.data().state !== 'pending') return;
    const w = await tx.get(R.wallet);
    if (seated) {
      tx.set(R.buyins.doc(bid), { state: 'seated' }, { merge: true });
      return;
    }
    const amount = Number(b.data().amount) || 0;
    tx.set(R.wallet, { balance: Number((w.exists && w.data().balance) || 0) + amount }, { merge: true });
    tx.set(R.buyins.doc(bid), { state: 'refunded' }, { merge: true });
    tx.set(R.tx.doc(), { amount, reason: 'poker_refund', table: b.data().tableId, at: Date.now() });
  });
}

/** Apply one queued effect exactly once (marker doc per table + effect id). */
async function applyEffect(ctx, tableId, id, e) {
  const { db, admin, econ } = ctx;
  const FV = admin.firestore.FieldValue;
  if (e.type === 'signal') {
    await db.collection('pokerSignals').doc(tableId + '_' + id).set({ table: tableId, uids: [e.uid, e.other], kind: e.kind, at: FV.serverTimestamp() }, { merge: true });
    return null;
  }
  const uid = e.uid;
  if (!uid) return null;
  await econ.ensureWallet(db, FV, uid);
  const R = userRefs(db, uid);
  const marker = R.effects.doc(tableId + '_' + id);
  const wk = econ.weekKey();
  const board = db.collection('weeklyLeaderboard').doc(wk).collection('scores').doc('poker_' + uid);
  let awarded = null;
  await db.runTransaction(async (tx) => {
    const m = await tx.get(marker);
    if (m.exists) return;
    const w = await tx.get(R.wallet);
    const st = await tx.get(R.stats);
    const stats = (st.exists && st.data()) || {};
    let achKey = e.type === 'ach' ? e.key : null;
    if (e.type === 'stat' && e.noShowdownWin && (Number(stats.noShowdownWins) || 0) + 1 >= BLUFF_WINS) achKey = 'poker_bluff_master';
    let achChips = 0;
    if (achKey && econ.ACHIEVEMENTS[achKey]) {
      const a = await tx.get(R.ach.doc(achKey));
      if (!a.exists) {
        achChips = econ.ACHIEVEMENTS[achKey].chips;
        awarded = achKey;
      } else achKey = null;
    } else achKey = null;
    const wallet = (w.exists && w.data()) || {};
    const amount = Math.max(0, Math.floor(Number(e.amount) || 0));
    const credit = (e.type === 'cashout' || e.type === 'refund' || e.type === 'sng_result' ? amount : 0) + achChips;
    if (credit) {
      tx.set(
        R.wallet,
        {
          balance: (Number(wallet.balance) || 0) + credit,
          lifetimeEarned: (Number(wallet.lifetimeEarned) || 0) + achChips + (e.type === 'sng_result' ? Math.max(0, amount - (e.buyIn || 0)) : 0),
        },
        { merge: true }
      );
    }
    if (credit - achChips > 0) tx.set(R.tx.doc(), { amount: credit - achChips, reason: 'poker_' + e.type, table: tableId, at: Date.now() });
    if (achKey) tx.set(R.ach.doc(achKey), { earnedAt: FV.serverTimestamp(), key: achKey });
    if (e.type === 'cashout') {
      const net = Math.floor(Number(e.net) || 0);
      tx.set(R.stats, { totalGames: FV.increment(1), netChips: FV.increment(net), updatedAt: FV.serverTimestamp() }, { merge: true });
      tx.set(board, { uid, name: String(e.name || '').slice(0, 24), gameType: 'poker', score: FV.increment(1), games: FV.increment(1), net: FV.increment(net) }, { merge: true });
      tx.delete(R.seats.doc(tableId));
    } else if (e.type === 'sng_result') {
      const net = amount - (Number(e.buyIn) || 0);
      const won = e.place === 1;
      tx.set(
        R.stats,
        { totalGames: FV.increment(1), wins: FV.increment(won ? 1 : 0), sngPlayed: FV.increment(1), sngWins: FV.increment(won ? 1 : 0), netChips: FV.increment(net), lastResult: won ? 'win' : amount > 0 ? 'cash' : 'loss', updatedAt: FV.serverTimestamp() },
        { merge: true }
      );
      tx.set(board, { uid, name: String(e.name || '').slice(0, 24), gameType: 'poker', score: FV.increment(won ? 10 : amount > 0 ? 4 : 1), wins: FV.increment(won ? 1 : 0), games: FV.increment(1), net: FV.increment(net) }, { merge: true });
      tx.delete(R.seats.doc(tableId));
    } else if (e.type === 'refund') {
      tx.delete(R.seats.doc(tableId));
    } else if (e.type === 'stat') {
      tx.set(R.stats, { noShowdownWins: FV.increment(1), updatedAt: FV.serverTimestamp() }, { merge: true });
    }
    tx.set(marker, { type: e.type, at: FV.serverTimestamp() });
  });
  return awarded ? { uid, key: awarded } : null;
}

async function drainEffects(ctx, tableId) {
  const ref = ctx.rtdb.ref(`games/poker/${tableId}/server/effects`);
  const snap = await ref.once('value');
  const effects = snap.val() || {};
  const ids = Object.keys(effects).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  const awards = [];
  for (const id of ids) {
    try {
      const out = await applyEffect(ctx, tableId, id, effects[id]);
      if (out) awards.push(out);
      await ref.child(id).remove();
    } catch (e) {
      console.warn('[poker] effect', id, e && e.message);
    }
  }
  for (const a of awards) {
    await ctx.rtdb.ref(`games/poker/${tableId}/secrets/${a.uid}/note`).set({ key: a.key, at: Date.now() }).catch(() => {});
  }
  return awards;
}

async function updateLobby(ctx, tableId) {
  const snap = await ctx.rtdb.ref(`games/poker/${tableId}/pub`).once('value');
  const pub = snap.val();
  if (!pub) return;
  const n = Object.keys(pub.seats || {}).length;
  if (pub.kind === 'quick') {
    const ref = ctx.rtdb.ref(`games/poker/_lobby/quick/${pub.tier}/${tableId}`);
    if (pub.status === 'closed' || n === 0) await ref.remove();
    else await ref.set({ n, at: Date.now() });
  } else if (pub.kind === 'sng') {
    const ref = ctx.rtdb.ref(`games/poker/_lobby/sng/${pub.size}/${tableId}`);
    if (pub.status !== 'waiting' || n === 0) await ref.remove();
    else await ref.set({ n, at: Date.now() });
  }
}

/** Pending buy-ins that never reached a seat are refunded; stale seat records are swept. */
async function reconcile(ctx, uid) {
  const { db, rtdb } = ctx;
  const R = userRefs(db, uid);
  const pending = await R.buyins.where('state', '==', 'pending').limit(10).get();
  for (const d of pending.docs) {
    const b = d.data() || {};
    if (Date.now() - (Number(b.at) || 0) < BUYIN_STALE_MS) continue;
    const applied = await rtdb.ref(`games/poker/${b.tableId}/server/applied/${d.id}`).once('value');
    await settleBuyIn(ctx, uid, d.id, applied.exists());
  }
  const seats = await R.seats.limit(20).get();
  const tables = [];
  for (const d of seats.docs) {
    const tableId = d.id;
    try {
      await transactTable(rtdb, `games/poker/${tableId}`, (cur) => reduceTable(cur, uid, 'sweep', {}, Date.now(), cryptoRand));
    } catch (e) {}
    await drainEffects(ctx, tableId).catch(() => {});
    const pubSnap = await rtdb.ref(`games/poker/${tableId}/pub`).once('value');
    const pub = pubSnap.val();
    const k = pub ? seatKeyOf(hydrate({ pub }).pub, uid) : null;
    if (!pub || (!k && !(pub.players || {})[uid])) {
      const effSnap = await rtdb.ref(`games/poker/${tableId}/server/effects`).once('value');
      if (!effSnap.exists()) await R.seats.doc(tableId).delete().catch(() => {});
      continue;
    }
    if (pub.status === 'closed' || (pub.status === 'finished' && !k)) continue;
    tables.push({ tableId, kind: pub.kind, tier: pub.tier || null, size: pub.size || null, status: pub.status, stack: k ? pub.seats[k].stack : 0 });
  }
  return tables;
}

// ------------------------------------------------------------------ entry point

/**
 * @param {import('firebase-admin')} adminApp
 * @param {string} uid
 * @param {object} body { op, tableId?, code?, tier?, size?, buyIn?, settings?, name?, dev?, handNo?, type?, to?, amount? }
 * @param {{ ip?: string }} [meta]
 * @param {{ econ?: object, rand?: object }} [deps]
 */
async function pokerTable(adminApp, uid, body, meta, deps) {
  const b = body || {};
  const op = String(b.op || '');
  if (!CLIENT_OPS.has(op)) throw err('bad_op', 'Unknown table action');
  const db = adminApp.firestore();
  const rtdb = adminApp.database();
  const ctx = { db, rtdb, admin: adminApp, econ: (deps && deps.econ) || require('./dangal-economy') };
  const rand = (deps && deps.rand) || cryptoRand;
  const now = Date.now();
  const name = cleanName(b.name);

  if (op === 'age_confirm') {
    const snap = await db.collection('users').doc(uid).get();
    if (ageGate(snap.exists ? snap.data() : {}) === 'under_18') throw err('age_gate', 'Poker is for players 18 and over');
    await db.collection('users').doc(uid).set({ adultConfirmedAt: adminApp.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return { confirmed: true };
  }

  if (SEATING_OPS.has(op)) await requireAdult(db, uid);

  if (op === 'reconcile') return { tables: await reconcile(ctx, uid), serverNow: now };

  const seatWithBuyIn = async (tableId, amount, info, createFn) => {
    const bid = await debitBuyIn(ctx, uid, amount, Object.assign({ tableId }, info));
    const stack = info.kind === 'sng' ? Core.SNG.stack : amount;
    try {
      const out = await transactTable(
        rtdb,
        `games/poker/${tableId}`,
        (cur) => {
          if (!cur && !createFn) throw err('table_not_found');
          const base = cur || createFn();
          return reduceTable(base, uid, 'seat', { name, stack, bought: amount, bid, dev: b.dev, ip: meta && meta.ip }, now, rand);
        },
        { allowEmpty: !!createFn }
      );
      await settleBuyIn(ctx, uid, bid, true);
      return out;
    } catch (e) {
      await settleBuyIn(ctx, uid, bid, false).catch(() => {});
      throw e;
    }
  };

  let tableId = cleanId(b.tableId || b.code);
  let result = {};

  if (op === 'quick_join') {
    const tier = Core.tierById(String(b.tier || ''));
    if (!tier) throw err('bad_tier', 'Pick a table');
    const amount = Math.floor(Number(b.buyIn) || tier.max);
    if (amount < tier.min || amount > tier.max) throw err('bad_buyin', 'Buy in between ' + tier.min + ' and ' + tier.max);
    const mine = await userRefs(db, uid).seats.where('tier', '==', tier.id).limit(3).get();
    for (const d of mine.docs) {
      const p = (await rtdb.ref(`games/poker/${d.id}/pub`).once('value')).val();
      if (p && p.status !== 'closed' && seatKeyOf(hydrate({ pub: p }).pub, uid)) return { tableId: d.id, rejoined: true, serverNow: now };
    }
    /** Fill the fullest open table first; open a new one when none will take us. */
    const joinPublic = async (lobbyPath, prefix, amount, info, create) => {
      const lobby = (await rtdb.ref(lobbyPath).once('value')).val() || {};
      const candidates = Object.keys(lobby)
        .filter((id) => (lobby[id].n || 0) < (info.seats || 9) && now - (lobby[id].at || 0) < IDLE_CLOSE_MS * 3)
        .sort((x, y) => (lobby[y].n || 0) - (lobby[x].n || 0));
      for (const id of candidates.slice(0, 3)) {
        try {
          return { id, out: await seatWithBuyIn(id, amount, info) };
        } catch (e) {
          if (['table_full', 'table_closed', 'table_not_found', 'already_seated'].indexOf(e.code) < 0) throw e;
        }
      }
      const id = prefix + randomCode(11);
      return { id, out: await seatWithBuyIn(id, amount, info, () => create(id)) };
    };
    const joined = await joinPublic(`games/poker/_lobby/quick/${tier.id}`, 'Q', amount, { kind: 'quick', tier: tier.id, seats: Core.QUICK_SEATS }, (id) =>
      newTable({ id, kind: 'quick', tier: tier.id, uid, now })
    );
    tableId = joined.id;
    result = joined.out;
  } else if (op === 'sng_join') {
    const size = Core.SNG.sizes.indexOf(Number(b.size)) >= 0 ? Number(b.size) : 6;
    const mine = await userRefs(db, uid).seats.where('kind', '==', 'sng').limit(5).get();
    for (const d of mine.docs) {
      const p = (await rtdb.ref(`games/poker/${d.id}/pub`).once('value')).val();
      if (p && (p.status === 'waiting' || p.status === 'playing') && seatKeyOf(hydrate({ pub: p }).pub, uid)) return { tableId: d.id, rejoined: true, serverNow: now };
    }
    const lobby = (await rtdb.ref(`games/poker/_lobby/sng/${size}`).once('value')).val() || {};
    const candidates = Object.keys(lobby)
      .filter((id) => (lobby[id].n || 0) < size && now - (lobby[id].at || 0) < TABLE_TTL_MS)
      .sort((x, y) => (lobby[y].n || 0) - (lobby[x].n || 0));
    tableId = '';
    for (const id of candidates.slice(0, 3)) {
      try {
        result = await seatWithBuyIn(id, Core.SNG.buyIn, { kind: 'sng', size });
        tableId = id;
        break;
      } catch (e) {
        if (e.code === 'already_seated') return { tableId: id, rejoined: true, serverNow: now };
        if (['table_full', 'table_closed', 'table_not_found'].indexOf(e.code) < 0) throw e;
      }
    }
    if (!tableId) {
      tableId = 'S' + randomCode(11);
      result = await seatWithBuyIn(tableId, Core.SNG.buyIn, { kind: 'sng', size }, () => newTable({ id: tableId, kind: 'sng', size, uid, now }));
    }
  } else if (op === 'friends_create') {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomCode(6);
      try {
        result = await transactTable(
          rtdb,
          `games/poker/${code}`,
          (cur) => {
            if (cur && cur.pub && cur.pub.status !== 'closed' && (cur.pub.expiresAt || 0) > now) throw err('code_taken');
            const t = newTable({ id: code, kind: 'friends', uid, now, settings: b.settings });
            return reduceTable(t, uid, 'seat', { name, stack: t.pub.settings.stack }, now, rand);
          },
          { allowEmpty: true }
        );
        tableId = code;
        break;
      } catch (e) {
        if (e.code !== 'code_taken') throw e;
      }
    }
    if (!tableId) throw err('busy', 'Could not open a table — try again');
    result.host = true;
  } else if (op === 'topup') {
    if (!tableId) throw err('bad_table', 'Missing table');
    const amount = Math.floor(Number(b.amount) || 0);
    if (amount <= 0) throw err('bad_amount', 'Pick an amount');
    const bid = await debitBuyIn(ctx, uid, amount, { tableId, kind: 'quick' });
    try {
      result = await transactTable(rtdb, `games/poker/${tableId}`, (cur) => reduceTable(cur, uid, 'topup_apply', { amount, bid }, now, rand));
      await settleBuyIn(ctx, uid, bid, true);
    } catch (e) {
      await settleBuyIn(ctx, uid, bid, false).catch(() => {});
      throw e;
    }
  } else {
    if (!tableId) throw err('bad_table', 'Missing table');
    result = await transactTable(rtdb, `games/poker/${tableId}`, (cur) => reduceTable(cur, uid, op, Object.assign({}, b, { name }), now, rand));
  }

  const awards = await drainEffects(ctx, tableId).catch(() => []);
  await updateLobby(ctx, tableId).catch(() => {});
  return Object.assign({ tableId, serverNow: now, awards: awards.filter((a) => a.uid === uid).map((a) => a.key) }, result);
}

module.exports = {
  ACTION_MS,
  BANK_MS,
  RECONNECT_MS,
  HAND_GAP_MS,
  SHOWDOWN_GAP_MS,
  START_DELAY_MS,
  SIT_OUT_MAX_MS,
  BLUFF_WINS,
  CLIENT_OPS,
  newTable,
  hydrate,
  reduceTable,
  loadHand,
  seatKeyOf,
  ageGate,
  applyEffect,
  drainEffects,
  pokerTable,
};
