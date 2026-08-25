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

    // Phase 2 boards — Live when friend UID + matchId
    chess: { grade: 'live', sync: 'live1v1', stakes: false },
    ttt: { grade: 'live', sync: 'live1v1', stakes: false },
    fiveinrow: { grade: 'live', sync: 'live1v1', stakes: false },

    // Dual / party — Practice until Phase 3–5
    quiz: { grade: 'practice', sync: 'none', label: 'Practice' },
    snakes: { grade: 'practice', sync: 'none' },
    ludo: { grade: 'practice', sync: 'none' },
    uno: { grade: 'practice', sync: 'none' },
    business: { grade: 'practice', sync: 'none' },
    scribble: { grade: 'practice', sync: 'none' },

    // Classics / sports — Practice until rebuild
    carrom: { grade: 'practice', sync: 'none' },
    pool: { grade: 'practice', sync: 'none' },
    rummy: { grade: 'practice', sync: 'none' },
    teenpatti: { grade: 'practice', sync: 'none' },
    bluff: { grade: 'practice', sync: 'none' },
    sattepe: { grade: 'practice', sync: 'none' },
    andarbaahar: { grade: 'practice', sync: 'none' },
    tambola: { grade: 'practice', sync: 'none' },
    streetcricket: { grade: 'practice', sync: 'none' },
    gullykick: { grade: 'practice', sync: 'none' },
    badminton: { grade: 'practice', sync: 'none' },
    tabletennis: { grade: 'practice', sync: 'none' },
    pickleball: { grade: 'practice', sync: 'none' },
    tennis: { grade: 'practice', sync: 'none' },
    kabaddi: { grade: 'practice', sync: 'none' },
    patangbaazi: { grade: 'practice', sync: 'none' },
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

  /** Honest Manch badge HTML */
  function dangalHonestyBadgeHtml(game) {
    const g = game || {};
    const id = g.id || '';
    const info = getGameGraduation(id);
    if (info.grade === 'live' || g.liveDuel) {
      return '<span class="dangal-honesty-tag dangal-honesty-tag--live">Live 1v1</span>';
    }
    if (info.grade === 'graduated' || g.solo || g.gameType === 'solo') {
      return '<span class="dangal-honesty-tag dangal-honesty-tag--solo">Solo</span>';
    }
    if (info.grade === 'polish') {
      return '<span class="dangal-honesty-tag dangal-honesty-tag--polish">Coming polish</span>';
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

  window.DANGAL_GRADUATION = GRADUATION;
  window.getGameGraduation = getGameGraduation;
  window.setGameGraduation = setGameGraduation;
  window.dangalHonestyBadgeHtml = dangalHonestyBadgeHtml;
  window.isLiveCapable = isLiveCapable;
  window.stakesEnabledForGame = stakesEnabled;
})();
