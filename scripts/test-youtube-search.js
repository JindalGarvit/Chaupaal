/**
 * Unit tests for server-lib/youtube-search — no live Google calls.
 */
const assert = require('assert');
const {
  normalizeYoutubeQuery,
  isRecQuery,
  ttlMsForQuery,
  isYoutubeConfigured,
  REC_QUERIES,
  USER_TTL_MS,
  REC_TTL_MS,
  searchYoutube,
} = require('../server-lib/youtube-search');

async function test(name, fn) {
  await fn();
  console.log(`✓ ${name}`);
}

async function main() {
  await test('normalizeYoutubeQuery trims, lowercases, collapses space', () => {
    assert.equal(normalizeYoutubeQuery('  Lofi   CHILL  '), 'lofi chill');
  });

  await test('normalizeYoutubeQuery truncates', () => {
    assert.equal(normalizeYoutubeQuery('x'.repeat(200)).length, 80);
  });

  await test('rec queries use longer TTL', () => {
    assert.ok(isRecQuery('lofi chill'));
    assert.equal(ttlMsForQuery('lofi chill'), REC_TTL_MS);
    assert.equal(ttlMsForQuery('random song xyz'), USER_TTL_MS);
    assert.ok(REC_QUERIES.includes('bollywood hits'));
  });

  await test('unset key returns configured:false without scraping', async () => {
    const prev = process.env.YOUTUBE_API_KEY;
    delete process.env.YOUTUBE_API_KEY;
    const out = await searchYoutube(null, { query: 'lofi' });
    assert.equal(out.configured, false);
    assert.equal(out.provider, null);
    assert.deepStrictEqual(out.results, []);
    assert.equal(out.cached, false);
    if (prev != null) process.env.YOUTUBE_API_KEY = prev;
  });

  await test('isYoutubeConfigured follows env', () => {
    const prev = process.env.YOUTUBE_API_KEY;
    delete process.env.YOUTUBE_API_KEY;
    assert.equal(isYoutubeConfigured(), false);
    if (prev != null) process.env.YOUTUBE_API_KEY = prev;
  });

  console.log('youtube-search tests passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
