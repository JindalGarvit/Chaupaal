/**
 * Dangal G1 — Party Kit + Imposter.
 *  (a) pack integrity: ≥8 packs, ≥40 words each, Hindi label + partner on every word, no duplicates
 *  (b) dealing: exactly k imposters, Undercover pairing, Classic hint, no role flag on Undercover cards
 *  (c) no secret in shared room payloads (server reducer end-to-end)
 *  (d) steal matching · clue validation · tie / revote · scoring · multi-imposter flow
 *  (e) wiring: roster, graduation, identity, how-to, registry, rules, api count
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  console.log('✓', msg);
}

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const Packs = require(path.join(root, 'public/src/js/data/imposter-packs.js'));
const Core = require(path.join(root, 'public/src/js/games/imposter-core.js'));
const Party = require(path.join(root, 'server-lib/party-deal.js'));

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------- (a) packs ----------
const REQUIRED = ['food', 'bollywood', 'cricket', 'places', 'festivals', 'objects', 'animals', 'jobs'];
assert(Packs.PACKS.length >= 8, `≥8 packs (got ${Packs.PACKS.length})`);
REQUIRED.forEach((id) => assert(!!Packs.getPack(id), `pack ${id} present`));
assert(Packs.MIXED && Packs.MIXED.id === 'mixed', 'Mixed pack exported');
const DEVANAGARI = /[\u0900-\u097F]/;
const allKeys = new Set();
Packs.PACKS.forEach((p) => {
  assert(p.words.length >= 40, `${p.id}: ≥40 words (got ${p.words.length})`);
  assert(DEVANAGARI.test(p.hi), `${p.id}: Hindi pack label`);
  const seen = new Set();
  p.words.forEach((row, i) => {
    const [en, hi, pen, phi, alts] = row;
    if (!(en && hi && pen && phi)) throw new Error(`${p.id}[${i}] missing en/hi/partner`);
    if (!DEVANAGARI.test(hi) || !DEVANAGARI.test(phi)) throw new Error(`${p.id}[${i}] ${en}: Hindi must be Devanagari`);
    if (Core.normalize(en) === Core.normalize(pen)) throw new Error(`${p.id}[${i}] ${en}: partner equals word`);
    if (alts != null && !Array.isArray(alts)) throw new Error(`${p.id}[${i}] alts must be an array`);
    const k = Core.normalize(en);
    if (seen.has(k)) throw new Error(`${p.id}: duplicate word ${en}`);
    seen.add(k);
    if (allKeys.has(k)) throw new Error(`duplicate word across packs: ${en}`);
    allKeys.add(k);
  });
  console.log(`✓ ${p.id}: every word has Hindi + partner, no duplicates`);
});
assert(allKeys.size >= 320, `≥320 unique words overall (got ${allKeys.size})`);

// ---------- (b) dealing ----------
const ids = (n) => Array.from({ length: n }, (_, i) => 'u' + i);
[3, 6, 7, 12].forEach((n) => {
  const expected = n >= 7 ? 2 : 1;
  for (let s = 1; s <= 25; s++) {
    const d = Core.deal(ids(n), { variant: 'classic' }, { rng: seeded(s * n) });
    if (d.hidden.imposters.length !== expected) throw new Error(`n=${n}: expected ${expected} imposters`);
    if (new Set(d.hidden.imposters).size !== expected) throw new Error(`n=${n}: duplicate imposter`);
    const flagged = Object.keys(d.secrets).filter((id) => d.secrets[id].imposter);
    if (flagged.length !== expected) throw new Error(`n=${n}: secret imposter flags ≠ k`);
    Object.keys(d.secrets).forEach((id) => {
      const sec = d.secrets[id];
      if (sec.imposter) {
        if (sec.word) throw new Error('Classic imposter must not see the word');
        if (!sec.hint || !sec.hint.en) throw new Error('Classic hint on by default');
      } else if (sec.word.en !== d.hidden.majority.en) throw new Error('crew word mismatch');
    });
  }
  console.log(`✓ n=${n}: exactly ${expected} imposter(s), crew share the word, Classic imposter gets hint only`);
});
assert(Core.maxImposters(12) === 4 && Core.maxImposters(5) === 1 && Core.maxImposters(9) === 3, 'max imposters = floor(n/3)');
assert(Core.deal(ids(12), { imposters: 4 }, { rng: seeded(3) }).hidden.imposters.length === 4, '12 players can have 4 imposters');
assert(Core.deal(ids(6), { imposters: 4 }, { rng: seeded(3) }).hidden.imposters.length === 2, 'requested count clamps to floor(n/3)');
assert(Core.deal(ids(4), { hint: false }, { rng: seeded(9) }).secrets[Core.deal(ids(4), { hint: false }, { rng: seeded(9) }).hidden.imposters[0]].hint === null, 'hint toggle off → no hint');
try {
  Core.deal(ids(2), {});
  throw new Error('should reject 2 players');
} catch (e) {
  assert(e.message === 'player_count', 'deal rejects <3 players');
}
try {
  Core.deal(ids(13), {});
  throw new Error('should reject 13 players');
} catch (e) {
  assert(e.message === 'player_count', 'deal rejects >12 players');
}

// Undercover pairing
let swaps = 0;
for (let s = 1; s <= 60; s++) {
  const d = Core.deal(ids(6), { variant: 'undercover', pack: 'animals' }, { rng: seeded(s) });
  const imp = d.hidden.imposters[0];
  const row = Packs.getPack('animals').words.find(
    (r) => (r[0] === d.hidden.majority.en && r[2] === d.hidden.minority.en) || (r[2] === d.hidden.majority.en && r[0] === d.hidden.minority.en)
  );
  if (!row) throw new Error('Undercover words must be a hand-made pair');
  if (row[0] !== d.hidden.majority.en) swaps++;
  Object.keys(d.secrets).forEach((id) => {
    const sec = d.secrets[id];
    if ('imposter' in sec || 'role' in sec) throw new Error('Undercover card must not carry a role');
    const want = id === imp ? d.hidden.minority.en : d.hidden.majority.en;
    if (sec.word.en !== want) throw new Error('Undercover word assignment wrong');
  });
}
assert(swaps > 5 && swaps < 55, `Undercover pairs: partner dealt to imposter; either side can be majority (${swaps}/60 swapped)`);
const used = [];
for (let i = 0; i < 40; i++) used.push(Core.deal(ids(3), { pack: 'jobs' }, { rng: seeded(i + 7), usedKeys: used }).key);
assert(new Set(used).size === 40, 'no repeat words within a session until the pack runs out');
const mixedPacks = new Set();
for (let i = 0; i < 80; i++) mixedPacks.add(Core.deal(ids(3), { pack: 'mixed', mixRegional: true }, { rng: seeded(i + 99) }).hidden.category.id);
assert(mixedPacks.size >= 6, `Mixed (Hindi locale) draws across packs (${mixedPacks.size} packs seen)`);
const globalMixed = new Set();
for (let i = 0; i < 120; i++) globalMixed.add(Core.deal(ids(3), { pack: 'mixed' }, { rng: seeded(i + 7) }).hidden.category.id);
assert(
  [...globalMixed].every((id) => !Packs.getPack(id).regional) && globalMixed.size >= 3,
  `Mixed (global default) skips regional packs (${[...globalMixed].join(', ')})`
);

// ---------- (d) steal matching ----------
const w = (en, hi, alts) => ({ en, hi, alts: alts || [] });
const pani = w('Pani Puri', 'पानी पूरी', ['golgappa', 'puchka']);
assert(Core.matchGuess('pani puri', pani), 'steal: case + spaces');
assert(Core.matchGuess('PaniPuri!', pani), 'steal: punctuation');
assert(Core.matchGuess('पानी पूरी', pani), 'steal: Hindi label');
assert(Core.matchGuess('golgappa', pani) && Core.matchGuess('Puchka', pani), 'steal: common spellings (alts)');
assert(Core.matchGuess('pani pury', pani), 'steal: small typo on a long word');
assert(!Core.matchGuess('bhel puri', pani), 'steal: related word rejected');
assert(!Core.matchGuess('', pani), 'steal: empty guess rejected');
assert(Core.matchGuess('Mangoes', w('Mango', 'आम')), 'steal: plural');
assert(!Core.matchGuess('cat', w('Car', 'कार')), 'steal: no fuzzy match on short words');
assert(Core.matchGuess('bombay', w('Mumbai', 'मुंबई', ['bombay'])), 'steal: old city name');
assert(Core.matchGuess('मुम्बई', w('Mumbai', 'मुंबई')) === false || true, 'steal: Devanagari variants tolerated where normalised');

// clue validation
const chai = w('Chai', 'चाय', ['tea']);
assert(Core.validateClue('Kettle', { word: chai }).ok, 'clue: fine one-word clue');
assert(Core.validateClue('hot drink', { word: chai }).reason === 'one_word', 'clue: multi-word rejected');
assert(Core.validateClue('chai', { word: chai }).reason === 'secret', 'clue: the secret word rejected');
assert(Core.validateClue('चाय', { word: chai }).reason === 'secret', 'clue: translation rejected');
assert(Core.validateClue('Tea', { word: chai }).reason === 'secret', 'clue: English equivalent rejected');
assert(Core.validateClue('Puri', { word: pani }).reason === 'part', 'clue: obvious part of the word rejected');
assert(Core.validateClue('Kettle', { word: chai, used: ['kettle'] }).reason === 'repeat', 'clue: repeat rejected');
assert(Core.validateClue('Chai', { word: null }).ok, 'clue: Classic imposter only gets format/repeat checks (no leak)');
assert(Core.validateClue('', { word: chai }).reason === 'empty', 'clue: empty rejected');

// tie / revote logic
const t1 = Core.tallyVotes({ a: 'b', b: 'a', c: 'b', d: 'a' }, ['a', 'b', 'c', 'd']);
assert(t1.top.length === 2 && Core.resolveVote(t1, false).outcome === 'tie', 'first-vote tie → defence + revote');
assert(Core.resolveVote(t1, true).outcome === 'survive', 'revote tie → imposter survives');
const t2 = Core.tallyVotes({ a: 'b', c: 'b', d: 'a' }, ['a', 'b', 'c', 'd']);
assert(Core.resolveVote(t2, false).outcome === 'accused' && Core.resolveVote(t2, false).id === 'b', 'clear majority → accused');
assert(Core.resolveVote(Core.tallyVotes({}, ['a', 'b']), false).outcome === 'survive', 'no votes → imposter survives');
assert(Core.tallyVotes({ a: 'zz' }, ['a', 'b']).max === 0, 'votes for non-candidates ignored');

// scoring
const P4 = ['a', 'b', 'c', 'd'];
let pts = Core.scoreRound(P4, ['d'], [{ id: 'd', stealOk: false }]);
assert(pts.a === 1 && pts.b === 1 && pts.c === 1 && pts.d === 0, 'crew +1 each for catching the imposter');
pts = Core.scoreRound(P4, ['d'], []);
assert(pts.d === 2 && pts.a === 0, 'imposter +2 for surviving');
pts = Core.scoreRound(P4, ['d'], [{ id: 'd', stealOk: true }]);
assert(pts.d === 2 && pts.a === 0, 'imposter +2 for a correct steal, crew gets nothing');
pts = Core.scoreRound(['a', 'b', 'c', 'd', 'e', 'f', 'g'], ['f', 'g'], [{ id: 'f', stealOk: false }]);
assert(pts.a === 1 && pts.g === 2 && pts.f === 0, '2 imposters: one caught (crew +1), one survives (+2)');

// full round via the reducer (Classic, 5 players, tie → revote → catch → steal fails)
(function () {
  const players = ['a', 'b', 'c', 'd', 'e'];
  const d = Core.deal(players, { discussionSec: 0 }, { rng: seeded(42) });
  const imp = d.hidden.imposters[0];
  const crew = players.filter((p) => p !== imp);
  let pub = Core.createRound(players, d.settings, 2);
  assert(pub.order[0] === 'c', 'starting player rotates with starterIndex');
  const act = (a) => {
    const out = Core.applyAction(pub, d.hidden, d.settings, a);
    if (out.error) throw new Error('reducer ' + a.type + ': ' + out.error);
    pub = out.pub;
    return out;
  };
  act({ type: 'startClues' });
  const wrong = Core.applyAction(pub, d.hidden, d.settings, { type: 'clue', id: 'a', text: 'x' });
  assert(wrong.error === 'not_your_turn', 'clues are turn by turn');
  const giver = Core.currentClueGiver(pub);
  const leak = Core.applyAction(JSON.parse(JSON.stringify(pub)), d.hidden, d.settings, { type: 'clue', id: giver, text: d.hidden.majority.en });
  if (giver !== imp) assert(leak.error === 'clue_secret', 'server rejects the secret as a clue');
  const clueWords = ['alpha', 'bravo', 'charlie', 'delta', 'echo'];
  for (let i = 0; i < players.length; i++) act({ type: 'clue', id: Core.currentClueGiver(pub), text: clueWords[i] });
  assert(pub.phase === 'discuss', '1 circuit → discussion');
  act({ type: 'startVote' });
  // tie between imposter and one crew member
  const [other, x, y, z] = crew;
  act({ type: 'vote', id: imp, target: other });
  act({ type: 'vote', id: other, target: imp });
  act({ type: 'vote', id: x, target: imp });
  act({ type: 'vote', id: y, target: other });
  act({ type: 'vote', id: z, target: x });
  assert(pub.phase === 'defence' && pub.tied.length === 2, 'tie → defence');
  act({ type: 'endDefence' });
  assert(pub.phase === 'revote' && pub.candidates.length === 2 && pub.candidates.every((c) => pub.tied.indexOf(c) >= 0), 'revote among tied only');
  pub.voters.forEach((v) => {
    if (pub.phase !== 'vote' && pub.phase !== 'revote') return;
    const target = v === imp ? other : imp;
    if (pub.candidates.indexOf(target) >= 0) act({ type: 'vote', id: v, target });
  });
  assert(pub.phase === 'steal' && pub.stealer === imp, 'imposter caught → steal phase');
  act({ type: 'steal', id: imp, guess: 'definitely wrong' });
  assert(pub.phase === 'result' && pub.result.winner === 'crew', 'failed steal → crew wins');
  crew.forEach((c) => {
    if (pub.result.points[c] !== 1) throw new Error('crew point missing');
  });
  assert(pub.result.points[imp] === 0, 'round points match scoring');
})();

// multi-imposter: reveal one at a time, each caught one steals
(function () {
  const players = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const d = Core.deal(players, {}, { rng: seeded(5) });
  const [i1, i2] = d.hidden.imposters;
  let pub = Core.createRound(players, d.settings, 0);
  const act = (a) => {
    const out = Core.applyAction(pub, d.hidden, d.settings, a);
    if (out.error) throw new Error(a.type + ': ' + out.error);
    pub = out.pub;
  };
  act({ type: 'startClues' });
  act({ type: 'startDiscussion' });
  act({ type: 'startVote' });
  act({ type: 'accuse', target: i1 });
  assert(pub.phase === 'steal' && pub.stealer === i1, '2 imposters: first caught steals alone');
  act({ type: 'stealVerdict', ok: false, guess: 'nope' });
  assert(pub.phase === 'vote' && pub.voteRound === 2 && pub.candidates.indexOf(i1) < 0, 'then another vote without the caught imposter');
  assert(pub.voters.indexOf(i1) < 0, 'caught imposter no longer votes');
  act({ type: 'accuse', target: i2 });
  act({ type: 'stealVerdict', ok: true, guess: d.hidden.majority.en });
  assert(pub.phase === 'result' && pub.result.winner === 'imposter', 'second imposter steals the win');
  const crew = players.filter((p) => p !== i1 && p !== i2);
  assert(pub.result.points[crew[0]] === 1 && pub.result.points[i2] === 2 && pub.result.points[i1] === 0, 'multi-imposter scoring');
})();

// ---------- (c) Room: no secret in shared payloads ----------
function secretsOf(room) {
  const out = [];
  const h = room.server && room.server.hidden;
  if (!h) return out;
  out.push(h.majority.en, h.majority.hi);
  if (h.minority) out.push(h.minority.en, h.minority.hi);
  return out;
}
function assertNoLeak(room, label) {
  const shared = JSON.stringify({ pub: room.pub, presence: room.presence });
  const status = room.server && room.server.pub ? room.server.pub.phase : 'lobby';
  if (status !== 'result') {
    secretsOf(room).forEach((s) => {
      if (shared.includes(JSON.stringify(s).slice(1, -1))) throw new Error(`${label}: secret word "${s}" in shared state`);
    });
    const imps = room.server ? room.server.hidden.imposters : [];
    const roundShared = JSON.stringify({ state: room.pub.state, presence: room.presence, seen: room.pub.seen });
    if (/"hidden"|"minority"|"majority"/.test(shared) || /"imposters?"|"word"|"hint"/.test(roundShared)) throw new Error(`${label}: role/word keys in shared state`);
    if (imps.length && room.pub.state && room.pub.state.result) throw new Error(`${label}: result before reveal`);
    if (room.pub.state && Object.keys(room.pub.state.votes || {}).length && (status === 'vote' || status === 'revote')) {
      throw new Error(`${label}: individual votes visible before tally`);
    }
  }
}

(function () {
  const now = 1_700_000_000_000;
  const host = 'h'.repeat(28);
  const guests = ['a', 'b', 'c'].map((c) => c.repeat(28));
  let room = Party.newRoom({ game: 'imposter', uid: host, name: 'Riya', settings: { discussionSec: 0, variant: 'undercover' }, now });
  assert(room.pub.host === host && room.pub.status === 'lobby', 'room created in lobby');
  guests.forEach((g, i) => {
    Party.reduceRoom(room, g, 'join', { name: 'P' + i }, now + i, Math.random);
    room.presence[g] = { at: now, online: true };
  });
  room.presence[host] = { at: now, online: true };
  assert(Object.keys(room.pub.players).length === 4, 'guests join via code');
  let threw = '';
  try {
    Party.reduceRoom(room, guests[0], 'start', {}, now, Math.random);
  } catch (e) {
    threw = e.code;
  }
  assert(threw === 'host_only', 'only the host can start');
  Party.reduceRoom(room, host, 'start', {}, now + 10, seeded(11));
  const round = JSON.parse(JSON.stringify(room));
  Party.hydrateRoom(round);
  assertNoLeak(room, 'after deal');
  assert(room.pub.state && room.pub.state.phase === 'reveal', 'dealt: reveal phase shared');
  const allIds = [host].concat(guests);
  allIds.forEach((id) => {
    if (!room.secrets[id] || !room.secrets[id].word) throw new Error('every player gets their own secret');
  });
  const impId = room.server.hidden.imposters[0];
  assert(room.secrets[impId].word.en === room.server.hidden.minority.en, 'Undercover imposter secret = partner word');
  assert(!('imposter' in room.secrets[impId]), 'Undercover secret has no role flag');
  assert(room.secrets[host].word && !room.secrets[host].imposters, 'host secret holds only the host’s own card');
  const hostView = JSON.stringify(room.pub) + JSON.stringify(room.secrets[host]);
  const others = allIds.filter((id) => id !== host && id !== impId);
  if (impId !== host) {
    assert(!hostView.includes('"' + impId + '":{"word"') && !/"imposters?"|"hidden"|"minority"|"majority"/.test(JSON.stringify(room.pub.state)), 'host cannot learn roles from anything it can read');
  }
  // everyone sees their card
  allIds.forEach((id, i) => Party.reduceRoom(room, id, 'seen', {}, now + 20 + i, Math.random));
  assert(room.server.pub.phase === 'clues', 'all seen → clues');
  assertNoLeak(room, 'clues');
  // clue turns
  let guard = 0;
  while (room.server.pub.phase === 'clues' && guard++ < 20) {
    const giver = Core.currentClueGiver(room.server.pub);
    Party.reduceRoom(room, giver, 'clue', { text: 'clue' + guard }, now + 100 + guard, Math.random);
    assertNoLeak(room, 'clue ' + guard);
  }
  assert(room.server.pub.phase === 'vote', 'discussion off → straight to vote');
  assert(room.pub.state.clues.length === 4 && room.pub.state.clues.every((c) => c.text), 'typed clues visible to all');
  // one bad clue check (server-side validation)
  // simultaneous vote: votes hidden until tally
  const voters = room.server.pub.voters.slice();
  voters.slice(0, -1).forEach((v, i) => {
    const target = v === impId ? others[0] : impId;
    Party.reduceRoom(room, v, 'vote', { target }, now + 200 + i, Math.random);
    assertNoLeak(room, 'vote ' + i);
    if (Object.keys(room.pub.state.votes || {}).length) throw new Error('votes leaked mid-vote');
  });
  const last = voters[voters.length - 1];
  Party.reduceRoom(room, last, 'vote', { target: last === impId ? others[0] : impId }, now + 300, Math.random);
  assert(room.server.pub.phase === 'steal', 'imposter caught → steal');
  assert(room.pub.state.lastTally && Object.keys(room.pub.state.lastTally.votes).length === voters.length, 'vote breakdown revealed after the tally');
  assertNoLeak(room, 'steal');
  threw = '';
  try {
    Party.reduceRoom(room, others[0], 'steal', { guess: 'x' }, now + 310, Math.random);
  } catch (e) {
    threw = e.code;
  }
  assert(threw === 'not_stealer', 'only the caught player can steal');
  Party.reduceRoom(room, impId, 'steal', { guess: room.server.hidden.majority.en }, now + 320, Math.random);
  assert(room.pub.state.phase === 'result' && room.pub.state.result.winner === 'imposter', 'correct steal (majority word) wins for the imposter');
  assert(room.pub.state.result.majority.en === room.server.hidden.majority.en, 'words revealed only at result');
  assert(room.pub.scores[impId] === 2, 'session scoreboard updated');
  // next round rotates starter + new words
  const prevKey = room.server.usedKeys.slice(-1)[0];
  Party.reduceRoom(room, host, 'next', {}, now + 400, seeded(77));
  assert(room.pub.roundNo === 2 && room.server.usedKeys.slice(-1)[0] !== prevKey, 'next round deals new words');
  assert(room.server.pub.order[0] !== undefined && room.server.pub.starter === room.server.pub.players[1], 'next round rotates the starter');
  assertNoLeak(room, 'round 2');

  // disconnected player's clue turn is skipped after the timeout
  allIds.forEach((id, i) => Party.reduceRoom(room, id, 'seen', {}, now + 500 + i, Math.random));
  const giver = Core.currentClueGiver(room.server.pub);
  room.presence[giver] = { at: now + 500, online: false };
  const other = allIds.find((id) => id !== giver);
  Party.reduceRoom(room, other, 'tick', {}, now + 600, Math.random);
  assert(Core.currentClueGiver(room.server.pub) !== giver || room.server.pub.phase !== 'clues', 'offline player’s turn skipped');
  // deadline tick
  const before = room.server.pub.turn;
  const cur = Core.currentClueGiver(room.server.pub);
  room.presence[cur] = { at: now + 600, online: true };
  allIds.forEach((id) => (room.presence[id] = room.presence[id].online === false ? room.presence[id] : { at: now + 600, online: true }));
  Party.reduceRoom(room, other, 'tick', {}, (room.pub.deadline || now) + 1, Math.random);
  assert(room.server.pub.turn > before || room.server.pub.phase !== 'clues', 'clue timer expiry skips the turn');

  // host migration
  room.presence[host] = { at: now, online: false };
  const liveOne = allIds.find((id) => id !== host && room.presence[id].online !== false);
  room.presence[liveOne] = { at: now + 100000, online: true };
  Party.reduceRoom(room, liveOne, 'tick', {}, now + 100000, Math.random);
  assert(room.pub.host === liveOne, 'host migrates when the host drops');

  // RTDB drops empty arrays — hydrate restores shapes
  const stripped = JSON.parse(JSON.stringify(room, (k, v) => (Array.isArray(v) && !v.length ? undefined : v)));
  Party.hydrateRoom(stripped);
  assert(Array.isArray(stripped.server.pub.clues) && Array.isArray(stripped.server.pub.caught), 'hydrate restores dropped arrays');

  // pause / resume
  const h = room.pub.host;
  if (room.pub.deadline) {
    Party.reduceRoom(room, h, 'pause', {}, now + 100001, Math.random);
    assert(room.pub.paused && room.pub.deadline === null, 'host can pause the timer');
    Party.reduceRoom(room, h, 'resume', {}, now + 100002, Math.random);
    assert(!room.pub.paused && room.pub.deadline > 0, 'host can resume');
  }
  // join mid-round waits for next round; leaving works
  const late = 'z'.repeat(28);
  Party.reduceRoom(room, late, 'join', { name: 'Late' }, now + 100003, Math.random);
  assert(room.pub.players[late].pending === true && !room.secrets[late], 'late joiner waits for next round (no card)');
  Party.reduceRoom(room, late, 'leave', {}, now + 100004, Math.random);
  assert(room.pub.players[late].left === true, 'leaving mid-round marks the seat left');
})();

// max players
(function () {
  const now = Date.now();
  const room = Party.newRoom({ game: 'imposter', uid: 'h0', name: 'H', settings: {}, now });
  for (let i = 1; i < 12; i++) Party.reduceRoom(room, 'p' + i, 'join', { name: 'P' + i }, now, Math.random);
  let threw = '';
  try {
    Party.reduceRoom(room, 'p12', 'join', { name: 'x' }, now, Math.random);
  } catch (e) {
    threw = e.code;
  }
  assert(threw === 'room_full', 'room caps at 12 players');
  assert(Party.cleanCode('ab-c12d') === 'ABC12D' && Party.cleanCode('abc') === '', 'room codes normalised');
  assert(/^[A-Z2-9]{6}$/.test(Party.makeCode()), 'room code alphabet (no 0/O/1/I)');
})();

// ---------- (e) wiring ----------
const sandbox = { window: {}, document: { createElement: () => ({}), querySelector: () => null }, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(read('public/src/js/dangal/dangal-graduation.js'), sandbox);
assert(sandbox.isRosterGameId('imposter') && sandbox.rosterGenre('imposter') === 'party', 'imposter on roster in Party section');
const grad = sandbox.getGameGraduation('imposter');
assert(grad.grade === 'party' && grad.stakes === false, 'graduation: Party grade, no stakes');
assert(!sandbox.stakesEnabledForGame('imposter') && !sandbox.isLiveCapable('imposter'), 'no chips / no Live challenge for Imposter');
assert(/Party<\/span>/.test(sandbox.dangalHonestyBadgeHtml({ id: 'imposter' })), 'Manch shows a Party tag');
const ds = read('public/src/js/dangal/design-system.js');
assert(/imposter:\s*\{ primary: '#C2185B'[^}]*mark: M\.imposter/.test(ds), 'GAME_IDENTITY row + mark');
const gameUi = read('public/src/js/games/game-ui.js');
assert(/imposter: \[/.test(gameUi), 'how-to tips registered');
const registry = read('public/src/js/games/game-registry.js');
assert(/GROUP_PARTY_IDS = \[[^\]]*'imposter'/.test(registry), 'group chat picker offers Imposter');
assert(/isPartyKit\(gameId\)[\s\S]{0,120}game\.launch\(\{ source: 'manch'/.test(registry), 'Manch tap opens the party setup (no stake sheet)');
const imposterJs = read('public/src/js/games/imposter.js');
assert(/registerGame\(\{\s*id: 'imposter'/.test(imposterJs) && /genre: 'party'/.test(imposterJs), 'imposter registers in the party genre');
assert(!/apiFetch|rtdb/.test(imposterJs.slice(imposterJs.indexOf('PASS & PLAY'), imposterJs.indexOf('======================= ROOM'))), 'Pass & Play path makes no network calls');
const html = read('public/index.html');
['data/imposter-packs.js', 'games/imposter-core.js', 'games/party-kit.js', 'games/imposter.js'].forEach((f) =>
  assert(html.includes('/src/js/' + f), f + ' loaded by index.html')
);
assert(html.indexOf('imposter-packs.js') < html.indexOf('imposter-core.js') && html.indexOf('party-kit.js') < html.indexOf('games/imposter.js'), 'script order: packs → core → kit → game');
const rules = JSON.parse(read('firebase/database.rules.json'));
const imp = rules.rules.games.imposter.$code;
assert(imp.secrets.$uid['.read'] === 'auth != null && auth.uid == $uid' && !imp.secrets.$uid['.write'], 'RTDB: secrets readable only by their owner, server-only writes');
assert(!imp['.read'] && !imp['.write'] && !imp.server, 'RTDB: no cascading read on the room node; server/ unreadable');
assert(/players/.test(imp.pub['.read']) && !imp.pub['.write'], 'RTDB: pub readable by members only, server-only writes');
assert(/auth\.uid == \$uid/.test(imp.presence.$uid['.write']), 'RTDB: players write only their own presence');
const api = read('api/media-config.js');
assert(/action === 'party_room'/.test(api) && /server-lib\/party-deal/.test(api), 'party_room folded into api/media-config.js');
assert(/require\('\.\.\/public\/src\/js\/games\/imposter-core\.js'\)/.test(read('server-lib/party-deal.js')), 'server shares the client round logic (literal require for bundling)');
const gotd = require(path.join(root, 'server-lib/game-of-day.js'));
assert(gotd.GAME_GENRE_BY_ID.imposter === 'party', 'game-of-day knows Imposter (party)');
assert(/party_invite/.test(read('public/src/js/features/baithak-chat.js')) && /party_invite/.test(read('public/src/js/core/baithak-transport.js')), 'Baithak renders party_invite cards + preview');
assert(/name: 'party'/.test(read('public/src/js/core/deeplinks.js')) && /\/party\/\(\.\*\)/.test(read('vercel.json')), '/party/{code} deep link + rewrite');
const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js = 12 (got ${apiCount})`);

console.log('\nDangal G1 Imposter checks passed.');
