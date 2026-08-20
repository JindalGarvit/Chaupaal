/**
 * Policy limits — single source of truth for scarcity caps.
 * Change numbers here only; callers import via window.PolicyLimits.
 *
 * Week reset: fixed calendar week starting Monday 00:00 local time
 * (same style for anonymous posts and AI Discovery messaging).
 */
(function () {
  'use strict';

  const UNLIMITED = 999999;

  const TIER_LIMITS = Object.freeze({
    free: Object.freeze({
      ANON_POSTS: Object.freeze({ perDay: 2, perWeek: 7 }),
      AI_DISCOVERY_MSG: Object.freeze({ perDay: 3, perWeek: 10 }),
      PEEPAL_POST: Object.freeze({ perDay: 5, perWeek: 5 }),
      AI_KB: Object.freeze({ perDay: 5, perWeek: 35 }),
      ADS_PER_DAY: 5,
      STREAK_FREEZE_PER_MONTH: 0,
    }),
    pradhan: Object.freeze({
      ANON_POSTS: Object.freeze({ perDay: 6, perWeek: 21 }),
      AI_DISCOVERY_MSG: Object.freeze({ perDay: 9, perWeek: 30 }),
      PEEPAL_POST: Object.freeze({ perDay: 15, perWeek: 15 }),
      AI_KB: Object.freeze({ perDay: 15, perWeek: 105 }),
      ADS_PER_DAY: 2,
      STREAK_FREEZE_PER_MONTH: 1,
    }),
    sarpanch: Object.freeze({
      ANON_POSTS: Object.freeze({ perDay: UNLIMITED, perWeek: UNLIMITED }),
      AI_DISCOVERY_MSG: Object.freeze({ perDay: UNLIMITED, perWeek: UNLIMITED }),
      PEEPAL_POST: Object.freeze({ perDay: UNLIMITED, perWeek: UNLIMITED }),
      AI_KB: Object.freeze({ perDay: UNLIMITED, perWeek: UNLIMITED }),
      ADS_PER_DAY: 0,
      STREAK_FREEZE_PER_MONTH: UNLIMITED,
    }),
  });

  const ANON_POSTS = TIER_LIMITS.free.ANON_POSTS;
  const AI_DISCOVERY_MSG = TIER_LIMITS.free.AI_DISCOVERY_MSG;
  const PEEPAL_POST = TIER_LIMITS.free.PEEPAL_POST;
  const AI_KB = TIER_LIMITS.free.AI_KB;

  function forTier(tier) {
    const t = String(tier || 'free').toLowerCase();
    return TIER_LIMITS[t] || TIER_LIMITS.free;
  }

  /** Local calendar date key YYYY-MM-DD */
  function dayKey(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /**
   * Monday-start ISO-ish week key: YYYY-Www (week of the Monday that starts the week).
   * Uses local timezone so the reset matches the user's calendar Monday.
   */
  function weekKeyMonday(d = new Date()) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = x.getDay(); // 0 Sun … 6 Sat
    const toMon = day === 0 ? -6 : 1 - day;
    x.setDate(x.getDate() + toMon);
    return dayKey(x);
  }

  /** Next Monday 00:00 local after the current week (or today if already Monday before use). */
  function nextMondayLabel(d = new Date()) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = x.getDay();
    const add = day === 0 ? 1 : 8 - day;
    x.setDate(x.getDate() + add);
    return x.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  }

  function unlockMessage({ dayExhausted, weekExhausted }) {
    if (weekExhausted) {
      return `Weekly limit reached — unlocks Monday (${nextMondayLabel()}).`;
    }
    if (dayExhausted) {
      return 'Daily limit reached — unlocks tomorrow.';
    }
    return '';
  }

  window.PolicyLimits = {
    UNLIMITED,
    TIER_LIMITS,
    forTier,
    ANON_POSTS,
    AI_DISCOVERY_MSG,
    PEEPAL_POST,
    AI_KB,
    dayKey,
    weekKeyMonday,
    nextMondayLabel,
    unlockMessage,
  };
})();
