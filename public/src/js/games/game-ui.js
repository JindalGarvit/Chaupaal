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
  };

  const GAME_LABELS = {
    quiz: 'Muqabala',
    muqabala: 'Muqabala',
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
  };

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
        if (gameId && o.coach !== false) maybeShowGameCoach(overlay, gameId);
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
    const scoreLine = safe(s.scoreLine || (s.score != null ? String(s.score) : '—'));
    const meta = safe(s.meta || '');
    const vs = s.vs ? safe(s.vs) : '';
    const accent = GAME_ACCENTS[gameId] || GAME_ACCENTS.quiz;
    return `<div class="game-share-card" data-game-share="${safe(gameId)}" style="--share-accent:${accent}">
      <div class="game-share-brand">${gameBrandMarkHtml(false)} · ${name}</div>
      <div class="game-share-score">${scoreLine}</div>
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
            return { ok: true, method: 'share-file' };
          }
        }
      }
    } catch (e) {}

    try {
      if (navigator.share) {
        await navigator.share(payload);
        return { ok: true, method: 'share' };
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return { ok: false, method: 'abort' };
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        if (typeof showToast === 'function') showToast('Link copied — share anywhere');
        return { ok: true, method: 'clipboard' };
      }
    } catch (e) {}
    if (typeof showToast === 'function') showToast(url);
    return { ok: false, method: 'fallback' };
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
        // Score
        ctx.fillStyle = '#fff';
        ctx.font = '700 72px "Space Grotesk", sans-serif';
        const scoreLine = String(s.scoreLine || s.score || '—');
        ctx.fillText(scoreLine, 48, 280);
        // Meta
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.font = '500 24px Inter, sans-serif';
        if (s.meta) ctx.fillText(String(s.meta).slice(0, 48), 48, 340);
        if (s.vs) {
          ctx.font = '700 26px "Space Grotesk", sans-serif';
          ctx.fillStyle = '#fff';
          ctx.fillText(String(s.vs).slice(0, 40), 48, 400);
        }
        // Footer
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.font = '500 18px Inter, sans-serif';
        ctx.fillText('Play on Chaupaal', 48, h - 56);
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
      if (!profiles.length) {
        listEl.innerHTML = `<div class="game-friend-empty">No friends yet. Add friends in Baithak, or enter a username.</div>
          <button type="button" class="game-result-btn game-result-btn--primary" data-fp-manual>Enter username</button>`;
        listEl.querySelector('[data-fp-manual]')?.addEventListener('click', async () => {
          sheet.remove();
          if (typeof promptNameSheet === 'function') {
            const name = await promptNameSheet({
              title: 'Friend username',
              placeholder: 'Enter username',
              confirmLabel: 'Challenge',
            });
            finish(name ? { name, id: 'friend_' + name } : null);
          } else {
            const name = window.prompt('Enter your friend username:');
            finish(name ? { name, id: 'friend_' + name } : null);
          }
        });
        return;
      }
      listEl.innerHTML = profiles
        .map((p, i) => {
          const name = safe(p.name || p.username || p.displayName || 'Friend');
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
    try {
      const story = await createPlatformStory({
        destination: s.destination || 'baithak',
        visibility: s.visibility || 'friends',
        kind: 'story',
        type: 'score',
        text,
        score: s.score != null ? Number(s.score) : undefined,
        total: s.total != null ? Number(s.total) : undefined,
        streak: s.streak != null ? Number(s.streak) : undefined,
        sharedGameId: gameId === 'muqabala' ? 'quiz' : gameId,
      });
      if (typeof showToast === 'function') showToast('Posted to story');
      return story;
    } catch (e) {
      if (typeof showToast === 'function') showToast(e?.message || 'Could not post story');
      return null;
    }
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

  /* ── Last played / continue helpers ── */
  function markGamePlayed(gameId) {
    if (!gameId) return;
    try {
      localStorage.setItem('chaupaal_last_game', JSON.stringify({ id: gameId, at: Date.now() }));
    } catch (e) {}
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
      });
    } catch (e) {}
    // Friends — only if profile docs expose gameRatings (no new endpoints)
    try {
      const profiles = await loadFriendProfilesForPicker();
      for (const p of profiles.slice(0, 12)) {
        let rating = p.gameRatings?.[key];
        if (rating == null && typeof db !== 'undefined' && db && (p.uid || p.id)) {
          try {
            const snap = await db.collection('users').doc(p.uid || p.id).get();
            rating = snap.data()?.gameRatings?.[key];
          } catch (e) {}
        }
        if (rating != null) {
          rows.push({ name: (p.name || 'Friend').split(' ')[0], rating: Number(rating), you: false });
        }
      }
    } catch (e) {}
    rows.sort((a, b) => b.rating - a.rating);
    return rows.slice(0, 8);
  }

  function weeklyFriendsBoardHtml(rows) {
    if (!rows || !rows.length) return '';
    return `<div class="dangal-friends-board">
      <div class="dangal-section-label">Friends this week</div>
      ${rows
        .map(
          (r, i) =>
            `<div class="dangal-friends-row${r.you ? ' is-you' : ''}"><span class="dangal-friends-rank">${i + 1}</span><span class="dangal-friends-name">${safe(r.name)}</span><span class="dangal-friends-rating">${safe(r.rating)}</span></div>`
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
  window.GAME_ACCENTS = GAME_ACCENTS;
})();
