/**
 * Rate-limit LIMITS registry shape (no Upstash network).
 * Run: node scripts/test-rate-limit.js
 */
'use strict';
const assert = require('assert');
const { LIMITS, checkActionRateLimit } = require('../server-lib/rate-limit');

async function test(name, fn) {
  await fn();
  console.log(`✓ ${name}`);
}

async function main() {
  await test('LIMITS covers core social + AI + gif_search', () => {
    for (const key of ['like', 'follow', 'message', 'comment', 'post', 'ai', 'media_lookup', 'gif_search']) {
      assert.ok(LIMITS[key], `missing LIMITS.${key}`);
      assert.ok(LIMITS[key].minute > 0);
      assert.ok(LIMITS[key].hour >= LIMITS[key].minute);
    }
  });

  await test('gif_search and ai stay within documented bounds', () => {
    assert.equal(LIMITS.gif_search.minute, 30);
    assert.equal(LIMITS.gif_search.hour, 300);
    assert.equal(LIMITS.ai.minute, 10);
    assert.equal(LIMITS.ai.hour, 120);
  });

  await test('unknown action allows without Redis', async () => {
    const out = await checkActionRateLimit('uid1', 'not_a_real_action');
    assert.equal(out.ok, true);
  });

  await test('known action without Redis degrades open', async () => {
    const prevUrl = process.env.UPSTASH_REDIS_REST_URL;
    const prevTok = process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    try {
      const out = await checkActionRateLimit('uid1', 'gif_search');
      assert.equal(out.ok, true);
      assert.equal(out.configured, false);
    } finally {
      if (prevUrl != null) process.env.UPSTASH_REDIS_REST_URL = prevUrl;
      else delete process.env.UPSTASH_REDIS_REST_URL;
      if (prevTok != null) process.env.UPSTASH_REDIS_REST_TOKEN = prevTok;
      else delete process.env.UPSTASH_REDIS_REST_TOKEN;
    }
  });

  console.log('\nAll rate-limit tests passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
