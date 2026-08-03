/**
 * Unit tests for matchmaking math (no Gemini network).
 */
const {
  cosineSimilarity,
  galeShapley,
  passesStructuredFilters,
  rankPersonalMatches,
  buildSemanticText,
  computeSignalScores,
  asymmetricBoost,
  normalizeProfileType,
} = require('../server-lib/matchmaking');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  console.log('✓', msg);
}

assert(Math.abs(cosineSimilarity([1, 0], [1, 0]) - 1) < 1e-9, 'cosine identical');
assert(Math.abs(cosineSimilarity([1, 0], [0, 1])) < 1e-9, 'cosine orthogonal');

const prefs = {
  a: ['b', 'c'],
  b: ['a', 'c'],
  c: ['a', 'b'],
};
const partners = galeShapley(['a', 'b', 'c'], prefs);
assert(partners.a && partners[partners.a] === 'a', 'gale-shapley mutual');

const viewer = {
  uid: 'v1',
  profileType: 'personal',
  profile: { bio: 'Love trekking', interests: ['Travel'], prompts: [{ promptId: 'pp01', answer: 'Climate' }] },
  profileEmbedding: { vector: [1, 0.2, 0] },
  city: 'Mumbai',
};
const candOk = {
  uid: 'c1',
  profileType: 'personal',
  openToMeet: true,
  profile: { bio: 'Treks', interests: ['Travel'], currentCity: 'Mumbai' },
  profileEmbedding: { vector: [0.9, 0.3, 0.1] },
  name: 'Cand',
};
const candPro = { ...candOk, uid: 'c2', profileType: 'professional' };
assert(passesStructuredFilters(viewer, candOk, {}), 'personal candidate passes');
assert(!passesStructuredFilters(viewer, candPro, {}), 'professional filtered out');

const text = buildSemanticText(viewer);
assert(text.includes('Bio:') && text.includes('Prompt'), 'semantic text includes bio+prompts');
assert(!/media|voice|video/i.test(text), 'semantic text excludes media (3A)');

const ranked = rankPersonalMatches({
  viewer,
  candidates: [candOk, { ...candOk, uid: 'c3', profileEmbedding: { vector: [0, 1, 0] }, name: 'Far' }],
  limit: 2,
});
assert(ranked[0].uid === 'c1', 'higher cosine ranks first or stable');
assert(ranked[0].signals.length >= 1, 'transparency signals present');

assert(normalizeProfileType('Professional') === 'professional', 'normalize profile type');
assert(normalizeProfileType('') === 'personal', 'empty profile type defaults personal');
assert(normalizeProfileType('personal') === 'personal', 'personal stays personal');

// Signal scores: city fallback vs geo distance, follow affinity, dating boost
{
  const v = {
    uid: 'v1',
    gender: 'male',
    age: 28,
    city: 'Mumbai',
    lookingFor: 'dating',
    profile: { interests: ['Music', 'Travel'], occupation: 'Designer' },
    profileEmbedding: { vector: [1, 0, 0] },
  };
  const sameCity = {
    uid: 'c1',
    gender: 'female',
    age: 27,
    city: 'Mumbai',
    lookingFor: 'dating',
    intents: ['dating'],
    profile: { interests: ['Music'], occupation: 'PM', currentCity: 'Mumbai' },
    profileEmbedding: { vector: [0.9, 0.1, 0] },
  };
  const scores = computeSignalScores(v, sameCity, {
    theyFollowViewer: true,
    viewerFollowsThem: true,
    reactedUp: true,
  });
  assert(scores.locationProximity === 1, 'same city → locationProximity 1');
  assert(scores.interestOverlap > 0, 'shared interest overlap');
  assert(scores.followAffinity >= 0.99, 'mutual follow + react saturates affinity');
  assert(scores.genderComplement === 1, 'opposite gender complement for dating signals');
  assert(scores.occupationSignal === 1, 'both occupations present');

  const farGeo = {
    ...sameCity,
    uid: 'c2',
    city: 'Delhi',
    profile: { ...sameCity.profile, currentCity: 'Delhi' },
    matchLocation: { lat: 28.6, lng: 77.2 },
  };
  const nearViewer = {
    ...v,
    matchLocation: { lat: 19.07, lng: 72.87 },
  };
  const geoScores = computeSignalScores(nearViewer, farGeo, {});
  assert(geoScores.locationProximity === 0, 'far geo distance collapses locationProximity');

  const datingBoost = asymmetricBoost(v, sameCity, { theyFollowViewer: true }, 'dating');
  const friendBoost = asymmetricBoost(
    { ...v, lookingFor: 'friends' },
    { ...sameCity, lookingFor: 'friends', intents: ['friendship'] },
    {},
    'friendship'
  );
  assert(datingBoost > 1.2, 'dating intent applies romantic boosts');
  assert(friendBoost > 1, 'friendship intent still boosts shared interests');
}

console.log('\nMatchmaking unit tests passed.');
