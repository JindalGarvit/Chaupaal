/**
 * Dangal P16 — light AI across the roster + one AI cost/control layer + final honesty / global audit.
 *  (a) Rules Q&A: FAQ ≥5 per game, deterministic answers, "Not covered", AI grounded on our passages
 *      (mocked provider must cite sections; invented numbers / unknown cites / out of scope → fallback)
 *  (b) post-game tips: ≥10 per tip game, numbers validated against stats, never mid-game
 *  (c) Kakuro + Shabd Five hints: deterministic step, AI re-wording grounded, answer never leaked
 *  (d) recommender determinism + plain reasons; (e) Khoj + intents resolve every game + retired ids
 *  (f) budget: per-hook caps, kill switch, cache, tiers, timeout → fallback, per-day telemetry, admin
 *  (g) audit scans: banned claims, trademarks, attribution, simulated labels, bots labelled, chips,
 *      18+ entry points, global-first strings, accessibility, licences; api/*.js = 12
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  passed += 1;
  console.log('✓', msg);
}

const root = path.join(__dirname, '..');
const { readWithCopy } = require('./lib/i18n-source');
const read = (p) => readWithCopy(p);
const clone = (v) => JSON.parse(JSON.stringify(v));

const Rules = require(path.join(root, 'public/src/js/dangal/dangal-rules.js'));
const DA = require(path.join(root, 'public/src/js/dangal/dangal-assist.js'));
const AI = require(path.join(root, 'server-lib/dangal-ai.js'));

/** dangal-graduation.js is browser-only: run it in a tiny window to read the roster + retired list. */
function graduation() {
  const ctx = { console, document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] }, localStorage: { getItem: () => null, setItem() {} } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('public/src/js/dangal/dangal-graduation.js'), ctx);
  return ctx;
}

(async () => {
  const G = graduation();
  const rosterIds = Array.from(G.DANGAL_ROSTER_IDS || []);
  assert(rosterIds.length === 25 && rosterIds.every((id) => DA.IDS.indexOf(id) >= 0) && DA.IDS.length === 25, 'catalog covers the 25-game roster (dangal-graduation) exactly');
  const ageGated = Array.from(G.DANGAL_AGE_GATED_IDS || []);
  assert(['poker', 'teenpatti'].every((id) => ageGated.indexOf(id) >= 0) && DA.CATALOG.filter((g) => g.adult).every((g) => ageGated.indexOf(g.id) >= 0), 'catalog 18+ flags match the graduation age-gate list');

  // ================================================================ (a) rules Q&A
  {
    assert(Rules.IDS.length === 25 && Rules.IDS.every((id) => (DA.FAQ[id] || []).length >= 5), 'FAQ: ≥5 curated Q&As for every one of the 25 games');
    Rules.IDS.forEach((id) => {
      const heads = Rules.get(id).rules.map((r) => r.h).concat(['Glance', 'House rules']);
      assert(DA.FAQ[id].every((f) => heads.indexOf(f.s) >= 0), id + ': every FAQ answer cites a real rule section');
      const self = DA.FAQ[id].map((f) => DA.answerRules(id, f.q));
      assert(self.every((a) => !a.notCovered && a.section), id + ': AI-off search answers its own FAQ with a cited section');
      const out = DA.answerRules(id, 'What is the capital of France?');
      assert(out.notCovered && out.answer === DA.NOT_COVERED && out.suggest.length, id + ': out-of-scope → "Not covered by these rules." with suggestions');
    });
    const kw = DA.answerRules('chess', 'what happens on the clock when time is up');
    assert(!kw.notCovered && kw.section === 'Clock', 'AI-off keyword search falls through to the rulebook section (Clock)');
    const house = DA.answerRules('ludo', 'what house rules are on?', { captureBonus: true, safeSquares: false });
    assert(house.source === 'house' && /Capture earns a bonus roll: On/.test(house.answer) && /Safe squares: Off/.test(house.answer), 'house rules answer lists the active variants');
    const passages = DA.rulesPassages('carrom', { mode: 'doubles' });
    assert(passages.some((p) => p.id === 'G') && passages.some((p) => p.id === 'R1') && passages.some((p) => p.id === 'F1') && passages.find((p) => p.id === 'H').body.indexOf('Players: doubles') >= 0 && passages.some((p) => p.id === 'S'), 'passages: glance, rulebook, FAQ, house rules and the rule source');

    const env = { AI_FEATURES_ENABLED: 'true', AI_DAILY_CALL_CAP: '200' };
    const mk = (reply) => {
      const calls = [];
      return { calls, ai: AI.createDangalAI({ env, callAI: async (o) => (calls.push(o), { text: typeof reply === 'function' ? reply(o) : JSON.stringify(reply) }) }) };
    };
    const clockId = DA.rulesPassages('chess').find((p) => p.h === 'Clock').id;
    const good = mk({ answer: 'If your time runs out you lose, unless your opponent cannot possibly checkmate — then it is a draw.', cite: [clockId], covered: true });
    const r1 = await good.ai.run('rulesQA', { gameId: 'chess', question: 'What if my clock runs out?' }, { uid: 'u1' });
    assert(r1.source === 'ai' && r1.data.covered && r1.data.sections[0] === 'Clock' && r1.data.cite[0] === clockId, 'AI rules answer (mocked) cites the section it used');
    assert(/Passages \(JSON\)/.test(good.calls[0].messages[0].content) && /FIDE/.test(good.calls[0].messages[0].content) && /ONLY the numbered passages/.test(good.calls[0].messages[0].content), 'prompt grounds the model in our own rules text only');
    const spoof = await good.ai.run('rulesQA', { gameId: 'chess', question: 'x?', passages: [{ id: 'X', h: 'Fake', body: 'anything' }] }, { uid: 'u1' });
    assert(!/anything/.test(good.calls[good.calls.length - 1].messages[0].content), 'client-supplied passages are ignored — the server builds them');
    const invented = mk({ answer: 'You get 45 minutes on the clock.', cite: [clockId], covered: true });
    const r2 = await invented.ai.run('rulesQA', { gameId: 'chess', question: 'How long is the clock?' }, { uid: 'u2' });
    assert(r2.source === 'fallback' && r2.reason === 'invalid_output', 'an invented number (not in the cited passage) → deterministic fallback');
    const badCite = mk({ answer: 'Yes.', cite: ['R99'], covered: true });
    assert((await badCite.ai.run('rulesQA', { gameId: 'chess', question: 'Can I castle?' }, { uid: 'u3' })).source === 'fallback', 'a citation to a passage that does not exist → fallback');
    const noCite = mk({ answer: 'Paris is the capital.', cite: [], covered: true });
    const r4 = await noCite.ai.run('rulesQA', { gameId: 'chess', question: 'What is the capital of France?' }, { uid: 'u4' });
    assert(r4.source === 'fallback' && r4.data.covered === false && r4.data.answer === DA.NOT_COVERED, 'out-of-scope answered anyway (no citation) → rejected → "Not covered"');
    const honest = mk({ answer: 'I can’t tell from these rules.', cite: [], covered: false });
    const r5 = await honest.ai.run('rulesQA', { gameId: 'ludo', question: 'Who invented Ludo?' }, { uid: 'u5' });
    assert(r5.source === 'ai' && r5.data.covered === false && r5.data.answer === DA.NOT_COVERED, 'model says not covered → our one honest line');
    const off = AI.createDangalAI({ env: {}, callAI: () => { throw new Error('must not call'); } });
    const r6 = await off.run('rulesQA', { gameId: 'carrom', question: 'When can I pocket the Queen?' });
    assert(r6.source === 'fallback' && r6.data.covered && /own men/.test(r6.data.answer), 'AI off → FAQ / rulebook answer');
  }

  // ================================================================ (b) post-game tips
  const SAMPLE = {
    tiptap: [{ won: true, movesLeft: 7 }, { won: false, movesLeft: 0 }, { specials: 0 }, { specials: 4 }],
    brickbreaker: [{ livesLost: 3 }, { won: true, livesLost: 0 }, { powerups: 5 }, { won: false, level: 12 }],
    ankjod: [{ hints: 4 }, { won: true, hints: 0 }, { mistakes: 5 }, { minutes: 22 }],
    wordguess: [{ won: true, guesses: 6 }, { won: true, guesses: 2 }, { greyReused: 3 }, { won: false }],
    ttt: [{ draw: true }, { won: false, draw: false }, { mode: 'ultimate', won: true }],
    snakes: [{ snakes: 4 }, { ladders: 5 }, { sixes: 3 }],
    ludo: [{ timesCaptured: 4 }, { captures: 5 }, { won: false, tokensHome: 1 }],
    uno: [{ won: false, cardsLeft: 7 }, { caught: 1 }, { won: false, cardsLeft: 1 }],
    scribble: [{ guessed: 5 }, { won: false, place: 4 }],
    quiz: [{ correct: 2, total: 10 }, { correct: 10, total: 10 }, { won: true, score: 7450 }],
    carrom: [{ fouls: 3 }, { hardMissPct: 72 }, { queenLost: 1 }],
    poker: [{ riverCallPct: 70 }, { handsPlayedPct: 64 }, { handsPlayedPct: 8 }],
    teenpatti: [{ packs: 7, hands: 10 }, { showsLost: 3 }],
    bluff: [{ caught: 3 }, { badCalls: 2 }, { goodCalls: 4 }],
    streetcricket: [{ dots: 9, balls: 12 }, { wickets: 3 }, { boundaries: 6 }],
    badminton: [{ winners: 4, oppWinners: 9 }, { longest: 18 }, { smashes: 0 }],
    penalty: [{ goals: 1, kicks: 5 }, { saves: 0 }, { goals: 5, kicks: 5 }],
  };
  {
    const party = ['imposter', 'rajamantri', 'charades', 'mostlikely', 'werewolf', 'tambola'];
    const expected = DA.IDS.filter((id) => party.indexOf(id) < 0 && id !== 'chess' && id !== 'rummy');
    assert(JSON.stringify(DA.TIP_GAMES.slice().sort()) === JSON.stringify(expected.slice().sort()), 'tip games = every non-party title without its own coach (Chess / Rummy coach already)');
    DA.TIP_GAMES.forEach((id) => {
      const list = DA.TIPS[id];
      assert(list.length >= 10 && new Set(list.map((t) => t.id)).size === list.length, id + ': ≥10 rule-based tips');
      const fired = new Set();
      (SAMPLE[id] || []).forEach((s) => {
        const tip = DA.pickTip(id, s, 1);
        assert(tip && tip.grounded && DA.numbersGrounded(tip.text, s), id + ': stats ' + JSON.stringify(s) + ' → grounded tip “' + tip.text.slice(0, 50) + '…”');
        fired.add(tip.id);
      });
      const passagesText = DA.rulesPassages(id).map((p) => p.body).join(' ');
      list.filter((t) => !t.when).forEach((t) => assert(DA.numbersGrounded(t.text({}), passagesText), id + ' generic tip ' + t.id + ': any number it states is in the rulebook'));
      const generic = DA.pickTip(id, { won: true }, 7);
      assert(generic && !generic.grounded && DA.pickTip(id, { won: true }, 7).id === generic.id, id + ': a win with no stats → a stable generic tip');
    });
    assert(DA.pickTip('chess', {}) === null && DA.pickTip('werewolf', {}) === null, 'no tip library for coach / party games');
    assert(DA.tipAllowed('ludo', {}) && !DA.tipAllowed('ludo', { midGame: true }) && !DA.tipAllowed('teenpatti', { tableOpen: true }) && !DA.tipAllowed('imposter', {}), 'tips only after a game — never mid-game or while a chip table is open');
    const env = { AI_FEATURES_ENABLED: 'true' };
    const stats = { won: false, timesCaptured: 4, captures: 1 };
    const base = DA.pickTip('ludo', stats).text;
    const liar = AI.createDangalAI({ env, callAI: async () => ({ text: JSON.stringify({ text: 'You lost 9 tokens near the start — park on stars.', tips: [] }) }) });
    const t1 = await liar.run('coachExplain', { gameId: 'ludo', mode: 'tip', stats, baseTip: base }, { uid: 'a' });
    assert(t1.source === 'fallback' && t1.data.text === base, 'AI tip with a number not in the stats → our rule-based tip');
    const truth = AI.createDangalAI({ env, callAI: async () => ({ text: JSON.stringify({ text: 'You were sent home 4 times — the stars are your friends.', tips: [] }) }) });
    const t2 = await truth.run('coachExplain', { gameId: 'ludo', mode: 'tip', stats, baseTip: base }, { uid: 'a' });
    assert(t2.source === 'ai' && /4 times/.test(t2.data.text), 'AI tip grounded in the stats passes');
    const offTip = await AI.createDangalAI({ env: {} }).run('coachExplain', { gameId: 'ludo', mode: 'tip', stats });
    assert(offTip.source === 'fallback' && offTip.data.text === DA.pickTip('ludo', stats).text, 'AI off → the deterministic tip library');
    const gameUi = read('public/src/js/games/game-ui.js');
    assert(/DangalAssistUI\.showPostGameTip\(id/.test(gameUi) && /midGame: !!o\.midGame/.test(gameUi), 'tips run from the shared result funnel (recordDangalSession), after the game');
    assert(/tipStats:e\.tipStats/.test(read('public/src/js/features/dangal-ratings.js')), 'recordGameResult passes match stats through');
    const sites = { 'games/arcade.js': 'movesLeft', 'games/brick-breaker.js': 'livesLost', 'games/penalty.js': 'saves', 'games/rw-sports.js': 'boundaries', 'games/ank-jod.js': 'hints: hintsUsed', 'games/ludo-ui.js': 'timesCaptured', 'games/bluff-ui.js': 'badCalls', 'games/ohno-ui.js': 'cardsLeft', 'games/shabd-ui.js': 'greyReused', 'games/court-sports.js': 'oppWinners' };
    Object.keys(sites).forEach((f) => assert(read('public/src/js/' + f).indexOf(sites[f]) >= 0, f + ': real match stats feed the tip (' + sites[f] + ')'));
  }

  // ================================================================ (c) hints
  {
    const K = require(path.join(root, 'public/src/js/games/kakuro-core.js'));
    const bank = require(path.join(root, 'public/src/js/games/data/kakuro-bank.js'));
    const puzzle = (bank.PUZZLES || bank.puzzles || bank.easy || bank)[0] || null;
    const rows = puzzle && (puzzle.rows || puzzle);
    let h = null;
    try {
      const g = K.fromRows(rows);
      h = K.nextHint(rows, new Array(g.white.length).fill(0));
    } catch (e) {}
    assert(h && h.kind === 'step' && h.text && h.digit, 'Kakuro: the solver gives a deterministic next step (' + (h && h.techName) + ')');
    const facts = { text: h.text, digit: h.digit, technique: h.techName || '' };
    const env = { AI_FEATURES_ENABLED: 'true' };
    const good = AI.createDangalAI({ env, callAI: async () => ({ text: JSON.stringify({ text: 'Look at where the two runs cross: only ' + h.digit + ' fits both.', tips: [] }) }) });
    const g1 = await good.run('coachExplain', { gameId: 'ankjod', mode: 'hint', facts, baseText: h.text }, { uid: 'k' });
    assert(g1.source === 'ai', 'Kakuro: AI re-wording using the solver’s digit passes');
    const bad = AI.createDangalAI({ env, callAI: async () => ({ text: JSON.stringify({ text: 'Put 99 in the corner.', tips: [] }) }) });
    const g2 = await bad.run('coachExplain', { gameId: 'ankjod', mode: 'hint', facts, baseText: h.text }, { uid: 'k' });
    assert(g2.source === 'fallback' && g2.data.text === h.text, 'Kakuro: invented digits → the deterministic hint text');
    assert(/DangalAssistUI\.explainHint\('ankjod'/.test(read('public/src/js/games/ank-jod.js')), 'Kakuro UI asks for the explanation after the deterministic step');

    globalThis.ShabdCore = require(path.join(root, 'public/src/js/games/shabd-core.js'));
    require(path.join(root, 'public/src/js/games/data/shabd-answers.js'));
    require(path.join(root, 'public/src/js/games/shabd-lexicon.js'));
    const SC = globalThis.ShabdCore;
    const Lex = globalThis.ShabdLexicon;
    const answer = Lex.daily(10);
    const guesses = ['CRANE', 'SLOTH'].filter((w) => w !== answer);
    const dh = SC.deductionHint(guesses, answer, Lex.countMatching);
    assert(dh.text && dh.text.toUpperCase().indexOf(answer) < 0 && dh.facts.left >= 1 && Lex.countMatching((w) => SC.consistent(w, SC.knowledge(guesses, answer))) === dh.facts.left, 'Shabd Five: deduction hint states what is proven + how many words fit — never the answer');
    assert(SC.consistent(answer, SC.knowledge(guesses, answer)), 'Shabd Five: the answer is always consistent with the colours shown');
    assert(SC.greyReused(['CRANE', 'CRISP'], 'BLOOM') >= 2, 'Shabd Five: grey letters typed again are counted for the tip');
    const leak = AI.createDangalAI({ env, callAI: async () => ({ text: JSON.stringify({ text: 'Try a word like ' + answer.toLowerCase() + ' next.', tips: [] }) }) });
    const s1 = await leak.run('coachExplain', { gameId: 'wordguess', mode: 'hint', facts: dh.facts, baseText: dh.text }, { uid: 's' });
    assert(s1.source === 'fallback' && s1.data.text === dh.text, 'Shabd Five: an AI hint that names a word → rejected (could be the answer)');
    const fine = AI.createDangalAI({ env, callAI: async () => ({ text: JSON.stringify({ text: 'Keep the green letters where they are and move the amber ones to the open spots.', tips: [] }) }) });
    assert((await fine.run('coachExplain', { gameId: 'wordguess', mode: 'hint', facts: dh.facts, baseText: dh.text }, { uid: 's' })).source === 'ai', 'Shabd Five: a plain-English strategy hint passes');
    const ui = read('public/src/js/games/shabd-ui.js');
    assert(/mode !== 'daily'/.test(ui) && /function showHint\(\)/.test(ui) && /text\.toUpperCase\(\)\.indexOf\(answer\) >= 0/.test(ui), 'Shabd Five UI: hints in Practice / archive only, and the phone re-checks AI text against the answer');
  }

  // ================================================================ (d) recommender
  {
    const ctx = { players: 6, where: 'together', minutes: 20, recent: ['imposter'], friendsOnline: 2 };
    const a = DA.recommend(ctx);
    const b = DA.recommend(clone(ctx));
    assert(a.length === 5 && JSON.stringify(a) === JSON.stringify(b), 'recommender: same context → same list (deterministic)');
    assert(a.every((g) => /Great for 6 people in the same room/.test(g.reason) || /just played/.test(g.reason)), 'recommender: plain reasons (“Great for 6 people in the same room”)');
    assert(a[0].id !== 'imposter', 'recommender: the game you just played drops down');
    assert(DA.recommend({ players: 4, where: 'remote' }).every((g) => DA.CATALOG.find((c) => c.id === g.id).remote), 'recommender: separate phones only suggests games that work remotely');
    assert(DA.recommend({ players: 4, limit: 25 }).every((g) => ['poker', 'teenpatti'].indexOf(g.id) < 0) && DA.recommend({ players: 4, adult: true, limit: 25 }).some((g) => g.id === 'poker'), 'recommender: 18+ card tables only for confirmed adults');
    assert(DA.recommend({ players: 1 }).every((g) => { const c = DA.CATALOG.find((x) => x.id === g.id); return c.solo || c.bots; }), 'recommender: one player → solo games and labelled bots');
    assert(DA.recommend({ players: 9, where: 'together' })[0].id === 'werewolf' || DA.recommend({ players: 9, where: 'together' }).slice(0, 3).some((g) => g.id === 'werewolf'), 'recommender: a big group in one room gets Werewolf near the top');
    const rr = AI.createDangalAI({ env: { AI_FEATURES_ENABLED: 'true' }, callAI: async () => ({ text: JSON.stringify({ order: ['charades', 'newgame'] }) }) });
    const out = await rr.run('rerankGames', { candidates: [{ id: 'charades' }, { id: 'werewolf' }] }, { uid: 'r' });
    assert(out.source === 'fallback' && out.data.order.join() === 'charades,werewolf', 'AI rerank can only reorder our candidates (new ids → fallback order)');
    assert(/window\.DangalAssist/.test(read('public/src/js/games/party-hub.js')) && /DA\.recommend\(\{ players: count/.test(read('public/src/js/games/party-hub.js')) && /data-suggest-open/.test(read('public/src/js/features/dangal-ratings.js')), 'suggestions surface in the Party Hub and Manch (“What should we play?”)');
  }

  // ================================================================ (e) Khoj + intents
  {
    DA.CATALOG.forEach((g) => {
      const top = DA.searchGames(g.name)[0];
      assert(top && top.id === g.id, 'Khoj finds “' + g.name + '”');
    });
    const Q = {
      'play imposter': 'imposter', 'poker with friends': 'poker', 'daily word game': 'wordguess', kakuro: 'ankjod', 'Penalty Shootout': 'penalty',
      "texas hold'em": 'poker', 'would you rather': 'mostlikely', 'never have i ever': 'mostlikely', 'werewolf': 'werewolf', 'mafia': 'werewolf',
      'housie': 'tambola', 'noughts and crosses': 'ttt', 'snakes and ladders': 'snakes', 'gin rummy': 'rummy', 'trivia': 'quiz', 'gully cricket': 'streetcricket',
      'draw and guess': 'scribble', 'raja mantri': 'rajamantri', 'act it out': 'charades', 'breakout': 'brickbreaker', 'match 3': 'tiptap',
    };
    Object.keys(Q).forEach((q) => {
      const r = DA.resolveGame(q);
      assert(r && r.id === Q[q], 'Khoj / intents: “' + q + '” → ' + Q[q]);
    });
    const gR = Array.from(G.DANGAL_RETIRED_IDS || []);
    const isRetired = G.isRetiredGameId;
    assert(gR.length >= 10 && !/RETIRED_IDS|rushrunner/.test(read('public/src/js/dangal/dangal-assist.js')), 'retired list has one home (dangal-graduation); DangalAssist asks it');
    gR.concat(['snooker', 'billiards', 'football', 'kite']).forEach((id) => {
      const r = DA.resolveGame(id, { isRetired });
      assert((r && r.retired) || DA.isRetired(id, { isRetired }), 'retired “' + id + '” resolves to the retired screen');
    });
    assert(DA.resolveGame('play snooker', { isRetired }).retired === 'snooker' && !DA.resolveGame('xyzzy', { isRetired }), 'retired aliases resolve; nonsense finds nothing');
    const search = read('public/src/js/core/search.js');
    assert(/DA\.searchGames\(query/.test(search) && /openRetiredGameScreen\(r\.id\)/.test(search) && /getGames\(\{ dangal: true \}\)/.test(search), 'Khoj search uses DangalAssist, routes retired titles, and hides 18+ titles like Manch');
    // Intents manifest in a tiny window.
    const regs = [];
    const ictx = { console, RegExp, window: null, document: { querySelector: () => null }, ChaupaalIntents: { register: (d) => regs.push(d) }, DangalAssist: DA, t: global.t || ((k) => k), tt: global.tt };
    ictx.window = ictx;
    vm.createContext(ictx);
    vm.runInContext(read('public/src/js/core/chaupaal-intents-manifest.js'), ictx);
    const gameIntents = regs.filter((r) => /^dangal\.game\./.test(r.id));
    assert(gameIntents.length === 25, 'intents manifest: one “Play …” intent per roster game');
    assert(gameIntents.find((r) => r.id === 'dangal.game.imposter').phrases.some((p) => p.test('play imposter')) && gameIntents.find((r) => r.id === 'dangal.game.poker').phrases.some((p) => p.test("play texas hold'em")), 'intents: “play imposter” / “play texas hold’em” match');
    assert(regs.some((r) => r.id === 'dangal.find_game' && r.phrases.some((p) => p.test('daily word game'))), 'intents: need-based “daily word game” routes through the resolver');
    const html = read('public/index.html');
    assert(html.indexOf('/src/js/dangal/dangal-assist.js') < html.indexOf('/src/js/core/chaupaal-intents-manifest.js') && /dangal-assist-ui\.js/.test(html), 'index.html loads DangalAssist before the intents manifest');
  }

  // ================================================================ (f) one budget layer
  {
    let calls = 0;
    const reply = async (o) => (calls++, { text: JSON.stringify(o.feature === 'dangal_rerankGames' ? { order: ['a', 'b'] } : { line: 'Great shot!' }) });
    const kill = AI.createDangalAI({ env: { AI_FEATURES_ENABLED: 'true', DANGAL_AI_DISABLE: 'commentary, rulesqa' }, callAI: reply });
    const k1 = await kill.run('commentary', { event: 'goal' }, { uid: 'x' });
    const k2 = await kill.run('rerankGames', { candidates: [{ id: 'a' }, { id: 'b' }] }, { uid: 'x' });
    assert(k1.source === 'fallback' && k1.reason === 'hook_off' && k2.source === 'ai' && calls === 1, 'kill switch: DANGAL_AI_DISABLE=commentary,rulesqa turns those hooks off only (case-insensitive)');
    const all = AI.createDangalAI({ env: { AI_FEATURES_ENABLED: 'true', DANGAL_AI_DISABLE: 'all' }, callAI: reply });
    assert((await all.run('rerankGames', { candidates: [{ id: 'a' }] })).reason === 'hook_off' && AI.hookDisabled('quizPipeline', { DANGAL_AI_DISABLE: 'all' }), 'kill switch: "all" covers every hook incl. the quiz pipeline');
    const capped = AI.createDangalAI({ env: { AI_FEATURES_ENABLED: 'true', DANGAL_AI_HOOK_CAPS: 'commentary:1' }, callAI: reply });
    await capped.run('commentary', { n: 1 }, { uid: 'u' });
    const c2 = await capped.run('commentary', { n: 2 }, { uid: 'u' });
    const c3 = await capped.run('rerankGames', { candidates: [{ id: 'a' }, { id: 'b' }] }, { uid: 'u' });
    assert(c2.reason === 'user_cap' && c3.source === 'ai', 'per-hook per-user cap (DANGAL_AI_HOOK_CAPS) leaves other hooks alone');
    const share = AI.createDangalAI({ env: { AI_FEATURES_ENABLED: 'true', AI_DAILY_CALL_CAP: '10' }, callAI: reply });
    await share.run('rerankGames', { candidates: [{ id: 'a' }, { id: 'b' }], n: 1 }, { uid: 'p' });
    const s2 = await share.run('rerankGames', { candidates: [{ id: 'a' }, { id: 'b' }], n: 2 }, { uid: 'q' });
    assert(s2.reason === 'hook_cap' && (await share.run('commentary', { n: 3 }, { uid: 'q' })).source === 'ai', 'per-hook daily share of AI_DAILY_CALL_CAP (rerankGames 5% of 10 = 1/day)');
    const tiers = [];
    const tierAi = AI.createDangalAI({ env: { AI_FEATURES_ENABLED: 'true' }, callAI: async (o) => (tiers.push(o.tier), { text: '{"line":"ok"}' }) });
    await tierAi.run('commentary', { n: 9 }, { uid: 't' });
    assert(tiers[0] === AI.HOOK_POLICY.commentary.tier && AI.HOOKS.every((h) => AI.HOOK_POLICY[h].tier === 'fast'), 'model tier per hook (all live hooks on AI_MODEL_FAST)');
    assert(/balanced/.test(AI.EXTERNAL_HOOKS.quizPipeline.tier) && /tier: 'balanced'/.test(read('server-lib/quiz-ai-pipeline.js')), 'AI_MODEL_BALANCED only in the scheduler’s quiz fact-check');
    const cache = AI.createDangalAI({ env: { AI_FEATURES_ENABLED: 'true' }, callAI: reply });
    calls = 0;
    await cache.run('commentary', { event: 'win' }, { uid: 'c' });
    const again = await cache.run('commentary', { event: 'win' }, { uid: 'c' });
    assert(again.source === 'cache' && calls === 1, 'cache by input hash');
    const slow = AI.createDangalAI({ env: { AI_FEATURES_ENABLED: 'true' }, timeoutMs: 20, callAI: () => new Promise((r) => setTimeout(() => r({ text: '{"answer":"x","cite":[],"covered":false}' }), 150)) });
    const tm = await slow.run('rulesQA', { gameId: 'chess', question: 'castling?' }, { uid: 's' });
    assert(tm.source === 'fallback' && tm.reason === 'timeout' && tm.data.answer, 'timeout → deterministic fallback');
    const thrower = AI.createDangalAI({ env: { AI_FEATURES_ENABLED: 'true' }, callAI: async () => { throw new Error('500 upstream: secret-ish detail'); } });
    const th = await thrower.run('rulesQA', { gameId: 'chess', question: 'castling?' }, { uid: 's' });
    assert(th.source === 'fallback' && !/upstream|secret/.test(JSON.stringify(th)), 'provider errors never reach the caller');
    // Telemetry + persistence.
    const store = new Map();
    const FV = { increment: (n) => ({ __inc: n }), serverTimestamp: () => 0 };
    const merge = (prev, data) => {
      const out = Object.assign({}, prev || {});
      Object.keys(data).forEach((k) => {
        const v = data[k];
        if (v && v.__inc != null) out[k] = (Number(out[k]) || 0) + v.__inc;
        else if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = merge(out[k], v);
        else out[k] = v;
      });
      return out;
    };
    const db = {
      collection: (c) => ({
        doc: (id) => ({
          get: async () => ({ exists: store.has(c + '/' + id), data: () => store.get(c + '/' + id) }),
          set: async (d, o) => store.set(c + '/' + id, o && o.merge ? merge(store.get(c + '/' + id), d) : merge({}, d)),
          update: async (d) => store.set(c + '/' + id, Object.assign({}, store.get(c + '/' + id), d)),
        }),
      }),
    };
    const admin = { firestore: { FieldValue: FV } };
    const tel = AI.createDangalAI({ env: { AI_FEATURES_ENABLED: 'true', AI_DAILY_CALL_CAP: '100' }, db, admin, callAI: reply });
    await tel.run('commentary', { event: 'goal', k: 1 }, { uid: 'm' });
    await tel.run('commentary', { event: 'goal', k: 1 }, { uid: 'm' });
    await tel.run('rulesQA', { gameId: 'nope', question: 'x' }, { uid: 'm' });
    await tel.flushStats(true);
    const day = new Date().toISOString().slice(0, 10);
    const doc = store.get('dangalAiStats/' + day);
    assert(doc && doc.hooks.commentary.calls === 2 && doc.hooks.commentary.aiCalls === 1 && doc.hooks.commentary.cacheHits === 1 && doc.hooks.rulesQA.fallbacks === 1 && doc.hooks.commentary.costUsd > 0, 'telemetry per hook per day persisted: calls, AI calls, cache hits, fallbacks, est. $');
    const budget = store.get('chaupaalMeta/aiBudget');
    assert(budget && budget.day === day && budget.calls === 1 && budget.dangalHooks.commentary === 1, 'shared aiBudget counts each Dangal call (and per hook)');
    const t = tel.telemetry();
    assert(t.day === day && t.hooks.commentary.aiCalls === 1 && t.policy.hooks.rulesQA.userCap === 15 && t.costUsdEst > 0, 'telemetry() exposes today’s counters + the caps table');
    store.set('chaupaalMeta/aiBudget', { day: '2000-01-01', calls: 999, dangalHooks: { commentary: 999 } });
    await AI.createDangalAI({ env: { AI_FEATURES_ENABLED: 'true' }, db, admin, callAI: reply }).run('commentary', { fresh: 1 }, { uid: 'n' });
    const b2 = store.get('chaupaalMeta/aiBudget');
    assert(b2.day === day && b2.calls === 1 && b2.dangalHooks.commentary === 1, 'a new UTC day starts the shared budget from zero (old days don’t eat today’s cap)');
    const enrich = require(path.join(root, 'server-lib/ai-enrichment.js'));
    store.set('chaupaalMeta/aiBudget', { day: '2000-01-01', calls: 999 });
    await enrich.bumpBudget(db, admin, { calls: 2, tokensEst: 10 });
    assert(store.get('chaupaalMeta/aiBudget').calls === 2, 'bumpBudget (enrichment / quiz) also resets on a new day');
    const pipeline = require(path.join(root, 'server-lib/quiz-ai-pipeline.js'));
    const qj = await pipeline.runQuizJobs({ db: { collection() { throw new Error('no db'); } }, admin, now: Date.now(), deps: { aiEnabled: true, env: { DANGAL_AI_DISABLE: 'quizPipeline' } } });
    assert(qj.generation && qj.generation.skipped === 'hook_off', 'the scheduler’s quiz pipeline obeys the same kill switch');
    const pol = AI.policyTable({ AI_FEATURES_ENABLED: 'true', AI_DAILY_CALL_CAP: '200', DANGAL_AI_DISABLE: 'botPersona' });
    assert(pol.enabled && pol.hooks.botPersona.disabled && pol.hooks.commentary.dailyCap === 60 && pol.hooks.quizPipeline.external, 'caps table for admins: tier, per-user cap, daily cap, switch');
    const adminSrc = read('api/admin-feedback.js');
    assert(/view === 'dangal_ai'/.test(adminSrc) && /dangalAiStats/.test(adminSrc) && /Dangal AI usage/.test(read('public/admin/feedback.html')), 'telemetry visible in the existing admin surface (no new api file)');
    const mc = read('api/media-config.js');
    assert(/action === 'dangal_ai'/.test(mc) && /HOOKS\.indexOf\(hook\)/.test(mc), 'every client hook goes through media-config → the one layer');
    ['server-lib/dangal-ai.js', 'public/src/js/dangal/dangal-assist.js', 'public/src/js/dangal/dangal-assist-ui.js'].forEach((f) => assert(!/sk-ant-|xai-[A-Za-z0-9]{10}|AIza[0-9A-Za-z_-]{20}/.test(read(f)), f + ': no embedded keys'));
    const ui = read('public/src/js/dangal/dangal-assist-ui.js');
    assert(/isAiFeaturesEnabledSync/.test(ui) && /numbersGrounded\(text, stats\)/.test(ui) && !/res\.error/.test(ui), 'phone only asks AI when on, re-checks numbers, never shows raw errors');
  }

  // ================================================================ (g) audit
  {
    const walk = (d, out) => {
      fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (/\.js$/.test(e.name)) out.push(p);
      });
      return out;
    };
    const jsFiles = walk(path.join(root, 'public/src/js'), []).filter((f) => !/[\\/]data[\\/]/.test(f));
    const relOf = (f) => path.relative(root, f).replace(/\\/g, '/');
    const scan = (re, files, allow) => {
      const hits = [];
      files.forEach((f) => {
        read(relOf(f))
          .split('\n')
          .forEach((l, i) => re.test(l) && !(allow && allow.test(l)) && hits.push(relOf(f) + ':' + (i + 1)));
      });
      return hits;
    };
    const tm = scan(/\b(UNO|Wordle|Codenames|skribbl|Pictionary|Scrabble|Monopoly|Candy Crush|Boggle|Jenga|Among Us)\b/, jsFiles.concat([path.join(root, 'public/index.html')]));
    assert(tm.length === 0, 'trademark scan: no UNO / Wordle / Codenames / skribbl / … in shipped code (' + tm.slice(0, 3).join(', ') + ')');
    const titles = DA.CATALOG.map((g) => g.name).join(' | ');
    assert(!/(Manchester|Real Madrid|Barcelona|Mumbai Indians|Chennai Super|Lakers|Yankees|Messi|Ronaldo|Kohli|Tendulkar|Nike|Adidas|Coca|Pepsi)/i.test(titles), 'game titles carry no real teams, players or brands');
    const playerText = JSON.stringify(Rules.GAMES) + JSON.stringify(DA.FAQ) + DA.CATALOG.map((g) => g.name).join(' ') + Object.values(DA.TIPS).map((l) => l.map((t) => t.text({ won: true }) ).join(' ')).join(' ');
    assert(!/\bofficial\b/i.test(playerText), 'no “official” claim in rules, FAQ, titles or tips');
    const src = (id) => Rules.get(id).ruleset;
    assert(/^Rules based on the FIDE Laws of Chess$/.test(src('chess').source) && /based on the ICF/i.test(src('carrom').source) && /based on the BWF/i.test(src('badminton').source) && /Based on the MCC/i.test(src('streetcricket').source) && /based on the IFAB/i.test(src('penalty').source), 'rule attribution: FIDE / ICF / BWF / MCC / IFAB-based wording');
    assert(src('streetcricket').simplified && src('penalty').simplified && Rules.IDS.filter((id) => src(id).simplified).length === 2, '“Simplified” only where true (Street Cricket, Penalty Shootout)');
    assert(/simulation/i.test(JSON.stringify(Rules.get('streetcricket').rules)) && /simulated/i.test(JSON.stringify(Rules.get('badminton').rules)) && /sim km\/h/.test(read('public/src/js/games/court-sports.js')), 'simulated things are labelled (DRS-lite ball-tracking, line calls, “sim km/h”)');
    const logos = scan(/(fide|bwf|icf|ifab|mcc)[-_]?logo|logo[-_]?(fide|bwf|icf|ifab|mcc)/i, jsFiles);
    assert(logos.length === 0, 'no federation logos referenced');
    const online = scan(/(players online|people online|online now|playing now)/i, jsFiles);
    assert(online.length === 0, 'no fake online counts');
    ['chess', 'uno', 'badminton', 'poker', 'ludo', ''].forEach((g) => assert(/Bot$/.test(AI.FALLBACKS.botPersona({ gameId: g, level: 'regular', persona: g === 'chess' ? 'solid' : g === 'uno' ? 'honest' : g === 'badminton' ? 'allround' : '' }).name), 'bot persona for “' + (g || 'any') + '” is labelled Bot'));
    const persona = AI.createDangalAI({ env: { AI_FEATURES_ENABLED: 'true' }, callAI: async () => ({ text: JSON.stringify({ name: 'Priya', style: { aggression: 0.5, bluff: 0.2, speed: 0.5, chattiness: 0.3 } }) }) });
    assert(/ Bot$/.test((await persona.run('botPersona', { gameId: 'ludo' }, { uid: 'b' })).data.name), 'an AI-made persona name is always labelled Bot');
    assert((/' Bot', seat: i/.test(read('public/src/js/games/poker.js')) || (/games\.poker\.value_levellabel_bot', \{[^}]*\}\), seat: i/.test(read('public/src/js/games/poker.js')) && / Bot$/.test(t('games.poker.value_levellabel_bot', { value: 'Ava', levelLabel: 'Regular' })))) && /' · Bot'/.test(read('public/src/js/games/tambola-core.js')), 'practice / table bots carry “Bot” in their names');
    const chipCash = scan(/(buy chips|purchase chips|cash out (table|chips)|withdraw chips|chips? for (real )?money|redeem chips)/i, jsFiles);
    assert(chipCash.length === 0, 'chips: no purchase or cash-out path in any game (' + chipCash.slice(0, 3).join(', ') + ')');
    const moneyServer = fs.readdirSync(path.join(root, 'server-lib')).filter((f) => /money/i.test(f)).map((f) => read('server-lib/' + f)).join('\n');
    assert(!/wallet\/chips|collection\('wallet'\)\.doc\('chips'\)/.test(moneyServer), 'Chaupaal Money never writes the chip wallet (chips can’t be bought)');
    assert(/No cash withdrawal\. Dangal chips are separate game tokens, not real money/.test(require('./lib/i18n-runtime').englishCopy()), 'Chaupaal Money copy: chips are separate tokens, not real money');
    // 18+ gate in every entry point.
    const PD = require(path.join(root, 'server-lib/party-deal.js'));
    assert(PD.GAMES.teenpatti && (PD.GAMES.teenpatti.ageGated || PD.GAMES.teenpatti.ageCheck) && PD.GAMES.rummy && (PD.GAMES.rummy.ageGated || PD.GAMES.rummy.ageCheck), 'server: Teen Patti + Rummy chip tables are age-checked on every op that joins money');
    assert(/age_gate|adultStatus|ageGated/.test(read('server-lib/poker-engine.js') + read('server-lib/party-deal.js')), 'server: Poker tables age-checked');
    const reg = read('public/src/js/games/game-registry.js');
    assert(/isAgeGatedGame\(game\.id\) && typeof ageGateStatus === 'function' && ageGateStatus\(\) !== 'ok'/.test(reg) && /!f\.includeAgeGated && typeof isAgeGatedGame === 'function'/.test(reg), 'registry: launches gate 18+ titles, lists hide them from under-18s');
    ['poker.js', 'teenpatti-ui.js', 'rummy-ui.js'].forEach((f) => assert(/ageGateStatus\(\) === 'ok'/.test(read('public/src/js/games/' + f)) && /openAgeGateSheet\(GAME\)/.test(read('public/src/js/games/' + f)), f + ': its own table entry asks for the 18+ confirmation'));
    assert(/getGames\(\{ dangal: true \}\)/.test(read('public/src/js/core/search.js')) && /handleDangalGameTap\(id\)/.test(read('public/src/js/core/chaupaal-intents-manifest.js')), 'Khoj + intents route through the registry (same 18+ gate)');
    assert(/adult: adultOk\(\)/.test(read('public/src/js/dangal/dangal-assist-ui.js')), 'suggestions only include 18+ tables for confirmed adults');
    // Global-first strings.
    const DEV = /[\u0900-\u097F]/;
    const gameDirs = jsFiles.filter((f) => /[\\/](games|dangal)[\\/]/.test(f));
    const devHits = scan(DEV, gameDirs, /\bhi\s*:|isHi\(\)|hiReader\(\)|kindness|KINDNESS|^\s*(\/\/|\*)/);
    assert(devHits.length === 0, 'global-first: no hard-coded Hindi labels in default game copy (only locale data / Hindi-reader paths): ' + devHits.slice(0, 4).join(', '));
    assert(DA.CATALOG.every((g) => !DEV.test(g.name)) && Rules.IDS.every((id) => !DEV.test(JSON.stringify(Rules.get(id)))), 'titles + rulebooks are plain English');
    const ORIGIN = ['Raja Mantri Chor Sipahi', 'Teen Patti', 'Carrom', 'Tambola', 'Shabd Five', 'Quiz Muqabala'];
    assert(DA.CATALOG.filter((g) => !/^[A-Za-z’'&!\- ]+$/.test(g.name) || ORIGIN.indexOf(g.name) >= 0).every((g) => ORIGIN.indexOf(g.name) >= 0), 'origin names kept only for regional titles (RMCS, Teen Patti, Carrom, Tambola, Shabd Five) + the Quiz Muqabala brand');
    assert(/isIndiaLocale\(\) \? '13' : 'gin'/.test(read('CONVENTIONS.md')) || /isIndiaLocale/.test(read('public/src/js/games/rummy-ui.js')), 'India-specific defaults are locale-driven (Rummy 13-card vs Gin)');
    // Accessibility.
    assert(/dangal_sound_off/.test(read('public/src/js/dangal/dangal-sound.js')) && /dangal_haptics_off/.test(read('public/src/js/core/polish.js')) && /dangal_reduce_motion/.test(read('public/src/js/games/game-ui.js')) && /dangal_reduce_motion/.test(read('public/src/js/games/party-kit.js')), 'sound, vibration and reduce-motion switches are honoured by the shared layers');
    const uiSrc = read('public/src/js/dangal/dangal-assist-ui.js');
    assert(["'sound', 'Sound'", "'haptics', 'Vibration'", "'tips', 'Post-game tips'", "'motion', 'Reduce motion'"].every((s) => uiSrc.indexOf(s) >= 0) && /extrasHtml\(canon\(id\)/.test(read('public/src/js/dangal/dangal-rules.js')), 'every game’s Rules sheet carries Sound / Vibration / Tips / Reduce motion toggles');
    assert(/aria-live="polite"/.test(uiSrc) && /aria-label="\$\{tHtml\('dangal\.dismiss_tip'\)\}"/.test(uiSrc) && /aria-label="\$\{tHtml\('dangal\.fewer_players'\)\}"/.test(uiSrc) && /Dismiss tip/.test(uiSrc) && /Fewer players/.test(uiSrc), 'new controls have screen-reader labels / live regions');
    assert(/\.dangal-reduce-motion \*/.test(read('public/src/styles/dangal.css')), 'reduce-motion switch also stops CSS animation');
    const CB = {
      tiptap: ['games/arcade.js', /colorblind/], brickbreaker: ['games/solo-hub.js', /colorblind/], ankjod: ['games/ank-jod.js', /digit|aria/], wordguess: ['games/shabd-ui.js', /High contrast colours/],
      chess: ['games/chess-ui.js', /aria-label/], ttt: ['games/classics-kit.js', /colour-blind-safe shape markers/], snakes: ['games/classics-kit.js', /Shape marker/], ludo: ['games/ludo-core.js', /Colour-blind-safe palette/],
      uno: ['games/ohno-ui.js', /Colour-blind symbols/], scribble: ['games/scribble-ui.js', /aria-label/], quiz: ['games/quiz-ui.js', /aria-label/], carrom: ['games/carrom-ui.js', /aria-label/],
      poker: ['games/poker.js', /[♠♥♦♣]|suit/], teenpatti: ['games/teenpatti-ui.js', /[♠♥♦♣]|suit/], rummy: ['games/rummy-ui.js', /[♠♥♦♣]|suit/], bluff: ['games/bluff-ui.js', /[♠♥♦♣]|suit|rank/],
      tambola: ['games/tambola-ui.js', /aria-label/], streetcricket: ['games/rw-sports.js', /aria-label/], badminton: ['games/court-sports.js', /aria-label/], penalty: ['games/penalty.js', /aria-label/],
      imposter: ['games/party-kit.js', /shape AND a colour/], rajamantri: ['games/party-kit.js', /identityHtml/], charades: ['games/party-kit.js', /identityHtml/], mostlikely: ['games/party-kit.js', /identityHtml/], werewolf: ['games/party-kit.js', /identityHtml/],
    };
    assert(Object.keys(CB).length === 25, 'a11y matrix covers all 25 games');
    Object.keys(CB).forEach((id) => assert(CB[id][1].test(read('public/src/js/' + CB[id][0])), id + ': colour is never the only cue / labelled controls (' + CB[id][0] + ')'));
    // Licences.
    assert(/chess\.js \(© Jeff Hlywa, BSD 2-Clause\)/.test(uiSrc) && /Apache License 2\.0/.test(uiSrc) && /SIL Open Font License 1\.1/.test(uiSrc) && /no third-party chess engine is bundled/.test(uiSrc) && /not affiliated/.test(uiSrc), 'Licences sheet: chess engine (own), chess.js dev-only, Firebase SDK, fonts, rule attribution');
    assert(/openLicences/.test(read('public/src/js/games/chess-ui.js')) && /data-dangal-licences/.test(uiSrc), 'Licences reachable from every Rules sheet (and Chess keeps its own page)');
    // Platform.
    const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
    assert(apiCount === 12, 'api/*.js = 12 (got ' + apiCount + ')');
    assert(/test-dangal-p16-ai-audit\.js/.test(read('package.json')), 'package.json runs the P16 suite');
  }

  console.log('\nDangal P16 light AI + audit checks passed (' + passed + ').');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
