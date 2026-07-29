/**
 * Pure shadowban tier + soft decay (no Firestore).
 * Run: node scripts/test-shadowban.js
 */
'use strict';
const assert = require('assert');
const {
  tierAfterFlag,
  tierAfterBlock,
  softDecayNext,
  SOFT_THRESHOLD,
  SEVERE_THRESHOLD,
  IMMEDIATE_SEVERE,
  DECAY_MS,
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
  assert.strictEqual(DECAY_MS, 14 * 24 * 60 * 60 * 1000);
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

test('soft decay skips severe and fresh soft bans', () => {
  const now = 1_700_000_000_000;
  assert.deepStrictEqual(
    softDecayNext({ tier: 'severe', count: 6, updatedAtMs: now - DECAY_MS * 2, nowMs: now }),
    { decayed: false, tier: 'severe', count: 6 }
  );
  assert.deepStrictEqual(
    softDecayNext({ tier: 'soft', count: 3, updatedAtMs: now - 1000, nowMs: now }),
    { decayed: false, tier: 'soft', count: 3 }
  );
});

test('soft decay decrements and clears below soft threshold', () => {
  const now = 1_700_000_000_000;
  assert.deepStrictEqual(
    softDecayNext({ tier: 'soft', count: SOFT_THRESHOLD, updatedAtMs: now - DECAY_MS, nowMs: now }),
    { decayed: true, tier: 'none', count: SOFT_THRESHOLD - 1 }
  );
  assert.deepStrictEqual(
    softDecayNext({ tier: 'soft', count: 4, updatedAtMs: now - DECAY_MS - 1, nowMs: now }),
    { decayed: true, tier: 'soft', count: 3 }
  );
});

console.log(process.exitCode ? '\nShadowban tests failed.' : '\nShadowban tests passed.');
