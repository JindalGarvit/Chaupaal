/**
 * Peepal Mashhoor — server-backed trending discussions (K3).
 *
 * Window: last 7 days (matches i18n “this week”).
 * Pool: public Peepal posts only (audience everyone/public).
 * Excludes: seeds (isSeedContent), deleted, archived, saveOnly, friends/followers-only.
 * Ranking: retrieve-rank rankContentItems (velocity + recency + contentEmbedding when present).
 * Live query — no denormalized cache (Hobby-friendly; ~120 doc scan).
 */
'use strict';

const { rankContentItems, loadModelSafe, isOptedOutUser } = require('./retrieve-rank');

const MASHHOOR_WINDOW_MS = 7 * 864e5;
const MASHHOOR_POOL = 120;
const MASHHOOR_LIMIT_DEFAULT = 36;
const MASHHOOR_LIMIT_MAX = 48;

function isPublicPeepalAudience(audience) {
  const a = String(audience || 'everyone').toLowerCase();
  return a === 'everyone' || a === 'public' || a === '';
}

function createdMs(data, admin) {
  const c = data?.createdAt;
  if (c?.toMillis) return c.toMillis();
  if (c?.toDate) return c.toDate().getTime();
  if (typeof c === 'number') return c;
  const ts = Number(data?.ts || 0);
  return ts || 0;
}

function toItem(id, data) {
  const ts = createdMs(data);
  return {
    id,
    firestoreId: id,
    uid: data.uid || data.user?.uid || '',
    authorUid: data.uid || data.user?.uid || '',
    user: data.user || { name: 'Member', avatar: '👤', uid: data.uid },
    question: data.question || data.title || '',
    format: data.format || 'open',
    tag: data.tag || '',
    topics: Array.isArray(data.topics) ? data.topics : [],
    contentEmbedding: data.contentEmbedding || null,
    totalResponses: Number(data.totalResponses) || 0,
    comments: Number(data.comments) || 0,
    likes: Number(data.likes || data.likeCount) || 0,
    reactions: Number(data.totalResponses) || 0,
    ts,
    createdAtMs: ts,
    mediaWidth: data.attachment?.width || data.mediaWidth || null,
    mediaHeight: data.attachment?.height || data.mediaHeight || null,
    thumb: data.attachment?.thumb || data.attachment?.data || null,
    isSeedContent: data.isSeedContent === true,
    audience: data.audience || 'everyone',
  };
}

function passesMashhoorEligibility(data) {
  if (!data) return false;
  if (data.isSeedContent === true) return false;
  if (data.deleted === true) return false;
  if (data.archived === true || data.saveOnly === true) return false;
  if (data.hidden === true || data.shadowbanned === true) return false;
  if (!isPublicPeepalAudience(data.audience)) return false;
  const q = String(data.question || '').trim();
  if (!q) return false;
  return true;
}

/**
 * @returns {Promise<{
 *   windowDays: number,
 *   posts: Array<object>,
 *   empty: boolean,
 *   mode: string,
 * }>}
 */
async function mashhoorTrending(db, admin, user, body = {}) {
  const windowDays = Math.min(14, Math.max(1, Number(body.windowDays) || 7));
  const limit = Math.min(MASHHOOR_LIMIT_MAX, Math.max(6, Number(body.limit) || MASHHOOR_LIMIT_DEFAULT));
  const offset = Math.max(0, Number(body.offset) || 0);
  const sinceMs = Date.now() - windowDays * 864e5;

  let snap;
  try {
    snap = await db
      .collection('peepal')
      .where('ts', '>=', sinceMs)
      .orderBy('ts', 'desc')
      .limit(MASHHOOR_POOL)
      .get();
  } catch (e) {
    // Fallback if ts index missing — recent by createdAt then filter
    console.warn('[mashhoor] ts query failed, fallback', e?.message || e);
    try {
      snap = await db.collection('peepal').orderBy('createdAt', 'desc').limit(MASHHOOR_POOL).get();
    } catch (e2) {
      snap = await db.collection('peepal').limit(MASHHOOR_POOL).get();
    }
  }

  const items = [];
  snap.docs.forEach((d) => {
    const data = d.data() || {};
    if (!passesMashhoorEligibility(data)) return;
    const ts = createdMs(data);
    if (ts && ts < sinceMs) return;
    items.push(toItem(d.id, data));
  });

  // Optional: enrich reaction counts from summaries (best-effort, capped)
  try {
    await Promise.all(
      items.slice(0, 40).map(async (it) => {
        try {
          const s = await db.collection('peepalReactionSummaries').doc(it.id).get();
          if (!s.exists) return;
          const up = Number(s.data()?.upCount) || 0;
          const down = Number(s.data()?.downCount) || 0;
          it.likes = Math.max(it.likes, up);
          it.reactions = Math.max(it.reactions, up + down);
        } catch (e) {}
      })
    );
  } catch (e) {}

  let friendUids = [];
  let model = null;
  let optedOut = false;
  let viewerEmbedding = null;
  if (user?.uid) {
    try {
      const viewerSnap = await db.collection('users').doc(user.uid).get();
      const viewer = { uid: user.uid, ...(viewerSnap.data() || {}) };
      optedOut = isOptedOutUser(viewer);
      viewerEmbedding = viewer.profileEmbedding || null;
      model = await loadModelSafe(db, user.uid, { optedOut });
      const fol = await db.collection('users').doc(user.uid).collection('following').limit(80).get();
      friendUids = fol.docs.map((d) => d.id);
    } catch (e) {
      console.warn('[mashhoor] personalize', e?.message || e);
    }
  }

  const ranked = rankContentItems({
    surface: 'peepal',
    items,
    model: optedOut ? null : model,
    opts: {
      viewerUid: user?.uid || null,
      friendUids,
      friendSlots: 3,
      limit: offset + limit,
      viewerEmbedding: optedOut ? null : viewerEmbedding,
    },
  });

  const slice = ranked.slice(offset, offset + limit);
  const posts = slice.map((r) => {
    const it = r.item || {};
    const friendBoost = !!(r.friend || (r.explain || []).some((e) => /follow/i.test(String(e))));
    return {
      id: it.id,
      question: it.question,
      format: it.format,
      tag: it.tag,
      totalResponses: it.totalResponses || 0,
      comments: it.comments || 0,
      ts: it.ts,
      mediaWidth: it.mediaWidth,
      mediaHeight: it.mediaHeight,
      thumb: it.thumb || null,
      user: {
        uid: it.user?.uid || it.uid || '',
        name: it.user?.name || 'Member',
        avatar: it.user?.avatar || '👤',
        photoURL: it.user?.photoURL || '',
        profileType: it.user?.profileType || 'personal',
      },
      // Honest meta only — no invented % or fake “hot” scores
      metaHint: friendBoost ? 'From someone you follow' : r.explain?.[0] || null,
      replyCount: Number(it.comments) || Number(it.totalResponses) || 0,
    };
  });

  return {
    mode: 'mashhoor_velocity',
    windowDays,
    windowMs: windowDays * 864e5,
    offset,
    limit,
    hasMore: ranked.length > offset + limit,
    empty: posts.length === 0,
    emptyMessage:
      posts.length === 0
        ? 'No public discussions trending this week yet. Start one on Vriksha — we never invent popular posts.'
        : null,
    posts,
    note: 'Public Peepal only; seeds excluded; ~7-day velocity + recency.',
  };
}

module.exports = {
  mashhoorTrending,
  passesMashhoorEligibility,
  isPublicPeepalAudience,
  MASHHOOR_WINDOW_MS,
  MASHHOOR_LIMIT_DEFAULT,
};
