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
 * Split exclusion list (private): every current Friend receives Splits unless
 * users/{uid}/cf_excluded/{id} exists. Unfollow/block clears exclusions both
 * ways so a later re-friend starts included again.
 */
const {
  excludedIds,
  excludedRef,
  legacyCloseFriendRef,
  purgeLegacyCloseFriendsAllowlist,
  syncSplitInboxForFriend,
  maybeFanoutSplitsOnFriendship,
} = require('../server-lib/close-friends');
const { sendSuccess, sendError, requireMethod, parseJsonBody } = require('../server-lib/http');
const { requireUser, initAdmin } = require('../server-lib/auth');
const { checkActionRateLimit } = require('../server-lib/rate-limit');
const {
  deriveRelationshipState,
  countDeltasForFollowChange,
  countDeltasForMutualFollow,
} = require('../server-lib/social-model');
const { applyFlagSignal, applyBlockSignal, maybeDecayShadowban } = require('../server-lib/shadowban');
const { logMatchEngagement } = require('../server-lib/intent-weights');
const { resolveActiveProfileName, resolveDisplayNameFromData } = require('../server-lib/profile-display');

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

function blockedUids(raw) {
  if (Array.isArray(raw)) return raw.map(String);
  if (raw && typeof raw === 'object') {
    return Object.keys(raw).filter((k) => raw[k]);
  }
  return [];
}

async function isBlockedPair(db, a, b) {
  try {
    const [aBlock, bBlock] = await db.getAll(
      db.collection('blocks').doc(a),
      db.collection('blocks').doc(b)
    );
    return blockedUids(aBlock.data()?.blocked).includes(b) || blockedUids(bBlock.data()?.blocked).includes(a);
  } catch (e) {
    console.warn('[relationships] isBlockedPair', e?.message || e);
    return false;
  }
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
  tx.delete(legacyCloseFriendRef(db, a, b));
  tx.delete(legacyCloseFriendRef(db, b, a));
  tx.delete(excludedRef(db, a, b));
  tx.delete(excludedRef(db, b, a));
}

function writeFollowEdge(tx, db, admin, fromUid, toUid, source, friendOrigin) {
  const refs = edgeRefs(db, fromUid, toUid);
  const now = admin.firestore.FieldValue.serverTimestamp();
  const src = String(source || 'follow').slice(0, 40);
  const edge = { uid: toUid, source: src, createdAt: now };
  const followerEdge = { uid: fromUid, source: src, createdAt: now };
  if (friendOrigin) {
    edge.friendOrigin = friendOrigin;
    followerEdge.friendOrigin = friendOrigin;
  }
  tx.set(refs.following, edge, { merge: true });
  tx.set(refs.follower, followerEdge, { merge: true });
}

function inferFriendOrigin(mineSnap, theirsSnap, sentSnap, receivedSnap) {
  if (!mineSnap?.exists || !theirsSnap?.exists) return null;
  const stored = mineSnap.data()?.friendOrigin || theirsSnap.data()?.friendOrigin;
  if (stored) return stored;
  const mySource = mineSnap.data()?.source || '';
  const theirSource = theirsSnap.data()?.source || '';
  if (mySource === 'friend_accept' || theirSource === 'friend_accept') return 'friend_request';
  if (mySource === 'friend_auto_accept' || theirSource === 'friend_auto_accept') return 'friend_auto_accept';
  if (sentSnap?.exists || receivedSnap?.exists) return 'friend_request';
  return 'mutual_follow';
}

async function setFollow(db, admin, fromUid, toUid, follow, source) {
  if (fromUid === toUid) throw new Error('SELF_RELATIONSHIP');
  await ensureTarget(db, toUid);
  if (follow && (await isBlockedPair(db, fromUid, toUid))) throw new Error('RELATIONSHIP_BLOCKED');
  const refs = edgeRefs(db, fromUid, toUid);
  const reverse = edgeRefs(db, toUid, fromUid);
  const incomingFromTarget = requestRefs(db, toUid, fromUid).incoming;

  await db.runTransaction(async (tx) => {
    const [mineSnap, theirsSnap, incomingSnap] = await Promise.all([
      tx.get(refs.following),
      tx.get(reverse.following),
      tx.get(incomingFromTarget),
    ]);
    const alreadyFollowing = mineSnap.exists;
    const reverseExists = theirsSnap.exists;

    if (follow) {
      // They already asked to be Friends — following them completes both edges.
      const completeMutual = incomingSnap.exists && !(alreadyFollowing && reverseExists);
      if (completeMutual) {
        const deltas = countDeltasForMutualFollow({
          aFollowsB: alreadyFollowing,
          bFollowsA: reverseExists,
        });
        if (!alreadyFollowing) writeFollowEdge(tx, db, admin, fromUid, toUid, source || 'follow', 'friend_request');
        if (!reverseExists) writeFollowEdge(tx, db, admin, toUid, fromUid, 'friend_accept', 'friend_request');
        clearRequestPair(tx, db, fromUid, toUid);
        applyCountDelta(tx, db, admin, fromUid, deltas.a);
        applyCountDelta(tx, db, admin, toUid, deltas.b);
        return;
      }

      const deltas = countDeltasForFollowChange({ alreadyFollowing, reverseExists, follow: true });
      const origin =
        String(source || '') === 'friend_auto_accept'
          ? 'friend_auto_accept'
          : !alreadyFollowing && reverseExists
            ? 'mutual_follow'
            : undefined;
      if (!alreadyFollowing) writeFollowEdge(tx, db, admin, fromUid, toUid, source || 'follow', origin);
      if (reverseExists) clearRequestPair(tx, db, fromUid, toUid);
      applyCountDelta(tx, db, admin, fromUid, deltas.from);
      applyCountDelta(tx, db, admin, toUid, deltas.to);
      return;
    }

    const deltas = countDeltasForFollowChange({ alreadyFollowing, reverseExists, follow: false });
    if (alreadyFollowing) {
      tx.delete(refs.following);
      tx.delete(refs.follower);
      clearCloseFriendsPair(tx, db, fromUid, toUid);
    }
    applyCountDelta(tx, db, admin, fromUid, deltas.from);
    applyCountDelta(tx, db, admin, toUid, deltas.to);
  });

  if (follow) {
    const [mineSnap, theirsSnap] = await db.getAll(refs.following, reverse.following);
    if (mineSnap.exists && theirsSnap.exists) {
      await maybeFanoutSplitsOnFriendship(db, admin, fromUid, toUid);
    }
  }
}

async function mutationResult(db, uid, targetUid) {
  let state = { following: false, followsYou: false, friend: false, requestSent: false, requestReceived: false, splitExcluded: false };
  try {
    state = await relationshipState(db, uid, targetUid);
  } catch (e) {
    console.warn('[relationships] state', e?.message || e);
  }
  let counts = null;
  let targetCounts = null;
  try {
    counts = await recomputeCounts(db, uid);
  } catch (e) {
    console.warn('[relationships] recompute mine', e?.message || e);
    try {
      counts = await profileCounts(db, uid);
    } catch (e2) {}
  }
  try {
    targetCounts = await recomputeCounts(db, targetUid);
  } catch (e) {
    console.warn('[relationships] recompute target', e?.message || e);
  }
  return { state, counts, targetCounts };
}

async function relationshipState(db, uid, targetUid) {
  const mine = edgeRefs(db, uid, targetUid).following;
  const theirs = edgeRefs(db, targetUid, uid).following;
  const sent = db.collection('users').doc(uid).collection('sentFriendRequests').doc(targetUid);
  const received = db.collection('users').doc(uid).collection('friendRequests').doc(targetUid);
  const excluded = excludedRef(db, uid, targetUid);
  const [mineSnap, theirsSnap, sentSnap, receivedSnap, excludedSnap] = await db.getAll(
    mine,
    theirs,
    sent,
    received,
    excluded
  );
  const derived = deriveRelationshipState({ following: mineSnap.exists, followsYou: theirsSnap.exists });
  const friendOrigin = derived.friend
    ? inferFriendOrigin(mineSnap, theirsSnap, sentSnap, receivedSnap)
    : null;
  return {
    ...derived,
    requestSent: sentSnap.exists,
    requestReceived: receivedSnap.exists,
    splitExcluded: derived.friend && excludedSnap.exists,
    friendOrigin,
    theirFollowSource: theirsSnap.exists ? theirsSnap.data()?.source || null : null,
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
  let nextState = { ...state, requestSent: true };
  try {
    nextState = { ...(await relationshipState(db, uid, targetUid)), requestSent: true };
  } catch (e) {
    console.warn('[relationships] requestFriend state', e?.message || e);
  }
  return { accepted: false, state: nextState };
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
      const deltas = countDeltasForMutualFollow({
        aFollowsB: mineSnap.exists,
        bFollowsA: theirsSnap.exists,
      });
      if (!mineSnap.exists) writeFollowEdge(tx, db, admin, uid, requesterUid, 'friend_accept', 'friend_request');
      if (!theirsSnap.exists) writeFollowEdge(tx, db, admin, requesterUid, uid, 'friend_accept', 'friend_request');
      applyCountDelta(tx, db, admin, uid, deltas.a);
      applyCountDelta(tx, db, admin, requesterUid, deltas.b);
    }

    tx.delete(incoming);
    tx.delete(sent);
    clearRequestPair(tx, db, uid, requesterUid);
  });

  if (accept) {
    await maybeFanoutSplitsOnFriendship(db, admin, uid, requesterUid);
  }

  return relationshipState(db, uid, requesterUid);
}

/** Remove someone who follows you (delete their A→you edge). */
async function removeFollower(db, admin, uid, followerUid) {
  if (uid === followerUid) throw new Error('SELF_RELATIONSHIP');
  // Equivalent to follower unfollowing you.
  await setFollow(db, admin, followerUid, uid, false, 'remove_follower');
  return relationshipState(db, uid, followerUid);
}

/** @returns {boolean} splitExcluded — true when target is on the owner's exclusion list */
async function setSplitExclusion(db, admin, uid, targetUid, excluded) {
  if (uid === targetUid) throw new Error('SELF_RELATIONSHIP');
  await ensureTarget(db, targetUid);
  await purgeLegacyCloseFriendsAllowlist(db, uid);
  const state = await relationshipState(db, uid, targetUid);
  if (!state.friend) throw new Error('FRIEND_REQUIRED');
  if (await isBlockedPair(db, uid, targetUid)) throw new Error('RELATIONSHIP_BLOCKED');
  const ref = excludedRef(db, uid, targetUid);
  if (!excluded) {
    await ref.delete();
    await syncSplitInboxForFriend(db, admin, uid, targetUid, { include: true });
    return false;
  }
  await ref.set({
    uid: targetUid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await syncSplitInboxForFriend(db, admin, uid, targetUid, { include: false });
  return true;
}

async function listExclusion(db, uid) {
  await purgeLegacyCloseFriendsAllowlist(db, uid);
  const excluded = await excludedIds(db, uid);
  const profiles = await profilesForIds(db, [...excluded]);
  return { excluded: profiles };
}

async function mapProfileResolved(db, snap) {
  const data = snap.data() || {};
  const resolvedName = resolveDisplayNameFromData(data, await resolveActiveProfileName(db, snap.id, data));
  return {
    uid: snap.id,
    name: resolvedName,
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
  return Promise.all(snaps.filter((snap) => snap.exists).map((snap) => mapProfileResolved(db, snap)));
}

async function listCloseFriends(db, uid) {
  await purgeLegacyCloseFriendsAllowlist(db, uid);
  const friends = await listFriends(db, uid);
  const excluded = await excludedIds(db, uid);
  const profiles = friends.map((profile) => ({
    ...profile,
    closeFriend: !excluded.has(profile.uid),
  }));
  return {
    profiles,
    excluded: profiles.filter((profile) => !profile.closeFriend),
  };
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
  const candidates = await Promise.all(
    snap.docs.filter((doc) => doc.id !== uid).map((doc) => mapProfileResolved(db, doc))
  );
  const states = await hydrate(
    db,
    uid,
    candidates.map((profile) => profile.uid)
  );
  // Exclusion list manager search only offers current Friends.
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
        'set_exclusion',
      ].includes(action)
    ) {
      const rate = await checkActionRateLimit(user.uid, 'follow');
      if (!rate.ok) return sendError(res, 429, 'RATE_LIMITED', 'Too many relationship changes. Try again shortly.');
    }
    if (action === 'hydrate') {
      await maybeDecayShadowban(db, admin, user.uid).catch(() => {});
      const targets = Array.isArray(body.targetUids) ? body.targetUids : [];
      await Promise.all(
        targets
          .map((id) => cleanUid(id))
          .filter((id) => id && id !== user.uid)
          .slice(0, 12)
          .map((id) => maybeDecayShadowban(db, admin, id).catch(() => {}))
      );
      return sendSuccess(res, { states: await hydrate(db, user.uid, body.targetUids) });
    }
    if (action === 'profile') {
      const profileUid = targetUid || user.uid;
      const userSnap = await db.collection('users').doc(profileUid).get();
      if (!userSnap.exists) throw new Error('USER_NOT_FOUND');
      const profile = await mapProfileResolved(db, userSnap);
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
      if (action === 'follow') {
        try {
          const { upsertNotification, resolveActor } = require('../server-lib/notifications');
          const actor = await resolveActor(admin, user.uid);
          const state = await relationshipState(db, user.uid, targetUid);
          await upsertNotification(admin, targetUid, {
            type: state.friend ? 'friend_accept' : 'follow',
            refId: user.uid,
            actor,
            preview: state.friend ? 'you are now Friends' : 'started following you',
            deepLink: { uid: user.uid },
          });
        } catch (e) {
          console.warn('[relationships] notif follow', e?.message || e);
        }
      }
      return sendSuccess(res, await mutationResult(db, user.uid, targetUid));
    }
    if (action === 'request_friend') {
      if (!targetUid) return sendError(res, 400, 'VALIDATION_ERROR', 'targetUid required');
      const out = await requestFriend(db, admin, user.uid, targetUid);
      if (!out.accepted && out.state?.requestSent) {
        console.log('[relationships] request_friend ok', {
          from: user.uid,
          to: targetUid,
          wroteIncoming: true,
        });
        try {
          const { upsertNotification, resolveActor } = require('../server-lib/notifications');
          const actor = await resolveActor(admin, user.uid);
          await upsertNotification(admin, targetUid, {
            type: 'friend_request',
            refId: user.uid,
            actor,
            preview: 'sent you a friend request',
            deepLink: { uid: user.uid },
          });
        } catch (e) {
          console.warn('[relationships] notif friend_request', e?.message || e);
        }
      }
      try {
        const pair = await mutationResult(db, user.uid, targetUid);
        return sendSuccess(res, { ...out, ...pair, state: pair.state || out.state });
      } catch (e) {
        console.warn('[relationships] request_friend post-write', e?.message || e);
        return sendSuccess(res, out);
      }
    }
    if (action === 'cancel_friend_request') {
      if (!targetUid) return sendError(res, 400, 'VALIDATION_ERROR', 'targetUid required');
      await cancelFriendRequest(db, user.uid, targetUid);
      return sendSuccess(res, await mutationResult(db, user.uid, targetUid));
    }
    if (action === 'respond_friend') {
      if (!targetUid || typeof body.accept !== 'boolean') {
        return sendError(res, 400, 'VALIDATION_ERROR', 'requester targetUid and accept required');
      }
      await respondFriend(db, admin, user.uid, targetUid, body.accept);
      if (body.accept) {
        try {
          const { upsertNotification, resolveActor, markNotificationRead, makeBundleId } = require('../server-lib/notifications');
          const actor = await resolveActor(admin, user.uid);
          await upsertNotification(admin, targetUid, {
            type: 'friend_accept',
            refId: user.uid,
            actor,
            preview: 'accepted your friend request',
            deepLink: { uid: user.uid },
          });
          // Soft-clear the request bundle on accepter's inbox
          await markNotificationRead(admin, user.uid, makeBundleId('friend_request', targetUid));
        } catch (e) {
          console.warn('[relationships] notif friend_accept', e?.message || e);
        }
      } else {
        try {
          const { markNotificationRead, makeBundleId } = require('../server-lib/notifications');
          await markNotificationRead(admin, user.uid, makeBundleId('friend_request', targetUid));
        } catch (e) {}
      }
      return sendSuccess(res, await mutationResult(db, user.uid, targetUid));
    }
    if (action === 'remove_follower') {
      if (!targetUid) return sendError(res, 400, 'VALIDATION_ERROR', 'targetUid required');
      await removeFollower(db, admin, user.uid, targetUid);
      return sendSuccess(res, await mutationResult(db, user.uid, targetUid));
    }
    if (action === 'set_exclusion') {
      if (!targetUid || typeof body.excluded !== 'boolean') {
        return sendError(res, 400, 'VALIDATION_ERROR', 'targetUid and excluded required');
      }
      return sendSuccess(res, {
        splitExcluded: await setSplitExclusion(db, admin, user.uid, targetUid, body.excluded),
      });
    }
    if (action === 'list_exclusion') {
      return sendSuccess(res, await listExclusion(db, user.uid));
    }
    if (action === 'set_close_friend') {
      if (!targetUid || typeof body.enabled !== 'boolean') {
        return sendError(res, 400, 'VALIDATION_ERROR', 'targetUid and enabled required');
      }
      const splitExcluded = await setSplitExclusion(db, admin, user.uid, targetUid, !body.enabled);
      return sendSuccess(res, { splitExcluded, closeFriend: !splitExcluded });
    }
    if (action === 'list_close_friends') {
      return sendSuccess(res, await listCloseFriends(db, user.uid));
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
      const flagRef = await db.collection('user_flags').add({
        reportedUid: targetUid,
        reporterUid: user.uid,
        reason: reasonLabel,
        reasonCode,
        customText: body.customText ? String(body.customText).slice(0, 500) : null,
        targetType: String(body.targetType || 'user').slice(0, 40),
        postId: body.postId ? String(body.postId).slice(0, 80) : null,
        chatId: body.chatId ? String(body.chatId).slice(0, 80) : null,
        status: 'active',
        ts: Date.now(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      // Private reporter mirror so Settings → Reported can list without reading admin-only user_flags
      await db
        .collection('users')
        .doc(user.uid)
        .collection('reported')
        .doc(targetUid)
        .set(
          {
            targetUid,
            name: body.targetName ? String(body.targetName).slice(0, 80) : null,
            username: body.targetUsername ? String(body.targetUsername).slice(0, 80) : null,
            reasonCode,
            reason: reasonLabel,
            customText: body.customText ? String(body.customText).slice(0, 500) : null,
            flagId: flagRef.id,
            status: 'active',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      const ban = await applyFlagSignal(db, admin, {
        reportedUid: targetUid,
        reporterUid: user.uid,
        reasonCode,
        chatId: body.chatId,
      });
      return sendSuccess(res, { flagged: true, flagId: flagRef.id, shadowban: ban });
    }
    if (action === 'withdraw_flag') {
      if (!targetUid) return sendError(res, 400, 'VALIDATION_ERROR', 'targetUid required');
      const flagId = body.flagId ? String(body.flagId).slice(0, 80) : null;
      const withdrawReason = String(body.withdrawReason || body.reason || 'changed_mind').slice(0, 80);
      if (flagId) {
        const flagRef = db.collection('user_flags').doc(flagId);
        const snap = await flagRef.get();
        if (snap.exists && snap.data()?.reporterUid === user.uid) {
          await flagRef.set(
            {
              status: 'withdrawn',
              withdrawnAt: admin.firestore.FieldValue.serverTimestamp(),
              withdrawReason,
            },
            { merge: true }
          );
        }
      } else {
        // Best-effort: mark newest active flag from this reporter on target
        const q = await db
          .collection('user_flags')
          .where('reporterUid', '==', user.uid)
          .where('reportedUid', '==', targetUid)
          .limit(5)
          .get();
        const batch = db.batch();
        q.docs.forEach((d) => {
          if (d.data()?.status === 'withdrawn') return;
          batch.set(
            d.ref,
            {
              status: 'withdrawn',
              withdrawnAt: admin.firestore.FieldValue.serverTimestamp(),
              withdrawReason,
            },
            { merge: true }
          );
        });
        await batch.commit().catch(() => {});
      }
      await db
        .collection('users')
        .doc(user.uid)
        .collection('reported')
        .doc(targetUid)
        .set(
          {
            status: 'withdrawn',
            withdrawnAt: admin.firestore.FieldValue.serverTimestamp(),
            withdrawReason,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      return sendSuccess(res, { withdrawn: true, targetUid });
    }
    if (action === 'list_my_reports') {
      const snap = await db
        .collection('users')
        .doc(user.uid)
        .collection('reported')
        .where('status', '==', 'active')
        .limit(60)
        .get()
        .catch(async () =>
          db.collection('users').doc(user.uid).collection('reported').limit(60).get()
        );
      const items = snap.docs
        .map((d) => {
          const data = d.data() || {};
          return {
            id: d.id,
            targetUid: data.targetUid || d.id,
            name: data.name || 'User',
            username: data.username || '',
            reason: data.reason || data.reasonCode || '',
            flagId: data.flagId || null,
            status: data.status || 'active',
            createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null,
          };
        })
        .filter((r) => r.status !== 'withdrawn');
      return sendSuccess(res, { items });
    }
    if (action === 'block_signal') {
      if (!targetUid) return sendError(res, 400, 'VALIDATION_ERROR', 'targetUid required');
      await maybeDecayShadowban(db, admin, targetUid).catch(() => {});
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
    const msg = String(error?.message || '');
    const code = String(error?.code || error?.status || '');
    console.error('[relationships]', action, msg, error?.stack || error);
    const known = {
      USER_NOT_FOUND: [404, 'USER_NOT_FOUND', 'User not found'],
      REQUEST_NOT_FOUND: [404, 'REQUEST_NOT_FOUND', 'Friend request not found'],
      SELF_RELATIONSHIP: [400, 'VALIDATION_ERROR', 'You cannot use this action on yourself'],
      FRIEND_REQUIRED: [403, 'FRIEND_REQUIRED', 'Only Friends can be added to your exclusion list'],
      RELATIONSHIP_BLOCKED: [403, 'RELATIONSHIP_BLOCKED', 'This relationship action is unavailable'],
    }[msg];
    if (known) return sendError(res, known[0], known[1], known[2]);
    const blob = `${msg} ${code}`;
    if (/NOT_FOUND|not-found/i.test(blob)) {
      return sendError(res, 404, 'USER_NOT_FOUND', 'User not found');
    }
    if (/upstash|redis|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|fetch failed/i.test(blob)) {
      return sendError(res, 503, 'RATE_LIMIT_UNAVAILABLE', 'Could not check rate limit. Try again.');
    }
    if (/PERMISSION_DENIED|permission-denied/i.test(blob)) {
      return sendError(res, 403, 'FIRESTORE_DENIED', 'Could not save this relationship.');
    }
    if (/firestore|GRPC|UNAVAILABLE|DEADLINE|ABORTED/i.test(blob)) {
      return sendError(res, 503, 'FIRESTORE_UNAVAILABLE', 'Could not save this relationship. Try again.');
    }
    return sendError(res, 500, 'RELATIONSHIP_FAILED', 'Could not update relationship');
  }
};
