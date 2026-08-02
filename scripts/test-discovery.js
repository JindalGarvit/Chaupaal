/**
 * Discovery assumption engine + hard-filter recall tests.
 * Golden note: when AI_FEATURES_ENABLED=true with AI_MODEL_FAST, intent_discover
 * should parse NL via discovery_intent_parse; unit tests cover AI-off path only.
 */
const {
  buildQueryPlan,
  extractHardFilters,
  detectSuppressedAssumptions,
  passesHardEligibility,
  passesQueryHardFilters,
  softAssumptionFit,
  ASSUMPTION_VERSION,
  ASSUMPTION_CATALOGUE,
} = require('../server-lib/discovery-assumptions');
const {
  rankDiscoveryCandidates,
  parseIntentQuery,
  BATCH_INTERFACE,
} = require('../server-lib/discovery-pipeline');
const { LIMITS } = require('../server-lib/rate-limit');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  console.log('✓', msg);
}

assert(ASSUMPTION_VERSION >= 1, 'assumption version set');
assert(ASSUMPTION_CATALOGUE.some((a) => a.id === 'dating_opposite_gender'), 'catalogue has dating default');

// Underspecified dating → opposite gender
{
  const viewer = { uid: 'v1', gender: 'male', age: 28, city: 'Mumbai', profile: { currentCity: 'Mumbai' } };
  const plan = buildQueryPlan({
    query: 'someone to date near me',
    chipIntent: 'dating',
    viewer,
    aiEnabled: false,
  });
  assert(plan.searchIntent === 'dating', 'dating intent detected');
  assert(plan.appliedAssumptionIds.includes('dating_opposite_gender'), 'opposite gender applied');
  assert(plan.softAssumptions.gender === 'female', 'male seeker → female matches');
  assert(!plan.assumptionsSuppressed.includes('dating_opposite_gender'), 'not suppressed');
}

// Explicit same-gender / everyone → override
{
  const viewer = { uid: 'v1', gender: 'male', age: 28 };
  const plan = buildQueryPlan({
    query: 'dating everyone / any gender',
    chipIntent: 'dating',
    viewer,
    aiEnabled: false,
  });
  assert(plan.suppressedAssumptionIds.includes('dating_opposite_gender'), 'everyone suppresses opposite default');
  assert(!plan.appliedAssumptionIds.includes('dating_opposite_gender'), 'opposite not applied when suppressed');
}

{
  const viewer = { uid: 'v1', gender: 'female', age: 26 };
  const plan = buildQueryPlan({
    query: 'looking for same-gender dating',
    viewer,
    aiEnabled: false,
  });
  assert(detectSuppressedAssumptions(plan.query).includes('dating_opposite_gender'), 'same-gender suppresses');
}

// Unknown seeker gender → refine chips, no invented gender
{
  const viewer = { uid: 'v1', age: 30 };
  const plan = buildQueryPlan({ query: 'dating', chipIntent: 'dating', viewer, aiEnabled: false });
  assert(plan.softAssumptions.genderMode === 'unknown_seeker', 'unknown seeker gender mode');
  assert(!plan.softAssumptions.gender, 'does not invent seeker gender');
  assert(
    (plan.softAssumptions.refineChips || []).some((c) => c.id === 'gender_everyone'),
    'offers Everyone refine chip'
  );
}

// Hard filter: college + city recall
{
  const { hardFilters } = extractHardFilters('someone from IIT Bombay in Mumbai who likes music');
  assert(hardFilters.college && /iit/i.test(hardFilters.college), 'college hard filter');
  assert(hardFilters.city && /mumbai/i.test(hardFilters.city), 'city hard filter');

  const planted = {
    uid: 'plant1',
    name: 'Planted',
    openToMeet: true,
    profileType: 'personal',
    college: 'IIT Bombay',
    city: 'Mumbai',
    profile: { currentCity: 'Mumbai', college: 'IIT Bombay', interests: ['Music'] },
    interests: ['Music'],
  };
  const other = {
    uid: 'other1',
    name: 'Other',
    openToMeet: true,
    profileType: 'personal',
    city: 'Delhi',
    profile: { currentCity: 'Delhi' },
  };
  assert(passesQueryHardFilters(planted, hardFilters), 'planted college/city passes');
  assert(!passesQueryHardFilters(other, hardFilters), 'wrong city filtered');
}

// Hard eligibility: block / opt-out / shadowban / teen
{
  const viewer = { uid: 'v1', age: 25 };
  assert(
    !passesHardEligibility(viewer, { uid: 'c1', hiddenFromDiscovery: true, openToMeet: true }, {}),
    'hiddenFromDiscovery blocked'
  );
  assert(
    !passesHardEligibility(viewer, { uid: 'c1', discoveryOptOut: true, openToMeet: true }, {}),
    'opt-out blocked'
  );
  assert(
    !passesHardEligibility(viewer, { uid: 'c1', shadowbanned: true, openToMeet: true }, {}),
    'shadowban blocked'
  );
  assert(
    !passesHardEligibility(viewer, { uid: 'c1', openToMeet: true }, { blockedSet: new Set(['c1']) }),
    'block list blocked'
  );
  assert(
    !passesHardEligibility({ uid: 'v1', age: 16 }, { uid: 'c1', age: 28, openToMeet: true }, { viewerIsTeen: true }),
    'teen cannot see adult'
  );
}

// Soft assumption fit excludes wrong gender for dating default
{
  const plan = buildQueryPlan({
    query: 'dating',
    chipIntent: 'dating',
    viewer: { uid: 'v1', gender: 'male', age: 27 },
    aiEnabled: false,
  });
  const female = softAssumptionFit({ uid: 'f1', gender: 'female', age: 26 }, plan);
  const male = softAssumptionFit({ uid: 'm1', gender: 'male', age: 26 }, plan);
  assert(!female.exclude && female.fit > 0, 'opposite gender fits');
  assert(male.exclude, 'same gender excluded by dating default');
}

// AI-off chip path: friendship plan builds without LLM
{
  const plan = buildQueryPlan({
    query: 'new friends with similar interests',
    chipIntent: 'friendship',
    viewer: { uid: 'v1', gender: 'female', age: 24, city: 'Pune', profile: { currentCity: 'Pune' } },
    aiEnabled: false,
  });
  assert(plan.searchIntent === 'friendship', 'friendship chip intent');
  assert(plan.aiEnabled === false, 'AI off');
  assert(!plan.appliedAssumptionIds.includes('dating_opposite_gender'), 'no dating default for friendship');
}

// Ranker floats college hard-filter hit near top
{
  const viewer = {
    uid: 'v1',
    gender: 'male',
    age: 22,
    profileEmbedding: { vector: [1, 0, 0] },
    profile: { interests: ['Tech'], currentCity: 'Mumbai' },
  };
  const plan = buildQueryPlan({
    query: 'people from IIT Bombay',
    viewer,
    aiEnabled: false,
  });
  const planted = {
    uid: 'plant1',
    gender: 'female',
    age: 22,
    college: 'IIT Bombay',
    profile: { college: 'IIT Bombay', currentCity: 'Mumbai', interests: ['Tech'] },
    profileEmbedding: { vector: [0.2, 0.9, 0] },
    openToMeet: true,
    profileType: 'personal',
  };
  const filler = {
    uid: 'fill1',
    gender: 'female',
    age: 22,
    profile: { currentCity: 'Mumbai', interests: ['Tech'] },
    profileEmbedding: { vector: [0.99, 0.1, 0] },
    openToMeet: true,
    profileType: 'personal',
  };
  const ranked = rankDiscoveryCandidates({
    viewer,
    candidates: [filler, planted].filter((c) => passesQueryHardFilters(c, plan.hardFilters)),
    edgeMap: {},
    plan,
    weights: null,
    prefs: { moreLikeUids: new Set(), notInterestedUids: new Set(), interestBoost: {} },
    limit: 5,
  });
  assert(ranked.length >= 1 && ranked[0].uid === 'plant1', 'specific college recall near top');
}

// Preference deltas: not_interested hard-drops; more_like boosts
{
  const viewer = {
    uid: 'v1',
    gender: 'male',
    age: 25,
    profile: { interests: ['Music'], currentCity: 'Pune' },
    profileEmbedding: { vector: [1, 0, 0] },
  };
  const plan = buildQueryPlan({
    query: 'friends who like music',
    chipIntent: 'friendship',
    viewer,
    aiEnabled: false,
  });
  const a = {
    uid: 'a1',
    gender: 'female',
    age: 24,
    openToMeet: true,
    profileType: 'personal',
    interests: ['Music'],
    profile: { interests: ['Music'], currentCity: 'Pune' },
    profileEmbedding: { vector: [0.9, 0.1, 0] },
  };
  const b = {
    uid: 'b1',
    gender: 'female',
    age: 24,
    openToMeet: true,
    profileType: 'personal',
    interests: ['Music'],
    profile: { interests: ['Music'], currentCity: 'Pune' },
    profileEmbedding: { vector: [0.85, 0.15, 0] },
  };
  const dropped = rankDiscoveryCandidates({
    viewer,
    candidates: [a, b],
    edgeMap: {},
    plan,
    weights: null,
    prefs: {
      moreLikeUids: new Set(),
      notInterestedUids: new Set(['a1']),
      interestBoost: {},
    },
    limit: 5,
  });
  assert(dropped.every((r) => r.uid !== 'a1'), 'not_interested uid excluded from rank');

  const boosted = rankDiscoveryCandidates({
    viewer,
    candidates: [a, b],
    edgeMap: {},
    plan,
    weights: null,
    prefs: {
      moreLikeUids: new Set(['b1']),
      notInterestedUids: new Set(),
      interestBoost: {},
    },
    limit: 5,
  });
  assert(boosted[0].uid === 'b1', 'more_like uid floats above near-peer');
}

assert(LIMITS.discovery && LIMITS.discovery.minute === 20 && LIMITS.discovery.hour === 200, 'discovery rate limits registered');
assert(BATCH_INTERFACE.collection === 'discoveryQueryLogs', 'batch interface collection');
assert(BATCH_INTERFACE.labelsCollection === 'discoveryPreferenceDeltas', 'batch labels collection');
assert(Object.isFrozen(BATCH_INTERFACE), 'batch interface frozen');

// parseIntentQuery: AI-off and LLM failure both stay deterministic
(async () => {
  const off = await parseIntentQuery({
    query: 'dating in Delhi',
    chipIntent: 'dating',
    aiEnabled: false,
  });
  assert(off.usedLlm === false, 'AI-off parse skips LLM');
  assert(off.parsed.searchIntent === 'dating', 'chip intent preserved when AI off');

  const fail = await parseIntentQuery({
    query: 'dating',
    chipIntent: 'dating',
    aiEnabled: true,
    callAI: async () => {
      throw new Error('provider down');
    },
  });
  assert(fail.usedLlm === false, 'LLM failure falls back without usedLlm');
  assert(fail.parsed.searchIntent === 'dating', 'fallback keeps chip intent');
  assert(!!fail.parseError, 'parseError recorded on failure');

  console.log('\nDiscovery assumption / recall unit tests passed.');
  console.log('Golden (manual): set AI_FEATURES_ENABLED=true + AI_MODEL_FAST → POST intent_discover with NL query; expect mode=ai_parse.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
