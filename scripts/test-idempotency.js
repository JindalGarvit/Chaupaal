/**
 * In-memory idempotency helper (no Upstash).
 * Run: node scripts/test-idempotency.js
 */
'use strict';
const assert = require('assert');
const {
  getIdempotencyKey,
  beginIdempotent,
  completeIdempotent,
  abortIdempotent,
} = require('../server-lib/idempotency');

function test(name, fn) {
  try {
    fn();
    console.log('✓', name);
  } catch (e) {
    console.error('✗', name);
    console.error(e);
    process.exitCode = 1;
  }
}

test('getIdempotencyKey reads common headers and caps length', () => {
  assert.strictEqual(getIdempotencyKey({ headers: {} }), null);
  assert.strictEqual(getIdempotencyKey({ headers: { 'idempotency-key': '  abc  ' } }), 'abc');
  assert.strictEqual(getIdempotencyKey({ headers: { 'Idempotency-Key': 'x' } }), 'x');
  assert.strictEqual(getIdempotencyKey({ headers: { 'x-idempotency-key': 'y' } }), 'y');
  const long = 'k'.repeat(200);
  assert.strictEqual(getIdempotencyKey({ headers: { 'idempotency-key': long } }).length, 128);
});

test('begin → complete replays cached response; in-flight conflicts', () => {
  const key = `k-${Date.now()}-${Math.random()}`;
  const first = beginIdempotent('/api/test', 'u1', key);
  assert.ok(first && first.pending && first.id);
  const conflict = beginIdempotent('/api/test', 'u1', key);
  assert.deepStrictEqual(conflict, { conflict: true });
  completeIdempotent(first, 200, { ok: true });
  const replay = beginIdempotent('/api/test', 'u1', key);
  assert.deepStrictEqual(replay, { replay: true, status: 200, body: { ok: true } });
});

test('abort clears pending so the key can be reused', () => {
  const key = `abort-${Date.now()}-${Math.random()}`;
  const handle = beginIdempotent('/api/test', 'u2', key);
  abortIdempotent(handle);
  const again = beginIdempotent('/api/test', 'u2', key);
  assert.ok(again && again.pending);
});

test('missing key is a no-op', () => {
  assert.strictEqual(beginIdempotent('/api/test', 'u1', null), null);
  assert.strictEqual(beginIdempotent('/api/test', 'u1', ''), null);
});

console.log(process.exitCode ? '\nIdempotency tests failed.' : '\nIdempotency tests passed.');
