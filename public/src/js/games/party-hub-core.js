/**
 * Party Hub — pure logic shared by the phone (Room + Pass & Play hub) and server-lib/party-hub.js.
 *
 * One group, many games. "Tonight's scoreboard" never adds raw game points (Imposter +2s, Charades
 * team totals, Werewolf wins) — each finished game is turned into a placing first:
 *
 *   PLACE_POINTS  1st 5 · 2nd 3 · 3rd 2 · everyone else who played 1
 *   ties share the better place (two joint winners both get 5, the next player is 3rd → 2)
 *   nobody pulled ahead (everyone level, e.g. Most Likely To without points) → everyone 1
 *   team games (Charades, Werewolf) place the whole winning side 1st and the other side 2nd
 *
 * No chips, no stakes — these are bragging-rights points for the night only.
 */
/** Game text: the catalog (t) in the browser; the English given here where there is no catalog (server rooms, Node). */
function gtx(key, en, params) {
  const g = typeof globalThis !== 'undefined' ? globalThis : {};
  if (typeof g.t === 'function') {
    const v = g.t(key, params || {});
    if (v && v !== key) return v;
  }
  const val = (k) => {
    const v = params && params[k];
    return v == null ? null : typeof v === 'object' && v.text != null ? v.text : String(v);
  };
  // English ICU {n, plural|selectordinal, one {…} other {…}} for the no-catalog path.
  const s = String(en).replace(/\{(\w+), (plural|selectordinal), ((?:=?\w+ \{(?:[^{}]|\{\{\w+\}\})*\}\s*)+)\}/g, (m, k, type, body) => {
    const n = Number(val(k));
    const cases = {};
    body.replace(/(=?\w+) \{((?:[^{}]|\{\{\w+\}\})*)\}/g, (x, c, txt) => (cases[c] = txt));
    let cat = 'other';
    try {
      cat = new Intl.PluralRules('en', { type: type === 'plural' ? 'cardinal' : 'ordinal' }).select(n);
    } catch (e) {}
    const txt = cases['=' + n] != null ? cases['=' + n] : cases[cat] != null ? cases[cat] : cases.other || '';
    return txt.replace(/#/g, String(n));
  });
  return s.replace(/\{\{(\w+)\}\}/g, (m, k) => (val(k) == null ? m : val(k)));
}

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PartyHubCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_HUB = 16;
  const MIN_HUB = 2;
  const PLACE_POINTS = [5, 3, 2];
  const PLAYED_POINTS = 1;
  const HISTORY_CAP = 30;

  /** Hub-pickable party titles (all Party Kit games — no stakes, no Live ratings). */
  const GAMES = [
    { id: 'imposter', label: gtx('dangal.party.imposter', 'Imposter'), icon: '🕵️', min: 3, max: 12, blurb: gtx('dangal.party.find_who_doesn_t_know_the', 'Find who doesn’t know the word') },
    { id: 'werewolf', label: gtx('dangal.party.werewolf', 'Werewolf'), icon: '🐺', min: 5, max: 16, blurb: gtx('dangal.party.hidden_roles_night_and_day', 'Hidden roles, night and day') },
    { id: 'charades', label: gtx('dangal.party.charades', 'Charades'), icon: '🎭', min: 4, max: 16, blurb: gtx('dangal.party.two_teams_act_it_out', 'Two teams, act it out') },
    { id: 'mostlikely', label: gtx('dangal.party.most_likely_to', 'Most Likely To'), icon: '👑', min: 3, max: 16, blurb: gtx('dangal.party.vote_reveal_laugh', 'Vote, reveal, laugh') },
    { id: 'rajamantri', label: gtx('dangal.party.raja_mantri_chor_sipahi', 'Raja Mantri Chor Sipahi'), icon: '👑', min: 4, max: 8, blurb: gtx('dangal.party.find_the_thief_king_minister_thief', 'Find the thief (King · Minister · Thief · Soldier)') },
  ];
  const GAME_IDS = GAMES.map((g) => g.id);

  function gameInfo(id) {
    return GAMES.find((g) => g.id === id) || null;
  }

  // ---------------- placing ----------------

  /** Group ids by score, best first (ties share a group). */
  function groupsByScore(ids, scores) {
    const s = scores || {};
    const sorted = ids.slice().sort((a, b) => (Number(s[b]) || 0) - (Number(s[a]) || 0));
    const groups = [];
    let last = null;
    sorted.forEach((id) => {
      const v = Number(s[id]) || 0;
      if (!groups.length || v !== last) groups.push([id]);
      else groups[groups.length - 1].push(id);
      last = v;
    });
    return groups;
  }

  /**
   * Finishing groups for one game, best first.
   * @param {string} game
   * @param {{ players: string[], scores?: object, state?: object }} r
   *   players = everyone who played to the end (leavers excluded); state = the game's public state.
   */
  function placingGroups(game, r) {
    const players = (r && r.players) || [];
    if (!players.length) return [];
    const st = (r && r.state) || null;
    const inGame = (id) => players.indexOf(id) >= 0;
    if (game === 'charades' && st && Array.isArray(st.teams) && st.teams.length === 2) {
      const t = st.teams.map((team) => (team || []).filter(inGame));
      const sc = Array.isArray(st.teamScores) ? st.teamScores : [0, 0];
      const loose = players.filter((id) => t[0].indexOf(id) < 0 && t[1].indexOf(id) < 0);
      let order;
      if (st.winner === 0 || st.winner === 1) order = [t[st.winner], t[1 - st.winner]];
      else if ((Number(sc[0]) || 0) !== (Number(sc[1]) || 0)) order = sc[0] > sc[1] ? [t[0], t[1]] : [t[1], t[0]];
      else order = [t[0].concat(t[1])];
      return order.concat([loose]).filter((g) => g.length);
    }
    if (game === 'werewolf' && st && st.result && st.result.winner) {
      const res = st.result;
      const roles = res.roles || {};
      const TEAM = { wolf: 'wolves', tanner: 'tanner' };
      const teamOf = (id) => TEAM[roles[id]] || 'village';
      const win = res.winner === 'tanner' ? players.filter((id) => id === res.tanner) : players.filter((id) => teamOf(id) === res.winner);
      const rest = players.filter((id) => win.indexOf(id) < 0);
      return [win, rest].filter((g) => g.length);
    }
    return groupsByScore(players, r.scores);
  }

  /**
   * Placing groups → tonight points (see header). Solo games skip places after a tie (two joint 2nds →
   * the next is 4th); team games rank sides densely (the losing side is 2nd, whatever its size).
   */
  function placingPoints(groups, dense) {
    const out = {};
    const gs = (groups || []).filter((g) => g && g.length);
    if (!gs.length) return out;
    if (gs.length === 1) {
      gs[0].forEach((id) => (out[id] = PLAYED_POINTS));
      return out;
    }
    let place = 0;
    gs.forEach((g) => {
      const pts = place < PLACE_POINTS.length ? PLACE_POINTS[place] : PLAYED_POINTS;
      g.forEach((id) => (out[id] = pts));
      place += dense ? 1 : g.length;
    });
    return out;
  }

  const TEAM_GAMES = ['charades', 'werewolf'];

  function pointsFor(game, r) {
    const st = (r && r.state) || null;
    const team = TEAM_GAMES.indexOf(game) >= 0 && st && (Array.isArray(st.teams) || (st.result && st.result.winner));
    return placingPoints(placingGroups(game, r), !!team);
  }

  function addPoints(tonight, points) {
    const t = Object.assign({}, tonight || {});
    Object.keys(points || {}).forEach((id) => (t[id] = (Number(t[id]) || 0) + (Number(points[id]) || 0)));
    return t;
  }

  /** [{ id, name, pts, games }] best first; `names` maps id → display name. */
  function standings(tonight, names, history) {
    const t = tonight || {};
    const played = {};
    (history || []).forEach((h) => Object.keys(h.points || {}).forEach((id) => (played[id] = (played[id] || 0) + 1)));
    const ids = Object.keys(Object.assign({}, names || {}, t));
    return ids
      .map((id) => ({ id, name: (names && names[id]) || gtx('dangal.party.player', 'Player'), pts: Number(t[id]) || 0, games: played[id] || 0 }))
      .sort((a, b) => b.pts - a.pts || b.games - a.games || String(a.name).localeCompare(String(b.name)));
  }

  // ---------------- seating + votes ----------------

  /**
   * Who plays the next game when the group is bigger than it fits: `satOut` (priority order — the
   * caller puts the host first, then last game's sit-outs) goes first, then seat order.
   * Returns { seated, out } in seat order.
   */
  function seatPlan(members, max, satOut) {
    const first = (satOut || []).filter((id, i, a) => members.indexOf(id) >= 0 && a.indexOf(id) === i);
    const order = first.concat(members.filter((id) => first.indexOf(id) < 0));
    const seated = order.slice(0, Math.max(0, max));
    return { seated: members.filter((id) => seated.indexOf(id) >= 0), out: members.filter((id) => seated.indexOf(id) < 0) };
  }

  /** Most-voted game; ties go to the host's own vote, then roster order. */
  function resolveVote(votes, hostVote) {
    const counts = {};
    Object.keys(votes || {}).forEach((uid) => {
      const g = votes[uid];
      if (GAME_IDS.indexOf(g) >= 0) counts[g] = (counts[g] || 0) + 1;
    });
    const max = Object.keys(counts).reduce((m, g) => Math.max(m, counts[g]), 0);
    if (!max) return null;
    const tied = GAME_IDS.filter((g) => counts[g] === max);
    if (hostVote && tied.indexOf(hostVote) >= 0) return hostVote;
    return tied[0];
  }

  // ---------------- Pass & Play night (offline, names are the ids) ----------------

  function cleanNames(list) {
    const seen = {};
    return (list || [])
      .map((n, i) => String(n || '').replace(/[<>]/g, '').trim().slice(0, 20) || gtx('dangal.party.player_n', 'Player {{n}}', { n: i + 1 }))
      .map((n) => {
        const k = n.toLowerCase();
        seen[k] = (seen[k] || 0) + 1;
        return seen[k] > 1 ? n + ' ' + seen[k] : n;
      })
      .slice(0, MAX_HUB);
  }

  function newPassNight(names, now) {
    return { v: 1, players: cleanNames(names), tonight: {}, history: [], startedAt: Number(now) || 0, current: null };
  }

  /** Record one finished Pass & Play game. `r.players` / scores / state use player names as ids. */
  function recordPass(night, game, r, now) {
    const n = JSON.parse(JSON.stringify(night || newPassNight([])));
    const players = ((r && r.players) || []).filter((name) => n.players.indexOf(name) >= 0);
    const points = pointsFor(game, Object.assign({}, r, { players }));
    if (!Object.keys(points).length) return n;
    n.tonight = addPoints(n.tonight, points);
    n.history.push({ game, points, at: Number(now) || 0 });
    n.history = n.history.slice(-HISTORY_CAP);
    n.current = null;
    return n;
  }

  /** Roster edits keep tonight's points for names that stay. */
  function setPassPlayers(night, names) {
    const n = JSON.parse(JSON.stringify(night || newPassNight([])));
    n.players = cleanNames(names);
    return n;
  }

  // ---------------- share ----------------

  function shareLine(rows, history) {
    const games = (history || []).map((h) => (gameInfo(h.game) || { label: h.game }).label);
    const top = (rows || []).filter((r) => r.pts > 0);
    if (!top.length) return gtx('dangal.party.party_night_games', 'Party night on Chaupaal — {gamesCount, plural, one {# game} other {# games}}', { gamesCount: games.length });
    const best = top[0].pts;
    const winners = top.filter((r) => r.pts === best).map((r) => r.name);
    const who = winners.length > 1 ? gtx('dangal.party.value_value2_share_the_crown', '{{value}} & {{value2}} share the crown', { value: winners.slice(0, -1).join(', '), value2: winners[winners.length - 1] }) : gtx('dangal.party.value_wins_the_night', '{{value}} wins the night', { value: winners[0] });
    return gtx('dangal.party.who_best_across_games', '{{who}} with {{best}} pts across {gamesCount, plural, one {# game} other {# games}}', { who, best, gamesCount: games.length });
  }

  return {
    MAX_HUB,
    MIN_HUB,
    PLACE_POINTS,
    PLAYED_POINTS,
    HISTORY_CAP,
    GAMES,
    GAME_IDS,
    gameInfo,
    groupsByScore,
    placingGroups,
    placingPoints,
    pointsFor,
    addPoints,
    standings,
    seatPlan,
    resolveVote,
    cleanNames,
    newPassNight,
    recordPass,
    setPassPlayers,
    shareLine,
  };
});
