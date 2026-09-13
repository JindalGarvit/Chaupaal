/**
 * Privacy / disclosure Firestore + RTDB rules tests (P0 + P9 residuals).
 *
 * Run via: npm run test:rules
 * (firebase emulators:exec --only firestore,database …)
 */
'use strict';

const fs = require('fs');
const path = require('path');

async function main() {
  let rut;
  try {
    rut = require('@firebase/rules-unit-testing');
  } catch (e) {
    console.error('Install @firebase/rules-unit-testing + firebase first (npm i -D …).');
    process.exit(2);
  }

  const projectId = 'demo-chaupaal-privacy';
  const firestoreRules = fs.readFileSync(path.join(__dirname, '..', 'firebase', 'firestore.rules'), 'utf8');
  const databaseRules = fs.readFileSync(path.join(__dirname, '..', 'firebase', 'database.rules.json'), 'utf8');

  const testEnv = await rut.initializeTestEnvironment({
    projectId,
    firestore: { rules: firestoreRules, host: '127.0.0.1', port: 8080 },
    database: { rules: databaseRules, host: '127.0.0.1', port: 9000 },
  });

  const aliceUid = 'alice_privacy_1';
  const friendUid = 'friend_privacy_2';
  const strangerUid = 'stranger_privacy_3';

  try {
    const alice = testEnv.authenticatedContext(aliceUid);
    const friend = testEnv.authenticatedContext(friendUid);
    const stranger = testEnv.authenticatedContext(strangerUid);
    const aliceFs = alice.firestore();
    const friendFs = friend.firestore();
    const strangerFs = stranger.firestore();

    // ---------- users/{uid} owner-only ----------
    await rut.assertSucceeds(
      aliceFs.doc(`users/${aliceUid}`).set({
        name: 'Alice',
        email: 'alice@example.com',
        bio: 'secret bio',
        profileVisibility: 'Friends only',
      })
    );
    await rut.assertSucceeds(aliceFs.doc(`users/${aliceUid}`).get());
    await rut.assertFails(strangerFs.doc(`users/${aliceUid}`).get());
    await rut.assertFails(friendFs.doc(`users/${aliceUid}`).get());
    await rut.assertFails(
      strangerFs.doc(`users/${aliceUid}`).set({ name: 'Hacked' }, { merge: true })
    );

    // ---------- journal / saved / likes / comment_activity owner-only ----------
    await rut.assertSucceeds(
      aliceFs.doc(`users/${aliceUid}/journal/j1`).set({ text: 'private journal', at: Date.now() })
    );
    await rut.assertFails(strangerFs.doc(`users/${aliceUid}/journal/j1`).get());
    await rut.assertSucceeds(
      aliceFs.doc(`users/${aliceUid}/saved/duniya_p1`).set({
        collection: 'duniya',
        postId: 'p1',
        savedAt: Date.now(),
      })
    );
    await rut.assertFails(friendFs.doc(`users/${aliceUid}/saved/duniya_p1`).get());
    await rut.assertSucceeds(
      aliceFs.doc(`users/${aliceUid}/likes/l1`).set({ postId: 'p1', at: Date.now() })
    );
    await rut.assertFails(strangerFs.doc(`users/${aliceUid}/likes/l1`).get());
    await rut.assertSucceeds(
      aliceFs.doc(`users/${aliceUid}/comment_activity/c1`).set({ text: 'hi', at: Date.now() })
    );
    await rut.assertFails(strangerFs.doc(`users/${aliceUid}/comment_activity/c1`).get());

    // ---------- users_public: no email/phone; Friends only = identity only ----------
    await rut.assertFails(
      aliceFs.doc(`users_public/${aliceUid}`).set({
        uid: aliceUid,
        name: 'Alice',
        email: 'alice@example.com',
        profileVisibility: 'public',
      })
    );
    await rut.assertFails(
      aliceFs.doc(`users_public/${aliceUid}`).set({
        uid: aliceUid,
        name: 'Alice',
        bio: 'should not leak',
        city: 'Mumbai',
        profileVisibility: 'Friends only',
      })
    );
    await rut.assertFails(
      aliceFs.doc(`users_public/${aliceUid}`).set({
        uid: aliceUid,
        name: 'Alice',
        profileVisibility: 'Private',
        profile: { displayName: 'Alice', bio: 'nested leak' },
      })
    );
    await rut.assertSucceeds(
      aliceFs.doc(`users_public/${aliceUid}`).set({
        uid: aliceUid,
        name: 'Alice',
        username: 'alice',
        photoURL: null,
        profileVisibility: 'Friends only',
        profile: { displayName: 'Alice', username: 'alice', profileVisibility: 'Friends only' },
      })
    );
    // Strangers may read the world doc (identity-only payload) — gated PII must not be present
    await rut.assertSucceeds(strangerFs.doc(`users_public/${aliceUid}`).get());
    const pubSnap = await strangerFs.doc(`users_public/${aliceUid}`).get();
    const pub = pubSnap.data() || {};
    if (pub.bio || pub.city || pub.email || pub.profile?.bio) {
      throw new Error('users_public stranger read contained gated PII');
    }

    // Public visibility may include bio
    await rut.assertSucceeds(
      aliceFs.doc(`users_public/${aliceUid}`).set({
        uid: aliceUid,
        name: 'Alice',
        username: 'alice',
        bio: 'hello public',
        profileVisibility: 'public',
        profile: { displayName: 'Alice', bio: 'hello public' },
      })
    );

    // ---------- friend_projection: friends only ----------
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      // Reciprocal follow → isFriend
      await db.doc(`users/${aliceUid}/following/${friendUid}`).set({ at: Date.now() });
      await db.doc(`users/${friendUid}/following/${aliceUid}`).set({ at: Date.now() });
      await db.doc(`users_public/${aliceUid}/friend_projection/card`).set({
        bio: 'friends see this',
        lookingFor: 'Friendship',
      });
    });

    await rut.assertSucceeds(aliceFs.doc(`users_public/${aliceUid}/friend_projection/card`).get());
    await rut.assertSucceeds(friendFs.doc(`users_public/${aliceUid}/friend_projection/card`).get());
    await rut.assertFails(strangerFs.doc(`users_public/${aliceUid}/friend_projection/card`).get());
    await rut.assertFails(
      strangerFs.doc(`users_public/${aliceUid}/friend_projection/card`).set({ bio: 'nope' })
    );

    // ---------- userModels / signalEvents / candidatePools — no client read/write ----------
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.doc(`userModels/${aliceUid}`).set({ topics: { Travel: 0.9 }, explain: [] });
      await db.doc(`signalEvents/2026-09-13/items/e1`).set({ uid: aliceUid, type: 'impression' });
      await db.doc(`candidatePools/city_mumbai`).set({ uids: [aliceUid] });
      await db.doc(`users/${aliceUid}/recommendationSignals/s1`).set({ type: 'like', at: Date.now() });
      await db.doc(`users/${aliceUid}/signalRollups/2026-09-13`).set({ impressions: 3 });
    });

    await rut.assertFails(aliceFs.doc(`userModels/${aliceUid}`).get());
    await rut.assertFails(strangerFs.doc(`userModels/${aliceUid}`).get());
    await rut.assertFails(aliceFs.doc(`userModels/${aliceUid}`).set({ topics: {} }));
    await rut.assertFails(aliceFs.doc(`signalEvents/2026-09-13/items/e1`).get());
    await rut.assertFails(strangerFs.doc(`signalEvents/2026-09-13/items/e1`).get());
    await rut.assertFails(aliceFs.doc(`candidatePools/city_mumbai`).get());
    // Owner may read own recommendationSignals + rollups; cannot write
    await rut.assertSucceeds(aliceFs.doc(`users/${aliceUid}/recommendationSignals/s1`).get());
    await rut.assertFails(strangerFs.doc(`users/${aliceUid}/recommendationSignals/s1`).get());
    await rut.assertFails(
      aliceFs.doc(`users/${aliceUid}/recommendationSignals/s2`).set({ type: 'x' })
    );
    await rut.assertSucceeds(aliceFs.doc(`users/${aliceUid}/signalRollups/2026-09-13`).get());
    await rut.assertFails(strangerFs.doc(`users/${aliceUid}/signalRollups/2026-09-13`).get());
    await rut.assertFails(
      aliceFs.doc(`users/${aliceUid}/signalRollups/2026-09-14`).set({ impressions: 1 })
    );

    // ---------- Mehfil RTDB: member gating, host-only removed ----------
    const chatId = 'mehfil_chat_1';
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const rtdb = ctx.database();
      await rtdb.ref(`mehfilMembers/${chatId}/${aliceUid}`).set(true);
      await rtdb.ref(`mehfilMembers/${chatId}/${friendUid}`).set(true);
      await rtdb.ref(`mehfil/${chatId}/roomHost`).set({ uid: aliceUid, at: Date.now() });
    });

    const aliceDb = alice.database();
    const friendDb = friend.database();
    const strangerDb = stranger.database();

    await rut.assertSucceeds(aliceDb.ref(`mehfil/${chatId}`).get());
    await rut.assertSucceeds(friendDb.ref(`mehfil/${chatId}`).get());
    await rut.assertFails(strangerDb.ref(`mehfil/${chatId}`).get());

    // Non-host cannot write removed/
    await rut.assertFails(
      friendDb.ref(`mehfil/${chatId}/removed/${strangerUid}`).set({
        by: friendUid,
        at: Date.now(),
        until: Date.now() + 60000,
      })
    );
    // Host can write removed/
    await rut.assertSucceeds(
      aliceDb.ref(`mehfil/${chatId}/removed/${strangerUid}`).set({
        by: aliceUid,
        at: Date.now(),
        until: Date.now() + 60000,
      })
    );

    // Member can set own role to speaker; stranger cannot
    await rut.assertSucceeds(
      friendDb.ref(`mehfil/${chatId}/roles/${friendUid}`).set({ role: 'speaker', at: Date.now() })
    );
    await rut.assertFails(
      strangerDb.ref(`mehfil/${chatId}/roles/${strangerUid}`).set({ role: 'speaker', at: Date.now() })
    );

    // Host can change another member's role
    await rut.assertSucceeds(
      aliceDb.ref(`mehfil/${chatId}/roles/${friendUid}`).set({ role: 'listener', at: Date.now() })
    );

    console.log(
      'PASS: users owner-only; journal/saved/likes/comment_activity; users_public PII+visibility; friend_projection; userModels/signals; mehfil RTDB'
    );
  } finally {
    await testEnv.cleanup();
  }
}

main().catch((e) => {
  console.error('FAIL:', e?.message || e);
  process.exit(1);
});
