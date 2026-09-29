/**
 * Street Cricket engine — pure + seeded. Shared by the client (vs AI · Chase) and
 * server-lib/cricket-engine.js (Live 1v1, where the server resolves every ball).
 *
 * Ruleset: based on the MCC Laws of Cricket, adapted for street play.
 *
 * Two layers:
 *   LAWS     — a ball-by-ball event log reduced by replay(config, log) into match state: legal balls,
 *              overs, extras, free hits, dismissals the law allows, strike, innings end, result,
 *              Super Over. Stats, timeline text, chart data and the share summary derive from it.
 *   GAMEPLAY — resolveBall(input, seed) turns a delivery + shot + timing into a *proposed* ball
 *              event. The law layer disposes: a proposed LBW off a no-ball is simply not out.
 *
 * Events:
 *   { t:'ball', extra:''|'wd'|'nb'|'b'|'lb', runs, out:''|kind, outWho:'striker'|'nonstriker',
 *     contact, del, shot, timing, dir, dist, seed, code,
 *     // P11 (CricketModel): type, line, length, variation, foot, run, band, region, edged, behind,
 *     appeal:{kind:'lbw'|'caught', onField, track?, edge}, drs:{by:'bat'|'bowl', result, decision} }
 *   { t:'pen', runs }                                — penalty runs to the batting side
 *   { t:'end', reason:'forfeit'|'abandoned', winner } — forfeit (winner = side index) / no result
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CricketEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RULESET = 'Based on the MCC Laws of Cricket, adapted for street play';
  const BALLS_PER_OVER = 6;
  /** Super Overs repeat on a tie; after this many the boundary count decides. */
  const MAX_SUPER_OVERS = 2;

  // ---------------------------------------------------------------- formats + presets

  const FORMATS = {
    superquick: { id: 'superquick', label: 'Super Quick', overs: 1, wickets: 1 },
    quick: { id: 'quick', label: 'Quick', overs: 2, wickets: 2 },
    standard: { id: 'standard', label: 'Standard', overs: 5, wickets: 3 },
    long: { id: 'long', label: 'Long', overs: 10, wickets: 5 },
  };
  const FORMAT_ORDER = ['superquick', 'quick', 'standard', 'long'];

  /** Chase practice targets per format (runs to win, rolled inside the band). */
  const CHASE_BANDS = { superquick: [16, 22], quick: [24, 32], standard: [45, 60], long: [80, 100] };

  const TIE_MODES = {
    superover: { id: 'superover', label: 'Super Over' },
    shared: { id: 'shared', label: 'Shared (tie stands)' },
    boundaries: { id: 'boundaries', label: 'Boundary count' },
  };

  const BASE_RULES = {
    lbw: true,
    freeHit: true,
    sixOut: false,
    lastManStands: false,
    firstBallSafe: false,
    tipAndRun: false,
    bounceCatch: '',
    drs: false,
  };

  const PRESETS = {
    standard: {
      id: 'standard',
      label: 'Standard',
      rated: true,
      rules: { drs: true },
      toggles: [],
      tweaks: [
        'MCC-adapted laws: LBW, free hit after a no-ball, one bowler per side in 1v1.',
        'Review: one per side per innings on LBW or caught behind — kept on umpire’s call.',
      ],
    },
    gully: {
      id: 'gully',
      label: 'Gully rules',
      rated: false,
      rules: { lbw: false, bounceCatch: 'onehand', sixOut: true, lastManStands: true },
      toggles: ['sixOut', 'lastManStands'],
      tweaks: [
        'No LBW.',
        'One tip one hand: a one-handed catch after one bounce is out.',
        'Six and out: clearing the wall is out (toggle).',
        'Last man stands: the last batter bats on alone (toggle).',
      ],
    },
    backyard: {
      id: 'backyard',
      label: 'Backyard rules',
      rated: false,
      rules: { lbw: false, firstBallSafe: true, tipAndRun: true, bounceCatch: 'bounce' },
      toggles: ['tipAndRun', 'bounceCatch'],
      tweaks: [
        'No LBW.',
        'Can’t be out first ball.',
        'Tip and run: touch it and you must run (toggle).',
        'One-bounce catch counts (toggle).',
      ],
    },
  };
  const PRESET_ORDER = ['standard', 'gully', 'backyard'];

  const TOGGLE_LABELS = {
    sixOut: 'Six and out',
    lastManStands: 'Last man stands',
    tipAndRun: 'Tip and run',
    bounceCatch: 'One-bounce catch',
  };

  function normFormat(id) {
    return FORMATS[id] ? id : 'standard';
  }
  function normPreset(id) {
    return PRESETS[id] ? id : 'standard';
  }
  function normTie(id) {
    return TIE_MODES[id] ? id : 'superover';
  }

  /** Rules object for a preset + its allowed toggles (unknown toggles are ignored). */
  function makeRules(presetId, toggles, tie) {
    const p = PRESETS[normPreset(presetId)];
    const r = Object.assign({}, BASE_RULES, p.rules, { preset: p.id, rated: p.rated, tie: normTie(tie) });
    const t = toggles || {};
    p.toggles.forEach((k) => {
      if (t[k] == null) return;
      if (k === 'bounceCatch') r.bounceCatch = t[k] ? p.rules.bounceCatch || 'bounce' : '';
      else r[k] = !!t[k];
    });
    return r;
  }

  /** Laws table for the Rules sheet + summary: Standard vs each preset. */
  function lawsTable() {
    const rows = [
      ['Overs / wickets', 'Super Quick 1/1 · Quick 2/2 · Standard 5/3 · Long 10/5'],
      ['Legal ball', '6 legal balls an over; wides and no-balls are re-bowled'],
      ['Wide', '1 extra + any runs; not a ball faced; can be stumped, run out or hit wicket'],
      ['No-ball', '1 extra + runs off the bat; only run out; next ball is a free hit'],
      ['Free hit', 'Only a run out; carries over through a wide or another no-ball'],
      ['Byes / leg-byes', 'Count to extras, not the bowler'],
      ['Tie', 'Super Over (the chasing side bats first), shared, or boundary count'],
      ['Review', 'Standard only: one per side per innings on LBW / caught behind; umpire’s call keeps it'],
    ];
    const cols = PRESET_ORDER.map((id) => {
      const r = makeRules(id);
      return {
        id,
        label: PRESETS[id].label,
        rated: PRESETS[id].rated,
        lbw: r.lbw,
        sixOut: r.sixOut,
        lastManStands: r.lastManStands,
        firstBallSafe: r.firstBallSafe,
        tipAndRun: r.tipAndRun,
        bounceCatch: r.bounceCatch,
        drs: r.drs,
        tweaks: PRESETS[id].tweaks.slice(),
      };
    });
    return { source: RULESET, rows, presets: cols };
  }

  // ---------------------------------------------------------------- dismissals + law checks

  const DISMISSALS = {
    bowled: { label: 'Bowled', bowler: true },
    caught: { label: 'Caught', bowler: true },
    lbw: { label: 'LBW', bowler: true },
    runout: { label: 'Run out', bowler: false },
    stumped: { label: 'Stumped', bowler: true },
    hitwicket: { label: 'Hit wicket', bowler: true },
    sixout: { label: 'Six and out', bowler: true },
    bouncecatch: { label: 'Caught on the bounce', bowler: true },
  };
  /** Dismissals where runs completed still count (everything else scores 0 off the bat). */
  const RUNS_STAND = { runout: true };

  function dismissalLabel(kind, rules) {
    if (kind === 'bouncecatch' && rules && rules.bounceCatch === 'onehand') return 'Caught one tip one hand';
    return (DISMISSALS[kind] && DISMISSALS[kind].label) || 'Out';
  }

  /**
   * Can this dismissal stand? ctx = { extra, freeHit, firstBall, rules }.
   * @returns {{ ok: boolean, why: string }}  why = 'no_lbw' | 'rule_off' | 'no_ball' | 'free_hit' | 'wide' | 'bye' | 'first_ball'
   */
  function dismissalAllowed(kind, ctx) {
    const c = ctx || {};
    const rules = c.rules || BASE_RULES;
    const no = (why) => ({ ok: false, why });
    if (!DISMISSALS[kind]) return no('unknown');
    if (kind === 'lbw' && !rules.lbw) return no('no_lbw');
    if (kind === 'sixout' && !rules.sixOut) return no('rule_off');
    if (kind === 'bouncecatch' && !rules.bounceCatch) return no('rule_off');
    if (c.extra === 'nb') return kind === 'runout' ? { ok: true, why: '' } : no('no_ball');
    if (c.freeHit) return kind === 'runout' ? { ok: true, why: '' } : no('free_hit');
    if (c.extra === 'wd' && !(kind === 'stumped' || kind === 'hitwicket' || kind === 'runout')) return no('wide');
    if ((c.extra === 'b' || c.extra === 'lb') && !(kind === 'runout' || kind === 'stumped')) return no('bye');
    if (c.firstBall && rules.firstBallSafe) return no('first_ball');
    return { ok: true, why: '' };
  }

  const SAVED_TEXT = {
    no_lbw: 'no LBW in these rules',
    rule_off: 'not out under these rules',
    no_ball: 'saved by the no-ball',
    free_hit: 'free hit',
    wide: 'not out off a wide',
    bye: 'not out',
    first_ball: 'can’t be out first ball',
  };

  // ---------------------------------------------------------------- match config

  function cleanName(s, fb) {
    const v = String(s == null ? '' : s)
      .replace(/[<>]/g, '')
      .trim()
      .slice(0, 24);
    return v || fb;
  }

  /**
   * A 1v1 side: one player bats every "life". Each wicket brings the same player back as the next
   * batter ("Ava", "Ava (2)", …) so the scorecard stays honest.
   */
  function soloSide(pid, name, wickets) {
    const n = cleanName(name, 'Player');
    const count = Math.max(2, (Number(wickets) || 1) + 2);
    const batters = [];
    for (let i = 0; i < count; i++) batters.push({ id: pid + (i ? '#' + (i + 1) : ''), pid, name: i ? n + ' (' + (i + 1) + ')' : n });
    return { name: n, batters, bowlers: [{ id: pid, pid, name: n }] };
  }

  /**
   * @param {{ format?, overs?, wickets?, rules?, preset?, toggles?, tie?, crease?: 'single'|'pair',
   *   sides: [{name, batters?, bowlers?, pid?}], battingFirst?: 0|1, target?: number }} o
   * `target` > 0 → a one-innings chase (practice). Multi-batter sides use crease 'pair'.
   */
  function createMatch(o) {
    const opts = o || {};
    const f = FORMATS[normFormat(opts.format)];
    const overs = Math.max(1, Math.min(50, Math.floor(Number(opts.overs) || f.overs)));
    const wickets = Math.max(1, Math.min(10, Math.floor(Number(opts.wickets) || f.wickets)));
    const rules = opts.rules ? Object.assign({}, BASE_RULES, opts.rules) : makeRules(opts.preset, opts.toggles, opts.tie);
    rules.tie = normTie(rules.tie);
    const sides = (opts.sides || []).slice(0, 2).map((s, i) => {
      const side = s || {};
      if (side.batters && side.batters.length) {
        return {
          name: cleanName(side.name, 'Side ' + (i + 1)),
          batters: side.batters.map((b, k) => ({ id: String(b.id || 's' + i + 'b' + k), pid: String(b.pid || b.id || 's' + i + 'b' + k), name: cleanName(b.name, 'Batter ' + (k + 1)) })),
          bowlers: (side.bowlers && side.bowlers.length ? side.bowlers : side.batters).map((b, k) => ({
            id: String(b.id || 's' + i + 'w' + k),
            pid: String(b.pid || b.id || 's' + i + 'w' + k),
            name: cleanName(b.name, 'Bowler ' + (k + 1)),
          })),
        };
      }
      return soloSide(String(side.pid || 'p' + i), side.name, wickets);
    });
    while (sides.length < 2) sides.push(soloSide('p' + sides.length, 'Player ' + (sides.length + 1), wickets));
    const target = Math.max(0, Math.floor(Number(opts.target) || 0));
    return {
      format: f.id,
      overs,
      wickets,
      rules,
      crease: opts.crease === 'pair' ? 'pair' : 'single',
      sides,
      battingFirst: opts.battingFirst === 1 ? 1 : 0,
      target,
      innings: target > 0 ? 1 : 2,
      superOver: { overs: 1, wickets: Math.min(2, wickets) },
      pitch: PITCH_IDS.indexOf(opts.pitch) >= 0 ? opts.pitch : '',
    };
  }
  const PITCH_IDS = ['flat', 'green', 'dusty', 'tarmac'];

  /** Live match node (pub) → engine config. Side 0 = playerA. Server and phones share this. */
  function liveConfig(pub) {
    const p = pub || {};
    const names = p.names || {};
    return createMatch({
      format: p.format,
      preset: p.preset,
      toggles: p.toggles || {},
      tie: p.tie,
      pitch: p.pitch,
      sides: [
        { pid: p.playerA, name: names[p.playerA] || 'Player A' },
        { pid: p.playerB, name: names[p.playerB] || 'Player B' },
      ],
      battingFirst: p.toss && p.toss.bats === p.playerB ? 1 : 0,
    });
  }

  // ---------------------------------------------------------------- reducer

  function overLabel(legal) {
    return Math.floor(legal / BALLS_PER_OVER) + '.' + (legal % BALLS_PER_OVER);
  }
  /** "2.3" ball number: completed overs + the ball this delivery was (extras show the upcoming ball). */
  function ballNumber(legalBefore) {
    return Math.floor(legalBefore / BALLS_PER_OVER) + '.' + ((legalBefore % BALLS_PER_OVER) + 1);
  }
  function oversText(legal) {
    const o = Math.floor(legal / BALLS_PER_OVER);
    const b = legal % BALLS_PER_OVER;
    return b ? o + '.' + b : String(o);
  }

  function allOutAt(config, W, side) {
    const lms = !!config.rules.lastManStands;
    const n = side.batters.length;
    return Math.max(1, Math.min(W + (lms ? 1 : 0), n - (lms ? 0 : 1)));
  }

  /**
   * Set batter confidence (0–100), tracked from the log. Middled / good contact and boundaries
   * build it; dots, beaten balls and edges knock it. CricketModel turns it into ±8% contact quality.
   */
  const CONFIDENCE = { start: 20, middle: 8, good: 4, boundary: 4, dot: -2, beaten: -8, edge: -12, min: 0, max: 100 };

  function confAfter(conf, raw, batRuns) {
    let d = 0;
    const band = raw.band || (raw.timing === 'perfect' ? 'good' : raw.timing === 'miss' ? 'beaten' : '');
    if (band === 'middle') d += CONFIDENCE.middle;
    else if (band === 'good') d += CONFIDENCE.good;
    else if (band === 'beaten') d += CONFIDENCE.beaten;
    if (raw.edged || raw.behind) d += CONFIDENCE.edge;
    if (batRuns >= 4) d += CONFIDENCE.boundary;
    else if (!batRuns && band !== 'beaten' && band !== 'left') d += CONFIDENCE.dot;
    return Math.max(CONFIDENCE.min, Math.min(CONFIDENCE.max, conf + d));
  }

  function newBatter(entry, order) {
    return { id: entry.id, pid: entry.pid, name: entry.name, order, r: 0, b: 0, f4: 0, f6: 0, dots: 0, out: null, conf: CONFIDENCE.start };
  }
  function newBowler(entry) {
    return { id: entry.id, pid: entry.pid, name: entry.name, legal: 0, r: 0, w: 0, md: 0, dots: 0, wd: 0, nb: 0 };
  }

  function startInnings(state, bat, opts) {
    const c = state.config;
    const o = opts || {};
    const side = c.sides[bat];
    const W = o.super ? c.superOver.wickets : c.wickets;
    const inn = {
      n: state.innings.length,
      bat,
      bowl: 1 - bat,
      super: !!o.super,
      overs: o.super ? c.superOver.overs : c.overs,
      wickets: W,
      limit: allOutAt(c, W, side),
      target: o.target || 0,
      runs: 0,
      wkts: 0,
      legal: 0,
      extras: { wd: 0, nb: 0, b: 0, lb: 0, pen: 0 },
      fours: 0,
      sixes: 0,
      dots: 0,
      batters: [],
      bowlers: [],
      striker: 0,
      nonStriker: -1,
      nextIn: 0,
      bowler: 0,
      freeHit: false,
      overList: [],
      fow: [],
      partnerships: [],
      worm: [{ legal: 0, runs: 0, w: 0 }],
      wagon: [],
      balls: [],
      reviews: { bat: c.rules.drs ? 1 : 0, bowl: c.rules.drs ? 1 : 0 },
      complete: false,
      end: '',
    };
    const bring = () => {
      const e = side.batters[inn.nextIn++];
      inn.batters.push(newBatter(e, inn.batters.length + 1));
      return inn.batters.length - 1;
    };
    inn.striker = bring();
    if (c.crease === 'pair' && side.batters.length > 1) inn.nonStriker = bring();
    inn.partnerships.push({ runs: 0, balls: 0, a: inn.batters[inn.striker].name, b: inn.nonStriker >= 0 ? inn.batters[inn.nonStriker].name : '' });
    inn.bowler = pickBowler(state, inn, 0, null);
    state.innings.push(inn);
    state.cur = inn.n;
    return inn;
  }

  /** Bowler for over k: rotates through the side; nobody bowls two overs in a row when there's a choice. */
  function pickBowler(state, inn, k, wantedId) {
    const list = state.config.sides[inn.bowl].bowlers;
    const prev = inn.overList.length ? inn.overList[inn.overList.length - 1].bowlerId : '';
    let entry = null;
    if (wantedId) {
      const w = list.find((b) => b.id === wantedId);
      if (w && (list.length < 2 || w.id !== prev)) entry = w;
    }
    if (!entry) entry = list[k % list.length];
    let idx = inn.bowlers.findIndex((b) => b.id === entry.id);
    if (idx < 0) {
      inn.bowlers.push(newBowler(entry));
      idx = inn.bowlers.length - 1;
    }
    return idx;
  }

  function currentOver(inn) {
    const k = Math.floor(inn.legal / BALLS_PER_OVER);
    let ov = inn.overList[inn.overList.length - 1];
    if (!ov || ov.n !== k) {
      ov = { n: k, bowlerId: inn.bowlers[inn.bowler].id, bowler: inn.bowlers[inn.bowler].name, runs: 0, bowlerRuns: 0, wkts: 0, legal: 0, balls: [] };
      inn.overList.push(ov);
    }
    return ov;
  }

  function tokenOf(extra, runs, out) {
    if (out) return { k: 'w', v: 'W' };
    if (extra === 'wd') return { k: 'wd', v: runs ? 1 + runs + 'Wd' : 'Wd' };
    if (extra === 'nb') return { k: 'nb', v: runs ? 'Nb+' + runs : 'Nb' };
    if (extra === 'b') return { k: 'b', v: runs + 'B' };
    if (extra === 'lb') return { k: 'lb', v: runs + 'Lb' };
    if (runs === 0) return { k: 'dot', v: '•' };
    return { k: runs === 4 ? 'four' : runs === 6 ? 'six' : 'run', v: String(runs) };
  }

  const DEL_LABEL = { medium: 'Medium', quick: 'Quick', flight: 'Flight', spin: 'Spin' };
  const SHOT_VERB = {
    defend: 'defended',
    push: 'pushed',
    loft: 'lofted',
    drive: 'driven',
    cut: 'cut',
    pull: 'pulled',
    sweep: 'swept',
    flick: 'flicked',
    leave: 'left alone',
  };
  const LENGTH_TEXT = { yorker: 'yorker', full: 'full', good: 'good length', short: 'short', bouncer: 'bouncer', fulltoss: 'full toss' };
  const VARIATION_TEXT = { slower: 'slower ball', cutter: 'cutter', turnIn: 'turning in', turnAway: 'turning away', armBall: 'arm ball' };
  const REVIEW_TEXT = { overturned: 'overturned', umpires_call: 'umpire’s call — decision stays', stands: 'decision stands' };

  /** "Pace, good length" · "Spin, arm ball, full" · legacy "Quick". */
  function deliveryLabel(ev) {
    if (ev.type === 'pace' || ev.type === 'spin') {
      const parts = [ev.type === 'pace' ? 'Pace' : 'Spin'];
      if (VARIATION_TEXT[ev.variation]) parts.push(VARIATION_TEXT[ev.variation]);
      if (LENGTH_TEXT[ev.length]) parts.push(LENGTH_TEXT[ev.length]);
      return parts.join(', ');
    }
    return DEL_LABEL[ev.del] || '';
  }
  function shotLabel(ev) {
    if (ev.timing === 'miss' && ev.shot && ev.shot !== 'leave') return 'beaten';
    return SHOT_VERB[ev.shot] || '';
  }

  function plural(n, w) {
    return n + ' ' + w + (n === 1 ? '' : 's');
  }

  /** Deterministic ball text: "2.3: Wide outside off, 1 extra". */
  function ballText(ev, info) {
    const del = deliveryLabel(ev);
    const shot = shotLabel(ev);
    const runs = info.runs;
    let s = '';
    if (info.extra === 'wd') {
      s = runs === 4 ? 'Wide, runs away for four more — 5 extras' : runs ? 'Wide, ' + plural(1 + runs, 'extra') : 'Wide outside off, 1 extra';
    } else if (info.extra === 'nb') {
      s = 'No-ball, 1 extra' + (runs ? ' + ' + (runs === 4 ? 'FOUR' : runs === 6 ? 'SIX' : plural(runs, 'run')) + ' off the bat' : '');
    } else if (info.extra === 'b' || info.extra === 'lb') {
      s = (del ? del + ', ' : '') + 'beaten — ' + plural(runs, info.extra === 'b' ? 'bye' : 'leg-bye');
    } else {
      const head = [del, shot].filter(Boolean).join(', ');
      if (info.out) s = head;
      else if (runs >= 4) s = (head ? head + ' — ' : '') + (runs === 6 ? 'SIX!' : 'FOUR!');
      else if (runs > 0) s = (head ? head + ' for ' : '') + plural(runs, 'run');
      else s = head ? head + ', no run' : 'no run';
    }
    if (info.tipRun) s += ' — tip and run';
    if (ev.appeal && !info.drs && !info.out && !info.saved) s += ev.appeal.kind === 'lbw' ? ' — LBW appeal, not out' : ' — caught-behind appeal, not out';
    if (info.drs) s += ' — review (' + (info.drs.by === 'bat' ? 'batter' : 'bowler') + '): ' + (REVIEW_TEXT[info.drs.result] || 'decision stands');
    if (info.out) {
      const lbl = dismissalLabel(info.out, info.rules);
      const extraRuns = RUNS_STAND[info.out] && runs ? ' (' + plural(runs, 'run') + ' completed)' : '';
      s = (s ? s + ' — ' : '') + 'OUT! ' + lbl + extraRuns;
    } else if (info.saved) {
      s += ' — ' + (SAVED_TEXT[info.saved] || 'not out');
    }
    if (info.freeHitNext) s += ' · free hit next';
    return info.no + ': ' + s;
  }

  function clampInt(v, lo, hi) {
    const n = Math.floor(Number(v) || 0);
    return Math.max(lo, Math.min(hi, n));
  }

  function applyBall(state, raw) {
    const c = state.config;
    const rules = c.rules;
    const inn = state.innings[state.cur];
    if (!inn || inn.complete || state.result) return false;
    const extra = raw.extra === 'wd' || raw.extra === 'nb' || raw.extra === 'b' || raw.extra === 'lb' ? raw.extra : '';
    let runs = clampInt(raw.runs, 0, extra === 'wd' ? 4 : 6);
    if ((extra === 'b' || extra === 'lb') && runs === 0) runs = 1;
    const striker = inn.batters[inn.striker];
    const firstBall = striker.b === 0 && extra !== 'wd';
    const wasFreeHit = inn.freeHit;
    let out = DISMISSALS[raw.out] ? raw.out : '';
    let saved = '';
    let tipRun = false;
    // Review: only on an appeal, only the aggrieved side, only while they have one left. An
    // invalid review is ignored and the on-field call stands. Lost only when the call stands.
    let drs = null;
    const appeal = raw.appeal && (raw.appeal.kind === 'lbw' || raw.appeal.kind === 'caught') ? raw.appeal : null;
    if (appeal) {
      const onFieldOut = appeal.onField === 'out' ? (appeal.kind === 'lbw' ? 'lbw' : 'caught') : '';
      const want = appeal.onField === 'out' ? 'bat' : 'bowl';
      const r = raw.drs;
      if (r && rules.drs && r.by === want && inn.reviews[want] > 0 && REVIEW_TEXT[r.result]) {
        drs = { by: want, result: r.result, decision: r.decision === 'out' ? 'out' : 'notout' };
        out = drs.decision === 'out' ? (appeal.kind === 'lbw' ? 'lbw' : 'caught') : '';
        if (drs.result === 'stands') inn.reviews[want] -= 1;
      } else out = onFieldOut;
    }
    if (out) {
      const chk = dismissalAllowed(out, { extra, freeHit: wasFreeHit, firstBall, rules });
      if (!chk.ok) {
        saved = chk.why;
        if (out === 'sixout') runs = 6;
        out = '';
      }
    }
    if (out && !RUNS_STAND[out]) runs = 0;
    if (!out && rules.tipAndRun && raw.contact && (extra === '' || extra === 'nb') && runs === 0) {
      runs = 1;
      tipRun = true;
    }
    const legalBefore = inn.legal;
    const ov = currentOver(inn);
    const bowler = inn.bowlers[inn.bowler];
    const legal = extra !== 'wd' && extra !== 'nb';
    let team = 0;
    let conceded = 0;
    if (extra === 'wd') {
      team = 1 + runs;
      inn.extras.wd += team;
      conceded = team;
      bowler.wd += 1;
    } else if (extra === 'nb') {
      team = 1 + runs;
      inn.extras.nb += 1;
      conceded = team;
      bowler.nb += 1;
      striker.r += runs;
      striker.b += 1;
    } else if (extra === 'b' || extra === 'lb') {
      team = runs;
      inn.extras[extra] += runs;
      striker.b += 1;
    } else {
      team = runs;
      conceded = runs;
      striker.r += runs;
      striker.b += 1;
    }
    const batRuns = extra === '' || extra === 'nb' ? runs : 0;
    if (batRuns === 4) {
      striker.f4 += 1;
      inn.fours += 1;
    } else if (batRuns === 6) {
      striker.f6 += 1;
      inn.sixes += 1;
    }
    bowler.r += conceded;
    inn.runs += team;
    ov.runs += team;
    ov.bowlerRuns += conceded;
    const part = inn.partnerships[inn.partnerships.length - 1];
    part.runs += team;
    if (legal) {
      inn.legal += 1;
      bowler.legal += 1;
      ov.legal += 1;
      part.balls += 1;
      if (team === 0) {
        inn.dots += 1;
        bowler.dots += 1;
      }
      if (batRuns === 0 && extra === '') striker.dots += 1;
    }
    // Free hit: set by a no-ball, carries over a wide, used up by any other ball.
    if (extra === 'nb') inn.freeHit = !!rules.freeHit;
    else if (extra !== 'wd') inn.freeHit = false;

    // Who is out (by id — strike may rotate below).
    let outId = '';
    if (out) {
      const nonOut = out === 'runout' && raw.outWho === 'nonstriker' && inn.nonStriker >= 0;
      outId = inn.batters[nonOut ? inn.nonStriker : inn.striker].id;
    }
    // Strike rotates on odd runs completed (boundaries are even; a wide counts the runs beyond the 1).
    if (inn.nonStriker >= 0 && runs % 2 === 1) {
      const t = inn.striker;
      inn.striker = inn.nonStriker;
      inn.nonStriker = t;
    }
    const token = tokenOf(extra, runs, out);
    ov.balls.push(token);
    if (out) {
      inn.wkts += 1;
      ov.wkts += 1;
      const outIdx = inn.batters.findIndex((b) => b.id === outId);
      const ob = inn.batters[outIdx];
      const credited = DISMISSALS[out].bowler;
      if (credited) bowler.w += 1;
      ob.out = { kind: out, label: dismissalLabel(out, rules), bowler: credited ? bowler.name : '' };
      inn.fow.push({ n: inn.wkts, score: inn.runs, over: overLabel(inn.legal), batter: ob.name, kind: out });
      const side = c.sides[inn.bat];
      const slot = outIdx === inn.striker ? 'striker' : 'nonStriker';
      if (inn.wkts < inn.limit && inn.nextIn < side.batters.length) {
        const e = side.batters[inn.nextIn++];
        inn.batters.push(newBatter(e, inn.batters.length + 1));
        inn[slot] = inn.batters.length - 1;
        // MCC 18.11: after a catch the new batter takes strike.
        if ((out === 'caught' || out === 'bouncecatch') && slot === 'nonStriker') {
          const t = inn.striker;
          inn.striker = inn.nonStriker;
          inn.nonStriker = t;
        }
      } else if (inn.wkts < inn.limit) {
        // Last man stands: the survivor bats alone.
        if (slot === 'striker') inn.striker = inn.nonStriker;
        inn.nonStriker = -1;
      }
      if (inn.wkts < inn.limit) {
        inn.partnerships.push({
          runs: 0,
          balls: 0,
          a: inn.batters[inn.striker].name,
          b: inn.nonStriker >= 0 ? inn.batters[inn.nonStriker].name : '',
        });
      }
    }
    const scoring = batRuns > 0 || out === 'caught' || out === 'bouncecatch' || out === 'sixout';
    if (scoring && raw.dir != null) {
      inn.wagon.push({ dir: Number(raw.dir) || 0, dist: Math.max(0.1, Math.min(1.25, Number(raw.dist) || 0.5)), runs: batRuns, out: out || '' });
    }
    inn.worm.push({ legal: inn.legal, runs: inn.runs, w: out ? 1 : 0 });
    const text = ballText(raw, {
      no: ballNumber(legalBefore),
      extra,
      runs,
      out,
      saved,
      tipRun,
      rules,
      drs,
      freeHitNext: inn.freeHit && extra === 'nb',
    });
    if (extra !== 'wd' && !striker.out) striker.conf = confAfter(striker.conf, raw, batRuns);
    inn.balls.push({
      no: ballNumber(legalBefore),
      over: Math.floor(legalBefore / BALLS_PER_OVER),
      text,
      token,
      team,
      extra,
      runs,
      out,
      saved,
      freeHit: wasFreeHit,
      striker: striker.name,
      bowler: bowler.name,
      del: raw.del || '',
      shot: raw.shot || '',
      timing: raw.timing || '',
      type: raw.type || '',
      line: raw.line || '',
      length: raw.length || '',
      variation: raw.variation || '',
      region: raw.region || '',
      band: raw.band || '',
      appeal: appeal ? appeal.kind : '',
      drs: drs ? drs.result : '',
      conf: striker.conf,
    });
    // Over complete: maiden, change ends, next bowler.
    if (legal && inn.legal % BALLS_PER_OVER === 0) {
      if (ov.legal === BALLS_PER_OVER && ov.bowlerRuns === 0) bowler.md += 1;
      if (inn.nonStriker >= 0) {
        const t = inn.striker;
        inn.striker = inn.nonStriker;
        inn.nonStriker = t;
      }
      inn.bowler = pickBowler(state, inn, inn.legal / BALLS_PER_OVER, raw.nextBowler || null);
    }
    checkEnd(state);
    return true;
  }

  function checkEnd(state) {
    const inn = state.innings[state.cur];
    if (!inn || inn.complete) return;
    if (inn.target && inn.runs >= inn.target) inn.end = 'target';
    else if (inn.wkts >= inn.limit) inn.end = 'allout';
    else if (inn.legal >= inn.overs * BALLS_PER_OVER) inn.end = 'overs';
    if (!inn.end) return;
    inn.complete = true;
    inn.freeHit = false;
    advance(state);
  }

  function boundaryCount(state, side) {
    return state.innings.filter((i) => !i.super && i.bat === side).reduce((n, i) => n + i.fours + i.sixes, 0);
  }

  function sideName(state, i) {
    return state.config.sides[i] ? state.config.sides[i].name : 'Side ' + (i + 1);
  }

  function winByChase(state, inn) {
    const w = inn.limit - inn.wkts;
    const b = inn.overs * BALLS_PER_OVER - inn.legal;
    return {
      kind: 'win',
      winner: inn.bat,
      by: 'wickets',
      wickets: w,
      balls: b,
      text: sideName(state, inn.bat) + ' won by ' + plural(w, 'wicket') + (b > 0 ? ' (' + plural(b, 'ball') + ' left)' : ' (off the last ball)'),
    };
  }
  function winByRuns(state, side, margin) {
    return { kind: 'win', winner: side, by: 'runs', runs: margin, text: sideName(state, side) + ' won by ' + plural(margin, 'run') };
  }

  function advance(state) {
    const c = state.config;
    const inn = state.innings[state.cur];
    const main = state.innings.filter((i) => !i.super);
    if (!inn.super) {
      if (c.innings === 1) {
        if (inn.runs >= inn.target) return finishWith(state, winByChase(state, inn));
        const margin = inn.target - 1 - inn.runs;
        if (margin === 0) return finishWith(state, { kind: 'tie', winner: -1, by: '', text: 'Scores level — match tied' });
        return finishWith(state, winByRuns(state, inn.bowl, margin));
      }
      if (main.length === 1) {
        startInnings(state, inn.bowl, { target: inn.runs + 1 });
        return;
      }
      const a = main[0];
      const b = main[1];
      if (b.runs >= b.target) return finishWith(state, winByChase(state, b));
      if (b.runs < a.runs) return finishWith(state, winByRuns(state, a.bat, a.runs - b.runs));
      return tieBreak(state, b.bat);
    }
    const supers = state.innings.filter((i) => i.super);
    if (supers.length % 2 === 1) {
      startInnings(state, inn.bowl, { super: true, target: inn.runs + 1 });
      return;
    }
    const first = supers[supers.length - 2];
    const second = supers[supers.length - 1];
    const tag = supers.length > 2 ? ' (after ' + supers.length / 2 + ' Super Overs)' : '';
    if (second.runs >= second.target) return finishWith(state, { kind: 'win', winner: second.bat, by: 'superover', text: 'Match tied · ' + sideName(state, second.bat) + ' won the Super Over' + tag });
    if (second.runs < first.runs) return finishWith(state, { kind: 'win', winner: first.bat, by: 'superover', text: 'Match tied · ' + sideName(state, first.bat) + ' won the Super Over' + tag });
    if (supers.length / 2 < MAX_SUPER_OVERS) {
      startInnings(state, second.bat, { super: true });
      return;
    }
    return boundaryDecider(state, 'Super Overs tied · ');
  }

  function boundaryDecider(state, prefix) {
    const b0 = boundaryCount(state, 0);
    const b1 = boundaryCount(state, 1);
    if (b0 === b1) return finishWith(state, { kind: 'tie', winner: -1, by: 'boundaries', text: prefix + 'Match tied (boundaries level ' + b0 + '–' + b1 + ')' });
    const w = b0 > b1 ? 0 : 1;
    return finishWith(state, {
      kind: 'win',
      winner: w,
      by: 'boundaries',
      text: prefix + sideName(state, w) + ' won on boundary count (' + Math.max(b0, b1) + '–' + Math.min(b0, b1) + ')',
    });
  }

  function tieBreak(state, chasingSide) {
    const mode = state.config.rules.tie;
    if (mode === 'superover') {
      startInnings(state, chasingSide, { super: true });
      return;
    }
    if (mode === 'boundaries') return boundaryDecider(state, 'Scores level · ');
    return finishWith(state, { kind: 'tie', winner: -1, by: '', text: 'Match tied' });
  }

  function finishWith(state, result) {
    state.result = result;
  }

  function applyEvent(state, ev) {
    if (!ev || state.result) return false;
    if (ev.t === 'ball') return applyBall(state, ev);
    if (ev.t === 'pen') {
      const inn = state.innings[state.cur];
      if (!inn || inn.complete) return false;
      const r = clampInt(ev.runs || 5, 1, 10);
      inn.runs += r;
      inn.extras.pen += r;
      inn.partnerships[inn.partnerships.length - 1].runs += r;
      inn.balls.push({ no: ballNumber(inn.legal), over: Math.floor(inn.legal / BALLS_PER_OVER), text: ballNumber(inn.legal) + ': ' + plural(r, 'penalty run') + ' to the batting side', token: { k: 'pen', v: 'P' + r }, team: r, extra: 'pen', runs: r, out: '' });
      inn.worm.push({ legal: inn.legal, runs: inn.runs, w: 0 });
      checkEnd(state);
      return true;
    }
    if (ev.t === 'end') {
      const inn = state.innings[state.cur];
      if (inn) inn.complete = true;
      if (ev.reason === 'forfeit' && (ev.winner === 0 || ev.winner === 1)) {
        finishWith(state, { kind: 'win', winner: ev.winner, by: 'forfeit', text: sideName(state, ev.winner) + ' won · ' + sideName(state, 1 - ev.winner) + ' forfeited' });
      } else {
        finishWith(state, { kind: 'noresult', winner: -1, by: '', text: 'Match abandoned · no result' });
      }
      return true;
    }
    return false;
  }

  /** Pure: (config, log) → state. Replaying the same log always yields the same state. */
  function replay(config, log) {
    const cfg = config && config.sides && config.rules ? config : createMatch(config);
    const state = { config: cfg, innings: [], cur: 0, result: null, applied: 0 };
    const target = cfg.innings === 1 ? cfg.target : 0;
    startInnings(state, cfg.battingFirst, { target });
    (log || []).forEach((ev) => {
      if (applyEvent(state, ev)) state.applied += 1;
    });
    return state;
  }

  // ---------------------------------------------------------------- queries

  function current(state) {
    return state.innings[state.cur];
  }
  function isOver(state) {
    return !!state.result;
  }
  function battingSide(state) {
    const i = current(state);
    return i ? i.bat : 0;
  }
  function striker(state) {
    const i = current(state);
    return i ? i.batters[i.striker] : null;
  }
  function bowlerNow(state) {
    const i = current(state);
    return i ? i.bowlers[i.bowler] : null;
  }
  function firstBallFor(state) {
    const s = striker(state);
    return !!s && s.b === 0;
  }

  function round(v, dp) {
    const k = Math.pow(10, dp);
    return Math.round(v * k) / k;
  }
  function strikeRate(r, b) {
    return b ? round((r * 100) / b, 1) : 0;
  }
  function economy(r, legal) {
    return legal ? round((r * BALLS_PER_OVER) / legal, 2) : 0;
  }
  function runRate(runs, legal) {
    return legal ? round((runs * BALLS_PER_OVER) / legal, 2) : 0;
  }
  function requiredRate(inn) {
    if (!inn || !inn.target) return 0;
    const need = Math.max(0, inn.target - inn.runs);
    const left = inn.overs * BALLS_PER_OVER - inn.legal;
    return left > 0 ? round((need * BALLS_PER_OVER) / left, 2) : need > 0 ? Infinity : 0;
  }
  function projected(inn) {
    if (!inn || !inn.legal) return 0;
    return Math.round((inn.runs / inn.legal) * inn.overs * BALLS_PER_OVER);
  }

  /** Compact live strip: score, overs, RR, target, RRR, balls left, this over. */
  function liveStrip(state) {
    const inn = current(state);
    if (!inn) return null;
    const ballsLeft = inn.overs * BALLS_PER_OVER - inn.legal;
    const s = inn.batters[inn.striker];
    const ns = inn.nonStriker >= 0 ? inn.batters[inn.nonStriker] : null;
    const b = inn.bowlers[inn.bowler];
    return {
      innings: inn.n,
      super: inn.super,
      batting: sideName(state, inn.bat),
      bowling: sideName(state, inn.bowl),
      bat: inn.bat,
      runs: inn.runs,
      wkts: inn.wkts,
      limit: inn.limit,
      overs: oversText(inn.legal),
      maxOvers: inn.overs,
      rr: runRate(inn.runs, inn.legal),
      target: inn.target,
      need: inn.target ? Math.max(0, inn.target - inn.runs) : 0,
      ballsLeft,
      rrr: inn.target ? requiredRate(inn) : 0,
      projected: inn.target ? 0 : projected(inn),
      freeHit: inn.freeHit,
      reviews: { bat: inn.reviews.bat, bowl: inn.reviews.bowl },
      pitch: state.config.pitch || '',
      striker: s ? { name: s.name, r: s.r, b: s.b, conf: s.conf } : null,
      nonStriker: ns ? { name: ns.name, r: ns.r, b: ns.b } : null,
      bowler: b ? { name: b.name, figures: b.w + '-' + b.r, overs: oversText(b.legal) } : null,
      thisOver: thisOver(state),
    };
  }

  /** Tokens for the over in progress (the finished over until the next ball is bowled). */
  function thisOver(state) {
    const inn = current(state);
    if (!inn || !inn.overList.length) return [];
    return inn.overList[inn.overList.length - 1].balls.slice();
  }

  function inningsCard(state, inn) {
    const side = state.config.sides[inn.bat];
    const batting = inn.batters.map((b) => ({
      name: b.name,
      pid: b.pid,
      how: b.out ? howOut(b.out) : 'not out',
      out: !!b.out,
      r: b.r,
      b: b.b,
      f4: b.f4,
      f6: b.f6,
      sr: strikeRate(b.r, b.b),
    }));
    const yetToBat = side.batters.slice(inn.nextIn, Math.max(inn.nextIn, inn.limit + 1)).map((b) => b.name);
    const bowling = inn.bowlers.map((b) => ({
      name: b.name,
      pid: b.pid,
      o: oversText(b.legal),
      m: b.md,
      r: b.r,
      w: b.w,
      econ: economy(b.r, b.legal),
      dots: b.dots,
      wd: b.wd,
      nb: b.nb,
    }));
    const ex = inn.extras;
    const extrasTotal = ex.wd + ex.nb + ex.b + ex.lb + ex.pen;
    const batRuns = inn.batters.reduce((n, b) => n + b.r, 0);
    return {
      n: inn.n,
      super: inn.super,
      title: (inn.super ? 'Super Over · ' : '') + sideName(state, inn.bat),
      batting,
      yetToBat: inn.complete ? [] : yetToBat.slice(0, 3),
      bowling,
      extras: Object.assign({ total: extrasTotal }, ex),
      total: { runs: inn.runs, wkts: inn.wkts, overs: oversText(inn.legal), maxOvers: inn.overs, allOut: inn.end === 'allout' },
      fow: inn.fow.map((f) => ({ n: f.n, score: f.score, over: f.over, batter: f.batter, text: f.n + '-' + f.score + ' (' + f.batter + ', ' + f.over + ' ov)' })),
      partnerships: inn.partnerships.filter((p) => p.balls > 0 || p.runs > 0).map((p) => ({ runs: p.runs, balls: p.balls, a: p.a, b: p.b })),
      rr: runRate(inn.runs, inn.legal),
      rrr: inn.target && !inn.complete ? requiredRate(inn) : 0,
      target: inn.target,
      projected: !inn.target && !inn.complete ? projected(inn) : 0,
      boundaryPct: inn.runs ? round(((inn.fours * 4 + inn.sixes * 6) * 100) / inn.runs, 1) : 0,
      dotPct: inn.legal ? round((inn.dots * 100) / inn.legal, 1) : 0,
      batRuns,
      end: inn.end,
    };
  }

  function howOut(o) {
    if (o.kind === 'runout') return 'run out';
    if (o.kind === 'caught' || o.kind === 'bouncecatch') return (o.kind === 'bouncecatch' ? o.label.toLowerCase() : 'c') + ' b ' + o.bowler;
    if (o.kind === 'lbw') return 'lbw b ' + o.bowler;
    if (o.kind === 'stumped') return 'st b ' + o.bowler;
    if (o.kind === 'hitwicket') return 'hit wicket b ' + o.bowler;
    if (o.kind === 'sixout') return 'six and out b ' + o.bowler;
    return 'b ' + o.bowler;
  }

  function scorecard(state) {
    return {
      source: RULESET,
      format: FORMATS[state.config.format] ? FORMATS[state.config.format].label : '',
      preset: PRESETS[state.config.rules.preset] ? PRESETS[state.config.rules.preset].label : 'Custom',
      innings: state.innings.map((i) => inningsCard(state, i)),
      result: state.result ? state.result.text : '',
      resultInfo: state.result,
    };
  }

  function timeline(state) {
    const out = [];
    state.innings.forEach((inn) => {
      out.push({ head: true, text: (inn.super ? 'Super Over · ' : inn.n === 0 ? '1st innings · ' : '2nd innings · ') + sideName(state, inn.bat) });
      inn.balls.forEach((b) => out.push({ inn: inn.n, no: b.no, text: b.text, token: b.token }));
    });
    return out;
  }

  function charts(state) {
    const main = state.innings.filter((i) => !i.super);
    return {
      worm: main.map((i) => ({ side: i.bat, name: sideName(state, i.bat), points: i.worm.map((p) => [p.legal, p.runs, p.w]), overs: i.overs })),
      manhattan: main.map((i) => ({ side: i.bat, name: sideName(state, i.bat), overs: i.overList.map((o) => ({ n: o.n + 1, runs: o.runs, wkts: o.wkts })), maxOvers: i.overs })),
      wagon: main.map((i) => ({ side: i.bat, name: sideName(state, i.bat), shots: i.wagon.slice() })),
    };
  }

  /** Best all-round contribution: runs + 20 per wicket (ties → fewer balls). Grouped by player. */
  function topPerformer(state) {
    const byPid = {};
    const get = (pid, name) => (byPid[pid] = byPid[pid] || { pid, name: String(name).replace(/ \(\d+\)$/, ''), r: 0, b: 0, w: 0, conceded: 0, legal: 0 });
    state.innings.forEach((inn) => {
      inn.batters.forEach((b) => {
        const p = get(b.pid, b.name);
        p.r += b.r;
        p.b += b.b;
      });
      inn.bowlers.forEach((b) => {
        const p = get(b.pid, b.name);
        p.w += b.w;
        p.conceded += b.r;
        p.legal += b.legal;
      });
    });
    const list = Object.values(byPid);
    if (!list.length) return null;
    list.sort((x, y) => y.r + 20 * y.w - (x.r + 20 * x.w) || x.b - y.b || x.conceded - y.conceded);
    const t = list[0];
    const bits = [];
    if (t.r || t.b) bits.push(t.r + ' (' + t.b + ')');
    if (t.w || t.legal) bits.push(t.w + '/' + t.conceded);
    return { pid: t.pid, name: t.name, line: t.name + ' · ' + bits.join(' & ') };
  }

  function shareSummary(state) {
    const lines = state.innings
      .filter((i) => !i.super)
      .map((i) => sideName(state, i.bat) + ' ' + i.runs + '/' + i.wkts + ' (' + oversText(i.legal) + ' ov)');
    const top = topPerformer(state);
    return {
      lines,
      result: state.result ? state.result.text : '',
      top: top ? top.line : '',
      text: ['Street Cricket'].concat(lines, state.result ? [state.result.text] : [], top ? ['Top performer: ' + top.line] : []).join('\n'),
    };
  }

  // ---------------------------------------------------------------- gameplay layer (P11 tunes)

  function mulberry32(a) {
    let s = a >>> 0;
    return function () {
      let t = (s += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const SHOTS = {
    defend: { id: 'defend', label: 'Defend' },
    push: { id: 'push', label: 'Push' },
    loft: { id: 'loft', label: 'Loft' },
  };

  /** Delivery feel is unchanged from the timing game; wideP / noBallP are the new extras hooks. */
  const DELIVERIES = {
    medium: { id: 'medium', label: 'Medium', family: 'pace', runupMs: 420, flightMs: 1000, zoneStart: 0.4, zoneEnd: 0.68, lateEnd: 0.94, path: 'straight', accent: '#81C784', mistimeHint: 'Mistimed the ball', wideP: 0.035, noBallP: 0.02 },
    quick: { id: 'quick', label: 'Quick', family: 'pace', runupMs: 260, flightMs: 700, zoneStart: 0.5, zoneEnd: 0.64, lateEnd: 0.9, path: 'skiddy', accent: '#EF5350', mistimeHint: 'Beaten for pace', wideP: 0.05, noBallP: 0.04 },
    flight: { id: 'flight', label: 'Flight', family: 'length', runupMs: 560, flightMs: 1280, zoneStart: 0.5, zoneEnd: 0.78, lateEnd: 0.96, path: 'loopy', accent: '#42A5F5', mistimeHint: 'Through the flight', wideP: 0.03, noBallP: 0.015 },
    spin: { id: 'spin', label: 'Spin', family: 'spin', runupMs: 500, flightMs: 1120, zoneStart: 0.46, zoneEnd: 0.72, lateEnd: 0.95, path: 'curve', accent: '#AB47BC', mistimeHint: 'Turned past the bat', wideP: 0.045, noBallP: 0.015 },
  };
  const DELIVERY_ORDER = ['medium', 'quick', 'flight', 'spin'];

  /** Probability hooks for the dismissals the old model never produced. */
  const TUNE = {
    fourWides: 0.06,
    stumpedOffWide: 0.3,
    hitWicketLate: 0.015,
    runOut: 0.03,
    runOutTipRun: 0.15,
    savedBye: 0.35,
    bounceCatch: { onehand: 0.35, bounce: 0.3 },
  };

  function deliveryById(id) {
    return DELIVERIES[id] || DELIVERIES.medium;
  }
  function durationMs(id) {
    const d = deliveryById(id);
    return d.runupMs + d.flightMs;
  }
  /** progress = share of the flight elapsed (0 = release, 1 = at the stumps). */
  function classifyTiming(delivery, progress) {
    const d = typeof delivery === 'string' ? deliveryById(delivery) : delivery || DELIVERIES.medium;
    if (progress < d.zoneStart) return 'early';
    if (progress <= d.zoneEnd) return 'perfect';
    if (progress <= d.lateEnd) return 'late';
    return 'miss';
  }
  /** Tap time in ms since the run-up started → timing bucket (null tap = no shot = miss). */
  function timingFromOffset(deliveryId, tMs) {
    if (tMs == null || !isFinite(Number(tMs))) return 'miss';
    const d = deliveryById(deliveryId);
    const p = (Number(tMs) - d.runupMs) / d.flightMs;
    if (p < 0) return 'early';
    return classifyTiming(d, p);
  }

  function pickWeighted(entries, roll) {
    let acc = 0;
    for (let i = 0; i < entries.length; i++) {
      acc += entries[i][0];
      if (roll < acc) return entries[i][1];
    }
    return entries[entries.length - 1][1];
  }

  /**
   * The timing game's weighted resolver, migrated verbatim (roll injected so it is seeded).
   * timing × shot × delivery → { runs, out, reason, code }.
   */
  function resolveStreetBall(delivery, timing, shotId, roll) {
    const del = delivery || DELIVERIES.medium;
    const shot = SHOTS[shotId] || SHOTS.push;
    const out = (reason, code) => ({ runs: 0, out: true, reason, code });
    const ok = (runsVal, reason, code) => ({ runs: runsVal, out: false, reason, code });

    if (timing === 'miss') return out('beaten', 'miss_window');

    if (shot.id === 'defend') {
      if (timing === 'perfect') {
        if (roll < 0.03) return out('caught', 'defend_perfect_catch');
        const runsVal = pickWeighted([[0.45, 0], [0.45, 1], [0.1, 2]], (roll - 0.03) / 0.97);
        return ok(runsVal, runsVal === 0 ? 'dot' : 'nudge', 'defend_perfect');
      }
      if (timing === 'early') {
        const outP = del.id === 'quick' ? 0.18 : del.id === 'spin' ? 0.22 : 0.14;
        if (roll < outP) return out('edge', 'defend_early_edge');
        return ok(roll < outP + 0.55 ? 0 : 1, 'nudge', 'defend_early');
      }
      const lateOut = del.id === 'quick' ? 0.22 : 0.16;
      if (roll < lateOut) return out('bowled', 'defend_late_bowled');
      return ok(0, 'dot', 'defend_late');
    }

    if (shot.id === 'push') {
      if (timing === 'perfect') {
        if (roll < 0.05) return out('caught', 'push_perfect_catch');
        const runsVal = pickWeighted([[0.12, 0], [0.48, 1], [0.28, 2], [0.12, 4]], (roll - 0.05) / 0.95);
        return ok(runsVal, runsVal >= 4 ? 'boundary' : 'push', 'push_perfect');
      }
      if (timing === 'early') {
        const outP = del.id === 'quick' ? 0.38 : 0.28;
        if (roll < outP) return out('edge', 'push_early_edge');
        return ok(roll < outP + 0.5 ? 1 : 0, 'nudge', 'push_early');
      }
      const lateOut = del.id === 'spin' ? 0.36 : del.id === 'quick' ? 0.4 : 0.3;
      if (roll < lateOut) return out(del.id === 'quick' ? 'beaten' : 'bowled', 'push_late_out');
      return ok(1, 'push', 'push_late');
    }

    if (timing === 'perfect') {
      let catchP = 0.1;
      if (del.id === 'quick') catchP = 0.16;
      else if (del.id === 'flight') catchP = 0.07;
      else if (del.id === 'spin') catchP = 0.12;
      if (roll < catchP) return out('caught', 'loft_perfect_catch');
      const r2 = (roll - catchP) / (1 - catchP);
      let weights;
      if (del.id === 'flight') weights = [[0.08, 1], [0.12, 2], [0.4, 4], [0.4, 6]];
      else if (del.id === 'quick') weights = [[0.18, 1], [0.22, 2], [0.35, 4], [0.25, 6]];
      else weights = [[0.12, 1], [0.18, 2], [0.38, 4], [0.32, 6]];
      const runsVal = pickWeighted(weights, r2);
      return ok(runsVal, runsVal >= 4 ? 'boundary' : 'loft', 'loft_perfect');
    }
    if (timing === 'early') {
      let outP = 0.55;
      if (del.id === 'quick') outP = 0.72;
      else if (del.id === 'spin') outP = 0.62;
      else if (del.id === 'flight') outP = 0.48;
      if (roll < outP) return out('caught', 'loft_early_catch');
      return ok(roll < outP + 0.25 ? 1 : 2, 'loft', 'loft_early_survive');
    }
    let lateOut = 0.52;
    if (del.id === 'quick') lateOut = 0.62;
    else if (del.id === 'spin') lateOut = 0.58;
    if (roll < lateOut) return out(roll < lateOut * 0.55 ? 'bowled' : 'caught', 'loft_late_out');
    return ok(1, 'loft', 'loft_late_survive');
  }

  /** The old model's out reasons → a dismissal kind (a miss depends on the delivery). */
  function dismissalFor(res, del) {
    if (res.code === 'miss_window') return del.id === 'spin' ? 'stumped' : del.id === 'flight' ? 'lbw' : 'bowled';
    if (res.reason === 'beaten') return 'lbw';
    if (res.reason === 'edge' || res.reason === 'caught') return 'caught';
    return 'bowled';
  }

  function wagonSpot(shot, timing, runs, rng) {
    let dir;
    if (timing === 'early') dir = -55 + (rng() - 0.5) * 70;
    else if (timing === 'late') dir = 80 + (rng() - 0.5) * 80;
    else if (shot === 'loft') dir = (rng() - 0.5) * 60;
    else if (shot === 'push') dir = 20 + (rng() - 0.5) * 80;
    else dir = (rng() - 0.5) * 50;
    const dist = runs >= 6 ? 1.15 : runs >= 4 ? 1 : runs === 3 ? 0.78 : runs === 2 ? 0.62 : runs === 1 ? 0.4 : 0.25;
    return { dir: Math.round(dir), dist };
  }

  /**
   * Seeded gameplay hook: delivery + shot + timing → a proposed ball event. The law layer decides
   * whether a proposed dismissal stands (ctx lets the hook pick realistic byes when it can't).
   * @param {{ delivery, shot, timing, rules?, freeHit?, firstBall? }} input
   */
  function resolveBall(input, seed) {
    const i = input || {};
    const rng = mulberry32(seed >>> 0);
    const del = deliveryById(i.delivery);
    const shot = SHOTS[i.shot] ? i.shot : 'push';
    const timing = ['early', 'perfect', 'late', 'miss'].indexOf(i.timing) >= 0 ? i.timing : 'miss';
    const rules = Object.assign({}, BASE_RULES, i.rules || {});
    const base = { t: 'ball', del: del.id, shot, timing, contact: timing !== 'miss', seed: seed >>> 0 };
    const x = rng();
    if (x < del.wideP) {
      const ev = Object.assign(base, { extra: 'wd', runs: rng() < TUNE.fourWides ? 4 : 0, out: '', contact: false, code: 'wide' });
      if (shot === 'loft' && timing === 'early' && (del.id === 'spin' || del.id === 'flight') && rng() < TUNE.stumpedOffWide) {
        ev.out = 'stumped';
        ev.runs = 0;
        ev.code = 'wide_stumped';
      }
      return ev;
    }
    const noBall = x < del.wideP + del.noBallP;
    const res = resolveStreetBall(del, timing, shot, rng());
    let runs = res.runs;
    let out = res.out ? dismissalFor(res, del) : '';
    let extra = noBall ? 'nb' : '';
    let code = res.code;
    if (!out && timing === 'late' && shot === 'defend' && del.family === 'pace' && rng() < TUNE.hitWicketLate) {
      out = 'hitwicket';
      code = 'hit_wicket';
    }
    if (!out && rules.bounceCatch && runs <= 2 && (code === 'loft_early_survive' || code === 'push_early' || code === 'defend_early') && rng() < (TUNE.bounceCatch[rules.bounceCatch] || 0.3)) {
      out = 'bouncecatch';
      runs = 0;
      code = 'bounce_catch';
    }
    if (!out && rules.sixOut && runs === 6) {
      out = 'sixout';
      code = 'six_and_out';
    }
    if (!out && timing !== 'miss') {
      const forced = rules.tipAndRun && runs === 0;
      if ((forced || ((runs === 1 || runs === 2) && shot !== 'loft')) && rng() < (forced ? TUNE.runOutTipRun : TUNE.runOut)) {
        out = 'runout';
        runs = forced ? 0 : runs - 1;
        code = forced ? 'tip_run_out' : 'run_out';
      }
    }
    // A miss the law won't give out (no LBW, free hit, first ball) can still run a bye.
    if (out && timing === 'miss' && !noBall) {
      const chk = dismissalAllowed(out, { extra: '', freeHit: !!i.freeHit, firstBall: !!i.firstBall, rules });
      if (!chk.ok && rng() < TUNE.savedBye) {
        extra = del.family === 'pace' ? 'b' : 'lb';
        runs = 1;
        code = 'saved_' + extra;
      }
    }
    const spot = wagonSpot(shot, timing, runs, rng);
    return Object.assign(base, { extra, runs, out, code, dir: spot.dir, dist: spot.dist });
  }

  /** AI bowler: the timing game's format-aware bag (the long formats use the Over bag). */
  function aiDelivery(ctx, seed) {
    const c = ctx || {};
    const rnd = mulberry32((seed >>> 0) + (c.balls || 0) * 97 + 13);
    const r = rnd();
    const balls = (c.balls || 0) % BALLS_PER_OVER;
    let pool;
    if (c.chase) {
      if (balls <= 1) pool = r < 0.5 ? ['medium', 'flight', 'medium'] : ['medium', 'quick', 'flight'];
      else if (balls <= 3) pool = r < 0.35 ? ['quick', 'medium', 'flight'] : r < 0.7 ? ['spin', 'flight', 'medium'] : ['quick', 'spin', 'flight'];
      else pool = r < 0.4 ? ['quick', 'spin', 'flight'] : r < 0.7 ? ['spin', 'quick', 'medium'] : ['flight', 'quick', 'spin'];
    } else if (balls <= 1) {
      pool = r < 0.55 ? ['medium', 'medium', 'flight'] : r < 0.85 ? ['medium', 'flight', 'spin'] : ['medium', 'quick', 'flight'];
    } else if (balls <= 3) {
      pool = r < 0.35 ? ['medium', 'flight', 'spin'] : r < 0.7 ? ['quick', 'medium', 'flight'] : ['spin', 'flight', 'medium'];
    } else {
      pool = r < 0.3 ? ['quick', 'spin', 'flight'] : r < 0.6 ? ['spin', 'quick', 'medium'] : ['flight', 'quick', 'spin'];
    }
    let id = pool[Math.floor(rnd() * pool.length)] || 'medium';
    if (id === c.last && (c.streak || 0) >= 1 && (id === 'quick' || id === 'spin')) id = pool.find((p) => p === 'medium' || p === 'flight') || 'medium';
    return id;
  }

  /** AI batter: picks a shot for the situation, then a timing bucket by level. */
  function aiBat(ctx, seed) {
    const c = ctx || {};
    const rng = mulberry32((seed >>> 0) ^ 0x9e3779b9);
    const level = c.level === 'easy' ? 0 : c.level === 'hard' ? 2 : 1;
    const rrr = Number(c.rrr) || 0;
    const r = rng();
    let shot;
    if (c.lastWicket && rrr < 8) shot = r < 0.45 ? 'defend' : r < 0.9 ? 'push' : 'loft';
    else if (rrr > 12) shot = r < 0.7 ? 'loft' : 'push';
    else if (rrr > 7) shot = r < 0.45 ? 'loft' : r < 0.9 ? 'push' : 'defend';
    else shot = r < 0.18 ? 'loft' : r < 0.8 ? 'push' : 'defend';
    const p = [[0.66, 0.13, 0.15, 0.06], [0.8, 0.08, 0.09, 0.03], [0.88, 0.05, 0.06, 0.01]][level];
    const del = deliveryById(c.delivery);
    const hard = del.id === 'quick' ? 0.08 : del.id === 'spin' ? 0.04 : 0;
    const t = rng();
    const perfect = p[0] - hard;
    const timing = t < perfect ? 'perfect' : t < perfect + p[1] ? 'early' : t < perfect + p[1] + p[2] + hard ? 'late' : 'miss';
    return { shot, timing };
  }

  function chaseTarget(formatId, seed) {
    const band = CHASE_BANDS[normFormat(formatId)];
    const r = mulberry32((seed >>> 0) + 41)();
    return band[0] + Math.floor(r * (band[1] - band[0] + 1));
  }

  return {
    RULESET,
    BALLS_PER_OVER,
    MAX_SUPER_OVERS,
    FORMATS,
    FORMAT_ORDER,
    TIE_MODES,
    PRESETS,
    PRESET_ORDER,
    TOGGLE_LABELS,
    DISMISSALS,
    SHOTS,
    DELIVERIES,
    DELIVERY_ORDER,
    TUNE,
    normFormat,
    normPreset,
    normTie,
    makeRules,
    lawsTable,
    dismissalAllowed,
    dismissalLabel,
    soloSide,
    createMatch,
    liveConfig,
    replay,
    applyEvent,
    current,
    isOver,
    battingSide,
    striker,
    bowlerNow,
    firstBallFor,
    overLabel,
    oversText,
    strikeRate,
    economy,
    runRate,
    requiredRate,
    projected,
    liveStrip,
    thisOver,
    scorecard,
    timeline,
    charts,
    topPerformer,
    shareSummary,
    mulberry32,
    deliveryById,
    durationMs,
    classifyTiming,
    timingFromOffset,
    resolveStreetBall,
    resolveBall,
    aiDelivery,
    aiBat,
    chaseTarget,
    CONFIDENCE,
    confAfter,
    deliveryLabel,
    PITCH_IDS,
  };
});
