/**
 * Unit tests for server-lib/payments — kill switch + validation (no Firestore).
 *
 * Does not exercise createPaymentIntent success paths (those need Admin/Firestore).
 * Confirms we never fake a charge when PAYMENTS_ENABLED is off.
 */
'use strict';
const assert = require('assert');
const {
  isPaymentsEnabled,
  confirmPayment,
  refund,
  sanitizeMeta,
  createPaymentIntent,
} = require('../server-lib/payments');

async function test(name, fn) {
  await fn();
  console.log(`✓ ${name}`);
}

async function main() {
  const prev = process.env.PAYMENTS_ENABLED;
  try {
    await test('isPaymentsEnabled defaults false and only accepts exact true', () => {
      delete process.env.PAYMENTS_ENABLED;
      assert.strictEqual(isPaymentsEnabled(), false);
      process.env.PAYMENTS_ENABLED = 'false';
      assert.strictEqual(isPaymentsEnabled(), false);
      process.env.PAYMENTS_ENABLED = '1';
      assert.strictEqual(isPaymentsEnabled(), false);
      process.env.PAYMENTS_ENABLED = ' true ';
      assert.strictEqual(isPaymentsEnabled(), true);
      process.env.PAYMENTS_ENABLED = 'true';
      assert.strictEqual(isPaymentsEnabled(), true);
    });

    await test('createPaymentIntent rejects missing uid/purpose without hitting Firebase', async () => {
      process.env.PAYMENTS_ENABLED = 'false';
      const a = await createPaymentIntent({ purpose: 'boost_post', amountPaise: 500 });
      assert.deepStrictEqual(a, { ok: false, status: 'invalid', message: 'uid and purpose required' });
      const b = await createPaymentIntent({ uid: 'u1', amountPaise: 500 });
      assert.strictEqual(b.ok, false);
      assert.strictEqual(b.status, 'invalid');
    });

    await test('createPaymentIntent rejects amount under 100 paise', async () => {
      process.env.PAYMENTS_ENABLED = 'false';
      const out = await createPaymentIntent({ uid: 'u1', purpose: 'boost_post', amountPaise: 99 });
      assert.deepStrictEqual(out, { ok: false, status: 'invalid', message: 'amount too small' });
      const zero = await createPaymentIntent({ uid: 'u1', purpose: 'boost_post', amountPaise: 'nope' });
      assert.strictEqual(zero.status, 'invalid');
    });

    await test('confirmPayment / refund refuse when kill switch is off', async () => {
      process.env.PAYMENTS_ENABLED = 'false';
      const c = await confirmPayment({ paymentId: 'pay_1' });
      assert.strictEqual(c.ok, false);
      assert.strictEqual(c.status, 'coming_soon');
      const r = await refund({ paymentId: 'pay_1' });
      assert.strictEqual(r.ok, false);
      assert.strictEqual(r.status, 'coming_soon');
    });

    await test('confirmPayment validates paymentId when enabled but unwired', async () => {
      process.env.PAYMENTS_ENABLED = 'true';
      const missing = await confirmPayment({});
      assert.deepStrictEqual(missing, { ok: false, status: 'invalid', message: 'paymentId required' });
      const unwired = await confirmPayment({ paymentId: 'pay_x' });
      assert.strictEqual(unwired.ok, false);
      assert.strictEqual(unwired.status, 'provider_not_wired');
    });

    await test('sanitizeMeta caps keys/values and drops unsafe types', () => {
      const meta = {
        ok: 'hello',
        n: 3,
        flag: true,
        nested: { a: 1 },
        arr: [1],
        long: 'x'.repeat(600),
      };
      for (let i = 0; i < 25; i++) meta[`k${i}`] = `v${i}`;
      const out = sanitizeMeta(meta);
      assert.strictEqual(out.ok, 'hello');
      assert.strictEqual(out.n, 3);
      assert.strictEqual(out.flag, true);
      assert.strictEqual(out.nested, undefined);
      assert.strictEqual(out.arr, undefined);
      assert.strictEqual(out.long.length, 500);
      assert.ok(Object.keys(out).length <= 20);
    });
  } finally {
    if (prev === undefined) delete process.env.PAYMENTS_ENABLED;
    else process.env.PAYMENTS_ENABLED = prev;
  }

  console.log('\nAll payments tests passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
