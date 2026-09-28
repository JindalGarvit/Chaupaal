#!/usr/bin/env node
/**
 * Dangal P10 — Street Cricket laws, scoring engine and server authority: legal balls with wides /
 * no-balls, free hit, dismissal law checks, strike rotation, innings end, result wording, Super
 * Over, preset tweaks, hand-computed stats, the server ignoring client-claimed outcomes, a full
 * server-resolved Standard match, replay determinism and wiring.
 *   node scripts/test-dangal-p10-cricket-engine.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error('FAIL:', msg);
  } else console.log('ok:', msg);
}
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const clone = (x) => JSON.parse(JSON.stringify(x));

const CE = require(path.join(root, 'public/src/js/games/cricket-engine.js'));
const SC = require(path.join(root, 'server-lib/cricket-engine.js'));

const duo = (o) => CE.createMatch(Object.assign({ format: 'superquick', sides: [{ pid: 'a', name: 'Ava' }, { pid: 'b', name: 'Ben' }] }, o || {}));
const lastBall = (st) => {
  const inn = CE.current(st);
  return inn.balls[inn.balls.length - 1];
};
const B = (runs, more) => Object.assign({ t: 'ball', runs, del: 'medium', shot: 'push' }, more || {});
const WD = (runs) => ({ t: 'ball', extra: 'wd', runs: runs || 0, del: 'quick' });
const NB = (runs, more) => Object.assign({ t: 'ball', extra: 'nb', runs: runs || 0, del: 'quick', shot: 'push' }, more || {});
const OUT = (kind, more) => Object.assign({ t: 'ball', runs: 0, out: kind, del: 'medium', shot: 'push' }, more || {});

// ---------------------------------------------------------------- formats + laws table
{
  assert(CE.FORMATS.superquick.overs === 1 && CE.FORMATS.superquick.wickets === 1, 'Super Quick is 1 over / 1 wicket');
  assert(CE.FORMATS.quick.overs === 2 && CE.FORMATS.quick.wickets === 2, 'Quick is 2/2');
  assert(CE.FORMATS.standard.overs === 5 && CE.FORMATS.standard.wickets === 3, 'Standard is 5/3');
  assert(CE.FORMATS.long.overs === 10 && CE.FORMATS.long.wickets === 5, 'Long is 10/5');
  assert(CE.PRESETS.standard.rated && !CE.PRESETS.gully.rated && !CE.PRESETS.backyard.rated, 'only Standard is rated');
  const laws = CE.lawsTable();
  assert(laws.source === 'Based on the MCC Laws of Cricket, adapted for street play', 'attribution string');
  const col = (id) => laws.presets.find((p) => p.id === id);
  assert(col('standard').lbw && !col('gully').lbw && !col('backyard').lbw, 'LBW only in Standard');
  assert(col('gully').sixOut && col('gully').lastManStands && col('gully').bounceCatch === 'onehand', 'Gully: six and out, last man stands, one tip one hand');
  assert(col('backyard').firstBallSafe && col('backyard').tipAndRun && col('backyard').bounceCatch === 'bounce', 'Backyard: first-ball immunity, tip and run, one-bounce catch');
  assert(!/official|\bICC\b/i.test(JSON.stringify(laws)), 'laws table claims nothing official');
}

// ---------------------------------------------------------------- legal balls, wides, no-balls + hand-computed stats
{
  // Ava bats: wide, FOUR, no-ball + 1, (free hit) "bowled" → not out, SIX, 1, 2, dot → 6 legal balls.
  const log = [WD(0), B(4, { dir: 10, dist: 1 }), NB(1), OUT('bowled'), B(6, { dir: 0, dist: 1.15 }), B(1), B(2), B(0)];
  const st = CE.replay(duo(), log);
  const card = CE.scorecard(st);
  const i1 = card.innings[0];
  assert(st.innings.length === 2 && st.innings[0].end === 'overs', 'innings ends after 6 legal balls (wide + no-ball re-bowled)');
  assert(st.innings[0].legal === 6 && st.innings[0].balls.length === 8, '8 deliveries, 6 legal');
  assert(i1.total.runs === 16 && i1.total.wkts === 0, 'total 16/0 (1 wd + 4 + 1nb+1 + 0 + 6 + 1 + 2 + 0)');
  assert(i1.extras.wd === 1 && i1.extras.nb === 1 && i1.extras.total === 2, 'extras: wd 1, nb 1');
  const ava = i1.batting[0];
  assert(ava.r === 14 && ava.b === 7 && ava.f4 === 1 && ava.f6 === 1 && ava.sr === 200, 'Ava 14 (7) 4s 1 6s 1 SR 200.0 — a no-ball is a ball faced, a wide is not');
  const ben = i1.bowling[0];
  assert(ben.o === '1' && ben.m === 0 && ben.r === 16 && ben.w === 0 && ben.econ === 16 && ben.dots === 2 && ben.wd === 1 && ben.nb === 1, 'Ben 1-0-16-0 econ 16.00, 2 dots, 1 wd, 1 nb');
  assert(i1.rr === 16 && i1.boundaryPct === 62.5 && i1.dotPct === 33.3, 'RR 16.00, boundary % 62.5, dot % 33.3');
  assert(st.innings[0].balls[3].saved === 'free_hit' && !st.innings[0].balls[3].out, 'bowled on the free hit is not out');
  assert(st.innings[0].balls[0].text === '0.1: Wide outside off, 1 extra', 'wide text is deterministic');
  assert(/No-ball, 1 extra \+ 1 run off the bat · free hit next/.test(st.innings[0].balls[2].text), 'no-ball text flags the free hit');
  assert(st.innings[0].balls[1].no === '0.1' && st.innings[0].balls[2].no === '0.2' && st.innings[0].balls[3].no === '0.2', 'extras show the upcoming ball number');
  const tokens = st.innings[0].overList[0].balls.map((t) => t.k).join(',');
  assert(tokens === 'wd,four,nb,dot,six,run,run,dot', 'this-over tokens: ' + tokens);
  assert(st.innings[1].target === 17, 'target is 17');

  // Chase: SIX, SIX → need 5 off 4 (RRR 7.5), FOUR, 1 → won with 2 balls left.
  const mid = CE.replay(duo(), log.concat([B(6), B(6)]));
  const strip = CE.liveStrip(mid);
  assert(strip.need === 5 && strip.ballsLeft === 4 && strip.rrr === 7.5, 'live strip: need 5 off 4, RRR 7.50');
  const won = CE.replay(duo(), log.concat([B(6), B(6), B(4), B(1)]));
  assert(won.result && won.result.text === 'Ben won by 1 wicket (2 balls left)', 'chase result wording: ' + (won.result && won.result.text));
  const byRuns = CE.replay(duo(), log.concat([B(6), B(4), OUT('bowled')]));
  assert(byRuns.result && byRuns.result.text === 'Ava won by 6 runs' && byRuns.innings[1].end === 'allout', 'defended total: "Ava won by 6 runs"');
  const lastBallWin = CE.replay(duo(), log.concat([B(0), B(0), B(6), B(6), B(0), B(6)]));
  assert(lastBallWin.result.text === 'Ben won by 1 wicket (off the last ball)', 'last-ball finish wording');
  const share = CE.shareSummary(won);
  assert(share.lines[0] === 'Ava 16/0 (1 ov)' && share.lines[1] === 'Ben 17/0 (0.4 ov)' && /Street Cricket/.test(share.text), 'share summary lines');
  assert(CE.topPerformer(won).name === 'Ben', 'top performer: Ben (17 runs)');

  // Maiden: six dots.
  const maiden = CE.replay(duo(), [B(0), B(0), B(0), B(0), B(0), B(0)]);
  assert(CE.scorecard(maiden).innings[0].bowling[0].m === 1, 'six dots = a maiden');
  // Byes / leg-byes go to extras, not the bowler.
  const byes = CE.replay(duo(), [{ t: 'ball', extra: 'b', runs: 2 }, { t: 'ball', extra: 'lb', runs: 1 }]);
  const bc = CE.scorecard(byes).innings[0];
  assert(bc.extras.b === 2 && bc.extras.lb === 1 && bc.bowling[0].r === 0 && bc.batting[0].b === 2 && bc.batting[0].r === 0, 'byes and leg-byes: extras, a ball faced, not on the bowler');
  // Penalty runs + abandoned.
  const pen = CE.replay(duo(), [{ t: 'pen', runs: 5 }]);
  assert(pen.innings[0].runs === 5 && pen.innings[0].extras.pen === 5 && pen.innings[0].legal === 0, 'penalty runs: 5 to the batting side, no ball used');
  const ab = CE.replay(duo(), [B(1), { t: 'end', reason: 'abandoned' }]);
  assert(ab.result.kind === 'noresult' && ab.result.text === 'Match abandoned · no result', 'abandoned → no result');
}

// ---------------------------------------------------------------- dismissal law checks
{
  const std = CE.makeRules('standard');
  const allowed = (kind, ctx) => CE.dismissalAllowed(kind, Object.assign({ rules: std }, ctx)).ok;
  assert(!allowed('lbw', { extra: 'nb' }) && !allowed('stumped', { extra: 'nb' }) && !allowed('bowled', { extra: 'nb' }), 'no LBW / stumping / bowled off a no-ball');
  assert(allowed('runout', { extra: 'nb' }), 'run out stands off a no-ball');
  assert(!allowed('caught', { freeHit: true }) && !allowed('lbw', { freeHit: true }) && allowed('runout', { freeHit: true }), 'free hit: only a run out');
  assert(allowed('stumped', { extra: 'wd' }) && allowed('hitwicket', { extra: 'wd' }) && !allowed('bowled', { extra: 'wd' }) && !allowed('lbw', { extra: 'wd' }), 'off a wide: stumped / hit wicket / run out only');
  assert(!allowed('caught', { extra: 'b' }) && allowed('stumped', { extra: 'b' }), 'off a bye: no catch');
  const nbLbw = CE.replay(duo(), [NB(0, { out: 'lbw' })]);
  assert(nbLbw.innings[0].wkts === 0 && nbLbw.innings[0].balls[0].saved === 'no_ball', 'LBW off a no-ball is saved');
  const nbSt = CE.replay(duo(), [NB(0, { out: 'stumped' })]);
  assert(nbSt.innings[0].wkts === 0, 'stumped off a no-ball is saved');
  const fhCarry = CE.replay(duo(), [NB(0), WD(0), OUT('caught')]);
  assert(fhCarry.innings[0].wkts === 0 && fhCarry.innings[0].balls[2].freeHit, 'free hit carries through a wide');
  const fhUsed = CE.replay(duo({ format: 'quick' }), [NB(0), B(1), OUT('bowled')]);
  assert(fhUsed.innings[0].wkts === 1, 'free hit is used up by the next legal ball');
  const fhRunOut = CE.replay(duo(), [NB(0), OUT('runout', { runs: 1 })]);
  assert(fhRunOut.innings[0].wkts === 1 && fhRunOut.innings[0].runs === 2, 'run out on the free hit stands (runs completed count)');
  const stWide = CE.replay(duo(), [{ t: 'ball', extra: 'wd', runs: 0, out: 'stumped' }]);
  assert(stWide.innings[0].wkts === 1 && stWide.innings[0].runs === 1 && stWide.innings[0].legal === 0, 'stumped off a wide: out, 1 extra, not a legal ball');
  const caughtRuns = CE.replay(duo(), [OUT('caught', { runs: 2 })]);
  assert(caughtRuns.innings[0].runs === 0, 'runs off a caught ball do not count');
  const noLbw = CE.replay(duo({ preset: 'gully' }), [OUT('lbw')]);
  assert(noLbw.innings[0].wkts === 0 && noLbw.innings[0].balls[0].saved === 'no_lbw', 'Gully: no LBW');
}

// ---------------------------------------------------------------- strike rotation, catches, FoW, partnerships (pair crease)
{
  const cfg = CE.createMatch({
    overs: 2,
    wickets: 2,
    crease: 'pair',
    sides: [
      { name: 'Reds', batters: [{ id: 'a1', name: 'A1' }, { id: 'a2', name: 'A2' }, { id: 'a3', name: 'A3' }] },
      { name: 'Blues', batters: [{ id: 'b1', name: 'B1' }, { id: 'b2', name: 'B2' }, { id: 'b3', name: 'B3' }], bowlers: [{ id: 'x', name: 'Xan' }, { id: 'y', name: 'Yul' }] },
    ],
  });
  const log = [B(1), B(2), WD(1), OUT('caught'), B(4), B(1), B(0)];
  const names = [];
  for (let k = 1; k <= log.length; k++) names.push(CE.striker(CE.replay(cfg, log.slice(0, k))).name);
  assert(names.join(',') === 'A2,A2,A1,A3,A3,A2,A3', 'strike: odd runs rotate, wide +1 rotates, new batter after a catch, ends change at the over: ' + names.join(','));
  const st = CE.replay(cfg, log);
  assert(CE.bowlerNow(st).name === 'Yul', 'bowler changes at the end of the over');
  const c = CE.scorecard(st).innings[0];
  assert(c.fow[0].text === '1-5 (A1, 0.3 ov)', 'fall of wickets: ' + c.fow[0].text);
  assert(c.partnerships.length === 2 && c.partnerships[0].runs === 5 && c.partnerships[0].balls === 3 && c.partnerships[1].runs === 5 && c.partnerships[1].balls === 3, 'partnerships 5 (3) and 5 (3)');
  const by = (n) => c.batting.find((b) => b.name === n);
  assert(by('A1').r === 1 && by('A1').b === 2 && by('A1').how === 'c b Xan', 'A1 1 (2), c b Xan');
  assert(by('A2').r === 2 && by('A2').b === 2 && by('A3').r === 5 && by('A3').b === 2, 'A2 2 (2), A3 5 (2)');
  assert(c.bowling[0].r === 10 && c.bowling[0].w === 1 && c.bowling[0].econ === 10, 'Xan 1-0-10-1');
  assert(c.projected === 20, 'projected score 20 (10 off 6 balls, 2 overs)');
  const ro = CE.replay(cfg, log.concat([OUT('runout', { runs: 1, outWho: 'nonstriker' })]));
  assert(ro.innings[0].end === 'allout' && ro.innings[0].batters.find((b) => b.name === 'A2').out, 'run out of the non-striker ends the innings at the wicket limit');
  const ch = CE.charts(st);
  assert(ch.worm[0].points.length === 8 && ch.manhattan[0].overs[0].runs === 10 && ch.manhattan[0].overs[0].wkts === 1, 'worm + Manhattan from the log');
}

// ---------------------------------------------------------------- ties: Super Over, shared, boundary count
{
  const i1 = [B(4), B(6), B(6), B(0), B(0), B(0)]; // Ava 16: two boundaries? 4,6,6 = 3
  const tie = [B(6), B(6), B(4), B(0), B(0), B(0)]; // Ben 16: 3 boundaries
  const so = CE.replay(duo(), i1.concat(tie));
  assert(!so.result && so.innings[2].super && so.innings[2].bat === 1, 'tie → Super Over, chasing side (Ben) bats first');
  assert(so.innings[2].wickets === 1, 'Super Over wickets = min(2, format wickets)');
  const soWin = CE.replay(duo(), i1.concat(tie, [B(6), OUT('bowled'), B(6), B(1)]));
  assert(soWin.result && soWin.result.text === 'Match tied · Ava won the Super Over', 'Super Over result: ' + (soWin.result && soWin.result.text));
  const shared = CE.replay(duo({ tie: 'shared' }), i1.concat(tie));
  assert(shared.result.kind === 'tie' && shared.result.text === 'Match tied', 'shared tie');
  const i1b = [B(4), B(6), B(2), B(4), B(0), B(0)]; // Ava 16 with 3 boundaries
  const tie4 = [B(6), B(4), B(4), B(2), B(0), B(0)]; // Ben 16 with 3 boundaries
  const level = CE.replay(duo({ tie: 'boundaries' }), i1b.concat(tie4));
  assert(level.result.kind === 'tie' && /boundaries level 3–3/.test(level.result.text), 'boundary count level → tie');
  const bc = CE.replay(duo({ tie: 'boundaries' }), [B(4), B(4), B(4), B(4), B(0), B(0)].concat(tie));
  assert(bc.result.winner === 0 && bc.result.text === 'Scores level · Ava won on boundary count (4–3)', 'boundary count decides: ' + bc.result.text);
  // Super Over tied twice → boundary count (main innings only).
  const zeros = [B(0), B(0), B(0), B(0), B(0), B(0)];
  const twice = CE.replay(duo(), i1.concat(tie, [B(6), OUT('bowled'), B(6), OUT('bowled')], zeros, zeros));
  assert(twice.innings.filter((x) => x.super).length === 4, 'a tied Super Over is replayed once');
  assert(twice.innings[4].bat === 0, 'second Super Over: the side that batted second bats first');
  assert(twice.result && twice.result.kind === 'tie' && /^Super Overs tied · /.test(twice.result.text), 'two tied Super Overs → boundary count: ' + (twice.result && twice.result.text));
}

// ---------------------------------------------------------------- presets
{
  const gully = duo({ preset: 'gully' });
  const six = CE.replay(gully, [OUT('sixout', { runs: 6 })]);
  assert(six.innings[0].wkts === 1 && six.innings[0].runs === 0 && six.innings[0].batters[0].out.kind === 'sixout', 'Gully six and out: out, no runs');
  const sixOff = CE.replay(duo({ preset: 'gully', toggles: { sixOut: false } }), [OUT('sixout', { runs: 6 })]);
  assert(sixOff.innings[0].wkts === 0 && sixOff.innings[0].runs === 6, 'six and out toggled off: a six is six');
  const sixFh = CE.replay(gully, [NB(0), OUT('sixout', { runs: 6 })]);
  assert(sixFh.innings[0].wkts === 0 && sixFh.innings[0].runs === 7, 'free hit protects against six and out (scores 6)');
  const sixStd = CE.replay(duo(), [OUT('sixout', { runs: 6 })]);
  assert(sixStd.innings[0].wkts === 0 && sixStd.innings[0].runs === 6, 'Standard: no six and out');

  const oth = CE.replay(gully, [OUT('bouncecatch')]);
  assert(oth.innings[0].wkts === 1 && oth.innings[0].batters[0].out.label === 'Caught one tip one hand', 'Gully one tip one hand is out');
  const othStd = CE.replay(duo(), [OUT('bouncecatch')]);
  assert(othStd.innings[0].wkts === 0 && othStd.innings[0].balls[0].saved === 'rule_off', 'Standard: a bounce catch is not out');

  assert(gully.rules.lastManStands && CE.replay(gully, []).innings[0].limit === 2, 'last man stands: one more wicket before all out');
  const lms = CE.replay(gully, [OUT('bowled'), B(2)]);
  assert(!lms.innings[0].complete && lms.innings[0].runs === 2 && lms.innings[0].nonStriker === -1, 'last man bats on alone');
  const lmsOff = duo({ preset: 'gully', toggles: { lastManStands: false } });
  assert(CE.replay(lmsOff, []).innings[0].limit === 1, 'last man stands toggled off');

  const yard = duo({ preset: 'backyard' });
  const first = CE.replay(yard, [OUT('bowled'), OUT('bowled')]);
  assert(first.innings[0].balls[0].saved === 'first_ball' && first.innings[0].wkts === 1, 'Backyard: can’t be out first ball, out the second');
  const firstWide = CE.replay(yard, [WD(0), OUT('bowled')]);
  assert(firstWide.innings[0].wkts === 0, 'a wide is not the first ball faced');
  const firstStd = CE.replay(duo(), [OUT('bowled')]);
  assert(firstStd.innings[0].wkts === 1, 'Standard: out first ball is out');

  const tip = CE.replay(yard, [B(0, { contact: true })]);
  assert(tip.innings[0].runs === 1 && /tip and run/.test(tip.innings[0].balls[0].text), 'tip and run: a touched dot becomes a run');
  const tipMiss = CE.replay(yard, [B(0, { contact: false })]);
  assert(tipMiss.innings[0].runs === 0, 'tip and run: no touch, no run');
  const tipOff = CE.replay(duo({ preset: 'backyard', toggles: { tipAndRun: false } }), [B(0, { contact: true })]);
  assert(tipOff.innings[0].runs === 0, 'tip and run toggled off');
  const bounce = CE.replay(yard, [B(1), OUT('bouncecatch')]);
  assert(bounce.innings[0].wkts === 1 && bounce.innings[0].batters[0].out.label === 'Caught on the bounce', 'Backyard one-bounce catch');
  const bounceOff = CE.replay(duo({ preset: 'backyard', toggles: { bounceCatch: false } }), [B(1), OUT('bouncecatch')]);
  assert(bounceOff.innings[0].wkts === 0, 'one-bounce catch toggled off');

  let sawBounce = 0;
  let sawSixOut = 0;
  for (let s = 1; s < 4000; s++) {
    const e = CE.resolveBall({ delivery: 'medium', shot: 'loft', timing: s % 2 ? 'perfect' : 'early', rules: gully.rules }, s);
    if (e.out === 'bouncecatch') sawBounce++;
    if (e.out === 'sixout') sawSixOut++;
    if (e.runs === 6 && !e.out && !e.extra) {
      assert(false, 'Gully resolver produced a six without six and out');
      break;
    }
  }
  assert(sawBounce > 0 && sawSixOut > 0, 'Gully resolver proposes one tip one hand and six and out (' + sawBounce + ' / ' + sawSixOut + ')');
}

// ---------------------------------------------------------------- gameplay hooks + determinism
{
  const a = CE.resolveBall({ delivery: 'quick', shot: 'loft', timing: 'perfect', rules: CE.makeRules('standard') }, 12345);
  const b = CE.resolveBall({ delivery: 'quick', shot: 'loft', timing: 'perfect', rules: CE.makeRules('standard') }, 12345);
  assert(JSON.stringify(a) === JSON.stringify(b), 'resolveBall: same seed → same ball');
  const counts = { wd: 0, nb: 0, out: 0 };
  for (let s = 1; s <= 5000; s++) {
    const e = CE.resolveBall({ delivery: 'medium', shot: 'push', timing: 'perfect', rules: CE.makeRules('standard') }, s);
    if (e.extra === 'wd') counts.wd++;
    if (e.extra === 'nb') counts.nb++;
    if (e.out) counts.out++;
  }
  assert(counts.wd > 100 && counts.wd < 280 && counts.nb > 50 && counts.nb < 180, 'wide / no-ball rates near the delivery hooks (' + counts.wd + ' wd, ' + counts.nb + ' nb of 5000)');
  assert(CE.resolveStreetBall(CE.DELIVERIES.medium, 'miss', 'push', 0.5).code === 'miss_window', 'migrated resolver: a miss is beaten');
  assert(CE.resolveStreetBall(CE.DELIVERIES.medium, 'perfect', 'defend', 0.01).reason === 'caught', 'migrated resolver: defend perfect catch band');
  assert(CE.timingFromOffset('medium', 420 + 500) === 'perfect' && CE.timingFromOffset('medium', 100) === 'early' && CE.timingFromOffset('medium', null) === 'miss', 'tap offset → timing');

  // Random full match: replay twice → identical state.
  const cfg = CE.createMatch({ format: 'standard', sides: [{ pid: 'a', name: 'Ava' }, { pid: 'b', name: 'Ben' }] });
  const log = [];
  let s = 7;
  for (let k = 0; k < 400; k++) {
    const st = CE.replay(cfg, log);
    if (st.result) break;
    const inn = CE.current(st);
    const del = CE.aiDelivery({ balls: inn.legal }, s++);
    const bat = CE.aiBat({ delivery: del, level: 'medium', rrr: CE.requiredRate(inn) }, s++);
    log.push(CE.resolveBall({ delivery: del, shot: bat.shot, timing: bat.timing, rules: cfg.rules, freeHit: inn.freeHit, firstBall: CE.firstBallFor(st) }, s++));
  }
  const r1 = CE.replay(cfg, clone(log));
  const r2 = CE.replay(clone(cfg), clone(log));
  assert(!!r1.result, 'an AI-vs-AI Standard match reaches a result (' + (r1.result && r1.result.text) + ')');
  assert(JSON.stringify(CE.scorecard(r1)) === JSON.stringify(CE.scorecard(r2)) && JSON.stringify(CE.timeline(r1)) === JSON.stringify(CE.timeline(r2)), 'replay determinism: same log → same scorecard and ball-by-ball');
  const card = CE.scorecard(r1);
  card.innings.forEach((inn) => {
    const batted = inn.batting.reduce((n, b) => n + b.r, 0);
    assert(batted + inn.extras.total === inn.total.runs, 'innings ' + inn.n + ': batter runs + extras = total');
    const conceded = inn.bowling.reduce((n, b) => n + b.r, 0);
    assert(conceded === inn.total.runs - inn.extras.b - inn.extras.lb - inn.extras.pen, 'innings ' + inn.n + ': bowler runs = total − byes − leg-byes − penalties');
  });
  const chase = CE.chaseTarget('quick', 99);
  assert(chase >= 24 && chase <= 32 && chase === CE.chaseTarget('quick', 99), 'chase target in band and seeded');
  const chaseCfg = CE.createMatch({ format: 'quick', target: chase, sides: [{ pid: 'u', name: 'You' }, { pid: 'ai', name: 'Bowler' }] });
  const ch = CE.replay(chaseCfg, []);
  assert(chaseCfg.innings === 1 && ch.innings[0].target === chase, 'Chase practice: one innings with a target');
  const chWon = CE.replay(chaseCfg, Array.from({ length: 6 }, () => B(6)));
  assert(chWon.result && chWon.result.kind === 'win' && chWon.result.winner === 0, 'Chase practice finishes on the engine');
}

// ---------------------------------------------------------------- server authority
{
  const A = 'userAAAA01';
  const Bn = 'userBBBB02';
  let queue = [];
  const rng = () => (queue.length ? queue.shift() : 0.5);
  const seedRoll = (seed) => (seed + 0.5) / 4294967296;
  let now = 1000000;
  const code = (fn) => {
    try {
      fn();
      return '';
    } catch (e) {
      return e.code || e.message;
    }
  };
  let m = SC.reduceMatch(null, A, 'join', { matchId: 'dm_x', opponentUid: Bn, playerA: A, name: 'Ava', format: 'standard', preset: 'standard' }, now, rng).match;
  assert(m.pub.status === 'waiting' && m.pub.rated === true && m.pub.format === 'standard', 'host creates a rated Standard match');
  queue = [0.1];
  m = SC.reduceMatch(clone(m), Bn, 'join', { matchId: 'dm_x', name: 'Ben', format: 'long', preset: 'gully' }, now, rng).match;
  assert(m.pub.status === 'playing' && m.pub.format === 'standard' && m.pub.preset === 'standard', 'guest join starts the match; the host’s settings stand');
  assert(m.pub.toss.winner === A && m.pub.toss.bats === A, 'toss winner bats first');
  assert(SC.rolesOf(m.pub).batter === A && SC.rolesOf(m.pub).bowler === Bn, 'roles: Ava bats, Ben bowls');

  const presence = (mm) => {
    mm.presence = { [A]: { at: now, online: true }, [Bn]: { at: now, online: true } };
    return mm;
  };
  assert(code(() => SC.reduceMatch(clone(m), A, 'bowl', { ballNo: 0, delivery: 'medium' }, now, rng)) === 'not_bowler', 'the batter can’t bowl');
  assert(code(() => SC.reduceMatch(clone(m), Bn, 'bowl', { ballNo: 3, delivery: 'medium' }, now, rng)) === 'stale_ball', 'stale ball number rejected');
  assert(code(() => SC.reduceMatch(clone(m), Bn, 'bowl', { ballNo: 0, delivery: 'beamer' }, now, rng)) === 'bad_delivery', 'unknown delivery rejected');
  assert(code(() => SC.reduceMatch(clone(m), A, 'ball', {}, now, rng)) === 'bad_op', 'unknown op rejected');
  assert(!SC.CLIENT_OPS.has('settle_claim') && !SC.CLIENT_OPS.has('settle_done') && !SC.CLIENT_OPS.has('ball'), 'settle internals and "ball" are not client ops');

  const bowled = SC.reduceMatch(clone(m), Bn, 'bowl', { ballNo: 0, delivery: 'medium' }, now, rng).match;
  assert(bowled.pub.phase === 'ball' && bowled.pub.ball.startAt === now + SC.LEAD_MS, 'bowl stamps a server release time');
  assert(code(() => SC.reduceMatch(clone(bowled), A, 'hit', { ballNo: 0, shot: 'push', t: 0 }, now + 100, rng)) === 'too_early', 'a hit before release is rejected');
  assert(code(() => SC.reduceMatch(clone(bowled), Bn, 'hit', { ballNo: 0, shot: 'push', t: 920 }, now + 1820, rng)) === 'not_batter', 'the bowler can’t hit');

  // The client claims a six / a no-ball / a dismissal: the server reads only shot + tap time.
  const seed = 424242;
  queue = [seedRoll(seed)];
  const hitAt = now + SC.LEAD_MS + 920;
  const hit = SC.reduceMatch(clone(bowled), A, 'hit', { ballNo: 0, shot: 'push', t: 920, rtt: 80, runs: 6, out: 'bowled', extra: 'nb', timing: 'perfect', result: { runs: 6 } }, hitAt, rng).match;
  const ev = hit.pub.log[0];
  const expect = CE.resolveBall({ delivery: 'medium', shot: 'push', timing: 'perfect', rules: CE.makeRules('standard'), freeHit: false, firstBall: true }, seed);
  assert(ev.seed === seed && ev.runs === expect.runs && ev.out === expect.out && ev.extra === expect.extra, 'server event = its own seeded roll (claimed runs/out/extra ignored)');
  assert(!('result' in ev) && ev.tap === 920, 'no client fields in the log');

  // Tap-time clamp: a tap can't be in the future nor older than the RTT allows.
  assert(SC.clampTap(5000, 920, 80) === 920, 'future tap clamped to arrival');
  assert(SC.clampTap(0, 920, 100) === 670, 'stale tap clamped to arrival − (rtt + 150)');
  assert(SC.clampTap(0, 5000, 99999) === 5000 - SC.MAX_LAG_MS, 'RTT compensation capped');
  assert(SC.clampTap(800, 920, 100) === 800, 'plausible tap kept');
  queue = [seedRoll(1)];
  const lateClaim = SC.reduceMatch(clone(bowled), A, 'hit', { ballNo: 0, shot: 'push', t: 900, rtt: 0 }, now + SC.LEAD_MS + 1600, rng).match;
  assert(lateClaim.pub.log[0].tap === 1600 - 150, 'a “perfect” tap claimed 700ms after the fact is clamped');

  // Ticks: bowler timeout → auto delivery + AFK miss; ball timeout → a miss.
  const idle = presence(clone(m));
  const auto = SC.reduceMatch(idle, A, 'tick', {}, m.pub.deadline + 1, rng);
  assert(auto && auto.result.autoBowled && auto.match.pub.phase === 'ball' && auto.match.pub.misses[Bn] === 1, 'bowler timeout: server bowls, AFK miss counted');
  now = m.pub.deadline + 1;
  const timeout = SC.reduceMatch(presence(clone(auto.match)), Bn, 'tick', {}, auto.match.pub.deadline + 1, rng);
  assert(timeout && timeout.result.timeout && timeout.match.pub.log.length === 1 && timeout.match.pub.log[0].timing === 'miss', 'no hit in time → a miss');

  // A full rated Live Standard match, every ball server-resolved: a wide, a no-ball + free hit, a wicket, a chase finish.
  const find = (ctx, pred) => {
    for (let s = 1; s < 400000; s++) {
      const e = CE.resolveBall(ctx, s);
      if (pred(e)) return s;
    }
    throw new Error('no seed');
  };
  let mm = clone(m);
  now = 2000000;
  const seen = { wd: 0, nb: 0, freeHit: 0, out: 0 };
  const playOne = (pred, shot) => {
    const pub = mm.pub;
    const roles = SC.rolesOf(pub);
    const sh = shot || 'push';
    mm = SC.reduceMatch(mm, roles.bowler, 'bowl', { ballNo: pub.log.length, delivery: 'medium' }, now, rng).match;
    const st = SC.stateOf(mm.pub);
    const inn = CE.current(st);
    const ctx = { delivery: 'medium', shot: sh, timing: 'perfect', rules: st.config.rules, freeHit: inn.freeHit, firstBall: CE.firstBallFor(st) };
    queue = [seedRoll(find(ctx, pred))];
    now += SC.LEAD_MS + 920;
    mm = SC.reduceMatch(mm, roles.batter, 'hit', { ballNo: mm.pub.ball.n, shot: sh, t: 920, rtt: 60 }, now, rng).match;
    const after = SC.stateOf(mm.pub);
    const b = after.innings.map((i) => i.balls).flat().pop();
    if (b.extra === 'wd') seen.wd++;
    if (b.extra === 'nb') seen.nb++;
    if (b.freeHit) seen.freeHit++;
    if (b.out) seen.out++;
    now += 3000;
    if (mm.pub.phase === 'break') {
      presence(mm);
      mm = SC.reduceMatch(mm, A, 'tick', {}, mm.pub.deadline + 1, rng).match;
      now = Math.max(now, mm.pub.deadline - SC.BOWL_MS);
    }
  };
  playOne((e) => e.extra === 'wd' && !e.out);
  playOne((e) => e.extra === 'nb' && e.runs === 1 && !e.out);
  playOne((e) => !e.extra && e.out === 'caught'); // free hit: a proposed catch is not out
  playOne((e) => !e.extra && e.out === 'caught'); // a real wicket
  let guard = 0;
  while (mm.pub.status === 'playing' && SC.stateOf(mm.pub).cur === 0 && guard++ < 60) playOne((e) => !e.extra && !e.out && e.runs === 1);
  assert(SC.stateOf(mm.pub).cur === 1 && mm.pub.status === 'playing', 'first innings closes after 5 overs; the chase begins');
  const target = CE.current(SC.stateOf(mm.pub)).target;
  guard = 0;
  while (mm.pub.status === 'playing' && guard++ < 60) playOne((e) => !e.extra && !e.out && e.runs === 6, 'loft');
  const fin = SC.stateOf(mm.pub);
  assert(seen.wd >= 1 && seen.nb >= 1 && seen.freeHit >= 1 && seen.out >= 1, 'match had a wide, a no-ball, a free hit and a wicket');
  assert(fin.innings[0].wkts === 1 && fin.innings[0].balls[2].freeHit && !fin.innings[0].balls[2].out, 'the catch on the free hit was not out; the next one was');
  assert(mm.pub.status === 'over' && mm.pub.winner === Bn && /^Ben won by 3 wickets \(\d+ balls left\)$/.test(mm.pub.result), 'chase finish: ' + mm.pub.result + ' (target ' + target + ')');
  assert(mm.pub.phase === '' && mm.pub.ball === null, 'match closed cleanly');
  const replayed = CE.replay(CE.liveConfig(clone(mm.pub)), clone(mm.pub.log));
  assert(JSON.stringify(CE.scorecard(replayed)) === JSON.stringify(CE.scorecard(fin)), 'phones replay the server log to the same scorecard');
  const rtdbShape = clone(mm);
  rtdbShape.pub.log.forEach((e) => {
    if (!e.extra) delete e.extra;
    if (!e.out) delete e.out;
    if (!e.runs) delete e.runs;
  });
  delete rtdbShape.pub.toggles;
  const hydrated = SC.hydrate(rtdbShape);
  assert(JSON.stringify(CE.scorecard(SC.stateOf(hydrated.pub))) === JSON.stringify(CE.scorecard(fin)), 'hydrate restores RTDB-dropped fields');
  const flags = SC.achievementFlags(mm.pub);
  assert(flags[Bn] && flags[Bn][0] === 'cricket_three_sixes', 'three sixes in an innings flagged for the batter');

  const calls = [];
  const econ = {
    resolveGame: async (db, app, actor, body, opts) => {
      calls.push({ actor, body, opts });
      return { chipDelta: 20, eloDelta: 12, achievements: [{ key: 'cricket_three_sixes' }], opponent: { chipDelta: -20, eloDelta: -12, achievements: [] } };
    },
  };
  SC.settleMatch({ firestore: () => ({}) }, mm.pub, econ).then((out) => {
    const c = calls[0];
    assert(c && c.body.gameType === 'streetcricket' && c.body.rated === true && c.opts.trusted === true && c.actor === Bn, 'settlement: trusted, rated streetcricket, winner as actor');
    assert(out[Bn].eloDelta === 12 && out[A].eloDelta === -12 && out[Bn].achievements[0] === 'cricket_three_sixes', 'settlement deltas per player');

    const g = SC.reduceMatch(null, A, 'join', { matchId: 'dm_g', opponentUid: Bn, playerA: A, preset: 'gully', toggles: { sixOut: false, bogus: true } }, now, rng).match;
    assert(g.pub.rated === false && g.pub.toggles.sixOut === false && !('bogus' in g.pub.toggles), 'Gully Live is unrated; unknown toggles dropped');

    const leave = SC.reduceMatch(presence(clone(m)), A, 'leave', {}, now, rng).match;
    assert(leave.pub.status === 'over' && leave.pub.winner === Bn && /forfeited/.test(leave.pub.result), 'leaving forfeits (logged)');
    let rm = SC.reduceMatch(clone(leave), A, 'rematch', { matchId: 'dm_x' }, now, rng);
    rm = SC.reduceMatch(rm.match, Bn, 'rematch', { matchId: 'dm_x' }, now, rng);
    assert(rm.result.nextMatchId === 'dm_x-r1' && rm.result.createNext.playerA === Bn, 'rematch swaps sides');

    wiring();
  });
}

// ---------------------------------------------------------------- wiring
function wiring() {
  const media = read('api/media-config.js');
  assert(/action === 'cricket_match'/.test(media) && /cricketMatch\(/.test(media), 'media-config routes cricket_match');
  const api = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js'));
  assert(api.length <= 12, 'api/*.js ≤ 12 (' + api.length + ')');
  const econ = read('server-lib/dangal-economy.js');
  assert(/SERVER_SETTLED[\s\S]{0,400}streetcricket/.test(econ) && /cricket_three_sixes/.test(econ), 'economy: streetcricket server-settled + Maximum achievement');
  const rules = JSON.parse(read('firebase/database.rules.json'));
  assert(rules.rules.games && rules.rules.games.cricket, 'RTDB rules for games/cricket');
  const pub = rules.rules.games.cricket.$matchId.pub;
  assert(pub && !pub['.write'], 'phones can’t write the cricket log');
  const kit = read('public/src/js/games/party-kit.js');
  assert(/streetcricket:\s*\['games\/cricket-engine\.js'\]/.test(kit), 'LAZY_DATA loads the engine');
  const html = read('public/index.html');
  assert(/data-party-lazy src="\/src\/js\/games\/cricket-engine\.js/.test(html), 'index.html lazy script for the engine');
  const rw = read('public/src/js/games/rw-sports.js');
  assert(!/function resolveStreetBall/.test(rw), 'the client no longer resolves balls itself');
  assert(/liveCall\('hit'/.test(rw) && !/liveCall\('hit',[^)]*runs/.test(rw), 'Live hit sends shot + tap time only');
  assert(/cricket_match/.test(rw), 'client uses the cricket_match action');
  const DR = read('public/src/js/dangal/dangal-rules.js');
  assert(DR.includes('Based on the MCC Laws of Cricket, adapted for street play'), 'rules sheet attribution');
  const DS = read('public/src/js/dangal/design-system.js');
  assert(DS.includes('Based on the MCC Laws of Cricket, adapted for street play'), 'design-system rule source');
  const pol = require(path.join(root, 'public/src/js/dangal/dangal-live-policy.js')).policyFor('streetcricket');
  assert(pol.leave === 'forfeit' && pol.afk && pol.afk.maxMisses === 3 && pol.rematch.swapSides, 'Live policy: forfeit, 3 AFK misses, rematch swaps sides');
  assert(!/\b(MCC|ICC) logo|official (laws|rules)/i.test(rw + DR), 'no logos or “official” claims');

  if (failed) {
    console.error('\n' + failed + ' failed');
    process.exit(1);
  }
  console.log('\nAll P10 Street Cricket engine tests passed');
}
