/**
 * Unit tests for server-lib/gif-search (Klipy) — no live network.
 */
const assert = require('assert');
const {
  normalizeQuery,
  cacheDocIdForQuery,
  normalizeKlipyItem,
  normalizeKlipyResponse,
  isKlipyConfigured,
  searchGifs,
  klipyPerPage,
  MAX_LIMIT,
  TRENDING_DOC_ID,
} = require('../server-lib/gif-search');

async function test(name, fn) {
  await fn();
  console.log(`✓ ${name}`);
}

async function main() {
  await test('normalizeQuery lowercases and collapses whitespace', () => {
    assert.equal(normalizeQuery('  Hello   WORLD  '), 'hello world');
  });

  await test('normalizeQuery truncates long input', () => {
    assert.equal(normalizeQuery('x'.repeat(200)).length, 80);
  });

  await test('empty query maps to trending cache doc id', () => {
    assert.equal(cacheDocIdForQuery(''), TRENDING_DOC_ID);
    assert.equal(cacheDocIdForQuery('   '), TRENDING_DOC_ID);
  });

  await test('query cache doc id is stable and safe', () => {
    assert.equal(cacheDocIdForQuery('Thumbs Up!'), cacheDocIdForQuery('thumbs up'));
    assert.ok(cacheDocIdForQuery('lol').startsWith('q_'));
    assert.ok(!cacheDocIdForQuery('hi').includes('/'));
  });

  await test('klipyPerPage respects Klipy min 8 / our max 24', () => {
    assert.equal(klipyPerPage(1), 8);
    assert.equal(klipyPerPage(24), 24);
    assert.equal(klipyPerPage(99), 24);
  });

  await test('normalizeKlipyItem picks md gif + sm preview', () => {
    const item = normalizeKlipyItem({
      id: 42,
      title: 'Cat dance',
      file: {
        hd: { gif: { url: 'https://cdn.klipy.com/hd.gif', width: 400, height: 400 } },
        md: { gif: { url: 'https://cdn.klipy.com/md.gif', width: 300, height: 300 } },
        sm: { gif: { url: 'https://cdn.klipy.com/sm.gif', width: 220, height: 220 } },
      },
    });
    assert.deepStrictEqual(item, {
      id: '42',
      url: 'https://cdn.klipy.com/md.gif',
      previewUrl: 'https://cdn.klipy.com/sm.gif',
      width: 300,
      height: 300,
      title: 'Cat dance',
    });
  });

  await test('normalizeKlipyResponse reads nested data.data envelope', () => {
    const out = normalizeKlipyResponse({
      result: true,
      data: {
        data: [
          { id: 1, file: {} },
          {
            id: 2,
            title: 'ok',
            file: { md: { gif: { url: 'https://cdn.klipy.com/a.gif', width: 1, height: 1 } } },
          },
        ],
        current_page: 1,
        per_page: 24,
        has_next: false,
      },
    });
    assert.equal(out.length, 1);
    assert.equal(out[0].id, '2');
  });

  await test('MAX_LIMIT is capped at 24', () => {
    assert.equal(MAX_LIMIT, 24);
  });

  await test('isKlipyConfigured is false without KLIPY_API_KEY', () => {
    const prev = process.env.KLIPY_API_KEY;
    delete process.env.KLIPY_API_KEY;
    assert.equal(isKlipyConfigured(), false);
    process.env.KLIPY_API_KEY = '   ';
    assert.equal(isKlipyConfigured(), false);
    process.env.KLIPY_API_KEY = 'dummy-key-for-path-check';
    assert.equal(isKlipyConfigured(), true);
    if (prev === undefined) delete process.env.KLIPY_API_KEY;
    else process.env.KLIPY_API_KEY = prev;
  });

  await test('rate-limit registry includes gif_search at 30/min', () => {
    const { LIMITS } = require('../server-lib/rate-limit');
    assert.equal(LIMITS.gif_search.minute, 30);
    assert.equal(LIMITS.gif_search.hour, 300);
  });

  await test('searchGifs degrades open when KLIPY_API_KEY unset', async () => {
    const prev = process.env.KLIPY_API_KEY;
    delete process.env.KLIPY_API_KEY;
    const out = await searchGifs(null, { query: 'lol', limit: 10 });
    assert.equal(out.configured, false);
    assert.equal(out.source, 'unconfigured');
    assert.deepStrictEqual(out.results, []);
    if (prev === undefined) delete process.env.KLIPY_API_KEY;
    else process.env.KLIPY_API_KEY = prev;
  });

  await test('query cache avoids duplicate Klipy fetches within TTL', async () => {
    const prev = process.env.KLIPY_API_KEY;
    process.env.KLIPY_API_KEY = 'dummy-test-key';

    let klipyCalls = 0;
    const store = new Map();
    const FieldValue = { serverTimestamp: () => ({ _sv: true }) };
    const adminApp = {
      firestore() {
        return {
          collection(name) {
            assert.equal(name, 'gifCache');
            return {
              doc(id) {
                return {
                  async get() {
                    if (!store.has(id)) return { exists: false };
                    return { exists: true, data: () => store.get(id) };
                  },
                  async set(data) {
                    const prevDoc = store.get(id) || {};
                    store.set(id, { ...prevDoc, ...data });
                  },
                };
              },
            };
          },
          FieldValue,
        };
      },
    };
    adminApp.firestore.FieldValue = FieldValue;

    const origFetch = global.fetch;
    global.fetch = async (url) => {
      const u = String(url);
      assert.ok(u.includes('api.klipy.com'), 'must call Klipy host');
      assert.ok(u.includes('/api/v1/dummy-test-key/'), 'key in path, server-side only');
      assert.ok(u.includes('/gifs/search'), 'search path');
      klipyCalls += 1;
      return {
        ok: true,
        async json() {
          return {
            result: true,
            data: {
              data: [
                {
                  id: 1,
                  title: 'lol',
                  file: {
                    md: { gif: { url: 'https://cdn.klipy.com/md.gif', width: 10, height: 10 } },
                    sm: { gif: { url: 'https://cdn.klipy.com/sm.gif', width: 5, height: 5 } },
                  },
                },
              ],
              current_page: 1,
              per_page: 24,
              has_next: false,
            },
          };
        },
      };
    };

    try {
      const a = await searchGifs(adminApp, { query: 'LOL', limit: 8 });
      const b = await searchGifs(adminApp, { query: 'lol', limit: 8 });
      assert.equal(a.source, 'klipy');
      assert.equal(b.source, 'cache');
      assert.equal(b.cached, true);
      assert.equal(klipyCalls, 1, 'second identical query must hit cache');
      assert.equal(a.results[0].url, 'https://cdn.klipy.com/md.gif');
      assert.equal(a.results[0].previewUrl, 'https://cdn.klipy.com/sm.gif');
    } finally {
      global.fetch = origFetch;
      if (prev === undefined) delete process.env.KLIPY_API_KEY;
      else process.env.KLIPY_API_KEY = prev;
    }
  });

  console.log('\nAll gif-search (Klipy) tests passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
