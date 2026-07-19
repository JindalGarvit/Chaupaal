/**
 * Chaupaal proactive events — session nudge, dismiss, engage.
 * Events live at users/{uid}/chaupaalEvents/{eventId}.
 */
const { sendSuccess, sendError, requireMethod, parseJsonBody } = require('../server-lib/http');
const { requireUser, initAdmin } = require('../server-lib/auth');
const { isAiFeaturesEnabled } = require('../server-lib/ai-config');
const { callAI, AiDisabledError } = require('../server-lib/ai');
const {
  canSendProactive,
  recordEventSent,
  applyDismiss,
  applyEngage,
} = require('../server-lib/chaupaal-cadence');

async function getState(db, uid) {
  const ref = db.collection('chaupaalUserState').doc(uid);
  const snap = await ref.get();
  return { ref, data: snap.exists ? snap.data() : {} };
}

function eventDoc(type, displayMode, payload, sessionId) {
  return {
    type,
    displayMode: displayMode || 'inlineBubble',
    payload: payload || {},
    createdAt: new Date(),
    dismissed: false,
    dismissedAt: null,
    engaged: false,
    engagedAt: null,
    sessionId: sessionId || null,
    serverOwned: true,
  };
}

module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, ['POST', 'GET'])) return;

  const user = await requireUser(req, res, { allowWeak: false });
  if (!user) return;

  const admin = initAdmin();
  if (!admin) {
    return sendError(res, 503, 'AUTH_NOT_CONFIGURED', 'Firebase Admin not configured');
  }
  const db = admin.firestore();
  const eventsCol = db.collection('users').doc(user.uid).collection('chaupaalEvents');

  if (req.method === 'GET') {
    try {
      const snap = await eventsCol.orderBy('createdAt', 'desc').limit(40).get();
      const events = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return sendSuccess(res, { events });
    } catch (e) {
      console.error('[chaupaal-events] list', e?.message || e);
      return sendError(res, 500, 'EVENTS_LIST_FAILED', 'Could not load events');
    }
  }

  let body = {};
  try {
    body = parseJsonBody(req);
  } catch {
    return sendError(res, 400, 'INVALID_JSON', 'Invalid JSON body');
  }

  const action = String(body.action || 'session_nudge');

  try {
    if (action === 'activity') {
      // Privacy-minimized activity mirror for evening-window heuristics.
      // Client posts hour buckets only; never raw Analytics exports.
      const timezone = String(body.timezone || 'Asia/Kolkata').slice(0, 64);
      const hour = Number(body.hour);
      if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'hour must be 0–23');
      }
      const stateRef = db.collection('chaupaalUserState').doc(user.uid);
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(stateRef);
        const data = snap.exists ? snap.data() : {};
        const buckets = { ...(data.hourBuckets || {}) };
        const key = String(Math.floor(hour));
        buckets[key] = Number(buckets[key] || 0) + 1;

        const days = Array.isArray(data.activeDayKeys) ? [...data.activeDayKeys] : [];
        let dayKey = '';
        try {
          dayKey = new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(new Date());
        } catch {
          dayKey = new Date().toISOString().slice(0, 10);
        }
        if (!days.includes(dayKey)) days.push(dayKey);
        while (days.length > 21) days.shift();

        tx.set(
          stateRef,
          {
            uid: user.uid,
            timezone,
            hourBuckets: buckets,
            activeDayKeys: days,
            lastActivityAt: new Date(),
            updatedAt: new Date(),
          },
          { merge: true }
        );
      });
      return sendSuccess(res, { ok: true });
    }

    if (action === 'dismiss' || action === 'engage') {
      const eventId = String(body.eventId || '');
      if (!eventId) return sendError(res, 400, 'VALIDATION_ERROR', 'eventId required');
      const eref = eventsCol.doc(eventId);
      const esnap = await eref.get();
      if (!esnap.exists) return sendError(res, 404, 'NOT_FOUND', 'Event not found');
      const ev = esnap.data() || {};
      const isJournal = ev.type === 'journal' || ev.type === 'goodnight_journal';
      const { ref: stateRef, data: state } = await getState(db, user.uid);

      if (action === 'dismiss') {
        const created = ev.createdAt?.toDate ? ev.createdAt.toDate() : ev.createdAt ? new Date(ev.createdAt) : null;
        const fast = created ? Date.now() - created.getTime() < 5000 : false;
        await eref.set(
          { dismissed: true, dismissedAt: new Date(), fastDismiss: fast },
          { merge: true }
        );
        await stateRef.set(applyDismiss(state, { fast, isJournal }), { merge: true });
        return sendSuccess(res, { ok: true, action: 'dismiss', fast });
      }

      await eref.set({ engaged: true, engagedAt: new Date() }, { merge: true });
      await stateRef.set(applyEngage(state, { isJournal }), { merge: true });
      return sendSuccess(res, { ok: true, action: 'engage' });
    }

    if (action === 'session_nudge') {
      if (!isAiFeaturesEnabled()) {
        return sendSuccess(res, { skipped: true, reason: 'ai_disabled' });
      }
      const sessionId = String(body.sessionId || '').slice(0, 80);
      if (!sessionId) return sendError(res, 400, 'VALIDATION_ERROR', 'sessionId required');

      const { ref: stateRef, data: state } = await getState(db, user.uid);
      const gate = canSendProactive(state, { type: 'session_nudge', sessionId });
      if (!gate.ok) return sendSuccess(res, { skipped: true, reason: gate.reason });

      let text =
        "Welcome back — no rush. I'm here if you want a gentle check-in or something light to try.";
      try {
        const result = await callAI({
          tier: 'fast',
          feature: 'chaupaal_session_nudge',
          max_tokens: 120,
          system:
            'You are Chaupaal, the app itself. Write ONE short warm welcome-back bubble (max 2 sentences). No guilt, no usage stats, no "AI assistant" phrasing. Plain text only.',
          messages: [
            {
              role: 'user',
              content: `User returned after a lull. Timezone: ${state.timezone || 'Asia/Kolkata'}. Write a soft nudge.`,
            },
          ],
        });
        if (result.text) text = result.text.trim().slice(0, 280);
      } catch (e) {
        if (!(e instanceof AiDisabledError)) {
          console.warn('[chaupaal-events] nudge AI failed', e?.message || e);
        }
      }

      const doc = eventDoc(
        'session_nudge',
        'inlineBubble',
        { text, title: 'Chaupaal' },
        sessionId
      );
      const created = await eventsCol.add(doc);
      const next = recordEventSent(state, {
        type: 'session_nudge',
        sessionId,
        now: new Date(),
      });
      await stateRef.set(next, { merge: true });
      return sendSuccess(res, { event: { id: created.id, ...doc } });
    }

    return sendError(res, 400, 'UNKNOWN_ACTION', `Unknown action: ${action}`);
  } catch (e) {
    console.error('[chaupaal-events]', e?.message || e);
    return sendError(res, 500, 'EVENTS_FAILED', 'Event action failed');
  }
};
