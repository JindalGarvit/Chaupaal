/**
 * Weekly Dangal board — reads Admin-written weeklyLeaderboard scores.
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
    const snap = await db
      .collection('weeklyLeaderboard')
      .doc(weekKey())
      .collection('scores')
      .where('gameType', '==', g)
      .limit(50)
      .get();
    return snap.docs
      .map((d) => d.data())
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .map((e, i) => Object.assign({}, e, { rank: i + 1, mine: e.uid === uid }));
  }

  async function loadWeeklyHub(uid) {
    if (typeof db === 'undefined' || !db) return [];
    const snap = await db.collection('weeklyLeaderboard').doc(weekKey()).collection('scores').limit(80).get();
    const byUid = {};
    snap.docs.forEach((d) => {
      const row = d.data() || {};
      const id = String(row.uid || '');
      if (!id) return;
      if (!byUid[id]) byUid[id] = { uid: id, score: 0, wins: 0, games: 0 };
      byUid[id].score += Number(row.score) || 0;
      byUid[id].wins += Number(row.wins) || 0;
      byUid[id].games += Number(row.games) || 0;
    });
    return Object.keys(byUid)
      .map((id) => byUid[id])
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 10)
      .map((e, i) => Object.assign({}, e, { rank: i + 1, mine: e.uid === uid }));
  }

  function renderWeeklyHubHtml(entries) {
    const rows = entries || [];
    if (!rows.length) {
      return '<div class="dangal-friends-board"><div class="dangal-section-label">This week</div><p class="dangal-profile__empty">Play a rated game to open the weekly board.</p></div>';
    }
    return (
      '<div class="dangal-friends-board"><div class="dangal-section-label">This week</div>' +
      rows
        .map((e) => {
          return (
            '<div class="dangal-friends-row' +
            (e.mine ? ' is-you' : '') +
            '"><span class="dangal-friends-rank">' +
            e.rank +
            '</span><span class="dangal-friends-name">' +
            (e.mine ? 'You' : 'Player') +
            '</span><span class="dangal-friends-rating">' +
            (e.score || 0) +
            '</span></div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  async function mountWeeklyHub(host, uid) {
    if (!host) return;
    host.innerHTML = '<div class="dangal-friends-board"><p class="dangal-profile__empty">Loading week…</p></div>';
    try {
      const rows = await loadWeeklyHub(uid);
      host.innerHTML = renderWeeklyHubHtml(rows);
    } catch (e) {
      host.innerHTML = '<div class="dangal-friends-board"><p class="dangal-profile__empty">Week board unavailable.</p></div>';
    }
  }

  window.loadWeeklyLeaderboard = loadWeeklyLeaderboard;
  window.loadWeeklyHub = loadWeeklyHub;
  window.mountWeeklyHub = mountWeeklyHub;
  window.dangalWeekKey = weekKey;
})();
