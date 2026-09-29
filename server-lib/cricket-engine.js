/**
 * Street Cricket — Live 1v1 (server-resolved). Served by POST /api/media-config
 * { action: 'cricket_match', op, matchId, ... } (no extra Vercel function).
 *
 * RTDB games/cricket/{matchId}:
 *   pub      — any signed-in viewer reads (players + spectators): seats, settings, toss, pitch, the
 *              ball-by-ball log, the ball in flight (public view), the review, AI lines + recap
 *   presence — presence/{uid}: player heartbeat { at, online }
 *   server   — no client access: the executed delivery (variation stays hidden), the pending
 *              appeal, AI + settle leases
 *
 * Flow: toss (caller calls heads/tails → winner chooses bat/bowl; a rematch skips the coin and the
 * previous toss loser chooses) → per over the bowler may set type (pace/spin) + field → per ball
 * the bowler sends line/length/variation + where they stopped the accuracy meter; the server
 * executes the plan (a hard target can become a full toss, wide or no-ball), stamps a release time
 * a little ahead so both phones start the run-up together, and publishes what a batter can see
 * (type, line, length, pace) — never the variation → the batter sends shot + footwork + running
 * call + tap time; the server clamps the tap to what the network allows (RTT compensation capped at
 * MAX_COMP_MS), rolls the outcome with its own seed (CricketModel) and appends the event. On an LBW
 * or caught-behind appeal with a review left (Standard), the aggrieved player gets REVIEW_MS to
 * review before the decision goes in the log. A phone never sends runs or a dismissal.
 */
'use strict';

const CE = require('../public/src/js/games/cricket-engine.js');
const CM = require('../public/src/js/games/cricket-model.js');
const Policy = require('../public/src/js/dangal/dangal-live-policy.js');

const POLICY = Policy.policyFor('streetcricket');
/** Bowler plans + stops the meter inside this window, or the server bowls a stock ball. */
const BOWL_MS = POLICY.turnMs || 12000;
const TOSS_MS = 10000;
const CHOOSE_MS = 10000;
/** Coin flip animation before the winner's choice clock runs. */
const COIN_MS = 1600;
/** Release lead: both phones get the ball before its run-up starts. */
const LEAD_MS = 900;
/** After the ball passes the stumps, a missing hit is an auto-defend. Covers network lag. */
const GRACE_MS = 1200;
/** RTT compensation cap: a tap may be at most this much older than its arrival. */
const MAX_COMP_MS = 400;
/** Kept for older callers / docs: the P10 cap. */
const MAX_LAG_MS = MAX_COMP_MS;
/** Meter claims must sit within this of the server's own estimate. */
const METER_TOL_MS = 80;
/** Result flash before the bowler's clock runs again. */
const RESULT_MS = 2200;
/** Innings break / Super Over call. */
const BREAK_MS = 5000;
const REVIEW_MS = 8000;
const INTRO_MS = 2500;
const JOIN_MS = 10 * 60 * 1000;
const RECONNECT_MS = POLICY.reconnectMs;
const MAX_STAKE = 500;
const SETTLE_LEASE_MS = 30000;
const AI_LEASE_MS = 15000;
/** Internal ops (settle_*, comment_done) are never callable from a phone. */
const CLIENT_OPS = new Set(['join', 'call', 'choose', 'setup', 'bowl', 'hit', 'review', 'tick', 'leave', 'rematch', 'settle', 'comment', 'recap']);

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
  return /^[\w-]{6,128}$/.test(s) ? s : '';
}
function cleanName(raw) {
  return String(raw || '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 24);
}
function cleanToggles(raw) {
  const out = {};
  const t = raw && typeof raw === 'object' ? raw : {};
  ['sixOut', 'lastManStands', 'tipAndRun', 'bounceCatch'].forEach((k) => {
    if (t[k] != null) out[k] = !!t[k];
  });
  return out;
}
const seedOf = (rng) => Math.floor(rng() * 4294967296) >>> 0;
/** RTDB rejects undefined values. */
const plain = (v) => JSON.parse(JSON.stringify(v));

function other(pub, uid) {
  return uid === pub.playerA ? pub.playerB : pub.playerA;
}

function applySettings(pub, a) {
  if (a.format != null) pub.format = CE.normFormat(a.format);
  if (a.preset != null) pub.preset = CE.normPreset(a.preset);
  if (a.toggles != null) pub.toggles = cleanToggles(a.toggles);
  if (a.tie != null) pub.tie = CE.normTie(a.tie);
  if (a.stake != null) pub.stake = Math.max(0, Math.min(MAX_STAKE, Math.floor(Number(a.stake) || 0)));
  if (a.persona != null) pub.persona = a.persona === 'fan' ? 'fan' : 'calm';
  pub.rated = !!CE.PRESETS[pub.preset].rated;
}

function newMatch(o) {
  const now = o.now;
  const players = {};
  players[o.playerA] = true;
  players[o.playerB] = true;
  const pub = {
    game: 'streetcricket',
    matchId: o.matchId,
    playerA: o.playerA,
    playerB: o.playerB,
    players,
    names: Object.assign({}, o.names || {}),
    format: 'standard',
    preset: 'standard',
    toggles: {},
    tie: 'superover',
    persona: 'calm',
    rated: true,
    stake: 0,
    status: 'waiting',
    joined: {},
    toss: null,
    pitch: '',
    log: [],
    phase: '',
    ball: null,
    over: null,
    review: null,
    meterAt: 0,
    deadline: now + JOIN_MS,
    misses: {},
    createdAt: now,
    startedAt: 0,
    endedAt: 0,
    winner: null,
    draw: false,
    reason: '',
    result: '',
    rematch: {},
    nextMatchId: '',
    rematchOf: o.rematchOf || '',
    /** Rematch: the previous toss loser chooses bat/bowl (no coin). */
    chooser: o.chooser || '',
    ai: {},
    settlement: null,
  };
  applySettings(pub, o);
  return { pub, server: { settled: false, settling: 0, ball: null, pending: null, aiLease: {} }, presence: {} };
}

/** RTDB drops empty objects / arrays and nulls — restore the shapes the reducer expects. */
function hydrate(m) {
  if (!m || !m.pub) return m;
  const p = m.pub;
  p.players = p.players || {};
  p.names = p.names || {};
  p.joined = p.joined || {};
  p.toggles = p.toggles || {};
  p.misses = p.misses || {};
  p.rematch = p.rematch || {};
  p.ai = p.ai || {};
  p.log = Array.isArray(p.log) ? p.log.filter(Boolean) : p.log ? Object.keys(p.log).sort((x, y) => x - y).map((k) => p.log[k]) : [];
  p.log.forEach((e) => {
    e.extra = e.extra || '';
    e.out = e.out || '';
    e.runs = e.runs || 0;
  });
  p.ball = p.ball || null;
  p.over = p.over || null;
  p.review = p.review || null;
  p.toss = p.toss || null;
  p.winner = p.winner || null;
  p.settlement = p.settlement || null;
  p.pitch = p.pitch || '';
  p.persona = p.persona || 'calm';
  m.server = m.server || {};
  m.server.aiLease = m.server.aiLease || {};
  m.server.ball = m.server.ball || null;
  m.server.pending = m.server.pending || null;
  m.presence = m.presence || {};
  return m;
}

/** Engine config for this match: side 0 = playerA, side 1 = playerB. */
function configOf(pub) {
  return CE.liveConfig(pub);
}
function stateOf(pub) {
  return CE.replay(configOf(pub), pub.log);
}
function sideUid(pub, side) {
  return side === 1 ? pub.playerB : pub.playerA;
}
/** { batter, bowler } uids for the ball about to be bowled. */
function rolesOf(pub, state) {
  const st = state || stateOf(pub);
  const inn = CE.current(st);
  return { batter: sideUid(pub, inn.bat), bowler: sideUid(pub, inn.bowl), innings: inn.n };
}
function overKey(inn) {
  return inn.n + ':' + Math.floor(inn.legal / CE.BALLS_PER_OVER);
}

function presenceGone(m, uid, now) {
  const p = m.presence[uid];
  const since = p && Number(p.at) ? Number(p.at) : m.pub.startedAt || m.pub.createdAt;
  return now - since > RECONNECT_MS;
}

function finish(m, now, winner, reason, text) {
  const pub = m.pub;
  pub.status = 'over';
  pub.winner = winner || null;
  pub.draw = !winner;
  pub.reason = reason;
  pub.result = text || '';
  pub.phase = '';
  pub.ball = null;
  pub.review = null;
  pub.deadline = 0;
  pub.endedAt = now;
  m.server.ball = null;
  m.server.pending = null;
}

/** The bowler's clock: a fresh over resets setup (type + field carry over as defaults). */
function toBowl(m, now, wait) {
  const pub = m.pub;
  const st = stateOf(pub);
  const inn = CE.current(st);
  const key = overKey(inn);
  if (!pub.over || pub.over.key !== key) {
    const prev = pub.over || {};
    pub.over = { key, type: prev.type || (pub.pitch === 'dusty' ? 'spin' : 'pace'), field: prev.field || 'balanced', fresh: true };
  }
  pub.phase = 'bowl';
  pub.ball = null;
  pub.review = null;
  pub.meterAt = now + wait;
  pub.deadline = now + wait + BOWL_MS;
}

/** Next phase after the log changed: finished, an innings break, or the bowler's clock. */
function afterEvent(m, now, prevInnings) {
  const pub = m.pub;
  const st = stateOf(pub);
  m.server.ball = null;
  m.server.pending = null;
  pub.review = null;
  if (st.result) {
    const r = st.result;
    const winner = r.kind === 'win' ? sideUid(pub, r.winner) : null;
    finish(m, now, winner, r.by || r.kind, r.text);
    return { ended: true };
  }
  const inn = CE.current(st);
  pub.ball = null;
  if (inn.n !== prevInnings) {
    pub.phase = 'break';
    pub.over = null;
    pub.deadline = now + RESULT_MS + BREAK_MS;
    return { inningsBreak: true };
  }
  toBowl(m, now, RESULT_MS);
  return {};
}

function startPlay(m, now) {
  const pub = m.pub;
  pub.phase = 'bowl';
  pub.over = null;
  toBowl(m, now, INTRO_MS);
}

/** Public view of the executed delivery: what a batter can see. Variation stays server-side. */
function publicBall(n, del, startAt) {
  return {
    n,
    startAt,
    type: del.type,
    line: del.line,
    length: del.length,
    wide: del.extra === 'wd',
    spot: del.spot,
    runupMs: del.runupMs,
    flightMs: del.flightMs,
    zoneStart: del.zoneStart,
    zoneEnd: del.zoneEnd,
    lateEnd: del.lateEnd,
  };
}

function startBall(m, plan, accuracy, now, rng) {
  const pub = m.pub;
  const del = CM.execute(plan, accuracy, CM.mulberry32(seedOf(rng)));
  const startAt = now + LEAD_MS;
  m.server.ball = plain({ plan, accuracy: Math.round(accuracy * 1000) / 1000, del });
  pub.ball = publicBall(pub.log.length, del, startAt);
  if (pub.over) pub.over.fresh = false;
  pub.phase = 'ball';
  pub.deadline = startAt + del.runupMs + del.flightMs + GRACE_MS;
  return del;
}

/**
 * Clamp a claimed tap time (ms since startAt, server clock) to what the network allows: it can't
 * be later than the moment the request arrived, nor older than the capped RTT compensation
 * (lag = clamp(0.6·rtt + 100, 120, MAX_COMP_MS)).
 */
function clampTap(claimed, elapsed, rtt) {
  const lag = Math.max(120, Math.min(MAX_COMP_MS, (Number(rtt) || 0) * 0.6 + 100));
  const t = Number(claimed);
  if (!isFinite(t)) return elapsed;
  return Math.max(elapsed - lag, Math.min(elapsed, t));
}
/** Meter stop (ms since meterAt): within METER_TOL_MS of the server's estimate, never in the future. */
function clampMeter(claimed, elapsed, rtt) {
  const est = elapsed - Math.min(200, Math.max(0, Number(rtt) || 0) / 2);
  const t = Number(claimed);
  if (!isFinite(t)) return est;
  return Math.max(0, Math.min(elapsed, Math.max(est - METER_TOL_MS, Math.min(est + METER_TOL_MS, t))));
}

/** Resolve the ball in flight; an appeal with a review left pauses for the review. */
function resolveBallNow(m, now, rng, choice, tap) {
  const pub = m.pub;
  const st = stateOf(pub);
  const inn = CE.current(st);
  const sb = m.server.ball;
  const del = sb.del;
  const timing = choice.timing || (tap == null ? 'miss' : CM.timingOf(del, tap));
  const seed = seedOf(rng);
  const striker = inn.batters[inn.striker];
  let ev = CM.resolve(
    {
      delivery: del,
      shot: choice.shot,
      foot: choice.foot,
      run: choice.run,
      timing,
      conf: striker ? striker.conf : 20,
      field: pub.over ? pub.over.field : 'balanced',
      pitch: pub.pitch,
      rules: st.config.rules,
    },
    seed,
  );
  ev.at = now;
  if (tap != null) ev.tap = Math.round(tap);
  if (choice.auto) ev.auto = choice.auto;
  ev.acc = sb.accuracy;
  ev = plain(ev);
  if (ev.appeal && st.config.rules.drs) {
    const side = CM.reviewer(ev);
    if (inn.reviews[side] > 0) {
      const byUid = side === 'bat' ? sideUid(pub, inn.bat) : sideUid(pub, inn.bowl);
      m.server.pending = ev;
      pub.phase = 'review';
      pub.review = { n: pub.log.length, by: side, byUid, kind: ev.appeal.kind, onField: ev.appeal.onField, left: inn.reviews[side] };
      pub.deadline = now + REVIEW_MS;
      return { appeal: true, review: pub.review };
    }
  }
  pub.log.push(ev);
  return afterEvent(m, now, inn.n);
}

function commitPending(m, now, reviewIt) {
  const pub = m.pub;
  const st = stateOf(pub);
  const inn = CE.current(st);
  let ev = m.server.pending;
  if (reviewIt) ev = plain(CM.applyReview(ev, pub.review.by));
  pub.log.push(ev);
  const res = afterEvent(m, now, inn.n);
  return Object.assign({ reviewed: !!reviewIt, drs: ev.drs || null, out: ev.out || '' }, res);
}

function afk(m, uid) {
  const step = Policy.afkStep(m.pub.misses[uid], POLICY);
  m.pub.misses[uid] = step.misses;
  return step.forfeit;
}

function tossDone(pub, winner, bat, now) {
  pub.toss.winner = winner;
  pub.toss.choice = bat ? 'bat' : 'bowl';
  pub.toss.bats = bat ? winner : other(pub, winner);
  pub.toss.at = now;
}

/**
 * Pure reducer — (match, uid, op, args) → { match, result }. Throws coded errors.
 * `rng` rolls the toss, the pitch, execution and every ball seed.
 */
function reduceMatch(current, uid, op, args, now, rng) {
  const a = args || {};
  const matchId = cleanMatchId(a.matchId);

  if (op === 'join') {
    if (!current) {
      const opp = cleanUid(a.opponentUid);
      if (!opp || opp === uid) throw err('bad_opponent', 'Pick a real opponent');
      const hostA = cleanUid(a.playerA);
      const playerA = hostA === opp ? opp : uid;
      const playerB = playerA === uid ? opp : uid;
      const hostArgs = playerA === uid ? a : {};
      const m = newMatch({
        matchId,
        playerA,
        playerB,
        now,
        format: hostArgs.format,
        preset: hostArgs.preset,
        toggles: hostArgs.toggles,
        tie: hostArgs.tie,
        stake: hostArgs.stake,
        persona: hostArgs.persona,
      });
      m.pub.joined[uid] = true;
      m.pub.names[uid] = cleanName(a.name) || 'Player';
      return { match: m, result: { created: true } };
    }
    const m = hydrate(current);
    const pub = m.pub;
    if (!pub.players[uid]) throw err('not_in_match', 'This match is for two other players');
    pub.joined[uid] = true;
    if (a.name) pub.names[uid] = cleanName(a.name) || pub.names[uid] || 'Player';
    if (pub.status === 'waiting') {
      // The host's settings win while nothing has been bowled (a guest may have created the node).
      if (uid === pub.playerA) applySettings(pub, a);
      if (pub.joined[pub.playerA] && pub.joined[pub.playerB]) {
        pub.status = 'playing';
        pub.startedAt = now;
        pub.pitch = CM.rollPitch(pub.preset, seedOf(rng));
        if (pub.chooser && pub.players[pub.chooser]) {
          pub.toss = { caller: '', call: '', coin: '', winner: pub.chooser, rematch: true };
          pub.phase = 'choose';
          pub.deadline = now + CHOOSE_MS;
        } else {
          pub.toss = { caller: pub.playerB, call: '', coin: '', winner: '' };
          pub.phase = 'toss';
          pub.deadline = now + TOSS_MS;
        }
      }
    }
    return { match: m, result: { joined: true } };
  }

  if (!current) throw err('match_not_found', 'Match not found');
  const m = hydrate(current);
  const pub = m.pub;
  if (!pub.players[uid] && op !== 'tick') throw err('not_in_match', 'This match is for two other players');
  if (!pub.players[uid]) return null;

  if (op === 'call') {
    if (pub.phase !== 'toss') throw err('not_toss', 'The toss is done');
    if (uid !== pub.toss.caller) throw err('not_caller', 'Your opponent calls the toss');
    const call = a.call === 'tails' ? 'tails' : 'heads';
    const coin = rng() < 0.5 ? 'heads' : 'tails';
    pub.toss.call = call;
    pub.toss.coin = coin;
    pub.toss.winner = call === coin ? uid : other(pub, uid);
    pub.misses[uid] = 0;
    pub.phase = 'choose';
    pub.deadline = now + COIN_MS + CHOOSE_MS;
    return { match: m, result: { coin, winner: pub.toss.winner } };
  }

  if (op === 'choose') {
    if (pub.phase !== 'choose') throw err('not_choose', 'Not choosing now');
    if (uid !== pub.toss.winner) throw err('not_toss_winner', 'The toss winner chooses');
    tossDone(pub, uid, a.bat !== false && a.choice !== 'bowl', now);
    pub.misses[uid] = 0;
    startPlay(m, now);
    return { match: m, result: { bats: pub.toss.bats } };
  }

  if (op === 'setup') {
    if (pub.status !== 'playing' || pub.phase !== 'bowl') throw err('not_your_turn', 'Set up between balls');
    const roles = rolesOf(pub);
    if (uid !== roles.bowler) throw err('not_bowler', 'You’re batting this innings');
    if (!pub.over || !pub.over.fresh) throw err('mid_over', 'Type and field change between overs');
    if (a.type != null) pub.over.type = CM.TYPES.indexOf(a.type) >= 0 ? a.type : pub.over.type;
    if (a.field != null) pub.over.field = CM.FIELDS[a.field] ? a.field : pub.over.field;
    return { match: m, result: { over: pub.over } };
  }

  if (op === 'bowl') {
    if (pub.status !== 'playing') throw err('not_playing', 'This match isn’t live');
    if (pub.phase !== 'bowl') throw err('not_your_turn', 'Wait for the next ball');
    if (Number(a.ballNo) !== pub.log.length) throw err('stale_ball', 'That ball already happened');
    const roles = rolesOf(pub);
    if (uid !== roles.bowler) throw err('not_bowler', 'You’re batting this innings');
    if (a.line != null && CM.LINES.indexOf(a.line) < 0) throw err('bad_delivery', 'Pick a line');
    if (a.length != null && CM.LENGTHS.indexOf(a.length) < 0) throw err('bad_delivery', 'Pick a length');
    const type = pub.over ? pub.over.type : 'pace';
    if (a.variation != null && CM.VARIATIONS[type].indexOf(a.variation) < 0) throw err('bad_delivery', 'That variation isn’t for this bowling type');
    const elapsed = now - pub.meterAt;
    if (elapsed < 0) throw err('too_early', 'The meter hasn’t started');
    const plan = CM.normPlan({ type, line: a.line, length: a.length, variation: a.variation });
    const accuracy = CM.meterAccuracy(clampMeter(a.m, elapsed, a.rtt));
    pub.misses[uid] = 0;
    startBall(m, plan, accuracy, now, rng);
    return { match: m, result: { bowled: true, startAt: pub.ball.startAt, accuracy: m.server.ball.accuracy } };
  }

  if (op === 'hit') {
    if (pub.status !== 'playing') throw err('not_playing', 'This match isn’t live');
    if (pub.phase !== 'ball' || !pub.ball || !m.server.ball) throw err('no_ball', 'No ball in flight');
    if (Number(a.ballNo) !== pub.ball.n) throw err('stale_ball', 'That ball already happened');
    const roles = rolesOf(pub);
    if (uid !== roles.batter) throw err('not_batter', 'You’re bowling this innings');
    const elapsed = now - pub.ball.startAt;
    if (elapsed < 0) throw err('too_early', 'The ball isn’t bowled yet');
    const shot = CM.SHOTS.indexOf(a.shot) >= 0 ? a.shot : 'defend';
    // Only shot, footwork, the running call and the tap time are read — claimed runs / outs are ignored.
    const tap = a.t == null ? null : clampTap(a.t, elapsed, a.rtt);
    pub.misses[uid] = 0;
    const res = resolveBallNow(m, now, rng, { shot, foot: a.foot === 'out' ? 'out' : 'stay', run: a.run === 'hold' || a.run === 'two' ? a.run : 'one' }, tap);
    return { match: m, result: Object.assign({ resolved: true }, res) };
  }

  if (op === 'review') {
    if (pub.phase !== 'review' || !pub.review || !m.server.pending) throw err('no_review', 'Nothing to review');
    if (uid !== pub.review.byUid) throw err('not_reviewer', 'Only the other side can review this');
    if (Number(a.ballNo) !== pub.review.n) throw err('stale_ball', 'That ball already happened');
    const res = commitPending(m, now, a.review !== false);
    return { match: m, result: res };
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
    const opp = other(pub, uid);
    if (presenceGone(m, opp, now) && !presenceGone(m, uid, now)) {
      forfeit(m, now, opp, 'disconnect');
      return { match: m, result: { ended: true, forfeit: true } };
    }
    if (now < pub.deadline) return null;
    if (pub.phase === 'toss') {
      if (afk(m, pub.toss.caller)) {
        forfeit(m, now, pub.toss.caller, 'afk');
        return { match: m, result: { ended: true, forfeit: true } };
      }
      const coin = rng() < 0.5 ? 'heads' : 'tails';
      pub.toss.call = 'heads';
      pub.toss.coin = coin;
      pub.toss.auto = true;
      pub.toss.winner = coin === 'heads' ? pub.toss.caller : other(pub, pub.toss.caller);
      pub.phase = 'choose';
      pub.deadline = now + COIN_MS + CHOOSE_MS;
      return { match: m, result: { autoCall: true } };
    }
    if (pub.phase === 'choose') {
      if (afk(m, pub.toss.winner)) {
        forfeit(m, now, pub.toss.winner, 'afk');
        return { match: m, result: { ended: true, forfeit: true } };
      }
      tossDone(pub, pub.toss.winner, true, now);
      pub.toss.autoChoice = true;
      startPlay(m, now);
      return { match: m, result: { autoChoose: true } };
    }
    const roles = rolesOf(pub);
    if (pub.phase === 'break') {
      toBowl(m, now, 0);
      return { match: m, result: { resumed: true } };
    }
    if (pub.phase === 'bowl') {
      if (afk(m, roles.bowler)) {
        forfeit(m, now, roles.bowler, 'afk');
        return { match: m, result: { ended: true, forfeit: true } };
      }
      startBall(m, CM.stockPlan(pub.over ? pub.over.type : 'pace'), 0.8, now, rng);
      return { match: m, result: { autoBowled: true } };
    }
    if (pub.phase === 'ball') {
      if (afk(m, roles.batter)) {
        forfeit(m, now, roles.batter, 'afk');
        return { match: m, result: { ended: true, forfeit: true } };
      }
      const res = resolveBallNow(m, now, rng, { shot: 'defend', foot: 'stay', run: 'hold', timing: 'late', auto: 'defend' }, null);
      return { match: m, result: Object.assign({ timeout: true }, res) };
    }
    if (pub.phase === 'review') {
      const res = commitPending(m, now, false);
      return { match: m, result: Object.assign({ reviewTimeout: true }, res) };
    }
    return null;
  }

  if (op === 'leave') {
    if (pub.status === 'waiting') {
      pub.status = 'void';
      pub.reason = 'cancelled';
      pub.deadline = 0;
      return { match: m, result: { voided: true } };
    }
    if (pub.status !== 'playing') return null;
    forfeit(m, now, uid, 'left');
    return { match: m, result: { ended: true, forfeit: true } };
  }

  if (op === 'rematch') {
    if (pub.status !== 'over') throw err('not_over', 'Finish this match first');
    if (pub.nextMatchId) return { match: m, result: { nextMatchId: pub.nextMatchId } };
    pub.rematch[uid] = true;
    if (pub.rematch[pub.playerA] && pub.rematch[pub.playerB]) {
      const n = (String(pub.matchId).match(/-r(\d+)$/) || [0, 0])[1] | 0;
      pub.nextMatchId = cleanMatchId(String(pub.matchId).replace(/-r\d+$/, '') + '-r' + (n + 1));
      const tossLoser = pub.toss && pub.toss.winner ? other(pub, pub.toss.winner) : pub.playerA;
      return {
        match: m,
        result: {
          nextMatchId: pub.nextMatchId,
          createNext: {
            matchId: pub.nextMatchId,
            playerA: pub.playerB,
            playerB: pub.playerA,
            names: pub.names,
            format: pub.format,
            preset: pub.preset,
            toggles: pub.toggles,
            tie: pub.tie,
            stake: pub.stake,
            persona: pub.persona,
            chooser: tossLoser,
            rematchOf: pub.matchId,
          },
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

  // AI lines: one claimant per over / recap (lease), then comment_done writes once.
  if (op === 'comment' || op === 'recap') {
    const st = stateOf(pub);
    let key;
    if (op === 'recap') {
      if (pub.status !== 'over' || !st.result) throw err('not_over', 'The recap comes at the end');
      key = 'recap';
    } else {
      const inn = Math.max(0, Math.floor(Number(a.inn) || 0));
      const over = Math.max(0, Math.floor(Number(a.over) || 0));
      const I = st.innings[inn];
      if (!I) throw err('bad_over', 'No such over');
      const done = I.complete || I.legal >= (over + 1) * CE.BALLS_PER_OVER;
      if (!done) throw err('over_live', 'That over is still going');
      key = 'o' + inn + '_' + over;
    }
    if (pub.ai[key] != null) return { match: m, result: { key, done: true } };
    const lease = m.server.aiLease[key];
    if (lease && now - lease < AI_LEASE_MS) return null;
    m.server.aiLease[key] = now;
    return { match: m, result: { key, claim: true } };
  }

  if (op === 'comment_done') {
    const key = String(a.key || '');
    if (!/^(recap|o\d+_\d+)$/.test(key) || pub.ai[key] != null) return null;
    pub.ai[key] = a.value == null ? 0 : a.value;
    delete m.server.aiLease[key];
    return { match: m, result: { key, written: true } };
  }

  throw err('bad_op', 'Unknown match action');
}

/** Forfeit goes into the log too, so the scorecard's result line matches the settlement. */
function forfeit(m, now, loserUid, reason) {
  const pub = m.pub;
  const winnerUid = other(pub, loserUid);
  pub.log.push({ t: 'end', reason: 'forfeit', winner: winnerUid === pub.playerA ? 0 : 1, why: reason, at: now });
  const st = stateOf(pub);
  finish(m, now, winnerUid, reason, st.result ? st.result.text : '');
}

/** Achievements the server can prove from the log. */
function achievementFlags(pub) {
  const flags = {};
  stateOf(pub).innings.forEach((inn) => {
    const uid = sideUid(pub, inn.bat);
    if (inn.sixes >= 3) flags[uid] = ['cricket_three_sixes'];
  });
  return flags;
}

/** Chips + rating through the shared economy — trusted because the server resolved every ball. */
async function settleMatch(adminApp, pub, econ) {
  const e = econ || require('./dangal-economy');
  const flags = achievementFlags(pub);
  const draw = !pub.winner;
  const actor = pub.winner || pub.playerA;
  const opp = other(pub, actor);
  const payload = await e.resolveGame(
    adminApp.firestore(),
    adminApp,
    actor,
    {
      gameType: 'streetcricket',
      result: draw ? 'draw' : 'win',
      won: !draw,
      isDraw: draw,
      opponentUid: opp,
      winnerUid: draw ? '' : actor,
      stake: pub.stake,
      matchId: pub.matchId,
      rated: !!pub.rated,
    },
    { trusted: true, flags }
  );
  const side = (p) => ({
    chipDelta: Number(p && p.chipDelta) || 0,
    eloDelta: Number(p && p.eloDelta) || 0,
    achievements: ((p && p.achievements) || []).map((x) => x.key || x),
  });
  const out = {};
  out[actor] = side(payload);
  out[opp] = side(payload && payload.opponent);
  return out;
}

/**
 * AI input for an over or the recap, and the value to store. Lines are keyed by moment key so
 * every phone lines them up with the log. Fallback (AI off / cap / timeout / invalid) stores 0 —
 * phones then show the no-repeat template library.
 */
async function aiValue(pub, key, uid, ai) {
  const CC = require('../public/src/js/games/cricket-commentary.js');
  const st = stateOf(pub);
  if (key === 'recap') {
    const facts = CC.recapFacts(st);
    const out = await ai.run('commentary', { gameId: 'streetcricket', mode: 'recap', persona: pub.persona, facts }, { uid });
    return out && (out.source === 'ai' || out.source === 'cache') && out.data.recap ? { text: out.data.recap, source: 'ai' } : 0;
  }
  const mm = key.match(/^o(\d+)_(\d+)$/);
  const moments = CC.overMoments(st, Number(mm[1]), Number(mm[2]));
  if (!moments.length) return 0;
  const compact = moments.slice(0, 8).map(CC.compactMoment);
  const out = await ai.run('commentary', { gameId: 'streetcricket', mode: 'over', persona: pub.persona, moments: compact }, { uid });
  if (!out || !(out.source === 'ai' || out.source === 'cache')) return 0;
  const lines = (out.data.lines || []).map((x) => ({ k: moments[x.i].key, line: x.line }));
  return lines.length ? lines : 0;
}

/** Run the reducer against one RTDB node atomically (same cold-cache handling as party rooms). */
async function transactMatch(rtdb, path, fn, { allowEmpty = false } = {}) {
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
      return next.match;
    } catch (e) {
      failure = e;
      return undefined;
    }
  });
  if (failure) throw failure;
  if (noop) return { noop: true };
  if (!tx.committed) throw err('busy', 'Match busy — try again');
  if (!outcome) throw err('match_not_found', 'Match not found');
  return outcome;
}

/**
 * Entry point for the `cricket_match` action.
 * @param {import('firebase-admin')} adminApp
 * deps: { now, rng, econ, ai } — ai defaults to dangal-ai's shared instance.
 */
async function cricketMatch(adminApp, uid, body, deps) {
  const b = body || {};
  const op = String(b.op || '');
  if (!CLIENT_OPS.has(op)) throw err('bad_op', 'Unknown match action');
  const matchId = cleanMatchId(b.matchId);
  if (!matchId) throw err('bad_match', 'Missing match');
  const rtdb = adminApp.database();
  const now = (deps && deps.now) || Date.now();
  const path = `games/cricket/${matchId}`;
  const rng = (deps && deps.rng) || Math.random;
  const result = await transactMatch(rtdb, path, (cur) => reduceMatch(cur, uid, op, b, now, rng), {
    allowEmpty: op === 'join',
  });

  if (result.createNext) {
    const c = result.createNext;
    await transactMatch(
      rtdb,
      `games/cricket/${c.matchId}`,
      (cur) => (cur ? null : { match: newMatch(Object.assign({ now }, c)), result: {} }),
      { allowEmpty: true }
    ).catch(() => {});
    delete result.createNext;
  }

  if (result.claim) {
    try {
      const snap = await rtdb.ref(path + '/pub').once('value');
      const pub = hydrate({ pub: snap.val() }).pub;
      const ai =
        (deps && deps.ai) ||
        require('./dangal-ai').sharedAI(typeof adminApp.firestore === 'function' ? { db: adminApp.firestore(), admin: adminApp } : {});
      const value = await aiValue(pub, result.key, uid, ai);
      await transactMatch(rtdb, path, (cur) => reduceMatch(cur, uid, 'comment_done', { key: result.key, value }, now));
      result.value = value;
    } catch (e) {
      console.warn('[cricket] ai', e && e.message);
    }
    delete result.claim;
  }

  if (result.ended || op === 'settle' || op === 'tick' || op === 'join') {
    await maybeSettle(adminApp, rtdb, path, uid, now, deps).catch((e) => {
      console.warn('[cricket] settle', e && e.message);
    });
  }
  return Object.assign({ matchId, serverNow: now }, result);
}

async function maybeSettle(adminApp, rtdb, path, uid, now, deps) {
  const claim = await transactMatch(rtdb, path, (cur) => reduceMatch(cur, uid, 'settle_claim', {}, now));
  if (!claim.settleClaim) return null;
  const snap = await rtdb.ref(path + '/pub').once('value');
  const pub = hydrate({ pub: snap.val() }).pub;
  const settlement = await settleMatch(adminApp, pub, deps && deps.econ);
  await transactMatch(rtdb, path, (cur) => reduceMatch(cur, uid, 'settle_done', { settlement }, now));
  return settlement;
}

module.exports = {
  BOWL_MS,
  TOSS_MS,
  CHOOSE_MS,
  COIN_MS,
  LEAD_MS,
  GRACE_MS,
  MAX_COMP_MS,
  MAX_LAG_MS,
  METER_TOL_MS,
  RESULT_MS,
  BREAK_MS,
  REVIEW_MS,
  JOIN_MS,
  RECONNECT_MS,
  CLIENT_OPS,
  newMatch,
  hydrate,
  configOf,
  stateOf,
  rolesOf,
  clampTap,
  clampMeter,
  publicBall,
  reduceMatch,
  achievementFlags,
  settleMatch,
  aiValue,
  cricketMatch,
};
