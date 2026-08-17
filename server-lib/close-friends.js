/**
 * Close Friends is opt-out: every current mutual friend receives Splits
 * unless users/{uid}/cf_excluded/{targetUid} exists.
 *
 * Legacy users/{uid}/close_friends allowlists are ignored for delivery and
 * deleted on the next list/set Close Friends call (reset_all — not migrated).
 */
const CF_EXCLUDED = 'cf_excluded';
const CF_LEGACY = 'close_friends';

function isSplitKind(kind) {
  return kind === 'split' || kind === 'instant';
}

function normalizeBaithakKind(destination, kind) {
  const raw = String(kind || 'story');
  if (destination === 'baithak' && isSplitKind(raw)) return 'split';
  return 'story';
}

function closeFriendsRecipients({ friendIds = [], excludedIds = [], blockedIds = [] } = {}) {
  const excluded = new Set(excludedIds);
  const blocked = new Set(blockedIds);
  return (friendIds || []).filter((id) => id && !excluded.has(id) && !blocked.has(id));
}

function expiresMillis(data) {
  return data?.expiresAt?.toMillis?.() || Number(data?.expiresAt) || 0;
}

async function excludedIds(db, uid) {
  const snap = await db.collection('users').doc(uid).collection(CF_EXCLUDED).limit(500).get();
  return new Set(snap.docs.map((doc) => doc.id));
}

function excludedRef(db, ownerUid, targetUid) {
  return db.collection('users').doc(ownerUid).collection(CF_EXCLUDED).doc(targetUid);
}

function legacyCloseFriendRef(db, ownerUid, targetUid) {
  return db.collection('users').doc(ownerUid).collection(CF_LEGACY).doc(targetUid);
}

async function commitChunks(db, writes) {
  for (let start = 0; start < writes.length; start += 450) {
    const batch = db.batch();
    writes.slice(start, start + 450).forEach((write) => write(batch));
    await batch.commit();
  }
}

/** One-time reset: drop old allowlist docs. Do not copy them into exclusions. */
async function purgeLegacyCloseFriendsAllowlist(db, uid) {
  const col = db.collection('users').doc(uid).collection(CF_LEGACY);
  let deleted = 0;
  while (deleted < 2000) {
    const snap = await col.limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += snap.size;
    if (snap.size < 400) break;
  }
  return deleted;
}

async function liveOwnerSplits(db, ownerUid) {
  const snap = await db.collection('baithak_stories').where('uid', '==', ownerUid).limit(120).get();
  const now = Date.now();
  return snap.docs.filter((doc) => {
    const data = doc.data() || {};
    if (!isSplitKind(data.kind)) return false;
    if (data.visibility !== 'close_friends') return false;
    if (data.active === false || data.deletedAt || data.saveOnly === true) return false;
    const exp = expiresMillis(data);
    return !exp || exp > now;
  });
}

async function hideSplitsFromFriend(db, admin, ownerUid, friendUid) {
  const stories = await liveOwnerSplits(db, ownerUid);
  if (!stories.length) return 0;
  const writes = [];
  stories.forEach((doc) => {
    writes.push((batch) =>
      batch.delete(db.collection('users').doc(friendUid).collection('storyInbox').doc(`baithak_${doc.id}`))
    );
    writes.push((batch) =>
      batch.set(
        db.collection('users').doc(ownerUid).collection('storyDeliveryManifests').doc(doc.id),
        { recipientIds: admin.firestore.FieldValue.arrayRemove(friendUid) },
        { merge: true }
      )
    );
  });
  await commitChunks(db, writes);
  return stories.length;
}

async function fanoutSplitsToFriend(db, admin, ownerUid, friendUid) {
  if (!ownerUid || !friendUid || ownerUid === friendUid) return 0;
  const stories = await liveOwnerSplits(db, ownerUid);
  if (!stories.length) return 0;
  const now = admin.firestore.FieldValue.serverTimestamp();
  const writes = [];
  stories.forEach((doc) => {
    const data = doc.data() || {};
    writes.push((batch) =>
      batch.set(
        db.collection('users').doc(friendUid).collection('storyInbox').doc(`baithak_${doc.id}`),
        {
          storyId: doc.id,
          ownerUid,
          destination: 'baithak',
          createdAt: now,
          expiresAt: data.expiresAt || null,
        },
        { merge: true }
      )
    );
    writes.push((batch) =>
      batch.set(
        db.collection('users').doc(ownerUid).collection('storyDeliveryManifests').doc(doc.id),
        { recipientIds: admin.firestore.FieldValue.arrayUnion(friendUid) },
        { merge: true }
      )
    );
  });
  await commitChunks(db, writes);
  return stories.length;
}

async function syncSplitInboxForFriend(db, admin, ownerUid, friendUid, { include } = {}) {
  if (include) return fanoutSplitsToFriend(db, admin, ownerUid, friendUid);
  return hideSplitsFromFriend(db, admin, ownerUid, friendUid);
}

async function maybeFanoutSplitsOnFriendship(db, admin, a, b) {
  try {
    await Promise.all([
      fanoutSplitsToFriend(db, admin, a, b),
      fanoutSplitsToFriend(db, admin, b, a),
    ]);
  } catch (error) {
    console.warn('[close-friends] friendship fanout', error?.message || error);
  }
}

module.exports = {
  CF_EXCLUDED,
  CF_LEGACY,
  isSplitKind,
  normalizeBaithakKind,
  closeFriendsRecipients,
  excludedIds,
  excludedRef,
  legacyCloseFriendRef,
  purgeLegacyCloseFriendsAllowlist,
  liveOwnerSplits,
  hideSplitsFromFriend,
  fanoutSplitsToFriend,
  syncSplitInboxForFriend,
  maybeFanoutSplitsOnFriendship,
};
