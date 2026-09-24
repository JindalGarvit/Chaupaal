/**
 * Akhbaar A3 — finish-set streaks + real proof % when N.
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
const streak = read('public/src/js/features/streak.js');
const media = read('api/media-config.js');
const proofLib = read('server-lib/akhbaar-proof.js');
const rules = read('firebase/firestore.rules');
const conventions = read('CONVENTIONS.md');

assert(/saveStreak\(\{requireLive:true\}\)/.test(akhbaar), 'streak save gated requireLive');
assert(/Already counted today/.test(akhbaar), 'honest already-counted copy');
assert(/Practice complete — streak counts on live/.test(akhbaar), 'Sample streak policy');
assert(/akhbaarIsLiveSet\(\)/.test(akhbaar) && /daily_scores/.test(akhbaar), 'scores write live-gated');
assert(/requireLive/.test(streak) && /akhbaarLiveSet/.test(streak), 'saveStreak refuses Sample');
assert(/alreadyCounted/.test(streak), 'saveStreak returns alreadyCounted');
assert(/days in a row/.test(streak), 'milestone honest days-in-a-row');
assert(!/top players/i.test(streak), 'no fake top players');
assert(!/Streak Kept/.test(akhbaar) && !/Streak Kept/.test(streak), 'no Streak Kept theater');
assert(/AKHBAAR_PROOF_MIN_N\s*=\s*10/.test(akhbaar) && /PROOF_MIN_N\s*=\s*10/.test(proofLib), 'N=10 threshold');
assert(/akhbaar_record_answer/.test(media) && /akhbaar_get_proof/.test(media), 'proof folded into media-config');
assert(/daily_scores.*tallies|tallies/.test(proofLib) && /answers/.test(proofLib), 'tally + answer paths');
assert(/fillAkhbaarProofSlot|formatAkhbaarProofLine/.test(akhbaar), 'proof UI from aggregates');
assert(!/data\.proof/.test(akhbaar) || /Never use authored/.test(akhbaar), 'no authored proof UI path');
assert(/match \/daily_scores\/\{date\}\/tallies/.test(rules), 'tallies rules read-auth write-admin');
assert(/Akhbaar A3/.test(conventions), 'CONVENTIONS documents A3');

const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js === 12 (got ${apiCount})`);

console.log('\nAkhbaar A3 checks passed.');
