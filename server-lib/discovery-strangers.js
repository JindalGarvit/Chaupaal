/**
 * Peepal/Khoj K0 — stranger-only eligibility for people discovery.
 *
 * Exclude from peeks / personal_match / intent_discover people results:
 * - self
 * - accepted friends (mutual following)
 * - pending friend requests (sent or received)
 * - mutual friends (friends-of-friends via friends' mutual-follow sets)
 *
 * Mutual-friend approximation: sample up to 40 of the viewer's friends; for each,
 * take their friend set (following ∩ followers, capped). Union = FoF exclude set.
 * Does not invent users to fill slots after filtering.
 */

async function loadFriendUidSet(db, uid, { limit = 200 } = {}) {
  const userRef = db.collection('users').doc(uid);
  const [followingSnap, followersSnap] = await Promise.all([
    userRef.collection('following').limit(limit).get(),
    userRef.collection('followers').limit(limit).get(),
  ]);
  const following = new Set(followingSnap.docs.map((d) => d.id));
  const friends = new Set();
  followersSnap.docs.forEach((d) => {
    if (following.has(d.id)) friends.add(d.id);
  });
  return friends;
}

/**
 * @returns {Promise<{
 *   friendUids: Set<string>,
 *   pendingUids: Set<string>,
 *   mutualFriendUids: Set<string>,
 *   excludeUids: Set<string>,
 * }>}
 */
async function loadStrangerExcludeSets(db, uid, opts = {}) {
  const friendCap = Math.min(200, Math.max(20, Number(opts.friendCap) || 120));
  const fofFriendSample = Math.min(40, Math.max(5, Number(opts.fofFriendSample) || 40));
  const fofPerFriend = Math.min(80, Math.max(10, Number(opts.fofPerFriend) || 60));

  const empty = {
    friendUids: new Set(),
    pendingUids: new Set(),
    mutualFriendUids: new Set(),
    excludeUids: new Set([uid].filter(Boolean)),
  };
  if (!db || !uid) return empty;

  const userRef = db.collection('users').doc(uid);
  let followingSnap;
  let followersSnap;
  let sentSnap;
  let receivedSnap;
  try {
    [followingSnap, followersSnap, sentSnap, receivedSnap] = await Promise.all([
      userRef.collection('following').limit(friendCap).get(),
      userRef.collection('followers').limit(friendCap).get(),
      userRef.collection('sentFriendRequests').limit(100).get(),
      userRef.collection('friendRequests').limit(100).get(),
    ]);
  } catch (e) {
    console.warn('[discovery-strangers] load edges', e?.message || e);
    return empty;
  }

  const following = new Set(followingSnap.docs.map((d) => d.id));
  const friendUids = new Set();
  followersSnap.docs.forEach((d) => {
    if (following.has(d.id)) friendUids.add(d.id);
  });

  const pendingUids = new Set([
    ...sentSnap.docs.map((d) => d.id),
    ...receivedSnap.docs.map((d) => d.id),
  ]);

  const mutualFriendUids = new Set();
  const sample = [...friendUids].slice(0, fofFriendSample);
  await Promise.all(
    sample.map(async (fid) => {
      try {
        const fof = await loadFriendUidSet(db, fid, { limit: fofPerFriend });
        fof.forEach((id) => mutualFriendUids.add(id));
      } catch (e) {
        /* ignore per-friend failures */
      }
    })
  );
  mutualFriendUids.delete(uid);
  friendUids.forEach((id) => mutualFriendUids.delete(id));

  const excludeUids = new Set([uid, ...friendUids, ...pendingUids, ...mutualFriendUids]);
  return { friendUids, pendingUids, mutualFriendUids, excludeUids };
}

function filterStrangersOnly(candidates, excludeUids) {
  const ban = excludeUids instanceof Set ? excludeUids : new Set(excludeUids || []);
  return (candidates || []).filter((c) => {
    const id = c?.uid || c?.id || c?.user?.uid;
    if (!id) return false;
    return !ban.has(String(id));
  });
}

module.exports = {
  loadFriendUidSet,
  loadStrangerExcludeSets,
  filterStrangersOnly,
};
