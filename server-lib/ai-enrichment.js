/**
 * Offline AI enrichment (P8) — batch topic labels, profile enrichment, cold-start
 * summaries, embedding sweep. Ranking/pairing never call this at request time.
 *
 * Content embeddings: SKIPPED — P6 retrieval does not consume content vectors yet.
 */
'use strict';

const crypto = require('crypto');
const { callAI, AiDisabledError } = require('./ai');
const {
  isAiFeaturesEnabled,
  AI_JOBS_PAUSED,
  AI_DAILY_CALL_CAP,
} = require('./ai-config');
const { textHash } = require('./embeddings');
const { INTEREST_CHIPS } = require('./user-model');
const { buildSemanticText } = require('./matchmaking');

const LABEL_VERSION = 'p8.1';
const BATCH_CONTENT = 12;
const BATCH_PROFILES = 10;
const BATCH_EMBEDS = 8;

const PROHIBITED_TOPIC_KEYS = new Set(
  [
    'religion',
    'caste',
    'sexuality',
    'sexual orientation',
    'income',
    'salary',
    'health',
    'disability',
    'disease',
    'hiv',
    'politics', // sensitive declared field — don't AI-infer
    'dating', // teen / sensitive inference
    'marriage',
    'romance',
  ].map((s) => s.toLowerCase())
);

const CANONICAL = new Set(INTEREST_CHIPS.map((c) => c.toLowerCase()));
const CANONICAL_BY_LOWER = {};
INTEREST_CHIPS.forEach((c) => {
  CANONICAL_BY_LOWER[c.toLowerCase()] = c;
});

/** Heuristic keyword → P1 chip (AI-off fallback). */
const HEURISTIC_RULES = [
  [/cricket|ipl|bat|bowl/, 'Sports'],
  [/footbal|soccer|fifa/, 'Sports'],
  [/trek|hike|mountain|nature|wildlife/, 'Nature'],
  [/cook|recipe|food|restaurant|chai/, 'Food'],
  [/film|movie|bollywood|cinema/, 'Films'],
  [/music|song|concert|playlist/, 'Music'],
  [/gym|fitness|yoga|workout/, 'Fitness'],
  [/book|read|novel|poetry/, 'Books'],
  [/tech|coding|software|ai\b|startup/, 'Tech'],
  [/startup|founder|venture/, 'Startups'],
  [/art|paint|design|gallery/, 'Art'],
  [/comic|standup|humour|humor|joke/, 'Comedy'],
  [/game|gaming|esport|console/, 'Gaming'],
  [/photo|camera|instagram/, 'Photography'],
  [/travel|trip|flight|visa/, 'Travel'],
  [/fashion|style|outfit/, 'Fashion'],
  [/volunteer|ngo|charity/, 'Volunteer work'],
  [/animal|pet|dog|cat/, 'Animals'],
  [/spiritual|meditation|temple/, 'Spirituality'],
];

function dayKeyUTC(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function contentHash(parts) {
  return crypto.createHash('sha256').update(String(parts || ''), 'utf8').digest('hex').slice(0, 40);
}

/**
 * Strip PII / sensitive bits before any provider prompt.
 * Never send journal, DMs, raw search, contacts, precise location.
 */
function redactForPrompt(text, { teen = false } = {}) {
  let s = String(text || '').slice(0, 1200);
  s = s.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email]');
  s = s.replace(/\+?\d[\d\s\-()]{8,}\d/g, '[phone]');
  s = s.replace(/@[a-zA-Z0-9_]{2,30}/g, '[handle]');
  s = s.replace(/\bhttps?:\/\/\S+/gi, '[link]');
  s = s.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[ip]');
  // Drop precise lat/lng pairs
  s = s.replace(/-?\d{1,3}\.\d{4,},?\s*-?\d{1,3}\.\d{4,}/g, '[coords]');
  if (teen) {
    s = s.replace(/\b(dat(e|ing)|marriage|boyfriend|girlfriend|tinder|hookup)\b/gi, '[redacted]');
  }
  return s.trim();
}

function normalizeTopicKey(raw) {
  const s = String(raw || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!s) return null;
  const lower = s.toLowerCase();
  if (PROHIBITED_TOPIC_KEYS.has(lower)) return null;
  if (CANONICAL_BY_LOWER[lower]) return CANONICAL_BY_LOWER[lower];
  // fuzzy contains
  for (const chip of INTEREST_CHIPS) {
    if (lower.includes(chip.toLowerCase()) || chip.toLowerCase().includes(lower)) return chip;
  }
  return null; // drop unknown — never invent parallel vocabulary
}

function validateTopics(list) {
  const out = [];
  const seen = new Set();
  (Array.isArray(list) ? list : []).forEach((item) => {
    const key = normalizeTopicKey(item?.key || item?.topic || item);
    if (!key || seen.has(key)) return;
    if (PROHIBITED_TOPIC_KEYS.has(key.toLowerCase())) return;
    const conf = Math.max(0, Math.min(1, Number(item?.confidence) || 0.5));
    seen.add(key);
    out.push({ key, confidence: Math.round(conf * 1000) / 1000 });
  });
  return out.slice(0, 6);
}

function heuristicLabel(text) {
  const t = String(text || '').toLowerCase();
  const hits = [];
  HEURISTIC_RULES.forEach(([re, chip]) => {
    if (re.test(t)) hits.push({ key: chip, confidence: 0.55 });
  });
  return validateTopics(hits);
}

async function loadBudget(db) {
  const day = dayKeyUTC();
  const ref = db.collection('chaupaalMeta').doc('aiBudget');
  const snap = await ref.get();
  const data = snap.exists ? snap.data() || {} : {};
  if (data.day !== day) {
    return { ref, day, calls: 0, tokensEst: 0, paused: AI_JOBS_PAUSED };
  }
  return {
    ref,
    day,
    calls: Number(data.calls) || 0,
    tokensEst: Number(data.tokensEst) || 0,
    paused: AI_JOBS_PAUSED || data.paused === true,
  };
}

async function bumpBudget(db, admin, { calls = 1, tokensEst = 400 } = {}) {
  const day = dayKeyUTC();
  const ref = db.collection('chaupaalMeta').doc('aiBudget');
  await ref.set(
    {
      day,
      calls: admin.firestore.FieldValue.increment(calls),
      tokensEst: admin.firestore.FieldValue.increment(tokensEst),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

function budgetAllows(budget) {
  if (budget.paused || AI_JOBS_PAUSED) return false;
  if (!isAiFeaturesEnabled()) return false;
  return budget.calls < AI_DAILY_CALL_CAP;
}

async function labelTextWithAI(text, { teen = false } = {}) {
  const redacted = redactForPrompt(text, { teen });
  if (!redacted || redacted.length < 8) return { topics: [], source: 'heuristic' };
  const chips = INTEREST_CHIPS.join(', ');
  const result = await callAI({
    tier: 'fast',
    feature: 'content_topic_label',
    max_tokens: 200,
    system: `Classify Chaupaal content into 0-4 topics from this EXACT list only: ${chips}.
Never invent topics. Never infer religion, caste, sexuality, health, income, or dating intent.
Return JSON only: {"topics":[{"key":"Travel","confidence":0.0}]}`,
    messages: [{ role: 'user', content: redacted.slice(0, 800) }],
  });
  let parsed = null;
  try {
    const raw = String(result.text || '').replace(/```json|```/g, '');
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch (e) {
    return { topics: heuristicLabel(text), source: 'heuristic', parseError: true };
  }
  const topics = validateTopics(parsed?.topics);
  return {
    topics: topics.length ? topics : heuristicLabel(text),
    source: topics.length ? 'ai' : 'heuristic',
    model: result.model,
    provider: result.provider,
  };
}

function extractContentText(doc) {
  const d = doc || {};
  return [d.caption, d.question, d.text, d.title, d.tag, d.summary].filter(Boolean).join('\n');
}

/**
 * Label a batch of duniya / peepal docs.
 */
async function runContentTopicLabelJob(db, admin, { collection = 'duniya', batchSize = BATCH_CONTENT } = {}) {
  const budget = await loadBudget(db);
  const cursorRef = db.collection('chaupaalMeta').doc(`labelCursor_${collection}`);
  const cursorSnap = await cursorRef.get();
  const cursor = cursorSnap.exists ? cursorSnap.data() || {} : {};
  let lastId = cursor.lastId || null;

  let q = db.collection(collection).orderBy('__name__').limit(batchSize);
  if (lastId) q = q.startAfter(lastId);
  const snap = await q.get();

  const results = {
    collection,
    scanned: snap.size,
    labeled: 0,
    cached: 0,
    heuristic: 0,
    ai: 0,
    skippedBudget: 0,
    skipped: 0,
  };

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    if (data.deleted || data.archived) {
      results.skipped += 1;
      continue;
    }
    const text = extractContentText(data);
    if (!text.trim()) {
      results.skipped += 1;
      continue;
    }
    const hash = contentHash(text);
    if (data.topicLabel?.contentHash === hash && data.topicLabel?.version === LABEL_VERSION) {
      results.cached += 1;
      continue;
    }

    let label;
    const canAi = budgetAllows(budget) && budget.calls + results.ai < AI_DAILY_CALL_CAP;
    if (canAi) {
      try {
        label = await labelTextWithAI(text, { teen: false });
        if (label.source === 'ai') {
          results.ai += 1;
          budget.calls += 1;
          await bumpBudget(db, admin, { calls: 1, tokensEst: 350 });
        } else {
          results.heuristic += 1;
        }
      } catch (e) {
        if (e instanceof AiDisabledError || e?.code === 'AI_DISABLED') {
          label = { topics: heuristicLabel(text), source: 'heuristic' };
          results.heuristic += 1;
        } else {
          label = { topics: heuristicLabel(text), source: 'heuristic', error: e?.message };
          results.heuristic += 1;
        }
      }
    } else {
      if (isAiFeaturesEnabled() && !budgetAllows(budget)) results.skippedBudget += 1;
      label = { topics: heuristicLabel(text), source: 'heuristic' };
      results.heuristic += 1;
    }

    const topics = validateTopics(label.topics);
    const primary = topics[0]?.key || null;
    await doc.ref.set(
      {
        topics,
        topicPrimary: primary,
        // Keep tag if absent so P6 tag affinity can consume
        ...(data.tag ? {} : primary ? { tag: primary } : {}),
        topicLabel: {
          contentHash: hash,
          version: LABEL_VERSION,
          source: label.source || 'heuristic',
          model: label.model || null,
          provider: label.provider || null,
          labeledAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      { merge: true }
    );
    results.labeled += 1;
  }

  if (snap.empty || snap.size < batchSize) {
    await cursorRef.set({ lastId: null, updatedAt: new Date(), wrapped: true }, { merge: true });
    results.wrapped = true;
  } else {
    await cursorRef.set(
      { lastId: snap.docs[snap.docs.length - 1].id, updatedAt: new Date(), wrapped: false },
      { merge: true }
    );
  }
  return results;
}

/**
 * Derive interest suggestions from bio/prompts — never overwrite declared chips.
 */
async function runProfileEnrichmentJob(db, admin, { batchSize = BATCH_PROFILES } = {}) {
  const budget = await loadBudget(db);
  const cursorRef = db.collection('chaupaalMeta').doc('profileEnrichCursor');
  const cursorSnap = await cursorRef.get();
  const cursor = cursorSnap.exists ? cursorSnap.data() || {} : {};
  let lastUid = cursor.lastUid || null;

  let q = db.collection('users').orderBy('__name__').limit(batchSize);
  if (lastUid) q = q.startAfter(lastUid);
  const snap = await q.get();

  const results = { scanned: snap.size, enriched: 0, skipped: 0, optedOut: 0, teen: 0, cached: 0, ai: 0 };

  for (const doc of snap.docs) {
    const user = doc.data() || {};
    const profile = user.profile && typeof user.profile === 'object' ? user.profile : {};
    if (user.activitySignalsOptOut === true || profile.activitySignalsOptOut === true) {
      results.optedOut += 1;
      continue;
    }
    const teen =
      user.teenMode === true ||
      profile.teenMode === true ||
      (typeof user.age === 'number' && user.age < 18) ||
      (typeof profile.age === 'number' && profile.age < 18);
    if (teen) results.teen += 1;

    const declared = []
      .concat(profile.interests || [])
      .concat(profile.hobbies || [])
      .concat(user.interests || []);
    const declaredSet = new Set(declared.map((x) => String(x).toLowerCase()));

    const text = buildSemanticText({ ...user, uid: doc.id, profile });
    if (!text.trim()) {
      results.skipped += 1;
      continue;
    }
    const hash = contentHash(text);
    if (user.derivedInterests?.contentHash === hash && user.derivedInterests?.version === LABEL_VERSION) {
      results.cached += 1;
      continue;
    }

    let topics = [];
    let source = 'heuristic';
    const canAi = budgetAllows(budget) && !teen; // teens: heuristic only (no dating-intent AI)
    if (canAi) {
      try {
        const label = await labelTextWithAI(text, { teen: false });
        topics = label.topics;
        source = label.source;
        if (source === 'ai') {
          results.ai += 1;
          budget.calls += 1;
          await bumpBudget(db, admin, { calls: 1, tokensEst: 400 });
        }
      } catch (e) {
        topics = heuristicLabel(text);
        source = 'heuristic';
      }
    } else {
      topics = heuristicLabel(text);
    }

    // Strip dating-related for teens always
    if (teen) {
      topics = topics.filter((t) => !/dat|marriage|romance/i.test(t.key));
    }

    // Never overwrite declared — store only additive suggestions
    const suggestions = topics
      .map((t) => t.key)
      .filter((k) => !declaredSet.has(k.toLowerCase()))
      .slice(0, 5);

    // Cold-start internal descriptor (never shown as profile copy)
    const coldSummary = [
      declared.slice(0, 3).join(', ') || suggestions.slice(0, 3).join(', ') || 'new member',
      profile.currentCity || user.city || '',
      profile.occupation || '',
    ]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 160);

    await doc.ref.set(
      {
        derivedInterests: {
          suggestions,
          topics,
          contentHash: hash,
          version: LABEL_VERSION,
          source,
          labeledAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        coldStartSummary: {
          text: coldSummary,
          internal: true,
          version: LABEL_VERSION,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      { merge: true }
    );
    results.enriched += 1;
  }

  if (snap.empty || snap.size < batchSize) {
    await cursorRef.set({ lastUid: null, updatedAt: new Date(), wrapped: true }, { merge: true });
    results.wrapped = true;
  } else {
    await cursorRef.set(
      { lastUid: snap.docs[snap.docs.length - 1].id, updatedAt: new Date(), wrapped: false },
      { merge: true }
    );
  }
  return results;
}

/**
 * Periodic profile embedding sweep (hash-deduped).
 */
async function runEmbeddingSweepJob(db, admin, { batchSize = BATCH_EMBEDS } = {}) {
  const cursorRef = db.collection('chaupaalMeta').doc('embedSweepCursor');
  const cursorSnap = await cursorRef.get();
  const cursor = cursorSnap.exists ? cursorSnap.data() || {} : {};
  let lastUid = cursor.lastUid || null;
  let q = db.collection('users').orderBy('__name__').limit(batchSize);
  if (lastUid) q = q.startAfter(lastUid);
  const snap = await q.get();
  const { refreshEmbedding } = (() => {
    // Inline minimal refresh to avoid circular require through peepal-reactions
    return {
      refreshEmbedding: async (uid) => {
        const { embedText, textHash: th } = require('./embeddings');
        const { buildSemanticText: bst } = require('./matchmaking');
        const ref = db.collection('users').doc(uid);
        const s = await ref.get();
        if (!s.exists) return { ok: false };
        const data = { uid, ...s.data() };
        if (data.activitySignalsOptOut === true || data.profile?.activitySignalsOptOut === true) {
          return { ok: false, reason: 'opt_out' };
        }
        const text = bst(data);
        if (!text.trim()) return { ok: false, reason: 'empty' };
        const hash = th(text);
        const prev = data.profileEmbedding || {};
        if (prev.textHash === hash && Array.isArray(prev.vector) && prev.vector.length) {
          return { ok: true, cached: true };
        }
        try {
          const vector = await embedText(text);
          await ref.set(
            {
              profileEmbedding: {
                vector,
                textHash: hash,
                model: process.env.GEMINI_EMBED_MODEL || 'text-embedding-004',
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                mediaExcluded: true,
              },
            },
            { merge: true }
          );
          return { ok: true, cached: false };
        } catch (e) {
          return { ok: false, error: e?.message || String(e) };
        }
      },
    };
  })();

  const results = { scanned: snap.size, refreshed: 0, cached: 0, skipped: 0, errors: 0 };
  for (const doc of snap.docs) {
    const r = await refreshEmbedding(doc.id);
    if (r.cached) results.cached += 1;
    else if (r.ok) results.refreshed += 1;
    else if (r.error) results.errors += 1;
    else results.skipped += 1;
  }
  if (snap.empty || snap.size < batchSize) {
    await cursorRef.set({ lastUid: null, updatedAt: new Date(), wrapped: true }, { merge: true });
    results.wrapped = true;
  } else {
    await cursorRef.set(
      { lastUid: snap.docs[snap.docs.length - 1].id, updatedAt: new Date(), wrapped: false },
      { merge: true }
    );
  }
  return results;
}

/**
 * Akhbaar / category_cache: map category name → canonical topics (heuristic; no LLM).
 * Full AI labeling stays paused with CATEGORY_CRON_PAUSED (default).
 */
async function runAkhbaarTopicSeedJob(db, admin, { batchSize = 12 } = {}) {
  const cursorRef = db.collection('chaupaalMeta').doc('labelCursor_category_cache');
  const cursorSnap = await cursorRef.get();
  const cursor = cursorSnap.exists ? cursorSnap.data() || {} : {};
  let lastId = cursor.lastId || null;
  let q = db.collection('category_cache').orderBy('__name__').limit(batchSize);
  if (lastId) q = q.startAfter(lastId);
  let snap;
  try {
    snap = await q.get();
  } catch (e) {
    return { skipped: true, reason: e?.message || 'category_cache_unavailable' };
  }
  const results = { scanned: snap.size, labeled: 0, cached: 0, skipped: 0 };
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const cat = String(data.category || data.catName || data.tag || '').trim();
    const text = [cat, data.title, data.headline, data.question].filter(Boolean).join('\n');
    if (!text.trim()) {
      results.skipped += 1;
      continue;
    }
    const hash = contentHash(text);
    if (data.topicLabel?.contentHash === hash && data.topicLabel?.version === LABEL_VERSION) {
      results.cached += 1;
      continue;
    }
    const fromCat = validateTopics([{ key: cat, confidence: 0.7 }]);
    const topics = fromCat.length ? fromCat : heuristicLabel(text);
    const primary = topics[0]?.key || null;
    await doc.ref.set(
      {
        topics,
        topicPrimary: primary,
        ...(data.tag ? {} : primary ? { tag: primary } : {}),
        topicLabel: {
          contentHash: hash,
          version: LABEL_VERSION,
          source: 'heuristic',
          model: null,
          provider: null,
          labeledAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      { merge: true }
    );
    results.labeled += 1;
  }
  if (snap.empty || snap.size < batchSize) {
    await cursorRef.set({ lastId: null, updatedAt: new Date(), wrapped: true }, { merge: true });
    results.wrapped = true;
  } else {
    await cursorRef.set(
      { lastId: snap.docs[snap.docs.length - 1].id, updatedAt: new Date(), wrapped: false },
      { merge: true }
    );
  }
  return results;
}

/**
 * Scheduler entry: run enrichment slice within duration budget.
 */
async function runAiEnrichmentBatch(db, admin) {
  if (AI_JOBS_PAUSED) {
    return { skipped: true, reason: 'AI_JOBS_PAUSED' };
  }
  const out = {
    duniya: null,
    peepal: null,
    akhbaar: null,
    profiles: null,
    embeds: null,
    contentEmbeddings: { skipped: true, reason: 'P6_does_not_consume_content_vectors' },
    teenPolicy:
      'Teens: heuristic-only profile enrichment; no dating-intent labels; stricter redaction if AI ever used for content.',
  };
  try {
    out.duniya = await runContentTopicLabelJob(db, admin, { collection: 'duniya', batchSize: 10 });
  } catch (e) {
    out.duniya = { error: e?.message || String(e) };
  }
  try {
    out.peepal = await runContentTopicLabelJob(db, admin, { collection: 'peepal', batchSize: 10 });
  } catch (e) {
    out.peepal = { error: e?.message || String(e) };
  }
  try {
    out.akhbaar = await runAkhbaarTopicSeedJob(db, admin, { batchSize: 12 });
  } catch (e) {
    out.akhbaar = { error: e?.message || String(e) };
  }
  try {
    out.profiles = await runProfileEnrichmentJob(db, admin, { batchSize: 8 });
  } catch (e) {
    out.profiles = { error: e?.message || String(e) };
  }
  try {
    out.embeds = await runEmbeddingSweepJob(db, admin, { batchSize: 6 });
  } catch (e) {
    out.embeds = { error: e?.message || String(e) };
  }
  return out;
}

module.exports = {
  LABEL_VERSION,
  PROHIBITED_TOPIC_KEYS,
  redactForPrompt,
  normalizeTopicKey,
  validateTopics,
  heuristicLabel,
  contentHash,
  labelTextWithAI,
  runContentTopicLabelJob,
  runAkhbaarTopicSeedJob,
  runProfileEnrichmentJob,
  runEmbeddingSweepJob,
  runAiEnrichmentBatch,
  loadBudget,
  bumpBudget,
  budgetAllows,
  AI_DAILY_CALL_CAP,
};
