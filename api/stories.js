/**
 * Separate Baithak and Duniya story repositories.
 * Baithak uses private per-recipient inbox fanout so no audience list or
 * Close Friends marker is ever exposed to another viewer.
 */
const { sendSuccess, sendError, requireMethod, parseJsonBody } = require('../server-lib/http');
const { requireUser, initAdmin } = require('../server-lib/auth');
const { checkActionRateLimit } = require('../server-lib/rate-limit');
const { canViewStory: canViewStoryPolicy, isCloseFriendOptOut } = require('../server-lib/social-model');
const {
  isSplitKind,
  normalizeBaithakKind,
  closeFriendsRecipients,
  excludedIds,
} = require('../server-lib/close-friends');
const { isDuniyaPostRequest, dispatchDuniyaPost } = require('../server-lib/duniya-posts');
const {
  cleanOverlays,
  cleanInteractive,
  cleanMentions,
  cleanRestoryOf,
  publicInteractive,
  tallyResponses,
} = require('../server-lib/story-overlays');

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
  const friends = await friendIds(db, uid);
  const blockedFlags = await Promise.all(friends.map(async (target) => isBlockedPair(db, uid, target)));
  const blockedIds = friends.filter((_, index) => blockedFlags[index]);
  if (visibility === 'close_friends') {
    const excluded = await excludedIds(db, uid);
    return closeFriendsRecipients({
      friendIds: friends,
      excludedIds: [...excluded],
      blockedIds,
    });
  }
  return friends.filter((_, index) => !blockedFlags[index]);
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
    profileType: data.profileType || 'personal',
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
    overlays: Array.isArray(data.overlays) ? data.overlays : [],
    interactive: data.interactive || null,
    mentions: Array.isArray(data.mentions) ? data.mentions : [],
    durationMs: Number(data.durationMs) || 0,
    parentStoryId: data.parentStoryId || '',
    chainId: data.chainId || '',
    restoryOf: data.restoryOf || null,
    filter: data.filter || 'normal',
    crop: data.crop || null,
    trimStartMs: Number(data.trimStartMs) || 0,
    trimEndMs: Number(data.trimEndMs) || 0,
    muted: !!data.muted,
    width: Number(data.width) || 0,
    height: Number(data.height) || 0,
    addYoursFaces: Array.isArray(data.addYoursFaces) ? data.addYoursFaces.slice(0, 50) : [],
    addYoursCount: Number(data.addYoursCount) || 0,
  };
  if (own) {
    output.visibility = data.visibility || (data.destination === 'duniya' ? 'public' : 'friends');
    output.viewCount = Number(data.viewCount) || 0;
    output.likeCount = Number(data.likeCount) || 0;
  } else if (output.interactive?.quiz) {
    const quiz = { ...output.interactive.quiz };
    delete quiz.correctIndex;
    output.interactive = { ...output.interactive, quiz };
  }
  return output;
}

async function canView(db, story, viewerUid, includeArchive) {
  const data = story.data();
  const owner = data.uid === viewerUid;
  if (includeArchive && !owner) return false;
  const blocked = owner ? false : await isBlockedPair(db, data.uid, viewerUid);
  const expires = data.expiresAt?.toMillis?.() || 0;
  const friend = data.destination === 'baithak' ? await isFriend(db, data.uid, viewerUid) : false;
  let isCloseFriend = false;
  if (data.destination === 'baithak' && data.visibility === 'close_friends') {
    const excludedSnap = await db
      .collection('users')
      .doc(data.uid)
      .collection('cf_excluded')
      .doc(viewerUid)
      .get();
    isCloseFriend = isCloseFriendOptOut({ isFriend: friend, excluded: excludedSnap.exists });
  }
  return canViewStoryPolicy({
    destination: data.destination,
    visibility: data.visibility,
    audience: data.audience,
    isOwner: owner,
    allowOwnerArchive: includeArchive,
    isFriend: friend,
    isCloseFriend,
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
  const kind = normalizeBaithakKind(destination, body.kind);
  let visibility =
    destination === 'baithak' && body.visibility === 'close_friends'
      ? 'close_friends'
      : destination === 'baithak'
        ? 'friends'
        : 'public';
  if (isSplitKind(kind) && destination === 'baithak') {
    visibility = 'close_friends';
  }
  const audienceFallback = null;
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
  const saveOnly = body.saveOnly === true || body.visibility === 'archive_only';
  const highlightId = saveOnly ? cleanText(body.highlightId, 180) : '';
  const userSnap = await db.collection('users').doc(uid).get();
  const user = userSnap.data() || {};
  const now = admin.firestore.Timestamp.now();
  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + DAY_MS);
  const story = {
    uid,
    destination,
    audience: destination === 'duniya' ? 'public' : null,
    visibility: saveOnly ? 'archive_only' : visibility,
    kind,
    type: cleanText(body.type, 30) || 'media',
    name: cleanText(user.name || user.displayName || user.username, 100) || 'Chaupaal member',
    avatar: cleanMedia(user.photoThumb || user.photoURL) || cleanText(body.avatar, 12),
    profileType:
      String(user.profileType || user.profile?.profileType || 'personal').toLowerCase() === 'professional'
        ? 'professional'
        : 'personal',
    media,
    thumb: cleanMedia(body.thumb),
    mediaType: body.mediaType === 'video' ? 'video' : 'image',
    rotation: [90, 180, 270].includes(Number(body.rotation)) ? Number(body.rotation) : 0,
    text,
    sharedGameId: cleanText(body.sharedGameId, 50),
    music: music || null,
    location: location || null,
    overlays: cleanOverlays(body.overlays),
    interactive: null,
    mentions: cleanMentions(body.mentions),
    durationMs: Math.max(0, Math.min(90 * 1000, Number(body.durationMs) || 0)),
    parentStoryId: cleanText(body.parentStoryId, 180),
    chainId: cleanText(body.chainId, 180),
    restoryOf: cleanRestoryOf(body.restoryOf),
    filter: ['normal', 'bright', 'contrast', 'warm', 'cool', 'mono', 'fade'].includes(String(body.filter || ''))
      ? String(body.filter)
      : 'normal',
    crop: body.crop && typeof body.crop === 'object'
      ? {
          x: Number(body.crop.x) || 0,
          y: Number(body.crop.y) || 0,
          scale: Number(body.crop.scale) || 1,
          rotate: Number(body.crop.rotate) || 0,
        }
      : null,
    trimStartMs: Math.max(0, Number(body.trimStartMs) || 0),
    trimEndMs: Math.max(0, Math.min(90 * 1000, Number(body.trimEndMs) || 0)),
    muted: !!body.muted,
    width: Math.max(0, Number(body.width) || 0),
    height: Math.max(0, Number(body.height) || 0),
    viewCount: 0,
    likeCount: 0,
    addYoursFaces: [],
    addYoursCount: 0,
    chainDepth: 0,
    score: body.type === 'score' ? Math.max(0, Number(body.score) || 0) : null,
    total: body.type === 'score' ? Math.max(0, Number(body.total) || 0) : null,
    streak: body.type === 'score' ? Math.max(0, Number(body.streak) || 0) : null,
    active: saveOnly ? false : true,
    archived: !!saveOnly,
    archivedAt: saveOnly ? now : null,
    saveOnly: !!saveOnly,
    createdAt: now,
    expiresAt: saveOnly ? now : expiresAt,
  };
  story.interactive = cleanInteractive(body.interactive, story.overlays);
  if (story.parentStoryId && destination === 'duniya') {
    const parent = await db.collection('duniya_stories').doc(story.parentStoryId).get();
    if (parent.exists) {
      const depth = Number(parent.data()?.chainDepth) || 0;
      if (depth >= 50) throw new Error('CHAIN_TOO_LONG');
      story.chainDepth = depth + 1;
      story.chainId = story.chainId || parent.data()?.chainId || story.parentStoryId;
    }
  }

  if (saveOnly || destination === 'duniya') {
    await ref.set(story);
    if (saveOnly && highlightId) {
      try {
        const href = db.collection('users').doc(uid).collection('story_highlights').doc(highlightId);
        const hsnap = await href.get();
        if (hsnap.exists) {
          const refs = Array.isArray(hsnap.data().storyRefs) ? [...hsnap.data().storyRefs] : [];
          refs.unshift({
            destination,
            storyId: ref.id,
            thumb: story.thumb || story.media || '',
            addedAt: Date.now(),
          });
          await href.set(
            {
              storyRefs: refs.slice(0, 50),
              coverUrl: story.thumb || story.media || hsnap.data().coverUrl || '',
              updatedAt: now,
            },
            { merge: true }
          );
        }
      } catch (e) {
        console.warn('[stories] highlight add after saveOnly failed', e?.message || e);
      }
    }
    const serialized = serializeStory({ id: ref.id, data: () => story }, uid);
    if (saveOnly) serialized.audienceFallback = 'archive_only';
    else if (audienceFallback) serialized.audienceFallback = audienceFallback;
    await afterStoryCreate(db, admin, uid, ref.id, story);
    return serialized;
  }

  const recipients = await recipientIds(db, uid, visibility);
  // Empty CF + no friends is OK for Instants (author-only / see-and-forget); still persist.
  if (visibility === 'close_friends' && !recipients.length && !isSplitKind(kind)) {
    throw new Error('NO_CLOSE_FRIENDS');
  }
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
        batch.set(db.collection('users').doc(recipientUid).collection('storyInbox').doc('baithak_' + ref.id), {
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
  await afterStoryCreate(db, admin, uid, ref.id, story);
  return serialized;
}

async function afterStoryCreate(db, admin, uid, storyId, story) {
  try {
    const { upsertNotification, resolveActor } = require('../server-lib/notifications');
    const actor = await resolveActor(admin, uid);
    const destination = story.destination;
    const section = destination === 'duniya' ? 'duniya' : 'baithak';
    const deep = { section, storyId, destination };
    if (story.restoryOf?.uid && story.restoryOf.uid !== uid) {
      await upsertNotification(admin, story.restoryOf.uid, {
        type: 'story_restory',
        refId: storyId,
        actor,
        preview: 'restoried your story',
        deepLink: deep,
      });
    }
    const mentioned = Array.isArray(story.mentions) ? story.mentions : [];
    for (const m of mentioned) {
      if (!m.uid || m.uid === uid) continue;
      if (await isBlockedPair(db, uid, m.uid)) continue;
      await upsertNotification(admin, m.uid, {
        type: 'story_mention',
        refId: storyId,
        actor,
        preview: 'mentioned you in a story',
        deepLink: deep,
      });
    }
    if (story.parentStoryId && destination === 'duniya') {
      const parent = await db.collection('duniya_stories').doc(story.parentStoryId).get();
      if (parent.exists) {
        const pdata = parent.data() || {};
        const faces = Array.isArray(pdata.addYoursFaces) ? pdata.addYoursFaces.slice() : [];
        if (!faces.some((f) => f.uid === uid)) {
          faces.unshift({
            uid,
            name: story.name,
            avatar: story.avatar || '',
          });
        }
        await parent.ref.set(
          {
            addYoursFaces: faces.slice(0, 50),
            addYoursCount: (Number(pdata.addYoursCount) || 0) + 1,
          },
          { merge: true }
        );
      }
    }
  } catch (e) {
    console.warn('[stories] after create', e?.message || e);
  }
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
      // Live ring only — expired / save-only / archived stories stay out of the live ring.
      if (data.active === false || data.archived === true || data.saveOnly === true) continue;
      if (expires && expires <= now) continue;
      if (await canView(db, story, uid, false)) result[destination].push(serializeStory(story, uid));
    }
    result[destination].sort((a, b) => a.createdAt - b.createdAt);
  }
  return result;
}

async function listHighlights(db, uid, targetUid) {
  const ownerUid = targetUid || uid;
  const isOwner = ownerUid === uid;
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
        order: Number(d.order) || 0,
        privacy: d.privacy === 'private' ? 'private' : 'public',
        updatedAt: d.updatedAt?.toMillis?.() || 0,
      };
    })
    .filter((h) => isOwner || h.privacy !== 'private')
    .sort((a, b) => (a.order || 0) - (b.order || 0) || b.updatedAt - a.updatedAt);
}

async function createHighlight(db, admin, uid, body) {
  const title = cleanText(body.title, 40) || 'Highlight';
  const ref = db.collection('users').doc(uid).collection('story_highlights').doc();
  const now = admin.firestore.FieldValue.serverTimestamp();
  const orderSnap = await db.collection('users').doc(uid).collection('story_highlights').limit(40).get();
  const maxOrder = orderSnap.docs.reduce((m, d) => Math.max(m, Number(d.data()?.order) || 0), 0);
  await ref.set({
    title,
    coverUrl: cleanText(body.coverUrl, 500) || '',
    storyRefs: [],
    order: maxOrder + 1,
    privacy: body.privacy === 'private' ? 'private' : 'public',
    createdAt: now,
    updatedAt: now,
  });
  return { id: ref.id, title };
}

async function updateHighlight(db, admin, uid, body) {
  const highlightId = cleanText(body.highlightId, 180);
  if (!highlightId) throw new Error('INVALID_HIGHLIGHT');
  const href = db.collection('users').doc(uid).collection('story_highlights').doc(highlightId);
  const snap = await href.get();
  if (!snap.exists) throw new Error('HIGHLIGHT_NOT_FOUND');
  const patch = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
  if (body.title != null) patch.title = cleanText(body.title, 40) || 'Highlight';
  if (body.coverUrl != null) patch.coverUrl = cleanText(body.coverUrl, 500) || '';
  if (body.privacy === 'private' || body.privacy === 'public') patch.privacy = body.privacy;
  if (Number.isFinite(Number(body.order))) patch.order = Number(body.order);
  await href.set(patch, { merge: true });
  return { id: highlightId, ...patch, updatedAt: Date.now() };
}

async function deleteHighlight(db, uid, highlightId) {
  const id = cleanText(highlightId, 180);
  if (!id) throw new Error('INVALID_HIGHLIGHT');
  const href = db.collection('users').doc(uid).collection('story_highlights').doc(id);
  const snap = await href.get();
  if (!snap.exists) throw new Error('HIGHLIGHT_NOT_FOUND');
  await href.delete();
  return { deleted: true, id };
}

async function reorderHighlights(db, admin, uid, body) {
  const ids = Array.isArray(body.ids) ? body.ids.map((x) => cleanText(x, 180)).filter(Boolean) : [];
  if (!ids.length) throw new Error('INVALID_HIGHLIGHT');
  const batch = db.batch();
  const now = admin.firestore.FieldValue.serverTimestamp();
  ids.forEach((id, i) => {
    const href = db.collection('users').doc(uid).collection('story_highlights').doc(id);
    batch.set(href, { order: i + 1, updatedAt: now }, { merge: true });
  });
  await batch.commit();
  return { ok: true, ids };
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
  const ownerUid = story.data()?.uid || null;
  if (type === 'like') {
    const ref = story.ref.collection('likes').doc(uid);
    if (body.enabled === false) {
      await ref.delete();
      await story.ref.set({ likeCount: admin.firestore.FieldValue.increment(-1) }, { merge: true });
    } else {
      await ref.set({ uid, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      await story.ref.set({ likeCount: admin.firestore.FieldValue.increment(1) }, { merge: true });
    }
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
  // Fan-out to story owner (skip self)
  if (ownerUid && ownerUid !== uid && body.enabled !== false) {
    try {
      const { upsertNotification, resolveActor } = require('../server-lib/notifications');
      const actor = await resolveActor(admin, uid);
      const storyId = cleanText(body.storyId, 180);
      if (type === 'like') {
        await upsertNotification(admin, ownerUid, {
          type: 'story_like',
          refId: storyId,
          actor,
          preview: 'liked your story',
          deepLink: { section: destination === 'duniya' ? 'duniya' : 'baithak', storyId, destination },
        });
      } else if (type === 'comment') {
        await upsertNotification(admin, ownerUid, {
          type: 'story_comment',
          refId: storyId,
          actor,
          preview: String(body.text || '').slice(0, 120) || 'commented on your story',
          deepLink: { section: destination === 'duniya' ? 'duniya' : 'baithak', storyId, destination },
        });
      }
    } catch (e) {
      console.warn('[stories] notif interact', e?.message || e);
    }
  }
}

async function interactions(db, uid, destination, storyId) {
  const story = await getStory(db, destination, storyId);
  if (!story || !(await canView(db, story, uid, story?.data()?.uid === uid))) throw new Error('STORY_NOT_FOUND');
  const [likes, comments, responses] = await Promise.all([
    story.ref.collection('likes').limit(500).get(),
    story.ref.collection('comments').orderBy('createdAt', 'asc').limit(500).get(),
    story.ref.collection('responses').limit(400).get(),
  ]);
  const profiles = await profilesMap(db, [
    ...likes.docs.map((doc) => doc.id),
    ...comments.docs.map((doc) => doc.data().uid),
  ]);
  const data = story.data() || {};
  const own = data.uid === uid;
  const mine = responses.docs.find((d) => d.id === uid);
  const voted = mine ? mine.data() : null;
  const tallies = tallyResponses(responses.docs, data.interactive);
  return {
    liked: likes.docs.some((doc) => doc.id === uid),
    likeCount: likes.size,
    comments: comments.docs.map((doc) => {
      const cdata = doc.data();
      return {
        id: doc.id,
        uid: cdata.uid,
        name: profiles[cdata.uid]?.name || 'Chaupaal member',
        avatar: profiles[cdata.uid]?.photoURL || '',
        profileType: profiles[cdata.uid]?.profileType || 'personal',
        text: cdata.text,
        createdAt: cdata.createdAt?.toMillis?.() || 0,
      };
    }),
    interactive: publicInteractive(data.interactive, { voted, own, tallies }),
    addYoursFaces: Array.isArray(data.addYoursFaces) ? data.addYoursFaces.slice(0, 50) : [],
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
          username: data.username || '',
          photoURL: data.photoThumb || data.photoURL || '',
          profileType:
            String(data.profileType || data.profile?.profileType || 'personal').toLowerCase() ===
            'professional'
              ? 'professional'
              : 'personal',
        },
      ];
    })
  );
}

async function recordView(db, admin, uid, destination, storyId) {
  const story = await getStory(db, destination, storyId);
  if (!story || !(await canView(db, story, uid, false))) throw new Error('STORY_NOT_FOUND');
  const ownerUid = story.data()?.uid;
  if (ownerUid === uid) return { viewed: true, self: true };
  const ref = story.ref.collection('views').doc(uid);
  const existing = await ref.get();
  if (existing.exists) return { viewed: true };
  await ref.set({ uid, viewedAt: admin.firestore.FieldValue.serverTimestamp() });
  await story.ref.set({ viewCount: admin.firestore.FieldValue.increment(1) }, { merge: true });
  return { viewed: true };
}

async function listViews(db, uid, destination, storyId, q) {
  const story = await getStory(db, destination, storyId);
  if (!story || story.data()?.uid !== uid) throw new Error('STORY_NOT_FOUND');
  let snap;
  try {
    snap = await story.ref.collection('views').orderBy('viewedAt', 'desc').limit(200).get();
  } catch (e) {
    snap = await story.ref.collection('views').limit(200).get();
  }
  const ids = snap.docs.map((d) => d.id).filter((id) => id !== uid);
  const profiles = await profilesMap(db, ids);
  const needle = String(q || '')
    .trim()
    .toLowerCase();
  const viewers = snap.docs
    .filter((d) => d.id !== uid)
    .map((d) => {
      const p = profiles[d.id] || {};
      return {
        uid: d.id,
        name: p.name || 'Chaupaal member',
        username: p.username || '',
        avatar: p.photoURL || '',
        viewedAt: d.data()?.viewedAt?.toMillis?.() || 0,
      };
    })
    .filter((v) => {
      if (!needle) return true;
      return (
        String(v.name || '')
          .toLowerCase()
          .includes(needle) ||
        String(v.username || '')
          .toLowerCase()
          .includes(needle)
      );
    });
  return { count: viewers.length, viewers };
}

async function getStoryById(db, uid, destination, storyId) {
  const dest = cleanDestination(destination) || 'duniya';
  const story = await getStory(db, dest, storyId);
  if (!story || !(await canView(db, story, uid, story.data()?.uid === uid))) throw new Error('STORY_NOT_FOUND');
  return serializeStory(story, uid);
}

async function interactiveRespond(db, admin, uid, body) {
  const destination = cleanDestination(body.destination);
  const story = await getStory(db, destination, cleanText(body.storyId, 180));
  if (!story || !(await canView(db, story, uid, false))) throw new Error('STORY_NOT_FOUND');
  const type = String(body.type || '');
  const interactive = story.data()?.interactive || {};
  const ref = story.ref.collection('responses').doc(uid);
  const existing = await ref.get();
  const prev = existing.exists ? existing.data() || {} : {};
  const patch = { uid, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
  if (type === 'poll') {
    if (!interactive.poll) throw new Error('INVALID_INTERACTION');
    if (prev.poll != null) {
      /* keep first vote */
    } else {
      const idx = Math.max(0, Math.min((interactive.poll.options || []).length - 1, Number(body.value)));
      if (!Number.isInteger(idx)) throw new Error('INVALID_INTERACTION');
      patch.poll = idx;
    }
  } else if (type === 'quiz') {
    if (!interactive.quiz) throw new Error('INVALID_INTERACTION');
    if (prev.quiz == null) {
      const idx = Math.max(0, Math.min((interactive.quiz.options || []).length - 1, Number(body.value)));
      patch.quiz = idx;
    }
  } else if (type === 'slider') {
    if (!interactive.slider) throw new Error('INVALID_INTERACTION');
    if (prev.slider == null) patch.slider = Math.max(0, Math.min(100, Number(body.value) || 0));
  } else if (type === 'question') {
    if (!interactive.question) throw new Error('INVALID_INTERACTION');
    const text = cleanText(body.value || body.text, 280);
    if (!text) throw new Error('EMPTY_COMMENT');
    patch.question = text;
    patch.questionAt = admin.firestore.FieldValue.serverTimestamp();
    const ownerUid = story.data()?.uid;
    if (ownerUid && ownerUid !== uid) {
      try {
        const { upsertNotification, resolveActor } = require('../server-lib/notifications');
        const actor = await resolveActor(admin, uid);
        await upsertNotification(admin, ownerUid, {
          type: 'story_question',
          refId: story.id,
          actor,
          preview: text.slice(0, 120),
          deepLink: {
            section: destination === 'duniya' ? 'duniya' : 'baithak',
            storyId: story.id,
            destination,
          },
        });
      } catch (e) {
        console.warn('[stories] question notif', e?.message || e);
      }
    }
  } else if (type === 'countdown_remind') {
    patch.countdownRemind = true;
  } else if (type === 'add_yours_open') {
    patch.addYoursOpen = true;
  } else {
    throw new Error('INVALID_INTERACTION');
  }
  await ref.set(patch, { merge: true });
  const all = await story.ref.collection('responses').limit(400).get();
  const mine = (await ref.get()).data() || {};
  const tallies = tallyResponses(all.docs, interactive);
  const own = story.data()?.uid === uid;
  return {
    interactive: publicInteractive(interactive, { voted: mine, own, tallies }),
  };
}

async function listInteractive(db, uid, destination, storyId) {
  const story = await getStory(db, destination, storyId);
  if (!story || story.data()?.uid !== uid) throw new Error('STORY_NOT_FOUND');
  const interactive = story.data()?.interactive || {};
  const snap = await story.ref.collection('responses').limit(400).get();
  const ids = snap.docs.map((d) => d.id);
  const profiles = await profilesMap(db, ids);
  const tallies = tallyResponses(snap.docs, interactive);
  const answers = snap.docs
    .filter((d) => d.data()?.question)
    .map((d) => {
      const p = profiles[d.id] || {};
      return {
        uid: d.id,
        name: p.name || 'Chaupaal member',
        avatar: p.photoURL || '',
        text: d.data().question,
        at: d.data().questionAt?.toMillis?.() || d.data().updatedAt?.toMillis?.() || 0,
      };
    })
    .sort((a, b) => b.at - a.at);
  return {
    tallies,
    answers,
    responseCount: snap.size,
    interactive,
    addYoursFaces: Array.isArray(story.data()?.addYoursFaces) ? story.data().addYoursFaces : [],
  };
}

async function canMessagePeer(db, a, b) {
  if (!a || !b || a === b) return false;
  if (await isBlockedPair(db, a, b)) return false;
  const [ua, ub] = await db.getAll(db.collection('users').doc(a), db.collection('users').doc(b));
  const da = ua.data() || {};
  const dbUser = ub.data() || {};
  const teenA = !!(da.teenMode || da.isMinor);
  const teenB = !!(dbUser.teenMode || dbUser.isMinor);
  if (!teenA && !teenB) return true;
  if (await isFriend(db, a, b)) return true;
  if (teenA && teenB) return true;
  return false;
}

async function sendStoryCard(db, admin, uid, body) {
  const destination = cleanDestination(body.destination) || 'duniya';
  const storyId = cleanText(body.storyId, 180);
  const story = await getStory(db, destination, storyId);
  if (!story || !(await canView(db, story, uid, false))) throw new Error('STORY_NOT_FOUND');
  const data = story.data() || {};
  const peerUids = Array.isArray(body.uids) ? body.uids.map(cleanUid).filter(Boolean) : [];
  const chatIds = Array.isArray(body.chatIds) ? body.chatIds.map((x) => cleanText(x, 180)).filter(Boolean) : [];
  const caption = cleanText(body.text, 280);
  const senderSnap = await db.collection('users').doc(uid).get();
  const sender = senderSnap.data() || {};
  const sent = [];
  const skipped = [];
  const now = admin.firestore.FieldValue.serverTimestamp();
  const attachment = {
    type: 'story',
    storyId,
    destination,
    url: data.thumb || data.media || '',
    thumb: data.thumb || data.media || '',
    name: data.name || 'Story',
    ownerUid: data.uid,
    mediaType: data.mediaType || 'image',
    expiresAt: data.expiresAt?.toMillis?.() || 0,
  };

  async function writeToChat(chatId, peerUid) {
    const chatRef = db.collection('chats').doc(chatId);
    const snap = await chatRef.get();
    if (!snap.exists) {
      await chatRef.set({
        participants: [uid, peerUid].sort(),
        type: 'dm',
        createdAt: now,
        createdBy: uid,
        openedBy: uid,
        lastMessageAt: Date.now(),
        updatedAt: now,
        preview: caption || 'Sent a story',
      });
    } else {
      const parts = snap.data()?.participants || [];
      if (!parts.includes(uid)) throw new Error('FORBIDDEN');
    }
    await chatRef.collection('messages').add({
      text: caption || 'Sent a story',
      uid,
      name: sender.name || sender.displayName || 'You',
      avatar: sender.photoThumb || sender.photoURL || '',
      profileType:
        String(sender.profileType || 'personal').toLowerCase() === 'professional' ? 'professional' : 'personal',
      ts: now,
      attachment,
    });
    await chatRef.set(
      {
        updatedAt: now,
        lastMessageAt: Date.now(),
        preview: caption || 'Sent a story',
      },
      { merge: true }
    );
    sent.push({ chatId, uid: peerUid });
  }

  for (const peer of peerUids.slice(0, 20)) {
    if (!(await canMessagePeer(db, uid, peer))) {
      skipped.push(peer);
      continue;
    }
    const chatId = [uid, peer].sort().join('_');
    try {
      await writeToChat(chatId, peer);
    } catch (e) {
      skipped.push(peer);
    }
  }
  for (const chatId of chatIds.slice(0, 20)) {
    try {
      const snap = await db.collection('chats').doc(chatId).get();
      if (!snap.exists) {
        skipped.push(chatId);
        continue;
      }
      const parts = snap.data()?.participants || [];
      if (!parts.includes(uid)) {
        skipped.push(chatId);
        continue;
      }
      const peer = parts.find((p) => p !== uid) || '';
      if (peer && !(await canMessagePeer(db, uid, peer))) {
        skipped.push(chatId);
        continue;
      }
      await writeToChat(chatId, peer);
    } catch (e) {
      skipped.push(chatId);
    }
  }
  return { sent: sent.length, skipped };
}

async function deleteComment(db, uid, destination, storyId, commentId) {
  const story = await getStory(db, destination, storyId);
  if (!story) throw new Error('STORY_NOT_FOUND');
  const id = cleanText(commentId, 180);
  if (!id) throw new Error('EMPTY_COMMENT');
  const cref = story.ref.collection('comments').doc(id);
  const snap = await cref.get();
  if (!snap.exists) throw new Error('STORY_NOT_FOUND');
  const owner = story.data()?.uid === uid;
  const author = snap.data()?.uid === uid;
  if (!owner && !author) throw new Error('FORBIDDEN');
  await cref.delete();
  return { deleted: true };
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
  if (isDuniyaPostRequest(req, body)) {
    return dispatchDuniyaPost(res, { db, admin, uid: user.uid, body });
  }
  try {
    if (action === 'create') {
      const rate = await checkActionRateLimit(user.uid, 'post');
      if (!rate.ok) return sendError(res, 429, 'RATE_LIMITED', 'Too many stories. Try again shortly.');
    }
    if (action === 'interact') {
      const rate = await checkActionRateLimit(user.uid, body.type === 'comment' ? 'comment' : 'like');
      if (!rate.ok) return sendError(res, 429, 'RATE_LIMITED', 'Too many story interactions. Try again shortly.');
    }
    if (action === 'interactive_respond' || action === 'send_story') {
      const rate = await checkActionRateLimit(user.uid, 'comment');
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
    if (action === 'update_highlight') {
      return sendSuccess(res, await updateHighlight(db, admin, user.uid, body));
    }
    if (action === 'delete_highlight') {
      return sendSuccess(res, await deleteHighlight(db, user.uid, body.highlightId));
    }
    if (action === 'reorder_highlights') {
      return sendSuccess(res, await reorderHighlights(db, admin, user.uid, body));
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
    if (action === 'get') {
      return sendSuccess(res, {
        story: await getStoryById(db, user.uid, body.destination, cleanText(body.storyId, 180)),
      });
    }
    if (action === 'view') {
      return sendSuccess(
        res,
        await recordView(db, admin, user.uid, cleanDestination(body.destination), cleanText(body.storyId, 180))
      );
    }
    if (action === 'list_views') {
      return sendSuccess(
        res,
        await listViews(
          db,
          user.uid,
          cleanDestination(body.destination),
          cleanText(body.storyId, 180),
          body.q
        )
      );
    }
    if (action === 'interactive_respond') {
      return sendSuccess(res, await interactiveRespond(db, admin, user.uid, body));
    }
    if (action === 'list_interactive') {
      return sendSuccess(
        res,
        await listInteractive(db, user.uid, cleanDestination(body.destination), cleanText(body.storyId, 180))
      );
    }
    if (action === 'send_story') {
      return sendSuccess(res, await sendStoryCard(db, admin, user.uid, body));
    }
    if (action === 'delete_comment') {
      return sendSuccess(
        res,
        await deleteComment(
          db,
          user.uid,
          cleanDestination(body.destination),
          cleanText(body.storyId, 180),
          cleanText(body.commentId, 180)
        )
      );
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
      FORBIDDEN: [403, 'FORBIDDEN', 'Not allowed'],
      CHAIN_TOO_LONG: [400, 'VALIDATION_ERROR', 'Add yours chain is full'],
    }[error?.message];
    if (known) return sendError(res, known[0], known[1], known[2]);
    console.error('[stories]', action, error?.message || error);
    return sendError(res, 500, 'STORY_FAILED', 'Could not complete story action');
  }
};
