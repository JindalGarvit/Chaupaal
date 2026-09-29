// ===================== TIP TAP (solo match-3) =====================
/**
 * Tip Tap (Dangal P14). Rules, cascades, specials and scoring: tiptap-engine.js (deterministic, also
 * replayed by the server). 150 validated levels: tiptap-levels.js (lazy). Progress sync, the Daily,
 * leaderboards, challenge links and share: solo-hub.js. Solo only — no Live, no chips, no lives.
 */
function openTipTap(ctx) {
  const toast = (msg) => { if (typeof showToast === 'function' && msg) showToast(msg); };
  const TT = window.TipTapEngine;
  const Hub = window.SoloHub;
  const Core = window.SoloCore;
  if (!TT || !Hub || !Core) return toast('Tip Tap is still loading — try again');
  if (!window.TipTapLevels) {
    if (window.PartyKit && PartyKit.ensureGameData) {
      return PartyKit.ensureGameData('tiptap').then(
        () => (window.TipTapLevels ? openTipTap(ctx) : toast('Couldn’t load Tip Tap — try again')),
        () => toast('Couldn’t load Tip Tap — check your connection and try again')
      );
    }
    return toast('Tip Tap is still loading — try again');
  }
  const LV = window.TipTapLevels;
  const GAME = 'tiptap';
  const N_LEVELS = LV.count;
  const PALETTE = [
    { name: 'Red', fill: '#E63946', glow: '#FF6B6B', shape: '●' },
    { name: 'Amber', fill: '#F4A261', glow: '#FFD166', shape: '▲' },
    { name: 'Teal', fill: '#2A9D8F', glow: '#5EEAD4', shape: '■' },
    { name: 'Blue', fill: '#4C75D9', glow: '#93C5FD', shape: '◆' },
    { name: 'Violet', fill: '#9B5DE5', glow: '#D8B4FE', shape: '★' },
    { name: 'Coral', fill: '#E76F51', glow: '#FDBA74', shape: '✚' },
  ];
  const SP = TT.SP;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const fmt = (n) => Number(n || 0).toLocaleString();

  let settings = Hub.settings(GAME);
  let T = timings();
  function timings() {
    const rm = Hub.reducedMotion(GAME);
    return { swap: rm ? 60 : 150, pop: rm ? 90 : 230, fall: rm ? 80 : 260, notice: rm ? 700 : 1100, idle: 5000 };
  }

  let run = null;
  let view = null;
  let shownScore = 0;
  let selected = -1;
  let animating = false;
  let hintPair = null;
  let previewCells = null;
  let hintTimer = null;
  let clockTimer = null;
  let cellSize = 40;
  let pauseCtrl = null;
  let suppressClickUntil = 0;

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute;inset:0;z-index:80;display:flex;flex-direction:column;';
  const begin = typeof beginGameOverlaySession === 'function' ? beginGameOverlaySession : null;
  const gs = begin
    ? begin({
        type: 'tiptap',
        title: 'Tip Tap',
        mode: 'solo',
        overlay,
        cleanup() {
          stopTimers();
          document.removeEventListener('visibilitychange', onVisibility);
          if (pauseCtrl) {
            pauseCtrl.destroy();
            pauseCtrl = null;
          }
        },
      })
    : null;
  if (begin && (!gs || !gs.alive())) return;
  if (!begin) {
    const device = document.querySelector('.device');
    if (!device) return toast('Game container not found');
    device.appendChild(overlay);
  }
  if (typeof prepareGameOverlay === 'function') prepareGameOverlay(overlay, { theme: 'dark', gameId: 'tiptap' });

  const alive = () => (gs ? gs.alive() : overlay.isConnected);
  const schedule = (fn, ms) => (gs ? gs.schedule(fn, ms) : setTimeout(fn, ms));
  const wait = (ms) => new Promise((r) => schedule(r, ms));
  const $ = (id) => overlay.querySelector('#' + id);
  const isPaused = () => !!(pauseCtrl && pauseCtrl.isPaused && pauseCtrl.isPaused());
  const close = () => {
    stopTimers();
    if (pauseCtrl) {
      pauseCtrl.destroy();
      pauseCtrl = null;
    }
    if (gs) gs.close();
    else overlay.remove();
  };

  // ---------------- clock ----------------

  function elapsed() {
    if (!run) return 0;
    return run.activeMs + (run.tickFrom ? Date.now() - run.tickFrom : 0);
  }
  function clockStart() {
    if (!run || run.over || run.tickFrom || isPaused()) return;
    run.tickFrom = Date.now();
    if (!clockTimer) clockTimer = setInterval(onClock, 250);
  }
  function clockStop() {
    if (run && run.tickFrom) {
      run.activeMs += Date.now() - run.tickFrom;
      run.tickFrom = 0;
    }
  }
  function stopTimers() {
    clockStop();
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = null;
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = null;
  }
  function onClock() {
    if (!alive()) return stopTimers();
    if (!run || run.over) return;
    if (run.level.time) {
      hud();
      if (!animating && elapsed() >= run.level.time * 1000) {
        TT.endByTime(run.s);
        finish();
      }
    }
  }
  function onVisibility() {
    if (document.hidden) clockStop();
    else if (run && !run.over && !isPaused() && !overlayOpen()) clockStart();
  }
  document.addEventListener('visibilitychange', onVisibility);

  // ---------------- board view ----------------

  const viewOf = (s) => ({ col: s.col.slice(), sp: s.sp.slice(), id: s.id.slice(), lock: s.lock.slice(), tile: s.tile.slice(), score: s.score });
  const rowOf = (i) => Math.floor(i / run.s.cols);

  function pieceHtml(k, sp) {
    if (k === -1) return '';
    if (sp === SP.ITEM || k === TT.ITEM_COL) return '<span class="tt-item" aria-hidden="true">🍒</span>';
    if (sp === SP.RAINBOW || k === TT.RAINBOW_COL) return '<span class="tt-gem tt-gem--rainbow" aria-hidden="true"></span>';
    const pal = PALETTE[k] || PALETTE[0];
    const cls = sp === SP.H ? ' tt-sp-h' : sp === SP.V ? ' tt-sp-v' : sp === SP.BOMB ? ' tt-sp-bomb' : '';
    const shape = settings.colorblind ? `<i class="tt-shape">${pal.shape}</i>` : '';
    return `<span class="tt-gem${cls}" style="--tt-fill:${pal.fill};--tt-glow:${pal.glow}" aria-hidden="true">${shape}</span>`;
  }
  function ariaOf(i) {
    const k = view.col[i];
    const sp = view.sp[i];
    if (k === -1) return 'empty';
    let base;
    if (sp === SP.ITEM) base = 'fruit';
    else if (sp === SP.RAINBOW) base = 'prism';
    else base = (PALETTE[k] ? PALETTE[k].name : 'gem') + (sp === SP.H ? ' row line' : sp === SP.V ? ' column line' : sp === SP.BOMB ? ' bomb' : '');
    if (view.lock[i]) base += ', chained';
    if (view.tile[i]) base += ', jelly';
    return base;
  }
  function neighbours(i) {
    const C = run.s.cols;
    const out = [];
    if (i % C > 0) out.push(i - 1);
    if (i % C < C - 1) out.push(i + 1);
    if (i - C >= 0) out.push(i - C);
    if (i + C < run.s.col.length) out.push(i + C);
    return out;
  }

  function render(o) {
    const opts = o || {};
    const grid = $('cbGrid');
    if (!grid || !view || !run) return;
    const C = run.s.cols;
    grid.style.gridTemplateColumns = `repeat(${C},1fr)`;
    const targets = selected >= 0 && !animating ? neighbours(selected).filter((j) => TT.validSwap(run.s, selected, j)) : [];
    let html = '';
    for (let i = 0; i < view.col.length; i++) {
      const cls = ['tt-cell', 'game-tap-target'];
      if (view.tile[i]) cls.push('tt-jelly', 'tt-jelly-' + view.tile[i]);
      if (view.lock[i]) cls.push('is-locked');
      if (i === selected) cls.push('is-selected');
      if (targets.indexOf(i) !== -1) cls.push('is-target');
      if (hintPair && (hintPair[0] === i || hintPair[1] === i)) cls.push('is-hint');
      else if (previewCells && previewCells.indexOf(i) !== -1) cls.push('is-preview');
      if (opts.pop && opts.pop.has(i)) cls.push('tt-piece--pop');
      if (opts.nope && opts.nope.indexOf(i) !== -1) cls.push('tt-piece--nope');
      if (opts.enter) cls.push('tt-piece--enter');
      let style = '';
      if (opts.fall && opts.fall.has(i)) {
        cls.push('tt-piece--fall');
        style = `--tt-fall:${Math.min(12, opts.fall.get(i)) * cellSize}px;`;
      }
      if (opts.slide && opts.slide.has(i)) {
        const d = opts.slide.get(i);
        cls.push('tt-piece--slide');
        style += `--tt-dx:${d[0] * cellSize}px;--tt-dy:${d[1] * cellSize}px;`;
      }
      html += `<button type="button" class="${cls.join(' ')}" data-i="${i}" aria-label="${esc(ariaOf(i))}"${style ? ` style="${style}"` : ''}>${pieceHtml(view.col[i], view.sp[i])}${view.lock[i] ? '<span class="tt-chain" aria-hidden="true"></span>' : ''}</button>`;
    }
    grid.innerHTML = html;
    grid.classList.toggle('is-calm', Hub.reducedMotion(GAME));
    const sample = grid.querySelector('.tt-cell');
    if (sample) cellSize = sample.getBoundingClientRect().height || cellSize;
    hud();
  }

  function goalChip(g) {
    const done = g.done ? ' is-done' : '';
    if (g.t === 'score') return `<span class="tt-goal-chip${done}">Score ${fmt(g.have)}/${fmt(g.need)}</span>`;
    if (g.t === 'color') {
      const p = PALETTE[g.c] || PALETTE[0];
      return `<span class="tt-goal-chip${done}"><span class="tt-goal-swatch" style="--tt-fill:${p.fill};--tt-glow:${p.glow}"></span>${settings.colorblind ? p.shape + ' ' : ''}${g.have}/${g.need}</span>`;
    }
    if (g.t === 'tiles') return `<span class="tt-goal-chip${done}"><span class="tt-goal-jelly"></span>Jelly ${g.have}/${g.need}</span>`;
    if (g.t === 'locks') return `<span class="tt-goal-chip${done}">⛓ Chains ${g.have}/${g.need}</span>`;
    if (g.t === 'items') return `<span class="tt-goal-chip${done}">🍒 ${g.have}/${g.need}</span>`;
    return '';
  }
  function goalText(g) {
    if (g.t === 'score') return 'Score ' + fmt(g.n);
    if (g.t === 'color') return 'Clear ' + g.n + ' ' + (PALETTE[g.c] ? PALETTE[g.c].name : '') + (settings.colorblind && PALETTE[g.c] ? ' ' + PALETTE[g.c].shape : '');
    if (g.t === 'tiles') return 'Clear all ' + g.n + ' jelly tiles';
    if (g.t === 'locks') return 'Break all ' + g.n + ' chains';
    if (g.t === 'items') return 'Bring ' + g.n + ' fruit to the bottom';
    return '';
  }

  function hud() {
    if (!run) return;
    const s = run.s;
    const score = animating ? shownScore : s.score;
    const scoreEl = $('cbScore');
    if (scoreEl) scoreEl.textContent = fmt(score);
    const movesEl = $('cbMoves');
    if (movesEl) {
      if (run.level.time) {
        const left = Math.max(0, run.level.time * 1000 - elapsed());
        movesEl.innerHTML = `⏱ <strong class="${left < 10000 ? 'tt-low' : ''}">${Hub.fmtMs(left + 999)}</strong>`;
      } else {
        const left = Math.max(0, s.movesLimit - s.movesUsed);
        movesEl.innerHTML = `Moves <strong class="${left <= 3 ? 'tt-low' : ''}">${left}</strong>`;
      }
    }
    const goalsEl = $('cbGoals');
    if (goalsEl) goalsEl.innerHTML = run.kind === 'daily' ? '<span class="tt-goal-chip">Daily · highest score wins</span>' : TT.goalStatus(s).map(goalChip).join('');
    const fill = $('cbProgress');
    if (fill) {
      const st = run.level.stars || [];
      const top = st[2] || Math.max(1, score);
      fill.style.width = Math.min(100, Math.round((100 * score) / top)) + '%';
      const marks = $('cbStarMarks');
      if (marks && st[2]) marks.innerHTML = st.map((v, k) => `<i style="left:${Math.min(100, (100 * v) / top)}%" class="${score >= v ? 'is-on' : ''}" title="${k + 1}★ ${fmt(v)}">★</i>`).join('');
      else if (marks) marks.innerHTML = '';
    }
  }

  // ---------------- hints + preview ----------------

  function clearHint() {
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = null;
    if (hintPair || previewCells) {
      hintPair = null;
      previewCells = null;
      return true;
    }
    return false;
  }
  function armIdleHint() {
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = null;
    if (!settings.hints || !run || run.over) return;
    hintTimer = schedule(() => {
      hintTimer = null;
      if (!run || run.over || animating || isPaused() || selected >= 0) return;
      showHint();
    }, T.idle);
  }
  function showHint() {
    if (!run || run.over || animating) return;
    const m = TT.hintMove(run.s);
    if (!m) return;
    hintPair = m;
    const pv = TT.previewSwap(run.s, m[0], m[1]);
    previewCells = pv ? pv.cells : null;
    render();
  }

  // ---------------- moves ----------------

  async function doSwap(a, b) {
    if (animating || !run || run.over || isPaused()) return;
    clearHint();
    if (!TT.validSwap(run.s, a, b)) {
      selected = -1;
      render({ nope: [a, b] });
      Hub.feedback(GAME, 'invalid');
      armIdleHint();
      return;
    }
    animating = true;
    selected = -1;
    shownScore = run.s.score;
    const t = Math.round(elapsed());
    const C = run.s.cols;
    const dx = (b % C) - (a % C);
    const dy = Math.floor(b / C) - Math.floor(a / C);
    ['col', 'sp', 'id'].forEach((k) => {
      const x = view[k][a];
      view[k][a] = view[k][b];
      view[k][b] = x;
    });
    render({ slide: new Map([[a, [dx, dy]], [b, [-dx, -dy]]]) });
    Hub.feedback(GAME, 'move');
    await wait(T.swap);
    const res = TT.swap(run.s, a, b);
    if (!res.ok) {
      view = viewOf(run.s);
      animating = false;
      render();
      return;
    }
    run.log.push([a, b, t]);
    await playEvents(res.events);
    if (!alive()) return;
    view = viewOf(run.s);
    animating = false;
    render();
    afterMove();
  }

  async function playEvents(events) {
    let lastFall = null;
    for (let k = 0; k < events.length; k++) {
      if (!alive()) return;
      const ev = events[k];
      if (ev.t === 'clear') {
        const pop = new Set(ev.cells.concat(ev.broke || []));
        render({ pop });
        clearFx(ev);
        await wait(T.pop);
      } else if (ev.t === 'fall') lastFall = ev;
      else if (ev.t === 'board') {
        view = ev;
        shownScore = ev.score;
        if (lastFall) {
          const fall = new Map();
          lastFall.moves.forEach((m) => fall.set(m[1], rowOf(m[1]) - rowOf(m[0])));
          lastFall.spawned.forEach((x) => fall.set(x.i, x.drop));
          lastFall = null;
          render({ fall });
          await wait(T.fall);
        } else render();
      } else if (ev.t === 'collect') {
        ev.cells.forEach((i) => scorePop(i, '🍒 +' + fmt(500)));
        Hub.feedback(GAME, 'coin');
        await wait(T.pop);
      } else if (ev.t === 'bonus') {
        notice(`${ev.moves} moves left → +${fmt(ev.gained)}`);
        shownScore += ev.gained;
        hud();
        await wait(T.notice);
      } else if (ev.t === 'shuffle') {
        notice('No moves left — shuffled the board');
        await wait(T.notice);
      }
    }
  }

  function cellCenter(i) {
    const grid = $('cbGrid');
    const fx = $('cbFx');
    const el = grid && grid.querySelector(`[data-i="${i}"]`);
    if (!el || !fx) return null;
    const a = el.getBoundingClientRect();
    const b = fx.getBoundingClientRect();
    return { x: a.left - b.left + a.width / 2, y: a.top - b.top + a.height / 2 };
  }
  function spawnFx(i, type) {
    if (Hub.reducedMotion(GAME) && type === 'spark') return;
    const p = cellCenter(i);
    const fx = $('cbFx');
    if (!p || !fx) return;
    const el = document.createElement('div');
    el.className = 'tt-fx tt-fx--' + type + (Hub.reducedMotion(GAME) ? ' tt-fx--short' : '');
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
    fx.appendChild(el);
    schedule(() => el.remove(), 700);
  }
  function scorePop(i, text) {
    const p = cellCenter(i);
    const fx = $('cbFx');
    if (!p || !fx || Hub.reducedMotion(GAME)) return;
    const el = document.createElement('div');
    el.className = 'tt-score-pop';
    el.textContent = text;
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
    fx.appendChild(el);
    schedule(() => el.remove(), 950);
  }
  function clearFx(ev) {
    (ev.fired || []).forEach((f) => spawnFx(f.i, f.sp === SP.BOMB ? 'bomb' : f.sp === SP.RAINBOW ? 'rainbow' : 'line'));
    if (ev.cells.length) {
      const mid = ev.cells[Math.floor(ev.cells.length / 2)];
      spawnFx(mid, 'spark');
      scorePop(mid, '+' + fmt(ev.gained));
    }
    if (ev.combo) notice(ev.combo);
    else if (ev.step >= 2) notice(['', '', 'Nice!', 'Great!', 'Superb!', 'Incredible!'][Math.min(5, ev.step)] || 'Incredible!');
    Hub.feedback(GAME, ev.fired && ev.fired.length ? 'capture' : ev.step ? 'coin' : 'valid');
  }
  function notice(text) {
    const el = $('ttNotice');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('is-on');
    void el.offsetWidth;
    el.classList.add('is-on');
  }

  function afterMove() {
    const s = run.s;
    if (run.level.time && s.status === 'play' && elapsed() >= run.level.time * 1000) TT.endByTime(s);
    if (s.status !== 'play') return finish();
    armIdleHint();
  }

  // ---------------- screens ----------------

  const overlayOpen = () => $('cbOverlay') && $('cbOverlay').style.display === 'flex';
  function showOverlay(html) {
    const el = $('cbOverlay');
    el.innerHTML = `<div class="tt-result-card">${html}</div>`;
    el.style.display = 'flex';
    return el;
  }
  function hideOverlay() {
    const el = $('cbOverlay');
    if (el) {
      el.style.display = 'none';
      el.innerHTML = '';
    }
  }
  function screen(name) {
    ['ttHub', 'ttPicker', 'ttPlay'].forEach((id) => {
      const el = $(id);
      if (el) el.hidden = id !== name;
    });
    const inPlay = name === 'ttPlay';
    const pauseBtn = $('cbPause');
    if (pauseBtn) pauseBtn.style.visibility = inPlay ? 'visible' : 'hidden';
    const hintBtn = $('cbHint');
    if (hintBtn) hintBtn.style.visibility = inPlay ? 'visible' : 'hidden';
    const sc = $('cbScore');
    if (sc) sc.style.visibility = inPlay ? 'visible' : 'hidden';
  }
  function setSub(text) {
    const sub = overlay.querySelector('.game-chrome-subtitle');
    if (sub) sub.textContent = text;
  }

  function starTotal(p) {
    return Object.keys(p.stars).reduce((a, k) => a + (p.stars[k] || 0), 0);
  }

  function showHub() {
    stopTimers();
    run = null;
    animating = false;
    hideOverlay();
    screen('ttHub');
    setSub('Solo · ' + N_LEVELS + ' levels · Daily');
    const p = Hub.load(GAME);
    const cont = Math.min(N_LEVELS, p.level);
    const contBtn = $('ttContinue');
    if (contBtn) contBtn.textContent = p.best >= N_LEVELS ? 'Replay level ' + N_LEVELS : 'Play level ' + cont;
    const meta = $('ttHubMeta');
    if (meta) meta.textContent = `★ ${starTotal(p)} / ${N_LEVELS * 3}` + (p.best ? ` · ${p.best} cleared` : '');
    const d = $('ttDaily');
    if (d) {
      const ds = Hub.dailyState(GAME);
      const st = Hub.streak(GAME);
      d.innerHTML = `Daily Challenge <small>${ds.done ? 'Played ✓' : ds.started ? 'Practice' : 'New today'}${st ? ' · 🔥 ' + st : ''}</small>`;
    }
  }

  function openPicker() {
    hideOverlay();
    screen('ttPicker');
    setSub('Choose a level');
    const p = Hub.load(GAME);
    const grid = $('ttPickerGrid');
    if (!grid) return;
    let html = '';
    for (let n = 1; n <= N_LEVELS; n++) {
      const locked = n > p.level;
      const stars = p.stars[n] || 0;
      const lv = LV.get(n);
      const cls = 'tt-pick-cell game-tap-target' + (locked ? ' is-locked' : '') + (stars ? ' is-cleared' : '') + (n === p.level && !stars ? ' is-current' : '');
      html += `<button type="button" class="${cls}" data-n="${n}" ${locked ? 'disabled' : ''} aria-label="Level ${n}${locked ? ' locked' : stars ? ', ' + stars + ' stars' : ''}"><b>${locked ? '·' : n}</b><small>${locked ? '' : stars ? '★'.repeat(stars) : lv && lv.time ? '⏱' : ''}</small></button>`;
    }
    grid.innerHTML = html;
    const cur = grid.querySelector('.is-current') || grid.querySelector(`[data-n="${Math.min(N_LEVELS, p.level)}"]`);
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'center' });
  }

  function showIntro(n, challenge) {
    const lv = LV.get(n);
    if (!lv) return showHub();
    const p = Hub.load(GAME);
    const stars = p.stars[n] || 0;
    const best = p.bests[n] || 0;
    const limit = lv.time ? `⏱ ${lv.time} seconds` : `${lv.moves} moves`;
    const goals = lv.goals.map((g) => `<li>${esc(goalText(g))}</li>`).join('');
    const target = challenge ? Hub.targetHtml(challenge) : '';
    const el = showOverlay(`<div class="solo-res">
      <div class="solo-res-title">Level ${n}</div>
      ${target}
      <ul class="tt-goals-check">${goals}</ul>
      <div class="solo-res-line">${esc(limit)} · 3★ at ${fmt(lv.stars[2])}</div>
      ${best ? `<div class="solo-res-line">Your best: ${'★'.repeat(stars)} ${fmt(best)}</div>` : ''}
      <div class="solo-actions"><button type="button" class="solo-btn solo-btn--primary" data-go="play">Play</button></div>
      <div class="solo-actions solo-actions--quiet"><button type="button" class="solo-link" data-go="board">Friends’ scores</button><button type="button" class="solo-link" data-go="back">Back</button></div></div>`);
    el.querySelector('[data-go="play"]').addEventListener('click', () => {
      hideOverlay();
      startRun('level', { n, challenge });
    });
    el.querySelector('[data-go="board"]').addEventListener('click', () => Hub.openBoard(GAME, Core.boardId(GAME, 'level', n), { title: 'Level ' + n }));
    el.querySelector('[data-go="back"]').addEventListener('click', () => {
      hideOverlay();
      if (!run || run.over) showHub();
    });
  }

  function openDailyFlow() {
    Hub.openDaily(GAME, {
      title: 'Tip Tap Daily',
      detail: '20 moves · highest score wins',
      onPlay: async (fresh) => {
        if (!fresh) return startRun('daily', { practice: true });
        const r = await Hub.startDaily(GAME);
        if (!alive()) return;
        if (!r.scored) toast('You’ve already played today’s Daily on another device — this one is practice');
        startRun('daily', { practice: !r.scored });
      },
    });
  }

  function startRun(kind, o) {
    const opts = o || {};
    let level;
    let boardId;
    let day = null;
    if (kind === 'level') {
      level = LV.get(opts.n);
      boardId = Core.boardId(GAME, 'level', opts.n);
    } else {
      day = Hub.today();
      level = TT.dailyLevel(day);
      boardId = Core.boardId(GAME, 'daily', day);
    }
    const s = TT.createGame(level, level.seed);
    s.snap = true;
    run = { kind, n: opts.n || 0, level, s, log: [], activeMs: 0, tickFrom: 0, over: false, boardId, practice: !!opts.practice, day, challenge: opts.challenge || null };
    view = viewOf(s);
    shownScore = 0;
    selected = -1;
    animating = false;
    clearHint();
    hideOverlay();
    screen('ttPlay');
    setSub(kind === 'daily' ? (run.practice ? 'Daily · practice' : 'Daily Challenge') : 'Level ' + opts.n + (level.time ? ' · timed' : ''));
    const tg = $('ttTarget');
    if (tg) tg.innerHTML = run.challenge ? Hub.targetHtml(run.challenge) : '';
    render({ enter: true });
    clockStart();
    armIdleHint();
  }

  async function finish() {
    if (!run || run.over) return;
    run.over = true;
    clockStop();
    clearHint();
    const s = run.s;
    const ms = Math.round(elapsed());
    const payload = { moves: run.log, score: s.score, ms };
    if (typeof setGamePB === 'function') setGamePB('tiptap', s.score);
    if (run.kind === 'daily') return finishDaily(payload);
    const n = run.n;
    const won = s.status === 'won';
    const stars = TT.starsFor(s);
    const before = Hub.load(GAME);
    const prevBest = before.bests[n] || 0;
    if (won) {
      const p = Hub.update(GAME, (x) => {
        if (n <= x.level) {
          x.level = Math.max(x.level, Math.min(N_LEVELS, n + 1));
          x.best = Math.max(x.best, n);
        }
        x.stars[n] = Math.max(x.stars[n] || 0, stars);
        x.bests[n] = Math.max(x.bests[n] || 0, s.score);
        x.pb.tiptap = Math.max(x.pb.tiptap || 0, s.score);
        return x;
      });
      try {
        localStorage.setItem('tiptap_level', String(p.level));
        localStorage.setItem('tiptap_best_level', String(p.best));
      } catch (e) {}
    }
    try {
      if (typeof recordGameResult === 'function') recordGameResult('tiptap', won, false, { score: s.score, level: n, scoreOnly: true });
    } catch (e) {}
    Hub.feedback(GAME, won ? 'win' : 'lose');
    if (won && typeof launchConfetti === 'function' && !Hub.reducedMotion(GAME) && stars === 3) launchConfetti();
    const beat = run.challenge && Number.isFinite(run.challenge.beatScore) ? (s.score > run.challenge.beatScore ? 'You beat the challenge! 🎯' : 'Challenge not beaten this time') : '';
    const status = won ? [beat, s.score > prevBest && prevBest ? 'New best for this level' : ''].filter(Boolean).join(' · ') : '';
    const goalsList = TT.goalStatus(s)
      .map((g) => `<li class="${g.done ? 'is-done' : 'is-miss'}">${g.done ? '✓' : '✗'} ${esc(goalText(Object.assign({ n: g.need }, g)))}</li>`)
      .join('');
    const html = Hub.resultHtml({
      title: won ? `Level ${n} cleared` : run.level.time ? 'Time’s up' : 'Out of moves',
      stars: won ? stars : null,
      lines: [`<b>${fmt(s.score)}</b> points`, won ? '' : `<ul class="tt-goals-check">${goalsList}</ul>`],
      status,
      primary: won ? (n < N_LEVELS ? 'Next level' : 'Replay') : 'Try again',
      secondary: won ? 'Replay' : 'Levels',
      share: won,
      board: true,
    });
    const el = showOverlay(html + '<p class="solo-note" data-note></p>');
    Hub.wireResult(el, {
      primary: () => (won && n < N_LEVELS ? showIntro(n + 1) : startRun('level', { n, challenge: run.challenge })),
      secondary: () => (won ? startRun('level', { n, challenge: run.challenge }) : openPicker()),
      share: () => Hub.share(GAME, { title: 'Level ' + n, line: `${'★'.repeat(stars)} ${fmt(s.score)} pts`, score: s.score, params: { lv: n } }),
      board: () => Hub.openBoard(GAME, run.boardId, { title: 'Level ' + n }),
      close: () => showHub(),
    });
    if (won && s.score > prevBest) {
      const note = el.querySelector('[data-note]');
      if (Hub.signedIn() && note) note.textContent = 'Checking your score…';
      const res = Hub.signedIn() ? await Hub.submit(GAME, run.boardId, payload) : null;
      if (note && note.isConnected) note.textContent = Hub.submitNote(res);
    }
  }

  async function finishDaily(payload) {
    const s = run.s;
    Hub.feedback(GAME, 'complete');
    const el = showOverlay(
      Hub.resultHtml({
        title: run.practice ? 'Daily · practice' : 'Daily Challenge',
        lines: [`<b>${fmt(s.score)}</b> points`, `🔥 ${Hub.streak(GAME)} day streak`],
        primary: 'Practice again',
        share: true,
        board: true,
      }) + '<p class="solo-note" data-note></p>'
    );
    const dayNo = run.day;
    const shareInfo = { title: 'Daily ' + Core.dayKeyOf(dayNo), line: fmt(s.score) + ' pts', score: s.score, params: { mode: 'daily' } };
    Hub.wireResult(el, {
      primary: () => startRun('daily', { practice: true }),
      share: () => Hub.share(GAME, shareInfo),
      board: () => Hub.openBoard(GAME, run.boardId, { title: 'Tip Tap Daily' }),
      close: () => showHub(),
    });
    const note = el.querySelector('[data-note]');
    if (run.practice) {
      if (note) note.textContent = 'Practice run — only your first try today counts.';
      return;
    }
    if (note && Hub.signedIn()) note.textContent = 'Checking your score…';
    const res = await Hub.finishDaily(GAME, payload, { score: s.score, line: fmt(s.score) + ' pts' });
    if (note && note.isConnected) note.textContent = Hub.submitNote(res.scored ? res : { ranked: false, reason: 'practice' }) || '';
    const streakLine = el.querySelectorAll('.solo-res-line')[1];
    if (streakLine) streakLine.textContent = `🔥 ${Hub.streak(GAME)} day streak`;
  }

  // ---------------- chrome ----------------

  overlay.innerHTML = `
    ${gameChromeHtml({
      title: 'Tip Tap',
      subtitle: 'Solo · Match-3',
      backId: 'cbBack',
      pauseId: 'cbPause',
      rightHtml:
        '<button type="button" id="cbHint" class="game-chrome-action game-tap-target" aria-label="Show a hint" style="visibility:hidden">Hint</button>' +
        '<span class="game-chrome-metric" id="cbScore" style="visibility:hidden">0</span>',
    })}
    <div id="ttHub" class="tt-hub">
      <div class="tt-hub-title">Tip Tap</div>
      <div class="tt-hub-sub">Match 3 or more · clear the goals</div>
      <div id="ttHubMeta" class="tt-hub-meta"></div>
      <button type="button" id="ttContinue" class="tt-hub-cta game-tap-target">Play</button>
      <button type="button" id="ttDaily" class="tt-hub-secondary game-tap-target">Daily Challenge</button>
      <button type="button" id="ttOpenLevels" class="tt-hub-secondary game-tap-target">All levels</button>
      <div class="solo-hub-row"><button type="button" class="solo-link" id="ttRules">How to play</button><button type="button" class="solo-link" id="ttSettings">Settings</button></div>
    </div>
    <div id="ttPicker" class="tt-picker" hidden>
      <div class="tt-picker-head">Levels</div>
      <div id="ttPickerGrid" class="tt-picker-grid"></div>
      <button type="button" id="ttPickerBack" class="tt-hub-secondary game-tap-target">Back</button>
    </div>
    <div id="ttPlay" class="tt-play" hidden>
      <div class="tt-meter">
        <div id="ttTarget"></div>
        <div class="tt-meter-row"><span id="cbMoves"></span></div>
        <div id="cbGoals" class="tt-goals" aria-live="polite"></div>
        <div class="tt-meter-track tt-meter-track--stars"><div id="cbProgress" class="tt-meter-fill"></div><div id="cbStarMarks" class="tt-star-marks"></div></div>
      </div>
      <div class="tt-board-wrap">
        <div id="cbGrid" class="tt-grid"></div>
        <div id="cbFx" class="tt-fx-layer" aria-hidden="true"></div>
        <div id="ttNotice" class="tt-notice" aria-live="polite"></div>
      </div>
    </div>
    <div id="cbOverlay" class="tt-result-overlay"></div>
  `;

  $('cbBack').addEventListener('click', () => {
    if (overlayOpen() && !run) return hideOverlay();
    if (!$('ttPicker').hidden) return showHub();
    if (!$('ttHub').hidden) return close();
    if (!run || run.over) return showHub();
    clockStop();
    const ask =
      typeof confirmLeaveGame === 'function'
        ? confirmLeaveGame({ title: 'Leave this level?', body: run.kind === 'daily' && !run.practice ? 'Your Daily try ends here and won’t count.' : 'This run won’t be saved.' })
        : Promise.resolve(window.confirm('Leave this level?'));
    Promise.resolve(ask).then((ok) => {
      if (ok) showHub();
      else clockStart();
    });
  });
  $('cbHint').addEventListener('click', (e) => {
    e.stopPropagation();
    if (!clearHint()) showHint();
    else render();
  });
  $('ttContinue').addEventListener('click', () => showIntro(Math.min(N_LEVELS, Hub.load(GAME).level)));
  $('ttDaily').addEventListener('click', openDailyFlow);
  $('ttOpenLevels').addEventListener('click', openPicker);
  $('ttPickerBack').addEventListener('click', showHub);
  $('ttPickerGrid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-n]');
    if (b && !b.disabled) showIntro(Number(b.dataset.n));
  });
  $('ttRules').addEventListener('click', () => {
    if (window.DangalRules && DangalRules.openSheet) DangalRules.openSheet(GAME, { variants: { mode: 'campaign' } });
  });
  $('ttSettings').addEventListener('click', () =>
    Hub.openSettings(GAME, ['sound', 'haptics', 'reducedMotion', 'hints', 'colorblind'], (ns) => {
      settings = ns;
      T = timings();
    })
  );

  if (typeof createGamePauseController === 'function') {
    pauseCtrl = createGamePauseController({
      host: overlay,
      pauseBtnId: 'cbPause',
      onPause() {
        clockStop();
      },
      onResume() {
        clockStart();
      },
      onQuit: close,
    });
  }

  // ---------------- input: tap-select or swipe ----------------

  const gridEl = $('cbGrid');
  gridEl.addEventListener('click', (ev) => {
    const cell = ev.target.closest('.tt-cell');
    if (!cell || !run || run.over || animating || isPaused() || Date.now() < suppressClickUntil) return;
    const i = Number(cell.dataset.i);
    clearHint();
    if (selected < 0) {
      selected = i;
      Hub.feedback(GAME, 'select');
      render();
    } else if (selected === i) {
      selected = -1;
      render();
    } else if (neighbours(selected).indexOf(i) !== -1) {
      doSwap(selected, i);
    } else {
      selected = i;
      Hub.feedback(GAME, 'select');
      render();
    }
    armIdleHint();
  });
  let sx = 0;
  let sy = 0;
  let sCell = -1;
  gridEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = e.target.closest && e.target.closest('.tt-cell');
    if (!el || animating || !run || run.over || isPaused()) return;
    sx = e.clientX;
    sy = e.clientY;
    sCell = Number(el.dataset.i);
    try {
      gridEl.setPointerCapture(e.pointerId);
    } catch (err) {}
  });
  gridEl.addEventListener('pointerup', (e) => {
    if (sCell < 0 || !run) return;
    const a = sCell;
    sCell = -1;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (Math.abs(dx) < 22 && Math.abs(dy) < 22) return;
    const C = run.s.cols;
    let b = a;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0 && a % C < C - 1) b = a + 1;
      else if (dx < 0 && a % C > 0) b = a - 1;
    } else if (dy > 0 && a + C < run.s.col.length) b = a + C;
    else if (dy < 0 && a - C >= 0) b = a - C;
    if (b === a) return;
    suppressClickUntil = Date.now() + 350;
    doSwap(a, b);
  });
  gridEl.addEventListener('pointercancel', () => (sCell = -1));
  overlay.addEventListener('keydown', (e) => {
    if (!run || run.over || animating || $('ttPlay').hidden) return;
    const C = run.s.cols;
    const N = run.s.col.length;
    const cur = selected >= 0 ? selected : 0;
    const dirs = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -C, ArrowDown: C };
    if (dirs[e.key] == null) return;
    e.preventDefault();
    const b = cur + dirs[e.key];
    if (b < 0 || b >= N || (Math.abs(dirs[e.key]) === 1 && Math.floor(b / C) !== Math.floor(cur / C))) return;
    if (e.shiftKey && selected >= 0) return doSwap(cur, b);
    selected = b;
    render();
    const el = gridEl.querySelector(`[data-i="${b}"]`);
    if (el) el.focus();
  });

  showHub();
  Hub.sync(GAME).then(() => {
    if (alive() && !$('ttHub').hidden) showHub();
  });

  const p = ctx && ctx.params ? ctx.params : null;
  if (p && p.mode === 'daily') openDailyFlow();
  else if (p && p.lv) {
    const n = Math.max(1, Math.min(N_LEVELS, parseInt(p.lv, 10) || 1));
    showIntro(n, ctx.source === 'challenge' ? ctx : null);
  }
}

// --- Game registry self-registration (arcade.js) ---
if (typeof registerGame === 'function') {
  registerGame({
    id: 'tiptap',
    name: 'Tip Tap',
    desc: 'Match-3 · 150 levels + a Daily · Solo',
    icon: '✨',
    ratingKey: 'tiptap',
    gameType: 'solo',
    genre: 'solo',
    solo: true,
    selfChat: true,
    order: 110,
    meta: { graduated: true, phase: 1 },
    launch(ctx) {
      openTipTap(ctx);
    },
  });
}
