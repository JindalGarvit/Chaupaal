/**
 * Admin-only feedback log + daily summaries + Peepal intent weight profiles.
 * Requires Firebase ID token with custom claim admin === true.
 *
 * GET  ?view=log|summary|errors|intent_weights
 * POST { action: 'revert_intent_weights', profileId }  (intent weights only)
 */
const { sendSuccess, sendError, requireMethod, parseJsonBody } = require('../server-lib/http');
const { requireUser, initAdmin } = require('../server-lib/auth');
const {
  COLLECTION,
  revertIntentWeights,
  SIGNAL_NAMES,
} = require('../server-lib/intent-weights');

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
  const user = await requireAdmin(req, res);
  if (!user) return;

  const admin = initAdmin();
  if (!admin) {
    return sendError(res, 503, 'AUTH_NOT_CONFIGURED', 'Firebase Admin not configured');
  }
  const db = admin.firestore();

  try {
    if (req.method === 'POST') {
      let body;
      try {
        body = parseJsonBody(req);
      } catch {
        return sendError(res, 400, 'INVALID_JSON', 'Invalid JSON body');
      }
      if (body.action === 'revert_intent_weights') {
        const profileId = String(body.profileId || '').trim();
        if (!profileId) return sendError(res, 400, 'VALIDATION_ERROR', 'profileId required');
        try {
          const result = await revertIntentWeights(db, profileId);
          return sendSuccess(res, result);
        } catch (e) {
          if (e?.message === 'NOT_FOUND') return sendError(res, 404, 'NOT_FOUND', 'Profile not found');
          if (e?.message === 'NO_PREVIOUS') return sendError(res, 400, 'NO_PREVIOUS', 'No previousWeights to revert');
          throw e;
        }
      }
      return sendError(res, 400, 'UNKNOWN_ACTION', 'Unknown action');
    }

    if (!requireMethod(req, res, 'GET')) return;

    const view = String(req.query?.view || 'log');

    if (view === 'intent_weights') {
      const limit = Math.min(100, Math.max(1, Number(req.query?.limit) || 50));
      const snap = await db.collection(COLLECTION).limit(limit).get();
      const items = snap.docs
        .map((d) => {
          const data = d.data() || {};
          return {
            id: d.id,
            canonicalIntentText: data.canonicalIntentText || '',
            aliasIntentTexts: data.aliasIntentTexts || [],
            weights: data.weights || {},
            previousWeights: data.previousWeights || null,
            rationale: data.rationale || '',
            version: data.version || 1,
            usageCount: data.usageCount || 0,
            sampleCountSinceRefresh: data.sampleCountSinceRefresh || 0,
            createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null,
            lastRefreshedAt: data.lastRefreshedAt?.toDate?.()?.toISOString?.() || null,
          };
        })
        .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
      return sendSuccess(res, { items, signalNames: SIGNAL_NAMES });
    }

    if (view === 'summary') {
      const date = String(req.query?.date || new Date().toISOString().slice(0, 10));
      const snap = await db.collection('chaupaalFeedbackSummaries').doc(date).get();
      if (!snap.exists) {
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

    if (view === 'errors') {
      const date = String(req.query?.date || new Date().toISOString().slice(0, 10));
      const sumSnap = await db.collection('chaupaalFeedbackSummaries').doc(date).get();
      const limit = Math.min(100, Math.max(1, Number(req.query?.limit) || 50));
      const recent = await db
        .collection('clientErrorReports')
        .orderBy('createdAt', 'desc')
        .limit(limit)
        .get();
      return sendSuccess(res, {
        date,
        summary: sumSnap.exists ? sumSnap.data()?.clientErrors || null : null,
        narrative: sumSnap.exists ? sumSnap.data()?.summary || null : null,
        recent: recent.docs.map((d) => {
          const data = d.data() || {};
          return {
            id: d.id,
            uid: data.uid || null,
            feature: data.feature || 'unknown',
            message: data.message || '',
            surface: data.surface || 'unknown',
            url: data.url || '',
            createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null,
          };
        }),
      });
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
