/**
 * Shared game UI — tokens helpers, turn chrome, feedback, skeleton, micro-motion.
 * Load after game-runtime.js; before game files that call these APIs.
 */
(function () {
  'use strict';

  /** Map common game actions → existing SoundLib + haptic cues (no new one-off sounds). */
  const ACTION_MAP = {
    select: { sound: 'tap', haptic: 'light' },
    move: { sound: 'tap', haptic: 'light' },
    place: { sound: 'send', haptic: 'medium' },
    card: { sound: 'send', haptic: 'medium' },
    valid: { sound: 'tap', haptic: 'light' },
    invalid: { sound: 'error', haptic: 'error' },
    turn: { sound: 'notification', haptic: 'light' },
    win: { sound: 'cheer', haptic: 'success', confetti: true },
    lose: { sound: 'wrongTone', haptic: 'error' },
    draw: { sound: 'sectionComplete', haptic: 'medium' },
    complete: { sound: 'sectionComplete', haptic: 'success', confetti: true },
  };

  function gameFeedback(action, opts) {
    const o = opts || {};
    const key = String(action || 'select').toLowerCase();
    const spec = ACTION_MAP[key] || ACTION_MAP.select;
    try {
      if (typeof SoundLib !== 'undefined' && SoundLib.play) {
        SoundLib.play(spec.sound);
      }
    } catch (e) {}
    try {
      if (typeof haptic === 'function' && spec.haptic) haptic(spec.haptic);
    } catch (e) {}
    if (spec.confetti && typeof launchConfetti === 'function' && !o.noConfetti) {
      try {
        launchConfetti(o.origin || { x: 50, y: 40 }, o.confettiCount || 36);
      } catch (e) {}
    }
  }

  /**
   * @param {{ mode?: 'yours'|'theirs'|'waiting'|'over', label?: string, sub?: string, pulse?: boolean }} state
   */
  function gameTurnBannerHtml(state) {
    const s = state || {};
    const mode = s.mode || 'waiting';
    const label = s.label || (mode === 'yours' ? 'Your turn' : mode === 'theirs' ? 'Opponent thinking…' : mode === 'over' ? 'Game over' : 'Waiting…');
    const sub = s.sub ? `<span class="game-turn-sub">${s.sub}</span>` : '';
    const pulse = s.pulse || mode === 'yours' ? ' game-turn--pulse' : '';
    return `<div class="game-turn game-turn--${mode}${pulse}" role="status" aria-live="polite"><span class="game-turn-dot" aria-hidden="true"></span><span class="game-turn-label">${label}</span>${sub}</div>`;
  }

  const GAME_ACCENTS = {
    muqabala: '#E63946',
    quiz: '#E63946',
    chess: '#C9A227',
    snakes: '#33C481',
    ludo: '#4C75D9',
    uno: '#E05252',
    tictactoe: '#8134AF',
    wordguess: '#D97745',
    fiveinrow: '#3D86C6',
    business: '#B98932',
    scribble: '#8B5CF6',
    rushrunner: '#E8663D',
    tiptap: '#2F9C95',
    ankjod: '#9A6BCE',
  };

  function safe(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
  }

  /** Shared Muqabala-derived header used by every Dangal game. */
  function gameChromeHtml(opts) {
    const o = opts || {};
    const backId = safe(o.backId || 'gameBack');
    const title = safe(o.title || 'Game');
    const subtitle = o.subtitle ? `<span class="game-chrome-subtitle">${safe(o.subtitle)}</span>` : '';
    const right = o.rightHtml || '<span class="game-chrome-spacer" aria-hidden="true"></span>';
    return `<div class="game-chrome">
      <button type="button" id="${backId}" class="game-back-btn game-tap-target" aria-label="Back">←</button>
      <div class="game-chrome-heading"><div class="game-chrome-title">${title}</div>${subtitle}</div>
      <div class="game-chrome-right">${right}</div>
    </div>`;
  }

  function gameScoreHtml(left, right) {
    const a = left || {};
    const b = right || {};
    return `<div class="game-scoreboard">
      <div class="game-score-side"><span>${safe(a.label || 'You')}</span><strong>${safe(a.score ?? 0)}</strong></div>
      <div class="game-score-divider">–</div>
      <div class="game-score-side game-score-side--right"><span>${safe(b.label || 'Opponent')}</span><strong>${safe(b.score ?? 0)}</strong></div>
    </div>`;
  }

  function setGameTurnBanner(el, state) {
    if (!el) return;
    const wrap = el.classList && el.classList.contains('game-turn') ? el : el.querySelector && el.querySelector('.game-turn');
    const target = wrap || el;
    const tmp = document.createElement('div');
    tmp.innerHTML = gameTurnBannerHtml(state);
    const next = tmp.firstElementChild;
    if (!next) return;
    if (target.classList && target.classList.contains('game-turn')) {
      target.className = next.className;
      target.innerHTML = next.innerHTML;
      target.setAttribute('role', 'status');
      target.setAttribute('aria-live', 'polite');
    } else {
      target.innerHTML = next.outerHTML;
    }
  }

  function gameSkeletonHtml(opts) {
    const o = opts || {};
    const title = o.title || 'Loading…';
    const dark = o.theme === 'dark';
    return `
      <div class="game-overlay ${dark ? 'game-overlay--dark' : 'game-overlay--light'} game-overlay--entering" data-game-shell="1">
        <div class="game-chrome">
          <button type="button" class="game-back-btn" data-overlay-dismiss style="visibility:hidden" aria-hidden="true">←</button>
          <div class="game-chrome-title">${title}</div>
          <div style="width:36px"></div>
        </div>
        <div class="game-skeleton-body">
          <div class="skeleton game-skel-bar"></div>
          <div class="skeleton game-skel-board"></div>
          <div class="skeleton game-skel-bar game-skel-bar--short"></div>
        </div>
      </div>`;
  }

  /** Apply shared shell classes + entry motion to a game overlay element. */
  function prepareGameOverlay(overlay, opts) {
    const o = opts || {};
    if (!overlay) return overlay;
    overlay.classList.add('game-overlay');
    if (o.theme === 'dark') overlay.classList.add('game-overlay--dark');
    else if (o.theme === 'light') overlay.classList.add('game-overlay--light');
    overlay.classList.add('game-overlay--entering');
    const gameId = String(o.gameId || overlay.dataset?.gameId || '').toLowerCase();
    if (gameId) {
      overlay.dataset.gameId = gameId;
      overlay.style.setProperty('--game-accent', o.accent || GAME_ACCENTS[gameId] || '#E63946');
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.classList.remove('game-overlay--entering');
        overlay.classList.add('game-overlay--ready');
      });
    });
    return overlay;
  }

  /** Exit motion then callback (default removes node via caller). */
  function animateGameExit(overlay, done) {
    if (!overlay || !overlay.isConnected) {
      if (typeof done === 'function') done();
      return;
    }
    overlay.classList.remove('game-overlay--ready');
    overlay.classList.add('game-overlay--exiting');
    const ms =
      (typeof getComputedStyle === 'function' &&
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--game-exit-ms'))) ||
      220;
    setTimeout(() => {
      if (typeof done === 'function') done();
    }, Math.max(160, ms || 220));
  }

  /** Light press feedback on a cell/button. */
  function pulseGameEl(el) {
    if (!el || !el.classList) return;
    el.classList.remove('game-pulse');
    // force reflow
    void el.offsetWidth;
    el.classList.add('game-pulse');
  }

  /** Ensure min tap target for interactive game controls. */
  function ensureGameTapTarget(el) {
    if (!el || !el.style) return;
    el.classList.add('game-tap-target');
  }

  window.GameFeedback = gameFeedback;
  window.gameFeedback = gameFeedback;
  window.gameTurnBannerHtml = gameTurnBannerHtml;
  window.gameChromeHtml = gameChromeHtml;
  window.gameScoreHtml = gameScoreHtml;
  window.setGameTurnBanner = setGameTurnBanner;
  window.gameSkeletonHtml = gameSkeletonHtml;
  window.prepareGameOverlay = prepareGameOverlay;
  window.animateGameExit = animateGameExit;
  window.pulseGameEl = pulseGameEl;
  window.ensureGameTapTarget = ensureGameTapTarget;
})();
