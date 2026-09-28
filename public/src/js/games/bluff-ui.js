/**
 * Bluff (Dangal P9) — Sequence (A, 2, 3 … K) and Follow the rank, 3–8 players.
 * Practice vs bots (Easy / Normal / Smart) runs bluff-core.js on the phone; Live tables run through a
 * party room: the server (server-lib/bluff-engine.js) deals, keeps every face-down card, times the
 * Bluff window and settles the race. Only your own hand and turned-over plays ever reach this phone.
 */
(function () {
  'use strict';

  const GAME = 'bluff';
  const LABEL = 'Bluff';
  const SETUP_KEY = 'chaupaal_bluff_setup';
  const Core = () => window.BluffCore;
  const CK = () => window.ClassicsKit;
  const Kit = () => window.PartyKit;
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  function tr(key, fallback) {
    return typeof t === 'function' ? t('bluff.' + key, fallback) : fallback;
  }
  const clone = (x) => JSON.parse(JSON.stringify(x));
  function toast(msg) {
    if (typeof showToast === 'function') showToast(msg);
  }
  const readJson = (k, fb) => (CK() ? CK().readJson(k, fb) : fb);
  const writeJson = (k, v) => CK() && CK().writeJson(k, v);
  const fx = (k) => CK() && CK().fx(k);
  function arr(x) {
    if (Array.isArray(x)) return x;
    if (x && typeof x === 'object') {
      const out = [];
      Object.keys(x)
        .filter((k) => /^\d+$/.test(k))
        .forEach((k) => (out[Number(k)] = x[k]));
      return out;
    }
    return [];
  }

  const LEVELS = ['easy', 'normal', 'smart'];
  const STAKES = [0, 10, 25, 50, 100];
  function levelLabel(l) {
    return { easy: tr('lvl.easy', 'Easy'), normal: tr('lvl.normal', 'Normal'), smart: tr('lvl.smart', 'Smart') }[l] || l;
  }
  function styleLabel(s) {
    return s === 'follow' ? tr('style.follow', 'Follow the rank') : tr('style.sequence', 'Sequence');
  }
  function styleNote(s) {
    return s === 'follow'
      ? tr('note.follow', 'The leader names a rank; everyone claims it or passes. All pass → the pile is set aside and the last player to put cards down leads.')
      : tr('note.sequence', 'Claims run Aces, Twos, Threes … Kings, then round again. No passing — play every turn.');
  }
  /** Locale default: Follow the rank where it's the common house style (South Asia); Sequence elsewhere. */
  function localeStyle() {
    return typeof isIndiaLocale === 'function' && isIndiaLocale() ? 'follow' : 'sequence';
  }
  function loadSetup() {
    const s = Object.assign({ style: localeStyle(), bots: 3, level: 'normal', windowSec: 5, jokers: false, placements: false }, readJson(SETUP_KEY, {}));
    if (LEVELS.indexOf(s.level) < 0) s.level = 'normal';
    if (['sequence', 'follow'].indexOf(s.style) < 0) s.style = localeStyle();
    s.bots = Math.max(2, Math.min(7, Number(s.bots) || 3));
    s.windowSec = [3, 5, 8].indexOf(Number(s.windowSec)) >= 0 ? Number(s.windowSec) : 5;
    return s;
  }
  const rankName = (r, n) => (r >= 0 ? (n === 1 ? Core().RANK_ONE[r] : Core().RANK_NAMES[r]) : '');

  // ---------------- cards ----------------

  function cardHtml(c, o) {
    const opt = o || {};
    const C = Core();
    const sz = opt.size || 'md';
    if (!c) return `<span class="pkr-card pkr-card--${sz} pkr-card--back" aria-hidden="true"></span>`;
    if (C.isJoker(c)) return `<span class="pkr-card pkr-card--${sz} bl-joker${opt.cls ? ' ' + opt.cls : ''}" role="img" aria-label="Joker"><b>★</b><i>JK</i></span>`;
    const r = C.rankOf(c);
    const s = C.suitOf(c);
    const red = s === 'H' || s === 'D';
    const name = C.RANK_ONE[r] + ' of ' + { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' }[s];
    return `<span class="pkr-card pkr-card--${sz}${red ? ' is-red' : ''}${opt.cls ? ' ' + opt.cls : ''}" role="img" aria-label="${esc(name)}"><b>${C.RANK_LABELS[r]}</b><i>${C.SUIT_SYMBOLS[s]}</i></span>`;
  }

  // ---------------- table view (practice + Live) ----------------

  /**
   * vm = BluffCore.publicView (+ stake, windowEnds) plus { me, hand, legal, live, windowEndsLocal }.
   * @param {HTMLElement} host
   * @param {{ act: (type, args?) => any, footer?: (vm, el) => void, menu?: () => {label,run}[], onHud?: (el) => void }} o
   */
  function createTable(host, o) {
    host.innerHTML = `<div class="bl-wrap">
      <div class="bl-top"><div class="bl-status" data-status aria-live="polite"></div></div>
      <div class="bl-seats" data-seats></div>
      <div class="bl-center">
        <div class="bl-pile" data-pile></div>
        <div class="bl-claim" data-claim aria-live="polite"></div>
      </div>
      <div class="bl-reveal" data-reveal aria-live="assertive"></div>
      <div class="bl-call" data-call></div>
      <div class="bl-hand" data-hand></div>
      <div class="bl-actions" data-actions></div>
      <div class="bl-foot" data-foot></div>
    </div>`;
    let vm = null;
    let pending = false;
    let destroyed = false;
    let sel = [];
    let pick = -1;
    let lastTurnKey = '';
    let lastReveal = 0;
    let barTimer = null;
    const L = () => (vm && vm.legal) || {};
    const nameOf = (i) => (i === vm.me ? tr('you', 'You') : vm.seats[i] ? vm.seats[i].name : '');

    async function send(type, args) {
      if (pending) return;
      pending = true;
      paintActions();
      try {
        await o.act(type, args || {});
      } finally {
        pending = false;
        if (!destroyed) paintActions();
      }
    }

    function claimRank() {
      if (!vm) return -1;
      if (vm.rank >= 0) return vm.rank;
      return pick;
    }

    function seatHtml(i) {
      const s = vm.seats[i];
      const cls = ['bl-seat'];
      const out = vm.finished.indexOf(i) >= 0;
      if (i === vm.me) cls.push('is-me');
      if (!vm.over && vm.phase === 'play' && vm.turn === i) cls.push('is-turn');
      if (vm.last && vm.phase === 'window' && vm.last.seat === i) cls.push('is-played');
      if (out) cls.push('is-out');
      if (vm.over && vm.winner === i) cls.push('is-win');
      const presence = vm.live && !s.bot ? `<span class="pk-dot" data-presence="${esc(s.id)}"></span>` : '';
      const tag = out ? '#' + s.place : vm.pending === i ? tr('lastCard', 'Last card!') : s.forfeit === 'left' ? tr('leftBot', 'Left · Bot') : '';
      return `<div class="${cls.join(' ')}"><div class="bl-seat-name">${presence}${esc(nameOf(i))}</div>
        <div class="bl-seat-n"><span class="bl-mini" aria-hidden="true"></span>${s.n}<span class="sr-only"> ${esc(tr('cardsWord', 'cards'))}</span></div>
        ${tag ? `<div class="bl-seat-tag">${esc(tag)}</div>` : ''}</div>`;
    }

    function statusText() {
      if (vm.over) return tr('gameOver', 'Game over');
      const bits = [styleLabel(vm.style)];
      if (vm.decks > 1) bits.push(tr('twoDecks', 'two decks'));
      if (vm.jokers) bits.push(tr('jokersWild', 'jokers wild'));
      return bits.join(' · ');
    }

    function claimLine() {
      if (vm.over) return '';
      if (vm.phase === 'window' && vm.last) {
        const who = nameOf(vm.last.seat);
        return `<b>${esc(who)}</b> ${esc(vm.last.seat === vm.me ? tr('youPlayed', 'played') : tr('played', 'played'))} <b>${esc(Core().claimText(vm.last.n, vm.last.rank))}</b>${vm.pending === vm.last.seat ? ' · ' + esc(tr('lastCardQ', 'their last card!')) : ''}`;
      }
      if (vm.phase === 'reveal') return '';
      if (vm.rank < 0) return `${esc(nameOf(vm.turn))} ${esc(vm.turn === vm.me ? tr('youLead', 'lead — pick any rank') : tr('leads', 'leads a new rank'))}`;
      return `${esc(tr('nowClaim', 'Now claiming'))} <b>${esc(rankName(vm.rank, 2))}</b>`;
    }

    function revealHtml() {
      const r = vm.reveal;
      if (vm.phase !== 'reveal' || !r) return '';
      const fresh = r.no !== lastReveal;
      const cards = r.cards.map((c) => cardHtml(c, { size: 'sm', cls: fresh ? 'bl-flip' : '' })).join('');
      const verdict = r.truth
        ? `${esc(tr('truth', 'True!'))} ${esc(nameOf(r.caller))} ${esc(tr('picksUp', 'picks up'))} ${r.n}`
        : `${esc(tr('caught', 'Bluff!'))} ${esc(nameOf(r.seat))} ${esc(tr('picksUp', 'picks up'))} ${r.n}`;
      return `<div class="bl-reveal-box ${r.truth ? 'is-true' : 'is-lie'}"><div class="bl-reveal-who">${esc(nameOf(r.caller))} ${esc(tr('called', 'called Bluff on'))} ${esc(nameOf(r.seat))} · ${esc(Core().claimText(r.cards.length, r.rank))}</div>
        <div class="bl-reveal-cards">${cards}</div><div class="bl-verdict">${verdict}</div></div>`;
    }

    function paint() {
      if (destroyed || !vm) return;
      host.querySelector('[data-seats]').innerHTML = vm.seats.map((s, i) => seatHtml(i)).join('');
      host.querySelector('[data-seats]').dataset.n = String(vm.seats.length);
      const pile = host.querySelector('[data-pile]');
      pile.innerHTML = `<div class="bl-pile-stack${vm.pile ? '' : ' is-empty'}" aria-label="${esc(tr('pileAria', 'Pile'))} ${vm.pile}">${vm.pile ? '<span></span><span></span><span></span>' : ''}</div>
        <div class="bl-pile-n"><b>${vm.pile}</b> ${esc(tr('inPile', 'in the pile'))}${vm.discarded ? ` · ${vm.discarded} ${esc(tr('setAside', 'set aside'))}` : ''}</div>`;
      host.querySelector('[data-claim]').innerHTML = claimLine();
      const rev = host.querySelector('[data-reveal]');
      rev.innerHTML = revealHtml();
      if (vm.phase === 'reveal' && vm.reveal && vm.reveal.no !== lastReveal) {
        lastReveal = vm.reveal.no;
        const mine = vm.reveal.taker === vm.me;
        fx(mine ? 'lose' : vm.reveal.caller === vm.me || vm.reveal.seat === vm.me ? 'win' : 'place');
      }
      const status = host.querySelector('[data-status]');
      status.innerHTML = `${esc(statusText())}${vm.live && !vm.over && vm.phase === 'play' ? ' <span class="cl-timer pk-timer" data-timer></span>' : ''}${vm.live && vm.stake ? ` <span class="tp-chip">⚡${vm.stake}</span>` : ''}`;
      if (o.onHud) o.onHud(status);
      paintCall();
      paintHand();
      paintActions();
      paintFoot();
    }

    function paintCall() {
      const el = host.querySelector('[data-call]');
      clearInterval(barTimer);
      const l = L();
      if (vm.over || vm.phase !== 'window' || !vm.last) {
        el.innerHTML = '';
        return;
      }
      const total = vm.windowMs || 5000;
      const ends = vm.windowEndsLocal || Date.now() + total;
      const left = () => Math.max(0, ends - Date.now());
      const canCall = l.call === 'open';
      el.innerHTML = `${
        canCall
          ? `<button type="button" class="bl-bluff-btn" data-a="call" ${pending ? 'disabled' : ''}>${esc(tr('bluffBtn', 'Bluff!'))} <span data-sec></span></button>
             <button type="button" class="pk-link bl-letgo" data-a="letgo">${esc(tr('letGo', 'Let it go'))}</button>`
          : `<div class="bl-window-note">${esc(l.call === 'passed' ? tr('youLetGo', 'You let it go — waiting for the others') : vm.last.seat === vm.me ? tr('holdBreath', 'Will anyone call Bluff?') : tr('window', 'Bluff window'))} <span data-sec></span></div>`
      }<div class="bl-bar"><span data-bar style="width:${((left() / total) * 100).toFixed(1)}%"></span></div>`;
      const bar = el.querySelector('[data-bar]');
      const sec = el.querySelector('[data-sec]');
      const tick = () => {
        const ms = left();
        if (bar) bar.style.width = ((ms / total) * 100).toFixed(1) + '%';
        if (sec) sec.textContent = Math.ceil(ms / 1000) + 's';
        if (ms <= 0) clearInterval(barTimer);
      };
      tick();
      barTimer = setInterval(tick, 100);
      el.querySelectorAll('[data-a]').forEach((b) =>
        b.addEventListener('click', () => {
          if (b.dataset.a === 'call') {
            fx('tap');
            send('call', { no: vm.last.no });
          } else send('letgo', { no: vm.last.no });
        })
      );
    }

    function paintHand() {
      const el = host.querySelector('[data-hand]');
      if (vm.me < 0) {
        el.innerHTML = `<p class="pkr-wait">${esc(tr('watching', 'Watching'))}</p>`;
        return;
      }
      const hand = vm.hand || [];
      sel = sel.filter((c) => hand.indexOf(c) >= 0);
      if (!hand.length) {
        el.innerHTML = vm.finished.indexOf(vm.me) >= 0 ? `<p class="pkr-wait">${esc(tr('youreOut', 'You’re out of cards'))}</p>` : '';
        return;
      }
      const canPick = !!L().play;
      const want = claimRank();
      el.innerHTML = `<div class="bl-fan${canPick ? ' is-live' : ''}" role="group" aria-label="${esc(tr('yourHand', 'Your hand'))}">${hand
        .map((c) => {
          const on = sel.indexOf(c) >= 0;
          const match = want >= 0 && Core().matches(c, want, vm.jokers);
          return `<button type="button" class="bl-c${on ? ' is-sel' : ''}${match ? ' is-match' : ''}" data-card="${esc(c)}" aria-pressed="${on}" ${canPick ? '' : 'tabindex="-1"'}>${cardHtml(c)}</button>`;
        })
        .join('')}</div><div class="bl-hand-n">${hand.length} ${esc(tr('cardsWord', 'cards'))}</div>`;
      const fan = el.querySelector('.bl-fan');
      const first = fan.firstElementChild;
      if (first && hand.length > 1) {
        const cw = first.offsetWidth || 36;
        const step = Math.max(14, Math.min(cw + 3, (fan.clientWidth - 8 - cw) / (hand.length - 1)));
        fan.style.setProperty('--bl-ml', Math.round(step - cw) + 'px');
      }
      el.querySelectorAll('[data-card]').forEach((b) =>
        b.addEventListener('click', () => {
          if (!L().play) return;
          const c = b.dataset.card;
          const k = sel.indexOf(c);
          if (k >= 0) sel.splice(k, 1);
          else if (sel.length < (L().max || vm.maxPlay)) sel.push(c);
          else return toast(tr('maxN', 'Up to') + ' ' + (L().max || vm.maxPlay) + ' ' + tr('perPlay', 'cards per play'));
          if (vm.rank < 0 && pick < 0 && sel.length === 1 && !Core().isJoker(c)) pick = Core().rankOf(c);
          fx('tap');
          paintHand();
          paintActions();
        })
      );
    }

    function paintActions() {
      const el = host.querySelector('[data-actions]');
      const l = L();
      const dis = pending ? 'disabled' : '';
      if (!vm || vm.over) {
        el.innerHTML = '';
        return;
      }
      if (l.play) {
        const lead = vm.rank < 0;
        const r = claimRank();
        const hand = vm.hand || [];
        const mine = r >= 0 ? hand.filter((c) => Core().matches(c, r, vm.jokers)).slice(0, l.max || vm.maxPlay) : [];
        const picker = lead
          ? `<div class="bl-ranks" role="radiogroup" aria-label="${esc(tr('pickRank', 'Claim a rank'))}">${Core()
              .RANK_LABELS.map((lab, i) => `<button type="button" class="bl-rank${i === pick ? ' is-on' : ''}" role="radio" aria-checked="${i === pick}" data-rank="${i}">${lab}</button>`)
              .join('')}</div>`
          : `<div class="bl-locked">${esc(tr('claimLocked', 'You must claim'))} <b>${esc(rankName(r, 2))}</b></div>`;
        const n = sel.length;
        const label = n && r >= 0 ? tr('playAs', 'Play') + ' ' + Core().claimText(n, r) : lead && r < 0 ? tr('pickFirst', 'Pick a rank') : tr('pickCards', 'Pick cards');
        el.innerHTML = `${picker}
          <div class="pkr-bar">
            ${l.pass ? `<button type="button" class="pkr-act pkr-act--ghost" data-a="pass" ${dis}>${esc(tr('pass', 'Pass'))}</button>` : ''}
            <button type="button" class="pkr-act pkr-act--primary" data-a="play" ${dis || !n || r < 0 ? 'disabled' : ''}>${esc(label)}</button>
          </div>
          ${mine.length && (mine.length !== n || mine.some((c) => sel.indexOf(c) < 0)) ? `<button type="button" class="pk-link bl-mine" data-a="mine">${esc(tr('selectMine', 'Select my'))} ${esc(rankName(r, mine.length))} (${mine.length})</button>` : ''}`;
        el.querySelectorAll('[data-rank]').forEach((b) =>
          b.addEventListener('click', () => {
            pick = Number(b.dataset.rank);
            paintHand();
            paintActions();
          })
        );
        el.querySelector('[data-a="mine"]')?.addEventListener('click', () => {
          sel = mine.slice();
          paintHand();
          paintActions();
        });
        el.querySelector('[data-a="pass"]')?.addEventListener('click', () => {
          sel = [];
          send('pass');
        });
        el.querySelector('[data-a="play"]')?.addEventListener('click', () => {
          if (!sel.length || r < 0) return;
          const cards = sel.slice();
          sel = [];
          const args = { cards };
          if (lead) args.rank = r;
          pick = -1;
          fx('place');
          send('play', args);
        });
        return;
      }
      if (vm.phase === 'play' && vm.turn >= 0) el.innerHTML = `<div class="pkr-wait">${esc(nameOf(vm.turn))} ${esc(tr('thinking', 'is thinking…'))}</div>`;
      else el.innerHTML = '';
    }

    function paintFoot() {
      const el = host.querySelector('[data-foot]');
      el.innerHTML = '';
      const log = (vm.log || []).slice(-3).reverse();
      if (!vm.over && log.length) {
        const line = log
          .map((e) => {
            if (e.k === 'pass') return nameOf(e.s) + ' ' + tr('passedW', 'passed');
            if (e.k === 'discard') return tr('setAsideLog', 'Everyone passed — pile set aside');
            if (e.k === 'out') return nameOf(e.s) + ' ' + tr('isOut', 'is out') + ' (#' + e.place + ')';
            if (e.k === 'lead' && e.r != null) return nameOf(e.s) + ' ' + tr('ledW', 'led') + ' ' + rankName(e.r, 2);
            return '';
          })
          .filter(Boolean)
          .slice(0, 2)
          .join(' · ');
        if (line) {
          const p = document.createElement('div');
          p.className = 'bl-log';
          p.textContent = line;
          el.appendChild(p);
        }
      }
      if (vm.over) {
        const ranks = (vm.ranking || []).map((i, k) => `<div class="tp-rank-row${i === vm.me ? ' is-me' : ''}"><span>${k + 1}. ${esc(nameOf(i))}</span><b>${vm.seats[i].n} ${esc(tr('left', 'left'))}</b></div>`);
        const box = document.createElement('div');
        box.className = 'tp-standings';
        box.innerHTML = `<div class="cl-sub">${esc(tr('standings', 'Standings'))}</div>${ranks.join('')}`;
        el.appendChild(box);
      }
      if (o.footer) {
        const box = document.createElement('div');
        el.appendChild(box);
        o.footer(vm, box);
      }
      const menu = o.menu ? o.menu() : [];
      if (menu.length) {
        const row = document.createElement('div');
        row.className = 'rm-menu';
        row.innerHTML = menu.map((m, i) => `<button type="button" class="pk-link" data-menu="${i}">${esc(m.label)}</button>`).join('');
        row.querySelectorAll('[data-menu]').forEach((b) => b.addEventListener('click', () => menu[Number(b.dataset.menu)].run()));
        el.appendChild(row);
      }
    }

    return {
      update(next) {
        const prevRank = vm ? vm.rank : null;
        vm = next;
        if (vm.rank >= 0 || prevRank !== vm.rank) pick = vm.rank >= 0 ? -1 : pick;
        const key = !vm.over && vm.me >= 0 && vm.phase === 'play' && vm.turn === vm.me ? String(vm.playNo) + ':' + vm.seq : '';
        if (key && !lastTurnKey) {
          fx('turn');
          if (vm.live && Kit() && typeof Kit().ding === 'function') Kit().ding();
        }
        lastTurnKey = key;
        paint();
      },
      get vm() {
        return vm;
      },
      get root() {
        return host;
      },
      destroy() {
        destroyed = true;
        clearInterval(barTimer);
      },
    };
  }

  function buildVm(pubSt, priv, extra) {
    const p = priv || {};
    const seat = p.seat != null && p.seat >= 0 ? Number(p.seat) : -1;
    return Object.assign({}, pubSt, { me: seat, hand: arr(p.hand).filter(Boolean), legal: p.legal || {} }, extra || {});
  }

  const ERRORS = {
    not_your_turn: 'Not your turn',
    window_open: 'Wait — the Bluff window is open',
    no_cards: 'Pick at least one card',
    too_many: 'Too many cards for one play',
    pick_rank: 'Pick a rank to claim',
    no_pass: 'No passing in Sequence — you must play',
    must_lead: 'You lead — play at least one card',
    too_late: 'Too late — someone called first',
  };

  // ---------------- practice vs bots ----------------

  function startLocal(opts) {
    const K = Kit();
    const C = Core();
    const s = Object.assign(loadSetup(), opts || {});
    const me = (K && K.myName()) || tr('you', 'You');
    const players = [{ id: 'me', name: me }];
    for (let i = 0; i < s.bots; i++) players.push({ id: 'bot' + (i + 1), name: tr('bot', 'Bot') + ' ' + (i + 1) + ' · ' + levelLabel(s.level), bot: true, level: s.level });
    const rng = CK().seededRng(CK().newSeed());
    const st = C.newGame(players, { style: s.style, windowSec: s.windowSec, jokers: s.jokers, placements: s.placements }, rng, { dealer: Math.floor(rng() * players.length) });
    const timers = [];
    let windowNo = 0;
    let windowEnds = 0;
    let recorded = false;
    const clearTimers = () => timers.splice(0).forEach((x) => clearTimeout(x));
    const later = (fn, ms) => timers.push(setTimeout(() => !shell.closed && fn(), ms));
    const shell = K.openShell({
      gameId: GAME,
      title: LABEL,
      subtitle: tr('practice', 'Practice') + ' · ' + styleLabel(s.style),
      confirmLeave: () => !st.over && st.playNo > 2,
      leaveBody: tr('leaveLocal', 'This practice game will end.'),
      onClose: () => {
        clearTimers();
        view.destroy();
      },
    });
    const host = shell.render('<div class="pk-page bl-page" data-bl></div>').querySelector('[data-bl]');

    function vmNow() {
      return buildVm(C.publicView(st), C.privateView(st, 0), { live: false, windowEndsLocal: windowEnds });
    }
    function refresh() {
      view.update(vmNow());
      schedule();
    }
    function armWindow() {
      windowNo = st.last.no;
      windowEnds = Date.now() + st.windowMs;
      const plan = C.windowPlan(st, rng);
      plan.letgo.forEach((i) => st.phase === 'window' && C.apply(st, i, { type: 'letgo', no: windowNo }));
      if (st.phase !== 'window') return;
      const no = windowNo;
      const humanCanCall = C.callers(st).indexOf(0) >= 0;
      if (plan.caller >= 0) later(() => st.phase === 'window' && st.last.no === no && (C.apply(st, plan.caller, { type: 'call', no }), refresh()), CK().ms(plan.delay));
      // No human to wait for (you played or you're out): close as soon as the bots have decided.
      const closeIn = humanCanCall ? st.windowMs : plan.caller >= 0 ? st.windowMs : 700;
      later(() => st.phase === 'window' && st.last.no === no && (C.apply(st, -1, { type: 'close' }), refresh()), CK().ms(closeIn));
    }
    function schedule() {
      if (st.over || shell.closed) return;
      if (st.phase === 'window' && st.last && st.last.no !== windowNo) {
        armWindow();
        view.update(vmNow());
        if (st.phase !== 'window') return schedule();
        return;
      }
      if (st.phase === 'reveal') {
        const no = st.reveal.no;
        later(() => st.phase === 'reveal' && st.reveal.no === no && (C.apply(st, -1, { type: 'resume' }), refresh()), CK().ms(2200));
        return;
      }
      if (st.phase === 'play' && st.seats[st.turn] && st.seats[st.turn].bot) {
        const turn = st.turn;
        const no = st.playNo;
        later(() => {
          if (st.phase !== 'play' || st.turn !== turn || st.playNo !== no) return;
          const out = C.apply(st, turn, C.botAction(st, turn, rng) || C.autoAction(st, turn));
          if (out.error) C.apply(st, turn, C.autoAction(st, turn));
          refresh();
        }, CK().ms(900));
      }
    }
    function act(type, args) {
      const out = C.apply(st, 0, Object.assign({ type }, args || {}));
      if (out.error) {
        fx('invalid');
        toast(ERRORS[out.error] || tr('notNow', 'Not now'));
        return out;
      }
      refresh();
      return out;
    }

    const view = createTable(host, {
      act,
      footer(vm, el) {
        if (!st.over) return;
        const won = st.winner === 0;
        if (!recorded) {
          recorded = true;
          fx(won ? 'win' : 'lose');
          if (typeof recordGameResult === 'function') recordGameResult(GAME, won, false, { mode: 'practice', level: s.level, style: s.style });
        }
        const place = st.seats[0].place || st.ranking.indexOf(0) + 1;
        el.innerHTML = `<div class="cl-result"><div class="rm-result-line">${esc(won ? tr('youWon', 'You emptied your hand — you win!') : tr('placeN', 'You finished') + ' #' + place)}</div>
          <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-again>${esc(tr('again', 'Play again'))}</button>
          <div class="pk-row"><button type="button" class="pk-btn pk-btn--ghost" data-home>${esc(tr('change', 'Change table'))}</button></div></div>`;
        el.querySelector('[data-again]').addEventListener('click', () => K.closeThen(shell, () => startLocal(s)));
        el.querySelector('[data-home]').addEventListener('click', () => K.closeThen(shell, () => openHome({})));
      },
      menu: () => [{ label: tr('rules', 'Rules'), run: () => openRules(s) }],
    });
    refresh();
  }

  function openRules(s) {
    const v = s || {};
    if (window.DangalRules && window.DangalRules.openSheet) window.DangalRules.openSheet(GAME, { variants: { style: v.style || 'sequence', windowSec: Number(v.windowSec) || 5, jokers: !!v.jokers, placements: !!v.placements } });
  }

  function setupHtml(K, s, o) {
    const live = !!(o && o.live);
    const botChoices = live ? [[0, tr('none0', 'None')], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6'], [7, '7']] : [[2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6'], [7, '7']];
    return `<div class="cl-setup">
      <div class="cl-sub">${esc(tr('styleT', 'Style'))}</div>${K.segHtml('style', s.style, [['sequence', styleLabel('sequence')], ['follow', styleLabel('follow')]])}
      <p class="cl-note" data-snote>${esc(styleNote(s.style))}</p>
      <div class="cl-sub">${esc(tr('botsN', 'Bots'))}</div>${K.segHtml('bots', s.bots, botChoices)}
      <div data-lvl><div class="cl-sub">${esc(tr('botLevel', 'Bot level'))}</div>${K.segHtml(live ? 'botLevel' : 'level', live ? s.botLevel : s.level, LEVELS.map((l) => [l, levelLabel(l)]))}</div>
      <details class="cl-more"><summary>${esc(tr('more', 'More'))}</summary>
        <div class="cl-sub">${esc(tr('windowT', 'Bluff window'))}</div>${K.segHtml('windowSec', s.windowSec, [[3, '3s'], [5, '5s'], [8, '8s']])}
        <div class="cl-sub">${esc(tr('jokersT', 'Jokers wild'))}</div>${K.segHtml('jokers', s.jokers ? 1 : 0, [[0, tr('off', 'Off')], [1, tr('on', 'On')]])}
        <div class="cl-sub">${esc(tr('placesT', 'After the first player is out'))}</div>${K.segHtml('placements', s.placements ? 1 : 0, [[0, tr('stopWin', 'Game ends')], [1, tr('playOn', 'Play on for places')]])}
        ${live ? `<div data-stake><div class="cl-sub">${esc(tr('stakeT', 'Stake (all-human tables)'))}</div>${K.segHtml('stake', s.stake || 0, STAKES.map((n) => [n, n ? '⚡' + n : tr('noStake', 'None')]))}</div>` : ''}
      </details>
      <p class="cl-note" data-note></p>
      <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-go>${esc(live ? tr('save', 'Save') : tr('start', 'Start'))}</button>
    </div>`;
  }

  function openLocalSheet(onGo) {
    const K = Kit();
    const s = loadSetup();
    K.openSheet({
      title: tr('setupTitle', 'Practice table'),
      bodyHtml: setupHtml(K, s),
      onMount(el, close) {
        const paint = () => {
          el.querySelector('[data-snote]').textContent = styleNote(s.style);
          el.querySelector('[data-note]').textContent = Number(s.bots) + 1 >= 6 ? tr('twoDeckNote', 'Six or more players: two decks, up to 6 cards per play.') : '';
        };
        paint();
        K.wireSegs(el, s, paint);
        el.querySelector('[data-go]').addEventListener('click', () => {
          s.bots = Number(s.bots);
          s.windowSec = Number(s.windowSec);
          s.jokers = Number(s.jokers) === 1 || s.jokers === true;
          s.placements = Number(s.placements) === 1 || s.placements === true;
          writeJson(SETUP_KEY, s);
          close();
          setTimeout(() => onGo(Object.assign({}, s)), 80);
        });
      },
    });
  }

  // ---------------- Live room ----------------

  function roomSettings(ctrl) {
    return Object.assign({ style: 'sequence', windowSec: 5, jokers: false, placements: false, bots: 0, botLevel: 'normal', stake: 0 }, (ctrl.view.pub && ctrl.view.pub.settings) || {});
  }
  function lobbySummary(ctrl) {
    const s = roomSettings(ctrl);
    const bits = [styleLabel(s.style), s.windowSec + 's ' + tr('windowShort', 'window')];
    if (Number(s.bots) > 0) bits.push(s.bots + ' ' + (Number(s.bots) === 1 ? tr('botOne', 'bot') : tr('botMany', 'bots')) + ' · ' + levelLabel(s.botLevel));
    else if (Number(s.stake)) bits.push('⚡' + s.stake);
    if (s.jokers) bits.push(tr('jokersWild', 'jokers wild'));
    return bits.join(' · ');
  }
  function canStart(ctrl, players) {
    const s = roomSettings(ctrl);
    const total = players.length + (Number(s.bots) || 0);
    if (total < 3) return { ok: false, label: tr('needThree', 'Needs 3 players — invite friends or add bots') };
    if (total > 8) return { ok: false, label: tr('tooMany', 'Up to 8 seats — fewer bots') };
    return { ok: true, label: tr('deal', 'Deal') };
  }
  function openRoomSettings(ctrl) {
    const K = Kit();
    const cur = roomSettings(ctrl);
    K.openSheet({
      title: tr('roomSettings', 'Table settings'),
      bodyHtml: setupHtml(K, cur, { live: true }),
      onMount(el, close) {
        const paint = () => {
          el.querySelector('[data-snote]').textContent = styleNote(cur.style);
          el.querySelector('[data-lvl]').hidden = !(Number(cur.bots) > 0);
          const st = el.querySelector('[data-stake]');
          if (st) st.hidden = Number(cur.bots) > 0;
          el.querySelector('[data-note]').textContent = Number(cur.bots) > 0 ? tr('botNote', 'Bots are labelled. With bots at the table there’s no stake.') : Number(cur.stake) ? tr('stakeNote', 'Everyone antes the stake; chips go by finishing place. Virtual chips only.') : '';
        };
        paint();
        K.wireSegs(el, cur, paint);
        el.querySelector('[data-go]').addEventListener('click', async () => {
          const out = await ctrl.act('settings', {
            settings: Object.assign({}, cur, {
              bots: Number(cur.bots) || 0,
              windowSec: Number(cur.windowSec) || 5,
              stake: Number(cur.bots) > 0 ? 0 : Number(cur.stake) || 0,
              jokers: Number(cur.jokers) === 1 || cur.jokers === true,
              placements: Number(cur.placements) === 1 || cur.placements === true,
            }),
          });
          if (out) close();
        });
      },
    });
  }

  function hydratePub(raw) {
    return Core().hydratePublic(clone(raw || {}));
  }
  const LIVE_ERRORS = ['NOT_YOUR_TURN', 'WINDOW_OPEN', 'PHASE', 'NO_CARDS', 'TOO_MANY', 'NO_CARD', 'WRONG_RANK', 'PICK_RANK', 'NO_PASS', 'MUST_LEAD', 'TOO_LATE', 'OWN_PLAY', 'NOT_IN_GAME', 'OVER'];
  function errorText(e) {
    const code = String((e && e.code) || '').toUpperCase();
    if (LIVE_ERRORS.indexOf(code) >= 0 && e.message) return e.message;
    return Kit().roomErrorText(e);
  }

  function renderLive(ctrl, st) {
    const pub = ctrl.view.pub;
    const sec = ctrl.view.secret;
    const secOk = sec && Number(sec.roundNo) === Number(pub.roundNo);
    const fallbackSeat = st.seats.findIndex((x) => x.id === ctrl.uid && !x.bot);
    const offset = ctrl.conn && ctrl.conn.serverNow ? ctrl.conn.serverNow() - Date.now() : 0;
    const vm = buildVm(st, secOk ? sec : { seat: fallbackSeat }, { live: true, stake: Number(st.stake) || 0, windowEndsLocal: st.windowEnds ? st.windowEnds - offset : 0 });
    const mounted = ctrl.bl && ctrl.bl.round === pub.roundNo && ctrl.shell.el.contains(ctrl.bl.view.root);
    if (!mounted) {
      if (ctrl.bl) ctrl.bl.view.destroy();
      const host = ctrl.render('<div class="pk-page bl-page" data-bl></div>').querySelector('[data-bl]');
      const view = createTable(host, {
        act: (type, args) => ctrl.act(type, args),
        onHud: (el) => {
          if (ctrl.timer) ctrl.timer.stop();
          ctrl.timer = null;
          ctrl.wire(el);
        },
        footer: (v, el) => liveFooter(ctrl, v, el),
        menu: () => [{ label: tr('rules', 'Rules'), run: () => openRules(roomSettings(ctrl)) }],
      });
      ctrl.bl = { round: pub.roundNo, view };
      if (!ctrl.blWrapped) {
        ctrl.blWrapped = true;
        const close = ctrl.shell.close;
        ctrl.shell.close = function () {
          if (ctrl.bl) ctrl.bl.view.destroy();
          return close.apply(this, arguments);
        };
      }
    }
    ctrl.bl.view.update(vm);
  }

  function liveFooter(ctrl, vm, el) {
    if (!vm.over) return;
    const pub = ctrl.view.pub;
    const set = pub.settlement;
    const r = set && set.results && set.results[ctrl.uid];
    if (ctrl.blFx !== pub.roundNo && vm.me >= 0) {
      ctrl.blFx = pub.roundNo;
      const won = vm.winner === vm.me;
      fx(won ? 'win' : 'lose');
      if (typeof recordGameResult === 'function') recordGameResult(GAME, won, false, { live: true, style: vm.style });
    }
    const bits = [];
    if (r && r.chipDelta) bits.push(`<div class="cl-result-chips ${r.chipDelta > 0 ? 'is-up' : 'is-down'}">${r.chipDelta > 0 ? '+' : ''}${r.chipDelta} ${esc(tr('chips', 'virtual chips'))}</div>`);
    if (set && set.status === 'pending') bits.push(`<div class="pkr-wait">${esc(tr('settling', 'Recording the result…'))}</div>`);
    el.innerHTML = `<div class="cl-result">${bits.join('')}
      ${Kit().roomResultActions(ctrl, { nextLabel: tr('newGame', 'New game'), waitLabel: tr('waitNew', 'Waiting for the host…') })}</div>`;
    Kit().wireRoomResultActions(ctrl, el, { nextOp: 'start', onShare: () => CK().shareWin(GAME, LABEL, vm.winner === vm.me ? tr('shareWin', 'I emptied my hand first') : tr('shareDone', 'Bluff game done')) });
  }

  async function openRoom(code, opts) {
    const K = Kit();
    const o = opts || {};
    return K.openRoomScreen({
      game: GAME,
      label: LABEL,
      code,
      join: !!o.join,
      min: 1,
      max: 8,
      hydrate: hydratePub,
      lobbySummary,
      openSettings: openRoomSettings,
      canStart,
      errorText,
      renderPhase: renderLive,
      onLobbyMount(ctrl) {
        if (ctrl.bl) {
          ctrl.bl.view.destroy();
          ctrl.bl = null;
        }
      },
    });
  }

  function createRoom(chat, settings) {
    const s0 = loadSetup();
    const s = Object.assign({ style: s0.style, windowSec: s0.windowSec, jokers: s0.jokers, placements: s0.placements, bots: 0, botLevel: 'normal', stake: 0 }, settings || {});
    Kit().createRoom({ game: GAME, label: LABEL, chat: chat || null, settings: s, open: (code) => openRoom(code, {}) });
  }

  // ---------------- home ----------------

  function openHome(o) {
    const K = Kit();
    const opts = o || {};
    const s = loadSetup();
    const shell = K.openShell({ gameId: GAME, title: LABEL, subtitle: tr('sub', 'Cards · 3–8 players') });
    shell.render(`<div class="pk-page pk-home">
      <div class="pk-hero">
        <div class="pk-hero-mark">${typeof gameMarkHtml === 'function' ? gameMarkHtml(GAME, { size: 64 }) : '🎭'}</div>
        <div class="pk-hero-title">${esc(LABEL)}</div>
        <div class="pk-hero-sub">${esc(tr('tag', 'Play cards face down and say what they are. Call “Bluff!” when you smell a lie. First to empty their hand wins.'))}</div>
      </div>
      <div class="pk-modes">
        <button type="button" class="pk-mode pk-mode--primary" data-go="bot"><span class="pk-mode-title">${esc(tr('vsBots', 'Practice vs bots'))}</span><span class="pk-mode-sub">${esc(styleLabel(s.style) + ' · ' + s.bots + ' ' + tr('botMany', 'bots') + ' · ' + levelLabel(s.level))}</span></button>
        <button type="button" class="pk-mode" data-go="friends"><span class="pk-mode-title">${esc(tr('friends', 'Play friends'))}</span><span class="pk-mode-sub">${esc(tr('friendsSub', 'Live table for 3–8 · bots can fill seats'))}</span></button>
        <div class="cl-home-links">
          <button type="button" class="pk-link" data-go="change">${esc(tr('change', 'Change table'))}</button>
          <button type="button" class="pk-link" data-go="join">${esc(tr('join', 'Have a table code? Join'))}</button>
          <button type="button" class="pk-link" data-go="rules">${esc(tr('rules', 'Rules'))}</button>
        </div>
      </div>
    </div>`);
    const b = shell.body;
    b.querySelector('[data-go="bot"]').addEventListener('click', () => K.closeThen(shell, () => startLocal(loadSetup())));
    b.querySelector('[data-go="change"]').addEventListener('click', () => openLocalSheet((x) => K.closeThen(shell, () => startLocal(x))));
    b.querySelector('[data-go="friends"]').addEventListener('click', () => {
      if (!K.requireSignIn()) return;
      createRoom(opts.chat);
    });
    b.querySelector('[data-go="join"]').addEventListener('click', () => K.openJoinSheet((code) => K.closeThen(shell, () => openRoom(code, { join: true }))));
    b.querySelector('[data-go="rules"]').addEventListener('click', () => openRules(s));
  }

  function launch(ctx) {
    const c = ctx || {};
    if (!Core() || !Kit() || !CK()) return toast(tr('loading', 'Bluff is still loading — try again'));
    const chat = typeof chatFromLaunch === 'function' ? chatFromLaunch(c) : c.chat;
    const inChat = chat && chat.id && chat.id !== 'ai' && (c.source === 'chat' || c.source === 'baithak' || chat.type === 'group' || chat.isGroup);
    if (c.practiceKind === 'vsAi' || c.mode === 'practice') return startLocal(loadSetup());
    if (inChat && Kit().isSignedIn()) return createRoom(chat);
    return openHome({ chat });
  }

  const lazy = (fn) => (Kit() && typeof Kit().withGameData === 'function' ? Kit().withGameData(GAME, fn) : fn);
  const openGame = lazy(launch);

  if (Kit() && typeof Kit().registerPartyGame === 'function') {
    Kit().registerPartyGame(GAME, { openRoom: (code, o) => lazy(openRoom)(code, { join: !!(o && o.join) }) });
  }
  if (typeof registerGame === 'function') {
    registerGame({
      id: 'bluff',
      name: 'Bluff',
      desc: 'Face-down claims · call Bluff! · 3–8 players · bots',
      icon: '🎭',
      gameType: 'dual',
      genre: 'cards',
      dangal: true,
      liveDuel: true,
      chat1v1: true,
      selfChat: true,
      ownHome: true,
      order: 35,
      meta: {
        core: 'bluff-core.js (Sequence + Follow the rank, challenge window, bots — shared with the server)',
        live: 'party_room → server-lib/bluff-engine.js; server deal, face-down cards never leave the server, timed Bluff window race',
      },
      launch: openGame,
    });
  }

  window.BluffGame = { launch: openGame, openHome: lazy(openHome), openRoom: lazy(openRoom), startLocal: lazy(startLocal), _buildVm: buildVm };
  window.openBluff = function (ctx) {
    openGame(Object.assign({ source: 'manch', mode: 'home' }, ctx || {}));
  };
})();
