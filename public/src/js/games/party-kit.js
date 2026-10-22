/**
 * Dangal Party Kit — shared building blocks for social party games (Imposter; RMCS, Charades,
 * Most Likely To, Would You Rather next).
 *
 *  Pass & Play (one phone, offline, no sign-in):
 *    shell overlay · player editor · settings sheet · pass cover (hold / tap to reveal, forward only)
 *    · pausable countdown · vote pickers · scoreboard · screen wake lock
 *  Room (each player on their own phone, signed in):
 *    POST /api/media-config { action: 'party_room' } for every state change (server deals + validates),
 *    RTDB games/{game}/{code}/pub for shared state, …/secrets/{uid} for this player's card only,
 *    …/presence/{uid} heartbeat (same { at, online } shape as DangalLive). Share link /party/{game}-{code},
 *    Baithak `party_invite` card.
 */
(function () {
  'use strict';

  const games = {};
  const LIVE_POLICY = window.DangalLivePolicy ? window.DangalLivePolicy.policyFor('party') : null;
  const PRESENCE_MS = LIVE_POLICY ? LIVE_POLICY.heartbeatMs : 20000;
  const TICK_MIN_GAP_MS = 2500;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
  }

  function toast(msg) {
    if (typeof showToast === 'function') showToast(msg);
  }

  function myUid() {
    if (typeof getCurrentUid === 'function') {
      try {
        const u = getCurrentUid();
        if (u) return u;
      } catch (e) {}
    }
    return (typeof currentUser !== 'undefined' && currentUser && currentUser.uid) || '';
  }

  function myName() {
    const p = typeof userProfile !== 'undefined' ? userProfile : null;
    const u = typeof currentUser !== 'undefined' ? currentUser : null;
    return String((p && (p.name || p.displayName)) || (u && u.displayName) || '').trim();
  }

  function isSignedIn() {
    return !!myUid();
  }

  function haptic(kind) {
    try {
      if (typeof gameFeedback === 'function') gameFeedback(kind || 'select', { noConfetti: kind !== 'win' });
    } catch (e) {}
  }

  // ---------------- wake lock ----------------

  const wakeLock = {
    sentinel: null,
    wanted: false,
    async acquire() {
      this.wanted = true;
      try {
        if (navigator.wakeLock && !this.sentinel) {
          this.sentinel = await navigator.wakeLock.request('screen');
          this.sentinel.addEventListener('release', () => {
            this.sentinel = null;
          });
        }
      } catch (e) {
        this.sentinel = null;
      }
    },
    release() {
      this.wanted = false;
      try {
        if (this.sentinel) this.sentinel.release();
      } catch (e) {}
      this.sentinel = null;
    },
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wakeLock.wanted) wakeLock.acquire();
  });

  // ---------------- shell overlay ----------------

  /**
   * Full-screen game overlay with shared chrome. System back and the ← button share one path:
   * a screen's `back` (setup → home) first, else ask before leaving while `guard` / confirmLeave()
   * holds, else close. Back never steps back to a previous secret card.
   * @param {{ gameId: string, title: string, subtitle?: string, onClose?: Function, confirmLeave?: () => boolean }} opts
   */
  const openShells = {};

  function openShell(opts) {
    const o = opts || {};
    document.querySelector('.pk-shell[data-game-id="' + o.gameId + '"]')?.remove();
    const el = document.createElement('div');
    el.className = 'pk-shell' + (largeText() ? ' pk-large' : '');
    el.dataset.gameId = o.gameId;
    const chrome =
      typeof gameChromeHtml === 'function'
        ? gameChromeHtml({ backId: 'pkBack_' + o.gameId, title: o.title, subtitle: o.subtitle, gameId: o.gameId, hideBrand: true })
        : `<div class="game-chrome"><button type="button" id="pkBack_${esc(o.gameId)}" class="game-back-btn">←</button><div class="game-chrome-title">${esc(o.title)}</div></div>`;
    el.innerHTML = chrome + '<div class="pk-body" data-pk-body></div>';
    if (typeof prepareGameOverlay === 'function') prepareGameOverlay(el, { theme: 'dark', gameId: o.gameId });
    const host = document.querySelector('.device') || document.body;
    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      if (openShells[o.gameId] === shell) delete openShells[o.gameId];
      if (!Object.keys(openShells).length) wakeLock.release();
      try {
        document.dispatchEvent(new CustomEvent('pk:shell-closed', { detail: { gameId: o.gameId } }));
      } catch (e) {}
      try {
        if (typeof o.onClose === 'function') o.onClose();
      } catch (e) {}
    };
    let layer = null;
    if (typeof openLayer === 'function') {
      layer = openLayer(el, cleanup, { host, remove: true, role: 'dialog', label: o.title });
    } else {
      host.appendChild(el);
    }
    let screenBack = null;
    const shell = {
      el,
      body: el.querySelector('[data-pk-body]'),
      /** True while a round is in progress — Back asks before ending it. */
      guard: false,
      get closed() {
        return closed;
      },
      /**
       * @param {string} html
       * @param {{ back?: Function, root?: boolean }} [ro] back: what Back does on this screen
       *   (e.g. setup → game home); back/root also mark the round as over (no leave prompt).
       */
      render(html, ro) {
        if (closed) return null;
        const r = ro || {};
        screenBack = typeof r.back === 'function' ? r.back : null;
        if (screenBack || r.root) this.guard = false;
        this.body.innerHTML = html;
        this.body.scrollTop = 0;
        return this.body;
      },
      /** Back on the current screen runs `fn` (one step back inside the game) instead of leaving. */
      setBack(fn) {
        screenBack = typeof fn === 'function' ? fn : null;
        if (screenBack) this.guard = false;
      },
      close() {
        if (layer && typeof layer.close === 'function') layer.close();
        else {
          el.remove();
          cleanup();
        }
      },
      setSubtitle(text) {
        const sub = el.querySelector('.game-chrome-subtitle');
        if (sub) sub.textContent = text || '';
      },
    };
    let asking = false;
    el.querySelector('#pkBack_' + o.gameId)?.addEventListener('click', async () => {
      if (asking) return;
      if (screenBack) {
        const back = screenBack;
        screenBack = null;
        back();
        return;
      }
      const ask = shell.guard || (typeof o.confirmLeave === 'function' ? o.confirmLeave() : false);
      if (ask && typeof confirmLeaveGame === 'function') {
        asking = true;
        const go = await confirmLeaveGame({ title: t('dangal.party.leave_the_game'), body: o.leaveBody || t('dangal.party.this_round_will_end_for_everyone') });
        asking = false;
        if (!go) return;
      }
      shell.close();
    });
    if (typeof GameUI !== 'undefined' && GameUI && typeof GameUI.attachHowTo === 'function') {
      try {
        GameUI.attachHowTo(el.querySelector('.game-chrome-right') || el, { gameId: o.gameId, title: t('dangal.party.how_to_play_title', { title: o.title }) });
      } catch (e) {}
    }
    const textBtn = document.createElement('button');
    textBtn.type = 'button';
    textBtn.className = 'pk-textsize';
    textBtn.setAttribute('aria-pressed', String(largeText()));
    textBtn.setAttribute('aria-label', t('dangal.party.larger_text'));
    textBtn.textContent = t('dangal.party.aa');
    textBtn.addEventListener('click', () => {
      const on = !largeText();
      setLargeText(on);
      document.querySelectorAll('.pk-shell').forEach((s) => s.classList.toggle('pk-large', on));
      textBtn.setAttribute('aria-pressed', String(on));
    });
    (el.querySelector('.game-chrome-right') || el.querySelector('.game-chrome') || el).appendChild(textBtn);
    openShells[o.gameId] = shell;
    wakeLock.acquire();
    return shell;
  }

  // ---------------- accessibility ----------------

  const LARGE_KEY = 'pk_large_text';
  function largeText() {
    try {
      return localStorage.getItem(LARGE_KEY) === '1';
    } catch (e) {
      return false;
    }
  }
  function setLargeText(on) {
    try {
      localStorage.setItem(LARGE_KEY, on ? '1' : '0');
    } catch (e) {}
  }
  function reducedMotion() {
    try {
      if (localStorage.getItem('dangal_reduce_motion') === '1') return true;
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) {
      return false;
    }
  }

  /**
   * Colour-blind-safe player identity: every seat gets a shape AND a colour (never colour alone),
   * so "the blue one" is also "the triangle". Stable by seat index.
   */
  const ID_SHAPES = ['●', '▲', '■', '◆', '★', '⬟', '✚', '⬢', '▼', '◐', '✦', '⬤', '◼', '▶', '✿', '♥'];
  const ID_COLORS = ['#4F8EF7', '#F5A524', '#17C3B2', '#E4508F', '#9B6BF2', '#8BC34A', '#FF7043', '#26A69A'];
  const ID_NAMES = /* i18n-copy */ ['circle', 'triangle', 'square', 'diamond', 'star', 'pentagon', 'cross', 'hexagon', t('dangal.party.down_triangle'), t('dangal.party.half_circle'), 'sparkle', 'dot', 'block', 'arrow', 'flower', 'heart'];
  function identityHtml(index, name) {
    const i = Math.max(0, Number(index) || 0);
    const shape = ID_SHAPES[i % ID_SHAPES.length];
    return `<span class="pk-ident" style="--pk-ident:${ID_COLORS[i % ID_COLORS.length]}" role="img" aria-label="${esc((name ? name + ', ' : '') + ID_NAMES[i % ID_NAMES.length])}">${shape}</span>`;
  }

  // ---------------- content locale ----------------

  /**
   * Which content a party deck starts with. Global core everywhere; regional add-ons (India packs)
   * are suggested for the India locale / a Hindi UI and stay one tap away for everyone else.
   */
  function contentPrefs() {
    let lang = 'en';
    try {
      if (typeof currentLang !== 'undefined' && currentLang) lang = String(typeof currentLang === 'function' ? currentLang() : currentLang);
    } catch (e) {}
    lang = lang.toLowerCase().slice(0, 2) || 'en';
    let india = false;
    try {
      india = typeof isIndiaLocale === 'function' ? !!isIndiaLocale() : false;
    } catch (e) {}
    return { lang, region: india || lang === 'hi' ? 'in' : 'global', hindi: lang === 'hi' };
  }

  /**
   * Close a shell, then run `next` once it is really gone. A history-backed close lands on popstate
   * later; opening the next layer before that would let the pop dismiss the new layer instead.
   */
  function closeThen(shell, next) {
    shell.close();
    const started = Date.now();
    const wait = () => {
      if (shell.closed || Date.now() - started > 700) next();
      else setTimeout(wait, 16);
    };
    wait();
  }

  // ---------------- bottom sheet ----------------

  /** Compact sheet on top of the shell. onMount(sheetEl, close). */
  function openSheet(opts) {
    const o = opts || {};
    const sheet = document.createElement('div');
    sheet.className = 'pk-sheet-scrim';
    sheet.innerHTML = `<div class="pk-sheet" role="dialog" aria-label="${esc(o.title || '')}">
      <div class="pk-sheet-handle" aria-hidden="true"></div>
      ${o.title ? `<div class="pk-sheet-title">${esc(o.title)}</div>` : ''}
      <div class="pk-sheet-body">${o.bodyHtml || ''}</div>
    </div>`;
    const host = document.querySelector('.device') || document.body;
    let layer = null;
    const onDismiss = () => {
      try {
        if (typeof o.onClose === 'function') o.onClose();
      } catch (e) {}
    };
    if (typeof openLayer === 'function') layer = openLayer(sheet, onDismiss, { host, remove: true });
    else host.appendChild(sheet);
    const close = () => {
      if (layer && layer.close) layer.close();
      else {
        sheet.remove();
        onDismiss();
      }
    };
    sheet.addEventListener('click', (e) => {
      if (e.target === sheet) close();
    });
    if (typeof o.onMount === 'function') o.onMount(sheet.querySelector('.pk-sheet'), close);
    return { el: sheet, close };
  }

  // ---------------- player editor (Pass & Play) ----------------

  /**
   * Editable guest list. Names default to "Player N"; signed-in user prefilled as seat 1.
   * @param {HTMLElement} root
   * @param {{ names: string[], min: number, max: number, onChange?: (names: string[]) => void }} opts
   */
  function mountPlayerEditor(root, opts) {
    const o = opts || {};
    const min = o.min || 3;
    const max = o.max || 12;
    let names = (o.names || []).slice(0, max);
    while (names.length < min) names.push('');
    const paint = () => {
      root.innerHTML = `<div class="pk-players" data-pk-players>
          ${names
            .map(
              (n, i) => `<div class="pk-player-row">
              <span class="pk-player-num">${i + 1}</span>
              <input class="pk-player-input" data-pk-name="${i}" maxlength="20" value="${esc(n)}" placeholder="${tHtml('dangal.party.player_n', { n: i + 1 })}" autocomplete="off" enterkeyhint="next" aria-label="${tHtml('dangal.party.player_n_name', { n: i + 1 })}">
              ${names.length > min ? `<button type="button" class="pk-player-remove" data-pk-remove="${i}" aria-label="${tHtml('dangal.party.remove_player_n', { n: i + 1 })}">✕</button>` : ''}
            </div>`
            )
            .join('')}
        </div>
        ${names.length < max ? '<button type="button" class="pk-add-player" data-pk-add>' + tHtml('dangal.party.add_player') + '</button>' : `<div class="pk-hint">${tHtml('dangal.party.max_value_players', { value: max })}</div>`}`;
      root.querySelectorAll('[data-pk-name]').forEach((inp) => {
        inp.addEventListener('input', () => {
          names[Number(inp.dataset.pkName)] = inp.value;
          if (o.onChange) o.onChange(list());
        });
      });
      root.querySelectorAll('[data-pk-remove]').forEach((btn) => {
        btn.addEventListener('click', () => {
          names.splice(Number(btn.dataset.pkRemove), 1);
          paint();
          if (o.onChange) o.onChange(list());
        });
      });
      root.querySelector('[data-pk-add]')?.addEventListener('click', () => {
        names.push('');
        paint();
        const inputs = root.querySelectorAll('[data-pk-name]');
        inputs[inputs.length - 1]?.focus();
        if (o.onChange) o.onChange(list());
      });
    };
    /** Final names — blanks become "Player N", duplicates get a suffix. */
    const list = () => {
      const seen = {};
      return names.map((n, i) => {
        let v = String(n || '').trim().slice(0, 20) || t('dangal.party.player_n', { n: i + 1 });
        const k = v.toLowerCase();
        if (seen[k]) v = v + ' ' + (seen[k] + 1);
        seen[k] = (seen[k] || 0) + 1;
        return v;
      });
    };
    paint();
    return { list, count: () => names.length };
  }

  // ---------------- pass cover (hold / tap to reveal) ----------------

  /**
   * "Pass to <name>" cover. The secret HTML is only injected while revealed and is wiped on hide,
   * so nothing lingers in the DOM for the next person. Forward only — onDone moves to the next player.
   * @param {HTMLElement} root
   * @param {{ name: string, lead?: string, revealHtml: () => string, doneLabel?: string, onDone: Function, onFirstReveal?: Function }} opts
   */
  /**
   * Run `onAway` when the page is backgrounded, blurred or unloaded (app switcher thumbnails,
   * bfcache snapshots) so no secret stays painted. Self-removes once `root` leaves the DOM.
   */
  const awayWatchers = new Set();
  let awayWired = false;
  function pruneAway() {
    awayWatchers.forEach((w) => {
      if (!w.root.isConnected) awayWatchers.delete(w);
    });
  }
  function fireAway() {
    pruneAway();
    awayWatchers.forEach((w) => {
      try {
        w.onAway();
      } catch (e) {}
    });
  }
  function coverWhenAway(root, onAway) {
    if (!awayWired) {
      awayWired = true;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') fireAway();
      });
      window.addEventListener('blur', fireAway);
      window.addEventListener('pagehide', fireAway);
      window.addEventListener('beforeunload', fireAway);
      // Rotating the phone to show a neighbour is the classic peek — re-cover on any orientation change.
      window.addEventListener('orientationchange', fireAway);
      try {
        if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', fireAway);
      } catch (e) {}
    }
    pruneAway();
    const w = { root, onAway };
    awayWatchers.add(w);
    return () => awayWatchers.delete(w);
  }

  function mountPassCover(root, opts) {
    const o = opts || {};
    let seen = false;
    let revealed = false;
    let holdTimer = 0;
    root.innerHTML = `<div class="pk-pass">
      <div class="pk-pass-lead">${esc(o.lead || t('dangal.party.pass_the_phone_to'))}</div>
      <div class="pk-pass-name">${esc(o.name)}</div>
      <div class="pk-card" data-pk-card aria-live="polite">
        <div class="pk-card-cover" data-pk-cover>
          <div class="pk-card-eye" aria-hidden="true">👁</div>
          <div class="pk-card-cover-title">${tHtml('dangal.party.hold_to_see_your_card')}</div>
          <div class="pk-card-cover-sub">${tHtml('dangal.party.only_name_should_look', { name: o.name })}</div>
        </div>
        <div class="pk-card-face" data-pk-face hidden></div>
      </div>
      <div class="pk-pass-actions">
        <button type="button" class="pk-btn pk-btn--ghost" data-pk-tap>${tHtml('dangal.party.tap_to_reveal')}</button>
        <button type="button" class="pk-btn pk-btn--primary" data-pk-done disabled>${esc(o.doneLabel || t('dangal.party.hide_pass'))}</button>
      </div>
    </div>`;
    const card = root.querySelector('[data-pk-card]');
    const cover = root.querySelector('[data-pk-cover]');
    const face = root.querySelector('[data-pk-face]');
    const tapBtn = root.querySelector('[data-pk-tap]');
    const doneBtn = root.querySelector('[data-pk-done]');
    const show = () => {
      if (revealed) return;
      revealed = true;
      face.innerHTML = o.revealHtml();
      face.hidden = false;
      cover.hidden = true;
      card.classList.add('is-revealed');
      tapBtn.textContent = t('common.hide');
      if (!seen) {
        seen = true;
        doneBtn.disabled = false;
        haptic('select');
        if (o.onFirstReveal) o.onFirstReveal();
      }
    };
    const hide = () => {
      if (!revealed) return;
      revealed = false;
      face.innerHTML = '';
      face.hidden = true;
      cover.hidden = false;
      card.classList.remove('is-revealed');
      tapBtn.textContent = t('dangal.party.tap_to_reveal');
    };
    const startHold = (e) => {
      if (e && e.cancelable) e.preventDefault();
      clearTimeout(holdTimer);
      holdTimer = setTimeout(show, 120);
    };
    const endHold = () => {
      clearTimeout(holdTimer);
      if (card.dataset.tapMode !== '1') hide();
    };
    card.addEventListener('pointerdown', (e) => {
      card.dataset.tapMode = '0';
      startHold(e);
    });
    card.addEventListener('pointerup', endHold);
    card.addEventListener('pointerleave', endHold);
    card.addEventListener('pointercancel', endHold);
    card.addEventListener('contextmenu', (e) => e.preventDefault());
    tapBtn.addEventListener('click', () => {
      if (revealed) {
        card.dataset.tapMode = '0';
        hide();
      } else {
        card.dataset.tapMode = '1';
        show();
      }
    });
    const stopAway = coverWhenAway(root, () => {
      clearTimeout(holdTimer);
      card.dataset.tapMode = '0';
      hide();
    });
    doneBtn.addEventListener('click', () => {
      hide();
      stopAway();
      root.innerHTML = '';
      o.onDone();
    });
    return { hide };
  }

  /**
   * Private pass-around vote: "Pass to <name>" → they open it → tap-to-choose UI → lock & pass.
   * Unlike mountPassCover the face stays open while choosing (voting needs taps), and the whole
   * face is wiped on lock so the next voter sees nothing.
   * @param {HTMLElement} root
   * @param {{ name: string, lead?: string, bodyHtml: string, doneLabel?: string, coverTitle?: string, coverIcon?: string,
   *           onMount: (face: HTMLElement, setReady: (ok: boolean) => void) => void, onDone: Function }} opts
   */
  function mountPassVote(root, opts) {
    const o = opts || {};
    root.innerHTML = `<div class="pk-pass">
      <div class="pk-pass-lead">${esc(o.lead || t('dangal.party.pass_the_phone_to'))}</div>
      <div class="pk-pass-name">${esc(o.name)}</div>
      <div class="pk-card pk-card--vote" data-pk-card>
        <div class="pk-card-cover" data-pk-cover>
          <div class="pk-card-eye" aria-hidden="true">${esc(o.coverIcon || '🤫')}</div>
          <div class="pk-card-cover-title">${esc(o.coverTitle || t('dangal.party.secret_vote'))}</div>
          <div class="pk-card-cover-sub">${tHtml('dangal.party.only_name_should_look', { name: o.name })}</div>
        </div>
        <div class="pk-card-face" data-pk-face hidden></div>
      </div>
      <div class="pk-pass-actions">
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-pk-open>${tHtml('dangal.party.im_name_show_me', { name: bidi(o.name) })}</button>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-pk-done hidden disabled>${esc(o.doneLabel || t('dangal.party.lock_vote_pass'))}</button>
      </div>
    </div>`;
    const cover = root.querySelector('[data-pk-cover]');
    const face = root.querySelector('[data-pk-face]');
    const openBtn = root.querySelector('[data-pk-open]');
    const doneBtn = root.querySelector('[data-pk-done]');
    openBtn.addEventListener('click', () => {
      face.innerHTML = o.bodyHtml;
      face.hidden = false;
      cover.hidden = true;
      openBtn.hidden = true;
      doneBtn.hidden = false;
      root.querySelector('[data-pk-card]').classList.add('is-revealed');
      haptic('select');
      o.onMount(face, (ok) => (doneBtn.disabled = !ok));
    });
    const stopAway = coverWhenAway(root, () => {
      if (face.hidden) return;
      face.innerHTML = '';
      face.hidden = true;
      cover.hidden = false;
      openBtn.hidden = false;
      doneBtn.hidden = true;
      doneBtn.disabled = true;
      root.querySelector('[data-pk-card]')?.classList.remove('is-revealed');
    });
    doneBtn.addEventListener('click', () => {
      if (doneBtn.disabled) return;
      stopAway();
      face.innerHTML = '';
      root.innerHTML = '';
      haptic('select');
      o.onDone();
    });
  }

  // ---------------- countdown ----------------

  /**
   * Pausable countdown painted into `el` (m:ss). For Room mode pass getEndsAt() so the server deadline drives it.
   * @param {HTMLElement} el
   * @param {{ seconds?: number, getEndsAt?: () => number|null, getPausedMs?: () => number|null, onDone?: Function }} opts
   */
  function countdown(el, opts) {
    const o = opts || {};
    let endsAt = o.seconds ? Date.now() + o.seconds * 1000 : 0;
    let pausedLeft = null;
    let fired = false;
    const fmt = (ms) => {
      const s = Math.max(0, Math.ceil(ms / 1000));
      return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    };
    const left = () => {
      if (o.getPausedMs) {
        const p = o.getPausedMs();
        if (p != null) return p;
      }
      if (pausedLeft != null) return pausedLeft;
      const end = o.getEndsAt ? o.getEndsAt() : endsAt;
      return end ? end - Date.now() : 0;
    };
    const tick = () => {
      if (!el.isConnected) {
        clearInterval(timer);
        return;
      }
      const ms = left();
      el.textContent = fmt(ms);
      const paused = pausedLeft != null || (o.getPausedMs && o.getPausedMs() != null);
      el.classList.toggle('is-low', ms <= 10000 && !paused);
      el.classList.toggle('is-paused', !!paused);
      if (ms <= 0 && !paused && !fired) {
        fired = true;
        if (o.onDone) o.onDone();
      }
    };
    const timer = setInterval(tick, 250);
    tick();
    return {
      pause() {
        if (pausedLeft == null) pausedLeft = Math.max(0, endsAt - Date.now());
        tick();
      },
      resume() {
        if (pausedLeft != null) {
          endsAt = Date.now() + pausedLeft;
          pausedLeft = null;
        }
        tick();
      },
      get paused() {
        return pausedLeft != null;
      },
      stop() {
        clearInterval(timer);
      },
      rearm() {
        fired = false;
      },
    };
  }

  // ---------------- pickers + scoreboard ----------------

  /**
   * Grid of player buttons.
   * @param {{ players: {id:string,name:string}[], exclude?: string[], multi?: boolean, selected?: string[], counts?: Record<string,number>, onPick: (ids: string[]) => void }} o
   */
  function mountPicker(root, o) {
    const exclude = new Set(o.exclude || []);
    let sel = new Set(o.selected || []);
    const paint = () => {
      root.innerHTML = `<div class="pk-pick-grid">${o.players
        .filter((p) => !exclude.has(p.id))
        .map(
          (p) => `<button type="button" class="pk-pick${sel.has(p.id) ? ' is-selected' : ''}" data-pk-pick="${esc(p.id)}">
            <span class="pk-pick-avatar" aria-hidden="true">${esc((p.name || '?').slice(0, 1).toUpperCase())}</span>
            <span class="pk-pick-name">${esc(p.name)}</span>
            ${o.counts && o.counts[p.id] != null ? `<span class="pk-pick-count">${o.counts[p.id]}</span>` : ''}
          </button>`
        )
        .join('')}</div>`;
      root.querySelectorAll('[data-pk-pick]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.pkPick;
          if (o.multi) {
            if (sel.has(id)) sel.delete(id);
            else sel.add(id);
            paint();
            o.onPick(Array.from(sel));
          } else {
            sel = new Set([id]);
            paint();
            o.onPick([id]);
          }
        });
      });
    };
    paint();
    return { selected: () => Array.from(sel) };
  }

  /** Session scoreboard, highest first. deltas = this round's points. */
  function scoreboardHtml(players, scores, deltas) {
    const rows = players
      .map((p) => ({ p, s: Number((scores || {})[p.id]) || 0, d: Number((deltas || {})[p.id]) || 0 }))
      .sort((a, b) => b.s - a.s || a.p.name.localeCompare(b.p.name));
    return `<div class="pk-score" role="table" aria-label="${tHtml('dangal.party.scoreboard')}">${rows
      .map(
        (r, i) => `<div class="pk-score-row${i === 0 && r.s > 0 ? ' is-top' : ''}" role="row">
        <span class="pk-score-rank">${i + 1}</span>
        <span class="pk-score-name">${esc(r.p.name)}</span>
        ${r.d ? `<span class="pk-score-delta">+${r.d}</span>` : ''}
        <span class="pk-score-pts">${r.s}</span>
      </div>`
      )
      .join('')}</div>`;
  }

  // ---------------- Room adapter ----------------

  async function roomCall(game, op, args) {
    if (typeof apiFetch !== 'function') throw Object.assign(new Error('Offline'), { code: 'OFFLINE' });
    const res = await apiFetch('/api/media-config', {
      method: 'POST',
      needAuth: true,
      body: Object.assign({ action: 'party_room', game, op }, args || {}),
    });
    if (!res || !res.ok) {
      const e = new Error((res && res.error && res.error.message) || 'Something went wrong');
      e.code = (res && res.error && res.error.code) || 'ERROR';
      throw e;
    }
    const data = res.data || {};
    if (Number(data.serverNow)) callOffset = Number(data.serverNow) - Date.now();
    return data;
  }

  /** Server-minus-local clock estimate from the latest op response (fallback when .info is unavailable). */
  let callOffset = null;

  const ROOM_ERROR_COPY = {
    ROOM_NOT_FOUND: t('dangal.party.that_room_doesn_t_exist_any'),
    ROOM_FULL: t('dangal.party.that_room_is_full'),
    ROOM_CLOSED: t('dangal.party.that_room_has_closed'),
    BAD_CODE: t('dangal.party.room_codes_are_6_letters_and'),
    HOST_ONLY: t('dangal.party.only_the_host_can_do_that'),
    NOT_MEMBER: t('dangal.party.you_re_not_in_this_room'),
    RATE_LIMITED: t('dangal.party.slow_down_a_little_try_again'),
    BUSY: t('dangal.party.busy_try_again'),
    AUTH_REQUIRED: t('dangal.party.sign_in_to_play_with_friends'),
  };

  /** Server messages that are already plain, specific copy ("Need at least 4 players"). */
  const PASSTHROUGH = ['NEED_PLAYERS', 'TOO_MANY_PLAYERS', 'TEAMS_UNEVEN', t('dangal.party.pending'), t('dangal.party.removed'), t('dangal.party.blocked'), 'WORD_BLOCKED', 'TOO_FEW', 'BAD_TARGET', 'NOT_DRAWER', 'NO_QUESTIONS', 'TOO_EARLY', 'AGE_GATE', 'AGE_CONFIRM', 'INSUFFICIENT_CHIPS', 'NOT_SEATED', 'TOO_MANY', 'AI_OFF', 'CUSTOM_MISSING', 'BAD_THEME'];

  function roomErrorText(e) {
    const code = String((e && e.code) || '').toUpperCase();
    if (ROOM_ERROR_COPY[code]) return ROOM_ERROR_COPY[code];
    if (PASSTHROUGH.indexOf(code) >= 0 && e.message) return e.message;
    if (/^CLUE_/.test(code)) return null;
    return typeof navigator !== 'undefined' && navigator.onLine === false
      ? t('dangal.party.you_re_offline_reconnect_to_keep')
      : t('dangal.party.couldn_t_reach_the_room_try');
  }

  /**
   * A game room launched from a Party night: when the host heads back (room closed with hubDone),
   * the game screen folds away and the party screen underneath takes over. Otherwise pin a small
   * "Party night" pill to the game shell so the group can find its way back.
   */
  function hubBridge(game, code, pub) {
    const shell = openShells[game];
    if (pub.status === 'closed') {
      if (shell && !shell.closed) setTimeout(() => shell.close(), 0);
      if (window.PartyHub && typeof PartyHub.onGameClosed === 'function') PartyHub.onGameClosed(game, code, pub);
      return;
    }
    if (!shell || shell.closed || !shell.el) return;
    let pill = shell.el.querySelector('.pk-hubpill');
    const isHost = pub.host === myUid();
    const label = isHost ? '← Party night' : t('dangal.party.party_night');
    if (!pill) {
      pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'pk-hubpill';
      pill.addEventListener('click', () => {
        if (window.PartyHub && typeof PartyHub.openFromGame === 'function') PartyHub.openFromGame(pill.dataset.hub, pill.dataset.host === '1');
      });
      shell.el.appendChild(pill);
    }
    pill.dataset.hub = String(pub.hub);
    pill.dataset.host = isHost ? '1' : '0';
    pill.textContent = label;
    pill.setAttribute('aria-label', isHost ? t('dangal.party.back_to_the_party_pick_the') : t('dangal.party.party_night_scoreboard'));
  }

  /**
   * Live room connection: shared pub + my secret + presence heartbeat + deadline ticks.
   * @param {string} game
   * @param {string} code
   * @param {{ onPub: (pub: object|null) => void, onSecret: (secret: object|null) => void, onPresence?: (p: object) => void }} handlers
   */
  function connectRoom(game, code, handlers, opts) {
    const o = opts || {};
    const uid = myUid();
    const base = 'games/' + game + '/' + code;
    const ref = typeof rtdb !== 'undefined' && rtdb ? rtdb.ref(base) : null;
    if (!ref || !uid) return null;
    let pub = null;
    let offset = 0;
    let infoOffset = null;
    let pubOffset = null;
    let lastTick = 0;
    let stopped = false;
    const pubRef = ref.child('pub');
    const secretRef = ref.child('secrets/' + uid);
    const presenceRef = ref.child('presence');
    const myPresence = presenceRef.child(uid);
    // Cached data can fire listeners synchronously, before the caller has this connection object.
    let ready = false;
    const queued = [];
    const later = (fn) => (arg) => {
      if (stopped) return;
      if (ready) fn(arg);
      else queued.push(() => fn(arg));
    };

    // pub.serverNow is stamped at the last write, so a cached snapshot can be stale; stale values only
    // under-estimate the offset, so keep the largest. Firebase's own offset wins when available.
    const syncOffset = () => {
      if (infoOffset != null) offset = infoOffset;
      else {
        const known = [pubOffset, callOffset].filter((v) => v != null);
        offset = known.length ? Math.max.apply(null, known) : 0;
      }
    };
    const onPub = later((snap) => {
      pub = snap.val();
      if (pub && pub.serverNow) {
        const o = pub.serverNow - Date.now();
        if (pubOffset == null || o > pubOffset) pubOffset = o;
      }
      syncOffset();
      handlers.onPub(pub);
      if (pub && pub.hub) hubBridge(game, code, pub);
    });
    const infoRef = rtdb.ref('.info/serverTimeOffset');
    const onInfo = (snap) => {
      const v = snap && snap.val();
      if (typeof v === 'number' && isFinite(v)) offset = infoOffset = v;
    };
    try {
      infoRef.on('value', onInfo, () => {});
    } catch (e) {}
    const onPubErr = later(() => handlers.onPub(null));
    const onSecret = later((snap) => handlers.onSecret(snap.val()));
    const onPresence = later((snap) => handlers.onPresence && handlers.onPresence(snap.val() || {}));
    pubRef.on('value', onPub, onPubErr);
    secretRef.on('value', onSecret, later(() => handlers.onSecret(null)));
    // Big rooms skip everyone else's heartbeats (100 phones × a beat each is a lot of downstream).
    if (o.presence !== false) presenceRef.on('value', onPresence, () => {});

    const serverNow = () => Date.now() + offset;
    const beat = (online) => {
      if (stopped) return;
      myPresence.set({ at: serverNow(), online: online !== false }).catch(() => {});
    };
    const armDisconnect = () => {
      try {
        myPresence.onDisconnect().set({ at: firebase.database.ServerValue.TIMESTAMP, online: false });
      } catch (e) {
        try {
          myPresence.onDisconnect().set({ at: Date.now(), online: false });
        } catch (err) {}
      }
    };
    armDisconnect();
    // RTDB drops an onDisconnect once it fires: re-arm after every reconnect or a later app kill goes unseen.
    const connRef = rtdb.ref('.info/connected');
    let wasConnected = null;
    const onConn = (snap) => {
      const up = !!(snap && snap.val());
      if (up && wasConnected === false && !stopped) {
        armDisconnect();
        beat();
      }
      wasConnected = up;
    };
    try {
      connRef.on('value', onConn, () => {});
    } catch (e) {}
    beat();
    const hb = setInterval(beat, PRESENCE_MS);
    const maybeTick = (force) => {
      // A lobby with a deadline is a public table counting down to its own start.
      if (stopped || !pub || (pub.status !== 'playing' && !(pub.status === 'lobby' && pub.deadline))) return;
      const now = Date.now();
      if (now - lastTick < TICK_MIN_GAP_MS) return;
      const role = window.DangalLivePolicy && window.DangalLivePolicy.tickRole ? window.DangalLivePolicy.tickRole(pub, uid) : { lead: true, delayMs: 0 };
      if (force && !role.lead) return;
      const due = pub.deadline && !pub.paused && serverNow() >= pub.deadline + role.delayMs;
      if (!due && !force) return;
      lastTick = now;
      // Small jitter so every phone doesn't hit the server in the same millisecond.
      setTimeout(() => roomCall(game, 'tick', { code }).catch(() => {}), Math.floor(Math.random() * 600));
    };
    const ticker = setInterval(() => maybeTick(false), 1000);
    // Slow nudge so dropped players' turns are skipped and a missing host is replaced.
    const nudge = setInterval(() => maybeTick(true), 15000);
    // Backgrounded phone = soft disconnect: the seat is kept until heartbeats go quiet.
    const onVis = () => {
      if (document.visibilityState === 'visible') beat(true);
    };
    document.addEventListener('visibilitychange', onVis);
    setTimeout(() => {
      ready = true;
      queued.splice(0).forEach((fn) => fn());
    }, 0);

    return {
      code,
      game,
      uid,
      get pub() {
        return pub;
      },
      serverNow,
      /** Deadline expressed in local clock terms (for countdown()). */
      localDeadline() {
        return pub && pub.deadline ? pub.deadline - offset : null;
      },
      op(name, args) {
        return roomCall(game, name, Object.assign({ code }, args || {}));
      },
      stop() {
        if (stopped) return;
        stopped = true;
        clearInterval(hb);
        clearInterval(ticker);
        clearInterval(nudge);
        document.removeEventListener('visibilitychange', onVis);
        pubRef.off('value', onPub);
        secretRef.off('value', onSecret);
        presenceRef.off('value', onPresence);
        try {
          infoRef.off('value', onInfo);
          connRef.off('value', onConn);
        } catch (e) {}
        myPresence.set({ at: Date.now(), online: false }).catch(() => {});
        try {
          myPresence.onDisconnect().cancel();
        } catch (e) {}
      },
    };
  }

  function isOnline(presence, uid, now) {
    const p = presence && presence[uid];
    if (!p || p.online === false) return false;
    return (now || Date.now()) - (Number(p.at) || 0) < (LIVE_POLICY ? LIVE_POLICY.reconnectMs : 45000);
  }

  function roomLink(game, code) {
    const path = '/party/' + encodeURIComponent(game + '-' + code);
    const base = location.origin + path;
    return typeof withReferralParam === 'function' ? withReferralParam(base) : base;
  }

  function shareRoom(game, code, label) {
    const url = roomLink(game, code);
    const text = t('dangal.party.join_my_label_room_on_chaupaal', { label, code });
    if (typeof openUnifiedShareSheet === 'function') {
      openUnifiedShareSheet({
        gameId: game,
        title: t('dangal.party.invite_to_label', { label }),
        subtitle: t('dangal.party.room_code_code', { code }),
        story: false,
        stats: typeof buildShareStats === 'function'
          ? buildShareStats({ scoreLine: t('dangal.party.room_code_3', { code }), meta: label, text, url })
          : { scoreLine: t('dangal.party.room_code_3', { code }), meta: label, text, url },
      });
      return;
    }
    if (navigator.share) {
      navigator.share({ title: label, text, url }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text + '\n' + url).then(() => toast(t('common.link_copied')));
    }
  }

  /** Post a `party_invite` card into a Baithak chat. */
  async function postInviteToChat(chatOrId, game, code, label) {
    const chat = typeof chatOrId === 'object' ? chatOrId : null;
    const chatId = chat ? chat.firestoreId || chat.id : chatOrId;
    if (!chatId || typeof sendRealtimeMessage !== 'function') return false;
    const isGroup = !!(chat && (chat.type === 'group' || chat.isGroup));
    const who = myName() || t('dangal.party.a_friend');
    try {
      await sendRealtimeMessage(chatId, t('dangal.party.who_started_label_tap_to_join', { who, label }), isGroup, null, {
        type: 'party_invite',
        game,
        code,
        label,
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  async function inviteFriends(game, code, label) {
    if (typeof openFriendPickerSheet !== 'function') {
      shareRoom(game, code, label);
      return;
    }
    const friend = await openFriendPickerSheet({ title: t('dangal.party.invite_to_label', { label }), subtitle: t('dangal.party.they_ll_get_a_join_card') });
    if (!friend) return;
    const chatId = friend.chatId || friend.firestoreId || '';
    if (chatId && (await postInviteToChat({ id: chatId, type: 'dm' }, game, code, label))) {
      toast(t('dangal.party.invite_sent_to_value', { value: friend.name || t('dangal.party.your_friend') }));
      return;
    }
    const peer = friend.uid || friend.id;
    if (peer && typeof openPeerDm === 'function') {
      try {
        await openPeerDm({ uid: peer, origin: 'party_invite', seedHello: false });
        const open = window.currentOpenChat;
        if (open && (await postInviteToChat(open, game, code, label))) {
          toast(t('dangal.party.invite_sent'));
          return;
        }
      } catch (e) {}
    }
    shareRoom(game, code, label);
  }

  /** Chat card for a `party_invite` attachment. */
  function inviteCardHtml(att, m) {
    const game = String(att.game || 'imposter');
    const code = String(att.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    const label = att.label || (typeof gameDisplayName === 'function' ? gameDisplayName(game) : t('dangal.party.party_game'));
    const mark = typeof gameMarkHtml === 'function' ? gameMarkHtml(game, { size: 30 }) : '🎉';
    return `<div class="party-invite-card">
      <div class="party-invite-head">${mark}<div><strong>${esc(label)}</strong><span>${tHtml('dangal.party.party_room_code', { code })}</span></div></div>
      <div class="party-invite-text">${esc((m && m.text) || t('dangal.party.join_the_game'))}</div>
      <button type="button" class="party-invite-join" data-party-invite-join="${esc(code)}" data-party-game="${esc(game)}">${tHtml('dangal.party.join_game')}</button>
    </div>`;
  }

  /** /party link, chat card, or typed code → the game's room screen. */
  function joinFromLink(game, code, opts) {
    const g = games[game];
    const clean = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!g || typeof g.openRoom !== 'function') {
      if (typeof openRetiredGameScreen === 'function' && typeof isRetiredGameId === 'function' && isRetiredGameId(game)) {
        openRetiredGameScreen(game);
      } else toast(t('dangal.party.that_game_isn_t_available'));
      return;
    }
    if (!isSignedIn()) {
      toast(t('dangal.party.sign_in_to_join_your_friends'));
      if (typeof openAuthSheet === 'function') openAuthSheet('login');
      return;
    }
    g.openRoom(clean, Object.assign({ join: true }, opts || {}));
  }

  // ---------------- lazy game data (packs + cores stay off first paint) ----------------

  /** index.html lists these as <script type="text/x-lazy" data-party-lazy> so bust-assets stamps them. */
  const LAZY_DATA = {
    partyhub: ['games/party-hub-core.js'],
    imposter: ['data/imposter-packs.js', 'games/imposter-core.js'],
    rajamantri: ['games/rajamantri-core.js'],
    charades: ['data/charades-packs.js', 'games/charades-core.js'],
    mostlikely: ['data/mostlikely-packs.js', 'games/mostlikely-core.js'],
    werewolf: ['games/werewolf-core.js'],
    penalty: ['games/penalty-core.js'],
    streetcricket: ['games/cricket-model.js', 'games/cricket-engine.js', 'games/cricket-commentary.js', 'games/cricket-scene.js'],
    badminton: ['games/badminton-engine.js', 'games/badminton-rally.js', 'games/badminton-match.js'],
    poker: ['games/poker-core.js'],
    ludo: ['games/ludo-core.js'],
    snakes: ['games/snakes-core.js'],
    ttt: ['games/ttt-core.js'],
    uno: ['games/ohno-core.js'],
    scribble: ['games/scribble-core.js'],
    quizroom: ['games/quiz-core.js'],
    carrom: ['games/carrom-physics.js', 'games/carrom-core.js'],
    rummy: ['games/rummy-core.js'],
    teenpatti: ['games/teenpatti-core.js'],
    bluff: ['games/bluff-core.js'],
    tambola: ['games/tambola-core.js'],
    ankjod: ['games/kakuro-core.js', 'games/data/kakuro-bank.js'],
    tiptap: ['games/tiptap-levels.js'],
    wordguess: ['games/data/shabd-answers.js', 'games/data/shabd-allowed.js', 'games/data/shabd-gloss.js', 'games/shabd-lexicon.js'],
  };
  const lazyLoaded = {};
  const lazyLoading = {};

  function lazyUrl(rel) {
    const tag = document.querySelector(`script[data-party-lazy][src*="/src/js/${rel}"]`);
    return (tag && tag.getAttribute('src')) || '/src/js/' + rel;
  }

  function loadLazyScript(rel) {
    if (lazyLoaded[rel]) return Promise.resolve();
    if (!lazyLoading[rel]) {
      lazyLoading[rel] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = lazyUrl(rel);
        s.async = false;
        s.onload = () => {
          lazyLoaded[rel] = true;
          resolve();
        };
        s.onerror = () => {
          delete lazyLoading[rel];
          s.remove();
          reject(new Error('lazy_load_failed'));
        };
        document.head.appendChild(s);
      });
    }
    return lazyLoading[rel];
  }

  const CL = () => window.DangalContentLocales || null;
  /** Content language of the room screen that is open ('' outside rooms → my UI language). */
  let activeRoomLang = '';
  const roomContentLang = () => activeRoomLang || uiContentLang();
  function uiContentLang() {
    return CL() ? CL().contentBase(typeof currentLang !== 'undefined' ? currentLang : 'en') : 'en';
  }

  /** Locale overlays (data/locales/<lang>/…) for a game's content, after its packs. */
  function overlayFiles(game, langs) {
    return CL() ? CL().overlaysFor(game, langs) : [];
  }

  function gameDataReady(game) {
    return (LAZY_DATA[game] || []).concat(overlayFiles(game, [uiContentLang()])).every((rel) => lazyLoaded[rel]);
  }

  /** Load one content language for a game (room content language ≠ my UI language). */
  function ensureContentLocale(game, lang) {
    const files = overlayFiles(game, [lang]).filter((rel) => !lazyLoaded[rel]);
    if (!files.length) return Promise.resolve();
    return files
      .reduce((p, rel) => p.then(() => loadLazyScript(rel)), Promise.resolve())
      .then(() => CL() && CL().drain())
      .catch(() => {});
  }

  function ensureGameData(game) {
    return (LAZY_DATA[game] || [])
      .reduce((p, rel) => p.then(() => loadLazyScript(rel)), Promise.resolve())
      .then(() => ensureContentLocale(game, uiContentLang()));
  }

  /** Wrap a game entry point so its packs/core load first (sync when already loaded). */
  function withGameData(game, fn) {
    return function () {
      const args = arguments;
      if (gameDataReady(game)) return fn.apply(this, args);
      return ensureGameData(game).then(
        () => fn.apply(this, args),
        () => toast(t('dangal.party.couldn_t_load_the_game_check'))
      );
    };
  }

  // Warm every party title once the app is idle, so a later airplane-mode Pass & Play still opens.
  function prefetchGameData() {
    Object.keys(LAZY_DATA).reduce((p, game) => p.then(() => ensureGameData(game)).catch(() => {}), Promise.resolve());
  }
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const idle = () => (window.requestIdleCallback ? requestIdleCallback(prefetchGameData, { timeout: 8000 }) : setTimeout(prefetchGameData, 1500));
    if (document.readyState === 'complete') setTimeout(idle, 3000);
    else window.addEventListener('load', () => setTimeout(idle, 3000), { once: true });
  }

  /** Party titles register a room opener so links and chat cards can route to them. */
  function registerPartyGame(game, spec) {
    const s = Object.assign({}, spec || {});
    if (typeof s.openRoom === 'function') s.openRoom = withGameData(game, s.openRoom);
    games[game] = s;
  }

  // ---------------- settings controls ----------------

  /** Segmented control HTML. Pair with wireSegs(). */
  function segHtml(name, value, options) {
    return `<div class="pk-seg" role="radiogroup" data-seg="${esc(name)}">${options
      .map(([v, label]) => {
        const on = String(v) === String(value);
        return `<button type="button" role="radio" aria-checked="${on}" class="pk-seg-btn${on ? ' is-on' : ''}" data-v="${esc(v)}">${esc(label)}</button>`;
      })
      .join('')}</div>`;
  }

  /** Wire every [data-seg] in root into `state` (numbers stay numbers). onChange(key, value). */
  function wireSegs(root, state, onChange) {
    root.querySelectorAll('[data-seg]').forEach((grp) => {
      grp.querySelectorAll('.pk-seg-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          grp.querySelectorAll('.pk-seg-btn').forEach((b) => {
            b.classList.toggle('is-on', b === btn);
            b.setAttribute('aria-checked', String(b === btn));
          });
          const key = grp.dataset.seg;
          const raw = btn.dataset.v;
          const value = raw === 'true' ? true : raw === 'false' ? false : /^-?\d+$/.test(raw) ? Number(raw) : raw;
          state[key] = value;
          if (onChange) onChange(key, value);
        });
      });
    });
  }

  // ---------------- feedback ----------------

  /** The shared game Sounds / Vibration prefs (Classics prefs sheet); default on. */
  function feedbackPrefs() {
    try {
      if (window.ClassicsKit && typeof ClassicsKit.prefs === 'function') return ClassicsKit.prefs();
    } catch (e) {}
    return { sound: true, haptics: true };
  }

  /** Time-up buzzer + strong haptic (dangal-sound / dangal-haptic, Quiet mode respected). */
  function buzz() {
    const p = feedbackPrefs();
    try {
      if (p.sound && window.Sound) Sound.play('ui.lose');
      if (!p.haptics) return;
      if (window.Haptic) Haptic.heavy();
      else haptic('error');
    } catch (e) {}
  }

  /** Short success chime + light haptic. */
  function ding() {
    const p = feedbackPrefs();
    try {
      if (p.sound && window.Sound) Sound.play('ui.check');
      if (p.haptics && window.Haptic) Haptic.medium();
    } catch (e) {}
  }

  /** Hold-to-peek on a button: getHtml() is injected below it only while held. */
  function mountHoldPeek(btn, getHtml, opts) {
    if (!btn) return;
    const cls = (opts && opts.className) || 'pk-peek-card';
    let tip = null;
    const show = (e) => {
      if (e && e.cancelable) e.preventDefault();
      if (tip) return;
      tip = document.createElement('div');
      tip.className = cls;
      tip.innerHTML = getHtml();
      btn.after(tip);
    };
    const hide = () => {
      if (tip) tip.remove();
      tip = null;
    };
    btn.addEventListener('pointerdown', show);
    btn.addEventListener('pointerup', hide);
    btn.addEventListener('pointerleave', hide);
    btn.addEventListener('pointercancel', hide);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    coverWhenAway(btn, hide);
  }

  /**
   * Big animated announcement over the game (Raja reveal, turn start, time up). Tap or wait to dismiss.
   * @param {{ icon?: string, title: string, sub?: string, quote?: string, ms?: number, host?: HTMLElement }} o
   * @returns {Promise<void>}
   */
  function bigReveal(o) {
    return new Promise((resolve) => {
      const host = o.host || document.querySelector('.pk-shell') || document.body;
      host.querySelector('.pk-reveal')?.remove();
      const el = document.createElement('div');
      el.className = 'pk-reveal';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'assertive');
      el.innerHTML = `<div class="pk-reveal-inner">
        ${o.icon ? `<div class="pk-reveal-icon" aria-hidden="true">${esc(o.icon)}</div>` : ''}
        <div class="pk-reveal-title">${esc(o.title)}</div>
        ${o.sub ? `<div class="pk-reveal-sub">${esc(o.sub)}</div>` : ''}
        ${o.quote ? `<div class="pk-reveal-quote">“${esc(o.quote)}”</div>` : ''}
      </div>`;
      host.appendChild(el);
      haptic('select');
      let done = false;
      const close = () => {
        if (done) return;
        done = true;
        el.classList.add('is-out');
        setTimeout(() => el.remove(), 220);
        resolve();
      };
      el.addEventListener('click', close);
      setTimeout(close, o.ms || 2000);
    });
  }

  // ---------------- team editor (Pass & Play) ----------------

  /**
   * Two editable team columns. Blank names become "Player N"; duplicates get a suffix.
   * @param {HTMLElement} root
   * @param {{ teams: string[][], teamNames: string[], minPerTeam: number, max: number, onChange?: Function }} opts
   */
  function mountTeamEditor(root, opts) {
    const o = opts || {};
    const minPer = o.minPerTeam || 2;
    const max = o.max || 16;
    const teams = [(o.teams && o.teams[0]) || [], (o.teams && o.teams[1]) || []].map((t) => t.slice());
    teams.forEach((t) => {
      while (t.length < minPer) t.push('');
    });
    const total = () => teams[0].length + teams[1].length;
    const paint = () => {
      root.innerHTML = `<div class="pk-teams">${teams
        .map(
          (_t, ti) => `<div class="pk-team pk-team--${ti}">
            <div class="pk-team-name">${esc((o.teamNames || [])[ti] || (ti ? t('dangal.party.team_b') : t('dangal.party.team_a')))}</div>
            ${_t
              .map(
                (n, i) => `<div class="pk-player-row">
                <input class="pk-player-input" data-pk-t="${ti}" data-pk-i="${i}" maxlength="20" value="${esc(n)}" placeholder="${tHtml('dangal.party.player')}" autocomplete="off" aria-label="${ti ? tHtml('dangal.party.team_b') : tHtml('dangal.party.team_a')} player ${i + 1}">
                ${_t.length > minPer ? `<button type="button" class="pk-player-remove" data-pk-rm="${ti}:${i}" aria-label="${tHtml('common.remove')}">✕</button>` : ''}
              </div>`
              )
              .join('')}
            ${total() < max ? `<button type="button" class="pk-add-player" data-pk-addt="${ti}">${tHtml('dangal.party.add')}</button>` : ''}
          </div>`
        )
        .join('')}</div>
        <button type="button" class="pk-chip pk-teams-shuffle" data-pk-shuffle>${tHtml('dangal.party.shuffle_teams')}</button>`;
      root.querySelectorAll('[data-pk-t]').forEach((inp) =>
        inp.addEventListener('input', () => {
          teams[Number(inp.dataset.pkT)][Number(inp.dataset.pkI)] = inp.value;
          if (o.onChange) o.onChange();
        })
      );
      root.querySelectorAll('[data-pk-rm]').forEach((btn) =>
        btn.addEventListener('click', () => {
          const [ti, i] = btn.dataset.pkRm.split(':').map(Number);
          teams[ti].splice(i, 1);
          paint();
          if (o.onChange) o.onChange();
        })
      );
      root.querySelectorAll('[data-pk-addt]').forEach((btn) =>
        btn.addEventListener('click', () => {
          const ti = Number(btn.dataset.pkAddt);
          teams[ti].push('');
          paint();
          const inputs = root.querySelectorAll(`[data-pk-t="${ti}"]`);
          inputs[inputs.length - 1]?.focus();
          if (o.onChange) o.onChange();
        })
      );
      root.querySelector('[data-pk-shuffle]').addEventListener('click', () => {
        const all = teams[0].concat(teams[1]);
        for (let i = all.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [all[i], all[j]] = [all[j], all[i]];
        }
        teams[0] = [];
        teams[1] = [];
        all.forEach((n, i) => teams[i % 2].push(n));
        paint();
        if (o.onChange) o.onChange();
      });
    };
    const list = () => {
      const seen = {};
      let n = 0;
      return teams.map((_t) =>
        _t.map((name) => {
          n += 1;
          let v = String(name || '').trim().slice(0, 20) || t('dangal.party.player_n', { n });
          const k = v.toLowerCase();
          if (seen[k]) v = v + ' ' + (seen[k] + 1);
          seen[k] = (seen[k] || 0) + 1;
          return v;
        })
      );
    };
    paint();
    return { list, count: total, sizes: () => [teams[0].length, teams[1].length] };
  }

  // ---------------- Room screen (shared by party titles) ----------------

  function requireSignIn() {
    if (isSignedIn()) return true;
    toast(t('dangal.party.sign_in_to_play_on_separate'));
    if (typeof openAuthSheet === 'function') openAuthSheet('login');
    return false;
  }

  /** Create a room (posting a join card into `chat` when started from a group) then open it. */
  async function createRoom(o) {
    if (!requireSignIn()) return;
    if (navigator.onLine === false) {
      toast(t('dangal.party.you_re_offline_pass_play_works'));
      return;
    }
    try {
      const chatId = o.chat ? o.chat.firestoreId || o.chat.id : '';
      const res = await roomCall(o.game, 'create', {
        name: myName() || t('dangal.party.host'),
        settings: Object.assign({ contentLang: uiContentLang() }, o.settings || {}),
        chatId: chatId && chatId !== 'ai' ? chatId : '',
      });
      if (o.chat && chatId && chatId !== 'ai') {
        if (await postInviteToChat(o.chat, o.game, res.code, o.label)) toast(t('dangal.party.invite_posted_in_the_chat'));
      }
      o.open(res.code, { host: true });
    } catch (e) {
      toast(roomErrorText(e) || t('dangal.party.couldn_t_create_a_room'));
    }
  }

  function openJoinSheet(onCode) {
    if (!requireSignIn()) return;
    openSheet({
      title: t('dangal.party.join_a_room'),
      bodyHtml: `<input class="pk-input pk-input--code" data-code maxlength="6" placeholder="${tHtml('dangal.party.room_code')}" autocapitalize="characters" autocomplete="off" enterkeyhint="go" aria-label="${tHtml('dangal.party.room_code_2')}">
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-join>${tHtml('dangal.party.join')}</button>`,
      onMount(sheet, close) {
        const input = sheet.querySelector('[data-code]');
        setTimeout(() => input.focus(), 50);
        const go = () => {
          const code = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
          if (code.length !== 6) return toast(t('dangal.party.room_codes_are_6_letters_and'));
          close();
          onCode(code);
        };
        input.addEventListener('input', () => (input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '')));
        input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
        sheet.querySelector('[data-join]').addEventListener('click', go);
      },
    });
  }

  /**
   * Full room screen: join, live pub/secret/presence, lobby, pending, closed/left states, host pause,
   * server-driven timer, keep-typing across re-renders. The game only renders its round phases.
   * @param {{
   *   game: string, label: string, code: string, join?: boolean, min: number, max: number,
   *   hydrate: (state: object) => object,
   *   lobbySummary: (ctrl) => string, openSettings?: (ctrl) => void,
   *   lobbyListHtml?: (ctrl, players) => string, onLobbyMount?: (ctrl, body) => void,
 *   canStart?: (ctrl, players) => { ok: boolean, label: string },
 *   renderPhase: (ctrl, st) => void, onState?: (ctrl, st, prev) => void,
 *   renderPending?: (ctrl, st) => void,
 * }} spec
   */
  async function openRoomScreen(spec) {
    if (!requireSignIn()) return null;
    const code = spec.code;
    if (spec.join) {
      try {
        const res = await roomCall(spec.game, 'join', { code, name: myName() || t('dangal.party.player') });
        if (res.pending) toast(t('dangal.party.round_in_progress_you_ll_be'));
      } catch (e) {
        toast(roomErrorText(e) || t('dangal.party.couldn_t_join_that_room'));
        return null;
      }
    }
    const view = { code, pub: null, secret: null, presence: {}, key: '', busy: false, prevState: null };
    const ctrl = { spec, view, conn: null, shell: null };
    ctrl.uid = myUid();
    ctrl.name = (id) => {
      const p = view.pub && view.pub.players && view.pub.players[id];
      return p ? p.name : t('dangal.party.player');
    };
    ctrl.players = () => {
      const players = (view.pub && view.pub.players) || {};
      return Object.keys(players)
        .sort((a, b) => (players[a].seat || 0) - (players[b].seat || 0))
        .map((id) => Object.assign({ id }, players[id]))
        .filter((p) => !p.left);
    };
    ctrl.isHost = () => !!(view.pub && view.pub.host === ctrl.uid);
    ctrl.act = async (op, args, errEl) => {
      if (view.busy) return null;
      view.busy = true;
      try {
        const out = await ctrl.conn.op(op, args);
        if (errEl) errEl.textContent = '';
        return out || {};
      } catch (e) {
        const msg = spec.errorText ? spec.errorText(e) : roomErrorText(e);
        if (errEl) errEl.textContent = msg || '';
        else if (msg) toast(msg);
        return null;
      } finally {
        view.busy = false;
      }
    };
    ctrl.leave = async () => {
      await ctrl.act('leave');
      ctrl.shell.close();
    };
    ctrl.hostBar = (timed) => {
      if (!ctrl.isHost() || !timed) return '';
      return hostBarHtml(view.pub);
    };
    ctrl.pausedNote = () => (view.pub && view.pub.paused ? '<div class="pk-paused">' + tHtml('dangal.party.paused_by_the_host') + '</div>' : '');
    ctrl.wire = (body) => {
      body.querySelectorAll('[data-host]').forEach((btn) => btn.addEventListener('click', () => ctrl.act(btn.dataset.host)));
      const el = body.querySelector('[data-timer]');
      if (el) {
        if (!view.pub.deadline && !view.pub.paused) el.hidden = true;
        else
          ctrl.timer = countdown(el, {
            getEndsAt: () => ctrl.conn.localDeadline(),
            getPausedMs: () => (view.pub && view.pub.paused ? Number(view.pub.paused.remaining) || 0 : null),
            onDone: spec.onTimerDone ? () => spec.onTimerDone(ctrl) : null,
          });
      }
    };
    ctrl.render = (html) => ctrl.shell.render(html);

    ctrl.shell = openShell({
      gameId: spec.game,
      title: spec.label,
      subtitle: t('dangal.party.room_code_3', { code }),
      confirmLeave: () => !!(view.pub && view.pub.status === 'playing'),
      leaveBody: t('dangal.party.you_can_rejoin_from_the_invite'),
      onClose: () => {
        activeRoomLang = '';
        if (ctrl.conn) ctrl.conn.stop();
      },
    });
    ctrl.conn = connectRoom(spec.game, code, {
      onPub: (pub) => {
        view.pub = pub;
        const cl = pub && pub.settings && pub.settings.contentLang;
        activeRoomLang = cl || '';
        if (cl && cl !== uiContentLang()) ensureContentLocale(spec.game, cl).then(() => view.pub === pub && paint());
        paint();
      },
      onSecret: (secret) => {
        view.secret = secret;
        paint();
      },
      onPresence: (p) => {
        view.presence = p;
        paintPresence();
      },
    }, { presence: spec.presence !== false });
    if (!ctrl.conn) {
      ctrl.shell.render('<div class="pk-empty">' + tHtml('dangal.party.can_t_reach_the_game_server') + '</div>');
      return ctrl;
    }
    ctrl.shell.render('<div class="pk-empty">' + tHtml('dangal.party.joining_room') + '</div>');

    function paintPresence() {
      ctrl.shell.el.querySelectorAll('[data-presence]').forEach((dot) => {
        dot.classList.toggle('is-online', isOnline(view.presence, dot.dataset.presence));
      });
    }

    function message(text, label) {
      ctrl.shell
        .render(`<div class="pk-empty">${esc(text)}<button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-close>${esc(label)}</button></div>`)
        ?.querySelector('[data-close]')
        ?.addEventListener('click', () => ctrl.shell.close());
    }

    function paint() {
      if (ctrl.shell.closed) return;
      const pub = view.pub;
      if (!pub) return message(t('dangal.party.this_room_isn_t_available_any'), t('dangal.party.back_to_games'));
      if (pub.status === 'closed' && pub.hub) return message(t('dangal.party.back_to_the_party_2'), t('common.done'));
      if (pub.status === 'closed') return message(t('dangal.party.the_host_closed_this_room'), t('common.done'));
      if (!pub.players || !pub.players[ctrl.uid] || pub.players[ctrl.uid].left) return message(t('dangal.party.you_re_no_longer_in_this_2'), t('common.done'));
      const st = pub.status === 'playing' && pub.state ? spec.hydrate(pub.state) : null;
      const key = JSON.stringify([
        pub.status, pub.roundNo, pub.host, !!pub.paused, pub.over, pub.players, pub.scores, pub.seen,
        pub.settings, pub.teamPick || null, pub.state || null, view.secret, pub.settlement || null,
        pub.extended || null, pub.narration || null, pub.hub || null,
      ]);
      if (key === view.key) return;
      view.key = key;
      if (spec.onState && st) spec.onState(ctrl, st, view.prevState);
      view.prevState = st ? JSON.parse(JSON.stringify(st)) : null;
      // A private reveal (my card on screen) stays put while other players' progress ticks by.
      const hold = st && !pub.players[ctrl.uid].pending && spec.holdKey ? spec.holdKey(ctrl, st) : null;
      if (hold && hold === view.holdKey) return;
      view.holdKey = hold;
      if (ctrl.timer) ctrl.timer.stop();
      ctrl.timer = null;
      const typing = ctrl.shell.el.querySelector('[data-keep]');
      const kept = typing ? { name: typing.dataset.keep, value: typing.value, focus: document.activeElement === typing } : null;
      if (pub.status === 'lobby' || !st) renderLobby();
      else if (pub.players[ctrl.uid].pending) renderPending(st);
      else {
        ctrl.shell.setSubtitle(t('dangal.party.room_code_3', { code }));
        spec.renderPhase(ctrl, st);
      }
      if (kept) {
        const again = ctrl.shell.el.querySelector('[data-keep="' + kept.name + '"]');
        if (again) {
          again.value = kept.value;
          if (kept.focus) again.focus();
        }
      }
      paintPresence();
    }

    function renderLobby() {
      const pub = view.pub;
      const isHost = ctrl.isHost();
      const players = ctrl.players();
      const start = spec.canStart
        ? spec.canStart(ctrl, players)
        : players.length < spec.min
          ? { ok: false, label: t('dangal.party.need_value_more_to_start', { value: spec.min - players.length }) }
          : { ok: true, label: t('dangal.party.start') };
      const list =
        (spec.lobbyListHtml && spec.lobbyListHtml(ctrl, players)) ||
        `<div class="pk-lobby-list">${players
          .map(
            (p, i) => `<div class="pk-lobby-row"><span class="pk-dot" data-presence="${esc(p.id)}"></span>${identityHtml(i, p.name)}<span>${esc(p.name)}</span>${
              p.id === pub.host ? '<span class="pk-badge">' + tHtml('dangal.party.host') + '</span>' : ''
            }${p.id === ctrl.uid ? '<span class="pk-badge pk-badge--me">' + tHtml('common.you') + '</span>' : ''}</div>`
          )
          .join('')}</div>`;
      const body = ctrl.shell.render(`<div class="pk-page pk-lobby">
        <div class="pk-code-label">${tHtml('dangal.party.room_code_2')}</div>
        <div class="pk-code" aria-label="${tHtml('dangal.room_code_value', { code })}">${esc(code)}</div>
        <div class="pk-row">
          <button type="button" class="pk-btn pk-btn--ghost" data-share>${tHtml('dangal.party.share_link')}</button>
          <button type="button" class="pk-btn pk-btn--ghost" data-invite>${tHtml('dangal.party.invite_friends')}</button>
        </div>
        <div class="pk-section">${tHtml('dangal.party.in_the_room_playerscount_value', { playersCount: players.length, value: spec.max })}</div>
        ${list}
        <button type="button" class="pk-row-btn" data-settings ${isHost && spec.openSettings ? '' : 'disabled'}>
          ${esc(spec.lobbySummary(ctrl))}${isHost && spec.openSettings ? '<span class="pk-chev" aria-hidden="true">›</span>' : ''}
        </button>
        ${contentLangRowHtml(spec.game, pub.settings, isHost)}
        ${
          isHost
            ? `<button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-start ${start.ok ? '' : 'disabled'}>${esc(start.label)}</button>`
            : '<div class="pk-wait">' + tHtml('dangal.party.waiting_for_the_host_to_start') + '</div>'
        }
        <button type="button" class="pk-link" data-leave>${tHtml('dangal.party.leave_room')}</button>
      </div>`);
      body.querySelector('[data-share]').addEventListener('click', () => shareRoom(spec.game, code, spec.label));
      body.querySelector('[data-invite]').addEventListener('click', () => inviteFriends(spec.game, code, spec.label));
      body.querySelector('[data-leave]').addEventListener('click', ctrl.leave);
      if (isHost && spec.openSettings) body.querySelector('[data-settings]').addEventListener('click', () => spec.openSettings(ctrl));
      body.querySelector('[data-content-lang]')?.addEventListener('click', () => isHost && pickContentLang(spec.game, pub.settings, (next) => ctrl.act('settings', { settings: { contentLang: next } })));
      body.querySelector('[data-start]')?.addEventListener('click', () => startWith('start', spec.startArgs));
      if (spec.onLobbyMount) spec.onLobbyMount(ctrl, body);
    }

    /** Start/next with optional per-deal args from the game (e.g. a host's session-only prompt). */
    async function startWith(op, argsFn) {
      const extra = typeof argsFn === 'function' ? argsFn(ctrl, op) : null;
      const out = await ctrl.act(op, extra ? extra.args : undefined);
      if (extra && typeof extra.onDone === 'function') extra.onDone(!!out);
      return out;
    }
    ctrl.startWith = startWith;

    function renderPending(st) {
      if (spec.renderPending) return spec.renderPending(ctrl, st);
      const body = ctrl.shell.render(`<div class="pk-page pk-empty">
        <div class="pk-title">${tHtml('dangal.party.round_in_progress')}</div>
        <div class="pk-sub">${tHtml('dangal.party.you_ll_be_dealt_in_when')}</div>
        <button type="button" class="pk-link" data-leave>${tHtml('dangal.party.leave_room')}</button>
      </div>`);
      body.querySelector('[data-leave]').addEventListener('click', ctrl.leave);
    }

    return ctrl;
  }

  function langName(code) {
    const e = typeof getLangEntry === 'function' ? getLangEntry(code) : null;
    return (e && e.native) || code;
  }

  /**
   * Small, honest availability note for a game's content in `lang` ('' when it is all there).
   * e.g. "Words in English" when a room / reader language has no translated pack yet.
   */
  function contentNoteHtml(game, lang) {
    if (!CL()) return '';
    const st = CL().status(game, lang);
    if (st.full) return '';
    return '<span class="pk-lang-note" data-content-note>' + tHtml('dangal.content.in_english', { lang: langName(st.lang) }) + '</span>';
  }

  /** Lobby row: the room content language (host picks; everyone else sees it). Only for word / title games. */
  function contentLangRowHtml(game, settings, isHost) {
    if (!CL() || !CL().hasRoomContent(game)) return '';
    const lang = CL().roomLang(settings);
    const label = tHtml('dangal.content.room_language', { lang: langName(lang) });
    return `<button type="button" class="pk-row-btn pk-row-btn--sub" data-content-lang ${isHost ? '' : 'disabled'} lang="${esc(lang)}">${label}${isHost ? '<span class="pk-chev" aria-hidden="true">›</span>' : ''}</button>${contentNoteHtml(game, lang)}`;
  }

  /** Host picks the room content language; `onPick(code)` saves it (room settings op). */
  function pickContentLang(game, settings, onPick) {
    const cur = CL().roomLang(settings);
    const choices = CL().roomChoices(game);
    openSheet({
      title: t('dangal.content.room_language_title'),
      bodyHtml: `<p class="pk-sub">${tHtml('dangal.content.room_language_sub')}</p><div class="pk-list">${choices
        .map((c) => `<button type="button" class="pk-row-btn${c === cur ? ' is-on' : ''}" data-pick-lang="${esc(c)}" aria-pressed="${c === cur}" lang="${esc(c)}">${esc(langName(c))}${contentNoteHtml(game, c)}</button>`)
        .join('')}</div>`,
      onMount(el, close) {
        el.querySelectorAll('[data-pick-lang]').forEach((b) =>
          b.addEventListener('click', async () => {
            close();
            const next = b.dataset.pickLang;
            await ensureContentLocale(game, next);
            onPick(next);
          })
        );
      },
    });
  }

  /** Shared result actions row for room games (host deals / ends, others invite / leave). */
  function roomResultActions(ctrl, o) {
    const isHost = ctrl.isHost();
    return `<div class="pk-result-actions">
      ${
        isHost
          ? `<button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-next>${esc(o.nextLabel || t('dangal.party.next_round'))}</button>`
          : `<div class="pk-wait">${esc(o.waitLabel || t('dangal.party.waiting_for_the_host'))}</div>`
      }
      <div class="pk-row">
        <button type="button" class="pk-btn pk-btn--ghost" data-share-result>${tHtml('common.share')}</button>
        ${isHost && ctrl.spec.openSettings ? '<button type="button" class="pk-btn pk-btn--ghost" data-room-settings>' + tHtml('common.settings') + '</button>' : '<button type="button" class="pk-btn pk-btn--ghost" data-invite>' + tHtml('common.invite') + '</button>'}
      </div>
      ${o.card ? badCardHtml(o.card) : ''}
      <button type="button" class="pk-link" data-end>${isHost ? (hubOf(ctrl) ? tHtml('dangal.party.back_to_the_party') : tHtml('dangal.party.end_room')) : tHtml('dangal.party.leave_room')}</button>
    </div>`;
  }

  function hubOf(ctrl) {
    return (ctrl.view && ctrl.view.pub && ctrl.view.pub.hub) || '';
  }

  /** Host leaving a party-night game goes back to the party (tallies placings) instead of ending the room. */
  async function endOrBack(ctrl) {
    const hub = hubOf(ctrl);
    if (hub && ctrl.isHost() && window.PartyHub && typeof PartyHub.backToHub === 'function') {
      const ok = await PartyHub.backToHub(hub);
      if (ok) return;
    }
    await ctrl.act(ctrl.isHost() ? 'end' : 'leave');
    ctrl.shell.close();
  }

  function wireRoomResultActions(ctrl, body, o) {
    body.querySelector('[data-next]')?.addEventListener('click', () => ctrl.startWith(o.nextOp || 'next', ctrl.spec.startArgs));
    body.querySelector('[data-share-result]')?.addEventListener('click', () => o.onShare && o.onShare());
    body.querySelector('[data-room-settings]')?.addEventListener('click', () => ctrl.spec.openSettings(ctrl));
    body.querySelector('[data-invite]')?.addEventListener('click', () => inviteFriends(ctrl.spec.game, ctrl.view.code, ctrl.spec.label));
    body.querySelector('[data-end]')?.addEventListener('click', () => endOrBack(ctrl));
    if (o.card) wireBadCard(body, o.card);
  }

  /** Host timer bar: Pause/Resume + "+30s" (server caps it per turn). */
  function hostBarHtml(pub) {
    if (!pub) return '';
    const used = pub.extended && pub.extended.key === String(pub.phaseKey || '') ? Number(pub.extended.n) || 0 : 0;
    return `<div class="pk-hostbar"><span>${tHtml('dangal.party.host')}</span>${
      pub.paused
        ? '<button type="button" class="pk-chip" data-host="resume">' + tHtml('common.shortcut_dangal_resume') + '</button>'
        : '<button type="button" class="pk-chip" data-host="pause">' + tHtml('dangal.party.pause') + '</button>'
    }${used < 3 ? '<button type="button" class="pk-chip" data-host="addTime" aria-label="' + tHtml('dangal.party.add_30_seconds') + '">+30s</button>' : ''}</div>`;
  }

  // ---------------- content quality: "Bad card" ----------------

  const FLAG_REASONS = [
    /* i18n-copy */ ['unclear', t('dangal.party.unclear')],
    /* i18n-copy */ ['too_hard', t('dangal.party.too_hard')],
    /* i18n-copy */ ['offensive', t('dangal.party.not_okay')],
    /* i18n-copy */ ['repeat', t('dangal.party.seen_it_too_often')],
    /* i18n-copy */ ['other', t('dangal.party.something_else')],
  ];
  const flaggedLocal = {};

  /** card = { game, key, label? } — built-in cards only; custom / AI cards have no key. */
  function badCardHtml(card) {
    if (!card || !card.key || !card.game || !isSignedIn()) return '';
    if (flaggedLocal[card.game + '|' + card.key]) return '<div class="pk-badcard is-done">' + tHtml('dangal.party.thanks_noted') + '</div>';
    return `<button type="button" class="pk-badcard" data-bad-card aria-label="${card.label ? tHtml('dangal.party.report_bad_card_label', { label: card.label }) : tHtml('dangal.party.report_bad_card')}">${tHtml('dangal.party.bad_card')}</button>`;
  }

  function wireBadCard(body, card) {
    const btn = body.querySelector('[data-bad-card]');
    if (!btn || !card || !card.key) return;
    btn.addEventListener('click', () => {
      openSheet({
        title: t('dangal.party.what_was_wrong_with_it'),
        bodyHtml: `<div class="pk-flag-reasons">${FLAG_REASONS.map(([v, l]) => `<button type="button" class="pk-btn pk-btn--ghost pk-btn--block" data-reason="${v}">${esc(l)}</button>`).join('')}</div>`,
        onMount: (el, close) => {
          el.querySelectorAll('[data-reason]').forEach((b) =>
            b.addEventListener('click', () => {
              close();
              flagCard(card, b.dataset.reason);
              btn.outerHTML = '<div class="pk-badcard is-done">' + tHtml('dangal.party.thanks_noted') + '</div>';
            })
          );
        },
      });
    });
  }

  function flagCard(card, reason) {
    flaggedLocal[card.game + '|' + card.key] = 1;
    return roomCall(card.game, 'card_flag', { key: card.key, locale: contentPrefs().lang, reason }).catch(() => {});
  }

  /** Retired built-in cards (server list, cached on the device for offline Pass & Play). */
  const RETIRED_TTL = 6 * 3600 * 1000;
  function retiredCached(game) {
    try {
      const raw = JSON.parse(localStorage.getItem('pk_retired_' + game) || 'null');
      return raw && Array.isArray(raw.keys) ? raw.keys : [];
    } catch (e) {
      return [];
    }
  }
  function refreshRetired(game) {
    let fresh = false;
    try {
      const raw = JSON.parse(localStorage.getItem('pk_retired_' + game) || 'null');
      fresh = raw && Date.now() - (Number(raw.at) || 0) < RETIRED_TTL;
    } catch (e) {}
    if (fresh || !isSignedIn() || (typeof navigator !== 'undefined' && navigator.onLine === false)) return Promise.resolve(retiredCached(game));
    return roomCall(game, 'card_retired', { locale: contentPrefs().lang })
      .then((d) => {
        const keys = Array.isArray(d.keys) ? d.keys : [];
        try {
          localStorage.setItem('pk_retired_' + game, JSON.stringify({ at: Date.now(), keys }));
        } catch (e) {}
        return keys;
      })
      .catch(() => retiredCached(game));
  }

  // ---------------- "Make a pack about…" (AI, optional) + device packs ----------------

  function aiOn() {
    try {
      return typeof isAiFeaturesEnabledSync === 'function' && !!isAiFeaturesEnabledSync();
    } catch (e) {
      return false;
    }
  }

  const PACKS_MAX = 6;
  function savedPacks(game) {
    try {
      const list = JSON.parse(localStorage.getItem('pk_packs_' + game) || '[]');
      return Array.isArray(list) ? list.filter((p) => p && p.name && p.items) : [];
    } catch (e) {
      return [];
    }
  }
  function savePack(game, pack) {
    const list = savedPacks(game).filter((p) => p.name !== pack.name);
    list.unshift({ name: pack.name, mode: pack.mode || '', items: pack.items, at: Date.now() });
    try {
      localStorage.setItem('pk_packs_' + game, JSON.stringify(list.slice(0, PACKS_MAX)));
    } catch (e) {}
  }
  function deletePack(game, name) {
    try {
      localStorage.setItem('pk_packs_' + game, JSON.stringify(savedPacks(game).filter((p) => p.name !== name)));
    } catch (e) {}
  }

  /** Items ↔ editable lines. pairs: "word — partner"; wyr: "A | B"; others: one per line. */
  function packToLines(kind, items) {
    return (items || [])
      .map((it) => {
        if (kind === 'pairs') return it && typeof it === 'object' ? (it.w || '') + ' — ' + (it.p || '') : String(it);
        if (it && typeof it === 'object' && 'a' in it) return (it.a || '') + ' | ' + (it.b || '');
        return String(it || '');
      })
      .join('\n');
  }
  function linesToPack(kind, text) {
    return String(text || '')
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        if (kind === 'pairs') {
          const m = l.split(/\s+-\s+|\s*[—–:,]\s*/);
          return m.length >= 2 && m[0] && m[1] ? { w: m[0].slice(0, 40), p: m[1].slice(0, 40) } : null;
        }
        if (kind === 'wyr') {
          const m = l.split(/\s*\|\s*/);
          return m.length >= 2 && m[0] && m[1] ? { a: m[0].slice(0, 120), b: m[1].slice(0, 120) } : null;
        }
        return l.slice(0, 120);
      })
      .filter(Boolean);
  }

  /**
   * Pack sheet: "Make a pack about…" (AI on only) → preview + edit → use for this session / save on this phone.
   * Saved packs show even with AI off. onUse({ name, mode, items }).
   * @param {{ game: string, kind: 'pairs'|'titles'|'prompts', mode?: string, min?: number, onUse: Function }} o
   */
  function openPackSheet(o) {
    const lineKind = o.kind === 'prompts' && o.mode === 'wyr' ? 'wyr' : o.kind;
    const min = o.min || 4;
    const hint =
      lineKind === 'pairs' ? t('dangal.party.one_per_line_word_similar_word') : lineKind === 'wyr' ? t('dangal.party.one_per_line_option_a_option') : o.kind === 'titles' ? t('dangal.party.one_title_per_line') : t('dangal.party.one_prompt_per_line');
    let draft = null;
    const listHtml = () => {
      const saved = savedPacks(o.game).filter((p) => !o.mode || !p.mode || p.mode === o.mode);
      return saved.length
        ? `<div class="pk-section">${tHtml('dangal.party.on_this_phone')}</div>${saved
            .map(
              (p) => `<div class="pk-pack-row"><button type="button" class="pk-row-btn" data-use-saved="${esc(p.name)}">${esc(p.name)} · ${p.items.length}</button><button type="button" class="pk-link" data-del-saved="${esc(p.name)}" aria-label="${tHtml('dangal.party.delete_name', { name: p.name })}">${tHtml('dangal.party.delete')}</button></div>`
            )
            .join('')}`
        : '';
    };
    const ai = aiOn();
    openSheet({
      title: ai ? t('dangal.party.make_a_pack') : t('dangal.party.your_packs'),
      bodyHtml: `<div class="pk-packsheet">
        ${
          ai
            ? `<form data-pack-form class="pk-row"><input class="pk-input" data-pack-theme maxlength="60" placeholder="${tHtml('dangal.party.make_a_pack_about_e_g')}" aria-label="${tHtml('dangal.party.pack_theme')}"><button type="submit" class="pk-btn pk-btn--primary">${tHtml('dangal.party.make')}</button></form>`
            : ''
        }
        <div data-pack-preview hidden>
          <input class="pk-input" data-pack-name maxlength="30" aria-label="${tHtml('dangal.party.pack_name')}">
          <textarea class="pk-input pk-pack-lines" data-pack-lines rows="8" aria-label="${esc(hint)}"></textarea>
          <div class="pk-sub">${tHtml('dangal.party.hint_at_least_value', { hint, value: min })}</div>
          <div class="pk-err" data-pack-err role="alert"></div>
          <div class="pk-row">
            <button type="button" class="pk-btn pk-btn--primary" data-pack-use>${tHtml('dangal.party.use_tonight')}</button>
            <button type="button" class="pk-btn pk-btn--ghost" data-pack-save>${tHtml('dangal.party.save_on_this_phone')}</button>
          </div>
        </div>
        <div data-pack-saved>${listHtml()}</div>
        ${!ai && !savedPacks(o.game).length ? '<div class="pk-sub">' + tHtml('dangal.party.no_saved_packs_yet') + '</div>' : ''}
      </div>`,
      onMount: (el, closeSheet) => {
        const preview = el.querySelector('[data-pack-preview]');
        const err = el.querySelector('[data-pack-err]');
        const showDraft = (name, items) => {
          draft = { name, items };
          preview.hidden = false;
          el.querySelector('[data-pack-name]').value = name;
          el.querySelector('[data-pack-lines]').value = packToLines(lineKind === 'wyr' ? 'wyr' : o.kind, items);
          err.textContent = '';
        };
        const current = () => {
          const items = linesToPack(lineKind, el.querySelector('[data-pack-lines]').value);
          const name = el.querySelector('[data-pack-name]').value.trim().slice(0, 30) || (draft && draft.name) || t('dangal.party.my_pack');
          if (items.length < min) {
            err.textContent = t('dangal.party.add_at_least_value_itemscount_so', { value: min, itemsCount: items.length });
            return null;
          }
          return { name, mode: o.mode || '', items };
        };
        const wireSaved = () => {
          el.querySelectorAll('[data-use-saved]').forEach((b) =>
            b.addEventListener('click', () => {
              const p = savedPacks(o.game).find((x) => x.name === b.dataset.useSaved);
              if (p) showDraft(p.name, p.items);
            })
          );
          el.querySelectorAll('[data-del-saved]').forEach((b) =>
            b.addEventListener('click', () => {
              deletePack(o.game, b.dataset.delSaved);
              el.querySelector('[data-pack-saved]').innerHTML = listHtml();
              wireSaved();
            })
          );
        };
        wireSaved();
        el.querySelector('[data-pack-form]')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          const input = el.querySelector('[data-pack-theme]');
          const theme = input.value.trim();
          if (theme.length < 2) return input.focus();
          const btn = e.target.querySelector('button');
          btn.disabled = true;
          btn.textContent = t('dangal.party.making');
          try {
            const d = await roomCall(o.game, 'ai_pack', { theme, mode: o.mode || '', locale: contentPrefs().lang });
            const items = (d.pack && (d.pack.words || d.pack.titles || d.pack.prompts)) || [];
            showDraft((d.pack && d.pack.name) || theme.slice(0, 30), items);
            if (d.source === 'fallback') err.textContent = t('dangal.party.couldn_t_make_a_fresh_pack');
          } catch (ex) {
            toast(roomErrorText(ex) || t('dangal.party.couldn_t_make_a_pack_right'));
          } finally {
            btn.disabled = false;
            btn.textContent = t('dangal.party.make');
          }
        });
        el.querySelector('[data-pack-use]').addEventListener('click', () => {
          const p = current();
          if (!p) return;
          closeSheet();
          o.onUse(p);
        });
        el.querySelector('[data-pack-save]').addEventListener('click', () => {
          const p = current();
          if (!p) return;
          savePack(o.game, p);
          el.querySelector('[data-pack-saved]').innerHTML = listHtml();
          wireSaved();
          toast(t('dangal.party.saved_on_this_phone'));
        });
      },
    });
  }

  // ---------------- room chat ----------------

  /**
   * Compact room chat: recent messages + one input. `channel` keys the kept draft across re-renders.
   * @param {{ channel: string, messages: {from:string,text:string}[], name: (id) => string, me: string,
   *           title?: string, placeholder?: string, disabled?: string, limit?: number }} o
   */
  function chatHtml(o) {
    const msgs = (o.messages || []).slice(-(o.limit || 12));
    return `<div class="pk-chat" data-chat="${esc(o.channel)}">
      ${o.title ? `<div class="pk-chat-title">${esc(o.title)}</div>` : ''}
      <div class="pk-chat-log" aria-live="polite">${
        msgs.length
          ? msgs
              .map((m) => `<div class="pk-chat-msg${m.from === o.me ? ' is-me' : ''}"><b>${esc(m.from === o.me ? t('common.you') : o.name(m.from))}</b> ${esc(m.text)}</div>`)
              .join('')
          : '<div class="pk-chat-empty">' + tHtml('dangal.party.no_messages_yet') + '</div>'
      }</div>
      ${
        o.disabled
          ? `<div class="pk-chat-off">${esc(o.disabled)}</div>`
          : `<form class="pk-chat-form" data-chat-form>
        <input class="pk-input pk-chat-input" data-keep="chat-${esc(o.channel)}" maxlength="160" placeholder="${esc(o.placeholder || t('dangal.party.say_something'))}" autocomplete="off" enterkeyhint="send" aria-label="${esc(o.placeholder || t('common.message'))}">
        <button type="submit" class="pk-btn pk-btn--primary pk-chat-send" aria-label="${tHtml('common.send')}">➤</button>
      </form>`
      }
    </div>`;
  }

  /** Wire every chat box in `body`: onSend(channel, text) → Promise<boolean> (true clears the draft). */
  function wireChat(body, onSend) {
    body.querySelectorAll('[data-chat]').forEach((box) => {
      const log = box.querySelector('.pk-chat-log');
      if (log) log.scrollTop = log.scrollHeight;
      const form = box.querySelector('[data-chat-form]');
      if (!form) return;
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = form.querySelector('input');
        const text = input.value.trim();
        if (!text) return;
        const ok = await onSend(box.dataset.chat, text);
        if (ok) {
          const again = document.querySelector('[data-keep="' + input.dataset.keep + '"]');
          if (again) again.value = '';
        }
      });
    });
  }

  /** Unified share sheet for a party result line. */
  function shareLine(gameId, label, line) {
    const text = line + ' — play ' + label + ' on Chaupaal';
    const url = location.origin + '/';
    const stats =
      typeof buildShareStats === 'function'
        ? buildShareStats({ scoreLine: line, meta: t('dangal.party.label_party_game', { label }), text, url, caption: line })
        : { scoreLine: line, meta: label, text, url };
    if (typeof openUnifiedShareSheet === 'function') openUnifiedShareSheet({ gameId, title: t('common.share'), subtitle: line, stats });
    else if (typeof shareGameResult === 'function') shareGameResult(gameId, stats);
    else if (navigator.share) navigator.share({ title: label, text, url }).catch(() => {});
  }

  /** Game home: hero, 20-second how-to, Pass & Play (primary) / Play with friends / Join by code. */
  function homeHtml(o) {
    return `<div class="pk-page pk-home">
      <div class="pk-hero">
        <div class="pk-hero-mark">${typeof gameMarkHtml === 'function' ? gameMarkHtml(o.game, { size: 64 }) : esc(o.icon || '🎉')}</div>
        <div class="pk-hero-title">${esc(o.title)}</div>
        <div class="pk-hero-sub">${esc(o.sub)}</div>
      </div>
      ${o.howToHtml || ''}
      <div class="pk-modes">
        <button type="button" class="pk-mode pk-mode--primary" data-mode="pass">
          <span class="pk-mode-title">${tHtml('dangal.party.pass_play')}</span><span class="pk-mode-sub">${esc(o.passSub || t('dangal.party.one_phone_pass_it_around'))}</span>
        </button>
        <button type="button" class="pk-mode" data-mode="room">
          <span class="pk-mode-title">${tHtml('dangal.party.play_with_friends')}</span><span class="pk-mode-sub">${esc(o.roomSub || t('dangal.party.everyone_on_their_own_phone'))}</span>
        </button>
        <button type="button" class="pk-link" data-mode="join">${tHtml('dangal.party.have_a_room_code_join')}</button>
        ${partyNightLinkHtml(o.game)}
      </div>
    </div>`;
  }

  // ---------------- Pass & Play party night (offline; the hub screen owns the scoreboard) ----------------

  const NIGHT_KEY = 'pk_party_night';
  const NIGHT_TTL = 18 * 3600 * 1000;

  function passNight() {
    try {
      const n = JSON.parse(localStorage.getItem(NIGHT_KEY) || 'null');
      if (!n || !Array.isArray(n.players) || !n.players.length) return null;
      if (Date.now() - (Number(n.touchedAt || n.startedAt) || 0) > NIGHT_TTL) return null;
      return n;
    } catch (e) {
      return null;
    }
  }
  function savePassNight(n) {
    try {
      if (!n) localStorage.removeItem(NIGHT_KEY);
      else localStorage.setItem(NIGHT_KEY, JSON.stringify(Object.assign({}, n, { touchedAt: Date.now() })));
    } catch (e) {}
  }

  /** Tonight's names for a game's Pass & Play setup (null when no night is on or it doesn't fit). */
  function passNightNames(min, max) {
    const n = passNight();
    if (!n || n.players.length < (min || 2)) return null;
    return n.players.slice(0, max || n.players.length);
  }

  /**
   * A Pass & Play game reports its latest standings (ids → names). The hub commits `current` when
   * the group comes back, so however the game ends, the last finished round counts once.
   * @param {string} game
   * @param {{ players: {id:string,name:string}[], scores?: object, state?: object }} r
   */
  function reportPass(game, r) {
    const n = passNight();
    if (!n || !r || !Array.isArray(r.players)) return;
    const nameOf = {};
    r.players.forEach((p) => (nameOf[p.id] = p.name));
    const map = (id) => nameOf[id] || id;
    const scores = {};
    Object.keys(r.scores || {}).forEach((id) => (scores[map(id)] = r.scores[id]));
    let state = r.state ? JSON.parse(JSON.stringify(r.state)) : null;
    if (state && Array.isArray(state.teams)) state.teams = state.teams.map((t) => (t || []).map(map));
    if (state && state.result && state.result.roles) {
      const roles = {};
      Object.keys(state.result.roles).forEach((id) => (roles[map(id)] = state.result.roles[id]));
      state.result.roles = roles;
      if (state.result.tanner) state.result.tanner = map(state.result.tanner);
    }
    n.current = { game, r: { players: r.players.map((p) => p.name), scores, state }, at: Date.now() };
    savePassNight(n);
  }

  /** Result-screen button back to the Pass & Play party night (only while one is on). */
  function passHubButtonHtml() {
    return passNight() ? '<button type="button" class="pk-btn pk-btn--ghost pk-btn--block" data-pass-hub>' + tHtml('dangal.party.back_to_party_night') + '</button>' : '';
  }
  function wirePassHub(body, shell) {
    body.querySelector('[data-pass-hub]')?.addEventListener('click', () => {
      shell.close();
      if (window.PartyHub && typeof PartyHub.openPass === 'function') PartyHub.openPass();
    });
  }

  /** "Party night" door on party game homes (the hub keeps one group across games). */
  function partyNightLinkHtml(game) {
    return window.PartyHubCore === undefined && !window.PartyHub
      ? ''
      : `<button type="button" class="pk-link pk-link--party" data-party-night="${esc(game || '')}">${tHtml('dangal.party.party_night_several_games_one_group')}</button>`;
  }

  window.PartyKit = {
    esc,
    myUid,
    myName,
    isSignedIn,
    wakeLock,
    openShell,
    closeThen,
    openSheet,
    mountPlayerEditor,
    mountPassCover,
    mountPassVote,
    coverWhenAway,
    awayWatcherCount: () => (pruneAway(), awayWatchers.size),
    countdown,
    mountPicker,
    scoreboardHtml,
    roomCall,
    roomErrorText,
    connectRoom,
    isOnline,
    roomLink,
    shareRoom,
    inviteFriends,
    postInviteToChat,
    inviteCardHtml,
    joinFromLink,
    registerPartyGame,
    ensureGameData,
    ensureContentLocale,
    roomContentLang,
    contentNoteHtml,
    contentLangRowHtml,
    pickContentLang,
    uiContentLang,
    withGameData,
    segHtml,
    wireSegs,
    buzz,
    ding,
    mountHoldPeek,
    bigReveal,
    mountTeamEditor,
    requireSignIn,
    createRoom,
    openJoinSheet,
    openRoomScreen,
    roomResultActions,
    wireRoomResultActions,
    chatHtml,
    wireChat,
    shareLine,
    homeHtml,
    hostBarHtml,
    endOrBack,
    identityHtml,
    largeText,
    reducedMotion,
    contentPrefs,
    badCardHtml,
    wireBadCard,
    retiredCached,
    refreshRetired,
    aiOn,
    savedPacks,
    openPackSheet,
    openShellFor: (game) => openShells[game] || null,
    openGameRoom: (game, code, opts) => (games[game] && typeof games[game].openRoom === 'function' ? games[game].openRoom(code, opts || {}) : null),
    partyNightLinkHtml,
    passNight,
    savePassNight,
    passNightNames,
    reportPass,
    passHubButtonHtml,
    wirePassHub,
  };
})();
