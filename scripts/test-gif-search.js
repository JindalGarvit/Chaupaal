/**
 * Unit tests for server-lib/gif-search (Klipy) — no live network.
 */
const assert = require('assert');
const {
  normalizeQuery,
  cacheDocIdForQuery,
  kindCacheDocId,
  normalizeKind,
  normalizeKlipyItem,
  normalizeKlipyResponse,
  isKlipyConfigured,
  searchGifs,
  searchKlipyMedia,
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
    assert.equal(item.id, '42');
    assert.equal(item.kind, 'gif');
    assert.equal(item.url, 'https://cdn.klipy.com/md.gif');
    assert.equal(item.previewUrl, 'https://cdn.klipy.com/sm.gif');
    assert.equal(item.width, 300);
    assert.equal(item.height, 300);
    assert.equal(item.title, 'Cat dance');
    assert.equal(item.mime, 'image/gif');
  });

  await test('normalizeKind + kindCacheDocId separate namespaces', () => {
    assert.equal(normalizeKind('STICKERS'), 'sticker');
    assert.equal(kindCacheDocId('gif', ''), 'gif____trending__');
    assert.equal(kindCacheDocId('sticker', 'lol'), 'sticker__q_lol');
    assert.notEqual(kindCacheDocId('gif', 'lol'), kindCacheDocId('meme', 'lol'));
  });

  await test('sticker prefers webp; clip prefers mp4', () => {
    const sticker = normalizeKlipyItem(
      {
        id: 's1',
        title: 'Wave',
        file: {
          md: {
            webp: { url: 'https://cdn.klipy.com/s.webp', width: 100, height: 100 },
            gif: { url: 'https://cdn.klipy.com/s.gif', width: 100, height: 100 },
          },
        },
      },
      'sticker'
    );
    assert.equal(sticker.kind, 'sticker');
    assert.equal(sticker.url, 'https://cdn.klipy.com/s.webp');
    assert.equal(sticker.mime, 'image/webp');

    const clip = normalizeKlipyItem(
      {
        id: 'c1',
        title: 'Clip',
        duration: 2.5,
        file: {
          md: {
            mp4: { url: 'https://cdn.klipy.com/c.mp4', width: 320, height: 180 },
            jpg: { url: 'https://cdn.klipy.com/c.jpg', width: 160, height: 90 },
          },
          sm: { jpg: { url: 'https://cdn.klipy.com/c-sm.jpg', width: 80, height: 45 } },
        },
      },
      'clip'
    );
    assert.equal(clip.kind, 'clip');
    assert.equal(clip.url, 'https://cdn.klipy.com/c.mp4');
    assert.equal(clip.previewUrl, 'https://cdn.klipy.com/c-sm.jpg');
    assert.equal(clip.mime, 'video/mp4');
    assert.equal(clip.duration, 2.5);
  });

  await test('searchKlipyMedia degrades open for stickers when unset', async () => {
    const prev = process.env.KLIPY_API_KEY;
    delete process.env.KLIPY_API_KEY;
    const out = await searchKlipyMedia(null, { kind: 'sticker', query: 'hi' });
    assert.equal(out.configured, false);
    assert.equal(out.kind, 'sticker');
    assert.deepStrictEqual(out.results, []);
    if (prev === undefined) delete process.env.KLIPY_API_KEY;
    else process.env.KLIPY_API_KEY = prev;
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
            assert.ok(name === 'klipyCache' || name === 'gifCache', 'unexpected cache collection');
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
