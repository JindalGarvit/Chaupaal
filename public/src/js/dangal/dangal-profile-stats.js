/**
 * Profile Dangal stats — reads Admin-written users/{uid}/gameStats.
 */
(function () {
  'use strict';

  async function renderDangalProfileSection(uid, containerEl) {
    if (!containerEl || !uid || typeof db === 'undefined' || !db) return;
    if (typeof renderSkeleton === 'function') renderSkeleton(containerEl, { variant: 'detail', count: 1 });
    else containerEl.innerHTML = '<p class="dangal-profile__empty">Loading…</p>';
    const load = async () => {
      try {
      const snap = await db.collection('users').doc(uid).collection('gameStats').limit(40).get();
      const played = snap.docs
        .map((d) => Object.assign({ gameType: d.id }, d.data()))
        .filter((s) => (s.totalGames || 0) > 0 && !s.bucket)
        .filter((s) => !(typeof isRetiredGameId === 'function' && isRetiredGameId(s.gameType)))
        .sort((a, b) => (b.totalGames || 0) - (a.totalGames || 0));
      if (!played.length) {
        containerEl.innerHTML = '<p class="dangal-profile__empty">No games played yet.</p>';
        return;
      }
      const totalGames = played.reduce((s, x) => s + (x.totalGames || 0), 0);
      const totalWins = played.reduce((s, x) => s + (x.wins || 0), 0);
      const M = window.DangalRatingMath;
      const ratedView = (s) => {
        if (!M || !M.isRated(s.gameType) || !s.elo) return null;
        const rec = M.fromStats(s);
        return { rating: Math.round(rec.r), provisional: M.isProvisional(rec) };
      };
      const provTag = (v) => (v && v.provisional ? ' <small class="dangal-profile__prov">Provisional</small>' : '');
      const top = played
        .map((s) => Object.assign({ view: ratedView(s) }, s))
        .filter((s) => s.view)
        .sort((a, b) => b.view.rating - a.view.rating)[0];
      const cards = played
        .slice(0, 8)
        .map((stats) => {
          const id = typeof getGameIdentity === 'function' ? getGameIdentity(stats.gameType) || {} : {};
          const view = ratedView(stats);
          return (
            '<div class="dangal-profile__game-card" style="--game-primary:' +
            (id.primary || '#888') +
            '"><span class="dangal-profile__game-mark">' +
            (typeof gameMarkHtml === 'function'
              ? gameMarkHtml(stats.gameType, { size: 22 })
              : id.icon || '🎮') +
            '</span><span>' +
            (id.label || stats.gameType) +
            '</span>' +
            (view ? '<span>★ ' + view.rating + provTag(view) + '</span>' : '') +
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
            top.view.rating +
            '</strong><span>' +
            ((typeof getGameIdentity === 'function' && getGameIdentity(top.gameType)?.label) || '') +
            (top.view.provisional ? ' rating · Provisional' : ' rating') +
            '</span></div>'
          : '') +
        '</div><div class="dangal-profile__games-grid">' +
        cards +
        '</div>';
      } catch (e) {
        if (typeof renderErrorState === 'function') {
          renderErrorState(containerEl, {
            title: 'Stats unavailable',
            message: typeof friendlyError === 'function' ? friendlyError(e) : 'Please try again.',
            onRetry: load,
          });
        } else {
          containerEl.innerHTML = '<p class="dangal-profile__empty">Stats unavailable.</p>';
        }
      }
    };
    await load();
  }

  window.renderDangalProfileSection = renderDangalProfileSection;
})();
