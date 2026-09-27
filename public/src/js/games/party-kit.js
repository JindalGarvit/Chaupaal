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
  const PRESENCE_MS = 20000;
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
    doneBtn.addEventListener('click', () => {
      hide();
      root.innerHTML = '';
      o.onDone();
    });
    return { hide };
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
    return res.data || {};
  }

  const ROOM_ERROR_COPY = {
    ROOM_NOT_FOUND: 'That room doesn’t exist any more — check the code',
    ROOM_FULL: 'That room is full',
    ROOM_CLOSED: 'That room has closed',
    BAD_CODE: 'Room codes are 6 letters and numbers',
    NEED_PLAYERS: 'Need at least 3 players to start',
    HOST_ONLY: 'Only the host can do that',
    NOT_MEMBER: 'You’re not in this room any more',
    RATE_LIMITED: 'Slow down a little — try again in a moment',
    BUSY: 'Busy — try again',
    AUTH_REQUIRED: 'Sign in to play with friends',
  };

  function roomErrorText(e) {
    const code = String((e && e.code) || '').toUpperCase();
    if (ROOM_ERROR_COPY[code]) return ROOM_ERROR_COPY[code];
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
    let lastTick = 0;
    let stopped = false;
    const pubRef = ref.child('pub');
    const secretRef = ref.child('secrets/' + uid);
    const presenceRef = ref.child('presence');
    const myPresence = presenceRef.child(uid);

    const onPub = (snap) => {
      pub = snap.val();
      if (pub && pub.serverNow) offset = pub.serverNow - Date.now();
      handlers.onPub(pub);
    };
    const onPubErr = () => handlers.onPub(null);
    const onSecret = (snap) => handlers.onSecret(snap.val());
    const onPresence = (snap) => handlers.onPresence && handlers.onPresence(snap.val() || {});
    pubRef.on('value', onPub, onPubErr);
    secretRef.on('value', onSecret, () => handlers.onSecret(null));
    presenceRef.on('value', onPresence, () => {});

    const beat = () => {
      if (stopped) return;
      myPresence.set({ at: Date.now(), online: true }).catch(() => {});
    };
    try {
      myPresence.onDisconnect().set({ at: Date.now(), online: false });
    } catch (e) {}
    beat();
    const hb = setInterval(beat, PRESENCE_MS);

    const serverNow = () => Date.now() + offset;
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
    const onVis = () => {
      if (document.visibilityState === 'visible') beat();
    };
    document.addEventListener('visibilitychange', onVis);

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
        myPresence.set({ at: Date.now(), online: false }).catch(() => {});
        try {
          myPresence.onDisconnect().cancel();
        } catch (e) {}
      },
    };
  }

  function isOnline(presence, uid) {
    const p = presence && presence[uid];
    if (!p || p.online === false) return false;
    return Date.now() - (Number(p.at) || 0) < 45000;
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

  /** Party titles register a room opener so links and chat cards can route to them. */
  function registerPartyGame(game, spec) {
    games[game] = spec || {};
  }

  window.PartyKit = {
    esc,
    myUid,
    myName,
    isSignedIn,
    wakeLock,
    openShell,
    openSheet,
    mountPlayerEditor,
    mountPassCover,
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
  };
})();
