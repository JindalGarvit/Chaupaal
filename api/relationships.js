/**
 * Canonical relationship API.
 *
 * A follows B:
 *   users/A/following/B
 *   users/B/followers/A
 *
 * Friendship is never stored as an independent status. It is true exactly
 * while both A→B and B→A following edges exist.
 *
 * Denormalized counters live at users/{uid}.relationshipCounts and are
 * maintained only by this Admin-backed write path (client writes blocked in rules).
 *
 * Close Friends (users/{uid}/close_friends/{id}) is a private subset of current
 * Friends — adding requires friendship; unfollow clears CF membership both ways.
 */
const { sendSuccess, sendError, requireMethod, parseJsonBody } = require('../server-lib/http');
const { requireUser, initAdmin } = require('../server-lib/auth');
const { checkActionRateLimit } = require('../server-lib/rate-limit');
const {
  deriveRelationshipState,
  countDeltasForFollowChange,
} = require('../server-lib/social-model');
const { applyFlagSignal, applyBlockSignal } = require('../server-lib/shadowban');
const { logMatchEngagement } = require('../server-lib/intent-weights');

const MAX_TARGETS = 30;
const MAX_LIST = 100;

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

function requestRefs(db, fromUid, toUid) {
  return {
    incoming: db.collection('users').doc(toUid).collection('friendRequests').doc(fromUid),
    sent: db.collection('users').doc(fromUid).collection('sentFriendRequests').doc(toUid),
  };
}

function normalizeCounts(raw) {
  const c = raw || {};
  return {
    friends: Math.max(0, Number(c.friends) || 0),
    followers: Math.max(0, Number(c.followers) || 0),
    following: Math.max(0, Number(c.following) || 0),
  };
}

function applyCountDelta(tx, db, admin, uid, delta) {
  if (!delta || (!delta.friends && !delta.followers && !delta.following)) return;
  const path = db.collection('users').doc(uid);
  const publicPath = db.collection('users_public').doc(uid);
  const patch = {};
  if (delta.friends) patch['relationshipCounts.friends'] = admin.firestore.FieldValue.increment(delta.friends);
  if (delta.followers) patch['relationshipCounts.followers'] = admin.firestore.FieldValue.increment(delta.followers);
  if (delta.following) patch['relationshipCounts.following'] = admin.firestore.FieldValue.increment(delta.following);
  tx.set(path, patch, { merge: true });
  tx.set(publicPath, patch, { merge: true });
}

async function ensureTarget(db, uid) {
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) throw new Error('USER_NOT_FOUND');
  return snap.data() || {};
}

async function isBlockedPair(db, a, b) {
  const [aBlock, bBlock] = await db.getAll(
    db.collection('blocks').doc(a),
    db.collection('blocks').doc(b)
  );
  return (aBlock.data()?.blocked || []).includes(b) || (bBlock.data()?.blocked || []).includes(a);
}

function clearRequestPair(tx, db, a, b) {
  const ab = requestRefs(db, a, b);
  const ba = requestRefs(db, b, a);
  tx.delete(ab.incoming);
  tx.delete(ab.sent);
  tx.delete(ba.incoming);
  tx.delete(ba.sent);
}

function clearCloseFriendsPair(tx, db, a, b) {
  tx.delete(db.collection('users').doc(a).collection('close_friends').doc(b));
  tx.delete(db.collection('users').doc(b).collection('close_friends').doc(a));
}

async function setFollow(db, admin, fromUid, toUid, follow, source) {
  if (fromUid === toUid) throw new Error('SELF_RELATIONSHIP');
  await ensureTarget(db, toUid);
  if (follow && (await isBlockedPair(db, fromUid, toUid))) throw new Error('RELATIONSHIP_BLOCKED');
  const refs = edgeRefs(db, fromUid, toUid);
  const reverse = edgeRefs(db, toUid, fromUid);

  await db.runTransaction(async (tx) => {
    const [mineSnap, theirsSnap] = await Promise.all([tx.get(refs.following), tx.get(reverse.following)]);
    const alreadyFollowing = mineSnap.exists;
    const reverseExists = theirsSnap.exists;
    const deltas = countDeltasForFollowChange({ alreadyFollowing, reverseExists, follow: !!follow });

    if (follow) {
      if (!alreadyFollowing) {
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
      }
      // Mutual follow → Friends: drop any stale pending requests both ways.
      if (reverseExists) clearRequestPair(tx, db, fromUid, toUid);
    } else if (alreadyFollowing) {
      tx.delete(refs.following);
      tx.delete(refs.follower);
      // Close Friends is a private subset of Friends — unfollow breaks CF both ways.
      clearCloseFriendsPair(tx, db, fromUid, toUid);
    }

    applyCountDelta(tx, db, admin, fromUid, deltas.from);
    applyCountDelta(tx, db, admin, toUid, deltas.to);
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

async function scanCounts(db, profileUid) {
  const userRef = db.collection('users').doc(profileUid);
  const [followingSnap, followersSnap] = await Promise.all([
    userRef.collection('following').get(),
    userRef.collection('followers').get(),
  ]);
  const following = new Set(followingSnap.docs.map((doc) => doc.id));
  const followers = new Set(followersSnap.docs.map((doc) => doc.id));
  let friends = 0;
  following.forEach((id) => {
    if (followers.has(id)) friends++;
  });
  return {
    friends,
    followers: followers.size,
    following: following.size,
  };
}

async function profileCounts(db, profileUid) {
  const snap = await db.collection('users').doc(profileUid).get();
  const stored = snap.exists ? snap.data()?.relationshipCounts : null;
  if (
    stored &&
    Number.isFinite(Number(stored.friends)) &&
    Number.isFinite(Number(stored.followers)) &&
    Number.isFinite(Number(stored.following))
  ) {
    return normalizeCounts(stored);
  }
  const scanned = await scanCounts(db, profileUid);
  // Best-effort backfill so subsequent reads are cheap.
  await db
    .collection('users')
    .doc(profileUid)
    .set({ relationshipCounts: scanned }, { merge: true })
    .catch(() => {});
  await db
    .collection('users_public')
    .doc(profileUid)
    .set({ relationshipCounts: scanned }, { merge: true })
    .catch(() => {});
  return scanned;
}

async function recomputeCounts(db, profileUid) {
  const scanned = await scanCounts(db, profileUid);
  await db.collection('users').doc(profileUid).set({ relationshipCounts: scanned }, { merge: true });
  await db
    .collection('users_public')
    .doc(profileUid)
    .set({ relationshipCounts: scanned }, { merge: true })
    .catch(() => {});
  return scanned;
}

/**
 * Friend request. If they already follow you, create your edge immediately
 * (auto-Friends) — no pending request left behind.
 */
async function requestFriend(db, admin, uid, targetUid) {
  if (uid === targetUid) throw new Error('SELF_RELATIONSHIP');
  await ensureTarget(db, targetUid);
  if (await isBlockedPair(db, uid, targetUid)) throw new Error('RELATIONSHIP_BLOCKED');

  const state = await relationshipState(db, uid, targetUid);
  if (state.friend) {
    // Hygiene: clear any leftover request docs.
    const batch = db.batch();
    const refs = requestRefs(db, uid, targetUid);
    const reverse = requestRefs(db, targetUid, uid);
    batch.delete(refs.incoming);
    batch.delete(refs.sent);
    batch.delete(reverse.incoming);
    batch.delete(reverse.sent);
    await batch.commit().catch(() => {});
    return { accepted: true, autoAccepted: false, state: await relationshipState(db, uid, targetUid) };
  }

  // They already follow you → create your edge → Friends immediately.
  if (state.followsYou && !state.following) {
    await setFollow(db, admin, uid, targetUid, true, 'friend_auto_accept');
    const next = await relationshipState(db, uid, targetUid);
    return { accepted: true, autoAccepted: true, state: next };
  }

  if (state.requestSent) {
    return { accepted: false, state: { ...state, requestSent: true } };
  }

  // They already sent you a request → accepting is cleaner than a second pending.
  if (state.requestReceived) {
    const next = await respondFriend(db, admin, uid, targetUid, true);
    return { accepted: true, autoAccepted: true, state: next };
  }

  const refs = requestRefs(db, uid, targetUid);
  const payload = {
    requesterUid: uid,
    targetUid,
    status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  const batch = db.batch();
  batch.set(refs.incoming, payload);
  batch.set(refs.sent, payload);
  await batch.commit();
  return { accepted: false, state: { ...state, requestSent: true } };
}

async function cancelFriendRequest(db, uid, targetUid) {
  if (uid === targetUid) throw new Error('SELF_RELATIONSHIP');
  const refs = requestRefs(db, uid, targetUid);
  const batch = db.batch();
  batch.delete(refs.incoming);
  batch.delete(refs.sent);
  await batch.commit();
  return relationshipState(db, uid, targetUid);
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
      const mine = edgeRefs(db, uid, requesterUid);
      const theirs = edgeRefs(db, requesterUid, uid);
      const [mineSnap, theirsSnap] = await Promise.all([tx.get(mine.following), tx.get(theirs.following)]);
      const now = admin.firestore.FieldValue.serverTimestamp();

      // Ensure uid → requester
      if (!mineSnap.exists) {
        const d = countDeltasForFollowChange({
          alreadyFollowing: false,
          reverseExists: theirsSnap.exists,
          follow: true,
        });
        tx.set(mine.following, { uid: requesterUid, source: 'friend_accept', createdAt: now }, { merge: true });
        tx.set(mine.follower, { uid, source: 'friend_accept', createdAt: now }, { merge: true });
        applyCountDelta(tx, db, admin, uid, d.from);
        applyCountDelta(tx, db, admin, requesterUid, d.to);
      }

      // Ensure requester → uid (reverse now exists after the block above, or already did)
      if (!theirsSnap.exists) {
        const d = countDeltasForFollowChange({
          alreadyFollowing: false,
          reverseExists: true,
          follow: true,
        });
        tx.set(theirs.following, { uid, source: 'friend_accept', createdAt: now }, { merge: true });
        tx.set(theirs.follower, { uid: requesterUid, source: 'friend_accept', createdAt: now }, { merge: true });
        applyCountDelta(tx, db, admin, requesterUid, d.from);
        applyCountDelta(tx, db, admin, uid, d.to);
      }
    }

    tx.delete(incoming);
    tx.delete(sent);
    clearRequestPair(tx, db, uid, requesterUid);
  });

  return relationshipState(db, uid, requesterUid);
}

/** Remove someone who follows you (delete their A→you edge). */
async function removeFollower(db, admin, uid, followerUid) {
  if (uid === followerUid) throw new Error('SELF_RELATIONSHIP');
  // Equivalent to follower unfollowing you.
  await setFollow(db, admin, followerUid, uid, false, 'remove_follower');
  return relationshipState(db, uid, followerUid);
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

function mapProfile(snap) {
  const data = snap.data() || {};
  return {
    uid: snap.id,
    name: data.name || data.displayName || data.username || 'Chaupaal member',
    username: data.username || '',
    photoURL: data.photoThumb || data.photoURL || '',
    city: data.city || data.profile?.currentCity || '',
    profileType:
      String(data.profileType || data.profile?.profileType || 'personal').toLowerCase() === 'professional'
        ? 'professional'
        : 'personal',
  };
}

async function profilesForIds(db, ids) {
  const clean = [...new Set(ids.map(cleanUid).filter(Boolean))].slice(0, MAX_LIST);
  if (!clean.length) return [];
  const snaps = [];
  for (let start = 0; start < clean.length; start += 100) {
    snaps.push(...(await db.getAll(...clean.slice(start, start + 100).map((uid) => db.collection('users').doc(uid)))));
  }
  return snaps.filter((snap) => snap.exists).map(mapProfile);
}

async function listCloseFriends(db, uid) {
  const snap = await db.collection('users').doc(uid).collection('close_friends').limit(MAX_LIST).get();
  return profilesForIds(
    db,
    snap.docs.map((doc) => doc.id)
  );
}

async function listFriendRequests(db, uid) {
  const snap = await db.collection('users').doc(uid).collection('friendRequests').limit(MAX_LIST).get();
  return profilesForIds(
    db,
    snap.docs.map((doc) => doc.id)
  );
}

async function listFriends(db, uid) {
  const userRef = db.collection('users').doc(uid);
  const [following, followers] = await Promise.all([
    userRef.collection('following').limit(500).get(),
    userRef.collection('followers').limit(500).get(),
  ]);
  const inbound = new Set(followers.docs.map((doc) => doc.id));
  return profilesForIds(
    db,
    following.docs.map((doc) => doc.id).filter((id) => inbound.has(id))
  );
}

async function listFollowers(db, uid) {
  const snap = await db.collection('users').doc(uid).collection('followers').limit(MAX_LIST).get();
  return profilesForIds(
    db,
    snap.docs.map((doc) => doc.id)
  );
}

async function listFollowing(db, uid) {
  const snap = await db.collection('users').doc(uid).collection('following').limit(MAX_LIST).get();
  return profilesForIds(
    db,
    snap.docs.map((doc) => doc.id)
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
  const candidates = snap.docs.filter((doc) => doc.id !== uid).map(mapProfile);
  const states = await hydrate(
    db,
    uid,
    candidates.map((profile) => profile.uid)
  );
  // Close Friends manager only offers current Friends (CF is a Friends subset).
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
    if (
      [
        'follow',
        'unfollow',
        'request_friend',
        'respond_friend',
        'cancel_friend_request',
        'remove_follower',
        'set_close_friend',
      ].includes(action)
    ) {
      const rate = await checkActionRateLimit(user.uid, 'follow');
      if (!rate.ok) return sendError(res, 429, 'RATE_LIMITED', 'Too many relationship changes. Try again shortly.');
    }
    if (action === 'hydrate') {
      return sendSuccess(res, { states: await hydrate(db, user.uid, body.targetUids) });
    }
    if (action === 'profile') {
      const profileUid = targetUid || user.uid;
      const userSnap = await db.collection('users').doc(profileUid).get();
      if (!userSnap.exists) throw new Error('USER_NOT_FOUND');
      const profile = mapProfile(userSnap);
      const [counts, state] = await Promise.all([
        profileCounts(db, profileUid),
        profileUid === user.uid ? null : relationshipState(db, user.uid, profileUid),
      ]);
      return sendSuccess(res, { counts, state, profile });
    }
    if (action === 'recompute_counts') {
      return sendSuccess(res, { counts: await recomputeCounts(db, user.uid) });
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
    if (action === 'cancel_friend_request') {
      if (!targetUid) return sendError(res, 400, 'VALIDATION_ERROR', 'targetUid required');
      return sendSuccess(res, { state: await cancelFriendRequest(db, user.uid, targetUid) });
    }
    if (action === 'respond_friend') {
      if (!targetUid || typeof body.accept !== 'boolean') {
        return sendError(res, 400, 'VALIDATION_ERROR', 'requester targetUid and accept required');
      }
      return sendSuccess(res, {
        state: await respondFriend(db, admin, user.uid, targetUid, body.accept),
      });
    }
    if (action === 'remove_follower') {
      if (!targetUid) return sendError(res, 400, 'VALIDATION_ERROR', 'targetUid required');
      return sendSuccess(res, { state: await removeFollower(db, admin, user.uid, targetUid) });
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
      const profileUid = targetUid || user.uid;
      return sendSuccess(res, { profiles: await listFriends(db, profileUid) });
    }
    if (action === 'list_followers') {
      const profileUid = targetUid || user.uid;
      return sendSuccess(res, { profiles: await listFollowers(db, profileUid) });
    }
    if (action === 'list_following') {
      const profileUid = targetUid || user.uid;
      return sendSuccess(res, { profiles: await listFollowing(db, profileUid) });
    }
    if (action === 'search_users') {
      return sendSuccess(res, { profiles: await searchUsers(db, user.uid, body.query) });
    }
    if (action === 'flag_user') {
      if (!targetUid) return sendError(res, 400, 'VALIDATION_ERROR', 'targetUid required');
      const reasonCode = String(body.reasonCode || 'custom').slice(0, 40);
      const reasonLabel = String(body.reason || body.reasonLabel || reasonCode).slice(0, 120);
      await db.collection('user_flags').add({
        reportedUid: targetUid,
        reporterUid: user.uid,
        reason: reasonLabel,
        reasonCode,
        customText: body.customText ? String(body.customText).slice(0, 500) : null,
        targetType: String(body.targetType || 'user').slice(0, 40),
        postId: body.postId ? String(body.postId).slice(0, 80) : null,
        chatId: body.chatId ? String(body.chatId).slice(0, 80) : null,
        ts: Date.now(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      const ban = await applyFlagSignal(db, admin, {
        reportedUid: targetUid,
        reporterUid: user.uid,
        reasonCode,
        chatId: body.chatId,
      });
      return sendSuccess(res, { flagged: true, shadowban: ban });
    }
    if (action === 'block_signal') {
      if (!targetUid) return sendError(res, 400, 'VALIDATION_ERROR', 'targetUid required');
      const ban = await applyBlockSignal(db, admin, {
        blockedUid: targetUid,
        blockerUid: user.uid,
      });
      return sendSuccess(res, { shadowban: ban });
    }
    if (action === 'chat_rating') {
      if (!targetUid) return sendError(res, 400, 'VALIDATION_ERROR', 'targetUid required');
      const score = Math.max(1, Math.min(10, Number(body.score) || 0));
      if (!score) return sendError(res, 400, 'VALIDATION_ERROR', 'score 1–10 required');
      const chatId = body.chatId ? String(body.chatId).slice(0, 80) : null;
      const ratingRef = db.collection('chatRatings').doc();
      await ratingRef.set({
        raterUid: user.uid,
        peerUid: targetUid,
        chatId,
        score,
        discoveryOrigin: body.discoveryOrigin ? String(body.discoveryOrigin).slice(0, 40) : null,
        intentProfileId: body.intentProfileId ? String(body.intentProfileId).slice(0, 80) : null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      // Consistently low → reduce future surfacing; high → modest accepted signal
      const intentProfileId = body.intentProfileId ? String(body.intentProfileId).slice(0, 80) : null;
      if (intentProfileId && body.signalScores) {
        const outcome = score <= 4 ? 'rated_low' : score >= 8 ? 'rated_high' : null;
        if (outcome) {
          await logMatchEngagement(db, admin, {
            uid: user.uid,
            intentProfileId,
            candidateUid: targetUid,
            signalScores: body.signalScores || {},
            outcome,
            intentText: body.intentText || '',
          });
        }
      }
      // Very low scores also nudge shadowban soft path
      if (score <= 2) {
        await applyFlagSignal(db, admin, {
          reportedUid: targetUid,
          reporterUid: user.uid,
          reasonCode: 'low_chat_rating',
          chatId,
        });
      }
      return sendSuccess(res, { rated: true, score, id: ratingRef.id });
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
