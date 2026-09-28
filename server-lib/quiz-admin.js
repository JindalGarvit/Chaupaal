/**
 * Quiz Muqabala moderation (Dangal P6) — served by api/admin-feedback.js (admin claim required).
 *   GET  ?view=quiz                          → open reports grouped by question + pending AI items
 *   POST { action: 'quiz_approve', qid }     → pending → active; open reports on it dismissed
 *   POST { action: 'quiz_retire', qid, note } → AI item retired / bundled item added to the retired list;
 *                                              confirmedReports++; open reports actioned
 */
'use strict';

const Bank = require('./quiz-bank.js');
const Svc = require('./quiz-service.js');

async function quizAdminView(db) {
  const [reps, pend] = await Promise.all([
    db.collection('quizReports').where('status', '==', 'open').limit(300).get(),
    db.collection('quizItems').where('status', '==', 'pending').limit(100).get(),
  ]);
  const byQ = {};
  reps.docs.forEach((d) => {
    const r = d.data() || {};
    const g = (byQ[r.qid] = byQ[r.qid] || { qid: r.qid, prompt: r.prompt, options: r.options || [], correctIndex: r.correctIndex, source: r.source, category: r.category, reasons: {}, notes: [], count: 0, lastAt: 0 });
    g.count++;
    g.reasons[r.reason] = (g.reasons[r.reason] || 0) + 1;
    if (r.note) g.notes.push(String(r.note).slice(0, 240));
    g.lastAt = Math.max(g.lastAt, Number(r.at) || 0);
  });
  const reports = Object.values(byQ).sort((a, b) => b.count - a.count || b.lastAt - a.lastAt);
  const ids = reports.map((r) => r.qid).concat(pend.docs.map((d) => d.id));
  const stats = {};
  if (ids.length) {
    const snaps = await db.getAll(...ids.map((id) => db.collection('quizStats').doc(String(id))));
    snaps.forEach((s) => s.exists && (stats[s.id] = s.data()));
  }
  const pending = pend.docs.map((d) => {
    const it = d.data() || {};
    return { qid: d.id, prompt: it.prompt, options: it.options || [], correctIndex: it.correctIndex, explanation: it.explanation || '', category: it.category, source: it.source, quote: it.quote || null, createdAt: it.createdAt || 0, expiresAt: it.expiresAt || null };
  });
  reports.forEach((r) => (r.stats = stats[r.qid] || null));
  pending.forEach((p) => (p.stats = stats[p.qid] || null));
  return { reports, pending };
}

async function closeReports(db, qid, status, now) {
  const snap = await db.collection('quizReports').where('qid', '==', qid).limit(200).get();
  const batch = db.batch();
  let n = 0;
  snap.docs.forEach((d) => {
    if ((d.data() || {}).status !== 'open') return;
    batch.set(d.ref, { status, closedAt: now }, { merge: true });
    n++;
  });
  if (n) await batch.commit();
  return n;
}

async function quizAdminAction(db, admin, body, adminUid) {
  const qid = String((body && body.qid) || '').slice(0, 60);
  if (!qid) {
    const e = new Error('qid required');
    e.code = 'VALIDATION_ERROR';
    throw e;
  }
  const now = Date.now();
  const itemRef = db.collection('quizItems').doc(qid);
  const bundled = Bank.byId(qid);
  if (body.action === 'quiz_approve') {
    if (!bundled) {
      const snap = await itemRef.get();
      if (snap.exists && (snap.data() || {}).status === 'pending') await itemRef.set({ status: 'active', reviewedAt: now, reviewedBy: adminUid || null }, { merge: true });
    }
    const closed = await closeReports(db, qid, 'dismissed', now);
    Svc.resetCaches();
    return { qid, approved: true, reportsClosed: closed };
  }
  if (body.action === 'quiz_retire') {
    const FieldValue = admin.firestore.FieldValue;
    if (bundled) {
      await db
        .collection('quizConfig')
        .doc('calibration')
        .set({ retired: { [qid]: true }, at: now }, { merge: true });
    } else {
      await itemRef.set({ status: 'retired', retiredReason: 'admin', retiredAt: now, reviewedBy: adminUid || null }, { merge: true });
    }
    await db.collection('quizStats').doc(qid).set({ confirmedReports: FieldValue.increment(1), updatedAt: now }, { merge: true });
    const closed = await closeReports(db, qid, 'actioned', now);
    Svc.resetCaches();
    return { qid, retired: true, reportsClosed: closed };
  }
  const e = new Error('Unknown action');
  e.code = 'UNKNOWN_ACTION';
  throw e;
}

module.exports = { quizAdminView, quizAdminAction };
