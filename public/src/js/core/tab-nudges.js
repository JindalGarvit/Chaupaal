/**
 * Tab nudge engine — soft local notifications only when backed by real state.
 * Never invents social activity ("someone nearby", "attracting looks").
 *
 * Eligibility (per tab, once/day, Quiet + tips-off + guest skip):
 *   akhbaar — reading streak ≥ 2 at risk (no play today) OR real unread on tab
 *   duniya  — real unread (likes/comments/etc.) only
 *   peepal  — real unread OR pending friend requests count > 0
 *   baithak — real unread (DMs / requests)
 *   dangal  — real unread OR GOTD / daily challenge not yet played today
 * Otherwise: silence (no aspirational / fictional copy).
 */
(function () {
  'use strict';

  const TAB_ICONS = {
    akhbaar: '📰',
    duniya: '🌍',
    peepal: '🌳',
    baithak: '💬',
    dangal: '⚔️',
  };

  const sessionScheduled = new Set();

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function isGuest() {
    try {
      if (typeof window.isGuestUser === 'function') return !!window.isGuestUser();
      if (typeof window.guestMode !== 'undefined') return !!window.guestMode;
    } catch (e) {}
    return false;
  }

  function isQuiet() {
    try {
      if (typeof window.quietModeEnabled === 'function') return !!window.quietModeEnabled();
      if (typeof window.quietMode !== 'undefined') return !!window.quietMode;
      if (localStorage.getItem('chaupaal_quiet') === '1') return true;
    } catch (e) {}
    return false;
  }

  function tipsAllowed() {
    try {
      if (typeof window.isNotifEnabled === 'function') return !!window.isNotifEnabled('tips');
    } catch (e) {}
    return true;
  }

  function unreadOn(tab) {
    try {
      if (typeof window.unreadNotifCount === 'function') return Number(window.unreadNotifCount(tab)) || 0;
    } catch (e) {}
    return 0;
  }

  function pendingFriendRequests() {
    try {
      if (typeof window.pendingIncomingFriendCount === 'function') {
        return Number(window.pendingIncomingFriendCount()) || 0;
      }
      if (typeof window.getPendingFriendRequestCount === 'function') {
        return Number(window.getPendingFriendRequestCount()) || 0;
      }
      if (typeof window.pendingFriendRequestCount === 'number') {
        return Number(window.pendingFriendRequestCount) || 0;
      }
    } catch (e) {}
    return 0;
  }

  function streakAtRisk() {
    try {
      const streak = Number(typeof window.streakCount === 'number' ? window.streakCount : window.userStreak) || 0;
      if (streak < 2) return false;
      const played = localStorage.getItem('chaupaal_akhbaar_played_' + todayKey());
      return !played;
    } catch (e) {
      return false;
    }
  }

  function dangalPendingToday() {
    try {
      if (localStorage.getItem('chaupaal_gotd_played_' + todayKey()) === '1') return false;
      if (localStorage.getItem('chaupaal_dangal_played_' + todayKey()) === '1') return false;
      // Only nudge if we know GOTD exists / user has played before (real engagement history)
      const ever = localStorage.getItem('chaupaal_dangal_ever_played') || localStorage.getItem('chaupaal_gotd_ever');
      return !!ever;
    } catch (e) {
      return false;
    }
  }

  /**
   * @returns {{ text: string }|null}
   */
  function resolveHonestNudge(tab) {
    const unread = unreadOn(tab);
    if (unread > 0) {
      const n = unread === 1 ? '1 new notification' : `${unread} new notifications`;
      return { text: `You have ${n} in ${tabLabel(tab)}.` };
    }
    if (tab === 'akhbaar' && streakAtRisk()) {
      const streak = Number(window.streakCount || window.userStreak) || 0;
      return { text: `Your ${streak}-day Akhbaar streak needs a play today to stay alive.` };
    }
    if (tab === 'peepal') {
      const reqs = pendingFriendRequests();
      if (reqs > 0) {
        return {
          text: reqs === 1 ? 'You have a friend request waiting.' : `You have ${reqs} friend requests waiting.`,
        };
      }
    }
    if (tab === 'dangal' && dangalPendingToday()) {
      return { text: 'Today’s Dangal challenge is still open — jump in when you’re ready.' };
    }
    return null;
  }

  function tabLabel(tab) {
    return (
      {
        akhbaar: 'Akhbaar',
        duniya: 'Duniya',
        peepal: 'Peepal',
        baithak: 'Baithak',
        dangal: 'Dangal',
      }[tab] || tab
    );
  }

  function scheduleTabNudge(tab) {
    if (!TAB_ICONS[tab]) return;
    if (sessionScheduled.has(tab)) return;

    const uid = (typeof currentUser !== 'undefined' && currentUser?.uid) || null;
    if (!uid) return;
    if (isGuest()) return;
    if (isQuiet()) return;
    if (!tipsAllowed()) return;

    const storageKey = `chaupaal_tab_nudge_v1_${uid}_${tab}_${todayKey()}`;
    if (localStorage.getItem(storageKey)) return;

    sessionScheduled.add(tab);

    const delay = 30000 + Math.random() * 90000;
    setTimeout(() => {
      try {
        if (isQuiet()) return;
        if (!tipsAllowed()) return;
        if (localStorage.getItem(storageKey)) return;

        const nudge = resolveHonestNudge(tab);
        if (!nudge?.text) return;

        if (typeof window.addLocalNotification === 'function') {
          window.addLocalNotification({
            type: tab + '_nudge',
            icon: TAB_ICONS[tab] || '🔔',
            text: nudge.text,
            section: tab,
          });
        }
        localStorage.setItem(storageKey, '1');
      } catch (e) {}
    }, delay);
  }

  window.scheduleTabNudge = scheduleTabNudge;
  window.resolveHonestTabNudge = resolveHonestNudge;
})();
