/**
 * Dangal H1 — Werewolf on the Party Kit.
 *  (a) role balance per player count + balance meter + theme reskin
 *  (b) night resolution: Doctor save, Bodyguard rule, Witch potions, Hunter shot, wolf tie
 *  (c) day vote: majority, skip, tie → one revote → nobody; quick vote
 *  (d) every win condition incl. Tanner; leavers
 *  (e) Pass & Play night parity: every role gets the same-shaped action step
 *  (f) room: no roles / night choices / Seer results / wolf chat in shared payloads; secrets owner-only;
 *      spectators; timers; rejoin; late joiners; host migration
 *  (g) wiring: roster, graduation, identity, how-to, registry, lazy load, rules, scripts, api count
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

const WW = require(path.join(root, 'public/src/js/games/werewolf-core.js'));
const Party = require(path.join(root, 'server-lib/party-deal.js'));

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const count = (arr, r) => arr.filter((x) => x === r).length;
const ids = (n) => Array.from({ length: n }, (_, i) => 'p' + (i + 1));

// ---------- (a) balance ----------
[
  [5, 1],
  [6, 1],
  [7, 2],
  [10, 2],
  [11, 3],
  [14, 3],
  [15, 4],
  [16, 4],
  [20, 4],
].forEach(([n, w]) => {
  const roles = WW.rolesFor(n, {});
  if (roles.length !== n || count(roles, 'wolf') !== w || count(roles, 'seer') !== 1 || count(roles, 'doctor') !== 1) {
    throw new Error('auto-balance wrong for ' + n + ': ' + roles.join(','));
  }
});
assert(true, 'auto-balance: 5–6 → 1 wolf, 7–10 → 2, 11–14 → 3, 15+ → 4; Seer + Doctor always in');
assert(WW.balance(8, {}).tone === 'ok' && WW.balance(8, {}).score === 0, 'balance meter: auto preset reads Balanced');
assert(WW.balance(8, { wolves: 3 }).tone !== 'ok' && WW.balance(8, { wolves: 3 }).score < 0, 'balance meter: extra wolves lean wolves');
assert(WW.balance(7, { wolves: 1, hunter: true, witch: true, bodyguard: true }).tone === 'bad', 'balance meter: stacked village warns');
assert(WW.balance(5, { wolves: 2 }).tone === 'bad' && /one night away/.test(WW.balance(5, { wolves: 2 }).note), 'balance meter: 2 wolves at 5 players flagged');
assert(WW.wolvesFor(5, { wolves: 9 }) === 2, 'wolf count capped so wolves start outnumbered');
const opt = WW.rolesFor(9, { hunter: true, witch: true, tanner: true, bodyguard: true });
assert(['hunter', 'witch', 'tanner', 'bodyguard'].every((r) => count(opt, r) === 1) && count(opt, 'wolf') === 2 && count(opt, 'villager') === 1, 'optional roles slot in; villagers fill the rest');
assert(WW.balance(5, { hunter: true, witch: true, tanner: true, bodyguard: true }).dropped.length === 2, 'roles that don’t fit are dropped and reported');
const n5 = WW.balance(5, {});
assert(/Best with 7\+/.test(n5.note), 'setup says “Best with 7+” under 7 players');
assert(WW.mergeSettings({ discussSec: 999, theme: 'x', hunter: 'yes' }).discussSec === 180 && WW.mergeSettings({}).theme === 'werewolf' && WW.mergeSettings({ hunter: 'yes' }).hunter === false, 'settings merge is strict (defaults: 3 min, Werewolf theme)');
assert(WW.DEFAULT_SETTINGS.doctorRepeat === false && WW.DEFAULT_SETTINGS.reveal === true && WW.DEFAULT_SETTINGS.voteStyle === 'quick', 'defaults: no Doctor repeats, reveal on elimination, quick vote');

// theme reskin
const lineKeys = Object.keys(WW.THEMES.werewolf.lines).sort().join();
Object.keys(WW.THEMES).forEach((t) => {
  const th = WW.THEMES[t];
  WW.ROLE_IDS.forEach((r) => {
    if (!th.roles[r] || !th.roles[r].name || !th.roles[r].icon || !th.roles[r].plural) throw new Error(t + ' misses role ' + r);
  });
  ['wolves', 'village', 'tanner'].forEach((k) => {
    if (!th.teams[k]) throw new Error(t + ' misses team ' + k);
  });
  if (Object.keys(th.lines).sort().join() !== lineKeys) throw new Error(t + ' narration keys differ');
  ['village', 'wolves', 'tanner'].forEach((k) => {
    if (!th.lines.win[k]) throw new Error(t + ' misses win line ' + k);
  });
});
assert(WW.roleName('wolf', 'mafia') === 'Mafia' && WW.roleName('seer', 'mafia') === 'Detective' && WW.roleName('villager', 'mafia') === 'Civilian' && WW.roleName('tanner', 'mafia') === 'Jester', 'theme reskin maps every role (Mafia / Detective / Doctor / Civilian …)');
assert(WW.teamName('wolves', 'mafia') === 'Mafia' && WW.teamName('village', 'werewolf') === 'Village', 'theme reskin maps teams');
const gory = /\b(blood|bloody|gore|gory|murder\w*|corpse|dead body|slaughter\w*|stab\w*|butcher\w*)\b/i;
const narration = JSON.stringify(WW.THEMES);
assert(!gory.test(narration), 'narration is playful, non-gory');

// ---------- helpers ----------
/** Fixed deal: roles by id. */
function game(roleList, settings) {
  const players = ids(roleList.length);
  const g = WW.createGame(players, settings || {}, { rng: seeded(1) });
  players.forEach((id, i) => (g.hidden.roles[id] = roleList[i]));
  WW.applyAction(g.pub, g.hidden, g.settings, { type: 'begin' });
  return g;
}
function act(g, id, target, extra) {
  return WW.applyAction(g.pub, g.hidden, g.settings, Object.assign({ type: 'night', id, target }, extra || {}), seeded(2));
}
function everyoneElse(g, done) {
  g.pub.alive.forEach((id) => {
    if (done.indexOf(id) >= 0 || g.pub.phase !== 'night') return;
    const step = WW.nightStep(g.pub, g.hidden, g.settings, id);
    const out = WW.applyAction(g.pub, g.hidden, g.settings, { type: 'night', id, target: step.candidates[0] || null }, seeded(3));
    if (out.error) throw new Error('filler act failed ' + id + ' ' + out.error);
  });
}
function lastDawn(g) {
  return g.pub.log.filter((e) => e.t === 'dawn').slice(-1)[0];
}

// ---------- (b) night ----------
(function () {
  // p1 wolf, p2 seer, p3 doctor, p4..p6 villagers
  const g = game(['wolf', 'seer', 'doctor', 'villager', 'villager', 'villager']);
  assert(g.pub.phase === 'night' && g.pub.night === 1, 'begin → night 1');
  const seer = act(g, 'p2', 'p1');
  assert(seer.result === 'wolves' && g.hidden.seerLog[0].team === 'wolves', 'Seer check returns the team privately');
  assert(act(g, 'p2', 'p4').error === 'already_checked', 'Seer gets one check per night');
  act(g, 'p1', 'p4');
  act(g, 'p3', 'p4');
  everyoneElse(g, ['p1', 'p2', 'p3']);
  const d = lastDawn(g);
  assert(g.pub.phase === 'dawn' && d.taken.length === 0 && d.saved === 'doctor', 'Doctor save: nobody taken, “the Doctor saved someone”');
  assert(/Doctor saved someone/.test(WW.narrate(d, 'werewolf')), 'narrator: “Nobody was taken, the Doctor saved someone”');
  assert(WW.isAlive(g.pub, 'p4'), 'saved player lives');
  WW.applyAction(g.pub, g.hidden, g.settings, { type: 'continue' });
  WW.applyAction(g.pub, g.hidden, g.settings, { type: 'startVote' });
  WW.applyAction(g.pub, g.hidden, g.settings, { type: 'quickVote', out: null });
  WW.applyAction(g.pub, g.hidden, g.settings, { type: 'continue' });
  assert(g.pub.phase === 'night' && g.pub.night === 2, 'no-elimination day → night 2');
  const docStep = WW.nightStep(g.pub, g.hidden, g.settings, 'p3');
  assert(docStep.candidates.indexOf('p4') < 0, 'Doctor can’t protect the same player two nights running (default)');
  const g2 = game(['wolf', 'seer', 'doctor', 'villager', 'villager', 'villager'], { doctorRepeat: true });
  act(g2, 'p3', 'p4');
  everyoneElse(g2, ['p3']);
  WW.applyAction(g2.pub, g2.hidden, g2.settings, { type: 'continue' });
  WW.applyAction(g2.pub, g2.hidden, g2.settings, { type: 'startVote' });
  WW.applyAction(g2.pub, g2.hidden, g2.settings, { type: 'quickVote', out: null });
  WW.applyAction(g2.pub, g2.hidden, g2.settings, { type: 'continue' });
  assert(WW.nightStep(g2.pub, g2.hidden, g2.settings, 'p3').candidates.indexOf('p4') >= 0, 'setting: Doctor repeats allowed when switched on');
  act(g, 'p1', 'p5');
  everyoneElse(g, ['p1']);
  assert(!WW.isAlive(g.pub, 'p5') && lastDawn(g).taken[0] === 'p5', 'unprotected victim is taken');
})();

(function () {
  // Bodyguard: p1 wolf, p2 bodyguard, p3 seer, p4 doctor, p5-p6 villager
  const g = game(['wolf', 'bodyguard', 'seer', 'doctor', 'villager', 'villager']);
  const step = WW.nightStep(g.pub, g.hidden, g.settings, 'p2');
  assert(step.candidates.indexOf('p2') < 0, 'Bodyguard can’t guard themself');
  act(g, 'p2', 'p5');
  act(g, 'p1', 'p5');
  act(g, 'p4', 'p6');
  everyoneElse(g, ['p1', 'p2', 'p4']);
  assert(WW.isAlive(g.pub, 'p5') && lastDawn(g).saved === 'protected', 'Bodyguard protects the target');
  WW.applyAction(g.pub, g.hidden, g.settings, { type: 'continue' });
  WW.applyAction(g.pub, g.hidden, g.settings, { type: 'startVote' });
  WW.applyAction(g.pub, g.hidden, g.settings, { type: 'quickVote', out: null });
  WW.applyAction(g.pub, g.hidden, g.settings, { type: 'continue' });
  assert(WW.nightStep(g.pub, g.hidden, g.settings, 'p2').candidates.indexOf('p5') < 0, 'Bodyguard can’t guard the same person two nights running');
  assert(act(g, 'p2', 'p5').error === 'bad_target', 'engine rejects a repeat guard');
})();

(function () {
  // Witch: p1 wolf, p2 witch, p3 seer, p4 doctor, p5-p7 villagers
  const g = game(['wolf', 'witch', 'seer', 'doctor', 'villager', 'villager', 'villager']);
  let step = WW.nightStep(g.pub, g.hidden, g.settings, 'p2');
  assert(step.optional && step.witch.save && step.witch.kill && step.witch.victim === null, 'Witch sees no victim before the wolves choose');
  act(g, 'p1', 'p5');
  step = WW.nightStep(g.pub, g.hidden, g.settings, 'p2');
  assert(step.witch.victim === 'p5', 'Witch sees the wolves’ victim once they agree');
  act(g, 'p2', null, { save: true });
  act(g, 'p4', 'p4');
  everyoneElse(g, ['p1', 'p2', 'p4']);
  assert(WW.isAlive(g.pub, 'p5') && lastDawn(g).saved === 'potion' && !g.hidden.witch.save && g.hidden.witch.kill, 'Witch save potion: used once, victim lives');
  WW.applyAction(g.pub, g.hidden, g.settings, { type: 'continue' });
  WW.applyAction(g.pub, g.hidden, g.settings, { type: 'startVote' });
  WW.applyAction(g.pub, g.hidden, g.settings, { type: 'quickVote', out: null });
  WW.applyAction(g.pub, g.hidden, g.settings, { type: 'continue' });
  assert(act(g, 'p2', null, { save: true }).error === 'no_potion', 'save potion can’t be used twice');
  act(g, 'p2', 'p7');
  act(g, 'p1', 'p6');
  act(g, 'p4', 'p6');
  everyoneElse(g, ['p1', 'p2', 'p4']);
  const d = lastDawn(g);
  assert(!WW.isAlive(g.pub, 'p7') && WW.isAlive(g.pub, 'p6') && d.taken.join() === 'p7' && !g.hidden.witch.kill, 'Witch sleep potion takes a player once');
  WW.applyAction(g.pub, g.hidden, g.settings, { type: 'continue' });
  WW.applyAction(g.pub, g.hidden, g.settings, { type: 'startVote' });
  WW.applyAction(g.pub, g.hidden, g.settings, { type: 'quickVote', out: null });
  WW.applyAction(g.pub, g.hidden, g.settings, { type: 'continue' });
  step = WW.nightStep(g.pub, g.hidden, g.settings, 'p2');
  assert(step.candidates.length === 0 && step.optional && !step.witch.save && !step.witch.kill, 'Witch with no potions still gets a (skippable) night step');
  // unused save isn't wasted when nobody is attacked
  const g2 = game(['wolf', 'wolf', 'witch', 'seer', 'doctor', 'villager', 'villager', 'villager']);
  act(g2, 'p1', 'p6');
  act(g2, 'p2', 'p7');
  act(g2, 'p3', null, { save: true });
  assert(WW.nightStep(g2.pub, g2.hidden, g2.settings, 'p3').witch.victim === null, 'split wolves: Witch sees no victim');
  act(g2, 'p5', 'p6');
  act(g2, 'p5', 'p7');
  everyoneElse(g2, ['p1', 'p2', 'p3', 'p5']);
  assert(lastDawn(g2).saved === 'potion' || lastDawn(g2).saved === 'doctor', 'split-vote victim resolved and saved');
})();

(function () {
  // Wolf tie: two wolves split → one of the two, randomly
  const picks = new Set();
  for (let seed = 1; seed < 30; seed++) {
    const g = game(['wolf', 'wolf', 'seer', 'doctor', 'villager', 'villager', 'villager', 'villager']);
    WW.applyAction(g.pub, g.hidden, g.settings, { type: 'night', id: 'p1', target: 'p5' });
    WW.applyAction(g.pub, g.hidden, g.settings, { type: 'night', id: 'p2', target: 'p6' });
    WW.applyAction(g.pub, g.hidden, g.settings, { type: 'night', id: 'p4', target: 'p4' });
    ['p3', 'p5', 'p6', 'p7'].forEach((id) => WW.applyAction(g.pub, g.hidden, g.settings, { type: 'night', id, target: WW.nightStep(g.pub, g.hidden, g.settings, id).candidates[0] }));
    WW.applyAction(g.pub, g.hidden, g.settings, { type: 'night', id: 'p8', target: 'p1' }, () => (seed % 2 ? 0.1 : 0.9));
    const d = lastDawn(g);
    if (d.taken.length !== 1 || ['p5', 'p6'].indexOf(d.taken[0]) < 0) throw new Error('wolf tie picked outside the tied');
    picks.add(d.taken[0]);
  }
  assert(picks.size === 2, 'wolf tie: random among the tied (both seen across seeds)');
})();

(function () {
  // Hunter shot at night, and on a day vote
  const g = game(['wolf', 'wolf', 'hunter', 'seer', 'doctor', 'villager', 'villager', 'villager']);
  act(g, 'p1', 'p3');
  act(g, 'p2', 'p3');
  everyoneElse(g, ['p1', 'p2']);
  assert(!WW.isAlive(g.pub, 'p3'), 'Hunter taken at night');
  WW.applyAction(g.pub, g.hidden, g.settings, { type: 'continue' });
  assert(g.pub.phase === 'hunter' && g.pub.hunter === 'p3', 'Hunter gets a last shot');
  assert(WW.applyAction(g.pub, g.hidden, g.settings, { type: 'shoot', id: 'p4', target: 'p1' }).error === 'not_hunter', 'only the Hunter can shoot');
  WW.applyAction(g.pub, g.hidden, g.settings, { type: 'shoot', id: 'p3', target: 'p1' });
  assert(!WW.isAlive(g.pub, 'p1') && g.pub.phase === 'day', 'Hunter takes someone with them, then day');
  assert(/takes .* with them/.test(WW.narrate(g.pub.log.filter((e) => e.t === 'shot')[0], 'werewolf', (x) => x)), 'narrator announces the shot');
  const g2 = game(['wolf', 'hunter', 'seer', 'doctor', 'villager', 'villager', 'villager']);
  everyoneElse(g2, []);
  WW.applyAction(g2.pub, g2.hidden, g2.settings, { type: 'continue' });
  if (g2.pub.phase === 'hunter') WW.applyAction(g2.pub, g2.hidden, g2.settings, { type: 'shoot', target: null });
  WW.applyAction(g2.pub, g2.hidden, g2.settings, { type: 'startVote' });
  if (WW.isAlive(g2.pub, 'p2')) {
    WW.applyAction(g2.pub, g2.hidden, g2.settings, { type: 'quickVote', out: 'p2' });
    WW.applyAction(g2.pub, g2.hidden, g2.settings, { type: 'continue' });
    assert(g2.pub.phase === 'hunter' && g2.pub.after === 'night', 'voted-out Hunter shoots before night');
    WW.applyAction(g2.pub, g2.hidden, g2.settings, { type: 'shoot', target: null });
    assert(g2.pub.phase === 'night' && /lowers their bow/.test(WW.narrate(g2.pub.log.filter((e) => e.t === 'shot')[0], 'werewolf', (x) => x)), 'Hunter may hold fire');
  }
})();

// ---------- (c) day vote ----------
(function () {
  const g = game(['wolf', 'wolf', 'seer', 'doctor', 'villager', 'villager', 'villager', 'villager', 'villager']);
  act(g, 'p1', 'p9');
  act(g, 'p2', 'p9');
  act(g, 'p4', 'p4');
  everyoneElse(g, ['p1', 'p2', 'p4']);
  WW.applyAction(g.pub, g.hidden, g.settings, { type: 'continue' });
  assert(g.pub.phase === 'day', 'dawn → day');
  WW.applyAction(g.pub, g.hidden, g.settings, { type: 'nominate', id: 'p3', target: 'p1' });
  WW.applyAction(g.pub, g.hidden, g.settings, { type: 'nominate', id: 'p5', target: 'p6' });
  WW.applyAction(g.pub, g.hidden, g.settings, { type: 'startVote' });
  assert(g.pub.candidates.join() === 'p1,p6', 'nominations → the vote is between nominees');
  const vote = (id, t) => WW.applyAction(g.pub, g.hidden, g.settings, { type: 'vote', id, target: t });
  assert(vote('p3', 'p2').error === 'bad_target', 'can only vote for a nominee');
  ['p1', 'p2', 'p3', 'p4'].forEach((id, i) => vote(id, i < 2 ? 'p6' : 'p1'));
  assert(g.pub.voted.length === 4 && !JSON.stringify(g.pub).includes('"p4":"p1"'), 'votes stay secret until the count');
  ['p5', 'p6', 'p7', 'p8'].forEach((id, i) => vote(id, i < 2 ? 'p6' : 'p1'));
  assert(g.pub.phase === 'vote' && g.pub.revote && g.pub.candidates.join() === 'p1,p6', 'tie → one revote between the tied');
  assert(/One more vote/.test(WW.narrate(g.pub.log.slice(-1)[0], 'werewolf', (x) => x)), 'narrator calls the revote');
  g.pub.alive.forEach((id, i) => vote(id, i % 2 ? 'p6' : 'p1'));
  const v = g.pub.log.filter((e) => e.t === 'vote').slice(-1)[0];
  assert(g.pub.phase === 'verdict' && v.out === null && v.tie, 'second tie → nobody is eliminated');
  WW.applyAction(g.pub, g.hidden, g.settings, { type: 'continue' });
  everyoneElse(g, []);
  WW.applyAction(g.pub, g.hidden, g.settings, { type: 'continue' });
  if (g.pub.phase === 'hunter') WW.applyAction(g.pub, g.hidden, g.settings, { type: 'shoot', target: null });
  WW.applyAction(g.pub, g.hidden, g.settings, { type: 'startVote' });
  assert(g.pub.candidates.length === g.pub.alive.length, 'no nominations → everyone alive is on the ballot');
  const alive = g.pub.alive.slice();
  alive.forEach((id, i) => vote(id, i < alive.length - 1 ? 'p1' : 'skip'));
  const v2 = g.pub.log.filter((e) => e.t === 'vote').slice(-1)[0];
  assert(v2.out === 'p1' && v2.role === 'wolf' && v2.votes, 'majority eliminates; role revealed (default); votes published at the count');
  // skip wins
  const g3 = game(['wolf', 'seer', 'doctor', 'villager', 'villager', 'villager'], { reveal: false });
  everyoneElse(g3, []);
  WW.applyAction(g3.pub, g3.hidden, g3.settings, { type: 'continue' });
  WW.applyAction(g3.pub, g3.hidden, g3.settings, { type: 'startVote' });
  const al = g3.pub.alive.slice();
  al.forEach((id, i) => WW.applyAction(g3.pub, g3.hidden, g3.settings, { type: 'vote', id, target: i === 0 ? al[1] : 'skip' }));
  assert(g3.pub.log.filter((e) => e.t === 'vote').slice(-1)[0].out === null, '“No one” outvoting everyone → nobody out');
  WW.applyAction(g3.pub, g3.hidden, g3.settings, { type: 'continue' });
  everyoneElse(g3, []);
  const d3 = lastDawn(g3);
  assert(!d3.roles, 'reveal off: night victims’ roles stay hidden');
  // quick vote tie → revote → nobody
  const g4 = game(['wolf', 'seer', 'doctor', 'villager', 'villager', 'villager']);
  everyoneElse(g4, []);
  WW.applyAction(g4.pub, g4.hidden, g4.settings, { type: 'continue' });
  WW.applyAction(g4.pub, g4.hidden, g4.settings, { type: 'startVote' });
  const a4 = g4.pub.alive;
  WW.applyAction(g4.pub, g4.hidden, g4.settings, { type: 'quickVote', tied: [a4[0], a4[1]] });
  assert(g4.pub.revote && g4.pub.candidates.length === 2, 'quick vote: host marks a tie → revote');
  WW.applyAction(g4.pub, g4.hidden, g4.settings, { type: 'quickVote', tied: [a4[0], a4[1]] });
  assert(g4.pub.phase === 'verdict' && g4.pub.log.slice(-1)[0].out === null, 'quick vote: second tie → nobody');
})();

// ---------- (d) wins ----------
(function () {
  const g = game(['wolf', 'seer', 'doctor', 'villager', 'villager']);
  everyoneElse(g, []);
  WW.applyAction(g.pub, g.hidden, g.settings, { type: 'continue' });
  WW.applyAction(g.pub, g.hidden, g.settings, { type: 'startVote' });
  WW.applyAction(g.pub, g.hidden, g.settings, { type: 'quickVote', out: 'p1' });
  WW.applyAction(g.pub, g.hidden, g.settings, { type: 'continue' });
  assert(g.pub.phase === 'over' && g.pub.winner === 'village' && g.pub.result.roles.p1 === 'wolf', 'village wins when every wolf is out; roles revealed at the end');
  assert(g.pub.result.recap.length >= 2 && g.pub.result.recap[0].t === 'night', 'end screen: night-by-night recap');

  const g2 = game(['wolf', 'seer', 'doctor', 'villager', 'villager']);
  act(g2, 'p1', 'p2');
  act(g2, 'p3', 'p3');
  everyoneElse(g2, ['p1', 'p3']);
  WW.applyAction(g2.pub, g2.hidden, g2.settings, { type: 'continue' });
  WW.applyAction(g2.pub, g2.hidden, g2.settings, { type: 'startVote' });
  WW.applyAction(g2.pub, g2.hidden, g2.settings, { type: 'quickVote', out: 'p4' });
  WW.applyAction(g2.pub, g2.hidden, g2.settings, { type: 'continue' });
  act(g2, 'p1', 'p3');
  everyoneElse(g2, ['p1']);
  WW.applyAction(g2.pub, g2.hidden, g2.settings, { type: 'continue' });
  assert(g2.pub.phase === 'over' && g2.pub.winner === 'wolves', 'wolves win when they match the rest');
  assert(/take the village/.test(WW.narrate(g2.pub.log.slice(-1)[0], 'werewolf')), 'narrator announces the wolves’ win');

  const g3 = game(['wolf', 'seer', 'doctor', 'tanner', 'villager', 'villager']);
  everyoneElse(g3, []);
  WW.applyAction(g3.pub, g3.hidden, g3.settings, { type: 'continue' });
  WW.applyAction(g3.pub, g3.hidden, g3.settings, { type: 'startVote' });
  if (WW.isAlive(g3.pub, 'p4')) {
    WW.applyAction(g3.pub, g3.hidden, g3.settings, { type: 'quickVote', out: 'p4' });
    assert(g3.pub.phase === 'over' && g3.pub.winner === 'tanner' && g3.pub.result.tanner === 'p4', 'Tanner wins only by being voted out');
    assert(/Jester wanted to be voted out/.test(WW.narrate(g3.pub.log.slice(-1)[0], 'mafia', () => 'Sam')), 'Mafia theme: the Jester');
  } else throw new Error('tanner test setup: tanner taken at night');
  const g4 = game(['wolf', 'seer', 'doctor', 'tanner', 'villager', 'villager']);
  act(g4, 'p1', 'p4');
  everyoneElse(g4, ['p1']);
  assert(!WW.isAlive(g4.pub, 'p4') && g4.pub.phase === 'dawn', 'Tanner taken at night doesn’t win');

  const g5 = game(['wolf', 'seer', 'doctor', 'villager', 'villager']);
  WW.removePlayer(g5.pub, g5.hidden, g5.settings, 'p1');
  assert(g5.pub.phase === 'over' && g5.pub.winner === 'village', 'last wolf leaving → village wins');
  const g6 = game(['wolf', 'seer', 'doctor', 'villager', 'villager', 'villager']);
  act(g6, 'p2', 'p1');
  WW.removePlayer(g6.pub, g6.hidden, g6.settings, 'p3');
  assert(g6.pub.phase === 'night' && g6.pub.actedN === 1 && g6.pub.log.slice(-1)[0].t === 'left', 'leaver drops out quietly mid-night');
})();

// ---------- (e) P&P night parity ----------
(function () {
  const all = ['wolf', 'seer', 'doctor', 'villager', 'hunter', 'witch', 'tanner', 'bodyguard', 'wolf'];
  const g = game(all, { hunter: true, witch: true, tanner: true, bodyguard: true });
  const shapes = new Set();
  g.pub.players.forEach((id) => {
    const step = WW.nightStep(g.pub, g.hidden, g.settings, id);
    if (step.kind !== 'pick' || !step.prompt || !step.verb || !Array.isArray(step.candidates)) throw new Error('role without a night step: ' + step.role);
    if (step.role !== 'witch' && step.candidates.length < 2) throw new Error('night step with too few choices: ' + step.role);
    shapes.add(['kind', 'role', 'verb', 'prompt', 'candidates'].every((k) => k in step));
  });
  assert(shapes.size === 1 && shapes.has(true), 'P&P night: every role gets a same-shaped action step (villagers get the decoy “suspect”)');
  ['villager', 'hunter', 'tanner'].forEach((r) => {
    const id = g.pub.players[all.indexOf(r)];
    if (WW.nightStep(g.pub, g.hidden, g.settings, id).verb !== 'suspect') throw new Error(r + ' should get the decoy');
  });
  assert(true, 'Villager / Hunter / Tanner decoy: “Who do you suspect?”');
  everyoneElse(g, []);
  assert(g.pub.phase === 'dawn', 'the night resolves once everyone has acted');
  assert(Object.keys(g.hidden.suspicion).length > 0, 'decoy picks feed the village suspicion stat');
  const client = read('public/src/js/games/werewolf.js');
  const nightPath = client.slice(client.indexOf('// ---- pass night'), client.indexOf('// ---- pass dawn'));
  assert(nightPath.length > 400 && /NIGHT_HOLD_MS/.test(nightPath) && !/role === 'wolf' \?[^:]*MS|if \(step\.role[^)]*\)[^{]*setTimeout/.test(nightPath), 'P&P night: one fixed hold time for every role');
  assert(/Hide & pass/.test(nightPath) && /mountPassVote|mountPassCover/.test(nightPath), 'P&P night: “Hide & pass” after each player');
  assert(/coverWhenAway/.test(client), 'P&P covers the screen when the phone is put away / tab hidden');
})();

// ---------- (f) room ----------
const NOW = 1_700_000_000_000;
const uidOf = (ch) => ch.repeat(28);
/** Simulate an RTDB write + read: nulls / empty arrays / empty objects vanish, then hydrate. */
function rtdbTrip(room) {
  const strip = (v) => {
    if (Array.isArray(v)) {
      const out = v.map(strip).filter((x) => x !== undefined);
      return out.length ? out : undefined;
    }
    if (v && typeof v === 'object') {
      const o = {};
      Object.keys(v).forEach((k) => {
        const x = strip(v[k]);
        if (x !== undefined) o[k] = x;
      });
      return Object.keys(o).length ? o : undefined;
    }
    return v === null ? undefined : v;
  };
  return Party.hydrateRoom(strip(JSON.parse(JSON.stringify(room))));
}
function mkRoom(settings, n) {
  const host = uidOf('h');
  let room = Party.newRoom({ game: 'werewolf', uid: host, name: 'Host', settings, now: NOW });
  const all = [host];
  'abcdefghijklmnopqrs'.split('').slice(0, n - 1).forEach((ch, i) => {
    const u = uidOf(ch);
    Party.reduceRoom(room, u, 'join', { name: 'P' + ch }, NOW + i, Math.random);
    all.push(u);
  });
  return { room, host, all };
}
const sharedOf = (room) => JSON.stringify({ pub: room.pub, presence: room.presence });
function secretsSafe(room, label) {
  const s = room.server;
  const st = s.pub;
  if (st.phase === 'over') return;
  const shared = sharedOf(room);
  const liveState = JSON.stringify(Object.assign({}, room.pub, { state: Object.assign({}, room.pub.state, { log: [], nominations: {} }) }));
  if (/"hidden"|"seerLog"|"acts"|"wolfChat"|"deadChat"|"spectator"|"secrets"|"team"|"pack"|"potions"/.test(shared)) throw new Error(label + ': secret keys in shared state');
  st.players.forEach((id) => {
    const role = s.hidden.roles[id];
    if (WW.isAlive(st, id) && new RegExp('"' + id + '":"' + role + '"').test(shared)) throw new Error(label + ': a living player’s role in shared state');
    const a = s.hidden.acts[id];
    if (a && a.target && liveState.includes('"' + id + '":"' + a.target + '"')) throw new Error(label + ': a night choice in shared state');
    const v = st.phase === 'vote' && s.hidden.votes[id];
    if (v && liveState.includes('"' + id + '":"' + v + '"')) throw new Error(label + ': an uncounted vote in shared state');
  });
  s.chat.wolf.forEach((m) => {
    if (shared.includes(m.text)) throw new Error(label + ': wolf chat in shared state');
  });
  s.chat.dead.forEach((m) => {
    if (shared.includes(m.text)) throw new Error(label + ': spectator chat in shared state');
  });
  // secrets: each only knows its own role (+ the pack for wolves, everything for spectators)
  Object.keys(room.secrets).forEach((uid) => {
    const sec = room.secrets[uid];
    if (sec.role !== s.hidden.roles[uid]) throw new Error(label + ': secret is not the owner’s role');
    const txt = JSON.stringify(sec);
    if (!sec.spectator) {
      st.players.forEach((other) => {
        if (other === uid) return;
        const r = s.hidden.roles[other];
        if (sec.role === 'wolf' && r === 'wolf') return;
        if (new RegExp('"' + other + '":"' + r + '"').test(txt)) throw new Error(label + ': a secret names someone else’s role');
      });
      if (sec.role !== 'wolf' && (sec.wolves || sec.wolfChat || sec.pack)) throw new Error(label + ': non-wolf sees the pack');
      if (sec.role !== 'seer' && sec.seerLog) throw new Error(label + ': non-Seer sees Seer results');
    }
  });
}

(function () {
  let { room, host, all } = mkRoom({ hunter: true }, 8);
  const t = (d) => NOW + 1000 + d;
  let clock = 0;
  const op = (uid, name, args) => {
    clock += 10;
    const out = Party.reduceRoom(room, uid, name, args || {}, t(clock), seeded(clock));
    room = rtdbTrip(room);
    Object.keys(room.presence).forEach((id) => (room.presence[id] = { at: t(clock), online: true }));
    return out.result;
  };
  op(host, 'start', {});
  assert(room.pub.status === 'playing' && room.pub.state.phase === 'reveal' && Object.keys(room.secrets).length === 8, 'room deals: every player gets a private role card');
  secretsSafe(room, 'deal');
  const wolves = all.filter((id) => room.secrets[id].role === 'wolf');
  assert(wolves.length === 2 && wolves.every((w) => room.secrets[w].wolves.length === 2), 'wolves learn who the other wolves are');
  const nonWolf = all.find((id) => room.secrets[id].role === 'villager');
  assert(!room.secrets[nonWolf].wolves, 'villagers don’t learn the wolves');
  const rules = JSON.parse(read('firebase/database.rules.json'));
  const rg = rules.rules.games.werewolf && rules.rules.games.werewolf.$code;
  assert(!!rg && rg.secrets.$uid['.read'] === 'auth != null && auth.uid == $uid' && !rg.secrets.$uid['.write'] && !rg['.read'] && !rg.server, 'RTDB rules: secrets owner-only, server node unreadable (host reads nothing extra)');
  all.forEach((id) => op(id, 'seen'));
  assert(room.pub.state.phase === 'night' && room.pub.deadline, 'everyone has seen their card → night (server timer)');
  let err = null;
  try {
    op(nonWolf, 'chat', { channel: 'wolf', text: 'hello pack' });
  } catch (e) {
    err = e.code;
  }
  assert(err === 'not_allowed', 'only wolves can use the wolf chat');
  op(wolves[0], 'chat', { channel: 'wolf', text: 'zqxj take the loud one' });
  assert(room.secrets[wolves[1]].wolfChat.some((m) => /zqxj/.test(m.text)) && !JSON.stringify(room.secrets[nonWolf]).includes('zqxj'), 'wolf chat reaches wolves only');
  secretsSafe(room, 'wolf chat');
  const seer = all.find((id) => room.secrets[id].role === 'seer');
  const doctor = all.find((id) => room.secrets[id].role === 'doctor');
  const res = op(seer, 'night', { target: wolves[0] });
  assert(res.team === 'wolves' && room.secrets[seer].seerLog[0].team === 'wolves', 'Seer result goes to the Seer only (response + own secret)');
  const victim = all.find((id) => id !== seer && id !== doctor && room.secrets[id].role !== 'wolf' && room.secrets[id].role !== 'hunter');
  op(wolves[0], 'night', { target: victim });
  secretsSafe(room, 'one wolf picked');
  assert(room.secrets[wolves[1]].pack[wolves[0]] === victim, 'wolves see each other’s picks (private wolf vote)');
  op(wolves[1], 'night', { target: victim });
  op(doctor, 'night', { target: doctor });
  secretsSafe(room, 'mid-night');
  assert(room.pub.state.actedN === 4 && !('acted' in room.pub.state), 'shared state shows only how many have acted');
  // the rest don't act — the timer resolves the night (missed action = no action)
  op(host, 'tick', {});
  clock = room.pub.deadline - NOW - 1000 + 5;
  op(host, 'tick', {});
  assert(room.pub.state.phase === 'dawn' && !WW.isAlive(room.pub.state, victim), 'server resolves the night on the timer');
  secretsSafe(room, 'dawn');
  assert(room.secrets[victim].spectator && room.secrets[victim].spectator.roles[wolves[0]] === 'wolf', 'eliminated players become spectators who see everything');
  err = null;
  try {
    op(victim, 'chat', { channel: 'day', text: 'it was them!' });
  } catch (e) {
    err = e.code;
  }
  assert(err === 'not_allowed', 'spectators can’t talk to the living');
  op(victim, 'chat', { channel: 'dead', text: 'vvkk spooky up here' });
  assert(room.secrets[victim].deadChat.length === 1 && !JSON.stringify(room.secrets[seer]).includes('vvkk'), 'spectator chat is separate');
  secretsSafe(room, 'spectator chat');
  op(host, 'advance', {});
  assert(room.pub.state.phase === 'day', 'host moves on from the morning');
  op(seer, 'chat', { channel: 'day', text: 'I checked someone…' });
  assert(room.pub.state.chat.length === 1, 'day chat is live for the living');
  const d0 = room.pub.deadline;
  op(host, 'extend', {});
  assert(room.pub.deadline === d0 + 60000, 'host can extend discussion');
  err = null;
  try {
    op(all.find((id) => id !== room.pub.host), 'extend', {});
  } catch (e) {
    err = e.code;
  }
  assert(err === 'host_only', 'only the host extends');
  op(seer, 'nominate', { target: wolves[0] });
  op(host, 'advance', {});
  assert(room.pub.state.phase === 'vote' && room.pub.state.candidates.join() === wolves[0], 'host skips to the vote');
  const living = room.pub.state.alive.slice();
  op(living[0], 'vote', { target: wolves[0] });
  secretsSafe(room, 'voting');
  assert(room.secrets[living[0]].myVote.target === wolves[0], 'your own vote is in your secret (refresh-safe)');
  // wolves[1] disconnects: rejoin restores the role privately
  const role1 = room.secrets[wolves[1]].role;
  const joined = op(wolves[1], 'join', { name: 'x' });
  assert(joined.rejoined && room.secrets[wolves[1]].role === role1, 'rejoin restores the role privately');
  living.slice(1).forEach((id) => {
    if (id !== wolves[1]) op(id, 'vote', { target: wolves[0] });
  });
  // the absent wolf's vote → abstain on the timer
  clock = room.pub.deadline - NOW - 1000 + 5;
  op(host, 'tick', {});
  assert(room.pub.state.phase === 'verdict' && !WW.isAlive(room.pub.state, wolves[0]), 'missed vote = abstain; majority eliminates');
  const v = room.pub.state.log.filter((e) => e.t === 'vote').slice(-1)[0];
  assert(v.role === 'wolf', 'eliminated player’s role revealed (default)');
  // late joiner spectates
  const late = uidOf('z');
  const lj = op(late, 'join', { name: 'Late' });
  assert(lj.pending && !room.secrets[late], 'late joiner spectates (no role) until the next game');
  // host migration
  Object.keys(room.presence).forEach((id) => (room.presence[id] = { at: t(clock), online: id !== host }));
  clock += 60000;
  const saveTrip = rtdbTrip;
  Party.reduceRoom(room, all[1], 'tick', {}, t(clock), Math.random);
  room = saveTrip(room);
  assert(room.pub.host !== host, 'host migrates when the host drops');
  const newHost = room.pub.host;
  Object.keys(room.presence).forEach((id) => (room.presence[id] = { at: t(clock), online: true }));
  op(newHost, 'advance', {});
  assert(room.pub.state.phase === 'night' || room.pub.state.phase === 'hunter', 'new host keeps the game moving');
  // play out: everyone acts each night, vote out the last wolf
  let guard = 0;
  while (room.pub.state.phase !== 'over' && guard++ < 40) {
    const st = room.pub.state;
    if (st.phase === 'night') {
      st.alive.forEach((id) => {
        if (room.pub.state.phase !== 'night') return;
        const sec = room.secrets[id];
        const step = sec.step;
        if (!step) return;
        const target = step.verb === 'target' ? step.candidates.find((c) => c !== seer) || step.candidates[0] : step.candidates[0] || null;
        op(id, 'night', { target });
      });
      secretsSafe(room, 'night ' + st.night);
    } else if (st.phase === 'dawn' || st.phase === 'verdict') op(room.pub.host, 'advance', {});
    else if (st.phase === 'hunter') op(st.hunter, 'shoot', { target: null });
    else if (st.phase === 'day') op(room.pub.host, 'advance', {});
    else if (st.phase === 'vote') {
      const wolf = room.pub.state.alive.find((id) => room.server.hidden.roles[id] === 'wolf');
      room.pub.state.alive.slice().forEach((id) => {
        if (room.pub.state.phase === 'vote') op(id, 'vote', { target: room.pub.state.candidates.indexOf(wolf) >= 0 ? wolf : 'skip' });
      });
    }
  }
  assert(room.pub.state.phase === 'over' && room.pub.over && room.pub.state.result.roles, 'room game plays to the end; roles + recap revealed');
  const winners = Object.keys(room.pub.scores).filter((id) => room.pub.scores[id] > 0);
  assert(winners.length > 0, 'winners score a point');
  op(room.pub.host, 'start', {});
  assert(room.pub.state.phase === 'reveal' && room.secrets[late] && room.pub.roundNo === 1, 'next game: the late joiner is dealt in');
})();

(function () {
  // Secret payloads, Witch/Mafia/Tanner in a room; leaver mid-vote
  let { room, host, all } = mkRoom({ witch: true, tanner: true, bodyguard: true, theme: 'mafia', reveal: false }, 10);
  let clock = 0;
  const op = (uid, name, args) => {
    clock += 10;
    const out = Party.reduceRoom(room, uid, name, args || {}, NOW + 5000 + clock, seeded(clock + 7));
    room = rtdbTrip(room);
    Object.keys(room.presence).forEach((id) => (room.presence[id] = { at: NOW + 5000 + clock, online: true }));
    return out.result;
  };
  op(host, 'start', {});
  assert(room.pub.state.theme === 'mafia' && room.pub.settings.theme === 'mafia', 'room theme: Mafia');
  all.forEach((id) => op(id, 'seen'));
  const witch = all.find((id) => room.secrets[id].role === 'witch');
  const wolves = all.filter((id) => room.secrets[id].role === 'wolf');
  assert(room.secrets[witch].potions.save && room.secrets[witch].victim == null, 'Witch: potions in her secret, no victim yet');
  const target = all.find((id) => room.secrets[id].role === 'villager');
  wolves.forEach((w) => op(w, 'night', { target }));
  assert(room.secrets[witch].victim === target && !JSON.stringify(room.pub).includes('"victim"'), 'Witch sees the victim privately');
  op(witch, 'night', { save: true });
  secretsSafe(room, 'witch');
  all.forEach((id) => {
    if (room.pub.state.phase === 'night' && room.secrets[id].step && !room.secrets[id].myNight) op(id, 'night', { target: room.secrets[id].step.candidates[0] || null });
  });
  assert(room.pub.state.phase === 'dawn' && WW.isAlive(room.pub.state, target), 'room: Witch save');
  op(host, 'advance', {});
  op(host, 'advance', {});
  const leaver = room.pub.state.alive.find((id) => id !== host && room.server.hidden.roles[id] !== 'wolf');
  op(leaver, 'leave');
  assert(!WW.isAlive(room.pub.state, leaver) && room.pub.state.log.slice(-1)[0].t === 'left', 'leaver is out of the game');
  secretsSafe(room, 'after leave, reveal off');
  assert(!room.pub.state.log.some((e) => e.role), 'reveal off: no roles in the public log');
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
const kit = read('public/src/js/games/party-kit.js');
const client = read('public/src/js/games/werewolf.js');
const gotd = require(path.join(root, 'server-lib/game-of-day.js'));
const id = 'werewolf';
assert(sandbox.isRosterGameId(id) && sandbox.rosterGenre(id) === 'party' && sandbox.isPartyKitGame(id), 'on roster in the Party section (party kit)');
const grad = sandbox.getGameGraduation(id);
assert(grad.grade === 'party' && grad.stakes === false && !sandbox.stakesEnabledForGame(id) && !sandbox.isLiveCapable(id), 'Party grade, stakes:false, no Live');
const row = ds.match(/werewolf: \{ primary: '(#[0-9A-F]{6})'[^}]*mark: M\.werewolf/);
assert(!!row && /\n    werewolf:\r?\n/.test(ds), 'GAME_IDENTITY row + SVG mark');
const others = ['imposter', 'rajamantri', 'charades', 'mostlikely'].map((g2) => (ds.match(new RegExp(g2 + ": \\{ primary: '(#[0-9A-F]{6})'")) || [])[1]);
assert(others.indexOf(row[1]) < 0, 'own identity colour');
assert(/werewolf: \[/.test(gameUi) && /werewolf: '#/.test(gameUi), 'how-to tips + accent');
assert(/GROUP_PARTY_IDS = \[[^\]]*'werewolf'/.test(registry), 'chat / Baithak group picker');
assert(gotd.GAME_GENRE_BY_ID[id] === 'party', 'game-of-day genre');
assert(/werewolf: \['games\/werewolf-core\.js'\]/.test(kit), 'kit lazy-loads the core');
assert(/renderPending/.test(kit), 'kit: games can render their own late-joiner / spectator screen');
assert(
  /data-party-lazy src="\/src\/js\/games\/werewolf-core\.js(\?v=\w+)?"/.test(html) &&
    /<script src="\/src\/js\/games\/werewolf\.js(\?v=\w+)?"/.test(html) &&
    html.indexOf('/src/js/games/party-kit.js') < html.indexOf('/src/js/games/werewolf.js'),
  'index.html: lazy core + client after the kit'
);
assert((client.match(/registerGame\(\{\s*id: '/g) || []).length === 1 && /registerGame\(\{\s*id: 'werewolf'/.test(client) && /genre: 'party'/.test(client) && /chatGroup: true/.test(client), 'registered once as a party game');
const passPath = client.slice(client.indexOf('PASS & PLAY'), client.indexOf('======================= ROOM'));
assert(passPath.length > 1000 && !/apiFetch|rtdb|createRoom|roomCall|act\(/.test(passPath), 'Pass & Play path makes no network calls (offline, signed out)');
assert(/speechSynthesis/.test(client) && /chaupaal_werewolf_voice/.test(client) && /Sound\.play/.test(client) && /quietMode|muted/.test(client), 'narrator voice (Web Speech) + mute + phase sounds');
assert(/t\('werewolf\./.test(client), 'narration + labels go through i18n t()');
assert(/Best with 7\+/.test(client) && /balance/.test(client) && /Advanced/.test(client), 'setup: “Best with 7+”, balance meter, Advanced section');
assert(/Role guide/.test(client) && /How to play · 20 seconds/.test(client) && /glossaryHtml/.test(client), 'how-to: short version + 20-second card + role glossary');
assert(/shareLine/.test(client) && /recap/.test(client) && /suspicion|Most suspected/.test(client), 'end screen: roles, recap timeline, suspicion, share');
assert(!/stake|chips/i.test(client.replace(/never chips/gi, '')), 'no stakes / chips');
assert(/require\('\.\.\/public\/src\/js\/games\/werewolf-core\.js'\)/.test(read('server-lib/werewolf-engine.js')) && /werewolf: createWerewolfAdapter/.test(read('server-lib/party-deal.js')), 'server shares the client core; adapter registered');
assert(/ww-night/.test(read('public/src/styles/dangal.css')) && /ww-day/.test(read('public/src/styles/dangal.css')), 'night / day visual shift');
const pkg = JSON.parse(read('package.json'));
assert(/test-dangal-h1-werewolf\.js/.test(pkg.scripts.test || ''), 'npm test runs H1');
const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js = 12 (got ${apiCount})`);

console.log('\nDangal H1 Werewolf checks passed.');
