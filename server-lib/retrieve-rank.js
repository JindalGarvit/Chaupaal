/**
 * Retrieval & ranking (P6) — two-stage, deterministic, explainable.
 *
 * Interfaces (callers must use these — never raw pool/model paths):
 *   retrieveCandidates({ kind, uid, plan, limit, db, model })
 *   rankCandidates({ kind, uid, candidates, plan, model, weights, … })
 *   rankContentItems({ surface, items, model, opts })
 *   refreshCandidatePools(db, admin, opts)
 *
 * Backends:
 *   firestore-shards — shipped (candidatePools/*)
 *   vector-index — stub only (documented for later swap)
 *
 * No LLM in scoring (6A). P5 model via getUserModel only.
 */
'use strict';

const { getUserModel } = require('./user-model');
const { computeSignalScores } = require('./matchmaking');
const {
  defaultWeights,
  normalizeWeights,
  weightedScore,
} = require('./intent-weights');
const {
  softAssumptionFit,
  explainMatch,
  passesHardEligibility,
  passesQueryHardFilters,
} = require('./discovery-assumptions');

const SCHEMA_V = 1;
const POOL_COLLECTION = 'candidatePools';
const RETRIEVAL_BACKEND = process.env.CHAUPAAL_RETRIEVAL_BACKEND || 'firestore-shards';

const POOL_SHARD_CAP = 100;
const POOL_TTL_MS = 36 * 3600 * 1000;
const PEOPLE_RETRIEVE_DEFAULT = 120;
const EXPLORATION_RATIO = 0.18; // ~18% exploration / fresh / new-author
const NEW_AUTHOR_FLOOR = 0.08; // visibility floor boost
const COLD_START_EXPLORATION = 0.35;

/** Extra model feature weights on top of the 8 discovery signals (sum ~0.35). */
const MODEL_FEATURE_WEIGHTS = {
  topicOverlap: 0.12,
  peopleAffinity: 0.08,
  rhythmAlign: 0.05,
  socialPosture: 0.05,
  formatAffinity: 0.05,
};

/** Content blend (normalized later). */
const CONTENT_WEIGHTS = {
  velocity: 0.28,
  topic: 0.22,
  author: 0.14,
  recency: 0.16,
  format: 0.1,
  exploration: 0.1,
};

const MANCH_WEIGHTS = {
  affinity: 0.55,
  recencyPlay: 0.2,
  popularity: 0.15,
  exploration: 0.1,
};

function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function slug(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function poolDocId(parts) {
  return parts.filter(Boolean).join(':').slice(0, 180);
}

function shardForKey(key, shards = 4) {
  let h = 0;
  const s = String(key || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % shards;
}

function ageBand(age) {
  const a = Number(age);
  if (!Number.isFinite(a) || a <= 0) return 'unknown';
  if (a < 18) return 'teen';
  if (a < 25) return '18-24';
  if (a < 35) return '25-34';
  if (a < 45) return '35-44';
  return '45plus';
}

function intentBucketOf(user) {
  const lf = String(user?.lookingFor || user?.profile?.lookingFor || user?.matchIntent || '')
    .toLowerCase();
  if (/dat|relationship|marriage/.test(lf)) return 'dating';
  if (/network|hire|work|co-founder|mentor|client/.test(lf)) return 'professional';
  if (/friend|buddy|flatmate|study|workout|travel/.test(lf)) return 'friendship';
  return 'other';
}

function topTopicKeys(model, n = 5) {
  if (!model?.topics) return [];
  return Object.entries(model.topics)
    .filter(([, v]) => Number(v) > 0.05)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

function interestsOf(u) {
  const list = []
    .concat(u?.interests || [])
    .concat(u?.profile?.interests || [])
    .concat(u?.profile?.hobbies || []);
  return [...new Set(list.map((x) => String(x).trim()).filter(Boolean))];
}

function cityOf(u) {
  return String(u?.profile?.currentCity || u?.city || '')
    .trim()
    .toLowerCase();
}

function engagementVelocity(item, now = Date.now()) {
  const ts = Number(item.ts || item.createdAtMs || item.createdAt || 0);
  const ageH = Math.max((now - (ts || now)) / 3600000, 1 / 60);
  const likes = Number(item.likes || item.likeCount || 0);
  const comments = Number(item.comments || item.commentCount || 0);
  const reactions = Number(item.totalResponses || item.reactions || 0);
  return (likes * 1 + comments * 2.2 + reactions * 1.4) / Math.pow(ageH, 0.65);
}

function recencyScore(ts, now = Date.now()) {
  const t = Number(ts) || 0;
  if (!t) return 0.3;
  const ageH = Math.max(0, (now - t) / 3600000);
  return clamp01(Math.exp(-ageH / 72)); // ~3-day half-ish
}

/**
 * Interleave exploitation + exploration so the model cannot fully collapse.
 */
function applyExplorationSlice(ranked, { ratio = EXPLORATION_RATIO, exploreKey = 'explore' } = {}) {
  if (!ranked.length) return ranked;
  const n = ranked.length;
  const exploreSlots = Math.max(1, Math.floor(n * ratio));
  const exploit = ranked.filter((r) => !r[exploreKey]).slice();
  const explore = ranked.filter((r) => r[exploreKey]).slice();
  // If too few marked explore, pull lowest half as explore diversity
  if (explore.length < exploreSlots) {
    const rest = exploit.splice(Math.floor(exploit.length * 0.7));
    rest.forEach((r) => {
      r[exploreKey] = true;
      explore.push(r);
    });
  }
  const out = [];
  let ei = 0;
  let xi = 0;
  const every = Math.max(2, Math.floor(1 / Math.max(0.05, ratio)));
  while (out.length < n && (ei < exploit.length || xi < explore.length)) {
    const wantExplore = out.length % every === every - 1 && xi < explore.length;
    if (wantExplore || ei >= exploit.length) {
      if (xi < explore.length) out.push(explore[xi++]);
      else if (ei < exploit.length) out.push(exploit[ei++]);
    } else {
      out.push(exploit[ei++]);
    }
  }
  return out;
}

// ——— Pool I/O ———

async function readPoolShard(db, id) {
  try {
    const snap = await db.collection(POOL_COLLECTION).doc(id).get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    if (data.expireAtMs && Date.now() > Number(data.expireAtMs)) return null;
    return { id, ...data };
  } catch (e) {
    return null;
  }
}

async function writePoolShard(db, id, payload, FieldValue) {
  const entries = (payload.entries || []).slice(0, POOL_SHARD_CAP);
  await db
    .collection(POOL_COLLECTION)
    .doc(id)
    .set(
      {
        v: SCHEMA_V,
        ...payload,
        entries,
        updatedAt: FieldValue ? FieldValue.serverTimestamp() : new Date(),
        updatedAtMs: Date.now(),
        expireAtMs: Date.now() + POOL_TTL_MS,
      },
      { merge: true }
    );
}

/**
 * Vector-index stub — swap CHAUPAAL_RETRIEVAL_BACKEND=vector-index later.
 * Returns null so callers fall through to firestore-shards / legacy.
 */
async function retrieveViaVectorIndex(_args) {
  return {
    backend: 'vector-index',
    implemented: false,
    candidates: [],
    note: 'Stub only. Wire Pinecone/Vertex/Firestore Vector later; same retrieveCandidates contract.',
  };
}

async function loadModelSafe(db, uid, { optedOut } = {}) {
  if (!uid || optedOut) return null;
  try {
    return await getUserModel(db, uid);
  } catch (e) {
    return null;
  }
}

function isOptedOutUser(userDoc) {
  const d = userDoc || {};
  const p = d.profile || {};
  return d.activitySignalsOptOut === true || p.activitySignalsOptOut === true;
}

/**
 * Merge unique candidate refs from several pool shards.
 */
async function mergePoolEntries(db, poolIds, limit) {
  const seen = new Set();
  const entries = [];
  let reads = 0;
  for (const id of poolIds) {
    const shard = await readPoolShard(db, id);
    reads += 1;
    if (!shard?.entries?.length) continue;
    for (const e of shard.entries) {
      const cid = e.id || e.uid;
      if (!cid || seen.has(cid)) continue;
      seen.add(cid);
      entries.push({ ...e, id: cid, _pool: id });
      if (entries.length >= limit) break;
    }
    if (entries.length >= limit) break;
  }
  return { entries, reads };
}

async function hydratePeople(db, entries, { viewer, hardCtx, plan, limit }) {
  const out = [];
  const ids = entries.map((e) => e.id).slice(0, limit);
  await Promise.all(
    ids.map(async (id) => {
      try {
        const d = await db.collection('users').doc(id).get();
        if (!d.exists) return;
        const data = { uid: d.id, ...d.data() };
        if (viewer && hardCtx && !passesHardEligibility(viewer, data, hardCtx)) return;
        if (plan?.hardFilters && !passesQueryHardFilters(data, plan.hardFilters)) return;
        out.push(data);
      } catch (e) {}
    })
  );
  return out;
}

/**
 * Primary retrieval — people, content ids, or games.
 */
async function retrieveCandidates(args = {}) {
  const {
    kind = 'people',
    uid,
    plan = null,
    limit = PEOPLE_RETRIEVE_DEFAULT,
    db,
    model = null,
    viewer = null,
    hardCtx = null,
  } = args;

  if (!db) throw new Error('retrieveCandidates requires db');

  if (RETRIEVAL_BACKEND === 'vector-index') {
    const stub = await retrieveViaVectorIndex(args);
    if (stub.implemented && stub.candidates?.length) {
      return { ...stub, kind, limit };
    }
  }

  const poolIds = [];
  const topics = topTopicKeys(model, 4);
  const city = slug(plan?.hardFilters?.city || cityOf(viewer) || '');
  const intent = slug(plan?.searchIntent || intentBucketOf(viewer) || 'other');
  const pType = normalizeType(viewer);

  if (kind === 'people') {
    poolIds.push(poolDocId(['people', 'active', '0']));
    poolIds.push(poolDocId(['people', 'active', '1']));
    if (city) poolIds.push(poolDocId(['people', 'city', city, String(shardForKey(city))]));
    if (intent) poolIds.push(poolDocId(['people', 'intent', intent, '0']));
    topics.forEach((t) => {
      const s = slug(t);
      if (s) poolIds.push(poolDocId(['people', 'topic', s, String(shardForKey(s))]));
    });
    if (pType) poolIds.push(poolDocId(['people', 'type', pType, '0']));
    // age band
    const band = ageBand(viewer?.age || viewer?.profile?.age);
    if (band !== 'unknown') poolIds.push(poolDocId(['people', 'age', band, '0']));
  } else if (kind === 'content') {
    const surface = slug(args.surface || 'duniya');
    poolIds.push(poolDocId(['content', surface, 'active', '0']));
    topics.forEach((t) => {
      const s = slug(t);
      if (s) poolIds.push(poolDocId(['content', surface, 'topic', s, '0']));
    });
  } else if (kind === 'games') {
    poolIds.push(poolDocId(['games', 'active', '0']));
    topics.forEach((t) => {
      const s = slug(t);
      if (s) poolIds.push(poolDocId(['games', 'genre', s, '0']));
    });
  }

  const uniquePoolIds = [...new Set(poolIds)].slice(0, 12);
  const { entries, reads } = await mergePoolEntries(db, uniquePoolIds, Math.max(limit, 40));

  let candidates = [];
  let hydrateReads = 0;
  if (kind === 'people') {
    candidates = await hydratePeople(db, entries, {
      viewer,
      hardCtx,
      plan,
      limit: Math.min(limit, 160),
    });
    hydrateReads = Math.min(entries.length, 160);
  } else {
    candidates = entries.slice(0, limit).map((e) => ({
      id: e.id,
      uid: e.uid || e.authorUid || null,
      scoreHint: e.score || 0,
      tag: e.tag || null,
      genre: e.genre || null,
      _pool: e._pool,
    }));
  }

  // Fail open: empty pools → legacy openToMeet / collection scan (bounded)
  let fallback = false;
  if (!candidates.length && kind === 'people') {
    fallback = true;
    try {
      let snap;
      try {
        snap = await db.collection('users').where('openToMeet', '==', true).limit(limit).get();
      } catch (e) {
        snap = await db.collection('users').limit(limit).get();
      }
      hydrateReads += snap.size;
      snap.docs.forEach((d) => {
        const data = { uid: d.id, ...d.data() };
        if (viewer && hardCtx && !passesHardEligibility(viewer, data, hardCtx)) return;
        if (plan?.hardFilters && !passesQueryHardFilters(data, plan.hardFilters)) return;
        candidates.push(data);
      });
    } catch (e) {}
  }

  return {
    backend: RETRIEVAL_BACKEND,
    kind,
    poolIds: uniquePoolIds,
    poolReads: reads,
    hydrateReads,
    totalReadsEstimate: reads + hydrateReads,
    fallback,
    candidates,
  };
}

function normalizeType(u) {
  const t = String(u?.profileType || u?.profile?.profileType || 'personal').toLowerCase();
  return t === 'professional' ? 'professional' : 'personal';
}

function topicOverlapScore(model, cand) {
  if (!model?.topics) return 0;
  const ints = interestsOf(cand).map((i) => i.toLowerCase());
  if (!ints.length) return 0;
  let sum = 0;
  let n = 0;
  Object.entries(model.topics).forEach(([k, v]) => {
    const key = String(k).toLowerCase();
    if (ints.some((i) => i.includes(key) || key.includes(i))) {
      sum += Number(v) || 0;
      n += 1;
    }
  });
  return n ? clamp01(sum / Math.min(n, 3)) : 0;
}

function peopleAffinityScore(model, candUid) {
  if (!model?.people || !candUid) return 0;
  const v = Number(model.people[candUid]);
  if (!Number.isFinite(v)) return 0;
  return clamp01((v + 1) / 2); // map [-1,1] → [0,1]
}

function rhythmAlignScore(model, cand) {
  const hb = model?.rhythm?.hourBuckets;
  if (!hb || typeof hb !== 'object') return 0.4;
  // Soft: prefer candidates with any recent activity signal
  const last = cand.lastActiveAt?.toMillis?.() || cand.lastActiveAt || 0;
  if (!last) return 0.35;
  const ageH = (Date.now() - Number(last)) / 3600000;
  return clamp01(1 - ageH / (14 * 24));
}

function socialPostureScore(model, cand) {
  if (!model?.social) return 0.4;
  let s = 0.4;
  const bucket = model.social.intentBucket;
  const cBucket = intentBucketOf(cand);
  if (bucket && cBucket && bucket === cBucket) s += 0.35;
  if (model.social.openToMeet && cand.openToMeet !== false) s += 0.1;
  if (model.social.strangerComfort != null) s += 0.15 * clamp01(model.social.strangerComfort);
  return clamp01(s);
}

/**
 * Rank people (or generic candidates with user docs).
 */
function rankCandidates(args = {}) {
  const {
    kind = 'people',
    candidates = [],
    plan = null,
    model = null,
    weights = null,
    prefs = null,
    edgeMap = {},
    viewer = null,
    limit = 10,
    optedOut = false,
  } = args;

  if (kind === 'content') {
    return rankContentItems({
      surface: args.surface || 'duniya',
      items: candidates,
      model: optedOut ? null : model,
      opts: { limit, friendUids: args.friendUids, pinnedIds: args.pinnedIds },
    });
  }
  if (kind === 'games') {
    return rankManchLibrary({
      games: candidates,
      model: optedOut ? null : model,
      gotdId: args.gotdId || null,
      limit,
    });
  }

  const w = normalizeWeights(weights || defaultWeights());
  const cold = !!(model?.coldStart || !model);
  const useModel = !optedOut && model && model.behavioral !== false;
  const scored = [];

  for (const cand of candidates) {
    if (prefs?.notInterestedUids?.has(cand.uid)) continue;
    const soft = plan ? softAssumptionFit(cand, plan) : { fit: 0.5, exclude: false };
    if (soft.exclude) continue;

    const edges = edgeMap[cand.uid] || {};
    const signals = computeSignalScores(viewer || {}, cand, edges);
    let base = weightedScore(signals, w);
    if (plan) base = base * 0.72 + soft.fit * 0.28;

    const components = { signals: base, soft: soft.fit };

    if (useModel) {
      const topic = topicOverlapScore(model, cand);
      const people = peopleAffinityScore(model, cand.uid);
      const rhythm = rhythmAlignScore(model, cand);
      const social = socialPostureScore(model, cand);
      const boost =
        topic * MODEL_FEATURE_WEIGHTS.topicOverlap +
        people * MODEL_FEATURE_WEIGHTS.peopleAffinity +
        rhythm * MODEL_FEATURE_WEIGHTS.rhythmAlign +
        social * MODEL_FEATURE_WEIGHTS.socialPosture;
      base += boost;
      Object.assign(components, { topic, people, rhythm, social, modelBoost: boost });
    }

    if (prefs?.moreLikeUids?.has(cand.uid)) {
      base += 0.12;
      components.moreLike = 0.12;
    }
    const interests = [...(cand.interests || []), ...(cand.profile?.interests || [])];
    for (const i of interests) {
      const b = prefs?.interestBoost?.[String(i).toLowerCase()];
      if (b) {
        const delta = Math.max(-0.08, Math.min(0.08, b * 0.02));
        base += delta;
        components.interestBoost = (components.interestBoost || 0) + delta;
      }
    }
    if (plan?.softAssumptions?.preferRecentlyActive) {
      const last =
        cand.lastActiveAt?.toMillis?.() || cand.lastActiveAt || cand.updatedAt?.toMillis?.() || 0;
      if (last && Date.now() - Number(last) < 7 * 864e5) {
        base += 0.04;
        components.recentActive = 0.04;
      }
    }
    const hf = plan?.hardFilters || {};
    if (hf.college || hf.city || hf.company) {
      base += 0.18;
      components.hardFilterBoost = 0.18;
    }

    // New profile visibility floor
    const created = cand.createdAt?.toMillis?.() || cand.createdAtMs || 0;
    const isNew = created && Date.now() - Number(created) < 14 * 864e5;
    if (isNew) {
      base += NEW_AUTHOR_FLOOR;
      components.newFloor = NEW_AUTHOR_FLOOR;
    }

    if (cold) {
      // Popularity / diversity lean (stable per-uid jitter — no Math.random)
      const pop = clamp01((Number(cand.followersCount) || Number(cand.relationshipCounts?.followers) || 0) / 50);
      base = base * 0.65 + pop * 0.2;
      const idSeed = String(cand.uid || '');
      let h = 0;
      for (let i = 0; i < idSeed.length; i++) h = (h * 31 + idSeed.charCodeAt(i)) | 0;
      base += (Math.abs(h) % 100) / 2000;
      components.coldPop = pop;
    }

    const explainBits = [];
    if (plan && signals) {
      const baseExplain = explainMatch(cand, plan, signals);
      if (Array.isArray(baseExplain)) explainBits.push(...baseExplain);
      else if (baseExplain) explainBits.push(String(baseExplain));
    }
    if (components.topic > 0.4) {
      const shared = interestsOf(cand).filter((i) =>
        topTopicKeys(model, 8).some((t) => t.toLowerCase() === i.toLowerCase())
      );
      if (shared[0]) explainBits.push(`Shared interest: ${shared[0]}`);
      else explainBits.push('Topic overlap with your interests');
    }
    if (components.rhythm > 0.6) explainBits.push('Both active recently');
    if (signals.locationProximity >= 0.9) explainBits.push('Same city');
    else if (signals.locationProximity > 0.4) explainBits.push('Nearby');
    if (components.people > 0.6) explainBits.push('Similar to people you liked');
    if (isNew) explainBits.push('New on Chaupaal');

    scored.push({
      uid: cand.uid,
      user: cand,
      score: base,
      signalScores: signals,
      assumptionFit: soft.fit,
      components,
      explain: explainBits.filter(Boolean).slice(0, 4),
      explore: !!(isNew || cold || components.topic < 0.15),
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const interleaved = applyExplorationSlice(scored, {
    ratio: cold ? COLD_START_EXPLORATION : EXPLORATION_RATIO,
  });
  return interleaved.slice(0, Math.max(1, Math.min(40, limit || 10)));
}

/**
 * Rank feed/content items (already fetched). Pure.
 */
function rankContentItems({ surface = 'duniya', items = [], model = null, opts = {} } = {}) {
  const now = Date.now();
  const friendSet = new Set((opts.friendUids || []).map(String));
  const pinned = new Set((opts.pinnedIds || []).map(String));
  const useModel = !!(model && model.behavioral !== false && !model.consent?.activityOptOut);
  const cold = !!(model?.coldStart || !useModel);
  const topics = useModel ? topTopicKeys(model, 10) : [];
  const formats = useModel ? model.formats || {} : {};
  const people = useModel ? model.people || {} : {};

  const scored = (items || []).map((item, idx) => {
    const id = String(item.id || item.firestoreId || idx);
    const author = String(item.uid || item.authorUid || item.user?.uid || '');
    const tag = String(item.tag || item.category || item.topic || '').trim();
    const format = String(item.format || item.mediaType || (item.media ? 'photo' : 'text')).toLowerCase();
    const ts = Number(item.ts || item.createdAtMs || item.createdAt || 0);
    const own = opts.viewerUid && author === opts.viewerUid;
    const ageMs = Math.max(0, now - (ts || now));

    // Own brand-new pin
    if (own && ageMs < 10 * 60 * 1000) {
      return {
        id,
        item,
        score: 1e9 - ageMs,
        explain: ['Your new post'],
        components: { pin: 1 },
        explore: false,
        friend: false,
      };
    }
    if (pinned.has(id)) {
      return {
        id,
        item,
        score: 1e8 - idx,
        explain: ['Pinned'],
        components: { pin: 1 },
        explore: false,
        friend: friendSet.has(author),
      };
    }

    const vel = clamp01(engagementVelocity(item, now) / 8);
    const rec = recencyScore(ts, now);
    let topic = 0;
    if (tag && topics.length) {
      const tl = tag.toLowerCase();
      topics.forEach((t, i) => {
        if (tl.includes(String(t).toLowerCase()) || String(t).toLowerCase().includes(tl)) {
          topic = Math.max(topic, 1 - i * 0.08);
        }
      });
    }
    // Surface-level topic from model
    if (useModel && model.topics) {
      const surfaceTopic =
        surface === 'peepal'
          ? model.topics.Questions
          : surface === 'akhbaar'
            ? model.topics.News
            : model.topics['Social feed'];
      if (surfaceTopic) topic = clamp01(topic + Number(surfaceTopic) * 0.25);
    }

    let authorAff = 0;
    if (author && people[author] != null) authorAff = clamp01((Number(people[author]) + 1) / 2);
    if (friendSet.has(author)) authorAff = Math.max(authorAff, 0.75);

    let formatAff = 0.4;
    if (formats.photo && /photo|image|video/.test(format)) formatAff = clamp01(formats.photo);
    if (formats.question && (surface === 'peepal' || format === 'mcq' || format === 'open')) {
      formatAff = clamp01(formats.question);
    }
    if (formats.text && /text|article|news/.test(format)) formatAff = clamp01(formats.text);
    if (formats.watch_together && /watch|mehfil/.test(format)) formatAff = clamp01(formats.watch_together);

    const isNewAuthor = !!(item.authorIsNew || (item.authorCreatedAt && now - Number(item.authorCreatedAt) < 14 * 864e5));
    const exploreBoost = isNewAuthor || (!friendSet.has(author) && vel < 0.2) ? NEW_AUTHOR_FLOOR + 0.05 : 0;

    let score =
      vel * CONTENT_WEIGHTS.velocity +
      topic * CONTENT_WEIGHTS.topic +
      authorAff * CONTENT_WEIGHTS.author +
      rec * CONTENT_WEIGHTS.recency +
      formatAff * CONTENT_WEIGHTS.format +
      exploreBoost;

    if (!useModel || cold) {
      // Non-personalized / cold: recency + velocity + friend slots
      score = vel * 0.45 + rec * 0.35 + (friendSet.has(author) ? 0.2 : 0) + exploreBoost;
    }

    const explain = [];
    if (friendSet.has(author)) explain.push('From someone you follow');
    if (topic > 0.45 && tag) explain.push(`Matches your interest in ${tag}`);
    else if (topic > 0.45) explain.push('Fits your interests');
    if (vel > 0.5) explain.push('Trending now');
    if (isNewAuthor) explain.push('New voice');
    if (rec > 0.7) explain.push('Fresh');

    return {
      id,
      item,
      score,
      explain: explain.slice(0, 3),
      components: { vel, topic, authorAff, rec, formatAff, exploreBoost },
      explore: !!(isNewAuthor || exploreBoost > 0 || (!friendSet.has(author) && topic < 0.2)),
      friend: friendSet.has(author),
    };
  });

  scored.sort((a, b) => b.score - a.score);

  // Preserve friend slots early
  const friends = scored.filter((s) => s.friend).slice(0, opts.friendSlots || 3);
  const rest = scored.filter((s) => !friends.includes(s));
  const merged = [];
  let fi = 0;
  let ri = 0;
  while (merged.length < scored.length) {
    if (fi < friends.length && merged.length < (opts.friendSlots || 3)) {
      merged.push(friends[fi++]);
      continue;
    }
    if (ri < rest.length) merged.push(rest[ri++]);
    else if (fi < friends.length) merged.push(friends[fi++]);
    else break;
  }

  const interleaved = applyExplorationSlice(merged, {
    ratio: cold ? COLD_START_EXPLORATION : EXPLORATION_RATIO,
  });
  const limit = opts.limit || interleaved.length;
  return interleaved.slice(0, limit);
}

/**
 * Manch library order — GOTD id stays pinned first if provided (fairness untouched).
 */
function rankManchLibrary({ games = [], model = null, gotdId = null, limit = 50 } = {}) {
  const aff = model?.games || {};
  const useModel = !!(model && model.behavioral !== false);
  const scored = (games || []).map((g) => {
    const id = String(g.id || g.gameId || '');
    if (gotdId && id === gotdId) {
      return { id, item: g, score: 1e9, explain: ['Game of the Day'], explore: false };
    }
    const a = useModel ? clamp01(Number(aff[id]) || Number(aff[`genre:${g.genre}`]) || 0) : 0;
    const pop = clamp01((Number(g.plays) || Number(g.playCount) || 0) / 100);
    const idSeed = id;
    let h = 0;
    for (let i = 0; i < idSeed.length; i++) h = (h * 31 + idSeed.charCodeAt(i)) | 0;
    const explore = (Math.abs(h) % 100) / 100 < EXPLORATION_RATIO;
    const score = useModel
      ? a * MANCH_WEIGHTS.affinity + pop * MANCH_WEIGHTS.popularity + (explore ? 0.08 : 0)
      : pop * 0.7 + (explore ? 0.1 : 0);
    const explain = [];
    if (a > 0.4) explain.push('Fits games you play');
    if (gotdId && id === gotdId) explain.push('Game of the Day');
    return { id, item: g, score, explain, explore };
  });
  scored.sort((a, b) => b.score - a.score);
  return applyExplorationSlice(scored, { ratio: EXPLORATION_RATIO }).slice(0, limit);
}

/**
 * Akhbaar: pinned category order first, then model-weighted.
 */
function rankAkhbaarCategories({ categories = [], pinnedOrder = [], model = null } = {}) {
  const pinned = pinnedOrder.map(String);
  const pinnedSet = new Set(pinned);
  const topics = model?.topics || {};
  const rest = categories
    .filter((c) => !pinnedSet.has(String(c.id || c.key || c.name)))
    .map((c) => {
      const key = String(c.id || c.key || c.name || '');
      const name = String(c.name || c.title || key);
      let score = 0.2;
      Object.entries(topics).forEach(([t, v]) => {
        if (name.toLowerCase().includes(String(t).toLowerCase()) || String(t).toLowerCase().includes(name.toLowerCase())) {
          score = Math.max(score, Number(v) || 0);
        }
      });
      if (topics.News) score = clamp01(score + Number(topics.News) * 0.15);
      return { id: key, item: c, score, explain: score > 0.35 ? [`Matches ${name}`] : ['Browse'] };
    })
    .sort((a, b) => b.score - a.score);

  const head = pinned
    .map((id) => {
      const c = categories.find((x) => String(x.id || x.key || x.name) === id);
      return c ? { id, item: c, score: 1e6, explain: ['Pinned'] } : null;
    })
    .filter(Boolean);
  return head.concat(rest);
}

/**
 * Scheduler: rebuild a page of people pools from users cursor.
 */
async function refreshCandidatePools(db, admin, { batchSize = 40 } = {}) {
  const FieldValue = admin.firestore.FieldValue;
  const cursorRef = db.collection('chaupaalMeta').doc('candidatePoolCursor');
  const cursorSnap = await cursorRef.get();
  const cursor = cursorSnap.exists ? cursorSnap.data() || {} : {};
  let lastUid = cursor.lastUid || null;

  let q = db.collection('users').orderBy('__name__').limit(batchSize);
  if (lastUid) q = q.startAfter(lastUid);
  const snap = await q.get();

  /** @type {Map<string, Array<{id:string,score:number,tag?:string}>>} */
  const buckets = new Map();
  const bump = (poolId, entry) => {
    if (!buckets.has(poolId)) buckets.set(poolId, []);
    const arr = buckets.get(poolId);
    if (arr.some((e) => e.id === entry.id)) return;
    arr.push(entry);
  };

  let considered = 0;
  snap.docs.forEach((doc) => {
    const u = { uid: doc.id, ...doc.data() };
    if (u.openToMeet === false) return;
    if (u.deletionStatus === 'requested') return;
    considered += 1;
    const city = slug(cityOf(u));
    const intent = intentBucketOf(u);
    const type = normalizeType(u);
    const band = ageBand(u.age || u.profile?.age);
    const interests = interestsOf(u).slice(0, 4);
    const last = u.lastActiveAt?.toMillis?.() || u.lastActiveAt || u.updatedAt?.toMillis?.() || 0;
    const activeScore = last && Date.now() - Number(last) < 14 * 864e5 ? 0.8 : 0.35;
    const entry = { id: doc.id, score: activeScore, city: city || null };

    bump(poolDocId(['people', 'active', String(shardForKey(doc.id))]), entry);
    if (city) bump(poolDocId(['people', 'city', city, String(shardForKey(city))]), entry);
    bump(poolDocId(['people', 'intent', slug(intent), '0']), { ...entry, score: activeScore + 0.05 });
    bump(poolDocId(['people', 'type', type, '0']), entry);
    if (band !== 'unknown') bump(poolDocId(['people', 'age', band, '0']), entry);
    interests.forEach((t) => {
      const s = slug(t);
      if (s) bump(poolDocId(['people', 'topic', s, String(shardForKey(s))]), { ...entry, tag: t });
    });
  });

  // Merge with existing shard entries (keep freshest scores, cap)
  let wrote = 0;
  for (const [id, fresh] of buckets.entries()) {
    const existing = (await readPoolShard(db, id))?.entries || [];
    const map = new Map();
    existing.forEach((e) => map.set(e.id, e));
    fresh.forEach((e) => map.set(e.id, e));
    const merged = [...map.values()]
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, POOL_SHARD_CAP);
    await writePoolShard(db, id, { kind: 'people', poolId: id, entries: merged }, FieldValue);
    wrote += 1;
  }

  // Light content active pools from recent peepal/duniya
  let contentWrote = 0;
  try {
    for (const surface of ['duniya', 'peepal']) {
      const col = surface === 'duniya' ? 'duniya' : 'peepal';
      let cs;
      try {
        cs = await db.collection(col).orderBy('createdAt', 'desc').limit(40).get();
      } catch (e) {
        cs = await db.collection(col).limit(40).get();
      }
      const entries = cs.docs.map((d) => {
        const x = d.data() || {};
        return {
          id: d.id,
          uid: x.uid || null,
          score: 0.5,
          tag: x.tag || null,
        };
      });
      await writePoolShard(
        db,
        poolDocId(['content', surface, 'active', '0']),
        { kind: 'content', surface, entries },
        FieldValue
      );
      contentWrote += 1;
    }
  } catch (e) {
    console.warn('[candidate-pools] content', e?.message || e);
  }

  if (snap.empty || snap.size < batchSize) {
    await cursorRef.set({ lastUid: null, updatedAt: new Date(), wrapped: true }, { merge: true });
  } else {
    await cursorRef.set(
      { lastUid: snap.docs[snap.docs.length - 1].id, updatedAt: new Date(), wrapped: false },
      { merge: true }
    );
  }

  return {
    users: snap.size,
    considered,
    poolShardsWrote: wrote,
    contentPools: contentWrote,
    wrapped: snap.empty || snap.size < batchSize,
  };
}

/**
 * Server helper: load model (respecting opt-out) + retrieve + rank people.
 */
async function retrieveAndRankPeople(db, {
  viewer,
  plan,
  weights,
  prefs,
  edgeMap,
  hardCtx,
  limit,
}) {
  const optedOut = isOptedOutUser(viewer);
  const model = await loadModelSafe(db, viewer.uid, { optedOut });
  const retrieved = await retrieveCandidates({
    kind: 'people',
    uid: viewer.uid,
    plan,
    limit: PEOPLE_RETRIEVE_DEFAULT,
    db,
    model: optedOut ? null : model,
    viewer,
    hardCtx,
  });
  const ranked = rankCandidates({
    kind: 'people',
    candidates: retrieved.candidates,
    plan,
    model,
    weights,
    prefs,
    edgeMap,
    viewer,
    limit,
    optedOut,
  });
  return { retrieved, ranked, model, optedOut };
}

module.exports = {
  SCHEMA_V,
  POOL_COLLECTION,
  EXPLORATION_RATIO,
  COLD_START_EXPLORATION,
  NEW_AUTHOR_FLOOR,
  MODEL_FEATURE_WEIGHTS,
  CONTENT_WEIGHTS,
  MANCH_WEIGHTS,
  PEOPLE_RETRIEVE_DEFAULT,
  retrieveCandidates,
  rankCandidates,
  rankContentItems,
  rankManchLibrary,
  rankAkhbaarCategories,
  refreshCandidatePools,
  retrieveAndRankPeople,
  loadModelSafe,
  isOptedOutUser,
  applyExplorationSlice,
  retrieveViaVectorIndex,
};
