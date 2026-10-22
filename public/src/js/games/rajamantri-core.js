/**
 * Raja Mantri Chor Sipahi — pure round logic shared by Pass & Play (client) and Room (server-lib/party-deal.js).
 * Chits are dealt into `hidden`; `pub` only ever holds chits that have been revealed out loud.
 * UMD: window.RajaMantriCore / require().
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
  const PC = typeof module === 'object' && module.exports ? require('./party-core.js') : root.PartyCore;
  const api = factory(PC);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RajaMantriCore = api;
})(typeof self !== 'undefined' ? self : this, function (PC) {
  'use strict';

  const MIN_PLAYERS = 4;
  const MAX_PLAYERS = 8;

  /** Chits. `thief` roles are the ones the guesser has to find. */
  const ROLES = {
    raja: { id: 'raja', en: 'Raja', hi: '', gloss: gtx('games.rajamantri.king', 'King'), points: 1000, icon: '👑' },
    rani: { id: 'rani', en: 'Rani', hi: '', gloss: gtx('games.rajamantri.queen', 'Queen'), points: 900, icon: '👸' },
    mantri: { id: 'mantri', en: 'Mantri', hi: '', gloss: gtx('games.rajamantri.minister', 'Minister'), points: 800, icon: '📜' },
    senapati: { id: 'senapati', en: 'Senapati', hi: '', gloss: gtx('games.rajamantri.general', 'General'), points: 700, icon: '⚔️' },
    daroga: { id: 'daroga', en: 'Daroga', hi: '', gloss: gtx('games.rajamantri.inspector', 'Inspector'), points: 600, icon: '🎖️' },
    sipahi: { id: 'sipahi', en: 'Sipahi', hi: '', gloss: gtx('games.rajamantri.soldier', 'Soldier'), points: 500, icon: '💂' },
    chor: { id: 'chor', en: 'Chor', hi: '', gloss: gtx('games.rajamantri.thief', 'Thief'), points: 0, icon: '🦹', thief: true },
    daku: { id: 'daku', en: 'Daku', hi: '', gloss: gtx('games.rajamantri.bandit', 'Bandit'), points: 0, icon: '🏴‍☠️', thief: true },
  };

  /** Classic four, then one role per extra player in this order (documented in the how-to). */
  const CLASSIC = ['raja', 'mantri', 'sipahi', 'chor'];
  const EXTENDED_ORDER = ['rani', 'daku', 'senapati', 'daroga'];

  const DEFAULT_SETTINGS = { rounds: 10, guesser: 'mantri' };
  const ROUND_OPTIONS = [5, 10, 15];

  const CALLS = {
    mantri: { en: gtx('games.rajamantri.mantri_find_the_chor', 'Mantri, find the Chor!'), hi: '', gloss: gtx('games.rajamantri.minister_find_the_thief', 'Minister, find the Thief!') },
    sipahi: { en: gtx('games.rajamantri.sipahi_catch_the_chor', 'Sipahi, catch the Chor!'), hi: '', gloss: gtx('games.rajamantri.soldier_catch_the_thief', 'Soldier, catch the Thief!') },
  };

  function mergeSettings(s) {
    const src = s || {};
    const out = Object.assign({}, DEFAULT_SETTINGS);
    const r = Number(src.rounds);
    if (ROUND_OPTIONS.indexOf(r) >= 0) out.rounds = r;
    if (src.guesser === 'sipahi' || src.guesser === 'mantri') out.guesser = src.guesser;
    return out;
  }

  /** Role ids in play for n players (4 → classic, 5–8 → extended). */
  function rolesFor(n) {
    if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new Error('players');
    return CLASSIC.concat(EXTENDED_ORDER.slice(0, n - MIN_PLAYERS));
  }

  function thievesFor(n) {
    return rolesFor(n).filter((r) => ROLES[r].thief);
  }

  function isExtended(n) {
    return n > MIN_PLAYERS;
  }

  /**
   * Deal one chit per player.
   * @returns {{ settings: object, hidden: { roles: Record<string,string> }, secrets: Record<string,{ role: string }> }}
   */
  function deal(players, settings, opts) {
    const ids = (players || []).slice();
    if (ids.length < MIN_PLAYERS) throw new Error('need_players');
    if (ids.length > MAX_PLAYERS) throw new Error('too_many_players');
    const s = mergeSettings(settings);
    const chits = PC.shuffle(rolesFor(ids.length), opts && opts.rng);
    const roles = {};
    const secrets = {};
    ids.forEach((id, i) => {
      roles[id] = chits[i];
      secrets[id] = { role: chits[i] };
    });
    return { settings: s, hidden: { roles }, secrets };
  }

  function holderOf(hidden, role) {
    return Object.keys(hidden.roles).find((id) => hidden.roles[id] === role) || null;
  }

  function createRound(players, settings) {
    const s = mergeSettings(settings);
    return {
      phase: 'reveal',
      players: players.slice(),
      revealed: {},
      raja: null,
      guesser: null,
      guesserRole: s.guesser,
      thiefOrder: thievesFor(players.length),
      pickIndex: 0,
      picks: [],
      result: null,
    };
  }

  /** Players the guesser may still point at. */
  function candidates(pub) {
    return pub.players.filter((id) => !pub.revealed[id] && id !== pub.guesser);
  }

  function currentThiefRole(pub) {
    return pub.phase === 'guess' ? pub.thiefOrder[pub.pickIndex] || null : null;
  }

  /**
   * Round points. Everyone keeps their chit, except: the guesser's points are staked evenly
   * across the thieves, and each wrong pick hands that thief its share. With one thief this is
   * the classic swap (Mantri 0, Chor 800).
   */
  function scoreRound(hidden, pub) {
    const points = {};
    Object.keys(hidden.roles).forEach((id) => (points[id] = ROLES[hidden.roles[id]].points));
    const g = pub.guesser;
    const stake = ROLES[pub.guesserRole].points;
    const n = pub.thiefOrder.length || 1;
    const share = Math.floor(stake / n);
    pub.picks.forEach((p, i) => {
      if (p.correct) return;
      const amount = i === n - 1 ? stake - share * (n - 1) : share;
      points[g] -= amount;
      points[p.thief] += amount;
    });
    return points;
  }

  function finish(pub, hidden) {
    const points = scoreRound(hidden, pub);
    pub.players.forEach((id) => (pub.revealed[id] = hidden.roles[id]));
    pub.phase = 'result';
    pub.result = {
      roles: Object.assign({}, hidden.roles),
      points,
      picks: pub.picks.map((p) => Object.assign({}, p)),
      guesser: pub.guesser,
      guesserRole: pub.guesserRole,
      raja: pub.raja,
      allCaught: pub.picks.every((p) => p.correct),
    };
    return pub;
  }

  /**
   * Reducer. Returns { pub } or { error }. `id` is the acting player in Room mode (omitted on one phone).
   * Actions: startRaja | revealRaja {id?} | revealGuesser {id?} | pick {id?, target}
   */
  function applyAction(pub, hidden, settings, action) {
    const a = action || {};
    const p = pub;
    switch (a.type) {
      case 'startRaja':
        if (p.phase !== 'reveal') return { error: 'phase' };
        p.phase = 'raja';
        return { pub: p };

      case 'revealRaja': {
        if (p.phase !== 'raja') return { error: 'phase' };
        const raja = holderOf(hidden, 'raja');
        if (a.id && a.id !== raja) return { error: 'not_raja' };
        p.raja = raja;
        p.revealed[raja] = 'raja';
        p.phase = 'call';
        return { pub: p };
      }

      case 'revealGuesser': {
        if (p.phase !== 'call') return { error: 'phase' };
        const g = holderOf(hidden, p.guesserRole);
        if (a.id && a.id !== g) return { error: 'not_guesser' };
        p.guesser = g;
        p.revealed[g] = p.guesserRole;
        p.phase = 'guess';
        return { pub: p };
      }

      case 'pick': {
        if (p.phase !== 'guess') return { error: 'phase' };
        if (a.id && a.id !== p.guesser) return { error: 'not_guesser' };
        if (candidates(p).indexOf(a.target) < 0) return { error: 'bad_target' };
        const role = p.thiefOrder[p.pickIndex];
        const thief = holderOf(hidden, role);
        const correct = a.target === thief;
        p.picks.push({ role, target: a.target, thief, correct });
        p.revealed[thief] = role;
        p.pickIndex += 1;
        if (p.pickIndex >= p.thiefOrder.length) finish(p, hidden);
        return { pub: p, correct };
      }

      default:
        return { error: 'unknown_action' };
    }
  }

  /** RTDB drops empty arrays / objects. */
  function hydrateState(pub) {
    if (!pub) return pub;
    pub.players = pub.players || [];
    pub.revealed = pub.revealed || {};
    pub.thiefOrder = pub.thiefOrder || [];
    pub.picks = pub.picks || [];
    pub.pickIndex = Number(pub.pickIndex) || 0;
    pub.raja = pub.raja || null;
    pub.guesser = pub.guesser || null;
    pub.result = pub.result || null;
    return pub;
  }

  /** Shared state already only holds revealed chits. */
  function publicView(pub) {
    return JSON.parse(JSON.stringify(pub));
  }

  /** Hindi role names / calls arrive as locale data (data/locales/hi/rajamantri.hi.js). */
  let QUOTE_HI = '';
  function applyLocale(lang, data) {
    if (!data || lang !== 'hi') return false;
    Object.keys(data.roles || {}).forEach((id) => {
      if (ROLES[id]) ROLES[id].hi = data.roles[id];
    });
    Object.keys(data.calls || {}).forEach((id) => {
      if (CALLS[id]) CALLS[id].hi = data.calls[id];
    });
    if (data.quote) QUOTE_HI = data.quote;
    return true;
  }
  function quoteHi() {
    return QUOTE_HI;
  }
  if (typeof module === 'object' && module.exports) {
    try {
      applyLocale('hi', require('../data/locales/hi/rajamantri.hi.js'));
    } catch (e) {}
  }

  function roleLabel(roleId, lang, both) {
    return PC.bilingualLabel(ROLES[roleId], lang, both);
  }

  /** Final standings from running totals. */
  function standings(scores) {
    return Object.keys(scores || {})
      .map((id) => ({ id, score: Number(scores[id]) || 0 }))
      .sort((a, b) => b.score - a.score);
  }

  return {
    MIN_PLAYERS,
    MAX_PLAYERS,
    ROLES,
    CLASSIC,
    EXTENDED_ORDER,
    DEFAULT_SETTINGS,
    ROUND_OPTIONS,
    CALLS,
    mergeSettings,
    rolesFor,
    thievesFor,
    isExtended,
    deal,
    holderOf,
    createRound,
    candidates,
    currentThiefRole,
    scoreRound,
    applyAction,
    hydrateState,
    publicView,
    roleLabel,
    standings,
    applyLocale,
    quoteHi,
  };
});
