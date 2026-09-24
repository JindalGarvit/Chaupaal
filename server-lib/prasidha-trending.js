/**
 * Duniya Prasidha — server-backed trending posts (D4).
 *
 * Home: POST /api/stories { action: 'prasidha_trending' } (auth optional).
 * Window: last 7 days (matches i18n “trending this week”).
 * Pool: public Duniya posts only.
 * Excludes: SAMPLE/demo/seed, deleted, archived, saveOnly, non-public audiences.
 * Ranking: retrieve-rank rankContentItems (velocity + recency + contentEmbedding when present).
 * Live query — no denormalized cache (Hobby-friendly; ~120 doc scan).
 */
'use strict';

const { rankContentItems, loadModelSafe, isOptedOutUser } = require('./retrieve-rank');

const PRASIDHA_WINDOW_MS = 7 * 864e5;
const PRASIDHA_POOL = 120;
const PRASIDHA_LIMIT_DEFAULT = 36;
const PRASIDHA_LIMIT_MAX = 48;
const SAMPLE_ID_RE = /^d[1-5]$/;

function isPublicDuniyaAudience(audience) {
  const a = String(audience || 'public').toLowerCase();
  return a === 'public' || a === 'everyone' || a === '';
}

function createdMs(data) {
  const c = data?.createdAt;
  if (c?.toMillis) return c.toMillis();
  if (c?.toDate) return c.toDate().getTime();
  if (typeof c === 'number') return c;
  const ts = Number(data?.ts || 0);
  return ts || 0;
}

function firstSlide(data) {
  const slides = Array.isArray(data?.slides) ? data.slides : [];
  return slides[0] || null;
}

function toItem(id, data) {
  const slide = firstSlide(data);
  const ts = createdMs(data);
  const media = data.media || slide?.media || null;
  const thumb = data.thumb || slide?.thumb || media || null;
  const type = String(data.type || slide?.type || (media ? 'image' : 'text')).toLowerCase();
  return {
    id,
    firestoreId: id,
    uid: data.uid || data.user?.uid || '',
    authorUid: data.uid || data.user?.uid || '',
    user: data.user || { name: 'Member', avatar: '👤', uid: data.uid },
    caption: data.caption || '',
    type,
    media,
    thumb,
    mediaWidth: data.mediaWidth || slide?.width || null,
    mediaHeight: data.mediaHeight || slide?.height || null,
    slides: Array.isArray(data.slides) ? data.slides : undefined,
    likes: Number(data.likes || data.likeCount) || 0,
    comments: Number(data.comments || data.commentCount) || 0,
    shares: Number(data.shares) || 0,
    tags: Array.isArray(data.tags) ? data.tags : [],
    hashtags: Array.isArray(data.hashtags) ? data.hashtags : [],
    topics: Array.isArray(data.topics) ? data.topics : [],
    tag: data.tag || data.topicPrimary || '',
    contentEmbedding: data.contentEmbedding || null,
    ts,
    createdAtMs: ts,
    audience: data.audience || 'public',
    isSample: data.isSample === true || data.isDemo === true,
    isDemo: data.isDemo === true,
    isSeedContent: data.isSeedContent === true,
  };
}

function passesPrasidhaEligibility(id, data) {
  if (!data) return false;
  if (data.isSample === true || data.isDemo === true || data.isSeedContent === true) return false;
  if (id && SAMPLE_ID_RE.test(String(id))) return false;
  if (data.deleted === true) return false;
  if (data.archived === true || data.saveOnly === true) return false;
  if (data.hidden === true || data.shadowbanned === true) return false;
  if (!isPublicDuniyaAudience(data.audience)) return false;
  // Need some surface content (caption and/or media)
  const slide = firstSlide(data);
  const media = data.media || slide?.media || data.thumb || slide?.thumb;
  const caption = String(data.caption || '').trim();
  if (!media && !caption) return false;
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
async function prasidhaTrending(db, admin, user, body = {}) {
  const windowDays = Math.min(14, Math.max(1, Number(body.windowDays) || 7));
  const limit = Math.min(PRASIDHA_LIMIT_MAX, Math.max(6, Number(body.limit) || PRASIDHA_LIMIT_DEFAULT));
  const offset = Math.max(0, Number(body.offset) || 0);
  const sinceMs = Date.now() - windowDays * 864e5;

  let snap;
  try {
    snap = await db
      .collection('duniya')
      .where('ts', '>=', sinceMs)
      .orderBy('ts', 'desc')
      .limit(PRASIDHA_POOL)
      .get();
  } catch (e) {
    console.warn('[prasidha] ts query failed, fallback', e?.message || e);
    try {
      snap = await db.collection('duniya').orderBy('createdAt', 'desc').limit(PRASIDHA_POOL).get();
    } catch (e2) {
      try {
        snap = await db.collection('duniya').orderBy('ts', 'desc').limit(PRASIDHA_POOL).get();
      } catch (e3) {
        snap = await db.collection('duniya').limit(PRASIDHA_POOL).get();
      }
    }
  }

  const items = [];
  snap.docs.forEach((d) => {
    const data = d.data() || {};
    if (!passesPrasidhaEligibility(d.id, data)) return;
    const ts = createdMs(data);
    if (ts && ts < sinceMs) return;
    items.push(toItem(d.id, data));
  });

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
      friendUids = fol.docs.map((doc) => doc.id);
    } catch (e) {
      console.warn('[prasidha] personalize', e?.message || e);
    }
  }

  const ranked = rankContentItems({
    surface: 'duniya',
    items,
    model: optedOut ? null : model,
    opts: {
      viewerUid: user?.uid || null,
      friendUids,
      friendSlots: 3, // light follow boost — strangers still fill the rest
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
      firestoreId: it.firestoreId || it.id,
      caption: it.caption || '',
      type: it.type || 'text',
      media: it.media || null,
      thumb: it.thumb || null,
      mediaWidth: it.mediaWidth,
      mediaHeight: it.mediaHeight,
      slides: it.slides,
      likes: Number(it.likes) || 0,
      comments: Number(it.comments) || 0,
      shares: Number(it.shares) || 0,
      ts: it.ts,
      createdAt: it.ts,
      audience: 'public',
      user: {
        uid: it.user?.uid || it.uid || '',
        name: it.user?.name || 'Member',
        avatar: it.user?.avatar || '👤',
        photoURL: it.user?.photoURL || '',
        profileType: it.user?.profileType || 'personal',
        username: it.user?.username || '',
      },
      metaHint: friendBoost ? 'From someone you follow' : null,
      isSample: false,
      isDemo: false,
    };
  });

  return {
    mode: 'prasidha_velocity',
    windowDays,
    windowMs: windowDays * 864e5,
    offset,
    limit,
    hasMore: ranked.length > offset + limit,
    empty: posts.length === 0,
    emptyMessage:
      posts.length === 0
        ? 'No public posts trending this week yet. Post on Vishwa — we never invent popular clips.'
        : null,
    posts,
    note: 'Public Duniya only; SAMPLE/demo excluded; ~7-day velocity + recency. Live query, no denorm cache.',
  };
}

module.exports = {
  prasidhaTrending,
  passesPrasidhaEligibility,
  isPublicDuniyaAudience,
  PRASIDHA_WINDOW_MS,
  PRASIDHA_LIMIT_DEFAULT,
};
