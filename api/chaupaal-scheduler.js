/**
 * Hourly Chaupaal scheduler (Vercel Cron + CRON_SECRET).
 * - Evening journal prompts (Goodnight Chaupaal)
 * - Weekly recommendations
 * - Daily feedback summary aggregation
 */
const { sendSuccess, sendError, requireMethod } = require('../server-lib/http');
const { requireCronSecret, initAdmin } = require('../server-lib/auth');
const { isAiFeaturesEnabled } = require('../server-lib/ai-config');
const { callAI } = require('../server-lib/ai');
const {
  canSendProactive,
  recordEventSent,
  localDateKey,
} = require('../server-lib/chaupaal-cadence');
const { runWeeklyIntentWeightRefresh } = require('../server-lib/intent-weights');
const { expireLiveLocationShares } = require('../server-lib/live-location');
const { advanceStalledPeepalSegments } = require('../server-lib/peepal-segments');
const { processCompanionOutreach } = require('../server-lib/companion-outreach');

const BATCH = 40;

async function getCursor(db) {
  const ref = db.collection('chaupaalMeta').doc('schedulerCursor');
  const snap = await ref.get();
  return { ref, data: snap.exists ? snap.data() : {} };
}

async function hasJournalToday(db, uid, tz) {
  const today = localDateKey(tz);
  try {
    const start = new Date(`${today}T00:00:00.000Z`);
    // Broad window; exact TZ filtering is soft
    const snap = await db
      .collection('daily_checkins')
      .where('uid', '==', uid)
      .where('date', '>=', today)
      .limit(1)
      .get();
    if (!snap.empty) return true;
    // Fallback: createdAt today-ish
    const alt = await db
      .collection('daily_checkins')
      .where('uid', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(3)
      .get();
    const now = Date.now();
    return alt.docs.some((d) => {
      const t = d.data()?.createdAt?.toDate?.() || (d.data()?.date ? new Date(d.data().date) : null);
      return t && now - t.getTime() < 20 * 60 * 60 * 1000;
    });
  } catch {
    return false;
  }
}

async function createEvent(db, uid, doc) {
  return db.collection('users').doc(uid).collection('chaupaalEvents').add(doc);
}

/**
 * SIMPLIFICATION (deliberate, pre-launch): the Goodnight journal prompt goes out
 * at ONE fixed time for everyone — 8:30 PM IST (cron fires 15:00 UTC = 20:30 IST,
 * see vercel.json "0 15 * * *"). We intentionally do NOT compute a per-user
 * evening window here. Per-user dynamic timing (deriveEveningWindow /
 * isInEveningWindow in server-lib/chaupaal-cadence.js, fed by the activity
 * mirror) can be reintroduced once there is real usage data and hourly cron
 * infra (Vercel Pro) to support it. Until then the cron time IS the send time,
 * so no window check is needed.
 */
async function processJournal(db, uid, state, stateRef) {
  if (await hasJournalToday(db, uid, state.timezone || 'Asia/Kolkata')) {
    return { skipped: 'already_journaled' };
  }
  const gate = canSendProactive(state, { type: 'goodnight_journal', isJournal: true });
  if (!gate.ok) return { skipped: gate.reason };

  const payload = {
    title: 'Goodnight Chaupaal',
    subtitle: 'A quiet moment for your day',
    text: 'How was your day? One warm note for your private journal — only you will see it.',
    cta: 'Open journal',
    action: 'open_journal',
  };
  const doc = {
    type: 'goodnight_journal',
    displayMode: 'graphicCard',
    payload,
    createdAt: new Date(),
    dismissed: false,
    engaged: false,
    serverOwned: true,
  };
  const created = await createEvent(db, uid, doc);
  const next = recordEventSent(state, {
    type: 'goodnight_journal',
    isJournal: true,
    now: new Date(),
  });
  await stateRef.set(next, { merge: true });
  return { sent: created.id };
}

async function processRecommendation(db, uid, state, stateRef) {
  const gate = canSendProactive(state, { type: 'weekly_recommendation' });
  if (!gate.ok) return { skipped: gate.reason };

  // Soft: prefer Saturdays locally once a week is already gated by lastRecommendationAt
  try {
    const wd = new Intl.DateTimeFormat('en-US', {
      timeZone: state.timezone || 'Asia/Kolkata',
      weekday: 'short',
    }).format(new Date());
    if (wd !== 'Sat' && state.lastRecommendationAt) {
      return { skipped: 'not_recommendation_day' };
    }
  } catch {
    /* continue */
  }

  let items = [
    { kind: 'game', title: 'Ank Jod', reason: 'A calm puzzle when you want focus' },
    { kind: 'content', title: "Today's Akhbaar", reason: 'A short read to stay curious' },
    { kind: 'people', title: 'Peepal discovery', reason: 'Someone nearby who shares an interest' },
  ];

  if (isAiFeaturesEnabled()) {
    try {
      const userSnap = await db.collection('users').doc(uid).get();
      const profile = userSnap.exists ? userSnap.data() : {};
      const interests = (profile.interests || profile.profile?.interests || []).slice(0, 8);
      const result = await callAI({
        tier: 'fast',
        feature: 'chaupaal_recommendation',
        max_tokens: 400,
        system:
          'You are Chaupaal. Return ONLY JSON: {"items":[{"kind":"game|content|people","title":"...","reason":"..."}]} with 3 short warm recommendations. No guilt. No AI-assistant phrasing.',
        messages: [
          {
            role: 'user',
            content: `Interests: ${interests.join(', ') || 'general Indian culture, games, news'}. Suggest 3 things.`,
          },
        ],
      });
      const raw = String(result.text || '');
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start >= 0 && end > start) {
        const parsed = JSON.parse(raw.slice(start, end + 1));
        if (Array.isArray(parsed.items) && parsed.items.length) {
          items = parsed.items.slice(0, 3).map((it) => ({
            kind: String(it.kind || 'content'),
            title: String(it.title || 'Something to try').slice(0, 80),
            reason: String(it.reason || '').slice(0, 140),
          }));
        }
      }
    } catch (e) {
      console.warn('[scheduler] recommendation AI', e?.message || e);
    }
  }

  const doc = {
    type: 'weekly_recommendation',
    displayMode: 'graphicCard',
    payload: {
      title: 'This week on Chaupaal',
      subtitle: 'A few soft suggestions',
      items,
    },
    createdAt: new Date(),
    dismissed: false,
    engaged: false,
    serverOwned: true,
  };
  const created = await createEvent(db, uid, doc);
  const next = recordEventSent(state, {
    type: 'weekly_recommendation',
    now: new Date(),
  });
  await stateRef.set(next, { merge: true });
  return { sent: created.id };
}

async function maybeWriteDailyFeedbackSummary(db) {
  const today = new Date().toISOString().slice(0, 10);
  const sumRef = db.collection('chaupaalFeedbackSummaries').doc(today);
  const existing = await sumRef.get();

  const since = new Date(Date.now() - 26 * 60 * 60 * 1000);
  let errSnap = { docs: [], size: 0 };
  try {
    errSnap = await db
      .collection('clientErrorReports')
      .where('createdAt', '>=', since)
      .limit(200)
      .get();
  } catch (e) {
    console.warn('[scheduler] clientErrorReports query', e?.message || e);
  }
  const byFeature = {};
  const bySurface = {};
  const errorSamples = [];
  errSnap.docs.forEach((d) => {
    const data = d.data() || {};
    const feature = String(data.feature || 'unknown').slice(0, 80);
    const surface = String(data.surface || 'unknown').slice(0, 40);
    byFeature[feature] = (byFeature[feature] || 0) + 1;
    bySurface[surface] = (bySurface[surface] || 0) + 1;
    if (errorSamples.length < 12) {
      errorSamples.push({
        feature,
        surface,
        message: String(data.message || '').slice(0, 200),
        uid: data.uid || null,
      });
    }
  });
  const clientErrors = {
    count: errSnap.size,
    byFeature,
    bySurface,
    samples: errorSamples,
    updatedAt: new Date(),
  };

  // Always refresh clientErrors (even if feedback summary already exists)
  if (existing.exists) {
    await sumRef.set({ clientErrors }, { merge: true });
    return { updated_errors: today, errorCount: errSnap.size };
  }

  const snap = await db
    .collection('chaupaalFeedback')
    .where('timestamp', '>=', since)
    .limit(200)
    .get();
  const tags = { bug: 0, complaint: 0, suggestion: 0, other: 0 };
  const samples = [];
  snap.docs.forEach((d) => {
    const data = d.data();
    const tag = tags[data.tag] != null ? data.tag : 'other';
    tags[tag] = (tags[tag] || 0) + 1;
    if (samples.length < 8) {
      samples.push({
        tag,
        message: String(data.message || '').slice(0, 200),
        userId: data.userId || null,
      });
    }
  });

  let narrative = `${snap.size} feedback items in the last day.`;
  if (errSnap.size) {
    narrative += ` ${errSnap.size} client errors reported.`;
  }
  if (isAiFeaturesEnabled() && (snap.size || errSnap.size)) {
    try {
      const result = await callAI({
        tier: 'fast',
        feature: 'chaupaal_feedback_summary',
        max_tokens: 360,
        system:
          'Summarize product feedback AND client runtime errors for an internal admin. 3–6 bullets. Neutral tone. JSON: {"summary":"..."}',
        messages: [
          {
            role: 'user',
            content: JSON.stringify({ tags, samples, clientErrors }),
          },
        ],
      });
      const raw = String(result.text || '');
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start >= 0) {
        const parsed = JSON.parse(raw.slice(start, end + 1));
        if (parsed.summary) narrative = String(parsed.summary).slice(0, 2000);
      }
    } catch (e) {
      console.warn('[scheduler] feedback summary AI', e?.message || e);
    }
  }

  await sumRef.set({
    date: today,
    count: snap.size,
    tags,
    samples,
    clientErrors,
    summary: narrative,
    createdAt: new Date(),
  });
  return { wrote: today, count: snap.size, errorCount: errSnap.size };
}

module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, ['GET', 'POST'])) return;
  if (!requireCronSecret(req, res)) return;

  if (!isAiFeaturesEnabled()) {
    // Still allow feedback summary + journal cards without AI text if needed —
    // but plan says dual gate stops proactive generation. Skip AI-heavy work.
  }

  const admin = initAdmin();
  if (!admin) {
    return sendError(res, 503, 'AUTH_NOT_CONFIGURED', 'Firebase Admin not configured');
  }
  const db = admin.firestore();

  try {
    const { ref: cursorRef, data: cursor } = await getCursor(db);
    let lastUid = cursor.lastUid || null;
    let q = db.collection('chaupaalUserState').orderBy('__name__').limit(BATCH);
    if (lastUid) q = q.startAfter(lastUid);

    const snap = await q.get();
    const results = {
      journal: 0,
      recommendation: 0,
      companion: 0,
      skipped: 0,
      users: snap.size,
    };

    for (const doc of snap.docs) {
      const uid = doc.id;
      const state = doc.data() || {};
      const stateRef = doc.ref;

      if (!isAiFeaturesEnabled()) {
        results.skipped++;
        continue;
      }

      const j = await processJournal(db, uid, state, stateRef);
      if (j.sent) results.journal++;
      else results.skipped++;

      // Refresh state after journal — do NOT alter journal cadence
      let fresh = (await stateRef.get()).data() || state;
      const r = await processRecommendation(db, uid, fresh, stateRef);
      if (r.sent) results.recommendation++;

      // Companion outreach (festival / birthday / check-in / feedback) — additive
      fresh = (await stateRef.get()).data() || fresh;
      try {
        const c = await processCompanionOutreach(db, uid, fresh, stateRef);
        if (c.sent) results.companion++;
      } catch (e) {
        console.warn('[scheduler] companion', uid, e?.message || e);
      }
    }

    if (snap.empty || snap.size < BATCH) {
      await cursorRef.set({ lastUid: null, updatedAt: new Date(), wrapped: true }, { merge: true });
    } else {
      await cursorRef.set(
        { lastUid: snap.docs[snap.docs.length - 1].id, updatedAt: new Date(), wrapped: false },
        { merge: true }
      );
    }

    // Once per run attempt daily summary (idempotent by date doc)
    const summary = await maybeWriteDailyFeedbackSummary(db);

    // Weekly intent-weight refresh (Sundays UTC) — only profiles with ≥50 samples
    let intentWeights = { skipped: true, reason: 'not_sunday' };
    try {
      const wd = new Date().getUTCDay(); // 0 = Sunday
      if (wd === 0) {
        intentWeights = await runWeeklyIntentWeightRefresh(db, admin);
      }
    } catch (e) {
      intentWeights = { error: e?.message || String(e) };
      console.warn('[scheduler] intent weights', e?.message || e);
    }

    // Expire live location shares past duration (independent of sender client)
    let liveLoc = { skipped: true };
    try {
      liveLoc = await expireLiveLocationShares(db, admin, { limit: 40 });
    } catch (e) {
      liveLoc = { error: e?.message || String(e) };
      console.warn('[scheduler] live location expire', e?.message || e);
    }

    // Advance stalled Peepal audience segments (cascade to next segment)
    let peepalSegments = { skipped: true };
    try {
      peepalSegments = await advanceStalledPeepalSegments(db, { limit: 30 });
    } catch (e) {
      peepalSegments = { error: e?.message || String(e) };
      console.warn('[scheduler] peepal segments', e?.message || e);
    }

    // Phase 3 denorm backfill (groups isPublic/nameLower + users_public) — idempotent paging
    let denormBackfill = { skipped: true };
    try {
      const { runDenormBackfillPage } = require('../server-lib/backfill-denorms');
      const pages = [];
      // Extra pages when ?denorm=1 so a manual cron hit can finish faster
      const extra = String(req.query?.denorm || '') === '1' ? 8 : 1;
      for (let i = 0; i < extra; i++) {
        const page = await runDenormBackfillPage(db);
        pages.push(page);
        const gDone = !!(page.groups?.done || page.groups?.skipped);
        const uDone = !!(page.usersPublic?.done || page.usersPublic?.skipped);
        if (gDone && uDone) break;
      }
      denormBackfill = { pages };
    } catch (e) {
      denormBackfill = { error: e?.message || String(e) };
      console.warn('[scheduler] denorm backfill', e?.message || e);
    }

    return sendSuccess(res, { ...results, summary, intentWeights, liveLoc, peepalSegments, denormBackfill });
  } catch (e) {
    console.error('[chaupaal-scheduler]', e?.message || e);
    return sendError(res, 500, 'SCHEDULER_FAILED', e?.message || 'Scheduler failed');
  }
};
