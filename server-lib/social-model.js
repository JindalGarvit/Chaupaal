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
  canViewStory,
};
