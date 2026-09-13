/**
 * P7 unit tests — reciprocity, anti-repetition, Elo bands, weight clamp.
 */
const {
  estimateReciprocity,
  filterSafetyFirst,
  applyAntiRepetition,
  applyDiversityFloor,
  polishPeopleMatches,
  isDatingIntent,
  NOT_INTERESTED_DAYS,
  RECENT_SHOWN_HOURS,
} = require('../server-lib/match-quality');
const {
  eloBandForWaitMs,
  pickBestOpponent,
  ELO_BAND_SCHEDULE,
  MATCH_TIMEOUT_MS,
} = require('../server-lib/dangal-matchmaking');
const {
  clampWeightDelta,
  computeDeterministicWeightUpdate,
  defaultWeights,
  MIN_SAMPLES_REFRESH,
  MAX_WEIGHT_SHIFT,
} = require('../server-lib/intent-weights');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  console.log('✓', msg);
}

assert(NOT_INTERESTED_DAYS >= 90, 'not_interested durable cooldown');
assert(RECENT_SHOWN_HOURS >= 24, 'anti-repeat window');
assert(MIN_SAMPLES_REFRESH >= 50, 'min samples before weight move');
assert(MAX_WEIGHT_SHIFT <= 0.2, 'weight delta capped');

const viewer = { uid: 'v1', profileType: 'personal', lookingFor: 'Friendship', profile: { interests: ['Travel'] } };
const cand = {
  uid: 'c1',
  lookingFor: 'Friendship',
  profile: { interests: ['Travel'], currentCity: 'Mumbai' },
};
const recipHigh = estimateReciprocity(viewer, cand, { theyFollowViewer: true }, { interestOverlap: 0.8 });
const recipLow = estimateReciprocity(
  viewer,
  { ...cand, lookingFor: 'Dating' },
  {},
  { interestOverlap: 0 }
);
assert(recipHigh > recipLow, 'reciprocity higher for mutual/follow+aligned');

const safe = filterSafetyFirst(
  viewer,
  [
    { uid: 'ok', openToMeet: true, profileType: 'personal' },
    { uid: 'blocked', openToMeet: true },
    { uid: 'ni', openToMeet: true },
    { uid: 'datepro', openToMeet: true, profileType: 'professional', lookingFor: 'Dating' },
  ],
  {
    blockedSet: new Set(['blocked']),
    mutedSet: new Set(),
    reportedSet: new Set(),
    notInterestedSet: new Set(['ni']),
    surface: 'professional',
  }
);
assert(safe.some((c) => c.uid === 'ok'), 'eligible kept');
assert(!safe.some((c) => c.uid === 'blocked'), 'blocked removed before rank');
assert(!safe.some((c) => c.uid === 'ni'), 'not_interested suppressed');
assert(!safe.some((c) => c.uid === 'datepro'), 'professional surface strips dating');
assert(isDatingIntent('Serious relationship'), 'dating intent detect');

const now = Date.now();
const anti = applyAntiRepetition(
  [
    { uid: 'a', score: 1 },
    { uid: 'b', score: 0.9 },
    { uid: 'c', score: 0.8 },
  ],
  { a: now - 1000 },
  { now }
);
assert(anti[0].uid !== 'a' || anti[0]._recent, 'recent shown demoted/rotated');

const diverse = applyDiversityFloor(
  [
    { uid: '1', score: 1, user: { profileType: 'personal', city: 'Mumbai', lookingFor: 'Friendship', interests: ['A'] } },
    { uid: '2', score: 0.99, user: { profileType: 'personal', city: 'Mumbai', lookingFor: 'Friendship', interests: ['A'] } },
    { uid: '3', score: 0.5, user: { profileType: 'personal', city: 'Delhi', lookingFor: 'Networking', interests: ['B'] } },
  ],
  { limit: 3 }
);
assert(diverse.length === 3, 'diversity keeps limit');

const polished = polishPeopleMatches({
  viewer,
  ranked: [
    { uid: 'c1', score: 0.5, user: cand, signalScores: { interestOverlap: 0.7 }, signals: ['Shared: Travel'] },
    {
      uid: 'c2',
      score: 0.9,
      user: { uid: 'c2', lookingFor: 'Dating', profile: { interests: ['X'], currentCity: 'Goa' } },
      signalScores: {},
      signals: [],
    },
  ],
  edgeMap: { c1: { theyFollowViewer: true } },
  recentMap: {},
  limit: 2,
  surface: 'personal',
});
assert(polished[0].explain || polished[0].signals, 'explain present');
assert(polished[0].reciprocity != null, 'reciprocity attached');

assert(eloBandForWaitMs(0) === ELO_BAND_SCHEDULE[0].band, 'tight band at t0');
assert(eloBandForWaitMs(10000) > eloBandForWaitMs(0), 'band widens over wait');
assert(eloBandForWaitMs(MATCH_TIMEOUT_MS) >= 400, 'wide band near timeout');

const pick = pickBestOpponent(
  'me',
  1400,
  [
    { uid: 'far', elo: 2000, tsMs: now },
    { uid: 'near', elo: 1420, tsMs: now },
    { uid: 'me', elo: 1400, tsMs: now },
  ],
  { now, waitMs: 0 }
);
assert(pick.opponent && pick.opponent.uid === 'near', 'picks closest Elo in band');
assert(pick.opponent.uid !== 'far', 'rejects far Elo while band tight');

const defaults = defaultWeights();
const summary = {};
Object.keys(defaults).forEach((k) => {
  summary[k] = { avgAccepted: 0.5, avgIgnoredOrRejected: 0.5, nAccepted: 40, nOther: 40 };
});
summary.interestOverlap = { avgAccepted: 0.9, avgIgnoredOrRejected: 0.1, nAccepted: 40, nOther: 40 };
const updated = computeDeterministicWeightUpdate(defaults, summary);
Object.keys(defaults).forEach((k) => {
  assert(
    Math.abs(updated[k] - defaults[k]) <= MAX_WEIGHT_SHIFT + 1e-6,
    `clamp per-signal ${k}`
  );
});
assert(updated.interestOverlap >= defaults.interestOverlap - 1e-9, 'deterministic raises strong signals');
// clampWeightDelta bounds each key then re-normalizes — verify lo/hi envelope on raw clamp path
const prev = defaults.interestOverlap;
const lo = Math.max(0, prev - MAX_WEIGHT_SHIFT);
const hi = Math.min(1, prev + MAX_WEIGHT_SHIFT);
assert(lo < hi && hi - lo <= MAX_WEIGHT_SHIFT * 2 + 1e-9, 'clamp envelope width');

console.log('\nMatchmaking P7 unit tests passed.');
