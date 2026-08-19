/**
 * Duniya feed posts — create, edit, collab, send-to-friends.
 * Collection stays `duniya`. Side-effects (mentions, tags, collab, first comment)
 * run here so they are not a trust-the-client fanout.
 */
const { sendSuccess, sendError, requireMethod, parseJsonBody } = require('./http');
const { requireUser, initAdmin } = require('./auth');
const { checkActionRateLimit } = require('./rate-limit');
const { upsertNotification, resolveActor } = require('./notifications');
const {
  cleanText,
  cleanUid,
  cleanClientId,
  cleanMusic,
  cleanLocation,
  cleanSlides,
  cleanTags,
  cleanUidList,
  cleanHashtags,
  mentionedFromCaption,
  validateCreate,
  serializePost,
} = require('./duniya-post-payload');

const COLLECTION = 'duniya';
const MAX_COLLAB_INVITES = 3;

function isDuniyaPostRequest(req, body) {
  const hint = [
    req?.url,
    req?.originalUrl,
    req?.headers?.['x-invoke-path'],
    req?.headers?.['x-matched-path'],
    req?.headers?.['x-forwarded-uri'],
    req?.headers?.['x-vercel-original-path'],
    req?.headers?.['x-rewrite-url'],
  ]
    .map((v) => String(v || '').toLowerCase())
    .join(' ');
  if (hint.includes('duniya-posts')) return true;
  const action = String(body?.action || '');
  if (action === 'collab' || action === 'send_post') return true;
  if (action === 'update' && body?.postId) return true;
  if (action === 'get' && body?.postId && !body?.storyId && !body?.destination) return true;
  if (
    action === 'create' &&
    !body?.destination &&
    (Array.isArray(body?.slides) || 'caption' in (body || {}) || body?.saveOnly)
  ) {
    return true;
  }
  return false;
}

function err(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
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
  if (!a || !b || a === b) return false;
  const [aBlock, bBlock] = await db.getAll(db.collection('blocks').doc(a), db.collection('blocks').doc(b));
  const aList = aBlock.data()?.uids || aBlock.data()?.blocked || [];
  const bList = bBlock.data()?.uids || bBlock.data()?.blocked || [];
  return (Array.isArray(aList) && aList.includes(b)) || (Array.isArray(bList) && bList.includes(a));
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

async function loadUser(db, uid) {
  if (!uid) return null;
  const [priv, pub] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('users_public').doc(uid).get(),
  ]);
  const data = { ...(priv.data() || {}), ...(pub.data() || {}), uid };
  return data;
}

async function isShadowbanned(db, uid) {
  const snap = await db.collection('shadowbans').doc(uid).get();
  return snap.exists && snap.data()?.tier === 'severe';
}

async function resolveMentionUids(db, caption, mentionedUids) {
  const out = new Set(cleanUidList(mentionedUids, 20));
  const handles = mentionedFromCaption(caption);
  for (const handle of handles) {
    try {
      const snap = await db.collection('usernames').doc(handle).get();
      const uid = cleanUid(snap.data()?.uid);
      if (uid) out.add(uid);
    } catch (e) {}
  }
  return [...out].slice(0, 20);
}

async function notifyMany(admin, actor, recipients, { type, refId, preview, extra }) {
  const unique = [...new Set((recipients || []).filter((uid) => uid && uid !== actor.uid))];
  for (const uid of unique) {
    try {
      await upsertNotification(admin, uid, {
        type,
        refId,
        actor,
        preview,
        deepLink: { section: 'duniya', path: `/post/${refId}`, postId: refId, ...(extra || {}) },
      });
    } catch (e) {}
  }
}

function canEditPost(data, uid) {
  if (!data || !uid) return false;
  if (data.uid === uid) return true;
  const collab = Array.isArray(data.collabUids) ? data.collabUids : [];
  return collab.includes(uid);
}

async function getPost(db, postId, collection = COLLECTION) {
  const id = cleanText(postId, 180);
  if (!id) throw err('NOT_FOUND', 'Post not found');
  const col = collection === 'peepal' ? 'peepal' : COLLECTION;
  const snap = await db.collection(col).doc(id).get();
  if (!snap.exists) throw err('NOT_FOUND', 'Post not found');
  return snap;
}

async function createPost(db, admin, uid, body) {
  if (await isShadowbanned(db, uid)) throw err('SHADOWBANNED', 'You cannot post right now');
  const caption = cleanText(body.caption, 4000);
  const slides = cleanSlides(body.slides);
  const saveOnly = !!body.saveOnly;
  const check = validateCreate({ caption, slides, saveOnly });
  if (!check.ok) throw err('INVALID', check.error);

  const clientId = cleanClientId(body.clientId);
  const postId = clientId ? `dp_${uid.slice(0, 16)}_${clientId}`.slice(0, 180) : db.collection(COLLECTION).doc().id;
  const ref = db.collection(COLLECTION).doc(postId);
  const existing = await ref.get();
  if (existing.exists) {
    if (existing.data()?.uid !== uid) throw err('CONFLICT', 'Post already exists');
    return serializePost(existing, uid);
  }

  const me = await loadUser(db, uid);
  const actor = (await resolveActor(admin, uid)) || {
    uid,
    name: me?.name || me?.displayName || 'Someone',
    avatar: me?.avatar || '👤',
    photoURL: me?.photoURL || me?.photoThumb || '',
  };
  const profileType =
    String(me?.profileType || 'personal').toLowerCase() === 'professional' ? 'professional' : 'personal';

  let taggedPeople = cleanTags(body.taggedPeople).filter((t) => t.uid !== uid);
  taggedPeople = (
    await Promise.all(
      taggedPeople.map(async (t) => ((await isBlockedPair(db, uid, t.uid)) ? null : t))
    )
  ).filter(Boolean);

  let mentionedUids = await resolveMentionUids(db, caption, body.mentionedUids);
  mentionedUids = (
    await Promise.all(mentionedUids.map(async (id) => ((await isBlockedPair(db, uid, id)) ? null : id)))
  ).filter(Boolean);

  const inviteRaw = cleanUidList(body.collabInvites, MAX_COLLAB_INVITES).filter((id) => id !== uid);
  const collabPendingUids = [];
  for (const inviteUid of inviteRaw) {
    if (await isBlockedPair(db, uid, inviteUid)) continue;
    if (!(await canMessagePeer(db, uid, inviteUid))) continue;
    collabPendingUids.push(inviteUid);
    if (collabPendingUids.length >= MAX_COLLAB_INVITES) break;
  }
  const collabInvites = collabPendingUids.map((id) => ({ uid: id, status: 'pending' }));

  const music = cleanMusic(body.music);
  const location = cleanLocation(body.location);
  const hashtags = cleanHashtags(body.hashtags, caption);
  const firstComment = cleanText(body.firstComment, 2000);
  const hideLikeCount = !!body.hideLikeCount;
  const commentsOff = !!body.commentsOff;
  const first = slides[0] || null;
  const now = admin.firestore.FieldValue.serverTimestamp();
  const ts = Date.now();

  const doc = {
    uid,
    user: {
      uid,
      name: me?.name || me?.displayName || 'You',
      avatar: me?.avatar || '🪑',
      photoURL: me?.photoURL || me?.photoThumb || null,
      username: me?.username || '',
      profileType,
    },
    type: first?.type || (slides.length ? first.type : 'text'),
    media: first?.media || null,
    thumb: first?.thumb || first?.media || null,
    mediaPath: first?.mediaPath || null,
    thumbPath: first?.thumbPath || null,
    mediaWidth: first?.width || null,
    mediaHeight: first?.height || null,
    slides,
    caption,
    likes: 0,
    comments: 0,
    shares: 0,
    tags: taggedPeople.map((t) => t.username).filter(Boolean),
    taggedPeople,
    mentionedUids,
    hashtags,
    music,
    location,
    hideLikeCount,
    commentsOff,
    audience: saveOnly ? 'private' : 'public',
    archived: !!saveOnly,
    archivedAt: saveOnly ? now : null,
    saveOnly: !!saveOnly,
    collabUids: [],
    collabInvites,
    collabPendingUids,
    firstCommentId: '',
    coverSlideIndex: Math.max(0, Math.min(slides.length ? slides.length - 1 : 0, Number(body.coverSlideIndex) || 0)),
    clientId: clientId || null,
    deleted: false,
    createdAt: now,
    ts,
  };

  await ref.set(doc);

  if (firstComment) {
    const commentRef = ref.collection('comments').doc();
    await commentRef.set({
      uid,
      user: { uid, name: doc.user.name, avatar: doc.user.avatar, photoURL: doc.user.photoURL },
      text: firstComment,
      parentId: null,
      createdAt: now,
      editedAt: null,
    });
    await ref.update({
      comments: 1,
      firstCommentId: commentRef.id,
      commentMutationId: commentRef.id,
    });
    doc.comments = 1;
    doc.firstCommentId = commentRef.id;
  }

  const tagUids = taggedPeople.map((t) => t.uid);
  await notifyMany(admin, actor, mentionedUids, {
    type: 'mention',
    refId: postId,
    preview: caption.slice(0, 120) || 'mentioned you',
  });
  await notifyMany(admin, actor, tagUids, {
    type: 'tag',
    refId: postId,
    preview: 'tagged you in a photo',
  });
  await notifyMany(admin, actor, collabPendingUids, {
    type: 'collab_invite',
    refId: postId,
    preview: 'invited you to collaborate',
    extra: { collab: 'invite' },
  });

  const snap = await ref.get();
  return serializePost(snap, uid);
}

async function updatePost(db, admin, uid, body) {
  const snap = await getPost(db, body.postId);
  const data = snap.data() || {};
  if (!canEditPost(data, uid)) throw err('FORBIDDEN', 'You cannot edit this post');
  if (data.deleted) throw err('GONE', 'Post was deleted');

  const patch = {};
  if ('caption' in body) {
    const caption = cleanText(body.caption, 4000);
    const slides = Array.isArray(data.slides) ? data.slides : [];
    if (!slides.length && !caption && !(data.media || '').length) {
      throw err('INVALID', 'Caption is required for a text post.');
    }
    patch.caption = caption;
    patch.hashtags = cleanHashtags(body.hashtags, caption);
    patch.mentionedUids = await resolveMentionUids(db, caption, body.mentionedUids || data.mentionedUids);
  }
  if ('taggedPeople' in body) {
    patch.taggedPeople = cleanTags(body.taggedPeople);
    patch.tags = patch.taggedPeople.map((t) => t.username).filter(Boolean);
  }
  if ('location' in body) patch.location = body.location === null ? null : cleanLocation(body.location);
  if ('music' in body) patch.music = body.music === null ? null : cleanMusic(body.music);
  if ('hideLikeCount' in body) patch.hideLikeCount = !!body.hideLikeCount;
  if ('commentsOff' in body) patch.commentsOff = !!body.commentsOff;
  if ('archived' in body || 'saveOnly' in body) {
    const archived = body.archived != null ? !!body.archived : !!body.saveOnly;
    patch.archived = archived;
    patch.saveOnly = archived;
    patch.audience = archived ? 'private' : 'public';
    patch.archivedAt = archived ? admin.firestore.FieldValue.serverTimestamp() : null;
  }
  if (Array.isArray(body.alts) && Array.isArray(data.slides)) {
    const alts = body.alts.map((a) => cleanText(a, 200));
    patch.slides = data.slides.map((s, i) => ({ ...s, alt: alts[i] != null ? alts[i] : s.alt || '' }));
  }
  if ('coverSlideIndex' in body && Array.isArray(data.slides) && data.slides.length) {
    patch.coverSlideIndex = Math.max(0, Math.min(data.slides.length - 1, Number(body.coverSlideIndex) || 0));
  }

  if (!Object.keys(patch).length) throw err('INVALID', 'Nothing to update');
  await snap.ref.update(patch);
  const next = await snap.ref.get();
  return serializePost(next, uid);
}

async function collabAction(db, admin, uid, body) {
  const action = String(body.collabAction || body.type || '');
  const snap = await getPost(db, body.postId);
  const data = snap.data() || {};
  if (data.deleted) throw err('GONE', 'Post was deleted');
  const ownerUid = data.uid;
  const pending = Array.isArray(data.collabPendingUids) ? data.collabPendingUids.slice() : [];
  const accepted = Array.isArray(data.collabUids) ? data.collabUids.slice() : [];
  let invites = Array.isArray(data.collabInvites) ? data.collabInvites.slice() : [];
  const actor = await resolveActor(admin, uid);

  if (action === 'invite') {
    if (ownerUid !== uid) throw err('FORBIDDEN', 'Only the owner can invite');
    const target = cleanUid(body.targetUid || (body.collabInvites || [])[0]);
    if (!target || target === uid) throw err('INVALID', 'Pick someone to invite');
    if (accepted.includes(target) || pending.includes(target)) throw err('INVALID', 'Already invited');
    if (pending.length + accepted.length >= MAX_COLLAB_INVITES) throw err('INVALID', 'Up to 3 collaborators');
    if (await isBlockedPair(db, uid, target)) throw err('FORBIDDEN', 'Cannot invite this person');
    if (!(await canMessagePeer(db, uid, target))) throw err('FORBIDDEN', 'Cannot invite this person');
    pending.push(target);
    invites.push({ uid: target, status: 'pending' });
    await snap.ref.update({ collabPendingUids: pending, collabInvites: invites });
    await notifyMany(admin, actor, [target], {
      type: 'collab_invite',
      refId: snap.id,
      preview: 'invited you to collaborate',
      extra: { collab: 'invite' },
    });
    return serializePost(await snap.ref.get(), uid);
  }

  if (action === 'revoke') {
    if (ownerUid !== uid) throw err('FORBIDDEN', 'Only the owner can revoke');
    const target = cleanUid(body.targetUid);
    await snap.ref.update({
      collabPendingUids: pending.filter((id) => id !== target),
      collabInvites: invites.filter((i) => i.uid !== target),
    });
    return serializePost(await snap.ref.get(), uid);
  }

  if (action === 'accept') {
    if (!pending.includes(uid)) throw err('FORBIDDEN', 'No invite to accept');
    const nextAccepted = accepted.includes(uid) ? accepted : accepted.concat(uid);
    const collabUsers = Array.isArray(data.collabUsers) ? data.collabUsers.slice() : [];
    const invitee = await loadUser(db, uid);
    if (!collabUsers.some((u) => u.uid === uid)) {
      collabUsers.push({
        uid,
        name: invitee?.name || invitee?.displayName || actor?.name || 'Collaborator',
        username: invitee?.username || '',
        photoURL: invitee?.photoURL || invitee?.photoThumb || '',
      });
    }
    await snap.ref.update({
      collabUids: nextAccepted,
      collabPendingUids: pending.filter((id) => id !== uid),
      collabInvites: invites.filter((i) => i.uid !== uid),
      collabUsers,
    });
    await notifyMany(admin, actor, [ownerUid], {
      type: 'collab_accept',
      refId: snap.id,
      preview: 'accepted your collab invite',
    });
    return serializePost(await snap.ref.get(), uid);
  }

  if (action === 'decline') {
    if (!pending.includes(uid)) throw err('FORBIDDEN', 'No invite to decline');
    await snap.ref.update({
      collabPendingUids: pending.filter((id) => id !== uid),
      collabInvites: invites.filter((i) => i.uid !== uid),
    });
    return serializePost(await snap.ref.get(), uid);
  }

  if (action === 'leave') {
    if (!accepted.includes(uid)) throw err('FORBIDDEN', 'You are not a collaborator');
    await snap.ref.update({
      collabUids: accepted.filter((id) => id !== uid),
      collabUsers: Array.isArray(data.collabUsers) ? data.collabUsers.filter((u) => u.uid !== uid) : [],
    });
    return serializePost(await snap.ref.get(), uid);
  }

  throw err('INVALID', 'Unknown collab action');
}

async function sendPostCard(db, admin, uid, body) {
  const collection = body.collection === 'peepal' ? 'peepal' : COLLECTION;
  const snap = await getPost(db, body.postId, collection);
  const data = snap.data() || {};
  if (data.deleted || data.archived) throw err('NOT_FOUND', 'Post not found');
  const peerUids = cleanUidList(body.uids || body.peerUids, 20);
  const sender = await loadUser(db, uid);
  const now = admin.firestore.FieldValue.serverTimestamp();
  const caption = cleanText(body.text, 280);
  const attachment =
    collection === 'peepal'
      ? {
          type: 'peepal_post',
          postId: snap.id,
          thumb: data.attachment?.thumb || data.attachment?.data || '',
          caption: String(data.question || '').slice(0, 140),
          author: data.user?.name || data.user?.username || 'Peepal',
          authorUid: data.uid,
        }
      : (() => {
          const first = Array.isArray(data.slides) && data.slides[0] ? data.slides[0] : null;
          return {
            type: 'duniya_post',
            postId: snap.id,
            thumb: first?.thumb || data.thumb || data.media || '',
            caption: String(data.caption || '').slice(0, 140),
            author: data.user?.name || data.user?.username || 'Duniya',
            authorUid: data.uid,
          };
        })();
  const sent = [];
  const skipped = [];

  for (const peer of peerUids) {
    if (!(await canMessagePeer(db, uid, peer))) {
      skipped.push(peer);
      continue;
    }
    const pair = [uid, peer].sort();
    const chatId = pair.join('_');
    const chatRef = db.collection('chats').doc(chatId);
    const chatSnap = await chatRef.get();
    if (!chatSnap.exists) {
      await chatRef.set({
        participants: pair,
        type: 'dm',
        createdAt: now,
        createdBy: uid,
        openedBy: uid,
        lastMessageAt: Date.now(),
        updatedAt: now,
        preview: caption || 'Sent a post',
      });
    }
    await chatRef.collection('messages').add({
      text: caption || 'Sent a post',
      uid,
      name: sender?.name || sender?.displayName || 'You',
      avatar: sender?.photoThumb || sender?.photoURL || '',
      profileType:
        String(sender?.profileType || 'personal').toLowerCase() === 'professional' ? 'professional' : 'personal',
      ts: now,
      attachment,
    });
    await chatRef.set(
      {
        updatedAt: now,
        lastMessageAt: Date.now(),
        preview: caption || 'Sent a post',
      },
      { merge: true }
    );
    sent.push({ chatId, uid: peer });
  }

  try {
    await snap.ref.update({
      shares: admin.firestore.FieldValue.increment(sent.length),
      shareMutationUid: uid,
    });
  } catch (e) {}

  return { sent, skipped };
}

async function dispatchDuniyaPost(res, { db, admin, uid, body }) {
  const action = String(body.action || '');
  try {
    if (action === 'create') {
      const rate = await checkActionRateLimit(uid, 'post');
      if (!rate.ok) return sendError(res, 429, 'RATE_LIMITED', 'Too many posts. Try again shortly.');
      return sendSuccess(res, { post: await createPost(db, admin, uid, body) });
    }
    if (action === 'update') {
      return sendSuccess(res, { post: await updatePost(db, admin, uid, body) });
    }
    if (action === 'collab') {
      return sendSuccess(res, { post: await collabAction(db, admin, uid, body) });
    }
    if (action === 'send_post') {
      const rate = await checkActionRateLimit(uid, 'message');
      if (!rate.ok) return sendError(res, 429, 'RATE_LIMITED', 'Slow down a little.');
      return sendSuccess(res, await sendPostCard(db, admin, uid, body));
    }
    if (action === 'get') {
      const snap = await getPost(db, body.postId);
      return sendSuccess(res, { post: serializePost(snap, uid) });
    }
    return sendError(res, 400, 'INVALID_ACTION', 'Unknown action');
  } catch (e) {
    const code = e.code || 'ERROR';
    const status =
      code === 'NOT_FOUND' || code === 'GONE'
        ? 404
        : code === 'FORBIDDEN' || code === 'SHADOWBANNED'
          ? 403
          : code === 'INVALID' || code === 'CONFLICT'
            ? 400
            : 500;
    return sendError(res, status, code, e.message || 'Request failed');
  }
}

async function handler(req, res) {
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
  return dispatchDuniyaPost(res, { db: admin.firestore(), admin, uid: user.uid, body });
}

handler.isDuniyaPostRequest = isDuniyaPostRequest;
handler.dispatchDuniyaPost = dispatchDuniyaPost;
module.exports = handler;
module.exports.isDuniyaPostRequest = isDuniyaPostRequest;
module.exports.dispatchDuniyaPost = dispatchDuniyaPost;
