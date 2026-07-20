/**
 * Pure relationship/story policy helpers. Keeping these free of Firestore
 * makes the core privacy invariants directly testable.
 */
function deriveRelationshipState({ following = false, followsYou = false } = {}) {
  return {
    following: !!following,
    followsYou: !!followsYou,
    friend: !!following && !!followsYou,
  };
}

/**
 * Primary CTA for a profile surface.
 * Peepal leans Friend; Duniya leans Follow; explicit profile visits use the
 * target's account type (personal → Friend, professional → Follow).
 */
function primaryRelationshipMode({ context = '', profileType = 'personal' } = {}) {
  const ctx = String(context || '').toLowerCase();
  if (ctx === 'peepal') return 'friend';
  if (ctx === 'duniya') return 'follow';
  return String(profileType || 'personal').toLowerCase() === 'professional' ? 'follow' : 'friend';
}

/**
 * Count deltas when A adds or removes the A→B follow edge.
 * Returns { from: {friends,followers,following}, to: {...} } relative to A=from, B=to.
 */
function countDeltasForFollowChange({ alreadyFollowing = false, reverseExists = false, follow = true } = {}) {
  const empty = { friends: 0, followers: 0, following: 0 };
  if (follow) {
    if (alreadyFollowing) return { from: { ...empty }, to: { ...empty } };
    return {
      from: { friends: reverseExists ? 1 : 0, followers: 0, following: 1 },
      to: { friends: reverseExists ? 1 : 0, followers: 1, following: 0 },
    };
  }
  if (!alreadyFollowing) return { from: { ...empty }, to: { ...empty } };
  return {
    from: { friends: reverseExists ? -1 : 0, followers: 0, following: -1 },
    to: { friends: reverseExists ? -1 : 0, followers: -1, following: 0 },
  };
}

function canViewStory({
  destination,
  visibility,
  audience,
  isOwner = false,
  allowOwnerArchive = false,
  isFriend = false,
  isCloseFriend = false,
  blocked = false,
  active = true,
  expired = false,
} = {}) {
  if (blocked && !isOwner) return false;
  if (!active || expired) return !!isOwner && !!allowOwnerArchive;
  if (isOwner) return true;
  if (destination === 'duniya') return audience === 'public';
  if (destination !== 'baithak' || !isFriend) return false;
  if (visibility === 'close_friends') return !!isCloseFriend;
  return visibility === 'friends';
}

module.exports = {
  deriveRelationshipState,
  primaryRelationshipMode,
  countDeltasForFollowChange,
  canViewStory,
};
