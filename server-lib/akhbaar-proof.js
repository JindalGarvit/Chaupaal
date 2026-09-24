/**
 * Akhbaar A3 — per-question answer tallies for honest social proof.
 * Paths: daily_scores/{day}/answers/{uid_qid}, daily_scores/{day}/tallies/{qid}
 * Proof % shown only when total >= PROOF_MIN_N (client + API agree).
 */
'use strict';

const PROOF_MIN_N = 10;

function sanitizeQid(raw) {
  return (
    String(raw || '')
      .replace(/[^\w.-]+/g, '_')
      .slice(0, 80) || 'q'
  );
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatProof(tally, already) {
  const n = Number(tally?.total) || 0;
  const correct = Number(tally?.correct) || 0;
  const pct = n >= PROOF_MIN_N ? Math.round((correct / n) * 100) : null;
  return {
    n,
    correct,
    pct,
    already: !!already,
    minN: PROOF_MIN_N,
  };
}

/**
 * Idempotent per uid+question+day. Increments tally only on first write.
 */
async function recordAkhbaarAnswer(db, admin, { uid, questionKey, correct, setDate }) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(setDate || '')) ? String(setDate) : todayISO();
  const qid = sanitizeQid(questionKey);
  const answerId = `${uid}_${qid}`.slice(0, 120);
  const answerRef = db.collection('daily_scores').doc(day).collection('answers').doc(answerId);
  const tallyRef = db.collection('daily_scores').doc(day).collection('tallies').doc(qid);
  const FieldValue = admin.firestore.FieldValue;

  return db.runTransaction(async (tx) => {
    const aSnap = await tx.get(answerRef);
    const tSnap = await tx.get(tallyRef);
    const prev = tSnap.exists ? tSnap.data() || {} : { correct: 0, total: 0 };
    if (aSnap.exists) {
      return formatProof(prev, true);
    }
    tx.set(answerRef, {
      uid,
      questionKey: qid,
      correct: !!correct,
      ts: FieldValue.serverTimestamp(),
    });
    const next = {
      correct: (Number(prev.correct) || 0) + (correct ? 1 : 0),
      total: (Number(prev.total) || 0) + 1,
      updatedAt: FieldValue.serverTimestamp(),
    };
    tx.set(tallyRef, next, { merge: true });
    return formatProof(next, false);
  });
}

async function getAkhbaarProof(db, { questionKey, setDate }) {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(setDate || '')) ? String(setDate) : todayISO();
  const qid = sanitizeQid(questionKey);
  const snap = await db.collection('daily_scores').doc(day).collection('tallies').doc(qid).get();
  return formatProof(snap.exists ? snap.data() : { correct: 0, total: 0 }, false);
}

module.exports = {
  PROOF_MIN_N,
  sanitizeQid,
  recordAkhbaarAnswer,
  getAkhbaarProof,
  formatProof,
};
