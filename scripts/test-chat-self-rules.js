/**
 * Firestore rules regression: self-chat get → create → message/music.
 * Requires Java + Firestore emulator.
 *
 *   npm i -D @firebase/rules-unit-testing firebase
 *   npx firebase emulators:exec --only firestore "node scripts/test-chat-self-rules.js"
 */
const fs = require('fs');
const path = require('path');

async function main() {
  let rut;
  try {
    rut = require('@firebase/rules-unit-testing');
  } catch (e) {
    console.error('Install @firebase/rules-unit-testing + firebase first.');
    process.exit(2);
  }

  const projectId = 'chaupaal-rules-selfchat';
  const rules = fs.readFileSync(path.join(__dirname, '..', 'firebase', 'firestore.rules'), 'utf8');
  const testEnv = await rut.initializeTestEnvironment({
    projectId,
    firestore: { rules, host: '127.0.0.1', port: 8080 },
  });

  const uid = 'user_self_1';
  const other = 'user_other_2';
  const selfId = `chat_self_${uid}`;
  const dmId = 'chat_dm_ab';
  const groupId = 'chat_group_1';

  const assert = (cond, msg) => {
    if (!cond) throw new Error(msg);
  };

  try {
    // --- Reproduce old failure mode conceptually: missing self doc get ---
    // With fixed rules, owner may get missing own system chat id.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      // clean slate — nothing to seed for missing-doc get
    });

    const alice = testEnv.authenticatedContext(uid);
    const bob = testEnv.authenticatedContext(other);
    const aliceDb = alice.firestore();
    const bobDb = bob.firestore();

    // 1) GET missing self-chat (was denied by isChatParticipant-only)
    await rut.assertSucceeds(aliceDb.doc(`chats/${selfId}`).get());
    await rut.assertFails(bobDb.doc(`chats/${selfId}`).get());

    // 2) CREATE self-chat with participants: [uid]
    await rut.assertSucceeds(
      aliceDb.doc(`chats/${selfId}`).set({
        participants: [uid],
        type: 'self',
        pinned: true,
        name: 'Message Yourself',
        preview: 'Notes to self',
        updatedAt: Date.now(),
      })
    );

    // Spoof: cannot create someone else's self chat
    await rut.assertFails(
      bobDb.doc(`chats/${selfId}`).set({
        participants: [other],
        type: 'self',
      })
    );

    // 3) Self-chat text message
    await rut.assertSucceeds(
      aliceDb.collection(`chats/${selfId}/messages`).add({
        text: 'hello self',
        uid,
        name: 'Alice',
        ts: Date.now(),
      })
    );

    // 4) Self-chat music message (same create path as song share)
    await rut.assertSucceeds(
      aliceDb.collection(`chats/${selfId}/messages`).add({
        text: '🎵 Test Song',
        uid,
        name: 'Alice',
        ts: Date.now(),
        music: {
          title: 'Test Song',
          artist: 'Test Artist',
          thumbnail: 'https://example.com/a.jpg',
          previewUrl: 'https://example.com/a.mp3',
          source: 'itunes',
        },
      })
    );

    // Message listener equivalent: list messages
    await rut.assertSucceeds(
      aliceDb.collection(`chats/${selfId}/messages`).orderBy('ts').limit(50).get()
    );
    await rut.assertFails(
      bobDb.collection(`chats/${selfId}/messages`).orderBy('ts').limit(50).get()
    );

    // 5) Normal 1:1 DM
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.doc(`chats/${dmId}`).set({
        participants: [uid, other],
        type: 'dm',
        updatedAt: Date.now(),
      });
      await db.doc(`chats/${groupId}`).set({
        participants: [uid, other],
        type: 'group',
        isPublic: false,
        admins: [uid],
        updatedAt: Date.now(),
      });
    });

    await rut.assertSucceeds(
      aliceDb.collection(`chats/${dmId}/messages`).add({
        text: 'hi dm',
        uid,
        name: 'Alice',
        ts: Date.now(),
      })
    );
    await rut.assertSucceeds(
      aliceDb.collection(`chats/${dmId}/messages`).add({
        text: '🎵 DM Song',
        uid,
        name: 'Alice',
        ts: Date.now(),
        music: { title: 'DM Song', artist: 'X', thumbnail: '', previewUrl: null, source: 'none' },
      })
    );

    // 6) Group text + music
    await rut.assertSucceeds(
      aliceDb.collection(`chats/${groupId}/messages`).add({
        text: 'hi group',
        uid,
        name: 'Alice',
        ts: Date.now(),
      })
    );
    await rut.assertSucceeds(
      aliceDb.collection(`chats/${groupId}/messages`).add({
        text: '🎵 Group Song',
        uid,
        name: 'Alice',
        ts: Date.now(),
        music: { title: 'Group Song', artist: 'Y', source: 'none' },
      })
    );

    // Inbox query still works for participant
    await rut.assertSucceeds(
      aliceDb.collection('chats').where('participants', 'array-contains', uid).get()
    );

    // Stranger cannot write to self-chat messages
    await rut.assertFails(
      bobDb.collection(`chats/${selfId}/messages`).add({
        text: 'nope',
        uid: other,
        ts: Date.now(),
      })
    );

    // Spoofed uid on own chat denied
    await rut.assertFails(
      aliceDb.collection(`chats/${selfId}/messages`).add({
        text: 'spoof',
        uid: other,
        ts: Date.now(),
      })
    );

    console.log('PASS: self-chat get/create, text+music self/dm/group, inbox list, spoof denied');
  } finally {
    await testEnv.cleanup();
  }
}

main().catch((e) => {
  console.error('FAIL:', e?.message || e);
  process.exit(1);
});
