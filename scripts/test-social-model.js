const assert = require('assert');
const {
  deriveRelationshipState,
  canViewStory,
  primaryRelationshipMode,
  countDeltasForFollowChange,
} = require('../server-lib/social-model');

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

test('one directional follow is not friendship', () => {
  assert.deepStrictEqual(deriveRelationshipState({ following: true, followsYou: false }), {
    following: true,
    followsYou: false,
    friend: false,
  });
});

test('reciprocal follows derive friendship', () => {
  assert.equal(deriveRelationshipState({ following: true, followsYou: true }).friend, true);
});

test('removing either edge immediately removes friendship', () => {
  assert.equal(deriveRelationshipState({ following: false, followsYou: true }).friend, false);
});

test('Peepal surface prefers Friend CTA', () => {
  assert.equal(primaryRelationshipMode({ context: 'peepal', profileType: 'professional' }), 'friend');
});

test('Duniya surface prefers Follow CTA', () => {
  assert.equal(primaryRelationshipMode({ context: 'duniya', profileType: 'personal' }), 'follow');
});

test('explicit personal profile prefers Friend CTA', () => {
  assert.equal(primaryRelationshipMode({ context: 'profile', profileType: 'personal' }), 'friend');
});

test('explicit professional profile prefers Follow CTA', () => {
  assert.equal(primaryRelationshipMode({ context: 'profile', profileType: 'professional' }), 'follow');
});

test('follow into mutual increments friends on both sides', () => {
  assert.deepStrictEqual(
    countDeltasForFollowChange({ alreadyFollowing: false, reverseExists: true, follow: true }),
    {
      from: { friends: 1, followers: 0, following: 1 },
      to: { friends: 1, followers: 1, following: 0 },
    }
  );
});

test('one-way follow does not increment friends', () => {
  assert.deepStrictEqual(
    countDeltasForFollowChange({ alreadyFollowing: false, reverseExists: false, follow: true }),
    {
      from: { friends: 0, followers: 0, following: 1 },
      to: { friends: 0, followers: 1, following: 0 },
    }
  );
});

test('unfollow from mutual decrements friends', () => {
  assert.deepStrictEqual(
    countDeltasForFollowChange({ alreadyFollowing: true, reverseExists: true, follow: false }),
    {
      from: { friends: -1, followers: 0, following: -1 },
      to: { friends: -1, followers: -1, following: 0 },
    }
  );
});

test('idempotent follow is a no-op for counts', () => {
  assert.deepStrictEqual(
    countDeltasForFollowChange({ alreadyFollowing: true, reverseExists: false, follow: true }),
    {
      from: { friends: 0, followers: 0, following: 0 },
      to: { friends: 0, followers: 0, following: 0 },
    }
  );
});

test('strangers can see active public Duniya stories', () => {
  assert.equal(canViewStory({ destination: 'duniya', audience: 'public' }), true);
});

test('strangers cannot see Baithak stories', () => {
  assert.equal(canViewStory({ destination: 'baithak', visibility: 'friends' }), false);
});

test('Friends can see normal Baithak stories', () => {
  assert.equal(canViewStory({ destination: 'baithak', visibility: 'friends', isFriend: true }), true);
});

test('Close Friends stories still require current friendship', () => {
  assert.equal(
    canViewStory({
      destination: 'baithak',
      visibility: 'close_friends',
      isFriend: false,
      isCloseFriend: true,
    }),
    false
  );
});

test('Close Friends stories require private-list membership', () => {
  assert.equal(
    canViewStory({
      destination: 'baithak',
      visibility: 'close_friends',
      isFriend: true,
      isCloseFriend: false,
    }),
    false
  );
});

test('blocks override all non-owner story access', () => {
  assert.equal(
    canViewStory({
      destination: 'duniya',
      audience: 'public',
      blocked: true,
    }),
    false
  );
});

test('expired stories remain owner-visible for archive', () => {
  assert.equal(
    canViewStory({
      destination: 'baithak',
      visibility: 'friends',
      isOwner: true,
      allowOwnerArchive: true,
      expired: true,
      active: false,
    }),
    true
  );
});

test('expired stories do not remain in the owner live feed', () => {
  assert.equal(
    canViewStory({
      destination: 'baithak',
      visibility: 'friends',
      isOwner: true,
      expired: true,
      active: true,
    }),
    false
  );
});

console.log('\nSocial model invariants passed.');
