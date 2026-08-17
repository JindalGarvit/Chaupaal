/**
 * Recovery chip snooze + noise filters (runtime-guard.js).
 */
const store = {};
const memory = {};

global.window = global;
global.document = {
  documentElement: {
    classList: { contains: () => false, remove() {} },
    style: { setProperty() {} },
  },
  head: { appendChild() {} },
  body: {},
  hidden: false,
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({
    style: {},
    classList: { add() {}, remove() {} },
    dataset: {},
    setAttribute() {},
    addEventListener() {},
    querySelector: () => null,
    prepend() {},
  }),
  addEventListener() {},
};
global.location = { pathname: '/', search: '', reload() {} };
global.navigator = { userAgent: 'test', standalone: false };
global.matchMedia = () => ({ matches: false });
global.addEventListener = () => {};
global.window.addEventListener = () => {};
global.sessionStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => {
    store[k] = String(v);
  },
  removeItem: (k) => {
    delete store[k];
  },
};
global.localStorage = {
  getItem: (k) => (k in memory ? memory[k] : null),
  setItem: (k, v) => {
    memory[k] = String(v);
  },
  removeItem: (k) => {
    delete memory[k];
  },
};

const {
  isNoiseClientError,
  isRecoverySnoozed,
  snoozeRecovery,
  readRecoverySnooze,
  errorSignature,
} = require('../public/src/js/core/runtime-guard.js');

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
  console.log('✓', msg);
}

assert(isNoiseClientError('ResizeObserver loop limit exceeded'), 'ResizeObserver is noise');
assert(isNoiseClientError('Script error.'), 'Script error. is noise');
assert(isNoiseClientError('The user aborted a request', '', 'fetch'), 'AbortError is noise');
assert(isNoiseClientError('Failed to fetch'), 'Failed to fetch is noise');
assert(isNoiseClientError('Missing or insufficient permissions.'), 'permission-denied is noise');
assert(isNoiseClientError('429 Too Many Requests'), '429 is noise');
assert(isNoiseClientError('Load failed', 'safari-web-extension://abc'), 'extension URL is noise');
assert(!isNoiseClientError('baithakChats is not defined'), 'real ReferenceError is not noise');

{
  const sig = errorSignature('boom', 'at foo.js:1', 'unhandledrejection');
  assert(!isRecoverySnoozed(sig), 'fresh signature is not snoozed');
  snoozeRecovery(sig);
  const saved = readRecoverySnooze();
  assert(saved.signatures.includes(sig), 'tap stores signature');
  assert(saved.until > Date.now(), 'global cooldown is in the future');
  assert(isRecoverySnoozed(sig), 'same signature stays snoozed this session');
  assert(isRecoverySnoozed('other::later'), 'global cooldown blocks any chip');
}

{
  store.chaupaal_recovery_snooze = JSON.stringify({
    until: Date.now() - 1000,
    signatures: ['old::sig'],
    dismissedAt: Date.now() - 20 * 60 * 1000,
  });
  assert(isRecoverySnoozed('old::sig'), 'old signature stays snoozed after cooldown');
  assert(!isRecoverySnoozed('new::crash'), 'new signature allowed after cooldown expires');
}

console.log('runtime-guard tests ok');
