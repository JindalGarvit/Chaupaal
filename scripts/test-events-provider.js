/**
 * Unit tests for curated local events provider (no network).
 * Run: node scripts/test-events-provider.js
 */
'use strict';
const assert = require('assert');
const { fetchLocalEvents, CITY_SEASONAL } = require('../server-lib/events-provider');

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

async function main() {
  await test('CITY_SEASONAL rows have ids, months, and copy', () => {
    assert.ok(CITY_SEASONAL.length >= 3);
    for (const row of CITY_SEASONAL) {
      assert.ok(row.id && row.title && row.text);
      assert.ok(Array.isArray(row.months) && row.months.length > 0);
      assert.ok(row.months.every((m) => m >= 1 && m <= 12));
    }
  });

  await test('city-scoped seasonal prompts match substrings and skip mismatches', async () => {
    // Mid-July UTC noon → IST still July (monsoon months).
    const date = new Date('2026-07-15T12:00:00Z');
    const mumbai = await fetchLocalEvents({ city: 'Mumbai', date, tz: 'Asia/Kolkata' });
    assert.ok(mumbai.some((e) => e.id === 'mumbai_rain'), 'mumbai rains for Mumbai');
    assert.ok(mumbai.some((e) => e.id === 'monsoon_chai'), 'global monsoon prompt');
    assert.ok(!mumbai.some((e) => e.id === 'winter_delhi'), 'no winter NCR in July');

    const delhi = await fetchLocalEvents({ city: 'New Delhi', date: new Date('2026-01-10T12:00:00Z'), tz: 'Asia/Kolkata' });
    assert.ok(delhi.some((e) => e.id === 'winter_delhi'), 'winter NCR for Delhi in Jan');
    assert.ok(!delhi.some((e) => e.id === 'mumbai_rain'), 'no Mumbai rains in Delhi winter');
  });

  await test('caps results at 5 and stamps curated sources', async () => {
    const out = await fetchLocalEvents({
      city: 'Bangalore',
      date: new Date('2026-07-15T12:00:00Z'),
      tz: 'Asia/Kolkata',
    });
    assert.ok(out.length <= 5);
    assert.ok(out.every((e) => e.source === 'curated_seasonal' || e.source === 'curated_festival'));
    assert.ok(out.every((e) => e.id && e.title && e.text));
  });

  await test('festival day includes curated_festival entry', async () => {
    // Republic Day — same UTC-noon trick as companion-outreach tests.
    const out = await fetchLocalEvents({
      city: 'Delhi',
      date: new Date('2026-01-26T12:00:00Z'),
      tz: 'Asia/Kolkata',
    });
    assert.ok(out.some((e) => e.id === 'festival_republic_day' && e.source === 'curated_festival'));
  });

  console.log('\nAll events-provider tests passed.');
}

main();
