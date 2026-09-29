#!/usr/bin/env node
/**
 * Dangal P5 — Shabd Five (daily word puzzle) + Scribble (draw & guess party rooms).
 *   node scripts/test-dangal-p5-words.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error('FAIL:', msg);
  } else console.log('ok:', msg);
}
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const S = require(path.join(root, 'public/src/js/games/shabd-core.js'));
const WS = require(path.join(root, 'public/src/js/dangal/word-safety.js'));
const C = require(path.join(root, 'public/src/js/games/scribble-core.js'));
const Words = require(path.join(root, 'server-lib/scribble-words.js'));
const PD = require(path.join(root, 'server-lib/party-deal.js'));
const Daily = require(path.join(root, 'server-lib/shabd-daily.js'));
const AI = require(path.join(root, 'server-lib/dangal-ai.js'));
const Policy = require(path.join(root, 'public/src/js/dangal/dangal-live-policy.js'));

function seeded(seed) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 0x100000000;
  };
}

/** Load the browser lexicon files into a sandbox, exactly as index.html does. */
function loadLexicon() {
  const g = { ShabdCore: S, console };
  g.window = g;
  g.globalThis = g;
  vm.createContext(g);
  ['data/shabd-answers.js', 'data/shabd-allowed.js', 'data/shabd-gloss.js', 'shabd-lexicon.js'].forEach((f) =>
    vm.runInContext(read('public/src/js/games/' + f), g, { filename: f })
  );
  return g;
}

// ════════════════════════════════════════════════════════════ Shabd Five

// ─── 1. Tile colouring incl. duplicate letters ───────────────────────────
{
  const ev = (g, a) => S.evaluate(g, a).map((s) => s[0]).join('');
  assert(ev('CRANE', 'CRANE') === 'ccccc', 'exact match all green');
  assert(ev('SPEED', 'ABIDE') === 'aapap', 'duplicate E: only the first unmatched E is amber, D amber');
  assert(ev('EERIE', 'THEME') === 'paaac', 'EERIE vs THEME: final E green, one E amber, rest grey');
  assert(ev('LLAMA', 'HELLO') === 'ppaaa', 'LLAMA vs HELLO: both Ls amber (answer has two)');
  assert(ev('ALLOT', 'HELLO') === 'apcpa', 'ALLOT vs HELLO: L green + L amber + O amber');
  assert(ev('ROBOT', 'FLOOR') === 'ppaca', 'ROBOT vs FLOOR: green O takes priority over the earlier O');
  const k = S.keyStates(['SPEED'], 'ABIDE');
  assert(k.S === 'absent' && k.E === 'present' && k.D === 'present', 'keyboard states from guesses');
  const k2 = S.keyStates(['SPEED', 'ABIDE'], 'ABIDE');
  assert(k2.E === 'correct' && k2.S === 'absent', 'keyboard upgrades to the best state');
}

// ─── 2. Hard mode ────────────────────────────────────────────────────────
{
  assert(S.hardModeViolation('TRAIN', [], 'CRANE') === null, 'hard mode: first guess is free');
  assert(/2nd letter must be R/.test(S.hardModeViolation('TOAST', ['BRING'], 'CRANE') || ''), 'hard mode: greens must stay in place');
  assert(/must contain A/.test(S.hardModeViolation('BLIMP', ['SALTY'], 'CRANE') || '') , 'hard mode: ambers must be reused');
  assert(S.hardModeViolation('BRAND', ['BRING'], 'CRANE') === null, 'hard mode: legal follow-up passes');
  assert(/2× L/.test(S.hardModeViolation('BLAME', ['LLAMA'], 'HELLO') || ''), 'hard mode: duplicate hints must be reused twice');
  assert(S.hardModeViolation('LOYAL', ['LLAMA'], 'HELLO') === null, 'hard mode: both copies reused passes');
}

// ─── 3. Dictionary vs answers; schedule not in plain text ────────────────
{
  const g = loadLexicon();
  const L = g.ShabdLexicon;
  assert(L && L.answerCount >= 1500 && L.answerCount <= 2500, 'curated answers ~1.5–2.5k (' + (L && L.answerCount) + ')');
  assert(L.allowedCount >= 10000, 'large allowed dictionary (' + L.allowedCount + ')');
  assert(L.isAllowed('AAHED') && !L.isAnswer('AAHED'), 'obscure words are guessable but never answers');
  assert(!L.isAllowed('ZZZZZ') && !L.isAllowed('ABCDE'), 'non-words rejected');
  assert(g.SHABD_ANSWERS_ENC === undefined, 'encoded schedule global removed after decode');

  const src = JSON.parse(read('scripts/data/shabd-answers-source.json'));
  const answers = Array.isArray(src) ? src : src.answers;
  assert(answers.length === L.answerCount, 'source list matches decoded schedule size');
  assert(answers.every((w) => L.isAnswer(w) && L.isAllowed(w)), 'every answer is also an allowed guess');
  const plural = answers.filter((w) => /S$/.test(w) && !/(SS|US|IS|OS)$/.test(w));
  assert(plural.length === 0, 'no plural-by-S answers (' + plural.slice(0, 5).join(',') + ')');
  assert(answers.every((w) => !WS.isBlocked(w)), 'no offensive answers');

  const sched = (read('public/src/js/games/data/shabd-answers.js').match(/SHABD_ANSWERS_ENC="([^"]*)"/) || [])[1] || '';
  const glossKeys = Object.keys(JSON.parse((read('public/src/js/games/data/shabd-gloss.js').match(/SHABD_GLOSS=(\{[\s\S]*?\});\}\)/) || [])[1] || '{}')).join(' ');
  assert(sched.length === answers.length * 5 && /^[0-9a-z]+$/.test(sched), 'schedule ships as one encoded base-36 string');
  // Random base-36 text can contain a real word by chance (~0.25 expected); a plain list would hit ~all.
  const leaks = answers.filter((w) => sched.indexOf(w.toLowerCase()) >= 0 || glossKeys.toUpperCase().indexOf(w) >= 0);
  assert(leaks.length <= 3, 'answers are not readable in the shipped schedule or gloss keys (' + leaks.slice(0, 5).join(',') + ')');
  assert(/^[0-9a-z]{7}( [0-9a-z]{7})*$/.test(glossKeys), 'gloss is keyed by word hash');
  const html = read('public/index.html');
  assert(!/curate-shabd|build-shabd-lexicon/.test(html) && !fs.existsSync(path.join(root, 'scripts/curate-shabd-answers.js')), 'no script writes a plain answer file');
  assert(html.indexOf('shabd-core.js') < html.indexOf('shabd-lexicon.js'), 'shabd-core loads before the lexicon');

  // Deterministic daily, same for everyone.
  const d1 = L.daily(100);
  assert(d1 && d1 === L.daily(100) && L.isAnswer(d1), 'daily(n) is deterministic and an answer');
  const seen = new Set();
  for (let n = 0; n < 365; n++) seen.add(L.daily(n));
  assert(seen.size === 365, 'no repeat answers within a year');
  const enc = S.encodeSchedule(['CRANE', 'SLATE', 'ABIDE']);
  assert(!/crane|slate|abide/i.test(enc) && S.decodeSchedule(enc).join() === 'CRANE,SLATE,ABIDE', 'schedule encoding round-trips');
}

// ─── 4. Local-midnight rollover ──────────────────────────────────────────
{
  const a = S.dayNumber(new Date(2026, 5, 14, 23, 59, 59));
  const b = S.dayNumber(new Date(2026, 5, 15, 0, 0, 1));
  assert(b === a + 1, 'puzzle flips at local midnight');
  assert(S.dayNumber(new Date(2026, 5, 15, 0, 0, 1)) === S.dayNumber(new Date(2026, 5, 15, 23, 59, 0)), 'same puzzle all local day');
  assert(S.dayNumber(new Date(2026, 0, 1, 12)) === 0 && S.puzzleNo(0) === 1, 'puzzle #1 = 1 Jan 2026');
  const fake = { getFullYear: () => 2026, getMonth: () => 2, getDate: () => 8 };
  assert(S.dayNumber(fake) === 66, 'day number uses local Y/M/D fields (timezone independent)');
  const ms = S.msToMidnight(new Date(2026, 5, 14, 23, 0, 0));
  assert(ms === 3600000, 'countdown to next local midnight');
  assert(S.dayNoFromKey('2026-01-02') === 1 && S.dayKeyOf(1) === '2026-01-02', 'day keys round-trip');
  const t = Date.UTC(2026, 5, 15, 12);
  assert(Daily.serverDay(t) === S.dayNoFromKey('2026-06-15'), 'server day matches');
  let threw = false;
  try {
    Daily.cleanDay(Daily.serverDay(t) + 3, t);
  } catch (e) {
    threw = true;
  }
  assert(threw && Daily.cleanDay(Daily.serverDay(t) - 1, t) === Daily.serverDay(t) - 1, 'server accepts only ±1 day (any timezone)');
}

// ─── 5. Stats + streak (sync merge) ──────────────────────────────────────
{
  let st = S.emptyStats();
  st = S.recordDaily(st, 10, { won: true, guesses: 3 }, 1);
  st = S.recordDaily(st, 11, { won: true, guesses: 4, hard: true }, 2);
  st = S.recordDaily(st, 12, { won: true, guesses: 2 }, 3);
  st = S.recordDaily(st, 12, { won: false, guesses: 6 }, 4);
  assert(st.days[12].w === 1, 'recordDaily is idempotent per day');
  let sum = S.summary(st, 12);
  assert(sum.played === 3 && sum.winPct === 100 && sum.streak === 3 && sum.maxStreak === 3, 'streak counts consecutive wins');
  assert(S.summary(st, 13).streak === 3, 'streak survives until today ends');
  assert(S.summary(st, 14).streak === 0 && S.summary(st, 14).maxStreak === 3, 'missed day resets streak, max kept');
  assert(sum.dist[1] === 1 && sum.dist[2] === 1 && sum.dist[3] === 1, 'guess distribution');
  const lost = S.recordDaily(st, 13, { won: false }, 5);
  assert(S.summary(lost, 13).streak === 0 && S.summary(lost, 13).winPct === 75, 'loss breaks streak');
  const other = S.recordDaily(S.emptyStats(), 9, { won: true, guesses: 5 }, 9);
  const merged = S.mergeStats(st, other);
  assert(S.summary(merged, 12).streak === 4, 'merge across devices extends streak');
  const pr = S.recordPractice(S.recordPractice(st, { won: true, guesses: 2 }), { won: false });
  assert(pr.practice.played === 2 && pr.practice.wins === 1 && S.summary(pr, 12).played === 3, 'practice stats are separate');
  const legacy = S.migrateLegacy({ days: { '2026-01-11': { won: true, guesses: 4, hard: false } } });
  assert(legacy.days[10] && legacy.days[10].g === 4, 'legacy stats migrate');
}

// ─── 6. Spoiler-free share + challenge encryption ────────────────────────
{
  const share = S.shareGrid(['CRANE', 'SLATE'], 'SLATE', { hard: true, puzzle: 42 });
  assert(/^Shabd Five #42 2\/6\*/.test(share), 'share header: puzzle number + score + hard marker');
  assert(!/CRANE|SLATE|crane|slate/.test(share) && share.split('\n').length === 4, 'share grid has no letters');
  assert(/🟩🟩🟩🟩🟩/.test(share), 'share rows are emoji');
  assert(/🟧/.test(S.shareGrid(['SLATE'], 'SLATE', { contrast: true })), 'high-contrast share palette');
  assert(/X\/6/.test(S.shareGrid(['CRANE', 'CRANE', 'CRANE', 'CRANE', 'CRANE', 'CRANE'], 'SLATE', { puzzle: 1 })), 'loss shows X/6');
  assert(S.rowCodes(['CRANE'], 'CRANE')[0] === 'ggggg', 'row codes for leaderboards');

  const r = seeded(4);
  const tok = S.encodeChallenge('PIZZA', r);
  assert(/^[0-9a-z]{10}$/.test(tok) && !/pizza/i.test(tok), 'challenge token is 10 chars, word not visible');
  assert(S.decodeChallenge(tok) === 'PIZZA', 'challenge decodes');
  const tok2 = S.encodeChallenge('PIZZA', seeded(99));
  assert(tok2 !== tok && S.decodeChallenge(tok2) === 'PIZZA', 'salted: same word, different links');
  const bad = tok.slice(0, 9) + (tok[9] === 'a' ? 'b' : 'a');
  assert(S.decodeChallenge(bad) !== 'PIZZA', 'tampered token rejected / different');
  assert(S.decodeChallenge('nope') === null && S.encodeChallenge('AB1') === null, 'invalid challenges rejected');
}

// ─── 7. Server results: shape, one per day ───────────────────────────────
{
  const ok = Daily.cleanRows(['xyxxg', 'ggggg']);
  assert(ok.won && ok.guesses === 2, 'result rows validate');
  const bad = (rows) => {
    try {
      Daily.cleanRows(rows);
      return false;
    } catch (e) {
      return true;
    }
  };
  assert(bad(['ggggg', 'ggggg']) && bad(['abcde']) && bad(['xxxxx']) && bad([]), 'bad rows rejected (letters, post-win, short loss)');
  assert(!bad(['xxxxx', 'xxxxx', 'xxxxx', 'xxxxx', 'xxxxx', 'xxxxx']), 'six-row loss accepted');
  const ui = read('public/src/js/games/shabd-ui.js');
  assert(/locked/.test(ui) && /lbLocked/.test(ui), 'friends leaderboard hidden until you play');
  assert(/shabd_result/.test(ui) && /shabd_challenge/.test(ui) && /chatCardHtml/.test(read('public/src/js/features/baithak-chat.js')), 'Baithak result + challenge cards');
  assert(/shabd-/.test(read('public/src/js/core/deeplinks.js')), 'challenge deep link');
  assert(!/liveDuel|stakes:\s*true/.test(ui) && /stakes: false/.test(read('public/src/js/dangal/dangal-graduation.js').match(/wordguess:[^\n]+/)[0]), 'Shabd: no Live, no chips');
}

// ════════════════════════════════════════════════════════════ Scribble

// ─── 8. Packs, scoring curve, hints, near-miss, filter ───────────────────
{
  const st = Words.stats();
  assert(st.core >= 1500, 'core Scribble packs ≥1,500 words (' + st.core + ')');
  assert(st.easy > 200 && st.medium > 200 && st.hard > 200, 'difficulty tags spread');
  assert(Words.REGIONAL_IDS.indexOf('bollywood') >= 0 && Words.REGIONAL_IDS.indexOf('cricket') >= 0, 'optional regional packs');
  assert(C.DEFAULT_PACKS.every((id) => Words.REGIONAL_IDS.indexOf(id) < 0), 'regional packs are off by default');
  const all = Object.keys(Words.PACKS).reduce((a, id) => a.concat(Words.PACKS[id].easy, Words.PACKS[id].medium, Words.PACKS[id].hard), []);
  assert(all.every((w) => !WS.isBlocked(w)), 'all pack words pass the family filter');

  assert(C.guesserPoints(80000, 80000) === 300 && C.guesserPoints(0, 80000) === 50 && C.guesserPoints(40000, 80000) === 175, 'guesser points 300 → 50, linear');
  let mono = true;
  for (let t = 0; t < 80000; t += 5000) if (C.guesserPoints(t, 80000) > C.guesserPoints(t + 5000, 80000)) mono = false;
  assert(mono, 'faster guesses never score less');
  assert(C.drawerPerGuesser(4) === 50 && C.drawerPerGuesser(40) === 10, 'drawer points per guesser (200 split, min 10)');

  assert(C.hintSchedule(80000, 2, 6).join() === '26667,53333', 'hints at 1/3 and 2/3 of draw time');
  assert(C.hintSchedule(80000, 3, 4).length === 2, 'hints always leave 2 letters hidden');
  assert(C.hintSchedule(80000, 0, 8).length === 0, 'hints can be off');
  assert(C.pattern('ice cream', [0]) === 'i__ _____', 'pattern keeps spaces');

  assert(C.isClose('elephnt', 'elephant') && C.isClose('pizzq', 'pizza'), 'near miss within 1–2 edits');
  assert(!C.isClose('pizza', 'pizza') && !C.isClose('tomato', 'pizza'), 'exact / far guesses are not near misses');
  assert(C.isCorrect('Ice Cream!', 'ice cream'), 'correct check ignores case/punctuation/spaces');
  assert(C.revealsWord('its a p i z z a', 'pizza') && C.revealsWord('pizzza lol', 'pizza') && C.revealsWord('ice-cream', 'ice cream'), 'drawer filter catches spelled / split / typo word');
  assert(!C.revealsWord('nice drawing', 'pizza'), 'drawer filter lets normal chat through');

  const parsed = C.parseCustomWords('pizza party, office chair, f**k, shit, a, ' + 'x'.repeat(40));
  assert(parsed.words.indexOf('pizza party') >= 0 && parsed.words.indexOf('shit') < 0 && parsed.rejected.length >= 3, 'custom words moderated');
  const m = C.mergeSettings({ rounds: 99, drawTime: 5, hints: 9, customOnly: true, customWords: ['one', 'two'] });
  assert(m.rounds === 10 && m.drawTime === 30 && m.hints === 3 && !m.customOnly, 'settings clamp; custom-only needs 10+ words');
  const d = C.mergeSettings({});
  assert(d.rounds === 3 && d.drawTime === 80 && d.hints === 2, 'defaults: 3 rounds, 80 s, 2 hints');
}

// ─── 9. Canvas replay (late joiners / reconnect) ─────────────────────────
{
  const s = (k, c) => ({ t: 's', k, c: c || '#000000', w: 10, p: [1, 2, 3, 4] });
  const batches = [
    { o: [s(1), s(1), s(2)] },
    JSON.stringify({ o: [s(3), { t: 'u' }] }),
    { d: JSON.stringify({ o: [{ t: 'u' }, { t: 'r' }] }) },
    { o: [{ t: 'f', k: 4, c: '#ff0000', x: 10, y: 10 }] },
  ];
  const g = C.replay(batches);
  assert(g.length === 3 && g[0].ops.length === 2 && g[2].ops[0].t === 'f', 'replay groups strokes, undo/redo, fill');
  const g2 = C.replay(batches.concat([{ o: [{ t: 'c', k: 5 }, s(6)] }]));
  assert(C.visibleOps(g2).length === 1, 'clear hides earlier strokes');
  const g3 = C.replay([{ o: [s(1), s(2), { t: 'u' }, s(3), { t: 'r' }] }]);
  assert(g3.length === 2 && g3[1].k === 3, 'a new stroke drops the redo stack');
  assert(C.cleanOp({ t: 's', k: 1, c: 'red;', w: 999, p: [99999, -5] }).w === 60 && C.cleanOp({ t: 'x' }) === null, 'wire ops sanitized');
}

// ─── 10. Live room: 5 players, 3 rounds, hints, near miss, secrets ───────
{
  const T0 = 1.8e12;
  let now = T0;
  const rng = seeded(11);
  const ids = ['h', 'a', 'b', 'c', 'd'];
  const room = PD.newRoom({ game: 'scribble', uid: 'h', name: 'Host', settings: { rounds: 3, drawTime: 60, hints: 2 }, now });
  const R = (uid, op, args) => PD.reduceRoom(room, uid, op, args || {}, now, rng).result;
  const beat = (list) => (list || ids).forEach((id) => room.presence && room.pub.players[id] && !room.pub.players[id].left && (room.presence[id] = { at: now, online: true }));
  ids.slice(1).forEach((id) => R(id, 'join', { name: id.toUpperCase() }));
  R('h', 'settings', { settings: { rounds: 3, drawTime: 60, hints: 2 } });
  R('h', 'start');
  const st = () => room.pub.state;
  assert(st() && st().phase === 'pick' && st().drawer, 'game starts with a word pick');

  const leakCheck = (label) => {
    const s = room.server.pub;
    const word = s.word;
    const choices = s.choices || [];
    // String *values* only: a pack word like "game" must not match the JSON key "game",
    // and enum fields (phase "draw", reason, chat kind) are not user text.
    const ENUM_KEYS = new Set(['phase', 'reason', 'k', 'status', 'game', 'type']);
    const values = new Set();
    (function walk(v, key) {
      if (typeof v === 'string') {
        if (!ENUM_KEYS.has(key)) values.add(v);
      } else if (v && typeof v === 'object') Object.keys(v).forEach((k) => walk(v[k], k));
    })(room.pub);
    const hidden = s.phase === 'pick' || s.phase === 'draw';
    let leaked = false;
    if (hidden) {
      (word ? [word] : choices).forEach((w) => {
        if (values.has(w)) leaked = true;
      });
      Object.keys(room.secrets || {}).forEach((id) => {
        if (id !== s.drawer) leaked = true;
      });
    }
    return !leaked && !('word' in st()) && !('choices' in st());
  };

  const d0 = st().drawer;
  const sec = room.secrets[d0];
  assert(sec && sec.choices.length === 3 && leakCheck(), 'only the drawer gets the 3 choices; pub has no word');
  const diffs = sec.choices.map((w) => (Words.PACKS && Object.keys(Words.PACKS).some((p) => Words.PACKS[p].easy.indexOf(w) >= 0) ? 'e' : 'o'));
  assert(diffs[0] === 'e', 'first choice is easy');

  let threw = null;
  try {
    R(ids.find((id) => id !== d0), 'pick', { idx: 0 });
  } catch (e) {
    threw = e.code;
  }
  assert(threw === 'not_drawer', 'only the drawer can pick');
  R(d0, 'pick', { idx: 1 });
  const word = room.server.pub.word;
  assert(st().phase === 'draw' && room.secrets[d0].word === word && leakCheck(), 'drawer secret switches to the word; guessers see a pattern only');
  assert(st().pattern && st().pattern.replace(/[^_]/g, '').length === word.replace(/[^a-z]/g, '').length, 'pattern hides every letter at first');

  // Hint reveal on schedule.
  const hints = room.server.pub.hints;
  if (hints.length) {
    now = room.server.pub.phaseAt + hints[0] + 5;
    beat();
    R('h', 'tick');
    assert(st().shown === 1 && leakCheck(), 'first letter hint revealed at its mark');
  } else assert(true, 'short word — no hints scheduled');

  // Drawer can't leak the word; near miss is private.
  threw = null;
  try {
    R(d0, 'guess', { text: 'hint: ' + word });
  } catch (e) {
    threw = e.code;
  }
  assert(threw === 'word_blocked' && JSON.stringify(st().chat).indexOf(word) < 0, 'drawer chat filtered server-side');
  const others = ids.filter((id) => id !== d0);
  const typo = word.length >= 4 ? word.slice(0, -1) + (word.slice(-1) === 'z' ? 'y' : 'z') : null;
  if (typo && !C.isCorrect(typo, word)) {
    const out = R(others[0], 'guess', { text: typo });
    assert(out.close === true && !out.correct, 'near miss answered privately (' + typo + ')');
  }
  threw = null;
  try {
    R(others[0], 'guess', { text: 'you shit' });
  } catch (e) {
    threw = e.code;
  }
  assert(threw === 'blocked', 'profanity blocked in chat');

  // Correct guesses: hidden, time-decayed points.
  now += 1000;
  beat();
  const g1 = R(others[0], 'guess', { text: word.toUpperCase() });
  assert(g1.correct && g1.pts > 50 && g1.pts <= 300, 'correct guess scores ' + g1.pts);
  const chat = JSON.stringify(st().chat);
  assert(chat.indexOf(word) < 0 && st().chat.some((c) => c.k === 'correct' && c.u === others[0]), '"X guessed the word!" without the word');
  threw = null;
  try {
    R(others[0], 'guess', { text: word });
  } catch (e) {
    threw = e.code;
  }
  assert(threw === 'word_blocked', 'players who guessed cannot post the word');
  now += 2000;
  beat();
  const g2 = R(others[1], 'guess', { text: word });
  assert(g2.correct && g2.pts <= g1.pts, 'later guesses score less or equal');
  R(others[2], 'guess', { text: word });
  R(others[3], 'guess', { text: word });
  assert(st().phase === 'reveal' && st().reason === 'all' && st().lastWord === word, 'all guessed → reveal with word');
  const drawerPts = st().turnPts[d0];
  assert(drawerPts === C.drawerPerGuesser(4) * 4, 'drawer earns per correct guesser (' + drawerPts + ')');

  // Pick timeout → auto-pick.
  now = room.pub.deadline + 1;
  beat();
  R('h', 'tick');
  const d1 = st().drawer;
  assert(st().phase === 'pick' && d1 !== d0, 'next drawer after reveal');
  now = room.pub.deadline + 1;
  beat();
  R('h', 'tick');
  assert(st().phase === 'draw' && room.server.pub.misses[d1] === 1 && room.secrets[d1].word, 'pick timeout auto-picks a word');

  // Drawer disconnect → turn skipped.
  now += 1000;
  beat(ids.filter((id) => id !== d1));
  room.presence[d1] = { at: now - 60 * 60 * 1000, online: false };
  R('h', 'tick');
  assert(st().phase === 'reveal' && st().reason === 'left', 'drawer disconnect skips the turn');
  room.presence[d1] = { at: now, online: true };

  // Reconnect + late joiner.
  now += 500;
  const joined = R('late', 'join', { name: 'Late' });
  assert(joined.joined && !joined.pending && room.server.pub.players.some((p) => p.id === 'late'), 'late joiner enters as a guesser mid-game');

  // Vote-kick (majority of the rest).
  const target = 'late';
  const voters = ['h', 'a', 'b'];
  let res;
  const all = ids.concat(['late']);
  voters.forEach((v) => {
    now += 10;
    beat(all);
    res = R(v, 'votekick', { target });
  });
  assert(res.kicked && room.pub.players.late.left && room.server.pub.kicked.late, 'majority vote-kick removes the player');
  threw = null;
  try {
    R('late', 'join', { name: 'Late' });
  } catch (e) {
    threw = e.code;
  }
  assert(threw === 'removed' || threw === 'not_member', 'kicked players cannot rejoin');
  threw = null;
  try {
    R('a', 'kick', { target: 'b' });
  } catch (e) {
    threw = e.code;
  }
  assert(threw === 'host_only', 'only the host can kick directly');

  // Play the rest out on timers.
  let guard = 0;
  let clean = true;
  while (!st().over && guard++ < 500) {
    now = (room.pub.deadline || now) + 1;
    beat();
    R('h', 'tick');
    if (!leakCheck()) clean = false;
  }
  assert(clean, 'word never in pub / other players’ secrets across every turn');
  assert(st().over && st().ranking && st().ranking.length >= 5, 'game ends after 3 rounds with a ranking');
  assert(room.server.pub.round === 3, 'three rounds played');
  const recapHidden = JSON.stringify(room.secrets || {});
  assert(recapHidden === '{}' || recapHidden.indexOf('choices') < 0, 'no secrets left after game over');

  // Host migration.
  now += 1000;
  room.presence.h = { at: now - 60 * 60 * 1000, online: false };
  beat(['a', 'b', 'c', 'd']);
  R('a', 'tick');
  assert(room.pub.host !== 'h', 'host migrates when the host drops');
}

// ─── 11. Pick-timeout AFK policy + policy registry ───────────────────────
{
  const p = Policy.policyFor('scribble');
  assert(p.leave === 'skip_turn' && p.afk.action === 'auto_pick', 'live policy: skip turn on leave, auto-pick on AFK');
  let misses = 0;
  let forfeit = false;
  for (let i = 0; i < p.afk.maxMisses; i++) {
    const step = Policy.afkStep(misses, p);
    misses = step.misses;
    forfeit = step.forfeit;
  }
  assert(forfeit, 'repeated missed picks skip the turn');
}

// ─── 12. AI themed pack: fallback with AI off, unsafe output rejected ────
(async () => {
  const off = AI.createDangalAI({ env: {} });
  const r = await off.run('generateWordPack', { game: 'scribble', theme: 'space', count: 20 }, { uid: 'u1' });
  assert(r.source === 'fallback' && Array.isArray(r.data.words) && r.data.words.length > 0, 'generateWordPack falls back with AI off');
  const bad = AI.createDangalAI({ env: { AI_FEATURES_ENABLED: 'true' }, callAI: async () => ({ text: JSON.stringify({ words: ['rocket', 'tits', 'moon'] }) }) });
  const r2 = await bad.run('generateWordPack', { game: 'scribble', theme: 'space', count: 3 }, { uid: 'u2' });
  assert(r2.source === 'fallback', 'unsafe AI word pack rejected by the word filter');
  const good = AI.createDangalAI({ env: { AI_FEATURES_ENABLED: 'true' }, callAI: async () => ({ text: JSON.stringify({ words: ['rocket', 'comet', 'moon', 'planet', 'astronaut'] }) }) });
  const r3 = await good.run('generateWordPack', { game: 'scribble', theme: 'space', count: 5 }, { uid: 'u3' });
  assert(r3.source === 'ai' && r3.data.words.indexOf('comet') >= 0, 'safe, valid AI pack accepted');
  const ui = read('public/src/js/games/scribble-ui.js');
  assert(/isAiFeaturesEnabled/.test(ui) && /generateWordPack/.test(ui), 'AI pack only offered when AI is on');

  // ─── 13. Registry, rules, wiring ────────────────────────────────────────
  const grad = read('public/src/js/dangal/dangal-graduation.js');
  assert(/scribble:\s*\{ grade: 'live', sync: 'liveParty', stakes: true \}/.test(grad), 'Scribble graduation unchanged (liveParty, stakes)');
  const html = read('public/index.html');
  assert(/word-safety\.js/.test(html) && /data-party-lazy src="\/src\/js\/games\/scribble-core\.js/.test(html) && /scribble-ui\.js/.test(html) && /shabd-ui\.js/.test(html), 'index.html wires P5 scripts');
  assert(/scribble: \['games\/scribble-core\.js'\]/.test(read('public/src/js/games/party-kit.js')), 'Scribble core lazy-loaded with its room');
  assert(/scribble_canvas/.test(read('firebase/database.rules.json')), 'canvas RTDB rules present');
  const rules = read('public/src/js/dangal/dangal-rules.js');
  assert(/50 \+ 250/.test(rules) && /2–12 players/.test(rules), 'rules document scoring + player count');
  assert(!/Wordle|skribbl/i.test(read('public/src/js/games/shabd-ui.js') + read('public/src/js/games/scribble-ui.js') + rules + read('public/src/js/games/data/shabd-allowed.js').slice(0, 400)), 'no borrowed brand names');
  const api = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js'));
  assert(api.length <= 12, 'api/*.js stays ≤12 (' + api.length + ')');
  assert(/action === 'shabd'/.test(read('api/media-config.js')), 'Shabd social folded into media-config');
  assert(PD.GAMES ? !!PD.GAMES.scribble : /scribble: createScribbleAdapter|scribble:/.test(read('server-lib/party-deal.js')), 'Scribble registered in party rooms');
  assert(/'scribble'/.test(read('server-lib/dangal-economy.js')), 'Scribble chips settle on the server');

  console.log(failed ? `\n${failed} FAILED` : '\nAll Dangal P5 checks passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
