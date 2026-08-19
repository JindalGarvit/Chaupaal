/**
 * Game identity tokens keyed by canonical registry ids.
 */
(function () {
  'use strict';

  const GAME_IDENTITY = {
    chess: { primary: '#8B5E3C', secondary: '#F0D9B5', surface: '#3D2B1A', label: 'Chess', icon: '♟', orientation: 'portrait' },
    snakes: { primary: '#E85D4A', secondary: '#F9E784', surface: '#1A3A2A', label: 'Snakes & Ladders', icon: '🎲', orientation: 'portrait' },
    ludo: { primary: '#E040FB', secondary: '#FFD740', surface: '#1A1A2E', label: 'Ludo', icon: '🎯', orientation: 'portrait' },
    ttt: { primary: '#1565C0', secondary: '#E3F2FD', surface: '#0D1B2A', label: 'Tic Tac Toe', icon: '⚔', orientation: 'portrait' },
    uno: { primary: '#D32F2F', secondary: '#FF8F00', surface: '#1A0A0A', label: 'Oh No! Cards', icon: '🃏', orientation: 'portrait' },
    wordguess: { primary: '#00796B', secondary: '#B2EBF2', surface: '#0A1A18', label: 'Shabd Five', icon: '📝', orientation: 'portrait' },
    fiveinrow: { primary: '#212121', secondary: '#F5F5DC', surface: '#0A0A0A', label: 'Five in a Row', icon: '⬤', orientation: 'portrait' },
    business: { primary: '#F9A825', secondary: '#1B5E20', surface: '#1A1500', label: 'Business', icon: '🏙', orientation: 'portrait' },
    tambola: { primary: '#E91E8C', secondary: '#FFD600', surface: '#1A0010', label: 'Tambola', icon: '🎱', orientation: 'portrait' },
    carrom: { primary: '#8D6E63', secondary: '#FFF8E1', surface: '#1A0F00', label: 'Carrom', icon: '🪙', orientation: 'portrait' },
    streetcricket: { primary: '#2E7D32', secondary: '#FFCC02', surface: '#0A1A0A', label: 'Cricket', icon: '🏏', orientation: 'landscape' },
    gullykick: { primary: '#1B5E20', secondary: '#FFFFFF', surface: '#0A120A', label: 'Football', icon: '⚽', orientation: 'landscape' },
    badminton: { primary: '#01579B', secondary: '#E1F5FE', surface: '#000D1A', label: 'Badminton', icon: '🏸', orientation: 'landscape' },
    tabletennis: { primary: '#0D47A1', secondary: '#FF6F00', surface: '#000A1A', label: 'Table Tennis', icon: '🏓', orientation: 'landscape' },
    pickleball: { primary: '#33691E', secondary: '#FFEA00', surface: '#0A1200', label: 'Pickleball', icon: '🥒', orientation: 'landscape' },
    kabaddi: { primary: '#BF360C', secondary: '#FFB300', surface: '#1A0800', label: 'Kabaddi', icon: '💪', orientation: 'landscape' },
    tennis: { primary: '#2E7D32', secondary: '#FFFFFF', surface: '#0A1A0A', label: 'Tennis', icon: '🎾', orientation: 'landscape' },
    rummy: { primary: '#6A1B9A', secondary: '#FFD54F', surface: '#100018', label: 'Rummy', icon: '🃏', orientation: 'portrait' },
    teenpatti: { primary: '#4A148C', secondary: '#FFD700', surface: '#0D0018', label: 'Teen Patti', icon: '♠', orientation: 'portrait' },
    bluff: { primary: '#37474F', secondary: '#FF1744', surface: '#0A0E10', label: 'Bluff', icon: '🎭', orientation: 'portrait' },
    sattepe: { primary: '#1565C0', secondary: '#FFD600', surface: '#000A1A', label: 'Satte pe Satta', icon: '7️⃣', orientation: 'portrait' },
    andarbaahar: { primary: '#1B5E20', secondary: '#FF6B35', surface: '#001A00', label: 'Andar Bahar', icon: '🃏', orientation: 'portrait' },
    scribble: { primary: '#E91E63', secondary: '#FFFFFF', surface: '#1A1A1A', label: 'Scribble', icon: '🎨', orientation: 'portrait' },
    quiz: { primary: '#6200EA', secondary: '#FFD600', surface: '#0D0020', label: 'Muqabala', icon: '🧠', orientation: 'portrait' },
    rushrunner: { primary: '#FF6D00', secondary: '#FFD600', surface: '#1A0A00', label: 'Rush Runner', icon: '🏃', orientation: 'landscape' },
    patangbaazi: { primary: '#FF6D00', secondary: '#1565C0', surface: '#000D1A', label: 'Patang Baazi', icon: '🪁', orientation: 'landscape' },
    pool: { primary: '#1B3A2D', secondary: '#F5F5DC', surface: '#0A1A10', label: 'Pool / Snooker', icon: '🎱', orientation: 'landscape' },
    ankjod: { primary: '#1A237E', secondary: '#FFD600', surface: '#0A0014', label: 'Ank Jod', icon: '🔢', orientation: 'portrait' },
    tiptap: { primary: '#FF6D00', secondary: '#FFD600', surface: '#1A0800', label: 'Tip Tap', icon: '🌼', orientation: 'portrait' },
    brickbreaker: { primary: '#7C4DFF', secondary: '#B39DFF', surface: '#0D0A18', label: 'Brick Breaker', icon: '🧱', orientation: 'landscape' },
  };

  const RATED_GAMES = ['chess', 'fiveinrow', 'ttt', 'streetcricket', 'gullykick', 'quiz'];

  function getGameIdentity(id) {
    const key = typeof canonicalGameId === 'function' ? canonicalGameId(id) : String(id || '');
    return GAME_IDENTITY[key] || null;
  }

  function applyGameIdentity(gameKey, overlayEl) {
    const id = getGameIdentity(gameKey);
    if (!id || !overlayEl?.style) return;
    overlayEl.style.setProperty('--game-primary', id.primary);
    overlayEl.style.setProperty('--game-secondary', id.secondary);
    overlayEl.style.setProperty('--game-surface', id.surface);
  }

  function isRatedGame(id) {
    const key = typeof canonicalGameId === 'function' ? canonicalGameId(id) : String(id || '');
    return RATED_GAMES.indexOf(key) !== -1;
  }

  window.GAME_IDENTITY = GAME_IDENTITY;
  window.DANGAL_RATED_GAMES = RATED_GAMES;
  window.getGameIdentity = getGameIdentity;
  window.applyGameIdentity = applyGameIdentity;
  window.isRatedGame = isRatedGame;

  if (typeof GAME_ID_ALIASES === 'object' && GAME_ID_ALIASES) {
    Object.keys(GAME_ID_ALIASES).forEach((alias) => {
      const canon = GAME_ID_ALIASES[alias];
      if (GAME_IDENTITY[canon] && !GAME_IDENTITY[alias]) GAME_IDENTITY[alias] = GAME_IDENTITY[canon];
    });
  }
})();
