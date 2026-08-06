/**
 * Unit tests for users_public / group denorm helpers (no Firestore).
 * Guards privacy allowlisting on public projections.
 */
'use strict';
const assert = require('assert');
const {
  groupNameLower,
  buildPublicProjection,
} = require('../server-lib/backfill-denorms');

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

test('groupNameLower trims, lowercases, and caps length', () => {
  assert.strictEqual(groupNameLower('  Cricket Club  '), 'cricket club');
  assert.strictEqual(groupNameLower('X'.repeat(120)).length, 80);
  assert.strictEqual(groupNameLower(null), '');
});

test('buildPublicProjection copies only allowlisted public fields', () => {
  const proj = buildPublicProjection('u1', {
    name: 'Meera',
    username: 'meera',
    email: 'secret@example.com',
    phone: '+919999999999',
    passwordHash: 'nope',
    teenMode: true,
    hiddenFromDiscovery: true,
    city: 'Mumbai',
    bio: 'Hello',
    openToMeet: true,
  });
  assert.strictEqual(proj.uid, 'u1');
  assert.strictEqual(proj.name, 'Meera');
  assert.strictEqual(proj.username, 'meera');
  assert.strictEqual(proj.nameLower, 'meera');
  assert.strictEqual(proj.usernameLower, 'meera');
  assert.strictEqual(proj.city, 'Mumbai');
  assert.strictEqual(proj.bio, 'Hello');
  assert.strictEqual(proj.openToMeet, true);
  assert.strictEqual(proj.email, undefined);
  assert.strictEqual(proj.phone, undefined);
  assert.strictEqual(proj.passwordHash, undefined);
  assert.strictEqual(proj.teenMode, undefined);
  // Projection may still carry the flag if present on the raw doc allowlist —
  // backfillUsersPublic must delete it before write. Ensure it is NOT on the
  // allowlist so a merge cannot clobber public opt-out from private data.
  assert.strictEqual(proj.hiddenFromDiscovery, undefined);
});

test('buildPublicProjection fills city/bio/profileType from nested profile', () => {
  const proj = buildPublicProjection('u2', {
    profile: {
      displayName: 'Kabir',
      bio: 'Nested bio',
      currentCity: 'Pune',
      profileType: 'professional',
      interests: ['Chess'],
    },
  });
  assert.strictEqual(proj.city, 'Pune');
  assert.strictEqual(proj.bio, 'Nested bio');
  assert.strictEqual(proj.profileType, 'professional');
  assert.deepStrictEqual(proj.profile.interests, ['Chess']);
  assert.strictEqual(proj.profile.currentCity, 'Pune');
});

test('buildPublicProjection defaults profileType to personal', () => {
  const proj = buildPublicProjection('u3', { name: 'Dev' });
  assert.strictEqual(proj.profileType, 'personal');
});

console.log('\nBackfill denorm unit tests passed.');
