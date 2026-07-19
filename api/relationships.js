/**
 * Canonical relationship API.
 *
 * A follows B:
 *   users/A/following/B
 *   users/B/followers/A
 *
 * Friendship is never stored as an independent status. It is true exactly
 * while both A→B and B→A following edges exist.
 */
const { sendSuccess, sendError, requireMethod, parseJsonBody } = require('../server-lib/http');
const { requireUser, initAdmin } = require('../server-lib/auth');
const { checkActionRateLimit } = require('../server-lib/rate-limit');
const { deriveRelationshipState } = require('../server-lib/social-model');

const MAX_TARGETS = 30;

function cleanUid(value) {
  const uid = String(value || '').trim();
  return /^[A-Za-z0-9_-]{1,180}$/.test(uid) ? uid : '';
}

function edgeRefs(db, fromUid, toUid) {
  return {
    following: db.collection('users').doc(fromUid).collection('following').doc(toUid),
    follower: db.collection('users').doc(toUid).collection('followers').doc(fromUid),
  };
}

async function ensureTarget(db, uid) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) {
    const error = new Error('USER_NOT_FOUND');
    throw error;
  }
  return snap.data() || {};
}

async function isBlockedPair(db, a, b) {
  const [aBlock, bBlock] = await db.getAll(
    db.collection('blocks').doc(a),
    db.collection('blocks').doc(b)
  );
  return (aBlock.data()?.blocked || []).includes(b) || (bBlock.data()?.blocked || []).includes(a);
}

async function setFollow(db, admin, fromUid, toUid, follow, source) {
  if (fromUid === toUid) throw new Error('SELF_RELATIONSHIP');
  await ensureTarget(db, toUid);
  if (follow && (await isBlockedPair(db, fromUid, toUid))) throw new Error('RELATIONSHIP_BLOCKED');
  const refs = edgeRefs(db, fromUid, toUid);
  await db.runTransaction(async (tx) => {
    if (follow) {
      const data = {
        uid: toUid,
        source: String(source || 'follow').slice(0, 40),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      tx.set(refs.following, data, { merge: true });
      tx.set(
        refs.follower,
        {
          uid: fromUid,
          source: data.source,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      tx.delete(refs.following);
      tx.delete(refs.follower);
      // Close Friends is a private subset of current Friends. Breaking either
      // follow direction invalidates both possible Close Friends memberships.
      tx.delete(db.collection('users').doc(fromUid).collection('close_friends').doc(toUid));
      tx.delete(db.collection('users').doc(toUid).collection('close_friends').doc(fromUid));
    }
  });
}

async function relationshipState(db, uid, targetUid) {
  const mine = edgeRefs(db, uid, targetUid).following;
  const theirs = edgeRefs(db, targetUid, uid).following;
  const sent = db.collection('users').doc(uid).collection('sentFriendRequests').doc(targetUid);
  const received = db.collection('users').doc(uid).collection('friendRequests').doc(targetUid);
  const close = db.collection('users').doc(uid).collection('close_friends').doc(targetUid);
  const [mineSnap, theirsSnap, sentSnap, receivedSnap, closeSnap] = await db.getAll(
    mine,
    theirs,
    sent,
    received,
    close
  );
  return {
    ...deriveRelationshipState({ following: mineSnap.exists, followsYou: theirsSnap.exists }),
    requestSent: sentSnap.exists,
    requestReceived: receivedSnap.exists,
    closeFriend: closeSnap.exists,
  };
}

async function hydrate(db, uid, rawTargets) {
  const targets = [...new Set((rawTargets || []).map(cleanUid).filter((id) => id && id !== uid))].slice(
    0,
    MAX_TARGETS
  );
  const states = {};
  await Promise.all(
    targets.map(async (targetUid) => {
      states[targetUid] = await relationshipState(db, uid, targetUid);
    })
  );
  return states;
}

async function profileCounts(db, profileUid) {
  const userRef = db.collection('users').doc(profileUid);
  const [followingSnap, followersSnap] = await Promise.all([
    userRef.collection('following').get(),
    userRef.collection('followers').get(),
  ]);
  const following = new Set(followingSnap.docs.map((doc) => doc.id));
  const followers = new Set(followersSnap.docs.map((doc) => doc.id));
  let friends = 0;
  following.forEach((uid) => {
    if (followers.has(uid)) friends++;
  });
  return {
    friends,
    followers: followers.size,
    following: following.size,
  };
}

async function requestFriend(db, admin, uid, targetUid) {
  if (uid === targetUid) throw new Error('SELF_RELATIONSHIP');
  await ensureTarget(db, targetUid);
  if (await isBlockedPair(db, uid, targetUid)) throw new Error('RELATIONSHIP_BLOCKED');
  const state = await relationshipState(db, uid, targetUid);
  if (state.friend) return { accepted: true, state };
  const incoming = db.collection('users').doc(targetUid).collection('friendRequests').doc(uid);
  const sent = db.collection('users').doc(uid).collection('sentFriendRequests').doc(targetUid);
  const payload = {
    requesterUid: uid,
    targetUid,
    status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  const batch = db.batch();
  batch.set(incoming, payload);
  batch.set(sent, payload);
  await batch.commit();
  return { accepted: false, state: { ...state, requestSent: true } };
}

async function respondFriend(db, admin, uid, requesterUid, accept) {
  if (uid === requesterUid) throw new Error('SELF_RELATIONSHIP');
  if (accept && (await isBlockedPair(db, uid, requesterUid))) throw new Error('RELATIONSHIP_BLOCKED');
  const incoming = db.collection('users').doc(uid).collection('friendRequests').doc(requesterUid);
  const sent = db.collection('users').doc(requesterUid).collection('sentFriendRequests').doc(uid);
  await db.runTransaction(async (tx) => {
    const requestSnap = await tx.get(incoming);
    if (!requestSnap.exists) throw new Error('REQUEST_NOT_FOUND');
    if (accept) {
      const first = edgeRefs(db, uid, requesterUid);
      const second = edgeRefs(db, requesterUid, uid);
      const now = admin.firestore.FieldValue.serverTimestamp();
      tx.set(first.following, { uid: requesterUid, source: 'friend_accept', createdAt: now }, { merge: true });
      tx.set(first.follower, { uid, source: 'friend_accept', createdAt: now }, { merge: true });
      tx.set(second.following, { uid, source: 'friend_accept', createdAt: now }, { merge: true });
      tx.set(second.follower, { uid: requesterUid, source: 'friend_accept', createdAt: now }, { merge: true });
    }
    tx.delete(incoming);
    tx.delete(sent);
  });
  return relationshipState(db, uid, requesterUid);
}

async function setCloseFriend(db, admin, uid, targetUid, enabled) {
  if (uid === targetUid) throw new Error('SELF_RELATIONSHIP');
  await ensureTarget(db, targetUid);
  if (enabled) {
    if (await isBlockedPair(db, uid, targetUid)) throw new Error('RELATIONSHIP_BLOCKED');
    const state = await relationshipState(db, uid, targetUid);
    if (!state.friend) throw new Error('FRIEND_REQUIRED');
  }
  const ref = db.collection('users').doc(uid).collection('close_friends').doc(targetUid);
  if (enabled) {
    await ref.set({
      uid: targetUid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } else {
    await ref.delete();
  }
  return enabled;
}

async function profilesForIds(db, ids) {
  const clean = [...new Set(ids.map(cleanUid).filter(Boolean))];
  if (!clean.length) return [];
  const snaps = [];
  for (let start = 0; start < clean.length; start += 100) {
    snaps.push(...(await db.getAll(...clean.slice(start, start + 100).map((uid) => db.collection('users').doc(uid)))));
  }
  return snaps
    .filter((snap) => snap.exists)
    .map((snap) => {
      const data = snap.data() || {};
      return {
        uid: snap.id,
        name: data.name || data.displayName || data.username || 'Chaupaal member',
        username: data.username || '',
        photoURL: data.photoThumb || data.photoURL || '',
        city: data.city || data.profile?.currentCity || '',
      };
    });
}

async function listCloseFriends(db, uid) {
  const snap = await db.collection('users').doc(uid).collection('close_friends').get();
  return profilesForIds(
    db,
    snap.docs.map((doc) => doc.id)
  );
}

async function listFriendRequests(db, uid) {
  const snap = await db.collection('users').doc(uid).collection('friendRequests').get();
  return profilesForIds(
    db,
    snap.docs.map((doc) => doc.id)
  );
}

async function listFriends(db, uid) {
  const userRef = db.collection('users').doc(uid);
  const [following, followers] = await Promise.all([
    userRef.collection('following').get(),
    userRef.collection('followers').get(),
  ]);
  const inbound = new Set(followers.docs.map((doc) => doc.id));
  return profilesForIds(
    db,
    following.docs.map((doc) => doc.id).filter((id) => inbound.has(id))
  );
}

async function searchUsers(db, uid, query) {
  const q = String(query || '').trim().toLowerCase().replace(/^@/, '').slice(0, 50);
  if (!q) return [];
  const snap = await db
    .collection('users')
    .orderBy('username')
    .startAt(q)
    .endAt(q + '\uf8ff')
    .limit(20)
    .get();
  const candidates = snap.docs
    .filter((doc) => doc.id !== uid)
    .map((doc) => {
      const data = doc.data() || {};
      return {
        uid: doc.id,
        name: data.name || data.displayName || data.username || 'Chaupaal member',
        username: data.username || '',
        photoURL: data.photoThumb || data.photoURL || '',
        city: data.city || data.profile?.currentCity || '',
      };
    });
  const states = await hydrate(
    db,
    uid,
    candidates.map((profile) => profile.uid)
  );
  return candidates.filter((profile) => states[profile.uid]?.friend);
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
  const targetUid = cleanUid(body.targetUid);
  try {
    if (['follow', 'unfollow', 'request_friend', 'respond_friend', 'set_close_friend'].includes(action)) {
      const rate = await checkActionRateLimit(user.uid, 'follow');
      if (!rate.ok) return sendError(res, 429, 'RATE_LIMITED', 'Too many relationship changes. Try again shortly.');
    }
    if (action === 'hydrate') {
      return sendSuccess(res, { states: await hydrate(db, user.uid, body.targetUids) });
    }
    if (action === 'profile') {
      const profileUid = targetUid || user.uid;
      const [counts, state] = await Promise.all([
        profileCounts(db, profileUid),
        profileUid === user.uid ? null : relationshipState(db, user.uid, profileUid),
      ]);
      return sendSuccess(res, { counts, state });
    }
    if (action === 'follow' || action === 'unfollow') {
      if (!targetUid) return sendError(res, 400, 'VALIDATION_ERROR', 'targetUid required');
      await setFollow(db, admin, user.uid, targetUid, action === 'follow', body.source);
      return sendSuccess(res, { state: await relationshipState(db, user.uid, targetUid) });
    }
    if (action === 'request_friend') {
      if (!targetUid) return sendError(res, 400, 'VALIDATION_ERROR', 'targetUid required');
      return sendSuccess(res, await requestFriend(db, admin, user.uid, targetUid));
    }
    if (action === 'respond_friend') {
      if (!targetUid || typeof body.accept !== 'boolean') {
        return sendError(res, 400, 'VALIDATION_ERROR', 'requester targetUid and accept required');
      }
      return sendSuccess(res, {
        state: await respondFriend(db, admin, user.uid, targetUid, body.accept),
      });
    }
    if (action === 'set_close_friend') {
      if (!targetUid || typeof body.enabled !== 'boolean') {
        return sendError(res, 400, 'VALIDATION_ERROR', 'targetUid and enabled required');
      }
      return sendSuccess(res, {
        closeFriend: await setCloseFriend(db, admin, user.uid, targetUid, body.enabled),
      });
    }
    if (action === 'list_close_friends') {
      return sendSuccess(res, { profiles: await listCloseFriends(db, user.uid) });
    }
    if (action === 'list_friend_requests') {
      return sendSuccess(res, { profiles: await listFriendRequests(db, user.uid) });
    }
    if (action === 'list_friends') {
      return sendSuccess(res, { profiles: await listFriends(db, user.uid) });
    }
    if (action === 'search_users') {
      return sendSuccess(res, { profiles: await searchUsers(db, user.uid, body.query) });
    }
    return sendError(res, 400, 'VALIDATION_ERROR', 'Unknown relationship action');
  } catch (error) {
    const known = {
      USER_NOT_FOUND: [404, 'NOT_FOUND', 'User not found'],
      REQUEST_NOT_FOUND: [404, 'NOT_FOUND', 'Friend request not found'],
      SELF_RELATIONSHIP: [400, 'VALIDATION_ERROR', 'You cannot use this action on yourself'],
      FRIEND_REQUIRED: [403, 'FRIEND_REQUIRED', 'Only Friends can be added to Close Friends'],
      RELATIONSHIP_BLOCKED: [403, 'RELATIONSHIP_BLOCKED', 'This relationship action is unavailable'],
    }[error?.message];
    if (known) return sendError(res, known[0], known[1], known[2]);
    console.error('[relationships]', action, error?.message || error);
    return sendError(res, 500, 'RELATIONSHIP_FAILED', 'Could not update relationship');
  }
};
