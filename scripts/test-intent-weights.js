/**
 * Intent weight normalization / scoring (matchmaking re-rank).
 * Run: node scripts/test-intent-weights.js
 */
const assert = require('assert');
const {
  SIGNAL_NAMES,
  defaultWeights,
  normalizeWeights,
  weightedScore,
  intentKey,
  MAX_WEIGHT_SHIFT,
} = require('../server-lib/intent-weights');

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

test('defaultWeights sum to 1 across SIGNAL_NAMES', () => {
  const w = defaultWeights();
  const sum = SIGNAL_NAMES.reduce((s, k) => s + w[k], 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  SIGNAL_NAMES.forEach((k) => assert.ok(w[k] > 0));
});

test('normalizeWeights falls back when all zero / garbage', () => {
  assert.deepStrictEqual(normalizeWeights({}), defaultWeights());
  assert.deepStrictEqual(normalizeWeights({ embeddingSimilarity: -5 }), defaultWeights());
});

test('normalizeWeights renormalizes positive inputs', () => {
  const w = normalizeWeights({ embeddingSimilarity: 2, interestOverlap: 2 });
  assert.ok(Math.abs(w.embeddingSimilarity - 0.5) < 1e-9);
  assert.ok(Math.abs(w.interestOverlap - 0.5) < 1e-9);
  SIGNAL_NAMES.filter((k) => k !== 'embeddingSimilarity' && k !== 'interestOverlap').forEach((k) => {
    assert.strictEqual(w[k], 0);
  });
});

test('weightedScore prefers higher weighted signals', () => {
  const weights = normalizeWeights({ embeddingSimilarity: 1 });
  const high = weightedScore({ embeddingSimilarity: 1, interestOverlap: 0 }, weights);
  const low = weightedScore({ embeddingSimilarity: 0, interestOverlap: 1 }, weights);
  assert.ok(high > low);
});

test('intentKey trims, lowercases, collapses space, caps length', () => {
  assert.strictEqual(intentKey('  Find  Friends  '), 'find friends');
  assert.strictEqual(intentKey('x'.repeat(200)).length, 120);
});

test('MAX_WEIGHT_SHIFT is a small bounded fraction', () => {
  assert.ok(MAX_WEIGHT_SHIFT > 0 && MAX_WEIGHT_SHIFT <= 0.5);
});

console.log(process.exitCode ? '\nIntent weight tests failed.' : '\nIntent weight tests passed.');
