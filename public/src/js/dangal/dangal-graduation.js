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
    snakes: { grade: 'live', sync: 'liveParty', stakes: false },
    ludo: { grade: 'live', sync: 'liveParty', stakes: false },
    uno: { grade: 'live', sync: 'liveParty', stakes: false },
    business: { grade: 'practice', sync: 'none' },
    scribble: { grade: 'live', sync: 'liveParty', stakes: false },

    // Classics — Practice with honest labels; Live when friend UID
    carrom: { grade: 'practice', sync: 'none' },
    pool: { grade: 'practice', sync: 'none' },
    rummy: { grade: 'practice', sync: 'none' },
    teenpatti: { grade: 'practice', sync: 'none' },
    bluff: { grade: 'practice', sync: 'none' },
    sattepe: { grade: 'practice', sync: 'none' },
    andarbaahar: { grade: 'practice', sync: 'none' },
    tambola: { grade: 'practice', sync: 'none' },
    streetcricket: { grade: 'practice', sync: 'none', label: 'Practice' },
    gullykick: { grade: 'practice', sync: 'none', label: 'Practice' },
    badminton: { grade: 'practice', sync: 'none', label: 'Practice' },
    tabletennis: { grade: 'practice', sync: 'none', label: 'Practice' },
    pickleball: { grade: 'practice', sync: 'none', label: 'Practice' },
    tennis: { grade: 'practice', sync: 'none', label: 'Practice' },
    kabaddi: { grade: 'practice', sync: 'none', label: 'Practice' },
    patangbaazi: { grade: 'practice', sync: 'none', label: 'Practice' },
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
    if (info.grade === 'live' && (info.sync === 'live1v1' || info.sync === 'liveParty')) {
      const liveLabel = info.sync === 'liveParty' ? 'Live' : 'Live 1v1';
      return `<span class="dangal-honesty-tag dangal-honesty-tag--live">${liveLabel}</span>`;
    }
    if (info.grade === 'graduated' || g.solo || g.gameType === 'solo') {
      return '<span class="dangal-honesty-tag dangal-honesty-tag--solo">Solo</span>';
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
