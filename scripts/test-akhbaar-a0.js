/**
 * Akhbaar A0 — live vs Sample honesty, no fake proof %, blank category empty.
 */
'use strict';

const fs = require('fs');
const path = require('path');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  console.log('✓', msg);
}

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const akhbaar = read('public/src/js/features/akhbaar.js');
const main = read('public/src/js/main.js');
const samples = read('public/src/js/data/samples.js');
const catbar = read('public/src/js/features/akhbaar-catbar.js');
const streak = read('public/src/js/features/streak.js');
const modes = read('public/src/js/core/section-modes.js');
const conventions = read('CONVENTIONS.md');

assert(/akhbaarLiveSet/.test(main) && /akhbaarLiveSet/.test(akhbaar), 'live-set flag from daily_sets');
assert(/akhbaar-truth-badge|applyAkhbaarTruthBadge/.test(akhbaar), 'Sample/Offline truth badge');
assert(/Sample practice|Offline practice/.test(akhbaar), 'results/badge not live Aaj ka when sample');
assert(!/% of players got this right/.test(akhbaar), 'no invented player % UI');
assert(!/social-proof/.test(akhbaar) || /A0:.*no invented/.test(akhbaar), 'social-proof reveal removed');
assert(!/fb\.classList\.toggle\('flagged'\)/.test(akhbaar), 'no fake flag success toggle');
assert(/data-akhbaar-flag|openAkhbaarFlagSheet/.test(akhbaar), 'A1 flag entry (real sheet)');
assert(/Streak Kept/.test(akhbaar) === false, 'no Streak Kept lie');
assert(/never pre-bump streak|saveStreak/.test(akhbaar), 'streak save without pre-bump');
assert(/akhbaarIsLiveSet\(\)/.test(akhbaar) && /data-breaking/.test(akhbaar), 'breaking toast gated on live');
assert(/Thanks — noted/.test(akhbaar), 'Aur Sunao calm toast');
assert(/!q\.personal|filter\(\(q\)=>!q\.personal\)/.test(akhbaar), 'signed-in strips SAMPLE personal');
assert(/No questions in this category/.test(catbar), 'category empty honesty');
assert(/Clear filter|Back to Khabar/.test(catbar), 'category empty recovery CTAs');
assert(/top players/.test(streak) === false, 'milestone no top-players brag');
assert(/Highlights|Also worth a look|More picks/.test(modes), 'Surkhiya bands softened');
assert(/proof:null/.test(samples) && /Riya/.test(samples), 'sample proof nulled; Riya labeled sample');
assert(/Sample: Women's teams|isSample:true/.test(samples), 'SAMPLE bonus not live Taaza headline');
assert(/Akhbaar A0/.test(conventions), 'CONVENTIONS documents A0');

const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js === 12 (got ${apiCount})`);

console.log('\nAkhbaar A0 checks passed.');
