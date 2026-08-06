/**
 * Unit tests for live-location share expiry (in-memory Firestore stub).
 * Run: node scripts/test-live-location.js
 */
'use strict';
const assert = require('assert');
const { expireLiveLocationShares } = require('../server-lib/live-location');

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log('✓', name))
    .catch((e) => {
      console.error('✗', name);
      console.error(e);
      process.exitCode = 1;
    });
}

function makeDb(docs) {
  const writes = [];
  const snapDocs = docs.map((d) => ({
    id: d.id,
    ref: { id: d.id, path: `liveLocationShares/${d.id}` },
    data: () => ({ ...d.data }),
  }));
  return {
    writes,
    collection(name) {
      assert.strictEqual(name, 'liveLocationShares');
      return {
        where() {
          return this;
        },
        limit() {
          return this;
        },
        async get() {
          return { docs: snapDocs, size: snapDocs.length };
        },
      };
    },
    batch() {
      return {
        set(ref, patch, opts) {
          writes.push({ ref, patch, opts });
        },
        async commit() {
          writes._committed = true;
        },
      };
    },
  };
}

const admin = {
  firestore: {
    FieldValue: {
      serverTimestamp: () => 'SERVER_TS',
    },
  },
};

async function main() {
  await test('expires only past-due active shares and commits once', async () => {
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 3600_000);
    const db = makeDb([
      { id: 'old', data: { active: true, expiresAt: past } },
      {
        id: 'oldTs',
        data: {
          active: true,
          expiresAt: { toDate: () => past },
        },
      },
      { id: 'fresh', data: { active: true, expiresAt: future } },
      { id: 'noExp', data: { active: true } },
    ]);
    const out = await expireLiveLocationShares(db, admin, { limit: 40 });
    assert.strictEqual(out.scanned, 4);
    assert.strictEqual(out.expired, 2);
    assert.strictEqual(db.writes.length, 2);
    assert.strictEqual(db.writes._committed, true);
    for (const w of db.writes) {
      assert.strictEqual(w.patch.active, false);
      assert.strictEqual(w.patch.expired, true);
      assert.strictEqual(w.patch.stopReason, 'duration_elapsed');
      assert.strictEqual(w.patch.stoppedAt, 'SERVER_TS');
      assert.deepStrictEqual(w.opts, { merge: true });
    }
  });

  await test('no commit when nothing expired', async () => {
    const future = new Date(Date.now() + 3600_000);
    const db = makeDb([{ id: 'fresh', data: { active: true, expiresAt: future } }]);
    const out = await expireLiveLocationShares(db, admin);
    assert.strictEqual(out.expired, 0);
    assert.strictEqual(db.writes.length, 0);
    assert.strictEqual(db.writes._committed, undefined);
  });

  await test('ISO string expiresAt is accepted', async () => {
    const pastIso = new Date(Date.now() - 5_000).toISOString();
    const db = makeDb([{ id: 'iso', data: { active: true, expiresAt: pastIso } }]);
    const out = await expireLiveLocationShares(db, admin);
    assert.strictEqual(out.expired, 1);
    assert.strictEqual(db.writes[0].ref.id, 'iso');
  });

  console.log('\nAll live-location tests passed.');
}

main();
