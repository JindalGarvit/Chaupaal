/**
 * Chaupaal Money — prepaid in-app balance (NOT Dangal chips).
 * Firestore: users/{uid}/wallet/chaupaalMoney, users/{uid}/moneyTransactions/*
 */
const MONEY_DOC = 'chaupaalMoney';

function moneyRef(db, uid) {
  return db.collection('users').doc(uid).collection('wallet').doc(MONEY_DOC);
}

function txCol(db, uid) {
  return db.collection('users').doc(uid).collection('moneyTransactions');
}

async function getBalance(db, uid) {
  const snap = await moneyRef(db, uid).get();
  const data = snap.exists ? snap.data() || {} : {};
  return {
    balance: Math.max(0, Number(data.balance) || 0),
    lifetimeTopUp: Math.max(0, Number(data.lifetimeTopUp) || 0),
    currency: String(data.currency || 'INR'),
  };
}

async function appendTx(db, admin, uid, { type, amount, reason, refId, balanceAfter }) {
  await txCol(db, uid).add({
    type: String(type || 'unknown').slice(0, 40),
    amount: Number(amount) || 0,
    reason: String(reason || '').slice(0, 120),
    refId: refId ? String(refId).slice(0, 120) : null,
    balanceAfter: Number(balanceAfter) || 0,
    at: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function creditTopUp(db, admin, uid, amount, paymentRef, currency) {
  const amt = Math.round(Number(amount) || 0);
  if (amt <= 0) throw new Error('INVALID_AMOUNT');
  const refId = String(paymentRef || '').slice(0, 120);
  if (!refId) throw new Error('PAYMENT_REF_REQUIRED');

  const dup = await txCol(db, uid)
    .where('refId', '==', refId)
    .where('type', '==', 'topup')
    .limit(1)
    .get();
  if (!dup.empty) {
    const bal = await getBalance(db, uid);
    return { ...bal, duplicate: true };
  }

  const ref = moneyRef(db, uid);
  let balanceAfter = 0;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists ? snap.data() || {} : {};
    balanceAfter = Math.max(0, Number(prev.balance) || 0) + amt;
    tx.set(
      ref,
      {
        balance: balanceAfter,
        lifetimeTopUp: Math.max(0, Number(prev.lifetimeTopUp) || 0) + amt,
        currency: currency || prev.currency || 'INR',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  await appendTx(db, admin, uid, {
    type: 'topup',
    amount: amt,
    reason: 'top_up',
    refId,
    balanceAfter,
  });

  return getBalance(db, uid);
}

async function spend(db, admin, uid, amount, reason, refId) {
  const amt = Math.round(Number(amount) || 0);
  if (amt <= 0) throw new Error('INVALID_AMOUNT');
  const ref = moneyRef(db, uid);
  let balanceAfter = 0;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists ? snap.data() || {} : {};
    const balance = Math.max(0, Number(prev.balance) || 0);
    if (balance < amt) throw new Error('INSUFFICIENT_FUNDS');
    balanceAfter = balance - amt;
    tx.set(
      ref,
      {
        balance: balanceAfter,
        lifetimeTopUp: Math.max(0, Number(prev.lifetimeTopUp) || 0),
        currency: prev.currency || 'INR',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  await appendTx(db, admin, uid, {
    type: 'spend',
    amount: -amt,
    reason: String(reason || 'purchase').slice(0, 120),
    refId: refId ? String(refId).slice(0, 120) : null,
    balanceAfter,
  });

  return { balance: balanceAfter, spent: amt };
}

async function listTransactions(db, uid, limit = 20) {
  const snap = await txCol(db, uid).orderBy('at', 'desc').limit(Math.min(limit, 50)).get();
  return snap.docs.map((doc) => {
    const d = doc.data() || {};
    return {
      id: doc.id,
      type: d.type,
      amount: Number(d.amount) || 0,
      reason: d.reason || '',
      refId: d.refId || null,
      balanceAfter: Number(d.balanceAfter) || 0,
      at: d.at?.toMillis?.() || null,
    };
  });
}

function createTopUpIntent(_db, uid, amountFiat, provider, currency) {
  const amount = Math.round(Number(amountFiat) || 0);
  if (amount <= 0) throw new Error('INVALID_AMOUNT');
  const orderId = `cm_${uid.slice(0, 8)}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    provider: provider || 'razorpay',
    orderId,
    amount,
    currency: currency || 'INR',
    preview: !process.env.CHAUPAAL_RAZORPAY_KEY,
    key: process.env.CHAUPAAL_RAZORPAY_KEY || null,
  };
}

module.exports = {
  getBalance,
  creditTopUp,
  spend,
  listTransactions,
  createTopUpIntent,
  MONEY_DOC,
};
