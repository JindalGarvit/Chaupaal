/**
 * Unit tests for group invite join eligibility + public search filter.
 */
'use strict';
const assert = require('assert');
const {
  clientInviteSelfJoinAllowed,
  isGroupPublicForSearch,
  cleanInviteToken,
} = require('../server-lib/group-invite-join');

async function test(name, fn) {
  await fn();
  console.log(`✓ ${name}`);
}

async function main() {
  await test('public instant invite allows client self-join', () => {
    assert.equal(
      clientInviteSelfJoinAllowed({
        type: 'group',
        isPublic: true,
        invite: { token: 'abc', mode: 'instant', enabled: true },
      }),
      true
    );
    assert.equal(
      clientInviteSelfJoinAllowed({
        type: 'group',
        isPublic: true,
        invite: { token: 'abc', enabled: true },
      }),
      true
    );
  });

  await test('approval mode blocks tokenless client self-join', () => {
    assert.equal(
      clientInviteSelfJoinAllowed({
        type: 'group',
        isPublic: true,
        invite: { token: 'abc', mode: 'approval', enabled: true },
      }),
      false
    );
  });

  await test('private group blocks tokenless client self-join even with invite enabled', () => {
    assert.equal(
      clientInviteSelfJoinAllowed({
        type: 'group',
        isPublic: false,
        invite: { token: 'secret', mode: 'instant', enabled: true },
      }),
      false
    );
  });

  await test('disabled or missing invite blocks client self-join', () => {
    assert.equal(
      clientInviteSelfJoinAllowed({
        type: 'group',
        isPublic: true,
        invite: { token: 'abc', mode: 'instant', enabled: false },
      }),
      false
    );
    assert.equal(clientInviteSelfJoinAllowed({ type: 'group', isPublic: true }), false);
    assert.equal(clientInviteSelfJoinAllowed(null), false);
  });

  await test('isGroupPublicForSearch requires explicit public flag', () => {
    assert.equal(isGroupPublicForSearch({ isPublic: true }), true);
    assert.equal(isGroupPublicForSearch({ isPublic: false }), false);
    assert.equal(isGroupPublicForSearch({}), false);
    assert.equal(isGroupPublicForSearch({ visibility: 'public' }), true);
    assert.equal(isGroupPublicForSearch({ visibility: 'private' }), false);
    // Legacy bug: missing visibility must NOT treat private groups as public
    assert.equal(isGroupPublicForSearch({ name: 'Secret Circle', isPublic: false }), false);
  });

  await test('cleanInviteToken trims and caps length', () => {
    assert.equal(cleanInviteToken('  tok  '), 'tok');
    assert.equal(cleanInviteToken('x'.repeat(200)).length, 128);
    assert.equal(cleanInviteToken(''), '');
  });

  console.log('PASS: group invite join eligibility');
}

main().catch((e) => {
  console.error('FAIL:', e?.message || e);
  process.exit(1);
});
