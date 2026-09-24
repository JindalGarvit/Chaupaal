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
    fiveinrow:
      '<circle cx="6" cy="20" r="3.2" fill="currentColor"/><circle cx="14" cy="20" r="3.2" fill="currentColor"/><circle cx="22" cy="20" r="3.2" fill="currentColor"/><circle cx="30" cy="20" r="3.2" fill="currentColor"/><circle cx="34" cy="20" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/>',
    business:
      '<path fill="currentColor" d="M6 32V18h6v14H6zm9 0V10h7v22h-7zm10 0V14h9v18h-9z"/><path fill="none" stroke="currentColor" stroke-width="1.6" d="M8 21h2M8 25h2M17 14h3M17 18h3M17 22h3M28 18h4M28 22h4"/>',
    tambola:
      '<rect x="6" y="10" width="28" height="20" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="1.4" d="M6 17h28M6 24h28M15 10v20M25 10v20"/><circle cx="10.5" cy="13.5" r="1.4" fill="currentColor"/><circle cx="20" cy="20.5" r="1.4" fill="currentColor"/><circle cx="29.5" cy="27" r="1.4" fill="currentColor"/>',
    carrom:
      '<circle cx="20" cy="20" r="14" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="20" cy="20" r="4" fill="currentColor"/><circle cx="11" cy="14" r="2.2" fill="currentColor" opacity=".55"/><circle cx="29" cy="14" r="2.2" fill="currentColor" opacity=".55"/><circle cx="11" cy="26" r="2.2" fill="currentColor" opacity=".55"/><circle cx="29" cy="26" r="2.2" fill="currentColor" opacity=".55"/>',
    streetcricket:
      '<path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M12 8c0 10 2 14 4 18M16 26c2 4 4 6 6 6"/><path fill="currentColor" d="M10 6h6v4h-6z"/><circle cx="28" cy="14" r="4.5" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="1.4" d="M26 12l4 4M30 12l-4 4"/>',
    gullykick:
      '<circle cx="20" cy="20" r="12" fill="none" stroke="currentColor" stroke-width="2.2"/><path fill="none" stroke="currentColor" stroke-width="1.6" d="M20 8v24M8 20h24M12 12c4 3 12 3 16 0M12 28c4-3 12-3 16 0"/><path fill="currentColor" d="M17 17h6l1.5 3-1.5 3h-6l-1.5-3z"/>',
    badminton:
      '<path fill="currentColor" d="M20 6l2.5 8H28l-5 4 2 8-5.5-4-5.5 4 2-8-5-4h5.5L20 6z" opacity=".9"/><ellipse cx="20" cy="30" rx="5" ry="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path fill="none" stroke="currentColor" stroke-width="1.6" d="M20 27v-4"/>',
    tabletennis:
      '<path fill="currentColor" d="M8 10c0-2 2-4 5-4h6c4 0 7 3 7 7v2c0 5-4 9-9 9H11c-2 0-3-1-3-3V10z"/><circle cx="16" cy="16" r="4.5" fill="none" stroke="#fff" stroke-width="1.6" opacity=".85"/><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M24 24l8 10"/><circle cx="30" cy="12" r="3.2" fill="currentColor" opacity=".7"/>',
    pickleball:
      '<rect x="7" y="6" width="14" height="20" rx="7" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="11" cy="12" r="1.3" fill="currentColor"/><circle cx="17" cy="12" r="1.3" fill="currentColor"/><circle cx="11" cy="17" r="1.3" fill="currentColor"/><circle cx="17" cy="17" r="1.3" fill="currentColor"/><circle cx="14" cy="21.5" r="1.3" fill="currentColor"/><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M18 24l10 12"/><circle cx="30" cy="14" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="30" cy="14" r="1.2" fill="currentColor"/>',
    kabaddi:
      '<circle cx="20" cy="20" r="13" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="20" cy="14" r="3.5" fill="currentColor"/><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M14 28c2-6 10-6 12 0M11 18c3 2 6 2 9 0M20 18c3 2 6 2 9 0"/>',
    khokho:
      '<path fill="none" stroke="currentColor" stroke-width="2" d="M8 8v24M32 8v24M8 20h24"/><circle cx="14" cy="14" r="2.5" fill="currentColor"/><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M14 17v6l-3 5M14 23l3 5"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M22 22c4-1 8 2 10 6"/>',
    bowling:
      '<path fill="currentColor" d="M18 6c3 0 5 3 5 7 0 8-2 14-5 19-3-5-5-11-5-19 0-4 2-7 5-7z"/><circle cx="18" cy="11" r="1.2" fill="#fff" opacity=".9"/><circle cx="16.5" cy="14" r="1.2" fill="#fff" opacity=".9"/><circle cx="19.5" cy="14" r="1.2" fill="#fff" opacity=".9"/><circle cx="28" cy="26" r="6" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="26" cy="24" r="1.3" fill="currentColor"/><circle cx="29.5" cy="23.5" r="1.3" fill="currentColor"/><circle cx="30" cy="26.5" r="1.3" fill="currentColor"/>',
    tennis:
      '<circle cx="14" cy="14" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="1.5" d="M8 10c4 2 8 2 12 0M8 18c4-2 8-2 12 0"/><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M20 20l10 12"/><circle cx="30" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path fill="none" stroke="currentColor" stroke-width="1.2" d="M27 10c2 1.5 4 1.5 6 0"/>',
    rummy:
      '<rect x="6" y="12" width="12" height="18" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="14" y="9" width="12" height="18" rx="1.5" fill="currentColor" opacity=".18" stroke="currentColor" stroke-width="1.8"/><rect x="22" y="11" width="12" height="18" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path fill="currentColor" d="M18 15h4v2h-4zm0 4h4v2h-4z"/>',
    teenpatti:
      '<rect x="5" y="11" width="11" height="16" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8" transform="rotate(-8 10.5 19)"/><rect x="14.5" y="9" width="11" height="16" rx="1.5" fill="currentColor" opacity=".2" stroke="currentColor" stroke-width="1.8"/><rect x="24" y="11" width="11" height="16" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8" transform="rotate(8 29.5 19)"/><path fill="currentColor" d="M20 16c0 0-2.5 2.2-2.5 4S19 23 20 24.5C21 23 22.5 21.5 22.5 20S20 16 20 16z"/>',
    bluff:
      '<path fill="none" stroke="currentColor" stroke-width="2" d="M8 18c2-8 22-8 24 0v4c-2 8-22 8-24 0v-4z"/><ellipse cx="14" cy="19" rx="2.5" ry="3" fill="currentColor"/><ellipse cx="26" cy="19" rx="2.5" ry="3" fill="currentColor"/><path fill="none" stroke="currentColor" stroke-width="1.6" d="M17 25c1.5 1.5 4.5 1.5 6 0"/>',
    sattepe:
      '<text x="20" y="28" text-anchor="middle" font-size="22" font-weight="800" font-family="system-ui,sans-serif" fill="currentColor">7</text><path fill="none" stroke="currentColor" stroke-width="1.6" d="M8 8h24v24H8z" opacity=".45"/>',
    andarbaahar:
      '<rect x="5" y="10" width="13" height="20" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="22" y="10" width="13" height="20" rx="2" fill="currentColor" opacity=".2" stroke="currentColor" stroke-width="2"/><text x="11.5" y="24" text-anchor="middle" font-size="10" font-weight="700" fill="currentColor">A</text><text x="28.5" y="24" text-anchor="middle" font-size="10" font-weight="700" fill="currentColor">B</text>',
    scribble:
      '<path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M8 28c4-10 6-4 10-12s6 2 10-6"/><path fill="currentColor" d="M28 6l6 6-14 14H14V20z"/><path fill="none" stroke="currentColor" stroke-width="1.4" d="M8 34h24"/>',
    quiz:
      '<circle cx="20" cy="18" r="12" fill="none" stroke="currentColor" stroke-width="2.2"/><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M15 15c1-3 9-3 10 1 0 3-4 3-4 6"/><circle cx="20" cy="27" r="1.8" fill="currentColor"/>',
    rushrunner:
      '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M6 14h8M4 20h10M6 26h8"/><circle cx="24" cy="12" r="3" fill="currentColor"/><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M24 16v8l-4 8M24 24l5 8M20 20h8"/>',
    patangbaazi:
      '<path fill="currentColor" d="M20 6l10 14-10 6-10-6z"/><path fill="none" stroke="currentColor" stroke-width="1.6" d="M20 26v10M16 32h8"/><path fill="none" stroke="currentColor" stroke-width="1.4" d="M10 20h20"/>',
    pool:
      '<circle cx="20" cy="20" r="13" fill="currentColor"/><circle cx="20" cy="20" r="7" fill="#fff"/><text x="20" y="24" text-anchor="middle" font-size="11" font-weight="800" fill="currentColor">8</text>',
    ankjod:
      '<rect x="6" y="6" width="28" height="28" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="1.4" d="M6 15.5h28M6 25h28M15.5 6v28M25 6v28"/><text x="11" y="13" text-anchor="middle" font-size="7" font-weight="700" fill="currentColor">3</text><text x="20" y="22.5" text-anchor="middle" font-size="7" font-weight="700" fill="currentColor">7</text><text x="29.5" y="32" text-anchor="middle" font-size="7" font-weight="700" fill="currentColor">1</text>',
    tiptap:
      '<circle cx="14" cy="16" r="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="26" cy="16" r="5" fill="currentColor" opacity=".25" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M20 22v10M16 28h8"/><path fill="currentColor" d="M20 6l1.2 2.8H24l-2.4 1.8.9 2.9L20 12l-2.5 1.5.9-2.9L16 8.8h2.8z"/>',
    brickbreaker:
      '<rect x="5" y="6" width="9" height="5" rx="1" fill="currentColor"/><rect x="15.5" y="6" width="9" height="5" rx="1" fill="currentColor" opacity=".55"/><rect x="26" y="6" width="9" height="5" rx="1" fill="currentColor"/><rect x="5" y="13" width="9" height="5" rx="1" fill="currentColor" opacity=".55"/><rect x="15.5" y="13" width="9" height="5" rx="1" fill="currentColor"/><rect x="26" y="13" width="9" height="5" rx="1" fill="currentColor" opacity=".55"/><circle cx="20" cy="24" r="2.5" fill="currentColor"/><rect x="12" y="32" width="16" height="3.5" rx="1.5" fill="currentColor"/>',
  };

  const GAME_IDENTITY = {
    chess: { primary: '#8B5E3C', secondary: '#F0D9B5', surface: '#3D2B1A', label: 'Chess', icon: '♟', mark: M.chess, orientation: 'portrait' },
    snakes: { primary: '#2E7D32', secondary: '#F9E784', surface: '#1A3A2A', label: 'Snakes & Ladders', icon: '🐍', mark: M.snakes, orientation: 'portrait' },
    ludo: { primary: '#E040FB', secondary: '#FFD740', surface: '#1A1A2E', label: 'Ludo', icon: '🎯', mark: M.ludo, orientation: 'portrait' },
    ttt: { primary: '#1565C0', secondary: '#E3F2FD', surface: '#0D1B2A', label: 'Tic-Tac-Toe', icon: '⭕', mark: M.ttt, orientation: 'portrait' },
    uno: { primary: '#D32F2F', secondary: '#FF8F00', surface: '#1A0A0A', label: 'Oh, No! Cards', icon: '🃏', mark: M.uno, orientation: 'portrait' },
    wordguess: { primary: '#00796B', secondary: '#B2EBF2', surface: '#0A1A18', label: 'Shabd Five', icon: '📝', mark: M.wordguess, orientation: 'portrait' },
    fiveinrow: { primary: '#212121', secondary: '#F5F5DC', surface: '#0A0A0A', label: 'Five in a Row', icon: '🔵', mark: M.fiveinrow, orientation: 'portrait' },
    business: { primary: '#F9A825', secondary: '#1B5E20', surface: '#1A1500', label: 'Business', icon: '🏙️', mark: M.business, orientation: 'portrait' },
    tambola: { primary: '#E91E8C', secondary: '#FFD600', surface: '#1A0010', label: 'Tambola', icon: '🎫', mark: M.tambola, orientation: 'portrait' },
    carrom: { primary: '#8D6E63', secondary: '#FFF8E1', surface: '#1A0F00', label: 'Carrom', icon: '🪙', mark: M.carrom, orientation: 'portrait' },
    streetcricket: { primary: '#2E7D32', secondary: '#FFCC02', surface: '#0A1A0A', label: 'Street Cricket', icon: '🏏', mark: M.streetcricket, orientation: 'landscape' },
    gullykick: { primary: '#1B5E20', secondary: '#FFFFFF', surface: '#0A120A', label: 'Gully Kick', icon: '⚽', mark: M.gullykick, orientation: 'landscape' },
    badminton: { primary: '#01579B', secondary: '#E1F5FE', surface: '#000D1A', label: 'Badminton', icon: '🏸', mark: M.badminton, orientation: 'landscape' },
    tabletennis: { primary: '#0D47A1', secondary: '#FF6F00', surface: '#000A1A', label: 'Table Tennis', icon: '🏓', mark: M.tabletennis, orientation: 'landscape' },
    pickleball: { primary: '#33691E', secondary: '#FFEA00', surface: '#0A1200', label: 'Pickleball', icon: '🟡', mark: M.pickleball, orientation: 'landscape' },
    kabaddi: { primary: '#BF360C', secondary: '#FFB300', surface: '#1A0800', label: 'Kabaddi', icon: '🤼', mark: M.kabaddi, orientation: 'landscape' },
    khokho: { primary: '#00695C', secondary: '#FFE082', surface: '#021A16', label: 'Kho Kho', icon: '🏃', mark: M.khokho, orientation: 'portrait' },
    bowling: { primary: '#FF8F00', secondary: '#FFE082', surface: '#120A02', label: 'Bowling', icon: '🎳', mark: M.bowling, orientation: 'portrait' },
    tennis: { primary: '#2E7D32', secondary: '#FFFFFF', surface: '#0A1A0A', label: 'Tennis', icon: '🎾', mark: M.tennis, orientation: 'landscape' },
    rummy: { primary: '#6A1B9A', secondary: '#FFD54F', surface: '#100018', label: 'Rummy', icon: '🃏', mark: M.rummy, orientation: 'portrait' },
    teenpatti: { primary: '#4A148C', secondary: '#FFD700', surface: '#0D0018', label: 'Teen Patti', icon: '♠', mark: M.teenpatti, orientation: 'portrait' },
    bluff: { primary: '#37474F', secondary: '#FF1744', surface: '#0A0E10', label: 'Bluff', icon: '🎭', mark: M.bluff, orientation: 'portrait' },
    sattepe: { primary: '#1565C0', secondary: '#FFD600', surface: '#000A1A', label: 'Satte pe Satta', icon: '7️⃣', mark: M.sattepe, orientation: 'portrait' },
    andarbaahar: { primary: '#1B5E20', secondary: '#FF6B35', surface: '#001A00', label: 'Andar Bahar', icon: '🎴', mark: M.andarbaahar, orientation: 'portrait' },
    scribble: { primary: '#E91E63', secondary: '#FFFFFF', surface: '#1A1A1A', label: 'Scribble', icon: '🎨', mark: M.scribble, orientation: 'portrait' },
    quiz: { primary: '#6200EA', secondary: '#FFD600', surface: '#0D0020', label: 'Quiz Muqabala', icon: '🧠', mark: M.quiz, orientation: 'portrait' },
    rushrunner: { primary: '#FF6D00', secondary: '#FFD600', surface: '#1A0A00', label: 'Rush Runner', icon: '💨', mark: M.rushrunner, orientation: 'landscape' },
    patangbaazi: { primary: '#FF6D00', secondary: '#1565C0', surface: '#000D1A', label: 'Patang Baazi', icon: '🪁', mark: M.patangbaazi, orientation: 'landscape' },
    pool: { primary: '#1B3A2D', secondary: '#F5F5DC', surface: '#0A1A10', label: 'Pool', icon: '🎱', mark: M.pool, orientation: 'landscape' },
    ankjod: { primary: '#1A237E', secondary: '#FFD600', surface: '#0A0014', label: 'Ank Jod', icon: '🔢', mark: M.ankjod, orientation: 'portrait' },
    tiptap: { primary: '#FF6D00', secondary: '#FFD600', surface: '#1A0800', label: 'Tip Tap', icon: '✨', mark: M.tiptap, orientation: 'portrait' },
    brickbreaker: { primary: '#5C6BC0', secondary: '#B39DFF', surface: '#0D0A18', label: 'Brick Breaker', icon: '🧱', mark: M.brickbreaker, orientation: 'landscape' },
  };

  const RATED_GAMES = ['chess', 'fiveinrow', 'ttt', 'streetcricket', 'gullykick', 'quiz'];

  function escAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function getGameIdentity(id) {
    const key = typeof canonicalGameId === 'function' ? canonicalGameId(id) : String(id || '');
    return GAME_IDENTITY[key] || null;
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
