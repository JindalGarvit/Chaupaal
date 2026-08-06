/**
 * Unit tests for auth permission guards (no Firebase Admin).
 * Run: node scripts/test-auth-guards.js
 */
'use strict';
const assert = require('assert');
const { assertSameUser, requireCronSecret } = require('../server-lib/auth');

function test(name, fn) {
  fn();
  console.log('✓', name);
}

function mockRes() {
  const calls = [];
  return {
    calls,
    status(code) {
      this._status = code;
      return this;
    },
    json(body) {
      calls.push({ status: this._status, body });
      return this;
    },
    setHeader() {
      return this;
    },
  };
}

test('assertSameUser allows matching uids', () => {
  const res = mockRes();
  assert.strictEqual(assertSameUser(res, 'u1', 'u1'), true);
  assert.strictEqual(res.calls.length, 0);
});

test('assertSameUser forbids mismatch / missing uids', () => {
  for (const [caller, target] of [
    ['u1', 'u2'],
    ['u1', ''],
    ['', 'u2'],
    [null, 'u1'],
    ['u1', null],
  ]) {
    const res = mockRes();
    assert.strictEqual(assertSameUser(res, caller, target), false);
    assert.strictEqual(res.calls[0].status, 403);
    assert.strictEqual(res.calls[0].body.error.code, 'FORBIDDEN');
  }
});

test('requireCronSecret rejects when CRON_SECRET unset', () => {
  const prev = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  try {
    const res = mockRes();
    assert.strictEqual(requireCronSecret({ headers: { authorization: 'Bearer x' } }, res), false);
    assert.strictEqual(res.calls[0].status, 503);
    assert.strictEqual(res.calls[0].body.error.code, 'CRON_NOT_CONFIGURED');
  } finally {
    if (prev != null) process.env.CRON_SECRET = prev;
    else delete process.env.CRON_SECRET;
  }
});

test('requireCronSecret accepts exact Bearer secret and rejects others', () => {
  const prev = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'test-cron-secret';
  try {
    const ok = mockRes();
    assert.strictEqual(
      requireCronSecret({ headers: { authorization: 'Bearer test-cron-secret' } }, ok),
      true
    );
    assert.strictEqual(ok.calls.length, 0);

    const bad = mockRes();
    assert.strictEqual(requireCronSecret({ headers: { authorization: 'Bearer nope' } }, bad), false);
    assert.strictEqual(bad.calls[0].status, 401);
    assert.strictEqual(bad.calls[0].body.error.code, 'UNAUTHORIZED');

    const missing = mockRes();
    assert.strictEqual(requireCronSecret({ headers: {} }, missing), false);
    assert.strictEqual(missing.calls[0].status, 401);
  } finally {
    if (prev != null) process.env.CRON_SECRET = prev;
    else delete process.env.CRON_SECRET;
  }
});

console.log('\nAll auth-guards tests passed.');
