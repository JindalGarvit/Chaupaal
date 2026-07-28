/**
 * Heuristic URL safety checks (no Web Risk network).
 * Run: node scripts/test-url-safety.js
 */
const assert = require('assert');
const { heuristicCheck } = require('../server-lib/url-safety');

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

test('valid ordinary URL passes heuristically (unchecked)', () => {
  const r = heuristicCheck('https://example.com/article/hello');
  assert.strictEqual(r.safe, true);
  assert.strictEqual(r.checked, false);
  assert.strictEqual(r.reason, 'heuristic_pass');
});

test('suspicious TLDs flagged', () => {
  const r = heuristicCheck('https://free-stuff.tk/claim');
  assert.strictEqual(r.safe, false);
  assert.strictEqual(r.threat, 'SUSPICIOUS');
});

test('phishing-ish path patterns flagged', () => {
  const r = heuristicCheck('https://evil.example/verify-account?next=1');
  assert.strictEqual(r.safe, false);
  assert.ok(r.reason === 'heuristic');
});

test('invalid URL rejected', () => {
  const r = heuristicCheck('not a url');
  assert.strictEqual(r.safe, false);
  assert.strictEqual(r.threat, 'INVALID');
});

test('absurdly long hostname label flagged', () => {
  const label = 'a'.repeat(45);
  const r = heuristicCheck(`https://${label}.com/`);
  assert.strictEqual(r.safe, false);
});

console.log(process.exitCode ? '\nURL safety tests failed.' : '\nURL safety tests passed.');
