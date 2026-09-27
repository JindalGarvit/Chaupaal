/**
 * Werewolf — pure game logic shared by Pass & Play (client) and Room (server-lib/werewolf-engine.js).
 *
 * `pub` is the public game state: who is alive, the phase, public announcements (the narrator log)
 * and who has voted. Everything secret — roles, night choices, Seer results, day votes before the
 * count, potions — lives in `hidden` and only reaches `pub` as a public outcome (or at game over).
 * Theme (Werewolf | Mafia) only reskins names / icons / narration; the engine is identical.
 * UMD: window.WerewolfCore / require().
 */
(function (root, factory) {
  const PC = typeof module === 'object' && module.exports ? require('./party-core.js') : root.PartyCore;
  const api = factory(PC);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WerewolfCore = api;
})(typeof self !== 'undefined' ? self : this, function (PC) {
  'use strict';

  const MIN_PLAYERS = 5;
  const MAX_PASS = 16;
  const MAX_ROOM = 20;
  const MAX_PLAYERS = MAX_ROOM;
  const BEST_WITH = 7;

  /** Role ids. `team`: wolves | village | tanner (plays alone). */
  const ROLE_IDS = ['wolf', 'seer', 'doctor', 'villager', 'hunter', 'witch', 'tanner', 'bodyguard'];
  const TEAM = { wolf: 'wolves', seer: 'village', doctor: 'village', villager: 'village', hunter: 'village', witch: 'village', tanner: 'tanner', bodyguard: 'village' };
  /** Optional roles, in the order they're added when there's room. */
  const OPTIONAL = ['hunter', 'witch', 'bodyguard', 'tanner'];
  const SPECIAL_ORDER = ['seer', 'doctor'].concat(OPTIONAL);

  const THEMES = {
    werewolf: {
      id: 'werewolf',
      label: 'Werewolf',
      place: 'village',
      teams: { wolves: 'Werewolves', village: 'Village', tanner: 'Tanner' },
      roles: {
        wolf: { name: 'Werewolf', plural: 'Werewolves', icon: '🐺' },
        seer: { name: 'Seer', plural: 'Seers', icon: '🔮' },
        doctor: { name: 'Doctor', plural: 'Doctors', icon: '🩺' },
        villager: { name: 'Villager', plural: 'Villagers', icon: '🧑‍🌾' },
        hunter: { name: 'Hunter', plural: 'Hunters', icon: '🏹' },
        witch: { name: 'Witch', plural: 'Witches', icon: '🧪' },
        tanner: { name: 'Tanner', plural: 'Tanners', icon: '🧵' },
        bodyguard: { name: 'Bodyguard', plural: 'Bodyguards', icon: '🛡️' },
      },
      lines: {
        night: 'Night falls on the village. Everyone, close your eyes.',
        wake: 'The sun rises over the village.',
        taken: '{names} {was} taken in the night.',
        quiet: 'A quiet night — nobody was taken.',
        saved: 'Nobody was taken — the Doctor saved someone.',
        protected: 'Nobody was taken — someone was protected in the night.',
        potion: 'Nobody was taken — someone was saved in the night.',
        day: 'Talk it over. Who among you is a Werewolf?',
        out: '{name} is out of the game.',
        noOut: 'The village couldn’t agree — nobody is out today.',
        tie: 'It’s a tie! One more vote between {names}.',
        shot: '{by} the Hunter takes {name} with them.',
        noShot: '{by} the Hunter lowers their bow.',
        win: { village: 'The village wins — every Werewolf is out!', wolves: 'The Werewolves take the village!', tanner: '{name} the Tanner wanted to be voted out — and wins!' },
      },
    },
    mafia: {
      id: 'mafia',
      label: 'Mafia',
      place: 'city',
      teams: { wolves: 'Mafia', village: 'Town', tanner: 'Jester' },
      roles: {
        wolf: { name: 'Mafia', plural: 'Mafia', icon: '🕴️' },
        seer: { name: 'Detective', plural: 'Detectives', icon: '🕵️' },
        doctor: { name: 'Doctor', plural: 'Doctors', icon: '🩺' },
        villager: { name: 'Civilian', plural: 'Civilians', icon: '🧑' },
        hunter: { name: 'Vigilante', plural: 'Vigilantes', icon: '⚖️' },
        witch: { name: 'Chemist', plural: 'Chemists', icon: '⚗️' },
        tanner: { name: 'Jester', plural: 'Jesters', icon: '🃏' },
        bodyguard: { name: 'Bodyguard', plural: 'Bodyguards', icon: '🛡️' },
      },
      lines: {
        night: 'Night falls on the city. Everyone, close your eyes.',
        wake: 'Morning comes to the city.',
        taken: '{names} got an offer {they} couldn’t refuse — out of the game.',
        quiet: 'A quiet night — nobody was taken.',
        saved: 'Nobody was taken — the Doctor saved someone.',
        protected: 'Nobody was taken — someone was protected in the night.',
        potion: 'Nobody was taken — someone was saved in the night.',
        day: 'Talk it over. Who’s in the Mafia?',
        out: '{name} is out of the game.',
        noOut: 'The town couldn’t agree — nobody is out today.',
        tie: 'It’s a tie! One more vote between {names}.',
        shot: '{by} the Vigilante takes {name} down with them.',
        noShot: '{by} the Vigilante holds back.',
        win: { village: 'The town wins — the Mafia is finished!', wolves: 'The Mafia runs the city now!', tanner: '{name} the Jester wanted to be voted out — and wins!' },
      },
    },
  };

  const DISCUSS_OPTIONS = [60, 120, 180, 300];
  const NIGHT_OPTIONS = [30, 60, 90];
  const VOTE_OPTIONS = [30, 60, 90];
  const DEFAULT_SETTINGS = {
    theme: 'werewolf',
    wolves: 0, // 0 = auto-balance
    seer: true,
    doctor: true,
    hunter: false,
    witch: false,
    tanner: false,
    bodyguard: false,
    discussSec: 180,
    nightSec: 60,
    voteSec: 60,
    reveal: true,
    doctorRepeat: false,
    voteStyle: 'quick',
  };
  const BOOL_KEYS = ['seer', 'doctor', 'hunter', 'witch', 'tanner', 'bodyguard', 'reveal', 'doctorRepeat'];

  function mergeSettings(s) {
    const src = s || {};
    const out = Object.assign({}, DEFAULT_SETTINGS);
    if (THEMES[src.theme]) out.theme = src.theme;
    const w = Number(src.wolves);
    if (Number.isInteger(w) && w >= 0 && w <= 9) out.wolves = w;
    BOOL_KEYS.forEach((k) => {
      if (typeof src[k] === 'boolean') out[k] = src[k];
    });
    if (DISCUSS_OPTIONS.indexOf(Number(src.discussSec)) >= 0) out.discussSec = Number(src.discussSec);
    if (NIGHT_OPTIONS.indexOf(Number(src.nightSec)) >= 0) out.nightSec = Number(src.nightSec);
    if (VOTE_OPTIONS.indexOf(Number(src.voteSec)) >= 0) out.voteSec = Number(src.voteSec);
    if (src.voteStyle === 'secret' || src.voteStyle === 'quick') out.voteStyle = src.voteStyle;
    return out;
  }

  // ---------------- theme ----------------

  function theme(settingsOrId) {
    const id = typeof settingsOrId === 'string' ? settingsOrId : settingsOrId && settingsOrId.theme;
    return THEMES[id] || THEMES.werewolf;
  }

  function roleName(role, th) {
    const r = theme(th).roles[role];
    return r ? r.name : '';
  }

  function roleIcon(role, th) {
    const r = theme(th).roles[role];
    return r ? r.icon : '';
  }

  function teamName(team, th) {
    return theme(th).teams[team] || '';
  }

  function fill(text, vars) {
    return String(text || '').replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : ''));
  }

  function joinNames(names) {
    const list = names.filter(Boolean);
    if (list.length <= 1) return list[0] || '';
    return list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
  }

  // ---------------- roles + balance ----------------

  /** Auto-balance preset: 5–6 → 1 wolf, 7–10 → 2, 11–14 → 3, 15+ → 4. */
  function autoWolves(n) {
    if (n <= 6) return 1;
    if (n <= 10) return 2;
    if (n <= 14) return 3;
    return 4;
  }

  /** Wolves must start outnumbered, or they'd win before the first night. */
  function maxWolves(n) {
    return Math.max(1, Math.floor((n - 1) / 2));
  }

  function wolvesFor(n, s) {
    const set = mergeSettings(s);
    return set.wolves ? Math.min(set.wolves, maxWolves(n)) : autoWolves(n);
  }

  /** Role list for n players. Specials that don't fit are dropped from the end of SPECIAL_ORDER. */
  function rolesFor(n, s) {
    const set = mergeSettings(s);
    const wolves = wolvesFor(n, set);
    const seats = n - wolves;
    const specials = SPECIAL_ORDER.filter((r) => set[r]).slice(0, seats);
    const out = [];
    for (let i = 0; i < wolves; i++) out.push('wolf');
    specials.forEach((r) => out.push(r));
    while (out.length < n) out.push('villager');
    return out;
  }

  const POWER = { seer: 2, doctor: 1.5, hunter: 1, witch: 1.5, bodyguard: 1, tanner: -0.5 };

  /**
   * Balance meter. 0 = the auto preset (Seer + Doctor, preset wolves). Positive leans village,
   * negative leans wolves. `tone`: ok | warn | bad.
   */
  function balance(n, s) {
    const set = mergeSettings(s);
    const roles = rolesFor(n, set);
    const wolves = roles.filter((r) => r === 'wolf').length;
    const specials = roles.filter((r) => POWER[r] != null);
    const power = specials.reduce((sum, r) => sum + POWER[r], 0);
    const score = Math.round(((autoWolves(n) - wolves) * 3 + power - (POWER.seer + POWER.doctor)) * 10) / 10;
    const dropped = SPECIAL_ORDER.filter((r) => set[r] && roles.indexOf(r) < 0);
    let tone = 'ok';
    let label = 'Balanced';
    if (score > 2.5) label = 'Leans village';
    else if (score < -1.5) label = 'Leans wolves';
    if (score > 4.5 || score < -3) {
      tone = 'bad';
      label = score > 0 ? 'Too easy for the village' : 'Too easy for the wolves';
    } else if (score > 2.5 || score < -1.5) tone = 'warn';
    const nonWolves = n - wolves;
    let note = '';
    if (nonWolves - wolves <= 1) {
      tone = 'bad';
      note = 'The wolves are one night away from winning.';
    } else if (dropped.length) note = 'Not enough players for every role — ' + dropped.join(', ') + ' left out.';
    else if (n < BEST_WITH) note = 'Best with 7+ players.';
    return { score, tone, label, note, wolves, roles, dropped };
  }

  // ---------------- deal ----------------

  /**
   * @returns {{ settings, pub, hidden, secrets: Record<string,{ role, team, wolves?: string[] }> }}
   */
  function createGame(ids, settings, opts) {
    const players = (ids || []).slice();
    if (players.length < MIN_PLAYERS) throw new Error('need_players');
    if (players.length > MAX_PLAYERS) throw new Error('too_many_players');
    const s = mergeSettings(settings);
    const deck = PC.shuffle(rolesFor(players.length, s), opts && opts.rng);
    const roles = {};
    players.forEach((id, i) => (roles[id] = deck[i]));
    const wolves = players.filter((id) => roles[id] === 'wolf');
    const secrets = {};
    players.forEach((id) => {
      secrets[id] = { role: roles[id], team: TEAM[roles[id]] };
      if (roles[id] === 'wolf') secrets[id].wolves = wolves.slice();
    });
    const pub = {
      phase: 'reveal',
      theme: s.theme,
      players: players.slice(),
      alive: players.slice(),
      night: 0,
      day: 0,
      actedN: 0,
      voted: [],
      nominations: {},
      candidates: [],
      revote: false,
      hunter: null,
      hunterQueue: [],
      after: null,
      log: [],
      winner: null,
      result: null,
    };
    const hidden = {
      roles,
      witch: { save: true, kill: true },
      last: { doctor: null, bodyguard: null },
      acts: {},
      acted: [],
      votes: {},
      seerLog: [],
      recap: [],
      suspicion: {},
    };
    return { settings: s, pub, hidden, secrets };
  }

  // ---------------- helpers ----------------

  function isAlive(pub, id) {
    return pub.alive.indexOf(id) >= 0;
  }

  function roleOf(hidden, id) {
    return hidden.roles[id] || null;
  }

  function aliveWith(pub, hidden, role) {
    return pub.alive.filter((id) => hidden.roles[id] === role);
  }

  function winnerOf(pub, hidden) {
    const wolves = aliveWith(pub, hidden, 'wolf').length;
    if (!wolves) return 'village';
    if (wolves >= pub.alive.length - wolves) return 'wolves';
    return null;
  }

  function rngOf(rng) {
    return typeof rng === 'function' ? rng : Math.random;
  }

  /** Plurality of `votes` (voter → target); ties broken by rng. Returns { top, tied, counts }. */
  function plurality(votes, rng) {
    const counts = {};
    Object.keys(votes || {}).forEach((v) => {
      const t = votes[v];
      if (t) counts[t] = (counts[t] || 0) + 1;
    });
    const max = Object.keys(counts).reduce((m, k) => Math.max(m, counts[k]), 0);
    const tied = max ? Object.keys(counts).filter((k) => counts[k] === max).sort() : [];
    const top = tied.length ? tied[Math.floor(rngOf(rng)() * tied.length)] : null;
    return { top, tied, counts, max };
  }

  /** The wolves' choice so far (null until every living wolf has picked). */
  function wolfPick(pub, hidden) {
    const wolves = aliveWith(pub, hidden, 'wolf');
    const votes = {};
    wolves.forEach((id) => {
      const a = hidden.acts[id];
      if (a && a.target) votes[id] = a.target;
    });
    if (!wolves.length || Object.keys(votes).length < wolves.length) return null;
    const p = plurality(votes, () => 0);
    return p.tied.length === 1 ? p.top : null;
  }

  function wolfVotes(pub, hidden) {
    const out = {};
    aliveWith(pub, hidden, 'wolf').forEach((id) => {
      const a = hidden.acts[id];
      if (a && a.target) out[id] = a.target;
    });
    return out;
  }

  /**
   * Night screen for one player. Every role gets a pick step of the same shape (candidates + confirm),
   * so on one phone nobody can tell roles apart by what the screen asks for.
   * @returns {{ kind: 'pick', role, verb, prompt, candidates: string[], optional?: boolean, witch?: object }}
   */
  function nightStep(pub, hidden, settings, id) {
    const s = mergeSettings(settings);
    const role = hidden.roles[id];
    const others = pub.alive.filter((x) => x !== id);
    const base = { kind: 'pick', role };
    if (role === 'wolf') {
      return Object.assign(base, { verb: 'target', prompt: 'Choose who to take tonight', candidates: pub.alive.filter((x) => hidden.roles[x] !== 'wolf'), pack: wolfVotes(pub, hidden) });
    }
    if (role === 'seer') return Object.assign(base, { verb: 'check', prompt: 'Choose someone to check', candidates: others });
    if (role === 'doctor') {
      const last = hidden.last.doctor;
      return Object.assign(base, { verb: 'protect', prompt: 'Choose someone to protect', candidates: pub.alive.filter((x) => s.doctorRepeat || x !== last || pub.night <= 1) });
    }
    if (role === 'bodyguard') {
      const last = hidden.last.bodyguard;
      return Object.assign(base, { verb: 'guard', prompt: 'Choose someone to guard', candidates: others.filter((x) => x !== last) });
    }
    if (role === 'witch') {
      return Object.assign(base, {
        verb: 'brew',
        prompt: hidden.witch.kill ? 'Use a potion? Pick someone for the sleep potion, or no one' : 'Your sleep potion is used up',
        candidates: hidden.witch.kill ? others : [],
        optional: true,
        witch: { save: !!hidden.witch.save, kill: !!hidden.witch.kill, victim: hidden.witch.save ? wolfPick(pub, hidden) : null },
      });
    }
    return Object.assign(base, { verb: 'suspect', prompt: 'Who do you suspect?', candidates: others });
  }

  function validNight(pub, hidden, settings, a) {
    const step = nightStep(pub, hidden, settings, a.id);
    const target = a.target || null;
    if (step.role === 'witch') {
      if (target && step.candidates.indexOf(target) < 0) return 'bad_target';
      if (a.save && !hidden.witch.save) return 'no_potion';
      return '';
    }
    if (!target || step.candidates.indexOf(target) < 0) return 'bad_target';
    return '';
  }

  function kill(pub, hidden, id, how, when) {
    if (!isAlive(pub, id)) return false;
    pub.alive = pub.alive.filter((x) => x !== id);
    if (hidden.roles[id] === 'hunter' && how !== 'left') pub.hunterQueue.push(id);
    return true;
  }

  function publicRole(settings, hidden, id) {
    return mergeSettings(settings).reveal ? hidden.roles[id] : null;
  }

  function pushLog(pub, entry) {
    pub.log.push(entry);
    if (pub.log.length > 60) pub.log = pub.log.slice(-60);
  }

  // ---------------- night ----------------

  function startNight(pub, hidden) {
    pub.phase = 'night';
    pub.night += 1;
    pub.actedN = 0;
    pub.voted = [];
    pub.nominations = {};
    pub.candidates = [];
    pub.revote = false;
    hidden.acts = {};
    hidden.acted = [];
    hidden.votes = {};
    pushLog(pub, { t: 'night', n: pub.night });
  }

  function resolveNight(pub, hidden, settings, rng) {
    const s = mergeSettings(settings);
    const acts = hidden.acts;
    const n = pub.night;
    const wv = wolfVotes(pub, hidden);
    const wp = plurality(wv, rng);
    const victim = wp.top;
    const doc = aliveWith(pub, hidden, 'doctor').map((id) => acts[id] && acts[id].target).filter(Boolean)[0] || null;
    const guard = aliveWith(pub, hidden, 'bodyguard').map((id) => acts[id] && acts[id].target).filter(Boolean)[0] || null;
    const witchId = aliveWith(pub, hidden, 'witch')[0] || null;
    const wa = witchId ? acts[witchId] || {} : {};
    const recap = { night: n, wolves: wv, victim, tied: wp.tied.length > 1 ? wp.tied : null, doctor: doc, bodyguard: guard, seer: null, witchSave: false, witchKill: null, saved: null, taken: [] };
    aliveWith(pub, hidden, 'seer').forEach((id) => {
      if (acts[id] && acts[id].target) recap.seer = { by: id, target: acts[id].target, team: acts[id].result };
    });
    pub.alive
      .filter((id) => acts[id] && acts[id].verb === 'suspect' && acts[id].target)
      .forEach((id) => (hidden.suspicion[acts[id].target] = (hidden.suspicion[acts[id].target] || 0) + 1));

    let saved = null;
    const taken = [];
    if (victim) {
      if (victim === doc) saved = 'doctor';
      else if (victim === guard) saved = 'bodyguard';
      else if (wa.save && hidden.witch.save) {
        saved = 'witch';
        hidden.witch.save = false;
        recap.witchSave = true;
      } else taken.push(victim);
    }
    if (wa.target && hidden.witch.kill) {
      hidden.witch.kill = false;
      recap.witchKill = wa.target;
      if (taken.indexOf(wa.target) < 0) taken.push(wa.target);
    }
    hidden.last.doctor = doc;
    hidden.last.bodyguard = guard;
    recap.saved = saved;
    recap.taken = taken.slice();
    taken.forEach((id) => kill(pub, hidden, id, id === victim ? 'wolves' : 'witch', n));
    hidden.recap.push(Object.assign({ t: 'night' }, recap));
    const entry = { t: 'dawn', n, taken: taken.slice(), saved: saved ? (saved === 'doctor' ? 'doctor' : saved === 'bodyguard' ? 'protected' : 'potion') : null, quiet: !victim && !taken.length };
    if (s.reveal) entry.roles = taken.reduce((m, id) => ((m[id] = hidden.roles[id]), m), {});
    pushLog(pub, entry);
    pub.phase = 'dawn';
    pub.actedN = 0;
    hidden.acts = {};
    hidden.acted = [];
  }

  // ---------------- day ----------------

  function startDay(pub) {
    pub.phase = 'day';
    pub.day = pub.night;
    pub.nominations = {};
    pub.voted = [];
    pushLog(pub, { t: 'day', n: pub.day });
  }

  function startVote(pub, hidden) {
    const noms = [];
    Object.keys(pub.nominations || {}).forEach((k) => {
      const t = pub.nominations[k];
      if (isAlive(pub, t) && noms.indexOf(t) < 0) noms.push(t);
    });
    pub.phase = 'vote';
    pub.revote = false;
    pub.candidates = noms.length ? pub.alive.filter((id) => noms.indexOf(id) >= 0) : pub.alive.slice();
    pub.voted = [];
    hidden.votes = {};
  }

  /** Count: most votes out, unless "no one" matches it; a top tie → one revote, then nobody. */
  function tallyVotes(pub, hidden) {
    const counts = {};
    let skip = 0;
    Object.keys(hidden.votes).forEach((v) => {
      const t = hidden.votes[v];
      if (t === 'skip') skip += 1;
      else if (t) counts[t] = (counts[t] || 0) + 1;
    });
    const max = Object.keys(counts).reduce((m, k) => Math.max(m, counts[k]), 0);
    const top = max ? Object.keys(counts).filter((k) => counts[k] === max) : [];
    return { counts, skip, max, top };
  }

  function eliminateByVote(pub, hidden, settings, out, extra) {
    const entry = Object.assign({ t: 'vote', n: pub.day, out: out || null }, extra || {});
    if (out) {
      kill(pub, hidden, out, 'vote', pub.day);
      if (mergeSettings(settings).reveal || hidden.roles[out] === 'tanner') entry.role = hidden.roles[out];
    }
    hidden.recap.push({ t: 'day', day: pub.day, out: out || null, votes: entry.votes || null, tie: !!entry.tie });
    pushLog(pub, entry);
    if (out && hidden.roles[out] === 'tanner') {
      finish(pub, hidden, 'tanner', out);
      return;
    }
    pub.phase = 'verdict';
    pub.voted = [];
  }

  function closeVote(pub, hidden, settings) {
    const t = tallyVotes(pub, hidden);
    const votes = Object.assign({}, hidden.votes);
    if (!t.max || t.skip >= t.max) return eliminateByVote(pub, hidden, settings, null, { votes, skip: t.skip });
    if (t.top.length > 1) {
      if (!pub.revote) {
        pushLog(pub, { t: 'tie', n: pub.day, ids: t.top.slice(), votes });
        pub.phase = 'vote';
        pub.revote = true;
        pub.candidates = pub.alive.filter((id) => t.top.indexOf(id) >= 0);
        pub.voted = [];
        hidden.votes = {};
        return;
      }
      return eliminateByVote(pub, hidden, settings, null, { votes, tie: true });
    }
    return eliminateByVote(pub, hidden, settings, t.top[0], { votes, count: t.max });
  }

  // ---------------- flow ----------------

  function finish(pub, hidden, winner, tanner) {
    pub.phase = 'over';
    pub.winner = winner;
    pub.hunter = null;
    pub.hunterQueue = [];
    pushLog(pub, { t: 'win', winner, tanner: tanner || null });
    const suspects = Object.keys(hidden.suspicion)
      .map((id) => ({ id, n: hidden.suspicion[id], role: hidden.roles[id] }))
      .sort((a, b) => b.n - a.n);
    pub.result = {
      winner,
      tanner: tanner || null,
      roles: Object.assign({}, hidden.roles),
      recap: JSON.parse(JSON.stringify(hidden.recap)),
      suspicion: suspects,
      nights: pub.night,
    };
  }

  /** After a dawn / verdict (or a Hunter's shot): next Hunter, a win, or the next phase. */
  function advance(pub, hidden, after) {
    if (pub.hunterQueue.length) {
      pub.hunter = pub.hunterQueue.shift();
      pub.after = after;
      pub.phase = 'hunter';
      return;
    }
    pub.hunter = null;
    const w = winnerOf(pub, hidden);
    if (w) return finish(pub, hidden, w);
    if (after === 'day') startDay(pub);
    else startNight(pub, hidden);
  }

  /**
   * Reducer. Returns { pub, ... } or { error }. `id` = the acting player.
   * Actions: begin | night {id, target, save?} | closeNight | continue | startVote | nominate {id, target}
   *          | vote {id, target|'skip'} | closeVote | quickVote {out|null, tied?} | shoot {id?, target|null}
   */
  function applyAction(pub, hidden, settings, action, rng) {
    const a = action || {};
    const p = pub;
    switch (a.type) {
      case 'begin':
        if (p.phase !== 'reveal') return { error: 'phase' };
        startNight(p, hidden);
        return { pub: p };

      case 'night': {
        if (p.phase !== 'night') return { error: 'phase' };
        if (!isAlive(p, a.id)) return { error: 'not_alive' };
        const bad = validNight(p, hidden, settings, a);
        if (bad) return { error: bad };
        const step = nightStep(p, hidden, settings, a.id);
        const act = { verb: step.verb, target: a.target || null };
        if (step.role === 'witch') act.save = !!a.save && hidden.witch.save;
        let result = null;
        if (step.role === 'seer') {
          result = hidden.roles[a.target] === 'wolf' ? 'wolves' : 'village';
          act.result = result;
          const prev = hidden.seerLog.filter((x) => x.night === p.night);
          if (!prev.length) hidden.seerLog.push({ night: p.night, target: a.target, team: result });
          else return { error: 'already_checked' };
        }
        hidden.acts[a.id] = act;
        if (hidden.acted.indexOf(a.id) < 0) hidden.acted.push(a.id);
        p.actedN = hidden.acted.length;
        if (hidden.acted.length >= p.alive.length) resolveNight(p, hidden, settings, rng);
        return { pub: p, result };
      }

      case 'closeNight':
        if (p.phase !== 'night') return { error: 'phase' };
        resolveNight(p, hidden, settings, rng);
        return { pub: p };

      case 'continue':
        if (p.phase === 'dawn') advance(p, hidden, 'day');
        else if (p.phase === 'verdict') advance(p, hidden, 'night');
        else return { error: 'phase' };
        return { pub: p };

      case 'startVote':
        if (p.phase !== 'day') return { error: 'phase' };
        startVote(p, hidden);
        return { pub: p };

      case 'nominate':
        if (p.phase !== 'day') return { error: 'phase' };
        if (!isAlive(p, a.id)) return { error: 'not_alive' };
        if (a.target && !isAlive(p, a.target)) return { error: 'bad_target' };
        if (a.target) p.nominations[a.id] = a.target;
        else delete p.nominations[a.id];
        return { pub: p };

      case 'vote':
        if (p.phase !== 'vote') return { error: 'phase' };
        if (!isAlive(p, a.id)) return { error: 'not_alive' };
        if (a.target !== 'skip' && p.candidates.indexOf(a.target) < 0) return { error: 'bad_target' };
        hidden.votes[a.id] = a.target;
        if (p.voted.indexOf(a.id) < 0) p.voted.push(a.id);
        if (p.voted.length >= p.alive.length) closeVote(p, hidden, settings);
        return { pub: p };

      case 'closeVote':
        if (p.phase !== 'vote') return { error: 'phase' };
        closeVote(p, hidden, settings);
        return { pub: p };

      case 'quickVote': {
        // One phone: everyone points on three, the host taps the result.
        if (p.phase !== 'vote') return { error: 'phase' };
        const tied = (a.tied || []).filter((id) => p.candidates.indexOf(id) >= 0);
        if (tied.length > 1) {
          if (!p.revote) {
            pushLog(p, { t: 'tie', n: p.day, ids: tied.slice() });
            p.revote = true;
            p.candidates = p.alive.filter((id) => tied.indexOf(id) >= 0);
            return { pub: p };
          }
          eliminateByVote(p, hidden, settings, null, { tie: true, quick: true });
          return { pub: p };
        }
        if (a.out && p.candidates.indexOf(a.out) < 0) return { error: 'bad_target' };
        eliminateByVote(p, hidden, settings, a.out || null, { quick: true });
        return { pub: p };
      }

      case 'shoot': {
        if (p.phase !== 'hunter') return { error: 'phase' };
        if (a.id && a.id !== p.hunter) return { error: 'not_hunter' };
        const by = p.hunter;
        const target = a.target && isAlive(p, a.target) ? a.target : null;
        const entry = { t: 'shot', by, target };
        if (target) {
          kill(p, hidden, target, 'hunter', p.night);
          if (mergeSettings(settings).reveal) entry.role = hidden.roles[target];
        }
        hidden.recap.push({ t: 'shot', by, target });
        pushLog(p, entry);
        advance(p, hidden, p.after || 'night');
        return { pub: p };
      }

      default:
        return { error: 'unknown_action' };
    }
  }

  /** A player left the room mid-game: out of the game, quietly. May end a phase or the game. */
  function removePlayer(pub, hidden, settings, id, rng) {
    if (!isAlive(pub, id) || pub.phase === 'over') return pub;
    kill(pub, hidden, id, 'left');
    pushLog(pub, { t: 'left', id, role: mergeSettings(settings).reveal ? hidden.roles[id] : null });
    hidden.recap.push({ t: 'left', id });
    delete hidden.votes[id];
    delete hidden.acts[id];
    hidden.acted = hidden.acted.filter((x) => x !== id);
    pub.voted = pub.voted.filter((x) => x !== id);
    delete pub.nominations[id];
    pub.candidates = pub.candidates.filter((x) => x !== id);
    if (pub.hunter === id) pub.hunter = null;
    const w = winnerOf(pub, hidden);
    if (w && pub.phase !== 'reveal') {
      finish(pub, hidden, w);
      return pub;
    }
    if (pub.phase === 'hunter' && !pub.hunter) advance(pub, hidden, pub.after || 'night');
    else if (pub.phase === 'night' && hidden.acted.length >= pub.alive.length) resolveNight(pub, hidden, settings, rng);
    else if (pub.phase === 'vote' && pub.voted.length >= pub.alive.length) closeVote(pub, hidden, settings);
    return pub;
  }

  // ---------------- views ----------------

  /** Shared state: no roles, no night choices, no uncounted votes (those live in `hidden`). */
  function publicView(pub) {
    return JSON.parse(JSON.stringify(pub));
  }

  function hydrateState(pub) {
    if (!pub) return pub;
    pub.players = pub.players || [];
    pub.alive = pub.alive || [];
    pub.voted = pub.voted || [];
    pub.nominations = pub.nominations || {};
    pub.candidates = pub.candidates || [];
    pub.hunterQueue = pub.hunterQueue || [];
    pub.log = (pub.log || []).map((e) => {
      if (e.t === 'dawn') e.taken = e.taken || [];
      if (e.t === 'tie') e.ids = e.ids || [];
      return e;
    });
    pub.night = Number(pub.night) || 0;
    pub.day = Number(pub.day) || 0;
    pub.actedN = Number(pub.actedN) || 0;
    pub.revote = !!pub.revote;
    pub.hunter = pub.hunter || null;
    pub.after = pub.after || null;
    pub.winner = pub.winner || null;
    pub.result = pub.result || null;
    if (pub.result) {
      pub.result.recap = (pub.result.recap || []).map((r) => {
        if (r.t === 'night') {
          r.wolves = r.wolves || {};
          r.taken = r.taken || [];
        }
        return r;
      });
      pub.result.suspicion = pub.result.suspicion || [];
      pub.result.roles = pub.result.roles || {};
    }
    return pub;
  }

  function hydrateHidden(h) {
    const x = h || {};
    x.roles = x.roles || {};
    x.witch = Object.assign({ save: false, kill: false }, x.witch || {});
    x.last = Object.assign({ doctor: null, bodyguard: null }, x.last || {});
    x.acts = x.acts || {};
    x.acted = x.acted || [];
    x.votes = x.votes || {};
    x.seerLog = x.seerLog || [];
    x.recap = x.recap || [];
    x.suspicion = x.suspicion || {};
    return x;
  }

  // ---------------- narration ----------------

  /** Narrator line for one public log entry (names via nm; `lines` = localised theme lines). */
  function narrate(entry, th, nm, lines) {
    const L = lines || theme(th).lines;
    const name = (id) => (nm ? nm(id) : id);
    if (!entry) return '';
    switch (entry.t) {
      case 'night':
        return L.night;
      case 'dawn': {
        if (entry.taken && entry.taken.length) {
          const many = entry.taken.length > 1;
          return L.wake + ' ' + fill(L.taken, { names: joinNames(entry.taken.map(name)), was: many ? 'were' : 'was', they: many ? 'they' : 'they' });
        }
        if (entry.saved) return L.wake + ' ' + (entry.saved === 'doctor' ? L.saved : L[entry.saved] || L.potion);
        return L.wake + ' ' + L.quiet;
      }
      case 'day':
        return L.day;
      case 'tie':
        return fill(L.tie, { names: joinNames(entry.ids.map(name)) });
      case 'vote':
        return entry.out ? fill(L.out, { name: name(entry.out) }) : L.noOut;
      case 'shot':
        return entry.target ? fill(L.shot, { by: name(entry.by), name: name(entry.target) }) : fill(L.noShot, { by: name(entry.by) });
      case 'left':
        return name(entry.id) + ' left the game.';
      case 'win':
        return fill(L.win[entry.winner] || '', { name: entry.tanner ? name(entry.tanner) : '' });
      default:
        return '';
    }
  }

  return {
    MIN_PLAYERS,
    MAX_PASS,
    MAX_ROOM,
    MAX_PLAYERS,
    BEST_WITH,
    ROLE_IDS,
    TEAM,
    OPTIONAL,
    THEMES,
    DISCUSS_OPTIONS,
    NIGHT_OPTIONS,
    VOTE_OPTIONS,
    DEFAULT_SETTINGS,
    mergeSettings,
    theme,
    roleName,
    roleIcon,
    teamName,
    fill,
    joinNames,
    autoWolves,
    maxWolves,
    wolvesFor,
    rolesFor,
    balance,
    createGame,
    isAlive,
    roleOf,
    winnerOf,
    plurality,
    wolfPick,
    wolfVotes,
    nightStep,
    tallyVotes,
    applyAction,
    removePlayer,
    publicView,
    hydrateState,
    hydrateHidden,
    narrate,
  };
});
