/**
 * Weekly friends leaderboard — reads Admin-written weeklyLeaderboard scores.
 */
(function () {
  'use strict';

  function weekKey() {
    const d = new Date();
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
    return date.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
  }

  async function loadWeeklyLeaderboard(gameType, uid) {
    if (typeof db === 'undefined' || !db) return [];
    const g = typeof canonicalGameId === 'function' ? canonicalGameId(gameType) : gameType;
    const snap = await db.collection('weeklyLeaderboard').doc(weekKey()).collection('scores').where('gameType', '==', g).limit(50).get();
    return snap.docs
      .map((d) => d.data())
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .map((e, i) => Object.assign({}, e, { rank: i + 1, mine: e.uid === uid }));
  }

  window.loadWeeklyLeaderboard = loadWeeklyLeaderboard;
  window.dangalWeekKey = weekKey;
})();
