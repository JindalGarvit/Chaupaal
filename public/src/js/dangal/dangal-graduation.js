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
    snakes: { grade: 'live', sync: 'liveParty', stakes: true },
    ludo: { grade: 'live', sync: 'liveParty', stakes: true },
    uno: { grade: 'live', sync: 'liveParty', stakes: true },
    scribble: { grade: 'live', sync: 'liveParty', stakes: true },

    // Party kit (G1+) — Pass & Play on one phone or a Room across phones; points only, never chips
    imposter: { grade: 'party', sync: 'partyRoom', stakes: false, label: 'Party' },
    rajamantri: { grade: 'party', sync: 'partyRoom', stakes: false, label: 'Party' },
    charades: { grade: 'party', sync: 'partyRoom', stakes: false, label: 'Party' },
    mostlikely: { grade: 'party', sync: 'partyRoom', stakes: false, label: 'Party' },
    werewolf: { grade: 'party', sync: 'partyRoom', stakes: false, label: 'Party' },

    // Classics + court — Live 1v1 state sync (snapshot / score events)
    // Dangal P7 — server physics + ICF rules (server-lib/carrom-engine.js); singles rated, doubles 2v2 unrated
    carrom: { grade: 'live', sync: 'live1v1', stakes: true, label: 'Live 1v1 · 2v2' },
    // Dangal P8 — server deal + rules (server-lib/rummy-engine.js, teenpatti-engine.js); 2–6 / 3–7 player tables
    rummy: { grade: 'live', sync: 'liveParty', stakes: true, label: 'Live 2–6' },
    teenpatti: { grade: 'live', sync: 'liveParty', stakes: true, label: 'Live 3–7' },
    bluff: { grade: 'live', sync: 'liveParty', stakes: true, label: 'Live 3–8' },
    tambola: { grade: 'live', sync: 'liveParty', stakes: true, label: 'Live 2–100+' },
    streetcricket: { grade: 'live', sync: 'live1v1', stakes: true, label: 'Live 1v1' },
    badminton: { grade: 'live', sync: 'live1v1', stakes: true },
    // Dangal H2 — Live kicks are resolved on the server (choices never in shared state)
    penalty: { grade: 'live', sync: 'live1v1', stakes: true },
    // Dangal H3 — server shuffles, deals and settles; wallet stakes only at Quick tables + Sit & Go
    poker: { grade: 'live', sync: 'liveParty', stakes: true },
  };

  /** 18+ only (simulated gambling): hidden from pickers until the player is confirmed adult. */
  const AGE_GATED_IDS = ['poker', 'teenpatti'];

  /**
   * Dangal roster — the only list of shipped titles. Registry, pickers, game-of-day and
   * challenge surfaces read this. New titles (party G1–G3) are added here in one place.
   */
  const ROSTER_SECTIONS = [
    { id: 'solo', label: 'Solo' },
    { id: 'board', label: 'Boards' },
    { id: 'words', label: 'Words' },
    { id: 'cards', label: 'Cards' },
    { id: 'rw_sports', label: 'Sports' },
    { id: 'party', label: 'Party' },
  ];

  /** Section ids from before H4 — still accepted from descriptors / cached docs. */
  const LEGACY_GENRES = { brain: 'solo', arcade: 'solo', quiz: 'words', sports: 'rw_sports' };

  /** @type {{ id: string, genre: string }[]} */
  const ROSTER = [
    { id: 'tiptap', genre: 'solo' },
    { id: 'brickbreaker', genre: 'solo' },
    { id: 'ankjod', genre: 'solo' },
    { id: 'wordguess', genre: 'words' },
    { id: 'chess', genre: 'board' },
    { id: 'ttt', genre: 'board' },
    { id: 'snakes', genre: 'board' },
    { id: 'ludo', genre: 'board' },
    { id: 'uno', genre: 'cards' },
    { id: 'scribble', genre: 'words' },
    { id: 'quiz', genre: 'words' },
    { id: 'carrom', genre: 'board' },
    { id: 'poker', genre: 'cards' },
    { id: 'teenpatti', genre: 'cards' },
    { id: 'rummy', genre: 'cards' },
    { id: 'bluff', genre: 'cards' },
    { id: 'tambola', genre: 'party' },
    { id: 'streetcricket', genre: 'rw_sports' },
    { id: 'badminton', genre: 'rw_sports' },
    { id: 'penalty', genre: 'rw_sports' },
    // Party kit titles (G1+) — Pass & Play on one phone or a Room across phones.
    { id: 'imposter', genre: 'party', partyKit: true },
    { id: 'rajamantri', genre: 'party', partyKit: true },
    { id: 'charades', genre: 'party', partyKit: true },
    { id: 'mostlikely', genre: 'party', partyKit: true },
    { id: 'werewolf', genre: 'party', partyKit: true },
  ];
  const ROSTER_IDS = ROSTER.map((r) => r.id);
  /** Aliases that resolve to a roster id (kept in sync with GAME_ID_ALIASES). */
  const ROSTER_ALIASES = {
    kakuro: 'ankjod',
    penaltyshootout: 'penalty',
    shootout: 'penalty',
    holdem: 'poker',
    texasholdem: 'poker',
    "texashold'em": 'poker',
  };

  /** Retired titles (G0 cull) + their legacy link spellings — old links land on the retired screen. */
  const RETIRED_IDS = [
    'rushrunner', 'pool', 'bowling', 'pickleball', 'tennis', 'fiveinrow', 'andarbaahar',
    'sattepe', 'business', 'tabletennis', 'kabaddi', 'khokho', 'gullykick',
    // Dangal H0
    'patangbaazi',
  ];
  const RETIRED_ALIASES = [
    'fiveinarow', 'football', 'snooker', 'billiards', 'andarbahar', 'sattepesatta', 'kho-kho',
    'kite', 'kitefight', 'patang',
  ];
  const RETIRED_SET = new Set(RETIRED_IDS.concat(RETIRED_ALIASES));

  function normId(gameId) {
    return String(gameId == null ? '' : gameId).trim().toLowerCase().replace(/[\s-]+/g, '');
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
  const ADULT_KEY = 'chaupaal_adult_confirmed';

  function isAgeGatedGame(gameId) {
    const raw = normId(gameId);
    return AGE_GATED_IDS.indexOf(ROSTER_ALIASES[raw] || raw) >= 0;
  }

  function currentProfile() {
    return typeof userProfile !== 'undefined' && userProfile ? userProfile : null;
  }

  function localAdultConfirmed() {
    try {
      const v = JSON.parse(localStorage.getItem(ADULT_KEY) || 'null');
      const uid = typeof getCurrentUid === 'function' ? getCurrentUid() || '' : '';
      return !!(v && (v.uid || '') === uid);
    } catch (e) {
      return false;
    }
  }

  /**
   * 18+ status for simulated-gambling titles (mirrors server-lib/poker-engine ageGate):
   * teen mode / under-18 DOB → 'under_18'; adult DOB → 'ok'; else the one-time self-confirmation.
   * @returns {'ok'|'under_18'|'confirm'}
   */
  function ageGateStatus(profile) {
    const u = profile || currentProfile() || {};
    if (u.teenMode === true || u.isMinor === true) return 'under_18';
    if (typeof isTeenModeUser === 'function' && isTeenModeUser(u)) return 'under_18';
    const age = typeof userAge === 'function' ? userAge(u) : null;
    if (age != null && age > 0) return age >= 18 ? 'ok' : 'under_18';
    if (u.adultConfirmedAt || localAdultConfirmed()) return 'ok';
    return 'confirm';
  }

  function canSeeAgeGatedGames() {
    return ageGateStatus() === 'ok';
  }

  /** Records the one-time "I'm 18 or older" confirmation (server writes users/{uid}.adultConfirmedAt). */
  async function confirmAdult() {
    const uid = typeof getCurrentUid === 'function' ? getCurrentUid() || '' : '';
    if (uid && typeof apiFetch === 'function') {
      const res = await apiFetch('/api/media-config', { method: 'POST', needAuth: true, body: { action: 'poker_table', op: 'age_confirm' } });
      if (!res || !res.ok) {
        const e = new Error((res && res.error && res.error.message) || 'Couldn’t save that — try again');
        e.code = (res && res.error && res.error.code) || 'ERROR';
        throw e;
      }
    }
    const p = currentProfile();
    if (p) p.adultConfirmedAt = Date.now();
    try {
      localStorage.setItem(ADULT_KEY, JSON.stringify({ uid, at: Date.now() }));
    } catch (e) {}
    try {
      window.dispatchEvent(new CustomEvent('chaupaal:age-gate', { detail: { status: 'ok' } }));
    } catch (e) {}
    return true;
  }

  /**
   * Calm 18+ gate. Resolves true when the player may continue.
   * @param {string} gameId
   */
  function openAgeGateSheet(gameId) {
    return new Promise((resolve) => {
      const status = ageGateStatus();
      if (status === 'ok') return resolve(true);
      const label = typeof gameDisplayName === 'function' ? gameDisplayName(gameId) : 'This game';
      const kit = window.PartyKit;
      const under = status === 'under_18';
      const body = under
        ? `<p class="dangal-age-gate__text">${label} is for players 18 and over. Plenty more to play in Manch.</p>
           <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-age-ok>OK</button>`
        : `<p class="dangal-age-gate__text">${label} uses virtual chips that can’t be bought or cashed out. It’s for players 18 and over.</p>
           <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-age-yes>I confirm I’m 18 or older</button>
           <button type="button" class="pk-btn pk-btn--ghost pk-btn--block" data-age-no>Not now</button>`;
      let done = false;
      let confirmed = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        resolve(v);
      };
      if (!kit || typeof kit.openSheet !== 'function') {
        if (under) return finish(false);
        const ok = typeof window.confirm === 'function' && window.confirm('Confirm you’re 18 or older to play ' + label);
        if (!ok) return finish(false);
        confirmAdult().then(() => finish(true), () => finish(false));
        return;
      }
      kit.openSheet({
        title: under ? '18+ only' : 'Are you 18 or older?',
        bodyHtml: `<div class="dangal-age-gate">${body}</div>`,
        onMount(el, close) {
          el.querySelector('[data-age-ok]')?.addEventListener('click', () => close());
          el.querySelector('[data-age-no]')?.addEventListener('click', () => close());
          el.querySelector('[data-age-yes]')?.addEventListener('click', async (ev) => {
            const btn = ev.currentTarget;
            btn.disabled = true;
            try {
              await confirmAdult();
              // Resolve from onClose: close() may pop history asynchronously, and the caller
              // must not open its next layer until this sheet is really gone.
              confirmed = true;
              close();
            } catch (e) {
              btn.disabled = false;
              if (String(e.code).toUpperCase() === 'AGE_GATE') {
                if (typeof showToast === 'function') showToast(label + ' is for players 18 and over');
                close();
              } else if (typeof showToast === 'function') showToast(e.message || 'Couldn’t save that — try again');
            }
          });
        },
        onClose: () => finish(confirmed),
      });
    });
  }

  function isIndiaLocale() {
    try {
      const langs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || '']).map(String);
      if (langs.some((l) => /-IN$/i.test(l))) return true;
      const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || '').toString();
      return tz === 'Asia/Kolkata' || tz === 'Asia/Calcutta';
    } catch (e) {
      return false;
    }
  }

  /** Cards order: Poker leads everywhere except India, where Teen Patti leads. Both always listed. */
  function orderCardsForLocale(list) {
    const arr = (list || []).slice();
    const first = isIndiaLocale() ? 'teenpatti' : 'poker';
    const second = first === 'poker' ? 'teenpatti' : 'poker';
    const iF = arr.findIndex((g) => g && g.id === first);
    const iS = arr.findIndex((g) => g && g.id === second);
    if (iF > iS && iS >= 0) {
      const tmp = arr[iF];
      arr[iF] = arr[iS];
      arr[iS] = tmp;
    }
    return arr;
  }

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
  window.DANGAL_LEGACY_GENRES = LEGACY_GENRES;
  window.DANGAL_RETIRED_IDS = RETIRED_IDS;
  window.isRetiredGameId = isRetiredGameId;
  window.isRosterGameId = isRosterGameId;
  window.rosterGenre = rosterGenre;
  window.openRetiredGameScreen = openRetiredGameScreen;
  window.DANGAL_AGE_GATED_IDS = AGE_GATED_IDS;
  window.isAgeGatedGame = isAgeGatedGame;
  window.ageGateStatus = ageGateStatus;
  window.canSeeAgeGatedGames = canSeeAgeGatedGames;
  window.confirmAdultForGames = confirmAdult;
  window.openAgeGateSheet = openAgeGateSheet;
  window.isIndiaLocale = isIndiaLocale;
  window.orderCardsForLocale = orderCardsForLocale;
})();
