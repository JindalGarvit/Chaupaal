/**
 * Regression tests for discovery/content feedback signal validation.
 * Pure validators + early throws — no Firestore writes.
 */
'use strict';
const assert = require('assert');
const peepal = require('../api/peepal-reactions');
const {
  isValidDiscoveryPersonSignal,
  recordDiscoveryPersonSignal,
} = require('../server-lib/discovery-pipeline');

const { cleanPostId, isValidRecoSignal } = peepal;

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

async function testAsync(name, fn) {
  await fn();
  console.log(`✓ ${name}`);
}

test('cleanPostId accepts safe ids and rejects path/injection junk', () => {
  assert.strictEqual(cleanPostId('seed_peepal_monsoon_food'), 'seed_peepal_monsoon_food');
  assert.strictEqual(cleanPostId('AbC_12-xyz'), 'AbC_12-xyz');
  assert.strictEqual(cleanPostId('../etc/passwd'), '');
  assert.strictEqual(cleanPostId('has space'), '');
  assert.strictEqual(cleanPostId(''), '');
  assert.strictEqual(cleanPostId('x'.repeat(181)), '');
});

test('isValidRecoSignal only allows more_like|not_interested', () => {
  assert.strictEqual(isValidRecoSignal('more_like'), true);
  assert.strictEqual(isValidRecoSignal('not_interested'), true);
  assert.strictEqual(isValidRecoSignal('up'), false);
  assert.strictEqual(isValidRecoSignal('block'), false);
  assert.strictEqual(isValidRecoSignal(''), false);
  assert.strictEqual(isValidRecoSignal('MORE_LIKE'), false);
});

test('isValidDiscoveryPersonSignal mirrors reco signal allowlist', () => {
  assert.strictEqual(isValidDiscoveryPersonSignal('more_like'), true);
  assert.strictEqual(isValidDiscoveryPersonSignal('not_interested'), true);
  assert.strictEqual(isValidDiscoveryPersonSignal('like'), false);
});

async function main() {
  await testAsync('recordDiscoveryPersonSignal rejects missing uids before write', async () => {
    await assert.rejects(
      () => recordDiscoveryPersonSignal({}, {}, { uid: '', candidateUid: 'c1', signal: 'more_like' }),
      (err) => err && err.message === 'UID_REQUIRED'
    );
    await assert.rejects(
      () => recordDiscoveryPersonSignal({}, {}, { uid: 'u1', candidateUid: '', signal: 'more_like' }),
      (err) => err && err.message === 'UID_REQUIRED'
    );
  });

  await testAsync('recordDiscoveryPersonSignal rejects invalid signal before write', async () => {
    await assert.rejects(
      () =>
        recordDiscoveryPersonSignal({}, {}, { uid: 'u1', candidateUid: 'c1', signal: 'block' }),
      (err) => err && err.message === 'SIGNAL_INVALID'
    );
  });

  console.log('\nReco signal validation unit tests passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
