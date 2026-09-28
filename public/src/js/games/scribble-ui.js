/**
 * Scribble (Dangal P5) — draw & guess, 2–12 players, Live party rooms.
 *
 * Room: party_room → server-lib/scribble-engine.js (server deals words; only the drawer's secret
 * holds the word; guesses checked server-side; near misses answered privately in the op result).
 * Canvas: the drawer streams op batches to RTDB games/scribble_canvas/{code}/{turnKey}; everyone
 * (late joiners and reconnects too) replays them with ScribbleCore.replay() on a fixed 800×600
 * canvas, so fills and strokes land in the same place on every screen.
 * Tools: palette + custom colour, 4 brush sizes, eraser, fill bucket, undo / redo, clear, smoothing.
 */
(function () {
  'use strict';

  const GAME = 'scribble';
  const LABEL = 'Scribble';
  const ROOM_KEY = 'chaupaal_scribble_room';
  const FLUSH_MS = 110;
  const Core = () => window.ScribbleCore;
  const Kit = () => window.PartyKit;
  const CK = () => window.ClassicsKit;
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const tr = (key, fallback) => (typeof t === 'function' ? t('scribble.' + key, fallback) : fallback);
  const toast = (m) => typeof showToast === 'function' && showToast(m);
  const clone = (x) => JSON.parse(JSON.stringify(x));
  function readJson(k, d) {
    try {
      const v = JSON.parse(localStorage.getItem(k) || 'null');
      return v == null ? d : v;
    } catch (e) {
      return d;
    }
  }
  function writeJson(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {}
  }

  // ---------------- canvas ----------------

  /** Flood fill on ImageData (4-way scanline, small tolerance for anti-aliased edges). */
  function floodFill(ctx, x, y, hex) {
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    const at = (px, py) => (py * W + px) * 4;
    const i0 = at(x, y);
    const tr0 = d[i0];
    const tg0 = d[i0 + 1];
    const tb0 = d[i0 + 2];
    const fr = parseInt(hex.slice(1, 3), 16);
    const fg = parseInt(hex.slice(3, 5), 16);
    const fb = parseInt(hex.slice(5, 7), 16);
    if (Math.abs(tr0 - fr) < 4 && Math.abs(tg0 - fg) < 4 && Math.abs(tb0 - fb) < 4) return;
    const TOL = 48;
    const match = (i) => Math.abs(d[i] - tr0) + Math.abs(d[i + 1] - tg0) + Math.abs(d[i + 2] - tb0) <= TOL;
    const seen = new Uint8Array(W * H);
    const stack = [x, y];
    while (stack.length) {
      const py = stack.pop();
      let px = stack.pop();
      while (px >= 0 && match(at(px, py)) && !seen[py * W + px]) px--;
      px++;
      let up = false;
      let down = false;
      while (px < W && match(at(px, py)) && !seen[py * W + px]) {
        const i = at(px, py);
        d[i] = fr;
        d[i + 1] = fg;
        d[i + 2] = fb;
        d[i + 3] = 255;
        seen[py * W + px] = 1;
        if (py > 0) {
          const u = at(px, py - 1);
          if (!seen[(py - 1) * W + px] && match(u)) {
            if (!up) {
              stack.push(px, py - 1);
              up = true;
            }
          } else up = false;
        }
        if (py < H - 1) {
          const dn = at(px, py + 1);
          if (!seen[(py + 1) * W + px] && match(dn)) {
            if (!down) {
              stack.push(px, py + 1);
              down = true;
            }
          } else down = false;
        }
        px++;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function paintOp(ctx, op) {
    if (op.t === 'c') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      return;
    }
    if (op.t === 'f') return floodFill(ctx, op.x, op.y, op.c);
    if (op.t !== 's') return;
    const p = op.p;
    ctx.strokeStyle = op.e ? '#FFFFFF' : op.c;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = op.w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (p.length === 2) {
      ctx.beginPath();
      ctx.arc(p[0], p[1], op.w / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    // Smoothing: quadratic curves through midpoints.
    for (let i = 2; i < p.length - 2; i += 2) {
      const mx = (p[i] + p[i + 2]) / 2;
      const my = (p[i + 1] + p[i + 3]) / 2;
      ctx.quadraticCurveTo(p[i], p[i + 1], mx, my);
    }
    ctx.lineTo(p[p.length - 2], p[p.length - 1]);
    ctx.stroke();
  }

  /**
   * One board: fixed 800×600 bitmap, scaled by CSS. editable → pointer drawing that emits ops.
   * @returns {{ el, redraw(batches), addBatch(b), setTool(o), destroy() }}
   */
  function mountBoard(host, o) {
    const opt = o || {};
    const C = Core();
    host.innerHTML = `<canvas class="sc-canvas" width="${C.CANVAS_W}" height="${C.CANVAS_H}" aria-label="${esc(tr('canvas', 'Drawing'))}"></canvas>`;
    const canvas = host.querySelector('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const batches = [];
    let groups = [];
    const tool = { color: '#000000', size: C.BRUSHES[1], mode: 'brush' };
    let strokeK = 0;
    let cur = null;
    let pending = [];
    let flushTimer = null;

    function wipe() {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    function redrawAll() {
      groups = C.replay(batches);
      wipe();
      C.visibleOps(groups).forEach((op) => paintOp(ctx, op));
    }
    wipe();

    /** Incremental when the batch only adds strokes / fills; full replay for undo / redo / clear. */
    function addBatch(b, skipPaint) {
      batches.push(b);
      let data = b;
      try {
        data = typeof b === 'string' ? JSON.parse(b) : b && typeof b.d === 'string' ? JSON.parse(b.d) : b;
      } catch (e) {
        return;
      }
      const ops = (data && data.o) || [];
      if (skipPaint) {
        groups = C.replay(batches);
        return;
      }
      if (ops.some((x) => x && (x.t === 'u' || x.t === 'r' || x.t === 'c'))) return redrawAll();
      groups = C.replay(batches);
      ops.forEach((raw) => {
        const op = C.cleanOp(raw);
        if (op) paintOp(ctx, op);
      });
    }

    function flush() {
      flushTimer = null;
      if (cur && cur.pts.length >= 2) {
        pending.push({ t: 's', k: cur.k, c: cur.c, w: cur.w, e: cur.e, p: cur.pts.slice() });
        cur.pts = cur.pts.slice(-2);
      }
      if (!pending.length) return;
      const batch = { o: pending };
      pending = [];
      addBatch(batch, true);
      if (opt.onBatch) opt.onBatch(batch);
    }
    function queue(op) {
      pending.push(op);
      if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
    }
    const nextK = () => (strokeK = Math.max(strokeK + 1, Date.now() % 1000000000));

    function toCanvas(e) {
      const r = canvas.getBoundingClientRect();
      return [
        Math.max(0, Math.min(C.CANVAS_W, Math.round(((e.clientX - r.left) / r.width) * C.CANVAS_W))),
        Math.max(0, Math.min(C.CANVAS_H, Math.round(((e.clientY - r.top) / r.height) * C.CANVAS_H))),
      ];
    }
    function down(e) {
      if (!opt.editable || !opt.canDraw()) return;
      e.preventDefault();
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (err) {}
      const [x, y] = toCanvas(e);
      if (tool.mode === 'fill') {
        const op = { t: 'f', k: nextK(), c: tool.color, x: Math.min(x, C.CANVAS_W - 1), y: Math.min(y, C.CANVAS_H - 1) };
        paintOp(ctx, op);
        queue(op);
        return;
      }
      const w = e.pointerType === 'pen' && e.pressure ? Math.max(2, Math.round(tool.size * (0.5 + e.pressure))) : tool.size;
      cur = { k: nextK(), c: tool.color, w, e: tool.mode === 'eraser' ? 1 : 0, pts: [x, y], last: [x, y] };
      paintOp(ctx, { t: 's', c: cur.c, w: cur.w, e: cur.e, p: [x, y] });
      if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
    }
    function move(e) {
      if (!cur) return;
      e.preventDefault();
      const co = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      const evs = co && co.length ? co : [e];
      evs.forEach((ev) => {
        const [x, y] = toCanvas(ev);
        const [lx, ly] = cur.last;
        if (Math.abs(x - lx) + Math.abs(y - ly) < 3) return;
        paintOp(ctx, { t: 's', c: cur.c, w: cur.w, e: cur.e, p: [lx, ly, x, y] });
        cur.pts.push(x, y);
        cur.last = [x, y];
      });
      if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
    }
    function up() {
      if (!cur) return;
      if (flushTimer) clearTimeout(flushTimer);
      flush();
      cur = null;
    }
    if (opt.editable) {
      canvas.addEventListener('pointerdown', down);
      canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerup', up);
      canvas.addEventListener('pointercancel', up);
      canvas.addEventListener('pointerleave', up);
      canvas.style.touchAction = 'none';
    }

    function command(t) {
      if (!opt.editable || !opt.canDraw()) return;
      up();
      if (t === 'c') queue({ t: 'c', k: nextK() });
      else queue({ t });
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = null;
      const batch = { o: pending };
      pending = [];
      batches.push(batch);
      redrawAll();
      if (opt.onBatch) opt.onBatch(batch);
    }

    return {
      el: canvas,
      addBatch,
      reset() {
        batches.length = 0;
        groups = [];
        pending = [];
        cur = null;
        wipe();
      },
      setTool(t) {
        Object.assign(tool, t);
      },
      tool,
      undo: () => command('u'),
      redo: () => command('r'),
      clear: () => command('c'),
      canUndo: () => groups.length > 0,
      destroy() {
        if (flushTimer) clearTimeout(flushTimer);
      },
    };
  }

  function toolsHtml() {
    const C = Core();
    return `<div class="sc-tools" data-tools>
      <div class="sc-palette">${C.PALETTE.map((c, i) => `<button type="button" class="sc-swatch${i === 0 ? ' is-on' : ''}" data-color="${c}" style="background:${c}" aria-label="${esc(tr('colour', 'Colour') + ' ' + c)}"></button>`).join('')}
        <label class="sc-swatch sc-custom" aria-label="${esc(tr('customColour', 'Custom colour'))}"><input type="color" data-custom value="#3366ff"></label></div>
      <div class="sc-toolrow">
        ${C.BRUSHES.map((w, i) => `<button type="button" class="sc-tool sc-size${i === 1 ? ' is-on' : ''}" data-size="${w}" aria-label="${esc(tr('brush', 'Brush') + ' ' + (i + 1))}"><i style="width:${Math.min(22, 4 + w / 2)}px;height:${Math.min(22, 4 + w / 2)}px"></i></button>`).join('')}
        <button type="button" class="sc-tool" data-mode="eraser" aria-label="${esc(tr('eraser', 'Eraser'))}">🧽</button>
        <button type="button" class="sc-tool" data-mode="fill" aria-label="${esc(tr('fill', 'Fill'))}">🪣</button>
        <button type="button" class="sc-tool" data-cmd="undo" aria-label="${esc(tr('undo', 'Undo'))}">↶</button>
        <button type="button" class="sc-tool" data-cmd="redo" aria-label="${esc(tr('redo', 'Redo'))}">↷</button>
        <button type="button" class="sc-tool" data-cmd="clear" aria-label="${esc(tr('clear', 'Clear'))}">🗑</button>
      </div>
    </div>`;
  }
  function wireTools(el, board) {
    const setOn = (sel, btn) => {
      el.querySelectorAll(sel).forEach((b) => b.classList.toggle('is-on', b === btn));
    };
    el.querySelectorAll('[data-color]').forEach((b) =>
      b.addEventListener('click', () => {
        board.setTool({ color: b.dataset.color, mode: board.tool.mode === 'eraser' ? 'brush' : board.tool.mode });
        setOn('[data-color]', b);
        if (board.tool.mode === 'brush') setOn('[data-mode]', null);
      })
    );
    el.querySelector('[data-custom]').addEventListener('input', (e) => {
      board.setTool({ color: e.target.value.toUpperCase(), mode: board.tool.mode === 'eraser' ? 'brush' : board.tool.mode });
      setOn('[data-color]', null);
    });
    el.querySelectorAll('[data-size]').forEach((b) =>
      b.addEventListener('click', () => {
        board.setTool({ size: Number(b.dataset.size), mode: board.tool.mode === 'fill' ? 'brush' : board.tool.mode });
        setOn('[data-size]', b);
        if (board.tool.mode === 'brush') setOn('[data-mode]', null);
      })
    );
    el.querySelectorAll('[data-mode]').forEach((b) =>
      b.addEventListener('click', () => {
        const m = board.tool.mode === b.dataset.mode ? 'brush' : b.dataset.mode;
        board.setTool({ mode: m });
        setOn('[data-mode]', m === 'brush' ? null : b);
      })
    );
    el.querySelectorAll('[data-cmd]').forEach((b) => b.addEventListener('click', () => board[b.dataset.cmd]()));
  }

  // ---------------- labels ----------------

  function reasonText(r) {
    return { all: tr('rAll', 'Everyone guessed it!'), time: tr('rTime', 'Time’s up'), skipped: tr('rSkip', 'Turn skipped'), left: tr('rLeft', 'The drawer left — turn skipped'), kicked: tr('rKicked', 'The drawer was removed') }[r] || '';
  }
  function roomDefaults() {
    return Object.assign({}, Core().DEFAULTS, { stake: 0 }, readJson(ROOM_KEY, {}) || {});
  }
  function lobbySummary(ctrl) {
    const s = Core().mergeSettings((ctrl.view.pub && ctrl.view.pub.settings) || {});
    const raw = (ctrl.view.pub && ctrl.view.pub.settings) || {};
    const bits = [s.rounds + ' ' + tr('rounds', 'rounds'), s.drawTime + 's', s.hints + ' ' + (s.hints === 1 ? tr('hint', 'hint') : tr('hintsL', 'hints'))];
    if (s.customOnly) bits.push(tr('customOnly', 'Custom words only'));
    else bits.push(s.packs.length + ' ' + tr('packs', 'packs') + (s.customWords.length ? ' + ' + s.customWords.length + ' ' + tr('custom', 'custom') : ''));
    if (CK()) bits.push(CK().stakeLabel(Number(raw.stake) || 0));
    return bits.join(' · ');
  }

  async function aiOn() {
    try {
      if (typeof isAiFeaturesEnabled === 'function') return !!(await isAiFeaturesEnabled());
    } catch (e) {}
    return false;
  }

  async function generatePack(theme) {
    if (typeof apiFetch !== 'function') return null;
    try {
      const res = await apiFetch('/api/media-config', { method: 'POST', needAuth: true, body: { action: 'dangal_ai', hook: 'generateWordPack', input: { game: 'scribble', theme, count: 30 } } });
      const d = res && (res.data || res);
      if (!d || (d.source !== 'ai' && d.source !== 'cache') || !d.data || !Array.isArray(d.data.words)) return null;
      return Core().parseCustomWords(d.data.words).words;
    } catch (e) {
      return null;
    }
  }

  function openRoomSettings(ctrl) {
    const K = Kit();
    const C = Core();
    const cur = Object.assign({}, roomDefaults(), (ctrl.view.pub && ctrl.view.pub.settings) || {});
    cur.packs = (Array.isArray(cur.packs) ? cur.packs : Object.values(cur.packs || {})).slice();
    const customText = (Array.isArray(cur.customWords) ? cur.customWords : Object.values(cur.customWords || {})).join(', ');
    const packBox = (p) => `<label class="sc-pack"><input type="checkbox" data-pack="${p.id}" ${cur.packs.indexOf(p.id) >= 0 ? 'checked' : ''}><span>${esc(tr('pack.' + p.id, p.name))}</span></label>`;
    const x = K.openSheet({
      title: tr('roomSettings', 'Room settings'),
      bodyHtml: `<div class="cl-setup sc-setup">
        <div class="cl-sub">${esc(tr('roundsT', 'Rounds'))}</div>
        <div class="on-seg-scroll">${K.segHtml('rounds', cur.rounds, [2, 3, 4, 5, 6, 8, 10].map((n) => [n, String(n)]))}</div>
        <div class="cl-sub">${esc(tr('drawTime', 'Draw time'))}</div>
        <div class="on-seg-scroll">${K.segHtml('drawTime', cur.drawTime, [30, 60, 80, 100, 120, 150, 180].map((n) => [n, n + 's']))}</div>
        <div class="cl-sub">${esc(tr('hintsT', 'Letter hints'))}</div>
        ${K.segHtml('hints', cur.hints, [0, 1, 2, 3].map((n) => [n, n ? String(n) : tr('none', 'None')]))}
        <div class="cl-sub">${esc(tr('wordPacks', 'Word packs'))}</div>
        <div class="sc-packs">${C.PACKS.filter((p) => !p.regional).map(packBox).join('')}</div>
        ${CK() ? `<div class="cl-sub">${esc(tr('stake', 'Stake'))}</div>${K.segHtml('stake', Number(cur.stake) || 0, CK().STAKES.map((n) => [n, n ? '⚡' + n : tr('friendly', 'Friendly')]))}<p class="cl-note">${esc(tr('payouts', 'Everyone antes the stake; placement by final score. Virtual chips only.'))}</p>` : ''}
        <details class="cl-advanced"><summary>${esc(tr('advanced', 'Advanced'))}</summary>
          <div class="cl-sub">${esc(tr('regional', 'Regional packs (optional)'))}</div>
          <div class="sc-packs">${C.PACKS.filter((p) => p.regional).map(packBox).join('')}</div>
          <div class="cl-sub">${esc(tr('customWords', 'Custom words'))}</div>
          <textarea class="sc-custom-words" data-custom rows="3" placeholder="${esc(tr('customPh', 'Comma-separated, e.g. pizza party, office chair, space cat'))}">${esc(customText)}</textarea>
          <p class="cl-note" data-custom-note></p>
          <label class="cl-pref"><span><b>${esc(tr('customOnly', 'Custom words only'))}</b><small>${esc(tr('customOnlyDesc', 'Needs at least 10 words'))}</small></span><input type="checkbox" data-custom-only ${cur.customOnly ? 'checked' : ''}></label>
          <div data-ai hidden>
            <div class="cl-sub">${esc(tr('aiPack', 'Themed pack (AI)'))}</div>
            <div class="sc-ai-row"><input class="sc-input" data-theme maxlength="40" placeholder="${esc(tr('themePh', 'Theme, e.g. space, beach, office'))}"><button type="button" class="pk-btn pk-btn--ghost" data-gen>${esc(tr('generate', 'Generate'))}</button></div>
          </div>
        </details>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-save>${esc(tr('save', 'Save'))}</button>
      </div>`,
      onMount(el, close) {
        K.wireSegs(el, cur, () => {});
        const area = el.querySelector('[data-custom]');
        const note = el.querySelector('[data-custom-note]');
        const check = () => {
          const out = C.parseCustomWords(area.value);
          note.textContent = out.words.length
            ? out.words.length + ' ' + tr('wordsOk', 'words') + (out.rejected.length ? ' · ' + out.rejected.length + ' ' + tr('rejected', 'removed by the word filter') : '')
            : out.rejected.length
              ? out.rejected.length + ' ' + tr('rejected', 'removed by the word filter')
              : '';
          return out;
        };
        area.addEventListener('input', check);
        check();
        aiOn().then((on) => {
          const box = el.querySelector('[data-ai]');
          if (on && box) box.hidden = false;
        });
        el.querySelector('[data-gen]').addEventListener('click', async (e) => {
          const theme = el.querySelector('[data-theme]').value.trim();
          if (!theme) return;
          e.target.disabled = true;
          const words = await generatePack(theme);
          e.target.disabled = false;
          if (!words || !words.length) return toast(tr('aiFail', 'Couldn’t make that pack — try another theme'));
          area.value = (area.value.trim() ? area.value.trim() + ', ' : '') + words.join(', ');
          check();
          toast(words.length + ' ' + tr('aiAdded', 'words added'));
        });
        el.querySelector('[data-save]').addEventListener('click', async () => {
          const packs = Array.from(el.querySelectorAll('[data-pack]:checked')).map((b) => b.dataset.pack);
          const words = check().words;
          const next = {
            rounds: Number(cur.rounds),
            drawTime: Number(cur.drawTime),
            hints: Number(cur.hints),
            packs: packs.length ? packs : C.DEFAULT_PACKS.slice(),
            customWords: words,
            customOnly: el.querySelector('[data-custom-only]').checked,
            stake: Number(cur.stake) || 0,
          };
          if (next.customOnly && words.length < 10) return toast(tr('need10', 'Add at least 10 custom words, or untick “custom words only”'));
          writeJson(ROOM_KEY, Object.assign({}, next, { customWords: [] }));
          const out = await ctrl.act('settings', { settings: next });
          if (out) close();
        });
      },
    });
    return x;
  }

  function lobbyListHtml(ctrl, players) {
    const pub = ctrl.view.pub;
    const host = ctrl.isHost();
    return `<div class="pk-lobby-list">${players
      .map(
        (p) =>
          `<div class="pk-lobby-row"><span class="pk-dot" data-presence="${esc(p.id)}"></span><span>${esc(p.name)}</span>${p.id === pub.host ? '<span class="pk-badge">Host</span>' : ''}${
            p.id === ctrl.uid ? '<span class="pk-badge pk-badge--me">You</span>' : host ? `<button type="button" class="pk-link sc-remove" data-remove="${esc(p.id)}">${esc(tr('remove', 'Remove'))}</button>` : ''
          }</div>`
      )
      .join('')}</div>`;
  }
  function canStart(ctrl, players) {
    if (players.length < 2) return { ok: false, label: tr('need2', 'Invite at least 1 friend to start') };
    return { ok: true, label: tr('start', 'Start') + ' · ' + players.length + ' ' + tr('players', 'players') };
  }
  const ERR = {
    WORD_BLOCKED: 'You can’t give away the word',
    BLOCKED: 'Keep it friendly',
    NOT_DRAWER: 'It’s not your turn to draw',
    TOO_FEW: 'Vote-kick needs at least 3 players — ask the host',
    BAD_TARGET: 'You can’t do that to this player',
    BAD_CHOICE: 'Pick one of the three words',
    PHASE: 'Not right now',
    EMPTY: '',
    REMOVED: 'You were removed from this room',
  };
  function errorText(e) {
    const code = String((e && e.code) || '').toUpperCase();
    if (code in ERR) return ERR[code] ? tr('err.' + code.toLowerCase(), ERR[code]) : null;
    return Kit().roomErrorText ? Kit().roomErrorText(e) : e && e.message;
  }

  // ---------------- live room ----------------

  function nameOf(st, id) {
    const p = st.players.find((x) => x.id === id);
    return p ? p.name : tr('player', 'Player');
  }
  function chatLineHtml(st, c, me) {
    const who = c.u === me ? tr('you', 'You') : nameOf(st, c.u);
    if (c.k === 'correct') return `<li class="sc-msg is-correct">${esc(c.u === me ? tr('youGuessed', 'You guessed the word!') : who + ' ' + tr('guessed', 'guessed the word!'))}</li>`;
    if (c.k === 'sys') {
      const txt = { drawing: who + ' ' + tr('isDrawing', 'is drawing now'), skip: who + tr('skipped', '’s turn was skipped'), kicked: who + ' ' + tr('wasRemoved', 'was removed'), joined: who + ' ' + tr('joined', 'joined') }[c.c] || '';
      return txt ? `<li class="sc-msg is-sys">${esc(txt)}</li>` : '';
    }
    if (c.k === 'close') return `<li class="sc-msg is-close">${esc(c.t)}</li>`;
    return `<li class="sc-msg"><b>${esc(who)}</b> ${esc(c.t || '')}</li>`;
  }

  function openPlayerSheet(ctrl, st, id) {
    const me = ctrl.uid;
    const name = nameOf(st, id);
    const votes = Number((st.votes || {})[id]) || 0;
    const active = st.players.filter((p) => !st.kicked[p.id]).length;
    const need = Math.floor((active - 1) / 2) + 1;
    Kit().openSheet({
      title: name,
      bodyHtml: `<div class="sc-psheet">
        ${active >= 3 ? `<button type="button" class="pk-row-btn" data-vk>${esc(tr('voteKick', 'Vote to remove'))} · ${votes}/${need}</button>` : ''}
        ${ctrl.isHost() ? `<button type="button" class="pk-row-btn" data-hk>${esc(tr('hostKick', 'Remove from room'))}</button>` : ''}
        <button type="button" class="pk-row-btn" data-rp>${esc(tr('reportPlayer', 'Report player'))}</button>
      </div>`,
      onMount(el, close) {
        el.querySelector('[data-vk]')?.addEventListener('click', async () => {
          const out = await ctrl.act('votekick', { target: id });
          if (out) toast(out.kicked ? name + ' ' + tr('wasRemoved', 'was removed') : tr('voted', 'Vote counted') + ' · ' + out.count + '/' + out.need);
          close();
        });
        el.querySelector('[data-hk]')?.addEventListener('click', async () => {
          const ok = typeof confirmLeaveGame === 'function' ? await confirmLeaveGame({ title: tr('hostKickQ', 'Remove') + ' ' + name + '?', body: tr('hostKickBody', 'They can’t rejoin this room.') }) : true;
          if (ok) await ctrl.act('kick', { target: id });
          close();
        });
        el.querySelector('[data-rp]').addEventListener('click', () => {
          close();
          if (typeof openFlagSheet === 'function') openFlagSheet({ uid: id, name }, { targetType: 'scribble_player', postId: GAME + ':' + ctrl.view.code });
        });
      },
    });
    return me;
  }

  function reportDrawing(ctrl, st) {
    if (!st.drawer || typeof openFlagSheet !== 'function') return;
    openFlagSheet({ uid: st.drawer, name: nameOf(st, st.drawer) }, { targetType: 'scribble_drawing', postId: GAME + ':' + ctrl.view.code + ':' + st.turnKey });
  }

  /** Mounted once per game; later pub updates patch the header, word bar, players, chat and overlay. */
  function mountLive(ctrl) {
    const code = ctrl.view.code;
    const body = ctrl.render(`<div class="pk-page sc-game">
      <div class="sc-head"><span class="sc-round" data-round></span><span class="sc-word" data-word aria-live="polite"></span><span class="sc-clock" data-clock></span></div>
      <div class="sc-stage"><div class="sc-board" data-board></div><div class="sc-overlay" data-overlay hidden></div>
        <button type="button" class="sc-flag" data-report aria-label="${esc(tr('reportDrawing', 'Report drawing'))}" title="${esc(tr('reportDrawing', 'Report drawing'))}">⚑</button></div>
      <div data-toolhost></div>
      <div class="sc-bottom"><ul class="sc-players" data-players></ul>
        <div class="sc-chat"><ul class="sc-log" data-log aria-live="polite"></ul>
          <form class="scribble-guess-row sc-form" data-form><input data-keep="guess" data-input maxlength="100" autocomplete="off" enterkeyhint="send" placeholder="${esc(tr('guessPh', 'Type your guess'))}"><button type="submit">${esc(tr('send', 'Send'))}</button></form></div></div>
    </div>`);
    const m = { roundNo: ctrl.view.pub.roundNo, body, turnKey: null, ref: null, sent: new Set(), notes: [], myWord: null, board: null, tick: null, st: null };
    const rtdbRef = (path) => (typeof rtdb !== 'undefined' && rtdb ? rtdb.ref(path) : null);

    m.board = mountBoard(body.querySelector('[data-board]'), {
      editable: true,
      canDraw: () => !!(m.st && m.st.phase === 'draw' && m.st.drawer === ctrl.uid),
      onBatch(batch) {
        const ref = rtdbRef('games/scribble_canvas/' + code + '/' + m.turnKey);
        if (!ref) return;
        const node = ref.push();
        m.sent.add(node.key);
        node.set({ d: JSON.stringify(batch) }).catch(() => toast(tr('drawFail', 'Drawing didn’t sync — check your connection')));
      },
    });

    function listen(turnKey) {
      if (m.ref) m.ref.off();
      m.ref = null;
      m.board.reset();
      m.sent = new Set();
      const ref = turnKey ? rtdbRef('games/scribble_canvas/' + code + '/' + turnKey) : null;
      if (!ref) return;
      m.ref = ref;
      ref.on('child_added', (snap) => {
        if (m.sent.has(snap.key)) return;
        const v = snap.val();
        if (v && typeof v.d === 'string') m.board.addBatch(v.d);
      });
    }

    const form = body.querySelector('[data-form]');
    const input = body.querySelector('[data-input]');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      const st = m.st;
      const lastI = st && st.chat.length ? st.chat[st.chat.length - 1].i : 0;
      const out = await ctrl.act('guess', { text });
      if (!out) return;
      if (out.correct) {
        m.myWord = text.toLowerCase();
        CK() && CK().fx && CK().fx('win');
      } else if (out.close) {
        m.notes.push({ after: lastI, turnKey: st && st.turnKey, text: '“' + text + '” ' + tr('soClose', 'is so close!') });
        paintChat();
      }
    });
    body.querySelector('[data-report]').addEventListener('click', () => m.st && reportDrawing(ctrl, m.st));

    function paintChat() {
      const st = m.st;
      if (!st) return;
      const log = body.querySelector('[data-log]');
      const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
      const lines = [];
      st.chat.forEach((c) => {
        lines.push(chatLineHtml(st, c, ctrl.uid));
        m.notes.filter((n) => n.after === c.i).forEach((n) => lines.push(chatLineHtml(st, { k: 'close', t: n.text }, ctrl.uid)));
      });
      m.notes.filter((n) => !st.chat.some((c) => c.i === n.after)).forEach((n) => lines.push(chatLineHtml(st, { k: 'close', t: n.text }, ctrl.uid)));
      log.innerHTML = lines.join('');
      if (atBottom) log.scrollTop = log.scrollHeight;
    }

    function clockText() {
      const st = m.st;
      if (!st || !ctrl.conn) return '';
      const now = ctrl.conn.serverNow();
      let end = 0;
      if (st.phase === 'pick') end = st.phaseAt + st.pickMs;
      else if (st.phase === 'draw') end = st.phaseAt + st.drawMs;
      else if (st.phase === 'reveal') end = st.phaseAt + Core().REVEAL_MS;
      else return '';
      if (ctrl.view.pub && ctrl.view.pub.paused) return '⏸';
      return String(Math.max(0, Math.ceil((end - now) / 1000)));
    }
    m.tick = setInterval(() => {
      if (ctrl.shell.closed || !body.isConnected) return clearInterval(m.tick);
      const el = body.querySelector('[data-clock]');
      if (el) el.textContent = clockText();
    }, 250);

    m.update = function (st) {
      const prev = m.st;
      m.st = st;
      const me = ctrl.uid;
      const drawing = st.drawer === me;
      if (st.turnKey !== m.turnKey) {
        m.turnKey = st.turnKey;
        m.myWord = null;
        m.notes = m.notes.filter((n) => n.turnKey === st.turnKey);
        listen(st.turnKey);
        // Host tidies the previous turn's strokes.
        if (ctrl.isHost() && prev && prev.turnKey && prev.turnKey !== st.turnKey) {
          const old = rtdbRef('games/scribble_canvas/' + code + '/' + prev.turnKey);
          if (old) old.remove().catch(() => {});
        }
      }
      body.querySelector('[data-round]').textContent = tr('round', 'Round') + ' ' + st.round + '/' + st.rounds;
      const secret = ctrl.view.secret && ctrl.view.secret.turnKey === st.turnKey ? ctrl.view.secret : null;
      const wordEl = body.querySelector('[data-word]');
      if (st.phase === 'draw') {
        if (drawing && secret && secret.word) wordEl.innerHTML = `${esc(tr('draw', 'Draw'))}: <b>${esc(secret.word.toUpperCase())}</b>`;
        else if (st.guessed[me] && m.myWord) wordEl.innerHTML = `<b>${esc(m.myWord.toUpperCase())}</b> ✓`;
        else if (st.pattern) wordEl.innerHTML = `<span class="sc-pattern">${esc(st.pattern.replace(/_/g, '＿').split('').join(' '))}</span> <small>${st.pattern.replace(/[^a-z_]/gi, '').length}</small>`;
      } else if (st.phase === 'pick') wordEl.textContent = drawing ? tr('pickWord', 'Pick a word') : nameOf(st, st.drawer) + ' ' + tr('isPicking', 'is picking…');
      else wordEl.textContent = '';

      const tools = body.querySelector('[data-toolhost]');
      const showTools = drawing && st.phase === 'draw';
      if (showTools && !tools.firstChild) {
        tools.innerHTML = toolsHtml();
        wireTools(tools, m.board);
      } else if (!showTools && tools.firstChild) tools.innerHTML = '';
      body.querySelector('[data-report]').hidden = drawing || !st.drawer || (st.phase !== 'draw' && st.phase !== 'reveal');
      body.querySelector('[data-board]').classList.toggle('is-mine', showTools);

      input.placeholder = drawing ? tr('drawerPh', 'Chat (the word is hidden from chat)') : st.guessed[me] ? tr('guessedPh', 'Chat with others who got it') : tr('guessPh', 'Type your guess');

      const kickedMe = st.kicked[me];
      body.querySelector('[data-players]').innerHTML = st.order
        .map((id) => {
          if (st.kicked[id]) return '';
          const p = ctrl.view.pub.players[id];
          if (!p || p.left) return '';
          const pts = st.scores[id] || 0;
          const turnPts = st.turnPts[id];
          return `<li class="sc-player${id === st.drawer ? ' is-drawer' : ''}${st.guessed[id] ? ' is-guessed' : ''}${id === me ? ' is-me' : ''}"><button type="button" data-player="${esc(id)}" ${id === me ? 'disabled' : ''}>
            <span class="pk-dot" data-presence="${esc(id)}"></span><span class="sc-pname">${esc(id === me ? tr('you', 'You') : p.name)}</span>${id === st.drawer ? '<span aria-label="drawing">✏️</span>' : st.guessed[id] ? '<span aria-label="guessed">✓</span>' : ''}
            <b>${pts}</b>${turnPts ? `<em>+${turnPts}</em>` : ''}${(st.votes || {})[id] ? `<small>⚑${st.votes[id]}</small>` : ''}</button></li>`;
        })
        .join('');
      body.querySelectorAll('[data-player]').forEach((b) => b.addEventListener('click', () => openPlayerSheet(ctrl, m.st, b.dataset.player)));
      if (kickedMe) input.disabled = true;

      paintChat();
      paintOverlay(st, secret);
      const clock = body.querySelector('[data-clock]');
      if (clock) clock.textContent = clockText();
    };

    function paintOverlay(st, secret) {
      const ov = body.querySelector('[data-overlay]');
      const me = ctrl.uid;
      let html = '';
      if (st.phase === 'pick') {
        if (st.drawer === me && secret && Array.isArray(secret.choices)) {
          const diff = [tr('easy', 'Easy'), tr('medium', 'Medium'), tr('hard', 'Hard')];
          html = `<div class="sc-pick"><div class="sc-ov-title">${esc(tr('chooseWord', 'Choose a word to draw'))}</div>${secret.choices
            .map((w, i) => `<button type="button" class="sc-choice" data-pick="${i}"><b>${esc(w)}</b><small>${esc(diff[i] || '')}</small></button>`)
            .join('')}</div>`;
        } else html = `<div class="sc-ov-title">${esc(nameOf(st, st.drawer) + ' ' + tr('isChoosing', 'is choosing a word…'))}</div>`;
      } else if (st.phase === 'reveal') {
        const recap = Object.keys(st.turnPts)
          .sort((a, b) => st.turnPts[b] - st.turnPts[a])
          .map((id) => `<li><span>${esc(id === me ? tr('you', 'You') : nameOf(st, id))}${id === st.drawer ? ' ✏️' : ''}</span><b>+${st.turnPts[id]}</b></li>`)
          .join('');
        html = `<div class="sc-reveal"><div class="sc-ov-sub">${esc(reasonText(st.reason))}</div>${
          st.lastWord ? `<div class="sc-ov-title">${esc(tr('wordWas', 'The word was'))} <b>${esc(st.lastWord.toUpperCase())}</b></div>` : ''
        }${recap ? `<ul class="sc-recap">${recap}</ul>` : `<p class="sc-ov-sub">${esc(tr('noPoints', 'No points this turn'))}</p>`}</div>`;
      }
      ov.hidden = !html;
      if (ov.dataset.key === st.turnKey + st.phase + (secret ? 1 : 0) + JSON.stringify(st.turnPts)) return;
      ov.dataset.key = st.turnKey + st.phase + (secret ? 1 : 0) + JSON.stringify(st.turnPts);
      ov.innerHTML = html;
      ov.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => ctrl.act('pick', { idx: Number(b.dataset.pick) })));
    }

    m.destroy = () => {
      if (m.ref) m.ref.off();
      clearInterval(m.tick);
      m.board.destroy();
    };
    return m;
  }

  function renderOver(ctrl, st) {
    const me = ctrl.uid;
    const set = ctrl.view.pub.settlement;
    const results = (set && set.results) || {};
    const rank = st.ranking.length ? st.ranking : Object.keys(st.scores).sort((a, b) => st.scores[b] - st.scores[a]);
    if (ctrl.scribble && ctrl.scribble.destroy) ctrl.scribble.destroy();
    if (!ctrl.scribbleOver || ctrl.scribbleOver !== ctrl.view.pub.roundNo) {
      ctrl.scribbleOver = ctrl.view.pub.roundNo;
      const won = rank[0] === me;
      CK() && CK().fx && CK().fx(won ? 'win' : 'lose');
      if (typeof recordGameResult === 'function') recordGameResult(GAME, won);
    }
    const chip = (id) => {
      const r = results[id];
      if (!r || !r.chipDelta) return set && set.status === 'pending' ? '<span class="cl-rank-chips">…</span>' : '';
      return `<span class="cl-rank-chips ${r.chipDelta > 0 ? 'is-up' : 'is-down'}">${r.chipDelta > 0 ? '+' : ''}${r.chipDelta}</span>`;
    };
    const rows = rank
      .map((id, i) => `<li class="${id === me ? 'is-me' : ''}"><span class="cl-rank-place">${i + 1}</span><span class="cl-rank-name">${esc(id === me ? tr('you', 'You') : nameOf(st, id))}</span><b>${st.scores[id] || 0}</b>${chip(id)}</li>`)
      .join('');
    const top = rank[0];
    const body = ctrl.render(`<div class="pk-page sc-over"><div class="cl-result">
      <div class="cl-result-title">${esc(top === me ? tr('youWin', 'You win!') : nameOf(st, top) + ' ' + tr('wins', 'wins!'))}</div>
      <ol class="cl-rank sc-rank">${rows}</ol>
      ${Kit().roomResultActions(ctrl, { nextLabel: tr('again', 'Play again'), waitLabel: tr('waitAgain', 'Waiting for the host to start another game…') })}
    </div></div>`);
    Kit().wireRoomResultActions(ctrl, body, {
      nextOp: 'start',
      onShare: () => {
        const place = rank.indexOf(me) + 1;
        const text = `${LABEL}: ${place ? '#' + place + ' of ' + rank.length : ''} · ${st.scores[me] || 0} points`;
        if (CK() && CK().shareWin) CK().shareWin(GAME, LABEL, text);
      },
    });
    ctrl.scribble = null;
  }

  function renderLive(ctrl, st) {
    if (st.over) return renderOver(ctrl, st);
    let m = ctrl.scribble;
    if (!m || m.roundNo !== ctrl.view.pub.roundNo || !m.body.isConnected) {
      if (m && m.destroy) m.destroy();
      m = ctrl.scribble = mountLive(ctrl);
    }
    m.update(st);
  }

  function openRoom(code, opts) {
    const K = Kit();
    const o = opts || {};
    return K.openRoomScreen({
      game: GAME,
      label: LABEL,
      code,
      join: !!o.join,
      min: 2,
      max: 12,
      hydrate: (s) => Core().hydrateView(clone(s)),
      lobbySummary,
      openSettings: openRoomSettings,
      lobbyListHtml,
      canStart,
      errorText,
      renderPhase: renderLive,
      onLobbyMount(ctrl, body) {
        if (ctrl.scribble && ctrl.scribble.destroy) ctrl.scribble.destroy();
        ctrl.scribble = null;
        body.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', () => ctrl.act('remove', { target: b.dataset.remove })));
      },
    }).then((ctrl) => {
      if (ctrl && ctrl.shell) {
        const close = ctrl.shell.close;
        ctrl.shell.close = function () {
          if (ctrl.scribble && ctrl.scribble.destroy) ctrl.scribble.destroy();
          return close.apply(this, arguments);
        };
      }
      return ctrl;
    });
  }
  function createRoom(chat) {
    Kit().createRoom({ game: GAME, label: LABEL, chat: chat || null, settings: roomDefaults(), open: (code) => openRoom(code, {}) });
  }

  // ---------------- solo doodle ----------------

  function openDoodle() {
    const K = Kit();
    const shell = K.openShell({ gameId: GAME, title: LABEL, subtitle: tr('doodle', 'Doodle pad') });
    const body = shell.render(`<div class="pk-page sc-game sc-doodle"><div class="sc-stage"><div class="sc-board is-mine" data-board></div></div><div data-toolhost></div>
      <p class="cl-note">${esc(tr('doodleNote', 'Practise your drawing — nothing is shared.'))}</p></div>`);
    const board = mountBoard(body.querySelector('[data-board]'), { editable: true, canDraw: () => true, onBatch() {} });
    const tools = body.querySelector('[data-toolhost]');
    tools.innerHTML = toolsHtml();
    wireTools(tools, board);
  }

  // ---------------- home ----------------

  function openRules() {
    Kit().openSheet({
      title: tr('rulesTitle', 'How to play Scribble'),
      bodyHtml: `<div class="cl-rules">
        <p class="cl-note">${esc(tr('r1', 'Take turns drawing. The drawer picks one of three words (easy, medium, hard) and draws it; everyone else types guesses in the chat.'))}</p>
        <p class="cl-note">${esc(tr('r2', 'Letter hints appear as time runs down. Correct guesses stay hidden from others — you’ll see “Ana guessed the word!”. If you’re one or two letters off, only you see “so close!”.'))}</p>
        <div class="cl-sub">${esc(tr('scoring', 'Scoring'))}</div>
        <p class="cl-note">${esc(tr('r3', 'Guessers score 50 + up to 250 for speed (300 for an instant guess, 50 at the buzzer). The drawer scores for every correct guess — 200 in total when everyone gets it.'))}</p>
        <div class="cl-sub">${esc(tr('fairPlay', 'Fair play'))}</div>
        <p class="cl-note">${esc(tr('r4', 'No letters or numbers in drawings — that’s reportable. The drawer can’t type the word in chat. Vote to remove a player (3+ players), or the host can remove them.'))}</p>
      </div>`,
    });
  }

  function openHome(o) {
    const K = Kit();
    const opts = o || {};
    const shell = K.openShell({ gameId: GAME, title: LABEL, subtitle: tr('sub', 'Draw & guess') });
    shell.render(`<div class="pk-page pk-home">
      <div class="pk-hero">
        <div class="pk-hero-mark">${typeof gameMarkHtml === 'function' ? gameMarkHtml(GAME, { size: 64 }) : '🎨'}</div>
        <div class="pk-hero-title">${esc(LABEL)}</div>
        <div class="pk-hero-sub">${esc(tr('tag', 'One draws, everyone guesses. 2–12 players, live.'))}</div>
      </div>
      <div class="pk-modes">
        <button type="button" class="pk-mode pk-mode--primary" data-go="friends"><span class="pk-mode-title">${esc(tr('friendTitle', 'Play with friends'))}</span><span class="pk-mode-sub">${esc(tr('friendSub', 'Create a room and invite 1–11 friends'))}</span></button>
        <div class="cl-home-links">
          <button type="button" class="pk-link" data-go="join">${esc(tr('join', 'Have a room code? Join'))}</button>
          <button type="button" class="pk-link" data-go="doodle">${esc(tr('doodle', 'Doodle pad'))}</button>
          <button type="button" class="pk-link" data-go="rules">${esc(tr('rules', 'How to play'))}</button>
        </div>
      </div>
    </div>`);
    const b = shell.body;
    b.querySelector('[data-go="friends"]').addEventListener('click', () => {
      if (!K.requireSignIn()) return;
      K.closeThen(shell, () => createRoom(opts.chat));
    });
    b.querySelector('[data-go="join"]').addEventListener('click', () => K.openJoinSheet((code) => K.closeThen(shell, () => openRoom(code, { join: true }))));
    b.querySelector('[data-go="doodle"]').addEventListener('click', () => K.closeThen(shell, openDoodle));
    b.querySelector('[data-go="rules"]').addEventListener('click', openRules);
  }

  function launch(ctx) {
    const c = ctx || {};
    if (!Core() || !Kit()) return toast(tr('loading', 'Scribble is still loading — try again'));
    const chat = typeof chatFromLaunch === 'function' ? chatFromLaunch(c) : c.chat;
    const inChat = chat && chat.id && chat.id !== 'ai' && (c.source === 'chat' || c.source === 'baithak' || chat.type === 'group' || chat.isGroup || c.isGroup);
    if (c.practiceKind === 'solo' || c.source === 'solo') return openDoodle();
    if (inChat && Kit().isSignedIn()) return createRoom(chat);
    return openHome({ chat });
  }

  const lazy = (fn) => (Kit() && typeof Kit().withGameData === 'function' ? Kit().withGameData(GAME, fn) : fn);
  const openGame = lazy(launch);

  if (Kit() && typeof Kit().registerPartyGame === 'function') {
    Kit().registerPartyGame(GAME, { openRoom: lazy((code, o) => openRoom(code, { join: !!(o && o.join) })) });
  }
  if (typeof registerGame === 'function') {
    registerGame({
      id: 'scribble',
      name: 'Scribble',
      desc: 'Draw & guess · 2–12 players · Live rooms',
      icon: '🎨',
      ratingKey: 'scribble',
      gameType: 'party',
      genre: 'words',
      dangal: true,
      liveParty: true,
      chat1v1: true,
      chatGroup: true,
      selfChat: true,
      ownHome: true,
      order: 90,
      meta: {
        core: 'scribble-core.js (turns, hints, scoring, near-miss, word filter, canvas replay; shared with the server)',
        live: 'party_room → server-lib/scribble-engine.js; server-dealt words, drawer-only secret, strokes via games/scribble_canvas',
      },
      launch: openGame,
    });
  }

  window.ScribbleGame = { launch: openGame, openHome: lazy(openHome), openRoom: lazy(openRoom), createRoom: lazy(createRoom), openDoodle: lazy(openDoodle), mountBoard };
})();
