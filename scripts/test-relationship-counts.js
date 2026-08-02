/**
 * Unit tests for relationship count normalization (no Firestore).
 * Run: node scripts/test-relationship-counts.js
 */
'use strict';
const assert = require('assert');
const { normalizeCounts, cleanUid } = require('../api/relationships');

function test(name, fn) {
  fn();
  console.log('✓', name);
}

test('normalizeCounts clamps negatives and coerces non-numbers to 0', () => {
  assert.deepStrictEqual(normalizeCounts(null), { friends: 0, followers: 0, following: 0 });
  assert.deepStrictEqual(normalizeCounts({}), { friends: 0, followers: 0, following: 0 });
  assert.deepStrictEqual(normalizeCounts({ friends: -3, followers: '12', following: 'x' }), {
    friends: 0,
    followers: 12,
    following: 0,
  });
  assert.deepStrictEqual(normalizeCounts({ friends: 2.9, followers: NaN, following: 0 }), {
    friends: 2.9,
    followers: 0,
    following: 0,
  });
});

test('normalizeCounts preserves valid non-negative integers', () => {
  assert.deepStrictEqual(normalizeCounts({ friends: 4, followers: 10, following: 7 }), {
    friends: 4,
    followers: 10,
    following: 7,
  });
});

test('cleanUid rejects empty / oversized / invalid ids', () => {
  assert.strictEqual(cleanUid('user_1'), 'user_1');
  assert.strictEqual(cleanUid('  u  '), 'u');
  assert.strictEqual(cleanUid(''), '');
  assert.strictEqual(cleanUid(null), '');
  assert.strictEqual(cleanUid('bad uid'), '');
  assert.strictEqual(cleanUid('x'.repeat(181)), '');
  assert.strictEqual(cleanUid('x'.repeat(180)), 'x'.repeat(180));
});

console.log('\nAll relationship-counts tests passed.');
