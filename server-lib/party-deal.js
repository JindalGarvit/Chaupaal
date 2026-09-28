/**
 * Party rooms (Dangal party kit) — server-authoritative dealing + round state for every party title.
 * Served by POST /api/media-config { action: 'party_room', op, game, ... } (no extra Vercel function).
 *
 * RTDB layout, one node per room so every op is a single transaction:
 *   games/{game}/{code}/pub            members read   — lobby, settings, scores, public round state
 *   games/{game}/{code}/presence/{uid} members read   — { at, online }; each client writes its own
 *   games/{game}/{code}/secrets/{uid}  only that uid  — this player's card (word / chit / title)
 *   games/{game}/{code}/server         nobody         — roles, words, decks, full votes (Admin SDK only)
 * Secrets never enter `pub` until they are revealed; the host reads nothing more than anyone else.
 *
 * The room engine (join, leave, settings, start, pause, ticks, host migration, offline skips) is shared;
 * each game plugs in an adapter (deal, public view, timers, game ops).
 */
'use strict';

const ImposterCore = require('../public/src/js/games/imposter-core.js');
const RajaMantriCore = require('../public/src/js/games/rajamantri-core.js');
const CharadesCore = require('../public/src/js/games/charades-core.js');
const MostLikelyCore = require('../public/src/js/games/mostlikely-core.js');
const { createWerewolfAdapter } = require('./werewolf-engine.js');
const { createClassicsAdapters } = require('./classics-rooms.js');
const { createOhnoAdapter } = require('./ohno-engine.js');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 6;
const OFFLINE_MS = require('../public/src/js/dangal/dangal-live-policy.js').policyFor('party').reconnectMs;
const REVEAL_MS = 60000;
const STEAL_MS = 45000;
const ROOM_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_NAME = 32;

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

function coreError(out) {
  return err(out.error, out.reason || out.error);
}

/** Everyone present has seen their card → run `action`. Shared by reveal phases. */
function seenOp(ctx, action) {
  const { room, uid, now, act, gone } = ctx;
  const st = room.server.pub;
  if (st.phase !== 'reveal') return {};
  room.pub.seen[uid] = true;
  const waiting = st.players.filter((id) => !room.pub.seen[id] && !gone(id));
  if (!waiting.length) act({ type: action });
  return {};
}

function addRoundPoints(room, points) {
  Object.keys(points || {}).forEach((id) => {
    room.pub.scores[id] = (Number(room.pub.scores[id]) || 0) + (Number(points[id]) || 0);
  });
}

// ------------------------------------------------------------------ Imposter

const imposterAdapter = {
  core: ImposterCore,
  min: ImposterCore.MIN_PLAYERS,
  max: ImposterCore.MAX_PLAYERS,
  mergeSettings: (s) => ImposterCore.mergeSettings(s),
  deal(room, ids, ctx) {
    const prev = room.server || {};
    const usedKeys = Array.isArray(prev.usedKeys) ? prev.usedKeys : [];
    const dealt = ImposterCore.deal(ids, room.pub.settings, { rng: ctx.rng, usedKeys });
    const starterIndex = (ctx.roundNo - 1) % ids.length;
    room.server = {
      settings: dealt.settings,
      hidden: dealt.hidden,
      pub: ImposterCore.createRound(ids, dealt.settings, starterIndex),
      usedKeys: usedKeys.concat(dealt.key).slice(-200),
      scored: false,
    };
    room.secrets = {};
    ids.forEach((id) => (room.secrets[id] = Object.assign({ roundNo: ctx.roundNo }, dealt.secrets[id])));
  },
  view: (s) => ImposterCore.publicView(s.pub),
  phaseKey: (s) => s.pub.phase + ':' + s.pub.turn + ':' + s.pub.voteRound + ':' + (s.pub.revote ? 1 : 0),
  deadlineMs(s) {
    const p = s.pub.phase;
    const set = s.settings;
    if (p === 'reveal') return REVEAL_MS;
    if (p === 'clues') return set.clueSec * 1000;
    if (p === 'discuss') return set.discussionSec * 1000;
    if (p === 'vote' || p === 'revote') return set.voteSec * 1000;
    if (p === 'defence') return set.defenceSec * 1000;
    if (p === 'steal') return STEAL_MS;
    return 0;
  },
  apply(room, action) {
    const s = room.server;
    const out = ImposterCore.applyAction(s.pub, s.hidden, s.settings, action);
    if (out.error) return out;
    s.pub = out.pub;
    // A 0s discussion skips straight to the vote.
    if (s.pub.phase === 'discuss' && s.settings.discussionSec <= 0) {
      s.pub = ImposterCore.applyAction(s.pub, s.hidden, s.settings, { type: 'startVote' }).pub;
    }
    return out;
  },
  afterChange(room) {
    const s = room.server;
    if (s.pub.phase === 'result' && !s.scored) {
      s.scored = true;
      addRoundPoints(room, s.pub.result.points);
    }
  },
  absent(room, ctx) {
    const s = room.server;
    let guard = 0;
    while (s.pub.phase === 'clues' && guard++ < 40) {
      const giver = ImposterCore.currentClueGiver(s.pub);
      if (giver && !ctx.gone(giver)) break;
      if (!ctx.act({ type: 'skipTurn' }, true)) break;
    }
    if ((s.pub.phase === 'vote' || s.pub.phase === 'revote') && s.pub.voters.length) {
      const present = s.pub.voters.filter((id) => !ctx.gone(id));
      const pending = present.filter((id) => s.pub.voted.indexOf(id) < 0);
      if (present.length && !pending.length) ctx.act({ type: 'closeVote' }, true);
    }
  },
  timeout(room, ctx) {
    const s = room.server;
    const p = s.pub.phase;
    if (p === 'reveal') ctx.act({ type: 'startClues' }, true);
    else if (p === 'clues') ctx.act({ type: 'skipTurn' }, true);
    else if (p === 'discuss') ctx.act({ type: 'startVote' }, true);
    else if (p === 'vote' || p === 'revote') ctx.act({ type: 'closeVote' }, true);
    else if (p === 'defence') ctx.act({ type: 'endDefence' }, true);
    else if (p === 'steal') ctx.act({ type: 'steal', id: s.pub.stealer, guess: '' }, true);
  },
  betweenRounds: (s) => s.pub.phase === 'result',
  canNext: (s) => s.pub.phase === 'result',
  newGameOnStart: () => false,
  onJoinPlaying: () => true,
  onLeave(room, uid) {
    const s = room.server;
    s.pub.voters = s.pub.voters.filter((id) => id !== uid);
  },
  ops: {
    seen: (ctx) => seenOp(ctx, 'startClues'),
    clue: (ctx) => (ctx.act({ type: 'clue', id: ctx.uid, text: ctx.args.text }), {}),
    skipDiscussion(ctx) {
      if (!ctx.isHost) throw err('host_only', 'Only the host can skip');
      if (ctx.room.server.pub.phase !== 'discuss') throw err('phase', 'Not in discussion');
      ctx.act({ type: 'startVote' });
      return {};
    },
    vote: (ctx) => (ctx.act({ type: 'vote', id: ctx.uid, target: String(ctx.args.target || '') }), {}),
    steal: (ctx) => (ctx.act({ type: 'steal', id: ctx.uid, guess: ctx.args.guess }), {}),
  },
  hydrate(s) {
    s.usedKeys = s.usedKeys || [];
    s.pub = ImposterCore.hydrateState(s.pub);
    const h = s.hidden || {};
    h.imposters = h.imposters || [];
    h.minority = h.minority || null;
    if (h.majority) h.majority.alts = h.majority.alts || [];
    s.hidden = h;
  },
};

// ------------------------------------------------------------------ Raja Mantri Chor Sipahi

const RMCS_MS = { reveal: REVEAL_MS, raja: 30000, call: 30000, guess: 60000 };

const rajamantriAdapter = {
  core: RajaMantriCore,
  min: RajaMantriCore.MIN_PLAYERS,
  max: RajaMantriCore.MAX_PLAYERS,
  mergeSettings: (s) => RajaMantriCore.mergeSettings(s),
  deal(room, ids, ctx) {
    const dealt = RajaMantriCore.deal(ids, room.pub.settings, { rng: ctx.rng });
    room.server = {
      settings: dealt.settings,
      hidden: dealt.hidden,
      pub: RajaMantriCore.createRound(ids, dealt.settings),
      scored: false,
    };
    room.secrets = {};
    ids.forEach((id) => (room.secrets[id] = { roundNo: ctx.roundNo, role: dealt.secrets[id].role }));
  },
  view: (s) => RajaMantriCore.publicView(s.pub),
  phaseKey: (s) => s.pub.phase + ':' + s.pub.pickIndex,
  deadlineMs: (s) => RMCS_MS[s.pub.phase] || 0,
  apply(room, action) {
    const s = room.server;
    const out = RajaMantriCore.applyAction(s.pub, s.hidden, s.settings, action);
    if (!out.error) s.pub = out.pub;
    return out;
  },
  afterChange(room) {
    const s = room.server;
    if (s.pub.phase === 'result' && !s.scored) {
      s.scored = true;
      addRoundPoints(room, s.pub.result.points);
      if ((Number(room.pub.roundNo) || 0) >= s.settings.rounds) room.pub.over = true;
    }
  },
  absent(room, ctx) {
    const s = room.server;
    const st = s.pub;
    const holder = (role) => RajaMantriCore.holderOf(s.hidden, role);
    if (st.phase === 'reveal') {
      const waiting = st.players.filter((id) => !room.pub.seen[id] && !ctx.gone(id));
      if (!waiting.length) ctx.act({ type: 'startRaja' }, true);
    }
    if (st.phase === 'raja' && ctx.gone(holder('raja'))) ctx.act({ type: 'revealRaja' }, true);
    if (st.phase === 'call' && ctx.gone(holder(st.guesserRole))) ctx.act({ type: 'revealGuesser' }, true);
    let guard = 0;
    while (st.phase === 'guess' && ctx.gone(st.guesser) && guard++ < 4) this.autoPick(room, ctx);
  },
  autoPick(room, ctx) {
    const st = room.server.pub;
    const c = RajaMantriCore.candidates(st);
    if (!c.length) return;
    ctx.act({ type: 'pick', target: c[Math.floor(ctx.rng() * c.length)] }, true);
  },
  timeout(room, ctx) {
    const p = room.server.pub.phase;
    if (p === 'reveal') ctx.act({ type: 'startRaja' }, true);
    else if (p === 'raja') ctx.act({ type: 'revealRaja' }, true);
    else if (p === 'call') ctx.act({ type: 'revealGuesser' }, true);
    else if (p === 'guess') this.autoPick(room, ctx);
  },
  betweenRounds: (s) => s.pub.phase === 'result',
  canNext: (s, room) => s.pub.phase === 'result' && !room.pub.over,
  newGameOnStart: (room) => !!room.pub.over,
  onJoinPlaying: () => true,
  onLeave() {},
  ops: {
    seen: (ctx) => seenOp(ctx, 'startRaja'),
    revealRaja: (ctx) => (ctx.act({ type: 'revealRaja', id: ctx.uid }), {}),
    revealGuesser: (ctx) => (ctx.act({ type: 'revealGuesser', id: ctx.uid }), {}),
    pick(ctx) {
      const out = ctx.act({ type: 'pick', id: ctx.uid, target: String(ctx.args.target || '') });
      return { correct: !!out.correct };
    },
  },
  hydrate(s) {
    s.pub = RajaMantriCore.hydrateState(s.pub);
    s.hidden = s.hidden || {};
    s.hidden.roles = s.hidden.roles || {};
  },
};

// ------------------------------------------------------------------ Dumb Charades

const CHARADES_READY_MS = 30000;
const CHARADES_TURN_END_MS = 12000;

function charadesTeams(room, ids, rng) {
  const pick = room.pub.teamPick || {};
  const teams = [[], []];
  const loose = [];
  ids.forEach((id) => {
    if (pick[id] === 0 || pick[id] === 1) teams[pick[id]].push(id);
    else loose.push(id);
  });
  if (!teams[0].length && !teams[1].length) return CharadesCore.balanceTeams(ids, rng);
  loose.forEach((id) => teams[teams[0].length <= teams[1].length ? 0 : 1].push(id));
  return teams;
}

const charadesAdapter = {
  core: CharadesCore,
  min: CharadesCore.MIN_PLAYERS,
  max: CharadesCore.MAX_PLAYERS,
  mergeSettings: (s) => CharadesCore.mergeSettings(s),
  deal(room, ids, ctx) {
    const teams = charadesTeams(room, ids, ctx.rng);
    if (!CharadesCore.validTeams(teams)) throw err('teams_uneven', 'Each team needs at least 2 players');
    const g = CharadesCore.createGame(teams, room.pub.settings, { rng: ctx.rng });
    room.server = { settings: g.settings, pub: g.pub, hidden: g.hidden };
    room.pub.teamPick = {};
    teams.forEach((t, i) => t.forEach((id) => (room.pub.teamPick[id] = i)));
    room.secrets = {};
    room.pub.roundNo = ctx.roundNo;
    this.afterChange(room);
  },
  view: (s) => CharadesCore.publicView(s.pub),
  phaseKey: (s) => s.pub.phase + ':' + s.pub.turnNo,
  deadlineMs(s) {
    const p = s.pub.phase;
    if (p === 'ready') return CHARADES_READY_MS;
    if (p === 'acting') return s.settings.turnSec * 1000;
    if (p === 'turnEnd') return CHARADES_TURN_END_MS;
    return 0;
  },
  apply(room, action) {
    const s = room.server;
    const out = CharadesCore.applyAction(s.pub, s.hidden, s.settings, action);
    if (!out.error) s.pub = out.pub;
    return out;
  },
  /** Only the actor's secret node holds the title; everyone's points mirror their acting + guessing. */
  afterChange(room) {
    const s = room.server;
    const st = s.pub;
    const secret = CharadesCore.secretFor(st, s.hidden);
    room.secrets = {};
    if (secret && st.actor) room.secrets[st.actor] = Object.assign({ roundNo: room.pub.roundNo }, secret);
    const scores = {};
    Object.keys(room.pub.players).forEach((id) => {
      scores[id] = (Number(st.actorPoints[id]) || 0) + (Number(st.guessHits[id]) || 0);
    });
    room.pub.scores = scores;
    if (st.phase === 'over') room.pub.over = true;
  },
  absent(room, ctx) {
    const st = room.server.pub;
    let guard = 0;
    while (st.phase === 'ready' && ctx.gone(st.actor) && guard++ < st.teams[st.team].length) {
      if (!ctx.act({ type: 'skipActor' }, true)) break;
    }
  },
  timeout(room, ctx) {
    const p = room.server.pub.phase;
    if (p === 'ready') ctx.act({ type: 'start' }, true);
    else if (p === 'acting') ctx.act({ type: 'timeUp' }, true);
    else if (p === 'turnEnd') ctx.act({ type: 'next' }, true);
  },
  betweenRounds: (s) => s.pub.phase === 'over',
  canNext: () => false,
  newGameOnStart: () => true,
  onJoinLobby(room, uid) {
    room.pub.teamPick = room.pub.teamPick || {};
    const pick = room.pub.teamPick;
    const sizes = [0, 0];
    Object.keys(pick).forEach((id) => {
      if (room.pub.players[id] && !room.pub.players[id].left && (pick[id] === 0 || pick[id] === 1)) sizes[pick[id]] += 1;
    });
    pick[uid] = sizes[0] <= sizes[1] ? 0 : 1;
  },
  onJoinPlaying(room, uid) {
    const s = room.server;
    if (s.pub.phase === 'over') return true;
    CharadesCore.addPlayer(s.pub, uid);
    room.pub.teamPick = room.pub.teamPick || {};
    room.pub.teamPick[uid] = CharadesCore.teamOf(s.pub, uid);
    return false;
  },
  onLeave(room, uid) {
    const s = room.server;
    CharadesCore.removePlayer(s.pub, s.hidden, s.settings, uid);
    if (room.pub.teamPick) delete room.pub.teamPick[uid];
  },
  ops: {
    go: (ctx) => (ctx.act({ type: 'start', id: ctx.uid }), {}),
    got: (ctx) => (ctx.act({ type: 'got', id: ctx.uid }), {}),
    pass: (ctx) => (ctx.act({ type: 'pass', id: ctx.uid }), {}),
    guess(ctx) {
      const out = ctx.act({ type: 'guess', id: ctx.uid, text: ctx.args.text });
      return { matched: !!out.matched };
    },
    nextTurn(ctx) {
      if (ctx.room.server.pub.phase !== 'turnEnd') return {};
      ctx.act({ type: 'next' });
      return {};
    },
  },
  lobbyOps: {
    setTeam(ctx) {
      const { room, args } = ctx;
      if (!ctx.isHost) throw err('host_only', 'Only the host can arrange teams');
      const target = String(args.target || '');
      const team = Number(args.team);
      if (!room.pub.players[target] || (team !== 0 && team !== 1)) throw err('bad_target', 'Pick a player and a team');
      room.pub.teamPick = room.pub.teamPick || {};
      room.pub.teamPick[target] = team;
      return {};
    },
    shuffleTeams(ctx) {
      const { room } = ctx;
      if (!ctx.isHost) throw err('host_only', 'Only the host can arrange teams');
      const ids = Object.keys(room.pub.players).filter((id) => !room.pub.players[id].left);
      const teams = CharadesCore.balanceTeams(ids, ctx.rng);
      room.pub.teamPick = {};
      teams.forEach((t, i) => t.forEach((id) => (room.pub.teamPick[id] = i)));
      return {};
    },
  },
  hydrate(s) {
    s.pub = CharadesCore.hydrateState(s.pub);
    s.hidden = CharadesCore.hydrateHidden(s.hidden);
  },
};

// ------------------------------------------------------------------ Most Likely To? / Would You Rather? / Never Have I Ever

/**
 * Votes sit in server.hidden (no client access) until the round closes; pub only lists who voted.
 * A host's custom prompt arrives with start/next (args.custom), is re-checked here and lives only
 * in this round — the host's list stays on their phone.
 */
const mostlikelyAdapter = {
  core: MostLikelyCore,
  min: MostLikelyCore.MIN_PLAYERS,
  max: MostLikelyCore.MAX_PLAYERS,
  mergeSettings: (s) => MostLikelyCore.mergeSettings(s),
  deal(room, ids, ctx) {
    const s = MostLikelyCore.mergeSettings(room.pub.settings);
    const min = MostLikelyCore.minPlayers(s);
    if (ids.length < min) throw err('need_players', 'Need at least ' + min + ' players for ' + MostLikelyCore.MODE_LABELS[s.mode]);
    const prev = ctx.roundNo > 1 && room.server ? room.server : null;
    let deck = prev ? prev.deck : null;
    let prompt = null;
    const custom = ctx.args && ctx.args.custom;
    if (custom) {
      const c = MostLikelyCore.cleanCustom(custom, s.mode);
      if (!c.ok) throw err('custom_blocked', c.reason);
      prompt = Object.assign({ key: 'c:' + ctx.roundNo }, c.prompt);
    } else {
      const out = MostLikelyCore.nextPrompt(deck, s, 'en', ctx.rng);
      prompt = out.prompt;
      deck = out.state;
    }
    if (!prompt) throw err('no_prompts', 'No prompts in the chosen packs');
    const session = prev ? prev.session : MostLikelyCore.newSession();
    // Never Have I Ever with fingers: only players with fingers left answer.
    const roundIds = s.mode === 'nhie' ? MostLikelyCore.nhieRoundPlayers(session, ids, s) : ids;
    if (roundIds.length < min) throw err('need_players', 'Need at least ' + min + ' players with fingers left');
    room.server = {
      settings: s,
      pub: MostLikelyCore.createRound(roundIds, prompt, s, ctx.roundNo),
      hidden: MostLikelyCore.createHidden(),
      deck: deck || { deck: [], sig: '', last: null },
      session,
      recorded: false,
    };
    room.secrets = {};
  },
  view(s) {
    return Object.assign(MostLikelyCore.publicView(s.pub), { session: s.session });
  },
  phaseKey: (s) => s.pub.phase + ':' + s.pub.n,
  deadlineMs(s) {
    if (s.pub.phase === 'vote') return MostLikelyCore.VOTE_SEC * 1000;
    if (s.pub.phase === 'defence') return MostLikelyCore.DEFENCE_SEC * 1000;
    return 0;
  },
  apply(room, action) {
    const s = room.server;
    const out = MostLikelyCore.applyAction(s.pub, s.hidden, s.settings, action);
    if (!out.error) s.pub = out.pub;
    return out;
  },
  afterChange(room) {
    const s = room.server;
    if (s.pub.result && !s.recorded) {
      s.recorded = true;
      MostLikelyCore.recordRound(s.session, s.pub);
      addRoundPoints(room, s.pub.result.points);
    }
    // Only after the defence beat, so the last round still gets its "defend yourself" moment.
    if (s.pub.phase === 'result' && MostLikelyCore.isOver(s.settings, room.pub.roundNo, s.session)) room.pub.over = true;
  },
  absent(room, ctx) {
    const st = room.server.pub;
    if (st.phase !== 'vote' || !st.voted.length) return;
    const present = st.players.filter((id) => !ctx.gone(id));
    if (present.length && present.every((id) => st.voted.indexOf(id) >= 0)) ctx.act({ type: 'close' }, true);
  },
  timeout(room, ctx) {
    const p = room.server.pub.phase;
    if (p === 'vote') ctx.act({ type: 'close' }, true);
    else if (p === 'defence') ctx.act({ type: 'endDefence' }, true);
  },
  betweenRounds: (s) => s.pub.phase === 'result',
  canNext: (s, room) => s.pub.phase === 'result' && !room.pub.over,
  newGameOnStart: (room) => !!room.pub.over,
  onJoinPlaying: () => true,
  onLeave(room, uid) {
    const s = room.server;
    MostLikelyCore.removePlayer(s.pub, s.hidden, s.settings, uid);
  },
  ops: {
    vote(ctx) {
      const { room, uid, args } = ctx;
      const mode = room.server.pub.mode;
      let action;
      if (mode === 'nhie') action = { type: 'vote', id: uid, answer: String(args.answer || '') };
      else if (mode === 'wyr') action = { type: 'vote', id: uid, pick: String(args.pick || ''), guess: String(args.guess || '') };
      else action = { type: 'vote', id: uid, target: String(args.target || '') };
      ctx.act(action);
      // Your own choice, readable only by you (so a refresh still shows "you picked …").
      if (mode === 'nhie') room.secrets[uid] = { roundNo: room.pub.roundNo, answer: action.answer };
      else if (mode === 'wyr') room.secrets[uid] = { roundNo: room.pub.roundNo, pick: action.pick, guess: action.guess };
      else room.secrets[uid] = { roundNo: room.pub.roundNo, target: action.target };
      return {};
    },
    revealNow(ctx) {
      if (!ctx.isHost) throw err('host_only', 'Only the host can reveal early');
      const st = ctx.room.server.pub;
      if (st.phase !== 'vote') return {};
      if (!st.voted.length) throw err('no_votes', 'Wait for at least one vote');
      ctx.act({ type: 'close' });
      return {};
    },
    endDefence(ctx) {
      const st = ctx.room.server.pub;
      if (st.phase !== 'defence') return {};
      if (!ctx.isHost && st.result.top.indexOf(ctx.uid) < 0) throw err('not_allowed', 'Only the host or the crowned player can skip');
      ctx.act({ type: 'endDefence' });
      return {};
    },
    finish(ctx) {
      if (!ctx.isHost) throw err('host_only', 'Only the host can end the game');
      if (ctx.room.server.pub.phase !== 'result') throw err('phase', 'Finish this round first');
      ctx.room.pub.over = true;
      return {};
    },
  },
  hydrate(s) {
    s.pub = MostLikelyCore.hydrateRound(s.pub);
    s.hidden = s.hidden || {};
    s.hidden.votes = s.hidden.votes || {};
    s.deck = s.deck || { deck: [], sig: '', last: null };
    s.deck.deck = s.deck.deck || [];
    s.session = MostLikelyCore.hydrateSession(s.session);
    s.recorded = !!s.recorded;
  },
};

/** Per-game adapters. New party titles add an entry here. */
const GAMES = {
  imposter: imposterAdapter,
  rajamantri: rajamantriAdapter,
  charades: charadesAdapter,
  mostlikely: mostlikelyAdapter,
  werewolf: createWerewolfAdapter({ err }),
};
Object.assign(GAMES, createClassicsAdapters({ err }));
GAMES.uno = createOhnoAdapter({ err });

// ------------------------------------------------------------------ room engine

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

function seatOrder(pub) {
  return Object.keys(pub.players || {}).sort((a, b) => (pub.players[a].seat || 0) - (pub.players[b].seat || 0));
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

function bump(room, now) {
  room.pub.rev = (Number(room.pub.rev) || 0) + 1;
  room.pub.updatedAt = now;
}

/** Publish the public view of the server round state. */
function publish(room, now) {
  const g = GAMES[room.pub.game];
  const s = room.server;
  room.pub.state = s && s.pub ? g.view(s) : null;
  room.pub.serverNow = now;
  bump(room, now);
}

function setDeadline(room, now) {
  const g = GAMES[room.pub.game];
  const ms = g.deadlineMs(room.server);
  room.pub.paused = null;
  room.pub.deadline = ms > 0 ? now + ms : null;
  room.pub.phaseKey = g.phaseKey(room.server);
}

/** Context handed to adapters: act() runs a core action and keeps timers + derived state in step. */
function context(room, uid, args, now, rng) {
  const g = GAMES[room.pub.game];
  const gone = (id) => !id || !room.pub.players[id] || !!room.pub.players[id].left || !isOnline(room, id, now);
  const act = (action, soft) => {
    const before = g.phaseKey(room.server);
    const out = g.apply(room, action);
    if (out.error) {
      if (soft) return null;
      throw coreError(out);
    }
    if (g.phaseKey(room.server) !== before) setDeadline(room, now);
    g.afterChange(room, now);
    return out;
  };
  return { room, uid, args: args || {}, now, rng: typeof rng === 'function' ? rng : Math.random, isHost: room.pub.host === uid, gone, act };
}

function settle(room, ctx) {
  const g = GAMES[room.pub.game];
  if (room.server && room.server.pub && room.pub.status === 'playing') g.absent(room, ctx);
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

function dealRound(room, now, rng, args) {
  const pub = room.pub;
  // Pending joiners take a seat; players who left are dropped between rounds.
  seatOrder(pub).forEach((id) => {
    if (pub.players[id].left) {
      delete pub.players[id];
      delete pub.scores[id];
      if (room.secrets) delete room.secrets[id];
      if (pub.teamPick) delete pub.teamPick[id];
    } else if (pub.players[id].pending) {
      delete pub.players[id].pending;
    }
  });
  const ids = activeIds(pub);
  const game = GAMES[pub.game];
  if (ids.length < game.min) throw err('need_players', 'Need at least ' + game.min + ' players');
  if (ids.length > game.max) throw err('too_many_players', 'Max ' + game.max + ' players');
  const roundNo = (Number(pub.roundNo) || 0) + 1;
  game.deal(room, ids, { rng: typeof rng === 'function' ? rng : Math.random, roundNo, now, args: args || {} });
  ids.forEach((id) => {
    if (!(id in pub.scores)) pub.scores[id] = 0;
  });
  pub.roundNo = roundNo;
  pub.status = 'playing';
  pub.seen = {};
  pub.settings = room.server.settings;
  setDeadline(room, now);
}

function newRoom({ game, uid, name, settings, chatId, now }) {
  const g = GAMES[game];
  if (!g) throw err('unknown_game', 'Unknown party game');
  const room = {
    pub: {
      game,
      host: uid,
      status: 'lobby',
      createdAt: now,
      updatedAt: now,
      expiresAt: now + ROOM_TTL_MS,
      settings: g.mergeSettings(settings),
      players: { [uid]: { name: cleanName(name), seat: 0, joinedAt: now } },
      scores: { [uid]: 0 },
      roundNo: 0,
      seen: {},
      over: false,
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
  if (g.onJoinLobby) g.onJoinLobby(room, uid);
  return room;
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
  if (!game) throw err('unknown_game', 'Unknown party game');

  if (op === 'join') {
    if (me && !me.left) {
      room.presence[uid] = { at: now, online: true };
      return { room, result: { rejoined: true } };
    }
    const seats = seatOrder(pub).filter((id) => !pub.players[id].left);
    if (seats.length >= game.max) throw err('room_full', 'This room is full');
    const seat = seatOrder(pub).reduce((m, id) => Math.max(m, pub.players[id].seat || 0), -1) + 1;
    pub.players[uid] = { name: cleanName(a.name), seat, joinedAt: now };
    if (!(uid in pub.scores)) pub.scores[uid] = 0;
    room.presence[uid] = { at: now, online: true };
    const playing = pub.status === 'playing' && room.server && room.server.pub;
    if (!playing && game.onJoinLobby) game.onJoinLobby(room, uid);
    if (playing) {
      const pending = game.onJoinPlaying(room, uid, now);
      if (pending) pub.players[uid].pending = true;
      else {
        game.afterChange(room, now);
        publish(room, now);
        return { room, result: { joined: true, pending: false } };
      }
    }
    bump(room, now);
    return { room, result: { joined: true, pending: !!pub.players[uid].pending } };
  }

  if (!me) throw err('not_member', 'You are not in this room');
  if (op !== 'leave' && me.left) throw err('not_member', 'You left this room');
  room.presence[uid] = { at: now, online: true };

  const s = room.server;
  const inRound = !!(s && s.pub && pub.status === 'playing');
  const ctx = context(room, uid, a, now, rng);
  const needRound = () => {
    if (!inRound) throw err('no_round', 'No round in progress');
  };

  switch (op) {
    case 'leave': {
      if (pub.status === 'lobby') {
        delete pub.players[uid];
        delete pub.scores[uid];
        if (pub.teamPick) delete pub.teamPick[uid];
      } else {
        me.left = true;
      }
      if (room.presence[uid]) room.presence[uid] = { at: now, online: false };
      const remaining = seatOrder(pub).filter((id) => !pub.players[id].left);
      if (!remaining.length) pub.status = 'closed';
      else if (pub.host === uid) pub.host = remaining[0];
      if (inRound && pub.status === 'playing') {
        const before = game.phaseKey(s);
        game.onLeave(room, uid, now);
        if (game.phaseKey(room.server) !== before) setDeadline(room, now);
        game.afterChange(room, now);
        settle(room, ctx);
        publish(room, now);
      } else {
        bump(room, now);
      }
      return { room, result: { left: true } };
    }

    case 'settings': {
      if (!isHost) throw err('host_only', 'Only the host can change settings');
      if (inRound && !game.betweenRounds(s, room)) throw err('phase', 'Change settings between rounds');
      pub.settings = game.mergeSettings(Object.assign({}, pub.settings, a.settings || {}));
      bump(room, now);
      return { room, result: { settings: pub.settings } };
    }

    case 'start':
    case 'next': {
      if (!isHost) throw err('host_only', 'Only the host can start');
      if (op === 'next' && !(inRound && game.canNext(s, room))) throw err('phase', 'Finish this round first');
      if (op === 'start' && inRound && !game.betweenRounds(s, room)) throw err('phase', 'Round in progress');
      if (op === 'start' && (pub.status === 'lobby' || game.newGameOnStart(room))) {
        Object.keys(pub.scores).forEach((id) => (pub.scores[id] = 0));
        pub.roundNo = 0;
        pub.over = false;
      }
      dealRound(room, now, rng, a);
      settle(room, context(room, uid, a, now, rng));
      publish(room, now);
      return { room, result: { roundNo: pub.roundNo } };
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
      if (inRound) {
        const before = JSON.stringify(room.server.pub) + '|' + pub.deadline;
        settle(room, ctx);
        if (!pub.paused && pub.deadline && now >= pub.deadline) {
          game.timeout(room, ctx);
          settle(room, ctx);
        }
        const after = JSON.stringify(room.server.pub) + '|' + pub.deadline;
        if (before !== after || migrated) publish(room, now);
      } else if (migrated) {
        bump(room, now);
      }
      return { room, result: {} };
    }

    case 'end': {
      if (!isHost) throw err('host_only', 'Only the host can end the room');
      pub.status = 'closed';
      pub.deadline = null;
      bump(room, now);
      return { room, result: { closed: true } };
    }

    default: {
      if (game.lobbyOps && game.lobbyOps[op]) {
        if (inRound && !game.betweenRounds(s, room)) throw err('phase', 'Only between games');
        const result = game.lobbyOps[op](ctx) || {};
        bump(room, now);
        return { room, result };
      }
      if (game.ops && game.ops[op]) {
        needRound();
        if (pub.players[uid].pending) throw err('pending', 'You join next round');
        const result = game.ops[op](ctx) || {};
        settle(room, ctx);
        publish(room, now);
        return { room, result };
      }
      throw err('bad_op', 'Unknown room action');
    }
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
  room.pub.over = !!room.pub.over;
  if (room.pub.teamPick === undefined && room.pub.game === 'charades') room.pub.teamPick = {};
  room.presence = room.presence || {};
  room.secrets = room.secrets || {};
  const g = GAMES[room.pub.game];
  if (room.server && g) g.hydrate(room.server);
  else room.server = null;
  return room;
}

/**
 * Entry point for the `party_room` action.
 * @param {import('firebase-admin')} adminApp
 * @param {string} uid
 * @param {object} body { op, game, code, name, settings, ...op args }
 */
async function partyRoom(adminApp, uid, body, deps) {
  const b = body || {};
  const op = String(b.op || '');
  const game = String(b.game || 'imposter');
  if (!GAMES[game]) throw err('unknown_game', 'Unknown party game');
  const rtdb = adminApp.database();
  const now = Date.now();

  if (op === 'dice_stats') return diceStats(adminApp, uid);

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
        return { code, game, host: true, serverNow: now };
      } catch (e) {
        if (e.code !== 'code_taken') throw e;
      }
    }
    throw err('busy', 'Could not create a room — try again');
  }

  const code = cleanCode(b.code);
  if (!code) throw err('bad_code', 'Check the room code');
  const path = `games/${game}/${code}`;
  const g = GAMES[game];
  const result = await transactRoom(rtdb, path, (current) => {
    const out = reduceRoom(current, uid, op, b, now, Math.random);
    const req = g.pendingSettlement && out.room.server ? g.pendingSettlement(out.room.server) : null;
    if (req) out.result = Object.assign({}, out.result, { _settle: JSON.parse(JSON.stringify(req)) });
    return out;
  });
  const req = result._settle;
  delete result._settle;
  if (req) {
    try {
      result.settlement = await settleRoom(adminApp, rtdb, path, req, deps);
    } catch (e) {
      // The request stays queued in `server`; the next op on this room retries it (idempotent by matchId).
      console.warn('[party_room] settlement retry pending', game, e && e.message);
    }
  }
  return Object.assign({ code, game, serverNow: now }, result);
}

/** Placement chips for a finished classics game, then mark it settled in the room (one publish). */
async function settleRoom(adminApp, rtdb, path, req, deps) {
  const economy = (deps && deps.economy) || require('./dangal-economy.js');
  const db = (deps && deps.db) || adminApp.firestore();
  const admin = (deps && deps.admin) || adminApp;
  const out = await economy.resolvePlacement(db, admin, {
    gameType: req.game,
    matchId: req.matchId,
    ranking: req.ranking || [],
    teams: req.teams || null,
    stake: Number(req.stake) || 0,
    draw: !!req.draw,
    rolls: req.rolls || {},
    forfeits: req.forfeits || [],
  });
  const results = {};
  Object.keys((out && out.players) || {}).forEach((id) => {
    const p = out.players[id];
    results[id] = { place: p.place, chipDelta: p.chipDelta, won: !!p.won };
  });
  await transactRoom(rtdb, path, (current) => {
    if (!current || !current.server || !current.server.settleReq || current.server.settleReq.matchId !== req.matchId) {
      return current ? { room: current, result: {} } : null;
    }
    current.server.settleReq.done = true;
    current.pub.settlement = { status: 'done', matchId: req.matchId, stake: Number(req.stake) || 0, results };
    bump(current, Date.now());
    return { room: current, result: {} };
  });
  return { status: 'done', results };
}

/** Lifetime Live dice faces for the fairness view (written at settlement). */
async function diceStats(adminApp, uid) {
  const snap = await adminApp.firestore().collection('users').doc(uid).collection('diceStats').doc('lifetime').get();
  const d = (snap.exists && snap.data()) || {};
  const counts = [1, 2, 3, 4, 5, 6].map((f) => Number(d['f' + f]) || 0);
  return { counts, total: counts.reduce((a, c) => a + c, 0) };
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
