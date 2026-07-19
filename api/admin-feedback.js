/**
 * Admin-only feedback log + daily summaries.
 * Requires Firebase ID token with custom claim admin === true.
 */
const { sendSuccess, sendError, requireMethod } = require('../server-lib/http');
const { requireUser, initAdmin } = require('../server-lib/auth');

async function requireAdmin(req, res) {
  const user = await requireUser(req, res, { allowWeak: false });
  if (!user) return null;
  if (!user.decoded || user.decoded.admin !== true) {
    sendError(res, 403, 'FORBIDDEN', 'Admin claim required');
    return null;
  }
  return user;
}

module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;

  const user = await requireAdmin(req, res);
  if (!user) return;

  const admin = initAdmin();
  if (!admin) {
    return sendError(res, 503, 'AUTH_NOT_CONFIGURED', 'Firebase Admin not configured');
  }
  const db = admin.firestore();
  const view = String(req.query?.view || 'log');

  try {
    if (view === 'summary') {
      const date = String(req.query?.date || new Date().toISOString().slice(0, 10));
      const snap = await db.collection('chaupaalFeedbackSummaries').doc(date).get();
      if (!snap.exists) {
        // Return latest few
        const recent = await db
          .collection('chaupaalFeedbackSummaries')
          .orderBy('date', 'desc')
          .limit(7)
          .get();
        return sendSuccess(res, {
          date,
          current: null,
          recent: recent.docs.map((d) => ({ id: d.id, ...d.data() })),
        });
      }
      return sendSuccess(res, { date, current: { id: snap.id, ...snap.data() }, recent: [] });
    }

    const limit = Math.min(100, Math.max(1, Number(req.query?.limit) || 50));
    const snap = await db
      .collection('chaupaalFeedback')
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();
    const items = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        userId: data.userId || null,
        message: data.message || '',
        tag: data.tag || 'other',
        timestamp: data.timestamp?.toDate?.()?.toISOString?.() || data.timestamp || null,
      };
    });
    return sendSuccess(res, { items });
  } catch (e) {
    console.error('[admin-feedback]', e?.message || e);
    return sendError(res, 500, 'ADMIN_FEEDBACK_FAILED', e?.message || 'Failed');
  }
};
