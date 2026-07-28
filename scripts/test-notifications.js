/**
 * Unit tests for server-lib/notifications (bundling / prune) — no Firestore.
 */
'use strict';
const assert = require('assert');
const {
  makeBundleId,
  mergeBundleActors,
  shouldPruneReadBundle,
  sectionForType,
  normalizeActor,
  shouldThrottleDmBundle,
  ACTOR_STORE_MAX,
  PRUNE_AGE_MS,
  DM_THROTTLE_MS,
} = require('../server-lib/notifications');

async function test(name, fn) {
  await fn();
  console.log(`✓ ${name}`);
}

async function main() {
  await test('makeBundleId is deterministic and safe', () => {
    assert.equal(makeBundleId('like', 'post_1'), makeBundleId('like', 'post_1'));
    assert.equal(makeBundleId('like', 'post/1!'), 'like__post_1');
    assert.ok(!makeBundleId('like', 'a/b').includes('/'));
  });

  await test('sectionForType maps social types', () => {
    assert.equal(sectionForType('like'), 'duniya');
    assert.equal(sectionForType('friend_request'), 'baithak');
    assert.equal(sectionForType('peepal_reaction'), 'peepal');
    assert.equal(sectionForType('message'), 'baithak');
    assert.equal(sectionForType('duel'), 'dangal');
  });

  await test('mergeBundleActors creates fresh unread bundle', () => {
    const a = { uid: 'u1', name: 'A', avatar: '🙂' };
    const out = mergeBundleActors(null, a);
    assert.equal(out.actorCount, 1);
    assert.equal(out.actors.length, 1);
    assert.equal(out.actors[0].uid, 'u1');
  });

  await test('mergeBundleActors bundles distinct actors and caps store', () => {
    let state = { actors: [], actorCount: 0 };
    for (let i = 1; i <= 5; i++) {
      state = mergeBundleActors(state, { uid: `u${i}`, name: `U${i}`, avatar: '🙂' });
    }
    assert.equal(state.actorCount, 5);
    assert.equal(state.actors.length, ACTOR_STORE_MAX);
    assert.equal(state.actors[0].uid, 'u5'); // newest first
  });

  await test('mergeBundleActors does not inflate on same actor spam', () => {
    let state = mergeBundleActors(null, { uid: 'u1', name: 'A', avatar: '🙂' });
    state = mergeBundleActors(state, { uid: 'u1', name: 'A', avatar: '🙂' });
    state = mergeBundleActors(state, { uid: 'u1', name: 'A', avatar: '🙂' });
    assert.equal(state.actorCount, 1);
    assert.equal(state.actors.length, 1);
  });

  await test('reopen after read resets actors to new cycle only', () => {
    const prior = {
      actors: [
        { uid: 'u1', name: 'A', avatar: '🙂' },
        { uid: 'u2', name: 'B', avatar: '🙂' },
      ],
      actorCount: 4,
      read: true,
    };
    const next = mergeBundleActors(prior, { uid: 'u3', name: 'C', avatar: '🙂' }, { wasRead: true });
    assert.equal(next.reopened, true);
    assert.equal(next.actorCount, 1);
    assert.equal(next.actors.length, 1);
    assert.equal(next.actors[0].uid, 'u3');
  });

  await test('shouldPruneReadBundle only old read docs', () => {
    const now = Date.now();
    assert.equal(shouldPruneReadBundle({ read: false, updatedAtMs: now - PRUNE_AGE_MS * 2 }, now), false);
    assert.equal(shouldPruneReadBundle({ read: true, updatedAtMs: now - 1000 }, now), false);
    assert.equal(shouldPruneReadBundle({ read: true, updatedAtMs: now - PRUNE_AGE_MS - 1 }, now), true);
  });

  await test('normalizeActor rejects empty / oversized uid', () => {
    assert.equal(normalizeActor(null), null);
    assert.equal(normalizeActor({ uid: '' }), null);
    assert.equal(normalizeActor({ uid: 'x'.repeat(129) }), null);
    assert.equal(normalizeActor({ uid: 'u1', name: 'A' }).uid, 'u1');
  });

  await test('shouldThrottleDmBundle gates same-actor spam within window', () => {
    const now = 1_000_000;
    const unread = {
      read: false,
      updatedAtMs: now - 30_000,
      actors: [{ uid: 'u1' }],
    };
    assert.equal(shouldThrottleDmBundle(unread, 'u1', now, DM_THROTTLE_MS), true);
    assert.equal(shouldThrottleDmBundle(unread, 'u2', now, DM_THROTTLE_MS), false);
    assert.equal(shouldThrottleDmBundle({ ...unread, read: true }, 'u1', now, DM_THROTTLE_MS), false);
    assert.equal(
      shouldThrottleDmBundle({ ...unread, updatedAtMs: now - DM_THROTTLE_MS - 1 }, 'u1', now, DM_THROTTLE_MS),
      false
    );
  });

  console.log('\nAll notification tests passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
