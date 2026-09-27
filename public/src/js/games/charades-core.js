/**
 * Dumb Charades — pure game logic shared by Pass & Play (client) and Room (server-lib/party-deal.js).
 * The deck and the title being acted live in `hidden`; `pub` only gets a title once it is guessed,
 * passed or the turn ends. UMD: window.CharadesCore / require().
 */
(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const PC = node ? require('./party-core.js') : root.PartyCore;
  const PACKS = node ? require('../data/charades-packs.js') : root.CHARADES_PACKS;
  const api = factory(PC, PACKS);
  if (node) module.exports = api;
  else root.CharadesCore = api;
})(typeof self !== 'undefined' ? self : this, function (PC, PACKS) {
  'use strict';

  const MIN_PLAYERS = 4;
  const MAX_PLAYERS = 16;
  const MIN_PER_TEAM = 2;
  const SAFETY_TURNS = 30;

  const DEFAULT_SETTINGS = {
    turnSec: 90,
    passes: 1,
    speed: false,
    goal: 'turns',
    turnsPerTeam: 3,
    targetPoints: 5,
    categories: null,
    difficulty: 'all',
    teamNames: null,
  };
  const TURN_SEC = [60, 90, 120];
  const TURNS_PER_TEAM = [2, 3, 4, 5, 6];
  const TARGETS = [3, 5, 7, 10];
  const DIFFICULTY = ['all', 'easy', 'medium', 'hard'];
  const TEAM_NAMES = ['Team A', 'Team B'];

  /** Gesture cheat sheet (how-to + the actor's in-game peek). */
  const GESTURES = [
    { icon: '🖐️', en: 'Number of words', how: 'Hold up that many fingers' },
    { icon: '☝️', en: 'Which word', how: 'Hold up fingers again for the word you’re acting' },
    { icon: '💪', en: 'Syllables', how: 'Lay fingers on your forearm' },
    { icon: '👂', en: 'Sounds like', how: 'Tug your ear' },
    { icon: '🎥', en: 'Movie', how: 'Crank an old film camera' },
    { icon: '🎵', en: 'Song', how: 'Pretend to sing' },
    { icon: '📺', en: 'TV show', how: 'Draw a box in the air' },
    { icon: '📖', en: 'Book', how: 'Open your palms like a book' },
    { icon: '⭕', en: 'Whole title', how: 'Sweep a big circle with your arms' },
  ];

  function mergeSettings(s) {
    const src = s || {};
    const out = Object.assign({}, DEFAULT_SETTINGS);
    const num = (v) => Number(v);
    if (TURN_SEC.indexOf(num(src.turnSec)) >= 0) out.turnSec = num(src.turnSec);
    if (Number.isInteger(num(src.passes)) && num(src.passes) >= 0 && num(src.passes) <= 3) out.passes = num(src.passes);
    out.speed = src.speed === true || src.speed === 'true';
    if (src.goal === 'points' || src.goal === 'turns') out.goal = src.goal;
    if (TURNS_PER_TEAM.indexOf(num(src.turnsPerTeam)) >= 0) out.turnsPerTeam = num(src.turnsPerTeam);
    if (TARGETS.indexOf(num(src.targetPoints)) >= 0) out.targetPoints = num(src.targetPoints);
    if (Array.isArray(src.categories)) {
      const ids = src.categories.filter((id) => PACKS.getPack(id));
      out.categories = ids.length ? ids.filter((id, i) => ids.indexOf(id) === i) : null;
    }
    if (DIFFICULTY.indexOf(src.difficulty) >= 0) out.difficulty = src.difficulty;
    if (Array.isArray(src.teamNames) && src.teamNames.length === 2) {
      out.teamNames = src.teamNames.map((n, i) => String(n || '').replace(/[<>]/g, '').trim().slice(0, 20) || TEAM_NAMES[i]);
    }
    return out;
  }

  function teamName(settings, i) {
    const names = (settings && settings.teamNames) || TEAM_NAMES;
    return names[i] || TEAM_NAMES[i];
  }

  /** Shuffle into two teams whose sizes differ by at most one. */
  function balanceTeams(ids, rng) {
    const order = PC.shuffle(ids, rng);
    const teams = [[], []];
    order.forEach((id, i) => teams[i % 2].push(id));
    return teams;
  }

  function validTeams(teams) {
    return Array.isArray(teams) && teams.length === 2 && teams.every((t) => Array.isArray(t) && t.length >= MIN_PER_TEAM);
  }

  /**
   * Title keys for the chosen categories + difficulty (falls back to every difficulty if too few).
   * India-specific titles inside global packs join only for Hindi locales or when a regional pack is picked.
   */
  function pool(settings, lang) {
    const s = mergeSettings(settings);
    const cats = s.categories || PACKS.defaultCategories(lang);
    const regionalOk = String(lang || '').indexOf('hi') === 0 || cats.some((id) => (PACKS.getPack(id) || {}).regional);
    const all = [];
    cats.forEach((id) => {
      const p = PACKS.getPack(id);
      if (p) p.titles.forEach((t) => (regionalOk || !t.regional) && all.push(t));
    });
    const filtered = s.difficulty === 'all' ? all : all.filter((t) => t.difficulty === s.difficulty);
    return (filtered.length >= 10 ? filtered : all).map((t) => t.key);
  }

  function titleOf(key) {
    return key ? PACKS.byKey(key) : null;
  }

  /** Public copy of a title once it may be shown to everyone. */
  function reveal(key) {
    const t = titleOf(key);
    return t ? { key: t.key, en: t.en, hi: t.hi, pack: t.pack, kind: t.kind, difficulty: t.difficulty } : null;
  }

  function matchTitle(text, key) {
    const t = titleOf(key);
    if (!t) return false;
    return PC.fuzzyMatch(text, [t.en, t.hi].concat(t.alts || []));
  }

  function draw(hidden) {
    if (!hidden.deck.length) return null;
    if (hidden.pos >= hidden.deck.length) hidden.pos = 0;
    hidden.current = hidden.deck[hidden.pos];
    hidden.pos += 1;
    return hidden.current;
  }

  /**
   * New game. `teams` = [[ids], [ids]].
   * @returns {{ settings, pub, hidden }}
   */
  function createGame(teams, settings, opts) {
    const o = opts || {};
    if (!validTeams(teams)) throw new Error('teams');
    const s = mergeSettings(settings);
    const hidden = { deck: PC.shuffle(pool(s, o.lang), o.rng), pos: 0, current: null };
    const pub = {
      phase: 'ready',
      teams: [teams[0].slice(), teams[1].slice()],
      teamScores: [0, 0],
      team: 0,
      actorIdx: [0, 0],
      actor: teams[0][0],
      turnNo: 1,
      passesLeft: s.passes,
      turnsTaken: [0, 0],
      turnGot: [],
      turnPassed: [],
      lastTurn: null,
      actorPoints: {},
      guessHits: {},
      winner: null,
      mvp: null,
    };
    draw(hidden);
    return { settings: s, pub, hidden };
  }

  function teamOf(pub, id) {
    if (pub.teams[0].indexOf(id) >= 0) return 0;
    if (pub.teams[1].indexOf(id) >= 0) return 1;
    return -1;
  }

  function isOver(pub, s) {
    const [a, b] = pub.turnsTaken;
    if (Math.min(a, b) >= SAFETY_TURNS) return true;
    if (s.goal === 'turns') return a >= s.turnsPerTeam && b >= s.turnsPerTeam;
    const [x, y] = pub.teamScores;
    return a === b && Math.max(x, y) >= s.targetPoints && x !== y;
  }

  function pickMvp(pub) {
    const ids = Object.keys(pub.actorPoints).concat(Object.keys(pub.guessHits));
    let best = null;
    let bestScore = 0;
    ids.forEach((id) => {
      const sc = (pub.actorPoints[id] || 0) * 2 + (pub.guessHits[id] || 0);
      if (sc > bestScore) {
        best = id;
        bestScore = sc;
      }
    });
    return best;
  }

  function endTurn(pub, hidden, s, reason) {
    pub.lastTurn = {
      team: pub.team,
      actor: pub.actor,
      got: pub.turnGot.slice(),
      passed: pub.turnPassed.slice(),
      missed: reason === 'time' || reason === 'left' ? reveal(hidden.current) : null,
      points: pub.turnGot.length,
      reason,
    };
    hidden.current = null;
    pub.turnsTaken[pub.team] += 1;
    pub.actorIdx[pub.team] += 1;
    if (isOver(pub, s)) {
      pub.phase = 'over';
      const [x, y] = pub.teamScores;
      pub.winner = x === y ? -1 : x > y ? 0 : 1;
      pub.mvp = pickMvp(pub);
    } else {
      pub.phase = 'turnEnd';
    }
    return pub;
  }

  function credit(pub, hidden, s, by) {
    pub.teamScores[pub.team] += 1;
    pub.actorPoints[pub.actor] = (pub.actorPoints[pub.actor] || 0) + 1;
    if (by && by !== pub.actor) pub.guessHits[by] = (pub.guessHits[by] || 0) + 1;
    pub.turnGot.push(Object.assign({ by: by || pub.actor }, reveal(hidden.current)));
    if (s.speed) draw(hidden);
    else endTurn(pub, hidden, s, 'got');
    return pub;
  }

  function nextActor(pub, team) {
    const list = pub.teams[team];
    return list.length ? list[pub.actorIdx[team] % list.length] : null;
  }

  /**
   * Reducer. Returns { pub } or { error }. `id` = acting player in Room mode (omitted on one phone).
   * Actions: start | got | pass | guess {id,text} | timeUp | next | skipActor
   */
  function applyAction(pub, hidden, settings, action) {
    const a = action || {};
    const p = pub;
    const s = mergeSettings(settings);
    switch (a.type) {
      case 'start':
        if (p.phase !== 'ready') return { error: 'phase' };
        if (a.id && a.id !== p.actor) return { error: 'not_actor' };
        p.phase = 'acting';
        return { pub: p };

      case 'got':
        if (p.phase !== 'acting') return { error: 'phase' };
        if (a.id && a.id !== p.actor) return { error: 'not_actor' };
        return { pub: credit(p, hidden, s, p.actor) };

      case 'guess': {
        if (p.phase !== 'acting') return { error: 'phase' };
        if (!a.id || a.id === p.actor || teamOf(p, a.id) !== p.team) return { error: 'not_guesser' };
        const text = String(a.text == null ? '' : a.text).trim().slice(0, 80);
        if (!text) return { error: 'empty' };
        if (!matchTitle(text, hidden.current)) return { pub: p, matched: false };
        credit(p, hidden, s, a.id);
        return { pub: p, matched: true };
      }

      case 'pass':
        if (p.phase !== 'acting') return { error: 'phase' };
        if (a.id && a.id !== p.actor) return { error: 'not_actor' };
        if (p.passesLeft <= 0) return { error: 'no_passes' };
        p.passesLeft -= 1;
        p.turnPassed.push(reveal(hidden.current));
        draw(hidden);
        return { pub: p };

      case 'timeUp':
        if (p.phase !== 'acting') return { error: 'phase' };
        return { pub: endTurn(p, hidden, s, 'time') };

      case 'skipActor': {
        if (p.phase !== 'ready') return { error: 'phase' };
        p.actorIdx[p.team] += 1;
        p.actor = nextActor(p, p.team);
        return { pub: p };
      }

      case 'next': {
        if (p.phase !== 'turnEnd') return { error: 'phase' };
        p.team = 1 - p.team;
        p.actor = nextActor(p, p.team);
        p.passesLeft = s.passes;
        p.turnGot = [];
        p.turnPassed = [];
        p.turnNo += 1;
        p.phase = 'ready';
        draw(hidden);
        return { pub: p };
      }

      default:
        return { error: 'unknown_action' };
    }
  }

  /** Late joiner (Room) goes to the smaller team and acts when their turn comes round. */
  function addPlayer(pub, id) {
    if (teamOf(pub, id) >= 0) return pub;
    const t = pub.teams[0].length <= pub.teams[1].length ? 0 : 1;
    pub.teams[t].push(id);
    return pub;
  }

  /** Player left (Room). Ends the turn if they were acting; ends the game if a team empties. */
  function removePlayer(pub, hidden, settings, id) {
    const t = teamOf(pub, id);
    if (t < 0) return pub;
    const s = mergeSettings(settings);
    const wasActor = pub.actor === id && t === pub.team;
    if (wasActor && pub.phase === 'acting') endTurn(pub, hidden, s, 'left');
    const idx = pub.teams[t].indexOf(id);
    const pos = pub.actorIdx[t] % pub.teams[t].length;
    pub.teams[t].splice(idx, 1);
    // Only the rotation position matters; removing a seat before it slides everyone up by one.
    pub.actorIdx[t] = idx < pos ? pos - 1 : pos;
    if (!pub.teams[t].length && pub.phase !== 'over') {
      pub.phase = 'over';
      hidden.current = null;
      const [x, y] = pub.teamScores;
      pub.winner = x === y ? -1 : x > y ? 0 : 1;
      pub.mvp = pickMvp(pub);
      return pub;
    }
    if (wasActor && pub.phase === 'ready') pub.actor = nextActor(pub, t);
    return pub;
  }

  /** The actor's private card (Room secrets/{actor}). */
  function secretFor(pub, hidden) {
    if (pub.phase !== 'ready' && pub.phase !== 'acting') return null;
    const t = reveal(hidden.current);
    return t ? { turnNo: pub.turnNo, title: t, passesLeft: pub.passesLeft } : null;
  }

  function hydrateState(pub) {
    if (!pub) return pub;
    pub.teams = pub.teams || [[], []];
    pub.teams = [pub.teams[0] || [], pub.teams[1] || []];
    pub.teamScores = pub.teamScores || [0, 0];
    pub.teamScores = [Number(pub.teamScores[0]) || 0, Number(pub.teamScores[1]) || 0];
    pub.actorIdx = pub.actorIdx || [0, 0];
    pub.actorIdx = [Number(pub.actorIdx[0]) || 0, Number(pub.actorIdx[1]) || 0];
    pub.turnsTaken = pub.turnsTaken || [0, 0];
    pub.turnsTaken = [Number(pub.turnsTaken[0]) || 0, Number(pub.turnsTaken[1]) || 0];
    pub.turnGot = pub.turnGot || [];
    pub.turnPassed = pub.turnPassed || [];
    pub.actorPoints = pub.actorPoints || {};
    pub.guessHits = pub.guessHits || {};
    pub.lastTurn = pub.lastTurn || null;
    if (pub.lastTurn) {
      pub.lastTurn.got = pub.lastTurn.got || [];
      pub.lastTurn.passed = pub.lastTurn.passed || [];
      pub.lastTurn.missed = pub.lastTurn.missed || null;
    }
    pub.team = Number(pub.team) || 0;
    pub.passesLeft = Number(pub.passesLeft) || 0;
    pub.winner = pub.winner == null ? null : Number(pub.winner);
    pub.mvp = pub.mvp || null;
    return pub;
  }

  function hydrateHidden(hidden) {
    const h = hidden || {};
    h.deck = h.deck || [];
    h.pos = Number(h.pos) || 0;
    h.current = h.current || null;
    return h;
  }

  function publicView(pub) {
    return JSON.parse(JSON.stringify(pub));
  }

  function titleLabel(t, lang, both) {
    return PC.bilingualLabel(t, lang, both);
  }

  return {
    MIN_PLAYERS,
    MAX_PLAYERS,
    MIN_PER_TEAM,
    DEFAULT_SETTINGS,
    TURN_SEC,
    TURNS_PER_TEAM,
    TARGETS,
    DIFFICULTY,
    TEAM_NAMES,
    GESTURES,
    packs: PACKS,
    mergeSettings,
    teamName,
    balanceTeams,
    validTeams,
    pool,
    titleOf,
    reveal,
    matchTitle,
    createGame,
    teamOf,
    isOver,
    applyAction,
    addPlayer,
    removePlayer,
    secretFor,
    hydrateState,
    hydrateHidden,
    publicView,
    titleLabel,
  };
});
