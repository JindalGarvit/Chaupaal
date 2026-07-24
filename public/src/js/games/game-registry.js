/**
 * Single source of truth for game metadata + launchers.
 *
 * Self-registration: each game file calls registerGame(descriptor) at load time.
 *
 * @typedef {'solo'|'dual'|'multiplayer'} GameType
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
 * @property {GameType} [gameType] - internal only (never shown in UI)
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

  function inferGameType(d) {
    if (d.gameType === 'solo' || d.gameType === 'dual' || d.gameType === 'multiplayer') return d.gameType;
    if (d.solo) return 'solo';
    if (d.chatGroup) return 'multiplayer';
    return 'dual';
  }

  /**
   * @param {GameDescriptor} descriptor
   */
  function registerGame(descriptor) {
    if (!descriptor || !descriptor.id || typeof descriptor.launch !== 'function') return;
    const next = Object.assign({}, descriptor, { gameType: inferGameType(descriptor) });
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
   * @param {GameType} [filter.gameType] - internal categorization filter
   * @param {string} [filter.id]
   * @returns {GameDescriptor[]}
   */
  function getGames(filter) {
    const f = filter || {};
    let list = order.map((id) => games.get(id)).filter(Boolean);

    if (f.id) return list.filter((g) => g.id === f.id);
    if (f.dangal) list = list.filter((g) => g.dangal !== false);
    if (f.gameType) list = list.filter((g) => g.gameType === f.gameType);
    if (f.solo === true) list = list.filter((g) => g.gameType === 'solo' || g.solo);
    if (f.selfChat === true) {
      // Practice hub: pure solos + dual/multi marked selfChat (AI / solo practice)
      list = list.filter((g) => g.selfChat || g.gameType === 'solo' || g.solo);
    }
    if (f.chat1v1 === true) list = list.filter((g) => g.chat1v1);
    if (f.chatGroup === true) list = list.filter((g) => g.chatGroup);

    list.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
    return list;
  }

  function getGame(id) {
    return games.get(id) || null;
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
        emoji: g.icon,
        name: g.name,
        desc: g.desc,
        fn: () => g.launch(ctx),
      }));
      title = 'Solo games';
      subtitle = 'Solo games only — practice & test here';
    } else if (isGroup) {
      pickerGames = getGames({ chatGroup: true }).map((g) => ({
        emoji: g.icon,
        name: g.name,
        desc: g.desc,
        fn: () => g.launch(ctx),
      }));
      title = 'Group games';
      subtitle = "Select a game — you'll pick players next";
    } else {
      pickerGames = getGames({ chat1v1: true }).map((g) => ({
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
      <button data-i="${i}" style="width:100%;padding:13px 14px;background:var(--cream);border:2px solid var(--line);border-radius:14px;margin-bottom:8px;text-align:left;display:flex;align-items:center;gap:12px;cursor:pointer;">
        <span style="font-size:26px;flex-shrink:0;">${g.emoji}</span>
        <div><div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:14px;">${g.name}</div><div style="font-size:11px;color:var(--muted);margin-top:1px;">${g.desc}</div></div>
      </button>`
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
    document.getElementById('closeGP').addEventListener('click', () => {
      sheet.remove();
      // Soft signal for conversation-repair chips (no guilt / streak)
      if (chat && chat.type === 'dm' && typeof markGameInviteDeclined === 'function') {
        markGameInviteDeclined(chat.firestoreId || chat.id);
      }
    });
  }

  /** Dangal opponent sheet for games that need a chat context. */
  function launchDangalWithOpponent(gameId) {
    const game = getGame(gameId);
    if (!game) return;

    if (gameId === 'ludo' && typeof openLudoGame === 'function') {
      const s = document.createElement('div');
      s.style.cssText =
        'position:absolute;bottom:0;left:0;right:0;background:var(--white);border-radius:24px 24px 0 0;padding:20px;z-index:100;';
      s.innerHTML = `<div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;margin-bottom:14px;">🎯 Ludo — How many players?</div>
      ${[2, 3, 4]
        .map(
          (n) =>
            `<button data-n="${n}" style="width:100%;padding:13px;background:var(--cream);border:2px solid var(--line);border-radius:14px;margin-bottom:8px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:14px;cursor:pointer;">${n} Players</button>`
        )
        .join('')}
      <button id="closeLudoPick" style="width:100%;padding:12px;background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;">Cancel</button>`;
      document.querySelector('.device').appendChild(s);
      s.querySelectorAll('[data-n]').forEach((btn) =>
        btn.addEventListener('click', () => {
          s.remove();
          openLudoGame({ name: 'AI Opponent', id: 'ai' }, parseInt(btn.dataset.n, 10));
        })
      );
      document.getElementById('closeLudoPick').addEventListener('click', () => s.remove());
      return;
    }

    const sheet = document.createElement('div');
    sheet.style.cssText =
      'position:absolute;bottom:0;left:0;right:0;background:var(--white);border-radius:24px 24px 0 0;padding:22px;z-index:100;';
    sheet.innerHTML = `
    <div style="font-family:Space Grotesk,sans-serif;font-weight:700;font-size:18px;margin-bottom:14px;">${game.icon} ${game.name}</div>
    <button id="dgRandomOpp" style="width:100%;padding:14px;background:var(--game-accent,var(--red));color:#fff;border:none;border-radius:14px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;cursor:pointer;margin-bottom:10px;">🎯 Find a random opponent</button>
    <button id="dgFriendOpp" style="width:100%;padding:14px;background:var(--cream);border:2px solid var(--line);border-radius:14px;font-family:Space Grotesk,sans-serif;font-weight:700;font-size:15px;cursor:pointer;margin-bottom:10px;">👤 Challenge a friend</button>
    <button id="dgCancelGame" style="width:100%;padding:12px;background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;">Cancel</button>
  `;
    document.querySelector('.device').appendChild(sheet);
    document.getElementById('dgCancelGame').addEventListener('click', () => sheet.remove());
    const launchGame = (chat) => {
      sheet.remove();
      game.launch({ chat, source: 'dangal' });
    };
    document.getElementById('dgRandomOpp').addEventListener('click', () =>
      launchGame({ name: 'Priya_29', id: 'random' })
    );
    document.getElementById('dgFriendOpp').addEventListener('click', async () => {
      if (typeof openFriendPickerSheet === 'function') {
        sheet.remove();
        const friend = await openFriendPickerSheet({
          title: `Challenge · ${game.name}`,
          subtitle: 'Pick a friend to play',
        });
        if (friend) {
          game.launch({
            chat: { name: friend.name, id: friend.id || 'friend_' + friend.name, uid: friend.uid },
            source: 'dangal',
          });
        }
        return;
      }
      const name =
        typeof promptNameSheet === 'function'
          ? await promptNameSheet({
              title: 'Friend username',
              placeholder: 'Enter username',
              confirmLabel: 'Challenge',
            })
          : null;
      if (name) launchGame({ name, id: 'friend_' + name });
    });
  }

  function handleDangalGameTap(gameId) {
    const game = getGame(gameId);
    if (!game) return;

    if (gameId === 'quiz') {
      if (typeof openQuizCategorySheet === 'function') openQuizCategorySheet();
      return;
    }

    if (game.solo) {
      game.launch({ source: 'dangal' });
      return;
    }

    if (gameId === 'uno' && typeof openUnoVariantPicker === 'function') {
      openUnoVariantPicker({ name: 'AI Opponent', id: 'ai' });
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
    featured: true,
    gameType: 'dual',
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
  // Game-launch boundary (CONVENTIONS 4c) — a broken engine must not blank the shell
  const guardGame = typeof safeFeature === 'function' ? safeFeature : (n, f) => f;
  window.openGamePicker = guardGame('game_picker', openGamePicker);
  window.handleDangalGameTap = guardGame('game_launch', handleDangalGameTap);
  window.launchDangalWithOpponent = guardGame('game_launch_vs', launchDangalWithOpponent);
})();
