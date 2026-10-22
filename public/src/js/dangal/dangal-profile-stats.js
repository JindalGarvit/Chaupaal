/**
 * Profile Dangal stats — reads Admin-written users/{uid}/gameStats.
 */
(function () {
  'use strict';

  async function renderDangalProfileSection(uid, containerEl) {
    if (!containerEl || !uid || typeof db === 'undefined' || !db) return;
    if (typeof renderSkeleton === 'function') renderSkeleton(containerEl, { variant: 'detail', count: 1 });
    else containerEl.innerHTML = '<p class="dangal-profile__empty">' + tHtml('dangal.classics.loading') + '</p>';
    const load = async () => {
      try {
      const snap = await db.collection('users').doc(uid).collection('gameStats').limit(40).get();
      const played = snap.docs
        .map((d) => Object.assign({ gameType: d.id }, d.data()))
        .filter((s) => (s.totalGames || 0) > 0 && !s.bucket)
        .filter((s) => !(typeof isRetiredGameId === 'function' && isRetiredGameId(s.gameType)))
        .sort((a, b) => (b.totalGames || 0) - (a.totalGames || 0));
      if (!played.length) {
        containerEl.innerHTML = '<p class="dangal-profile__empty">' + tHtml('dangal.no_games_played_yet') + '</p>';
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
      const provTag = (v) => (v && v.provisional ? ' <small class="dangal-profile__prov">' + tHtml('common.dangal_rating_provisional') + '</small>' : '');
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
        '</strong><span>' + tHtml('dangal.games') + '</span></div><div><strong>' +
        totalWins +
        '</strong><span>' + tHtml('dangal.wins_2') + '</span></div>' +
        (top
          ? '<div><strong>' +
            top.view.rating +
            '</strong><span>' +
            tHtml(top.view.provisional ? 'dangal.game_rating_provisional' : 'dangal.game_rating', { game: (typeof getGameIdentity === 'function' && getGameIdentity(top.gameType)?.label) || '' }) +
            '</span></div>'
          : '') +
        '</div><div class="dangal-profile__games-grid">' +
        cards +
        '</div>';
      } catch (e) {
        if (typeof renderErrorState === 'function') {
          renderErrorState(containerEl, {
            title: t('dangal.stats_unavailable'),
            message: typeof friendlyError === 'function' ? friendlyError(e) : t('common.please_try_again'),
            onRetry: load,
          });
        } else {
          containerEl.innerHTML = '<p class="dangal-profile__empty">' + tHtml('dangal.stats_unavailable_2') + '</p>';
        }
      }
    };
    await load();
    const own = typeof getCurrentUid === 'function' && getCurrentUid() === uid;
    const SC = window.StreetCricketGame;
    if (own && SC && typeof SC.historyCount === 'function' && SC.historyCount() > 0) {
      const box = document.createElement('div');
      box.className = 'dangal-profile__cricket';
      containerEl.appendChild(box);
      SC.mountHistory(box);
    }
  }

  window.renderDangalProfileSection = renderDangalProfileSection;
})();
