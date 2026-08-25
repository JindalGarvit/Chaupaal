/**
 * Dangal graduation / honesty badges — until a title meets the quality bar + Live sync,
 * Manch must not present it as finished Live multiplayer.
 *
 * grade:
 *   graduated — solo quality bar met (Phase 1+)
 *   live      — real friend sync available
 *   practice  — playable but Practice-labeled (AI / local only)
 *   polish    — thin / rebuilding
 */
(function () {
  'use strict';

  /** @type {Record<string, { grade: string, sync: string, stakes?: boolean, label?: string }>} */
  const GRADUATION = {
    // Phase 1 solos — graduated as each passes quality bar
    brickbreaker: { grade: 'graduated', sync: 'none', stakes: false },
    rushrunner: { grade: 'graduated', sync: 'none', stakes: false },
    tiptap: { grade: 'graduated', sync: 'none', stakes: false },
    ankjod: { grade: 'graduated', sync: 'none', stakes: false },
    kakuro: { grade: 'graduated', sync: 'none', stakes: false },
    wordguess: { grade: 'graduated', sync: 'none', stakes: false },

    // Phase 2 boards — Live when friend UID + matchId; Phase 6 stakes on
    chess: { grade: 'live', sync: 'live1v1', stakes: true },
    ttt: { grade: 'live', sync: 'live1v1', stakes: true },
    fiveinrow: { grade: 'live', sync: 'live1v1', stakes: true },

    // Dual / party — Muqabala Live + stakes (Phase 6)
    quiz: { grade: 'live', sync: 'live1v1', stakes: true, label: 'Live 1v1' },
    snakes: { grade: 'live', sync: 'liveParty', stakes: true },
    ludo: { grade: 'live', sync: 'liveParty', stakes: true },
    uno: { grade: 'live', sync: 'liveParty', stakes: true },
    business: { grade: 'live', sync: 'live1v1', stakes: true },
    scribble: { grade: 'live', sync: 'liveParty', stakes: true },

    // Classics + court — Live 1v1 state sync (snapshot / score events)
    carrom: { grade: 'live', sync: 'live1v1', stakes: true },
    pool: { grade: 'live', sync: 'live1v1', stakes: true },
    rummy: { grade: 'live', sync: 'live1v1', stakes: true },
    teenpatti: { grade: 'live', sync: 'live1v1', stakes: true },
    bluff: { grade: 'live', sync: 'live1v1', stakes: true },
    sattepe: { grade: 'live', sync: 'live1v1', stakes: true },
    andarbaahar: { grade: 'live', sync: 'live1v1', stakes: true },
    tambola: { grade: 'live', sync: 'live1v1', stakes: true },
    streetcricket: { grade: 'graduated', sync: 'none', label: 'Practice' },
    gullykick: { grade: 'graduated', sync: 'none', label: 'Practice' },
    badminton: { grade: 'live', sync: 'live1v1', stakes: true },
    tabletennis: { grade: 'live', sync: 'live1v1', stakes: true },
    pickleball: { grade: 'live', sync: 'live1v1', stakes: true },
    tennis: { grade: 'live', sync: 'live1v1', stakes: true },
    kabaddi: { grade: 'live', sync: 'live1v1', stakes: true },
    patangbaazi: { grade: 'graduated', sync: 'none', label: 'Practice' },
  };

  function getGameGraduation(gameId) {
    const id = typeof canonicalGameId === 'function' ? canonicalGameId(gameId) : String(gameId || '');
    return (
      GRADUATION[id] || {
        grade: 'practice',
        sync: 'none',
        stakes: false,
      }
    );
  }

  function setGameGraduation(gameId, patch) {
    const id = typeof canonicalGameId === 'function' ? canonicalGameId(gameId) : String(gameId || '');
    if (!id) return;
    GRADUATION[id] = Object.assign({}, getGameGraduation(id), patch || {});
  }

  /** Honest Manch badge HTML — never mark Practice-only sports as Live */
  function dangalHonestyBadgeHtml(game) {
    const g = game || {};
    const id = g.id || '';
    const info = getGameGraduation(id);
    if (info.grade === 'polish') {
      return '<span class="dangal-honesty-tag dangal-honesty-tag--polish">Coming polish</span>';
    }
    if (info.grade === 'practice') {
      return '<span class="dangal-honesty-tag dangal-honesty-tag--practice">Practice</span>';
    }
    if (info.grade === 'graduated' || g.solo || g.gameType === 'solo') {
      // Graduated solos + graduated Practice sports (honest Practice, quality bar met)
      if (info.sync === 'none' && info.label === 'Practice') {
        return '<span class="dangal-honesty-tag dangal-honesty-tag--practice">Practice</span>';
      }
      return '<span class="dangal-honesty-tag dangal-honesty-tag--solo">Solo</span>';
    }
    if (info.grade === 'live' && (info.sync === 'live1v1' || info.sync === 'liveParty')) {
      const liveLabel = info.sync === 'liveParty' ? 'Live' : 'Live 1v1';
      return `<span class="dangal-honesty-tag dangal-honesty-tag--live">${liveLabel}</span>`;
    }
    return '<span class="dangal-honesty-tag dangal-honesty-tag--practice">Practice</span>';
  }

  function isLiveCapable(gameId) {
    const info = getGameGraduation(gameId);
    return info.sync === 'live1v1' || info.sync === 'liveParty' || info.grade === 'live';
  }

  function stakesEnabled(gameId) {
    return !!getGameGraduation(gameId).stakes;
  }

  /**
   * Phase 9 prep — retirement / quality gate without deleting titles.
   * hideDefault: omit from default Manch grid (still reachable if known).
   */
  function dangalManchVisibility(gameId) {
    const info = getGameGraduation(gameId);
    if (info.hideDefault) return 'hidden';
    if (info.grade === 'polish') return 'deemphasized';
    return 'default';
  }

  window.DANGAL_GRADUATION = GRADUATION;
  window.getGameGraduation = getGameGraduation;
  window.setGameGraduation = setGameGraduation;
  window.dangalHonestyBadgeHtml = dangalHonestyBadgeHtml;
  window.isLiveCapable = isLiveCapable;
  window.stakesEnabledForGame = stakesEnabled;
  window.dangalManchVisibility = dangalManchVisibility;
})();
