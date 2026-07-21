/**
 * Unified Chaupaal payments module — SINGLE ledger for all paid features.
 *
 * Interface (stable):
 *   createPaymentIntent({ uid, purpose, amountPaise, currency, meta })
 *   confirmPayment({ paymentId, providerRef })
 *   getPaymentStatus({ paymentId })
 *   refund({ paymentId, reason })
 *
 * Purpose tags (examples): boost_post | premium_subscription | companion_gift
 *
 * IMPORTANT — this pass is scaffold only:
 * - PAYMENTS_ENABLED kill switch defaults to false (env PAYMENTS_ENABLED !== 'true')
 * - No live processor is wired. Expected later: Razorpay / UPI for India.
 * - Never simulate a successful charge while the kill switch is off.
 * - Every future payment feature MUST write through chaupaalTransactions via this module.
 */

const { initAdmin } = require('./auth');

function isPaymentsEnabled() {
  return String(process.env.PAYMENTS_ENABLED || '').trim() === 'true';
}

function getDb() {
  const admin = initAdmin();
  if (!admin) throw new Error('Firebase Admin not configured');
  return { admin, db: admin.firestore() };
}

/**
 * @param {object} opts
 * @param {string} opts.uid
 * @param {string} opts.purpose  e.g. boost_post, premium_subscription, companion_gift
 * @param {number} opts.amountPaise
 * @param {string} [opts.currency='INR']
 * @param {object} [opts.meta]
 * @returns {Promise<{ok:boolean, status:string, paymentId?:string, comingSoon?:boolean, message?:string}>}
 */
async function createPaymentIntent(opts = {}) {
  const uid = String(opts.uid || '').trim();
  const purpose = String(opts.purpose || '').trim().slice(0, 64);
  const amountPaise = Math.floor(Number(opts.amountPaise) || 0);
  const currency = String(opts.currency || 'INR').slice(0, 8);
  const meta = opts.meta && typeof opts.meta === 'object' ? opts.meta : {};

  if (!uid || !purpose) {
    return { ok: false, status: 'invalid', message: 'uid and purpose required' };
  }
  if (amountPaise < 100) {
    return { ok: false, status: 'invalid', message: 'amount too small' };
  }

  // Kill switch — honest "coming soon", never fake a charge
  if (!isPaymentsEnabled()) {
    const { db } = getDb();
    const ref = await db.collection('chaupaalTransactions').add({
      uid,
      purpose,
      amountPaise,
      currency,
      status: 'coming_soon',
      provider: 'scaffold',
      // Future Razorpay/UPI fields: providerOrderId, providerPaymentId, signature
      meta: sanitizeMeta(meta),
      createdAt: new Date(),
      updatedAt: new Date(),
      note: 'PAYMENTS_ENABLED=false — ledger row recorded, no charge attempted',
    });
    return {
      ok: true,
      status: 'coming_soon',
      paymentId: ref.id,
      comingSoon: true,
      message: 'Payments coming soon — nothing was charged.',
    };
  }

  // ── Live processor hook (Razorpay/UPI) ──────────────────────────────────
  // When PAYMENTS_ENABLED=true, create a Razorpay order here, persist
  // providerOrderId on the chaupaalTransactions doc, and return checkout params.
  // Do NOT implement until keys + webhook are ready.
  const { db } = getDb();
  const ref = await db.collection('chaupaalTransactions').add({
    uid,
    purpose,
    amountPaise,
    currency,
    status: 'pending_provider',
    provider: 'razorpay_pending',
    meta: sanitizeMeta(meta),
    createdAt: new Date(),
    updatedAt: new Date(),
    note: 'PAYMENTS_ENABLED but processor not wired — pending provider integration',
  });
  return {
    ok: false,
    status: 'provider_not_wired',
    paymentId: ref.id,
    message: 'Payment processor not wired yet. Nothing was charged.',
  };
}

async function confirmPayment(opts = {}) {
  if (!isPaymentsEnabled()) {
    return { ok: false, status: 'coming_soon', message: 'Payments not live — cannot confirm.' };
  }
  const paymentId = String(opts.paymentId || '').trim();
  if (!paymentId) return { ok: false, status: 'invalid', message: 'paymentId required' };
  // Future: verify Razorpay signature, mark chaupaalTransactions status=paid
  return { ok: false, status: 'provider_not_wired', message: 'Confirm not available yet.' };
}

async function getPaymentStatus(opts = {}) {
  const paymentId = String(opts.paymentId || '').trim();
  if (!paymentId) return { ok: false, status: 'invalid' };
  const { db } = getDb();
  const snap = await db.collection('chaupaalTransactions').doc(paymentId).get();
  if (!snap.exists) return { ok: false, status: 'not_found' };
  const d = snap.data() || {};
  return {
    ok: true,
    paymentId,
    status: d.status || 'unknown',
    purpose: d.purpose,
    amountPaise: d.amountPaise,
    comingSoon: d.status === 'coming_soon',
  };
}

async function refund(opts = {}) {
  if (!isPaymentsEnabled()) {
    return { ok: false, status: 'coming_soon', message: 'Payments not live — cannot refund.' };
  }
  // Future: Razorpay refund API → update chaupaalTransactions
  return { ok: false, status: 'provider_not_wired', message: 'Refunds not available yet.' };
}

function sanitizeMeta(meta) {
  const out = {};
  Object.keys(meta || {})
    .slice(0, 20)
    .forEach((k) => {
      const key = String(k).slice(0, 40);
      const v = meta[k];
      if (v == null) return;
      if (typeof v === 'string') out[key] = v.slice(0, 500);
      else if (typeof v === 'number' || typeof v === 'boolean') out[key] = v;
    });
  return out;
}

module.exports = {
  isPaymentsEnabled,
  createPaymentIntent,
  confirmPayment,
  getPaymentStatus,
  refund,
};
