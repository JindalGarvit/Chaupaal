/**
 * Dangal D4 secrecy sweep against the RTDB emulator (the "non-owner devtools" check).
 * For every games/{type} path in firebase/database.rules.json (plus the $gameType wildcard):
 *   a seated player can never read another player's secrets, the server node (deck order, roles,
 *   words, chits, titles, votes, answers, kick / dive choices) or the whole room in one read;
 *   a stranger can't read any of it either; nobody can write a secret or the server node.
 * Run via: npm run test:rules (firebase emulators:exec --only firestore,database …)
 */
'use strict';

const fs = require('fs');
const path = require('path');

async function main() {
  const rut = require('@firebase/rules-unit-testing');
  const databaseRules = fs.readFileSync(path.join(__dirname, '..', 'firebase', 'database.rules.json'), 'utf8');
  const rules = JSON.parse(databaseRules).rules;
  const testEnv = await rut.initializeTestEnvironment({
    projectId: 'demo-chaupaal-privacy',
    database: { rules: databaseRules, host: '127.0.0.1', port: 9000 },
  });
  const A = 'owner_secret_a';
  const B = 'seated_peer_b';
  const C = 'stranger_c';
  const skip = new Set(['scribble_canvas', 'badmintonQueue', '$gameType']);
  const types = Object.keys(rules.games || {}).filter((t) => !skip.has(t)).concat(['zz_future_game']);
  let checks = 0;
  let allowed = 0;
  const fails = [];
  const expectDenied = async (label, p) => {
    checks += 1;
    try {
      await rut.assertFails(p);
    } catch (e) {
      fails.push(label);
    }
  };
  try {
    for (const t of types) {
      const base = `games/${t}/D4ROOM`;
      await testEnv.withSecurityRulesDisabled((ctx) =>
        ctx.database().ref(base).set({
          pub: { host: A, status: 'playing', players: { [A]: { name: 'A' }, [B]: { name: 'B' } }, state: { phase: 'x' } },
          presence: { [A]: { at: 1 }, [B]: { at: 1 } },
          secrets: { [A]: { word: 'SECRET-A', role: 'wolf', hand: ['AS', 'KH'] }, [B]: { word: 'SECRET-B' } },
          server: { deck: ['2C', '3D'], roles: { [A]: 'wolf' }, votes: { [B]: A }, answer: 2, kick: 'left' },
        })
      );
      const b = testEnv.authenticatedContext(B).database();
      const c = testEnv.authenticatedContext(C).database();
      const a = testEnv.authenticatedContext(A).database();
      await expectDenied(t + ': peer reads another player’s secrets', b.ref(`${base}/secrets/${A}`).get());
      await expectDenied(t + ': peer reads the secrets node', b.ref(`${base}/secrets`).get());
      await expectDenied(t + ': peer reads the server node', b.ref(`${base}/server`).get());
      await expectDenied(t + ': peer reads the whole room', b.ref(base).get());
      await expectDenied(t + ': stranger reads secrets', c.ref(`${base}/secrets/${A}`).get());
      await expectDenied(t + ': stranger reads the server node', c.ref(`${base}/server`).get());
      await expectDenied(t + ': stranger reads the whole room', c.ref(base).get());
      await expectDenied(t + ': owner writes their own secret', a.ref(`${base}/secrets/${A}/word`).set('x'));
      await expectDenied(t + ': owner writes the server node', a.ref(`${base}/server/deck`).set([]));
      await expectDenied(t + ': peer writes pub state', b.ref(`${base}/pub/state`).set({ phase: 'won' }));
      // Positive controls: the rules aren't just "deny everything".
      const node = (rules.games[t] || rules.games.$gameType || {}).$code || {};
      if (node.secrets) {
        allowed += 1;
        try {
          await rut.assertSucceeds(a.ref(`${base}/secrets/${A}`).get());
        } catch (e) {
          fails.push(t + ': owner can read their own secret');
        }
      }
      if (node.pub && node.pub['.read']) {
        allowed += 1;
        try {
          await rut.assertSucceeds(b.ref(`${base}/pub`).get());
        } catch (e) {
          fails.push(t + ': a seated player can read pub');
        }
      }
    }
    await expectDenied('root read', testEnv.authenticatedContext(B).database().ref('games').get());
  } finally {
    await testEnv.cleanup();
  }
  if (fails.length) {
    console.error('FAIL (' + fails.length + '/' + checks + '):\n  ' + fails.join('\n  '));
    process.exit(1);
  }
  if (allowed < 15) {
    console.error('FAIL: only ' + allowed + ' positive controls ran');
    process.exit(1);
  }
  console.log('PASS: Dangal RTDB secrecy — ' + checks + ' denials + ' + allowed + ' allowed reads across ' + types.length + ' game paths (secrets, server, whole-room, stranger, writes)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
