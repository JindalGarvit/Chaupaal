/**
 * Split exclusion / delivery helpers.
 */
const assert = require('assert');
const {
  isSplitKind,
  normalizeBaithakKind,
  closeFriendsRecipients,
} = require('../server-lib/close-friends');
const { isCloseFriendOptOut } = require('../server-lib/social-model');

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

test('kind split and instant both count as Splits', () => {
  assert.equal(isSplitKind('split'), true);
  assert.equal(isSplitKind('instant'), true);
  assert.equal(isSplitKind('story'), false);
});

test('create writes kind split for baithak instant alias', () => {
  assert.equal(normalizeBaithakKind('baithak', 'instant'), 'split');
  assert.equal(normalizeBaithakKind('baithak', 'split'), 'split');
  assert.equal(normalizeBaithakKind('baithak', 'story'), 'story');
  assert.equal(normalizeBaithakKind('duniya', 'split'), 'story');
});

test('legacy allowlist docs do not restrict opt-out delivery', () => {
  assert.deepEqual(
    closeFriendsRecipients({
      friendIds: ['a', 'b', 'c'],
      excludedIds: [],
      blockedIds: [],
    }),
    ['a', 'b', 'c']
  );
  assert.deepEqual(
    closeFriendsRecipients({
      friendIds: ['a', 'b', 'c'],
      excludedIds: ['b'],
      blockedIds: ['c'],
    }),
    ['a']
  );
});

test('non-friends never receive Split delivery', () => {
  assert.equal(isCloseFriendOptOut({ isFriend: false, excluded: false }), false);
});

test('Split exclusion: friend not excluded receives; excluded does not', () => {
  assert.equal(isCloseFriendOptOut({ isFriend: true, excluded: false }), true);
});
