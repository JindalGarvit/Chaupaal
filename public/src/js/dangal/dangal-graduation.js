/**
 * Dangal graduation / honesty badges — until a title meets the quality bar + Live sync,
 * Manch must not present it as finished Live multiplayer.
 *
 * grade:
 *   graduated — solo quality bar met (Phase 1+)
 *   live      — real friend sync available
 *   practice  — playable but Practice-labeled (AI / local only)
 *   polish    — thin / rebuilding
 *   party     — party kit title: Pass & Play on one phone + Room across phones (points, never chips)
 */
(function () {
  'use strict';

  /** @type {Record<string, { grade: string, sync: string, stakes?: boolean, label?: string }>} */
  const GRADUATION = {
    // Phase 1 solos — graduated as each passes quality bar
    brickbreaker: { grade: 'graduated', sync: 'none', stakes: false },
    tiptap: { grade: 'graduated', sync: 'none', stakes: false },
    ankjod: { grade: 'graduated', sync: 'none', stakes: false },
    kakuro: { grade: 'graduated', sync: 'none', stakes: false },
    wordguess: { grade: 'graduated', sync: 'none', stakes: false },

    // Phase 2 boards — Live when friend UID + matchId; Phase 6 stakes on
    chess: { grade: 'live', sync: 'live1v1', stakes: true },
    ttt: { grade: 'live', sync: 'live1v1', stakes: true },

    // Dual / party — Muqabala Live + stakes (Phase 6)
    quiz: { grade: 'live', sync: 'live1v1', stakes: true, label: 'Live 1v1' },
    snakes: { grade: 'live', sync: 'live1v1', stakes: true },
    ludo: { grade: 'live', sync: 'liveParty', stakes: true },
    uno: { grade: 'live', sync: 'liveParty', stakes: true },
    scribble: { grade: 'live', sync: 'liveParty', stakes: true },

    // Party kit (G1+) — Pass & Play on one phone or a Room across phones; points only, never chips
    imposter: { grade: 'party', sync: 'partyRoom', stakes: false, label: 'Party' },
    rajamantri: { grade: 'party', sync: 'partyRoom', stakes: false, label: 'Party' },
    charades: { grade: 'party', sync: 'partyRoom', stakes: false, label: 'Party' },
    mostlikely: { grade: 'party', sync: 'partyRoom', stakes: false, label: 'Party' },

    // Classics + court — Live 1v1 state sync (snapshot / score events)
    carrom: { grade: 'live', sync: 'live1v1', stakes: true },
    rummy: { grade: 'live', sync: 'live1v1', stakes: true },
    teenpatti: { grade: 'live', sync: 'live1v1', stakes: true },
    bluff: { grade: 'live', sync: 'live1v1', stakes: true },
    tambola: { grade: 'live', sync: 'live1v1', stakes: true },
    streetcricket: { grade: 'live', sync: 'live1v1', stakes: true, label: 'Live 1v1' },
    badminton: { grade: 'live', sync: 'live1v1', stakes: true },
    patangbaazi: { grade: 'live', sync: 'live1v1', stakes: true, label: 'Live 1v1' },
  };

  /**
   * Dangal roster — the only list of shipped titles. Registry, pickers, game-of-day and
   * challenge surfaces read this. New titles (party G1–G3) are added here in one place.
   */
  const ROSTER_SECTIONS = [
    { id: 'rw_sports', label: 'RW Sports' },
    { id: 'brain', label: 'Brain Boost' },
    { id: 'board', label: 'Board & Classics' },
    { id: 'party', label: 'Party & Social' },
    { id: 'arcade', label: 'Arcade Rush' },
    { id: 'quiz', label: 'Quiz & Duel' },
  ];

  /** @type {{ id: string, genre: string }[]} */
  const ROSTER = [
    { id: 'tiptap', genre: 'brain' },
    { id: 'brickbreaker', genre: 'arcade' },
    { id: 'ankjod', genre: 'brain' },
    { id: 'wordguess', genre: 'brain' },
    { id: 'chess', genre: 'board' },
    { id: 'ttt', genre: 'board' },
    { id: 'snakes', genre: 'board' },
    { id: 'ludo', genre: 'board' },
    { id: 'uno', genre: 'party' },
    { id: 'scribble', genre: 'party' },
    { id: 'quiz', genre: 'quiz' },
    { id: 'carrom', genre: 'board' },
    { id: 'rummy', genre: 'party' },
    { id: 'teenpatti', genre: 'party' },
    { id: 'bluff', genre: 'party' },
    { id: 'tambola', genre: 'party' },
    { id: 'streetcricket', genre: 'rw_sports' },
    { id: 'badminton', genre: 'rw_sports' },
    { id: 'patangbaazi', genre: 'arcade' },
    // Party kit titles (G1+) — Pass & Play on one phone or a Room across phones.
    { id: 'imposter', genre: 'party', partyKit: true },
    { id: 'rajamantri', genre: 'party', partyKit: true },
    { id: 'charades', genre: 'party', partyKit: true },
    { id: 'mostlikely', genre: 'party', partyKit: true },
  ];
  const ROSTER_IDS = ROSTER.map((r) => r.id);
  /** Aliases that resolve to a roster id (kept in sync with GAME_ID_ALIASES). */
  const ROSTER_ALIASES = { kakuro: 'ankjod' };

  /** Retired titles (G0 cull) + their legacy link spellings — old links land on the retired screen. */
  const RETIRED_IDS = [
    'rushrunner', 'pool', 'bowling', 'pickleball', 'tennis', 'fiveinrow', 'andarbaahar',
    'sattepe', 'business', 'tabletennis', 'kabaddi', 'khokho', 'gullykick',
  ];
  const RETIRED_ALIASES = [
    'fiveinarow', 'football', 'snooker', 'billiards', 'andarbahar', 'sattepesatta', 'kho-kho',
  ];
  const RETIRED_SET = new Set(RETIRED_IDS.concat(RETIRED_ALIASES));

  function normId(gameId) {
    return String(gameId == null ? '' : gameId).trim().toLowerCase();
  }

  function isRetiredGameId(gameId) {
    return RETIRED_SET.has(normId(gameId));
  }

  function isRosterGameId(gameId) {
    const raw = normId(gameId);
    const id = ROSTER_ALIASES[raw] || raw;
    return ROSTER_IDS.indexOf(id) >= 0;
  }

  function rosterGenre(gameId) {
    const raw = normId(gameId);
    const id = ROSTER_ALIASES[raw] || raw;
    const hit = ROSTER.find((r) => r.id === id);
    return hit ? hit.genre : '';
  }

  function browseDangalGames() {
    const btn = document.querySelector('.tab-btn[data-tab="dangal"]');
    if (btn) btn.click();
    else if (typeof initDangal === 'function') initDangal();
  }

  /** Calm dead-end for retired deep links, share cards, invites and stale Live rooms. */
  function openRetiredGameScreen(gameId) {
    const existing = document.querySelector('[data-dangal-retired]');
    if (existing) existing.remove();
    const host = document.querySelector('.device') || document.body;
    if (!host) return null;
    const el = document.createElement('div');
    el.className = 'dangal-retired';
    el.dataset.dangalRetired = normId(gameId);
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'This game has retired');
    el.innerHTML = `
      <div class="dangal-retired__card">
        <div class="dangal-retired__mark" aria-hidden="true">🎲</div>
        <div class="dangal-retired__title">This game has retired</div>
        <p class="dangal-retired__body">It’s no longer on Chaupaal. Plenty more to play in Manch.</p>
        <button type="button" class="dangal-retired__cta" data-retired-browse>Browse games</button>
        <button type="button" class="dangal-retired__close" data-retired-close>Close</button>
      </div>`;
    let layer = null;
    const close = () => {
      if (layer && layer.close) layer.close();
      else {
        if (typeof removeNavLayer === 'function') removeNavLayer(el);
        el.remove();
      }
    };
    if (typeof openLayer === 'function') {
      layer = openLayer(el, () => {}, { host, remove: true });
    } else {
      host.appendChild(el);
      if (typeof pushNavLayer === 'function') pushNavLayer(el, () => el.remove());
    }
    el.querySelector('[data-retired-browse]')?.addEventListener('click', () => {
      close();
      browseDangalGames();
    });
    el.querySelector('[data-retired-close]')?.addEventListener('click', close);
    el.addEventListener('click', (e) => {
      if (e.target === el) close();
    });
    return el;
  }

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
    if (info.grade === 'party') {
      return '<span class="dangal-honesty-tag dangal-honesty-tag--party">Party</span>';
    }
    if (info.grade === 'polish') {
      return '<span class="dangal-honesty-tag dangal-honesty-tag--polish">Coming polish</span>';
    }
    if (info.grade === 'practice') {
      return '<span class="dangal-honesty-tag dangal-honesty-tag--practice">Practice</span>';
    }
    // Live graduation wins over stale solo registry flags (rally sports, etc.).
    if (info.grade === 'live' && (info.sync === 'live1v1' || info.sync === 'liveParty')) {
      const liveLabel = info.sync === 'liveParty' ? 'Live' : 'Live 1v1';
      return `<span class="dangal-honesty-tag dangal-honesty-tag--live">${liveLabel}</span>`;
    }
    if (info.grade === 'graduated' || g.solo || g.gameType === 'solo') {
      // Graduated solos + graduated Practice sports (honest Practice, quality bar met)
      if (info.sync === 'none' && info.label === 'Practice') {
        return '<span class="dangal-honesty-tag dangal-honesty-tag--practice">Practice</span>';
      }
      return '<span class="dangal-honesty-tag dangal-honesty-tag--solo">Solo</span>';
    }
    return '<span class="dangal-honesty-tag dangal-honesty-tag--practice">Practice</span>';
  }

  /** Live 1v1 / Live party via DangalLive challenges. Party-kit rooms are their own flow. */
  function isLiveCapable(gameId) {
    const info = getGameGraduation(gameId);
    return info.sync === 'live1v1' || info.sync === 'liveParty' || info.grade === 'live';
  }

  function isPartyKitGame(gameId) {
    return getGameGraduation(gameId).grade === 'party';
  }

  function stakesEnabled(gameId) {
    return !!getGameGraduation(gameId).stakes;
  }

  /**
   * Phase 9 prep — retirement / quality gate without deleting titles.
   * hideDefault: omit from default Manch grid (still reachable if known).
   */
  function dangalManchVisibility(gameId) {
    if (isRetiredGameId(gameId)) return 'hidden';
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
  window.isPartyKitGame = isPartyKitGame;
  window.stakesEnabledForGame = stakesEnabled;
  window.dangalManchVisibility = dangalManchVisibility;
  window.DANGAL_ROSTER = ROSTER;
  window.DANGAL_ROSTER_IDS = ROSTER_IDS;
  window.DANGAL_ROSTER_SECTIONS = ROSTER_SECTIONS;
  window.DANGAL_RETIRED_IDS = RETIRED_IDS;
  window.isRetiredGameId = isRetiredGameId;
  window.isRosterGameId = isRosterGameId;
  window.rosterGenre = rosterGenre;
  window.openRetiredGameScreen = openRetiredGameScreen;
})();
