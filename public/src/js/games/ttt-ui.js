/**
 * Tic-Tac-Toe (Dangal P3) — Classic 3×3 and Ultimate (9×9), unrated.
 * Play vs bot (Classic: Easy / Medium / Unbeatable · Ultimate: Easy / Normal / Hard) · Pass & Play ·
 * Play a friend (party room, server-checked moves).
 */
(function () {
  'use strict';

  const GAME = 'ttt';
  const SETUP_KEY = 'chaupaal_ttt_setup';
  const Core = () => window.TttCore;
  const CK = () => window.ClassicsKit;
  const Kit = () => window.PartyKit;
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  function tr(key, fallback) {
    return typeof t === 'function' ? t('ttt.' + key, fallback) : fallback;
  }
  const LABEL = 'Tic-Tac-Toe';
  const clone = (x) => JSON.parse(JSON.stringify(x));
  function toast(msg) {
    if (typeof showToast === 'function') showToast(msg);
  }
  const MARK_COLOR = { X: '#0072B2', O: '#D55E00' };

  function modeLabel(m) {
    return m === 'ultimate' ? tr('ultimate', 'Ultimate') : tr('classic', 'Classic');
  }
  function levelsFor(mode) {
    return mode === 'ultimate' ? Core().ULTIMATE_LEVELS : Core().CLASSIC_LEVELS;
  }
  function levelNote(mode, level) {
    if (mode === 'classic' && level === 'unbeatable') return tr('unbeatableNote', 'Unbeatable bot always draws or wins');
    if (mode === 'classic' && level === 'medium') return tr('mediumNote', 'Plays well, sometimes slips');
    return '';
  }

  function markSvg(m) {
    if (m === 'X') return `<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2L8 8M8 2L2 8" stroke="${MARK_COLOR.X}" stroke-width="1.6" stroke-linecap="round"/></svg>`;
    if (m === 'O') return `<svg viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="3" fill="none" stroke="${MARK_COLOR.O}" stroke-width="1.5"/></svg>`;
    return '';
  }

  // ---------------- board ----------------

  function boardHtml(st, canPlay) {
    const T = Core();
    const legal = canPlay ? T.legalMoves(st) : [];
    if (st.mode === 'classic') {
      const line = st.over && st.winner && st.winner !== 'D' ? T.winLine(st.cells) || [] : [];
      return `<div class="ttt-grid ttt-grid--classic" role="grid">${st.cells
        .map((v, i) => {
          const can = legal.indexOf(i) >= 0;
          return `<button type="button" class="ttt-cell${v ? ' is-filled' : ''}${can ? ' is-legal' : ''}${i === st.last ? ' is-last' : ''}${line.indexOf(i) >= 0 ? ' is-win' : ''}" data-cell="${i}" ${
            can ? '' : 'disabled'
          } aria-label="${esc((v || tr('empty', 'Empty')) + ' ' + (i + 1))}">${markSvg(v)}</button>`;
        })
        .join('')}</div>`;
    }
    const boards = [];
    for (let b = 0; b < 9; b++) {
      const won = st.small[b];
      const active = !st.over && canPlay && legal.some((i) => Math.floor(i / 9) === b);
      let cells = '';
      for (let k = 0; k < 9; k++) {
        const i = b * 9 + k;
        const v = st.cells[i];
        const can = legal.indexOf(i) >= 0;
        cells += `<button type="button" class="ttt-cell ttt-cell--mini${v ? ' is-filled' : ''}${can ? ' is-legal' : ''}${i === st.last ? ' is-last' : ''}" data-cell="${i}" ${can ? '' : 'disabled'} aria-label="${esc(
          tr('board', 'Board') + ' ' + (b + 1) + ', ' + (v || tr('empty', 'Empty')) + ' ' + (k + 1)
        )}">${markSvg(v)}</button>`;
      }
      boards.push(
        `<div class="ttt-mini${active ? ' is-active' : ''}${won ? ' is-done' : ''}${won === 'D' ? ' is-draw' : ''}">${cells}${won && won !== 'D' ? `<div class="ttt-mini-mark">${markSvg(won)}</div>` : ''}</div>`
      );
    }
    return `<div class="ttt-grid ttt-grid--ultimate">${boards.join('')}</div>`;
  }

  function statusText(st, mineMarks, names) {
    if (st.over) {
      if (st.winner === 'D') return tr('draw', 'It’s a draw');
      const n = names[st.winner] || st.winner;
      return (mineMarks.length === 1 && mineMarks[0] === st.winner ? tr('youWin', 'You win!') : n + ' ' + tr('wins', 'wins!')) + (st.result === 'timeout' ? ' · ' + tr('onTime', 'on time') : st.result === 'left' ? ' · ' + tr('oppLeft', 'opponent left') : st.result === 'resign' ? ' · ' + tr('resigned', 'resignation') : '');
    }
    const who = names[st.turn] || st.turn;
    if (mineMarks.indexOf(st.turn) >= 0) {
      const base = mineMarks.length > 1 ? who + ' (' + st.turn + ') — ' + tr('yourMove', 'your move') : tr('yourTurn', 'Your turn');
      if (st.mode === 'ultimate') return base + ' · ' + (st.next >= 0 && !st.small[st.next] ? tr('playIn', 'play in the highlighted board') : tr('anyBoard', 'any open board'));
      return base;
    }
    return who + ' ' + tr('thinking', 'is thinking…');
  }

  // ---------------- local ----------------

  function loadSetup() {
    return Object.assign({ mode: 'classic', level: 'medium', ulevel: 'normal', youFirst: true }, CK().readJson(SETUP_KEY, {}));
  }

  function startLocal(opts) {
    const K = Kit();
    const T = Core();
    const C = CK();
    const o = Object.assign({}, opts);
    const vsBot = o.kind === 'bot';
    const level = o.mode === 'ultimate' ? o.ulevel : o.level;
    const me = { id: 'p0', name: (K && K.myName()) || tr('you', 'You') };
    const other = vsBot ? { id: 'bot', name: tr('bot', 'Bot') + ' · ' + C.levelLabel(level), bot: true, level } : { id: 'p1', name: tr('player2', 'Player 2') };
    const round = o.round || 1;
    const youFirst = vsBot ? (round % 2 === 1) === !!o.youFirst : true;
    const players = youFirst ? [me, other] : [other, me];
    if (!vsBot && round % 2 === 0) players.reverse();
    const st = T.newMatch(o.mode, players);
    const rng = C.seededRng(C.newSeed());
    const names = {};
    st.seats.forEach((s) => (names[s.mark] = s.name));
    const mineMarks = () => (vsBot ? st.seats.filter((s) => !s.bot).map((s) => s.mark) : ['X', 'O']);
    let timer = null;
    let recorded = false;
    const shell = K.openShell({
      gameId: GAME,
      title: LABEL,
      subtitle: modeLabel(o.mode) + ' · ' + (vsBot ? C.levelLabel(level) : tr('passTitle', 'Pass & Play')),
      confirmLeave: () => !st.over && st.seq > 0,
      leaveBody: tr('leaveLocal', 'This game will end.'),
      onClose: () => clearTimeout(timer),
    });
    function paint() {
      if (shell.closed) return;
      const botTurn = vsBot && !st.over && st.seats[T.seatOfMark(st, st.turn)].bot;
      const canPlay = !st.over && !botTurn;
      const note = vsBot ? levelNote(o.mode, level) : '';
      const body = shell.render(`<div class="pk-page ttt-game">
        <div class="cl-players">${st.seats
          .map((s) => `<div class="cl-player${!st.over && s.mark === st.turn ? ' is-turn' : ''}"><span class="ttt-chip">${markSvg(s.mark)}</span><span class="cl-player-name">${esc(s.name)}</span>${s.bot ? `<span class="cl-tag">${esc(tr('bot', 'Bot'))}</span>` : ''}</div>`)
          .join('')}</div>
        <div class="cl-banner" role="status" aria-live="polite" data-tone="${canPlay ? 'you' : ''}">${esc(statusText(st, mineMarks(), names))}</div>
        <div class="ttt-wrap">${boardHtml(st, canPlay)}</div>
        ${note ? `<p class="cl-note ttt-note">${esc(note)}</p>` : ''}
        <div class="cl-controls" data-controls></div>
        <p class="cl-note">${esc(tr('unrated', 'Tic-Tac-Toe is unrated.'))}</p>
      </div>`);
      body.querySelectorAll('[data-cell]').forEach((btn) =>
        btn.addEventListener('click', () => {
          const out = T.play(st, Number(btn.dataset.cell));
          if (out.error) return C.fx('invalid');
          C.fx('place');
          after();
        })
      );
      if (st.over) {
        const ctl = body.querySelector('[data-controls]');
        if (!recorded) {
          recorded = true;
          const draw = st.winner === 'D';
          const won = vsBot && !draw && mineMarks()[0] === st.winner;
          C.fx(draw ? 'place' : !vsBot || won ? 'win' : 'lose');
          if (vsBot && typeof recordGameResult === 'function') recordGameResult(GAME, !!won, draw);
        }
        const line = statusText(st, mineMarks(), names);
        ctl.innerHTML = `<div class="cl-result"><button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-again>${esc(tr('again', 'Play again'))}</button>
          <div class="pk-row"><button type="button" class="pk-btn pk-btn--ghost" data-share>${esc(tr('share', 'Share'))}</button><button type="button" class="pk-btn pk-btn--ghost" data-home>${esc(tr('change', 'Change mode'))}</button></div></div>`;
        ctl.querySelector('[data-again]').addEventListener('click', () => K.closeThen(shell, () => startLocal(Object.assign({}, o, { round: round + 1 }))));
        ctl.querySelector('[data-home]').addEventListener('click', () => K.closeThen(shell, () => openHome({})));
        ctl.querySelector('[data-share]').addEventListener('click', () => C.shareWin(GAME, LABEL, line + ' · ' + modeLabel(o.mode) + (vsBot ? ' vs ' + C.levelLabel(level) + ' ' + tr('bot', 'bot') : '')));
      }
    }
    function after() {
      paint();
      clearTimeout(timer);
      if (st.over || !vsBot) return;
      const seat = st.seats[T.seatOfMark(st, st.turn)];
      if (!seat.bot) return;
      timer = setTimeout(() => {
        if (shell.closed || st.over) return;
        const mv = T.botMove(st, level, rng);
        if (mv >= 0) T.play(st, mv);
        C.fx('place');
        after();
      }, C.ms(o.mode === 'ultimate' ? 350 : 450));
    }
    after();
  }

  function openLocalSheet(kind, onGo) {
    const K = Kit();
    const s = loadSetup();
    const levelSeg = () =>
      `<div class="cl-sub">${esc(tr('botLevel', 'Bot level'))}</div>${K.segHtml(s.mode === 'ultimate' ? 'ulevel' : 'level', s.mode === 'ultimate' ? s.ulevel : s.level, levelsFor(s.mode).map((l) => [l, CK().levelLabel(l)]))}<p class="cl-note" data-level-note>${esc(levelNote(s.mode, s.mode === 'ultimate' ? s.ulevel : s.level))}</p>`;
    K.openSheet({
      title: kind === 'bot' ? tr('botTitle', 'Play vs bot') : tr('passTitle', 'Pass & Play'),
      bodyHtml: `<div class="cl-setup">
        <div class="cl-sub">${esc(tr('mode', 'Mode'))}</div>
        <div data-mode-seg>${K.segHtml('mode', s.mode, [['classic', modeLabel('classic')], ['ultimate', modeLabel('ultimate')]])}</div>
        <p class="cl-note" data-mode-note></p>
        ${kind === 'bot' ? '<div data-level></div>' : ''}
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-go>${esc(tr('start', 'Start'))}</button>
      </div>`,
      onMount(el, close) {
        const note = () => {
          el.querySelector('[data-mode-note]').textContent =
            s.mode === 'ultimate'
              ? tr('ultimateHow', 'Nine small boards. Where you play sends your opponent to that board. Win three small boards in a row.')
              : tr('classicHow', 'Three in a row wins.');
        };
        const paintLevel = () => {
          const host = el.querySelector('[data-level]');
          if (!host) return;
          host.innerHTML = levelSeg();
          K.wireSegs(host, s, () => (host.querySelector('[data-level-note]').textContent = levelNote(s.mode, s.mode === 'ultimate' ? s.ulevel : s.level)));
        };
        K.wireSegs(el.querySelector('[data-mode-seg]'), s, () => {
          note();
          paintLevel();
        });
        note();
        paintLevel();
        el.querySelector('[data-go]').addEventListener('click', () => {
          CK().writeJson(SETUP_KEY, s);
          close();
          setTimeout(() => onGo(Object.assign({ kind }, s)), 80);
        });
      },
    });
  }

  // ---------------- Live room ----------------

  function lobbySummary(ctrl) {
    const s = (ctrl.view.pub && ctrl.view.pub.settings) || {};
    return modeLabel(s.mode) + ' · ' + CK().stakeLabel(Number(s.stake) || 0) + ' · ' + tr('unratedShort', 'unrated');
  }
  function openRoomSettings(ctrl) {
    const K = Kit();
    const cur = Object.assign({ mode: 'classic', stake: 0 }, (ctrl.view.pub && ctrl.view.pub.settings) || {});
    K.openSheet({
      title: tr('roomSettings', 'Room settings'),
      bodyHtml: `<div class="cl-setup">
        <div class="cl-sub">${esc(tr('mode', 'Mode'))}</div>${K.segHtml('mode', cur.mode, [['classic', modeLabel('classic')], ['ultimate', modeLabel('ultimate')]])}
        <div class="cl-sub">${esc(tr('stake', 'Stake'))}</div>${K.segHtml('stake', cur.stake, CK().STAKES.map((n) => [n, n ? '⚡' + n : tr('friendly', 'Friendly')]))}
        <p class="cl-note">${esc(tr('stakeNote', 'Winner takes the other stake; a draw returns both. Unrated. Virtual chips only.'))}</p>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-save>${esc(tr('save', 'Save'))}</button>
      </div>`,
      onMount(el, close) {
        K.wireSegs(el, cur, () => {});
        el.querySelector('[data-save]').addEventListener('click', async () => {
          const out = await ctrl.act('settings', { settings: cur });
          if (out) close();
        });
      },
    });
  }

  function renderLive(ctrl, st) {
    const T = Core();
    const pub = ctrl.view.pub;
    const meSeat = st.seats.findIndex((s) => s.id === ctrl.uid);
    const myMark = meSeat >= 0 ? st.seats[meSeat].mark : null;
    const names = {};
    st.seats.forEach((s) => (names[s.mark] = s.name));
    const canPlay = !st.over && myMark === st.turn;
    const prev = ctrl.tttPrev;
    if (prev && prev.round === pub.roundNo && prev.seq !== st.seq && !st.over) CK().fx(canPlay ? 'turn' : 'place');
    ctrl.tttPrev = { round: pub.roundNo, seq: st.seq };
    const body = ctrl.render(`<div class="pk-page ttt-game">
      <div class="cl-players">${st.seats
        .map((s) => `<div class="cl-player${!st.over && s.mark === st.turn ? ' is-turn' : ''}"><span class="ttt-chip">${markSvg(s.mark)}</span><span class="cl-player-name">${esc(s.name)}</span>${s.id === ctrl.uid ? `<span class="cl-tag">${esc(tr('you', 'You'))}</span>` : ''}<span class="pk-dot" data-presence="${esc(s.id)}"></span></div>`)
        .join('')}</div>
      <div class="cl-banner" role="status" aria-live="polite" data-tone="${canPlay ? 'you' : ''}">${esc(statusText(st, myMark ? [myMark] : [], names))} ${st.over ? '' : '<span class="cl-timer pk-timer" data-timer></span>'}</div>
      <div class="ttt-wrap">${boardHtml(st, canPlay)}</div>
      <div class="cl-controls" data-controls></div>
    </div>`);
    ctrl.wire(body);
    body.querySelectorAll('[data-cell]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        body.querySelectorAll('[data-cell]').forEach((b) => (b.disabled = true));
        CK().fx('place');
        await ctrl.act('play', { cell: Number(btn.dataset.cell) });
      })
    );
    const ctl = body.querySelector('[data-controls]');
    if (!st.over) {
      if (myMark) {
        ctl.innerHTML = `<button type="button" class="pk-link" data-resign>${esc(tr('resign', 'Resign'))}</button>`;
        ctl.querySelector('[data-resign]').addEventListener('click', async () => {
          const go = typeof confirmLeaveGame === 'function' ? await confirmLeaveGame({ title: tr('resignQ', 'Resign this game?'), body: tr('resignBody', 'Your opponent wins this game.') }) : true;
          if (go) ctrl.act('resign');
        });
      }
      return;
    }
    const set = pub.settlement;
    const r = set && set.results && set.results[ctrl.uid];
    if (ctrl.tttFx !== pub.roundNo) {
      ctrl.tttFx = pub.roundNo;
      const draw = st.winner === 'D';
      CK().fx(draw ? 'place' : st.winner === myMark ? 'win' : 'lose');
      if (typeof recordGameResult === 'function') recordGameResult(GAME, !draw && st.winner === myMark, draw);
    }
    const chips = r && r.chipDelta ? `<div class="cl-result-chips ${r.chipDelta > 0 ? 'is-up' : 'is-down'}">${r.chipDelta > 0 ? '+' : ''}${r.chipDelta} ${esc(tr('chips', 'virtual chips'))}</div>` : '';
    const line = statusText(st, myMark ? [myMark] : [], names);
    ctl.innerHTML = `<div class="cl-result">${chips}${Kit().roomResultActions(ctrl, { nextLabel: tr('rematch', 'Rematch'), waitLabel: tr('waitRematch', 'Waiting for the host to start a rematch…') })}</div>`;
    Kit().wireRoomResultActions(ctrl, ctl, { nextOp: 'start', onShare: () => CK().shareWin(GAME, LABEL, line + ' · ' + modeLabel(st.mode)) });
  }

  function openRoom(code, opts) {
    return Kit().openRoomScreen({
      game: GAME,
      label: LABEL,
      code,
      join: !!(opts && opts.join),
      min: 2,
      max: 2,
      hydrate: (s) => Core().hydrate(clone(s)),
      lobbySummary,
      openSettings: openRoomSettings,
      canStart: (ctrl, players) => (players.length < 2 ? { ok: false, label: tr('waitFriend', 'Waiting for your friend to join') } : { ok: true, label: tr('start', 'Start') }),
      renderPhase: renderLive,
    });
  }
  function createRoom(chat, settings) {
    const s = settings || { mode: loadSetup().mode, stake: 0 };
    Kit().createRoom({ game: GAME, label: LABEL, chat: chat || null, settings: s, open: (code) => openRoom(code, {}) });
  }

  // ---------------- home ----------------

  function openHome(o) {
    const K = Kit();
    const opts = o || {};
    const s = loadSetup();
    const shell = K.openShell({ gameId: GAME, title: LABEL, subtitle: tr('sub', 'Board') });
    shell.render(`<div class="pk-page pk-home">
      <div class="pk-hero">
        <div class="pk-hero-mark">${typeof gameMarkHtml === 'function' ? gameMarkHtml(GAME, { size: 64 }) : '⭕'}</div>
        <div class="pk-hero-title">${esc(LABEL)}</div>
        <div class="pk-hero-sub">${esc(tr('tag', 'Classic 3×3, or Ultimate: nine boards in one.'))}</div>
      </div>
      <div class="pk-modes">
        <button type="button" class="pk-mode pk-mode--primary" data-go="bot"><span class="pk-mode-title">${esc(tr('botTitle', 'Play vs bot'))}</span><span class="pk-mode-sub">${esc(modeLabel(s.mode) + ' · ' + CK().levelLabel(s.mode === 'ultimate' ? s.ulevel : s.level))}</span></button>
        <button type="button" class="pk-mode" data-go="friends"><span class="pk-mode-title">${esc(tr('friendTitle', 'Play a friend'))}</span><span class="pk-mode-sub">${esc(tr('friendSub', 'Live 1v1 on your own phones · unrated'))}</span></button>
        <button type="button" class="pk-mode" data-go="pass"><span class="pk-mode-title">${esc(tr('passTitle', 'Pass & Play'))}</span><span class="pk-mode-sub">${esc(tr('passSub', 'Two players, one phone'))}</span></button>
        <div class="cl-home-links">
          <button type="button" class="pk-link" data-go="join">${esc(tr('join', 'Have a room code? Join'))}</button>
          <button type="button" class="pk-link" data-go="change">${esc(tr('change', 'Change mode'))}</button>
        </div>
      </div>
    </div>`);
    const b = shell.body;
    b.querySelector('[data-go="bot"]').addEventListener('click', () => K.closeThen(shell, () => startLocal(Object.assign({ kind: 'bot' }, loadSetup()))));
    b.querySelector('[data-go="change"]').addEventListener('click', () => openLocalSheet('bot', (x) => K.closeThen(shell, () => startLocal(x))));
    b.querySelector('[data-go="pass"]').addEventListener('click', () => openLocalSheet('pass', (x) => K.closeThen(shell, () => startLocal(x))));
    b.querySelector('[data-go="friends"]').addEventListener('click', () => {
      if (!K.requireSignIn()) return;
      K.closeThen(shell, () => createRoom(opts.chat));
    });
    b.querySelector('[data-go="join"]').addEventListener('click', () => K.openJoinSheet((code) => K.closeThen(shell, () => openRoom(code, { join: true }))));
  }

  function launch(ctx) {
    const c = ctx || {};
    if (!Core() || !Kit() || !CK()) return toast(tr('loading', 'Tic-Tac-Toe is still loading — try again'));
    const chat = typeof chatFromLaunch === 'function' ? chatFromLaunch(c) : c.chat;
    const inChat = chat && chat.id && chat.id !== 'ai' && (c.source === 'chat' || c.source === 'baithak' || chat.type === 'group' || chat.isGroup);
    if (c.practiceKind === 'vsAi' || c.mode === 'practice') return startLocal(Object.assign({ kind: 'bot' }, loadSetup()));
    if (inChat && Kit().isSignedIn()) return createRoom(chat);
    return openHome({ chat });
  }

  const lazy = (fn) => (Kit() && typeof Kit().withGameData === 'function' ? Kit().withGameData(GAME, fn) : fn);
  const openGame = lazy(launch);

  if (Kit() && typeof Kit().registerPartyGame === 'function') {
    Kit().registerPartyGame(GAME, { openRoom: (code, o) => openRoom(code, { join: !!(o && o.join) }) });
  }
  if (typeof registerGame === 'function') {
    registerGame({
      id: 'ttt',
      name: 'Tic-Tac-Toe',
      desc: 'Classic + Ultimate · bots · Live 1v1 · unrated',
      icon: '⭕',
      ratingKey: 'ttt',
      gameType: 'dual',
      genre: 'board',
      dangal: true,
      liveDuel: true,
      chat1v1: true,
      selfChat: true,
      ownHome: true,
      order: 50,
      meta: {
        core: 'ttt-core.js (perfect minimax for Classic, MCTS for Ultimate, shared with the server)',
        live: 'party_room → server-lib/classics-rooms.js; server-checked moves, unrated, optional stake',
      },
      launch: openGame,
    });
  }

  window.TttGame = { launch: openGame, openHome: lazy(openHome), openRoom: lazy(openRoom), startLocal: lazy(startLocal) };
  window.openTicTacToe = function () {
    openGame({ source: 'manch', mode: 'home' });
  };
})();
