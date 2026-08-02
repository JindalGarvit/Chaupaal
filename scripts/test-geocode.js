/**
 * Unit tests for geocode cache key normalization (no Nominatim network).
 * Run: node scripts/test-geocode.js
 */
'use strict';
const assert = require('assert');
const { cacheKey, searchPlaces } = require('../server-lib/geocode');

function test(name, fn) {
  const result = fn();
  if (result && typeof result.then === 'function') {
    return result.then(() => console.log('✓', name));
  }
  console.log('✓', name);
  return Promise.resolve();
}

async function main() {
  await test('cacheKey trims, lowercases, collapses whitespace, and caps length', () => {
    assert.strictEqual(cacheKey('  Connaught   Place  '), 'connaught place');
    assert.strictEqual(cacheKey(null), '');
    assert.strictEqual(cacheKey(undefined), '');
    const long = 'a'.repeat(200);
    assert.strictEqual(cacheKey(long).length, 120);
  });

  await test('cacheKey is stable for equivalent queries (cache hit identity)', () => {
    assert.strictEqual(cacheKey('Delhi'), cacheKey('  delhi '));
    assert.strictEqual(cacheKey('New\tDelhi'), cacheKey('new delhi'));
  });

  await test('searchPlaces short-circuits queries under 2 chars without network', async () => {
    const empty = await searchPlaces(' ');
    assert.deepStrictEqual(empty, { results: [] });
    const one = await searchPlaces('a');
    assert.deepStrictEqual(one, { results: [] });
  });

  console.log('\nAll geocode tests passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
