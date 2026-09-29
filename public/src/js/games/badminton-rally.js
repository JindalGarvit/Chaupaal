/**
 * Badminton exchange model (P13) — shots, shuttle flight, movement, stamina, doubles formations and
 * the deterministic bots. Pure and seeded: the phone (vs Bot, drills), the server (Live) and
 * scripts/sim-badminton.js run exactly this. The laws engine (badminton-engine.js) stays the only
 * source of fault / let codes and of the score; this file only decides where a shot lands.
 *
 * Coordinates are metres in each side's own frame: y = distance from the net into that half
 * (0 … 6.7), x = distance from the centre line, positive to that side's right.
 *
 * A contact = the shuttle arriving at one player. resolve() turns (shot request, tap timing) into
 * an engine outcome: 'fault' (a CODES fault), 'let', 'winner' (nobody on the other side can reach
 * it) or 'in' with the next contact (who takes it, how long they have, the contact height).
 */
(function (root, factory) {
  const api = typeof module === 'object' && module.exports ? factory(require('./badminton-engine.js')) : factory(root.BadmintonEngine);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BadmintonRally = api;
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  const HALF = 6.7;

  // ---------------------------------------------------------------- tunables (data)

  /**
   * Shot vocabulary.
   *   from    contact heights it can be played from: serve | high (overhead) | mid | low (below the
   *           tape) | nethigh (above the tape at the net)
   *   y, sy   target depth in the receiver's half and its spread · x: how wide it's aimed (0–1)
   *   time    ms the receiver has (before travel + reaction) · win: the tap window a person gets
   *   arrives the receiver's contact height · up: lifts the shuttle (the other side attacks)
   *   net     base chance of hitting the tape (grows as quality drops) · cost: stamina
   *   power   pressure on the receiver's timing · deceive: holdable (ms of hesitation it buys)
   *   kmh     simulated shuttle speed range (share card: "sim km/h")
   */
  const SHOTS = {
    serve_low: { family: 'serve', label: 'Low serve', from: ['serve'], y: 2.45, sy: 0.12, x: 0.35, time: 1020, win: 900, arrives: 'low', up: false, net: 0.012, cost: 0.003, power: 0, deceive: 0, kmh: [60, 90] },
    serve_high: { family: 'serve', label: 'High serve', from: ['serve'], y: 6.25, sy: 0.22, x: 0.45, time: 1680, win: 1400, arrives: 'high', up: true, net: 0.004, cost: 0.004, power: 0, deceive: 0, kmh: [110, 150] },
    serve_flick: { family: 'serve', label: 'Flick serve', from: ['serve'], y: 5.7, sy: 0.24, x: 0.4, time: 1200, win: 1000, arrives: 'high', up: true, net: 0.01, cost: 0.004, power: 0.1, deceive: 170, fault: 0.035, kmh: [120, 160] },
    clear_att: { family: 'clear', label: 'Attacking clear', from: ['high'], y: 5.95, sy: 0.24, x: 0.6, time: 1330, win: 1050, arrives: 'high', up: true, net: 0.006, cost: 0.014, power: 0.12, deceive: 0, kmh: [150, 210] },
    clear_def: { family: 'clear', label: 'Defensive clear', from: ['high', 'mid'], y: 6.0, sy: 0.24, x: 0.45, time: 1770, win: 1400, arrives: 'high', up: true, net: 0.004, cost: 0.012, power: 0, deceive: 0, kmh: [120, 170] },
    drop_slow: { family: 'drop', label: 'Slow drop', from: ['high'], y: 1.5, sy: 0.35, x: 0.55, time: 1330, win: 1100, arrives: 'low', up: false, net: 0.035, cost: 0.012, power: 0.1, deceive: 170, kmh: [70, 110] },
    drop_fast: { family: 'drop', label: 'Fast drop', from: ['high'], y: 2.3, sy: 0.38, x: 0.6, time: 1060, win: 850, arrives: 'low', up: false, net: 0.045, cost: 0.014, power: 0.25, deceive: 140, kmh: [130, 190] },
    smash_stand: { family: 'smash', label: 'Smash', from: ['high'], y: 3.9, sy: 0.6, x: 0.7, time: 790, win: 560, arrives: 'mid', up: false, net: 0.04, cost: 0.03, power: 0.55, deceive: 0, kmh: [190, 270] },
    smash_jump: { family: 'smash', label: 'Jump smash', from: ['high'], y: 3.6, sy: 0.6, x: 0.74, time: 720, win: 480, arrives: 'mid', up: false, net: 0.05, cost: 0.07, power: 0.75, deceive: 0, jump: true, kmh: [250, 340] },
    drive: { family: 'drive', label: 'Drive', from: ['mid'], y: 4.3, sy: 0.55, x: 0.6, time: 880, win: 650, arrives: 'mid', up: false, net: 0.03, cost: 0.012, power: 0.3, deceive: 0, kmh: [140, 200] },
    net_tumble: { family: 'net', label: 'Tumbling net shot', from: ['low', 'nethigh'], y: 0.75, sy: 0.3, x: 0.5, time: 1200, win: 950, arrives: 'low', up: false, net: 0.06, cost: 0.01, power: 0.1, deceive: 160, near: true, kmh: [20, 40] },
    net_spin: { family: 'net', label: 'Spinning net shot', from: ['low', 'nethigh'], y: 0.6, sy: 0.3, x: 0.5, time: 1150, win: 950, arrives: 'low', up: false, net: 0.08, cost: 0.01, power: 0.18, deceive: 160, near: true, kmh: [20, 40] },
    net_kill: { family: 'kill', label: 'Net kill', from: ['nethigh'], y: 2.8, sy: 0.6, x: 0.6, time: 710, win: 420, arrives: 'mid', up: false, net: 0.07, cost: 0.02, power: 0.85, deceive: 0, kmh: [150, 230] },
    lift: { family: 'lift', label: 'Lift', from: ['low', 'mid', 'nethigh'], y: 5.85, sy: 0.28, x: 0.5, time: 1590, win: 1250, arrives: 'high', up: true, net: 0.012, cost: 0.012, power: 0, deceive: 150, kmh: [90, 140] },
    push: { family: 'push', label: 'Push', from: ['mid', 'nethigh'], y: 3.4, sy: 0.45, x: 0.6, time: 1020, win: 750, arrives: 'mid', up: false, net: 0.035, cost: 0.01, power: 0.2, deceive: 0, kmh: [90, 140] },
    block: { family: 'block', label: 'Block', from: ['mid'], y: 1.35, sy: 0.35, x: 0.5, time: 1200, win: 900, arrives: 'low', up: false, net: 0.035, cost: 0.008, power: 0.05, deceive: 0, kmh: [40, 80] },
  };
  const SHOT_ORDER = Object.keys(SHOTS);
  const FAMILIES = ['serve', 'clear', 'drop', 'smash', 'drive', 'net', 'kill', 'lift', 'push', 'block'];

  /** Movement, reach, stamina and timing. */
  const MOVE = {
    reach: 0.95,
    setupMs: 110,
    /** r = time needed / time available. Above 1 = unreachable; a lunge window lets some be dug out. */
    lunge: { from: 0.78, qLoss: 1.6, digOut: 0.12, digChance: 0.45 },
    /** Late reach loses the overhead: a high shuttle becomes a mid contact. */
    overheadMaxR: 0.9,
    /** Net shots need an early arrival at the net (r at or below this). */
    netMaxR: 0.55,
    /** Travel: time available scales with how far the shuttle flies. */
    travel: { base: 0.72, per: 0.28, ref: 8 },
    staminaSpeed: 0.3,
    jumpMin: 0.3,
    /** Stamina per metre run, per lunge; recovery between points / interval / game. */
    perMetre: 0.0045,
    lungeCost: 0.012,
    recover: { point: 0.1, interval: 0.4, game: 1 },
    /** How much a power shot costs the receiver's timing (perfect / good chances). */
    pressure: { p: 0.15, g: 0.12 },
    /** Tape: chance multiplier on SHOTS.net. */
    netRisk: 1.7,
    /** Landing from a jump / an off-balance smash delays the smasher's recovery (ms). */
    recoverDelay: { smash_jump: 200, smash_stand: 80 },
    /** A weak lift / clear falls short (metres per unit of lost quality) — the smasher gets a closer, steeper hit. */
    shortLift: 1.4,
    /** Pace: a fast shuttle needs a longer racket preparation (setupMs × (1 + power × this)). */
    paceSetup: { singles: 0, doubles: 1.4 },
    /** Bot shot value: extra credit when the aim point looks out of the defence's reach. */
    winnerBonus: 0.25,
    /** How hard a persona leans: its shot weights are raised to this power, and its line / front are scaled (1 = full, 0 = none). */
    style: { singles: 0.5, doubles: 0.5 },
    /** Sideward scatter grows with how wide the aim is: sd × (1 + |aim| × this). */
    lineNoise: 1.0,
    /** Doubles is a faster, flatter game: flight-time multiplier by family (two defenders cover more). */
    doubles: { clear: 0.9, lift: 0.9, drop: 0.95, smash: 0.8, drive: 0.8, push: 0.82, kill: 0.85, block: 0.9, net: 0.95, serve: 1 },
  };
  function timeOf(rs, S) {
    return rs.discipline === 'doubles' ? S.time * (MOVE.doubles[S.family] || 1) : S.time;
  }
  const TIMING_Q = { perfect: 1, good: 0.82, early: 0.52, late: 0.46, auto: 0.34 };
  /** Where each player stands. Singles: one base · doubles: attack (front-back) / defence (side by side). */
  const BASES = {
    singles: { x: 0, y: 3.1 },
    attack: { front: { x: 0, y: 1.9 }, back: { x: 0, y: 4.7 } },
    defence: { left: { x: -1.35, y: 3.6 }, right: { x: 1.35, y: 3.6 } },
    serve: { singles: 1.9, doubles: 2.1 },
    receive: { singles: 2.9, doubles: 2.35 },
  };

  /**
   * Bot levels. speed m/s · react ms (the "read") · acc = spread multiplier · timing = chances of a
   * perfect / good contact · smart = shot selection · deception = hold rate · stamina = how well it
   * saves its legs · defence = composure under a smash.
   */
  const LEVELS = {
    beginner: { id: 'beginner', label: 'Beginner', speed: 3.815, react: 264, acc: 1.16, timing: { p: 0.185, g: 0.59 }, smart: 0.43, deception: 0, stamina: 0.1, defence: 0.24, legs: 1.06 },
    club: { id: 'club', label: 'Club', speed: 3.84, react: 260, acc: 1.14, timing: { p: 0.19, g: 0.59 }, smart: 0.48, deception: 0.04, stamina: 0.4, defence: 0.3, legs: 1.02 },
    county: { id: 'county', label: 'County', speed: 3.87, react: 255, acc: 1.08, timing: { p: 0.2, g: 0.6 }, smart: 0.56, deception: 0.08, stamina: 0.7, defence: 0.4, legs: 0.98 },
    pro: { id: 'pro', label: 'Pro', speed: 3.9, react: 250, acc: 1.02, timing: { p: 0.21, g: 0.6 }, smart: 0.64, deception: 0.12, stamina: 0.95, defence: 0.5, legs: 0.94 },
  };
  const LEVEL_ORDER = ['beginner', 'club', 'county', 'pro'];
  /** A person's movement and read (their skill is the timing and the shot they pick). */
  const HUMAN = { id: 'human', label: 'You', speed: 3.9, react: 245, acc: 1, smart: 0, deception: 0, stamina: 0.6, defence: 0.5, legs: 1 };

  /**
   * Playstyles (the botPersona hook: the same style numbers live in server-lib/dangal-ai.js).
   * w = shot-family weights · line = how close to the lines it aims (singles) · front = base shift toward
   * the net · tilt = per-discipline balance factor fitted in scripts/sim-badminton.js (× attack, ÷ clear/lift).
   */
  const PERSONAS = {
    allround: { id: 'allround', label: 'All-rounder', style: { aggression: 0.5, bluff: 0.4, speed: 0.55, chattiness: 0.3 }, w: { serve: 1, clear: 1, drop: 1, smash: 1, drive: 1, net: 1, kill: 1, lift: 1, push: 1, block: 1 }, line: 0.5, front: 0 },
    attacker: { id: 'attacker', label: 'Attacker', style: { aggression: 0.9, bluff: 0.25, speed: 0.5, chattiness: 0.3 }, w: { serve: 1, clear: 0.8, drop: 1.15, smash: 2.4, drive: 1.05, net: 0.8, kill: 1.8, lift: 0.85, push: 1.1, block: 0.8 }, line: 0.65, front: 0.05, tilt: { singles: 0.8, doubles: 0.8 } },
    retriever: { id: 'retriever', label: 'Retriever', style: { aggression: 0.2, bluff: 0.2, speed: 0.85, chattiness: 0.2 }, w: { serve: 1, clear: 1.6, drop: 0.9, smash: 0.55, drive: 0.8, net: 0.8, kill: 0.9, lift: 1.6, push: 1, block: 1.4 }, line: 0.35, front: -0.1, tilt: { singles: 1.33, doubles: 1.3 } },
    net: { id: 'net', label: 'Net player', style: { aggression: 0.6, bluff: 0.6, speed: 0.65, chattiness: 0.3 }, w: { serve: 1, clear: 0.85, drop: 1.6, smash: 0.9, drive: 0.9, net: 2.5, kill: 2.3, lift: 0.85, push: 1.3, block: 1.3 }, line: 0.55, front: 0.08, tilt: { singles: 0.95, doubles: 1.7 } },
  };
  const PERSONA_ORDER = ['allround', 'attacker', 'retriever', 'net'];
  const ATTACK_FAMS = { smash: 1, kill: 1, drive: 1, push: 1 };

  // ---------------------------------------------------------------- helpers

  function levelOf(id) {
    if (LEVELS[id]) return id;
    return { easy: 'beginner', normal: 'club', sharp: 'county', hard: 'county', expert: 'pro' }[id] || 'club';
  }
  function personaOf(id) {
    return PERSONAS[id] ? id : 'allround';
  }
  /** 'bot:<level>[:<persona>]' → { level, persona }. */
  function parseBot(v) {
    const parts = String(v || '').split(':');
    return { level: levelOf(parts[1]), persona: personaOf(parts[2]) };
  }
  function botLabel(level, persona) {
    const L = LEVELS[levelOf(level)].label;
    const p = personaOf(persona);
    return L + (p === 'allround' ? '' : ' · ' + PERSONAS[p].label) + ' Bot';
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function gauss(rng) {
    const u = Math.max(1e-9, rng());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
  }
  const sideOfSeat = (seat) => (String(seat).charAt(0) === 'B' ? 1 : 0);
  const seatsOfSide = (rs, side) => rs.seats.filter((s) => sideOfSeat(s) === side);
  const halfW = (discipline) => E.widthOf(discipline) / 2;

  /** Who plays each seat: a person (optionally on Simple controls) or a bot level + persona. */
  function profileOf(rs, seat) {
    const who = rs.who[seat] || {};
    if (who.bot) {
      const L = LEVELS[levelOf(who.level)];
      // `w` overrides the weights (the sim's "spam one shot" strategies).
      const P = who.w ? Object.assign({}, PERSONAS[personaOf(who.persona)], { w: who.w, spam: true }) : PERSONAS[personaOf(who.persona)];
      return { bot: true, L, P, speed: L.speed * (1 + 0.01 * (P.style.speed - 0.5)), react: L.react, acc: L.acc };
    }
    return { bot: false, L: HUMAN, P: PERSONAS.allround, speed: HUMAN.speed, react: HUMAN.react, acc: HUMAN.acc, simple: !!who.simple };
  }

  // ---------------------------------------------------------------- rally state

  /**
   * @param {{ discipline: string, seats: string[], who: Object<string, {bot?, level?, persona?, simple?}> }} o
   */
  function createRally(o) {
    const rs = { discipline: E.normDiscipline(o.discipline), seats: o.seats.slice(), who: JSON.parse(JSON.stringify(o.who || {})), pos: {}, base: {}, st: {}, manual: {}, form: ['', ''], last: null, n: 0 };
    rs.seats.forEach((s) => {
      rs.st[s] = 1;
      rs.pos[s] = { x: 0, y: BASES.singles.y };
      rs.base[s] = { x: 0, y: BASES.singles.y };
    });
    return rs;
  }

  /** Recovery between points (and a lot more at intervals / between games). */
  function rest(rs, kind) {
    const add = MOVE.recover[kind] || MOVE.recover.point;
    rs.seats.forEach((s) => (rs.st[s] = clamp(rs.st[s] + add, 0, 1)));
  }

  /** A person may move their own base (drag); clamped to their half. */
  function setManual(rs, seat, spot) {
    if (!spot || rs.seats.indexOf(seat) < 0) return;
    const w = halfW(rs.discipline);
    rs.manual[seat] = { x: Math.round(clamp(Number(spot.x) || 0, -w + 0.3, w - 0.3) * 100) / 100, y: Math.round(clamp(Number(spot.y) || 3, 1, HALF - 0.6) * 100) / 100 };
  }

  /**
   * Base positions for one side. Singles: the base (a net player sits a touch forward).
   * Doubles: attack = front-back (the hitter from deep stays back), defence = side by side
   * (the hitter keeps their side). A person's dragged spot wins; their bot partner covers the gap.
   */
  function setBases(rs, side, formation, hitter) {
    const seats = seatsOfSide(rs, side);
    if (seats.length === 1) {
      const s = seats[0];
      const P = profileOf(rs, s).P;
      rs.base[s] = rs.manual[s] ? Object.assign({}, rs.manual[s]) : { x: 0, y: BASES.singles.y - (P.front || 0) };
      return;
    }
    rs.form[side] = formation;
    const [a, b] = seats;
    const human = seats.find((s) => !profileOf(rs, s).bot && rs.manual[s]);
    let slots;
    if (formation === 'attack') {
      const lead = human || hitter || a;
      const leadPos = human ? rs.manual[human] : rs.pos[lead];
      const leadBack = leadPos.y > 3.2;
      slots = {};
      slots[lead] = leadBack ? BASES.attack.back : BASES.attack.front;
      slots[lead === a ? b : a] = leadBack ? BASES.attack.front : BASES.attack.back;
    } else {
      const lead = human || hitter || a;
      const leadPos = human ? rs.manual[human] : rs.pos[lead];
      const leadRight = leadPos.x >= 0;
      slots = {};
      slots[lead] = leadRight ? BASES.defence.right : BASES.defence.left;
      slots[lead === a ? b : a] = leadRight ? BASES.defence.left : BASES.defence.right;
    }
    seats.forEach((s) => {
      const P = profileOf(rs, s).P;
      const base = rs.manual[s] && !profileOf(rs, s).bot ? rs.manual[s] : slots[s];
      rs.base[s] = { x: base.x, y: clamp(base.y - (profileOf(rs, s).bot ? (P.front || 0) * 0.5 * MOVE.style.doubles : 0), 1, 5.5) };
    });
  }

  /**
   * Start a rally: server + receiver on their service courts (diagonal), partners at base.
   * @returns the serve contact
   */
  function startRally(rs, o) {
    const dbl = rs.discipline === 'doubles';
    const sgn = o.court === 'L' ? -1 : 1;
    rs.n += 1;
    rs.last = null;
    [0, 1].forEach((side) => setBases(rs, side, side === sideOfSeat(o.server) ? 'attack' : 'defence', side === sideOfSeat(o.server) ? o.server : o.receiver));
    rs.seats.forEach((s) => (rs.pos[s] = Object.assign({}, rs.base[s])));
    rs.pos[o.server] = { x: sgn * 0.55, y: dbl ? BASES.serve.doubles : BASES.serve.singles };
    rs.pos[o.receiver] = { x: sgn * 0.8, y: dbl ? BASES.receive.doubles : BASES.receive.singles };
    if (dbl) {
      const sp = rs.seats.find((s) => s !== o.server && sideOfSeat(s) === sideOfSeat(o.server));
      const rp = rs.seats.find((s) => s !== o.receiver && sideOfSeat(s) === sideOfSeat(o.receiver));
      if (sp) rs.pos[sp] = { x: -sgn * 0.3, y: 4.3 };
      if (rp) rs.pos[rp] = { x: -sgn * 1.1, y: 4 };
    }
    return { seat: o.server, serve: true, ch: 'serve', court: o.court, dur: 1100, loose: false, r: 0, shot: '', receiver: o.receiver };
  }

  // ---------------------------------------------------------------- shots

  /** Can `shot` be played from contact height `ch` by this hitter? (No smash from below the net.) */
  function legal(shot, ch, o) {
    const S = SHOTS[shot];
    if (!S || S.from.indexOf(ch) < 0) return false;
    const opt = o || {};
    if (S.near && opt.y != null && opt.y > 2.6) return false;
    // Only a player who got to the net early can play net again; a stretched one has to lift.
    if (S.near && opt.r != null && opt.r > MOVE.netMaxR) return false;
    if (S.jump && opt.st != null && opt.st < MOVE.jumpMin) return false;
    if (shot === 'serve_high' && opt.discipline === 'doubles' && opt.strict) return false;
    return true;
  }
  function legalShots(ch, o) {
    return SHOT_ORDER.filter((s) => legal(s, ch, o));
  }

  /**
   * A person's swipe → a legal shot. req = { len 0–1 (short → front court, long → deep), hard (fast
   * swipe = attack), x −1…1 (aim), hold }. A tap is { len: 0.7, hard: false, x: 0 }.
   */
  /** A plain tap: the natural shot for where you are (smash a short one, kill at the net, lift when late). */
  function naturalShot(ch, opt) {
    const r = opt.r || 0;
    const y = opt.y == null ? 3 : opt.y;
    if (ch === 'serve') return 'serve_low';
    if (ch === 'high') {
      if (r <= 0.7 && y <= 5.3) return opt.st == null || opt.st >= 0.5 ? 'smash_jump' : 'smash_stand';
      return r <= 0.8 ? (y <= 5.6 ? 'drop_slow' : 'clear_att') : 'clear_def';
    }
    if (ch === 'mid') return r <= 0.45 ? 'drive' : r <= 0.75 ? 'block' : 'lift';
    if (ch === 'nethigh') return 'net_kill';
    return y <= 2.6 && r <= MOVE.netMaxR ? 'net_tumble' : 'lift';
  }

  function shotFor(ch, req, o) {
    const r = req || {};
    const len = clamp(Number(r.len) || 0, 0, 1);
    const hard = !!r.hard;
    const opt = o || {};
    const near = opt.y == null || opt.y <= 2.6;
    let s;
    if (r.tap) s = naturalShot(ch, opt);
    else if (ch === 'serve') s = len < 0.45 ? 'serve_low' : hard ? 'serve_flick' : 'serve_high';
    else if (ch === 'high') {
      if (hard) s = len >= 0.5 ? (opt.st == null || opt.st >= MOVE.jumpMin ? 'smash_jump' : 'smash_stand') : 'drop_fast';
      else s = len >= 0.5 ? (len >= 0.8 ? 'clear_def' : 'clear_att') : 'drop_slow';
      if (hard && len >= 0.5 && len < 0.72) s = 'smash_stand';
    } else if (ch === 'mid') {
      if (hard) s = len >= 0.5 ? 'drive' : 'push';
      else s = len >= 0.5 ? (opt.y != null && opt.y > 4.6 ? 'clear_def' : 'lift') : 'block';
    } else if (ch === 'nethigh') {
      if (hard) s = len >= 0.55 ? 'push' : 'net_kill';
      else s = len >= 0.5 ? 'lift' : 'net_tumble';
    } else {
      if (len >= 0.5 || !near) s = len >= 0.5 ? 'lift' : 'lift';
      else s = hard ? 'net_spin' : 'net_tumble';
    }
    if (!legal(s, ch, opt)) s = legalShots(ch, opt).find((x) => SHOTS[x].up) || legalShots(ch, opt)[0] || 'lift';
    return s;
  }

  // ---------------------------------------------------------------- reach

  function travelFactor(from, land) {
    const t = Math.hypot((from ? from.y : 3) + land.y, (from ? from.x : 0) + land.x);
    return MOVE.travel.base + (MOVE.travel.per * t) / MOVE.travel.ref;
  }
  /** Time needed / time available for `seat` to reach `spot` (lower = easier; > 1 = can't). */
  function reachRatio(rs, seat, spot, availMs, power) {
    const pr = profileOf(rs, seat);
    const v = pr.speed * (1 - MOVE.staminaSpeed + MOVE.staminaSpeed * rs.st[seat]);
    const d = Math.max(0, dist(rs.pos[seat], spot) - MOVE.reach);
    const pace = rs.discipline === 'doubles' ? MOVE.paceSetup.doubles : MOVE.paceSetup.singles;
    const need = (d / v) * 1000 + MOVE.setupMs * (1 + (power || 0) * pace * (1.5 - pr.L.defence));
    return need / Math.max(60, availMs - pr.react);
  }
  function moveToward(p, target, metres) {
    const d = dist(p, target);
    if (d <= metres || d < 1e-6) return { x: target.x, y: target.y };
    const k = metres / d;
    return { x: p.x + (target.x - p.x) * k, y: p.y + (target.y - p.y) * k };
  }
  function interceptOf(land) {
    return { x: clamp(land.x, -3.3, 3.3), y: clamp(land.y, 0.35, HALF) };
  }

  // ---------------------------------------------------------------- bots

  /** A bot's tap quality: its level, minus pressure (power shots, late reach), plus composure. */
  function botTiming(rs, seat, c, rng) {
    const pr = profileOf(rs, seat);
    const L = pr.L;
    const pressure = (c.power || 0) * (1 - L.defence * 0.6) + Math.max(0, (c.r || 0) - MOVE.lunge.from) * 0.8;
    const serve = c.serve ? 0.12 : 0;
    const p = clamp(L.timing.p + serve * 0.5 - pressure * MOVE.pressure.p, 0.02, 0.9);
    const g = clamp(L.timing.g + serve - pressure * MOVE.pressure.g, 0.05, 0.95);
    const u = rng();
    if (u < p) return 'perfect';
    if (u < p + g) return 'good';
    return rng() < 0.5 ? 'early' : 'late';
  }

  /** Rough outcome value of aiming `shot` at `target` against the opponents' current positions. */
  function valueOf(rs, seat, shot, target, c, st) {
    const S = SHOTS[shot];
    const side = sideOfSeat(seat);
    const opp = seatsOfSide(rs, 1 - side);
    const avail = timeOf(rs, S) * travelFactor(rs.pos[seat], target);
    let best = 9;
    opp.forEach((o) => (best = Math.min(best, reachRatio(rs, o, interceptOf(target), avail, S.power))));
    const pressure = clamp(best, 0, 1.3) + (best > 1 ? MOVE.winnerBonus : 0) + S.power * 0.25;
    const w = halfW(rs.discipline);
    const lineRisk = Math.max(0, Math.abs(target.x) - (w - 0.5)) + Math.max(0, target.y - (HALF - 0.55));
    const risk = S.net * MOVE.netRisk * 1.3 + lineRisk * 0.9;
    let v = pressure - risk * 2.2;
    // Hitting down from deep gives the other side time; lifting invites the smash.
    if (S.family === 'smash') v -= Math.max(0, rs.pos[seat].y - 4.9) * (rs.discipline === 'doubles' ? 0.1 : 0.35);
    if (S.up && S.family !== 'serve') v -= 0.12;
    if (S.jump && st < 0.5) v -= profileOf(rs, seat).L.stamina * 0.6;
    if (c && c.r > 0.85 && (S.family === 'smash' || S.family === 'drop')) v -= 0.3;
    return v;
  }

  /** Pick where to aim: away from the receiver (smart) and closer to the lines (aggressive). */
  function aimFor(rs, seat, shot, rng) {
    const pr = profileOf(rs, seat);
    const S = SHOTS[shot];
    const opp = seatsOfSide(rs, 1 - sideOfSeat(seat));
    const ox = opp.length === 1 ? rs.pos[opp[0]].x : 0;
    const away = ox >= 0 ? -1 : 1;
    const sgn = rng() < 0.3 + pr.L.smart * 0.6 ? away : rng() < 0.5 ? -1 : 1;
    // Doubles: attacking shots often go down the middle, between two side-by-side defenders.
    if (opp.length === 2 && !S.up && S.power >= 0.3 && rng() < pr.L.smart * 0.6) return sgn * clamp(0.04 + Math.abs(gauss(rng)) * 0.06, 0.02, 0.2);
    // Doubles: a wider aim always wins against two defenders, so every persona aims the same there.
    const line = opp.length === 2 ? 0.5 : 0.5 + (pr.P.line - 0.5) * MOVE.style.singles;
    const mag = clamp(S.x * (0.55 + line * 0.7) + gauss(rng) * 0.12, 0.05, 1);
    return sgn * mag;
  }

  /**
   * A bot's (or a Simple-controls player's) shot: legal candidates, scored by playstyle weights and
   * tactical value, picked with a level-dependent sharpness (beginners pick almost at random).
   */
  function chooseShot(rs, seat, c, rng, force) {
    const pr = profileOf(rs, seat);
    const L = pr.bot ? pr.L : LEVELS.club;
    const P = pr.bot ? pr.P : PERSONAS.allround;
    const opt = { y: rs.pos[seat].y, st: rs.st[seat], r: c.r, discipline: rs.discipline, strict: rs.discipline === 'doubles' };
    const cands = force ? [force] : legalShots(c.ch, opt);
    if (c.serve && rs.discipline === 'doubles') {
      const i = cands.indexOf('serve_high');
      if (i >= 0 && cands.length > 1) cands.splice(i, 1);
    }
    const k = 1 + L.smart * 5;
    const scored = cands.map((s) => {
      const S = SHOTS[s];
      const x = aimFor(rs, seat, s, rng);
      const target = { x: x * halfW(rs.discipline), y: S.y };
      const fam = S.family === 'serve' ? 'serve' : S.family;
      let w = (P.w[fam] || 1) * (P.w[s] || 1);
      // Playstyle leans are softened so no persona is a hidden level (the sim checks each vs an All-rounder).
      if (!P.spam) {
        w = Math.pow(w, MOVE.style[rs.discipline]);
        // `tilt` (fitted in the sim so each persona ≈ an All-rounder's win rate): × attacking shots, ÷ clears + lifts.
        const t = (P.tilt && P.tilt[rs.discipline]) || 1;
        if (ATTACK_FAMS[fam]) w *= t;
        else if (fam === 'clear' || fam === 'lift') w /= t;
      }
      if (c.serve) w *= s === 'serve_low' ? 1 + L.smart : s === 'serve_high' ? 1.2 - L.smart : 0.3 + L.deception * 2;
      return { s, x, score: w * Math.exp(k * valueOf(rs, seat, s, target, c, rs.st[seat])) };
    });
    let total = 0;
    scored.forEach((o) => (total += o.score));
    let u = rng() * total;
    let pick = scored[scored.length - 1];
    for (const o of scored) {
      u -= o.score;
      if (u <= 0) {
        pick = o;
        break;
      }
    }
    const S = SHOTS[pick.s];
    const hold = !!S.deceive && (c.r || 0) < 0.6 && rng() < (pr.bot ? L.deception * (0.6 + P.style.bluff) : 0);
    return { shot: pick.s, x: pick.x, hold };
  }

  // ---------------------------------------------------------------- resolve

  /**
   * Resolve the contact in play.
   * @param {object} rs rally state (mutated: positions, stamina, formations)
   * @param {object} c  the contact: { seat, serve, ch, court, loose, r, power, receiver? }
   * @param {{ shot?: string, req?: object, x?: number, hold?: boolean, timing: string }} play
   * @param {() => number} rng
   * @returns {{ kind: 'in'|'winner'|'fault'|'let', code: string, shot: string, land: {x,y}, q: number,
   *   kmh: number, next?: object, call?: string, dig?: boolean }}
   */
  function resolve(rs, c, play, rng) {
    const seat = c.seat;
    const side = sideOfSeat(seat);
    const pr = profileOf(rs, seat);
    const opt = { y: rs.pos[seat].y, st: rs.st[seat], r: c.r, discipline: rs.discipline };
    let shot = play.shot && legal(play.shot, c.ch, opt) ? play.shot : shotFor(c.ch, play.req || { tap: true }, opt);
    if (c.serve && SHOTS[shot].family !== 'serve') shot = 'serve_low';
    const S = SHOTS[shot];
    const timing = TIMING_Q[play.timing] != null ? play.timing : 'late';
    const reachQ = c.r > MOVE.lunge.from ? clamp(1 - (c.r - MOVE.lunge.from) * MOVE.lunge.qLoss, 0.35, 1) : 1;
    let q = TIMING_Q[timing] * reachQ * (0.84 + 0.16 * rs.st[seat]);
    const hold = !!play.hold && !!S.deceive;
    if (hold && (c.r || 0) > 0.6) q *= 0.72;
    if (hold && (timing === 'early' || timing === 'late')) q *= 0.8;
    q = clamp(q, 0.15, 1);

    // Stamina: the shot, and a lunge when stretched.
    rs.st[seat] = clamp(rs.st[seat] - S.cost * pr.L.legs - (c.r > MOVE.lunge.from ? MOVE.lungeCost : 0), 0, 1);

    const w = halfW(rs.discipline);
    let xAim = play.x != null ? clamp(Number(play.x) || 0, -1, 1) : play.req && play.req.x != null ? clamp(Number(play.req.x) || 0, -1, 1) : 0;
    // A plain tap aims at the open side (away from the nearest opponent); a swipe aims where it points.
    if (play.x == null && (!play.req || play.req.tap) && !c.serve && !xAim) {
      const opp = seatsOfSide(rs, 1 - side).map((s) => rs.pos[s]);
      const ox = opp.length === 1 ? opp[0].x : 0;
      xAim = (ox >= 0 ? -1 : 1) * (opp.length === 1 ? 0.6 : 0.25);
    }
    const spread = 0.6 + (1 - q) * 1.7;
    let land;
    if (c.serve) {
      const sgn = c.court === 'L' ? -1 : 1;
      land = { x: sgn * w * clamp(S.x + xAim * 0.25 + gauss(rng) * 0.2 * spread * pr.acc, 0.02, 1.2), y: S.y + gauss(rng) * S.sy * spread * pr.acc };
    } else {
      // Aiming closer to a sideline scatters more (the line is a risk, not a free winner).
      const ax = Math.abs(xAim);
      const latSd = 0.22 * spread * pr.acc * (1 + ax * MOVE.lineNoise);
      land = { x: (ax > 0.001 ? Math.sign(xAim) * ax * w * (S.x + 0.28) : 0) + gauss(rng) * latSd, y: S.y + gauss(rng) * S.sy * spread * pr.acc };
      if (S.up) land.y -= (1 - q) * MOVE.shortLift;
    }
    const kmh = Math.round(S.kmh[0] + (S.kmh[1] - S.kmh[0]) * clamp(q * (0.75 + 0.25 * rs.st[seat]), 0, 1));
    const out = (kind, code, extra) => Object.assign({ kind, code, shot, land: { x: Math.round(land.x * 100) / 100, y: Math.round(land.y * 100) / 100 }, q: Math.round(q * 100) / 100, kmh, hold }, extra || {});

    // Illegal serve on an aggressive serve (feet / height), and the tape.
    if (S.fault && rng() < S.fault * (1.3 - q)) return out('fault', 'serve_height', { land: { x: 0, y: 0 } });
    if (rng() < S.net * (1.35 - q) * Math.sqrt(pr.acc) * MOVE.netRisk) {
      land = { x: land.x, y: -0.05 };
      if (!c.serve && rng() < 0.025) return out('let', 'caught_net');
      return out('fault', c.serve ? 'serve_net' : 'net');
    }
    if (rng() < 0.0012) return out('let', 'disintegrated');
    const fault = E.landingFault(land, { discipline: rs.discipline, serve: !!c.serve, court: c.court });
    if (fault) return out('fault', fault);

    // In: who on the other side takes it, and can they get there?
    const target = interceptOf(land);
    const hitterPos = rs.pos[seat];
    const avail = timeOf(rs, S) * travelFactor(hitterPos, land) + (hold ? S.deceive : 0);
    const opp = seatsOfSide(rs, 1 - side);
    let taker = opp[0];
    let r = reachRatio(rs, taker, target, avail, S.power);
    let call = '';
    if (opp.length === 2) {
      if (c.serve && c.receiver) {
        taker = c.receiver;
        r = reachRatio(rs, taker, target, avail, S.power);
      } else {
        const r2 = reachRatio(rs, opp[1], target, avail, S.power);
        const humanFirst = !profileOf(rs, opp[0]).bot ? 0 : !profileOf(rs, opp[1]).bot ? 1 : -1;
        // "Mine": the closer player takes it; a person gets priority on a near tie.
        const tie = 0.08;
        let pick0 = r <= r2;
        if (humanFirst === 0 && r <= r2 + tie) pick0 = true;
        if (humanFirst === 1 && r2 <= r + tie) pick0 = false;
        if (!pick0) {
          taker = opp[1];
          r = r2;
        }
        call = 'mine';
      }
    }

    // Everyone not chasing recovers toward base while the shuttle flies.
    const flightMs = avail;
    setBases(rs, side, S.up ? 'defence' : 'attack', seat);
    setBases(rs, 1 - side, S.up ? 'attack' : 'defence', taker);
    rs.seats.forEach((s) => {
      if (s === taker) return;
      const p = profileOf(rs, s);
      const v = p.speed * (1 - MOVE.staminaSpeed + MOVE.staminaSpeed * rs.st[s]);
      const from = rs.pos[s];
      const delay = 150 + (s === seat ? MOVE.recoverDelay[shot] || 0 : 0);
      const to = moveToward(from, rs.base[s], (v * Math.max(0, flightMs - delay)) / 1000);
      rs.st[s] = clamp(rs.st[s] - dist(from, to) * MOVE.perMetre * p.L.legs * 0.5, 0, 1);
      rs.pos[s] = to;
    });

    let dig = false;
    if (r > 1) {
      if (r <= 1 + MOVE.lunge.digOut && rng() < MOVE.lunge.digChance * (1 - (r - 1) / MOVE.lunge.digOut)) dig = true;
      else return out('winner', 'winner', { taker, r: Math.round(r * 100) / 100 });
    }
    // The taker gets there.
    const tp = profileOf(rs, taker);
    rs.st[taker] = clamp(rs.st[taker] - Math.max(0, dist(rs.pos[taker], target) - MOVE.reach) * MOVE.perMetre * tp.L.legs, 0, 1);
    rs.pos[taker] = moveToward(rs.pos[taker], target, Math.max(0, dist(rs.pos[taker], target) - MOVE.reach * 0.6));
    let ch = S.arrives;
    if (ch === 'high' && r > MOVE.overheadMaxR) ch = 'mid';
    if (ch === 'low' && q < 0.62 && r < 0.62 && target.y < 2.4) ch = 'nethigh';
    if (dig) ch = ch === 'high' ? 'mid' : 'low';
    rs.last = { seat, shot, land: target };
    return out('in', '', {
      call,
      dig,
      next: { seat: taker, ch, r: Math.round(Math.min(r, 1.2) * 100) / 100, power: S.power, shot, loose: q < 0.62, win: clamp(Math.round(S.win * (0.8 + 0.2 * travelFactor(hitterPos, land)) + (hold ? S.deceive * 0.5 : 0)), 380, 1500), readMs: tp.react },
    });
  }

  /** A bot (or Simple controls) plays the contact: choose, time, resolve. */
  function botPlay(rs, c, rng) {
    const ch = chooseShot(rs, c.seat, c, rng);
    const timing = botTiming(rs, c.seat, c, rng);
    return { choice: ch, timing };
  }

  /** The AFK return: the server plays a weak lift (or a low serve) for a missing player. */
  function autoPlay(c) {
    return c.serve ? { shot: 'serve_low', x: 0, timing: 'auto' } : { shot: c.ch === 'high' ? 'clear_def' : 'lift', x: 0, timing: 'auto' };
  }

  // ---------------------------------------------------------------- flight (animation)

  /**
   * Shuttle flight for drawing: fraction of ground distance covered and height at time fraction p.
   * High drag: fast off the racket, decays sharply; clears and lifts fall steeply at the end.
   */
  const FLIGHT = {
    clear: { k: 3.2, apex: 7 },
    lift: { k: 3, apex: 6.5 },
    serve: { k: 2.2, apex: 2.5 },
    drop: { k: 2.4, apex: 2.8 },
    smash: { k: 1.4, apex: 0.4 },
    drive: { k: 1.2, apex: 0.6 },
    net: { k: 1, apex: 0.35 },
    kill: { k: 1.2, apex: 0.2 },
    push: { k: 1.4, apex: 0.6 },
    block: { k: 1.6, apex: 0.5 },
  };
  function flightAt(shot, p) {
    const S = SHOTS[shot] || SHOTS.lift;
    const F = shot === 'serve_high' || shot === 'serve_flick' ? FLIGHT.lift : FLIGHT[S.family] || FLIGHT.drive;
    const t = clamp(p, 0, 1);
    const s = (1 - Math.exp(-F.k * t)) / (1 - Math.exp(-F.k));
    const h = F.apex * Math.sin(Math.PI * Math.pow(t, 0.72));
    return { s, h };
  }

  /**
   * Close call? The distance from a landing spot to the nearest line that decides it (sidelines, back
   * line, and on the serve the short service / doubles long service line). The phone replays close
   * ones as a "Simulated line call" — the engine's fault code is still the only judge.
   */
  function closeCall(land, o) {
    const opt = o || {};
    if (!land || land.y <= 0) return null;
    const w = halfW(opt.discipline);
    const lines = [Math.abs(Math.abs(land.x) - w), Math.abs(land.y - HALF)];
    if (opt.serve) {
      lines.push(Math.abs(land.y - 1.98));
      if (E.normDiscipline(opt.discipline) === 'doubles') lines.push(Math.abs(land.y - 5.94));
      lines.push(Math.abs(land.x));
    }
    const d = Math.min.apply(null, lines);
    return d <= (opt.margin || 0.12) ? { d: Math.round(d * 100) / 100, out: !!E.landingFault(land, { discipline: opt.discipline, serve: !!opt.serve, court: opt.court }) } : null;
  }

  // ---------------------------------------------------------------- drills (solo, unrated)

  const DRILLS = {
    serve: { id: 'serve', label: 'Serve practice', blurb: 'Low serves that skim the short line, flicks that reach the back.', shots: 10, max: 20 },
    smash: { id: 'smash', label: 'Smash defence', blurb: 'A Pro Attacker smashes at you. Get it back — block or drive for a bonus.', shots: 10, max: 20 },
    net: { id: 'net', label: 'Net play', blurb: 'Tight net shots score; kill anything above the tape.', shots: 10, max: 20 },
  };
  const DRILL_ORDER = ['serve', 'smash', 'net'];

  /** A drill: seeded, one contact at a time. d.contact is the shuttle coming to you (null = done). */
  function createDrill(kind, seed) {
    const id = DRILLS[kind] ? kind : 'serve';
    const d = { kind: id, seed: (Number(seed) || 1) >>> 0, i: 0, score: 0, log: [], contact: null, feed: null, rs: null };
    d.rs = createRally({ discipline: 'singles', seats: ['A0', 'B0'], who: { A0: {}, B0: { bot: true, level: 'pro', persona: id === 'smash' ? 'attacker' : 'net' } } });
    nextDrill(d);
    return d;
  }
  function drillRng(d, salt) {
    return E.mulberry32((d.seed + d.i * 7919 + (salt || 0) * 104729) >>> 0);
  }
  function nextDrill(d) {
    const D = DRILLS[d.kind];
    d.feed = null;
    if (d.i >= D.shots) {
      d.contact = null;
      return d;
    }
    const rs = d.rs;
    rs.st.A0 = 1;
    rs.st.B0 = 1;
    rs.manual = {};
    const rng = drillRng(d, 1);
    if (d.kind === 'serve') {
      const court = d.i % 2 ? 'L' : 'R';
      d.contact = startRally(rs, { server: 'A0', receiver: 'B0', court });
      d.contact.win = 980;
      d.target = d.i % 4 < 2 ? 'low' : 'deep';
      return d;
    }
    if (d.kind === 'smash') {
      // The feed: a bot jump smash from mid-court (re-rolled if it isn't a clean one in).
      for (let k = 0; k < 6; k++) {
        rs.pos.A0 = { x: 0, y: BASES.singles.y };
        rs.pos.B0 = { x: (rng() - 0.5) * 1.6, y: 3.6 + rng() };
        const feed = resolve(rs, { seat: 'B0', serve: false, ch: 'high', court: 'R', r: 0.3, power: 0.1, loose: false }, { shot: 'smash_jump', x: rng() < 0.5 ? -0.55 : 0.55, timing: 'good' }, rng);
        if (feed.kind === 'in' || feed.kind === 'winner') {
          d.feed = { land: feed.land, kmh: feed.kmh, shot: feed.shot };
          if (feed.kind === 'winner') {
            d.log.push({ i: d.i, pts: 0, kind: 'beaten', shot: '' });
            d.i += 1;
            d.contact = { seat: 'A0', beaten: true };
            return d;
          }
          d.contact = { seat: 'A0', serve: false, ch: feed.next.ch, court: 'R', r: feed.next.r, power: feed.next.power, loose: false, win: feed.next.win };
          return d;
        }
      }
      d.contact = { seat: 'A0', serve: false, ch: 'mid', court: 'R', r: 0.6, power: 0.75, loose: false, win: 480 };
      return d;
    }
    // Net play: at the net after an opponent's net shot; every third one pops up above the tape.
    const up = d.i % 3 === 2;
    rs.pos.A0 = { x: (rng() - 0.5) * 1.2, y: 1.3 };
    rs.pos.B0 = { x: (rng() - 0.5) * 1.2, y: 2.2 };
    d.contact = { seat: 'A0', serve: false, ch: up ? 'nethigh' : 'low', court: 'R', r: 0.3 + rng() * 0.2, power: 0.1, loose: up, win: up ? 700 : 950 };
    return d;
  }
  /**
   * Play the drill contact. play = { req | shot, timing } (the same input as a match).
   * @returns {{ pts, kind, shot, land, q, note }} and advances to the next contact.
   */
  function playDrill(d, play) {
    const c = d.contact;
    if (!c) return null;
    if (c.beaten) {
      nextDrill(d);
      return { pts: 0, kind: 'beaten', shot: '', land: null, q: 0, note: 'Too quick — that one beat you' };
    }
    if (!play || play.miss) {
      d.log.push({ i: d.i, pts: 0, kind: 'miss', shot: '' });
      d.i += 1;
      nextDrill(d);
      return { pts: 0, kind: 'miss', shot: '', land: null, q: 0, note: 'Missed — swipe or tap when the bar hits green' };
    }
    const rng = drillRng(d, 2);
    const res = resolve(d.rs, c, play, rng);
    const fam = SHOTS[res.shot].family;
    let pts = 0;
    let note = '';
    // The bonus point needs a well-timed contact; a scrambled one only counts as "in".
    const clean = res.q >= 0.6;
    if (d.kind === 'serve') {
      if (res.kind !== 'fault') {
        pts = 1;
        if (clean && d.target === 'low' && res.shot === 'serve_low' && res.land.y <= 2.45) pts = 2;
        if (clean && d.target === 'deep' && res.shot !== 'serve_low' && res.land.y >= 5.6) pts = 2;
        note = pts === 2 ? 'On target' : 'In';
      } else note = 'Fault';
    } else if (d.kind === 'smash') {
      if (res.kind === 'in' || res.kind === 'winner') {
        pts = clean && fam !== 'lift' && fam !== 'clear' ? 2 : 1;
        note = pts === 2 ? 'Counter-attack' : 'Got it back';
      } else note = 'Fault';
    } else if (res.kind === 'in' || res.kind === 'winner') {
      if (fam === 'kill') pts = clean ? 2 : 1;
      else if (fam === 'net') pts = clean && res.land.y <= 1.0 ? 2 : 1;
      note = pts === 2 ? (fam === 'kill' ? 'Killed' : 'Tight') : pts ? 'In' : 'Safe, but that gives them the attack';
    } else note = 'Fault';
    d.score += pts;
    d.log.push({ i: d.i, pts, kind: res.kind, shot: res.shot });
    d.i += 1;
    nextDrill(d);
    return { pts, kind: res.kind, code: res.code, shot: res.shot, land: res.land, q: res.q, kmh: res.kmh, note };
  }

  return {
    HALF,
    SHOTS,
    SHOT_ORDER,
    FAMILIES,
    MOVE,
    TIMING_Q,
    BASES,
    LEVELS,
    LEVEL_ORDER,
    HUMAN,
    PERSONAS,
    PERSONA_ORDER,
    FLIGHT,
    levelOf,
    personaOf,
    parseBot,
    botLabel,
    createRally,
    startRally,
    rest,
    setManual,
    setBases,
    legal,
    legalShots,
    shotFor,
    reachRatio,
    travelFactor,
    botTiming,
    chooseShot,
    botPlay,
    autoPlay,
    resolve,
    flightAt,
    profileOf,
    naturalShot,
    closeCall,
    DRILLS,
    DRILL_ORDER,
    createDrill,
    playDrill,
  };
});
