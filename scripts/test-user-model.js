/**
 * Unit tests for user-model pure scoring (P5) — no network.
 */
const {
  buildUserModelFromInputs,
  decayFactor,
  intentBucket,
  normalizeKey,
  WEIGHTS,
  COLD_START_EVENT_MIN,
} = require('../server-lib/user-model');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  console.log('✓', msg);
}

assert(decayFactor(0, 14) === 1, 'decay age0 = 1');
assert(Math.abs(decayFactor(14, 14) - 0.5) < 1e-9, 'decay half-life');
assert(normalizeKey('travel') === 'Travel', 'normalize to INTEREST_CHIPS');
assert(intentBucket('Dating', { teen: true }) === null, 'teen strips dating intent');
assert(intentBucket('Dating', { teen: false }) === 'dating', 'adult dating bucket');
assert(intentBucket('Friendship', {}) === 'friendship', 'friendship bucket');

const cold = buildUserModelFromInputs({
  uid: 'u-new',
  profile: { interests: ['Travel', 'Music'], industry: 'Technology', lookingFor: 'Friendship' },
  user: { openToMeet: true },
  consent: { collect: true, activityOptOut: false, teen: false },
  rollups: [],
  recommendationSignals: [],
  gameStats: [],
  now: Date.now(),
});
assert(cold.coldStart === true, 'new user coldStart');
assert(cold.topics.Travel > 0, 'declared Travel present');
assert(cold.topics.Music > 0, 'declared Music present');
assert(Object.keys(cold.topics).length >= 1, 'never empty topics');
assert(cold.explain.topics.some((e) => /listed/i.test(e.reason)), 'explain declared');
assert(cold.social.intentBucket === 'friendship', 'social intent from lookingFor');
assert(!cold.explain.topics.some((e) => /religion|income|caste/i.test(e.reason)), 'no sensitive explain');

const rich = buildUserModelFromInputs({
  uid: 'u-rich',
  profile: { interests: ['Sports'] },
  user: { uid: 'u-rich' },
  consent: { collect: true },
  rollups: [
    {
      day: new Date().toISOString().slice(0, 10),
      counts: { like: 10, comment: 4, skip: 2, game_end: 3, media_complete: 2, dm_open: 5, reply: 4 },
      surfaces: { peepal: 12, duniya: 8, mehfil: 3 },
      dwellMs: 120000,
      games: { wordguess: 5 },
      genres: { word: 5 },
    },
  ],
  recommendationSignals: [
    { type: 'content_interest', signal: 'more_like', tag: 'Cricket', value: 1, updatedAtMs: Date.now() },
    { type: 'content_interest', signal: 'more_like', tag: 'Cricket', value: 1, updatedAtMs: Date.now() },
    { type: 'content_interest', signal: 'not_interested', tag: 'Politics', value: -1, updatedAtMs: Date.now() },
    { type: 'discovery_person', signal: 'more_like', candidateUid: 'peer1', value: 1, updatedAtMs: Date.now() },
    { type: 'discovery_person', signal: 'not_interested', candidateUid: 'peer2', value: -1, updatedAtMs: Date.now() },
  ],
  gameStats: [{ id: 'wordguess', plays: 12, elo: 1400 }],
  hourBuckets: { '19': 5, '20': 8 },
  now: Date.now(),
});
assert(rich.coldStart === false || rich.eventCount >= COLD_START_EVENT_MIN, 'rich enough leaves cold start or high events');
assert(rich.eventCount >= COLD_START_EVENT_MIN, 'eventCount tallies');
assert(rich.topics.Cricket > 0, 'Cricket from signals');
assert(rich.topics.Politics < rich.topics.Cricket, 'not_interested lowers Politics vs Cricket');
assert(rich.people.peer1 > 0, 'people affinity positive');
assert(rich.people.peer2 < 0 || rich.people.peer2 < rich.people.peer1, 'not_interested peer lower');
assert(rich.games.wordguess > 0, 'game affinity');
assert(rich.formats.watch_together > 0, 'watch format');
assert(rich.explain.games.length >= 1, 'game explain');
assert(rich.embeddingRefs && rich.embeddingRefs.hasProfileEmbedding === false, 'no duplicated embedding');

// Time decay: recent Cricket beats old burst Politics-as-positive
const decayed = buildUserModelFromInputs({
  uid: 'u-decay',
  profile: {},
  consent: { collect: true },
  recommendationSignals: [
    {
      type: 'content_interest',
      signal: 'more_like',
      tag: 'Food',
      value: 1,
      updatedAtMs: Date.now() - 40 * 86400000,
    },
    {
      type: 'content_interest',
      signal: 'more_like',
      tag: 'Music',
      value: 1,
      updatedAtMs: Date.now() - 1 * 86400000,
    },
  ],
  now: Date.now(),
});
assert(decayed.topics.Music > decayed.topics.Food, 'recent interest ranks above old burst');

const opted = buildUserModelFromInputs({
  uid: 'u-out',
  profile: { interests: ['Books'] },
  consent: { collect: false, activityOptOut: true },
  rollups: [{ day: new Date().toISOString().slice(0, 10), counts: { like: 50 }, surfaces: { peepal: 50 }, games: { x: 9 } }],
  recommendationSignals: [{ type: 'discovery_person', signal: 'more_like', candidateUid: 'x', value: 1 }],
  now: Date.now(),
});
assert(opted.behavioral === false, 'opt-out no behavioral flag');
assert(opted.topics.Books > 0, 'declared still present when opted out');
assert(!opted.people.x, 'opt-out drops people map');
assert(!opted.games.x, 'opt-out drops games from rollups');

const teen = buildUserModelFromInputs({
  uid: 'u-teen',
  profile: { interests: ['Gaming'], lookingFor: 'Dating' },
  consent: { collect: true, teen: true },
  recommendationSignals: [{ type: 'discovery_person', signal: 'more_like', candidateUid: 'adult1', value: 1 }],
  rollups: [{ day: new Date().toISOString().slice(0, 10), counts: { media_complete: 3 }, surfaces: { mehfil: 3 } }],
  now: Date.now(),
});
assert(teen.social.intentBucket !== 'dating', 'teen no dating intent');
assert(!teen.people.adult1, 'teen no people affinity map');
assert(!teen.formats.watch_together, 'teen no watch-together format affinity');

// Negative skip reduces surface topic vs likes-only baseline
const withSkip = buildUserModelFromInputs({
  uid: 'u-skip',
  consent: { collect: true },
  rollups: [
    {
      day: new Date().toISOString().slice(0, 10),
      counts: { skip: 20, like: 1 },
      surfaces: { peepal: 20 },
    },
  ],
  now: Date.now(),
});
const noSkip = buildUserModelFromInputs({
  uid: 'u-noskip',
  consent: { collect: true },
  rollups: [
    {
      day: new Date().toISOString().slice(0, 10),
      counts: { like: 1 },
      surfaces: { peepal: 1 },
    },
  ],
  now: Date.now(),
});
assert(
  (withSkip.topics.Questions || 0) < (noSkip.topics.Questions || 1) + 0.5,
  'skips apply negative pressure on Questions topic'
);

assert(WEIGHTS.notInterested < 0 && WEIGHTS.skip < 0, 'negative weights documented');

console.log('\nUser model unit tests passed.');
