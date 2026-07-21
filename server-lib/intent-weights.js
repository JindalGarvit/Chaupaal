/**
 * Per-intent Peepal matchmaking weights.
 * Applies only to re-scoring an already-shortlisted personal pool —
 * does not change Gemini candidate retrieval / embedding generation.
 *
 * Signal names mirror dimensions already computed in matchmaking (no new types).
 */
const { callAI, AiDisabledError } = require('./ai');
const { isAiFeaturesEnabled } = require('./ai-config');

function mm() {
  // Lazy require avoids circular load with matchmaking.js
  return require('./matchmaking');
}

const SIGNAL_NAMES = [
  'embeddingSimilarity',
  'interestOverlap',
  'ageProximity',
  'locationProximity',
  'lookingForAlignment',
  'followAffinity',
  'occupationSignal',
  'genderComplement',
];

const SIMILARITY_REUSE = 0.9;
const MAX_WEIGHT_SHIFT = 0.15;
const MIN_SAMPLES_REFRESH = 50;
const COLLECTION = 'intentWeightProfiles';
const ENGAGEMENT_COLLECTION = 'matchEngagementEvents';

function defaultWeights() {
  const n = SIGNAL_NAMES.length;
  const w = {};
  SIGNAL_NAMES.forEach((k) => {
    w[k] = 1 / n;
  });
  return w;
}

function normalizeWeights(raw = {}) {
  const out = {};
  let sum = 0;
  SIGNAL_NAMES.forEach((k) => {
    const v = Math.max(0, Number(raw[k]));
    out[k] = Number.isFinite(v) ? v : 0;
    sum += out[k];
  });
  if (sum <= 0) return defaultWeights();
  SIGNAL_NAMES.forEach((k) => {
    out[k] = out[k] / sum;
  });
  return out;
}

function clampWeightDelta(prev, next) {
  const p = normalizeWeights(prev);
  const n = normalizeWeights(next);
  const capped = {};
  SIGNAL_NAMES.forEach((k) => {
    const lo = Math.max(0, p[k] - MAX_WEIGHT_SHIFT);
    const hi = Math.min(1, p[k] + MAX_WEIGHT_SHIFT);
    capped[k] = Math.min(hi, Math.max(lo, n[k]));
  });
  return normalizeWeights(capped);
}

function intentKey(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 120);
}

function parseJsonObject(text) {
  const raw = String(text || '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function generateWeightsForIntent(intentText) {
  if (!isAiFeaturesEnabled()) {
    return {
      weights: defaultWeights(),
      rationale: 'Default equal weights (AI features disabled).',
      fromAi: false,
    };
  }
  try {
    const result = await callAI({
      tier: 'fast',
      feature: 'peepal_intent_weights',
      max_tokens: 400,
      system: `You assign importance weights for people-matching on Chaupaal (India social app).
Given a user's match intent, return JSON only:
{"weights":{${SIGNAL_NAMES.map((s) => `"${s}":0.0`).join(',')}},"rationale":"one short sentence"}
Rules: weights must be non-negative and sum to 1. Use only these signal keys. Emphasize signals that matter for the intent (e.g. dating → ageProximity + genderComplement; friendship → interestOverlap; roommate → locationProximity; co-founder → occupationSignal + embeddingSimilarity).`,
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            intent: intentText,
            signals: SIGNAL_NAMES,
          }),
        },
      ],
    });
    const parsed = parseJsonObject(result.text);
    if (!parsed?.weights) {
      return { weights: defaultWeights(), rationale: 'Fallback defaults (parse failed).', fromAi: false };
    }
    return {
      weights: normalizeWeights(parsed.weights),
      rationale: String(parsed.rationale || 'AI-generated intent weights.').slice(0, 240),
      fromAi: true,
    };
  } catch (e) {
    if (e instanceof AiDisabledError || e?.code === 'AI_DISABLED') {
      return { weights: defaultWeights(), rationale: 'Default equal weights (AI disabled).', fromAi: false };
    }
    console.warn('[intent-weights] generate', e?.message || e);
    return { weights: defaultWeights(), rationale: 'Default equal weights (AI error).', fromAi: false };
  }
}

/**
 * Resolve intent text → intentWeightProfiles doc (reuse by embedding similarity or create).
 * Caches profileId on the user under peepalIntentResolution[intentKey].
 */
async function resolveIntentWeightProfile(db, admin, { uid, intentText }) {
  const raw = String(intentText || '').trim().slice(0, 160);
  if (!raw) {
    return { profile: null, profileId: null, intentText: '', skipped: true };
  }
  const key = intentKey(raw);
  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  const userData = userSnap.exists ? userSnap.data() || {} : {};
  const cache = userData.peepalIntentResolution && typeof userData.peepalIntentResolution === 'object'
    ? userData.peepalIntentResolution
    : {};

  if (cache[key]?.profileId) {
    const cachedRef = db.collection(COLLECTION).doc(cache[key].profileId);
    const cachedSnap = await cachedRef.get();
    if (cachedSnap.exists) {
      const data = cachedSnap.data() || {};
      const aliases = Array.isArray(data.aliasIntentTexts) ? data.aliasIntentTexts : [];
      const updates = { usageCount: (Number(data.usageCount) || 0) + 1 };
      if (!aliases.map((a) => intentKey(a)).includes(key) && intentKey(data.canonicalIntentText) !== key) {
        updates.aliasIntentTexts = admin.firestore.FieldValue.arrayUnion(raw);
      }
      cachedRef.set(updates, { merge: true }).catch(() => {});
      return { profile: { id: cachedSnap.id, ...data }, profileId: cachedSnap.id, intentText: raw, cached: true };
    }
  }

  const { cosineSimilarity, embedText } = mm();
  let intentEmbedding = null;
  try {
    intentEmbedding = await embedText(`Match intent: ${raw}`);
  } catch (e) {
    console.warn('[intent-weights] embed intent', e?.message || e);
  }

  let best = null;
  let bestSim = 0;
  if (intentEmbedding) {
    const snap = await db.collection(COLLECTION).limit(100).get();
    snap.docs.forEach((d) => {
      const data = d.data() || {};
      const emb = data.embedding;
      if (!Array.isArray(emb) || !emb.length) return;
      const sim = cosineSimilarity(intentEmbedding, emb);
      if (sim > bestSim) {
        bestSim = sim;
        best = { id: d.id, ...data };
      }
    });
  }

  if (best && bestSim >= SIMILARITY_REUSE) {
    const ref = db.collection(COLLECTION).doc(best.id);
    const aliases = Array.isArray(best.aliasIntentTexts) ? best.aliasIntentTexts : [];
    const updates = {
      usageCount: (Number(best.usageCount) || 0) + 1,
    };
    if (!aliases.map((a) => intentKey(a)).includes(key) && intentKey(best.canonicalIntentText) !== key) {
      updates.aliasIntentTexts = admin.firestore.FieldValue.arrayUnion(raw);
    }
    await ref.set(updates, { merge: true });
    await userRef.set(
      {
        peepalIntentResolution: {
          ...cache,
          [key]: { profileId: best.id, intentText: raw, resolvedAt: Date.now() },
        },
        matchIntent: raw,
      },
      { merge: true }
    );
    return { profile: best, profileId: best.id, intentText: raw, reused: true, similarity: bestSim };
  }

  const generated = await generateWeightsForIntent(raw);
  const now = admin.firestore.FieldValue.serverTimestamp();
  const docRef = db.collection(COLLECTION).doc();
  const doc = {
    canonicalIntentText: raw,
    embedding: intentEmbedding || [],
    weights: generated.weights,
    rationale: generated.rationale,
    aliasIntentTexts: [],
    usageCount: 1,
    sampleCountSinceRefresh: 0,
    createdAt: now,
    lastRefreshedAt: now,
    version: 1,
    previousWeights: null,
  };
  await docRef.set(doc);
  await userRef.set(
    {
      peepalIntentResolution: {
        ...cache,
        [key]: { profileId: docRef.id, intentText: raw, resolvedAt: Date.now() },
      },
      matchIntent: raw,
    },
    { merge: true }
  );
  return {
    profile: { id: docRef.id, ...doc },
    profileId: docRef.id,
    intentText: raw,
    created: true,
    fromAi: generated.fromAi,
  };
}

function weightedScore(signalScores, weights) {
  const w = normalizeWeights(weights || defaultWeights());
  let s = 0;
  SIGNAL_NAMES.forEach((k) => {
    const v = Math.max(0, Math.min(1, Number(signalScores[k]) || 0));
    s += w[k] * v;
  });
  return Math.max(0, Math.min(1, s));
}

async function logMatchEngagement(db, admin, payload) {
  const {
    uid,
    intentProfileId,
    candidateUid,
    signalScores,
    outcome,
    intentText,
  } = payload || {};
  if (!uid || !intentProfileId || !['accepted', 'ignored', 'rejected'].includes(outcome)) {
    return { ok: false };
  }
  const ref = db.collection(ENGAGEMENT_COLLECTION).doc();
  await ref.set({
    uid,
    intentProfileId,
    candidateUid: candidateUid || null,
    intentText: String(intentText || '').slice(0, 160),
    signalScores: signalScores || {},
    outcome,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  // Fire-and-forget sample counter bump
  db.collection(COLLECTION)
    .doc(intentProfileId)
    .set({ sampleCountSinceRefresh: admin.firestore.FieldValue.increment(1) }, { merge: true })
    .catch(() => {});
  return { ok: true, id: ref.id };
}

function aggregateEngagement(events) {
  const per = {};
  SIGNAL_NAMES.forEach((k) => {
    per[k] = { accepted: [], other: [] };
  });
  events.forEach((ev) => {
    const scores = ev.signalScores || {};
    const bucket = ev.outcome === 'accepted' ? 'accepted' : 'other';
    SIGNAL_NAMES.forEach((k) => {
      const v = Number(scores[k]);
      if (Number.isFinite(v)) per[k][bucket].push(v);
    });
  });
  const summary = {};
  SIGNAL_NAMES.forEach((k) => {
    const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
    summary[k] = {
      avgAccepted: avg(per[k].accepted),
      avgIgnoredOrRejected: avg(per[k].other),
      nAccepted: per[k].accepted.length,
      nOther: per[k].other.length,
    };
  });
  return summary;
}

async function refreshIntentProfileWeights(db, admin, profileId, profileData) {
  const last = profileData.lastRefreshedAt?.toDate?.() || profileData.lastRefreshedAt || new Date(0);
  const lastMs = last instanceof Date ? last.getTime() : new Date(last).getTime();
  const snap = await db
    .collection(ENGAGEMENT_COLLECTION)
    .where('intentProfileId', '==', profileId)
    .limit(400)
    .get();
  const events = snap.docs
    .map((d) => d.data())
    .filter((ev) => {
      const t = ev.createdAt?.toDate?.() || ev.createdAt;
      const ms = t instanceof Date ? t.getTime() : t ? new Date(t).getTime() : 0;
      return ms >= lastMs;
    });
  if (events.length < MIN_SAMPLES_REFRESH) {
    return { skipped: true, reason: 'insufficient_samples', n: events.length };
  }
  const summary = aggregateEngagement(events);
  const current = normalizeWeights(profileData.weights);

  let nextWeights = current;
  let rationale = profileData.rationale || '';
  if (isAiFeaturesEnabled()) {
    try {
      const result = await callAI({
        tier: 'fast',
        feature: 'peepal_intent_weights_refresh',
        max_tokens: 400,
        system: `Adjust Peepal matchmaking weights from aggregated engagement (not raw events).
Return JSON only: {"weights":{...},"rationale":"one sentence"}
Signals: ${SIGNAL_NAMES.join(', ')}. Weights non-negative, sum to 1.
Prefer raising weights for signals where avgAccepted > avgIgnoredOrRejected.`,
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              intent: profileData.canonicalIntentText,
              currentWeights: current,
              engagementSummary: summary,
              sampleCount: events.length,
            }),
          },
        ],
      });
      const parsed = parseJsonObject(result.text);
      if (parsed?.weights) {
        nextWeights = clampWeightDelta(current, parsed.weights);
        if (parsed.rationale) rationale = String(parsed.rationale).slice(0, 240);
      }
    } catch (e) {
      console.warn('[intent-weights] refresh AI', e?.message || e);
      return { skipped: true, reason: 'ai_error' };
    }
  } else {
    return { skipped: true, reason: 'ai_disabled' };
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  await db
    .collection(COLLECTION)
    .doc(profileId)
    .set(
      {
        previousWeights: current,
        weights: nextWeights,
        rationale,
        version: (Number(profileData.version) || 1) + 1,
        sampleCountSinceRefresh: 0,
        lastRefreshedAt: now,
      },
      { merge: true }
    );
  return { refreshed: true, version: (Number(profileData.version) || 1) + 1, samples: events.length };
}

/** Weekly pass: refresh profiles with enough new engagement samples. */
async function runWeeklyIntentWeightRefresh(db, admin) {
  const snap = await db.collection(COLLECTION).limit(50).get();
  const results = [];
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    if ((Number(data.sampleCountSinceRefresh) || 0) < MIN_SAMPLES_REFRESH) {
      results.push({ id: doc.id, skipped: true, reason: 'insufficient_samples' });
      continue;
    }
    try {
      const r = await refreshIntentProfileWeights(db, admin, doc.id, data);
      results.push({ id: doc.id, ...r });
    } catch (e) {
      results.push({ id: doc.id, error: e?.message || String(e) });
    }
  }
  return { considered: snap.size, results };
}

async function revertIntentWeights(db, profileId) {
  const ref = db.collection(COLLECTION).doc(profileId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('NOT_FOUND');
  const data = snap.data() || {};
  if (!data.previousWeights) throw new Error('NO_PREVIOUS');
  const current = normalizeWeights(data.weights);
  const prev = normalizeWeights(data.previousWeights);
  await ref.set(
    {
      weights: prev,
      previousWeights: current,
      version: (Number(data.version) || 1) + 1,
      rationale: `Reverted to previous weights. ${(data.rationale || '').slice(0, 180)}`,
    },
    { merge: true }
  );
  return { ok: true, version: (Number(data.version) || 1) + 1 };
}

module.exports = {
  SIGNAL_NAMES,
  COLLECTION,
  ENGAGEMENT_COLLECTION,
  MIN_SAMPLES_REFRESH,
  MAX_WEIGHT_SHIFT,
  defaultWeights,
  normalizeWeights,
  weightedScore,
  resolveIntentWeightProfile,
  logMatchEngagement,
  runWeeklyIntentWeightRefresh,
  revertIntentWeights,
  intentKey,
};
