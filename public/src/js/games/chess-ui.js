/**
 * Chess UI — Practice vs bots · Live 1v1 (server-authoritative) · Daily · Review · Analysis.
 *
 * Rules: ChessCore (FIDE Laws). Live and Daily never decide anything on the phone:
 * POST /api/media-config { action: 'chess_game' } → server-lib/chess-engine.js validates every move
 * and runs the clocks; this file renders pub state and plays moves optimistically.
 * Engine, review and opening names lazy-load (chess-worker.js / chess-search.js / chess-review.js / chess-eco.js).
 */
(function () {
  'use strict';

  const GAME = 'chess';
  const SETTINGS_KEY = 'chaupaal_chess_settings_v1';
  const DEFAULTS = {
    theme: 'classic',
    pieces: 'solid',
    sound: true,
    coords: true,
    legalDots: true,
    autoQueen: false,
    autoClaim: true,
    premove: true,
    level: 3,
    persona: '',
    practiceTc: '10+0',
    side: 'w',
    variant: 'standard',
  };
  const TC_PRESETS = [
    { cat: 'Bullet', id: '1+0', min: 1, inc: 0 },
    { cat: 'Bullet', id: '2+1', min: 2, inc: 1 },
    { cat: 'Blitz', id: '3+0', min: 3, inc: 0 },
    { cat: 'Blitz', id: '3+2', min: 3, inc: 2 },
    { cat: 'Blitz', id: '5+0', min: 5, inc: 0 },
    { cat: 'Rapid', id: '10+0', min: 10, inc: 0 },
    { cat: 'Rapid', id: '15+10', min: 15, inc: 10 },
    { cat: 'Classical', id: '30+0', min: 30, inc: 0 },
  ];
  const DAILY = [
    { id: 'daily1', days: 1, label: '1 day / move' },
    { id: 'daily3', days: 3, label: '3 days / move' },
  ];
  const THEMES = {
    classic: { label: 'Classic', light: '#f0d9b5', dark: '#b58863' },
    green: { label: 'Green', light: '#eeeed2', dark: '#769656' },
    slate: { label: 'Slate', light: '#dee3e6', dark: '#8ca2ad' },
    contrast: { label: 'High contrast', light: '#ffffff', dark: '#3d3d3d' },
  };
  const VS = '\uFE0E';
  const GLYPHS = {
    solid: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
    outline: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  };
  const PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
  const BUCKET_LABEL = { bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapid', classical: 'Classical', daily: 'Daily' };
  const REASON_TEXT = {
    checkmate: 'Checkmate',
    stalemate: 'Stalemate',
    insufficient: 'Insufficient material',
    fivefold: 'Fivefold repetition',
    seventyfive: '75-move rule',
    threefold: 'Threefold repetition',
    fifty: '50-move rule',
    agreement: 'Draw agreed',
    resignation: 'Resignation',
    timeout: 'Time out',
    timeout_insufficient: 'Time out — opponent can’t mate, so it’s a draw',
    abandoned: 'Opponent left the game',
    abandoned_insufficient: 'Opponent left — draw by insufficient material',
    aborted: 'Game aborted',
    no_first_move: 'Aborted — no first move',
    opponent_left: 'Aborted — opponent left',
    no_show: 'Opponent didn’t join',
    cancelled: 'Challenge cancelled',
  };

  // ---------------- small utils ----------------

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function toast(msg) {
    if (typeof showToast === 'function') showToast(msg);
  }
  function settings() {
    try {
      return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
    } catch (e) {
      return Object.assign({}, DEFAULTS);
    }
  }
  function saveSettings(patch) {
    const next = Object.assign(settings(), patch || {});
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch (e) {}
    return next;
  }
  function feedback(key) {
    if (settings().sound) {
      if (typeof gameFeedback === 'function') gameFeedback(key);
    } else if (typeof haptic === 'function') {
      try {
        haptic(key === 'capture' || key === 'invalid' ? 'medium' : 'light');
      } catch (e) {}
    }
  }
  function myUid() {
    return typeof getCurrentUid === 'function' ? getCurrentUid() || '' : '';
  }
  function myName() {
    const p = typeof userProfile !== 'undefined' ? userProfile : null;
    const u = typeof currentUser !== 'undefined' ? currentUser : null;
    return String((p && (p.name || p.displayName)) || (u && u.displayName) || 'You').trim().slice(0, 24);
  }
  function deviceId() {
    try {
      return typeof getOrCreateDeviceId === 'function' ? String(getOrCreateDeviceId() || '') : '';
    } catch (e) {
      return '';
    }
  }
  function persistable(uid) {
    return !!uid && (typeof isPersistableUid !== 'function' || isPersistableUid(uid));
  }
  function fmtClock(ms) {
    if (ms == null) return '';
    const t = Math.max(0, ms);
    if (t < 10000) return (t / 1000).toFixed(1);
    const s = Math.ceil(t / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(sec).padStart(2, '0');
  }
  function fmtDaily(ms) {
    const t = Math.max(0, ms);
    const d = Math.floor(t / 86400000);
    const h = Math.floor((t % 86400000) / 3600000);
    const m = Math.floor((t % 3600000) / 60000);
    if (d) return d + 'd ' + h + 'h';
    if (h) return h + 'h ' + m + 'm';
    return m + 'm';
  }
  function tcLabel(tc) {
    if (!tc) return 'No clock';
    if (tc.days) return tc.days === 1 ? 'Daily · 1 day' : 'Daily · ' + tc.days + ' days';
    if (!tc.base && !tc.min) return 'No clock';
    const min = tc.min != null ? tc.min : tc.base / 60000;
    const inc = tc.inc != null && tc.min != null ? tc.inc : (tc.inc || 0) / 1000;
    return (Math.round(min * 10) / 10) + '+' + inc;
  }
  function bucketOfTc(min, inc, days) {
    if (days) return 'daily';
    if (!min) return '';
    const est = min * 60 + 40 * inc;
    return est < 180 ? 'bullet' : est < 480 ? 'blitz' : est < 1500 ? 'rapid' : 'classical';
  }
  function speakSan(san, color) {
    const who = color === 'w' ? 'White' : 'Black';
    if (/^O-O-O/.test(san)) return who + ' castles queenside';
    if (/^O-O/.test(san)) return who + ' castles kingside';
    const m = /^([KQRBN])?([a-h]?[1-8]?)(x)?([a-h][1-8])(=([QRBN]))?([+#])?/.exec(san) || [];
    const piece = m[1] ? PIECE_NAMES[m[1].toLowerCase()] : 'pawn';
    let s = who + ' ' + piece + (m[3] ? ' takes ' : ' to ') + (m[4] || '');
    if (m[6]) s += ', promotes to ' + PIECE_NAMES[m[6].toLowerCase()];
    if (m[7] === '#') s += ', checkmate';
    else if (m[7] === '+') s += ', check';
    return s;
  }

  // ---------------- lazy assets ----------------

  const loaded = {};
  function scriptUrl(rel) {
    const tag = document.querySelector(`script[src*="/src/js/${rel}"]`);
    return (tag && tag.getAttribute('src')) || '/src/js/' + rel;
  }
  function absUrl(rel) {
    try {
      return new URL(scriptUrl(rel), location.href).href;
    } catch (e) {
      return scriptUrl(rel);
    }
  }
  function loadLazy(rel) {
    if (!loaded[rel]) {
      loaded[rel] = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = scriptUrl(rel);
        s.async = false;
        s.onload = () => resolve();
        s.onerror = () => {
          delete loaded[rel];
          s.remove();
          reject(new Error('lazy_load_failed'));
        };
        document.head.appendChild(s);
      });
    }
    return loaded[rel];
  }
  function ecoName(sans) {
    if (!window.ChessEco) {
      loadLazy('games/chess-eco.js').catch(() => {});
      return null;
    }
    return window.ChessEco.lookup(sans);
  }

  // ---------------- engine client (Web Worker, main-thread fallback) ----------------

  const Engine = (function () {
    let worker = null;
    let ready = null;
    let seq = 0;
    const pending = new Map();
    function start() {
      if (ready) return ready;
      ready = new Promise((resolve, reject) => {
        try {
          worker = new Worker(scriptUrl('games/chess-worker.js'));
        } catch (e) {
          worker = null;
          reject(e);
          return;
        }
        worker.onmessage = (e) => {
          const d = e.data || {};
          const p = pending.get(d.id);
          if (!p) return;
          if (d.progress != null) {
            if (p.onProgress) p.onProgress(d.progress);
            return;
          }
          pending.delete(d.id);
          if (d.ok) p.resolve(d.result);
          else p.reject(new Error(d.error || 'engine_error'));
        };
        worker.onerror = () => {
          pending.forEach((p) => p.reject(new Error('engine_crashed')));
          pending.clear();
          try {
            worker.terminate();
          } catch (e) {}
          worker = null;
          ready = null;
          reject(new Error('engine_crashed'));
        };
        const id = ++seq;
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, type: 'init', urls: [absUrl('games/chess-core.js'), absUrl('games/chess-search.js')] });
      });
      return ready;
    }
    /** Low-end / no-Worker path: the same search, shallow limits, on the main thread. */
    async function fallback(msg, onProgress) {
      await loadLazy('games/chess-search.js');
      const Core = window.ChessCore;
      const S = window.ChessSearch;
      const g = new Core.Game({ fen: msg.startFen || Core.START_FEN, chess960: !!msg.chess960 });
      const moves = msg.moves || [];
      const describe = (pos, r) => ({
        move: r.move ? Core.uciOf(pos, r.move) : null,
        score: r.score,
        mate: S.mateIn(r.score),
        depth: r.depth,
        pv: (r.pv || []).map((m) => Core.uciOf(pos, m)),
      });
      if (msg.type === 'review') {
        const out = [];
        const s = new S.Searcher({ ttBits: 16 });
        for (let i = 0; i <= moves.length; i++) {
          if (g.outcome()) out.push({ score: g.isCheckmate() ? -S.MATE : 0, mate: 0, best: '', pv: [] });
          else out.push(describe(g.pos, s.search(g.pos, { depth: 3, timeMs: 120 })));
          if (onProgress) onProgress((i + 1) / (moves.length + 1));
          if (i < moves.length) g.move(moves[i]);
          await new Promise((r) => setTimeout(r, 0));
        }
        return out.map((a) => Object.assign({ best: a.move }, a));
      }
      moves.forEach((u) => g.move(u));
      if (msg.type === 'bot') return describe(g.pos, S.botMove(g.pos, { level: Math.min(5, msg.level || 3), persona: msg.persona }));
      return describe(g.pos, new S.Searcher({ ttBits: 16 }).search(g.pos, { depth: 4, timeMs: 400 }));
    }
    async function call(msg, onProgress) {
      try {
        await start();
      } catch (e) {
        return fallback(msg, onProgress);
      }
      return new Promise((resolve, reject) => {
        const id = ++seq;
        pending.set(id, { resolve, reject, onProgress });
        worker.postMessage(Object.assign({ id }, msg));
      }).then((r) => {
        if (msg.type === 'review') return r.map((a) => Object.assign({ best: a.move }, a));
        return r;
      });
    }
    return {
      bot: (m) => call(Object.assign({ type: 'bot' }, m)),
      analyse: (m) => call(Object.assign({ type: 'analyse' }, m)),
      review: (m, onProgress) => call(Object.assign({ type: 'review' }, m), onProgress),
    };
  })();

  // ---------------- server calls ----------------

  let rtt = 200;
  async function liveCall(op, args) {
    if (typeof apiFetch !== 'function') throw Object.assign(new Error('You’re offline'), { code: 'OFFLINE' });
    const t0 = Date.now();
    const res = await apiFetch('/api/media-config', {
      method: 'POST',
      needAuth: true,
      body: Object.assign({ action: 'chess_game', op }, args || {}),
    });
    rtt = Math.round(rtt * 0.7 + (Date.now() - t0) * 0.3);
    if (!res || !res.ok) {
      const e = new Error((res && res.error && res.error.message) || 'Something went wrong — try again');
      e.code = (res && res.error && res.error.code) || 'ERROR';
      throw e;
    }
    return res.data || res;
  }
  function liveErrorText(e) {
    const code = String((e && e.code) || '').toUpperCase();
    if (code === 'OFFLINE') return 'You’re offline — reconnect to keep playing';
    if (code === 'RATE_LIMITED') return 'Slow down a little and try again';
    if (code === 'NOT_IN_MATCH') return 'This game is for two other players';
    return (e && e.message) || 'Something went wrong — try again';
  }

  // ---------------- panel (full-screen sheet on the device) ----------------

  function openPanel(opts) {
    const device = document.querySelector('.device');
    if (!device) return null;
    const el = document.createElement('div');
    el.className = 'chess-panel game-overlay game-overlay--dark';
    const backId = 'chessPanelBack' + Date.now().toString(36);
    el.innerHTML =
      (typeof gameChromeHtml === 'function'
        ? gameChromeHtml({ title: opts.title || 'Chess', subtitle: opts.subtitle || '', backId, rightHtml: opts.rightHtml || '' })
        : `<div class="chess-panel__head"><button type="button" id="${backId}" class="game-tap-target">‹</button><b>${esc(opts.title || 'Chess')}</b></div>`) +
      '<div class="chess-panel__body"></div>';
    device.appendChild(el);
    if (typeof prepareGameOverlay === 'function') prepareGameOverlay(el, { theme: 'dark', gameId: GAME });
    const unregister =
      typeof registerScopedOverlay === 'function'
        ? registerScopedOverlay(typeof OVERLAY_SCOPE_CHAT !== 'undefined' ? OVERLAY_SCOPE_CHAT : 'chat', el, () => close())
        : null;
    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      if (unregister) unregister();
      if (opts.onClose) opts.onClose();
      el.remove();
    }
    el.querySelector('#' + backId)?.addEventListener('click', close);
    return { el, body: el.querySelector('.chess-panel__body'), close, alive: () => !closed };
  }

  /** Small bottom sheet with option buttons. Resolves the picked id (or null). */
  function pickSheet(title, items, opts) {
    return new Promise((resolve) => {
      const device = document.querySelector('.device');
      if (!device) return resolve(null);
      const el = document.createElement('div');
      el.className = 'chess-sheet';
      el.innerHTML = `<div class="chess-sheet__panel" role="dialog" aria-label="${esc(title)}">
        <div class="chess-sheet__title">${esc(title)}</div>
        ${opts && opts.note ? `<div class="chess-sheet__note">${esc(opts.note)}</div>` : ''}
        <div class="chess-sheet__list">${items
          .filter(Boolean)
          .map((it) => `<button type="button" class="chess-sheet__item game-tap-target" data-id="${esc(it.id)}"${it.disabled ? ' disabled' : ''}>${esc(it.label)}${it.hint ? `<small>${esc(it.hint)}</small>` : ''}</button>`)
          .join('')}</div>
        <button type="button" class="chess-sheet__cancel game-tap-target" data-id="">${esc((opts && opts.cancelLabel) || 'Close')}</button>
      </div>`;
      device.appendChild(el);
      const done = (v) => {
        el.remove();
        resolve(v);
      };
      el.addEventListener('click', (e) => {
        if (e.target === el) return done(null);
        const b = e.target.closest('[data-id]');
        if (b && !b.disabled) done(b.dataset.id || null);
      });
    });
  }

  function confirmSheet(title, body, okLabel) {
    return pickSheet(title, [{ id: 'ok', label: okLabel || 'OK' }], { note: body, cancelLabel: 'Keep playing' }).then((v) => v === 'ok');
  }

  // ---------------- board view ----------------

  function glyphFor(piece, set) {
    if (set === 'outline') return (piece.color === 'w' ? GLYPHS.outline : GLYPHS.solid)[piece.type] + VS;
    return GLYPHS.solid[piece.type] + VS;
  }

  /**
   * Interactive board. `o`:
   *   canSelect(sq) → bool · targets(sq) → [{ to, promotion }] · onMove({ from, to, promotion })
   */
  function createBoard(host, o) {
    const el = document.createElement('div');
    el.className = 'chess-board2';
    el.setAttribute('role', 'grid');
    el.setAttribute('aria-label', 'Chess board');
    host.appendChild(el);
    let view = null;
    let selected = null;
    let targets = [];
    let drag = null;
    let hint = null;

    function squares(orientation) {
      const out = [];
      const ranks = orientation === 'b' ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
      const files = orientation === 'b' ? 'hgfedcba' : 'abcdefgh';
      ranks.forEach((r) => files.split('').forEach((f) => out.push(f + r)));
      return out;
    }

    function paint(v) {
      if (v) view = v;
      if (!view) return;
      const st = settings();
      const theme = THEMES[st.theme] || THEMES.classic;
      el.style.setProperty('--sq-light', theme.light);
      el.style.setProperty('--sq-dark', theme.dark);
      el.classList.toggle('chess-board2--contrast', st.theme === 'contrast');
      const sqs = squares(view.orientation);
      const bottomRank = view.orientation === 'b' ? '8' : '1';
      const leftFile = view.orientation === 'b' ? 'h' : 'a';
      const targetSet = new Set(targets.map((t) => t.to));
      el.innerHTML = sqs
        .map((sq) => {
          const f = sq.charCodeAt(0) - 97;
          const r = Number(sq[1]) - 1;
          const light = (f + r) % 2 === 1;
          const piece = view.pieceAt(sq);
          const cls = ['cb-sq', light ? 'cb-sq--l' : 'cb-sq--d'];
          if (view.lastMove && (view.lastMove.from === sq || view.lastMove.to === sq)) cls.push('cb-sq--last');
          if (selected === sq) cls.push('cb-sq--sel');
          if (view.checkSq === sq) cls.push('cb-sq--check');
          if (view.premove && (view.premove.from === sq || view.premove.to === sq)) cls.push('cb-sq--pre');
          if (hint && (hint.from === sq || hint.to === sq)) cls.push('cb-sq--hint');
          const isTarget = targetSet.has(sq);
          const label = sq + (piece ? ', ' + (piece.color === 'w' ? 'white ' : 'black ') + PIECE_NAMES[piece.type] : '');
          const coords = st.coords
            ? (sq[1] === bottomRank ? `<span class="cb-file">${sq[0]}</span>` : '') + (sq[0] === leftFile ? `<span class="cb-rank">${sq[1]}</span>` : '')
            : '';
          const dot = isTarget && st.legalDots ? `<span class="${piece ? 'cb-ring' : 'cb-dot'}"></span>` : '';
          const pc = piece
            ? `<span class="cb-pc cb-pc--${piece.color}${drag && drag.from === sq && drag.moving ? ' cb-pc--ghosted' : ''}">${glyphFor(piece, st.pieces)}</span>`
            : '';
          return `<div class="${cls.join(' ')}" role="gridcell" tabindex="-1" data-sq="${sq}" aria-label="${label}">${coords}${pc}${dot}</div>`;
        })
        .join('');
    }

    function clearSelection() {
      selected = null;
      targets = [];
    }

    function promoPick(from, to, color) {
      return new Promise((resolve) => {
        if (settings().autoQueen) return resolve('q');
        const pick = document.createElement('div');
        pick.className = 'cb-promo';
        pick.setAttribute('role', 'dialog');
        pick.setAttribute('aria-label', 'Promote to');
        pick.innerHTML =
          ['q', 'r', 'b', 'n']
            .map((t) => `<button type="button" class="cb-promo__btn game-tap-target" data-p="${t}" aria-label="${PIECE_NAMES[t]}"><span class="cb-pc cb-pc--${color}">${glyphFor({ type: t, color }, settings().pieces)}</span></button>`)
            .join('') + '<button type="button" class="cb-promo__x game-tap-target" data-p="" aria-label="Cancel">×</button>';
        host.appendChild(pick);
        pick.addEventListener('click', (e) => {
          const b = e.target.closest('[data-p]');
          if (!b) return;
          pick.remove();
          resolve(b.dataset.p || null);
        });
      });
    }

    async function tryMove(from, to) {
      const t = targets.filter((x) => x.to === to);
      if (!t.length) return false;
      let promotion;
      if (t.some((x) => x.promotion)) {
        const piece = view.pieceAt(from);
        promotion = await promoPick(from, to, piece ? piece.color : 'w');
        if (!promotion) {
          paint();
          return false;
        }
      }
      clearSelection();
      hint = null;
      o.onMove({ from, to, promotion });
      return true;
    }

    function sqFromEvent(e) {
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const cell = hit && hit.closest && hit.closest('[data-sq]');
      return cell && el.contains(cell) ? cell.dataset.sq : null;
    }

    el.addEventListener('pointerdown', (e) => {
      const cell = e.target.closest('[data-sq]');
      if (!cell || !view || !view.interactive) return;
      const sq = cell.dataset.sq;
      if (selected && targets.some((t) => t.to === sq)) {
        tryMove(selected, sq);
        return;
      }
      if (o.canSelect(sq)) {
        if (selected === sq) {
          drag = { from: sq, x: e.clientX, y: e.clientY, moving: false, toggle: true };
        } else {
          selected = sq;
          targets = o.targets(sq);
          drag = { from: sq, x: e.clientX, y: e.clientY, moving: false };
          feedback('select');
          paint();
        }
        try {
          el.setPointerCapture(e.pointerId);
        } catch (err) {}
      } else if (selected) {
        clearSelection();
        paint();
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag) return;
      if (!drag.moving && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) {
        drag.moving = true;
        const piece = view.pieceAt(drag.from);
        const ghost = document.createElement('div');
        ghost.className = 'cb-ghost';
        const size = el.getBoundingClientRect().width / 8;
        ghost.style.width = ghost.style.height = size + 'px';
        ghost.style.fontSize = size * 0.8 + 'px';
        ghost.innerHTML = piece ? `<span class="cb-pc cb-pc--${piece.color}">${glyphFor(piece, settings().pieces)}</span>` : '';
        document.body.appendChild(ghost);
        drag.ghost = ghost;
        paint();
      }
      if (drag.ghost) {
        const size = parseFloat(drag.ghost.style.width) || 40;
        drag.ghost.style.transform = `translate(${e.clientX - size / 2}px, ${e.clientY - size / 2}px)`;
      }
    });
    function endDrag(e) {
      if (!drag) return;
      const d = drag;
      drag = null;
      if (d.ghost) d.ghost.remove();
      if (d.moving) {
        const to = e ? sqFromEvent(e) : null;
        if (to && to !== d.from && targets.some((t) => t.to === to)) {
          tryMove(d.from, to);
          return;
        }
        paint();
        return;
      }
      if (d.toggle) {
        clearSelection();
        paint();
      }
    }
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', () => endDrag(null));
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const cell = e.target.closest('[data-sq]');
      if (!cell) return;
      e.preventDefault();
      const sq = cell.dataset.sq;
      if (selected && targets.some((t) => t.to === sq)) tryMove(selected, sq);
      else if (o.canSelect(sq)) {
        selected = sq;
        targets = o.targets(sq);
        paint();
      }
    });
    el.tabIndex = 0;

    return {
      el,
      paint,
      clear() {
        clearSelection();
        paint();
      },
      setHint(h) {
        hint = h;
        paint();
      },
      destroy() {
        if (drag && drag.ghost) drag.ghost.remove();
        el.remove();
      },
    };
  }

  function boardViewOf(game, extra) {
    const b = game.board();
    const map = {};
    b.forEach((row) => row.forEach((c) => c && (map[c.square] = c)));
    let checkSq = null;
    if (game.isCheck()) {
      const turn = game.turn();
      Object.keys(map).forEach((sq) => {
        if (map[sq].type === 'k' && map[sq].color === turn) checkSq = sq;
      });
    }
    return Object.assign({ pieceAt: (sq) => map[sq] || null, checkSq }, extra || {});
  }

  function moveTargets(g, sq) {
    const out = [];
    g.moves({ square: sq, verbose: true }).forEach((m) => {
      out.push({ to: m.to, promotion: m.promotion });
      if (m.kingTo && m.kingTo !== m.to && m.kingTo !== m.from) out.push({ to: m.kingTo });
    });
    return out;
  }

  function gameAt(startFen, chess960, moves, ply) {
    const g = new window.ChessCore.Game({ fen: startFen, chess960 });
    const n = ply == null ? moves.length : ply;
    for (let i = 0; i < n; i++) if (!g.move(moves[i])) break;
    return g;
  }

  function capturedHtml(game, color) {
    const mat = game.material();
    const order = { q: 0, r: 1, b: 2, n: 3, p: 4 };
    const list = mat.captured[color].slice().sort((a, b) => order[a] - order[b]);
    const other = color === 'w' ? 'b' : 'w';
    const lead = color === 'w' ? mat.diff : -mat.diff;
    return `<span class="chess-caps">${list.map((t) => `<span class="cb-pc cb-pc--${other}">${glyphFor({ type: t, color: other }, 'solid')}</span>`).join('')}${lead > 0 ? `<b>+${lead}</b>` : ''}</span>`;
  }

  function moveListHtml(sans, startBlack, viewPly, cls) {
    if (!sans.length) return '<div class="chess-moves__empty">Moves appear here</div>';
    let n = 1;
    const rows = [];
    let row = [];
    sans.forEach((san, i) => {
      const white = startBlack ? i % 2 === 1 : i % 2 === 0;
      if (white || (i === 0 && startBlack)) {
        if (row.length) rows.push(row);
        row = [`<span class="chess-moves__n">${n}.</span>`];
        if (i === 0 && startBlack) row.push('<span class="chess-moves__m">…</span>');
      }
      const c = cls && cls[i] ? ' chess-moves__m--' + cls[i] : '';
      row.push(`<button type="button" class="chess-moves__m${viewPly === i + 1 ? ' is-on' : ''}${c}" data-ply="${i + 1}">${esc(san)}</button>`);
      if (!white) n++;
    });
    if (row.length) rows.push(row);
    return rows.map((r) => `<span class="chess-moves__row">${r.join('')}</span>`).join('');
  }

  function evalGraphSvg(values, cur) {
    const W = 300, H = 64;
    if (!values.length) return '';
    const clamp = (v) => Math.max(-800, Math.min(800, v));
    const pts = [[0, H / 2]].concat(values.map((v, i) => [((i + 1) / values.length) * W, H / 2 - (clamp(v) / 800) * (H / 2 - 2)]));
    const line = pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    const area = `0,${H} ` + line + ` ${W},${H}`;
    const cx = cur ? (cur / values.length) * W : 0;
    return `<svg class="chess-graph" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Evaluation graph">
      <rect x="0" y="0" width="${W}" height="${H}" fill="#2a2f45"/>
      <polygon points="${area}" fill="#e8e6df"/>
      <line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="#888" stroke-width="0.5"/>
      ${cur ? `<line x1="${cx}" y1="0" x2="${cx}" y2="${H}" stroke="var(--gold,#c9a227)" stroke-width="1.5"/>` : ''}
    </svg>`;
  }

  // ---------------- time-control sheet (friend challenges + registry) ----------------

  /**
   * @returns {Promise<{min:number,inc:number,label:string,chess960:boolean,days:number,rated:boolean}|null>}
   */
  function timeSheet(opts) {
    const o = opts || {};
    return new Promise((resolve) => {
      const device = document.querySelector('.device');
      if (!device) return resolve({ min: 5, inc: 0, label: '5+0', chess960: false, days: 0, rated: false });
      let chess960 = !!o.defaultChess960;
      let rated = !!o.defaultRated;
      const el = document.createElement('div');
      el.className = 'chess-sheet';
      const cats = [...new Set(TC_PRESETS.map((t) => t.cat))];
      el.innerHTML = `<div class="chess-sheet__panel chess-tc" role="dialog" aria-label="Time control">
        <div class="chess-sheet__title">Time control</div>
        ${cats
          .map(
            (cat) => `<div class="chess-tc__cat">${cat}</div><div class="chess-tc__grid">${TC_PRESETS.filter((t) => t.cat === cat)
              .map((t) => `<button type="button" class="chess-chip game-tap-target${o.defaultMin === t.min && (o.defaultInc || 0) === t.inc ? ' is-on' : ''}" data-min="${t.min}" data-inc="${t.inc}">${t.id}</button>`)
              .join('')}</div>`
          )
          .join('')}
        ${o.noDaily ? '' : `<div class="chess-tc__cat">Daily</div><div class="chess-tc__grid">${DAILY.map((d) => `<button type="button" class="chess-chip game-tap-target" data-days="${d.days}">${d.label}</button>`).join('')}</div>`}
        <details class="chess-adv"><summary>Advanced</summary>
          <div class="chess-tc__custom">
            <label>Minutes <input type="number" min="0.5" max="180" step="0.5" value="7" data-cmin inputmode="decimal"></label>
            <label>Increment (s) <input type="number" min="0" max="60" step="1" value="5" data-cinc inputmode="numeric"></label>
            <button type="button" class="chess-chip game-tap-target" data-custom>Use custom</button>
          </div>
          <button type="button" class="chess-toggle game-tap-target" data-960 aria-pressed="${chess960}">Chess960 (Fischer Random): ${chess960 ? 'On' : 'Off'}</button>
          ${o.noRated ? '' : `<button type="button" class="chess-toggle game-tap-target" data-rated aria-pressed="${rated}">Rated: ${rated ? 'On' : 'Off'}</button>`}
          <button type="button" class="chess-chip game-tap-target" data-none>No clock (unrated)</button>
        </details>
        <button type="button" class="chess-sheet__cancel game-tap-target" data-cancel>Cancel</button>
      </div>`;
      device.appendChild(el);
      const done = (v) => {
        el.remove();
        resolve(v);
      };
      el.addEventListener('click', (e) => {
        if (e.target === el || e.target.closest('[data-cancel]')) return done(null);
        const t = e.target.closest('button');
        if (!t) return;
        if (t.hasAttribute('data-960')) {
          chess960 = !chess960;
          t.setAttribute('aria-pressed', String(chess960));
          t.textContent = 'Chess960 (Fischer Random): ' + (chess960 ? 'On' : 'Off');
          return;
        }
        if (t.hasAttribute('data-rated')) {
          rated = !rated;
          t.setAttribute('aria-pressed', String(rated));
          t.textContent = 'Rated: ' + (rated ? 'On' : 'Off');
          return;
        }
        if (t.dataset.days) {
          const days = Number(t.dataset.days);
          return done({ min: 0, inc: 0, days, label: 'daily' + days, chess960, rated });
        }
        if (t.hasAttribute('data-none')) return done({ min: 0, inc: 0, days: 0, label: 'none', chess960, rated: false });
        if (t.hasAttribute('data-custom')) {
          const min = Math.max(0.5, Math.min(180, Number(el.querySelector('[data-cmin]').value) || 5));
          const inc = Math.max(0, Math.min(60, Math.round(Number(el.querySelector('[data-cinc]').value) || 0)));
          return done({ min, inc, days: 0, label: min + '+' + inc, chess960, rated });
        }
        if (t.dataset.min) {
          const min = Number(t.dataset.min), inc = Number(t.dataset.inc) || 0;
          return done({ min, inc, days: 0, label: min + '+' + inc, chess960, rated });
        }
      });
    });
  }

  function tcPayload(tc) {
    return {
      min: tc.min,
      inc: tc.inc,
      timeMin: tc.min,
      timeInc: tc.inc,
      days: tc.days || 0,
      rated: !!tc.rated,
      chess960: !!tc.chess960,
      timeControl: tc.label,
      timeControlLabel: tc.label,
    };
  }

  function tcFromLaunch(launch, raw) {
    const L = launch || {};
    const A = raw || {};
    const tcObj = L.timeControl && typeof L.timeControl === 'object' ? L.timeControl : null;
    const days = Number(L.days ?? A.days ?? (tcObj && tcObj.days)) || 0;
    const min = Number(L.min ?? L.timeMin ?? (tcObj && tcObj.min) ?? A.timeMin ?? A.min) || 0;
    const inc = Number(L.inc ?? L.timeInc ?? (tcObj && tcObj.inc) ?? A.timeInc ?? A.inc) || 0;
    return {
      min,
      inc,
      days,
      chess960: !!(L.chess960 ?? A.chess960 ?? (tcObj && tcObj.chess960)),
      rated: L.rated === true || A.rated === true,
    };
  }

  // ---------------- licences + settings ----------------

  function openLicences() {
    const p = openPanel({ title: 'Licences', subtitle: 'Chess' });
    if (!p) return;
    p.body.innerHTML = `<div class="chess-doc">
      <h3>Chess engine</h3>
      <p>The chess engine, bots, game review and rules core are original Chaupaal code (no third-party engine is bundled). We chose our own engine instead of Stockfish so the app does not ship GPL-licensed code.</p>
      <h3>Opening names</h3>
      <p>ECO codes and opening names are standard public-domain chess nomenclature.</p>
      <h3>chess.js</h3>
      <p>Used only in development tests to cross-check our move generator. © Jeff Hlywa — BSD 2-Clause licence. Not shipped to your device.</p>
      <h3>Rules</h3>
      <p>${esc((typeof federationHonestyLine === 'function' && federationHonestyLine(GAME)) || 'Rules based on the Laws of Chess')}. Chaupaal is not affiliated with any chess federation.</p>
    </div>`;
  }

  function openSettings(onChange) {
    const p = openPanel({ title: 'Chess settings', onClose: onChange });
    if (!p) return;
    function paint() {
      const s = settings();
      const toggle = (key, label, hint) =>
        `<button type="button" class="chess-toggle game-tap-target" data-key="${key}" aria-pressed="${!!s[key]}">${esc(label)}: ${s[key] ? 'On' : 'Off'}${hint ? `<small>${esc(hint)}</small>` : ''}</button>`;
      p.body.innerHTML = `<div class="chess-settings">
        <div class="chess-tc__cat">Board</div>
        <div class="chess-tc__grid">${Object.keys(THEMES).map((k) => `<button type="button" class="chess-chip game-tap-target${s.theme === k ? ' is-on' : ''}" data-theme="${k}">${THEMES[k].label}</button>`).join('')}</div>
        <div class="chess-tc__cat">Pieces</div>
        <div class="chess-tc__grid"><button type="button" class="chess-chip game-tap-target${s.pieces === 'solid' ? ' is-on' : ''}" data-pieces="solid">Solid</button><button type="button" class="chess-chip game-tap-target${s.pieces === 'outline' ? ' is-on' : ''}" data-pieces="outline">Classic</button></div>
        <div class="chess-tc__cat">Play</div>
        ${toggle('autoClaim', 'Auto-claim draws', 'Threefold repetition and the 50-move rule end the game automatically')}
        ${toggle('autoQueen', 'Auto-queen', 'Skip the promotion picker')}
        ${toggle('premove', 'Premoves', 'Queue a move during your opponent’s turn (Bullet and Blitz)')}
        ${toggle('legalDots', 'Show legal moves')}
        ${toggle('coords', 'Coordinates')}
        ${toggle('sound', 'Sounds')}
        <button type="button" class="chess-link game-tap-target" data-licences>Licences</button>
      </div>`;
    }
    paint();
    p.body.addEventListener('click', (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.theme) saveSettings({ theme: t.dataset.theme });
      else if (t.dataset.pieces) saveSettings({ pieces: t.dataset.pieces });
      else if (t.dataset.key) saveSettings({ [t.dataset.key]: !settings()[t.dataset.key] });
      else if (t.hasAttribute('data-licences')) return openLicences();
      paint();
    });
  }

  // ---------------- the game screen (practice / live / daily / spectate) ----------------

  /**
   * cfg: { mode: 'practice'|'live'|'spectate', chat,
   *        practice: { level, persona, color, tc:{min,inc}, chess960, startFen },
   *        live: { matchId, opp, host, tc, stake, rated, oppName } }
   */
  function playGame(cfg) {
    const Core = window.ChessCore;
    const mode = cfg.mode;
    const me = myUid();
    const st0 = settings();
    const P = cfg.practice || {};
    const L = cfg.live || {};
    const S = window.ChessSearch;

    let startFen = P.startFen || Core.START_FEN;
    let chess960 = !!P.chess960;
    if (mode === 'practice' && chess960 && !P.startFen) startFen = Core.chess960Fen(Math.floor(Math.random() * 960));
    let game = new Core.Game({ fen: startFen, chess960 });
    let myColor = mode === 'practice' ? (P.color === 'b' ? 'b' : 'w') : 'w';
    let orientation = myColor;
    let viewPly = null;
    let ended = null;
    let pub = null;
    let offset = 0;
    let premove = null;
    let pendingMove = null;
    let botBusy = false;
    let role = mode === 'spectate' ? 'spectator' : 'player';
    let lowWarned = false;
    let resultShown = false;
    let lastTick = 0;
    let presence = {};
    let hintOn = false;
    let orientationSet = false;
    let specNames = null;
    let clockTimer = null;
    const subs = [];
    let presRef = null;
    let beat = null;
    const tc = mode === 'practice' ? P.tc || { min: 0, inc: 0 } : null;
    const clocks = tc && tc.min ? { w: tc.min * 60000, b: tc.min * 60000, at: 0, running: false } : null;

    const overlay = document.createElement('div');
    overlay.className = 'chess-play2 game-overlay game-overlay--dark';
    const gs = beginGameOverlaySession({
      type: GAME,
      title: 'Chess',
      mode: mode === 'practice' ? 'practice' : 'live',
      chat: cfg.chat,
      overlay,
      opponentUid: mode === 'live' ? L.opp : '',
      matchId: mode === 'live' ? L.matchId : '',
      stake: mode === 'live' ? L.stake || 0 : 0,
      skipEconomyReport: mode !== 'practice',
      cleanup() {
        if (clockTimer) clearInterval(clockTimer);
        clockTimer = null;
        subs.forEach((f) => {
          try {
            f();
          } catch (e) {}
        });
        if (beat) clearInterval(beat);
        try {
          if (presRef) presRef.set({ at: Date.now() + offset, online: false }).catch(() => {});
        } catch (e) {}
        board && board.destroy();
      },
    });
    if (!gs.alive()) return;

    const isLive = mode === 'live';
    const isDaily = () => !!(pub && pub.tc && pub.tc.days);
    const serverNow = () => Date.now() + offset;
    const oppUid = () => (pub ? (pub.white === me ? pub.black : pub.white) : L.opp);
    const names = () => {
      if (mode === 'practice') {
        const bot = botLabel(P.level, P.persona);
        return myColor === 'w' ? { w: myName(), b: bot } : { w: bot, b: myName() };
      }
      if (specNames) return specNames;
      const nm = (pub && pub.names) || {};
      const w = pub ? pub.white : '';
      const b = pub ? pub.black : '';
      return { w: w === me ? myName() : nm[w] || L.oppName || 'White', b: b === me ? myName() : nm[b] || L.oppName || 'Black' };
    };

    overlay.innerHTML = `
      ${typeof gameChromeHtml === 'function' ? gameChromeHtml({ title: 'Chess', subtitle: '', backId: 'chess2Back', rightHtml: '<button type="button" id="chess2More" class="game-chrome-action game-tap-target" aria-label="More options">⋯</button>' }) : ''}
      <div class="chess2-banner" data-banner hidden role="status"></div>
      <div class="chess2-rail" data-rail="top"></div>
      <div class="chess2-boardwrap"><div class="chess2-board" data-board></div></div>
      <div class="chess2-rail" data-rail="bottom"></div>
      <div class="chess2-opening" data-opening></div>
      <div class="chess-moves" data-moves aria-label="Move list"></div>
      <div class="chess2-nav" data-nav>
        <button type="button" class="game-tap-target" data-nav-go="first" aria-label="First move">«</button>
        <button type="button" class="game-tap-target" data-nav-go="prev" aria-label="Previous move">‹</button>
        <button type="button" class="game-tap-target" data-nav-go="next" aria-label="Next move">›</button>
        <button type="button" class="game-tap-target" data-nav-go="last" aria-label="Latest move">»</button>
      </div>
      <div class="chess2-actions" data-actions></div>
      <div class="chess2-result" data-result hidden></div>
      <div class="sr-only" aria-live="polite" data-announce></div>`;
    const $ = (s) => overlay.querySelector(s);
    const subtitleEl = overlay.querySelector('.game-chrome__subtitle, .game-chrome-subtitle, [data-chrome-subtitle]');

    const board = createBoard($('[data-board]'), {
      canSelect(sq) {
        if (viewPly != null || ended || role !== 'player') return false;
        const p = game.get(sq);
        if (!p || p.color !== myColor) return false;
        if (game.turn() === myColor) return !botBusy && !pendingMove;
        return isLive && premoveAllowed();
      },
      targets(sq) {
        if (game.turn() === myColor) return moveTargets(game, sq);
        return premoveTargets(sq);
      },
      onMove(mv) {
        if (game.turn() !== myColor) {
          premove = mv;
          paint();
          return;
        }
        humanMove(mv);
      },
    });

    function botLabel(level, persona) {
      const info = S ? S.levelInfo(level) : { level, approx: 0 };
      const pName = persona && S && S.PERSONAS[persona] ? S.PERSONAS[persona].label + ' ' : '';
      return `${pName}Bot · Level ${info.level}${info.approx ? ' (≈' + info.approx + ')' : ''}`;
    }

    function premoveAllowed() {
      if (!settings().premove || !pub || !pub.tc || pub.tc.days) return false;
      const b = bucketOfTc(pub.tc.base / 60000, pub.tc.inc / 1000, 0);
      return b === 'bullet' || b === 'blitz';
    }
    function premoveTargets(sq) {
      // Pseudo targets from a position where it is our turn (legality is checked when it fires).
      try {
        const parts = game.fen().split(' ');
        parts[1] = myColor;
        parts[3] = '-';
        return moveTargets(new Core.Game({ fen: parts.join(' '), chess960 }), sq);
      } catch (e) {
        return [];
      }
    }

    function announce(text) {
      const a = $('[data-announce]');
      if (a) a.textContent = text;
    }

    // ---- clocks ----
    function clockMs(color) {
      if (mode === 'practice') {
        if (!clocks) return null;
        let ms = clocks[color];
        if (clocks.running && game.turn() === color && !ended) ms -= Date.now() - clocks.at;
        return ms;
      }
      if (!pub || !pub.tc || pub.tc.days || !pub.tc.base) return null;
      const c = pub.clock || {};
      let ms = Number(c[color]) || 0;
      if (c.running && pub.turn === color && pub.status === 'playing') ms -= Math.max(0, serverNow() - (Number(c.at) || serverNow()));
      return ms;
    }
    function clockHtml(color) {
      if (isLive && isDaily()) {
        const active = pub.status === 'playing' && pub.turn === color;
        return `<span class="chess2-clock chess2-clock--daily${active ? ' is-on' : ''}">${active ? fmtDaily(pub.deadline - serverNow()) + ' left' : ''}</span>`;
      }
      const ms = clockMs(color);
      if (ms == null) return '';
      const active = !ended && game.turn() === color && (mode === 'practice' ? clocks && clocks.running : pub && pub.clock && pub.clock.running);
      const low = ms < 20000;
      return `<span class="chess2-clock${active ? ' is-on' : ''}${low ? ' is-low' : ''}" data-clock="${color}">${fmtClock(ms)}</span>`;
    }
    function tickClocks() {
      if (!gs.alive()) return;
      ['w', 'b'].forEach((c) => {
        const el = overlay.querySelector(`[data-clock="${c}"]`);
        if (!el) return;
        const ms = clockMs(c);
        el.textContent = fmtClock(ms);
        el.classList.toggle('is-low', ms != null && ms < 20000);
      });
      const mine = clockMs(myColor);
      const base = mode === 'practice' ? (tc && tc.min * 60000) || 0 : (pub && pub.tc && pub.tc.base) || 0;
      if (!ended && mine != null && base && game.turn() === myColor && mine < Math.max(10000, Math.min(20000, base * 0.1))) {
        if (!lowWarned) {
          lowWarned = true;
          feedback('turn');
        }
      } else if (mine != null && mine > 25000) lowWarned = false;
      if (mode === 'practice' && clocks && clocks.running && !ended) {
        const t = game.turn();
        if (clockMs(t) <= 0) {
          clocks[t] = 0;
          finishPractice(game.timeoutOutcome(t));
        }
      }
      if (isLive && pub) liveHousekeeping();
    }

    // ---- painting ----
    function shownGame() {
      if (viewPly == null) return game;
      return gameAt(startFen, chess960, game.history({ verbose: true }).map((v) => v.lan), viewPly);
    }
    function paint() {
      if (!gs.alive()) return;
      const g = shownGame();
      const hist = game.history({ verbose: true });
      const last = viewPly == null ? hist[hist.length - 1] : hist[viewPly - 1];
      const nm = names();
      const top = orientation === 'w' ? 'b' : 'w';
      const bottom = orientation;
      const railHtml = (c) =>
        `<span class="chess2-player"><span class="chess2-dot chess2-dot--${c}" aria-hidden="true"></span>${esc(nm[c])}${isLive && pub && pub.rated ? '' : ''}</span>${capturedHtml(g, c)}${clockHtml(c)}`;
      $('[data-rail="top"]').innerHTML = railHtml(top);
      $('[data-rail="bottom"]').innerHTML = railHtml(bottom);
      board.paint(
        boardViewOf(g, {
          orientation,
          lastMove: last ? { from: last.from, to: last.kingTo || last.to } : null,
          interactive: viewPly == null && !ended && role === 'player',
          premove,
        })
      );
      const sans = hist.map((v) => v.san);
      const movesEl = $('[data-moves]');
      movesEl.innerHTML = moveListHtml(sans, / b /.test(startFen), viewPly == null ? sans.length : viewPly);
      const on = movesEl.querySelector('.is-on');
      if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const op = chess960 ? null : ecoName(sans);
      $('[data-opening]').textContent = chess960 ? 'Chess960' : op ? op.eco + ' · ' + op.name : '';
      paintActions();
      paintSubtitle();
    }
    function paintSubtitle() {
      if (!subtitleEl) return;
      let sub;
      if (mode === 'practice') sub = 'Practice · ' + (tc && tc.min ? tc.min + '+' + tc.inc : 'No clock') + (chess960 ? ' · 960' : '');
      else if (mode === 'spectate') sub = 'Watching · delayed';
      else if (pub) {
        const b = pub.bucket ? BUCKET_LABEL[pub.bucket] : '';
        sub = [pub.tc.days ? tcLabel(pub.tc) : pub.tc.base ? tcLabel(pub.tc) : 'No clock', pub.rated ? 'Rated ' + b : 'Casual', pub.variant === 'chess960' ? '960' : '', pub.stake ? '⚡' + pub.stake : ''].filter(Boolean).join(' · ');
      } else sub = 'Connecting…';
      subtitleEl.textContent = sub;
    }
    function banner(text, actionsHtml) {
      const b = $('[data-banner]');
      if (!b) return;
      if (!text) {
        b.hidden = true;
        b.innerHTML = '';
        return;
      }
      b.hidden = false;
      b.innerHTML = `<span>${esc(text)}</span>${actionsHtml || ''}`;
    }
    function paintActions() {
      const a = $('[data-actions]');
      if (!a) return;
      if (ended || role !== 'player') {
        a.innerHTML = role === 'spectator' && !ended ? '<span class="chess2-note">Watching — moves appear a few plies late</span>' : '';
        return;
      }
      const btn = (id, label, primary, disabled) => `<button type="button" class="chess2-btn game-tap-target${primary ? ' chess2-btn--primary' : ''}" data-act="${id}"${disabled ? ' disabled' : ''}>${esc(label)}</button>`;
      const parts = [];
      if (mode === 'practice') {
        const claim = !settings().autoClaim && game.claimable();
        if (claim) parts.push(btn('claim', 'Claim draw', true));
        parts.push(btn('hint', hintOn ? 'Hint shown' : 'Hint', false, game.turn() !== myColor || botBusy));
        parts.push(btn('undo', 'Undo', false, !game.history().length || botBusy));
        parts.push(btn('resign', 'Resign'));
      } else if (pub && pub.status === 'playing') {
        const myMoves = myColor === 'w' ? Math.ceil(pub.ply / 2) : Math.floor(pub.ply / 2);
        if (pub.claimable) parts.push(btn('claim', 'Claim draw', true));
        if (myMoves === 0) parts.push(btn('abort', 'Abort'));
        else parts.push(btn('draw', pub.drawOffer && pub.drawOffer.by === me ? 'Draw offered' : 'Offer draw', false, pub.drawOffer && pub.drawOffer.by === me));
        parts.push(btn('resign', 'Resign'));
      } else if (pub && pub.status === 'waiting') {
        parts.push(btn('cancel', 'Cancel challenge'));
      }
      a.innerHTML = parts.join('');
    }

    // ---- practice ----
    function startPracticeClockIfNeeded() {
      if (!clocks) return;
      const plies = game.history().length;
      if (plies >= 2 && !clocks.running) {
        clocks.running = true;
        clocks.at = Date.now();
      }
    }
    function chargePracticeClock(color) {
      if (!clocks || !clocks.running) return;
      clocks[color] = Math.max(0, clocks[color] - (Date.now() - clocks.at)) + tc.inc * 1000;
      clocks.at = Date.now();
    }
    function afterPracticeMove(v, color) {
      chargePracticeClock(color);
      startPracticeClockIfNeeded();
      feedback(v.san.indexOf('+') >= 0 || v.san.indexOf('#') >= 0 ? 'check' : v.captured ? 'capture' : 'move');
      announce(speakSan(v.san, color));
      const out = game.outcome({ autoClaim: settings().autoClaim });
      if (out) finishPractice(out);
      paint();
    }
    async function botTurn() {
      if (ended || game.turn() === myColor || botBusy) return;
      botBusy = true;
      paint();
      const info = S ? S.levelInfo(P.level) : { thinkMs: 600 };
      const minThink = Math.min(info.thinkMs || 500, clocks ? Math.max(150, clockMs(game.turn()) / 40) : 900);
      const t0 = Date.now();
      let r = null;
      try {
        r = await Engine.bot({ startFen, chess960, moves: game.history({ verbose: true }).map((v) => v.lan), level: P.level, persona: P.persona });
      } catch (e) {
        r = null;
      }
      const wait = Math.max(0, minThink - (Date.now() - t0));
      gs.schedule(() => {
        botBusy = false;
        if (ended || !gs.alive()) return;
        let v = r && r.move ? game.move(r.move) : null;
        if (!v) {
          const legal = game.moves({ verbose: true });
          if (legal.length) v = game.move(legal[Math.floor(Math.random() * legal.length)].lan);
        }
        if (v) afterPracticeMove(v, v.color);
        else paint();
      }, wait);
    }
    function finishPractice(out) {
      if (ended) return;
      ended = out;
      if (clocks) clocks.running = false;
      const won = out.winner === myColor;
      gs.setOutcome(out.winner ? (won ? 'won' : 'lost') : 'draw');
      paint();
      showResult();
    }

    // ---- human move (practice + live optimistic) ----
    function humanMove(mv) {
      hintOn = false;
      board.setHint(null);
      if (mode === 'practice') {
        const v = game.move(mv);
        if (!v) {
          feedback('invalid');
          return;
        }
        afterPracticeMove(v, myColor);
        if (!ended) botTurn();
        return;
      }
      const prevPly = game.history().length;
      const v = game.move(mv);
      if (!v) {
        feedback('invalid');
        return;
      }
      pendingMove = { uci: v.lan, ply: prevPly };
      feedback(v.captured ? 'capture' : 'move');
      announce(speakSan(v.san, myColor));
      paint();
      liveCall('move', { matchId: L.matchId, move: v.lan, ply: prevPly, lagMs: Math.round(rtt / 2), deviceId: deviceId() })
        .then((r) => {
          if (r && r.serverNow) offset = Number(r.serverNow) - Date.now();
          pendingMove = null;
          if (pub) applyPub(pub);
        })
        .catch((e) => {
          pendingMove = null;
          const code = String(e.code || '').toUpperCase();
          if (code !== 'STALE_MOVE') toast(liveErrorText(e));
          feedback('invalid');
          if (pub) applyPub(pub, true);
        });
    }

    // ---- live ----
    function applyPub(p, force) {
      pub = p;
      if (!pub) return;
      pub.moves = Array.isArray(pub.moves) ? pub.moves.filter(Boolean) : pub.moves ? Object.values(pub.moves) : [];
      if (role !== 'spectator' && pub.white && me) myColor = pub.black === me ? 'b' : 'w';
      if (!force && pendingMove && pub.moves.length <= pendingMove.ply) {
        paint();
        return;
      }
      const local = game.history({ verbose: true }).map((v) => v.lan);
      const sameStart = startFen === pub.startFen;
      startFen = pub.startFen;
      chess960 = pub.variant === 'chess960';
      const prefix = sameStart && local.length <= pub.moves.length && local.every((u, i) => u === pub.moves[i]);
      let fresh = [];
      if (prefix) {
        for (let i = local.length; i < pub.moves.length; i++) {
          const v = game.move(pub.moves[i]);
          if (v) fresh.push(v);
        }
      } else {
        game = gameAt(startFen, chess960, pub.moves);
      }
      if (fresh.length) {
        const v = fresh[fresh.length - 1];
        if (v.color !== myColor) {
          feedback(v.san.indexOf('+') >= 0 ? 'check' : v.captured ? 'capture' : 'move');
          announce(speakSan(v.san, v.color));
        }
      }
      if (!orientationSet && role !== 'spectator') {
        orientation = myColor;
        orientationSet = true;
      }
      if (pub.drawOffer && pub.drawOffer.by !== me && pub.status === 'playing') {
        banner(names()[myColor === 'w' ? 'b' : 'w'] + ' offers a draw', '<button type="button" class="game-tap-target" data-draw="yes">Accept</button><button type="button" class="game-tap-target" data-draw="no">Decline</button>');
      } else if (pub.status === 'waiting') {
        const mins = Math.max(0, Math.ceil((pub.deadline - serverNow()) / 60000));
        banner(`Waiting for ${L.oppName || 'your opponent'} to join · ${mins} min`);
      } else banner('');
      if (pub.status === 'playing' && premove && game.turn() === myColor) {
        const pm = premove;
        premove = null;
        const ok = game.moves({ square: pm.from, verbose: true }).some((m) => m.to === pm.to);
        if (ok) {
          paint();
          humanMove({ from: pm.from, to: pm.to, promotion: pm.promotion || 'q' });
          return;
        }
      }
      if (pub.status !== 'playing' && pub.status !== 'waiting' && !resultShown) {
        ended = { result: pub.result, reason: pub.reason, winner: pub.winner ? (pub.winner === pub.white ? 'w' : 'b') : null };
        paint();
        showResult();
        return;
      }
      if (resultShown && pub.settlement) paintSettlement();
      if (resultShown && pub.nextMatchId && pub.rematch && pub.rematch[pub.playerA] && pub.rematch[pub.playerB]) goRematch(pub.nextMatchId);
      paint();
    }

    function liveHousekeeping() {
      const now = serverNow();
      if (!pub || ended || role !== 'player') return;
      const gap = Date.now() - lastTick;
      let need = gap > 15000;
      if (pub.status === 'playing' && !pub.tc.days) {
        if (pub.clock && pub.clock.running && clockMs(pub.turn) <= 0) need = need || gap > 1500;
        if (pub.ply < 2 && pub.deadline && now >= pub.deadline) need = need || gap > 2000;
        const opp = oppUid();
        const pol = window.DangalLivePolicy ? window.DangalLivePolicy.policyFor(GAME) : null;
        const rs = pol ? window.DangalLivePolicy.reconnectStatus(presence[opp], now, pol) : null;
        if (rs && rs.warn) {
          banner(`${names()[myColor === 'w' ? 'b' : 'w']} lost connection — ${window.DangalLivePolicy.countdownText(rs.msLeft)} to come back`);
        } else if (rs && !pub.drawOffer && $('[data-banner]') && /lost connection/.test($('[data-banner]').textContent)) banner('');
        if (rs && rs.expired) need = need || gap > 3000;
      }
      if (pub.status === 'waiting' && now >= pub.deadline) need = need || gap > 3000;
      if (!need) return;
      lastTick = Date.now();
      liveCall('tick', { matchId: L.matchId, deviceId: deviceId() }).catch(() => {});
    }

    function subscribe() {
      if (typeof rtdb === 'undefined' || !rtdb) {
        toast('Live needs a connection — try again');
        return;
      }
      const base = rtdb.ref('games/chess/' + L.matchId);
      const node = role === 'spectator' ? base.child('spec') : base.child('pub');
      const onVal = (snap) => {
        const v = snap.val();
        if (!v || !gs.alive()) return;
        if (role === 'spectator') applySpec(v);
        else applyPub(v);
      };
      node.on('value', onVal, () => {
        if (role !== 'spectator') toast('Couldn’t load the game — check your connection');
      });
      subs.push(() => node.off('value', onVal));
      try {
        const off = rtdb.ref('.info/serverTimeOffset');
        const onOff = (s) => {
          const x = s && s.val();
          if (typeof x === 'number' && isFinite(x)) offset = x;
        };
        off.on('value', onOff);
        subs.push(() => off.off('value', onOff));
      } catch (e) {}
      if (role !== 'player') return;
      const presAll = base.child('presence');
      const onPres = (s) => {
        presence = s.val() || {};
      };
      presAll.on('value', onPres, () => {});
      subs.push(() => presAll.off('value', onPres));
      const TS = window.firebase && firebase.database && firebase.database.ServerValue ? firebase.database.ServerValue.TIMESTAMP : Date.now();
      presRef = base.child('presence/' + me);
      try {
        presRef.onDisconnect().set({ at: TS, online: false });
      } catch (e) {}
      const beatFn = () => presRef.set({ at: TS, online: true }).catch(() => {});
      beatFn();
      beat = setInterval(beatFn, 20000);
    }

    function applySpec(v) {
      pub = null;
      startFen = v.startFen || Core.START_FEN;
      chess960 = v.variant === 'chess960';
      const moves = Array.isArray(v.moves) ? v.moves.filter(Boolean) : v.moves ? Object.values(v.moves) : [];
      game = gameAt(startFen, chess960, moves);
      const nm = v.names || {};
      specNames = { w: nm[v.white] || 'White', b: nm[v.black] || 'Black' };
      if (v.status !== 'playing' && v.status !== 'waiting' && !resultShown) {
        ended = { result: v.result, reason: v.reason, winner: v.result === '1-0' ? 'w' : v.result === '0-1' ? 'b' : null };
        banner((v.result || '') + ' · ' + (REASON_TEXT[v.reason] || 'Game over'));
      } else banner(v.delayPlies ? `Watching · ${v.delayPlies} moves behind` : 'Watching');
      paint();
    }

    async function joinLive() {
      const s = settings();
      try {
        const args = {
          matchId: L.matchId,
          opponentUid: L.opp,
          playerA: L.host ? me : L.opp,
          name: myName(),
          deviceId: deviceId(),
          autoClaim: s.autoClaim,
        };
        if (L.host) {
          Object.assign(args, {
            tc: L.tc && L.tc.days ? { days: L.tc.days } : L.tc && L.tc.min ? { minutes: L.tc.min, increment: L.tc.inc } : {},
            variant: L.tc && L.tc.chess960 ? 'chess960' : 'standard',
            rated: !!(L.tc && L.tc.rated),
            stake: L.stake || 0,
            color: 'random',
          });
        }
        const r = await liveCall('join', args);
        if (r && r.serverNow) offset = Number(r.serverNow) - Date.now();
        if (!gs.alive()) return;
        if (r && r.role === 'spectator') {
          role = 'other-device';
          toast('This game is open on another device — watching here');
        }
        subscribe();
      } catch (e) {
        if (!gs.alive()) return;
        toast(liveErrorText(e));
        banner(liveErrorText(e));
      }
    }

    // ---- result ----
    function resultTexts() {
      const out = ended || {};
      const won = out.winner && out.winner === myColor;
      const drew = !out.winner && out.result === '1/2-1/2';
      const aborted = out.result === '*' || /abort|no_show|cancel|opponent_left/.test(out.reason || '');
      const nm = names();
      const title = aborted ? 'Game aborted' : drew ? 'Draw' : role === 'spectator' ? (out.winner === 'w' ? nm.w : nm.b) + ' won' : won ? 'You won' : `${nm[myColor === 'w' ? 'b' : 'w']} won`;
      return { won, drew, aborted, title, sub: REASON_TEXT[out.reason] || out.reason || '' };
    }
    function paintSettlement() {
      const el = overlay.querySelector('[data-settle]');
      if (!el || !pub || !pub.settlement) return;
      const s = pub.settlement[me];
      if (!s) return;
      const parts = [];
      if (s.chipDelta) parts.push(`Virtual chips ${s.chipDelta > 0 ? '+' : ''}${s.chipDelta}`);
      if (pub.settlement.rated && s.eloDelta != null) parts.push(`${BUCKET_LABEL[pub.settlement.bucket] || ''} rating ${s.eloDelta >= 0 ? '+' : ''}${s.eloDelta}`.trim());
      if (!parts.length) parts.push(pub.rated ? 'Rated game settled' : 'Casual game · unrated');
      el.textContent = parts.join(' · ') + ' · not real money';
      el.hidden = false;
    }
    function showResult() {
      if (resultShown) return;
      resultShown = true;
      const t = resultTexts();
      const box = $('[data-result]');
      const hist = game.history();
      const canReview = hist.length >= 2;
      const actions = [];
      if (mode === 'practice') actions.push({ id: 'again', label: 'Play again', primary: true });
      else if (mode === 'live') actions.push({ id: 'again', label: 'Rematch', primary: true });
      if (canReview) actions.push({ id: 'review', label: 'Review game', primary: false });
      if (hist.length) actions.push({ id: 'share', label: 'Share', primary: false });
      if (mode === 'live' && L.opp) actions.push({ id: 'chat', label: 'Chat', primary: false });
      const shareStats = {
        scoreLine: t.aborted ? 'Aborted' : t.drew ? 'Draw' : t.won ? 'Win' : 'Loss',
        meta: (subtitleEl && subtitleEl.textContent) || 'Chess',
        vs: 'vs ' + names()[myColor === 'w' ? 'b' : 'w'],
        text: `Chaupaal Chess: ${t.aborted ? 'aborted' : t.drew ? 'draw' : t.won ? 'I won' : 'tough loss'} vs ${names()[myColor === 'w' ? 'b' : 'w']} · ${t.sub}\n${game.history().join(' ').slice(0, 300)}`,
      };
      const html =
        typeof gameResultHtml === 'function'
          ? gameResultHtml({
              gameId: GAME,
              glyph: t.aborted ? '·' : t.drew ? '=' : t.won ? '✓' : '·',
              title: t.title,
              subtitle: t.sub,
              shareCardHtml: typeof buildGameShareCard === 'function' ? buildGameShareCard(GAME, shareStats) : '',
              actions: role === 'spectator' ? [] : actions,
            })
          : `<div class="chess2-result__card"><b>${esc(t.title)}</b><div>${esc(t.sub)}</div>${actions.map((a) => `<button type="button" data-action="${a.id}">${esc(a.label)}</button>`).join('')}</div>`;
      box.innerHTML = html + '<div class="chess-chip-delta" data-settle hidden></div>';
      box.hidden = false;
      paintSettlement();
      const handlers = {
        again: () => (mode === 'practice' ? restartPractice() : requestRematch()),
        review: () => openReview({ startFen, chess960, moves: game.history({ verbose: true }).map((v) => v.lan), myColor, names: names(), level: P.level || 3, meta: shareStats.meta }),
        share: () => shareGame(shareStats),
        chat: () => {
          gs.close();
          if (typeof openPeerDm === 'function') openPeerDm({ peerUid: L.opp, peerName: names()[myColor === 'w' ? 'b' : 'w'], seedHello: false });
        },
      };
      if (typeof wireGameResultActions === 'function') wireGameResultActions(box, handlers);
      box.addEventListener('click', (e) => {
        const b = e.target.closest('[data-action]');
        if (b && handlers[b.dataset.action] && typeof wireGameResultActions !== 'function') handlers[b.dataset.action]();
      });
    }
    function shareGame(stats) {
      const pgn = game.pgn({ Event: 'Chaupaal Chess', White: names().w, Black: names().b });
      if (typeof shareGameResult === 'function') shareGameResult(GAME, Object.assign({}, stats, { text: stats.text + '\n\n' + pgn }));
      else copyText(pgn, 'PGN copied');
    }
    function restartPractice() {
      try {
        window.__dangalLaunchCtx = { gameId: GAME, gameType: GAME, mode: 'practice', matchId: '', opponentUid: 'ai', stake: 0, source: 'manch', practiceKind: 'vsAi', skipPracticeSetup: true, startedAt: Date.now() };
      } catch (e) {}
      gs.close();
      playGame({ mode: 'practice', chat: { name: 'Practice', id: 'ai' }, practice: Object.assign({}, P, { startFen: P.retryFen || undefined }) });
    }
    let rematchAsked = false;
    function requestRematch() {
      if (rematchAsked) return;
      rematchAsked = true;
      toast('Rematch requested — colours swap');
      liveCall('rematch', { matchId: L.matchId })
        .then((r) => {
          if (r && r.nextMatchId && pub && pub.rematch) goRematch(r.nextMatchId);
        })
        .catch((e) => {
          rematchAsked = false;
          toast(liveErrorText(e));
        });
    }
    let rematchGone = false;
    function goRematch(nextId) {
      if (rematchGone || !nextId) return;
      if (!(pub && pub.rematch && pub.rematch[pub.playerA] && pub.rematch[pub.playerB])) return;
      rematchGone = true;
      const next = Object.assign({}, L, { matchId: nextId, host: false });
      gs.close();
      playGame({ mode: 'live', chat: cfg.chat, live: next });
    }

    // ---- actions ----
    overlay.addEventListener('click', async (e) => {
      const t = e.target.closest('[data-act],[data-nav-go],[data-ply],[data-draw]');
      if (!t) return;
      if (t.dataset.ply) {
        const n = Number(t.dataset.ply);
        viewPly = n >= game.history().length ? null : n;
        board.clear();
        paint();
        return;
      }
      if (t.dataset.navGo) {
        const total = game.history().length;
        let cur = viewPly == null ? total : viewPly;
        if (t.dataset.navGo === 'first') cur = 0;
        else if (t.dataset.navGo === 'prev') cur = Math.max(0, cur - 1);
        else if (t.dataset.navGo === 'next') cur = Math.min(total, cur + 1);
        else cur = total;
        viewPly = cur >= total ? null : cur;
        board.clear();
        paint();
        return;
      }
      if (t.dataset.draw) {
        liveCall('respond_draw', { matchId: L.matchId, accept: t.dataset.draw === 'yes' }).catch((err) => toast(liveErrorText(err)));
        banner('');
        return;
      }
      const act = t.dataset.act;
      if (act === 'hint') {
        if (game.turn() !== myColor) return;
        t.disabled = true;
        try {
          const r = await Engine.analyse({ startFen, chess960, moves: game.history({ verbose: true }).map((v) => v.lan), timeMs: 700 });
          if (r && r.move && gs.alive()) {
            hintOn = true;
            board.setHint({ from: r.move.slice(0, 2), to: r.move.slice(2, 4) });
            paintActions();
          }
        } catch (err) {
          toast('Hint unavailable right now');
        }
        return;
      }
      if (act === 'undo') {
        if (botBusy) return;
        game.undo();
        if (game.turn() !== myColor && game.history().length) game.undo();
        hintOn = false;
        board.setHint(null);
        paint();
        return;
      }
      if (act === 'claim') {
        if (mode === 'practice') {
          const why = game.claimable();
          if (why) finishPractice({ result: '1/2-1/2', reason: why, winner: null });
          return;
        }
        liveCall('claim_draw', { matchId: L.matchId }).catch((err) => toast(liveErrorText(err)));
        return;
      }
      if (act === 'draw') {
        liveCall('offer_draw', { matchId: L.matchId })
          .then(() => toast('Draw offered'))
          .catch((err) => toast(liveErrorText(err)));
        return;
      }
      if (act === 'abort') {
        const ok = await confirmSheet('Abort game?', 'Before your first move: no rating change and no chips.', 'Abort');
        if (!ok) return;
        liveCall('abort', { matchId: L.matchId }).catch((err) => toast(liveErrorText(err)));
        return;
      }
      if (act === 'cancel') {
        liveCall('abort', { matchId: L.matchId }).catch(() => {});
        gs.close();
        return;
      }
      if (act === 'resign') {
        const ok = await confirmSheet('Resign?', mode === 'practice' ? 'You lose this practice game.' : 'You lose this game.', 'Resign');
        if (!ok) return;
        if (mode === 'practice') finishPractice({ result: myColor === 'w' ? '0-1' : '1-0', reason: 'resignation', winner: myColor === 'w' ? 'b' : 'w' });
        else liveCall('resign', { matchId: L.matchId }).catch((err) => toast(liveErrorText(err)));
      }
    });

    overlay.querySelector('#chess2More')?.addEventListener('click', openMore);
    async function openMore() {
      const items = [
        { id: 'flip', label: 'Flip board' },
        { id: 'pgn', label: 'Copy PGN' },
        { id: 'fen', label: 'Copy FEN' },
        isLive && L.matchId ? { id: 'watch', label: 'Copy watch link', hint: 'Friends can spectate with a short delay' } : null,
        { id: 'settings', label: 'Settings' },
        { id: 'rules', label: 'Rules' },
        { id: 'licences', label: 'Licences' },
      ];
      const pick = await pickSheet('Chess', items, { note: isLive ? 'Hints are off in rated and Live games.' : '' });
      if (pick === 'flip') {
        orientation = orientation === 'w' ? 'b' : 'w';
        paint();
      } else if (pick === 'pgn') copyText(game.pgn({ Event: 'Chaupaal Chess', White: names().w, Black: names().b }), 'PGN copied');
      else if (pick === 'fen') copyText(shownGame().fen(), 'FEN copied');
      else if (pick === 'watch') copyText(location.origin + '/?section=dangal&chess_watch=' + encodeURIComponent(L.matchId), 'Watch link copied');
      else if (pick === 'settings') openSettings(() => paint());
      else if (pick === 'rules' && window.DangalRules) window.DangalRules.openSheet(GAME, { variants: { chess960 } });
      else if (pick === 'licences') openLicences();
    }

    async function askLeave() {
      if (ended || mode === 'spectate' || role !== 'player' || (isLive && (!pub || isDaily() || pub.status !== 'playing'))) {
        gs.close();
        return;
      }
      if (mode === 'practice') {
        const ok = await confirmSheet('Leave practice?', 'This game won’t be saved.', 'Leave');
        if (ok) gs.close();
        return;
      }
      const myMoves = myColor === 'w' ? Math.ceil(pub.ply / 2) : Math.floor(pub.ply / 2);
      const ok = await confirmSheet(myMoves ? 'Resign and leave?' : 'Abort and leave?', myMoves ? 'Leaving a Live game counts as a loss.' : 'No rating change and no chips before your first move.', 'Leave');
      if (!ok) return;
      liveCall(myMoves ? 'resign' : 'abort', { matchId: L.matchId }).catch(() => {});
      gs.close();
    }
    overlay.querySelector('#chess2Back')?.addEventListener('click', askLeave);

    clockTimer = setInterval(tickClocks, 200);

    if (mode === 'practice') {
      orientation = myColor;
      paint();
      if (myColor === 'b') botTurn();
    } else if (mode === 'spectate') {
      role = 'spectator';
      paint();
      subscribe();
    } else {
      paint();
      joinLive();
    }
  }

  function copyText(text, done) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => toast(done), () => toast('Couldn’t copy'));
        return;
      }
    } catch (e) {}
    toast('Couldn’t copy');
  }

  // ---------------- review ----------------

  async function openReview(o) {
    const p = openPanel({ title: 'Game review', subtitle: 'Analysing…' });
    if (!p) return;
    p.body.innerHTML = '<div class="chess-review__loading"><div class="chess-progress"><span data-progress></span></div><p>Our engine is checking every move…</p></div>';
    let analysis;
    try {
      await loadLazy('games/chess-review.js');
      analysis = await Engine.review({ startFen: o.startFen, chess960: o.chess960, moves: o.moves, perMoveMs: 300 }, (f) => {
        const bar = p.body.querySelector('[data-progress]');
        if (bar) bar.style.width = Math.round(f * 100) + '%';
      });
    } catch (e) {
      if (p.alive()) p.body.innerHTML = '<p class="chess-doc">Review isn’t available right now. Try again in a moment.</p>';
      return;
    }
    if (!p.alive()) return;
    const R = window.ChessReview;
    const rev = R.buildReview({ startFen: o.startFen, chess960: o.chess960, moves: o.moves, analysis });
    const sub = p.el.querySelector('.game-chrome__subtitle, .game-chrome-subtitle, [data-chrome-subtitle]');
    if (sub) sub.textContent = `Accuracy · White ${rev.accuracy.w ?? '—'} · Black ${rev.accuracy.b ?? '—'}`;
    renderViewer(p, {
      startFen: o.startFen,
      chess960: o.chess960,
      moves: o.moves,
      review: rev,
      orientation: o.myColor || 'w',
      level: o.level,
      names: o.names,
    });
  }

  /** Shared read-only viewer used by Review and the Analysis board. */
  function renderViewer(p, v) {
    const Core = window.ChessCore;
    let ply = v.review && v.review.keyMoments.length ? v.review.keyMoments[0].ply + 1 : v.moves.length;
    let orientation = v.orientation || 'w';
    let coach = {};
    let analysisMoves = v.moves.slice();
    let engineLine = '';
    const rev = v.review;
    p.body.innerHTML = `<div class="chess-viewer">
      ${rev ? `<div class="chess-viewer__graph" data-graph></div>` : ''}
      <div class="chess2-boardwrap"><div class="chess2-board" data-vboard></div></div>
      <div class="chess-viewer__info" data-info aria-live="polite"></div>
      <div class="chess-moves" data-vmoves></div>
      <div class="chess2-nav">
        <button type="button" class="game-tap-target" data-go="first" aria-label="First move">«</button>
        <button type="button" class="game-tap-target" data-go="prev" aria-label="Previous move">‹</button>
        <button type="button" class="game-tap-target" data-go="next" aria-label="Next move">›</button>
        <button type="button" class="game-tap-target" data-go="last" aria-label="Last move">»</button>
      </div>
      <div class="chess2-actions" data-vactions></div>
    </div>`;
    const $ = (s) => p.body.querySelector(s);
    const board = createBoard($('[data-vboard]'), {
      canSelect(sq) {
        if (rev) return false;
        const g = gameAt(v.startFen, v.chess960, analysisMoves, ply);
        const pc = g.get(sq);
        return !!pc && pc.color === g.turn();
      },
      targets(sq) {
        return moveTargets(gameAt(v.startFen, v.chess960, analysisMoves, ply), sq);
      },
      onMove(mv) {
        const g = gameAt(v.startFen, v.chess960, analysisMoves, ply);
        const r = g.move(mv);
        if (!r) return;
        analysisMoves = analysisMoves.slice(0, ply).concat([r.lan]);
        ply = analysisMoves.length;
        engineLine = '';
        feedback(r.captured ? 'capture' : 'move');
        paint();
      },
    });
    function paint() {
      const moves = rev ? v.moves : analysisMoves;
      const g = gameAt(v.startFen, v.chess960, moves, ply);
      const hist = gameAt(v.startFen, v.chess960, moves).history({ verbose: true });
      const last = hist[ply - 1];
      board.paint(boardViewOf(g, { orientation, lastMove: last ? { from: last.from, to: last.kingTo || last.to } : null, interactive: !rev }));
      const cls = rev ? rev.moves.map((m) => (m.brilliant ? 'brilliant' : m.cls)) : null;
      $('[data-vmoves]').innerHTML = moveListHtml(hist.map((h) => h.san), / b /.test(v.startFen), ply, cls);
      if (rev) $('[data-graph]').innerHTML = evalGraphSvg(rev.graph, ply);
      const info = $('[data-info]');
      if (rev) {
        const m = rev.moves[ply - 1];
        if (!m) {
          const op = window.ChessEco ? window.ChessEco.lookup(hist.map((h) => h.san)) : null;
          info.innerHTML = `<div class="chess-viewer__acc"><span>White ${rev.accuracy.w ?? '—'}%</span><span>Black ${rev.accuracy.b ?? '—'}%</span></div>${op ? `<div class="chess2-opening">${esc(op.eco + ' · ' + op.name)}</div>` : ''}<div class="chess-key">${rev.keyMoments.map((k) => `<button type="button" class="chess-chip game-tap-target" data-ply="${k.ply + 1}">${esc((k.brilliant ? '!! ' : '') + k.san)}</button>`).join('')}</div>`;
        } else {
          const fb = window.ChessReview.coachFallback(m);
          const c = coach[m.ply];
          info.innerHTML = `<div class="chess-badge chess-badge--${m.brilliant ? 'brilliant' : m.cls}">${esc(m.brilliant ? 'Brilliant' : m.label)} · ${esc(m.san)} · ${esc(m.evalAfter)}</div>
            <p class="chess-coach">${esc(c ? c.text : fb.text)}</p>
            ${(c ? c.tips : fb.tips).map((t) => `<div class="chess-tip">${esc(t)}</div>`).join('')}`;
        }
      } else {
        info.innerHTML = engineLine ? `<div class="chess-tip">${esc(engineLine)}</div>` : '';
      }
      const act = $('[data-vactions]');
      const m = rev ? rev.moves[ply - 1] : null;
      act.innerHTML = rev
        ? [
            m ? '<button type="button" class="chess2-btn game-tap-target" data-v="explain">Explain</button>' : '',
            m ? '<button type="button" class="chess2-btn chess2-btn--primary game-tap-target" data-v="retry">Retry this position</button>' : '',
            '<button type="button" class="chess2-btn game-tap-target" data-v="flip">Flip</button>',
            rev.brilliant ? '<button type="button" class="chess2-btn game-tap-target" data-v="sharebrill">Share brilliant move</button>' : '',
          ].join('')
        : [
            '<button type="button" class="chess2-btn chess2-btn--primary game-tap-target" data-v="engine">Engine</button>',
            '<button type="button" class="chess2-btn game-tap-target" data-v="flip">Flip</button>',
            '<button type="button" class="chess2-btn game-tap-target" data-v="pgn">Copy PGN</button>',
            '<button type="button" class="chess2-btn game-tap-target" data-v="fen">Copy FEN</button>',
          ].join('');
    }
    p.body.addEventListener('click', async (e) => {
      const t = e.target.closest('[data-ply],[data-go],[data-v]');
      if (!t) return;
      const moves = rev ? v.moves : analysisMoves;
      if (t.dataset.ply) ply = Number(t.dataset.ply);
      else if (t.dataset.go) {
        if (t.dataset.go === 'first') ply = 0;
        else if (t.dataset.go === 'prev') ply = Math.max(0, ply - 1);
        else if (t.dataset.go === 'next') ply = Math.min(moves.length, ply + 1);
        else ply = moves.length;
        engineLine = '';
      } else if (t.dataset.v === 'flip') orientation = orientation === 'w' ? 'b' : 'w';
      else if (t.dataset.v === 'retry') {
        const m = rev.moves[ply - 1];
        p.close();
        playGame({
          mode: 'practice',
          chat: { name: 'Practice', id: 'ai' },
          practice: { level: v.level || 5, persona: '', color: m.color, tc: { min: 0, inc: 0 }, chess960: v.chess960, startFen: m.before, retryFen: m.before },
        });
        return;
      } else if (t.dataset.v === 'explain') {
        const m = rev.moves[ply - 1];
        if (!m || coach[m.ply]) return;
        t.disabled = true;
        t.textContent = 'Thinking…';
        coach[m.ply] = await explainMove(m);
      } else if (t.dataset.v === 'sharebrill') {
        const b = rev.brilliant;
        const stats = { scoreLine: 'Brilliant move', meta: 'Chess review', vs: '', text: `I found a brilliant move in Chaupaal Chess: ${b.san}!!` };
        if (typeof shareGameResult === 'function') shareGameResult(GAME, stats);
        return;
      } else if (t.dataset.v === 'engine') {
        t.disabled = true;
        try {
          const r = await Engine.analyse({ startFen: v.startFen, chess960: v.chess960, moves: moves.slice(0, ply), timeMs: 900 });
          const g = gameAt(v.startFen, v.chess960, moves, ply);
          const sans = [];
          for (const u of r.pv || []) {
            const x = g.move(u);
            if (!x) break;
            sans.push(x.san);
          }
          const pov = gameAt(v.startFen, v.chess960, moves, ply).turn() === 'w' ? 1 : -1;
          const evalText = r.mate ? 'Mate in ' + Math.abs(r.mate) : ((r.score * pov) / 100 >= 0 ? '+' : '') + ((r.score * pov) / 100).toFixed(1);
          engineLine = `${evalText} · ${sans.slice(0, 8).join(' ')} (depth ${r.depth})`;
        } catch (err) {
          engineLine = 'Engine unavailable right now';
        }
      } else if (t.dataset.v === 'pgn') {
        const g = gameAt(v.startFen, v.chess960, moves);
        return copyText(g.pgn({ Event: 'Chaupaal analysis' }), 'PGN copied');
      } else if (t.dataset.v === 'fen') return copyText(gameAt(v.startFen, v.chess960, moves, ply).fen(), 'FEN copied');
      paint();
    });
    paint();
  }

  /** Coach: AI (grounded in engine moves) when available, deterministic engine text otherwise. */
  async function explainMove(m) {
    const R = window.ChessReview;
    const fb = R.coachFallback(m);
    if (typeof apiFetch !== 'function') return fb;
    try {
      const res = await apiFetch('/api/media-config', {
        method: 'POST',
        needAuth: true,
        body: {
          action: 'dangal_ai',
          hook: 'coachExplain',
          input: {
            gameId: GAME,
            situation: `${m.color === 'w' ? 'White' : 'Black'} played ${m.san} (${m.label}). Evaluation after: ${m.evalAfter}.`,
            move: m.san,
            engineText: fb.text,
            engineTips: fb.tips,
            allowedMoves: R.allowedMoves(m),
          },
        },
      });
      const d = res && (res.data || res);
      const data = d && d.data;
      if (data && data.text && R.validateCoachText([data.text].concat(data.tips || []).join(' '), R.allowedMoves(m)).ok) return data;
    } catch (e) {}
    return fb;
  }

  // ---------------- analysis board ----------------

  async function openAnalysis(opts) {
    const o = opts || {};
    const p = openPanel({ title: 'Analysis board', subtitle: 'Free play · engine on demand' });
    if (!p) return;
    let startFen = window.ChessCore.START_FEN;
    let moves = [];
    let chess960 = false;
    if (o.pgn || o.fen) {
      const g = new window.ChessCore.Game();
      if (o.pgn && g.loadPgn(o.pgn)) {
        startFen = g.startFen;
        chess960 = g.chess960;
        moves = g.history({ verbose: true }).map((v) => v.lan);
      } else if (o.fen) {
        try {
          g.load(o.fen);
          startFen = g.fen();
          chess960 = g.chess960;
        } catch (e) {
          toast('That FEN isn’t valid');
        }
      } else toast('That PGN has an illegal move');
    }
    renderViewer(p, { startFen, chess960, moves, orientation: 'w' });
  }

  function importSheet() {
    return new Promise((resolve) => {
      const device = document.querySelector('.device');
      if (!device) return resolve(null);
      const el = document.createElement('div');
      el.className = 'chess-sheet';
      el.innerHTML = `<div class="chess-sheet__panel" role="dialog" aria-label="Import game">
        <div class="chess-sheet__title">Import PGN or FEN</div>
        <textarea class="chess-import" rows="6" placeholder="Paste a PGN or a FEN" data-text></textarea>
        <button type="button" class="chess2-btn chess2-btn--primary game-tap-target" data-ok>Open in analysis</button>
        <button type="button" class="chess-sheet__cancel game-tap-target" data-cancel>Cancel</button>
      </div>`;
      device.appendChild(el);
      const done = (v) => {
        el.remove();
        resolve(v);
      };
      el.addEventListener('click', (e) => {
        if (e.target === el || e.target.closest('[data-cancel]')) return done(null);
        if (e.target.closest('[data-ok]')) {
          const txt = el.querySelector('[data-text]').value.trim();
          if (!txt) return done(null);
          const isFen = /^[rnbqkpRNBQKP1-8\/]+ [wb] /.test(txt);
          done(isFen ? { fen: txt } : { pgn: txt });
        }
      });
    });
  }

  // ---------------- Daily games ----------------

  async function openDaily() {
    if (!persistable(myUid())) {
      toast('Sign in to play Daily chess');
      return;
    }
    const p = openPanel({ title: 'Daily chess', subtitle: '1 or 3 days per move · we’ll notify you' });
    if (!p) return;
    async function load() {
      p.body.innerHTML = '<p class="chess-doc">Loading…</p>';
      let data = { games: [], seeks: [] };
      try {
        data = await liveCall('daily_list', {});
      } catch (e) {
        p.body.innerHTML = `<p class="chess-doc">${esc(liveErrorText(e))}</p>`;
        return;
      }
      if (!p.alive()) return;
      const me = myUid();
      const rows = (data.games || [])
        .map((g) => {
          const opp = g.white === me ? g.black : g.white;
          const nm = (g.names && g.names[opp]) || 'Opponent';
          return `<button type="button" class="chess-daily__row game-tap-target" data-open="${esc(g.matchId)}" data-opp="${esc(opp)}" data-name="${esc(nm)}"><b>${esc(nm)}</b><span>${g.myTurn ? 'Your move · ' + fmtDaily(g.deadline - Date.now()) + ' left' : 'Their move'}</span></button>`;
        })
        .join('');
      p.body.innerHTML = `<div class="chess-daily">
        ${rows || '<p class="chess-doc">No Daily games yet.</p>'}
        <div class="chess-tc__cat">Find an opponent</div>
        <div class="chess-tc__grid">${DAILY.map((d) => `<button type="button" class="chess-chip game-tap-target" data-seek="${d.days}">${(data.seeks || []).indexOf(d.days) >= 0 ? 'Searching… ' : ''}${d.label}</button>`).join('')}</div>
        ${(data.seeks || []).length ? '<button type="button" class="chess-link game-tap-target" data-cancel-seek>Stop searching</button>' : ''}
        <p class="chess-note">Daily games are rated separately. Invite a friend from “Play a friend” and pick Daily.</p>
      </div>`;
    }
    p.body.addEventListener('click', async (e) => {
      const t = e.target.closest('[data-open],[data-seek],[data-cancel-seek]');
      if (!t) return;
      if (t.dataset.open) {
        p.close();
        playGame({ mode: 'live', chat: { name: t.dataset.name, id: t.dataset.opp }, live: { matchId: t.dataset.open, opp: t.dataset.opp, host: false, oppName: t.dataset.name } });
        return;
      }
      if (t.dataset.seek) {
        try {
          const r = await liveCall('daily_seek', { days: Number(t.dataset.seek), name: myName() });
          toast(r.matched ? 'Opponent found — game on!' : 'Searching — we’ll notify you when a game starts');
        } catch (err) {
          toast(liveErrorText(err));
        }
        load();
        return;
      }
      if (t.hasAttribute('data-cancel-seek')) {
        await liveCall('daily_cancel', {}).catch(() => {});
        load();
      }
    });
    load();
  }

  // ---------------- friend challenge ----------------

  async function challengeFriend() {
    if (typeof openFriendPickerSheet !== 'function') {
      toast('Open a chat with a friend to challenge them');
      return;
    }
    const friend = await openFriendPickerSheet({ title: 'Play a friend', subtitle: 'Live or Daily · virtual chips only' });
    if (!friend) return;
    const uid = friend.uid || friend.id || '';
    if (!persistable(uid)) {
      toast('Pick a real friend to challenge');
      return;
    }
    const tc = await timeSheet({ defaultMin: 5, defaultInc: 0 });
    if (!tc) return;
    let stake = 0;
    if (typeof stakesEnabledForGame === 'function' && stakesEnabledForGame(GAME) && typeof openDangalStakeSheet === 'function') {
      const picked = await openDangalStakeSheet(GAME, { defaultStake: 0 });
      if (picked == null) return;
      stake = picked;
    }
    const mid = typeof dangalMatchId === 'function' ? dangalMatchId(GAME, { name: friend.name, opponentUid: uid }) : 'chess_' + Date.now();
    const chatId = friend.chatId || friend.firestoreId || '';
    const payload = tcPayload(tc);
    try {
      window.__dangalLaunchCtx = Object.assign({ gameId: GAME, gameType: GAME, mode: 'live', matchId: mid, opponentUid: uid, stake, chatId, source: 'challenge_host', startedAt: Date.now() }, payload);
    } catch (e) {}
    if (typeof sendChallengeCard === 'function' && chatId) {
      try {
        await sendChallengeCard(uid, GAME, Object.assign({ chatId, matchId: mid, stake }, payload));
      } catch (e) {}
    }
    playGame({ mode: 'live', chat: { name: friend.name, id: uid, uid, peerUid: uid, dangalMatchId: mid }, live: { matchId: mid, opp: uid, host: true, tc, stake, oppName: friend.name } });
  }

  // ---------------- home (Practice: Play → time control → Start) ----------------

  async function openHome(chat) {
    try {
      await loadLazy('games/chess-search.js');
    } catch (e) {}
    const S = window.ChessSearch;
    const p = openPanel({ title: 'Chess', subtitle: ratingLine() });
    if (!p) return;
    function paint() {
      const s = settings();
      const lvl = S ? S.levelInfo(s.level) : { level: s.level, approx: 0 };
      p.body.innerHTML = `<div class="chess-home">
        <div class="chess-home__glance">Play a bot</div>
        <div class="chess-tc__cat">Level · ≈${lvl.approx || '—'} (approximate)</div>
        <div class="chess-levels">${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<button type="button" class="chess-chip game-tap-target${s.level === n ? ' is-on' : ''}" data-level="${n}" aria-label="Level ${n}">${n}</button>`).join('')}</div>
        <div class="chess-tc__cat">Time control</div>
        <div class="chess-tc__grid">${['3+2', '5+0', '10+0', '15+10', 'none']
          .map((id) => `<button type="button" class="chess-chip game-tap-target${s.practiceTc === id ? ' is-on' : ''}" data-tc="${id}">${id === 'none' ? 'No clock' : id}</button>`)
          .join('')}</div>
        <button type="button" class="chess2-btn chess2-btn--primary chess-home__start game-tap-target" data-start>Start</button>
        <details class="chess-adv"><summary>More options</summary>
          <div class="chess-tc__cat">Play as</div>
          <div class="chess-tc__grid">${[['w', 'White'], ['b', 'Black'], ['random', 'Random']].map(([k, l]) => `<button type="button" class="chess-chip game-tap-target${s.side === k ? ' is-on' : ''}" data-side="${k}">${l}</button>`).join('')}</div>
          <div class="chess-tc__cat">Bot style</div>
          <div class="chess-tc__grid">${[['', 'Balanced'], ['aggressive', 'Aggressive'], ['solid', 'Solid'], ['tricky', 'Tricky'], ['friendly', 'Friendly']].map(([k, l]) => `<button type="button" class="chess-chip game-tap-target${s.persona === k ? ' is-on' : ''}" data-persona="${k}">${l}</button>`).join('')}</div>
          <div class="chess-tc__cat">Variant</div>
          <div class="chess-tc__grid"><button type="button" class="chess-chip game-tap-target${s.variant !== 'chess960' ? ' is-on' : ''}" data-variant="standard">Standard</button><button type="button" class="chess-chip game-tap-target${s.variant === 'chess960' ? ' is-on' : ''}" data-variant="chess960">Chess960</button></div>
          <div class="chess-tc__cat">Longer clocks</div>
          <div class="chess-tc__grid">${['1+0', '2+1', '3+0', '30+0'].map((id) => `<button type="button" class="chess-chip game-tap-target${s.practiceTc === id ? ' is-on' : ''}" data-tc="${id}">${id}</button>`).join('')}</div>
        </details>
        <div class="chess-home__more">
          <button type="button" class="chess-link game-tap-target" data-go="friend">Play a friend</button>
          <button type="button" class="chess-link game-tap-target" data-go="daily">Daily games</button>
          <button type="button" class="chess-link game-tap-target" data-go="analysis">Analysis board</button>
          <button type="button" class="chess-link game-tap-target" data-go="import">Import PGN / FEN</button>
          <button type="button" class="chess-link game-tap-target" data-go="settings">Settings</button>
          <button type="button" class="chess-link game-tap-target" data-go="licences">Licences</button>
        </div>
      </div>`;
    }
    p.body.addEventListener('click', async (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.level) saveSettings({ level: Number(t.dataset.level) });
      else if (t.dataset.tc) saveSettings({ practiceTc: t.dataset.tc });
      else if (t.dataset.side) saveSettings({ side: t.dataset.side });
      else if (t.dataset.persona != null && t.hasAttribute('data-persona')) saveSettings({ persona: t.dataset.persona });
      else if (t.dataset.variant) saveSettings({ variant: t.dataset.variant });
      else if (t.hasAttribute('data-start')) {
        p.close();
        startPracticeFromSettings(chat);
        return;
      } else if (t.dataset.go) {
        const go = t.dataset.go;
        if (go === 'friend') return challengeFriend();
        if (go === 'daily') return openDaily();
        if (go === 'analysis') return openAnalysis();
        if (go === 'import') {
          const imp = await importSheet();
          if (imp) openAnalysis(imp);
          return;
        }
        if (go === 'settings') return openSettings(paint);
        if (go === 'licences') return openLicences();
      }
      paint();
    });
    paint();
  }

  function ratingLine() {
    const r = typeof getGameRating === 'function' ? getGameRating(GAME) : null;
    return r ? `Practice · Rating ${r}` : 'Practice vs bots';
  }

  function startPracticeFromSettings(chat) {
    const s = settings();
    const preset = TC_PRESETS.find((t) => t.id === s.practiceTc);
    playGame({
      mode: 'practice',
      chat: chat || { name: 'Practice', id: 'ai' },
      practice: {
        level: s.level,
        persona: s.persona,
        color: s.side === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : s.side,
        tc: preset ? { min: preset.min, inc: preset.inc } : { min: 0, inc: 0 },
        chess960: s.variant === 'chess960',
      },
    });
  }

  // ---------------- entry ----------------

  function ready() {
    if (window.ChessCore) return Promise.resolve();
    return loadLazy('games/chess-core.js');
  }

  async function open(chat) {
    try {
      await ready();
    } catch (e) {
      toast('Chess couldn’t load — check your connection');
      return;
    }
    loadLazy('games/chess-search.js').catch(() => {});
    loadLazy('games/chess-eco.js').catch(() => {});
    const launch = window.__dangalLaunchCtx || {};
    const raw = chat || {};
    if (launch.chessWatch || raw.chessWatch) return spectate(launch.chessWatch || raw.chessWatch);
    const oppUid = (typeof opponentUidFromChat === 'function' ? opponentUidFromChat(raw) : '') || launch.opponentUid || raw.opponentUid || raw.peerUid || raw.uid || '';
    const live = persistable(oppUid) && typeof DangalLive !== 'undefined' && DangalLive.isLive(raw, launch);
    if (live) {
      const mid = String(raw.dangalMatchId || launch.matchId || '').trim();
      if (!mid) {
        toast('Challenge link broken — open Practice instead');
        return;
      }
      const roles = DangalLive.roles ? DangalLive.roles(raw, launch) : { host: launch.source !== 'challenge' };
      playGame({
        mode: 'live',
        chat: raw,
        live: { matchId: mid, opp: oppUid, host: !!roles.host, tc: tcFromLaunch(launch, raw), stake: Number(launch.stake) || 0, oppName: raw.name || '' },
      });
      return;
    }
    const quick =
      launch.skipPracticeSetup === true ||
      (launch.skipPracticeSetup !== false && (launch.practiceKind === 'vsAi' || launch.mode === 'practice') && launch.source !== 'manch_home');
    if (quick) {
      await loadLazy('games/chess-search.js').catch(() => {});
      startPracticeFromSettings({ name: 'Practice', id: 'ai' });
      return;
    }
    openHome(raw);
  }

  async function spectate(matchId) {
    await ready();
    await loadLazy('games/chess-eco.js').catch(() => {});
    const mid = String(matchId || '').replace(/[^\w.-]/g, '').slice(0, 120);
    if (!mid) return;
    playGame({ mode: 'spectate', chat: { name: 'Watch', id: '' }, live: { matchId: mid } });
  }

  /** Deep links: /?section=dangal&chess=<matchId> (Daily “Your move”) or &chess_watch=<matchId>. */
  function handleDeepLink() {
    let q;
    try {
      q = new URLSearchParams(location.search);
    } catch (e) {
      return;
    }
    const mid = q.get('chess');
    const watch = q.get('chess_watch');
    if (!mid && !watch) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      if (!document.querySelector('.device') || (!myUid() && tries < 40)) return;
      clearInterval(timer);
      if (watch) spectate(watch);
      else
        ready().then(() => {
          loadLazy('games/chess-search.js').catch(() => {});
          playGame({ mode: 'live', chat: { name: 'Daily', id: '' }, live: { matchId: mid.replace(/[^\w.-]/g, ''), opp: '', host: false } });
        });
    }, 500);
  }
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    if (document.readyState === 'complete') setTimeout(handleDeepLink, 1500);
    else window.addEventListener('load', () => setTimeout(handleDeepLink, 1500), { once: true });
  }

  window.ChessUI = { open, spectate, openAnalysis, openLicences, openDaily, openSettings, timeSheet, challengeFriend };
  window.openChessLiveTimeSheet = timeSheet;
})();
