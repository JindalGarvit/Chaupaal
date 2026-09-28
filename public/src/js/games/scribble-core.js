/**
 * Scribble core (Dangal P5) — draw-and-guess rules shared by the server engine, the client and tests.
 *
 * Turn flow: pick (drawer chooses 1 of 3 words; auto-pick on timeout) → draw (guesses in chat,
 * letter hints at fixed fractions of the draw time) → reveal (word + points recap) → next drawer.
 * Everyone draws once per round. The word and the three choices live only in server state and in
 * the drawer's private secret; publicView() carries the hint pattern and never the word until reveal.
 *
 * Scoring (documented in the rules sheet):
 *   guesser  = 50 + round(250 × time left / draw time)          → 300 for an instant guess, 50 at the buzzer
 *   drawer   = max(10, round(200 / guessers)) per correct guess  → 200 when everyone gets it
 *
 * Canvas: the drawer streams op batches ({ o: [ops] }) to RTDB; replay() folds them into the visible
 * stroke groups (undo / redo / clear aware) so late joiners and reconnects redraw the same picture.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../dangal/word-safety.js'));
  else root.ScribbleCore = factory(root.WordSafety);
})(typeof self !== 'undefined' ? self : this, function (WordSafety) {
  'use strict';

  const MIN_PLAYERS = 2;
  const MAX_PLAYERS = 12;
  const REVEAL_MS = 6000;
  const CHAT_KEEP = 40;
  const MAX_TEXT = 100;
  const CANVAS_W = 800;
  const CANVAS_H = 600;

  const PACKS = [
    { id: 'everyday', name: 'Everyday objects' },
    { id: 'animals', name: 'Animals' },
    { id: 'food', name: 'Food' },
    { id: 'actions', name: 'Actions' },
    { id: 'places', name: 'Places' },
    { id: 'movies', name: 'Movies & TV' },
    { id: 'sports', name: 'Sports' },
    { id: 'nature', name: 'Nature' },
    { id: 'tech', name: 'Tech' },
    { id: 'hardmode', name: 'Hard mode' },
    { id: 'bollywood', name: 'Bollywood', regional: true },
    { id: 'cricket', name: 'Cricket', regional: true },
  ];
  const PACK_IDS = PACKS.map((p) => p.id);
  const DEFAULT_PACKS = ['everyday', 'animals', 'food', 'actions', 'places', 'movies', 'sports', 'nature', 'tech'];
  const DEFAULTS = Object.freeze({ rounds: 3, drawTime: 80, hints: 2, pickTime: 15, packs: DEFAULT_PACKS, customWords: [], customOnly: false });
  const PALETTE = ['#000000', '#FFFFFF', '#7F7F7F', '#C1C1C1', '#EF130B', '#FF7100', '#FFE400', '#00CC00', '#00B2FF', '#231FD3', '#A300BA', '#D37CAA', '#A0522D', '#592F2A', '#FFC0CB', '#0B6623'];
  const BRUSHES = [4, 10, 20, 36];

  const clampInt = (v, lo, hi, d) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
  };

  // ---------------------------------------------------------------- words + settings

  function cleanWord(w) {
    const s = String(w == null ? '' : w)
      .toLowerCase()
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
    if (s.length < 2 || s.length > 30) return null;
    if (!/^[a-z][a-z '\-]*[a-z]$/.test(s)) return null;
    return s;
  }

  /** Host custom words: comma (or newline) list → safe, unique words + what was rejected. */
  function parseCustomWords(input) {
    const list = Array.isArray(input) ? input : String(input == null ? '' : input).split(/[,\n]/);
    const seen = new Set();
    const words = [];
    const rejected = [];
    list.forEach((raw) => {
      if (!String(raw || '').trim()) return;
      const w = cleanWord(raw);
      if (!w || (WordSafety && WordSafety.isBlocked(w))) {
        rejected.push(String(raw).trim().slice(0, 30));
        return;
      }
      if (seen.has(w) || words.length >= 250) return;
      seen.add(w);
      words.push(w);
    });
    return { words, rejected };
  }

  function mergeSettings(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const packs = (Array.isArray(r.packs) ? r.packs : Object.values(r.packs || {})).filter((id) => PACK_IDS.indexOf(id) >= 0);
    const custom = parseCustomWords(r.customWords || []).words;
    return {
      rounds: clampInt(r.rounds, 2, 10, DEFAULTS.rounds),
      drawTime: Math.round(clampInt(r.drawTime, 30, 180, DEFAULTS.drawTime) / 10) * 10,
      hints: clampInt(r.hints, 0, 3, DEFAULTS.hints),
      pickTime: DEFAULTS.pickTime,
      packs: packs.length ? Array.from(new Set(packs)) : DEFAULT_PACKS.slice(),
      customWords: custom,
      customOnly: !!r.customOnly && custom.length >= 10,
      aiTheme: r.aiTheme ? String(r.aiTheme).replace(/[<>]/g, '').slice(0, 40) : '',
    };
  }

  // ---------------------------------------------------------------- guessing

  const normGuess = (s) =>
    String(s == null ? '' : s)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');

  function editDistance(a, b, cap) {
    const lim = cap == null ? Infinity : cap;
    if (Math.abs(a.length - b.length) > lim) return lim + 1;
    let prev = [];
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let best = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < best) best = cur[j];
      }
      if (best > lim) return lim + 1;
      prev = cur;
    }
    return prev[b.length];
  }

  /** Allowed typo distance for near-miss / leak checks: 1 for short words, 2 for 6+ letters. */
  const closeLimit = (w) => (w.length >= 6 ? 2 : 1);
  const isCorrect = (guess, word) => !!normGuess(word) && normGuess(guess) === normGuess(word);
  function isClose(guess, word) {
    const g = normGuess(guess);
    const w = normGuess(word);
    if (!g || !w || g === w || w.length < 3) return false;
    const d = editDistance(g, w, 2);
    return d >= 1 && d <= closeLimit(w);
  }

  /** Drawer / already-guessed chat filter: the word, spelled out, split up or 1–2 letters off. */
  function revealsWord(text, word) {
    const w = normGuess(word);
    if (w.length < 2) return false;
    const compact = normGuess(text);
    if (!compact) return false;
    if (compact.indexOf(w) >= 0) return true;
    const tokens = String(text).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const span = String(word).split(/[\s-]+/).length + 1;
    for (let i = 0; i < tokens.length; i++) {
      let joined = '';
      for (let k = i; k < Math.min(tokens.length, i + span); k++) {
        joined += tokens[k];
        if (Math.abs(joined.length - w.length) <= 2 && editDistance(joined, w, 2) <= closeLimit(w)) return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------- hints

  const letterIdx = (word) =>
    String(word || '')
      .split('')
      .map((c, i) => (/[a-z]/.test(c) ? i : -1))
      .filter((i) => i >= 0);

  /** Elapsed-ms marks for letter reveals: evenly spaced, always leaving at least two letters hidden. */
  function hintSchedule(drawMs, hints, letters) {
    const n = Math.max(0, Math.min(Number(hints) || 0, (Number(letters) || 0) - 2));
    const out = [];
    for (let i = 0; i < n; i++) out.push(Math.round((drawMs * (i + 1)) / (n + 1)));
    return out;
  }

  function hintOrder(word, rng) {
    const idx = letterIdx(word);
    const r = typeof rng === 'function' ? rng : Math.random;
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = idx[i];
      idx[i] = idx[j];
      idx[j] = t;
    }
    return idx;
  }

  /** Hint pattern: '_' per hidden letter; spaces, hyphens and apostrophes shown. */
  function pattern(word, revealed) {
    const show = new Set(revealed || []);
    return String(word || '')
      .split('')
      .map((c, i) => (/[a-z]/.test(c) ? (show.has(i) ? c : '_') : c))
      .join('');
  }

  // ---------------------------------------------------------------- scoring

  function guesserPoints(remainingMs, drawMs) {
    const f = drawMs > 0 ? Math.max(0, Math.min(1, remainingMs / drawMs)) : 0;
    return 50 + Math.round(250 * f);
  }
  const drawerPerGuesser = (guessers) => Math.max(10, Math.round(200 / Math.max(1, guessers)));

  // ---------------------------------------------------------------- game state

  function newGame(players, settings) {
    const set = mergeSettings(settings);
    const list = (players || []).map((p) => ({ id: String(p.id), name: String(p.name || 'Player').slice(0, 32) }));
    const scores = {};
    list.forEach((p) => (scores[p.id] = 0));
    return {
      players: list,
      order: list.map((p) => p.id),
      rounds: set.rounds,
      round: 1,
      turnIdx: -1,
      turnNo: 0,
      turnKey: '',
      phase: 'idle',
      phaseAt: 0,
      pickMs: set.pickTime * 1000,
      drawMs: set.drawTime * 1000,
      hintsSetting: set.hints,
      drawer: null,
      choices: [],
      word: null,
      hints: [],
      hintOrder: [],
      shown: 0,
      guessed: {},
      turnPts: {},
      scores,
      chat: [],
      chatSeq: 0,
      used: [],
      votes: {},
      kicked: {},
      misses: {},
      lastWord: null,
      reason: null,
      over: false,
    };
  }

  function sys(st, code, uid) {
    st.chatSeq++;
    st.chat.push({ i: st.chatSeq, k: 'sys', c: code, u: uid || null });
    if (st.chat.length > CHAT_KEEP) st.chat.splice(0, st.chat.length - CHAT_KEEP);
  }
  function say(st, uid, kind, text) {
    st.chatSeq++;
    const e = { i: st.chatSeq, k: kind, u: uid };
    if (text != null) e.t = text;
    st.chat.push(e);
    if (st.chat.length > CHAT_KEEP) st.chat.splice(0, st.chat.length - CHAT_KEEP);
  }

  function addPlayer(st, p) {
    const id = String(p.id);
    if (st.players.some((x) => x.id === id)) return false;
    st.players.push({ id, name: String(p.name || 'Player').slice(0, 32) });
    if (st.order.indexOf(id) < 0) st.order.push(id);
    if (!(id in st.scores)) st.scores[id] = 0;
    sys(st, 'joined', id);
    return true;
  }

  function beginTurn(st, drawer, choices, now) {
    st.turnNo++;
    st.turnKey = 'r' + st.round + 't' + st.turnNo;
    st.phase = 'pick';
    st.phaseAt = now;
    st.drawer = drawer;
    st.choices = (choices || []).slice(0, 3);
    st.word = null;
    st.hints = [];
    st.hintOrder = [];
    st.shown = 0;
    st.guessed = {};
    st.turnPts = {};
    st.lastWord = null;
    st.reason = null;
  }

  function pick(st, uid, idx, now, rng) {
    if (st.phase !== 'pick') return { error: 'phase' };
    if (uid !== st.drawer) return { error: 'not_drawer' };
    const i = Math.floor(Number(idx));
    if (!(i >= 0 && i < st.choices.length)) return { error: 'bad_choice' };
    st.word = st.choices[i];
    st.used.push(st.word);
    if (st.used.length > 300) st.used.splice(0, st.used.length - 300);
    st.phase = 'draw';
    st.phaseAt = now;
    st.hints = hintSchedule(st.drawMs, st.hintsSetting, letterIdx(st.word).length);
    st.hintOrder = hintOrder(st.word, rng);
    st.shown = 0;
    sys(st, 'drawing', uid);
    return {};
  }

  /** Reveal every hint that is due. @returns true when a letter was revealed. */
  function revealHints(st, now) {
    if (st.phase !== 'draw') return false;
    let changed = false;
    while (st.shown < st.hints.length && now >= st.phaseAt + st.hints[st.shown]) {
      st.shown++;
      changed = true;
    }
    return changed;
  }
  const nextHintAt = (st) => (st.phase === 'draw' && st.shown < st.hints.length ? st.phaseAt + st.hints[st.shown] : null);
  const drawEndsAt = (st) => st.phaseAt + st.drawMs;

  /**
   * A chat line / guess. `eligible` = uids who can still score this turn (online, not drawer).
   * @returns {{ error?, correct?, close?, allGuessed? }}
   */
  function guess(st, uid, text, now, eligible) {
    const raw = String(text == null ? '' : text).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, MAX_TEXT);
    if (!raw) return { error: 'empty' };
    if (WordSafety && WordSafety.isBlocked(raw)) return { error: 'blocked', reason: 'Keep it friendly — that message wasn’t sent' };
    if (!st.players.some((p) => p.id === uid) || st.kicked[uid]) return { error: 'not_player' };
    const drawing = st.phase === 'draw' && st.word;
    if (!drawing) {
      if (st.phase === 'pick' && uid === st.drawer && (st.choices || []).some((w) => revealsWord(raw, w))) {
        return { error: 'word_blocked', reason: 'No giving away the word!' };
      }
      say(st, uid, 'msg', raw);
      return {};
    }
    const knows = uid === st.drawer || !!st.guessed[uid];
    if (knows) {
      if (revealsWord(raw, st.word)) return { error: 'word_blocked', reason: 'No giving away the word!' };
      say(st, uid, 'msg', raw);
      return {};
    }
    if (isCorrect(raw, st.word)) {
      const remaining = Math.max(0, drawEndsAt(st) - now);
      const pts = guesserPoints(remaining, st.drawMs);
      st.guessed[uid] = { at: now, pts };
      st.turnPts[uid] = pts;
      st.scores[uid] = (st.scores[uid] || 0) + pts;
      say(st, uid, 'correct');
      const left = (eligible || []).filter((id) => id !== st.drawer && !st.guessed[id]);
      return { correct: true, pts, allGuessed: left.length === 0 };
    }
    if (revealsWord(raw, st.word) || isClose(raw, st.word)) {
      // A near-miss or the word inside a longer message: only the guesser sees "so close" — a public
      // line would spell the word for everyone else.
      return { close: true, hidden: true };
    }
    say(st, uid, 'msg', raw);
    return {};
  }

  /** Close the turn: drawer points, recap, reveal. reason: 'all' | 'time' | 'skipped' | 'left' | 'kicked'. */
  function endTurn(st, reason, now, eligibleCount) {
    if (st.phase !== 'pick' && st.phase !== 'draw') return false;
    const n = Object.keys(st.guessed).length;
    if (st.drawer && st.phase === 'draw' && n > 0) {
      const per = drawerPerGuesser(Math.max(n, Number(eligibleCount) || n));
      const pts = per * n;
      st.turnPts[st.drawer] = pts;
      st.scores[st.drawer] = (st.scores[st.drawer] || 0) + pts;
    }
    st.lastWord = st.phase === 'draw' ? st.word : null;
    st.phase = 'reveal';
    st.phaseAt = now;
    st.reason = reason || 'time';
    if (reason === 'skipped' || reason === 'left' || reason === 'kicked') sys(st, 'skip', st.drawer);
    return true;
  }

  /**
   * Next drawer, or game over. `canDraw(uid)` filters out players who left / were kicked.
   * @returns uid of the next drawer, or null when the game is over.
   */
  function advance(st, canDraw) {
    const ok = (id) => !st.kicked[id] && (typeof canDraw !== 'function' || canDraw(id));
    for (let guard = 0; guard < 2 * (st.order.length + 1) * (st.rounds + 1); guard++) {
      st.turnIdx++;
      if (st.turnIdx >= st.order.length) {
        st.round++;
        st.turnIdx = -1;
        if (st.round > st.rounds) break;
        continue;
      }
      const id = st.order[st.turnIdx];
      if (ok(id)) return id;
    }
    st.round = Math.min(st.round, st.rounds);
    st.phase = 'over';
    st.over = true;
    st.drawer = null;
    return null;
  }

  function ranking(st) {
    return st.players
      .filter((p) => !st.kicked[p.id])
      .map((p) => p.id)
      .sort((a, b) => (st.scores[b] || 0) - (st.scores[a] || 0));
  }

  /** Majority vote-kick (needs 3+ active players). active = present, non-kicked uids. */
  function voteKick(st, voter, target, active) {
    const act = (active || []).filter((id) => !st.kicked[id]);
    if (voter === target) return { error: 'self' };
    if (act.indexOf(voter) < 0 || act.indexOf(target) < 0) return { error: 'not_player' };
    const eligible = act.filter((id) => id !== target);
    if (act.length < 3) return { error: 'too_few' };
    const list = (st.votes[target] || []).filter((id) => eligible.indexOf(id) >= 0);
    if (list.indexOf(voter) < 0) list.push(voter);
    st.votes[target] = list;
    const need = Math.floor(eligible.length / 2) + 1;
    if (list.length >= need) {
      kick(st, target);
      return { kicked: true, count: list.length, need };
    }
    return { kicked: false, count: list.length, need };
  }
  function kick(st, target) {
    st.kicked[target] = true;
    delete st.votes[target];
    sys(st, 'kicked', target);
  }

  function publicView(st) {
    const view = {
      players: st.players.map((p) => ({ id: p.id, name: p.name })),
      order: st.order.slice(),
      round: st.round,
      rounds: st.rounds,
      turnNo: st.turnNo,
      turnKey: st.turnKey,
      phase: st.phase,
      phaseAt: st.phaseAt,
      pickMs: st.pickMs,
      drawMs: st.drawMs,
      drawer: st.drawer,
      pattern: st.phase === 'draw' && st.word ? pattern(st.word, st.hintOrder.slice(0, st.shown)) : null,
      shown: st.shown,
      hintsTotal: st.hints.length,
      guessed: Object.keys(st.guessed).reduce((m, id) => ((m[id] = true), m), {}),
      turnPts: st.phase === 'reveal' || st.phase === 'over' ? Object.assign({}, st.turnPts) : {},
      scores: Object.assign({}, st.scores),
      chat: st.chat.map((c) => Object.assign({}, c)),
      lastWord: st.phase === 'reveal' || st.phase === 'over' ? st.lastWord : null,
      reason: st.reason,
      votes: Object.keys(st.votes).reduce((m, id) => ((m[id] = st.votes[id].length), m), {}),
      kicked: Object.assign({}, st.kicked),
      over: !!st.over,
    };
    if (st.over) view.ranking = ranking(st);
    return view;
  }

  /** The drawer's private card: the three choices while picking, then the word. */
  function drawerSecret(st) {
    if (!st.drawer) return null;
    if (st.phase === 'pick') return { turnKey: st.turnKey, choices: st.choices.slice() };
    if (st.phase === 'draw') return { turnKey: st.turnKey, word: st.word };
    return null;
  }

  /** RTDB drops empty arrays / objects — restore shapes. */
  function hydrate(st) {
    const s = st || {};
    const arr = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : []);
    const obj = (v) => (v && typeof v === 'object' ? v : {});
    s.players = arr(s.players);
    s.order = arr(s.order);
    s.choices = arr(s.choices);
    s.hints = arr(s.hints).map(Number);
    s.hintOrder = arr(s.hintOrder).map(Number);
    s.chat = arr(s.chat);
    s.used = arr(s.used);
    s.guessed = obj(s.guessed);
    s.turnPts = obj(s.turnPts);
    s.scores = obj(s.scores);
    s.kicked = obj(s.kicked);
    s.misses = obj(s.misses);
    const votes = obj(s.votes);
    Object.keys(votes).forEach((k) => (votes[k] = arr(votes[k])));
    s.votes = votes;
    s.word = s.word || null;
    s.drawer = s.drawer || null;
    s.lastWord = s.lastWord || null;
    s.reason = s.reason || null;
    s.over = !!s.over;
    ['round', 'rounds', 'turnIdx', 'turnNo', 'phaseAt', 'pickMs', 'drawMs', 'hintsSetting', 'shown', 'chatSeq'].forEach((k) => (s[k] = Number(s[k]) || 0));
    return s;
  }
  function hydrateView(v) {
    const s = v || {};
    const arr = (x) => (Array.isArray(x) ? x : x && typeof x === 'object' ? Object.values(x) : []);
    s.players = arr(s.players);
    s.order = arr(s.order);
    s.chat = arr(s.chat);
    s.ranking = arr(s.ranking);
    ['guessed', 'turnPts', 'scores', 'votes', 'kicked'].forEach((k) => (s[k] = s[k] && typeof s[k] === 'object' ? s[k] : {}));
    return s;
  }

  // ---------------------------------------------------------------- canvas ops

  const num = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
  const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

  /** Sanitize one op from the wire. */
  function cleanOp(op) {
    if (!op || typeof op !== 'object') return null;
    const k = Math.floor(Number(op.k) || 0);
    if (op.t === 's') {
      const p = (Array.isArray(op.p) ? op.p : []).slice(0, 2000).map((v, i) => num(v, 0, i % 2 ? CANVAS_H : CANVAS_W));
      if (p.length < 2) return null;
      return { t: 's', k, c: COLOR_RE.test(op.c) ? op.c : '#000000', w: num(op.w, 1, 60), e: op.e ? 1 : 0, p: p.length % 2 ? p.slice(0, -1) : p };
    }
    if (op.t === 'f') return { t: 'f', k, c: COLOR_RE.test(op.c) ? op.c : '#000000', x: num(op.x, 0, CANVAS_W - 1), y: num(op.y, 0, CANVAS_H - 1) };
    if (op.t === 'c') return { t: 'c', k };
    if (op.t === 'u' || op.t === 'r') return { t: op.t };
    return null;
  }

  /**
   * Fold op batches into visible stroke groups. Undo removes the last group, redo restores it,
   * a new group drops the redo stack. Batches may be objects or JSON strings ({ o: [...] }).
   */
  function replay(batches) {
    const groups = [];
    const redo = [];
    (batches || []).forEach((b) => {
      let data = b;
      if (typeof b === 'string') {
        try {
          data = JSON.parse(b);
        } catch (e) {
          return;
        }
      } else if (b && typeof b.d === 'string') {
        try {
          data = JSON.parse(b.d);
        } catch (e) {
          return;
        }
      }
      const ops = data && Array.isArray(data.o) ? data.o : [];
      ops.forEach((raw) => {
        const op = cleanOp(raw);
        if (!op) return;
        if (op.t === 'u') {
          if (groups.length) redo.push(groups.pop());
          return;
        }
        if (op.t === 'r') {
          if (redo.length) groups.push(redo.pop());
          return;
        }
        const last = groups[groups.length - 1];
        if (last && last.k === op.k) last.ops.push(op);
        else {
          groups.push({ k: op.k, ops: [op] });
          redo.length = 0;
        }
      });
    });
    return groups;
  }

  /** Ops to paint, starting after the last visible clear. */
  function visibleOps(groups) {
    let start = 0;
    (groups || []).forEach((g, i) => {
      if (g.ops.some((o) => o.t === 'c')) start = i + 1;
    });
    const out = [];
    (groups || []).slice(start).forEach((g) => g.ops.forEach((o) => out.push(o)));
    return out;
  }

  return {
    MIN_PLAYERS,
    MAX_PLAYERS,
    REVEAL_MS,
    CANVAS_W,
    CANVAS_H,
    PACKS,
    PACK_IDS,
    DEFAULT_PACKS,
    DEFAULTS,
    PALETTE,
    BRUSHES,
    cleanWord,
    parseCustomWords,
    mergeSettings,
    normGuess,
    editDistance,
    isCorrect,
    isClose,
    revealsWord,
    hintSchedule,
    hintOrder,
    pattern,
    guesserPoints,
    drawerPerGuesser,
    newGame,
    addPlayer,
    beginTurn,
    pick,
    revealHints,
    nextHintAt,
    drawEndsAt,
    guess,
    endTurn,
    advance,
    ranking,
    voteKick,
    kick,
    publicView,
    drawerSecret,
    hydrate,
    hydrateView,
    cleanOp,
    replay,
    visibleOps,
  };
});
