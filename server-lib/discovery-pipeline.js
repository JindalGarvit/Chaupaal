/**
 * Unified intent discovery pipeline (Khoj + Vriksha intent card).
 *
 * parse → hard filters → soft assumptions → retrieve → rank → learn hooks → log
 *
 * Folded into /api/peepal-reactions (Hobby function cap — no new Vercel function).
 * AI-off path: deterministic parse + preference-weighted retrieval.
 * AI-on path: optional LLM parse via callAI, then same retrieve/rank.
 *
 * Provider swap: GEMINI_EMBED_MODEL + AI_MODEL_FAST / AI_PROVIDER via ai-config.
 */
'use strict';

const {
  buildQueryPlan,
  passesHardEligibility,
  passesQueryHardFilters,
  softAssumptionFit,
  explainMatch,
  ASSUMPTION_VERSION,
} = require('./discovery-assumptions');
const { computeSignalScores, normalizeProfileType } = require('./matchmaking');
const {
  defaultWeights,
  normalizeWeights,
  weightedScore,
  resolveIntentWeightProfile,
} = require('./intent-weights');
const { isAiFeaturesEnabled } = require('./ai-config');
const {
  buildDiscoveryCacheKey,
  readDiscoveryCandidateCache,
  writeDiscoveryCandidateCache,
  shouldCacheDiscoveryQuery,
  normalizeDiscoveryQuery,
} = require('./discovery-query-cache');

const DISCOVER_POOL = 120;
const DISCOVER_LIMIT_DEFAULT = 10;

/** Nightly batch interface (thin stub) — cron can call processDiscoveryBatchLabels. */
const BATCH_INTERFACE = Object.freeze({
  collection: 'discoveryQueryLogs',
  labelsCollection: 'discoveryPreferenceDeltas',
  jobName: 'discovery_preference_nightly',
});

async function parseIntentQuery({ query, chipIntent, aiEnabled, callAI }) {
  const base = {
    interests: [],
    ageRange: { min: null, max: null },
    gender: 'any',
    city: null,
    college: null,
  };
  if (!aiEnabled || typeof callAI !== 'function') {
    return { parsed: { ...base, searchIntent: chipIntent || undefined }, usedLlm: false };
  }
  try {
    const result = await callAI({
      tier: 'fast',
      max_tokens: 400,
      feature: 'discovery_intent_parse',
      system: `Parse people-discovery intent for Chaupaal. Return ONLY JSON:
{"interests":[],"ageRange":{"min":null,"max":null},"gender":"male"|"female"|"any","city":null,"college":null,"company":null,"searchIntent":"dating"|"friendship"|"job"|"flatmate"|"travel"|"gaming"|"music"|"cofounder"|"any","vibe":"","conversationStarter":""}
Never invent profile names. Prefer null over guesses.`,
      messages: [{ role: 'user', content: String(query || '').slice(0, 500) }],
    });
    const raw = result?.text || result?.content?.[0]?.text || '{}';
    const parsed = JSON.parse(String(raw).replace(/```json|```/g, '').trim());
    return { parsed: { ...base, ...parsed }, usedLlm: true };
  } catch (e) {
    return {
      parsed: { ...base, searchIntent: chipIntent || undefined },
      usedLlm: false,
      parseError: e?.message,
    };
  }
}

async function loadBlockMuteSets(db, uid) {
  const blockedSet = new Set();
  const mutedSet = new Set();
  try {
    const [blocks, mutes] = await Promise.all([
      db.collection('users').doc(uid).collection('blocked').limit(200).get(),
      db.collection('users').doc(uid).collection('muted').limit(200).get(),
    ]);
    blocks.docs.forEach((d) => blockedSet.add(d.id));
    mutes.docs.forEach((d) => mutedSet.add(d.id));
  } catch (e) {}
  try {
    const by = await db.collection('users').doc(uid).collection('blockedBy').limit(200).get();
    by.docs.forEach((d) => blockedSet.add(d.id));
  } catch (e) {}
  return { blockedSet, mutedSet };
}

async function loadPreferenceDeltas(db, uid) {
  const prefs = { moreLikeUids: new Set(), notInterestedUids: new Set(), interestBoost: {} };
  try {
    const snap = await db
      .collection('users')
      .doc(uid)
      .collection('recommendationSignals')
      .limit(100)
      .get();
    snap.docs.forEach((d) => {
      const x = d.data() || {};
      if (x.type !== 'discovery_person' && x.type !== 'content_interest') return;
      const target = x.candidateUid || x.authorUid;
      if (!target) return;
      if (x.signal === 'more_like' || x.value > 0) prefs.moreLikeUids.add(target);
      if (x.signal === 'not_interested' || x.value < 0) prefs.notInterestedUids.add(target);
      if (x.tag) {
        const k = String(x.tag).toLowerCase();
        prefs.interestBoost[k] = (prefs.interestBoost[k] || 0) + (Number(x.value) || 0);
      }
    });
  } catch (e) {}
  return prefs;
}

function rankDiscoveryCandidates({ viewer, candidates, edgeMap, plan, weights, prefs, limit }) {
  const w = normalizeWeights(weights || defaultWeights());
  const scored = [];

  for (const cand of candidates) {
    if (prefs?.notInterestedUids?.has(cand.uid)) continue;

    const soft = softAssumptionFit(cand, plan);
    if (soft.exclude) continue;

    const edges = edgeMap[cand.uid] || {};
    const signals = computeSignalScores(viewer, cand, edges);
    let base = weightedScore(signals, w);
    base = base * 0.72 + soft.fit * 0.28;

    if (prefs?.moreLikeUids?.has(cand.uid)) base += 0.12;
    const interests = [...(cand.interests || []), ...(cand.profile?.interests || [])];
    for (const i of interests) {
      const b = prefs?.interestBoost?.[String(i).toLowerCase()];
      if (b) base += Math.max(-0.08, Math.min(0.08, b * 0.02));
    }

    if (plan?.softAssumptions?.preferRecentlyActive) {
      const last =
        cand.lastActiveAt?.toMillis?.() || cand.lastActiveAt || cand.updatedAt?.toMillis?.() || 0;
      if (last && Date.now() - Number(last) < 7 * 864e5) base += 0.04;
    }

    const hf = plan?.hardFilters || {};
    if (hf.college || hf.city || hf.company) base += 0.18;

    scored.push({
      uid: cand.uid,
      user: cand,
      score: base,
      signalScores: signals,
      assumptionFit: soft.fit,
      explain: explainMatch(cand, plan, signals),
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(1, Math.min(20, limit || DISCOVER_LIMIT_DEFAULT)));
}

async function runIntentDiscover(db, admin, user, body, deps) {
  const query = String(body.query || body.intent || '')
    .trim()
    .slice(0, 500);
  if (!query) {
    const err = new Error('QUERY_REQUIRED');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const chipIntent = body.chipIntent || null;
  const limit = Math.min(20, Number(body.limit) || DISCOVER_LIMIT_DEFAULT);
  const viewerSnap = await db.collection('users').doc(user.uid).get();
  const viewer = { uid: user.uid, ...(viewerSnap.data() || {}) };

  const aiFlag = isAiFeaturesEnabled();
  const aiEnabled = aiFlag && body.ai !== false;

  let parsed = body.parsed || null;
  let usedLlm = false;
  if (!parsed) {
    const p = await parseIntentQuery({
      query,
      chipIntent,
      aiEnabled,
      callAI: deps?.callAI,
    });
    parsed = p.parsed;
    usedLlm = !!p.usedLlm;
  }

  const plan = buildQueryPlan({
    query,
    chipIntent,
    parsed,
    viewer,
    aiEnabled,
  });

  let intentProfileId = null;
  let weights = defaultWeights();
  try {
    const resolved = await resolveIntentWeightProfile(db, admin, {
      uid: user.uid,
      intentText: plan.searchIntent !== 'any' ? plan.searchIntent : query,
    });
    intentProfileId = resolved.profileId || null;
    if (resolved.profile?.weights) weights = normalizeWeights(resolved.profile.weights);
  } catch (e) {
    console.warn('[intent_discover] intent weights', e?.message || e);
  }

  if (!viewer.profileEmbedding && deps?.refreshEmbedding) {
    try {
      await deps.refreshEmbedding(db, admin, user.uid);
      const again = await db.collection('users').doc(user.uid).get();
      Object.assign(viewer, again.data() || {});
    } catch (e) {}
  }

  const { blockedSet, mutedSet } = await loadBlockMuteSets(db, user.uid);
  const prefs = await loadPreferenceDeltas(db, user.uid);
  const viewerAge = Number(viewer.age || viewer.profile?.age);
  const viewerIsTeen = !!(
    viewer.teenMode ||
    (Number.isFinite(viewerAge) && viewerAge > 0 && viewerAge < 18)
  );
  const hardCtx = { blockedSet, mutedSet, viewerIsTeen };

  let cacheHit = false;
  let cacheMissReason = null;
  let candidates = [];
  const keyInfo =
    shouldCacheDiscoveryQuery({ query, plan })
      ? buildDiscoveryCacheKey({ query, plan })
      : null;

  if (keyInfo) {
    const cached = await readDiscoveryCandidateCache(db, keyInfo);
    if (cached?.hit && Array.isArray(cached.candidates)) {
      cacheHit = true;
      // Re-hydrate + re-apply viewer privacy — never replay another user's final list
      const ids = cached.candidates.map((c) => c.uid).filter(Boolean).slice(0, 80);
      const scoreHint = {};
      cached.candidates.forEach((c) => {
        if (c.uid) scoreHint[c.uid] = c.score;
      });
      await Promise.all(
        ids.map(async (id) => {
          try {
            const d = await db.collection('users').doc(id).get();
            if (!d.exists) return;
            const data = { uid: d.id, ...d.data(), _cacheScore: scoreHint[id] };
            if (!passesHardEligibility(viewer, data, hardCtx)) return;
            if (!passesQueryHardFilters(data, plan.hardFilters)) return;
            candidates.push(data);
          } catch (e) {}
        })
      );
      // Quality guard: if re-filter wiped the pool, fall through to live retrieve
      if (candidates.length < 2) {
        cacheHit = false;
        cacheMissReason = 'refilter_empty';
        candidates = [];
        console.info('[intent_discover] cache_bypass', { reason: 'refilter_empty' });
      } else {
        console.info('[intent_discover] cache_hit', {
          norm: keyInfo.norm,
          pool: ids.length,
          afterFilter: candidates.length,
        });
      }
    } else {
      cacheMissReason = cached?.reason || 'miss';
      console.info('[intent_discover] cache_miss', {
        norm: keyInfo.norm,
        reason: cacheMissReason,
      });
    }
  } else {
    cacheMissReason = 'skipped_quality';
  }

  if (!cacheHit) {
    let snap;
    try {
      snap = await db.collection('users').where('openToMeet', '==', true).limit(DISCOVER_POOL).get();
    } catch (e) {
      snap = await db.collection('users').limit(DISCOVER_POOL).get();
    }

    snap.docs.forEach((d) => {
      const data = { uid: d.id, ...d.data() };
      if (!passesHardEligibility(viewer, data, hardCtx)) return;
      if (!passesQueryHardFilters(data, plan.hardFilters)) return;
      candidates.push(data);
    });
  }

  const edgeMap = {};
  await Promise.all(
    candidates.slice(0, 40).map(async (c) => {
      try {
        const [theyFollow, iFollow] = await Promise.all([
          db.collection('users').doc(c.uid).collection('following').doc(user.uid).get(),
          db.collection('users').doc(user.uid).collection('following').doc(c.uid).get(),
        ]);
        edgeMap[c.uid] = {
          theyFollowViewer: theyFollow.exists,
          viewerFollowsThem: iFollow.exists,
        };
      } catch (e) {
        edgeMap[c.uid] = {};
      }
    })
  );

  const ranked = rankDiscoveryCandidates({
    viewer,
    candidates,
    edgeMap,
    plan,
    weights,
    prefs,
    limit,
  });

  // Write shared candidate pool (uids+scores) on miss — never viewer-final list
  if (!cacheHit && keyInfo && candidates.length) {
    const poolForCache = candidates.map((c) => ({
      uid: c.uid,
      score: typeof c._cacheScore === 'number' ? c._cacheScore : 0,
    }));
    // Prefer ranked scores when available for better reuse hints
    const rankedMap = {};
    ranked.forEach((m) => {
      rankedMap[m.uid] = m.score;
    });
    const toStore = candidates.map((c) => ({
      uid: c.uid,
      score: rankedMap[c.uid] != null ? rankedMap[c.uid] : poolForCache.find((x) => x.uid === c.uid)?.score || 0,
    }));
    writeDiscoveryCandidateCache(db, keyInfo, { candidates: toStore, plan }).catch(() => {});
  }

  try {
    await db.collection(BATCH_INTERFACE.collection).add({
      uid: user.uid,
      queryHash: simpleHash(normalizeDiscoveryQuery(query) || query),
      searchIntent: plan.searchIntent,
      appliedAssumptionIds: plan.appliedAssumptionIds,
      suppressedAssumptionIds: plan.suppressedAssumptionIds,
      hardFilterKeys: Object.keys(plan.hardFilters || {}),
      resultCount: ranked.length,
      usedLlm,
      cacheHit,
      cacheMissReason: cacheHit ? null : cacheMissReason,
      assumptionVersion: ASSUMPTION_VERSION,
      intentProfileId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.warn('[intent_discover] log', e?.message || e);
  }

  const refineChips = [...((plan.softAssumptions && plan.softAssumptions.refineChips) || [])];
  if (plan.appliedAssumptionIds.includes('dating_opposite_gender')) {
    refineChips.push({ id: 'include_everyone', label: 'Include everyone' });
  }

  return {
    mode: usedLlm ? 'ai_parse' : 'deterministic',
    aiEnabled,
    cacheHit,
    cacheMissReason: cacheHit ? null : cacheMissReason,
    plan: {
      version: plan.version,
      searchIntent: plan.searchIntent,
      hardFilters: plan.hardFilters,
      appliedAssumptionIds: plan.appliedAssumptionIds,
      suppressedAssumptionIds: plan.suppressedAssumptionIds,
      vibe: plan.vibe,
    },
    intentProfileId,
    refineChips: dedupeChips(refineChips),
    matches: ranked.map((m) => ({
      uid: m.uid,
      name: m.user.name || m.user.displayName || '',
      username: m.user.username || '',
      photoURL: m.user.photoURL || '',
      city: m.user.profile?.currentCity || m.user.city || '',
      age: m.user.age || m.user.profile?.age || null,
      bio: m.user.profile?.bio || m.user.bio || '',
      interests: m.user.profile?.interests || m.user.interests || [],
      icebreakers: m.user.icebreakers || m.user.profile?.icebreakers || [],
      profileType:
        normalizeProfileType(m.user.profileType || m.user.profile?.profileType) || 'personal',
      score: Math.round(m.score * 1000) / 1000,
      matchPct: Math.min(99, Math.max(28, Math.round(m.score * 100))),
      explain: m.explain,
      signalScores: m.signalScores,
      assumptionFit: m.assumptionFit,
    })),
    empty: ranked.length === 0,
    emptyMessage:
      ranked.length === 0
        ? 'No eligible people matched that search yet. Try broader wording — we never invent profiles.'
        : null,
    batchInterface: BATCH_INTERFACE,
  };
}

function dedupeChips(chips) {
  const seen = new Set();
  return (chips || []).filter((c) => {
    if (!c || !c.id || seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}

function simpleHash(s) {
  let h = 0;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return String(h);
}

function isValidDiscoveryPersonSignal(signal) {
  return signal === 'more_like' || signal === 'not_interested';
}

async function recordDiscoveryPersonSignal(db, admin, { uid, candidateUid, signal, intentProfileId, queryHash }) {
  if (!uid || !candidateUid) throw new Error('UID_REQUIRED');
  if (!isValidDiscoveryPersonSignal(signal)) throw new Error('SIGNAL_INVALID');
  const value = signal === 'more_like' ? 1 : -1;
  const docId = `discovery_${candidateUid}`.slice(0, 180);
  await db
    .collection('users')
    .doc(uid)
    .collection('recommendationSignals')
    .doc(docId)
    .set(
      {
        type: 'discovery_person',
        candidateUid,
        signal,
        value,
        intentProfileId: intentProfileId || null,
        queryHash: queryHash || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  if (intentProfileId) {
    try {
      const { logMatchEngagement } = require('./intent-weights');
      await logMatchEngagement(db, admin, {
        uid,
        intentProfileId,
        candidateUid,
        signalScores: {},
        outcome: signal === 'more_like' ? 'accepted' : 'rejected',
        intentText: '',
      });
    } catch (e) {}
  }
  return { ok: true, signal, value };
}

async function processDiscoveryBatchLabels(db, admin, { dayKey } = {}) {
  const key = dayKey || new Date().toISOString().slice(0, 10);
  const since = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 864e5 * 2));
  let sampleCount = 0;
  try {
    const snap = await db
      .collection(BATCH_INTERFACE.collection)
      .where('createdAt', '>=', since)
      .limit(500)
      .get();
    sampleCount = snap.size;
  } catch (e) {
    sampleCount = 0;
  }
  await db
    .collection(BATCH_INTERFACE.labelsCollection)
    .doc(key)
    .set(
      {
        dayKey: key,
        queryLogSamples: sampleCount,
        job: BATCH_INTERFACE.jobName,
        note:
          'Stub interface — preference deltas live on users/*/recommendationSignals; nightly job ready for scorer training.',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  return { ok: true, dayKey: key, sampleCount };
}

module.exports = {
  runIntentDiscover,
  recordDiscoveryPersonSignal,
  processDiscoveryBatchLabels,
  parseIntentQuery,
  rankDiscoveryCandidates,
  isValidDiscoveryPersonSignal,
  BATCH_INTERFACE,
  DISCOVER_POOL,
};
