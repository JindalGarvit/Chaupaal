/**
 * Unit tests for Open-Meteo weather bucket mapping (no network).
 */
const assert = require('assert');
const { weatherBucket } = require('../server-lib/weather');

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

test('weatherBucket maps WMO codes to coarse buckets', () => {
  assert.strictEqual(weatherBucket(0), 'clear');
  assert.strictEqual(weatherBucket(2), 'partly_cloudy');
  assert.strictEqual(weatherBucket(45), 'fog');
  assert.strictEqual(weatherBucket(48), 'fog');
  assert.strictEqual(weatherBucket(61), 'rain');
  assert.strictEqual(weatherBucket(80), 'rain');
  assert.strictEqual(weatherBucket(71), 'snow');
  assert.strictEqual(weatherBucket(85), 'snow');
  assert.strictEqual(weatherBucket(95), 'storm');
  assert.strictEqual(weatherBucket(99), 'storm');
});

test('weatherBucket handles unknown / non-finite codes', () => {
  assert.strictEqual(weatherBucket(undefined), 'unknown');
  assert.strictEqual(weatherBucket(NaN), 'unknown');
  assert.strictEqual(weatherBucket('x'), 'unknown');
  assert.strictEqual(weatherBucket(10), 'overcast');
});

console.log('\nweather unit tests passed.');
