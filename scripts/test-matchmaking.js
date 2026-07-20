/**
 * Unit tests for matchmaking math (no Gemini network).
 */
const {
  cosineSimilarity,
  galeShapley,
  passesStructuredFilters,
  rankPersonalMatches,
  buildSemanticText,
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

console.log('\nMatchmaking unit tests passed.');
