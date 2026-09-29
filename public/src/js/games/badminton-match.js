/**
 * Badminton match reducer — shared by the server (server-lib/badminton-engine.js, the only
 * authority for Live) and the phone (vs Bot / bot-partner games run the very same reducer locally).
 *
 * (room, uid, op, args, now, rng) → { match: room, result } | null. Throws coded errors.
 *
 * Room = { pub, server, presence }. pub is what every viewer reads:
 *   seats   { A0, A1?, B0, B1? } → uid or 'bot:<tier>' (side A = engine side 0)
 *   log     BadmintonEngine events (the truth); `at` stamps when each one happens
 *   contact the shuttle coming to one seat: { n, k, seat, side, serve, court, startAt, dur, land }
 *   hits    the current rally so far (animation): [{ seat, at, timing, land, kind }]
 *
 * A phone only ever sends `hit { n, k, t, rtt }` (tap time inside the window). The server clamps
 * the tap (RTT compensation capped at MAX_COMP_MS), rolls the contact with its own seed and appends
 * rally events; score, service and ends come out of the laws engine. Bot seats play at once with
 * future timestamps, so phones animate them on the shared clock without extra round trips.
 */
(function (root, factory) {
  const api =
    typeof module === 'object' && module.exports
      ? factory(require('./badminton-engine.js'), require('../dangal/dangal-live-policy.js'))
      : factory(root.BadmintonEngine, root.DangalLivePolicy);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BadmintonMatch = api;
})(typeof self !== 'undefined' ? self : this, function (E, Policy) {
  'use strict';

  const POLICY = Policy && Policy.policyFor ? Policy.policyFor('badminton') : { reconnectMs: 90000, afk: { maxMisses: 3 } };
  /** Toss coin on screen before the first serve window. */
  const COIN_MS = 2200;
  /** Serve window opens this long after the serve phase starts (players see who serves). */
  const LEAD_MS = 900;
  /** Point shown before the next serve. */
  const POINT_MS = 1800;
  /** Next human contact starts a touch after the request so their full window is on screen. */
  const HANDOFF_MS = 150;
  /** A missing tap is judged this long after the window closes (covers network lag). */
  const GRACE_MS = 900;
  /** RTT compensation cap: a tap may be at most this much older than its arrival. */
  const MAX_COMP_MS = 300;
  /** App-length intervals (Law 16 allows up to 60 s / 120 s); both sides can resume early. */
  const INTERVAL_MS = 15000;
  const GAME_BREAK_MS = 30000;
  const JOIN_MS = 10 * 60 * 1000;
  const RECONNECT_MS = POLICY.reconnectMs || 90000;
  const MAX_STAKE = 500;
  const SETTLE_LEASE_MS = 30000;
  const SEATS = ['A0', 'A1', 'B0', 'B1'];
  const CLIENT_OPS = new Set(['join', 'create', 'fill', 'hit', 'ready', 'tick', 'leave', 'rematch', 'settle']);

  function err(code, message) {
    const e = new Error(message || code);
    e.code = code;
    return e;
  }
  function cleanMatchId(raw) {
    return String(raw || '')
      .replace(/[^\w.-]/g, '')
      .slice(0, 120);
  }
  function cleanUid(raw) {
    const s = String(raw || '').trim();
    return /^[\w-]{2,128}$/.test(s) && s.indexOf('bot') !== 0 ? s : '';
  }
  function cleanName(raw) {
    return String(raw || '')
      .replace(/[<>]/g, '')
      .trim()
      .slice(0, 24);
  }
  const plain = (v) => JSON.parse(JSON.stringify(v));
  const seedOf = (rng) => Math.floor(rng() * 4294967296) >>> 0;
  const isBot = (v) => typeof v === 'string' && v.indexOf('bot:') === 0;
  const sideOfSeat = (seat) => (String(seat).charAt(0) === 'B' ? 1 : 0);
  const playerOfSeat = (seat) => (String(seat).charAt(1) === '1' ? 1 : 0);
  const seatOf = (side, player) => (side === 1 ? 'B' : 'A') + (player === 1 ? 1 : 0);
  const botLabel = (tier) => E.TIERS[E.tierOf(tier)].label + ' Bot';

  function seatList(pub) {
    return pub.discipline === 'doubles' ? SEATS : ['A0', 'B0'];
  }
  function humans(pub) {
    return seatList(pub)
      .map((s) => pub.seats[s])
      .filter((v) => v && !isBot(v));
  }
  function seatOfUid(pub, uid) {
    return seatList(pub).find((s) => pub.seats[s] === uid) || '';
  }
  function sideUids(pub, side) {
    return seatList(pub)
      .filter((s) => sideOfSeat(s) === side)
      .map((s) => pub.seats[s])
      .filter((v) => v && !isBot(v));
  }

  function newMatch(o) {
    const now = o.now;
    const discipline = E.normDiscipline(o.discipline);
    const pub = {
      game: 'badminton',
      matchId: cleanMatchId(o.matchId),
      discipline,
      format: E.normFormat(o.format),
      stake: 0,
      rated: false,
      local: !!o.local,
      host: o.host || '',
      seats: {},
      players: {},
      names: {},
      status: 'waiting',
      joined: {},
      toss: null,
      log: [],
      phase: '',
      contact: null,
      hits: [],
      prevHits: [],
      pause: null,
      ready: {},
      deadline: now + JOIN_MS,
      misses: {},
      createdAt: now,
      startedAt: 0,
      endedAt: 0,
      winner: -1,
      winnerUids: [],
      reason: '',
      result: '',
      rematch: {},
      nextMatchId: '',
      rematchOf: o.rematchOf || '',
      settlement: null,
    };
    const seats = o.seats || {};
    seatList(pub).forEach((s) => {
      const v = seats[s];
      if (isBot(v)) pub.seats[s] = 'bot:' + E.tierOf(v.slice(4));
      else if (cleanUid(v)) pub.seats[s] = cleanUid(v);
      else pub.seats[s] = 'bot:' + E.tierOf(o.tier);
    });
    const names = o.names || {};
    seatList(pub).forEach((s) => {
      const v = pub.seats[s];
      if (isBot(v)) pub.names[s] = botLabel(v.slice(4));
      else {
        pub.players[v] = true;
        pub.names[s] = cleanName(names[s] || names[v]) || 'Player';
      }
    });
    const hs = humans(pub);
    if (hs.length !== new Set(hs).size) throw err('bad_seats', 'Each player takes one seat');
    const stake = Math.max(0, Math.min(MAX_STAKE, Math.floor(Number(o.stake) || 0)));
    // Rated + stakes: Standard singles between two people only. Doubles records team results, unrated.
    const twoHumanSingles = discipline === 'singles' && hs.length === 2;
    pub.rated = twoHumanSingles && !!E.FORMATS[pub.format].rated && !pub.local;
    pub.stake = twoHumanSingles && !pub.local ? stake : 0;
    return { pub, server: { settled: false, settling: 0 }, presence: {} };
  }

  /** RTDB drops empty objects / arrays and nulls — restore the shapes the reducer expects. */
  function hydrate(m) {
    if (!m || !m.pub) return m;
    const p = m.pub;
    ['seats', 'players', 'names', 'joined', 'misses', 'ready', 'rematch'].forEach((k) => {
      p[k] = p[k] || {};
    });
    const arr = (v) => (Array.isArray(v) ? v.filter(Boolean) : v ? Object.keys(v).sort((x, y) => x - y).map((k) => v[k]) : []);
    p.log = arr(p.log);
    p.hits = arr(p.hits);
    p.prevHits = arr(p.prevHits);
    p.contact = p.contact || null;
    p.pause = p.pause || null;
    p.toss = p.toss || null;
    p.winnerUids = arr(p.winnerUids);
    if (p.winner == null) p.winner = -1;
    p.settlement = p.settlement || null;
    m.server = m.server || {};
    m.presence = m.presence || {};
    return m;
  }

  function configOf(pub) {
    const side = (i) => {
      const seats = seatList(pub).filter((s) => sideOfSeat(s) === i);
      const players = seats.map((s) => pub.names[s] || s);
      return { players, name: players.join(' & ') };
    };
    return E.createConfig({ discipline: pub.discipline, format: pub.format, sides: [side(0), side(1)] });
  }
  /** Engine state — `upTo` (a time) hides events stamped in the future (bot rallies play out on the clock). */
  function stateOf(pub, upTo) {
    const log = upTo == null ? pub.log : pub.log.filter((e) => !e.at || e.at <= upTo);
    return E.replay(configOf(pub), log);
  }

  function presenceGone(m, uid, now) {
    const p = m.presence[uid];
    const since = p && Number(p.at) ? Number(p.at) : m.pub.startedAt || m.pub.createdAt;
    return now - since > RECONNECT_MS;
  }

  function finish(m, at, winnerSide, reason) {
    const pub = m.pub;
    const st = stateOf(pub);
    pub.status = 'over';
    pub.winner = winnerSide;
    pub.winnerUids = sideUids(pub, winnerSide);
    pub.reason = reason;
    pub.result = st.result ? st.result.text : '';
    pub.phase = '';
    pub.contact = null;
    pub.pause = null;
    pub.deadline = 0;
    pub.endedAt = at;
  }

  function forfeitSide(m, now, side, reason) {
    const pub = m.pub;
    pub.log.push({ t: 'end', reason: 'forfeit', winner: 1 - side, why: reason, at: now });
    finish(m, now, 1 - side, reason);
  }

  function afk(m, uid) {
    // Practice on the phone never forfeits: a missed turn only costs the point.
    if (!uid || isBot(uid) || m.pub.local) return false;
    const step = Policy && Policy.afkStep ? Policy.afkStep(m.pub.misses[uid], POLICY) : { misses: (m.pub.misses[uid] || 0) + 1, forfeit: (m.pub.misses[uid] || 0) + 1 >= 3 };
    m.pub.misses[uid] = step.misses;
    return step.forfeit;
  }

  function round2(land) {
    return { x: Math.round((Number(land.x) || 0) * 100) / 100, y: Math.round((Number(land.y) || 0) * 100) / 100 };
  }

  /** Open the serve window for whoever the laws say serves (bots serve at once, on the clock). */
  function toServe(m, at, wait, rng) {
    const pub = m.pub;
    const st = stateOf(pub);
    const seat = seatOf(st.server.side, st.server.player);
    pub.phase = 'serve';
    pub.pause = null;
    // The rally that just ended stays for the phones to finish animating it.
    pub.prevHits = pub.hits && pub.hits.length ? pub.hits : pub.prevHits || [];
    pub.hits = [];
    pub.contact = { n: pub.log.length, k: 0, seat, side: st.server.side, serve: true, court: st.court, startAt: at + wait, dur: E.PLAY.serveWindowMs, land: null };
    pub.deadline = pub.contact.startAt + pub.contact.dur + GRACE_MS;
    return maybeBot(m, rng, 0);
  }

  /** A bot's turn: pick its timing and resolve at a future moment inside its window. */
  function maybeBot(m, rng, depth) {
    const pub = m.pub;
    const c = pub.contact;
    if (!c || pub.status !== 'playing') return {};
    const who = pub.seats[c.seat];
    if (!isBot(who)) return {};
    if (depth > 400) throw err('runaway', 'Rally never ended');
    const timing = E.botTiming({ tier: who.slice(4), windowMs: c.dur, rally: c.k, serve: c.serve }, rng);
    const at = Math.round(c.startAt + E.tapFor(timing, rng) * c.dur);
    return resolveTap(m, at, rng, timing, '', depth + 1);
  }

  /** After a point: the match, an interval / game break, or the next serve. */
  function afterPoint(m, at, rng) {
    const pub = m.pub;
    const st = stateOf(pub);
    if (st.result) {
      finish(m, at, st.result.winner, st.result.by);
      return { ended: true };
    }
    if (st.pause) {
      pub.phase = 'interval';
      pub.contact = null;
      pub.ready = {};
      pub.pause = { kind: st.pause.kind, from: at, until: at + (st.pause.kind === 'game' ? GAME_BREAK_MS : INTERVAL_MS), ends: !!st.changeEnds };
      pub.deadline = pub.pause.until;
      return { interval: pub.pause.kind };
    }
    return toServe(m, at, POINT_MS, rng);
  }

  /**
   * Resolve the contact in play at `at` with `timing`. Faults and winners go into the log; a clean
   * contact hands the shuttle to the other side (whoever covers the landing spot in doubles).
   */
  function resolveTap(m, at, rng, timing, auto, depth, now) {
    const pub = m.pub;
    const c = pub.contact;
    const st = stateOf(pub);
    const res = E.resolveContact({ discipline: pub.discipline, serve: c.serve, court: c.court, timing, windowMs: c.dur, prevLand: c.land }, E.mulberry32(seedOf(rng)));
    const land = round2(res.land);
    const hit = { seat: c.seat, at, timing, land, kind: res.kind };
    if (auto) hit.auto = auto;
    pub.hits.push(hit);
    if (res.kind === 'let') {
      pub.log.push({ t: 'let', code: res.code, at: at + 400 });
      return Object.assign(toServe(m, at + 400, POINT_MS, rng), { let: res.code });
    }
    if (res.kind === 'winner') {
      pub.log.push({ t: 'rally', w: c.side, by: c.side, code: 'winner', hits: c.k + 1, at: at + 600 });
      return Object.assign(afterPoint(m, at + 600, rng), { point: c.side, code: 'winner' });
    }
    if (res.kind === 'fault') {
      pub.log.push({ t: 'rally', w: 1 - c.side, by: c.side, code: res.code, hits: c.k + 1, at: at + 400 });
      return Object.assign(afterPoint(m, at + 400, rng), { point: 1 - c.side, code: res.code });
    }
    const side = 1 - c.side;
    const player = E.hitterFor(st, side, land, c.serve);
    const seat = seatOf(side, player);
    const nextBot = isBot(pub.seats[seat]);
    // A human tap may be stamped in the past (RTT compensation): the next human still gets a full window.
    const startAt = nextBot || depth ? at : Math.max(at, now || at) + HANDOFF_MS;
    pub.phase = 'rally';
    pub.contact = { n: c.n, k: c.k + 1, seat, side, serve: false, court: c.court, startAt, dur: res.nextWindow, land };
    pub.deadline = startAt + res.nextWindow + GRACE_MS;
    return Object.assign({ contact: true }, maybeBot(m, rng, depth || 0));
  }

  /** Clamp a claimed tap (ms since startAt) to what the network allows. */
  function clampTap(claimed, elapsed, rtt) {
    const lag = Math.max(80, Math.min(MAX_COMP_MS, (Number(rtt) || 0) * 0.6 + 60));
    const t = Number(claimed);
    if (!isFinite(t)) return elapsed;
    return Math.max(elapsed - lag, Math.min(elapsed, t));
  }

  function start(m, now, rng) {
    const pub = m.pub;
    pub.status = 'playing';
    pub.startedAt = now;
    // Toss (Law 6): the winner serves first; the first server / receiver are seat 1 of each side.
    const winner = rng() < 0.5 ? 0 : 1;
    pub.toss = { winner, coin: winner === 0 ? 'heads' : 'tails', at: now, until: now + COIN_MS };
    pub.log = [{ t: 'start', server: { side: winner, player: 0 }, receiver: 0, at: now }];
    return toServe(m, now, COIN_MS + LEAD_MS, rng);
  }

  function allJoined(pub) {
    return humans(pub).every((u) => pub.joined[u]);
  }

  /**
   * Pure reducer. `rng` rolls the toss and every contact.
   */
  function reduceMatch(current, uid, op, args, now, rng) {
    const a = args || {};
    const matchId = cleanMatchId(a.matchId);

    if (op === 'create') {
      if (current) throw err('exists', 'That match already exists');
      const seats = { A0: uid };
      ['A1', 'B0', 'B1'].forEach((s) => {
        const v = a.seats && a.seats[s];
        seats[s] = isBot(v) ? v : cleanUid(v) || 'bot:' + E.tierOf(a.tier);
      });
      const names = {};
      names.A0 = cleanName(a.name) || 'Player';
      if (a.names) ['A1', 'B0', 'B1'].forEach((s) => (names[s] = a.names[s]));
      const m = newMatch({ matchId, discipline: a.discipline, format: a.format, stake: a.stake, seats, names, host: uid, now, tier: a.tier, local: !!a.local });
      m.pub.joined[uid] = true;
      if (allJoined(m.pub)) start(m, now, rng);
      return { match: m, result: { created: true, started: m.pub.status === 'playing' } };
    }

    if (op === 'join') {
      if (!current) {
        // Singles challenge: whoever arrives first creates it (host = playerA settings win).
        const opp = cleanUid(a.opponentUid);
        if (!opp || opp === uid) throw err('bad_opponent', 'Pick a real opponent');
        const hostA = cleanUid(a.playerA);
        const playerA = hostA === opp ? opp : uid;
        const playerB = playerA === uid ? opp : uid;
        const hostArgs = playerA === uid ? a : {};
        const names = {};
        names[uid] = cleanName(a.name) || 'Player';
        const m = newMatch({ matchId, discipline: 'singles', format: hostArgs.format, stake: hostArgs.stake, seats: { A0: playerA, B0: playerB }, names, host: playerA, now });
        m.pub.joined[uid] = true;
        return { match: m, result: { created: true } };
      }
      const m = hydrate(current);
      const pub = m.pub;
      if (!pub.players[uid]) throw err('not_in_match', 'This match is for other players');
      pub.joined[uid] = true;
      const seat = seatOfUid(pub, uid);
      if (a.name && seat) pub.names[seat] = cleanName(a.name) || pub.names[seat];
      if (pub.status === 'waiting') {
        if (uid === pub.host && a.format != null && pub.log.length === 0) {
          pub.format = E.normFormat(a.format);
          pub.rated = pub.discipline === 'singles' && humans(pub).length === 2 && !!E.FORMATS[pub.format].rated;
        }
        if (uid === pub.host && a.stake != null && pub.discipline === 'singles') pub.stake = Math.max(0, Math.min(MAX_STAKE, Math.floor(Number(a.stake) || 0)));
        if (allJoined(pub)) start(m, now, rng);
      }
      return { match: m, result: { joined: true, seat } };
    }

    if (!current) throw err('match_not_found', 'Match not found');
    const m = hydrate(current);
    const pub = m.pub;
    if (!pub.players[uid] && op !== 'tick') throw err('not_in_match', 'This match is for other players');
    if (!pub.players[uid]) return null;

    if (op === 'fill') {
      if (pub.status !== 'waiting') throw err('not_waiting', 'The match has started');
      if (uid !== pub.host) throw err('not_host', 'Only the host can fill seats');
      seatList(pub).forEach((s) => {
        const v = pub.seats[s];
        if (!isBot(v) && !pub.joined[v]) {
          delete pub.players[v];
          pub.seats[s] = 'bot:' + E.tierOf(a.tier);
          pub.names[s] = botLabel(a.tier);
        }
      });
      pub.rated = false;
      pub.stake = 0;
      if (humans(pub).length < 1) throw err('bad_seats', 'Someone has to play');
      if (allJoined(pub)) start(m, now, rng);
      return { match: m, result: { filled: true, started: pub.status === 'playing' } };
    }

    if (op === 'hit') {
      if (pub.status !== 'playing') throw err('not_playing', 'This match isn’t live');
      const c = pub.contact;
      if (!c || (pub.phase !== 'serve' && pub.phase !== 'rally')) throw err('no_contact', 'The shuttle isn’t coming to you');
      if (Number(a.n) !== c.n || Number(a.k) !== c.k) throw err('stale_contact', 'That shot already happened');
      if (pub.seats[c.seat] !== uid) throw err('not_your_shot', 'Your partner or opponent has this one');
      const elapsed = now - c.startAt;
      if (elapsed < -200) throw err('too_early', 'Wait for the shuttle');
      // Only the tap time is read — a claimed winner, score or code is ignored.
      const tap = clampTap(a.t, Math.max(0, elapsed), a.rtt);
      const p = tap / c.dur;
      const timing = p > 1 ? 'late' : E.timingOf(p) === 'none' ? 'early' : E.timingOf(p);
      pub.misses[uid] = 0;
      const res = resolveTap(m, Math.round(c.startAt + tap), rng, timing, '', 0, now);
      return { match: m, result: Object.assign({ resolved: true, timing }, res) };
    }

    if (op === 'ready') {
      if (pub.phase !== 'interval') return null;
      pub.ready[uid] = true;
      if (humans(pub).every((u) => pub.ready[u])) {
        const res = toServe(m, Math.max(now, pub.pause ? pub.pause.from : now), LEAD_MS, rng);
        return { match: m, result: Object.assign({ resumed: true }, res) };
      }
      return { match: m, result: { ready: true } };
    }

    if (op === 'tick') {
      if (pub.status === 'waiting') {
        if (now >= pub.deadline) {
          pub.status = 'void';
          pub.reason = 'no_show';
          pub.deadline = 0;
          return { match: m, result: { voided: true } };
        }
        return null;
      }
      if (pub.status !== 'playing') return null;
      if (!pub.local) {
        const gone = humans(pub).find((u) => u !== uid && presenceGone(m, u, now));
        if (gone && !presenceGone(m, uid, now)) {
          forfeitSide(m, now, sideOfSeat(seatOfUid(pub, gone)), 'disconnect');
          return { match: m, result: { ended: true, forfeit: true } };
        }
      }
      if (now < pub.deadline) return null;
      if (pub.phase === 'interval') {
        const res = toServe(m, now, LEAD_MS, rng);
        return { match: m, result: Object.assign({ resumed: true }, res) };
      }
      const c = pub.contact;
      if (!c) return null;
      const owner = pub.seats[c.seat];
      if (afk(m, owner)) {
        forfeitSide(m, now, c.side, 'afk');
        return { match: m, result: { ended: true, forfeit: true } };
      }
      if (c.serve) {
        // No serve in time: the server auto-serves a steady serve (the P1 auto-play), and it counts as a miss.
        const res = resolveTap(m, now, rng, 'good', 'serve', 0, now);
        return { match: m, result: Object.assign({ autoServe: true }, res) };
      }
      // No swing: the shuttle lands in their court.
      pub.hits.push({ seat: c.seat, at: c.startAt + c.dur, timing: 'none', land: c.land || { x: 0, y: 3 }, kind: 'miss', auto: 'none' });
      pub.log.push({ t: 'rally', w: 1 - c.side, by: 1 - c.side, code: 'winner', hits: c.k, at: c.startAt + c.dur });
      const res = afterPoint(m, Math.max(now, c.startAt + c.dur), rng);
      return { match: m, result: Object.assign({ noSwing: true, point: 1 - c.side }, res) };
    }

    if (op === 'leave') {
      if (pub.status === 'waiting') {
        if (uid === pub.host || pub.discipline === 'singles') {
          pub.status = 'void';
          pub.reason = 'cancelled';
          pub.deadline = 0;
          return { match: m, result: { voided: true } };
        }
        pub.joined[uid] = false;
        return { match: m, result: { left: true } };
      }
      if (pub.status !== 'playing') return null;
      forfeitSide(m, now, sideOfSeat(seatOfUid(pub, uid)), 'left');
      return { match: m, result: { ended: true, forfeit: true } };
    }

    if (op === 'rematch') {
      if (pub.status !== 'over') throw err('not_over', 'Finish this match first');
      if (pub.nextMatchId) return { match: m, result: { nextMatchId: pub.nextMatchId } };
      pub.rematch[uid] = true;
      if (humans(pub).every((u) => pub.rematch[u])) {
        const n = (String(pub.matchId).match(/-r(\d+)$/) || [0, 0])[1] | 0;
        pub.nextMatchId = cleanMatchId(String(pub.matchId).replace(/-r\d+$/, '') + '-r' + (n + 1));
        const names = {};
        seatList(pub).forEach((s) => (names[s] = pub.names[s]));
        return {
          match: m,
          result: {
            nextMatchId: pub.nextMatchId,
            createNext: { matchId: pub.nextMatchId, discipline: pub.discipline, format: pub.format, stake: pub.stake, seats: Object.assign({}, pub.seats), names, host: pub.host, rematchOf: pub.matchId, local: pub.local },
          },
        };
      }
      return { match: m, result: { waiting: true } };
    }

    if (op === 'settle') return null;

    if (op === 'settle_claim') {
      if (pub.status !== 'over' || m.server.settled) return null;
      if (m.server.settling && now - m.server.settling < SETTLE_LEASE_MS) return null;
      m.server.settling = now;
      return { match: m, result: { settleClaim: true } };
    }
    if (op === 'settle_done') {
      m.server.settled = true;
      m.server.settling = 0;
      pub.settlement = a.settlement || null;
      return { match: m, result: { settled: true } };
    }

    throw err('bad_op', 'Unknown match action');
  }

  /** Stats for the sheet / share card, from the log. */
  function statsOf(pub, upTo) {
    const st = stateOf(pub, upTo);
    const s = st.stats;
    const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
    return {
      state: st,
      rallies: s.rallies,
      longest: s.longest,
      avgRally: s.rallies ? Math.round((s.hits / s.rallies) * 10) / 10 : 0,
      serve: [0, 1].map((i) => ({ won: s.serveWon[i], of: s.serveTot[i], pct: pct(s.serveWon[i], s.serveTot[i]) })),
      receive: [0, 1].map((i) => ({ won: s.recvWon[i], of: s.recvTot[i], pct: pct(s.recvWon[i], s.recvTot[i]) })),
      winners: s.winners.slice(),
      errors: s.errors.slice(),
      bestStreak: s.bestStreak.slice(),
      lets: s.lets,
      games: st.games.map((g) => g.score.slice()),
    };
  }

  return {
    COIN_MS,
    LEAD_MS,
    POINT_MS,
    GRACE_MS,
    MAX_COMP_MS,
    INTERVAL_MS,
    GAME_BREAK_MS,
    JOIN_MS,
    RECONNECT_MS,
    SEATS,
    CLIENT_OPS,
    isBot,
    seatOf,
    sideOfSeat,
    playerOfSeat,
    seatList,
    seatOfUid,
    humans,
    sideUids,
    newMatch,
    hydrate,
    configOf,
    stateOf,
    clampTap,
    reduceMatch,
    statsOf,
    plain,
  };
});
