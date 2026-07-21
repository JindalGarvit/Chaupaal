/**
 * Proactive companion outreach — festival wishes, personal occasions,
 * well-being check-ins, and occasional product feedback asks.
 *
 * Additive to Goodnight journal (do NOT change journal cadence here).
 * Gated by AI_FEATURES_ENABLED + per-user companionOptOut.
 *
 * Guardrails (non-optional):
 * - Never guilt-trip or pressure a reply
 * - Clearly presented as a Chaupaal app feature (not a real person)
 * - Opt-out must stay easy (users.companionOptOut / Settings toggle)
 * - Any future payment prompt via this channel must be an honest, labeled transaction
 */

const { isAiFeaturesEnabled } = require('./ai-config');
const { callAI } = require('./ai');
const { canSendProactive, recordEventSent, localDateKey } = require('./chaupaal-cadence');

/** Floor/ceiling for check-in spacing (days). Engagement moves within this band. */
const CHECKIN_FLOOR_DAYS = 4;
const CHECKIN_CEILING_DAYS = 21;
const FEEDBACK_MIN_DAYS = 28;

/**
 * Major Indian religious / national festivals (month is 1–12).
 * Maintained calendar — add entries as needed; year-agnostic MM-DD match.
 */
const FESTIVAL_CALENDAR = [
  { id: 'republic_day', month: 1, day: 26, name: 'Republic Day', wish: 'Happy Republic Day — hope today feels steady and proud.' },
  { id: 'holi', month: 3, day: 14, name: 'Holi', wish: 'Wishing you a colourful Holi — may something small today make you smile.' },
  { id: 'independence_day', month: 8, day: 15, name: 'Independence Day', wish: 'Happy Independence Day from Chaupaal.' },
  { id: 'ganesh_chaturthi', month: 8, day: 27, name: 'Ganesh Chaturthi', wish: 'Happy Ganesh Chaturthi — wishing ease and good beginnings.' },
  { id: 'gandhi_jayanti', month: 10, day: 2, name: 'Gandhi Jayanti', wish: 'Remembering Gandhi Jayanti — a quiet note from Chaupaal.' },
  { id: 'diwali', month: 10, day: 20, name: 'Diwali', wish: 'Happy Diwali — light, warmth, and an easy evening if you want one.' },
  { id: 'christmas', month: 12, day: 25, name: 'Christmas', wish: 'Merry Christmas from Chaupaal — wishing you a gentle day.' },
  { id: 'new_year', month: 1, day: 1, name: 'New Year', wish: 'Happy New Year — glad you\'re here on Chaupaal.' },
];

function festivalForDate(date = new Date(), tz = 'Asia/Kolkata') {
  let month;
  let day;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      month: 'numeric',
      day: 'numeric',
    }).formatToParts(date);
    month = Number(parts.find((p) => p.type === 'month')?.value);
    day = Number(parts.find((p) => p.type === 'day')?.value);
  } catch {
    month = date.getUTCMonth() + 1;
    day = date.getUTCDate();
  }
  // Exact match first; also allow ±1 day soft match for lunar festivals (Holi/Diwali approx)
  const exact = FESTIVAL_CALENDAR.find((f) => f.month === month && f.day === day);
  if (exact) return exact;
  return FESTIVAL_CALENDAR.find(
    (f) => f.month === month && Math.abs(f.day - day) <= 1 && ['holi', 'diwali', 'ganesh_chaturthi'].includes(f.id)
  ) || null;
}

function daysSince(ts) {
  if (!ts) return Infinity;
  const t = ts?.toDate?.() ? ts.toDate().getTime() : new Date(ts).getTime();
  if (!Number.isFinite(t)) return Infinity;
  return (Date.now() - t) / (24 * 60 * 60 * 1000);
}

/** Dynamic check-in interval from engagement (higher engagement → shorter gap). */
function checkInIntervalDays(companionStats = {}) {
  const sent = Number(companionStats.sent || 0);
  const engaged = Number(companionStats.engaged || 0);
  const rate = sent > 0 ? engaged / sent : 0.35;
  // Map engagement rate 0→ceiling, 1→floor
  const days = Math.round(CHECKIN_CEILING_DAYS - rate * (CHECKIN_CEILING_DAYS - CHECKIN_FLOOR_DAYS));
  return Math.max(CHECKIN_FLOOR_DAYS, Math.min(CHECKIN_CEILING_DAYS, days));
}

async function userAllowsCompanion(db, uid) {
  try {
    const snap = await db.collection('users').doc(uid).get();
    const data = snap.data() || {};
    if (data.companionOptOut === true) return { ok: false, reason: 'opt_out', profile: data };
    return { ok: true, profile: data };
  } catch {
    return { ok: true, profile: {} };
  }
}

function birthdayMatch(profile, tz) {
  const b =
    profile?.birthday ||
    profile?.profile?.birthday ||
    profile?.dob ||
    profile?.profile?.dob ||
    null;
  if (!b) return false;
  // Only if user explicitly shared — expect YYYY-MM-DD or MM-DD
  const s = String(b).trim();
  let bm;
  let bd;
  const m = s.match(/(\d{4}-)?(\d{1,2})-(\d{1,2})/);
  if (!m) return false;
  bm = Number(m[2]);
  bd = Number(m[3]);
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      month: 'numeric',
      day: 'numeric',
    }).formatToParts(new Date());
    const month = Number(parts.find((p) => p.type === 'month')?.value);
    const day = Number(parts.find((p) => p.type === 'day')?.value);
    return month === bm && day === bd;
  } catch {
    return false;
  }
}

async function recentUserChatSnippets(db, uid, limit = 8) {
  const chatId = `chat_chaupaal_${uid}`;
  try {
    const snap = await db
      .collection('chats')
      .doc(chatId)
      .collection('messages')
      .orderBy('ts', 'desc')
      .limit(limit)
      .get();
    return snap.docs
      .map((d) => {
        const x = d.data() || {};
        return { from: x.uid === uid ? 'user' : 'chaupaal', text: String(x.text || '').slice(0, 240) };
      })
      .filter((m) => m.text)
      .reverse();
  } catch {
    return [];
  }
}

async function createCompanionEvent(db, uid, { type, title, text, subtype }) {
  const doc = {
    type, // companion_festival | companion_occasion | companion_checkin | companion_feedback
    displayMode: 'graphicCard',
    payload: {
      title,
      text,
      subtitle: 'A note from Chaupaal',
      kicker: 'Chaupaal',
      cta: subtype === 'feedback' ? 'Share feedback' : 'Open Chaupaal chat',
      action: subtype === 'feedback' ? 'companion_feedback' : 'open_chaupaal_chat',
      // Honest labeling — never disguise as a real person
      fromApp: true,
      label: 'Chaupaal companion',
    },
    createdAt: new Date(),
    dismissed: false,
    engaged: false,
    serverOwned: true,
  };
  return db.collection('users').doc(uid).collection('chaupaalEvents').add(doc);
}

async function bumpCompanionStats(stateRef, state, { engaged = false } = {}) {
  const stats = { ...(state.companionStats || {}) };
  stats.sent = Number(stats.sent || 0) + 1;
  if (engaged) stats.engaged = Number(stats.engaged || 0) + 1;
  stats.lastSentAt = new Date().toISOString();
  await stateRef.set({ companionStats: stats }, { merge: true });
  return stats;
}

/**
 * Process one user for companion outreach. Skips journal logic entirely.
 * @returns {{ sent?: string, skipped?: string }}
 */
async function processCompanionOutreach(db, uid, state, stateRef) {
  if (!isAiFeaturesEnabled()) return { skipped: 'ai_off' };

  const allow = await userAllowsCompanion(db, uid);
  if (!allow.ok) return { skipped: allow.reason };

  const tz = state.timezone || 'Asia/Kolkata';
  const today = localDateKey(tz);
  const stats = state.companionStats || {};

  // ── Festival ──
  const fest = festivalForDate(new Date(), tz);
  if (fest) {
    const festKey = `companion_festival_${fest.id}`;
    const typeKeys = state.typeDateKeys || {};
    if (typeKeys[festKey] !== today) {
      const gate = canSendProactive(state, { type: festKey });
      // Festivals may use non-journal second slot only if daily cap allows —
      // if second slot is journal-only, skip festival quietly when count===1
      if (gate.ok) {
        const created = await createCompanionEvent(db, uid, {
          type: 'companion_festival',
          title: fest.name,
          text: `${fest.wish}\n\nThis is a Chaupaal app note — reply anytime in your Chaupaal chat, or ignore with no pressure.`,
          subtype: 'festival',
        });
        const next = recordEventSent(state, { type: festKey, now: new Date() });
        next.companionStats = {
          ...(next.companionStats || stats),
          sent: Number(stats.sent || 0) + 1,
          lastSentAt: new Date().toISOString(),
          lastKind: 'festival',
        };
        await stateRef.set(next, { merge: true });
        return { sent: created.id, kind: 'festival' };
      }
    }
  }

  // ── Birthday (only if profile has explicit birthday) ──
  if (birthdayMatch(allow.profile, tz)) {
    const gate = canSendProactive(state, { type: 'companion_birthday' });
    if (gate.ok) {
      const name = allow.profile?.name || allow.profile?.profile?.displayName || '';
      const created = await createCompanionEvent(db, uid, {
        type: 'companion_occasion',
        title: 'Happy birthday',
        text: `${name ? `${name}, h` : 'H'}appy birthday from Chaupaal.\n\nThis is an app feature using the birthday you shared in your profile — no need to reply.`,
        subtype: 'birthday',
      });
      const next = recordEventSent(state, { type: 'companion_birthday', now: new Date() });
      next.companionStats = {
        ...(stats),
        sent: Number(stats.sent || 0) + 1,
        lastSentAt: new Date().toISOString(),
        lastKind: 'birthday',
      };
      await stateRef.set(next, { merge: true });
      return { sent: created.id, kind: 'birthday' };
    }
  }

  // ── Monthly feedback ask (low frequency) ──
  if (daysSince(stats.lastFeedbackAskAt) >= FEEDBACK_MIN_DAYS) {
    const gate = canSendProactive(state, { type: 'companion_feedback' });
    if (gate.ok && Math.random() < 0.35) {
      const created = await createCompanionEvent(db, uid, {
        type: 'companion_feedback',
        title: 'A quick thought?',
        text: 'What would make Chaupaal more enjoyable for you? One honest line helps — optional, no pressure.\n\n— Chaupaal (app feature)',
        subtype: 'feedback',
      });
      const next = recordEventSent(state, { type: 'companion_feedback', now: new Date() });
      next.companionStats = {
        ...stats,
        sent: Number(stats.sent || 0) + 1,
        lastSentAt: new Date().toISOString(),
        lastFeedbackAskAt: new Date().toISOString(),
        lastKind: 'feedback',
      };
      await stateRef.set(next, { merge: true });
      return { sent: created.id, kind: 'feedback' };
    }
  }

  // ── Organic check-in (dynamic cadence) ──
  const interval = checkInIntervalDays(stats);
  if (daysSince(stats.lastCheckInAt || stats.lastSentAt) < interval) {
    return { skipped: 'checkin_spacing' };
  }
  const gate = canSendProactive(state, { type: 'companion_checkin' });
  if (!gate.ok) return { skipped: gate.reason };

  const snippets = await recentUserChatSnippets(db, uid);
  let text =
    'Just checking in from Chaupaal — hope your day has a calm corner in it. Reply if you like; silence is fine too.';

  if (snippets.length && isAiFeaturesEnabled()) {
    try {
      const result = await callAI({
        tier: 'fast',
        feature: 'companion_checkin',
        max_tokens: 180,
        system: `You write short Chaupaal companion check-ins for an Indian social app.
Rules:
- You are clearly an app feature named Chaupaal, never a real person pretending otherwise.
- Never guilt-trip, never pressure a reply, never invent memories the user did not share.
- Only reference facts present in the provided chat snippets; if none are usable, keep it generic and warm.
- 2–4 short sentences. Soft, optional tone.`,
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              snippets,
              note: 'Only use real snippet content; otherwise generic check-in.',
            }),
          },
        ],
      });
      const raw = String(result.text || result.content?.[0]?.text || '').trim();
      if (raw && raw.length > 20 && raw.length < 600) {
        text = raw + '\n\n— Chaupaal (app feature · reply optional)';
      }
    } catch (e) {
      console.warn('[companion] AI check-in', e?.message || e);
    }
  } else {
    text += '\n\n— Chaupaal (app feature · reply optional)';
  }

  const created = await createCompanionEvent(db, uid, {
    type: 'companion_checkin',
    title: 'A note from Chaupaal',
    text,
    subtype: 'checkin',
  });
  const next = recordEventSent(state, { type: 'companion_checkin', now: new Date() });
  next.companionStats = {
    ...stats,
    sent: Number(stats.sent || 0) + 1,
    lastSentAt: new Date().toISOString(),
    lastCheckInAt: new Date().toISOString(),
    lastKind: 'checkin',
  };
  await stateRef.set(next, { merge: true });
  return { sent: created.id, kind: 'checkin' };
}

/**
 * FUTURE PREMIUM / PAYMENTS INTEGRATION POINT — currently inert.
 * When Premium is designed and named, call into server-lib/payments.js here
 * (createPaymentIntent with purpose e.g. premium_subscription or companion_gift).
 * Do NOT invent upsell copy or charge users until product + PAYMENTS_ENABLED are ready.
 *
 * Guardrail: any payment prompt must be an honest, clearly-labeled transaction —
 * never framed to obscure that money is being charged.
 */
async function maybeCompanionPremiumUpsellPlaceholder(/* db, uid, state */) {
  // Intentionally empty — premium upsell not designed yet.
  return { skipped: 'premium_not_designed' };
}

module.exports = {
  processCompanionOutreach,
  festivalForDate,
  checkInIntervalDays,
  FESTIVAL_CALENDAR,
  maybeCompanionPremiumUpsellPlaceholder,
  CHECKIN_FLOOR_DAYS,
  CHECKIN_CEILING_DAYS,
};
