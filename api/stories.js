/**
 * Separate Baithak and Duniya story repositories.
 * Baithak uses private per-recipient inbox fanout so no audience list or
 * Close Friends marker is ever exposed to another viewer.
 */
const { sendSuccess, sendError, requireMethod, parseJsonBody } = require('../server-lib/http');
const { requireUser, initAdmin } = require('../server-lib/auth');
const { checkActionRateLimit } = require('../server-lib/rate-limit');
const { canViewStory: canViewStoryPolicy } = require('../server-lib/social-model');

const DAY_MS = 24 * 60 * 60 * 1000;
const COLLECTIONS = {
  baithak: 'baithak_stories',
  duniya: 'duniya_stories',
};

function cleanUid(value) {
  const uid = String(value || '').trim();
  return /^[A-Za-z0-9_-]{1,180}$/.test(uid) ? uid : '';
}

function cleanDestination(value) {
  return value === 'baithak' || value === 'duniya' ? value : '';
}

function cleanMedia(value) {
  const media = String(value || '').trim();
  return /^https:\/\//i.test(media) ? media.slice(0, 2048) : '';
}

function cleanText(value, max) {
  return String(value || '').trim().slice(0, max);
}

function cleanClientId(value) {
  const id = String(value || '').trim();
  return /^[A-Za-z0-9_-]{8,100}$/.test(id) ? id : '';
}

const MUSIC_SOURCES = new Set(['jiosaavn', 'itunes', 'none']);

/** Sanitize optional inline music metadata for stories (no external link-outs). */
function cleanMusic(value) {
  if (!value || typeof value !== 'object') return null;
  const title = cleanText(value.title, 160);
  if (!title) return null;
  const artist = cleanText(value.artist, 160) || 'Unknown artist';
  const thumbnail = cleanMedia(value.thumbnail);
  const previewRaw = String(value.previewUrl || '').trim();
  const previewUrl = /^https:\/\//i.test(previewRaw) ? previewRaw.slice(0, 2048) : '';
  const source = MUSIC_SOURCES.has(String(value.source || '').toLowerCase())
    ? String(value.source).toLowerCase()
    : previewUrl
      ? 'jiosaavn'
      : 'none';
  return {
    title,
    artist,
    thumbnail,
    previewUrl: previewUrl || null,
    source: previewUrl ? source : 'none',
  };
}

/** Sanitize optional location attachment for stories (Leaflet / live share metadata). */
function cleanLocation(value) {
  if (!value || typeof value !== 'object') return null;
  const lat = Number(value.lat);
  const lng = Number(value.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const mode = ['current', 'place', 'pin', 'live'].includes(String(value.mode || ''))
    ? String(value.mode)
    : 'pin';
  const placeName = cleanText(value.placeName || value.name, 120) || null;
  const address = cleanText(value.address, 240) || null;
  const label =
    cleanText(
      value.label || placeName || address || (mode === 'live' ? 'Live location' : 'Location'),
      160
    ) || 'Location';
  const expiresAt = value.expiresAt != null ? Number(value.expiresAt) : null;
  const startedAt = value.startedAt != null ? Number(value.startedAt) : null;
  return {
    type: 'location',
    mode,
    lat,
    lng,
    placeName,
    address,
    label,
    liveShareId: cleanText(value.liveShareId, 80) || null,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
    durationMs: Number(value.durationMs) || null,
    startedAt: Number.isFinite(startedAt) ? startedAt : null,
  };
}

async function isFriend(db, a, b) {
  if (!a || !b || a === b) return false;
  const [ab, ba] = await db.getAll(
    db.collection('users').doc(a).collection('following').doc(b),
    db.collection('users').doc(b).collection('following').doc(a)
  );
  return ab.exists && ba.exists;
}

async function isBlockedPair(db, a, b) {
  const [aBlock, bBlock] = await db.getAll(
    db.collection('blocks').doc(a),
    db.collection('blocks').doc(b)
  );
  return (aBlock.data()?.blocked || []).includes(b) || (bBlock.data()?.blocked || []).includes(a);
}

async function friendIds(db, uid) {
  const user = db.collection('users').doc(uid);
  const [following, followers] = await Promise.all([
    user.collection('following').get(),
    user.collection('followers').get(),
  ]);
  const inbound = new Set(followers.docs.map((doc) => doc.id));
  return following.docs.map((doc) => doc.id).filter((id) => inbound.has(id));
}

async function recipientIds(db, uid, visibility) {
  if (visibility === 'close_friends') {
    const close = await db.collection('users').doc(uid).collection('close_friends').get();
    const possible = close.docs.map((doc) => doc.id);
    const checks = await Promise.all(
      possible.map(async (target) => (await isFriend(db, uid, target)) && !(await isBlockedPair(db, uid, target)))
    );
    return possible.filter((_, index) => checks[index]);
  }
  const friends = await friendIds(db, uid);
  const allowed = await Promise.all(friends.map(async (target) => !(await isBlockedPair(db, uid, target))));
  return friends.filter((_, index) => allowed[index]);
}

async function commitChunks(db, writes) {
  for (let start = 0; start < writes.length; start += 450) {
    const batch = db.batch();
    writes.slice(start, start + 450).forEach((write) => write(batch));
    await batch.commit();
  }
}

function serializeStory(doc, viewerUid) {
  const data = doc.data ? doc.data() : doc;
  const own = data.uid === viewerUid;
  const output = {
    id: doc.id || data.id,
    uid: data.uid,
    destination: data.destination,
    kind: data.kind || 'story',
    type: data.type || 'media',
    name: data.name || 'Chaupaal member',
    avatar: data.avatar || '',
    media: data.media || '',
    thumb: data.thumb || '',
    mediaType: data.mediaType || 'image',
    rotation: [90, 180, 270].includes(Number(data.rotation)) ? Number(data.rotation) : 0,
    text: data.text || '',
    sharedGameId: data.sharedGameId || '',
    music: data.music || null,
    location: data.location || null,
    score: data.score || 0,
    total: data.total || 0,
    streak: data.streak || 0,
    createdAt: data.createdAt?.toMillis?.() || data.createdAt || Date.now(),
    expiresAt: data.expiresAt?.toMillis?.() || data.expiresAt || 0,
    own,
    deletable: own,
  };
  // Audience metadata is poster-only. Recipients get no selective-sharing tell.
  if (own) output.visibility = data.visibility || (data.destination === 'duniya' ? 'public' : 'friends');
  return output;
}

async function canView(db, story, viewerUid, includeArchive) {
  const data = story.data();
  const owner = data.uid === viewerUid;
  if (includeArchive && !owner) return false;
  const blocked = owner ? false : await isBlockedPair(db, data.uid, viewerUid);
  const expires = data.expiresAt?.toMillis?.() || 0;
  const friend = data.destination === 'baithak' ? await isFriend(db, data.uid, viewerUid) : false;
  const membership =
    data.destination === 'baithak' && data.visibility === 'close_friends'
      ? await db.collection('users').doc(data.uid).collection('close_friends').doc(viewerUid).get()
      : null;
  return canViewStoryPolicy({
    destination: data.destination,
    visibility: data.visibility,
    audience: data.audience,
    isOwner: owner,
    allowOwnerArchive: includeArchive,
    isFriend: friend,
    isCloseFriend: !!membership?.exists,
    blocked,
    active: data.active !== false && !data.deletedAt,
    expired: expires <= Date.now(),
  });
}

async function createStory(db, admin, uid, body) {
  const destination = cleanDestination(body.destination);
  if (!destination) throw new Error('INVALID_DESTINATION');
  const media = cleanMedia(body.media);
  const text = cleanText(body.text, 1200);
  const music = cleanMusic(body.music);
  const location = cleanLocation(body.location);
  if (!media && !text && !music && !location && body.type !== 'score') throw new Error('EMPTY_STORY');
  const kind = destination === 'baithak' && body.kind === 'instant' ? 'instant' : 'story';
  // Instants go to Close Friends by default (decision 9). If the list is empty,
  // fall back to Friends so the share still works — caller sees audienceFallback.
  let visibility =
    destination === 'baithak' && body.visibility === 'close_friends'
      ? 'close_friends'
      : destination === 'baithak'
        ? 'friends'
        : 'public';
  if (kind === 'instant' && destination === 'baithak') {
    visibility = 'close_friends';
  }
  let audienceFallback = null;
  if (destination === 'baithak' && visibility === 'close_friends') {
    const cfRecipients = await recipientIds(db, uid, 'close_friends');
    if (!cfRecipients.length) {
      visibility = 'friends';
      audienceFallback = 'friends';
    }
  }
  const collection = db.collection(COLLECTIONS[destination]);
  const clientId = cleanClientId(body.clientId);
  const ref = clientId ? collection.doc(`${uid}_${clientId}`) : collection.doc();
  if (clientId) {
    const existing = await ref.get();
    if (existing.exists && existing.data().uid === uid) {
      if (destination === 'baithak') {
        const data = existing.data();
        const manifestRef = db.collection('users').doc(uid).collection('storyDeliveryManifests').doc(ref.id);
        const manifest = await manifestRef.get();
        const recipients = manifest.exists
          ? manifest.data().recipientIds || []
          : await recipientIds(db, uid, data.visibility);
        const writes = [
          (batch) =>
            batch.set(
              manifestRef,
              {
                storyId: ref.id,
                destination,
                recipientIds: recipients,
                createdAt: data.createdAt,
                expiresAt: data.expiresAt,
              },
              { merge: true }
            ),
          ...recipients.map(
            (recipientUid) => (batch) =>
              batch.set(
                db.collection('users').doc(recipientUid).collection('storyInbox').doc(`baithak_${ref.id}`),
                {
                  storyId: ref.id,
                  ownerUid: uid,
                  destination: 'baithak',
                  createdAt: data.createdAt,
                  expiresAt: data.expiresAt,
                },
                { merge: true }
              )
          ),
        ];
        await commitChunks(db, writes);
      }
      return serializeStory(existing, uid);
    }
  }
  const userSnap = await db.collection('users').doc(uid).get();
  const user = userSnap.data() || {};
  const now = admin.firestore.Timestamp.now();
  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + DAY_MS);
  const story = {
    uid,
    destination,
    audience: destination === 'duniya' ? 'public' : null,
    visibility,
    kind,
    type: cleanText(body.type, 30) || 'media',
    name: cleanText(user.name || user.displayName || user.username, 100) || 'Chaupaal member',
    avatar: cleanMedia(user.photoThumb || user.photoURL) || cleanText(body.avatar, 12),
    media,
    thumb: cleanMedia(body.thumb),
    mediaType: body.mediaType === 'video' ? 'video' : 'image',
    rotation: [90, 180, 270].includes(Number(body.rotation)) ? Number(body.rotation) : 0,
    text,
    sharedGameId: cleanText(body.sharedGameId, 50),
    music: music || null,
    location: location || null,
    score: body.type === 'score' ? Math.max(0, Number(body.score) || 0) : null,
    total: body.type === 'score' ? Math.max(0, Number(body.total) || 0) : null,
    streak: body.type === 'score' ? Math.max(0, Number(body.streak) || 0) : null,
    active: true,
    createdAt: now,
    expiresAt,
  };

  if (destination === 'duniya') {
    await ref.set(story);
    return serializeStory({ id: ref.id, data: () => story }, uid);
  }

  const recipients = await recipientIds(db, uid, visibility);
  if (visibility === 'close_friends' && !recipients.length) throw new Error('NO_CLOSE_FRIENDS');
  const manifest = db.collection('users').doc(uid).collection('storyDeliveryManifests').doc(ref.id);
  const writes = [
    (batch) => batch.set(ref, story),
    (batch) =>
      batch.set(manifest, {
        storyId: ref.id,
        destination,
        recipientIds: recipients,
        createdAt: now,
        expiresAt,
      }),
    ...recipients.map(
      (recipientUid) => (batch) =>
        batch.set(db.collection('users').doc(recipientUid).collection('storyInbox').doc(`baithak_${ref.id}`), {
          storyId: ref.id,
          ownerUid: uid,
          destination: 'baithak',
          createdAt: now,
          expiresAt,
        })
    ),
  ];
  await commitChunks(db, writes);
  const serialized = serializeStory({ id: ref.id, data: () => story }, uid);
  if (audienceFallback) serialized.audienceFallback = audienceFallback;
  return serialized;
}

async function getStory(db, destination, storyId) {
  const collection = COLLECTIONS[destination];
  if (!collection || !storyId) return null;
  const snap = await db.collection(collection).doc(storyId).get();
  return snap.exists ? snap : null;
}

async function feedBaithak(db, uid) {
  const now = new Date();
  const inbox = await db
    .collection('users')
    .doc(uid)
    .collection('storyInbox')
    .where('expiresAt', '>', now)
    .limit(100)
    .get();
  const ids = inbox.docs.filter((doc) => doc.data().destination === 'baithak').map((doc) => doc.data().storyId);
  const refs = [...new Set(ids)].map((id) => db.collection('baithak_stories').doc(id));
  const delivered = refs.length ? await db.getAll(...refs) : [];
  const mine = await db.collection('baithak_stories').where('uid', '==', uid).limit(100).get();
  const candidates = [...delivered.filter((snap) => snap.exists), ...mine.docs];
  const unique = new Map(candidates.map((snap) => [snap.id, snap]));
  const allowed = [];
  for (const story of unique.values()) {
    if (await canView(db, story, uid, false)) allowed.push(serializeStory(story, uid));
  }
  return allowed.sort((a, b) => b.createdAt - a.createdAt);
}

async function feedDuniya(db, uid) {
  // Decision 2B: prefer people you follow + discovery ranking over pure recency (2C).
  // Keep collection-separate from Baithak.
  const snap = await db.collection('duniya_stories').where('expiresAt', '>', new Date()).limit(100).get();
  const followingSnap = await db.collection('users').doc(uid).collection('following').limit(200).get();
  const following = new Set(followingSnap.docs.map((d) => d.id));
  const output = [];
  for (const story of snap.docs) {
    if (await canView(db, story, uid, false)) {
      const serialized = serializeStory(story, uid);
      const owner = serialized.uid;
      let rank = serialized.createdAt || 0;
      if (owner === uid) rank += 1e13; // own stories first
      else if (following.has(owner)) rank += 5e12; // followed creators
      else rank += Math.min(2e11, (serialized.score || 0) * 1e9); // light discovery signal
      output.push({ ...serialized, _rank: rank });
    }
  }
  return output
    .sort((a, b) => b._rank - a._rank || b.createdAt - a.createdAt)
    .map(({ _rank, ...rest }) => rest);
}

async function profileStories(db, uid, targetUid) {
  const destinations = ['duniya', 'baithak'];
  const result = { duniya: [], baithak: [] };
  const now = Date.now();
  for (const destination of destinations) {
    const snap = await db.collection(COLLECTIONS[destination]).where('uid', '==', targetUid).limit(100).get();
    for (const story of snap.docs) {
      const data = story.data() || {};
      const expires = data.expiresAt?.toMillis?.() || data.expiresAt || 0;
      // Live ring only — expired stories are archived by default (hidden unless Highlighted).
      if (expires && expires <= now) continue;
      if (await canView(db, story, uid, false)) result[destination].push(serializeStory(story, uid));
    }
    result[destination].sort((a, b) => a.createdAt - b.createdAt);
  }
  return result;
}

async function listHighlights(db, uid, targetUid) {
  const ownerUid = targetUid || uid;
  const snap = await db.collection('users').doc(ownerUid).collection('story_highlights').limit(40).get();
  return snap.docs
    .map((doc) => {
      const d = doc.data() || {};
      return {
        id: doc.id,
        title: d.title || 'Highlight',
        coverUrl: d.coverUrl || '',
        storyCount: Array.isArray(d.storyRefs) ? d.storyRefs.length : 0,
        storyRefs: d.storyRefs || [],
        updatedAt: d.updatedAt?.toMillis?.() || 0,
      };
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

async function createHighlight(db, admin, uid, body) {
  const title = cleanText(body.title, 40) || 'Highlight';
  const ref = db.collection('users').doc(uid).collection('story_highlights').doc();
  const now = admin.firestore.FieldValue.serverTimestamp();
  await ref.set({
    title,
    coverUrl: cleanText(body.coverUrl, 500) || '',
    storyRefs: [],
    createdAt: now,
    updatedAt: now,
  });
  return { id: ref.id, title };
}

async function mutateHighlightStories(db, admin, uid, body, mode) {
  const highlightId = cleanText(body.highlightId, 180);
  const destination = cleanDestination(body.destination);
  const storyId = cleanText(body.storyId, 180);
  if (!highlightId || !destination || !storyId) throw new Error('INVALID_HIGHLIGHT');
  const href = db.collection('users').doc(uid).collection('story_highlights').doc(highlightId);
  const story = await getStory(db, destination, storyId);
  if (!story || story.data().uid !== uid) throw new Error('STORY_NOT_FOUND');
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(href);
    if (!snap.exists) throw new Error('HIGHLIGHT_NOT_FOUND');
    const refs = Array.isArray(snap.data()?.storyRefs) ? [...snap.data().storyRefs] : [];
    const key = `${destination}:${storyId}`;
    const filtered = refs.filter((r) => `${r.destination}:${r.storyId}` !== key);
    if (mode === 'add') {
      filtered.unshift({
        destination,
        storyId,
        thumb: story.data().thumb || story.data().media || '',
        addedAt: Date.now(),
      });
    }
    const coverUrl =
      mode === 'add'
        ? story.data().thumb || story.data().media || snap.data()?.coverUrl || ''
        : snap.data()?.coverUrl || '';
    tx.set(
      href,
      {
        storyRefs: filtered.slice(0, 50),
        coverUrl,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
  return { ok: true };
}

async function highlightStories(db, uid, highlightId, viewerUid) {
  const href = db.collection('users').doc(uid).collection('story_highlights').doc(highlightId);
  const snap = await href.get();
  if (!snap.exists) throw new Error('HIGHLIGHT_NOT_FOUND');
  const data = snap.data() || {};
  const stories = [];
  for (const ref of data.storyRefs || []) {
    const story = await getStory(db, ref.destination, ref.storyId);
    if (!story) continue;
    if (await canView(db, story, viewerUid, false)) {
      stories.push(serializeStory(story, viewerUid));
    }
  }
  return { highlight: { id: snap.id, title: data.title, coverUrl: data.coverUrl }, stories };
}

async function deleteStory(db, admin, uid, destination, storyId) {
  const story = await getStory(db, destination, storyId);
  if (!story || story.data().uid !== uid) throw new Error('STORY_NOT_FOUND');
  const now = admin.firestore.FieldValue.serverTimestamp();
  await story.ref.set({ active: false, deletedAt: now }, { merge: true });
  if (destination === 'baithak') {
    const manifestRef = db.collection('users').doc(uid).collection('storyDeliveryManifests').doc(storyId);
    const manifest = await manifestRef.get();
    const recipients = manifest.data()?.recipientIds || [];
    const writes = recipients.map(
      (recipientUid) => (batch) =>
        batch.delete(db.collection('users').doc(recipientUid).collection('storyInbox').doc(`baithak_${storyId}`))
    );
    writes.push((batch) => batch.delete(manifestRef));
    await commitChunks(db, writes);
  }
}

async function interact(db, admin, uid, body) {
  const destination = cleanDestination(body.destination);
  const story = await getStory(db, destination, cleanText(body.storyId, 180));
  if (!story || !(await canView(db, story, uid, false))) throw new Error('STORY_NOT_FOUND');
  const type = body.type;
  if (type === 'like') {
    const ref = story.ref.collection('likes').doc(uid);
    if (body.enabled === false) await ref.delete();
    else await ref.set({ uid, createdAt: admin.firestore.FieldValue.serverTimestamp() });
  } else if (type === 'comment') {
    const text = cleanText(body.text, 500);
    if (!text) throw new Error('EMPTY_COMMENT');
    const clientId = cleanClientId(body.clientId);
    const ref = clientId ? story.ref.collection('comments').doc(`${uid}_${clientId}`) : story.ref.collection('comments').doc();
    await ref.set({
      uid,
      text,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } else {
    throw new Error('INVALID_INTERACTION');
  }
}

async function interactions(db, uid, destination, storyId) {
  const story = await getStory(db, destination, storyId);
  if (!story || !(await canView(db, story, uid, story?.data()?.uid === uid))) throw new Error('STORY_NOT_FOUND');
  const [likes, comments] = await Promise.all([
    story.ref.collection('likes').limit(500).get(),
    story.ref.collection('comments').orderBy('createdAt', 'asc').limit(500).get(),
  ]);
  const profiles = await profilesMap(db, [
    ...likes.docs.map((doc) => doc.id),
    ...comments.docs.map((doc) => doc.data().uid),
  ]);
  return {
    liked: likes.docs.some((doc) => doc.id === uid),
    likeCount: likes.size,
    comments: comments.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        uid: data.uid,
        name: profiles[data.uid]?.name || 'Chaupaal member',
        avatar: profiles[data.uid]?.photoURL || '',
        text: data.text,
        createdAt: data.createdAt?.toMillis?.() || 0,
      };
    }),
  };
}

async function profilesMap(db, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  const snaps = await db.getAll(...unique.map((uid) => db.collection('users').doc(uid)));
  return Object.fromEntries(
    snaps.map((snap) => {
      const data = snap.data() || {};
      return [
        snap.id,
        {
          name: data.name || data.displayName || data.username || 'Chaupaal member',
          photoURL: data.photoThumb || data.photoURL || '',
        },
      ];
    })
  );
}

async function archive(db, uid) {
  const output = [];
  for (const destination of ['baithak', 'duniya']) {
    const snap = await db.collection(COLLECTIONS[destination]).where('uid', '==', uid).limit(250).get();
    output.push(...snap.docs.map((doc) => serializeStory(doc, uid)));
  }
  return output.sort((a, b) => b.createdAt - a.createdAt);
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
  const db = admin.firestore();
  const action = String(body.action || '');
  try {
    if (action === 'create') {
      const rate = await checkActionRateLimit(user.uid, 'post');
      if (!rate.ok) return sendError(res, 429, 'RATE_LIMITED', 'Too many stories. Try again shortly.');
    }
    if (action === 'interact') {
      const rate = await checkActionRateLimit(user.uid, body.type === 'comment' ? 'comment' : 'like');
      if (!rate.ok) return sendError(res, 429, 'RATE_LIMITED', 'Too many story interactions. Try again shortly.');
    }
    if (action === 'create') return sendSuccess(res, { story: await createStory(db, admin, user.uid, body) });
    if (action === 'feed') {
      const destination = cleanDestination(body.destination);
      if (!destination) throw new Error('INVALID_DESTINATION');
      return sendSuccess(res, {
        stories: destination === 'baithak' ? await feedBaithak(db, user.uid) : await feedDuniya(db, user.uid),
      });
    }
    if (action === 'profile') {
      const targetUid = cleanUid(body.targetUid);
      if (!targetUid) throw new Error('INVALID_TARGET');
      return sendSuccess(res, { stories: await profileStories(db, user.uid, targetUid) });
    }
    if (action === 'delete') {
      await deleteStory(db, admin, user.uid, cleanDestination(body.destination), cleanText(body.storyId, 180));
      return sendSuccess(res, { deleted: true });
    }
    if (action === 'interact') {
      await interact(db, admin, user.uid, body);
      return sendSuccess(res, { saved: true });
    }
    if (action === 'interactions') {
      return sendSuccess(res, {
        interactions: await interactions(
          db,
          user.uid,
          cleanDestination(body.destination),
          cleanText(body.storyId, 180)
        ),
      });
    }
    if (action === 'archive') return sendSuccess(res, { stories: await archive(db, user.uid) });
    if (action === 'list_highlights') {
      const targetUid = cleanUid(body.targetUid) || user.uid;
      return sendSuccess(res, { highlights: await listHighlights(db, user.uid, targetUid) });
    }
    if (action === 'create_highlight') {
      return sendSuccess(res, await createHighlight(db, admin, user.uid, body));
    }
    if (action === 'add_highlight_story') {
      return sendSuccess(res, await mutateHighlightStories(db, admin, user.uid, body, 'add'));
    }
    if (action === 'remove_highlight_story') {
      return sendSuccess(res, await mutateHighlightStories(db, admin, user.uid, body, 'remove'));
    }
    if (action === 'open_highlight') {
      const ownerUid = cleanUid(body.targetUid) || user.uid;
      const highlightId = cleanText(body.highlightId, 180);
      return sendSuccess(res, await highlightStories(db, ownerUid, highlightId, user.uid));
    }
    return sendError(res, 400, 'VALIDATION_ERROR', 'Unknown story action');
  } catch (error) {
    const known = {
      INVALID_DESTINATION: [400, 'VALIDATION_ERROR', 'Invalid story destination'],
      INVALID_TARGET: [400, 'VALIDATION_ERROR', 'targetUid required'],
      EMPTY_STORY: [400, 'VALIDATION_ERROR', 'Story needs media or text'],
      EMPTY_COMMENT: [400, 'VALIDATION_ERROR', 'Comment cannot be empty'],
      INVALID_INTERACTION: [400, 'VALIDATION_ERROR', 'Invalid story interaction'],
      STORY_NOT_FOUND: [404, 'NOT_FOUND', 'Story unavailable'],
      HIGHLIGHT_NOT_FOUND: [404, 'NOT_FOUND', 'Highlight not found'],
      INVALID_HIGHLIGHT: [400, 'VALIDATION_ERROR', 'Highlight id / story required'],
      NO_CLOSE_FRIENDS: [400, 'NO_CLOSE_FRIENDS', 'Add at least one Friend to Close Friends before sharing'],
    }[error?.message];
    if (known) return sendError(res, known[0], known[1], known[2]);
    console.error('[stories]', action, error?.message || error);
    return sendError(res, 500, 'STORY_FAILED', 'Could not complete story action');
  }
};
