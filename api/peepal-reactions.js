/**
 * Private Peepal up/down reactions.
 *
 * Reaction documents are readable only by their author. Aggregate summaries
 * live separately and are readable only by the Peepal post's author. Admin SDK
 * transactions prevent public post documents from leaking either count.
 */
const { sendSuccess, sendError, requireMethod, parseJsonBody } = require('../server-lib/http');
const { requireUser, initAdmin } = require('../server-lib/auth');
const { SEED_AUTHOR, PEEPAL_SEED_POSTS, personalSeedPost } = require('../server-lib/peepal-seeds');
const {
  buildSemanticText,
  embedText,
  passesStructuredFilters,
  rankPersonalMatches,
  normalizeProfileType,
} = require('../server-lib/matchmaking');
const {
  resolveIntentWeightProfile,
  logMatchEngagement,
  defaultWeights,
  normalizeWeights,
} = require('../server-lib/intent-weights');

const VALID_REACTIONS = new Set(['up', 'down']);
const MAX_HYDRATE_IDS = 20;
const MATCH_POOL = 80;

function cleanPostId(value) {
  const id = String(value || '').trim();
  return /^[A-Za-z0-9_-]{1,180}$/.test(id) ? id : '';
}

function publicSummary(data) {
  const up = Math.max(0, Number(data?.upCount) || 0);
  const down = Math.max(0, Number(data?.downCount) || 0);
  return { up, down };
}

async function hydrate(db, uid, postIds) {
  const ids = [...new Set((postIds || []).map(cleanPostId).filter(Boolean))].slice(0, MAX_HYDRATE_IDS);
  const items = {};
  await Promise.all(
    ids.map(async (postId) => {
      const postRef = db.collection('peepal').doc(postId);
      const reactionRef = postRef.collection('reactions').doc(uid);
      const [postSnap, reactionSnap] = await Promise.all([postRef.get(), reactionRef.get()]);
      if (!postSnap.exists || postSnap.data()?.deleted === true) return;
      const post = postSnap.data() || {};
      const item = { myReaction: reactionSnap.exists ? reactionSnap.data()?.reaction || null : null };
      if (post.uid === uid) {
        const summarySnap = await db.collection('peepalReactionSummaries').doc(postId).get();
        item.summary = publicSummary(summarySnap.data());
      }
      items[postId] = item;
    })
  );
  return items;
}

async function mutate(db, admin, uid, postId, nextReaction) {
  const postRef = db.collection('peepal').doc(postId);
  const reactionRef = postRef.collection('reactions').doc(uid);
  const summaryRef = db.collection('peepalReactionSummaries').doc(postId);

  return db.runTransaction(async (tx) => {
    const [postSnap, reactionSnap, summarySnap] = await Promise.all([
      tx.get(postRef),
      tx.get(reactionRef),
      tx.get(summaryRef),
    ]);
    if (!postSnap.exists || postSnap.data()?.deleted === true) throw new Error('POST_NOT_FOUND');

    const post = postSnap.data() || {};
    const previous = reactionSnap.exists ? reactionSnap.data()?.reaction || null : null;
    const counts = publicSummary(summarySnap.data());
    if (previous === 'up') counts.up = Math.max(0, counts.up - 1);
    if (previous === 'down') counts.down = Math.max(0, counts.down - 1);
    if (nextReaction === 'up') counts.up++;
    if (nextReaction === 'down') counts.down++;

    if (nextReaction) {
      tx.set(reactionRef, {
        uid,
        reaction: nextReaction,
        createdAt: reactionSnap.exists ? reactionSnap.data()?.createdAt || admin.firestore.FieldValue.serverTimestamp() : admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      tx.delete(reactionRef);
    }
    tx.set(
      summaryRef,
      {
        postId,
        ownerUid: post.uid,
        upCount: counts.up,
        downCount: counts.down,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // New backend recommendation input. No prior Peepal reaction signal
    // pipeline existed; recommenders can consume these owner-private events.
    tx.set(
      db.collection('users').doc(uid).collection('recommendationSignals').doc(`peepal_${postId}`),
      {
        type: 'peepal_reaction',
        postId,
        reaction: nextReaction,
        value: nextReaction === 'up' ? 1 : nextReaction === 'down' ? -1 : 0,
        tag: String(post.tag || '').slice(0, 80),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return {
      myReaction: nextReaction,
      summary: post.uid === uid ? counts : undefined,
    };
  });
}

// ⚠️ PRE-LAUNCH REMOVAL REQUIRED ⚠️
// Idempotently creates clearly-tagged dummy Peepal posts (isSeedContent: true,
// ids prefixed seed_peepal_) so the reaction/comment UI can be exercised while
// there is no real content. Delete these docs (or disable
// PEEPAL_SEED_CONTENT_ENABLED on the client) before real users arrive.
// Definitions live in server-lib/peepal-seeds.js. This branch lives here only
// to stay under the Hobby plan's serverless-function limit.
async function ensureSeedPost(db, admin, def, owner) {
  const ref = db.collection('peepal').doc(def.id);
  const snap = await ref.get();
  if (snap.exists) return { id: def.id, created: false };

  const now = admin.firestore.FieldValue.serverTimestamp();
  const options = Array.isArray(def.options) ? def.options : [];
  const responses = Array.isArray(def.responses) ? def.responses : options.map(() => 0);
  const comments = Array.isArray(def.comments) ? def.comments : [];

  const batch = db.batch();
  batch.set(ref, {
    question: def.question,
    format: def.format || 'open',
    options,
    responses,
    totalResponses: Number(def.totalResponses) || 0,
    comments: comments.length,
    tag: def.tag || 'CHAUPAAL',
    user: owner,
    uid: owner.uid,
    anonymous: false,
    deleted: false,
    attachment: null,
    isSeedContent: true,
    createdAt: now,
    ts: Date.now(),
  });
  comments.forEach((c) => {
    batch.set(ref.collection('comments').doc(c.id), {
      uid: c.user.uid,
      user: c.user,
      text: c.text,
      parentId: c.parentId || null,
      isSeedContent: true,
      createdAt: now,
      editedAt: null,
    });
  });

  try {
    await batch.commit();
  } catch (e) {
    // Another first-time visitor may have won the race to create shared seeds.
    if (e?.code !== 6 && !/already exist/i.test(e?.message || '')) throw e;
    return { id: def.id, created: false };
  }
  return { id: def.id, created: true };
}

async function seed(db, admin, user) {
  const results = [];
  for (const def of PEEPAL_SEED_POSTS) {
    results.push(await ensureSeedPost(db, admin, def, SEED_AUTHOR));
  }
  const personal = personalSeedPost(user.uid, user.name || user.displayName || 'You');
  results.push(await ensureSeedPost(db, admin, personal, personal.user));
  return {
    ensured: results.length,
    created: results.filter((r) => r.created).length,
    ids: results.map((r) => r.id),
    personalPostId: personal.id,
  };
}

async function refreshEmbedding(db, admin, uid) {
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('USER_NOT_FOUND');
  const data = { uid, ...snap.data() };
  const text = buildSemanticText(data);
  if (!text.trim()) {
    return { ok: false, reason: 'empty_profile_text', textLength: 0 };
  }
  const vector = await embedText(text);
  const payload = {
    profileEmbedding: {
      vector,
      model: process.env.GEMINI_EMBED_MODEL || 'text-embedding-004',
      textHash: String(text.length) + '_' + text.slice(0, 40),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      // Future 3C: mediaTranscriptsHash — unused while embeddings are text-only
      mediaExcluded: true,
    },
  };
  await ref.set(payload, { merge: true });
  return { ok: true, dims: vector.length, textLength: text.length };
}

async function personalMatch(db, admin, user, body) {
  const viewerSnap = await db.collection('users').doc(user.uid).get();
  if (!viewerSnap.exists) throw new Error('USER_NOT_FOUND');
  const viewer = { uid: user.uid, ...viewerSnap.data() };

  if (normalizeProfileType(viewer.profileType || viewer.profile?.profileType) !== 'personal') {
    return { matches: [], mode: 'skipped_professional', note: 'Personal matching only' };
  }

  // Ensure viewer embedding exists (best-effort)
  if (!viewer.profileEmbedding?.vector?.length) {
    try {
      await refreshEmbedding(db, admin, user.uid);
      const again = await db.collection('users').doc(user.uid).get();
      Object.assign(viewer, again.data() || {});
    } catch (e) {
      // Fall through — ranker will score 0 cosine and still apply filters/boosts weakly
    }
  }

  const intentText = String(
    body.intent || viewer.matchIntent || viewer.profile?.lookingFor || viewer.lookingFor || ''
  ).trim();

  let intentProfileId = null;
  let weights = defaultWeights();
  if (intentText) {
    try {
      const resolved = await resolveIntentWeightProfile(db, admin, {
        uid: user.uid,
        intentText,
      });
      intentProfileId = resolved.profileId || null;
      if (resolved.profile?.weights) weights = normalizeWeights(resolved.profile.weights);
    } catch (e) {
      console.warn('[personal_match] intent resolve', e?.message || e);
    }
  }

  const filters = {
    minAge: body.minAge != null ? Number(body.minAge) : null,
    maxAge: body.maxAge != null ? Number(body.maxAge) : null,
    city: body.sameCity ? viewer.profile?.currentCity || viewer.city || '' : body.city || '',
    language: body.language || '',
    intent: intentText,
  };

  const snap = await db.collection('users').where('openToMeet', '==', true).limit(MATCH_POOL).get();
  const candidates = [];
  snap.docs.forEach((d) => {
    const data = { uid: d.id, ...d.data() };
    if (data.uid === user.uid) return;
    if (!passesStructuredFilters(viewer, data, filters)) return;
    candidates.push(data);
  });

  // Edge hints for mutual weighting (sample)
  const edgeMap = {};
  await Promise.all(
    candidates.slice(0, 40).map(async (c) => {
      const [theyFollow, iFollow] = await Promise.all([
        db.collection('users').doc(c.uid).collection('following').doc(user.uid).get(),
        db.collection('users').doc(user.uid).collection('following').doc(c.uid).get(),
      ]);
      edgeMap[c.uid] = {
        theyFollowViewer: theyFollow.exists,
        viewerFollowsThem: iFollow.exists,
      };
    })
  );

  const ranked = rankPersonalMatches({
    viewer,
    candidates,
    edgeMap,
    limit: Math.min(12, Number(body.limit) || 8),
    intent: intentText,
    weights,
  });

  // Persist impression context for ignored-window tracking (client may later log ignored)
  const matchBatch = ranked.map((m) => ({
    uid: m.uid,
    signalScores: m.signalScores || {},
  }));

  return {
    mode: 'personal_hybrid',
    intentText,
    intentProfileId,
    matches: ranked.map((m) => ({
      uid: m.uid,
      score: Math.round(m.score * 100),
      cosine: Math.round((m.cosine || 0) * 1000) / 1000,
      mutualStable: !!m.mutualStable,
      signals: m.signals || [],
      signalScores: m.signalScores || {},
      intentProfileId,
      name: m.user?.name || m.user?.profile?.displayName || 'Member',
      username: m.user?.username || '',
      photoURL: m.user?.photoURL || m.user?.photoThumb || '',
      city: m.user?.profile?.currentCity || m.user?.city || '',
      age: m.user?.age || null,
      bio: m.user?.profile?.bio || m.user?.bio || '',
      interests: m.user?.profile?.interests || m.user?.interests || [],
      prompts: m.user?.profile?.prompts || m.user?.prompts || [],
      icebreakers: m.user?.icebreakers || m.user?.profile?.icebreakers || [],
      profileType: 'personal',
    })),
    matchBatch,
  };
}

module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  const user = await requireUser(req, res, { allowWeak: false });
  if (!user) return;
  const admin = initAdmin();
  if (!admin) return sendError(res, 503, 'AUTH_NOT_CONFIGURED', 'Firebase Admin not configured');

  let body;
  try {
    body = parseJsonBody(req);
  } catch {
    return sendError(res, 400, 'INVALID_JSON', 'Invalid JSON body');
  }

  try {
    const db = admin.firestore();
    if (body.action === 'hydrate') {
      const items = await hydrate(db, user.uid, Array.isArray(body.postIds) ? body.postIds : []);
      return sendSuccess(res, { items });
    }
    if (body.action === 'seed') {
      // ⚠️ PRE-LAUNCH REMOVAL REQUIRED — see ensureSeedPost above.
      return sendSuccess(res, await seed(db, admin, user));
    }
    if (body.action === 'refresh_embedding') {
      const result = await refreshEmbedding(db, admin, user.uid);
      return sendSuccess(res, result);
    }
    if (body.action === 'personal_match') {
      const result = await personalMatch(db, admin, user, body || {});
      return sendSuccess(res, result);
    }
    if (body.action === 'log_match_engagement') {
      const result = await logMatchEngagement(db, admin, {
        uid: user.uid,
        intentProfileId: body.intentProfileId,
        candidateUid: body.candidateUid,
        signalScores: body.signalScores || {},
        outcome: body.outcome,
        intentText: body.intentText || '',
      });
      return sendSuccess(res, result);
    }

    const postId = cleanPostId(body.postId);
    const reaction = body.reaction == null || body.reaction === '' ? null : String(body.reaction);
    if (!postId || (reaction && !VALID_REACTIONS.has(reaction))) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Valid postId and reaction (up, down, or null) required');
    }
    const result = await mutate(db, admin, user.uid, postId, reaction);
    return sendSuccess(res, result);
  } catch (error) {
    if (error?.message === 'POST_NOT_FOUND') {
      return sendError(res, 404, 'NOT_FOUND', 'Peepal post not found');
    }
    if (error?.message === 'USER_NOT_FOUND') {
      return sendError(res, 404, 'NOT_FOUND', 'User not found');
    }
    if (error?.code === 'NO_GEMINI') {
      return sendError(res, 503, 'GEMINI_NOT_CONFIGURED', 'Set GEMINI_API_KEY for embeddings');
    }
    console.error('[peepal-reactions]', error?.message || error);
    return sendError(res, 500, 'PEEPAL_REACTION_FAILED', 'Could not save reaction');
  }
};
