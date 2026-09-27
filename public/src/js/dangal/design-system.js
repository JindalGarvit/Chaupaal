/**
 * Game identity tokens keyed by canonical registry ids.
 * Single source of truth for Manch tiles, chat pickers, and overlays
 * (primary accent + emoji fallback + curated SVG mark + label).
 * GAME_ACCENTS / GAME_LABELS sync from here.
 *
 * mark = inner SVG (viewBox 0 0 40 40), currentColor; render via gameMarkHtml().
 */
(function () {
  'use strict';

  /** Compact stroke/fill mark fragments — recognizable at ~40–64px. */
  const M = {
    chess:
      '<path fill="currentColor" d="M18.5 6c1.2 0 2.2.7 2.6 1.7.6-.4 1.4-.4 2 0 .5 1.1-.1 2.4-1.2 2.8l.4 1.5h-6.6l.4-1.5c-1.1-.4-1.7-1.7-1.2-2.8.6-.4 1.4-.4 2 0C16.3 6.7 17.3 6 18.5 6zm-4 8.5h12l-1.2 3.5H15.7L14.5 14.5zm1.2 5h9.6L26 28H14l1.7-8.5zM12 29h16v3H12z"/>',
    snakes:
      '<path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M8 28c4-8 8-8 12 0s8 8 12 0"/><path fill="none" stroke="currentColor" stroke-width="2" d="M14 10v18M22 10v18"/><path fill="none" stroke="currentColor" stroke-width="1.6" d="M12 14h4M20 18h4M12 22h4"/>',
    ludo:
      '<path fill="currentColor" d="M17 6h6v11h11v6H23v11h-6V23H6v-6h11V6z"/><circle cx="12" cy="12" r="2.2" fill="currentColor" opacity=".45"/><circle cx="28" cy="12" r="2.2" fill="currentColor" opacity=".45"/><circle cx="12" cy="28" r="2.2" fill="currentColor" opacity=".45"/><circle cx="28" cy="28" r="2.2" fill="currentColor" opacity=".45"/>',
    ttt:
      '<path fill="none" stroke="currentColor" stroke-width="2.2" d="M14 8v24M26 8v24M8 14h24M8 26h24"/><circle cx="20" cy="20" r="4.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M9 9l6 6M15 9l-6 6"/>',
    uno:
      '<rect x="8" y="10" width="14" height="20" rx="2" fill="none" stroke="currentColor" stroke-width="2" transform="rotate(-12 15 20)"/><rect x="14" y="9" width="14" height="20" rx="2" fill="currentColor" opacity=".2" stroke="currentColor" stroke-width="2"/><rect x="18" y="11" width="14" height="20" rx="2" fill="none" stroke="currentColor" stroke-width="2" transform="rotate(10 25 21)"/><text x="21" y="23" text-anchor="middle" font-size="9" font-weight="700" fill="currentColor">!</text>',
    wordguess:
      '<rect x="5" y="12" width="5.5" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="12" y="12" width="5.5" height="6" rx="1" fill="currentColor"/><rect x="19" y="12" width="5.5" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="26" y="12" width="5.5" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="33" y="12" width="2" height="6" rx=".5" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".5"/><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M8 24h24M12 28h16"/>',
    tambola:
      '<rect x="6" y="10" width="28" height="20" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="1.4" d="M6 17h28M6 24h28M15 10v20M25 10v20"/><circle cx="10.5" cy="13.5" r="1.4" fill="currentColor"/><circle cx="20" cy="20.5" r="1.4" fill="currentColor"/><circle cx="29.5" cy="27" r="1.4" fill="currentColor"/>',
    carrom:
      '<circle cx="20" cy="20" r="14" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="20" cy="20" r="4" fill="currentColor"/><circle cx="11" cy="14" r="2.2" fill="currentColor" opacity=".55"/><circle cx="29" cy="14" r="2.2" fill="currentColor" opacity=".55"/><circle cx="11" cy="26" r="2.2" fill="currentColor" opacity=".55"/><circle cx="29" cy="26" r="2.2" fill="currentColor" opacity=".55"/>',
    streetcricket:
      '<path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M12 8c0 10 2 14 4 18M16 26c2 4 4 6 6 6"/><path fill="currentColor" d="M10 6h6v4h-6z"/><circle cx="28" cy="14" r="4.5" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="1.4" d="M26 12l4 4M30 12l-4 4"/>',
    badminton:
      '<path fill="currentColor" d="M20 6l2.5 8H28l-5 4 2 8-5.5-4-5.5 4 2-8-5-4h5.5L20 6z" opacity=".9"/><ellipse cx="20" cy="30" rx="5" ry="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path fill="none" stroke="currentColor" stroke-width="1.6" d="M20 27v-4"/>',
    rummy:
      '<rect x="6" y="12" width="12" height="18" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="14" y="9" width="12" height="18" rx="1.5" fill="currentColor" opacity=".18" stroke="currentColor" stroke-width="1.8"/><rect x="22" y="11" width="12" height="18" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path fill="currentColor" d="M18 15h4v2h-4zm0 4h4v2h-4z"/>',
    teenpatti:
      '<rect x="5" y="11" width="11" height="16" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8" transform="rotate(-8 10.5 19)"/><rect x="14.5" y="9" width="11" height="16" rx="1.5" fill="currentColor" opacity=".2" stroke="currentColor" stroke-width="1.8"/><rect x="24" y="11" width="11" height="16" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8" transform="rotate(8 29.5 19)"/><path fill="currentColor" d="M20 16c0 0-2.5 2.2-2.5 4S19 23 20 24.5C21 23 22.5 21.5 22.5 20S20 16 20 16z"/>',
    bluff:
      '<path fill="none" stroke="currentColor" stroke-width="2" d="M8 18c2-8 22-8 24 0v4c-2 8-22 8-24 0v-4z"/><ellipse cx="14" cy="19" rx="2.5" ry="3" fill="currentColor"/><ellipse cx="26" cy="19" rx="2.5" ry="3" fill="currentColor"/><path fill="none" stroke="currentColor" stroke-width="1.6" d="M17 25c1.5 1.5 4.5 1.5 6 0"/>',
    scribble:
      '<path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M8 28c4-10 6-4 10-12s6 2 10-6"/><path fill="currentColor" d="M28 6l6 6-14 14H14V20z"/><path fill="none" stroke="currentColor" stroke-width="1.4" d="M8 34h24"/>',
    quiz:
      '<circle cx="20" cy="18" r="12" fill="none" stroke="currentColor" stroke-width="2.2"/><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M15 15c1-3 9-3 10 1 0 3-4 3-4 6"/><circle cx="20" cy="27" r="1.8" fill="currentColor"/>',
    ankjod:
      '<rect x="6" y="6" width="28" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="1.4" d="M6 15.5h28M6 25h28M15.5 6v28M25 6v28"/><text x="11" y="13" text-anchor="middle" font-size="7" font-weight="700" fill="currentColor">3</text><text x="20" y="22.5" text-anchor="middle" font-size="7" font-weight="700" fill="currentColor">7</text><text x="29.5" y="32" text-anchor="middle" font-size="7" font-weight="700" fill="currentColor">1</text>',
    tiptap:
      '<circle cx="14" cy="16" r="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="26" cy="16" r="5" fill="currentColor" opacity=".25" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M20 22v10M16 28h8"/><path fill="currentColor" d="M20 6l1.2 2.8H24l-2.4 1.8.9 2.9L20 12l-2.5 1.5.9-2.9L16 8.8h2.8z"/>',
    brickbreaker:
      '<rect x="5" y="6" width="9" height="5" rx="1" fill="currentColor"/><rect x="15.5" y="6" width="9" height="5" rx="1" fill="currentColor" opacity=".55"/><rect x="26" y="6" width="9" height="5" rx="1" fill="currentColor"/><rect x="5" y="13" width="9" height="5" rx="1" fill="currentColor" opacity=".55"/><rect x="15.5" y="13" width="9" height="5" rx="1" fill="currentColor"/><rect x="26" y="13" width="9" height="5" rx="1" fill="currentColor" opacity=".55"/><circle cx="20" cy="24" r="2.5" fill="currentColor"/><rect x="12" y="32" width="16" height="3.5" rx="1.5" fill="currentColor"/>',
    imposter:
      '<path fill="currentColor" d="M20 7c-7.5 0-13 4.6-13 11.2C7 26 13 33 20 33s13-7 13-14.8C33 11.6 27.5 7 20 7z" opacity=".22"/><path fill="none" stroke="currentColor" stroke-width="2.2" d="M20 7c-7.5 0-13 4.6-13 11.2C7 26 13 33 20 33s13-7 13-14.8C33 11.6 27.5 7 20 7z"/><path fill="currentColor" d="M11.5 17.5c2.2-1.6 5.3-1.4 6.8.6-1.3 2.6-5 3-6.8-.6zM28.5 17.5c-2.2-1.6-5.3-1.4-6.8.6 1.3 2.6 5 3 6.8-.6z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M15 26c3 1.6 7 1.6 10 0"/>',
    rajamantri:
      '<path fill="currentColor" d="M9 16l4 4 7-9 7 9 4-4-2 12H11z"/><rect x="11" y="29" width="18" height="3" rx="1" fill="currentColor" opacity=".6"/><rect x="6" y="6" width="7" height="9" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.6" transform="rotate(-12 9.5 10.5)"/><rect x="27" y="6" width="7" height="9" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.6" transform="rotate(12 30.5 10.5)"/>',
    charades:
      '<circle cx="20" cy="9" r="4" fill="currentColor"/><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="M20 13v11M20 24l-5 9M20 24l5 9M20 16l-8-5M20 16l8 3 3-6"/><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" d="M6 18c-1.5 2-1.5 4 0 6M34 23c1.5 2 1.5 4 0 6" opacity=".6"/>',
    mostlikely:
      '<circle cx="11" cy="28" r="4" fill="currentColor" opacity=".35"/><circle cx="29" cy="28" r="4" fill="currentColor" opacity=".35"/><circle cx="20" cy="11" r="5" fill="currentColor"/><path fill="currentColor" d="M15 4l2 2.5L20 3l3 3.5L25 4l-.8 4h-8.4z" opacity=".8"/><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M13 24l4.5-6M27 24l-4.5-6M20 34v-9"/>',
  };

  const GAME_IDENTITY = {
    chess: { primary: '#8B5E3C', secondary: '#F0D9B5', surface: '#3D2B1A', label: 'Chess', icon: '♟', mark: M.chess, orientation: 'portrait' },
    snakes: { primary: '#2E7D32', secondary: '#F9E784', surface: '#1A3A2A', label: 'Snakes & Ladders', icon: '🐍', mark: M.snakes, orientation: 'portrait' },
    ludo: { primary: '#E040FB', secondary: '#FFD740', surface: '#1A1A2E', label: 'Ludo', icon: '🎯', mark: M.ludo, orientation: 'portrait' },
    ttt: { primary: '#1565C0', secondary: '#E3F2FD', surface: '#0D1B2A', label: 'Tic-Tac-Toe', icon: '⭕', mark: M.ttt, orientation: 'portrait' },
    uno: { primary: '#D32F2F', secondary: '#FF8F00', surface: '#1A0A0A', label: 'Oh, No! Cards', icon: '🃏', mark: M.uno, orientation: 'portrait' },
    wordguess: { primary: '#00796B', secondary: '#B2EBF2', surface: '#0A1A18', label: 'Shabd Five', icon: '📝', mark: M.wordguess, orientation: 'portrait' },
    tambola: { primary: '#E91E8C', secondary: '#FFD600', surface: '#1A0010', label: 'Tambola', icon: '🎫', mark: M.tambola, orientation: 'portrait' },
    carrom: { primary: '#8D6E63', secondary: '#FFF8E1', surface: '#1A0F00', label: 'Carrom', icon: '🪙', mark: M.carrom, orientation: 'portrait' },
    streetcricket: { primary: '#2E7D32', secondary: '#FFCC02', surface: '#0A1A0A', label: 'Street Cricket', icon: '🏏', mark: M.streetcricket, orientation: 'landscape', law: 'Street formats', lawHint: 'Over · Nets · Chase — not full cricket law' },
    badminton: { primary: '#01579B', secondary: '#E1F5FE', surface: '#000D1A', label: 'Badminton', icon: '🏸', mark: M.badminton, orientation: 'landscape', law: 'BWF-lite', lawHint: 'One game to 21 (win by 2) · arcade timing' },
    rummy: { primary: '#6A1B9A', secondary: '#FFD54F', surface: '#100018', label: 'Rummy', icon: '🃏', mark: M.rummy, orientation: 'portrait' },
    teenpatti: { primary: '#4A148C', secondary: '#FFD700', surface: '#0D0018', label: 'Teen Patti', icon: '♠', mark: M.teenpatti, orientation: 'portrait' },
    bluff: { primary: '#37474F', secondary: '#FF1744', surface: '#0A0E10', label: 'Bluff', icon: '🎭', mark: M.bluff, orientation: 'portrait' },
    scribble: { primary: '#E91E63', secondary: '#FFFFFF', surface: '#1A1A1A', label: 'Scribble', icon: '🎨', mark: M.scribble, orientation: 'portrait' },
    quiz: { primary: '#6200EA', secondary: '#FFD600', surface: '#0D0020', label: 'Quiz Muqabala', icon: '🧠', mark: M.quiz, orientation: 'portrait' },
    ankjod: { primary: '#1A237E', secondary: '#FFD600', surface: '#0A0014', label: 'Kakuro', icon: '🔢', mark: M.ankjod, orientation: 'portrait' },
    tiptap: { primary: '#FF6D00', secondary: '#FFD600', surface: '#1A0800', label: 'Tip Tap', icon: '✨', mark: M.tiptap, orientation: 'portrait' },
    brickbreaker: { primary: '#5C6BC0', secondary: '#B39DFF', surface: '#0D0A18', label: 'Brick Breaker', icon: '🧱', mark: M.brickbreaker, orientation: 'landscape' },
    imposter: { primary: '#C2185B', secondary: '#FFC107', surface: '#1A0712', label: 'Imposter', icon: '🕵️', mark: M.imposter, orientation: 'portrait' },
    rajamantri: { primary: '#B8860B', secondary: '#7B1E2B', surface: '#1A1004', label: 'Raja Mantri Chor Sipahi', icon: '👑', mark: M.rajamantri, orientation: 'portrait' },
    charades: { primary: '#00897B', secondary: '#FF7043', surface: '#041A18', label: 'Dumb Charades', icon: '🎭', mark: M.charades, orientation: 'portrait' },
    mostlikely: { primary: '#7C4DFF', secondary: '#FFD54F', surface: '#140A26', label: 'Most Likely To?', icon: '👉', mark: M.mostlikely, orientation: 'portrait' },
  };

  const RATED_GAMES = ['chess', 'ttt', 'streetcricket', 'quiz'];

  function escAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function escHtmlText(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function getGameIdentity(id) {
    const key = typeof canonicalGameId === 'function' ? canonicalGameId(id) : String(id || '');
    return GAME_IDENTITY[key] || null;
  }

  /**
   * Short honesty line for Manch prepare / chrome — empty when no lite law.
   * e.g. "BWF-lite · One game to 21 (win by 2) · arcade timing"
   */
  function federationHonestyLine(gameId) {
    const ident = getGameIdentity(gameId);
    if (!ident || !ident.law) return '';
    return ident.lawHint ? ident.law + ' · ' + ident.lawHint : ident.law;
  }

  /** Compact chip HTML for prepare sheets (progressive — one line). */
  function federationHonestyHtml(gameId) {
    const line = federationHonestyLine(gameId);
    if (!line) return '';
    return (
      '<div class="dangal-federation-honesty" style="font-size:11px;color:var(--muted);line-height:1.4;margin:0 0 12px;padding:8px 10px;border-radius:10px;background:var(--cream,#f5f0e8);border:1px solid var(--line,#e5e0d8);">' +
      escHtmlText(line) +
      '</div>'
    );
  }

  /**
   * Prefer curated SVG mark; emoji fallback when mark missing.
   * @param {string} gameId
   * @param {{ size?: number, color?: string, fallback?: string, className?: string }} [opts]
   * @returns {string} HTML
   */
  function gameMarkHtml(gameId, opts) {
    const o = opts || {};
    const size = Math.max(16, Number(o.size) || 40);
    const ident = getGameIdentity(gameId);
    const emoji = (ident && ident.icon) || o.fallback || '🎮';
    const label = (ident && ident.label) || String(gameId || 'Game');
    const color = o.color || (ident && ident.primary) || 'currentColor';
    const extra = o.className ? ' ' + String(o.className) : '';
    if (ident && ident.mark) {
      return (
        '<span class="dangal-game-mark-wrap' +
        extra +
        '" style="color:' +
        escAttr(color) +
        ';width:' +
        size +
        'px;height:' +
        size +
        'px" role="img" aria-label="' +
        escAttr(label) +
        '"><svg class="dangal-game-mark" viewBox="0 0 40 40" width="' +
        size +
        '" height="' +
        size +
        '" aria-hidden="true" focusable="false">' +
        ident.mark +
        '</svg></span>'
      );
    }
    return (
      '<span class="dangal-game-mark-wrap dangal-game-mark-wrap--emoji' +
      extra +
      '" style="font-size:' +
      Math.round(size * 0.72) +
      'px;width:' +
      size +
      'px;height:' +
      size +
      'px;line-height:1" role="img" aria-label="' +
      escAttr(label) +
      '">' +
      emoji +
      '</span>'
    );
  }

  function applyGameIdentity(gameKey, overlayEl) {
    const id = getGameIdentity(gameKey);
    if (!id || !overlayEl?.style) return;
    overlayEl.style.setProperty('--game-primary', id.primary);
    overlayEl.style.setProperty('--game-secondary', id.secondary);
    overlayEl.style.setProperty('--game-surface', id.surface);
    overlayEl.style.setProperty('--game-accent', id.primary);
  }

  function isRatedGame(id) {
    const key = typeof canonicalGameId === 'function' ? canonicalGameId(id) : String(id || '');
    return RATED_GAMES.indexOf(key) !== -1;
  }

  /** Push identity primaries/labels into legacy GAME_ACCENTS / GAME_LABELS maps. */
  function syncIdentityIntoAccentMaps() {
    try {
      if (typeof window.GAME_ACCENTS === 'object' && window.GAME_ACCENTS) {
        Object.keys(GAME_IDENTITY).forEach((id) => {
          window.GAME_ACCENTS[id] = GAME_IDENTITY[id].primary;
        });
        window.GAME_ACCENTS.muqabala = GAME_IDENTITY.quiz.primary;
        window.GAME_ACCENTS.tictactoe = GAME_IDENTITY.ttt.primary;
        window.GAME_ACCENTS.kakuro = GAME_IDENTITY.ankjod.primary;
      }
      if (typeof window.GAME_LABELS === 'object' && window.GAME_LABELS) {
        Object.keys(GAME_IDENTITY).forEach((id) => {
          window.GAME_LABELS[id] = GAME_IDENTITY[id].label;
        });
        window.GAME_LABELS.muqabala = GAME_IDENTITY.quiz.label;
        window.GAME_LABELS.tictactoe = GAME_IDENTITY.ttt.label;
        window.GAME_LABELS.kakuro = GAME_IDENTITY.ankjod.label;
        window.GAME_LABELS.uno = 'Oh, No!';
      }
    } catch (e) {}
  }

  window.GAME_IDENTITY = GAME_IDENTITY;
  window.DANGAL_RATED_GAMES = RATED_GAMES;
  window.getGameIdentity = getGameIdentity;
  window.gameMarkHtml = gameMarkHtml;
  window.federationHonestyLine = federationHonestyLine;
  window.federationHonestyHtml = federationHonestyHtml;
  window.applyGameIdentity = applyGameIdentity;
  window.isRatedGame = isRatedGame;
  window.syncIdentityIntoAccentMaps = syncIdentityIntoAccentMaps;

  if (typeof GAME_ID_ALIASES === 'object' && GAME_ID_ALIASES) {
    Object.keys(GAME_ID_ALIASES).forEach((alias) => {
      const canon = GAME_ID_ALIASES[alias];
      if (GAME_IDENTITY[canon] && !GAME_IDENTITY[alias]) GAME_IDENTITY[alias] = GAME_IDENTITY[canon];
    });
  }

  syncIdentityIntoAccentMaps();
})();
