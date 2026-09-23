/**
 * Peepal/Khoj K2 — Professional networking path.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const {
  isOpenToNetworking,
  passesNetworkingFilters,
  rankNetworkingMatches,
} = require('../server-lib/professional-match');
const { buildQueryPlan, isDatingIntent } = require('../server-lib/discovery-assumptions');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  console.log('✓', msg);
}

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const api = read('api/peepal-reactions.js');
assert(/professionalMatch|professional_match/.test(api), 'professional_match action wired');
assert(/skipped_professional/.test(api), 'personal_match still skips Pros');
assert(/mode: 'professional_networking'/.test(api) || /professional_networking/.test(api), 'networking mode');

const proMatch = read('server-lib/professional-match.js');
assert(/isOpenToNetworking/.test(proMatch), 'networking eligibility helper');
assert(/Same industry/.test(proMatch), 'industry reason copy');

assert(isOpenToNetworking({ profileType: 'professional', openToMeet: true }), 'Pro is networking-eligible');
assert(
  isOpenToNetworking({
    profileType: 'personal',
    lookingFor: 'Networking / career',
  }),
  'Personal open to network is eligible'
);
assert(
  !isOpenToNetworking({ profileType: 'personal', lookingFor: 'Dating' }),
  'Personal dating-only not networking-eligible'
);

const viewer = { uid: 'v1', profileType: 'professional', industry: 'Technology', purpose: 'Hire talent' };
const cands = [
  {
    uid: 'a',
    profileType: 'professional',
    industry: 'Technology',
    purpose: 'Find work',
    openToMeet: true,
  },
  {
    uid: 'b',
    profileType: 'personal',
    lookingFor: 'Dating',
    openToMeet: true,
  },
];
assert(passesNetworkingFilters(viewer, cands[0], {}), 'Pro cand passes');
assert(!passesNetworkingFilters(viewer, cands[1], {}), 'Dating-only Personal fails');
const ranked = rankNetworkingMatches({ viewer, candidates: [cands[0]], limit: 5, intent: 'hiring' });
assert(ranked.length === 1 && /industry|hiring|work|Professional/i.test(ranked[0].reason || ranked[0].signals?.join(' ')), 'reasons mention industry/purpose');

const planPro = buildQueryPlan({
  query: 'someone to date near me',
  chipIntent: 'dating',
  viewer: { profileType: 'professional', gender: 'male' },
  aiEnabled: false,
});
assert(
  !planPro.appliedAssumptionIds.includes('dating_opposite_gender'),
  'Pro viewer suppresses dating_opposite_gender'
);

const planPersonal = buildQueryPlan({
  query: 'someone to date near me',
  chipIntent: 'dating',
  viewer: { profileType: 'personal', gender: 'male', age: 28 },
  aiEnabled: false,
});
assert(
  planPersonal.appliedAssumptionIds.includes('dating_opposite_gender'),
  'Personal dating still gets opposite-gender default'
);

const khoj = read('public/src/js/features/khoj.js');
assert(/INTENT_CHIPS_PRO/.test(khoj), 'Pro chip set');
assert(/Networking/.test(khoj) && !/INTENT_CHIPS_PRO[\s\S]*Dating/.test(khoj.split('INTENT_CHIPS_PERSONAL')[0]), 'Pro chips exclude Dating primary');
assert(/khoj_sub_pro|Find people to work with/.test(khoj), 'Pro networking copy');

const core = read('public/src/js/core/discovery-core.js');
assert(/professional_match/.test(core), 'client peeks call professional_match');
assert(/industry/.test(core) && /purpose/.test(core), 'industry/purpose filters');

const mm = read('server-lib/matchmaking.js');
assert(/Industry:/.test(mm) && /Purpose:/.test(mm), 'semantic text includes industry/purpose');

const apiCount = fs.readdirSync(path.join(root, 'api')).filter((f) => f.endsWith('.js')).length;
assert(apiCount === 12, `api/*.js === 12 (got ${apiCount})`);

console.log('\nPeepal/Khoj K2 checks passed.');
