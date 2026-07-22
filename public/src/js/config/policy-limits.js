/**
 * Policy limits — single source of truth for scarcity caps.
 * Change numbers here only; callers import via window.PolicyLimits.
 *
 * Week reset: fixed calendar week starting Monday 00:00 local time
 * (same style for anonymous posts and AI Discovery messaging).
 */
(function () {
  'use strict';

  const ANON_POSTS = Object.freeze({
    perDay: 2,
    perWeek: 7,
  });

  const AI_DISCOVERY_MSG = Object.freeze({
    perDay: 3,
    perWeek: 10,
  });

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
    ANON_POSTS,
    AI_DISCOVERY_MSG,
    dayKey,
    weekKeyMonday,
    nextMondayLabel,
    unlockMessage,
  };
})();
