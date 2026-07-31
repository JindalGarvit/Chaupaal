/**
 * Unit tests for server-lib/http — shared API envelope helpers (no network).
 */
'use strict';
const assert = require('assert');
const {
  sendSuccess,
  sendError,
  requireMethod,
  parseJsonBody,
  getBearerToken,
} = require('../server-lib/http');

function mockRes() {
  const headers = {};
  return {
    statusCode: null,
    body: null,
    headers,
    setHeader(k, v) {
      headers[k] = v;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function test(name, fn) {
  fn();
  console.log(`✓ ${name}`);
}

function main() {
  test('parseJsonBody returns {} for empty/null', () => {
    assert.deepStrictEqual(parseJsonBody({ body: null }), {});
    assert.deepStrictEqual(parseJsonBody({ body: '' }), {});
    assert.deepStrictEqual(parseJsonBody({ body: undefined }), {});
  });

  test('parseJsonBody parses JSON strings and passes objects through', () => {
    assert.deepStrictEqual(parseJsonBody({ body: '{"a":1}' }), { a: 1 });
    const obj = { action: 'x' };
    assert.strictEqual(parseJsonBody({ body: obj }), obj);
  });

  test('parseJsonBody throws INVALID_JSON on bad strings', () => {
    assert.throws(
      () => parseJsonBody({ body: '{bad' }),
      (err) => err && err.code === 'INVALID_JSON'
    );
  });

  test('parseJsonBody rejects non-object non-string bodies as {}', () => {
    assert.deepStrictEqual(parseJsonBody({ body: 42 }), {});
  });

  test('getBearerToken extracts token; rejects missing/malformed', () => {
    assert.strictEqual(getBearerToken({ headers: { authorization: 'Bearer abc.def' } }), 'abc.def');
    assert.strictEqual(getBearerToken({ headers: { Authorization: 'Bearer tok' } }), 'tok');
    assert.strictEqual(getBearerToken({ headers: { authorization: 'Bearer   ' } }), null);
    assert.strictEqual(getBearerToken({ headers: { authorization: 'Basic x' } }), null);
    assert.strictEqual(getBearerToken({ headers: {} }), null);
  });

  test('requireMethod allows listed verbs and 405s others', () => {
    const okRes = mockRes();
    assert.strictEqual(requireMethod({ method: 'POST' }, okRes, ['POST', 'GET']), true);

    const badRes = mockRes();
    assert.strictEqual(requireMethod({ method: 'DELETE' }, badRes, 'POST'), false);
    assert.strictEqual(badRes.statusCode, 405);
    assert.strictEqual(badRes.headers.Allow, 'POST');
    assert.strictEqual(badRes.body.ok, false);
    assert.strictEqual(badRes.body.error.code, 'METHOD_NOT_ALLOWED');
  });

  test('sendSuccess / sendError shape the Phase 5 envelope', () => {
    const ok = mockRes();
    sendSuccess(ok, { id: 1 }, { status: 201, meta: { page: 1 }, headers: { 'X-Test': '1' } });
    assert.strictEqual(ok.statusCode, 201);
    assert.strictEqual(ok.headers['X-Test'], '1');
    assert.deepStrictEqual(ok.body, { ok: true, data: { id: 1 }, meta: { page: 1 } });

    const err = mockRes();
    sendError(err, 400, 'VALIDATION_ERROR', 'bad input', { field: 'uid' });
    assert.strictEqual(err.statusCode, 400);
    assert.deepStrictEqual(err.body, {
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'bad input', details: { field: 'uid' } },
    });
  });

  console.log('\nAll http tests passed.');
}

main();
