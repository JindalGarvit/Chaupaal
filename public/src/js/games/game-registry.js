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

    window.__dangalLaunchCtx = {
      gameId,
      gameType: gameId,
      mode,
      matchId: matchId || '',
      opponentUid: opponentUid || '',
      stake,
      chatId: o.chatId || chat?.firestoreId || chat?.id || '',
      source: o.source || '',
      startedAt: Date.now(),
    };

    if (chat && matchId) chat.dangalMatchId = matchId;

    const ctx = Object.assign({}, o, {
      chat,
      matchId,
      opponentUid,
      stake,
      mode,
      source: o.source || '',
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

  /** Registry-driven chat game picker (replaces duplicated openGamePicker). */
  function openGamePicker(chat, isGroup) {
    const isSelf = typeof isSelfChat === 'function' && isSelfChat(chat);
    const ctx = { chat, isGroup: !!isGroup, source: isSelf ? 'self' : 'chat' };

    let pickerGames;
    let title;
    let subtitle;

    if (isSelf) {
      pickerGames = getGames({ selfChat: true }).map((g) => ({
        id: g.id,
        emoji: g.icon,
        name: g.name,
        desc: g.desc,
        fn: () => g.launch(ctx),
      }));
      title = 'Solo games';
      subtitle = 'Solo games only — practice & test here';
    } else if (isGroup) {
      pickerGames = getGames({ chatGroup: true }).map((g) => ({
        id: g.id,
        emoji: g.icon,
        name: g.name,
        desc: g.desc,
        fn: () => g.launch(ctx),
      }));
      title = 'Group games';
      subtitle = "Select a game — you'll pick players next";
    } else {
      pickerGames = getGames({ chat1v1: true }).map((g) => ({
        id: g.id,
        emoji: g.icon,
        name: g.name,
        desc: g.desc,
        fn: () => g.launch(ctx),
      }));
      title = 'Play a game';
      subtitle = 'Just you and ' + (chat?.name || 'your friend');
    }

    const sheet = document.createElement('div');
    sheet.style.cssText =
      'position:absolute;bottom:0;left:0;right:0;background:var(--white);border-radius:24px 24px 0 0;padding:20px;z-index:100;max-height:85vh;overflow-y:auto;';

    sheet.innerHTML = `
    <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;margin-bottom:4px;">🎮 ${title}</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:14px;">${subtitle}</div>
    ${pickerGames
      .map(
        (g, i) => `
      <div class="dangal-picker-row" style="display:flex;gap:8px;margin-bottom:8px;align-items:stretch;">
      <button data-i="${i}" type="button" style="flex:1;padding:13px 14px;background:var(--cream);border:2px solid var(--line);border-radius:14px;text-align:left;display:flex;align-items:center;gap:12px;cursor:pointer;">
        <span style="font-size:26px;flex-shrink:0;">${g.emoji}</span>
        <div><div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:14px;">${g.name}</div><div style="font-size:11px;color:var(--muted);margin-top:1px;">${g.desc}</div></div>
      </button>
      ${
        !isSelf && !isGroup
          ? `<button type="button" data-challenge-i="${i}" class="dangal-picker-challenge" style="flex-shrink:0;padding:10px 12px;border-radius:14px;border:2px solid var(--line);background:var(--white);font:700 11px Space Grotesk,sans-serif;cursor:pointer;max-width:88px;">Challenge</button>`
          : ''
      }
      </div>`
      )
      .join('')}
    <button id="closeGP" style="width:100%;padding:12px;background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;margin-top:4px;">Cancel</button>
  `;

    const device = document.querySelector('.device');
    if (!device) return;
    device.appendChild(sheet);
    if (typeof enableSwipeDismiss === 'function') {
      enableSwipeDismiss(sheet, () => sheet.remove());
    }
    pickerGames.forEach((g, i) =>
      sheet.querySelector(`[data-i="${i}"]`).addEventListener('click', () => {
        sheet.remove();
        g.fn();
      })
    );
    sheet.querySelectorAll('[data-challenge-i]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const i = Number(btn.dataset.challengeI);
        const row = pickerGames[i];
        if (!row || !row.id) return;
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
          await sendChallengeCard(toUid, gid, { chatId, matchId });
          sheet.remove();
          if (typeof showToast === 'function') showToast('Challenge sent');
        } catch (err) {
          btn.disabled = false;
          if (typeof showToast === 'function') showToast(err?.message || 'Could not send challenge');
        }
      });
    });
    document.getElementById('closeGP').addEventListener('click', () => {
      sheet.remove();
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

    if (gameId === 'ludo' && typeof openLudoGame === 'function') {
      const s = document.createElement('div');
      s.style.cssText =
        'position:absolute;bottom:0;left:0;right:0;background:var(--white);border-radius:24px 24px 0 0;padding:20px;z-index:100;';
      s.innerHTML = `<div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;margin-bottom:6px;">🎯 Ludo</div>
      <div style="font-size:12px;color:var(--muted);margin-bottom:12px;">Practice vs AI — Live friends coming as this title graduates.</div>
      ${[2, 3, 4]
        .map(
          (n) =>
            `<button data-n="${n}" style="width:100%;padding:13px;background:var(--cream);border:2px solid var(--line);border-radius:14px;margin-bottom:8px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:14px;cursor:pointer;">${n} Players · Practice</button>`
        )
        .join('')}
      <button id="closeLudoPick" style="width:100%;padding:12px;background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;">Cancel</button>`;
      document.querySelector('.device').appendChild(s);
      s.querySelectorAll('[data-n]').forEach((btn) =>
        btn.addEventListener('click', () => {
          s.remove();
          const n = parseInt(btn.dataset.n, 10);
          window.__dangalLaunchCtx = {
            gameId: 'ludo',
            gameType: 'ludo',
            mode: 'practice',
            matchId: '',
            opponentUid: 'ai',
            stake: 0,
            chatId: '',
            source: 'dangal',
            startedAt: Date.now(),
          };
          openLudoGame({ name: 'AI', id: 'ai' }, n);
        })
      );
      document.getElementById('closeLudoPick').addEventListener('click', () => s.remove());
      return;
    }

    const liveOk = typeof isLiveCapable === 'function' ? isLiveCapable(gameId) : !!game.liveDuel;
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
    <button id="dgFriendOpp" style="width:100%;padding:14px;background:var(--game-accent,var(--red));color:#fff;border:none;border-radius:14px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;cursor:pointer;margin-bottom:10px;">👤 Challenge a friend${liveOk ? ' · Live' : ''}</button>
    <button id="dgCancelGame" style="width:100%;padding:12px;background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;">Cancel</button>
  `;
    document.querySelector('.device').appendChild(sheet);
    document.getElementById('dgCancelGame').addEventListener('click', () => sheet.remove());
    document.getElementById('dgPracticeAi').addEventListener('click', () => {
      sheet.remove();
      game.launch({
        chat: { name: 'AI', id: 'ai' },
        source: 'dangal',
        mode: 'practice',
        opponentUid: 'ai',
      });
    });
    document.getElementById('dgFriendOpp').addEventListener('click', async () => {
      if (typeof openFriendPickerSheet === 'function') {
        sheet.remove();
        const friend = await openFriendPickerSheet({
          title: `Challenge · ${game.name}`,
          subtitle: liveOk ? 'Live 1v1 with a real friend' : 'Friend challenge (Practice until Live ships)',
        });
        if (friend) {
          const uid = friend.uid || friend.id || '';
          const persistable = typeof isPersistableUid === 'function' && isPersistableUid(uid);
          game.launch({
            chat: {
              name: friend.name,
              id: persistable ? uid : 'friend_' + (friend.name || 'x'),
              uid: persistable ? uid : undefined,
              peerUid: persistable ? uid : undefined,
            },
            source: 'dangal',
            mode: persistable && liveOk ? 'live' : 'practice',
            opponentUid: persistable ? uid : '',
          });
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

    if (game.solo || game.gameType === 'solo') {
      launchDangalGame({
        gameId,
        source: 'manch',
        mode: 'practice',
        _userLaunch: game.__rawLaunch,
        _descriptor: game,
      });
      return;
    }

    if (gameId === 'uno' && typeof openUnoVariantPicker === 'function') {
      window.__dangalLaunchCtx = {
        gameId: 'uno',
        gameType: 'uno',
        mode: 'practice',
        matchId: '',
        opponentUid: 'ai',
        stake: 0,
        chatId: '',
        source: 'manch',
        startedAt: Date.now(),
      };
      openUnoVariantPicker({ name: 'AI', id: 'ai' });
      return;
    }

    if (gameId === 'ludo') {
      launchDangalWithOpponent('ludo');
      return;
    }

    launchDangalWithOpponent(gameId);
  }

  // Muqabala / quiz — registry launch; engine + content sources in dangal.js / baithak.js (Phase 2C).
  registerGame({
    id: 'quiz',
    name: 'Quiz Muqabala',
    desc: 'GK, Sports, Tech & more — pick a category',
    icon: '🧠',
    gameType: 'dual',
    genre: 'quiz',
    ratingKey: null,
    dangal: true,
    chat1v1: false,
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
    },
    launch(ctx) {
      if (typeof openQuizCategorySheet === 'function') openQuizCategorySheet();
      else if (typeof startMuqabala === 'function') startMuqabala(null, (ctx && ctx.category) || 'GK');
    },
  });

  window.registerGame = registerGame;
  window.getGames = getGames;
  window.getGame = getGame;
  window.getGameGenres = getGameGenres;
  window.genreLabel = genreLabel;
  window.GAME_GENRES = GAME_GENRES;
  window.launchDangalGame = launchDangalGame;
  window.clearDangalLaunchCtx = clearDangalLaunchCtx;
  // Game-launch boundary (CONVENTIONS 4c) — a broken engine must not blank the shell
  const guardGame = typeof safeFeature === 'function' ? safeFeature : (n, f) => f;
  window.openGamePicker = guardGame('game_picker', openGamePicker);
  window.handleDangalGameTap = guardGame('game_launch', handleDangalGameTap);
  window.launchDangalWithOpponent = guardGame('game_launch_vs', launchDangalWithOpponent);
})();
