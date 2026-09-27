/**
 * Dangal G2 — Raja Mantri Chor Sipahi + Dumb Charades on the Party Kit.
 *  (a) RMCS dealing: unique roles + correct counts for 4–8 players
 *  (b) RMCS scoring: swap rule, guesser setting, multi-thief extended mode, full round reducer
 *  (c) Charades pack integrity: minimum counts, labels, difficulty tags, no duplicates
 *  (d) Charades: timer/turn rotation, pass limits, team scoring, typed-guess matching
 *  (e) Room: no secret in shared payloads for either game (server reducer end-to-end)
 *  (f) wiring: roster, graduation, identity, how-to, registry, rules, scripts, api count
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

const PC = require(path.join(root, 'public/src/js/games/party-core.js'));
const RM = require(path.join(root, 'public/src/js/games/rajamantri-core.js'));
const Packs = require(path.join(root, 'public/src/js/data/charades-packs.js'));
const CH = require(path.join(root, 'public/src/js/games/charades-core.js'));
const Party = require(path.join(root, 'server-lib/party-deal.js'));

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const ids = (n) => Array.from({ length: n }, (_, i) => 'u' + i);
const clone = (o) => JSON.parse(JSON.stringify(o));
const DEVANAGARI = /[\u0900-\u097F]/;

// ---------- (a) RMCS dealing ----------
const EXPECTED_ROLES = {
  4: ['raja', 'mantri', 'sipahi', 'chor'],
  5: ['raja', 'mantri', 'sipahi', 'chor', 'rani'],
  6: ['raja', 'mantri', 'sipahi', 'chor', 'rani', 'daku'],
  7: ['raja', 'mantri', 'sipahi', 'chor', 'rani', 'daku', 'senapati'],
  8: ['raja', 'mantri', 'sipahi', 'chor', 'rani', 'daku', 'senapati', 'daroga'],
};
Object.keys(EXPECTED_ROLES).forEach((k) => {
  const n = Number(k);
  const want = EXPECTED_ROLES[n].slice().sort();
  for (let s = 1; s <= 30; s++) {
    const d = RM.deal(ids(n), {}, { rng: seeded(s * 31 + n) });
    const got = Object.values(d.hidden.roles).sort();
    if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`n=${n}: wrong role set ${got}`);
    if (new Set(got).size !== n) throw new Error(`n=${n}: duplicate role`);
    Object.keys(d.secrets).forEach((id) => {
      const keys = Object.keys(d.secrets[id]);
      if (keys.length !== 1 || d.secrets[id].role !== d.hidden.roles[id]) throw new Error('secret must be only the owner’s role');
    });
  }
  const thieves = RM.thievesFor(n);
  assert(thieves.length === (n >= 6 ? 2 : 1), `n=${n}: unique roles, ${n} chits, ${thieves.length} thief(s)`);
});
assert(!RM.isExtended(4) && RM.isExtended(5) && RM.isExtended(8), 'classic at 4, extended at 5–8');
['need_players', 'too_many_players'].forEach((code, i) => {
  try {
    RM.deal(ids(i ? 9 : 3), {});
    throw new Error('should reject');
  } catch (e) {
    assert(e.message === code, `deal rejects ${i ? '9' : '3'} players (${code})`);
  }
});
assert(RM.ROLES.raja.points === 1000 && RM.ROLES.mantri.points === 800 && RM.ROLES.sipahi.points === 500 && RM.ROLES.chor.points === 0, 'classic chit values 1000 / 800 / 500 / 0');
Object.values(RM.ROLES).forEach((r) => {
  if (!r.en || !DEVANAGARI.test(r.hi)) throw new Error(r.id + ' needs English + Devanagari names');
});
assert(true, 'every role is bilingual (Hindi Devanagari + English)');
assert(RM.mergeSettings({}).rounds === 10 && RM.mergeSettings({}).guesser === 'mantri', 'defaults: 10 rounds, Mantri catches');
assert(RM.mergeSettings({ rounds: 7, guesser: 'raja' }).rounds === 10 && RM.mergeSettings({ guesser: 'raja' }).guesser === 'mantri', 'settings clamp to 5/10/15 and Mantri/Sipahi');

// ---------- (b) RMCS scoring + round flow ----------
function playRound(roles, settings, picker) {
  const players = Object.keys(roles);
  const hidden = { roles };
  const s = RM.mergeSettings(settings);
  let pub = RM.createRound(players, s);
  const act = (a) => {
    const out = RM.applyAction(pub, hidden, s, a);
    if (out.error) throw new Error(a.type + ': ' + out.error);
    pub = out.pub;
    return out;
  };
  act({ type: 'startRaja' });
  act({ type: 'revealRaja' });
  act({ type: 'revealGuesser' });
  let guard = 0;
  while (pub.phase === 'guess' && guard++ < 8) act({ type: 'pick', target: picker(pub, hidden) });
  return pub;
}
const truth = (pub, hidden) => RM.holderOf(hidden, RM.currentThiefRole(pub));
const wrong = (pub, hidden) => RM.candidates(pub).find((id) => id !== truth(pub, hidden));

const classic = { a: 'raja', b: 'mantri', c: 'sipahi', d: 'chor' };
let pub = playRound(classic, {}, truth);
assert(pub.phase === 'result' && pub.result.allCaught, 'classic: Mantri catches the Chor → round over');
assert(pub.result.points.a === 1000 && pub.result.points.b === 800 && pub.result.points.c === 500 && pub.result.points.d === 0, 'correct pick: everyone keeps their points');
pub = playRound(classic, {}, wrong);
assert(pub.result.points.b === 0 && pub.result.points.d === 800 && pub.result.points.a === 1000 && pub.result.points.c === 500, 'wrong pick: Mantri and Chor swap (0 / 800)');
assert(pub.picks[0].thief === 'd' && pub.revealed.d === 'chor', 'wrong pick reveals the real Chor');
pub = playRound(classic, { guesser: 'sipahi' }, wrong);
assert(pub.guesser === 'c' && pub.result.points.c === 0 && pub.result.points.d === 500 && pub.result.points.b === 800, 'Sipahi guesser: same swap rule with Sipahi’s 500');
pub = playRound(classic, { guesser: 'sipahi' }, truth);
assert(pub.result.points.c === 500 && pub.result.points.d === 0, 'Sipahi guesser catches: points kept');

// guard rails
(function () {
  const hidden = { roles: classic };
  const s = RM.mergeSettings({});
  let p = RM.createRound(Object.keys(classic), s);
  assert(RM.applyAction(clone(p), hidden, s, { type: 'revealRaja' }).error === 'phase', 'Raja reveals only after the chits are seen');
  p = RM.applyAction(p, hidden, s, { type: 'startRaja' }).pub;
  assert(RM.applyAction(clone(p), hidden, s, { type: 'revealRaja', id: 'b' }).error === 'not_raja', 'only the Raja can stand up as Raja');
  p = RM.applyAction(p, hidden, s, { type: 'revealRaja', id: 'a' }).pub;
  assert(RM.applyAction(clone(p), hidden, s, { type: 'revealGuesser', id: 'c' }).error === 'not_guesser', 'only the Mantri answers the call');
  p = RM.applyAction(p, hidden, s, { type: 'revealGuesser', id: 'b' }).pub;
  assert(JSON.stringify(RM.candidates(p).sort()) === '["c","d"]', 'Mantri picks from the two unrevealed players');
  assert(RM.applyAction(clone(p), hidden, s, { type: 'pick', id: 'c', target: 'd' }).error === 'not_guesser', 'only the guesser may pick');
  assert(RM.applyAction(clone(p), hidden, s, { type: 'pick', id: 'b', target: 'a' }).error === 'bad_target', 'cannot pick the revealed Raja');
})();

// extended multi-thief: 6 players → Chor + Daku; guesser stake split per thief
const six = { a: 'raja', b: 'mantri', c: 'sipahi', d: 'chor', e: 'rani', f: 'daku' };
pub = playRound(six, {}, truth);
assert(pub.picks.length === 2 && pub.result.allCaught && pub.result.points.b === 800 && pub.result.points.d === 0 && pub.result.points.f === 0, 'extended: guesser must find ALL thieves (one pick each); all caught → points kept');
pub = playRound(six, {}, wrong);
assert(pub.result.points.b === 0 && pub.result.points.d + pub.result.points.f === 800, 'extended: both picks wrong → guesser’s 800 goes to the thieves');
let n = 0;
pub = playRound(six, {}, (p, h) => (n++ === 0 ? truth(p, h) : wrong(p, h)));
const second = pub.picks[1];
assert(pub.picks[0].correct && !second.correct && pub.result.points.b === 400 && pub.result.points[second.thief] === 400, 'extended: one right + one wrong → that thief takes its 400 share');
const eight = { a: 'raja', b: 'mantri', c: 'sipahi', d: 'chor', e: 'rani', f: 'daku', g: 'senapati', h: 'daroga' };
pub = playRound(eight, {}, truth);
assert(pub.phase === 'result' && pub.result.points.h === 600 && pub.result.points.g === 700 && pub.result.points.e === 900, '8 players: Rani 900 · Senapati 700 · Daroga 600');
const sum = (pts) => Object.values(pts).reduce((x, y) => x + y, 0);
[classic, six, eight].forEach((roles) => {
  const base = sum(playRound(roles, {}, truth).result.points);
  if (sum(playRound(roles, {}, wrong).result.points) !== base) throw new Error('swap must conserve total points');
});
assert(true, 'swaps conserve the round total (points only move between guesser and thief)');
assert(RM.publicView(RM.createRound(ids(4), {})) && !/"roles"/.test(JSON.stringify(RM.publicView(RM.createRound(ids(4), {})))), 'public view carries no role map before result');

// ---------- (c) Charades packs ----------
const MIN = { bollywood: 120, songs: 60, hollywood: 60, tv: 40, sports: 40, idioms: 40, actions: 40 };
assert(Packs.PACKS.length === 7, '7 categories');
const allKeys = new Set();
Object.keys(MIN).forEach((id) => {
  const p = Packs.getPack(id);
  assert(!!p && p.titles.length >= MIN[id], `${id}: ≥${MIN[id]} titles (got ${p ? p.titles.length : 0})`);
  if (!p.en || !DEVANAGARI.test(p.hi) || !p.icon || !p.kind) throw new Error(id + ': pack needs en + Hindi label + icon + kind');
  const seen = new Set();
  p.titles.forEach((t) => {
    if (!t.en || !t.hi) throw new Error(`${id}: ${t.key} needs English + Hindi labels`);
    if (Packs.DIFFICULTIES.indexOf(t.difficulty) < 0) throw new Error(`${id}: ${t.en} bad difficulty ${t.difficulty}`);
    const k = PC.normalize(t.en);
    if (seen.has(k)) throw new Error(`${id}: duplicate title ${t.en}`);
    seen.add(k);
    if (allKeys.has(t.key)) throw new Error('duplicate key ' + t.key);
    allKeys.add(t.key);
    if (Packs.byKey(t.key).en !== t.en) throw new Error('byKey mismatch ' + t.key);
  });
  const diffs = new Set(p.titles.map((t) => t.difficulty));
  if (id === 'bollywood' && diffs.size < 3) throw new Error('Bollywood Movies must be difficulty-tagged (easy/medium/hard)');
  console.log(`✓ ${id}: labels + difficulty tags, no duplicates`);
});
assert(['bollywood', 'songs', 'idioms'].every((id) => Packs.getPack(id).regional) && !Packs.getPack('hollywood').regional && !Packs.getPack('actions').regional, 'regional packs flagged (global-first)');
assert(Packs.defaultCategories('en').indexOf('bollywood') < 0 && Packs.defaultCategories('en').indexOf('actions') >= 0, 'English default: global packs only');
assert(Packs.defaultCategories('hi').indexOf('bollywood') >= 0 && Packs.defaultCategories('hi').length === 7, 'Hindi default: every pack incl. Bollywood');
const regionalIn = (keys) => keys.filter((k) => Packs.byKey(k).regional).length;
assert(regionalIn(CH.pool({}, 'en')) === 0 && CH.pool({}, 'en').length >= 150, 'English default deck: no India-specific titles (global TV/sports/actions only)');
assert(regionalIn(CH.pool({ categories: ['tv', 'sports'] }, 'hi')) > 0, 'Hindi locale: India picks inside TV/sports join the deck');
assert(regionalIn(CH.pool({ categories: ['tv', 'bollywood'] }, 'en')) > 0, 'picking a regional pack opts into India picks elsewhere too');
['tv', 'sports'].forEach((id) => {
  const g = Packs.getPack(id).titles.filter((t) => !t.regional).length;
  assert(g >= 25, `${id}: ≥25 global titles for non-Hindi players (got ${g})`);
});
const BAD = /\b(sex|nude|porn|fuck|shit|bitch|rape|drugs?|cocaine|kill yourself)\b/i;
Packs.PACKS.forEach((p) =>
  p.titles.forEach((t) => {
    if (BAD.test(t.en)) throw new Error('teen-safe check failed: ' + t.en);
  })
);
assert(true, 'titles pass the teen-safe word screen');
assert(CH.GESTURES.length >= 6 && CH.GESTURES.every((g) => g.icon && g.en && g.how), 'gesture cheat sheet present');

// ---------- (d) Charades rules ----------
const T = [['a1', 'a2', 'a3'], ['b1', 'b2']];
function game(settings, seed) {
  const g = CH.createGame(T, settings, { rng: seeded(seed || 1), lang: 'en' });
  const st = { pub: g.pub, hidden: g.hidden, s: g.settings };
  st.act = (a) => {
    const out = CH.applyAction(st.pub, st.hidden, st.s, a);
    if (out.error) throw new Error(a.type + ': ' + out.error);
    st.pub = out.pub;
    return out;
  };
  st.try = (a) => CH.applyAction(clone(st.pub), clone(st.hidden), st.s, a);
  return st;
}
assert(CH.mergeSettings({}).turnSec === 90 && CH.mergeSettings({}).passes === 1, 'defaults: 90s timer, 1 pass per turn');
assert(CH.mergeSettings({ turnSec: 45, passes: 9 }).turnSec === 90 && CH.mergeSettings({ passes: 3 }).passes === 3 && CH.mergeSettings({ passes: 0 }).passes === 0, 'timer 60/90/120 · passes 0–3');
let g = game({ goal: 'turns', turnsPerTeam: 2 });
assert(g.pub.phase === 'ready' && g.pub.team === 0 && g.pub.actor === 'a1' && g.hidden.current, 'game opens with Team A’s first actor and a hidden title');
assert(!/"current"|"deck"/.test(JSON.stringify(CH.publicView(g.pub))), 'public view never carries the deck or current title');
g.act({ type: 'start' });
const firstTitle = g.hidden.current;
g.act({ type: 'pass' });
assert(g.hidden.current !== firstTitle && g.pub.passesLeft === 0 && g.pub.turnPassed.length === 1, 'Pass draws a new title and uses the pass');
assert(g.try({ type: 'pass' }).error === 'no_passes', 'pass limit enforced (1 by default)');
assert(g.try({ type: 'got', id: 'a2' }).error === 'not_actor', 'only the actor taps Got it');
g.act({ type: 'got' });
assert(g.pub.phase === 'turnEnd' && g.pub.teamScores[0] === 1 && g.pub.lastTurn.reason === 'got', 'Got it = +1 for the acting team, turn ends');
g.act({ type: 'next' });
assert(g.pub.team === 1 && g.pub.actor === 'b1' && g.pub.passesLeft === 1 && g.pub.turnNo === 2, 'teams alternate; passes reset');
g.act({ type: 'start' });
g.act({ type: 'timeUp' });
assert(g.pub.lastTurn.reason === 'time' && g.pub.lastTurn.missed && g.pub.teamScores[1] === 0, 'time up: no point, missed title revealed after the turn');
g.act({ type: 'next' });
assert(g.pub.team === 0 && g.pub.actor === 'a2', 'actor rotates within the team');
g.act({ type: 'start' });
g.act({ type: 'got' });
g.act({ type: 'next' });
assert(g.pub.actor === 'b2', 'Team B rotates too');
g.act({ type: 'start' });
g.act({ type: 'got' });
assert(g.pub.phase === 'over' && g.pub.winner === 0 && g.pub.teamScores.join('-') === '2-1', 'fixed turns per team → game over, winner by score');
assert(g.pub.mvp === 'a1' || g.pub.mvp === 'a2', 'MVP actor picked from acting points');

// first-to-N: only ends on equal turns
g = game({ goal: 'points', targetPoints: 3 }, 4);
for (let i = 0; i < 8; i++) {
  g.act({ type: 'start' });
  if (g.pub.team === 0) g.act({ type: 'got' });
  else g.act({ type: 'timeUp' });
  if (i === 4) assert(g.pub.phase === 'turnEnd' && g.pub.teamScores[0] === 3, 'first to N: Team A on 3 still lets Team B take its equal turn');
  if (g.pub.phase === 'over') break;
  g.act({ type: 'next' });
}
assert(g.pub.phase === 'over' && g.pub.teamScores[0] === 3 && g.pub.turnsTaken[0] === g.pub.turnsTaken[1], 'first to N ends after both teams had equal turns');

// passes 0 / 3 + speed round
g = game({ passes: 0 });
g.act({ type: 'start' });
assert(g.try({ type: 'pass' }).error === 'no_passes', 'passes 0: Pass disabled');
g = game({ passes: 3, speed: true });
g.act({ type: 'start' });
for (let i = 0; i < 3; i++) g.act({ type: 'pass' });
assert(g.try({ type: 'pass' }).error === 'no_passes', 'passes 3: three passes then blocked');
g.act({ type: 'got' });
g.act({ type: 'got' });
assert(g.pub.phase === 'acting' && g.pub.teamScores[0] === 2 && g.hidden.current, 'speed round chains titles until time runs out');
g.act({ type: 'timeUp' });
assert(g.pub.lastTurn.points === 2 && g.pub.lastTurn.got.length === 2, 'speed round turn summary counts every title');

// typed guesses
g = game({}, 9);
g.act({ type: 'start' });
const cur = CH.titleOf(g.hidden.current);
assert(g.try({ type: 'guess', id: 'b1', text: cur.en }).error === 'not_guesser', 'the other team can’t type-guess');
assert(g.try({ type: 'guess', id: 'a1', text: cur.en }).error === 'not_guesser', 'the actor can’t type-guess');
assert(g.act({ type: 'guess', id: 'a2', text: 'zzzz qqqq' }).matched === false && g.pub.phase === 'acting', 'wrong guess: no credit, keep acting');
const out = g.act({ type: 'guess', id: 'a2', text: cur.en.toUpperCase() + '!' });
assert(out.matched && g.pub.teamScores[0] === 1 && g.pub.guessHits.a2 === 1 && g.pub.actorPoints.a1 === 1, 'typed guess auto-credits the team (guesser + actor)');
const title = (en, hi, alts) => ({ en, hi, alts: alts || [] });
const fm = (text, t) => PC.fuzzyMatch(text, [t.en, t.hi].concat(t.alts));
assert(fm('dilwale dulhania le jayenge', title('Dilwale Dulhania Le Jayenge', 'दिलवाले दुल्हनिया ले जाएंगे', ['DDLJ'])), 'forgiving: case');
assert(fm('ddlj', title('Dilwale Dulhania Le Jayenge', 'दिलवाले दुल्हनिया ले जाएंगे', ['DDLJ'])), 'forgiving: common short form');
assert(fm('dilwale dulhaniya le jayenge', title('Dilwale Dulhania Le Jayenge', 'दिलवाले दुल्हनिया ले जाएंगे')), 'forgiving: small spelling slip on a long title');
assert(fm('Godfather', title('The Godfather', 'द गॉडफादर')), 'forgiving: leading “The”');
assert(fm('द गॉडफादर', title('The Godfather', 'द गॉडफादर')), 'forgiving: Hindi label');
assert(!fm('car', title('Cat', 'बिल्ली')), 'no fuzzy match on very short words');
assert(!fm('titanic', title('Inception', 'इन्सेप्शन')), 'different title rejected');
assert(!fm('', title('Inception', 'इन्सेप्शन')), 'empty guess rejected');

// team helpers
const bal = CH.balanceTeams(ids(7), seeded(3));
assert(Math.abs(bal[0].length - bal[1].length) <= 1 && bal[0].length + bal[1].length === 7, 'auto-balance: sizes differ by ≤1');
assert(!CH.validTeams([['a'], ['b', 'c', 'd']]) && CH.validTeams([['a', 'b'], ['c', 'd']]), 'each team needs 2+');
g = game({}, 2);
CH.addPlayer(g.pub, 'late');
assert(g.pub.teams[1].indexOf('late') >= 0, 'late joiner goes to the smaller team');
g.act({ type: 'start' });
CH.removePlayer(g.pub, g.hidden, g.s, 'a1');
assert(g.pub.phase === 'turnEnd' && g.pub.lastTurn.reason === 'left', 'actor leaving mid-turn ends the turn');
g.act({ type: 'next' });
g.act({ type: 'start' });
g.act({ type: 'timeUp' });
g.act({ type: 'next' });
assert(g.pub.actor === 'a2', 'rotation continues with the next teammate after a leave');
(function () {
  const x = game({}, 3);
  x.pub.teams[0] = ['p', 'q', 'r'];
  x.pub.actorIdx[0] = 5; // after several laps → next up is r
  x.pub.team = 1;
  x.pub.phase = 'turnEnd';
  CH.removePlayer(x.pub, x.hidden, x.s, 'p');
  x.pub.team = 1;
  x.act({ type: 'next' });
  assert(x.pub.actor === 'r', 'rotation survives a leave after several laps');
})();
CH.removePlayer(g.pub, g.hidden, g.s, 'b1');
CH.removePlayer(g.pub, g.hidden, g.s, 'b2');
CH.removePlayer(g.pub, g.hidden, g.s, 'late');
assert(g.pub.phase === 'over', 'a team emptying ends the game');

// ---------- (e) Room: no secret in shared payloads ----------
const NOW = 1_700_000_000_000;
const uidOf = (c) => c.repeat(28);
function mkRoom(game, settings, count) {
  const host = uidOf('h');
  const room = Party.newRoom({ game, uid: host, name: 'Host', settings, now: NOW });
  room.presence[host] = { at: NOW, online: true };
  const all = [host];
  'abcdefghijklmno'.split('').slice(0, count - 1).forEach((c, i) => {
    const u = uidOf(c);
    Party.reduceRoom(room, u, 'join', { name: 'P' + c }, NOW + i, Math.random);
    room.presence[u] = { at: NOW, online: true };
    all.push(u);
  });
  return { room, host, all };
}
const sharedOf = (room) => JSON.stringify({ pub: room.pub, presence: room.presence });

// RMCS room: 6 players (extended), full round
(function () {
  const { room, host, all } = mkRoom('rajamantri', { rounds: 5 }, 6);
  Party.reduceRoom(room, host, 'start', {}, NOW + 10, seeded(21));
  const roles = room.server.hidden.roles;
  const leak = (label) => {
    const st = room.pub.state;
    if (st.phase === 'result') return;
    if (/"roles"|"hidden"/.test(sharedOf(room))) throw new Error(label + ': role map in shared state');
    (st.picks || []).forEach((p) => {
      if (st.revealed[p.thief] !== p.role) throw new Error(label + ': pick log names an unrevealed thief');
    });
    Object.keys(st.revealed || {}).forEach((id) => {
      if (roles[id] !== st.revealed[id]) throw new Error(label + ': revealed map wrong');
    });
    const unrevealed = all.filter((id) => !st.revealed[id]);
    unrevealed.forEach((id) => {
      if (sharedOf(room).includes('"' + id + '":"' + roles[id] + '"')) throw new Error(label + ': unrevealed chit visible');
    });
  };
  leak('deal');
  all.forEach((id) => {
    const sec = room.secrets[id];
    if (!sec || sec.role !== roles[id] || Object.keys(sec).sort().join() !== 'role,roundNo') throw new Error('each secret = owner chit only');
  });
  assert(true, 'RMCS room: every chit is in its owner’s secrets node only');
  all.forEach((id, i) => Party.reduceRoom(room, id, 'seen', {}, NOW + 20 + i, Math.random));
  assert(room.pub.state.phase === 'raja', 'all seen → Raja stands up');
  leak('raja');
  const rajaId = RM.holderOf(room.server.hidden, 'raja');
  const notRaja = all.find((id) => id !== rajaId);
  let code = '';
  try {
    Party.reduceRoom(room, notRaja, 'revealRaja', {}, NOW + 30, Math.random);
  } catch (e) {
    code = e.code;
  }
  assert(code === 'NOT_RAJA' || code === 'not_raja', 'server rejects a fake Raja');
  Party.reduceRoom(room, rajaId, 'revealRaja', {}, NOW + 31, Math.random);
  assert(room.pub.state.raja === rajaId && room.pub.state.revealed[rajaId] === 'raja', 'Raja reveal syncs to everyone');
  leak('call');
  const mantri = RM.holderOf(room.server.hidden, 'mantri');
  Party.reduceRoom(room, mantri, 'revealGuesser', {}, NOW + 32, Math.random);
  assert(room.pub.state.phase === 'guess' && room.pub.state.guesser === mantri, 'Mantri reveal syncs; guess phase');
  leak('guess');
  const thiefRole = room.pub.state.thiefOrder[0];
  const realThief = RM.holderOf(room.server.hidden, thiefRole);
  const decoy = RM.candidates(room.server.pub).find((id) => id !== realThief);
  const r1 = Party.reduceRoom(room, mantri, 'pick', { target: decoy }, NOW + 33, Math.random);
  assert(r1.result.correct === false && room.pub.state.revealed[realThief] === thiefRole, 'wrong pick syncs and reveals the real thief');
  leak('pick 1');
  const thief2 = RM.holderOf(room.server.hidden, room.server.pub.thiefOrder[1]);
  Party.reduceRoom(room, mantri, 'pick', { target: thief2 }, NOW + 34, Math.random);
  assert(room.pub.state.phase === 'result' && room.pub.scores[mantri] === 400 && room.pub.scores[realThief] === 400, 'room scoring: running totals follow the swap rule');
  assert(room.pub.state.result.roles[rajaId] === 'raja', 'all chits revealed at result');
  Party.reduceRoom(room, host, 'next', {}, NOW + 40, seeded(5));
  assert(room.pub.roundNo === 2 && room.pub.state.phase === 'reveal' && Object.keys(room.pub.state.revealed).length === 0, 'next round re-deals with a clean table');
  leak('round 2');
  // guesser offline → auto-progress
  const late = uidOf('z');
  Party.reduceRoom(room, late, 'join', { name: 'Late' }, NOW + 41, Math.random);
  assert(room.pub.players[late].pending && !room.secrets[late], 'mid-round joiner waits (no chit)');
  // play to final quickly via timeouts
  let guard = 0;
  while (!room.pub.over && guard++ < 200) {
    Party.reduceRoom(room, host, 'tick', {}, (room.pub.deadline || NOW) + 1, seeded(guard));
    if (room.pub.state.phase === 'result' && !room.pub.over) Party.reduceRoom(room, host, 'next', {}, NOW + 50 + guard, seeded(guard));
    Object.keys(room.presence).forEach((id) => (room.presence[id] = { at: (room.pub.deadline || NOW) + 1, online: true }));
  }
  assert(room.pub.over && room.pub.roundNo === 5, 'Rounds setting honoured: game over after 5 rounds (timeouts auto-progress)');
  code = '';
  try {
    Party.reduceRoom(room, host, 'next', {}, NOW + 999999, Math.random);
  } catch (e) {
    code = e.code;
  }
  assert(/phase/i.test(code), 'no extra round after the final');
  Party.reduceRoom(room, host, 'start', {}, NOW + 1000000, seeded(8));
  assert(room.pub.roundNo === 1 && !room.pub.over && Object.values(room.pub.scores).every((v) => v === 0), 'Play again resets totals');
})();

// RMCS room: 4-player classic, Sipahi catches
(function () {
  const { room, host, all } = mkRoom('rajamantri', { guesser: 'sipahi' }, 4);
  Party.reduceRoom(room, host, 'start', {}, NOW + 10, seeded(3));
  all.forEach((id) => Party.reduceRoom(room, id, 'seen', {}, NOW + 11, Math.random));
  Party.reduceRoom(room, RM.holderOf(room.server.hidden, 'raja'), 'revealRaja', {}, NOW + 12, Math.random);
  const sip = RM.holderOf(room.server.hidden, 'sipahi');
  Party.reduceRoom(room, sip, 'revealGuesser', {}, NOW + 13, Math.random);
  const chor = RM.holderOf(room.server.hidden, 'chor');
  Party.reduceRoom(room, sip, 'pick', { target: chor }, NOW + 14, Math.random);
  assert(room.pub.scores[sip] === 500 && room.pub.scores[chor] === 0, 'room classic with Sipahi catching: correct pick keeps points');
})();

// Charades room: title only in the actor's secret node
(function () {
  const { room, host, all } = mkRoom('charades', { turnSec: 60, passes: 1, goal: 'turns', turnsPerTeam: 2, categories: ['hollywood', 'actions'] }, 5);
  const pick = room.pub.teamPick;
  assert(Object.keys(pick).length === 5 && Math.abs(Object.values(pick).filter((t) => t === 0).length - Object.values(pick).filter((t) => t === 1).length) <= 1, 'lobby auto-balances joiners into teams');
  let code = '';
  try {
    Party.reduceRoom(room, all[1], 'setTeam', { target: all[1], team: 1 }, NOW + 5, Math.random);
  } catch (e) {
    code = e.code;
  }
  assert(/host_only/i.test(code), 'only the host arranges teams');
  Party.reduceRoom(room, host, 'setTeam', { target: all[1], team: 1 - pick[all[1]] }, NOW + 6, Math.random);
  Party.reduceRoom(room, host, 'shuffleTeams', {}, NOW + 7, seeded(4));
  Party.reduceRoom(room, host, 'start', {}, NOW + 10, seeded(12));
  const leak = (label) => {
    const s = room.server;
    const cur = CH.titleOf(s.hidden.current);
    const shared = sharedOf(room);
    if (/"deck"|"current"|"hidden"/.test(shared)) throw new Error(label + ': deck keys in shared state');
    if (cur && (shared.includes(JSON.stringify(cur.en)) || shared.includes('"' + cur.key + '"'))) throw new Error(label + ': current title in shared state');
    Object.keys(room.secrets).forEach((id) => {
      if (id !== s.pub.actor) throw new Error(label + ': a non-actor has a secret');
    });
    if (cur && (!room.secrets[s.pub.actor] || room.secrets[s.pub.actor].title.key !== cur.key)) throw new Error(label + ': actor secret wrong');
  };
  leak('deal');
  assert(Object.keys(room.secrets).length === 1, 'Charades room: only the actor’s secrets node holds the title');
  const st = () => room.server.pub;
  const actor = st().actor;
  const mate = st().teams[st().team].find((id) => id !== actor);
  const rival = st().teams[1 - st().team][0];
  code = '';
  try {
    Party.reduceRoom(room, mate, 'go', {}, NOW + 11, Math.random);
  } catch (e) {
    code = e.code;
  }
  assert(/not_actor/i.test(code), 'only the actor starts the timer');
  Party.reduceRoom(room, actor, 'go', {}, NOW + 12, Math.random);
  assert(room.pub.state.phase === 'acting' && room.pub.deadline === NOW + 12 + 60000, 'timer synced from the server deadline');
  leak('acting');
  const d0 = room.pub.deadline;
  Party.reduceRoom(room, actor, 'pass', {}, NOW + 13, Math.random);
  assert(room.pub.deadline === d0, 'Pass keeps the same clock');
  leak('after pass');
  code = '';
  try {
    Party.reduceRoom(room, actor, 'pass', {}, NOW + 14, Math.random);
  } catch (e) {
    code = e.code;
  }
  assert(/no_passes/i.test(code), 'room pass limit enforced');
  code = '';
  try {
    Party.reduceRoom(room, rival, 'guess', { text: 'x' }, NOW + 15, Math.random);
  } catch (e) {
    code = e.code;
  }
  assert(/not_guesser/i.test(code), 'rival team can’t type-guess');
  const miss = Party.reduceRoom(room, mate, 'guess', { text: 'definitely not it' }, NOW + 16, Math.random);
  assert(miss.result.matched === false, 'wrong typed guess returns matched:false');
  leak('after miss');
  const answer = CH.titleOf(room.server.hidden.current).en;
  const hit = Party.reduceRoom(room, mate, 'guess', { text: answer.toLowerCase() }, NOW + 17, Math.random);
  assert(hit.result.matched && room.pub.state.phase === 'turnEnd' && room.pub.state.teamScores[st().team] === 1 && room.pub.scores[mate] === 1, 'typed guess credits the team on every device');
  assert(Object.keys(room.secrets).length === 0, 'turn over → secret wiped');
  Party.reduceRoom(room, rival, 'nextTurn', {}, NOW + 18, Math.random);
  assert(room.pub.state.phase === 'ready' && room.pub.state.team === 1 - room.pub.state.lastTurn.team, 'anyone can move to the next turn; teams alternate');
  leak('turn 2');
  Party.reduceRoom(room, host, 'tick', {}, room.pub.deadline + 1, Math.random);
  assert(room.pub.state.phase === 'acting', 'ready timeout starts the turn');
  leak('turn 2 acting');
  Party.reduceRoom(room, host, 'tick', {}, room.pub.deadline + 1, Math.random);
  assert(room.pub.state.phase === 'turnEnd' && room.pub.state.lastTurn.reason === 'time', 'acting timeout = time up');
  let guard = 0;
  while (room.pub.state.phase !== 'over' && guard++ < 30) {
    Object.keys(room.presence).forEach((id) => (room.presence[id] = { at: (room.pub.deadline || NOW) + 1, online: true }));
    Party.reduceRoom(room, host, 'tick', {}, (room.pub.deadline || NOW) + 1, Math.random);
    if (room.pub.state.phase !== 'over') leak('loop ' + guard);
  }
  assert(room.pub.state.phase === 'over' && room.pub.over, 'game ends after the set turns per team');
  const late = uidOf('y');
  Party.reduceRoom(room, host, 'start', {}, NOW + 9e6, seeded(2));
  assert(room.pub.state.phase === 'ready' && room.pub.state.teamScores.join() === '0,0', 'Play again starts a fresh game with the same teams');
  Party.reduceRoom(room, late, 'join', { name: 'Late' }, NOW + 9e6 + 1, Math.random);
  assert(!room.pub.players[late].pending && CH.teamOf(room.server.pub, late) >= 0, 'late joiner goes straight onto a team');
  leak('after late join');
  // actor leaves mid-turn
  const a2 = room.server.pub.actor;
  Party.reduceRoom(room, a2, 'go', {}, NOW + 9e6 + 2, Math.random);
  Party.reduceRoom(room, a2, 'leave', {}, NOW + 9e6 + 3, Math.random);
  assert(room.pub.state.phase === 'turnEnd' && room.pub.state.lastTurn.reason === 'left' && !room.secrets[a2], 'actor leaving ends their turn and wipes the secret');
  // RTDB drops empty arrays — hydrate restores shapes
  const stripped = JSON.parse(JSON.stringify(room, (k, v) => (Array.isArray(v) && !v.length ? undefined : v)));
  Party.hydrateRoom(stripped);
  assert(Array.isArray(stripped.server.pub.turnGot) && Array.isArray(stripped.server.hidden.deck), 'hydrate restores dropped arrays');
})();

// uneven teams can't start
(function () {
  const { room, host, all } = mkRoom('charades', {}, 4);
  all.slice(1).forEach((id) => Party.reduceRoom(room, host, 'setTeam', { target: id, team: 1 }, NOW + 3, Math.random));
  Party.reduceRoom(room, host, 'setTeam', { target: host, team: 1 }, NOW + 4, Math.random);
  let code = '';
  try {
    Party.reduceRoom(room, host, 'start', {}, NOW + 5, Math.random);
  } catch (e) {
    code = e.code;
  }
  assert(/teams_uneven/i.test(code), 'room start refuses a team with fewer than 2');
})();

// ---------- (f) wiring ----------
const sandbox = { window: {}, document: { createElement: () => ({}), querySelector: () => null }, console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(read('public/src/js/dangal/dangal-graduation.js'), sandbox);
const ds = read('public/src/js/dangal/design-system.js');
const gameUi = read('public/src/js/games/game-ui.js');
const registry = read('public/src/js/games/game-registry.js');
const html = read('public/index.html');
const rules = JSON.parse(read('firebase/database.rules.json'));
const gotd = require(path.join(root, 'server-lib/game-of-day.js'));
const colours = new Set();
['rajamantri', 'charades'].forEach((id) => {
  assert(sandbox.isRosterGameId(id) && sandbox.rosterGenre(id) === 'party' && sandbox.isPartyKitGame(id), `${id}: on roster in the Party section (party kit)`);
  const grad = sandbox.getGameGraduation(id);
  assert(grad.grade === 'party' && grad.stakes === false && !sandbox.stakesEnabledForGame(id) && !sandbox.isLiveCapable(id), `${id}: Party grade, no chips, no Live`);
  const row = ds.match(new RegExp(id + ": \\{ primary: '(#[0-9A-F]{6})'[^}]*mark: M\\." + id));
  assert(!!row && new RegExp('\\n    ' + id + ':\\r?\\n').test(ds), `${id}: GAME_IDENTITY row + SVG mark`);
  colours.add(row[1]);
  assert(new RegExp(id + ': \\[').test(gameUi) && new RegExp(id + ": '#").test(gameUi), `${id}: how-to tips + accent`);
  assert(new RegExp("GROUP_PARTY_IDS = \\[[^\\]]*'" + id + "'").test(registry), `${id}: group chat picker`);
  assert(gotd.GAME_GENRE_BY_ID[id] === 'party', `${id}: game-of-day genre`);
  const g = rules.rules.games[id] && rules.rules.games[id].$code;
  assert(!!g && g.secrets.$uid['.read'] === 'auth != null && auth.uid == $uid' && !g.secrets.$uid['.write'] && !g['.read'] && !g.server, `${id}: RTDB secrets readable only by their owner`);
  const js = read(`public/src/js/games/${id}.js`);
  assert(new RegExp("registerGame\\(\\{\\s*id: '" + id + "'").test(js) && /genre: 'party'/.test(js) && /chatGroup: true/.test(js), `${id}: registers in the party genre`);
  const passPath = js.slice(js.indexOf('PASS & PLAY'), js.indexOf('======================= ROOM'));
  assert(passPath.length > 500 && !/apiFetch|rtdb|createRoom|roomCall/.test(passPath), `${id}: Pass & Play path makes no network calls`);
  assert(/shareFinal|shareLine/.test(js), `${id}: share card wired`);
  assert(!/stake|chips/i.test(js.replace(/Virtual points only; never chips\./, '')), `${id}: no stakes / chips`);
});
assert(colours.size === 2 && !colours.has('#C2185B'), 'distinct identity colours');
const order = ['games/party-kit.js', 'games/party-core.js', 'data/charades-packs.js', 'games/rajamantri-core.js', 'games/charades-core.js', 'games/rajamantri.js', 'games/charades.js'];
order.forEach((f) => assert(html.includes('/src/js/' + f), f + ' loaded by index.html'));
assert(order.every((f, i) => i === 0 || html.indexOf('/src/js/' + order[i - 1]) < html.indexOf('/src/js/' + f)), 'script order: kit → party-core → packs → cores → games');
const serverSrc = read('server-lib/party-deal.js');
assert(/require\('\.\.\/public\/src\/js\/games\/rajamantri-core\.js'\)/.test(serverSrc) && /require\('\.\.\/public\/src\/js\/games\/charades-core\.js'\)/.test(serverSrc), 'server shares the client cores (literal requires for bundling)');
assert(/require\('\.\/party-core\.js'\)/.test(read('public/src/js/games/charades-core.js')) && /require\('\.\.\/data\/charades-packs\.js'\)/.test(read('public/src/js/games/charades-core.js')), 'charades-core bundles party-core + packs by literal path');
const rmJs = read('public/src/js/games/rajamantri.js');
assert(/Raja of the night/.test(rmJs), 'RMCS share line: “… is the Raja of the night 👑”');
assert(/MVP actor/.test(read('public/src/js/games/charades.js')), 'Charades share line names the MVP actor');
assert(/Rani[\s\S]*Daku[\s\S]*Senapati[\s\S]*Daroga/.test(rmJs) || /EXTENDED_ORDER/.test(rmJs), 'extended role table in the RMCS how-to');
assert(/Gestures/.test(read('public/src/js/games/charades.js')) && /GESTURES/.test(read('public/src/js/games/charades.js')), 'gesture cheat sheet in how-to + in-game ?');
const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js = 12 (got ${apiCount})`);

console.log('\nDangal G2 party checks passed.');
