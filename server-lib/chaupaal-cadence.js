/**
 * Soft adaptive cadence for Chaupaal proactive events.
 * Caps: at most 2 proactive events per local calendar day; journal may be the 2nd.
 */

function localDateKey(tz, date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function localHour(tz, date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz || 'Asia/Kolkata',
      hour: 'numeric',
      hour12: false,
    }).formatToParts(date);
    return Number(parts.find((p) => p.type === 'hour')?.value || 0);
  } catch {
    return date.getUTCHours();
  }
}

/**
 * @param {object} state chaupaalUserState doc
 * @param {object} opts
 * @param {string} opts.type event type
 * @param {boolean} [opts.isJournal]
 * @param {string} [opts.sessionId] for session-nudge idempotency
 * @param {Date} [opts.now]
 */
function canSendProactive(state, opts = {}) {
  const now = opts.now || new Date();
  const tz = state?.timezone || 'Asia/Kolkata';
  const today = localDateKey(tz, now);
  const type = String(opts.type || 'nudge');
  const isJournal = !!opts.isJournal || type === 'journal' || type === 'goodnight_journal';

  const sentToday = Array.isArray(state?.eventsToday) ? state.eventsToday : [];
  const todayEvents = sentToday.filter((e) => e?.dateKey === today);
  const count = todayEvents.length;

  // Per-type date idempotency
  const typeKeys = state?.typeDateKeys || {};
  if (typeKeys[type] === today) {
    return { ok: false, reason: 'type_already_today' };
  }

  // Session nudge idempotency
  if (opts.sessionId && state?.lastSessionNudgeId === opts.sessionId) {
    return { ok: false, reason: 'session_nudge_done' };
  }

  if (count >= 2) {
    return { ok: false, reason: 'daily_cap' };
  }
  if (count === 1 && !isJournal) {
    // Only journal may be the second event
    return { ok: false, reason: 'second_slot_journal_only' };
  }

  // Fast-dismiss backoff
  const dismissStreak = Number(state?.consecutiveFastDismisses || 0);
  const backoffUntil = state?.backoffUntil ? new Date(state.backoffUntil) : null;
  if (backoffUntil && backoffUntil > now && !isJournal) {
    return { ok: false, reason: 'backoff' };
  }
  if (dismissStreak >= 3 && !isJournal) {
    // Extra soft gate even if backoffUntil missing
    return { ok: false, reason: 'dismiss_streak' };
  }

  // Journal-specific pause
  if (isJournal) {
    const journalPauseUntil = state?.journalPauseUntil ? new Date(state.journalPauseUntil) : null;
    if (journalPauseUntil && journalPauseUntil > now) {
      return { ok: false, reason: 'journal_paused' };
    }
  }

  // Weekly recommendation spacing
  if (type === 'recommendation' || type === 'weekly_recommendation') {
    const lastRec = state?.lastRecommendationAt ? new Date(state.lastRecommendationAt) : null;
    if (lastRec && now - lastRec < 7 * 24 * 60 * 60 * 1000) {
      return { ok: false, reason: 'recommendation_cooldown' };
    }
  }

  return { ok: true, today, tz };
}

/**
 * Record that an event was sent (mutate a plain object copy).
 */
function recordEventSent(state, { type, isJournal, sessionId, now }) {
  const next = { ...(state || {}) };
  const ts = now || new Date();
  const tz = next.timezone || 'Asia/Kolkata';
  const today = localDateKey(tz, ts);
  const eventsToday = Array.isArray(next.eventsToday) ? [...next.eventsToday] : [];
  // Drop old days
  const pruned = eventsToday.filter((e) => e?.dateKey === today);
  pruned.push({ type, dateKey: today, at: ts.toISOString(), isJournal: !!isJournal });
  next.eventsToday = pruned;
  next.typeDateKeys = { ...(next.typeDateKeys || {}), [type]: today };
  next.lastProactiveAt = ts.toISOString();
  if (sessionId) next.lastSessionNudgeId = sessionId;
  if (type === 'recommendation' || type === 'weekly_recommendation') {
    next.lastRecommendationAt = ts.toISOString();
  }
  return next;
}

/**
 * On fast dismiss (< 5s) increase backoff; engagement resets.
 */
function applyDismiss(state, { fast = false, isJournal = false, now } = {}) {
  const next = { ...(state || {}) };
  const ts = now || new Date();
  if (fast) {
    const streak = Number(next.consecutiveFastDismisses || 0) + 1;
    next.consecutiveFastDismisses = streak;
    // Backoff: 1d, 2d, 3d... capped at 7d
    const days = Math.min(7, streak);
    next.backoffUntil = new Date(ts.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  }
  if (isJournal) {
    const ignored = Number(next.journalIgnoredStreak || 0) + 1;
    next.journalIgnoredStreak = ignored;
    if (ignored >= 3) {
      // First pause 3 days; subsequent up to 7
      const pauseDays = ignored === 3 ? 3 : Math.min(7, ignored);
      next.journalPauseUntil = new Date(ts.getTime() + pauseDays * 24 * 60 * 60 * 1000).toISOString();
    }
  }
  return next;
}

function applyEngage(state, { isJournal = false } = {}) {
  const next = { ...(state || {}) };
  next.consecutiveFastDismisses = 0;
  next.backoffUntil = null;
  if (isJournal) {
    next.journalIgnoredStreak = 0;
    next.journalPauseUntil = null;
    next.lastJournalCompletedAt = new Date().toISOString();
  }
  return next;
}

/**
 * Derive evening window from hour buckets (21 days).
 * Needs >=5 observations; else default 19–22 local.
 *
 * CURRENTLY UNUSED by the scheduler: journal prompts send at a fixed
 * 8:30 PM IST (daily cron, see api/chaupaal-scheduler.js). Kept for when
 * per-user dynamic timing returns (real usage data + hourly cron on Pro).
 */
function deriveEveningWindow(hourBuckets) {
  const buckets = hourBuckets && typeof hourBuckets === 'object' ? hourBuckets : {};
  const eveningHours = [];
  for (let h = 17; h <= 23; h++) {
    const c = Number(buckets[String(h)] || buckets[h] || 0);
    for (let i = 0; i < c; i++) eveningHours.push(h);
  }
  if (eveningHours.length < 5) {
    return { startHour: 19, endHour: 22, source: 'default' };
  }
  eveningHours.sort((a, b) => a - b);
  const mid = eveningHours[Math.floor(eveningHours.length / 2)];
  // Modal-ish 2-hour window centered on median evening hour
  const startHour = Math.max(17, Math.min(21, mid - 1));
  return { startHour, endHour: startHour + 2, source: 'observed' };
}

function isInEveningWindow(state, now = new Date()) {
  const tz = state?.timezone || 'Asia/Kolkata';
  const hour = localHour(tz, now);
  const win = deriveEveningWindow(state?.hourBuckets);
  return hour >= win.startHour && hour < win.endHour;
}

module.exports = {
  localDateKey,
  localHour,
  canSendProactive,
  recordEventSent,
  applyDismiss,
  applyEngage,
  deriveEveningWindow,
  isInEveningWindow,
};
