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
   * Full-screen game overlay with shared chrome. Back button asks before leaving (when confirmLeave
   * returns true); system back closes directly — it never steps back to a previous card.
   * @param {{ gameId: string, title: string, subtitle?: string, onClose?: Function, confirmLeave?: () => boolean }} opts
   */
  function openShell(opts) {
    const o = opts || {};
    document.querySelector('.pk-shell[data-game-id="' + o.gameId + '"]')?.remove();
    const el = document.createElement('div');
    el.className = 'pk-shell';
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
      wakeLock.release();
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
    const shell = {
      el,
      body: el.querySelector('[data-pk-body]'),
      get closed() {
        return closed;
      },
      render(html) {
        if (closed) return null;
        this.body.innerHTML = html;
        this.body.scrollTop = 0;
        return this.body;
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
    el.querySelector('#pkBack_' + o.gameId)?.addEventListener('click', async () => {
      const ask = typeof o.confirmLeave === 'function' ? o.confirmLeave() : false;
      if (ask && typeof confirmLeaveGame === 'function') {
        const go = await confirmLeaveGame({ title: 'Leave the game?', body: o.leaveBody || 'This round will end for everyone on this phone.' });
        if (!go) return;
      }
      shell.close();
    });
    if (typeof GameUI !== 'undefined' && GameUI && typeof GameUI.attachHowTo === 'function') {
      try {
        GameUI.attachHowTo(el.querySelector('.game-chrome-right') || el, { gameId: o.gameId, title: 'How to play ' + o.title });
      } catch (e) {}
    }
    wakeLock.acquire();
    return shell;
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
              <input class="pk-player-input" data-pk-name="${i}" maxlength="20" value="${esc(n)}" placeholder="Player ${i + 1}" autocomplete="off" enterkeyhint="next" aria-label="Player ${i + 1} name">
              ${names.length > min ? `<button type="button" class="pk-player-remove" data-pk-remove="${i}" aria-label="Remove player ${i + 1}">✕</button>` : ''}
            </div>`
            )
            .join('')}
        </div>
        ${names.length < max ? '<button type="button" class="pk-add-player" data-pk-add>+ Add player</button>' : `<div class="pk-hint">Max ${max} players</div>`}`;
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
        let v = String(n || '').trim().slice(0, 20) || 'Player ' + (i + 1);
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
      <div class="pk-pass-lead">${esc(o.lead || 'Pass the phone to')}</div>
      <div class="pk-pass-name">${esc(o.name)}</div>
      <div class="pk-card" data-pk-card aria-live="polite">
        <div class="pk-card-cover" data-pk-cover>
          <div class="pk-card-eye" aria-hidden="true">👁</div>
          <div class="pk-card-cover-title">Hold to see your card</div>
          <div class="pk-card-cover-sub">Only ${esc(o.name)} should look</div>
        </div>
        <div class="pk-card-face" data-pk-face hidden></div>
      </div>
      <div class="pk-pass-actions">
        <button type="button" class="pk-btn pk-btn--ghost" data-pk-tap>Tap to reveal</button>
        <button type="button" class="pk-btn pk-btn--primary" data-pk-done disabled>${esc(o.doneLabel || 'Hide & pass')}</button>
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
      tapBtn.textContent = 'Hide';
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
      tapBtn.textContent = 'Tap to reveal';
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
      <div class="pk-pass-lead">${esc(o.lead || 'Pass the phone to')}</div>
      <div class="pk-pass-name">${esc(o.name)}</div>
      <div class="pk-card pk-card--vote" data-pk-card>
        <div class="pk-card-cover" data-pk-cover>
          <div class="pk-card-eye" aria-hidden="true">${esc(o.coverIcon || '🤫')}</div>
          <div class="pk-card-cover-title">${esc(o.coverTitle || 'Secret vote')}</div>
          <div class="pk-card-cover-sub">Only ${esc(o.name)} should look</div>
        </div>
        <div class="pk-card-face" data-pk-face hidden></div>
      </div>
      <div class="pk-pass-actions">
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-pk-open>I’m ${esc(o.name)} — show me</button>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-pk-done hidden disabled>${esc(o.doneLabel || 'Lock vote & pass')}</button>
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
    return `<div class="pk-score" role="table" aria-label="Scoreboard">${rows
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
    ROOM_NOT_FOUND: 'That room doesn’t exist any more — check the code',
    ROOM_FULL: 'That room is full',
    ROOM_CLOSED: 'That room has closed',
    BAD_CODE: 'Room codes are 6 letters and numbers',
    HOST_ONLY: 'Only the host can do that',
    NOT_MEMBER: 'You’re not in this room any more',
    RATE_LIMITED: 'Slow down a little — try again in a moment',
    BUSY: 'Busy — try again',
    AUTH_REQUIRED: 'Sign in to play with friends',
  };

  /** Server messages that are already plain, specific copy ("Need at least 4 players"). */
  const PASSTHROUGH = ['NEED_PLAYERS', 'TOO_MANY_PLAYERS', 'TEAMS_UNEVEN', 'PENDING'];

  function roomErrorText(e) {
    const code = String((e && e.code) || '').toUpperCase();
    if (ROOM_ERROR_COPY[code]) return ROOM_ERROR_COPY[code];
    if (PASSTHROUGH.indexOf(code) >= 0 && e.message) return e.message;
    if (/^CLUE_/.test(code)) return null;
    return typeof navigator !== 'undefined' && navigator.onLine === false
      ? 'You’re offline — reconnect to keep playing'
      : 'Couldn’t reach the room — try again';
  }

  /**
   * Live room connection: shared pub + my secret + presence heartbeat + deadline ticks.
   * @param {string} game
   * @param {string} code
   * @param {{ onPub: (pub: object|null) => void, onSecret: (secret: object|null) => void, onPresence?: (p: object) => void }} handlers
   */
  function connectRoom(game, code, handlers) {
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
    presenceRef.on('value', onPresence, () => {});

    const serverNow = () => Date.now() + offset;
    const beat = (online) => {
      if (stopped) return;
      myPresence.set({ at: serverNow(), online: online !== false }).catch(() => {});
    };
    try {
      myPresence.onDisconnect().set({ at: firebase.database.ServerValue.TIMESTAMP, online: false });
    } catch (e) {
      try {
        myPresence.onDisconnect().set({ at: Date.now(), online: false });
      } catch (err) {}
    }
    beat();
    const hb = setInterval(beat, PRESENCE_MS);
    const maybeTick = (force) => {
      if (stopped || !pub || pub.status !== 'playing') return;
      const now = Date.now();
      if (now - lastTick < TICK_MIN_GAP_MS) return;
      const due = pub.deadline && !pub.paused && serverNow() >= pub.deadline;
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
    const text = `Join my ${label} room on Chaupaal — code ${code}`;
    if (typeof openUnifiedShareSheet === 'function') {
      openUnifiedShareSheet({
        gameId: game,
        title: 'Invite to ' + label,
        subtitle: 'Room code ' + code,
        story: false,
        stats: typeof buildShareStats === 'function'
          ? buildShareStats({ scoreLine: 'Room ' + code, meta: label, text, url })
          : { scoreLine: 'Room ' + code, meta: label, text, url },
      });
      return;
    }
    if (navigator.share) {
      navigator.share({ title: label, text, url }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text + '\n' + url).then(() => toast('Link copied'));
    }
  }

  /** Post a `party_invite` card into a Baithak chat. */
  async function postInviteToChat(chatOrId, game, code, label) {
    const chat = typeof chatOrId === 'object' ? chatOrId : null;
    const chatId = chat ? chat.firestoreId || chat.id : chatOrId;
    if (!chatId || typeof sendRealtimeMessage !== 'function') return false;
    const isGroup = !!(chat && (chat.type === 'group' || chat.isGroup));
    const who = myName() || 'A friend';
    try {
      await sendRealtimeMessage(chatId, `${who} started ${label} — tap to join`, isGroup, null, {
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
    const friend = await openFriendPickerSheet({ title: 'Invite to ' + label, subtitle: 'They’ll get a join card in your chat' });
    if (!friend) return;
    const chatId = friend.chatId || friend.firestoreId || '';
    if (chatId && (await postInviteToChat({ id: chatId, type: 'dm' }, game, code, label))) {
      toast('Invite sent to ' + (friend.name || 'your friend'));
      return;
    }
    const peer = friend.uid || friend.id;
    if (peer && typeof openPeerDm === 'function') {
      try {
        await openPeerDm({ uid: peer, origin: 'party_invite', seedHello: false });
        const open = window.currentOpenChat;
        if (open && (await postInviteToChat(open, game, code, label))) {
          toast('Invite sent');
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
    const label = att.label || (typeof gameDisplayName === 'function' ? gameDisplayName(game) : 'Party game');
    const mark = typeof gameMarkHtml === 'function' ? gameMarkHtml(game, { size: 30 }) : '🎉';
    return `<div class="party-invite-card">
      <div class="party-invite-head">${mark}<div><strong>${esc(label)}</strong><span>Party · room ${esc(code)}</span></div></div>
      <div class="party-invite-text">${esc((m && m.text) || 'Join the game')}</div>
      <button type="button" class="party-invite-join" data-party-invite-join="${esc(code)}" data-party-game="${esc(game)}">Join game</button>
    </div>`;
  }

  /** /party link, chat card, or typed code → the game's room screen. */
  function joinFromLink(game, code, opts) {
    const g = games[game];
    const clean = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!g || typeof g.openRoom !== 'function') {
      if (typeof openRetiredGameScreen === 'function' && typeof isRetiredGameId === 'function' && isRetiredGameId(game)) {
        openRetiredGameScreen(game);
      } else toast('That game isn’t available');
      return;
    }
    if (!isSignedIn()) {
      toast('Sign in to join your friends’ room');
      if (typeof openAuthSheet === 'function') openAuthSheet('login');
      return;
    }
    g.openRoom(clean, Object.assign({ join: true }, opts || {}));
  }

  // ---------------- lazy game data (packs + cores stay off first paint) ----------------

  /** index.html lists these as <script type="text/x-lazy" data-party-lazy> so bust-assets stamps them. */
  const LAZY_DATA = {
    imposter: ['data/imposter-packs.js', 'games/imposter-core.js'],
    rajamantri: ['games/rajamantri-core.js'],
    charades: ['data/charades-packs.js', 'games/charades-core.js'],
    mostlikely: ['data/mostlikely-packs.js', 'games/mostlikely-core.js'],
    werewolf: ['games/werewolf-core.js'],
    penalty: ['games/penalty-core.js'],
    poker: ['games/poker-core.js'],
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

  function gameDataReady(game) {
    return (LAZY_DATA[game] || []).every((rel) => lazyLoaded[rel]);
  }

  function ensureGameData(game) {
    return (LAZY_DATA[game] || []).reduce((p, rel) => p.then(() => loadLazyScript(rel)), Promise.resolve());
  }

  /** Wrap a game entry point so its packs/core load first (sync when already loaded). */
  function withGameData(game, fn) {
    return function () {
      const args = arguments;
      if (gameDataReady(game)) return fn.apply(this, args);
      return ensureGameData(game).then(
        () => fn.apply(this, args),
        () => toast('Couldn’t load the game — check your connection and try again')
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

  /** Time-up buzzer + strong haptic (dangal-sound / dangal-haptic, Quiet mode respected). */
  function buzz() {
    try {
      if (window.Sound) Sound.play('ui.lose');
      if (window.Haptic) Haptic.heavy();
      else haptic('error');
    } catch (e) {}
  }

  /** Short success chime + light haptic. */
  function ding() {
    try {
      if (window.Sound) Sound.play('ui.check');
      if (window.Haptic) Haptic.medium();
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
          (t, ti) => `<div class="pk-team pk-team--${ti}">
            <div class="pk-team-name">${esc((o.teamNames || [])[ti] || (ti ? 'Team B' : 'Team A'))}</div>
            ${t
              .map(
                (n, i) => `<div class="pk-player-row">
                <input class="pk-player-input" data-pk-t="${ti}" data-pk-i="${i}" maxlength="20" value="${esc(n)}" placeholder="Player" autocomplete="off" aria-label="${ti ? 'Team B' : 'Team A'} player ${i + 1}">
                ${t.length > minPer ? `<button type="button" class="pk-player-remove" data-pk-rm="${ti}:${i}" aria-label="Remove">✕</button>` : ''}
              </div>`
              )
              .join('')}
            ${total() < max ? `<button type="button" class="pk-add-player" data-pk-addt="${ti}">+ Add</button>` : ''}
          </div>`
        )
        .join('')}</div>
        <button type="button" class="pk-chip pk-teams-shuffle" data-pk-shuffle>🔀 Shuffle teams</button>`;
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
      return teams.map((t) =>
        t.map((name) => {
          n += 1;
          let v = String(name || '').trim().slice(0, 20) || 'Player ' + n;
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
    toast('Sign in to play on separate phones — Pass & Play works signed out');
    if (typeof openAuthSheet === 'function') openAuthSheet('login');
    return false;
  }

  /** Create a room (posting a join card into `chat` when started from a group) then open it. */
  async function createRoom(o) {
    if (!requireSignIn()) return;
    if (navigator.onLine === false) {
      toast('You’re offline — Pass & Play works without internet');
      return;
    }
    try {
      const chatId = o.chat ? o.chat.firestoreId || o.chat.id : '';
      const res = await roomCall(o.game, 'create', {
        name: myName() || 'Host',
        settings: o.settings || {},
        chatId: chatId && chatId !== 'ai' ? chatId : '',
      });
      if (o.chat && chatId && chatId !== 'ai') {
        if (await postInviteToChat(o.chat, o.game, res.code, o.label)) toast('Invite posted in the chat');
      }
      o.open(res.code, { host: true });
    } catch (e) {
      toast(roomErrorText(e) || 'Couldn’t create a room');
    }
  }

  function openJoinSheet(onCode) {
    if (!requireSignIn()) return;
    openSheet({
      title: 'Join a room',
      bodyHtml: `<input class="pk-input pk-input--code" data-code maxlength="6" placeholder="ROOM CODE" autocapitalize="characters" autocomplete="off" enterkeyhint="go" aria-label="Room code">
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-join>Join</button>`,
      onMount(sheet, close) {
        const input = sheet.querySelector('[data-code]');
        setTimeout(() => input.focus(), 50);
        const go = () => {
          const code = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
          if (code.length !== 6) return toast('Room codes are 6 letters and numbers');
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
        const res = await roomCall(spec.game, 'join', { code, name: myName() || 'Player' });
        if (res.pending) toast('Round in progress — you’ll be dealt in next round');
      } catch (e) {
        toast(roomErrorText(e) || 'Couldn’t join that room');
        return null;
      }
    }
    const view = { code, pub: null, secret: null, presence: {}, key: '', busy: false, prevState: null };
    const ctrl = { spec, view, conn: null, shell: null };
    ctrl.uid = myUid();
    ctrl.name = (id) => {
      const p = view.pub && view.pub.players && view.pub.players[id];
      return p ? p.name : 'Player';
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
      return `<div class="pk-hostbar"><span>Host</span>${
        view.pub.paused
          ? '<button type="button" class="pk-chip" data-host="resume">Resume</button>'
          : '<button type="button" class="pk-chip" data-host="pause">Pause</button>'
      }</div>`;
    };
    ctrl.pausedNote = () => (view.pub && view.pub.paused ? '<div class="pk-paused">Paused by the host</div>' : '');
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
      subtitle: 'Room ' + code,
      confirmLeave: () => !!(view.pub && view.pub.status === 'playing'),
      leaveBody: 'You can rejoin from the invite link while the room is open.',
      onClose: () => ctrl.conn && ctrl.conn.stop(),
    });
    ctrl.conn = connectRoom(spec.game, code, {
      onPub: (pub) => {
        view.pub = pub;
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
    });
    if (!ctrl.conn) {
      ctrl.shell.render('<div class="pk-empty">Can’t reach the game server right now. Try again in a moment.</div>');
      return ctrl;
    }
    ctrl.shell.render('<div class="pk-empty">Joining room…</div>');

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
      if (!pub) return message('This room isn’t available any more.', 'Back to games');
      if (pub.status === 'closed') return message('The host closed this room.', 'Done');
      if (!pub.players || !pub.players[ctrl.uid] || pub.players[ctrl.uid].left) return message('You’re no longer in this room.', 'Done');
      const st = pub.status === 'playing' && pub.state ? spec.hydrate(pub.state) : null;
      const key = JSON.stringify([
        pub.status, pub.roundNo, pub.host, !!pub.paused, pub.over, pub.players, pub.scores, pub.seen,
        pub.settings, pub.teamPick || null, pub.state || null, view.secret,
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
        ctrl.shell.setSubtitle('Room ' + code);
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
          ? { ok: false, label: 'Need ' + (spec.min - players.length) + ' more to start' }
          : { ok: true, label: 'Start' };
      const list =
        (spec.lobbyListHtml && spec.lobbyListHtml(ctrl, players)) ||
        `<div class="pk-lobby-list">${players
          .map(
            (p) => `<div class="pk-lobby-row"><span class="pk-dot" data-presence="${esc(p.id)}"></span><span>${esc(p.name)}</span>${
              p.id === pub.host ? '<span class="pk-badge">Host</span>' : ''
            }${p.id === ctrl.uid ? '<span class="pk-badge pk-badge--me">You</span>' : ''}</div>`
          )
          .join('')}</div>`;
      const body = ctrl.shell.render(`<div class="pk-page pk-lobby">
        <div class="pk-code-label">Room code</div>
        <div class="pk-code" aria-label="Room code ${esc(code)}">${esc(code)}</div>
        <div class="pk-row">
          <button type="button" class="pk-btn pk-btn--ghost" data-share>Share link</button>
          <button type="button" class="pk-btn pk-btn--ghost" data-invite>Invite friends</button>
        </div>
        <div class="pk-section">In the room · ${players.length}/${spec.max}</div>
        ${list}
        <button type="button" class="pk-row-btn" data-settings ${isHost && spec.openSettings ? '' : 'disabled'}>
          ${esc(spec.lobbySummary(ctrl))}${isHost && spec.openSettings ? '<span class="pk-chev" aria-hidden="true">›</span>' : ''}
        </button>
        ${
          isHost
            ? `<button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-start ${start.ok ? '' : 'disabled'}>${esc(start.label)}</button>`
            : '<div class="pk-wait">Waiting for the host to start…</div>'
        }
        <button type="button" class="pk-link" data-leave>Leave room</button>
      </div>`);
      body.querySelector('[data-share]').addEventListener('click', () => shareRoom(spec.game, code, spec.label));
      body.querySelector('[data-invite]').addEventListener('click', () => inviteFriends(spec.game, code, spec.label));
      body.querySelector('[data-leave]').addEventListener('click', ctrl.leave);
      if (isHost && spec.openSettings) body.querySelector('[data-settings]').addEventListener('click', () => spec.openSettings(ctrl));
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
        <div class="pk-title">Round in progress</div>
        <div class="pk-sub">You’ll be dealt in when the next round starts.</div>
        <button type="button" class="pk-link" data-leave>Leave room</button>
      </div>`);
      body.querySelector('[data-leave]').addEventListener('click', ctrl.leave);
    }

    return ctrl;
  }

  /** Shared result actions row for room games (host deals / ends, others invite / leave). */
  function roomResultActions(ctrl, o) {
    const isHost = ctrl.isHost();
    return `<div class="pk-result-actions">
      ${
        isHost
          ? `<button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-next>${esc(o.nextLabel || 'Next round')}</button>`
          : `<div class="pk-wait">${esc(o.waitLabel || 'Waiting for the host…')}</div>`
      }
      <div class="pk-row">
        <button type="button" class="pk-btn pk-btn--ghost" data-share-result>Share</button>
        ${isHost && ctrl.spec.openSettings ? '<button type="button" class="pk-btn pk-btn--ghost" data-room-settings>Settings</button>' : '<button type="button" class="pk-btn pk-btn--ghost" data-invite>Invite</button>'}
      </div>
      <button type="button" class="pk-link" data-end>${isHost ? 'End room' : 'Leave room'}</button>
    </div>`;
  }

  function wireRoomResultActions(ctrl, body, o) {
    body.querySelector('[data-next]')?.addEventListener('click', () => ctrl.startWith(o.nextOp || 'next', ctrl.spec.startArgs));
    body.querySelector('[data-share-result]')?.addEventListener('click', () => o.onShare && o.onShare());
    body.querySelector('[data-room-settings]')?.addEventListener('click', () => ctrl.spec.openSettings(ctrl));
    body.querySelector('[data-invite]')?.addEventListener('click', () => inviteFriends(ctrl.spec.game, ctrl.view.code, ctrl.spec.label));
    body.querySelector('[data-end]')?.addEventListener('click', async () => {
      await ctrl.act(ctrl.isHost() ? 'end' : 'leave');
      ctrl.shell.close();
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
              .map((m) => `<div class="pk-chat-msg${m.from === o.me ? ' is-me' : ''}"><b>${esc(m.from === o.me ? 'You' : o.name(m.from))}</b> ${esc(m.text)}</div>`)
              .join('')
          : '<div class="pk-chat-empty">No messages yet</div>'
      }</div>
      ${
        o.disabled
          ? `<div class="pk-chat-off">${esc(o.disabled)}</div>`
          : `<form class="pk-chat-form" data-chat-form>
        <input class="pk-input pk-chat-input" data-keep="chat-${esc(o.channel)}" maxlength="160" placeholder="${esc(o.placeholder || 'Say something…')}" autocomplete="off" enterkeyhint="send" aria-label="${esc(o.placeholder || 'Message')}">
        <button type="submit" class="pk-btn pk-btn--primary pk-chat-send" aria-label="Send">➤</button>
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
        ? buildShareStats({ scoreLine: line, meta: label + ' · party game', text, url, caption: line })
        : { scoreLine: line, meta: label, text, url };
    if (typeof openUnifiedShareSheet === 'function') openUnifiedShareSheet({ gameId, title: 'Share', subtitle: line, stats });
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
          <span class="pk-mode-title">Pass &amp; Play</span><span class="pk-mode-sub">${esc(o.passSub || 'One phone, pass it around')}</span>
        </button>
        <button type="button" class="pk-mode" data-mode="room">
          <span class="pk-mode-title">Play with friends</span><span class="pk-mode-sub">${esc(o.roomSub || 'Everyone on their own phone')}</span>
        </button>
        <button type="button" class="pk-link" data-mode="join">Have a room code? Join</button>
      </div>
    </div>`;
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
  };
})();
