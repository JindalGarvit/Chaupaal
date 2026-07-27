/**
 * API input validators (abuse / cost bounds).
 * Run: node scripts/test-validate.js
 */
const assert = require('assert');
const {
  asString,
  asInt,
  asEnum,
  asBoolean,
  isPlainObject,
  validateAnthropicBody,
} = require('../server-lib/validate');

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

test('asString trims and enforces length', () => {
  assert.strictEqual(asString('  hi  ', { max: 10, min: 1 }), 'hi');
  assert.strictEqual(asString('', { min: 1 }), null);
  assert.strictEqual(asString('abcdef', { max: 3 }), null);
  assert.strictEqual(asString(12), null);
});

test('asInt floors and bounds', () => {
  assert.strictEqual(asInt('7', { min: 1, max: 10 }), 7);
  assert.strictEqual(asInt(3.9, { min: 1, max: 10 }), 3);
  assert.strictEqual(asInt(0, { min: 1 }), null);
  assert.strictEqual(asInt('nope'), null);
});

test('asEnum / asBoolean / isPlainObject', () => {
  assert.strictEqual(asEnum('a', ['a', 'b']), 'a');
  assert.strictEqual(asEnum('c', ['a', 'b']), null);
  assert.strictEqual(asBoolean(true), true);
  assert.strictEqual(asBoolean('true'), null);
  assert.strictEqual(isPlainObject({}), true);
  assert.strictEqual(isPlainObject([]), false);
  assert.strictEqual(isPlainObject(null), false);
});

test('validateAnthropicBody requires model + messages', () => {
  assert.strictEqual(validateAnthropicBody(null).ok, false);
  assert.strictEqual(validateAnthropicBody({}).ok, false);
  const ok = validateAnthropicBody({
    model: 'claude-test',
    messages: [{ role: 'user', content: 'hi' }],
  });
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.value.max_tokens, 1024);
});

test('validateAnthropicBody rejects oversized message lists and tokens', () => {
  const many = {
    model: 'm',
    messages: Array.from({ length: 41 }, () => ({ role: 'user', content: 'x' })),
  };
  assert.ok(validateAnthropicBody(many).message.includes('40'));
  const badTokens = {
    model: 'm',
    messages: [{ role: 'user', content: 'x' }],
    max_tokens: 99999,
  };
  assert.strictEqual(validateAnthropicBody(badTokens).ok, false);
});

console.log(process.exitCode ? '\nValidate tests failed.' : '\nValidate tests passed.');
