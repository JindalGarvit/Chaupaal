/**
 * Akhbaar A1 — play loop share/beat honesty + real question flags.
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
const safety = read('public/src/js/core/safety.js');
const referrals = read('public/src/js/core/referrals.js');
const onboarding = read('public/src/js/features/onboarding.js');
const relationships = read('api/relationships.js');
const conventions = read('CONVENTIONS.md');
const rules = read('firebase/firestore.rules');

assert(/openAkhbaarFlagSheet/.test(akhbaar) && /data-akhbaar-flag/.test(akhbaar), 'Flag CTA on news summary');
assert(/reportAkhbaarQuestion/.test(safety) && /targetType:\s*'akhbaar_question'/.test(safety), 'report writes akhbaar_question');
assert(/__akhbaar_question__/.test(safety), 'sentinel reportedUid for content flags');
assert(/user_flags/.test(safety) && /akhbaar_/.test(safety), 'user_flags + reported mirror');
assert(/showSafetyUndo|Report submitted for review/.test(safety), 'honest success + undo');
assert(/akhbaar_flag/.test(referrals) && /akhbaar_share/.test(referrals), 'soft-auth resume actions');
assert(/resumeAkhbaarPendingFlag/.test(referrals) && /resumeAkhbaarPendingFlag/.test(safety), 'flag resume after auth');
assert(/buildBeatScoreLink\('akhbaar'/.test(akhbaar), 'live beat uses /challenge/akhbaar');
assert(/Challenge a friend/.test(akhbaar) && /not a live duel room/.test(akhbaar), 'challenge CTA honest');
assert(/Sample practice — sharing/.test(akhbaar) || /Sample practice/.test(akhbaar), 'Sample share Demo framing');
assert(/data-akh-share="challenge"[\s\S]*disabled/.test(akhbaar) || /Live Akhbaar set needed to challenge/.test(akhbaar), 'Sample disables challenge');
assert(/tab=akhbaar/.test(akhbaar), 'Sample share URL is practice home, not beat link');
assert(/shared a score/.test(akhbaar) && /shared a score/.test(onboarding), 'beat/viral copy not Muqabala duel');
assert(!/duel started/i.test(akhbaar), 'no fake duel-started copy');
assert(!/% of players got this right/.test(akhbaar), 'no fake player %');
assert(/akhbaarIsLiveSet/.test(akhbaar), 'Live vs Sample chrome helpers');
assert(/allow create: if isAuth\(\) && request\.resource\.data\.reporterUid == request\.auth\.uid/.test(rules), 'user_flags client create for reporter');
assert(/targetType === 'akhbaar_question'|akhbaar_\$\{/.test(relationships), 'withdraw_flag clears akhbaar mirror');
assert(/Akhbaar A1/.test(conventions), 'CONVENTIONS documents A1');
assert(/inner\.dataset\.answered/.test(akhbaar), 'double-submit guard on answer');

const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js === 12 (got ${apiCount})`);

console.log('\nAkhbaar A1 checks passed.');
