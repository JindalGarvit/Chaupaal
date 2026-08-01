/**
 * Unit tests for server-lib/search-index (Chaupaal omnibox / search_query).
 * Uses an in-memory Firestore stub — no network.
 */
const assert = require('assert');
const { normalize, searchChaupaal, COLLECTORS } = require('../server-lib/search-index');

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`✓ ${name}`))
    .catch((e) => {
      console.error(`✗ ${name}`);
      console.error(e);
      process.exitCode = 1;
    });
}

/** Minimal chainable query stub. */
function makeDb(collections) {
  return {
    collection(name) {
      const rows = collections[name] || [];
      return {
        doc(id) {
          const hit = rows.find((r) => r.id === id);
          return {
            async get() {
              return {
                exists: !!hit,
                id,
                data: () => (hit ? { ...hit.data } : undefined),
              };
            },
          };
        },
        where() {
          return this;
        },
        orderBy() {
          return this;
        },
        startAt() {
          return this;
        },
        endAt() {
          return this;
        },
        limit(n) {
          this._limit = n;
          return this;
        },
        async get() {
          const docs = rows.slice(0, this._limit || rows.length).map((r) => ({
            id: r.id,
            data: () => ({ ...r.data }),
          }));
          return { docs, size: docs.length };
        },
      };
    },
  };
}

async function main() {
  await test('normalize trims, strips @, lowercases', () => {
    assert.strictEqual(normalize('  @Garvit  '), 'garvit');
    assert.strictEqual(normalize(''), '');
    assert.strictEqual(normalize(null), '');
  });

  await test('empty query returns empty categories without collectors', async () => {
    const out = await searchChaupaal({}, { query: '  ' });
    assert.strictEqual(out.query, '');
    assert.deepStrictEqual(out.categories, {});
    assert.strictEqual(out.degraded, false);
  });

  await test('games collector matches static catalog by name', async () => {
    const games = await COLLECTORS.games(null, 'chess', 8);
    assert.strictEqual(games.length, 1);
    assert.strictEqual(games[0].id, 'chess');
    assert.strictEqual(games[0].type, 'game');
    assert.strictEqual(games[0].score, 70);
  });

  await test('games collector is case-insensitive and limited', async () => {
    const all = await COLLECTORS.games(null, 'game', 2);
    assert.ok(all.length <= 2);
    assert.ok(all.every((g) => g.category === 'games'));
  });

  await test('users collector skips hiddenFromDiscovery and exact-matches username', async () => {
    const db = makeDb({
      usernames: [{ id: 'ria', data: { uid: 'u1' } }],
      users_public: [
        { id: 'u1', data: { name: 'Ria', username: 'ria', city: 'Pune', usernameLower: 'ria' } },
        {
          id: 'u2',
          data: {
            name: 'Hidden',
            username: 'riahidden',
            usernameLower: 'riahidden',
            hiddenFromDiscovery: true,
          },
        },
        { id: 'u3', data: { name: 'Rian', username: 'rian', usernameLower: 'rian' } },
      ],
    });
    const users = await COLLECTORS.users(db, 'ria', 10);
    assert.ok(users.some((u) => u.uid === 'u1' && u.score === 500));
    assert.ok(!users.some((u) => u.uid === 'u2'));
    assert.ok(users.some((u) => u.uid === 'u3' && u.score === 200));
  });

  await test('duniya/peepal collectors skip deleted and match haystack', async () => {
    const db = makeDb({
      duniyaPosts: [
        { id: 'd1', data: { text: 'Hello Chaupaal', authorName: 'A', deleted: false } },
        { id: 'd2', data: { text: 'Hello Chaupaal', softDeleted: true } },
        { id: 'd3', data: { caption: 'unrelated' } },
      ],
      peepalPosts: [
        { id: 'p1', data: { question: 'Best chaupaal tip?', deleted: false } },
        { id: 'p2', data: { question: 'Best tip?', deleted: true } },
      ],
    });
    const duniya = await COLLECTORS.duniya(db, 'chaupaal', 8);
    assert.strictEqual(duniya.length, 1);
    assert.strictEqual(duniya[0].id, 'd1');
    const peepal = await COLLECTORS.peepal(db, 'chaupaal', 8);
    assert.strictEqual(peepal.length, 1);
    assert.strictEqual(peepal[0].id, 'p1');
  });

  await test('searchChaupaal clamps limit and ignores unknown types', async () => {
    const out = await searchChaupaal(makeDb({}), {
      query: 'chess',
      types: ['games', 'nope'],
      limit: 99,
    });
    assert.strictEqual(out.query, 'chess');
    assert.ok(Array.isArray(out.categories.games));
    assert.ok(out.categories.games.length >= 1);
    assert.deepStrictEqual(out.categories.nope, []);
  });

  await test('searchChaupaal fans out default collectors', async () => {
    const out = await searchChaupaal(makeDb({}), { query: 'ludo' });
    assert.ok(out.categories.games);
    assert.ok(out.categories.users);
    assert.ok(out.categories.duniya);
    assert.ok(out.categories.peepal);
    assert.ok(out.categories.groups);
    assert.ok(out.categories.games.some((g) => g.id === 'ludo'));
  });

  if (process.exitCode) process.exit(process.exitCode);
  console.log('\nsearch-index unit tests passed.');
}

main();
