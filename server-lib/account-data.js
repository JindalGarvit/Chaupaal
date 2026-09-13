/**
 * Account data export + deletion request (P3).
 * Folded into api/media-config — no new Hobby function.
 *
 * Export: bounded JSON of the caller's own data only.
 * Delete: records a deletion request on the user doc; client revokes sessions / signs out.
 * Full cascade (Auth delete, Storage purge) is a documented follow-up job.
 */
'use strict';

const EXPORT_LIMITS = {
  journal: 200,
  saved: 100,
  likes: 100,
  comment_activity: 100,
  duniya: 80,
  peepal: 80,
  stories: 40,
};

function toPlain(val) {
  if (val == null) return val;
  if (typeof val.toDate === 'function') {
    try {
      return val.toDate().toISOString();
    } catch (e) {
      return null;
    }
  }
  if (Array.isArray(val)) return val.map(toPlain);
  if (typeof val === 'object') {
    const out = {};
    Object.keys(val).forEach((k) => {
      // Strip nested blobs / huge media
      if (k === 'media' || k === 'slides' || k === 'attachment' || k === 'photoBase64') {
        out[k] = '[omitted]';
        return;
      }
      out[k] = toPlain(val[k]);
    });
    return out;
  }
  return val;
}

async function collectSub(db, uid, name, orderField, limit) {
  const col = db.collection('users').doc(uid).collection(name);
  let snap;
  try {
    snap = await col.orderBy(orderField, 'desc').limit(limit).get();
  } catch (e) {
    snap = await col.limit(limit).get();
  }
  return snap.docs.map((d) => ({ id: d.id, ...toPlain(d.data() || {}) }));
}

async function collectOwned(db, collection, uid, limit) {
  let snap;
  try {
    snap = await db.collection(collection).where('uid', '==', uid).limit(limit).get();
  } catch (e) {
    return [];
  }
  return snap.docs.map((d) => {
    const data = d.data() || {};
    return {
      id: d.id,
      caption: data.caption || null,
      question: data.question || null,
      tag: data.tag || null,
      archived: !!data.archived,
      deleted: !!data.deleted,
      createdAt: toPlain(data.createdAt) || data.ts || null,
      likes: Number(data.likes) || 0,
      comments: Number(data.comments) || 0,
    };
  });
}

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} uid
 */
async function buildAccountExport(db, uid) {
  const userSnap = await db.collection('users').doc(uid).get();
  const user = userSnap.exists ? userSnap.data() || {} : {};
  const profile = user.profile && typeof user.profile === 'object' ? user.profile : {};

  const safeProfile = {
    displayName: profile.displayName || user.name || null,
    username: user.username || profile.username || null,
    bio: profile.bio || null,
    profileType: profile.profileType || user.profileType || null,
    currentCity: profile.currentCity || null,
    occupation: profile.occupation || null,
    interests: profile.interests || null,
    hobbies: profile.hobbies || null,
    industry: profile.industry || user.industry || null,
    purpose: profile.purpose || user.purpose || null,
    profileVisibility: profile.profileVisibility || user.profileVisibility || null,
  };

  const [
    journal,
    saved,
    likes,
    commentActivity,
    duniya,
    peepal,
  ] = await Promise.all([
    collectSub(db, uid, 'journal', 'createdAt', EXPORT_LIMITS.journal),
    collectSub(db, uid, 'saved', 'savedAt', EXPORT_LIMITS.saved),
    collectSub(db, uid, 'likes', 'likedAt', EXPORT_LIMITS.likes),
    collectSub(db, uid, 'comment_activity', 'commentedAt', EXPORT_LIMITS.comment_activity),
    collectOwned(db, 'duniya', uid, EXPORT_LIMITS.duniya),
    collectOwned(db, 'peepal', uid, EXPORT_LIMITS.peepal),
  ]);

  const relationshipCounts = user.relationshipCounts || {
    friends: Number(user.friendsCount) || 0,
    followers: Number(user.followersCount) || 0,
    following: Number(user.followingCount) || 0,
  };

  const gameStats = {
    streak: Number(user.streak) || 0,
    postsCount: Number(user.postsCount) || 0,
    duniyaCount: Number(user.duniyaCount) || 0,
    peepalCount: Number(user.peepalCount) || 0,
    gamesPlayed: Number(user.gamesPlayed || user.dangalGamesPlayed) || 0,
  };

  return {
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    notice:
      'Your Chaupaal data export. Contains only your own content and activity mirrors. Other people’s private posts/chats are not included. Caps apply per section.',
    uid,
    profile: safeProfile,
    relationshipCounts,
    gameStats,
    journal,
    saved,
    likes,
    comments: commentActivity,
    posts: { duniya, peepal },
  };
}

/**
 * Record deletion request. Does not wipe data here — cascade is a follow-up.
 * @param {FirebaseFirestore.Firestore} db
 * @param {import('firebase-admin').auth.Auth} auth
 * @param {string} uid
 */
async function requestAccountDeletion(db, auth, uid) {
  const now = new Date().toISOString();
  await db
    .collection('users')
    .doc(uid)
    .set(
      {
        deletionRequestedAt: now,
        deletionStatus: 'requested',
        deletionRequestedMs: Date.now(),
      },
      { merge: true }
    );
  // Soft-mark public card so strangers see limited identity while cascade runs
  try {
    await db
      .collection('users_public')
      .doc(uid)
      .set({ deletionRequested: true, updatedAt: now }, { merge: true });
  } catch (e) {}

  // P5: remove derived user model immediately (behavioral + declared affinity)
  try {
    const { deleteUserModel } = require('./user-model');
    await deleteUserModel(db, uid);
  } catch (e) {
    console.warn('[account-data] userModel delete', e?.message || e);
  }

  let tokensRevoked = false;
  try {
    if (auth && typeof auth.revokeRefreshTokens === 'function') {
      await auth.revokeRefreshTokens(uid);
      tokensRevoked = true;
    }
  } catch (e) {
    console.warn('[account-data] revoke failed', e?.message || e);
  }

  return {
    status: 'requested',
    tokensRevoked,
    message:
      'Deletion requested. You will be signed out. We remove account access now; full data purge (posts, media, auth identity) completes within about 30 days. Contact in-app feedback if you need to cancel soon after requesting.',
  };
}

module.exports = {
  buildAccountExport,
  requestAccountDeletion,
  EXPORT_LIMITS,
};
