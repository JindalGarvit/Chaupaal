/**
 * Pure shadowban tier thresholds (no Firestore).
 * Run: node scripts/test-shadowban.js
 */
'use strict';
const assert = require('assert');
const {
  tierAfterFlag,
  tierAfterBlock,
  SOFT_THRESHOLD,
  SEVERE_THRESHOLD,
  IMMEDIATE_SEVERE,
} = require('../server-lib/shadowban');

function test(name, fn) {
  try {
    fn();
    console.log('✓', name);
  } catch (e) {
    console.error('✗', name);
    console.error(e);
    process.exitCode = 1;
  }
}

test('thresholds and immediate reasons are fixed', () => {
  assert.strictEqual(SOFT_THRESHOLD, 2);
  assert.strictEqual(SEVERE_THRESHOLD, 5);
  assert.ok(IMMEDIATE_SEVERE.has('harassment'));
  assert.ok(IMMEDIATE_SEVERE.has('impersonation'));
});

test('first flag stays none until soft threshold', () => {
  assert.strictEqual(tierAfterFlag({ prevTier: 'none', count: 1, reasonCode: 'spam' }), 'none');
  assert.strictEqual(tierAfterFlag({ prevTier: 'none', count: SOFT_THRESHOLD, reasonCode: 'spam' }), 'soft');
});

test('severe threshold and immediate reasons escalate', () => {
  assert.strictEqual(tierAfterFlag({ prevTier: 'soft', count: SEVERE_THRESHOLD, reasonCode: 'spam' }), 'severe');
  assert.strictEqual(tierAfterFlag({ prevTier: 'none', count: 1, reasonCode: 'harassment' }), 'severe');
  assert.strictEqual(tierAfterFlag({ prevTier: 'none', count: 1, reasonCode: 'impersonation' }), 'severe');
});

test('severe never downgrades on later soft-path flags', () => {
  assert.strictEqual(tierAfterFlag({ prevTier: 'severe', count: SOFT_THRESHOLD, reasonCode: 'spam' }), 'severe');
});

test('block bumps to soft and preserves severe', () => {
  assert.deepStrictEqual(tierAfterBlock({ prevTier: 'none', prevCount: 0 }), {
    tier: 'soft',
    count: SOFT_THRESHOLD,
  });
  assert.deepStrictEqual(tierAfterBlock({ prevTier: 'severe', prevCount: 1 }), {
    tier: 'severe',
    count: SOFT_THRESHOLD,
  });
  assert.deepStrictEqual(tierAfterBlock({ prevTier: 'soft', prevCount: SEVERE_THRESHOLD }), {
    tier: 'severe',
    count: SEVERE_THRESHOLD,
  });
});

console.log(process.exitCode ? '\nShadowban tests failed.' : '\nShadowban tests passed.');
