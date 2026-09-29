#!/usr/bin/env node
/**
 * Dangal P11 — Street Cricket 2: balance bands (sim), skill gradient + bot tiers, no dominant
 * strategy (EV), field presets and running risk, DRS-lite (flow, limit, umpire's-call band),
 * commentary variety (no repeats), the AI path with a mocked provider (schema, length, safety,
 * grounding, caps, cache, timeout), RTT / meter caps, auto-actions on disconnect, and a full
 * server-driven Live Standard match (toss → review → disconnect + rejoin → commentary + recap).
 *   node scripts/test-dangal-p11-cricket.js
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
const code = (fn) => {
  try {
    fn();
    return '';
  } catch (e) {
    return e.code || e.message;
  }
};

const CE = require(path.join(root, 'public/src/js/games/cricket-engine.js'));
const CM = require(path.join(root, 'public/src/js/games/cricket-model.js'));
const CC = require(path.join(root, 'public/src/js/games/cricket-commentary.js'));
const Scene = require(path.join(root, 'public/src/js/games/cricket-scene.js'));
const SIM = require(path.join(root, 'scripts/sim-cricket.js'));
const SRV = require(path.join(root, 'server-lib/cricket-engine.js'));
const DAI = require(path.join(root, 'server-lib/dangal-ai.js'));

async function main() {
  // ---------------------------------------------------------------- sim bands
  {
    const T = SIM.TARGETS;
    const n = { superquick: 1200, quick: 1200, standard: 1200, long: 500 };
    CE.FORMAT_ORDER.forEach((f) => {
      const b = SIM.bands(f, 'standard', n[f], 11);
      assert(b.median >= T.score[f][0] && b.median <= T.score[f][1], `sim ${f}/standard median ${b.median} in ${T.score[f].join('–')}`);
      if (f === 'standard') {
        assert(b.ballsPerWicket >= T.ballsPerWicket[0] && b.ballsPerWicket <= T.ballsPerWicket[1], `Standard balls per wicket ${b.ballsPerWicket} in ${T.ballsPerWicket.join('–')}`);
        assert(b.boundaryShare >= T.boundaryShare[0] && b.boundaryShare <= T.boundaryShare[1], `Standard boundary share ${b.boundaryShare} in ${T.boundaryShare.join('–')}`);
        assert(b.extrasRate >= T.extrasRate[0] && b.extrasRate <= T.extrasRate[1], `Standard extras rate ${b.extrasRate} in ${T.extrasRate.join('–')}`);
        assert(b.reviewsPerMatch > 0 && b.umpiresCallRate > 0 && b.overturnRate > 0, `reviews happen (${b.reviewsPerMatch}/match, overturned ${b.overturnRate}, umpire’s call ${b.umpiresCallRate})`);
      }
    });
    ['gully', 'backyard'].forEach((p) => {
      const b = SIM.bands('standard', p, 500, 13);
      assert(b.median >= 20 && b.median <= 75 && b.reviewsPerMatch === 0, `${p} plays sensibly (median ${b.median}) with no reviews`);
    });
  }

  // ---------------------------------------------------------------- skill gradient + tiers
  {
    const pr = SIM.winRate('perfect', 'random', 'standard', 'standard', 300, 5);
    assert(pr >= SIM.TARGETS.perfectVsRandom, `perfect beats random ${(pr * 100).toFixed(1)}% (> 90%)`);
    [
      ['easy', 'normal'],
      ['normal', 'hard'],
      ['hard', 'pro'],
    ].forEach(([lo, hi]) => {
      const w = SIM.winRate(hi, lo, 'standard', 'standard', 500, 9);
      assert(w > 0.55, `${hi} Bot beats ${lo} Bot ${(w * 100).toFixed(1)}% — tiers feel distinct`);
    });
    assert(CM.tierOf('medium') === 'normal' && CM.tierOf('pro') === 'pro' && CM.TIER_ORDER.join() === 'easy,normal,hard,pro', 'tiers Easy / Normal / Hard / Pro (old “medium” → Normal)');
    const a = CM.botBowl({ tier: 'hard', type: 'pace', history: [] }, 42);
    const b = CM.botBowl({ tier: 'hard', type: 'pace', history: [] }, 42);
    assert(JSON.stringify(a) === JSON.stringify(b), 'bots are deterministic for a seed');
  }

  // ---------------------------------------------------------------- EV: no dominant strategy
  {
    const rows = SIM.evTable(120, 'normal');
    const d = SIM.dominance(rows, 0.35);
    assert(d.ok, 'no shot is the best answer to more than 35% of deliveries ' + JSON.stringify(d.shares));
    assert(d.everyShotRisky, 'every shot has a delivery where its EV is negative');
    assert(d.everyShotHasUse, 'every shot (bar leave) is the best answer somewhere');
    assert(d.wrongPunished, 'every delivery has a wrong shot with EV < −1');
    const pt = SIM.planTable(160);
    const lens = new Set(pt.slice(0, 8).map((p) => p.plan.length + '/' + p.plan.variation));
    const gap = pt[Math.floor(pt.length / 4)].value - pt[0].value;
    assert(lens.size >= 3 && gap < 2.5, `no dominant delivery (top 8 span ${lens.size} combos, gap ${gap.toFixed(2)})`);
    assert(SIM.allPlans().every((p) => CM.normPlan(p).variation === p.variation), 'outcome tables live in data: every plan is a valid normPlan');
  }

  // ---------------------------------------------------------------- field presets + running
  {
    const del = (line, length) => CM.execute({ type: 'pace', line, length, variation: 'stock' }, 1, () => 0.999);
    const rate = (shot, d, field, pred, run, n) => {
      let k = 0;
      const N = n || 12000;
      for (let i = 0; i < N; i++) {
        const ev = CM.resolve({ delivery: d, shot, foot: 'stay', run: run || 'one', timing: 'perfect', conf: 50, field, pitch: 'flat', rules: {} }, 1000 + i * 7);
        if (pred(ev)) k++;
      }
      return k / N;
    };
    const bnd = (ev) => ev.runs >= 4 && !ev.extra && !ev.out;
    const caught = (ev) => ev.out === 'caught';
    const offDrive = del('off', 'full');
    const legFlick = del('leg', 'full');
    const bal = rate('drive', offDrive, 'balanced', bnd);
    assert(rate('drive', offDrive, 'protectOff', bnd) < bal * 0.8, 'Protect off-side cuts off-side boundaries (×0.6 documented)');
    assert(rate('drive', offDrive, 'protectLeg', bnd) > bal * 1.1, 'Protect leg-side opens the off side (×1.25 documented)');
    const balLeg = rate('flick', legFlick, 'balanced', bnd);
    assert(rate('flick', legFlick, 'protectLeg', bnd) < balLeg * 0.8, 'Protect leg-side cuts leg-side boundaries');
    assert(rate('drive', offDrive, 'defensive', bnd) < bal * 0.85, 'Defensive field: fewer boundaries (×0.7)');
    const loft = del('middle', 'good');
    const cBal = rate('loft', loft, 'balanced', caught);
    assert(rate('loft', loft, 'attacking', caught) > cBal * 1.05, 'Attacking field: more catches (×1.15 straight)');
    assert(rate('loft', loft, 'defensive', caught) < cBal * 0.95, 'Defensive field: fewer catches (×0.8 straight)');
    // Edges carry to slip more with an attacking field.
    const edgeDel = CM.execute({ type: 'pace', line: 'off', length: 'short', variation: 'stock' }, 1, () => 0.999);
    const behind = (f) => {
      let e = 0;
      let c = 0;
      for (let i = 0; i < 20000; i++) {
        const ev = CM.resolve({ delivery: edgeDel, shot: 'drive', timing: 'early', conf: 20, field: f, pitch: 'green', rules: {} }, 7 + i * 13);
        if (ev.behind && ev.appeal && ev.appeal.edge) c++;
        if (ev.edged || (ev.appeal && ev.appeal.edge)) e++;
      }
      return e ? c / e : 0;
    };
    assert(behind('attacking') > behind('defensive') + 0.1, 'Attacking slips carry more edges than a defensive field');
    // Running: hold never runs out; pushing for two is riskier; attacking fields raise run-out risk.
    const good = del('off', 'good');
    const ro = (field, run) => rate('drive', good, field, (ev) => ev.out === 'runout', run, 15000);
    assert(ro('balanced', 'hold') === 0, 'Hold never runs anyone out');
    const one = ro('balanced', 'one');
    const two = ro('balanced', 'two');
    assert(two > one * 5 && one < 0.02, `Push for 2 is much riskier than Take 1 (${(two * 100).toFixed(1)}% vs ${(one * 100).toFixed(2)}%)`);
    assert(ro('attacking', 'two') > ro('defensive', 'two') * 1.4, 'Run-out risk scales with the field (attacking ×1.4 vs defensive ×0.7)');
    assert(CM.RUNNING.push[1] > CM.RUNNING.safe[1] && CM.RUNNING.straight < 1, 'running table in data: push > safe; straight hits are safer to run');
    const tip = CM.resolve({ delivery: good, shot: 'defend', run: 'hold', timing: 'perfect', field: 'balanced', pitch: 'flat', rules: { tipAndRun: true } }, 5);
    assert(tip.runCall !== 'hold', 'Tip and run overrides Hold');
    // Step out vs spin: stumping risk on a miss.
    const spin = CM.execute({ type: 'spin', line: 'off', length: 'good', variation: 'stock' }, 1, () => 0.999);
    let st = 0;
    for (let i = 0; i < 4000; i++) if (CM.resolve({ delivery: spin, shot: 'loft', foot: 'out', timing: 'miss', field: 'balanced', pitch: 'dusty', rules: {} }, 3 + i).out === 'stumped') st++;
    assert(st / 4000 > 0.3, 'stepping out to spin and missing risks a stumping');
    // Accuracy meter: dead centre is best; harder targets miss more.
    assert(CM.meterAccuracy(400) === 1 && CM.meterAccuracy(0) === 0 && CM.meterAccuracy(1200) === 1, 'meter: centre = 1, ends = 0');
    const plan = (length, line) => ({ type: 'pace', line, length, variation: 'stock' });
    assert(CM.missChance(plan('yorker', 'middle'), 0.8) > CM.missChance(plan('good', 'off'), 0.8) * 4, 'yorkers are much harder to land than a good length');
    let wides = 0;
    for (let i = 0; i < 4000; i++) if (CM.execute(plan('good', 'wide'), 0.2, CM.mulberry32(i)).extra === 'wd') wides++;
    assert(wides > 150, 'aiming wide with a poor meter bowls wides');
    assert(Object.keys(CM.PITCHES).join() === 'flat,green,dusty,tarmac' && CM.rollPitch('gully', 1) === 'tarmac', 'pitches: Flat / Green / Dusty, Street tarmac for Gully');
  }

  // ---------------------------------------------------------------- DRS-lite
  {
    const std = () => CE.createMatch({ format: 'standard', preset: 'standard', sides: [{ pid: 'a', name: 'Ava' }, { pid: 'b', name: 'Ben' }] });
    const lbw = (x, onField, drs) => ({ t: 'ball', runs: 0, out: onField === 'out' ? 'lbw' : '', type: 'pace', line: 'middle', length: 'full', appeal: { kind: 'lbw', onField, track: { x, h: 0.5, band: Math.abs(x) <= 0.8 ? 'hitting' : Math.abs(x) > 1.2 ? 'missing' : 'umpires_call', pitched: 'in_line' } }, drs });
    const withDrs = (ev, side) => CM.applyReview(ev, side);
    assert(std().rules.drs === true && CE.createMatch({ preset: 'gully' }).rules.drs === false && CE.createMatch({ preset: 'backyard' }).rules.drs === false, 'reviews in Standard only');
    // Verdicts from the tracking band.
    assert(CM.reviewVerdict(lbw(0.3, 'notout').appeal).result === 'overturned' && CM.reviewVerdict(lbw(0.3, 'notout').appeal).decision === 'out', 'hitting (|x| ≤ 0.8) overturns a not out');
    assert(CM.reviewVerdict(lbw(1.0, 'out').appeal).result === 'umpires_call' && CM.reviewVerdict(lbw(1.0, 'out').appeal).decision === 'out', 'umpire’s call band keeps an out');
    assert(CM.reviewVerdict(lbw(1.0, 'notout').appeal).decision === 'notout', 'umpire’s call band keeps a not out');
    assert(CM.reviewVerdict(lbw(1.5, 'out').appeal).result === 'overturned', 'missing (|x| > 1.2) overturns an out');
    const leg = lbw(0.2, 'out');
    leg.appeal.track.pitched = 'outside_leg';
    leg.appeal.track.band = 'missing';
    assert(CM.reviewVerdict(leg.appeal).decision === 'notout', 'pitched outside leg is not out');
    assert(CM.reviewVerdict({ kind: 'caught', onField: 'out', edge: false }).result === 'overturned' && CM.reviewVerdict({ kind: 'caught', onField: 'notout', edge: true }).decision === 'out', 'caught behind: simulated edge detection decides');
    assert(CM.reviewer(lbw(0, 'out')) === 'bat' && CM.reviewer(lbw(0, 'notout')) === 'bowl', 'the batter reviews an out, the bowler a not out');

    // Engine flow + limit.
    let s = CE.replay(std(), []);
    CE.applyEvent(s, withDrs(lbw(1.0, 'out'), 'bat'));
    let inn = CE.current(s);
    assert(inn.wkts === 1 && inn.reviews.bat === 1, 'umpire’s call: still out, the review is kept');
    CE.applyEvent(s, withDrs(lbw(1.5, 'out'), 'bat'));
    inn = CE.current(s);
    assert(inn.wkts === 1 && inn.reviews.bat === 1, 'overturned: not out, review kept');
    CE.applyEvent(s, withDrs(lbw(0.3, 'out'), 'bat'));
    inn = CE.current(s);
    assert(inn.wkts === 2 && inn.reviews.bat === 0, 'decision stands: out and the review is lost');
    CE.applyEvent(s, withDrs(lbw(1.5, 'out'), 'bat'));
    inn = CE.current(s);
    assert(inn.wkts === 3 || s.cur === 1, 'no reviews left: the on-field out stands');
    s = CE.replay(std(), []);
    const wrong = lbw(1.5, 'out', { by: 'bowl', result: 'overturned', decision: 'notout' });
    CE.applyEvent(s, wrong);
    assert(CE.current(s).wkts === 1 && CE.current(s).reviews.bowl === 1, 'a review by the wrong side is ignored');
    const gully = CE.replay(CE.createMatch({ format: 'standard', preset: 'gully' }), []);
    CE.applyEvent(gully, withDrs(lbw(1.5, 'notout'), 'bowl'));
    assert(CE.current(gully).wkts === 0 && CE.current(gully).balls[0].drs === '', 'Gully: no reviews at all');
    const txt = CE.current(CE.replay(std(), [withDrs(lbw(1.0, 'out'), 'bat')])).balls[0].text;
    assert(/review/i.test(txt) && /umpire/i.test(txt), 'ball text explains the review: ' + txt);
    assert(/simulat/i.test(read('public/src/js/games/cricket-scene.js')) && /simulat/i.test(read('public/src/js/dangal/dangal-rules.js')), 'ball-tracking is labelled as simulated (scene + rules)');
  }

  // ---------------------------------------------------------------- commentary templates
  {
    assert(CC.count() >= 300, 'template library ≥ 300 lines (' + CC.count() + ')');
    assert(CC.PERSONAS.join() === 'calm,fan' && CC.KINDS.every((k) => CC.TEMPLATES.calm[k].length >= 4 && CC.TEMPLATES.fan[k].length >= 4), 'both personas cover every key-moment kind');
    let allUnique = true;
    let longest = 0;
    let unfilled = false;
    let total = 0;
    for (let i = 0; i < 12; i++) {
      const r = SIM.playMatch({ format: 'long', preset: 'standard', players: ['normal', 'normal'], seed: 500 + i * 31 });
      ['calm', 'fan'].forEach((p) => {
        const lines = CC.linesFor(r.state, 777 + i, p);
        total += lines.length;
        if (new Set(lines.map((l) => l.line)).size !== lines.length) allUnique = false;
        lines.forEach((l) => {
          longest = Math.max(longest, l.line.length);
          if (/[{}]/.test(l.line)) unfilled = true;
        });
      });
    }
    assert(total > 200 && allUnique, `no repeated line within a match (${total} lines over 24 match-voices)`);
    assert(longest <= CC.MAX_LINE && !unfilled, 'lines are length-capped with every placeholder filled');
    const r = SIM.playMatch({ format: 'standard', preset: 'standard', players: ['normal', 'normal'], seed: 4242 });
    const a = CC.linesFor(r.state, 99, 'calm').map((l) => l.line);
    const b = CC.linesFor(r.state, 99, 'calm').map((l) => l.line);
    assert(JSON.stringify(a) === JSON.stringify(b), 'the same match seed gives the same lines on every phone');
    const pick = CC.createPicker(1, 'fan');
    const seen = new Set();
    let blanks = 0;
    for (let i = 0; i < 80; i++) {
      const line = pick.line({ kind: 'four', key: '0:' + i, bat: 'Ava', bowl: 'Ben', r: 10, b: 8, score: '20/1', shot: 'drive', del: 'full ball' });
      if (!line) blanks++;
      else seen.add(line);
    }
    assert(blanks > 0 && seen.size === 80 - blanks, 'a used-up pool goes quiet rather than repeating');
    const recap = CC.recapTemplate(r.state, 'calm');
    assert(recap.length > 20 && recap.length <= CC.MAX_RECAP && recap.split(/[.!?](\s|$)/).filter((x) => x && x.trim()).length <= 3, 'template recap: ≤ 3 sentences, capped');
    assert(CC.numbersGrounded(recap, CC.recapFacts(r.state)), 'template recap numbers all come from the match');
    const moments = CC.keyMoments(r.state);
    assert(moments.every((m) => typeof m.key === 'string') && new Set(moments.map((m) => m.key)).size === moments.length, 'key moments carry unique stable keys');
  }

  // ---------------------------------------------------------------- AI path (mocked provider)
  {
    const r = SIM.playMatch({ format: 'standard', preset: 'standard', players: ['normal', 'normal'], seed: 9001 });
    const st = r.state;
    let over = -1;
    let moments = [];
    for (let o = 0; o < 5 && !moments.length; o++) {
      moments = CC.overMoments(st, 0, o);
      over = o;
    }
    const compact = moments.slice(0, 8).map(CC.compactMoment);
    const env = { AI_FEATURES_ENABLED: 'true', AI_DAILY_CALL_CAP: '50' };
    let calls = 0;
    const make = (reply, extra) =>
      DAI.createDangalAI(
        Object.assign(
          {
            env,
            userCap: 50,
            callAI: async (opts) => {
              calls++;
              assert(opts.tier === 'fast' && /never invent/i.test(opts.messages[0].content), 'AI prompt: fast tier, forbids invented stats');
              return { text: typeof reply === 'function' ? reply(opts) : JSON.stringify(reply) };
            },
          },
          extra || {}
        )
      );
    const input = { gameId: 'streetcricket', mode: 'over', persona: 'fan', moments: compact };
    assert(compact.length > 0 && over >= 0, 'found an over with key moments for the AI');
    const good = { lines: compact.map((m, i) => ({ i, line: (m.bat || 'The batter') + ' makes it count here' })) };
    let out = await make(good).run('commentary', input, { uid: 'u1' });
    assert(out.source === 'ai' && out.data.lines.length === compact.length, 'valid per-over lines accepted');
    out = await make({ lines: [{ i: 0, line: 'x'.repeat(141) }] }).run('commentary', input, { uid: 'u1' });
    assert(out.source === 'fallback' && out.reason === 'invalid_output' && out.data.lines.length === 0, 'over-long line rejected → templates');
    out = await make({ lines: [{ i: 0, line: 'That makes 987 career runs' }] }).run('commentary', input, { uid: 'u1' });
    assert(out.source === 'fallback', 'invented number rejected (grounding)');
    out = await make({ lines: [{ i: 0, line: 'Great shot, see www.example.com' }] }).run('commentary', input, { uid: 'u1' });
    assert(out.source === 'fallback', 'unsafe content rejected');
    out = await make({ lines: Array.from({ length: 9 }, (_, i) => ({ i: 0, line: 'x' + i })) }).run('commentary', input, { uid: 'u1' });
    assert(out.source === 'fallback', 'more than 8 lines rejected');
    out = await make('not json').run('commentary', input, { uid: 'u1' });
    assert(out.source === 'fallback', 'non-JSON rejected');
    const facts = CC.recapFacts(st);
    const topName = facts.innings[0].top[0].name;
    out = await make({ recap: topName + ' set it up and the chase never quite settled. A tidy contest.' }).run('commentary', { gameId: 'streetcricket', mode: 'recap', persona: 'calm', facts }, { uid: 'u1' });
    assert(out.source === 'ai' && /set it up/.test(out.data.recap), 'recap: 2–3 grounded sentences accepted');
    out = await make({ recap: 'A record 4321 runs were scored in a classic.' }).run('commentary', { gameId: 'streetcricket', mode: 'recap', persona: 'calm', facts }, { uid: 'u1' });
    assert(out.source === 'fallback' && out.data.recap === '', 'recap with invented numbers → template recap');
    calls = 0;
    out = await DAI.createDangalAI({ env: { AI_FEATURES_ENABLED: 'false' }, callAI: async () => (calls++, { text: '{}' }) }).run('commentary', input, { uid: 'u1' });
    assert(out.source === 'fallback' && out.reason === 'ai_off' && calls === 0, 'AI off: no provider call, templates');
    calls = 0;
    const cached = make(good);
    await cached.run('commentary', input, { uid: 'u2' });
    out = await cached.run('commentary', input, { uid: 'u3' });
    assert(out.source === 'cache' && calls === 1, 'identical over → cache, one provider call');
    const capped = DAI.createDangalAI({ env: { AI_FEATURES_ENABLED: 'true', AI_DAILY_CALL_CAP: '1' }, callAI: async () => ({ text: JSON.stringify(good) }) });
    await capped.run('commentary', input, { uid: 'u4' });
    out = await capped.run('commentary', Object.assign({}, input, { persona: 'calm' }), { uid: 'u4' });
    assert(out.source === 'fallback' && out.reason === 'global_cap', 'AI_DAILY_CALL_CAP enforced');
    out = await DAI.createDangalAI({ env, timeoutMs: 40, callAI: () => new Promise(() => {}) }).run('commentary', input, { uid: 'u5' });
    assert(out.source === 'fallback' && out.reason === 'timeout', 'slow provider → timeout → templates');
    // Server: AI lines keyed by moment key; fallback stores 0.
    const cfgPub = { format: 'standard', preset: 'standard', toggles: {}, tie: 'superover', names: { A: 'Ava', B: 'Ben' }, playerA: 'A', playerB: 'B', toss: { bats: 'A' }, pitch: 'flat', persona: 'fan', log: [] };
    const events = [];
    {
      // A raw event log (what the server stores in pub.log) from a quick scripted match.
      const cfg = CE.liveConfig(cfgPub);
      const s2 = CE.replay(cfg, []);
      let seed = 31;
      while (!s2.result && events.length < 400) {
        const inn = CE.current(s2);
        const d = CM.execute({ type: 'pace', line: 'off', length: seed % 3 ? 'good' : 'full', variation: 'stock' }, 0.9, CM.mulberry32((seed += 7)));
        const b = CM.botBat({ tier: 'normal', delivery: d, field: 'balanced', target: inn.target, rrr: 9 }, (seed += 11));
        const ev = CM.resolve({ delivery: d, shot: b.shot, foot: b.foot, run: b.run, timing: b.timing, field: 'balanced', pitch: 'flat', rules: cfg.rules }, (seed += 13));
        events.push(ev);
        CE.applyEvent(s2, ev);
      }
    }
    cfgPub.log = events;
    const liveSt = SRV.stateOf(cfgPub);
    let key = '';
    for (let o = 0; o < 5 && !key; o++) if (CC.overMoments(liveSt, 0, o).length) key = 'o0_' + o;
    const aiOk = make((opts) => {
      const mm = opts.messages[0].content.match(/index = position\): (\[[\s\S]*?\])\n/);
      const ms = mm ? JSON.parse(mm[1]) : [];
      return JSON.stringify({ lines: ms.map((m, i) => ({ i, line: (m.bat || 'The batter') + ' with a moment to remember' })) });
    });
    const v = await SRV.aiValue(cfgPub, key, 'A', aiOk);
    const keys = new Set(CC.keyMoments(liveSt).map((m) => m.key));
    assert(Array.isArray(v) && v.length > 0 && v.every((x) => keys.has(x.k) && x.line.length <= 140), 'server stores AI lines keyed by moment key');
    const v0 = await SRV.aiValue(cfgPub, key, 'A', DAI.createDangalAI({ env: { AI_FEATURES_ENABLED: 'false' } }));
    assert(v0 === 0, 'server stores 0 on fallback (phones use templates)');
    const rc = await SRV.aiValue(Object.assign({}, cfgPub, { log: events }), 'recap', 'A', make({ recap: 'A lively contest from start to finish. Both players had their moments.' }));
    assert(rc && rc.source === 'ai' && rc.text.length > 20, 'server recap value from the AI');
  }

  // ---------------------------------------------------------------- RTT cap + meter clamp
  {
    assert(SRV.MAX_COMP_MS === 400 && SRV.clampTap(0, 5000, 99999) === 5000 - 400, 'RTT compensation capped at 400 ms');
    assert(SRV.clampTap(0, 1000, 0) === 1000 - 120, 'minimum compensation 120 ms');
    assert(SRV.clampTap(700, 1000, 300) === 720, 'compensation 0.6·rtt + 100 (300 ms → 280)');
    assert(SRV.clampMeter(400, 500, 200) === 400, 'meter: plausible stop kept');
    assert(SRV.clampMeter(0, 500, 200) === 400 - SRV.METER_TOL_MS, 'meter: stale stop clamped to the tolerance');
    assert(SRV.clampMeter(9999, 500, 0) === 500, 'meter: a stop can’t be in the future');
    assert(SRV.clampMeter(0, 1000, 99999) === 1000 - 200 - SRV.METER_TOL_MS, 'meter: RTT allowance capped at 200 ms');
  }

  // ---------------------------------------------------------------- reducer: auto-actions, AFK, spectators
  {
    const A = 'userAAAA01';
    const B = 'userBBBB02';
    let now = 5000000;
    const rng = CM.mulberry32(77);
    const r = (m, uid, op, a, t) => SRV.reduceMatch(clone(m), uid, op, Object.assign({ matchId: 'dm_p11' }, a || {}), t == null ? now : t, rng);
    let m = r(null, A, 'join', { opponentUid: B, playerA: A, name: 'Ava', format: 'standard', preset: 'standard', persona: 'fan' }).match;
    m = r(m, B, 'join', { name: 'Ben' }).match;
    assert(m.pub.phase === 'toss' && CM.PITCH_ORDER.indexOf(m.pub.pitch) >= 0 && m.pub.persona === 'fan', 'toss phase with a pitch rolled before it (and the host’s commentary voice)');
    assert(code(() => r(m, A, 'call', { call: 'heads' })) === 'not_caller', 'only the caller calls');
    const autoToss = r(m, A, 'tick', {}, m.pub.deadline + 1);
    assert(autoToss.result.autoCall && autoToss.match.pub.toss.call === 'heads' && autoToss.match.pub.phase === 'choose', 'toss timeout → auto “heads”');
    m = r(m, B, 'call', { call: 'tails' }).match;
    const winner = m.pub.toss.winner;
    const loser = winner === A ? B : A;
    assert(code(() => r(m, loser, 'choose', { bat: true })) === 'not_toss_winner', 'only the toss winner chooses');
    const autoChoose = r(m, A, 'tick', {}, m.pub.deadline + 1);
    assert(autoChoose.result.autoChoose && autoChoose.match.pub.toss.bats === winner, 'choice timeout → the winner bats');
    m = r(m, winner, 'choose', { bat: false }).match;
    assert(m.pub.toss.bats === loser && m.pub.phase === 'bowl' && m.pub.over && m.pub.over.fresh, 'winner chose to bowl; the over opens fresh');
    const roles = SRV.rolesOf(m.pub);
    // Over setup: bowler only, only while fresh.
    assert(code(() => r(m, roles.batter, 'setup', { field: 'attacking' })) === 'not_bowler', 'only the bowler sets the field');
    m = r(m, roles.bowler, 'setup', { type: 'spin', field: 'protectOff' }).match;
    assert(m.pub.over.type === 'spin' && m.pub.over.field === 'protectOff', 'bowler sets type + field for the over');
    assert(code(() => r(m, roles.bowler, 'bowl', { ballNo: 0, line: 'off', length: 'good', variation: 'slower', m: 400 }, m.pub.meterAt + 400)) === 'bad_delivery', 'variation must match the bowling type');
    const bowled = r(m, roles.bowler, 'bowl', { ballNo: 0, line: 'off', length: 'good', variation: 'armBall', m: 400, rtt: 50 }, m.pub.meterAt + 400).match;
    assert(bowled.pub.ball && bowled.pub.ball.variation === undefined && bowled.server.ball.del.variation === 'armBall', 'the variation stays hidden from the batter');
    assert(code(() => r(bowled, roles.bowler, 'setup', { field: 'attacking' })) !== '', 'no field change mid-over');
    // Disconnect: the absent bowler's balls are auto-bowled (stock), counted as AFK; 3 → forfeit.
    const pres = (mm, atA, atB) => {
      mm.presence = { [A]: { at: atA, online: true }, [B]: { at: atB, online: atB >= now - 1000 } };
      return mm;
    };
    let dm = pres(clone(m), now, now);
    dm.presence[roles.bowler] = { at: now - 30000, online: false };
    let t = dm.pub.deadline + 1;
    let res = SRV.reduceMatch(dm, roles.batter, 'tick', {}, t, rng);
    assert(res.result.autoBowled && res.match.server.ball.plan.variation === 'stock' && res.match.pub.misses[roles.bowler] === 1, 'disconnected bowler: the server bowls a stock ball (miss 1)');
    dm = res.match;
    // Batter plays it, then the bowler misses twice more → forfeit on the third.
    for (let k = 2; k <= 3; k++) {
      const b = dm.pub.ball;
      t = b.startAt + CM.tapFor(b, 'perfect') + 20;
      const hit = SRV.reduceMatch(dm, roles.batter, 'hit', { ballNo: b.n, shot: 'defend', run: 'hold', t: CM.tapFor(b, 'perfect'), rtt: 40 }, t, rng);
      dm = hit.match;
      if (dm.pub.phase === 'review') dm = SRV.reduceMatch(dm, dm.pub.review.byUid, 'review', { ballNo: dm.pub.review.n, review: false }, t + 10, rng).match;
      dm.presence[roles.batter] = { at: dm.pub.deadline, online: true };
      res = SRV.reduceMatch(dm, roles.batter, 'tick', {}, dm.pub.deadline + 1, rng);
      dm = res.match;
      if (k < 3) assert(res.result.autoBowled && dm.pub.misses[roles.bowler] === k, 'missed turn ' + k + ' auto-bowled');
    }
    assert(dm.pub.status === 'over' && dm.pub.winner === roles.batter && dm.pub.reason === 'afk', 'three missed turns forfeit the match');
    // Ball timeout → auto-defend (late); the batter's AFK counter counts.
    const bm = pres(clone(bowled), now, now);
    const td = SRV.reduceMatch(bm, roles.bowler, 'tick', {}, bowled.pub.deadline + 1, rng);
    const tev = td.match.pub.log[0] || td.match.server.pending;
    assert(td.result.timeout && tev.auto === 'defend' && tev.timing === 'late' && td.match.pub.misses[roles.batter] === 1, 'no tap in time → auto-defend (late), AFK counted');
    // Gone past the reconnect window → forfeit.
    const gone = pres(clone(bowled), now + SRV.RECONNECT_MS + 5000, now);
    gone.presence[roles.bowler] = { at: now - 10, online: false };
    const fg = SRV.reduceMatch(gone, roles.batter, 'tick', {}, now + SRV.RECONNECT_MS + 5000, rng);
    assert(fg.result.forfeit && fg.match.pub.winner === roles.batter && fg.match.pub.reason === 'disconnect', 'past the reconnect window → forfeit');
    // Spectators: ticks are no-ops, player ops rejected.
    assert(SRV.reduceMatch(clone(bowled), 'watcher01', 'tick', {}, now, rng) === null, 'a spectator tick does nothing');
    assert(code(() => SRV.reduceMatch(clone(bowled), 'watcher01', 'comment', { inn: 0, over: 0 }, now, rng)) === 'not_in_match', 'spectators can’t trigger AI calls');
    // Rejoin during an innings break keeps the break + its clock.
    const brk = clone(bowled);
    brk.pub.phase = 'break';
    brk.pub.ball = null;
    brk.server.ball = null;
    brk.pub.deadline = now + 4000;
    const rj = SRV.reduceMatch(brk, roles.bowler, 'join', { name: 'Back' }, now + 100, rng).match;
    assert(rj.pub.phase === 'break' && rj.pub.deadline === now + 4000 && rj.pub.status === 'playing', 'the innings break survives a reconnect');
    // AFK timers per ball.
    assert(bowled.pub.deadline === bowled.pub.ball.startAt + bowled.pub.ball.runupMs + bowled.pub.ball.flightMs + SRV.GRACE_MS, 'every ball carries its own AFK deadline');
    // Rematch: the previous toss loser chooses (no coin).
    const ov = clone(m);
    ov.pub.status = 'over';
    let rm = SRV.reduceMatch(ov, A, 'rematch', {}, now, rng);
    rm = SRV.reduceMatch(rm.match, B, 'rematch', {}, now, rng);
    assert(rm.result.createNext.chooser === loser, 'rematch swaps the toss: the previous loser chooses');
    const nx = SRV.newMatch(Object.assign({ now }, rm.result.createNext));
    let n2 = SRV.reduceMatch(clone(nx), A, 'join', { matchId: nx.pub.matchId, name: 'Ava' }, now, rng).match;
    n2 = SRV.reduceMatch(n2, B, 'join', { matchId: nx.pub.matchId, name: 'Ben' }, now, rng).match;
    assert(n2.pub.phase === 'choose' && n2.pub.toss.winner === loser && n2.pub.toss.rematch, 'rematch opens straight on the choice');
  }

  // ---------------------------------------------------------------- full Live Standard match
  {
    const A = 'userAAAA01';
    const B = 'userBBBB02';
    const MID = 'dm_p11_live';
    function fakeAdmin() {
      const store = {};
      const get = (p) => p.split('/').reduce((o, k) => (o == null ? undefined : o[k]), store);
      const set = (p, v) => {
        const ks = p.split('/');
        let o = store;
        ks.slice(0, -1).forEach((k) => {
          o[k] = o[k] || {};
          o = o[k];
        });
        if (v === undefined) delete o[ks[ks.length - 1]];
        else o[ks[ks.length - 1]] = v;
      };
      const db = {
        ref: (p) => ({
          async transaction(fn) {
            const cur = get(p);
            const next = fn(cur == null ? null : clone(cur));
            if (next === undefined) return { committed: false };
            set(p, next == null ? undefined : clone(next));
            return { committed: true };
          },
          async once() {
            const v = get(p);
            return { val: () => (v == null ? null : clone(v)) };
          },
        }),
      };
      return { get, set, app: { database: () => db, firestore: () => ({}) } };
    }
    const aiCall = async (opts) => {
      const c = opts.messages[0].content;
      const mm = c.match(/index = position\): (\[[\s\S]*?\])\n/);
      if (mm) {
        const ms = JSON.parse(mm[1]);
        return { text: JSON.stringify({ lines: ms.map((m, i) => ({ i, line: (m.bat || 'The batter') + (m.kind === 'six' ? ' clears the rope' : ' shapes this over') })) }) };
      }
      return { text: JSON.stringify({ recap: 'A proper contest on a fair pitch. The chase came down to the final overs.' }) };
    };
    async function playLive(seed) {
      const F = fakeAdmin();
      const ai = DAI.createDangalAI({ env: { AI_FEATURES_ENABLED: 'true', AI_DAILY_CALL_CAP: '500' }, userCap: 500, callAI: aiCall });
      const econ = { resolveGame: async () => ({ chipDelta: 20, eloDelta: 9, opponent: { chipDelta: -20, eloDelta: -9 } }) };
      const rng = CM.mulberry32(seed);
      let clock = 7000000;
      const call = (uid, op, a) => SRV.cricketMatch(F.app, uid, Object.assign({ op, matchId: MID }, a || {}), { now: clock, rng, econ, ai });
      const pubNow = () => SRV.hydrate({ pub: clone(F.get('games/cricket/' + MID + '/pub')) }).pub;
      const presence = (uid, at, online) => F.set('games/cricket/' + MID + '/presence/' + uid, { at, online });
      const stats = { reviews: 0, auto: false, rejoined: false, breakRejoin: false, comments: 0, toss: '', errors: [] };
      await call(A, 'join', { opponentUid: B, playerA: A, name: 'Ava', format: 'standard', preset: 'standard', persona: 'calm' });
      await call(B, 'join', { opponentUid: A, name: 'Ben' });
      let pub = pubNow();
      stats.toss = pub.phase;
      await call(pub.toss.caller, 'call', { call: 'heads' });
      clock += SRV.COIN_MS;
      pub = pubNow();
      await call(pub.toss.winner, 'choose', { bat: true });
      const asked = {};
      const plans = [
        { line: 'off', length: 'good', variation: 'stock' },
        { line: 'middle', length: 'full', variation: 'stock' },
        { line: 'off', length: 'short', variation: 'stock' },
        { line: 'leg', length: 'full', variation: 'stock' },
      ];
      let guard = 0;
      while ((pub = pubNow()).status === 'playing' && guard++ < 800) {
        presence(A, clock, true);
        if (!(stats.auto && !stats.rejoined)) presence(B, clock, true);
        const st = SRV.stateOf(pub);
        const roles = SRV.rolesOf(pub, st);
        try {
          if (pub.phase === 'bowl') {
            clock = Math.max(clock, pub.meterAt) + 400;
            if (!stats.auto && pub.log.length >= 6 && roles.bowler === B) {
              presence(B, clock - 30000, false);
              clock = pub.deadline + 1;
              const t = await call(A, 'tick', {});
              stats.auto = !!t.autoBowled && pubNow().misses[B] === 1;
              continue;
            }
            if (pub.over && pub.over.fresh && (pub.log.length / 2) % 2 === 0) await call(roles.bowler, 'setup', { field: pub.log.length % 3 ? 'balanced' : 'attacking' });
            const p = plans[pub.log.length % plans.length];
            await call(roles.bowler, 'bowl', Object.assign({ ballNo: pub.log.length, m: 400, rtt: 60 }, p));
          } else if (pub.phase === 'ball') {
            if (stats.auto && !stats.rejoined) {
              await call(B, 'join', { opponentUid: A, name: 'Ben' });
              presence(B, clock, true);
              stats.rejoined = pubNow().status === 'playing';
            }
            const b = pub.ball;
            const leave = (b.line === 'middle' || b.line === 'leg') && (b.length === 'full' || b.length === 'yorker') && b.n % 2 === 0;
            const shot = leave ? 'leave' : CM.bestShot(b, 0.6, pub.over ? pub.over.field : 'balanced', 'stay');
            const t = CM.tapFor(b, b.n % 5 === 0 ? 'late' : 'perfect');
            clock = b.startAt + t + 30;
            await call(roles.batter, 'hit', { ballNo: b.n, shot, foot: 'stay', run: 'one', t, rtt: 60 });
          } else if (pub.phase === 'review') {
            clock += 600;
            await call(pub.review.byUid, 'review', { ballNo: pub.review.n, review: true });
            stats.reviews++;
          } else if (pub.phase === 'break') {
            if (!stats.breakRejoin) {
              const before = pub.deadline;
              await call(B, 'join', { opponentUid: A, name: 'Ben' });
              const after = pubNow();
              stats.breakRejoin = after.phase === 'break' && after.deadline === before;
            }
            clock = pub.deadline + 1;
            await call(A, 'tick', {});
          } else break;
        } catch (e) {
          stats.errors.push(pub.phase + ':' + (e.code || e.message));
          clock += 500;
        }
        // AI: player A asks once per completed over.
        const s2 = SRV.stateOf(pubNow());
        s2.innings.forEach((I) => {
          const done = I.complete ? Math.ceil(I.legal / 6) : Math.floor(I.legal / 6);
          for (let o = 0; o < done; o++) {
            const k = 'o' + I.n + '_' + o;
            if (asked[k]) continue;
            asked[k] = 1;
            clock += 50;
            stats.comments++;
            // eslint-disable-next-line no-await-in-loop
            call(A, 'comment', { inn: I.n, over: o }).catch((e) => stats.errors.push('comment:' + (e.code || e.message)));
          }
        });
        await new Promise((res) => setImmediate(res));
      }
      await new Promise((res) => setTimeout(res, 20));
      pub = pubNow();
      const st = SRV.stateOf(pub);
      st.innings.forEach((I) => {
        for (let o = 0; o < Math.ceil(I.legal / 6); o++) {
          const k = 'o' + I.n + '_' + o;
          if (!asked[k]) {
            asked[k] = 1;
            stats.comments++;
            call(A, 'comment', { inn: I.n, over: o }).catch(() => {});
          }
        }
      });
      await new Promise((res) => setTimeout(res, 20));
      await call(A, 'recap', {});
      return { pub: pubNow(), stats, F };
    }
    let run = null;
    for (let seed = 1; seed <= 25; seed++) {
      const r = await playLive(seed * 7919);
      if (r.stats.reviews >= 1 && r.pub.status === 'over' && r.stats.auto) {
        run = r;
        break;
      }
      run = r;
    }
    const { pub, stats } = run;
    const st = SRV.stateOf(pub);
    assert(stats.toss === 'toss' && pub.toss && pub.toss.coin && pub.toss.choice, 'Live match opened with a coin toss and a choice');
    assert(pub.status === 'over' && st.result && pub.result === st.result.text, 'Live Standard match ran to a result: ' + pub.result);
    assert(pub.rated === true, 'the match was rated');
    assert(stats.reviews >= 1 && pub.log.some((e) => e.drs), 'a DRS review went through the server review phase (' + stats.reviews + ')');
    assert(stats.auto && stats.rejoined, 'disconnect: stock ball auto-bowled, then the player rejoined');
    assert(stats.breakRejoin, 'a rejoin during the innings break kept the break');
    const aiKeys = Object.keys(pub.ai || {}).filter((k) => /^o\d+_\d+$/.test(k));
    const lines = [];
    aiKeys.forEach((k) => (Array.isArray(pub.ai[k]) ? pub.ai[k] : []).forEach((x) => lines.push(x)));
    const mkeys = new Set(CC.keyMoments(st).map((m) => m.key));
    assert(aiKeys.length >= 1 && lines.length >= 1 && lines.every((x) => mkeys.has(x.k)), `per-over AI lines stored and keyed to moments (${aiKeys.length} overs, ${lines.length} lines)`);
    assert(pub.ai.recap && pub.ai.recap.source === 'ai' && pub.ai.recap.text.length > 20, 'AI recap stored for the share card');
    assert(pub.settlement && pub.settlement[A] && pub.settlement[B], 'match settled (virtual chips + rating)');
    const share = CE.shareSummary(st);
    assert(share.lines.length === 2 && share.result === pub.result, 'share card summary lines + result');
    assert(!stats.errors.filter((e) => !/stale_ball|over_live|not_your_turn/.test(e)).length, 'no unexpected errors in the Live run ' + JSON.stringify(stats.errors.slice(0, 5)));
  }

  // ---------------------------------------------------------------- wiring
  {
    const kit = read('public/src/js/games/party-kit.js');
    ['cricket-model', 'cricket-engine', 'cricket-commentary', 'cricket-scene'].forEach((f) => assert(new RegExp("streetcricket:\\s*\\[[^\\]]*'games/" + f + "\\.js'").test(kit), 'LAZY_DATA loads ' + f));
    const html = read('public/index.html');
    ['cricket-model', 'cricket-commentary', 'cricket-scene'].forEach((f) => assert(new RegExp('data-party-lazy src="/src/js/games/' + f + '\\.js').test(html), 'index.html lazy tag for ' + f));
    const rw = read('public/src/js/games/rw-sports.js');
    ['call', 'choose', 'setup', 'bowl', 'hit', 'review', 'comment', 'recap', 'tick', 'rematch'].forEach((op) => assert(new RegExp("liveCall\\('" + op + "'").test(rw), 'client sends ' + op));
    assert(/spectate/.test(rw) && /watch:\s*lazy\(watch\)/.test(rw), 'spectator mode wired (StreetCricketGame.watch)');
    assert(/HIGH_RTT_MS/.test(rw) && /netHtml/.test(rw), 'connection indicator + latency warning');
    assert(/dangal_ai/.test(rw) && /aiSession\.off/.test(rw), 'local AI commentary with a session off-switch');
    assert(/CricketScene/.test(rw) && /scene\.replay/.test(rw) && /scene\.drs/.test(rw), 'scene: replay + DRS view');
    assert(!/liveCall\('hit',[^)]*\bruns\b/.test(rw) && !/function resolveStreetBall/.test(rw), 'the phone never sends runs or resolves balls');
    assert(/speak/.test(rw) && /settings\(\)\.voice/.test(rw), 'optional voice behind a setting');
    assert(/\bBot\b/.test(rw) && !/Play vs AI/.test(rw), 'bots are labelled Bot');
    assert(typeof Scene.create === 'function' && typeof Scene.speak === 'function' && Scene.LINE_X.off < 0, 'scene module loads headless (off side drawn left)');
    const all = ['public/src/js/games/cricket-model.js', 'public/src/js/games/cricket-commentary.js', 'public/src/js/games/cricket-scene.js', 'public/src/js/games/rw-sports.js', 'server-lib/cricket-engine.js', 'server-lib/dangal-ai.js'].map(read).join('\n');
    assert(!/sk-ant-|AIza[0-9A-Za-z_-]{20,}|xai-[A-Za-z0-9]{10,}/.test(all), 'no API keys embedded');
    assert(!/\b(Wordle|skribbl)\b/i.test(all), 'no banned names');
    assert(!/\b(Virat|Kohli|Dhoni|Tendulkar|Babar|Root|Stokes|IPL|BCCI|ECB|Big Bash)\b/.test(read('public/src/js/games/cricket-commentary.js')), 'no real players, teams or leagues in commentary');
    const apiFiles = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js'));
    assert(apiFiles.length === 12, 'api/*.js = 12 (' + apiFiles.length + ')');
    assert(/test-dangal-p11-cricket\.js/.test(read('package.json')), 'package.json runs the P11 test');
    const rules = JSON.parse(read('firebase/database.rules.json'));
    assert(rules.rules.games.cricket.$matchId.pub['.read'] === 'auth != null', 'RTDB: signed-in spectators can read the scorecard node');
    const pol = require(path.join(root, 'public/src/js/dangal/dangal-live-policy.js')).policyFor('streetcricket');
    assert(pol.spectate === true && pol.afk.maxMisses === 3, 'live policy: spectate on, 3 misses forfeit');
    const media = read('api/media-config.js');
    assert(/reason: out\.reason/.test(media), 'dangal_ai returns the fallback reason (client stops asking when AI is off)');
  }

  if (failed) {
    console.error('\n' + failed + ' failed');
    process.exit(1);
  }
  console.log('\nAll P11 Street Cricket tests passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
