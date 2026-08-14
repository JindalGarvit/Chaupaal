/**
 * Profile Dangal stats — reads Admin-written users/{uid}/gameStats.
 */
(function () {
  'use strict';

  async function renderDangalProfileSection(uid, containerEl) {
    if (!containerEl || !uid || typeof db === 'undefined' || !db) return;
    containerEl.innerHTML = '<p class="dangal-profile__empty">Loading…</p>';
    try {
      const snap = await db.collection('users').doc(uid).collection('gameStats').limit(40).get();
      const played = snap.docs
        .map((d) => Object.assign({ gameType: d.id }, d.data()))
        .filter((s) => (s.totalGames || 0) > 0)
        .sort((a, b) => (b.totalGames || 0) - (a.totalGames || 0));
      if (!played.length) {
        containerEl.innerHTML = '<p class="dangal-profile__empty">No games played yet.</p>';
        return;
      }
      const totalGames = played.reduce((s, x) => s + (x.totalGames || 0), 0);
      const totalWins = played.reduce((s, x) => s + (x.wins || 0), 0);
      const top = played.filter((s) => s.elo).sort((a, b) => (b.elo || 0) - (a.elo || 0))[0];
      const cards = played
        .slice(0, 8)
        .map((stats) => {
          const id = typeof getGameIdentity === 'function' ? getGameIdentity(stats.gameType) || {} : {};
          return (
            '<div class="dangal-profile__game-card" style="--game-primary:' +
            (id.primary || '#888') +
            '"><span>' +
            (id.icon || '🎮') +
            '</span><span>' +
            (id.label || stats.gameType) +
            '</span>' +
            (stats.elo ? '<span>♟ ' + stats.elo + '</span>' : '') +
            '<span>' +
            (stats.wins || 0) +
            'W · ' +
            Math.max(0, (stats.totalGames || 0) - (stats.wins || 0)) +
            'L</span></div>'
          );
        })
        .join('');
      containerEl.innerHTML =
        '<div class="dangal-profile__summary"><div><strong>' +
        totalGames +
        '</strong><span>Games</span></div><div><strong>' +
        totalWins +
        '</strong><span>Wins</span></div>' +
        (top
          ? '<div><strong>' +
            top.elo +
            '</strong><span>' +
            ((typeof getGameIdentity === 'function' && getGameIdentity(top.gameType)?.label) || '') +
            ' ELO</span></div>'
          : '') +
        '</div><div class="dangal-profile__games-grid">' +
        cards +
        '</div>';
    } catch (e) {
      containerEl.innerHTML = '<p class="dangal-profile__empty">Stats unavailable.</p>';
    }
  }

  window.renderDangalProfileSection = renderDangalProfileSection;
})();
