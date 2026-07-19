const assert = require('assert');
const { deriveRelationshipState, canViewStory } = require('../server-lib/social-model');

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
