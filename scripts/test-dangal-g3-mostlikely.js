/**
 * Dangal G3 — Most Likely To? + Would You Rather (one game id) on the Party Kit.
 *  (a) pack integrity: counts, bilingual, no duplicates, kindness classes clean
 *  (b) Most Likely To: tally / tie / crown, read-the-room points, anonymous = no points
 *  (c) Would You Rather: split, majority, prediction scoring (tie = nobody), in-sync / rebel stats
 *  (d) deck: no repeats until the chosen packs run dry; mixed-pack shuffle
 *  (e) custom prompts: kindness filter, session-only
 *  (f) room: no voter→choice in shared payloads before reveal; anonymous never publishes it
 *  (g) wiring: roster, graduation, identity, how-to, registry, rules, scripts, api count
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

const Packs = require(path.join(root, 'public/src/js/data/mostlikely-packs.js'));
const ML = require(path.join(root, 'public/src/js/games/mostlikely-core.js'));
const Party = require(path.join(root, 'server-lib/party-deal.js'));

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const DEVANAGARI = /[\u0900-\u097F]/;

// ---------- (a) packs ----------
const likely = [];
const rather = [];
Packs.PACKS.forEach((p) => {
  assert(p.en && DEVANAGARI.test(p.hi) && p.icon, `pack ${p.id}: English + Devanagari label + icon`);
  likely.push(...p.likely);
  rather.push(...p.rather);
});
const ratherCore = rather.filter((r) => r.pack !== 'hypothetical');
assert(likely.length >= 200, `Most Likely To prompts ≥200 (got ${likely.length})`);
assert(ratherCore.length >= 200, `Would You Rather dilemmas ≥200 (got ${ratherCore.length}, excluding Hypothetical)`);
assert(rather.some((r) => r.pack === 'hypothetical') && !Packs.getPack('hypothetical').likely.length, 'Hypothetical pack ships for Would You Rather');
['friends', 'work', 'desi', 'filmy', 'food', 'travel', 'absurd'].forEach((id) => {
  const p = Packs.getPack(id);
  assert(p && p.likely.length >= 20 && p.rather.length >= 20, `pack ${id} has both modes`);
});
assert(Packs.getPack('desi').regional && Packs.getPack('filmy').regional, 'Desi Life + Filmy are regional add-ons');
assert(Packs.defaultPacks('mlt', 'en').indexOf('desi') < 0 && Packs.defaultPacks('mlt', 'hi').indexOf('desi') >= 0, 'regional packs default only for Hindi readers (global-first)');
likely.forEach((x) => {
  if (!x.en || !x.hi || !DEVANAGARI.test(x.hi) || DEVANAGARI.test(x.en)) throw new Error('likely not bilingual: ' + x.key);
});
rather.forEach((x) => {
  if (!x.a.en || !x.b.en || !DEVANAGARI.test(x.a.hi || '') || !DEVANAGARI.test(x.b.hi || '')) throw new Error('rather not bilingual: ' + x.key);
});
assert(true, 'every prompt has English + Devanagari');
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const seenL = new Set(likely.map((x) => norm(x.en)));
assert(seenL.size === likely.length, 'no duplicate Most Likely To prompts');
const seenR = new Set(rather.map((x) => [norm(x.a.en), norm(x.b.en)].sort().join('|')));
assert(seenR.size === rather.length && rather.every((x) => norm(x.a.en) !== norm(x.b.en)), 'no duplicate dilemmas; A ≠ B');
const flagged = [];
likely.forEach((x) => ML.kindnessFlags(x.en + ' ' + x.hi).length && flagged.push(x.key + ':' + ML.kindnessFlags(x.en + ' ' + x.hi)));
rather.forEach((x) => {
  const t = [x.a.en, x.a.hi, x.b.en, x.b.hi].join(' ');
  if (ML.kindnessFlags(t).length) flagged.push(x.key + ':' + ML.kindnessFlags(t));
});
assert(flagged.length === 0, 'kindness guardrail: no looks / caste / religion / sexuality / money / cruelty / adult / profanity in packs' + (flagged.length ? ' → ' + flagged.join(', ') : ''));
['He is so ugly', 'which caste', 'go to the temple', 'is gay', 'too poor', 'so stupid', 'drunk again', 'what the fuck', 'मोटा', 'बेवकूफ'].forEach((t) => {
  if (!ML.kindnessFlags(t).length) throw new Error('kindness class missed: ' + t);
});
assert(true, 'every banned class trips on a sample (English + Devanagari)');
assert(!ML.kindnessFlags('मसाला चाय').length && !ML.kindnessFlags('नई प्रजाति').length && ML.kindnessFlags('वो साला').length, 'Devanagari words match at a word start only (मसाला / प्रजाति are clean)');

// ---------- (b) Most Likely To ----------
const P = ['a', 'b', 'c', 'd'];
let t = ML.tallyVotes(P, { a: 'b', b: 'c', c: 'b', d: 'b' });
assert(t.b === 3 && t.c === 1 && t.a === 0, 'tally counts votes per player');
let c = ML.crown(t);
assert(c.top.join() === 'b' && c.topVotes === 3, 'top pick crowned');
c = ML.crown(ML.tallyVotes(P, { a: 'b', b: 'c', c: 'b', d: 'c' }));
assert(c.top.sort().join() === 'b,c' && c.topVotes === 2, 'ties share the crown');
assert(ML.crown(ML.tallyVotes(P, {})).top.length === 0, 'no votes → nobody crowned');
const rtr = ML.readTheRoomPoints({ a: 'b', b: 'c', c: 'b', d: 'c' }, ['b', 'c']);
assert(Object.keys(rtr).length === 4, 'read-the-room: every voter who picked a crowned player scores');
assert(ML.readTheRoomPoints({ a: 'b', b: 'a', c: 'b' }, ['b']).b === undefined, 'voters for a non-crowned player score nothing');

function round(mode, settings, players) {
  const s = ML.mergeSettings(Object.assign({ mode }, settings));
  const r = ML.createRound(players || P, { key: 'x', en: 'test', a: { en: 'A' }, b: { en: 'B' } }, s, 1);
  const h = ML.createHidden();
  return { s, r, h, act: (a) => ML.applyAction(r, h, s, a) };
}
let g = round('mlt', { selfVote: false });
assert(g.act({ type: 'vote', id: 'a', target: 'a' }).error === 'no_self_vote', 'self-vote off is enforced');
g = round('mlt', {});
assert(!g.act({ type: 'vote', id: 'a', target: 'a' }).error, 'self-vote allowed by default');
['b', 'c'].forEach((id) => g.act({ type: 'vote', id, target: 'a' }));
assert(g.r.phase === 'vote', 'vote stays open until everyone has voted');
assert(g.act({ type: 'vote', id: 'b', target: 'c' }) && g.h.votes.b === 'c', 'a vote can be changed while open');
g.act({ type: 'vote', id: 'd', target: 'a' });
assert(g.r.phase === 'defence' && g.r.result.top.join() === 'a', 'all voted → auto-reveal → defence beat (default on)');
assert(g.r.result.points.a === 1 && g.r.result.points.d === 1 && !g.r.result.points.b, 'names mode: +1 to voters who picked the top pick');
g.act({ type: 'endDefence' });
assert(g.r.phase === 'result', 'defence ends → result');
g = round('mlt', { defence: false, reveal: 'anon' });
P.forEach((id) => g.act({ type: 'vote', id, target: 'b' }));
assert(g.r.phase === 'result' && g.r.result.votes === null && Object.keys(g.r.result.points).length === 0, 'anonymous: tallies only, no voter map, no points (points would reveal voters)');
assert(!/"a":"b"|"votes":\{/.test(JSON.stringify(g.r)), 'anonymous result has no voter→choice pairs');
g = round('mlt', { scoring: false });
P.forEach((id) => g.act({ type: 'vote', id, target: 'c' }));
assert(Object.keys(g.r.result.points).length === 0, 'scoring off → no points');
g = round('mlt', {});
g.act({ type: 'quick', tally: { a: 2, b: 2, c: 0, d: 0 } });
assert(g.r.result.top.sort().join() === 'a,b' && g.r.result.votes === null && !Object.keys(g.r.result.points).length, 'count-of-3 quick mode: host tally, ties share, no points');
g = round('mlt', {});
g.act({ type: 'vote', id: 'a', target: 'b' });
ML.removePlayer(g.r, g.h, g.s, 'c');
ML.removePlayer(g.r, g.h, g.s, 'd');
g.act({ type: 'vote', id: 'b', target: 'a' });
assert(g.r.phase !== 'vote' && g.r.players.length === 2, 'leavers drop out; remaining votes close the round');
assert(ML.badgeFor({ key: 'friends:l1' }) === ML.badgeFor({ key: 'friends:l1' }), 'playful badge is stable per prompt');

// ---------- (c) Would You Rather ----------
g = round('wyr', {});
assert(g.act({ type: 'vote', id: 'a', pick: 'a' }).error === 'bad_vote', 'WYR vote needs both a pick and a majority guess');
g.act({ type: 'vote', id: 'a', pick: 'a', guess: 'a' });
g.act({ type: 'vote', id: 'b', pick: 'a', guess: 'b' });
g.act({ type: 'vote', id: 'c', pick: 'b', guess: 'a' });
g.act({ type: 'vote', id: 'd', pick: 'a', guess: 'a' });
let res = g.r.result;
assert(g.r.phase === 'result' && res.counts.a === 3 && res.counts.b === 1 && res.majority === 'a', 'split counts + majority side');
assert(res.points.a === 1 && res.points.c === 1 && res.points.d === 1 && !res.points.b && res.predictedRight === 3, '+1 for predicting the majority');
assert(res.picks.c === 'b', 'names mode shows who picked what');
assert(ML.predictionPoints({ a: { pick: 'a', guess: 'a' }, b: { pick: 'b', guess: 'b' } }, ML.majorityOf({ a: 1, b: 1 })) && Object.keys(ML.predictionPoints({}, null)).length === 0 && ML.majorityOf({ a: 2, b: 2 }) === null, 'tied room: no majority, nobody scores');
g = round('wyr', { reveal: 'anon' });
P.forEach((id, i) => g.act({ type: 'vote', id, pick: i ? 'b' : 'a', guess: 'b' }));
assert(g.r.result.picks === null && g.r.result.counts.b === 3, 'anonymous WYR: percentages only');
assert(!/"pick"|"guess"/.test(JSON.stringify(g.r)), 'anonymous WYR result never carries a pick/guess map');
const session = ML.newSession();
[
  { a: 'a', b: 'a', c: 'b', d: 'a' },
  { a: 'b', b: 'b', c: 'b', d: 'a' },
  { a: 'a', b: 'a', c: 'b', d: 'a' },
].forEach((picks) => {
  const x = round('wyr', {});
  P.forEach((id) => x.act({ type: 'vote', id, pick: picks[id], guess: 'a' }));
  ML.recordRound(session, x.r);
});
const hl = ML.highlights(session, P, { a: 2, b: 2, c: 1, d: 3 });
assert(hl.inSync.ids.sort().join() === 'a,b' && hl.inSync.n === 3, 'Most in sync = matched the majority most often');
assert(hl.rebel.ids.join() === 'c' && hl.rebel.n === 2, 'Rebel of the room = minority most often');
assert(hl.predictor.ids.join() === 'd', 'best predictor from scores');
assert(hl.closest && hl.unanimous, 'room-level Closest call / Most agreed available for anonymous games');
const anonSession = ML.newSession();
const ax = round('wyr', { reveal: 'anon' });
P.forEach((id) => ax.act({ type: 'vote', id, pick: 'a', guess: 'a' }));
ML.recordRound(anonSession, ax.r);
assert(!Object.keys(anonSession.inSync).length && !Object.keys(anonSession.rebel).length, 'anonymous rounds never feed per-player sync / rebel stats');
const mltSession = ML.newSession();
[{ w: 'a', v: 3 }, { w: 'a', v: 4 }, { w: 'b', v: 2 }].forEach((q, i) => {
  const x = round('mlt', { defence: false });
  x.r.prompt = { key: 'k' + i, en: 'p' + i };
  P.forEach((id, j) => x.act({ type: 'vote', id, target: j < q.v ? q.w : 'c' }));
  ML.recordRound(mltSession, x.r);
});
const vd = ML.verdict(mltSession, P);
assert(vd.find((v) => v.id === 'a').best.en === 'p1' && vd.find((v) => v.id === 'a').crowns === 2, 'Room’s verdict: each player’s strongest crown');
assert(ML.isOver({ rounds: 10 }, 10) && !ML.isOver({ rounds: 10 }, 9) && !ML.isOver({ rounds: 0 }, 999), 'rounds: 10 ends at 10; endless never ends on its own');

// ---------- (d) deck ----------
['mlt', 'wyr'].forEach((mode) => {
  const s = ML.mergeSettings({ mode, packs: ['friends', 'food'] }, 'en');
  const pool = ML.poolKeys(s, 'en');
  let st = null;
  const seen = new Set();
  const rng = seeded(mode === 'mlt' ? 7 : 9);
  for (let i = 0; i < pool.length; i++) {
    const out = ML.nextPrompt(st, s, 'en', rng);
    st = out.state;
    if (seen.has(out.prompt.key)) throw new Error(mode + ': repeat before pool exhausted');
    seen.add(out.prompt.key);
  }
  assert(seen.size === pool.length, `${mode}: no repeats until every prompt in the chosen packs is dealt (${pool.length})`);
  const packsSeen = new Set(Array.from(seen).slice(0, 12).map((k) => k.split(':')[0]));
  assert(packsSeen.size === 2, `${mode}: mixed-pack shuffle`);
  const last = st.last;
  const next = ML.nextPrompt(st, s, 'en', rng);
  assert(next.prompt && next.prompt.key !== last, `${mode}: refill avoids an immediate repeat`);
});
const sMlt = ML.mergeSettings({ mode: 'mlt' }, 'en');
assert(ML.poolKeys(sMlt, 'en').every((k) => !/^(desi|filmy):/.test(k)), 'default English deck = global packs only');
const sw = ML.nextPrompt(ML.nextPrompt(null, sMlt, 'en', seeded(1)).state, ML.mergeSettings({ mode: 'wyr' }, 'en'), 'en', seeded(2));
assert(sw.prompt.a && sw.prompt.b, 'switching mode resets the deck for the new mode');

// ---------- (e) custom prompts ----------
let cc = ML.cleanCustom('Who is most likely to sing in the shower', 'mlt');
assert(cc.ok && cc.prompt.en === 'sing in the shower' && cc.prompt.custom, 'custom Most Likely To prompt accepted + tidied');
assert(!ML.cleanCustom('be the ugliest one', 'mlt').ok, 'custom prompt with a looks jab is blocked');
assert(!ML.cleanCustom('<script>x</script> hate', 'mlt').ok, 'custom prompt with cruelty is blocked');
assert(!ML.cleanCustom({ a: 'Fly', b: 'fly' }, 'wyr').ok && !ML.cleanCustom({ a: 'Tea', b: '' }, 'wyr').ok, 'custom dilemma needs two different options');
assert(!ML.cleanCustom({ a: 'Beer', b: 'Juice' }, 'wyr').ok, 'custom dilemma is kindness-filtered');
cc = ML.cleanCustom({ a: 'Fly', b: 'Swim' }, 'wyr');
assert(cc.ok && cc.prompt.a.en === 'Fly', 'custom dilemma accepted');
const customs = [{ mode: 'mlt', prompt: ML.cleanCustom('juggle', 'mlt').prompt }];
const withC = ML.poolKeys(ML.mergeSettings({ mode: 'mlt', packs: ['friends'] }, 'en'), 'en', customs);
assert(withC.indexOf('c:0') >= 0 && ML.promptFor('c:0', customs).en === 'juggle', 'Pass & Play customs join the session deck');
const client = read('public/src/js/games/mostlikely.js');
assert(/let passCustoms = \[\]/.test(client) && /const roomCustoms = \{\}/.test(client) && !/setItem\([^)]*[Cc]ustom/.test(client), 'custom lists are in-memory only (never saved)');

// ---------- (f) room privacy ----------
const NOW = 1_700_000_000_000;
const uidOf = (ch) => ch.repeat(28);
function mkRoom(settings, count) {
  const host = uidOf('h');
  const room = Party.newRoom({ game: 'mostlikely', uid: host, name: 'Host', settings, now: NOW });
  room.presence[host] = { at: NOW, online: true };
  const all = [host];
  'abcdefghijklmno'.split('').slice(0, count - 1).forEach((ch, i) => {
    const u = uidOf(ch);
    Party.reduceRoom(room, u, 'join', { name: 'P' + ch }, NOW + i, Math.random);
    room.presence[u] = { at: NOW, online: true };
    all.push(u);
  });
  return { room, host, all };
}
const sharedOf = (room) => JSON.stringify({ pub: room.pub, presence: room.presence });
function noVotesShared(room, label) {
  const shared = sharedOf(room);
  if (/"hidden"|"deck"/.test(shared)) throw new Error(label + ': server keys in shared state');
  const votes = (room.server && room.server.hidden && room.server.hidden.votes) || {};
  Object.keys(votes).forEach((voter) => {
    const v = votes[voter];
    const needle = typeof v === 'string' ? '"' + voter + '":"' + v + '"' : '"' + voter + '":{"pick"';
    if (shared.includes(needle)) throw new Error(label + ': voter→choice in shared state');
  });
  if (/"guess"/.test(shared)) throw new Error(label + ': guesses in shared state');
}
function ownerOnlySecrets(room) {
  Object.keys(room.secrets || {}).forEach((uid) => {
    const sec = room.secrets[uid];
    const v = room.server.hidden.votes[uid];
    if (!v) throw new Error('secret without a vote');
    if (typeof v === 'string' ? sec.target !== v : sec.pick !== v.pick) throw new Error('secret is not the owner’s own vote');
  });
}

// Most Likely To room, names reveal
(function () {
  const { room, host, all } = mkRoom({ mode: 'mlt', reveal: 'names', rounds: 10 }, 4);
  Party.reduceRoom(room, host, 'start', {}, NOW + 10, seeded(3));
  assert(room.pub.state.phase === 'vote' && room.pub.state.prompt && room.pub.state.prompt.en, 'room deals a prompt for everyone');
  noVotesShared(room, 'deal');
  Party.reduceRoom(room, all[1], 'vote', { target: all[2] }, NOW + 11, Math.random);
  Party.reduceRoom(room, all[2], 'vote', { target: all[2] }, NOW + 12, Math.random);
  noVotesShared(room, 'mid-vote');
  ownerOnlySecrets(room);
  assert(room.pub.state.voted.length === 2 && room.secrets[all[1]].target === all[2] && !room.secrets[all[3]], 'room: “who has voted” is shared; each choice is only in the voter’s own secret');
  let code = '';
  try {
    Party.reduceRoom(room, all[1], 'revealNow', {}, NOW + 13, Math.random);
  } catch (e) {
    code = e.code;
  }
  assert(/host_only/.test(code), 'only the host can reveal early');
  Party.reduceRoom(room, host, 'vote', { target: all[2] }, NOW + 14, Math.random);
  Party.reduceRoom(room, all[3], 'vote', { target: all[1] }, NOW + 15, Math.random);
  const st = room.pub.state;
  assert(st.phase === 'defence' && st.result.top.join() === all[2] && st.result.votes[all[1]] === all[2], 'all voted → reveal (names mode publishes the map only now)');
  assert(room.pub.scores[all[1]] === 1 && room.pub.scores[all[3]] === 0, 'room scoring: +1 to voters who picked the top pick');
  code = '';
  try {
    Party.reduceRoom(room, all[3], 'endDefence', {}, NOW + 16, Math.random);
  } catch (e) {
    code = e.code;
  }
  assert(/not_allowed/.test(code), 'defence beat: only host or the crowned player can skip');
  Party.reduceRoom(room, all[2], 'endDefence', {}, NOW + 17, Math.random);
  assert(room.pub.state.phase === 'result', 'crowned player ends their defence');
  Party.reduceRoom(room, host, 'next', {}, NOW + 20, seeded(4));
  assert(room.pub.roundNo === 2 && room.pub.state.phase === 'vote' && Object.keys(room.secrets).length === 0 && room.pub.state.prompt.key !== st.prompt.key, 'next round: fresh prompt, secrets wiped');
  noVotesShared(room, 'round 2');
  let guard = 0;
  while (!room.pub.over && guard++ < 100) {
    const s = room.pub.state;
    if (s.phase === 'vote') {
      Party.reduceRoom(room, all[0], 'vote', { target: all[guard % 4] }, NOW + 100 + guard, Math.random);
      noVotesShared(room, 'loop ' + guard);
      Party.reduceRoom(room, host, 'tick', {}, room.pub.deadline + 1, Math.random);
    } else if (s.phase === 'defence') {
      Party.reduceRoom(room, host, 'tick', {}, room.pub.deadline + 1, Math.random);
    } else if (s.phase === 'result') {
      Party.reduceRoom(room, host, 'next', {}, NOW + 200 + guard, seeded(guard));
    }
    Object.keys(room.presence).forEach((id) => (room.presence[id] = { at: (room.pub.deadline || NOW) + 1, online: true }));
  }
  assert(room.pub.over && room.pub.roundNo === 10, 'Most Likely To room completes a 10-round session (timeouts close votes + defence)');
  const keys = room.server.session.history.map((h) => h.key);
  assert(new Set(keys).size === keys.length, 'no repeated prompt across the session');
  assert(Object.keys(room.pub.state.session.crowns).length > 0, 'session crowns synced for the Room’s verdict');
  Party.reduceRoom(room, host, 'start', {}, NOW + 9e6, seeded(8));
  assert(room.pub.roundNo === 1 && !room.pub.over && Object.values(room.pub.scores).every((v) => v === 0), 'Play again resets totals');
})();

// Most Likely To room, anonymous (room default) — never leaks names
(function () {
  const { room, host, all } = mkRoom({ mode: 'mlt', reveal: 'anon', defence: false }, 5);
  Party.reduceRoom(room, host, 'start', {}, NOW + 10, seeded(5));
  all.forEach((id, i) => {
    Party.reduceRoom(room, id, 'vote', { target: all[i % 2] }, NOW + 11 + i, Math.random);
    noVotesShared(room, 'anon vote ' + i);
  });
  const res = room.pub.state.result;
  assert(room.pub.state.phase === 'result' && res.votes === null && res.anon, 'anonymous room: result has tallies only');
  assert(Object.values(room.pub.scores).every((v) => v === 0), 'anonymous room: no points (they would reveal voters)');
  noVotesShared(room, 'anon result');
})();

// Would You Rather room — anonymous by default for rooms, names optional
(function () {
  const { room, host, all } = mkRoom({ mode: 'wyr', reveal: 'anon', rounds: 10 }, 3);
  Party.reduceRoom(room, host, 'start', {}, NOW + 10, seeded(6));
  assert(room.pub.state.prompt.a && room.pub.state.prompt.b, 'WYR room deals a dilemma');
  let code = '';
  try {
    Party.reduceRoom(room, all[1], 'vote', { pick: 'a' }, NOW + 11, Math.random);
  } catch (e) {
    code = e.code;
  }
  assert(!!code, 'WYR room rejects a vote without a majority guess');
  Party.reduceRoom(room, all[1], 'vote', { pick: 'a', guess: 'a' }, NOW + 12, Math.random);
  Party.reduceRoom(room, all[2], 'vote', { pick: 'b', guess: 'a' }, NOW + 13, Math.random);
  noVotesShared(room, 'wyr mid');
  ownerOnlySecrets(room);
  Party.reduceRoom(room, host, 'vote', { pick: 'a', guess: 'b' }, NOW + 14, Math.random);
  const res = room.pub.state.result;
  assert(res.counts.a === 2 && res.majority === 'a' && res.picks === null, 'WYR anonymous: split only');
  assert(room.pub.scores[all[1]] === 1 && room.pub.scores[all[2]] === 1 && room.pub.scores[host] === 0, 'WYR room: +1 for predicting the majority');
  noVotesShared(room, 'wyr result');
  let guard = 0;
  while (!room.pub.over && guard++ < 60) {
    if (room.pub.state.phase === 'vote') Party.reduceRoom(room, host, 'tick', {}, room.pub.deadline + 1, Math.random);
    else if (room.pub.state.phase === 'result') Party.reduceRoom(room, host, 'next', {}, NOW + 300 + guard, seeded(guard));
    if (room.pub.state.phase === 'vote') {
      all.forEach((id, i) => Party.reduceRoom(room, id, 'vote', { pick: i % 2 ? 'b' : 'a', guess: 'a' }, NOW + 400 + guard * 5 + i, Math.random));
      noVotesShared(room, 'wyr loop ' + guard);
    }
  }
  assert(room.pub.over && room.pub.roundNo === 10, 'Would You Rather room completes a 10-round session');
  assert(!Object.keys(room.pub.state.session.inSync).length, 'anonymous WYR session never records per-player picks');
})();

// WYR names mode + custom prompt via start args + finish
(function () {
  const { room, host, all } = mkRoom({ mode: 'wyr', reveal: 'names', rounds: 0 }, 2);
  let code = '';
  try {
    Party.reduceRoom(room, host, 'start', { custom: { a: 'Beer', b: 'Juice' } }, NOW + 5, seeded(1));
  } catch (e) {
    code = e.code;
  }
  assert(/custom_blocked/.test(code), 'server re-checks a custom prompt (kindness)');
  Party.reduceRoom(room, host, 'start', { custom: { a: 'Fly', b: 'Swim' } }, NOW + 10, seeded(1));
  assert(room.pub.state.prompt.custom && room.pub.state.prompt.a.en === 'Fly' && !room.server.customs, 'host custom arrives with start; only that one prompt lives in the room');
  all.forEach((id, i) => Party.reduceRoom(room, id, 'vote', { pick: i ? 'b' : 'a', guess: 'a' }, NOW + 11 + i, Math.random));
  assert(room.pub.state.result.picks[all[1]] === 'b', 'names mode publishes picks after reveal');
  code = '';
  try {
    Party.reduceRoom(room, all[1], 'finish', {}, NOW + 20, Math.random);
  } catch (e) {
    code = e.code;
  }
  assert(/host_only/.test(code), 'only the host ends an endless game');
  Party.reduceRoom(room, host, 'finish', {}, NOW + 21, Math.random);
  assert(room.pub.over, 'End game → final screen (endless mode)');
  const stripped = JSON.parse(JSON.stringify(room, (k, v) => (Array.isArray(v) && !v.length ? undefined : v)));
  Party.hydrateRoom(stripped);
  assert(Array.isArray(stripped.server.pub.voted) && stripped.server.hidden.votes && Array.isArray(stripped.server.session.history), 'hydrate restores dropped arrays');
})();

// Mode minimum + mid-round joiner
(function () {
  const { room, host } = mkRoom({ mode: 'mlt' }, 2);
  let code = '';
  try {
    Party.reduceRoom(room, host, 'start', {}, NOW + 5, Math.random);
  } catch (e) {
    code = e.code;
  }
  assert(/need_players/.test(code), 'Most Likely To needs 3 players');
  const late = uidOf('z');
  Party.reduceRoom(room, late, 'join', { name: 'Late' }, NOW + 6, Math.random);
  Party.reduceRoom(room, host, 'start', {}, NOW + 7, seeded(2));
  const later = uidOf('y');
  Party.reduceRoom(room, later, 'join', { name: 'Later' }, NOW + 8, Math.random);
  assert(room.pub.players[later].pending && room.pub.state.players.indexOf(later) < 0, 'mid-round joiner votes from the next round');
})();

// ---------- (g) wiring ----------
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
const id = 'mostlikely';
assert(sandbox.isRosterGameId(id) && sandbox.rosterGenre(id) === 'party' && sandbox.isPartyKitGame(id), 'on roster in the Party section (party kit)');
const grad = sandbox.getGameGraduation(id);
assert(grad.grade === 'party' && grad.stakes === false && !sandbox.stakesEnabledForGame(id) && !sandbox.isLiveCapable(id), 'Party grade, no chips, no Live');
const row = ds.match(/mostlikely: \{ primary: '(#[0-9A-F]{6})'[^}]*mark: M\.mostlikely/);
assert(!!row && /\n    mostlikely:\r?\n/.test(ds), 'GAME_IDENTITY row + SVG mark');
const others = ['imposter', 'rajamantri', 'charades'].map((g2) => (ds.match(new RegExp(g2 + ": \\{ primary: '(#[0-9A-F]{6})'")) || [])[1]);
assert(others.indexOf(row[1]) < 0, 'own identity colour');
assert(/mostlikely: \[/.test(gameUi) && /mostlikely: '#/.test(gameUi), 'how-to tips + accent');
assert(/GROUP_PARTY_IDS = \[[^\]]*'mostlikely'/.test(registry), 'chat / Baithak group picker');
assert(gotd.GAME_GENRE_BY_ID[id] === 'party', 'game-of-day genre');
const rg = rules.rules.games[id] && rules.rules.games[id].$code;
assert(!!rg && rg.secrets.$uid['.read'] === 'auth != null && auth.uid == $uid' && !rg.secrets.$uid['.write'] && !rg['.read'] && !rg.server, 'RTDB: secrets owner-only, server node unreadable');
assert((client.match(/registerGame\(\{\s*id: '/g) || []).length === 1 && /registerGame\(\{\s*id: 'mostlikely'/.test(client) && /genre: 'party'/.test(client) && /chatGroup: true/.test(client), 'one game id (modes are not separate tiles)');
const passPath = client.slice(client.indexOf('PASS & PLAY'), client.indexOf('======================= ROOM'));
assert(passPath.length > 500 && !/apiFetch|rtdb|createRoom|roomCall/.test(passPath), 'Pass & Play path makes no network calls (offline, signed out)');
assert(/shareLine/.test(client) && /Room’s verdict/.test(client) && /Most in sync/.test(client) && /Rebel of the room/.test(client), 'share card + verdict + highlights wired');
assert(/mountPassVote/.test(client) && /quick/.test(client), 'secret pass-around vote by default; count-of-3 under Advanced');
assert(!/stake|chips/i.test(client.replace(/Virtual points only; never chips\./, '')), 'no stakes / chips');
const order = ['games/party-kit.js', 'games/party-core.js', 'data/mostlikely-packs.js', 'games/mostlikely-core.js', 'games/mostlikely.js'];
assert(order.every((f, i) => html.includes('/src/js/' + f) && (i === 0 || html.indexOf('/src/js/' + order[i - 1]) < html.indexOf('/src/js/' + f))), 'index.html loads kit → party-core → packs → core → game');
assert(/require\('\.\.\/public\/src\/js\/games\/mostlikely-core\.js'\)/.test(read('server-lib/party-deal.js')), 'server shares the client core (literal require)');
const core = read('public/src/js/games/mostlikely-core.js');
assert(/require\('\.\/party-core\.js'\)/.test(core) && /require\('\.\.\/data\/mostlikely-packs\.js'\)/.test(core), 'core bundles party-core + packs by literal path');
const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js = 12 (got ${apiCount})`);

console.log('\nDangal G3 Most Likely To checks passed.');
