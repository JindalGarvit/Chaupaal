/**
 * Most Likely To? + Would You Rather? + Never Have I Ever — pure round logic shared by Pass & Play
 * (client) and Room (server-lib/party-deal.js). Votes live in `hidden` until the round closes; the
 * public round only ever lists who has voted. Anonymous reveal publishes tallies, never voter → choice.
 * UMD: window.MostLikelyCore / require().
 */
(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const PC = node ? require('./party-core.js') : root.PartyCore;
  const Packs = node ? require('../data/mostlikely-packs.js') : root.MOSTLIKELY_PACKS;
  const api = factory(PC, Packs);
  if (node) module.exports = api;
  else root.MostLikelyCore = api;
})(typeof self !== 'undefined' ? self : this, function (PC, Packs) {
  'use strict';

  const MODES = ['mlt', 'wyr', 'nhie'];
  const MODE_LABELS = { mlt: 'Most Likely To', wyr: 'Would You Rather', nhie: 'Never Have I Ever' };
  const MIN = { mlt: 3, wyr: 2, nhie: 2 };
  /** Never Have I Ever "five fingers": each “I have” costs one; last player with fingers left wins. */
  const FINGERS = 5;
  const MIN_PLAYERS = 2;
  const MAX_PLAYERS = 16;
  const ROUND_OPTIONS = [10, 20, 0]; // 0 = endless
  const VOTE_SEC = 90;
  const DEFENCE_SEC = 15;
  const HISTORY_CAP = 200;

  const DEFAULT_SETTINGS = {
    mode: 'mlt',
    rounds: 10,
    packs: null,
    scoring: true,
    selfVote: true,
    defence: true,
    reveal: 'names',
    voting: 'secret',
  };

  const BADGES = ['Certified 👑', 'Called it!', 'No contest', 'The people have spoken', 'Guilty as charged 😄', 'Crowned'];

  function isHi(lang) {
    return String(lang || 'en').indexOf('hi') === 0;
  }

  function validPackIds() {
    return Packs.PACKS.map((p) => p.id);
  }

  function mergeSettings(s, lang) {
    const src = s || {};
    const out = Object.assign({}, DEFAULT_SETTINGS);
    if (MODES.indexOf(src.mode) >= 0) out.mode = src.mode;
    const r = Number(src.rounds);
    if (src.rounds != null && ROUND_OPTIONS.indexOf(r) >= 0) out.rounds = r;
    ['scoring', 'selfVote', 'defence'].forEach((k) => {
      if (src[k] === true || src[k] === false) out[k] = src[k];
      else if (src[k] === 'true' || src[k] === 'false') out[k] = src[k] === 'true';
    });
    if (src.reveal === 'names' || src.reveal === 'anon') out.reveal = src.reveal;
    if (src.voting === 'secret' || src.voting === 'quick') out.voting = src.voting;
    const valid = validPackIds();
    const packs = Array.isArray(src.packs) ? src.packs.filter((id, i, a) => valid.indexOf(id) >= 0 && a.indexOf(id) === i) : [];
    // Keep choices for every mode; activePacks() narrows to the current mode.
    out.packs = packs.length ? packs : MODES.reduce((ids, m) => ids.concat(Packs.defaultPacks(m, lang).filter((id) => ids.indexOf(id) < 0)), []);
    return out;
  }

  /** Finger scoring needs names: in an anonymous round, a lost finger would reveal the answer. */
  function fingersOn(s) {
    return !!(s && s.mode === 'nhie' && s.scoring && s.reveal !== 'anon');
  }

  /** Pack ids in play for this mode (falls back to the mode's defaults). */
  function activePacks(s, lang) {
    const allowed = Packs.packsFor(s.mode).map((p) => p.id);
    const ids = (s.packs || []).filter((id) => allowed.indexOf(id) >= 0);
    return ids.length ? ids : Packs.defaultPacks(s.mode, lang);
  }

  function minPlayers(s) {
    return MIN[(s && s.mode) || 'mlt'] || MIN.mlt;
  }

  // ---------------- deck: no repeats until the chosen packs run dry ----------------

  function poolKeys(s, lang, customs) {
    const field = Packs.FIELD[s.mode] || 'likely';
    const keys = [];
    activePacks(s, lang).forEach((id) => {
      const p = Packs.getPack(id);
      if (p) p[field].forEach((item) => keys.push(item.key));
    });
    (customs || []).forEach((c, i) => {
      if (c && c.mode === s.mode) keys.push('c:' + i);
    });
    return keys;
  }

  function deckSig(s, lang, customs) {
    return s.mode + '|' + activePacks(s, lang).join(',') + '|' + (customs || []).filter((c) => c && c.mode === s.mode).length;
  }

  /**
   * Next prompt from a mixed-pack shuffle. `state` = { deck: string[], sig, last } (or null).
   * The deck only refills once every prompt in the chosen packs has been dealt.
   */
  function nextPrompt(state, s, lang, rng, customs) {
    const sig = deckSig(s, lang, customs);
    const st = state && state.sig === sig && Array.isArray(state.deck) ? { deck: state.deck.slice(), sig, last: state.last || null } : { deck: [], sig, last: (state && state.last) || null };
    if (!st.deck.length) {
      let fresh = PC.shuffle(poolKeys(s, lang, customs), rng);
      if (fresh.length > 1 && fresh[0] === st.last) fresh = fresh.slice(1).concat(fresh[0]);
      st.deck = fresh;
    }
    const key = st.deck.shift();
    st.last = key || null;
    return { prompt: promptFor(key, customs), state: st };
  }

  function promptFor(key, customs) {
    if (!key) return null;
    if (key.indexOf('c:') === 0) {
      const c = (customs || [])[Number(key.slice(2))];
      return c ? Object.assign({ key }, c.prompt) : null;
    }
    const item = Packs.byKey(key);
    return item ? JSON.parse(JSON.stringify(item)) : null;
  }

  // ---------------- kindness guardrail (packs test + custom prompts) ----------------

  /** Banned keyword classes. Latin words match whole words; Devanagari matches as substrings. */
  const KINDNESS_CLASSES = {
    looks: {
      en: /\b(ugly|ugliest|fat|fatty|obese|skinny|bald|pimples?|acne|chubby|hairy|weight|diet|good-looking|hottest|attractive|unattractive|beautiful|handsome|dark-skinned|fair-skinned|body shape|mota|moti|takla|kala|kaali|gora|gori)\b/i,
      hi: /(मोटा|मोटी|टकला|बदसूरत|काला|काली|गोरा|गोरी|पतला|पतली|वज़न|वजन)/,
    },
    caste: { en: /\b(castes?|dalit|brahmin|untouchable|jaat|jati|jaati)\b/i, hi: /(जाति|जात-पात|जातिवाद)/ },
    religion: {
      en: /\b(religions?|religious|hindus?|muslims?|christians?|sikhs?|jains?|buddhists?|jews?|jewish|temples?|mosques?|churches|church|gurudwara|pray|prayer|praying|god|gods|allah|bhagwan|mandir|masjid)\b/i,
      hi: /(धर्म|मंदिर|मस्जिद|गिरजा|भगवान|अल्लाह|हिंदू|मुसलमान|ईसाई)/,
    },
    sexuality: {
      en: /\b(gay|lesbian|bisexual|queer|sexy|sex|sexual|sexuality|hook up|hookup|nude|naked|kiss|kissing|virgin|boyfriend|girlfriend|dating)\b/i,
      hi: /(सेक्स|समलैंगिक|नंगा|नंगी|चुम्मा|गर्लफ्रेंड|बॉयफ्रेंड)/,
    },
    money: {
      en: /\b(poor|poorest|broke|cheap|cheapest|cheapskate|stingy|miser|miserly|beggar|debt|kanjoos|kanjus|garib|gareeb)\b/i,
      hi: /(कंजूस|गरीब|ग़रीब|भिखारी|कंगाल)/,
    },
    cruelty: {
      en: /\b(stupid|stupidest|idiot|dumb|dumbest|moron|loser|hate|hates|hated|kill|kills|killed|die|dies|dead|death|suicide|annoying|creepy|creep|smelly|smells|stinks?|worthless|pathetic|pagal|bewakoof|nalayak)\b/i,
      hi: /(बेवकूफ़|बेवकूफ|पागल|मूर्ख|नफ़रत|नफरत|नालायक|मर जा|बदबू)/,
    },
    adult: {
      en: /\b(drunk|alcohol|beer|wine|vodka|whisky|whiskey|rum|booze|daaru|daru|sharab|hangover|weed|drugs?|smoke|smoking|smoker|cigarettes?|vape|vaping|gamble|gambling|betting|casino)\b/i,
      hi: /(शराब|दारू|सिगरेट|जुआ|नशा|गांजा)/,
    },
    crime: {
      en: /\b(steal|steals|stole|stolen|stealing|shoplift\w*|arrested|jail|prison|crimes?|criminal|illegal|vandal\w*|graffiti|trespass\w*|robbed|robbery|burgl\w*)\b/i,
      hi: /(चोरी|जेल|गिरफ़्तार|गिरफ्तार|अपराध)/,
    },
    profanity: {
      en: /\b(fuck\w*|shit\w*|bitch\w*|bastard|asshole|arsehole|dick|pussy|cunt|slut|whore|crap|wtf|bc|mc|bsdk|chutiya|chutiye|bhenchod|behenchod|madarchod|gaand|gandu|randi|harami|haramkhor|kamina|kamine|saala|saali)\b/i,
      hi: /(चूतिया|भेनचोद|बहनचोद|मादरचोद|गांड|गांडू|रंडी|हरामी|कमीना|कमीने|साला|साली)/,
    },
  };

  // Devanagari words must start a word (so मसाला ≠ साला, प्रजाति ≠ जाति); suffixes still match.
  const HI_WORD_START = {};
  Object.keys(KINDNESS_CLASSES).forEach((k) => {
    HI_WORD_START[k] = new RegExp('(^|[^\\u0900-\\u097F])' + KINDNESS_CLASSES[k].hi.source);
  });

  /** Which banned classes a piece of text trips (empty = clean). */
  function kindnessFlags(text) {
    const t = String(text || '').replace(/[’‘]/g, "'");
    return Object.keys(KINDNESS_CLASSES).filter((k) => KINDNESS_CLASSES[k].en.test(t) || HI_WORD_START[k].test(t));
  }

  function tidy(s, max) {
    return String(s == null ? '' : s)
      .replace(/[\u0000-\u001f<>]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
  }

  /**
   * Host-written prompt for this session only. Returns { ok, prompt } or { ok:false, reason }.
   * mlt: text (either “sing in the shower” or a full question); wyr: { a, b }.
   */
  function cleanCustom(input, mode) {
    const kind = 'Keep it kind and teen-safe — try another one';
    if (mode === 'wyr') {
      const a = tidy(input && input.a, 80);
      const b = tidy(input && input.b, 80);
      if (a.length < 2 || b.length < 2) return { ok: false, reason: 'Add both options' };
      if (a.toLowerCase() === b.toLowerCase()) return { ok: false, reason: 'The two options need to be different' };
      if (kindnessFlags(a + ' ' + b).length) return { ok: false, reason: kind };
      return { ok: true, prompt: { custom: true, a: { en: a, hi: '' }, b: { en: b, hi: '' } } };
    }
    if (mode === 'nhie') {
      const t = tidy(typeof input === 'string' ? input : input && input.text, 120)
        .replace(/^never\s+have\s+i\s+ever[\s.…,:-]*/i, '')
        .replace(/[.!…\s]+$/, '');
      if (t.length < 3) return { ok: false, reason: 'Write a little more' };
      if (kindnessFlags(t).length) return { ok: false, reason: kind };
      return { ok: true, prompt: { custom: true, en: t, hi: '' } };
    }
    let text = tidy(typeof input === 'string' ? input : input && input.text, 120);
    text = text.replace(/^who('s| is)? most likely to\s+/i, '').replace(/^most likely to\s+/i, '');
    if (text.length < 3) return { ok: false, reason: 'Write a little more' };
    if (kindnessFlags(text).length) return { ok: false, reason: kind };
    return { ok: true, prompt: { custom: true, en: text, hi: '' } };
  }

  // ---------------- display ----------------

  function mltQuestionEn(prompt) {
    const t = String(prompt.en || '');
    if (prompt.custom && (/\?$/.test(t) || /^(who|which|kaun)\b/i.test(t))) return t;
    return 'Who’s most likely to ' + t.replace(/\?+$/, '') + '?';
  }

  /** { primary, secondary } for the prompt line in the reader's language; secondary only if bilingual. */
  function promptLines(prompt, mode, lang, both) {
    if (!prompt) return { primary: '', secondary: '' };
    if (mode === 'wyr') return { primary: 'Would you rather…', secondary: '' };
    if (mode === 'nhie') return { primary: 'Never have I ever ' + String(prompt.en || '').replace(/[.!]+$/, ''), secondary: '' };
    const en = mltQuestionEn(prompt);
    const hi = prompt.hi || '';
    const primary = isHi(lang) && hi ? hi : en;
    const other = primary === en ? hi : en;
    return { primary, secondary: both && other ? other : '' };
  }

  function optionLines(opt, lang, both) {
    if (!opt) return { primary: '', secondary: '' };
    const primary = isHi(lang) && opt.hi ? opt.hi : opt.en;
    const other = primary === opt.en ? opt.hi : opt.en;
    return { primary, secondary: both && other ? other : '' };
  }

  function badgeFor(prompt) {
    const k = String((prompt && prompt.key) || '');
    let h = 0;
    for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
    return BADGES[h % BADGES.length];
  }

  // ---------------- rounds ----------------

  function createRound(ids, prompt, settings, n) {
    const s = mergeSettings(settings);
    const r = { n: n || 1, mode: s.mode, prompt, players: ids.slice(), phase: 'vote', voted: [], result: null, quick: false };
    if (s.mode === 'nhie') r.fingers = fingersOn(s);
    return r;
  }

  function createHidden() {
    return { votes: {} };
  }

  /** Tally → crowned players (ties share the crown). */
  function crown(tally) {
    const ids = Object.keys(tally || {});
    const max = ids.reduce((m, id) => Math.max(m, Number(tally[id]) || 0), 0);
    return { top: max > 0 ? ids.filter((id) => (Number(tally[id]) || 0) === max) : [], topVotes: max };
  }

  function tallyVotes(players, votes) {
    const tally = {};
    players.forEach((id) => (tally[id] = 0));
    Object.keys(votes || {}).forEach((voter) => {
      const t = votes[voter];
      if (typeof t === 'string' && t) tally[t] = (tally[t] || 0) + 1;
    });
    return tally;
  }

  /** +1 to every voter who picked one of the crowned players ("you read the room"). */
  function readTheRoomPoints(votes, top) {
    const points = {};
    Object.keys(votes || {}).forEach((voter) => {
      if (top.indexOf(votes[voter]) >= 0) points[voter] = 1;
    });
    return points;
  }

  function splitCounts(votes) {
    const counts = { a: 0, b: 0 };
    Object.keys(votes || {}).forEach((id) => {
      const v = votes[id];
      if (v && (v.pick === 'a' || v.pick === 'b')) counts[v.pick] += 1;
    });
    return counts;
  }

  function majorityOf(counts) {
    if (counts.a > counts.b) return 'a';
    if (counts.b > counts.a) return 'b';
    return null;
  }

  /** +1 for predicting the majority side. A tied room has no majority, so nobody scores. */
  function predictionPoints(votes, majority) {
    const points = {};
    if (!majority) return points;
    Object.keys(votes || {}).forEach((id) => {
      if (votes[id] && votes[id].guess === majority) points[id] = 1;
    });
    return points;
  }

  function buildResult(round, hidden, s) {
    const anon = s.reveal === 'anon';
    const votes = hidden.votes || {};
    if (round.mode === 'nhie') {
      const haves = round.players.filter((id) => votes[id] === 'have');
      const nevers = round.players.filter((id) => votes[id] === 'never');
      // Anonymous: counts only — no names, and no finger loss (it would name who has).
      return {
        counts: { have: haves.length, never: nevers.length },
        total: haves.length + nevers.length,
        anon,
        points: {},
        haves: anon ? null : haves,
        nevers: anon ? null : nevers,
        lost: round.fingers && !anon ? haves.slice() : [],
      };
    }
    if (round.mode === 'wyr') {
      const counts = splitCounts(votes);
      const majority = majorityOf(counts);
      const res = { counts, total: counts.a + counts.b, majority, anon, points: {}, picks: null, predictedRight: 0 };
      const right = predictionPoints(votes, majority);
      res.predictedRight = Object.keys(right).length;
      if (s.scoring && !round.quick) res.points = right;
      if (!anon) {
        res.picks = {};
        Object.keys(votes).forEach((id) => (res.picks[id] = votes[id].pick));
      }
      return res;
    }
    const tally = tallyVotes(round.players, votes);
    const c = crown(tally);
    const res = { tally, top: c.top, topVotes: c.topVotes, total: Object.keys(votes).length, anon, points: {}, votes: null };
    // Anonymous rounds award nothing: per-voter points would reveal who voted for the winner.
    if (s.scoring && !anon && !round.quick) res.points = readTheRoomPoints(votes, c.top);
    if (!anon) res.votes = Object.assign({}, votes);
    return res;
  }

  function close(round, hidden, s) {
    round.result = buildResult(round, hidden, s);
    round.phase = round.mode === 'mlt' && s.defence && round.result.top.length ? 'defence' : 'result';
    return round;
  }

  /**
   * Reducer. Returns { pub } or { error }.
   * Actions: vote {id, target} (mlt) | vote {id, pick, guess} (wyr) | close | endDefence |
   *          quick {tally} (mlt, Pass & Play "count of 3") | quick {picks} (wyr, show of hands)
   */
  function applyAction(round, hidden, settings, action) {
    const s = mergeSettings(settings);
    const a = action || {};
    const r = round;
    switch (a.type) {
      case 'vote': {
        if (r.phase !== 'vote') return { error: 'phase' };
        if (r.players.indexOf(a.id) < 0) return { error: 'not_player' };
        if (r.mode === 'nhie') {
          if (a.answer !== 'have' && a.answer !== 'never') return { error: 'bad_vote' };
          hidden.votes[a.id] = a.answer;
        } else if (r.mode === 'wyr') {
          if ((a.pick !== 'a' && a.pick !== 'b') || (a.guess !== 'a' && a.guess !== 'b')) return { error: 'bad_vote' };
          hidden.votes[a.id] = { pick: a.pick, guess: a.guess };
        } else {
          if (r.players.indexOf(a.target) < 0) return { error: 'bad_target' };
          if (!s.selfVote && a.target === a.id) return { error: 'no_self_vote' };
          hidden.votes[a.id] = a.target;
        }
        if (r.voted.indexOf(a.id) < 0) r.voted.push(a.id);
        if (r.voted.length >= r.players.length) close(r, hidden, s);
        return { pub: r };
      }
      case 'close':
        if (r.phase !== 'vote') return { error: 'phase' };
        close(r, hidden, s);
        return { pub: r };
      case 'endDefence':
        if (r.phase !== 'defence') return { error: 'phase' };
        r.phase = 'result';
        return { pub: r };
      case 'quick': {
        if (r.phase !== 'vote') return { error: 'phase' };
        r.quick = true;
        if (r.mode === 'nhie') {
          // Show of hands: the phone holder taps everyone whose hand went up.
          const haves = Array.isArray(a.haves) ? a.haves : [];
          hidden.votes = {};
          r.players.forEach((id) => (hidden.votes[id] = haves.indexOf(id) >= 0 ? 'have' : 'never'));
          close(r, hidden, Object.assign({}, s, { reveal: 'names' }));
        } else if (r.mode === 'wyr') {
          hidden.votes = {};
          Object.keys(a.picks || {}).forEach((id) => {
            if (r.players.indexOf(id) >= 0 && (a.picks[id] === 'a' || a.picks[id] === 'b')) hidden.votes[id] = { pick: a.picks[id], guess: null };
          });
          close(r, hidden, Object.assign({}, s, { reveal: 'names' }));
        } else {
          const tally = {};
          r.players.forEach((id) => (tally[id] = Math.max(0, Math.min(MAX_PLAYERS, Number((a.tally || {})[id]) || 0))));
          const c = crown(tally);
          r.result = { tally, top: c.top, topVotes: c.topVotes, total: Object.keys(tally).reduce((n, id) => n + tally[id], 0), anon: true, points: {}, votes: null };
          r.phase = s.defence && c.top.length ? 'defence' : 'result';
        }
        r.voted = r.players.slice();
        return { pub: r };
      }
      default:
        return { error: 'unknown_action' };
    }
  }

  /** A player left mid-round: drop them (and an uncounted vote). May close the vote. */
  function removePlayer(round, hidden, settings, id) {
    const s = mergeSettings(settings);
    round.players = round.players.filter((x) => x !== id);
    if (round.phase === 'vote') {
      delete hidden.votes[id];
      round.voted = round.voted.filter((x) => x !== id);
      if (round.players.length && round.voted.length >= round.players.length) close(round, hidden, s);
    }
    return round;
  }

  /** Shared state: the round minus nothing — votes are in `hidden`, never here. */
  function publicView(round) {
    return JSON.parse(JSON.stringify(round));
  }

  function hydrateRound(r) {
    if (!r) return r;
    r.players = r.players || [];
    r.voted = r.voted || [];
    r.result = r.result || null;
    if (r.result) {
      r.result.points = r.result.points || {};
      if (r.mode === 'nhie') {
        r.result.counts = Object.assign({ have: 0, never: 0 }, r.result.counts || {});
        if (!r.result.anon) {
          r.result.haves = r.result.haves || [];
          r.result.nevers = r.result.nevers || [];
        }
        r.result.lost = r.result.lost || [];
      } else if (r.mode === 'wyr') r.result.counts = Object.assign({ a: 0, b: 0 }, r.result.counts || {});
      else {
        r.result.tally = r.result.tally || {};
        r.result.top = r.result.top || [];
      }
    }
    r.quick = !!r.quick;
    if (r.mode === 'nhie') r.fingers = !!r.fingers;
    return r;
  }

  // ---------------- session (end-of-game highlights) ----------------

  function newSession() {
    return { rounds: 0, crowns: {}, inSync: {}, rebel: {}, history: [], have: {}, never: {}, fingers: null, winners: [], nhieOver: false };
  }

  function hydrateSession(x) {
    const s = x || newSession();
    s.rounds = Number(s.rounds) || 0;
    s.crowns = s.crowns || {};
    Object.keys(s.crowns).forEach((id) => (s.crowns[id] = s.crowns[id] || []));
    s.inSync = s.inSync || {};
    s.rebel = s.rebel || {};
    s.history = s.history || [];
    s.have = s.have || {};
    s.never = s.never || {};
    s.fingers = s.fingers || null;
    s.winners = s.winners || [];
    s.nhieOver = !!s.nhieOver;
    return s;
  }

  function fingersLeft(session, id) {
    const f = session.fingers || {};
    return f[id] == null ? FINGERS : Number(f[id]) || 0;
  }

  /**
   * Never Have I Ever: who answers this round. With finger scoring, players with no fingers left sit
   * out; a late joiner starts level with the lowest hand still in play (never a fresh five mid-game).
   */
  function nhieRoundPlayers(session, ids, settings) {
    const s = mergeSettings(settings);
    if (!fingersOn(s)) return ids.slice();
    const started = !!(session.fingers && Object.keys(session.fingers).length);
    session.fingers = session.fingers || {};
    const alive = ids.filter((id) => id in session.fingers && fingersLeft(session, id) > 0);
    const floor = started && alive.length ? Math.min.apply(null, alive.map((id) => fingersLeft(session, id))) : FINGERS;
    ids.forEach((id) => {
      if (!(id in session.fingers)) session.fingers[id] = floor;
    });
    return ids.filter((id) => fingersLeft(session, id) > 0);
  }

  /** Fold a closed round into the session. Anonymous rounds record tallies only. */
  function recordRound(session, round) {
    const r = round.result;
    if (!r) return session;
    const p = round.prompt || {};
    session.rounds += 1;
    if (round.mode === 'nhie') {
      session.history.push({ mode: 'nhie', key: p.key || '', en: p.en || '', custom: !!p.custom, counts: Object.assign({}, r.counts), total: r.total, haves: r.haves ? r.haves.slice() : null });
      if (r.haves) {
        r.haves.forEach((id) => (session.have[id] = (session.have[id] || 0) + 1));
        (r.nevers || []).forEach((id) => (session.never[id] = (session.never[id] || 0) + 1));
      }
      if (round.fingers) {
        session.fingers = session.fingers || {};
        (r.lost || []).forEach((id) => (session.fingers[id] = Math.max(0, fingersLeft(session, id) - 1)));
        const alive = round.players.filter((id) => fingersLeft(session, id) > 0);
        if (alive.length <= 1) {
          session.nhieOver = true;
          // Everyone left went out on the same statement → they share the win.
          session.winners = alive.length ? alive : round.players.slice();
        }
      }
    } else if (round.mode === 'wyr') {
      session.history.push({ mode: 'wyr', key: p.key || '', a: p.a || null, b: p.b || null, counts: Object.assign({}, r.counts), majority: r.majority });
      if (r.picks && r.majority) {
        Object.keys(r.picks).forEach((id) => {
          if (r.picks[id] === r.majority) session.inSync[id] = (session.inSync[id] || 0) + 1;
          else session.rebel[id] = (session.rebel[id] || 0) + 1;
        });
      }
    } else {
      r.top.forEach((id) => {
        session.crowns[id] = session.crowns[id] || [];
        session.crowns[id].push({ key: p.key || '', en: p.en || '', hi: p.hi || '', custom: !!p.custom, votes: r.topVotes, total: r.total });
      });
      session.history.push({ mode: 'mlt', key: p.key || '', top: r.top.slice(), topVotes: r.topVotes, total: r.total });
    }
    if (session.history.length > HISTORY_CAP) session.history = session.history.slice(-HISTORY_CAP);
    return session;
  }

  /** "Room's verdict": each player's strongest crown (highest vote share; latest wins ties). */
  function verdict(session, ids) {
    return ids.map((id) => {
      const list = (session.crowns && session.crowns[id]) || [];
      let best = null;
      list.forEach((c) => {
        const share = c.total ? c.votes / c.total : 0;
        if (!best || share >= best.share) best = Object.assign({ share }, c);
      });
      return { id, crowns: list.length, best };
    });
  }

  function leaders(map, ids) {
    const max = ids.reduce((m, id) => Math.max(m, Number(map[id]) || 0), 0);
    return max > 0 ? { ids: ids.filter((id) => (Number(map[id]) || 0) === max), n: max } : { ids: [], n: 0 };
  }

  /** Would You Rather highlights. Names-mode rounds feed in-sync / rebel; tallies feed the room stats. */
  function highlights(session, ids, scores) {
    const wyr = (session.history || []).filter((h) => h.mode === 'wyr' && h.counts && h.counts.a + h.counts.b > 0);
    let closest = null;
    let unanimous = null;
    wyr.forEach((h) => {
      const total = h.counts.a + h.counts.b;
      const gap = Math.abs(h.counts.a - h.counts.b) / total;
      if (total > 1 && (!closest || gap <= closest.gap)) closest = Object.assign({ gap }, h);
      const share = Math.max(h.counts.a, h.counts.b) / total;
      if (total > 1 && (!unanimous || share >= unanimous.share)) unanimous = Object.assign({ share }, h);
    });
    return {
      inSync: leaders(session.inSync || {}, ids),
      rebel: leaders(session.rebel || {}, ids),
      predictor: leaders(scores || {}, ids),
      closest,
      unanimous,
    };
  }

  /** Finger standings (null when no finger round was played). Winners: last hand standing, else most fingers left. */
  function nhieStandings(session, ids) {
    if (!session.fingers || !Object.keys(session.fingers).length) return null;
    const rows = ids.filter((id) => id in session.fingers).map((id) => ({ id, fingers: fingersLeft(session, id) }));
    let winners = (session.winners || []).filter((id) => ids.indexOf(id) >= 0);
    if (!winners.length) {
      const max = rows.reduce((m, x) => Math.max(m, x.fingers), 0);
      winners = max > 0 ? rows.filter((x) => x.fingers === max).map((x) => x.id) : [];
    }
    return { rows, winners };
  }

  /** Never Have I Ever highlights. Per-player titles come from names rounds only; room stats from counts. */
  function nhieHighlights(session, ids) {
    const hist = (session.history || []).filter((h) => h.mode === 'nhie' && h.total > 1);
    let common = null;
    let rarest = null;
    hist.forEach((h) => {
      const share = h.counts.have / h.total;
      if (h.counts.have && (!common || share >= common.share)) common = Object.assign({ share }, h);
      if (!rarest || share <= rarest.share) rarest = Object.assign({ share }, h);
    });
    if (common && rarest && common.key === rarest.key) rarest = null;
    return { adventurous: leaders(session.have || {}, ids), innocent: leaders(session.never || {}, ids), common, rarest };
  }

  function isOver(settings, roundNo, session) {
    const s = mergeSettings(settings);
    if (session && session.nhieOver) return true;
    return s.rounds > 0 && Number(roundNo) >= s.rounds;
  }

  return {
    MODES,
    MODE_LABELS,
    MIN,
    MIN_PLAYERS,
    MAX_PLAYERS,
    FINGERS,
    ROUND_OPTIONS,
    VOTE_SEC,
    DEFENCE_SEC,
    DEFAULT_SETTINGS,
    KINDNESS_CLASSES,
    packs: Packs,
    mergeSettings,
    activePacks,
    minPlayers,
    poolKeys,
    nextPrompt,
    promptFor,
    kindnessFlags,
    cleanCustom,
    promptLines,
    optionLines,
    badgeFor,
    createRound,
    createHidden,
    crown,
    tallyVotes,
    readTheRoomPoints,
    splitCounts,
    majorityOf,
    predictionPoints,
    applyAction,
    removePlayer,
    publicView,
    hydrateRound,
    newSession,
    hydrateSession,
    recordRound,
    verdict,
    highlights,
    fingersOn,
    fingersLeft,
    nhieRoundPlayers,
    nhieStandings,
    nhieHighlights,
    isOver,
  };
});
