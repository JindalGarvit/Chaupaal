/**
 * Single source of truth for game metadata + launchers.
 *
 * Self-registration: each game file calls registerGame(descriptor) at load time.
 *
 * @typedef {'solo'|'dual'|'multiplayer'} GameType
 * @typedef {'rw_sports'|'brain'|'board'|'party'|'arcade'|'quiz'|'other'} GameGenre
 *
 * @typedef {Object} GameLaunchContext
 * @property {object} [chat]
 * @property {boolean} [isGroup]
 * @property {string} [source] - 'chat' | 'dangal' | 'self'
 *
 * @typedef {Object} GameDescriptor
 * @property {string} id
 * @property {string} name
 * @property {string} desc
 * @property {string} icon
 * @property {GameType} [gameType] - Solo / Dual / Multiplayer mode axis
 * @property {GameGenre|string} [genre] - Manch genre chip axis
 * @property {string} [ratingKey]
 * @property {boolean} [solo] - pure solo (no opponent UI); implies gameType solo when unset
 * @property {boolean} [selfChat] - show in self-chat picker
 * @property {boolean} [chat1v1] - show in 1:1 chat picker
 * @property {boolean} [chatGroup] - show in group chat picker
 * @property {boolean} [dangal] - show in Dangal games grid (default true when registered)
 * @property {boolean} [featured]
 * @property {number} [order] - lower sorts first
 * @property {object} [meta] - phase-2 notes (e.g. muqabala engine wiring)
 * @property {(ctx: GameLaunchContext) => void} launch
 */
(function () {
  /** @type {Map<string, GameDescriptor>} */
  const games = new Map();
  /** @type {string[]} */
  const order = [];

  /** Genre catalog — UI label + order for Manch chips. */
  const GAME_GENRES = [
    { id: 'rw_sports', label: 'RW Sports', icon: '🏏', color: '#2E7D32' },
    { id: 'brain', label: 'Brain Boost', icon: '🧠', color: '#6A1B9A' },
    { id: 'board', label: 'Board & Classics', icon: '♟️', color: '#5D4037' },
    { id: 'party', label: 'Party & Social', icon: '🎉', color: '#E65100' },
    { id: 'arcade', label: 'Arcade Rush', icon: '👾', color: '#1565C0' },
    { id: 'quiz', label: 'Quiz & Duel', icon: '🎯', color: '#C62828' },
  ];

  /** Fallback genre by game id when descriptor omits genre. */
  const DEFAULT_GENRE_BY_ID = {
    quiz: 'quiz',
    chess: 'board',
    snakes: 'board',
    ludo: 'board',
    uno: 'party',
    ttt: 'board',
    wordguess: 'brain',
    fiveinrow: 'board',
    business: 'board',
    scribble: 'party',
    rushrunner: 'arcade',
    tiptap: 'brain',
    ankjod: 'brain',
    kakuro: 'brain',
    streetcricket: 'rw_sports',
    gullykick: 'rw_sports',
    badminton: 'rw_sports',
    tabletennis: 'rw_sports',
    pickleball: 'rw_sports',
    kabaddi: 'rw_sports',
    khokho: 'rw_sports',
    bowling: 'rw_sports',
    tennis: 'rw_sports',
    tambola: 'party',
    carrom: 'board',
    pool: 'board',
    rummy: 'party',
    teenpatti: 'party',
    bluff: 'party',
    sattepe: 'party',
    andarbaahar: 'party',
    patangbaazi: 'arcade',
    brickbreaker: 'arcade',
  };

  function inferGameType(d) {
    if (d.gameType === 'solo' || d.gameType === 'dual' || d.gameType === 'multiplayer') return d.gameType;
    if (d.solo) return 'solo';
    if (d.chatGroup) return 'multiplayer';
    return 'dual';
  }

  function inferGenre(d) {
    const g = String(d.genre || '').trim().toLowerCase();
    if (GAME_GENRES.some((x) => x.id === g)) return g;
    return DEFAULT_GENRE_BY_ID[d.id] || 'other';
  }

  function genreLabel(genreId) {
    const hit = GAME_GENRES.find((x) => x.id === genreId);
    return hit ? hit.label : 'Games';
  }

  function clearDangalLaunchCtx() {
    try {
      delete window.__dangalLaunchCtx;
    } catch (e) {
      window.__dangalLaunchCtx = null;
    }
  }

  /** Chip stake options for Live launches (Phase 6). Practice always stake 0. */
  const DANGAL_STAKE_OPTIONS = [0, 10, 25, 50];

  function dangalStakePickerHtml(gameId, selected) {
    if (typeof stakesEnabledForGame === 'function' && gameId && !stakesEnabledForGame(gameId)) {
      return '';
    }
    const sel = Number(selected) || 0;
    return `<div class="dangal-stake-picker" data-dangal-stake-picker>
      <div class="dangal-stake-picker__label">Stake · virtual chips only (not real money)</div>
      <div class="dangal-stake-picker__row">
        ${DANGAL_STAKE_OPTIONS.map(
          (s) =>
            `<button type="button" class="dangal-stake-chip${s === sel ? ' is-selected' : ''}" data-stake="${s}">${
              s === 0 ? 'Friendly' : '⚡' + s
            }</button>`
        ).join('')}
      </div>
    </div>`;
  }

  function wireDangalStakePicker(root) {
    const picker = root && root.querySelector ? root.querySelector('[data-dangal-stake-picker]') : null;
    if (!picker) return;
    picker.querySelectorAll('[data-stake]').forEach((btn) => {
      btn.addEventListener('click', () => {
        picker.querySelectorAll('[data-stake]').forEach((b) => b.classList.remove('is-selected'));
        btn.classList.add('is-selected');
      });
    });
  }

  function readDangalStake(root) {
    const sel =
      root && root.querySelector
        ? root.querySelector('[data-dangal-stake-picker] [data-stake].is-selected')
        : null;
    return sel ? Number(sel.dataset.stake) || 0 : 0;
  }

  /** Compact stake sheet before Live challenge send. Resolves stake number or null if cancelled.
   * @param {string} gameId
   * @param {{ defaultStake?: number }} [opts]
   */
  function openDangalStakeSheet(gameId, opts) {
    const o = opts || {};
    const defaultStake = Number(o.defaultStake);
    const initial =
      DANGAL_STAKE_OPTIONS.indexOf(defaultStake) >= 0 ? defaultStake : 0;
    return new Promise((resolve) => {
      if (typeof stakesEnabledForGame !== 'function' || !stakesEnabledForGame(gameId)) {
        resolve(0);
        return;
      }
      const sheet = document.createElement('div');
      sheet.style.cssText =
        'position:absolute;bottom:0;left:0;right:0;background:var(--white);border-radius:24px 24px 0 0;padding:20px;z-index:110;';
      sheet.innerHTML = `
        <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:16px;margin-bottom:4px;">Stake chips</div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:12px;">Friendly (0) or wager <strong>virtual chips</strong> — not real money. Teen-safe.</div>
        ${dangalStakePickerHtml(gameId, initial)}
        <button type="button" id="dgStakeContinue" style="width:100%;margin-top:14px;padding:14px;background:var(--game-accent,var(--red));color:#fff;border:none;border-radius:14px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;cursor:pointer;">Continue</button>
        <button type="button" id="dgStakeCancel" style="width:100%;padding:12px;background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;">Cancel</button>`;
      const device = document.querySelector('.device');
      if (!device) {
        resolve(0);
        return;
      }
      device.appendChild(sheet);
      wireDangalStakePicker(sheet);
      document.getElementById('dgStakeContinue')?.addEventListener('click', async () => {
        const stake = readDangalStake(sheet);
        if (stake > 0 && window.DangalEconomy && typeof DangalEconomy.canAffordStake === 'function') {
          const btn = document.getElementById('dgStakeContinue');
          if (btn) btn.disabled = true;
          try {
            const ok = await DangalEconomy.canAffordStake(stake);
            if (!ok) {
              if (typeof showToast === 'function') {
                showToast('Not enough virtual chips — pick Friendly (0) or a lower stake');
              }
              if (btn) btn.disabled = false;
              return;
            }
          } catch (e) {
            if (typeof showToast === 'function') {
              showToast('Couldn’t check chip balance — try Friendly (0)');
            }
            if (btn) btn.disabled = false;
            return;
          }
        }
        sheet.remove();
        resolve(stake);
      });
      document.getElementById('dgStakeCancel')?.addEventListener('click', () => {
        sheet.remove();
        resolve(null);
      });
    });
  }

  /**
   * Single launch contract for Manch / challenge / picker / deep links.
   * @param {object} opts
   * @param {string} opts.gameId
   * @param {'practice'|'live'|'daily'} [opts.mode]
   * @param {string} [opts.opponentUid]
   * @param {string} [opts.matchId]
   * @param {number} [opts.stake]
   * @param {string} [opts.chatId]
   * @param {object} [opts.chat]
   * @param {string} [opts.source]
   */
  function launchDangalGame(opts) {
    const o = opts || {};
    const gameId = o.gameId || o._descriptor?.id;
    const game = o._descriptor || getGame(gameId);
    if (!game) return;

    const rawLaunch =
      (typeof o._userLaunch === 'function' && o._userLaunch) ||
      game.__rawLaunch ||
      null;
    if (typeof rawLaunch !== 'function') {
      console.warn('[dangal] no raw launch for', gameId);
      return;
    }

    const chat = o.chat || null;
    const matchId =
      o.matchId ||
      (chat && chat.dangalMatchId) ||
      (typeof dangalMatchId === 'function' ? dangalMatchId(gameId, chat) : '');
    const opponentUid =
      o.opponentUid ||
      (typeof opponentUidFromChat === 'function' ? opponentUidFromChat(chat) : '') ||
      '';
    const persistable =
      opponentUid && typeof isPersistableUid === 'function' && isPersistableUid(opponentUid);
    const liveCapable = typeof isLiveCapable === 'function' ? isLiveCapable(gameId) : !!game.liveDuel;
    let mode = o.mode || '';
    if (!mode) {
      if (o.source === 'challenge' || o.source === 'challenge_host') {
        mode = persistable && liveCapable ? 'live' : 'practice';
      } else if (persistable && liveCapable) {
        mode = 'live';
      } else if (game.solo || game.gameType === 'solo') {
        mode = o.source === 'daily' || o.source === 'khel' ? 'daily' : 'practice';
      } else {
        mode = 'practice';
      }
    }
    // Never claim Live with fake opponents
    if (mode === 'live' && !persistable) mode = 'practice';

    const stake =
      mode === 'live' && typeof stakesEnabledForGame === 'function' && stakesEnabledForGame(gameId)
        ? Number(o.stake) || 0
        : 0;

    const rawSource = o.source || '';
    const source =
      typeof resolveGameLaunchSource === 'function'
        ? resolveGameLaunchSource({ source: rawSource, chat })
        : rawSource ||
          (chat && chat.id && String(chat.id) !== 'ai' ? 'chat' : 'manch');

    window.__dangalLaunchCtx = {
      gameId,
      gameType: gameId,
      mode,
      matchId: matchId || '',
      opponentUid: opponentUid || '',
      stake,
      chatId: o.chatId || chat?.firestoreId || chat?.id || '',
      source,
      practiceKind:
        o.practiceKind ||
        (mode === 'practice'
          ? opponentUid === 'ai' || (chat && chat.id === 'ai')
            ? 'vsAi'
            : game.solo || game.gameType === 'solo'
              ? 'solo'
              : 'vsAi'
          : ''),
      skipPracticeSetup: o.skipPracticeSetup != null ? !!o.skipPracticeSetup : undefined,
      startedAt: Date.now(),
      ludoMode:
        o.ludoMode ||
        (o.mode === 'quick' || o.mode === 'classic' ? o.mode : '') ||
        '',
      min: Number(o.min ?? o.timeMin) || 0,
      inc: Number(o.inc ?? o.timeInc) || 0,
      timeMin: Number(o.timeMin ?? o.min) || 0,
      timeInc: Number(o.timeInc ?? o.inc) || 0,
      chess960: !!o.chess960,
      timeControl: o.timeControl || o.timeControlLabel || '',
      timeControlLabel: o.timeControlLabel || o.timeControl || '',
    };

    if (chat && matchId) chat.dangalMatchId = matchId;

    const ctx = Object.assign({}, o, {
      chat,
      matchId,
      opponentUid,
      stake,
      mode,
      source,
      ludoMode: window.__dangalLaunchCtx.ludoMode || o.ludoMode || '',
    });
    delete ctx._userLaunch;
    delete ctx._descriptor;
    delete ctx.gameId;

    if (typeof markGamePlayed === 'function') {
      try {
        markGamePlayed(gameId);
      } catch (e) {}
    }

    return rawLaunch(ctx);
  }

  /**
   * @param {GameDescriptor} descriptor
   */
  function registerGame(descriptor) {
    if (!descriptor || !descriptor.id || typeof descriptor.launch !== 'function') return;
    const next = Object.assign({}, descriptor, {
      gameType: inferGameType(descriptor),
      genre: inferGenre(descriptor),
    });
    // Align registry with graduation: Live-capable titles must not stay solo.
    if (typeof getGameGraduation === 'function') {
      const info = getGameGraduation(next.id);
      const liveGrad =
        info.grade === 'live' || info.sync === 'live1v1' || info.sync === 'liveParty';
      if (liveGrad) {
        if (next.solo || next.gameType === 'solo') {
          delete next.solo;
          next.gameType = info.sync === 'liveParty' ? 'multiplayer' : 'dual';
        }
        if (info.sync === 'liveParty') {
          next.gameType = 'multiplayer';
          next.liveDuel = true;
        }
        if (info.sync === 'live1v1') next.liveDuel = true;
      }
    }
    // Icon/accent identity — prefer GAME_IDENTITY when present
    if (typeof getGameIdentity === 'function') {
      const ident = getGameIdentity(next.id);
      if (ident && ident.icon) next.icon = ident.icon;
    }
    next.__rawLaunch = descriptor.launch;
    next.launch = function (ctx) {
      return launchDangalGame(
        Object.assign({}, ctx || {}, {
          gameId: next.id,
          _userLaunch: next.__rawLaunch,
          _descriptor: next,
        })
      );
    };
    if (!games.has(next.id)) order.push(next.id);
    games.set(next.id, next);
  }

  /**
   * @param {object} [filter]
   * @param {boolean} [filter.dangal]
   * @param {boolean} [filter.solo]
   * @param {boolean} [filter.selfChat]
   * @param {boolean} [filter.chat1v1]
   * @param {boolean} [filter.chatGroup]
   * @param {GameType} [filter.gameType]
   * @param {string} [filter.genre]
   * @param {string} [filter.id]
   * @returns {GameDescriptor[]}
   */
  function getGames(filter) {
    const f = filter || {};
    let list = order.map((id) => games.get(id)).filter(Boolean);

    if (f.id) return list.filter((g) => g.id === f.id);
    if (f.dangal) list = list.filter((g) => g.dangal !== false);
    if (f.gameType) list = list.filter((g) => g.gameType === f.gameType);
    if (f.genre) list = list.filter((g) => g.genre === f.genre);
    if (f.solo === true) list = list.filter((g) => g.gameType === 'solo' || g.solo);
    if (f.selfChat === true) {
      list = list.filter((g) => g.selfChat || g.gameType === 'solo' || g.solo);
    }
    if (f.chat1v1 === true) list = list.filter((g) => g.chat1v1);
    if (f.chatGroup === true) list = list.filter((g) => g.chatGroup);

    list.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
    return list;
  }

  function getGame(id) {
    const raw = id == null ? '' : String(id);
    const key = typeof canonicalGameId === 'function' ? canonicalGameId(raw) : raw;
    return games.get(key) || games.get(raw) || null;
  }

  function getGameGenres() {
    return GAME_GENRES.slice();
  }

  /** Q2A — real group/party titles (Live party or multi-seat Practice setup). */
  const GROUP_PARTY_IDS = ['ludo', 'uno', 'business', 'scribble'];

  function gameIsLiveCapable(gameId, game) {
    if (typeof isLiveCapable === 'function') return !!isLiveCapable(gameId);
    return !!(game && game.liveDuel);
  }

  /** Canonical Practice AI seat — never fake human names. */
  function practiceAiChat() {
    return { name: 'Practice AI', id: 'ai' };
  }

  /**
   * Practice entry class for Manch / self-chat honesty.
   * @returns {'soloPractice'|'duelAi'|'special'|null}
   */
  function getPracticeEntryClass(gameId) {
    const id =
      typeof canonicalGameId === 'function' ? canonicalGameId(gameId) : String(gameId || '');
    if (!id) return null;
    // True solos — never label or open as vs AI
    if (
      id === 'tiptap' ||
      id === 'ankjod' ||
      id === 'kakuro' ||
      id === 'rushrunner' ||
      id === 'wordguess' ||
      id === 'brickbreaker'
    ) {
      return 'soloPractice';
    }
    // Category / mode / honesty quirks — still Practice-reachable
    if (id === 'quiz' || id === 'scribble' || id === 'patangbaazi') return 'special';
    const g = getGame(id);
    if (!g || g.dangal === false) return null;
    if ((g.solo || g.gameType === 'solo') && !gameIsLiveCapable(id, g)) return 'soloPractice';
    return 'duelAi';
  }

  function isSoloPracticeGame(gameId) {
    return getPracticeEntryClass(gameId) === 'soloPractice';
  }

  /**
   * Shared Practice · Solo launch (Manch + self-chat + 1:1).
   * No opponent sheet; chrome preference Practice · Solo via practiceKind.
   */
  function launchSoloPractice(gameId, source) {
    const game = getGame(gameId);
    if (!game) return;
    const src =
      source === 'self'
        ? 'self'
        : source === 'chat' || source === 'chat_practice'
          ? 'chat'
          : source || 'manch';
    launchDangalGame({
      gameId,
      source: src,
      mode: 'practice',
      stake: 0,
      opponentUid: '',
      practiceKind: 'solo',
      _userLaunch: game.__rawLaunch,
      _descriptor: game,
    });
  }

  /**
   * Shared Practice vs AI contract (Manch + self-chat + 1:1).
   * Sets honest launch ctx; ≤1 optional setup sheet (Ludo / Uno / Chess / Patang / Snakes).
   * Always replaces prior Live ctx so Practice never waits on a stale matchId.
   * Friend chat identity must never become the AI seat — always practiceAiChat().
   */
  function launchPracticeVsAi(gameId, source) {
    const game = getGame(gameId);
    if (!game) return;
    const src =
      source === 'self'
        ? 'self'
        : source === 'chat' || source === 'chat_practice'
          ? 'chat'
          : source || 'manch';
    const chat = practiceAiChat();

    // Wipe Live residue — Practice must never inherit friend matchId / mode:'live'.
    window.__dangalLaunchCtx = {
      gameId,
      gameType: gameId,
      mode: 'practice',
      matchId: '',
      opponentUid: 'ai',
      stake: 0,
      chatId: '',
      source: src,
      practiceKind: 'vsAi',
      // Prefer engine defaults (Medium / Classic / 5+0) — skip setup walls when possible.
      skipPracticeSetup: true,
      startedAt: Date.now(),
    };

    // Ludo: Classic|Quick sheet is the one allowed optional step
    if (gameId === 'ludo') {
      if (typeof openLudoPracticeSheet === 'function') {
        openLudoPracticeSheet(chat, { source: src, mode: 'practice', opponentUid: 'ai' });
      } else if (typeof openLudoGame === 'function') {
        openLudoGame(chat, 2, { mode: 'classic' });
      }
      return;
    }

    // Quiz: category sheet is the allowed optional step
    if (gameId === 'quiz') {
      if (typeof openQuizCategorySheet === 'function') openQuizCategorySheet();
      else if (typeof startMuqabala === 'function') {
        startMuqabala(null, 'GK', {
          practice: true,
          simulated: true,
          skipMatchmaking: true,
          skipCredit: true,
        });
      }
      return;
    }

    // Snakes / Patang: keep their one mode/version sheet (do not auto-skip).
    if (gameId === 'snakes' || gameId === 'patangbaazi') {
      window.__dangalLaunchCtx.skipPracticeSetup = false;
    }

    game.launch({
      chat,
      source: src,
      mode: 'practice',
      opponentUid: 'ai',
      stake: 0,
      practiceKind: 'vsAi',
      skipPracticeSetup: window.__dangalLaunchCtx.skipPracticeSetup !== false,
    });
  }

  function pickerHonestyBadge(liveCapable) {
    if (liveCapable) {
      return '<span style="display:inline-block;margin-left:6px;padding:1px 6px;border-radius:999px;background:rgba(229,57,53,0.12);color:#C62828;font:700 9px Space Grotesk,sans-serif;letter-spacing:0.02em;vertical-align:middle;">Live</span>';
    }
    return '<span style="display:inline-block;margin-left:6px;padding:1px 6px;border-radius:999px;background:rgba(0,137,123,0.12);color:#00695C;font:700 9px Space Grotesk,sans-serif;letter-spacing:0.02em;vertical-align:middle;">Practice</span>';
  }

  function pickerPracticeBadge(kind) {
    if (kind === 'solo') {
      return '<span style="display:inline-block;margin-left:6px;padding:1px 6px;border-radius:999px;background:rgba(0,137,123,0.12);color:#00695C;font:700 9px Space Grotesk,sans-serif;letter-spacing:0.02em;vertical-align:middle;">Solo</span>';
    }
    return '<span style="display:inline-block;margin-left:6px;padding:1px 6px;border-radius:999px;background:rgba(201,162,39,0.18);color:#8D6E00;font:700 9px Space Grotesk,sans-serif;letter-spacing:0.02em;vertical-align:middle;">vs AI</span>';
  }

  /**
   * Registry-driven chat game picker.
   * UX: 1:1 — row = Practice vs AI (or Solo); Challenge = Live with this friend.
   *     Group allowlists Ludo / Uno / Business / Scribble (party 3–6) — unchanged.
   */
  function openGamePicker(chat, isGroup) {
    const isSelf = typeof isSelfChat === 'function' && isSelfChat(chat);
    const ctx = { chat, isGroup: !!isGroup, source: isSelf ? 'self' : 'chat' };
    const friendName = (chat && chat.name) || 'your friend';

    let pickerGames;
    let title;
    let subtitle;
    let emptyHint = '';

    if (isSelf) {
      // Same Practice contract as Manch — duelAi → vs AI; solos → Practice · Solo.
      pickerGames = getGames({ selfChat: true }).map((g) => {
        const entry = getPracticeEntryClass(g.id);
        const solo = entry === 'soloPractice';
        let rowDesc = solo ? 'Practice · Solo' : 'Practice vs AI';
        if (g.id === 'scribble') rowDesc = 'Practice vs AI · you draw, AI guesses';
        if (g.id === 'patangbaazi') rowDesc = 'Practice · Duel or Festival';
        return {
          id: g.id,
          emoji: g.icon,
          name: g.name,
          desc: rowDesc,
          practiceSolo: solo,
          fn: () => {
            if (solo) launchSoloPractice(g.id, 'self');
            else launchPracticeVsAi(g.id, 'self');
          },
        };
      });
      title = 'Practice';
      subtitle = 'Practice vs AI or Solo — same paths as Manch';
      emptyHint = 'No Practice games here yet — try Manch.';
    } else if (isGroup) {
      // Hard allowlist — party Live titles only (Scribble = 1v1 or party 3–6).
      const allow = new Set(GROUP_PARTY_IDS);
      pickerGames = getGames({ chatGroup: true })
        .filter((g) => allow.has(g.id))
        .map((g) => ({
          id: g.id,
          emoji: g.icon,
          name: g.name,
          desc: g.desc,
          liveCapable: gameIsLiveCapable(g.id, g),
          showChallenge: false,
          fn: () => g.launch(ctx),
        }));
      title = 'Group games';
      subtitle = 'Party games for this chat — pick players next';
      emptyHint = 'No party games here yet — try Ludo, Oh No!, Business, or Scribble from Manch.';
    } else {
      // 1:1 — row/primary = Practice vs AI (or Solo); Challenge = Live with this friend.
      const rows = getGames({ chat1v1: true }).map((g) => {
        const liveCapable = gameIsLiveCapable(g.id, g);
        const entry = getPracticeEntryClass(g.id);
        const solo = entry === 'soloPractice';
        let rowDesc;
        if (liveCapable) {
          rowDesc = 'Practice vs AI · Challenge for Live';
        } else if (solo) {
          rowDesc = 'Practice · Solo';
        } else if (g.id === 'scribble') {
          rowDesc = 'Practice vs AI · you draw, AI guesses';
        } else if (g.id === 'patangbaazi') {
          rowDesc = 'Practice · Duel or Festival';
        } else {
          rowDesc = 'Practice vs AI';
        }
        return {
          id: g.id,
          emoji: g.icon,
          name: g.name,
          desc: rowDesc,
          liveCapable,
          practiceSolo: solo,
          showChallenge: liveCapable,
          fn: () => {
            // Never launch with the friend chat as AI seat / Live wait.
            if (solo) launchSoloPractice(g.id, 'chat');
            else launchPracticeVsAi(g.id, 'chat');
          },
        };
      });
      rows.sort((a, b) => Number(b.liveCapable) - Number(a.liveCapable));
      pickerGames = rows;
      title = 'Play a game';
      subtitle =
        'Practice vs AI anytime — or Challenge for Live with ' + friendName + '.';
      emptyHint = 'No chat games yet — open Manch to play.';
    }

    const sheet = document.createElement('div');
    sheet.style.cssText =
      'position:absolute;bottom:0;left:0;right:0;background:var(--white);border-radius:24px 24px 0 0;padding:20px;z-index:100;max-height:85vh;overflow-y:auto;';

    let bodyHtml = '';
    if (!pickerGames.length) {
      bodyHtml =
        '<div style="padding:18px 12px;text-align:center;color:var(--muted);font-size:13px;line-height:1.45;">' +
        emptyHint +
        '</div>';
    } else if (!isSelf && !isGroup) {
      let lastSection = '';
      bodyHtml = pickerGames
        .map((g, i) => {
          const section = g.liveCapable ? 'live' : 'practice';
          let head = '';
          if (section !== lastSection) {
            lastSection = section;
            head =
              section === 'live'
                ? '<div style="font:700 11px Space Grotesk,sans-serif;color:var(--muted);letter-spacing:0.04em;text-transform:uppercase;margin:10px 2px 6px;">Practice vs AI · Challenge Live</div>'
                : '<div style="font:700 11px Space Grotesk,sans-serif;color:var(--muted);letter-spacing:0.04em;text-transform:uppercase;margin:14px 2px 6px;">Practice only</div>';
          }
          const challengeBtn = g.showChallenge
            ? '<button type="button" data-challenge-i="' +
              i +
              '" class="dangal-picker-challenge" style="flex-shrink:0;padding:10px 12px;border-radius:14px;border:2px solid var(--line);background:var(--white);font:700 11px Space Grotesk,sans-serif;cursor:pointer;max-width:88px;">Challenge</button>'
            : '';
          const badge = g.liveCapable
            ? pickerHonestyBadge(true) + pickerPracticeBadge('vsAi')
            : g.practiceSolo
              ? pickerPracticeBadge('solo')
              : pickerPracticeBadge('vsAi');
          return (
            head +
            '<div class="dangal-picker-row" style="display:flex;gap:8px;margin-bottom:8px;align-items:stretch;">' +
            '<button data-i="' +
            i +
            '" type="button" style="flex:1;padding:13px 14px;background:var(--cream);border:2px solid var(--line);border-radius:14px;text-align:left;display:flex;align-items:center;gap:12px;cursor:pointer;">' +
            '<span style="font-size:26px;flex-shrink:0;">' +
            g.emoji +
            '</span>' +
            '<div><div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:14px;">' +
            g.name +
            badge +
            '</div><div style="font-size:11px;color:var(--muted);margin-top:1px;">' +
            g.desc +
            '</div></div></button>' +
            challengeBtn +
            '</div>'
          );
        })
        .join('');
    } else {
      bodyHtml = pickerGames
        .map((g, i) => {
          const badge =
            isSelf && typeof g.practiceSolo === 'boolean'
              ? pickerPracticeBadge(g.practiceSolo ? 'solo' : 'vsAi')
              : '';
          return (
            '<div class="dangal-picker-row" style="display:flex;gap:8px;margin-bottom:8px;align-items:stretch;">' +
            '<button data-i="' +
            i +
            '" type="button" style="flex:1;padding:13px 14px;background:var(--cream);border:2px solid var(--line);border-radius:14px;text-align:left;display:flex;align-items:center;gap:12px;cursor:pointer;">' +
            '<span style="font-size:26px;flex-shrink:0;">' +
            g.emoji +
            '</span>' +
            '<div><div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:14px;">' +
            g.name +
            badge +
            '</div><div style="font-size:11px;color:var(--muted);margin-top:1px;">' +
            g.desc +
            '</div></div></button></div>'
          );
        })
        .join('');
    }

    sheet.innerHTML =
      '<div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;margin-bottom:4px;">🎮 ' +
      title +
      '</div>' +
      '<div style="font-size:12px;color:var(--muted);margin-bottom:14px;">' +
      subtitle +
      '</div>' +
      bodyHtml +
      '<button id="closeGP" type="button" style="width:100%;padding:12px;background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;margin-top:4px;">Cancel</button>';

    const device = document.querySelector('.device');
    if (!device) return;

    let closePicker = () => {
      try {
        sheet.remove();
      } catch (e) {}
    };
    if (typeof openLayer === 'function') {
      const layer = openLayer(sheet, () => {
        try {
          if (sheet.parentNode) sheet.remove();
        } catch (e) {}
      });
      closePicker = () => {
        if (layer && typeof layer.close === 'function') layer.close();
        else {
          try {
            sheet.remove();
          } catch (e) {}
        }
      };
    } else {
      device.appendChild(sheet);
      if (typeof enableSwipeDismiss === 'function') {
        enableSwipeDismiss(sheet, closePicker);
      }
    }

    pickerGames.forEach((g, i) => {
      const btn = sheet.querySelector('[data-i="' + i + '"]');
      if (!btn) return;
      btn.addEventListener('click', () => {
        closePicker();
        g.fn();
      });
    });
    sheet.querySelectorAll('[data-challenge-i]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const i = Number(btn.dataset.challengeI);
        const row = pickerGames[i];
        if (!row || !row.id || !row.showChallenge) return;
        if (!gameIsLiveCapable(row.id, getGame(row.id))) {
          if (typeof showToast === 'function') showToast('That title is Practice only — no Live challenge');
          return;
        }
        const toUid = typeof opponentUidFromChat === 'function' ? opponentUidFromChat(chat) : '';
        const chatId = chat?.firestoreId || chat?.id;
        if (!toUid || !chatId || typeof sendChallengeCard !== 'function') {
          if (typeof showToast === 'function') showToast('Open a real chat to send a challenge');
          return;
        }
        btn.disabled = true;
        try {
          const gid = row.id;
          const matchId = typeof dangalMatchId === 'function' ? dangalMatchId(gid, chat) : '';
          let stake = 0;
          if (typeof stakesEnabledForGame === 'function' && stakesEnabledForGame(gid)) {
            const picked = await openDangalStakeSheet(gid);
            if (picked == null) {
              btn.disabled = false;
              return;
            }
            stake = picked;
          }
          let chessTc = null;
          if (gid === 'chess' && typeof openChessLiveTimeSheet === 'function') {
            chessTc = await openChessLiveTimeSheet({ defaultMin: 5, defaultInc: 0 });
            if (chessTc == null) {
              btn.disabled = false;
              return;
            }
          }
          await sendChallengeCard(
            toUid,
            gid,
            Object.assign(
              { chatId, matchId, stake },
              chessTc
                ? {
                    timeControl: chessTc.label,
                    timeMin: chessTc.min,
                    timeInc: chessTc.inc,
                    min: chessTc.min,
                    inc: chessTc.inc,
                    chess960: !!chessTc.chess960,
                  }
                : {}
            )
          );
          closePicker();
          if (typeof showToast === 'function') showToast('Challenge sent');
        } catch (err) {
          btn.disabled = false;
          if (typeof showToast === 'function') showToast(err?.message || 'Could not send challenge');
        }
      });
    });
    document.getElementById('closeGP').addEventListener('click', () => {
      closePicker();
      // Soft signal for conversation-repair chips (no guilt / streak)
      if (chat && chat.type === 'dm' && typeof markGameInviteDeclined === 'function') {
        markGameInviteDeclined(chat.firestoreId || chat.id);
      }
    });
  }

  /** Honest opponent sheet — Practice vs AI or Live challenge friend (never fake Priya). */
  function launchDangalWithOpponent(gameId) {
    const game = getGame(gameId);
    if (!game) return;

    if (gameId === 'ludo') {
      // Practice vs AI or Live challenge friend (same honesty as Chess).
      const liveOk = typeof isLiveCapable === 'function' ? isLiveCapable('ludo') : true;
      const stakesOk =
        liveOk && typeof stakesEnabledForGame === 'function' && stakesEnabledForGame('ludo');
      const sheet = document.createElement('div');
      sheet.style.cssText =
        'position:absolute;bottom:0;left:0;right:0;background:var(--white);border-radius:24px 24px 0 0;padding:22px;z-index:100;';
      sheet.innerHTML = `
    <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;margin-bottom:4px;">🎯 Ludo</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:14px;">Practice vs AI anytime — or challenge a real friend for Live 1v1.</div>
    <button id="dgPracticeAi" style="width:100%;padding:14px;background:var(--cream);border:2px solid var(--line);border-radius:14px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;cursor:pointer;margin-bottom:10px;">🤖 Practice vs AI</button>
    ${stakesOk ? dangalStakePickerHtml('ludo', 0) : ''}
    <button id="dgFriendOpp" style="width:100%;padding:14px;background:var(--game-accent,var(--red));color:#fff;border:none;border-radius:14px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;cursor:pointer;margin-bottom:10px;${stakesOk ? 'margin-top:10px;' : ''}">👤 Challenge a friend · Live</button>
    <button id="dgCancelGame" style="width:100%;padding:12px;background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;">Cancel</button>`;
      document.querySelector('.device').appendChild(sheet);
      if (stakesOk) wireDangalStakePicker(sheet);
      document.getElementById('dgCancelGame').addEventListener('click', () => sheet.remove());
      document.getElementById('dgPracticeAi').addEventListener('click', () => {
        sheet.remove();
        launchPracticeVsAi('ludo', 'manch');
      });
      document.getElementById('dgFriendOpp').addEventListener('click', async () => {
        const stake = stakesOk ? readDangalStake(sheet) : 0;
        if (stake > 0 && window.DangalEconomy && typeof DangalEconomy.canAffordStake === 'function') {
          try {
            const ok = await DangalEconomy.canAffordStake(stake);
            if (!ok) {
              if (typeof showToast === 'function') {
                showToast('Not enough virtual chips — pick Friendly (0) or a lower stake');
              }
              return;
            }
          } catch (e) {
            if (typeof showToast === 'function') showToast('Couldn’t check chip balance — try Friendly (0)');
            return;
          }
        }
        if (typeof openFriendPickerSheet !== 'function') {
          if (typeof showToast === 'function') showToast('Sign in and add friends to challenge someone');
          return;
        }
        sheet.remove();
        const friend = await openFriendPickerSheet({
          title: 'Challenge · Ludo',
          subtitle: stake > 0 ? `Live 1v1 · ⚡${stake} virtual chips` : 'Live 1v1 · 2 players',
        });
        if (!friend) return;
        const uid = friend.uid || friend.id || '';
        const persistable = typeof isPersistableUid === 'function' && isPersistableUid(uid);
        if (!persistable) {
          if (typeof showToast === 'function') showToast('That friend can’t play Live yet — try Practice');
          return;
        }
        const mid =
          typeof dangalMatchId === 'function'
            ? dangalMatchId('ludo', { name: friend.name, opponentUid: uid })
            : 'ludo_' + Date.now();
        const chatId = friend.chatId || friend.firestoreId || '';
        if (typeof openLudoPracticeSheet === 'function') {
          openLudoPracticeSheet(
            { name: friend.name, id: uid, uid, peerUid: uid, dangalMatchId: mid },
            {
              liveOnly: true,
              source: 'challenge_host',
              matchId: mid,
              opponentUid: uid,
              chatId,
              stake,
            }
          );
        } else {
          window.__dangalLaunchCtx = {
            gameId: 'ludo',
            gameType: 'ludo',
            mode: 'live',
            ludoMode: 'classic',
            matchId: mid,
            opponentUid: uid,
            stake,
            chatId,
            source: 'challenge_host',
            startedAt: Date.now(),
          };
          if (typeof sendChallengeCard === 'function' && chatId) {
            try {
              await sendChallengeCard(uid, 'ludo', { chatId, matchId: mid, stake, ludoMode: 'classic', mode: 'classic' });
            } catch (e) {}
          }
          openLudoGame(
            { name: friend.name, id: uid, uid, peerUid: uid, dangalMatchId: mid },
            2,
            { mode: 'classic', stake }
          );
        }
      });
      return;
    }

    const liveOk = typeof isLiveCapable === 'function' ? isLiveCapable(gameId) : !!game.liveDuel;
    // Oh No!: stake sheet runs after variant/house in the Live picker (Prompt 5 entry order)
    const stakesOk =
      liveOk &&
      gameId !== 'uno' &&
      typeof stakesEnabledForGame === 'function' &&
      stakesEnabledForGame(gameId);
    const sheet = document.createElement('div');
    sheet.style.cssText =
      'position:absolute;bottom:0;left:0;right:0;background:var(--white);border-radius:24px 24px 0 0;padding:22px;z-index:100;';
    sheet.innerHTML = `
    <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;margin-bottom:4px;">${game.icon} ${game.name}</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:14px;">${
      liveOk
        ? 'Practice vs AI anytime — or challenge a real friend for Live 1v1.'
        : 'Practice vs AI for now. Live friend sync ships when this title graduates.'
    }</div>
    <button id="dgPracticeAi" style="width:100%;padding:14px;background:var(--cream);border:2px solid var(--line);border-radius:14px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;cursor:pointer;margin-bottom:10px;">🤖 Practice vs AI</button>
    ${stakesOk ? dangalStakePickerHtml(gameId, 0) : ''}
    <button id="dgFriendOpp" style="width:100%;padding:14px;background:var(--game-accent,var(--red));color:#fff;border:none;border-radius:14px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;cursor:pointer;margin-bottom:10px;${stakesOk ? 'margin-top:10px;' : ''}">👤 Challenge a friend${liveOk ? ' · Live' : ''}</button>
    <button id="dgCancelGame" style="width:100%;padding:12px;background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;">Cancel</button>
  `;
    document.querySelector('.device').appendChild(sheet);
    if (stakesOk) wireDangalStakePicker(sheet);
    document.getElementById('dgCancelGame').addEventListener('click', () => sheet.remove());
    document.getElementById('dgPracticeAi').addEventListener('click', () => {
      sheet.remove();
      launchPracticeVsAi(gameId, 'manch');
    });
    document.getElementById('dgFriendOpp').addEventListener('click', async () => {
      const stake = stakesOk ? readDangalStake(sheet) : 0;
      if (stake > 0 && window.DangalEconomy && typeof DangalEconomy.canAffordStake === 'function') {
        try {
          const ok = await DangalEconomy.canAffordStake(stake);
          if (!ok) {
            if (typeof showToast === 'function') {
              showToast('Not enough virtual chips — pick Friendly (0) or a lower stake');
            }
            return;
          }
        } catch (e) {
          if (typeof showToast === 'function') showToast('Couldn’t check chip balance — try Friendly (0)');
          return;
        }
      }
      if (typeof openFriendPickerSheet === 'function') {
        sheet.remove();
        const friend = await openFriendPickerSheet({
          title: `Challenge · ${game.name}`,
          subtitle: liveOk
            ? stake > 0
              ? `Live 1v1 · ⚡${stake} virtual chips`
              : 'Live 1v1 with a real friend'
            : 'Friend challenge (Practice until Live ships)',
        });
        if (friend) {
          const uid = friend.uid || friend.id || '';
          const persistable = typeof isPersistableUid === 'function' && isPersistableUid(uid);
          const mid =
            persistable && liveOk && typeof dangalMatchId === 'function'
              ? dangalMatchId(gameId, { name: friend.name, opponentUid: uid })
              : '';
          const chatId = friend.chatId || friend.firestoreId || '';
          let chessTc = null;
          if (gameId === 'chess' && persistable && liveOk && typeof openChessLiveTimeSheet === 'function') {
            chessTc = await openChessLiveTimeSheet({ defaultMin: 5, defaultInc: 0 });
            if (chessTc == null) return;
          }
          const tcPayload = chessTc
            ? {
                timeControl: chessTc.label,
                timeMin: chessTc.min,
                timeInc: chessTc.inc,
                min: chessTc.min,
                inc: chessTc.inc,
                chess960: !!chessTc.chess960,
                timeControlLabel: chessTc.label,
              }
            : {};
          if (persistable && liveOk && mid && typeof sendChallengeCard === 'function' && chatId) {
            // Oh No!: host picks variant/house first — challenge sent from Live picker Start
            if (gameId !== 'uno') {
              try {
                await sendChallengeCard(uid, gameId, Object.assign({ chatId, matchId: mid, stake }, tcPayload));
              } catch (e) {}
            }
          }
          // Practice fallback (non-Live / non-persistable): never seat the friend as AI.
          if (!(persistable && liveOk)) {
            launchPracticeVsAi(gameId, 'manch');
            return;
          }
          game.launch(
            Object.assign(
              {
                chat: {
                  name: friend.name,
                  id: uid,
                  uid,
                  peerUid: uid,
                  dangalMatchId: mid || undefined,
                },
                source: 'challenge_host',
                mode: 'live',
                opponentUid: uid,
                stake,
                matchId: mid || '',
                chatId,
              },
              tcPayload
            )
          );
        }
        return;
      }
      if (typeof showToast === 'function') {
        showToast('Sign in and add friends to challenge someone');
      }
    });
  }

  function handleDangalGameTap(gameId) {
    const game = getGame(gameId);
    if (!game) return;

    if (gameId === 'quiz') {
      if (typeof openQuizCategorySheet === 'function') openQuizCategorySheet();
      return;
    }

    // Graduation wins over stale solo registry flags — Live-capable Manch taps
    // must reach the friend / Live sheet, not silent Practice.
    const liveCapable =
      typeof isLiveCapable === 'function' ? isLiveCapable(gameId) : !!game.liveDuel;
    const practiceOnly =
      isSoloPracticeGame(gameId) || ((game.solo || game.gameType === 'solo') && !liveCapable);
    if (practiceOnly) {
      launchSoloPractice(gameId, 'manch');
      return;
    }

    if (gameId === 'uno') {
      launchDangalWithOpponent('uno');
      return;
    }

    if (gameId === 'ludo') {
      launchDangalWithOpponent('ludo');
      return;
    }

    launchDangalWithOpponent(gameId);
  }

  // Muqabala / quiz — registry launch; engine + content sources in dangal.js / baithak.js.
  registerGame({
    id: 'quiz',
    name: 'Quiz Muqabala',
    desc: 'GK, Sports, Tech & more — pick a category',
    icon: '🧠',
    gameType: 'dual',
    liveDuel: true,
    genre: 'quiz',
    ratingKey: null,
    dangal: true,
    chat1v1: true,
    chatGroup: false,
    selfChat: false,
    order: 0,
    meta: {
      engine: 'startMuqabala → runMuqabala (dangal.js)',
      questions: 'bank: SAMPLE_* + MUQABALA_QUESTIONS; manual/ai via opts.questions',
      customCreator: 'baithak openChallengeCreator → same engine',
      timers: '10/15/20/30s (default 20)',
      aiQuiz: 'generateMuqabalaQuestionsAI via callAI; gated by isAiFeaturesEnabled',
      session: 'createGameSession type=quiz',
      live: 'DangalLive games/quiz/{matchId} — Phase B lockstep + Phase C stakes',
      stakes: 'DangalEconomy.reportGameEnd once per matchId; Friendly=0',
    },
    launch(ctx) {
      const c = ctx || window.__dangalLaunchCtx || {};
      const liveIntent =
        c.mode === 'live' ||
        c.source === 'challenge' ||
        c.source === 'challenge_host';
      const opp = c.opponentUid || (c.chat && typeof opponentUidFromChat === 'function' ? opponentUidFromChat(c.chat) : '');
      const mid = String(c.matchId || (c.chat && c.chat.dangalMatchId) || '').trim();
      if (liveIntent && opp) {
        if (!mid || (typeof isPersistableUid === 'function' && !isPersistableUid(opp))) {
          if (typeof showToast === 'function') {
            showToast('Challenge link broken — open Practice instead');
          }
          if (typeof openQuizCategorySheet === 'function') openQuizCategorySheet();
          else if (typeof startMuqabala === 'function') {
            startMuqabala(null, c.category || 'GK', { practice: true, simulated: true, skipMatchmaking: true, skipCredit: true });
          }
          return;
        }
        const stakeWanted = Number(c.stake) || 0;
        const name =
          (c.chat && (c.chat.name || c.chat.peerName || c.chat.displayName)) || 'Opponent';
        const goLive = () => {
          if (typeof startMuqabala === 'function') {
            startMuqabala(name, c.category || 'GK', {
              skipMatchmaking: true,
              opponentUid: opp,
              matchId: mid,
              source: c.source === 'challenge_host' ? 'challenge_host' : 'challenge',
              stake: stakeWanted,
              practice: false,
              simulated: false,
              skipCredit: true,
            });
          }
        };
        if (stakeWanted > 0 && window.DangalEconomy && typeof DangalEconomy.canAffordStake === 'function') {
          Promise.resolve(DangalEconomy.canAffordStake(stakeWanted)).then((ok) => {
            if (!ok) {
              if (typeof showToast === 'function') {
                showToast('Not enough virtual chips for ⚡' + stakeWanted + ' — ask for Friendly (0)');
              }
              return;
            }
            goLive();
          }).catch(() => {
            if (typeof showToast === 'function') showToast('Couldn’t check chip balance — try again');
          });
          return;
        }
        goLive();
        return;
      }
      if (typeof openQuizCategorySheet === 'function') openQuizCategorySheet();
      else if (typeof startMuqabala === 'function') startMuqabala(null, (c && c.category) || 'GK');
    },
  });

  window.registerGame = registerGame;
  window.getGames = getGames;
  window.getGame = getGame;
  window.getGameGenres = getGameGenres;
  window.genreLabel = genreLabel;
  window.GAME_GENRES = GAME_GENRES;
  window.DANGAL_STAKE_OPTIONS = DANGAL_STAKE_OPTIONS;
  window.dangalStakePickerHtml = dangalStakePickerHtml;
  window.wireDangalStakePicker = wireDangalStakePicker;
  window.readDangalStake = readDangalStake;
  window.openDangalStakeSheet = openDangalStakeSheet;
  window.launchDangalGame = launchDangalGame;
  window.clearDangalLaunchCtx = clearDangalLaunchCtx;
  window.practiceAiChat = practiceAiChat;
  window.getPracticeEntryClass = getPracticeEntryClass;
  window.isSoloPracticeGame = isSoloPracticeGame;
  window.launchPracticeVsAi = launchPracticeVsAi;
  window.launchSoloPractice = launchSoloPractice;
  // Game-launch boundary (CONVENTIONS 4c) — a broken engine must not blank the shell
  const guardGame = typeof safeFeature === 'function' ? safeFeature : (n, f) => f;
  window.openGamePicker = guardGame('game_picker', openGamePicker);
  window.handleDangalGameTap = guardGame('game_launch', handleDangalGameTap);
  window.launchDangalWithOpponent = guardGame('game_launch_vs', launchDangalWithOpponent);
})();
