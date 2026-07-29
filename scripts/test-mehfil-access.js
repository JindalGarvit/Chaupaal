/**
 * Unit tests for server-lib/mehfil-access (pure helpers) — no Firebase.
 */
'use strict';
const assert = require('assert');
const {
  cleanChatId,
  channelForChat,
  chatIdFromChannel,
  memberSetFromChatData,
} = require('../server-lib/mehfil-access');

async function test(name, fn) {
  await fn();
  console.log(`✓ ${name}`);
}

async function main() {
  await test('cleanChatId strips unsafe chars and caps length', () => {
    assert.equal(cleanChatId('chat_profile_abc'), 'chat_profile_abc');
    assert.equal(cleanChatId('../evil/../x'), 'evilx');
    assert.equal(cleanChatId('a'.repeat(200)).length, 120);
    assert.equal(cleanChatId(''), '');
  });

  await test('channelForChat / chatIdFromChannel round-trip', () => {
    const id = 'chat_profile_user123';
    const ch = channelForChat(id);
    assert.equal(ch, 'mh_chat_profile_user123');
    assert.equal(chatIdFromChannel(ch), id);
    assert.equal(chatIdFromChannel('other_channel'), '');
    assert.equal(chatIdFromChannel('mh_'), '');
    assert.equal(chatIdFromChannel(''), '');
  });

  await test('channelForChat keeps round-trip under 64 chars', () => {
    const long = 'chat_' + 'x'.repeat(80);
    const ch = channelForChat(long);
    assert.ok(ch.length <= 64);
    assert.ok(ch.startsWith('mh_'));
    assert.equal(chatIdFromChannel(ch), cleanChatId(long).slice(0, 61));
  });

  await test('memberSetFromChatData accepts array and map shapes', () => {
    assert.deepEqual([...memberSetFromChatData({ participants: ['a', 'b'] })].sort(), ['a', 'b']);
    assert.deepEqual(
      [...memberSetFromChatData({ participants: { a: true, b: true } })].sort(),
      ['a', 'b']
    );
    assert.deepEqual([...memberSetFromChatData({ members: ['z'] })], ['z']);
    assert.equal(memberSetFromChatData(null).size, 0);
  });

  console.log('\nAll mehfil-access tests passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
