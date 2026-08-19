/**
 * Tab nudge engine — injects a soft local notification for each tab
 * if the tab has been silent that day. Purely client-side; no Firestore writes.
 */
(function () {
  'use strict';

  const NUDGE_COPY = {
    akhbaar: [
      "Today's quiz is live — how well do you know the news?",
      'A new story just broke — check Akhbaar.',
      'Your reading streak is still going — keep it up.',
      'Catch up on what the world is talking about today.',
    ],
    duniya: [
      'Someone might have posted something worth seeing — check Duniya.',
      'Stories disappear in 24h — don't miss them.',
      'Anything you want to share today?',
      'Your Duniya feed has fresh posts waiting.',
    ],
    peepal: [
      'New people are joining Chaupaal — you might click with someone.',
      'Someone nearby is looking for a travel companion.',
      'Your profile is attracting looks — see who.',
      'Someone new matched your interests today.',
    ],
    baithak: [
      'Your friends might be wondering where you are — drop a Split.',
      'A group you're in had some activity.',
      'Send a Split to friends today.',
      'Baithak is quiet — be the one to break the silence.',
    ],
    dangal: [
      'Today's Akhbaar game is waiting — 2 minutes to play.',
      'You haven't challenged anyone today — pick a duel.',
      'Your Dangal streak is intact — play to keep it.',
      'A new Dangal round is open — jump in.',
    ],
  };

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
    } catch (e) {}
    return false;
  }

  function scheduleTabNudge(tab) {
    if (!NUDGE_COPY[tab]) return;
    if (sessionScheduled.has(tab)) return;

    const uid = (typeof currentUser !== 'undefined' && currentUser?.uid) || null;
    if (!uid) return;
    if (isGuest()) return;
    if (isQuiet()) return;

    const storageKey = `chaupaal_tab_nudge_v1_${uid}_${tab}_${todayKey()}`;
    if (localStorage.getItem(storageKey)) return;

    sessionScheduled.add(tab);

    const delay = 30000 + Math.random() * 90000;
    setTimeout(() => {
      try {
        if (isQuiet()) return;
        const count = typeof window.unreadNotifCount === 'function' ? window.unreadNotifCount(tab) : 0;
        if (count > 0) return;
        if (localStorage.getItem(storageKey)) return;

        const copies = NUDGE_COPY[tab] || [];
        if (!copies.length) return;
        const text = copies[Math.floor(Math.random() * copies.length)];
        if (!text) return;

        if (typeof window.addLocalNotification === 'function') {
          window.addLocalNotification({
            type: tab + '_nudge',
            icon: TAB_ICONS[tab] || '🔔',
            text,
            section: tab,
          });
        }
        localStorage.setItem(storageKey, '1');
      } catch (e) {}
    }, delay);
  }

  window.scheduleTabNudge = scheduleTabNudge;
})();
