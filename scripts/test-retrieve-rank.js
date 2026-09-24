/**
 * Unit tests for retrieve-rank (P6) — pure math, no network.
 */
const {
  rankCandidates,
  rankContentItems,
  rankManchLibrary,
  rankAkhbaarCategories,
  applyExplorationSlice,
  EXPLORATION_RATIO,
  CONTENT_WEIGHTS,
  MODEL_FEATURE_WEIGHTS,
  retrieveViaVectorIndex,
  profileEmbeddingVector,
  scorePeopleByEmbedding,
  VECTOR_PREFILTER_CAP,
  VECTOR_HYDRATE_CAP,
} = require('../server-lib/retrieve-rank');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  console.log('✓', msg);
}

assert(EXPLORATION_RATIO > 0.1 && EXPLORATION_RATIO < 0.3, 'exploration ratio ~18%');
assert(CONTENT_WEIGHTS.velocity > 0 && MODEL_FEATURE_WEIGHTS.topicOverlap > 0, 'weights documented');

const viewer = {
  uid: 'v1',
  age: 28,
  gender: 'male',
  city: 'Mumbai',
  profile: { currentCity: 'Mumbai', interests: ['Travel', 'Sports'], lookingFor: 'Friendship' },
  profileEmbedding: { vector: [1, 0, 0] },
};
const model = {
  coldStart: false,
  behavioral: true,
  topics: { Travel: 0.9, Sports: 0.7, Politics: 0.1 },
  people: { friend1: 0.8 },
  games: { wordguess: 0.9 },
  formats: { photo: 0.6, question: 0.5 },
  rhythm: { hourBuckets: { '19': 4 } },
  social: { intentBucket: 'friendship', openToMeet: true, strangerComfort: 0.6 },
};

const candidates = [
  {
    uid: 'c-travel',
    openToMeet: true,
    profile: { interests: ['Travel'], currentCity: 'Mumbai' },
    profileEmbedding: { vector: [0.9, 0.1, 0] },
    lastActiveAt: Date.now(),
  },
  {
    uid: 'c-far',
    openToMeet: true,
    profile: { interests: ['Politics'], currentCity: 'Delhi' },
    profileEmbedding: { vector: [0, 1, 0] },
  },
  {
    uid: 'friend1',
    openToMeet: true,
    profile: { interests: ['Sports'], currentCity: 'Mumbai' },
    profileEmbedding: { vector: [0.5, 0.5, 0] },
    lastActiveAt: Date.now(),
  },
];

const ranked = rankCandidates({
  kind: 'people',
  viewer,
  candidates,
  model,
  plan: { searchIntent: 'friendship', hardFilters: {}, softAssumptions: {} },
  prefs: { notInterestedUids: new Set(), moreLikeUids: new Set(), interestBoost: {} },
  edgeMap: {},
  limit: 5,
});
assert(ranked.length >= 2, 'ranks people');
assert(ranked[0].explain && ranked[0].explain.length, 'explain attached');
assert(
  ranked.find((r) => r.uid === 'c-travel').score >= ranked.find((r) => r.uid === 'c-far').score,
  'topic overlap beats mismatch'
);

const opted = rankCandidates({
  kind: 'people',
  viewer,
  candidates,
  model,
  optedOut: true,
  plan: { searchIntent: 'any', hardFilters: {}, softAssumptions: {} },
  prefs: { notInterestedUids: new Set(), moreLikeUids: new Set() },
  limit: 5,
});
assert(opted.length >= 1, 'opt-out still ranks without model features');

const coldModel = { ...model, coldStart: true, topics: { Travel: 0.55 } };
const cold = rankCandidates({
  kind: 'people',
  viewer,
  candidates,
  model: coldModel,
  plan: { searchIntent: 'any', hardFilters: {}, softAssumptions: {} },
  prefs: { notInterestedUids: new Set(), moreLikeUids: new Set() },
  limit: 5,
});
assert(cold.some((r) => r.explore), 'cold start marks exploration');

const posts = [
  { id: 'p1', uid: 'a1', tag: 'Travel', ts: Date.now(), likes: 2, comments: 1, format: 'photo' },
  { id: 'p2', uid: 'a2', tag: 'Politics', ts: Date.now() - 864e5 * 5, likes: 50, comments: 10, format: 'text' },
  { id: 'p3', uid: 'v1', tag: 'x', ts: Date.now() - 60000, likes: 0, comments: 0, format: 'photo' },
];
const content = rankContentItems({
  surface: 'duniya',
  items: posts,
  model,
  opts: { viewerUid: 'v1', friendUids: [], limit: 10 },
});
assert(content[0].id === 'p3', 'own fresh post pins first');
assert(content.some((c) => c.explain?.length), 'content explain');

const noModel = rankContentItems({
  surface: 'duniya',
  items: posts.filter((p) => p.id !== 'p3'),
  model: null,
  opts: { viewerUid: 'v1' },
});
assert(noModel.length === 2, 'non-personalized path works');

const games = [
  { id: 'chess', plays: 10 },
  { id: 'wordguess', plays: 2 },
  { id: 'ludo', plays: 50 },
];
const manch = rankManchLibrary({ games, model, gotdId: 'chess', limit: 10 });
assert(manch[0].id === 'chess', 'GOTD stays first');
assert(manch.find((g) => g.id === 'wordguess').score > manch.find((g) => g.id === 'ludo').score * 0.3, 'affinity lifts played games');

const cats = rankAkhbaarCategories({
  categories: [
    { id: 'sports', name: 'Sports' },
    { id: 'tech', name: 'Tech' },
    { id: 'world', name: 'World' },
  ],
  pinnedOrder: ['tech'],
  model: { topics: { Sports: 0.9, News: 0.4 } },
});
assert(cats[0].id === 'tech', 'pinned category first');
assert(cats.findIndex((c) => c.id === 'sports') < cats.findIndex((c) => c.id === 'world'), 'model weights sports above world');

const sliced = applyExplorationSlice(
  [
    { id: 1, explore: false },
    { id: 2, explore: false },
    { id: 3, explore: true },
    { id: 4, explore: false },
    { id: 5, explore: true },
  ],
  { ratio: 0.2 }
);
assert(sliced.length === 5, 'exploration preserves length');

// ——— Vector-index (Infra I1): fixtures, no Firestore ———
assert(VECTOR_PREFILTER_CAP > 0 && VECTOR_HYDRATE_CAP > 0, 'vector Hobby caps documented');
assert(
  Array.isArray(profileEmbeddingVector(viewer)) && profileEmbeddingVector(viewer).length === 3,
  'profileEmbeddingVector reads { vector }'
);

const vectorFixtures = [
  {
    uid: 'c-travel',
    openToMeet: true,
    profile: { interests: ['Travel'], currentCity: 'Mumbai' },
    profileEmbedding: { vector: [0.95, 0.05, 0] },
  },
  {
    uid: 'c-far',
    openToMeet: true,
    profile: { interests: ['Politics'], currentCity: 'Delhi' },
    profileEmbedding: { vector: [0, 1, 0] },
  },
  {
    uid: 'c-optout',
    openToMeet: true,
    discoveryOptOut: true,
    profile: { interests: ['Travel'], currentCity: 'Mumbai' },
    profileEmbedding: { vector: [1, 0, 0] },
  },
  {
    uid: 'c-private',
    openToMeet: false,
    profile: { interests: ['Travel'], currentCity: 'Mumbai' },
    profileEmbedding: { vector: [0.99, 0.01, 0] },
  },
  {
    uid: 'c-no-embed',
    openToMeet: true,
    profile: { interests: ['Travel'], currentCity: 'Mumbai' },
  },
];

const scored = scorePeopleByEmbedding(profileEmbeddingVector(viewer), vectorFixtures, {
  uid: viewer.uid,
  viewer,
  hardCtx: {},
  plan: { hardFilters: {} },
  limit: 10,
});
assert(scored.length >= 1, 'vector scorer returns candidates with embeddings');
assert(scored[0].uid === 'c-travel', 'highest cosine first');
assert(!scored.some((c) => c.uid === 'c-optout'), 'discoveryOptOut excluded');
assert(!scored.some((c) => c.uid === 'c-private'), 'openToMeet=false excluded');
assert(!scored.some((c) => c.uid === 'c-no-embed'), 'missing embedding skipped');

(async () => {
  const hit = await retrieveViaVectorIndex({
    kind: 'people',
    uid: viewer.uid,
    viewer,
    hardCtx: {},
    plan: { hardFilters: {} },
    limit: 5,
    vectorCandidates: vectorFixtures,
  });
  assert(hit.implemented === true, 'vector-index implemented');
  assert(hit.fallthrough === false, 'fixtures yield non-fallthrough');
  assert(hit.candidates.length >= 1, 'vector-index non-empty when embeddings exist');
  assert(hit.candidates[0].uid === 'c-travel', 'vector top match is travel neighbor');
  assert(hit.method === 'pool-prefilter-cosine', 'method documented');
  assert(!hit.candidates.some((c) => c.uid === 'c-optout' || c.uid === 'c-private'), 'privacy filters on vector path');

  const miss = await retrieveViaVectorIndex({
    kind: 'people',
    uid: 'no-emb',
    viewer: { uid: 'no-emb', age: 28, profile: {} },
    vectorCandidates: vectorFixtures,
  });
  assert(miss.fallthrough === true && miss.candidates.length === 0, 'no viewer embedding → fallthrough');

  const contentStub = await retrieveViaVectorIndex({
    kind: 'content',
    uid: viewer.uid,
    viewer,
    vectorCandidates: vectorFixtures,
  });
  assert(contentStub.implemented === false, 'content vector deferred to I2');

  console.log('\nRetrieve-rank unit tests passed.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
