/**
 * Texas Hold'em (No-Limit) — Practice vs bots · Quick tables · Sit & Go · Friends tables.
 *
 * Rules, evaluator, pots and bots live in poker-core.js (shared with the server). Practice runs a
 * local table on this phone. Live tables never deal on the phone: POST /api/media-config
 * { action: 'poker_table' } → server-lib/poker-engine.js shuffles, deals, times and settles;
 * RTDB games/poker/{tableId}/pub carries the public table, secrets/{uid} only your two cards.
 */
(function () {
  'use strict';

  const GAME = 'poker';
  const LABEL = "Texas Hold'em";
  const KEY_SETTINGS = 'chaupaal_poker_settings';
  const KEY_HISTORY = 'chaupaal_poker_history';
  const HISTORY_MAX = 20;
  const PRACTICE_STACK = 2000;
  const PRACTICE_BLINDS = [10, 20];
  const ACTION_MS = window.DangalLivePolicy ? window.DangalLivePolicy.policyFor('poker').turnMs : 20000;
  const BIG_WIN_BB = 20;
  const BOT_NAMES = ['Ava', 'Leo', 'Maya', 'Kai', 'Zoe', 'Omar', 'Nina', 'Sam', 'Iris', 'Theo'];

  const Core = () => window.PokerCore;
  const Kit = () => window.PartyKit;
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

  function tr(key, fallback) {
    return typeof t === 'function' ? t('poker.' + key, fallback) : fallback;
  }
  function toast(msg) {
    if (typeof showToast === 'function') showToast(msg);
  }
  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }
  function readJson(key, fb) {
    try {
      const v = JSON.parse(localStorage.getItem(key) || 'null');
      return v == null ? fb : v;
    } catch (e) {
      return fb;
    }
  }
  function writeJson(key, v) {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch (e) {}
  }
  const fmt = (n) => (Core() ? Core().formatChips(n) : String(n));

  function settings() {
    const s = Object.assign({ helper: true, bots: 'regular', seats: 6 }, readJson(KEY_SETTINGS, {}));
    if (Core() && Core().BOT_LEVELS.indexOf(s.bots) < 0) s.bots = 'regular';
    s.seats = clamp(Math.floor(Number(s.seats) || 6), 2, 6);
    s.helper = s.helper !== false;
    return s;
  }
  function saveSettings(s) {
    writeJson(KEY_SETTINGS, { helper: !!s.helper, bots: s.bots, seats: s.seats });
  }
  function myUid() {
    return Kit() ? Kit().myUid() : typeof getCurrentUid === 'function' ? getCurrentUid() || '' : '';
  }
  function myName() {
    return (Kit() && Kit().myName()) || tr('you', 'You');
  }
  function deviceId() {
    return typeof getOrCreateDeviceId === 'function' ? getOrCreateDeviceId() : '';
  }
  function levelLabel(l) {
    return { beginner: tr('bot.beginner', 'Beginner'), regular: tr('bot.regular', 'Regular'), shark: tr('bot.shark', 'Shark') }[l] || l;
  }

  // ---------------- cards ----------------

  function cardHtml(c, o) {
    const opt = o || {};
    const size = opt.size || 'md';
    if (c == null || c < 0) return `<span class="pkr-card pkr-card--${size} pkr-card--back" aria-label="${esc(tr('card.hidden', 'Hidden card'))}"></span>`;
    const C = Core();
    const rank = C.RANKS[C.rankOf(c)];
    const suit = C.suitOf(c);
    const red = suit === 1 || suit === 2;
    const r = rank === 'T' ? '10' : rank;
    const name = C.RANK_NAMES[C.rankOf(c)] + ' of ' + ['spades', 'hearts', 'diamonds', 'clubs'][suit];
    return `<span class="pkr-card pkr-card--${size}${red ? ' is-red' : ''}${opt.dim ? ' is-dim' : ''}${opt.hi ? ' is-hi' : ''}" role="img" aria-label="${esc(name)}"><b>${r}</b><i>${C.SUIT_SYMBOLS[suit]}</i></span>`;
  }
  function cardsHtml(list, o) {
    return (list || []).map((c) => cardHtml(c, o)).join('');
  }

  // ---------------- rankings + how-to ----------------

  function openRankings() {
    const C = Core();
    Kit().openSheet({
      title: tr('rank.title', 'Hand rankings'),
      bodyHtml: `<div class="pkr-rankings">${C.RANKINGS.map(
        (r, i) => `<div class="pkr-rank-row"><span class="pkr-rank-n">${i + 1}</span><div class="pkr-rank-main">
          <div class="pkr-rank-name">${esc(tr('rank.' + i, r.name))}</div>
          <div class="pkr-rank-cards">${cardsHtml(C.parseCards(r.example), { size: 'xs' })}</div>
          <div class="pkr-rank-desc">${esc(r.desc)}</div></div></div>`
      ).join('')}
      <p class="pkr-note">${esc(tr('rank.note', 'Best five of your seven cards play. Suits never rank. Ties split the pot.'))}</p></div>`,
    });
  }

  function howToHtml() {
    return `<div class="pkr-howto" aria-label="${esc(tr('howto.aria', 'How to play in 20 seconds'))}">
      <div class="pkr-howto-row"><span class="pkr-howto-ico">🂠🂠</span><span>${esc(tr('howto.1', 'You get two cards. Five shared cards come out in three steps.'))}</span></div>
      <div class="pkr-howto-row"><span class="pkr-howto-ico">⇄</span><span>${esc(tr('howto.2', 'Bet, call, raise or fold each round. Last one in — or best hand — wins the pot.'))}</span></div>
      <div class="pkr-howto-row"><span class="pkr-howto-ico">★</span><span>${esc(tr('howto.3', 'Best five of seven cards wins.'))} <button type="button" class="pk-link pkr-inline-link" data-rankings>${esc(tr('howto.rankings', 'See hand rankings'))}</button></span></div>
    </div>`;
  }

  // ---------------- hand history ----------------

  function loadHistory() {
    const h = readJson(KEY_HISTORY, []);
    return Array.isArray(h) ? h : [];
  }
  function saveHistory(rec) {
    const list = loadHistory();
    list.unshift(rec);
    writeJson(KEY_HISTORY, list.slice(0, HISTORY_MAX));
  }

  /** Record built from a public hand (plus your own cards) — never anyone else's unshown cards. */
  function historyRecord(pubHand, meId, hole, mode) {
    const i = pubHand.players.findIndex((p) => p.id === meId);
    const me = pubHand.players[i];
    const res = pubHand.result || {};
    return {
      at: Date.now(),
      mode,
      handNo: pubHand.handNo,
      bb: pubHand.bb,
      board: pubHand.board.slice(),
      hole: (hole || []).slice(),
      me: i,
      button: pubHand.button,
      players: pubHand.players.map((p) => ({ name: p.name, start: p.start, stack: p.stack, cards: p.cards ? p.cards.slice() : null })),
      log: pubHand.log.slice(-80),
      names: Object.assign({}, res.names || {}),
      winnings: Object.assign({}, res.winnings || {}),
      showdown: !!res.showdown,
      net: me ? me.stack - me.start : 0,
    };
  }

  function actionText(rec, e) {
    const name = e.i != null && rec.players[e.i] ? (e.i === rec.me ? tr('you', 'You') : rec.players[e.i].name) : '';
    const amt = e.to || e.amt;
    switch (e.a) {
      case 'sb':
        return name + ' ' + tr('log.sb', 'posts small blind') + ' ' + fmt(e.amt);
      case 'bb':
        return name + ' ' + tr('log.bb', 'posts big blind') + ' ' + fmt(e.amt);
      case 'post':
        return name + ' ' + tr('log.post', 'posts') + ' ' + fmt(e.amt);
      case 'dead':
        return name + ' ' + tr('log.dead', 'posts a dead blind') + ' ' + fmt(e.amt);
      case 'fold':
        return name + ' ' + tr('log.fold', 'folds');
      case 'check':
        return name + ' ' + tr('log.check', 'checks');
      case 'call':
        return name + ' ' + tr('log.call', 'calls') + ' ' + fmt(e.amt);
      case 'bet':
        return name + ' ' + tr('log.bet', 'bets') + ' ' + fmt(amt);
      case 'raise':
        return name + ' ' + tr('log.raise', 'raises to') + ' ' + fmt(amt);
      case 'allin':
        return name + ' ' + tr('log.allin', 'is all-in for') + ' ' + fmt(amt);
      case 'return':
        return fmt(e.amt) + ' ' + tr('log.return', 'returned to') + ' ' + name;
      default:
        return '';
    }
  }

  function modeLabel(m) {
    return { practice: tr('mode.practice', 'Practice'), quick: tr('mode.quick', 'Quick table'), sng: tr('mode.sng', 'Sit & Go'), friends: tr('mode.friends', 'Friends table') }[m] || '';
  }

  function openHistory() {
    const list = loadHistory();
    Kit().openSheet({
      title: tr('hist.title', 'Hand history'),
      bodyHtml: list.length
        ? `<div class="pkr-hist">${list
            .map(
              (r, i) => `<button type="button" class="pkr-hist-row" data-h="${i}">
            <span class="pkr-hist-cards">${cardsHtml(r.hole, { size: 'xs' })}</span>
            <span class="pkr-hist-main"><b>${esc(modeLabel(r.mode))} · #${r.handNo}</b><small>${esc(new Date(r.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }))}</small></span>
            <span class="pkr-hist-net ${r.net > 0 ? 'is-up' : r.net < 0 ? 'is-down' : ''}">${r.net > 0 ? '+' : ''}${fmt(r.net)}</span></button>`
            )
            .join('')}</div>`
        : `<p class="pkr-note">${esc(tr('hist.empty', 'Your last 20 hands show up here.'))}</p>`,
      onMount(el, close) {
        el.querySelectorAll('[data-h]').forEach((b) =>
          b.addEventListener('click', () => {
            close();
            setTimeout(() => openReplay(list[Number(b.dataset.h)]), 80);
          })
        );
      },
    });
  }

  function openReplay(rec) {
    if (!rec) return;
    const steps = [];
    let board = [];
    rec.log.forEach((e) => {
      if (e.board) {
        board = e.board.slice();
        steps.push({ board: board.slice(), text: ({ flop: tr('st.flop', 'Flop'), turn: tr('st.turn', 'Turn'), river: tr('st.river', 'River') }[e.st] || e.st) });
      } else {
        const text = actionText(rec, e);
        if (text) steps.push({ board: board.slice(), text });
      }
    });
    const endLines = [];
    Object.keys(rec.winnings || {}).forEach((i) => {
      const who = Number(i) === rec.me ? tr('you', 'You') : (rec.players[i] || {}).name;
      endLines.push(who + ' ' + tr('log.wins', 'wins') + ' ' + fmt(rec.winnings[i]) + (rec.names[i] ? ' — ' + rec.names[i] : ''));
    });
    steps.push({ board: rec.board.slice(), text: endLines.join(' · ') || tr('log.end', 'Hand over'), end: true });
    let k = 0;
    Kit().openSheet({
      title: tr('replay.title', 'Replay') + ' · #' + rec.handNo,
      bodyHtml: '<div data-replay></div>',
      onMount(el) {
        const host = el.querySelector('[data-replay]');
        const paint = () => {
          const s = steps[k];
          const shown = s.end
            ? rec.players
                .map((p, i) => (p.cards && i !== rec.me ? `<div class="pkr-replay-shown"><span>${esc(p.name)}</span>${cardsHtml(p.cards, { size: 'xs' })}</div>` : ''))
                .join('')
            : '';
          host.innerHTML = `<div class="pkr-replay">
            <div class="pkr-replay-me"><span>${esc(tr('replay.yours', 'Your cards'))}</span>${cardsHtml(rec.hole, { size: 'sm' })}</div>
            <div class="pkr-replay-board">${cardsHtml(s.board, { size: 'sm' })}${'<span class="pkr-card pkr-card--sm pkr-card--slot"></span>'.repeat(5 - s.board.length)}</div>
            <div class="pkr-replay-text" aria-live="polite">${esc(s.text)}</div>${shown}
            <div class="pkr-replay-nav">
              <button type="button" class="pk-btn pk-btn--ghost" data-prev ${k === 0 ? 'disabled' : ''}>‹ ${esc(tr('replay.prev', 'Back'))}</button>
              <span>${k + 1} / ${steps.length}</span>
              <button type="button" class="pk-btn pk-btn--primary" data-next ${k === steps.length - 1 ? 'disabled' : ''}>${esc(tr('replay.next', 'Next'))} ›</button>
            </div></div>`;
          host.querySelector('[data-prev]').addEventListener('click', () => {
            k = Math.max(0, k - 1);
            paint();
          });
          host.querySelector('[data-next]').addEventListener('click', () => {
            k = Math.min(steps.length - 1, k + 1);
            paint();
          });
        };
        paint();
      },
    });
  }

  function shareWin(net, handName) {
    const line = Core().shareText({ amount: net, handName });
    if (Kit() && typeof Kit().shareLine === 'function') Kit().shareLine(GAME, LABEL, line.replace(/ — Texas Hold'em on Chaupaal$/, ''));
  }

  // ---------------- table view (shared by Practice + Live) ----------------

  /** Seat positions around a portrait oval, you at the bottom centre. */
  function seatPos(k, n) {
    const a = Math.PI / 2 + (k * 2 * Math.PI) / n;
    return { x: 50 + 41 * Math.cos(a), y: 49 + 41 * Math.sin(a) };
  }

  /**
   * @param {object} shell PartyKit shell
   * @param {{ onAction: Function, onMenu?: Function, serverNow?: () => number }} o
   */
  function createTableView(shell, o) {
    const root = shell.render(`<div class="pkr-wrap">
      <div class="pkr-top"><div class="pkr-status" data-status aria-live="polite"></div>
        <button type="button" class="pkr-icon-btn" data-rankings aria-label="${esc(tr('rank.title', 'Hand rankings'))}">★</button>
        <button type="button" class="pkr-icon-btn" data-menu aria-label="${esc(tr('menu', 'Table menu'))}">⋯</button></div>
      <div class="pkr-felt-wrap"><div class="pkr-felt" data-felt>
        <div class="pkr-center"><div class="pkr-pot" data-pot></div><div class="pkr-board" data-board></div><div class="pkr-result" data-result aria-live="polite"></div></div>
        <div data-seats></div></div></div>
      <div class="pkr-hand" data-hand></div>
      <div class="pkr-actions" data-actions></div>
    </div>`);
    let vm = null;
    let raiseOpen = false;
    let raiseTo = 0;
    let pending = false;
    let lastTurnKey = '';
    const now = () => (o.serverNow ? o.serverNow() : Date.now());
    root.querySelector('[data-rankings]').addEventListener('click', openRankings);
    root.querySelector('[data-menu]').addEventListener('click', () => o.onMenu && o.onMenu());
    if (!o.onMenu) root.querySelector('[data-menu]').hidden = true;

    function seatHtml(s, k, n) {
      const p = seatPos(k, n);
      const bx = p.x + (50 - p.x) * 0.42;
      const by = p.y + (48 - p.y) * 0.42;
      const cls = ['pkr-seat'];
      if (s.me) cls.push('is-me');
      if (s.turn) cls.push('is-turn');
      if (s.folded) cls.push('is-folded');
      if (s.out) cls.push('is-out');
      if (s.win) cls.push('is-win');
      const cards = s.cards
        ? cardsHtml(s.cards, { size: 'xs' })
        : s.dealt && !s.folded && !s.me
          ? cardHtml(null, { size: 'xs' }) + cardHtml(null, { size: 'xs' })
          : '';
      const tag = s.win ? '+' + fmt(s.win) : s.out ? s.outLabel || tr('seat.out', 'Sitting out') : s.allIn ? tr('seat.allin', 'All-in') : s.last || '';
      return `<div class="${cls.join(' ')}" style="left:${p.x.toFixed(1)}%;top:${p.y.toFixed(1)}%">
          ${cards ? `<div class="pkr-seat-cards">${cards}</div>` : ''}
          <div class="pkr-seat-plate">${s.button ? '<span class="pkr-dealer" aria-label="Dealer">D</span>' : ''}
            <div class="pkr-seat-name">${esc(s.me ? tr('you', 'You') : s.name)}</div>
            <div class="pkr-seat-stack">${fmt(s.stack)}</div>
            ${s.turn ? '<div class="pkr-clock"><span data-clock></span></div>' : ''}</div>
          ${tag ? `<div class="pkr-seat-tag">${esc(tag)}</div>` : ''}
          ${s.handName ? `<div class="pkr-seat-hand">${esc(s.handName)}</div>` : ''}
        </div>${s.bet > 0 ? `<div class="pkr-bet" style="left:${bx.toFixed(1)}%;top:${by.toFixed(1)}%">${fmt(s.bet)}</div>` : ''}`;
    }

    function paintClock() {
      const el = root.querySelector('[data-clock]');
      if (!el || !vm || !vm.clock) return;
      const total = vm.clock.total || ACTION_MS;
      const left = Math.max(0, vm.clock.deadline - now());
      el.style.width = clamp((left / total) * 100, 0, 100).toFixed(1) + '%';
      el.parentElement.classList.toggle('is-low', left < 5000);
      el.parentElement.classList.toggle('is-bank', !!vm.clock.bank);
    }
    const clockTimer = setInterval(paintClock, 250);

    function presetTo(L, frac) {
      return clamp(Math.round((vm.currentBet || 0) + frac * (L.pot + L.call)), L.minTo, L.maxTo);
    }

    function actionsHtml() {
      if (vm.actionsHtml) return vm.actionsHtml;
      const L = vm.legal;
      if (!L) return vm.waitText ? `<div class="pkr-wait">${esc(vm.waitText)}</div>` : '';
      if (raiseOpen && L.canRaise) {
        const step = Math.max(1, vm.bb || 1);
        const isAll = raiseTo >= L.maxTo;
        const label = isAll ? tr('act.allin', 'All-in') + ' ' + fmt(L.maxTo) : (L.isBet ? tr('act.bet', 'Bet') : tr('act.raiseTo', 'Raise to')) + ' ' + fmt(raiseTo);
        return `<div class="pkr-raise">
          <div class="pkr-raise-presets">
            <button type="button" class="pkr-chip-btn" data-preset="0.5">½ ${esc(tr('act.pot', 'pot'))}</button>
            <button type="button" class="pkr-chip-btn" data-preset="1">${esc(tr('act.potFull', 'Pot'))}</button>
            <button type="button" class="pkr-chip-btn" data-preset="all">${esc(tr('act.allin', 'All-in'))}</button>
          </div>
          <input type="range" class="pkr-slider" data-slider min="${L.minTo}" max="${L.maxTo}" step="${step}" value="${raiseTo}" aria-label="${esc(tr('act.amount', 'Amount'))}">
          <div class="pkr-raise-row">
            <button type="button" class="pkr-act pkr-act--ghost" data-raise-cancel>${esc(tr('act.cancel', 'Cancel'))}</button>
            <button type="button" class="pkr-act pkr-act--primary" data-raise-go>${esc(label)}</button>
          </div></div>`;
      }
      const callLabel = L.canCheck ? tr('act.check', 'Check') : L.allInIsCall ? tr('act.allin', 'All-in') + ' ' + fmt(L.call) : tr('act.call', 'Call') + ' ' + fmt(L.call);
      return `<div class="pkr-bar">
        ${L.canCall ? `<button type="button" class="pkr-act pkr-act--fold" data-act="fold">${esc(tr('act.fold', 'Fold'))}</button>` : ''}
        <button type="button" class="pkr-act" data-act="${L.canCheck ? 'check' : 'call'}">${esc(callLabel)}</button>
        ${L.canRaise ? `<button type="button" class="pkr-act pkr-act--primary" data-act="raise">${esc(L.isBet ? tr('act.betDots', 'Bet…') : tr('act.raiseDots', 'Raise…'))}</button>` : ''}
      </div>`;
    }

    function wireActions() {
      const box = root.querySelector('[data-actions]');
      if (vm.wireActions) vm.wireActions(box);
      const L = vm.legal;
      if (!L) return;
      const send = (a) => {
        if (pending) return;
        pending = true;
        raiseOpen = false;
        box.querySelectorAll('button,input').forEach((b) => (b.disabled = true));
        Promise.resolve(o.onAction(a)).finally(() => {
          pending = false;
        });
      };
      box.querySelectorAll('[data-act]').forEach((b) =>
        b.addEventListener('click', () => {
          const a = b.dataset.act;
          if (a === 'raise') {
            raiseOpen = true;
            raiseTo = clamp(L.isBet ? presetTo(L, 0.5) : L.minTo, L.minTo, L.maxTo);
            paintActions();
            return;
          }
          send({ type: a });
        })
      );
      const slider = box.querySelector('[data-slider]');
      if (slider) {
        const go = box.querySelector('[data-raise-go]');
        const relabel = () => {
          const isAll = raiseTo >= L.maxTo;
          go.textContent = isAll ? tr('act.allin', 'All-in') + ' ' + fmt(L.maxTo) : (L.isBet ? tr('act.bet', 'Bet') : tr('act.raiseTo', 'Raise to')) + ' ' + fmt(raiseTo);
        };
        slider.addEventListener('input', () => {
          let v = Number(slider.value);
          if (v > L.maxTo - (vm.bb || 1) / 2) v = L.maxTo;
          raiseTo = clamp(v, L.minTo, L.maxTo);
          relabel();
        });
        box.querySelectorAll('[data-preset]').forEach((b) =>
          b.addEventListener('click', () => {
            raiseTo = b.dataset.preset === 'all' ? L.maxTo : presetTo(L, Number(b.dataset.preset));
            slider.value = String(raiseTo);
            relabel();
          })
        );
        box.querySelector('[data-raise-cancel]').addEventListener('click', () => {
          raiseOpen = false;
          paintActions();
        });
        go.addEventListener('click', () => send(raiseTo >= L.maxTo ? { type: 'allin' } : { type: 'raise', to: raiseTo }));
      }
    }

    function paintActions() {
      root.querySelector('[data-actions]').innerHTML = actionsHtml();
      wireActions();
    }

    function update(next) {
      if (shell.closed) return;
      vm = next;
      const turnKey = vm.legal ? vm.handNo + ':' + vm.street + ':' + vm.currentBet : '';
      if (turnKey !== lastTurnKey) {
        raiseOpen = false;
        if (turnKey && Kit() && typeof Kit().ding === 'function' && vm.mode === 'live') Kit().ding();
        lastTurnKey = turnKey;
      }
      root.querySelector('[data-status]').textContent = vm.status || '';
      const bySeat = vm.ring && vm.seats.every((s) => Number.isFinite(s.seatNo));
      const n = bySeat ? Math.max(vm.ring, vm.seats.length) : vm.seats.length;
      const meIdx = vm.seats.findIndex((s) => s.me);
      const anchor = bySeat ? (meIdx >= 0 ? vm.seats[meIdx].seatNo : 0) : Math.max(0, meIdx);
      root.querySelector('[data-seats]').innerHTML = vm.seats
        .map((s, k) => seatHtml(s, bySeat ? (((s.seatNo - anchor) % n) + n) % n : (k - anchor + n) % n, n))
        .join('');
      root.querySelector('[data-pot]').textContent = vm.pot > 0 ? tr('pot', 'Pot') + ' ' + fmt(vm.pot) : '';
      const board = vm.board || [];
      root.querySelector('[data-board]').innerHTML = board.length
        ? cardsHtml(board, { size: 'md' }) + '<span class="pkr-card pkr-card--md pkr-card--slot"></span>'.repeat(5 - board.length)
        : '';
      root.querySelector('[data-result]').innerHTML = vm.resultHtml || '';
      const hand = root.querySelector('[data-hand]');
      if (vm.hole && vm.hole.length) {
        const cur = vm.helper && board.length >= 3 ? Core().currentHand(vm.hole, board) : null;
        const pre = vm.helper && board.length < 3 && vm.hole[0] >> 2 === vm.hole[1] >> 2 ? tr('help.pair', 'Pocket pair') : '';
        hand.innerHTML = `<div class="pkr-hole${vm.meFolded ? ' is-folded' : ''}">${cardsHtml(vm.hole, { size: 'lg' })}</div>
          ${vm.helper ? `<div class="pkr-helper">${esc(cur ? cur.name : pre || tr('help.pre', 'Best five of seven wins'))}</div>` : ''}`;
      } else hand.innerHTML = vm.handHtml || '';
      if (vm.wireResult) vm.wireResult(root.querySelector('[data-result]'));
      if (!pending) paintActions();
      paintClock();
    }

    return {
      root,
      update,
      clearPending() {
        pending = false;
      },
      destroy() {
        clearInterval(clockTimer);
      },
    };
  }

  function resultLine(pubHand, meId) {
    const res = pubHand.result;
    if (!res) return '';
    const bits = [];
    Object.keys(res.winnings).forEach((i) => {
      const p = pubHand.players[i];
      const who = p.id === meId ? tr('you', 'You') : p.name;
      bits.push(`${esc(who)} ${esc(tr('log.wins', 'wins'))} ${fmt(res.winnings[i])}${res.names[i] ? ' · ' + esc(res.names[i]) : ''}`);
    });
    return bits.join('<br>');
  }

  /** Public-hand seats → view seats. */
  function seatsFromHand(pubHand, meId, extra) {
    const res = pubHand.result;
    return pubHand.players.map((p, i) => {
      const x = (extra && extra[p.id]) || {};
      return Object.assign(
        {
          id: p.id,
          name: p.name,
          stack: p.stack,
          bet: pubHand.done ? 0 : p.bet,
          folded: p.folded,
          allIn: p.allIn && !pubHand.done,
          cards: p.id === meId ? null : p.cards,
          dealt: true,
          me: p.id === meId,
          turn: !pubHand.done && pubHand.toAct === i,
          button: pubHand.button === i,
          last: p.last ? Core().actionLabel(p.last) : '',
          win: res && res.winnings[i] ? res.winnings[i] : 0,
          handName: res && res.names && res.names[i] && p.id !== meId ? res.names[i] : '',
        },
        x
      );
    });
  }

  // ---------------- Practice vs bots ----------------

  function startPractice(cfg) {
    const K = Kit();
    const C = Core();
    const s = settings();
    const n = clamp(Number((cfg && cfg.seats) || s.seats), 2, 6);
    const level = (cfg && cfg.level) || s.bots;
    const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
    const players = [{ id: 'me', name: myName(), seat: 0, stack: PRACTICE_STACK, level: null }];
    for (let i = 1; i < n; i++) players.push({ id: 'bot' + i, name: '🤖 ' + names[i - 1] + ' · ' + levelLabel(level), seat: i, stack: PRACTICE_STACK, level });
    let button = Math.floor(Math.random() * n) - 1;
    let handNo = 0;
    let h = null;
    let timer = null;
    let over = false;
    const shell = K.openShell({
      gameId: GAME,
      title: LABEL,
      subtitle: tr('sub.practice', 'Practice · vs bots') + ' · ' + fmt(PRACTICE_BLINDS[0]) + '/' + fmt(PRACTICE_BLINDS[1]),
      confirmLeave: () => true,
      leaveBody: tr('leave.practice', 'Practice chips don’t carry over.'),
      onClose: () => {
        over = true;
        clearTimeout(timer);
        view.destroy();
      },
    });
    const view = createTableView(shell, {
      onAction: (a) => {
        if (!h || h.done) return;
        const r = C.applyAction(h, 'me', a);
        if (r.error) toast(tr('err.' + r.error, 'That move isn’t allowed right now'));
        step();
      },
      onMenu: () => openPracticeMenu(),
    });

    function openPracticeMenu() {
      const st = settings();
      K.openSheet({
        title: tr('menu.title', 'Table'),
        bodyHtml: `<div class="pk-field"><div class="pk-field-label">${esc(tr('set.helper', 'Beginner helper'))}</div>
            ${K.segHtml('helper', st.helper ? 1 : 0, [[1, tr('on', 'On')], [0, tr('off', 'Off')]])}</div>
          <button type="button" class="pk-btn pk-btn--ghost pk-btn--block" data-hist>${esc(tr('hist.title', 'Hand history'))}</button>
          <button type="button" class="pk-btn pk-btn--ghost pk-btn--block" data-leave>${esc(tr('menu.leavePractice', 'Leave practice'))}</button>`,
        onMount(el, close) {
          const state = { helper: st.helper ? 1 : 0 };
          K.wireSegs(el, state, () => {
            st.helper = !!state.helper;
            saveSettings(st);
            render();
          });
          el.querySelector('[data-hist]').addEventListener('click', () => {
            close();
            setTimeout(openHistory, 80);
          });
          el.querySelector('[data-leave]').addEventListener('click', () => {
            close();
            setTimeout(() => shell.close(), 60);
          });
        },
      });
    }

    function nextHand() {
      if (over) return;
      players.forEach((p) => {
        if (p.id !== 'me' && p.stack === 0) p.stack = PRACTICE_STACK;
      });
      const me = players[0];
      if (me.stack === 0) return showBust();
      button = (button + 1) % n;
      handNo += 1;
      h = C.createHand({
        players: players.map((p) => ({ id: p.id, name: p.name, seat: p.seat, stack: p.stack })),
        button,
        sb: PRACTICE_BLINDS[0],
        bb: PRACTICE_BLINDS[1],
        deck: C.shuffle(C.newDeck(), C.intFrom(Math.random)),
        handNo,
      });
      step();
    }

    function step() {
      if (over || !h) return;
      render();
      if (h.done) return finishHand();
      const i = h.toAct;
      const pl = h.players[i];
      if (pl.id === 'me') return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (over || h.done || h.toAct !== i) return;
        const a = C.botAction(h, i, players[i].level || 'regular', Math.random) || C.timeoutAction(h, i);
        if (C.applyAction(h, pl.id, a).error) C.applyAction(h, pl.id, C.timeoutAction(h, i));
        step();
      }, 550 + Math.random() * 700);
    }

    function render() {
      if (!h) return;
      const pub = C.publicHand(h);
      const meI = pub.players.findIndex((p) => p.id === 'me');
      const L = !h.done && h.toAct === meI ? C.legalActions(h, meI) : null;
      const st = settings();
      const turnName = !h.done ? pub.players[h.toAct].name : '';
      view.update({
        mode: 'practice',
        handNo: h.handNo,
        street: h.street,
        currentBet: h.currentBet,
        bb: h.bb,
        seats: seatsFromHand(pub, 'me'),
        board: pub.board,
        pot: pub.done ? 0 : pub.pot,
        hole: h.players[meI].hole,
        meFolded: h.players[meI].folded,
        helper: st.helper,
        legal: L,
        waitText: h.done ? '' : h.players[meI].folded ? tr('wait.folded', 'You folded — watching the hand') : turnName + ' ' + tr('wait.thinking', 'is thinking…'),
        status: tr('hand', 'Hand') + ' #' + h.handNo + (h.street !== 'done' ? ' · ' + ({ preflop: tr('st.preflop', 'Pre-flop'), flop: tr('st.flop', 'Flop'), turn: tr('st.turn', 'Turn'), river: tr('st.river', 'River') }[h.street] || '') : ''),
        resultHtml: h.done ? resultLine(pub, 'me') : '',
      });
    }

    function finishHand() {
      h.players.forEach((p) => (players.find((q) => q.id === p.id).stack = p.stack));
      const pub = C.publicHand(h);
      const rec = historyRecord(pub, 'me', h.players.find((p) => p.id === 'me').hole, 'practice');
      saveHistory(rec);
      const meI = pub.players.findIndex((p) => p.id === 'me');
      const bigWin = rec.net >= BIG_WIN_BB * h.bb;
      view.update(
        Object.assign({}, lastVm(pub), {
          actionsHtml: `<div class="pkr-bar">${bigWin ? `<button type="button" class="pkr-act" data-share>${esc(tr('share', 'Share'))}</button>` : ''}
            <button type="button" class="pkr-act pkr-act--primary" data-next>${esc(tr('next', 'Next hand'))}</button></div>`,
          wireActions(box) {
            box.querySelector('[data-next]')?.addEventListener('click', () => {
              clearTimeout(timer);
              nextHand();
            });
            box.querySelector('[data-share]')?.addEventListener('click', () => shareWin(rec.net, pub.result.names[meI] || ''));
          },
        })
      );
      clearTimeout(timer);
      timer = setTimeout(nextHand, bigWin ? 9000 : pub.result.showdown ? 5000 : 2800);
    }

    function lastVm(pub) {
      return {
        mode: 'practice',
        handNo: h.handNo,
        street: 'done',
        bb: h.bb,
        seats: seatsFromHand(pub, 'me'),
        board: pub.board,
        pot: 0,
        hole: h.players.find((p) => p.id === 'me').hole,
        meFolded: h.players.find((p) => p.id === 'me').folded,
        helper: settings().helper,
        legal: null,
        status: tr('hand', 'Hand') + ' #' + h.handNo,
        resultHtml: resultLine(pub, 'me'),
      };
    }

    function showBust() {
      const pub = h ? C.publicHand(h) : null;
      view.update(
        Object.assign({}, pub ? lastVm(pub) : { seats: [], board: [], pot: 0 }, {
          resultHtml: esc(tr('bust', 'Out of chips')),
          actionsHtml: `<div class="pkr-bar"><button type="button" class="pkr-act" data-leave>${esc(tr('leave', 'Leave'))}</button>
            <button type="button" class="pkr-act pkr-act--primary" data-rebuy>${esc(tr('rebuyPractice', 'Rebuy') + ' ' + fmt(PRACTICE_STACK))}</button></div>`,
          wireActions(box) {
            box.querySelector('[data-rebuy]').addEventListener('click', () => {
              players[0].stack = PRACTICE_STACK;
              nextHand();
            });
            box.querySelector('[data-leave]').addEventListener('click', () => shell.close());
          },
        })
      );
    }

    nextHand();
  }

  // ---------------- Live tables ----------------

  async function liveCall(op, args) {
    if (typeof apiFetch !== 'function') throw Object.assign(new Error('Offline'), { code: 'OFFLINE' });
    const res = await apiFetch('/api/media-config', {
      method: 'POST',
      needAuth: true,
      body: Object.assign({ action: 'poker_table', op }, args || {}),
    });
    if (!res || !res.ok) {
      const e = new Error((res && res.error && res.error.message) || 'Something went wrong');
      e.code = (res && res.error && res.error.code) || 'ERROR';
      throw e;
    }
    const data = res.data || {};
    if (Array.isArray(data.awards) && data.awards.length && typeof showAchievementToasts === 'function') {
      showAchievementToasts(data.awards.map((key) => ({ key })));
    }
    return data;
  }

  function liveErrorText(e) {
    const code = String((e && e.code) || '').toUpperCase();
    const map = {
      RATE_LIMITED: tr('err.rate', 'Slow down a little — try again in a moment'),
      TABLE_NOT_FOUND: tr('err.gone', 'That table has closed'),
      TABLE_CLOSED: tr('err.gone', 'That table has closed'),
      TABLE_FULL: tr('err.full', 'That table is full'),
      INSUFFICIENT_CHIPS: tr('err.chips', 'Not enough chips for this table'),
      AGE_GATE: tr('err.age', 'Texas Hold’em is for players 18 and over'),
      AGE_CONFIRM: tr('err.ageConfirm', 'Confirm you’re 18 or older to play'),
      NOT_SEATED: tr('err.notSeated', 'You’re not at this table'),
      BUSY: tr('err.busy', 'The table is busy — try again'),
      OVER_MAX: tr('err.overMax', 'That’s over the table maximum'),
      NEED_PLAYERS: tr('err.needPlayers', 'Need at least 2 players'),
    };
    if (map[code]) return map[code];
    if (e && e.message && e.code && !/^[A-Z_]+$/.test(e.message) && e.message.length < 80) return e.message;
    return typeof navigator !== 'undefined' && navigator.onLine === false
      ? tr('err.offline', 'You’re offline — reconnect to keep playing')
      : tr('err.generic', 'Couldn’t reach the table — try again');
  }

  function signedInOrPrompt() {
    const K = Kit();
    if (K.isSignedIn()) return true;
    if (typeof K.requireSignIn === 'function') K.requireSignIn();
    else toast(tr('signIn', 'Sign in to play at live tables'));
    return false;
  }

  async function ensureAdult() {
    if (typeof ageGateStatus !== 'function' || ageGateStatus() === 'ok') return true;
    return typeof openAgeGateSheet === 'function' ? openAgeGateSheet(GAME) : false;
  }

  function seatListOf(pub) {
    return Object.keys(pub.seats || {})
      .map((k) => Object.assign({ key: k, seat: Number(k.slice(1)) }, pub.seats[k]))
      .sort((a, b) => a.seat - b.seat);
  }

  /**
   * Live table screen.
   * @param {string} tableId
   * @param {{ chat?: object, invite?: boolean }} [opts]
   */
  function openLive(tableId, opts) {
    const K = Kit();
    const C = Core();
    const me = myUid();
    const o = opts || {};
    const ref = typeof rtdb !== 'undefined' && rtdb ? rtdb.ref('games/poker/' + tableId) : null;
    if (!ref) return toast(tr('err.generic', 'Couldn’t reach the table — try again'));
    const TS = window.firebase && firebase.database && firebase.database.ServerValue ? firebase.database.ServerValue.TIMESTAMP : Date.now();
    let pub = null;
    let hand = null;
    let secret = null;
    let offset = 0;
    let stopped = false;
    let lastTick = 0;
    let lastNoteAt = 0;
    let savedHand = 0;
    let sngShown = false;
    const subs = [];
    const timers = [];
    const serverNow = () => Date.now() + offset;

    const shell = K.openShell({
      gameId: GAME,
      title: LABEL,
      subtitle: tr('sub.live', 'Live'),
      onClose: () => stop(),
    });
    const back = shell.el.querySelector('#pkBack_' + GAME);
    if (back) {
      const nb = back.cloneNode(true);
      back.replaceWith(nb);
      nb.addEventListener('click', onBack);
    }
    const view = createTableView(shell, { onAction: act, onMenu: openMenu, serverNow });

    function mySeat() {
      return pub ? seatListOf(pub).find((s) => s.uid === me) || null : null;
    }

    async function onBack() {
      const seat = mySeat();
      if (!pub || !seat || pub.status === 'closed' || pub.status === 'finished') return shell.close();
      const body =
        pub.kind === 'quick'
          ? tr('leave.quick', 'Your stack goes back to your wallet') + (inHand() ? ' ' + tr('leave.afterHand', 'when this hand ends.') : '.')
          : pub.kind === 'sng'
            ? pub.status === 'waiting'
              ? tr('leave.sngWait', 'You’ll be unregistered and get your buy-in back.')
              : tr('leave.sngPlay', 'You stay in the Sit & Go — your hands fold until you come back.')
            : tr('leave.friends', 'You’ll give up your seat. Table chips stay at the table.');
      const go = typeof confirmLeaveGame === 'function' ? await confirmLeaveGame({ title: tr('leave.title', 'Leave the table?'), body }) : true;
      if (!go) return;
      liveCall('leave', { tableId }).catch(() => {});
      shell.close();
    }

    function inHand() {
      return !!(hand && !hand.done && hand.players.some((p) => p.id === me && !p.folded));
    }

    function stop() {
      if (stopped) return;
      stopped = true;
      subs.forEach((f) => {
        try {
          f();
        } catch (e) {}
      });
      timers.forEach((x) => clearInterval(x));
      view.destroy();
      try {
        ref.child('presence/' + me).set({ at: TS, online: false });
      } catch (e) {}
    }

    async function act(a) {
      if (!hand) return;
      try {
        const r = await liveCall('act', { tableId, handNo: hand.handNo, type: a.type, to: a.to });
        if (r && r.serverNow) offset = Number(r.serverNow) - Date.now();
      } catch (e) {
        const code = String(e.code).toUpperCase();
        if (code !== 'STALE_HAND' && code !== 'NOT_YOUR_TURN') toast(liveErrorText(e));
        view.clearPending();
        render();
      }
    }

    function simple(op, extra, okMsg) {
      return liveCall(op, Object.assign({ tableId }, extra || {}))
        .then((r) => {
          if (okMsg) toast(okMsg);
          return r;
        })
        .catch((e) => {
          toast(liveErrorText(e));
          return null;
        });
    }

    function openMenu() {
      const seat = mySeat();
      if (!pub) return;
      const host = pub.kind === 'friends' && pub.host === me;
      const rows = [];
      if (pub.kind === 'friends') rows.push(['invite', tr('menu.invite', 'Invite friends')]);
      if (seat && pub.kind === 'quick' && pub.settings && seat.stack + (seat.pendingTopup || 0) < pub.settings.max) rows.push(['topup', tr('menu.topup', 'Add chips')]);
      if (seat && pub.kind === 'friends' && seat.stack === 0) rows.push(['rebuy', tr('menu.rebuy', 'Rebuy') + ' ' + fmt(pub.settings.stack)]);
      if (seat && pub.kind !== 'sng') rows.push(seat.sittingOut || seat.sitOutNext ? ['sitin', tr('menu.sitIn', 'Sit back in')] : ['sitout', tr('menu.sitOut', 'Sit out next hand')]);
      if (host && pub.status !== 'closed') rows.push(['settings', tr('menu.settings', 'Table settings')]);
      rows.push(['helper', tr('set.helper', 'Beginner helper') + ': ' + (settings().helper ? tr('on', 'On') : tr('off', 'Off'))]);
      rows.push(['history', tr('hist.title', 'Hand history')]);
      if (host && pub.status !== 'closed') rows.push(['end', tr('menu.end', 'Close the table')]);
      rows.push(['leave', tr('menu.leave', 'Leave table')]);
      K.openSheet({
        title: pub.kind === 'friends' ? tr('menu.friendsTitle', 'Friends table') + ' · ' + pub.code : modeLabel(pub.kind),
        bodyHtml: `<div class="pkr-menu">${rows.map(([k, l]) => `<button type="button" class="pkr-menu-row${k === 'leave' || k === 'end' ? ' is-danger' : ''}" data-m="${k}">${esc(l)}</button>`).join('')}</div>`,
        onMount(el, close) {
          el.querySelectorAll('[data-m]').forEach((b) =>
            b.addEventListener('click', () => {
              const m = b.dataset.m;
              close();
              setTimeout(() => menuAction(m), 80);
            })
          );
        },
      });
    }

    async function menuAction(m) {
      if (m === 'invite') return inviteFriendsTo(pub.code, o.chat);
      if (m === 'topup') return openTopUp();
      if (m === 'rebuy') return simple('rebuy');
      if (m === 'sitout') return simple('sit_out', {}, tr('toast.sitOut', 'You’ll sit out from the next hand'));
      if (m === 'sitin') return simple('sit_in');
      if (m === 'settings') return openHostSettings();
      if (m === 'helper') {
        const s = settings();
        s.helper = !s.helper;
        saveSettings(s);
        return render();
      }
      if (m === 'history') return openHistory();
      if (m === 'end') {
        const go = typeof confirmLeaveGame === 'function' ? await confirmLeaveGame({ title: tr('end.title', 'Close the table?'), body: tr('end.body', 'The hand in play is cancelled and everyone leaves.') }) : true;
        if (go) simple('end');
        return;
      }
      if (m === 'leave') return onBack();
    }

    function openTopUp() {
      const seat = mySeat();
      if (!seat) return;
      const room = pub.settings.max - seat.stack - (seat.pendingTopup || 0);
      const bb = pub.settings.bb;
      const min = Math.min(room, bb * 10);
      let amount = room;
      K.openSheet({
        title: tr('topup.title', 'Add chips'),
        bodyHtml: `<div class="pkr-buyin"><div class="pkr-buyin-amt" data-amt>${fmt(amount)}</div>
          <input type="range" class="pkr-slider" data-slider min="${min}" max="${room}" step="${bb}" value="${room}" aria-label="${esc(tr('act.amount', 'Amount'))}">
          <div class="pkr-note" data-bal>${esc(tr('topup.note', 'From your wallet · added before your next hand'))}</div>
          <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-go>${esc(tr('topup.go', 'Add chips'))}</button></div>`,
        onMount(el, close) {
          const sl = el.querySelector('[data-slider]');
          sl.addEventListener('input', () => {
            amount = Number(sl.value) > room - bb / 2 ? room : Number(sl.value);
            el.querySelector('[data-amt]').textContent = fmt(amount);
          });
          el.querySelector('[data-go]').addEventListener('click', async () => {
            close();
            await simple('topup', { amount }, tr('toast.topup', 'Chips added'));
          });
        },
      });
    }

    function openHostSettings() {
      const cur = Object.assign({}, pub.settings);
      const st = { bb: cur.bb, stack: cur.stack, blindMinutes: cur.blindMinutes, seats: cur.seats };
      K.openSheet({
        title: tr('menu.settings', 'Table settings'),
        bodyHtml: friendsSettingsHtml(st, Object.keys(pub.seats || {}).length) + `<button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-save>${esc(tr('save', 'Save'))}</button>
          <p class="pkr-note">${esc(tr('settings.between', 'Changes apply from the next hand. Stack size applies to new seats and rebuys.'))}</p>`,
        onMount(el, close) {
          K.wireSegs(el, st, () => {});
          el.querySelector('[data-save]').addEventListener('click', () => {
            close();
            simple('settings', { settings: st }, tr('toast.saved', 'Table settings saved'));
          });
        },
      });
    }

    function vmBase() {
      const seats = pub ? seatListOf(pub) : [];
      const extra = {};
      seats.forEach((s) => {
        extra[s.uid] = {
          out: !!(s.sittingOut || s.away),
          outLabel: s.away ? tr('seat.away', 'Away') : s.leaving ? tr('seat.leaving', 'Leaving') : tr('seat.out', 'Sitting out'),
        };
      });
      return { seats, extra };
    }

    function statusLine() {
      if (!pub) return '';
      const bl = pub.blinds || pub.settings;
      const bits = [modeLabel(pub.kind), fmt(bl.sb) + '/' + fmt(bl.bb)];
      if (pub.kind === 'sng' && pub.status === 'playing') bits.push(tr('sng.level', 'Level') + ' ' + (((pub.blinds && pub.blinds.level) || 0) + 1));
      if (pub.kind === 'friends') bits.push(pub.code);
      return bits.join(' · ');
    }

    function waitingHtml() {
      const n = Object.keys(pub.seats || {}).length;
      const cap = pub.settings.seats;
      if (pub.kind === 'sng') {
        return {
          html: `<div class="pkr-wait-card"><div class="pkr-wait-title">${esc(tr('sng.waiting', 'Waiting for players'))} · ${n}/${cap}</div>
            <div class="pkr-note">${esc(tr('sng.starts', 'Starts as soon as the table is full. Top') + ' ' + pub.sng.payouts.length + ' ' + tr('sng.paid', 'paid:') + ' ' + pub.sng.payouts.map(fmt).join(' / '))}</div>
            <button type="button" class="pkr-act pkr-act--ghost" data-unreg>${esc(tr('sng.unregister', 'Unregister'))}</button></div>`,
          wire(box) {
            box.querySelector('[data-unreg]')?.addEventListener('click', async () => {
              const r = await simple('leave');
              if (r) shell.close();
            });
          },
        };
      }
      if (pub.kind === 'friends') {
        const host = pub.host === me;
        return {
          html: `<div class="pkr-wait-card"><div class="pkr-wait-title">${esc(tr('friends.code', 'Table code'))} <b class="pkr-code">${esc(pub.code)}</b> · ${n}/${cap}</div>
            <div class="pkr-bar"><button type="button" class="pkr-act" data-invite>${esc(tr('menu.invite', 'Invite friends'))}</button>
            ${host ? `<button type="button" class="pkr-act pkr-act--primary" data-start ${n < 2 ? 'disabled' : ''}>${esc(tr('friends.start', 'Start game'))}</button>` : ''}</div>
            ${host ? '' : `<div class="pkr-note">${esc(tr('friends.waitHost', 'Waiting for the host to start'))}</div>`}</div>`,
          wire(box) {
            box.querySelector('[data-invite]')?.addEventListener('click', () => inviteFriendsTo(pub.code, o.chat));
            box.querySelector('[data-start]')?.addEventListener('click', () => simple('start'));
          },
        };
      }
      return { html: `<div class="pkr-wait-card"><div class="pkr-wait-title">${esc(tr('quick.waiting', 'Waiting for another player'))} · ${n}/${cap}</div><div class="pkr-note">${esc(tr('quick.waitNote', 'The next hand deals as soon as someone sits down.'))}</div></div>`, wire() {} };
    }

    function render() {
      if (stopped || !pub) return;
      const { seats, extra } = vmBase();
      const seat = seats.find((s) => s.uid === me);
      const st = settings();
      const sub = shell.el.querySelector('.game-chrome-subtitle');
      if (sub) sub.textContent = modeLabel(pub.kind);

      if (pub.status === 'closed') {
        view.update({
          mode: 'live',
          seats: [],
          board: [],
          pot: 0,
          status: statusLine(),
          resultHtml: esc(tr('closed', 'This table has closed')),
          actionsHtml: `<div class="pkr-bar"><button type="button" class="pkr-act pkr-act--primary" data-home>${esc(tr('backHome', 'Back to lobby'))}</button></div>`,
          wireActions(box) {
            box.querySelector('[data-home]').addEventListener('click', () => K.closeThen(shell, openHome));
          },
        });
        return;
      }

      if (pub.kind === 'sng' && pub.status === 'finished') return renderSngDone();

      const dealtHand = hand && hand.players.some((p) => seats.some((s) => s.uid === p.id)) ? hand : null;
      let vSeats;
      if (dealtHand) {
        const fromHand = seatsFromHand(dealtHand, me, extra);
        const inHandIds = dealtHand.players.map((p) => p.id);
        const idle = seats
          .filter((s) => inHandIds.indexOf(s.uid) < 0)
          .map((s) => Object.assign({ id: s.uid, name: s.name, stack: s.stack, bet: 0, me: s.uid === me, out: true, outLabel: s.stack === 0 ? tr('seat.bust', 'Out of chips') : extra[s.uid].out ? extra[s.uid].outLabel : tr('seat.next', 'Next hand'), seatNo: s.seat }));
        const withSeat = fromHand.map((v, i) => Object.assign(v, { seatNo: dealtHand.players[i].seat }));
        vSeats = withSeat.concat(idle).sort((a, b) => a.seatNo - b.seatNo);
        if (pub.turn && !dealtHand.done) {
          const tv = vSeats.find((v) => v.id === pub.turn.uid);
          if (tv) tv.turn = true;
        }
      } else {
        vSeats = seats.map((s) => Object.assign({ id: s.uid, name: s.name, stack: s.stack, bet: 0, me: s.uid === me, button: s.seat === pub.buttonSeat, seatNo: s.seat }, extra[s.uid]));
      }
      const meI = dealtHand ? dealtHand.players.findIndex((p) => p.id === me) : -1;
      const hole = dealtHand && secret && Number(secret.handNo) === dealtHand.handNo && Array.isArray(secret.hole) ? secret.hole : null;
      const L = dealtHand && !dealtHand.done && meI >= 0 && dealtHand.toAct === meI ? C.legalFromPublic(dealtHand, meI) : null;
      const turnName = dealtHand && !dealtHand.done ? (dealtHand.players[dealtHand.toAct] || {}).name : '';

      const vm = {
        mode: 'live',
        handNo: dealtHand ? dealtHand.handNo : 0,
        street: dealtHand ? dealtHand.street : '',
        currentBet: dealtHand ? dealtHand.currentBet : 0,
        bb: (pub.blinds && pub.blinds.bb) || pub.settings.bb,
        ring: pub.settings.seats,
        seats: vSeats,
        board: dealtHand ? dealtHand.board : [],
        pot: dealtHand && !dealtHand.done ? dealtHand.pot : 0,
        hole,
        meFolded: meI >= 0 && dealtHand.players[meI].folded,
        helper: st.helper,
        legal: L,
        clock: pub.turn && dealtHand && !dealtHand.done ? { deadline: pub.deadline, total: pub.turn.bank ? Math.max(ACTION_MS, pub.deadline - pub.turn.at) : ACTION_MS, bank: !!pub.turn.bank } : null,
        status: statusLine(),
        resultHtml: dealtHand && dealtHand.done ? resultLine(dealtHand, me) : '',
      };

      if (!seat) {
        vm.actionsHtml = `<div class="pkr-wait">${esc(tr('notSeated', 'You’re not seated at this table'))}</div>`;
      } else if (pub.status === 'waiting' && (pub.kind !== 'quick' || !dealtHand)) {
        const w = waitingHtml();
        vm.actionsHtml = w.html;
        vm.wireActions = w.wire;
      } else if (pub.kind === 'quick' && !dealtHand && Object.keys(pub.seats).length < 2) {
        const w = waitingHtml();
        vm.actionsHtml = w.html;
      } else if (!L) {
        if (seat.stack === 0 && (!dealtHand || dealtHand.done || meI < 0) && pub.kind !== 'sng') {
          vm.actionsHtml = `<div class="pkr-bar"><button type="button" class="pkr-act" data-leave>${esc(tr('menu.leave', 'Leave table'))}</button>
            <button type="button" class="pkr-act pkr-act--primary" data-add>${esc(pub.kind === 'friends' ? tr('menu.rebuy', 'Rebuy') + ' ' + fmt(pub.settings.stack) : tr('menu.topup', 'Add chips'))}</button></div>`;
          vm.wireActions = (box) => {
            box.querySelector('[data-add]').addEventListener('click', () => (pub.kind === 'friends' ? simple('rebuy') : openTopUp()));
            box.querySelector('[data-leave]').addEventListener('click', onBack);
          };
        } else if (seat.sittingOut || seat.away) {
          vm.actionsHtml = `<div class="pkr-bar"><button type="button" class="pkr-act pkr-act--primary" data-sitin>${esc(tr('menu.sitIn', 'Sit back in'))}</button></div>`;
          vm.wireActions = (box) => box.querySelector('[data-sitin]').addEventListener('click', () => simple('sit_in'));
        } else if (dealtHand && dealtHand.done) {
          const mine = dealtHand.players[meI];
          const net = mine ? mine.stack - mine.start : 0;
          const canShow = meI >= 0 && !(dealtHand.result.shown || {})[meI] && hole;
          const big = net >= BIG_WIN_BB * dealtHand.bb;
          if (canShow || big) {
            vm.actionsHtml = `<div class="pkr-bar">${canShow ? `<button type="button" class="pkr-act" data-show>${esc(tr('act.show', 'Show cards'))}</button>` : ''}
              ${big ? `<button type="button" class="pkr-act pkr-act--primary" data-share>${esc(tr('share', 'Share'))}</button>` : ''}</div>`;
            vm.wireActions = (box) => {
              box.querySelector('[data-show]')?.addEventListener('click', () => simple('show'));
              box.querySelector('[data-share]')?.addEventListener('click', () => shareWin(net, (dealtHand.result.names || {})[meI] || ''));
            };
          } else vm.waitText = tr('wait.next', 'Next hand coming up…');
        } else if (dealtHand && meI >= 0 && dealtHand.players[meI].folded) {
          vm.waitText = tr('wait.folded', 'You folded — watching the hand');
        } else if (dealtHand && meI < 0) {
          vm.waitText = tr('wait.nextHand', 'You’re in from the next hand');
        } else {
          vm.waitText = turnName ? turnName + ' ' + tr('wait.thinking', 'is thinking…') : tr('wait.next', 'Next hand coming up…');
        }
      }
      if (seat && pub.kind === 'sng' && pub.status === 'playing' && seat.stack === 0 && (!dealtHand || dealtHand.done)) {
        const place = pub.sng && pub.sng.finish && pub.sng.finish[me];
        vm.actionsHtml = `<div class="pkr-wait-card"><div class="pkr-wait-title">${esc(tr('sng.out', 'You finished') + (place ? ' #' + place : ''))}</div>
          <div class="pkr-bar"><button type="button" class="pkr-act pkr-act--primary" data-home>${esc(tr('backHome', 'Back to lobby'))}</button></div></div>`;
        vm.wireActions = (box) => box.querySelector('[data-home]').addEventListener('click', () => K.closeThen(shell, openHome));
      }
      view.update(vm);
      maybeSaveHistory(dealtHand, hole);
    }

    function renderSngDone() {
      const place = pub.sng && pub.sng.finish ? pub.sng.finish[me] : 0;
      const prize = place ? pub.sng.payouts[place - 1] || 0 : 0;
      if (!sngShown && place && typeof recordDangalSession === 'function') {
        sngShown = true;
        try {
          recordDangalSession(GAME, { won: place === 1, live: true, stake: pub.sng.buyIn, mode: 'live' });
        } catch (e) {}
      }
      view.update({
        mode: 'live',
        seats: [],
        board: [],
        pot: 0,
        status: statusLine(),
        resultHtml: place
          ? `<div class="pkr-sng-place">${esc(place === 1 ? tr('sng.won', 'You won the Sit & Go!') : tr('sng.finished', 'You finished') + ' #' + place)}</div>${prize ? `<div class="pkr-sng-prize">+${fmt(prize)} ${esc(tr('chips', 'chips'))}</div>` : ''}`
          : esc(tr('sng.over', 'This Sit & Go is over')),
        actionsHtml: `<div class="pkr-bar">${place === 1 ? `<button type="button" class="pkr-act" data-share>${esc(tr('share', 'Share'))}</button>` : ''}
          <button type="button" class="pkr-act pkr-act--primary" data-home>${esc(tr('backHome', 'Back to lobby'))}</button></div>`,
        wireActions(box) {
          box.querySelector('[data-home]').addEventListener('click', () => K.closeThen(shell, openHome));
          box.querySelector('[data-share]')?.addEventListener('click', () => K.shareLine(GAME, LABEL, tr('sng.shareLine', 'Won a Sit & Go') + ' · +' + fmt(prize) + ' ' + tr('chips', 'chips')));
        },
      });
    }

    function maybeSaveHistory(h, hole) {
      if (!h || !h.done || !hole || savedHand === h.handNo) return;
      if (!h.players.some((p) => p.id === me)) return;
      savedHand = h.handNo;
      saveHistory(historyRecord(h, me, hole, pub.kind));
    }

    function loop() {
      if (stopped || !pub || pub.status === 'closed' || pub.status === 'finished') return;
      const due = Number(pub.deadline) || 0;
      const t = serverNow();
      if (due && t > due + 350 && Date.now() - lastTick > 1500) {
        lastTick = Date.now();
        liveCall('tick', { tableId })
          .then((r) => {
            if (r && r.serverNow) offset = Number(r.serverNow) - Date.now();
          })
          .catch(() => {});
      }
    }

    function subscribe() {
      const pubRef = ref.child('pub');
      const onPub = (snap) => {
        pub = snap.val();
        if (!pub) return;
        pub.seats = pub.seats || {};
        pub.players = pub.players || {};
        try {
          hand = pub.handJ ? JSON.parse(pub.handJ) : null;
        } catch (e) {
          hand = null;
        }
        render();
      };
      pubRef.on('value', onPub, () => {
        view.update({ mode: 'live', seats: [], board: [], pot: 0, resultHtml: esc(tr('err.gone', 'That table has closed')), actionsHtml: '' });
      });
      subs.push(() => pubRef.off('value', onPub));
      const secRef = ref.child('secrets/' + me);
      const onSec = (snap) => {
        secret = snap.val();
        const note = secret && secret.note;
        if (note && note.at && note.at !== lastNoteAt) {
          lastNoteAt = note.at;
          if (Date.now() - note.at < 120000 && typeof showAchievementToasts === 'function') showAchievementToasts([{ key: note.key }]);
        }
        render();
      };
      secRef.on('value', onSec, () => {});
      subs.push(() => secRef.off('value', onSec));
      try {
        const offRef = rtdb.ref('.info/serverTimeOffset');
        const onOff = (snap) => {
          const v = snap && snap.val();
          if (typeof v === 'number' && isFinite(v)) offset = v;
        };
        offRef.on('value', onOff);
        subs.push(() => offRef.off('value', onOff));
      } catch (e) {}
      const presRef = ref.child('presence/' + me);
      const beat = () => {
        if (!stopped) presRef.set({ at: TS, online: true }).catch(() => {});
      };
      try {
        presRef.onDisconnect().set({ at: TS, online: false });
      } catch (e) {}
      beat();
      timers.push(setInterval(beat, 10000));
      timers.push(setInterval(loop, 1000));
      const onVis = () => {
        if (document.visibilityState === 'visible') beat();
      };
      document.addEventListener('visibilitychange', onVis);
      subs.push(() => document.removeEventListener('visibilitychange', onVis));
    }

    view.update({ mode: 'live', seats: [], board: [], pot: 0, status: '', resultHtml: esc(tr('connecting', 'Joining the table…')), actionsHtml: '' });
    subscribe();
    if (o.invite && o.code) setTimeout(() => inviteFriendsTo(o.code, o.chat), 400);
    return shell;
  }

  function inviteFriendsTo(code, chat) {
    const K = Kit();
    if (chat && (chat.firestoreId || chat.id) && chat.id !== 'ai') {
      K.postInviteToChat(chat, GAME, code, LABEL).then((ok) => ok && toast(tr('invite.posted', 'Invite posted in the chat')));
      return;
    }
    K.openSheet({
      title: tr('invite.title', 'Invite to your table'),
      bodyHtml: `<div class="pkr-invite"><div class="pkr-invite-code">${esc(code)}</div>
        <div class="pkr-note">${esc(tr('invite.note', 'Friends join with this code, a chat invite or the link.'))}</div>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-friends>${esc(tr('invite.friends', 'Invite from Baithak'))}</button>
        <button type="button" class="pk-btn pk-btn--ghost pk-btn--block" data-share>${esc(tr('invite.share', 'Share link'))}</button></div>`,
      onMount(el, close) {
        el.querySelector('[data-friends]').addEventListener('click', () => {
          close();
          setTimeout(() => K.inviteFriends(GAME, code, LABEL), 80);
        });
        el.querySelector('[data-share]').addEventListener('click', () => {
          close();
          setTimeout(() => K.shareRoom(GAME, code, LABEL), 80);
        });
      },
    });
  }

  // ---------------- lobby flows ----------------

  async function walletBalance() {
    try {
      if (window.DangalEconomy && typeof DangalEconomy.getChipBalance === 'function') {
        const w = await DangalEconomy.getChipBalance(true);
        return Number(w && w.balance) || 0;
      }
    } catch (e) {}
    return null;
  }

  async function openQuickSheet(homeShell) {
    const K = Kit();
    const C = Core();
    if (!signedInOrPrompt() || !(await ensureAdult())) return;
    const balance = await walletBalance();
    const state = { tier: 't20' };
    let amount = 0;
    K.openSheet({
      title: tr('quick.title', 'Quick table'),
      bodyHtml: '<div data-quick></div>',
      onMount(el, close) {
        const host = el.querySelector('[data-quick]');
        const paint = () => {
          const tier = C.tierById(state.tier);
          const cap = balance == null ? tier.max : Math.min(tier.max, balance);
          const can = cap >= tier.min;
          amount = can ? clamp(amount || Math.min(cap, tier.bb * 100), tier.min, cap) : tier.min;
          host.innerHTML = `<div class="pk-field"><div class="pk-field-label">${esc(tr('quick.stakes', 'Blinds'))}</div>
              ${K.segHtml('tier', state.tier, C.TIERS.map((x) => [x.id, x.label]))}</div>
            <div class="pkr-buyin"><div class="pkr-buyin-label">${esc(tr('quick.buyin', 'Buy-in'))}</div><div class="pkr-buyin-amt" data-amt>${fmt(amount)}</div>
              <input type="range" class="pkr-slider" data-slider min="${tier.min}" max="${Math.max(tier.min, cap)}" step="${tier.bb}" value="${amount}" ${can ? '' : 'disabled'} aria-label="${esc(tr('quick.buyin', 'Buy-in'))}">
              <div class="pkr-note">${esc(fmt(tier.min) + ' – ' + fmt(tier.max) + ' · ' + tr('quick.seats', '6 seats · leave any time between hands'))}</div>
              ${balance != null ? `<div class="pkr-note">${esc(tr('wallet', 'Wallet') + ': ' + fmt(balance) + ' ' + tr('chips', 'chips'))}</div>` : ''}
              ${can ? '' : `<div class="pkr-note is-warn">${esc(tr('quick.short', 'You need at least') + ' ' + fmt(tier.min) + ' ' + tr('chips', 'chips') + ' ' + tr('quick.shortTail', 'for this table'))}</div>`}</div>
            <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-go ${can ? '' : 'disabled'}>${esc(tr('quick.go', 'Sit down'))}</button>
            <p class="pkr-note">${esc(tr('virtual', 'Virtual chips only — they can’t be bought or cashed out.'))}</p>`;
          K.wireSegs(host, state, () => {
            amount = 0;
            paint();
          });
          const sl = host.querySelector('[data-slider]');
          sl.addEventListener('input', () => {
            amount = Number(sl.value) > cap - tier.bb / 2 ? cap : Number(sl.value);
            host.querySelector('[data-amt]').textContent = fmt(amount);
          });
          host.querySelector('[data-go]').addEventListener('click', async (ev) => {
            ev.currentTarget.disabled = true;
            try {
              const r = await liveCall('quick_join', { tier: state.tier, buyIn: amount, name: myName(), dev: deviceId() });
              close();
              goTable(homeShell, r.tableId);
            } catch (e) {
              ev.currentTarget.disabled = false;
              toast(liveErrorText(e));
            }
          });
        };
        paint();
      },
    });
  }

  async function openSngSheet(homeShell) {
    const K = Kit();
    const C = Core();
    if (!signedInOrPrompt() || !(await ensureAdult())) return;
    const balance = await walletBalance();
    const state = { size: 6 };
    K.openSheet({
      title: tr('sng.title', 'Sit & Go'),
      bodyHtml: '<div data-sng></div>',
      onMount(el, close) {
        const host = el.querySelector('[data-sng]');
        const paint = () => {
          const pay = C.sngPayouts(state.size, C.SNG.buyIn);
          const can = balance == null || balance >= C.SNG.buyIn;
          host.innerHTML = `<div class="pk-field"><div class="pk-field-label">${esc(tr('sng.players', 'Players'))}</div>
              ${K.segHtml('size', state.size, C.SNG.sizes.map((s) => [s, s + ' ' + tr('sng.seats', 'players')]))}</div>
            <div class="pkr-sng-facts">
              <div><span>${esc(tr('sng.buyin', 'Buy-in'))}</span><b>${fmt(C.SNG.buyIn)}</b></div>
              <div><span>${esc(tr('sng.stack', 'Starting stack'))}</span><b>${fmt(C.SNG.stack)}</b></div>
              <div><span>${esc(tr('sng.blinds', 'Blinds up every'))}</span><b>${Math.round(C.SNG.levelMs / 60000)} ${esc(tr('min', 'min'))}</b></div>
              <div><span>${esc(tr('sng.prizes', 'Prizes'))}</span><b>${pay.map(fmt).join(' / ')}</b></div>
            </div>
            ${balance != null ? `<div class="pkr-note">${esc(tr('wallet', 'Wallet') + ': ' + fmt(balance) + ' ' + tr('chips', 'chips'))}</div>` : ''}
            <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-go ${can ? '' : 'disabled'}>${esc(tr('sng.go', 'Register'))}</button>
            <p class="pkr-note">${esc(tr('sng.note', 'Starts when the table fills. Unregister before it starts for a full refund.'))}</p>`;
          K.wireSegs(host, state, paint);
          host.querySelector('[data-go]').addEventListener('click', async (ev) => {
            ev.currentTarget.disabled = true;
            try {
              const r = await liveCall('sng_join', { size: state.size, name: myName(), dev: deviceId() });
              close();
              goTable(homeShell, r.tableId);
            } catch (e) {
              ev.currentTarget.disabled = false;
              toast(liveErrorText(e));
            }
          });
        };
        paint();
      },
    });
  }

  function friendsSettingsHtml(st, minSeats) {
    const K = Kit();
    const C = Core();
    const seatOpts = [];
    for (let n = Math.max(2, minSeats || 2); n <= C.MAX_SEATS; n++) seatOpts.push([n, String(n)]);
    return `<div class="pk-field"><div class="pk-field-label">${esc(tr('friends.blinds', 'Blinds'))}</div>
        ${K.segHtml('bb', st.bb, C.FRIENDS_BLINDS.map((b) => [b[1], fmt(b[0]) + '/' + fmt(b[1])]))}</div>
      <div class="pk-field"><div class="pk-field-label">${esc(tr('friends.stack', 'Starting stack'))}</div>
        ${K.segHtml('stack', st.stack, C.FRIENDS_STACKS.map((s) => [s, fmt(s)]))}</div>
      <div class="pk-field"><div class="pk-field-label">${esc(tr('friends.timer', 'Blinds double every'))}</div>
        ${K.segHtml('blindMinutes', st.blindMinutes, C.FRIENDS_TIMERS.map((m) => [m, m ? m + ' ' + tr('min', 'min') : tr('friends.never', 'Never')]))}</div>
      <div class="pk-field"><div class="pk-field-label">${esc(tr('friends.seats', 'Seats'))}</div>
        <div class="pkr-seg-scroll">${K.segHtml('seats', st.seats, seatOpts)}</div></div>`;
  }

  async function openFriendsSheet(homeShell, chat) {
    const K = Kit();
    const C = Core();
    if (!signedInOrPrompt() || !(await ensureAdult())) return;
    const st = Object.assign({}, C.FRIENDS_DEFAULTS);
    K.openSheet({
      title: tr('friends.title', 'Friends table'),
      bodyHtml: `<p class="pkr-note">${esc(tr('friends.note', 'Private table with table-only chips — nothing touches your wallet.'))}</p>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-create>${esc(tr('friends.create', 'Create a table'))}</button>
        <details class="pkr-details"><summary>${esc(tr('friends.custom', 'Blinds, stack & seats'))}</summary>${friendsSettingsHtml(st, 2)}</details>
        <button type="button" class="pk-link" data-join>${esc(tr('friends.haveCode', 'Have a table code? Join'))}</button>`,
      onMount(el, close) {
        K.wireSegs(el, st, () => {});
        el.querySelector('[data-create]').addEventListener('click', async (ev) => {
          ev.currentTarget.disabled = true;
          try {
            const r = await liveCall('friends_create', { settings: st, name: myName() });
            close();
            goTable(homeShell, r.tableId, { chat, invite: true, code: r.tableId });
          } catch (e) {
            ev.currentTarget.disabled = false;
            toast(liveErrorText(e));
          }
        });
        el.querySelector('[data-join]').addEventListener('click', () => {
          close();
          setTimeout(() => K.openJoinSheet((code) => joinFriends(code, { homeShell })), 80);
        });
      },
    });
  }

  async function joinFriends(code, o) {
    const opts = o || {};
    if (!signedInOrPrompt() || !(await ensureAdult())) return;
    const clean = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    try {
      const r = await liveCall('join', { tableId: clean, name: myName(), dev: deviceId() });
      goTable(opts.homeShell, r.tableId || clean);
    } catch (e) {
      toast(liveErrorText(e));
    }
  }

  function goTable(homeShell, tableId, o) {
    const K = Kit();
    const go = () => openLive(tableId, o);
    if (homeShell && !homeShell.closed) K.closeThen(homeShell, go);
    else go();
  }

  async function openLeaderboard() {
    const K = Kit();
    const sheet = K.openSheet({
      title: tr('lb.title', 'This week'),
      bodyHtml: `<div data-lb><p class="pkr-note">${esc(tr('lb.loading', 'Loading…'))}</p></div>`,
    });
    let rows = [];
    try {
      rows = typeof loadWeeklyLeaderboard === 'function' ? await loadWeeklyLeaderboard(GAME, myUid()) : [];
    } catch (e) {
      rows = [];
    }
    const host = sheet.el.querySelector('[data-lb]');
    if (!host) return;
    const byWins = rows
      .filter((r) => (r.wins || 0) > 0)
      .sort((a, b) => (b.wins || 0) - (a.wins || 0) || (b.net || 0) - (a.net || 0))
      .slice(0, 10);
    const byNet = rows
      .filter((r) => (r.games || 0) > 0)
      .sort((a, b) => (b.net || 0) - (a.net || 0))
      .slice(0, 10);
    const table = (list, val) =>
      list.length
        ? list
            .map(
              (r, i) => `<div class="pkr-lb-row${r.uid === myUid() ? ' is-you' : ''}"><span>${i + 1}</span><span>${esc(r.uid === myUid() ? tr('you', 'You') : r.name || tr('player', 'Player'))}</span><b>${val(r)}</b></div>`
            )
            .join('')
        : `<p class="pkr-note">${esc(tr('lb.empty', 'No results yet this week.'))}</p>`;
    host.innerHTML = `<div class="pkr-lb"><div class="pkr-lb-head">${esc(tr('lb.sng', 'Sit & Go wins'))}</div>${table(byWins, (r) => r.wins || 0)}
      <div class="pkr-lb-head">${esc(tr('lb.net', 'Net chips at public tables'))}</div>${table(byNet, (r) => (r.net > 0 ? '+' : '') + fmt(r.net || 0))}</div>`;
  }

  function openSettings(onDone) {
    const K = Kit();
    const st = settings();
    const state = { helper: st.helper ? 1 : 0, bots: st.bots, seats: st.seats };
    K.openSheet({
      title: tr('set.title', 'Settings'),
      bodyHtml: `<div class="pk-field"><div class="pk-field-label">${esc(tr('set.helper', 'Beginner helper'))}</div>
          ${K.segHtml('helper', state.helper, [[1, tr('on', 'On')], [0, tr('off', 'Off')]])}
          <div class="pk-field-help">${esc(tr('set.helperHelp', 'Shows the name of your current hand. No win odds at live tables.'))}</div></div>
        <div class="pk-field"><div class="pk-field-label">${esc(tr('set.bots', 'Bot level'))}</div>
          ${K.segHtml('bots', state.bots, Core().BOT_LEVELS.map((l) => [l, levelLabel(l)]))}</div>
        <div class="pk-field"><div class="pk-field-label">${esc(tr('set.seats', 'Practice table size'))}</div>
          ${K.segHtml('seats', state.seats, [2, 3, 4, 5, 6].map((n) => [n, String(n)]))}</div>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-done>${esc(tr('set.done', 'Done'))}</button>`,
      onMount(el, close) {
        K.wireSegs(el, state, () => saveSettings({ helper: !!state.helper, bots: state.bots, seats: state.seats }));
        el.querySelector('[data-done]').addEventListener('click', close);
      },
      onClose: () => onDone && setTimeout(onDone, 60),
    });
  }

  // ---------------- home ----------------

  let home = null;

  function openHome() {
    const K = Kit();
    if (!K || !Core()) return toast(LABEL + ' ' + tr('loading', 'is still loading — try again'));
    if (home && !home.closed) home.close();
    const s = settings();
    const shell = K.openShell({ gameId: GAME, title: LABEL, subtitle: tr('home.sub', 'Cards') });
    home = shell;
    shell.render(`<div class="pk-page pkr-home">
      <div data-return></div>
      <div class="pk-hero">
        <div class="pk-hero-mark">${typeof gameMarkHtml === 'function' ? gameMarkHtml(GAME, { size: 64 }) : '♠'}</div>
        <div class="pk-hero-title">${esc(LABEL)}</div>
        <div class="pk-hero-sub">${esc(tr('home.tag', 'No-Limit. Two cards, five on the board, best hand wins.'))}</div>
      </div>
      ${howToHtml()}
      <div class="pk-modes">
        <button type="button" class="pk-mode pk-mode--primary" data-go="practice">
          <span class="pk-mode-title">${esc(tr('home.practice', 'Practice vs bots'))}</span>
          <span class="pk-mode-sub">${esc(s.seats + ' ' + tr('home.players', 'players') + ' · ' + levelLabel(s.bots) + ' · ' + tr('home.noChips', 'no wallet chips'))}</span>
        </button>
        <button type="button" class="pk-mode" data-go="live">
          <span class="pk-mode-title">${esc(tr('home.live', 'Play live'))}</span>
          <span class="pk-mode-sub">${esc(tr('home.liveSub', 'Quick table · Sit & Go · Friends table'))}</span>
        </button>
        <div class="pkr-home-links">
          <button type="button" class="pk-link" data-go="rankings">${esc(tr('rank.title', 'Hand rankings'))}</button>
          <button type="button" class="pk-link" data-go="history">${esc(tr('hist.title', 'Hand history'))}</button>
          <button type="button" class="pk-link" data-go="board">${esc(tr('lb.title', 'This week'))}</button>
          <button type="button" class="pk-link" data-go="settings">${esc(tr('set.title', 'Settings'))}</button>
        </div>
        <p class="pkr-note">${esc(tr('virtual', 'Virtual chips only — they can’t be bought or cashed out.'))} 18+</p>
      </div>
    </div>`);
    const b = shell.body;
    b.querySelector('[data-rankings]')?.addEventListener('click', openRankings);
    b.querySelector('[data-go="practice"]').addEventListener('click', () => K.closeThen(shell, () => startPractice()));
    b.querySelector('[data-go="live"]').addEventListener('click', () => openLiveChooser(shell));
    b.querySelector('[data-go="rankings"]').addEventListener('click', openRankings);
    b.querySelector('[data-go="history"]').addEventListener('click', openHistory);
    b.querySelector('[data-go="board"]').addEventListener('click', openLeaderboard);
    b.querySelector('[data-go="settings"]').addEventListener('click', () => openSettings(() => K.closeThen(shell, openHome)));
    if (K.isSignedIn() && typeof apiFetch === 'function') {
      liveCall('reconcile')
        .then((r) => paintReturn(shell, (r && r.tables) || []))
        .catch(() => {});
    }
  }

  function paintReturn(shell, tables) {
    if (shell.closed || !tables.length) return;
    const host = shell.body.querySelector('[data-return]');
    if (!host) return;
    host.innerHTML = tables
      .map(
        (tb) => `<button type="button" class="pkr-return" data-table="${esc(tb.tableId)}">
        <span><b>${esc(tr('return.title', 'You’re seated at a table'))}</b><small>${esc(modeLabel(tb.kind) + (tb.stack ? ' · ' + fmt(tb.stack) + ' ' + tr('chips', 'chips') : ''))}</small></span>
        <span class="pkr-return-go">${esc(tr('return.go', 'Return'))} ›</span></button>`
      )
      .join('');
    host.querySelectorAll('[data-table]').forEach((b) => b.addEventListener('click', () => goTable(shell, b.dataset.table)));
  }

  function openLiveChooser(homeShell) {
    const K = Kit();
    if (!signedInOrPrompt()) return;
    K.openSheet({
      title: tr('home.live', 'Play live'),
      bodyHtml: `<div class="pk-modes">
        <button type="button" class="pk-mode" data-l="quick"><span class="pk-mode-title">${esc(tr('quick.title', 'Quick table'))}</span><span class="pk-mode-sub">${esc(tr('quick.sub', 'Jump in · wallet buy-in · leave any time'))}</span></button>
        <button type="button" class="pk-mode" data-l="sng"><span class="pk-mode-title">${esc(tr('sng.title', 'Sit & Go'))}</span><span class="pk-mode-sub">${esc(tr('sng.sub', '6 or 9 players · rising blinds · top places paid'))}</span></button>
        <button type="button" class="pk-mode" data-l="friends"><span class="pk-mode-title">${esc(tr('friends.title', 'Friends table'))}</span><span class="pk-mode-sub">${esc(tr('friends.sub', 'Private · your rules · table chips only'))}</span></button>
      </div>`,
      onMount(el, close) {
        el.querySelectorAll('[data-l]').forEach((btn) =>
          btn.addEventListener('click', () => {
            close();
            const k = btn.dataset.l;
            setTimeout(() => (k === 'quick' ? openQuickSheet(homeShell) : k === 'sng' ? openSngSheet(homeShell) : openFriendsSheet(homeShell)), 80);
          })
        );
      },
    });
  }

  // ---------------- registration ----------------

  async function launch(opts) {
    const o = opts || {};
    if (!Core() || !Kit()) {
      toast(LABEL + ' ' + tr('loading', 'is still loading — try again'));
      return;
    }
    if (!(await ensureAdult())) return;
    const chat = o.chat || null;
    if (chat && chat.id && chat.id !== 'ai' && (chat.type === 'group' || chat.isGroup || o.source === 'chat')) return openFriendsSheet(null, chat);
    if (o.practiceKind === 'vsAi' && o.source && o.source !== 'manch') return startPractice();
    return openHome();
  }

  const lazy = (fn) => (Kit() && typeof Kit().withGameData === 'function' ? Kit().withGameData(GAME, fn) : fn);
  const openGame = lazy(launch);

  if (Kit() && typeof Kit().registerPartyGame === 'function') {
    Kit().registerPartyGame(GAME, { openRoom: (code) => joinFriends(code) });
  }

  if (typeof registerGame === 'function') {
    registerGame({
      id: 'poker',
      name: LABEL,
      desc: 'No-Limit Hold’em — practice vs bots, quick tables, Sit & Go, friends',
      icon: '♠',
      gameType: 'multiplayer',
      genre: 'cards',
      dangal: true,
      liveDuel: true,
      chat1v1: true,
      chatGroup: true,
      selfChat: true,
      ownHome: true,
      order: 32,
      meta: {
        core: 'poker-core.js (evaluator, betting, side pots, bots — shared with the server)',
        live: 'poker_table → server-lib/poker-engine.js; CSPRNG deal, hole cards owner-only, server timers + settlement',
      },
      launch: openGame,
    });
  }

  window.openPoker = openGame;
  window.PokerGame = {
    launch: openGame,
    openHome: lazy(openHome),
    startPractice: lazy(startPractice),
    openLive: lazy(openLive),
    openRankings: lazy(openRankings),
    openHistory: lazy(openHistory),
  };
})();
