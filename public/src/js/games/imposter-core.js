/**
 * Imposter — pure round logic shared by Pass & Play (client) and Room mode (server-lib/party-deal.js).
 * No DOM, no network. Public state (`pub`) is safe to share; `hidden` holds roles + words and only
 * enters `pub` at the result screen. Per-player `secrets` are handed out one player at a time.
 */
(function (root, factory) {
  const packs =
    typeof module === 'object' && module.exports
      ? require('../data/imposter-packs.js')
      : root.IMPOSTER_PACKS;
  const core = factory(packs);
  if (typeof module === 'object' && module.exports) module.exports = core;
  else root.ImposterCore = core;
})(typeof self !== 'undefined' ? self : this, function (PACKS_MOD) {
  'use strict';

  const MIN_PLAYERS = 3;
  const MAX_PLAYERS = 12;
  const DEFAULT_SETTINGS = {
    pack: 'mixed',
    variant: 'classic', // 'classic' | 'undercover'
    hint: true, // Classic only — imposter sees the category
    imposters: 0, // 0 = auto (1, or 2 at 7+ players)
    circuits: 1, // 1 | 2 clue circuits
    discussionSec: 90,
    clueSec: 45, // Room mode: per-turn clue timer before auto-skip
    voteSec: 60,
    defenceSec: 20,
    voteStyle: 'group', // Pass & Play: 'group' (host taps accused) | 'secret' (pass-around)
  };

  // ---------------- text helpers ----------------

  /** Lowercase, strip accents / nukta / punctuation / spaces — forgiving comparison key. */
  function normalize(s) {
    return String(s == null ? '' : s)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\u093c/g, '')
      .toLowerCase()
      .replace(/[\s'’`".,!?\-_/()&:;]+/g, '');
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  /** Words a guess may match: English, Hindi, and listed alternate spellings. */
  function labelsOf(word) {
    if (!word) return [];
    return [word.en, word.hi].concat(Array.isArray(word.alts) ? word.alts : []).filter(Boolean);
  }

  /**
   * Forgiving steal match — case, spaces, punctuation, Hindi/English label, alt spellings,
   * a trailing plural "s", and small typos on longer Latin words.
   */
  function matchGuess(guess, word) {
    const g = normalize(guess);
    if (!g || !word) return false;
    const targets = labelsOf(word).map(normalize).filter(Boolean);
    for (const t of targets) {
      if (g === t) return true;
      const sing = (x) => x.replace(/(?:es|s)$/, '');
      if (g.replace(/s$/, '') === t.replace(/s$/, '') || sing(g) === sing(t) || sing(g) === t || g === sing(t)) return true;
      const latin = /^[a-z0-9]+$/.test(t) && /^[a-z0-9]+$/.test(g);
      if (!latin) continue;
      const tol = t.length >= 8 ? 2 : t.length >= 4 ? 1 : 0;
      if (tol && Math.abs(g.length - t.length) <= tol && levenshtein(g, t) <= tol) return true;
    }
    return false;
  }

  /**
   * One-word clue rule. Rejects: empty, more than one word, too long, repeats, and — when the
   * giver knows a word — the word itself, its translation, or an obvious part of it.
   * @param {string} text
   * @param {{ word?: object|null, used?: string[] }} ctx word = the giver's own word (null for a Classic imposter)
   * @returns {{ ok: true, text: string } | { ok: false, reason: string }}
   */
  function validateClue(text, ctx) {
    const c = ctx || {};
    const clean = String(text == null ? '' : text).trim().replace(/\s+/g, ' ');
    if (!clean) return { ok: false, reason: 'empty' };
    if (/\s/.test(clean)) return { ok: false, reason: 'one_word' };
    if (clean.length > 24) return { ok: false, reason: 'too_long' };
    const key = normalize(clean);
    if (!key) return { ok: false, reason: 'empty' };
    const used = (c.used || []).map(normalize);
    if (used.indexOf(key) >= 0) return { ok: false, reason: 'repeat' };
    if (c.word) {
      if (matchGuess(clean, c.word)) return { ok: false, reason: 'secret' };
      const parts = [];
      labelsOf(c.word).forEach((l) => {
        parts.push(normalize(l));
        String(l)
          .split(/[\s\-]+/)
          .forEach((p) => parts.push(normalize(p)));
      });
      for (const p of parts) {
        if (!p) continue;
        if (p === key) return { ok: false, reason: 'secret' };
        if (key.length >= 3 && p.length >= 3 && (p.indexOf(key) >= 0 || key.indexOf(p) >= 0)) {
          return { ok: false, reason: 'part' };
        }
      }
    }
    return { ok: true, text: clean };
  }

  const CLUE_REASON_COPY = {
    empty: 'Type a one-word clue',
    one_word: 'One word only',
    too_long: 'Keep it to one short word',
    repeat: 'Someone already said that',
    secret: 'That gives the word away — try another',
    part: 'Too close to the word — try another',
  };

  // ---------------- dealing ----------------

  function defaultImposterCount(n) {
    return n >= 7 ? 2 : 1;
  }

  function maxImposters(n) {
    return Math.max(1, Math.floor(n / 3));
  }

  function resolveImposterCount(n, requested) {
    const r = Number(requested) || 0;
    const want = r > 0 ? r : defaultImposterCount(n);
    return Math.max(1, Math.min(maxImposters(n), want));
  }

  function mergeSettings(s) {
    const out = Object.assign({}, DEFAULT_SETTINGS, s || {});
    out.variant = out.variant === 'undercover' ? 'undercover' : 'classic';
    out.hint = out.hint !== false;
    out.circuits = Number(out.circuits) === 2 ? 2 : 1;
    out.discussionSec = Math.max(0, Math.min(600, Number(out.discussionSec) || 0));
    out.clueSec = Math.max(10, Math.min(180, Number(out.clueSec) || DEFAULT_SETTINGS.clueSec));
    out.voteSec = Math.max(15, Math.min(300, Number(out.voteSec) || DEFAULT_SETTINGS.voteSec));
    out.defenceSec = Math.max(5, Math.min(120, Number(out.defenceSec) || DEFAULT_SETTINGS.defenceSec));
    out.voteStyle = out.voteStyle === 'secret' ? 'secret' : 'group';
    out.imposters = Math.max(0, Math.min(4, Number(out.imposters) || 0));
    const packOk = out.pack === 'mixed' || !!PACKS_MOD.getPack(out.pack);
    if (!packOk) out.pack = 'mixed';
    return out;
  }

  function toWord(en, hi, alts) {
    return { en, hi, alts: Array.isArray(alts) ? alts.slice() : [] };
  }

  /** Pick a (pack, word) not yet used this session. */
  function pickWord(packId, rng, usedKeys) {
    const used = new Set(usedKeys || []);
    const pool = [];
    const packs = packId === 'mixed' ? PACKS_MOD.PACKS : [PACKS_MOD.getPack(packId)].filter(Boolean);
    packs.forEach((p) => p.words.forEach((row, i) => pool.push({ p, row, key: p.id + ':' + i })));
    let fresh = pool.filter((x) => !used.has(x.key));
    if (!fresh.length) fresh = pool;
    return fresh[Math.floor(rng() * fresh.length) % fresh.length];
  }

  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  /**
   * Deal a round: exactly k imposters, words + per-player secrets.
   * @param {string[]} players seat order (ids)
   * @param {object} settings
   * @param {{ rng?: () => number, usedKeys?: string[] }} [opts]
   */
  function deal(players, settings, opts) {
    const o = opts || {};
    const rng = typeof o.rng === 'function' ? o.rng : Math.random;
    const s = mergeSettings(settings);
    const ids = players.slice();
    if (ids.length < MIN_PLAYERS || ids.length > MAX_PLAYERS) throw new Error('player_count');
    const k = resolveImposterCount(ids.length, s.imposters);
    const imposters = shuffle(ids, rng).slice(0, k);
    const pick = pickWord(s.pack, rng, o.usedKeys);
    const row = pick.row;
    let majority = toWord(row[0], row[1], row[4]);
    let minority = toWord(row[2], row[3]);
    // Undercover: either side of the pair can be the majority, so "my word feels rarer" isn't a tell.
    if (s.variant === 'undercover' && rng() < 0.5) {
      const t = majority;
      majority = minority;
      minority = t;
    }
    const category = { id: pick.p.id, en: pick.p.en, hi: pick.p.hi };
    const secrets = {};
    ids.forEach((id) => {
      const isImp = imposters.indexOf(id) >= 0;
      if (s.variant === 'undercover') {
        const w = isImp ? minority : majority;
        // No role flag — an Undercover imposter must not be able to tell from their own card.
        secrets[id] = { word: { en: w.en, hi: w.hi } };
      } else if (isImp) {
        secrets[id] = { imposter: true, hint: s.hint ? { en: category.en, hi: category.hi } : null };
      } else {
        secrets[id] = { word: { en: majority.en, hi: majority.hi } };
      }
    });
    const hidden = {
      imposters,
      majority,
      minority: s.variant === 'undercover' ? minority : null,
      category,
      key: pick.key,
    };
    return { settings: s, hidden, secrets, key: pick.key };
  }

  /** The word a player actually holds (null for a Classic imposter) — for clue validation. */
  function wordFor(hidden, settings, id) {
    const isImp = hidden.imposters.indexOf(id) >= 0;
    if (!isImp) return hidden.majority;
    return settings.variant === 'undercover' ? hidden.minority : null;
  }

  // ---------------- round state machine ----------------

  function clueOrder(players, starterIndex) {
    const n = players.length;
    const s = ((Number(starterIndex) || 0) % n + n) % n;
    return players.slice(s).concat(players.slice(0, s));
  }

  /**
   * Fresh public round state (no secrets).
   * @param {string[]} players
   * @param {object} settings merged settings
   * @param {number} starterIndex
   */
  function createRound(players, settings, starterIndex) {
    const order = clueOrder(players, starterIndex);
    return {
      phase: 'reveal',
      players: players.slice(),
      order,
      starter: order[0],
      turn: 0,
      totalTurns: order.length * settings.circuits,
      clues: [],
      voteRound: 1,
      revote: false,
      candidates: [],
      voters: [],
      votes: {},
      voted: [],
      tied: [],
      caught: [],
      stealer: null,
      accusedInnocent: null,
      lastAccused: null,
      result: null,
    };
  }

  function currentClueGiver(pub) {
    if (pub.phase !== 'clues' || !pub.order.length) return null;
    return pub.order[pub.turn % pub.order.length];
  }

  function caughtIds(pub) {
    return pub.caught.map((c) => c.id);
  }

  function openVote(pub, candidates) {
    const caught = caughtIds(pub);
    pub.phase = pub.revote ? 'revote' : 'vote';
    pub.candidates = candidates.filter((id) => caught.indexOf(id) < 0);
    pub.voters = pub.players.filter((id) => caught.indexOf(id) < 0);
    pub.votes = {};
    pub.voted = [];
    return pub;
  }

  /**
   * Count votes. Returns top candidates (ties possible). Votes for non-candidates are ignored.
   * @param {Record<string,string>} votes voter → target
   * @param {string[]} candidates
   */
  function tallyVotes(votes, candidates) {
    const counts = {};
    candidates.forEach((c) => (counts[c] = 0));
    Object.keys(votes || {}).forEach((v) => {
      const t = votes[v];
      if (Object.prototype.hasOwnProperty.call(counts, t)) counts[t] += 1;
    });
    let max = 0;
    Object.keys(counts).forEach((c) => (max = Math.max(max, counts[c])));
    const top = max > 0 ? candidates.filter((c) => counts[c] === max) : [];
    return { counts, max, top };
  }

  /**
   * Vote outcome. First vote tie → defence + revote among the tied. Revote tie (or no votes) → imposters survive.
   * @returns {{ outcome: 'accused', id: string } | { outcome: 'tie', tied: string[] } | { outcome: 'survive' }}
   */
  function resolveVote(tally, isRevote) {
    if (!tally.top.length) return { outcome: 'survive' };
    if (tally.top.length === 1) return { outcome: 'accused', id: tally.top[0] };
    if (isRevote) return { outcome: 'survive' };
    return { outcome: 'tie', tied: tally.top.slice() };
  }

  /**
   * Round points (virtual, session only).
   *  Crew: +1 each per imposter caught whose steal failed.
   *  Imposter: +2 for surviving (never caught, or round ended while uncaught), +2 for a correct steal.
   */
  function scoreRound(players, imposters, caught) {
    const pts = {};
    players.forEach((p) => (pts[p] = 0));
    const crew = players.filter((p) => imposters.indexOf(p) < 0);
    const caughtSet = new Set(caught.map((c) => c.id));
    caught.forEach((c) => {
      if (c.stealOk) pts[c.id] += 2;
      else crew.forEach((m) => (pts[m] += 1));
    });
    imposters.forEach((id) => {
      if (!caughtSet.has(id)) pts[id] += 2;
    });
    return pts;
  }

  function finishRound(pub, hidden, reason) {
    const survivors = hidden.imposters.filter((id) => caughtIds(pub).indexOf(id) < 0);
    const points = scoreRound(pub.players, hidden.imposters, pub.caught);
    const stoleWin = pub.caught.some((c) => c.stealOk);
    let winner = 'crew';
    if (survivors.length || stoleWin) winner = 'imposter';
    pub.phase = 'result';
    pub.stealer = null;
    pub.result = {
      reason,
      winner,
      imposters: hidden.imposters.slice(),
      survivors,
      majority: { en: hidden.majority.en, hi: hidden.majority.hi },
      minority: hidden.minority ? { en: hidden.minority.en, hi: hidden.minority.hi } : null,
      category: hidden.category ? Object.assign({}, hidden.category) : null,
      caught: pub.caught.map((c) => Object.assign({}, c)),
      points,
    };
    return pub;
  }

  /** Apply the outcome of a vote / host accusation. */
  function applyOutcome(pub, hidden, out) {
    if (out.outcome === 'tie') {
      pub.phase = 'defence';
      pub.tied = out.tied.slice();
      return pub;
    }
    if (out.outcome === 'survive') {
      pub.revote = false;
      return finishRound(pub, hidden, 'tie_survive');
    }
    const id = out.id;
    pub.lastAccused = id;
    pub.revote = false;
    pub.tied = [];
    if (hidden.imposters.indexOf(id) >= 0) {
      pub.caught.push({ id, guess: null, stealOk: null });
      pub.phase = 'steal';
      pub.stealer = id;
      return pub;
    }
    pub.accusedInnocent = id;
    return finishRound(pub, hidden, 'wrong_accused');
  }

  /**
   * Reducer. Returns { pub } or { error }. Time/deadlines are the caller's job.
   * Actions:
   *   startClues | clue {id,text} | spoken | skipTurn | startDiscussion | startVote
   *   vote {id,target} | closeVote | accuse {target} | declareTie {tied} | endDefence
   *   steal {id,guess} | stealVerdict {ok}
   */
  function applyAction(pub, hidden, settings, action) {
    const a = action || {};
    const p = pub;
    switch (a.type) {
      case 'startClues':
        if (p.phase !== 'reveal') return { error: 'phase' };
        p.phase = 'clues';
        p.turn = 0;
        return { pub: p };

      case 'clue': {
        if (p.phase !== 'clues') return { error: 'phase' };
        if (currentClueGiver(p) !== a.id) return { error: 'not_your_turn' };
        const v = validateClue(a.text, {
          word: wordFor(hidden, settings, a.id),
          used: p.clues.map((c) => c.text).filter(Boolean),
        });
        if (!v.ok) return { error: 'clue_' + v.reason, reason: v.reason };
        p.clues.push({ id: a.id, text: v.text });
        return { pub: advanceTurn(p) };
      }

      case 'skipTurn':
        if (p.phase !== 'clues') return { error: 'phase' };
        p.clues.push({ id: currentClueGiver(p), text: '', skipped: true });
        return { pub: advanceTurn(p) };

      case 'spoken':
        // Pass & Play — the clue was said out loud; the app only tracks whose turn it is.
        if (p.phase !== 'clues') return { error: 'phase' };
        p.clues.push({ id: currentClueGiver(p), text: '', spoken: true });
        return { pub: advanceTurn(p) };

      case 'startDiscussion':
        if (p.phase !== 'clues') return { error: 'phase' };
        p.phase = 'discuss';
        return { pub: p };

      case 'startVote':
        if (p.phase !== 'discuss' && p.phase !== 'clues') return { error: 'phase' };
        p.revote = false;
        return { pub: openVote(p, p.players) };

      case 'vote': {
        if (p.phase !== 'vote' && p.phase !== 'revote') return { error: 'phase' };
        if (p.voters.indexOf(a.id) < 0) return { error: 'not_voter' };
        if (p.candidates.indexOf(a.target) < 0 || a.target === a.id) return { error: 'bad_target' };
        if (p.voted.indexOf(a.id) >= 0) return { error: 'already_voted' };
        p.votes[a.id] = a.target;
        p.voted.push(a.id);
        if (p.voted.length >= p.voters.length) return { pub: closeVote(p, hidden) };
        return { pub: p };
      }

      case 'closeVote':
        if (p.phase !== 'vote' && p.phase !== 'revote') return { error: 'phase' };
        return { pub: closeVote(p, hidden) };

      case 'accuse':
        if (p.phase !== 'vote' && p.phase !== 'revote') return { error: 'phase' };
        if (p.candidates.indexOf(a.target) < 0) return { error: 'bad_target' };
        p.lastTally = null;
        return { pub: applyOutcome(p, hidden, { outcome: 'accused', id: a.target }) };

      case 'declareTie': {
        if (p.phase !== 'vote' && p.phase !== 'revote') return { error: 'phase' };
        const tied = (a.tied || []).filter((id) => p.candidates.indexOf(id) >= 0);
        if (tied.length < 2) return { error: 'bad_tie' };
        const out = p.phase === 'revote' ? { outcome: 'survive' } : { outcome: 'tie', tied };
        return { pub: applyOutcome(p, hidden, out) };
      }

      case 'endDefence':
        if (p.phase !== 'defence') return { error: 'phase' };
        p.revote = true;
        return { pub: openVote(p, p.tied) };

      case 'steal': {
        if (p.phase !== 'steal') return { error: 'phase' };
        if (a.id && a.id !== p.stealer) return { error: 'not_stealer' };
        const entry = p.caught.find((c) => c.id === p.stealer);
        entry.guess = String(a.guess == null ? '' : a.guess).trim().slice(0, 40);
        entry.stealOk = matchGuess(entry.guess, hidden.majority);
        return { pub: afterSteal(p, hidden) };
      }

      case 'stealVerdict': {
        // Pass & Play — the group accepts / rejects the guess (auto-match is only a suggestion).
        if (p.phase !== 'steal') return { error: 'phase' };
        const entry = p.caught.find((c) => c.id === p.stealer);
        entry.guess = String(a.guess == null ? '' : a.guess).trim().slice(0, 40);
        const auto = entry.guess ? matchGuess(entry.guess, hidden.majority) : false;
        entry.stealOk = !!a.ok;
        entry.overridden = entry.stealOk !== auto;
        return { pub: afterSteal(p, hidden) };
      }

      default:
        return { error: 'unknown_action' };
    }
  }

  function advanceTurn(p) {
    p.turn += 1;
    if (p.turn >= p.totalTurns) p.phase = 'discuss';
    return p;
  }

  function closeVote(p, hidden) {
    const tally = tallyVotes(p.votes, p.candidates);
    p.lastTally = { counts: tally.counts, votes: Object.assign({}, p.votes), revote: !!p.revote };
    return applyOutcome(p, hidden, resolveVote(tally, p.revote));
  }

  function afterSteal(p, hidden) {
    const entry = p.caught.find((c) => c.id === p.stealer);
    if (entry && entry.stealOk) return finishRound(p, hidden, 'steal');
    const remaining = hidden.imposters.filter((id) => caughtIds(p).indexOf(id) < 0);
    if (!remaining.length) return finishRound(p, hidden, 'all_caught');
    // More imposters at large — another vote among everyone not yet caught.
    p.stealer = null;
    p.voteRound += 1;
    p.revote = false;
    return openVote(p, p.players);
  }

  /** Realtime DB drops empty arrays / objects and nulls — restore the round shape after a read. */
  function hydrateState(st) {
    if (!st) return null;
    const arr = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []);
    st.players = arr(st.players);
    st.order = arr(st.order);
    st.clues = arr(st.clues).map((c) => Object.assign({ text: '' }, c));
    st.candidates = arr(st.candidates);
    st.voters = arr(st.voters);
    st.voted = arr(st.voted);
    st.tied = arr(st.tied);
    st.caught = arr(st.caught).map((c) => Object.assign({ guess: null, stealOk: null }, c));
    st.votes = st.votes || {};
    st.turn = Number(st.turn) || 0;
    st.voteRound = Number(st.voteRound) || 1;
    st.revote = !!st.revote;
    st.stealer = st.stealer || null;
    st.accusedInnocent = st.accusedInnocent || null;
    st.lastAccused = st.lastAccused || null;
    st.lastTally = st.lastTally || null;
    if (st.lastTally) {
      st.lastTally.counts = st.lastTally.counts || {};
      st.lastTally.votes = st.lastTally.votes || {};
    }
    st.result = st.result || null;
    if (st.result) {
      st.result.imposters = arr(st.result.imposters);
      st.result.survivors = arr(st.result.survivors);
      st.result.caught = arr(st.result.caught);
      st.result.points = st.result.points || {};
      st.result.minority = st.result.minority || null;
    }
    return st;
  }

  /** Public shape safe to broadcast — strips the per-voter votes until the round is over. */
  function publicView(pub) {
    const out = JSON.parse(JSON.stringify(pub));
    if (out.phase === 'vote' || out.phase === 'revote') out.votes = {};
    return out;
  }

  /** Friendly word label in the player's language; bilingual shows both. */
  function wordLabel(word, lang, bilingual) {
    if (!word) return '';
    const hi = String(lang || '').toLowerCase().indexOf('hi') === 0;
    if (bilingual) return hi ? word.hi + ' · ' + word.en : word.en + ' · ' + word.hi;
    return hi ? word.hi || word.en : word.en || word.hi;
  }

  return {
    MIN_PLAYERS,
    MAX_PLAYERS,
    DEFAULT_SETTINGS,
    CLUE_REASON_COPY,
    normalize,
    levenshtein,
    matchGuess,
    validateClue,
    defaultImposterCount,
    maxImposters,
    resolveImposterCount,
    mergeSettings,
    deal,
    wordFor,
    clueOrder,
    createRound,
    currentClueGiver,
    tallyVotes,
    resolveVote,
    scoreRound,
    applyAction,
    hydrateState,
    publicView,
    wordLabel,
    packs: PACKS_MOD,
  };
});
