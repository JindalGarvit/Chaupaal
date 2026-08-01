/**
 * Shared game UI — tokens, chrome, results, share, friend picker, PB, coach.
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

  const GAME_ACCENTS = {
    muqabala: '#E63946',
    quiz: '#E63946',
    akhbaar: '#E63946',
    chess: '#C9A227',
    snakes: '#33C481',
    ludo: '#4C75D9',
    uno: '#E05252',
    tictactoe: '#8134AF',
    ttt: '#8134AF',
    wordguess: '#D97745',
    fiveinrow: '#3D86C6',
    business: '#B98932',
    scribble: '#8B5CF6',
    rushrunner: '#E8663D',
    tiptap: '#2F9C95',
    ankjod: '#9A6BCE',
    kakuro: '#9A6BCE',
    wrap: '#8134AF',
    duniya: '#E63946',
    peepal: '#2A9D8F',
    profile: '#C9A227',
  };

  const GAME_LABELS = {
    quiz: 'Muqabala',
    muqabala: 'Muqabala',
    akhbaar: 'Akhbaar',
    chess: 'Chess',
    snakes: 'Snakes & Ladders',
    ludo: 'Ludo',
    uno: 'Oh, No!',
    ttt: 'Tic-Tac-Toe',
    wordguess: 'Shabd Five',
    fiveinrow: 'Five in a Row',
    business: 'Business',
    scribble: 'Scribble',
    rushrunner: 'Rush Runner',
    tiptap: 'Tip Tap',
    ankjod: 'Ank Jod',
    kakuro: 'Ank Jod',
    wrap: 'Monthly Wrap',
    duniya: 'Duniya',
    peepal: 'Peepal',
    profile: 'Profile',
  };

  function trackShareEvent(name, params) {
    try {
      if (typeof trackEvent === 'function') trackEvent(name, params || {});
    } catch (e) {}
  }

  const COACH_TIPS = {
    quiz: ['Answer before the timer runs out', 'Combos build when you stay correct', 'Friend challenges skip the daily limit'],
    chess: ['Tap a piece, then a highlighted square', 'Use Flip to see the board your way', 'Harder AI thinks a little longer'],
    snakes: ['Roll when it is your turn', 'Ladders climb up · snakes slide down', 'Reach the last square to win'],
    ludo: ['Roll six to enter a piece', 'Tap a glowing piece to move', 'Capture rivals by landing on them'],
    uno: ['Match color or number', 'Tap Oh No! when you have one card', 'Wilds let you pick the next color'],
    ttt: ['Get three in a row', 'Block your opponent early', 'Center is often strongest'],
    wordguess: ['Guess a valid 5-letter word', 'Green = right spot · amber = elsewhere', 'Daily word resets at midnight'],
    fiveinrow: ['Connect five in a line', 'Watch diagonals as well as rows', 'Block threats before extending yours'],
    business: ['Buy when you land on empty lots', 'Pay rent on owned properties', 'Richest player at the end wins'],
    scribble: ['Draw clearly — keep it simple', 'Guessers type in the chat box', 'Rounds rotate who draws'],
    rushrunner: ['Tap or swipe up to jump', 'Collect coins · avoid obstacles', 'Distance is your score'],
    tiptap: ['Swap adjacent gems to match 3+', 'Special gems clear more of the board', 'Beat the target before moves run out'],
    ankjod: ['Each row & column sums to the clue', 'Pencil notes help narrow digits', 'Check when you think you are done'],
  };

  const PB_KEYS = {
    rushrunner: { key: 'chaupaal_pb_rushrunner', label: 'm', higherBetter: true },
    tiptap: { key: 'chaupaal_pb_tiptap', label: 'pts', higherBetter: true },
    wordguess: { key: 'chaupaal_pb_wordguess', label: 'guesses', higherBetter: false },
    ankjod: { key: 'chaupaal_pb_ankjod', label: 's', higherBetter: false },
    quiz: { key: 'chaupaal_pb_quiz', label: '/10', higherBetter: true },
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

  function safe(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
  }

  function gameBrandMarkHtml(compact) {
    return `<span class="game-brand-mark${compact ? ' game-brand-mark--compact' : ''}" aria-hidden="true"><span class="game-brand-chair">🪑</span><span class="game-brand-word">Chaupaal</span></span>`;
  }

  /** Shared Muqabala-derived header used by every Dangal game. */
  function gameChromeHtml(opts) {
    const o = opts || {};
    const backId = safe(o.backId || 'gameBack');
    const title = safe(o.title || 'Game');
    const subtitle = o.subtitle ? `<span class="game-chrome-subtitle">${safe(o.subtitle)}</span>` : '';
    const brand = o.hideBrand ? '' : `<div class="game-chrome-brand">${gameBrandMarkHtml(true)}</div>`;
    const right = o.rightHtml || '<span class="game-chrome-spacer" aria-hidden="true"></span>';
    return `<div class="game-chrome">
      <button type="button" id="${backId}" class="game-back-btn game-tap-target" aria-label="Back">←</button>
      <div class="game-chrome-heading">${brand}<div class="game-chrome-title">${title}</div>${subtitle}</div>
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

  /** Standard result CTAs: Play again · Share · Challenge friend (+ optional extras). */
  function defaultResultActions(opts) {
    const o = opts || {};
    if (Array.isArray(o.actions) && o.actions.length) return o.actions;
    const list = [{ label: o.againLabel || 'Play again', primary: true, id: 'again' }];
    if (o.share !== false) list.push({ label: o.shareLabel || 'Share', primary: false, id: 'share' });
    if (o.challenge !== false) list.push({ label: o.challengeLabel || 'Challenge friend', primary: false, id: 'challenge' });
    if (o.story) list.push({ label: 'Post to story', primary: false, id: 'story' });
    (o.extraActions || []).forEach((a) => list.push(a));
    return list;
  }

  /** Calm shared results shell — Muqabala-derived, emoji optional and small. */
  function gameResultHtml(opts) {
    const o = opts || {};
    const title = safe(o.title || 'Game over');
    const pbLine = o.pbHtml || (o.vsBest ? `<p class="game-result-pb">${safe(o.vsBest)}</p>` : '');
    const subtitle = o.subtitle ? `<p class="game-result-sub">${safe(o.subtitle)}</p>` : '';
    const glyph = o.glyph ? `<div class="game-result-glyph" aria-hidden="true">${safe(o.glyph)}</div>` : '';
    const brand = o.hideBrand ? '' : `<div class="game-result-brand">${gameBrandMarkHtml(true)}</div>`;
    const shareCard = o.shareCardHtml || '';
    const score =
      o.scoreHtml ||
      (o.you != null || o.opp != null
        ? gameScoreHtml({ label: o.youLabel || 'You', score: o.you ?? 0 }, { label: o.oppLabel || 'Opponent', score: o.opp ?? 0 })
        : '');
    const statsStrip =
      o.statsHtml ||
      (o.hideStats ? '' : o.gameId ? gamePersonalStatsHtml(o.gameId) : '');
    const missionHint = o.missionHtml || (o.hideMissions ? '' : o.gameId ? dangalMissionNudgeHtml(o.gameId) : '');
    const actions = defaultResultActions(o)
      .map(
        (a, i) =>
          `<button type="button" class="game-result-btn ${a.primary ? 'game-result-btn--primary' : ''}" data-result-action="${i}"${a.id ? ` data-result-id="${safe(a.id)}"` : ''}>${safe(a.label)}</button>`
      )
      .join('');
    return `<div class="game-result" role="status">
      ${brand}
      ${shareCard}
      ${glyph}
      <h2 class="game-result-title">${title}</h2>
      ${subtitle}
      ${pbLine}
      ${score}
      ${statsStrip}
      ${missionHint}
      <div class="game-result-actions">${actions}</div>
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
  function unlockGameOrientation() {
    try {
      if (screen.orientation && typeof screen.orientation.unlock === 'function') {
        screen.orientation.unlock();
      }
    } catch (e) {}
  }

  function lockPortraitOrientation() {
    try {
      if (screen.orientation && typeof screen.orientation.lock === 'function') {
        const p = screen.orientation.lock('portrait');
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch (e) {}
  }

  function prepareGameOverlay(overlay, opts) {
    const o = opts || {};
    if (!overlay) return overlay;
    overlay.classList.add('game-overlay');
    overlay.classList.add('game-landscape-ok');
    if (o.theme === 'dark') overlay.classList.add('game-overlay--dark');
    else if (o.theme === 'light') overlay.classList.add('game-overlay--light');
    overlay.classList.add('game-overlay--entering');
    const gameId = String(o.gameId || overlay.dataset?.gameId || '').toLowerCase();
    if (gameId) {
      overlay.dataset.gameId = gameId;
      overlay.style.setProperty('--game-accent', o.accent || GAME_ACCENTS[gameId] || '#E63946');
    }
    unlockGameOrientation();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        overlay.classList.remove('game-overlay--entering');
        overlay.classList.add('game-overlay--ready');
        if (gameId && o.coach !== false) maybeShowGameCoach(overlay, gameId);
      });
    });
    return overlay;
  }

  /** Exit motion then callback (default removes node via caller). */
  function animateGameExit(overlay, done) {
    if (!overlay || !overlay.isConnected) {
      lockPortraitOrientation();
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
      lockPortraitOrientation();
      if (typeof done === 'function') done();
    }, Math.max(160, ms || 220));
  }

  /** Light press feedback on a cell/button. */
  function pulseGameEl(el) {
    if (!el || !el.classList) return;
    el.classList.remove('game-pulse');
    void el.offsetWidth;
    el.classList.add('game-pulse');
  }

  /** Ensure min tap target for interactive game controls. */
  function ensureGameTapTarget(el) {
    if (!el || !el.style) return;
    el.classList.add('game-tap-target');
  }

  /**
   * Size a canvas to its CSS box with devicePixelRatio so draws stay sharp on phones.
   * @param {HTMLCanvasElement} canvas
   * @param {{ maxDpr?: number }} [opts]
   * @returns {{ w: number, h: number, dpr: number }}
   */
  function setupGameCanvas(canvas, opts) {
    const o = opts || {};
    if (!canvas) return { w: 0, h: 0, dpr: 1 };
    const dpr = Math.min(o.maxDpr || 2.5, Math.max(1, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.floor(rect.width || canvas.clientWidth || canvas.offsetWidth || 1));
    const cssH = Math.max(1, Math.floor(rect.height || canvas.clientHeight || canvas.offsetHeight || 1));
    const bw = Math.round(cssW * dpr);
    const bh = Math.round(cssH * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    const ctx = canvas.getContext('2d');
    if (ctx && typeof ctx.setTransform === 'function') {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    return { w: cssW, h: cssH, dpr };
  }

  /* ── Invalid-move juice ── */
  function shakeInvalidMove(el, opts) {
    const o = opts || {};
    gameFeedback('invalid');
    if (!el || !el.classList) return;
    el.classList.remove('game-invalid-shake');
    void el.offsetWidth;
    el.classList.add('game-invalid-shake');
    if (o.toast && typeof showToast === 'function') showToast(o.toast);
    setTimeout(() => el.classList.remove('game-invalid-shake'), 520);
  }

  /* ── Personal bests ── */
  function getGamePB(gameId) {
    const meta = PB_KEYS[gameId];
    if (!meta) return null;
    const raw = localStorage.getItem(meta.key);
    if (raw == null || raw === '') {
      // Migrate legacy Rush key
      if (gameId === 'rushrunner') {
        const legacy = localStorage.getItem('rushrunner_best');
        if (legacy != null) return Number(legacy);
      }
      return null;
    }
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function setGamePB(gameId, value) {
    const meta = PB_KEYS[gameId];
    if (!meta || value == null || !Number.isFinite(Number(value))) return getGamePB(gameId);
    const next = Number(value);
    const prev = getGamePB(gameId);
    const better =
      prev == null ||
      (meta.higherBetter ? next > prev : next < prev);
    if (better) {
      localStorage.setItem(meta.key, String(next));
      if (gameId === 'rushrunner') localStorage.setItem('rushrunner_best', String(next));
      return next;
    }
    return prev;
  }

  function formatVsBest(gameId, value) {
    const meta = PB_KEYS[gameId];
    if (!meta || value == null) return '';
    const pb = getGamePB(gameId);
    const unit = meta.label || '';
    if (pb == null) return `First score · ${value}${unit}`;
    const better =
      meta.higherBetter ? Number(value) > pb : Number(value) < pb;
    if (better) return `New best · ${value}${unit} (was ${pb}${unit})`;
    if (Number(value) === pb) return `Tied best · ${pb}${unit}`;
    return `${value}${unit} · Best ${pb}${unit}`;
  }

  /* ── Share card + share helpers ── */
  function gameDisplayName(gameId) {
    if (typeof getGame === 'function') {
      const g = getGame(gameId === 'muqabala' ? 'quiz' : gameId);
      if (g && g.name) return g.name;
    }
    return GAME_LABELS[gameId] || gameId || 'Game';
  }

  function buildGameShareCard(gameId, stats) {
    const s = stats || {};
    const name = safe(s.title || gameDisplayName(gameId));
    const rawScore = s.scoreLine || (s.score != null ? String(s.score) : s.caption || '—');
    const scoreLine = safe(String(rawScore).length > 90 ? String(rawScore).slice(0, 87) + '…' : rawScore);
    const meta = safe(s.meta || '');
    const vs = s.vs ? safe(s.vs) : '';
    const accent = GAME_ACCENTS[gameId] || GAME_ACCENTS.quiz;
    return `<div class="game-share-card" data-game-share="${safe(gameId)}" style="--share-accent:${accent}">
      <div class="game-share-brand">${gameBrandMarkHtml(false)} · ${name}</div>
      <div class="game-share-score${String(rawScore).length > 40 ? ' game-share-score--caption' : ''}">${scoreLine}</div>
      ${meta ? `<div class="game-share-meta">${meta}</div>` : ''}
      ${vs ? `<div class="game-share-vs">${vs}</div>` : ''}
    </div>`;
  }

  function buildBeatScoreLink(gameId, score, extra) {
    const e = extra || {};
    const name = encodeURIComponent(
      (typeof userProfile !== 'undefined' && userProfile?.name) || 'Someone'
    );
    const params = new URLSearchParams();
    params.set('challenge', decodeURIComponent(name));
    params.set('game', gameId || 'quiz');
    if (score != null) params.set('score', String(score));
    if (e.cat) params.set('cat', e.cat);
    if (e.extra) Object.entries(e.extra).forEach(([k, v]) => params.set(k, String(v)));
    return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  }

  async function shareGameResult(gameId, stats) {
    const s = stats || {};
    const name = gameDisplayName(gameId);
    const scoreBit = s.scoreLine || (s.score != null ? String(s.score) : '');
    const text =
      s.text ||
      `Chaupaal ${name}${scoreBit ? `: ${scoreBit}` : ''}${s.meta ? ` · ${s.meta}` : ''}. Can you beat me?`;
    const url = s.url || buildBeatScoreLink(gameId, s.score, { cat: s.cat, extra: s.linkExtra });
    const payload = { title: `Chaupaal · ${name}`, text, url };

    // Prefer attaching a canvas PNG when available (no heavy deps)
    let file;
    try {
      if (s.cardEl || s.includeImage !== false) {
        const blob = await exportShareCardImage(gameId, s);
        if (blob && navigator.canShare) {
          file = new File([blob], `chaupaal-${gameId || 'game'}.png`, { type: 'image/png' });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ ...payload, files: [file] });
            trackShareEvent('share_method', { surface: gameId || 'unknown', method: 'share-file' });
            return { ok: true, method: 'share-file' };
          }
        }
      }
    } catch (e) {}

    try {
      if (navigator.share) {
        await navigator.share(payload);
        trackShareEvent('share_method', { surface: gameId || 'unknown', method: 'share' });
        return { ok: true, method: 'share' };
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return { ok: false, method: 'abort' };
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        if (typeof showToast === 'function') showToast('Link copied — share anywhere');
        trackShareEvent('share_method', { surface: gameId || 'unknown', method: 'clipboard' });
        return { ok: true, method: 'clipboard' };
      }
    } catch (e) {}
    if (typeof showToast === 'function') showToast(url);
    return { ok: false, method: 'fallback' };
  }

  /** Wrap long caption lines for canvas share cards. */
  function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    let line = '';
    let cy = y;
    let lines = 0;
    const limit = maxLines || 6;
    for (let i = 0; i < words.length; i++) {
      const test = line ? `${line} ${words[i]}` : words[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, cy);
        line = words[i];
        cy += lineHeight;
        lines++;
        if (lines >= limit - 1) {
          const rest = words.slice(i).join(' ');
          const ellipsis = rest.length > 40 ? rest.slice(0, 37) + '…' : rest;
          ctx.fillText(ellipsis, x, cy);
          return cy + lineHeight;
        }
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, cy);
    return cy + lineHeight;
  }

  /** Client-side share card → PNG via canvas (no deps). */
  function exportShareCardImage(gameId, stats) {
    return new Promise((resolve) => {
      try {
        const s = stats || {};
        const w = 720;
        const h = 900;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        const accent = GAME_ACCENTS[gameId] || '#E63946';
        const isContent = !!(s.caption || gameId === 'duniya' || gameId === 'peepal' || gameId === 'profile');
        // Background
        const grad = ctx.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, '#1F2542');
        grad.addColorStop(1, '#2A3158');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        // Accent bar
        ctx.fillStyle = accent;
        ctx.fillRect(0, 0, w, 10);
        // Brand
        ctx.fillStyle = '#FFC93C';
        ctx.font = '700 22px "Space Grotesk", sans-serif';
        ctx.fillText('CHAUPAAL', 48, 80);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '600 18px "Space Grotesk", sans-serif';
        ctx.fillText(gameDisplayName(gameId), 48, 112);
        if (isContent) {
          ctx.fillStyle = '#fff';
          ctx.font = '600 36px "Space Grotesk", sans-serif';
          const body = String(s.caption || s.scoreLine || s.text || '').slice(0, 220);
          wrapCanvasText(ctx, body, 48, 220, w - 96, 44, 7);
          if (s.meta) {
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.font = '500 22px Inter, sans-serif';
            ctx.fillText(String(s.meta).slice(0, 48), 48, h - 120);
          }
        } else {
          // Score
          ctx.fillStyle = '#fff';
          ctx.font = '700 72px "Space Grotesk", sans-serif';
          const scoreLine = String(s.scoreLine || s.score || '—');
          ctx.fillText(scoreLine.slice(0, 28), 48, 280);
          // Meta
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          ctx.font = '500 24px Inter, sans-serif';
          if (s.meta) ctx.fillText(String(s.meta).slice(0, 48), 48, 340);
          if (s.vs) {
            ctx.font = '700 26px "Space Grotesk", sans-serif';
            ctx.fillStyle = '#fff';
            ctx.fillText(String(s.vs).slice(0, 40), 48, 400);
          }
        }
        // Footer
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.font = '500 18px Inter, sans-serif';
        ctx.fillText(isContent ? 'On Chaupaal' : 'Play on Chaupaal', 48, h - 56);
        canvas.toBlob((blob) => resolve(blob), 'image/png', 0.92);
      } catch (e) {
        resolve(null);
      }
    });
  }

  /* ── Friend picker sheet ── */
  async function loadFriendProfilesForPicker() {
    try {
      if (typeof callRelationship === 'function') {
        const data = await callRelationship('list_friends');
        if (data && Array.isArray(data.profiles)) return data.profiles;
      }
      if (typeof apiFetch === 'function') {
        const envelope = await apiFetch('/api/relationships', {
          method: 'POST',
          needAuth: true,
          body: { action: 'list_friends' },
        });
        const profiles = envelope?.data?.profiles || envelope?.profiles;
        if (Array.isArray(profiles)) return profiles;
      }
    } catch (e) {}
    return [];
  }

  /**
   * Friend picker — replaces prompt() for challenges.
   * @returns {Promise<{name:string,id:string,uid?:string}|null>}
   */
  function openFriendPickerSheet(opts) {
    const o = opts || {};
    return new Promise(async (resolve) => {
      document.getElementById('gameFriendPicker')?.remove();
      const sheet = document.createElement('div');
      sheet.id = 'gameFriendPicker';
      sheet.className = 'game-friend-sheet';
      sheet.innerHTML = `
        <div class="game-friend-backdrop" data-fp-cancel></div>
        <div class="game-friend-card" role="dialog" aria-modal="true" aria-label="${safe(o.title || 'Challenge a friend')}">
          <div class="game-friend-title">${safe(o.title || 'Challenge a friend')}</div>
          <div class="game-friend-sub">${safe(o.subtitle || 'Pick someone from your friends')}</div>
          <div class="game-friend-list" data-fp-list><div class="game-friend-loading">Loading friends…</div></div>
          <button type="button" class="game-friend-cancel" data-fp-cancel>Cancel</button>
        </div>`;
      const host = document.querySelector('.device') || document.body;
      host.appendChild(sheet);
      const finish = (val) => {
        sheet.remove();
        resolve(val);
      };
      sheet.querySelectorAll('[data-fp-cancel]').forEach((el) =>
        el.addEventListener('click', () => finish(null))
      );

      const listEl = sheet.querySelector('[data-fp-list]');
      const profiles = await loadFriendProfilesForPicker();
      if (typeof enrichUsersWithProfileType === 'function') {
        await enrichUsersWithProfileType(profiles);
      }
      if (!profiles.length) {
        listEl.innerHTML = `<div class="game-friend-empty">No friends yet. Add friends in Baithak, or enter a username.</div>
          <button type="button" class="game-result-btn game-result-btn--primary" data-fp-manual>Enter username</button>`;
        listEl.querySelector('[data-fp-manual]')?.addEventListener('click', async () => {
          sheet.remove();
          const name =
            typeof promptNameSheet === 'function'
              ? await promptNameSheet({
                  title: 'Friend username',
                  placeholder: 'Enter username',
                  confirmLabel: 'Challenge',
                })
              : null;
          finish(name ? { name, id: 'friend_' + name } : null);
        });
        return;
      }
      listEl.innerHTML = profiles
        .map((p, i) => {
          const rawName = p.name || p.username || p.displayName || 'Friend';
          const name =
            typeof formatDisplayNameHtml === 'function'
              ? formatDisplayNameHtml(rawName, p)
              : safe(rawName);
          const meta = safe(p.username || p.meta || '');
          const avatar = safe(p.avatar || '👤');
          return `<button type="button" class="game-friend-row" data-fp-i="${i}">
            <span class="game-friend-avatar">${avatar}</span>
            <span class="game-friend-info"><span class="game-friend-name">${name}</span>${meta ? `<span class="game-friend-meta">${meta}</span>` : ''}</span>
          </button>`;
        })
        .join('');
      listEl.querySelectorAll('[data-fp-i]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const p = profiles[Number(btn.dataset.fpI)];
          if (!p) return finish(null);
          finish({
            name: p.name || p.username || 'Friend',
            id: p.uid || p.id || 'friend_' + (p.username || p.name),
            uid: p.uid || p.id,
            avatar: p.avatar,
            profileType: p.profileType || null,
          });
        });
      });
    });
  }

  /* ── First-run coach overlays ── */
  function coachStorageKey(gameId) {
    return `chaupaal_coach_seen_${gameId}`;
  }

  function maybeShowGameCoach(overlay, gameId) {
    if (!overlay || !gameId) return;
    try {
      if (localStorage.getItem(coachStorageKey(gameId))) return;
    } catch (e) {
      return;
    }
    const tips = COACH_TIPS[gameId] || COACH_TIPS[gameId === 'muqabala' ? 'quiz' : ''];
    if (!tips || !tips.length) return;
    if (overlay.querySelector('.game-coach')) return;
    const coach = document.createElement('div');
    coach.className = 'game-coach';
    coach.innerHTML = `
      <div class="game-coach-card">
        <div class="game-coach-brand">${gameBrandMarkHtml(true)}</div>
        <div class="game-coach-title">${safe(gameDisplayName(gameId))}</div>
        <ul class="game-coach-tips">${tips.map((t) => `<li>${safe(t)}</li>`).join('')}</ul>
        <button type="button" class="game-result-btn game-result-btn--primary" data-coach-dismiss>Got it</button>
      </div>`;
    overlay.appendChild(coach);
    const dismiss = () => {
      try {
        localStorage.setItem(coachStorageKey(gameId), '1');
      } catch (e) {}
      coach.remove();
    };
    coach.querySelector('[data-coach-dismiss]')?.addEventListener('click', dismiss);
    coach.addEventListener('click', (e) => {
      if (e.target === coach) dismiss();
    });
  }

  function resetGameCoach(gameId) {
    try {
      localStorage.removeItem(coachStorageKey(gameId));
    } catch (e) {}
  }

  /* ── Contextual HUD helper ── */
  function gameHudHtml(items) {
    const list = (items || []).filter(Boolean);
    if (!list.length) return '';
    return `<div class="game-hud" role="status">${list
      .map(
        (it) =>
          `<div class="game-hud-item"><span class="game-hud-label">${safe(it.label)}</span><strong class="game-hud-value">${safe(it.value)}</strong></div>`
      )
      .join('')}</div>`;
  }

  /* ── Duel streaks (1:1 finishes) ── */
  function duelStreakKey(oppId) {
    return `chaupaal_duel_streak_${oppId || 'anon'}`;
  }

  function recordDuelStreak(oppId, won, drew) {
    const key = duelStreakKey(oppId);
    let data = { streak: 0, best: 0 };
    try {
      data = JSON.parse(localStorage.getItem(key) || '{"streak":0,"best":0}') || data;
    } catch (e) {}
    if (drew) {
      /* streak unchanged on draw */
    } else if (won) {
      data.streak = (data.streak || 0) + 1;
      data.best = Math.max(data.best || 0, data.streak);
    } else {
      data.streak = 0;
    }
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {}
    return data;
  }

  function getDuelStreak(oppId) {
    try {
      return JSON.parse(localStorage.getItem(duelStreakKey(oppId)) || '{"streak":0,"best":0}');
    } catch (e) {
      return { streak: 0, best: 0 };
    }
  }

  /* ── Shabd daily streak ── */
  function recordShabdDailyResult(won) {
    const today = new Date().toISOString().split('T')[0];
    let data = { streak: 0, last: '', best: 0 };
    try {
      data = JSON.parse(localStorage.getItem('chaupaal_shabd_streak') || '{}') || data;
    } catch (e) {}
    if (data.last === today) return data;
    if (won) {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const yesterday = y.toISOString().split('T')[0];
      data.streak = data.last === yesterday ? (data.streak || 0) + 1 : 1;
      data.best = Math.max(data.best || 0, data.streak);
    } else {
      data.streak = 0;
    }
    data.last = today;
    try {
      localStorage.setItem('chaupaal_shabd_streak', JSON.stringify(data));
    } catch (e) {}
    return data;
  }

  function getShabdStreak() {
    try {
      return JSON.parse(localStorage.getItem('chaupaal_shabd_streak') || '{"streak":0,"best":0}');
    } catch (e) {
      return { streak: 0, best: 0 };
    }
  }

  /* ── Wordle-style grid share for Shabd ── */
  function buildShabdGridShare(guesses, target) {
    const emoji = { correct: '🟩', present: '🟨', absent: '⬛' };
    const lines = (guesses || []).map((guess) => {
      const row = [];
      const targetArr = String(target).split('');
      const guessArr = String(guess).split('');
      const states = Array(5).fill('absent');
      guessArr.forEach((l, i) => {
        if (l === targetArr[i]) {
          states[i] = 'correct';
          targetArr[i] = null;
          guessArr[i] = null;
        }
      });
      guessArr.forEach((l, i) => {
        if (l == null) return;
        const idx = targetArr.indexOf(l);
        if (idx !== -1) {
          states[i] = 'present';
          targetArr[idx] = null;
        }
      });
      return states.map((s) => emoji[s]).join('');
    });
    const day = (() => {
      const d = new Date();
      return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    })();
    return `Chaupaal Shabd Five ${day} ${guesses.length}/6\n\n${lines.join('\n')}`;
  }

  /** Upload share-card PNG when Cloudinary is available (for story media). */
  async function uploadShareCardMedia(gameId, stats) {
    try {
      if (typeof uploadToCloudinary !== 'function') return '';
      const blob = await exportShareCardImage(gameId, stats);
      if (!blob) return '';
      const up = await uploadToCloudinary(blob, {
        resourceType: 'image',
        folder: 'story-shares',
        filename: `chaupaal-${gameId || 'share'}.png`,
      });
      return up?.secure_url || up?.url || '';
    } catch (e) {
      return '';
    }
  }

  /* ── Post score to Baithak / Duniya story ── */
  async function postGameScoreStory(gameId, stats) {
    const s = stats || {};
    if (typeof createPlatformStory !== 'function') {
      if (typeof showToast === 'function') showToast('Sign in to post a story');
      return null;
    }
    const name = gameDisplayName(gameId);
    const text =
      s.text ||
      `${name}${s.scoreLine ? `: ${s.scoreLine}` : s.score != null ? `: ${s.score}` : ''}${s.meta ? ` · ${s.meta}` : ''}`;
    let media = s.media || '';
    if (!media && s.attachCard !== false) {
      media = await uploadShareCardMedia(gameId, s);
    }
    try {
      const story = await createPlatformStory({
        destination: s.destination || 'baithak',
        visibility: s.visibility || 'friends',
        kind: 'story',
        type: 'score',
        text,
        media: media || undefined,
        mediaType: media ? 'image' : undefined,
        score: s.score != null ? Number(s.score) : undefined,
        total: s.total != null ? Number(s.total) : undefined,
        streak: s.streak != null ? Number(s.streak) : undefined,
        sharedGameId: gameId === 'muqabala' ? 'quiz' : gameId,
      });
      trackShareEvent('share_method', { surface: gameId || 'unknown', method: 'story' });
      if (typeof showToast === 'function') showToast('Posted to story');
      return story;
    } catch (e) {
      if (typeof showToast === 'function') showToast(e?.message || 'Could not post story');
      return null;
    }
  }

  /** Prefill Baithak DM after friend pick (optional path alongside OS share). */
  function sendShareInBaithak(friend, gameId, stats) {
    if (!friend) return;
    const s = stats || {};
    const url = s.url || buildBeatScoreLink(gameId, s.score, { cat: s.cat, extra: s.linkExtra });
    const body =
      s.friendText ||
      s.text ||
      `Hey ${friend.name} — check out my Chaupaal ${gameDisplayName(gameId)} score!`;
    const text = `${body}${url ? `\n${url}` : ''}`;
    const chat = {
      id: friend.uid || friend.id || 'friend_' + (friend.name || 'dm'),
      type: 'dm',
      name: friend.name || 'Friend',
      avatar: friend.avatar || '👤',
      preview: text.slice(0, 48),
      time: 'now',
      unread: 0,
      peerUid: friend.uid || friend.id,
    };
    try {
      if (typeof baithakChats !== 'undefined' && Array.isArray(baithakChats)) {
        if (!baithakChats.find((c) => c.id === chat.id)) baithakChats.unshift(chat);
      }
    } catch (e) {}
    document.querySelectorAll('.tab-btn').forEach((b) => {
      if (b.dataset.tab === 'baithak') b.click();
    });
    setTimeout(() => {
      if (typeof openChatScreen === 'function') openChatScreen(chat);
      setTimeout(() => {
        const input = document.getElementById('chatMsgInput');
        if (input) {
          input.value = text;
          input.focus();
          try {
            input.dispatchEvent(new Event('input', { bubbles: true }));
          } catch (e) {}
        }
        if (typeof showToast === 'function') showToast('Message ready — tap send');
      }, 350);
    }, 250);
    trackShareEvent('share_method', { surface: gameId || 'unknown', method: 'baithak' });
  }

  /** After friend picker: Send in Baithak or OS share. */
  function openFriendShareFollowup(friend, gameId, stats) {
    return new Promise((resolve) => {
      document.getElementById('chaupaalFriendShareFollowup')?.remove();
      const sheet = document.createElement('div');
      sheet.id = 'chaupaalFriendShareFollowup';
      sheet.className = 'game-friend-sheet';
      sheet.innerHTML = `
        <div class="game-friend-backdrop" data-fsf-close></div>
        <div class="game-friend-card" role="dialog" aria-modal="true" aria-label="Share with ${safe(friend.name)}">
          <div class="game-friend-title">Share with ${safe(friend.name)}</div>
          <div class="game-friend-sub">Send in Baithak chat, or share the card externally</div>
          <div class="game-result-actions chaupaal-share-actions">
            <button type="button" class="game-result-btn game-result-btn--primary" data-fsf="baithak">Send in Baithak</button>
            <button type="button" class="game-result-btn" data-fsf="os">Share card / link</button>
          </div>
          <button type="button" class="game-friend-cancel" data-fsf-close>Cancel</button>
        </div>`;
      const host = document.querySelector('.device') || document.body;
      host.appendChild(sheet);
      const finish = (val) => {
        sheet.remove();
        resolve(val);
      };
      sheet.querySelectorAll('[data-fsf-close]').forEach((el) => el.addEventListener('click', () => finish(null)));
      sheet.querySelector('[data-fsf="baithak"]')?.addEventListener('click', () => {
        sendShareInBaithak(friend, gameId, stats);
        finish('baithak');
      });
      sheet.querySelector('[data-fsf="os"]')?.addEventListener('click', async () => {
        const personalized = {
          ...stats,
          text:
            stats.friendText ||
            `Hey ${friend.name} — ${stats.text || `check out my Chaupaal ${gameDisplayName(gameId)} score!`}`,
        };
        await shareGameResult(gameId, personalized);
        trackShareEvent('share_method', { surface: gameId || 'unknown', method: 'friend_os' });
        finish('os');
      });
    });
  }

  /* ── Wire standard result buttons (again / share / challenge / story) ── */
  function wireGameResultActions(root, handlers) {
    const h = handlers || {};
    if (!root) return;
    root.querySelectorAll('[data-result-action]').forEach((btn) => {
      const id = btn.dataset.resultId;
      const idx = Number(btn.dataset.resultAction);
      btn.addEventListener('click', () => {
        if (id && typeof h[id] === 'function') return h[id](btn);
        if (typeof h[idx] === 'function') return h[idx](btn);
        if (id === 'share' && h.share) return h.share(btn);
        if (id === 'challenge' && h.challenge) return h.challenge(btn);
        if (id === 'again' && h.again) return h.again(btn);
        if (id === 'story' && h.story) return h.story(btn);
      });
    });
  }

  /**
   * Instagram-inspired share sheet (step 1):
   * Friends grid · recent chats · search · Copy link · External/More → OS share (step 2).
   * Never jump straight to navigator.share on first tap.
   */
  function openUnifiedShareSheet(opts) {
    const o = opts || {};
    const gameId = o.gameId || 'quiz';
    const stats = Object.assign({}, o.stats || {});
    document.getElementById('chaupaalShareSheet')?.remove();
    const sheet = document.createElement('div');
    sheet.id = 'chaupaalShareSheet';
    sheet.className = 'game-friend-sheet chaupaal-share-sheet share-sheet-ig';
    sheet.dataset.navManaged = '1';
    const showStory = o.story !== false;
    const title = o.title || (typeof t === 'function' ? t('share_title', 'Share') : 'Share');
    sheet.innerHTML = `
      <div class="game-friend-backdrop" data-cs-close></div>
      <div class="game-friend-card share-sheet-card" role="dialog" aria-modal="true" aria-label="${safe(title)}">
        <div class="half-sheet-grabber" aria-hidden="true"></div>
        <div class="game-friend-title">${safe(title)}</div>
        ${o.subtitle ? `<div class="game-friend-sub">${safe(o.subtitle)}</div>` : ''}
        <div class="share-users-row" data-cs-friends><div class="game-friend-loading">…</div></div>
        <div class="share-recents" data-cs-recents></div>
        <div class="share-search-wrap">
          <input type="search" class="share-search-input" data-cs-search placeholder="${safe(typeof t === 'function' ? t('share_search_ph', 'Search people…') : 'Search people…')}" autocomplete="off" enterkeyhint="search" data-living-ph="share_search">
        </div>
        <div class="share-sheet-actions">
          <button type="button" class="share-action-row" data-cs="copy"><span class="share-action-ico">🔗</span><span>${safe(typeof t === 'function' ? t('share_copy_link', 'Copy link') : 'Copy link')}</span></button>
          ${showStory ? `<button type="button" class="share-action-row" data-cs="story"><span class="share-action-ico">📖</span><span>${safe(typeof t === 'function' ? t('share_to_story', 'Post to story') : 'Post to story')}</span></button>` : ''}
          <button type="button" class="share-action-row share-action-row--external" data-cs="external"><span class="share-action-ico">↗</span><span>${safe(typeof t === 'function' ? t('share_external_more', 'External / More') : 'External / More')}</span></button>
        </div>
        <button type="button" class="game-friend-cancel" data-cs-close>${safe(typeof t === 'function' ? t('cancel', 'Cancel') : 'Cancel')}</button>
      </div>`;
    const hostEl = document.querySelector('.device') || document.body;
    hostEl.appendChild(sheet);
    trackShareEvent('share_opened', { surface: gameId, method: 'sheet' });

    const close = () => {
      if (typeof removeNavLayer === 'function') removeNavLayer(sheet);
      sheet.remove();
      try {
        if (typeof restoreAppShell === 'function') restoreAppShell('share_close');
      } catch (e) {}
    };
    if (typeof openLayer === 'function') openLayer(sheet, close, { host: hostEl });
    else if (typeof pushNavLayer === 'function') pushNavLayer(sheet, close);
    sheet.querySelectorAll('[data-cs-close]').forEach((el) => el.addEventListener('click', close));
    if (typeof bindLivingPlaceholder === 'function') {
      bindLivingPlaceholder(sheet.querySelector('[data-cs-search]'), 'share_search');
    }

    async function sendToFriend(friend) {
      if (!friend) return;
      trackShareEvent('share_method', { surface: gameId, method: 'friend' });
      close();
      if (typeof o.onFriend === 'function') {
        await o.onFriend(stats, friend);
        return;
      }
      await openFriendShareFollowup(friend, gameId, stats);
      if (typeof o.onShared === 'function') o.onShared({ method: 'friend' });
    }

    (async () => {
      const listEl = sheet.querySelector('[data-cs-friends]');
      const recentsEl = sheet.querySelector('[data-cs-recents]');
      let profiles = [];
      try {
        profiles = await loadFriendProfilesForPicker();
      } catch (e) {
        profiles = [];
      }
      if (typeof enrichUsersWithProfileType === 'function') {
        try {
          await enrichUsersWithProfileType(profiles);
        } catch (e) {}
      }
      if (!profiles.length) {
        listEl.innerHTML = `<div class="share-empty">${safe(typeof t === 'function' ? t('share_no_friends', 'No friends yet — search someone or use External / More.') : 'No friends yet — search someone or use External / More.')}</div>`;
      } else {
        listEl.innerHTML = profiles
          .slice(0, 24)
          .map((p) => {
            const name = safe((p.name || p.username || 'Friend').split(' ')[0]);
            const av = p.photoURL
              ? `<img src="${safe(p.photoURL)}" alt="">`
              : '👤';
            return `<button type="button" class="share-user-chip" data-uid="${safe(p.uid || p.id || '')}" data-name="${safe(p.name || p.username || '')}">
              <span class="share-user-chip-avatar">${av}</span>
              <span class="share-user-chip-name">${name}</span>
            </button>`;
          })
          .join('');
        listEl.querySelectorAll('.share-user-chip').forEach((btn) => {
          btn.addEventListener('click', () => {
            const uid = btn.dataset.uid;
            const friend = profiles.find((p) => String(p.uid || p.id) === uid) || {
              uid,
              id: uid,
              name: btn.dataset.name,
            };
            sendToFriend(friend);
          });
        });
      }

      // Recent chats / groups row
      try {
        const chats =
          typeof baithakChats !== 'undefined' && Array.isArray(baithakChats)
            ? baithakChats.filter((c) => c && !c.isSelf && !c.isChaupaal).slice(0, 8)
            : [];
        if (chats.length && recentsEl) {
          recentsEl.innerHTML = `<div class="share-recents-label">${safe(typeof t === 'function' ? t('share_recent', 'Recent') : 'Recent')}</div>
            <div class="share-users-row">${chats
              .map((c) => {
                const label = safe((c.name || c.peerName || 'Chat').split(' ')[0]);
                const id = safe(c.firestoreId || c.id || '');
                return `<button type="button" class="share-user-chip" data-chat-id="${id}" data-name="${safe(c.name || '')}">
                  <span class="share-user-chip-avatar">${c.type === 'group' ? '👥' : '💬'}</span>
                  <span class="share-user-chip-name">${label}</span>
                </button>`;
              })
              .join('')}</div>`;
          recentsEl.querySelectorAll('[data-chat-id]').forEach((btn) => {
            btn.addEventListener('click', async () => {
              const chat = chats.find((c) => String(c.firestoreId || c.id) === btn.dataset.chatId);
              if (!chat) return;
              trackShareEvent('share_method', { surface: gameId, method: 'recent_chat' });
              close();
              if (typeof sendShareInBaithak === 'function') {
                await sendShareInBaithak(chat, gameId, stats);
              } else if (typeof openChatScreen === 'function') {
                openChatScreen(chat);
              }
              if (typeof o.onShared === 'function') o.onShared({ method: 'recent_chat' });
            });
          });
        }
      } catch (e) {}
    })();

    sheet.querySelector('[data-cs-search]')?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const q = e.target.value.trim();
      if (!q) return;
      close();
      if (typeof openUniversalSearch === 'function') {
        openUniversalSearch({ initialQuery: q.replace(/^@/, ''), types: ['users'] });
      }
    });

    sheet.querySelector('[data-cs="copy"]')?.addEventListener('click', async () => {
      const url = stats.url || buildBeatScoreLink(gameId, stats.score, { cat: stats.cat, extra: stats.linkExtra });
      const text = `${stats.text || `Chaupaal ${gameDisplayName(gameId)}`}\n${url}`;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          if (typeof showToast === 'function') showToast(typeof t === 'function' ? t('share_copied', 'Link copied') : 'Link copied');
        } else if (typeof showToast === 'function') showToast(url);
      } catch (e) {
        if (typeof showToast === 'function') showToast(url);
      }
      trackShareEvent('share_method', { surface: gameId, method: 'copy' });
      if (typeof o.onShared === 'function') o.onShared({ method: 'copy' });
      close();
    });

    sheet.querySelector('[data-cs="story"]')?.addEventListener('click', async () => {
      close();
      await postGameScoreStory(gameId, stats);
      if (typeof o.onShared === 'function') o.onShared({ method: 'story' });
    });

    // Step 2 — OS share only from External / More
    sheet.querySelector('[data-cs="external"]')?.addEventListener('click', async () => {
      trackShareEvent('share_method', { surface: gameId, method: 'external' });
      close();
      const result = await shareGameResult(gameId, stats);
      if (typeof o.onShared === 'function') o.onShared(result || { method: 'external' });
    });

    return sheet;
  }

  /** Build share-stats payload helpers can reuse (Akhbaar, wraps, etc.). */
  function buildShareStats(partial) {
    return Object.assign(
      {
        scoreLine: '',
        meta: '',
        text: '',
      },
      partial || {}
    );
  }

  /* ── Dangal progress · stats · soft weekly missions (local, per active profile) ── */
  const SCORE_FOCUS_GAMES = { rushrunner: true, tiptap: true, ankjod: true, wordguess: true };
  const HIGHER_BETTER_SCORE = { rushrunner: true, tiptap: true, quiz: true };
  const LOWER_BETTER_SCORE = { wordguess: true, ankjod: true };

  function normalizeDangalGameId(gameId) {
    const id = String(gameId || '').toLowerCase();
    if (id === 'muqabala' || id === 'quiz') return 'quiz';
    if (id === 'kakuro') return 'ankjod';
    if (id === 'tictactoe') return 'ttt';
    return id;
  }

  function dangalProgressProfileId() {
    try {
      if (typeof window !== 'undefined' && window.activeProfileId) return String(window.activeProfileId);
      if (typeof userProfile !== 'undefined' && userProfile?.activeProfileId) return String(userProfile.activeProfileId);
    } catch (e) {}
    return 'primary';
  }

  function dangalProgressStorageKey() {
    return `chaupaal_dangal_progress_${dangalProgressProfileId()}`;
  }

  function dangalCalendarDay() {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
    } catch (e) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  function dangalWeekKey(dayStr) {
    const d = new Date((dayStr || dangalCalendarDay()) + 'T12:00:00');
    const day = (d.getDay() + 6) % 7; // Mon=0
    d.setDate(d.getDate() - day);
    return d.toISOString().slice(0, 10);
  }

  function emptyDangalGameStats() {
    return {
      played: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      streak: 0,
      bestStreak: 0,
      bestScore: null,
      lastAt: 0,
    };
  }

  function emptyDangalWeek(weekKey) {
    return {
      key: weekKey || dangalWeekKey(),
      plays: 0,
      unique: [],
      wins: 0,
      gotd: false,
      shabd: false,
      celebrated: {},
    };
  }

  function emptyDangalProgress() {
    return {
      v: 1,
      games: {},
      softDayStreak: 0,
      lastPlayDay: '',
      week: emptyDangalWeek(),
      panelCollapsed: false,
      hideMissionsUntil: '',
    };
  }

  function getDangalProgress() {
    let data = emptyDangalProgress();
    try {
      const raw = localStorage.getItem(dangalProgressStorageKey());
      if (raw) data = Object.assign(emptyDangalProgress(), JSON.parse(raw) || {});
    } catch (e) {}
    const weekKey = dangalWeekKey();
    if (!data.week || data.week.key !== weekKey) {
      data.week = emptyDangalWeek(weekKey);
    }
    if (!data.games || typeof data.games !== 'object') data.games = {};
    return data;
  }

  function saveDangalProgress(data) {
    try {
      localStorage.setItem(dangalProgressStorageKey(), JSON.stringify(data));
    } catch (e) {}
    return data;
  }

  function getDangalGameStats(gameId) {
    const id = normalizeDangalGameId(gameId);
    const progress = getDangalProgress();
    return Object.assign(emptyDangalGameStats(), progress.games[id] || {});
  }

  /**
   * Record a finished session. Soft streaks + weekly mission progress.
   * @param {string} gameId
   * @param {{ won?: boolean, drew?: boolean, score?: number, scoreOnly?: boolean, gotd?: boolean }} [opts]
   */
  function recordDangalSession(gameId, opts) {
    const id = normalizeDangalGameId(gameId);
    if (!id) return getDangalProgress();
    const o = opts || {};
    const data = getDangalProgress();
    const g = Object.assign(emptyDangalGameStats(), data.games[id] || {});
    g.played += 1;
    g.lastAt = Date.now();

    // Score-only runs (e.g. Rush) skip W/L unless caller passes an explicit clear (won===true)
    const scoreOnly =
      o.scoreOnly === true || (SCORE_FOCUS_GAMES[id] && o.won == null && o.drew == null && o.score != null);
    if (scoreOnly) {
      if (o.won === true) {
        g.wins += 1;
        g.streak += 1;
        g.bestStreak = Math.max(g.bestStreak, g.streak);
      }
    } else if (o.drew) {
      g.draws += 1;
    } else if (o.won === true) {
      g.wins += 1;
      g.streak += 1;
      g.bestStreak = Math.max(g.bestStreak, g.streak);
    } else if (o.won === false) {
      g.losses += 1;
      g.streak = 0;
    }

    if (o.score != null && Number.isFinite(Number(o.score))) {
      const next = Number(o.score);
      const prev = g.bestScore;
      let better = prev == null;
      if (!better) {
        if (LOWER_BETTER_SCORE[id]) better = next < prev;
        else better = next > prev;
      }
      if (better) g.bestScore = next;
    }
    data.games[id] = g;

    const today = dangalCalendarDay();
    if (data.lastPlayDay !== today) {
      const y = new Date(today + 'T12:00:00');
      y.setDate(y.getDate() - 1);
      data.softDayStreak =
        data.lastPlayDay === y.toISOString().slice(0, 10) ? (data.softDayStreak || 0) + 1 : 1;
      data.lastPlayDay = today;
    }

    const week = data.week || emptyDangalWeek();
    week.plays += 1;
    if (!Array.isArray(week.unique)) week.unique = [];
    if (!week.unique.includes(id)) week.unique.push(id);
    if (o.won === true) week.wins += 1;
    if (o.gotd) week.gotd = true;
    if (id === 'wordguess') week.shabd = true;
    data.week = week;

    saveDangalProgress(data);
    maybeCelebrateMissions(data);
    return data;
  }

  function getDangalMissions(progress) {
    const p = progress || getDangalProgress();
    const week = p.week || emptyDangalWeek();
    const uniqueCount = Array.isArray(week.unique) ? week.unique.length : 0;
    return [
      {
        id: 'play3',
        label: 'Play 3 sessions',
        hint: 'Any games count',
        progress: Math.min(week.plays || 0, 3),
        target: 3,
      },
      {
        id: 'variety',
        label: 'Try 2 different games',
        hint: 'Mix solos & duels',
        progress: Math.min(uniqueCount, 2),
        target: 2,
      },
      {
        id: 'win1',
        label: 'Win one match',
        hint: 'Optional — no pressure',
        progress: Math.min(week.wins || 0, 1),
        target: 1,
      },
      {
        id: 'shabd',
        label: 'Finish today\'s Shabd',
        hint: 'Daily 5-letter word',
        progress: week.shabd ? 1 : 0,
        target: 1,
        gameId: 'wordguess',
      },
      {
        id: 'gotd',
        label: 'Play Game of the Day',
        hint: 'Featured on the hub',
        progress: week.gotd ? 1 : 0,
        target: 1,
      },
    ];
  }

  function maybeCelebrateMissions(progress) {
    const p = progress || getDangalProgress();
    if (!p.week.celebrated) p.week.celebrated = {};
    const newly = [];
    getDangalMissions(p).forEach((m) => {
      if (m.progress >= m.target && !p.week.celebrated[m.id]) {
        p.week.celebrated[m.id] = true;
        newly.push(m);
      }
    });
    if (newly.length) {
      saveDangalProgress(p);
      const first = newly[0];
      try {
        if (typeof showToast === 'function') {
          showToast(newly.length > 1 ? `Weekly goals · ${newly.length} done` : `Goal done · ${first.label}`);
        }
      } catch (e) {}
    }
  }

  function getDangalHubSummary() {
    const p = getDangalProgress();
    const missions = getDangalMissions(p);
    const done = missions.filter((m) => m.progress >= m.target).length;
    const matches = Object.values(p.games || {}).reduce(
      (acc, g) => {
        acc.played += g.played || 0;
        acc.wins += g.wins || 0;
        return acc;
      },
      { played: 0, wins: 0 }
    );
    return {
      softDayStreak: p.softDayStreak || 0,
      weekPlays: p.week?.plays || 0,
      weekWins: p.week?.wins || 0,
      missionsDone: done,
      missionsTotal: missions.length,
      totalPlayed: matches.played,
      totalWins: matches.wins,
      panelCollapsed: !!p.panelCollapsed,
      hideMissions: p.hideMissionsUntil === dangalCalendarDay(),
      missions,
    };
  }

  function gamePersonalStatsHtml(gameId) {
    const id = normalizeDangalGameId(gameId);
    const g = getDangalGameStats(id);
    if (!g.played) return '';
    const decided = (g.wins || 0) + (g.losses || 0);
    const rate = decided > 0 ? Math.round(((g.wins || 0) / decided) * 100) : null;
    const bits = [`${g.played} play${g.played === 1 ? '' : 's'}`];
    if (rate != null && decided >= 2) bits.push(`${rate}% wins`);
    if (g.streak > 1) bits.push(`streak ${g.streak}`);
    else if (g.bestStreak > 1) bits.push(`best streak ${g.bestStreak}`);
    if (g.bestScore != null) {
      const unit = (PB_KEYS[id] && PB_KEYS[id].label) || '';
      bits.push(`best ${g.bestScore}${unit}`);
    }
    return `<div class="game-result-stats" aria-label="Your stats">${bits
      .map((b) => `<span class="game-result-stat">${safe(b)}</span>`)
      .join('')}</div>`;
  }

  function dangalMissionNudgeHtml(gameId) {
    const summary = getDangalHubSummary();
    if (summary.hideMissions) return '';
    const open = summary.missions.find((m) => m.progress < m.target);
    if (!open) {
      return `<p class="game-result-mission is-done">Weekly goals complete — nice and calm</p>`;
    }
    return `<p class="game-result-mission">${safe(open.label)} · ${open.progress}/${open.target}</p>`;
  }

  function dangalHubProgressHtml() {
    const summary = getDangalHubSummary();
    const streakLabel = summary.softDayStreak > 1 ? `${summary.softDayStreak}-day play streak` : summary.softDayStreak === 1 ? 'Played today' : 'Start a soft streak';
    const missionsHidden = summary.hideMissions;
    const collapsed = summary.panelCollapsed;
    const missionRows = missionsHidden
      ? ''
      : summary.missions
          .map((m) => {
            const pct = Math.round((m.progress / m.target) * 100);
            const done = m.progress >= m.target;
            return `<button type="button" class="dangal-mission${done ? ' is-done' : ''}" data-mission="${safe(m.id)}"${m.gameId ? ` data-mission-game="${safe(m.gameId)}"` : ''}>
              <div class="dangal-mission-top"><span class="dangal-mission-label">${safe(m.label)}</span><span class="dangal-mission-count">${m.progress}/${m.target}</span></div>
              <div class="dangal-mission-track"><div class="dangal-mission-fill" style="width:${pct}%"></div></div>
              <div class="dangal-mission-hint">${safe(m.hint)}</div>
            </button>`;
          })
          .join('');

    return `<div class="dangal-progress" id="dangalProgressPanel">
      <div class="dangal-progress-summary">
        <div class="dangal-progress-pill"><span class="dangal-progress-k">Streak</span><strong>${safe(streakLabel)}</strong></div>
        <div class="dangal-progress-pill"><span class="dangal-progress-k">This week</span><strong>${summary.weekPlays} play${summary.weekPlays === 1 ? '' : 's'}</strong></div>
        <div class="dangal-progress-pill"><span class="dangal-progress-k">Goals</span><strong>${summary.missionsDone}/${summary.missionsTotal}</strong></div>
      </div>
      <div class="dangal-progress-toolbar">
        <button type="button" class="dangal-progress-toggle" id="dangalMissionsToggle" aria-expanded="${collapsed ? 'false' : 'true'}">${collapsed ? 'Show weekly goals' : 'Hide weekly goals'}</button>
        ${missionsHidden ? '' : `<button type="button" class="dangal-progress-snooze" id="dangalMissionsSnooze" title="Hide goals for today">Not now</button>`}
      </div>
      <div class="dangal-missions${collapsed || missionsHidden ? ' is-collapsed' : ''}" id="dangalMissionsList">
        ${missionsHidden ? `<div class="dangal-missions-snoozed">Goals tucked away for today — they’ll return tomorrow.</div>` : missionRows}
      </div>
    </div>`;
  }

  function wireDangalProgressPanel(root) {
    const host = root || document;
    const panel = host.querySelector('#dangalProgressPanel');
    if (!panel || panel.dataset.wired) return;
    panel.dataset.wired = '1';
    panel.querySelector('#dangalMissionsToggle')?.addEventListener('click', () => {
      const data = getDangalProgress();
      data.panelCollapsed = !data.panelCollapsed;
      saveDangalProgress(data);
      if (typeof renderDangalGamesGrid === 'function') renderDangalGamesGrid();
    });
    panel.querySelector('#dangalMissionsSnooze')?.addEventListener('click', () => {
      const data = getDangalProgress();
      data.hideMissionsUntil = dangalCalendarDay();
      data.panelCollapsed = true;
      saveDangalProgress(data);
      if (typeof showToast === 'function') showToast('Goals hidden for today');
      if (typeof renderDangalGamesGrid === 'function') renderDangalGamesGrid();
    });
    panel.querySelectorAll('[data-mission-game]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const gid = btn.dataset.missionGame;
        if (gid && typeof handleDangalGameTap === 'function') handleDangalGameTap(gid);
      });
    });
  }

  function tileProgressPillHtml(gameId) {
    const g = getDangalGameStats(gameId);
    if (!g.played) return '<div class="dangal-game-progress-pill dangal-game-progress-pill--new">Try it</div>';
    const decided = (g.wins || 0) + (g.losses || 0);
    if (g.streak > 1) return `<div class="dangal-game-progress-pill">Streak ${g.streak}</div>`;
    if (decided >= 3) {
      const rate = Math.round(((g.wins || 0) / decided) * 100);
      return `<div class="dangal-game-progress-pill">${rate}% wins · ${g.played}</div>`;
    }
    if (g.bestScore != null) {
      const unit = (PB_KEYS[normalizeDangalGameId(gameId)] && PB_KEYS[normalizeDangalGameId(gameId)].label) || '';
      return `<div class="dangal-game-progress-pill">Best ${g.bestScore}${unit}</div>`;
    }
    return `<div class="dangal-game-progress-pill">${g.played} play${g.played === 1 ? '' : 's'}</div>`;
  }

  /* ── Last played / continue helpers ── */
  function markGamePlayed(gameId) {
    if (!gameId) return;
    try {
      localStorage.setItem('chaupaal_last_game', JSON.stringify({ id: gameId, at: Date.now() }));
    } catch (e) {}
    // Mark GOTD mission when the featured game is opened
    try {
      const gotdId =
        (typeof window !== 'undefined' && window.__dangalGotdId) ||
        (typeof _dangalGotdCache !== 'undefined' && _dangalGotdCache?.gameId);
      if (gotdId && normalizeDangalGameId(gotdId) === normalizeDangalGameId(gameId)) {
        const data = getDangalProgress();
        if (data.week && !data.week.gotd) {
          data.week.gotd = true;
          saveDangalProgress(data);
          maybeCelebrateMissions(data);
        }
      }
    } catch (e) {}
    // Server play counter (Game of the Day popularity) — best-effort; apiFetch waits for auth.
    if (typeof apiFetch === 'function') {
      apiFetch('/api/media-config', {
        method: 'POST',
        needAuth: true,
        body: { action: 'record_game_play', gameId },
      }).catch(() => {});
    }
  }

  function getLastPlayedGame() {
    try {
      return JSON.parse(localStorage.getItem('chaupaal_last_game') || 'null');
    } catch (e) {
      return null;
    }
  }

  /* ── Daily spotlight rotation ── */
  function getDailySpotlightGameId(ids) {
    const list = ids && ids.length ? ids : ['quiz', 'wordguess', 'rushrunner', 'chess', 'tiptap', 'ankjod'];
    const seed = new Date().toISOString().split('T')[0];
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return list[h % list.length];
  }

  /* ── Weekly friends board from readable gameRatings ── */
  async function buildWeeklyFriendsBoard(ratingKey) {
    const key = ratingKey || 'chess';
    const rows = [];
    // Self
    try {
      const mine =
        (typeof userProfile !== 'undefined' && userProfile?.gameRatings?.[key]) ||
        (typeof getGameRating === 'function' ? getGameRating(key) : null) ||
        1200;
      rows.push({
        name: (typeof userProfile !== 'undefined' && userProfile?.name?.split(' ')[0]) || 'You',
        rating: mine,
        you: true,
        profileType:
          typeof ownProfileType === 'function'
            ? ownProfileType()
            : typeof getProfileType === 'function'
              ? getProfileType()
              : userProfile?.profileType || 'personal',
        uid: typeof currentUser !== 'undefined' ? currentUser?.uid : null,
      });
    } catch (e) {}
    // Friends — only if profile docs expose gameRatings (no new endpoints)
    try {
      const profiles = await loadFriendProfilesForPicker();
      for (const p of profiles.slice(0, 12)) {
        // gameRatings stay private on users/ — only use ratings already on the friend picker blob
        const rating = p.gameRatings?.[key];
        if (rating != null) {
          rows.push({
            name: (p.name || 'Friend').split(' ')[0],
            rating: Number(rating),
            you: false,
            profileType: p.profileType || null,
            uid: p.uid || p.id || null,
          });
        }
      }
    } catch (e) {}
    rows.sort((a, b) => b.rating - a.rating);
    if (typeof enrichUsersWithProfileType === 'function') {
      await enrichUsersWithProfileType(rows);
    }
    return rows.slice(0, 8);
  }

  function weeklyFriendsBoardHtml(rows) {
    if (!rows || !rows.length) return '';
    return `<div class="dangal-friends-board">
      <div class="dangal-section-label">Friends this week</div>
      ${rows
        .map(
          (r, i) =>
            `<div class="dangal-friends-row${r.you ? ' is-you' : ''}"><span class="dangal-friends-rank">${i + 1}</span><span class="dangal-friends-name">${typeof formatDisplayNameHtml==='function'?formatDisplayNameHtml(r.name,r):safe(r.name)}</span><span class="dangal-friends-rating">${safe(r.rating)}</span></div>`
        )
        .join('')}
    </div>`;
  }

  /* ── Consume async beat-my-score challenge from URL ── */
  function consumeBeatScoreChallenge() {
    try {
      const params = new URLSearchParams(window.location.search);
      const challenger = params.get('challenge');
      if (!challenger) return null;
      const game = params.get('game') || 'quiz';
      const score = params.get('score');
      const cat = params.get('cat') || 'GK';
      return {
        challenger: decodeURIComponent(challenger),
        game,
        score: score != null ? Number(score) : null,
        cat,
      };
    } catch (e) {
      return null;
    }
  }

  window.GameFeedback = gameFeedback;
  window.gameFeedback = gameFeedback;
  window.gameTurnBannerHtml = gameTurnBannerHtml;
  window.gameChromeHtml = gameChromeHtml;
  window.gameScoreHtml = gameScoreHtml;
  window.gameResultHtml = gameResultHtml;
  window.defaultResultActions = defaultResultActions;
  window.setGameTurnBanner = setGameTurnBanner;
  window.gameSkeletonHtml = gameSkeletonHtml;
  window.prepareGameOverlay = prepareGameOverlay;
  window.animateGameExit = animateGameExit;
  window.pulseGameEl = pulseGameEl;
  window.ensureGameTapTarget = ensureGameTapTarget;
  window.setupGameCanvas = setupGameCanvas;
  window.shakeInvalidMove = shakeInvalidMove;
  window.getGamePB = getGamePB;
  window.setGamePB = setGamePB;
  window.formatVsBest = formatVsBest;
  window.buildGameShareCard = buildGameShareCard;
  window.buildBeatScoreLink = buildBeatScoreLink;
  window.shareGameResult = shareGameResult;
  window.exportShareCardImage = exportShareCardImage;
  window.openFriendPickerSheet = openFriendPickerSheet;
  window.openUnifiedShareSheet = openUnifiedShareSheet;
  window.buildShareStats = buildShareStats;
  window.sendShareInBaithak = sendShareInBaithak;
  window.openFriendShareFollowup = openFriendShareFollowup;
  window.uploadShareCardMedia = uploadShareCardMedia;
  window.maybeShowGameCoach = maybeShowGameCoach;
  window.resetGameCoach = resetGameCoach;
  window.gameHudHtml = gameHudHtml;
  window.gameBrandMarkHtml = gameBrandMarkHtml;
  window.recordDuelStreak = recordDuelStreak;
  window.getDuelStreak = getDuelStreak;
  window.recordShabdDailyResult = recordShabdDailyResult;
  window.getShabdStreak = getShabdStreak;
  window.buildShabdGridShare = buildShabdGridShare;
  window.postGameScoreStory = postGameScoreStory;
  window.wireGameResultActions = wireGameResultActions;
  window.markGamePlayed = markGamePlayed;
  window.getLastPlayedGame = getLastPlayedGame;
  window.getDailySpotlightGameId = getDailySpotlightGameId;
  window.buildWeeklyFriendsBoard = buildWeeklyFriendsBoard;
  window.weeklyFriendsBoardHtml = weeklyFriendsBoardHtml;
  window.consumeBeatScoreChallenge = consumeBeatScoreChallenge;
  window.recordDangalSession = recordDangalSession;
  window.getDangalProgress = getDangalProgress;
  window.getDangalGameStats = getDangalGameStats;
  window.getDangalHubSummary = getDangalHubSummary;
  window.getDangalMissions = getDangalMissions;
  window.dangalHubProgressHtml = dangalHubProgressHtml;
  window.wireDangalProgressPanel = wireDangalProgressPanel;
  window.gamePersonalStatsHtml = gamePersonalStatsHtml;
  window.tileProgressPillHtml = tileProgressPillHtml;
  window.normalizeDangalGameId = normalizeDangalGameId;
  window.GAME_ACCENTS = GAME_ACCENTS;
})();
