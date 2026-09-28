/**
 * Tambola (Dangal P9) — 90-ball Tambola / Housie and 75-ball Bingo for 2 to 100+ players.
 *   Host a game: private party room (Baithak / Mehfil / invite link) — just for fun or table chips.
 *   Public table: wallet chip tickets, 18+, starts itself after a short countdown, bots fill seats.
 *   Practice: you vs bots on this phone.
 *   Caller mode: run the draw for people in the same room — offline, no sign-in, printable tickets
 *   and "Check a ticket".
 * Draws, tickets and claims in rooms are server-side (server-lib/tambola-engine.js). Marks (daubs) are
 * yours and stay on this phone.
 */
(function () {
  'use strict';

  const GAME = 'tambola';
  const LABEL = 'Tambola';
  const SETUP_KEY = 'chaupaal_tambola_setup';
  const PREFS_KEY = 'chaupaal_tambola_prefs';
  const CALLER_KEY = 'chaupaal_tambola_caller';
  const Core = () => window.TambolaCore;
  const CK = () => window.ClassicsKit;
  const Kit = () => window.PartyKit;
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  function tr(key, fallback) {
    return typeof t === 'function' ? t('tambola.' + key, fallback) : fallback;
  }
  const clone = (x) => JSON.parse(JSON.stringify(x));
  function toast(msg) {
    if (typeof showToast === 'function') showToast(msg);
  }
  const readJson = (k, fb) => {
    if (CK()) return CK().readJson(k, fb);
    try {
      return JSON.parse(localStorage.getItem(k)) || fb;
    } catch (e) {
      return fb;
    }
  };
  const writeJson = (k, v) => {
    if (CK()) return CK().writeJson(k, v);
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {}
  };
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
  const fmtClock = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };

  // ---------------- prefs + voice ----------------

  function prefs() {
    return Object.assign({ voice: true, traditional: false, autoDaub: false }, readJson(PREFS_KEY, {}));
  }
  function savePrefs(p) {
    writeJson(PREFS_KEY, p);
  }
  function lang() {
    const l = (typeof currentLanguage === 'function' && currentLanguage()) || document.documentElement.lang || navigator.language || 'en';
    return String(l);
  }
  /** Caller voice (Web Speech API): English by default; other locales read the number in their own voice. */
  function speak(n, variant, force) {
    const p = prefs();
    if (!force && !p.voice) return;
    if (typeof window === 'undefined' || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') return;
    const l = lang();
    const english = /^en/i.test(l);
    const text = Core().callText(n, variant, english && p.traditional);
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = l;
      u.rate = 0.95;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }

  function loadSetup() {
    const s = Object.assign({ variant: '90', pace: 8, tickets: 1, bots: 5, prizes: null, daub: 'manual', bogey: 'block', mode: 'fun', price: 10, maxTickets: 6, mask: 0x1f }, readJson(SETUP_KEY, {}));
    s.variant = s.variant === '75' ? '75' : '90';
    return s;
  }
  const prizeTable = (variant) => (variant === '75' ? Core().PRIZES_75 : Core().PRIZES_90);
  const prizeLabel = (variant, key) => tr('p.' + key, (prizeTable(variant)[key] || { label: key }).label);

  async function adultOk() {
    if (typeof ageGateStatus !== 'function' || ageGateStatus() === 'ok') return true;
    return typeof openAgeGateSheet === 'function' ? openAgeGateSheet(GAME) : false;
  }

  // ---------------- tickets ----------------

  function ticketHtml(variant, g, o) {
    const opt = o || {};
    const marks = opt.marks || new Set();
    const called = opt.called || new Set();
    const cells = Core().unpack(g);
    const cls = 'tb-ticket' + (variant === '75' ? ' tb-ticket--75' : '') + (opt.blocked ? ' is-blocked' : '') + (opt.small ? ' is-small' : '');
    let head = '';
    if (variant === '75') head = `<div class="tb-bingo-head">${Core().LETTERS.map((l) => `<span>${l}</span>`).join('')}</div>`;
    const body = cells
      .map((n, i) => {
        if (variant === '75' && i === 12) return `<span class="tb-cell is-free is-marked" aria-label="${esc(tr('free', 'Free'))}">★</span>`;
        if (!n) return '<span class="tb-cell is-blank" aria-hidden="true"></span>';
        const m = marks.has(n);
        const c = called.has(n);
        return `<button type="button" class="tb-cell${m ? ' is-marked' : ''}${c && !m && opt.hint ? ' is-called' : ''}" data-n="${n}" aria-pressed="${m}" ${opt.readOnly ? 'tabindex="-1"' : ''}>${n}</button>`;
      })
      .join('');
    return `<div class="${cls}" data-ticket="${opt.index != null ? opt.index : ''}">${opt.title ? `<div class="tb-ticket-title">${esc(opt.title)}</div>` : ''}${head}<div class="tb-grid">${body}</div>${opt.blocked ? `<div class="tb-blocked">${esc(opt.blocked)}</div>` : ''}</div>`;
  }

  function boardHtml(variant, called, last) {
    const set = new Set(called);
    const total = variant === '75' ? 75 : 90;
    const cells = [];
    for (let n = 1; n <= total; n++) cells.push(`<span class="tb-bn${set.has(n) ? ' is-on' : ''}${n === last ? ' is-last' : ''}">${n}</span>`);
    return `<div class="tb-board${variant === '75' ? ' tb-board--75' : ''}" aria-label="${esc(tr('boardAria', 'Called numbers'))}">${cells.join('')}</div>`;
  }

  // ---------------- game view (practice + Live) ----------------

  /**
   * vm = { st: TambolaCore.publicView, tickets: packed[], blocked: ['t:key'], warned, result, me, live,
   *        isHost, paused, daubKey, pending? }
   * @param {HTMLElement} host
   * @param {{ claim: (key, t) => Promise<any>, host?: { pause, resume, pace, end }, footer?: (vm, el) => void, onHud?: (el) => void }} o
   */
  function createGame(host, o) {
    host.innerHTML = `<div class="tb-wrap">
      <div class="tb-top"><div class="tb-status" data-status aria-live="polite"></div><button type="button" class="pkr-icon-btn" data-prefs aria-label="${esc(tr('prefs', 'Sound and marking'))}">🔊</button></div>
      <div class="tb-now" data-now></div>
      <div class="tb-tickets" data-tickets></div>
      <div class="tb-prizes" data-prizes></div>
      <details class="tb-board-wrap" data-boardwrap><summary>${esc(tr('board', 'Board'))} <span data-count></span></summary><div data-board></div></details>
      <div class="tb-hostbar" data-hostbar></div>
      <div class="tb-foot" data-foot></div>
    </div>`;
    let vm = null;
    let destroyed = false;
    let busy = false;
    let lastCalled = 0;
    let marks = {};
    let marksKey = '';
    let nextTimer = null;
    const P = () => prefs();

    host.querySelector('[data-prefs]').addEventListener('click', () => openPrefs(() => paint()));

    function loadMarks() {
      if (!vm || vm.daubKey === marksKey) return;
      marksKey = vm.daubKey;
      const raw = readJson('chaupaal_tambola_daubs', {});
      marks = raw && raw.key === marksKey && raw.marks ? raw.marks : {};
    }
    function saveMarks() {
      writeJson('chaupaal_tambola_daubs', { key: marksKey, marks });
    }
    const autoDaub = () => (vm && vm.st.daub === 'auto') || P().autoDaub;
    function marksFor(t) {
      const called = new Set(vm.st.called);
      if (autoDaub()) return new Set(Core().unpack(vm.tickets[t]).filter((n) => n && called.has(n)));
      return new Set(arr(marks[t]).filter((n) => called.has(n)));
    }

    function blockedFor(t, key) {
      return (vm.blocked || []).indexOf(t + ':' + key) >= 0;
    }

    function statusLine() {
      const st = vm.st;
      if (st.over) return tr('gameOver', 'Game over');
      const bits = [st.variant === '75' ? tr('bingo75', '75-ball Bingo') : tr('tambola90', 'Tambola')];
      bits.push(st.count + '/' + st.total);
      if (st.players > 1) bits.push(st.players + ' ' + tr('players', 'players'));
      if (st.mode !== 'fun' && st.pot) bits.push(tr('pot', 'Pot') + ' ⚡' + st.pot);
      return bits.join(' · ');
    }

    function nowHtml() {
      const st = vm.st;
      const last = st.called[st.called.length - 1];
      const recent = st.called.slice(-6, -1).reverse();
      const label = last ? (st.variant === '75' ? Core().letter75(last) + ' ' + last : String(last)) : '—';
      return `<div class="tb-ball${last && last !== lastCalled ? ' is-new' : ''}" aria-label="${esc(tr('lastNumber', 'Last number'))} ${esc(label)}">${esc(label)}</div>
        <div class="tb-recent">${recent.map((n) => `<span>${n}</span>`).join('')}</div>
        ${!st.over ? `<div class="tb-next">${vm.paused ? esc(tr('paused', 'Paused')) : `${esc(tr('next', 'Next in'))} <span data-next></span>`}</div>` : ''}`;
    }

    function ticketsHtml() {
      if (vm.me < 0 || !vm.tickets.length) return `<p class="pkr-wait">${esc(vm.pendingNote || tr('watching', 'Watching — you’ll get tickets next game'))}</p>`;
      const called = new Set(vm.st.called);
      return vm.tickets
        .map((g, t) => {
          const allBlocked = vm.st.prizes.every((p) => blockedFor(t, p.key) || p.status !== 'open');
          const some = vm.st.prizes.filter((p) => blockedFor(t, p.key)).map((p) => p.label);
          return ticketHtml(vm.st.variant, g, {
            index: t,
            marks: marksFor(t),
            called,
            title: vm.tickets.length > 1 ? tr('ticket', 'Ticket') + ' ' + (t + 1) : '',
            blocked: some.length ? tr('blockedFor', 'Blocked for') + ': ' + some.join(', ') : '',
            readOnly: autoDaub() || vm.st.over || allBlocked,
          });
        })
        .join('');
    }

    function winnersText(p) {
      if (!p.winners.length) return '';
      const names = p.winners.map((w) => (w.seat === vm.me ? tr('you', 'You') : w.name)).join(' & ');
      return names + (p.winners.length > 1 ? ' · ' + tr('shared', 'shared') : '');
    }

    function prizesHtml() {
      const st = vm.st;
      const weight = st.prizes.reduce((a, p) => a + (p.share || 0), 0) || 1;
      return `<div class="tb-prize-list">${st.prizes
        .map((p) => {
          const tie = p.status === 'won' && Date.now() - (p.firstAtLocal || 0) < Core().TIE_MS;
          const can = vm.me >= 0 && vm.tickets.length && !st.over && (Core().claimable(st, p) || tie) && !p.winners.some((w) => w.seat === vm.me);
          const worth = st.mode === 'fun' ? p.share + ' ' + tr('pts', 'pts') : '⚡' + Math.floor((st.pot * (p.share || 0)) / weight);
          const allBlocked = vm.tickets.length && vm.tickets.every((g, t) => blockedFor(t, p.key));
          const ready = can && vm.tickets.some((g, t) => !blockedFor(t, p.key) && Core().prizeDone(st.variant, p.key, Core().unpack(g), [...marksFor(t)], st.mask));
          const right = p.winners.length
            ? `<span class="tb-won">${esc(winnersText(p))}</span>`
            : allBlocked
              ? `<span class="tb-blk">${esc(tr('blocked', 'Blocked'))}</span>`
              : can
                ? `<button type="button" class="tb-claim${ready ? ' is-ready' : ''}" data-claim="${esc(p.key)}" ${busy ? 'disabled' : ''}>${esc(tr('claim', 'Claim'))}</button>`
                : `<span class="tb-wait">${esc(p.status === 'open' ? tr('notYet', 'Opens later') : '')}</span>`;
          return `<div class="tb-prize${p.status !== 'open' ? ' is-done' : ''}"><div class="tb-prize-name">${esc(p.label)}<small>${esc(worth)}</small></div>${right}</div>`;
        })
        .join('')}</div>`;
    }

    function paintNext() {
      clearInterval(nextTimer);
      const el = host.querySelector('[data-next]');
      if (!el || !vm.nextAtLocal) return;
      const tick = () => {
        const ms = vm.nextAtLocal - Date.now();
        el.textContent = ms > 0 ? Math.ceil(ms / 1000) + 's' : '…';
      };
      tick();
      nextTimer = setInterval(tick, 250);
    }

    function paint() {
      if (destroyed || !vm) return;
      loadMarks();
      const st = vm.st;
      host.querySelector('[data-status]').textContent = statusLine();
      host.querySelector('[data-now]').innerHTML = nowHtml();
      host.querySelector('[data-tickets]').innerHTML = ticketsHtml();
      host.querySelector('[data-prizes]').innerHTML = prizesHtml();
      host.querySelector('[data-count]').textContent = st.count + '/' + st.total;
      host.querySelector('[data-board]').innerHTML = boardHtml(st.variant, st.called, st.called[st.called.length - 1]);
      const hb = host.querySelector('[data-hostbar]');
      if (o.host && vm.isHost && !st.over) {
        hb.innerHTML = `<button type="button" class="pk-chip" data-h="${vm.paused ? 'resume' : 'pause'}">${esc(vm.paused ? tr('resume', 'Resume') : tr('pause', 'Pause'))}</button>
          ${Core()
            .PACES.map((p) => `<button type="button" class="pk-chip${Math.round(st.paceMs / 1000) === p ? ' is-on' : ''}" data-pace="${p}">${p}s</button>`)
            .join('')}
          <button type="button" class="pk-chip" data-h="end">${esc(tr('endGame', 'End game'))}</button>`;
        hb.querySelectorAll('[data-h]').forEach((b) =>
          b.addEventListener('click', () => {
            if (b.dataset.h === 'end') {
              if (confirm(tr('endConfirm', 'End this game now? Prizes not yet won go back to the players.'))) o.host.end();
            } else o.host[b.dataset.h]();
          })
        );
        hb.querySelectorAll('[data-pace]').forEach((b) => b.addEventListener('click', () => o.host.pace(Number(b.dataset.pace))));
      } else hb.innerHTML = '';
      wire();
      paintNext();
      paintFoot();
    }
    function wire() {
      host.querySelectorAll('.tb-cell[data-n]').forEach((b) =>
        b.addEventListener('click', () => {
          if (autoDaub() || vm.st.over) return;
          const tEl = b.closest('[data-ticket]');
          const t = Number(tEl && tEl.dataset.ticket);
          const n = Number(b.dataset.n);
          if (vm.st.called.indexOf(n) < 0) {
            b.classList.remove('is-nope');
            void b.offsetWidth;
            b.classList.add('is-nope');
            fx('invalid');
            return;
          }
          const list = arr(marks[t]);
          const k = list.indexOf(n);
          if (k >= 0) list.splice(k, 1);
          else list.push(n);
          marks[t] = list;
          saveMarks();
          fx('tap');
          paint();
        })
      );
      host.querySelectorAll('[data-claim]').forEach((b) => b.addEventListener('click', () => claim(b.dataset.claim)));
    }

    async function claim(key) {
      if (busy) return;
      const variant = vm.st.variant;
      const mask = vm.st.mask;
      const open = vm.tickets.map((g, t) => t).filter((t) => !blockedFor(t, key));
      if (!open.length) return toast(tr('allBlocked', 'Your tickets are blocked for this prize'));
      const byMarks = open.find((t) => Core().prizeDone(variant, key, Core().unpack(vm.tickets[t]), [...marksFor(t)], mask));
      let t = byMarks;
      if (t == null) {
        const ok = confirm(tr('claimAnyway', 'Your marks don’t show this prize yet. Claim anyway? A wrong claim (bogey) blocks that ticket for this prize.'));
        if (!ok) return;
        t = open[0];
      }
      busy = true;
      paint();
      try {
        const out = await o.claim(key, t);
        if (out && out.bogey) {
          fx('lose');
          toast(out.warned ? tr('bogeyWarn', 'Bogey! Not complete yet — this is your warning. Next time the ticket is blocked.') : tr('bogeyBlock', 'Bogey! Not complete — that ticket is blocked for this prize.'));
        } else if (out && out.won) {
          fx('win');
          toast(out.tie ? tr('tieWin', 'Valid — you share the prize!') : tr('youWon', 'Valid claim — you win it!'));
        }
      } finally {
        busy = false;
        if (!destroyed) paint();
      }
    }

    function paintFoot() {
      const el = host.querySelector('[data-foot]');
      el.innerHTML = '';
      const log = (vm.st.log || []).slice(-3).reverse();
      if (log.length && !vm.st.over) {
        const p = document.createElement('div');
        p.className = 'tb-log';
        p.textContent = log
          .map((e) => {
            const who = e.s === vm.me ? tr('you', 'You') : e.name;
            const lab = (vm.st.prizes.find((x) => x.key === e.key) || {}).label || e.key;
            if (e.k === 'bogey') return who + ': ' + tr('bogeyOn', 'bogey on') + ' ' + lab;
            if (e.k === 'tie') return who + ' ' + tr('sharesW', 'shares') + ' ' + lab;
            return who + ' ' + tr('winsW', 'wins') + ' ' + lab;
          })
          .join(' · ');
        el.appendChild(p);
      }
      if (o.footer) {
        const box = document.createElement('div');
        el.appendChild(box);
        o.footer(vm, box);
      }
    }

    return {
      update(next) {
        const prev = vm;
        vm = next;
        const last = vm.st.called[vm.st.called.length - 1];
        if (last && last !== lastCalled && prev) speak(last, vm.st.variant);
        paint();
        lastCalled = last || 0;
      },
      get root() {
        return host;
      },
      get vm() {
        return vm;
      },
      destroy() {
        destroyed = true;
        clearInterval(nextTimer);
        try {
          window.speechSynthesis && window.speechSynthesis.cancel();
        } catch (e) {}
      },
    };
  }

  function openPrefs(onDone) {
    const K = Kit();
    const p = prefs();
    K.openSheet({
      title: tr('prefs', 'Sound and marking'),
      bodyHtml: `<div class="cl-setup">
        <div class="cl-sub">${esc(tr('voice', 'Caller voice'))}</div>${K.segHtml('voice', p.voice ? 1 : 0, [[1, tr('on', 'On')], [0, tr('off', 'Off')]])}
        <div class="cl-sub">${esc(tr('traditional', 'Traditional calls'))}</div>${K.segHtml('traditional', p.traditional ? 1 : 0, [[0, tr('plain', 'Numbers only')], [1, tr('tradEx', '“Two little ducks, 22”')]])}
        <div class="cl-sub">${esc(tr('marking', 'Marking'))}</div>${K.segHtml('autoDaub', p.autoDaub ? 1 : 0, [[0, tr('tapMark', 'Tap to mark')], [1, tr('autoMark', 'Auto-mark')]])}
        <p class="cl-note">${esc(tr('prefsNote', 'Traditional calls are in English; other languages read the number.'))}</p>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-go>${esc(tr('done', 'Done'))}</button>
      </div>`,
      onMount(el, close) {
        const cur = { voice: p.voice ? 1 : 0, traditional: p.traditional ? 1 : 0, autoDaub: p.autoDaub ? 1 : 0 };
        K.wireSegs(el, cur, () => {});
        el.querySelector('[data-go]').addEventListener('click', () => {
          savePrefs({ voice: Number(cur.voice) === 1, traditional: Number(cur.traditional) === 1, autoDaub: Number(cur.autoDaub) === 1 });
          close();
          if (onDone) onDone();
        });
      },
    });
  }

  // ---------------- practice vs bots ----------------

  function startLocal(opts) {
    const K = Kit();
    const C = Core();
    const s = Object.assign(loadSetup(), opts || {});
    const me = (K && K.myName()) || tr('you', 'You');
    const players = [{ id: 'me', name: me, tickets: Math.max(1, Math.min(6, Number(s.tickets) || 1)) }];
    const bots = Math.max(1, Math.min(12, Number(s.bots) || 5));
    for (let i = 0; i < bots; i++) players.push({ id: 'bot' + i, name: C.botName(i), bot: true, tickets: 1 + (i % 2) });
    const rng = CK().seededRng(CK().newSeed());
    const set = C.mergeSettings({ variant: s.variant, pace: s.pace, prizes: s.prizes, daub: s.daub, bogey: s.bogey, mask: s.mask }, true);
    const st = C.newGame(players, set, rng, Date.now());
    const key = 'practice_' + Date.now();
    let timer = null;
    let paused = false;
    let pausedAt = 0;
    let recorded = false;
    const shell = K.openShell({
      gameId: GAME,
      title: LABEL,
      subtitle: tr('practice', 'Practice') + ' · ' + (s.variant === '75' ? tr('bingo75', '75-ball Bingo') : tr('tambola90', 'Tambola')),
      confirmLeave: () => !st.over && st.called.length > 3,
      leaveBody: tr('leaveLocal', 'This practice game will end.'),
      onClose: () => {
        clearTimeout(timer);
        view.destroy();
      },
    });
    const hostEl = shell.render('<div class="pk-page tb-page" data-tb></div>').querySelector('[data-tb]');
    const firstAt = {};
    function vmNow() {
      const pub = C.publicView(st);
      pub.prizes.forEach((p) => {
        if (p.status === 'won' && !firstAt[p.key]) firstAt[p.key] = Date.now();
        p.firstAtLocal = firstAt[p.key] || 0;
      });
      const priv = C.privateView(st, 0);
      return { st: pub, tickets: priv.tickets, blocked: priv.blocked, warned: priv.warned, result: priv.result, me: 0, live: false, isHost: true, paused, daubKey: key, nextAtLocal: paused ? 0 : st.nextAt };
    }
    function loop() {
      clearTimeout(timer);
      if (st.over || shell.closed || paused) return;
      const at = C.nextEventAt(st);
      timer = setTimeout(() => {
        if (shell.closed || paused) return;
        C.advance(st, Date.now(), rng);
        view.update(vmNow());
        loop();
      }, Math.max(60, at - Date.now()));
    }
    const view = createGame(hostEl, {
      claim: async (k, t) => {
        const out = C.claim(st, 0, { key: k, t }, Date.now());
        if (out.error) {
          toast(({ slow_down: tr('slow', 'Wait a moment before claiming again'), taken: tr('taken', 'Already won'), not_yet: tr('notYet2', 'That prize opens later') })[out.error] || tr('notNow', 'Not now'));
          return null;
        }
        view.update(vmNow());
        loop();
        return out;
      },
      host: {
        pause() {
          paused = true;
          pausedAt = Date.now();
          clearTimeout(timer);
          view.update(vmNow());
        },
        resume() {
          C.shiftClock(st, Date.now() - pausedAt);
          paused = false;
          view.update(vmNow());
          loop();
        },
        pace(p) {
          st.paceMs = p * 1000;
          st.nextAt = Math.min(st.nextAt, Date.now() + st.paceMs);
          view.update(vmNow());
          loop();
        },
        end() {
          C.end(st, 'host');
          view.update(vmNow());
        },
      },
      footer(vm, el) {
        if (!st.over) return;
        const r = st.results;
        const mine = r ? r.win[0] : 0;
        if (!recorded) {
          recorded = true;
          fx(mine > 0 ? 'win' : 'lose');
          if (typeof recordGameResult === 'function') recordGameResult(GAME, mine > 0, false, { mode: 'practice', variant: s.variant });
        }
        const won = st.prizes.filter((p) => p.winners.some((w) => w.seat === 0)).map((p) => p.label);
        el.innerHTML = `<div class="cl-result"><div class="rm-result-line">${esc(won.length ? tr('youWonList', 'You won') + ': ' + won.join(', ') : tr('noPrize', 'No prize this time'))}</div>
          <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-again>${esc(tr('again', 'Play again'))}</button>
          <div class="pk-row"><button type="button" class="pk-btn pk-btn--ghost" data-home>${esc(tr('changeGame', 'Change game'))}</button></div></div>`;
        el.querySelector('[data-again]').addEventListener('click', () => K.closeThen(shell, () => startLocal(s)));
        el.querySelector('[data-home]').addEventListener('click', () => K.closeThen(shell, () => openHome({})));
      },
    });
    view.update(vmNow());
    loop();
  }

  // ---------------- settings ----------------

  function prizePickerHtml(variant, chosen, shares) {
    const table = prizeTable(variant);
    return `<div class="tb-prize-pick">${Object.keys(table)
      .map((k) => {
        const on = chosen.indexOf(k) >= 0;
        return `<label class="tb-pick-row"><input type="checkbox" data-prize="${k}" ${on ? 'checked' : ''}><span>${esc(prizeLabel(variant, k))}<small>${esc(tr('d.' + k, table[k].desc))}</small></span>
          <input type="number" class="tb-share" data-share="${k}" min="0" max="100" value="${Number(shares[k] != null ? shares[k] : Core().DEFAULT_SHARES[k] || 10)}" aria-label="${esc(tr('shareAria', 'Prize value'))}"></label>`;
      })
      .join('')}</div>`;
  }

  function maskHtml(mask) {
    let h = '<div class="tb-mask" role="group" aria-label="Custom pattern">';
    for (let i = 0; i < 25; i++) h += `<button type="button" class="tb-mask-c${(mask >>> i) & 1 || i === 12 ? ' is-on' : ''}${i === 12 ? ' is-free' : ''}" data-mask="${i}" ${i === 12 ? 'disabled' : ''}>${i === 12 ? '★' : ''}</button>`;
    return h + '</div>';
  }

  /**
   * Shared settings sheet (practice + private room host).
   * @param {object} cur current settings
   * @param {{ live?: boolean, title: string, onSave: (s) => any }} o
   */
  function openSettingsSheet(cur, o) {
    const K = Kit();
    const s = Object.assign({}, cur);
    s.prizes = arr(s.prizes).length ? arr(s.prizes).slice() : Core().DEFAULT_PRIZES[s.variant === '75' ? '75' : '90'].slice();
    s.shares = Object.assign({}, s.shares || {});
    s.mask = Number(s.mask) || 0x1f;
    const body = () => `<div class="cl-setup">
        <div class="cl-sub">${esc(tr('gameT', 'Game'))}</div>${K.segHtml('variant', s.variant, [['90', tr('tambola90', '90-ball Tambola')], ['75', tr('bingo75', '75-ball Bingo')]])}
        <div class="cl-sub">${esc(tr('paceT', 'Seconds between numbers'))}</div>${K.segHtml('pace', s.pace, Core().PACES.map((p) => [p, p + 's']))}
        ${o.live ? '' : `<div class="cl-sub">${esc(tr('ticketsT', 'Your tickets'))}</div>${K.segHtml('tickets', s.tickets || 1, [[1, '1'], [2, '2'], [3, '3'], [6, '6']])}`}
        <div class="cl-sub">${esc(tr('prizesT', 'Prizes'))}</div>
        <div data-prizes>${prizePickerHtml(s.variant, s.prizes, s.shares)}</div>
        <div data-maskwrap ${s.variant === '75' && s.prizes.indexOf('custom') >= 0 ? '' : 'hidden'}><div class="cl-sub">${esc(tr('patternT', 'Custom pattern — tap squares'))}</div><div data-mask>${maskHtml(s.mask)}</div></div>
        <details class="cl-more"><summary>${esc(tr('more', 'More'))}</summary>
          <div class="cl-sub">${esc(tr('markingT', 'Marking'))}</div>${K.segHtml('daub', s.daub || 'manual', [['manual', tr('tapMark', 'Tap to mark')], ['auto', tr('autoMark', 'Auto-mark')]])}
          <div class="cl-sub">${esc(tr('bogeyT', 'Wrong claims'))}</div>${K.segHtml('bogey', s.bogey || 'block', [['block', tr('bogeyBlockT', 'Block the ticket')], ['warn', tr('bogeyWarnT', 'Warn first')]])}
          ${
            o.live
              ? `<div class="cl-sub">${esc(tr('playFor', 'Play for'))}</div>${K.segHtml('mode', s.mode === 'table' ? 'table' : 'fun', [['fun', tr('fun', 'Just for fun')], ['table', tr('tableChips', 'Table chips')]])}
                 <div data-pricewrap ${s.mode === 'table' ? '' : 'hidden'}><div class="cl-sub">${esc(tr('priceT', 'Ticket price (table chips)'))}</div>${K.segHtml('price', s.price || 10, Core().PRICES.map((p) => [p, String(p)]))}</div>
                 <div class="cl-sub">${esc(tr('maxT', 'Max tickets each'))}</div>${K.segHtml('maxTickets', s.maxTickets || 6, [[1, '1'], [2, '2'], [3, '3'], [6, '6']])}`
              : ''
          }
          <div class="cl-sub">${esc(tr('botsT', 'Bots'))}</div>${K.segHtml('bots', s.bots || 0, (o.live ? [0, 2, 5, 10, 20] : [2, 5, 8, 12]).map((n) => [n, n ? String(n) : tr('none0', 'None')]))}
          <p class="cl-note">${esc(o.live ? tr('botLiveNote', 'Bots fill seats, are labelled, and only claim valid prizes. They never take chips — a bot’s prize goes back to the buyers.') : tr('botPracNote', 'Bots claim with a human-like delay.'))}</p>
        </details>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-go>${esc(o.live ? tr('save', 'Save') : tr('start', 'Start'))}</button>
      </div>`;
    K.openSheet({
      title: o.title,
      bodyHtml: body(),
      onMount(el, close) {
        const wirePrizes = () => {
          el.querySelectorAll('[data-prize]').forEach((b) =>
            b.addEventListener('change', () => {
              const k = b.dataset.prize;
              const i = s.prizes.indexOf(k);
              if (b.checked && i < 0) s.prizes.push(k);
              if (!b.checked && i >= 0) s.prizes.splice(i, 1);
              el.querySelector('[data-maskwrap]').hidden = !(s.variant === '75' && s.prizes.indexOf('custom') >= 0);
            })
          );
          el.querySelectorAll('[data-share]').forEach((b) => b.addEventListener('input', () => (s.shares[b.dataset.share] = Math.max(0, Math.min(100, Math.floor(Number(b.value) || 0))))));
          el.querySelectorAll('[data-mask]').forEach((b) =>
            b.addEventListener('click', () => {
              const i = Number(b.dataset.mask);
              s.mask ^= 1 << i;
              b.classList.toggle('is-on');
            })
          );
        };
        K.wireSegs(el, s, (k) => {
          if (k === 'variant') {
            s.prizes = Core().DEFAULT_PRIZES[s.variant].slice();
            el.querySelector('[data-prizes]').innerHTML = prizePickerHtml(s.variant, s.prizes, s.shares);
            el.querySelector('[data-maskwrap]').hidden = true;
            wirePrizes();
          }
          const pw = el.querySelector('[data-pricewrap]');
          if (pw) pw.hidden = s.mode !== 'table';
        });
        wirePrizes();
        el.querySelector('[data-go]').addEventListener('click', async () => {
          if (!s.prizes.length) return toast(tr('pickPrize', 'Pick at least one prize'));
          ['pace', 'tickets', 'bots', 'price', 'maxTickets'].forEach((k) => s[k] != null && (s[k] = Number(s[k])));
          const ok = await o.onSave(s);
          if (ok !== false) close();
        });
      },
    });
  }

  // ---------------- Live room ----------------

  function roomSettings(ctrl) {
    return Object.assign({ variant: '90', pace: 8, mode: 'fun', price: 10, bots: 0, maxTickets: 6, daub: 'manual', bogey: 'block' }, (ctrl.view.pub && ctrl.view.pub.settings) || {});
  }
  const isPublic = (ctrl) => !!(ctrl.view.pub && ctrl.view.pub.table && ctrl.view.pub.table.public);
  function lobbySummary(ctrl) {
    const s = roomSettings(ctrl);
    if (isPublic(ctrl)) return tr('publicSum', 'Public table') + ' · ⚡' + ((ctrl.view.pub.table || {}).price || s.price) + ' ' + tr('aTicket', 'a ticket') + ' · 18+';
    const bits = [s.variant === '75' ? tr('bingo75', '75-ball Bingo') : tr('tambola90', 'Tambola'), s.pace + 's', arr(s.prizes).length + ' ' + tr('prizesW', 'prizes')];
    bits.push(s.mode === 'table' ? tr('tableChips', 'Table chips') + ' ' + s.price : tr('fun', 'Just for fun'));
    if (Number(s.bots) > 0) bits.push(s.bots + ' ' + tr('botsW', 'bots'));
    return bits.join(' · ');
  }
  function canStart(ctrl, players) {
    if (isPublic(ctrl)) return { ok: false, label: tr('autoStart', 'Starts on its own') };
    const s = roomSettings(ctrl);
    if (players.length + (Number(s.bots) || 0) < 2) return { ok: true, label: tr('startBots', 'Start (a bot joins you)') };
    return { ok: true, label: tr('start', 'Start') };
  }
  function lobbyListHtml(ctrl, players) {
    const pub = ctrl.view.pub;
    const s = roomSettings(ctrl);
    const me = pub.players[ctrl.uid] || {};
    const shown = players.slice(0, 12);
    const more = players.length - shown.length;
    const chips = s.mode === 'wallet' || isPublic(ctrl) || s.mode === 'table';
    const price = isPublic(ctrl) ? (pub.table || {}).price || s.price : s.price;
    const n = me.sheet ? 6 : Number(me.tk) || 1;
    const choices = [1, 2, 3, 6].filter((k) => k <= (Number(s.maxTickets) || 6));
    return `<div class="tb-lobby">
      ${isPublic(ctrl) ? `<div class="tb-countdown">${esc(tr('startsIn', 'Starts in'))} <b data-lobby-count>…</b></div>` : ''}
      <div class="cl-sub">${esc(tr('yourTickets', 'Your tickets'))}${chips ? ` · ${isPublic(ctrl) ? '⚡' : ''}${n * price}${isPublic(ctrl) ? '' : ' ' + esc(tr('tableChipsShort', 'table chips'))}` : ''}</div>
      <div class="pk-seg tb-tk">${choices.map((k) => `<button type="button" class="pk-seg-btn${!me.sheet && n === k ? ' is-on' : ''}" data-tk="${k}">${k}</button>`).join('')}${s.variant !== '75' && (Number(s.maxTickets) || 6) >= 6 ? `<button type="button" class="pk-seg-btn${me.sheet ? ' is-on' : ''}" data-sheet>${esc(tr('fullSheet', 'Full sheet'))}</button>` : ''}</div>
      ${s.variant !== '75' ? `<p class="cl-note">${esc(tr('sheetNote', 'A full sheet is 6 tickets holding every number from 1 to 90 exactly once.'))}</p>` : ''}
      <div class="pk-lobby-list tb-names">${shown.map((p) => `<span class="tb-name${p.id === ctrl.uid ? ' is-me' : ''}">${esc(p.id === ctrl.uid ? tr('you', 'You') : p.name)}${p.id === pub.host ? ' ★' : ''}</span>`).join('')}${more > 0 ? `<span class="tb-name">+${more}</span>` : ''}</div>
    </div>`;
  }
  function onLobbyMount(ctrl, body) {
    if (ctrl.tb) {
      ctrl.tb.view.destroy();
      ctrl.tb = null;
    }
    body.querySelectorAll('[data-tk]').forEach((b) => b.addEventListener('click', () => ctrl.act('tickets', { n: Number(b.dataset.tk) })));
    body.querySelector('[data-sheet]')?.addEventListener('click', () => ctrl.act('tickets', { sheet: true }));
    const cd = body.querySelector('[data-lobby-count]');
    clearInterval(ctrl.tbLobbyTimer);
    if (cd) {
      const tick = () => {
        const end = ctrl.conn && ctrl.conn.localDeadline();
        cd.textContent = end ? fmtClock(end - Date.now()) : '…';
      };
      tick();
      ctrl.tbLobbyTimer = setInterval(tick, 500);
    }
  }
  function openRoomSettings(ctrl) {
    openSettingsSheet(roomSettings(ctrl), {
      live: true,
      title: tr('roomSettings', 'Game settings'),
      onSave: async (s) => {
        const out = await ctrl.act('settings', { settings: { variant: s.variant, pace: s.pace, prizes: s.prizes, shares: s.shares, mask: s.mask, daub: s.daub, bogey: s.bogey, mode: s.mode, price: s.price, maxTickets: s.maxTickets, bots: s.bots } });
        return !!out;
      },
    });
  }

  function hydratePub(raw) {
    return Core().hydratePublic(clone(raw || {}));
  }
  const LIVE_ERRORS = ['SLOW_DOWN', 'BLOCKED', 'NOT_YET', 'TAKEN', 'ALREADY_WON', 'NO_TICKET', 'NO_PRIZE', 'LEFT', 'NOT_SEATED', 'OVER', 'FIXED', 'AUTO_START', 'INSUFFICIENT_CHIPS'];
  function errorText(e) {
    const code = String((e && e.code) || '').toUpperCase();
    if (LIVE_ERRORS.indexOf(code) >= 0 && e.message) return e.message;
    return Kit().roomErrorText(e);
  }

  function liveVm(ctrl, st) {
    const pub = ctrl.view.pub;
    const sec = ctrl.view.secret;
    const secOk = sec && Number(sec.roundNo) === Number(pub.roundNo);
    const offset = ctrl.conn && ctrl.conn.serverNow ? ctrl.conn.serverNow() - Date.now() : 0;
    st.prizes.forEach((p) => (p.firstAtLocal = p.firstAt ? p.firstAt - offset : 0));
    return {
      st,
      tickets: secOk ? arr(sec.tickets).filter(Boolean) : [],
      blocked: secOk ? arr(sec.blocked).filter(Boolean) : [],
      warned: secOk && !!sec.warned,
      result: secOk ? sec.result || null : null,
      me: secOk ? Number(sec.seat) : -1,
      live: true,
      isHost: ctrl.isHost() && !isPublic(ctrl),
      paused: !!pub.paused,
      daubKey: ctrl.view.code + ':' + pub.roundNo,
      nextAtLocal: pub.paused ? 0 : st.nextAt - offset,
    };
  }

  function renderLive(ctrl, st) {
    const pub = ctrl.view.pub;
    const vm = liveVm(ctrl, st);
    const mounted = ctrl.tb && ctrl.tb.round === pub.roundNo && ctrl.shell.el.contains(ctrl.tb.view.root);
    if (!mounted) {
      if (ctrl.tb) ctrl.tb.view.destroy();
      clearInterval(ctrl.tbLobbyTimer);
      const host = ctrl.render('<div class="pk-page tb-page" data-tb></div>').querySelector('[data-tb]');
      const view = createGame(host, {
        claim: (key, t) => ctrl.act('claim', { key, t }),
        host: {
          pause: () => ctrl.act('pause'),
          resume: () => ctrl.act('resume'),
          pace: (p) => ctrl.act('pace', { pace: p }),
          end: () => ctrl.act('end_game'),
        },
        footer: (v, el) => liveFooter(ctrl, v, el),
      });
      ctrl.tb = { round: pub.roundNo, view };
      if (!ctrl.tbWrapped) {
        ctrl.tbWrapped = true;
        const close = ctrl.shell.close;
        ctrl.shell.close = function () {
          if (ctrl.tb) ctrl.tb.view.destroy();
          clearInterval(ctrl.tbLobbyTimer);
          return close.apply(this, arguments);
        };
      }
    }
    ctrl.tb.view.update(vm);
  }

  function renderPending(ctrl, st) {
    const vm = liveVm(ctrl, st);
    vm.me = -1;
    vm.tickets = [];
    vm.pendingNote = tr('pendingNote', 'Game in progress — watch the board; you’ll get tickets next game.');
    renderLive(ctrl, st);
    ctrl.tb.view.update(vm);
  }

  function liveFooter(ctrl, vm, el) {
    if (!vm.st.over) return;
    const pub = ctrl.view.pub;
    const set = pub.settlement;
    const r = set && set.results && set.results[ctrl.uid];
    const mine = vm.result;
    if (ctrl.tbFx !== pub.roundNo && vm.me >= 0) {
      ctrl.tbFx = pub.roundNo;
      const won = !!(mine && mine.win > 0);
      fx(won ? 'win' : 'lose');
      if (typeof recordGameResult === 'function') recordGameResult(GAME, won, false, { live: true, variant: vm.st.variant });
    }
    const bits = [];
    const won = vm.st.prizes.filter((p) => p.winners.some((w) => w.seat === vm.me)).map((p) => p.label);
    bits.push(`<div class="rm-result-line">${esc(won.length ? tr('youWonList', 'You won') + ': ' + won.join(', ') : vm.me >= 0 ? tr('noPrize', 'No prize this time') : tr('gameOver', 'Game over'))}</div>`);
    if (r && r.chipDelta) bits.push(`<div class="cl-result-chips ${r.chipDelta > 0 ? 'is-up' : 'is-down'}">${r.chipDelta > 0 ? '+' : ''}${r.chipDelta} ${esc(tr('chips', 'virtual chips'))}</div>`);
    else if (mine && vm.st.mode === 'table') bits.push(`<div class="cl-result-chips ${mine.net >= 0 ? 'is-up' : 'is-down'}">${mine.net >= 0 ? '+' : ''}${mine.net} ${esc(tr('tableChipsShort', 'table chips'))}</div>`);
    else if (mine && mine.points) bits.push(`<p class="cl-note">${mine.win} ${esc(tr('pts', 'pts'))}</p>`);
    if (set && set.status === 'pending') bits.push(`<div class="pkr-wait">${esc(tr('settling', 'Recording the result…'))}</div>`);
    if (isPublic(ctrl)) {
      el.innerHTML = `<div class="cl-result">${bits.join('')}<button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-again>${esc(tr('nextTable', 'Next public table'))}</button>
        <button type="button" class="pk-link" data-leave>${esc(tr('leave', 'Leave'))}</button></div>`;
      el.querySelector('[data-again]').addEventListener('click', () => {
        const price = (pub.table || {}).price || 10;
        ctrl.act('leave').finally(() => Kit().closeThen(ctrl.shell, () => joinPublic(price)));
      });
      el.querySelector('[data-leave]').addEventListener('click', async () => {
        await ctrl.act('leave');
        ctrl.shell.close();
      });
      return;
    }
    el.innerHTML = `<div class="cl-result">${bits.join('')}
      ${Kit().roomResultActions(ctrl, { nextLabel: tr('newGame', 'New game'), waitLabel: tr('waitNew', 'Waiting for the host…') })}</div>`;
    Kit().wireRoomResultActions(ctrl, el, { nextOp: 'start', onShare: () => CK().shareWin(GAME, LABEL, won.length ? tr('shareWon', 'I won') + ' ' + won.join(', ') : tr('shareDone', 'Tambola game done')) });
  }

  function openRoom(code, opts) {
    const o = opts || {};
    return Kit().openRoomScreen({
      game: GAME,
      label: LABEL,
      code,
      join: !!o.join,
      min: 1,
      max: 120,
      presence: false,
      hydrate: hydratePub,
      lobbySummary,
      openSettings: openRoomSettings,
      canStart,
      lobbyListHtml,
      onLobbyMount,
      errorText,
      renderPhase: renderLive,
      renderPending,
    });
  }

  function createRoom(chat, settings) {
    const s0 = loadSetup();
    const s = Object.assign({ variant: s0.variant, pace: s0.pace, prizes: s0.prizes, daub: s0.daub, bogey: s0.bogey, mode: 'fun', price: 10, maxTickets: 6, bots: 0, mask: s0.mask }, settings || {});
    Kit().createRoom({ game: GAME, label: LABEL, chat: chat || null, settings: s, open: (code) => openRoom(code, {}) });
  }

  function joinPublic(price) {
    const K = Kit();
    if (!K.requireSignIn()) return;
    adultOk().then(async (ok) => {
      if (!ok) return;
      try {
        const res = await K.roomCall(GAME, 'quick', { price, name: K.myName() || 'Player' });
        openRoom(res.code, {});
      } catch (e) {
        toast(errorText(e) || tr('publicFail', 'Couldn’t find a table — try again'));
      }
    });
  }

  function openPublicSheet() {
    const K = Kit();
    const cur = { price: 10 };
    K.openSheet({
      title: tr('publicTitle', 'Public table'),
      bodyHtml: `<div class="cl-setup">
        <div class="cl-sub">${esc(tr('priceT2', 'Ticket price'))}</div>${K.segHtml('price', 10, Core().PRICES.map((p) => [p, '⚡' + p]))}
        <p class="cl-note">${esc(tr('publicNote', 'Wallet chips, 18+. Buy 1–6 tickets in the lobby. Prizes are shares of the ticket pot; a bot’s prize or an unclaimed one goes back to the buyers. Starts 45 seconds after the table opens.'))}</p>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-go>${esc(tr('findTable', 'Find a table'))}</button>
      </div>`,
      onMount(el, close) {
        K.wireSegs(el, cur, () => {});
        el.querySelector('[data-go]').addEventListener('click', () => {
          close();
          setTimeout(() => joinPublic(Number(cur.price) || 10), 80);
        });
      },
    });
  }

  // ---------------- Caller mode (offline) ----------------

  function newSeed() {
    try {
      const a = new Uint32Array(1);
      crypto.getRandomValues(a);
      return a[0] >>> 0 || 1;
    } catch (e) {
      return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    }
  }
  function cryptoRng() {
    try {
      const a = new Uint32Array(1);
      return () => {
        crypto.getRandomValues(a);
        return a[0] / 4294967296;
      };
    } catch (e) {
      return Math.random;
    }
  }

  function loadCaller() {
    const c = readJson(CALLER_KEY, null);
    if (c && c.v === 1 && Array.isArray(c.called) && Array.isArray(c.bag)) return c;
    return null;
  }
  function freshCaller(variant, pace) {
    const total = variant === '75' ? 75 : 90;
    const bag = Core().shuffle(
      Array.from({ length: total }, (_, i) => i + 1),
      cryptoRng()
    );
    return { v: 1, variant, pace: pace || 8, bag, called: [], printSeed: newSeed(), sheets: 4, startedAt: Date.now() };
  }

  function openCaller(opts) {
    const K = Kit();
    const o = opts || {};
    let c = (!o.fresh && loadCaller()) || freshCaller(o.variant || loadSetup().variant, o.pace);
    let running = false;
    let timer = null;
    const save = () => writeJson(CALLER_KEY, c);
    save();
    const shell = K.openShell({
      gameId: GAME,
      title: tr('callerTitle', 'Caller mode'),
      subtitle: c.variant === '75' ? tr('bingo75', '75-ball Bingo') : tr('tambola90', 'Tambola'),
      onClose: () => {
        clearTimeout(timer);
        try {
          window.speechSynthesis && window.speechSynthesis.cancel();
        } catch (e) {}
      },
    });
    function draw() {
      if (!c.bag.length) return stop();
      const n = c.bag.shift();
      c.called.push(n);
      save();
      speak(n, c.variant);
      fx('tap');
      paint();
      if (!c.bag.length) stop();
    }
    function loop() {
      clearTimeout(timer);
      if (!running) return;
      timer = setTimeout(() => {
        draw();
        loop();
      }, c.pace * 1000);
    }
    function start() {
      running = true;
      if (!c.called.length) draw();
      loop();
      paint();
    }
    function stop() {
      running = false;
      clearTimeout(timer);
      paint();
    }
    function paint() {
      const last = c.called[c.called.length - 1];
      const label = last ? (c.variant === '75' ? Core().letter75(last) + ' ' + last : String(last)) : '—';
      const trad = last && c.variant === '90' && prefs().traditional ? Core().CALLS[last] || '' : '';
      const body = shell.render(`<div class="pk-page tb-page tb-caller">
        <div class="tb-now"><div class="tb-ball tb-ball--xl">${esc(label)}</div>${trad ? `<div class="tb-trad">${esc(trad)}</div>` : ''}
          <div class="tb-recent">${c.called.slice(-6, -1).reverse().map((n) => `<span>${n}</span>`).join('')}</div>
          <div class="tb-next">${c.called.length}/${c.variant === '75' ? 75 : 90}${running ? ' · ' + esc(tr('every', 'every')) + ' ' + c.pace + 's' : c.called.length && c.bag.length ? ' · ' + esc(tr('paused', 'Paused')) : ''}</div></div>
        <div class="pkr-bar">
          ${
            !c.bag.length
              ? `<button type="button" class="pkr-act pkr-act--primary" data-c="new">${esc(tr('newGame', 'New game'))}</button>`
              : running
                ? `<button type="button" class="pkr-act" data-c="pause">${esc(tr('pause', 'Pause'))}</button><button type="button" class="pkr-act pkr-act--primary" data-c="next">${esc(tr('nextNow', 'Next number'))}</button>`
                : `<button type="button" class="pkr-act" data-c="next">${esc(tr('oneNumber', 'One number'))}</button><button type="button" class="pkr-act pkr-act--primary" data-c="start">${esc(c.called.length ? tr('resume', 'Resume') : tr('startCalling', 'Start calling'))}</button>`
          }
        </div>
        <div class="pk-seg tb-pace">${Core().PACES.map((p) => `<button type="button" class="pk-seg-btn${c.pace === p ? ' is-on' : ''}" data-pace="${p}">${p}s</button>`).join('')}</div>
        ${boardHtml(c.variant, c.called, last)}
        <div class="tb-caller-tools">
          <button type="button" class="pk-btn pk-btn--ghost" data-c="check">${esc(tr('checkTicket', 'Check a ticket'))}</button>
          <button type="button" class="pk-btn pk-btn--ghost" data-c="print">${esc(tr('printTickets', 'Print tickets'))}</button>
        </div>
        <div class="cl-home-links">
          <button type="button" class="pk-link" data-c="share">${esc(tr('shareImage', 'Share a sheet as an image'))}</button>
          <button type="button" class="pk-link" data-c="voice">${esc(tr('prefs', 'Sound and marking'))}</button>
          ${c.called.length ? `<button type="button" class="pk-link" data-c="new">${esc(tr('restart', 'New game'))}</button>` : `<button type="button" class="pk-link" data-c="variant">${esc(c.variant === '75' ? tr('switch90', 'Switch to 90-ball') : tr('switch75', 'Switch to 75-ball Bingo'))}</button>`}
        </div>
        <p class="cl-note">${esc(tr('callerNote', 'Works offline. Printed tickets carry a code so you can check a winner against the numbers called.'))}</p>
      </div>`);
      body.querySelectorAll('[data-pace]').forEach((b) =>
        b.addEventListener('click', () => {
          c.pace = Number(b.dataset.pace);
          save();
          if (running) loop();
          paint();
        })
      );
      body.querySelectorAll('[data-c]').forEach((b) =>
        b.addEventListener('click', () => {
          const a = b.dataset.c;
          if (a === 'start') start();
          else if (a === 'pause') stop();
          else if (a === 'next') {
            draw();
            if (running) loop();
          } else if (a === 'new') {
            if (c.called.length && c.bag.length && !confirm(tr('restartConfirm', 'Start a new game? The numbers called so far are cleared.'))) return;
            stop();
            c = freshCaller(c.variant, c.pace);
            save();
            paint();
          } else if (a === 'variant') {
            c = freshCaller(c.variant === '75' ? '90' : '75', c.pace);
            save();
            shell.setSubtitle && shell.setSubtitle(c.variant === '75' ? tr('bingo75', '75-ball Bingo') : tr('tambola90', 'Tambola'));
            paint();
          } else if (a === 'check') openCheck(c);
          else if (a === 'print') openPrintSheet(c, save);
          else if (a === 'share') shareSheetImage(c);
          else if (a === 'voice') openPrefs(() => paint());
        })
      );
    }
    paint();
  }

  /** Check a ticket: by printed code (every prize, with the call it completed on) or by numbers. */
  function openCheck(c) {
    const K = Kit();
    K.openSheet({
      title: tr('checkTicket', 'Check a ticket'),
      bodyHtml: `<div class="cl-setup">
        <div class="cl-sub">${esc(tr('byCode', 'Ticket code'))}</div>
        <form data-code-form class="tb-check-row"><input class="pk-input" data-code placeholder="${esc(tr('codeEx', 'e.g. K3F9Q-4.2'))}" autocomplete="off" autocapitalize="characters" aria-label="${esc(tr('byCode', 'Ticket code'))}"><button type="submit" class="pk-btn pk-btn--primary">${esc(tr('check', 'Check'))}</button></form>
        <div class="cl-sub">${esc(tr('byNumbers', 'Or type the numbers claimed'))}</div>
        <form data-num-form class="tb-check-row"><input class="pk-input" data-nums inputmode="numeric" placeholder="${esc(tr('numsEx', 'e.g. 4 17 33 61 85'))}" aria-label="${esc(tr('byNumbers', 'Numbers'))}"><button type="submit" class="pk-btn pk-btn--primary">${esc(tr('check', 'Check'))}</button></form>
        <div data-out aria-live="polite"></div>
      </div>`,
      onMount(el) {
        const out = el.querySelector('[data-out]');
        el.querySelector('[data-code-form]').addEventListener('submit', (e) => {
          e.preventDefault();
          const code = el.querySelector('[data-code]').value;
          const g = Core().ticketFromCode(c.variant, code);
          if (!g) {
            out.innerHTML = `<p class="cl-note">${esc(tr('badCode', 'That code doesn’t match a ticket for this game.'))}</p>`;
            return;
          }
          const called = new Set(c.called);
          const res = Core().checkTicket(c.variant, g, c.called);
          out.innerHTML = `${ticketHtml(c.variant, Core().pack(g), { marks: new Set(Core().unpack(Core().pack(g)).filter((n) => called.has(n))), readOnly: true, small: true, title: String(code).toUpperCase() })}
            <div class="tb-check-list">${res.map((r) => `<div class="tb-check-item${r.at ? ' is-ok' : ''}"><span>${esc(prizeLabel(c.variant, r.key))}</span><b>${r.at ? esc(tr('yesAt', 'Yes — on number')) + ' ' + r.at : esc(tr('notYetShort', 'Not yet'))}</b></div>`).join('')}</div>`;
        });
        el.querySelector('[data-num-form]').addEventListener('submit', (e) => {
          e.preventDefault();
          const nums = String(el.querySelector('[data-nums]').value).split(/[^0-9]+/).filter(Boolean).map(Number);
          const r = Core().checkNumbers(nums, c.called);
          out.innerHTML = r.numbers.length
            ? `<p class="cl-note ${r.ok ? 'tb-ok' : 'tb-bad'}">${r.ok ? esc(tr('allCalled', 'All of these have been called.')) : esc(tr('notCalled', 'Not called yet:')) + ' ' + r.missing.join(', ')}</p>`
            : `<p class="cl-note">${esc(tr('typeNums', 'Type the numbers to check.'))}</p>`;
        });
      },
    });
  }

  function printDoc(c, sheets) {
    const tickets = [];
    for (let k = 0; k < sheets; k++) {
      const sheet = Core().printedSheet(c.variant, c.printSeed, k);
      sheet.forEach((g, t) => tickets.push({ g, code: Core().ticketCode(c.printSeed, k, t) }));
    }
    const cell = (n, i) => (c.variant === '75' && i === 12 ? '<td class="f">FREE</td>' : `<td>${n || ''}</td>`);
    const rowLen = c.variant === '75' ? 5 : 9;
    const tbl = (g) => {
      let h = '<table>';
      if (c.variant === '75') h += '<tr class="h"><th>B</th><th>I</th><th>N</th><th>G</th><th>O</th></tr>';
      for (let r = 0; r < g.length / rowLen; r++) h += '<tr>' + g.slice(r * rowLen, r * rowLen + rowLen).map((n, j) => cell(n, r * rowLen + j)).join('') + '</tr>';
      return h + '</table>';
    };
    return `<!doctype html><html><head><meta charset="utf-8"><title>Tambola tickets</title><style>
      body{font-family:system-ui,sans-serif;margin:12mm;color:#111}
      .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6mm}
      .t{border:1.5px solid #111;border-radius:3mm;padding:2mm;break-inside:avoid}
      .c{display:flex;justify-content:space-between;font-size:9pt;margin-bottom:1mm}
      table{width:100%;border-collapse:collapse;table-layout:fixed}
      td,th{border:1px solid #444;text-align:center;font-weight:700;font-size:12pt;height:${c.variant === '75' ? 9 : 8}mm}
      td:empty{background:#eee}.f{font-size:7pt}.h th{background:#111;color:#fff}
      @media print{body{margin:8mm}}
    </style></head><body><div class="grid">${tickets.map((x) => `<div class="t"><div class="c"><b>Chaupaal · ${c.variant === '75' ? 'Bingo' : 'Tambola'}</b><span>${x.code}</span></div>${tbl(x.g)}</div>`).join('')}</div></body></html>`;
  }

  function openPrintSheet(c, save) {
    const K = Kit();
    const cur = { sheets: c.sheets || 4 };
    K.openSheet({
      title: tr('printTickets', 'Print tickets'),
      bodyHtml: `<div class="cl-setup">
        <div class="cl-sub">${esc(tr('sheetsT', 'Sheets (6 tickets each)'))}</div>${K.segHtml('sheets', cur.sheets, [[1, '1'], [2, '2'], [4, '4'], [8, '8'], [17, '17']])}
        <p class="cl-note">${esc(tr('printNote', 'Opens the print dialog — choose “Save as PDF” to share a file. Every ticket is a valid ticket with a code for Check a ticket.'))}</p>
        <button type="button" class="pk-btn pk-btn--primary pk-btn--block" data-go>${esc(tr('print', 'Print'))}</button>
      </div>`,
      onMount(el, close) {
        K.wireSegs(el, cur, () => {});
        el.querySelector('[data-go]').addEventListener('click', () => {
          c.sheets = Number(cur.sheets) || 4;
          save();
          const html = printDoc(c, c.sheets);
          const frame = document.createElement('iframe');
          frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
          document.body.appendChild(frame);
          const d = frame.contentWindow.document;
          d.open();
          d.write(html);
          d.close();
          setTimeout(() => {
            try {
              frame.contentWindow.focus();
              frame.contentWindow.print();
            } catch (e) {
              toast(tr('printFail', 'Printing isn’t available here'));
            }
            setTimeout(() => frame.remove(), 60000);
          }, 250);
          close();
        });
      },
    });
  }

  /** Draw sheet 1 to a canvas and share it (or download it). */
  function shareSheetImage(c) {
    const sheet = Core().printedSheet(c.variant, c.printSeed, 0);
    const cols = c.variant === '75' ? 5 : 9;
    const rows = c.variant === '75' ? 5 : 3;
    const cs = c.variant === '75' ? 56 : 40;
    const pad = 12;
    const tw = cols * cs;
    const th = rows * cs + 22 + (c.variant === '75' ? 22 : 0);
    const canvas = document.createElement('canvas');
    canvas.width = tw + pad * 2;
    canvas.height = (th + pad) * sheet.length + pad;
    const g = canvas.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, canvas.width, canvas.height);
    sheet.forEach((cells, k) => {
      const y0 = pad + k * (th + pad);
      g.fillStyle = '#111';
      g.font = 'bold 13px system-ui, sans-serif';
      g.textAlign = 'left';
      g.fillText('Chaupaal · ' + (c.variant === '75' ? 'Bingo' : 'Tambola'), pad, y0 + 14);
      g.textAlign = 'right';
      g.fillText(Core().ticketCode(c.printSeed, 0, k), pad + tw, y0 + 14);
      let top = y0 + 22;
      if (c.variant === '75') {
        Core().LETTERS.forEach((l, j) => {
          g.fillStyle = '#111';
          g.fillRect(pad + j * cs, top, cs, 22);
          g.fillStyle = '#fff';
          g.textAlign = 'center';
          g.fillText(l, pad + j * cs + cs / 2, top + 16);
        });
        top += 22;
      }
      cells.forEach((n, i) => {
        const x = pad + (i % cols) * cs;
        const y = top + Math.floor(i / cols) * cs;
        g.fillStyle = n || (c.variant === '75' && i === 12) ? '#fff' : '#eee';
        g.fillRect(x, y, cs, cs);
        g.strokeStyle = '#444';
        g.strokeRect(x + 0.5, y + 0.5, cs, cs);
        g.fillStyle = '#111';
        g.textAlign = 'center';
        g.font = 'bold ' + Math.round(cs * 0.42) + 'px system-ui, sans-serif';
        const text = c.variant === '75' && i === 12 ? '★' : n ? String(n) : '';
        g.fillText(text, x + cs / 2, y + cs * 0.64);
      });
    });
    canvas.toBlob(async (blob) => {
      if (!blob) return toast(tr('imageFail', 'Couldn’t make the image'));
      const file = new File([blob], 'tambola-tickets.png', { type: 'image/png' });
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'Tambola tickets', text: tr('shareText', 'Your Tambola tickets — keep the code to check a win.') });
          return;
        }
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'tambola-tickets.png';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(a.href);
        a.remove();
      }, 2000);
    }, 'image/png');
  }

  // ---------------- home ----------------

  function openHome(o) {
    const K = Kit();
    const opts = o || {};
    const s = loadSetup();
    const shell = K.openShell({ gameId: GAME, title: LABEL, subtitle: tr('sub', 'Numbers game · 2 to 100+ players') });
    shell.render(`<div class="pk-page pk-home">
      <div class="pk-hero">
        <div class="pk-hero-mark">${typeof gameMarkHtml === 'function' ? gameMarkHtml(GAME, { size: 64 }) : '🎫'}</div>
        <div class="pk-hero-title">${esc(LABEL)}</div>
        <div class="pk-hero-sub">${esc(tr('tag', 'Numbers are called one by one. Mark your ticket, spot a pattern, and claim it before anyone else.'))}</div>
      </div>
      <div class="pk-modes">
        <button type="button" class="pk-mode pk-mode--primary" data-go="host"><span class="pk-mode-title">${esc(tr('hostGame', 'Host a game'))}</span><span class="pk-mode-sub">${esc(tr('hostSub', 'Invite your group · 2 to 120 players · for fun or table chips'))}</span></button>
        <button type="button" class="pk-mode" data-go="public"><span class="pk-mode-title">${esc(tr('publicTable', 'Public table'))}</span><span class="pk-mode-sub">${esc(tr('publicSub', 'Buy chip tickets · starts in under a minute · 18+'))}</span></button>
        <button type="button" class="pk-mode" data-go="caller"><span class="pk-mode-title">${esc(tr('callerTitle', 'Caller mode'))}</span><span class="pk-mode-sub">${esc(tr('callerSub', 'Run it for the room — works offline, print tickets'))}</span></button>
        <div class="cl-home-links">
          <button type="button" class="pk-link" data-go="practice">${esc(tr('vsBots', 'Practice vs bots'))}</button>
          <button type="button" class="pk-link" data-go="join">${esc(tr('join', 'Have a code? Join'))}</button>
          <button type="button" class="pk-link" data-go="rules">${esc(tr('rules', 'Rules'))}</button>
        </div>
      </div>
    </div>`);
    const b = shell.body;
    b.querySelector('[data-go="host"]').addEventListener('click', () => {
      if (!K.requireSignIn()) return;
      createRoom(opts.chat);
    });
    b.querySelector('[data-go="public"]').addEventListener('click', () => openPublicSheet());
    b.querySelector('[data-go="caller"]').addEventListener('click', () => K.closeThen(shell, () => openCaller({})));
    b.querySelector('[data-go="practice"]').addEventListener('click', () =>
      openSettingsSheet(s, {
        title: tr('practiceTitle', 'Practice game'),
        onSave: (x) => {
          writeJson(SETUP_KEY, Object.assign({}, s, x));
          K.closeThen(shell, () => startLocal(x));
        },
      })
    );
    b.querySelector('[data-go="join"]').addEventListener('click', () => K.openJoinSheet((code) => K.closeThen(shell, () => openRoom(code, { join: true }))));
    b.querySelector('[data-go="rules"]').addEventListener('click', () => window.DangalRules && window.DangalRules.openSheet(GAME, { variants: { variant: s.variant, pace: s.pace } }));
  }

  function launch(ctx) {
    const c = ctx || {};
    if (!Core() || !Kit()) return toast(tr('loading', 'Tambola is still loading — try again'));
    const chat = typeof chatFromLaunch === 'function' ? chatFromLaunch(c) : c.chat;
    const inChat = chat && chat.id && chat.id !== 'ai' && (c.source === 'chat' || c.source === 'baithak' || chat.type === 'group' || chat.isGroup);
    if (c.mode === 'caller') return openCaller({});
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
      id: 'tambola',
      name: 'Tambola',
      desc: 'Housie & 75-ball Bingo · 2 to 100+ · Caller mode',
      icon: '🎫',
      gameType: 'dual',
      genre: 'party',
      dangal: true,
      liveDuel: true,
      chat1v1: true,
      selfChat: true,
      ownHome: true,
      order: 30,
      meta: {
        core: 'tambola-core.js (strips of 6, 75-ball cards, prizes, claims / ties / bogeys, calls — shared with the server)',
        live: 'party_room → server-lib/tambola-engine.js; server draws, tickets in private secrets, claim validation, public chip tables',
      },
      launch: openGame,
    });
  }

  window.TambolaGame = { launch: openGame, openHome: lazy(openHome), openRoom: lazy(openRoom), startLocal: lazy(startLocal), openCaller: lazy(openCaller) };
  window.openTambola = function (ctx) {
    openGame(Object.assign({ source: 'manch', mode: 'home' }, ctx || {}));
  };
})();
